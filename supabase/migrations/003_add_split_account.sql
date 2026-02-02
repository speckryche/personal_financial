-- Add split_account column to transactions table
-- This stores the counter-entry account from GL imports (e.g., checking account for expenses)
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS split_account TEXT;

-- Add index for faster lookups when re-linking accounts
CREATE INDEX IF NOT EXISTS idx_transactions_split_account ON transactions(split_account);
