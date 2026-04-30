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

export async function exportToExcel(columns, rows, sheetName, fileName) {
  const ExcelJS = (await import('exceljs')).default

  const wb = new ExcelJS.Workbook()
  wb.creator = 'Church CMS'
  wb.created = new Date()

  const ws = wb.addWorksheet(sheetName, { views: [{ state: 'frozen', ySplit: 1 }] })

  // ── Column definitions with auto-fit width ──────────────────
  ws.columns = columns.map(c => {
    const contentLengths = rows.map(r => String(r[c.key] ?? '').length)
    const maxContent = Math.max(c.header.length, ...contentLengths)
    return {
      header: c.header,
      key:    c.key,
      width:  Math.min(Math.max(maxContent + 6, 14), 60), // +6 padding, min 14, max 60
    }
  })

  const totalCols  = columns.length
  const totalRows  = rows.length        // data rows only
  const lastColIdx = totalCols          // 1-based

  // ── Header row ───────────────────────────────────────────────
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

  // ── Data rows ────────────────────────────────────────────────
  rows.forEach((row, i) => {
    const dataRow    = ws.addRow(row)
    const excelRowN  = i + 2                    // row 1 = header
    const isLastRow  = i === totalRows - 1
    const isAlt      = i % 2 === 1
    dataRow.height   = 18
    dataRow.eachCell({ includeEmpty: true }, (cell, colIdx) => {
      const isLeft  = colIdx === 1
      const isRight = colIdx === lastColIdx
      cell.font      = { size: 10, name: 'Calibri' }
      cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: false }
      cell.border    = cellBorder(false, isLastRow, isLeft, isRight)
      if (isAlt) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ALT_ROW_BG } }
      }
    })
  })

  // ── Download ─────────────────────────────────────────────────
  const buffer = await wb.xlsx.writeBuffer()
  const blob   = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url    = URL.createObjectURL(blob)
  const a      = document.createElement('a')
  a.href       = url
  a.download   = fileName
  a.click()
  URL.revokeObjectURL(url)
}
