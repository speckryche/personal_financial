import Papa from 'papaparse'
import type { Investment } from '@/types/database'

export interface RaymondJamesRow {
  Symbol?: string
  'Security Name'?: string
  Name?: string
  Quantity?: string
  Shares?: string
  'Cost Basis'?: string
  'Cost'?: string
  'Market Value'?: string
  'Current Value'?: string
  'Value'?: string
  Price?: string
  'Current Price'?: string
  'Asset Class'?: string
  'Asset Type'?: string
  Sector?: string
}

export interface ParsedInvestment {
  symbol: string
  name: string | null
  quantity: number
  cost_basis: number | null
  current_price: number | null
  current_value: number | null
  asset_class: string | null
  sector: string | null
  as_of_date: string
}

export interface InvestmentParseResult {
  investments: ParsedInvestment[]
  errors: string[]
  rowCount: number
  skippedCount: number
  totalValue: number
}

function parseNumber(value: string | undefined): number | null {
  if (!value) return null
  const cleaned = value.replace(/[$,\s]/g, '').replace(/\((.+)\)/, '-$1')
  const num = parseFloat(cleaned)
  return isNaN(num) ? null : num
}

export function parseRaymondJamesCSV(
  csvContent: string,
  asOfDate?: string
): Promise<InvestmentParseResult> {
  return new Promise((resolve) => {
    const errors: string[] = []
    const investments: ParsedInvestment[] = []
    let rowCount = 0
    let skippedCount = 0
    let totalValue = 0
    const date = asOfDate || new Date().toISOString().split('T')[0]

    Papa.parse<RaymondJamesRow>(csvContent, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (header) => header.trim(),
      complete: (results) => {
        rowCount = results.data.length

        for (let i = 0; i < results.data.length; i++) {
          const row = results.data[i]
          const rowNum = i + 2

          // Get symbol - required field
          const symbol = row.Symbol?.trim()
          if (!symbol) {
            skippedCount++
            continue
          }

          // Skip cash entries or totals
          if (
            symbol.toLowerCase() === 'cash' ||
            symbol.toLowerCase() === 'total' ||
            symbol.toLowerCase().includes('total')
          ) {
            skippedCount++
            continue
          }

          // Get quantity
          const quantity = parseNumber(row.Quantity || row.Shares)
          if (quantity === null || quantity === 0) {
            skippedCount++
            continue
          }

          // Get name
          const name = row['Security Name'] || row.Name || null

          // Get cost basis
          const costBasis = parseNumber(row['Cost Basis'] || row.Cost)

          // Get current value
          const currentValue = parseNumber(
            row['Market Value'] || row['Current Value'] || row.Value
          )

          // Get current price
          let currentPrice = parseNumber(row.Price || row['Current Price'])
          if (!currentPrice && currentValue && quantity) {
            currentPrice = currentValue / quantity
          }

          // Get asset class
          const assetClass = row['Asset Class'] || row['Asset Type'] || null

          // Get sector
          const sector = row.Sector || null

          if (currentValue) {
            totalValue += currentValue
          }

          investments.push({
            symbol,
            name,
            quantity,
            cost_basis: costBasis,
            current_price: currentPrice,
            current_value: currentValue,
            asset_class: assetClass,
            sector,
            as_of_date: date,
          })
        }

        resolve({
          investments,
          errors,
          rowCount,
          skippedCount,
          totalValue,
        })
      },
      error: (error: Error) => {
        errors.push(`Parse error: ${error.message}`)
        resolve({
          investments: [],
          errors,
          rowCount: 0,
          skippedCount: 0,
          totalValue: 0,
        })
      },
    })
  })
}
