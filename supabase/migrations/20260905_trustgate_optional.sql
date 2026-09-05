-- Optional TrustGate device gate for Church CMS.
-- Default OFF: churches.trustgate_enabled = false (no companion required).

-- ── Church toggle ───────────────────────────────────────────────────────────
ALTER TABLE public.churches
  ADD COLUMN IF NOT EXISTS trustgate_enabled boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.churches.trustgate_enabled IS
  'When true, login requires TrustGate TM Companion + approved device.';

-- ── user_devices approval columns ───────────────────────────────────────────
ALTER TABLE public.user_devices
  ADD COLUMN IF NOT EXISTS approved boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS approved_by uuid NULL,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS requested_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS valid_upto timestamptz NULL,
  ADD COLUMN IF NOT EXISTS device_name text NULL,
  ADD COLUMN IF NOT EXISTS designation text NULL;

UPDATE public.user_devices
SET status = CASE
  WHEN approved = true THEN 'approved'
  WHEN approved_by IS NOT NULL AND approved_at IS NOT NULL THEN 'rejected'
  ELSE 'pending'
END
WHERE status IS NULL OR status = '';

CREATE INDEX IF NOT EXISTS idx_user_devices_approved ON public.user_devices USING btree (approved);
CREATE INDEX IF NOT EXISTS idx_user_devices_status ON public.user_devices USING btree (status);

-- Pre-login gate: anon must read device status + insert approval requests
DROP POLICY IF EXISTS "auth_select_user_devices" ON public.user_devices;
DROP POLICY IF EXISTS "auth_insert_user_devices" ON public.user_devices;
DROP POLICY IF EXISTS "auth_update_user_devices" ON public.user_devices;
DROP POLICY IF EXISTS "auth_delete_user_devices" ON public.user_devices;
DROP POLICY IF EXISTS "anyone_insert_user_devices" ON public.user_devices;
DROP POLICY IF EXISTS "anon_select_user_devices" ON public.user_devices;
DROP POLICY IF EXISTS "authenticated_select_user_devices" ON public.user_devices;
DROP POLICY IF EXISTS "authenticated_update_user_devices" ON public.user_devices;
DROP POLICY IF EXISTS "authenticated_delete_user_devices" ON public.user_devices;

CREATE POLICY "anyone_select_user_devices" ON public.user_devices
  FOR SELECT
  USING (true);

CREATE POLICY "anyone_insert_user_devices" ON public.user_devices
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY "authenticated_update_user_devices" ON public.user_devices
  FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "authenticated_delete_user_devices" ON public.user_devices
  FOR DELETE TO authenticated
  USING (true);

-- ── login_logs: TrustGate vs emergency vs standard ──────────────────────────
ALTER TABLE public.login_logs
  ADD COLUMN IF NOT EXISTS login_type text NULL;

COMMENT ON COLUMN public.login_logs.login_type IS
  'trustgate | emergency | standard (or null for legacy rows)';
