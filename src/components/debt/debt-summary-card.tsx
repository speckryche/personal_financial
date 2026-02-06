'use client'

import { GlassCard } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { formatCurrency } from '@/lib/utils'
import { TrendingUp, TrendingDown, CreditCard } from 'lucide-react'

interface MiniBarData {
  month: string
  value: number
}

interface DebtSummaryCardProps {
  totalDebt: number
  change: number
  changePercent: number
  miniChartData: MiniBarData[]
  accountCount: number
}

export function DebtSummaryCard({
  totalDebt,
  change,
  changePercent,
  miniChartData,
  accountCount,
}: DebtSummaryCardProps) {
  // For debt, negative change (paying down) is positive
  const isPositive = change <= 0
  const maxValue = Math.max(...miniChartData.map((d) => d.value), 1)

  return (
    <div className="relative overflow-hidden rounded-2xl">
      {/* Floating orbs background - red/orange theme for debt */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="orb w-64 h-64 -top-20 -left-20 animate-float-slow bg-red-500/10" />
        <div className="orb w-48 h-48 top-1/2 -right-10 animate-float bg-orange-500/10" style={{ animationDelay: '2s' }} />
        <div className="orb w-32 h-32 bottom-10 left-1/3 animate-pulse-glow bg-red-500/5" style={{ animationDelay: '1s' }} />
      </div>

      <GlassCard className="relative p-8 lg:p-10">
        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6">
          {/* Left side - Total debt display */}
          <div className="space-y-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <CreditCard className="h-5 w-5 text-red-500" />
                <p className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                  Total Debt
                </p>
              </div>
              <h2 className="text-4xl lg:text-5xl font-bold font-mono tracking-tight text-red-500">
                {formatCurrency(totalDebt)}
              </h2>
            </div>

            {/* Trend badge */}
            <div className="flex items-center gap-3">
              <Badge variant={isPositive ? 'positive' : 'negative'} className="px-3 py-1">
                {isPositive ? (
                  <TrendingDown className="h-3.5 w-3.5 mr-1.5" />
                ) : (
                  <TrendingUp className="h-3.5 w-3.5 mr-1.5" />
                )}
                <span>{change <= 0 ? '' : '+'}{changePercent.toFixed(1)}%</span>
              </Badge>
              <span className="text-sm text-muted-foreground">
                {change <= 0 ? '' : '+'}{formatCurrency(change)} this month
              </span>
            </div>

            <p className="text-sm text-muted-foreground">
              {accountCount} debt account{accountCount !== 1 ? 's' : ''}
            </p>
          </div>

          {/* Right side - Mini bar chart */}
          <div className="flex items-end gap-1.5 h-20 lg:h-24">
            {miniChartData.map((item, index) => {
              const heightPercent = (item.value / maxValue) * 100
              const isLast = index === miniChartData.length - 1
              return (
                <div
                  key={item.month}
                  className="flex flex-col items-center gap-1"
                >
                  <div
                    className={`w-6 lg:w-8 rounded-t-md transition-all duration-500 ${
                      isLast
                        ? 'bg-gradient-to-t from-red-600 to-red-400'
                        : 'bg-red-500/20'
                    }`}
                    style={{ height: `${Math.max(heightPercent, 10)}%` }}
                  />
                  <span className="text-[10px] text-muted-foreground">
                    {item.month}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      </GlassCard>
    </div>
  )
}
