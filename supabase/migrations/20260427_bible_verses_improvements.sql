-- ═══════════════════════════════════════════════════════════════
-- bible_verses improvements:
--   1. Add verse_text_tamil_reference column (was missing)
--   2. Add unique constraint on (type, verse_reference) to enable upsert
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE bible_verses
  ADD COLUMN IF NOT EXISTS verse_text_tamil_reference TEXT;

ALTER TABLE bible_verses
  ADD CONSTRAINT IF NOT EXISTS bible_verses_type_ref_unique
  UNIQUE (type, verse_reference);
