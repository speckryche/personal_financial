'use client'

import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Loader2, ArrowRight, Check, X } from 'lucide-react'

export interface PotentialDuplicate {
  newTransaction: {
    id: string
    date: string
    amount: number
    description: string
    qb_account: string | null
  }
  existingTransaction: {
    id: string
    date: string
    amount: number
    description: string
    qb_account: string | null
  }
}

type Decision = 'keep_new' | 'keep_existing' | 'keep_both'

interface PotentialDuplicatesModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  duplicates: PotentialDuplicate[]
  onResolve: (decisions: Map<string, Decision>) => Promise<void>
}

export function PotentialDuplicatesModal({
  open,
  onOpenChange,
  duplicates,
  onResolve,
}: PotentialDuplicatesModalProps) {
  const [decisions, setDecisions] = useState<Map<string, Decision>>(new Map())
  const [isResolving, setIsResolving] = useState(false)

  const handleDecision = (newTxId: string, decision: Decision) => {
    setDecisions(prev => {
      const next = new Map(prev)
      next.set(newTxId, decision)
      return next
    })
  }

  const formatAmount = (amount: number) => {
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

  const handleResolveAll = async () => {
    setIsResolving(true)
    try {
      await onResolve(decisions)
      onOpenChange(false)
    } finally {
      setIsResolving(false)
    }
  }

  const allDecided = duplicates.every(d => decisions.has(d.newTransaction.id))
  const decidedCount = decisions.size

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Potential Duplicates Found
            <Badge variant="secondary">{duplicates.length}</Badge>
          </DialogTitle>
          <DialogDescription>
            These imported transactions match existing ones by date, amount, and account but have different descriptions.
            This often happens when transactions are edited in QuickBooks. Review each pair and decide which to keep.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4 py-4">
          {duplicates.map((dup, index) => {
            const decision = decisions.get(dup.newTransaction.id)

            return (
              <div
                key={dup.newTransaction.id}
                className={`border rounded-lg p-4 space-y-3 transition-colors ${
                  decision ? 'bg-muted/30' : 'bg-background'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-muted-foreground">
                    Pair {index + 1} of {duplicates.length}
                  </span>
                  {decision && (
                    <Badge variant="outline" className="capitalize">
                      <Check className="h-3 w-3 mr-1" />
                      {decision.replace('_', ' ')}
                    </Badge>
                  )}
                </div>

                {/* Shared info */}
                <div className="flex items-center gap-4 text-sm">
                  <span className="font-medium">{formatDate(dup.newTransaction.date)}</span>
                  <span className="font-semibold text-base">{formatAmount(dup.newTransaction.amount)}</span>
                  {dup.newTransaction.qb_account && (
                    <Badge variant="secondary" className="text-xs">
                      {dup.newTransaction.qb_account}
                    </Badge>
                  )}
                </div>

                {/* Side-by-side comparison */}
                <div className="grid grid-cols-[1fr,auto,1fr] gap-4 items-stretch">
                  {/* Existing transaction */}
                  <div className={`rounded-md border p-3 space-y-2 ${
                    decision === 'keep_existing' ? 'border-green-500 bg-green-50 dark:bg-green-950/20' :
                    decision === 'keep_new' ? 'border-red-500 bg-red-50 dark:bg-red-950/20 opacity-60' :
                    ''
                  }`}>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        Existing
                      </span>
                      {decision === 'keep_existing' && (
                        <Badge variant="default" className="text-xs bg-green-600">Keeping</Badge>
                      )}
                      {decision === 'keep_new' && (
                        <Badge variant="destructive" className="text-xs">Deleting</Badge>
                      )}
                    </div>
                    <p className="text-sm break-words">
                      {dup.existingTransaction.description || <span className="italic text-muted-foreground">No description</span>}
                    </p>
                  </div>

                  {/* Arrow */}
                  <div className="flex items-center">
                    <ArrowRight className="h-5 w-5 text-muted-foreground" />
                  </div>

                  {/* New transaction */}
                  <div className={`rounded-md border p-3 space-y-2 ${
                    decision === 'keep_new' ? 'border-green-500 bg-green-50 dark:bg-green-950/20' :
                    decision === 'keep_existing' ? 'border-red-500 bg-red-50 dark:bg-red-950/20 opacity-60' :
                    ''
                  }`}>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        Newly Imported
                      </span>
                      {decision === 'keep_new' && (
                        <Badge variant="default" className="text-xs bg-green-600">Keeping</Badge>
                      )}
                      {decision === 'keep_existing' && (
                        <Badge variant="destructive" className="text-xs">Deleting</Badge>
                      )}
                    </div>
                    <p className="text-sm break-words">
                      {dup.newTransaction.description || <span className="italic text-muted-foreground">No description</span>}
                    </p>
                  </div>
                </div>

                {/* Action buttons */}
                <div className="flex gap-2 pt-2">
                  <Button
                    size="sm"
                    variant={decision === 'keep_new' ? 'default' : 'outline'}
                    onClick={() => handleDecision(dup.newTransaction.id, 'keep_new')}
                    className="flex-1"
                  >
                    Keep New
                  </Button>
                  <Button
                    size="sm"
                    variant={decision === 'keep_existing' ? 'default' : 'outline'}
                    onClick={() => handleDecision(dup.newTransaction.id, 'keep_existing')}
                    className="flex-1"
                  >
                    Keep Existing
                  </Button>
                  <Button
                    size="sm"
                    variant={decision === 'keep_both' ? 'default' : 'outline'}
                    onClick={() => handleDecision(dup.newTransaction.id, 'keep_both')}
                    className="flex-1"
                  >
                    Keep Both
                  </Button>
                </div>
              </div>
            )
          })}
        </div>

        <DialogFooter className="border-t pt-4">
          <div className="flex items-center justify-between w-full">
            <span className="text-sm text-muted-foreground">
              {decidedCount} of {duplicates.length} resolved
            </span>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isResolving}>
                Cancel
              </Button>
              <Button
                onClick={handleResolveAll}
                disabled={!allDecided || isResolving}
              >
                {isResolving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Apply Decisions
              </Button>
            </div>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
