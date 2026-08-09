// cms-full-backup — COMPLETE backup & restore (all tables + all storage files)
// Secrets: GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET (preferred)
// Optional: GOOGLE_SERVICE_ACCOUNT_JSON (Shared Drives only)
//
// Body:
//   { kind: 'full'|'snapshot', trigger_mode, drive_folder_id, actor_email, actor_name }
//   { action: 'inspect', drive_backup_folder_id | log_id }
//   { action: 'restore', drive_backup_folder_id | log_id, tables?, storage_buckets? }
//
// Each backup creates a Drive FOLDER with:
//   database.json , storage/<bucket>/... , manifest.json

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') || Deno.env.get('SUPABASE_ANON') || ''
const supabase = createClient(SUPABASE_URL, SERVICE_KEY)

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const PAGE = 1000
const COMPLETE_VERSION = 2

const FALLBACK_TABLES = [
  'churches', 'church_zones', 'profiles', 'cms_role_page_access', 'cms_user_passwords',
  'cms_backup_settings', 'cms_backup_log', 'cms_recycle_bin', 'cms_audit_log',
  'members', 'deleted_members', 'member_photos', 'member_relationships', 'member_custom_field_values',
  'member_contributions', 'member_fees', 'custom_field_definitions',
  'baptism_records', 'confirmation_records', 'wedding_records', 'burial_records',
  'families', 'family_relationships', 'family_tree_layouts',
  'event_task_buckets', 'event_tasks', 'event_volunteers', 'task_library', 'event_plans',
  'events', 'event_media', 'event_registrations',
  'assets', 'asset_locations', 'asset_item_types', 'asset_conditions', 'asset_categories',
  'asset_stock_movements', 'fixed_assets', 'fixed_asset_documents',
  'receipts', 'receipt_items', 'receipt_financial_years', 'receipt_counters', 'receipt_sequences',
  'payment_categories', 'payment_pages', 'payment_page_versions',
  'declarations', 'declaration_items', 'decl_financial_years', 'funds',
  'chart_of_accounts', 'accounts', 'journal_entries', 'journal_entry_lines', 'journal_entry_sequences',
  'recurring_journal_templates', 'accounting_settings', 'accounting_entities', 'bank_accounts',
  'simple_accounts', 'simple_categories', 'simple_transactions', 'transactions',
  'contribution_types', 'fee_plans', 'fee_structures', 'festival_periods',
  'voucher_counters', 'voucher_sequences',
  'announcements', 'announcement_settings', 'announcement_exclusions', 'bible_verses',
  'login_announcements', 'login_logs',
  'organization_units', 'page_permissions', 'roles', 'user_profiles',
  'devices', 'device_sessions', 'church_settings',
]

const KNOWN_BUCKETS = [
  'announcement-cards', 'announcement-reports', 'asset-photos', 'church-logos',
  'event-media', 'member-photos', 'member-reports', 'payment-pages', 'receipt-pdfs',
]

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

function runFolderName(kind, date = new Date()) {
  const p = (n) => String(n).padStart(2, '0')
  const stamp =
    `${date.getUTCFullYear()}${p(date.getUTCMonth() + 1)}${p(date.getUTCDate())}-` +
    `${p(date.getUTCHours())}${p(date.getUTCMinutes())}${p(date.getUTCSeconds())}Z`
  return kind === 'snapshot' ? `cms-snapshot-${stamp}` : `cms-full-backup-${stamp}`
}

