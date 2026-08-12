-- Wedding records table
CREATE TABLE IF NOT EXISTS wedding_records (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seq_num             integer NOT NULL,
  year                integer NOT NULL,
  month               integer,
  day                 integer,
  date_of_application text,
  -- Groom
  name_groom          text,
  surname_groom       text,
  age_groom           text,
  dob_groom           text,
  condition_groom     text,
  profession_groom    text,
  father_name_groom   text,
  address_groom       text,
  aadhaar_groom       text,
  church_groom        text,
  w1_name_groom       text,
  w1_addr_groom       text,
  w2_name_groom       text,
  w2_addr_groom       text,
  -- Bride
  name_bride          text,
  surname_bride       text,
  age_bride           text,
  dob_bride           text,
  condition_bride     text,
  profession_bride    text,
  father_name_bride   text,
  address_bride       text,
  aadhaar_bride       text,
  church_bride        text,
  w1_name_bride       text,
  w1_addr_bride       text,
  w2_name_bride       text,
  w2_addr_bride       text,
  -- Ceremony
  bann                text,
  place_of_marriage   text,
  solemnized_by       text,
  remarks             text,
  -- File URLs (Supabase Storage)
  groom_photo_url     text,
  bride_photo_url     text,
  wedding_photo_url   text,
  groom_aadhaar_url   text,
  groom_baptism_url   text,
  groom_confirm_url   text,
  bride_aadhaar_url   text,
  bride_baptism_url   text,
  bride_confirm_url   text,
  -- Metadata
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now(),
  UNIQUE (seq_num, year)
);

ALTER TABLE wedding_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read wedding_records"
  ON wedding_records FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can insert wedding_records"
  ON wedding_records FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can update wedding_records"
  ON wedding_records FOR UPDATE USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can delete wedding_records"
  ON wedding_records FOR DELETE USING (auth.role() = 'authenticated');

-- Storage bucket for event media (photos + documents)
INSERT INTO storage.buckets (id, name, public)
  VALUES ('event-media', 'event-media', true)
  ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Public read for event-media"
  ON storage.objects FOR SELECT USING (bucket_id = 'event-media');

CREATE POLICY "Authenticated upload for event-media"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'event-media' AND auth.role() = 'authenticated');

CREATE POLICY "Authenticated update for event-media"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'event-media' AND auth.role() = 'authenticated');

CREATE POLICY "Authenticated delete for event-media"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'event-media' AND auth.role() = 'authenticated');
