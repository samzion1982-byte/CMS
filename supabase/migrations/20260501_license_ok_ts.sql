-- Add license_ok_ts to churches table
-- Stores the timestamp of the last successful license verification.
-- Used to enforce a 24-hour offline grace period when the license CSV is unreachable.
alter table "public"."churches"
  add column if not exists "license_ok_ts" timestamp with time zone;
