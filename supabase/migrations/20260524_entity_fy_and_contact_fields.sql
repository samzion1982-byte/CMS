-- ══════════════════════════════════════════════════════════════════
-- Flush all accounting data (testing phase — fresh start)
-- and add fy_start + contact fields to accounting_entities
-- ══════════════════════════════════════════════════════════════════

-- Truncate in dependency order (leaves simple_accounts and funds intact)
TRUNCATE
  accounting_audit_log,
  account_balances,
  journal_entry_lines,
  journal_entries,
  bank_accounts,
  chart_of_accounts,
  accounting_entities
RESTART IDENTITY CASCADE;

-- ── New columns on accounting_entities ───────────────────────────

-- Books Beginning From: the first FY this entity uses (e.g. '2026-27')
ALTER TABLE accounting_entities
  ADD COLUMN IF NOT EXISTS fy_start text NOT NULL DEFAULT '2026-27';

-- Contact / header fields (used in report exports)
ALTER TABLE accounting_entities
  ADD COLUMN IF NOT EXISTS address  text,
  ADD COLUMN IF NOT EXISTS city     text,
  ADD COLUMN IF NOT EXISTS state    text,
  ADD COLUMN IF NOT EXISTS diocese  text,
  ADD COLUMN IF NOT EXISTS phone    text,
  ADD COLUMN IF NOT EXISTS email    text;
