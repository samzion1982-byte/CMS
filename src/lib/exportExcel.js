/* ═══════════════════════════════════════════════════════════════
   exportExcel.js — Formatted Excel export using exceljs
   ═══════════════════════════════════════════════════════════════ */

const HEADER_BG  = '1E3A5F'
const HEADER_FG  = 'FFFFFF'
const ALT_ROW_BG = 'EEF3FA'
const INNER_CLR  = 'C5CEE0'
const OUTER_CLR  = '1E3A5F'
const SECTION_BG = 'DDE6F5'
const TOTAL_BG   = 'F0F4FB'

const innerThin = { style: 'thin',   color: { argb: INNER_CLR } }
const outerMed  = { style: 'medium', color: { argb: OUTER_CLR } }

function cellBorder(isTop, isBottom, isLeft, isRight) {
  return {
    top:    isTop    ? outerMed : innerThin,
    bottom: isBottom ? outerMed : innerThin,
    left:   isLeft   ? outerMed : innerThin,
    right:  isRight  ? outerMed : innerThin,
  }
}

function mergeAdjacentColumn(ws, dataStart, totalRows, colIdx) {
  const dataEnd = dataStart + totalRows - 1
  let r = dataStart
  while (r <= dataEnd) {
    const v = String(ws.getCell(r, colIdx).value ?? '')
    let end = r
    while (end + 1 <= dataEnd && String(ws.getCell(end + 1, colIdx).value ?? '') === v) end++
    if (end > r) {
      try {
        ws.mergeCells(r, colIdx, end, colIdx)
        const cell = ws.getCell(r, colIdx)
        cell.alignment = { vertical: 'middle', horizontal: 'center' }
        cell.border = {
          top:    r === dataStart ? outerMed : innerThin,
          bottom: end === dataEnd ? outerMed : innerThin,
          left:   colIdx === 1 ? outerMed : innerThin,
          right:  innerThin,
        }
      } catch (err) {
        console.warn('[Excel Export] merge failed for col', colIdx, 'rows', r, 'to', end, err)
      }
    }
    r = end + 1
  }
}

function mergeColumns(ws, dataStart, totalRows, columns) {
  if (!Array.isArray(columns) || totalRows <= 0) return
  const mergeCols = []
  columns.forEach((col, idx) => {
    if (col?.merge || idx === 0) mergeCols.push(idx + 1)
  })

  const dataEnd = dataStart + totalRows - 1
  const rowGroups = []
  let r = dataStart
  while (r <= dataEnd) {
    const value = String(ws.getCell(r, 1).value ?? '').trim()
    let end = r
    while (end + 1 <= dataEnd && String(ws.getCell(end + 1, 1).value ?? '').trim() === value) end++
    rowGroups.push({ start: r, end })
    r = end + 1
  }

  mergeCols.forEach(colIdx => {
    if (colIdx === 1) {
      mergeAdjacentColumn(ws, dataStart, totalRows, colIdx)
      return
    }

    rowGroups.forEach(group => {
      if (group.end > group.start) {
        try {
          ws.mergeCells(group.start, colIdx, group.end, colIdx)
          const cell = ws.getCell(group.start, colIdx)
          cell.alignment = { vertical: 'middle', horizontal: 'center' }
          cell.border = {
            top:    group.start === dataStart ? outerMed : innerThin,
            bottom: group.end === dataEnd ? outerMed : innerThin,
            left:   colIdx === 1 ? outerMed : innerThin,
            right:  innerThin,
          }
        } catch (err) {
          console.warn('[Excel Export] merge failed for col', colIdx, 'rows', group.start, 'to', group.end, err)
        }
      }
    })
  })
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
    const isBold    = !!row._bold
    dataRow.height  = isBold ? 21 : 18
    dataRow.eachCell({ includeEmpty: true }, (cell, colIdx) => {
      const isLeft  = colIdx === 1
      const isRight = colIdx === lastColIdx
      const col = columns[colIdx - 1]
      cell.font      = { size: isBold ? 11 : 10, name: 'Calibri', bold: isBold }
      cell.alignment = { vertical: 'middle', horizontal: col?.align || 'center', wrapText: false }
      cell.border    = isBold
        ? cellBorder(true, true, isLeft, isRight)
        : cellBorder(false, isLastRow, isLeft, isRight)
      if (isBold)      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: TOTAL_BG } }
      else if (isAlt)  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ALT_ROW_BG } }
    })
  })

  if (totalRows > 0) {
    mergeColumns(ws, 2, totalRows, columns)
  }
}

