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
        const { data: transactions } = await supabase
          .from('transactions')
          .select('transaction_date, amount')
          .eq('import_batch_id', batch.id)

        let minDate = null
        let maxDate = null
        let totalAmount = 0
        const transactionCount = transactions?.length || 0

        if (transactions && transactions.length > 0) {
          const dates = transactions
            .map((t) => t.transaction_date)
            .filter(Boolean)
            .sort()
          minDate = dates[0]
          maxDate = dates[dates.length - 1]
          totalAmount = transactions.reduce((sum, t) => sum + Number(t.amount), 0)
        }

        // Get duplicates skipped from metadata
        const metadata = batch.metadata as Record<string, unknown> || {}
        const duplicatesSkipped = (metadata.duplicatesSkipped as number) || 0

        return {
          ...batch,
          stats: {
            minDate,
            maxDate,
            totalAmount,
            transactionCount,
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
