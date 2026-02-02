-- Migration: Add qb_ignored_accounts table for tracking QB accounts to skip during import
-- This allows users to mark certain QB accounts (like Retained Earnings, Depreciation, Owner's Draw)
-- to be ignored during General Ledger imports.

CREATE TABLE IF NOT EXISTS qb_ignored_accounts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  qb_account_name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, qb_account_name)
);

-- Create index for faster lookups by user
CREATE INDEX IF NOT EXISTS idx_qb_ignored_accounts_user_id ON qb_ignored_accounts(user_id);

-- Enable Row Level Security
ALTER TABLE qb_ignored_accounts ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can only manage their own ignored accounts
CREATE POLICY "Users can manage their own ignored accounts"
  ON qb_ignored_accounts FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
