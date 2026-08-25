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
//   database.json , manifest.json
// ALL selected storage buckets use incremental SYNC under the parent Drive folder:
//   cms-storage-sync/<bucket>/... + sync-index.json
// (Legacy dated-run storage/ dumps are still readable on restore.)

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
const COMPLETE_VERSION = 7
/** Soft time budget per Edge invoke so we return before platform kill (~60–150s). */
const CHUNK_BUDGET_MS = 40_000
const MAX_FILES_PER_CHUNK = 6
const DEBUG_MAX = 100
/** Parent-folder incremental sync (not copied into each dated run folder). */
const SYNC_ROOT_NAME = 'cms-storage-sync'
const SYNC_INDEX_NAME = 'sync-index.json'
/** All storage buckets use sync (cms-backups is excluded earlier). */
const SYNC_ALL_STORAGE = true

function isSyncBucket(name) {
  const n = String(name || '')
  if (!n || n === 'cms-backups') return false
  return SYNC_ALL_STORAGE
}

function syncFileKey(bucket, path) {
  return `${bucket}/${path}`
}

function isSkippableStorageName(name) {
  const n = String(name || '')
  return !n || n.startsWith('.') || n === '.emptyFolderPlaceholder'
}

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
  'church_document_categories', 'church_documents',
  'receipts', 'receipt_items', 'receipt_financial_years', 'receipt_counters', 'receipt_sequences',
  'payment_categories', 'payment_pages', 'payment_page_versions',
  'declarations', 'declaration_items', 'decl_financial_years', 'funds',
  'chart_of_accounts', 'accounts', 'journal_entries', 'journal_entry_lines', 'journal_entry_sequences',
  'recurring_journal_templates', 'accounting_entities', 'bank_accounts',
  'simple_accounts', 'simple_categories', 'simple_transactions', 'transactions',
  'contribution_types', 'fee_plans', 'fee_structures', 'festival_periods',
  'voucher_counters', 'voucher_sequences',
  'announcements_log', 'announcement_settings', 'announcement_exclusions', 'bible_verses',
  'login_announcements', 'login_logs',
  'directory_categories', 'directory_contacts',
  'organization_units', 'page_permissions', 'roles', 'user_profiles',
  'devices', 'device_sessions', 'church_settings',
]

const KNOWN_BUCKETS = [
  'announcement-cards', 'announcement-reports', 'asset-photos', 'church-logos',
  'church-documents', 'auction-reports', 'fixed-asset-docs', 'family-records',
  'event-media', 'member-photos', 'member-reports', 'payment-pages', 'print-corner',
  'receipt-pdfs',
]

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

/** Indian stamp for Drive folder names: 11-08-2026_18:47 (IST, 24-hour) */
function formatBackupStampIST(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date)
  const get = (type: string) => parts.find((p) => p.type === type)?.value || ''
  const day = get('day').padStart(2, '0')
  const month = get('month').padStart(2, '0')
  const year = get('year')
  let hour = get('hour').padStart(2, '0')
  if (hour === '24') hour = '00'
  const minute = get('minute').padStart(2, '0')
  return `${day}-${month}-${year}_${hour}:${minute}`
}

