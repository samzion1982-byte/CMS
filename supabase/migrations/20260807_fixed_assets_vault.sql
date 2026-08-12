-- ═══════════════════════════════════════════════════════════════
-- Fixed Assets vault — property/document tiles with file storage
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS fixed_assets (
  id              uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text          NOT NULL,
  asset_type      text          NOT NULL DEFAULT 'Building',
  status          text          NOT NULL DEFAULT 'Active',
  location_label  text,
  description     text,
  drive_url       text,
  cover_url       text,
  cover_path      text,
  sort_order      integer       NOT NULL DEFAULT 0,
  is_active       boolean       NOT NULL DEFAULT true,
  created_at      timestamptz   NOT NULL DEFAULT now(),
  created_by      text,
  updated_at      timestamptz   NOT NULL DEFAULT now(),
  updated_by      text
);

CREATE INDEX IF NOT EXISTS idx_fixed_assets_active ON fixed_assets (is_active);
CREATE INDEX IF NOT EXISTS idx_fixed_assets_sort   ON fixed_assets (sort_order, name);

CREATE TABLE IF NOT EXISTS fixed_asset_documents (
  id              uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  fixed_asset_id  uuid          NOT NULL REFERENCES fixed_assets(id) ON DELETE CASCADE,
  title           text          NOT NULL,
  doc_type        text,
  doc_date        date,
  file_name       text,
  file_path       text          NOT NULL,
  file_url        text,
  mime_type       text,
  file_size       integer,
  notes           text,
  sort_order      integer       NOT NULL DEFAULT 0,
  is_active       boolean       NOT NULL DEFAULT true,
  created_at      timestamptz   NOT NULL DEFAULT now(),
  created_by      text,
  updated_at      timestamptz   NOT NULL DEFAULT now(),
  updated_by      text
);

CREATE INDEX IF NOT EXISTS idx_fixed_asset_docs_asset
  ON fixed_asset_documents (fixed_asset_id) WHERE is_active;

CREATE OR REPLACE FUNCTION fixed_assets_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_fixed_assets_updated_at ON fixed_assets;
CREATE TRIGGER trg_fixed_assets_updated_at
  BEFORE UPDATE ON fixed_assets
  FOR EACH ROW
  EXECUTE FUNCTION fixed_assets_touch_updated_at();

DROP TRIGGER IF EXISTS trg_fixed_asset_docs_updated_at ON fixed_asset_documents;
CREATE TRIGGER trg_fixed_asset_docs_updated_at
  BEFORE UPDATE ON fixed_asset_documents
  FOR EACH ROW
  EXECUTE FUNCTION fixed_assets_touch_updated_at();

ALTER TABLE fixed_assets           ENABLE ROW LEVEL SECURITY;
ALTER TABLE fixed_asset_documents  ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "users manage fixed_assets" ON fixed_assets
    FOR ALL USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "users manage fixed_asset_documents" ON fixed_asset_documents
    FOR ALL USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Storage bucket for fixed-asset documents & covers (10 MB)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'fixed-asset-docs',
  'fixed-asset-docs',
  true,
  10485760,
  ARRAY[
    'image/jpeg', 'image/png', 'image/webp', 'image/gif',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ]
)
ON CONFLICT (id) DO NOTHING;

DO $$ BEGIN
  CREATE POLICY "fixed_asset_docs_select"
    ON storage.objects FOR SELECT
    TO public
    USING (bucket_id = 'fixed-asset-docs');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "fixed_asset_docs_insert"
    ON storage.objects FOR INSERT
    TO authenticated
    WITH CHECK (bucket_id = 'fixed-asset-docs');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "fixed_asset_docs_update"
    ON storage.objects FOR UPDATE
    TO authenticated
    USING (bucket_id = 'fixed-asset-docs');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "fixed_asset_docs_delete"
    ON storage.objects FOR DELETE
    TO authenticated
    USING (bucket_id = 'fixed-asset-docs');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
