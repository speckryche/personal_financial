import Papa from 'papaparse'
import * as XLSX from 'xlsx'
import type { TransactionType } from '@/types/database'

/**
 * Parsed transaction from General Ledger report
 * GL reports show double-entry accounting (both sides of each transaction)
 */
export interface ParsedGLTransaction {
  transaction_date: string
  description: string
  amount: number // Positive for debits, negative for credits
  transaction_type: TransactionType
  memo: string | null
  qb_transaction_type: string | null
  qb_num: string | null
  qb_name: string | null
  qb_account: string | null // The account this entry belongs to (e.g., "1000 Checking - Umpqua")
  split_account: string | null // The counter-account (e.g., "Groceries", "Income - Insero")
  balance: number | null // Running balance if available
}

/**
 * Discovered account from GL report
 */
export interface DiscoveredAccount {
  name: string
  beginningBalance: number | null
  transactionCount: number
  totalDebits: number
  totalCredits: number
  netChange: number
  endingBalance: number | null
  suggestedType: 'checking' | 'savings' | 'credit_card' | 'investment' | 'retirement' | 'loan' | 'mortgage' | 'other'
  isLiability: boolean
  isAsset: boolean
  isIncomeExpenseCategory: boolean // True if this is an income/expense category, not a balance sheet account
}

export interface GLParseResult {
  transactions: ParsedGLTransaction[]
  discoveredAccounts: DiscoveredAccount[]
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

  // Remove currency symbols, commas, and handle parentheses for negatives
  const cleaned = amountStr.replace(/[$,\s]/g, '').replace(/\((.+)\)/, '-$1')
  const amount = parseFloat(cleaned)

  return isNaN(amount) ? 0 : amount
}

/**
 * Guess account type from account name
 * QBO uses account numbers: 1xxx = assets, 2xxx = liabilities, 3xxx = equity, 4xxx = income, 5xxx-9xxx = expenses
 */
