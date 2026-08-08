-- User Management role labels (UI):
--   admin1 → Admin
--   admin  → User1
--   user   → User2
--   demo   → User3
--   user4  → User4  (new slot)
--
-- DB role keys are unchanged except adding user4.

-- profiles.role — allow user4
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles
  add constraint profiles_role_check
  check (role = any (array[
    'super_admin'::text,
    'admin1'::text,
    'admin'::text,
    'user'::text,
    'demo'::text,
    'user4'::text
  ]));

-- cms_role_page_access.role — allow user4
do $$
declare
  cname text;
begin
  select con.conname into cname
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  join pg_namespace nsp on nsp.oid = rel.relnamespace
  where nsp.nspname = 'public'
    and rel.relname = 'cms_role_page_access'
    and con.contype = 'c'
    and pg_get_constraintdef(con.oid) ilike '%role%';
  if cname is not null then
    execute format('alter table public.cms_role_page_access drop constraint %I', cname);
  end if;
end $$;

alter table public.cms_role_page_access
  add constraint cms_role_page_access_role_check
  check (role = any (array[
    'admin1'::text,
    'admin'::text,
    'user'::text,
    'demo'::text,
    'user4'::text
  ]));