async function fetchAll(table) {
  const rows = []
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

async function listPublicTables() {
  const { data, error } = await supabase.rpc('cms_list_public_tables')
  if (!error && Array.isArray(data) && data.length) {
    return data
      .map((r) => (typeof r === 'string' ? r : String(r?.table_name || '')))
      .filter(Boolean)
  }
  return [...new Set(FALLBACK_TABLES)]
}

async function buildDatabaseDump(kind, triggerMode, actorEmail) {
  const tableNames = await listPublicTables()
  const tables = {}
  const summary = []
  let totalRows = 0
  let okCount = 0

  for (const table of tableNames) {
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
      format: 'cms-complete-backup',
      version: COMPLETE_VERSION,
      kind,
      created_at: new Date().toISOString(),
      trigger_mode: triggerMode,
      created_by: actorEmail,
      includes_storage: true,
      tables,
      summary,
    },
    tablesCount: okCount,
    rowsCount: totalRows,
    summary,
  }
}

async function googleAccessTokenFromSA(sa) {
  const now = Math.floor(Date.now() / 1000)
  const header = { alg: 'RS256', typ: 'JWT' }
  const claim = {
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/drive.file',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  }
  const enc = (obj) =>
    btoa(JSON.stringify(obj)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  const unsigned = `${enc(header)}.${enc(claim)}`
  const pem = sa.private_key.replace(/\\n/g, '\n')
  const pemContents = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s/g, '')
  const binaryDer = Uint8Array.from(atob(pemContents), (c) => c.charCodeAt(0))
  const key = await crypto.subtle.importKey(
    'pkcs8',
    binaryDer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
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
  return tokenJson.access_token
}

async function getOAuthAccessToken(refreshToken) {
  const clientId = Deno.env.get('GOOGLE_OAUTH_CLIENT_ID')
  const clientSecret = Deno.env.get('GOOGLE_OAUTH_CLIENT_SECRET')
  if (!clientId || !clientSecret) {
    throw new Error('GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET secrets are not set')
  }
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  })
  const tokenJson = await tokenRes.json()
  if (!tokenJson.access_token) {
    throw new Error(tokenJson.error_description || tokenJson.error || 'Google OAuth token refresh failed')
  }
  return tokenJson.access_token
}

async function resolveAccessToken() {
  const { data: settings } = await supabase
    .from('cms_backup_settings')
    .select('google_refresh_token, google_connected_email')
    .eq('id', 1)
    .maybeSingle()

  if (settings?.google_refresh_token) {
    return {
      accessToken: await getOAuthAccessToken(settings.google_refresh_token),
      via: 'oauth',
      email: settings.google_connected_email || null,
    }
  }

  const raw = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_JSON')
  if (raw) {
    const sa = JSON.parse(raw)
    return {
      accessToken: await googleAccessTokenFromSA(sa),
      via: 'service_account',
      email: sa.client_email || null,
    }
  }

  throw new Error(
    'Google Drive not connected. On Backup page click Connect Google (OAuth), or set GOOGLE_SERVICE_ACCOUNT_JSON (Shared Drives only).',
  )
}

async function resolveFolderId(bodyFolder) {
  if (bodyFolder && String(bodyFolder).trim()) return String(bodyFolder).trim()
  const { data } = await supabase.from('cms_backup_settings').select('drive_folder_id').eq('id', 1).maybeSingle()
  return data?.drive_folder_id?.trim() || null
}

async function driveCreateFolder(accessToken, name, parentId) {
  const res = await fetch('https://www.googleapis.com/drive/v3/files?fields=id,name,webViewLink', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentId],
    }),
  })
  const body = await res.json()
  if (!res.ok) throw new Error(body?.error?.message || `Drive create folder failed (${res.status})`)
  return body
}

