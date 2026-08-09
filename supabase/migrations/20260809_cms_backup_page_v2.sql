-- ═══════════════════════════════════════════════════════════════
-- Backup page v2: Drive settings, Full Backup + Snapshot logs
-- Super Admin only. Drive is the sole backup destination.
-- ═══════════════════════════════════════════════════════════════

create table if not exists public.cms_backup_settings (
  id                      int primary key default 1 check (id = 1),
  drive_folder_id         text,
  drive_enabled           boolean not null default false,
  full_auto_enabled       boolean not null default true,
  full_auto_hour_ist      int not null default 2 check (full_auto_hour_ist >= 0 and full_auto_hour_ist <= 23),
  snapshot_auto_enabled   boolean not null default true,
  snapshot_auto_hour_ist  int not null default 1 check (snapshot_auto_hour_ist >= 0 and snapshot_auto_hour_ist <= 23),
  snapshot_retain_days    int not null default 14,
  updated_at              timestamptz not null default now(),
  updated_by_email        text
);

insert into public.cms_backup_settings (id)
values (1)
on conflict (id) do nothing;

alter table public.cms_backup_settings enable row level security;

drop policy if exists "cms_backup_settings_select" on public.cms_backup_settings;
create policy "cms_backup_settings_select"
  on public.cms_backup_settings for select to authenticated
  using (public.is_super_admin());

drop policy if exists "cms_backup_settings_update" on public.cms_backup_settings;
create policy "cms_backup_settings_update"
  on public.cms_backup_settings for update to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

drop policy if exists "cms_backup_settings_insert" on public.cms_backup_settings;
create policy "cms_backup_settings_insert"
  on public.cms_backup_settings for insert to authenticated
  with check (public.is_super_admin());

grant select, insert, update on public.cms_backup_settings to authenticated;
grant all on public.cms_backup_settings to service_role;

-- Widen backup_log types for snapshot + kind clarity
alter table public.cms_backup_log drop constraint if exists cms_backup_log_backup_type_check;
alter table public.cms_backup_log
  add constraint cms_backup_log_backup_type_check
  check (backup_type in ('full', 'snapshot', 'manual', 'scheduled'));

alter table public.cms_backup_log
  add column if not exists kind text;

update public.cms_backup_log
set kind = case
  when backup_type = 'snapshot' then 'snapshot'
  else 'full'
end
where kind is null;

-- Tighten backup log access to Super Admin only
drop policy if exists "cms_backup_log_select" on public.cms_backup_log;
create policy "cms_backup_log_select"
  on public.cms_backup_log for select to authenticated
  using (public.is_super_admin());

drop policy if exists "cms_backup_log_insert" on public.cms_backup_log;
create policy "cms_backup_log_insert"
  on public.cms_backup_log for insert to authenticated
  with check (public.is_super_admin() or auth.uid() is not null);

drop policy if exists "cms_backup_log_update" on public.cms_backup_log;
create policy "cms_backup_log_update"
  on public.cms_backup_log for update to authenticated
  using (public.is_super_admin());

-- Daily Full Backup 02:00 IST = 20:30 UTC
-- Daily Snapshot 01:00 IST = 19:30 UTC
do $$
begin
  begin perform cron.unschedule('cms-full-backup-daily'); exception when others then null; end;
  begin perform cron.unschedule('cms-snapshot-daily'); exception when others then null; end;

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
        body    := jsonb_build_object('trigger_mode', 'automatic', 'kind', 'full')
      );
    $job$
  );

  perform cron.schedule(
    'cms-snapshot-daily',
    '30 19 * * *',
    $job$
      select net.http_post(
        url     := 'https://wjasjrthijpxlarreics.supabase.co/functions/v1/cms-full-backup',
        headers := jsonb_build_object(
          'Content-Type',  'application/json',
          'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndqYXNqcnRoaWpweGxhcnJlaWNzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjE4MDMwMCwiZXhwIjoyMDkxNzU2MzAwfQ.B8oBuQRGxdkhFnvSrbddtMQ1Abo9YNwexRy1nks3SnM'
        ),
        body    := jsonb_build_object('trigger_mode', 'automatic', 'kind', 'snapshot')
      );
    $job$
  );
exception when others then
  raise notice 'backup crons not scheduled: %', SQLERRM;
end $$;
