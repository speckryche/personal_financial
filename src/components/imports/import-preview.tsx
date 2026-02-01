'use client'

import { useState } from 'react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Plus } from 'lucide-react'
import { formatCurrencyDetailed, formatDate } from '@/lib/utils'
import { getSubcategoriesForMapping } from '@/lib/category-utils'
import type { ParsedTransaction } from '@/lib/parsers/quickbooks/transaction-parser'
import type { ParsedInvestment } from '@/lib/parsers/quickbooks/investment-parser'

interface CategoryInfo {
  id: string
  name: string
  type: 'income' | 'expense' | 'transfer'
  parent_id?: string | null
}

// Separate component for category mapping to handle dialog state
function CategoryMappingSection({
  uniqueAccounts,
  unmappedAccounts,
  categories,
  getEffectiveCategoryMapping,
  onCategoryMappingChange,
  onCreateCategory,
}: {
  uniqueAccounts: [string, number][]
  unmappedAccounts: [string, number][]
  categories: CategoryInfo[]
  getEffectiveCategoryMapping: (account: string) => string | null
  onCategoryMappingChange?: (qbAccount: string, categoryId: string | null) => void
  onCreateCategory?: (name: string, type: 'income' | 'expense') => Promise<string | null>
}) {
  const [dialogOpen, setDialogOpen] = useState(false)
  const [pendingAccount, setPendingAccount] = useState<string | null>(null)
  const [newCategoryName, setNewCategoryName] = useState('')
  const [newCategoryType, setNewCategoryType] = useState<'income' | 'expense'>('expense')
  const [isCreating, setIsCreating] = useState(false)

  const handleAddCategory = (account: string) => {
    setPendingAccount(account)
    setNewCategoryName('')
    setNewCategoryType('expense')
    setDialogOpen(true)
  }

  const handleCreateCategory = async () => {
    if (!newCategoryName.trim() || !onCreateCategory || !pendingAccount) return

    setIsCreating(true)
    const newCategoryId = await onCreateCategory(newCategoryName.trim(), newCategoryType)
    setIsCreating(false)

    if (newCategoryId && onCategoryMappingChange) {
      // Auto-assign the new category to the pending account
      onCategoryMappingChange(pendingAccount.toLowerCase(), newCategoryId)
    }

    setDialogOpen(false)
    setPendingAccount(null)
  }

  if (uniqueAccounts.length === 0) return null

  // Show message if no categories exist yet
  if (categories.length === 0) {
    return (
      <div className="rounded-lg border bg-muted/30 p-4">
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-sm font-medium">
            QB Accounts Found ({uniqueAccounts.length})
          </h4>
          {onCreateCategory && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setPendingAccount(uniqueAccounts[0]?.[0] || null)
                setNewCategoryName('')
                setNewCategoryType('expense')
                setDialogOpen(true)
              }}
            >
              <Plus className="h-4 w-4 mr-1" />
              Add Category
            </Button>
          )}
        </div>
        <p className="text-xs text-muted-foreground mb-3">
          Create categories to enable category mapping.
        </p>
        <div className="flex flex-wrap gap-2">
          {uniqueAccounts.slice(0, 20).map(([account, count]) => (
            <Badge key={account} variant="secondary" className="text-xs">
              {account} ({count})
            </Badge>
          ))}
          {uniqueAccounts.length > 20 && (
            <Badge variant="outline" className="text-xs">
              +{uniqueAccounts.length - 20} more
            </Badge>
          )}
        </div>

        {/* Add Category Dialog */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add New Category</DialogTitle>
              <DialogDescription>
                Create a new category for organizing your transactions.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="category-name">Category Name</Label>
                <Input
                  id="category-name"
                  placeholder="e.g., Utilities, Office Supplies"
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && newCategoryName.trim()) {
                      handleCreateCategory()
                    }
                  }}
                />
              </div>
              <div className="space-y-2">
                <Label>Type</Label>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant={newCategoryType === 'expense' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setNewCategoryType('expense')}
                  >
                    Expense
                  </Button>
                  <Button
                    type="button"
                    variant={newCategoryType === 'income' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setNewCategoryType('income')}
                  >
                    Income
                  </Button>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleCreateCategory} disabled={!newCategoryName.trim() || isCreating}>
                {isCreating ? 'Creating...' : 'Create Category'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    )
  }

  return (
    <>
      <div className={`rounded-lg border p-4 ${unmappedAccounts.length > 0 ? 'border-blue-500/50 bg-blue-50 dark:bg-blue-950/20' : 'bg-muted/30'}`}>
        <div className="flex items-center gap-2 mb-2">
          <span className="font-medium text-sm">
            {unmappedAccounts.length > 0
              ? `Map QB Accounts to Categories (${unmappedAccounts.length} unmapped)`
              : 'QB Account Mappings'
            }
          </span>
        </div>
        {unmappedAccounts.length > 0 && (
          <p className="text-xs text-blue-600 dark:text-blue-300 mb-3">
            Optionally map QB accounts to categories for automatic categorization.
          </p>
        )}
        <div className="space-y-2 max-h-[300px] overflow-y-auto">
          {uniqueAccounts.map(([account, count]) => {
            const effectiveMapping = getEffectiveCategoryMapping(account)
            return (
              <div key={account} className="flex items-center gap-3">
                <span className="text-sm min-w-[200px] truncate" title={account}>
                  {account}
                  <span className="text-muted-foreground ml-1">({count})</span>
                </span>
                <Select
                  value={effectiveMapping || 'unmapped'}
                  onValueChange={(value) => {
                    if (value === '__add_new__') {
                      handleAddCategory(account)
                    } else if (onCategoryMappingChange) {
                      onCategoryMappingChange(
                        account.toLowerCase(),
                        value === 'unmapped' ? null : value
                      )
                    }
                  }}
                >
                  <SelectTrigger className={`w-48 h-8 ${!effectiveMapping ? 'border-blue-500/50' : ''}`}>
                    <SelectValue placeholder="Select category..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unmapped">
                      <span className="text-muted-foreground">-- No Category --</span>
                    </SelectItem>
                    {/* Expense subcategories grouped by parent */}
                    {getSubcategoriesForMapping(categories as any, 'expense').map((group) => (
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
                    {/* Orphan expense categories for backward compatibility */}
                    {categories.filter(c => c.type === 'expense' && !c.parent_id &&
                      !categories.some(child => child.parent_id === c.id)
                    ).length > 0 && (
                      <>
                        <SelectItem value="__orphan_expense_header__" disabled>
                          <span className="text-xs font-semibold">— Other Expense —</span>
                        </SelectItem>
                        {categories.filter(c => c.type === 'expense' && !c.parent_id &&
                          !categories.some(child => child.parent_id === c.id)
                        ).map(cat => (
                          <SelectItem key={cat.id} value={cat.id}>
                            {cat.name}
                          </SelectItem>
                        ))}
                      </>
                    )}
                    {/* Income subcategories grouped by parent */}
                    {getSubcategoriesForMapping(categories as any, 'income').length > 0 && (
                      <>
                        <SelectItem value="__income_divider__" disabled>
                          <span className="text-xs font-semibold">━━━ INCOME ━━━</span>
                        </SelectItem>
                        {getSubcategoriesForMapping(categories as any, 'income').map((group) => (
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
                    {/* Orphan income categories for backward compatibility */}
                    {categories.filter(c => c.type === 'income' && !c.parent_id &&
                      !categories.some(child => child.parent_id === c.id)
                    ).length > 0 && (
                      <>
                        <SelectItem value="__orphan_income_header__" disabled>
                          <span className="text-xs font-semibold">— Other Income —</span>
                        </SelectItem>
                        {categories.filter(c => c.type === 'income' && !c.parent_id &&
                          !categories.some(child => child.parent_id === c.id)
                        ).map(cat => (
                          <SelectItem key={cat.id} value={cat.id}>
                            {cat.name}
                          </SelectItem>
                        ))}
                      </>
                    )}
                    {onCreateCategory && (
                      <>
                        <SelectItem value="__divider__" disabled>
                          <span className="text-xs">───────────</span>
                        </SelectItem>
                        <SelectItem value="__add_new__">
                          <span className="flex items-center text-primary">
                            <Plus className="h-3 w-3 mr-1" />
                            Add New Category
                          </span>
                        </SelectItem>
                      </>
                    )}
                  </SelectContent>
                </Select>
              </div>
            )
          })}
        </div>
      </div>

      {/* Add Category Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add New Category</DialogTitle>
            <DialogDescription>
              Create a new category{pendingAccount ? ` for "${pendingAccount}"` : ''}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="category-name">Category Name</Label>
              <Input
                id="category-name"
                placeholder="e.g., Utilities, Office Supplies"
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newCategoryName.trim()) {
                    handleCreateCategory()
                  }
                }}
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label>Type</Label>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant={newCategoryType === 'expense' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setNewCategoryType('expense')}
                >
                  Expense
                </Button>
                <Button
                  type="button"
                  variant={newCategoryType === 'income' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setNewCategoryType('income')}
                >
                  Income
                </Button>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateCategory} disabled={!newCategoryName.trim() || isCreating}>
              {isCreating ? 'Creating...' : 'Create & Assign'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

interface TransactionPreviewProps {
  type: 'transactions'
  data: ParsedTransaction[]
  limit?: number
  overrideTransactionType?: 'income' | 'expense'
  typeMappings?: Map<string, 'income' | 'expense'>
  onTypeMappingChange?: (qbType: string, mappedType: 'income' | 'expense') => void
  pendingTypeMappings?: Record<string, 'income' | 'expense'>
  // Category mapping props
  categories?: CategoryInfo[]
  categoryMappings?: Map<string, string> // qbAccount -> categoryId
  onCategoryMappingChange?: (qbAccount: string, categoryId: string | null) => void
  pendingCategoryMappings?: Record<string, string | null>
  onCreateCategory?: (name: string, type: 'income' | 'expense') => Promise<string | null> // Returns new category ID
}

interface InvestmentPreviewProps {
  type: 'investments'
  data: ParsedInvestment[]
  limit?: number
}

type ImportPreviewProps = TransactionPreviewProps | InvestmentPreviewProps

export function ImportPreview(props: ImportPreviewProps) {
  const limit = props.limit || 10

  if (props.type === 'transactions') {
    const transactions = props.data.slice(0, limit)
    const displayType = props.overrideTransactionType
    const typeMappings = props.typeMappings || new Map()
    const pendingMappings = props.pendingTypeMappings || {}

    // Helper to get transaction type from mappings (check pending first, then saved)
    const getTransactionType = (t: ParsedTransaction) => {
      if (displayType) return { type: displayType, isMapped: true }
      const qbType = t.qb_transaction_type?.toLowerCase() || ''
      // Check pending mappings first (user selections in this session)
      if (pendingMappings[qbType]) {
        return { type: pendingMappings[qbType], isMapped: true }
      }
      const mappedType = typeMappings.get(qbType)
      if (mappedType) return { type: mappedType, isMapped: true }
      return { type: t.transaction_type, isMapped: false }
    }

    // Get effective mapping for a type (pending or saved)
    const getEffectiveMapping = (qbType: string): 'income' | 'expense' | null => {
      const lower = qbType.toLowerCase()
      if (pendingMappings[lower]) return pendingMappings[lower]
      return typeMappings.get(lower) || null
    }

    // Category mapping data
    const categories = props.categories || []
    const categoryMappings = props.categoryMappings || new Map()
    const pendingCategoryMappings = props.pendingCategoryMappings || {}

    // Get effective category mapping for an account
    const getEffectiveCategoryMapping = (qbAccount: string): string | null => {
      const lower = qbAccount.toLowerCase()
      if (pendingCategoryMappings[lower] !== undefined) {
        return pendingCategoryMappings[lower]
      }
      return categoryMappings.get(lower) || null
    }

    // Collect unique QB account names for summary (use qb_account for "Account full name")
    const accountCounts = new Map<string, number>()
    for (const t of props.data) {
      if (t.qb_account) {
        accountCounts.set(t.qb_account, (accountCounts.get(t.qb_account) || 0) + 1)
      }
    }
    const uniqueAccounts = Array.from(accountCounts.entries())
      .sort((a, b) => b[1] - a[1])

    const unmappedAccounts = uniqueAccounts.filter(([account]) => !getEffectiveCategoryMapping(account))

    // Collect unique QB transaction types for summary
    const typeCounts = new Map<string, { count: number; isMapped: boolean }>()
    for (const t of props.data) {
      if (t.qb_transaction_type) {
        const existing = typeCounts.get(t.qb_transaction_type)
        const lower = t.qb_transaction_type.toLowerCase()
        const isMapped = typeMappings.has(lower) || !!pendingMappings[lower]
        if (existing) {
          existing.count++
          // Update isMapped if this one is mapped
          if (isMapped) existing.isMapped = true
        } else {
          typeCounts.set(t.qb_transaction_type, { count: 1, isMapped })
        }
      }
    }
    const uniqueTypes = Array.from(typeCounts.entries())
      .sort((a, b) => {
        // Unmapped first
        if (!a[1].isMapped && b[1].isMapped) return -1
        if (a[1].isMapped && !b[1].isMapped) return 1
        return b[1].count - a[1].count
      })
    const unmappedTypes = uniqueTypes.filter(([typeName]) => !getEffectiveMapping(typeName))

    return (
      <div className="space-y-4">
        {/* Transaction Type Mapping Section */}
        {uniqueTypes.length > 0 && (
          <div className={`rounded-lg border p-4 ${unmappedTypes.length > 0 ? 'border-amber-500/50 bg-amber-50 dark:bg-amber-950/20' : 'bg-muted/30'}`}>
            <div className="flex items-center gap-2 mb-2">
              <span className="font-medium text-sm">
                {unmappedTypes.length > 0
                  ? `Map Transaction Types (${unmappedTypes.length} unmapped)`
                  : 'Transaction Types'
                }
              </span>
            </div>
            {unmappedTypes.length > 0 && (
              <p className="text-xs text-amber-600 dark:text-amber-300 mb-3">
                Select Income or Expense for each transaction type before importing.
              </p>
            )}
            <div className="space-y-2">
              {uniqueTypes.map(([typeName, info]) => {
                const effectiveMapping = getEffectiveMapping(typeName)
                return (
                  <div key={typeName} className="flex items-center gap-3">
                    <span className="text-sm min-w-[150px]">
                      {typeName}
                      <span className="text-muted-foreground ml-1">({info.count})</span>
                    </span>
                    <Select
                      value={effectiveMapping || 'unmapped'}
                      onValueChange={(value) => {
                        if (props.onTypeMappingChange && value !== 'unmapped') {
                          props.onTypeMappingChange(typeName.toLowerCase(), value as 'income' | 'expense')
                        }
                      }}
                    >
                      <SelectTrigger className={`w-32 h-8 ${!effectiveMapping ? 'border-amber-500' : ''}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="unmapped" disabled>
                          <span className="text-muted-foreground">Select...</span>
                        </SelectItem>
                        <SelectItem value="expense">
                          <Badge variant="destructive" className="font-normal">Expense</Badge>
                        </SelectItem>
                        <SelectItem value="income">
                          <Badge variant="default" className="font-normal">Income</Badge>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Category Mapping Section */}
        <CategoryMappingSection
          uniqueAccounts={uniqueAccounts}
          unmappedAccounts={unmappedAccounts}
          categories={categories}
          getEffectiveCategoryMapping={getEffectiveCategoryMapping}
          onCategoryMappingChange={props.onCategoryMappingChange}
          onCreateCategory={props.onCreateCategory}
        />

        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>QB Account</TableHead>
                <TableHead>QB Type</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {transactions.map((t, i) => {
                const { type: txnType, isMapped } = getTransactionType(t)
                return (
                  <TableRow key={i} className={!isMapped ? 'bg-amber-50/50 dark:bg-amber-950/10' : ''}>
                    <TableCell className="whitespace-nowrap">
                      {formatDate(t.transaction_date)}
                    </TableCell>
                    <TableCell className="max-w-[150px] truncate">
                      {t.description}
                    </TableCell>
                    <TableCell className="max-w-[120px] truncate text-xs text-muted-foreground">
                      {t.qb_account || '-'}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {t.qb_transaction_type || '-'}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          !isMapped
                            ? 'outline'
                            : txnType === 'income'
                            ? 'default'
                            : txnType === 'expense'
                            ? 'destructive'
                            : 'secondary'
                        }
                        className={!isMapped ? 'border-amber-500 text-amber-700' : ''}
                      >
                        {!isMapped ? '?' : txnType}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrencyDetailed(Math.abs(t.amount))}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
          {props.data.length > limit && (
            <div className="border-t p-3 text-center text-sm text-muted-foreground">
              Showing {limit} of {props.data.length} transactions
            </div>
          )}
        </div>
      </div>
    )
  }

  if (props.type === 'investments') {
    const investments = props.data.slice(0, limit)

    return (
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Symbol</TableHead>
              <TableHead>Name</TableHead>
              <TableHead className="text-right">Quantity</TableHead>
              <TableHead className="text-right">Cost Basis</TableHead>
              <TableHead className="text-right">Current Value</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {investments.map((inv, i) => (
              <TableRow key={i}>
                <TableCell className="font-medium">{inv.symbol}</TableCell>
                <TableCell className="max-w-[200px] truncate">
                  {inv.name || '-'}
                </TableCell>
                <TableCell className="text-right">
                  {inv.quantity.toLocaleString()}
                </TableCell>
                <TableCell className="text-right">
                  {inv.cost_basis ? formatCurrencyDetailed(inv.cost_basis) : '-'}
                </TableCell>
                <TableCell className="text-right">
                  {inv.current_value ? formatCurrencyDetailed(inv.current_value) : '-'}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {props.data.length > limit && (
          <div className="border-t p-3 text-center text-sm text-muted-foreground">
            Showing {limit} of {props.data.length} holdings
          </div>
        )}
      </div>
    )
  }

  return null
}
