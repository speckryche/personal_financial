'use client'

import { cn, formatCurrency } from '@/lib/utils'
import {
  Banknote,
  TrendingUp,
  Home,
  Bitcoin,
  PiggyBank,
  CreditCard,
  ChevronRight,
} from 'lucide-react'
import type { NetWorthBucket } from '@/types/database'
import Link from 'next/link'

interface NetWorthCardProps {
  bucket: NetWorthBucket
  value: number
  change?: number
  accountCount?: number
  className?: string
}

const bucketConfig: Record<
  NetWorthBucket,
  { label: string; icon: typeof Banknote; bgColor: string; iconColor: string }
> = {
  cash: {
    label: 'Cash',
    icon: Banknote,
    bgColor: 'bg-cash/10',
    iconColor: 'text-cash',
  },
  investments: {
    label: 'Investments',
    icon: TrendingUp,
    bgColor: 'bg-investments/10',
    iconColor: 'text-investments',
  },
  real_estate: {
    label: 'Real Estate',
    icon: Home,
    bgColor: 'bg-real-estate/10',
    iconColor: 'text-real-estate',
  },
  crypto: {
    label: 'Crypto',
    icon: Bitcoin,
    bgColor: 'bg-crypto/10',
    iconColor: 'text-crypto',
  },
  retirement: {
    label: 'Retirement',
    icon: PiggyBank,
    bgColor: 'bg-retirement/10',
    iconColor: 'text-retirement',
  },
  liabilities: {
    label: 'Liabilities',
    icon: CreditCard,
    bgColor: 'bg-liabilities/10',
    iconColor: 'text-liabilities',
  },
}

export function NetWorthCard({ bucket, value, change, accountCount, className }: NetWorthCardProps) {
  const config = bucketConfig[bucket]
  const Icon = config.icon
  const isNegative = bucket === 'liabilities'
  const displayValue = isNegative && value < 0 ? -value : value

  return (
    <Link
      href="/net-worth"
      className={cn(
        'group flex items-center gap-4 p-4 rounded-xl border bg-card transition-all duration-200 hover:shadow-md hover:border-primary/20',
        className
      )}
    >
      {/* Icon */}
      <div className={cn(
        'flex h-12 w-12 shrink-0 items-center justify-center rounded-xl transition-transform duration-200 group-hover:scale-110',
        config.bgColor
      )}>
        <Icon className={cn('h-6 w-6', config.iconColor)} />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-muted-foreground">
            {config.label}
          </p>
          {accountCount !== undefined && accountCount > 0 && (
            <span className="text-xs text-muted-foreground/60">
              {accountCount} {accountCount === 1 ? 'account' : 'accounts'}
            </span>
          )}
        </div>
        <p className={cn(
          'text-xl font-bold font-mono tracking-tight truncate',
          isNegative && 'text-liabilities'
        )}>
          {isNegative ? '-' : ''}{formatCurrency(displayValue)}
        </p>
        {change !== undefined && (
          <p
            className={cn(
              'text-xs font-medium',
              change >= 0 ? 'text-positive' : 'text-negative'
            )}
          >
            {change >= 0 ? '+' : ''}
            {formatCurrency(change)}
          </p>
        )}
      </div>

      {/* Arrow */}
      <ChevronRight className="h-5 w-5 text-muted-foreground/50 group-hover:text-primary group-hover:translate-x-1 transition-all duration-200" />
    </Link>
  )
}
