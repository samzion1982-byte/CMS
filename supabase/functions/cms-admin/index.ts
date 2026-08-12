// @ts-nocheck
// cms-admin — privileged Auth Admin ops (never ship service role to the browser)
// Secrets: uses SUPABASE_SERVICE_ROLE_KEY (auto)
// Actions: delete_user | reset_password
// Caller must be authenticated super_admin.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') || Deno.env.get('SUPABASE_ANON') || ''

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

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

  const userClient = createClient(SUPABASE_URL, ANON_KEY || SERVICE_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  })
  const { data: { user }, error } = await userClient.auth.getUser()
  if (error || !user) return { error: 'Not authenticated', status: 401 }

  const admin = createClient(SUPABASE_URL, SERVICE_KEY)
  const { data: prof } = await admin.from('profiles').select('role, email').eq('id', user.id).maybeSingle()
  if (prof?.role !== 'super_admin') return { error: 'Super Admin only', status: 403 }
  return { user, prof, admin }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  try {
    if (!SERVICE_KEY) return json({ error: 'Service role not configured on Edge Function' }, 500)

    const body = await req.json().catch(() => ({}))
    const action = body.action
    const gate = await requireSuperAdmin(req)
    if (gate.error) return json({ error: gate.error }, gate.status)

    const admin = gate.admin

    if (action === 'delete_user') {
      const userId = String(body.user_id || '').trim()
      if (!userId) return json({ error: 'user_id required' }, 400)
      if (userId === gate.user.id) return json({ error: 'Cannot delete your own account' }, 400)
      const { error } = await admin.auth.admin.deleteUser(userId)
      if (error) return json({ error: error.message }, 400)
      return json({ ok: true })
    }

    if (action === 'reset_password') {
      const userId = String(body.user_id || '').trim()
      const password = String(body.password || '')
      if (!userId) return json({ error: 'user_id required' }, 400)
      if (password.length < 8) return json({ error: 'Password must be at least 8 characters' }, 400)
      const { error } = await admin.auth.admin.updateUserById(userId, { password })
      if (error) return json({ error: error.message }, 400)
      return json({ ok: true })
    }

    return json({ error: `Unknown action: ${action}` }, 400)
  } catch (e) {
    return json({ error: e?.message || String(e) }, 500)
  }
})
