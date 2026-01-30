-- Personal Finance Dashboard Schema
-- Run this migration in your Supabase SQL Editor

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Enum for net worth buckets
CREATE TYPE net_worth_bucket AS ENUM (
  'cash',
  'investments',
  'real_estate',
  'crypto',
  'retirement',
  'liabilities'
);

-- Enum for account types
CREATE TYPE account_type AS ENUM (
  'checking',
  'savings',
  'credit_card',
  'investment',
  'retirement',
  'loan',
  'mortgage',
  'other'
);

-- Enum for transaction types
CREATE TYPE transaction_type AS ENUM (
  'income',
  'expense',
  'transfer'
);

-- Categories table for expense/income classification
CREATE TABLE categories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  type transaction_type NOT NULL,
  parent_id UUID REFERENCES categories(id) ON DELETE SET NULL,
  qb_category_names TEXT[] DEFAULT '{}', -- QuickBooks category name mappings
  color VARCHAR(7), -- Hex color code
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, name)
);

-- Accounts table
CREATE TABLE accounts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  account_type account_type NOT NULL,
  net_worth_bucket net_worth_bucket NOT NULL,
  institution VARCHAR(255),
  account_number_last4 VARCHAR(4),
  is_active BOOLEAN DEFAULT true,
  qb_account_names TEXT[] DEFAULT '{}', -- QuickBooks account name mappings
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, name)
);

-- Account balances (point-in-time snapshots)
CREATE TABLE account_balances (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  balance_date DATE NOT NULL,
  balance DECIMAL(15, 2) NOT NULL,
  source VARCHAR(50) DEFAULT 'manual', -- 'manual', 'import', 'calculated'
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(account_id, balance_date)
);

-- Import batches for tracking file uploads
CREATE TABLE import_batches (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  filename VARCHAR(255) NOT NULL,
  file_type VARCHAR(50) NOT NULL, -- 'quickbooks_transactions', 'quickbooks_pnl', 'quickbooks_balance_sheet', 'raymond_james'
  import_date TIMESTAMPTZ DEFAULT NOW(),
  record_count INTEGER DEFAULT 0,
  status VARCHAR(20) DEFAULT 'pending', -- 'pending', 'processing', 'completed', 'failed'
  error_message TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Transactions table (from QuickBooks)
CREATE TABLE transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
  category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
  import_batch_id UUID REFERENCES import_batches(id) ON DELETE SET NULL,
  transaction_date DATE NOT NULL,
  description TEXT,
  amount DECIMAL(15, 2) NOT NULL, -- Positive = income, Negative = expense
  transaction_type transaction_type NOT NULL,
  memo TEXT,
  -- QuickBooks specific fields
  qb_transaction_type VARCHAR(100),
  qb_num VARCHAR(50),
  qb_name VARCHAR(255),
  qb_class VARCHAR(255),
  qb_split VARCHAR(255),
  -- Metadata
  is_reconciled BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Investments table (from Raymond James)
CREATE TABLE investments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
  import_batch_id UUID REFERENCES import_batches(id) ON DELETE SET NULL,
  symbol VARCHAR(20) NOT NULL,
  name VARCHAR(255),
  quantity DECIMAL(15, 6) NOT NULL,
  cost_basis DECIMAL(15, 2),
  current_price DECIMAL(15, 4),
  current_value DECIMAL(15, 2),
  asset_class VARCHAR(100), -- 'stocks', 'bonds', 'etf', 'mutual_fund', 'cash'
  sector VARCHAR(100),
  as_of_date DATE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Home entries (manual real estate tracking)
CREATE TABLE home_entries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  property_name VARCHAR(255) NOT NULL DEFAULT 'Primary Residence',
  entry_date DATE NOT NULL,
  home_value DECIMAL(15, 2) NOT NULL,
  mortgage_balance DECIMAL(15, 2) DEFAULT 0,
  equity DECIMAL(15, 2) GENERATED ALWAYS AS (home_value - mortgage_balance) STORED,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Net worth snapshots (aggregated view)
CREATE TABLE net_worth_snapshots (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  snapshot_date DATE NOT NULL,
  cash DECIMAL(15, 2) DEFAULT 0,
  investments DECIMAL(15, 2) DEFAULT 0,
  real_estate DECIMAL(15, 2) DEFAULT 0,
  crypto DECIMAL(15, 2) DEFAULT 0,
  retirement DECIMAL(15, 2) DEFAULT 0,
  liabilities DECIMAL(15, 2) DEFAULT 0,
  total_assets DECIMAL(15, 2) GENERATED ALWAYS AS (cash + investments + real_estate + crypto + retirement) STORED,
  total_liabilities DECIMAL(15, 2) GENERATED ALWAYS AS (ABS(liabilities)) STORED,
  net_worth DECIMAL(15, 2) GENERATED ALWAYS AS (cash + investments + real_estate + crypto + retirement + liabilities) STORED,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, snapshot_date)
);