function downloadBuffer(buffer, fileName) {
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href = url
  a.download = fileName
  a.style.display = 'none'
  if (document.body) {
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  } else {
    a.click()
  }
  URL.revokeObjectURL(url)
}

/* Title-block export — titleLines: [{ text, bold?, size?, italic?, bg?, color? }] */
export async function exportToExcelWithTitle(columns, rows, sheetName, fileName, titleLines = []) {
  const ExcelJS = (await import('exceljs')).default
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Church CMS'
  wb.created = new Date()

  const colCount  = columns.length
  const frozenRow = titleLines.length + 1        // freeze below title + header
  const lastTitle = titleLines.length            // index of last title line (1-based row)

  const ws = wb.addWorksheet(sheetName, { views: [{ state: 'frozen', ySplit: frozenRow }] })

  // Column widths (no auto-header; we add header row manually below)
  ws.columns = columns.map(c => {
    const maxContent = Math.max(c.header.length, ...rows.map(r => String(r[c.key] ?? '').length))
    return { key: c.key, width: Math.min(Math.max(maxContent + 6, 14), 60) }
  })

  // ── Title block rows ────────────────────────────────────────────
  titleLines.forEach(({ text, bold, size, italic, bg, color }, idx) => {
    const isFirst = idx === 0
    const isLast  = idx === lastTitle - 1
    const r = ws.addRow([text, ...Array(colCount - 1).fill('')])
    ws.mergeCells(r.number, 1, r.number, colCount)
    const cell    = ws.getCell(r.number, 1)
    cell.value    = text
    cell.font     = { bold: !!bold, italic: !!italic, size: size || 11, name: 'Calibri',
                      color: { argb: color || '111827' } }
    cell.fill     = bg ? { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } } : undefined
    cell.alignment = { horizontal: 'center', vertical: 'middle' }
    cell.border   = {
      top:    isFirst ? outerMed : innerThin,
      bottom: isLast  ? outerMed : innerThin,
      left:   outerMed,
      right:  outerMed,
    }
    // ExcelJS needs the right-edge cell border set explicitly on merged rows
    const rightCell = ws.getCell(r.number, colCount)
    rightCell.border = { ...cell.border }
    r.height      = (size || 11) * 2.2
  })

  // ── Column header row ───────────────────────────────────────────
  const headerRow = ws.addRow(columns.map(c => c.header))
  headerRow.height = 24
  headerRow.eachCell({ includeEmpty: true }, (cell, colIdx) => {
    cell.font      = { bold: true, color: { argb: HEADER_FG }, size: 11, name: 'Calibri' }
    cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_BG } }
    cell.alignment = { vertical: 'middle', horizontal: 'center' }
    cell.border    = cellBorder(true, false, colIdx === 1, colIdx === colCount)
  })

  // ── Data rows ───────────────────────────────────────────────────
  const totalRows = rows.length
  rows.forEach((row, i) => {
    const dataRow   = ws.addRow(columns.map(c => row[c.key] ?? ''))
    const isLastRow = i === totalRows - 1
    const isAlt     = i % 2 === 1
    const isBold    = !!row._bold
    dataRow.height  = isBold ? 21 : 18
    dataRow.eachCell({ includeEmpty: true }, (cell, colIdx) => {
      const col      = columns[colIdx - 1]
      cell.font      = { size: isBold ? 11 : 10, name: 'Calibri', bold: isBold }
      cell.alignment = { vertical: 'middle', horizontal: col?.align || 'center' }
      cell.border    = isBold
        ? cellBorder(true, true, colIdx === 1, colIdx === colCount)
        : cellBorder(false, isLastRow, colIdx === 1, colIdx === colCount)
      if (col?.numFmt) cell.numFmt = col.numFmt
      if (isBold)     cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: TOTAL_BG } }
      else if (isAlt) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ALT_ROW_BG } }
    })
  })

  if (totalRows > 0) {
    try {
      mergeColumns(ws, lastTitle + 2, totalRows, columns)
    } catch (err) {
      console.warn('[Excel Export] mergeColumns failed', err)
    }
  }

  const buffer = await wb.xlsx.writeBuffer()
  downloadBuffer(buffer, fileName)
  return buffer
}

