import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { NetWorthCard } from '@/components/dashboard/net-worth-card'
import { SummaryCard } from '@/components/dashboard/summary-card'
import { HeroNetWorthCard } from '@/components/dashboard/hero-net-worth-card'
import { NetWorthChart } from '@/components/charts/net-worth-chart'
import { ExpenseDonutChart } from '@/components/charts/expense-donut-chart'
import { IncomeBarChart } from '@/components/charts/income-bar-chart'
import { Wallet, TrendingUp, TrendingDown, DollarSign, ArrowRight } from 'lucide-react'
import Link from 'next/link'
import type { NetWorthSnapshot, Transaction, Category } from '@/types/database'
import { startOfMonth, endOfMonth } from 'date-fns'

type TransactionWithCategory = Transaction & {
  category: Pick<Category, 'name' | 'color'>[] | null
}

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Get the latest net worth snapshot
  const { data: latestSnapshotData } = await supabase
    .from('net_worth_snapshots')
    .select('*')
    .order('snapshot_date', { ascending: false })
    .limit(1)
    .single()

  const latestSnapshot = latestSnapshotData as NetWorthSnapshot | null

  // Get net worth history for the chart
  const { data: netWorthHistory } = await supabase
    .from('net_worth_snapshots')
    .select('*')
    .order('snapshot_date', { ascending: true })
    .limit(12)

  // Transform data for chart
  const history = (netWorthHistory || []) as NetWorthSnapshot[]
  const chartData = history.map(s => ({
    date: s.snapshot_date,
    netWorth: Number(s.net_worth),
    cash: Number(s.cash),
    investments: Number(s.investments),
    realEstate: Number(s.real_estate),
    crypto: Number(s.crypto),
    retirement: Number(s.retirement),
    liabilities: Number(s.liabilities),
  }))

  // Calculate current totals from latest snapshot or zero
  const currentNetWorth = latestSnapshot ? Number(latestSnapshot.net_worth) : 0
  const currentCash = latestSnapshot ? Number(latestSnapshot.cash) : 0
  const currentInvestments = latestSnapshot ? Number(latestSnapshot.investments) : 0
  const currentRealEstate = latestSnapshot ? Number(latestSnapshot.real_estate) : 0
  const currentCrypto = latestSnapshot ? Number(latestSnapshot.crypto) : 0
  const currentRetirement = latestSnapshot ? Number(latestSnapshot.retirement) : 0
  const currentLiabilities = latestSnapshot ? Number(latestSnapshot.liabilities) : 0

  // Calculate month-over-month change
  const previousNetWorth = chartData.length >= 2 ? chartData[chartData.length - 2].netWorth : currentNetWorth
  const netWorthChange = currentNetWorth - previousNetWorth
  const netWorthChangePercent = previousNetWorth ? ((netWorthChange / previousNetWorth) * 100) : 0

  // Get real monthly expense and income data
  const now = new Date()
  const monthStart = startOfMonth(now)
  const monthEnd = endOfMonth(now)

  // Get expense transactions for current month
  const { data: expenseTransactions } = await supabase
    .from('transactions')
    .select(`
      *,
      category:categories(name, color)
    `)
    .eq('transaction_type', 'expense')
    .gte('transaction_date', monthStart.toISOString().split('T')[0])
    .lte('transaction_date', monthEnd.toISOString().split('T')[0])

  // Get income transactions for current month
  const { data: incomeTransactions } = await supabase
    .from('transactions')
    .select(`
      *,
      category:categories(name, color)
    `)
    .eq('transaction_type', 'income')
    .gte('transaction_date', monthStart.toISOString().split('T')[0])
    .lte('transaction_date', monthEnd.toISOString().split('T')[0])

  const expenseList = (expenseTransactions || []) as TransactionWithCategory[]
  const incomeList = (incomeTransactions || []) as TransactionWithCategory[]

  // Aggregate expenses by category
  const expenseCategoryMap = new Map<string, { name: string; value: number; color: string }>()
  expenseList.forEach((t) => {
    const cat = t.category?.[0]
    const categoryName = cat?.name || 'Uncategorized'
    const color = cat?.color || 'hsl(var(--chart-1))'
    const existing = expenseCategoryMap.get(categoryName)
    if (existing) {
      existing.value += Math.abs(Number(t.amount))
    } else {
      expenseCategoryMap.set(categoryName, { name: categoryName, value: Math.abs(Number(t.amount)), color })
    }
  })
  const expenseData = Array.from(expenseCategoryMap.values()).sort((a, b) => b.value - a.value)

  // Aggregate income by category
  const incomeCategoryMap = new Map<string, number>()
  incomeList.forEach((t) => {
    const categoryName = t.category?.[0]?.name || 'Other Income'
    const existing = incomeCategoryMap.get(categoryName) || 0
    incomeCategoryMap.set(categoryName, existing + Number(t.amount))
  })
  const incomeData = Array.from(incomeCategoryMap.entries())
    .map(([name, amount]) => ({ name, amount }))
    .sort((a, b) => b.amount - a.amount)

  const totalExpenses = expenseData.reduce((sum, e) => sum + e.value, 0)
  const totalIncome = incomeData.reduce((sum, i) => sum + i.amount, 0)
  const totalAssets = currentCash + currentInvestments + currentRealEstate + currentCrypto + currentRetirement

  // Mini chart data for hero card
  const miniChartData = chartData.slice(-6).map((d) => ({
    month: new Date(d.date).toLocaleString('default', { month: 'short' }),
    value: d.netWorth,
  }))

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
          netWorth={currentNetWorth}
          change={netWorthChange}
          changePercent={netWorthChangePercent}
          miniChartData={miniChartData}
        />
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <div className="animate-fade-in-up stagger-1 opacity-0">
          <SummaryCard
            title="Total Assets"
            value={totalAssets}
            icon={TrendingUp}
            iconColor="bg-positive/10 text-positive"
          />
        </div>
        <div className="animate-fade-in-up stagger-2 opacity-0">
          <SummaryCard
            title="Total Liabilities"
            value={Math.abs(currentLiabilities)}
            icon={TrendingDown}
            iconColor="bg-negative/10 text-negative"
          />
        </div>
        <div className="animate-fade-in-up stagger-3 opacity-0">
          <SummaryCard
            title="Monthly Income"
            value={totalIncome}
            icon={DollarSign}
            description="this month"
            iconColor="bg-positive/10 text-positive"
          />
        </div>
        <div className="animate-fade-in-up stagger-4 opacity-0">
          <SummaryCard
            title="Monthly Expenses"
            value={totalExpenses}
            icon={Wallet}
            description="this month"
            iconColor="bg-negative/10 text-negative"
          />
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Asset Breakdown - Left side */}
        <div className="lg:col-span-2 space-y-4 animate-fade-in-up stagger-2 opacity-0">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Asset Breakdown</h2>
            <Link
              href="/net-worth"
              className="flex items-center gap-1 text-sm text-muted-foreground hover:text-primary transition-colors"
            >
              View all <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <NetWorthCard bucket="cash" value={currentCash} />
            <NetWorthCard bucket="investments" value={currentInvestments} />
            <NetWorthCard bucket="real_estate" value={currentRealEstate} />
            <NetWorthCard bucket="crypto" value={currentCrypto} />
            <NetWorthCard bucket="retirement" value={currentRetirement} />
            <NetWorthCard bucket="liabilities" value={currentLiabilities} />
          </div>
        </div>

        {/* Expense Breakdown - Right side */}
        <div className="animate-fade-in-up stagger-3 opacity-0">
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">Expenses</CardTitle>
                <Link
                  href="/expenses"
                  className="flex items-center gap-1 text-sm text-muted-foreground hover:text-primary transition-colors"
                >
                  View all <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
              <CardDescription>This month's spending</CardDescription>
            </CardHeader>
            <CardContent>
              {expenseData.length > 0 ? (
                <ExpenseDonutChart data={expenseData} />
              ) : (
                <div className="flex items-center justify-center h-[280px] text-muted-foreground text-sm">
                  No expenses recorded this month
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Net Worth Over Time */}
        <Card className="lg:col-span-2 animate-fade-in-up stagger-4 opacity-0">
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
            {chartData.length > 0 ? (
              <NetWorthChart data={chartData} />
            ) : (
              <div className="flex items-center justify-center h-[350px] text-muted-foreground text-sm">
                No net worth history yet. Create a snapshot in Settings.
              </div>
            )}
          </CardContent>
        </Card>

        {/* Income Sources */}
        <Card className="animate-fade-in-up stagger-5 opacity-0">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Income Sources</CardTitle>
                <CardDescription>
                  Your income streams this month
                </CardDescription>
              </div>
              <Link
                href="/income"
                className="flex items-center gap-1 text-sm text-muted-foreground hover:text-primary transition-colors"
              >
                View all <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            {incomeData.length > 0 ? (
              <IncomeBarChart data={incomeData} />
            ) : (
              <div className="flex items-center justify-center h-[300px] text-muted-foreground text-sm">
                No income recorded this month
              </div>
            )}
          </CardContent>
        </Card>

        {/* Quick Actions / Getting Started */}
        {!latestSnapshot && (
          <Card className="animate-fade-in-up stagger-6 opacity-0">
            <CardHeader>
              <CardTitle>Getting Started</CardTitle>
              <CardDescription>
                Set up your dashboard by importing your financial data
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Link
                href="/imports"
                className="block rounded-xl border p-4 hover:bg-muted/50 hover:border-primary/20 transition-all duration-200"
              >
                <h3 className="font-medium">1. Import QuickBooks Data</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Upload your QuickBooks transaction export to track expenses and income.
                </p>
              </Link>
              <Link
                href="/imports"
                className="block rounded-xl border p-4 hover:bg-muted/50 hover:border-primary/20 transition-all duration-200"
              >
                <h3 className="font-medium">2. Import Investment Data</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Upload your Raymond James CSV to track your investment portfolio.
                </p>
              </Link>
              <Link
                href="/settings"
                className="block rounded-xl border p-4 hover:bg-muted/50 hover:border-primary/20 transition-all duration-200"
              >
                <h3 className="font-medium">3. Add Home Value</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Enter your home value and mortgage balance in Settings.
                </p>
              </Link>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
