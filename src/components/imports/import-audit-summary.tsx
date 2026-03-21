'use client'

import { useState, useMemo } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

export interface AccountSummary {
  name: string
  type: 'income' | 'expense' | 'transfer' | 'ignored'
  beginningBalance: number | null
  totalDebits: number
  totalCredits: number
  netChange: number
  endingBalance: number | null
  transactionCount: number
}

interface ImportAuditSummaryProps {
  accountSummaries: AccountSummary[]
}

function formatCurrency(amount: number | null): string {
  if (amount === null) return '-'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(amount)
}

interface GroupTotals {
  debits: number
  credits: number
  netChange: number
  transactionCount: number
}

export function ImportAuditSummary({ accountSummaries }: ImportAuditSummaryProps) {
  const [isExpanded, setIsExpanded] = useState(true)

  // Group accounts by type
  const grouped = useMemo(() => {
    const income: AccountSummary[] = []
    const expense: AccountSummary[] = []
    const transfer: AccountSummary[] = []
    const ignored: AccountSummary[] = []

    for (const account of accountSummaries) {
      switch (account.type) {
        case 'income':
          income.push(account)
          break
        case 'expense':
          expense.push(account)
          break
        case 'transfer':
          transfer.push(account)
          break
        case 'ignored':
          ignored.push(account)
          break
      }
    }

    // Sort each group by transaction count descending
    income.sort((a, b) => b.transactionCount - a.transactionCount)
    expense.sort((a, b) => b.transactionCount - a.transactionCount)
    transfer.sort((a, b) => b.transactionCount - a.transactionCount)
    ignored.sort((a, b) => b.transactionCount - a.transactionCount)

    return { income, expense, transfer, ignored }
  }, [accountSummaries])

  // Calculate totals for each group
  const calculateTotals = (accounts: AccountSummary[]): GroupTotals => {
    return accounts.reduce(
      (acc, account) => ({
        debits: acc.debits + account.totalDebits,
        credits: acc.credits + account.totalCredits,
        netChange: acc.netChange + account.netChange,
        transactionCount: acc.transactionCount + account.transactionCount,
      }),
      { debits: 0, credits: 0, netChange: 0, transactionCount: 0 }
    )
  }

  const incomeTotals = calculateTotals(grouped.income)
  const expenseTotals = calculateTotals(grouped.expense)
  const transferTotals = calculateTotals(grouped.transfer)
  const ignoredTotals = calculateTotals(grouped.ignored)

  // Grand totals (excluding ignored)
  const grandTotals = {
    debits: incomeTotals.debits + expenseTotals.debits + transferTotals.debits,
    credits: incomeTotals.credits + expenseTotals.credits + transferTotals.credits,
    netChange: incomeTotals.netChange + expenseTotals.netChange + transferTotals.netChange,
    transactionCount: incomeTotals.transactionCount + expenseTotals.transactionCount + transferTotals.transactionCount,
  }

  const renderAccountRow = (account: AccountSummary) => (
    <TableRow key={account.name} className="text-sm">
      <TableCell className="font-medium pl-6">{account.name}</TableCell>
      <TableCell className="text-muted-foreground">{account.type}</TableCell>
      <TableCell className="text-right font-mono">
        {formatCurrency(account.beginningBalance)}
      </TableCell>
      <TableCell className="text-right font-mono">
        {formatCurrency(account.totalDebits)}
      </TableCell>
      <TableCell className="text-right font-mono">
        {formatCurrency(account.totalCredits)}
      </TableCell>
      <TableCell className={`text-right font-mono ${account.netChange >= 0 ? 'text-green-600' : 'text-red-600'}`}>
        {formatCurrency(account.netChange)}
      </TableCell>
      <TableCell className="text-right font-mono">
        {formatCurrency(account.endingBalance)}
      </TableCell>
      <TableCell className="text-right text-muted-foreground">
        {account.transactionCount}
      </TableCell>
    </TableRow>
  )

  const renderSubtotalRow = (label: string, totals: GroupTotals, bgClass: string) => (
    <TableRow className={`font-medium ${bgClass}`}>
      <TableCell colSpan={2} className="pl-4">Subtotal: {label}</TableCell>
      <TableCell className="text-right">-</TableCell>
      <TableCell className="text-right font-mono">{formatCurrency(totals.debits)}</TableCell>
      <TableCell className="text-right font-mono">{formatCurrency(totals.credits)}</TableCell>
      <TableCell className={`text-right font-mono ${totals.netChange >= 0 ? 'text-green-600' : 'text-red-600'}`}>
        {formatCurrency(totals.netChange)}
      </TableCell>
      <TableCell className="text-right">-</TableCell>
      <TableCell className="text-right">{totals.transactionCount}</TableCell>
    </TableRow>
  )

  if (accountSummaries.length === 0) {
    return null
  }

  return (
    <div className="space-y-2">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center gap-2 text-sm font-medium hover:text-foreground transition-colors w-full justify-between"
      >
        <span>Import Audit Summary</span>
        <span className="flex items-center gap-1 text-muted-foreground">
          {grandTotals.transactionCount} transactions across {accountSummaries.length} accounts
          {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </span>
      </button>

      {isExpanded && (
        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead>QB Account Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Begin Bal</TableHead>
                <TableHead className="text-right">Debits</TableHead>
                <TableHead className="text-right">Credits</TableHead>
                <TableHead className="text-right">Net Change</TableHead>
                <TableHead className="text-right">End Bal</TableHead>
                <TableHead className="text-right">Txn Count</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {/* Income Accounts */}
              {grouped.income.length > 0 && (
                <>
                  <TableRow className="bg-green-50 dark:bg-green-950/20">
                    <TableCell colSpan={8} className="font-semibold text-green-700 dark:text-green-400">
                      Income Accounts ({grouped.income.length})
                    </TableCell>
                  </TableRow>
                  {grouped.income.map(renderAccountRow)}
                  {renderSubtotalRow('Income', incomeTotals, 'bg-green-50/50 dark:bg-green-950/10')}
                </>
              )}

              {/* Expense Accounts */}
              {grouped.expense.length > 0 && (
                <>
                  <TableRow className="bg-red-50 dark:bg-red-950/20">
                    <TableCell colSpan={8} className="font-semibold text-red-700 dark:text-red-400">
                      Expense Accounts ({grouped.expense.length})
                    </TableCell>
                  </TableRow>
                  {grouped.expense.map(renderAccountRow)}
                  {renderSubtotalRow('Expenses', expenseTotals, 'bg-red-50/50 dark:bg-red-950/10')}
                </>
              )}

              {/* Transfer/Balance Sheet Accounts */}
              {grouped.transfer.length > 0 && (
                <>
                  <TableRow className="bg-blue-50 dark:bg-blue-950/20">
                    <TableCell colSpan={8} className="font-semibold text-blue-700 dark:text-blue-400">
                      Transfer / Balance Sheet Accounts ({grouped.transfer.length})
                    </TableCell>
                  </TableRow>
                  {grouped.transfer.map(renderAccountRow)}
                  {renderSubtotalRow('Transfers', transferTotals, 'bg-blue-50/50 dark:bg-blue-950/10')}
                </>
              )}

              {/* Ignored Accounts */}
              {grouped.ignored.length > 0 && (
                <>
                  <TableRow className="bg-gray-50 dark:bg-gray-800/20">
                    <TableCell colSpan={8} className="font-semibold text-gray-500">
                      Ignored Accounts ({grouped.ignored.length})
                    </TableCell>
                  </TableRow>
                  {grouped.ignored.map((account) => (
                    <TableRow key={account.name} className="text-sm text-muted-foreground">
                      <TableCell className="pl-6">{account.name}</TableCell>
                      <TableCell>ignored</TableCell>
                      <TableCell className="text-right font-mono">
                        {formatCurrency(account.beginningBalance)}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {formatCurrency(account.totalDebits)}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {formatCurrency(account.totalCredits)}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {formatCurrency(account.netChange)}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {formatCurrency(account.endingBalance)}
                      </TableCell>
                      <TableCell className="text-right">
                        {account.transactionCount}
                      </TableCell>
                    </TableRow>
                  ))}
                  {renderSubtotalRow('Ignored (not imported)', ignoredTotals, 'bg-gray-50/50 dark:bg-gray-800/10')}
                </>
              )}

              {/* Grand Total */}
              <TableRow className="bg-muted font-bold border-t-2">
                <TableCell colSpan={2} className="pl-4">Grand Total (Imported)</TableCell>
                <TableCell className="text-right">-</TableCell>
                <TableCell className="text-right font-mono">{formatCurrency(grandTotals.debits)}</TableCell>
                <TableCell className="text-right font-mono">{formatCurrency(grandTotals.credits)}</TableCell>
                <TableCell className={`text-right font-mono ${grandTotals.netChange >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {formatCurrency(grandTotals.netChange)}
                </TableCell>
                <TableCell className="text-right">-</TableCell>
                <TableCell className="text-right">{grandTotals.transactionCount}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
