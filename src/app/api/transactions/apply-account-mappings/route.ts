import { createClient } from '@/lib/supabase/server'
import { findAccountForQBName } from '@/lib/account-balance'
import { NextRequest, NextResponse } from 'next/server'
import type { Account } from '@/types/database'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check if we should re-map ALL transactions (including already mapped)
    const { searchParams } = new URL(request.url)
    const remapAll = searchParams.get('all') === 'true'

    // Fetch user's accounts with their qb_account_names
    const { data: accountsData, error: accountsError } = await supabase
      .from('accounts')
      .select('*')
      .eq('user_id', user.id)

    if (accountsError) {
      return NextResponse.json({ error: 'Failed to fetch accounts' }, { status: 500 })
    }

    const accounts: Account[] = accountsData || []

    // Check if there are any accounts with mappings
    const accountsWithMappings = accounts.filter(
      (a) => a.qb_account_names && a.qb_account_names.length > 0
    )

    if (accountsWithMappings.length === 0) {
      return NextResponse.json({
        success: true,
        updated: 0,
        message: 'No account mappings configured. Add QB account name mappings first.',
      })
    }

    // Fetch transactions - either unmapped only, or ALL with qb_account
    // Include split_account for double-entry linking (e.g., checking account as counter-entry)
    let query = supabase
      .from('transactions')
      .select('id, qb_account, split_account, amount')
      .eq('user_id', user.id)

    if (!remapAll) {
      // Only transactions without an account_id
      query = query.is('account_id', null)
    }

    const { data: transactions, error: transactionsError } = await query

    if (transactionsError) {
      return NextResponse.json({ error: 'Failed to fetch transactions' }, { status: 500 })
    }

    // Filter to only those with qb_account or split_account
    const relevantTransactions = (transactions || []).filter(
      (t) => t.qb_account || t.split_account
    )

    if (relevantTransactions.length === 0) {
      return NextResponse.json({
        success: true,
        updated: 0,
        message: remapAll
          ? 'No transactions with QB account names found'
          : 'No unmapped transactions with QB account names found',
      })
    }

    // Build updates - check both qb_account and split_account
    const updates: Array<{ id: string; account_id: string; amount?: number }> = []
    let linkedViaQbAccount = 0
    let linkedViaSplit = 0

    for (const t of relevantTransactions) {
      // Try qb_account first
      let account = findAccountForQBName(t.qb_account, accounts)
      let linkedViaSplitAccount = false

      // If qb_account didn't match, try split_account
      if (!account && t.split_account) {
        account = findAccountForQBName(t.split_account, accounts)
        linkedViaSplitAccount = true
      }

      if (account) {
        const update: { id: string; account_id: string; amount?: number } = {
          id: t.id,
          account_id: account.id,
        }

        // If linked via split_account, negate the amount (opposite side of double-entry)
        if (linkedViaSplitAccount) {
          update.amount = -Number(t.amount)
          linkedViaSplit++
        } else {
          linkedViaQbAccount++
        }

        updates.push(update)
      }
    }

    if (updates.length === 0) {
      return NextResponse.json({
        success: true,
        updated: 0,
        message: 'No matching account mappings found for transactions',
      })
    }

    // Apply updates in batches
    const chunkSize = 100
    let updatedCount = 0

    for (let i = 0; i < updates.length; i += chunkSize) {
      const chunk = updates.slice(i, i + chunkSize)

      // Use individual updates since Supabase doesn't support bulk update with different values
      for (const update of chunk) {
        const updateData: { account_id: string; amount?: number } = {
          account_id: update.account_id,
        }
        if (update.amount !== undefined) {
          updateData.amount = update.amount
        }

        const { error: updateError } = await supabase
          .from('transactions')
          .update(updateData)
          .eq('id', update.id)

        if (!updateError) {
          updatedCount++
        }
      }
    }

    return NextResponse.json({
      success: true,
      updated: updatedCount,
      total: relevantTransactions.length,
      linkedViaQbAccount,
      linkedViaSplit,
    })
  } catch (error) {
    console.error('Apply account mappings error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
