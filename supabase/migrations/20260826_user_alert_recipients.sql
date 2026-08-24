-- Selective recipients for user-created alerts.
-- scope = 'self'      → creator only
-- scope = 'all'       → every signed-in user (For selected → All)
-- scope = 'selected'  → rows in user_alert_recipients

ALTER TABLE public.user_alerts DROP CONSTRAINT IF EXISTS user_alerts_scope_chk;
ALTER TABLE public.user_alerts
  ADD CONSTRAINT user_alerts_scope_chk CHECK (scope IN ('self', 'all', 'selected'));

CREATE TABLE IF NOT EXISTS public.user_alert_recipients (
  alert_id uuid NOT NULL REFERENCES public.user_alerts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  PRIMARY KEY (alert_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_user_alert_recipients_user
  ON public.user_alert_recipients (user_id);

ALTER TABLE public.user_alert_recipients ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_user_alert_recipient(p_alert_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_alert_recipients r
    WHERE r.alert_id = p_alert_id
      AND r.user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.owns_user_alert(p_alert_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_alerts a
    WHERE a.id = p_alert_id
      AND a.created_by = auth.uid()
  );
$$;

-- Active CMS users for the alert picker (bypasses profiles SELECT RLS).
CREATE OR REPLACE FUNCTION public.list_enrolled_users_for_alerts()
RETURNS TABLE (
  id uuid,
  full_name text,
  nickname text,
  email text,
  role text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT p.id, p.full_name, p.nickname, p.email, p.role
  FROM public.profiles p
  WHERE COALESCE(p.is_active, true) = true
  ORDER BY p.created_at ASC NULLS LAST, p.full_name ASC NULLS LAST;
$$;

REVOKE ALL ON FUNCTION public.is_user_alert_recipient(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.owns_user_alert(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_enrolled_users_for_alerts() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_user_alert_recipient(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.owns_user_alert(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_enrolled_users_for_alerts() TO authenticated;

DROP POLICY IF EXISTS "user_alerts_select" ON public.user_alerts;
CREATE POLICY "user_alerts_select"
  ON public.user_alerts
  FOR SELECT
  TO authenticated
  USING (
    scope = 'all'
    OR created_by = auth.uid()
    OR public.is_user_alert_recipient(id)
  );

DROP POLICY IF EXISTS "user_alert_recipients_select" ON public.user_alert_recipients;
CREATE POLICY "user_alert_recipients_select"
  ON public.user_alert_recipients
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR public.owns_user_alert(alert_id));

DROP POLICY IF EXISTS "user_alert_recipients_insert" ON public.user_alert_recipients;
CREATE POLICY "user_alert_recipients_insert"
  ON public.user_alert_recipients
  FOR INSERT
  TO authenticated
  WITH CHECK (public.owns_user_alert(alert_id));

DROP POLICY IF EXISTS "user_alert_recipients_delete" ON public.user_alert_recipients;
CREATE POLICY "user_alert_recipients_delete"
  ON public.user_alert_recipients
  FOR DELETE
  TO authenticated
  USING (public.owns_user_alert(alert_id));

GRANT SELECT, INSERT, DELETE ON public.user_alert_recipients TO authenticated;
