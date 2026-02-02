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
    let query = supabase
      .from('transactions')
      .select('id, qb_account')
      .eq('user_id', user.id)
      .not('qb_account', 'is', null)

    if (!remapAll) {
      // Only transactions without an account_id
      query = query.is('account_id', null)
    }

    const { data: transactions, error: transactionsError } = await query

    if (transactionsError) {
      return NextResponse.json({ error: 'Failed to fetch transactions' }, { status: 500 })
    }

    if (!transactions || transactions.length === 0) {
      return NextResponse.json({
        success: true,
        updated: 0,
        message: remapAll
          ? 'No transactions with QB account names found'
          : 'No unmapped transactions with QB account names found',
      })
    }

    // Build updates
    const updates: Array<{ id: string; account_id: string }> = []

    for (const t of transactions) {
      const account = findAccountForQBName(t.qb_account, accounts)

      if (account) {
        updates.push({ id: t.id, account_id: account.id })
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
        const { error: updateError } = await supabase
          .from('transactions')
          .update({ account_id: update.account_id })
          .eq('id', update.id)

        if (!updateError) {
          updatedCount++
        }
      }
    }

    return NextResponse.json({
      success: true,
      updated: updatedCount,
      total: transactions.length,
    })
  } catch (error) {
    console.error('Apply account mappings error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
