-- Add email column to churches table for Church Identity section
ALTER TABLE churches ADD COLUMN IF NOT EXISTS email text;
