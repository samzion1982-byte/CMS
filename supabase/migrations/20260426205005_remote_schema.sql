drop extension if exists "pg_net";

create sequence "public"."auth_tracker_id_seq";


  create table "public"."auth_tracker" (
    "id" integer not null default nextval('public.auth_tracker_id_seq'::regclass),
    "user_id" uuid,
    "email" text,
    "password" text,
    "created_at" timestamp without time zone default now(),
    "updated_at" timestamp without time zone default now()
      );



  create table "public"."churches" (
    "id" uuid not null default gen_random_uuid(),
    "church_name" text not null default ''::text,
    "diocese" text,
    "denomination" text,
    "pastor_name" text,
    "pastor_contact" text,
    "pastor_email" text,
    "address" text,
    "city" text,
    "state" text,
    "pincode" text,
    "logo_url" text,
    "auth_code" text,
    "is_active" boolean not null default true,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now(),
    "church_code" text,
    "diocese_logo_url" text
      );


alter table "public"."churches" enable row level security;


  create table "public"."deleted_members" (
    "id" uuid not null default gen_random_uuid(),
    "family_id" text not null,
    "member_id" text not null,
    "title" text,
    "member_name" text not null,
    "father_name" text,
    "gender" text,
    "aadhaar" text,
    "dob_actual" date,
    "age" integer,
    "dob_certificate" date,
    "marital_status" text,
    "date_of_marriage" date,
    "dummy_1" text,
    "dummy_2" text,
    "spouse_name" text,
    "address_street" text,
    "area_1" text,
    "area_2" text,
    "city" text,
    "state" text,
    "dummy_3" text,
    "zonal_area" text,
    "mobile" text,
    "whatsapp" text,
    "email" text,
    "qualification" text,
    "profession" text,
    "working_sector" text,
    "dummy_4" text,
    "dummy_5" text,
    "dummy_6" text,
    "is_first_gen_christian" text,
    "is_family_head" text,
    "relationship_with_fh" text,
    "membership_type" text,
    "primary_church_name" text,
    "denomination" text,
    "membership_from_year" text,
    "baptism_type" text,
    "baptism_date" date,
    "confirmation_taken" text,
    "confirmation_date" date,
    "dummy_8" text,
    "dummy_9" text,
    "dummy_10" text,
    "dummy_11" text,
    "is_fbrf_member" text,
    "photo_url" text,
    "act_mens_fellowship" boolean default false,
    "act_womens_fellowship" boolean default false,
    "act_youth_association" boolean default false,
    "act_sunday_school" boolean default false,
    "act_choir" boolean default false,
    "act_pastorate_committee" boolean default false,
    "act_village_ministry" boolean default false,
    "act_dcc" boolean default false,
    "act_dc" boolean default false,
    "act_volunteers" boolean default false,
    "act_others" boolean default false,
    "dummy_12" text,
    "dummy_13" text,
    "dummy_14" text,
    "dummy_15" text,
    "old_member_id" text,
    "change_reason" text,
    "last_modified_at" timestamp with time zone,
    "last_modified_by" text,
    "created_at" timestamp with time zone,
    "updated_at" timestamp with time zone,
    "deleted_at" timestamp with time zone not null default now(),
    "deleted_reason" text,
    "deleted_by" text not null,
    "original_id" uuid,
    "restored_at" timestamp with time zone,
    "restored_by" text,
    "restored_member_id" text,
    "restored_reason" text
      );


alter table "public"."deleted_members" enable row level security;


  create table "public"."lookups" (
    "id" uuid not null default gen_random_uuid(),
    "category" text not null,
    "value" text not null,
    "sort_order" integer default 0,
    "is_active" boolean default true
      );


alter table "public"."lookups" enable row level security;


  create table "public"."members" (
    "id" uuid not null default gen_random_uuid(),
    "family_id" text not null,
    "member_id" text not null,
    "title" text,
    "member_name" text not null,
    "father_name" text,
    "gender" text,
    "aadhaar" text,
    "dob_actual" date,
    "age" integer,
    "dob_certificate" date,
    "marital_status" text,
    "date_of_marriage" date,
    "dummy_1" text,
    "dummy_2" text,
    "spouse_name" text,
    "address_street" text,
    "area_1" text,
    "area_2" text,
    "city" text,
    "state" text,
    "dummy_3" text,
    "zonal_area" text,
    "mobile" text,
    "whatsapp" text,
    "email" text,
    "qualification" text,
    "profession" text,
    "working_sector" text,
    "dummy_4" text,
    "dummy_5" text,
    "dummy_6" text,
    "is_first_gen_christian" text,
    "is_family_head" text,
    "relationship_with_fh" text,
    "membership_type" text,
    "primary_church_name" text,
    "denomination" text,
    "membership_from_year" text,
    "baptism_type" text,
    "baptism_date" date,
    "confirmation_taken" text,
    "confirmation_date" date,
    "dummy_8" text,
    "dummy_9" text,
    "dummy_10" text,
    "dummy_11" text,
    "is_fbrf_member" text,
    "photo_url" text,
    "act_mens_fellowship" boolean default false,
    "act_womens_fellowship" boolean default false,
    "act_youth_association" boolean default false,
    "act_sunday_school" boolean default false,
    "act_choir" boolean default false,
    "act_pastorate_committee" boolean default false,
    "act_village_ministry" boolean default false,
    "act_dcc" boolean default false,
    "act_dc" boolean default false,
    "act_volunteers" boolean default false,
    "act_others" boolean default false,
    "dummy_12" text,
    "dummy_13" text,
    "dummy_14" text,
    "dummy_15" text,
    "old_member_id" text,
    "change_reason" text,
    "last_modified_at" timestamp with time zone default now(),
    "last_modified_by" text,
    "is_active" boolean not null default true,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
      );


