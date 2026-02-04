export type NetWorthBucket =
  | 'cash'
  | 'investments'
  | 'real_estate'
  | 'crypto'
  | 'retirement'
  | 'liabilities'

export type AccountType =
  | 'checking'
  | 'savings'
  | 'credit_card'
  | 'investment'
  | 'retirement'
  | 'loan'
  | 'mortgage'
  | 'other'

export type TransactionType = 'income' | 'expense' | 'transfer'

export interface Category {
  id: string
  user_id: string
  name: string
  type: TransactionType
  parent_id: string | null
  qb_category_names: string[]
  color: string | null
  created_at: string
  updated_at: string
}

export interface Account {
  id: string
  user_id: string
  name: string
  account_type: AccountType
  net_worth_bucket: NetWorthBucket
  institution: string | null
  account_number_last4: string | null
  is_active: boolean
  qb_account_names: string[]
  created_at: string
  updated_at: string
}

export interface AccountBalance {
  id: string
  account_id: string
  balance_date: string
  balance: number
  source: string
  created_at: string
}

export interface ImportBatch {
  id: string
  user_id: string
  filename: string
  file_type: string
  import_date: string
  record_count: number
  status: 'pending' | 'processing' | 'completed' | 'failed'
  error_message: string | null
  metadata: Record<string, unknown>
  created_at: string
}

export interface Transaction {
  id: string
  user_id: string
  account_id: string | null
  category_id: string | null
  import_batch_id: string | null
  transaction_date: string
  description: string | null
  amount: number
  transaction_type: TransactionType
  memo: string | null
  qb_account: string | null // "Account full name" column - the GL section header
  split_account: string | null // The counter-entry account (e.g., checking account for expenses)
  is_reconciled: boolean
  created_at: string
  updated_at: string
}

export interface Investment {
  id: string
  user_id: string
  account_id: string | null
  import_batch_id: string | null
  symbol: string
  name: string | null
  quantity: number
  cost_basis: number | null
  current_price: number | null
  current_value: number | null
  asset_class: string | null
  sector: string | null
  as_of_date: string
  created_at: string
  updated_at: string
}

export interface HomeEntry {
  id: string
  user_id: string
  property_name: string
  entry_date: string
  home_value: number
  mortgage_balance: number
  equity: number
  notes: string | null
  created_at: string
  updated_at: string
}

export interface NetWorthSnapshot {
  id: string
  user_id: string
  snapshot_date: string
  cash: number
  investments: number
  real_estate: number
  crypto: number
  retirement: number
  liabilities: number
  total_assets: number
  total_liabilities: number
  net_worth: number
  created_at: string
}

// Database type for Supabase client
export interface Database {
  public: {
    Tables: {
      categories: {
        Row: Category
        Insert: Omit<Category, 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Omit<Category, 'id' | 'created_at' | 'updated_at'>>
      }
      accounts: {
        Row: Account
        Insert: Omit<Account, 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Omit<Account, 'id' | 'created_at' | 'updated_at'>>
      }
      account_balances: {
        Row: AccountBalance
        Insert: Omit<AccountBalance, 'id' | 'created_at'>
        Update: Partial<Omit<AccountBalance, 'id' | 'created_at'>>
      }
      import_batches: {
        Row: ImportBatch
        Insert: Omit<ImportBatch, 'id' | 'created_at'>
        Update: Partial<Omit<ImportBatch, 'id' | 'created_at'>>
      }
      transactions: {
        Row: Transaction
        Insert: Omit<Transaction, 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Omit<Transaction, 'id' | 'created_at' | 'updated_at'>>
      }
      investments: {
        Row: Investment
        Insert: Omit<Investment, 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Omit<Investment, 'id' | 'created_at' | 'updated_at'>>
      }
      home_entries: {
        Row: HomeEntry
        Insert: Omit<HomeEntry, 'id' | 'created_at' | 'updated_at' | 'equity'>
        Update: Partial<Omit<HomeEntry, 'id' | 'created_at' | 'updated_at' | 'equity'>>
      }
      net_worth_snapshots: {
        Row: NetWorthSnapshot
        Insert: Omit<NetWorthSnapshot, 'id' | 'created_at' | 'total_assets' | 'total_liabilities' | 'net_worth'>
        Update: Partial<Omit<NetWorthSnapshot, 'id' | 'created_at' | 'total_assets' | 'total_liabilities' | 'net_worth'>>
      }
      qb_ignored_accounts: {
        Row: QBIgnoredAccount
        Insert: Omit<QBIgnoredAccount, 'id' | 'created_at'>
        Update: Partial<Omit<QBIgnoredAccount, 'id' | 'created_at'>>
      }
    }
    Enums: {
      net_worth_bucket: NetWorthBucket
      account_type: AccountType
      transaction_type: TransactionType
    }
  }
}

export interface TransactionTypeMapping {
  id: string
  user_id: string
  qb_transaction_type: string
  mapped_type: 'income' | 'expense'
  created_at: string
  updated_at: string
}

export interface QBIgnoredAccount {
  id: string
  user_id: string
  qb_account_name: string
  created_at: string
}

export interface QBAccountClassification {
  id: string
  user_id: string
  qb_account_name: string
  classification: 'income' | 'expense'
  created_at: string
}

// Crypto types (from external Supabase)
export interface CryptoHolding {
  id: string
  user_id: string
  symbol: string
  name: string
  quantity: number
  current_price: number
  current_value: number
  cost_basis: number
  profit_loss: number
  last_updated: string
}
