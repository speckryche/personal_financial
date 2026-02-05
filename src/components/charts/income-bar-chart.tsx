'use client'

import { formatCurrency } from '@/lib/utils'

interface IncomeSource {
  name: string
  amount: number
}

interface IncomeBarChartProps {
  data: IncomeSource[]
}

const INCOME_COLORS = [
  '#10b981', // emerald
  '#14b8a6', // teal
  '#06b6d4', // cyan
  '#3b82f6', // blue
  '#8b5cf6', // violet
  '#6366f1', // indigo
]

export function IncomeBarChart({ data }: IncomeBarChartProps) {
  const total = data.reduce((sum, item) => sum + item.amount, 0)
  const maxAmount = data.length > 0 ? data[0].amount : 0

  return (
    <div className="space-y-6">
      <div className="text-center">
        <p className="text-xs text-muted-foreground uppercase tracking-wider">Total Income</p>
        <p className="text-3xl font-bold font-mono">{formatCurrency(total)}</p>
      </div>
      <div className="space-y-4">
        {data.map((item, i) => {
          const pct = maxAmount > 0 ? (item.amount / maxAmount) * 100 : 0
          return (
            <div key={item.name} className="space-y-1.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div
                    className="h-3 w-3 rounded-full shrink-0"
                    style={{ backgroundColor: INCOME_COLORS[i % INCOME_COLORS.length] }}
                  />
                  <span className="text-sm font-medium">{item.name}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium tabular-nums">{formatCurrency(item.amount)}</span>
                  <span className="text-xs text-muted-foreground w-10 text-right tabular-nums">
                    {total > 0 ? ((item.amount / total) * 100).toFixed(0) : 0}%
                  </span>
                </div>
              </div>
              <div className="h-3 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${pct}%`,
                    backgroundColor: INCOME_COLORS[i % INCOME_COLORS.length],
                  }}
                />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
