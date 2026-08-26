/* ═══════════════════════════════════════════════════════════════
   printCornerLib.js — Print Corner client helpers
   ═══════════════════════════════════════════════════════════════ */

import JSZip from 'jszip'
import { PDFDocument } from 'pdf-lib'
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
  presbyter_sign: 'Presbyter signature (auto)',
  secretary_sign: 'Secretary signature (auto)',
  seceratary_sign: 'Secretary signature (auto)',
  seceratry_sign: 'Secretary signature (auto)',
  treasurer_sign: 'Treasurer signature (auto)',
  treasurer_seal: 'Treasurer seal (auto)',
  member_photo: 'Member photo (auto from Member ID)',
}

/** Word tags that inject images — not typed in the wizard */
export const IMAGE_PLACEHOLDER_KEYS = new Set([
  'presbyter_sign',
  'secretary_sign',
  'seceratary_sign',
  'seceratry_sign',
  'treasurer_sign',
  'treasurer_seal',
  'member_photo',
])

export function isImagePlaceholderKey(key) {
  return IMAGE_PLACEHOLDER_KEYS.has(String(key || '').trim())
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
        'cms-print-corner Edge Function is not deployed on this church Supabase project. Deploy it and connect Google on Backup (see docs/PRINT_CORNER_GOOGLE_DRIVE_PDF.md).'
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
  forcePreview = false,
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
    force_preview: forcePreview,
  })
}

/** Stable preview.pdf path next to source.docx / source.pptx */
export function templatePreviewStoragePath(storagePath) {
  const p = String(storagePath || '')
  const next = p.replace(/source\.(docx|pptx)$/i, 'preview.pdf')
  return next !== p ? next : null
}

const previewMemoryCache = new Map() // key → { signed_url, expires }

function previewCacheKey(storagePath) {
  return String(storagePath || '')
}

/** Try local session cache + storage preview.pdf (no Google convert). */
export async function getCachedTemplatePreviewUrl(storagePath) {
  const previewPath = templatePreviewStoragePath(storagePath)
  if (!previewPath) return null

  const memKey = previewCacheKey(storagePath)
  const hit = previewMemoryCache.get(memKey)
  if (hit && hit.expires > Date.now() && hit.signed_url) {
    return { signed_url: hit.signed_url, storage_path: previewPath, cached: true, engine: 'memory' }
  }

  const folder = previewPath.replace(/\/[^/]+$/, '')
  const { data: listing, error } = await supabase.storage.from(BUCKET).list(folder, { limit: 30 })
  if (error) return null
  const hasPreview = (listing || []).some(f => f.name === 'preview.pdf')
  if (!hasPreview) return null

  const { data, error: urlErr } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(previewPath, 3600 * 6)
  if (urlErr || !data?.signedUrl) return null

  previewMemoryCache.set(memKey, {
    signed_url: data.signedUrl,
    expires: Date.now() + 1000 * 60 * 60 * 5,
  })
  return { signed_url: data.signedUrl, storage_path: previewPath, cached: true, engine: 'storage' }
}

function rememberPreviewUrl(storagePath, signedUrl) {
  if (!storagePath || !signedUrl) return
  previewMemoryCache.set(previewCacheKey(storagePath), {
    signed_url: signedUrl,
    expires: Date.now() + 1000 * 60 * 60 * 5,
  })
}

export function invalidateTemplatePreviewCache(storagePath) {
  if (storagePath) previewMemoryCache.delete(previewCacheKey(storagePath))
}

/**
 * Letter/certificate PDF preview.
 * Uses cached preview.pdf when available (fast); otherwise converts via Google once and stores it.
 */
