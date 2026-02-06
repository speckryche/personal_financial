'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { HoverCard, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Loader2, CreditCard, DollarSign, Percent, TrendingDown } from 'lucide-react'
import { formatCurrency, formatShortDate } from '@/lib/utils'
import {
  getAccountsWithBalances,
  groupAccountsByType,
  type AccountWithBalance,
} from '@/lib/account-balance'
import { DebtSummaryCard } from '@/components/debt/debt-summary-card'
import { DebtScorecard } from '@/components/debt/debt-scorecard'
import {
  type DebtAccount,
  sortByPayoffStrategy,
  getEffectiveStrategy,
  calculateWeightedAPR,
  calculateTotalMinimumPayments,
  calculateTotalMonthlyInterest,
} from '@/lib/debt-utils'
import { useToast } from '@/components/ui/use-toast'

export default function DebtPage() {
  const supabase = createClient()
  const { toast } = useToast()

  const [loading, setLoading] = useState(true)
  const [debts, setDebts] = useState<DebtAccount[]>([])
  const [chartData, setChartData] = useState<{ month: string; value: number }[]>([])
  const [previousMonthDebt, setPreviousMonthDebt] = useState<number | null>(null)

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()

    if (user) {
      // Load accounts and filter to liabilities
      const accounts = await getAccountsWithBalances(supabase, user.id)
      const { liabilities } = groupAccountsByType(accounts)

      // Cast to DebtAccount (includes the debt fields)
      const debtAccounts = liabilities as DebtAccount[]

      // Sort using effective strategy
      const strategy = getEffectiveStrategy(debtAccounts)
      const sortedDebts = sortByPayoffStrategy(debtAccounts, strategy)
      setDebts(sortedDebts)

      // Load historical snapshots for mini chart
      const { data: snapshots } = await supabase
        .from('net_worth_snapshots')
        .select('snapshot_date, liabilities')
        .eq('user_id', user.id)
        .order('snapshot_date', { ascending: false })
        .limit(6)

      if (snapshots && snapshots.length > 0) {
        // Reverse for chronological order and format for chart
        const chartPoints = snapshots.reverse().map((s) => ({
          month: formatShortDate(s.snapshot_date),
          value: Number(s.liabilities) || 0,
        }))
        setChartData(chartPoints)

        // Get previous month for comparison (second to last if we have enough data)
        if (snapshots.length >= 2) {
          // snapshots is now chronological after reverse, so second to last is index length-2
          setPreviousMonthDebt(Number(snapshots[snapshots.length - 2]?.liabilities) || null)
        }
      }
    }

    setLoading(false)
  }

  const handleUpdateDebt = async (
    accountId: string,
    updates: {
      interest_rate?: number | null
      minimum_payment?: number | null
      target_payoff_date?: string | null
      payoff_priority?: number | null
    }
  ) => {
    const { error } = await supabase
      .from('accounts')
      .update(updates)
      .eq('id', accountId)

    if (error) {
      toast({
        title: 'Error updating debt',
        description: error.message,
        variant: 'destructive',
      })
      return
    }

    toast({ title: 'Debt details updated' })
    await loadData()
  }

  // Calculate totals
  const totalDebt = debts.reduce((sum, d) => sum + Math.abs(d.display_balance), 0)
  const weightedAPR = calculateWeightedAPR(debts)
  const totalMinimums = calculateTotalMinimumPayments(debts)
  const totalMonthlyInterest = calculateTotalMonthlyInterest(debts)

  // Calculate change from previous month
  const change = previousMonthDebt !== null ? totalDebt - previousMonthDebt : 0
  const changePercent = previousMonthDebt !== null && previousMonthDebt > 0
    ? ((totalDebt - previousMonthDebt) / previousMonthDebt) * 100
    : 0

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Debt Freedom</h1>
        <p className="text-muted-foreground">
          Track your debts and plan your path to financial freedom
        </p>
      </div>

      {/* Hero Card */}
      <DebtSummaryCard
        totalDebt={totalDebt}
        change={change}
        changePercent={changePercent}
        miniChartData={chartData.length > 0 ? chartData : [{ month: 'Now', value: totalDebt }]}
        accountCount={debts.length}
      />

      {/* Summary Cards Row */}
      <div className="grid gap-4 md:grid-cols-3">
        {/* Total Debt */}
        <HoverCard className="group overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-0.5 bg-red-500 scale-x-0 group-hover:scale-x-100 transition-transform duration-300 origin-left" />
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Debt
            </CardTitle>
            <div className="p-2 rounded-lg bg-red-500/10 text-red-500">
              <CreditCard className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-mono tracking-tight text-red-500">
              {formatCurrency(totalDebt)}
            </div>
            <div className="flex items-center gap-1.5 mt-1 text-xs">
              {change !== 0 && (
                <span className={change <= 0 ? 'text-positive' : 'text-negative'}>
                  <TrendingDown className="h-3 w-3 inline mr-0.5" />
                  {change <= 0 ? '' : '+'}{changePercent.toFixed(1)}%
                </span>
              )}
              <span className="text-muted-foreground">vs last month</span>
            </div>
          </CardContent>
        </HoverCard>

        {/* Total Monthly Minimums */}
        <HoverCard className="group overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-0.5 bg-orange-500 scale-x-0 group-hover:scale-x-100 transition-transform duration-300 origin-left" />
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Monthly Minimums
            </CardTitle>
            <div className="p-2 rounded-lg bg-orange-500/10 text-orange-500">
              <DollarSign className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-mono tracking-tight">
              {formatCurrency(totalMinimums)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {totalMonthlyInterest > 0 && (
                <>~{formatCurrency(totalMonthlyInterest)} goes to interest</>
              )}
            </p>
          </CardContent>
        </HoverCard>

        {/* Weighted Average APR */}
        <HoverCard className="group overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-0.5 bg-yellow-500 scale-x-0 group-hover:scale-x-100 transition-transform duration-300 origin-left" />
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Weighted Avg APR
            </CardTitle>
            <div className="p-2 rounded-lg bg-yellow-500/10 text-yellow-500">
              <Percent className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-mono tracking-tight">
              {weightedAPR > 0 ? `${weightedAPR.toFixed(2)}%` : 'N/A'}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {debts.filter(d => d.interest_rate != null).length} of {debts.length} with rates set
            </p>
          </CardContent>
        </HoverCard>
      </div>

      {/* Strategy Badge */}
      {debts.length > 0 && (
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Payoff strategy:</span>
          <Badge variant="outline" className="capitalize">
            {getEffectiveStrategy(debts) === 'manual' ? 'Custom Priority' : 'Avalanche (Highest APR First)'}
          </Badge>
        </div>
      )}

      {/* Debt Scorecards Grid */}
      {debts.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {debts.map((debt, index) => (
            <DebtScorecard
              key={debt.id}
              debt={debt}
              priorityRank={index + 1}
              onUpdate={(updates) => handleUpdateDebt(debt.id, updates)}
            />
          ))}
        </div>
      ) : (
        <div className="text-center py-12">
          <CreditCard className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
          <h3 className="text-lg font-medium mb-2">No debt accounts found</h3>
          <p className="text-muted-foreground text-sm max-w-md mx-auto">
            You don&apos;t have any liability accounts (credit cards, loans, mortgages) set up.
            Add them in the Accounts page to start tracking your debt payoff progress.
          </p>
        </div>
      )}

      {/* Debt Freedom Tips */}
      {debts.length > 0 && (
        <div className="mt-8 p-6 rounded-2xl bg-muted/30 border border-muted">
          <h3 className="text-lg font-semibold mb-3">Debt Freedom Tips</h3>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li className="flex items-start gap-2">
              <span className="text-primary">1.</span>
              <span>
                <strong>Avalanche method:</strong> Pay minimum on all debts, then put extra money toward the highest APR debt first. This saves the most in interest.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-primary">2.</span>
              <span>
                <strong>Set interest rates:</strong> Click the edit button on each debt card to add the APR for accurate payoff projections.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-primary">3.</span>
              <span>
                <strong>Track progress:</strong> Visit this page regularly - your debt history is automatically saved for the trend chart.
              </span>
            </li>
          </ul>
        </div>
      )}
    </div>
  )
}
