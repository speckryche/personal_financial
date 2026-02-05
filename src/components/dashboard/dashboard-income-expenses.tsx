'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { SummaryCard } from '@/components/dashboard/summary-card'
import { ExpenseDonutChart } from '@/components/charts/expense-donut-chart'
import { IncomeBarChart } from '@/components/charts/income-bar-chart'
import { DateRangePicker, type DateRange } from '@/components/ui/date-range-picker'
import { aggregateByParentCategory } from '@/lib/category-utils'
import { DollarSign, Wallet, ArrowRight, Loader2 } from 'lucide-react'
import { startOfMonth, endOfMonth, format } from 'date-fns'
import Link from 'next/link'
import type { Transaction, Category } from '@/types/database'

type TransactionWithCategory = Transaction & {
  category: Pick<Category, 'id' | 'name' | 'color' | 'parent_id'> | null
}

interface DashboardIncomeExpensesProps {
  defaultDateRange: { start: string; end: string }
  hasAccounts: boolean
}

const CATEGORY_COLORS = [
  '#ef4444', '#f97316', '#eab308', '#22c55e', '#14b8a6',
  '#3b82f6', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16',
]

export function DashboardIncomeExpenses({ defaultDateRange, hasAccounts }: DashboardIncomeExpensesProps) {
  const supabase = useMemo(() => createClient(), [])
  const requestCounterRef = useRef(0)

  const [dateRange, setDateRange] = useState<DateRange>(() => {
    // Parse YYYY-MM-DD as local time (not UTC) to match DateRangePicker behavior
    const [sy, sm, sd] = defaultDateRange.start.split('-').map(Number)
    const [ey, em, ed] = defaultDateRange.end.split('-').map(Number)
    return {
      start: new Date(sy, sm - 1, sd),
      end: new Date(ey, em - 1, ed),
    }
  })

  const [expenseTransactions, setExpenseTransactions] = useState<TransactionWithCategory[]>([])
  const [incomeTransactions, setIncomeTransactions] = useState<TransactionWithCategory[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [categoriesLoaded, setCategoriesLoaded] = useState(false)

  // Load categories once on mount
  useEffect(() => {
    const loadCategories = async () => {
      const { data } = await supabase.from('categories').select('*')
      if (data) setCategories(data)
      setCategoriesLoaded(true)
    }
    loadCategories()
  }, [supabase])

  // Load transactions when date range changes
  useEffect(() => {
    const loadTransactions = async () => {
      const currentRequest = ++requestCounterRef.current
      setLoading(true)

      const startDate = format(dateRange.start, 'yyyy-MM-dd')
      const endDate = format(dateRange.end, 'yyyy-MM-dd')

      try {
        const [expensesRes, incomeRes] = await Promise.all([
          fetch(`/api/transactions/expenses?startDate=${startDate}&endDate=${endDate}`).then(r => r.json()),
          fetch(`/api/transactions/income?startDate=${startDate}&endDate=${endDate}`).then(r => r.json()),
        ])

        // Stale request guard
        if (currentRequest !== requestCounterRef.current) return

        setExpenseTransactions((expensesRes.transactions || []) as TransactionWithCategory[])
        setIncomeTransactions((incomeRes.transactions || []) as TransactionWithCategory[])
      } catch (err) {
        if (currentRequest !== requestCounterRef.current) return
        console.error('Failed to load income/expense data:', err)
        setExpenseTransactions([])
        setIncomeTransactions([])
      }

      setLoading(false)
    }
    loadTransactions()
  }, [dateRange])

  // Aggregate expenses by parent category
  const expenseData = useMemo(() => {
    const mapped = expenseTransactions.map((t) => {
      const cat = t.category
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
    return aggregateByParentCategory(mapped, categories)
  }, [expenseTransactions, categories])

  // Aggregate income by parent category
  const incomeData = useMemo(() => {
    const incomeCategoryMap = new Map<string, number>()
    incomeTransactions.forEach((t) => {
      const cat = t.category
      const parentCat = cat?.parent_id
        ? categories.find((c) => c.id === cat.parent_id)
        : null
      const categoryName = parentCat?.name || cat?.name || 'Other Income'
      const existing = incomeCategoryMap.get(categoryName) || 0
      incomeCategoryMap.set(categoryName, existing + Math.abs(Number(t.amount)))
    })
    return Array.from(incomeCategoryMap.entries())
      .map(([name, amount]) => ({ name, amount }))
      .sort((a, b) => b.amount - a.amount)
  }, [incomeTransactions, categories])

  const totalExpenses = expenseData.reduce((sum, e) => sum + e.total, 0)
  const totalIncome = incomeData.reduce((sum, i) => sum + i.amount, 0)

  const chartData = expenseData.map((cat, index) => ({
    name: cat.name,
    value: cat.total,
    color: cat.color || CATEGORY_COLORS[index % CATEGORY_COLORS.length],
  }))

  const getDateRangeLabel = () => {
    const startStr = format(dateRange.start, 'MMM yyyy')
    const endStr = format(dateRange.end, 'MMM yyyy')
    if (startStr === endStr) return startStr
    return `${startStr} - ${endStr}`
  }

  return (
    <div className="space-y-6">
      {/* Header with DateRangePicker */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Income & Expenses</h2>
        <DateRangePicker value={dateRange} onChange={setDateRange} />
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="animate-fade-in-up stagger-1 opacity-0">
          <SummaryCard
            title="Income"
            value={totalIncome}
            icon={DollarSign}
            description={getDateRangeLabel()}
            iconColor="bg-positive/10 text-positive"
          />
        </div>
        <div className="animate-fade-in-up stagger-2 opacity-0">
          <SummaryCard
            title="Expenses"
            value={totalExpenses}
            icon={Wallet}
            description={getDateRangeLabel()}
            iconColor="bg-negative/10 text-negative"
          />
        </div>
      </div>

      {/* Charts */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Expense Breakdown */}
        <Card className="animate-fade-in-up stagger-3 opacity-0">
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
            <CardDescription>{getDateRangeLabel()} spending</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center h-[280px]">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : chartData.length > 0 ? (
              <ExpenseDonutChart data={chartData} />
            ) : (
              <div className="flex items-center justify-center h-[280px] text-muted-foreground text-sm">
                No expenses recorded for this period
              </div>
            )}
          </CardContent>
        </Card>

        {/* Income Sources */}
        <Card className="animate-fade-in-up stagger-4 opacity-0">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Income Sources</CardTitle>
                <CardDescription>
                  Your income streams for {getDateRangeLabel()}
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
            {loading ? (
              <div className="flex items-center justify-center h-[300px]">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : incomeData.length > 0 ? (
              <IncomeBarChart data={incomeData} />
            ) : (
              <div className="flex items-center justify-center h-[300px] text-muted-foreground text-sm">
                No income recorded for this period
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Getting Started - show if no accounts */}
      {!hasAccounts && (
        <Card className="animate-fade-in-up stagger-5 opacity-0">
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
  )
}
