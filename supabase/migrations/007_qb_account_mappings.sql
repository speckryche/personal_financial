-- QB Account Mappings Table
-- This is the single source of truth for mapping QB Account Names to transaction types and categories

CREATE TABLE qb_account_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  qb_account_name TEXT NOT NULL,
  transaction_type transaction_type NOT NULL,
  category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, qb_account_name)
);

-- Create index for faster lookups
CREATE INDEX idx_qb_account_mappings_user ON qb_account_mappings(user_id);
CREATE INDEX idx_qb_account_mappings_qb_account ON qb_account_mappings(user_id, qb_account_name);

-- Enable RLS
ALTER TABLE qb_account_mappings ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own qb_account_mappings" ON qb_account_mappings
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own qb_account_mappings" ON qb_account_mappings
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own qb_account_mappings" ON qb_account_mappings
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own qb_account_mappings" ON qb_account_mappings
  FOR DELETE USING (auth.uid() = user_id);

-- Trigger for updated_at
CREATE TRIGGER update_qb_account_mappings_updated_at BEFORE UPDATE ON qb_account_mappings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
