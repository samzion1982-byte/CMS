/* ═══════════════════════════════════════════════════════════════
   memberDelete.js — Delete & Restore member operations
   ═══════════════════════════════════════════════════════════════ */

import { supabase } from './supabase'

/**
 * Delete a member (soft delete to deleted_members table)
 * Moves member data and photo to archive
 */
export async function deleteMember(memberId, reason, userEmail) {
  try {
    if (!memberId || !reason || !userEmail) {
      throw new Error('Missing required parameters: memberId, reason, or userEmail')
    }

    console.log('[deleteMember] Starting deletion for:', { memberId, reason, userEmail })

    // 1. Call the database function to move member to deleted_members
    const { data, error: dbError } = await supabase.rpc(
      'move_member_to_deleted',
      {
        p_member_id: memberId,
        p_reason: reason,
        p_deleted_by: userEmail
      }
    )

    if (dbError) {
      console.error('[deleteMember] RPC error:', dbError)
      throw new Error(`Database error: ${dbError.message || JSON.stringify(dbError)}`)
    }

    console.log('[deleteMember] RPC success, result:', data)

    // 2. Move photo from active to deleted folder
    console.log('[deleteMember] Starting photo move...')
    const photoResult = await movePhotoToDeleted(memberId)
    console.log('[deleteMember] Photo move result:', photoResult)

    return { success: true, message: 'Member deleted successfully' }
  } catch (err) {
    console.error('[deleteMember] Error:', err)
    throw err
  }
}

/**
 * Restore a deleted member back to active members
 * Optionally allows changing the member ID
 */
export async function restoreMember(deletedMemberId, newMemberId, userEmail, restoreReason) {
  try {
    // Ensure required NOT NULL columns are populated for imported records
    const now = new Date().toISOString()
    await supabase.from('deleted_members')
      .update({ created_at: now, last_modified_at: now })
      .eq('id', deletedMemberId)
      .is('created_at', null)

    // 1. Call the database function to restore member
    const { data, error: dbError } = await supabase.rpc(
      'restore_member_from_deleted',
      {
        p_deleted_member_id: deletedMemberId,
        p_restored_by: userEmail,
        p_new_member_id: newMemberId || null,
        p_restore_reason: restoreReason || null,
      }
    )

    if (dbError) throw new Error(`Database error: ${dbError.message}`)

    // 2. Move photo back from deleted to active folder
    const memberIdToUse = newMemberId || (await getOriginalMemberId(deletedMemberId))
    await movePhotoToActive(memberIdToUse)

    return { success: true, message: 'Member restored successfully' }
  } catch (err) {
    console.error('Error restoring member:', err)
    throw err
  }
}

/**
 * Move member photo from Active Members to Deleted Members in storage
 */
async function movePhotoToDeleted(memberId) {
  try {
    // Check if photo exists in active folder
    const activePath = `member-photos/active/${memberId}.jpg`
    
    const { data: fileExists } = await supabase.storage
      .from('member-photos')
      .list('active', { search: `${memberId}.jpg` })

    if (!fileExists || fileExists.length === 0) {
      // No photo to move
      return { success: true, moved: false }
    }

    // Download the active photo
    const { data: photoData, error: downloadError } = await supabase.storage
      .from('member-photos')
      .download(`active/${memberId}.jpg`)

    if (downloadError) throw downloadError

    const deletedPath = `member-photos/deleted/${memberId}.jpg`

    // Check if photo already exists in deleted folder
    const { data: deletedExists } = await supabase.storage
      .from('member-photos')
      .list('deleted', { search: `${memberId}.jpg` })

    if (deletedExists && deletedExists.length > 0) {
      // Photo already exists - user will be prompted to overwrite
      // For now, we'll overwrite
      await supabase.storage
        .from('member-photos')
        .remove([deletedPath])
    }

    // Upload to deleted folder
    const { error: uploadError } = await supabase.storage
      .from('member-photos')
      .upload(deletedPath, photoData, { upsert: true })

    if (uploadError) throw uploadError

    // Delete from active folder
    await supabase.storage
      .from('member-photos')
      .remove([activePath])

    return { success: true, moved: true }
  } catch (err) {
    console.warn(`Could not move photo for ${memberId}:`, err.message)
    // Don't throw - photo move is not critical
    return { success: false, moved: false, error: err.message }
  }
}

/**
 * Move member photo from Deleted Members back to Active Members in storage
 */
