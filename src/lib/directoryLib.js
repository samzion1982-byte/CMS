/**
 * Phone Directory — categories (nested) + contacts CRUD.
 * Reuses master-tree helpers from assetsLib for category hierarchy.
 */

import { supabase } from './supabase'
import { logCmsAudit } from './cmsAudit'
import { captureDeletedRecord } from './cmsRecycleBin'
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

const CONTACT_SELECT = `
  *,
  category:directory_categories(id, name, parent_id)
`

/* ── Categories ──────────────────────────────────────────────── */

export async function getDirectoryCategories(activeOnly = true) {
  let q = supabase.from('directory_categories').select('*').order('sort_order').order('name')
  if (activeOnly) q = q.eq('is_active', true)
  const { data, error } = await q
  if (error) throw error
  return data || []
}

export async function saveDirectoryCategory({ id, name, sort_order, is_active, parent_id }) {
  const payload = {
    name: (name || '').trim(),
    sort_order: sort_order ?? 0,
    is_active: is_active ?? true,
    parent_id: parent_id || null,
  }
  if (!payload.name) throw new Error('Name is required.')

  if (id) {
    const { data, error } = await supabase
      .from('directory_categories').update(payload).eq('id', id).select().single()
    if (error) throw error
    await logCmsAudit({
      action: 'updated',
      module: 'directory',
      entityType: 'directory_categories',
      entityId: id,
      entityLabel: payload.name,
      summary: `Updated directory category ${payload.name}`,
    })
    return data
  }

  const { data, error } = await supabase
    .from('directory_categories').insert(payload).select().single()
  if (error) throw error
  await logCmsAudit({
    action: 'created',
    module: 'directory',
    entityType: 'directory_categories',
    entityId: data.id,
    entityLabel: payload.name,
    summary: `Created directory category ${payload.name}`,
  })
  return data
}

export async function deactivateDirectoryCategory(id) {
  const { error } = await supabase
    .from('directory_categories').update({ is_active: false }).eq('id', id)
  if (error) throw error
  await logCmsAudit({
    action: 'deactivated',
    module: 'directory',
    entityType: 'directory_categories',
    entityId: id,
    summary: `Deactivated directory category ${id}`,
  })
}

export async function deleteDirectoryCategory(id) {
  const { data: row } = await supabase
    .from('directory_categories').select('*').eq('id', id).maybeSingle()
  const allCats = await getDirectoryCategories(false)
  const descendants = getAllMasterDescendants(id, allCats)
  // Parents before children so Recycle Bin restore can re-insert nested trees
  const byId = Object.fromEntries(descendants.map(r => [r.id, r]))
  const depthOf = (r) => {
    let d = 0
    let cur = r
    const seen = new Set()
    while (cur?.parent_id && byId[cur.parent_id] && !seen.has(cur.id)) {
      seen.add(cur.id)
      cur = byId[cur.parent_id]
      d += 1
    }
    return d
  }
  const relatedCats = [...descendants].sort((a, b) => depthOf(a) - depthOf(b))
  await captureDeletedRecord({
    module: 'directory',
    tableName: 'directory_categories',
    recordId: id,
    recordLabel: row?.name || id,
    row,
    related: relatedCats.length
      ? { directory_categories: relatedCats }
      : null,
  })
  const { error } = await supabase.from('directory_categories').delete().eq('id', id)
  if (error) throw error
  await logCmsAudit({
    action: 'deleted',
    module: 'directory',
    entityType: 'directory_categories',
    entityId: id,
    entityLabel: row?.name || id,
    summary: `Deleted directory category ${row?.name || id}`,
  })
}

export async function moveDirectoryCategory(dragNode, targetNode, dropPos, allRows) {
  return moveMasterItem('directory_categories', dragNode, targetNode, dropPos, allRows)
}

/* ── Contacts ────────────────────────────────────────────────── */

export async function getDirectoryContacts({
  includeInactive = false,
  categoryId = null,
  search = '',
  alpha = '',
} = {}) {
  let q = supabase
    .from('directory_contacts')
    .select(CONTACT_SELECT)
    .order('name')

  if (!includeInactive) q = q.eq('is_active', true)
  if (categoryId) q = q.eq('category_id', categoryId)
  if (alpha) q = q.ilike('name', `${alpha}%`)
  if (search?.trim()) {
    const fields = ['name', 'organization', 'phone', 'whatsapp', 'email', 'title', 'notes']
    // Any word matches any field (notes used as keywords)
    const words = search.trim().split(/\s+/).filter(Boolean)
      .map(w => w.replace(/[,()]/g, ''))
      .filter(Boolean)
    if (words.length) {
      const clauses = words.flatMap(w => fields.map(f => `${f}.ilike.%${w}%`))
      q = q.or(clauses.join(','))
    }
  }

  const { data, error } = await q
  if (error) throw error
  return data || []
}

