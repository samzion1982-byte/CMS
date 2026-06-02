const tasks = [
  { id: 1, title: 'Buttermilk', parent_id: null, assigned_to: 'Gerald', whatsapp_sent_count: 0, notes: '' },
  { id: 2, title: 'Food & Catering', parent_id: null, assigned_to: 'Eben', whatsapp_sent_count: 0, notes: '' },
  { id: 3, title: 'Food & Catering', parent_id: null, assigned_to: 'Dinakar', whatsapp_sent_count: 0, notes: '' },
  { id: 4, title: 'Tea & Coffee', parent_id: 2, assigned_to: 'Gerald', whatsapp_sent_count: 0, notes: '' },
  { id: 5, title: 'Lunch', parent_id: 2, assigned_to: '', whatsapp_sent_count: 0, notes: '' },
  { id: 6, title: 'Snacks', parent_id: 3, assigned_to: '', whatsapp_sent_count: 0, notes: '' },
]

const childrenByParent = {}
tasks.forEach(task => {
  if (task.parent_id) {
    if (!childrenByParent[task.parent_id]) childrenByParent[task.parent_id] = []
    childrenByParent[task.parent_id].push(task)
  }
})

const normalizeNames = value => [...new Set(String(value || '').split(/[;,]+/).map(v => v.trim()).filter(Boolean))]
const topLevelTasks = tasks.filter(task => !task.parent_id)

// group by title
const grouped = {}
topLevelTasks.forEach(t => {
  const key = (t.title || '').toLowerCase()
  if (!grouped[key]) grouped[key] = []
  grouped[key].push(t)
})

const rows = []
Object.values(grouped).forEach(group => {
  const parentAssigneesArr = [...new Set(group.flatMap(g => normalizeNames(g.assigned_to)))]
  const parentAssignees = parentAssigneesArr.join(', ')
  const allChildren = []
  group.forEach(g => { allChildren.push(...(childrenByParent[g.id] || [])) })

  const unassignedSubtasks = allChildren.filter(c => normalizeNames(c.assigned_to).length === 0)
  const assignedChildren = allChildren.filter(c => normalizeNames(c.assigned_to).length > 0)

  const mergedSubtasks = [
    ...unassignedSubtasks.map(c => c.title || ''),
    ...assignedChildren.map(c => '» ' + (c.title || '')),
  ].filter(Boolean).join('; ')

  const subAssignedList = [...new Set(assignedChildren.flatMap(c => normalizeNames(c.assigned_to)))]

  rows.push({
    task: group[0].title || '',
    subtasks: mergedSubtasks,
    assigned_to: parentAssignees,
    sub_assigned_to: subAssignedList.join('; '),
    reports_to: assignedChildren.length ? parentAssignees : '',
    whatsapp_count: Number(Math.max(...group.map(t => t.whatsapp_sent_count || 0))),
    notes: group[0].notes || '',
  })
})

console.dir(rows, { depth: null })
