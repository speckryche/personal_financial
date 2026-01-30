'use client'

import { useState, useEffect } from 'react'
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
import { useToast } from '@/components/ui/use-toast'
import { Loader2, Save, RefreshCw, AlertCircle } from 'lucide-react'
import type { Category } from '@/types/database'

interface QBAccountMapping {
  accountName: string
  count: number
  uncategorizedCount: number
  transactionTypes: string[]
  mappedCategoryId: string | null
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
  const [pendingMappings, setPendingMappings] = useState<Record<string, string>>({})

  useEffect(() => {
    loadQBAccounts()
  }, [])

  const loadQBAccounts = async () => {
    setLoading(true)

    // Get all unique qb_split values and their counts
    const { data: transactions, error } = await supabase
      .from('transactions')
      .select('qb_split, qb_transaction_type, category_id')
      .not('qb_split', 'is', null)

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
      const accountName = t.qb_split?.trim()
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

    // Sort by uncategorized count (highest first), then by total count
    qbAccountsWithMappings.sort((a, b) => {
      if (b.uncategorizedCount !== a.uncategorizedCount) {
        return b.uncategorizedCount - a.uncategorizedCount
      }
      return b.count - a.count
    })

    setQbAccounts(qbAccountsWithMappings)
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

  const getEffectiveMapping = (account: QBAccountMapping): string => {
    if (pendingMappings[account.accountName] !== undefined) {
      return pendingMappings[account.accountName] || 'none'
    }
    return account.mappedCategoryId || 'none'
  }

  const totalUncategorized = qbAccounts.reduce((sum, a) => sum + a.uncategorizedCount, 0)
  const hasPendingChanges = Object.keys(pendingMappings).length > 0

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
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={applyMappingsToExisting}
            disabled={applying || totalUncategorized === 0}
          >
            {applying ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            Apply to Existing
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
              <TableHead>QuickBooks Account</TableHead>
              <TableHead>Transaction Types</TableHead>
              <TableHead className="text-right">Count</TableHead>
              <TableHead className="text-right">Uncategorized</TableHead>
              <TableHead>Mapped Category</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {qbAccounts.map((account) => (
              <TableRow
                key={account.accountName}
                className={account.uncategorizedCount > 0 ? 'bg-amber-50/50 dark:bg-amber-950/20' : ''}
              >
                <TableCell className="font-medium">{account.accountName}</TableCell>
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
                    <span className="text-amber-600 font-medium">{account.uncategorizedCount}</span>
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
                      {categories
                        .filter((c) => c.type === 'expense')
                        .map((category) => (
                          <SelectItem key={category.id} value={category.id}>
                            {category.name}
                          </SelectItem>
                        ))}
                      {categories.filter((c) => c.type === 'income').length > 0 && (
                        <>
                          <SelectItem value="__income_divider__" disabled>
                            --- Income ---
                          </SelectItem>
                          {categories
                            .filter((c) => c.type === 'income')
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
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  )
}
