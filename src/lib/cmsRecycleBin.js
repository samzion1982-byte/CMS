/**
 * Snapshot / Recycle Bin — capture deleted records so they can be restored.
 * Members already use deleted_members; this covers other CMS hard deletes.
 *
 * Storage files are moved into `_quarantine/{snapshotId}/…` on delete (not
 * permanently removed). Restore moves them back; purge deletes them for good.
 */

import { supabase, adminSupabase } from './supabase'
import { logCmsAudit } from './cmsAudit'

export const RECYCLE_MODULES = [
  { value: '', label: 'All modules' },
  { value: 'events', label: 'Events' },
  { value: 'assets', label: 'Assets' },
  { value: 'finance', label: 'Finance' },
  { value: 'directory', label: 'Phone Directory' },
  { value: 'print_corner', label: 'Print Corner' },
  { value: 'other', label: 'Other' },
]

export const QUARANTINE_ROOT = '_quarantine'

/** Active recycle-bin snapshots older than this are auto-purged (Auto Flush + hourly job). */
export const RECYCLE_BIN_RETENTION_DAYS = 45

/** Buckets that may hold `_quarantine/{snapshotId}/…` media for recycle-bin items. */
export const QUARANTINE_BUCKETS = [
  'event-media',
  'asset-photos',
  'receipt-pdfs',
  'fixed-asset-docs',
  'church-documents',
  'auction-reports',
  'print-corner',
]

/** List all file object paths under a storage folder (recursive, one bucket). */
async function listStorageFilePaths(bucket, folderPrefix) {
  const paths = []
  async function walk(dir) {
    if (dir && folderPrefix && dir !== folderPrefix && !dir.startsWith(`${folderPrefix}/`)) return
    const { data, error } = await adminSupabase.storage.from(bucket).list(dir || '', { limit: 1000 })
    if (error || !data?.length) return
    for (const item of data) {
      if (item.name === '.emptyFolderPlaceholder') continue
      const full = dir ? `${dir}/${item.name}` : item.name
      if (folderPrefix && full !== folderPrefix && !full.startsWith(`${folderPrefix}/`)) continue
      // Files have metadata / id; folder placeholders usually don't
      if (item.id || item.metadata) paths.push(full)
      else await walk(full)
    }
  }
  await walk(folderPrefix || '')
  return paths
}

/**
 * Move every file under folderPrefix into quarantine for this snapshot.
 * Updates the snapshot payload with quarantine metadata.
 *
 * @returns {Promise<{ bucket: string, folderPrefix: string, paths: {from:string,to:string}[] }|null>}
 */
export async function quarantineStorageFolder({
  bucket,
  folderPrefix,
  snapshotId,
  validatePrefix = null,
}) {
  if (!bucket || !snapshotId || !folderPrefix) return null
  if (validatePrefix && !validatePrefix.test(folderPrefix)) {
    console.warn('[quarantine] refused — invalid folder prefix:', folderPrefix)
    return null
  }

  const filePaths = await listStorageFilePaths(bucket, folderPrefix)
  const moved = []
  for (const from of filePaths) {
    const to = `${QUARANTINE_ROOT}/${snapshotId}/${from}`
    const { error } = await adminSupabase.storage.from(bucket).move(from, to)
    if (error) {
      // Fallback: download + upload + remove
      const { data: blob, error: dlErr } = await adminSupabase.storage.from(bucket).download(from)
      if (dlErr || !blob) throw new Error(`Quarantine failed (${from}): ${error.message}`)
      const { error: upErr } = await adminSupabase.storage.from(bucket).upload(to, blob, { upsert: true })
      if (upErr) throw new Error(`Quarantine upload failed (${to}): ${upErr.message}`)
      await adminSupabase.storage.from(bucket).remove([from])
    }
    moved.push({ from, to })
  }

  const quarantine = { bucket, folderPrefix, paths: moved }
  const { data: item } = await adminSupabase
    .from('cms_recycle_bin')
    .select('payload')
    .eq('id', snapshotId)
    .maybeSingle()

  await adminSupabase
    .from('cms_recycle_bin')
    .update({
      payload: { ...(item?.payload || {}), quarantine },
    })
    .eq('id', snapshotId)

  return quarantine
}

