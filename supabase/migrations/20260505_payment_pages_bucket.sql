-- ═══════════════════════════════════════════════════════════════
-- payment-pages storage bucket + RLS policies
-- Run in Supabase Dashboard → SQL Editor
-- ═══════════════════════════════════════════════════════════════

-- Create bucket (public so WhatsApp API can download the file)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'payment-pages',
  'payment-pages',
  true,
  2097152,   -- 2 MB limit
  ARRAY['text/html', 'application/pdf']
)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload / overwrite payment HTML files
DO $$ BEGIN
  CREATE POLICY "payment_pages_insert"
    ON storage.objects FOR INSERT
    TO authenticated
    WITH CHECK (bucket_id = 'payment-pages');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "payment_pages_update"
    ON storage.objects FOR UPDATE
    TO authenticated
    USING (bucket_id = 'payment-pages');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Allow public read so WhatsApp API and members can access the file
DO $$ BEGIN
  CREATE POLICY "payment_pages_select"
    ON storage.objects FOR SELECT
    TO public
    USING (bucket_id = 'payment-pages');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Allow authenticated users to delete old files
DO $$ BEGIN
  CREATE POLICY "payment_pages_delete"
    ON storage.objects FOR DELETE
    TO authenticated
    USING (bucket_id = 'payment-pages');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
