/**
 * Login logging + device registration.
 *
 * Location comes only from the user-entered device/setup form —
 * we do NOT capture IP or browser geolocation (both are inaccurate).
 */

import { adminSupabase } from './supabase'

/* Insert a new login row (device/location filled later by the setup form) */
export async function insertLoginLog({ userId, email, fullName, role, userAgent }) {
  const { data, error } = await adminSupabase
    .from('login_logs')
    .insert({
      user_id:    userId,
      email,
      full_name:  fullName  || null,
      user_role:  role      || null,
      user_agent: userAgent || null,
    })
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

  const { data, error: fetchErr } = await adminSupabase
    .from('login_logs')
    .select('id')
    .eq('user_id', userId)
    .is('logout_at', null)
    .order('login_at', { ascending: false })
    .limit(1)
    .single()

  if (fetchErr || !data?.id) return

  const { error } = await adminSupabase
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
  const { data } = await adminSupabase
    .from('user_devices')
    .select('org_name, user_name, location, avatar_name')
    .eq('device_id', deviceId)
    .maybeSingle()
  return data || null
}

// Fallback lookup by user_id — used when the device_id was lost (cache/cookie
// cleared). If the user previously registered on any device, reuse that info
// and silently re-associate the new device_id.
export async function checkDeviceRegisteredByUser(userId) {
  if (!userId) return null
  // Prefer the most-recent row that has avatar_name set; fall back to overall most-recent
  const { data: recent } = await adminSupabase
    .from('user_devices')
    .select('org_name, user_name, location, avatar_name')
    .eq('user_id', userId)
    .order('registered_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!recent) return null
  if (recent.avatar_name) return recent
  // Most-recent row has no avatar_name — look for it in any other row
  const { data: withAvatar } = await adminSupabase
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

  // If blank, carry forward whatever is already stored for this user
  if (!resolvedAvatar && userId) {
    const { data: existing } = await adminSupabase
      .from('user_devices')
      .select('avatar_name')
      .eq('user_id', userId)
      .not('avatar_name', 'is', null)
      .limit(1)
      .maybeSingle()
    resolvedAvatar = existing?.avatar_name || null
  }

  const payload = { device_id: deviceId, user_id: userId, org_name: orgName, user_name: userName, location }
  if (resolvedAvatar) payload.avatar_name = resolvedAvatar

  const { error } = await adminSupabase
    .from('user_devices')
    .upsert(payload, { onConflict: 'device_id' })
  if (error) throw error

  // Sync to every other row so future device changes always carry the value
  if (userId && resolvedAvatar) {
    await adminSupabase
      .from('user_devices')
      .update({ avatar_name: resolvedAvatar })
      .eq('user_id', userId)
      .neq('device_id', deviceId)
  }
}

/* Tag the most recent untagged login log for this user with device details.
   Retries up to 6×1 s to handle fire-and-forget insert timing. */
export async function tagLoginWithDevice(userId, { deviceId, userName, location, org }) {
  if (!userId) return
  for (let i = 0; i < 6; i++) {
    if (i > 0) await new Promise(r => setTimeout(r, 1000))
    const { data } = await adminSupabase
      .from('login_logs')
      .select('id')
      .eq('user_id', userId)
      .is('device_id', null)
      .order('login_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (data?.id) {
      await adminSupabase
        .from('login_logs')
        .update({ device_id: deviceId, user_name: userName, location, org })
        .eq('id', data.id)
      return
    }
  }
}

/* Admin read — paginated, filterable */
export async function getLoginLogs({ limit = 50, offset = 0, email = '', role = '' } = {}) {
  let q = adminSupabase
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
