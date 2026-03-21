import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import type { QBAccountMapping, TransactionType } from '@/types/database'

// GET: Fetch all QB account mappings for the current user
export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: mappings, error } = await supabase
      .from('qb_account_mappings')
      .select('*')
      .eq('user_id', user.id)
      .order('qb_account_name')

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ mappings: mappings || [] })
  } catch (error) {
    console.error('Error fetching QB mappings:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST: Create or update QB account mappings (batch upsert)
export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { mappings } = body as {
      mappings: Array<{
        qb_account_name: string
        transaction_type: TransactionType
        category_id: string | null
      }>
    }

    if (!mappings || !Array.isArray(mappings)) {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }

    // Upsert each mapping
    const results = []
    for (const mapping of mappings) {
      const { data, error } = await supabase
        .from('qb_account_mappings')
        .upsert(
          {
            user_id: user.id,
            qb_account_name: mapping.qb_account_name,
            transaction_type: mapping.transaction_type,
            category_id: mapping.category_id,
          },
          {
            onConflict: 'user_id,qb_account_name',
          }
        )
        .select()
        .single()

      if (error) {
        console.error('Error upserting mapping:', error)
        results.push({ qb_account_name: mapping.qb_account_name, error: error.message })
      } else {
        results.push({ qb_account_name: mapping.qb_account_name, success: true, data })
      }
    }

    const successCount = results.filter(r => r.success).length
    const errorCount = results.filter(r => r.error).length

    return NextResponse.json({
      success: true,
      updated: successCount,
      errors: errorCount,
      results,
    })
  } catch (error) {
    console.error('Error saving QB mappings:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// DELETE: Delete a specific mapping
export async function DELETE(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ error: 'Missing mapping ID' }, { status: 400 })
    }

    const { error } = await supabase
      .from('qb_account_mappings')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting QB mapping:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
