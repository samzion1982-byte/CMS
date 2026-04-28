-- ═══════════════════════════════════════════════════════════════
-- Storage RLS policies for announcement-cards and announcement-reports
-- Run in Supabase Dashboard → SQL Editor
-- ═══════════════════════════════════════════════════════════════

-- ── announcement-cards bucket ────────────────────────────────
-- Allow authenticated users to upload/overwrite cards
CREATE POLICY "announcement_cards_insert"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'announcement-cards');

CREATE POLICY "announcement_cards_update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'announcement-cards');

-- Allow public read (cards are sent as public URLs in WhatsApp)
CREATE POLICY "announcement_cards_select"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'announcement-cards');

-- Allow authenticated users to delete old cards
CREATE POLICY "announcement_cards_delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'announcement-cards');

-- ── announcement-reports bucket ──────────────────────────────
CREATE POLICY "announcement_reports_insert"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'announcement-reports');

CREATE POLICY "announcement_reports_update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'announcement-reports');

CREATE POLICY "announcement_reports_select"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'announcement-reports');

CREATE POLICY "announcement_reports_delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'announcement-reports');
