-- Add market value tracking for investment/crypto accounts
-- When set, market_value is used instead of cost basis (starting_balance + transactions) for net worth

ALTER TABLE accounts ADD COLUMN market_value DECIMAL(15, 2);
ALTER TABLE accounts ADD COLUMN market_value_updated_at TIMESTAMPTZ;
