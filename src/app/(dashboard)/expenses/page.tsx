'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
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
import { Button } from '@/components/ui/button'
import { formatCurrency, formatDate } from '@/lib/utils'
import { startOfMonth, endOfMonth, format } from 'date-fns'
import { Loader2 } from 'lucide-react'
import {
  aggregateByParentCategory,
  aggregateBySubcategory,
  type AggregatedCategory,
} from '@/lib/category-utils'
import type { Transaction, Category } from '@/types/database'

// Colorful palette for expense categories
const CATEGORY_COLORS = [
  '#ef4444', // red
  '#f97316', // orange
  '#eab308', // yellow
  '#22c55e', // green
  '#14b8a6', // teal
  '#3b82f6', // blue
  '#8b5cf6', // violet
  '#ec4899', // pink
  '#06b6d4', // cyan
  '#84cc16', // lime
]

type TransactionWithCategory = Transaction & {
  category: Pick<Category, 'id' | 'name' | 'color' | 'parent_id'> | null
}

type ViewTier = 'parent' | 'subcategory'

export default function ExpensesPage() {
  const supabase = createClient()
  const [transactions, setTransactions] = useState<TransactionWithCategory[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [viewTier, setViewTier] = useState<ViewTier>('parent')

  const now = new Date()
  const monthStart = startOfMonth(now)
  const monthEnd = endOfMonth(now)

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    setLoading(true)

    const [transactionsRes, categoriesRes] = await Promise.all([
      supabase
        .from('transactions')
        .select(`
          *,
          category:categories!category_id(id, name, color, parent_id)
        `)
        .eq('transaction_type', 'expense')
        .gte('transaction_date', monthStart.toISOString().split('T')[0])
        .lte('transaction_date', monthEnd.toISOString().split('T')[0])
        .order('transaction_date', { ascending: false })
        .limit(100),
      supabase.from('categories').select('*'),
    ])

    if (transactionsRes.data) {
      setTransactions(transactionsRes.data as TransactionWithCategory[])
    }
    if (categoriesRes.data) {
      setCategories(categoriesRes.data)
    }

    setLoading(false)
  }

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

  const expensesByCategory = getAggregatedData()
  const totalExpenses = expensesByCategory.reduce((sum, e) => sum + e.total, 0)
  const topCategories = expensesByCategory.slice(0, 5)

  // Convert to chart format with colorful fallbacks
  const chartData = expensesByCategory.map((cat, index) => ({
    name: cat.name,
    value: cat.total,
    color: cat.color || CATEGORY_COLORS[index % CATEGORY_COLORS.length],
  }))

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
          <h1 className="text-3xl font-bold tracking-tight">Expenses</h1>
          <p className="text-muted-foreground">
            Track and analyze your spending for {format(now, 'MMMM yyyy')}
          </p>
        </div>
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
              Top {viewTier === 'parent' ? 'Category' : 'Subcategory'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{topCategories[0]?.name || '-'}</div>
            <p className="text-xs text-muted-foreground">
              {topCategories[0] ? formatCurrency(topCategories[0].total) : '-'}
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
            <CardDescription>
              {viewTier === 'parent'
                ? 'Grouped by parent category'
                : 'Individual subcategories'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {chartData.length > 0 ? (
              <ExpenseDonutChart data={chartData} />
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
            <CardTitle>Top {viewTier === 'parent' ? 'Categories' : 'Subcategories'}</CardTitle>
            <CardDescription>Your biggest spending areas</CardDescription>
          </CardHeader>
          <CardContent>
            {topCategories.length > 0 ? (
              <div className="space-y-4">
                {topCategories.map((category, index) => (
                  <div key={category.id} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{category.name}</span>
                      <span className="text-muted-foreground">
                        {formatCurrency(category.total)}
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${(category.total / totalExpenses) * 100}%`,
                          backgroundColor: category.color || CATEGORY_COLORS[index % CATEGORY_COLORS.length],
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
              {transactions.length > 0 ? (
                transactions.slice(0, 20).map((t) => {
                  const cat = t.category
                  const parentCat = cat?.parent_id
                    ? categories.find((c) => c.id === cat.parent_id)
                    : null
                  const displayCategory =
                    viewTier === 'parent' && parentCat
                      ? parentCat.name
                      : cat?.name || 'Uncategorized'

                  return (
                    <TableRow key={t.id}>
                      <TableCell className="whitespace-nowrap">
                        {formatDate(t.transaction_date)}
                      </TableCell>
                      <TableCell className="max-w-[300px] truncate">
                        {t.description}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">
                          {displayCategory}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right text-red-500">
                        {formatCurrency(Math.abs(Number(t.amount)))}
                      </TableCell>
                    </TableRow>
                  )
                })
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
