/* ═══════════════════════════════════════════════════════════════
   churchDocumentsLib.js — Church document vault (invoices / warranty)
   Active until warranty ends → Archive
   ═══════════════════════════════════════════════════════════════ */

import { supabase } from './supabase'
import { logCmsAudit } from './cmsAudit'
import { captureDeletedRecord, quarantineStoragePaths } from './cmsRecycleBin'
import {
  buildMasterTree,
  flattenMasterOptions,
  masterDisplayName,
  moveMasterItem,
  getAllMasterDescendants,
} from './assetsLib'

export {
  buildMasterTree,
  flattenMasterOptions,
  masterDisplayName,
  moveMasterItem,
  getAllMasterDescendants,
}

export const CHURCH_DOC_MAX_BYTES = 10 * 1024 * 1024

const BUCKET = 'church-documents'
const CAT_TABLE = 'church_document_categories'

const DOC_SELECT = `
  *,
  category:church_document_categories(id, name, parent_id)
`

/* ── Categories ──────────────────────────────────────────────── */

export async function getChurchDocumentCategories(activeOnly = true) {
  let q = supabase.from(CAT_TABLE).select('*').order('sort_order').order('name')
  if (activeOnly) q = q.eq('is_active', true)
  const { data, error } = await q
  if (error) throw error
  return data || []
}

export async function saveChurchDocumentCategory({ id, name, sort_order, is_active, parent_id }) {
  const payload = {
    name: (name || '').trim(),
    sort_order: sort_order ?? 0,
    is_active: is_active ?? true,
    parent_id: parent_id || null,
  }
  if (!payload.name) throw new Error('Name is required.')

  if (id) {
    const { data, error } = await supabase
      .from(CAT_TABLE).update(payload).eq('id', id).select().single()
    if (error) throw error
    await logCmsAudit({
      action: 'updated',
      module: 'assets',
      entityType: CAT_TABLE,
      entityId: id,
      entityLabel: payload.name,
      summary: `Updated document category ${payload.name}`,
    })
    return data
  }

  const { data, error } = await supabase.from(CAT_TABLE).insert(payload).select().single()
  if (error) throw error
  await logCmsAudit({
    action: 'created',
    module: 'assets',
    entityType: CAT_TABLE,
    entityId: data.id,
    entityLabel: payload.name,
    summary: `Created document category ${payload.name}`,
  })
  return data
}

export async function moveChurchDocumentCategory(dragNode, targetNode, dropPos, allRows) {
  return moveMasterItem(CAT_TABLE, dragNode, targetNode, dropPos, allRows)
}

/* ── Documents ───────────────────────────────────────────────── */

export async function getChurchDocuments({ status = 'active', categoryId = null, search = '' } = {}) {
  let q = supabase
    .from('church_documents')
    .select(DOC_SELECT)
    .eq('is_active', true)
    .order('doc_date', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })

  if (status === 'active' || status === 'archived') q = q.eq('status', status)
  if (categoryId) q = q.eq('category_id', categoryId)
  if (search?.trim()) {
    const s = search.trim().replace(/[,()]/g, '')
    if (s) {
      q = q.or(
        `title.ilike.%${s}%,doc_type.ilike.%${s}%,vendor.ilike.%${s}%,notes.ilike.%${s}%,file_name.ilike.%${s}%`,
      )
    }
  }

  const { data, error } = await q
  if (error) throw error
  return data || []
}

function localDateISO(d = new Date()) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function isWarrantyExpired(doc, today = new Date()) {
  if (!doc?.warranty_upto) return false
  const w = String(doc.warranty_upto).slice(0, 10)
  const t = localDateISO(today)
  return w < t
}

/** Calendar days from today until date (negative if already past). */
export function daysUntilDate(iso, today = new Date()) {
  if (!iso) return null
  const w = String(iso).slice(0, 10)
  const m = w.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return null
  const t = localDateISO(today)
  const tm = t.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  const a = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  const b = new Date(Number(tm[1]), Number(tm[2]) - 1, Number(tm[3]))
  return Math.round((a - b) / 86400000)
}

