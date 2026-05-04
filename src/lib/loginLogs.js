import { adminSupabase } from './supabase'

const LS_KEY         = id => `login_log_id_${id}`
const GEO_CACHE_KEY  = 'church_cms_geo_v2'        // v2 clears old stale cache
const GPS_TTL_MS     = 30 * 24 * 60 * 60 * 1000  // GPS result: 30 days
const IP_TTL_MS      =      24 * 60 * 60 * 1000  // IP result:   1 day

// Pre-fetch started on login page mount so result is ready before sign-in
let _warmPromise = null

function readGeoCache() {
  try {
    const raw = localStorage.getItem(GEO_CACHE_KEY)
    if (!raw) return null
    const obj = JSON.parse(raw)
    const ttl = (obj.source === 'gps' || obj.source === 'manual') ? GPS_TTL_MS : IP_TTL_MS
    if (Date.now() - obj.cachedAt > ttl) { localStorage.removeItem(GEO_CACHE_KEY); return null }
    return obj
  } catch { return null }
}

function writeGeoCache(loc) {
  try { localStorage.setItem(GEO_CACHE_KEY, JSON.stringify({ ...loc, cachedAt: Date.now() })) } catch { /* ignore */ }
}

/* GPS → Nominatim reverse geocode. Browser remembers permission; prompt appears once. */
async function fetchByGPS() {
  if (!navigator?.geolocation) return null
  const coords = await new Promise(resolve =>
    navigator.geolocation.getCurrentPosition(p => resolve(p.coords), () => resolve(null), { timeout: 7000, maximumAge: 60000 })
  )
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
    const { address: a = {} } = await res.json()
    return {
      source:    'gps',
      ipAddress: null,
      city:      a.city || a.town || a.village || a.county || null,
      region:    a.state || null,
      country:   a.country || null,
    }
  } catch { return null }
}

/* Single IP lookup with 4 s timeout */
async function ipFetch(url, map) {
  const c = new AbortController()
  const t = setTimeout(() => c.abort(), 4000)
  try {
    const res = await fetch(url, { signal: c.signal })
    clearTimeout(t)
    if (!res.ok) return null
    const d = await res.json()
    const r = map(d)
    return r?.city || r?.region ? { source: 'ip', ...r } : null
  } catch { clearTimeout(t); return null }
}

/* Run all IP providers in parallel — take whichever resolves first with valid data */
async function fetchByIP() {
  const race = Promise.any([
    ipFetch('https://get.geojs.io/v1/ip/geo.json',   d => ({ ipAddress: d.ip || null, city: d.city || null, region: d.region || null, country: d.country || null })),
    ipFetch('https://freeipapi.com/api/json',          d => d.ipAddress ? { ipAddress: d.ipAddress, city: d.cityName || null, region: d.regionName || null, country: d.countryName || null } : null),
    ipFetch('https://ipinfo.io/json',                  d => d.ip ? { ipAddress: d.ip, city: d.city || null, region: d.region || null, country: d.country || null } : null),
    ipFetch('https://ipapi.co/json/',                  d => ({ ipAddress: d.ip || null, city: d.city || null, region: d.region || null, country: d.country_name || null })),
  ]).catch(() => null)
  return race
}

/* Call on login page mount — starts GPS + IP in parallel while the user
   types credentials. Result is ready (or nearly so) by sign-in time. */
export function warmGeoLocation() {
  if (readGeoCache()) return           // already have fresh data
  if (_warmPromise) return             // already running
  _warmPromise = _resolveGeo().then(loc => { _warmPromise = null; return loc })
}

async function _resolveGeo() {
  const [gps, ip] = await Promise.all([fetchByGPS(), fetchByIP()])
  const loc = gps || ip || {}
  if (loc.city || loc.region || loc.country) writeGeoCache(loc)
  return loc
}

/* Returns cached location, or waits for the warm-up promise, or resolves fresh. */
export async function fetchGeoLocation() {
  const cached = readGeoCache()
  if (cached) return cached

  // If warmGeoLocation() was called on page mount, await that promise
  if (_warmPromise) {
    const loc = await Promise.race([_warmPromise, new Promise(r => setTimeout(() => r(null), 3000))])
    if (loc?.city || loc?.region) return loc
  }

  return await _resolveGeo()
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

/* Manually correct location for a log row, and overwrite the local geo cache
   so the next login on this device uses the corrected value. */
export async function updateLoginLogLocation(id, { city, region, country }) {
  const { error } = await adminSupabase
    .from('login_logs')
    .update({ city: city || null, region: region || null, country: country || null })
    .eq('id', id)
  if (error) throw error
  // Persist correction into geo cache so future logins on this device are accurate
  writeGeoCache({ source: 'manual', ipAddress: null, city: city || null, region: region || null, country: country || null })
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
