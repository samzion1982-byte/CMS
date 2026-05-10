import { adminSupabase } from './supabase'

const GEO_CACHE_KEY  = 'church_cms_geo_v3'        // v3 — ipinfo token
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
  const IPINFO_TOKEN = 'e2bd6cd58f0cd7'
  const race = Promise.any([
    // ipinfo.io with auth token — primary, best database
    ipFetch(`https://ipinfo.io/json?token=${IPINFO_TOKEN}`, d =>
      d.ip ? { ipAddress: d.ip, city: d.city || null, region: d.region || null, country: d.country || null } : null),
    ipFetch('https://get.geojs.io/v1/ip/geo.json',   d => ({ ipAddress: d.ip || null, city: d.city || null, region: d.region || null, country: d.country || null })),
    ipFetch('https://freeipapi.com/api/json',          d => d.ipAddress ? { ipAddress: d.ipAddress, city: d.cityName || null, region: d.regionName || null, country: d.countryName || null } : null),
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

/* Insert a new login row */
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

// ── Location manual override ──────────────────────────────────────────────────

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
