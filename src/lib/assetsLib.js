/* ═══════════════════════════════════════════════════════════════
   assetsLib.js — Asset Management helpers
   ═══════════════════════════════════════════════════════════════ */

import { supabase } from './supabase'
import { logCmsAudit } from './cmsAudit'
import { captureDeletedRecord, quarantineStoragePaths } from './cmsRecycleBin'

const ASSET_SELECT = `
  *,
  location:asset_locations(id, name, parent_id),
  item_type:asset_item_types(id, name, parent_id),
  condition:asset_conditions(id, name, color)
`

export const ASSET_CATEGORIES = [
  { id: 'movable',  label: 'Movable Assets', enabled: true  },
  { id: 'building', label: 'Fixed Assets',   enabled: true  },
  { id: 'document', label: 'Documents',      enabled: false },
]

export const PHOTO_MAX_BYTES = 1024 * 1024 // 1 MB

/** Build nested tree with `.children` (Chart of Accounts style). */
export function buildMasterTree(rows = []) {
  const byId = {}
  rows.forEach(r => { byId[r.id] = { ...r, children: [] } })
  const roots = []
  rows.forEach(r => {
    const node = byId[r.id]
    if (r.parent_id && byId[r.parent_id]) {
      byId[r.parent_id].children.push(node)
    } else {
      roots.push(node)
    }
  })
  const sortRec = (nodes) => {
    nodes.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0) || a.name.localeCompare(b.name))
    nodes.forEach(n => sortRec(n.children || []))
  }
  sortRec(roots)
  return roots
}

/** Flat map of parent_id → direct children (unsorted helper). */
export function groupByParent(rows = []) {
  const byParent = {}
  rows.forEach(r => {
    const key = r.parent_id || '__root__'
    if (!byParent[key]) byParent[key] = []
    byParent[key].push(r)
  })
  Object.values(byParent).forEach(list =>
    list.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0) || a.name.localeCompare(b.name))
  )
  return byParent
}

/** Full breadcrumb path: "A › B › C". */
export function masterDisplayName(row, allRows = []) {
  if (!row) return '—'
  const byId = Object.fromEntries(allRows.map(r => [r.id, r]))
  const parts = [row.name]
  let cur = row
  const seen = new Set([row.id])
  while (cur.parent_id && byId[cur.parent_id] && !seen.has(cur.parent_id)) {
    cur = byId[cur.parent_id]
    seen.add(cur.id)
    parts.unshift(cur.name)
  }
  return parts.join(' › ')
}

/** Depth-first flatten of nested tree for <select> options. */
export function flattenMasterOptions(rows = []) {
  const tree = buildMasterTree(rows)
  const out = []
  function walk(nodes, depth) {
    nodes.forEach(n => {
      out.push({ ...n, depth })
      if (n.children?.length) walk(n.children, depth + 1)
    })
  }
  walk(tree, 0)
  return out
}

export function getAllMasterDescendants(nodeId, allRows = []) {
  const kids = allRows.filter(r => r.parent_id === nodeId)
  return kids.reduce((acc, k) => acc.concat(k, getAllMasterDescendants(k.id, allRows)), [])
}

export function isMasterDescendant(ancestorId, nodeId, allRows = []) {
  const byId = Object.fromEntries(allRows.map(r => [r.id, r]))
  let cur = byId[nodeId]
  while (cur?.parent_id) {
    if (cur.parent_id === ancestorId) return true
    cur = byId[cur.parent_id]
  }
  return false
}