function guessAccountType(accountName: string): {
  type: 'checking' | 'savings' | 'credit_card' | 'investment' | 'retirement' | 'loan' | 'mortgage' | 'other'
  isLiability: boolean
  isAsset: boolean
  isIncomeExpenseCategory: boolean
} {
  const nameLower = accountName.toLowerCase()

  // Check for QBO account number prefixes
  const accountNumMatch = accountName.match(/^(\d{4})/)
  if (accountNumMatch) {
    const prefix = accountNumMatch[1][0] // First digit
    // 4xxx = Income accounts
    if (prefix === '4') {
      return { type: 'other', isLiability: false, isAsset: false, isIncomeExpenseCategory: true }
    }
    // 5xxx, 6xxx, 7xxx, 8xxx, 9xxx = Expense categories
    if (['5', '6', '7', '8', '9'].includes(prefix)) {
      return { type: 'other', isLiability: false, isAsset: false, isIncomeExpenseCategory: true }
    }
    // 3xxx = Equity (not a trackable account)
    if (prefix === '3') {
      return { type: 'other', isLiability: false, isAsset: false, isIncomeExpenseCategory: true }
    }
  }

  // ===== BALANCE SHEET ACCOUNTS =====
  // These are financial accounts we want to track balances for

  // Credit cards (often 15xx in QBO)
  if (nameLower.includes('credit card') || nameLower.includes('visa') ||
      nameLower.includes('mastercard') || nameLower.includes('amex') ||
      nameLower.includes('discover') || nameLower.includes('chase sapphire')) {
    return { type: 'credit_card', isLiability: true, isAsset: false, isIncomeExpenseCategory: false }
  }

  // HELOC / Lines of credit
  if (nameLower.includes('heloc') || nameLower.includes('line of credit') ||
      nameLower.includes('credit line')) {
    return { type: 'loan', isLiability: true, isAsset: false, isIncomeExpenseCategory: false }
  }

  // Loans (often 2xxx in QBO)
  if (nameLower.includes('loan')) {
    return { type: 'loan', isLiability: true, isAsset: false, isIncomeExpenseCategory: false }
  }

  // Mortgage
  if (nameLower.includes('mortgage')) {
    return { type: 'mortgage', isLiability: true, isAsset: false, isIncomeExpenseCategory: false }
  }

  // Savings
  if (nameLower.includes('savings') || nameLower.includes('money market') ||
      nameLower.includes('enhanced savings')) {
    return { type: 'savings', isLiability: false, isAsset: true, isIncomeExpenseCategory: false }
  }

  // Checking (often 10xx in QBO)
  if (nameLower.includes('checking')) {
    return { type: 'checking', isLiability: false, isAsset: true, isIncomeExpenseCategory: false }
  }

  // Retirement accounts
  if (nameLower.includes('401k') || nameLower.includes('ira') ||
      nameLower.includes('retirement') || nameLower.includes('pension') ||
      nameLower.includes('sep ira') || nameLower.includes('simple ira')) {
    return { type: 'retirement', isLiability: false, isAsset: true, isIncomeExpenseCategory: false }
  }

  // Investment
  if (nameLower.includes('investment') || nameLower.includes('brokerage') ||
      nameLower.includes('schwab') || nameLower.includes('fidelity') ||
      nameLower.includes('vanguard') || nameLower.includes('ameritrade') ||
      nameLower.includes('morgan stanley') || nameLower.includes('raymond james') ||
      nameLower.includes('crypto')) {
    return { type: 'investment', isLiability: false, isAsset: true, isIncomeExpenseCategory: false }
  }

  // Real estate / property assets
  if (nameLower.includes('house') || nameLower.includes('property') ||
      nameLower.includes('real estate') || nameLower.includes('rv') ||
      nameLower.includes('tiffin') || nameLower.includes('tiny house') ||
      nameLower.includes('escrow') || nameLower.includes('prepaid')) {
    return { type: 'other', isLiability: false, isAsset: true, isIncomeExpenseCategory: false }
  }

  // Accounts payable and other liabilities
  if (nameLower.includes('payable') || nameLower.includes('liability') ||
      nameLower.includes('accrued')) {
    return { type: 'other', isLiability: true, isAsset: false, isIncomeExpenseCategory: false }
  }

  // Asset accounts with 1xxx prefix
  if (accountNumMatch && accountNumMatch[1][0] === '1') {
    return { type: 'other', isLiability: false, isAsset: true, isIncomeExpenseCategory: false }
  }

  // Liability accounts with 2xxx prefix
  if (accountNumMatch && accountNumMatch[1][0] === '2') {
    return { type: 'other', isLiability: true, isAsset: false, isIncomeExpenseCategory: false }
  }

  // ===== DEFAULT: INCOME/EXPENSE CATEGORY =====
  // If it doesn't match any balance sheet account pattern above,
  // and doesn't have a 1xxx or 2xxx prefix, it's an income/expense category
  // This catches things like "Dining", "Groceries", "Pet expense", "Amazon Purchases", etc.
  return { type: 'other', isLiability: false, isAsset: false, isIncomeExpenseCategory: true }
}

/**
 * Determine transaction type from amount and account context
 * In QBO GL export: positive amounts increase the account, negative decrease it
 */
function determineTransactionType(
  amount: number,
  accountName: string,
  splitAccount: string | null,
  transactionType: string | null
): TransactionType {
  const txnType = (transactionType || '').toLowerCase()

  // Deposits are income
  if (txnType === 'deposit') {
    return 'income'
  }

  // Check if split account suggests income or expense
  // Be careful not to match "Income Taxes" or similar expense categories
  const splitLower = (splitAccount || '').toLowerCase()
  if (splitLower.includes('income') && !splitLower.includes('income tax')) {
    // Additional check: if it starts with "Income" or contains "Income -" it's likely income
    // But "Income Taxes" is an expense category
    if (splitLower.startsWith('income') || splitLower.includes('income -') || splitLower.includes('income:')) {
      return 'income'
    }
  }

  // Credit card payments, loan payments, etc. from checking are transfers/expenses
  if (txnType.includes('payment') || txnType.includes('credit card')) {
    return 'expense'
  }

  // Expenses are expenses
  if (txnType === 'expense' || txnType === 'credit card expense') {
    return 'expense'
  }

  // Check and bill are expenses
  if (txnType === 'check' || txnType === 'bill' || txnType === 'bill payment') {
    return 'expense'
  }

  // Default based on amount sign
  // For asset accounts (checking): negative = expense, positive = income
  // For liability accounts (credit card): positive = expense (charge), negative = payment/credit
  const { isLiability } = guessAccountType(accountName)

  if (isLiability) {
    // On a credit card: positive amounts = charges (expenses)
    return amount > 0 ? 'expense' : 'expense' // Even credits/payments show as expense adjustments
  } else {
    // On checking/savings: negative = expense, positive = income
    return amount < 0 ? 'expense' : 'income'
  }
}

