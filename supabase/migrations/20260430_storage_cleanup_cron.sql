-- Hourly FIFO cleanup of transient storage buckets.
-- Deletes files older than their configured max-age.
-- Templates (files/folders named "template") are never deleted.
SELECT cron.schedule(
  'cleanup-old-storage',
  '0 * * * *',
  $$
    SELECT net.http_post(
      url     := 'https://wjasjrthijpxlarreics.supabase.co/functions/v1/cleanup-old-storage',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndqYXNqcnRoaWpweGxhcnJlaWNzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjE4MDMwMCwiZXhwIjoyMDkxNzU2MzAwfQ.B8oBuQRGxdkhFnvSrbddtMQ1Abo9YNwexRy1nks3SnM'
      ),
      body    := '{}'::jsonb
    );
  $$
);
