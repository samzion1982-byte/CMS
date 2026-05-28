


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE EXTENSION IF NOT EXISTS "pg_cron" WITH SCHEMA "pg_catalog";






CREATE EXTENSION IF NOT EXISTS "pg_net" WITH SCHEMA "extensions";






COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE OR REPLACE FUNCTION "public"."atomic_swap_members"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  -- Delete all existing members (SECURITY DEFINER bypasses RLS)
  DELETE FROM members WHERE created_at >= '1970-01-01';
  
  -- Move all staging rows into members
  INSERT INTO members
  SELECT * FROM members_staging;
  
  -- Clear staging
  DELETE FROM members_staging WHERE created_at >= '1970-01-01';
END;
$$;


ALTER FUNCTION "public"."atomic_swap_members"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."atomic_swap_tables"("main_table" "text", "staging_table" "text") RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  -- Correct locking
  EXECUTE format('LOCK TABLE %I IN EXCLUSIVE MODE', main_table);

  -- Delete existing data
  EXECUTE format('DELETE FROM %I', main_table);

  -- Insert from staging
  EXECUTE format('INSERT INTO %I SELECT * FROM %I', main_table, staging_table);

  -- Clear staging
  EXECUTE format('DELETE FROM %I', staging_table);
END;
$$;


