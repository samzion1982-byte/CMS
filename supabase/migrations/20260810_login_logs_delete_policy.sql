-- Allow admins to delete login_logs (Auto Flush / Run Now via user client).
-- Service role already bypasses RLS; this covers authenticated admin sessions.
DO $$ BEGIN
  CREATE POLICY "admins_delete_login_logs" ON login_logs
    FOR DELETE TO authenticated
    USING (
      EXISTS (
        SELECT 1 FROM profiles
        WHERE profiles.id = auth.uid()
          AND profiles.role IN ('super_admin', 'admin', 'admin1')
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
