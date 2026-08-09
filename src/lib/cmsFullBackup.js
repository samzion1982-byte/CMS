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
    .select('*')
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
  }
}

export async function saveBackupSettings(patch, actor = null) {
  const payload = {
    id: 1,
    ...patch,
    updated_at: new Date().toISOString(),
    updated_by_email: actor?.email || null,
  }
  const { data, error } = await supabase
    .from('cms_backup_settings')
    .upsert(payload, { onConflict: 'id' })
    .select('*')
    .single()
  if (error) throw error
  return data
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

function isFunctionMissingError(error, data) {
  const msg = `${error?.message || ''} ${data?.error || ''} ${data?.message || ''}`.toLowerCase()
  return (
    /failed to send a request to the edge function/.test(msg)
    || /not found/.test(msg)
    || /function was not found/.test(msg)
    || error?.context?.status === 404
  )
}

/**
 * Run Full Backup or Snapshot.
 * 1) Prefer Edge Function → Google Drive
 * 2) If function missing, dump + download locally and log history
 */
export async function runDriveBackup({ kind = 'full', triggerMode = 'manual', actor = null } = {}) {
  const settings = await getBackupSettings()
  if (!settings.drive_folder_id?.trim()) {
    throw new Error('Save a Google Drive folder ID first (Google Drive section).')
  }

  // Try Edge Function (Drive upload)
  try {
    const { data, error } = await supabase.functions.invoke('cms-full-backup', {
      body: {
        kind,
        trigger_mode: triggerMode,
        drive_folder_id: settings.drive_folder_id.trim(),
        actor_email: actor?.email || null,
        actor_name: actor?.full_name || actor?.name || null,
      },
    })
    if (!error && data && !data.error) {
      return { ...data, via: 'drive' }
    }
    if (error && !isFunctionMissingError(error, data)) {
      throw new Error(data?.error || error.message || 'Backup failed')
    }
    if (data?.error && !isFunctionMissingError(error, data)) {
      throw new Error(data.error)
    }
    // fall through to local if function missing
  } catch (e) {
    if (!isFunctionMissingError(e, null) && !/failed to send/i.test(e.message || '')) {
      throw e
    }
  }

  // Local fallback — works before Edge Function is deployed
  const { payload, tablesCount, rowsCount, summary } = await buildBackupPayload({
    kind, triggerMode, actor,
  })
  const filename = backupFilename(kind)
  const { bytes } = downloadJson(payload, filename)

  await logBackupRun({
    backup_type: kind === 'snapshot' ? 'snapshot' : 'full',
    kind,
    trigger_mode: triggerMode,
    status: 'partial',
    tables_count: tablesCount,
    rows_count: rowsCount,
    file_size_bytes: bytes,
    download_filename: filename,
    error_message: 'Downloaded locally. Deploy Edge Function cms-full-backup and set GOOGLE_SERVICE_ACCOUNT_JSON to upload to Google Drive.',
    meta: { summary, via: 'local_download', drive_folder_id: settings.drive_folder_id },
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
    message: 'Backup downloaded to your computer. Deploy cms-full-backup to also save to Google Drive.',
  }
}

export async function restoreFromDriveBackup({ logId, kind = 'full', actor = null } = {}) {
  const { data, error } = await supabase.functions.invoke('cms-full-backup', {
    body: {
      action: 'restore',
      log_id: logId,
      kind,
      actor_email: actor?.email || null,
    },
  })
  if (error) throw error
  if (data?.error) throw new Error(data.error)
  return data
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
  const { data, error } = await supabase.functions.invoke('cms-provision', {
    body: {
      mode,
      supabase_url: supabaseUrl,
      anon_key: anonKey,
      service_role_key: serviceRoleKey,
      db_password: dbPassword,
      super_admin_email: superAdminEmail,
      super_admin_password: superAdminPassword,
      drive_folder_id: driveFolderId,
      actor_email: actor?.email || null,
    },
  })
  if (error) {
    if (isFunctionMissingError(error, data)) {
      throw new Error('Edge Function cms-provision is not deployed yet. Deploy it from Supabase → Edge Functions.')
    }
    throw error
  }
  if (data?.error) throw new Error(data.error)
  return data
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