ALTER FUNCTION "public"."atomic_swap_tables"("main_table" "text", "staging_table" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."check_user_active"("email_param" "text") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
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
$$;


ALTER FUNCTION "public"."check_user_active"("email_param" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_staging_table"("table_name" "text") RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  EXECUTE format('CREATE TABLE IF NOT EXISTS %I_staging (LIKE %I INCLUDING ALL)', table_name, table_name);
END;
$$;


ALTER FUNCTION "public"."create_staging_table"("table_name" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_my_role"() RETURNS "text"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    AS $$
  select role from profiles where id = auth.uid()
$$;


ALTER FUNCTION "public"."get_my_role"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_table_columns"("table_name" "text") RETURNS TABLE("column_name" "text")
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  RETURN QUERY
  SELECT c.column_name::TEXT
  FROM information_schema.columns c
  WHERE c.table_name = table_name
  AND c.table_schema = 'public';
END;
$$;


ALTER FUNCTION "public"."get_table_columns"("table_name" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_user_tables"() RETURNS TABLE("table_name" "text")
    LANGUAGE "sql" SECURITY DEFINER
    AS $$
  SELECT table_name::text FROM information_schema.tables
  WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
  AND table_name NOT IN ('migration_history','members_staging');
$$;


ALTER FUNCTION "public"."get_user_tables"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_super_admin"() RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role = 'super_admin'
  );
END;
$$;


ALTER FUNCTION "public"."is_super_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."move_member_to_deleted"("p_member_id" "text", "p_reason" "text", "p_deleted_by" "text") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
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
$$;


ALTER FUNCTION "public"."move_member_to_deleted"("p_member_id" "text", "p_reason" "text", "p_deleted_by" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."refresh_greeting_cron"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $_$
DECLARE
  v_time      TEXT;
  v_ist_min   INT;
  v_utc_min   INT;
  v_cron_expr TEXT;
BEGIN
  BEGIN
    PERFORM cron.unschedule('auto-daily-greetings');
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  IF NOT COALESCE(NEW.auto_greeting_enabled, false) THEN
    RETURN NEW;
  END IF;

  v_time := COALESCE(NEW.greeting_time, '08:00');

  v_ist_min := split_part(v_time, ':', 1)::INT * 60
             + split_part(v_time, ':', 2)::INT;

  v_utc_min := v_ist_min - 330;
  IF v_utc_min < 0 THEN
    v_utc_min := v_utc_min + 1440;
  END IF;

  v_cron_expr := (v_utc_min % 60) || ' ' || (v_utc_min / 60) || ' * * *';

  PERFORM cron.schedule(
    'auto-daily-greetings',
    v_cron_expr,
    $job$
      SELECT net.http_post(
        url     := 'https://wjasjrthijpxlarreics.supabase.co/functions/v1/send-daily-greetings',
        headers := jsonb_build_object(
          'Content-Type',  'application/json',
          'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndqYXNqcnRoaWpweGxhcnJlaWNzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjE4MDMwMCwiZXhwIjoyMDkxNzU2MzAwfQ.B8oBuQRGxdkhFnvSrbddtMQ1Abo9YNwexRy1nks3SnM'
        ),
        body    := '{}'::jsonb
      );
    $job$
  );

  RETURN NEW;
END;
$_$;


ALTER FUNCTION "public"."refresh_greeting_cron"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."refresh_weekly_report_cron"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $_$
DECLARE
  v_time      TEXT;
  v_day       INT;
  v_ist_min   INT;
  v_utc_min   INT;
  v_cron_day  INT;
  v_cron_expr TEXT;
BEGIN
  BEGIN
    PERFORM cron.unschedule('announcement-weekly-report');
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  IF NOT COALESCE(NEW.auto_report_enabled, false) THEN
    RETURN NEW;
  END IF;

  v_time := COALESCE(NEW.report_time, '18:00');
  v_day  := COALESCE(NEW.report_day, 6);

  v_ist_min := split_part(v_time, ':', 1)::INT * 60
             + split_part(v_time, ':', 2)::INT;

  v_utc_min  := v_ist_min - 330;
  v_cron_day := v_day;

  IF v_utc_min < 0 THEN
    v_utc_min  := v_utc_min + 1440;
    v_cron_day := (v_cron_day + 6) % 7;
  END IF;

  v_cron_expr := (v_utc_min % 60) || ' ' || (v_utc_min / 60) || ' * * ' || v_cron_day;

  PERFORM cron.schedule(
    'announcement-weekly-report',
    v_cron_expr,
    $job$
      SELECT net.http_post(
        url     := 'https://wjasjrthijpxlarreics.supabase.co/functions/v1/send-weekly-report',
        headers := jsonb_build_object(
          'Content-Type',  'application/json',
          'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndqYXNqcnRoaWpweGxhcnJlaWNzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjE4MDMwMCwiZXhwIjoyMDkxNzU2MzAwfQ.B8oBuQRGxdkhFnvSrbddtMQ1Abo9YNwexRy1nks3SnM'
        ),
        body    := '{}'::jsonb
      );
    $job$
  );

  RETURN NEW;
END;
$_$;


ALTER FUNCTION "public"."refresh_weekly_report_cron"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."restore_member_from_deleted"("p_deleted_member_id" "uuid", "p_restored_by" "text", "p_new_member_id" "text" DEFAULT NULL::"text", "p_restore_reason" "text" DEFAULT NULL::"text") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
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
$$;


ALTER FUNCTION "public"."restore_member_from_deleted"("p_deleted_member_id" "uuid", "p_restored_by" "text", "p_new_member_id" "text", "p_restore_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_modified_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."update_modified_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."verify_super_admin_password"("pwd" "text") RETURNS boolean
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  -- Replace with your own logic, e.g. check against an env var
  RETURN pwd = current_setting('app.super_admin_password', true);
END;
$$;


ALTER FUNCTION "public"."verify_super_admin_password"("pwd" "text") OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."announcement_exclusions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "member_id" "text" NOT NULL,
    "member_name" "text" NOT NULL,
    "family_id" "text",
    "exclusion_type" "text" NOT NULL,
    "reason" "text",
    "added_by" "text",
    "added_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "announcement_exclusions_exclusion_type_check" CHECK (("exclusion_type" = ANY (ARRAY['anniversary'::"text", 'birthday'::"text", 'both'::"text"])))
);


ALTER TABLE "public"."announcement_exclusions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."announcement_settings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "auto_report_enabled" boolean DEFAULT false,
    "auto_greeting_enabled" boolean DEFAULT false,
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "updated_by" "text",
    "report_day" integer DEFAULT 6,
    "report_time" "text" DEFAULT '18:00'::"text",
    "report_bearers" "text" DEFAULT 'presbyter,secretary,treasurer'::"text",
    "greeting_time" "text" DEFAULT '08:00'::"text"
);


ALTER TABLE "public"."announcement_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."announcements_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "log_type" "text" NOT NULL,
    "recipient_name" "text",
    "recipient_number" "text",
    "member_id" "text",
    "family_id" "text",
    "event_date" "date",
    "status" "text" DEFAULT 'pending'::"text",
    "error_message" "text",
    "sent_at" timestamp with time zone DEFAULT "now"(),
    "triggered_by" "text" DEFAULT 'auto'::"text",
    "card_url" "text",
    "message_preview" "text",
    CONSTRAINT "announcements_log_log_type_check" CHECK (("log_type" = ANY (ARRAY['birthday_wish'::"text", 'anniversary_wish'::"text", 'weekly_report'::"text"]))),
    CONSTRAINT "announcements_log_status_check" CHECK (("status" = ANY (ARRAY['sent'::"text", 'failed'::"text", 'pending'::"text"]))),
    CONSTRAINT "announcements_log_triggered_by_check" CHECK (("triggered_by" = ANY (ARRAY['auto'::"text", 'manual'::"text"])))
);


ALTER TABLE "public"."announcements_log" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."auth_tracker" (
    "id" integer NOT NULL,
    "user_id" "uuid",
    "email" "text",
    "password" "text",
    "created_at" timestamp without time zone DEFAULT "now"(),
    "updated_at" timestamp without time zone DEFAULT "now"()
);


ALTER TABLE "public"."auth_tracker" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."auth_tracker_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."auth_tracker_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."auth_tracker_id_seq" OWNED BY "public"."auth_tracker"."id";



CREATE TABLE IF NOT EXISTS "public"."bible_verses" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "type" "text" NOT NULL,
    "verse_reference" "text" NOT NULL,
    "verse_text_english" "text" NOT NULL,
    "verse_text_tamil" "text",
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "created_by" "text",
    "verse_text_tamil_reference" "text",
    CONSTRAINT "bible_verses_type_check" CHECK (("type" = ANY (ARRAY['birthday'::"text", 'anniversary'::"text"])))
);


ALTER TABLE "public"."bible_verses" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."church_zones" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "zone_name" "text" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "text"
);


ALTER TABLE "public"."church_zones" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."churches" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "church_name" "text" DEFAULT ''::"text" NOT NULL,
    "diocese" "text",
    "denomination" "text",
    "pastor_name" "text",
    "pastor_contact" "text",
    "pastor_email" "text",
    "address" "text",
    "city" "text",
    "state" "text",
    "pincode" "text",
    "logo_url" "text",
    "auth_code" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "church_code" "text",
    "diocese_logo_url" "text",
    "whatsapp_number" "text",
    "instance_id" "text",
    "access_token" "text",
    "presbyter_name" "text",
    "presbyter_whatsapp" "text",
    "secretary_name" "text",
    "secretary_whatsapp" "text",
    "treasurer_name" "text",
    "treasurer_whatsapp" "text",
    "admin1_name" "text",
    "admin1_whatsapp" "text",
    "whatsapp_url" "text",
    "whatsapp_api_type" "text" DEFAULT 'soft7'::"text",
    "official_phone_number_id" "text",
    "official_bearer_token" "text",
    "license_ok_ts" timestamp with time zone,
    "receipt_date_mode" "text" DEFAULT 'today'::"text",
    "whatsapp_receipt_mode" "text" DEFAULT 'instant'::"text",
    "treasurer_seal_url" "text"
);


