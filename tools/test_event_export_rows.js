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
const rows = []

topLevelTasks.forEach(task => {
  const children = childrenByParent[task.id] || []
  const parentAssigneesArr = normalizeNames(task.assigned_to)
  const parentAssignees = parentAssigneesArr.join(', ')
  const childAssigneesArr = [...new Set(children.flatMap(c => normalizeNames(c.assigned_to)))]
  const childAssignees = childAssigneesArr.join(', ')

  rows.push({
    task: task.title || '',
    subtasks: children.map(child => child.title || '').join('; '),
    assigned_to: parentAssignees,
    sub_assigned_to: childAssignees,
    reports_to: '',
    whatsapp_count: Number(task.whatsapp_sent_count || 0),
    notes: task.notes || '',
  })

  children.forEach(child => {
    const childAssignedArr = normalizeNames(child.assigned_to)
    const childAssigned = childAssignedArr.join(', ')
    const reportsToArr = parentAssigneesArr.filter(a => !childAssignedArr.includes(a))
    const reportsTo = reportsToArr.join(', ')
    rows.push({
      task: task.title || '',
      subtasks: child.title || '',
      assigned_to: childAssigned,
      sub_assigned_to: '',
      reports_to: reportsTo,
      whatsapp_count: Number(child.whatsapp_sent_count || 0),
      notes: child.notes || '',
    })
  })
})

console.dir(rows, { depth: null })
