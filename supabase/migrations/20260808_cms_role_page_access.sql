-- CMS role → page access (configured by Super Admin)
create table if not exists public.cms_role_page_access (
  role text not null
    check (role in ('admin1', 'admin', 'user', 'demo')),
  page_key text not null,
  allowed boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (role, page_key)
);

create index if not exists cms_role_page_access_role_idx
  on public.cms_role_page_access (role);

alter table public.cms_role_page_access enable row level security;

-- Authenticated users can read grants (needed for sidebar / route checks)
drop policy if exists cms_role_page_access_select on public.cms_role_page_access;
create policy cms_role_page_access_select
  on public.cms_role_page_access
  for select
  to authenticated
  using (true);

-- Only Super Admin can insert / update / delete
drop policy if exists cms_role_page_access_write on public.cms_role_page_access;
create policy cms_role_page_access_write
  on public.cms_role_page_access
  for all
  to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

comment on table public.cms_role_page_access is
  'Per-role CMS page access. Managed by Super Admin on /cms-permissions.';
