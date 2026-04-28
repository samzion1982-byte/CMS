-- Fix RLS policies for deleted_members when JWT role claims are not available
-- Run this in Supabase SQL Editor to update the existing policy behavior.

ALTER POLICY "deleted_members_select_admin" ON deleted_members
  USING (
    auth.uid() IN (
      SELECT id FROM profiles WHERE role IN ('super_admin', 'admin', 'admin1')
    )
  );

ALTER POLICY "deleted_members_update_admin" ON deleted_members
  USING (
    auth.uid() IN (
      SELECT id FROM profiles WHERE role IN ('super_admin', 'admin', 'admin1')
    )
  );

ALTER POLICY "deleted_members_insert_admin" ON deleted_members
  WITH CHECK (
    auth.uid() IN (
      SELECT id FROM profiles WHERE role IN ('super_admin', 'admin', 'admin1')
    )
  );
