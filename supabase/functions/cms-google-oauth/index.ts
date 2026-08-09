// @ts-nocheck
// cms-google-oauth — Connect / disconnect Google Drive via OAuth (user login)
// Secrets: GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET
// Actions: auth_url | exchange | disconnect | status

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

const SCOPES = [
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/userinfo.email',
].join(' ')

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
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
        prompt: 'consent',
        include_granted_scopes: 'true',
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

      let email = gate.prof?.email || null
      try {
        const ui = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
          headers: { Authorization: `Bearer ${tokenJson.access_token}` },
        })
        const uij = await ui.json()
        if (uij.email) email = uij.email
      } catch (_) { /* ignore */ }

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

      return json({ ok: true, email })
    }

    if (action === 'disconnect') {
      const gate = await requireSuperAdmin(req)
      if (gate.error) return json({ error: gate.error }, gate.status)
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