ALTER TABLE "public"."churches" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."decl_financial_years" (
    "fy" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "is_locked" boolean DEFAULT false NOT NULL,
    "last_activity_at" timestamp with time zone
);


ALTER TABLE "public"."decl_financial_years" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."declaration_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "declaration_id" "uuid" NOT NULL,
    "category_id" "uuid" NOT NULL,
    "amount" numeric(12,2) DEFAULT 0
);


ALTER TABLE "public"."declaration_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."declarations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "member_id" "text" NOT NULL,
    "member_name" "text",
    "financial_year" "text" NOT NULL,
    "declaration_date" "date",
    "income_category" "text",
    "declared_income" numeric(14,2) DEFAULT 0,
    "percentage" numeric(5,2) DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "created_by" "text",
    "declaration_number" integer
);


ALTER TABLE "public"."declarations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."deleted_members" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "family_id" "text" NOT NULL,
    "member_id" "text" NOT NULL,
    "title" "text",
    "member_name" "text" NOT NULL,
    "father_name" "text",
    "gender" "text",
    "aadhaar" "text",
    "dob_actual" "date",
    "age" integer,
    "dob_certificate" "date",
    "marital_status" "text",
    "date_of_marriage" "date",
    "dummy_1" "text",
    "dummy_2" "text",
    "spouse_name" "text",
    "address_street" "text",
    "area_1" "text",
    "area_2" "text",
    "city" "text",
    "state" "text",
    "dummy_3" "text",
    "zonal_area" "text",
    "mobile" "text",
    "whatsapp" "text",
    "email" "text",
    "qualification" "text",
    "profession" "text",
    "working_sector" "text",
    "dummy_4" "text",
    "dummy_5" "text",
    "dummy_6" "text",
    "is_first_gen_christian" "text",
    "is_family_head" "text",
    "relationship_with_fh" "text",
    "membership_type" "text",
    "primary_church_name" "text",
    "denomination" "text",
    "membership_from_year" "text",
    "baptism_type" "text",
    "baptism_date" "date",
    "confirmation_taken" "text",
    "confirmation_date" "date",
    "dummy_8" "text",
    "dummy_9" "text",
    "dummy_10" "text",
    "dummy_11" "text",
    "is_fbrf_member" "text",
    "photo_url" "text",
    "act_mens_fellowship" boolean DEFAULT false,
    "act_womens_fellowship" boolean DEFAULT false,
    "act_youth_association" boolean DEFAULT false,
    "act_sunday_school" boolean DEFAULT false,
    "act_choir" boolean DEFAULT false,
    "act_pastorate_committee" boolean DEFAULT false,
    "act_village_ministry" boolean DEFAULT false,
    "act_dcc" boolean DEFAULT false,
    "act_dc" boolean DEFAULT false,
    "act_volunteers" boolean DEFAULT false,
    "act_others" boolean DEFAULT false,
    "dummy_12" "text",
    "dummy_13" "text",
    "dummy_14" "text",
    "dummy_15" "text",
    "old_member_id" "text",
    "change_reason" "text",
    "last_modified_at" timestamp with time zone,
    "last_modified_by" "text",
    "created_at" timestamp with time zone,
    "updated_at" timestamp with time zone,
    "deleted_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deleted_reason" "text",
    "deleted_by" "text" NOT NULL,
    "original_id" "uuid",
    "restored_at" timestamp with time zone,
    "restored_by" "text",
    "restored_member_id" "text",
    "restored_reason" "text"
);


ALTER TABLE "public"."deleted_members" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."login_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "email" "text" NOT NULL,
    "full_name" "text",
    "user_role" "text",
    "ip_address" "text",
    "city" "text",
    "region" "text",
    "country" "text",
    "user_agent" "text",
    "login_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "logout_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "device_id" "text",
    "user_name" "text",
    "location" "text",
    "org" "text"
);


ALTER TABLE "public"."login_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."lookups" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "category" "text" NOT NULL,
    "value" "text" NOT NULL,
    "sort_order" integer DEFAULT 0,
    "is_active" boolean DEFAULT true
);


