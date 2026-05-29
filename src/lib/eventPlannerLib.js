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

export async function saveBucket(id, payload) {
  if (id) {
    const { error } = await supabase.from('event_task_buckets')
      .update({ ...payload, updated_at: new Date().toISOString() }).eq('id', id)
    if (error) throw error
    return id
  } else {
    const { data, error } = await supabase.from('event_task_buckets')
      .insert(payload).select('id').single()
    if (error) throw error
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
