import { createClient } from '@/lib/supabase/server'
import { findCategoryForTransaction } from '@/lib/categorization'
import { NextRequest, NextResponse } from 'next/server'
import type { Category } from '@/types/database'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check if we should re-categorize ALL transactions (including already categorized)
    const { searchParams } = new URL(request.url)
    const recategorizeAll = searchParams.get('all') === 'true'

    // Fetch user's categories with their qb_category_names
    const { data: categoriesData, error: categoriesError } = await supabase
      .from('categories')
      .select('*')
      .eq('user_id', user.id)

    if (categoriesError) {
      return NextResponse.json({ error: 'Failed to fetch categories' }, { status: 500 })
    }

    const categories: Category[] = categoriesData || []

    // Fetch transactions - either uncategorized only, or ALL with qb_account
    let query = supabase
      .from('transactions')
      .select('id, qb_account, qb_transaction_type')
      .eq('user_id', user.id)
      .not('qb_account', 'is', null)

    if (!recategorizeAll) {
      // Only uncategorized transactions
      query = query.is('category_id', null)
    }

    const { data: transactions, error: transactionsError } = await query

    if (transactionsError) {
      return NextResponse.json({ error: 'Failed to fetch transactions' }, { status: 500 })
    }

    if (!transactions || transactions.length === 0) {
      return NextResponse.json({
        success: true,
        categorized: 0,
        message: recategorizeAll
          ? 'No transactions with QB account names found'
          : 'No uncategorized transactions with QB account names found',
      })
    }

    // Build updates
    const updates: Array<{ id: string; category_id: string }> = []

    for (const t of transactions) {
      const categoryId = findCategoryForTransaction(
        t.qb_account,
        t.qb_transaction_type,
        categories
      )

      if (categoryId) {
        updates.push({ id: t.id, category_id: categoryId })
      }
    }

    if (updates.length === 0) {
      return NextResponse.json({
        success: true,
        categorized: 0,
        message: 'No matching category mappings found for uncategorized transactions',
      })
    }

    // Apply updates in batches
    const chunkSize = 100
    let updatedCount = 0

    for (let i = 0; i < updates.length; i += chunkSize) {
      const chunk = updates.slice(i, i + chunkSize)

      // Use individual updates since Supabase doesn't support bulk update with different values
      for (const update of chunk) {
        const { error: updateError } = await supabase
          .from('transactions')
          .update({ category_id: update.category_id })
          .eq('id', update.id)

        if (!updateError) {
          updatedCount++
        }
      }
    }

    return NextResponse.json({
      success: true,
      categorized: updatedCount,
      total: transactions.length,
    })
  } catch (error) {
    console.error('Categorize error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