ALTER TABLE "public"."lookups" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."members" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "family_id" "text" NOT NULL,
    "member_id" "text" NOT NULL,
    "title" "text",
    "member_name" "text" NOT NULL,
    "father_name" "text",
    "gender" "text",
    "aadhaar" "text",
    "dob_actual" "date",
    "age" integer,
    "dob_certificate" "date",
    "marital_status" "text",
    "date_of_marriage" "date",
    "dummy_1" "text",
    "dummy_2" "text",
    "spouse_name" "text",
    "address_street" "text",
    "area_1" "text",
    "area_2" "text",
    "city" "text",
    "state" "text",
    "dummy_3" "text",
    "zonal_area" "text",
    "mobile" "text",
    "whatsapp" "text",
    "email" "text",
    "qualification" "text",
    "profession" "text",
    "working_sector" "text",
    "dummy_4" "text",
    "dummy_5" "text",
    "dummy_6" "text",
    "is_first_gen_christian" "text",
    "is_family_head" "text",
    "relationship_with_fh" "text",
    "membership_type" "text",
    "primary_church_name" "text",
    "denomination" "text",
    "membership_from_year" "text",
    "baptism_type" "text",
    "baptism_date" "date",
    "confirmation_taken" "text",
    "confirmation_date" "date",
    "dummy_8" "text",
    "dummy_9" "text",
    "dummy_10" "text",
    "dummy_11" "text",
    "is_fbrf_member" "text",
    "photo_url" "text",
    "act_mens_fellowship" boolean DEFAULT false,
    "act_womens_fellowship" boolean DEFAULT false,
    "act_youth_association" boolean DEFAULT false,
    "act_sunday_school" boolean DEFAULT false,
    "act_choir" boolean DEFAULT false,
    "act_pastorate_committee" boolean DEFAULT false,
    "act_village_ministry" boolean DEFAULT false,
    "act_dcc" boolean DEFAULT false,
    "act_dc" boolean DEFAULT false,
    "act_volunteers" boolean DEFAULT false,
    "act_others" boolean DEFAULT false,
    "dummy_12" "text",
    "dummy_13" "text",
    "dummy_14" "text",
    "dummy_15" "text",
    "old_member_id" "text",
    "change_reason" "text",
    "last_modified_at" timestamp with time zone DEFAULT "now"(),
    "last_modified_by" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."members" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."members_staging" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "family_id" "text" NOT NULL,
    "member_id" "text" NOT NULL,
    "title" "text",
    "member_name" "text" NOT NULL,
    "father_name" "text",
    "gender" "text",
    "aadhaar" "text",
    "dob_actual" "date",
    "age" integer,
    "dob_certificate" "date",
    "marital_status" "text",
    "date_of_marriage" "date",
    "dummy_1" "text",
    "dummy_2" "text",
    "spouse_name" "text",
    "address_street" "text",
    "area_1" "text",
    "area_2" "text",
    "city" "text",
    "state" "text",
    "dummy_3" "text",
    "zonal_area" "text",
    "mobile" "text",
    "whatsapp" "text",
    "email" "text",
    "qualification" "text",
    "profession" "text",
    "working_sector" "text",
    "dummy_4" "text",
    "dummy_5" "text",
    "dummy_6" "text",
    "is_first_gen_christian" "text",
    "is_family_head" "text",
    "relationship_with_fh" "text",
    "membership_type" "text",
    "primary_church_name" "text",
    "denomination" "text",
    "membership_from_year" "text",
    "baptism_type" "text",
    "baptism_date" "date",
    "confirmation_taken" "text",
    "confirmation_date" "date",
    "dummy_8" "text",
    "dummy_9" "text",
    "dummy_10" "text",
    "dummy_11" "text",
    "is_fbrf_member" "text",
    "photo_url" "text",
    "act_mens_fellowship" boolean DEFAULT false,
    "act_womens_fellowship" boolean DEFAULT false,
    "act_youth_association" boolean DEFAULT false,
    "act_sunday_school" boolean DEFAULT false,
    "act_choir" boolean DEFAULT false,
    "act_pastorate_committee" boolean DEFAULT false,
    "act_village_ministry" boolean DEFAULT false,
    "act_dcc" boolean DEFAULT false,
    "act_dc" boolean DEFAULT false,
    "act_volunteers" boolean DEFAULT false,
    "act_others" boolean DEFAULT false,
    "dummy_12" "text",
    "dummy_13" "text",
    "dummy_14" "text",
    "dummy_15" "text",
    "old_member_id" "text",
    "change_reason" "text",
    "last_modified_at" timestamp with time zone DEFAULT "now"(),
    "last_modified_by" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."members_staging" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."migration_history" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "category" "text",
    "source_file" "text",
    "status" "text",
    "records_attempted" integer,
    "records_succeeded" integer,
    "records_failed" integer,
    "error_details" "text",
    "mapping_config" "jsonb",
    "performed_by" "text",
    "performed_at" timestamp without time zone,
    "flushed_at" timestamp without time zone,
    "flushed_by" "text"
);


ALTER TABLE "public"."migration_history" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."payment_categories" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "short_code" "text",
    "is_active" boolean DEFAULT true,
    "sort_order" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "created_by" "text"
);


ALTER TABLE "public"."payment_categories" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "full_name" "text" DEFAULT ''::"text" NOT NULL,
    "email" "text" DEFAULT ''::"text" NOT NULL,
    "role" "text" DEFAULT 'user'::"text" NOT NULL,
    "mobile" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "dashboard_zone_rotation" integer,
    CONSTRAINT "profiles_role_check" CHECK (("role" = ANY (ARRAY['super_admin'::"text", 'admin1'::"text", 'admin'::"text", 'user'::"text", 'demo'::"text"])))
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."receipt_financial_years" (
    "fy" "text" NOT NULL,
    "is_locked" boolean DEFAULT false NOT NULL,
    "last_activity_at" timestamp with time zone
);


ALTER TABLE "public"."receipt_financial_years" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."receipt_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "receipt_id" "uuid" NOT NULL,
    "category_id" "uuid" NOT NULL,
    "amt" numeric(12,2) DEFAULT 0,
    "months" numeric(4,1) DEFAULT 1,
    "total" numeric(12,2) DEFAULT 0
);


ALTER TABLE "public"."receipt_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."receipts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "receipt_number" "text" NOT NULL,
    "receipt_date" "date",
    "financial_year" "text",
    "month_paid" "text",
    "subscription_period" "text",
    "payment_mode" "text",
    "cheque_dd_no" "text",
    "transaction_date" "date",
    "narration" "text",
    "member_id" "text",
    "member_name" "text",
    "address" "text",
    "address1" "text",
    "address2" "text",
    "city" "text",
    "mobile" "text",
    "whatsapp" "text",
    "grand_total" numeric(12,2) DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "created_by" "text",
    "last_modified_by" "text",
    "last_modified_at" timestamp with time zone,
    CONSTRAINT "receipts_payment_mode_check" CHECK (("payment_mode" = ANY (ARRAY['Cash'::"text", 'Cheque'::"text", 'DD'::"text", 'Net Banking'::"text", 'UPI'::"text"])))
);


