-- ═══════════════════════════════════════════════════════════════
-- Accounting Module Migration
-- Church CMS — Double-entry accounting (church-friendly, audit-ready)
-- ═══════════════════════════════════════════════════════════════

-- ── 1. Accounting toggle on churches table ────────────────────────
ALTER TABLE churches
  ADD COLUMN IF NOT EXISTS accounting_enabled boolean NOT NULL DEFAULT false;

-- ── 2. Chart of Accounts ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS chart_of_accounts (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code                text NOT NULL UNIQUE,
  name                text NOT NULL,
  account_type        text NOT NULL
    CHECK (account_type IN ('Asset','Liability','Equity','Income','Expense')),
  parent_id           uuid REFERENCES chart_of_accounts(id) ON DELETE RESTRICT,
  description         text,
  is_active           boolean NOT NULL DEFAULT true,
  opening_balance     numeric(14,2) NOT NULL DEFAULT 0,
  opening_balance_date date,
  sort_order          integer NOT NULL DEFAULT 0,
  created_at          timestamptz NOT NULL DEFAULT now(),
  created_by          text,
  updated_at          timestamptz NOT NULL DEFAULT now(),
  updated_by          text
);
CREATE INDEX IF NOT EXISTS idx_coa_type ON chart_of_accounts(account_type);
CREATE INDEX IF NOT EXISTS idx_coa_parent ON chart_of_accounts(parent_id);

-- ── 3. Journal Entries (Vouchers) ────────────────────────────────
CREATE TABLE IF NOT EXISTS journal_entries (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_number    text NOT NULL UNIQUE,
  entry_date      date NOT NULL,
  financial_year  text NOT NULL,
  voucher_type    text NOT NULL
    CHECK (voucher_type IN ('Receipt','Payment','Journal','Contra','Opening')),
  narration       text,
  reference_no    text,
  total_debit     numeric(14,2) NOT NULL DEFAULT 0,
  total_credit    numeric(14,2) NOT NULL DEFAULT 0,
  is_posted       boolean NOT NULL DEFAULT false,
  posted_at       timestamptz,
  posted_by       text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  created_by      text,
  updated_at      timestamptz NOT NULL DEFAULT now(),
  updated_by      text
);
CREATE INDEX IF NOT EXISTS idx_je_fy     ON journal_entries(financial_year);
CREATE INDEX IF NOT EXISTS idx_je_date   ON journal_entries(entry_date DESC);
CREATE INDEX IF NOT EXISTS idx_je_type   ON journal_entries(voucher_type);
CREATE INDEX IF NOT EXISTS idx_je_posted ON journal_entries(is_posted);

-- ── 4. Journal Entry Lines (Debit / Credit postings) ─────────────
CREATE TABLE IF NOT EXISTS journal_entry_lines (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  journal_entry_id uuid NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
  account_id       uuid NOT NULL REFERENCES chart_of_accounts(id) ON DELETE RESTRICT,
  debit_amount     numeric(14,2) NOT NULL DEFAULT 0,
  credit_amount    numeric(14,2) NOT NULL DEFAULT 0,
  description      text,
  line_number      integer NOT NULL DEFAULT 0,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_jel_entry   ON journal_entry_lines(journal_entry_id);
CREATE INDEX IF NOT EXISTS idx_jel_account ON journal_entry_lines(account_id);

-- ── 5. Account Balances Cache ────────────────────────────────────
CREATE TABLE IF NOT EXISTS account_balances (
  account_id       uuid NOT NULL REFERENCES chart_of_accounts(id) ON DELETE CASCADE,
  financial_year   text NOT NULL,
  opening_balance  numeric(14,2) NOT NULL DEFAULT 0,
  total_debit      numeric(14,2) NOT NULL DEFAULT 0,
  total_credit     numeric(14,2) NOT NULL DEFAULT 0,
  closing_balance  numeric(14,2) NOT NULL DEFAULT 0,
  last_updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, financial_year)
);

-- ── 6. Accounting Audit Log ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS accounting_audit_log (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action           text NOT NULL,       -- created | modified | posted | deleted
  entity_type      text NOT NULL,       -- chart_of_accounts | journal_entry
  entity_id        uuid NOT NULL,
  entity_data      jsonb,
  old_data         jsonb,
  performed_by     text NOT NULL,
  performed_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_acct_audit_ts     ON accounting_audit_log(performed_at DESC);
CREATE INDEX IF NOT EXISTS idx_acct_audit_entity ON accounting_audit_log(entity_type, entity_id);

-- ── 7. Seed: Default Chart of Accounts for a typical Church ──────
INSERT INTO chart_of_accounts (code, name, account_type, sort_order) VALUES
  -- Assets
  ('1001', 'Cash in Hand',            'Asset',   10),
  ('1002', 'Bank - Current Account',  'Asset',   20),
  ('1003', 'Bank - Savings Account',  'Asset',   30),
  ('1004', 'Fixed Deposits',          'Asset',   40),
  ('1005', 'Petty Cash',              'Asset',   50),
  ('1006', 'Advance to Staff',        'Asset',   60),
  ('1007', 'Other Assets',            'Asset',   70),
  -- Liabilities
  ('2001', 'Loan Payable',            'Liability', 10),
  ('2002', 'Advance from Members',    'Liability', 20),
  ('2003', 'Payables / Dues',         'Liability', 30),
  -- Equity / Funds
  ('3001', 'General Fund',            'Equity',  10),
  ('3002', 'Building Fund',           'Equity',  20),
  ('3003', 'Mission Fund',            'Equity',  30),
  ('3004', 'Education Fund',          'Equity',  40),
  ('3005', 'Benevolence Fund',        'Equity',  50),
  -- Income
  ('4001', 'Sunday Offerings',        'Income',  10),
  ('4002', 'Tithe / Subscription',    'Income',  20),
  ('4003', 'Special Offerings',       'Income',  30),
  ('4004', 'Donations',               'Income',  40),
  ('4005', 'Interest Income',         'Income',  50),
  ('4006', 'Rent Income',             'Income',  60),
  ('4007', 'Other Income',            'Income',  70),
  -- Expenses
  ('5001', 'Pastoral Salary',         'Expense', 10),
  ('5002', 'Staff Salaries',          'Expense', 20),
  ('5003', 'Electricity & Utilities', 'Expense', 30),
  ('5004', 'Building Maintenance',    'Expense', 40),
  ('5005', 'Stationery & Printing',   'Expense', 50),
  ('5006', 'Travel & Conveyance',     'Expense', 60),
  ('5007', 'Medical Expenses',        'Expense', 70),
  ('5008', 'Mission & Outreach',      'Expense', 80),
  ('5009', 'Sunday School Expenses',  'Expense', 90),
  ('5010', 'Special Programme',       'Expense', 100),
  ('5011', 'Bank Charges',            'Expense', 110),
  ('5012', 'Miscellaneous Expenses',  'Expense', 120)
ON CONFLICT (code) DO NOTHING;
