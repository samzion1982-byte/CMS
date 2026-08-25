// @ts-nocheck — Deno
/* ═══════════════════════════════════════════════════════════════
   cms-provision — New Setup / Upgrade for a target Supabase project
   Inputs: supabase_url, anon_key, service_role_key, db_password,
           super_admin_email/password (initialize), mode
   ═══════════════════════════════════════════════════════════════ */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import postgres from 'https://deno.land/x/postgresjs@v3.4.4/mod.js'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const BUCKETS = [
  { id: 'member-photos', public: false },
  { id: 'member-reports', public: false },
  { id: 'church-logos', public: true },
  { id: 'event-media', public: false },
  { id: 'asset-photos', public: false },
  { id: 'announcement-cards', public: false },
  { id: 'announcement-reports', public: false },
  { id: 'payment-pages', public: true },
  { id: 'receipt-pdfs', public: false },
  { id: 'print-corner', public: false },
]

/** Minimal bootstrap so a blank project can accept the app; full migrations applied when SQL is provided. */
const BOOTSTRAP_SQL = `
create extension if not exists "pgcrypto";

create table if not exists public.cms_schema_migrations (
  id text primary key,
  applied_at timestamptz not null default now()
);

-- Tables first (is_super_admin references profiles)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  role text default 'user',
  created_at timestamptz default now()
);

alter table public.profiles enable row level security;
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles for select to authenticated using (true);
drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles for update to authenticated using (auth.uid() = id);

create table if not exists public.churches (
  id uuid primary key default gen_random_uuid(),
  name text,
  created_at timestamptz default now()
);

create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'super_admin'
  );
$$;

create table if not exists public.cms_backup_settings (
  id int primary key default 1 check (id = 1),
  drive_folder_id text,
  drive_enabled boolean not null default false,
  full_auto_enabled boolean not null default true,
  full_auto_hour_ist int not null default 2,
  snapshot_auto_enabled boolean not null default true,
  snapshot_auto_hour_ist int not null default 1,
  snapshot_retain_days int not null default 14,
  updated_at timestamptz not null default now(),
  updated_by_email text
);
insert into public.cms_backup_settings (id) values (1) on conflict (id) do nothing;

create table if not exists public.cms_backup_log (
  id uuid primary key default gen_random_uuid(),
  backup_type text not null default 'full',
  kind text,
  trigger_mode text not null default 'manual',
  status text not null default 'pending',
  tables_count int,
  rows_count int,
  file_size_bytes bigint,
  storage_path text,
  drive_file_id text,
  drive_web_link text,
  download_filename text,
  error_message text,
  meta jsonb,
  created_by_email text,
  created_by_name text,
  created_at timestamptz not null default now()
);
`

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

