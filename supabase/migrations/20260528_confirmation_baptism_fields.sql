ALTER TABLE confirmation_records ADD COLUMN IF NOT EXISTS date_of_baptism  text;
ALTER TABLE confirmation_records ADD COLUMN IF NOT EXISTS place_of_baptism text;
ALTER TABLE confirmation_records ADD COLUMN IF NOT EXISTS baptized_by      text;
ALTER TABLE confirmation_records ADD COLUMN IF NOT EXISTS baptism_reg_no   text;
