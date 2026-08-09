-- Allow Super Admin to clear backup history
grant delete on public.cms_backup_log to authenticated;

drop policy if exists "cms_backup_log_delete" on public.cms_backup_log;
create policy "cms_backup_log_delete"
  on public.cms_backup_log for delete to authenticated
  using (public.is_super_admin());
