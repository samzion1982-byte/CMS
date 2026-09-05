/**
 * Login logging + device registration + optional TrustGate approval helpers.
 *
 * Location comes only from the user-entered device/setup form —
 * we do NOT capture IP or browser geolocation (both are inaccurate).
 *
 * Capture rules:
 * - Known device ID  → write device fields into the login row at insert time
 * - Cache flush (new device ID, known user) → silently re-bind device, no popup
 * - Truly new user/device → show one-time setup popup, then tag the login
 *
 * TrustGate (optional): when churches.trustgate_enabled is true, login is gated
 * by the companion app + approved user_devices row (see App.jsx PublicRoute).
 */

import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from './supabase'

/* Insert a login row. Optional device fields are written atomically so we
   never race a separate tag against an older unclosed session. */
export async function insertLoginLog({
  userId, email, fullName, role, userAgent,
  deviceId, userName, location, org,
  loginType,
} = {}) {
  const payload = {
    user_id:    userId,
    email,
    full_name:  fullName  || null,
    user_role:  role      || null,
    user_agent: userAgent || null,
    device_id:  deviceId  || null,
    user_name:  userName  || null,
    location:   location  || null,
    org:        org       || null,
  }
  if (loginType) payload.login_type = loginType

  const { data, error } = await supabase
    .from('login_logs')
    .insert(payload)
    .select('id')
    .single()

  if (error) {
    console.error('[loginLogs] insert error:', error)
    return null
  }
  return data?.id ?? null
}

/* Stamp logout_at on the most recent open session for this user.
   No localStorage dependency — works even after browser data is cleared. */
export async function stampLogout(userId) {
  if (!userId) return

  const { data, error: fetchErr } = await supabase
    .from('login_logs')
    .select('id')
    .eq('user_id', userId)
    .is('logout_at', null)
    .order('login_at', { ascending: false })
    .limit(1)
    .single()

  if (fetchErr || !data?.id) return

  const { error } = await supabase
    .from('login_logs')
    .update({ logout_at: new Date().toISOString() })
    .eq('id', data.id)

  if (error) console.error('[loginLogs] logout stamp error:', error)
}

// ── Device registration ───────────────────────────────────────────────────────

function _setCookie(name, value, days) {
  const expires = new Date(Date.now() + days * 864e5).toUTCString()
  document.cookie = `${name}=${value}; expires=${expires}; path=/; SameSite=Strict`
}

function _getCookie(name) {
  const m = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'))
  return m ? m[1] : null
}

// Persists in both localStorage AND a 1-year cookie so the ID survives
// cache clears (cookies are only wiped when the user explicitly clears
// "Cookies and site data", not just "Cached images and files").
export function getOrCreateDeviceId() {
  const LS_KEY  = 'church_cms_device_id'
  const CK_NAME = 'cms_did'
  try {
    let id = localStorage.getItem(LS_KEY) || _getCookie(CK_NAME)
    if (!id) id = crypto.randomUUID()
    localStorage.setItem(LS_KEY, id)
    _setCookie(CK_NAME, id, 365)
    return id
  } catch {
    return _getCookie(CK_NAME) || crypto.randomUUID()
  }
}

export async function checkDeviceRegistered(deviceId) {
  if (!deviceId) return null
  const { data } = await supabase
    .from('user_devices')
    .select('org_name, user_name, location, avatar_name, device_name, approved, status, valid_upto')
    .eq('device_id', deviceId)
    .maybeSingle()
  return data || null
}

