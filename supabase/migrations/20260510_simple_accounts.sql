-- Simple Accounts Module
-- Lightweight cash-book style accounting for churches without a professional accountant

-- Feature flag + settings on churches table
ALTER TABLE churches
  ADD COLUMN IF NOT EXISTS simple_accounting_enabled         boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS simple_accounting_currency        text    NOT NULL DEFAULT '₹',
  ADD COLUMN IF NOT EXISTS simple_accounting_fiscal_month    integer NOT NULL DEFAULT 4,
  ADD COLUMN IF NOT EXISTS simple_accounting_report_title    text,
  ADD COLUMN IF NOT EXISTS simple_accounting_default_account uuid;

-- Cash / Bank / Other accounts
CREATE TABLE IF NOT EXISTS simple_accounts (
  id              uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text          NOT NULL,
  account_type    text          NOT NULL DEFAULT 'cash' CHECK (account_type IN ('cash', 'bank', 'other')),
  opening_balance numeric(14,2) NOT NULL DEFAULT 0,
  opening_date    date,
  is_active       boolean       NOT NULL DEFAULT true,
  sort_order      integer       NOT NULL DEFAULT 0,
  created_at      timestamptz   NOT NULL DEFAULT now(),
  created_by      text,
  updated_at      timestamptz   NOT NULL DEFAULT now(),
  updated_by      text
);

-- Income / Expense categories
CREATE TABLE IF NOT EXISTS simple_categories (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text        NOT NULL,
  type       text        NOT NULL CHECK (type IN ('income', 'expense')),
  is_default boolean     NOT NULL DEFAULT false,
  sort_order integer     NOT NULL DEFAULT 0,
  is_active  boolean     NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Transactions (income / expense / transfer between accounts)
CREATE TABLE IF NOT EXISTS simple_transactions (
  id            uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  txn_date      date          NOT NULL,
  txn_type      text          NOT NULL CHECK (txn_type IN ('income', 'expense', 'transfer')),
  amount        numeric(14,2) NOT NULL CHECK (amount > 0),
  category_id   uuid          REFERENCES simple_categories(id) ON DELETE SET NULL,
  account_id    uuid          REFERENCES simple_accounts(id)   ON DELETE SET NULL,
  to_account_id uuid          REFERENCES simple_accounts(id)   ON DELETE SET NULL,
  description   text,
  reference_no  text,
  is_deleted    boolean       NOT NULL DEFAULT false,
  created_at    timestamptz   NOT NULL DEFAULT now(),
  created_by    text,
  updated_at    timestamptz   NOT NULL DEFAULT now(),
  updated_by    text
);

CREATE INDEX IF NOT EXISTS idx_simple_txn_date    ON simple_transactions(txn_date);
CREATE INDEX IF NOT EXISTS idx_simple_txn_type    ON simple_transactions(txn_type);
CREATE INDEX IF NOT EXISTS idx_simple_txn_deleted ON simple_transactions(is_deleted);

-- Default categories (seeded once)
INSERT INTO simple_categories (name, type, is_default, sort_order) VALUES
  ('Sunday Offering',       'income',  true, 10),
  ('Tithes',                'income',  true, 20),
  ('Special Offering',      'income',  true, 30),
  ('Donations',             'income',  true, 40),
  ('Events & Programs',     'income',  true, 50),
  ('Other Income',          'income',  true, 60),
  ('Salaries & Honorarium', 'expense', true, 10),
  ('Rent & Utilities',      'expense', true, 20),
  ('Maintenance & Repairs', 'expense', true, 30),
  ('Events & Programs',     'expense', true, 40),
  ('Stationery & Printing', 'expense', true, 50),
  ('Travel & Transport',    'expense', true, 60),
  ('Miscellaneous',         'expense', true, 70);

-- Default accounts (seeded once)
INSERT INTO simple_accounts (name, account_type, sort_order) VALUES
  ('Cash', 'cash', 10),
  ('Bank', 'bank', 20);