function runFolderName(kind, date = new Date()) {
  const stamp = formatBackupStampIST(date)
  return kind === 'snapshot' ? `cms-snapshot_${stamp}` : `cms-backup_${stamp}`
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

async function buildDatabaseDump(kind, triggerMode, actorEmail, onProgress, tableFilter = null) {
  let tableNames = await listPublicTables()
  if (Array.isArray(tableFilter)) {
    const allow = new Set(tableFilter)
    tableNames = tableNames.filter((t) => allow.has(t))
  }
  const tables = {}
  const summary = []
  let totalRows = 0
  let okCount = 0
  const total = tableNames.length || 1

  if (!tableNames.length) {
    if (onProgress) await onProgress(40, 'No tables selected')
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
      tablesCount: 0,
      rowsCount: 0,
      summary,
    }
  }

  for (let i = 0; i < tableNames.length; i++) {
    const table = tableNames[i]
    if (onProgress) {
      // Database phase: 5% → 40%
      const pct = 5 + Math.round(((i + 1) / total) * 35)
      await onProgress(pct, `Reading table ${i + 1}/${total}: ${table}`)
    }
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

async function findNamedFolder(accessToken, parentId, name) {
  const children = await driveListChildren(accessToken, parentId)
  return children.find((f) => f.name === name && f.mimeType === 'application/vnd.google-apps.folder') || null
}

/** Permanently delete a Drive file/folder (404 = already gone). */
async function driveDeleteFile(accessToken, fileId) {
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (res.ok || res.status === 204 || res.status === 404) return
  const body = await res.json().catch(() => ({}))
  throw new Error(body?.error?.message || `Drive delete failed (${res.status})`)
}

/** Recursive list of files + folders under a Drive folder (relative paths). */
async function collectDriveTree(accessToken, folderId, prefix = '') {
  const children = await driveListChildren(accessToken, folderId)
  const out = []
  for (const child of children) {
    const path = prefix ? `${prefix}/${child.name}` : child.name
    if (child.mimeType === 'application/vnd.google-apps.folder') {
      out.push({ id: child.id, name: child.name, path, isFolder: true })
      out.push(...await collectDriveTree(accessToken, child.id, path))
    } else {
      if (isSkippableStorageName(child.name)) continue
      out.push({
        id: child.id,
        name: child.name,
        path,
        isFolder: false,
        size: child.size != null ? Number(child.size) : null,
      })
    }
  }
  return out
}

/**
 * Remove Drive files/folders that no longer exist in Supabase storage for this bucket.
 * Mutates syncIndex.files in place. Sync is then a true mirror (upload + prune).
 */
async function pruneDriveOrphans(accessToken, syncRootId, bucket, localFiles, syncIndex) {
  const localPaths = new Set(
    (localFiles || [])
      .filter((f) => f?.path && !isSkippableStorageName(String(f.path).split('/').pop()))
      .map((f) => f.path),
  )

  const deleted = []
  const errors = []

  // Drop stale index entries (and try deleting by stored Drive id)
  for (const key of Object.keys(syncIndex.files || {})) {
    const entry = syncIndex.files[key]
    if (!entry || entry.bucket !== bucket) continue
    if (localPaths.has(entry.path)) continue
    if (entry.drive_file_id) {
      try {
        await driveDeleteFile(accessToken, entry.drive_file_id)
        deleted.push({ path: entry.path, id: entry.drive_file_id, via: 'index' })
      } catch (e) {
        errors.push(`${entry.path}: ${e.message || e}`)
      }
    }
    delete syncIndex.files[key]
  }

  const bucketFolder = await findNamedFolder(accessToken, syncRootId, bucket)
  if (!bucketFolder) {
    return { deleted, errors, pruned: deleted.length, walked: 0 }
  }

  const tree = await collectDriveTree(accessToken, bucketFolder.id)
  // Files first
  for (const item of tree) {
    if (item.isFolder) continue
    if (localPaths.has(item.path)) continue
    try {
      await driveDeleteFile(accessToken, item.id)
      deleted.push({ path: item.path, id: item.id, via: 'walk' })
      const key = syncFileKey(bucket, item.path)
      if (syncIndex.files?.[key]) delete syncIndex.files[key]
    } catch (e) {
      errors.push(`${item.path}: ${e.message || e}`)
    }
  }

  // Empty folders deepest-first
  const folders = tree
    .filter((i) => i.isFolder)
    .sort((a, b) => b.path.split('/').length - a.path.split('/').length || b.path.length - a.path.length)

  for (const folder of folders) {
    const stillNeeded = [...localPaths].some(
      (p) => p === folder.path || p.startsWith(`${folder.path}/`),
    )
    if (stillNeeded) continue
    try {
      const children = await driveListChildren(accessToken, folder.id)
      if (children.length === 0) {
        await driveDeleteFile(accessToken, folder.id)
        deleted.push({ path: `${folder.path}/`, id: folder.id, via: 'empty-folder' })
      }
    } catch (e) {
      errors.push(`folder ${folder.path}: ${e.message || e}`)
    }
  }

  return { deleted, errors, pruned: deleted.length, walked: tree.length }
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

async function driveUpdateBytes(accessToken, fileId, bytes, mimeType) {
  const res = await fetch(
    `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media&fields=id,name,size`,
    {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': mimeType || 'application/octet-stream',
      },
      body: bytes,
    },
  )
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(data?.error?.message || `Drive update failed (${res.status})`)
  }
  return data
}

async function driveFindChildFile(accessToken, parentId, name) {
  const children = await driveListChildren(accessToken, parentId)
  return children.find((f) => f.name === name && f.mimeType !== 'application/vnd.google-apps.folder') || null
}

async function ensureSyncRoot(accessToken, parentDriveFolderId) {
  const root = await findOrCreateNamedFolder(accessToken, parentDriveFolderId, SYNC_ROOT_NAME)
  return root
}

async function loadSyncIndex(accessToken, syncRootId) {
  const empty = {
    format: 'cms-storage-sync-index',
    version: 1,
    updated_at: null,
    files: {},
    drive_file_id: null,
  }
  try {
    const existing = await driveFindChildFile(accessToken, syncRootId, SYNC_INDEX_NAME)
    if (!existing) return empty
    const bytes = await driveDownloadBytes(accessToken, existing.id)
    const parsed = JSON.parse(new TextDecoder().decode(bytes))
    return {
      format: 'cms-storage-sync-index',
      version: Number(parsed.version) || 1,
      updated_at: parsed.updated_at || null,
      files: parsed.files && typeof parsed.files === 'object' ? parsed.files : {},
      drive_file_id: existing.id,
    }
  } catch (_) {
    return empty
  }
}

async function saveSyncIndex(accessToken, syncRootId, index) {
  const payload = {
    format: 'cms-storage-sync-index',
    version: 1,
    updated_at: new Date().toISOString(),
    files: index.files || {},
  }
  const bytes = new TextEncoder().encode(JSON.stringify(payload, null, 2))
  if (index.drive_file_id) {
    const updated = await driveUpdateBytes(accessToken, index.drive_file_id, bytes, 'application/json')
    return { ...payload, drive_file_id: updated.id || index.drive_file_id }
  }
  const created = await driveUploadBytes(accessToken, syncRootId, SYNC_INDEX_NAME, bytes, 'application/json')
  return { ...payload, drive_file_id: created.id }
}

/**
 * Compare Supabase storage vs Drive folder contents (filename + size).
 * Never trust sync-index alone — stale Drive file IDs caused missing photos.
 */
async function buildSyncPending(accessToken, syncRootId, bucket, localFiles, syncIndex) {
  const pending = []
  let unchanged = 0
  const missingNames = []
  const files = (localFiles || []).filter((f) => !isSkippableStorageName(f.path.split('/').pop()))

  const bucketFolder = await findOrCreateNamedFolder(accessToken, syncRootId, bucket)
  const byDir = new Map()
  for (const f of files) {
    const parts = f.path.split('/')
    const fileName = parts.pop()
    const parentPath = parts.join('/')
    if (!byDir.has(parentPath)) byDir.set(parentPath, [])
    byDir.get(parentPath).push({ ...f, fileName })
  }

  for (const [parentPath, dirFiles] of byDir) {
    const parentId = parentPath
      ? await ensureNestedFolder(accessToken, bucketFolder.id, parentPath)
      : bucketFolder.id
    const children = await driveListChildren(accessToken, parentId)
    const onDriveByName = new Map()
    for (const child of children) {
      if (child.mimeType === 'application/vnd.google-apps.folder') continue
      if (isSkippableStorageName(child.name)) continue
      onDriveByName.set(child.name, child)
    }

    // Filename / count check for this folder
    for (const f of dirFiles) {
      if (!onDriveByName.has(f.fileName)) {
        missingNames.push(`${bucket}/${f.path}`)
      }
    }

    for (const f of dirFiles) {
      const key = syncFileKey(bucket, f.path)
      const prev = syncIndex.files?.[key]
      const onDrive = onDriveByName.get(f.fileName)
      const size = Number(f.size)
      const driveSize = onDrive?.size != null ? Number(onDrive.size) : NaN

      // Unchanged only when the file is present in the expected Drive folder with same size
      if (
        onDrive
        && Number.isFinite(size)
        && Number.isFinite(driveSize)
        && size === driveSize
      ) {
        unchanged += 1
        // Keep index fresh with the real Drive id for this folder
        if (prev?.drive_file_id !== onDrive.id || Number(prev?.size) !== size) {
          // lightweight: still unchanged for upload, but note id refresh via pending? skip upload
        }
        continue
      }

      pending.push({
        mode: 'sync',
        bucket,
        path: f.path,
        mime: f.mime,
        size: f.size,
        // Only reuse Drive id if the file is actually in this folder
        drive_file_id: onDrive?.id || null,
        action: onDrive ? 'update' : 'create',
      })
    }
  }

  return {
    pending,
    unchanged,
    missingNames,
    localCount: files.length,
    driveFileCount: [...byDir.keys()].length ? undefined : 0,
  }
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
        if (isSkippableStorageName(item.name)) continue
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

async function backupStorageToDrive(accessToken, runFolderId, onProgress) {
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

  if (onProgress) await onProgress(46, 'Listing storage files…')

  // Pre-count files for smoother % (best-effort)
  const filesByBucket = []
  let totalFiles = 0
  for (const bucket of bucketNames) {
    try {
      const files = await listAllStorageFiles(bucket)
      filesByBucket.push({ bucket, files })
      totalFiles += files.length
    } catch (e) {
      skipped.push(`bucket ${bucket}: ${e.message || e}`)
      filesByBucket.push({ bucket, files: [] })
    }
  }

  if (!totalFiles) {
    if (onProgress) await onProgress(90, 'No storage files to upload')
    return { storageMeta, skipped, totalBytes, fileCount, buckets: bucketNames }
  }

  const storageRoot = await findOrCreateNamedFolder(accessToken, runFolderId, 'storage')
  let doneFiles = 0

  for (const { bucket, files } of filesByBucket) {
    if (!files.length) continue
    const bucketFolder = await findOrCreateNamedFolder(accessToken, storageRoot.id, bucket)

    for (const file of files) {
      try {
        const { data: blob, error: dlErr } = await supabase.storage.from(bucket).download(file.path)
        if (dlErr || !blob) {
          skipped.push(`${bucket}/${file.path}: ${dlErr?.message || 'empty'}`)
          doneFiles += 1
          if (onProgress) {
            const pct = 48 + Math.round((doneFiles / totalFiles) * 42)
            await onProgress(pct, `Storage ${doneFiles}/${totalFiles}: ${bucket}/${file.path} (skipped)`)
          }
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
      doneFiles += 1
      if (onProgress) {
        const pct = 48 + Math.round((doneFiles / totalFiles) * 42)
        await onProgress(pct, `Uploading storage ${doneFiles}/${totalFiles}: ${bucket}/${file.path}`)
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

async function ensureProgressLog(body, kind, triggerMode, actorEmail) {
  let logId = body.progress_log_id || body.log_id || null
  if (logId) {
    await supabase.from('cms_backup_log').update({
      status: 'running',
      progress_pct: 1,
      progress_message: 'Starting complete backup…',
      kind,
      trigger_mode: triggerMode,
      backup_type: kind === 'snapshot' ? 'snapshot' : (triggerMode === 'automatic' ? 'scheduled' : 'full'),
    }).eq('id', logId)
    return logId
  }

  const { data, error } = await supabase.from('cms_backup_log').insert({
    backup_type: kind === 'snapshot' ? 'snapshot' : (triggerMode === 'automatic' ? 'scheduled' : 'full'),
    kind,
    trigger_mode: triggerMode,
    status: 'running',
    progress_pct: 1,
    progress_message: 'Starting complete backup…',
    created_by_email: actorEmail,
    created_by_name: body.actor_name || null,
  }).select('id').single()
  if (error) {
    console.warn('progress log insert failed', error.message)
    return null
  }
  return data?.id || null
}

async function setProgress(logId, pct, message, extra = {}) {
  if (!logId) return
  const patch = {
    progress_pct: Math.max(0, Math.min(100, Math.round(pct))),
    progress_message: String(message || '').slice(0, 500),
    ...extra,
  }
  const { error } = await supabase.from('cms_backup_log').update(patch).eq('id', logId)
  if (error) console.warn('progress update failed', error.message)
}

async function appendDebug(logId, step, detail = {}) {
  const line = {
    t: new Date().toISOString(),
    step,
    ...detail,
  }
  console.log('[cms-full-backup]', step, detail)
  if (!logId) return
  try {
    const { data } = await supabase.from('cms_backup_log').select('meta').eq('id', logId).maybeSingle()
    const meta = data?.meta && typeof data.meta === 'object' ? { ...data.meta } : {}
    const debug = Array.isArray(meta.debug) ? meta.debug.slice(-(DEBUG_MAX - 1)) : []
    debug.push(line)
    meta.debug = debug
    meta.last_debug = line
    await supabase.from('cms_backup_log').update({ meta }).eq('id', logId)
  } catch (e) {
    console.warn('appendDebug failed', e?.message || e)
  }
}

async function loadProgressLog(logId) {
  const { data, error } = await supabase.from('cms_backup_log').select('*').eq('id', logId).maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) throw new Error(`progress log not found: ${logId}`)
  return data
}

async function findDriveMissingSyncPending(accessToken, syncRootId, bucketNames) {
  const pending = []
  for (const bucket of bucketNames || []) {
    if (!isSyncBucket(bucket)) continue
    try {
      const local = await listAllStorageFiles(bucket)
      // Empty index → compare only against live Drive folder listing (filename + size)
      const diff = await buildSyncPending(accessToken, syncRootId, bucket, local, { files: {} })
      pending.push(...diff.pending)
    } catch (_) {
      // ignore per-bucket verify errors; main sync already logged list failures
    }
  }
  return pending
}

async function uploadStorageBatch(accessToken, runFolderId, pendingFiles, startIndex, onProgress, logId, options = {}) {
  const started = Date.now()
  const storageMeta = []
  const skipped = []
  let totalBytes = 0
  let fileCount = 0
  let i = startIndex
  const total = pendingFiles.length || 1
  const syncRootId = options.syncRootId || null

  let dumpStorageRoot = null
  const dumpBucketFolderCache = {}
  const syncBucketFolderCache = {}

  while (i < pendingFiles.length) {
    if (fileCount >= MAX_FILES_PER_CHUNK || (Date.now() - started) > CHUNK_BUDGET_MS) {
      await appendDebug(logId, 'chunk_budget_hit', {
        uploaded_this_chunk: fileCount,
        next_index: i,
        remaining: pendingFiles.length - i,
        elapsed_ms: Date.now() - started,
      })
      break
    }

    const file = pendingFiles[i]
    const isSync = file.mode === 'sync'
    const label = `${isSync ? 'sync:' : ''}${file.bucket}/${file.path}`
    try {
      await appendDebug(logId, 'storage_upload_start', {
        index: i + 1,
        total: pendingFiles.length,
        file: label,
        mode: isSync ? 'sync' : 'dump',
        action: file.action || 'create',
      })
      if (onProgress) {
        const pct = 48 + Math.round(((i + 1) / total) * 42)
        await onProgress(
          pct,
          isSync
            ? `Syncing storage ${i + 1}/${pendingFiles.length}: ${label}`
            : `Uploading storage ${i + 1}/${pendingFiles.length}: ${label}`,
        )
      }

      const { data: blob, error: dlErr } = await supabase.storage.from(file.bucket).download(file.path)
      if (dlErr || !blob) {
        skipped.push(`${label}: ${dlErr?.message || 'empty'}`)
        await appendDebug(logId, 'storage_download_fail', { file: label, error: dlErr?.message || 'empty' })
        i += 1
        continue
      }

      const bytes = new Uint8Array(await blob.arrayBuffer())
      const mime = file.mime || blob.type || 'application/octet-stream'
      let uploaded

      if (isSync) {
        if (!syncRootId) throw new Error('sync root folder missing for sync upload')
        if (!syncBucketFolderCache[file.bucket]) {
          syncBucketFolderCache[file.bucket] = await findOrCreateNamedFolder(accessToken, syncRootId, file.bucket)
        }
        const bucketFolder = syncBucketFolderCache[file.bucket]
        const parts = file.path.split('/')
        const fileName = parts.pop()
        const parentPath = parts.join('/')
        const parentId = parentPath
          ? await ensureNestedFolder(accessToken, bucketFolder.id, parentPath)
          : bucketFolder.id

        // Always resolve by name inside the expected folder — never update a stale file id elsewhere
        const existingInFolder = await driveFindChildFile(accessToken, parentId, fileName)
        if (existingInFolder) {
          uploaded = await driveUpdateBytes(accessToken, existingInFolder.id, bytes, mime)
        } else if (file.drive_file_id) {
          // Stale index pointed elsewhere / deleted — create a fresh copy in the correct folder
          await appendDebug(logId, 'sync_stale_id_recreate', {
            file: label,
            stale_id: file.drive_file_id,
          })
          uploaded = await driveUploadBytes(accessToken, parentId, fileName, bytes, mime)
        } else {
          uploaded = await driveUploadBytes(accessToken, parentId, fileName, bytes, mime)
        }
      } else {
        if (!dumpStorageRoot) {
          dumpStorageRoot = await findOrCreateNamedFolder(accessToken, runFolderId, 'storage')
        }
        if (!dumpBucketFolderCache[file.bucket]) {
          dumpBucketFolderCache[file.bucket] = await findOrCreateNamedFolder(accessToken, dumpStorageRoot.id, file.bucket)
        }
        const bucketFolder = dumpBucketFolderCache[file.bucket]
        const parts = file.path.split('/')
        const fileName = parts.pop()
        const parentPath = parts.join('/')
        const parentId = parentPath
          ? await ensureNestedFolder(accessToken, bucketFolder.id, parentPath)
          : bucketFolder.id
        uploaded = await driveUploadBytes(accessToken, parentId, fileName, bytes, mime)
      }

      storageMeta.push({
        bucket: file.bucket,
        path: file.path,
        size: bytes.length,
        mime,
        drive_file_id: uploaded.id,
        mode: isSync ? 'sync' : 'dump',
        action: file.action || (isSync && file.drive_file_id ? 'update' : 'create'),
      })
      totalBytes += bytes.length
      fileCount += 1
      await appendDebug(logId, 'storage_upload_ok', {
        index: i + 1,
        file: label,
        bytes: bytes.length,
        drive_file_id: uploaded.id,
        mode: isSync ? 'sync' : 'dump',
      })
    } catch (e) {
      skipped.push(`${label}: ${e.message || e}`)
      await appendDebug(logId, 'storage_upload_error', { file: label, error: e.message || String(e) })
    }
    i += 1
  }

  return {
    nextIndex: i,
    storageMeta,
    skipped,
    totalBytes,
    fileCount,
    done: i >= pendingFiles.length,
    elapsed_ms: Date.now() - started,
  }
}

async function finalizeBackup(progressLogId, state, authVia, onProgress) {
  const {
    accessToken,
    runFolder,
    built,
    dbFile,
    dbBytesLen,
    storageMeta,
    skipped,
    storageBytes,
    storageBuckets,
    kind,
    triggerMode,
    actorEmail,
    actorName,
    syncRootId = null,
    syncIndex = null,
    syncUnchanged = 0,
    syncPruned = 0,
    parentDriveFolderId = null,
  } = state

  // Persist updated sync index after uploads
  let savedSyncIndex = syncIndex
  const syncFilesMeta = (storageMeta || []).filter((f) => f.mode === 'sync')
  if (syncRootId && syncIndex) {
    await onProgress(92, 'Updating storage sync index…')
    const nextFiles = { ...(syncIndex.files || {}) }
    for (const f of syncFilesMeta) {
      nextFiles[syncFileKey(f.bucket, f.path)] = {
        bucket: f.bucket,
        path: f.path,
        size: f.size,
        mime: f.mime,
        drive_file_id: f.drive_file_id,
        updated_at: new Date().toISOString(),
      }
    }
    try {
      savedSyncIndex = await saveSyncIndex(accessToken, syncRootId, {
        ...syncIndex,
        files: nextFiles,
      })
      await appendDebug(progressLogId, 'sync_index_saved', {
        files_tracked: Object.keys(nextFiles).length,
        uploaded_this_run: syncFilesMeta.length,
        unchanged: syncUnchanged,
        pruned: syncPruned,
      })
    } catch (e) {
      skipped.push(`sync-index: ${e.message || e}`)
      await appendDebug(progressLogId, 'sync_index_save_fail', { error: e.message || String(e) })
    }
  }

  await onProgress(93, 'Writing manifest.json…')
  await appendDebug(progressLogId, 'manifest_start', { files: storageMeta.length })

  const dumpFiles = (storageMeta || []).filter((f) => f.mode !== 'sync')
  const syncBucketsUsed = [...new Set([
    ...(storageBuckets || []),
    ...syncFilesMeta.map((f) => f.bucket),
  ].filter(Boolean))]

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
      bytes: dbBytesLen,
      tables: built.tablesCount,
      rows: built.rowsCount,
      summary: built.summary,
    },
    storage: {
      file_count: dumpFiles.length,
      bytes: dumpFiles.reduce((n, f) => n + Number(f.size || 0), 0),
      buckets: dumpFiles.length ? [...new Set(dumpFiles.map((f) => f.bucket))] : [],
      files: dumpFiles,
      skipped,
    },
    sync: {
      root_folder_id: syncRootId,
      root_folder_name: SYNC_ROOT_NAME,
      parent_drive_folder_id: parentDriveFolderId,
      all_storage: true,
      buckets: syncBucketsUsed,
      uploaded: syncFilesMeta.length,
      unchanged: syncUnchanged,
      pruned: syncPruned,
      index_file_id: savedSyncIndex?.drive_file_id || null,
      files: syncFilesMeta,
    },
    total_bytes: dbBytesLen + storageBytes,
  }
  const manifestBytes = new TextEncoder().encode(JSON.stringify(manifest, null, 2))
  const manifestFile = await driveUploadBytes(
    accessToken,
    runFolder.id,
    'manifest.json',
    manifestBytes,
    'application/json',
  )

  const totalBytes = dbBytesLen + storageBytes
  const status = skipped.length && !storageMeta.length && built.tablesCount === 0 && syncUnchanged === 0
    ? 'failed'
    : (skipped.length || built.summary.some((s) => s.status === 'error') ? 'partial' : 'success')

  const finalMessage = status === 'success'
    ? `Complete: ${built.tablesCount} tables, ${dumpFiles.length} dump file(s), sync ${syncFilesMeta.length} new/changed (${syncUnchanged} unchanged${syncPruned ? `, ${syncPruned} pruned` : ''})`
    : status === 'partial'
      ? `Partial: ${built.tablesCount} tables, ${storageMeta.length} files (${skipped.length} storage issues)`
      : 'Backup failed'

  const { data: existing } = await supabase.from('cms_backup_log').select('meta').eq('id', progressLogId).maybeSingle()
  const prevMeta = existing?.meta && typeof existing.meta === 'object' ? existing.meta : {}

  const finalRow = {
    backup_type: kind === 'snapshot' ? 'snapshot' : (triggerMode === 'automatic' ? 'scheduled' : 'full'),
    kind,
    trigger_mode: triggerMode,
    status,
    progress_pct: 100,
    progress_message: finalMessage,
    tables_count: built.tablesCount,
    rows_count: built.rowsCount,
    file_size_bytes: totalBytes,
    drive_file_id: runFolder.id,
    drive_web_link: runFolder.webViewLink || null,
    download_filename: runFolder.name,
    error_message: [
      ...built.summary.filter((s) => s.status === 'error' || s.status === 'skipped').map((s) => `${s.table}: ${s.error || s.status}`),
      ...skipped.slice(0, 15),
    ].slice(0, 20).join(' | ') || null,
    meta: {
      ...prevMeta,
      complete: true,
      version: COMPLETE_VERSION,
      chunked: true,
      sync: true,
      pending_files: [],
      file_index: storageMeta.length,
      drive_backup_folder_id: runFolder.id,
      drive_backup_folder_name: runFolder.name,
      drive_manifest_file_id: manifestFile.id,
      drive_database_file_id: dbFile.id,
      database_bytes: dbBytesLen,
      storage_bytes: storageBytes,
      storage_file_count: storageMeta.length,
      storage_buckets: storageBuckets,
      storage_files: storageMeta,
      sync_root_folder_id: syncRootId,
      sync_unchanged: syncUnchanged,
      sync_pruned: syncPruned,
      sync_uploaded: syncFilesMeta.length,
      sync_index_file_id: savedSyncIndex?.drive_file_id || null,
      summary: built.summary,
      skipped_storage: skipped,
      auth_via: authVia,
    },
    created_by_email: actorEmail,
    created_by_name: actorName || null,
  }

  if (progressLogId) {
    await supabase.from('cms_backup_log').update(finalRow).eq('id', progressLogId)
  } else {
    await supabase.from('cms_backup_log').insert(finalRow)
  }

  await appendDebug(progressLogId, 'backup_finalized', {
    status,
    files: storageMeta.length,
    sync_uploaded: syncFilesMeta.length,
    sync_unchanged: syncUnchanged,
    sync_pruned: syncPruned,
    bytes: totalBytes,
  })

  return {
    ok: true,
    status,
    kind,
    complete: true,
    done: true,
    continue: false,
    version: COMPLETE_VERSION,
    progress_log_id: progressLogId,
    filename: runFolder.name,
    folder_id: runFolder.id,
    drive_file_id: runFolder.id,
    drive_web_link: runFolder.webViewLink || null,
    tables_count: built.tablesCount,
    rows_count: built.rowsCount,
    file_size_bytes: totalBytes,
    database_bytes: dbBytesLen,
    storage_bytes: storageBytes,
    storage_file_count: storageMeta.length,
    sync_uploaded: syncFilesMeta.length,
    sync_unchanged: syncUnchanged,
    sync_pruned: syncPruned,
    skipped_storage: skipped,
  }
}

async function continueCompleteBackup(body) {
  const progressLogId = body.progress_log_id || body.log_id
  if (!progressLogId) throw new Error('progress_log_id required to continue backup')

  const log = await loadProgressLog(progressLogId)
  const meta = log.meta && typeof log.meta === 'object' ? log.meta : {}
  if (!meta.drive_backup_folder_id) {
    throw new Error('Cannot continue: no Drive folder on this backup log. Start a new Complete Backup.')
  }

  const onProgress = async (pct, message) => setProgress(progressLogId, pct, message, { status: 'running' })
  await appendDebug(progressLogId, 'continue_start', {
    file_index: meta.file_index || 0,
    pending: (meta.pending_files || []).length,
  })

  const { accessToken, via: authVia } = await resolveAccessToken()
  const pendingFiles = Array.isArray(meta.pending_files) ? meta.pending_files : []
  const startIndex = Number(meta.file_index || 0)
  const prevMetaFiles = Array.isArray(meta.storage_files) ? meta.storage_files : []
  const prevSkipped = Array.isArray(meta.skipped_storage) ? meta.skipped_storage : []

  const batch = await uploadStorageBatch(
    accessToken,
    meta.drive_backup_folder_id,
    pendingFiles,
    startIndex,
    onProgress,
    progressLogId,
    { syncRootId: meta.sync_root_folder_id || null },
  )

  const storageMeta = [...prevMetaFiles, ...batch.storageMeta]
  const skipped = [...prevSkipped, ...batch.skipped]
  const storageBytes = (Number(meta.storage_bytes) || 0) + batch.totalBytes

  const nextMeta = {
    ...meta,
    file_index: batch.nextIndex,
    storage_files: storageMeta,
    skipped_storage: skipped,
    storage_bytes: storageBytes,
    storage_file_count: storageMeta.length,
    last_chunk: {
      uploaded: batch.fileCount,
      next_index: batch.nextIndex,
      done: batch.done,
      elapsed_ms: batch.elapsed_ms,
    },
  }

  await supabase.from('cms_backup_log').update({
    status: 'running',
    meta: nextMeta,
    progress_message: batch.done
      ? 'Storage done — finalizing…'
      : `Storage ${batch.nextIndex}/${pendingFiles.length} uploaded (chunked)…`,
    progress_pct: batch.done ? 92 : (48 + Math.round((batch.nextIndex / Math.max(pendingFiles.length, 1)) * 42)),
  }).eq('id', progressLogId)

  if (!batch.done) {
    await appendDebug(progressLogId, 'continue_more', {
      next_index: batch.nextIndex,
      remaining: pendingFiles.length - batch.nextIndex,
    })
    return {
      ok: true,
      complete: true,
      done: false,
      continue: true,
      version: COMPLETE_VERSION,
      progress_log_id: progressLogId,
      status: 'running',
      storage_file_count: storageMeta.length,
      pending_remaining: pendingFiles.length - batch.nextIndex,
      chunk: batch,
    }
  }

  // Filename/count verify against Drive folders before finalize
  if (meta.sync_root_folder_id) {
    await onProgress(91, 'Verifying Drive filenames / counts…')
    const missing = await findDriveMissingSyncPending(
      accessToken,
      meta.sync_root_folder_id,
      meta.storage_buckets || [],
    )
    const uploadedKeys = new Set(
      storageMeta.filter((f) => f.mode === 'sync').map((f) => `${f.bucket}/${f.path}`),
    )
    const stillMissing = missing.filter((f) => !uploadedKeys.has(`${f.bucket}/${f.path}`))
    if (stillMissing.length) {
      const newPending = [...pendingFiles, ...stillMissing]
      const newIndex = pendingFiles.length
      await appendDebug(progressLogId, 'sync_verify_missing', {
        count: stillMissing.length,
        sample: stillMissing.slice(0, 20).map((f) => `${f.bucket}/${f.path}`),
      })
      await supabase.from('cms_backup_log').update({
        status: 'running',
        progress_pct: 91,
        progress_message: `Sync verify: ${stillMissing.length} missing — uploading…`,
        meta: {
          ...nextMeta,
          pending_files: newPending,
          file_index: newIndex,
          sync_verify_missing: stillMissing.length,
        },
      }).eq('id', progressLogId)
      return {
        ok: true,
        complete: true,
        done: false,
        continue: true,
        version: COMPLETE_VERSION,
        progress_log_id: progressLogId,
        status: 'running',
        storage_file_count: storageMeta.length,
        pending_remaining: stillMissing.length,
        sync_verify_missing: stillMissing.length,
      }
    }
    await appendDebug(progressLogId, 'sync_verify_ok', {
      buckets: (meta.storage_buckets || []).length,
    })
  }

  // Rebuild state for finalize from meta + Drive
  const runFolder = {
    id: meta.drive_backup_folder_id,
    name: meta.drive_backup_folder_name || log.download_filename,
    webViewLink: log.drive_web_link,
  }
  const built = {
    tablesCount: log.tables_count || meta.summary?.filter?.((s) => s.status === 'ok')?.length || 0,
    rowsCount: log.rows_count || 0,
    summary: meta.summary || [],
  }
  const dbFile = { id: meta.drive_database_file_id }
  const kind = log.kind === 'snapshot' ? 'snapshot' : 'full'
  const triggerMode = log.trigger_mode === 'automatic' ? 'automatic' : 'manual'

  let syncIndex = null
  if (meta.sync_root_folder_id) {
    syncIndex = await loadSyncIndex(accessToken, meta.sync_root_folder_id)
  }

  return finalizeBackup(progressLogId, {
    accessToken,
    runFolder,
    built,
    dbFile,
    dbBytesLen: Number(meta.database_bytes) || 0,
    storageMeta,
    skipped,
    storageBytes,
    storageBuckets: meta.storage_buckets || [],
    kind,
    triggerMode,
    actorEmail: log.created_by_email,
    actorName: log.created_by_name,
    syncRootId: meta.sync_root_folder_id || null,
    syncIndex,
    syncUnchanged: Number(meta.sync_unchanged) || 0,
    syncPruned: Number(meta.sync_pruned) || 0,
    parentDriveFolderId: meta.parent_drive_folder_id || null,
  }, authVia, onProgress)
}

async function resolveBackupSelection(body) {
  // Explicit request body wins; otherwise use saved settings (for automatic cron too)
  let tables = asStringArray(body.tables ?? body.selected_tables)
  let storageBuckets = asStringArray(body.storage_buckets ?? body.selected_storage_buckets)

  if (tables === null || storageBuckets === null) {
    const { data: settings } = await supabase
      .from('cms_backup_settings')
      .select('backup_selection')
      .eq('id', 1)
      .maybeSingle()
    const sel = settings?.backup_selection && typeof settings.backup_selection === 'object'
      ? settings.backup_selection
      : {}
    if (tables === null && Object.prototype.hasOwnProperty.call(sel, 'tables')) {
      tables = asStringArray(sel.tables)
      // asStringArray(null) returns null — good (means all)
      // but if sel.tables is explicitly null, asStringArray gets null → null (all)
      if (sel.tables === null) tables = null
      else if (Array.isArray(sel.tables)) tables = sel.tables.map(String).filter(Boolean)
    }
    if (storageBuckets === null && Object.prototype.hasOwnProperty.call(sel, 'storage_buckets')) {
      if (sel.storage_buckets === null) storageBuckets = null
      else if (Array.isArray(sel.storage_buckets)) storageBuckets = sel.storage_buckets.map(String).filter(Boolean)
    }
  }

  return { tables, storageBuckets }
}

async function listBackupSources() {
  const tableNames = await listPublicTables()
  const tables = tableNames.map((name) => ({ name }))

  const { data: buckets, error } = await supabase.storage.listBuckets()
  if (error) throw new Error(`listBuckets: ${error.message}`)
  const bucketNames = (buckets || []).map((b) => b.name).filter((n) => n !== 'cms-backups')
  for (const known of KNOWN_BUCKETS) {
    if (!bucketNames.includes(known)) bucketNames.push(known)
  }
  bucketNames.sort()

  const storage_buckets = []
  for (const name of bucketNames) {
    let files = 0
    try {
      files = (await listAllStorageFiles(name)).length
    } catch (_) {
      files = 0
    }
    storage_buckets.push({ name, files, sync: true })
  }

  const { data: settings } = await supabase
    .from('cms_backup_settings')
    .select('backup_selection')
    .eq('id', 1)
    .maybeSingle()

  return {
    ok: true,
    action: 'list_sources',
    tables,
    storage_buckets,
    sync_buckets: 'all',
    sync_all_storage: true,
    selection: settings?.backup_selection || { tables: null, storage_buckets: null },
  }
}

async function runCompleteBackup(body) {
  // Resume path
  if (body.action === 'backup_continue' || body.phase === 'continue') {
    return continueCompleteBackup(body)
  }

  const kind = body.kind === 'snapshot' ? 'snapshot' : 'full'
  const triggerMode = body.trigger_mode === 'automatic' ? 'automatic' : 'manual'
  const actorEmail = body.actor_email || (triggerMode === 'automatic' ? 'cron' : null)
  const folderId = await resolveFolderId(body.drive_folder_id || null)
  if (!folderId) throw new Error('Google Drive folder ID not configured')

  const { data: settingsRow } = await supabase.from('cms_backup_settings').select('*').eq('id', 1).maybeSingle()
  if (triggerMode === 'automatic') {
    if (kind === 'full' && settingsRow && settingsRow.full_auto_enabled === false) {
      return { ok: true, skipped: true, reason: 'Full auto backup disabled' }
    }
    if (kind === 'snapshot' && settingsRow && settingsRow.snapshot_auto_enabled === false) {
      return { ok: true, skipped: true, reason: 'Snapshot auto disabled' }
    }
  }

  const selection = await resolveBackupSelection(body)
  // Need at least tables or storage
  if (Array.isArray(selection.tables) && selection.tables.length === 0
    && Array.isArray(selection.storageBuckets) && selection.storageBuckets.length === 0) {
    throw new Error('Nothing selected to back up. Choose at least one table or storage bucket.')
  }

  const progressLogId = await ensureProgressLog(body, kind, triggerMode, actorEmail)
  const onProgress = async (pct, message) => setProgress(progressLogId, pct, message)

  try {
    await appendDebug(progressLogId, 'backup_start', {
      kind,
      triggerMode,
      version: COMPLETE_VERSION,
      selection: {
        tables: selection.tables === null ? 'all' : selection.tables,
        storage_buckets: selection.storageBuckets === null ? 'all' : selection.storageBuckets,
      },
    })
    await onProgress(2, 'Connecting to Google Drive…')
    const { accessToken, via: authVia } = await resolveAccessToken()
    await appendDebug(progressLogId, 'google_auth_ok', { via: authVia })

    await onProgress(4, 'Creating Drive backup folder…')
    const runName = runFolderName(kind)
    const runFolder = await driveCreateFolder(accessToken, runName, folderId)
    await appendDebug(progressLogId, 'drive_folder_created', { id: runFolder.id, name: runFolder.name })

    const built = await buildDatabaseDump(
      kind,
      triggerMode,
      actorEmail,
      onProgress,
      selection.tables, // null = all
    )
    await appendDebug(progressLogId, 'db_dump_done', { tables: built.tablesCount, rows: built.rowsCount })

    await onProgress(42, `Uploading database.json (${built.tablesCount} tables, ${built.rowsCount} rows)…`)
    const dbJson = JSON.stringify(built.payload)
    const dbBytes = new TextEncoder().encode(dbJson)
    const dbFile = await driveUploadBytes(accessToken, runFolder.id, 'database.json', dbBytes, 'application/json')
    await appendDebug(progressLogId, 'database_json_uploaded', { bytes: dbBytes.length, file_id: dbFile.id })

    await onProgress(45, 'Listing storage files…')
    const { data: buckets, error: bucketErr } = await supabase.storage.listBuckets()
    if (bucketErr) throw new Error(`listBuckets: ${bucketErr.message}`)
    let bucketNames = (buckets || []).map((b) => b.name).filter((n) => n !== 'cms-backups')
    for (const known of KNOWN_BUCKETS) {
      if (!bucketNames.includes(known)) bucketNames.push(known)
    }
    if (Array.isArray(selection.storageBuckets)) {
      const allow = new Set(selection.storageBuckets)
      bucketNames = bucketNames.filter((n) => allow.has(n))
      await appendDebug(progressLogId, 'storage_filtered', {
        selected: selection.storageBuckets,
        effective: bucketNames,
      })
    }

    const syncBuckets = bucketNames
    const dumpBuckets = []

    let syncRootId = null
    let syncIndex = null
    let syncUnchanged = 0
    let syncPruned = 0
    const syncPruneErrors = []
    const pendingFiles = []
    const listSkipped = []

    if (!bucketNames.length) {
      await appendDebug(progressLogId, 'storage_skipped', { reason: 'no buckets selected' })
      if (onProgress) await onProgress(90, 'Skipping storage (none selected)')
    }

    // All storage buckets → parent cms-storage-sync; only new/changed files
    if (syncBuckets.length) {
      await onProgress(46, 'Checking storage sync (new/changed only)…')
      const syncRoot = await ensureSyncRoot(accessToken, folderId)
      syncRootId = syncRoot.id
      syncIndex = await loadSyncIndex(accessToken, syncRootId)
      await appendDebug(progressLogId, 'sync_root_ready', {
        id: syncRootId,
        tracked: Object.keys(syncIndex.files || {}).length,
        buckets: syncBuckets,
        all_storage: true,
      })

      for (const bucket of syncBuckets) {
        try {
          const files = await listAllStorageFiles(bucket)
          const diff = await buildSyncPending(accessToken, syncRootId, bucket, files, syncIndex)
          syncUnchanged += diff.unchanged
          pendingFiles.push(...diff.pending)
          await appendDebug(progressLogId, 'bucket_listed', {
            bucket,
            files: files.length,
            mode: 'sync',
            pending: diff.pending.length,
            unchanged: diff.unchanged,
            missing_on_drive: diff.missingNames?.length || 0,
            missing_sample: (diff.missingNames || []).slice(0, 10),
          })
          if (diff.missingNames?.length) {
            await appendDebug(progressLogId, 'sync_filename_count_mismatch', {
              bucket,
              local_files: diff.localCount,
              missing: diff.missingNames.slice(0, 30),
            })
          }

          // Mirror deletions: remove Drive files that no longer exist in Supabase
          await onProgress(46, `Pruning deleted files from Drive sync (${bucket})…`)
          const pruned = await pruneDriveOrphans(accessToken, syncRootId, bucket, files, syncIndex)
          syncPruned += pruned.pruned || 0
          if (pruned.errors?.length) syncPruneErrors.push(...pruned.errors.map((e) => `${bucket}: ${e}`))
          await appendDebug(progressLogId, 'sync_prune', {
            bucket,
            pruned: pruned.pruned || 0,
            walked: pruned.walked || 0,
            sample: (pruned.deleted || []).slice(0, 15).map((d) => d.path),
            errors: (pruned.errors || []).slice(0, 10),
          })
        } catch (e) {
          listSkipped.push(`bucket ${bucket}: ${e.message || e}`)
          await appendDebug(progressLogId, 'bucket_list_fail', { bucket, error: e.message || String(e) })
        }
      }

      // Persist pruned index immediately so chunked continues don't revive deleted keys
      if (syncPruned > 0 && syncIndex) {
        try {
          syncIndex = await saveSyncIndex(accessToken, syncRootId, syncIndex)
          await appendDebug(progressLogId, 'sync_index_saved_after_prune', {
            pruned: syncPruned,
            tracked: Object.keys(syncIndex.files || {}).length,
          })
        } catch (e) {
          listSkipped.push(`sync-index after prune: ${e.message || e}`)
        }
      }
      if (syncPruneErrors.length) {
        listSkipped.push(...syncPruneErrors.slice(0, 20))
      }
    }

    await appendDebug(progressLogId, 'storage_list_done', {
      total_pending: pendingFiles.length,
      dump_buckets: dumpBuckets,
      sync_buckets: syncBuckets,
      sync_unchanged: syncUnchanged,
      all_storage_sync: true,
    })

    // Persist job state before first storage chunk (survives timeout)
    await supabase.from('cms_backup_log').update({
      status: 'running',
      tables_count: built.tablesCount,
      rows_count: built.rowsCount,
      drive_file_id: runFolder.id,
      drive_web_link: runFolder.webViewLink || null,
      download_filename: runFolder.name,
      progress_pct: 47,
      progress_message: pendingFiles.length
        ? `Uploading/syncing storage 0/${pendingFiles.length}… (${syncUnchanged} unchanged${syncPruned ? `, ${syncPruned} pruned` : ''} skipped)`
        : (syncUnchanged || syncPruned
          ? `Storage sync up to date (${syncUnchanged} unchanged${syncPruned ? `, ${syncPruned} pruned from Drive` : ''}) — finalizing…`
          : 'No storage files — finalizing…'),
      meta: {
        complete: true,
        version: COMPLETE_VERSION,
        chunked: true,
        sync: true,
        selection: {
          tables: selection.tables === null ? 'all' : selection.tables,
          storage_buckets: selection.storageBuckets === null ? 'all' : selection.storageBuckets,
        },
        drive_backup_folder_id: runFolder.id,
        drive_backup_folder_name: runFolder.name,
        drive_database_file_id: dbFile.id,
        database_bytes: dbBytes.length,
        summary: built.summary,
        storage_buckets: bucketNames,
        pending_files: pendingFiles,
        file_index: 0,
        storage_files: [],
        skipped_storage: listSkipped,
        storage_bytes: 0,
        auth_via: authVia,
        sync_root_folder_id: syncRootId,
        sync_index_file_id: syncIndex?.drive_file_id || null,
        sync_unchanged: syncUnchanged,
        sync_pruned: syncPruned,
        parent_drive_folder_id: folderId,
      },
    }).eq('id', progressLogId)

    if (!pendingFiles.length) {
      return finalizeBackup(progressLogId, {
        accessToken,
        runFolder,
        built,
        dbFile,
        dbBytesLen: dbBytes.length,
        storageMeta: [],
        skipped: listSkipped,
        storageBytes: 0,
        storageBuckets: bucketNames,
        kind,
        triggerMode,
        actorEmail,
        actorName: body.actor_name || null,
        syncRootId,
        syncIndex,
        syncUnchanged,
        syncPruned,
        parentDriveFolderId: folderId,
      }, authVia, onProgress)
    }

    const batch = await uploadStorageBatch(
      accessToken,
      runFolder.id,
      pendingFiles,
      0,
      onProgress,
      progressLogId,
      { syncRootId },
    )

    const storageMeta = batch.storageMeta
    const skipped = [...listSkipped, ...batch.skipped]

    await supabase.from('cms_backup_log').update({
      status: 'running',
      progress_pct: batch.done ? 92 : (48 + Math.round((batch.nextIndex / pendingFiles.length) * 42)),
      progress_message: batch.done
        ? 'Storage done — finalizing…'
        : `Storage ${batch.nextIndex}/${pendingFiles.length} (will continue in next chunk)…`,
      meta: {
        complete: true,
        version: COMPLETE_VERSION,
        chunked: true,
        sync: true,
        selection: {
          tables: selection.tables === null ? 'all' : selection.tables,
          storage_buckets: selection.storageBuckets === null ? 'all' : selection.storageBuckets,
        },
        drive_backup_folder_id: runFolder.id,
        drive_backup_folder_name: runFolder.name,
        drive_database_file_id: dbFile.id,
        database_bytes: dbBytes.length,
        summary: built.summary,
        storage_buckets: bucketNames,
        pending_files: pendingFiles,
        file_index: batch.nextIndex,
        storage_files: storageMeta,
        skipped_storage: skipped,
        storage_bytes: batch.totalBytes,
        storage_file_count: storageMeta.length,
        auth_via: authVia,
        sync_root_folder_id: syncRootId,
        sync_index_file_id: syncIndex?.drive_file_id || null,
        sync_unchanged: syncUnchanged,
        sync_pruned: syncPruned,
        parent_drive_folder_id: folderId,
        last_chunk: {
          uploaded: batch.fileCount,
          next_index: batch.nextIndex,
          done: batch.done,
          elapsed_ms: batch.elapsed_ms,
        },
      },
    }).eq('id', progressLogId)

    if (!batch.done) {
      await appendDebug(progressLogId, 'start_chunk_incomplete', {
        next_index: batch.nextIndex,
        remaining: pendingFiles.length - batch.nextIndex,
      })
      return {
        ok: true,
        complete: true,
        done: false,
        continue: true,
        version: COMPLETE_VERSION,
        progress_log_id: progressLogId,
        status: 'running',
        kind,
        filename: runFolder.name,
        folder_id: runFolder.id,
        drive_file_id: runFolder.id,
        drive_web_link: runFolder.webViewLink || null,
        tables_count: built.tablesCount,
        rows_count: built.rowsCount,
        storage_file_count: storageMeta.length,
        pending_remaining: pendingFiles.length - batch.nextIndex,
        chunk: batch,
      }
    }

    // Filename/count verify against Drive before finalize
    if (syncRootId) {
      await onProgress(91, 'Verifying Drive filenames / counts…')
      const missing = await findDriveMissingSyncPending(accessToken, syncRootId, bucketNames)
      const uploadedKeys = new Set(
        storageMeta.filter((f) => f.mode === 'sync').map((f) => `${f.bucket}/${f.path}`),
      )
      const stillMissing = missing.filter((f) => !uploadedKeys.has(`${f.bucket}/${f.path}`))
      if (stillMissing.length) {
        const newPending = [...pendingFiles, ...stillMissing]
        await appendDebug(progressLogId, 'sync_verify_missing', {
          count: stillMissing.length,
          sample: stillMissing.slice(0, 20).map((f) => `${f.bucket}/${f.path}`),
        })
        await supabase.from('cms_backup_log').update({
          status: 'running',
          progress_pct: 91,
          progress_message: `Sync verify: ${stillMissing.length} missing — uploading…`,
          meta: {
            complete: true,
            version: COMPLETE_VERSION,
            chunked: true,
            sync: true,
            drive_backup_folder_id: runFolder.id,
            drive_backup_folder_name: runFolder.name,
            drive_database_file_id: dbFile.id,
            database_bytes: dbBytes.length,
            summary: built.summary,
            storage_buckets: bucketNames,
            pending_files: newPending,
            file_index: pendingFiles.length,
            storage_files: storageMeta,
            skipped_storage: skipped,
            storage_bytes: batch.totalBytes,
            sync_root_folder_id: syncRootId,
            sync_unchanged: syncUnchanged,
            sync_pruned: syncPruned,
            parent_drive_folder_id: folderId,
            sync_verify_missing: stillMissing.length,
            auth_via: authVia,
          },
        }).eq('id', progressLogId)
        return {
          ok: true,
          complete: true,
          done: false,
          continue: true,
          version: COMPLETE_VERSION,
          progress_log_id: progressLogId,
          status: 'running',
          kind,
          filename: runFolder.name,
          folder_id: runFolder.id,
          drive_file_id: runFolder.id,
          storage_file_count: storageMeta.length,
          pending_remaining: stillMissing.length,
          sync_verify_missing: stillMissing.length,
        }
      }
      await appendDebug(progressLogId, 'sync_verify_ok', { buckets: bucketNames.length })
    }

    return finalizeBackup(progressLogId, {
      accessToken,
      runFolder,
      built,
      dbFile,
      dbBytesLen: dbBytes.length,
      storageMeta,
      skipped,
      storageBytes: batch.totalBytes,
      storageBuckets: bucketNames,
      kind,
      triggerMode,
      actorEmail,
      actorName: body.actor_name || null,
      syncRootId,
      syncIndex,
      syncUnchanged,
      syncPruned,
      parentDriveFolderId: folderId,
    }, authVia, onProgress)
  } catch (e) {
    const message = (e && e.message) || String(e)
    await appendDebug(progressLogId, 'backup_error', { error: message })
    if (progressLogId) {
      await setProgress(progressLogId, 100, `Failed: ${message}`, {
        status: 'failed',
        error_message: message,
      })
    }
    throw e
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
  let syncInfo = null

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
          const cur = fileCounts.get(f.bucket) || { files: 0, bytes: 0, sync: false }
          cur.files += 1
          cur.bytes += Number(f.size || 0)
          fileCounts.set(f.bucket, cur)
        }
        for (const [name, stats] of fileCounts) {
          buckets.push({ name, files: stats.files, bytes: stats.bytes, sync: false })
        }
        for (const name of manifest.storage?.buckets || []) {
          if (!fileCounts.has(name)) buckets.push({ name, files: 0, bytes: 0, sync: false })
        }
        // Parent-folder sync buckets
        if (manifest.sync?.root_folder_id || (manifest.sync?.buckets || []).length) {
          syncInfo = manifest.sync
          const syncCounts = new Map()
          if (manifest.sync.root_folder_id) {
            try {
              const idx = await loadSyncIndex(accessToken, manifest.sync.root_folder_id)
              for (const entry of Object.values(idx.files || {})) {
                if (!entry?.bucket) continue
                const cur = syncCounts.get(entry.bucket) || { files: 0, bytes: 0 }
                cur.files += 1
                cur.bytes += Number(entry.size || 0)
                syncCounts.set(entry.bucket, cur)
              }
            } catch (_) {
              // fall back to per-run sync file list
            }
          }
          if (!syncCounts.size) {
            for (const f of manifest.sync?.files || []) {
              const cur = syncCounts.get(f.bucket) || { files: 0, bytes: 0 }
              cur.files += 1
              cur.bytes += Number(f.size || 0)
              syncCounts.set(f.bucket, cur)
            }
          }
          for (const name of (manifest.sync.buckets || [...syncCounts.keys()] || KNOWN_BUCKETS)) {
            const stats = syncCounts.get(name) || { files: 0, bytes: 0 }
            if (!buckets.some((b) => b.name === name)) {
              buckets.push({ name, files: stats.files, bytes: stats.bytes, sync: true })
            } else {
              const existing = buckets.find((b) => b.name === name)
              existing.sync = true
              if (!existing.files && stats.files) {
                existing.files = stats.files
                existing.bytes = stats.bytes
              }
            }
          }
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
            buckets.push({ name: child.name, files: files.length, bytes: 0, sync: isSyncBucket(child.name) })
          }
        }
      }
    }

    // Fallback: look for cms-storage-sync under configured parent Drive folder
    if (!buckets.some((b) => b.sync)) {
      try {
        const parentId = await resolveFolderId(null)
        if (parentId) {
          const parentChildren = await driveListChildren(accessToken, parentId)
          const syncRoot = parentChildren.find(
            (f) => f.name === SYNC_ROOT_NAME && f.mimeType === 'application/vnd.google-apps.folder',
          )
          if (syncRoot) {
            const idx = await loadSyncIndex(accessToken, syncRoot.id)
            const byBucket = new Map()
            for (const entry of Object.values(idx.files || {})) {
              if (!entry?.bucket) continue
              const cur = byBucket.get(entry.bucket) || { files: 0, bytes: 0 }
              cur.files += 1
              cur.bytes += Number(entry.size || 0)
              byBucket.set(entry.bucket, cur)
            }
            for (const [name, stats] of byBucket) {
              if (!buckets.some((b) => b.name === name)) {
                buckets.push({ name, files: stats.files, bytes: stats.bytes, sync: true })
              }
            }
            syncInfo = { root_folder_id: syncRoot.id, buckets: [...byBucket.keys()] }
          }
        }
      } catch (_) {
        // ignore
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
    sync: syncInfo,
    sync_buckets: 'all',
    sync_all_storage: true,
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
  let syncRestored = 0
  let syncSkipped = 0
  const storageErrors = []
  const storageFolder = rootFiles.find(
    (f) => f.name === 'storage' && f.mimeType === 'application/vnd.google-apps.folder',
  )
  const wantStorage = !filterBuckets || (selectedBuckets && selectedBuckets.length > 0)

  let manifest = null
  if (manifestEntry) {
    try {
      const mBytes = await driveDownloadBytes(accessToken, manifestEntry.id)
      manifest = JSON.parse(new TextDecoder().decode(mBytes))
    } catch (_) {
      manifest = null
    }
  }

  // --- Dump storage inside dated backup folder (non-sync buckets) ---
  if (storageFolder && wantStorage) {
    let fileList = []
    if (manifest) {
      fileList = (manifest.storage?.files || []).filter((f) => f.mode !== 'sync')
    }
    if (!fileList.length) {
      const all = await collectDriveFilesRecursive(accessToken, storageFolder.id)
      for (const f of all) {
        const parts = f.path.split('/')
        const bucket = parts.shift()
        const path = parts.join('/')
        // Legacy dated-run dumps — restore any bucket found under storage/
        if (bucket && path) {
          fileList.push({ bucket, path, drive_file_id: f.id })
        }
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

    // --- Incremental sync restore from parent cms-storage-sync ---
  if (wantStorage) {
    let syncRootId = manifest?.sync?.root_folder_id || null
    if (!syncRootId) {
      try {
        const parentId = await resolveFolderId(null)
        if (parentId) {
          const parentChildren = await driveListChildren(accessToken, parentId)
          const syncRoot = parentChildren.find(
            (f) => f.name === SYNC_ROOT_NAME && f.mimeType === 'application/vnd.google-apps.folder',
          )
          if (syncRoot) syncRootId = syncRoot.id
        }
      } catch (_) {
        syncRootId = null
      }
    }

    if (syncRootId) {
      const idx = await loadSyncIndex(accessToken, syncRootId)
      let entries = Object.values(idx.files || {})
      if (filterBuckets) {
        const allow = new Set(selectedBuckets)
        entries = entries.filter((e) => allow.has(e.bucket))
      }
      const wantSyncBuckets = [...new Set(entries.map((e) => e.bucket).filter(Boolean))]
      if (filterBuckets) {
        for (const b of selectedBuckets) {
          if (isSyncBucket(b) && !wantSyncBuckets.includes(b)) wantSyncBuckets.push(b)
        }
      }

      if (wantSyncBuckets.length || entries.length) {
        const { data: existingBuckets } = await supabase.storage.listBuckets()
        const existingNames = new Set((existingBuckets || []).map((b) => b.name))
        for (const bucket of wantSyncBuckets) {
          if (!existingNames.has(bucket)) {
            await supabase.storage.createBucket(bucket, { public: true }).catch(() => null)
          }
        }

        // Local size map per bucket for incremental skip
        const localByBucket = {}
        for (const bucket of wantSyncBuckets) {
          try {
            const local = await listAllStorageFiles(bucket)
            localByBucket[bucket] = new Map(local.map((f) => [f.path, Number(f.size)]))
          } catch (_) {
            localByBucket[bucket] = new Map()
          }
        }

        for (const entry of entries) {
          try {
            if (!entry.drive_file_id) continue
            const localSize = localByBucket[entry.bucket]?.get(entry.path)
            const remoteSize = Number(entry.size)
            if (
              localSize != null
              && Number.isFinite(localSize)
              && Number.isFinite(remoteSize)
              && localSize === remoteSize
            ) {
              syncSkipped += 1
              continue
            }
            const bytes = await driveDownloadBytes(accessToken, entry.drive_file_id)
            const { error: upErr } = await supabase.storage.from(entry.bucket).upload(entry.path, bytes, {
              contentType: entry.mime || 'application/octet-stream',
              upsert: true,
            })
            if (upErr) storageErrors.push(`sync:${entry.bucket}/${entry.path}: ${upErr.message}`)
            else {
              restoredFiles += 1
              syncRestored += 1
            }
          } catch (e) {
            storageErrors.push(`sync:${entry.bucket}/${entry.path}: ${e.message || e}`)
          }
        }
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
      sync_restored: syncRestored,
      sync_skipped_unchanged: syncSkipped,
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
    sync_restored: syncRestored,
    sync_skipped_unchanged: syncSkipped,
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
        chunked: true,
        supports: ['backup', 'backup_continue', 'inspect', 'restore', 'progress', 'debug', 'list_sources', 'storage_sync', 'storage_sync_prune'],
        sync_buckets: 'all',
        sync_all_storage: true,
        sync_root: SYNC_ROOT_NAME,
        sync_mirror: true,
        min_prune_version: 7,
      })
    }

    if (body.action === 'list_sources') {
      return json(await listBackupSources())
    }

    if (body.action === 'inspect' || body.action === 'preview_restore') {
      return json(await inspectBackup(body, req))
    }

    if (body.action === 'restore') {
      const result = await runCompleteRestore(body, req)
      return json(result, result.status === 'failed' ? 500 : 200)
    }

    if (body.action === 'backup_continue' || body.phase === 'continue') {
      const result = await continueCompleteBackup(body)
      return json(result)
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
