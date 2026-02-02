'use client'

import { useState, useEffect } from 'react'
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/components/ui/use-toast'
import { Loader2, Search, Trash2, Edit2, Plus } from 'lucide-react'
import type { Account, Category } from '@/types/database'
import {
  getAllQBMappingsAsList,
  removeIgnoredAccount,
  removeQBNameFromAccount,
  removeQBNameFromCategory,
  addIgnoredAccount,
  addQBNameToAccount,
  addQBNameToCategory,
  type QBAccountMapping,
  type MappingType,
} from '@/lib/qb-account-mapping'

interface UnifiedQBMappingsProps {
  accounts: Account[]
  categories: Category[]
  onMappingsUpdate: () => void
}

type FilterType = 'all' | 'ignored' | 'asset' | 'liability' | 'income_expense'

// UI-specific type that includes 'income_expense' as a combined option for dialogs
type DialogMappingType = 'ignored' | 'asset' | 'liability' | 'income_expense'

export function UnifiedQBMappings({ accounts, categories, onMappingsUpdate }: UnifiedQBMappingsProps) {
  const supabase = createClient()
  const { toast } = useToast()

  const [mappings, setMappings] = useState<QBAccountMapping[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<FilterType>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [mappingToDelete, setMappingToDelete] = useState<QBAccountMapping | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  // Add mapping dialog state
  const [addDialogOpen, setAddDialogOpen] = useState(false)
  const [newQbAccountName, setNewQbAccountName] = useState('')
  const [newMappingType, setNewMappingType] = useState<DialogMappingType>('ignored')
  const [newTargetId, setNewTargetId] = useState('')
  const [isAdding, setIsAdding] = useState(false)

  // Edit mapping dialog state
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [mappingToEdit, setMappingToEdit] = useState<QBAccountMapping | null>(null)
  const [editMappingType, setEditMappingType] = useState<DialogMappingType>('ignored')
  const [editTargetId, setEditTargetId] = useState('')
  const [isEditing, setIsEditing] = useState(false)

  useEffect(() => {
    loadMappings()
  }, [])

  const loadMappings = async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setLoading(false)
      return
    }

    const allMappings = await getAllQBMappingsAsList(supabase, user.id)
    setMappings(allMappings)
    setLoading(false)
  }

  const filteredMappings = mappings.filter(m => {
    // Apply type filter
    if (filter !== 'all') {
      if (filter === 'income_expense') {
        // Match both 'income' and 'expense' types
        if (m.mappingType !== 'income' && m.mappingType !== 'expense') {
          return false
        }
      } else if (m.mappingType !== filter) {
        return false
      }
    }
    // Apply search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      return (
        m.qbAccountName.toLowerCase().includes(query) ||
        m.mappedToName?.toLowerCase().includes(query)
      )
    }
    return true
  })

  const handleDeleteClick = (mapping: QBAccountMapping) => {
    setMappingToDelete(mapping)
    setDeleteDialogOpen(true)
  }

  const handleDeleteConfirm = async () => {
    if (!mappingToDelete) return

    setIsDeleting(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setIsDeleting(false)
      return
    }

    let result: { success: boolean; error?: string }

    if (mappingToDelete.mappingType === 'ignored') {
      result = await removeIgnoredAccount(supabase, user.id, mappingToDelete.qbAccountName)
    } else if ((mappingToDelete.mappingType === 'asset' || mappingToDelete.mappingType === 'liability') && mappingToDelete.mappedToId) {
      result = await removeQBNameFromAccount(supabase, mappingToDelete.mappedToId, mappingToDelete.qbAccountName)
    } else if ((mappingToDelete.mappingType === 'income' || mappingToDelete.mappingType === 'expense') && mappingToDelete.mappedToId) {
      result = await removeQBNameFromCategory(supabase, mappingToDelete.mappedToId, mappingToDelete.qbAccountName)
    } else {
      result = { success: false, error: 'Invalid mapping type' }
    }

    setIsDeleting(false)
    setDeleteDialogOpen(false)
    setMappingToDelete(null)

    if (result.success) {
      toast({
        title: 'Mapping deleted',
        description: `"${mappingToDelete.qbAccountName}" is now unmapped.`,
      })
      await loadMappings()
      onMappingsUpdate()
    } else {
      toast({
        title: 'Error deleting mapping',
        description: result.error,
        variant: 'destructive',
      })
    }
  }

  const handleAddMapping = async () => {
    if (!newQbAccountName.trim()) {
      toast({
        title: 'Error',
        description: 'Please enter a QB account name.',
        variant: 'destructive',
      })
      return
    }

    setIsAdding(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setIsAdding(false)
      return
    }

    let result: { success: boolean; error?: string }

    if (newMappingType === 'ignored') {
      result = await addIgnoredAccount(supabase, user.id, newQbAccountName.trim())
    } else if ((newMappingType === 'asset' || newMappingType === 'liability') && newTargetId) {
      result = await addQBNameToAccount(supabase, newTargetId, newQbAccountName.trim())
    } else if (newMappingType === 'income_expense' && newTargetId) {
      result = await addQBNameToCategory(supabase, newTargetId, newQbAccountName.trim())
    } else {
      result = { success: false, error: 'Please select a target' }
    }

    setIsAdding(false)

    if (result.success) {
      toast({
        title: 'Mapping added',
        description: `"${newQbAccountName}" has been mapped.`,
      })
      setAddDialogOpen(false)
      setNewQbAccountName('')
      setNewMappingType('ignored')
      setNewTargetId('')
      await loadMappings()
      onMappingsUpdate()
    } else {
      toast({
        title: 'Error adding mapping',
        description: result.error,
        variant: 'destructive',
      })
    }
  }

  const handleEditClick = (mapping: QBAccountMapping) => {
    setMappingToEdit(mapping)
    // Convert 'income' or 'expense' to 'income_expense' for the dialog dropdown
    const dialogType: DialogMappingType =
      (mapping.mappingType === 'income' || mapping.mappingType === 'expense')
        ? 'income_expense'
        : mapping.mappingType as DialogMappingType
    setEditMappingType(dialogType)
    setEditTargetId(mapping.mappedToId || '')
    setEditDialogOpen(true)
  }

  const handleEditConfirm = async () => {
    if (!mappingToEdit) return

    setIsEditing(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setIsEditing(false)
      return
    }

    // First, remove the old mapping
    let removeResult: { success: boolean; error?: string }

    if (mappingToEdit.mappingType === 'ignored') {
      removeResult = await removeIgnoredAccount(supabase, user.id, mappingToEdit.qbAccountName)
    } else if ((mappingToEdit.mappingType === 'asset' || mappingToEdit.mappingType === 'liability') && mappingToEdit.mappedToId) {
      removeResult = await removeQBNameFromAccount(supabase, mappingToEdit.mappedToId, mappingToEdit.qbAccountName)
    } else if ((mappingToEdit.mappingType === 'income' || mappingToEdit.mappingType === 'expense') && mappingToEdit.mappedToId) {
      removeResult = await removeQBNameFromCategory(supabase, mappingToEdit.mappedToId, mappingToEdit.qbAccountName)
    } else {
      removeResult = { success: true }
    }

    if (!removeResult.success) {
      setIsEditing(false)
      toast({
        title: 'Error updating mapping',
        description: removeResult.error,
        variant: 'destructive',
      })
      return
    }

    // Then add the new mapping
    let addResult: { success: boolean; error?: string }

    if (editMappingType === 'ignored') {
      addResult = await addIgnoredAccount(supabase, user.id, mappingToEdit.qbAccountName)
    } else if ((editMappingType === 'asset' || editMappingType === 'liability') && editTargetId) {
      addResult = await addQBNameToAccount(supabase, editTargetId, mappingToEdit.qbAccountName)
    } else if (editMappingType === 'income_expense' && editTargetId) {
      addResult = await addQBNameToCategory(supabase, editTargetId, mappingToEdit.qbAccountName)
    } else {
      addResult = { success: false, error: 'Please select a target' }
    }

    setIsEditing(false)

    if (addResult.success) {
      toast({
        title: 'Mapping updated',
        description: `"${mappingToEdit.qbAccountName}" has been updated.`,
      })
      setEditDialogOpen(false)
      setMappingToEdit(null)
      await loadMappings()
      onMappingsUpdate()
    } else {
      toast({
        title: 'Error updating mapping',
        description: addResult.error,
        variant: 'destructive',
      })
    }
  }

  const getMappingTypeBadge = (type: MappingType) => {
    switch (type) {
      case 'ignored':
        return <Badge variant="secondary">Ignored</Badge>
      case 'asset':
        return <Badge variant="default">Asset</Badge>
      case 'liability':
        return <Badge variant="destructive">Liability</Badge>
      case 'income':
        return <Badge className="bg-green-500 hover:bg-green-600">Income</Badge>
      case 'expense':
        return <Badge variant="outline">Expense</Badge>
      default:
        return <Badge variant="secondary">Unmapped</Badge>
    }
  }

  // Group accounts for dropdown
  const assetAccounts = accounts.filter(a =>
    ['checking', 'savings', 'investment', 'retirement', 'other'].includes(a.account_type)
  )
  const liabilityAccounts = accounts.filter(a =>
    ['credit_card', 'loan', 'mortgage'].includes(a.account_type)
  )

  // Group categories for dropdown
  const incomeCategories = categories.filter(c => c.type === 'income')
  const expenseCategories = categories.filter(c => c.type === 'expense')

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
        <p className="text-sm text-muted-foreground">
          Configure how QuickBooks accounts are handled during GL import. Mappings are remembered for future imports.
        </p>
        <Button onClick={() => setAddDialogOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Add Mapping
        </Button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4">
        <Select value={filter} onValueChange={(v: FilterType) => setFilter(v)}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Filter by type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Mappings</SelectItem>
            <SelectItem value="ignored">Ignored</SelectItem>
            <SelectItem value="asset">Asset</SelectItem>
            <SelectItem value="liability">Liability</SelectItem>
            <SelectItem value="income_expense">Income/Expense</SelectItem>
          </SelectContent>
        </Select>

        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search QB account names..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {/* Mappings Table */}
      {filteredMappings.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          {mappings.length === 0
            ? 'No QB account mappings found. Import a General Ledger file to discover accounts.'
            : 'No mappings match your filter criteria.'}
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>QB Account Name</TableHead>
                <TableHead>Mapping Type</TableHead>
                <TableHead>Mapped To</TableHead>
                <TableHead className="w-[100px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredMappings.map((mapping) => (
                <TableRow key={`${mapping.mappingType}-${mapping.qbAccountName}`}>
                  <TableCell className="font-medium">{mapping.qbAccountName}</TableCell>
                  <TableCell>{getMappingTypeBadge(mapping.mappingType)}</TableCell>
                  <TableCell>
                    {mapping.mappedToName ? (
                      <span className="text-sm">
                        → {mapping.mappedToName}
                        {mapping.accountType && (
                          <span className="text-muted-foreground ml-1">
                            ({mapping.accountType.replace('_', ' ')})
                          </span>
                        )}
                        {mapping.categoryType && (
                          <span className="text-muted-foreground ml-1">
                            ({mapping.categoryType})
                          </span>
                        )}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleEditClick(mapping)}
                      >
                        <Edit2 className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDeleteClick(mapping)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Mapping</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete the mapping for "{mappingToDelete?.qbAccountName}"?
              This QB account will become unmapped and will require configuration on the next import.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDeleteConfirm} disabled={isDeleting}>
              {isDeleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Mapping Dialog */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add QB Account Mapping</DialogTitle>
            <DialogDescription>
              Create a new mapping for a QuickBooks account name.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">QB Account Name</label>
              <Input
                placeholder="e.g., 1000 Checking - Umpqua"
                value={newQbAccountName}
                onChange={(e) => setNewQbAccountName(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Mapping Type</label>
              <Select value={newMappingType} onValueChange={(v: DialogMappingType) => {
                setNewMappingType(v)
                setNewTargetId('')
              }}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ignored">Ignore (skip during import)</SelectItem>
                  <SelectItem value="asset">Asset (track as asset account)</SelectItem>
                  <SelectItem value="liability">Liability (track as liability account)</SelectItem>
                  <SelectItem value="income_expense">Income/Expense (track as category)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {(newMappingType === 'asset' || newMappingType === 'liability') && (
              <div className="space-y-2">
                <label className="text-sm font-medium">Map to {newMappingType === 'asset' ? 'Asset' : 'Liability'} Account</label>
                <Select value={newTargetId} onValueChange={setNewTargetId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select account..." />
                  </SelectTrigger>
                  <SelectContent>
                    {newMappingType === 'asset' && assetAccounts.map((acc) => (
                      <SelectItem key={acc.id} value={acc.id}>
                        {acc.name} ({acc.account_type.replace('_', ' ')})
                      </SelectItem>
                    ))}
                    {newMappingType === 'liability' && liabilityAccounts.map((acc) => (
                      <SelectItem key={acc.id} value={acc.id}>
                        {acc.name} ({acc.account_type.replace('_', ' ')})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {newMappingType === 'income_expense' && (
              <div className="space-y-2">
                <label className="text-sm font-medium">Map to Category</label>
                <Select value={newTargetId} onValueChange={setNewTargetId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select category..." />
                  </SelectTrigger>
                  <SelectContent>
                    {incomeCategories.length > 0 && (
                      <>
                        <SelectItem value="__income__" disabled>━━━ INCOME ━━━</SelectItem>
                        {incomeCategories.map((cat) => (
                          <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
                        ))}
                      </>
                    )}
                    {expenseCategories.length > 0 && (
                      <>
                        <SelectItem value="__expense__" disabled>━━━ EXPENSE ━━━</SelectItem>
                        {expenseCategories.map((cat) => (
                          <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
                        ))}
                      </>
                    )}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setAddDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleAddMapping} disabled={isAdding}>
              {isAdding && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Add Mapping
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Mapping Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit QB Account Mapping</DialogTitle>
            <DialogDescription>
              Change how "{mappingToEdit?.qbAccountName}" is handled during import.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Mapping Type</label>
              <Select value={editMappingType} onValueChange={(v: DialogMappingType) => {
                setEditMappingType(v)
                setEditTargetId('')
              }}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ignored">Ignore (skip during import)</SelectItem>
                  <SelectItem value="asset">Asset (track as asset account)</SelectItem>
                  <SelectItem value="liability">Liability (track as liability account)</SelectItem>
                  <SelectItem value="income_expense">Income/Expense (track as category)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {(editMappingType === 'asset' || editMappingType === 'liability') && (
              <div className="space-y-2">
                <label className="text-sm font-medium">Map to {editMappingType === 'asset' ? 'Asset' : 'Liability'} Account</label>
                <Select value={editTargetId} onValueChange={setEditTargetId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select account..." />
                  </SelectTrigger>
                  <SelectContent>
                    {editMappingType === 'asset' && assetAccounts.map((acc) => (
                      <SelectItem key={acc.id} value={acc.id}>
                        {acc.name} ({acc.account_type.replace('_', ' ')})
                      </SelectItem>
                    ))}
                    {editMappingType === 'liability' && liabilityAccounts.map((acc) => (
                      <SelectItem key={acc.id} value={acc.id}>
                        {acc.name} ({acc.account_type.replace('_', ' ')})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {editMappingType === 'income_expense' && (
              <div className="space-y-2">
                <label className="text-sm font-medium">Map to Category</label>
                <Select value={editTargetId} onValueChange={setEditTargetId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select category..." />
                  </SelectTrigger>
                  <SelectContent>
                    {incomeCategories.length > 0 && (
                      <>
                        <SelectItem value="__income__" disabled>━━━ INCOME ━━━</SelectItem>
                        {incomeCategories.map((cat) => (
                          <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
                        ))}
                      </>
                    )}
                    {expenseCategories.length > 0 && (
                      <>
                        <SelectItem value="__expense__" disabled>━━━ EXPENSE ━━━</SelectItem>
                        {expenseCategories.map((cat) => (
                          <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
                        ))}
                      </>
                    )}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleEditConfirm} disabled={isEditing}>
              {isEditing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
