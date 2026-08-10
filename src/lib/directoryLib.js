/**
 * Phone Directory — categories (nested) + contacts CRUD.
 * Reuses master-tree helpers from assetsLib for category hierarchy.
 */

import { supabase } from './supabase'
import { logCmsAudit } from './cmsAudit'
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
  const { error } = await supabase.from('directory_categories').delete().eq('id', id)
  if (error) throw error
  await logCmsAudit({
    action: 'deleted',
    module: 'directory',
    entityType: 'directory_categories',
    entityId: id,
    summary: `Deleted directory category ${id}`,
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
    const s = search.trim()
    q = q.or(
      `name.ilike.%${s}%,organization.ilike.%${s}%,phone.ilike.%${s}%,whatsapp.ilike.%${s}%,email.ilike.%${s}%,title.ilike.%${s}%`,
    )
  }

  const { data, error } = await q
  if (error) throw error
  return data || []
}

export async function saveDirectoryContact(row, profileName = '') {
  const payload = {
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
  if (!payload.name) throw new Error('Name is required.')

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
  const { error } = await supabase.from('directory_contacts').delete().eq('id', id)
  if (error) throw error
  await logCmsAudit({
    action: 'deleted',
    module: 'directory',
    entityType: 'directory_contacts',
    entityId: id,
    entityLabel: label,
    summary: `Deleted contact ${label || id}`,
  })
}

/** All category ids under a node (including itself) — for sidebar filters. */
export function categoryIdsIncludingDescendants(rootId, allRows = []) {
  if (!rootId) return []
  const kids = getAllMasterDescendants(rootId, allRows)
  return [rootId, ...kids.map(k => k.id)]
}
