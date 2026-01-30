import { createClient } from '@/lib/supabase/server'
import { fetchCryptoHoldings, getCryptoTotalValue } from '@/lib/supabase/crypto-client'
import { NextResponse } from 'next/server'

export async function GET() {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Fetch crypto holdings from external Supabase
    const holdings = await fetchCryptoHoldings()
    const totalValue = await getCryptoTotalValue()

    return NextResponse.json({
      holdings,
      totalValue,
      lastUpdated: new Date().toISOString(),
    })
  } catch (error) {
    console.error('Crypto fetch error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch crypto data' },
      { status: 500 }
    )
  }
}
