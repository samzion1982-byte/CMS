-- ═══════════════════════════════════════════════════════════════
-- Asset Management enhancements:
--   • Sub-categories for locations & item types (parent_id)
--   • Quantity + warranty_upto on assets
--   • Photo size limit 1 MB
-- ═══════════════════════════════════════════════════════════════

-- ── 1. Sub-categories (parent_id) ────────────────────────────────

ALTER TABLE asset_locations
  ADD COLUMN IF NOT EXISTS parent_id uuid REFERENCES asset_locations(id) ON DELETE CASCADE;

ALTER TABLE asset_item_types
  ADD COLUMN IF NOT EXISTS parent_id uuid REFERENCES asset_item_types(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_asset_locations_parent  ON asset_locations(parent_id);
CREATE INDEX IF NOT EXISTS idx_asset_item_types_parent ON asset_item_types(parent_id);

-- Allow same child name under different parents (drop flat UNIQUE on name)
ALTER TABLE asset_locations  DROP CONSTRAINT IF EXISTS asset_locations_name_key;
ALTER TABLE asset_item_types DROP CONSTRAINT IF EXISTS asset_item_types_name_key;

CREATE UNIQUE INDEX IF NOT EXISTS idx_asset_locations_parent_name
  ON asset_locations (
    lower(name),
    COALESCE(parent_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );

CREATE UNIQUE INDEX IF NOT EXISTS idx_asset_item_types_parent_name
  ON asset_item_types (
    lower(name),
    COALESCE(parent_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );

-- ── 2. New asset fields ─────────────────────────────────────────

ALTER TABLE assets
  ADD COLUMN IF NOT EXISTS quantity integer NOT NULL DEFAULT 1
    CHECK (quantity > 0);

ALTER TABLE assets
  ADD COLUMN IF NOT EXISTS warranty_upto date;

-- ── 3. Tighten asset-photos to 1 MB ─────────────────────────────

UPDATE storage.buckets
SET file_size_limit = 1048576  -- 1 MB
WHERE id = 'asset-photos';
