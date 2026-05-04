/* ═══════════════════════════════════════════════════════════════
   exportStatementPDF.js — Member Statement PDF (A4 Landscape)
   ═══════════════════════════════════════════════════════════════ */

// ── local helpers ────────────────────────────────────────────────

function fmtDate(s) {
  if (!s) return ''
  const [y, m, d] = s.split('-')
  const mon = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  return `${d}-${mon[+m - 1]}-${y}`
}

function numFmt(n) {
  if (n == null || n === '') return ''
  const v = Math.round(parseFloat(n) || 0)
  return v === 0 ? '' : v.toLocaleString('en-IN')
}

// ── colour helpers ───────────────────────────────────────────────

const NAVY   = [30,  58,  95]
const NAVY2  = [44,  82, 130]
const YELLOW = [255, 249, 157]
const YLIGHT = [255, 253, 231]
const WHITE  = [255, 255, 255]
const GRAY1  = [240, 242, 245]

// ── main export ──────────────────────────────────────────────────

export async function exportStatementPDF({
  member, church, categories,
  allReceipts, receiptsByFY, fyList, fyTotals, overallTotals,
  declaration, declItems, declFY,
}) {
  const { jsPDF } = await import('jspdf')

  // ── page setup ──────────────────────────────────────────────
  const doc  = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  const PW   = 297
  const PH   = 210
  const ML   = 10
  const MR   = 10
  const MT   = 10
  const FOOT = 8          // footer height reserved at bottom
  const UW   = PW - ML - MR   // 277 mm usable width

  // ── column widths ────────────────────────────────────────────
  const N    = categories.length
  const cDate = 18, cNo = 27, cYear = 13, cMon = 14, cMos = 10, cTot = 17
  const fixW  = cDate + cNo + cYear + cMon + cMos + cTot   // 99 mm
  const catW  = N > 0 ? (UW - fixW) / N : 0               // remaining / N

  // col definitions
  const COLS = [
    { label: 'Receipt\nDate',     w: cDate, align: 'C' },
    { label: 'Receipt No',        w: cNo,   align: 'L' },
    { label: 'Year',              w: cYear, align: 'C' },
    { label: 'Month',             w: cMon,  align: 'C' },
    { label: 'No of\nMonths',     w: cMos,  align: 'C' },
    ...categories.map(c => ({ label: c.name, w: catW, align: 'R', catId: c.id })),
    { label: 'Total',             w: cTot,  align: 'R' },
  ]

  let y = MT
  let pageNum = 1

  // ── helpers ─────────────────────────────────────────────────

  const setColor = (rgb) => doc.setTextColor(...rgb)
  const setFill  = (rgb) => doc.setFillColor(...rgb)

  function txt(text, x, ty, opts = {}) {
    doc.text(String(text ?? ''), x, ty, opts)
  }

  function hline(ty, lw = 0.3, color = [180, 190, 200]) {
    doc.setDrawColor(...color)
    doc.setLineWidth(lw)
    doc.line(ML, ty, PW - MR, ty)
  }

  // Pre-compute wrapped lines for every column header (font must be set before calling)
  function getColHeaderLines(col) {
    doc.setFontSize(5.5)
    // First split by explicit \n, then wrap each piece to cell width
    const pieces = col.label.split('\n')
    const lines  = pieces.flatMap(p => doc.splitTextToSize(p, col.w - 1.5))
    return lines
  }

  // Height of the column header row — enough for the most-wrapped label
  function colHeaderH() {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(5.5)
    const maxLines = Math.max(...COLS.map(c => getColHeaderLines(c).length), 1)
    return maxLines * 3.2 + 4   // 3.2 mm per line + 4 mm padding
  }

  function drawColHeaders(startY) {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(5.5)
    const H = colHeaderH()
    setFill(NAVY)
    doc.rect(ML, startY, UW, H, 'F')
    setColor(WHITE)
    let x = ML
    for (const col of COLS) {
      const lines = getColHeaderLines(col)
      const totalTextH = lines.length * 3.2
      const topPad     = (H - totalTextH) / 2 + 2.5
      lines.forEach((line, i) => {
        txt(line, x + col.w / 2, startY + topPad + i * 3.2, { align: 'center' })
      })
      x += col.w
    }
    return startY + H
  }

  function checkPage(needed) {
    if (y + needed > PH - FOOT) {
      drawFooter()
      doc.addPage()
      pageNum++
      y = MT
      drawContinuationHeader()
      y = drawColHeaders(y)
    }
  }

  function drawFooter() {
    const fy = PH - 4
    doc.setFont('helvetica', 'italic')
    doc.setFontSize(6)
    setColor([140, 140, 140])
    const now = new Date()
    const ds  = now.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
    const ts  = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
    txt(`Generated on ${ds} at ${ts}`, ML, fy)
    txt(`Page ${pageNum}`, PW - MR, fy, { align: 'right' })
  }

  function drawContinuationHeader() {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7)
    setColor(NAVY)
    txt(`${member.member_id}  |  ${member.member_name}  —  Members Subscription Record (contd.)`, ML, y + 5)
    y += 8
    hline(y, 0.4, NAVY)
    y += 3
  }

  // ════════════════════════════════════════════════════════════
  // PAGE 1 — Church header + member info + declaration + table
  // ════════════════════════════════════════════════════════════

  // ── church header ─────────────────────────────────────────

  // Diocese
  if (church?.diocese) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    setColor([100, 100, 100])
    txt(church.diocese, PW / 2, y + 5, { align: 'center' })
    y += 6
  }

  // Church name
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(15)
  setColor(NAVY)
  txt(church?.church_name || 'Church', PW / 2, y + 6, { align: 'center' })
  y += 8

  // Address line
  const addrLine = [church?.address, church?.city].filter(Boolean).join(', ')
  if (addrLine) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    setColor([80, 80, 80])
    txt(addrLine, PW / 2, y + 4, { align: 'center' })
    y += 6
  }

  // Title
  y += 1
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  setColor([180, 0, 0])
  txt('Members Subscription Record', PW / 2, y + 5, { align: 'center' })
  y += 7

  hline(y, 0.6, NAVY)
  y += 5

  // ── member info grid ──────────────────────────────────────

  const LW  = 22   // label column width
  const COL2 = ML + UW / 2 + 5  // second column start

  function infoField(lx, vx, label, value, ty) {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7)
    setColor([90, 90, 90])
    txt(label, lx, ty)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    setColor([10, 10, 10])
    txt(value || '—', vx, ty)
  }

  infoField(ML,   ML   + LW, 'Member ID',   member.member_id,   y + 4)
  infoField(COL2, COL2 + LW, 'Member Name', member.member_name, y + 4)
  y += 6.5

  const addrVal = [member.address_street, member.city].filter(Boolean).join(', ')
  infoField(ML,   ML   + LW, 'WhatsApp', member.mobile || '—', y + 4)
  infoField(COL2, COL2 + LW, 'Address',  addrVal,              y + 4)
  y += 7

  hline(y, 0.3, [190, 200, 215])
  y += 4

  // ── declaration rows ──────────────────────────────────────

  // Calculate declaration row height to fit wrapped category names
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(5.5)
  const declMaxLines = categories.length > 0
    ? Math.max(...categories.map(c => doc.splitTextToSize(c.name, catW - 1.5).length))
    : 1
  const DR = Math.max(8, declMaxLines * 3.2 + 4)

  const mergedW = cDate + cNo + cYear

  // Row 1: declaration labels (yellow)
  setFill(YELLOW)
  doc.rect(ML, y, UW, DR, 'F')
  hline(y + DR, 0.2, [210, 190, 0])

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(5.5)
  setColor([80, 60, 0])

  // First merged cell: FY label
  doc.setFontSize(6.5)
  txt(`Declaration — FY ${declFY}`, ML + 2, y + DR / 2 + 2)

  doc.setFontSize(5.5)
  let dx = ML + mergedW

  // "Declared Income" label
  const diLines = doc.splitTextToSize('Declared Income', cMon - 1.5)
  const diTopPad = (DR - diLines.length * 3.2) / 2 + 2.5
  diLines.forEach((l, i) => txt(l, dx + cMon / 2, y + diTopPad + i * 3.2, { align: 'center' }))
  dx += cMon

  // "Decl. %" label
  txt('Decl. %', dx + cMos / 2, y + DR / 2 + 2, { align: 'center' })
  dx += cMos

  // Category name labels (wrapped)
  categories.forEach(c => {
    const lines = doc.splitTextToSize(c.name, catW - 1.5)
    const topPad = (DR - lines.length * 3.2) / 2 + 2.5
    lines.forEach((l, i) => txt(l, dx + catW / 2, y + topPad + i * 3.2, { align: 'center' }))
    dx += catW
  })
  txt('Total', dx + cTot / 2, y + DR / 2 + 2, { align: 'center' })
  y += DR

  // Row 2: declaration values (light yellow)
  setFill(YLIGHT)
  doc.rect(ML, y, UW, DR, 'F')
  hline(y + DR, 0.5, [200, 170, 0])

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(6.5)
  setColor([30, 30, 30])

  const declDateLabel = declaration
    ? `${fmtDate(declaration.declaration_date)}  ·  ${declaration.income_category || ''}`
    : 'No declaration for this FY'
  txt(declDateLabel, ML + 2, y + 4)

  dx = ML + mergedW
  if (declaration?.declared_income) {
    doc.setFont('helvetica', 'bold')
    txt(numFmt(declaration.declared_income), dx + cMon - 1, y + 4, { align: 'right' })
    doc.setFont('helvetica', 'normal')
  }
  dx += cMon
  if (declaration?.percentage) {
    txt(`${declaration.percentage}%`, dx + cMos / 2, y + 4, { align: 'center' })
  }
  dx += cMos

  let declTot = 0
  categories.forEach(c => {
    const di = declItems.find(d => d.category_id === c.id)
    if (di?.pledged) {
      doc.setFont('helvetica', 'bold')
      txt(numFmt(di.pledged), dx + catW - 1, y + 4, { align: 'right' })
      doc.setFont('helvetica', 'normal')
      declTot += di.pledged
    }
    dx += catW
  })
  if (declTot > 0) {
    doc.setFont('helvetica', 'bold')
    txt(numFmt(declTot), dx + cTot - 1, y + 4, { align: 'right' })
  }
  y += DR

  // ── table column headers ──────────────────────────────────
  y = drawColHeaders(y)

  // ════════════════════════════════════════════════════════════
  // TABLE BODY — FY groups + receipt rows
  // ════════════════════════════════════════════════════════════

  const RH  = 5.5   // receipt row height
  const FYH = 5.5   // FY subtotal row height

  for (const fy of fyList) {
    const fyRecs              = receiptsByFY[fy]
    const { cat: fyCat, grand, count } = fyTotals[fy]

    checkPage(FYH + RH)   // keep FY row + at least one receipt on same page

    // ── FY subtotal row ───────────────────────────────────
    setFill(NAVY2)
    doc.rect(ML, y, UW, FYH, 'F')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(6.5)
    setColor(WHITE)
    txt(`FY ${fy}  —  ${count} receipt${count !== 1 ? 's' : ''}`, ML + 2, y + 3.8)

    let fx = ML + cDate + cNo + cYear + cMon + cMos
    categories.forEach(c => {
      if (fyCat[c.id]) txt(numFmt(fyCat[c.id]), fx + catW - 1, y + 3.8, { align: 'right' })
      fx += catW
    })
    txt(numFmt(grand), fx + cTot - 1, y + 3.8, { align: 'right' })
    y += FYH

    // ── receipt rows ──────────────────────────────────────
    fyRecs.forEach((r, i) => {
      checkPage(RH)

      const itemMap = {}
      ;(r.receipt_items || []).forEach(it => { itemMap[it.category_id] = it })
      const mos = (r.receipt_items || []).find(it => (it.months || 0) > 0)?.months || ''

      // Alternating row fill
      if (i % 2 === 1) {
        setFill(GRAY1)
        doc.rect(ML, y, UW, RH, 'F')
      }
      // Bottom border
      doc.setDrawColor(220, 225, 235)
      doc.setLineWidth(0.1)
      doc.line(ML, y + RH, PW - MR, y + RH)

      doc.setFont('helvetica', 'normal')
      doc.setFontSize(6)
      setColor([25, 25, 25])

      let x = ML
      txt(fmtDate(r.receipt_date),  x + cDate / 2,      y + 3.5, { align: 'center' }); x += cDate
      txt(r.receipt_number || '',   x + 1,               y + 3.5);                      x += cNo
      txt(r.financial_year || '',   x + cYear / 2,       y + 3.5, { align: 'center' }); x += cYear
      txt(r.month_paid || '',       x + cMon / 2,        y + 3.5, { align: 'center' }); x += cMon
      txt(String(mos),              x + cMos / 2,        y + 3.5, { align: 'center' }); x += cMos

      categories.forEach(c => {
        const it = itemMap[c.id]
        if (it) txt(numFmt(it.total), x + catW - 1, y + 3.5, { align: 'right' })
        x += catW
      })

      doc.setFont('helvetica', 'bold')
      txt(numFmt(r.grand_total), x + cTot - 1, y + 3.5, { align: 'right' })

      y += RH
    })
  }

  // ── grand total row ───────────────────────────────────────
  checkPage(8)
  const GTH = 7
  setFill(NAVY)
  doc.rect(ML, y, UW, GTH, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7)
  setColor(WHITE)
  txt('Grand Total', ML + 2, y + 4.8)

  let gx = ML + cDate + cNo + cYear + cMon + cMos
  categories.forEach(c => {
    if (overallTotals.cat[c.id]) txt(numFmt(overallTotals.cat[c.id]), gx + catW - 1, y + 4.8, { align: 'right' })
    gx += catW
  })
  doc.setFontSize(8)
  setColor([110, 231, 160])
  txt(`Rs. ${Math.round(overallTotals.grand).toLocaleString('en-IN')}`, gx + cTot - 1, y + 4.8, { align: 'right' })
  y += GTH

  // ── footer on last page ───────────────────────────────────
  drawFooter()

  // ── save ─────────────────────────────────────────────────
  const safe = (member.member_name || '').replace(/[^a-z0-9]/gi, '_').toUpperCase()
  doc.save(`Statement_${member.member_id}_${safe}.pdf`)
}
