import type { AccountWithBalance } from '@/lib/account-balance'
import { isLiabilityAccount } from '@/lib/account-balance'
import { createClient } from '@/lib/supabase/server'

export interface NetWorthBuckets {
  cash: number
  investments: number
  realEstate: number
  crypto: number
  retirement: number
  liabilities: number
  totalAssets: number
  netWorth: number
}

/**
 * Pure function: compute net-worth bucket totals from an accounts array.
 */
export function computeNetWorthBuckets(accounts: AccountWithBalance[]): NetWorthBuckets {
  let cash = 0
  let investments = 0
  let realEstate = 0
  let crypto = 0
  let retirement = 0
  let liabilities = 0

  for (const account of accounts) {
    if (!account.is_active) continue
    const balance = account.display_balance

    if (isLiabilityAccount(account.account_type)) {
      liabilities += Math.abs(balance)
    } else {
      switch (account.account_type) {
        case 'checking':
        case 'savings':
          cash += balance
          break
        case 'investment':
          if (account.name.toLowerCase().includes('crypto')) {
            crypto += balance
          } else {
            investments += balance
          }
          break
        case 'retirement':
          retirement += balance
          break
        default:
          if (account.name.toLowerCase().includes('crypto')) {
            crypto += balance
          } else if (
            account.name.toLowerCase().includes('house') ||
            account.name.toLowerCase().includes('property') ||
            account.name.toLowerCase().includes('real estate')
          ) {
            realEstate += balance
          } else {
            investments += balance
          }
      }
    }
  }

  const totalAssets = cash + investments + realEstate + crypto + retirement
  const netWorth = totalAssets - liabilities

  return { cash, investments, realEstate, crypto, retirement, liabilities, totalAssets, netWorth }
}

/**
 * Upsert today's net-worth snapshot. Uses the UNIQUE(user_id, snapshot_date)
 * constraint so repeat visits on the same day just update the row.
 */
export async function upsertTodaySnapshot(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  buckets: NetWorthBuckets,
) {
  const today = new Date().toISOString().slice(0, 10) // YYYY-MM-DD

  await supabase.from('net_worth_snapshots').upsert(
    {
      user_id: userId,
      snapshot_date: today,
      cash: buckets.cash,
      investments: buckets.investments,
      real_estate: buckets.realEstate,
      crypto: buckets.crypto,
      retirement: buckets.retirement,
      liabilities: buckets.liabilities,
    },
    { onConflict: 'user_id,snapshot_date' },
  )
}

/**
 * Fetch historical snapshots ordered by date ascending.
 * Returns data shaped for the NetWorthChart component.
 */
export async function getSnapshots(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  limit?: number,
) {
  let query = supabase
    .from('net_worth_snapshots')
    .select('*')
    .eq('user_id', userId)
    .order('snapshot_date', { ascending: true })

  if (limit) {
    query = query.limit(limit)
  }

  const { data } = await query

  return (data || []).map((row) => ({
    date: row.snapshot_date,
    netWorth: Number(row.net_worth),
    cash: Number(row.cash),
    investments: Number(row.investments),
    realEstate: Number(row.real_estate),
    crypto: Number(row.crypto),
    retirement: Number(row.retirement),
    liabilities: Number(row.liabilities),
  }))
}
