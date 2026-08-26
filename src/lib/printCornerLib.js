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
    .select(
      'church_name, diocese, address, city, pincode, presbyter_name, pastor_name, secretary_name, treasurer_name, '
      + 'presbyter_signature_url, secretary_signature_url, treasurer_signature_url',
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
  return normalizeTemplateVariables(variables).map(v => v.key).filter(Boolean)
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

/** Generate one PDF per tracker row, zip and download; each PDF also saved to issued/ via Edge */
export async function convertBulkLettersToZip({
  storagePath,
  templateKey,
  templateType = 'letters',
  rows,
  onProgress,
}) {
  const zip = new JSZip()
  const results = []

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
    const fname = res.filename || safePdfName(i, fieldValues, templateKey)
    zip.file(fname, pdfBytes)
    results.push({ ...res, fieldValues })
  }

  const zipBlob = await zip.generateAsync({ type: 'blob' })
  const stamp = new Date().toISOString().slice(0, 10)
  const zipName = `${templateKey}_bulk_${stamp}.zip`
  const url = URL.createObjectURL(zipBlob)
  const a = document.createElement('a')
  a.href = url
  a.download = zipName
  a.click()
  URL.revokeObjectURL(url)

  return { count: rows.length, zipName, results }
}