// Fallback lookup by user_id — used when the device_id was lost (cache/cookie
// cleared). If the user previously registered on any device, reuse that info.
export async function checkDeviceRegisteredByUser(userId) {
  if (!userId) return null
  const { data: recent } = await supabase
    .from('user_devices')
    .select('org_name, user_name, location, avatar_name')
    .eq('user_id', userId)
    .order('registered_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!recent) return null
  if (recent.avatar_name) return recent
  const { data: withAvatar } = await supabase
    .from('user_devices')
    .select('avatar_name')
    .eq('user_id', userId)
    .not('avatar_name', 'is', null)
    .limit(1)
    .maybeSingle()
  return { ...recent, avatar_name: withAvatar?.avatar_name || null }
}

export async function saveDevice({ deviceId, userId, orgName, userName, location, avatarName }) {
  let resolvedAvatar = avatarName || null

  if (!resolvedAvatar && userId) {
    const { data: existing } = await supabase
      .from('user_devices')
      .select('avatar_name')
      .eq('user_id', userId)
      .not('avatar_name', 'is', null)
      .limit(1)
      .maybeSingle()
    resolvedAvatar = existing?.avatar_name || null
  }

  const { data: existing } = await supabase
    .from('user_devices')
    .select('device_id, approved, status, valid_upto')
    .eq('device_id', deviceId)
    .maybeSingle()

  const payload = {
    device_id: deviceId,
    user_id: userId,
    org_name: orgName,
    user_name: userName,
    location,
    device_name: userName || null,
  }
  if (resolvedAvatar) payload.avatar_name = resolvedAvatar

  // Preserve TrustGate approval when rebinding soft device metadata
  if (existing?.approved) {
    payload.approved = true
    payload.status = 'approved'
  } else if (!existing) {
    payload.approved = false
    payload.status = 'pending'
    payload.requested_at = new Date().toISOString()
  }

  const { error } = await supabase
    .from('user_devices')
    .upsert(payload, { onConflict: 'device_id' })
  if (error) throw error

  if (userId && resolvedAvatar) {
    await supabase
      .from('user_devices')
      .update({ avatar_name: resolvedAvatar })
      .eq('user_id', userId)
      .neq('device_id', deviceId)
  }
}

/**
 * Tag the most recent untagged login (device_id IS NULL) for this user.
 * Used after the one-time setup popup / Edit Device Info.
 * Does NOT fall back to an older active session — that caused blank new rows
 * when the insert was still in flight.
 */
export async function tagLoginWithDevice(userId, { deviceId, userName, location, org }) {
  if (!userId) return
  const payload = { device_id: deviceId, user_name: userName, location, org }

  for (let i = 0; i < 8; i++) {
    if (i > 0) await new Promise(r => setTimeout(r, 500))

    const { data: untagged } = await supabase
      .from('login_logs')
      .select('id')
      .eq('user_id', userId)
      .is('device_id', null)
      .order('login_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (untagged?.id) {
      await supabase.from('login_logs').update(payload).eq('id', untagged.id)
      return true
    }
  }
  return false
}

/**
 * Update the current active session with device details (Edit Device Info).
 * Prefer untagged rows; otherwise update the open session.
 */
export async function updateActiveLoginDevice(userId, { deviceId, userName, location, org }) {
  if (!userId) return
  const payload = { device_id: deviceId, user_name: userName, location, org }

  const { data: untagged } = await supabase
    .from('login_logs')
    .select('id')
    .eq('user_id', userId)
    .is('device_id', null)
    .order('login_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (untagged?.id) {
    await supabase.from('login_logs').update(payload).eq('id', untagged.id)
    return
  }

  const { data: active } = await supabase
    .from('login_logs')
    .select('id')
    .eq('user_id', userId)
    .is('logout_at', null)
    .order('login_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (active?.id) {
    await supabase.from('login_logs').update(payload).eq('id', active.id)
  }
}

/* Admin read — paginated, filterable */
export async function getLoginLogs({ limit = 50, offset = 0, email = '', role = '' } = {}) {
  let q = supabase
    .from('login_logs')
    .select('*', { count: 'exact' })
    .order('login_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (email) q = q.ilike('email', `%${email}%`)
  if (role)  q = q.eq('user_role', role)

  const { data, count, error } = await q
  if (error) throw error
  return { data: data || [], count: count || 0 }
}

// ── TrustGate helpers ─────────────────────────────────────────────────────────

export async function isTrustGateEnabled() {
  try {
    const { data, error } = await supabase
      .from('churches')
      .select('trustgate_enabled')
      .limit(1)
      .maybeSingle()
    if (error) {
      console.warn('[isTrustGateEnabled]', error.message)
      return false
    }
    return Boolean(data?.trustgate_enabled)
  } catch (err) {
    console.warn('[isTrustGateEnabled]', err)
    return false
  }
}

export async function setTrustGateEnabled(enabled) {
  const { data: row, error: fetchErr } = await supabase
    .from('churches')
    .select('id')
    .limit(1)
    .maybeSingle()
  if (fetchErr) throw fetchErr
  if (!row?.id) throw new Error('No church record found.')

  const { error } = await supabase
    .from('churches')
    .update({
      trustgate_enabled: Boolean(enabled),
      updated_at: new Date().toISOString(),
    })
    .eq('id', row.id)
  if (error) throw error
  return Boolean(enabled)
}

function normalizeDeviceStatus(row) {
  if (!row) return { exists: false, approved: false, status: 'pending', row: null }

  let isApproved = row.approved === true || row.status === 'approved'

  if (isApproved && row.valid_upto) {
    const validUpto = new Date(row.valid_upto)
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    if (validUpto < today) {
      return { exists: true, approved: false, status: 'expired', row, isExpired: true }
    }
  }

  const status = row.status || (isApproved ? 'approved' : 'pending')
  return { exists: true, approved: isApproved, status, row, isExpired: false }
}

export async function getDeviceRegistrationStatus(deviceId) {
  if (!deviceId) return normalizeDeviceStatus(null)
  const { data, error } = await supabase
    .from('user_devices')
    .select('device_id, org_name, user_name, device_name, location, designation, approved, status, valid_upto, requested_at, approved_at, approved_by')
    .eq('device_id', deviceId)
    .maybeSingle()
  if (error || !data) return normalizeDeviceStatus(null)
  return normalizeDeviceStatus(data)
}

export async function requestDeviceApproval({
  deviceId, userId, orgName, deviceName, location, avatarName, designation,
}) {
  if (!deviceId) return null

  const supabaseUrl = SUPABASE_URL || import.meta.env.VITE_SUPABASE_URL || ''
  const anonKey = SUPABASE_ANON_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY || ''
  if (!supabaseUrl || !anonKey) {
    throw new Error('Supabase anonymous key is not configured.')
  }

  try {
    const checkUrl = `${supabaseUrl}/rest/v1/user_devices?device_id=eq.${encodeURIComponent(deviceId)}&select=device_id,approved,status`
    const checkResponse = await fetch(checkUrl, {
      method: 'GET',
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
      },
    })

    if (!checkResponse.ok) {
      const body = await checkResponse.text()
      throw new Error(`Device lookup failed: ${checkResponse.status} ${body}`)
    }

    const existingData = await checkResponse.json()
    const existing = Array.isArray(existingData) && existingData.length ? existingData[0] : null
    if (existing?.approved) {
      return existing
    }
    if (existing) {
      return existing
    }

    const payload = {
      device_id: deviceId,
      user_id: userId || null,
      org_name: orgName || null,
      user_name: deviceName || null,
      device_name: deviceName || null,
      location: location || null,
      designation: designation || null,
      avatar_name: avatarName || null,
      approved: false,
      status: 'pending',
      requested_at: new Date().toISOString(),
      approved_at: null,
      approved_by: null,
      valid_upto: null,
    }

    const response = await fetch(`${supabaseUrl}/rest/v1/user_devices`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
        Prefer: 'return=representation',
      },
      body: JSON.stringify(payload),
    })

    const responseText = await response.text()
    if (!response.ok) {
      throw new Error(`Approval request failed: ${response.status} ${responseText}`)
    }

    const data = responseText ? JSON.parse(responseText) : null
    return Array.isArray(data) ? data[0] : data
  } catch (error) {
    console.error('[requestDeviceApproval] Error:', error?.message || error)
    throw error
  }
}

