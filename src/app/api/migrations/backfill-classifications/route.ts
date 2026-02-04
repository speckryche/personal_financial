import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

/**
 * One-time migration to backfill qb_account_classifications from existing transactions.
 * This infers income/expense classifications based on:
 * 1. QB account number prefix (4xxx = income, 5xxx-9xxx = expense)
 * 2. Existing transaction types in the database
 */
export async function POST() {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get all unique qb_account values from transactions
    const { data: transactions } = await supabase
      .from('transactions')
      .select('qb_account, transaction_type')
      .eq('user_id', user.id)
      .not('qb_account', 'is', null)

    if (!transactions || transactions.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No transactions found',
        created: 0,
      })
    }

    // Get existing mappings to exclude
    const [accountsRes, categoriesRes, ignoredRes, existingClassRes] = await Promise.all([
      supabase.from('accounts').select('qb_account_names').eq('user_id', user.id),
      supabase.from('categories').select('qb_category_names').eq('user_id', user.id),
      supabase.from('qb_ignored_accounts').select('qb_account_name').eq('user_id', user.id),
      supabase.from('qb_account_classifications').select('qb_account_name').eq('user_id', user.id),
    ])

    // Build sets of already-mapped accounts (lowercase)
    const mappedAccounts = new Set<string>()

    for (const acc of accountsRes.data || []) {
      if (acc.qb_account_names && Array.isArray(acc.qb_account_names)) {
        for (const name of acc.qb_account_names) {
          mappedAccounts.add(name.toLowerCase())
        }
      }
    }

    for (const cat of categoriesRes.data || []) {
      if (cat.qb_category_names && Array.isArray(cat.qb_category_names)) {
        for (const name of cat.qb_category_names) {
          mappedAccounts.add(name.toLowerCase())
        }
      }
    }

    for (const ignored of ignoredRes.data || []) {
      mappedAccounts.add(ignored.qb_account_name.toLowerCase())
    }

    for (const existing of existingClassRes.data || []) {
      mappedAccounts.add(existing.qb_account_name.toLowerCase())
    }

    // Aggregate qb_accounts with their transaction types
    const accountTypes = new Map<string, { income: number; expense: number }>()

    for (const t of transactions) {
      if (!t.qb_account) continue
      const name = t.qb_account
      const existing = accountTypes.get(name) || { income: 0, expense: 0 }

      if (t.transaction_type === 'income') {
        existing.income++
      } else if (t.transaction_type === 'expense') {
        existing.expense++
      }

      accountTypes.set(name, existing)
    }

    // Determine classification for each account
    const classificationsToInsert: { user_id: string; qb_account_name: string; classification: string }[] = []

    for (const [qbAccount, counts] of Array.from(accountTypes.entries())) {
      // Skip if already mapped
      if (mappedAccounts.has(qbAccount.toLowerCase())) {
        continue
      }

      let classification: 'income' | 'expense' | null = null

      // First, try QB number prefix convention
      const match = qbAccount.match(/^(\d)/)
      if (match) {
        switch (match[1]) {
          case '4':
            classification = 'income'
            break
          case '5':
          case '6':
          case '7':
          case '8':
          case '9':
            classification = 'expense'
            break
          case '3':
            // Equity - skip, should be ignored
            continue
          case '1':
          case '2':
            // Asset/liability - skip, should be mapped to accounts
            continue
        }
      }

      // If no number prefix, infer from transaction types
      if (!classification) {
        if (counts.income > counts.expense) {
          classification = 'income'
        } else if (counts.expense > 0) {
          classification = 'expense'
        }
      }

      if (classification) {
        classificationsToInsert.push({
          user_id: user.id,
          qb_account_name: qbAccount,
          classification,
        })
      }
    }

    // Insert classifications
    if (classificationsToInsert.length > 0) {
      const { error } = await supabase
        .from('qb_account_classifications')
        .upsert(classificationsToInsert, { onConflict: 'user_id,qb_account_name' })

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
      }
    }

    return NextResponse.json({
      success: true,
      created: classificationsToInsert.length,
      classifications: classificationsToInsert.map(c => ({
        account: c.qb_account_name,
        type: c.classification,
      })),
    })
  } catch (error) {
    console.error('Migration error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
