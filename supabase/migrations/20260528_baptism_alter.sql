ALTER TABLE baptism_records RENAME COLUMN sex TO gender;
ALTER TABLE baptism_records ADD COLUMN IF NOT EXISTS baptism_type text;
