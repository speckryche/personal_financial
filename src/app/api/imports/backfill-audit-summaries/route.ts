import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

/**
 * One-time backfill endpoint to generate audit summaries for existing imports
 * POST /api/imports/backfill-audit-summaries
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

    // Get all import batches for this user that don't have accountSummaries yet
    const { data: batches, error: batchError } = await supabase
      .from('import_batches')
      .select('id, filename, metadata')
      .eq('user_id', user.id)
      .eq('file_type', 'quickbooks_general_ledger')

    if (batchError) {
      return NextResponse.json({ error: batchError.message }, { status: 500 })
    }

    const results: { batchId: string; filename: string; accountCount: number; status: string }[] = []

    for (const batch of batches || []) {
      // Check if already has accountSummaries
      const metadata = (batch.metadata as Record<string, unknown>) || {}
      if (metadata.accountSummaries && Array.isArray(metadata.accountSummaries) && metadata.accountSummaries.length > 0) {
        results.push({
          batchId: batch.id,
          filename: batch.filename,
          accountCount: metadata.accountSummaries.length,
          status: 'already_exists',
        })
        continue
      }

      // Get all transactions for this batch
      const { data: transactions, error: txnError } = await supabase
        .from('transactions')
        .select('qb_account, amount, transaction_type')
        .eq('import_batch_id', batch.id)
        .range(0, 49999)

      if (txnError) {
        results.push({
          batchId: batch.id,
          filename: batch.filename,
          accountCount: 0,
          status: `error: ${txnError.message}`,
        })
        continue
      }

      if (!transactions || transactions.length === 0) {
        results.push({
          batchId: batch.id,
          filename: batch.filename,
          accountCount: 0,
          status: 'no_transactions',
        })
        continue
      }

      // Group transactions by qb_account
      const accountMap = new Map<string, {
        totalDebits: number
        totalCredits: number
        transactionCount: number
        types: Set<string>
      }>()

      for (const txn of transactions) {
        const qbAccount = txn.qb_account || 'Unknown'
        const amount = Number(txn.amount)

        if (!accountMap.has(qbAccount)) {
          accountMap.set(qbAccount, {
            totalDebits: 0,
            totalCredits: 0,
            transactionCount: 0,
            types: new Set(),
          })
        }

        const acc = accountMap.get(qbAccount)!
        acc.transactionCount++
        if (txn.transaction_type) {
          acc.types.add(txn.transaction_type)
        }

        // In our system, positive = debit (income/asset increase), negative = credit (expense/liability)
        if (amount > 0) {
          acc.totalDebits += amount
        } else {
          acc.totalCredits += Math.abs(amount)
        }
      }

      // Build account summaries
      const accountSummaries = Array.from(accountMap.entries()).map(([name, data]) => {
        // Determine type based on QB account number prefix or transaction types
        let type: 'income' | 'expense' | 'transfer' | 'ignored' = 'transfer'

        const match = name.match(/^(\d)/)
        if (match) {
          if (match[1] === '4') {
            type = 'income'
          } else if (['5', '6', '7', '8', '9'].includes(match[1])) {
            type = 'expense'
          } else if (match[1] === '1' || match[1] === '2') {
            type = 'transfer' // Balance sheet accounts
          }
        } else {
          // No number prefix - check if mostly income or expense transactions
          if (data.types.has('income') && !data.types.has('expense')) {
            type = 'income'
          } else if (data.types.has('expense') && !data.types.has('income')) {
            type = 'expense'
          }
        }

        return {
          name,
          type,
          beginningBalance: null, // Not available from transactions
          totalDebits: data.totalDebits,
          totalCredits: data.totalCredits,
          netChange: data.totalDebits - data.totalCredits,
          endingBalance: null, // Not available from transactions
          transactionCount: data.transactionCount,
        }
      })

      // Sort by transaction count descending
      accountSummaries.sort((a, b) => b.transactionCount - a.transactionCount)

      // Update the batch metadata
      const { error: updateError } = await supabase
        .from('import_batches')
        .update({
          metadata: {
            ...metadata,
            accountSummaries,
          },
        })
        .eq('id', batch.id)

      if (updateError) {
        results.push({
          batchId: batch.id,
          filename: batch.filename,
          accountCount: 0,
          status: `update_error: ${updateError.message}`,
        })
      } else {
        results.push({
          batchId: batch.id,
          filename: batch.filename,
          accountCount: accountSummaries.length,
          status: 'backfilled',
        })
      }
    }

    return NextResponse.json({
      success: true,
      message: `Processed ${results.length} import batches`,
      results,
    })
  } catch (error) {
    console.error('Backfill error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
