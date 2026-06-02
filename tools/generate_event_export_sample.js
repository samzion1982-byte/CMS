import ExcelJS from 'exceljs'
import fs from 'fs'
import path from 'path'

function buildEventTaskRowsSample() {
  const tasks = [
    { id: 1, title: 'Buttermilk', parent_id: null, assigned_to: 'Gerald', whatsapp_sent_count: 0, notes: '' },
    { id: 2, title: 'Food & Catering', parent_id: null, assigned_to: 'Eben', whatsapp_sent_count: 0, notes: '' },
    { id: 3, title: 'Food & Catering', parent_id: null, assigned_to: 'Dinakar', whatsapp_sent_count: 0, notes: '' },
    { id: 4, title: 'Tea & Coffee', parent_id: 2, assigned_to: 'Gerald', whatsapp_sent_count: 0, notes: '' },
    { id: 5, title: 'Lunch', parent_id: 2, assigned_to: '', whatsapp_sent_count: 0, notes: '' },
    { id: 6, title: 'Snacks', parent_id: 3, assigned_to: '', whatsapp_sent_count: 0, notes: '' },
  ]

  const parentById = new Map(tasks.map(t => [t.id, t]))
  const childrenByParent = {}
  tasks.forEach(task => {
    if (task.parent_id) {
      if (!childrenByParent[task.parent_id]) childrenByParent[task.parent_id] = []
      childrenByParent[task.parent_id].push(task)
    }
  })

  const normalizeNames = value => [...new Set(String(value || '').split(/[;,]+/).map(v => v.trim()).filter(Boolean))]
  const topLevelTasks = tasks.filter(t => !t.parent_id)

  // Group top-level tasks by title so duplicate parent tasks (same name) are merged
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
    group.forEach(g => {
      const kids = childrenByParent[g.id] || []
      allChildren.push(...kids)
    })

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

  // Add orphan children without parent
  tasks.filter(t => t.parent_id && !parentById.has(t.parent_id)).forEach(child => {
    rows.push({
      task: child.title || '',
      subtasks: '',
      assigned_to: child.assigned_to || '',
      sub_assigned_to: '',
      reports_to: '',
      whatsapp_count: Number(child.whatsapp_sent_count || 0),
      notes: child.notes || '',
    })
  })

  return rows
}

async function writeExcel(rows, filePath) {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Tasks')
  const columns = [
    { header: 'Task', key: 'task', width: 30 },
    { header: 'Subtasks', key: 'subtasks', width: 30 },
    { header: 'Assigned To', key: 'assigned_to', width: 22 },
    { header: 'Sub Assigned To', key: 'sub_assigned_to', width: 22 },
    { header: 'Reports To', key: 'reports_to', width: 22 },
    { header: 'WhatsApp Count', key: 'whatsapp_count', width: 14 },
    { header: 'Notes', key: 'notes', width: 30 },
  ]
  ws.columns = columns

  // Title
  ws.addRow([])
  const titleRow = ws.addRow(['VBS', '', '', '', '', '', ''])
  ws.mergeCells(`A${titleRow.number}:G${titleRow.number}`)
  titleRow.getCell(1).font = { bold: true, size: 14 }
  ws.addRow([])

  // Header styling
  const header = ws.addRow(columns.map(c => c.header))
  header.eachCell(cell => { cell.font = { bold: true }; cell.alignment = { horizontal: 'center' } })

  // Data rows
  rows.forEach(r => {
    ws.addRow([r.task, r.subtasks, r.assigned_to, r.sub_assigned_to, r.reports_to, r.whatsapp_count, r.notes])
  })

  await wb.xlsx.writeFile(filePath)
}

async function main() {
  const rows = buildEventTaskRowsSample()
  const outDir = path.resolve('exports')
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir)
  const filePath = path.join(outDir, `event_sample_export.xlsx`)
  await writeExcel(rows, filePath)
  console.log('Wrote', filePath)
}

main().catch(err => { console.error(err); process.exit(1) })
