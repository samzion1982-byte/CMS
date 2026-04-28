-- ============================================================
-- CHURCH CMS — FULL FLUSH + RECREATE
-- Run this in Supabase SQL Editor (Dashboard → SQL Editor)
-- Project: wjasjrthijpxlarreics
--
-- Safe to run on a BRAND NEW project — all DROPs are wrapped
-- in exception handlers so missing tables never cause errors.
-- ============================================================


-- ── STEP 1: SAFE DROP EVERYTHING ─────────────────────────────
-- Wrapped in DO block so errors on non-existent objects are
-- silently ignored (safe for both fresh and corrupted DBs)

DO $$
BEGIN

  -- Triggers (fail silently if table doesn't exist)
  BEGIN drop trigger if exists on_auth_user_created on auth.users; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN drop trigger if exists members_modified_at  on members;    EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN drop trigger if exists profiles_updated_at  on profiles;   EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN drop trigger if exists churches_updated_at  on churches;   EXCEPTION WHEN OTHERS THEN NULL; END;

  -- Functions
  BEGIN drop function if exists handle_new_user()    cascade; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN drop function if exists get_my_role()        cascade; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN drop function if exists update_modified_at() cascade; EXCEPTION WHEN OTHERS THEN NULL; END;

  -- Storage policies
  BEGIN drop policy if exists "photos_select" on storage.objects; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN drop policy if exists "photos_insert" on storage.objects; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN drop policy if exists "photos_update" on storage.objects; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN drop policy if exists "photos_delete" on storage.objects; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN drop policy if exists "logos_select"  on storage.objects; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN drop policy if exists "logos_insert"  on storage.objects; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN drop policy if exists "logos_update"  on storage.objects; EXCEPTION WHEN OTHERS THEN NULL; END;

  -- Table policies
  BEGIN drop policy if exists "profiles_select_own"       on profiles; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN drop policy if exists "profiles_select_all_admin" on profiles; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN drop policy if exists "profiles_update_own"       on profiles; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN drop policy if exists "profiles_insert_own"       on profiles; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN drop policy if exists "members_select"            on members;  EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN drop policy if exists "members_insert"            on members;  EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN drop policy if exists "members_update"            on members;  EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN drop policy if exists "members_delete"            on members;  EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN drop policy if exists "churches_select"           on churches; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN drop policy if exists "churches_insert"           on churches; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN drop policy if exists "churches_update"           on churches; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN drop policy if exists "lookups_select"            on lookups;  EXCEPTION WHEN OTHERS THEN NULL; END;

  -- Tables
  BEGIN drop table if exists members  cascade; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN drop table if exists lookups  cascade; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN drop table if exists churches cascade; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN drop table if exists profiles cascade; EXCEPTION WHEN OTHERS THEN NULL; END;

  -- Storage buckets
  BEGIN delete from storage.objects where bucket_id = 'member-photos'; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN delete from storage.objects where bucket_id = 'church-logos';  EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN delete from storage.buckets  where id = 'member-photos';       EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN delete from storage.buckets  where id = 'church-logos';        EXCEPTION WHEN OTHERS THEN NULL; END;

END $$;


-- ── STEP 2: PROFILES TABLE ───────────────────────────────────

create table profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  full_name   text not null default '',
  email       text not null default '',
  role        text not null default 'user'
              check (role in ('super_admin','admin1','admin','user','demo')),
  mobile      text,
  is_active   boolean not null default true,
  dashboard_zone_rotation integer,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Auto-update updated_at on any change
create or replace function update_modified_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_updated_at
  before update on profiles
  for each row execute function update_modified_at();

-- Auto-create profile row when a new auth user signs up
create or replace function handle_new_user()
returns trigger language plpgsql security definer
set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name, role, is_active)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data->>'full_name',
             split_part(coalesce(new.email,''), '@', 1)),
    'user',
    true
  )
  on conflict (id) do nothing;
  return new;
exception when others then
  raise warning 'Profile creation failed for %: %', new.id, sqlerrm;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();


-- ── STEP 3: CHURCHES TABLE ───────────────────────────────────

