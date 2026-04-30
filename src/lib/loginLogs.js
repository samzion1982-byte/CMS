import { adminSupabase } from './supabase'

const LS_KEY = id => `login_log_id_${id}`

/* Fetch approximate location from the browser's public IP.
   Tries ipwho.is first (better regional accuracy), falls back to ipapi.co. */
export async function fetchGeoLocation() {
  const tryFetch = async (url, map) => {
    const controller = new AbortController()
    const t = setTimeout(() => controller.abort(), 3500)
    try {
      const res = await fetch(url, { signal: controller.signal })
      clearTimeout(t)
      if (!res.ok) return null
      return map(await res.json())
    } catch {
      clearTimeout(t)
      return null
    }
  }

  return (
    await tryFetch('https://ipwho.is/', d => ({
      ipAddress: d.ip          || null,
      city:      d.city        || null,
      region:    d.region      || null,
      country:   d.country     || null,
    })) ||
    await tryFetch('https://ipapi.co/json/', d => ({
      ipAddress: d.ip          || null,
      city:      d.city        || null,
      region:    d.region      || null,
      country:   d.country_name || null,
    })) ||
    {}
  )
}

/* Insert a new login row and persist the id to localStorage */
export async function insertLoginLog({ userId, email, fullName, role, ipAddress, city, region, country, userAgent }) {
  const { data, error } = await adminSupabase
    .from('login_logs')
    .insert({
      user_id:    userId,
      email,
      full_name:  fullName  || null,
      user_role:  role      || null,
      ip_address: ipAddress || null,
      city:       city      || null,
      region:     region    || null,
      country:    country   || null,
      user_agent: userAgent || null,
    })
    .select('id')
    .single()

  if (error) {
    console.error('[loginLogs] insert error:', error)
    return null
  }

  if (data?.id && userId) {
    try { localStorage.setItem(LS_KEY(userId), data.id) } catch { /* ignore */ }
  }
  return data?.id ?? null
}

/* Stamp logout_at on the stored log row then clear localStorage */
export async function stampLogout(userId) {
  if (!userId) return
  let logId
  try { logId = localStorage.getItem(LS_KEY(userId)) } catch { /* ignore */ }
  if (!logId) return

  const { error } = await adminSupabase
    .from('login_logs')
    .update({ logout_at: new Date().toISOString() })
    .eq('id', logId)

  if (error) console.error('[loginLogs] logout stamp error:', error)
  try { localStorage.removeItem(LS_KEY(userId)) } catch { /* ignore */ }
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
