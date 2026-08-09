/**
 * Snapshot / Recycle Bin — capture deleted records so they can be restored.
 * Members already use deleted_members; this covers other CMS hard deletes.
 */

import { supabase } from './supabase'
import { logCmsAudit } from './cmsAudit'

export const RECYCLE_MODULES = [
  { value: '', label: 'All modules' },
  { value: 'events', label: 'Events' },
  { value: 'assets', label: 'Assets' },
  { value: 'finance', label: 'Finance' },
  { value: 'other', label: 'Other' },
]

/**
 * Capture a record (and optional related rows) into the recycle bin before hard delete.
 * Never throws — delete flows must continue even if snapshot fails.
 *
 * @param {object} opts
 * @param {string} opts.module
 * @param {string} opts.tableName
 * @param {string|number} opts.recordId
 * @param {string} [opts.recordLabel]
 * @param {object} [opts.row] — full row; fetched if omitted
 * @param {Record<string, object[]>} [opts.related] — related table → rows
 * @param {object} [opts.actor]
 * @param {string} [opts.notes]
 * @returns {Promise<{ id: string }|null>}
 */
export async function captureDeletedRecord({
  module,
  tableName,
  recordId,
  recordLabel = null,
  row = null,
  related = null,
  actor = null,
  notes = null,
}) {
  try {
    let payloadRow = row
    if (!payloadRow && tableName && recordId != null) {
      const { data, error } = await supabase
        .from(tableName)
        .select('*')
        .eq('id', recordId)
        .maybeSingle()
      if (error) console.error('captureDeletedRecord fetch:', error)
      payloadRow = data
    }
    if (!payloadRow) {
      console.warn('captureDeletedRecord: no row to snapshot', tableName, recordId)
      return null
    }

    let actorEmail = actor?.email || null
    let actorName = actor?.full_name || actor?.name || null
    let actorRole = actor?.role || null
    if (!actorEmail) {
      const { data: { user } } = await supabase.auth.getUser()
      actorEmail = user?.email || null
      if (user?.id && (!actorName || !actorRole)) {
        const { data: prof } = await supabase
          .from('profiles')
          .select('full_name, role, email')
          .eq('id', user.id)
          .maybeSingle()
        if (prof) {
          actorName = actorName || prof.full_name
          actorRole = actorRole || prof.role
          actorEmail = actorEmail || prof.email
        }
      }
    }

    const { data, error } = await supabase
      .from('cms_recycle_bin')
      .insert({
        module: module || 'other',
        table_name: tableName,
        record_id: String(recordId),
        record_label: recordLabel || String(recordId),
        payload: { row: payloadRow, related: related || undefined },
        deleted_by_email: actorEmail,
        deleted_by_name: actorName,
        deleted_by_role: actorRole,
        notes,
        status: 'deleted',
      })
      .select('id')
      .single()

    if (error) {
      console.error('cms_recycle_bin insert failed:', error)
      return null
    }
    return data
  } catch (e) {
    console.error('captureDeletedRecord error:', e)
    return null
  }
}

/**
 * Convenience: snapshot then hard-delete one row (and optional related deletes).
 * relatedDeletes: [{ table, column, value }] run after snapshot, before main delete.
 */
export async function snapshotThenDelete({
  module,
  tableName,
  recordId,
  recordLabel,
  row,
  related,
  relatedDeletes = [],
  actor,
  notes,
}) {
  await captureDeletedRecord({
    module, tableName, recordId, recordLabel, row, related, actor, notes,
  })
  for (const rd of relatedDeletes) {
    const { error } = await supabase.from(rd.table).delete().eq(rd.column, rd.value)
    if (error) throw error
  }
  const { error } = await supabase.from(tableName).delete().eq('id', recordId)
  if (error) throw error
}

