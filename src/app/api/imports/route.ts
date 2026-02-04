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

    // Get URL params for filtering
    const { searchParams } = new URL(request.url)
    const fileType = searchParams.get('file_type')

    // Build query
    let query = supabase
      .from('import_batches')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })

    if (fileType) {
      query = query.eq('file_type', fileType)
    }

    const { data: importBatches, error } = await query

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Get transaction stats for each batch
    const batchesWithStats = await Promise.all(
      (importBatches || []).map(async (batch) => {
        // Get exact count using Supabase's count feature (no row limit)
        const { count: transactionCount } = await supabase
          .from('transactions')
          .select('*', { count: 'exact', head: true })
          .eq('import_batch_id', batch.id)

        // Get date range and total using aggregation via a smaller query
        // Only fetch what we need for stats
        const { data: transactions } = await supabase
          .from('transactions')
          .select('transaction_date, amount')
          .eq('import_batch_id', batch.id)
          .range(0, 49999)

        let minDate = null
        let maxDate = null
        let totalIncome = 0
        let totalExpenses = 0

        if (transactions && transactions.length > 0) {
          const dates = transactions
            .map((t) => t.transaction_date)
            .filter(Boolean)
            .sort()
          minDate = dates[0]
          maxDate = dates[dates.length - 1]
          for (const t of transactions) {
            const amount = Number(t.amount)
            if (amount > 0) {
              totalIncome += amount
            } else {
              totalExpenses += Math.abs(amount)
            }
          }
        }

        // Get duplicates skipped from metadata
        const metadata = batch.metadata as Record<string, unknown> || {}
        const duplicatesSkipped = (metadata.duplicatesSkipped as number) || 0

        return {
          ...batch,
          stats: {
            minDate,
            maxDate,
            totalIncome,
            totalExpenses,
            transactionCount: transactionCount || 0,
            duplicatesSkipped,
          },
        }
      })
    )

    return NextResponse.json({ imports: batchesWithStats })
  } catch (error) {
    console.error('List imports error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
