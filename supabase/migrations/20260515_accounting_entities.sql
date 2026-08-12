-- ═══════════════════════════════════════════════════════════════
-- Multi-Entity Accounting Migration
-- Adds accounting_entities table and scopes all accounting data
-- per entity. Existing data is migrated to entity #1 (the church).
-- ═══════════════════════════════════════════════════════════════

-- ── 1. Entities table ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS accounting_entities (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text        NOT NULL,
  entity_type text        NOT NULL DEFAULT 'Church'
                CHECK (entity_type IN ('Church','Trust','School','Complex','Other')),
  description text,
  is_active   boolean     NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ── 2. Add entity_id columns (nullable first so existing rows survive) ─
ALTER TABLE chart_of_accounts
  ADD COLUMN IF NOT EXISTS entity_id uuid REFERENCES accounting_entities(id) ON DELETE RESTRICT;

ALTER TABLE journal_entries
  ADD COLUMN IF NOT EXISTS entity_id uuid REFERENCES accounting_entities(id) ON DELETE RESTRICT;

ALTER TABLE account_balances
  ADD COLUMN IF NOT EXISTS entity_id uuid REFERENCES accounting_entities(id) ON DELETE RESTRICT;

-- ── 3. Seed first entity and migrate existing rows ────────────────
--   MUST happen before PK change (entity_id cannot be NULL in PK)
DO $$
DECLARE
  v_entity_id  uuid := gen_random_uuid();
  v_name       text;
BEGIN
  -- Read church name
  SELECT COALESCE(church_name, 'Main Church') INTO v_name FROM churches LIMIT 1;

  -- Insert first entity
  INSERT INTO accounting_entities (id, name, entity_type, is_active)
  VALUES (v_entity_id, v_name, 'Church', true);

  -- Assign all existing accounting rows to this entity
  UPDATE chart_of_accounts SET entity_id = v_entity_id WHERE entity_id IS NULL;
  UPDATE journal_entries    SET entity_id = v_entity_id WHERE entity_id IS NULL;
  UPDATE account_balances   SET entity_id = v_entity_id WHERE entity_id IS NULL;
END $$;

-- ── 4. Indexes ───────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_coa_entity ON chart_of_accounts(entity_id);
CREATE INDEX IF NOT EXISTS idx_je_entity  ON journal_entries(entity_id);

-- ── 5. Restructure account_balances PK to include entity_id ──────
--   Safe now — all rows have entity_id populated from step 3
ALTER TABLE account_balances DROP CONSTRAINT IF EXISTS account_balances_pkey;
ALTER TABLE account_balances ADD PRIMARY KEY (account_id, financial_year, entity_id);
