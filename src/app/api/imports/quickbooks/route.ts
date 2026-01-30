import { createClient } from '@/lib/supabase/server'
import { parseQuickBooksTransactions, parseQuickBooksExcel } from '@/lib/parsers/quickbooks/transaction-parser'
import { findCategoryForTransaction } from '@/lib/categorization'
import { NextResponse } from 'next/server'
import type { Category } from '@/types/database'

// Build a unique key for duplicate detection
function buildTransactionKey(date: string, amount: number, description: string): string {
  return `${date}|${amount.toFixed(2)}|${(description || '').toLowerCase().trim()}`
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const formData = await request.formData()
    const file = formData.get('file') as File
    const accountId = formData.get('accountId') as string | null

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    // Determine file type and parse accordingly
    const fileName = file.name.toLowerCase()
    const isExcel = fileName.endsWith('.xls') || fileName.endsWith('.xlsx')

    let result

    if (isExcel) {
      // Parse Excel file
      const buffer = await file.arrayBuffer()
      result = parseQuickBooksExcel(buffer)
    } else {
      // Parse CSV file
      const content = await file.text()
      result = await parseQuickBooksTransactions(content)
    }

    if (result.errors.length > 0 && result.transactions.length === 0) {
      return NextResponse.json(
        { error: 'Failed to parse file', details: result.errors },
        { status: 400 }
      )
    }

    // Find date range in the import for duplicate check
    const dates = result.transactions.map(t => t.transaction_date).filter(Boolean)
    const minDate = dates.length > 0 ? dates.reduce((a, b) => a < b ? a : b) : null
    const maxDate = dates.length > 0 ? dates.reduce((a, b) => a > b ? a : b) : null

    // Query existing transactions for duplicate detection
    let existingKeys = new Set<string>()
    if (minDate && maxDate) {
      const { data: existingTransactions } = await supabase
        .from('transactions')
        .select('transaction_date, amount, description')
        .eq('user_id', user.id)
        .gte('transaction_date', minDate)
        .lte('transaction_date', maxDate)

      if (existingTransactions) {
        existingKeys = new Set(
          existingTransactions.map(t =>
            buildTransactionKey(t.transaction_date, Number(t.amount), t.description || '')
          )
        )
      }
    }

    // Fetch user's categories for auto-categorization
    const { data: categoriesData } = await supabase
      .from('categories')
      .select('*')
      .eq('user_id', user.id)

    const categories: Category[] = categoriesData || []

    // Fetch transaction type mappings
    const { data: typeMappingsData } = await supabase
      .from('transaction_type_mappings')
      .select('qb_transaction_type, mapped_type')
      .eq('user_id', user.id)

    const typeMappings = new Map<string, 'income' | 'expense'>()
    for (const m of typeMappingsData || []) {
      typeMappings.set(m.qb_transaction_type.toLowerCase(), m.mapped_type as 'income' | 'expense')
    }

    // Create import batch
    const { data: importBatch, error: batchError } = await supabase
      .from('import_batches')
      .insert({
        user_id: user.id,
        filename: file.name,
        file_type: 'quickbooks_transactions',
        record_count: result.transactions.length,
        status: 'processing',
        metadata: {
          rowCount: result.rowCount,
          skippedCount: result.skippedCount,
          errors: result.errors,
        },
      })
      .select()
      .single()

    if (batchError || !importBatch) {
      return NextResponse.json({ error: 'Failed to create import batch' }, { status: 500 })
    }

    const importBatchId = (importBatch as { id: string }).id

    // Filter out duplicates and prepare transactions for insert
    let duplicatesSkipped = 0
    const transactionsToInsert = result.transactions
      .filter((t) => {
        const key = buildTransactionKey(t.transaction_date, t.amount, t.description)
        if (existingKeys.has(key)) {
          duplicatesSkipped++
          return false
        }
        return true
      })
      .map((t) => {
        // Determine transaction type from user's mappings first, fall back to parser's guess
        const qbType = t.qb_transaction_type?.toLowerCase() || ''
        const mappedType = typeMappings.get(qbType)
        const transactionType = mappedType || t.transaction_type

        // Auto-categorize based on "Account full name" (qb_account) and transaction type
        const categoryId = findCategoryForTransaction(
          t.qb_account,
          t.qb_transaction_type,
          categories
        )

        // Adjust amount sign based on transaction type
        const amount = transactionType === 'expense'
          ? -Math.abs(t.amount)
          : Math.abs(t.amount)

        return {
          user_id: user.id,
          account_id: accountId || null,
          import_batch_id: importBatchId,
          transaction_date: t.transaction_date,
          description: t.description,
          amount,
          transaction_type: transactionType,
          category_id: categoryId,
          memo: t.memo,
          qb_transaction_type: t.qb_transaction_type,
          qb_num: t.qb_num,
          qb_name: t.qb_name,
          qb_class: t.qb_class,
          qb_split: t.qb_split,
          qb_account: t.qb_account,
        }
      })

    // Insert in batches of 100
    const chunkSize = 100
    let insertedCount = 0

    for (let i = 0; i < transactionsToInsert.length; i += chunkSize) {
      const chunk = transactionsToInsert.slice(i, i + chunkSize)
      const { error: insertError } = await supabase
        .from('transactions')
        .insert(chunk)

      if (insertError) {
        console.error('Insert error:', insertError)
        // Update batch status to failed
        await supabase
          .from('import_batches')
          .update({ status: 'failed', error_message: insertError.message })
          .eq('id', importBatchId)

        return NextResponse.json(
          { error: 'Failed to insert transactions', details: insertError.message },
          { status: 500 }
        )
      }

      insertedCount += chunk.length
    }

    // Update batch status to completed
    await supabase
      .from('import_batches')
      .update({
        status: 'completed',
        record_count: insertedCount,
        metadata: {
          rowCount: result.rowCount,
          skippedCount: result.skippedCount,
          duplicatesSkipped,
          errors: result.errors,
        },
      })
      .eq('id', importBatchId)

    return NextResponse.json({
      success: true,
      batchId: importBatchId,
      imported: insertedCount,
      skipped: result.skippedCount,
      duplicatesSkipped,
      errors: result.errors,
    })
  } catch (error) {
    console.error('Import error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
