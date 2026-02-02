import type { SupabaseClient } from '@supabase/supabase-js'
import type { Account, Category, AccountType, QBIgnoredAccount } from '@/types/database'
import type { DiscoveredAccount } from '@/lib/parsers/quickbooks/general-ledger-parser'

export type MappingType = 'ignored' | 'asset' | 'liability' | 'income' | 'expense' | 'unmapped'

export interface QBAccountMapping {
  qbAccountName: string
  mappingType: MappingType
  mappedToId?: string      // account_id or category_id
  mappedToName?: string    // for display
  accountType?: AccountType // for balance sheet accounts
  categoryType?: 'income' | 'expense' // for income/expense categories
}

export interface ClassifiedAccount extends DiscoveredAccount {
  mappingType: MappingType
  mappedTo?: {
    id: string
    name: string
    type?: AccountType | 'income' | 'expense'
  }
  suggestion: MappingType  // Based on QB account number prefix
}

export interface AllMappingsResult {
  ignoredAccounts: Set<string>  // lowercase qb_account_name
  accountMappings: Map<string, { accountId: string; accountName: string; accountType: AccountType }>
  categoryMappings: Map<string, { categoryId: string; categoryName: string; categoryType: 'income' | 'expense' }>
}

/**
 * Load all QB account mappings for a user from all three sources:
 * 1. qb_ignored_accounts table
 * 2. accounts.qb_account_names[]
 * 3. categories.qb_category_names[]
 */
export async function getAllQBMappings(
  supabase: SupabaseClient,
  userId: string
): Promise<AllMappingsResult> {
  // Fetch all three sources in parallel
  const [ignoredResult, accountsResult, categoriesResult] = await Promise.all([
    supabase
      .from('qb_ignored_accounts')
      .select('qb_account_name')
      .eq('user_id', userId),
    supabase
      .from('accounts')
      .select('id, name, account_type, qb_account_names')
      .eq('user_id', userId),
    supabase
      .from('categories')
      .select('id, name, type, qb_category_names')
      .eq('user_id', userId),
  ])

  // Build ignored accounts set (lowercase for case-insensitive matching)
  const ignoredAccounts = new Set<string>(
    (ignoredResult.data || []).map((a: { qb_account_name: string }) => a.qb_account_name.toLowerCase())
  )

  // Build account mappings map
  const accountMappings = new Map<string, { accountId: string; accountName: string; accountType: AccountType }>()
  for (const account of (accountsResult.data || []) as Account[]) {
    if (account.qb_account_names && Array.isArray(account.qb_account_names)) {
      for (const qbName of account.qb_account_names) {
        accountMappings.set(qbName.toLowerCase(), {
          accountId: account.id,
          accountName: account.name,
          accountType: account.account_type,
        })
      }
    }
  }

  // Build category mappings map
  const categoryMappings = new Map<string, { categoryId: string; categoryName: string; categoryType: 'income' | 'expense' }>()
  for (const category of (categoriesResult.data || []) as Category[]) {
    if (category.qb_category_names && Array.isArray(category.qb_category_names)) {
      for (const qbName of category.qb_category_names) {
        categoryMappings.set(qbName.toLowerCase(), {
          categoryId: category.id,
          categoryName: category.name,
          categoryType: category.type === 'income' ? 'income' : 'expense',
        })
      }
    }
  }

  return { ignoredAccounts, accountMappings, categoryMappings }
}

/**
 * Determine if an account type is a liability
 */
function isLiabilityAccountType(accountType: AccountType): boolean {
  return ['credit_card', 'loan', 'mortgage'].includes(accountType)
}

/**
 * Classify a single QB account name against existing mappings
 */
export function classifyQBAccount(
  qbAccountName: string,
  mappings: AllMappingsResult
): MappingType {
  const normalizedName = qbAccountName.toLowerCase()

  // 1. Check ignored list
  if (mappings.ignoredAccounts.has(normalizedName)) {
    return 'ignored'
  }

  // 2. Check balance sheet accounts - determine if asset or liability
  const accountMapping = mappings.accountMappings.get(normalizedName)
  if (accountMapping) {
    return isLiabilityAccountType(accountMapping.accountType) ? 'liability' : 'asset'
  }

  // 3. Check income/expense categories
  const categoryMapping = mappings.categoryMappings.get(normalizedName)
  if (categoryMapping) {
    return categoryMapping.categoryType === 'income' ? 'income' : 'expense'
  }

  // 4. Not found in any mapping
  return 'unmapped'
}

