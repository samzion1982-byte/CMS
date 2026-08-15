-- Per-document renewal / expiry alerts (e.g. domain, subscription, warranty)
-- Notify in the header bell this many days before warranty_upto / expiry.

ALTER TABLE church_documents
  ADD COLUMN IF NOT EXISTS alert_days_before integer;

DO $$ BEGIN
  ALTER TABLE church_documents
    ADD CONSTRAINT church_documents_alert_days_before_chk
    CHECK (alert_days_before IS NULL OR (alert_days_before >= 1 AND alert_days_before <= 365));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_church_documents_alerts
  ON church_documents (warranty_upto)
  WHERE status = 'active' AND is_active AND alert_days_before IS NOT NULL;
