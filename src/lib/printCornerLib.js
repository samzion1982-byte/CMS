/* ═══════════════════════════════════════════════════════════════
   printCornerLib.js — Print Corner client helpers
   ═══════════════════════════════════════════════════════════════ */

import { supabase } from './supabase'

export const TEMPLATE_TYPES = {
  certificate: { label: 'Certificate', color: '#2563eb' },
  letter:      { label: 'Letter',      color: '#7c3aed' },
  form:        { label: 'Form',        color: '#16a34a' },
}

export function buildCategoryTree(rows) {
  const byId = new Map((rows || []).map(r => [r.id, { ...r, children: [] }]))
  const roots = []
  for (const node of byId.values()) {
    if (node.parent_id && byId.has(node.parent_id)) {
      byId.get(node.parent_id).children.push(node)
    } else {
      roots.push(node)
    }
  }
  const sortNodes = list => {
    list.sort((a, b) => (a.sort_order - b.sort_order) || a.name.localeCompare(b.name))
    for (const n of list) sortNodes(n.children)
  }
  sortNodes(roots)
  return roots
}

export async function getPrintCornerCatalog() {
  const [catRes, tplRes] = await Promise.all([
    supabase.from('print_corner_categories').select('*').eq('is_active', true)
      .order('sort_order').order('name'),
    supabase.from('print_corner_templates').select('*').eq('is_active', true)
      .order('sort_order').order('label'),
  ])
  if (catRes.error) throw catRes.error
  if (tplRes.error) throw tplRes.error

  const templatesByCategory = new Map()
  for (const t of tplRes.data || []) {
    if (!templatesByCategory.has(t.category_id)) templatesByCategory.set(t.category_id, [])
    templatesByCategory.get(t.category_id).push(t)
  }

  return {
    tree: buildCategoryTree(catRes.data || []),
    categories: catRes.data || [],
    templates: tplRes.data || [],
    templatesByCategory,
  }
}

export async function invokePrintCorner(body) {
  const { data, error } = await supabase.functions.invoke('cms-print-corner', { body })
  if (error) throw error
  if (data?.error) throw new Error(data.error)
  return data
}

export async function pingPrintCorner() {
  return invokePrintCorner({ action: 'ping' })
}

export async function convertTemplateFromStorage({
  storagePath,
  templateKey,
  templateType = 'letters',
  memberId = null,
  fieldValues = {},
  issue = true,
  source = 'manual',
}) {
  return invokePrintCorner({
    action: 'convert_storage',
    storage_path: storagePath,
    template_key: templateKey,
    template_type: templateType,
    member_id: memberId,
    field_values: fieldValues,
    issue,
    source,
  })
}

export async function getSharedDrafts(limit = 50) {
  const { data, error } = await supabase
    .from('print_corner_drafts')
    .select('*')
    .eq('status', 'draft')
    .order('updated_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return data || []
}

export async function saveDraft(payload) {
  const row = {
    ...payload,
    updated_at: new Date().toISOString(),
  }
  if (row.id) {
    const { data, error } = await supabase.from('print_corner_drafts').update(row).eq('id', row.id).select('*').single()
    if (error) throw error
    return data
  }
  const { data, error } = await supabase.from('print_corner_drafts').insert(row).select('*').single()
  if (error) throw error
  return data
}