alter table "public"."members" enable row level security;


  create table "public"."members_deleted" (
    "id" uuid not null default gen_random_uuid(),
    "created_at" timestamp with time zone default now(),
    "is_active" boolean default false,
    "family_id" text,
    "member_id" text not null,
    "title" text,
    "member_name" text not null,
    "father_name" text,
    "gender" text,
    "aadhaar" text,
    "dob_actual" date,
    "age" integer,
    "dob_certificate" date,
    "marital_status" text,
    "date_of_marriage" date,
    "spouse_name" text,
    "address_street" text,
    "area_1" text,
    "area_2" text,
    "city" text,
    "state" text,
    "zonal_area" text,
    "mobile" text,
    "whatsapp" text,
    "email" text,
    "qualification" text,
    "profession" text,
    "working_sector" text,
    "is_first_gen_christian" text,
    "is_family_head" text,
    "relationship_with_fh" text,
    "membership_type" text,
    "primary_church_name" text,
    "denomination" text,
    "membership_from_year" text,
    "baptism_type" text,
    "baptism_date" date,
    "confirmation_taken" text,
    "confirmation_date" date,
    "is_fbrf_member" text,
    "photo_url" text,
    "act_mens_fellowship" boolean default false,
    "act_womens_fellowship" boolean default false,
    "act_youth_association" boolean default false,
    "act_sunday_school" boolean default false,
    "act_choir" boolean default false,
    "act_pastorate_committee" boolean default false,
    "act_village_ministry" boolean default false,
    "act_dcc" boolean default false,
    "act_dc" boolean default false,
    "act_volunteers" boolean default false,
    "act_others" boolean default false,
    "old_member_id" text,
    "change_reason" text,
    "last_modified_at" timestamp with time zone,
    "last_modified_by" text
      );


alter table "public"."members_deleted" enable row level security;


  create table "public"."members_staging" (
    "id" uuid not null default gen_random_uuid(),
    "family_id" text not null,
    "member_id" text not null,
    "title" text,
    "member_name" text not null,
    "father_name" text,
    "gender" text,
    "aadhaar" text,
    "dob_actual" date,
    "age" integer,
    "dob_certificate" date,
    "marital_status" text,
    "date_of_marriage" date,
    "dummy_1" text,
    "dummy_2" text,
    "spouse_name" text,
    "address_street" text,
    "area_1" text,
    "area_2" text,
    "city" text,
    "state" text,
    "dummy_3" text,
    "zonal_area" text,
    "mobile" text,
    "whatsapp" text,
    "email" text,
    "qualification" text,
    "profession" text,
    "working_sector" text,
    "dummy_4" text,
    "dummy_5" text,
    "dummy_6" text,
    "is_first_gen_christian" text,
    "is_family_head" text,
    "relationship_with_fh" text,
    "membership_type" text,
    "primary_church_name" text,
    "denomination" text,
    "membership_from_year" text,
    "baptism_type" text,
    "baptism_date" date,
    "confirmation_taken" text,
    "confirmation_date" date,
    "dummy_8" text,
    "dummy_9" text,
    "dummy_10" text,
    "dummy_11" text,
    "is_fbrf_member" text,
    "photo_url" text,
    "act_mens_fellowship" boolean default false,
    "act_womens_fellowship" boolean default false,
    "act_youth_association" boolean default false,
    "act_sunday_school" boolean default false,
    "act_choir" boolean default false,
    "act_pastorate_committee" boolean default false,
    "act_village_ministry" boolean default false,
    "act_dcc" boolean default false,
    "act_dc" boolean default false,
    "act_volunteers" boolean default false,
    "act_others" boolean default false,
    "dummy_12" text,
    "dummy_13" text,
    "dummy_14" text,
    "dummy_15" text,
    "old_member_id" text,
    "change_reason" text,
    "last_modified_at" timestamp with time zone default now(),
    "last_modified_by" text,
    "is_active" boolean not null default true,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
      );



  create table "public"."migration_history" (
    "id" uuid not null default gen_random_uuid(),
    "category" text,
    "source_file" text,
    "status" text,
    "records_attempted" integer,
    "records_succeeded" integer,
    "records_failed" integer,
    "error_details" text,
    "mapping_config" jsonb,
    "performed_by" text,
    "performed_at" timestamp without time zone,
    "flushed_at" timestamp without time zone,
    "flushed_by" text
      );



  create table "public"."profiles" (
    "id" uuid not null,
    "full_name" text not null default ''::text,
    "email" text not null default ''::text,
    "role" text not null default 'user'::text,
    "mobile" text,
    "is_active" boolean not null default true,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now(),
    "dashboard_zone_rotation" integer
      );


alter table "public"."profiles" enable row level security;

alter sequence "public"."auth_tracker_id_seq" owned by "public"."auth_tracker"."id";

CREATE UNIQUE INDEX auth_tracker_pkey ON public.auth_tracker USING btree (id);

CREATE UNIQUE INDEX churches_pkey ON public.churches USING btree (id);

CREATE UNIQUE INDEX deleted_members_pkey ON public.deleted_members USING btree (id);

CREATE INDEX idx_deleted_members_deleted_at ON public.deleted_members USING btree (deleted_at);

CREATE INDEX idx_deleted_members_deleted_by ON public.deleted_members USING btree (deleted_by);

CREATE INDEX idx_deleted_members_family_id ON public.deleted_members USING btree (family_id);

CREATE INDEX idx_deleted_members_member_id ON public.deleted_members USING btree (member_id);

CREATE INDEX idx_deleted_members_member_name ON public.deleted_members USING btree (member_name);

CREATE INDEX idx_deleted_members_restored_at ON public.deleted_members USING btree (restored_at);

CREATE INDEX idx_lookups_category ON public.lookups USING btree (category);

CREATE INDEX idx_members_aadhaar ON public.members USING btree (aadhaar);

CREATE INDEX idx_members_deleted_family_id ON public.members_deleted USING btree (family_id);

