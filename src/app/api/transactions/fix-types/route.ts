import { createClient } from '@/lib/supabase/server'
import { getTransactionType } from '@/lib/categorization'
import { NextResponse } from 'next/server'
import type { Category } from '@/types/database'

/**
 * POST /api/transactions/fix-types
 *
 * Backfill transaction types based on category mappings and QB account numbers.
 * This fixes transactions that were incorrectly classified as income/expense
 * based on amount sign rather than the mapped category type.
 *
 * Priority:
 * 1. Category mapping - if the QB account is mapped to a category, use that category's type
 * 2. QB account number prefix (4xxx=income, etc.)
 *
 * Only fixes income/expense transactions (not transfers).
 */
export async function POST() {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Fetch user's categories for mapping lookup
    const { data: categoriesData } = await supabase
      .from('categories')
      .select('*')
      .eq('user_id', user.id)

    const categories: Category[] = categoriesData || []

    // Fetch ALL transactions with QB account info (paginate to bypass 1000 limit)
    // Include transfers too in case income accounts were misclassified as transfers
    const allTransactions: { id: string; transaction_type: string; qb_account: string | null; split_account: string | null }[] = []
    const pageSize = 1000
    let offset = 0
    let hasMore = true

    while (hasMore) {
      const { data: page, error: fetchError } = await supabase
        .from('transactions')
        .select('id, transaction_type, qb_account, split_account')
        .eq('user_id', user.id)
        .range(offset, offset + pageSize - 1)

      if (fetchError) {
        return NextResponse.json({ error: fetchError.message }, { status: 500 })
      }

      if (page && page.length > 0) {
        allTransactions.push(...page)
        offset += pageSize
        hasMore = page.length === pageSize
      } else {
        hasMore = false
      }
    }

    const transactions = allTransactions

    if (transactions.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No transactions to fix',
        fixed: 0
      })
    }

    // STEP 1: Reset incorrectly marked income transactions
    // Any transaction marked as 'income' where qb_account does NOT start with '4'
    // was incorrectly classified and needs to be reset to 'expense'
    const toReset: string[] = []
    for (const t of transactions) {
      if (t.transaction_type === 'income') {
        const startsWithFour = t.qb_account && /^4/.test(t.qb_account)
        if (!startsWithFour) {
          toReset.push(t.id)
        }
      }
    }

    // Reset incorrectly marked income transactions to expense
    let resetCount = 0
    if (toReset.length > 0) {
      const { error } = await supabase
        .from('transactions')
        .update({ transaction_type: 'expense' })
        .in('id', toReset)

      if (!error) resetCount = toReset.length
    }

    // STEP 2: Find transactions that need type correction
    const toFix: { id: string; newType: 'income' | 'expense' | 'transfer' }[] = []

    for (const t of transactions) {
      // Skip ones we just reset - they'll be handled in the next run if needed
      if (toReset.includes(t.id)) continue

      // Only check qb_account for transaction type - this is the primary account
      // that determines the type. split_account is just the offsetting account.
      const correctType = getTransactionType(t.qb_account, null, categories)

      // Only fix if type differs from current and isn't the default 'expense'
      // (we don't want to change things to 'expense' as that's the fallback)
      if (correctType && correctType !== 'expense' && correctType !== t.transaction_type) {
        toFix.push({ id: t.id, newType: correctType })
      }
    }

    if (toFix.length === 0 && resetCount === 0) {
      return NextResponse.json({
        success: true,
        message: 'All transactions have correct types',
        checked: transactions.length,
        fixed: 0
      })
    }

    if (toFix.length === 0 && resetCount > 0) {
      return NextResponse.json({
        success: true,
        message: `Reset ${resetCount} incorrectly marked income transactions to expense`,
        checked: transactions.length,
        fixed: resetCount,
        details: {
          resetToExpense: resetCount
        }
      })
    }

    // Group by new type for batch updates
    const incomeIds = toFix.filter(t => t.newType === 'income').map(t => t.id)
    const expenseIds = toFix.filter(t => t.newType === 'expense').map(t => t.id)
    const transferIds = toFix.filter(t => t.newType === 'transfer').map(t => t.id)

    let fixedCount = 0

    // Update income transactions
    if (incomeIds.length > 0) {
      const { error } = await supabase
        .from('transactions')
        .update({ transaction_type: 'income' })
        .in('id', incomeIds)

      if (!error) fixedCount += incomeIds.length
    }

    // Update expense transactions
    if (expenseIds.length > 0) {
      const { error } = await supabase
        .from('transactions')
        .update({ transaction_type: 'expense' })
        .in('id', expenseIds)

      if (!error) fixedCount += expenseIds.length
    }

    // Update transfer transactions
    if (transferIds.length > 0) {
      const { error } = await supabase
        .from('transactions')
        .update({ transaction_type: 'transfer' })
        .in('id', transferIds)

      if (!error) fixedCount += transferIds.length
    }

    return NextResponse.json({
      success: true,
      message: `Fixed ${fixedCount + resetCount} transaction types${resetCount > 0 ? ` (reset ${resetCount} incorrect income→expense)` : ''}`,
      checked: transactions.length,
      fixed: fixedCount + resetCount,
      details: {
        resetToExpense: resetCount,
        toIncome: incomeIds.length,
        toExpense: expenseIds.length,
        toTransfer: transferIds.length
      }
    })
  } catch (error) {
    console.error('Fix types error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