export function normalizeAlertDays(value) {
  if (value == null || value === '') return null
  const n = parseInt(value, 10)
  if (!Number.isFinite(n) || n < 1) return null
  return Math.min(365, n)
}

export function isDocumentAlertDue(doc, today = new Date()) {
  const days = normalizeAlertDays(doc?.alert_days_before)
  if (!days || !doc?.warranty_upto) return false
  const left = daysUntilDate(doc.warranty_upto, today)
  return left != null && left <= days
}

/** Active documents whose expiry is within the configured alert window. */
export async function getChurchDocumentsDueForAlert() {
  const { data, error } = await supabase
    .from('church_documents')
    .select('id, title, vendor, warranty_upto, alert_days_before')
    .eq('status', 'active')
    .eq('is_active', true)
    .not('alert_days_before', 'is', null)
    .not('warranty_upto', 'is', null)
  if (error) throw error
  return (data || []).filter((d) => isDocumentAlertDue(d))
}

/** Move active docs whose warranty_upto has passed into Archive. */
export async function archiveExpiredDocuments(updatedBy = null) {
  const today = localDateISO()
  const { data, error } = await supabase
    .from('church_documents')
    .update({
      status: 'archived',
      archived_at: new Date().toISOString(),
      updated_by: updatedBy,
    })
    .eq('status', 'active')
    .eq('is_active', true)
    .not('warranty_upto', 'is', null)
    .is('alert_days_before', null)
    .lt('warranty_upto', today)
    .select('id, title')
  if (error) throw error
  const rows = data || []
  if (rows.length) {
    await logCmsAudit({
      action: 'updated',
      module: 'assets',
      entityType: 'church_documents',
      entityLabel: `${rows.length} documents`,
      summary: `Auto-archived ${rows.length} church document(s) after warranty expiry`,
      actor: updatedBy ? { email: updatedBy } : null,
    })
  }
  return rows.length
}

export async function setChurchDocumentStatus(id, status, updatedBy = null) {
  if (!['active', 'archived'].includes(status)) throw new Error('Invalid status.')
  const payload = {
    status,
    archived_at: status === 'archived' ? new Date().toISOString() : null,
    updated_by: updatedBy,
  }
  const { data, error } = await supabase
    .from('church_documents')
    .update(payload)
    .eq('id', id)
    .select(DOC_SELECT)
    .single()
  if (error) throw error
  await logCmsAudit({
    action: 'updated',
    module: 'assets',
    entityType: 'church_documents',
    entityId: id,
    entityLabel: data.title,
    summary: status === 'archived'
      ? `Archived church document ${data.title}`
      : `Restored church document ${data.title} to Active`,
    actor: updatedBy ? { email: updatedBy } : null,
  })
  return data
}

