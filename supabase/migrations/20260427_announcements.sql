-- ═══════════════════════════════════════════════════════════════
-- Announcements module: bible_verses, announcement_settings,
-- announcements_log, churches table additions
-- ═══════════════════════════════════════════════════════════════

-- 1. Bible verses
CREATE TABLE IF NOT EXISTS bible_verses (
  id                UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  type              TEXT NOT NULL CHECK (type IN ('birthday','anniversary')),
  verse_reference   TEXT NOT NULL,
  verse_text_english TEXT NOT NULL,
  verse_text_tamil  TEXT,
  is_active         BOOLEAN DEFAULT true,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  created_by        TEXT
);

-- 2. Announcement settings (single row)
CREATE TABLE IF NOT EXISTS announcement_settings (
  id                    UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  auto_report_enabled   BOOLEAN DEFAULT false,
  auto_greeting_enabled BOOLEAN DEFAULT false,
  updated_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_by            TEXT
);

INSERT INTO announcement_settings (auto_report_enabled, auto_greeting_enabled)
SELECT false, false
WHERE NOT EXISTS (SELECT 1 FROM announcement_settings);

-- 3. Announcements log
CREATE TABLE IF NOT EXISTS announcements_log (
  id               UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  log_type         TEXT NOT NULL CHECK (log_type IN ('birthday_wish','anniversary_wish','weekly_report')),
  recipient_name   TEXT,
  recipient_number TEXT,
  member_id        TEXT,
  family_id        TEXT,
  event_date       DATE,
  status           TEXT DEFAULT 'pending' CHECK (status IN ('sent','failed','pending')),
  error_message    TEXT,
  sent_at          TIMESTAMPTZ DEFAULT NOW(),
  triggered_by     TEXT DEFAULT 'auto' CHECK (triggered_by IN ('auto','manual')),
  card_url         TEXT,
  message_preview  TEXT
);

-- 4. Churches table — WhatsApp API type + official API fields
ALTER TABLE churches ADD COLUMN IF NOT EXISTS whatsapp_api_type         TEXT DEFAULT 'soft7';
ALTER TABLE churches ADD COLUMN IF NOT EXISTS official_phone_number_id  TEXT;
ALTER TABLE churches ADD COLUMN IF NOT EXISTS official_bearer_token     TEXT;

-- 5. Storage buckets (run in Supabase Dashboard → Storage if not using migrations)
-- CREATE BUCKET IF NOT EXISTS "announcement-cards"  (public = true)
-- CREATE BUCKET IF NOT EXISTS "announcement-reports" (public = true)

-- 6. pg_cron scheduled jobs
-- Enable pg_cron extension first: Dashboard → Database → Extensions → pg_cron
-- Also enable pg_net extension (required for net.http_post)

-- Daily greeting at 12:01 AM IST (18:31 UTC)
SELECT cron.schedule(
  'announcement-daily-greetings',
  '31 18 * * *',
  $$
    SELECT net.http_post(
      url     := 'https://wjasjrthijpxlarreics.supabase.co/functions/v1/send-daily-greetings',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndqYXNqcnRoaWpweGxhcnJlaWNzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjE4MDMwMCwiZXhwIjoyMDkxNzU2MzAwfQ.B8oBuQRGxdkhFnvSrbddtMQ1Abo9YNwexRy1nks3SnM'
      ),
      body    := '{}'::jsonb
    );
  $$
);

-- Weekly report every Saturday at 6 PM IST (12:30 UTC)
SELECT cron.schedule(
  'announcement-weekly-report',
  '30 12 * * 6',
  $$
    SELECT net.http_post(
      url     := 'https://wjasjrthijpxlarreics.supabase.co/functions/v1/send-weekly-report',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndqYXNqcnRoaWpweGxhcnJlaWNzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjE4MDMwMCwiZXhwIjoyMDkxNzU2MzAwfQ.B8oBuQRGxdkhFnvSrbddtMQ1Abo9YNwexRy1nks3SnM'
      ),
      body    := '{}'::jsonb
    );
  $$
);