/** Move a master row: dropPos = 'on' | 'before' | 'after' (COA-style). */
export async function moveMasterItem(table, dragNode, targetNode, dropPos, allRows) {
  if (!dragNode || !targetNode || dragNode.id === targetNode.id) return
  if (isMasterDescendant(dragNode.id, targetNode.id, allRows)) {
    throw new Error('Cannot move an item into its own sub-category')
  }

  if (dropPos === 'on') {
    const siblings = allRows
      .filter(r => r.parent_id === targetNode.id && r.id !== dragNode.id)
      .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
    const sort_order = siblings.length ? (siblings[siblings.length - 1].sort_order || 0) + 10 : 10
    const { error } = await supabase.from(table).update({
      parent_id: targetNode.id,
      sort_order,
    }).eq('id', dragNode.id)
    if (error) throw error
    return
  }

  const newParentId = targetNode.parent_id || null
  const siblings = allRows
    .filter(r => (r.parent_id || null) === newParentId && r.id !== dragNode.id)
    .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
  const idx = siblings.findIndex(a => a.id === targetNode.id)
  siblings.splice(dropPos === 'before' ? idx : idx + 1, 0, dragNode)

  for (let i = 0; i < siblings.length; i++) {
    const sort_order = i * 10
    if (siblings[i].id === dragNode.id) {
      const { error } = await supabase.from(table).update({
        parent_id: newParentId,
        sort_order,
      }).eq('id', dragNode.id)
      if (error) throw error
    } else {
      const { error } = await supabase.from(table).update({ sort_order }).eq('id', siblings[i].id)
      if (error) throw error
    }
  }
}

/** Reorder a flat master list (e.g. conditions) — before/after only, no nesting. */
export async function reorderFlatMaster(table, dragNode, targetNode, dropPos, allRows) {
  if (!dragNode || !targetNode || dragNode.id === targetNode.id) return
  const pos = dropPos === 'after' ? 'after' : 'before'

  const siblings = allRows
    .filter(r => r.id !== dragNode.id)
    .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0) || a.name.localeCompare(b.name))
  const idx = siblings.findIndex(a => a.id === targetNode.id)
  if (idx < 0) return
  siblings.splice(pos === 'before' ? idx : idx + 1, 0, dragNode)

  for (let i = 0; i < siblings.length; i++) {
    const sort_order = i * 10
    const { error } = await supabase.from(table).update({ sort_order }).eq('id', siblings[i].id)
    if (error) throw error
  }
}

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
  const stock_in_date = payload.stock_in_date || null
  assertStockDates(stock_in_date, payload.stock_out_date || null)

  const row = {
    asset_category:   payload.asset_category || 'movable',
    location_id:      payload.location_id || null,
    item_type_id:     payload.item_type_id || null,
    description:      (payload.description || '').trim(),
    condition_id:     payload.condition_id || null,
    stock_in_date,
    warranty_upto:    payload.warranty_upto || null,
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

  // Quantity: set on create only. Edits must use Stock Movement so the register stays reliable.
  if (!id) {
    const qty = payload.quantity != null && payload.quantity !== ''
      ? Math.max(1, parseInt(payload.quantity, 10) || 1)
      : 1
    row.quantity = qty
  }

  // Stock Out is set via Stock Movement only — Add/Edit must not clear it on update
  if ('stock_out_date' in payload) {
    const stock_out_date = payload.stock_out_date || null
    assertStockDates(stock_in_date, stock_out_date)
    row.stock_out_date = stock_out_date
  } else if (!id) {
    row.stock_out_date = null
  }

  if (!row.description) throw new Error('Description is required.')
  if (!row.stock_in_date) throw new Error('Stock In date is required.')

  if (id) {
    // Keep stock_in_date from drifting past an existing stock_out_date
    const { data: existing } = await supabase
      .from('assets')
      .select('stock_out_date, stock_in_date, quantity')
      .eq('id', id)
      .maybeSingle()
    if (existing?.stock_out_date) {
      assertStockDates(row.stock_in_date, existing.stock_out_date)
    }
    const { data, error } = await supabase.from('assets').update(row).eq('id', id).select(ASSET_SELECT).single()
    if (error) throw error
    await logCmsAudit({
      action: 'updated',
      module: 'assets',
      entityType: 'asset',
      entityId: id,
      entityLabel: row.description,
      summary: `Updated asset ${row.description}`,
      actor: row.updated_by ? { email: row.updated_by } : null,
    })
    return data
  }

  const { data, error } = await supabase
    .from('assets')
    .insert({ ...row, created_by: payload.created_by || null })
    .select(ASSET_SELECT)
    .single()
  if (error) throw error
  await logCmsAudit({
    action: 'created',
    module: 'assets',
    entityType: 'asset',
    entityId: data.id,
    entityLabel: row.description,
    summary: `Created asset ${row.description}`,
    actor: payload.created_by ? { email: payload.created_by } : null,
  })
  return data
}

