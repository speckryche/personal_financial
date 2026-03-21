'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/use-toast'
import { Loader2, CheckCircle2, AlertTriangle } from 'lucide-react'

export function FixTransactionTypes() {
  const { toast } = useToast()
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<{
    checked: number
    fixed: number
    details?: {
      toIncome: number
      toExpense: number
      toTransfer: number
    }
  } | null>(null)

  const runFix = async () => {
    setRunning(true)
    setResult(null)

    try {
      const response = await fetch('/api/transactions/fix-types', {
        method: 'POST',
      })

      const data = await response.json()

      if (!response.ok) {
        toast({
          title: 'Error',
          description: data.error || 'Failed to fix transaction types',
          variant: 'destructive',
        })
        return
      }

      setResult({
        checked: data.checked,
        fixed: data.fixed,
        details: data.details,
      })

      toast({
        title: 'Complete',
        description: data.message,
      })
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to run fix',
        variant: 'destructive',
      })
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        This will scan all income/expense transactions and correct any that were misclassified
        based on amount sign. It uses your category mappings to determine the correct type:
      </p>
      <ul className="text-sm text-muted-foreground list-disc list-inside space-y-1">
        <li>If a QB account is mapped to an <span className="font-medium">expense category</span> → Expense</li>
        <li>If a QB account is mapped to an <span className="font-medium">income category</span> → Income</li>
        <li>Numbered accounts like <span className="font-medium">4xxx</span> → Income (fallback)</li>
      </ul>

      <div className="flex items-center gap-4">
        <Button onClick={runFix} disabled={running}>
          {running && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          {running ? 'Analyzing...' : 'Fix Transaction Types'}
        </Button>

        {result && (
          <div className="flex items-center gap-2 text-sm">
            {result.fixed > 0 ? (
              <>
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                <span>
                  Fixed {result.fixed} of {result.checked} transactions
                  {result.details && (
                    <span className="text-muted-foreground ml-1">
                      ({result.details.toIncome} → income,{' '}
                      {result.details.toExpense} → expense,{' '}
                      {result.details.toTransfer} → transfer)
                    </span>
                  )}
                </span>
              </>
            ) : (
              <>
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                <span>All {result.checked} transactions have correct types</span>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
