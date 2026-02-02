'use client'

import { useState, useEffect, Fragment } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
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
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/components/ui/use-toast'
import { Loader2, Save, RefreshCw, AlertCircle } from 'lucide-react'
import type { Account } from '@/types/database'
import { findSimilarAccounts, type SimilarAccount } from '@/lib/string-similarity'

interface QBAccountMapping {
  accountName: string
  count: number
  unmappedCount: number
  transactionTypes: string[]
  mappedAccountId: string | null
  similarUnmapped?: SimilarAccount[]
}

interface AccountMappingProps {
  accounts: Account[]
  onAccountsUpdate: () => void
}

export function AccountMapping({ accounts, onAccountsUpdate }: AccountMappingProps) {
  const supabase = createClient()
  const { toast } = useToast()

  const [qbAccounts, setQbAccounts] = useState<QBAccountMapping[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [applying, setApplying] = useState(false)
  const [pendingMappings, setPendingMappings] = useState<Record<string, string>>({})

  useEffect(() => {
    loadQBAccounts()
  }, [accounts])

  const loadQBAccounts = async () => {
    setLoading(true)

    // Get all unique qb_account values from transactions
    // This is the "Account full name" column which identifies WHERE the money is
    const { data: transactions, error } = await supabase
      .from('transactions')
      .select('qb_account, qb_transaction_type, account_id')
      .not('qb_account', 'is', null)

    if (error) {
      toast({
        title: 'Error loading QB accounts',
        description: error.message,
        variant: 'destructive',
      })
      setLoading(false)
      return
    }

    // Aggregate the data
    const accountMap = new Map<
      string,
      {
        count: number
        unmappedCount: number
        transactionTypes: Set<string>
      }
    >()

    for (const t of transactions || []) {
      const accountName = t.qb_account?.trim()
      if (!accountName) continue

      const existing = accountMap.get(accountName)
      if (existing) {
        existing.count++
        if (!t.account_id) existing.unmappedCount++
        if (t.qb_transaction_type) {
          existing.transactionTypes.add(t.qb_transaction_type)
        }
      } else {
        accountMap.set(accountName, {
          count: 1,
          unmappedCount: t.account_id ? 0 : 1,
          transactionTypes: new Set(t.qb_transaction_type ? [t.qb_transaction_type] : []),
        })
      }
    }

    // Find which app account each QB account is mapped to (if any)
    const qbAccountsWithMappings: QBAccountMapping[] = []

    Array.from(accountMap.entries()).forEach(([accountName, info]) => {
      // Find account that has this QB account name in its qb_account_names
      const mappedAccount = accounts.find((a) =>
        a.qb_account_names?.some(
          (name) => name.toLowerCase().trim() === accountName.toLowerCase().trim()
        )
      )

      qbAccountsWithMappings.push({
        accountName,
        count: info.count,
        unmappedCount: info.unmappedCount,
        transactionTypes: Array.from(info.transactionTypes),
        mappedAccountId: mappedAccount?.id || null,
      })
    })

    // Sort by unmapped count (highest first), then by total count
    qbAccountsWithMappings.sort((a, b) => {
      if (b.unmappedCount !== a.unmappedCount) {
        return b.unmappedCount - a.unmappedCount
      }
      return b.count - a.count
    })

    // For each mapped account, find similar unmapped accounts
    const unmappedNames = qbAccountsWithMappings
      .filter((a) => !a.mappedAccountId)
      .map((a) => a.accountName)

    for (const account of qbAccountsWithMappings) {
      if (account.mappedAccountId) {
        account.similarUnmapped = findSimilarAccounts(account.accountName, unmappedNames, 0.65)
      }
    }

    setQbAccounts(qbAccountsWithMappings)
    setLoading(false)
  }

  const handleMappingChange = (accountName: string, accountId: string) => {
    setPendingMappings((prev) => ({
      ...prev,
      [accountName]: accountId === 'none' ? '' : accountId,
    }))
  }

  const saveMappings = async () => {
    setSaving(true)

    try {
      // Group mappings by target account
      const accountUpdates = new Map<string, string[]>()

      // First, get current qb_account_names for all affected accounts
      const affectedAccountIds = new Set<string>()

      for (const [qbName, accountId] of Object.entries(pendingMappings)) {
        if (accountId) {
          affectedAccountIds.add(accountId)
        }
        // Also need to remove from previous account
        const previousMapping = qbAccounts.find((a) => a.accountName === qbName)
        if (previousMapping?.mappedAccountId) {
          affectedAccountIds.add(previousMapping.mappedAccountId)
        }
      }

      // Fetch current state of affected accounts
      const { data: currentAccounts } = await supabase
        .from('accounts')
        .select('id, qb_account_names')
        .in('id', Array.from(affectedAccountIds))

      // Build update map starting from current state
      const accountNamesMap = new Map<string, Set<string>>()
      for (const acc of currentAccounts || []) {
        accountNamesMap.set(acc.id, new Set(acc.qb_account_names || []))
      }

      // Process each pending mapping
      for (const [qbName, newAccountId] of Object.entries(pendingMappings)) {
        // Find previous account (if any)
        const previousMapping = qbAccounts.find((a) => a.accountName === qbName)

        // Remove from previous account
        if (previousMapping?.mappedAccountId && previousMapping.mappedAccountId !== newAccountId) {
          const prevNames = accountNamesMap.get(previousMapping.mappedAccountId) || new Set<string>()
          // Remove case-insensitive
          Array.from(prevNames).forEach((name) => {
            if (name.toLowerCase().trim() === qbName.toLowerCase().trim()) {
              prevNames.delete(name)
            }
          })
          accountNamesMap.set(previousMapping.mappedAccountId, prevNames)
        }

        // Add to new account
        if (newAccountId) {
          const newNames = accountNamesMap.get(newAccountId) || new Set()
          newNames.add(qbName)
          accountNamesMap.set(newAccountId, newNames)
        }
      }

      // Execute updates
      for (const entry of Array.from(accountNamesMap.entries())) {
        const [accountId, names] = entry
        const { error } = await supabase
          .from('accounts')
          .update({ qb_account_names: Array.from(names) })
          .eq('id', accountId)

        if (error) {
          throw error
        }
      }

      toast({
        title: 'Mappings saved',
        description: `Updated ${Object.keys(pendingMappings).length} mapping(s)`,
      })

      setPendingMappings({})
      onAccountsUpdate()
      await loadQBAccounts()
    } catch (error) {
      toast({
        title: 'Error saving mappings',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  const applyMappingsToExisting = async () => {
    setApplying(true)

    try {
      const response = await fetch('/api/transactions/apply-account-mappings', {
        method: 'POST',
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Failed to apply mappings')
      }

      toast({
        title: 'Mappings applied',
        description: `Updated ${result.updated} transaction(s)`,
      })

      await loadQBAccounts()
    } catch (error) {
      toast({
        title: 'Error applying mappings',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      })
    } finally {
      setApplying(false)
    }
  }

  const getEffectiveMapping = (account: QBAccountMapping): string => {
    if (pendingMappings[account.accountName] !== undefined) {
      return pendingMappings[account.accountName] || 'none'
    }
    return account.mappedAccountId || 'none'
  }

  const getAccountName = (accountId: string | null): string => {
    if (!accountId) return 'Unmapped'
    const account = accounts.find((a) => a.id === accountId)
    return account?.name || 'Unknown'
  }

  const totalUnmapped = qbAccounts.reduce((sum, a) => sum + a.unmappedCount, 0)
  const hasPendingChanges = Object.keys(pendingMappings).length > 0

  // Group accounts by type for the dropdown
  const assetAccounts = accounts.filter((a) =>
    ['checking', 'savings', 'investment', 'retirement', 'other'].includes(a.account_type)
  )
  const liabilityAccounts = accounts.filter((a) =>
    ['credit_card', 'loan', 'mortgage'].includes(a.account_type)
  )

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
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground">
            Map QuickBooks account names to your app accounts. Transactions will be automatically
            linked to accounts on import.
          </p>
          {totalUnmapped > 0 && (
            <div className="flex items-center gap-2 text-sm text-amber-600">
              <AlertCircle className="h-4 w-4" />
              {totalUnmapped} transaction{totalUnmapped !== 1 && 's'} not linked to an account
            </div>
          )}
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={applyMappingsToExisting}
            disabled={applying || totalUnmapped === 0}
          >
            {applying ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            Apply to Existing
          </Button>
          <Button onClick={saveMappings} disabled={saving || !hasPendingChanges}>
            {saving ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            Save Mappings
          </Button>
        </div>
      </div>

      {qbAccounts.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          No QuickBooks accounts found. Import some transactions first.
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>QuickBooks Account Name</TableHead>
              <TableHead>Transaction Types</TableHead>
              <TableHead className="text-right">Transactions</TableHead>
              <TableHead className="text-right">Unmapped</TableHead>
              <TableHead>Mapped To</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {qbAccounts.map((qbAccount) => (
              <TableRow
                key={qbAccount.accountName}
                className={qbAccount.unmappedCount > 0 ? 'bg-amber-50/50 dark:bg-amber-950/20' : ''}
              >
                <TableCell className="font-medium">
                  {qbAccount.accountName}
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {qbAccount.transactionTypes.slice(0, 3).map((type) => (
                      <Badge key={type} variant="secondary" className="text-xs">
                        {type}
                      </Badge>
                    ))}
                    {qbAccount.transactionTypes.length > 3 && (
                      <Badge variant="secondary" className="text-xs">
                        +{qbAccount.transactionTypes.length - 3}
                      </Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-right">{qbAccount.count}</TableCell>
                <TableCell className="text-right">
                  {qbAccount.unmappedCount > 0 ? (
                    <span className="text-amber-600 font-medium">{qbAccount.unmappedCount}</span>
                  ) : (
                    <span className="text-muted-foreground">0</span>
                  )}
                </TableCell>
                <TableCell>
                  <Select
                    value={getEffectiveMapping(qbAccount)}
                    onValueChange={(value) => handleMappingChange(qbAccount.accountName, value)}
                  >
                    <SelectTrigger className="w-48">
                      <SelectValue placeholder="Select account" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">-- Not Mapped --</SelectItem>
                      {assetAccounts.length > 0 && (
                        <>
                          <SelectItem value="__asset_divider__" disabled>
                            <span className="text-xs font-semibold">━━━ ASSETS ━━━</span>
                          </SelectItem>
                          {assetAccounts.map((account) => (
                            <SelectItem key={account.id} value={account.id}>
                              {account.name}
                              <span className="text-muted-foreground ml-2 text-xs">
                                ({account.account_type.replace('_', ' ')})
                              </span>
                            </SelectItem>
                          ))}
                        </>
                      )}
                      {liabilityAccounts.length > 0 && (
                        <>
                          <SelectItem value="__liability_divider__" disabled>
                            <span className="text-xs font-semibold">━━━ LIABILITIES ━━━</span>
                          </SelectItem>
                          {liabilityAccounts.map((account) => (
                            <SelectItem key={account.id} value={account.id}>
                              {account.name}
                              <span className="text-muted-foreground ml-2 text-xs">
                                ({account.account_type.replace('_', ' ')})
                              </span>
                            </SelectItem>
                          ))}
                        </>
                      )}
                    </SelectContent>
                  </Select>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  )
}
