-- Add dashboard rotation persistence to user profiles
-- Run this in Supabase SQL Editor.

ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS dashboard_zone_rotation integer;
