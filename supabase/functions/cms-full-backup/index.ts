// @ts-nocheck — Deno
/* ═══════════════════════════════════════════════════════════════
   cms-full-backup — Full Backup or Snapshot → Google Drive only
   Secrets: GOOGLE_SERVICE_ACCOUNT_JSON
   Body: { kind: 'full'|'snapshot', trigger_mode, drive_folder_id }
   ═══════════════════════════════════════════════════════════════ */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const supabase = createClient(SUPABASE_URL, SERVICE_KEY)

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const TABLES = [
  'churches', 'church_zones', 'profiles', 'cms_role_page_access', 'cms_user_passwords',
  'cms_backup_settings',
  'members', 'deleted_members',
  'baptism_records', 'confirmation_records', 'wedding_records', 'burial_records',
  'event_task_buckets', 'event_tasks', 'event_volunteers', 'task_library', 'event_plans',
  'assets', 'asset_locations', 'asset_item_types', 'asset_conditions',
  'fixed_assets', 'fixed_asset_documents',
  'receipts', 'receipt_items', 'receipt_financial_years', 'payment_categories',
  'declarations', 'declaration_items', 'decl_financial_years', 'funds',
  'chart_of_accounts', 'journal_entries', 'journal_entry_lines',
  'accounting_settings', 'accounting_entities', 'bank_accounts',
  'simple_accounts', 'simple_categories', 'simple_transactions',
  'announcements', 'announcement_settings', 'announcement_exclusions', 'bible_verses',
  'cms_audit_log', 'login_logs',
]

const PAGE = 1000

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

function filename(kind: string, date = new Date()) {
  const p = (n: number) => String(n).padStart(2, '0')
  const stamp = `${date.getUTCFullYear()}${p(date.getUTCMonth() + 1)}${p(date.getUTCDate())}-${p(date.getUTCHours())}${p(date.getUTCMinutes())}Z`
  return kind === 'snapshot'
    ? `cms-snapshot-${stamp}.json`
    : `cms-full-backup-${stamp}.json`
}

async function fetchAll(table: string) {
  const rows: unknown[] = []
  let from = 0
  for (;;) {
    const { data, error } = await supabase.from(table).select('*').range(from, from + PAGE - 1)
    if (error) {
      if (/does not exist|schema cache|Could not find/i.test(error.message || '')) {
        return { rows: [], skipped: true, error: error.message }
      }
      return { rows: [], skipped: false, error: error.message }
    }
    const batch = data || []
    rows.push(...batch)
    if (batch.length < PAGE) break
    from += PAGE
  }
  return { rows, skipped: false, error: null }
}

async function buildPayload(kind: string, triggerMode: string, actorEmail: string | null) {
  const tables: Record<string, unknown[]> = {}
  const summary: { table: string; status: string; rows: number; error?: string }[] = []
  let totalRows = 0
  let okCount = 0
  for (const table of TABLES) {
    const result = await fetchAll(table)
    if (result.skipped) {
      summary.push({ table, status: 'skipped', rows: 0, error: result.error || undefined })
      continue
    }
    if (result.error) {
      summary.push({ table, status: 'error', rows: 0, error: result.error })
      continue
    }
    tables[table] = result.rows
    totalRows += result.rows.length
    okCount += 1
    summary.push({ table, status: 'ok', rows: result.rows.length })
  }
  return {
    payload: {
      format: kind === 'snapshot' ? 'cms-snapshot' : 'cms-full-backup',
      version: 1,
      kind,
      created_at: new Date().toISOString(),
      trigger_mode: triggerMode,
      created_by: actorEmail,
      tables,
      summary,
    },
    tablesCount: okCount,
    rowsCount: totalRows,
    summary,
  }
}

async function googleAccessToken(sa: { client_email: string; private_key: string }) {
  const now = Math.floor(Date.now() / 1000)
  const header = { alg: 'RS256', typ: 'JWT' }
  const claim = {
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/drive.file',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  }
  const enc = (obj: unknown) =>
    btoa(JSON.stringify(obj)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  const unsigned = `${enc(header)}.${enc(claim)}`
  const pem = sa.private_key.replace(/\\n/g, '\n')
  const pemBody = pem.replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s+/g, '')
  const binary = Uint8Array.from(atob(pemBody), (c) => c.charCodeAt(0))
  const key = await crypto.subtle.importKey(
    'pkcs8', binary.buffer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false, ['sign'],
  )
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(unsigned))
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  const jwt = `${unsigned}.${sigB64}`
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  })
  const tokenJson = await tokenRes.json()
  if (!tokenJson.access_token) {
    throw new Error(tokenJson.error_description || tokenJson.error || 'Google token failed')
  }
  return tokenJson.access_token as string
}