// ─────────────────────────────────────────────────────────────────
//  Multi-sheet export with per-sheet title blocks
//
//  sheetConfigs: [{ name, columns, rows, titleLines }]
//  Column schema: { header, key, align?, numFmt?, merge? }
// ─────────────────────────────────────────────────────────────────
export async function exportMultiSheetWithTitle(sheetConfigs, fileName) {
  const ExcelJS = (await import('exceljs')).default
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Church CMS'
  wb.created = new Date()

  for (const { name, columns, rows, titleLines = [], tabColor } of sheetConfigs) {
    const colCount  = columns.length
    const hasGroups = columns.some(c => c.group)
    const frozenRow = titleLines.length + 1

    const ws = wb.addWorksheet(name, { views: [{ state: 'frozen', ySplit: frozenRow }] })
    if (tabColor) ws.properties.tabColor = { argb: tabColor }

    // Column widths — auto-fit using formatted value length for numeric columns
    ws.columns = columns.map(c => {
      const fmtLen = v =>
        (c.numFmt && typeof v === 'number')
          ? Number(v).toLocaleString('en-IN', { maximumFractionDigits: 0 }).length
          : String(v ?? '').length
      const maxContent = Math.max(c.header.length, ...rows.map(r => fmtLen(r[c.key])))
      return { key: c.key, width: Math.min(maxContent + 2, 50) }
    })

    // Title block rows
    titleLines.forEach(({ text, bold, size, italic, bg, color }, idx) => {
      const isFirst = idx === 0
      const isLast  = idx === titleLines.length - 1
      const r = ws.addRow([text, ...Array(colCount - 1).fill('')])
      ws.mergeCells(r.number, 1, r.number, colCount)
      const cell    = ws.getCell(r.number, 1)
      cell.value    = text
      cell.font     = { bold: !!bold, italic: !!italic, size: size || 11, name: 'Calibri', color: { argb: color || '111827' } }
      cell.fill     = bg ? { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } } : undefined
      cell.alignment = { horizontal: 'center', vertical: 'middle' }
      cell.border   = {
        top:    isFirst ? outerMed : innerThin,
        bottom: isLast  ? outerMed : innerThin,
        left:   outerMed,
        right:  outerMed,
      }
      const rightCell = ws.getCell(r.number, colCount)
      rightCell.border = { ...cell.border }
      r.height = (size || 11) * 2.2
    })

    // Column grouping (collapse/expand) — applied after ws.columns, before rows
    if (hasGroups) {
      columns.forEach((col, i) => {
        if (col.group) ws.getColumn(i + 1).outlineLevel = 1
      })
    }

    // Column header row
    const headerRow = ws.addRow(columns.map(c => c.header))
    headerRow.height = 22
    headerRow.eachCell({ includeEmpty: true }, (cell, colIdx) => {
      const col = columns[colIdx - 1]
      const bg  = col?.headerBg || HEADER_BG
      const fg  = col?.headerFg || HEADER_FG
      cell.font      = { bold: true, color: { argb: fg }, size: 10, name: 'Calibri' }
      cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } }
      cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
      cell.border    = cellBorder(true, false, colIdx === 1, colIdx === colCount)
    })

    // Data rows
    const totalRows = rows.length
    rows.forEach((row, i) => {
      const dataRow   = ws.addRow(columns.map(c => row[c.key] ?? ''))
      const isLastRow = i === totalRows - 1
      const isAlt     = i % 2 === 1
      const isBold    = !!row._bold
      dataRow.height  = isBold ? 21 : 16
      dataRow.eachCell({ includeEmpty: true }, (cell, colIdx) => {
        const col = columns[colIdx - 1]
        cell.font      = { size: isBold ? 11 : 9.5, name: 'Calibri', bold: isBold }
        cell.alignment = { vertical: 'middle', horizontal: col?.align || 'center', wrapText: false }
        cell.border    = isBold
          ? cellBorder(true, true, colIdx === 1, colIdx === colCount)
          : cellBorder(false, isLastRow, colIdx === 1, colIdx === colCount)
        if (isBold)     cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: TOTAL_BG } }
        else if (isAlt) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ALT_ROW_BG } }
        // Apply numFmt for amount columns
        if (col?.numFmt) {
          const n = parseFloat(String(cell.value ?? '').replace(/,/g, ''))
          if (!isNaN(n)) { cell.value = n; cell.numFmt = col.numFmt }
        }
      })
    })

    if (totalRows > 0) {
      try {
        mergeColumns(ws, titleLines.length + 2, totalRows, columns)
      } catch (err) {
        console.warn('[Excel Export] mergeColumns failed', err)
      }
    }
  }

  downloadBuffer(await wb.xlsx.writeBuffer(), fileName)
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

