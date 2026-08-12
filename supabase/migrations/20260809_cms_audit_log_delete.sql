-- Allow Super Admin / Admin to flush (delete) CMS audit log rows

drop policy if exists "cms_audit_log_delete" on public.cms_audit_log;
create policy "cms_audit_log_delete"
  on public.cms_audit_log
  for delete
  to authenticated
  using (
    public.is_super_admin()
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role = any (array['admin1'::text, 'admin'::text, 'super_admin'::text])
    )
  );

grant delete on public.cms_audit_log to authenticated;
