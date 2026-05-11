/* ═══════════════════════════════════════════════════════════════
   simpleCategoryImport.js — Excel template + import for categories
   ═══════════════════════════════════════════════════════════════ */

import { supabase } from './supabase'

const HDR = '1E3A5F'
const WHT = 'FFFFFF'

// ── Border helpers ─────────────────────────────────────────────────

function mkBorder(top, bottom, left, right, isLast) {
  const outer = (on) => on ? { style: 'thick', color: { argb: HDR } } : null
  const inner = { style: 'thin', color: { argb: 'E5E7EB' } }
  return {
    top:    outer(top)    || inner,
    bottom: outer(bottom || isLast) || inner,
    left:   outer(left)   || inner,
    right:  outer(right)  || inner,
  }
}

// ── Template examples ──────────────────────────────────────────────

const INCOME_EXAMPLES = [
  { cat: 'Offering',   sub: ''                   },
  { cat: 'Offering',   sub: 'Sunday Offering'    },
  { cat: 'Offering',   sub: 'Christmas Offering' },
  { cat: 'Donations',  sub: ''                   },
]

const EXPENSE_EXAMPLES = [
  { cat: 'Utilities',  sub: ''                   },
  { cat: 'Utilities',  sub: 'Electricity'        },
  { cat: 'Utilities',  sub: 'Water'              },
  { cat: 'Salaries',   sub: ''                   },
]

const BLANK_INPUT_ROWS = 12

// ── Sheet builders ─────────────────────────────────────────────────

function buildInfoSheet(wb) {
  const ws = wb.addWorksheet('How to Use')
  ws.getColumn(1).width = 80

  const lines = [
    { t: 'Category Import Template  —  Church CMS Simple Accounts', big: true },
    { t: '' },
    { t: 'How to fill in this template:', head: true },
    { t: '1.  Open the "Income" sheet — add your income category names.' },
    { t: '2.  Open the "Expenses" sheet — add your expense category names.' },
    { t: '3.  Delete the grey example rows before importing.' },
    { t: '' },
    { t: 'Column A  =  Category (top-level parent)', note: true },
    { t: 'Column B  =  Sub-Category (optional child — leave blank for top-level)', note: true },
    { t: '' },
    { t: 'Example:', head: true },
    { t: '   Category: Utilities    Sub-Category: (blank)      →  creates top-level "Utilities"' },
    { t: '   Category: Utilities    Sub-Category: Electricity  →  creates "Electricity" under "Utilities"' },
    { t: '   Category: Utilities    Sub-Category: Water        →  creates "Water" under "Utilities"' },
    { t: '' },
    { t: 'After filling in the template, save it and use "Import from Excel" in Simple Accounts → Categories.' },
  ]

  for (const { t, big, head, note } of lines) {
    const row  = ws.addRow([t])
    const cell = row.getCell(1)
    row.height = big ? 30 : 18
    if (big)  cell.font = { bold: true, size: 13, color: { argb: HDR },     name: 'Calibri' }
    else if (head) cell.font = { bold: true, size: 10, color: { argb: '374151' }, name: 'Calibri' }
    else if (note) cell.font = { size: 10, color: { argb: '1D4ED8' }, name: 'Calibri' }
    else           cell.font = { size: 10, color: { argb: '6B7280' }, name: 'Calibri' }
  }
}

function buildDataSheet(wb, sheetName, examples) {
  const ws = wb.addWorksheet(sheetName, { views: [{ state: 'frozen', ySplit: 1 }] })
  ws.columns = [
    { header: 'Category',     key: 'cat', width: 38 },
    { header: 'Sub-Category', key: 'sub', width: 38 },
  ]

  // Header row
  ws.getRow(1).height = 26
  for (let ci = 1; ci <= 2; ci++) {
    const cell = ws.getRow(1).getCell(ci)
    cell.font      = { bold: true, color: { argb: WHT }, size: 11, name: 'Calibri' }
    cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: HDR } }
    cell.alignment = { vertical: 'middle', horizontal: 'center' }
    cell.border    = mkBorder(true, false, ci === 1, ci === 2)
  }

  // Example rows (grey italic)
  examples.forEach(({ cat, sub }, i) => {
    const row = ws.addRow({ cat, sub })
    row.height = 20
    for (let ci = 1; ci <= 2; ci++) {
      const cell = row.getCell(ci)
      cell.font      = { italic: true, color: { argb: 'AAAAAA' }, size: 10, name: 'Calibri' }
      cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'F3F4F6' } }
      cell.alignment = { vertical: 'middle', horizontal: 'left' }
      cell.border    = mkBorder(false, false, ci === 1, ci === 2)
    }
  })

  // Blank input rows
  for (let i = 0; i < BLANK_INPUT_ROWS; i++) {
    const row    = ws.addRow({})
    const isLast = i === BLANK_INPUT_ROWS - 1
    row.height   = 20
    for (let ci = 1; ci <= 2; ci++) {
      const cell = row.getCell(ci)
      cell.border = mkBorder(false, isLast, ci === 1, ci === 2)
    }
  }
}

