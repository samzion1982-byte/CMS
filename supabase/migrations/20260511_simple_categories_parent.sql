-- Add sub-category support to Simple Accounts categories

ALTER TABLE simple_categories
  ADD COLUMN IF NOT EXISTS parent_id uuid REFERENCES simple_categories(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_simple_cat_parent ON simple_categories(parent_id);
