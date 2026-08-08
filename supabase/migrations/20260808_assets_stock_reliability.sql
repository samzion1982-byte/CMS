-- ═══════════════════════════════════════════════════════════════
-- Asset stock reliability: link split lines + date check tighten
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE assets
  ADD COLUMN IF NOT EXISTS source_asset_id uuid REFERENCES assets(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_assets_source ON assets (source_asset_id);

-- Reinforce: stock out cannot precede stock in
DO $$ BEGIN
  ALTER TABLE assets DROP CONSTRAINT IF EXISTS assets_stock_out_after_in;
  ALTER TABLE assets
    ADD CONSTRAINT assets_stock_out_after_in
    CHECK (stock_out_date IS NULL OR stock_in_date IS NULL OR stock_out_date >= stock_in_date);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON COLUMN assets.source_asset_id IS
  'When set, this row was split out from another stock line (partial Move Out).';