// ── Public: download template ──────────────────────────────────────

export async function downloadCategoryTemplate() {
  const ExcelJS = (await import('exceljs')).default
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Church CMS — Simple Accounts'
  wb.created = new Date()

  buildInfoSheet(wb)
  buildDataSheet(wb, 'Income',   INCOME_EXAMPLES)
  buildDataSheet(wb, 'Expenses', EXPENSE_EXAMPLES)

  const buffer = await wb.xlsx.writeBuffer()
  const blob   = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url    = URL.createObjectURL(blob)
  const a      = document.createElement('a')
  a.href = url
  a.download = 'categories-import-template.xlsx'
  a.click()
  URL.revokeObjectURL(url)
}

// ── Parsing helpers ────────────────────────────────────────────────

function parseDataSheet(ws) {
  const rows = []
  ws.eachRow((row, ri) => {
    if (ri === 1) return
    const cat = String(row.getCell(1).value ?? '').trim()
    const sub = String(row.getCell(2).value ?? '').trim()
    if (cat) rows.push({ category: cat, subCategory: sub || null })
  })
  return rows
}

// ── Public: read & parse uploaded file ────────────────────────────

export async function readAndParseCategoryFile(file) {
  const ExcelJS = (await import('exceljs')).default
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(await file.arrayBuffer())

  const wsIncome  = wb.getWorksheet('Income')
  const wsExpense = wb.getWorksheet('Expenses')

  const errors = []
  if (!wsIncome)  errors.push('Missing "Income" sheet. Please use the downloaded template.')
  if (!wsExpense) errors.push('Missing "Expenses" sheet. Please use the downloaded template.')
  if (errors.length) return { valid: false, errors, income: [], expense: [] }

  const income  = parseDataSheet(wsIncome)
  const expense = parseDataSheet(wsExpense)

  if (!income.length && !expense.length) {
    return {
      valid: false,
      errors: ['No categories found. Fill in the Income or Expenses sheet and delete the grey example rows if needed.'],
      income: [], expense: [],
    }
  }

  return { valid: true, errors: [], income, expense }
}

// ── Public: import parsed rows into Supabase ──────────────────────

export async function importParsedCategories(income, expense) {
  const now = new Date().toISOString()
  let added = 0, skipped = 0

  async function processType(rows, type) {
    if (!rows.length) return

    const { data: existing = [] } = await supabase
      .from('simple_categories')
      .select('id, name, parent_id')
      .eq('type', type)
      .eq('is_active', true)

    const existingParentCount = existing.filter(c => !c.parent_id).length
    const nameToId = {}
    for (const c of existing) nameToId[c.name.toLowerCase()] = c.id

    // Step 1 — unique parent names
    const uniqueParents = [...new Set(rows.map(r => r.category))]
    const newParents    = uniqueParents.filter(n => !nameToId[n.toLowerCase()])
    skipped += uniqueParents.length - newParents.length

    // Insert new parents in one batch
    if (newParents.length) {
      const { data: inserted = [] } = await supabase.from('simple_categories').insert(
        newParents.map((name, i) => ({
          name, type,
          sort_order: (existingParentCount + i + 1) * 10,
          is_active: true, is_default: false, parent_id: null,
          created_at: now, updated_at: now,
        }))
      ).select('id, name')
      for (const p of inserted) { nameToId[p.name.toLowerCase()] = p.id; added++ }
    }

    // Step 2 — sub-categories
    const seen     = new Set(Object.keys(nameToId))
    const toInsert = []

    for (const row of rows.filter(r => r.subCategory)) {
      const parentId = nameToId[row.category.toLowerCase()]
      if (!parentId) continue
      const key = row.subCategory.toLowerCase()
      if (seen.has(key)) { skipped++; continue }
      seen.add(key)
      toInsert.push({
        name: row.subCategory, type, sort_order: 99,
        is_active: true, is_default: false, parent_id: parentId,
        created_at: now, updated_at: now,
      })
    }

    if (toInsert.length) {
      const { data: ins = [] } = await supabase.from('simple_categories').insert(toInsert).select('id')
      added += ins.length
    }
  }

  await processType(income, 'income')
  await processType(expense, 'expense')

  return { added, skipped }
}