/** Move a single storage object into quarantine (e.g. asset photo). */
export async function quarantineStoragePaths({ bucket, paths, snapshotId }) {
  if (!bucket || !snapshotId || !paths?.length) return null
  const unique = [...new Set(paths.filter(Boolean))]
  const moved = []
  for (const from of unique) {
    const to = `${QUARANTINE_ROOT}/${snapshotId}/${from}`
    const { error } = await adminSupabase.storage.from(bucket).move(from, to)
    if (error) {
      const { data: blob, error: dlErr } = await adminSupabase.storage.from(bucket).download(from)
      if (dlErr || !blob) {
        console.warn('[quarantine] skip missing file', from, error.message)
        continue
      }
      const { error: upErr } = await adminSupabase.storage.from(bucket).upload(to, blob, { upsert: true })
      if (upErr) throw new Error(`Quarantine upload failed (${to}): ${upErr.message}`)
      await adminSupabase.storage.from(bucket).remove([from])
    }
    moved.push({ from, to })
  }
  if (!moved.length) return null

  const quarantine = { bucket, paths: moved }
  const { data: item } = await adminSupabase
    .from('cms_recycle_bin')
    .select('payload')
    .eq('id', snapshotId)
    .maybeSingle()

  await adminSupabase
    .from('cms_recycle_bin')
    .update({
      payload: { ...(item?.payload || {}), quarantine },
    })
    .eq('id', snapshotId)

  return quarantine
}

async function restoreQuarantinedFiles(payload) {
  const q = payload?.quarantine
  if (!q?.bucket || !q.paths?.length) return 0
  let restored = 0
  for (const { from, to } of q.paths) {
    // Currently at `to` (quarantine); move back to original `from`
    const { error } = await adminSupabase.storage.from(q.bucket).move(to, from)
    if (error) {
      const { data: blob, error: dlErr } = await adminSupabase.storage.from(q.bucket).download(to)
      if (dlErr || !blob) {
        console.warn('[quarantine] restore missing file', to, error.message)
        continue
      }
      const { error: upErr } = await adminSupabase.storage.from(q.bucket).upload(from, blob, { upsert: true })
      if (upErr) throw new Error(`Restore media failed (${from}): ${upErr.message}`)
      await adminSupabase.storage.from(q.bucket).remove([to])
    }
    restored++
  }
  return restored
}

async function purgeQuarantinedFiles(payload) {
  const q = payload?.quarantine
  if (!q?.bucket) return 0

  // Prefer recorded paths; also wipe the snapshot quarantine folder if present
  const toRemove = []
  if (q.paths?.length) {
    for (const p of q.paths) if (p?.to) toRemove.push(p.to)
  }

  // Discover any leftover files under _quarantine/{snapshotId}
  // (payload may not have every path if quarantine was partial)
  // Caller may pass snapshotId via q.snapshotId — optional
  if (q.snapshotId) {
    const folder = `${QUARANTINE_ROOT}/${q.snapshotId}`
    const found = await listStorageFilePaths(q.bucket, folder)
    for (const f of found) toRemove.push(f)
  }

  const unique = [...new Set(toRemove)]
  for (let i = 0; i < unique.length; i += 100) {
    const chunk = unique.slice(i, i + 100)
    const { error } = await adminSupabase.storage.from(q.bucket).remove(chunk)
    if (error) console.warn('[quarantine] purge remove failed', error.message)
  }
  return unique.length
}

/**
 * Capture a record (and optional related rows) into the recycle bin before hard delete.
 * Never throws — delete flows must continue even if snapshot fails.
 *
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
 * Capture a full table slice (e.g. all auction_tracker rows for one FY)
 * so the Recycle Bin can restore the previous state after a bulk replace/merge.
 *
 * @returns {Promise<{ id: string }|null>}
 */
