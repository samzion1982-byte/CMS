/* ═══════════════════════════════════════════════════════════════
   cleanup-old-storage — FIFO auto-flush for transient storage
   buckets + DB log tables + Recycle Bin (45-day purge).
   Template files/folders are never touched.
   ═══════════════════════════════════════════════════════════════ */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
const sb = createClient(SUPABASE_URL, SERVICE_KEY)

const RULES = [
  { bucket: 'announcement-cards',   maxAgeHours: 48 },
  { bucket: 'announcement-reports', maxAgeHours: 48 },
  { bucket: 'family-records',       maxAgeHours: 168 },
  { bucket: 'payment-pages',        maxAgeHours: 168 },
]

const DB_RULES = [
  { table: 'login_logs',            maxAgeDays: 15, dateColumn: 'login_at' },
  { table: 'whatsapp_receipt_logs', maxAgeDays: 15, dateColumn: 'sent_at' },
  { table: 'announcements_log',     maxAgeDays: 15, dateColumn: 'sent_at' },
  { table: 'payment_request_logs',  maxAgeDays: 15, dateColumn: 'sent_at' },
  { table: 'cms_audit_log',         maxAgeDays: 15, dateColumn: 'created_at' },
]

const RECYCLE_BIN_RETENTION_DAYS = 45
const QUARANTINE_ROOT = '_quarantine'
const QUARANTINE_BUCKETS = [
  'event-media',
  'asset-photos',
  'receipt-pdfs',
  'fixed-asset-docs',
]

const isTemplate = (f) =>
  !f.metadata || f.name.toLowerCase().includes('template')

async function listStorageFilePaths(bucket, folderPrefix) {
  const paths = []
  async function walk(dir) {
    const { data, error } = await sb.storage.from(bucket).list(dir || '', { limit: 1000 })
    if (error || !data?.length) return
    for (const item of data) {
      if (item.name === '.emptyFolderPlaceholder') continue
      const full = dir ? `${dir}/${item.name}` : item.name
      if (folderPrefix && full !== folderPrefix && !full.startsWith(`${folderPrefix}/`)) continue
      if (item.id || item.metadata) paths.push(full)
      else await walk(full)
    }
  }
  await walk(folderPrefix || '')
  return paths
}

async function purgeQuarantineForSnapshot(item) {
  const q = item?.payload?.quarantine || {}
  const buckets = q.bucket ? [q.bucket] : QUARANTINE_BUCKETS
  const folder = `${QUARANTINE_ROOT}/${item.id}`

  for (const bucket of buckets) {
    const toRemove = new Set()
    if ((!q.bucket || q.bucket === bucket) && q.paths?.length) {
      for (const p of q.paths) if (p?.to) toRemove.add(p.to)
    }
    const found = await listStorageFilePaths(bucket, folder)
    for (const f of found) toRemove.add(f)

    const unique = [...toRemove]
    for (let i = 0; i < unique.length; i += 100) {
      const chunk = unique.slice(i, i + 100)
      if (!chunk.length) continue
      await sb.storage.from(bucket).remove(chunk)
    }
  }
}

