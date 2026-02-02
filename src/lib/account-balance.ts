import { createClient } from '@/lib/supabase/client'
import type { Account, AccountBalance, Transaction } from '@/types/database'

export interface AccountWithBalance extends Account {
  current_balance: number
  starting_balance: number | null
  starting_balance_date: string | null
  transaction_count: number
}

export interface BalanceCalculationResult {
  balance: number
  transactionCount: number
  startingBalance: number
  startingDate: string | null
}

/**
 * Determines if an account type is a liability (balances are typically negative)
 */
export function isLiabilityAccount(accountType: string): boolean {
  return ['credit_card', 'loan', 'mortgage'].includes(accountType)
}

/**
 * Determines if an account type is an asset
 */
export function isAssetAccount(accountType: string): boolean {
  return ['checking', 'savings', 'investment', 'retirement', 'other'].includes(accountType) &&
    !isLiabilityAccount(accountType)
}

/**
 * Calculate account balance from transactions and starting balance.
 *
 * For ASSETS (checking, savings, investment, retirement):
 * - Positive transaction amounts INCREASE balance (deposits)
 * - Negative transaction amounts DECREASE balance (withdrawals)
 *
 * For LIABILITIES (credit_card, loan, mortgage):
 * - Positive transaction amounts INCREASE balance (purchases/charges)
 * - Negative transaction amounts DECREASE balance (payments)
 * - Balance is typically shown as positive (amount owed)
 */
export function calculateAccountBalance(
  startingBalance: number,
  startingDate: string | null,
  transactions: Pick<Transaction, 'transaction_date' | 'amount'>[]
): BalanceCalculationResult {
  // Filter transactions after the starting date
  const relevantTxns = startingDate
    ? transactions.filter(t => t.transaction_date >= startingDate)
    : transactions

  // Sum transaction amounts
  // Transaction amounts are stored as: positive = income, negative = expense
  // For balance calculation, we sum all amounts directly
  const transactionSum = relevantTxns.reduce((sum, t) => sum + Number(t.amount), 0)

  return {
    balance: startingBalance + transactionSum,
    transactionCount: relevantTxns.length,
    startingBalance,
    startingDate,
  }
}

/**
 * Get the most recent manual balance snapshot for an account
 */
export async function getLatestManualBalance(
  supabase: ReturnType<typeof createClient>,
  accountId: string
): Promise<AccountBalance | null> {
  const { data } = await supabase
    .from('account_balances')
    .select('*')
    .eq('account_id', accountId)
    .eq('source', 'manual')
    .order('balance_date', { ascending: false })
    .limit(1)
    .single()

  return data
}

/**
 * Get the starting balance for an account (earliest manual balance entry)
 */
export async function getStartingBalance(
  supabase: ReturnType<typeof createClient>,
  accountId: string
): Promise<AccountBalance | null> {
  const { data } = await supabase
    .from('account_balances')
    .select('*')
    .eq('account_id', accountId)
    .eq('source', 'manual')
    .order('balance_date', { ascending: true })
    .limit(1)
    .single()

  return data
}

/**
 * Calculate the current balance for an account by:
 * 1. Finding the most recent manual balance (anchor point)
 * 2. Summing all transactions after that date
 */
export async function calculateCurrentBalance(
  supabase: ReturnType<typeof createClient>,
  accountId: string
): Promise<BalanceCalculationResult> {
  // Get the most recent manual balance as anchor
  const manualBalance = await getLatestManualBalance(supabase, accountId)

  const startingBalance = manualBalance ? Number(manualBalance.balance) : 0
  const startingDate = manualBalance?.balance_date || null

  // Get transactions for this account
  let query = supabase
    .from('transactions')
    .select('transaction_date, amount')
    .eq('account_id', accountId)

  if (startingDate) {
    query = query.gte('transaction_date', startingDate)
  }

  const { data: transactions } = await query

  return calculateAccountBalance(
    startingBalance,
    startingDate,
    transactions || []
  )
}

/**
 * Get all accounts with their calculated current balances
 */