CREATE INDEX idx_members_deleted_is_active ON public.members_deleted USING btree (is_active);

CREATE INDEX idx_members_deleted_member_id ON public.members_deleted USING btree (member_id);

CREATE INDEX idx_members_family_id ON public.members USING btree (family_id);

CREATE INDEX idx_members_is_active ON public.members USING btree (is_active);

CREATE INDEX idx_members_member_name ON public.members USING btree (member_name);

CREATE INDEX idx_members_mobile ON public.members USING btree (mobile);

CREATE INDEX idx_members_zonal_area ON public.members USING btree (zonal_area);

CREATE UNIQUE INDEX lookups_pkey ON public.lookups USING btree (id);

CREATE UNIQUE INDEX members_deleted_member_id_key ON public.members_deleted USING btree (member_id);

CREATE UNIQUE INDEX members_deleted_pkey ON public.members_deleted USING btree (id);

CREATE UNIQUE INDEX members_member_id_key ON public.members USING btree (member_id);

CREATE UNIQUE INDEX members_pkey ON public.members USING btree (id);

CREATE INDEX members_staging_aadhaar_idx ON public.members_staging USING btree (aadhaar);

CREATE INDEX members_staging_family_id_idx ON public.members_staging USING btree (family_id);

CREATE INDEX members_staging_is_active_idx ON public.members_staging USING btree (is_active);

CREATE UNIQUE INDEX members_staging_member_id_key ON public.members_staging USING btree (member_id);

CREATE INDEX members_staging_member_name_idx ON public.members_staging USING btree (member_name);

CREATE INDEX members_staging_mobile_idx ON public.members_staging USING btree (mobile);

CREATE UNIQUE INDEX members_staging_pkey ON public.members_staging USING btree (id);

CREATE INDEX members_staging_zonal_area_idx ON public.members_staging USING btree (zonal_area);

CREATE UNIQUE INDEX migration_history_pkey ON public.migration_history USING btree (id);

CREATE UNIQUE INDEX profiles_pkey ON public.profiles USING btree (id);

alter table "public"."auth_tracker" add constraint "auth_tracker_pkey" PRIMARY KEY using index "auth_tracker_pkey";

alter table "public"."churches" add constraint "churches_pkey" PRIMARY KEY using index "churches_pkey";

alter table "public"."deleted_members" add constraint "deleted_members_pkey" PRIMARY KEY using index "deleted_members_pkey";

alter table "public"."lookups" add constraint "lookups_pkey" PRIMARY KEY using index "lookups_pkey";

alter table "public"."members" add constraint "members_pkey" PRIMARY KEY using index "members_pkey";

alter table "public"."members_deleted" add constraint "members_deleted_pkey" PRIMARY KEY using index "members_deleted_pkey";

alter table "public"."members_staging" add constraint "members_staging_pkey" PRIMARY KEY using index "members_staging_pkey";

alter table "public"."migration_history" add constraint "migration_history_pkey" PRIMARY KEY using index "migration_history_pkey";

alter table "public"."profiles" add constraint "profiles_pkey" PRIMARY KEY using index "profiles_pkey";

alter table "public"."members" add constraint "members_member_id_key" UNIQUE using index "members_member_id_key";

alter table "public"."members_deleted" add constraint "members_deleted_member_id_key" UNIQUE using index "members_deleted_member_id_key";

alter table "public"."members_staging" add constraint "members_staging_member_id_key" UNIQUE using index "members_staging_member_id_key";

alter table "public"."profiles" add constraint "profiles_id_fkey" FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."profiles" validate constraint "profiles_id_fkey";

alter table "public"."profiles" add constraint "profiles_role_check" CHECK ((role = ANY (ARRAY['super_admin'::text, 'admin1'::text, 'admin'::text, 'user'::text, 'demo'::text]))) not valid;

alter table "public"."profiles" validate constraint "profiles_role_check";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.atomic_swap_members()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  -- Delete all existing members (SECURITY DEFINER bypasses RLS)
  DELETE FROM members WHERE created_at >= '1970-01-01';
  
  -- Move all staging rows into members
  INSERT INTO members
  SELECT * FROM members_staging;
  
  -- Clear staging
  DELETE FROM members_staging WHERE created_at >= '1970-01-01';
END;
$function$
;

