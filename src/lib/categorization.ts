import type { Category, TransactionType } from '@/types/database'
import { normalizeQBAccountName } from './string-similarity'

/**
 * Determines the transaction type (income/expense) based on QuickBooks transaction type.
 * This is used to match against categories of the appropriate type.
 */
export function getTransactionTypeFromQB(qbTransactionType: string | null): TransactionType {
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

  const transactionType = getTransactionTypeFromQB(qbTransactionType)

  // Step 1: Try exact match (fast path)
  const exactMatch = findExactMatch(qbAccount, categories, transactionType)
  if (exactMatch) return exactMatch

  // Step 2: Try normalized match (handles typos, spacing, abbreviations)
  const normalizedMatch = findNormalizedMatch(qbAccount, categories, transactionType)
  if (normalizedMatch) return normalizedMatch

  return null
}

