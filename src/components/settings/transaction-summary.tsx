'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Loader2 } from 'lucide-react'

interface TransactionCounts {
  total: number
  income: number
  expense: number
  transfer: number
  uncategorized: number
}

export function TransactionSummary() {
  const supabase = createClient()
  const [counts, setCounts] = useState<TransactionCounts | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadCounts()
  }, [])

  const loadCounts = async () => {
    setLoading(true)

    // Fetch all transactions and count by type (paginate to avoid 1000 limit)
    const allTransactions: {
      transaction_type: string
      category_id: string | null
    }[] = []
    const pageSize = 1000
    let offset = 0
    let hasMore = true

    while (hasMore) {
      const { data: page } = await supabase
        .from('transactions')
        .select('transaction_type, category_id')
        .range(offset, offset + pageSize - 1)

      if (page && page.length > 0) {
        allTransactions.push(...page)
        offset += pageSize
        hasMore = page.length === pageSize
      } else {
        hasMore = false
      }
    }

    const counts: TransactionCounts = {
      total: allTransactions.length,
      income: 0,
      expense: 0,
      transfer: 0,
      uncategorized: 0,
    }

    for (const t of allTransactions) {
      // Count current types
      if (t.transaction_type === 'income') counts.income++
      else if (t.transaction_type === 'expense') counts.expense++
      else if (t.transaction_type === 'transfer') counts.transfer++

      if (!t.category_id && t.transaction_type !== 'transfer') {
        counts.uncategorized++
      }
    }

    setCounts(counts)
    setLoading(false)
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading transaction counts...
      </div>
    )
  }

  if (!counts) return null

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
        <div className="text-center p-3 rounded-lg bg-muted/50">
          <div className="text-2xl font-bold">{counts.total.toLocaleString()}</div>
          <div className="text-xs text-muted-foreground">Total</div>
        </div>
        <div className="text-center p-3 rounded-lg bg-green-500/10">
          <div className="text-2xl font-bold text-green-600">{counts.income.toLocaleString()}</div>
          <div className="text-xs text-muted-foreground">Income</div>
        </div>
        <div className="text-center p-3 rounded-lg bg-red-500/10">
          <div className="text-2xl font-bold text-red-500">{counts.expense.toLocaleString()}</div>
          <div className="text-xs text-muted-foreground">Expense</div>
        </div>
        <div className="text-center p-3 rounded-lg bg-blue-500/10">
          <div className="text-2xl font-bold text-blue-500">{counts.transfer.toLocaleString()}</div>
          <div className="text-xs text-muted-foreground">Transfer</div>
        </div>
        <div className="text-center p-3 rounded-lg bg-amber-500/10">
          <div className="text-2xl font-bold text-amber-600">{counts.uncategorized.toLocaleString()}</div>
          <div className="text-xs text-muted-foreground">Uncategorized</div>
        </div>
      </div>
    </div>
  )
}
