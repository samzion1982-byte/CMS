-- ═══════════════════════════════════════════════════════════════
-- Auto-update pg_cron schedule for daily greetings whenever
-- greeting_time or auto_greeting_enabled changes.
-- Converts IST greeting_time → UTC cron expression on every save.
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION refresh_greeting_cron()
RETURNS TRIGGER AS $$
DECLARE
  v_time      TEXT;
  v_ist_min   INT;
  v_utc_min   INT;
  v_cron_expr TEXT;
BEGIN
  -- Always remove the existing job first
  BEGIN
    PERFORM cron.unschedule('auto-daily-greetings');
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  -- If auto-greeting is disabled, leave unscheduled
  IF NOT COALESCE(NEW.auto_greeting_enabled, false) THEN
    RETURN NEW;
  END IF;

  v_time := COALESCE(NEW.greeting_time, '08:00');

  -- Parse IST HH:MM to total minutes
  v_ist_min := split_part(v_time, ':', 1)::INT * 60
             + split_part(v_time, ':', 2)::INT;

  -- Convert IST → UTC  (IST = UTC + 5h30m = 330 min)
  v_utc_min := v_ist_min - 330;
  IF v_utc_min < 0 THEN
    v_utc_min := v_utc_min + 1440;
  END IF;

  -- Build cron: mm hh * * * (every day)
  v_cron_expr := (v_utc_min % 60) || ' ' || (v_utc_min / 60) || ' * * *';

  PERFORM cron.schedule(
    'auto-daily-greetings',
    v_cron_expr,
    $job$
      SELECT net.http_post(
        url     := 'https://wjasjrthijpxlarreics.supabase.co/functions/v1/send-daily-greetings',
        headers := jsonb_build_object(
          'Content-Type',  'application/json',
          'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndqYXNqcnRoaWpweGxhcnJlaWNzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjE4MDMwMCwiZXhwIjoyMDkxNzU2MzAwfQ.B8oBuQRGxdkhFnvSrbddtMQ1Abo9YNwexRy1nks3SnM'
        ),
        body    := '{}'::jsonb
      );
    $job$
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_refresh_greeting_cron ON announcement_settings;
CREATE TRIGGER trg_refresh_greeting_cron
  AFTER INSERT OR UPDATE OF greeting_time, auto_greeting_enabled
  ON announcement_settings
  FOR EACH ROW
  EXECUTE FUNCTION refresh_greeting_cron();

-- Apply to current settings immediately
UPDATE announcement_settings SET greeting_time = greeting_time;
