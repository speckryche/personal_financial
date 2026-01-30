'use client'

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { formatCurrency, formatShortDate } from '@/lib/utils'

interface NetWorthDataPoint {
  date: string
  netWorth: number
  cash: number
  investments: number
  realEstate: number
  crypto: number
  retirement: number
  liabilities: number
}

interface NetWorthChartProps {
  data: NetWorthDataPoint[]
  stacked?: boolean
}

const COLORS = {
  cash: 'hsl(var(--cash))',
  investments: 'hsl(var(--investments))',
  realEstate: 'hsl(var(--real-estate))',
  crypto: 'hsl(var(--crypto))',
  retirement: 'hsl(var(--retirement))',
  liabilities: 'hsl(var(--liabilities))',
  netWorth: 'hsl(var(--primary))',
}

export function NetWorthChart({ data, stacked = false }: NetWorthChartProps) {
  if (stacked) {
    return (
      <ResponsiveContainer width="100%" height={400}>
        <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="cashGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={COLORS.cash} stopOpacity={0.8} />
              <stop offset="95%" stopColor={COLORS.cash} stopOpacity={0.2} />
            </linearGradient>
            <linearGradient id="investmentsGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={COLORS.investments} stopOpacity={0.8} />
              <stop offset="95%" stopColor={COLORS.investments} stopOpacity={0.2} />
            </linearGradient>
            <linearGradient id="realEstateGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={COLORS.realEstate} stopOpacity={0.8} />
              <stop offset="95%" stopColor={COLORS.realEstate} stopOpacity={0.2} />
            </linearGradient>
            <linearGradient id="cryptoGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={COLORS.crypto} stopOpacity={0.8} />
              <stop offset="95%" stopColor={COLORS.crypto} stopOpacity={0.2} />
            </linearGradient>
            <linearGradient id="retirementGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={COLORS.retirement} stopOpacity={0.8} />
              <stop offset="95%" stopColor={COLORS.retirement} stopOpacity={0.2} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
          <XAxis
            dataKey="date"
            tickFormatter={(value) => formatShortDate(value)}
            tick={{ fontSize: 12 }}
            className="text-muted-foreground"
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`}
            tick={{ fontSize: 12 }}
            width={60}
            className="text-muted-foreground"
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            formatter={(value: number, name: string) => [
              formatCurrency(value),
              name.replace(/([A-Z])/g, ' $1').trim(),
            ]}
            labelFormatter={(label) => formatShortDate(label)}
            contentStyle={{
              backgroundColor: 'hsl(var(--popover))',
              border: '1px solid hsl(var(--border))',
              borderRadius: '12px',
              boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
            }}
          />
          <Area
            type="monotone"
            dataKey="cash"
            stackId="1"
            stroke={COLORS.cash}
            fill="url(#cashGradient)"
            name="Cash"
          />
          <Area
            type="monotone"
            dataKey="investments"
            stackId="1"
            stroke={COLORS.investments}
            fill="url(#investmentsGradient)"
            name="Investments"
          />
          <Area
            type="monotone"
            dataKey="realEstate"
            stackId="1"
            stroke={COLORS.realEstate}
            fill="url(#realEstateGradient)"
            name="Real Estate"
          />
          <Area
            type="monotone"
            dataKey="crypto"
            stackId="1"
            stroke={COLORS.crypto}
            fill="url(#cryptoGradient)"
            name="Crypto"
          />
          <Area
            type="monotone"
            dataKey="retirement"
            stackId="1"
            stroke={COLORS.retirement}
            fill="url(#retirementGradient)"
            name="Retirement"
          />
        </AreaChart>
      </ResponsiveContainer>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={400}>
      <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="netWorthGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={COLORS.netWorth} stopOpacity={0.4} />
            <stop offset="95%" stopColor={COLORS.netWorth} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
        <XAxis
          dataKey="date"
          tickFormatter={(value) => formatShortDate(value)}
          tick={{ fontSize: 12 }}
          className="text-muted-foreground"
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`}
          tick={{ fontSize: 12 }}
          width={60}
          className="text-muted-foreground"
          axisLine={false}
          tickLine={false}
        />
        <Tooltip
          formatter={(value: number) => [formatCurrency(value), 'Net Worth']}
          labelFormatter={(label) => formatShortDate(label)}
          contentStyle={{
            backgroundColor: 'hsl(var(--popover))',
            border: '1px solid hsl(var(--border))',
            borderRadius: '12px',
            boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
          }}
        />
        <Area
          type="monotone"
          dataKey="netWorth"
          stroke={COLORS.netWorth}
          fill="url(#netWorthGradient)"
          strokeWidth={3}
          dot={false}
          activeDot={{
            r: 6,
            fill: COLORS.netWorth,
            stroke: 'hsl(var(--background))',
            strokeWidth: 2,
          }}
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}
