-- Print Corner — blank scanned application forms (PDF / JPEG repository)
-- Not mail-merge templates: staff print or share the file as-is when a member requests it.

CREATE TABLE IF NOT EXISTS public.print_corner_application_forms (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  form_key        text        NOT NULL,
  label           text        NOT NULL,
  description     text,
  storage_path    text,
  file_name       text,
  mime_type       text,
  file_size       bigint,
  sort_order      integer     NOT NULL DEFAULT 0,
  is_active       boolean     NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS print_corner_application_forms_key_uidx
  ON public.print_corner_application_forms (lower(form_key));

CREATE INDEX IF NOT EXISTS idx_print_corner_application_forms_active
  ON public.print_corner_application_forms (is_active, sort_order);

ALTER TABLE public.print_corner_application_forms ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "users manage print_corner_application_forms"
    ON public.print_corner_application_forms
    FOR ALL USING (EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Allow JPEG/PNG blank form scans in the print-corner bucket
UPDATE storage.buckets
SET
  allowed_mime_types = ARRAY[
    'application/pdf',
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/msword',
    'application/json'
  ],
  file_size_limit = 52428800
WHERE id = 'print-corner';

COMMENT ON TABLE public.print_corner_application_forms IS
  'Blank scanned application forms (PDF/JPEG) shared/printed as-is — not mail-merge.';