export async function previewPrintCornerTemplate(template, church = null, { force = false } = {}) {
  if (!template?.storage_path) throw new Error('Upload a template file first.')

  if (!force) {
    const cached = await getCachedTemplatePreviewUrl(template.storage_path)
    if (cached?.signed_url) return cached
  } else {
    invalidateTemplatePreviewCache(template.storage_path)
  }

  const sampleMember = {
    member_id: 'M001',
    member_name: 'Sample Member',
    mobile: '9000000000',
    family_id: 'F001',
    father_name: 'Sample Father',
    title: 'Mr.',
  }
  const fieldValues = defaultFieldValuesFromTemplate(template, church, sampleMember)
  for (const key of Object.keys(fieldValues)) {
    if (!String(fieldValues[key] || '').trim()) fieldValues[key] = `[${key}]`
  }
  const templateType = template.template_type === 'certificate' ? 'certificates'
    : template.template_type === 'form' ? 'forms'
      : 'letters'
  const res = await convertTemplateFromStorage({
    storagePath: template.storage_path,
    templateKey: template.template_key,
    templateType,
    fieldValues,
    issue: false,
    source: 'blank',
    forcePreview: force,
  })
  if (res?.signed_url) rememberPreviewUrl(template.storage_path, res.signed_url)
  return res
}

/** Fire-and-forget: rebuild preview.pdf after a template upload. */
export function warmTemplatePreview(template, church = null) {
  if (!template?.storage_path) return
  invalidateTemplatePreviewCache(template.storage_path)
  previewPrintCornerTemplate(template, church, { force: true }).catch(() => {})
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
  if (!row.category_id) throw new Error('Category is required.')
  const { data, error } = await supabase.from('print_corner_templates').insert(row).select('*').single()
  if (error) throw error
  return data
}

/** Hard-delete template row; best-effort remove storage .docx */
export async function deletePrintCornerTemplate(id, storagePath = null) {
  if (storagePath) {
    try {
      await supabase.storage.from(BUCKET).remove([storagePath])
    } catch { /* ignore storage cleanup errors */ }
  }
  const { error } = await supabase.from('print_corner_templates').delete().eq('id', id)
  if (error) throw error
}

/** Count templates still attached to a category (for delete confirm) */
export async function countTemplatesInCategory(categoryId) {
  const { count, error } = await supabase
    .from('print_corner_templates')
    .select('id', { count: 'exact', head: true })
    .eq('category_id', categoryId)
  if (error) throw error
  return count || 0
}

/**
 * Read {placeholder} tags from Word .docx or PowerPoint .pptx.
 * - Text tags in document/slides XML
 * - Image Alt Text (descr) e.g. {presbyter_sign}
 */
export async function parseOfficePlaceholders(fileOrBlob) {
  const zip = await JSZip.loadAsync(fileOrBlob)
  const xmlNames = Object.keys(zip.files).filter(n =>
    (
      /^word\/(document|header\d*|footer\d*)\.xml$/i.test(n)
      || /^ppt\/slides\/slide\d+\.xml$/i.test(n)
    ) && !zip.files[n].dir
  )
  if (!xmlNames.length) throw new Error('Invalid Office file (no document/slides XML).')

  const found = new Set()
  const textRe = /\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g
  const attrRe = /\b(?:descr|title|name)\s*=\s*"([^"]*)"/gi

  for (const name of xmlNames) {
    const docXml = await zip.file(name).async('string')

    for (const dm of docXml.matchAll(attrRe)) {
      const val = String(dm[1] || '').trim()
      let m
      const braced = /\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g
      while ((m = braced.exec(val)) !== null) found.add(m[1])
      const bare = val.replace(/^\{+/, '').replace(/\}+$/, '').trim()
      if (isImagePlaceholderKey(bare)) found.add(bare)
      const normalized = bare.toLowerCase().replace(/\s+/g, '_')
      if (normalized === 'member_photo') found.add('member_photo')
    }

    const plain = docXml
      .replace(/<a:t>/g, '')
      .replace(/<\/a:t>/g, '')
      .replace(/<w:tab\/>/g, ' ')
      .replace(/<[^>]+>/g, '')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      .replace(/\s+/g, ' ')

    let m
    textRe.lastIndex = 0
    while ((m = textRe.exec(plain)) !== null) {
      found.add(m[1])
    }
  }

  return [...found]
}

