-- ═══════════════════════════════════════════════════════════════
-- Asset stock-in / stock-out dates for point-in-time counts
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE assets
  ADD COLUMN IF NOT EXISTS stock_in_date  date,
  ADD COLUMN IF NOT EXISTS stock_out_date date;

-- Default existing rows: treat created_at date as stock-in
UPDATE assets
SET stock_in_date = COALESCE(stock_in_date, invoice_date, created_at::date)
WHERE stock_in_date IS NULL;

ALTER TABLE assets
  ALTER COLUMN stock_in_date SET DEFAULT CURRENT_DATE;

-- Prefer NOT NULL going forward; leave nullable for safety if some legacy rows remain blank
DO $$ BEGIN
  ALTER TABLE assets
    ADD CONSTRAINT assets_stock_out_after_in
    CHECK (stock_out_date IS NULL OR stock_in_date IS NULL OR stock_out_date >= stock_in_date);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_assets_stock_in  ON assets (stock_in_date);
CREATE INDEX IF NOT EXISTS idx_assets_stock_out ON assets (stock_out_date);
