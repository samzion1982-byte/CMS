-- ═══════════════════════════════════════════════════════════════
-- bible_verses improvements:
--   1. Add verse_text_tamil_reference column (was missing)
--   2. Add unique constraint on (type, verse_reference) to enable upsert
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE bible_verses
  ADD COLUMN IF NOT EXISTS verse_text_tamil_reference TEXT;

-- Older Postgres versions do not support ADD CONSTRAINT IF NOT EXISTS
-- Use a guarded DO block to add the constraint only when missing.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class t ON c.conrelid = t.oid
    WHERE c.conname = 'bible_verses_type_ref_unique' AND t.relname = 'bible_verses'
  ) THEN
    ALTER TABLE bible_verses
      ADD CONSTRAINT bible_verses_type_ref_unique UNIQUE (type, verse_reference);
  END IF;
END
$$;
