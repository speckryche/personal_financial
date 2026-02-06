-- Add debt-specific fields to accounts table for liability tracking

ALTER TABLE accounts ADD COLUMN IF NOT EXISTS interest_rate DECIMAL(5, 3);  -- e.g., 24.99%
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS minimum_payment DECIMAL(10, 2);
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS target_payoff_date DATE;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS payoff_priority INTEGER;  -- manual override (lower = pay first)

-- Add comments for documentation
COMMENT ON COLUMN accounts.interest_rate IS 'Annual percentage rate (APR) for debt accounts, e.g., 24.99 for 24.99%';
COMMENT ON COLUMN accounts.minimum_payment IS 'Minimum monthly payment required for this debt';
COMMENT ON COLUMN accounts.target_payoff_date IS 'User-set target date to pay off this debt';
COMMENT ON COLUMN accounts.payoff_priority IS 'Manual priority override for debt payoff order (lower = pay first)';
