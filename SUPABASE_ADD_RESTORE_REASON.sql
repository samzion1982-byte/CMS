-- Add restored_reason to deleted_members and update restore function
-- Run this in Supabase SQL Editor.

ALTER TABLE deleted_members
ADD COLUMN IF NOT EXISTS restored_reason text;

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
