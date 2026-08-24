-- Auction Report files live in their own bucket (not church-documents).
-- Moves any existing auction-ref/* objects out of church-documents.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'auction-reports',
  'auction-reports',
  true,
  26214400,
  ARRAY[
    'image/jpeg', 'image/png', 'image/webp', 'image/gif',
    'application/pdf',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel.sheet.macroEnabled.12',
    'application/vnd.ms-excel.sheet.macroenabled.12',
    'application/vnd.ms-excel.sheet.binary.macroEnabled.12',
    'application/vnd.ms-excel.sheet.binary.macroenabled.12',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.macroEnabled.12',
    'text/csv',
    'text/plain',
    'application/octet-stream'
  ]
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = GREATEST(COALESCE(storage.buckets.file_size_limit, 0), EXCLUDED.file_size_limit),
  allowed_mime_types = (
    SELECT ARRAY(
      SELECT DISTINCT unnest(
        COALESCE(storage.buckets.allowed_mime_types, ARRAY[]::text[])
        || EXCLUDED.allowed_mime_types
      )
    )
  );

DO $$ BEGIN
  CREATE POLICY "auction_reports_select"
    ON storage.objects FOR SELECT
    TO public
    USING (bucket_id = 'auction-reports');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "auction_reports_insert"
    ON storage.objects FOR INSERT
    TO authenticated
    WITH CHECK (bucket_id = 'auction-reports');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "auction_reports_update"
    ON storage.objects FOR UPDATE
    TO authenticated
    USING (bucket_id = 'auction-reports');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "auction_reports_delete"
    ON storage.objects FOR DELETE
    TO authenticated
    USING (bucket_id = 'auction-reports');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Relocate previously stored Total Purchase / close reports.
UPDATE storage.objects
SET bucket_id = 'auction-reports'
WHERE bucket_id = 'church-documents'
  AND (name = 'auction-ref' OR name LIKE 'auction-ref/%');