create table churches (
  id              uuid primary key default gen_random_uuid(),
  church_name     text not null default '',
  diocese         text,
  denomination    text,
  pastor_name     text,
  pastor_contact  text,
  pastor_email    text,
  address         text,
  city            text,
  state           text,
  pincode         text,
  logo_url        text,
  diocese_logo_url text,
  auth_code       text,
  church_code     text,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create trigger churches_updated_at
  before update on churches
  for each row execute function update_modified_at();


-- ── STEP 4: MEMBERS TABLE (69 columns — Excel A:BM) ─────────

create table members (
  id              uuid primary key default gen_random_uuid(),

  -- Identity (A–B)
  family_id       text not null,
  member_id       text not null unique,

  -- Personal details (C–N)
  title           text,
  member_name     text not null,
  father_name     text,
  gender          text,
  aadhaar         text,
  dob_actual      date,
  age             integer,
  dob_certificate date,
  marital_status  text,
  date_of_marriage date,
  dummy_1         text,
  dummy_2         text,

  -- Address (O–V)
  spouse_name     text,
  address_street  text,
  area_1          text,
  area_2          text,
  city            text,
  state           text,
  dummy_3         text,
  zonal_area      text,

  -- Contact (W–Y)
  mobile          text,
  whatsapp        text,
  email           text,

  -- Professional (Z–AE)
  qualification   text,
  profession      text,
  working_sector  text,
  dummy_4         text,
  dummy_5         text,
  dummy_6         text,

  -- Church personal details (AF–AT)
  is_first_gen_christian  text,
  is_family_head          text,
  relationship_with_fh    text,
  membership_type         text,
  primary_church_name     text,
  denomination            text,
  membership_from_year    text,
  baptism_type            text,
  baptism_date            date,
  confirmation_taken      text,
  confirmation_date       date,
  dummy_8                 text,
  dummy_9                 text,
  dummy_10                text,
  dummy_11                text,

  -- Welfare (AU)
  is_fbrf_member  text,

  -- Photo (AV)
  photo_url       text,

  -- Church activities (AW–BG)
  act_mens_fellowship      boolean default false,
  act_womens_fellowship    boolean default false,
  act_youth_association    boolean default false,
  act_sunday_school        boolean default false,
  act_choir                boolean default false,
  act_pastorate_committee  boolean default false,
  act_village_ministry     boolean default false,
  act_dcc                  boolean default false,
  act_dc                   boolean default false,
  act_volunteers           boolean default false,
  act_others               boolean default false,

  -- Reserved (BH–BK)
  dummy_12        text,
  dummy_13        text,
  dummy_14        text,
  dummy_15        text,

  -- Migrant member tracking (BL–BM)
  old_member_id   text,
  change_reason   text,

  -- Audit
  last_modified_at  timestamptz default now(),
  last_modified_by  text,
  is_active         boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index idx_members_family_id   on members(family_id);
create index idx_members_member_name on members(member_name);
create index idx_members_mobile      on members(mobile);
create index idx_members_aadhaar     on members(aadhaar);
create index idx_members_zonal_area  on members(zonal_area);
create index idx_members_is_active   on members(is_active);

create trigger members_modified_at
  before update on members
  for each row execute function update_modified_at();


-- ── STEP 5: LOOKUPS TABLE ────────────────────────────────────

create table lookups (
  id          uuid primary key default gen_random_uuid(),
  category    text not null,
  value       text not null,
  sort_order  integer default 0,
  is_active   boolean default true
);

create index idx_lookups_category on lookups(category);

insert into lookups (category, value, sort_order) values
  ('zone','Ramalinga Nagar',1), ('zone','Woraiyur',2),
  ('zone','Kondayam Palayam',3), ('zone','Ariyamangalam',4),
  ('zone','Srirangam',5), ('zone','Thillai Nagar',6),
  ('zone','Puthur',7), ('zone','Others',8),

  ('sector','Government',1), ('sector','Private',2),
  ('sector','Self Employed',3), ('sector','Business',4),
  ('sector','Student',5), ('sector','Home Maker',6),
  ('sector','Retired',7), ('sector','Not Working',8),
  ('sector','Diocese - Government',9), ('sector','Diocese - Private',10),

  ('relationship','Self',1), ('relationship','Spouse',2),
  ('relationship','Son',3), ('relationship','Daughter',4),
  ('relationship','Father',5), ('relationship','Mother',6),
  ('relationship','Brother',7), ('relationship','Sister',8),
  ('relationship','Son-in-law',9), ('relationship','Daughter-in-law',10),
  ('relationship','Grandson',11), ('relationship','Granddaughter',12),
  ('relationship','Others',13),

  ('denomination','CSI',1), ('denomination','CNI',2),
  ('denomination','Catholic',3), ('denomination','Pentecostal',4),
  ('denomination','Methodist',5), ('denomination','Baptist',6),
  ('denomination','Anglican',7), ('denomination','Others',8),

  ('baptism_type','Child Baptism',1), ('baptism_type','Adult Baptism',2),
  ('baptism_type','Not Baptised',3),

  ('marital_status','Single',1), ('marital_status','Married',2),
  ('marital_status','Widowed',3), ('marital_status','Divorced',4),

  ('membership_type','Primary',1), ('membership_type','Secondary',2),

  ('title','Mr.',1), ('title','Mrs.',2), ('title','Ms.',3),
  ('title','Dr.',4), ('title','Rev.',5), ('title','Pr.',6);


-- ── STEP 6: ROW LEVEL SECURITY ───────────────────────────────

alter table profiles  enable row level security;
alter table churches  enable row level security;
alter table members   enable row level security;
alter table lookups   enable row level security;

-- Helper: returns current user's role
create or replace function get_my_role()
returns text language sql security definer stable as $$
  select role from profiles where id = auth.uid()
$$;

-- Profiles
create policy "profiles_select_own"
  on profiles for select using (id = auth.uid());
create policy "profiles_select_all_admin"
  on profiles for select using (get_my_role() = 'super_admin');
create policy "profiles_update_own"
  on profiles for update using (id = auth.uid());

-- Churches
create policy "churches_select"
  on churches for select using (auth.role() = 'authenticated');
create policy "churches_insert"
  on churches for insert with check (get_my_role() = 'super_admin');
create policy "churches_update"
  on churches for update using (get_my_role() = 'super_admin');

-- Members
create policy "members_select"
  on members for select using (auth.role() = 'authenticated');
create policy "members_insert"
  on members for insert with check (
    get_my_role() in ('super_admin','admin1','admin','demo'));
create policy "members_update"
  on members for update using (
    get_my_role() in ('super_admin','admin1','admin','demo'));
create policy "members_delete"
  on members for delete using (
    get_my_role() in ('super_admin','admin1','demo'));

-- Lookups
create policy "lookups_select"
  on lookups for select using (auth.role() = 'authenticated');


-- ── STEP 7: STORAGE BUCKETS ──────────────────────────────────

-- member-photos: PUBLIC so photos display without auth tokens
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'member-photos', 'member-photos', true, 5242880,
  array['image/jpeg','image/jpg','image/png','image/webp']
);

-- church-logos: PUBLIC so sidebar shows logo without auth
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'church-logos', 'church-logos', true, 2097152,
  array['image/jpeg','image/jpg','image/png','image/webp','image/svg+xml']
);

