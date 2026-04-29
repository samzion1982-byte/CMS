/* ═══════════════════════════════════════════════════════════════
   zones.js — CRUD helpers for church_zones table
   ═══════════════════════════════════════════════════════════════ */

import { supabase } from './supabase'

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
}

export async function updateZone(id, zone_name, sort_order) {
  const { error } = await supabase
    .from('church_zones')
    .update({ zone_name: zone_name.trim(), sort_order })
    .eq('id', id)
  if (error) throw error
}

export async function deleteZone(id) {
  const { error } = await supabase.from('church_zones').delete().eq('id', id)
  if (error) throw error
}
