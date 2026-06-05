global.document = {
  createElement: () => ({
    href: '',
    download: '',
    click: () => {},
  }),
}

global.URL = {
  createObjectURL: () => 'blob:dummy',
  revokeObjectURL: () => {},
}

import { exportToExcelWithTitle } from './src/lib/exportExcel.js'

const columns = [
  { header: 'Task', key: 'task', align: 'left' },
  { header: 'Subtasks', key: 'subtasks', align: 'left' },
  { header: 'Assigned To', key: 'assigned_to', align: 'left' },
  { header: 'Sub Assigned To', key: 'sub_assigned_to', align: 'left' },
  { header: 'Reports To', key: 'reports_to', align: 'left' },
  { header: 'WhatsApp Scheduled', key: 'whatsapp_scheduled', align: 'center', merge: true },
  { header: 'WhatsApp Follow-up 1', key: 'whatsapp_followup_1', align: 'center', merge: true },
  { header: 'WhatsApp Follow-up 2', key: 'whatsapp_followup_2', align: 'center', merge: true },
  { header: 'Notes', key: 'notes', align: 'left' },
]

const rows = [
  {
    task: 'T1',
    subtasks: '',
    assigned_to: 'A',
    sub_assigned_to: '',
    reports_to: 'A',
    whatsapp_scheduled: '01/01/2026 09:00',
    whatsapp_followup_1: '25/12/2025 09:00',
    whatsapp_followup_2: '30/12/2025 09:00',
    notes: '',
  },
  {
    task: 'T1',
    subtasks: '» S1',
    assigned_to: 'A',
    sub_assigned_to: 'B',
    reports_to: 'A',
    whatsapp_scheduled: '01/01/2026 09:00',
    whatsapp_followup_1: '25/12/2025 09:00',
    whatsapp_followup_2: '30/12/2025 09:00',
    notes: '',
  },
]

async function run() {
  try {
    await exportToExcelWithTitle(columns, rows, 'Tasks', 'tmp-test-export.xlsx', [
      { text: 'Event', bold: true, size: 14 },
      { text: 'Date', size: 11 },
    ])
    console.log('export succeeded')
  } catch (err) {
    console.error('export failed', err)
  }
}

run()
