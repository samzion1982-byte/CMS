-- Login audit log table
CREATE TABLE IF NOT EXISTS login_logs (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  email        TEXT        NOT NULL,
  full_name    TEXT,
  user_role    TEXT,
  ip_address   TEXT,
  city         TEXT,
  region       TEXT,
  country      TEXT,
  user_agent   TEXT,
  login_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  logout_at    TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_login_logs_login_at  ON login_logs (login_at DESC);
CREATE INDEX IF NOT EXISTS idx_login_logs_user_id   ON login_logs (user_id);
CREATE INDEX IF NOT EXISTS idx_login_logs_email     ON login_logs (email);

ALTER TABLE login_logs ENABLE ROW LEVEL SECURITY;

-- Only admins can read logs
CREATE POLICY "admins_read_login_logs" ON login_logs
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id  = auth.uid()
        AND profiles.role IN ('super_admin', 'admin', 'admin1')
    )
  );
