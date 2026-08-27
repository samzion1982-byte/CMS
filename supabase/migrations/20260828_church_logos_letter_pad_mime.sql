-- Allow Church Setup letter-pad uploads (PDF / images / Word / CDR / PSD)
-- in the existing public church-logos bucket.
-- Error without this: "mime type …wordprocessingml.document is not supported"

UPDATE storage.buckets
SET file_size_limit = GREATEST(COALESCE(file_size_limit, 0), 20971520), -- 20 MB
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
