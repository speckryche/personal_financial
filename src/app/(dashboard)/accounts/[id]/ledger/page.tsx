'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2, ArrowLeft, TrendingUp, TrendingDown, Minus, Filter, X } from 'lucide-react'
import { formatCurrency, formatDate } from '@/lib/utils'
import { getStartingBalance, isLiabilityAccount } from '@/lib/account-balance'
import type { Account, Transaction, AccountBalance } from '@/types/database'
import Link from 'next/link'

interface TransactionWithBalance extends Transaction {
  running_balance: number
  balance_change: number
}

export default function AccountLedgerPage({ params }: { params: { id: string } }) {
  const accountId = params.id
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [account, setAccount] = useState<Account | null>(null)
  const [startingBalanceRecord, setStartingBalanceRecord] = useState<AccountBalance | null>(null)
  const [transactions, setTransactions] = useState<TransactionWithBalance[]>([])
  const [finalBalance, setFinalBalance] = useState(0)

  // Date filter state
  const [filterFrom, setFilterFrom] = useState('')
  const [filterTo, setFilterTo] = useState('')

  useEffect(() => {
    loadData()
  }, [accountId])

  const loadData = async () => {
    setLoading(true)

    // Get account details
    const { data: accountData } = await supabase
      .from('accounts')
      .select('*')
      .eq('id', accountId)
      .single()

    if (!accountData) {
      setLoading(false)
      return
    }

    setAccount(accountData)

    // Get starting balance
    const startingBalance = await getStartingBalance(supabase, accountId)
    setStartingBalanceRecord(startingBalance)

    const startBalance = startingBalance ? Number(startingBalance.balance) : 0
    const startDate = startingBalance?.balance_date || null

    // Get all transactions for this account, sorted by date (oldest first)
    let query = supabase
      .from('transactions')
      .select('*')
      .eq('account_id', accountId)
      .order('transaction_date', { ascending: true })
      .order('created_at', { ascending: true })

    if (startDate) {
      query = query.gte('transaction_date', startDate)
    }

    const { data: txnData } = await query

    // Calculate running balance for each transaction
    let runningBalance = startBalance
    const txnsWithBalance: TransactionWithBalance[] = (txnData || []).map((txn) => {
      const amount = Number(txn.amount)
      runningBalance += amount
      return {
        ...txn,
        balance_change: amount,
        running_balance: runningBalance,
      }
    })

    setTransactions(txnsWithBalance)
    setFinalBalance(runningBalance)
    setLoading(false)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    )
  }

  if (!account) {
    return (
      <div className="text-center py-12">
        <h2 className="text-xl font-semibold">Account not found</h2>
        <Link href="/accounts">
          <Button variant="link">Back to Accounts</Button>
        </Link>
      </div>
    )
  }

  const isLiability = isLiabilityAccount(account.account_type)
  const startingBalance = startingBalanceRecord ? Number(startingBalanceRecord.balance) : 0

  // Filter transactions by date range
  const isFilterActive = filterFrom || filterTo
  const filteredTransactions = transactions.filter((t) => {
    if (filterFrom && t.transaction_date < filterFrom) return false
    if (filterTo && t.transaction_date > filterTo) return false
    return true
  })

  // Diagnostic calculations - use filtered transactions when filter is active
  const txnsForCalc = isFilterActive ? filteredTransactions : transactions
  const positiveSum = txnsForCalc.reduce((sum, t) => sum + (t.balance_change > 0 ? t.balance_change : 0), 0)
  const negativeSum = txnsForCalc.reduce((sum, t) => sum + (t.balance_change < 0 ? t.balance_change : 0), 0)
  const filteredNetChange = positiveSum + negativeSum
  const netChange = finalBalance - startingBalance

  // Period starting/ending balances for filtered view
  // Find the last transaction before the filter range to get period starting balance
  const txnsBeforeFilter = filterFrom
    ? transactions.filter((t) => t.transaction_date < filterFrom)
    : []
  const periodStartBalance = txnsBeforeFilter.length > 0
    ? txnsBeforeFilter[txnsBeforeFilter.length - 1].running_balance
    : startingBalance
  // Period ending balance is the running balance of the last transaction in the filtered range
  const periodEndBalance = filteredTransactions.length > 0
    ? filteredTransactions[filteredTransactions.length - 1].running_balance
    : periodStartBalance

  // Clear filter helper
  const clearFilter = () => {
    setFilterFrom('')
    setFilterTo('')
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/accounts">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{account.name} Ledger</h1>
          <p className="text-muted-foreground">
            Transaction-by-transaction balance detail
          </p>
        </div>
      </div>

      {/* Date Filter */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Filter className="h-4 w-4" />
            Date Range Filter
          </CardTitle>
          <CardDescription>
            Filter to match your statement period for easy comparison
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-1">
              <Label htmlFor="filter-from" className="text-xs">From Date</Label>
              <Input
                id="filter-from"
                type="date"
                value={filterFrom}
                onChange={(e) => setFilterFrom(e.target.value)}
                className="w-[160px]"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="filter-to" className="text-xs">To Date</Label>
              <Input
                id="filter-to"
                type="date"
                value={filterTo}
                onChange={(e) => setFilterTo(e.target.value)}
                className="w-[160px]"
              />
            </div>
            {isFilterActive && (
              <Button variant="ghost" size="sm" onClick={clearFilter}>
                <X className="h-4 w-4 mr-1" />
                Clear
              </Button>
            )}
            {isFilterActive && (
              <div className="text-sm text-muted-foreground">
                Showing <span className="font-medium text-foreground">{filteredTransactions.length}</span> of {transactions.length} transactions
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Balance Summary */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Starting Balance</CardTitle>
            <CardDescription>
              {startingBalanceRecord
                ? `as of ${formatDate(startingBalanceRecord.balance_date)}`
                : 'Not set'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCurrency(startingBalance)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Transaction Sum</CardTitle>
            <CardDescription>
              {transactions.length} transaction{transactions.length !== 1 ? 's' : ''}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${
              finalBalance - startingBalance >= 0 ? 'text-green-600' : 'text-red-500'
            }`}>
              {finalBalance - startingBalance >= 0 ? '+' : ''}{formatCurrency(finalBalance - startingBalance)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Current Balance</CardTitle>
            <CardDescription>After all transactions</CardDescription>
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${
              isLiability ? 'text-red-500' : 'text-green-600'
            }`}>
              {isLiability && finalBalance > 0 ? '-' : ''}{formatCurrency(Math.abs(finalBalance))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Diagnostic Summary */}
      <Card className="border-amber-500/50 bg-amber-50/50 dark:bg-amber-950/20">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <span className="text-amber-600">Balance Diagnostic</span>
            {isFilterActive && (
              <Badge variant="outline" className="text-xs">
                Filtered: {filterFrom || 'start'} to {filterTo || 'end'}
              </Badge>
            )}
          </CardTitle>
          <CardDescription>
            {isFilterActive
              ? `Showing totals for ${filteredTransactions.length} transactions in selected date range`
              : 'Breakdown to help identify balance discrepancies'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 text-sm">
            <div className="p-3 rounded-lg bg-background/80">
              <div className="text-muted-foreground">Positive Amounts (Debits)</div>
              <div className="text-xl font-bold text-green-600">+{formatCurrency(positiveSum)}</div>
              <div className="text-xs text-muted-foreground">
                {isLiability ? 'Should be: purchases, charges' : 'Should be: deposits, income'}
              </div>
            </div>
            <div className="p-3 rounded-lg bg-background/80">
              <div className="text-muted-foreground">Negative Amounts (Credits)</div>
              <div className="text-xl font-bold text-red-500">{formatCurrency(negativeSum)}</div>
              <div className="text-xs text-muted-foreground">
                {isLiability ? 'Should be: payments, refunds' : 'Should be: withdrawals, expenses'}
              </div>
            </div>
            <div className="p-3 rounded-lg bg-background/80">
              <div className="text-muted-foreground">
                Net Change {isFilterActive && <span className="text-amber-600">(filtered)</span>}
              </div>
              <div className={`text-xl font-bold ${filteredNetChange >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                {filteredNetChange >= 0 ? '+' : ''}{formatCurrency(filteredNetChange)}
              </div>
              <div className="text-xs text-muted-foreground">
                {isFilterActive
                  ? `${txnsForCalc.length} transactions in range`
                  : isLiability
                    ? filteredNetChange > 0 ? 'Balance increased (more owed)' : 'Balance decreased (paid down)'
                    : filteredNetChange > 0 ? 'Balance increased' : 'Balance decreased'}
              </div>
            </div>
            <div className="p-3 rounded-lg bg-background/80">
              <div className="text-muted-foreground">
                {isFilterActive ? 'Period Balances' : 'Calculation Check'}
              </div>
              {isFilterActive ? (
                <div className="text-sm space-y-1">
                  <div className="flex justify-between font-mono">
                    <span className="text-muted-foreground">Start:</span>
                    <span className="font-semibold">{formatCurrency(periodStartBalance)}</span>
                  </div>
                  <div className="flex justify-between font-mono text-xs">
                    <span className="text-muted-foreground">Change:</span>
                    <span className={filteredNetChange >= 0 ? 'text-green-600' : 'text-red-500'}>
                      {filteredNetChange >= 0 ? '+' : ''}{formatCurrency(filteredNetChange)}
                    </span>
                  </div>
                  <div className="flex justify-between font-mono border-t pt-1">
                    <span className="text-muted-foreground">End:</span>
                    <span className="font-bold">{formatCurrency(periodEndBalance)}</span>
                  </div>
                </div>
              ) : (
                <>
                  <div className="text-sm font-mono">
                    {formatCurrency(startingBalance)} + {netChange >= 0 ? '+' : ''}{formatCurrency(netChange)} = {formatCurrency(finalBalance)}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {isLiability
                      ? `If statement shows different balance, check if purchases are stored as + and payments as -`
                      : `Starting + Net Change = Current`}
                  </div>
                </>
              )}
            </div>
          </div>
          {isLiability && (
            <div className="mt-4 p-3 rounded-lg bg-background/80 text-sm">
              <strong>For Credit Cards:</strong> Purchases should be stored as <span className="text-green-600">positive</span> (increasing what you owe),
              and payments should be <span className="text-red-500">negative</span> (decreasing what you owe).
              If your balance is lower than expected, payments may be counted correctly but purchases might be missing or have wrong signs.
            </div>
          )}
        </CardContent>
      </Card>

      {/* Transaction Ledger */}
      <Card>
        <CardHeader>
          <CardTitle>
            Transaction Ledger
            {isFilterActive && (
              <Badge variant="outline" className="ml-2 text-xs">
                {filteredTransactions.length} in range
              </Badge>
            )}
          </CardTitle>
          <CardDescription>
            {isFilterActive
              ? `Showing transactions from ${filterFrom || 'start'} to ${filterTo || 'end'}`
              : 'Each transaction showing how the balance changed'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[100px]">Date</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>QB Type</TableHead>
                <TableHead>QB Account</TableHead>
                <TableHead className="text-right">Change</TableHead>
                <TableHead className="text-right">Balance</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {/* Starting balance row - only shown when not filtering */}
              {!isFilterActive && (
                <TableRow className="bg-muted/50">
                  <TableCell className="font-medium">
                    {startingBalanceRecord
                      ? formatDate(startingBalanceRecord.balance_date)
                      : '—'}
                  </TableCell>
                  <TableCell className="font-semibold" colSpan={3}>
                    Starting Balance
                  </TableCell>
                  <TableCell className="text-right">—</TableCell>
                  <TableCell className="text-right font-bold">
                    {formatCurrency(startingBalance)}
                  </TableCell>
                </TableRow>
              )}

              {/* Transaction rows */}
              {(isFilterActive ? filteredTransactions : transactions).map((txn, index) => (
                <TableRow key={txn.id}>
                  <TableCell className="text-sm">
                    {formatDate(txn.transaction_date)}
                  </TableCell>
                  <TableCell className="max-w-[200px] truncate">
                    {txn.description || txn.memo || 'No description'}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {txn.split_account || '—'}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground max-w-[150px] truncate">
                    {txn.qb_account || '—'}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      {txn.balance_change > 0 ? (
                        <TrendingUp className="h-3 w-3 text-green-500" />
                      ) : txn.balance_change < 0 ? (
                        <TrendingDown className="h-3 w-3 text-red-500" />
                      ) : (
                        <Minus className="h-3 w-3 text-gray-400" />
                      )}
                      <span className={`font-medium ${
                        txn.balance_change > 0 ? 'text-green-600' : txn.balance_change < 0 ? 'text-red-500' : ''
                      }`}>
                        {txn.balance_change >= 0 ? '+' : ''}{formatCurrency(txn.balance_change)}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    {isFilterActive ? '—' : formatCurrency(txn.running_balance)}
                  </TableCell>
                </TableRow>
              ))}

              {/* Final balance/summary row */}
              {(isFilterActive ? filteredTransactions : transactions).length > 0 && (
                <TableRow className="bg-muted/50 border-t-2">
                  <TableCell className="font-medium">—</TableCell>
                  <TableCell className="font-semibold" colSpan={3}>
                    {isFilterActive ? 'Period Total' : 'Final Balance'}
                  </TableCell>
                  <TableCell className="text-right font-bold">
                    {filteredNetChange >= 0 ? '+' : ''}{formatCurrency(filteredNetChange)}
                  </TableCell>
                  <TableCell className="text-right font-bold text-lg">
                    {isFilterActive ? '—' : formatCurrency(finalBalance)}
                  </TableCell>
                </TableRow>
              )}

              {(isFilterActive ? filteredTransactions : transactions).length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                    {isFilterActive
                      ? 'No transactions in selected date range'
                      : 'No transactions linked to this account'}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