async function movePhotoToActive(memberId) {
  try {
    const deletedPath = `member-photos/deleted/${memberId}.jpg`
    
    // Check if photo exists in deleted folder
    const { data: fileExists } = await supabase.storage
      .from('member-photos')
      .list('deleted', { search: `${memberId}.jpg` })

    if (!fileExists || fileExists.length === 0) {
      // No photo to move back
      return { success: true, moved: false }
    }

    // Download the deleted photo
    const { data: photoData, error: downloadError } = await supabase.storage
      .from('member-photos')
      .download(deletedPath)

    if (downloadError) throw downloadError

    const activePath = `member-photos/active/${memberId}.jpg`

    // Check if photo already exists in active folder
    const { data: activeExists } = await supabase.storage
      .from('member-photos')
      .list('active', { search: `${memberId}.jpg` })

    if (activeExists && activeExists.length > 0) {
      // Photo already exists in active - remove it first
      await supabase.storage
        .from('member-photos')
        .remove([activePath])
    }

    // Upload to active folder
    const { error: uploadError } = await supabase.storage
      .from('member-photos')
      .upload(activePath, photoData, { upsert: true })

    if (uploadError) throw uploadError

    // Delete from deleted folder
    await supabase.storage
      .from('member-photos')
      .remove([deletedPath])

    return { success: true, moved: true }
  } catch (err) {
    console.warn(`Could not move photo back for ${memberId}:`, err.message)
    return { success: false, moved: false, error: err.message }
  }
}

/**
 * Get the original member ID from deleted_members record
 */
async function getOriginalMemberId(deletedMemberId) {
  const { data, error } = await supabase
    .from('deleted_members')
    .select('member_id')
    .eq('id', deletedMemberId)
    .single()

  if (error) throw error
  return data?.member_id
}

/**
 * Fetch deleted members (paginated)
 */
export async function fetchDeletedMembers(page = 0, limit = 50, searchVal = '') {
  try {
    let query = supabase
      .from('deleted_members')
      .select(
        'id,family_id,member_id,member_name,gender,dob_actual,zonal_area,mobile,deleted_at,deleted_reason,deleted_by',
        { count: 'exact' }
      )
      .is('restored_at', null)
      .order('deleted_at', { ascending: false })
      .range(page * limit, page * limit + limit - 1)

    if (searchVal.trim()) {
      query = query.or(
        `member_id.ilike.%${searchVal}%,member_name.ilike.%${searchVal}%,mobile.ilike.%${searchVal}%`
      )
    }

    const { data, count, error } = await query
    if (error) throw error

    // Resolve deleted_by email → display name via profiles
    const emails = [...new Set((data || []).map(r => r.deleted_by).filter(Boolean))]
    let nameMap = {}
    if (emails.length) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('email,full_name')
        .in('email', emails)
      ;(profiles || []).forEach(p => { if (p.email) nameMap[p.email] = p.full_name || p.email })
    }
    const enriched = (data || []).map(r => ({
      ...r,
      deleted_by_display: nameMap[r.deleted_by] || r.deleted_by,
    }))

    console.log('[fetchDeletedMembers] returned rows', enriched.length, 'count', count)
    return { data: enriched, total: count || 0 }
  } catch (err) {
    console.error('Error fetching deleted members:', err)
    throw err
  }
}

/**
 * Get full deleted member record
 */
export async function getDeletedMemberDetails(deletedMemberId) {
  try {
    const { data, error } = await supabase
      .from('deleted_members')
      .select('*')
      .eq('id', deletedMemberId)
      .single()

    if (error) throw error
    return data
  } catch (err) {
    console.error('Error fetching deleted member details:', err)
    throw err
  }
}

/**
 * Check if a member ID is available (not in use)
 * @param {string} memberId
 * @param {string|null} excludeDeletedId - UUID of a deleted_members row to skip (used when restoring with original ID)
 */
export async function checkMemberIdAvailable(memberId, excludeDeletedId = null) {
  try {
    // Check in active members
    const { data: activeData, error: activeError } = await supabase
      .from('members')
      .select('id')
      .eq('member_id', memberId)
      .single()

    if (activeError && activeError.code !== 'PGRST116') throw activeError // 116 = not found
    if (activeData) return false

    // Check in deleted members — skip the record we're about to restore
    let deletedQuery = supabase
      .from('deleted_members')
      .select('id')
      .eq('member_id', memberId)
      .is('restored_at', null)

    if (excludeDeletedId) deletedQuery = deletedQuery.neq('id', excludeDeletedId)

    const { data: deletedRows, error: deletedError } = await deletedQuery
    if (deletedError) throw deletedError
    if (deletedRows && deletedRows.length > 0) return false

    return true
  } catch (err) {
    console.error('Error checking member ID availability:', err)
    throw err
  }
}