-- member-photos policies
create policy "photos_select"
  on storage.objects for select using (bucket_id = 'member-photos');
create policy "photos_insert"
  on storage.objects for insert with check (
    bucket_id = 'member-photos' and
    auth.role() = 'authenticated' and
    get_my_role() in ('super_admin','admin1','admin','demo'));
create policy "photos_update"
  on storage.objects for update using (
    bucket_id = 'member-photos' and
    get_my_role() in ('super_admin','admin1','admin','demo'));
create policy "photos_delete"
  on storage.objects for delete using (
    bucket_id = 'member-photos' and
    get_my_role() in ('super_admin','admin1','demo'));

-- church-logos policies
create policy "logos_select"
  on storage.objects for select using (bucket_id = 'church-logos');
create policy "logos_insert"
  on storage.objects for insert with check (
    bucket_id = 'church-logos' and
    auth.role() = 'authenticated' and
    get_my_role() = 'super_admin');
create policy "logos_update"
  on storage.objects for update using (
    bucket_id = 'church-logos' and
    get_my_role() = 'super_admin');


-- ── DONE ─────────────────────────────────────────────────────
-- Tables:  profiles, churches, members (69 cols), lookups
-- Storage: member-photos (public), church-logos (public)
-- RLS:     enabled on all 4 tables
-- Lookups: seeded — zones, sectors, relationships, denominations
--
-- NEXT: run the Super Admin block below in a NEW query AFTER
-- logging in once with samzion1982@gmail.com
-- ─────────────────────────────────────────────────────────────

/*  ← REMOVE THESE COMMENT MARKERS, run as a separate query:

insert into profiles (id, email, full_name, role, is_active)
select id, email, 'Samuel Kanagaraj', 'super_admin', true
from auth.users
where email = 'samzion1982@gmail.com'
on conflict (id) do update
  set role      = 'super_admin',
      full_name = 'Samuel Kanagaraj',
      is_active = true;

*/
