'use client'

import { useState } from 'react'
import { HoverCard, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn, formatCurrency, formatDate } from '@/lib/utils'
import { CreditCard, Building2, Home, Pencil, Calendar, Percent, DollarSign, Target } from 'lucide-react'
import type { DebtAccount } from '@/lib/debt-utils'
import { calculatePayoffDate, calculateMonthsToPayoff, formatMonthsToPayoff } from '@/lib/debt-utils'

interface DebtScorecardProps {
  debt: DebtAccount
  priorityRank?: number
  onUpdate: (updates: {
    interest_rate?: number | null
    minimum_payment?: number | null
    target_payoff_date?: string | null
    payoff_priority?: number | null
  }) => Promise<void>
}

export function DebtScorecard({ debt, priorityRank, onUpdate }: DebtScorecardProps) {
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [formData, setFormData] = useState({
    interest_rate: debt.interest_rate?.toString() ?? '',
    minimum_payment: debt.minimum_payment?.toString() ?? '',
    target_payoff_date: debt.target_payoff_date ?? '',
    payoff_priority: debt.payoff_priority?.toString() ?? '',
  })

  const balance = Math.abs(debt.display_balance)
  const apr = debt.interest_rate ?? 0
  const minPayment = debt.minimum_payment ?? 0

  // Calculate projected payoff
  const monthsToPayoff = minPayment > 0 ? calculateMonthsToPayoff(balance, apr, minPayment) : null
  const projectedPayoff = minPayment > 0 ? calculatePayoffDate(balance, apr, minPayment) : null

  // Calculate monthly interest
  const monthlyInterest = apr > 0 ? balance * (apr / 100 / 12) : 0

  const handleSave = async () => {
    setSaving(true)
    try {
      await onUpdate({
        interest_rate: formData.interest_rate ? parseFloat(formData.interest_rate) : null,
        minimum_payment: formData.minimum_payment ? parseFloat(formData.minimum_payment) : null,
        target_payoff_date: formData.target_payoff_date || null,
        payoff_priority: formData.payoff_priority ? parseInt(formData.payoff_priority) : null,
      })
      setEditDialogOpen(false)
    } finally {
      setSaving(false)
    }
  }

  const getAccountIcon = () => {
    switch (debt.account_type) {
      case 'credit_card':
        return <CreditCard className="h-5 w-5 text-orange-500" />
      case 'mortgage':
        return <Home className="h-5 w-5 text-red-500" />
      case 'loan':
        return <Building2 className="h-5 w-5 text-red-500" />
      default:
        return <CreditCard className="h-5 w-5 text-red-500" />
    }
  }

  return (
    <>
      <HoverCard className="group overflow-hidden">
        {/* Top accent bar */}
        <div className="absolute top-0 left-0 right-0 h-0.5 bg-red-500 scale-x-0 group-hover:scale-x-100 transition-transform duration-300 origin-left" />

        <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
          <div className="flex items-center gap-2">
            {getAccountIcon()}
            <div>
              <CardTitle className="text-base font-semibold">{debt.name}</CardTitle>
              <div className="flex items-center gap-2 mt-1">
                <Badge variant="outline" className="text-xs capitalize">
                  {debt.account_type.replace('_', ' ')}
                </Badge>
                {priorityRank && (
                  <Badge variant="secondary" className="text-xs">
                    #{priorityRank}
                  </Badge>
                )}
              </div>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={() => setEditDialogOpen(true)}
          >
            <Pencil className="h-4 w-4" />
          </Button>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Balance - large and prominent */}
          <div>
            <p className="text-sm text-muted-foreground">Balance</p>
            <p className="text-3xl font-bold font-mono text-red-500">
              {formatCurrency(balance)}
            </p>
          </div>

          {/* Key metrics grid */}
          <div className="grid grid-cols-2 gap-3">
            {/* APR */}
            <div className="p-3 rounded-lg bg-muted/50">
              <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
                <Percent className="h-3.5 w-3.5" />
                <span className="text-xs">APR</span>
              </div>
              <p className={cn(
                'text-lg font-semibold',
                apr > 20 ? 'text-red-500' : apr > 10 ? 'text-orange-500' : 'text-foreground'
              )}>
                {apr > 0 ? `${apr.toFixed(2)}%` : 'Not set'}
              </p>
            </div>

            {/* Minimum Payment */}
            <div className="p-3 rounded-lg bg-muted/50">
              <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
                <DollarSign className="h-3.5 w-3.5" />
                <span className="text-xs">Min Payment</span>
              </div>
              <p className="text-lg font-semibold">
                {minPayment > 0 ? formatCurrency(minPayment) : 'Not set'}
              </p>
            </div>
          </div>

          {/* Payoff projection */}
          {minPayment > 0 && (
            <div className="p-3 rounded-lg bg-muted/30 border border-muted">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <Calendar className="h-3.5 w-3.5" />
                  <span className="text-xs">Projected Payoff</span>
                </div>
                <span className={cn(
                  'text-sm font-medium',
                  monthsToPayoff === null ? 'text-red-500' : 'text-foreground'
                )}>
                  {formatMonthsToPayoff(monthsToPayoff)}
                </span>
              </div>
              {projectedPayoff && (
                <p className="text-xs text-muted-foreground mt-1">
                  Est. {formatDate(projectedPayoff)}
                </p>
              )}
              {monthlyInterest > 0 && (
                <p className="text-xs text-muted-foreground mt-1">
                  ~{formatCurrency(monthlyInterest)}/mo in interest
                </p>
              )}
            </div>
          )}

          {/* Target payoff date */}
          {debt.target_payoff_date && (
            <div className="flex items-center gap-2 text-sm">
              <Target className="h-4 w-4 text-primary" />
              <span className="text-muted-foreground">Target:</span>
              <span className="font-medium">{formatDate(debt.target_payoff_date)}</span>
            </div>
          )}
        </CardContent>
      </HoverCard>

      {/* Edit Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Debt Details</DialogTitle>
            <DialogDescription>
              Update the details for {debt.name}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="interest_rate">Interest Rate (APR %)</Label>
              <Input
                id="interest_rate"
                type="number"
                step="0.01"
                placeholder="24.99"
                value={formData.interest_rate}
                onChange={(e) => setFormData({ ...formData, interest_rate: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="minimum_payment">Minimum Payment</Label>
              <Input
                id="minimum_payment"
                type="number"
                step="0.01"
                placeholder="50.00"
                value={formData.minimum_payment}
                onChange={(e) => setFormData({ ...formData, minimum_payment: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="target_payoff_date">Target Payoff Date</Label>
              <Input
                id="target_payoff_date"
                type="date"
                value={formData.target_payoff_date}
                onChange={(e) => setFormData({ ...formData, target_payoff_date: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="payoff_priority">Payoff Priority (1 = highest)</Label>
              <Input
                id="payoff_priority"
                type="number"
                step="1"
                min="1"
                placeholder="Leave empty for auto (avalanche)"
                value={formData.payoff_priority}
                onChange={(e) => setFormData({ ...formData, payoff_priority: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">
                Set a number to manually prioritize. Lower numbers are paid first.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
