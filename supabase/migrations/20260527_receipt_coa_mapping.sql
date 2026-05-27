-- Link payment categories to Chart of Accounts for receipt → journal transfer
ALTER TABLE payment_categories
  ADD COLUMN IF NOT EXISTS coa_account_id uuid REFERENCES chart_of_accounts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_payment_cat_coa ON payment_categories(coa_account_id);