async function purgeExpiredRecycleBin(now) {
  const cutoff = new Date(now - RECYCLE_BIN_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString()
  const stale = []
  let errMsg = null
  for (let from = 0; ; from += 1000) {
    const { data: page, error } = await sb
      .from('cms_recycle_bin')
      .select('id, payload')
      .eq('status', 'deleted')
      .lt('deleted_at', cutoff)
      .range(from, from + 999)
    if (error) { errMsg = error.message; break }
    const rows = page || []
    for (const r of rows) stale.push(r)
    if (rows.length < 1000) break
  }
  if (errMsg) return { table: 'cms_recycle_bin', deleted: 0, error: errMsg }
  if (!stale.length) return { table: 'cms_recycle_bin', deleted: 0, error: null }

  const purgedAt = new Date().toISOString()
  let deleted = 0
  for (const item of stale) {
    try {
      await purgeQuarantineForSnapshot(item)
      const { error: updErr } = await sb
        .from('cms_recycle_bin')
        .update({ status: 'purged', purged_at: purgedAt })
        .eq('id', item.id)
        .eq('status', 'deleted')
      if (updErr) return { table: 'cms_recycle_bin', deleted, error: updErr.message }
      deleted++
    } catch (e) {
      return { table: 'cms_recycle_bin', deleted, error: e?.message || String(e) }
    }
  }
  return { table: 'cms_recycle_bin', deleted, error: null, retentionDays: RECYCLE_BIN_RETENTION_DAYS }
}

serve(async (_req) => {
  const summary = []
  const now = Date.now()

  for (const rule of RULES) {
    const { data: rootItems, error: listErr } = await sb.storage
      .from(rule.bucket).list('', { limit: 10000 })

    if (listErr) {
      summary.push({ bucket: rule.bucket, deleted: 0, error: listErr.message })
      continue
    }

    const threshold = new Date(now - rule.maxAgeHours * 3600000)
    const toDelete = []

    for (const item of (rootItems || [])) {
      if (item.metadata) {
        if (isTemplate(item)) continue
        if (new Date(item.created_at) < threshold) toDelete.push(item.name)
      } else {
        if (item.name.toLowerCase().includes('template')) continue
        const { data: subItems } = await sb.storage
          .from(rule.bucket).list(item.name, { limit: 10000 })
        for (const f of (subItems || [])) {
          if (!f.metadata) continue
          if (isTemplate(f)) continue
          if (new Date(f.created_at) < threshold) toDelete.push(`${item.name}/${f.name}`)
        }
      }
    }

    if (!toDelete.length) {
      summary.push({ bucket: rule.bucket, deleted: 0, error: null })
      continue
    }

    let delErrMsg = null
    let deleted = 0
    for (let i = 0; i < toDelete.length; i += 100) {
      const chunk = toDelete.slice(i, i + 100)
      const { error: delErr } = await sb.storage.from(rule.bucket).remove(chunk)
      if (delErr) { delErrMsg = delErr.message; break }
      deleted += chunk.length
    }
    summary.push({ bucket: rule.bucket, deleted, error: delErrMsg })
  }

  for (const rule of DB_RULES) {
    const cutoff = new Date(now - rule.maxAgeDays * 24 * 60 * 60 * 1000).toISOString()
    const ids = []
    let staleErrMsg = null
    for (let from = 0; ; from += 1000) {
      const { data: page, error: staleErr } = await sb
        .from(rule.table)
        .select('id')
        .lt(rule.dateColumn, cutoff)
        .range(from, from + 999)
      if (staleErr) { staleErrMsg = staleErr.message; break }
      const rows = page || []
      for (const r of rows) ids.push(r.id)
      if (rows.length < 1000) break
    }

    if (staleErrMsg) {
      summary.push({ table: rule.table, deleted: 0, error: staleErrMsg })
      continue
    }
    if (!ids.length) {
      summary.push({ table: rule.table, deleted: 0, error: null })
      continue
    }

    let deleted = 0
    let delErrMsg = null
    for (let i = 0; i < ids.length; i += 200) {
      const chunk = ids.slice(i, i + 200)
      const { error: delErr, count } = await sb
        .from(rule.table)
        .delete({ count: 'exact' })
        .in('id', chunk)
      if (delErr) { delErrMsg = delErr.message; break }
      deleted += count || chunk.length
    }
    summary.push({ table: rule.table, deleted, error: delErrMsg })
  }

  // Recycle Bin: permanently purge deleted snapshots older than 45 days
  // (also removes quarantined photos/files under _quarantine/{snapshotId}/)
  summary.push(await purgeExpiredRecycleBin(now))

  console.log('[cleanup-old-storage]', JSON.stringify(summary))

  return new Response(
    JSON.stringify({ ok: true, summary, ran_at: new Date().toISOString() }),
    { headers: { 'Content-Type': 'application/json' } }
  )
})
