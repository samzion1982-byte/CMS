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

-- Allow letter-pad file types on church-logos (PDF / images / Word / CDR / PSD)
UPDATE storage.buckets
SET file_size_limit = GREATEST(COALESCE(file_size_limit, 0), 20971520),
    allowed_mime_types = (
  SELECT ARRAY(
    SELECT DISTINCT unnest(
      COALESCE(allowed_mime_types, ARRAY[]::text[])
      || ARRAY[
        'application/pdf',
        'image/jpeg',
        'image/jpg',
        'image/png',
        'image/webp',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/msword',
        'application/x-coreldraw',
        'application/coreldraw',
        'image/x-coreldraw',
        'image/vnd.adobe.photoshop',
        'application/x-photoshop',
        'application/photoshop',
        'application/octet-stream'
      ]
    )
  )
)
WHERE id = 'church-logos';
