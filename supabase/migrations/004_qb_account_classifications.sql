-- Create table to store user's manual classifications of QB accounts
-- This remembers when a user classifies an account as income/expense during import
CREATE TABLE IF NOT EXISTS qb_account_classifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  qb_account_name TEXT NOT NULL,
  classification TEXT NOT NULL CHECK (classification IN ('income', 'expense')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, qb_account_name)
);

-- Add RLS policies
ALTER TABLE qb_account_classifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own classifications"
  ON qb_account_classifications FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own classifications"
  ON qb_account_classifications FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own classifications"
  ON qb_account_classifications FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own classifications"
  ON qb_account_classifications FOR DELETE
  USING (auth.uid() = user_id);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_qb_account_classifications_user_id
  ON qb_account_classifications(user_id);
