-- User-created reminders shown in the header Alerts panel.
-- scope = 'self'  → only the creator
-- scope = 'all'   → every signed-in user

CREATE TABLE IF NOT EXISTS public.user_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  due_date date NOT NULL,
  alert_days_before integer NOT NULL DEFAULT 10
    CONSTRAINT user_alerts_alert_days_before_chk
    CHECK (alert_days_before >= 1 AND alert_days_before <= 365),
  scope text NOT NULL DEFAULT 'self'
    CONSTRAINT user_alerts_scope_chk
    CHECK (scope IN ('self', 'all')),
  created_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_alerts_due ON public.user_alerts (due_date);
CREATE INDEX IF NOT EXISTS idx_user_alerts_created_by ON public.user_alerts (created_by);

ALTER TABLE public.user_alerts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_alerts_select" ON public.user_alerts;
CREATE POLICY "user_alerts_select"
  ON public.user_alerts
  FOR SELECT
  TO authenticated
  USING (scope = 'all' OR created_by = auth.uid());

DROP POLICY IF EXISTS "user_alerts_insert" ON public.user_alerts;
CREATE POLICY "user_alerts_insert"
  ON public.user_alerts
  FOR INSERT
  TO authenticated
  WITH CHECK (created_by = auth.uid());

DROP POLICY IF EXISTS "user_alerts_update" ON public.user_alerts;
CREATE POLICY "user_alerts_update"
  ON public.user_alerts
  FOR UPDATE
  TO authenticated
  USING (created_by = auth.uid())
  WITH CHECK (created_by = auth.uid());

DROP POLICY IF EXISTS "user_alerts_delete" ON public.user_alerts;
CREATE POLICY "user_alerts_delete"
  ON public.user_alerts
  FOR DELETE
  TO authenticated
  USING (created_by = auth.uid());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_alerts TO authenticated;
