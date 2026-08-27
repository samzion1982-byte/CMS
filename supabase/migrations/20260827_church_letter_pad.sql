-- Church letter pad (scanned blank letterhead) for Print Corner Helper Docs

ALTER TABLE public.churches
  ADD COLUMN IF NOT EXISTS letter_pad_url       text,
  ADD COLUMN IF NOT EXISTS letter_pad_file_name text,
  ADD COLUMN IF NOT EXISTS letter_pad_mime_type text;

COMMENT ON COLUMN public.churches.letter_pad_url IS
  'Scanned church letter pad (PDF/JPEG/PNG) — downloadable from Print Corner Helper Docs';
COMMENT ON COLUMN public.churches.letter_pad_file_name IS
  'Original filename of the uploaded letter pad';
COMMENT ON COLUMN public.churches.letter_pad_mime_type IS
  'MIME type of the uploaded letter pad';
