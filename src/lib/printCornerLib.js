/* ═══════════════════════════════════════════════════════════════
   printCornerLib.js — Print Corner client helpers
   ═══════════════════════════════════════════════════════════════ */

import JSZip from 'jszip'
import { supabase } from './supabase'
import { buildMasterTree, getAllMasterDescendants, moveMasterItem } from './assetsLib'

export { buildMasterTree as buildPrintCornerCategoryTree, getAllMasterDescendants }

const BUCKET = 'print-corner'

/** Friendly labels for common mail-merge keys (wizard + Settings). */
const VARIABLE_LABELS = {
  ref_no: 'Ref. No.',
  date: 'Date',
  addressee_line1: 'Addressee line 1',
  addressee_line2: 'Addressee line 2',
  addressee_line3: 'Addressee line 3',
  member_name: 'Member name',
  father_name: 'Father name',
  mother_name: 'Mother name',
  home_church: 'Home church',
  member_since: 'Member since',
  gender_type: 'Gender type (e.g. man / woman)',
  support_type: 'Support / ministry type',
  purpose: 'Purpose / aspiration',
  presbyter_name: 'Presbyter name',
  church_name: 'Church name',
  Church_name: 'Church name',
  member_id: 'Member ID',
  body: 'Letter body',
}

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
  if (error) {
    let detail = error.message || String(error)
    if (/failed to send a request to the edge function/i.test(detail)) {
      throw new Error(
        'cms-print-corner Edge Function is not deployed on this church Supabase project. Deploy it and set CLOUDCONVERT_API_KEY (see docs/PRINT_CORNER_CLOUDCONVERT_SETUP.md).'
      )
    }
    // Non-2xx responses (e.g. 500) — body often has { error: "..." }
    if (data?.error) detail = data.error
    else if (error?.context && typeof error.context.json === 'function') {
      try {
        const parsed = await error.context.json()
        if (parsed?.error) detail = parsed.error
      } catch { /* ignore */ }
    }
    throw new Error(detail)
  }
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

export async function deleteDraft(id) {
  const { error } = await supabase.from('print_corner_drafts').delete().eq('id', id)
  if (error) throw error
}

/* ── Settings: categories ─────────────────────────────────────── */

export async function getPrintCornerCategories(activeOnly = false) {
  let q = supabase.from('print_corner_categories').select('*').order('sort_order').order('name')
  if (activeOnly) q = q.eq('is_active', true)
  const { data, error } = await q
  if (error) throw error
  return data || []
}

export async function savePrintCornerCategory({ id, name, sort_order, is_active, parent_id }) {
  const payload = {
    name: (name || '').trim(),
    sort_order: sort_order ?? 0,
    is_active: is_active ?? true,
    parent_id: parent_id || null,
  }
  if (!payload.name) throw new Error('Name is required.')
  if (id) {
    const { data, error } = await supabase.from('print_corner_categories').update(payload).eq('id', id).select().single()
    if (error) throw error
    return data
  }
  const { data, error } = await supabase.from('print_corner_categories').insert(payload).select().single()
  if (error) throw error
  return data
}

export async function deactivatePrintCornerCategory(id) {
  const { error } = await supabase.from('print_corner_categories').update({ is_active: false }).eq('id', id)
  if (error) throw error
}

export async function deletePrintCornerCategory(id) {
  const { error } = await supabase.from('print_corner_categories').delete().eq('id', id)
  if (error) throw error
}

export async function movePrintCornerCategory(dragNode, targetNode, dropPos, allRows) {
  return moveMasterItem('print_corner_categories', dragNode, targetNode, dropPos, allRows)
}

/* ── Settings: templates ──────────────────────────────────────── */

export async function getPrintCornerTemplates(activeOnly = false) {
  let q = supabase.from('print_corner_templates').select('*').order('sort_order').order('label')
  if (activeOnly) q = q.eq('is_active', true)
  const { data, error } = await q
  if (error) throw error
  return data || []
}

export async function savePrintCornerTemplate(payload) {
  const row = {
    ...payload,
    updated_at: new Date().toISOString(),
  }
  if (row.id) {
    const { data, error } = await supabase.from('print_corner_templates').update(row).eq('id', row.id).select('*').single()
    if (error) throw error
    return data
  }
  if (!row.template_key?.trim()) throw new Error('Template key is required.')
  if (!row.label?.trim()) throw new Error('Label is required.')
  const { data, error } = await supabase.from('print_corner_templates').insert(row).select('*').single()
  if (error) throw error
  return data
}

/**
 * Read {placeholder} tags from a Word .docx (word/document.xml).
 * Strips XML so tags split across Word runs still match.
 */