export async function captureTableSnapshot({
  module = 'other',
  tableName,
  snapshotKey,
  recordLabel = null,
  rows = [],
  meta = {},
  actor = null,
  notes = null,
}) {
  try {
    if (!tableName || !snapshotKey) return null
    if (!Array.isArray(rows) || rows.length === 0) return null

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
        record_id: String(snapshotKey),
        record_label: recordLabel || String(snapshotKey),
        payload: {
          kind: 'table_snapshot',
          rows,
          meta: meta || {},
        },
        deleted_by_email: actorEmail,
        deleted_by_name: actorName,
        deleted_by_role: actorRole,
        notes,
        status: 'deleted',
      })
      .select('id')
      .single()

    if (error) {
      console.error('cms_recycle_bin table snapshot insert failed:', error)
      return null
    }
    return data
  } catch (e) {
    console.error('captureTableSnapshot error:', e)
    return null
  }
}

/** Snapshot all auction_tracker rows for a financial year (before replace/merge/close). */
export async function snapshotAuctionTrackerFY(fy, { operation = 'change', notes = null, actor = null } = {}) {
  if (!fy) return null
  const { data, error } = await supabase
    .from('auction_tracker')
    .select('*')
    .eq('financial_year', fy)
  if (error) {
    console.error('snapshotAuctionTrackerFY fetch:', error)
    return null
  }
  if (!data?.length) return null

  return captureTableSnapshot({
    module: 'auction',
    tableName: 'auction_tracker',
    snapshotKey: `auction_tracker:FY:${fy}:${Date.now()}`,
    recordLabel: `Auction tracker FY ${fy} (${data.length} members)`,
    rows: data,
    meta: { financial_year: fy, operation },
    notes: notes || `Snapshot before ${operation} (FY ${fy})`,
    actor,
  })
}

/**
 * Snapshot every FY then delete all auction tracker, season, and file records.
 * Does not touch receipts, receipt_items, or other CMS tables.
 */
export async function flushAllAuctionTracker({ actor = null } = {}) {
  const PAGE = 1000
  const rows = []
  let from = 0
  while (true) {
    const { data, error } = await supabase
      .from('auction_tracker')
      .select('*')
      .range(from, from + PAGE - 1)
    if (error) throw error
    rows.push(...(data || []))
    if (!data || data.length < PAGE) break
    from += PAGE
  }

  const fys = [...new Set(rows.map((r) => r.financial_year).filter(Boolean))]
  for (const fy of fys) {
    const fyRows = rows.filter((r) => r.financial_year === fy)
    await captureTableSnapshot({
      module: 'auction',
      tableName: 'auction_tracker',
      snapshotKey: `auction_tracker:FY:${fy}:flush:${Date.now()}`,
      recordLabel: `Auction tracker FY ${fy} (${fyRows.length} members)`,
      rows: fyRows,
      meta: { financial_year: fy, operation: 'flush_all' },
      notes: `Snapshot before flush all auction tracker (FY ${fy})`,
      actor,
    })
  }

  let seasonRows = []
  let balRows = []
  try {
    const { data, error } = await supabase.from('auction_seasons').select('*')
    if (!error) seasonRows = data || []
  } catch { /* table may not exist yet */ }
  if (seasonRows.length) {
    await captureTableSnapshot({
      module: 'auction',
      tableName: 'auction_seasons',
      snapshotKey: `auction_seasons:flush:${Date.now()}`,
      recordLabel: `Auction seasons (${seasonRows.length})`,
      rows: seasonRows,
      meta: { operation: 'flush_all' },
      notes: 'Snapshot before flush all auction seasons',
      actor,
    })
  }
  try {
    const { data, error } = await supabase.from('auction_close_balances').select('*')
    if (!error) balRows = data || []
  } catch { /* table may not exist yet */ }
  if (balRows.length) {
    await captureTableSnapshot({
      module: 'auction',
      tableName: 'auction_close_balances',
      snapshotKey: `auction_close_balances:flush:${Date.now()}`,
      recordLabel: `Auction close balances (${balRows.length})`,
      rows: balRows,
      meta: { operation: 'flush_all' },
      notes: 'Snapshot before flush all auction close balances',
      actor,
    })
  }

  const { error: balErr } = await supabase.from('auction_close_balances').delete().not('financial_year', 'is', null)
  if (balErr && !String(balErr.message || '').includes('auction_close_balances')) throw balErr
  const { error: seasonErr } = await supabase.from('auction_seasons').delete().not('financial_year', 'is', null)
  if (seasonErr && !String(seasonErr.message || '').includes('auction_seasons')) throw seasonErr

  for (const fy of fys) {
    const { error: delErr } = await supabase
      .from('auction_tracker')
      .delete()
      .eq('financial_year', fy)
    if (delErr) throw delErr
  }

  let filesDeleted = 0
  try {
    const { flushAuctionDocumentStorage } = await import('./auctionDocumentsLib.js')
    filesDeleted = await flushAuctionDocumentStorage()
  } catch (e) {
    console.warn('flushAuctionDocumentStorage', e)
  }

  await logCmsAudit({
    action: 'deleted',
    module: 'auction',
    entityType: 'auction_tracker',
    entityId: 'all',
    summary: `Flushed auction reports (${rows.length} tracker rows; ${seasonRows?.length || 0} seasons; ${filesDeleted} files). Receipts not touched.`,
    actor,
  })
  return { deleted: rows.length, fys, seasons: seasonRows?.length || 0, filesDeleted }
}