/**
 * QBO General Ledger CSV format (based on actual export):
 * Row 1: "General Ledger"
 * Row 2: Company name
 * Row 3: Date range
 * Row 4: empty
 * Row 5: Headers - ",Distribution account,Transaction date,Transaction type,Num,Name,Memo/Description,Split account,Amount,Balance"
 *
 * Data rows have two patterns:
 * 1. Account section header: "1000 Checking - Umpqua 5658,,,,,,,,," (account name in first column)
 * 2. Beginning balance: ",Beginning Balance,,,,,,,90,124.79" (balance in Amount column)
 * 3. Transaction: ",1000 Checking - Umpqua 5658,01/02/2026,Expense,,PennyMac,,,"-2,562.45","87,562.34""
 * 4. Total row: "Total for 1000 Checking - Umpqua 5658,,,,,,,,"-$53,277.15","
 */

interface AccountSection {
  name: string
  beginningBalance: number
  transactions: ParsedGLTransaction[]
  endingBalance: number | null
}

/**
 * Parse QBO General Ledger CSV
 */
export async function parseGeneralLedgerCSV(csvContent: string): Promise<GLParseResult> {
  const errors: string[] = []
  const transactions: ParsedGLTransaction[] = []
  const accountSections = new Map<string, AccountSection>()
  let rowCount = 0
  let skippedCount = 0

  // Parse CSV with no headers initially to handle the multi-line header
  const rawResult = Papa.parse(csvContent, {
    header: false,
    skipEmptyLines: false,
  })

  const rawData = rawResult.data as string[][]
  rowCount = rawData.length

  // Find the header row (contains "Distribution account")
  let headerRowIndex = -1
  for (let i = 0; i < Math.min(10, rawData.length); i++) {
    const row = rawData[i]
    if (row.some(cell => cell && cell.toLowerCase().includes('distribution account'))) {
      headerRowIndex = i
      break
    }
  }

  if (headerRowIndex === -1) {
    errors.push('Could not find header row with "Distribution account" column')
    return { transactions: [], discoveredAccounts: [], errors, rowCount, skippedCount }
  }

  // Get column indices from header row
  const headers = rawData[headerRowIndex].map(h => (h || '').trim().toLowerCase())
  const colIndex = {
    accountHeader: 0, // First column - account section headers
    distributionAccount: headers.indexOf('distribution account'),
    transactionDate: headers.indexOf('transaction date'),
    transactionType: headers.indexOf('transaction type'),
    num: headers.indexOf('num'),
    name: headers.indexOf('name'),
    memo: headers.findIndex(h => h.includes('memo') || h.includes('description')),
    splitAccount: headers.indexOf('split account'),
    amount: headers.indexOf('amount'),
    balance: headers.indexOf('balance'),
  }

  let currentAccountName: string | null = null
  let currentAccountBeginningBalance: number | null = null

  // Process data rows (after header)
  for (let i = headerRowIndex + 1; i < rawData.length; i++) {
    const row = rawData[i]
    if (!row || row.every(cell => !cell || cell.trim() === '')) {
      skippedCount++
      continue
    }

    const firstCell = (row[colIndex.accountHeader] || '').trim()
    const distributionAccount = (row[colIndex.distributionAccount] || '').trim()

    // Check if this is an account section header (account name in first column, rest empty)
    if (firstCell && !firstCell.toLowerCase().startsWith('total') && !distributionAccount) {
      // Skip deleted accounts entirely
      if (firstCell.toLowerCase().includes('(deleted)') || firstCell.toLowerCase().includes('deleted')) {
        currentAccountName = null // Set to null so transactions under this section are skipped
        skippedCount++
        continue
      }

      currentAccountName = firstCell
      currentAccountBeginningBalance = null
      if (!accountSections.has(currentAccountName)) {
        accountSections.set(currentAccountName, {
          name: currentAccountName,
          beginningBalance: 0,
          transactions: [],
          endingBalance: null,
        })
      }
      skippedCount++
      continue
    }

    // Check if this is a "Total for..." row
    if (firstCell.toLowerCase().startsWith('total')) {
      // Get the ending net change from amount column
      const amountStr = row[colIndex.amount] || ''
      const section = currentAccountName ? accountSections.get(currentAccountName) : null
      if (section && amountStr) {
        section.endingBalance = parseAmount(amountStr)
      }
      skippedCount++
      continue
    }

    // Check if this is a "Beginning Balance" row
    if (distributionAccount.toLowerCase() === 'beginning balance') {
      const balanceStr = row[colIndex.balance] || row[colIndex.amount] || ''
      currentAccountBeginningBalance = parseAmount(balanceStr)
      const section = currentAccountName ? accountSections.get(currentAccountName) : null
      if (section) {
        section.beginningBalance = currentAccountBeginningBalance
      }
      skippedCount++
      continue
    }

    // This should be a transaction row
    const dateStr = (row[colIndex.transactionDate] || '').trim()
    if (!dateStr) {
      skippedCount++
      continue
    }

    const date = parseDate(dateStr)
    if (!date) {
      errors.push(`Row ${i + 1}: Invalid date format "${dateStr}"`)
      skippedCount++
      continue
    }

    const amountStr = (row[colIndex.amount] || '').trim()
    const amount = parseAmount(amountStr)

    // Skip zero-amount rows
    if (amount === 0) {
      skippedCount++
      continue
    }

    const transactionType = (row[colIndex.transactionType] || '').trim()
    const num = (row[colIndex.num] || '').trim()
    const name = (row[colIndex.name] || '').trim()
    const memo = (row[colIndex.memo] || '').trim()
    const splitAccount = (row[colIndex.splitAccount] || '').trim()
    const balanceStr = (row[colIndex.balance] || '').trim()
    const balance = balanceStr ? parseAmount(balanceStr) : null

    // Build description from name and memo
    const description = [name, memo].filter(Boolean).join(' - ') || transactionType || 'Unknown'

    // Determine transaction type
    const txnType = determineTransactionType(amount, currentAccountName || '', splitAccount, transactionType)

    const transaction: ParsedGLTransaction = {
      transaction_date: date,
      description: description.substring(0, 500),
      amount,
      transaction_type: txnType,
      memo: memo || null,
      qb_transaction_type: transactionType || null,
      qb_num: num || null,
      qb_name: name || null,
      qb_account: currentAccountName,
      split_account: splitAccount || null,
      balance,
    }

    transactions.push(transaction)

    // Add to account section
    const section = currentAccountName ? accountSections.get(currentAccountName) : null
    if (section) {
      section.transactions.push(transaction)
    }
  }

  // Build discovered accounts from sections
  const discoveredAccounts: DiscoveredAccount[] = []
  for (const [, section] of Array.from(accountSections.entries())) {
    const { type, isLiability, isAsset, isIncomeExpenseCategory } = guessAccountType(section.name)

    let totalDebits = 0
    let totalCredits = 0
    for (const txn of section.transactions) {
      if (txn.amount > 0) {
        totalDebits += txn.amount
      } else {
        totalCredits += Math.abs(txn.amount)
      }
    }

    discoveredAccounts.push({
      name: section.name,
      beginningBalance: section.beginningBalance,
      transactionCount: section.transactions.length,
      totalDebits,
      totalCredits,
      netChange: totalDebits - totalCredits,
      endingBalance: section.endingBalance,
      suggestedType: type,
      isLiability,
      isAsset,
      isIncomeExpenseCategory,
    })
  }

  // Sort: balance sheet accounts first (by type), then income/expense categories
  discoveredAccounts.sort((a, b) => {
    // Balance sheet accounts first
    if (a.isIncomeExpenseCategory !== b.isIncomeExpenseCategory) {
      return a.isIncomeExpenseCategory ? 1 : -1
    }
    // Then by transaction count
    return b.transactionCount - a.transactionCount
  })

  return {
    transactions,
    discoveredAccounts,
    errors,
    rowCount,
    skippedCount,
  }
}


