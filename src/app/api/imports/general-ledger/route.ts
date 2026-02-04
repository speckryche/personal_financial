import { createClient } from '@/lib/supabase/server'
import {
  parseGeneralLedgerCSV,
  parseGeneralLedgerExcel,
} from '@/lib/parsers/quickbooks/general-ledger-parser'
import { findCategoryForTransaction } from '@/lib/categorization'
import { findAccountForQBName, isLiabilityAccount, isAssetAccount } from '@/lib/account-balance'
import { NextResponse } from 'next/server'
import type { Category, Account, QBIgnoredAccount } from '@/types/database'

// Build a unique key for exact duplicate detection
function buildTransactionKey(date: string, amount: number, description: string, account: string | null): string {
  return `${date}|${Math.abs(amount).toFixed(2)}|${(description || '').toLowerCase().trim()}|${(account || '').toLowerCase().trim()}`
}

// Build a partial key for potential duplicate detection (without description)
// Used to catch cases where description was edited in QB but it's the same transaction
function buildPartialKey(date: string, amount: number, account: string | null): string {
  return `${date}|${Math.abs(amount).toFixed(2)}|${(account || '').toLowerCase().trim()}`
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
    // We need both exact keys (for auto-skip) and partial keys (for potential duplicate flagging)
    let existingKeys = new Set<string>()
    let existingPartialKeys = new Map<string, { id: string; date: string; amount: number; description: string; qb_account: string | null }>()
    if (minDate && maxDate) {
      const { data: existingTransactions } = await supabase
        .from('transactions')
        .select('id, transaction_date, amount, description, qb_account')
        .eq('user_id', user.id)
        .gte('transaction_date', minDate)
        .lte('transaction_date', maxDate)

      if (existingTransactions) {
        for (const t of existingTransactions) {
          const exactKey = buildTransactionKey(t.transaction_date, Number(t.amount), t.description || '', t.qb_account)
          existingKeys.add(exactKey)

          const partialKey = buildPartialKey(t.transaction_date, Number(t.amount), t.qb_account)
          // Store the first existing transaction for each partial key (for potential duplicate detection)
          if (!existingPartialKeys.has(partialKey)) {
            existingPartialKeys.set(partialKey, {
              id: t.id,
              date: t.transaction_date,
              amount: Number(t.amount),
              description: t.description || '',
              qb_account: t.qb_account
            })
          }
        }
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
    // Also track potential duplicates (same date/amount/account but different description)
    let duplicatesSkipped = 0
    let ignoredFromSkippedAccounts = 0

    // Track potential duplicates: map from partial key to existing transaction info
    type ExistingTxInfo = { id: string; date: string; amount: number; description: string; qb_account: string | null }
    const potentialDuplicateMatches = new Map<string, ExistingTxInfo>()

    const transactionsToInsert = result.transactions
      .filter((t) => {
        // Skip transactions from ignored accounts
        if (t.qb_account && ignoredAccounts.has(t.qb_account.toLowerCase())) {
          ignoredFromSkippedAccounts++
          return false
        }
        // Skip exact duplicates
        const exactKey = buildTransactionKey(t.transaction_date, t.amount, t.description, t.qb_account)
        if (existingKeys.has(exactKey)) {
          duplicatesSkipped++
          return false
        }
        // Check for potential duplicates (same date/amount/account but different description)
        const partialKey = buildPartialKey(t.transaction_date, t.amount, t.qb_account)
        const existingWithPartialMatch = existingPartialKeys.get(partialKey)
        if (existingWithPartialMatch) {
          // This is a potential duplicate - we'll insert it but track it for user review
          // Store the match keyed by the exact key of the NEW transaction (so we can find it after insert)
          potentialDuplicateMatches.set(exactKey, existingWithPartialMatch)
        }
        return true
      })
      .map((t) => {
        // Determine transaction type from user's mappings first, fall back to parser's guess
        const qbType = t.qb_transaction_type?.toLowerCase() || ''
        const mappedType = typeMappings.get(qbType)
        const transactionType = mappedType || t.transaction_type

        // Auto-categorize: try split_account first (the QB category), then qb_account
        // In GL format, split_account contains the category (e.g., "Groceries", "Dining")
        // This matches the logic in /api/transactions/categorize
        let categoryId = findCategoryForTransaction(
          t.split_account,
          t.qb_transaction_type,
          categories
        )
        if (!categoryId) {
          categoryId = findCategoryForTransaction(
            t.qb_account,
            t.qb_transaction_type,
            categories
          )
        }

        // Try to link to account via qb_account first, then split_account
        let linkedAccount = findAccountForQBName(t.qb_account, accounts)
        let linkedViaSplit = false

        // If qb_account didn't match a balance sheet account, check split_account
        // This handles double-entry where checking account is the split
        if (!linkedAccount && t.split_account) {
          linkedAccount = findAccountForQBName(t.split_account, accounts)
          linkedViaSplit = true
        }

        // Amount from GL: positive = debit, negative = credit
        let amount = t.amount

        // If linked via split_account, negate the amount (opposite side of entry)
        // GL amount represents debit/credit for qb_account; for split_account it's the opposite
        if (linkedViaSplit) {
          amount = -amount
        } else if (linkedAccount) {
          // For balance sheet accounts (assets/liabilities), handle sign correctly
          if (isAssetAccount(linkedAccount.account_type)) {
            // Assets: GL debit (positive) = increase, GL credit (negative) = decrease
            // Keep amount as-is - positive adds to balance, negative subtracts
            // No change needed
          } else if (isLiabilityAccount(linkedAccount.account_type)) {
            // Liabilities: GL debit (positive) = decrease balance, GL credit (negative) = increase balance
            // Negate: payment (positive in GL) should reduce balance (negative in our system)
            amount = -amount
          } else {
            // Not linked to a balance sheet account - use income/expense logic
            if (transactionType === 'expense' && amount > 0) {
              amount = -amount
            } else if (transactionType === 'income' && amount < 0) {
              amount = -amount
            }
          }
        } else {
          // No linked account - use income/expense sign convention
          if (transactionType === 'expense' && amount > 0) {
            amount = -amount
          } else if (transactionType === 'income' && amount < 0) {
            amount = -amount
          }
        }

        // For transactions linked to balance sheet accounts (assets/liabilities),
        // set transaction_type to 'transfer' - these are balance movements, not income/expense.
        // Only the category side of double-entry should be income/expense.
        let finalTransactionType = transactionType
        if (linkedAccount && (isAssetAccount(linkedAccount.account_type) || isLiabilityAccount(linkedAccount.account_type))) {
          finalTransactionType = 'transfer'
        }

        return {
          user_id: user.id,
          account_id: linkedAccount?.id || null,
          import_batch_id: importBatchId,
          transaction_date: t.transaction_date,
          description: t.description,
          amount,
          transaction_type: finalTransactionType,
          category_id: categoryId,
          memo: t.memo,
          qb_transaction_type: t.qb_transaction_type,
          qb_num: t.qb_num,
          qb_name: t.qb_name,
          qb_account: t.qb_account,
          split_account: t.split_account || null,
        }
      })

    // Insert in batches of 100, returning IDs to track potential duplicates
    const chunkSize = 100
    let insertedCount = 0
    const insertedTransactions: Array<{
      id: string
      transaction_date: string
      amount: number
      description: string
      qb_account: string | null
    }> = []

    for (let i = 0; i < transactionsToInsert.length; i += chunkSize) {
      const chunk = transactionsToInsert.slice(i, i + chunkSize)
      const { data: insertedData, error: insertError } = await supabase
        .from('transactions')
        .insert(chunk)
        .select('id, transaction_date, amount, description, qb_account')

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

      if (insertedData) {
        insertedTransactions.push(...insertedData)
      }
      insertedCount += chunk.length
    }

    // Build potential duplicates list by matching inserted transactions to their existing matches
    const potentialDuplicates: Array<{
      newTransaction: { id: string; date: string; amount: number; description: string; qb_account: string | null }
      existingTransaction: { id: string; date: string; amount: number; description: string; qb_account: string | null }
    }> = []

    if (potentialDuplicateMatches.size > 0) {
      for (const inserted of insertedTransactions) {
        const exactKey = buildTransactionKey(
          inserted.transaction_date,
          Number(inserted.amount),
          inserted.description || '',
          inserted.qb_account
        )
        const existingMatch = potentialDuplicateMatches.get(exactKey)
        if (existingMatch) {
          potentialDuplicates.push({
            newTransaction: {
              id: inserted.id,
              date: inserted.transaction_date,
              amount: Number(inserted.amount),
              description: inserted.description || '',
              qb_account: inserted.qb_account
            },
            existingTransaction: existingMatch
          })
        }
      }
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
          potentialDuplicatesCount: potentialDuplicates.length,
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
      potentialDuplicates,
    })
  } catch (error) {
    console.error('GL Import error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
