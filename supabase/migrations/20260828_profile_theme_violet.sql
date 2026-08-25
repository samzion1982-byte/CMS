-- Expand profiles.theme to every current light theme, including violet.
DO $$
DECLARE
  conname text;
BEGIN
  FOR conname IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'profiles'
      AND c.contype = 'c'
      AND a.attname = 'theme'
  LOOP
    EXECUTE format('ALTER TABLE public.profiles DROP CONSTRAINT %I', conname);
  END LOOP;
END $$;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_theme_check
  CHECK (
    theme IS NULL OR theme IN (
      'royal', 'ocean', 'forest', 'crimson', 'amber',
      'sky', 'sage', 'copper', 'blush', 'violet'
    )
  );
