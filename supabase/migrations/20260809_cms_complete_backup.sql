-- Complete backup helpers: list all public tables for full dump/restore

create or replace function public.cms_list_public_tables()
returns table(table_name text)
language sql
stable
security definer
set search_path = public
as $$
  select c.relname::text
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind = 'r'
    and c.relname not like 'pg_%'
  order by 1;
$$;

revoke all on function public.cms_list_public_tables() from public;
grant execute on function public.cms_list_public_tables() to service_role;
grant execute on function public.cms_list_public_tables() to authenticated;

-- Truncate helper for restore (service role only from Edge Function)
create or replace function public.cms_truncate_tables(p_tables text[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  t text;
  allowed boolean;
begin
  -- Edge Functions use service_role
  if auth.role() is distinct from 'service_role' then
    -- Allow super_admin interactive sessions if helper exists
    begin
      execute 'select public.is_super_admin()' into allowed;
    exception when undefined_function then
      allowed := false;
    end;
    if not coalesce(allowed, false) then
      raise exception 'not allowed';
    end if;
  end if;

  foreach t in array p_tables loop
    if t !~ '^[a-z0-9_]+$' then
      raise exception 'invalid table %', t;
    end if;
    if t in ('schema_migrations') then
      continue;
    end if;
    execute format('truncate table public.%I restart identity cascade', t);
  end loop;
end;
$$;

revoke all on function public.cms_truncate_tables(text[]) from public;
grant execute on function public.cms_truncate_tables(text[]) to service_role;

comment on function public.cms_list_public_tables() is
  'Lists all public.schema base tables for complete CMS backup dumps.';
comment on function public.cms_truncate_tables(text[]) is
  'Service-role truncate helper used by cms-full-backup restore.';