/** YYYY-MM-DD compare — Stock Out cannot be before Stock In. */
export function assertStockDates(stockInDate, stockOutDate) {
  if (!stockInDate || !stockOutDate) return
  if (String(stockOutDate).slice(0, 10) < String(stockInDate).slice(0, 10)) {
    throw new Error('Stock Out date cannot be before Stock In date.')
  }
}

/** Exact-ish condition match (avoids /working/ matching "Not Working"). */
export function findConditionId(conditions, preferNames = []) {
  const list = conditions || []
  for (const want of preferNames) {
    const w = String(want).toLowerCase().replace(/\s+/g, ' ').trim()
    const hit = list.find(c => String(c.name || '').toLowerCase().replace(/\s+/g, ' ').trim() === w)
    if (hit) return hit.id
  }
  return null
}

/**
 * True if asset was on hand at end of asOnDate (YYYY-MM-DD).
 * With no asOnDate: on hand only when there is no stock_out_date.
 */
export function isAssetOnHand(asset, asOnDate) {
  const outDate = asset.stock_out_date ? String(asset.stock_out_date).slice(0, 10) : null
  const inDate = asset.stock_in_date ? String(asset.stock_in_date).slice(0, 10) : null

  if (!asOnDate) {
    return !outDate
  }

  const on = String(asOnDate).slice(0, 10)
  if (!inDate || inDate > on) return false
  if (outDate && outDate <= on) return false
  return true
}

