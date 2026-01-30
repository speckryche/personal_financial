import Papa from 'papaparse'
import * as XLSX from 'xlsx'
import type { Transaction, TransactionType } from '@/types/database'

export interface QuickBooksTransaction {
  Date: string
  'Transaction Type': string
  Num?: string
  Name?: string
  Memo?: string
  Account?: string
  Split?: string
  Amount: string
  Class?: string
}

export interface ParsedTransaction {
  transaction_date: string
  description: string
  amount: number
  transaction_type: TransactionType
  memo: string | null
  qb_transaction_type: string | null
  qb_num: string | null
  qb_name: string | null
  qb_class: string | null
  qb_split: string | null
  qb_account: string | null // "Account full name" column - used for category mapping
}

export interface ParseResult {
  transactions: ParsedTransaction[]
  errors: string[]
  rowCount: number
  skippedCount: number
}

function parseDate(dateStr: string): string | null {
  if (!dateStr) return null

  // Try different date formats
  const formats = [
    // MM/DD/YYYY
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/,
    // YYYY-MM-DD
    /^(\d{4})-(\d{2})-(\d{2})$/,
    // MM-DD-YYYY
    /^(\d{1,2})-(\d{1,2})-(\d{4})$/,
  ]

  for (const format of formats) {
    const match = dateStr.match(format)
    if (match) {
      if (format === formats[0]) {
        // MM/DD/YYYY
        const [, month, day, year] = match
        return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
      } else if (format === formats[1]) {
        // YYYY-MM-DD
        return dateStr
      } else if (format === formats[2]) {
        // MM-DD-YYYY
        const [, month, day, year] = match
        return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
      }
    }
  }

  // Try native parsing as fallback
  const date = new Date(dateStr)
  if (!isNaN(date.getTime())) {
    return date.toISOString().split('T')[0]
  }

  return null
}

function parseAmount(amountStr: string): number {
  if (!amountStr) return 0

  // Remove currency symbols and commas
  const cleaned = amountStr.replace(/[$,\s]/g, '').replace(/\((.+)\)/, '-$1')
  const amount = parseFloat(cleaned)

  return isNaN(amount) ? 0 : amount
}

function determineTransactionType(amount: number, qbType: string): TransactionType {
  // QuickBooks transaction types that typically indicate income
  const incomeTypes = ['Deposit', 'Payment', 'Invoice', 'Sales Receipt', 'Credit']
  const expenseTypes = ['Check', 'Bill', 'Expense', 'Credit Card', 'Debit']

  if (incomeTypes.some(t => qbType?.toLowerCase().includes(t.toLowerCase())) || amount > 0) {
    return 'income'
  }
  if (expenseTypes.some(t => qbType?.toLowerCase().includes(t.toLowerCase())) || amount < 0) {
    return 'expense'
  }
  if (qbType?.toLowerCase().includes('transfer')) {
    return 'transfer'
  }

  // Default based on amount sign
  return amount >= 0 ? 'income' : 'expense'
}

// Common function to process a row of QuickBooks data
function processQuickBooksRow(
  row: Record<string, unknown>,
  rowNum: number,
  errors: string[]
): ParsedTransaction | null {
  // Find the date column - QuickBooks uses various column names
  const dateValue = findColumnValue(row, ['Date', 'Trans Date', 'Transaction Date', 'Txn Date'])
  const amountValue = findColumnValue(row, ['Amount', 'Total', 'Debit', 'Credit'])

  // Skip rows without date or amount
  if (!dateValue || !amountValue) {
    return null
  }

  const date = parseDate(String(dateValue))
  if (!date) {
    errors.push(`Row ${rowNum}: Invalid date format "${dateValue}"`)
    return null
  }

  const amount = parseAmount(String(amountValue))
  const transactionType = findColumnValue(row, ['Transaction Type', 'Type', 'Txn Type'])
  const txnType = determineTransactionType(amount, String(transactionType || ''))

  // Build description from available fields
  const name = findColumnValue(row, ['Name', 'Payee', 'Customer', 'Vendor'])
  const memo = findColumnValue(row, ['Memo', 'Description', 'Memo/Description'])

  const description = [name, memo, transactionType]
    .filter(Boolean)
    .join(' - ') || 'Unknown'

  // Get "Account full name" specifically for category mapping
  // Use findLastColumnValue because QB reports often have TWO columns named "Account full name"
  // Column D = source account, Column E = expense/category account (the one we want)
  const accountFullName = findLastColumnValue(row, ['Account full name', 'Account Full Name', 'Account full Name'])

  return {
    transaction_date: date,
    description: String(description).substring(0, 500),
    amount,
    transaction_type: txnType,
    memo: memo ? String(memo) : null,
    qb_transaction_type: transactionType ? String(transactionType) : null,
    qb_num: String(findColumnValue(row, ['Num', 'Number', 'Doc Num', 'Ref #']) || '') || null,
    qb_name: name ? String(name) : null,
    qb_class: String(findColumnValue(row, ['Class']) || '') || null,
    qb_split: String(findColumnValue(row, ['Split', 'Category', 'Expense Account']) || '') || null,
    qb_account: accountFullName ? String(accountFullName) : null,
  }
}

