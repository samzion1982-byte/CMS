/* ═══════════════════════════════════════════════════════════════
   zones.js — CRUD helpers for church_zones table
   ═══════════════════════════════════════════════════════════════ */

import { supabase } from './supabase'
import { logCmsAudit } from './cmsAudit'

export async function getZones() {
  const { data, error } = await supabase
    .from('church_zones')
    .select('id,zone_name,sort_order')
    .order('sort_order', { ascending: true })
    .order('zone_name',  { ascending: true })
  if (error) throw error
  return data || []
}

export async function addZone(zone_name, sort_order, created_by) {
  const { error } = await supabase
    .from('church_zones')
    .insert({ zone_name: zone_name.trim(), sort_order, created_by })
  if (error) throw error
  await logCmsAudit({
    action: 'created',
    module: 'members',
    entityType: 'church_zones',
    entityLabel: zone_name.trim(),
    summary: `Added zonal area “${zone_name.trim()}”`,
    actor: created_by ? { email: created_by } : null,
  })
}

export async function updateZone(id, zone_name, sort_order) {
  const newName = zone_name.trim()

  // Fetch current name so we can cascade to members if it changed
  const { data: current, error: fetchErr } = await supabase
    .from('church_zones')
    .select('zone_name')
    .eq('id', id)
    .single()
  if (fetchErr) throw fetchErr

  const { error } = await supabase
    .from('church_zones')
    .update({ zone_name: newName, sort_order })
    .eq('id', id)
  if (error) throw error

  // Cascade rename to every member carrying the old zone name
  if (current.zone_name !== newName) {
    const { error: memberErr } = await supabase
      .from('members')
      .update({ zonal_area: newName })
      .eq('zonal_area', current.zone_name)
    if (memberErr) throw memberErr
  }

  await logCmsAudit({
    action: 'updated',
    module: 'members',
    entityType: 'church_zones',
    entityId: id,
    entityLabel: newName,
    summary: current.zone_name !== newName
      ? `Renamed zonal area “${current.zone_name}” → “${newName}”`
      : `Updated zonal area “${newName}”`,
  })
}

export async function deleteZone(id) {
  const { data: current } = await supabase
    .from('church_zones')
    .select('zone_name')
    .eq('id', id)
    .maybeSingle()
  const { error } = await supabase.from('church_zones').delete().eq('id', id)
  if (error) throw error
  await logCmsAudit({
    action: 'deleted',
    module: 'members',
    entityType: 'church_zones',
    entityId: id,
    entityLabel: current?.zone_name || id,
    summary: `Deleted zonal area “${current?.zone_name || id}”`,
  })
}