/**
 * Always-save Close Year undo token (even when target FY had 0 rows).
 * Recycle Bin restore replaces toFY with prior_rows (often empty = clear carry).
 */
export async function snapshotCloseYearUndo({ fromFY, toFY, priorRows = [], extra = {}, actor = null, notes = null } = {}) {
  if (!fromFY || !toFY) return null
  try {
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

    const rows = Array.isArray(priorRows) ? priorRows : []
    const { data, error } = await supabase
      .from('cms_recycle_bin')
      .insert({
        module: 'auction',
        table_name: 'auction_tracker',
        record_id: `auction_tracker:close_year:${fromFY}->${toFY}:${Date.now()}`,
        record_label: `Close year undo: ${fromFY} → ${toFY}`,
        payload: {
          kind: 'close_year_undo',
          rows,
          meta: {
            financial_year: fromFY,
            from_fy: fromFY,
            to_fy: toFY,
            operation: 'close_year',
            season: extra?.season || null,
            close_balances: extra?.closeBalances || [],
            next_tracker_count: extra?.nextTrackerCount || 0,
          },
        },
        deleted_by_email: actorEmail,
        deleted_by_name: actorName,
        deleted_by_role: actorRole,
        notes: notes || `Undo Close Year ${fromFY}: restore season to open`,
        status: 'deleted',
      })
      .select('id')
      .single()

    if (error) {
      console.error('snapshotCloseYearUndo insert failed:', error)
      return null
    }
    return data
  } catch (e) {
    console.error('snapshotCloseYearUndo error:', e)
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
 * Restore a snapshotted record back into its table (+ related rows + quarantined media).
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

  // ── Auction reference file (storage only, no table row) ──
  if (payload.row?._kind === 'auction_document') {
    await restoreQuarantinedFiles(payload)
    let emailTs = actor?.email || null
    if (!emailTs) {
      const { data: { user } } = await supabase.auth.getUser()
      emailTs = user?.email || null
    }
    await supabase
      .from('cms_recycle_bin')
      .update({
        status: 'restored',
        restored_at: new Date().toISOString(),
        restored_by_email: emailTs,
      })
      .eq('id', id)
    await logCmsAudit({
      action: 'restored',
      module: 'auction',
      entityType: 'auction_documents',
      entityId: item.record_id,
      entityLabel: item.record_label,
      summary: `Restored auction reference file ${item.record_label || item.record_id}`,
      actor,
    })
    return item
  }

  // ── Close-year undo: reopen season (do not wipe tracker history) ──
  if (payload.kind === 'close_year_undo') {
    const fromFy = payload.meta?.from_fy
    if (fromFy) {
      const { reopenAuctionSeason } = await import('./auctionSeasonsLib.js')
      await reopenAuctionSeason(fromFy)
    }
    let emailTs = actor?.email || null
    if (!emailTs) {
      const { data: { user } } = await supabase.auth.getUser()
      emailTs = user?.email || null
    }
    await supabase
      .from('cms_recycle_bin')
      .update({
        status: 'restored',
        restored_at: new Date().toISOString(),
        restored_by_email: emailTs,
      })
      .eq('id', id)
    await logCmsAudit({
      action: 'restored',
      module: 'auction',
      entityType: 'auction_seasons',
      entityId: item.record_id,
      entityLabel: item.record_label,
      summary: `Undid Close Year${fromFy ? ` ${fromFy}` : ''}: season is open again (Forfeit/Carry cleared). Re-close to choose Carry if needed.`,
      actor,
    })
    return item
  }

  // ── Bulk table snapshot (auction_tracker FY) ──
  if (payload.kind === 'table_snapshot') {
    const rows = Array.isArray(payload.rows) ? payload.rows : []
    if (payload.kind === 'table_snapshot' && !rows.length) {
      throw new Error('Snapshot payload has no rows')
    }
    const fy = payload.meta?.financial_year || payload.meta?.to_fy

    if (item.table_name === 'auction_tracker' && fy) {
      const { error: delErr } = await supabase
        .from('auction_tracker')
        .delete()
        .eq('financial_year', fy)
      if (delErr) throw delErr
    } else if (item.table_name === 'auction_tracker') {
      throw new Error('Auction tracker snapshot is missing financial_year metadata')
    } else if (item.table_name === 'auction_seasons') {
      const { error: delErr } = await supabase.from('auction_seasons').delete().not('financial_year', 'is', null)
      if (delErr) throw delErr
    } else if (item.table_name === 'auction_close_balances') {
      const { error: delErr } = await supabase.from('auction_close_balances').delete().not('financial_year', 'is', null)
      if (delErr) throw delErr
    } else {
      throw new Error(`Bulk restore not supported for table ${item.table_name}`)
    }

    if (rows.length) {
      const CHUNK = 200
      const conflict = item.table_name === 'auction_seasons'
        ? 'financial_year'
        : 'financial_year,member_id'
      for (let i = 0; i < rows.length; i += CHUNK) {
        const chunk = rows.slice(i, i + CHUNK)
        const { error: insErr } = await supabase.from(item.table_name).insert(chunk)
        if (insErr) {
          const { error: upErr } = await supabase
            .from(item.table_name)
            .upsert(chunk, { onConflict: conflict })
          if (upErr) throw new Error(`Restore failed: ${upErr.message}`)
        }
      }
    }

    let emailTs = actor?.email || null
    if (!emailTs) {
      const { data: { user } } = await supabase.auth.getUser()
      emailTs = user?.email || null
    }

    await supabase
      .from('cms_recycle_bin')
      .update({
        status: 'restored',
        restored_at: new Date().toISOString(),
        restored_by_email: emailTs,
      })
      .eq('id', id)

    await logCmsAudit({
      action: 'restored',
      module: 'recycle_bin',
      entityType: item.table_name,
      entityId: item.record_id,
      entityLabel: item.record_label,
      summary: `Restored ${item.module}/${item.table_name} snapshot (${rows.length} rows) from Recycle Bin`,
      actor,
    })
    return item
  }

  // ── Single-row snapshot (default) ───────────────────────────────
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

  // Restore media first so URLs in the row resolve after insert
  await restoreQuarantinedFiles(payload)

  const rowToInsert = { ...row }
  // Church documents: category may have been hard-deleted — avoid FK failure
  if (item.table_name === 'church_documents' && rowToInsert.category_id) {
    const { data: cat } = await supabase
      .from('church_document_categories')
      .select('id')
      .eq('id', rowToInsert.category_id)
      .maybeSingle()
    if (!cat) rowToInsert.category_id = null
  }
  if (item.table_name === 'print_corner_templates' && rowToInsert.category_id) {
    const { data: cat } = await supabase
      .from('print_corner_categories')
      .select('id')
      .eq('id', rowToInsert.category_id)
      .maybeSingle()
    if (!cat) rowToInsert.category_id = null
  }

  const { error: insErr } = await supabase.from(item.table_name).insert(rowToInsert)
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
    module: 'recycle_bin',
    entityType: item.table_name,
    entityId: item.record_id,
    entityLabel: item.record_label,
    summary: `Restored ${item.module}/${item.table_name} ${item.record_label || item.record_id} from Recycle Bin`,
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

  const payload = { ...(item.payload || {}), quarantine: { ...(item.payload?.quarantine || {}), snapshotId: id } }
  await purgeQuarantinedFiles(payload)

  await supabase
    .from('cms_recycle_bin')
    .update({
      status: 'purged',
      purged_at: new Date().toISOString(),
    })
    .eq('id', id)

  await logCmsAudit({
    action: 'purged',
    module: 'recycle_bin',
    entityType: 'recycle_bin',
    entityId: id,
    entityLabel: item.record_label,
    summary: `Purged Recycle Bin snapshot of ${item.module}/${item.table_name} ${item.record_label || item.record_id}`,
    actor,
  })
}

export async function purgeAllRecycleBin(actor = null) {
  const { data: items, error: listErr } = await supabase
    .from('cms_recycle_bin')
    .select('id, payload')
    .eq('status', 'deleted')
  if (listErr) throw listErr

  for (const item of (items || [])) {
    const payload = { ...(item.payload || {}), quarantine: { ...(item.payload?.quarantine || {}), snapshotId: item.id } }
    await purgeQuarantinedFiles(payload)
  }

  const now = new Date().toISOString()
  const { data, error } = await supabase
    .from('cms_recycle_bin')
    .update({ status: 'purged', purged_at: now })
    .eq('status', 'deleted')
    .select('id')
  if (error) throw error
  await logCmsAudit({
    action: 'purged',
    module: 'recycle_bin',
    entityType: 'recycle_bin',
    summary: `Purged all Recycle Bin snapshots (${data?.length || 0})`,
    actor,
  })
  return data?.length || 0
}

/**
 * Permanently purge recycle-bin snapshots older than `maxAgeDays` (status=deleted).
 * Removes quarantined media, then marks rows purged. Used by Auto Flush / Run Now.
 *
 * @returns {Promise<{ purged: number, keptFresh: number, error?: string }>}
 */
export async function purgeExpiredRecycleBinItems(
  maxAgeDays = RECYCLE_BIN_RETENTION_DAYS,
  actor = null,
) {
  const cutoff = new Date(Date.now() - maxAgeDays * 24 * 60 * 60 * 1000).toISOString()

  const { count: totalDeleted, error: totalErr } = await adminSupabase
    .from('cms_recycle_bin')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'deleted')
  if (totalErr) return { purged: 0, keptFresh: 0, error: totalErr.message }

  const stale = []
  for (let from = 0; ; from += 1000) {
    const { data: page, error } = await adminSupabase
      .from('cms_recycle_bin')
      .select('id, payload, table_name, record_label, record_id, module')
      .eq('status', 'deleted')
      .lt('deleted_at', cutoff)
      .range(from, from + 999)
    if (error) return { purged: 0, keptFresh: totalDeleted || 0, error: error.message }
    const rows = page || []
    stale.push(...rows)
    if (rows.length < 1000) break
  }

  const keptFresh = Math.max(0, (totalDeleted || 0) - stale.length)
  if (!stale.length) return { purged: 0, keptFresh }

  const now = new Date().toISOString()
  let purged = 0
  for (const item of stale) {
    const payload = {
      ...(item.payload || {}),
      quarantine: { ...(item.payload?.quarantine || {}), snapshotId: item.id },
    }
    // Ensure we wipe quarantine even when payload.bucket is missing
    if (!payload.quarantine.bucket) {
      for (const bucket of QUARANTINE_BUCKETS) {
        await purgeQuarantinedFiles({
          quarantine: { bucket, snapshotId: item.id, paths: payload.quarantine.paths },
        })
      }
    } else {
      await purgeQuarantinedFiles(payload)
    }

    const { error: updErr } = await adminSupabase
      .from('cms_recycle_bin')
      .update({ status: 'purged', purged_at: now })
      .eq('id', item.id)
      .eq('status', 'deleted')
    if (updErr) return { purged, keptFresh, error: updErr.message }
    purged++
  }

  await logCmsAudit({
    action: 'purged',
    module: 'recycle_bin',
    entityType: 'recycle_bin',
    summary: `Auto-purged ${purged} Recycle Bin snapshot(s) older than ${maxAgeDays} days`,
    actor,
  })

  return { purged, keptFresh }
}
