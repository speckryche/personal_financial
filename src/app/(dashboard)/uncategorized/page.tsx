'use client'

import { useState, useEffect, useMemo } from 'react'
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
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useToast } from '@/components/ui/use-toast'
import { formatCurrency, formatDate } from '@/lib/utils'
import { Loader2, AlertCircle, CheckCircle2, Layers } from 'lucide-react'
import type { Transaction, Category, Account } from '@/types/database'

type TransactionWithAccount = Transaction & {
  account: Pick<Account, 'id' | 'name'> | null
}

type GroupedTransactions = {
  qbAccount: string
  transactionType: 'income' | 'expense'
  transactions: TransactionWithAccount[]
  totalAmount: number
}

export default function UncategorizedPage() {
  const supabase = createClient()
  const { toast } = useToast()
  const [transactions, setTransactions] = useState<TransactionWithAccount[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [savingCategory, setSavingCategory] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkCategory, setBulkCategory] = useState<string>('')
  const [applyingBulk, setApplyingBulk] = useState(false)
  const [viewMode, setViewMode] = useState<'individual' | 'grouped'>('grouped')

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    setLoading(true)

    // Fetch categories
    const { data: categoriesData } = await supabase.from('categories').select('*').order('name')

    // Fetch uncategorized transactions with pagination (Supabase 1000 row limit)
    const allTransactions: any[] = []
    let offset = 0
    const batchSize = 1000

    while (true) {
      const { data: batch } = await supabase
        .from('transactions')
        .select('*, account:accounts(id, name)')
        .is('category_id', null)
        .in('transaction_type', ['income', 'expense'])
        .order('transaction_date', { ascending: false })
        .range(offset, offset + batchSize - 1)

      if (!batch || batch.length === 0) break
      allTransactions.push(...batch)
      if (batch.length < batchSize) break
      offset += batchSize
    }

    const transactionsRes = { data: allTransactions }
    const categoriesRes = { data: categoriesData }

    if (transactionsRes.data) {
      setTransactions(transactionsRes.data as TransactionWithAccount[])
    }
    if (categoriesRes.data) {
      setCategories(categoriesRes.data)
    }

    setSelectedIds(new Set())
    setLoading(false)
  }

  const assignCategory = async (transactionId: string, categoryId: string) => {
    if (!categoryId) return

    setSavingCategory(transactionId)

    // Find the category to get its type
    const category = categories.find((c) => c.id === categoryId)
    const newType = category?.type || 'expense'

    const { error } = await supabase
      .from('transactions')
      .update({
        category_id: categoryId,
        transaction_type: newType, // Update type to match category
      })
      .eq('id', transactionId)

    if (error) {
      toast({
        title: 'Error assigning category',
        description: error.message,
        variant: 'destructive',
      })
    } else {
      setTransactions((prev) => prev.filter((t) => t.id !== transactionId))
      setSelectedIds((prev) => {
        const next = new Set(prev)
        next.delete(transactionId)
        return next
      })
      toast({
        title: 'Category assigned',
        description: 'Transaction has been categorized.',
      })
    }

    setSavingCategory(null)
  }

  const applyBulkCategory = async () => {
    if (!bulkCategory || selectedIds.size === 0) return

    setApplyingBulk(true)

    // Find the category to get its type
    const category = categories.find((c) => c.id === bulkCategory)
    const newType = category?.type || 'expense'

    const ids = Array.from(selectedIds)
    const { error } = await supabase
      .from('transactions')
      .update({
        category_id: bulkCategory,
        transaction_type: newType, // Update type to match category
      })
      .in('id', ids)

    if (error) {
      toast({
        title: 'Error applying bulk category',
        description: error.message,
        variant: 'destructive',
      })
    } else {
      setTransactions((prev) => prev.filter((t) => !selectedIds.has(t.id)))
      setSelectedIds(new Set())
      setBulkCategory('')
      toast({
        title: 'Categories assigned',
        description: `${ids.length} transaction${ids.length > 1 ? 's' : ''} categorized.`,
      })
    }

    setApplyingBulk(false)
  }

  const selectAllInGroup = (group: GroupedTransactions) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      group.transactions.forEach((t) => next.add(t.id))
      return next
    })
  }

  const deselectAllInGroup = (group: GroupedTransactions) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      group.transactions.forEach((t) => next.delete(t.id))
      return next
    })
  }

  const toggleSelection = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const selectAll = () => {
    setSelectedIds(new Set(transactions.map((t) => t.id)))
  }

  const deselectAll = () => {
    setSelectedIds(new Set())
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
        options.push({ id: `header_${parent.id}`, label: parent.name, isParent: true })
        for (const sub of subs) {
          options.push({ id: sub.id, label: `  ${sub.name}`, isParent: false })
        }
      } else {
        options.push({ id: parent.id, label: parent.name, isParent: false })
      }
    }

    return options
  }

  const incomeOptions = getCategoryOptions(incomeCategories)
  const expenseOptions = getCategoryOptions(expenseCategories)

  // Group transactions by qb_account and transaction_type
  const groupedTransactions = useMemo(() => {
    const groups: Record<string, GroupedTransactions> = {}

    transactions.forEach((t) => {
      const key = `${t.qb_account || 'No QB Account'}|${t.transaction_type}`
      if (!groups[key]) {
        groups[key] = {
          qbAccount: t.qb_account || 'No QB Account',
          transactionType: t.transaction_type as 'income' | 'expense',
          transactions: [],
          totalAmount: 0,
        }
      }
      groups[key].transactions.push(t)
      groups[key].totalAmount += Math.abs(Number(t.amount))
    })

    // Sort by transaction count (most transactions first)
    return Object.values(groups).sort((a, b) => b.transactions.length - a.transactions.length)
  }, [transactions])

  // Combined category options for bulk assign (show all, grouped by type)
  const allCategoryOptions = useMemo(() => {
    const options: { id: string; label: string; isParent: boolean; isHeader?: boolean }[] = []

    if (expenseOptions.length > 0) {
      options.push({ id: 'header_expense', label: 'EXPENSE CATEGORIES', isParent: true, isHeader: true })
      options.push(...expenseOptions)
    }

    if (incomeOptions.length > 0) {
      options.push({ id: 'header_income', label: 'INCOME CATEGORIES', isParent: true, isHeader: true })
      options.push(...incomeOptions)
    }

    return options
  }, [incomeOptions, expenseOptions])

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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Uncategorized Transactions</h1>
          <p className="text-base font-medium text-muted-foreground">
            Review and assign categories to transactions that haven&apos;t been categorized yet
          </p>
        </div>
        <div className="flex gap-1 bg-muted p-1 rounded-lg">
          <Button
            variant={viewMode === 'grouped' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setViewMode('grouped')}
          >
            <Layers className="h-4 w-4 mr-1" />
            Grouped
          </Button>
          <Button
            variant={viewMode === 'individual' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setViewMode('individual')}
          >
            Individual
          </Button>
        </div>
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
            <p className="text-sm font-medium text-muted-foreground">transactions need categories</p>
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
                <p className="text-sm font-medium text-muted-foreground">income</p>
              </div>
              <div>
                <span className="text-2xl font-bold text-red-500">{expenseCount}</span>
                <p className="text-sm font-medium text-muted-foreground">expense</p>
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
            <p className="text-sm font-medium text-muted-foreground">needs categorization</p>
          </CardContent>
        </Card>
      </div>

      {/* Bulk Action Bar */}
      {selectedIds.size > 0 && (
        <Card className="border-primary bg-primary/5">
          <CardContent className="py-3">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <span className="font-medium">{selectedIds.size} selected</span>
                <Button variant="ghost" size="sm" onClick={deselectAll}>
                  Clear
                </Button>
              </div>
              <div className="flex items-center gap-2">
                <Select value={bulkCategory} onValueChange={setBulkCategory}>
                  <SelectTrigger className="w-[220px] h-8">
                    <SelectValue placeholder="Select category..." />
                  </SelectTrigger>
                  <SelectContent>
                    {allCategoryOptions.map((opt) =>
                      opt.isParent ? (
                        <SelectItem
                          key={opt.id}
                          value={opt.id}
                          disabled
                          className={`font-semibold text-xs ${opt.isHeader ? 'text-primary' : ''}`}
                        >
                          {opt.isHeader ? opt.label : `— ${opt.label} —`}
                        </SelectItem>
                      ) : (
                        <SelectItem key={opt.id} value={opt.id} className="text-xs">
                          {opt.label}
                        </SelectItem>
                      )
                    )}
                  </SelectContent>
                </Select>
                <Button
                  onClick={applyBulkCategory}
                  disabled={!bulkCategory || applyingBulk}
                  size="sm"
                >
                  {applyingBulk && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Apply to {selectedIds.size}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Grouped View */}
      {viewMode === 'grouped' && transactions.length > 0 && (
        <div className="space-y-4">
          {groupedTransactions.map((group) => {
            const allSelected = group.transactions.every((t) => selectedIds.has(t.id))
            const someSelected = group.transactions.some((t) => selectedIds.has(t.id))
            const isIncome = group.transactionType === 'income'

            return (
              <Card key={`${group.qbAccount}|${group.transactionType}`}>
                <CardHeader className="py-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Checkbox
                        checked={allSelected}
                        ref={(el) => {
                          if (el) {
                            (el as unknown as HTMLInputElement).indeterminate = someSelected && !allSelected
                          }
                        }}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            selectAllInGroup(group)
                          } else {
                            deselectAllInGroup(group)
                          }
                        }}
                      />
                      <div>
                        <CardTitle className="text-base flex items-center gap-2">
                          {group.qbAccount}
                          <Badge variant={isIncome ? 'default' : 'secondary'} className="text-xs">
                            {group.transactionType}
                          </Badge>
                        </CardTitle>
                        <CardDescription>
                          {group.transactions.length} transaction{group.transactions.length > 1 ? 's' : ''} · {formatCurrency(group.totalAmount)}
                        </CardDescription>
                      </div>
                    </div>
                    <Select
                      onValueChange={(categoryId) => {
                        // Apply to all in group
                        group.transactions.forEach((t) => {
                          assignCategory(t.id, categoryId)
                        })
                      }}
                    >
                      <SelectTrigger className="w-[200px] h-8 text-xs">
                        <SelectValue placeholder="Assign all..." />
                      </SelectTrigger>
                      <SelectContent>
                        {allCategoryOptions.map((opt) =>
                          opt.isParent ? (
                            <SelectItem
                              key={opt.id}
                              value={opt.id}
                              disabled
                              className={`font-semibold text-xs ${opt.isHeader ? 'text-primary' : ''}`}
                            >
                              {opt.isHeader ? opt.label : `— ${opt.label} —`}
                            </SelectItem>
                          ) : (
                            <SelectItem key={opt.id} value={opt.id} className="text-xs">
                              {opt.label}
                            </SelectItem>
                          )
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[40px]"></TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {group.transactions.map((txn) => (
                        <TableRow key={txn.id}>
                          <TableCell>
                            <Checkbox
                              checked={selectedIds.has(txn.id)}
                              onCheckedChange={() => toggleSelection(txn.id)}
                            />
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-sm">
                            {formatDate(txn.transaction_date)}
                          </TableCell>
                          <TableCell className="max-w-[300px]">
                            <div className="truncate text-sm" title={txn.description || txn.memo || ''}>
                              {txn.description || txn.memo || 'No description'}
                            </div>
                          </TableCell>
                          <TableCell
                            className={`text-right font-medium whitespace-nowrap ${
                              isIncome ? 'text-green-600' : 'text-red-500'
                            }`}
                          >
                            {isIncome ? '+' : '-'}
                            {formatCurrency(Math.abs(Number(txn.amount)))}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* Individual View */}
      {viewMode === 'individual' && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>All Uncategorized Transactions</CardTitle>
                <CardDescription>
                  {transactions.length === 0
                    ? 'Great job! All transactions have been categorized.'
                    : 'Select a category for each transaction to organize your finances'}
                </CardDescription>
              </div>
              {transactions.length > 0 && (
                <Button variant="outline" size="sm" onClick={selectAll}>
                  Select All
                </Button>
              )}
            </div>
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
                    <TableHead className="w-[40px]">
                      <Checkbox
                        checked={selectedIds.size === transactions.length && transactions.length > 0}
                        onCheckedChange={(checked) => {
                          if (checked) selectAll()
                          else deselectAll()
                        }}
                      />
                    </TableHead>
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

                    return (
                      <TableRow key={txn.id}>
                        <TableCell>
                          <Checkbox
                            checked={selectedIds.has(txn.id)}
                            onCheckedChange={() => toggleSelection(txn.id)}
                          />
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          {formatDate(txn.transaction_date)}
                        </TableCell>
                        <TableCell className="max-w-[250px]">
                          <div className="truncate" title={txn.description || txn.memo || ''}>
                            {txn.description || txn.memo || 'No description'}
                          </div>
                          {txn.qb_account && (
                            <div className="text-sm font-medium text-muted-foreground truncate">
                              QB: {txn.qb_account}
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          {txn.account ? (
                            <span className="text-sm">{txn.account.name}</span>
                          ) : (
                            <span className="text-sm font-medium text-muted-foreground">—</span>
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
                              <SelectTrigger className="w-[200px] h-8 text-xs">
                                <SelectValue placeholder="Select category..." />
                              </SelectTrigger>
                              <SelectContent>
                                {allCategoryOptions.map((opt) =>
                                  opt.isParent ? (
                                    <SelectItem
                                      key={opt.id}
                                      value={opt.id}
                                      disabled
                                      className={`font-semibold text-xs ${opt.isHeader ? 'text-primary' : ''}`}
                                    >
                                      {opt.isHeader ? opt.label : `— ${opt.label} —`}
                                    </SelectItem>
                                  ) : (
                                    <SelectItem key={opt.id} value={opt.id} className="text-xs">
                                      {opt.label}
                                    </SelectItem>
                                  )
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
      )}

      {transactions.length === 0 && (
        <Card>
          <CardContent className="py-12">
            <div className="flex flex-col items-center justify-center text-center">
              <CheckCircle2 className="h-12 w-12 text-green-500 mb-4" />
              <h3 className="text-lg font-semibold">All caught up!</h3>
              <p className="text-muted-foreground">
                Every transaction has a category assigned.
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
