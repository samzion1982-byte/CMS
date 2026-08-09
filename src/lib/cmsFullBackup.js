/**
 * Full Backup + Snapshot helpers (Google Drive via Edge Function).
 * Manual runs fall back to local JSON download if the function is not deployed yet.
 */

import { supabase } from './supabase'

/** Core tables included in a full/snapshot dump. */
export const FULL_BACKUP_TABLES = [
  'churches', 'church_zones', 'profiles', 'cms_role_page_access', 'cms_user_passwords',
  'cms_backup_settings', 'cms_backup_log',
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

export async function getBackupSettings() {
  const { data, error } = await supabase
    .from('cms_backup_settings')
    .select(
      'id, drive_folder_id, drive_enabled, full_auto_enabled, full_auto_hour_ist, snapshot_auto_enabled, snapshot_auto_hour_ist, snapshot_retain_days, google_connected_email, google_connected_at, updated_at, updated_by_email',
    )
    .eq('id', 1)
    .maybeSingle()
  if (error) throw error
  return data || {
    id: 1,
    drive_folder_id: '',
    drive_enabled: false,
    full_auto_enabled: true,
    full_auto_hour_ist: 2,
    snapshot_auto_enabled: true,
    snapshot_auto_hour_ist: 1,
    snapshot_retain_days: 14,
    google_connected_email: null,
    google_connected_at: null,
  }
}

export async function saveBackupSettings(patch, actor = null) {
  // Never allow browser to write refresh tokens
  const safe = { ...patch }
  delete safe.google_refresh_token

  const payload = {
    id: 1,
    ...safe,
    updated_at: new Date().toISOString(),
    updated_by_email: actor?.email || null,
  }
  const { data, error } = await supabase
    .from('cms_backup_settings')
    .upsert(payload, { onConflict: 'id' })
    .select(
      'id, drive_folder_id, drive_enabled, full_auto_enabled, full_auto_hour_ist, snapshot_auto_enabled, snapshot_auto_hour_ist, snapshot_retain_days, google_connected_email, google_connected_at, updated_at, updated_by_email',
    )
    .single()
  if (error) throw error
  return data
}

export function googleOAuthRedirectUri() {
  return `${window.location.origin}/backup/google-callback`
}

export async function startGoogleOAuthConnect() {
  const redirectUri = googleOAuthRedirectUri()
  const state = crypto.randomUUID()
  sessionStorage.setItem('cms_google_oauth_state', state)
  sessionStorage.setItem('cms_google_oauth_redirect', redirectUri)

  const invoked = await invokeEdgeFunction('cms-google-oauth', {
    action: 'auth_url',
    redirect_uri: redirectUri,
    state,
  })
  if (!invoked.ok) {
    throw new Error(invoked.errorMessage || 'Could not start Google login')
  }
  if (!invoked.data?.auth_url) throw new Error('No auth URL returned from cms-google-oauth')
  window.location.href = invoked.data.auth_url
}

export async function finishGoogleOAuthConnect({ code, state }) {
  const expected = sessionStorage.getItem('cms_google_oauth_state')
  const redirectUri = sessionStorage.getItem('cms_google_oauth_redirect') || googleOAuthRedirectUri()
  if (!expected || state !== expected) {
    throw new Error('Google login state mismatch. Try Connect Google again.')
  }
  const invoked = await invokeEdgeFunction('cms-google-oauth', {
    action: 'exchange',
    code,
    redirect_uri: redirectUri,
  })
  sessionStorage.removeItem('cms_google_oauth_state')
  sessionStorage.removeItem('cms_google_oauth_redirect')
  if (!invoked.ok) throw new Error(invoked.errorMessage || 'Failed to connect Google')
  return invoked.data
}

export async function disconnectGoogleOAuth() {
  const invoked = await invokeEdgeFunction('cms-google-oauth', { action: 'disconnect' })
  if (!invoked.ok) throw new Error(invoked.errorMessage || 'Disconnect failed')
  return invoked.data
}

export async function listBackupLogs({ kind = null, page = 0, pageSize = 30 } = {}) {
  let q = supabase
    .from('cms_backup_log')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(page * pageSize, page * pageSize + pageSize - 1)
  if (kind === 'full') {
    q = q.or('kind.eq.full,kind.is.null,backup_type.in.(full,manual,scheduled)')
  } else if (kind === 'snapshot') {
    q = q.or('kind.eq.snapshot,backup_type.eq.snapshot')
  }
  const { data, error, count } = await q
  if (error) throw error
  let rows = data || []
  if (kind === 'full') {
    rows = rows.filter((r) => (r.kind || 'full') !== 'snapshot' && r.backup_type !== 'snapshot')
  } else if (kind === 'snapshot') {
    rows = rows.filter((r) => r.kind === 'snapshot' || r.backup_type === 'snapshot')
  }
  return { rows, total: count || rows.length }
}

/** Clear backup history rows. kind: 'full' | 'snapshot' | null (all). */
export async function clearBackupLogs({ kind = null } = {}) {
  // Fetch matching ids then delete (filters match listBackupLogs)
  const { rows } = await listBackupLogs({ kind, page: 0, pageSize: 1000 })
  if (!rows.length) return { deleted: 0 }

  const ids = rows.map((r) => r.id)
  const { error, count } = await supabase
    .from('cms_backup_log')
    .delete({ count: 'exact' })
    .in('id', ids)
  if (error) throw error
  return { deleted: count ?? ids.length }
}

async function fetchAllRows(table) {
  const rows = []
  let from = 0
  for (;;) {
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .range(from, from + PAGE - 1)
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

export async function buildBackupPayload({ kind = 'full', triggerMode = 'manual', actor = null } = {}) {
  const tables = {}
  const summary = []
  let totalRows = 0
  let okCount = 0

  for (const table of FULL_BACKUP_TABLES) {
    const result = await fetchAllRows(table)
    if (result.skipped) {
      summary.push({ table, status: 'skipped', rows: 0, error: result.error })
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
      created_by: actor?.email || null,
      tables,
      summary,
    },
    tablesCount: okCount,
    rowsCount: totalRows,
    summary,
  }
}

function backupFilename(kind, date = new Date()) {
  const p = (n) => String(n).padStart(2, '0')
  const stamp = `${date.getFullYear()}${p(date.getMonth() + 1)}${p(date.getDate())}-${p(date.getHours())}${p(date.getMinutes())}`
  return kind === 'snapshot' ? `cms-snapshot-${stamp}.json` : `cms-full-backup-${stamp}.json`
}

function downloadJson(payload, filename) {
  const text = JSON.stringify(payload, null, 2)
  const blob = new Blob([text], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
  return { bytes: blob.size, filename }
}

async function logBackupRun(row) {
  const { data, error } = await supabase.from('cms_backup_log').insert(row).select('*').single()
  if (error) {
    console.error('cms_backup_log insert failed:', error)
    return null
  }
  return data
}

function isFunctionMissingError(error, data, message = '') {
  const msg = `${error?.message || ''} ${data?.error || ''} ${data?.message || ''} ${message}`.toLowerCase()
  return (
    /failed to send a request to the edge function/.test(msg)
    || /requested function was not found/.test(msg)
    || /function was not found/.test(msg)
    || /not found/.test(msg) && /404/.test(String(error?.context?.status || ''))
    || error?.context?.status === 404
  )
}

/**
 * Invoke Edge Function and always surface the real JSON error body
 * (Supabase otherwise only shows "non-2xx status code").
 */
export async function invokeEdgeFunction(name, body = {}) {
  console.log('[cms-backup] invoke', name, body)
  const { data, error } = await supabase.functions.invoke(name, { body })
  let status = 200
  let parsed = data
  let errorMessage = null

  if (error) {
    status = error.context?.status || 500
    errorMessage = error.message || 'Edge Function failed'
    try {
      const ctx = error.context
      if (ctx) {
        const text = typeof ctx.text === 'function'
          ? await ctx.text()
          : (typeof ctx.json === 'function' ? JSON.stringify(await ctx.json()) : '')
        console.log('[cms-backup]', name, 'HTTP', status, 'body:', text)
        if (text) {
          try {
            parsed = JSON.parse(text)
            errorMessage = parsed.error || parsed.message || errorMessage
          } catch {
            errorMessage = text.slice(0, 500)
          }
        }
      }
    } catch (parseErr) {
      console.warn('[cms-backup] could not read error body', parseErr)
    }
  } else if (data?.error) {
    status = 500
    errorMessage = String(data.error)
    parsed = data
  }

  console.log('[cms-backup]', name, 'result', { status, errorMessage, parsed })
  return {
    ok: !errorMessage,
    data: parsed,
    errorMessage,
    status,
    missing: isFunctionMissingError(error, parsed, errorMessage || ''),
  }
}

/** Quick diagnostics for the Backup page Debug panel. */
export async function diagnoseBackupSetup() {
  const out = {
    at: new Date().toISOString(),
    settings: null,
    settingsError: null,
    lastLogs: [],
    logsError: null,
    oauthFn: null,
    backupFn: null,
  }
  try {
    out.settings = await getBackupSettings()
  } catch (e) {
    out.settingsError = e.message || String(e)
  }
  try {
    const { rows } = await listBackupLogs({ pageSize: 3 })
    out.lastLogs = rows.map((r) => ({
      created_at: r.created_at,
      kind: r.kind,
      status: r.status,
      error_message: r.error_message,
      drive_file_id: r.drive_file_id,
      download_filename: r.download_filename,
    }))
  } catch (e) {
    out.logsError = e.message || String(e)
  }
  out.oauthFn = await invokeEdgeFunction('cms-google-oauth', { action: 'status' })
  // Don't run a full backup dump for diagnose — just report connection readiness
  out.hints = []
  if (out.settingsError) out.hints.push('Run SQL migration 20260809_cms_backup_google_oauth.sql')
  if (!out.settings?.google_connected_email) out.hints.push('Click Connect Google before Run Full Backup')
  if (!out.settings?.drive_folder_id) out.hints.push('Save Google Drive folder ID')
  if (out.oauthFn.missing) out.hints.push('Deploy Edge Function cms-google-oauth')
  if (out.oauthFn.errorMessage && !out.oauthFn.missing) out.hints.push(`OAuth function: ${out.oauthFn.errorMessage}`)
  out.hints.push('For complete backup+restore: run SQL 20260809_cms_complete_backup.sql and redeploy cms-full-backup')
  return out
}

function friendlyDriveError(msg) {
  if (/not connected|connect google/i.test(msg || '')) {
    return 'Google Drive is not connected. Click Connect Google on the Backup page, then try again.'
  }
  if (/storage quota|shared drives|service accounts do not have/i.test(msg || '')) {
    return (
      'Google blocked the upload: service accounts cannot save files into a normal personal Drive folder. ' +
      'Connect Google with OAuth on the Backup page. Meanwhile the file can still download to your computer.'
    )
  }
  if (/non-2xx/i.test(msg || '')) {
    return 'Backup function failed (see Debug panel for details). Usually: Connect Google first, or redeploy cms-full-backup.'
  }
  return msg
}

/**
 * Run Full Backup or Snapshot.
 * 1) Prefer Edge Function → Google Drive
 * 2) If Drive blocked / function missing, dump + download locally and log history
 */
export async function runDriveBackup({ kind = 'full', triggerMode = 'manual', actor = null } = {}) {
  const settings = await getBackupSettings()
  if (!settings.drive_folder_id?.trim()) {
    throw new Error('Save a Google Drive folder ID first (Google Drive section).')
  }
  if (!settings.google_connected_email) {
    throw new Error('Connect Google first (Backup page → Connect Google).')
  }

  let driveErrorMsg = null

  // Complete backup (all tables + all storage files) via Edge Function → Google Drive folder
  try {
    const invoked = await invokeEdgeFunction('cms-full-backup', {
      kind,
      trigger_mode: triggerMode,
      drive_folder_id: settings.drive_folder_id.trim(),
      actor_email: actor?.email || null,
      actor_name: actor?.full_name || actor?.name || null,
    })
    if (invoked.ok && invoked.data && !invoked.data.error) {
      return { ...invoked.data, via: 'drive' }
    }
    if (invoked.missing) {
      driveErrorMsg = null
    } else {
      driveErrorMsg = friendlyDriveError(invoked.errorMessage || invoked.data?.error || 'Backup failed')
    }
  } catch (e) {
    console.error('[cms-backup] runDriveBackup exception', e)
    if (isFunctionMissingError(e, null) || /failed to send/i.test(e.message || '')) {
      driveErrorMsg = null
    } else {
      driveErrorMsg = friendlyDriveError(e.message || String(e))
    }
  }

  // Local fallback — DB JSON only (no storage files) when Drive upload is unavailable
  const { payload, tablesCount, rowsCount, summary } = await buildBackupPayload({
    kind, triggerMode, actor,
  })
  const filename = backupFilename(kind)
  const { bytes } = downloadJson(payload, filename)

  const errNote = driveErrorMsg
    || 'Downloaded DB JSON only (no photos/PDFs). Deploy Edge Function cms-full-backup for a complete Drive backup.'

  await logBackupRun({
    backup_type: kind === 'snapshot' ? 'snapshot' : 'full',
    kind,
    trigger_mode: triggerMode,
    status: 'partial',
    tables_count: tablesCount,
    rows_count: rowsCount,
    file_size_bytes: bytes,
    download_filename: filename,
    error_message: errNote,
    meta: { summary, via: 'local_download', complete: false, drive_folder_id: settings.drive_folder_id },
    created_by_email: actor?.email || null,
    created_by_name: actor?.full_name || actor?.name || null,
  })

  return {
    ok: true,
    via: 'local_download',
    status: 'partial',
    kind,
    filename,
    tables_count: tablesCount,
    rows_count: rowsCount,
    file_size_bytes: bytes,
    message: driveErrorMsg
      ? `${driveErrorMsg} Database JSON was downloaded locally (storage files were not included).`
      : 'Database JSON downloaded locally. Redeploy cms-full-backup for a complete Drive backup (DB + storage files).',
  }
}

/**
 * List tables + storage buckets inside a Drive backup (for restore chooser).
 */
export async function inspectDriveBackup({ logId = null, folderId = null } = {}) {
  const invoked = await invokeEdgeFunction('cms-full-backup', {
    action: 'inspect',
    log_id: logId,
    drive_backup_folder_id: folderId,
  })
  if (invoked.missing) {
    throw new Error('Edge Function cms-full-backup is not deployed. Redeploy it, then try again.')
  }
  if (!invoked.ok) throw new Error(invoked.errorMessage || 'Could not inspect backup')
  return invoked.data
}

/**
 * Build restore chooser items from a history log row (fast path; may call inspect if thin).
 */
export function restoreChoicesFromLog(row) {
  const summary = Array.isArray(row?.meta?.summary) ? row.meta.summary : []
  const tables = summary
    .filter((s) => s && (s.status === 'ok' || (s.rows || 0) > 0) && s.table)
    .map((s) => ({ name: s.table, rows: s.rows || 0 }))
    .sort((a, b) => a.name.localeCompare(b.name))

  const bucketNames = Array.isArray(row?.meta?.storage_buckets) ? row.meta.storage_buckets : []
  const storage_buckets = bucketNames
    .filter(Boolean)
    .map((name) => ({ name, files: null, bytes: 0 }))
    .sort((a, b) => a.name.localeCompare(b.name))

  return {
    tables,
    storage_buckets,
    from_log: true,
    incomplete: !tables.length && !storage_buckets.length,
  }
}

/**
 * Complete restore from a Drive backup folder (database.json + storage/...).
 * Pass tables / storageBuckets arrays to restore only those items.
 */
export async function restoreFromDriveBackup({
  logId = null,
  folderId = null,
  tables = null,
  storageBuckets = null,
  actor = null,
} = {}) {
  const invoked = await invokeEdgeFunction('cms-full-backup', {
    action: 'restore',
    log_id: logId,
    drive_backup_folder_id: folderId,
    tables,
    storage_buckets: storageBuckets,
    actor_email: actor?.email || null,
  })
  if (invoked.missing) {
    throw new Error('Edge Function cms-full-backup is not deployed. Redeploy it, then try Restore again.')
  }
  if (!invoked.ok) throw new Error(invoked.errorMessage || 'Restore failed')
  return invoked.data
}

export function backupFolderIdFromLog(row) {
  if (!row) return null
  return row?.meta?.drive_backup_folder_id || (row?.meta?.complete ? row.drive_file_id : null) || null
}

/**
 * New Setup / Upgrade — provision a target Supabase project.
 */
export async function runProvision({
  mode = 'initialize',
  supabaseUrl,
  anonKey,
  serviceRoleKey,
  dbPassword,
  superAdminEmail,
  superAdminPassword,
  driveFolderId = null,
  actor = null,
} = {}) {
  const invoked = await invokeEdgeFunction('cms-provision', {
    mode,
    supabase_url: supabaseUrl,
    anon_key: anonKey,
    service_role_key: serviceRoleKey,
    db_password: dbPassword,
    super_admin_email: superAdminEmail,
    super_admin_password: superAdminPassword,
    drive_folder_id: driveFolderId,
    actor_email: actor?.email || null,
  })
  if (invoked.missing) {
    throw new Error('Edge Function cms-provision is not deployed yet. Deploy it from Supabase → Edge Functions.')
  }
  if (!invoked.ok) throw new Error(invoked.errorMessage || 'Provision failed')
  return invoked.data
}

export function formatBytes(n) {
  if (n == null || Number.isNaN(n)) return '—'
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(2)} MB`
}

export function formatWhen(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return String(iso)
  const p = (n) => String(n).padStart(2, '0')
  return `${p(d.getDate())}-${p(d.getMonth() + 1)}-${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`
}