export async function saveDirectoryContact(row, profileName = '') {
  const kind = row.contact_kind === 'organisation' ? 'organisation' : 'person'
  const payload = {
    contact_kind: kind,
    category_id: row.category_id || null,
    name: (row.name || '').trim(),
    organization: (row.organization || '').trim() || null,
    title: (row.title || '').trim() || null,
    phone: (row.phone || '').trim() || null,
    whatsapp: (row.whatsapp || '').trim() || null,
    email: (row.email || '').trim() || null,
    address: (row.address || '').trim() || null,
    notes: (row.notes || '').trim() || null,
    sort_order: row.sort_order ?? 0,
    is_active: row.is_active ?? true,
    updated_by: profileName || null,
  }
  if (!payload.name) {
    throw new Error(kind === 'organisation' ? 'Organisation name is required.' : 'Name is required.')
  }

  if (row.id) {
    const { data, error } = await supabase
      .from('directory_contacts').update(payload).eq('id', row.id).select(CONTACT_SELECT).single()
    if (error) throw error
    await logCmsAudit({
      action: 'updated',
      module: 'directory',
      entityType: 'directory_contacts',
      entityId: row.id,
      entityLabel: payload.name,
      summary: `Updated contact ${payload.name}`,
    })
    return data
  }

  const { data, error } = await supabase
    .from('directory_contacts')
    .insert({ ...payload, created_by: profileName || null })
    .select(CONTACT_SELECT)
    .single()
  if (error) throw error
  await logCmsAudit({
    action: 'created',
    module: 'directory',
    entityType: 'directory_contacts',
    entityId: data.id,
    entityLabel: payload.name,
    summary: `Created contact ${payload.name}`,
  })
  return data
}

export async function deleteDirectoryContact(id, label = '') {
  const { data: row } = await supabase
    .from('directory_contacts').select('*').eq('id', id).maybeSingle()
  await captureDeletedRecord({
    module: 'directory',
    tableName: 'directory_contacts',
    recordId: id,
    recordLabel: label || row?.name || id,
    row,
  })
  const { error } = await supabase.from('directory_contacts').delete().eq('id', id)
  if (error) throw error
  await logCmsAudit({
    action: 'deleted',
    module: 'directory',
    entityType: 'directory_contacts',
    entityId: id,
    entityLabel: label || row?.name || id,
    summary: `Deleted contact ${label || row?.name || id}`,
  })
}

/** Normalize Indian mobile to 91XXXXXXXXXX for directory import/save. */
export function normalizeDirectoryPhone(raw) {
  const trimmed = String(raw || '').trim()
  if (!trimmed) return { ok: true, value: '' }
  let digits = trimmed.replace(/\D/g, '')
  if (digits.startsWith('91') && digits.length >= 12) digits = digits.slice(-10)
  else if (digits.startsWith('0') && digits.length === 11) digits = digits.slice(1)
  if (digits.length === 10 && /^[6-9]/.test(digits)) {
    return { ok: true, value: `91${digits}` }
  }
  return { ok: false, value: '' }
}

/** Match Excel category label to directory_categories id (path or leaf name). */
export function resolveDirectoryCategoryId(label, categories = []) {
  const want = String(label || '').trim().toLowerCase()
  if (!want || !categories.length) return null
  for (const c of categories) {
    if (masterDisplayName(c, categories).toLowerCase() === want) return c.id
  }
  for (const c of categories) {
    if ((c.name || '').toLowerCase() === want) return c.id
  }
  const leaf = want.split(/[›>/|]/).map(s => s.trim()).filter(Boolean).pop()
  if (leaf) {
    for (const c of categories) {
      if ((c.name || '').toLowerCase() === leaf) return c.id
    }
  }
  return null
}

/**
 * Bulk insert directory contacts (Excel import).
 * records: payload objects without id (contact_kind, name, …).
 */
export async function bulkImportDirectoryContacts(records, profileName = '', onProgress) {
  if (!records?.length) return 0
  const chunkSize = 40
  let inserted = 0
  for (let i = 0; i < records.length; i += chunkSize) {
    const slice = records.slice(i, i + chunkSize).map(r => ({
      contact_kind: r.contact_kind === 'organisation' ? 'organisation' : 'person',
      category_id: r.category_id || null,
      name: (r.name || '').trim(),
      organization: (r.organization || '').trim() || null,
      title: (r.title || '').trim() || null,
      phone: (r.phone || '').trim() || null,
      whatsapp: (r.whatsapp || '').trim() || null,
      email: (r.email || '').trim() || null,
      address: (r.address || '').trim() || null,
      notes: (r.notes || '').trim() || null,
      sort_order: r.sort_order ?? 0,
      is_active: r.is_active ?? true,
      created_by: profileName || null,
      updated_by: profileName || null,
    }))
    const { error } = await supabase.from('directory_contacts').insert(slice)
    if (error) throw error
    inserted += slice.length
    onProgress?.(inserted, records.length)
  }
  await logCmsAudit({
    action: 'created',
    module: 'directory',
    entityType: 'directory_contacts',
    entityId: null,
    entityLabel: `${inserted} contacts`,
    summary: `Imported ${inserted} directory contacts from Excel`,
  })
  return inserted
}

/** All category ids under a node (including itself) — for sidebar filters. */
export function categoryIdsIncludingDescendants(rootId, allRows = []) {
  if (!rootId) return []
  const kids = getAllMasterDescendants(rootId, allRows)
  return [rootId, ...kids.map(k => k.id)]
}
