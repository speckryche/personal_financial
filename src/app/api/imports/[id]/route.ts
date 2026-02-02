import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const importBatchId = params.id

    // Verify the import batch belongs to this user
    const { data: importBatch, error: fetchError } = await supabase
      .from('import_batches')
      .select('id, user_id, filename, record_count')
      .eq('id', importBatchId)
      .single()

    if (fetchError || !importBatch) {
      return NextResponse.json({ error: 'Import batch not found' }, { status: 404 })
    }

    if (importBatch.user_id !== user.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    // Delete all transactions associated with this import batch
    const { error: deleteTransactionsError, count: deletedTransactions } = await supabase
      .from('transactions')
      .delete({ count: 'exact' })
      .eq('import_batch_id', importBatchId)

    if (deleteTransactionsError) {
      console.error('Error deleting transactions:', deleteTransactionsError)
      return NextResponse.json(
        { error: 'Failed to delete transactions', details: deleteTransactionsError.message },
        { status: 500 }
      )
    }

    // Delete the import batch record
    const { error: deleteBatchError } = await supabase
      .from('import_batches')
      .delete()
      .eq('id', importBatchId)

    if (deleteBatchError) {
      console.error('Error deleting import batch:', deleteBatchError)
      return NextResponse.json(
        { error: 'Failed to delete import batch', details: deleteBatchError.message },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      filename: importBatch.filename,
      deletedTransactions: deletedTransactions || 0,
    })
  } catch (error) {
    console.error('Delete import error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const importBatchId = params.id

    // Get import batch details
    const { data: importBatch, error: fetchError } = await supabase
      .from('import_batches')
      .select('*')
      .eq('id', importBatchId)
      .eq('user_id', user.id)
      .single()

    if (fetchError || !importBatch) {
      return NextResponse.json({ error: 'Import batch not found' }, { status: 404 })
    }

    // Get transaction stats for this batch
    const { data: transactions } = await supabase
      .from('transactions')
      .select('transaction_date, amount')
      .eq('import_batch_id', importBatchId)

    let minDate = null
    let maxDate = null
    let totalAmount = 0

    if (transactions && transactions.length > 0) {
      const dates = transactions.map(t => t.transaction_date).filter(Boolean).sort()
      minDate = dates[0]
      maxDate = dates[dates.length - 1]
      totalAmount = transactions.reduce((sum, t) => sum + Number(t.amount), 0)
    }

    return NextResponse.json({
      ...importBatch,
      stats: {
        minDate,
        maxDate,
        totalAmount,
        transactionCount: transactions?.length || 0,
      },
    })
  } catch (error) {
    console.error('Get import error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