async function driveListChildren(accessToken, folderId) {
  const q = encodeURIComponent(`'${folderId}' in parents and trashed=false`)
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,mimeType,size)&pageSize=1000`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  )
  const body = await res.json()
  if (!res.ok) throw new Error(body?.error?.message || `Drive list failed (${res.status})`)
  return body.files || []
}

async function findOrCreateNamedFolder(accessToken, parentId, name) {
  const children = await driveListChildren(accessToken, parentId)
  const existing = children.find((f) => f.name === name && f.mimeType === 'application/vnd.google-apps.folder')
  if (existing) return existing
  return driveCreateFolder(accessToken, name, parentId)
}

async function ensureNestedFolder(accessToken, rootId, relativePath) {
  const parts = relativePath.split('/').filter(Boolean)
  let current = rootId
  for (const part of parts) {
    const folder = await findOrCreateNamedFolder(accessToken, current, part)
    current = folder.id
  }
  return current
}

async function driveUploadBytes(accessToken, parentId, fileName, bytes, mimeType) {
  const metadata = JSON.stringify({ name: fileName, parents: [parentId] })
  const boundary = `cms_boundary_${crypto.randomUUID().replace(/-/g, '')}`
  const encoder = new TextEncoder()
  const head = encoder.encode(
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n` +
    `--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`,
  )
  const tail = encoder.encode(`\r\n--${boundary}--`)
  const body = new Uint8Array(head.length + bytes.length + tail.length)
  body.set(head, 0)
  body.set(bytes, head.length)
  body.set(tail, head.length + bytes.length)

  const res = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,size,webViewLink',
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
    const msg = data?.error?.message || `Drive upload failed (${res.status}) for ${fileName}`
    if (/storage quota|service accounts do not have/i.test(msg)) {
      throw new Error(
        `${msg} Tip: Connect Google with OAuth on the Backup page (personal Drive needs user login, not service account).`,
      )
    }
    throw new Error(msg)
  }
  return data
}

async function driveDownloadBytes(accessToken, fileId) {
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(`Drive download failed: ${text}`)
  }
  return new Uint8Array(await res.arrayBuffer())
}

async function listAllStorageFiles(bucket, prefix = '') {
  const out = []
  let offset = 0
  for (;;) {
    const { data, error } = await supabase.storage.from(bucket).list(prefix || undefined, {
      limit: 1000,
      offset,
    })
    if (error) throw new Error(`Storage list ${bucket}/${prefix}: ${error.message}`)
    const items = data || []
    if (!items.length) break

    for (const item of items) {
      const path = prefix ? `${prefix}/${item.name}` : item.name
      if (item.id) {
        out.push({
          path,
          size: item.metadata?.size,
          mime: item.metadata?.mimetype,
        })
      } else {
        const nested = await listAllStorageFiles(bucket, path)
        out.push(...nested)
      }
    }
    if (items.length < 1000) break
    offset += 1000
  }
  return out
}

async function backupStorageToDrive(accessToken, runFolderId) {
  const { data: buckets, error: bucketErr } = await supabase.storage.listBuckets()
  if (bucketErr) throw new Error(`listBuckets: ${bucketErr.message}`)

  const bucketNames = (buckets || [])
    .map((b) => b.name)
    .filter((n) => n !== 'cms-backups')

  for (const known of KNOWN_BUCKETS) {
    if (!bucketNames.includes(known)) bucketNames.push(known)
  }

  const storageMeta = []
  const skipped = []
  let totalBytes = 0
  let fileCount = 0

  const storageRoot = await findOrCreateNamedFolder(accessToken, runFolderId, 'storage')

  for (const bucket of bucketNames) {
    let files = []
    try {
      files = await listAllStorageFiles(bucket)
    } catch (e) {
      skipped.push(`bucket ${bucket}: ${e.message || e}`)
      continue
    }
    if (!files.length) continue

    const bucketFolder = await findOrCreateNamedFolder(accessToken, storageRoot.id, bucket)

    for (const file of files) {
      try {
        const { data: blob, error: dlErr } = await supabase.storage.from(bucket).download(file.path)
        if (dlErr || !blob) {
          skipped.push(`${bucket}/${file.path}: ${dlErr?.message || 'empty'}`)
          continue
        }
        const bytes = new Uint8Array(await blob.arrayBuffer())
        const mime = file.mime || blob.type || 'application/octet-stream'
        const parts = file.path.split('/')
        const fileName = parts.pop()
        const parentPath = parts.join('/')
        const parentId = parentPath
          ? await ensureNestedFolder(accessToken, bucketFolder.id, parentPath)
          : bucketFolder.id
        const uploaded = await driveUploadBytes(accessToken, parentId, fileName, bytes, mime)
        storageMeta.push({
          bucket,
          path: file.path,
          size: bytes.length,
          mime,
          drive_file_id: uploaded.id,
        })
        totalBytes += bytes.length
        fileCount += 1
      } catch (e) {
        skipped.push(`${bucket}/${file.path}: ${e.message || e}`)
      }
    }
  }

  return { storageMeta, skipped, totalBytes, fileCount, buckets: bucketNames }
}