/** @deprecated use parseOfficePlaceholders */
export async function parseDocxPlaceholders(fileOrBlob) {
  return parseOfficePlaceholders(fileOrBlob)
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
  const name = (file?.name || '').toLowerCase()
  const isPptx = name.endsWith('.pptx')
  const isDocx = name.endsWith('.docx')
  if (!isPptx && !isDocx) {
    throw new Error('Upload a Word .docx or PowerPoint .pptx file.')
  }

  const folder = template.template_type === 'form' ? 'forms'
    : template.template_type === 'certificate' ? 'certificates' : 'letters'
  const ext = isPptx ? 'pptx' : 'docx'
  const storagePath = `templates/${folder}/${template.template_key}/source.${ext}`
  const contentType = isPptx
    ? 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
    : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

  let keys = []
  try {
    keys = await parseOfficePlaceholders(file)
  } catch (e) {
    console.warn('[print-corner] placeholder scan failed', e)
  }

  // Remove old alternate extension if switching formats
  const otherPath = `templates/${folder}/${template.template_key}/source.${isPptx ? 'docx' : 'pptx'}`
  try {
    await supabase.storage.from(BUCKET).remove([otherPath])
  } catch { /* ignore */ }

  const { error } = await supabase.storage.from(BUCKET).upload(storagePath, file, {
    upsert: true,
    contentType,
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
  if (!Array.isArray(raw)) return []
  return raw
    .filter(v => v && v.key)
    .map(v => ({
      ...v,
      key: String(v.key).trim(),
      label: v.label || VARIABLE_LABELS[v.key] || v.key,
      kind: isImagePlaceholderKey(v.key) ? 'image' : (v.kind || 'text'),
    }))
}

export function textFieldVariables(variables) {
  return normalizeTemplateVariables(variables).filter(v => !isImagePlaceholderKey(v.key))
}

export function imageFieldVariables(variables) {
  return normalizeTemplateVariables(variables).filter(v => isImagePlaceholderKey(v.key))
}

export function templateHasMemberPhoto(variables) {
  return normalizeTemplateVariables(variables).some(v => v.key === 'member_photo')
}

/** Text fields shown in wizard + tracker; injects member_id when template uses {member_photo}. */
export function wizardTextVariables(variables) {
  const text = textFieldVariables(variables)
  if (!templateHasMemberPhoto(variables)) return text
  if (text.some(v => v.key === 'member_id' || v.key === 'Member_id')) return text
  return [
    { key: 'member_id', label: VARIABLE_LABELS.member_id || 'Member ID', kind: 'text' },
    ...text,
  ]
}

function formatPrintCornerDate(value) {
  if (!value) return ''
  const s = String(value).trim()
  if (/^\d{2}\.\d{2}\.\d{4}$/.test(s)) return s
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (m) return `${m[3]}.${m[2]}.${m[1]}`
  const d = new Date(s)
  if (Number.isNaN(d.getTime())) return s
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  return `${dd}.${mm}.${d.getFullYear()}`
}

function memberAddressLine(member) {
  if (!member) return ''
  return [
    member.address_street,
    member.area_1,
    member.area_2,
    member.city,
    member.state,
  ].filter(Boolean).join(', ')
}

/** Map member row → template placeholder keys. */
export function applyMemberToFieldValues(out, member) {
  if (!out || !member) return out || {}
  const address = memberAddressLine(member)
  const pairs = [
    ['member_id', member.member_id],
    ['Member_id', member.member_id],
    ['family_id', member.family_id],
    ['member_name', member.member_name],
    ['Member_name', member.member_name],
    ['name', member.member_name],
    ['Name', member.member_name],
    ['title', member.title],
    ['father_name', member.father_name],
    ['Father_name', member.father_name],
    ['spouse_name', member.spouse_name],
    ['gender', member.gender],
    ['aadhaar', member.aadhaar],
    ['mobile', member.mobile],
    ['whatsapp', member.whatsapp || member.mobile],
    ['email', member.email],
    ['dob', formatPrintCornerDate(member.dob_actual || member.dob_certificate)],
    ['dob_actual', formatPrintCornerDate(member.dob_actual)],
    ['dob_certificate', formatPrintCornerDate(member.dob_certificate)],
    ['date_of_marriage', formatPrintCornerDate(member.date_of_marriage)],
    ['marital_status', member.marital_status],
    ['baptism_date', formatPrintCornerDate(member.baptism_date)],
    ['confirmation_date', formatPrintCornerDate(member.confirmation_date)],
    ['qualification', member.qualification],
    ['profession', member.profession],
    ['zonal_area', member.zonal_area],
    ['zone', member.zonal_area],
    ['city', member.city],
    ['state', member.state],
    ['address_street', member.address_street],
    ['member_address', address],
    ['residential_address', address],
  ]
  const next = { ...out }
  for (const [key, val] of pairs) {
    if (val != null && String(val).trim() !== '') {
      next[key] = String(val)
    }
  }
  if (member.member_id) {
    next.member_id = String(member.member_id)
    next.Member_id = String(member.member_id)
  }
  if (member.member_name) {
    next.member_name = String(member.member_name)
    next.Member_name = String(member.member_name)
  }
  return next
}

export function defaultFieldValuesFromTemplate(template, church = null, member = null) {
  const out = {}
  for (const v of wizardTextVariables(template?.variables)) {
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
  if (member) applyMemberToFieldValues(out, member)
  // Sensible date default when template asks for {date}
  if ('date' in out && !out.date) {
    out.date = formatPrintCornerDate(new Date().toISOString().slice(0, 10))
  }
  return out
}

const MEMBER_SEARCH_SELECT = [
  'member_id', 'member_name', 'title', 'father_name', 'spouse_name', 'gender', 'aadhaar',
  'family_id', 'mobile', 'whatsapp', 'email',
  'dob_actual', 'dob_certificate', 'marital_status', 'date_of_marriage',
  'baptism_date', 'confirmation_date', 'qualification', 'profession',
  'address_street', 'area_1', 'area_2', 'city', 'state', 'zonal_area',
].join(', ')

export async function searchPrintCornerMembers(query, limit = 15) {
  const q = String(query || '').trim()
  if (q.length < 2) return []
  const { data, error } = await supabase
    .from('members')
    .select(MEMBER_SEARCH_SELECT)
    .or(`member_id.ilike.%${q}%,member_name.ilike.%${q}%,mobile.ilike.%${q}%`)
    .eq('is_active', true)
    .limit(limit)
  if (error) throw error
  return data || []
}

export async function getPrintCornerMemberById(memberId) {
  const id = String(memberId || '').trim()
  if (!id) return null
  const { data, error } = await supabase
    .from('members')
    .select(MEMBER_SEARCH_SELECT)
    .ilike('member_id', id)
    .maybeSingle()
  if (error) throw error
  return data
}

/** True if member-photos/active/{id}.{jpg|png|…} exists (same path Members page uses). */
export async function memberPhotoExistsInStorage(memberId) {
  const id = String(memberId || '').trim()
  if (!id) return false
  for (const ext of ['jpg', 'jpeg', 'png', 'webp']) {
    const path = `active/${id}.${ext}`
    const { error } = await supabase.storage.from('member-photos').download(path)
    if (!error) return true
  }
  return false
}

export async function getChurchForPrintCorner() {
  const { data, error } = await supabase
    .from('churches')
    .select(
      'church_name, diocese, address, city, pincode, presbyter_name, pastor_name, secretary_name, treasurer_name, '
      + 'presbyter_signature_url, secretary_signature_url, treasurer_signature_url, '
      + 'whatsapp_api_type, whatsapp_receipt_mode',
    )
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return data
}

/** Status of office-bearer signature PNGs from Church Setup */
export function getOfficeBearerSignatureStatus(church) {
  if (!church) {
    return [
      { role: 'Presbyter', ready: false },
      { role: 'Secretary', ready: false },
      { role: 'Treasurer', ready: false },
    ]
  }
  return [
    { role: 'Presbyter', ready: !!church.presbyter_signature_url, url: church.presbyter_signature_url },
    { role: 'Secretary', ready: !!church.secretary_signature_url, url: church.secretary_signature_url },
    { role: 'Treasurer', ready: !!church.treasurer_signature_url, url: church.treasurer_signature_url },
  ]
}

/* ── Bulk letter tracker (Excel) ───────────────────────────────── */

const TRACKER_SNO = 'S.No'

export function trackerColumnKeys(variables) {
  return wizardTextVariables(variables).map(v => v.key).filter(Boolean)
}

/** Build header row: S.No + variable keys */
export function trackerHeaders(variables) {
  return [TRACKER_SNO, ...trackerColumnKeys(variables)]
}

/** Download .xlsx tracker — row 1 headers, row 2 pre-filled from current wizard values, + blank rows */
export async function downloadPrintCornerTracker({ templateKey, variables, fieldValues, blankRows = 49 }) {
  const ExcelJS = (await import('exceljs')).default
  const keys = trackerColumnKeys(variables)
  if (!keys.length) throw new Error('No variables on this template.')

  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Tracker', { views: [{ state: 'frozen', ySplit: 1 }] })
  const headers = trackerHeaders(variables)

  ws.addRow(headers)
  const headerRow = ws.getRow(1)
  headerRow.font = { bold: true }
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } }

  const firstRow = [1, ...keys.map(k => fieldValues?.[k] ?? '')]
  ws.addRow(firstRow)

  for (let i = 2; i <= blankRows + 1; i++) {
    ws.addRow([i, ...keys.map(() => '')])
  }

  ws.columns = headers.map((h, i) => ({
    width: i === 0 ? 8 : Math.max(14, String(h).length + 4),
  }))

  const buffer = await wb.xlsx.writeBuffer()
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${templateKey || 'letter'}_tracker.xlsx`
  a.click()
  URL.revokeObjectURL(url)
}

/** Parse uploaded tracker .xlsx → array of field value objects (skips empty rows) */
export async function parsePrintCornerTrackerFile(file, variables) {
  const keys = trackerColumnKeys(variables)
  if (!keys.length) throw new Error('No variables on this template.')

  const ExcelJS = (await import('exceljs')).default
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(await file.arrayBuffer())
  const ws = wb.worksheets[0]
  if (!ws) throw new Error('Empty spreadsheet.')

  const headerRow = ws.getRow(1)
  const colCount = headerRow.cellCount
  const headerMap = new Map()
  for (let c = 1; c <= colCount; c++) {
    const h = String(headerRow.getCell(c).value ?? '').trim()
    if (h && h !== TRACKER_SNO) headerMap.set(h, c)
  }

  const missing = keys.filter(k => !headerMap.has(k))
  if (missing.length) {
    throw new Error(`Tracker missing columns: ${missing.join(', ')}. Download a fresh tracker and try again.`)
  }

  const rows = []
  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r)
    const fieldValues = {}
    let hasData = false
    for (const key of keys) {
      const col = headerMap.get(key)
      const val = col ? String(row.getCell(col).value ?? '').trim() : ''
      fieldValues[key] = val
      if (val) hasData = true
    }
    if (hasData) rows.push(fieldValues)
  }

  if (!rows.length) throw new Error('No data rows found in tracker.')
  return rows
}

function safePdfName(index, fieldValues, templateKey) {
  const base = fieldValues.member_name || fieldValues.ref_no || `row_${index + 1}`
  const safe = String(base).replace(/[^\w.-]+/g, '_').slice(0, 60)
  return `${String(index + 1).padStart(3, '0')}_${safe}.pdf`
}

/** Generate one PDF per tracker row.
 * output: 'single' = one multi-page PDF | 'zip' = separate PDFs in a ZIP archive
 * (ZIP is used instead of RAR — browsers cannot create RAR files.)
 */
export async function convertBulkLettersToPdf({
  storagePath,
  templateKey,
  templateType = 'letters',
  rows,
  onProgress,
  output = 'single',
}) {
  const results = []
  const pdfParts = []

  for (let i = 0; i < rows.length; i++) {
    const fieldValues = rows[i]
    onProgress?.({ current: i + 1, total: rows.length, label: fieldValues.member_name || `Row ${i + 1}` })

    const res = await convertTemplateFromStorage({
      storagePath,
      templateKey,
      templateType,
      memberId: fieldValues.member_id || null,
      fieldValues,
      issue: true,
      source: 'manual',
    })

    if (!res?.signed_url) throw new Error(`Row ${i + 1}: no PDF URL returned`)

    const pdfRes = await fetch(res.signed_url)
    if (!pdfRes.ok) throw new Error(`Row ${i + 1}: could not download PDF`)
    const pdfBytes = await pdfRes.arrayBuffer()
    pdfParts.push({ bytes: pdfBytes, fieldValues, name: safePdfName(i, fieldValues, templateKey) })
    results.push({ ...res, fieldValues })
  }

  const stamp = new Date().toISOString().slice(0, 10)

  if (output === 'zip') {
    const zip = new JSZip()
    for (const part of pdfParts) {
      zip.file(part.name, part.bytes)
    }
    const outBytes = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' })
    const fileName = `${templateKey}_bulk_${stamp}.zip`
    const blob = new Blob([outBytes], { type: 'application/zip' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = fileName
    a.click()
    URL.revokeObjectURL(url)
    return { count: rows.length, fileName, pageCount: rows.length, results, output: 'zip' }
  }

  const merged = await PDFDocument.create()
  for (const part of pdfParts) {
    const src = await PDFDocument.load(part.bytes)
    const pages = await merged.copyPages(src, src.getPageIndices())
    for (const page of pages) merged.addPage(page)
  }

  const outBytes = await merged.save()
  const fileName = `${templateKey}_bulk_${stamp}.pdf`
  const blob = new Blob([outBytes], { type: 'application/pdf' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  a.click()
  URL.revokeObjectURL(url)

  return { count: rows.length, fileName, pageCount: merged.getPageCount(), results, output: 'single' }
}

/** @deprecated alias */
export async function convertBulkLettersToZip(opts) {
  return convertBulkLettersToPdf({ ...opts, output: 'zip' })
}

/* ── Blank application forms (PDF / JPEG repository) ─────────── */

const APP_FORM_SELECT = '*'
const APP_FORM_MAX_BYTES = 20 * 1024 * 1024
const APP_FORM_MIME = new Set([
  'application/pdf',
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
])

function slugifyFormKey(label) {
  return String(label || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || `form-${Date.now()}`
}

function detectAppFormMime(file) {
  const type = String(file?.type || '').toLowerCase()
  if (APP_FORM_MIME.has(type)) return type === 'image/jpg' ? 'image/jpeg' : type
  const name = String(file?.name || '').toLowerCase()
  if (name.endsWith('.pdf')) return 'application/pdf'
  if (name.endsWith('.jpg') || name.endsWith('.jpeg')) return 'image/jpeg'
  if (name.endsWith('.png')) return 'image/png'
  if (name.endsWith('.webp')) return 'image/webp'
  return ''
}

export async function getPrintCornerApplicationForms(activeOnly = true) {
  let q = supabase
    .from('print_corner_application_forms')
    .select(APP_FORM_SELECT)
    .order('sort_order')
    .order('label')
  if (activeOnly) q = q.eq('is_active', true)
  const { data, error } = await q
  if (error) throw error
  return data || []
}

export async function savePrintCornerApplicationForm({
  id, form_key, label, description, sort_order, is_active,
  storage_path, file_name, mime_type, file_size,
}) {
  const payload = {
    label: String(label || '').trim(),
    description: description != null ? String(description).trim() || null : undefined,
    sort_order: sort_order ?? 0,
    is_active: is_active ?? true,
  }
  if (!payload.label) throw new Error('Form label is required.')
  if (form_key != null) payload.form_key = String(form_key).trim() || slugifyFormKey(payload.label)
  if (storage_path !== undefined) payload.storage_path = storage_path
  if (file_name !== undefined) payload.file_name = file_name
  if (mime_type !== undefined) payload.mime_type = mime_type
  if (file_size !== undefined) payload.file_size = file_size
  payload.updated_at = new Date().toISOString()

  if (id) {
    const { data, error } = await supabase
      .from('print_corner_application_forms')
      .update(payload)
      .eq('id', id)
      .select()
      .single()
    if (error) throw error
    return data
  }

  if (!payload.form_key) payload.form_key = slugifyFormKey(payload.label)
  const { data, error } = await supabase
    .from('print_corner_application_forms')
    .insert(payload)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deletePrintCornerApplicationForm(id, storagePath = null) {
  if (storagePath) {
    try {
      await supabase.storage.from(BUCKET).remove([storagePath])
    } catch { /* ignore */ }
  }
  const { error } = await supabase.from('print_corner_application_forms').delete().eq('id', id)
  if (error) throw error
}

export async function uploadPrintCornerApplicationFormFile(file, formRow) {
  if (!file) throw new Error('Choose a PDF or JPEG file.')
  if (!formRow?.id || !formRow?.form_key) throw new Error('Save the form label first, then upload.')
  if (file.size > APP_FORM_MAX_BYTES) {
    throw new Error('File is too large (max 20 MB).')
  }
  const mime = detectAppFormMime(file)
  if (!mime) throw new Error('Upload a PDF or JPEG/PNG image of the blank form.')

  const ext = mime === 'application/pdf' ? 'pdf'
    : mime === 'image/png' ? 'png'
      : mime === 'image/webp' ? 'webp'
        : 'jpg'
  const storagePath = `application-forms/${formRow.form_key}/blank.${ext}`

  // Remove prior extensions when replacing
  const siblings = [
    `application-forms/${formRow.form_key}/blank.pdf`,
    `application-forms/${formRow.form_key}/blank.jpg`,
    `application-forms/${formRow.form_key}/blank.jpeg`,
    `application-forms/${formRow.form_key}/blank.png`,
    `application-forms/${formRow.form_key}/blank.webp`,
  ].filter(p => p !== storagePath)
  try {
    await supabase.storage.from(BUCKET).remove(siblings)
  } catch { /* ignore */ }

  const { error: upErr } = await supabase.storage.from(BUCKET).upload(storagePath, file, {
    upsert: true,
    contentType: mime,
  })
  if (upErr) throw upErr

  return savePrintCornerApplicationForm({
    id: formRow.id,
    label: formRow.label,
    form_key: formRow.form_key,
    description: formRow.description,
    sort_order: formRow.sort_order,
    is_active: formRow.is_active,
    storage_path: storagePath,
    file_name: file.name,
    mime_type: mime,
    file_size: file.size,
  })
}

/** Signed URL for print / WhatsApp / email share (private bucket). */
export async function getApplicationFormSignedUrl(storagePath, expiresSec = 60 * 60 * 24 * 7) {
  if (!storagePath) throw new Error('Form file is not uploaded yet.')
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(storagePath, expiresSec)
  if (error) throw error
  if (!data?.signedUrl) throw new Error('Could not create share link.')
  return data.signedUrl
}

export { APP_FORM_MAX_BYTES }
