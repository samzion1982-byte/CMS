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

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='church_zones' AND policyname='zones_select') THEN
    CREATE POLICY "zones_select" ON church_zones FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='church_zones' AND policyname='zones_insert') THEN
    CREATE POLICY "zones_insert" ON church_zones FOR INSERT TO authenticated WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='church_zones' AND policyname='zones_update') THEN
    CREATE POLICY "zones_update" ON church_zones FOR UPDATE TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='church_zones' AND policyname='zones_delete') THEN
    CREATE POLICY "zones_delete" ON church_zones FOR DELETE TO authenticated USING (true);
  END IF;
END $$;

-- ── Seed with all zones (Others always last) ─────────────────
INSERT INTO church_zones (zone_name, sort_order) VALUES
  ('Ramalinga Nagar',                          1),
  ('Woraiyur',                                 2),
  ('Kondayam Palayam',                         3),
  ('Ariyamangalam',                            4),
  ('Srirangam',                                5),
  ('Thillai Nagar',                            6),
  ('Puthur',                                   7),
  ('UKT Malai - Renga Nagar - Rettai Vaikkal', 8),
  ('Srinivasa Nagar',                          9),
  ('Bharathi Nagar',                           10),
  ('Somarasampettai - Allithurai',             11),
  ('Vasan Nagar - Vasan Valley - Nachikurichi',12),
  ('Gandhi Market',                            13),
  ('Thayanur',                                 14),
  ('Lingam Nagar',                             15),
  ('Others',                                   99)
ON CONFLICT (zone_name) DO NOTHING;
