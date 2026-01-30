import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { IncomeBarChart } from '@/components/charts/income-bar-chart'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { formatCurrency, formatDate } from '@/lib/utils'
import { startOfMonth, endOfMonth, format, subMonths } from 'date-fns'
import type { Transaction, Category } from '@/types/database'

type TransactionWithCategory = Transaction & {
  category: Pick<Category, 'name' | 'color'>[] | null
}

export default async function IncomePage() {
  const supabase = await createClient()

  const now = new Date()
  const monthStart = startOfMonth(now)
  const monthEnd = endOfMonth(now)
  const lastMonthStart = startOfMonth(subMonths(now, 1))
  const lastMonthEnd = endOfMonth(subMonths(now, 1))

  // Get income transactions for current month
  const { data: transactions } = await supabase
    .from('transactions')
    .select(`
      *,
      category:categories(name, color)
    `)
    .eq('transaction_type', 'income')
    .gte('transaction_date', monthStart.toISOString().split('T')[0])
    .lte('transaction_date', monthEnd.toISOString().split('T')[0])
    .order('transaction_date', { ascending: false })
    .limit(100)

  // Get last month's income for comparison
  const { data: lastMonthTransactions } = await supabase
    .from('transactions')
    .select('amount')
    .eq('transaction_type', 'income')
    .gte('transaction_date', lastMonthStart.toISOString().split('T')[0])
    .lte('transaction_date', lastMonthEnd.toISOString().split('T')[0])

  // Calculate totals
  const transactionList = (transactions || []) as TransactionWithCategory[]
  const lastMonthList = (lastMonthTransactions || []) as { amount: number }[]
  const totalIncome = transactionList.reduce((sum, t) => sum + Number(t.amount), 0)
  const lastMonthIncome = lastMonthList.reduce((sum, t) => sum + Number(t.amount), 0)
  const monthOverMonthChange = lastMonthIncome > 0 ? ((totalIncome - lastMonthIncome) / lastMonthIncome) * 100 : 0

  // Aggregate by category for chart
  const categoryMap = new Map<string, number>()

  transactionList.forEach((t) => {
    const categoryName = t.category?.[0]?.name || 'Other Income'
    const existing = categoryMap.get(categoryName) || 0
    categoryMap.set(categoryName, existing + Number(t.amount))
  })

  const incomeByCategory = Array.from(categoryMap.entries())
    .map(([name, amount]) => ({ name, amount }))
    .sort((a, b) => b.amount - a.amount)

  // Get unique income sources count
  const uniqueSources = new Set(transactionList.map((t) => t.category?.[0]?.name || 'Other')).size

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Income</h1>
        <p className="text-muted-foreground">
          Track your income sources for {format(now, 'MMMM yyyy')}
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Income
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-500">
              {formatCurrency(totalIncome)}
            </div>
            <p className="text-xs text-muted-foreground">
              {monthOverMonthChange !== 0 && (
                <span className={monthOverMonthChange >= 0 ? 'text-green-500' : 'text-red-500'}>
                  {monthOverMonthChange >= 0 ? '+' : ''}{monthOverMonthChange.toFixed(1)}% from last month
                </span>
              )}
              {monthOverMonthChange === 0 && 'This month'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Income Sources
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{uniqueSources || 0}</div>
            <p className="text-xs text-muted-foreground">Active sources</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Primary Source
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{incomeByCategory[0]?.name || '-'}</div>
            <p className="text-xs text-muted-foreground">
              {incomeByCategory[0] ? formatCurrency(incomeByCategory[0].amount) : '-'}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Income by Source */}
        <Card>
          <CardHeader>
            <CardTitle>Income by Source</CardTitle>
            <CardDescription>Breakdown of your income streams</CardDescription>
          </CardHeader>
          <CardContent>
            {incomeByCategory.length > 0 ? (
              <IncomeBarChart data={incomeByCategory} />
            ) : (
              <div className="flex items-center justify-center h-[300px] text-muted-foreground text-sm">
                No income recorded this month
              </div>
            )}
          </CardContent>
        </Card>

        {/* Income Summary */}
        <Card>
          <CardHeader>
            <CardTitle>Income Summary</CardTitle>
            <CardDescription>Details by category</CardDescription>
          </CardHeader>
          <CardContent>
            {incomeByCategory.length > 0 ? (
              <div className="space-y-4">
                {incomeByCategory.map((source, i) => {
                  const total = incomeByCategory.reduce((s, c) => s + c.amount, 0)
                  const percentage = ((source.amount / total) * 100).toFixed(1)
                  return (
                    <div key={source.name} className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div
                          className="h-3 w-3 rounded-full"
                          style={{
                            backgroundColor: `hsl(${142 - i * 20}, 76%, ${36 + i * 5}%)`,
                          }}
                        />
                        <span className="font-medium">{source.name}</span>
                      </div>
                      <div className="text-right">
                        <div className="font-medium">{formatCurrency(source.amount)}</div>
                        <div className="text-xs text-muted-foreground">{percentage}%</div>
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="flex items-center justify-center h-[200px] text-muted-foreground text-sm">
                No income sources yet
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent Transactions */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Income</CardTitle>
          <CardDescription>Your latest income transactions</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Source</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {transactionList.length > 0 ? (
                transactionList.slice(0, 20).map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="whitespace-nowrap">
                      {formatDate(t.transaction_date)}
                    </TableCell>
                    <TableCell className="max-w-[300px] truncate">
                      {t.description}
                    </TableCell>
                    <TableCell>
                      <Badge variant="default">
                        {t.category?.[0]?.name || 'Other Income'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right text-green-500 font-medium">
                      +{formatCurrency(Number(t.amount))}
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                    No income recorded this month. Import your QuickBooks data to get started.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
