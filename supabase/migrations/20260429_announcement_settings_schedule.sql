-- ═══════════════════════════════════════════════════════════════
-- Extend announcement_settings with weekly-report schedule fields
-- report_day:     0=Sun … 6=Sat  (default 6 = Saturday)
-- report_hour:    0-23 in 24-h   (default 18 = 6 PM)
-- report_bearers: comma-separated list of bearer keys
--                 valid values: presbyter, secretary, treasurer, admin1
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE announcement_settings
  ADD COLUMN IF NOT EXISTS report_day     INT  DEFAULT 6,
  ADD COLUMN IF NOT EXISTS report_hour    INT  DEFAULT 18,
  ADD COLUMN IF NOT EXISTS report_bearers TEXT DEFAULT 'presbyter,secretary,treasurer';