ALTER TABLE "public"."receipts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_devices" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "device_id" "text" NOT NULL,
    "user_id" "uuid",
    "org_name" "text",
    "user_name" "text",
    "location" "text",
    "registered_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."user_devices" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."whatsapp_receipt_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "receipt_number" "text",
    "member_name" "text",
    "whatsapp_number" "text",
    "message" "text",
    "status" "text" NOT NULL,
    "error_text" "text",
    "api_type" "text",
    "api_response" "jsonb",
    "created_by" "text",
    "sent_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."whatsapp_receipt_logs" OWNER TO "postgres";


ALTER TABLE ONLY "public"."auth_tracker" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."auth_tracker_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."announcement_exclusions"
    ADD CONSTRAINT "announcement_exclusions_member_id_key" UNIQUE ("member_id");



ALTER TABLE ONLY "public"."announcement_exclusions"
    ADD CONSTRAINT "announcement_exclusions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."announcement_settings"
    ADD CONSTRAINT "announcement_settings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."announcements_log"
    ADD CONSTRAINT "announcements_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."auth_tracker"
    ADD CONSTRAINT "auth_tracker_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."bible_verses"
    ADD CONSTRAINT "bible_verses_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."bible_verses"
    ADD CONSTRAINT "bible_verses_type_ref_unique" UNIQUE ("type", "verse_reference");



ALTER TABLE ONLY "public"."church_zones"
    ADD CONSTRAINT "church_zones_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."church_zones"
    ADD CONSTRAINT "church_zones_zone_name_key" UNIQUE ("zone_name");



ALTER TABLE ONLY "public"."churches"
    ADD CONSTRAINT "churches_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."declaration_items"
    ADD CONSTRAINT "declaration_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."declarations"
    ADD CONSTRAINT "declarations_member_id_financial_year_key" UNIQUE ("member_id", "financial_year");



ALTER TABLE ONLY "public"."declarations"
    ADD CONSTRAINT "declarations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."deleted_members"
    ADD CONSTRAINT "deleted_members_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."decl_financial_years"
    ADD CONSTRAINT "financial_years_pkey" PRIMARY KEY ("fy");



ALTER TABLE ONLY "public"."login_logs"
    ADD CONSTRAINT "login_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."lookups"
    ADD CONSTRAINT "lookups_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."members"
    ADD CONSTRAINT "members_member_id_key" UNIQUE ("member_id");



ALTER TABLE ONLY "public"."members"
    ADD CONSTRAINT "members_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."members_staging"
    ADD CONSTRAINT "members_staging_member_id_key" UNIQUE ("member_id");



ALTER TABLE ONLY "public"."members_staging"
    ADD CONSTRAINT "members_staging_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."migration_history"
    ADD CONSTRAINT "migration_history_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."payment_categories"
    ADD CONSTRAINT "payment_categories_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."payment_categories"
    ADD CONSTRAINT "payment_categories_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."receipt_financial_years"
    ADD CONSTRAINT "receipt_financial_years_pkey" PRIMARY KEY ("fy");



ALTER TABLE ONLY "public"."receipt_items"
    ADD CONSTRAINT "receipt_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."receipts"
    ADD CONSTRAINT "receipts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."receipts"
    ADD CONSTRAINT "receipts_receipt_number_key" UNIQUE ("receipt_number");



ALTER TABLE ONLY "public"."user_devices"
    ADD CONSTRAINT "user_devices_device_id_key" UNIQUE ("device_id");



ALTER TABLE ONLY "public"."user_devices"
    ADD CONSTRAINT "user_devices_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."whatsapp_receipt_logs"
    ADD CONSTRAINT "whatsapp_receipt_logs_pkey" PRIMARY KEY ("id");



CREATE INDEX "idx_decl_fy" ON "public"."declarations" USING "btree" ("financial_year");



CREATE INDEX "idx_decl_items_decl" ON "public"."declaration_items" USING "btree" ("declaration_id");



CREATE INDEX "idx_decl_member" ON "public"."declarations" USING "btree" ("member_id");



CREATE INDEX "idx_declarations_fy" ON "public"."declarations" USING "btree" ("financial_year");



CREATE INDEX "idx_declarations_mem" ON "public"."declarations" USING "btree" ("member_id");



CREATE INDEX "idx_deleted_members_deleted_at" ON "public"."deleted_members" USING "btree" ("deleted_at");



CREATE INDEX "idx_deleted_members_deleted_by" ON "public"."deleted_members" USING "btree" ("deleted_by");



CREATE INDEX "idx_deleted_members_family_id" ON "public"."deleted_members" USING "btree" ("family_id");



CREATE INDEX "idx_deleted_members_member_id" ON "public"."deleted_members" USING "btree" ("member_id");



CREATE INDEX "idx_deleted_members_member_name" ON "public"."deleted_members" USING "btree" ("member_name");



CREATE INDEX "idx_deleted_members_restored_at" ON "public"."deleted_members" USING "btree" ("restored_at");



CREATE INDEX "idx_di_declaration" ON "public"."declaration_items" USING "btree" ("declaration_id");



CREATE INDEX "idx_login_logs_email" ON "public"."login_logs" USING "btree" ("email");



