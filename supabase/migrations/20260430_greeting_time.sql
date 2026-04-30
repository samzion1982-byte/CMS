-- ═══════════════════════════════════════════════════════════════
-- Add configurable greeting_time to announcement_settings
-- and create the greeting-backgrounds storage bucket
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE announcement_settings
  ADD COLUMN IF NOT EXISTS greeting_time TEXT DEFAULT '08:00';

-- Storage bucket for greeting card backgrounds (public)
INSERT INTO storage.buckets (id, name, public)
VALUES ('greeting-backgrounds', 'greeting-backgrounds', true)
ON CONFLICT DO NOTHING;

-- RLS: anyone can read (public bucket), authenticated users can write
DROP POLICY IF EXISTS "Public read greeting backgrounds"   ON storage.objects;
DROP POLICY IF EXISTS "Auth manage greeting backgrounds"   ON storage.objects;
DROP POLICY IF EXISTS "Auth delete greeting backgrounds"   ON storage.objects;

CREATE POLICY "Public read greeting backgrounds"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'greeting-backgrounds');

CREATE POLICY "Auth manage greeting backgrounds"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'greeting-backgrounds' AND auth.role() = 'authenticated');

CREATE POLICY "Auth delete greeting backgrounds"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'greeting-backgrounds' AND auth.role() = 'authenticated');
