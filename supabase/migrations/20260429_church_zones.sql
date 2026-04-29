-- ═══════════════════════════════════════════════════════════════
-- church_zones — Managed zonal areas used in member records
-- Super Admin and Admin1 can add / edit / delete zones.
-- MembersPage reads from this table (no hardcoded values).
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS church_zones (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  zone_name  TEXT        NOT NULL,
  sort_order INT         NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by TEXT,
  UNIQUE (zone_name)
);

ALTER TABLE church_zones ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read zones (needed in member form)
CREATE POLICY "zones_select"
  ON church_zones FOR SELECT TO authenticated USING (true);

-- Write access is controlled in the UI; allow any authenticated at DB level
CREATE POLICY "zones_insert"
  ON church_zones FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "zones_update"
  ON church_zones FOR UPDATE TO authenticated USING (true);

CREATE POLICY "zones_delete"
  ON church_zones FOR DELETE TO authenticated USING (true);

-- ── Seed with zones already imported from Excel ───────────────
INSERT INTO church_zones (zone_name, sort_order) VALUES
  ('Ramalinga Nagar',   1),
  ('Woraiyur',          2),
  ('Kondayam Palayam',  3),
  ('Ariyamangalam',     4),
  ('Srirangam',         5),
  ('Thillai Nagar',     6),
  ('Puthur',            7),
  ('Others',            8)
ON CONFLICT (zone_name) DO NOTHING;
