-- ═══════════════════════════════════════════════════════════════
-- Extend announcement_settings with weekly-report schedule fields
-- report_day:     0=Sun … 6=Sat  (default 6 = Saturday)
-- report_time:    HH:MM 24-h string (default '18:00' = 6 PM)
-- report_bearers: comma-separated bearer keys
--                 valid values: presbyter, secretary, treasurer, admin1
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE announcement_settings
  ADD COLUMN IF NOT EXISTS report_day     INT  DEFAULT 6,
  ADD COLUMN IF NOT EXISTS report_time    TEXT DEFAULT '18:00',
  ADD COLUMN IF NOT EXISTS report_bearers TEXT DEFAULT 'presbyter,secretary,treasurer';
