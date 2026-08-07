/* ═══════════════════════════════════════════════════════════════
   fixedAssetsLib.js — Fixed Assets document vault helpers
   ═══════════════════════════════════════════════════════════════ */

import { supabase } from './supabase'

/** Same master password used across sensitive CMS settings. */
export const FIXED_ASSETS_MASTER_PASSWORD = 'Master007))&'
export const FIXED_ASSETS_UNLOCK_KEY = 'fixed_assets_unlocked'

export const FIXED_ASSET_TYPES = [
  'Land',
  'Building',
  'Vehicle',
  'Plant & Machinery',
  'Other',
]

export const FIXED_ASSET_STATUSES = [
  'Active',
  'Under Renovation',
  'Disposed',
]

export const FIXED_DOC_MAX_BYTES = 10 * 1024 * 1024 // 10 MB
export const FIXED_COVER_MAX_BYTES = 1024 * 1024 // 1 MB

const BUCKET = 'fixed-asset-docs'

export function isFixedAssetsUnlocked() {
  try {
    return sessionStorage.getItem(FIXED_ASSETS_UNLOCK_KEY) === '1'
  } catch {
    return false
  }
}

export function unlockFixedAssets() {
  sessionStorage.setItem(FIXED_ASSETS_UNLOCK_KEY, '1')
}

export function lockFixedAssets() {
  sessionStorage.removeItem(FIXED_ASSETS_UNLOCK_KEY)
}

export async function getFixedAssets(includeInactive = false) {
  let q = supabase
    .from('fixed_assets')
    .select('*')
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true })
  if (!includeInactive) q = q.eq('is_active', true)
  const { data, error } = await q
  if (error) throw error
  return data || []
}

export async function saveFixedAsset(payload, id = null) {
  const row = {
    name: (payload.name || '').trim(),
    asset_type: payload.asset_type || 'Building',
    status: payload.status || 'Active',
    location_label: payload.location_label?.trim() || null,
    description: payload.description?.trim() || null,
    drive_url: payload.drive_url?.trim() || null,
    cover_url: payload.cover_url || null,
    cover_path: payload.cover_path || null,
    sort_order: payload.sort_order ?? 0,
    is_active: payload.is_active ?? true,
    updated_by: payload.updated_by || null,
    updated_at: new Date().toISOString(),
  }
  if (!row.name) throw new Error('Asset name is required.')

  if (id) {
    const { data, error } = await supabase
      .from('fixed_assets')
      .update(row)
      .eq('id', id)
      .select()
      .single()
    if (error) throw error
    return data
  }

  const { data, error } = await supabase
    .from('fixed_assets')
    .insert({ ...row, created_by: payload.created_by || null })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function softDeleteFixedAsset(id, updatedBy = null) {
  const { error } = await supabase
    .from('fixed_assets')
    .update({
      is_active: false,
      updated_by: updatedBy,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
  if (error) throw error
}

export async function getFixedAssetDocuments(fixedAssetId) {
  const { data, error } = await supabase
    .from('fixed_asset_documents')
    .select('*')
    .eq('fixed_asset_id', fixedAssetId)
    .eq('is_active', true)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: false })
  if (error) throw error
  return data || []
}

export async function countFixedAssetDocuments(fixedAssetIds = []) {
  if (!fixedAssetIds.length) return {}
  const { data, error } = await supabase
    .from('fixed_asset_documents')
    .select('fixed_asset_id')
    .in('fixed_asset_id', fixedAssetIds)
    .eq('is_active', true)
  if (error) throw error
  const counts = {}
  for (const row of data || []) {
    counts[row.fixed_asset_id] = (counts[row.fixed_asset_id] || 0) + 1
  }
  return counts
}

async function uploadToBucket(file, folder, maxBytes, label) {
  if (file.size > maxBytes) {
    throw new Error(`${label} must be under ${Math.round(maxBytes / (1024 * 1024))} MB.`)
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

export async function uploadFixedAssetCover(file, assetId) {
  return uploadToBucket(file, `covers/${assetId || 'temp'}`, FIXED_COVER_MAX_BYTES, 'Cover photo')
}

export async function removeFixedAssetFile(filePath) {
  if (!filePath) return
  await supabase.storage.from(BUCKET).remove([filePath]).catch(() => {})
}

export async function saveFixedAssetDocument({
  fixed_asset_id,
  title,
  doc_type = null,
  doc_date = null,
  notes = null,
  file,
  created_by = null,
}) {
  if (!fixed_asset_id) throw new Error('Fixed asset is required.')
  if (!file) throw new Error('Choose a file to upload.')
  const name = (title || file.name || 'Document').trim()
  if (!name) throw new Error('Document title is required.')

  const uploaded = await uploadToBucket(
    file,
    `docs/${fixed_asset_id}`,
    FIXED_DOC_MAX_BYTES,
    'Document',
  )

  const { data, error } = await supabase
    .from('fixed_asset_documents')
    .insert({
      fixed_asset_id,
      title: name,
      doc_type: doc_type?.trim() || null,
      doc_date: doc_date || null,
      file_name: file.name,
      file_path: uploaded.path,
      file_url: uploaded.url,
      mime_type: file.type || null,
      file_size: file.size,
      notes: notes?.trim() || null,
      created_by,
      updated_by: created_by,
    })
    .select()
    .single()
  if (error) {
    await removeFixedAssetFile(uploaded.path)
    throw error
  }
  return data
}

export async function softDeleteFixedAssetDocument(id, updatedBy = null) {
  const { data: doc } = await supabase
    .from('fixed_asset_documents')
    .select('file_path')
    .eq('id', id)
    .maybeSingle()

  const { error } = await supabase
    .from('fixed_asset_documents')
    .update({
      is_active: false,
      updated_by: updatedBy,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
  if (error) throw error

  // Keep storage file for now (soft delete); optional hard remove:
  // if (doc?.file_path) await removeFixedAssetFile(doc.file_path)
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
