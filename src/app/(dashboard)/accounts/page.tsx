'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
import { Loader2, TrendingUp, TrendingDown, Wallet, CreditCard, Building2, PiggyBank, Plus } from 'lucide-react'
import { formatCurrency, formatDate } from '@/lib/utils'
import {
  getAccountsWithBalances,
  groupAccountsByType,
  calculateNetWorthTotals,
  recordBalanceSnapshot,
  isLiabilityAccount,
  type AccountWithBalance,
} from '@/lib/account-balance'
import type { Transaction } from '@/types/database'

interface AccountDetail {
  account: AccountWithBalance
  recentTransactions: Transaction[]
}

export default function AccountsPage() {
  const supabase = createClient()
  const { toast } = useToast()

  const [loading, setLoading] = useState(true)
  const [accounts, setAccounts] = useState<AccountWithBalance[]>([])
  const [selectedAccount, setSelectedAccount] = useState<AccountDetail | null>(null)
  const [balanceDialogOpen, setBalanceDialogOpen] = useState(false)
  const [balanceEntry, setBalanceEntry] = useState({
    balance: '',
    date: new Date().toISOString().split('T')[0],
  })
  const [savingBalance, setSavingBalance] = useState(false)

  useEffect(() => {
    loadAccounts()
  }, [])

  const loadAccounts = async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()

    if (user) {
      const accountsWithBalances = await getAccountsWithBalances(supabase, user.id)
      setAccounts(accountsWithBalances)
    }

    setLoading(false)
  }

  const handleAccountClick = async (account: AccountWithBalance) => {
    // Load recent transactions for this account
    const { data: transactions } = await supabase
      .from('transactions')
      .select('*')
      .eq('account_id', account.id)
      .order('transaction_date', { ascending: false })
      .limit(10)

    setSelectedAccount({
      account,
      recentTransactions: transactions || [],
    })
  }

  const handleRecordBalance = async () => {
    if (!selectedAccount || !balanceEntry.balance) return

    setSavingBalance(true)

    const balance = parseFloat(balanceEntry.balance)
    if (isNaN(balance)) {
      toast({
        title: 'Invalid balance',
        description: 'Please enter a valid number',
        variant: 'destructive',
      })
      setSavingBalance(false)
      return
    }

    const result = await recordBalanceSnapshot(
      supabase,
      selectedAccount.account.id,
      balance,
      balanceEntry.date
    )

    if (result.success) {
      toast({ title: 'Balance recorded successfully' })
      setBalanceDialogOpen(false)
      setBalanceEntry({
        balance: '',
        date: new Date().toISOString().split('T')[0],
      })
      await loadAccounts()
      // Refresh selected account
      const updated = accounts.find(a => a.id === selectedAccount.account.id)
      if (updated) {
        handleAccountClick(updated)
      }
    } else {
      toast({
        title: 'Error recording balance',
        description: result.error,
        variant: 'destructive',
      })
    }

    setSavingBalance(false)
  }

  const { assets, liabilities } = groupAccountsByType(accounts.filter(a => a.is_active))
  const { totalAssets, totalLiabilities, netWorth } = calculateNetWorthTotals(accounts.filter(a => a.is_active))

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Accounts</h1>
        <p className="text-muted-foreground">
          Track your account balances and net worth
        </p>
      </div>

      {/* Net Worth Summary */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Assets</CardTitle>
            <TrendingUp className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {formatCurrency(totalAssets)}
            </div>
            <p className="text-xs text-muted-foreground">
              {assets.length} active account{assets.length !== 1 ? 's' : ''}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Liabilities</CardTitle>
            <TrendingDown className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-500">
              -{formatCurrency(totalLiabilities)}
            </div>
            <p className="text-xs text-muted-foreground">
              {liabilities.length} active account{liabilities.length !== 1 ? 's' : ''}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Net Worth</CardTitle>
            <Wallet className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${netWorth >= 0 ? 'text-green-600' : 'text-red-500'}`}>
              {formatCurrency(netWorth)}
            </div>
            <p className="text-xs text-muted-foreground">
              Assets - Liabilities
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Assets Card */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-green-500" />
              <CardTitle>Assets</CardTitle>
            </div>
            <CardDescription>
              Bank accounts, investments, and other assets
            </CardDescription>
          </CardHeader>
          <CardContent>
            {assets.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Account</TableHead>
                    <TableHead className="text-right">Balance</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {assets.map((account) => (
                    <TableRow
                      key={account.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => handleAccountClick(account)}
                    >
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <AccountIcon type={account.account_type} />
                          <div>
                            <div className="font-medium">{account.name}</div>
                            <div className="text-xs text-muted-foreground capitalize">
                              {account.account_type.replace('_', ' ')}
                              {account.institution && ` • ${account.institution}`}
                            </div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        {account.starting_balance !== null ? (
                          <span className="font-medium text-green-600">
                            {formatCurrency(account.current_balance)}
                          </span>
                        ) : (
                          <span className="text-muted-foreground text-sm">Not set</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <p className="text-center text-muted-foreground py-8">
                No asset accounts. Add accounts in Settings.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Liabilities Card */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <CreditCard className="h-5 w-5 text-red-500" />
              <CardTitle>Liabilities</CardTitle>
            </div>
            <CardDescription>
              Credit cards, loans, and other debts
            </CardDescription>
          </CardHeader>
          <CardContent>
            {liabilities.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Account</TableHead>
                    <TableHead className="text-right">Balance</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {liabilities.map((account) => (
                    <TableRow
                      key={account.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => handleAccountClick(account)}
                    >
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <AccountIcon type={account.account_type} />
                          <div>
                            <div className="font-medium">{account.name}</div>
                            <div className="text-xs text-muted-foreground capitalize">
                              {account.account_type.replace('_', ' ')}
                              {account.institution && ` • ${account.institution}`}
                            </div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        {account.starting_balance !== null ? (
                          <span className="font-medium text-red-500">
                            -{formatCurrency(Math.abs(account.current_balance))}
                          </span>
                        ) : (
                          <span className="text-muted-foreground text-sm">Not set</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <p className="text-center text-muted-foreground py-8">
                No liability accounts. Add accounts in Settings.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Account Detail Dialog */}
      <Dialog open={!!selectedAccount} onOpenChange={(open) => !open && setSelectedAccount(null)}>
        <DialogContent className="max-w-2xl">
          {selectedAccount && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <AccountIcon type={selectedAccount.account.account_type} />
                  {selectedAccount.account.name}
                </DialogTitle>
                <DialogDescription>
                  <Badge variant="outline" className="capitalize">
                    {selectedAccount.account.account_type.replace('_', ' ')}
                  </Badge>
                  {selectedAccount.account.institution && (
                    <span className="ml-2">{selectedAccount.account.institution}</span>
                  )}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                {/* Balance Info */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 rounded-lg bg-muted/50">
                    <div className="text-sm text-muted-foreground">Current Balance</div>
                    <div className={`text-2xl font-bold ${
                      isLiabilityAccount(selectedAccount.account.account_type)
                        ? 'text-red-500'
                        : 'text-green-600'
                    }`}>
                      {selectedAccount.account.starting_balance !== null
                        ? (isLiabilityAccount(selectedAccount.account.account_type)
                            ? `-${formatCurrency(Math.abs(selectedAccount.account.current_balance))}`
                            : formatCurrency(selectedAccount.account.current_balance))
                        : 'Not set'}
                    </div>
                  </div>
                  <div className="p-4 rounded-lg bg-muted/50">
                    <div className="text-sm text-muted-foreground">Starting Balance</div>
                    <div className="text-xl font-semibold">
                      {selectedAccount.account.starting_balance !== null
                        ? formatCurrency(selectedAccount.account.starting_balance)
                        : 'Not set'}
                    </div>
                    {selectedAccount.account.starting_balance_date && (
                      <div className="text-xs text-muted-foreground">
                        as of {formatDate(selectedAccount.account.starting_balance_date)}
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">
                    {selectedAccount.account.transaction_count} linked transaction
                    {selectedAccount.account.transaction_count !== 1 ? 's' : ''}
                  </span>
                  <Button variant="outline" size="sm" onClick={() => setBalanceDialogOpen(true)}>
                    <Plus className="h-4 w-4 mr-2" />
                    Record Balance
                  </Button>
                </div>

                {/* Recent Transactions */}
                {selectedAccount.recentTransactions.length > 0 && (
                  <div>
                    <h4 className="text-sm font-medium mb-2">Recent Transactions</h4>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Date</TableHead>
                          <TableHead>Description</TableHead>
                          <TableHead className="text-right">Amount</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {selectedAccount.recentTransactions.map((txn) => (
                          <TableRow key={txn.id}>
                            <TableCell className="text-sm">
                              {formatDate(txn.transaction_date)}
                            </TableCell>
                            <TableCell className="text-sm">
                              {txn.description || txn.memo || 'No description'}
                            </TableCell>
                            <TableCell className={`text-right font-medium ${
                              Number(txn.amount) >= 0 ? 'text-green-600' : 'text-red-500'
                            }`}>
                              {formatCurrency(Number(txn.amount))}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Record Balance Dialog */}
      <Dialog open={balanceDialogOpen} onOpenChange={setBalanceDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record Balance</DialogTitle>
            <DialogDescription>
              Record a manual balance snapshot for {selectedAccount?.account.name}.
              This will be used as a new anchor point for balance calculations.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="balance">Balance</Label>
              <Input
                id="balance"
                type="number"
                step="0.01"
                placeholder="0.00"
                value={balanceEntry.balance}
                onChange={(e) => setBalanceEntry({ ...balanceEntry, balance: e.target.value })}
              />
              {selectedAccount && isLiabilityAccount(selectedAccount.account.account_type) && (
                <p className="text-xs text-muted-foreground">
                  Enter as positive number (amount owed)
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="balance-date">As of Date</Label>
              <Input
                id="balance-date"
                type="date"
                value={balanceEntry.date}
                onChange={(e) => setBalanceEntry({ ...balanceEntry, date: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBalanceDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleRecordBalance} disabled={savingBalance || !balanceEntry.balance}>
              {savingBalance && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Balance
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function AccountIcon({ type }: { type: string }) {
  switch (type) {
    case 'checking':
    case 'savings':
      return <Building2 className="h-4 w-4 text-blue-500" />
    case 'credit_card':
      return <CreditCard className="h-4 w-4 text-orange-500" />
    case 'investment':
    case 'retirement':
      return <TrendingUp className="h-4 w-4 text-green-500" />
    case 'loan':
    case 'mortgage':
      return <PiggyBank className="h-4 w-4 text-red-500" />
    default:
      return <Wallet className="h-4 w-4 text-gray-500" />
  }
}