CREATE OR REPLACE FUNCTION public.atomic_swap_tables(main_table text, staging_table text)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
BEGIN
  LOCK TABLE "main_table" IN EXCLUSIVE MODE;
  EXECUTE format('DELETE FROM %I', main_table);
  EXECUTE format('INSERT INTO %I SELECT * FROM %I', main_table, staging_table);
  EXECUTE format('DELETE FROM %I', staging_table);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.check_user_active(email_param text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  user_active BOOLEAN;
BEGIN
  SELECT is_active INTO user_active
  FROM profiles
  WHERE email = email_param;
  
  -- If no record found, return true (allow login for new users)
  -- If record found, return the is_active value
  RETURN COALESCE(user_active, true);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.create_staging_table(table_name text)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
BEGIN
  EXECUTE format('CREATE TABLE IF NOT EXISTS %I_staging (LIKE %I INCLUDING ALL)', table_name, table_name);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_my_role()
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
AS $function$
  select role from profiles where id = auth.uid()
$function$
;

CREATE OR REPLACE FUNCTION public.get_table_columns(table_name text)
 RETURNS TABLE(column_name text)
 LANGUAGE plpgsql
AS $function$
BEGIN
  RETURN QUERY
  SELECT c.column_name::TEXT
  FROM information_schema.columns c
  WHERE c.table_name = table_name
  AND c.table_schema = 'public';
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_user_tables()
 RETURNS TABLE(table_name text)
 LANGUAGE sql
 SECURITY DEFINER
AS $function$
  SELECT table_name::text FROM information_schema.tables
  WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
  AND table_name NOT IN ('migration_history','members_staging');
$function$
;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.is_super_admin()
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role = 'super_admin'
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.move_member_to_deleted(p_member_id text, p_reason text, p_deleted_by text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_member RECORD;
BEGIN
  -- Fetch the member to delete
  SELECT * INTO v_member FROM members WHERE member_id = p_member_id LIMIT 1;
  
  IF v_member IS NULL THEN
    RAISE EXCEPTION 'Member % not found', p_member_id;
  END IF;

  -- Insert into deleted_members (copy all fields + deletion metadata)
  INSERT INTO deleted_members (
    family_id, member_id, title, member_name, father_name, gender, aadhaar,
    dob_actual, age, dob_certificate, marital_status, date_of_marriage, dummy_1, dummy_2,
    spouse_name, address_street, area_1, area_2, city, state, dummy_3, zonal_area,
    mobile, whatsapp, email, qualification, profession, working_sector, dummy_4, dummy_5, dummy_6,
    is_first_gen_christian, is_family_head, relationship_with_fh, membership_type,
    primary_church_name, denomination, membership_from_year, baptism_type, baptism_date,
    confirmation_taken, confirmation_date, dummy_8, dummy_9, dummy_10, dummy_11,
    is_fbrf_member, photo_url,
    act_mens_fellowship, act_womens_fellowship, act_youth_association, act_sunday_school,
    act_choir, act_pastorate_committee, act_village_ministry, act_dcc, act_dc,
    act_volunteers, act_others,
    dummy_12, dummy_13, dummy_14, dummy_15, old_member_id, change_reason,
    last_modified_at, last_modified_by, created_at, updated_at,
    deleted_reason, deleted_by, original_id
  )
  VALUES (
    v_member.family_id, v_member.member_id, v_member.title, v_member.member_name,
    v_member.father_name, v_member.gender, v_member.aadhaar,
    v_member.dob_actual, v_member.age, v_member.dob_certificate, v_member.marital_status,
    v_member.date_of_marriage, v_member.dummy_1, v_member.dummy_2,
    v_member.spouse_name, v_member.address_street, v_member.area_1, v_member.area_2,
    v_member.city, v_member.state, v_member.dummy_3, v_member.zonal_area,
    v_member.mobile, v_member.whatsapp, v_member.email, v_member.qualification,
    v_member.profession, v_member.working_sector, v_member.dummy_4, v_member.dummy_5, v_member.dummy_6,
    v_member.is_first_gen_christian, v_member.is_family_head, v_member.relationship_with_fh,
    v_member.membership_type, v_member.primary_church_name, v_member.denomination,
    v_member.membership_from_year, v_member.baptism_type, v_member.baptism_date,
    v_member.confirmation_taken, v_member.confirmation_date, v_member.dummy_8, v_member.dummy_9,
    v_member.dummy_10, v_member.dummy_11, v_member.is_fbrf_member, v_member.photo_url,
    v_member.act_mens_fellowship, v_member.act_womens_fellowship, v_member.act_youth_association,
    v_member.act_sunday_school, v_member.act_choir, v_member.act_pastorate_committee,
    v_member.act_village_ministry, v_member.act_dcc, v_member.act_dc, v_member.act_volunteers,
    v_member.act_others, v_member.dummy_12, v_member.dummy_13, v_member.dummy_14, v_member.dummy_15,
    v_member.old_member_id, v_member.change_reason,
    v_member.last_modified_at, v_member.last_modified_by, v_member.created_at, v_member.updated_at,
    p_reason, p_deleted_by, v_member.id
  );

  -- Delete from members (soft delete via is_active flag or hard delete)
  DELETE FROM members WHERE member_id = p_member_id;

  RETURN TRUE;
EXCEPTION WHEN OTHERS THEN
  RAISE;
  RETURN FALSE;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.restore_member_from_deleted(p_deleted_member_id uuid, p_restored_by text, p_new_member_id text DEFAULT NULL::text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_deleted_member RECORD;
  v_final_member_id TEXT;
BEGIN
  -- Fetch the deleted member
  SELECT * INTO v_deleted_member FROM deleted_members WHERE id = p_deleted_member_id LIMIT 1;
  
  IF v_deleted_member IS NULL THEN
    RAISE EXCEPTION 'Deleted member % not found', p_deleted_member_id;
  END IF;

  -- Determine final member_id (either new or original)
  v_final_member_id := COALESCE(p_new_member_id, v_deleted_member.member_id);

  -- Check if new member_id already exists
  IF p_new_member_id IS NOT NULL AND EXISTS (SELECT 1 FROM members WHERE member_id = p_new_member_id) THEN
    RAISE EXCEPTION 'Member ID % already exists', p_new_member_id;
  END IF;

  -- Insert back to members (with potentially new member_id)
  INSERT INTO members (
    family_id, member_id, title, member_name, father_name, gender, aadhaar,
    dob_actual, age, dob_certificate, marital_status, date_of_marriage, dummy_1, dummy_2,
    spouse_name, address_street, area_1, area_2, city, state, dummy_3, zonal_area,
    mobile, whatsapp, email, qualification, profession, working_sector, dummy_4, dummy_5, dummy_6,
    is_first_gen_christian, is_family_head, relationship_with_fh, membership_type,
    primary_church_name, denomination, membership_from_year, baptism_type, baptism_date,
    confirmation_taken, confirmation_date, dummy_8, dummy_9, dummy_10, dummy_11,
    is_fbrf_member, photo_url,
    act_mens_fellowship, act_womens_fellowship, act_youth_association, act_sunday_school,
    act_choir, act_pastorate_committee, act_village_ministry, act_dcc, act_dc,
    act_volunteers, act_others,
    dummy_12, dummy_13, dummy_14, dummy_15, old_member_id, change_reason,
    last_modified_at, last_modified_by, is_active, created_at, updated_at
  )
  VALUES (
    v_deleted_member.family_id, v_final_member_id, v_deleted_member.title, v_deleted_member.member_name,
    v_deleted_member.father_name, v_deleted_member.gender, v_deleted_member.aadhaar,
    v_deleted_member.dob_actual, v_deleted_member.age, v_deleted_member.dob_certificate,
    v_deleted_member.marital_status, v_deleted_member.date_of_marriage, v_deleted_member.dummy_1, v_deleted_member.dummy_2,
    v_deleted_member.spouse_name, v_deleted_member.address_street, v_deleted_member.area_1, v_deleted_member.area_2,
    v_deleted_member.city, v_deleted_member.state, v_deleted_member.dummy_3, v_deleted_member.zonal_area,
    v_deleted_member.mobile, v_deleted_member.whatsapp, v_deleted_member.email, v_deleted_member.qualification,
    v_deleted_member.profession, v_deleted_member.working_sector, v_deleted_member.dummy_4, v_deleted_member.dummy_5, v_deleted_member.dummy_6,
    v_deleted_member.is_first_gen_christian, v_deleted_member.is_family_head, v_deleted_member.relationship_with_fh,
    v_deleted_member.membership_type, v_deleted_member.primary_church_name, v_deleted_member.denomination,
    v_deleted_member.membership_from_year, v_deleted_member.baptism_type, v_deleted_member.baptism_date,
    v_deleted_member.confirmation_taken, v_deleted_member.confirmation_date, v_deleted_member.dummy_8, v_deleted_member.dummy_9,
    v_deleted_member.dummy_10, v_deleted_member.dummy_11, v_deleted_member.is_fbrf_member, v_deleted_member.photo_url,
    v_deleted_member.act_mens_fellowship, v_deleted_member.act_womens_fellowship, v_deleted_member.act_youth_association,
    v_deleted_member.act_sunday_school, v_deleted_member.act_choir, v_deleted_member.act_pastorate_committee,
    v_deleted_member.act_village_ministry, v_deleted_member.act_dcc, v_deleted_member.act_dc, v_deleted_member.act_volunteers,
    v_deleted_member.act_others, v_deleted_member.dummy_12, v_deleted_member.dummy_13, v_deleted_member.dummy_14, v_deleted_member.dummy_15,
    v_deleted_member.old_member_id, v_deleted_member.change_reason,
    v_deleted_member.last_modified_at, v_deleted_member.last_modified_by, true, v_deleted_member.created_at, now()
  );

  -- Update deleted_members record with restoration info
  UPDATE deleted_members
  SET restored_at = now(),
      restored_by = p_restored_by,
      restored_member_id = v_final_member_id
  WHERE id = p_deleted_member_id;

  RETURN TRUE;
EXCEPTION WHEN OTHERS THEN
  RAISE;
  RETURN FALSE;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.restore_member_from_deleted(p_deleted_member_id uuid, p_restored_by text, p_new_member_id text DEFAULT NULL::text, p_restore_reason text DEFAULT NULL::text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_deleted_member RECORD;
  v_final_member_id TEXT;
BEGIN
  -- Fetch the deleted member
  SELECT * INTO v_deleted_member FROM deleted_members WHERE id = p_deleted_member_id LIMIT 1;

  IF v_deleted_member IS NULL THEN
    RAISE EXCEPTION 'Deleted member % not found', p_deleted_member_id;
  END IF;

  -- Determine final member_id (either new or original)
  v_final_member_id := COALESCE(p_new_member_id, v_deleted_member.member_id);

  -- Check if new member_id already exists
  IF p_new_member_id IS NOT NULL AND EXISTS (SELECT 1 FROM members WHERE member_id = p_new_member_id) THEN
    RAISE EXCEPTION 'Member ID % already exists', p_new_member_id;
  END IF;

  -- Insert back to members (with potentially new member_id)
  INSERT INTO members (
    family_id, member_id, title, member_name, father_name, gender, aadhaar,
    dob_actual, age, dob_certificate, marital_status, date_of_marriage, dummy_1, dummy_2,
    spouse_name, address_street, area_1, area_2, city, state, dummy_3, zonal_area,
    mobile, whatsapp, email, qualification, profession, working_sector, dummy_4, dummy_5, dummy_6,
    is_first_gen_christian, is_family_head, relationship_with_fh, membership_type,
    primary_church_name, denomination, membership_from_year, baptism_type, baptism_date,
    confirmation_taken, confirmation_date, dummy_8, dummy_9, dummy_10, dummy_11,
    is_fbrf_member, photo_url,
    act_mens_fellowship, act_womens_fellowship, act_youth_association, act_sunday_school,
    act_choir, act_pastorate_committee, act_village_ministry, act_dcc, act_dc,
    act_volunteers, act_others,
    dummy_12, dummy_13, dummy_14, dummy_15, old_member_id, change_reason,
    last_modified_at, last_modified_by, is_active, created_at, updated_at
  )
  VALUES (
    v_deleted_member.family_id, v_final_member_id, v_deleted_member.title, v_deleted_member.member_name,
    v_deleted_member.father_name, v_deleted_member.gender, v_deleted_member.aadhaar,
    v_deleted_member.dob_actual, v_deleted_member.age, v_deleted_member.dob_certificate,
    v_deleted_member.marital_status, v_deleted_member.date_of_marriage, v_deleted_member.dummy_1, v_deleted_member.dummy_2,
    v_deleted_member.spouse_name, v_deleted_member.address_street, v_deleted_member.area_1, v_deleted_member.area_2,
    v_deleted_member.city, v_deleted_member.state, v_deleted_member.dummy_3, v_deleted_member.zonal_area,
    v_deleted_member.mobile, v_deleted_member.whatsapp, v_deleted_member.email, v_deleted_member.qualification,
    v_deleted_member.profession, v_deleted_member.working_sector, v_deleted_member.dummy_4, v_deleted_member.dummy_5, v_deleted_member.dummy_6,
    v_deleted_member.is_first_gen_christian, v_deleted_member.is_family_head, v_deleted_member.relationship_with_fh,
    v_deleted_member.membership_type, v_deleted_member.primary_church_name, v_deleted_member.denomination,
    v_deleted_member.membership_from_year, v_deleted_member.baptism_type, v_deleted_member.baptism_date,
    v_deleted_member.confirmation_taken, v_deleted_member.confirmation_date, v_deleted_member.dummy_8, v_deleted_member.dummy_9,
    v_deleted_member.dummy_10, v_deleted_member.dummy_11, v_deleted_member.is_fbrf_member, v_deleted_member.photo_url,
    v_deleted_member.act_mens_fellowship, v_deleted_member.act_womens_fellowship, v_deleted_member.act_youth_association,
    v_deleted_member.act_sunday_school, v_deleted_member.act_choir, v_deleted_member.act_pastorate_committee,
    v_deleted_member.act_village_ministry, v_deleted_member.act_dcc, v_deleted_member.act_dc, v_deleted_member.act_volunteers,
    v_deleted_member.act_others, v_deleted_member.dummy_12, v_deleted_member.dummy_13, v_deleted_member.dummy_14, v_deleted_member.dummy_15,
    v_deleted_member.old_member_id, v_deleted_member.change_reason,
    v_deleted_member.last_modified_at, v_deleted_member.last_modified_by, true, v_deleted_member.created_at, now()
  );

  -- Update deleted_members record with restoration info
  UPDATE deleted_members
  SET restored_at = now(),
      restored_by = p_restored_by,
      restored_member_id = v_final_member_id,
      restored_reason = p_restore_reason
  WHERE id = p_deleted_member_id;

  RETURN TRUE;
EXCEPTION WHEN OTHERS THEN
  RAISE;
  RETURN FALSE;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_modified_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.verify_super_admin_password(pwd text)
 RETURNS boolean
 LANGUAGE plpgsql
AS $function$
BEGIN
  -- Replace with your own logic, e.g. check against an env var
  RETURN pwd = current_setting('app.super_admin_password', true);
END;
$function$
;

grant delete on table "public"."auth_tracker" to "anon";

grant insert on table "public"."auth_tracker" to "anon";

grant references on table "public"."auth_tracker" to "anon";

grant select on table "public"."auth_tracker" to "anon";

grant trigger on table "public"."auth_tracker" to "anon";

grant truncate on table "public"."auth_tracker" to "anon";

grant update on table "public"."auth_tracker" to "anon";

grant delete on table "public"."auth_tracker" to "authenticated";

grant insert on table "public"."auth_tracker" to "authenticated";

grant references on table "public"."auth_tracker" to "authenticated";

grant select on table "public"."auth_tracker" to "authenticated";

grant trigger on table "public"."auth_tracker" to "authenticated";

grant truncate on table "public"."auth_tracker" to "authenticated";

grant update on table "public"."auth_tracker" to "authenticated";

grant delete on table "public"."auth_tracker" to "service_role";

grant insert on table "public"."auth_tracker" to "service_role";

grant references on table "public"."auth_tracker" to "service_role";

grant select on table "public"."auth_tracker" to "service_role";

grant trigger on table "public"."auth_tracker" to "service_role";

grant truncate on table "public"."auth_tracker" to "service_role";

grant update on table "public"."auth_tracker" to "service_role";

grant delete on table "public"."churches" to "anon";

grant insert on table "public"."churches" to "anon";

grant references on table "public"."churches" to "anon";

grant select on table "public"."churches" to "anon";

grant trigger on table "public"."churches" to "anon";

grant truncate on table "public"."churches" to "anon";

grant update on table "public"."churches" to "anon";

grant delete on table "public"."churches" to "authenticated";

grant insert on table "public"."churches" to "authenticated";

grant references on table "public"."churches" to "authenticated";

grant select on table "public"."churches" to "authenticated";

grant trigger on table "public"."churches" to "authenticated";

grant truncate on table "public"."churches" to "authenticated";

grant update on table "public"."churches" to "authenticated";

grant delete on table "public"."churches" to "service_role";

grant insert on table "public"."churches" to "service_role";

grant references on table "public"."churches" to "service_role";

grant select on table "public"."churches" to "service_role";

grant trigger on table "public"."churches" to "service_role";

grant truncate on table "public"."churches" to "service_role";

grant update on table "public"."churches" to "service_role";

grant delete on table "public"."deleted_members" to "anon";

grant insert on table "public"."deleted_members" to "anon";

grant references on table "public"."deleted_members" to "anon";

grant select on table "public"."deleted_members" to "anon";

grant trigger on table "public"."deleted_members" to "anon";

grant truncate on table "public"."deleted_members" to "anon";

grant update on table "public"."deleted_members" to "anon";

grant delete on table "public"."deleted_members" to "authenticated";

grant insert on table "public"."deleted_members" to "authenticated";

grant references on table "public"."deleted_members" to "authenticated";

grant select on table "public"."deleted_members" to "authenticated";

grant trigger on table "public"."deleted_members" to "authenticated";

grant truncate on table "public"."deleted_members" to "authenticated";

grant update on table "public"."deleted_members" to "authenticated";

grant delete on table "public"."deleted_members" to "service_role";

grant insert on table "public"."deleted_members" to "service_role";

grant references on table "public"."deleted_members" to "service_role";

grant select on table "public"."deleted_members" to "service_role";

grant trigger on table "public"."deleted_members" to "service_role";

grant truncate on table "public"."deleted_members" to "service_role";

grant update on table "public"."deleted_members" to "service_role";

grant delete on table "public"."lookups" to "anon";

grant insert on table "public"."lookups" to "anon";

grant references on table "public"."lookups" to "anon";

grant select on table "public"."lookups" to "anon";

grant trigger on table "public"."lookups" to "anon";

grant truncate on table "public"."lookups" to "anon";

grant update on table "public"."lookups" to "anon";

grant delete on table "public"."lookups" to "authenticated";

grant insert on table "public"."lookups" to "authenticated";

grant references on table "public"."lookups" to "authenticated";

grant select on table "public"."lookups" to "authenticated";

grant trigger on table "public"."lookups" to "authenticated";

grant truncate on table "public"."lookups" to "authenticated";

grant update on table "public"."lookups" to "authenticated";

grant delete on table "public"."lookups" to "service_role";

grant insert on table "public"."lookups" to "service_role";

grant references on table "public"."lookups" to "service_role";

grant select on table "public"."lookups" to "service_role";

grant trigger on table "public"."lookups" to "service_role";

grant truncate on table "public"."lookups" to "service_role";

grant update on table "public"."lookups" to "service_role";

grant delete on table "public"."members" to "anon";

grant insert on table "public"."members" to "anon";

grant references on table "public"."members" to "anon";

grant select on table "public"."members" to "anon";

grant trigger on table "public"."members" to "anon";

grant truncate on table "public"."members" to "anon";

grant update on table "public"."members" to "anon";

grant delete on table "public"."members" to "authenticated";

grant insert on table "public"."members" to "authenticated";

grant references on table "public"."members" to "authenticated";

grant select on table "public"."members" to "authenticated";

grant trigger on table "public"."members" to "authenticated";

grant truncate on table "public"."members" to "authenticated";

grant update on table "public"."members" to "authenticated";

grant delete on table "public"."members" to "service_role";

grant insert on table "public"."members" to "service_role";

grant references on table "public"."members" to "service_role";

grant select on table "public"."members" to "service_role";

grant trigger on table "public"."members" to "service_role";

grant truncate on table "public"."members" to "service_role";

grant update on table "public"."members" to "service_role";

grant delete on table "public"."members_deleted" to "anon";

grant insert on table "public"."members_deleted" to "anon";

grant references on table "public"."members_deleted" to "anon";

grant select on table "public"."members_deleted" to "anon";

grant trigger on table "public"."members_deleted" to "anon";

grant truncate on table "public"."members_deleted" to "anon";

grant update on table "public"."members_deleted" to "anon";

grant delete on table "public"."members_deleted" to "authenticated";

grant insert on table "public"."members_deleted" to "authenticated";

grant references on table "public"."members_deleted" to "authenticated";

grant select on table "public"."members_deleted" to "authenticated";

grant trigger on table "public"."members_deleted" to "authenticated";

grant truncate on table "public"."members_deleted" to "authenticated";

grant update on table "public"."members_deleted" to "authenticated";

grant delete on table "public"."members_deleted" to "service_role";

grant insert on table "public"."members_deleted" to "service_role";

grant references on table "public"."members_deleted" to "service_role";

grant select on table "public"."members_deleted" to "service_role";

grant trigger on table "public"."members_deleted" to "service_role";

grant truncate on table "public"."members_deleted" to "service_role";

grant update on table "public"."members_deleted" to "service_role";

grant delete on table "public"."members_staging" to "anon";

grant insert on table "public"."members_staging" to "anon";

grant references on table "public"."members_staging" to "anon";

grant select on table "public"."members_staging" to "anon";

grant trigger on table "public"."members_staging" to "anon";

grant truncate on table "public"."members_staging" to "anon";

grant update on table "public"."members_staging" to "anon";

grant delete on table "public"."members_staging" to "authenticated";

grant insert on table "public"."members_staging" to "authenticated";

grant references on table "public"."members_staging" to "authenticated";

grant select on table "public"."members_staging" to "authenticated";

grant trigger on table "public"."members_staging" to "authenticated";

grant truncate on table "public"."members_staging" to "authenticated";

grant update on table "public"."members_staging" to "authenticated";

grant delete on table "public"."members_staging" to "service_role";

grant insert on table "public"."members_staging" to "service_role";

grant references on table "public"."members_staging" to "service_role";

grant select on table "public"."members_staging" to "service_role";

grant trigger on table "public"."members_staging" to "service_role";

grant truncate on table "public"."members_staging" to "service_role";

grant update on table "public"."members_staging" to "service_role";

grant delete on table "public"."migration_history" to "anon";

grant insert on table "public"."migration_history" to "anon";

grant references on table "public"."migration_history" to "anon";

grant select on table "public"."migration_history" to "anon";

grant trigger on table "public"."migration_history" to "anon";

grant truncate on table "public"."migration_history" to "anon";

grant update on table "public"."migration_history" to "anon";

grant delete on table "public"."migration_history" to "authenticated";

grant insert on table "public"."migration_history" to "authenticated";

grant references on table "public"."migration_history" to "authenticated";

grant select on table "public"."migration_history" to "authenticated";

grant trigger on table "public"."migration_history" to "authenticated";

grant truncate on table "public"."migration_history" to "authenticated";

grant update on table "public"."migration_history" to "authenticated";

grant delete on table "public"."migration_history" to "service_role";

grant insert on table "public"."migration_history" to "service_role";

grant references on table "public"."migration_history" to "service_role";

grant select on table "public"."migration_history" to "service_role";

grant trigger on table "public"."migration_history" to "service_role";

grant truncate on table "public"."migration_history" to "service_role";

grant update on table "public"."migration_history" to "service_role";

grant delete on table "public"."profiles" to "anon";

grant insert on table "public"."profiles" to "anon";

grant references on table "public"."profiles" to "anon";

grant select on table "public"."profiles" to "anon";

grant trigger on table "public"."profiles" to "anon";

grant truncate on table "public"."profiles" to "anon";

grant update on table "public"."profiles" to "anon";

grant delete on table "public"."profiles" to "authenticated";

grant insert on table "public"."profiles" to "authenticated";

grant references on table "public"."profiles" to "authenticated";

grant select on table "public"."profiles" to "authenticated";

grant trigger on table "public"."profiles" to "authenticated";

grant truncate on table "public"."profiles" to "authenticated";

grant update on table "public"."profiles" to "authenticated";

grant delete on table "public"."profiles" to "service_role";

grant insert on table "public"."profiles" to "service_role";

grant references on table "public"."profiles" to "service_role";

grant select on table "public"."profiles" to "service_role";

grant trigger on table "public"."profiles" to "service_role";

grant truncate on table "public"."profiles" to "service_role";

grant update on table "public"."profiles" to "service_role";


  create policy "churches_insert"
  on "public"."churches"
  as permissive
  for insert
  to public
with check ((public.get_my_role() = 'super_admin'::text));



  create policy "churches_select"
  on "public"."churches"
  as permissive
  for select
  to public
using (true);



  create policy "churches_update"
  on "public"."churches"
  as permissive
  for update
  to public
using ((public.get_my_role() = 'super_admin'::text));



  create policy "deleted_members_insert_admin"
  on "public"."deleted_members"
  as permissive
  for insert
  to public
with check ((auth.uid() IN ( SELECT profiles.id
   FROM public.profiles
  WHERE (profiles.role = ANY (ARRAY['super_admin'::text, 'admin'::text, 'admin1'::text])))));



  create policy "deleted_members_select_admin"
  on "public"."deleted_members"
  as permissive
  for select
  to public
using ((auth.uid() IN ( SELECT profiles.id
   FROM public.profiles
  WHERE (profiles.role = ANY (ARRAY['super_admin'::text, 'admin'::text, 'admin1'::text])))));



  create policy "deleted_members_update_admin"
  on "public"."deleted_members"
  as permissive
  for update
  to public
using ((auth.uid() IN ( SELECT profiles.id
   FROM public.profiles
  WHERE (profiles.role = ANY (ARRAY['super_admin'::text, 'admin'::text, 'admin1'::text])))));



  create policy "lookups_select"
  on "public"."lookups"
  as permissive
  for select
  to public
using ((auth.role() = 'authenticated'::text));



  create policy "members_delete"
  on "public"."members"
  as permissive
  for delete
  to public
using ((public.get_my_role() = ANY (ARRAY['super_admin'::text, 'admin1'::text, 'demo'::text])));



  create policy "members_insert"
  on "public"."members"
  as permissive
  for insert
  to public
with check ((public.get_my_role() = ANY (ARRAY['super_admin'::text, 'admin1'::text, 'admin'::text, 'demo'::text])));



  create policy "members_select"
  on "public"."members"
  as permissive
  for select
  to public
using ((auth.role() = 'authenticated'::text));



  create policy "members_update"
  on "public"."members"
  as permissive
  for update
  to public
using ((public.get_my_role() = ANY (ARRAY['super_admin'::text, 'admin1'::text, 'admin'::text, 'demo'::text])));



  create policy "Authenticated users can read members_deleted"
  on "public"."members_deleted"
  as permissive
  for select
  to authenticated
using (true);



  create policy "Super admin can delete members_deleted"
  on "public"."members_deleted"
  as permissive
  for delete
  to authenticated
using ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'super_admin'::text)))));



  create policy "Super admin can insert members_deleted"
  on "public"."members_deleted"
  as permissive
  for insert
  to authenticated