// Helper to find a column value using multiple possible column names
function findColumnValue(row: Record<string, unknown>, possibleNames: string[]): unknown {
  for (const name of possibleNames) {
    // Try exact match
    if (row[name] !== undefined && row[name] !== null && row[name] !== '') {
      return row[name]
    }
    // Try case-insensitive match
    const key = Object.keys(row).find(k => k.toLowerCase() === name.toLowerCase())
    if (key && row[key] !== undefined && row[key] !== null && row[key] !== '') {
      return row[key]
    }
  }
  return null
}

// Helper to find the LAST/SECOND occurrence of a column (for duplicate column names)
// CSV/Excel parsers rename duplicates with suffixes like "_1", "_2", etc.
function findLastColumnValue(row: Record<string, unknown>, possibleNames: string[]): unknown {
  const keys = Object.keys(row)
  let lastMatch: unknown = null

  for (const name of possibleNames) {
    const nameLower = name.toLowerCase()

    // Find all matching keys (including those with _1, _2 suffixes)
    for (const key of keys) {
      const keyLower = key.toLowerCase()
      // Match exact name or name with numeric suffix (e.g., "Account full name_1")
      if (
        keyLower === nameLower ||
        keyLower.match(new RegExp(`^${nameLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}_\\d+$`))
      ) {
        const value = row[key]
        if (value !== undefined && value !== null && value !== '') {
          lastMatch = value
        }
      }
    }
  }

  return lastMatch
}

// Check if a row looks like it contains headers (has Date and Amount-like columns)
function isHeaderRow(row: string[]): boolean {
  const headerKeywords = ['date', 'amount', 'total', 'transaction type', 'type', 'account', 'name']
  const rowLower = row.map(cell => (cell || '').toString().toLowerCase().trim())

  // Need at least 2 header-like columns to consider it a header row
  let matches = 0
  for (const keyword of headerKeywords) {
    if (rowLower.some(cell => cell.includes(keyword))) {
      matches++
    }
  }
  return matches >= 2
}

export function parseQuickBooksTransactions(csvContent: string): Promise<ParseResult> {
  return new Promise((resolve) => {
    const errors: string[] = []
    const transactions: ParsedTransaction[] = []
    let rowCount = 0
    let skippedCount = 0

    // First, parse without headers to find the header row
    // QuickBooks reports often have title rows before the actual headers
    Papa.parse(csvContent, {
      header: false,
      skipEmptyLines: true,
      complete: (rawResults) => {
        const rawData = rawResults.data as string[][]

        // Find the header row (look in first 10 rows)
        let headerRowIndex = 0
        for (let i = 0; i < Math.min(10, rawData.length); i++) {
          if (isHeaderRow(rawData[i])) {
            headerRowIndex = i
            break
          }
        }

        // Now parse again with the correct header row
        // Skip rows before the header
        const linesToSkip = headerRowIndex
        const lines = csvContent.split('\n')
        const contentFromHeaders = lines.slice(linesToSkip).join('\n')

        Papa.parse<QuickBooksTransaction>(contentFromHeaders, {
          header: true,
          skipEmptyLines: true,
          transformHeader: (header) => header.trim(),
          complete: (results) => {
            rowCount = results.data.length

            for (let i = 0; i < results.data.length; i++) {
              const row = results.data[i] as unknown as Record<string, unknown>
              const rowNum = i + headerRowIndex + 2

              const transaction = processQuickBooksRow(row, rowNum, errors)
              if (transaction) {
                transactions.push(transaction)
              } else {
                skippedCount++
              }
            }

            resolve({
              transactions,
              errors,
              rowCount,
              skippedCount,
            })
          },
          error: (error: Error) => {
            errors.push(`Parse error: ${error.message}`)
            resolve({
              transactions: [],
              errors,
              rowCount: 0,
              skippedCount: 0,
            })
          },
        })
      },
      error: (error: Error) => {
        errors.push(`Parse error: ${error.message}`)
        resolve({
          transactions: [],
          errors,
          rowCount: 0,
          skippedCount: 0,
        })
      },
    })
  })
}