async function collectDriveFilesRecursive(accessToken, folderId, prefix = '') {
  const children = await driveListChildren(accessToken, folderId)
  const out = []
  for (const child of children) {
    const path = prefix ? `${prefix}/${child.name}` : child.name
    if (child.mimeType === 'application/vnd.google-apps.folder') {
      out.push(...await collectDriveFilesRecursive(accessToken, child.id, path))
    } else {
      out.push({ id: child.id, name: child.name, path, mimeType: child.mimeType })
    }
  }
  return out
}

async function assertCallerCanRestore(req) {
  const authHeader = req.headers.get('Authorization') || ''
  if (SERVICE_KEY && authHeader.includes(SERVICE_KEY)) return { via: 'service_role' }
  if (!ANON_KEY) return { via: 'service_role' }

  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: { user }, error } = await userClient.auth.getUser()
  if (error || !user) throw new Error('Unauthorized')

  const { data: profile } = await userClient.from('profiles').select('role').eq('id', user.id).maybeSingle()
  let role = String(profile?.role || '').toLowerCase()
  if (!role) {
    const { data: up } = await userClient.from('user_profiles').select('role').eq('id', user.id).maybeSingle()
    role = String(up?.role || '').toLowerCase()
  }
  if (role !== 'super_admin') throw new Error('Only Super Admin can restore backups')
  return { via: 'user', email: user.email }
}

