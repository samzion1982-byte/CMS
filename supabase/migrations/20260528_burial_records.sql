CREATE TABLE IF NOT EXISTS burial_records (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seq_num          integer NOT NULL,
  year             integer NOT NULL,
  when_died        text,
  when_buried      text,
  name             text,
  gender           text,
  age              text,
  profession       text,
  cause_of_death   text,
  parents_name     text,
  spouse_name      text,
  where_buried     text,
  buried_by        text,
  applicant_name   text,
  applicant_contact text,
  applicant_address text,
  remarks          text,
  photo_url        text,
  created_at       timestamptz DEFAULT now(),
  updated_at       timestamptz DEFAULT now(),
  UNIQUE (seq_num, year)
);

ALTER TABLE burial_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth read burial_records"   ON burial_records FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "auth insert burial_records" ON burial_records FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "auth update burial_records" ON burial_records FOR UPDATE USING (auth.role() = 'authenticated');
CREATE POLICY "auth delete burial_records" ON burial_records FOR DELETE USING (auth.role() = 'authenticated');