// Parse Excel files (XLS/XLSX)
export function parseQuickBooksExcel(buffer: ArrayBuffer): ParseResult {
  const errors: string[] = []
  const transactions: ParsedTransaction[] = []
  let rowCount = 0
  let skippedCount = 0

  try {
    const workbook = XLSX.read(buffer, { type: 'array', cellDates: true })

    // Get the first sheet
    const sheetName = workbook.SheetNames[0]
    if (!sheetName) {
      errors.push('No sheets found in Excel file')
      return { transactions: [], errors, rowCount: 0, skippedCount: 0 }
    }

    const sheet = workbook.Sheets[sheetName]

    // First, get raw data to find the header row
    // QuickBooks reports have title rows before the actual headers
    const rawData = XLSX.utils.sheet_to_json<string[]>(sheet, {
      header: 1, // Return array of arrays
      defval: '',
      raw: false,
    })

    // Find the header row (look in first 10 rows)
    let headerRowIndex = 0
    for (let i = 0; i < Math.min(10, rawData.length); i++) {
      const row = rawData[i]
      if (Array.isArray(row) && isHeaderRow(row.map(cell => String(cell || '')))) {
        headerRowIndex = i
        break
      }
    }

    // Now convert to JSON starting from the header row
    const data = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
      defval: '',
      raw: false,
      range: headerRowIndex, // Start from the header row
    })

    rowCount = data.length

    for (let i = 0; i < data.length; i++) {
      const row = data[i]
      const rowNum = i + headerRowIndex + 2

      const transaction = processQuickBooksRow(row, rowNum, errors)
      if (transaction) {
        transactions.push(transaction)
      } else {
        skippedCount++
      }
    }

    return {
      transactions,
      errors,
      rowCount,
      skippedCount,
    }
  } catch (error) {
    errors.push(`Excel parse error: ${error instanceof Error ? error.message : 'Unknown error'}`)
    return {
      transactions: [],
      errors,
      rowCount: 0,
      skippedCount: 0,
    }
  }
}

// Parse QuickBooks Balance Sheet CSV
export interface BalanceSheetRow {
  Account: string
  Balance: string
  Date?: string
}

export interface ParsedBalance {
  account_name: string
  balance: number
  balance_date: string
}

export function parseQuickBooksBalanceSheet(csvContent: string, asOfDate?: string): Promise<{
  balances: ParsedBalance[]
  errors: string[]
}> {
  return new Promise((resolve) => {
    const errors: string[] = []
    const balances: ParsedBalance[] = []
    const date = asOfDate || new Date().toISOString().split('T')[0]

    Papa.parse<BalanceSheetRow>(csvContent, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (header) => header.trim(),
      complete: (results) => {
        for (let i = 0; i < results.data.length; i++) {
          const row = results.data[i]

          if (!row.Account || !row.Balance) continue

          const balance = parseAmount(row.Balance)

          balances.push({
            account_name: row.Account.trim(),
            balance,
            balance_date: date,
          })
        }

        resolve({ balances, errors })
      },
      error: (error: Error) => {
        errors.push(`Parse error: ${error.message}`)
        resolve({ balances: [], errors })
      },
    })
  })
}