async function runCompleteBackup(body) {
  const kind = body.kind === 'snapshot' ? 'snapshot' : 'full'
  const triggerMode = body.trigger_mode === 'automatic' ? 'automatic' : 'manual'
  const actorEmail = body.actor_email || (triggerMode === 'automatic' ? 'cron' : null)
  const folderId = await resolveFolderId(body.drive_folder_id || null)
  if (!folderId) throw new Error('Google Drive folder ID not configured')

  if (triggerMode === 'automatic') {
    const { data: settings } = await supabase.from('cms_backup_settings').select('*').eq('id', 1).maybeSingle()
    if (kind === 'full' && settings && settings.full_auto_enabled === false) {
      return { ok: true, skipped: true, reason: 'Full auto backup disabled' }
    }
    if (kind === 'snapshot' && settings && settings.snapshot_auto_enabled === false) {
      return { ok: true, skipped: true, reason: 'Snapshot auto disabled' }
    }
  }

  const { accessToken, via: authVia } = await resolveAccessToken()
  const runName = runFolderName(kind)
  const runFolder = await driveCreateFolder(accessToken, runName, folderId)

  const built = await buildDatabaseDump(kind, triggerMode, actorEmail)
  const dbJson = JSON.stringify(built.payload)
  const dbBytes = new TextEncoder().encode(dbJson)
  const dbFile = await driveUploadBytes(accessToken, runFolder.id, 'database.json', dbBytes, 'application/json')

  const storage = await backupStorageToDrive(accessToken, runFolder.id)

  const manifest = {
    format: 'cms-complete-backup',
    version: COMPLETE_VERSION,
    kind,
    created_at: new Date().toISOString(),
    drive_folder_id: runFolder.id,
    drive_folder_name: runFolder.name,
    auth_via: authVia,
    database: {
      file_id: dbFile.id,
      file_name: 'database.json',
      bytes: dbBytes.length,
      tables: built.tablesCount,
      rows: built.rowsCount,
      summary: built.summary,
    },
    storage: {
      file_count: storage.fileCount,
      bytes: storage.totalBytes,
      buckets: storage.buckets,
      files: storage.storageMeta,
      skipped: storage.skipped,
    },
    total_bytes: dbBytes.length + storage.totalBytes,
  }
  const manifestBytes = new TextEncoder().encode(JSON.stringify(manifest, null, 2))
  const manifestFile = await driveUploadBytes(
    accessToken,
    runFolder.id,
    'manifest.json',
    manifestBytes,
    'application/json',
  )

  const totalBytes = dbBytes.length + storage.totalBytes
  const status = storage.skipped.length && !storage.fileCount && built.tablesCount === 0
    ? 'failed'
    : (storage.skipped.length || built.summary.some((s) => s.status === 'error') ? 'partial' : 'success')

  await supabase.from('cms_backup_log').insert({
    backup_type: kind === 'snapshot' ? 'snapshot' : (triggerMode === 'automatic' ? 'scheduled' : 'full'),
    kind,
    trigger_mode: triggerMode,
    status,
    tables_count: built.tablesCount,
    rows_count: built.rowsCount,
    file_size_bytes: totalBytes,
    drive_file_id: runFolder.id,
    drive_web_link: runFolder.webViewLink || null,
    download_filename: runFolder.name,
    error_message: [
      ...built.summary.filter((s) => s.status === 'error' || s.status === 'skipped').map((s) => `${s.table}: ${s.error || s.status}`),
      ...storage.skipped.slice(0, 15),
    ].slice(0, 20).join(' | ') || null,
    meta: {
      complete: true,
      version: COMPLETE_VERSION,
      drive_backup_folder_id: runFolder.id,
      drive_backup_folder_name: runFolder.name,
      drive_manifest_file_id: manifestFile.id,
      drive_database_file_id: dbFile.id,
      database_bytes: dbBytes.length,
      storage_bytes: storage.totalBytes,
      storage_file_count: storage.fileCount,
      storage_buckets: storage.buckets,
      summary: built.summary,
      skipped_storage: storage.skipped,
      auth_via: authVia,
    },
    created_by_email: actorEmail,
    created_by_name: body.actor_name || null,
  })

  return {
    ok: true,
    status,
    kind,
    complete: true,
    version: COMPLETE_VERSION,
    filename: runFolder.name,
    folder_id: runFolder.id,
    drive_file_id: runFolder.id,
    drive_web_link: runFolder.webViewLink || null,
    tables_count: built.tablesCount,
    rows_count: built.rowsCount,
    file_size_bytes: totalBytes,
    database_bytes: dbBytes.length,
    storage_bytes: storage.totalBytes,
    storage_file_count: storage.fileCount,
    skipped_storage: storage.skipped,
  }
}

async function resolveBackupFolderId(body) {
  let folderId = String(body.drive_backup_folder_id || body.folder_id || '').trim()
  if (!folderId && body.log_id) {
    const { data: logRow, error } = await supabase
      .from('cms_backup_log')
      .select('drive_file_id, meta')
      .eq('id', body.log_id)
      .maybeSingle()
    if (error) throw new Error(error.message)
    folderId = String(logRow?.meta?.drive_backup_folder_id || logRow?.drive_file_id || '').trim()
  }
  if (!folderId) throw new Error('drive_backup_folder_id (or log_id of a backup) is required')
  return folderId
}

function asStringArray(value) {
  if (value == null) return null
  if (!Array.isArray(value)) return null
  return value.map((v) => String(v)).filter(Boolean)
}

