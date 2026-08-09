-- Plaintext login passwords for Super Admin visibility in User Management.
-- Auth hashes cannot be read back; this vault is updated on create / reset.

create table if not exists public.cms_user_passwords (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  password text not null,
  updated_at timestamptz not null default now()
);

alter table public.cms_user_passwords enable row level security;

drop policy if exists "cms_user_passwords_super_admin" on public.cms_user_passwords;
create policy "cms_user_passwords_super_admin"
  on public.cms_user_passwords
  for all
  to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

grant select, insert, update, delete on public.cms_user_passwords to authenticated;
grant all on public.cms_user_passwords to service_role;
