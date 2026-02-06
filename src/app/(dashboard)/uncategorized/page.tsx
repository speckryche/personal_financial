'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useToast } from '@/components/ui/use-toast'
import { formatCurrency, formatDate } from '@/lib/utils'
import { Loader2, AlertCircle, CheckCircle2 } from 'lucide-react'
import type { Transaction, Category, Account } from '@/types/database'

type TransactionWithAccount = Transaction & {
  account: Pick<Account, 'id' | 'name'> | null
}

export default function UncategorizedPage() {
  const supabase = createClient()
  const { toast } = useToast()
  const [transactions, setTransactions] = useState<TransactionWithAccount[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [savingCategory, setSavingCategory] = useState<string | null>(null)

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    setLoading(true)

    const [transactionsRes, categoriesRes] = await Promise.all([
      supabase
        .from('transactions')
        .select('*, account:accounts(id, name)')
        .is('category_id', null)
        .order('transaction_date', { ascending: false }),
      supabase.from('categories').select('*').order('name'),
    ])

    if (transactionsRes.data) {
      setTransactions(transactionsRes.data as TransactionWithAccount[])
    }
    if (categoriesRes.data) {
      setCategories(categoriesRes.data)
    }

    setLoading(false)
  }

  const assignCategory = async (transactionId: string, categoryId: string) => {
    if (!categoryId) return

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
      setTransactions((prev) => prev.filter((t) => t.id !== transactionId))
      toast({
        title: 'Category assigned',
        description: 'Transaction has been categorized.',
      })
    }

    setSavingCategory(null)
  }

  // Group categories by type and parent for the dropdown
  const incomeCategories = categories.filter((c) => c.type === 'income')
  const expenseCategories = categories.filter((c) => c.type === 'expense')

  // Build hierarchical category options
  const getCategoryOptions = (cats: Category[]) => {
    const parents = cats.filter((c) => !c.parent_id)
    const children = cats.filter((c) => c.parent_id)

    const options: { id: string; label: string; isParent: boolean }[] = []

    for (const parent of parents) {
      const subs = children.filter((c) => c.parent_id === parent.id)
      if (subs.length > 0) {
        // Parent with subcategories - show parent as header, subs as options
        options.push({ id: `header_${parent.id}`, label: parent.name, isParent: true })
        for (const sub of subs) {
          options.push({ id: sub.id, label: `  ${sub.name}`, isParent: false })
        }
      } else {
        // Standalone category
        options.push({ id: parent.id, label: parent.name, isParent: false })
      }
    }

    return options
  }

  const incomeOptions = getCategoryOptions(incomeCategories)
  const expenseOptions = getCategoryOptions(expenseCategories)

  // Summary stats
  const totalAmount = transactions.reduce((sum, t) => sum + Math.abs(Number(t.amount)), 0)
  const incomeCount = transactions.filter((t) => t.transaction_type === 'income').length
  const expenseCount = transactions.filter((t) => t.transaction_type === 'expense').length

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Uncategorized Transactions</h1>
        <p className="text-muted-foreground">
          Review and assign categories to transactions that haven&apos;t been categorized yet
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Uncategorized
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold flex items-center gap-2">
              {transactions.length === 0 ? (
                <>
                  <CheckCircle2 className="h-8 w-8 text-green-500" />
                  <span className="text-green-600">0</span>
                </>
              ) : (
                <>
                  <AlertCircle className="h-8 w-8 text-amber-500" />
                  <span className="text-amber-600">{transactions.length}</span>
                </>
              )}
            </div>
            <p className="text-xs text-muted-foreground">transactions need categories</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              By Type
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-4">
              <div>
                <span className="text-2xl font-bold text-green-600">{incomeCount}</span>
                <p className="text-xs text-muted-foreground">income</p>
              </div>
              <div>
                <span className="text-2xl font-bold text-red-500">{expenseCount}</span>
                <p className="text-xs text-muted-foreground">expense</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Amount
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{formatCurrency(totalAmount)}</div>
            <p className="text-xs text-muted-foreground">needs categorization</p>
          </CardContent>
        </Card>
      </div>

      {/* Transactions Table */}
      <Card>
        <CardHeader>
          <CardTitle>All Uncategorized Transactions</CardTitle>
          <CardDescription>
            {transactions.length === 0
              ? 'Great job! All transactions have been categorized.'
              : 'Select a category for each transaction to organize your finances'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {transactions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <CheckCircle2 className="h-12 w-12 text-green-500 mb-4" />
              <h3 className="text-lg font-semibold">All caught up!</h3>
              <p className="text-muted-foreground">
                Every transaction has a category assigned.
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Account</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="w-[220px]">Assign Category</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {transactions.map((txn) => {
                  const isIncome = txn.transaction_type === 'income'
                  const options = isIncome ? incomeOptions : expenseOptions

                  return (
                    <TableRow key={txn.id}>
                      <TableCell className="whitespace-nowrap">
                        {formatDate(txn.transaction_date)}
                      </TableCell>
                      <TableCell className="max-w-[250px]">
                        <div className="truncate" title={txn.description || txn.memo || ''}>
                          {txn.description || txn.memo || 'No description'}
                        </div>
                        {txn.qb_account && (
                          <div className="text-xs text-muted-foreground truncate">
                            QB: {txn.qb_account}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        {txn.account ? (
                          <span className="text-sm">{txn.account.name}</span>
                        ) : (
                          <span className="text-sm text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={isIncome ? 'default' : 'secondary'}>
                          {txn.transaction_type}
                        </Badge>
                      </TableCell>
                      <TableCell
                        className={`text-right font-medium whitespace-nowrap ${
                          isIncome ? 'text-green-600' : 'text-red-500'
                        }`}
                      >
                        {isIncome ? '+' : '-'}
                        {formatCurrency(Math.abs(Number(txn.amount)))}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Select
                            onValueChange={(value) => assignCategory(txn.id, value)}
                            disabled={savingCategory === txn.id}
                          >
                            <SelectTrigger className="w-[180px] h-8 text-xs">
                              <SelectValue placeholder="Select category..." />
                            </SelectTrigger>
                            <SelectContent>
                              {options.length > 0 ? (
                                options.map((opt) =>
                                  opt.isParent ? (
                                    <SelectItem
                                      key={opt.id}
                                      value={opt.id}
                                      disabled
                                      className="font-semibold text-xs"
                                    >
                                      — {opt.label} —
                                    </SelectItem>
                                  ) : (
                                    <SelectItem key={opt.id} value={opt.id} className="text-xs">
                                      {opt.label}
                                    </SelectItem>
                                  )
                                )
                              ) : (
                                <SelectItem value="none" disabled>
                                  No {isIncome ? 'income' : 'expense'} categories
                                </SelectItem>
                              )}
                            </SelectContent>
                          </Select>
                          {savingCategory === txn.id && (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
