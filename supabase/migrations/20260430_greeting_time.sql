-- ═══════════════════════════════════════════════════════════════
-- Add configurable greeting_time to announcement_settings
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE announcement_settings
  ADD COLUMN IF NOT EXISTS greeting_time TEXT DEFAULT '08:00';