export async function parseDocxPlaceholders(fileOrBlob) {
  const zip = await JSZip.loadAsync(fileOrBlob)
  const docXml = await zip.file('word/document.xml')?.async('string')
  if (!docXml) throw new Error('Invalid Word file (missing document.xml).')

  // Concatenate text; remove tags so "{mem" + "ber_name}" becomes "{member_name}"
  const plain = docXml
    .replace(/<w:tab\/>/g, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')

  const found = new Set()
  const re = /\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g
  let m
  while ((m = re.exec(plain)) !== null) {
    found.add(m[1])
  }
  return [...found]
}

export function labelForVariableKey(key) {
  if (VARIABLE_LABELS[key]) return VARIABLE_LABELS[key]
  return String(key || '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
}

export function variablesFromPlaceholderKeys(keys, existing = []) {
  const byKey = new Map(normalizeTemplateVariables(existing).map(v => [v.key, v]))
  return (keys || []).map(key => ({
    key,
    label: byKey.get(key)?.label || labelForVariableKey(key),
  }))
}

export async function uploadPrintCornerTemplateDocx(file, template, { updateVariables = true } = {}) {
  if (!file?.name?.toLowerCase().endsWith('.docx')) {
    throw new Error('Upload a Word .docx file.')
  }
  const folder = template.template_type === 'form' ? 'forms'
    : template.template_type === 'certificate' ? 'certificates' : 'letters'
  const storagePath = `templates/${folder}/${template.template_key}/source.docx`

  let keys = []
  try {
    keys = await parseDocxPlaceholders(file)
  } catch (e) {
    console.warn('[print-corner] placeholder scan failed', e)
  }

  const { error } = await supabase.storage.from(BUCKET).upload(storagePath, file, {
    upsert: true,
    contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  })
  if (error) throw error

  const patch = {
    id: template.id,
    storage_path: storagePath,
  }
  if (updateVariables && keys.length) {
    patch.variables = variablesFromPlaceholderKeys(keys, template.variables)
  }

  const saved = await savePrintCornerTemplate(patch)
  return { template: saved, placeholders: keys, variables: patch.variables || normalizeTemplateVariables(saved.variables) }
}

export function normalizeTemplateVariables(raw) {
  if (!raw) return []
  if (Array.isArray(raw)) return raw.filter(v => v && v.key)
  return []
}

export function defaultFieldValuesFromTemplate(template, church = null, member = null) {
  const vars = normalizeTemplateVariables(template?.variables)
  const out = {}
  for (const v of vars) {
    if (v.key) out[v.key] = ''
  }
  if (church) {
    const churchName = church.church_name || ''
    const presbyter = church.presbyter_name || church.pastor_name || ''
    // Fill both spellings if Word uses {Church_name} or {church_name}
    if ('church_name' in out) out.church_name = churchName
    if ('Church_name' in out) out.Church_name = churchName
    if ('presbyter_name' in out) out.presbyter_name = presbyter
    if ('diocese' in out) out.diocese = church.diocese || ''
    if ('address' in out) {
      out.address = [church.address, church.city, church.pincode].filter(Boolean).join(', ')
    }
    if ('secretary_name' in out) out.secretary_name = church.secretary_name || ''
    if ('treasurer_name' in out) out.treasurer_name = church.treasurer_name || ''
  }
  if (member) {
    if ('member_id' in out) out.member_id = member.member_id ?? ''
    if ('member_name' in out) out.member_name = member.member_name ?? ''
    if ('mobile' in out) out.mobile = member.mobile ?? ''
    if ('family_id' in out) out.family_id = member.family_id ?? ''
  }
  // Sensible date default when template asks for {date}
  if ('date' in out && !out.date) {
    const d = new Date()
    const dd = String(d.getDate()).padStart(2, '0')
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    out.date = `${dd}.${mm}.${d.getFullYear()}`
  }
  return out
}

export async function searchPrintCornerMembers(query, limit = 15) {
  const q = String(query || '').trim()
  if (q.length < 2) return []
  const { data, error } = await supabase
    .from('members')
    .select('member_id, member_name, mobile, family_id, zone')
    .or(`member_id.ilike.%${q}%,member_name.ilike.%${q}%,mobile.ilike.%${q}%`)
    .limit(limit)
  if (error) throw error
  return data || []
}

export async function getChurchForPrintCorner() {
  const { data, error } = await supabase
    .from('churches')
    .select('church_name, diocese, address, city, pincode, presbyter_name, pastor_name, secretary_name, treasurer_name')
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return data
}
