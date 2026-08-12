-- ═══════════════════════════════════════════════════════════════
-- Designated / Corpus Fund Tracking (#17)
-- ═══════════════════════════════════════════════════════════════

-- ── 1. Funds master table ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS funds (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name           TEXT        NOT NULL,
  description    TEXT,
  target_amount  NUMERIC(15,2),
  color          TEXT        NOT NULL DEFAULT '#2563eb',
  is_active      BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE funds ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users manage funds" ON funds
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles WHERE profiles.id = auth.uid()
    )
  );

CREATE INDEX IF NOT EXISTS idx_funds_active ON funds (is_active);

-- ── 2. Tag journal entries to a fund ─────────────────────────────
ALTER TABLE journal_entries
  ADD COLUMN IF NOT EXISTS fund_id UUID REFERENCES funds(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_je_fund ON journal_entries (fund_id);

-- ── 3. Seed default funds (matches default COA equity accounts) ───
INSERT INTO funds (name, description, color) VALUES
  ('General Fund',     'Day-to-day operations and undesignated giving', '#2563eb'),
  ('Building Fund',    'Church building construction, renovation, and maintenance', '#16a34a'),
  ('Mission Fund',     'Missionary support and outreach activities', '#7c3aed'),
  ('Education Fund',   'Sunday school, seminars, and training programmes', '#0891b2'),
  ('Benevolence Fund', 'Financial assistance for members and community in need', '#c2410c')
ON CONFLICT DO NOTHING;