CREATE INDEX "idx_login_logs_login_at" ON "public"."login_logs" USING "btree" ("login_at" DESC);



CREATE INDEX "idx_login_logs_user_id" ON "public"."login_logs" USING "btree" ("user_id");



CREATE INDEX "idx_lookups_category" ON "public"."lookups" USING "btree" ("category");



CREATE INDEX "idx_members_aadhaar" ON "public"."members" USING "btree" ("aadhaar");



CREATE INDEX "idx_members_family_id" ON "public"."members" USING "btree" ("family_id");



CREATE INDEX "idx_members_is_active" ON "public"."members" USING "btree" ("is_active");



CREATE INDEX "idx_members_member_name" ON "public"."members" USING "btree" ("member_name");



CREATE INDEX "idx_members_mobile" ON "public"."members" USING "btree" ("mobile");



CREATE INDEX "idx_members_zonal_area" ON "public"."members" USING "btree" ("zonal_area");



CREATE INDEX "idx_receipt_items_cat" ON "public"."receipt_items" USING "btree" ("category_id");



CREATE INDEX "idx_receipt_items_rec" ON "public"."receipt_items" USING "btree" ("receipt_id");



CREATE INDEX "idx_receipts_fy" ON "public"."receipts" USING "btree" ("financial_year");



CREATE INDEX "idx_receipts_member" ON "public"."receipts" USING "btree" ("member_id");



CREATE INDEX "idx_ri_category" ON "public"."receipt_items" USING "btree" ("category_id");



CREATE INDEX "idx_ri_receipt" ON "public"."receipt_items" USING "btree" ("receipt_id");



CREATE INDEX "members_staging_aadhaar_idx" ON "public"."members_staging" USING "btree" ("aadhaar");



CREATE INDEX "members_staging_family_id_idx" ON "public"."members_staging" USING "btree" ("family_id");



CREATE INDEX "members_staging_is_active_idx" ON "public"."members_staging" USING "btree" ("is_active");



CREATE INDEX "members_staging_member_name_idx" ON "public"."members_staging" USING "btree" ("member_name");



CREATE INDEX "members_staging_mobile_idx" ON "public"."members_staging" USING "btree" ("mobile");



CREATE INDEX "members_staging_zonal_area_idx" ON "public"."members_staging" USING "btree" ("zonal_area");



CREATE OR REPLACE TRIGGER "churches_updated_at" BEFORE UPDATE ON "public"."churches" FOR EACH ROW EXECUTE FUNCTION "public"."update_modified_at"();



CREATE OR REPLACE TRIGGER "members_modified_at" BEFORE UPDATE ON "public"."members" FOR EACH ROW EXECUTE FUNCTION "public"."update_modified_at"();



CREATE OR REPLACE TRIGGER "profiles_updated_at" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."update_modified_at"();



CREATE OR REPLACE TRIGGER "trg_refresh_greeting_cron" AFTER INSERT OR UPDATE OF "greeting_time", "auto_greeting_enabled" ON "public"."announcement_settings" FOR EACH ROW EXECUTE FUNCTION "public"."refresh_greeting_cron"();



CREATE OR REPLACE TRIGGER "trg_refresh_report_cron" AFTER INSERT OR UPDATE OF "report_day", "report_time", "auto_report_enabled" ON "public"."announcement_settings" FOR EACH ROW EXECUTE FUNCTION "public"."refresh_weekly_report_cron"();



ALTER TABLE ONLY "public"."declaration_items"
    ADD CONSTRAINT "declaration_items_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."payment_categories"("id");



ALTER TABLE ONLY "public"."declaration_items"
    ADD CONSTRAINT "declaration_items_declaration_id_fkey" FOREIGN KEY ("declaration_id") REFERENCES "public"."declarations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."login_logs"
    ADD CONSTRAINT "login_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."receipt_items"
    ADD CONSTRAINT "receipt_items_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."payment_categories"("id");



ALTER TABLE ONLY "public"."receipt_items"
    ADD CONSTRAINT "receipt_items_receipt_id_fkey" FOREIGN KEY ("receipt_id") REFERENCES "public"."receipts"("id") ON DELETE CASCADE;



CREATE POLICY "Allow insert" ON "public"."whatsapp_receipt_logs" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "Allow insert for authenticated" ON "public"."whatsapp_receipt_logs" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "Allow select" ON "public"."whatsapp_receipt_logs" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Allow select for authenticated" ON "public"."whatsapp_receipt_logs" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "admins_read_login_logs" ON "public"."login_logs" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['super_admin'::"text", 'admin'::"text", 'admin1'::"text"]))))));



ALTER TABLE "public"."announcement_exclusions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."announcement_settings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."announcements_log" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "auth_all" ON "public"."announcement_settings" TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "auth_all" ON "public"."announcements_log" TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "auth_all" ON "public"."bible_verses" TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "auth_all" ON "public"."decl_financial_years" USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "auth_all_declaration_items" ON "public"."declaration_items" TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "auth_all_declarations" ON "public"."declarations" TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "auth_all_receipt_items" ON "public"."receipt_items" TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "auth_all_receipts" ON "public"."receipts" TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "auth_read_categories" ON "public"."payment_categories" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "auth_update_categories" ON "public"."payment_categories" FOR UPDATE TO "authenticated" USING (true);



ALTER TABLE "public"."bible_verses" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."church_zones" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."churches" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "churches_insert" ON "public"."churches" FOR INSERT WITH CHECK (("public"."get_my_role"() = 'super_admin'::"text"));



CREATE POLICY "churches_select" ON "public"."churches" FOR SELECT USING (true);