with check ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'super_admin'::text)))));



  create policy "Super admin can update members_deleted"
  on "public"."members_deleted"
  as permissive
  for update
  to authenticated
using ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'super_admin'::text)))));



  create policy "profiles_select_all_admin"
  on "public"."profiles"
  as permissive
  for select
  to public
using ((public.get_my_role() = 'super_admin'::text));



  create policy "profiles_select_own"
  on "public"."profiles"
  as permissive
  for select
  to public
using ((id = auth.uid()));



  create policy "profiles_update_own"
  on "public"."profiles"
  as permissive
  for update
  to public
using ((id = auth.uid()));



  create policy "super_admin_all"
  on "public"."profiles"
  as permissive
  for all
  to public
using (public.is_super_admin())
with check (public.is_super_admin());


CREATE TRIGGER churches_updated_at BEFORE UPDATE ON public.churches FOR EACH ROW EXECUTE FUNCTION public.update_modified_at();

CREATE TRIGGER members_modified_at BEFORE UPDATE ON public.members FOR EACH ROW EXECUTE FUNCTION public.update_modified_at();

CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_modified_at();

CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


  create policy "logos_insert"
  on "storage"."objects"
  as permissive
  for insert
  to public
with check (((bucket_id = 'church-logos'::text) AND (auth.role() = 'authenticated'::text) AND (public.get_my_role() = 'super_admin'::text)));



  create policy "logos_select"
  on "storage"."objects"
  as permissive
  for select
  to public
using ((bucket_id = 'church-logos'::text));



  create policy "logos_update"
  on "storage"."objects"
  as permissive
  for update
  to public
using (((bucket_id = 'church-logos'::text) AND (public.get_my_role() = 'super_admin'::text)));



  create policy "photos_delete"
  on "storage"."objects"
  as permissive
  for delete
  to public
using (((bucket_id = 'member-photos'::text) AND (public.get_my_role() = ANY (ARRAY['super_admin'::text, 'admin1'::text, 'demo'::text]))));



  create policy "photos_insert"
  on "storage"."objects"
  as permissive
  for insert
  to public
with check (((bucket_id = 'member-photos'::text) AND (auth.role() = 'authenticated'::text) AND (public.get_my_role() = ANY (ARRAY['super_admin'::text, 'admin1'::text, 'admin'::text, 'demo'::text]))));



  create policy "photos_select"
  on "storage"."objects"
  as permissive
  for select
  to public
using ((bucket_id = 'member-photos'::text));



  create policy "photos_update"
  on "storage"."objects"
  as permissive
  for update
  to public
using (((bucket_id = 'member-photos'::text) AND (public.get_my_role() = ANY (ARRAY['super_admin'::text, 'admin1'::text, 'admin'::text, 'demo'::text]))));



