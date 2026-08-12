-- ═══════════════════════════════════════════════════════════════
-- CMS Backup: Full Backup log + Snapshot (recycle bin)
-- ═══════════════════════════════════════════════════════════════

-- Snapshot / recycle bin — accidental delete restore
create table if not exists public.cms_recycle_bin (
  id                 uuid primary key default gen_random_uuid(),
  module             text not null,          -- events | assets | finance | members | ...
  table_name         text not null,          -- e.g. baptism_records, receipts
  record_id          text not null,
  record_label       text,
  payload            jsonb not null,         -- { row, related?: { table: [rows] } }
  deleted_by_email   text,
  deleted_by_name    text,
  deleted_by_role    text,
  deleted_at         timestamptz not null default now(),
  status             text not null default 'deleted'
                       check (status in ('deleted', 'restored', 'purged')),
  restored_at        timestamptz,
  restored_by_email  text,
  purged_at          timestamptz,
  notes              text
);

create index if not exists idx_cms_recycle_status
  on public.cms_recycle_bin (status, deleted_at desc);
create index if not exists idx_cms_recycle_module
  on public.cms_recycle_bin (module, status, deleted_at desc);
create index if not exists idx_cms_recycle_table
  on public.cms_recycle_bin (table_name, record_id);

alter table public.cms_recycle_bin enable row level security;

drop policy if exists "cms_recycle_bin_select" on public.cms_recycle_bin;
create policy "cms_recycle_bin_select"
  on public.cms_recycle_bin for select to authenticated
  using (
    public.is_super_admin()
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role = any (array['admin1'::text, 'admin'::text, 'super_admin'::text])
    )
  );

drop policy if exists "cms_recycle_bin_insert" on public.cms_recycle_bin;
create policy "cms_recycle_bin_insert"
  on public.cms_recycle_bin for insert to authenticated
  with check (auth.uid() is not null);

drop policy if exists "cms_recycle_bin_update" on public.cms_recycle_bin;
create policy "cms_recycle_bin_update"
  on public.cms_recycle_bin for update to authenticated
  using (
    public.is_super_admin()
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role = any (array['admin1'::text, 'admin'::text, 'super_admin'::text])
    )
  );

grant select, insert, update on public.cms_recycle_bin to authenticated;
grant all on public.cms_recycle_bin to service_role;

-- Full backup run history
create table if not exists public.cms_backup_log (
  id                 uuid primary key default gen_random_uuid(),
  backup_type        text not null default 'full'
                       check (backup_type in ('full', 'manual', 'scheduled')),
  trigger_mode       text not null default 'manual'
                       check (trigger_mode in ('manual', 'automatic')),
  status             text not null default 'pending'
                       check (status in ('pending', 'success', 'partial', 'failed')),
  tables_count       int,
  rows_count         int,
  file_size_bytes    bigint,
  storage_path       text,                 -- supabase storage path if uploaded
  drive_file_id      text,                 -- Google Drive file id if uploaded
  drive_web_link     text,
  download_filename  text,
  error_message      text,
  meta               jsonb,
  created_by_email   text,
  created_by_name    text,
  created_at         timestamptz not null default now()
);

create index if not exists idx_cms_backup_log_created
  on public.cms_backup_log (created_at desc);

alter table public.cms_backup_log enable row level security;

drop policy if exists "cms_backup_log_select" on public.cms_backup_log;
create policy "cms_backup_log_select"
  on public.cms_backup_log for select to authenticated
  using (
    public.is_super_admin()
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role = any (array['admin1'::text, 'admin'::text, 'super_admin'::text])
    )
  );

drop policy if exists "cms_backup_log_insert" on public.cms_backup_log;
create policy "cms_backup_log_insert"
  on public.cms_backup_log for insert to authenticated
  with check (auth.uid() is not null);

drop policy if exists "cms_backup_log_update" on public.cms_backup_log;
create policy "cms_backup_log_update"
  on public.cms_backup_log for update to authenticated
  using (public.is_super_admin());

grant select, insert on public.cms_backup_log to authenticated;
grant all on public.cms_backup_log to service_role;

-- Private storage bucket for full backups (fallback when Drive not configured)
insert into storage.buckets (id, name, public, file_size_limit)
values ('cms-backups', 'cms-backups', false, 104857600)
on conflict (id) do nothing;

drop policy if exists "cms_backups_select_admin" on storage.objects;
create policy "cms_backups_select_admin"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'cms-backups'
    and (
      public.is_super_admin()
      or exists (
        select 1 from public.profiles p
        where p.id = auth.uid()
          and p.role = any (array['admin1'::text, 'admin'::text, 'super_admin'::text])
      )
    )
  );

drop policy if exists "cms_backups_insert_admin" on storage.objects;
create policy "cms_backups_insert_admin"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'cms-backups'
    and (
      public.is_super_admin()
      or exists (
        select 1 from public.profiles p
        where p.id = auth.uid()
          and p.role = any (array['admin1'::text, 'admin'::text, 'super_admin'::text])
      )
    )
  );

-- Daily automatic full backup at 02:00 IST (= 20:30 UTC previous calendar day)
-- Calls Edge Function cms-full-backup. Safe to re-run; unschedules first.
do $$
begin
  begin
    perform cron.unschedule('cms-full-backup-daily');
  exception when others then null;
  end;

  perform cron.schedule(
    'cms-full-backup-daily',
    '30 20 * * *',
    $job$
      select net.http_post(
        url     := 'https://wjasjrthijpxlarreics.supabase.co/functions/v1/cms-full-backup',
        headers := jsonb_build_object(
          'Content-Type',  'application/json',
          'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndqYXNqcnRoaWpweGxhcnJlaWNzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjE4MDMwMCwiZXhwIjoyMDkxNzU2MzAwfQ.B8oBuQRGxdkhFnvSrbddtMQ1Abo9YNwexRy1nks3SnM'
        ),
        body    := jsonb_build_object('trigger_mode', 'automatic')
      );
    $job$
  );
exception when others then
  raise notice 'cms-full-backup cron not scheduled: %', SQLERRM;
end $$;