async function inspectBackup(body, req) {
  await assertCallerCanRestore(req)
  const folderId = await resolveBackupFolderId(body)
  const { accessToken } = await resolveAccessToken()

  // Try as folder first
  let rootFiles = []
  let isLegacyFile = false
  try {
    rootFiles = await driveListChildren(accessToken, folderId)
  } catch (_) {
    rootFiles = []
  }

  const dbEntry = rootFiles.find((f) => f.name === 'database.json')
  const manifestEntry = rootFiles.find((f) => f.name === 'manifest.json')
  const tables = []
  const buckets = []

  if (!dbEntry && !manifestEntry && !rootFiles.length) {
    // Legacy single JSON file id
    isLegacyFile = true
    const bytes = await driveDownloadBytes(accessToken, folderId)
    const parsed = JSON.parse(new TextDecoder().decode(bytes))
    const data = parsed.tables || parsed.data || {}
    if (Array.isArray(parsed.summary)) {
      for (const s of parsed.summary) {
        if (s.status === 'ok' || (s.rows || 0) > 0) tables.push({ name: s.table, rows: s.rows || 0 })
      }
    }
    if (!tables.length) {
      for (const name of Object.keys(data)) tables.push({ name, rows: (data[name] || []).length })
    }
  } else {
    if (manifestEntry) {
      try {
        const mBytes = await driveDownloadBytes(accessToken, manifestEntry.id)
        const manifest = JSON.parse(new TextDecoder().decode(mBytes))
        for (const s of manifest.database?.summary || []) {
          if (s.status === 'ok' || (s.rows || 0) > 0) tables.push({ name: s.table, rows: s.rows || 0 })
        }
        const fileCounts = new Map()
        for (const f of manifest.storage?.files || []) {
          const cur = fileCounts.get(f.bucket) || { files: 0, bytes: 0 }
          cur.files += 1
          cur.bytes += Number(f.size || 0)
          fileCounts.set(f.bucket, cur)
        }
        for (const [name, stats] of fileCounts) buckets.push({ name, files: stats.files, bytes: stats.bytes })
        for (const name of manifest.storage?.buckets || []) {
          if (!fileCounts.has(name)) buckets.push({ name, files: 0, bytes: 0 })
        }
      } catch (_) {
        // fall through
      }
    }

    if (!tables.length && dbEntry) {
      const dbBytes = await driveDownloadBytes(accessToken, dbEntry.id)
      const dbJson = JSON.parse(new TextDecoder().decode(dbBytes))
      if (dbJson.summary?.length) {
        for (const s of dbJson.summary) {
          if (s.status === 'ok' || (s.rows || 0) > 0) tables.push({ name: s.table, rows: s.rows || 0 })
        }
      }
      const data = dbJson.tables || dbJson.data || {}
      if (!tables.length) {
        for (const name of Object.keys(data)) tables.push({ name, rows: (data[name] || []).length })
      }
    }

    if (!buckets.length) {
      const storageFolder = rootFiles.find(
        (f) => f.name === 'storage' && f.mimeType === 'application/vnd.google-apps.folder',
      )
      if (storageFolder) {
        const children = await driveListChildren(accessToken, storageFolder.id)
        for (const child of children) {
          if (child.mimeType === 'application/vnd.google-apps.folder') {
            const files = await collectDriveFilesRecursive(accessToken, child.id)
            buckets.push({ name: child.name, files: files.length, bytes: 0 })
          }
        }
      }
    }
  }

  tables.sort((a, b) => a.name.localeCompare(b.name))
  buckets.sort((a, b) => a.name.localeCompare(b.name))

  return {
    ok: true,
    action: 'inspect',
    complete: !isLegacyFile,
    legacy_json: isLegacyFile,
    drive_backup_folder_id: folderId,
    tables,
    storage_buckets: buckets,
    table_count: tables.length,
    storage_bucket_count: buckets.length,
  }
}

