import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET() {
  const supabase = await createClient()

  // Check user context
  const { data: { user } } = await supabase.auth.getUser()

  // Get ALL expense transactions to understand what we have
  const { data: allExpenses, error } = await supabase
    .from('transactions')
    .select('id, split_account, qb_account, description, amount, category_id, transaction_date, transaction_type')
    .order('transaction_date', { ascending: false })
    .limit(50)

  // Count all transactions
  const { count: totalCount } = await supabase
    .from('transactions')
    .select('*', { count: 'exact', head: true })

  return NextResponse.json({
    user: user?.id || 'not logged in',
    error: error?.message || null,
    totalTransactions: totalCount,
    sampleCount: allExpenses?.length || 0,
    sample: allExpenses?.slice(0, 20).map(t => ({
      split_account: t.split_account,
      qb_account: t.qb_account,
      description: t.description?.substring(0, 40),
      amount: t.amount,
      category_id: t.category_id,
      date: t.transaction_date,
      type: t.transaction_type,
      startsWithDigit: t.split_account ? /^\d/.test(t.split_account) : false
    }))
  })
}
