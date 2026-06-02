import { supabase } from './supabase'
import { normalizeWhatsAppNumber } from './whatsapp'

// ── Events ────────────────────────────────────────────────────────────────────

export async function getEvents(year = null) {
  let q = supabase.from('event_plans').select('*').eq('is_active', true)
  if (year) q = q.eq('year', year)
  const { data, error } = await q.order('start_date', { ascending: false }).order('created_at', { ascending: false })
  if (error) throw error
  return data || []
}

export async function saveEvent(id, payload, userEmail) {
  const now = new Date().toISOString()
  if (id) {
    const { error } = await supabase.from('event_plans')
      .update({ ...payload, updated_by: userEmail, updated_at: now })
      .eq('id', id)
    if (error) throw error
    return id
  } else {
    const { data, error } = await supabase.from('event_plans')
      .insert({ ...payload, created_by: userEmail, updated_by: userEmail })
      .select('id').single()
    if (error) throw error
    return data.id
  }
}

export async function deleteEvent(id) {
  const { error } = await supabase.from('event_plans')
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

// ── Buckets ───────────────────────────────────────────────────────────────────

export async function getBuckets(eventId) {
  const { data, error } = await supabase.from('event_task_buckets')
    .select('*').eq('event_id', eventId)
    .order('sort_order').order('created_at')
  if (error) throw error
  return data || []
}

export async function saveBucket(id, payload, userEmail=null) {
  const now = new Date().toISOString()
  if (id) {
    const { error } = await supabase.from('event_task_buckets')
      .update({ ...payload, updated_by: userEmail, updated_at: now }).eq('id', id)
    if (error) throw error
    return id
  } else {
    const insertPayload = { ...payload, created_by: userEmail, updated_by: userEmail, created_at: now, updated_at: now }
    const { data, error } = await supabase.from('event_task_buckets')
      .insert(insertPayload).select('id').single()
    if (error) {
      console.error('saveBucket insert error', error)
      throw error
    }
    return data.id
  }
}

export async function deleteBucket(id) {
  const { error } = await supabase.from('event_task_buckets').delete().eq('id', id)
  if (error) throw error
}

// ── Tasks ─────────────────────────────────────────────────────────────────────

export async function getTasks(eventId) {
  const { data, error } = await supabase.from('event_tasks')
    .select('*').eq('event_id', eventId)
    .order('sort_order').order('created_at')
  if (error) throw error
  return data || []
}

export async function getTasksForEvents(eventIds) {
  if (!Array.isArray(eventIds) || eventIds.length === 0) return []
  const { data, error } = await supabase.from('event_tasks')
    .select('*')
    .in('event_id', eventIds)
    .order('event_id')
    .order('sort_order')
    .order('created_at')
  if (error) throw error
  return data || []
}

export async function getBucketsForEvents(eventIds) {
  if (!Array.isArray(eventIds) || eventIds.length === 0) return []
  const { data, error } = await supabase.from('event_task_buckets')
    .select('*')
    .in('event_id', eventIds)
    .order('event_id')
    .order('sort_order')
    .order('created_at')
  if (error) throw error
  return data || []
}

export async function saveTask(id, payload, userEmail) {
  const now = new Date().toISOString()
  try{ console.log('eventPlannerLib.saveTask', { id, payload }) }catch(e){}
  if (id) {
    const { error } = await supabase.from('event_tasks')
      .update({ ...payload, updated_by: userEmail, updated_at: now }).eq('id', id)
    if (error) throw error
    return id
  } else {
    const { data, error } = await supabase.from('event_tasks')
      .insert({ ...payload, created_by: userEmail, updated_by: userEmail })
      .select('id').single()
    if (error) throw error
    return data.id
  }
}

export async function deleteTask(id) {
  const { error } = await supabase.from('event_tasks').delete().eq('id', id)
  if (error) throw error
}

export async function getTaskLibrary() {
  try {
    const { data, error } = await supabase.from('task_library')
      .select('*')
      .order('sort_order')
      .order('created_at')
    if (error) throw error
    return data || []
  } catch (error) {
    console.warn('getTaskLibrary fallback after order/query failure', error)
    const { data, error: fallbackError } = await supabase.from('task_library').select('*')
    if (fallbackError) throw fallbackError
    return data || []
  }
}

export async function addLibraryCategory(userEmail) {
  const email = userEmail || 'system'
  const maxSort = await supabase.from('task_library').select('sort_order').order('sort_order', { ascending: false }).limit(1)
  const nextSort = (maxSort.data?.[0]?.sort_order || 0) + 1
  const { data, error } = await supabase.from('task_library')
    .insert({ category: 'New Task', subcategory: null, sort_order: nextSort, created_by: email, updated_by: email })
    .select('*').single()
  if (error) throw error
  return data.id
}

export async function updateLibraryItemName(id, field, value, userEmail) {
  const now = new Date().toISOString()
  const { error } = await supabase.from('task_library')
    .update({ [field]: value.trim(), updated_by: userEmail, updated_at: now })
    .eq('id', id)
  if (error) throw error
}

export async function addLibrarySubtask(parentId, userEmail) {
  const parent = await supabase.from('task_library').select('*').eq('id', parentId).single()
  if (!parent.data) throw new Error('Parent task not found')

  const maxSort = await supabase.from('task_library').select('sort_order').eq('category', parent.data.category).order('sort_order', { ascending: false }).limit(1)
  const nextSort = (maxSort.data?.[0]?.sort_order || 0) + 1

  const { data, error } = await supabase.from('task_library')
    .insert({ category: parent.data.category, subcategory: 'New Subtask', sort_order: nextSort, created_by: userEmail, updated_by: userEmail })
    .select('*').single()
  if (error) throw error
  return data.id
}

export async function deleteLibraryItem(id, userEmail) {
  const { error } = await supabase.from('task_library').delete().eq('id', id)
  if (error) throw error
}

export async function saveLibraryTask(id, payload, userEmail) {
  const now = new Date().toISOString()
  if (id) {
    const { error } = await supabase.from('task_library')
      .update({ ...payload, updated_by: userEmail, updated_at: now }).eq('id', id)
    if (error) throw error
    return id
  } else {
    const { data, error } = await supabase.from('task_library')
      .insert({ ...payload, created_by: userEmail, updated_by: userEmail })
      .select('id').single()
    if (error) throw error
    return data.id
  }
}

export async function updateLibraryTaskOrder(tasks) {
  await Promise.all(
    tasks.map((t, idx) =>
      supabase.from('task_library').update({ sort_order: idx }).eq('id', t.id)
    )
  )
}

export async function getEventVolunteers() {
  try {
    const { data, error } = await supabase.from('event_volunteers')
      .select('*').order('sort_order').order('created_at')
    if (error) throw error
    return data || []
  } catch (error) {
    console.warn('getEventVolunteers failed, returning empty list', error)
    return []
  }
}

export async function saveEventVolunteer(id, payload, userEmail) {
  const now = new Date().toISOString()
  if (id) {
    const { error } = await supabase.from('event_volunteers')
      .update({ ...payload, updated_by: userEmail, updated_at: now }).eq('id', id)
    if (error) throw error
    return id
  } else {
    let sortOrder = payload.sort_order
    if (sortOrder == null) {
      const { data: maxRows, error: sortError } = await supabase.from('event_volunteers')
        .select('sort_order').order('sort_order', { ascending: false }).limit(1)
      if (sortError) throw sortError
      sortOrder = (maxRows?.[0]?.sort_order || 0) + 1
    }
    const insertPayload = {
      ...payload,
      sort_order: sortOrder,
      created_by: userEmail,
      updated_by: userEmail,
      created_at: now,
      updated_at: now,
    }
    const { data, error } = await supabase.from('event_volunteers')
      .insert(insertPayload)
      .select('id').single()
    if (error) throw error
    return data.id
  }
}

export async function findMemberContactByName(name) {
  const query = String(name || '').trim()
  if (!query) return null
  const { data, error } = await supabase.from('members')
    .select('member_name,whatsapp,mobile')
    .ilike('member_name', `%${query}%`)
    .order('member_name')
    .limit(5)
  if (error) throw error
  if (!data || data.length === 0) return null
  const exactMatch = data.find(m => String(m.member_name || '').trim().toLowerCase() === query.toLowerCase())
  return exactMatch || data[0]
}

export async function searchMemberContactsByName(name) {
  const query = String(name || '').trim()
  if (!query) return []
  const { data, error } = await supabase.from('members')
    .select('member_name,whatsapp,mobile')
    .ilike('member_name', `%${query}%`)
    .order('member_name')
    .limit(5)
  if (error) throw error
  return data || []
}

export async function deleteEventVolunteer(id) {
  const { error } = await supabase.from('event_volunteers').delete().eq('id', id)
  if (error) throw error
}

export async function replaceEventPlannerMasterData(data, userEmail) {
  const now = new Date().toISOString()
  const library = Array.isArray(data.library) ? data.library : []
  const volunteers = data.volunteers === undefined ? undefined : Array.isArray(data.volunteers) ? data.volunteers : []

const { error: libDelError } = await supabase.from('task_library').delete().gte('sort_order', -1)
  if (libDelError) throw libDelError

  if (volunteers !== undefined) {
    try {
      const { error: volDelError } = await supabase.from('event_volunteers').delete().gte('sort_order', -1)
    if (volDelError) throw volDelError
  } catch (error) {
    console.warn('replaceEventPlannerMasterData: event_volunteers delete failed, continuing', error)
  }
  }

  if (volunteers && volunteers.length > 0) {
    try {
      const newVols = volunteers.map(v => {
        const row = {
          name: v.name,
          role: v.role || null,
          whatsapp: v.whatsapp || null,
          sort_order: v.sort_order || 0,
          created_by: userEmail,
          updated_by: userEmail,
          created_at: v.created_at || now,
          updated_at: v.updated_at || now,
        }
        if (v.id) row.id = v.id
        return row
      })
      const { error } = await supabase.from('event_volunteers').insert(newVols)
      if (error) throw error
    } catch (error) {
      console.warn('replaceEventPlannerMasterData: volunteers insert failed (table may not exist), continuing with library only', error)
    }
  }

  if (library.length > 0) {
    const newLib = library.map(t => {
      const row = {
        category: t.category || '',
        subcategory: t.subcategory || '',
        sort_order: t.sort_order || 0,
        created_by: userEmail,
        updated_by: userEmail,
        created_at: t.created_at || now,
        updated_at: t.updated_at || now,
      }
      if (t.id) row.id = t.id
      return row
    })
    const { error } = await supabase.from('task_library').insert(newLib)
    if (error) throw error
  }
}

export async function getEventPlannerMasterData() {
  const [library, volunteers] = await Promise.all([getTaskLibrary(), getEventVolunteers()])
  return { library, volunteers }
}

function uuid() {
  return (typeof crypto !== 'undefined' && crypto.randomUUID)
    ? crypto.randomUUID()
    : `id-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function flattenLibraryRows(tasks) {
  return (tasks || []).map(t => ({
    category: t.category || '',
    subCategory: t.subcategory || '',
    description: t.description || '',
    priority: t.priority || 'medium',
  }))
}

async function buildMasterWorkbook({ libraryRows, volunteers }) {
  const ExcelJS = (await import('exceljs')).default
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Church CMS — Event Planner Master Data'
  wb.created = new Date()

  const libWs = wb.addWorksheet('Library')
  libWs.columns = [
    { header: 'Category', key: 'category', width: 38 },
    { header: 'Subcategory', key: 'subCategory', width: 38 },
    { header: 'Description', key: 'description', width: 50 },
    { header: 'Priority', key: 'priority', width: 18 },
  ]
  libWs.addRows(libraryRows.map(r => ({
    category: r.category,
    subCategory: r.subCategory,
    description: r.description,
    priority: r.priority,
  })))

  const volWs = wb.addWorksheet('Volunteers')
  volWs.columns = [
    { header: 'Name', key: 'name', width: 32 },
    { header: 'Role', key: 'role', width: 28 },
    { header: 'WhatsApp', key: 'whatsapp', width: 24 },
    { header: 'Sort Order', key: 'sort_order', width: 14 },
  ]
  volWs.addRows((volunteers || []).map(v => ({
    name: v.name,
    role: v.role || '',
    whatsapp: v.whatsapp || '',
    sort_order: v.sort_order || 0,
  })))

  return wb
}

function createLibraryWorkbook({ workbook, rows }) {
  const libWs = workbook.addWorksheet('Library')
  libWs.columns = [
    { header: 'Category', key: 'category', width: 36 },
    { header: 'Subcategory', key: 'subCategory', width: 36 },
  ]

  libWs.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }
  libWs.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' }
  libWs.getRow(1).height = 24
  libWs.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF4A5568' },
  }
  libWs.views = [{ state: 'frozen', ySplit: 1 }]
  libWs.autoFilter = 'A1:B1'

  if (Array.isArray(rows) && rows.length > 0) {
    libWs.addRows(rows)
  }

  libWs.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return
    row.eachCell(cell => {
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        right: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      }
    })
  })

  return libWs
}

export async function downloadEventPlannerMasterTemplate() {
  const ExcelJS = (await import('exceljs')).default
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Church CMS — Event Planner Library Template'
  wb.created = new Date()

  const sampleRows = [
    { category: 'Food & Catering', subCategory: 'Breakfast' },
    { category: 'Food & Catering', subCategory: 'Lunch' },
    { category: 'Food & Catering', subCategory: 'Dinner' },
    { category: 'Freebies & Gifts', subCategory: 'Shawls' },
    { category: 'Freebies & Gifts', subCategory: 'Promise Cards' },
  ]

  createLibraryWorkbook({ workbook: wb, rows: sampleRows })


  const buffer = await wb.xlsx.writeBuffer()
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'event-planner-library-template.xlsx'
  a.click()
  URL.revokeObjectURL(url)
}

export async function downloadEventPlannerMasterData() {
  const data = await getEventPlannerMasterData()
  const libraryRows = flattenLibraryRows(data.library || [])
  const ExcelJS = (await import('exceljs')).default
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Church CMS — Event Planner Library Data Export'
  wb.created = new Date()

  createLibraryWorkbook({ workbook: wb, rows: libraryRows })


  const buffer = await wb.xlsx.writeBuffer()
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'event-planner-library-data.xlsx'
  a.click()
  URL.revokeObjectURL(url)
}

function formatVolunteerWorksheet(volWs) {
  const borderStyle = {
    top: { style: 'thin', color: { argb: 'FFB8CCE4' } },
    left: { style: 'thin', color: { argb: 'FFB8CCE4' } },
    bottom: { style: 'thin', color: { argb: 'FFB8CCE4' } },
    right: { style: 'thin', color: { argb: 'FFB8CCE4' } },
  }

  const headerRow = volWs.getRow(1)
  headerRow.font = { bold: true, color: { argb: 'FF1F497D' } }
  headerRow.alignment = { vertical: 'middle', horizontal: 'center' }
  headerRow.height = 22
  headerRow.eachCell(cell => {
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFDBE5F1' },
    }
    cell.border = borderStyle
  })

  volWs.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return
    row.eachCell(cell => {
      cell.border = borderStyle
      cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true }
    })
  })

  volWs.columns.forEach(col => {
    let maxLength = 14
    col.eachCell({ includeEmpty: false }, cell => {
      const value = cell.value
      const text = value == null ? '' : String(value)
      maxLength = Math.max(maxLength, text.length + 2)
    })
    col.width = Math.min(Math.max(maxLength, 14), 48)
  })

  volWs.views = [{ state: 'frozen', ySplit: 1 }]
}

export async function downloadEventPlannerVolunteersTemplate() {
  const ExcelJS = (await import('exceljs')).default
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Church CMS — Event Planner Volunteers Template'
  wb.created = new Date()

  const volWs = wb.addWorksheet('Volunteers')
  volWs.columns = [
    { header: 'Name', key: 'name', width: 34 },
    { header: 'Role', key: 'role', width: 26 },
    { header: 'WhatsApp', key: 'whatsapp', width: 26 },
  ]
  volWs.addRows([
    ['Daniel Prahbahar', 'Secretary', '919123456789'],
    ['Immanuel Jones', 'Volunteer', '919876543210'],
  ])

  formatVolunteerWorksheet(volWs)

  const buffer = await wb.xlsx.writeBuffer()
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'event-planner-volunteers-template.xlsx'
  a.click()
  URL.revokeObjectURL(url)
}

export async function downloadEventPlannerVolunteersData() {
  const data = await getEventPlannerMasterData()
  const ExcelJS = (await import('exceljs')).default
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Church CMS — Event Planner Volunteers Export'
  wb.created = new Date()

  const volWs = wb.addWorksheet('Volunteers')
  volWs.columns = [
    { header: 'Name', key: 'name', width: 32 },
    { header: 'Role', key: 'role', width: 28 },
    { header: 'WhatsApp', key: 'whatsapp', width: 24 },
  ]
  if (Array.isArray(data.volunteers) && data.volunteers.length > 0) {
    volWs.addRows((data.volunteers || []).map(v => ([v.name, v.role || '', v.whatsapp || ''])))
  }

  formatVolunteerWorksheet(volWs)

  const buffer = await wb.xlsx.writeBuffer()
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'event-planner-volunteers-data.xlsx'
  a.click()
  URL.revokeObjectURL(url)
}

export async function readAndParseVolunteersFile(file) {
  const buffer = await file.arrayBuffer()
  async function parseWithExcelJS() {
    const ExcelJS = (await import('exceljs')).default
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(buffer)
    const wsVol = wb.getWorksheet('Volunteers') || wb.worksheets[0]
    if (!wsVol) throw new Error('Missing Volunteers sheet')
    const volunteers = parseVolunteersSheet(wsVol)
    if (!volunteers.length) throw new Error('No volunteers found in file')
    return { valid: true, errors: [], volunteers }
  }
  async function parseWithXLSX() {
    const xlsxModule = await import('xlsx')
    const XLSX = xlsxModule.default || xlsxModule
    const wb = XLSX.read(buffer, { type: 'array' })
    const sheetNames = wb.SheetNames || []
    if (!sheetNames.length) throw new Error('No sheets found in workbook')
    const volunteerSheetName = sheetNames.find(name => name === 'Volunteers') || sheetNames[0]
    const volunteerSheet = wb.Sheets[volunteerSheetName]
    if (!volunteerSheet) throw new Error('Missing Volunteers sheet')
    const volunteerRows = XLSX.utils.sheet_to_json(volunteerSheet, { header: 1, defval: '' })
    const volunteers = volunteerRows.slice(1).reduce((out, row) => {
      const name = String(row[0] ?? '').trim()
      if (!name) return out
      out.push({
        name,
        role: String(row[1] ?? '').trim() || null,
        whatsapp: normalizeWhatsAppNumber(String(row[2] ?? '').trim() || '', { provider: 'soft7' }) || null,
        sort_order: Number(row[3] ?? 0) || 0,
      })
      return out
    }, [])
    if (!volunteers.length) throw new Error('No volunteers found in file')
    return { valid: true, errors: [], volunteers }
  }
  try { return await parseWithExcelJS() } catch (err) { try { return await parseWithXLSX() } catch (err2) { console.error('Failed to parse volunteers file', err, err2); return { valid: false, errors: ['Invalid file or unsupported format.'], volunteers: [] } } }
}

export async function importEventPlannerVolunteers(volunteers, userEmail) {
  if (!Array.isArray(volunteers) || volunteers.length === 0) return
  const now = new Date().toISOString()
  try {
    const { error: delErr } = await supabase.from('event_volunteers').delete().gte('sort_order', -1)
    if (delErr) throw delErr
  } catch (err) {
    console.warn('importEventPlannerVolunteers: delete failed, continuing', err)
  }
  const rows = volunteers.map((v, idx) => ({
    name: v.name,
    role: v.role || null,
    whatsapp: v.whatsapp || null,
    sort_order: v.sort_order || idx,
    created_by: userEmail,
    updated_by: userEmail,
    created_at: v.created_at || now,
    updated_at: v.updated_at || now,
  }))
  const { error } = await supabase.from('event_volunteers').insert(rows)
  if (error) throw error
}

function parseLibrarySheet(ws) {
  const rows = []
  ws.eachRow((row, ri) => {
    if (ri === 1) return
    const category = String(row.getCell(1).value ?? '').trim()
    const subCategory = String(row.getCell(2).value ?? '').trim()
    if (!category) return
    rows.push({ category, subCategory: subCategory || null })
  })
  return rows
}

function parseVolunteersSheet(ws) {
  const rows = []
  ws.eachRow((row, ri) => {
    if (ri === 1) return
    const name = String(row.getCell(1).value ?? '').trim()
    if (!name) return
    const role = String(row.getCell(2).value ?? '').trim() || null
    const whatsapp = normalizeWhatsAppNumber(String(row.getCell(3).value ?? '').trim() || '', { provider: 'soft7' }) || null
    const sort_order = Number(row.getCell(4).value ?? 0) || 0
    rows.push({ name, role, whatsapp, sort_order })
  })
  return rows
}

export async function readAndParseEventPlannerMasterFile(file) {
  const buffer = await file.arrayBuffer()

  function normalizeWorkbookLibrary(ws) {
    if (!ws) return null
    const header1 = String(ws.getRow(1).getCell(1).value ?? '').trim()
    const header2 = String(ws.getRow(1).getCell(2).value ?? '').trim()
    if (!header1 || !/category/i.test(header1)) return null
    if (!header2 || !/subcategory/i.test(header2)) return null
    return ws
  }

  async function parseWithExcelJS() {
    const ExcelJS = (await import('exceljs')).default
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(buffer)

    let wsLibrary = normalizeWorkbookLibrary(wb.getWorksheet('Library'))
    if (!wsLibrary && wb.worksheets.length) {
      wsLibrary = normalizeWorkbookLibrary(wb.worksheets[0])
    }
    if (!wsLibrary) {
      throw new Error('Missing Library sheet or invalid header row')
    }

    const library = parseLibrarySheet(wsLibrary)
    const wsVolunteers = wb.getWorksheet('Volunteers')
    const volunteers = wsVolunteers ? parseVolunteersSheet(wsVolunteers) : null

    if (!library.length && !(volunteers && volunteers.length)) {
      throw new Error('No library rows found')
    }

    return { valid: true, errors: [], library, volunteers }
  }

  async function parseWithXLSX() {
    const xlsxModule = await import('xlsx')
    const XLSX = xlsxModule.default || xlsxModule
    const wb = XLSX.read(buffer, { type: 'array' })
    const sheetNames = wb.SheetNames || []
    if (!sheetNames.length) {
      throw new Error('No sheets found in workbook')
    }

    const librarySheetName = sheetNames.find(name => name === 'Library') || sheetNames[0]
    const librarySheet = wb.Sheets[librarySheetName]
    if (!librarySheet) {
      throw new Error('Missing Library sheet')
    }

    const rows = XLSX.utils.sheet_to_json(librarySheet, { header: 1, defval: '' })
    if (!rows.length || !String(rows[0][0] ?? '').trim().toLowerCase().includes('category') || !String(rows[0][1] ?? '').trim().toLowerCase().includes('subcategory')) {
      throw new Error('Missing Category/Subcategory headers in Library sheet')
    }

    const library = rows.slice(1).reduce((out, row) => {
      const category = String(row[0] ?? '').trim()
      if (!category) return out
      const subCategory = String(row[1] ?? '').trim()
      out.push({ category, subCategory: subCategory || null })
      return out
    }, [])

    let volunteers = null
    const volunteerSheetName = sheetNames.find(name => name === 'Volunteers')
    if (volunteerSheetName) {
      const volunteerSheet = wb.Sheets[volunteerSheetName]
      const volunteerRows = XLSX.utils.sheet_to_json(volunteerSheet, { header: 1, defval: '' })
      volunteers = volunteerRows.slice(1).reduce((out, row) => {
        const name = String(row[0] ?? '').trim()
        if (!name) return out
        out.push({
          name,
          role: String(row[1] ?? '').trim() || null,
          whatsapp: String(row[2] ?? '').trim() || null,
          sort_order: Number(row[3] ?? 0) || 0,
        })
        return out
      }, [])
    }

    if (!library.length && !(volunteers && volunteers.length)) {
      throw new Error('No library rows found')
    }

    return { valid: true, errors: [], library, volunteers }
  }

  try {
    return await parseWithExcelJS()
  } catch (err) {
    try {
      return await parseWithXLSX()
    } catch (err2) {
      console.error('Failed to parse event planner template', err, err2)
      return { valid: false, errors: ['Invalid file or unsupported format. Please use the Event Planner library template and save it as .xlsx.'], library: [], volunteers: null }
    }
  }
}

export async function importEventPlannerMasterData(parsed, userEmail) {
  const libraryRows = Array.isArray(parsed.library) ? parsed.library : []
  const volunteers = parsed.volunteers === null ? undefined : Array.isArray(parsed.volunteers) ? parsed.volunteers : []

  const library = libraryRows
    .filter(row => row.category && row.category.trim())
    .map((row, idx) => ({
      id: uuid(),
      category: row.category.trim(),
      subcategory: row.subCategory ? row.subCategory.trim() : '',
      sort_order: idx,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }))

  await replaceEventPlannerMasterData({ library, volunteers }, userEmail)
}

export async function cloneLibraryTaskToEvent(libraryTaskId, eventId, bucketId, parentId, userEmail, allTasks=[]) {
  const { data: libTask, error } = await supabase.from('task_library').select('*').eq('id', libraryTaskId).single()
  if (error) throw error
  if (!libTask) throw new Error('Library task not found')
  const isSubcategory = libTask.subcategory?.trim()

  const title = libTask.subcategory?.trim() || libTask.category
  const payload = {
    event_id:    eventId,
    parent_id:   parentId != null ? parentId : null,
    bucket_id:   parentId != null ? null : (bucketId || null),
    title:       title,
    description: null,
    assigned_to: null,
    priority:    libTask.priority || 'medium',
    status:      'pending',
    sort_order:  0,
    due_date:    null,
  }
  const { data, error: insertError } = await supabase.from('event_tasks')
    .insert({ ...payload, created_by: userEmail, updated_by: userEmail })
    .select('id').single()
  if (insertError) {
    console.error('cloneLibraryTaskToEvent insertError', insertError, { libraryTaskId, parentId, bucketId, payload })
  }
  if (insertError) throw insertError
  return data.id
}

export async function updateTaskOrder(tasks) {
  await Promise.all(
    tasks.map((t, idx) =>
      supabase.from('event_tasks').update({ sort_order: idx }).eq('id', t.id)
    )
  )
}

export async function updateBucketOrder(buckets) {
  await Promise.all(
    buckets.map((b, idx) =>
      supabase.from('event_task_buckets').update({ sort_order: idx }).eq('id', b.id)
    )
  )
}

export async function moveTask(taskId, bucketId) {
  const { error } = await supabase.from('event_tasks')
    .update({ bucket_id: bucketId, updated_at: new Date().toISOString() })
    .eq('id', taskId)
  if (error) throw error
}

// ── Carry Forward ─────────────────────────────────────────────────────────────

// advanceDates: if true, advance all task due_dates by +1 year
export async function carryForward(sourceEventId, targetEventId, advanceDates = false) {
  const [sourceBuckets, sourceTasks] = await Promise.all([
    getBuckets(sourceEventId),
    getTasks(sourceEventId),
  ])

  const bucketMap = {}
  for (const b of sourceBuckets) {
    const { data, error } = await supabase.from('event_task_buckets')
      .insert({ event_id: targetEventId, name: b.name, color: b.color, sort_order: b.sort_order })
      .select('id').single()
    if (error) throw error
    bucketMap[b.id] = data.id
  }

  // First pass: insert all tasks with parent_id = null temporarily
  const taskRows = sourceTasks
    .filter(t => !t.bucket_id || bucketMap[t.bucket_id])
    .map(t => ({
      event_id:    targetEventId,
      bucket_id:   t.bucket_id ? bucketMap[t.bucket_id] : null,
      title:       t.title,
      description: t.description,
      assigned_to: null,
      priority:    t.priority,
      status:      'pending',
      sort_order:  t.sort_order,
      due_date:    advanceDates && t.due_date ? advanceOneYear(t.due_date) : null,
      parent_id:   null, // Will be remapped in second pass
    }))

  if (taskRows.length === 0) {
    return { buckets: sourceBuckets.length, tasks: 0 }
  }

  const { error: insertError } = await supabase.from('event_tasks').insert(taskRows)
  if (insertError) throw insertError

  // Second pass: create task ID mapping and update parent_id for child tasks
  const targetTasks = await getTasks(targetEventId)
  const taskMap = {}
  
  for (let i = 0; i < sourceTasks.length; i++) {
    if (!sourceTasks[i].bucket_id || bucketMap[sourceTasks[i].bucket_id]) {
      taskMap[sourceTasks[i].id] = targetTasks.find(
        t => t.title === sourceTasks[i].title && 
             t.bucket_id === (sourceTasks[i].bucket_id ? bucketMap[sourceTasks[i].bucket_id] : null)
      )?.id
    }
  }

  // Update parent_id for tasks that have parents
  const tasksWithParents = sourceTasks.filter(t => t.parent_id && taskMap[t.id])
  for (const sourceTask of tasksWithParents) {
    const newParentId = taskMap[sourceTask.parent_id]
    if (newParentId && taskMap[sourceTask.id]) {
      const { error } = await supabase
        .from('event_tasks')
        .update({ parent_id: newParentId })
        .eq('id', taskMap[sourceTask.id])
      if (error) throw error
    }
  }

  return { buckets: sourceBuckets.length, tasks: taskRows.length }
}

function advanceOneYear(dateStr) {
  if (!dateStr) return null
  const [y, m, d] = dateStr.split('-')
  return `${parseInt(y) + 1}-${m}-${d}`
}

function advanceNYears(dateStr, n) {
  if (!dateStr) return null
  const [y, m, d] = dateStr.split('-')
  return `${parseInt(y) + n}-${m}-${d}`
}

// ── Auto-fill Recurring ───────────────────────────────────────────────────────
// Called after every getEvents() load. For each recurring annual event group,
// ensures that a copy exists for every year up to (currentYear + 1).
// Silent — creates missing years in the background.
export async function autoFillRecurring(events, userEmail) {
  const currentYear = new Date().getFullYear()

  // Group recurring annual events by normalised name
  const groups = {}
  for (const e of events) {
    if (!e.is_recurring || e.event_type !== 'annual' || !e.year) continue
    const key = e.name.trim().toLowerCase()
    if (!groups[key]) groups[key] = []
    groups[key].push(e)
  }

  let created = 0
  for (const instances of Object.values(groups)) {
    const years = instances.map(e => e.year)
    const maxYear = Math.max(...years)
    const src = instances.find(e => e.year === maxYear)

    // Fill every missing year from maxYear+1 up to currentYear+1
    for (let y = maxYear + 1; y <= currentYear + 1; y++) {
      if (years.includes(y)) continue
      const diff = y - maxYear
      const { error } = await supabase.from('event_plans').insert({
        name:        src.name,
        event_type:  src.event_type,
        year:        y,
        status:      'planning',
        date_fixed:  src.date_fixed,
        is_recurring:src.is_recurring,
        color:       src.color   || null,
        description: src.description || null,
        start_date:  advanceNYears(src.start_date, diff),
        end_date:    advanceNYears(src.end_date,   diff),
        created_by:  userEmail,
        updated_by:  userEmail,
      })
      if (!error) { created++; years.push(y) }
    }
  }
  return created
}