async function runCompleteRestore(body, req) {
  await assertCallerCanRestore(req)

  const folderId = await resolveBackupFolderId(body)
  const selectedTables = asStringArray(body.tables ?? body.selected_tables)
  const selectedBuckets = asStringArray(body.storage_buckets ?? body.selected_storage_buckets)
  const filterTables = selectedTables !== null
  const filterBuckets = selectedBuckets !== null

  if (filterTables && selectedTables.length === 0 && filterBuckets && selectedBuckets.length === 0) {
    throw new Error('Select at least one table or storage bucket to restore')
  }

  const { accessToken } = await resolveAccessToken()
  let rootFiles = []
  try {
    rootFiles = await driveListChildren(accessToken, folderId)
  } catch (_) {
    rootFiles = []
  }

  const dbEntry = rootFiles.find((f) => f.name === 'database.json')
  const manifestEntry = rootFiles.find((f) => f.name === 'manifest.json')

  let data = {}
  let dbBytesLen = 0

  if (dbEntry) {
    const dbBytes = await driveDownloadBytes(accessToken, dbEntry.id)
    dbBytesLen = dbBytes.length
    const dbJson = JSON.parse(new TextDecoder().decode(dbBytes))
    data = dbJson.tables || dbJson.data || {}
  } else {
    const bytes = await driveDownloadBytes(accessToken, folderId)
    dbBytesLen = bytes.length
    const parsed = JSON.parse(new TextDecoder().decode(bytes))
    data = parsed.tables || parsed.data || {}
  }

  let tables = Object.keys(data)
  if (filterTables) {
    const allow = new Set(selectedTables)
    tables = tables.filter((t) => allow.has(t))
  }
  tables = tables.filter((t) => t !== 'cms_backup_log' && t !== 'cms_backup_settings')

  let restoredRows = 0
  const insertErrors = []

  if (tables.length) {
    const { error: truncErr } = await supabase.rpc('cms_truncate_tables', { p_tables: tables })
    if (truncErr) {
      throw new Error(
        `Truncate failed (${truncErr.message}). Run SQL migration 20260809_cms_complete_backup.sql first.`,
      )
    }

    const priority = [
      'roles', 'profiles', 'user_profiles', 'church_settings', 'churches', 'church_zones',
      'organization_units', 'cms_role_page_access', 'members', 'families',
    ]
    const ordered = [
      ...priority.filter((t) => tables.includes(t)),
      ...tables.filter((t) => !priority.includes(t)),
    ]

    for (const table of ordered) {
      const rows = data[table] || []
      if (!rows.length) continue
      for (let i = 0; i < rows.length; i += 200) {
        const chunk = rows.slice(i, i + 200)
        const { error } = await supabase.from(table).upsert(chunk, { onConflict: 'id' })
        if (error) {
          const { error: insErr } = await supabase.from(table).insert(chunk)
          if (insErr) insertErrors.push(`${table}: ${insErr.message}`)
          else restoredRows += chunk.length
        } else {
          restoredRows += chunk.length
        }
      }
    }
  }

  let restoredFiles = 0
  const storageErrors = []
  const storageFolder = rootFiles.find(
    (f) => f.name === 'storage' && f.mimeType === 'application/vnd.google-apps.folder',
  )
  const wantStorage = !filterBuckets || (selectedBuckets && selectedBuckets.length > 0)

  if (storageFolder && wantStorage) {
    let fileList = []
    if (manifestEntry) {
      try {
        const mBytes = await driveDownloadBytes(accessToken, manifestEntry.id)
        const manifest = JSON.parse(new TextDecoder().decode(mBytes))
        fileList = manifest.storage?.files || []
      } catch (_) {
        fileList = []
      }
    }
    if (!fileList.length) {
      const all = await collectDriveFilesRecursive(accessToken, storageFolder.id)
      for (const f of all) {
        const parts = f.path.split('/')
        const bucket = parts.shift()
        const path = parts.join('/')
        if (bucket && path) fileList.push({ bucket, path, drive_file_id: f.id })
      }
    }

    if (filterBuckets) {
      const allow = new Set(selectedBuckets)
      fileList = fileList.filter((f) => allow.has(f.bucket))
    }

    const { data: existingBuckets } = await supabase.storage.listBuckets()
    const existingNames = new Set((existingBuckets || []).map((b) => b.name))
    for (const bucket of new Set(fileList.map((f) => f.bucket))) {
      if (!existingNames.has(bucket)) {
        await supabase.storage.createBucket(bucket, { public: true }).catch(() => null)
      }
    }

    for (const file of fileList) {
      try {
        if (!file.drive_file_id) continue
        const bytes = await driveDownloadBytes(accessToken, file.drive_file_id)
        const { error: upErr } = await supabase.storage.from(file.bucket).upload(file.path, bytes, {
          contentType: file.mime || 'application/octet-stream',
          upsert: true,
        })
        if (upErr) storageErrors.push(`${file.bucket}/${file.path}: ${upErr.message}`)
        else restoredFiles += 1
      } catch (e) {
        storageErrors.push(`${file.bucket}/${file.path}: ${e.message || e}`)
      }
    }
  }

  const status = insertErrors.length && !restoredRows && !restoredFiles
    ? 'failed'
    : (insertErrors.length || storageErrors.length ? 'partial' : 'success')

  await supabase.from('cms_backup_log').insert({
    backup_type: 'full',
    kind: 'full',
    trigger_mode: 'manual',
    status,
    tables_count: tables.length,
    rows_count: restoredRows,
    file_size_bytes: dbBytesLen,
    drive_file_id: folderId,
    download_filename: `restore-${folderId}`,
    error_message: [...insertErrors, ...storageErrors].slice(0, 20).join(' | ') || null,
    meta: {
      action: 'restore',
      complete: true,
      selective: filterTables || filterBuckets,
      selected_tables: filterTables ? selectedTables : 'all',
      selected_storage_buckets: filterBuckets ? selectedBuckets : 'all',
      drive_backup_folder_id: folderId,
      restored_rows: restoredRows,
      restored_files: restoredFiles,
      insert_errors: insertErrors,
      storage_errors: storageErrors,
    },
    created_by_email: body.actor_email || null,
  })

  return {
    ok: true,
    action: 'restore',
    complete: true,
    status,
    tables: tables.length,
    restored_rows: restoredRows,
    restored_files: restoredFiles,
    selected_tables: filterTables ? selectedTables : tables,
    selected_storage_buckets: filterBuckets ? selectedBuckets : null,
    insert_errors: insertErrors,
    storage_errors: storageErrors,
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  try {
    const body = await req.json().catch(() => ({}))

    // Health / version probe used by Backup page Debug
    if (body.action === 'version' || body.action === 'ping') {
      return json({
        ok: true,
        complete_backup: true,
        version: COMPLETE_VERSION,
        supports: ['backup', 'inspect', 'restore'],
      })
    }

    if (body.action === 'inspect' || body.action === 'preview_restore') {
      return json(await inspectBackup(body, req))
    }

    if (body.action === 'restore') {
      const result = await runCompleteRestore(body, req)
      return json(result, result.status === 'failed' ? 500 : 200)
    }

    const result = await runCompleteBackup(body)
    if (result.skipped) return json(result)
    if (result.status === 'failed') return json({ error: 'Backup failed', ...result }, 500)
    return json(result)
  } catch (e) {
    console.error('cms-full-backup error', e)
    const message = (e && e.message) || String(e)
    try {
      await supabase.from('cms_backup_log').insert({
        backup_type: 'full',
        kind: 'full',
        trigger_mode: 'manual',
        status: 'failed',
        error_message: message,
        created_by_email: 'system',
      })
    } catch (_) {
      // ignore
    }
    return json({ error: message }, 500)
  }
})