/**
 * Parse QuickBooks General Ledger Excel file
 * Uses the same logic as CSV parser but reads from Excel format
 */
export function parseGeneralLedgerExcel(buffer: ArrayBuffer): GLParseResult {
  try {
    const workbook = XLSX.read(buffer, { type: 'array', cellDates: true })

    const sheetName = workbook.SheetNames[0]
    if (!sheetName) {
      return {
        transactions: [],
        discoveredAccounts: [],
        errors: ['No sheets found in Excel file'],
        rowCount: 0,
        skippedCount: 0,
      }
    }

    const sheet = workbook.Sheets[sheetName]

    // Convert to CSV and use the CSV parser
    const csvContent = XLSX.utils.sheet_to_csv(sheet)

    // parseGeneralLedgerCSV is async, so we need to handle this
    // For Excel, we'll do the same parsing logic inline
    const errors: string[] = []
    const transactions: ParsedGLTransaction[] = []
    const accountSections = new Map<string, {
      name: string
      beginningBalance: number
      transactions: ParsedGLTransaction[]
      endingBalance: number | null
    }>()
    let skippedCount = 0

    // Get raw data
    const rawData = XLSX.utils.sheet_to_json<string[]>(sheet, {
      header: 1,
      defval: '',
      raw: false,
    })

    const rowCount = rawData.length

    // Find the header row (contains "Distribution account")
    let headerRowIndex = -1
    for (let i = 0; i < Math.min(10, rawData.length); i++) {
      const row = rawData[i]
      if (row && row.some(cell => cell && String(cell).toLowerCase().includes('distribution account'))) {
        headerRowIndex = i
        break
      }
    }

    if (headerRowIndex === -1) {
      errors.push('Could not find header row with "Distribution account" column')
      return { transactions: [], discoveredAccounts: [], errors, rowCount, skippedCount }
    }

    // Get column indices from header row
    const headers = rawData[headerRowIndex].map(h => (h || '').toString().trim().toLowerCase())
    const colIndex = {
      accountHeader: 0,
      distributionAccount: headers.indexOf('distribution account'),
      transactionDate: headers.indexOf('transaction date'),
      transactionType: headers.indexOf('transaction type'),
      num: headers.indexOf('num'),
      name: headers.indexOf('name'),
      memo: headers.findIndex(h => h.includes('memo') || h.includes('description')),
      splitAccount: headers.indexOf('split account'),
      amount: headers.indexOf('amount'),
      balance: headers.indexOf('balance'),
    }

    let currentAccountName: string | null = null

    // Process data rows
    for (let i = headerRowIndex + 1; i < rawData.length; i++) {
      const row = rawData[i]
      if (!row || row.every(cell => !cell || String(cell).trim() === '')) {
        skippedCount++
        continue
      }

      const firstCell = (row[colIndex.accountHeader] || '').toString().trim()
      const distributionAccount = (row[colIndex.distributionAccount] || '').toString().trim()

      // Account section header
      if (firstCell && !firstCell.toLowerCase().startsWith('total') && !distributionAccount) {
        // Skip deleted accounts entirely
        if (firstCell.toLowerCase().includes('(deleted)') || firstCell.toLowerCase().includes('deleted')) {
          currentAccountName = null // Set to null so transactions under this section are skipped
          skippedCount++
          continue
        }

        currentAccountName = firstCell
        if (!accountSections.has(currentAccountName)) {
          accountSections.set(currentAccountName, {
            name: currentAccountName,
            beginningBalance: 0,
            transactions: [],
            endingBalance: null,
          })
        }
        skippedCount++
        continue
      }

      // Total row
      if (firstCell.toLowerCase().startsWith('total')) {
        const amountStr = (row[colIndex.amount] || '').toString()
        const section = currentAccountName ? accountSections.get(currentAccountName) : null
        if (section && amountStr) {
          section.endingBalance = parseAmount(amountStr)
        }
        skippedCount++
        continue
      }

      // Beginning Balance row
      if (distributionAccount.toLowerCase() === 'beginning balance') {
        const balanceStr = (row[colIndex.balance] || row[colIndex.amount] || '').toString()
        const section = currentAccountName ? accountSections.get(currentAccountName) : null
        if (section) {
          section.beginningBalance = parseAmount(balanceStr)
        }
        skippedCount++
        continue
      }

      // Transaction row
      const dateStr = (row[colIndex.transactionDate] || '').toString().trim()
      if (!dateStr) {
        skippedCount++
        continue
      }

      const date = parseDate(dateStr)
      if (!date) {
        errors.push(`Row ${i + 1}: Invalid date format "${dateStr}"`)
        skippedCount++
        continue
      }

      const amountStr = (row[colIndex.amount] || '').toString().trim()
      const amount = parseAmount(amountStr)

      if (amount === 0) {
        skippedCount++
        continue
      }

      const transactionType = (row[colIndex.transactionType] || '').toString().trim()
      const num = (row[colIndex.num] || '').toString().trim()
      const name = (row[colIndex.name] || '').toString().trim()
      const memo = (row[colIndex.memo] || '').toString().trim()
      const splitAccount = (row[colIndex.splitAccount] || '').toString().trim()
      const balanceStr = (row[colIndex.balance] || '').toString().trim()
      const balance = balanceStr ? parseAmount(balanceStr) : null

      const description = [name, memo].filter(Boolean).join(' - ') || transactionType || 'Unknown'
      const txnType = determineTransactionType(amount, currentAccountName || '', splitAccount, transactionType)

      const transaction: ParsedGLTransaction = {
        transaction_date: date,
        description: description.substring(0, 500),
        amount,
        transaction_type: txnType,
        memo: memo || null,
        qb_transaction_type: transactionType || null,
        qb_num: num || null,
        qb_name: name || null,
        qb_account: currentAccountName,
        split_account: splitAccount || null,
        balance,
      }

      transactions.push(transaction)

      const section = currentAccountName ? accountSections.get(currentAccountName) : null
      if (section) {
        section.transactions.push(transaction)
      }
    }

    // Build discovered accounts
    const discoveredAccounts: DiscoveredAccount[] = []
    for (const [, section] of Array.from(accountSections.entries())) {
      const { type, isLiability, isAsset, isIncomeExpenseCategory } = guessAccountType(section.name)

      let totalDebits = 0
      let totalCredits = 0
      for (const txn of section.transactions) {
        if (txn.amount > 0) {
          totalDebits += txn.amount
        } else {
          totalCredits += Math.abs(txn.amount)
        }
      }

      discoveredAccounts.push({
        name: section.name,
        beginningBalance: section.beginningBalance,
        transactionCount: section.transactions.length,
        totalDebits,
        totalCredits,
        netChange: totalDebits - totalCredits,
        endingBalance: section.endingBalance,
        suggestedType: type,
        isLiability,
        isAsset,
        isIncomeExpenseCategory,
      })
    }

    discoveredAccounts.sort((a, b) => {
      if (a.isIncomeExpenseCategory !== b.isIncomeExpenseCategory) {
        return a.isIncomeExpenseCategory ? 1 : -1
      }
      return b.transactionCount - a.transactionCount
    })

    return {
      transactions,
      discoveredAccounts,
      errors,
      rowCount,
      skippedCount,
    }
  } catch (error) {
    return {
      transactions: [],
      discoveredAccounts: [],
      errors: [`Excel parse error: ${error instanceof Error ? error.message : 'Unknown error'}`],
      rowCount: 0,
      skippedCount: 0,
    }
  }
}
