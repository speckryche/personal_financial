import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

/**
 * One-time fix: Invert transaction amounts for liability accounts.
 * Credit card transactions were imported with wrong signs.
 *
 * DELETE THIS FILE after running the fix.
 */
export async function POST() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Find all liability accounts for this user
  const liabilityTypes = ['credit_card', 'loan', 'mortgage']
  const { data: liabilityAccounts, error: accountsError } = await supabase
    .from('accounts')
    .select('id, name, account_type')
    .eq('user_id', user.id)
    .in('account_type', liabilityTypes)

  if (accountsError) {
    return NextResponse.json({ error: accountsError.message }, { status: 500 })
  }

  if (!liabilityAccounts || liabilityAccounts.length === 0) {
    return NextResponse.json({ message: 'No liability accounts found', fixed: 0 })
  }

  const accountIds = liabilityAccounts.map(a => a.id)
  const accountNames = liabilityAccounts.map(a => `${a.name} (${a.account_type})`)

  // Get all transactions for these accounts
  const { data: transactions, error: txnError } = await supabase
    .from('transactions')
    .select('id, amount, account_id')
    .in('account_id', accountIds)

  if (txnError) {
    return NextResponse.json({ error: txnError.message }, { status: 500 })
  }

  if (!transactions || transactions.length === 0) {
    return NextResponse.json({
      message: 'No transactions found for liability accounts',
      accounts: accountNames,
      fixed: 0
    })
  }

  // Invert each transaction amount
  let fixedCount = 0
  const errors: string[] = []

  for (const txn of transactions) {
    const newAmount = -Number(txn.amount)
    const { error: updateError } = await supabase
      .from('transactions')
      .update({ amount: newAmount })
      .eq('id', txn.id)

    if (updateError) {
      errors.push(`Failed to update txn ${txn.id}: ${updateError.message}`)
    } else {
      fixedCount++
    }
  }

  return NextResponse.json({
    message: `Fixed ${fixedCount} transactions across ${liabilityAccounts.length} liability accounts`,
    accounts: accountNames,
    fixed: fixedCount,
    total: transactions.length,
    errors: errors.length > 0 ? errors : undefined
  })
}
