'use client'

import { useState, useEffect } from 'react'
import { format } from 'date-fns'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useToast } from '@/components/ui/use-toast'
import { Loader2, Trash2, FileSpreadsheet, AlertTriangle } from 'lucide-react'

interface ImportBatchStats {
  minDate: string | null
  maxDate: string | null
  totalAmount: number
  transactionCount: number
  duplicatesSkipped: number
}

interface ImportBatch {
  id: string
  filename: string
  file_type: string
  created_at: string
  record_count: number
  status: 'pending' | 'processing' | 'completed' | 'failed'
  error_message: string | null
  stats: ImportBatchStats
}

interface ImportHistoryProps {
  fileType?: string
  onImportDeleted?: () => void
}

export function ImportHistory({ fileType = 'quickbooks_transactions', onImportDeleted }: ImportHistoryProps) {
  const { toast } = useToast()
  const [imports, setImports] = useState<ImportBatch[]>([])
  const [loading, setLoading] = useState(true)
  const [deleteModalOpen, setDeleteModalOpen] = useState(false)
  const [clearAllModalOpen, setClearAllModalOpen] = useState(false)
  const [selectedImport, setSelectedImport] = useState<ImportBatch | null>(null)
  const [confirmText, setConfirmText] = useState('')
  const [clearAllConfirmText, setClearAllConfirmText] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [clearingAll, setClearingAll] = useState(false)

  useEffect(() => {
    loadImports()
  }, [fileType])

  const loadImports = async () => {
    setLoading(true)
    try {
      const response = await fetch(`/api/imports?file_type=${fileType}`)
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to load imports')
      }

      setImports(data.imports || [])
    } catch (error) {
      toast({
        title: 'Error loading import history',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  const openDeleteModal = (importBatch: ImportBatch) => {
    setSelectedImport(importBatch)
    setConfirmText('')
    setDeleteModalOpen(true)
  }

  const closeDeleteModal = () => {
    setDeleteModalOpen(false)
    setSelectedImport(null)
    setConfirmText('')
  }

  const handleDelete = async () => {
    if (!selectedImport) return

    setDeleting(true)
    try {
      const response = await fetch(`/api/imports/${selectedImport.id}`, {
        method: 'DELETE',
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to delete import')
      }

      toast({
        title: 'Import deleted',
        description: `Deleted "${selectedImport.filename}" and ${data.deletedTransactions} transaction(s)`,
      })

      closeDeleteModal()
      await loadImports()
      onImportDeleted?.()
    } catch (error) {
      toast({
        title: 'Error deleting import',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      })
    } finally {
      setDeleting(false)
    }
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount)
  }

  const formatDateRange = (minDate: string | null, maxDate: string | null) => {
    if (!minDate || !maxDate) return '-'
    const min = format(new Date(minDate), 'MMM d, yyyy')
    const max = format(new Date(maxDate), 'MMM d, yyyy')
    if (min === max) return min
    return `${min} - ${max}`
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">Completed</Badge>
      case 'failed':
        return <Badge variant="destructive">Failed</Badge>
      case 'processing':
        return <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">Processing</Badge>
      default:
        return <Badge variant="secondary">{status}</Badge>
    }
  }

  const handleClearAll = async () => {
    setClearingAll(true)
    try {
      const response = await fetch('/api/imports/clear-all', {
        method: 'DELETE',
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to clear all data')
      }

      toast({
        title: 'All data cleared',
        description: `Deleted ${data.deletedTransactions} transaction(s) and ${data.deletedBatches} import batch(es)`,
      })

      setClearAllModalOpen(false)
      setClearAllConfirmText('')
      await loadImports()
      onImportDeleted?.()
    } catch (error) {
      toast({
        title: 'Error clearing data',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      })
    } finally {
      setClearingAll(false)
    }
  }

  const isConfirmValid = selectedImport && confirmText === selectedImport.filename
  const isClearAllConfirmValid = clearAllConfirmText === 'DELETE ALL'

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (imports.length === 0) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">Import History</h3>
          <Button
            variant="outline"
            size="sm"
            className="text-destructive hover:text-destructive"
            onClick={() => setClearAllModalOpen(true)}
          >
            <Trash2 className="h-4 w-4 mr-1" />
            Clear All Data
          </Button>
        </div>
        <div className="text-center py-8 text-muted-foreground border rounded-lg">
          <FileSpreadsheet className="h-12 w-12 mx-auto mb-3 opacity-50" />
          <p>No imports yet</p>
          <p className="text-sm">Upload a file above to get started</p>
        </div>

        {/* Clear All Confirmation Modal */}
        <Dialog open={clearAllModalOpen} onOpenChange={setClearAllModalOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-destructive" />
                Clear All Import Data
              </DialogTitle>
              <DialogDescription>
                This will permanently delete ALL transactions and import batches.
                This action cannot be undone.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-3 text-sm">
                <p className="font-medium text-destructive">Warning: This will delete everything!</p>
                <p className="text-muted-foreground mt-1">
                  All imported transactions and import history will be permanently removed.
                </p>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">
                  Type <span className="font-mono bg-muted px-1 rounded">DELETE ALL</span> to confirm:
                </label>
                <Input
                  value={clearAllConfirmText}
                  onChange={(e) => setClearAllConfirmText(e.target.value)}
                  placeholder="DELETE ALL"
                  className={clearAllConfirmText && !isClearAllConfirmValid ? 'border-destructive' : ''}
                />
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setClearAllModalOpen(false)} disabled={clearingAll}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={handleClearAll}
                disabled={!isClearAllConfirmValid || clearingAll}
              >
                {clearingAll ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="mr-2 h-4 w-4" />
                )}
                Clear All Data
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Import History</h3>
        <div className="flex items-center gap-3">
          <p className="text-sm text-muted-foreground">{imports.length} import(s)</p>
          <Button
            variant="outline"
            size="sm"
            className="text-destructive hover:text-destructive"
            onClick={() => setClearAllModalOpen(true)}
          >
            <Trash2 className="h-4 w-4 mr-1" />
            Clear All
          </Button>
        </div>
      </div>

      <div className="border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Filename</TableHead>
              <TableHead>Import Date</TableHead>
              <TableHead>Date Range</TableHead>
              <TableHead className="text-right">Transactions</TableHead>
              <TableHead className="text-right">Duplicates Skipped</TableHead>
              <TableHead className="text-right">Total Amount</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-16"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {imports.map((importBatch) => (
              <TableRow key={importBatch.id}>
                <TableCell className="font-medium max-w-[200px] truncate" title={importBatch.filename}>
                  {importBatch.filename}
                </TableCell>
                <TableCell>
                  {format(new Date(importBatch.created_at), 'MMM d, yyyy h:mm a')}
                </TableCell>
                <TableCell>
                  {formatDateRange(importBatch.stats.minDate, importBatch.stats.maxDate)}
                </TableCell>
                <TableCell className="text-right">
                  {importBatch.stats.transactionCount}
                </TableCell>
                <TableCell className="text-right">
                  {importBatch.stats.duplicatesSkipped > 0 ? (
                    <span className="text-amber-600">{importBatch.stats.duplicatesSkipped}</span>
                  ) : (
                    <span className="text-muted-foreground">0</span>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  {formatCurrency(importBatch.stats.totalAmount)}
                </TableCell>
                <TableCell>
                  {getStatusBadge(importBatch.status)}
                </TableCell>
                <TableCell>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                    onClick={() => openDeleteModal(importBatch)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Delete Confirmation Modal */}
      <Dialog open={deleteModalOpen} onOpenChange={setDeleteModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Delete Import
            </DialogTitle>
            <DialogDescription>
              This will permanently delete the import and all {selectedImport?.stats.transactionCount || 0} associated transaction(s).
              This action cannot be undone.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="rounded-lg bg-muted p-3 text-sm">
              <p className="font-medium">{selectedImport?.filename}</p>
              <p className="text-muted-foreground">
                {selectedImport?.stats.transactionCount} transactions
                {selectedImport?.stats.totalAmount ? ` (${formatCurrency(selectedImport.stats.totalAmount)})` : ''}
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">
                Type the filename to confirm:
              </label>
              <Input
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder={selectedImport?.filename}
                className={confirmText && !isConfirmValid ? 'border-destructive' : ''}
              />
              {confirmText && !isConfirmValid && (
                <p className="text-xs text-destructive">Filename doesn&apos;t match</p>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closeDeleteModal} disabled={deleting}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={!isConfirmValid || deleting}
            >
              {deleting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="mr-2 h-4 w-4" />
              )}
              Delete Import
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Clear All Confirmation Modal */}
      <Dialog open={clearAllModalOpen} onOpenChange={setClearAllModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Clear All Import Data
            </DialogTitle>
            <DialogDescription>
              This will permanently delete ALL transactions and import batches.
              This action cannot be undone.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-3 text-sm">
              <p className="font-medium text-destructive">Warning: This will delete everything!</p>
              <p className="text-muted-foreground mt-1">
                All imported transactions and import history will be permanently removed.
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">
                Type <span className="font-mono bg-muted px-1 rounded">DELETE ALL</span> to confirm:
              </label>
              <Input
                value={clearAllConfirmText}
                onChange={(e) => setClearAllConfirmText(e.target.value)}
                placeholder="DELETE ALL"
                className={clearAllConfirmText && !isClearAllConfirmValid ? 'border-destructive' : ''}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setClearAllModalOpen(false)} disabled={clearingAll}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleClearAll}
              disabled={!isClearAllConfirmValid || clearingAll}
            >
              {clearingAll ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="mr-2 h-4 w-4" />
              )}
              Clear All Data
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
