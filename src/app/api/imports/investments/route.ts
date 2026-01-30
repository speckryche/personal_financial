import { createClient } from '@/lib/supabase/server'
import { parseRaymondJamesCSV } from '@/lib/parsers/quickbooks/investment-parser'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const formData = await request.formData()
    const file = formData.get('file') as File
    const accountId = formData.get('accountId') as string | null
    const asOfDate = formData.get('asOfDate') as string | null

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    // Read file content
    const content = await file.text()

    // Parse CSV
    const result = await parseRaymondJamesCSV(content, asOfDate || undefined)

    if (result.errors.length > 0 && result.investments.length === 0) {
      return NextResponse.json(
        { error: 'Failed to parse file', details: result.errors },
        { status: 400 }
      )
    }

    // Create import batch
    const { data: importBatch, error: batchError } = await supabase
      .from('import_batches')
      .insert({
        user_id: user.id,
        filename: file.name,
        file_type: 'raymond_james',
        record_count: result.investments.length,
        status: 'processing',
        metadata: {
          rowCount: result.rowCount,
          skippedCount: result.skippedCount,
          totalValue: result.totalValue,
          errors: result.errors,
        },
      })
      .select()
      .single()

    if (batchError || !importBatch) {
      return NextResponse.json({ error: 'Failed to create import batch' }, { status: 500 })
    }

    const importBatchId = (importBatch as { id: string }).id

    // Delete existing investments for this user on this date (replace strategy)
    if (asOfDate) {
      await supabase
        .from('investments')
        .delete()
        .eq('user_id', user.id)
        .eq('as_of_date', asOfDate)
    }

    // Insert investments
    const investmentsToInsert = result.investments.map((inv) => ({
      user_id: user.id,
      account_id: accountId || null,
      import_batch_id: importBatchId,
      symbol: inv.symbol,
      name: inv.name,
      quantity: inv.quantity,
      cost_basis: inv.cost_basis,
      current_price: inv.current_price,
      current_value: inv.current_value,
      asset_class: inv.asset_class,
      sector: inv.sector,
      as_of_date: inv.as_of_date,
    }))

    const { error: insertError } = await supabase
      .from('investments')
      .insert(investmentsToInsert)

    if (insertError) {
      console.error('Insert error:', insertError)
      await supabase
        .from('import_batches')
        .update({ status: 'failed', error_message: insertError.message })
        .eq('id', importBatchId)

      return NextResponse.json(
        { error: 'Failed to insert investments', details: insertError.message },
        { status: 500 }
      )
    }

    // Update batch status to completed
    await supabase
      .from('import_batches')
      .update({ status: 'completed' })
      .eq('id', importBatchId)

    return NextResponse.json({
      success: true,
      batchId: importBatchId,
      imported: result.investments.length,
      totalValue: result.totalValue,
      skipped: result.skippedCount,
      errors: result.errors,
    })
  } catch (error) {
    console.error('Import error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