async function uploadToDrive(folderId: string, name: string, content: string) {
  const raw = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_JSON')
  if (!raw) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON secret is not set on the Edge Function')
  if (!folderId) throw new Error('Google Drive folder ID is required')
  const sa = JSON.parse(raw)
  const accessToken = await googleAccessToken(sa)
  const metadata = { name, parents: [folderId], mimeType: 'application/json' }
  const boundary = 'cms_backup_boundary'
  const body =
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${JSON.stringify(metadata)}\r\n` +
    `--${boundary}\r\nContent-Type: application/json\r\n\r\n` +
    `${content}\r\n--${boundary}--`
  const res = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink,name',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body,
    },
  )
  const data = await res.json()
  if (!res.ok) throw new Error(data?.error?.message || `Drive upload failed (${res.status})`)
  return { fileId: data.id as string, webLink: (data.webViewLink as string) || null }
}

async function resolveFolderId(bodyFolder: string | null) {
  if (bodyFolder?.trim()) return bodyFolder.trim()
  const { data } = await supabase.from('cms_backup_settings').select('drive_folder_id').eq('id', 1).maybeSingle()
  return data?.drive_folder_id?.trim() || null
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  try {
    const body = await req.json().catch(() => ({}))
    if (body.action === 'restore') {
      return json({
        error: 'Restore from Drive must be confirmed carefully. Use a dedicated restore run after downloading the JSON, or deploy cms-restore. For safety, v1 lists Drive links — Super Admin restores via provisioned tooling.',
      }, 501)
    }

    const kind = body.kind === 'snapshot' ? 'snapshot' : 'full'
    const triggerMode = body.trigger_mode === 'automatic' ? 'automatic' : 'manual'
    const actorEmail = body.actor_email || (triggerMode === 'automatic' ? 'cron' : null)
    const folderId = await resolveFolderId(body.drive_folder_id || null)
    if (!folderId) {
      return json({ error: 'Google Drive folder ID not configured' }, 400)
    }

    // Respect auto toggles for cron
    if (triggerMode === 'automatic') {
      const { data: settings } = await supabase.from('cms_backup_settings').select('*').eq('id', 1).maybeSingle()
      if (kind === 'full' && settings && settings.full_auto_enabled === false) {
        return json({ ok: true, skipped: true, reason: 'Full auto backup disabled' })
      }
      if (kind === 'snapshot' && settings && settings.snapshot_auto_enabled === false) {
        return json({ ok: true, skipped: true, reason: 'Snapshot auto disabled' })
      }
    }

    const { payload, tablesCount, rowsCount, summary } = await buildPayload(kind, triggerMode, actorEmail)
    const name = filename(kind)
    const content = JSON.stringify(payload)
    const bytes = new TextEncoder().encode(content).byteLength

    let driveFileId: string | null = null
    let driveWebLink: string | null = null
    let status = 'success'
    let errorMessage: string | null = null
    try {
      const drive = await uploadToDrive(folderId, name, content)
      driveFileId = drive.fileId
      driveWebLink = drive.webLink
    } catch (e) {
      status = 'failed'
      errorMessage = e.message || String(e)
    }

    await supabase.from('cms_backup_log').insert({
      backup_type: kind === 'snapshot' ? 'snapshot' : (triggerMode === 'automatic' ? 'scheduled' : 'full'),
      kind,
      trigger_mode: triggerMode,
      status,
      tables_count: tablesCount,
      rows_count: rowsCount,
      file_size_bytes: bytes,
      drive_file_id: driveFileId,
      drive_web_link: driveWebLink,
      download_filename: name,
      error_message: errorMessage,
      meta: { summary, drive_folder_id: folderId },
      created_by_email: actorEmail,
      created_by_name: body.actor_name || null,
    })

    if (status === 'failed') return json({ error: errorMessage, status }, 500)
    return json({
      ok: true,
      status,
      kind,
      filename: name,
      tables_count: tablesCount,
      rows_count: rowsCount,
      file_size_bytes: bytes,
      drive_file_id: driveFileId,
      drive_web_link: driveWebLink,
    })
  } catch (e) {
    console.error('cms-full-backup error', e)
    try {
      await supabase.from('cms_backup_log').insert({
        backup_type: 'full',
        kind: 'full',
        trigger_mode: 'automatic',
        status: 'failed',
        error_message: e.message || String(e),
        created_by_email: 'cron',
      })
    } catch (_) { /* ignore */ }
    return json({ error: e.message || String(e) }, 500)
  }
})
