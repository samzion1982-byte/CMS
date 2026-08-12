-- ═══════════════════════════════════════════════════════════════
-- Exclusion Wish List for Announcements
-- Members on this list are skipped when sending birthday /
-- anniversary wishes (WhatsApp auto, WhatsApp manual, PDF reports).
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS announcement_exclusions (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id      TEXT        NOT NULL,
  member_name    TEXT        NOT NULL,
  family_id      TEXT,
  exclusion_type TEXT        NOT NULL
                             CHECK (exclusion_type IN ('anniversary','birthday','both')),
  reason         TEXT,
  added_by       TEXT,
  added_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (member_id)
);

-- One exclusion row per member_id (upsert on conflict replaces type/reason)

ALTER TABLE announcement_exclusions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "exclusions_select"
  ON announcement_exclusions FOR SELECT TO authenticated USING (true);

CREATE POLICY "exclusions_insert"
  ON announcement_exclusions FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "exclusions_update"
  ON announcement_exclusions FOR UPDATE TO authenticated USING (true);

CREATE POLICY "exclusions_delete"
  ON announcement_exclusions FOR DELETE TO authenticated USING (true);
