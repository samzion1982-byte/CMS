// @ts-nocheck
// cms-google-oauth — Connect / disconnect Google Drive via OAuth (user login)
// Secrets: GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET
// Actions: auth_url | exchange | disconnect | status | verify

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
const CLIENT_ID = Deno.env.get('GOOGLE_OAUTH_CLIENT_ID')
const CLIENT_SECRET = Deno.env.get('GOOGLE_OAUTH_CLIENT_SECRET')
const supabase = createClient(SUPABASE_URL, SERVICE_KEY)

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file'
const EMAIL_SCOPE = 'https://www.googleapis.com/auth/userinfo.email'
const SCOPES = [DRIVE_SCOPE, EMAIL_SCOPE].join(' ')

const SCOPE_HELP =
  'On the Google consent screen, leave Google Drive checked (do not uncheck it). ' +
  'Then revoke this app at https://myaccount.google.com/permissions , Disconnect in Backup, and Connect Google again.'

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

function parseScopeSet(scopeStr) {
  return new Set(String(scopeStr || '').split(/[\s,]+/).map((s) => s.trim()).filter(Boolean))
}

function hasDriveScope(scopeStr) {
  const set = parseScopeSet(scopeStr)
  return set.has(DRIVE_SCOPE) || set.has('https://www.googleapis.com/auth/drive')
}

async function requireSuperAdmin(req) {
  const auth = req.headers.get('Authorization') || ''
  const token = auth.replace(/^Bearer\s+/i, '')
  if (!token) return { error: 'Not authenticated', status: 401 }
  const { data: { user }, error } = await supabase.auth.getUser(token)
  if (error || !user) return { error: 'Not authenticated', status: 401 }
  const { data: prof } = await supabase.from('profiles').select('role, email').eq('id', user.id).maybeSingle()
  if (prof?.role !== 'super_admin') return { error: 'Super Admin only', status: 403 }
  return { user, prof }
}

async function revokeGoogleToken(token) {
  if (!token) return
  try {
    await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    })
  } catch (_) { /* best-effort */ }
}

async function refreshAccessToken(refreshToken) {
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  })
  const tokenJson = await tokenRes.json()
  if (!tokenRes.ok || !tokenJson.access_token) {
    throw new Error(tokenJson.error_description || tokenJson.error || 'Google token refresh failed')
  }
  return tokenJson
}

async function tokenInfo(accessToken) {
  const res = await fetch(`https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(accessToken)}`)
  const data = await res.json().catch(() => ({}))
  return { ok: res.ok, data }
}