async function uploadDocFile(file, folder) {
  if (file.size > CHURCH_DOC_MAX_BYTES) {
    throw new Error(`Document must be under ${Math.round(CHURCH_DOC_MAX_BYTES / (1024 * 1024))} MB.`)
  }
  const ext = (file.name.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '')
  const path = `${folder}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    upsert: false,
    contentType: file.type || 'application/octet-stream',
  })
  if (error) throw error
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path)
  return { path, url: data.publicUrl }
}

async function removeDocFile(filePath) {
  if (!filePath) return
  await supabase.storage.from(BUCKET).remove([filePath]).catch(() => {})
}

export async function saveChurchDocument({
  id = null,
  title,
  category_id = null,
  doc_type = null,
  doc_date = null,
  warranty_upto = null,
  alert_days_before = null,
  vendor = null,
  notes = null,
  file = null,
  created_by = null,
}) {
  const name = (title || file?.name || '').trim()
  if (!name) throw new Error('Document title is required.')

  if (id) {
    let previousPath = null
    if (file) {
      const { data: prev } = await supabase
        .from('church_documents')
        .select('file_path')
        .eq('id', id)
        .maybeSingle()
      previousPath = prev?.file_path || null
    }
    const payload = {
      title: name,
      category_id: category_id || null,
      doc_type: doc_type?.trim() || null,
      doc_date: doc_date || null,
      warranty_upto: warranty_upto || null,
      alert_days_before: warranty_upto ? normalizeAlertDays(alert_days_before) : null,
      vendor: vendor?.trim() || null,
      notes: notes?.trim() || null,
      updated_by: created_by,
    }
    if (file) {
      const uploaded = await uploadDocFile(file, `docs/${id}`)
      payload.file_name = file.name
      payload.file_path = uploaded.path
      payload.file_url = uploaded.url
      payload.mime_type = file.type || null
      payload.file_size = file.size
    }
    const { data, error } = await supabase
      .from('church_documents')
      .update(payload)
      .eq('id', id)
      .select(DOC_SELECT)
      .single()
    if (error) throw error
    if (previousPath && previousPath !== data?.file_path) {
      await supabase.storage.from(BUCKET).remove([previousPath]).catch(() => {})
    }
    await logCmsAudit({
      action: 'updated',
      module: 'assets',
      entityType: 'church_documents',
      entityId: id,
      entityLabel: name,
      summary: `Updated church document ${name}`,
      actor: created_by ? { email: created_by } : null,
    })
    return data
  }

  if (!file) throw new Error('Choose a file to upload.')
  const tempFolder = `docs/temp_${Date.now()}`
  const uploaded = await uploadDocFile(file, tempFolder)

  const { data, error } = await supabase
    .from('church_documents')
    .insert({
      title: name,
      category_id: category_id || null,
      doc_type: doc_type?.trim() || null,
      doc_date: doc_date || null,
      warranty_upto: warranty_upto || null,
      alert_days_before: warranty_upto ? normalizeAlertDays(alert_days_before) : null,
      vendor: vendor?.trim() || null,
      notes: notes?.trim() || null,
      status: 'active',
      file_name: file.name,
      file_path: uploaded.path,
      file_url: uploaded.url,
      mime_type: file.type || null,
      file_size: file.size,
      created_by,
      updated_by: created_by,
    })
    .select(DOC_SELECT)
    .single()

  if (error) {
    await removeDocFile(uploaded.path)
    throw error
  }

  await logCmsAudit({
    action: 'created',
    module: 'assets',
    entityType: 'church_documents',
    entityId: data.id,
    entityLabel: name,
    summary: `Uploaded church document ${name}`,
    actor: created_by ? { email: created_by } : null,
  })
  return data
}

export async function deleteChurchDocument(id, updatedBy = null) {
  const { data: doc } = await supabase
    .from('church_documents')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  const snap = await captureDeletedRecord({
    module: 'assets',
    tableName: 'church_documents',
    recordId: id,
    recordLabel: doc?.title || doc?.file_name || id,
    row: doc,
    actor: updatedBy ? { email: updatedBy } : null,
  })

  if (doc?.file_path && snap?.id) {
    await quarantineStoragePaths({
      bucket: BUCKET,
      paths: [doc.file_path],
      snapshotId: snap.id,
    }).catch((e) => console.warn('[quarantine] church document', e))
  }

  const { error } = await supabase.from('church_documents').delete().eq('id', id)
  if (error) throw error

  await logCmsAudit({
    action: 'deleted',
    module: 'assets',
    entityType: 'church_documents',
    entityId: id,
    entityLabel: doc?.title || id,
    summary: `Deleted church document ${doc?.title || id} (Recycle Bin)`,
    actor: updatedBy ? { email: updatedBy } : null,
  })
  return doc
}

export function formatFileSize(bytes) {
  if (bytes == null || bytes === '') return ''
  const n = Number(bytes)
  if (!Number.isFinite(n) || n < 0) return ''
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

export function formatDocDate(iso) {
  if (!iso) return '—'
  const s = String(iso).slice(0, 10)
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return s
  return `${m[3]}-${m[2]}-${m[1]}`
}
