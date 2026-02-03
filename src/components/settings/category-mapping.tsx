'use client'

import { useState, useEffect, useMemo, Fragment } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useToast } from '@/components/ui/use-toast'
import { Loader2, Save, RefreshCw, AlertCircle, ChevronDown, ChevronRight, Link2, Plus } from 'lucide-react'
import type { Category, Transaction } from '@/types/database'
import { getSubcategoriesForMapping } from '@/lib/category-utils'
import { findSimilarAccounts, type SimilarAccount } from '@/lib/string-similarity'

interface QBAccountMapping {
  accountName: string
  count: number
  uncategorizedCount: number
  transactionTypes: string[]
  mappedCategoryId: string | null
  similarUnmapped?: SimilarAccount[]
}

interface CategoryMappingProps {
  categories: Category[]
  onCategoriesUpdate: () => void
}

export function CategoryMapping({ categories, onCategoriesUpdate }: CategoryMappingProps) {
  const supabase = createClient()
  const { toast } = useToast()

  const [qbAccounts, setQbAccounts] = useState<QBAccountMapping[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [applying, setApplying] = useState(false)
  const [recategorizingAll, setRecategorizingAll] = useState(false)
  const [pendingMappings, setPendingMappings] = useState<Record<string, string>>({})
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())
  const [similarModalOpen, setSimilarModalOpen] = useState(false)
  const [selectedAccountForSimilar, setSelectedAccountForSimilar] = useState<QBAccountMapping | null>(null)
  const [selectedSimilarAccounts, setSelectedSimilarAccounts] = useState<Set<string>>(new Set())
  const [addingSimilar, setAddingSimilar] = useState(false)

  // Uncategorized transactions modal state
  const [uncategorizedModalOpen, setUncategorizedModalOpen] = useState(false)
  const [uncategorizedTransactions, setUncategorizedTransactions] = useState<Transaction[]>([])
  const [selectedQBAccountForUncategorized, setSelectedQBAccountForUncategorized] = useState<string | null>(null)
  const [loadingUncategorized, setLoadingUncategorized] = useState(false)
  const [savingCategory, setSavingCategory] = useState<string | null>(null)

  useEffect(() => {
    loadQBAccounts()
  }, [])

  const loadQBAccounts = async () => {
    setLoading(true)

    // Get all unique qb_account values and their counts (Account full name column)
    const { data: transactions, error } = await supabase
      .from('transactions')
      .select('qb_account, qb_transaction_type, category_id')
      .not('qb_account', 'is', null)

    if (error) {
      toast({
        title: 'Error loading QB accounts',
        description: error.message,
        variant: 'destructive',
      })
      setLoading(false)
      return
    }

    // Aggregate the data
    const accountMap = new Map<
      string,
      {
        count: number
        uncategorizedCount: number
        transactionTypes: Set<string>
      }
    >()

    for (const t of transactions || []) {
      const accountName = t.qb_account?.trim()
      if (!accountName) continue

      const existing = accountMap.get(accountName)
      if (existing) {
        existing.count++
        if (!t.category_id) existing.uncategorizedCount++
        if (t.qb_transaction_type) {
          existing.transactionTypes.add(t.qb_transaction_type)
        }
      } else {
        accountMap.set(accountName, {
          count: 1,
          uncategorizedCount: t.category_id ? 0 : 1,
          transactionTypes: new Set(t.qb_transaction_type ? [t.qb_transaction_type] : []),
        })
      }
    }

    // Find which category each QB account is mapped to (if any)
    const qbAccountsWithMappings: QBAccountMapping[] = []

    Array.from(accountMap.entries()).forEach(([accountName, info]) => {
      // Find category that has this QB account in its qb_category_names
      const mappedCategory = categories.find((c) =>
        c.qb_category_names?.some(
          (name) => name.toLowerCase().trim() === accountName.toLowerCase().trim()
        )
      )

      qbAccountsWithMappings.push({
        accountName,
        count: info.count,
        uncategorizedCount: info.uncategorizedCount,
        transactionTypes: Array.from(info.transactionTypes),
        mappedCategoryId: mappedCategory?.id || null,
      })
    })

    // Filter out balance sheet accounts (those starting with numbers like "1505 Credit Card")
    // These are asset/liability accounts from GL imports, not expense categories
    const filteredAccounts = qbAccountsWithMappings.filter(a => {
      // Skip accounts that start with a digit (balance sheet accounts from GL)
      return !/^\d/.test(a.accountName)
    })

    // Sort by uncategorized count (highest first), then by total count
    filteredAccounts.sort((a, b) => {
      if (b.uncategorizedCount !== a.uncategorizedCount) {
        return b.uncategorizedCount - a.uncategorizedCount
      }
      return b.count - a.count
    })

    // For each mapped account, find similar unmapped accounts
    const unmappedNames = filteredAccounts
      .filter((a) => !a.mappedCategoryId)
      .map((a) => a.accountName)

    for (const account of filteredAccounts) {
      if (account.mappedCategoryId) {
        account.similarUnmapped = findSimilarAccounts(account.accountName, unmappedNames, 0.65)
      }
    }

    setQbAccounts(filteredAccounts)
    setLoading(false)
  }

  const handleMappingChange = (accountName: string, categoryId: string) => {
    setPendingMappings((prev) => ({
      ...prev,
      [accountName]: categoryId === 'none' ? '' : categoryId,
    }))
  }

  const saveMappings = async () => {
    setSaving(true)

    try {
      // Group mappings by category
      const categoryUpdates = new Map<string, string[]>()

      // First, get current qb_category_names for all affected categories
      const affectedCategoryIds = new Set<string>()

      for (const [accountName, categoryId] of Object.entries(pendingMappings)) {
        if (categoryId) {
          affectedCategoryIds.add(categoryId)
        }
        // Also need to remove from previous category
        const previousMapping = qbAccounts.find((a) => a.accountName === accountName)
        if (previousMapping?.mappedCategoryId) {
          affectedCategoryIds.add(previousMapping.mappedCategoryId)
        }
      }

      // Fetch current state of affected categories
      const { data: currentCategories } = await supabase
        .from('categories')
        .select('id, qb_category_names')
        .in('id', Array.from(affectedCategoryIds))

      // Build update map starting from current state
      const categoryNamesMap = new Map<string, Set<string>>()
      for (const cat of currentCategories || []) {
        categoryNamesMap.set(cat.id, new Set(cat.qb_category_names || []))
      }

      // Process each pending mapping
      for (const [accountName, newCategoryId] of Object.entries(pendingMappings)) {
        // Find previous category (if any)
        const previousMapping = qbAccounts.find((a) => a.accountName === accountName)

        // Remove from previous category
        if (previousMapping?.mappedCategoryId && previousMapping.mappedCategoryId !== newCategoryId) {
          const prevNames = categoryNamesMap.get(previousMapping.mappedCategoryId) || new Set<string>()
          // Remove case-insensitive
          Array.from(prevNames).forEach((name) => {
            if (name.toLowerCase().trim() === accountName.toLowerCase().trim()) {
              prevNames.delete(name)
            }
          })
          categoryNamesMap.set(previousMapping.mappedCategoryId, prevNames)
        }

        // Add to new category
        if (newCategoryId) {
          const newNames = categoryNamesMap.get(newCategoryId) || new Set()
          newNames.add(accountName)
          categoryNamesMap.set(newCategoryId, newNames)
        }
      }

      // Execute updates
      for (const entry of Array.from(categoryNamesMap.entries())) {
        const [categoryId, names] = entry
        const { error } = await supabase
          .from('categories')
          .update({ qb_category_names: Array.from(names) })
          .eq('id', categoryId)

        if (error) {
          throw error
        }
      }

      toast({
        title: 'Mappings saved',
        description: `Updated ${Object.keys(pendingMappings).length} mapping(s)`,
      })

      setPendingMappings({})
      onCategoriesUpdate()
      await loadQBAccounts()
    } catch (error) {
      toast({
        title: 'Error saving mappings',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  const applyMappingsToExisting = async () => {
    setApplying(true)

    try {
      const response = await fetch('/api/transactions/categorize', {
        method: 'POST',
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Failed to apply mappings')
      }

      toast({
        title: 'Mappings applied',
        description: `Categorized ${result.categorized} transaction(s)`,
      })

      await loadQBAccounts()
    } catch (error) {
      toast({
        title: 'Error applying mappings',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      })
    } finally {
      setApplying(false)
    }
  }

  const recategorizeAllTransactions = async () => {
    setRecategorizingAll(true)

    try {
      const response = await fetch('/api/transactions/categorize?all=true', {
        method: 'POST',
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Failed to re-categorize')
      }

      toast({
        title: 'All transactions re-categorized',
        description: `Updated ${result.categorized} of ${result.total} transaction(s)`,
      })

      await loadQBAccounts()
    } catch (error) {
      toast({
        title: 'Error re-categorizing',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      })
    } finally {
      setRecategorizingAll(false)
    }
  }

  const getEffectiveMapping = (account: QBAccountMapping): string => {
    if (pendingMappings[account.accountName] !== undefined) {
      return pendingMappings[account.accountName] || 'none'
    }
    return account.mappedCategoryId || 'none'
  }

  const toggleRowExpanded = (accountName: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev)
      if (next.has(accountName)) {
        next.delete(accountName)
      } else {
        next.add(accountName)
      }
      return next
    })
  }

  const openSimilarModal = (account: QBAccountMapping) => {
    setSelectedAccountForSimilar(account)
    setSelectedSimilarAccounts(new Set())
    setSimilarModalOpen(true)
  }

  const toggleSimilarSelection = (name: string) => {
    setSelectedSimilarAccounts((prev) => {
      const next = new Set(prev)
      if (next.has(name)) {
        next.delete(name)
      } else {
        next.add(name)
      }
      return next
    })
  }

  const addSimilarToMapping = async () => {
    if (!selectedAccountForSimilar?.mappedCategoryId || selectedSimilarAccounts.size === 0) return

    setAddingSimilar(true)

    try {
      // Get current category's qb_category_names
      const { data: category } = await supabase
        .from('categories')
        .select('qb_category_names')
        .eq('id', selectedAccountForSimilar.mappedCategoryId)
        .single()

      const currentNames = new Set(category?.qb_category_names || [])

      // Add selected similar accounts
      Array.from(selectedSimilarAccounts).forEach((name) => {
        currentNames.add(name)
      })

      // Update category
      const { error } = await supabase
        .from('categories')
        .update({ qb_category_names: Array.from(currentNames) })
        .eq('id', selectedAccountForSimilar.mappedCategoryId)

      if (error) throw error

      toast({
        title: 'Similar accounts added',
        description: `Added ${selectedSimilarAccounts.size} account(s) to the mapping`,
      })

      setSimilarModalOpen(false)
      setSelectedAccountForSimilar(null)
      setSelectedSimilarAccounts(new Set())
      onCategoriesUpdate()
      await loadQBAccounts()
    } catch (error) {
      toast({
        title: 'Error adding similar accounts',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      })
    } finally {
      setAddingSimilar(false)
    }
  }

  const quickAddSimilar = async (mappedAccount: QBAccountMapping, similarName: string) => {
    if (!mappedAccount.mappedCategoryId) return

    try {
      const { data: category } = await supabase
        .from('categories')
        .select('qb_category_names')
        .eq('id', mappedAccount.mappedCategoryId)
        .single()

      const currentNames = new Set(category?.qb_category_names || [])
      currentNames.add(similarName)

      const { error } = await supabase
        .from('categories')
        .update({ qb_category_names: Array.from(currentNames) })
        .eq('id', mappedAccount.mappedCategoryId)

      if (error) throw error

      toast({
        title: 'Account added to mapping',
        description: `"${similarName}" now maps to the same category`,
      })

      onCategoriesUpdate()
      await loadQBAccounts()
    } catch (error) {
      toast({
        title: 'Error adding account',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      })
    }
  }

  const getCategoryName = (categoryId: string | null): string => {
    if (!categoryId) return 'Uncategorized'
    const category = categories.find((c) => c.id === categoryId)
    return category?.name || 'Unknown'
  }

  const openUncategorizedModal = async (qbAccountName: string) => {
    setSelectedQBAccountForUncategorized(qbAccountName)
    setLoadingUncategorized(true)
    setUncategorizedModalOpen(true)

    const { data: transactions } = await supabase
      .from('transactions')
      .select('*')
      .eq('qb_account', qbAccountName)
      .is('category_id', null)
      .order('transaction_date', { ascending: false })

    setUncategorizedTransactions(transactions || [])
    setLoadingUncategorized(false)
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount)
  }

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  }

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
      // Remove from local list
      setUncategorizedTransactions((prev) => prev.filter((t) => t.id !== transactionId))
      toast({
        title: 'Category assigned',
        description: 'Transaction has been categorized.',
      })
      // Refresh the main list
      await loadQBAccounts()
    }

    setSavingCategory(null)
  }

  const assignCategoryToAllInModal = async (categoryId: string) => {
    if (categoryId === 'none' || uncategorizedTransactions.length === 0) return

    setSavingCategory('all')

    const transactionIds = uncategorizedTransactions.map((t) => t.id)

    const { error } = await supabase
      .from('transactions')
      .update({ category_id: categoryId })
      .in('id', transactionIds)

    if (error) {
      toast({
        title: 'Error assigning category',
        description: error.message,
        variant: 'destructive',
      })
    } else {
      toast({
        title: 'Categories assigned',
        description: `${transactionIds.length} transaction(s) have been categorized.`,
      })
      setUncategorizedTransactions([])
      await loadQBAccounts()
    }

    setSavingCategory(null)
  }

  const totalUncategorized = qbAccounts.reduce((sum, a) => sum + a.uncategorizedCount, 0)
  const hasPendingChanges = Object.keys(pendingMappings).length > 0
  const totalSimilarUnmapped = qbAccounts.reduce(
    (sum, a) => sum + (a.similarUnmapped?.length || 0),
    0
  )

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground">
            Map QuickBooks account names to your categories. Transactions will be automatically
            categorized on import.
          </p>
          {totalUncategorized > 0 && (
            <div className="flex items-center gap-2 text-sm text-amber-600">
              <AlertCircle className="h-4 w-4" />
              {totalUncategorized} uncategorized transaction{totalUncategorized !== 1 && 's'}
            </div>
          )}
          {totalSimilarUnmapped > 0 && (
            <div className="flex items-center gap-2 text-sm text-blue-600">
              <Link2 className="h-4 w-4" />
              {totalSimilarUnmapped} similar unmapped account{totalSimilarUnmapped !== 1 && 's'} detected
            </div>
          )}
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={applyMappingsToExisting}
            disabled={applying || recategorizingAll || totalUncategorized === 0}
          >
            {applying ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            Apply to Uncategorized
          </Button>
          <Button
            variant="outline"
            onClick={recategorizeAllTransactions}
            disabled={applying || recategorizingAll || qbAccounts.length === 0}
          >
            {recategorizingAll ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            Re-categorize All
          </Button>
          <Button onClick={saveMappings} disabled={saving || !hasPendingChanges}>
            {saving ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            Save Mappings
          </Button>
        </div>
      </div>

      {qbAccounts.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          No QuickBooks accounts found. Import some transactions first.
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8"></TableHead>
              <TableHead>QuickBooks Account</TableHead>
              <TableHead>Transaction Types</TableHead>
              <TableHead className="text-right">Count</TableHead>
              <TableHead className="text-right">Uncategorized</TableHead>
              <TableHead>Mapped Category</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {qbAccounts.map((account) => {
              const hasSimilar = (account.similarUnmapped?.length || 0) > 0
              const isExpanded = expandedRows.has(account.accountName)

              return (
                <Fragment key={account.accountName}>
                  <TableRow
                    className={account.uncategorizedCount > 0 ? 'bg-amber-50/50 dark:bg-amber-950/20' : ''}
                  >
                    <TableCell className="w-8 pr-0">
                      {hasSimilar && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0"
                          onClick={() => toggleRowExpanded(account.accountName)}
                        >
                          {isExpanded ? (
                            <ChevronDown className="h-4 w-4" />
                          ) : (
                            <ChevronRight className="h-4 w-4" />
                          )}
                        </Button>
                      )}
                    </TableCell>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        {account.accountName}
                        {hasSimilar && (
                          <Badge
                            variant="outline"
                            className="text-xs text-blue-600 border-blue-300 cursor-pointer hover:bg-blue-50"
                            onClick={() => openSimilarModal(account)}
                          >
                            <Link2 className="h-3 w-3 mr-1" />
                            {account.similarUnmapped?.length} similar
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {account.transactionTypes.slice(0, 3).map((type) => (
                          <Badge key={type} variant="secondary" className="text-xs">
                            {type}
                          </Badge>
                        ))}
                        {account.transactionTypes.length > 3 && (
                          <Badge variant="secondary" className="text-xs">
                            +{account.transactionTypes.length - 3}
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">{account.count}</TableCell>
                    <TableCell className="text-right">
                      {account.uncategorizedCount > 0 ? (
                        <button
                          onClick={() => openUncategorizedModal(account.accountName)}
                          className="text-amber-600 font-medium hover:underline cursor-pointer"
                        >
                          {account.uncategorizedCount}
                        </button>
                      ) : (
                        <span className="text-muted-foreground">0</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Select
                        value={getEffectiveMapping(account)}
                        onValueChange={(value) => handleMappingChange(account.accountName, value)}
                      >
                        <SelectTrigger className="w-48">
                          <SelectValue placeholder="Select category" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">-- Uncategorized --</SelectItem>
                          {/* Expense subcategories grouped by parent */}
                          {getSubcategoriesForMapping(categories, 'expense').map((group) => (
                            <div key={group.parent.id}>
                              <SelectItem value={`__parent_${group.parent.id}__`} disabled>
                                <span className="text-xs font-semibold">— {group.parent.name} —</span>
                              </SelectItem>
                              {group.subcategories.map((sub) => (
                                <SelectItem key={sub.id} value={sub.id}>
                                  {sub.name}
                                </SelectItem>
                              ))}
                            </div>
                          ))}
                          {/* Also show orphan expense categories (no parent) for backward compatibility */}
                          {categories.filter((c) => c.type === 'expense' && c.parent_id === null &&
                            !categories.some((child) => child.parent_id === c.id)
                          ).length > 0 && (
                            <>
                              <SelectItem value="__orphan_expense_divider__" disabled>
                                <span className="text-xs font-semibold">— Other Expense —</span>
                              </SelectItem>
                              {categories
                                .filter((c) => c.type === 'expense' && c.parent_id === null &&
                                  !categories.some((child) => child.parent_id === c.id)
                                )
                                .map((category) => (
                                  <SelectItem key={category.id} value={category.id}>
                                    {category.name}
                                  </SelectItem>
                                ))}
                            </>
                          )}
                          {/* Income subcategories grouped by parent */}
                          {getSubcategoriesForMapping(categories, 'income').length > 0 && (
                            <>
                              <SelectItem value="__income_divider__" disabled>
                                <span className="text-xs font-semibold">━━━ INCOME ━━━</span>
                              </SelectItem>
                              {getSubcategoriesForMapping(categories, 'income').map((group) => (
                                <div key={group.parent.id}>
                                  <SelectItem value={`__parent_${group.parent.id}__`} disabled>
                                    <span className="text-xs font-semibold">— {group.parent.name} —</span>
                                  </SelectItem>
                                  {group.subcategories.map((sub) => (
                                    <SelectItem key={sub.id} value={sub.id}>
                                      {sub.name}
                                    </SelectItem>
                                  ))}
                                </div>
                              ))}
                            </>
                          )}
                          {/* Also show orphan income categories for backward compatibility */}
                          {categories.filter((c) => c.type === 'income' && c.parent_id === null &&
                            !categories.some((child) => child.parent_id === c.id)
                          ).length > 0 && (
                            <>
                              <SelectItem value="__orphan_income_divider__" disabled>
                                <span className="text-xs font-semibold">— Other Income —</span>
                              </SelectItem>
                              {categories
                                .filter((c) => c.type === 'income' && c.parent_id === null &&
                                  !categories.some((child) => child.parent_id === c.id)
                                )
                                .map((category) => (
                                  <SelectItem key={category.id} value={category.id}>
                                    {category.name}
                                  </SelectItem>
                                ))}
                            </>
                          )}
                        </SelectContent>
                      </Select>
                    </TableCell>
                  </TableRow>
                  {/* Expanded similar accounts rows */}
                  {isExpanded && hasSimilar && account.similarUnmapped?.map((similar) => (
                    <TableRow
                      key={`${account.accountName}-similar-${similar.name}`}
                      className="bg-blue-50/50 dark:bg-blue-950/20"
                    >
                      <TableCell></TableCell>
                      <TableCell colSpan={4} className="pl-8">
                        <div className="flex items-center gap-3 text-sm">
                          <span className="text-blue-600">↳</span>
                          <span className="text-muted-foreground">Similar:</span>
                          <span className="font-medium">{similar.name}</span>
                          <Badge variant="outline" className="text-xs">
                            {Math.round(similar.similarity * 100)}% match
                          </Badge>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => quickAddSimilar(account, similar.name)}
                        >
                          <Plus className="h-3 w-3 mr-1" />
                          Add to same mapping
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </Fragment>
              )
            })}
          </TableBody>
        </Table>
      )}

      {/* Similar Accounts Modal */}
      <Dialog open={similarModalOpen} onOpenChange={setSimilarModalOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Similar Unmapped Accounts</DialogTitle>
            <DialogDescription>
              These accounts appear similar to &quot;{selectedAccountForSimilar?.accountName}&quot;
              which is mapped to <strong>{getCategoryName(selectedAccountForSimilar?.mappedCategoryId || null)}</strong>.
              Select accounts to add to the same mapping.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 max-h-64 overflow-y-auto">
            {selectedAccountForSimilar?.similarUnmapped?.map((similar) => (
              <div
                key={similar.name}
                className="flex items-center gap-3 p-2 rounded-md hover:bg-muted/50"
              >
                <Checkbox
                  id={`similar-${similar.name}`}
                  checked={selectedSimilarAccounts.has(similar.name)}
                  onCheckedChange={() => toggleSimilarSelection(similar.name)}
                />
                <label
                  htmlFor={`similar-${similar.name}`}
                  className="flex-1 text-sm cursor-pointer"
                >
                  {similar.name}
                </label>
                <Badge variant="outline" className="text-xs">
                  {Math.round(similar.similarity * 100)}% match
                </Badge>
              </div>
            ))}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setSimilarModalOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={addSimilarToMapping}
              disabled={selectedSimilarAccounts.size === 0 || addingSimilar}
            >
              {addingSimilar ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Plus className="mr-2 h-4 w-4" />
              )}
              Add {selectedSimilarAccounts.size} Account{selectedSimilarAccounts.size !== 1 && 's'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Uncategorized Transactions Modal */}
      <Dialog open={uncategorizedModalOpen} onOpenChange={setUncategorizedModalOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Uncategorized Transactions</DialogTitle>
            <DialogDescription>
              {uncategorizedTransactions.length} uncategorized transaction{uncategorizedTransactions.length !== 1 && 's'} for &quot;{selectedQBAccountForUncategorized}&quot;
            </DialogDescription>
          </DialogHeader>

          {/* Bulk categorize option */}
          {uncategorizedTransactions.length > 0 && (
            <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
              <span className="text-sm font-medium">Categorize all as:</span>
              <Select
                onValueChange={(value) => assignCategoryToAllInModal(value)}
                disabled={savingCategory === 'all'}
              >
                <SelectTrigger className="w-56">
                  <SelectValue placeholder="Select category..." />
                </SelectTrigger>
                <SelectContent>
                  {getSubcategoriesForMapping(categories, 'expense').map((group) => (
                    <div key={group.parent.id}>
                      <SelectItem value={`__parent_${group.parent.id}__`} disabled>
                        <span className="text-xs font-semibold">— {group.parent.name} —</span>
                      </SelectItem>
                      {group.subcategories.map((sub) => (
                        <SelectItem key={sub.id} value={sub.id}>
                          {sub.name}
                        </SelectItem>
                      ))}
                    </div>
                  ))}
                  {getSubcategoriesForMapping(categories, 'income').length > 0 && (
                    <>
                      <SelectItem value="__income_divider__" disabled>
                        <span className="text-xs font-semibold">━━━ INCOME ━━━</span>
                      </SelectItem>
                      {getSubcategoriesForMapping(categories, 'income').map((group) => (
                        <div key={group.parent.id}>
                          <SelectItem value={`__parent_${group.parent.id}__`} disabled>
                            <span className="text-xs font-semibold">— {group.parent.name} —</span>
                          </SelectItem>
                          {group.subcategories.map((sub) => (
                            <SelectItem key={sub.id} value={sub.id}>
                              {sub.name}
                            </SelectItem>
                          ))}
                        </div>
                      ))}
                    </>
                  )}
                </SelectContent>
              </Select>
              {savingCategory === 'all' && <Loader2 className="h-4 w-4 animate-spin" />}
            </div>
          )}

          <div className="flex-1 overflow-y-auto min-h-0">
            {loadingUncategorized ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : uncategorizedTransactions.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No uncategorized transactions found.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Split Account</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Assign Category</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {uncategorizedTransactions.map((txn) => (
                    <TableRow key={txn.id}>
                      <TableCell className="text-sm whitespace-nowrap">
                        {formatDate(txn.transaction_date)}
                      </TableCell>
                      <TableCell className="text-sm max-w-[180px] truncate" title={txn.description || txn.memo || ''}>
                        {txn.description || txn.memo || txn.qb_name || 'No description'}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-[120px] truncate" title={txn.split_account || ''}>
                        {txn.split_account || '—'}
                      </TableCell>
                      <TableCell className={`text-right font-medium whitespace-nowrap ${
                        Number(txn.amount) >= 0 ? 'text-green-600' : 'text-red-500'
                      }`}>
                        {formatCurrency(Number(txn.amount))}
                      </TableCell>
                      <TableCell>
                        <Select
                          onValueChange={(value) => assignCategoryToTransaction(txn.id, value)}
                          disabled={savingCategory === txn.id}
                        >
                          <SelectTrigger className="w-40 h-8 text-xs">
                            <SelectValue placeholder="Select..." />
                          </SelectTrigger>
                          <SelectContent>
                            {getSubcategoriesForMapping(categories, 'expense').map((group) => (
                              <div key={group.parent.id}>
                                <SelectItem value={`__parent_${group.parent.id}__`} disabled>
                                  <span className="text-xs font-semibold">— {group.parent.name} —</span>
                                </SelectItem>
                                {group.subcategories.map((sub) => (
                                  <SelectItem key={sub.id} value={sub.id}>
                                    {sub.name}
                                  </SelectItem>
                                ))}
                              </div>
                            ))}
                            {getSubcategoriesForMapping(categories, 'income').length > 0 && (
                              <>
                                <SelectItem value="__income_divider__" disabled>
                                  <span className="text-xs font-semibold">━━━ INCOME ━━━</span>
                                </SelectItem>
                                {getSubcategoriesForMapping(categories, 'income').map((group) => (
                                  <div key={group.parent.id}>
                                    <SelectItem value={`__parent_${group.parent.id}__`} disabled>
                                      <span className="text-xs font-semibold">— {group.parent.name} —</span>
                                    </SelectItem>
                                    {group.subcategories.map((sub) => (
                                      <SelectItem key={sub.id} value={sub.id}>
                                        {sub.name}
                                      </SelectItem>
                                    ))}
                                  </div>
                                ))}
                              </>
                            )}
                          </SelectContent>
                        </Select>
                        {savingCategory === txn.id && <Loader2 className="inline ml-2 h-3 w-3 animate-spin" />}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setUncategorizedModalOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
