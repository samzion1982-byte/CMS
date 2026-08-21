-- Close Supabase Security Advisor CRITICAL findings:
--   rls_disabled_in_public      — public tables with RLS off
--   sensitive_columns_exposed   — password / account_number / token columns on those tables
--
-- auth_tracker stores plaintext passwords and was granted to anon with no RLS.
-- bank_accounts has account_number / swift_code and was created without RLS.
-- Other module tables (accounting, simple accounts, announcements, staging) also lacked RLS.

-- ── 1. Credential table: lock down, then Super Admin only ──────────────────
ALTER TABLE IF EXISTS public.auth_tracker ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.auth_tracker FROM anon;
REVOKE ALL ON TABLE public.auth_tracker FROM PUBLIC;

DROP POLICY IF EXISTS "auth_tracker_super_admin" ON public.auth_tracker;
CREATE POLICY "auth_tracker_super_admin"
  ON public.auth_tracker
  FOR ALL
  TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

-- ── 2. Enable RLS on every remaining public base table ─────────────────────
DO $$
DECLARE
  r record;
  pol_count int;
  pol_name text;
  skip_open_policy text[] := ARRAY[
    'auth_tracker',
    'cms_user_passwords',
    'cms_backup_settings'
  ];
BEGIN
  FOR r IN
    SELECT c.relname AS tbl
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND NOT c.relrowsecurity
    ORDER BY 1
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', r.tbl);

    IF r.tbl = ANY (skip_open_policy) THEN
      CONTINUE;
    END IF;

    SELECT count(*) INTO pol_count
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = r.tbl;

    IF pol_count = 0 THEN
      pol_name := left(r.tbl, 40) || '_authenticated_all';
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (true) WITH CHECK (true)',
        pol_name,
        r.tbl
      );
    END IF;
  END LOOP;
END $$;

-- ── 3. Public payment page (anon) — keep working after RLS ─────────────────
DO $$
BEGIN
  IF to_regclass('public.payment_requests') IS NOT NULL THEN
    ALTER TABLE public.payment_requests ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "pr_auth_all" ON public.payment_requests;
    DROP POLICY IF EXISTS "pr_anon_select" ON public.payment_requests;
    DROP POLICY IF EXISTS "pr_anon_mark_paid" ON public.payment_requests;
    CREATE POLICY "pr_auth_all" ON public.payment_requests
      FOR ALL TO authenticated USING (true) WITH CHECK (true);
    CREATE POLICY "pr_anon_select" ON public.payment_requests
      FOR SELECT TO anon USING (status <> 'cancelled');
    CREATE POLICY "pr_anon_mark_paid" ON public.payment_requests
      FOR UPDATE TO anon
      USING (status = 'pending')
      WITH CHECK (status = 'paid_by_member');
  END IF;

  IF to_regclass('public.member_payment_schedules') IS NOT NULL THEN
    ALTER TABLE public.member_payment_schedules ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "mps_auth_all" ON public.member_payment_schedules;
    CREATE POLICY "mps_auth_all" ON public.member_payment_schedules
      FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;

  IF to_regclass('public.payment_request_logs') IS NOT NULL THEN
    ALTER TABLE public.payment_request_logs ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "prl_auth_all" ON public.payment_request_logs;
    CREATE POLICY "prl_auth_all" ON public.payment_request_logs
      FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;

  IF to_regclass('public.payment_categories') IS NOT NULL THEN
    ALTER TABLE public.payment_categories ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "pc_anon_select" ON public.payment_categories;
    CREATE POLICY "pc_anon_select" ON public.payment_categories
      FOR SELECT TO anon USING (true);
  END IF;

  IF to_regclass('public.churches') IS NOT NULL THEN
    DROP POLICY IF EXISTS "ch_anon_select" ON public.churches;
    CREATE POLICY "ch_anon_select" ON public.churches
      FOR SELECT TO anon USING (true);
  END IF;
END $$;

-- ── 4. Staging import table (aadhaar / PII) ────────────────────────────────
DO $$
BEGIN
  IF to_regclass('public.members_staging') IS NOT NULL THEN
    ALTER TABLE public.members_staging ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "members_staging_authenticated_all" ON public.members_staging;
    CREATE POLICY "members_staging_authenticated_all"
      ON public.members_staging
      FOR ALL TO authenticated
      USING (true)
      WITH CHECK (true);
    REVOKE ALL ON TABLE public.members_staging FROM anon;
  END IF;
END $$;
