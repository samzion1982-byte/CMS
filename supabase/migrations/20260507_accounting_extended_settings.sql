-- Extended accounting settings columns
ALTER TABLE churches
  -- Display & Format
  ADD COLUMN IF NOT EXISTS accounting_country           text    NOT NULL DEFAULT 'India',
  ADD COLUMN IF NOT EXISTS accounting_currency          text    NOT NULL DEFAULT '₹',
  ADD COLUMN IF NOT EXISTS accounting_number_format     text    NOT NULL DEFAULT 'indian',
  ADD COLUMN IF NOT EXISTS accounting_date_format       text    NOT NULL DEFAULT 'DD-MM-YYYY',

  -- Report Settings
  ADD COLUMN IF NOT EXISTS accounting_report_subtitle   text,

  -- Journal Entry Defaults
  ADD COLUMN IF NOT EXISTS accounting_default_voucher   text    NOT NULL DEFAULT 'Receipt',
  ADD COLUMN IF NOT EXISTS accounting_auto_post         boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS accounting_prefix_receipt    text    NOT NULL DEFAULT 'RV',
  ADD COLUMN IF NOT EXISTS accounting_prefix_payment    text    NOT NULL DEFAULT 'PV',
  ADD COLUMN IF NOT EXISTS accounting_prefix_journal    text    NOT NULL DEFAULT 'JV',
  ADD COLUMN IF NOT EXISTS accounting_prefix_contra     text    NOT NULL DEFAULT 'CT',
  ADD COLUMN IF NOT EXISTS accounting_prefix_opening    text    NOT NULL DEFAULT 'OB',

  -- Default Accounts (nullable — set by user after COA is built)
  ADD COLUMN IF NOT EXISTS accounting_default_cash_id   uuid,
  ADD COLUMN IF NOT EXISTS accounting_default_bank_id   uuid,

  -- Period & Opening Date
  ADD COLUMN IF NOT EXISTS accounting_period_lock_date  date,
  ADD COLUMN IF NOT EXISTS accounting_opening_date      date,

  -- Receipt Integration
  ADD COLUMN IF NOT EXISTS accounting_auto_post_receipts boolean NOT NULL DEFAULT false;
