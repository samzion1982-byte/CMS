-- Add theme preference column to profiles table
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS theme text
  CHECK (theme IN ('royal', 'ocean', 'forest', 'crimson', 'midnight'));
