'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
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
import { Button } from '@/components/ui/button'
import { formatCurrency, formatDate } from '@/lib/utils'
import { startOfMonth, endOfMonth, format, subMonths } from 'date-fns'
import { Loader2 } from 'lucide-react'
import { DateRangePicker, type DateRange } from '@/components/ui/date-range-picker'
import {
  aggregateByParentCategory,
  aggregateBySubcategory,
  type AggregatedCategory,
} from '@/lib/category-utils'
import type { Transaction, Category } from '@/types/database'

type TransactionWithCategory = Transaction & {
  category: Pick<Category, 'id' | 'name' | 'color' | 'parent_id'> | null
}

type ViewTier = 'parent' | 'subcategory'

export default function IncomePage() {
  const supabase = createClient()
  const [transactions, setTransactions] = useState<TransactionWithCategory[]>([])
  const [lastMonthTransactions, setLastMonthTransactions] = useState<{ amount: number }[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [viewTier, setViewTier] = useState<ViewTier>('parent')
  // Default to previous month since user likely has historical data
  const [dateRange, setDateRange] = useState<DateRange>(() => ({
    start: startOfMonth(subMonths(new Date(), 1)),
    end: endOfMonth(subMonths(new Date(), 1)),
  }))

  useEffect(() => {
    loadData()
  }, [dateRange])

  const loadData = async () => {
    setLoading(true)

    const startDate = dateRange.start.toISOString().split('T')[0]
    const endDate = dateRange.end.toISOString().split('T')[0]

    // Calculate comparison period (same duration, immediately before)
    const duration = dateRange.end.getTime() - dateRange.start.getTime()
    const prevEnd = new Date(dateRange.start.getTime() - 1)
    const prevStart = new Date(prevEnd.getTime() - duration)

    const [transactionsRes, lastPeriodRes, categoriesRes] = await Promise.all([
      supabase
        .from('transactions')
        .select(`
          *,
          category:categories!category_id(id, name, color, parent_id)
        `)
        .eq('transaction_type', 'income')
        .gte('transaction_date', startDate)
        .lte('transaction_date', endDate)
        .order('transaction_date', { ascending: false })
        .limit(500),
      supabase
        .from('transactions')
        .select('amount')
        .eq('transaction_type', 'income')
        .gte('transaction_date', prevStart.toISOString().split('T')[0])
        .lte('transaction_date', prevEnd.toISOString().split('T')[0]),
      supabase.from('categories').select('*'),
    ])

    if (transactionsRes.data) {
      setTransactions(transactionsRes.data as TransactionWithCategory[])
    }
    if (lastPeriodRes.data) {
      setLastMonthTransactions(lastPeriodRes.data as { amount: number }[])
    }
    if (categoriesRes.data) {
      setCategories(categoriesRes.data)
    }

    setLoading(false)
  }

  // Calculate totals
  const totalIncome = transactions.reduce((sum, t) => sum + Number(t.amount), 0)
  const lastMonthIncome = lastMonthTransactions.reduce((sum, t) => sum + Number(t.amount), 0)
  const monthOverMonthChange = lastMonthIncome > 0 ? ((totalIncome - lastMonthIncome) / lastMonthIncome) * 100 : 0

  // Aggregate by category based on view tier
  const getAggregatedData = (): AggregatedCategory[] => {
    const transactionsWithCategory = transactions.map((t) => {
      const cat = t.category
      // Look up parent from categories list if category has a parent_id
      const parentCat = cat?.parent_id
        ? categories.find((c) => c.id === cat.parent_id)
        : null

      return {
        amount: Number(t.amount),
        category: cat
          ? {
              id: cat.id,
              name: cat.name,
              color: cat.color,
              parent_id: cat.parent_id,
              parent: parentCat
                ? { id: parentCat.id, name: parentCat.name, color: parentCat.color }
                : null,
            }
          : null,
      }
    })

    if (viewTier === 'parent') {
      return aggregateByParentCategory(transactionsWithCategory, categories)
    } else {
      return aggregateBySubcategory(transactionsWithCategory)
    }
  }

  const incomeByCategory = getAggregatedData()

  // Convert to chart format
  const chartData = incomeByCategory.map((cat) => ({
    name: cat.name,
    amount: cat.total,
  }))

  // Get unique income sources count
  const uniqueSources = incomeByCategory.length

  // Format date range for display
  const getDateRangeLabel = () => {
    const startStr = format(dateRange.start, 'MMM yyyy')
    const endStr = format(dateRange.end, 'MMM yyyy')
    if (startStr === endStr) {
      return startStr
    }
    return `${startStr} - ${endStr}`
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Income</h1>
          <p className="text-muted-foreground">
            Track your income sources
          </p>
        </div>
        <div className="flex items-center gap-4">
          <DateRangePicker value={dateRange} onChange={setDateRange} />
          <div className="flex gap-1 bg-muted p-1 rounded-lg">
            <Button
              variant={viewTier === 'parent' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setViewTier('parent')}
            >
              Summary
            </Button>
            <Button
              variant={viewTier === 'subcategory' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setViewTier('subcategory')}
            >
              Detailed
            </Button>
          </div>
        </div>
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
                  {monthOverMonthChange >= 0 ? '+' : ''}{monthOverMonthChange.toFixed(1)}% from previous period
                </span>
              )}
              {monthOverMonthChange === 0 && getDateRangeLabel()}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Income {viewTier === 'parent' ? 'Sources' : 'Categories'}
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
              Primary {viewTier === 'parent' ? 'Source' : 'Category'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{incomeByCategory[0]?.name || '-'}</div>
            <p className="text-xs text-muted-foreground">
              {incomeByCategory[0] ? formatCurrency(incomeByCategory[0].total) : '-'}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Income by Source */}
        <Card>
          <CardHeader>
            <CardTitle>Income by {viewTier === 'parent' ? 'Source' : 'Category'}</CardTitle>
            <CardDescription>
              {viewTier === 'parent'
                ? 'Grouped by parent category'
                : 'Individual subcategories'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {chartData.length > 0 ? (
              <IncomeBarChart data={chartData} />
            ) : (
              <div className="flex items-center justify-center h-[300px] text-muted-foreground text-sm">
                No income recorded this month
              </div>
            )}
          </CardContent>
        </Card>

        {/* All Categories Table */}
        <Card>
          <CardHeader>
            <CardTitle>
              {viewTier === 'parent' ? 'All Income Sources' : 'All Subcategories'}
            </CardTitle>
            <CardDescription>
              {viewTier === 'parent'
                ? 'Complete breakdown by parent category'
                : 'Complete breakdown by subcategory'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {incomeByCategory.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Category</TableHead>
                    <TableHead className="text-right">Transactions</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="text-right">% of Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {incomeByCategory.map((category, index) => {
                    const percentage = totalIncome > 0
                      ? ((category.total / totalIncome) * 100).toFixed(1)
                      : '0.0'
                    return (
                      <TableRow key={category.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div
                              className="h-3 w-3 rounded-full shrink-0"
                              style={{
                                backgroundColor: category.color || `hsl(${142 - index * 20}, 76%, ${36 + index * 5}%)`,
                              }}
                            />
                            <span className="font-medium">{category.name}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground">
                          {category.count}
                        </TableCell>
                        <TableCell className="text-right font-medium text-green-500">
                          {formatCurrency(category.total)}
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground">
                          {percentage}%
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
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
              {transactions.length > 0 ? (
                transactions.slice(0, 20).map((t) => {
                  const cat = t.category
                  const parentCat = cat?.parent_id
                    ? categories.find((c) => c.id === cat.parent_id)
                    : null
                  // Summary view: show parent name if exists
                  // Detailed view: show "Parent - Subcategory" format
                  let displayCategory = 'Other Income'
                  if (cat) {
                    if (viewTier === 'parent' && parentCat) {
                      displayCategory = parentCat.name
                    } else if (viewTier === 'subcategory' && parentCat) {
                      displayCategory = `${parentCat.name} - ${cat.name}`
                    } else {
                      displayCategory = cat.name
                    }
                  }

                  return (
                    <TableRow key={t.id}>
                      <TableCell className="whitespace-nowrap">
                        {formatDate(t.transaction_date)}
                      </TableCell>
                      <TableCell className="max-w-[300px] truncate">
                        {t.description}
                      </TableCell>
                      <TableCell>
                        <Badge variant="default">
                          {displayCategory}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right text-green-500 font-medium">
                        +{formatCurrency(Number(t.amount))}
                      </TableCell>
                    </TableRow>
                  )
                })
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