export async function listRecycleBin({
  module = null,
  search = '',
  page = 0,
  pageSize = 50,
  status = 'deleted',
} = {}) {
  let q = supabase
    .from('cms_recycle_bin')
    .select('*', { count: 'exact' })
    .eq('status', status)
    .order('deleted_at', { ascending: false })
    .range(page * pageSize, page * pageSize + pageSize - 1)

  if (module) q = q.eq('module', module)
  if (search?.trim()) {
    const s = search.trim()
    q = q.or(`record_label.ilike.%${s}%,record_id.ilike.%${s}%,table_name.ilike.%${s}%,deleted_by_email.ilike.%${s}%`)
  }

  const { data, error, count } = await q
  if (error) throw error
  return { rows: data || [], total: count || 0 }
}

/**
 * Restore a snapshotted record back into its table (+ related rows).
 */
export async function restoreRecycleBinItem(id, actor = null) {
  const { data: item, error: fetchErr } = await supabase
    .from('cms_recycle_bin')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  if (fetchErr) throw fetchErr
  if (!item) throw new Error('Snapshot not found')
  if (item.status !== 'deleted') throw new Error(`Cannot restore — status is ${item.status}`)

  const payload = item.payload || {}
  const row = payload.row
  if (!row) throw new Error('Snapshot payload is empty')

  // Conflict check
  const { data: existing } = await supabase
    .from(item.table_name)
    .select('id')
    .eq('id', row.id)
    .maybeSingle()
  if (existing) {
    throw new Error(
      `A record with this ID already exists in ${item.table_name}. Restore aborted.`,
    )
  }

  const { error: insErr } = await supabase.from(item.table_name).insert(row)
  if (insErr) throw insErr

  const related = payload.related || {}
  for (const [relTable, rows] of Object.entries(related)) {
    if (!Array.isArray(rows) || !rows.length) continue
    const { error: relErr } = await supabase.from(relTable).insert(rows)
    if (relErr) {
      // Roll back main row best-effort
      await supabase.from(item.table_name).delete().eq('id', row.id)
      throw new Error(`Related restore failed (${relTable}): ${relErr.message}`)
    }
  }

  let email = actor?.email || null
  if (!email) {
    const { data: { user } } = await supabase.auth.getUser()
    email = user?.email || null
  }

  await supabase
    .from('cms_recycle_bin')
    .update({
      status: 'restored',
      restored_at: new Date().toISOString(),
      restored_by_email: email,
    })
    .eq('id', id)

  await logCmsAudit({
    action: 'restored',
    module: item.module,
    entityType: item.table_name,
    entityId: item.record_id,
    entityLabel: item.record_label,
    summary: `Restored ${item.table_name} ${item.record_label || item.record_id} from snapshot`,
    actor,
  })

  return item
}

/** Permanently discard a snapshot (cannot restore after this). */
export async function purgeRecycleBinItem(id, actor = null) {
  const { data: item, error } = await supabase
    .from('cms_recycle_bin')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  if (!item) throw new Error('Snapshot not found')
  if (item.status !== 'deleted') throw new Error('Only active snapshots can be purged')

  await supabase
    .from('cms_recycle_bin')
    .update({
      status: 'purged',
      purged_at: new Date().toISOString(),
    })
    .eq('id', id)

  await logCmsAudit({
    action: 'deleted',
    module: item.module,
    entityType: 'recycle_bin',
    entityId: id,
    entityLabel: item.record_label,
    summary: `Purged snapshot of ${item.table_name} ${item.record_label || item.record_id}`,
    actor,
  })
}

export async function purgeAllRecycleBin(actor = null) {
  const now = new Date().toISOString()
  const { data, error } = await supabase
    .from('cms_recycle_bin')
    .update({ status: 'purged', purged_at: now })
    .eq('status', 'deleted')
    .select('id')
  if (error) throw error
  await logCmsAudit({
    action: 'deleted',
    module: 'other',
    entityType: 'recycle_bin',
    summary: `Purged ${data?.length || 0} snapshot(s)`,
    actor,
  })
  return data?.length || 0
}
