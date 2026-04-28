-- ============================================================
-- MIGRATION: Add deleted_members table for soft delete archive
-- Run this after the main SETUP_ALL_IN_ONE.sql
-- ============================================================

-- ── CREATE DELETED_MEMBERS TABLE (same structure as members) ──

CREATE TABLE deleted_members (
  id              uuid primary key default gen_random_uuid(),

  -- Identity (A–B)
  family_id       text not null,
  member_id       text not null,

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

  -- Original member audit (from members table)
  last_modified_at  timestamptz,
  last_modified_by  text,
  created_at        timestamptz,
  updated_at        timestamptz,

  -- ═════ DELETION METADATA (NEW) ═════
  deleted_at        timestamptz not null default now(),
  deleted_reason    text,
  deleted_by        text not null,  -- Email of admin who deleted
  original_id       uuid,           -- Reference to original member record (optional)
  
  -- Audit
  restored_at       timestamptz,    -- NULL if not restored; set when restored
  restored_by       text,           -- Email of admin who restored
  restored_member_id text,          -- New member_id if changed during restore
  restored_reason   text            -- Reason for restoration
);

CREATE INDEX idx_deleted_members_family_id   ON deleted_members(family_id);
CREATE INDEX idx_deleted_members_member_id   ON deleted_members(member_id);
CREATE INDEX idx_deleted_members_member_name ON deleted_members(member_name);
CREATE INDEX idx_deleted_members_deleted_at  ON deleted_members(deleted_at);
CREATE INDEX idx_deleted_members_deleted_by  ON deleted_members(deleted_by);
CREATE INDEX idx_deleted_members_restored_at ON deleted_members(restored_at);

-- ── RLS POLICIES FOR deleted_members ──

ALTER TABLE deleted_members ENABLE ROW LEVEL SECURITY;

-- Super Admin & Admin can view all deleted members
CREATE POLICY "deleted_members_select_admin"
  ON deleted_members FOR SELECT
  USING (
    auth.uid() IN (
      SELECT id FROM profiles WHERE role IN ('super_admin', 'admin', 'admin1')
    )
  );

-- Super Admin & Admin can update (restore)
CREATE POLICY "deleted_members_update_admin"
  ON deleted_members FOR UPDATE
  USING (
    auth.uid() IN (
      SELECT id FROM profiles WHERE role IN ('super_admin', 'admin', 'admin1')
    )
  );

-- Super Admin & Admin can insert (via delete trigger)
CREATE POLICY "deleted_members_insert_admin"
  ON deleted_members FOR INSERT
  WITH CHECK (
    auth.uid() IN (
      SELECT id FROM profiles WHERE role IN ('super_admin', 'admin', 'admin1')
    )
  );

-- ── UTILITY FUNCTION: Move member to deleted_members ──

CREATE OR REPLACE FUNCTION move_member_to_deleted(
  p_member_id TEXT,
  p_reason TEXT,
  p_deleted_by TEXT
)
RETURNS BOOLEAN AS $$
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── UTILITY FUNCTION: Restore member from deleted_members ──

CREATE OR REPLACE FUNCTION restore_member_from_deleted(
  p_deleted_member_id uuid,
  p_restored_by TEXT,
  p_new_member_id TEXT DEFAULT NULL,
  p_restore_reason TEXT DEFAULT NULL
)
RETURNS BOOLEAN AS $$
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
$$ LANGUAGE plpgsql SECURITY DEFINER;