// ─────────────────────────────────────────────────────────────────
//  Two-column financial statement export (R&P, I&E, Balance Sheet)
//
//  Row schema for leftRows / rightRows:
//    { label, amount?, detail?, bold?, section?, total?, indent?, indent2?, italic? }
//  where:
//    amount  = main right-aligned amount (outer column)
//    detail  = secondary right-aligned amount (inner/detail column, for sub-ledger lines)
//    section = section header row (different background)
//    total   = grand total row
// ─────────────────────────────────────────────────────────────────
export async function exportTwoColumn(
  leftRows, rightRows,
  leftLabel, rightLabel,
  title, fileName,
  { leftTotal, rightTotal } = {},
  titleLines = []
) {
  const ExcelJS = (await import('exceljs')).default
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Church CMS'
  wb.created = new Date()
  const ws = wb.addWorksheet(title)

  // 7 columns: LeftLabel | LeftDetail | LeftAmt | Spacer | RightLabel | RightDetail | RightAmt
  ws.columns = [
    { key: 'a', width: 40 }, // Left label
    { key: 'b', width: 15 }, // Left detail (inner)
    { key: 'c', width: 17 }, // Left outer amount
    { key: 'd', width: 2  }, // Spacer
    { key: 'e', width: 40 }, // Right label
    { key: 'f', width: 15 }, // Right detail (inner)
    { key: 'g', width: 17 }, // Right outer amount
  ]

  // ── Entity title block rows ────────────────────────────────────
  titleLines.forEach(({ text, bold, size, italic, bg, color }, idx) => {
    const isFirst = idx === 0
    const isLast  = idx === titleLines.length - 1
    const r = ws.addRow([text, '', '', '', '', '', ''])
    ws.mergeCells(r.number, 1, r.number, 7)
    const cell    = ws.getCell(r.number, 1)
    cell.value    = text
    cell.font     = { bold: !!bold, italic: !!italic, size: size || 11, name: 'Calibri', color: { argb: color || '111827' } }
    cell.fill     = bg ? { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } } : undefined
    cell.alignment = { horizontal: 'center', vertical: 'middle' }
    cell.border   = { top: isFirst ? outerMed : innerThin, bottom: isLast ? outerMed : innerThin, left: outerMed, right: outerMed }
    r.height      = (size || 11) * 2.2
  })

  // ── Report title row ───────────────────────────────────────────
  const titleRowNum = titleLines.length + 1
  ws.addRow(['', '', '', '', '', '', ''])
  ws.mergeCells(`A${titleRowNum}:G${titleRowNum}`)
  const tc = ws.getCell(`A${titleRowNum}`)
  tc.value = title
  tc.font      = { bold: true, size: 13, name: 'Calibri', color: { argb: HEADER_FG } }
  tc.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_BG } }
  tc.alignment = { horizontal: 'center', vertical: 'middle' }
  tc.border    = { top: outerMed, bottom: outerMed, left: outerMed, right: outerMed }
  ws.getRow(titleRowNum).height = 28

  // ── Column headers ─────────────────────────────────────────────
  const hdrRowNum = titleLines.length + 2
  ws.addRow([leftLabel, 'DETAIL', 'AMOUNT', '', rightLabel, 'DETAIL', 'AMOUNT'])
  const hr = ws.getRow(hdrRowNum)
  hr.height = 22
  ;[1, 2, 3, 5, 6, 7].forEach(c => {
    const cell = hr.getCell(c)
    cell.font      = { bold: true, color: { argb: HEADER_FG }, size: 10, name: 'Calibri' }
    cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_BG } }
    cell.alignment = { vertical: 'middle', horizontal: [2,3,6,7].includes(c) ? 'right' : 'left' }
    cell.border    = {
      top: outerMed, bottom: outerMed,
      left:  c === 1 ? outerMed : innerThin,
      right: c === 7 ? outerMed : innerThin,
    }
  })

  // ── Data rows ──────────────────────────────────────────────────
  const n = Math.max(leftRows.length, rightRows.length)

  function styleDataRow(rowNum, l, r, isLast) {
    const exRow = ws.getRow(rowNum)
    exRow.height = 18
    ;[1, 2, 3, 5, 6, 7].forEach(c => {
      const cell   = exRow.getCell(c)
      const isLeft = c <= 3
      const d      = isLeft ? l : r    // row descriptor for this side
      // Normalise: R&P uses outer/inner; I&E/BS use amount
      const amt    = isLeft ? (l.outer ?? l.amount ?? null) : (r.outer ?? r.amount ?? null)
      const det    = isLeft ? (l.inner ?? l.detail ?? null) : (r.inner ?? r.detail ?? null)

      const isLabelCol  = c === 1 || c === 5
      const isDetailCol = c === 2 || c === 6
      const isAmtCol    = c === 3 || c === 7

      // Font
      cell.font = {
        bold: !!(d.bold || d.section || d.total),
        italic: !!d.italic,
        size: 10,
        name: 'Calibri',
      }

      // Fill
      if (d.section || d.muted) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: SECTION_BG } }
      } else if (d.total) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: TOTAL_BG } }
      }

      // Alignment
      if (isLabelCol) {
        const indent = d.indent2 ? 4 : d.indent ? 2 : 0
        cell.alignment = { horizontal: 'left', vertical: 'middle', indent }
      } else {
        cell.alignment = { horizontal: 'right', vertical: 'middle' }
      }

      // Value
      if (isDetailCol) cell.value = (det != null && det !== '') ? Number(det) : null
      if (isAmtCol)    cell.value = (amt != null && amt !== '') ? Number(amt) : null

      // Number format
      if ((isDetailCol || isAmtCol) && cell.value != null) {
        cell.numFmt = '#,##0.00'
      }

      // Border — medium on outer edges, thin inside
      cell.border = {
        top:    innerThin,
        bottom: isLast ? outerMed : innerThin,
        left:   c === 1 ? outerMed : innerThin,
        right:  c === 7 ? outerMed : innerThin,
      }
    })
  }

  const dataStartRow = titleLines.length + 3
  for (let i = 0; i < n; i++) {
    const l = leftRows[i]  || { label: '' }
    const r = rightRows[i] || { label: '' }
    // Normalise: R&P uses outer/inner; I&E/BS use amount
    const la = l.outer ?? l.amount ?? null
    const ld = l.inner ?? l.detail ?? null
    const ra = r.outer ?? r.amount ?? null
    const rd = r.inner ?? r.detail ?? null

    ws.addRow([l.label || '', ld ?? '', la ?? '', '', r.label || '', rd ?? '', ra ?? ''])
    styleDataRow(dataStartRow + i, l, r, i === n - 1 && leftTotal == null)
  }

  // ── TOTAL row ──────────────────────────────────────────────────
  if (leftTotal != null || rightTotal != null) {
    const totRowNum = n + titleLines.length + 3
    ws.addRow(['TOTAL', '', leftTotal ?? '', '', 'TOTAL', '', rightTotal ?? ''])
    const tr2 = ws.getRow(totRowNum)
    tr2.height = 20
    ;[1, 2, 3, 5, 6, 7].forEach(c => {
      const cell = tr2.getCell(c)
      cell.font  = { bold: true, size: 11, name: 'Calibri' }
      cell.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_BG } }
      cell.font.color = { argb: HEADER_FG }
      if (c === 3 || c === 7) {
        cell.alignment = { horizontal: 'right', vertical: 'middle' }
        if (cell.value != null && cell.value !== '') {
          cell.value  = Number(cell.value)
          cell.numFmt = '#,##0.00'
        }
      } else {
        cell.alignment = { horizontal: c === 1 || c === 5 ? 'left' : 'right', vertical: 'middle' }
      }
      cell.border = {
        top: outerMed, bottom: outerMed,
        left:  c === 1 ? outerMed : innerThin,
        right: c === 7 ? outerMed : innerThin,
      }
    })
  }

  downloadBuffer(await wb.xlsx.writeBuffer(), fileName)
}
