'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
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
import { Loader2, Search, Trash2, AlertTriangle, ChevronDown, ChevronRight } from 'lucide-react'

interface DuplicateTransaction {
  id: string
  transaction_date: string
  description: string | null
  memo: string | null
  amount: number
  qb_account: string | null
  split_account: string | null
  import_batch_id: string | null
  created_at: string
}

interface DuplicateGroup {
  key: string
  date: string
  amount: number
  description: string
  transactions: DuplicateTransaction[]
}

export function DuplicateCleanup() {
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [duplicateGroups, setDuplicateGroups] = useState<DuplicateGroup[]>([])
  const [totalDuplicates, setTotalDuplicates] = useState(0)
  const [hasSearched, setHasSearched] = useState(false)
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())
  const [selectedForDeletion, setSelectedForDeletion] = useState<Set<string>>(new Set())
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false)
  const [detailModalOpen, setDetailModalOpen] = useState(false)
  const [selectedGroup, setSelectedGroup] = useState<DuplicateGroup | null>(null)

  const findDuplicates = async () => {
    setLoading(true)
    setHasSearched(true)

    try {
      const response = await fetch('/api/transactions/find-duplicates')
      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Failed to find duplicates')
      }

      setDuplicateGroups(result.duplicateGroups || [])
      setTotalDuplicates(result.totalDuplicates || 0)
      setExpandedGroups(new Set())
      setSelectedForDeletion(new Set())

      if (result.groupCount === 0) {
        toast({
          title: 'No duplicates found',
          description: 'Your transactions appear to be unique.',
        })
      } else {
        toast({
          title: 'Duplicates found',
          description: `Found ${result.groupCount} groups with ${result.totalDuplicates} potential duplicate(s).`,
        })
      }
    } catch (error) {
      toast({
        title: 'Error finding duplicates',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  const toggleGroupExpanded = (key: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
      }
      return next
    })
  }

  const toggleTransactionSelected = (id: string) => {
    setSelectedForDeletion((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const selectAllDuplicatesInGroup = (group: DuplicateGroup) => {
    // Select all except the first one (keep the oldest by created_at which is already sorted)
    const toSelect = group.transactions.slice(1).map((t) => t.id)
    setSelectedForDeletion((prev) => {
      const next = new Set(prev)
      toSelect.forEach((id) => next.add(id))
      return next
    })
  }

  const autoSelectAllDuplicates = () => {
    // For each group, select all except the first (oldest) transaction
    const toSelect: string[] = []
    for (const group of duplicateGroups) {
      group.transactions.slice(1).forEach((t) => toSelect.push(t.id))
    }
    setSelectedForDeletion(new Set(toSelect))
  }

  const deleteDuplicates = async () => {
    if (selectedForDeletion.size === 0) return

    setDeleting(true)

    try {
      const response = await fetch('/api/transactions/find-duplicates', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transactionIds: Array.from(selectedForDeletion) }),
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Failed to delete duplicates')
      }

      toast({
        title: 'Duplicates deleted',
        description: `Successfully deleted ${result.deleted} duplicate transaction(s).`,
      })

      // Refresh the duplicate list
      setSelectedForDeletion(new Set())
      setConfirmDeleteOpen(false)
      await findDuplicates()
    } catch (error) {
      toast({
        title: 'Error deleting duplicates',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      })
    } finally {
      setDeleting(false)
    }
  }

  const openGroupDetail = (group: DuplicateGroup) => {
    setSelectedGroup(group)
    setDetailModalOpen(true)
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

  const formatDateTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground">
            Find and remove duplicate transactions that may have slipped through during import.
            Duplicates are identified by matching date, amount, description, and QB account.
          </p>
          {hasSearched && totalDuplicates > 0 && (
            <div className="flex items-center gap-2 text-sm text-amber-600">
              <AlertTriangle className="h-4 w-4" />
              {totalDuplicates} potential duplicate{totalDuplicates !== 1 && 's'} in {duplicateGroups.length} group{duplicateGroups.length !== 1 && 's'}
            </div>
          )}
        </div>
        <div className="flex gap-2">
          {selectedForDeletion.size > 0 && (
            <Button
              variant="destructive"
              onClick={() => setConfirmDeleteOpen(true)}
              disabled={deleting}
            >
              {deleting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="mr-2 h-4 w-4" />
              )}
              Delete {selectedForDeletion.size} Selected
            </Button>
          )}
          {duplicateGroups.length > 0 && selectedForDeletion.size === 0 && (
            <Button variant="outline" onClick={autoSelectAllDuplicates}>
              Auto-Select Duplicates
            </Button>
          )}
          <Button onClick={findDuplicates} disabled={loading}>
            {loading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Search className="mr-2 h-4 w-4" />
            )}
            {hasSearched ? 'Refresh' : 'Find Duplicates'}
          </Button>
        </div>
      </div>

      {!hasSearched ? (
        <div className="text-center py-8 text-muted-foreground">
          Click "Find Duplicates" to scan your transactions for potential duplicates.
        </div>
      ) : duplicateGroups.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          No duplicate transactions found.
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8"></TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Description</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead className="text-center">Duplicates</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {duplicateGroups.map((group) => {
              const isExpanded = expandedGroups.has(group.key)
              const selectedInGroup = group.transactions.filter((t) =>
                selectedForDeletion.has(t.id)
              ).length

              return (
                <>
                  <TableRow key={group.key} className="bg-muted/30">
                    <TableCell className="pr-0">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0"
                        onClick={() => toggleGroupExpanded(group.key)}
                      >
                        {isExpanded ? (
                          <ChevronDown className="h-4 w-4" />
                        ) : (
                          <ChevronRight className="h-4 w-4" />
                        )}
                      </Button>
                    </TableCell>
                    <TableCell className="font-medium">{formatDate(group.date)}</TableCell>
                    <TableCell className="max-w-[200px] truncate" title={group.description}>
                      {group.description}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {formatCurrency(group.amount)}
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant="secondary" className="text-amber-600">
                        {group.transactions.length} copies
                      </Badge>
                      {selectedInGroup > 0 && (
                        <Badge variant="destructive" className="ml-1">
                          {selectedInGroup} selected
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openGroupDetail(group)}
                        >
                          View All
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => selectAllDuplicatesInGroup(group)}
                          title="Select all duplicates (keep oldest)"
                        >
                          Select Dupes
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                  {isExpanded &&
                    group.transactions.map((txn, idx) => (
                      <TableRow
                        key={txn.id}
                        className={selectedForDeletion.has(txn.id) ? 'bg-red-50 dark:bg-red-950/20' : ''}
                      >
                        <TableCell>
                          <Checkbox
                            checked={selectedForDeletion.has(txn.id)}
                            onCheckedChange={() => toggleTransactionSelected(txn.id)}
                          />
                        </TableCell>
                        <TableCell colSpan={2} className="pl-8">
                          <div className="flex items-center gap-2">
                            {idx === 0 && (
                              <Badge variant="outline" className="text-green-600 border-green-300">
                                Keep (oldest)
                              </Badge>
                            )}
                            <span className="text-sm text-muted-foreground">
                              {txn.qb_account || 'No QB Account'}
                            </span>
                            {txn.split_account && (
                              <span className="text-xs text-muted-foreground">
                                → {txn.split_account}
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-right text-sm">
                          {formatCurrency(txn.amount)}
                        </TableCell>
                        <TableCell className="text-center text-xs text-muted-foreground">
                          Imported: {formatDateTime(txn.created_at)}
                        </TableCell>
                        <TableCell></TableCell>
                      </TableRow>
                    ))}
                </>
              )
            })}
          </TableBody>
        </Table>
      )}

      {/* Confirm Delete Dialog */}
      <AlertDialog open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Delete {selectedForDeletion.size} Transaction{selectedForDeletion.size !== 1 && 's'}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. The selected transactions will be permanently deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={deleteDuplicates}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Detail Modal */}
      <Dialog open={detailModalOpen} onOpenChange={setDetailModalOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Duplicate Group Details</DialogTitle>
            <DialogDescription>
              {selectedGroup && (
                <>
                  {selectedGroup.transactions.length} transactions on{' '}
                  {formatDate(selectedGroup.date)} for {formatCurrency(selectedGroup.amount)}
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto min-h-0">
            {selectedGroup && (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8"></TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>QB Account</TableHead>
                    <TableHead>Split Account</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Imported</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {selectedGroup.transactions.map((txn, idx) => (
                    <TableRow
                      key={txn.id}
                      className={selectedForDeletion.has(txn.id) ? 'bg-red-50 dark:bg-red-950/20' : ''}
                    >
                      <TableCell>
                        <Checkbox
                          checked={selectedForDeletion.has(txn.id)}
                          onCheckedChange={() => toggleTransactionSelected(txn.id)}
                        />
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {idx === 0 && (
                            <Badge variant="outline" className="text-green-600 border-green-300">
                              Keep
                            </Badge>
                          )}
                          <span className="text-sm max-w-[150px] truncate">
                            {txn.description || txn.memo || 'No description'}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-[120px] truncate">
                        {txn.qb_account || '—'}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-[120px] truncate">
                        {txn.split_account || '—'}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {formatCurrency(txn.amount)}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        {formatDateTime(txn.created_at)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDetailModalOpen(false)}>
              Close
            </Button>
            {selectedGroup && (
              <Button
                variant="outline"
                onClick={() => {
                  selectAllDuplicatesInGroup(selectedGroup)
                  setDetailModalOpen(false)
                }}
              >
                Select Duplicates & Close
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
