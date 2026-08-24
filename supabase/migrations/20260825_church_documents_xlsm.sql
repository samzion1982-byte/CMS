-- Accept Excel macro workbooks (.xlsm) in church-documents
-- (Auction Report stores the original Total Purchase file).

UPDATE storage.buckets
SET file_size_limit = GREATEST(COALESCE(file_size_limit, 0), 26214400),
    allowed_mime_types = (
  SELECT ARRAY(
    SELECT DISTINCT unnest(
      COALESCE(allowed_mime_types, ARRAY[]::text[])
      || ARRAY[
        'application/vnd.ms-excel.sheet.macroEnabled.12',
        'application/vnd.ms-excel.sheet.macroenabled.12',
        'application/vnd.ms-excel.sheet.binary.macroEnabled.12',
        'application/vnd.ms-excel.sheet.binary.macroenabled.12',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.macroEnabled.12',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/octet-stream',
        'text/csv',
        'text/plain'
      ]
    )
  )
)
WHERE id = 'church-documents';
