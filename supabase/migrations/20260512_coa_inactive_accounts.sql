-- COA inactive accounts support
-- Adds is_active flag so accounts can be hidden from pickers without deleting them

ALTER TABLE chart_of_accounts
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;

-- Budgets table for Budget vs Actual feature (#16)
CREATE TABLE IF NOT EXISTS budgets (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id     UUID REFERENCES churches(id) ON DELETE CASCADE,
  financial_year TEXT NOT NULL,
  account_id    UUID REFERENCES chart_of_accounts(id) ON DELETE CASCADE,
  budgeted_amount NUMERIC(15,2) NOT NULL DEFAULT 0,
  notes         TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (church_id, financial_year, account_id)
);

ALTER TABLE budgets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "church members manage budgets" ON budgets
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.church_id = budgets.church_id
    )
  );

-- Journal templates table for recurring entries (#3)
CREATE TABLE IF NOT EXISTS journal_templates (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id     UUID REFERENCES churches(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  voucher_type  TEXT NOT NULL DEFAULT 'Journal',
  narration     TEXT,
  lines         JSONB NOT NULL DEFAULT '[]',
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE journal_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "church members manage templates" ON journal_templates
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.church_id = journal_templates.church_id
    )
  );

-- Bank reconciliation column on journal_entry_lines (#2)
ALTER TABLE journal_entry_lines
  ADD COLUMN IF NOT EXISTS is_reconciled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS reconciled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reconciled_by TEXT;
