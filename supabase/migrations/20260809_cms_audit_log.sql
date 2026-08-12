-- CMS-wide audit trail (who changed what, when)
-- Readable by Super Admin and roles granted Audit Trail via CMS Permissions.

create table if not exists public.cms_audit_log (
  id              uuid primary key default gen_random_uuid(),
  action          text not null,          -- created | updated | deleted | deactivated | activated | reset_password | saved
  module          text not null,          -- users | church_setup | cms_permissions | members | ...
  entity_type     text not null,          -- user | church | role_grants | member
  entity_id       text,                   -- uuid or business id as text
  entity_label    text,                   -- human label e.g. member name / email
  summary         text not null default '',
  changes         jsonb,                  -- [{ field, from, to }] or null
  actor_id        uuid,
  actor_email     text,
  actor_name      text,
  actor_role      text,
  created_at      timestamptz not null default now()
);

create index if not exists idx_cms_audit_created on public.cms_audit_log (created_at desc);
create index if not exists idx_cms_audit_module  on public.cms_audit_log (module, created_at desc);
create index if not exists idx_cms_audit_actor   on public.cms_audit_log (actor_email, created_at desc);

alter table public.cms_audit_log enable row level security;

drop policy if exists "cms_audit_log_select" on public.cms_audit_log;
create policy "cms_audit_log_select"
  on public.cms_audit_log
  for select
  to authenticated
  using (
    public.is_super_admin()
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role = any (array['admin1'::text, 'admin'::text, 'super_admin'::text])
    )
  );

drop policy if exists "cms_audit_log_insert" on public.cms_audit_log;
create policy "cms_audit_log_insert"
  on public.cms_audit_log
  for insert
  to authenticated
  with check (auth.uid() is not null);

grant select, insert on public.cms_audit_log to authenticated;
grant all on public.cms_audit_log to service_role;