export async function getAccountsWithBalances(
  supabase: ReturnType<typeof createClient>,
  userId: string
): Promise<AccountWithBalance[]> {
  // Get all accounts
  const { data: accounts } = await supabase
    .from('accounts')
    .select('*')
    .eq('user_id', userId)
    .order('name')

  if (!accounts || accounts.length === 0) {
    return []
  }

  // Get all starting balances (earliest manual balance for each account)
  const { data: startingBalances } = await supabase
    .from('account_balances')
    .select('*')
    .in('account_id', accounts.map(a => a.id))
    .eq('source', 'manual')
    .order('balance_date', { ascending: true })

  // Group starting balances by account (take earliest)
  const startingBalanceMap = new Map<string, AccountBalance>()
  for (const balance of startingBalances || []) {
    if (!startingBalanceMap.has(balance.account_id)) {
      startingBalanceMap.set(balance.account_id, balance)
    }
  }

  // Get transaction sums for each account (after their starting date)
  const accountsWithBalances: AccountWithBalance[] = []

  for (const account of accounts) {
    const startingBalanceRecord = startingBalanceMap.get(account.id)
    const startingBalance = startingBalanceRecord ? Number(startingBalanceRecord.balance) : 0
    const startingDate = startingBalanceRecord?.balance_date || null

    // Query transactions for this account after starting date
    let query = supabase
      .from('transactions')
      .select('amount')
      .eq('account_id', account.id)

    if (startingDate) {
      query = query.gte('transaction_date', startingDate)
    }

    const { data: transactions, count } = await query

    const transactionSum = (transactions || []).reduce((sum, t) => sum + Number(t.amount), 0)

    accountsWithBalances.push({
      ...account,
      current_balance: startingBalance + transactionSum,
      starting_balance: startingBalanceRecord ? Number(startingBalanceRecord.balance) : null,
      starting_balance_date: startingDate,
      transaction_count: transactions?.length || 0,
    })
  }

  return accountsWithBalances
}

/**
 * Set or update the starting balance for an account.
 * This deletes any existing manual balance records first to ensure
 * only one starting balance exists per account.
 */
export async function setStartingBalance(
  supabase: ReturnType<typeof createClient>,
  accountId: string,
  balance: number,
  balanceDate: string
): Promise<{ success: boolean; error?: string }> {
  // Delete any existing manual balance records for this account
  // This ensures changing the date doesn't create duplicate records
  const { error: deleteError } = await supabase
    .from('account_balances')
    .delete()
    .eq('account_id', accountId)
    .eq('source', 'manual')

  if (deleteError) {
    return { success: false, error: deleteError.message }
  }

  // Insert the new balance record
  const { error: insertError } = await supabase
    .from('account_balances')
    .insert({
      account_id: accountId,
      balance_date: balanceDate,
      balance,
      source: 'manual',
    })

  if (insertError) {
    return { success: false, error: insertError.message }
  }

  return { success: true }
}

/**
 * Record a manual balance override/snapshot
 */
export async function recordBalanceSnapshot(
  supabase: ReturnType<typeof createClient>,
  accountId: string,
  balance: number,
  balanceDate: string,
  source: 'manual' | 'import' | 'calculated' = 'manual'
): Promise<{ success: boolean; error?: string }> {
  const { error } = await supabase
    .from('account_balances')
    .upsert(
      {
        account_id: accountId,
        balance_date: balanceDate,
        balance,
        source,
      },
      { onConflict: 'account_id,balance_date' }
    )

  if (error) {
    return { success: false, error: error.message }
  }

  return { success: true }
}

/**
 * Find account by QB account name mapping
 */
export function findAccountForQBName(
  qbAccountName: string | null,
  accounts: Account[]
): Account | null {
  if (!qbAccountName) return null

  const normalizedQbName = qbAccountName.toLowerCase().trim()

  for (const account of accounts) {
    if (account.qb_account_names && Array.isArray(account.qb_account_names)) {
      for (const mappedName of account.qb_account_names) {
        if (mappedName.toLowerCase().trim() === normalizedQbName) {
          return account
        }
      }
    }
  }

  return null
}

/**
 * Group accounts by their type (assets vs liabilities) and active status
 */
export function groupAccountsByType(accounts: AccountWithBalance[]): {
  assets: AccountWithBalance[]
  liabilities: AccountWithBalance[]
  inactive: AccountWithBalance[]
} {
  const assets: AccountWithBalance[] = []
  const liabilities: AccountWithBalance[] = []
  const inactive: AccountWithBalance[] = []

  for (const account of accounts) {
    if (!account.is_active) {
      inactive.push(account)
    } else if (isLiabilityAccount(account.account_type)) {
      liabilities.push(account)
    } else {
      assets.push(account)
    }
  }

  return { assets, liabilities, inactive }
}

/**
 * Calculate totals for assets, liabilities, and net worth
 */
export function calculateNetWorthTotals(accounts: AccountWithBalance[]): {
  totalAssets: number
  totalLiabilities: number
  netWorth: number
} {
  const { assets, liabilities } = groupAccountsByType(accounts)

  const totalAssets = assets.reduce((sum, a) => sum + a.current_balance, 0)
  // Liabilities are typically stored as positive numbers (amount owed)
  const totalLiabilities = Math.abs(liabilities.reduce((sum, a) => sum + a.current_balance, 0))
  const netWorth = totalAssets - totalLiabilities

  return { totalAssets, totalLiabilities, netWorth }
}
