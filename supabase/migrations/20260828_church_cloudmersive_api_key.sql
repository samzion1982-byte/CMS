-- Cloudmersive API key for Print Corner Tamil-font PDF (optional per church)
ALTER TABLE public.churches
  ADD COLUMN IF NOT EXISTS cloudmersive_api_key text;

COMMENT ON COLUMN public.churches.cloudmersive_api_key IS
  'Cloudmersive API key for Print Corner Tamil-font PDF conversion (optional; edge function reads via service role)';
