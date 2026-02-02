import { createClient } from '@/lib/supabase/server'
import {
  parseGeneralLedgerCSV,
  parseGeneralLedgerExcel,
} from '@/lib/parsers/quickbooks/general-ledger-parser'
import { findCategoryForTransaction } from '@/lib/categorization'
import { findAccountForQBName } from '@/lib/account-balance'
import { NextResponse } from 'next/server'
import type { Category, Account, QBIgnoredAccount } from '@/types/database'

// Build a unique key for duplicate detection
function buildTransactionKey(date: string, amount: number, description: string, account: string | null): string {
  return `${date}|${Math.abs(amount).toFixed(2)}|${(description || '').toLowerCase().trim()}|${(account || '').toLowerCase().trim()}`
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

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    // Determine file type and parse accordingly
    const fileName = file.name.toLowerCase()
    const isExcel = fileName.endsWith('.xls') || fileName.endsWith('.xlsx')

    let result

    if (isExcel) {
      const buffer = await file.arrayBuffer()
      result = parseGeneralLedgerExcel(buffer)
    } else {
      const content = await file.text()
      result = await parseGeneralLedgerCSV(content)
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
        .select('transaction_date, amount, description, qb_account')
        .eq('user_id', user.id)
        .gte('transaction_date', minDate)
        .lte('transaction_date', maxDate)

      if (existingTransactions) {
        existingKeys = new Set(
          existingTransactions.map(t =>
            buildTransactionKey(t.transaction_date, Number(t.amount), t.description || '', t.qb_account)
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

    // Fetch user's accounts for account linking
    const { data: accountsData } = await supabase
      .from('accounts')
      .select('*')
      .eq('user_id', user.id)

    const accounts: Account[] = accountsData || []

    // Fetch ignored accounts
    const { data: ignoredData } = await supabase
      .from('qb_ignored_accounts')
      .select('qb_account_name')
      .eq('user_id', user.id)

    const ignoredAccounts = new Set(
      ((ignoredData || []) as QBIgnoredAccount[]).map(a => a.qb_account_name.toLowerCase())
    )

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
        file_type: 'quickbooks_general_ledger',
        record_count: result.transactions.length,
        status: 'processing',
        metadata: {
          rowCount: result.rowCount,
          skippedCount: result.skippedCount,
          discoveredAccounts: result.discoveredAccounts.length,
          errors: result.errors,
        },
      })
      .select()
      .single()

    if (batchError || !importBatch) {
      return NextResponse.json({ error: 'Failed to create import batch' }, { status: 500 })
    }

    const importBatchId = (importBatch as { id: string }).id

    // Filter out duplicates and ignored accounts, prepare transactions for insert
    let duplicatesSkipped = 0
    let ignoredFromSkippedAccounts = 0
    const transactionsToInsert = result.transactions
      .filter((t) => {
        // Skip transactions from ignored accounts
        if (t.qb_account && ignoredAccounts.has(t.qb_account.toLowerCase())) {
          ignoredFromSkippedAccounts++
          return false
        }
        // Skip duplicates
        const key = buildTransactionKey(t.transaction_date, t.amount, t.description, t.qb_account)
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

        // Auto-categorize based on split_account (the QB category) first, then qb_account
        // In GL format, split_account contains the category (e.g., "Groceries", "Dining")
        const categoryId = findCategoryForTransaction(
          t.split_account || t.qb_account,
          t.qb_transaction_type,
          categories
        )

        // Auto-link to account based on qb_account name mapping
        const linkedAccount = findAccountForQBName(t.qb_account, accounts)

        // Amount from GL is already signed correctly (debit - credit)
        // For expenses, we want negative; for income, positive
        let amount = t.amount
        if (transactionType === 'expense' && amount > 0) {
          amount = -amount
        } else if (transactionType === 'income' && amount < 0) {
          amount = -amount
        }

        return {
          user_id: user.id,
          account_id: linkedAccount?.id || null,
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
          ignoredFromSkippedAccounts,
          discoveredAccounts: result.discoveredAccounts.length,
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
      ignoredFromSkippedAccounts,
      discoveredAccounts: result.discoveredAccounts.length,
      errors: result.errors,
    })
  } catch (error) {
    console.error('GL Import error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
