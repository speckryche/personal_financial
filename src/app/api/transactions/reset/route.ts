import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

// POST: Reset all transaction categories and types to defaults
export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    const { resetCategories = true, resetTypes = true } = body

    // Build the update object based on what needs to be reset
    const updateFields: { category_id?: null; transaction_type?: 'expense' } = {}

    if (resetCategories) {
      updateFields.category_id = null
    }

    if (resetTypes) {
      updateFields.transaction_type = 'expense' // Default to expense
    }

    if (Object.keys(updateFields).length === 0) {
      return NextResponse.json({
        success: true,
        updated: 0,
        message: 'Nothing to reset.',
      })
    }

    // Count transactions first
    const { count } = await supabase
      .from('transactions')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)

    // Reset all transactions
    const { error } = await supabase
      .from('transactions')
      .update(updateFields)
      .eq('user_id', user.id)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      updated: count || 0,
      resetCategories,
      resetTypes,
    })
  } catch (error) {
    console.error('Error resetting transactions:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
