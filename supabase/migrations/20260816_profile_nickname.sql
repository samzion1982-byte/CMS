-- Nickname for welcome screen and header badge (personal short name).

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS nickname text;