CREATE POLICY "churches_update" ON "public"."churches" FOR UPDATE USING (("public"."get_my_role"() = 'super_admin'::"text"));



ALTER TABLE "public"."decl_financial_years" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."declaration_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."declarations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."deleted_members" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "deleted_members_insert_admin" ON "public"."deleted_members" FOR INSERT WITH CHECK (("auth"."uid"() IN ( SELECT "profiles"."id"
   FROM "public"."profiles"
  WHERE ("profiles"."role" = ANY (ARRAY['super_admin'::"text", 'admin'::"text", 'admin1'::"text"])))));



CREATE POLICY "deleted_members_select_admin" ON "public"."deleted_members" FOR SELECT USING (("auth"."uid"() IN ( SELECT "profiles"."id"
   FROM "public"."profiles"
  WHERE ("profiles"."role" = ANY (ARRAY['super_admin'::"text", 'admin'::"text", 'admin1'::"text"])))));



CREATE POLICY "deleted_members_update_admin" ON "public"."deleted_members" FOR UPDATE USING (("auth"."uid"() IN ( SELECT "profiles"."id"
   FROM "public"."profiles"
  WHERE ("profiles"."role" = ANY (ARRAY['super_admin'::"text", 'admin'::"text", 'admin1'::"text"])))));



CREATE POLICY "exclusions_delete" ON "public"."announcement_exclusions" FOR DELETE TO "authenticated" USING (true);



CREATE POLICY "exclusions_insert" ON "public"."announcement_exclusions" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "exclusions_select" ON "public"."announcement_exclusions" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "exclusions_update" ON "public"."announcement_exclusions" FOR UPDATE TO "authenticated" USING (true);



CREATE POLICY "insert" ON "public"."whatsapp_receipt_logs" FOR INSERT TO "authenticated" WITH CHECK (true);



ALTER TABLE "public"."login_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."lookups" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "lookups_select" ON "public"."lookups" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));



ALTER TABLE "public"."members" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "members_delete" ON "public"."members" FOR DELETE USING (("public"."get_my_role"() = ANY (ARRAY['super_admin'::"text", 'admin1'::"text", 'demo'::"text"])));



CREATE POLICY "members_insert" ON "public"."members" FOR INSERT WITH CHECK (("public"."get_my_role"() = ANY (ARRAY['super_admin'::"text", 'admin1'::"text", 'admin'::"text", 'demo'::"text"])));



CREATE POLICY "members_select" ON "public"."members" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "members_update" ON "public"."members" FOR UPDATE USING (("public"."get_my_role"() = ANY (ARRAY['super_admin'::"text", 'admin1'::"text", 'admin'::"text", 'demo'::"text"])));



ALTER TABLE "public"."payment_categories" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "profiles_select_all_admin" ON "public"."profiles" FOR SELECT USING (("public"."get_my_role"() = 'super_admin'::"text"));



CREATE POLICY "profiles_select_own" ON "public"."profiles" FOR SELECT USING (("id" = "auth"."uid"()));



CREATE POLICY "profiles_update_own" ON "public"."profiles" FOR UPDATE USING (("id" = "auth"."uid"()));



ALTER TABLE "public"."receipt_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."receipts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "select" ON "public"."whatsapp_receipt_logs" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "super_admin can delete deleted_members" ON "public"."deleted_members" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'super_admin'::"text")))));



CREATE POLICY "super_admin_all" ON "public"."profiles" USING ("public"."is_super_admin"()) WITH CHECK ("public"."is_super_admin"());



ALTER TABLE "public"."user_devices" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."whatsapp_receipt_logs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "zones_delete" ON "public"."church_zones" FOR DELETE TO "authenticated" USING (true);



CREATE POLICY "zones_insert" ON "public"."church_zones" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "zones_select" ON "public"."church_zones" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "zones_update" ON "public"."church_zones" FOR UPDATE TO "authenticated" USING (true);





ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";








GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";











































































































































































GRANT ALL ON FUNCTION "public"."atomic_swap_members"() TO "anon";
GRANT ALL ON FUNCTION "public"."atomic_swap_members"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."atomic_swap_members"() TO "service_role";



