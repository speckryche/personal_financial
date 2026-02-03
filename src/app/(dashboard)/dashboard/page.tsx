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
import type { Transaction, Category, Account } from '@/types/database'
import { startOfMonth, endOfMonth, format } from 'date-fns'
import { getAccountsWithBalances, isLiabilityAccount } from '@/lib/account-balance'

type TransactionWithCategory = Transaction & {
  category: Pick<Category, 'id' | 'name' | 'color' | 'parent_id'> | null
}

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // ========================================
  // NET WORTH: Auto-calculate from accounts
  // ========================================
  const accounts = user ? await getAccountsWithBalances(supabase, user.id) : []

  // Calculate net worth by account type
  let currentCash = 0
  let currentInvestments = 0
  let currentRealEstate = 0
  let currentCrypto = 0
  let currentRetirement = 0
  let currentLiabilities = 0

  for (const account of accounts) {
    if (!account.is_active) continue
    const balance = account.current_balance

    if (isLiabilityAccount(account.account_type)) {
      // Liabilities (credit cards, loans, mortgage)
      currentLiabilities += Math.abs(balance)
    } else {
      // Assets - categorize by account type
      switch (account.account_type) {
        case 'checking':
        case 'savings':
          currentCash += balance
          break
        case 'investment':
          // Check if it's crypto based on name
          if (account.name.toLowerCase().includes('crypto')) {
            currentCrypto += balance
          } else {
            currentInvestments += balance
          }
          break
        case 'retirement':
          currentRetirement += balance
          break
        default:
          // 'other' type - check name for hints
          if (account.name.toLowerCase().includes('crypto')) {
            currentCrypto += balance
          } else if (account.name.toLowerCase().includes('house') || account.name.toLowerCase().includes('property') || account.name.toLowerCase().includes('real estate')) {
            currentRealEstate += balance
          } else {
            currentInvestments += balance // Default other assets to investments
          }
      }
    }
  }

  const totalAssets = currentCash + currentInvestments + currentRealEstate + currentCrypto + currentRetirement
  const currentNetWorth = totalAssets - currentLiabilities

  // For now, no historical chart data (would need to track snapshots over time)
  const chartData: { date: string; netWorth: number; cash: number; investments: number; realEstate: number; crypto: number; retirement: number; liabilities: number }[] = []
  const netWorthChange = 0
  const netWorthChangePercent = 0

  // ========================================
  // MONTHLY DATA: Find most recent month with data
  // ========================================
  const now = new Date()
  let monthStart = startOfMonth(now)
  let monthEnd = endOfMonth(now)
  let displayMonth = format(now, 'MMMM yyyy')

  // Check if current month has transactions
  const { count: currentMonthCount } = await supabase
    .from('transactions')
    .select('*', { count: 'exact', head: true })
    .gte('transaction_date', monthStart.toISOString().split('T')[0])
    .lte('transaction_date', monthEnd.toISOString().split('T')[0])

  // If no transactions this month, find the most recent month with data
  if (!currentMonthCount || currentMonthCount === 0) {
    const { data: mostRecentTxn } = await supabase
      .from('transactions')
      .select('transaction_date')
      .order('transaction_date', { ascending: false })
      .limit(1)
      .single()

    if (mostRecentTxn) {
      const recentDate = new Date(mostRecentTxn.transaction_date)
      monthStart = startOfMonth(recentDate)
      monthEnd = endOfMonth(recentDate)
      displayMonth = format(recentDate, 'MMMM yyyy')
    }
  }

  // Get expense transactions for the selected month
  const { data: expenseTransactions } = await supabase
    .from('transactions')
    .select(`
      *,
      category:categories!category_id(id, name, color, parent_id)
    `)
    .eq('transaction_type', 'expense')
    .gte('transaction_date', monthStart.toISOString().split('T')[0])
    .lte('transaction_date', monthEnd.toISOString().split('T')[0])

  // Get income transactions for the selected month
  const { data: incomeTransactions } = await supabase
    .from('transactions')
    .select(`
      *,
      category:categories!category_id(id, name, color, parent_id)
    `)
    .eq('transaction_type', 'income')
    .gte('transaction_date', monthStart.toISOString().split('T')[0])
    .lte('transaction_date', monthEnd.toISOString().split('T')[0])

  // Fetch all categories to look up parents
  const { data: allCategories } = await supabase
    .from('categories')
    .select('id, name, color, parent_id')

  const expenseList = (expenseTransactions || []) as TransactionWithCategory[]
  const incomeList = (incomeTransactions || []) as TransactionWithCategory[]
  const categoriesList = allCategories || []

  // Aggregate expenses by PARENT category (Tier 1 - Summary view for Dashboard)
  const expenseCategoryMap = new Map<string, { name: string; value: number; color: string }>()
  expenseList.forEach((t) => {
    const cat = t.category
    // Look up parent from categories list
    const parentCat = cat?.parent_id
      ? categoriesList.find((c) => c.id === cat.parent_id)
      : null

    // Use parent category if available, otherwise use the category itself
    const categoryName = parentCat?.name || cat?.name || 'Uncategorized'
    const color = parentCat?.color || cat?.color || 'hsl(var(--chart-1))'

    const existing = expenseCategoryMap.get(categoryName)
    if (existing) {
      existing.value += Math.abs(Number(t.amount))
    } else {
      expenseCategoryMap.set(categoryName, { name: categoryName, value: Math.abs(Number(t.amount)), color })
    }
  })
  const expenseData = Array.from(expenseCategoryMap.values()).sort((a, b) => b.value - a.value)

  // Aggregate income by PARENT category (Tier 1 - Summary view for Dashboard)
  const incomeCategoryMap = new Map<string, number>()
  incomeList.forEach((t) => {
    const cat = t.category
    // Look up parent from categories list
    const parentCat = cat?.parent_id
      ? categoriesList.find((c) => c.id === cat.parent_id)
      : null

    // Use parent category if available, otherwise use the category itself
    const categoryName = parentCat?.name || cat?.name || 'Other Income'

    const existing = incomeCategoryMap.get(categoryName) || 0
    incomeCategoryMap.set(categoryName, existing + Number(t.amount))
  })
  const incomeData = Array.from(incomeCategoryMap.entries())
    .map(([name, amount]) => ({ name, amount }))
    .sort((a, b) => b.amount - a.amount)

  const totalExpenses = expenseData.reduce((sum, e) => sum + e.value, 0)
  const totalIncome = incomeData.reduce((sum, i) => sum + i.amount, 0)

  // Mini chart data for hero card (empty for now since we don't have historical snapshots)
  const miniChartData: { month: string; value: number }[] = []

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
            description={displayMonth}
            iconColor="bg-positive/10 text-positive"
          />
        </div>
        <div className="animate-fade-in-up stagger-4 opacity-0">
          <SummaryCard
            title="Monthly Expenses"
            value={totalExpenses}
            icon={Wallet}
            description={displayMonth}
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
              <CardDescription>{displayMonth} spending</CardDescription>
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
                  Your income streams for {displayMonth}
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

        {/* Quick Actions / Getting Started - show if no accounts set up */}
        {accounts.length === 0 && (
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
