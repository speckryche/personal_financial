import { createClient } from '@/lib/supabase/server'
import { findAccountForQBName } from '@/lib/account-balance'
import { NextResponse } from 'next/server'
import type { Account } from '@/types/database'

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Fetch user's accounts
    const { data: accountsData } = await supabase
      .from('accounts')
      .select('*')
      .eq('user_id', user.id)

    const accounts: Account[] = accountsData || []

    if (accounts.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No accounts configured',
        updated: 0,
      })
    }

    // Fetch all transactions that don't have an account_id
    const { data: transactions, error: fetchError } = await supabase
      .from('transactions')
      .select('id, qb_account, split_account, amount, transaction_type')
      .eq('user_id', user.id)
      .is('account_id', null)

    if (fetchError) {
      return NextResponse.json(
        { error: 'Failed to fetch transactions', details: fetchError.message },
        { status: 500 }
      )
    }

    if (!transactions || transactions.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No unlinked transactions found',
        updated: 0,
      })
    }

    let updated = 0
    let linkedViaQbAccount = 0
    let linkedViaSplit = 0

    // Process transactions in batches
    const batchSize = 100
    for (let i = 0; i < transactions.length; i += batchSize) {
      const batch = transactions.slice(i, i + batchSize)

      for (const txn of batch) {
        // Try to link via qb_account first
        let linkedAccount = findAccountForQBName(txn.qb_account, accounts)
        let linkedViaSplitAccount = false

        // If qb_account didn't match, try split_account
        if (!linkedAccount && txn.split_account) {
          linkedAccount = findAccountForQBName(txn.split_account, accounts)
          linkedViaSplitAccount = true
        }

        if (linkedAccount) {
          // Calculate the correct amount
          // If linked via split_account, we need to negate the amount
          let newAmount = Number(txn.amount)

          if (linkedViaSplitAccount) {
            // When linking via split, negate the amount (opposite side of double-entry)
            newAmount = -newAmount
            linkedViaSplit++
          } else {
            linkedViaQbAccount++
          }

          const { error: updateError } = await supabase
            .from('transactions')
            .update({
              account_id: linkedAccount.id,
              amount: newAmount,
            })
            .eq('id', txn.id)

          if (!updateError) {
            updated++
          }
        }
      }
    }

    return NextResponse.json({
      success: true,
      total: transactions.length,
      updated,
      linkedViaQbAccount,
      linkedViaSplit,
      remaining: transactions.length - updated,
    })
  } catch (error) {
    console.error('Relink accounts error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