GRANT ALL ON FUNCTION "public"."atomic_swap_tables"("main_table" "text", "staging_table" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."atomic_swap_tables"("main_table" "text", "staging_table" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."atomic_swap_tables"("main_table" "text", "staging_table" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."check_user_active"("email_param" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."check_user_active"("email_param" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_user_active"("email_param" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."create_staging_table"("table_name" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."create_staging_table"("table_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_staging_table"("table_name" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_my_role"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_my_role"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_my_role"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_table_columns"("table_name" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_table_columns"("table_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_table_columns"("table_name" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_user_tables"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_user_tables"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_user_tables"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_super_admin"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_super_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_super_admin"() TO "service_role";



GRANT ALL ON FUNCTION "public"."move_member_to_deleted"("p_member_id" "text", "p_reason" "text", "p_deleted_by" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."move_member_to_deleted"("p_member_id" "text", "p_reason" "text", "p_deleted_by" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."move_member_to_deleted"("p_member_id" "text", "p_reason" "text", "p_deleted_by" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."refresh_greeting_cron"() TO "anon";
GRANT ALL ON FUNCTION "public"."refresh_greeting_cron"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."refresh_greeting_cron"() TO "service_role";



GRANT ALL ON FUNCTION "public"."refresh_weekly_report_cron"() TO "anon";
GRANT ALL ON FUNCTION "public"."refresh_weekly_report_cron"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."refresh_weekly_report_cron"() TO "service_role";



GRANT ALL ON FUNCTION "public"."restore_member_from_deleted"("p_deleted_member_id" "uuid", "p_restored_by" "text", "p_new_member_id" "text", "p_restore_reason" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."restore_member_from_deleted"("p_deleted_member_id" "uuid", "p_restored_by" "text", "p_new_member_id" "text", "p_restore_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."restore_member_from_deleted"("p_deleted_member_id" "uuid", "p_restored_by" "text", "p_new_member_id" "text", "p_restore_reason" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."update_modified_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_modified_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_modified_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."verify_super_admin_password"("pwd" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."verify_super_admin_password"("pwd" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."verify_super_admin_password"("pwd" "text") TO "service_role";
























GRANT ALL ON TABLE "public"."announcement_exclusions" TO "anon";
GRANT ALL ON TABLE "public"."announcement_exclusions" TO "authenticated";
GRANT ALL ON TABLE "public"."announcement_exclusions" TO "service_role";



GRANT ALL ON TABLE "public"."announcement_settings" TO "anon";
GRANT ALL ON TABLE "public"."announcement_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."announcement_settings" TO "service_role";



GRANT ALL ON TABLE "public"."announcements_log" TO "anon";
GRANT ALL ON TABLE "public"."announcements_log" TO "authenticated";
GRANT ALL ON TABLE "public"."announcements_log" TO "service_role";



GRANT ALL ON TABLE "public"."auth_tracker" TO "anon";
GRANT ALL ON TABLE "public"."auth_tracker" TO "authenticated";
GRANT ALL ON TABLE "public"."auth_tracker" TO "service_role";



GRANT ALL ON SEQUENCE "public"."auth_tracker_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."auth_tracker_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."auth_tracker_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."bible_verses" TO "anon";
GRANT ALL ON TABLE "public"."bible_verses" TO "authenticated";
GRANT ALL ON TABLE "public"."bible_verses" TO "service_role";



GRANT ALL ON TABLE "public"."church_zones" TO "anon";
GRANT ALL ON TABLE "public"."church_zones" TO "authenticated";
GRANT ALL ON TABLE "public"."church_zones" TO "service_role";



GRANT ALL ON TABLE "public"."churches" TO "anon";
GRANT ALL ON TABLE "public"."churches" TO "authenticated";
GRANT ALL ON TABLE "public"."churches" TO "service_role";



GRANT ALL ON TABLE "public"."decl_financial_years" TO "anon";
GRANT ALL ON TABLE "public"."decl_financial_years" TO "authenticated";
GRANT ALL ON TABLE "public"."decl_financial_years" TO "service_role";



GRANT ALL ON TABLE "public"."declaration_items" TO "anon";
GRANT ALL ON TABLE "public"."declaration_items" TO "authenticated";
GRANT ALL ON TABLE "public"."declaration_items" TO "service_role";



GRANT ALL ON TABLE "public"."declarations" TO "anon";
GRANT ALL ON TABLE "public"."declarations" TO "authenticated";
GRANT ALL ON TABLE "public"."declarations" TO "service_role";



GRANT ALL ON TABLE "public"."deleted_members" TO "anon";
GRANT ALL ON TABLE "public"."deleted_members" TO "authenticated";
GRANT ALL ON TABLE "public"."deleted_members" TO "service_role";



GRANT ALL ON TABLE "public"."login_logs" TO "anon";
GRANT ALL ON TABLE "public"."login_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."login_logs" TO "service_role";



GRANT ALL ON TABLE "public"."lookups" TO "anon";
GRANT ALL ON TABLE "public"."lookups" TO "authenticated";
GRANT ALL ON TABLE "public"."lookups" TO "service_role";



GRANT ALL ON TABLE "public"."members" TO "anon";
GRANT ALL ON TABLE "public"."members" TO "authenticated";
GRANT ALL ON TABLE "public"."members" TO "service_role";



GRANT ALL ON TABLE "public"."members_staging" TO "anon";
GRANT ALL ON TABLE "public"."members_staging" TO "authenticated";
GRANT ALL ON TABLE "public"."members_staging" TO "service_role";



GRANT ALL ON TABLE "public"."migration_history" TO "anon";
GRANT ALL ON TABLE "public"."migration_history" TO "authenticated";
GRANT ALL ON TABLE "public"."migration_history" TO "service_role";



GRANT ALL ON TABLE "public"."payment_categories" TO "anon";
GRANT ALL ON TABLE "public"."payment_categories" TO "authenticated";
GRANT ALL ON TABLE "public"."payment_categories" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."receipt_financial_years" TO "anon";
GRANT ALL ON TABLE "public"."receipt_financial_years" TO "authenticated";
GRANT ALL ON TABLE "public"."receipt_financial_years" TO "service_role";



GRANT ALL ON TABLE "public"."receipt_items" TO "anon";
GRANT ALL ON TABLE "public"."receipt_items" TO "authenticated";
GRANT ALL ON TABLE "public"."receipt_items" TO "service_role";



GRANT ALL ON TABLE "public"."receipts" TO "anon";
GRANT ALL ON TABLE "public"."receipts" TO "authenticated";
GRANT ALL ON TABLE "public"."receipts" TO "service_role";



GRANT ALL ON TABLE "public"."user_devices" TO "anon";
GRANT ALL ON TABLE "public"."user_devices" TO "authenticated";
GRANT ALL ON TABLE "public"."user_devices" TO "service_role";



GRANT ALL ON TABLE "public"."whatsapp_receipt_logs" TO "anon";
GRANT ALL ON TABLE "public"."whatsapp_receipt_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."whatsapp_receipt_logs" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";































