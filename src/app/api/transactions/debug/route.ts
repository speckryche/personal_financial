import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

/**
 * GET /api/transactions/debug?amount=500000
 * GET /api/transactions/debug?type=income
 * GET /api/transactions/debug?qb_account=4000
 *
 * Debug endpoint to search and inspect transactions
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const amount = searchParams.get('amount')
    const minAmount = searchParams.get('min_amount')
    const type = searchParams.get('type')
    const qbAccount = searchParams.get('qb_account')
    const categoryId = searchParams.get('category_id')
    const limit = parseInt(searchParams.get('limit') || '100')

    let query = supabase
      .from('transactions')
      .select('id, date, description, amount, transaction_type, category_id, qb_account, split_account')
      .eq('user_id', user.id)
      .order('amount', { ascending: false })
      .limit(limit)

    // Filter by exact amount (with tolerance for decimals)
    if (amount) {
      const amountNum = parseFloat(amount)
      query = query.gte('amount', amountNum - 1).lte('amount', amountNum + 1)
    }

    // Filter by minimum amount
    if (minAmount) {
      query = query.gte('amount', parseFloat(minAmount))
    }

    // Filter by transaction type
    if (type) {
      query = query.eq('transaction_type', type)
    }

    // Filter by QB account (partial match)
    if (qbAccount) {
      query = query.ilike('qb_account', `%${qbAccount}%`)
    }

    // Filter by category
    if (categoryId) {
      query = query.eq('category_id', categoryId)
    }

    const { data: transactions, error } = await query

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Also get summary stats
    // Use range to overcome Supabase's default 1000 row limit
    const { data: stats } = await supabase
      .from('transactions')
      .select('transaction_type, amount')
      .eq('user_id', user.id)
      .range(0, 49999)

    const summary = {
      total: stats?.length || 0,
      byType: {
        income: stats?.filter(t => t.transaction_type === 'income').length || 0,
        expense: stats?.filter(t => t.transaction_type === 'expense').length || 0,
        transfer: stats?.filter(t => t.transaction_type === 'transfer').length || 0,
      },
      incomeTotal: stats?.filter(t => t.transaction_type === 'income').reduce((sum, t) => sum + (t.amount || 0), 0) || 0,
      expenseTotal: stats?.filter(t => t.transaction_type === 'expense').reduce((sum, t) => sum + Math.abs(t.amount || 0), 0) || 0,
    }

    // Get categories for reference
    const { data: categories } = await supabase
      .from('categories')
      .select('id, name, type')
      .eq('user_id', user.id)

    const categoryMap = Object.fromEntries(
      (categories || []).map(c => [c.id, { name: c.name, type: c.type }])
    )

    // Enrich transactions with category names
    const enrichedTransactions = transactions?.map(t => ({
      ...t,
      category_name: t.category_id ? categoryMap[t.category_id]?.name : null,
      category_type: t.category_id ? categoryMap[t.category_id]?.type : null,
    }))

    return NextResponse.json({
      summary,
      count: transactions?.length || 0,
      transactions: enrichedTransactions,
    })
  } catch (error) {
    console.error('Debug error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