export async function updateDeviceApproval({ deviceId, approved, approvedBy, validUpto }) {
  if (!deviceId) throw new Error('deviceId is required')
  const payload = {
    approved,
    status: approved ? 'approved' : 'rejected',
    approved_by: approvedBy || null,
    approved_at: approved ? new Date().toISOString() : null,
    valid_upto: validUpto || null,
  }

  const { data, error } = await supabase
    .from('user_devices')
    .update(payload)
    .eq('device_id', deviceId)
    .select('device_id, approved, status, valid_upto')
    .maybeSingle()

  if (error) throw error
  return data
}

export async function updateDeviceInfo({ deviceId, deviceName, location }) {
  if (!deviceId) throw new Error('deviceId is required')
  const payload = {}
  if (deviceName !== undefined) {
    payload.device_name = deviceName || null
    payload.user_name = deviceName || null
  }
  if (location !== undefined) payload.location = location || null
  if (!Object.keys(payload).length) return null

  const { data, error } = await supabase
    .from('user_devices')
    .update(payload)
    .eq('device_id', deviceId)
    .select('device_id, device_name, user_name, location')
    .maybeSingle()

  if (error) throw error
  return data
}

export async function listDevicesForAdmin() {
  const { data, error } = await supabase
    .from('user_devices')
    .select('device_id, user_id, org_name, user_name, device_name, location, designation, registered_at, approved, approved_by, approved_at, status, requested_at, valid_upto')
    .order('requested_at', { ascending: false })
  if (error) throw error
  return data || []
}

/** Remove non-approved device rows (legacy soft registrations + pending TrustGate requests). */
export async function clearPendingDevices() {
  const { data, error } = await supabase
    .from('user_devices')
    .delete()
    .eq('approved', false)
    .select('device_id')
  if (error) throw error
  return data?.length || 0
}
