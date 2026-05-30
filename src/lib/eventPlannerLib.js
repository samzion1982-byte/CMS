import { supabase } from './supabase'

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
  const { data, error } = await supabase.from('task_library')
    .select('*')
    .order('sort_order')
    .order('created_at')
  if (error) throw error
  return data || []
}

export async function addLibraryCategory(userEmail) {
  const now = new Date().toISOString()
  const maxSort = await supabase.from('task_library').select('sort_order', { count: 'exact' }).order('sort_order', { ascending: false }).limit(1)
  const nextSort = (maxSort.data?.[0]?.sort_order || 0) + 1
  const { data, error } = await supabase.from('task_library')
    .insert({ category: 'New Task', subcategory: '', sort_order: nextSort, created_by: userEmail, updated_by: userEmail, created_at: now, updated_at: now })
    .select('id').single()
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
  const now = new Date().toISOString()
  const parent = await supabase.from('task_library').select('*').eq('id', parentId).single()
  if (!parent.data) throw new Error('Parent task not found')

  const maxSort = await supabase.from('task_library').select('sort_order').eq('category', parent.data.category).order('sort_order', { ascending: false }).limit(1)
  const nextSort = (maxSort.data?.[0]?.sort_order || 0) + 1

  const { data, error } = await supabase.from('task_library')
    .insert({ category: parent.data.category, subcategory: 'New Subtask', sort_order: nextSort, created_by: userEmail, updated_by: userEmail, created_at: now, updated_at: now })
    .select('id').single()
  if (error) throw error
  return data.id
}

export async function deleteLibraryItem(id, userEmail) {
  const { error } = await supabase.from('task_library').delete().eq('id', id)
  if (error) throw error
}

export async function updateLibraryTaskOrder(tasks) {
  await Promise.all(
    tasks.map((t, idx) =>
      supabase.from('task_library').update({ sort_order: idx }).eq('id', t.id)
    )
  )
}

export async function getEventVolunteers() {
  const { data, error } = await supabase.from('event_volunteers')
    .select('*').order('sort_order').order('created_at')
  if (error) throw error
  return data || []
}

export async function saveEventVolunteer(id, payload, userEmail) {
  const now = new Date().toISOString()
  if (id) {
    const { error } = await supabase.from('event_volunteers')
      .update({ ...payload, updated_by: userEmail, updated_at: now }).eq('id', id)
    if (error) throw error
    return id
  } else {
    const { data, error } = await supabase.from('event_volunteers')
      .insert({ ...payload, created_by: userEmail, updated_by: userEmail })
      .select('id').single()
    if (error) throw error
    return data.id
  }
}

export async function deleteEventVolunteer(id) {
  const { error } = await supabase.from('event_volunteers').delete().eq('id', id)
  if (error) throw error
}

