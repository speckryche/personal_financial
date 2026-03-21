'use client'

import { useState, useEffect, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { useToast } from '@/components/ui/use-toast'
import {
  Loader2,
  Save,
  RefreshCw,
  AlertCircle,
  Search,
  RotateCcw,
  CheckCircle2,
  XCircle,
} from 'lucide-react'
import type { Category, TransactionType, QBAccountMapping } from '@/types/database'
import { getSubcategoriesForMapping } from '@/lib/category-utils'

interface QBAccountInfo {
  accountName: string
  count: number
  mapping: QBAccountMapping | null
}

interface PendingMapping {
  transaction_type: TransactionType
  category_id: string | null
}

interface QBAccountMappingsProps {
  categories: Category[]
  onMappingsUpdate?: () => void
}

export function QBAccountMappings({ categories, onMappingsUpdate }: QBAccountMappingsProps) {
  const supabase = createClient()
  const { toast } = useToast()

  const [qbAccounts, setQbAccounts] = useState<QBAccountInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [applying, setApplying] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [pendingMappings, setPendingMappings] = useState<Record<string, PendingMapping>>({})
  const [searchQuery, setSearchQuery] = useState('')
  const [showUnmappedOnly, setShowUnmappedOnly] = useState(false)
  const [resetDialogOpen, setResetDialogOpen] = useState(false)

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    setLoading(true)

    // Fetch all unique qb_account names and their counts from transactions
    // Supabase has a hard 1000 row limit per request, so we must paginate with batch size <= 1000
    const accountCounts = new Map<string, number>()
    let offset = 0
    const batchSize = 1000

    let totalFetched = 0
    while (true) {
      const { data: transactions, error: txError } = await supabase
        .from('transactions')
        .select('qb_account')
        .not('qb_account', 'is', null)
        .range(offset, offset + batchSize - 1)

      if (txError) {
        console.error('Error fetching transactions:', txError)
        toast({
          title: 'Error loading accounts',
          description: txError.message,
          variant: 'destructive',
        })
        setLoading(false)
        return
      }

      if (!transactions || transactions.length === 0) {
        break
      }

      totalFetched += transactions.length

      // Count occurrences of each qb_account
      for (const t of transactions) {
        const accountName = t.qb_account?.trim()
        if (!accountName) continue
        accountCounts.set(accountName, (accountCounts.get(accountName) || 0) + 1)
      }

      // If we got fewer than batchSize, we've reached the end
      if (transactions.length < batchSize) {
        break
      }

      offset += batchSize
    }
    console.log(`Total transactions fetched: ${totalFetched}, unique accounts: ${accountCounts.size}`)

    // Fetch existing mappings (use range to avoid default limit)
    const { data: mappings, error: mappingsError } = await supabase
      .from('qb_account_mappings')
      .select('*')
      .range(0, 9999)

    if (mappingsError) {
      toast({
        title: 'Error loading mappings',
        description: mappingsError.message,
        variant: 'destructive',
      })
    }

    // Build mapping lookup
    const mappingLookup = new Map<string, QBAccountMapping>()
    for (const m of mappings || []) {
      mappingLookup.set(m.qb_account_name.toLowerCase().trim(), m)
    }

    // Combine into account info list
    const accountList: QBAccountInfo[] = Array.from(accountCounts.entries()).map(
      ([accountName, count]) => ({
        accountName,
        count,
        mapping: mappingLookup.get(accountName.toLowerCase().trim()) || null,
      })
    )

    // Sort: unmapped first, then by count (descending)
    accountList.sort((a, b) => {
      const aMapped = a.mapping ? 1 : 0
      const bMapped = b.mapping ? 1 : 0
      if (aMapped !== bMapped) return aMapped - bMapped
      return b.count - a.count
    })

    setQbAccounts(accountList)
    setLoading(false)
  }

  const handleMappingChange = (
    accountName: string,
    field: 'transaction_type' | 'category_id',
    value: string
  ) => {
    setPendingMappings((prev) => {
      const existing = prev[accountName] || {
        transaction_type: qbAccounts.find((a) => a.accountName === accountName)?.mapping
          ?.transaction_type || 'expense',
        category_id:
          qbAccounts.find((a) => a.accountName === accountName)?.mapping?.category_id || null,
      }

      if (field === 'transaction_type') {
        return {
          ...prev,
          [accountName]: {
            ...existing,
            transaction_type: value as TransactionType,
            // Clear category if switching to transfer
            category_id: value === 'transfer' ? null : existing.category_id,
          },
        }
      } else {
        return {
          ...prev,
          [accountName]: {
            ...existing,
            category_id: value === 'none' ? null : value,
          },
        }
      }
    })
  }

  const getEffectiveType = (account: QBAccountInfo): TransactionType => {
    if (pendingMappings[account.accountName]) {
      return pendingMappings[account.accountName].transaction_type
    }
    return account.mapping?.transaction_type || 'expense'
  }

  const getEffectiveCategory = (account: QBAccountInfo): string => {
    if (pendingMappings[account.accountName]) {
      return pendingMappings[account.accountName].category_id || 'none'
    }
    return account.mapping?.category_id || 'none'
  }

  const saveMappings = async () => {
    if (Object.keys(pendingMappings).length === 0) return

    setSaving(true)

    try {
      const mappingsToSave = Object.entries(pendingMappings).map(([accountName, mapping]) => ({
        qb_account_name: accountName,
        transaction_type: mapping.transaction_type,
        category_id: mapping.category_id,
      }))

      const response = await fetch('/api/qb-mappings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mappings: mappingsToSave }),
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Failed to save mappings')
      }

      toast({
        title: 'Mappings saved',
        description: `Updated ${result.updated} mapping(s)`,
      })

      setPendingMappings({})
      await loadData()
      onMappingsUpdate?.()
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

  const applyMappings = async () => {
    setApplying(true)

    try {
      const response = await fetch('/api/transactions/apply-mappings', {
        method: 'POST',
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Failed to apply mappings')
      }

      toast({
        title: 'Mappings applied',
        description: `Updated ${result.updated} transaction(s). ${result.unmappedCount} unmapped account(s) remain.`,
      })

      await loadData()
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

  const resetTransactions = async () => {
    setResetting(true)

    try {
      const response = await fetch('/api/transactions/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resetCategories: true, resetTypes: true }),
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Failed to reset transactions')
      }

      toast({
        title: 'Transactions reset',
        description: `Reset ${result.updated} transaction(s) to defaults`,
      })

      setResetDialogOpen(false)
      await loadData()
    } catch (error) {
      toast({
        title: 'Error resetting transactions',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      })
    } finally {
      setResetting(false)
    }
  }

  // Filter accounts based on search and unmapped filter
  const filteredAccounts = useMemo(() => {
    let filtered = qbAccounts

    if (showUnmappedOnly) {
      filtered = filtered.filter((a) => !a.mapping && !pendingMappings[a.accountName])
    }

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      filtered = filtered.filter((a) => a.accountName.toLowerCase().includes(query))
    }

    return filtered
  }, [qbAccounts, showUnmappedOnly, searchQuery, pendingMappings])

  const unmappedCount = qbAccounts.filter((a) => !a.mapping && !pendingMappings[a.accountName]).length
  const hasPendingChanges = Object.keys(pendingMappings).length > 0
  const totalTransactions = qbAccounts.reduce((sum, a) => sum + a.count, 0)

  // Get category name helper
  const getCategoryName = (categoryId: string | null): string => {
    if (!categoryId) return 'None'
    const category = categories.find((c) => c.id === categoryId)
    return category?.name || 'Unknown'
  }


  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Summary Stats */}
      <div className="flex flex-wrap gap-4 text-sm">
        <div className="flex items-center gap-2">
          <Badge variant="outline">{qbAccounts.length} QB Accounts</Badge>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline">{totalTransactions} Transactions</Badge>
        </div>
        {unmappedCount > 0 && (
          <div className="flex items-center gap-2 text-amber-600">
            <AlertCircle className="h-4 w-4" />
            {unmappedCount} unmapped account{unmappedCount !== 1 && 's'}
          </div>
        )}
        {unmappedCount === 0 && (
          <div className="flex items-center gap-2 text-green-600">
            <CheckCircle2 className="h-4 w-4" />
            All accounts mapped
          </div>
        )}
      </div>

      {/* Action Buttons */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setResetDialogOpen(true)}
          >
            <RotateCcw className="mr-2 h-4 w-4" />
            Reset All
          </Button>
        </div>

        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={applyMappings}
            disabled={saving || applying}
          >
            {applying ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            Apply Mappings
          </Button>
          <Button onClick={saveMappings} disabled={saving || !hasPendingChanges}>
            {saving ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            Save Mappings ({Object.keys(pendingMappings).length})
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search QB accounts..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex items-center gap-2">
          <Checkbox
            id="show-unmapped"
            checked={showUnmappedOnly}
            onCheckedChange={(checked) => setShowUnmappedOnly(checked === true)}
          />
          <label htmlFor="show-unmapped" className="text-sm cursor-pointer">
            Show unmapped only ({unmappedCount})
          </label>
        </div>
      </div>

      {/* Mappings Table */}
      {filteredAccounts.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          {qbAccounts.length === 0
            ? 'No QB accounts found. Import transactions first.'
            : 'No accounts match your filters.'}
        </div>
      ) : (
        <div className="border rounded-md">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[40%]">QB Account Name</TableHead>
                <TableHead className="text-right w-[10%]">Txns</TableHead>
                <TableHead className="w-[20%]">Type</TableHead>
                <TableHead className="w-[30%]">Category</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredAccounts.map((account) => {
                const effectiveType = getEffectiveType(account)
                const effectiveCategory = getEffectiveCategory(account)
                const hasPending = !!pendingMappings[account.accountName]
                const isMapped = !!account.mapping || hasPending

                return (
                  <TableRow
                    key={account.accountName}
                    className={
                      hasPending
                        ? 'bg-blue-50/50 dark:bg-blue-950/20'
                        : !isMapped
                        ? 'bg-amber-50/50 dark:bg-amber-950/20'
                        : ''
                    }
                  >
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {isMapped ? (
                          <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                        ) : (
                          <XCircle className="h-4 w-4 text-amber-500 shrink-0" />
                        )}
                        <span className="font-medium truncate" title={account.accountName}>
                          {account.accountName}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {account.count}
                    </TableCell>
                    <TableCell>
                      <Select
                        value={effectiveType}
                        onValueChange={(v) =>
                          handleMappingChange(account.accountName, 'transaction_type', v)
                        }
                      >
                        <SelectTrigger className="w-32">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="income">Income</SelectItem>
                          <SelectItem value="expense">Expense</SelectItem>
                          <SelectItem value="transfer">Transfer</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      {effectiveType === 'transfer' ? (
                        <span className="text-muted-foreground text-sm italic">
                          N/A (transfers excluded)
                        </span>
                      ) : (
                        <Select
                          value={effectiveCategory}
                          onValueChange={(v) =>
                            handleMappingChange(account.accountName, 'category_id', v)
                          }
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Select category..." />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">-- No Category --</SelectItem>
                            {/* EXPENSE categories grouped by parent */}
                            {effectiveType === 'expense' && getSubcategoriesForMapping(categories, 'expense').map((group) => (
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
                            {/* Orphan expense categories (no parent, no children) */}
                            {effectiveType === 'expense' && categories.filter((c) =>
                              c.type === 'expense' &&
                              c.parent_id === null &&
                              !categories.some((child) => child.parent_id === c.id)
                            ).length > 0 && (
                              <>
                                <SelectItem value="__orphan_expense_divider__" disabled>
                                  <span className="text-xs font-semibold">— Other Expense —</span>
                                </SelectItem>
                                {categories
                                  .filter((c) =>
                                    c.type === 'expense' &&
                                    c.parent_id === null &&
                                    !categories.some((child) => child.parent_id === c.id)
                                  )
                                  .map((category) => (
                                    <SelectItem key={category.id} value={category.id}>
                                      {category.name}
                                    </SelectItem>
                                  ))}
                              </>
                            )}
                            {/* INCOME categories grouped by parent */}
                            {effectiveType === 'income' && getSubcategoriesForMapping(categories, 'income').map((group) => (
                              <div key={group.parent.id}>
                                <SelectItem value={`__parent_income_${group.parent.id}__`} disabled>
                                  <span className="text-xs font-semibold">— {group.parent.name} —</span>
                                </SelectItem>
                                {group.subcategories.map((sub) => (
                                  <SelectItem key={sub.id} value={sub.id}>
                                    {sub.name}
                                  </SelectItem>
                                ))}
                              </div>
                            ))}
                            {/* Orphan income categories (no parent, no children) */}
                            {effectiveType === 'income' && categories.filter((c) =>
                              c.type === 'income' &&
                              c.parent_id === null &&
                              !categories.some((child) => child.parent_id === c.id)
                            ).length > 0 && (
                              <>
                                {getSubcategoriesForMapping(categories, 'income').length > 0 && (
                                  <SelectItem value="__orphan_income_divider__" disabled>
                                    <span className="text-xs font-semibold">— Other Income —</span>
                                  </SelectItem>
                                )}
                                {categories
                                  .filter((c) =>
                                    c.type === 'income' &&
                                    c.parent_id === null &&
                                    !categories.some((child) => child.parent_id === c.id)
                                  )
                                  .map((category) => (
                                    <SelectItem key={category.id} value={category.id}>
                                      {category.name}
                                    </SelectItem>
                                  ))}
                              </>
                            )}
                            {/* If no categories of this type at all */}
                            {categories.filter((c) => c.type === effectiveType).length === 0 && (
                              <SelectItem value="__no_cats__" disabled>
                                <span className="text-xs text-muted-foreground">No {effectiveType} categories</span>
                              </SelectItem>
                            )}
                          </SelectContent>
                        </Select>
                      )}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Reset Confirmation Dialog */}
      <AlertDialog open={resetDialogOpen} onOpenChange={setResetDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-amber-500" />
              Reset All Transactions?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will clear all category assignments and reset transaction types to 'expense'
              for all transactions. This action cannot be undone.
              <br />
              <br />
              After resetting, you can use "Apply Mappings" to re-categorize based on your
              QB Account Mappings.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={resetting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={resetTransactions}
              disabled={resetting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {resetting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Reset All
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
