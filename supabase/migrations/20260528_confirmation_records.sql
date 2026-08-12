CREATE TABLE IF NOT EXISTS confirmation_records (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seq_num               integer NOT NULL,
  year                  integer NOT NULL,
  date_of_confirmation  text,
  date_of_birth         text,
  name                  text,
  gender                text,
  father_name           text,
  mother_name           text,
  address               text,
  place_of_confirmation text,
  confirmed_by          text,
  remarks               text,
  photo_url             text,
  created_at            timestamptz DEFAULT now(),
  updated_at            timestamptz DEFAULT now(),
  UNIQUE (seq_num, year)
);

ALTER TABLE confirmation_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth read confirmation_records"   ON confirmation_records FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "auth insert confirmation_records" ON confirmation_records FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "auth update confirmation_records" ON confirmation_records FOR UPDATE USING (auth.role() = 'authenticated');
CREATE POLICY "auth delete confirmation_records" ON confirmation_records FOR DELETE USING (auth.role() = 'authenticated');
