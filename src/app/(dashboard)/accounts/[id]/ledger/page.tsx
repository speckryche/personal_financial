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
import { Loader2, ArrowLeft, TrendingUp, TrendingDown, Minus } from 'lucide-react'
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

      {/* Transaction Ledger */}
      <Card>
        <CardHeader>
          <CardTitle>Transaction Ledger</CardTitle>
          <CardDescription>
            Each transaction showing how the balance changed
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
              {/* Starting balance row */}
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

              {/* Transaction rows */}
              {transactions.map((txn, index) => (
                <TableRow key={txn.id}>
                  <TableCell className="text-sm">
                    {formatDate(txn.transaction_date)}
                  </TableCell>
                  <TableCell className="max-w-[200px] truncate">
                    {txn.description || txn.memo || txn.qb_name || 'No description'}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {txn.qb_transaction_type || '—'}
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
                    {formatCurrency(txn.running_balance)}
                  </TableCell>
                </TableRow>
              ))}

              {/* Final balance row */}
              {transactions.length > 0 && (
                <TableRow className="bg-muted/50 border-t-2">
                  <TableCell className="font-medium">—</TableCell>
                  <TableCell className="font-semibold" colSpan={3}>
                    Final Balance
                  </TableCell>
                  <TableCell className="text-right font-bold">
                    {finalBalance - startingBalance >= 0 ? '+' : ''}{formatCurrency(finalBalance - startingBalance)}
                  </TableCell>
                  <TableCell className="text-right font-bold text-lg">
                    {formatCurrency(finalBalance)}
                  </TableCell>
                </TableRow>
              )}

              {transactions.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                    No transactions linked to this account
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
