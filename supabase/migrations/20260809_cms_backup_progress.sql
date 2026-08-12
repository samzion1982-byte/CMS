-- Backup progress: running status + percent/message for live UI polling

alter table public.cms_backup_log
  drop constraint if exists cms_backup_log_status_check;

alter table public.cms_backup_log
  add constraint cms_backup_log_status_check
  check (status in ('pending', 'running', 'success', 'partial', 'failed'));

alter table public.cms_backup_log
  add column if not exists progress_pct int,
  add column if not exists progress_message text;

comment on column public.cms_backup_log.progress_pct is
  '0-100 live progress while status=running; finalized on success/partial/failed';
comment on column public.cms_backup_log.progress_message is
  'Human-readable phase for Backup page progress UI';

-- Super Admin may update progress rows they created (optional; Edge uses service_role)
drop policy if exists "cms_backup_log_update_running" on public.cms_backup_log;
create policy "cms_backup_log_update_running"
  on public.cms_backup_log for update to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

grant update on public.cms_backup_log to authenticated;
