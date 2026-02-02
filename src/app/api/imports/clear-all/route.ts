import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function DELETE(request: Request) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Delete all transactions for this user
    const { error: txError, count: txCount } = await supabase
      .from('transactions')
      .delete({ count: 'exact' })
      .eq('user_id', user.id)

    if (txError) {
      console.error('Error deleting transactions:', txError)
      return NextResponse.json(
        { error: 'Failed to delete transactions', details: txError.message },
        { status: 500 }
      )
    }

    // Delete all import batches for this user
    const { error: batchError, count: batchCount } = await supabase
      .from('import_batches')
      .delete({ count: 'exact' })
      .eq('user_id', user.id)

    if (batchError) {
      console.error('Error deleting import batches:', batchError)
      return NextResponse.json(
        { error: 'Failed to delete import batches', details: batchError.message },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      deletedTransactions: txCount || 0,
      deletedBatches: batchCount || 0,
    })
  } catch (error) {
    console.error('Clear all error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
