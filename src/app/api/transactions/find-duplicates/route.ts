import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

interface DuplicateGroup {
  key: string
  date: string
  amount: number
  description: string
  transactions: Array<{
    id: string
    transaction_date: string
    description: string | null
    memo: string | null
    amount: number
    qb_account: string | null
    split_account: string | null
    import_batch_id: string | null
    created_at: string
  }>
}

// Normalize description for comparison
function normalizeDescription(desc: string | null | undefined): string {
  if (!desc) return ''
  return desc
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '') // Remove non-alphanumeric
    .trim()
}

export async function GET() {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Fetch all transactions for the user
    const { data: transactions, error } = await supabase
      .from('transactions')
      .select('id, transaction_date, description, memo, amount, qb_account, split_account, import_batch_id, created_at')
      .eq('user_id', user.id)
      .order('transaction_date', { ascending: false })

    if (error) {
      return NextResponse.json({ error: 'Failed to fetch transactions' }, { status: 500 })
    }

    // Group by (date, abs(amount), normalized description, qb_account)
    // Including qb_account prevents double-entry bookkeeping pairs from being flagged
    // (e.g., credit card transaction + expense category are different records, not duplicates)
    const groups = new Map<string, DuplicateGroup['transactions']>()

    for (const t of transactions || []) {
      const absAmount = Math.abs(Number(t.amount))
      const normalizedDesc = normalizeDescription(t.description || t.memo)
      const normalizedAccount = (t.qb_account || '').toLowerCase().trim()
      const key = `${t.transaction_date}|${absAmount.toFixed(2)}|${normalizedDesc}|${normalizedAccount}`

      if (!groups.has(key)) {
        groups.set(key, [])
      }
      groups.get(key)!.push({
        id: t.id,
        transaction_date: t.transaction_date,
        description: t.description,
        memo: t.memo,
        amount: Number(t.amount),
        qb_account: t.qb_account,
        split_account: t.split_account,
        import_batch_id: t.import_batch_id,
        created_at: t.created_at,
      })
    }

    // Filter to only groups with duplicates
    const duplicateGroups: DuplicateGroup[] = []

    for (const entry of Array.from(groups.entries())) {
      const [key, txns] = entry
      if (txns.length > 1) {
        const [date, amount, description] = key.split('|')
        duplicateGroups.push({
          key,
          date,
          amount: parseFloat(amount),
          description: description || '(no description)',
          transactions: txns.sort(
            (a: DuplicateGroup['transactions'][0], b: DuplicateGroup['transactions'][0]) =>
              new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
          ),
        })
      }
    }

    // Sort by number of duplicates (most first), then by date
    duplicateGroups.sort((a, b) => {
      if (b.transactions.length !== a.transactions.length) {
        return b.transactions.length - a.transactions.length
      }
      return new Date(b.date).getTime() - new Date(a.date).getTime()
    })

    return NextResponse.json({
      success: true,
      duplicateGroups,
      totalDuplicates: duplicateGroups.reduce((sum, g) => sum + g.transactions.length - 1, 0),
      groupCount: duplicateGroups.length,
    })
  } catch (error) {
    console.error('Find duplicates error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { transactionIds } = body as { transactionIds: string[] }

    if (!transactionIds || !Array.isArray(transactionIds) || transactionIds.length === 0) {
      return NextResponse.json({ error: 'No transaction IDs provided' }, { status: 400 })
    }

    // Delete the specified transactions (only if they belong to the user)
    const { error, count } = await supabase
      .from('transactions')
      .delete()
      .eq('user_id', user.id)
      .in('id', transactionIds)

    if (error) {
      return NextResponse.json({ error: 'Failed to delete transactions' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      deleted: count || transactionIds.length,
    })
  } catch (error) {
    console.error('Delete duplicates error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
