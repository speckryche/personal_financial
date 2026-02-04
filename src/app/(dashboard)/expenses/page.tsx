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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useToast } from '@/components/ui/use-toast'
import { formatCurrency, formatDate } from '@/lib/utils'
import { getSubcategoriesForMapping } from '@/lib/category-utils'
import { startOfMonth, endOfMonth, format, subMonths } from 'date-fns'
import { Loader2 } from 'lucide-react'
import { DateRangePicker, type DateRange } from '@/components/ui/date-range-picker'
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
  const { toast } = useToast()
  const [transactions, setTransactions] = useState<TransactionWithCategory[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [viewTier, setViewTier] = useState<ViewTier>('parent')

  // Transaction detail modal state
  const [detailModalOpen, setDetailModalOpen] = useState(false)
  const [selectedCategoryName, setSelectedCategoryName] = useState<string | null>(null)
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null)
  const [categoryTransactions, setCategoryTransactions] = useState<TransactionWithCategory[]>([])
  const [savingCategory, setSavingCategory] = useState<string | null>(null)

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

    const [expensesRes, categoriesRes] = await Promise.all([
      fetch(`/api/transactions/expenses?startDate=${startDate}&endDate=${endDate}`).then(r => r.json()),
      supabase.from('categories').select('*'),
    ])

    if (expensesRes.transactions) {
      setTransactions(expensesRes.transactions as TransactionWithCategory[])
    }
    if (categoriesRes.data) {
      setCategories(categoriesRes.data)
    }

    setLoading(false)
  }

  // No need to filter - balance sheet transactions already have transaction_type='transfer'
  // and won't appear in expense queries (which filter by transaction_type='expense')

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
  const topCategory = expensesByCategory[0]

  // Open modal with transactions for a specific category
  const openCategoryTransactions = (categoryId: string, categoryName: string) => {
    setSelectedCategoryId(categoryId)
    setSelectedCategoryName(categoryName)

    // Filter transactions for this category (excluding transfers)
    let filtered: TransactionWithCategory[]
    if (viewTier === 'parent') {
      // In parent view, categoryId is either a parent category or a standalone category
      // We need to include all transactions where:
      // - The transaction's category's parent_id matches categoryId, OR
      // - The transaction's category id matches categoryId (for categories without parents)
      filtered = transactions.filter((t) => {
        if (!t.category) return categoryId === 'uncategorized'
        // Check if this category's parent matches, or if this is the category itself
        return t.category.parent_id === categoryId || t.category.id === categoryId
      })
    } else {
      // In subcategory view, match exact category id
      filtered = transactions.filter((t) => {
        if (!t.category) return categoryId === 'uncategorized'
        return t.category.id === categoryId
      })
    }

    setCategoryTransactions(filtered)
    setDetailModalOpen(true)
  }

  // Assign category to a single transaction
  const assignCategoryToTransaction = async (transactionId: string, categoryId: string) => {
    if (categoryId === 'none') return

    setSavingCategory(transactionId)

    const { error } = await supabase
      .from('transactions')
      .update({ category_id: categoryId })
      .eq('id', transactionId)

    if (error) {
      toast({
        title: 'Error assigning category',
        description: error.message,
        variant: 'destructive',
      })
    } else {
      // Remove from modal list and update main transactions list
      setCategoryTransactions((prev) => prev.filter((t) => t.id !== transactionId))
      toast({
        title: 'Category assigned',
        description: 'Transaction has been categorized.',
      })
      // Refresh data to update the main view
      loadData()
    }

    setSavingCategory(null)
  }

  // Convert to chart format with colorful fallbacks
  const chartData = expensesByCategory.map((cat, index) => ({
    name: cat.name,
    value: cat.total,
    color: cat.color || CATEGORY_COLORS[index % CATEGORY_COLORS.length],
  }))

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
          <h1 className="text-3xl font-bold tracking-tight">Expenses</h1>
          <p className="text-muted-foreground">
            Track and analyze your spending
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
              Total Expenses
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-red-500">
              {formatCurrency(totalExpenses)}
            </div>
            <p className="text-xs text-muted-foreground">{getDateRangeLabel()}</p>
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
            <p className="text-xs text-muted-foreground">{getDateRangeLabel()}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Top {viewTier === 'parent' ? 'Category' : 'Subcategory'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{topCategory?.name || '-'}</div>
            <p className="text-xs text-muted-foreground">
              {topCategory ? formatCurrency(topCategory.total) : '-'}
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

        {/* All Categories Table */}
        <Card>
          <CardHeader>
            <CardTitle>
              {viewTier === 'parent' ? 'All Categories' : 'All Subcategories'}
            </CardTitle>
            <CardDescription>
              {viewTier === 'parent'
                ? 'Complete breakdown by parent category'
                : 'Complete breakdown by subcategory'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {expensesByCategory.length > 0 ? (
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
                  {expensesByCategory.map((category, index) => {
                    const percentage = totalExpenses > 0
                      ? ((category.total / totalExpenses) * 100).toFixed(1)
                      : '0.0'
                    return (
                      <TableRow key={category.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div
                              className="h-3 w-3 rounded-full shrink-0"
                              style={{
                                backgroundColor: category.color || CATEGORY_COLORS[index % CATEGORY_COLORS.length],
                              }}
                            />
                            <span className="font-medium">{category.name}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <button
                            onClick={() => openCategoryTransactions(category.id, category.name)}
                            className="text-muted-foreground hover:text-foreground hover:underline transition-colors"
                          >
                            {category.count}
                          </button>
                        </TableCell>
                        <TableCell className="text-right font-medium text-red-500">
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
                  // Summary view: show parent name if exists
                  // Detailed view: show "Parent - Subcategory" format
                  let displayCategory = 'Uncategorized'
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

      {/* Category Transactions Modal */}
      <Dialog open={detailModalOpen} onOpenChange={setDetailModalOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>{selectedCategoryName} Transactions</DialogTitle>
            <DialogDescription>
              {categoryTransactions.length} transaction{categoryTransactions.length !== 1 && 's'} in this category
              {selectedCategoryId === 'uncategorized' && categoryTransactions.length > 0 && (
                <span className="ml-2 text-amber-600">- Assign categories below</span>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto min-h-0">
            {categoryTransactions.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No transactions found.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    {selectedCategoryId === 'uncategorized' ? (
                      <TableHead>Assign Category</TableHead>
                    ) : (
                      <TableHead>Category</TableHead>
                    )}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {categoryTransactions.map((txn) => {
                    const cat = txn.category
                    const parentCat = cat?.parent_id
                      ? categories.find((c) => c.id === cat.parent_id)
                      : null
                    let displayCategory = 'Uncategorized'
                    if (cat) {
                      if (parentCat) {
                        displayCategory = `${parentCat.name} - ${cat.name}`
                      } else {
                        displayCategory = cat.name
                      }
                    }

                    return (
                      <TableRow key={txn.id}>
                        <TableCell className="text-sm whitespace-nowrap">
                          {formatDate(txn.transaction_date)}
                        </TableCell>
                        <TableCell className="text-sm max-w-[200px] truncate" title={txn.description || txn.memo || ''}>
                          {txn.description || txn.memo || 'No description'}
                        </TableCell>
                        <TableCell className="text-right font-medium text-red-500 whitespace-nowrap">
                          {formatCurrency(Math.abs(Number(txn.amount)))}
                        </TableCell>
                        {selectedCategoryId === 'uncategorized' ? (
                          <TableCell>
                            <Select
                              onValueChange={(value) => assignCategoryToTransaction(txn.id, value)}
                              disabled={savingCategory === txn.id}
                            >
                              <SelectTrigger className="w-44 h-8 text-xs">
                                <SelectValue placeholder="Select category..." />
                              </SelectTrigger>
                              <SelectContent>
                                {getSubcategoriesForMapping(categories, 'expense').map((group) => (
                                  <div key={group.parent.id}>
                                    <SelectItem value={`__parent_${group.parent.id}__`} disabled>
                                      <span className="text-xs font-semibold">- {group.parent.name} -</span>
                                    </SelectItem>
                                    {group.subcategories.map((sub) => (
                                      <SelectItem key={sub.id} value={sub.id}>
                                        {sub.name}
                                      </SelectItem>
                                    ))}
                                  </div>
                                ))}
                              </SelectContent>
                            </Select>
                            {savingCategory === txn.id && (
                              <Loader2 className="inline ml-2 h-3 w-3 animate-spin" />
                            )}
                          </TableCell>
                        ) : (
                          <TableCell>
                            <Badge variant="secondary" className="text-xs">
                              {displayCategory}
                            </Badge>
                          </TableCell>
                        )}
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDetailModalOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
