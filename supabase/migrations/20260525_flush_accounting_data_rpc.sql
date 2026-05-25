-- RPC functions to flush accounting data
-- Called from Church Setup → Accounts Module → Flush Accounts
-- Flushes everything including chart_of_accounts and accounting_entities.
-- Standard COA is automatically re-seeded when a new Accounting Book is created.

-- Advanced Accounts flush: wipes ALL accounting data and resets to first-time setup
CREATE OR REPLACE FUNCTION flush_accounting_data()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  TRUNCATE
    accounting_audit_log,
    account_balances,
    journal_entry_lines,
    journal_entries,
    bank_accounts,
    chart_of_accounts,
    accounting_entities
  RESTART IDENTITY CASCADE;

  UPDATE churches
  SET accounting_entry_system_locked = false,
      accounting_entry_system        = 'double'
  WHERE id IS NOT NULL;
END;
$$;

-- Simple Accounts flush: wipes transactions/accounts/categories, re-seeds defaults
CREATE OR REPLACE FUNCTION flush_simple_accounts()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  TRUNCATE simple_transactions, simple_accounts, simple_categories
  RESTART IDENTITY CASCADE;

  -- Re-seed default categories
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

  -- Re-seed default accounts
  INSERT INTO simple_accounts (name, account_type, sort_order) VALUES
    ('Cash', 'cash', 10),
    ('Bank', 'bank', 20);
END;
$$;
