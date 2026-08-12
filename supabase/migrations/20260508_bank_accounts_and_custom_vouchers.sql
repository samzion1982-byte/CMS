-- Custom voucher types stored as JSONB on the churches row
ALTER TABLE churches
  ADD COLUMN IF NOT EXISTS accounting_custom_vouchers jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Bank accounts table — a church may have multiple accounts across banks
CREATE TABLE IF NOT EXISTS bank_accounts (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  bank_name           text        NOT NULL,
  account_holder_name text        NOT NULL,
  account_number      text        NOT NULL,
  branch              text,
  ifsc_code           text,
  swift_code          text,
  account_type        text        NOT NULL DEFAULT 'Savings',   -- Savings/Current/Cash Credit/FD/OD
  is_active           boolean     NOT NULL DEFAULT true,
  opening_balance     numeric(14,2)        DEFAULT 0,
  opening_date        date,
  notes               text,
  -- Optional link to Chart of Accounts (for GL integration)
  coa_account_id      uuid        REFERENCES chart_of_accounts(id) ON DELETE SET NULL,
  sort_order          integer              DEFAULT 0,
  created_at          timestamptz          DEFAULT now(),
  created_by          text,
  updated_at          timestamptz          DEFAULT now(),
  updated_by          text
);

CREATE INDEX IF NOT EXISTS idx_bank_accounts_active    ON bank_accounts(is_active);
CREATE INDEX IF NOT EXISTS idx_bank_accounts_sort      ON bank_accounts(sort_order);
CREATE INDEX IF NOT EXISTS idx_bank_accounts_coa       ON bank_accounts(coa_account_id);
