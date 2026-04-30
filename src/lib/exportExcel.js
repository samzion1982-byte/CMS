/* ═══════════════════════════════════════════════════════════════
   exportExcel.js — Formatted Excel export using exceljs
   ═══════════════════════════════════════════════════════════════ */

const HEADER_BG  = '1E3A5F'   // dark navy
const HEADER_FG  = 'FFFFFF'
const ALT_ROW_BG = 'EEF3FA'   // light blue-grey for alternate rows
const BORDER_CLR = 'C5CEE0'

const thin = { style: 'thin', color: { argb: BORDER_CLR } }
const allBorders = { top: thin, left: thin, bottom: thin, right: thin }

export async function exportToExcel(columns, rows, sheetName, fileName) {
  const ExcelJS = (await import('exceljs')).default

  const wb = new ExcelJS.Workbook()
  wb.creator  = 'Church CMS'
  wb.created  = new Date()

  const ws = wb.addWorksheet(sheetName, { views: [{ state: 'frozen', ySplit: 1 }] })

  // ── Column definitions ───────────────────────────────────────
  ws.columns = columns.map(c => ({
    header: c.header,
    key:    c.key,
    width:  c.width || 18,
  }))

  // ── Style header row ─────────────────────────────────────────
  const headerRow = ws.getRow(1)
  headerRow.height = 22
  headerRow.eachCell(cell => {
    cell.font      = { bold: true, color: { argb: HEADER_FG }, size: 11, name: 'Calibri' }
    cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_BG } }
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: false }
    cell.border    = allBorders
  })

  // ── Add data rows ────────────────────────────────────────────
  rows.forEach((row, i) => {
    const dataRow = ws.addRow(row)
    dataRow.height = 18
    const isAlt = i % 2 === 1
    dataRow.eachCell({ includeEmpty: true }, cell => {
      cell.font      = { size: 10, name: 'Calibri' }
      cell.alignment = { vertical: 'middle', wrapText: false }
      cell.border    = allBorders
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
