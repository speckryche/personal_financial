import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import type { CryptoHolding } from '@/types/database'

// Read-only client for external crypto Supabase database
export function createCryptoClient() {
  const url = process.env.CRYPTO_SUPABASE_URL
  const key = process.env.CRYPTO_SUPABASE_ANON_KEY

  if (!url || !key) {
    console.warn('Crypto Supabase credentials not configured')
    return null
  }

  return createSupabaseClient(url, key)
}

export async function fetchCryptoHoldings(): Promise<CryptoHolding[]> {
  const client = createCryptoClient()
  const userId = process.env.CRYPTO_USER_ID

  if (!client || !userId) {
    return []
  }

  try {
    // Adjust this query based on your crypto app's schema
    const { data, error } = await client
      .from('holdings')
      .select('*')
      .eq('user_id', userId)

    if (error) {
      console.error('Error fetching crypto holdings:', error)
      return []
    }

    return data as CryptoHolding[]
  } catch (error) {
    console.error('Error fetching crypto holdings:', error)
    return []
  }
}

export async function getCryptoTotalValue(): Promise<number> {
  const holdings = await fetchCryptoHoldings()
  return holdings.reduce((sum, h) => sum + (h.current_value || 0), 0)
}
