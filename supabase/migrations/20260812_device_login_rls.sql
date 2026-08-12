-- Device registration + login log writes without a browser service-role key.
-- Authenticated users may manage devices and their own login_logs rows.

-- ── user_devices (may already exist remotely) ───────────────────────────────
CREATE TABLE IF NOT EXISTS user_devices (
  device_id      text PRIMARY KEY,
  user_id        uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  org_name       text,
  user_name      text,
  location       text,
  avatar_name    text,
  registered_at  timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_devices_user_id ON user_devices (user_id);

ALTER TABLE user_devices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_select_user_devices" ON user_devices;
DROP POLICY IF EXISTS "auth_insert_user_devices" ON user_devices;
DROP POLICY IF EXISTS "auth_update_user_devices" ON user_devices;
DROP POLICY IF EXISTS "auth_delete_user_devices" ON user_devices;

-- Single-tenant church project: any signed-in user can read/write device registry
CREATE POLICY "auth_select_user_devices" ON user_devices
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "auth_insert_user_devices" ON user_devices
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "auth_update_user_devices" ON user_devices
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "auth_delete_user_devices" ON user_devices
  FOR DELETE TO authenticated USING (true);

-- ── login_logs: allow users to write/update their own sessions ─────────────
DROP POLICY IF EXISTS "auth_insert_own_login_logs" ON login_logs;
DROP POLICY IF EXISTS "auth_update_own_login_logs" ON login_logs;

CREATE POLICY "auth_insert_own_login_logs" ON login_logs
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "auth_update_own_login_logs" ON login_logs
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