/** True if this access token can call Drive API (more reliable than parsing scope strings). */
async function probeDriveAccess(accessToken) {
  const res = await fetch('https://www.googleapis.com/drive/v3/about?fields=user(emailAddress)', {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const msg = data?.error?.message || data?.error?.status || `HTTP ${res.status}`
    return { ok: false, error: msg, data }
  }
  return { ok: true, email: data?.user?.emailAddress || null }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  try {
    if (!CLIENT_ID || !CLIENT_SECRET) {
      return json({
        error: 'Set Edge Function secrets GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET first',
      }, 500)
    }

    const body = await req.json().catch(() => ({}))
    const action = body.action || 'status'

    if (action === 'auth_url') {
      const gate = await requireSuperAdmin(req)
      if (gate.error) return json({ error: gate.error }, gate.status)
      const redirectUri = String(body.redirect_uri || '').trim()
      if (!redirectUri) return json({ error: 'redirect_uri required' }, 400)
      const state = body.state || crypto.randomUUID()
      const params = new URLSearchParams({
        client_id: CLIENT_ID,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: SCOPES,
        access_type: 'offline',
        // Force full consent every time so Drive is re-granted (granular consent can drop it).
        prompt: 'consent',
        include_granted_scopes: 'false',
        state,
      })
      return json({
        ok: true,
        auth_url: `https://accounts.google.com/o/oauth2/v2/auth?${params}`,
        state,
      })
    }

    if (action === 'exchange') {
      const gate = await requireSuperAdmin(req)
      if (gate.error) return json({ error: gate.error }, gate.status)
      const code = String(body.code || '').trim()
      const redirectUri = String(body.redirect_uri || '').trim()
      if (!code || !redirectUri) return json({ error: 'code and redirect_uri required' }, 400)

      const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: CLIENT_ID,
          client_secret: CLIENT_SECRET,
          redirect_uri: redirectUri,
          grant_type: 'authorization_code',
        }),
      })
      const tokenJson = await tokenRes.json()
      if (!tokenRes.ok || !tokenJson.refresh_token) {
        return json({
          error: tokenJson.error_description || tokenJson.error ||
            'No refresh_token returned. Revoke app access at https://myaccount.google.com/permissions and try Connect again.',
          details: tokenJson,
        }, 400)
      }

      // Google granular consent: user can uncheck Drive — reject that early with a clear message.
      let grantedScope = tokenJson.scope || ''
      if (!hasDriveScope(grantedScope) && tokenJson.access_token) {
        const info = await tokenInfo(tokenJson.access_token)
        grantedScope = info.data?.scope || grantedScope
      }
      // Scope strings are sometimes missing on refresh/exchange — probe Drive API as ground truth.
      let driveProbe = { ok: hasDriveScope(grantedScope), error: null }
      if (!driveProbe.ok && tokenJson.access_token) {
        driveProbe = await probeDriveAccess(tokenJson.access_token)
      }
      if (!driveProbe.ok) {
        await revokeGoogleToken(tokenJson.refresh_token)
        await revokeGoogleToken(tokenJson.access_token)
        return json({
          error:
            `Google connected without working Drive permission (scopes: ${grantedScope || 'none'}; drive: ${driveProbe.error || 'denied'}). ${SCOPE_HELP}`,
          scopes: grantedScope,
        }, 400)
      }

      let email = gate.prof?.email || null
      try {
        const ui = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
          headers: { Authorization: `Bearer ${tokenJson.access_token}` },
        })
        const uij = await ui.json()
        if (uij.email) email = uij.email
      } catch (_) { /* ignore */ }

      // Replace any previous token; revoke old one best-effort.
      const { data: prev } = await supabase
        .from('cms_backup_settings')
        .select('google_refresh_token')
        .eq('id', 1)
        .maybeSingle()
      if (prev?.google_refresh_token && prev.google_refresh_token !== tokenJson.refresh_token) {
        await revokeGoogleToken(prev.google_refresh_token)
      }

      const { error: upErr } = await supabase.from('cms_backup_settings').upsert({
        id: 1,
        google_refresh_token: tokenJson.refresh_token,
        google_connected_email: email,
        google_connected_at: new Date().toISOString(),
        drive_enabled: true,
        updated_at: new Date().toISOString(),
        updated_by_email: gate.user.email || email,
      }, { onConflict: 'id' })
      if (upErr) return json({ error: upErr.message }, 500)

      return json({ ok: true, email, scopes: grantedScope })
    }

    if (action === 'disconnect') {
      const gate = await requireSuperAdmin(req)
      if (gate.error) return json({ error: gate.error }, gate.status)
      const { data: prev } = await supabase
        .from('cms_backup_settings')
        .select('google_refresh_token')
        .eq('id', 1)
        .maybeSingle()
      await revokeGoogleToken(prev?.google_refresh_token)

      const { error: upErr } = await supabase.from('cms_backup_settings').upsert({
        id: 1,
        google_refresh_token: null,
        google_connected_email: null,
        google_connected_at: null,
        updated_at: new Date().toISOString(),
        updated_by_email: gate.user.email || null,
      }, { onConflict: 'id' })
      if (upErr) return json({ error: upErr.message }, 500)
      return json({ ok: true })
    }

    if (action === 'verify') {
      const gate = await requireSuperAdmin(req)
      if (gate.error) return json({ error: gate.error }, gate.status)
      const { data } = await supabase
        .from('cms_backup_settings')
        .select('google_refresh_token, google_connected_email, google_connected_at, drive_folder_id')
        .eq('id', 1)
        .maybeSingle()
      if (!data?.google_refresh_token) {
        return json({
          ok: false,
          connected: false,
          drive_scope_ok: false,
          error: 'Google Drive is not connected',
        })
      }
      try {
        const tokenJson = await refreshAccessToken(data.google_refresh_token)
        const info = await tokenInfo(tokenJson.access_token)
        const scopes = info.data?.scope || tokenJson.scope || ''
        const probe = await probeDriveAccess(tokenJson.access_token)
        const driveOk = probe.ok || hasDriveScope(scopes)
        return json({
          ok: driveOk,
          connected: true,
          email: data.google_connected_email || probe.email || null,
          connected_at: data.google_connected_at || null,
          drive_folder_id: data.drive_folder_id || null,
          scopes,
          drive_scope_ok: driveOk,
          drive_probe_error: probe.ok ? null : (probe.error || null),
          error: driveOk
            ? null
            : `Connected account cannot use Google Drive (${probe.error || 'scope missing'}). ${SCOPE_HELP}`,
        })
      } catch (e) {
        return json({
          ok: false,
          connected: true,
          email: data.google_connected_email || null,
          drive_scope_ok: false,
          error: e.message || String(e),
        })
      }
    }

    // status
    const gate = await requireSuperAdmin(req)
    if (gate.error) return json({ error: gate.error }, gate.status)
    const { data } = await supabase
      .from('cms_backup_settings')
      .select('google_connected_email, google_connected_at, drive_folder_id')
      .eq('id', 1)
      .maybeSingle()
    return json({
      ok: true,
      connected: !!data?.google_connected_email,
      email: data?.google_connected_email || null,
      connected_at: data?.google_connected_at || null,
      drive_folder_id: data?.drive_folder_id || null,
      oauth_configured: !!(CLIENT_ID && CLIENT_SECRET),
    })
  } catch (e) {
    console.error('cms-google-oauth error', e)
    return json({ error: e.message || String(e) }, 500)
  }
})
