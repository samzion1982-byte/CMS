-- Allow auction tracker files (xlsm / csv) in church-documents,
-- used as year-wise reference copies on Auction Report.

UPDATE storage.buckets
SET allowed_mime_types = (
  SELECT ARRAY(
    SELECT DISTINCT unnest(
      COALESCE(allowed_mime_types, ARRAY[]::text[])
      || ARRAY[
        'application/vnd.ms-excel.sheet.macroEnabled.12',
        'application/vnd.ms-excel.sheet.macroenabled.12',
        'application/vnd.ms-excel.sheet.binary.macroEnabled.12',
        'application/vnd.ms-excel.sheet.binary.macroenabled.12',
        'text/csv',
        'text/plain',
        'application/octet-stream'
      ]
    )
  )
)
WHERE id = 'church-documents';