export async function replaceEventPlannerMasterData(data, userEmail) {
  const now = new Date().toISOString()
  const library = Array.isArray(data.library) ? data.library : []
  const volunteers = Array.isArray(data.volunteers) ? data.volunteers : []

  const { error: libDelError } = await supabase.from('task_library').delete().neq('id', '')
  if (libDelError) throw libDelError

  const { error: volDelError } = await supabase.from('event_volunteers').delete().neq('id', '')
  if (volDelError) throw volDelError

  if (volunteers.length > 0) {
    const newVols = volunteers.map(v => ({
      id: v.id,
      name: v.name,
      role: v.role || null,
      whatsapp: v.whatsapp || null,
      sort_order: v.sort_order || 0,
      created_by: userEmail,
      updated_by: userEmail,
      created_at: v.created_at || now,
      updated_at: v.updated_at || now,
    }))
    const { error } = await supabase.from('event_volunteers').insert(newVols)
    if (error) throw error
  }

  if (library.length > 0) {
    const newLib = library.map(t => ({
      id: t.id,
      category: t.category || '',
      subcategory: t.subcategory || '',
      sort_order: t.sort_order || 0,
      created_by: userEmail,
      updated_by: userEmail,
      created_at: t.created_at || now,
      updated_at: t.updated_at || now,
    }))
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

export async function downloadEventPlannerMasterTemplate() {
  const ExcelJS = (await import('exceljs')).default
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Church CMS — Event Planner Master Data'
  wb.created = new Date()

  const infoWs = wb.addWorksheet('Instructions')
  infoWs.getColumn(1).width = 100
  const lines = [
    'Event Planner Master Data Import Template',
    '',
    'Fill in the Library sheet with one row per template item.',
    'For top-level categories only, leave Subcategory blank.',
    'Use the Volunteers sheet to import volunteer names, roles and WhatsApp numbers.',
    '',
    'Columns in Library:',
    '  Category, Subcategory, Description, Priority',
    'Columns in Volunteers:',
    '  Name, Role, WhatsApp, Sort Order',
  ]
  lines.forEach(text => infoWs.addRow([text]))

  const libWs = wb.addWorksheet('Library')
  libWs.columns = [
    { header: 'Category', key: 'category', width: 38 },
    { header: 'Subcategory', key: 'subCategory', width: 38 },
    { header: 'Description', key: 'description', width: 50 },
    { header: 'Priority', key: 'priority', width: 18 },
  ]
  const sampleRows = [
    { category: 'Food & Catering', subCategory: 'Breakfast', description: '', priority: 'medium' },
    { category: 'Food & Catering', subCategory: 'Lunch', description: '', priority: 'medium' },
    { category: 'Food & Catering', subCategory: 'Dinner', description: '', priority: 'medium' },
    { category: 'Freebies & Gifts', subCategory: 'Shawls', description: '', priority: 'low' },
    { category: 'Freebies & Gifts', subCategory: 'Promise Cards', description: '', priority: 'low' },
    { category: 'Stationery Items', subCategory: 'Offering Envelopes', description: '', priority: 'low' },
  ]
  libWs.addRows(sampleRows)

  const volWs = wb.addWorksheet('Volunteers')
  volWs.columns = [
    { header: 'Name', key: 'name', width: 32 },
    { header: 'Role', key: 'role', width: 28 },
    { header: 'WhatsApp', key: 'whatsapp', width: 24 },
    { header: 'Sort Order', key: 'sort_order', width: 14 },
  ]
  volWs.addRow({ name: 'John Doe', role: 'Coordinator', whatsapp: '+911234567890', sort_order: 0 })

  const buffer = await wb.xlsx.writeBuffer()
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'event-planner-master-template.xlsx'
  a.click()
  URL.revokeObjectURL(url)
}

export async function downloadEventPlannerMasterData() {
  const data = await getEventPlannerMasterData()
  const libraryRows = flattenLibraryRows(data.library || [])
  const wb = await buildMasterWorkbook({ libraryRows, volunteers: data.volunteers || [] })
  const buffer = await wb.xlsx.writeBuffer()
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'event-planner-master-data.xlsx'
  a.click()
  URL.revokeObjectURL(url)
}

function parseLibrarySheet(ws) {
  const rows = []
  ws.eachRow((row, ri) => {
    if (ri === 1) return
    const category = String(row.getCell(1).value ?? '').trim()
    const subCategory = String(row.getCell(2).value ?? '').trim()
    const description = String(row.getCell(3).value ?? '').trim()
    const priority = String(row.getCell(4).value ?? 'medium').trim() || 'medium'
    if (!category) return
    rows.push({ category, subCategory: subCategory || null, description: description || null, priority })
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
    const whatsapp = String(row.getCell(3).value ?? '').trim() || null
    const sort_order = Number(row.getCell(4).value ?? 0) || 0
    rows.push({ name, role, whatsapp, sort_order })
  })
  return rows
}

export async function readAndParseEventPlannerMasterFile(file) {
  const ExcelJS = (await import('exceljs')).default
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(await file.arrayBuffer())

  const wsLibrary = wb.getWorksheet('Library')
  const wsVolunteers = wb.getWorksheet('Volunteers')
  const errors = []
  if (!wsLibrary) errors.push('Missing "Library" sheet. Please use the Event Planner template.')
  if (!wsVolunteers) errors.push('Missing "Volunteers" sheet. Please use the Event Planner template.')
  if (errors.length) return { valid: false, errors, library: [], volunteers: [] }

  const library = parseLibrarySheet(wsLibrary)
  const volunteers = parseVolunteersSheet(wsVolunteers)

  if (!library.length && !volunteers.length) {
    return { valid: false, errors: ['No library or volunteer rows found.'], library: [], volunteers: [] }
  }

  return { valid: true, errors: [], library, volunteers }
}

export async function importEventPlannerMasterData(parsed, userEmail) {
  const libraryRows = Array.isArray(parsed.library) ? parsed.library : []
  const volunteers = Array.isArray(parsed.volunteers) ? parsed.volunteers : []

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

  const taskRows = sourceTasks
    .filter(t => bucketMap[t.bucket_id])
    .map(t => ({
      event_id:    targetEventId,
      bucket_id:   bucketMap[t.bucket_id],
      title:       t.title,
      description: t.description,
      assigned_to: t.assigned_to,
      priority:    t.priority,
      status:      'pending',
      sort_order:  t.sort_order,
      due_date:    advanceDates && t.due_date ? advanceOneYear(t.due_date) : null,
    }))

  if (taskRows.length > 0) {
    const { error } = await supabase.from('event_tasks').insert(taskRows)
    if (error) throw error
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