/**
 * Suggest a mapping type based on QB account number prefix
 * QBO uses: 1xxx=assets, 2xxx=liabilities, 3xxx=equity, 4xxx=income, 5xxx-9xxx=expenses
 */
export function suggestMappingType(qbAccountName: string): MappingType {
  // Extract account number prefix (e.g., "1000 Checking" -> "1")
  const match = qbAccountName.match(/^(\d)/)
  if (!match) {
    // Named accounts without numbers - default to expense (most common)
    return 'expense'
  }

  switch (match[1]) {
    case '1': return 'asset'      // Assets
    case '2': return 'liability'  // Liabilities
    case '3': return 'ignored'    // Equity (Retained Earnings, Owner's Draw, etc.)
    case '4': return 'income'     // Income
    default:  return 'expense'    // 5-9 = Expenses
  }
}

/**
 * Classify all discovered accounts against existing mappings
 */
export function classifyDiscoveredAccounts(
  discoveredAccounts: DiscoveredAccount[],
  mappings: AllMappingsResult
): {
  unmapped: ClassifiedAccount[]
  mapped: ClassifiedAccount[]
} {
  const unmapped: ClassifiedAccount[] = []
  const mapped: ClassifiedAccount[] = []

  for (const account of discoveredAccounts) {
    const normalizedName = account.name.toLowerCase()
    const mappingType = classifyQBAccount(account.name, mappings)
    const suggestion = suggestMappingType(account.name)

    let mappedTo: ClassifiedAccount['mappedTo'] = undefined

    if (mappingType === 'asset' || mappingType === 'liability') {
      const mapping = mappings.accountMappings.get(normalizedName)
      if (mapping) {
        mappedTo = {
          id: mapping.accountId,
          name: mapping.accountName,
          type: mapping.accountType,
        }
      }
    } else if (mappingType === 'income' || mappingType === 'expense') {
      const mapping = mappings.categoryMappings.get(normalizedName)
      if (mapping) {
        mappedTo = {
          id: mapping.categoryId,
          name: mapping.categoryName,
          type: mapping.categoryType,
        }
      }
    }

    const classifiedAccount: ClassifiedAccount = {
      ...account,
      mappingType,
      mappedTo,
      suggestion,
    }

    if (mappingType === 'unmapped') {
      unmapped.push(classifiedAccount)
    } else {
      mapped.push(classifiedAccount)
    }
  }

  return { unmapped, mapped }
}

/**
 * Add a QB account to the ignored list
 */
export async function addIgnoredAccount(
  supabase: SupabaseClient,
  userId: string,
  qbAccountName: string
): Promise<{ success: boolean; error?: string }> {
  const { error } = await supabase
    .from('qb_ignored_accounts')
    .upsert(
      { user_id: userId, qb_account_name: qbAccountName },
      { onConflict: 'user_id,qb_account_name' }
    )

  if (error) {
    return { success: false, error: error.message }
  }

  return { success: true }
}

/**
 * Remove a QB account from the ignored list
 */
export async function removeIgnoredAccount(
  supabase: SupabaseClient,
  userId: string,
  qbAccountName: string
): Promise<{ success: boolean; error?: string }> {
  const { error } = await supabase
    .from('qb_ignored_accounts')
    .delete()
    .eq('user_id', userId)
    .eq('qb_account_name', qbAccountName)

  if (error) {
    return { success: false, error: error.message }
  }

  return { success: true }
}

/**
 * Add a QB account name to an existing account's qb_account_names array
 */
export async function addQBNameToAccount(
  supabase: SupabaseClient,
  accountId: string,
  qbAccountName: string
): Promise<{ success: boolean; error?: string }> {
  // First fetch current qb_account_names
  const { data: account, error: fetchError } = await supabase
    .from('accounts')
    .select('qb_account_names')
    .eq('id', accountId)
    .single()

  if (fetchError) {
    return { success: false, error: fetchError.message }
  }

  const currentNames = (account?.qb_account_names || []) as string[]

  // Check if already exists (case-insensitive)
  const normalizedNew = qbAccountName.toLowerCase()
  if (currentNames.some(n => n.toLowerCase() === normalizedNew)) {
    return { success: true } // Already mapped
  }

  // Add the new name
  const { error: updateError } = await supabase
    .from('accounts')
    .update({ qb_account_names: [...currentNames, qbAccountName] })
    .eq('id', accountId)

  if (updateError) {
    return { success: false, error: updateError.message }
  }

  return { success: true }
}

