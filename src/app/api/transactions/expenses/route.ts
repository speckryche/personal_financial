import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')

    if (!startDate || !endDate) {
      return NextResponse.json({ error: 'startDate and endDate are required' }, { status: 400 })
    }

    // Get total count first
    const { count: totalCount } = await supabase
      .from('transactions')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('transaction_type', 'expense')
      .gte('transaction_date', startDate)
      .lte('transaction_date', endDate)

    // Fetch all transactions in batches of 1000
    const allTransactions: any[] = []
    const batchSize = 1000
    let offset = 0

    while (offset < (totalCount || 0)) {
      const { data: batch, error } = await supabase
        .from('transactions')
        .select(`
          *,
          category:categories!category_id(id, name, color, parent_id)
        `)
        .eq('user_id', user.id)
        .eq('transaction_type', 'expense')
        .gte('transaction_date', startDate)
        .lte('transaction_date', endDate)
        .order('transaction_date', { ascending: false })
        .range(offset, offset + batchSize - 1)

      if (error) {
        console.error('Error fetching transactions batch:', error)
        break
      }

      if (batch && batch.length > 0) {
        allTransactions.push(...batch)
      }

      // If we got fewer than batchSize, we're done
      if (!batch || batch.length < batchSize) {
        break
      }

      offset += batchSize
    }

    return NextResponse.json({
      transactions: allTransactions,
      totalCount: totalCount || allTransactions.length,
    })
  } catch (error) {
    console.error('Expenses API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
