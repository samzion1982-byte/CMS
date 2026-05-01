/* ═══════════════════════════════════════════════════════════════
   exportExcel.js — Formatted Excel export using exceljs
   ═══════════════════════════════════════════════════════════════ */

const HEADER_BG  = '1E3A5F'
const HEADER_FG  = 'FFFFFF'
const ALT_ROW_BG = 'EEF3FA'
const INNER_CLR  = 'C5CEE0'
const OUTER_CLR  = '1E3A5F'

const innerThin  = { style: 'thin',   color: { argb: INNER_CLR } }
const outerMed   = { style: 'medium', color: { argb: OUTER_CLR } }

function cellBorder(isTop, isBottom, isLeft, isRight) {
  return {
    top:    isTop    ? outerMed : innerThin,
    bottom: isBottom ? outerMed : innerThin,
    left:   isLeft   ? outerMed : innerThin,
    right:  isRight  ? outerMed : innerThin,
  }
}

function populateSheet(ws, columns, rows) {
  const totalRows  = rows.length
  const lastColIdx = columns.length

  ws.columns = columns.map(c => {
    const contentLengths = rows.map(r => String(r[c.key] ?? '').length)
    const maxContent = Math.max(c.header.length, ...contentLengths)
    return { header: c.header, key: c.key, width: Math.min(Math.max(maxContent + 6, 14), 60) }
  })

  const headerRow = ws.getRow(1)
  headerRow.height = 24
  headerRow.eachCell({ includeEmpty: true }, (cell, colIdx) => {
    const isLeft  = colIdx === 1
    const isRight = colIdx === lastColIdx
    cell.font      = { bold: true, color: { argb: HEADER_FG }, size: 11, name: 'Calibri' }
    cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_BG } }
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: false }
    cell.border    = cellBorder(true, false, isLeft, isRight)
  })

  rows.forEach((row, i) => {
    const dataRow   = ws.addRow(row)
    const isLastRow = i === totalRows - 1
    const isAlt     = i % 2 === 1
    dataRow.height  = 18
    dataRow.eachCell({ includeEmpty: true }, (cell, colIdx) => {
      const isLeft  = colIdx === 1
      const isRight = colIdx === lastColIdx
      const col = columns[colIdx - 1]
      cell.font      = { size: 10, name: 'Calibri' }
      cell.alignment = { vertical: 'middle', horizontal: col?.align || 'center', wrapText: false }
      cell.border    = cellBorder(false, isLastRow, isLeft, isRight)
      if (isAlt) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ALT_ROW_BG } }
    })
  })
}

function downloadBuffer(buffer, fileName) {
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href = url; a.download = fileName; a.click()
  URL.revokeObjectURL(url)
}

export async function exportToExcel(columns, rows, sheetName, fileName) {
  const ExcelJS = (await import('exceljs')).default
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Church CMS'
  wb.created = new Date()
  const ws = wb.addWorksheet(sheetName, { views: [{ state: 'frozen', ySplit: 1 }] })
  populateSheet(ws, columns, rows)
  downloadBuffer(await wb.xlsx.writeBuffer(), fileName)
}

// sheets: [{ name: string, rows: object[] }]
export async function exportToExcelMultiSheet(columns, sheets, fileName) {
  const ExcelJS = (await import('exceljs')).default
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Church CMS'
  wb.created = new Date()
  for (const sheet of sheets) {
    const ws = wb.addWorksheet(sheet.name, { views: [{ state: 'frozen', ySplit: 1 }] })
    populateSheet(ws, columns, sheet.rows)
  }
  downloadBuffer(await wb.xlsx.writeBuffer(), fileName)
}
