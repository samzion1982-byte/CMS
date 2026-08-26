-- Print Corner — letter templates, drafts, issued log, storage, church signatures
-- Scope for now: letters only. Certificates/forms are not seeded (Event Recorder handles register extracts).
-- Signature image URLs are stored on churches for later use; placement in Word is TBD.

-- Office bearer signature images (PNG preferred; stored in church-logos/signatures/)
ALTER TABLE public.churches
  ADD COLUMN IF NOT EXISTS presbyter_signature_url  text,
  ADD COLUMN IF NOT EXISTS secretary_signature_url  text,
  ADD COLUMN IF NOT EXISTS treasurer_signature_url  text;

COMMENT ON COLUMN public.churches.presbyter_signature_url  IS 'Print Corner / letters — PNG signature overlay';
COMMENT ON COLUMN public.churches.secretary_signature_url  IS 'Print Corner / forms — PNG signature overlay';
COMMENT ON COLUMN public.churches.treasurer_signature_url  IS 'Print Corner / finance letters — PNG signature overlay';

-- ── Catalog ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.print_corner_categories (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text        NOT NULL,
  parent_id   uuid        REFERENCES public.print_corner_categories(id) ON DELETE CASCADE,
  sort_order  integer     NOT NULL DEFAULT 0,
  is_active   boolean     NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS print_corner_categories_name_parent_uidx
  ON public.print_corner_categories (lower(name), COALESCE(parent_id, '00000000-0000-0000-0000-000000000000'::uuid));

CREATE INDEX IF NOT EXISTS idx_print_corner_categories_parent
  ON public.print_corner_categories (parent_id);

CREATE TABLE IF NOT EXISTS public.print_corner_templates (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id     uuid        NOT NULL REFERENCES public.print_corner_categories(id) ON DELETE CASCADE,
  template_key    text        NOT NULL,
  label           text        NOT NULL,
  template_type   text        NOT NULL CHECK (template_type IN ('certificate', 'letter', 'form')),
  description     text,
  storage_path    text,
  variables       jsonb       NOT NULL DEFAULT '[]'::jsonb,
  sort_order      integer     NOT NULL DEFAULT 0,
  is_active       boolean     NOT NULL DEFAULT true,
  include_tamil   boolean     NOT NULL DEFAULT false,
  config          jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS print_corner_templates_key_uidx
  ON public.print_corner_templates (template_key);

CREATE INDEX IF NOT EXISTS idx_print_corner_templates_category
  ON public.print_corner_templates (category_id);

CREATE TABLE IF NOT EXISTS public.print_corner_drafts (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id     uuid        REFERENCES public.print_corner_templates(id) ON DELETE SET NULL,
  template_key    text,
  member_id       text,
  status          text        NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'issued', 'cancelled')),
  wizard_step     integer     NOT NULL DEFAULT 1,
  field_values    jsonb       NOT NULL DEFAULT '{}'::jsonb,
  include_tamil   boolean     NOT NULL DEFAULT false,
  preview_path    text,
  created_by      uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by_email text,
  updated_at      timestamptz NOT NULL DEFAULT now(),
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_print_corner_drafts_status
  ON public.print_corner_drafts (status, updated_at DESC);

CREATE TABLE IF NOT EXISTS public.print_corner_issued_log (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id       uuid        REFERENCES public.print_corner_templates(id) ON DELETE SET NULL,
  template_key      text,
  template_type     text,
  member_id         text,
  issued_filename   text        NOT NULL,
  storage_path      text        NOT NULL,
  field_values      jsonb       NOT NULL DEFAULT '{}'::jsonb,
  source            text        NOT NULL DEFAULT 'register' CHECK (source IN ('register', 'manual', 'blank')),
  cloudconvert_job  text,
  issued_by         uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  issued_by_email   text,
  issued_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_print_corner_issued_at
  ON public.print_corner_issued_log (issued_at DESC);

CREATE INDEX IF NOT EXISTS idx_print_corner_issued_member
  ON public.print_corner_issued_log (member_id);

-- ── RLS ─────────────────────────────────────────────────────────

ALTER TABLE public.print_corner_categories   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.print_corner_templates    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.print_corner_drafts       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.print_corner_issued_log   ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "users manage print_corner_categories" ON public.print_corner_categories
    FOR ALL USING (EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "users manage print_corner_templates" ON public.print_corner_templates
    FOR ALL USING (EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "users manage print_corner_drafts" ON public.print_corner_drafts
    FOR ALL USING (EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "users manage print_corner_issued_log" ON public.print_corner_issued_log
    FOR ALL USING (EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── Storage bucket (private — issued PDFs kept forever, backup sync) ──

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'print-corner',
  'print-corner',
  false,
  52428800,
  ARRAY[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/msword',
    'application/json'
  ]
)
ON CONFLICT (id) DO UPDATE SET
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DO $$ BEGIN
  CREATE POLICY "print_corner_storage_select"
    ON storage.objects FOR SELECT TO authenticated
    USING (bucket_id = 'print-corner');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "print_corner_storage_insert"
    ON storage.objects FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'print-corner');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "print_corner_storage_update"
    ON storage.objects FOR UPDATE TO authenticated
    USING (bucket_id = 'print-corner');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "print_corner_storage_delete"
    ON storage.objects FOR DELETE TO authenticated
    USING (bucket_id = 'print-corner');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── Seed default catalog (idempotent) — Letters only for now ───
-- Certificates / forms stay out of seed; Event Recorder covers register extracts.
-- Office bearer signature URLs are stored on churches.* for later letter use.

DO $$
DECLARE
  cat_letter uuid;
BEGIN
  IF EXISTS (SELECT 1 FROM public.print_corner_templates LIMIT 1) THEN
    RETURN;
  END IF;

  INSERT INTO public.print_corner_categories (name, parent_id, sort_order)
  VALUES ('Letters', NULL, 1) RETURNING id INTO cat_letter;

  INSERT INTO public.print_corner_templates
    (category_id, template_key, label, template_type, description, sort_order, config) VALUES
    (cat_letter, 'letter-recommendation', 'Recommendation Letter', 'letter',
     'Church letterhead Word template + variables', 1, '{"engine":"office"}'::jsonb);
END $$;
