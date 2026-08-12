-- ═══════════════════════════════════════════════════════════════
-- Payment Request System — Database Schema
-- Run in Supabase SQL Editor (Dashboard → SQL Editor → New query)
-- ═══════════════════════════════════════════════════════════════

-- 1. Add UPI ID to churches
ALTER TABLE public.churches
  ADD COLUMN IF NOT EXISTS upi_id text;

-- ─────────────────────────────────────────────────────────────
-- 2. Member payment schedules
--    Stores each member's payment frequency (slot) and default
--    monthly amounts per category, detected from FY receipt history.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.member_payment_schedules (
  id                   uuid        DEFAULT gen_random_uuid() NOT NULL,
  member_id            text        NOT NULL,
  member_name          text,
  whatsapp             text,
  slot                 integer     NOT NULL DEFAULT 1,
  amounts              jsonb       DEFAULT '{}'::jsonb,
  excluded_from_online boolean     DEFAULT false,
  detected_from_fy     text,
  created_at           timestamptz DEFAULT now(),
  updated_at           timestamptz DEFAULT now(),
  created_by           text,
  last_modified_by     text,
  CONSTRAINT member_payment_schedules_pkey       PRIMARY KEY (id),
  CONSTRAINT member_payment_schedules_member_key UNIQUE (member_id),
  CONSTRAINT valid_slot CHECK (slot IN (1, 2, 3, 4, 6, 12))
);

-- ─────────────────────────────────────────────────────────────
-- 3. Payment requests
--    One row per payment request sent to a member.
--    status: pending → paid_by_member → confirmed | cancelled
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.payment_requests (
  id                    uuid           DEFAULT gen_random_uuid() NOT NULL,
  member_id             text           NOT NULL,
  member_name           text,
  whatsapp              text,
  fy                    text           NOT NULL,
  months                text           NOT NULL,
  slot                  integer        NOT NULL DEFAULT 1,
  amounts               jsonb          DEFAULT '{}'::jsonb,
  grand_total           numeric(12, 2),
  status                text           DEFAULT 'pending',
  member_edited_amounts jsonb,
  paid_at               timestamptz,
  upi_ref               text,
  confirmed_by          text,
  confirmed_at          timestamptz,
  receipt_id            uuid,
  push_batch_id         text,
  created_by            text,
  created_at            timestamptz    DEFAULT now(),
  updated_at            timestamptz    DEFAULT now(),
  CONSTRAINT payment_requests_pkey        PRIMARY KEY (id),
  CONSTRAINT payment_requests_status_chk CHECK (
    status IN ('pending', 'paid_by_member', 'confirmed', 'cancelled')
  )
);

-- ─────────────────────────────────────────────────────────────
-- 4. Payment request WhatsApp send log
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.payment_request_logs (
  id                   uuid        DEFAULT gen_random_uuid() NOT NULL,
  payment_request_id   uuid        REFERENCES public.payment_requests(id) ON DELETE SET NULL,
  member_id            text,
  member_name          text,
  whatsapp_number      text,
  message              text,
  status               text,
  error_text           text,
  api_type             text,
  sent_at              timestamptz DEFAULT now(),
  sent_by              text,
  CONSTRAINT payment_request_logs_pkey PRIMARY KEY (id)
);

-- ─────────────────────────────────────────────────────────────
-- 5. Row Level Security
-- ─────────────────────────────────────────────────────────────

ALTER TABLE public.member_payment_schedules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "mps_auth_all" ON public.member_payment_schedules;
CREATE POLICY "mps_auth_all" ON public.member_payment_schedules
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE public.payment_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pr_auth_all"         ON public.payment_requests;
DROP POLICY IF EXISTS "pr_anon_select"      ON public.payment_requests;
DROP POLICY IF EXISTS "pr_anon_mark_paid"   ON public.payment_requests;
CREATE POLICY "pr_auth_all"        ON public.payment_requests
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "pr_anon_select"     ON public.payment_requests
  FOR SELECT TO anon USING (status != 'cancelled');
CREATE POLICY "pr_anon_mark_paid"  ON public.payment_requests
  FOR UPDATE TO anon
  USING (status = 'pending')
  WITH CHECK (status = 'paid_by_member');

ALTER TABLE public.payment_request_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "prl_auth_all" ON public.payment_request_logs;
CREATE POLICY "prl_auth_all" ON public.payment_request_logs
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Allow public (anon) to read church config for the payment page
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'churches' AND policyname = 'ch_anon_select'
  ) THEN
    CREATE POLICY "ch_anon_select" ON public.churches
      FOR SELECT TO anon USING (true);
  END IF;
END $$;

-- Allow public (anon) to read active payment categories for the payment page
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'payment_categories' AND policyname = 'pc_anon_select'
  ) THEN
    CREATE POLICY "pc_anon_select" ON public.payment_categories
      FOR SELECT TO anon USING (true);
  END IF;
END $$;
