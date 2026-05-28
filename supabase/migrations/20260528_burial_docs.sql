ALTER TABLE burial_records ADD COLUMN IF NOT EXISTS doc1_label text;
ALTER TABLE burial_records ADD COLUMN IF NOT EXISTS doc1_url   text;
ALTER TABLE burial_records ADD COLUMN IF NOT EXISTS doc2_label text;
ALTER TABLE burial_records ADD COLUMN IF NOT EXISTS doc2_url   text;
ALTER TABLE burial_records ADD COLUMN IF NOT EXISTS doc3_label text;
ALTER TABLE burial_records ADD COLUMN IF NOT EXISTS doc3_url   text;
