/* ═══════════════════════════════════════════════════════════════
   assetsLib.js — Assets inventory helpers
   ═══════════════════════════════════════════════════════════════ */

import { supabase } from './supabase'

const ASSET_SELECT = `
  *,
  location:asset_locations(id, name),
  item_type:asset_item_types(id, name),
  condition:asset_conditions(id, name, color)
`

export const ASSET_CATEGORIES = [
  { id: 'movable',  label: 'Movable Assets', enabled: true  },
  { id: 'building', label: 'Buildings',      enabled: false },
  { id: 'document', label: 'Documents',      enabled: false },
]

export async function getAssetLocations(activeOnly = true) {
  let q = supabase.from('asset_locations').select('*').order('sort_order').order('name')
  if (activeOnly) q = q.eq('is_active', true)
  const { data, error } = await q
  if (error) throw error
  return data || []
}

export async function getAssetItemTypes(activeOnly = true) {
  let q = supabase.from('asset_item_types').select('*').order('sort_order').order('name')
  if (activeOnly) q = q.eq('is_active', true)
  const { data, error } = await q
  if (error) throw error
  return data || []
}

export async function getAssetConditions(activeOnly = true) {
  let q = supabase.from('asset_conditions').select('*').order('sort_order').order('name')
  if (activeOnly) q = q.eq('is_active', true)
  const { data, error } = await q
  if (error) throw error
  return data || []
}

export async function getAssets(category = 'movable', { includeInactive = false } = {}) {
  let q = supabase
    .from('assets')
    .select(ASSET_SELECT)
    .eq('asset_category', category)
    .order('serial_no', { ascending: true })
  if (!includeInactive) q = q.eq('is_active', true)
  const { data, error } = await q
  if (error) throw error
  return data || []
}

export async function saveAsset(payload, id = null) {
  const row = {
    asset_category:   payload.asset_category || 'movable',
    location_id:      payload.location_id || null,
    item_type_id:     payload.item_type_id || null,
    description:      (payload.description || '').trim(),
    condition_id:     payload.condition_id || null,
    unit_price:       payload.unit_price != null && payload.unit_price !== '' ? Number(payload.unit_price) : null,
    purchase_value:   payload.purchase_value != null && payload.purchase_value !== '' ? Number(payload.purchase_value) : null,
    invoice_no:       payload.invoice_no?.trim() || null,
    invoice_date:     payload.invoice_date || null,
    supplier_name:    payload.supplier_name?.trim() || null,
    supplier_address: payload.supplier_address?.trim() || null,
    supplier_contact: payload.supplier_contact?.trim() || null,
    photo_url:        payload.photo_url || null,
    photo_path:       payload.photo_path || null,
    notes:            payload.notes?.trim() || null,
    updated_by:       payload.updated_by || null,
  }
  if (!row.description) throw new Error('Description is required.')

  if (id) {
    const { data, error } = await supabase.from('assets').update(row).eq('id', id).select(ASSET_SELECT).single()
    if (error) throw error
    return data
  }

  const { data, error } = await supabase
    .from('assets')
    .insert({ ...row, created_by: payload.created_by || null })
    .select(ASSET_SELECT)
    .single()
  if (error) throw error
  return data
}

export async function softDeleteAsset(id, updatedBy = null) {
  const { error } = await supabase
    .from('assets')
    .update({ is_active: false, updated_by: updatedBy, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

export async function restoreAsset(id, updatedBy = null) {
  const { error } = await supabase
    .from('assets')
    .update({ is_active: true, updated_by: updatedBy, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

export async function hardDeleteAsset(id) {
  const { data: asset } = await supabase.from('assets').select('photo_path').eq('id', id).maybeSingle()
  if (asset?.photo_path) {
    await supabase.storage.from('asset-photos').remove([asset.photo_path]).catch(() => {})
  }
  const { error } = await supabase.from('assets').delete().eq('id', id)
  if (error) throw error
}

export async function uploadAssetPhoto(file, assetId = null) {
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '')
  const id  = assetId || crypto.randomUUID()
  const path = `${id}/${Date.now()}.${ext}`
  const { error } = await supabase.storage.from('asset-photos').upload(path, file, {
    upsert: true,
    contentType: file.type || 'image/jpeg',
  })
  if (error) throw error
  const { data } = supabase.storage.from('asset-photos').getPublicUrl(path)
  return { path, url: data.publicUrl }
}

export async function removeAssetPhoto(photoPath) {
  if (!photoPath) return
  await supabase.storage.from('asset-photos').remove([photoPath])
}

/* ── Settings masters CRUD ─────────────────────────────────────── */

async function upsertMaster(table, { id, name, sort_order, is_active, color }) {
  const payload = {
    name: (name || '').trim(),
    sort_order: sort_order ?? 0,
    is_active: is_active ?? true,
  }
  if (!payload.name) throw new Error('Name is required.')
  if (table === 'asset_conditions' && color) payload.color = color

  if (id) {
    const { data, error } = await supabase.from(table).update(payload).eq('id', id).select().single()
    if (error) throw error
    return data
  }
  const { data, error } = await supabase.from(table).insert(payload).select().single()
  if (error) throw error
  return data
}

export const saveAssetLocation  = (row) => upsertMaster('asset_locations', row)
export const saveAssetItemType  = (row) => upsertMaster('asset_item_types', row)
export const saveAssetCondition = (row) => upsertMaster('asset_conditions', row)

export async function deactivateMaster(table, id) {
  const { error } = await supabase.from(table).update({ is_active: false }).eq('id', id)
  if (error) throw error
}

export async function reactivateMaster(table, id) {
  const { error } = await supabase.from(table).update({ is_active: true }).eq('id', id)
  if (error) throw error
}

export async function deleteMaster(table, id) {
  const { error } = await supabase.from(table).delete().eq('id', id)
  if (error) throw error
}
