/**
 * Full Backup + Snapshot helpers (Google Drive only).
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

/**
 * Run Full Backup or Snapshot via Edge Function → Google Drive only.
 * @param {'full'|'snapshot'} kind
 * @param {'manual'|'automatic'} triggerMode
 */
export async function runDriveBackup({ kind = 'full', triggerMode = 'manual', actor = null } = {}) {
  const settings = await getBackupSettings()
  if (!settings.drive_folder_id?.trim()) {
    throw new Error('Save a Google Drive folder ID first (Google Drive section).')
  }

  const { data, error } = await supabase.functions.invoke('cms-full-backup', {
    body: {
      kind,
      trigger_mode: triggerMode,
      drive_folder_id: settings.drive_folder_id.trim(),
      actor_email: actor?.email || null,
      actor_name: actor?.full_name || actor?.name || null,
    },
  })
  if (error) throw error
  if (data?.error) throw new Error(data.error)
  return data
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
  mode = 'initialize', // initialize | upgrade
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

export function formatWhen(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return String(iso)
  const p = (n) => String(n).padStart(2, '0')
  return `${p(d.getDate())}-${p(d.getMonth() + 1)}-${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`
}