/**
 * Remove a QB account name from an account's qb_account_names array
 */
export async function removeQBNameFromAccount(
  supabase: SupabaseClient,
  accountId: string,
  qbAccountName: string
): Promise<{ success: boolean; error?: string }> {
  // First fetch current qb_account_names
  const { data: account, error: fetchError } = await supabase
    .from('accounts')
    .select('qb_account_names')
    .eq('id', accountId)
    .single()

  if (fetchError) {
    return { success: false, error: fetchError.message }
  }

  const currentNames = (account?.qb_account_names || []) as string[]
  const normalizedRemove = qbAccountName.toLowerCase()
  const updatedNames = currentNames.filter(n => n.toLowerCase() !== normalizedRemove)

  const { error: updateError } = await supabase
    .from('accounts')
    .update({ qb_account_names: updatedNames })
    .eq('id', accountId)

  if (updateError) {
    return { success: false, error: updateError.message }
  }

  return { success: true }
}

/**
 * Add a QB account name to a category's qb_category_names array
 */
export async function addQBNameToCategory(
  supabase: SupabaseClient,
  categoryId: string,
  qbAccountName: string
): Promise<{ success: boolean; error?: string }> {
  // First fetch current qb_category_names
  const { data: category, error: fetchError } = await supabase
    .from('categories')
    .select('qb_category_names')
    .eq('id', categoryId)
    .single()

  if (fetchError) {
    return { success: false, error: fetchError.message }
  }

  const currentNames = (category?.qb_category_names || []) as string[]

  // Check if already exists (case-insensitive)
  const normalizedNew = qbAccountName.toLowerCase()
  if (currentNames.some(n => n.toLowerCase() === normalizedNew)) {
    return { success: true } // Already mapped
  }

  // Add the new name
  const { error: updateError } = await supabase
    .from('categories')
    .update({ qb_category_names: [...currentNames, qbAccountName] })
    .eq('id', categoryId)

  if (updateError) {
    return { success: false, error: updateError.message }
  }

  return { success: true }
}

/**
 * Remove a QB account name from a category's qb_category_names array
 */
export async function removeQBNameFromCategory(
  supabase: SupabaseClient,
  categoryId: string,
  qbAccountName: string
): Promise<{ success: boolean; error?: string }> {
  // First fetch current qb_category_names
  const { data: category, error: fetchError } = await supabase
    .from('categories')
    .select('qb_category_names')
    .eq('id', categoryId)
    .single()

  if (fetchError) {
    return { success: false, error: fetchError.message }
  }

  const currentNames = (category?.qb_category_names || []) as string[]
  const normalizedRemove = qbAccountName.toLowerCase()
  const updatedNames = currentNames.filter(n => n.toLowerCase() !== normalizedRemove)

  const { error: updateError } = await supabase
    .from('categories')
    .update({ qb_category_names: updatedNames })
    .eq('id', categoryId)

  if (updateError) {
    return { success: false, error: updateError.message }
  }

  return { success: true }
}

/**
 * Get all QB mappings as a flat list for display in settings
 */
export async function getAllQBMappingsAsList(
  supabase: SupabaseClient,
  userId: string
): Promise<QBAccountMapping[]> {
  const mappings = await getAllQBMappings(supabase, userId)
  const result: QBAccountMapping[] = []

  // Add ignored accounts
  Array.from(mappings.ignoredAccounts).forEach(qbName => {
    result.push({
      qbAccountName: qbName,
      mappingType: 'ignored',
    })
  })

  // Add account mappings (determine if asset or liability based on account type)
  Array.from(mappings.accountMappings.entries()).forEach(([qbName, mapping]) => {
    const mappingType = isLiabilityAccountType(mapping.accountType) ? 'liability' : 'asset'
    result.push({
      qbAccountName: qbName,
      mappingType,
      mappedToId: mapping.accountId,
      mappedToName: mapping.accountName,
      accountType: mapping.accountType,
    })
  })

  // Add category mappings
  Array.from(mappings.categoryMappings.entries()).forEach(([qbName, mapping]) => {
    result.push({
      qbAccountName: qbName,
      mappingType: mapping.categoryType === 'income' ? 'income' : 'expense',
      mappedToId: mapping.categoryId,
      mappedToName: mapping.categoryName,
      categoryType: mapping.categoryType,
    })
  })

  // Sort alphabetically by QB account name
  result.sort((a, b) => a.qbAccountName.localeCompare(b.qbAccountName))

  return result
}
