import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

// POST: Apply QB account mappings to all transactions
export async function POST() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Fetch all QB account mappings
    const { data: mappings, error: mappingsError } = await supabase
      .from('qb_account_mappings')
      .select('*')
      .eq('user_id', user.id)

    if (mappingsError) {
      return NextResponse.json({ error: mappingsError.message }, { status: 500 })
    }

    if (!mappings || mappings.length === 0) {
      return NextResponse.json({
        success: true,
        updated: 0,
        message: 'No mappings found. Please create mappings first.',
      })
    }

    // Build a lookup map for faster access
    const mappingLookup = new Map<string, { transaction_type: string; category_id: string | null }>()
    for (const m of mappings) {
      mappingLookup.set(m.qb_account_name.toLowerCase().trim(), {
        transaction_type: m.transaction_type,
        category_id: m.category_id,
      })
    }

    // Fetch all transactions with qb_account (paginated to handle large datasets)
    let updatedCount = 0
    let unmappedAccounts = new Set<string>()
    let offset = 0
    const batchSize = 1000

    while (true) {
      const { data: transactions, error: txError } = await supabase
        .from('transactions')
        .select('id, qb_account')
        .eq('user_id', user.id)
        .not('qb_account', 'is', null)
        .range(offset, offset + batchSize - 1)

      if (txError) {
        return NextResponse.json({ error: txError.message }, { status: 500 })
      }

      if (!transactions || transactions.length === 0) {
        break
      }

      // Process each transaction
      for (const tx of transactions) {
        const qbAccount = tx.qb_account?.toLowerCase().trim()
        if (!qbAccount) continue

        const mapping = mappingLookup.get(qbAccount)
        if (mapping) {
          // Update the transaction with the mapped type and category
          const { error: updateError } = await supabase
            .from('transactions')
            .update({
              transaction_type: mapping.transaction_type,
              category_id: mapping.category_id,
            })
            .eq('id', tx.id)

          if (!updateError) {
            updatedCount++
          }
        } else {
          unmappedAccounts.add(tx.qb_account || '')
        }
      }

      offset += batchSize

      // If we got fewer than batchSize, we've reached the end
      if (transactions.length < batchSize) {
        break
      }
    }

    return NextResponse.json({
      success: true,
      updated: updatedCount,
      unmappedCount: unmappedAccounts.size,
      unmappedAccounts: Array.from(unmappedAccounts).slice(0, 50), // Limit to first 50
    })
  } catch (error) {
    console.error('Error applying mappings:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
