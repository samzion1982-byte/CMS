-- ═══════════════════════════════════════════════════════════════
-- Church Documents — invoices / warranty papers under Asset Mgmt
-- Keep active until warranty ends, then move to Archive
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS church_document_categories (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text        NOT NULL,
  parent_id   uuid        REFERENCES church_document_categories(id) ON DELETE CASCADE,
  sort_order  integer     NOT NULL DEFAULT 0,
  is_active   boolean     NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS church_document_categories_name_parent_uidx
  ON church_document_categories (lower(name), COALESCE(parent_id, '00000000-0000-0000-0000-000000000000'::uuid));

CREATE INDEX IF NOT EXISTS idx_church_doc_categories_parent
  ON church_document_categories (parent_id);

CREATE TABLE IF NOT EXISTS church_documents (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id   uuid        REFERENCES church_document_categories(id) ON DELETE SET NULL,
  title         text        NOT NULL,
  doc_type      text,
  doc_date      date,
  warranty_upto date,
  vendor        text,
  status        text        NOT NULL DEFAULT 'active'
                  CHECK (status IN ('active', 'archived')),
  archived_at   timestamptz,
  file_name     text,
  file_path     text        NOT NULL,
  file_url      text,
  mime_type     text,
  file_size     integer,
  notes         text,
  sort_order    integer     NOT NULL DEFAULT 0,
  is_active     boolean     NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  created_by    text,
  updated_at    timestamptz NOT NULL DEFAULT now(),
  updated_by    text
);

CREATE INDEX IF NOT EXISTS idx_church_documents_status
  ON church_documents (status) WHERE is_active;
CREATE INDEX IF NOT EXISTS idx_church_documents_category
  ON church_documents (category_id);
CREATE INDEX IF NOT EXISTS idx_church_documents_warranty
  ON church_documents (warranty_upto) WHERE status = 'active' AND is_active;

CREATE OR REPLACE FUNCTION church_documents_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_church_documents_updated_at ON church_documents;
CREATE TRIGGER trg_church_documents_updated_at
  BEFORE UPDATE ON church_documents
  FOR EACH ROW
  EXECUTE FUNCTION church_documents_touch_updated_at();

ALTER TABLE church_document_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE church_documents           ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "users manage church_document_categories" ON church_document_categories
    FOR ALL USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "users manage church_documents" ON church_documents
    FOR ALL USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Seed top-level categories (idempotent)
INSERT INTO church_document_categories (name, sort_order)
SELECT v.name, v.sort_order
FROM (VALUES
  ('Invoices', 1),
  ('Warranty Cards', 2),
  ('Receipts', 3),
  ('Certificates', 4),
  ('Contracts', 5),
  ('Others', 99)
) AS v(name, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM church_document_categories c
  WHERE lower(c.name) = lower(v.name) AND c.parent_id IS NULL
);

-- Storage bucket (10 MB — PDF / Office / images)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'church-documents',
  'church-documents',
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
  CREATE POLICY "church_documents_select"
    ON storage.objects FOR SELECT
    TO public
    USING (bucket_id = 'church-documents');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "church_documents_insert"
    ON storage.objects FOR INSERT
    TO authenticated
    WITH CHECK (bucket_id = 'church-documents');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "church_documents_update"
    ON storage.objects FOR UPDATE
    TO authenticated
    USING (bucket_id = 'church-documents');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "church_documents_delete"
    ON storage.objects FOR DELETE
    TO authenticated
    USING (bucket_id = 'church-documents');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
