import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { NetWorthCard } from '@/components/dashboard/net-worth-card'
import { SummaryCard } from '@/components/dashboard/summary-card'
import { HeroNetWorthCard } from '@/components/dashboard/hero-net-worth-card'
import { NetWorthChart } from '@/components/charts/net-worth-chart'
import { DashboardIncomeExpenses } from '@/components/dashboard/dashboard-income-expenses'
import { TrendingUp, TrendingDown, ArrowRight } from 'lucide-react'
import Link from 'next/link'
import { startOfMonth, endOfMonth, subMonths, format } from 'date-fns'
import { getAccountsWithBalances } from '@/lib/account-balance'
import { computeNetWorthBuckets, upsertTodaySnapshot, getSnapshots } from '@/lib/net-worth-snapshots'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // ========================================
  // NET WORTH: Auto-calculate from accounts
  // ========================================
  const accounts = user ? await getAccountsWithBalances(supabase, user.id) : []
  const buckets = computeNetWorthBuckets(accounts)

  // Auto-snapshot: upsert today's values (must complete before fetching)
  if (user) {
    await upsertTodaySnapshot(supabase, user.id, buckets)
  }

  // Fetch historical snapshots for chart
  const chartData = user ? await getSnapshots(supabase, user.id) : []

  // Mini chart data for hero card — last 6 snapshots
  const recentSnapshots = chartData.slice(-6)
  const miniChartData = recentSnapshots.map((s) => {
    const d = new Date(s.date + 'T00:00:00')
    return {
      month: d.toLocaleString('default', { month: 'short' }),
      value: s.netWorth,
    }
  })

  // Net worth change from the two most recent snapshots
  let netWorthChange = 0
  let netWorthChangePercent = 0
  if (chartData.length >= 2) {
    const latest = chartData[chartData.length - 1]
    const previous = chartData[chartData.length - 2]
    netWorthChange = latest.netWorth - previous.netWorth
    netWorthChangePercent = previous.netWorth !== 0
      ? (netWorthChange / Math.abs(previous.netWorth)) * 100
      : 0
  }

  // Calculate liquid net worth (excludes real estate)
  const liquidAssets = buckets.cash + buckets.investments + buckets.crypto
  const liquidNetWorth = liquidAssets - Math.abs(buckets.liabilities)

  // Liquid net worth change (approximate from total change, excluding real estate portion)
  // For now, use the same percentage as total since we don't track liquid separately in snapshots
  const liquidChange = netWorthChange
  const liquidChangePercent = netWorthChangePercent

  // Default to previous month
  const now = new Date()
  const prevMonth = subMonths(now, 1)
  const defaultStart = format(startOfMonth(prevMonth), 'yyyy-MM-dd')
  const defaultEnd = format(endOfMonth(prevMonth), 'yyyy-MM-dd')

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="animate-fade-in-up">
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">
          Your financial overview at a glance
        </p>
      </div>

      {/* Hero Net Worth Card */}
      <div className="animate-fade-in-up stagger-1 opacity-0">
        <HeroNetWorthCard
          netWorth={buckets.netWorth}
          change={netWorthChange}
          changePercent={netWorthChangePercent}
          miniChartData={miniChartData}
          liquidNetWorth={liquidNetWorth}
          liquidChange={liquidChange}
          liquidChangePercent={liquidChangePercent}
        />
      </div>

      {/* Summary Cards - Assets & Liabilities */}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="animate-fade-in-up stagger-1 opacity-0">
          <SummaryCard
            title="Total Assets"
            value={buckets.totalAssets}
            icon={TrendingUp}
            iconColor="bg-positive/10 text-positive"
          />
        </div>
        <div className="animate-fade-in-up stagger-2 opacity-0">
          <SummaryCard
            title="Total Liabilities"
            value={Math.abs(buckets.liabilities)}
            icon={TrendingDown}
            iconColor="bg-negative/10 text-negative"
          />
        </div>
      </div>

      {/* Asset Breakdown */}
      <div className="space-y-4 animate-fade-in-up stagger-2 opacity-0">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Asset Breakdown</h2>
          <Link
            href="/net-worth"
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-primary transition-colors"
          >
            View all <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <NetWorthCard bucket="cash" value={buckets.cash} />
          <NetWorthCard bucket="investments" value={buckets.investments} />
          <NetWorthCard bucket="real_estate" value={buckets.realEstate} />
          <NetWorthCard bucket="crypto" value={buckets.cryptoPersonal} label="Crypto (personal)" />
          <NetWorthCard bucket="crypto" value={buckets.cryptoDenet} label="Crypto (Denet)" />
          <NetWorthCard bucket="liabilities" value={buckets.liabilities} />
        </div>
      </div>

      {/* Net Worth Over Time */}
      <Card className="animate-fade-in-up stagger-3 opacity-0">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Net Worth Over Time</CardTitle>
              <CardDescription>
                Your total net worth progression over the past 6 months
              </CardDescription>
            </div>
            <Link
              href="/net-worth"
              className="flex items-center gap-1 text-sm text-muted-foreground hover:text-primary transition-colors"
            >
              View details <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </CardHeader>
        <CardContent>
          {chartData.length > 1 ? (
            <NetWorthChart data={chartData} />
          ) : (
            <div className="flex items-center justify-center h-[350px] text-muted-foreground text-sm">
              {chartData.length === 1
                ? "First snapshot recorded! The chart will appear once a second snapshot is saved (next day's visit)."
                : 'Net worth history will appear after your next visit.'}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Income & Expenses (Client Component with Date Filtering) */}
      <DashboardIncomeExpenses
        defaultDateRange={{ start: defaultStart, end: defaultEnd }}
        hasAccounts={accounts.length > 0}
      />
    </div>
  )
}
