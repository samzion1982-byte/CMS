CREATE TABLE IF NOT EXISTS baptism_records (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seq_num               integer NOT NULL,
  year                  integer NOT NULL,
  date_of_baptism       text,
  date_of_birth         text,
  name                  text,
  sex                   text,
  father_name           text,
  mother_name           text,
  profession_of_parents text,
  address               text,
  place_of_baptism      text,
  baptized_by           text,
  god_parents           text,
  remarks               text,
  photo_url             text,
  created_at            timestamptz DEFAULT now(),
  updated_at            timestamptz DEFAULT now(),
  UNIQUE (seq_num, year)
);

ALTER TABLE baptism_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth read baptism_records"   ON baptism_records FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "auth insert baptism_records" ON baptism_records FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "auth update baptism_records" ON baptism_records FOR UPDATE USING (auth.role() = 'authenticated');
CREATE POLICY "auth delete baptism_records" ON baptism_records FOR DELETE USING (auth.role() = 'authenticated');
