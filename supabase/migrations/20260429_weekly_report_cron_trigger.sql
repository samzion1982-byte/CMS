-- ═══════════════════════════════════════════════════════════════
-- Auto-update pg_cron schedule whenever announcement_settings change
-- Converts IST report_time → UTC cron expression on every save
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION refresh_weekly_report_cron()
RETURNS TRIGGER AS $$
DECLARE
  v_time      TEXT;
  v_day       INT;
  v_ist_min   INT;
  v_utc_min   INT;
  v_cron_day  INT;
  v_cron_expr TEXT;
BEGIN
  -- Always remove existing job first
  BEGIN
    PERFORM cron.unschedule('announcement-weekly-report');
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  -- If auto-report is disabled, leave unscheduled
  IF NOT COALESCE(NEW.auto_report_enabled, false) THEN
    RETURN NEW;
  END IF;

  v_time := COALESCE(NEW.report_time, '18:00');
  v_day  := COALESCE(NEW.report_day, 6);

  -- Parse IST HH:MM to total minutes from midnight
  v_ist_min := split_part(v_time, ':', 1)::INT * 60
             + split_part(v_time, ':', 2)::INT;

  -- Convert IST → UTC  (IST = UTC + 5h30m = 330 min)
  v_utc_min  := v_ist_min - 330;
  v_cron_day := v_day;

  -- Handle day rollover when IST time is before 5:30 AM
  IF v_utc_min < 0 THEN
    v_utc_min  := v_utc_min + 1440;
    v_cron_day := (v_cron_day + 6) % 7;
  END IF;

  -- Build cron expression:  mm hh * * dow
  v_cron_expr := (v_utc_min % 60) || ' ' || (v_utc_min / 60) || ' * * ' || v_cron_day;

  PERFORM cron.schedule(
    'announcement-weekly-report',
    v_cron_expr,
    $job$
      SELECT net.http_post(
        url     := 'https://wjasjrthijpxlarreics.supabase.co/functions/v1/send-weekly-report',
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

-- Fire on every save that touches schedule-related columns
DROP TRIGGER IF EXISTS trg_refresh_report_cron ON announcement_settings;
CREATE TRIGGER trg_refresh_report_cron
  AFTER INSERT OR UPDATE OF report_day, report_time, auto_report_enabled
  ON announcement_settings
  FOR EACH ROW
  EXECUTE FUNCTION refresh_weekly_report_cron();

-- Apply to current settings immediately (touch the row to fire the trigger)
UPDATE announcement_settings
SET    report_time = report_time;
