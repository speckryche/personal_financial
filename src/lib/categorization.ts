import type { Category, TransactionType, QBAccountMapping } from '@/types/database'
import { normalizeQBAccountName } from './string-similarity'

/**
 * Looks up transaction type and category from the qb_account_mappings table.
 * This is the preferred method - explicit user mappings by QB Account Name.
 */
export function getFromQBAccountMapping(
  qbAccount: string | null,
  mappings: QBAccountMapping[]
): { transaction_type: TransactionType; category_id: string | null } | null {
  if (!qbAccount || !mappings.length) return null

  const normalizedAccount = qbAccount.toLowerCase().trim()

  for (const mapping of mappings) {
    if (mapping.qb_account_name.toLowerCase().trim() === normalizedAccount) {
      return {
        transaction_type: mapping.transaction_type,
        category_id: mapping.category_id,
      }
    }
  }

  return null
}

/**
 * Determines transaction type based on QB account number prefix.
 * Only works for numbered accounts:
 * - 1xxx, 2xxx, 3xxx = Balance sheet (Assets, Liabilities, Equity) → transfer
 * - 4xxx = Income → income
 * - 5xxx+ = Expense (if numbered)
 *
 * Note: Many expense accounts may not be numbered, so this returns null for those.
 */
export function getTransactionTypeFromQBAccountNumber(qbAccount: string | null): TransactionType | null {
  if (!qbAccount) return null

  // Extract leading digits (account number)
  const match = qbAccount.match(/^(\d)/)
  if (!match) return null

  const firstDigit = match[1]

  switch (firstDigit) {
    case '1':
    case '2':
    case '3':
      return 'transfer' // Balance sheet accounts
    case '4':
      return 'income'
    case '5':
    case '6':
    case '7':
    case '8':
    case '9':
      return 'expense'
    default:
      return null
  }
}

/**
 * Determines transaction type from category mapping.
 * If the QB account is mapped to a category, use that category's type.
 * This is the most reliable method as it uses explicit user mappings.
 */
export function getTransactionTypeFromCategoryMapping(
  qbAccount: string | null,
  categories: Category[]
): TransactionType | null {
  if (!qbAccount || !categories.length) return null

  const normalizedAccount = qbAccount.toLowerCase().trim()

  for (const category of categories) {
    if (category.qb_category_names && Array.isArray(category.qb_category_names)) {
      const hasMatch = category.qb_category_names.some(
        (name) => name.toLowerCase().trim() === normalizedAccount
      )
      if (hasMatch) {
        return category.type as TransactionType
      }
    }
  }

  return null
}

/**
 * Determines the transaction type using the best available information.
 * Priority: Category mapping > QB account number > QB transaction type > default to expense
 */
export function getTransactionType(
  qbAccount: string | null,
  qbTransactionType: string | null,
  categories: Category[] = []
): TransactionType {
  // First, try to determine from category mapping (most reliable - user's explicit mappings)
  const fromMapping = getTransactionTypeFromCategoryMapping(qbAccount, categories)
  if (fromMapping) return fromMapping

  // Then try QB account number (for numbered accounts like 4xxx income)
  const fromAccountNumber = getTransactionTypeFromQBAccountNumber(qbAccount)
  if (fromAccountNumber) return fromAccountNumber

  // Fall back to QB transaction type
  return getTransactionTypeFromQBTransactionType(qbTransactionType)
}

/**
 * Determines the transaction type (income/expense) based on QuickBooks transaction type.
 * This is used to match against categories of the appropriate type.
 */
export function getTransactionTypeFromQBTransactionType(qbTransactionType: string | null): TransactionType {
  if (!qbTransactionType) return 'expense'

  const type = qbTransactionType.toLowerCase()

  // Check expense types FIRST (more specific patterns)
  // This prevents "credit card expense" from matching "credit" as income
  const expenseTypes = [
    'credit card expense',
    'credit card charge',
    'credit card credit', // This is a credit on the card (refund), but still an expense category adjustment
    'credit card',
    'check',
    'bill payment',
    'bill',
    'expense',
    'debit',
    'purchase',
  ]

  // Transfer types
  const transferTypes = ['transfer', 'journal entry']

  // Income types in QuickBooks
  const incomeTypes = [
    'deposit',
    'payment',
    'invoice',
    'sales receipt',
    'refund',
    'sales',
    'income',
  ]

  // Check expense types first (they're more specific)
  if (expenseTypes.some((t) => type.includes(t))) {
    return 'expense'
  }

  if (transferTypes.some((t) => type.includes(t))) {
    return 'transfer'
  }

  if (incomeTypes.some((t) => type.includes(t))) {
    return 'income'
  }

  // Default to expense
  return 'expense'
}

/**
 * Finds an exact match for a QB account in categories (case-insensitive, trimmed)
 */
function findExactMatch(
  qbAccount: string,
  categories: Category[],
  transactionType: TransactionType
): string | null {
  const normalizedAccount = qbAccount.toLowerCase().trim()

  for (const category of categories) {
    if (category.type !== transactionType && transactionType !== 'transfer') {
      continue
    }

    if (category.qb_category_names && Array.isArray(category.qb_category_names)) {
      const hasMatch = category.qb_category_names.some(
        (name) => name.toLowerCase().trim() === normalizedAccount
      )
      if (hasMatch) {
        return category.id
      }
    }
  }

  return null
}

/**
 * Finds a normalized match for a QB account in categories
 * Uses normalizeQBAccountName to handle variations like typos, spacing, abbreviations
 */
function findNormalizedMatch(
  qbAccount: string,
  categories: Category[],
  transactionType: TransactionType
): string | null {
  const normalizedAccount = normalizeQBAccountName(qbAccount)

  for (const category of categories) {
    if (category.type !== transactionType && transactionType !== 'transfer') {
      continue
    }

    if (category.qb_category_names && Array.isArray(category.qb_category_names)) {
      const hasMatch = category.qb_category_names.some(
        (name) => normalizeQBAccountName(name) === normalizedAccount
      )
      if (hasMatch) {
        return category.id
      }
    }
  }

  return null
}

/**
 * Finds a matching category for a transaction based on its QB "Account full name"
 * and transaction type.
 *
 * @param qbAccount - The QuickBooks "Account full name" from the transaction
 * @param qbTransactionType - The QuickBooks transaction type (Check, Deposit, etc.)
 * @param categories - User's categories with their qb_category_names mappings
 * @returns The category_id if a match is found, null otherwise
 */
export function findCategoryForTransaction(
  qbAccount: string | null,
  qbTransactionType: string | null,
  categories: Category[]
): string | null {
  if (!qbAccount || !qbAccount.trim()) {
    return null
  }

  const transactionType = getTransactionTypeFromQBTransactionType(qbTransactionType)

  // Step 1: Try exact match (fast path)
  const exactMatch = findExactMatch(qbAccount, categories, transactionType)
  if (exactMatch) return exactMatch

  // Step 2: Try normalized match (handles typos, spacing, abbreviations)
  const normalizedMatch = findNormalizedMatch(qbAccount, categories, transactionType)
  if (normalizedMatch) return normalizedMatch

  return null
}

