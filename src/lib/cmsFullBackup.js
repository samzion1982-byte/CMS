/**
 * Full CMS database backup — export core tables as JSON.
 * Manual download always works; Edge Function handles scheduled + Google Drive.
 */

import { supabase } from './supabase'

/** Core tables included in a full backup (order is cosmetic). */
export const FULL_BACKUP_TABLES = [
  // Church & users
  'churches',
  'church_zones',
  'profiles',
  'cms_role_page_access',
  'cms_user_passwords',
  // Members
  'members',
  'deleted_members',
  // Events
  'baptism_records',
  'confirmation_records',
  'wedding_records',
  'burial_records',
  'event_task_buckets',
  'event_tasks',
  'event_volunteers',
  'task_library',
  // Assets
  'assets',
  'asset_locations',
  'asset_item_types',
  'asset_conditions',
  'fixed_assets',
  'fixed_asset_documents',
  // Finance — receipts / declaration
  'receipts',
  'receipt_items',
  'receipt_financial_years',
  'payment_categories',
  'declarations',
  'declaration_items',
  'decl_financial_years',
  'funds',
  // Accounting
  'chart_of_accounts',
  'journal_entries',
  'journal_entry_lines',
  'accounting_settings',
  'accounting_entities',
  'bank_accounts',
  'funds_ledger',
  // Simple accounts
  'simple_accounts',
  'simple_categories',
  'simple_transactions',
  // Announcements
  'announcements',
  'announcement_settings',
  'announcement_exclusions',
  'bible_verses',
]

const PAGE = 1000

async function fetchAllRows(table) {
  const rows = []
  let from = 0
  for (;;) {
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .range(from, from + PAGE - 1)
    if (error) {
      // Table may not exist in this project — skip quietly
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

/**
 * Build a full backup object from live DB.
 */
export async function buildFullBackupPayload({ triggerMode = 'manual', actor = null } = {}) {
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

  const payload = {
    format: 'cms-full-backup',
    version: 1,
    created_at: new Date().toISOString(),
    trigger_mode: triggerMode,
    created_by: actor?.email || null,
    tables,
    summary,
  }

  return { payload, tablesCount: okCount, rowsCount: totalRows, summary }
}

export function backupFilename(date = new Date()) {
  const p = (n) => String(n).padStart(2, '0')
  const stamp = `${date.getFullYear()}${p(date.getMonth() + 1)}${p(date.getDate())}-${p(date.getHours())}${p(date.getMinutes())}`
  return `cms-full-backup-${stamp}.json`
}

export function downloadJsonBackup(payload, filename) {
  const text = JSON.stringify(payload, null, 2)
  const blob = new Blob([text], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename || backupFilename()
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
  return { bytes: blob.size, filename: a.download }
}

/**
 * Upload backup JSON to private cms-backups storage bucket.
 */
export async function uploadBackupToStorage(payload, filename) {
  const text = JSON.stringify(payload)
  const blob = new Blob([text], { type: 'application/json' })
  const path = `full/${filename}`
  const { error } = await supabase.storage
    .from('cms-backups')
    .upload(path, blob, { contentType: 'application/json', upsert: true })
  if (error) throw error
  return { path, bytes: blob.size }
}

export async function logBackupRun({
  triggerMode = 'manual',
  status = 'success',
  tablesCount = 0,
  rowsCount = 0,
  fileSizeBytes = null,
  storagePath = null,
  driveFileId = null,
  driveWebLink = null,
  downloadFilename = null,
  errorMessage = null,
  meta = null,
  actor = null,
}) {
  const { data, error } = await supabase
    .from('cms_backup_log')
    .insert({
      backup_type: triggerMode === 'automatic' ? 'scheduled' : 'manual',
      trigger_mode: triggerMode,
      status,
      tables_count: tablesCount,
      rows_count: rowsCount,
      file_size_bytes: fileSizeBytes,
      storage_path: storagePath,
      drive_file_id: driveFileId,
      drive_web_link: driveWebLink,
      download_filename: downloadFilename,
      error_message: errorMessage,
      meta,
      created_by_email: actor?.email || null,
      created_by_name: actor?.full_name || actor?.name || null,
    })
    .select('*')
    .single()
  if (error) {
    console.error('cms_backup_log insert failed:', error)
    return null
  }
  return data
}

export async function listBackupLogs({ page = 0, pageSize = 30 } = {}) {
  const { data, error, count } = await supabase
    .from('cms_backup_log')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(page * pageSize, page * pageSize + pageSize - 1)
  if (error) throw error
  return { rows: data || [], total: count || 0 }
}

/**
 * Run a manual full backup: build → download → storage upload → log.
 * Drive upload is handled by Edge Function when secrets are configured.
 */
export async function runManualFullBackup(actor = null) {
  const { payload, tablesCount, rowsCount, summary } = await buildFullBackupPayload({
    triggerMode: 'manual',
    actor,
  })
  const filename = backupFilename()
  const { bytes } = downloadJsonBackup(payload, filename)

  let storagePath = null
  let status = 'success'
  let errorMessage = null
  try {
    const up = await uploadBackupToStorage(payload, filename)
    storagePath = up.path
  } catch (e) {
    status = 'partial'
    errorMessage = `Downloaded locally; storage upload failed: ${e.message}`
  }

  // Ask Edge Function to push the same payload to Google Drive (if configured)
  let driveFileId = null
  let driveWebLink = null
  try {
    const { data: sess } = await supabase.auth.getSession()
    const token = sess?.session?.access_token
    if (token) {
      const res = await supabase.functions.invoke('cms-full-backup', {
        body: {
          trigger_mode: 'manual',
          upload_only: true,
          filename,
          payload,
          actor_email: actor?.email || null,
        },
      })
      if (!res.error && res.data?.drive_file_id) {
        driveFileId = res.data.drive_file_id
        driveWebLink = res.data.drive_web_link || null
        status = 'success'
        if (errorMessage?.startsWith('Downloaded')) errorMessage = null
      } else if (res.data?.drive_skipped) {
        // Drive not configured — fine
      } else if (res.error) {
        status = status === 'success' ? 'partial' : status
        errorMessage = [errorMessage, `Drive: ${res.error.message || res.data?.error || 'upload failed'}`]
          .filter(Boolean).join(' | ')
      }
    }
  } catch (e) {
    // Edge function may not be deployed yet
    console.warn('Drive upload invoke skipped:', e.message)
  }

  const log = await logBackupRun({
    triggerMode: 'manual',
    status,
    tablesCount,
    rowsCount,
    fileSizeBytes: bytes,
    storagePath,
    driveFileId,
    driveWebLink,
    downloadFilename: filename,
    errorMessage,
    meta: { summary },
    actor,
  })

  return {
    filename,
    bytes,
    tablesCount,
    rowsCount,
    storagePath,
    driveFileId,
    driveWebLink,
    status,
    errorMessage,
    log,
  }
}

/**
 * Trigger scheduled-style backup via Edge Function (server-side dump + Drive).
 */
export async function triggerServerFullBackup(actor = null) {
  const { data, error } = await supabase.functions.invoke('cms-full-backup', {
    body: {
      trigger_mode: 'manual',
      actor_email: actor?.email || null,
    },
  })
  if (error) throw error
  if (data?.error) throw new Error(data.error)
  return data
}

export function formatBytes(n) {
  if (n == null || Number.isNaN(n)) return '—'
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(2)} MB`
}
