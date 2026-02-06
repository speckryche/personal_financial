'use client'

import { GlassCard } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { formatCurrency } from '@/lib/utils'
import { TrendingUp, TrendingDown, Home, Droplets } from 'lucide-react'

interface MiniBarData {
  month: string
  value: number
}

interface HeroNetWorthCardProps {
  netWorth: number
  change: number
  changePercent: number
  miniChartData: MiniBarData[]
  liquidNetWorth?: number
  liquidChange?: number
  liquidChangePercent?: number
}

export function HeroNetWorthCard({
  netWorth,
  change,
  changePercent,
  miniChartData,
  liquidNetWorth,
  liquidChange = 0,
  liquidChangePercent = 0,
}: HeroNetWorthCardProps) {
  const isPositive = change >= 0
  const isLiquidPositive = liquidChange >= 0
  const maxValue = Math.max(...miniChartData.map((d) => d.value))
  const showTabs = liquidNetWorth !== undefined

  const renderMiniChart = () => (
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
                  ? 'gradient-primary'
                  : 'bg-primary/20'
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
  )

  return (
    <div className="relative overflow-hidden rounded-2xl">
      {/* Floating orbs background */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="orb orb-emerald w-64 h-64 -top-20 -left-20 animate-float-slow" />
        <div className="orb orb-teal w-48 h-48 top-1/2 -right-10 animate-float" style={{ animationDelay: '2s' }} />
        <div className="orb orb-blue w-32 h-32 bottom-10 left-1/3 animate-pulse-glow" style={{ animationDelay: '1s' }} />
      </div>

      <GlassCard className="relative p-8 lg:p-10">
        {showTabs ? (
          <Tabs defaultValue="total" className="w-full">
            <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-6 mb-4">
              <TabsList className="grid w-full sm:w-auto grid-cols-2 h-10">
                <TabsTrigger value="total" className="text-sm px-5">
                  <Home className="h-4 w-4 mr-2" />
                  Total
                </TabsTrigger>
                <TabsTrigger value="liquid" className="text-sm px-5">
                  <Droplets className="h-4 w-4 mr-2" />
                  Liquid
                </TabsTrigger>
              </TabsList>
              {renderMiniChart()}
            </div>

            <TabsContent value="total" className="mt-0 space-y-4">
              <div className="space-y-1">
                <p className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                  Total Net Worth
                </p>
                <h2 className="text-4xl lg:text-5xl font-bold font-mono tracking-tight">
                  {formatCurrency(netWorth)}
                </h2>
              </div>
              <div className="flex items-center gap-3">
                <Badge variant={isPositive ? 'positive' : 'negative'} className="px-3 py-1">
                  {isPositive ? (
                    <TrendingUp className="h-3.5 w-3.5 mr-1.5" />
                  ) : (
                    <TrendingDown className="h-3.5 w-3.5 mr-1.5" />
                  )}
                  <span>{isPositive ? '+' : ''}{changePercent.toFixed(1)}%</span>
                </Badge>
                <span className="text-sm text-muted-foreground">
                  {isPositive ? '+' : ''}{formatCurrency(change)} this month
                </span>
              </div>
            </TabsContent>

            <TabsContent value="liquid" className="mt-0 space-y-4">
              <div className="space-y-1">
                <p className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                  Liquid Net Worth
                </p>
                <h2 className="text-4xl lg:text-5xl font-bold font-mono tracking-tight">
                  {formatCurrency(liquidNetWorth)}
                </h2>
              </div>
              <div className="flex items-center gap-3">
                <Badge variant={isLiquidPositive ? 'positive' : 'negative'} className="px-3 py-1">
                  {isLiquidPositive ? (
                    <TrendingUp className="h-3.5 w-3.5 mr-1.5" />
                  ) : (
                    <TrendingDown className="h-3.5 w-3.5 mr-1.5" />
                  )}
                  <span>{isLiquidPositive ? '+' : ''}{liquidChangePercent.toFixed(1)}%</span>
                </Badge>
                <span className="text-sm text-muted-foreground">
                  excludes real estate
                </span>
              </div>
            </TabsContent>
          </Tabs>
        ) : (
          <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6">
            {/* Left side - Net worth display */}
            <div className="space-y-4">
              <div className="space-y-1">
                <p className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                  Total Net Worth
                </p>
                <h2 className="text-4xl lg:text-5xl font-bold font-mono tracking-tight">
                  {formatCurrency(netWorth)}
                </h2>
              </div>

              {/* Trend badge */}
              <div className="flex items-center gap-3">
                <Badge variant={isPositive ? 'positive' : 'negative'} className="px-3 py-1">
                  {isPositive ? (
                    <TrendingUp className="h-3.5 w-3.5 mr-1.5" />
                  ) : (
                    <TrendingDown className="h-3.5 w-3.5 mr-1.5" />
                  )}
                  <span>{isPositive ? '+' : ''}{changePercent.toFixed(1)}%</span>
                </Badge>
                <span className="text-sm text-muted-foreground">
                  {isPositive ? '+' : ''}{formatCurrency(change)} this month
                </span>
              </div>
            </div>

            {/* Right side - Mini bar chart */}
            {renderMiniChart()}
          </div>
        )}
      </GlassCard>
    </div>
  )
}
