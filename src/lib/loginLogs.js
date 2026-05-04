import { adminSupabase } from './supabase'

const LS_KEY        = id => `login_log_id_${id}`
const GEO_CACHE_KEY = 'church_cms_geo_cache'
const GEO_TTL_MS    = 30 * 24 * 60 * 60 * 1000 // 30 days

function readGeoCache() {
  try {
    const raw = localStorage.getItem(GEO_CACHE_KEY)
    if (!raw) return null
    const obj = JSON.parse(raw)
    if (Date.now() - obj.cachedAt > GEO_TTL_MS) { localStorage.removeItem(GEO_CACHE_KEY); return null }
    return obj
  } catch { return null }
}

function writeGeoCache(loc) {
  try { localStorage.setItem(GEO_CACHE_KEY, JSON.stringify({ ...loc, cachedAt: Date.now() })) } catch { /* ignore */ }
}

/* GPS via navigator.geolocation → reverse-geocoded with Nominatim (OpenStreetMap).
   Browser remembers the permission grant, so the popup appears only once per device. */
async function fetchByGPS() {
  if (!navigator.geolocation) return null
  const coords = await new Promise(resolve => {
    navigator.geolocation.getCurrentPosition(
      p  => resolve(p.coords),
      () => resolve(null),
      { timeout: 8000, maximumAge: 0 }
    )
  })
  if (!coords) return null

  try {
    const controller = new AbortController()
    const t = setTimeout(() => controller.abort(), 5000)
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${coords.latitude}&lon=${coords.longitude}&format=json`,
      { signal: controller.signal, headers: { 'Accept-Language': 'en' } }
    )
    clearTimeout(t)
    if (!res.ok) return null
    const d = await res.json()
    const a = d.address || {}
    return {
      ipAddress: null,
      city:    a.city || a.town || a.village || a.county || null,
      region:  a.state || null,
      country: a.country || null,
    }
  } catch { return null }
}

/* IP-based fallback chain: freeipapi.com → ipinfo.io → ipapi.co */
async function fetchByIP() {
  const tryFetch = async (url, map) => {
    const controller = new AbortController()
    const t = setTimeout(() => controller.abort(), 4000)
    try {
      const res = await fetch(url, { signal: controller.signal })
      clearTimeout(t)
      if (!res.ok) return null
      return map(await res.json())
    } catch { clearTimeout(t); return null }
  }

  return (
    await tryFetch('https://freeipapi.com/api/json', d =>
      d.ipAddress ? { ipAddress: d.ipAddress, city: d.cityName || null, region: d.regionName || null, country: d.countryName || null } : null
    ) ||
    await tryFetch('https://ipinfo.io/json', d =>
      d.ip ? { ipAddress: d.ip, city: d.city || null, region: d.region || null, country: d.country || null } : null
    ) ||
    await tryFetch('https://ipapi.co/json/', d => ({
      ipAddress: d.ip || null, city: d.city || null, region: d.region || null, country: d.country_name || null,
    })) ||
    null
  )
}

/* Main export — returns cached result instantly on repeat logins.
   First login on a device: tries GPS (one-time browser permission prompt),
   falls back to IP geolocation, caches the winner for 30 days. */
export async function fetchGeoLocation() {
  const cached = readGeoCache()
  if (cached) return cached

  const loc = (await fetchByGPS()) || (await fetchByIP()) || {}
  if (loc.city || loc.region || loc.country) writeGeoCache(loc)
  return loc
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