-- Create indexes for better query performance
CREATE INDEX idx_transactions_user_date ON transactions(user_id, transaction_date DESC);
CREATE INDEX idx_transactions_account ON transactions(account_id);
CREATE INDEX idx_transactions_category ON transactions(category_id);
CREATE INDEX idx_account_balances_account_date ON account_balances(account_id, balance_date DESC);
CREATE INDEX idx_investments_user_date ON investments(user_id, as_of_date DESC);
CREATE INDEX idx_home_entries_user_date ON home_entries(user_id, entry_date DESC);
CREATE INDEX idx_net_worth_snapshots_user_date ON net_worth_snapshots(user_id, snapshot_date DESC);

-- Row Level Security (RLS) Policies

-- Enable RLS on all tables
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE account_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE import_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE investments ENABLE ROW LEVEL SECURITY;
ALTER TABLE home_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE net_worth_snapshots ENABLE ROW LEVEL SECURITY;

-- Categories policies
CREATE POLICY "Users can view their own categories" ON categories
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own categories" ON categories
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own categories" ON categories
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own categories" ON categories
  FOR DELETE USING (auth.uid() = user_id);

-- Accounts policies
CREATE POLICY "Users can view their own accounts" ON accounts
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own accounts" ON accounts
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own accounts" ON accounts
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own accounts" ON accounts
  FOR DELETE USING (auth.uid() = user_id);

-- Account balances policies (access through account ownership)
CREATE POLICY "Users can view their own account balances" ON account_balances
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM accounts WHERE accounts.id = account_balances.account_id AND accounts.user_id = auth.uid()
  ));
CREATE POLICY "Users can insert their own account balances" ON account_balances
  FOR INSERT WITH CHECK (EXISTS (
    SELECT 1 FROM accounts WHERE accounts.id = account_balances.account_id AND accounts.user_id = auth.uid()
  ));
CREATE POLICY "Users can update their own account balances" ON account_balances
  FOR UPDATE USING (EXISTS (
    SELECT 1 FROM accounts WHERE accounts.id = account_balances.account_id AND accounts.user_id = auth.uid()
  ));
CREATE POLICY "Users can delete their own account balances" ON account_balances
  FOR DELETE USING (EXISTS (
    SELECT 1 FROM accounts WHERE accounts.id = account_balances.account_id AND accounts.user_id = auth.uid()
  ));

-- Import batches policies
CREATE POLICY "Users can view their own import batches" ON import_batches
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own import batches" ON import_batches
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own import batches" ON import_batches
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own import batches" ON import_batches
  FOR DELETE USING (auth.uid() = user_id);

-- Transactions policies
CREATE POLICY "Users can view their own transactions" ON transactions
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own transactions" ON transactions
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own transactions" ON transactions
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own transactions" ON transactions
  FOR DELETE USING (auth.uid() = user_id);

-- Investments policies
CREATE POLICY "Users can view their own investments" ON investments
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own investments" ON investments
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own investments" ON investments
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own investments" ON investments
  FOR DELETE USING (auth.uid() = user_id);

-- Home entries policies
CREATE POLICY "Users can view their own home entries" ON home_entries
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own home entries" ON home_entries
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own home entries" ON home_entries
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own home entries" ON home_entries
  FOR DELETE USING (auth.uid() = user_id);

-- Net worth snapshots policies
CREATE POLICY "Users can view their own net worth snapshots" ON net_worth_snapshots
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own net worth snapshots" ON net_worth_snapshots
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own net worth snapshots" ON net_worth_snapshots
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own net worth snapshots" ON net_worth_snapshots
  FOR DELETE USING (auth.uid() = user_id);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for updated_at
CREATE TRIGGER update_categories_updated_at BEFORE UPDATE ON categories
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_accounts_updated_at BEFORE UPDATE ON accounts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_transactions_updated_at BEFORE UPDATE ON transactions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_investments_updated_at BEFORE UPDATE ON investments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_home_entries_updated_at BEFORE UPDATE ON home_entries
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Insert default categories for new users (via function)
CREATE OR REPLACE FUNCTION create_default_categories()
RETURNS TRIGGER AS $$
BEGIN
  -- Income categories
  INSERT INTO categories (user_id, name, type) VALUES
    (NEW.id, 'Salary', 'income'),
    (NEW.id, 'Investment Income', 'income'),
    (NEW.id, 'Other Income', 'income');

  -- Expense categories
  INSERT INTO categories (user_id, name, type) VALUES
    (NEW.id, 'Housing', 'expense'),
    (NEW.id, 'Utilities', 'expense'),
    (NEW.id, 'Groceries', 'expense'),
    (NEW.id, 'Transportation', 'expense'),
    (NEW.id, 'Healthcare', 'expense'),
    (NEW.id, 'Entertainment', 'expense'),
    (NEW.id, 'Shopping', 'expense'),
    (NEW.id, 'Dining', 'expense'),
    (NEW.id, 'Travel', 'expense'),
    (NEW.id, 'Insurance', 'expense'),
    (NEW.id, 'Taxes', 'expense'),
    (NEW.id, 'Other Expenses', 'expense');

  RETURN NEW;
END;
$$ language 'plpgsql' SECURITY DEFINER;

-- Trigger to create default categories when new user signs up
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION create_default_categories();