/** Strip auto-generated stock-movement notes; keep only user-entered text. */
export function userFacingNotes(notes) {
  if (!notes) return ''
  let s = String(notes)
  s = s.replace(/Stock in \d+\s*\(added to #[^)]*\)/gi, '')
  s = s.replace(/Moved out \d+\s+from #\d+/gi, '')
  s = s.replace(/Returned to stock from #\d+/gi, '')
  return s
    .split(/\s*·\s*/)
    .map(p => p.trim())
    .filter(Boolean)
    .join(' · ')
}

async function insertAssetRow(row) {
  let { data, error } = await supabase.from('assets').insert(row).select(ASSET_SELECT).single()
  if (error && /source_asset_id/i.test(error.message || '')) {
    const { source_asset_id: _drop, ...rest } = row
    ;({ data, error } = await supabase.from('assets').insert(rest).select(ASSET_SELECT).single())
  }
  if (error) throw error
  return data
}

async function updateAssetRow(id, patch, extraFilters = (q) => q) {
  let q = supabase.from('assets').update(patch).eq('id', id)
  q = extraFilters(q)
  let { data, error } = await q.select(ASSET_SELECT).maybeSingle()
  if (error && /source_asset_id/i.test(error.message || '') && 'source_asset_id' in patch) {
    const { source_asset_id: _drop, ...rest } = patch
    let q2 = supabase.from('assets').update(rest).eq('id', id)
    q2 = extraFilters(q2)
    ;({ data, error } = await q2.select(ASSET_SELECT).maybeSingle())
  }
  if (error) throw error
  return data
}

function lineAvailableQty(asset) {
  const n = Number(asset?.quantity)
  if (!Number.isFinite(n) || n < 1) return 0
  return Math.floor(n)
}

function allocateCost(unitPrice, srcCost, available, moveQty) {
  const remainQty = available - moveQty
  const up = unitPrice != null && Number.isFinite(Number(unitPrice)) ? Number(unitPrice) : null
  const cost = srcCost != null && Number.isFinite(Number(srcCost)) ? Number(srcCost) : null

  let movedCost = null
  if (up != null) movedCost = Math.round(up * moveQty * 100) / 100
  else if (cost != null && available > 0) movedCost = Math.round((cost * moveQty / available) * 100) / 100

  let remainCost = null
  if (remainQty <= 0) remainCost = null
  else if (up != null) remainCost = Math.round(up * remainQty * 100) / 100
  else if (cost != null && movedCost != null) remainCost = Math.round((cost - movedCost) * 100) / 100
  else remainCost = cost

  return { movedCost, remainCost, remainQty, unitPrice: up }
}

/**
 * Stock Movement — move qty out of an in-stock line.
 * Partial: insert out line first, then shrink source (optimistic lock) so a failed
 * insert never leaves inventory reduced.
 * Full: set stock_out_date on the same line.
 */
export async function moveStockOut(sourceAsset, {
  quantity,
  stock_out_date,
  condition_id = null,
  notes = null,
  performed_by = null,
} = {}) {
  if (!sourceAsset?.id) throw new Error('Source asset is required.')
  if (sourceAsset.stock_out_date) throw new Error('This line is already moved out of stock.')

  const available = lineAvailableQty(sourceAsset)
  if (available < 1) throw new Error('No quantity available to move out.')

  const moveQty = Math.max(1, parseInt(quantity, 10) || 0)
  if (moveQty < 1) throw new Error('Move quantity must be at least 1.')
  if (moveQty > available) throw new Error(`Cannot move ${moveQty} — only ${available} in stock.`)

  const outDate = stock_out_date || new Date().toISOString().slice(0, 10)
  assertStockDates(sourceAsset.stock_in_date, outDate)

  const { movedCost, remainCost, remainQty, unitPrice } = allocateCost(
    sourceAsset.unit_price,
    sourceAsset.purchase_value,
    available,
    moveQty,
  )
  const noteText = (notes || '').trim() || null

  // Full move-out: update same row (optimistic: still in stock, same qty)
  if (moveQty === available) {
    const { data, error } = await supabase
      .from('assets')
      .update({
        stock_out_date: outDate,
        condition_id: condition_id || sourceAsset.condition_id || null,
        notes: [userFacingNotes(sourceAsset.notes), noteText].filter(Boolean).join(' · ') || null,
        updated_by: performed_by,
        updated_at: new Date().toISOString(),
      })
      .eq('id', sourceAsset.id)
      .is('stock_out_date', null)
      .eq('quantity', available)
      .select(ASSET_SELECT)
      .maybeSingle()
    if (error) throw error
    if (!data) throw new Error('Stock changed — refresh and try again.')
    await logCmsAudit({
      action: 'moved',
      module: 'assets',
      entityType: 'asset',
      entityId: data?.id,
      entityLabel: data?.description,
      summary: `Stock out (full): ${data?.description || data?.id}`,
      actor: performed_by ? { email: performed_by } : null,
    })
    return { source: data, moved: data, mode: 'full' }
  }

  // Partial: INSERT out line first, then shrink source (never lose qty on failed insert)
  const moved = await insertAssetRow({
    asset_category:   sourceAsset.asset_category || 'movable',
    location_id:      sourceAsset.location_id || null,
    item_type_id:     sourceAsset.item_type_id || null,
    description:      sourceAsset.description,
    condition_id:     condition_id || sourceAsset.condition_id || null,
    quantity:         moveQty,
    stock_in_date:    sourceAsset.stock_in_date,
    stock_out_date:   outDate,
    source_asset_id:  sourceAsset.id,
    warranty_upto:    sourceAsset.warranty_upto || null,
    unit_price:       unitPrice,
    purchase_value:   movedCost,
    invoice_no:       sourceAsset.invoice_no || null,
    invoice_date:     sourceAsset.invoice_date || null,
    supplier_name:    sourceAsset.supplier_name || null,
    supplier_address: sourceAsset.supplier_address || null,
    supplier_contact: sourceAsset.supplier_contact || null,
    photo_url:        sourceAsset.photo_url || null,
    photo_path:       sourceAsset.photo_path || null,
    notes:            noteText,
    created_by:       performed_by,
    updated_by:       performed_by,
  })

  let source
  try {
    source = await updateAssetRow(
      sourceAsset.id,
      {
        quantity: remainQty,
        purchase_value: remainCost,
        updated_by: performed_by,
        updated_at: new Date().toISOString(),
      },
      (q) => q.is('stock_out_date', null).eq('quantity', available),
    )
  } catch (err) {
    await supabase.from('assets').delete().eq('id', moved.id).catch(() => {})
    throw err
  }
  if (!source) {
    await supabase.from('assets').delete().eq('id', moved.id).catch(() => {})
    throw new Error('Stock changed — refresh and try again.')
  }

  await logCmsAudit({
    action: 'moved',
    module: 'assets',
    entityType: 'asset',
    entityId: moved?.id || source?.id,
    entityLabel: moved?.description || source?.description,
    summary: `Stock out: ${moved?.description || 'asset'} (qty moved)`,
    actor: performed_by ? { email: performed_by } : null,
  })
  return { source, moved, mode: 'split' }
}

/**
 * Stock Movement — bring additional qty into stock (new in-stock line).
 */
export async function moveStockIn(templateAsset, {
  quantity,
  stock_in_date,
  unit_price = null,
  purchase_value = null,
  condition_id = null,
  invoice_no = null,
  invoice_date = null,
  supplier_name = null,
  notes = null,
  performed_by = null,
} = {}) {
  if (!templateAsset?.id) throw new Error('Template asset is required.')

  const inQty = Math.max(1, parseInt(quantity, 10) || 0)
  if (inQty < 1) throw new Error('Quantity must be at least 1.')

  const inDate = stock_in_date || new Date().toISOString().slice(0, 10)
  const up = unit_price != null && unit_price !== ''
    ? Number(unit_price)
    : (templateAsset.unit_price != null ? Number(templateAsset.unit_price) : null)
  let cost = purchase_value != null && purchase_value !== '' ? Number(purchase_value) : null
  if (cost == null && up != null) cost = Math.round(up * inQty * 100) / 100

  const noteText = (notes || '').trim() || null

  const data = await insertAssetRow({
    asset_category:   templateAsset.asset_category || 'movable',
    location_id:      templateAsset.location_id || null,
    item_type_id:     templateAsset.item_type_id || null,
    description:      templateAsset.description,
    condition_id:     condition_id || templateAsset.condition_id || null,
    quantity:         inQty,
    stock_in_date:    inDate,
    stock_out_date:   null,
    source_asset_id:  null,
    warranty_upto:    templateAsset.warranty_upto || null,
    unit_price:       up,
    purchase_value:   cost,
    invoice_no:       invoice_no?.trim?.() || invoice_no || templateAsset.invoice_no || null,
    invoice_date:     invoice_date || null,
    supplier_name:    supplier_name?.trim?.() || supplier_name || templateAsset.supplier_name || null,
    supplier_address: templateAsset.supplier_address || null,
    supplier_contact: templateAsset.supplier_contact || null,
    photo_url:        templateAsset.photo_url || null,
    photo_path:       templateAsset.photo_path || null,
    notes:            noteText,
    created_by:       performed_by,
    updated_by:       performed_by,
  })
  await logCmsAudit({
    action: 'moved',
    module: 'assets',
    entityType: 'asset',
    entityId: data?.id,
    entityLabel: data?.description || templateAsset?.description,
    summary: `Stock in: ${data?.description || 'asset'}`,
    actor: performed_by ? { email: performed_by } : null,
  })
  return { source: templateAsset, moved: data, mode: 'in' }
}

/**
 * Reverse a Move Out — return the line to in-stock.
 * If it was split from a still-open source line, merge qty back into the source.
 */
export async function returnStockToHand(asset, { performed_by = null } = {}) {
  if (!asset?.id) throw new Error('Asset is required.')
  if (!asset.stock_out_date) throw new Error('This line is already in stock.')

  const qty = lineAvailableQty(asset) || Math.max(1, parseInt(asset.quantity, 10) || 1)
  const unitPrice = asset.unit_price != null ? Number(asset.unit_price) : null
  const lineCost = asset.purchase_value != null ? Number(asset.purchase_value) : null

  // Prefer merging back into the open source line
  if (asset.source_asset_id) {
    const { data: source } = await supabase
      .from('assets')
      .select('*')
      .eq('id', asset.source_asset_id)
      .eq('is_active', true)
      .maybeSingle()

    if (source && !source.stock_out_date) {
      const srcQty = lineAvailableQty(source)
      const newQty = srcQty + qty
      let newCost = null
      if (unitPrice != null) newCost = Math.round(unitPrice * newQty * 100) / 100
      else if (source.purchase_value != null || lineCost != null) {
        newCost = Math.round(((Number(source.purchase_value) || 0) + (lineCost || 0)) * 100) / 100
      }

      const { data: updated, error: upErr } = await supabase
        .from('assets')
        .update({
          quantity: newQty,
          purchase_value: newCost,
          updated_by: performed_by,
          updated_at: new Date().toISOString(),
        })
        .eq('id', source.id)
        .is('stock_out_date', null)
        .select(ASSET_SELECT)
        .maybeSingle()
      if (upErr) throw upErr
      if (!updated) throw new Error('Source line changed — refresh and try again.')

      // Soft-remove the out line so serial history remains but counts don't double
      const { error: delErr } = await supabase
        .from('assets')
        .update({
          is_active: false,
          notes: [userFacingNotes(asset.notes), `Returned to stock → #${source.serial_no}`].filter(Boolean).join(' · ') || null,
          updated_by: performed_by,
          updated_at: new Date().toISOString(),
        })
        .eq('id', asset.id)
      if (delErr) throw delErr

      await logCmsAudit({
        action: 'moved',
        module: 'assets',
        entityType: 'asset',
        entityId: updated?.id || asset?.id,
        entityLabel: updated?.description || asset?.description,
        summary: `Returned to stock (merged): ${asset?.description || asset?.id}`,
        actor: performed_by ? { email: performed_by } : null,
      })
      return { mode: 'merged', source: updated, moved: null }
    }
  }

  // Full move-out (same row) or orphaned split — reopen this line
  const data = await updateAssetRow(
    asset.id,
    {
      stock_out_date: null,
      source_asset_id: null,
      updated_by: performed_by,
      updated_at: new Date().toISOString(),
    },
    (q) => q.not('stock_out_date', 'is', null),
  )
  if (!data) throw new Error('Stock changed — refresh and try again.')
  await logCmsAudit({
    action: 'moved',
    module: 'assets',
    entityType: 'asset',
    entityId: asset?.id,
    entityLabel: asset?.description,
    summary: `Returned to stock: ${asset?.description || asset?.id}`,
    actor: performed_by ? { email: performed_by } : null,
  })
  return { mode: 'reopened', source: data, moved: data }
}

export async function softDeleteAsset(id, updatedBy = null) {
  const { error } = await supabase
    .from('assets')
    .update({ is_active: false, updated_by: updatedBy, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
  await logCmsAudit({
    action: 'deleted',
    module: 'assets',
    entityType: 'asset',
    entityId: id,
    summary: `Soft-deleted asset ${id}`,
    actor: updatedBy ? { email: updatedBy } : null,
  })
}

export async function restoreAsset(id, updatedBy = null) {
  const { error } = await supabase
    .from('assets')
    .update({ is_active: true, updated_by: updatedBy, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
  await logCmsAudit({
    action: 'restored',
    module: 'assets',
    entityType: 'asset',
    entityId: id,
    summary: `Restored asset ${id}`,
    actor: updatedBy ? { email: updatedBy } : null,
  })
}

export async function hardDeleteAsset(id) {
  const { data: asset } = await supabase.from('assets').select('*').eq('id', id).maybeSingle()
  const snap = await captureDeletedRecord({
    module: 'assets',
    tableName: 'assets',
    recordId: id,
    recordLabel: asset?.description || id,
    row: asset,
  })
  if (asset?.photo_path && snap?.id) {
    await quarantineStoragePaths({
      bucket: 'asset-photos',
      paths: [asset.photo_path],
      snapshotId: snap.id,
    }).catch((e) => console.warn('[quarantine] asset photo', e))
  }
  const { error } = await supabase.from('assets').delete().eq('id', id)
  if (error) throw error
  await logCmsAudit({
    action: 'deleted',
    module: 'assets',
    entityType: 'asset',
    entityId: id,
    entityLabel: asset?.description || id,
    summary: `Permanently deleted asset ${asset?.description || id}`,
  })
}

export async function uploadAssetPhoto(file, assetId = null) {
  if (file.size > PHOTO_MAX_BYTES) {
    throw new Error('Photo must be under 1 MB.')
  }
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

async function upsertMaster(table, { id, name, sort_order, is_active, color, parent_id }) {
  const payload = {
    name: (name || '').trim(),
    sort_order: sort_order ?? 0,
    is_active: is_active ?? true,
  }
  if (!payload.name) throw new Error('Name is required.')
  if (table === 'asset_conditions' && color) payload.color = color
  if (table === 'asset_locations' || table === 'asset_item_types') {
    payload.parent_id = parent_id || null
  }

  if (id) {
    const { data, error } = await supabase.from(table).update(payload).eq('id', id).select().single()
    if (error) throw error
    await logCmsAudit({
      action: 'updated',
      module: 'assets',
      entityType: table,
      entityId: id,
      entityLabel: payload.name,
      summary: `Updated ${table.replace(/_/g, ' ')} ${payload.name}`,
    })
    return data
  }
  const { data, error } = await supabase.from(table).insert(payload).select().single()
  if (error) throw error
  await logCmsAudit({
    action: 'created',
    module: 'assets',
    entityType: table,
    entityId: data.id,
    entityLabel: payload.name,
    summary: `Created ${table.replace(/_/g, ' ')} ${payload.name}`,
  })
  return data
}

export const saveAssetLocation  = (row) => upsertMaster('asset_locations', row)
export const saveAssetItemType  = (row) => upsertMaster('asset_item_types', row)
export const saveAssetCondition = (row) => upsertMaster('asset_conditions', row)

export async function deactivateMaster(table, id) {
  const { error } = await supabase.from(table).update({ is_active: false }).eq('id', id)
  if (error) throw error
  await logCmsAudit({ action: 'deactivated', module: 'assets', entityType: table, entityId: id, summary: `Deactivated ${table} ${id}` })
}

export async function reactivateMaster(table, id) {
  const { error } = await supabase.from(table).update({ is_active: true }).eq('id', id)
  if (error) throw error
  await logCmsAudit({ action: 'activated', module: 'assets', entityType: table, entityId: id, summary: `Reactivated ${table} ${id}` })
}

export async function deleteMaster(table, id) {
  const { error } = await supabase.from(table).delete().eq('id', id)
  if (error) throw error
  await logCmsAudit({ action: 'deleted', module: 'assets', entityType: table, entityId: id, summary: `Deleted ${table} ${id}` })
}