function projectRefFromUrl(url: string) {
  try {
    const host = new URL(url).hostname
    return host.split('.')[0]
  } catch {
    return null
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const body = await req.json()
    const mode = body.mode === 'upgrade' ? 'upgrade' : 'initialize'
    const supabaseUrl = String(body.supabase_url || '').trim().replace(/\/$/, '')
    const serviceRole = String(body.service_role_key || '').trim()
    const dbPassword = String(body.db_password || '').trim()
    const anonKey = String(body.anon_key || '').trim()
    const saEmail = String(body.super_admin_email || '').trim()
    const saPassword = String(body.super_admin_password || '').trim()
    const driveFolderId = body.drive_folder_id ? String(body.drive_folder_id).trim() : null

    if (!supabaseUrl || !serviceRole || !dbPassword) {
      return json({ error: 'supabase_url, service_role_key, and db_password are required' }, 400)
    }
    if (mode === 'initialize' && (!saEmail || !saPassword)) {
      return json({ error: 'super_admin_email and super_admin_password are required for Initialize' }, 400)
    }
    if (saPassword && saPassword.length < 8) {
      return json({ error: 'Super Admin password must be at least 8 characters' }, 400)
    }

    const ref = projectRefFromUrl(supabaseUrl)
    if (!ref) return json({ error: 'Invalid Supabase URL' }, 400)

    const steps: string[] = []
    const target = createClient(supabaseUrl, serviceRole, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    // 1) Schema bootstrap via Postgres (prefer pooler — Edge often cannot reach db.* IPv6 direct)
    const pw = encodeURIComponent(dbPassword)
    const connCandidates = [
      `postgresql://postgres.${ref}:${pw}@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres`,
      `postgresql://postgres.${ref}:${pw}@aws-1-ap-northeast-1.pooler.supabase.com:5432/postgres`,
      `postgresql://postgres.${ref}:${pw}@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres`,
      `postgresql://postgres:${pw}@db.${ref}.supabase.co:5432/postgres`,
    ]
    let sql: ReturnType<typeof postgres> | null = null
    let connStr = ''
    let lastPgErr: Error | null = null
    for (const candidate of connCandidates) {
      const client = postgres(candidate, { ssl: 'require', max: 1, connect_timeout: 8 })
      try {
        await client`select 1`
        sql = client
        connStr = candidate
        break
      } catch (e) {
        lastPgErr = e instanceof Error ? e : new Error(String(e))
        try { await client.end({ timeout: 1 }) } catch { /* ignore */ }
      }
    }
    if (sql) {
      steps.push(`Postgres connected (${connStr.includes('pooler') ? 'pooler' : 'direct'})`)
      try {
        await sql.unsafe(BOOTSTRAP_SQL)
        steps.push('Bootstrap schema applied (profiles, churches, backup tables, is_super_admin)')
        if (body.extra_sql && typeof body.extra_sql === 'string' && body.extra_sql.trim()) {
          await sql.unsafe(body.extra_sql)
          steps.push('Extra migration SQL applied')
        }
      } finally {
        await sql.end({ timeout: 5 })
      }
    } else {
      // Bootstrap may already have been applied in SQL Editor — continue if profiles exists
      const { error: probeErr } = await target.from('profiles').select('id').limit(1)
      if (probeErr && /does not exist|Could not find the table/i.test(probeErr.message || '')) {
        throw new Error(
          `Postgres connection failed and profiles table is missing. Last error: ${lastPgErr?.message || 'unknown'}. ` +
            'Run the bootstrap SQL in the target project SQL Editor first, then retry Initialize.',
        )
      }
      steps.push(
        `Skipped live Postgres bootstrap (connection failed: ${lastPgErr?.message || 'unknown'}). Continuing with buckets + Super Admin.`,
      )
    }

    // 2) Storage buckets
    for (const b of BUCKETS) {
      const { data: existing } = await target.storage.getBucket(b.id)
      if (!existing) {
        const { error } = await target.storage.createBucket(b.id, { public: b.public })
        if (error && !/already exists/i.test(error.message || '')) {
          steps.push(`Bucket ${b.id}: ${error.message}`)
        } else {
          steps.push(`Bucket ${b.id} ready`)
        }
      } else {
        steps.push(`Bucket ${b.id} exists`)
      }
    }

    // 3) Super Admin (initialize, or ensure on upgrade if provided)
    let superAdminId: string | null = null
    if (saEmail && saPassword) {
      const { data: listed } = await target.auth.admin.listUsers({ perPage: 1000 })
      const existing = listed?.users?.find((u) => u.email?.toLowerCase() === saEmail.toLowerCase())
      if (existing) {
        superAdminId = existing.id
        await target.auth.admin.updateUserById(existing.id, { password: saPassword, email_confirm: true })
        steps.push(`Super Admin auth updated: ${saEmail}`)
      } else {
        const { data: created, error: createErr } = await target.auth.admin.createUser({
          email: saEmail,
          password: saPassword,
          email_confirm: true,
          user_metadata: { full_name: 'Super Admin' },
        })
        if (createErr) throw new Error(`Create Super Admin failed: ${createErr.message}`)
        superAdminId = created.user.id
        steps.push(`Super Admin auth created: ${saEmail}`)
      }
      if (superAdminId) {
        const { error: profErr } = await target.from('profiles').upsert({
          id: superAdminId,
          email: saEmail,
          full_name: 'Super Admin',
          role: 'super_admin',
        }, { onConflict: 'id' })
        if (profErr) steps.push(`Profile upsert warning: ${profErr.message}`)
        else steps.push('Super Admin profile ready')
      }
    }

    // 4) Drive folder on backup settings
    if (driveFolderId) {
      const { error } = await target.from('cms_backup_settings').upsert({
        id: 1,
        drive_folder_id: driveFolderId,
        drive_enabled: true,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'id' })
      if (error) steps.push(`Drive settings warning: ${error.message}`)
      else steps.push('Drive folder ID saved on target project')
    }

    // Mark migration bootstrap
    if (connStr) {
      try {
        const sql2 = postgres(connStr, { ssl: 'require', max: 1 })
        try {
          await sql2.unsafe(
            `insert into public.cms_schema_migrations (id) values ('bootstrap-v1') on conflict (id) do nothing`,
          )
        } finally {
          await sql2.end({ timeout: 5 })
        }
      } catch (_) { /* ignore */ }
    }

    return json({
      ok: true,
      mode,
      project_ref: ref,
      steps,
      next: [
        'Point the church website env to this SUPABASE_URL + ANON_KEY',
        'Run remaining schema migrations from supabase/migrations on this project (SQL editor or Upgrade with extra_sql) until fully aligned',
        'Login with the Super Admin email/password you entered',
        'Complete Church Setup',
      ],
      anon_key_received: !!anonKey,
    })
  } catch (e) {
    console.error('cms-provision error', e)
    return json({ error: e.message || String(e) }, 500)
  }
})
