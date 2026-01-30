import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ExpenseDonutChart } from '@/components/charts/expense-donut-chart'
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
import { startOfMonth, endOfMonth, format } from 'date-fns'
import type { Transaction, Category } from '@/types/database'

type TransactionWithCategory = Transaction & {
  category: Pick<Category, 'name' | 'color'>[] | null
}

type CategoryTotal = {
  category_id: string | null
  amount: number
  category: Pick<Category, 'name' | 'color'>[] | null
}

export default async function ExpensesPage() {
  const supabase = await createClient()

  const now = new Date()
  const monthStart = startOfMonth(now)
  const monthEnd = endOfMonth(now)

  // Get expense transactions for current month
  const { data: transactions } = await supabase
    .from('transactions')
    .select(`
      *,
      category:categories(name, color)
    `)
    .eq('transaction_type', 'expense')
    .gte('transaction_date', monthStart.toISOString().split('T')[0])
    .lte('transaction_date', monthEnd.toISOString().split('T')[0])
    .order('transaction_date', { ascending: false })
    .limit(100)

  // Get expense categories with totals
  const { data: categoryTotals } = await supabase
    .from('transactions')
    .select(`
      category_id,
      amount,
      category:categories(name, color)
    `)
    .eq('transaction_type', 'expense')
    .gte('transaction_date', monthStart.toISOString().split('T')[0])
    .lte('transaction_date', monthEnd.toISOString().split('T')[0])

  // Aggregate by category
  const categoryMap = new Map<string, { name: string; value: number; color: string }>()
  const totals = (categoryTotals || []) as CategoryTotal[]

  totals.forEach((t) => {
    const cat = t.category?.[0]
    const categoryName = cat?.name || 'Uncategorized'
    const color = cat?.color || '#6b7280'
    const existing = categoryMap.get(categoryName)

    if (existing) {
      existing.value += Math.abs(Number(t.amount))
    } else {
      categoryMap.set(categoryName, {
        name: categoryName,
        value: Math.abs(Number(t.amount)),
        color,
      })
    }
  })

  const expensesByCategory = Array.from(categoryMap.values())
    .sort((a, b) => b.value - a.value)

  const totalExpenses = expensesByCategory.reduce((sum, e) => sum + e.value, 0)

  // Top expense categories
  const topCategories = expensesByCategory.slice(0, 5)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Expenses</h1>
        <p className="text-muted-foreground">
          Track and analyze your spending for {format(now, 'MMMM yyyy')}
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Expenses
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-red-500">
              {formatCurrency(totalExpenses)}
            </div>
            <p className="text-xs text-muted-foreground">This month</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Transactions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{transactions?.length || 0}</div>
            <p className="text-xs text-muted-foreground">This month</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Top Category
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{topCategories[0]?.name || '-'}</div>
            <p className="text-xs text-muted-foreground">
              {topCategories[0] ? formatCurrency(topCategories[0].value) : '-'}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Charts and Tables */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Expense Breakdown */}
        <Card>
          <CardHeader>
            <CardTitle>Expense Breakdown</CardTitle>
            <CardDescription>Where your money went this month</CardDescription>
          </CardHeader>
          <CardContent>
            {expensesByCategory.length > 0 ? (
              <ExpenseDonutChart data={expensesByCategory} />
            ) : (
              <div className="flex items-center justify-center h-[280px] text-muted-foreground text-sm">
                No expenses recorded this month
              </div>
            )}
          </CardContent>
        </Card>

        {/* Top Categories */}
        <Card>
          <CardHeader>
            <CardTitle>Top Categories</CardTitle>
            <CardDescription>Your biggest spending areas</CardDescription>
          </CardHeader>
          <CardContent>
            {topCategories.length > 0 ? (
              <div className="space-y-4">
                {topCategories.map((category) => (
                  <div key={category.name} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{category.name}</span>
                      <span className="text-muted-foreground">
                        {formatCurrency(category.value)}
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${(category.value / totalExpenses) * 100}%`,
                          backgroundColor: category.color,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex items-center justify-center h-[200px] text-muted-foreground text-sm">
                No expense categories yet
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent Transactions */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Expenses</CardTitle>
          <CardDescription>Your latest expense transactions</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Category</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {((transactions || []) as TransactionWithCategory[]).length > 0 ? (
                ((transactions || []) as TransactionWithCategory[]).slice(0, 20).map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="whitespace-nowrap">
                      {formatDate(t.transaction_date)}
                    </TableCell>
                    <TableCell className="max-w-[300px] truncate">
                      {t.description}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">
                        {t.category?.[0]?.name || 'Uncategorized'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right text-red-500">
                      {formatCurrency(Math.abs(Number(t.amount)))}
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                    No expenses recorded this month. Import your QuickBooks data to get started.
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
