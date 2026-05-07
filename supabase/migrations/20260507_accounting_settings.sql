-- Add accounting configuration columns to churches table
ALTER TABLE churches
  ADD COLUMN IF NOT EXISTS accounting_entry_system text    NOT NULL DEFAULT 'double',
  ADD COLUMN IF NOT EXISTS accounting_fiscal_month integer NOT NULL DEFAULT 4;
