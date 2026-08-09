// @ts-nocheck — Deno URL imports
/* ═══════════════════════════════════════════════════════════════
   cms-full-backup — Full DB backup (manual invoke or daily cron)
   - Dumps core tables as JSON
   - Stores in Storage bucket cms-backups
   - Uploads to Google Drive when secrets are configured:
       GOOGLE_SERVICE_ACCOUNT_JSON  (full service-account JSON)
       GOOGLE_DRIVE_FOLDER_ID       (target Drive folder id)
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
  'members', 'deleted_members',
  'baptism_records', 'confirmation_records', 'wedding_records', 'burial_records',
  'event_task_buckets', 'event_tasks', 'event_volunteers', 'task_library',
  'assets', 'asset_locations', 'asset_item_types', 'asset_conditions',
  'fixed_assets', 'fixed_asset_documents',
  'receipts', 'receipt_items', 'receipt_financial_years', 'payment_categories',
  'declarations', 'declaration_items', 'decl_financial_years', 'funds',
  'chart_of_accounts', 'journal_entries', 'journal_entry_lines',
  'accounting_settings', 'accounting_entities', 'bank_accounts',
  'simple_accounts', 'simple_categories', 'simple_transactions',
  'announcements', 'announcement_settings', 'announcement_exclusions', 'bible_verses',
]

const PAGE = 1000

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

function backupFilename(date = new Date()) {
  const p = (n: number) => String(n).padStart(2, '0')
  return `cms-full-backup-${date.getUTCFullYear()}${p(date.getUTCMonth() + 1)}${p(date.getUTCDate())}-${p(date.getUTCHours())}${p(date.getUTCMinutes())}Z.json`
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

async function buildPayload(triggerMode: string, actorEmail: string | null) {
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
      format: 'cms-full-backup',
      version: 1,
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

/** Minimal JWT (RS256) for Google service account → Drive scope */
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
    'pkcs8',
    binary.buffer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    new TextEncoder().encode(unsigned),
  )
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

async function uploadToDrive(filename: string, content: string) {
  const raw = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_JSON')
  const folderId = Deno.env.get('GOOGLE_DRIVE_FOLDER_ID')
  if (!raw || !folderId) {
    return { skipped: true as const, reason: 'GOOGLE_SERVICE_ACCOUNT_JSON or GOOGLE_DRIVE_FOLDER_ID not set' }
  }
  let sa: { client_email: string; private_key: string }
  try {
    sa = JSON.parse(raw)
  } catch {
    throw new Error('Invalid GOOGLE_SERVICE_ACCOUNT_JSON')
  }

  const accessToken = await googleAccessToken(sa)
  const metadata = {
    name: filename,
    parents: [folderId],
    mimeType: 'application/json',
  }
  const boundary = 'cms_backup_boundary'
  const body =
    `--${boundary}\r\n` +
    `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${JSON.stringify(metadata)}\r\n` +
    `--${boundary}\r\n` +
    `Content-Type: application/json\r\n\r\n` +
    `${content}\r\n` +
    `--${boundary}--`

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
  if (!res.ok) {
    throw new Error(data?.error?.message || `Drive upload failed (${res.status})`)
  }
  return {
    skipped: false as const,
    fileId: data.id as string,
    webLink: (data.webViewLink as string) || null,
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const body = await req.json().catch(() => ({}))
    const triggerMode = body.trigger_mode === 'automatic' ? 'automatic' : 'manual'
    const actorEmail = body.actor_email || (triggerMode === 'automatic' ? 'cron' : null)
    const filename = body.filename || backupFilename()

    // Client already built payload — only push to Drive
    if (body.upload_only && body.payload) {
      const content = JSON.stringify(body.payload)
      let drive: Awaited<ReturnType<typeof uploadToDrive>>
      try {
        drive = await uploadToDrive(filename, content)
      } catch (e) {
        return json({ error: e.message || String(e), drive_skipped: false }, 500)
      }
      if (drive.skipped) {
        return json({ ok: true, drive_skipped: true, reason: drive.reason })
      }
      return json({
        ok: true,
        drive_file_id: drive.fileId,
        drive_web_link: drive.webLink,
        filename,
      })
    }

    const { payload, tablesCount, rowsCount, summary } = await buildPayload(triggerMode, actorEmail)
    const content = JSON.stringify(payload)
    const bytes = new TextEncoder().encode(content).byteLength

    // Storage upload
    let storagePath: string | null = null
    let storageError: string | null = null
    const path = `full/${filename}`
    const { error: upErr } = await supabase.storage
      .from('cms-backups')
      .upload(path, new Blob([content], { type: 'application/json' }), {
        contentType: 'application/json',
        upsert: true,
      })
    if (upErr) storageError = upErr.message
    else storagePath = path

    // Drive upload
    let driveFileId: string | null = null
    let driveWebLink: string | null = null
    let driveSkipped = false
    let driveError: string | null = null
    try {
      const drive = await uploadToDrive(filename, content)
      if (drive.skipped) {
        driveSkipped = true
      } else {
        driveFileId = drive.fileId
        driveWebLink = drive.webLink
      }
    } catch (e) {
      driveError = e.message || String(e)
    }

    let status = 'success'
    const errs = [storageError, driveError].filter(Boolean)
    if (errs.length && !storagePath && !driveFileId) status = 'failed'
    else if (errs.length || (driveSkipped && storageError)) status = 'partial'
    else if (driveSkipped && storagePath) status = 'success'

    await supabase.from('cms_backup_log').insert({
      backup_type: triggerMode === 'automatic' ? 'scheduled' : 'manual',
      trigger_mode: triggerMode,
      status,
      tables_count: tablesCount,
      rows_count: rowsCount,
      file_size_bytes: bytes,
      storage_path: storagePath,
      drive_file_id: driveFileId,
      drive_web_link: driveWebLink,
      download_filename: filename,
      error_message: errs.length ? errs.join(' | ') : (driveSkipped ? 'Drive not configured — stored in cms-backups only' : null),
      meta: { summary, drive_skipped: driveSkipped },
      created_by_email: actorEmail,
    })

    return json({
      ok: status !== 'failed',
      status,
      filename,
      tables_count: tablesCount,
      rows_count: rowsCount,
      file_size_bytes: bytes,
      storage_path: storagePath,
      drive_file_id: driveFileId,
      drive_web_link: driveWebLink,
      drive_skipped: driveSkipped,
      error: status === 'failed' ? errs.join(' | ') : null,
    })
  } catch (e) {
    console.error('cms-full-backup error', e)
    try {
      await supabase.from('cms_backup_log').insert({
        backup_type: 'scheduled',
        trigger_mode: 'automatic',
        status: 'failed',
        error_message: e.message || String(e),
        created_by_email: 'cron',
      })
    } catch (_) { /* ignore */ }
    return json({ error: e.message || String(e) }, 500)
  }
})
