-- ═══════════════════════════════════════════════════════════════
-- Assets Module — inventory register for church movable assets,
-- with room for buildings & documents later (asset_category).
-- ═══════════════════════════════════════════════════════════════

-- ── 1. Lookup masters (managed via Assets Settings) ──────────────

CREATE TABLE IF NOT EXISTS asset_locations (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text        NOT NULL UNIQUE,
  sort_order integer     NOT NULL DEFAULT 0,
  is_active  boolean     NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS asset_item_types (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text        NOT NULL UNIQUE,
  sort_order integer     NOT NULL DEFAULT 0,
  is_active  boolean     NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS asset_conditions (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text        NOT NULL UNIQUE,
  sort_order integer     NOT NULL DEFAULT 0,
  is_active  boolean     NOT NULL DEFAULT true,
  color      text        NOT NULL DEFAULT '#64748b',
  created_at timestamptz NOT NULL DEFAULT now()
);
-- ── 2. Assets register (one row per physical item) ───────────────

CREATE TABLE IF NOT EXISTS assets (
  id              uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  -- movable | building | document  (tabs on Assets page)
  asset_category  text          NOT NULL DEFAULT 'movable'
                    CHECK (asset_category IN ('movable', 'building', 'document')),
  serial_no       integer,
  location_id     uuid          REFERENCES asset_locations(id)  ON DELETE SET NULL,
  item_type_id    uuid          REFERENCES asset_item_types(id) ON DELETE SET NULL,
  description     text          NOT NULL,
  condition_id    uuid          REFERENCES asset_conditions(id) ON DELETE SET NULL,
  -- Optional purchase / supplier
  unit_price      numeric(14,2),
  purchase_value  numeric(14,2),
  invoice_no      text,
  invoice_date    date,
  supplier_name   text,
  supplier_address text,
  supplier_contact text,
  -- Optional photo
  photo_url       text,
  photo_path      text,
  notes           text,
  is_active       boolean       NOT NULL DEFAULT true,
  created_at      timestamptz   NOT NULL DEFAULT now(),
  created_by      text,
  updated_at      timestamptz   NOT NULL DEFAULT now(),
  updated_by      text
);

CREATE INDEX IF NOT EXISTS idx_assets_category   ON assets (asset_category);
CREATE INDEX IF NOT EXISTS idx_assets_active     ON assets (is_active);
CREATE INDEX IF NOT EXISTS idx_assets_location   ON assets (location_id);
CREATE INDEX IF NOT EXISTS idx_assets_item_type  ON assets (item_type_id);
CREATE INDEX IF NOT EXISTS idx_assets_condition  ON assets (condition_id);
CREATE INDEX IF NOT EXISTS idx_assets_serial     ON assets (serial_no);

-- Auto serial_no per category (next number on insert when null)
CREATE OR REPLACE FUNCTION assets_assign_serial_no()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.serial_no IS NULL THEN
    SELECT COALESCE(MAX(serial_no), 0) + 1
      INTO NEW.serial_no
      FROM assets
     WHERE asset_category = NEW.asset_category;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_assets_assign_serial ON assets;
CREATE TRIGGER trg_assets_assign_serial
  BEFORE INSERT ON assets
  FOR EACH ROW
  EXECUTE FUNCTION assets_assign_serial_no();

CREATE OR REPLACE FUNCTION assets_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_assets_updated_at ON assets;
CREATE TRIGGER trg_assets_updated_at
  BEFORE UPDATE ON assets
  FOR EACH ROW
  EXECUTE FUNCTION assets_touch_updated_at();

-- ── 3. RLS ───────────────────────────────────────────────────────

ALTER TABLE asset_locations  ENABLE ROW LEVEL SECURITY;
ALTER TABLE asset_item_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE asset_conditions ENABLE ROW LEVEL SECURITY;
ALTER TABLE assets           ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "users manage asset_locations" ON asset_locations
    FOR ALL USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "users manage asset_item_types" ON asset_item_types
    FOR ALL USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "users manage asset_conditions" ON asset_conditions
    FOR ALL USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "users manage assets" ON assets
    FOR ALL USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── 4. Seed defaults from Inventory Register spreadsheet ─────────

INSERT INTO asset_locations (name, sort_order) VALUES
  ('Altar', 10),
  ('Sacristy', 20),
  ('Nave', 30),
  ('Choir', 40),
  ('Office', 50),
  ('Store Room', 60),
  ('Parsonage', 70),
  ('Hall', 80),
  ('Other', 90)
ON CONFLICT (name) DO NOTHING;

INSERT INTO asset_item_types (name, sort_order) VALUES
  ('General', 10),
  ('Electrical & Electronics', 20),
  ('Furniture & Fittings', 30),
  ('Vessels', 40)
ON CONFLICT (name) DO NOTHING;

INSERT INTO asset_conditions (name, sort_order, color) VALUES
  ('Working', 10, '#16a34a'),
  ('Not Working', 20, '#dc2626'),
  ('Damaged', 30, '#c2410c'),
  ('Under Repair', 40, '#d97706'),
  ('Disposed', 50, '#64748b')
ON CONFLICT (name) DO NOTHING;
-- ── 5. Storage bucket for asset photos ───────────────────────────

-- Create bucket (public; 1 MB photo limit)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'asset-photos',
  'asset-photos',
  true,
  1048576,  -- 1 MB
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO NOTHING;

DO $$ BEGIN
  CREATE POLICY "asset_photos_select"
    ON storage.objects FOR SELECT
    TO public
    USING (bucket_id = 'asset-photos');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "asset_photos_insert"
    ON storage.objects FOR INSERT
    TO authenticated
    WITH CHECK (bucket_id = 'asset-photos');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "asset_photos_update"
    ON storage.objects FOR UPDATE
    TO authenticated
    USING (bucket_id = 'asset-photos');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "asset_photos_delete"
    ON storage.objects FOR DELETE
    TO authenticated
    USING (bucket_id = 'asset-photos');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
