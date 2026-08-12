-- ═══════════════════════════════════════════════════════════════
-- Phone Directory — external church contacts (Diocese, vendors,
-- service providers, govt officials, etc.) with nested categories.
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS directory_categories (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text        NOT NULL,
  parent_id  uuid        REFERENCES directory_categories(id) ON DELETE CASCADE,
  sort_order integer     NOT NULL DEFAULT 0,
  is_active  boolean     NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS directory_categories_name_parent_uidx
  ON directory_categories (lower(name), COALESCE(parent_id, '00000000-0000-0000-0000-000000000000'::uuid));

CREATE INDEX IF NOT EXISTS idx_directory_categories_parent
  ON directory_categories (parent_id);

CREATE INDEX IF NOT EXISTS idx_directory_categories_active
  ON directory_categories (is_active);

CREATE TABLE IF NOT EXISTS directory_contacts (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id   uuid        REFERENCES directory_categories(id) ON DELETE SET NULL,
  name          text        NOT NULL,
  organization  text,
  title         text,
  phone         text,
  whatsapp      text,
  email         text,
  address       text,
  notes         text,
  sort_order    integer     NOT NULL DEFAULT 0,
  is_active     boolean     NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  created_by    text,
  updated_at    timestamptz NOT NULL DEFAULT now(),
  updated_by    text
);

CREATE INDEX IF NOT EXISTS idx_directory_contacts_category ON directory_contacts (category_id);
CREATE INDEX IF NOT EXISTS idx_directory_contacts_active   ON directory_contacts (is_active);
CREATE INDEX IF NOT EXISTS idx_directory_contacts_name     ON directory_contacts (lower(name));

CREATE OR REPLACE FUNCTION directory_contacts_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_directory_contacts_updated_at ON directory_contacts;
CREATE TRIGGER trg_directory_contacts_updated_at
  BEFORE UPDATE ON directory_contacts
  FOR EACH ROW
  EXECUTE FUNCTION directory_contacts_touch_updated_at();

ALTER TABLE directory_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE directory_contacts   ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "users manage directory_categories" ON directory_categories
    FOR ALL USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "users manage directory_contacts" ON directory_contacts
    FOR ALL USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Seed common top-level categories (skip if already present)
INSERT INTO directory_categories (name, sort_order)
SELECT v.name, v.sort_order
FROM (VALUES
  ('Diocese', 10),
  ('Vendors', 20),
  ('Service Providers', 30),
  ('Government', 40),
  ('Others', 50)
) AS v(name, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM directory_categories c
  WHERE lower(c.name) = lower(v.name) AND c.parent_id IS NULL
);
