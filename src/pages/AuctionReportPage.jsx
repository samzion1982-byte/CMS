/* ═══════════════════════════════════════════════════════════════
   AuctionReportPage.jsx
   ═══════════════════════════════════════════════════════════════ */

import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase, getChurch } from '../lib/supabase'
import { useToast } from '../lib/toast'
import { exportToExcelWithTitle } from '../lib/exportExcel'
import {
  Gavel, Upload, RefreshCw, Loader2, FileSpreadsheet,
  FileText, CheckCircle, XCircle, AlertCircle, Info, ChevronDown,
} from 'lucide-react'

// ── helpers ──────────────────────────────────────────────────────

function getFY(dateStr) {
  const d = dateStr ? new Date(dateStr + 'T00:00:00') : new Date()
  const m = d.getMonth() + 1
  const y = d.getFullYear()
  return m >= 4 ? `${y}-${String(y + 1).slice(2)}` : `${y - 1}-${String(y).slice(2)}`
}

function fyOptions() {
  const seen = new Set(), opts = []
  for (let d = -2; d <= 1; d++) {
    const y = new Date().getFullYear() + d
    const m = new Date().getMonth() + 1
    const fy = m >= 4 ? `${y}-${String(y + 1).slice(2)}` : `${y - 1}-${String(y).slice(2)}`
    if (!seen.has(fy)) { seen.add(fy); opts.push(fy) }
  }
  return opts.sort().reverse()
}

function fmtAmt(n) {
  if (n == null || n === '') return '—'
  const v = Number(n)
  if (v === 0) return '—'
  return '₹' + v.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fmtAmtZero(n) {
  return '₹' + (Number(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function parseNum(v) {
  if (v == null || v === '') return 0
  const n = parseFloat(String(v).replace(/,/g, ''))
  return isNaN(n) ? 0 : n
}

const FYS = fyOptions()

// ── Excel / CSV file parser ───────────────────────────────────────

async function parseAuctionFile(file) {
  const xlsxMod = await import('xlsx')
  const { read, utils } = xlsxMod.default ?? xlsxMod
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Failed to read file'))
    reader.onload = (e) => {
      try {
        const wb   = read(e.target.result, { type: 'array' })
        // prefer sheet named "Auction Payment Tracker", else first sheet
        const sName = wb.SheetNames.find(n =>
          n.toLowerCase().includes('auction') || n.toLowerCase().includes('payment')
        ) || wb.SheetNames[0]
        const ws   = wb.Sheets[sName]
        const rows = utils.sheet_to_json(ws, { header: 1, defval: '' })

        // Find header row (first row where col A looks like "member id")
        let headerIdx = -1
        for (let i = 0; i < Math.min(rows.length, 5); i++) {
          const first = String(rows[i][0] || '').toLowerCase()
          if (first.includes('member') || first.includes('id')) {
            headerIdx = i
            break
          }
        }
        if (headerIdx === -1) headerIdx = 0

        const headers = rows[headerIdx].map(h => String(h).toLowerCase().trim())

        // map columns flexibly
        const idxOf = (...keys) => {
          for (const k of keys) {
            const i = headers.findIndex(h => h.includes(k))
            if (i >= 0) return i
          }
          return -1
        }

        const ci = {
          memberId:            idxOf('member id', 'memberid', 'id'),
          memberName:          idxOf('member name', 'name'),
          previousPending:     idxOf('previous pending', 'prev', 'previous'),
          currentYearPurchase: idxOf('current year', 'current', 'purchase'),
          total:               idxOf('total'),
        }

        if (ci.memberId === -1)   throw new Error('Column "Member ID" not found in file')
        if (ci.memberName === -1) throw new Error('Column "Member Name" not found in file')

        const data = []
        for (let i = headerIdx + 1; i < rows.length; i++) {
          const row = rows[i]
          const memberId = String(row[ci.memberId] || '').trim()
          if (!memberId) continue
          const memberName          = String(row[ci.memberName] || '').trim()
          const previousPending     = ci.previousPending     >= 0 ? parseNum(row[ci.previousPending])     : 0
          const currentYearPurchase = ci.currentYearPurchase >= 0 ? parseNum(row[ci.currentYearPurchase]) : 0
          // If total column exists use it; otherwise compute
          const total = ci.total >= 0
            ? parseNum(row[ci.total])
            : previousPending + currentYearPurchase
          data.push({ member_id: memberId, member_name: memberName, previous_pending: previousPending, current_year_purchase: currentYearPurchase, total })
        }

        if (data.length === 0) throw new Error('No data rows found in file')
        resolve(data)
      } catch (err) {
        reject(err)
      }
    }
    reader.readAsArrayBuffer(file)
  })
}

// ── PDF export ───────────────────────────────────────────────────

// Plain-ASCII Indian number formatter — safe for jsPDF built-in fonts (no ₹, no unicode chars)
function fmtPDF(n, decimals = 2) {
  if (n == null || n === '' || Number(n) === 0) return '—'
  const v   = Math.abs(Number(n))
  const s   = v.toFixed(decimals)
  const [intPart, decPart] = s.split('.')
  let result = ''
  if (intPart.length > 3) {
    result = intPart.slice(-3)
    let rem = intPart.slice(0, -3)
    while (rem.length > 2) { result = rem.slice(-2) + ',' + result; rem = rem.slice(0, -2) }
    if (rem) result = rem + ',' + result
  } else {
    result = intPart
  }
  return decimals > 0 ? result + '.' + decPart : result
}

async function exportAuctionPDF({ rows, filterFY, church, summary, paidDetailsMap = {} }) {
  const { jsPDF } = await import('jspdf')

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  const PW = 297, PH = 210
  const ML = 12, MR = 12, MT = 10
  const UW = PW - ML - MR

  const NAVY   = [30, 58, 95]
  const WHITE  = [255, 255, 255]
  const ALT    = [235, 241, 252]
  const RED_BG = [255, 235, 235]
  const RED_TXT= [180, 30, 30]
  const GRN_BG = [220, 250, 220]
  const GRN_TXT= [30, 120, 30]
  const GRAY   = [240, 242, 245]
  const TEXT1  = [30, 30, 30]
  const TEXT2  = [80, 80, 90]

  let y = MT

  // ── church header ──────────────────────────────────────────────
  const churchName = church?.church_name || 'Church'
  const place      = [church?.city, church?.state].filter(Boolean).join(', ')

  doc.setFillColor(...NAVY)
  doc.rect(ML, y, UW, 18, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.setTextColor(...WHITE)
  doc.text(churchName, PW / 2, y + 7, { align: 'center' })
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  if (place) doc.text(place, PW / 2, y + 13, { align: 'center' })
  y += 22

  // ── report title ───────────────────────────────────────────────
  doc.setFillColor(0, 112, 192)
  doc.rect(ML, y, UW, 9, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(...WHITE)
  doc.text(`AUCTION PAYMENT REPORT — FY ${filterFY}`, PW / 2, y + 6, { align: 'center' })
  y += 13

  // ── summary cards ──────────────────────────────────────────────
  const cardW  = (UW - 12) / 4
  const cardH  = 14
  const cards  = [
    { label: 'Total Members', value: String(summary.totalMembers) },
    { label: 'Total Due',     value: fmtPDF(summary.totalDue) },
    { label: 'Total Paid',    value: fmtPDF(summary.totalPaid) },
    { label: 'Balance Due',   value: fmtPDF(summary.totalBalance) },
  ]
  cards.forEach((c, i) => {
    const cx = ML + i * (cardW + 4)
    doc.setFillColor(...GRAY)
    doc.roundedRect(cx, y, cardW, cardH, 2, 2, 'F')
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7)
    doc.setTextColor(...TEXT2)
    doc.text(c.label.toUpperCase(), cx + cardW / 2, y + 4.5, { align: 'center' })
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.setTextColor(...NAVY)
    doc.text(c.value, cx + cardW / 2, y + 10.5, { align: 'center' })
  })
  y += cardH + 6

  // ── table ──────────────────────────────────────────────────────
  const COLS = [
    { label: '#',             w: 10,  align: 'C', key: '_sno'           },
    { label: 'Member ID',     w: 22,  align: 'C', key: 'member_id'      },
    { label: 'Member Name',   w: 56,  align: 'L', key: 'member_name'    },
    { label: 'Prev Pending',  w: 28,  align: 'R', key: 'previous_pending' },
    { label: 'Curr Year',     w: 28,  align: 'R', key: 'current_year_purchase' },
    { label: 'Total Due',     w: 28,  align: 'R', key: 'total'          },
    { label: 'Amount Paid',   w: 28,  align: 'R', key: 'paid'           },
    { label: 'Balance',       w: 28,  align: 'R', key: 'balance'        },
    { label: 'Status',        w: 22,  align: 'C', key: 'status'         },
  ]
  const ROW_H = 7
  const HDR_H = 9

  // header
  doc.setFillColor(...NAVY)
  doc.rect(ML, y, UW, HDR_H, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7.5)
  doc.setTextColor(...WHITE)
  let cx = ML
  COLS.forEach(col => {
    const tx = col.align === 'C' ? cx + col.w / 2
             : col.align === 'R' ? cx + col.w - 2
             : cx + 2
    doc.text(col.label, tx, y + 6, { align: col.align === 'C' ? 'center' : col.align === 'R' ? 'right' : 'left' })
    cx += col.w
  })
  y += HDR_H

  const pageBottom = PH - 14
  let pageNum = 1

  const addPageFooter = () => {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7)
    doc.setTextColor(...TEXT2)
    const now = new Date()
    doc.text(`Generated: ${now.toLocaleDateString('en-IN')} ${now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`, ML, PH - 6)
    doc.text(`Page ${pageNum}`, PW - MR, PH - 6, { align: 'right' })
  }

  const SUB_H  = 5.5  // receipt sub-row height
  const SUB_BG = [235, 245, 255]
  const SUB_HD = [210, 230, 250]
  const BLUE   = [37,  99,  235]
  const TEXT3  = [120, 130, 150]

  // helper: draw repeat header at top of new page
  const drawPageHeader = () => {
    doc.setFillColor(...NAVY)
    doc.rect(ML, y, UW, HDR_H, 'F')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7.5)
    doc.setTextColor(...WHITE)
    let hx = ML
    COLS.forEach(col => {
      const tx = col.align === 'C' ? hx + col.w / 2 : col.align === 'R' ? hx + col.w - 2 : hx + 2
      doc.text(col.label, tx, y + 6, { align: col.align === 'C' ? 'center' : col.align === 'R' ? 'right' : 'left' })
      hx += col.w
    })
    y += HDR_H
  }

  const ensureSpace = (needed) => {
    if (y + needed > pageBottom) {
      addPageFooter(); doc.addPage(); pageNum++; y = MT; drawPageHeader()
    }
  }

  rows.forEach((row, idx) => {
    ensureSpace(ROW_H)

    const balance = (row.total || 0) - (row.paid || 0)
    const isAlt   = idx % 2 === 1
    const details = paidDetailsMap[row.member_id] || []

    // ── main member row ──
    if (isAlt) { doc.setFillColor(...ALT); doc.rect(ML, y, UW, ROW_H, 'F') }

    const statusX = ML + COLS.slice(0, -1).reduce((s, c) => s + c.w, 0)
    const statusW = COLS[COLS.length - 1].w
    if (balance <= 0) { doc.setFillColor(...GRN_BG); doc.roundedRect(statusX + 1, y + 1, statusW - 2, ROW_H - 2, 1.5, 1.5, 'F') }
    else              { doc.setFillColor(...RED_BG); doc.roundedRect(statusX + 1, y + 1, statusW - 2, ROW_H - 2, 1.5, 1.5, 'F') }

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.5)
    let rx = ML
    COLS.forEach(col => {
      let val = ''
      if      (col.key === '_sno')                val = String(idx + 1)
      else if (col.key === 'member_id')           val = row.member_id || ''
      else if (col.key === 'member_name')         val = row.member_name || ''
      else if (col.key === 'previous_pending')      val = fmtPDF(row.previous_pending, 0)
      else if (col.key === 'current_year_purchase') val = fmtPDF(row.current_year_purchase, 0)
      else if (col.key === 'total')                 val = fmtPDF(row.total, 0)
      else if (col.key === 'paid')                  val = row.paid > 0 ? `${fmtPDF(row.paid, 0)} (${details.length})` : '—'
      else if (col.key === 'balance')               val = balance !== 0 ? fmtPDF(Math.abs(balance), 0) : '—'
      else if (col.key === 'status')              val = balance <= 0 ? 'Cleared' : 'Pending'

      const ty = y + ROW_H / 2 + 2.5
      const tx = col.align === 'C' ? rx + col.w / 2 : col.align === 'R' ? rx + col.w - 2 : rx + 2

      if      (col.key === 'balance' && balance > 0) doc.setTextColor(...RED_TXT)
      else if (col.key === 'status'  && balance <= 0) doc.setTextColor(...GRN_TXT)
      else if (col.key === 'status')                  doc.setTextColor(...RED_TXT)
      else                                            doc.setTextColor(...TEXT1)

      doc.text(val, tx, ty, { align: col.align === 'C' ? 'center' : col.align === 'R' ? 'right' : 'left' })
      rx += col.w
    })
    doc.setDrawColor(200, 210, 230)
    doc.line(ML, y + ROW_H, ML + UW, y + ROW_H)
    y += ROW_H

    // ── receipt sub-rows ──
    if (!details.length) return

    // Sub-rows span the full table width (same as main rows) — no indent
    const SX  = ML       // start x: same left edge as main table
    const SW  = UW       // full table width
    const TX  = SX + 14  // text start x: skip past the # column area

    // sub-header
    ensureSpace(SUB_H)
    doc.setFillColor(...SUB_HD)
    doc.rect(SX, y, SW, SUB_H, 'F')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(6.5)
    doc.setTextColor(...BLUE)
    const subCols = [
      { label: 'Receipt No',    x: TX,          align: 'L' },
      { label: 'Date',          x: TX + 30,     align: 'L' },
      { label: 'Month(s) Paid', x: TX + 54,     align: 'L' },
      { label: 'Mode',          x: TX + 116,    align: 'L' },
      { label: 'Amount',        x: SX + SW - 2, align: 'R' },
    ]
    subCols.forEach(sc => {
      doc.text(sc.label, sc.x, y + SUB_H / 2 + 2, { align: sc.align === 'R' ? 'right' : 'left' })
    })
    y += SUB_H

    details.forEach((d, di) => {
      ensureSpace(SUB_H)
      doc.setFillColor(...SUB_BG)
      doc.rect(SX, y, SW, SUB_H, 'F')

      const fmtD = d.receipt_date ? (() => { const [yr,mm,dd] = d.receipt_date.split('-'); return `${dd}/${mm}/${yr}` })() : '—'
      const ty   = y + SUB_H / 2 + 2

      doc.setFont('helvetica', 'normal')
      doc.setFontSize(6.5)

      doc.setTextColor(...BLUE)
      doc.text(d.receipt_number || '—', TX, ty)

      doc.setTextColor(...TEXT2)
      doc.text(fmtD,                    TX + 30,  ty)
      doc.text(d.month_paid    || '—',  TX + 54,  ty)

      doc.setTextColor(...TEXT1)
      doc.text(d.payment_mode  || '—',  TX + 116, ty)

      doc.setTextColor(...GRN_TXT)
      doc.setFont('helvetica', 'bold')
      doc.text(fmtPDF(d.amount), SX + SW - 2, ty, { align: 'right' })

      doc.setDrawColor(210, 225, 245)
      doc.line(SX, y + SUB_H, SX + SW, y + SUB_H)
      y += SUB_H
    })

    // receipt subtotal
    ensureSpace(SUB_H + 1)
    doc.setFillColor(209, 250, 229)
    doc.rect(SX, y, SW, SUB_H, 'F')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(6.5)
    doc.setTextColor(...TEXT3)
    doc.text(`Total Paid (${details.length} receipt${details.length !== 1 ? 's' : ''})`, TX, y + SUB_H / 2 + 2)
    doc.setTextColor(...GRN_TXT)
    doc.text(fmtPDF(row.paid), SX + SW - 2, y + SUB_H / 2 + 2, { align: 'right' })
    doc.setDrawColor(180, 220, 180)
    doc.line(SX, y + SUB_H, SX + SW, y + SUB_H)
    y += SUB_H + 2
  })

  // ── totals row ─────────────────────────────────────────────────
  if (y + ROW_H + 2 > pageBottom) {
    addPageFooter(); doc.addPage(); pageNum++; y = MT
  }
  doc.setFillColor(...NAVY)
  doc.rect(ML, y + 2, UW, ROW_H + 1, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.setTextColor(...WHITE)
  const totCols = [
    { label: 'TOTAL',                     w: COLS[0].w + COLS[1].w + COLS[2].w, align: 'L' },
    { label: fmtPDF(summary.totalPrevPending, 0), w: COLS[3].w, align: 'R' },
    { label: fmtPDF(summary.totalCurrYear, 0),    w: COLS[4].w, align: 'R' },
    { label: fmtPDF(summary.totalDue, 0),         w: COLS[5].w, align: 'R' },
    { label: fmtPDF(summary.totalPaid, 0),        w: COLS[6].w, align: 'R' },
    { label: fmtPDF(summary.totalBalance, 0),     w: COLS[7].w, align: 'R' },
    { label: '',                                  w: COLS[8].w, align: 'C' },
  ]
  let tx2 = ML
  totCols.forEach(tc => {
    const tx = tc.align === 'R' ? tx2 + tc.w - 2 : tc.align === 'C' ? tx2 + tc.w / 2 : tx2 + 2
    doc.text(tc.label, tx, y + 2 + ROW_H / 2 + 2.5, { align: tc.align === 'R' ? 'right' : tc.align === 'C' ? 'center' : 'left' })
    tx2 += tc.w
  })
  y += ROW_H + 4

  addPageFooter()

  const safeChurch = churchName.replace(/[^a-zA-Z0-9]/g, '_')
  doc.save(`Auction_Report_${safeChurch}_FY${filterFY}.pdf`)
}

// ══════════════════════════════════════════════════════════════════
//  Main page
// ══════════════════════════════════════════════════════════════════

export default function AuctionReportPage() {
  const toast = useToast()
  const fileRef = useRef(null)

  const [filterFY,      setFilterFY]      = useState(() => getFY())
  const [trackerRows,   setTrackerRows]   = useState([])   // imported data from auction_tracker
  const [reportRows,    setReportRows]    = useState([])   // after Check Status
  const [generated,       setGenerated]       = useState(false)
  const [loadingImport,   setLoadingImport]   = useState(false)
  const [loadingCheck,    setLoadingCheck]    = useState(false)
  const [loadingData,     setLoadingData]     = useState(false)
  const [exporting,       setExporting]       = useState(false)
  const [preview,         setPreview]         = useState(null) // { rows, fileName } before confirm
  const [church,          setChurch]          = useState(null)
  const [paidDetailsMap,  setPaidDetailsMap]  = useState({})  // member_id → [{receipt_number,receipt_date,month_paid,payment_mode,amount}]
  const [expandedMember,  setExpandedMember]  = useState(null)

  useEffect(() => { getChurch().then(setChurch).catch(() => {}) }, [])

  // Load existing imported rows for FY
  const loadTracker = useCallback(async (fy) => {
    setLoadingData(true)
    setGenerated(false)
    setReportRows([])
    try {
      const { data, error } = await supabase
        .from('auction_tracker')
        .select('member_id,member_name,previous_pending,current_year_purchase,total')
        .eq('financial_year', fy)
        .order('member_name')
      if (error) throw error
      setTrackerRows(data || [])
    } catch (e) {
      toast(e.message, 'error')
    }
    setLoadingData(false)
  }, [toast])

  useEffect(() => { loadTracker(filterFY) }, [filterFY, loadTracker])

  const handleFYChange = (fy) => {
    setFilterFY(fy)
    setPreview(null)
  }

  // ── File pick & parse ──────────────────────────────────────────
  const handleFilePick = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setLoadingImport(true)
    try {
      const rows = await parseAuctionFile(file)
      setPreview({ rows, fileName: file.name })
    } catch (err) {
      toast(err.message, 'error')
    }
    setLoadingImport(false)
  }

  // ── Confirm import → save to Supabase ─────────────────────────
  const confirmImport = async () => {
    if (!preview) return
    setLoadingImport(true)
    try {
      // 1. Delete all existing rows for this FY first
      const { error: delErr } = await supabase
        .from('auction_tracker')
        .delete()
        .eq('financial_year', filterFY)
      if (delErr) throw delErr

      // 2. Deduplicate by member_id (keep last occurrence) in case file has duplicates
      const seen = new Map()
      preview.rows.forEach(r => seen.set(r.member_id, r))
      const insRows = [...seen.values()].map(r => ({ ...r, financial_year: filterFY }))

      // 3. Upsert in chunks (handles any residual constraint conflicts)
      const CHUNK = 500
      for (let i = 0; i < insRows.length; i += CHUNK) {
        const { error } = await supabase
          .from('auction_tracker')
          .upsert(insRows.slice(i, i + CHUNK), { onConflict: 'financial_year,member_id' })
        if (error) throw error
      }

      toast(`${insRows.length} rows imported for FY ${filterFY}`, 'success')
      setPreview(null)
      await loadTracker(filterFY)
    } catch (e) {
      toast(e.message, 'error')
    }
    setLoadingImport(false)
  }

  // ── Check Status ───────────────────────────────────────────────
  const checkStatus = async () => {
    if (!trackerRows.length) { toast('Import the Auction Payment Tracker first', 'error'); return }
    setLoadingCheck(true)
    setExpandedMember(null)
    try {
      // Find payment categories containing "auction"
      const { data: cats, error: catErr } = await supabase
        .from('payment_categories')
        .select('id,name')
        .ilike('name', '%auction%')
      if (catErr) throw catErr

      let paidMap     = {}  // member_id → total paid
      let detailsMap  = {}  // member_id → [{receipt_number, receipt_date, month_paid, payment_mode, amount}]

      if (cats?.length) {
        const catIds = cats.map(c => c.id)

        // Get all receipts for this FY with full detail fields
        const { data: recs, error: recErr } = await supabase
          .from('receipts')
          .select('id,member_id,receipt_number,receipt_date,month_paid,payment_mode')
          .eq('financial_year', filterFY)
        if (recErr) throw recErr

        if (recs?.length) {
          // Build lookup: receipt_id → full receipt row
          const recMap = {}
          recs.forEach(r => { recMap[r.id] = r })
          const recIds = recs.map(r => r.id)

          // Get receipt_items for those receipts and auction categories
          const CHUNK = 500
          const allItems = []
          for (let i = 0; i < recIds.length; i += CHUNK) {
            const { data: items, error: itErr } = await supabase
              .from('receipt_items')
              .select('receipt_id,total')
              .in('receipt_id', recIds.slice(i, i + CHUNK))
              .in('category_id', catIds)
            if (itErr) throw itErr
            if (items) allItems.push(...items)
          }

          allItems.forEach(item => {
            const rec = recMap[item.receipt_id]
            if (!rec) return
            const mId = rec.member_id
            // accumulate total
            paidMap[mId] = (paidMap[mId] || 0) + (item.total || 0)
            // accumulate detail entry
            if (!detailsMap[mId]) detailsMap[mId] = []
            detailsMap[mId].push({
              receipt_number: rec.receipt_number || '—',
              receipt_date:   rec.receipt_date   || '',
              month_paid:     rec.month_paid      || '',
              payment_mode:   rec.payment_mode    || '',
              amount:         item.total          || 0,
            })
          })

          // Sort each member's receipts by date ascending
          Object.values(detailsMap).forEach(arr =>
            arr.sort((a, b) => (a.receipt_date || '').localeCompare(b.receipt_date || ''))
          )
        }
      }

      // Build report rows
      const rows = trackerRows.map(tr => ({
        ...tr,
        previous_pending:      Number(tr.previous_pending)      || 0,
        current_year_purchase: Number(tr.current_year_purchase) || 0,
        total:                 Number(tr.total)                 || 0,
        paid:    paidMap[tr.member_id] || 0,
        balance: (Number(tr.total) || 0) - (paidMap[tr.member_id] || 0),
      }))

      setReportRows(rows)
      setPaidDetailsMap(detailsMap)
      setGenerated(true)
    } catch (e) {
      toast(e.message, 'error')
    }
    setLoadingCheck(false)
  }

  // ── Summary stats ──────────────────────────────────────────────
  const summary = {
    totalMembers:     reportRows.length,
    totalPrevPending: reportRows.reduce((s, r) => s + r.previous_pending, 0),
    totalCurrYear:    reportRows.reduce((s, r) => s + r.current_year_purchase, 0),
    totalDue:         reportRows.reduce((s, r) => s + r.total, 0),
    totalPaid:        reportRows.reduce((s, r) => s + r.paid, 0),
    totalBalance:     reportRows.reduce((s, r) => s + r.balance, 0),
    countCleared:     reportRows.filter(r => r.balance <= 0).length,
    countPending:     reportRows.filter(r => r.balance > 0).length,
  }

  // ── Excel export — two sheets: Summary + Detailed ────────────────
  const exportExcel = async () => {
    if (!reportRows.length) return
    setExporting(true)
    try {
      const ExcelJS    = (await import('exceljs')).default
      const churchName = church?.church_name || 'Church'
      const now        = new Date()
      const dateStr    = now.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
      const NCOLS      = 9

      // ── colours ──
      const C_HDR   = '1E3A5F'
      const C_SUB   = '0070C0'
      const C_WHITE = 'FFFFFF'
      const C_ALT   = 'EEF3FA'
      const C_RCHDR = 'D6EAF8'
      const C_RCROW = 'EBF5FB'
      const C_GRAY3 = '6B7280'

      const outerMed = { style: 'medium', color: { argb: C_HDR } }
      const innerThn = { style: 'thin',   color: { argb: 'C5CEE0' } }
      const border = (top, bot, left, right) => ({
        top: top ? outerMed : innerThn, bottom: bot ? outerMed : innerThn,
        left: left ? outerMed : innerThn, right: right ? outerMed : innerThn,
      })

      const numFmt  = '#,##0.00'
      const COL_W   = [7, 18, 32, 18, 18, 18, 18, 18, 16]
      const HDR_LABELS = ['#', 'Member ID', 'Member Name', 'Prev. Pending (₹)', 'Curr. Year (₹)', 'Total Due (₹)', 'Amount Paid (₹)', 'Balance (₹)', 'Status']
      const fmtDate = s => { if (!s) return ''; const [y, m, d] = s.split('-'); return `${d}/${m}/${y}` }

      // ── shared: build title block + col headers on a worksheet ──
      const buildSheetHeader = (ws, sheetTitle) => {
        ws.columns = COL_W.map((w, i) => ({ key: String.fromCharCode(97 + i), width: w }))
        ws.views = [{ state: 'frozen', ySplit: 4 }]

        const titles = [
          { text: churchName,                                    bold: true,  size: 14, bg: C_HDR, fg: C_WHITE },
          { text: `${sheetTitle} — FY ${filterFY}`,             bold: true,  size: 12, bg: C_SUB, fg: C_WHITE },
          { text: `Generated: ${dateStr}`,                       bold: false, size: 10, bg: 'EEF3FA', fg: '374151' },
        ]
        titles.forEach(({ text, bold, size, bg, fg }, idx) => {
          const r = ws.addRow([text, ...Array(NCOLS - 1).fill('')])
          ws.mergeCells(r.number, 1, r.number, NCOLS)
          const cell = ws.getCell(r.number, 1)
          cell.value = text
          cell.font  = { bold, size, name: 'Calibri', color: { argb: fg } }
          cell.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } }
          cell.alignment = { horizontal: 'center', vertical: 'middle' }
          cell.border = { top: idx === 0 ? outerMed : innerThn, bottom: idx === titles.length - 1 ? outerMed : innerThn, left: outerMed, right: outerMed }
          r.height = size * 2.1
        })

        const hr = ws.addRow(HDR_LABELS)
        hr.height = 24
        hr.eachCell({ includeEmpty: true }, (cell, ci) => {
          cell.font      = { bold: true, color: { argb: C_WHITE }, size: 11, name: 'Calibri' }
          cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: C_HDR } }
          cell.alignment = { vertical: 'middle', horizontal: 'center' }
          cell.border    = border(true, false, ci === 1, ci === NCOLS)
        })
      }

      // ── shared: grand total row ──
      const addTotalRow = (ws) => {
        const tr = ws.addRow([
          '', 'TOTAL', '', summary.totalPrevPending || null, summary.totalCurrYear || null,
          summary.totalDue || null, summary.totalPaid || null, summary.totalBalance || null,
          `${summary.countCleared}✓ / ${summary.countPending}✗`,
        ])
        tr.height = 22
        tr.eachCell({ includeEmpty: true }, (cell, ci) => {
          cell.font      = { bold: true, size: 11, name: 'Calibri', color: { argb: C_WHITE } }
          cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: C_HDR } }
          cell.alignment = { vertical: 'middle', horizontal: ci <= 3 ? 'left' : 'right' }
          cell.border    = border(true, true, ci === 1, ci === NCOLS)
          if ([4,5,6,7,8].includes(ci) && cell.value != null) cell.numFmt = numFmt
        })
      }

      // ── shared: write one main member row ──
      const addMemberRow = (ws, row, i, isLast) => {
        const isAlt   = i % 2 === 1
        const cleared = row.balance <= 0
        const dr = ws.addRow([
          i + 1, row.member_id, row.member_name,
          row.previous_pending || null, row.current_year_purchase || null,
          row.total || null, row.paid || null, row.balance || null,
          cleared ? 'Cleared' : 'Pending',
        ])
        dr.height = 18
        dr.eachCell({ includeEmpty: true }, (cell, ci) => {
          cell.font      = { size: 10, name: 'Calibri' }
          cell.alignment = { vertical: 'middle', horizontal: ci <= 3 ? (ci === 1 ? 'center' : 'left') : 'right' }
          cell.border    = border(false, isLast, ci === 1, ci === NCOLS)
          if (isAlt) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C_ALT } }
          if ([4,5,6,7,8].includes(ci) && cell.value != null) cell.numFmt = numFmt
          if (ci === 9) { cell.alignment = { vertical: 'middle', horizontal: 'center' }; cell.font = { ...cell.font, bold: true, color: { argb: cleared ? '15803D' : 'DC2626' } } }
          if (ci === 8 && row.balance > 0) cell.font = { ...cell.font, color: { argb: 'DC2626' } }
        })
      }

      const wb = new ExcelJS.Workbook()
      wb.creator = 'Church CMS'
      wb.created = now

      // ════════════════════════════════
      //  Sheet 1 — Summary (no receipt breakup)
      // ════════════════════════════════
      const wsSummary = wb.addWorksheet('Summary')
      buildSheetHeader(wsSummary, 'Auction Payment Report (Summary)')
      reportRows.forEach((row, i) => {
        addMemberRow(wsSummary, row, i, i === reportRows.length - 1)
      })
      addTotalRow(wsSummary)

      // ════════════════════════════════
      //  Sheet 2 — Detailed (with receipt sub-rows)
      // ════════════════════════════════
      const wsDetail = wb.addWorksheet('Detailed')
      buildSheetHeader(wsDetail, 'Auction Payment Report (Detailed)')

      reportRows.forEach((row, i) => {
        const details = paidDetailsMap[row.member_id] || []
        const isLast  = i === reportRows.length - 1 && details.length === 0
        addMemberRow(wsDetail, row, i, isLast)

        if (!details.length) return

        // receipt sub-header
        const sh = wsDetail.addRow(['', 'Receipt No', 'Date', 'Month(s) Paid', 'Mode', '', 'Amount (₹)', '', ''])
        sh.height = 16
        sh.eachCell({ includeEmpty: true }, (cell, ci) => {
          cell.font      = { bold: true, size: 9, name: 'Calibri', color: { argb: C_HDR } }
          cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: C_RCHDR } }
          cell.alignment = { vertical: 'middle', horizontal: ci === 7 ? 'right' : ci === 1 ? 'center' : 'left', indent: ci === 2 ? 1 : 0 }
          cell.border    = border(false, false, ci === 1, ci === NCOLS)
        })

        // receipt detail rows
        details.forEach((d, di) => {
          const isLastDetail = di === details.length - 1
          const rr = wsDetail.addRow(['', d.receipt_number, fmtDate(d.receipt_date), d.month_paid || '', d.payment_mode || '', '', d.amount || null, '', ''])
          rr.height = 16
          rr.eachCell({ includeEmpty: true }, (cell, ci) => {
            cell.font      = { size: 9, name: 'Calibri', color: { argb: ci === 2 ? '2563EB' : '111827' } }
            cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: C_RCROW } }
            cell.alignment = { vertical: 'middle', horizontal: ci === 7 ? 'right' : ci === 1 ? 'center' : 'left', indent: ci === 2 ? 1 : 0 }
            cell.border    = border(false, isLastDetail && isLast, ci === 1, ci === NCOLS)
            if (ci === 7 && cell.value != null) cell.numFmt = numFmt
          })
        })

        // receipt subtotal
        const st = wsDetail.addRow(['', '', `Total Paid (${details.length} receipt${details.length !== 1 ? 's' : ''})`, '', '', '', row.paid || null, '', ''])
        wsDetail.mergeCells(st.number, 2, st.number, 6)
        st.height = 17
        st.eachCell({ includeEmpty: true }, (cell, ci) => {
          cell.font      = { bold: true, size: 9, name: 'Calibri', color: { argb: ci === 7 ? '15803D' : C_GRAY3 } }
          cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'D1FAE5' } }
          cell.alignment = { vertical: 'middle', horizontal: ci === 7 ? 'right' : 'left', indent: ci === 2 ? 1 : 0 }
          cell.border    = border(false, true, ci === 1, ci === NCOLS)
          if (ci === 7 && cell.value != null) cell.numFmt = numFmt
        })
      })

      addTotalRow(wsDetail)

      // ── download ──
      const buf = await wb.xlsx.writeBuffer()
      const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      const safeChurch = churchName.replace(/[^a-zA-Z0-9]/g, '_')
      a.href = url; a.download = `Auction_Report_${safeChurch}_FY${filterFY}.xlsx`; a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      toast(e.message, 'error')
    }
    setExporting(false)
  }

  // ── PDF export ─────────────────────────────────────────────────
  const exportPDF = async () => {
    if (!reportRows.length) return
    setExporting(true)
    try {
      await exportAuctionPDF({ rows: reportRows, filterFY, church, summary, paidDetailsMap })
    } catch (e) {
      toast(e.message, 'error')
    }
    setExporting(false)
  }

  // ══════════════════════════════════════════════════════════════
  //  Render
  // ══════════════════════════════════════════════════════════════

  return (
    <div className="page-container">
      {/* ── Header ── */}
      <div className="page-header">
        <div>
          <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Gavel size={20} style={{ color: 'var(--accent)', flexShrink: 0 }} />
            Auction Report
          </h1>
          <p className="page-subtitle">Import auction tracker, check payment status, and export report</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input ref={fileRef} type="file" accept=".xlsx,.xlsm,.xls,.csv" style={{ display: 'none' }} onChange={handleFilePick} />
          <button
            className="action-btn"
            onClick={() => fileRef.current?.click()}
            disabled={loadingImport}
            style={{ background: 'var(--sidebar-bg)' }}
          >
            {loadingImport ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
            {loadingImport ? 'Reading…' : 'Import File'}
          </button>

          <button
            className="action-btn"
            onClick={checkStatus}
            disabled={loadingCheck || !trackerRows.length}
            style={{ background: '#2563eb' }}
          >
            {loadingCheck ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
            {loadingCheck ? 'Checking…' : 'Check Status'}
          </button>

          {generated && (
            <>
              <button
                className="action-btn"
                onClick={exportExcel}
                disabled={exporting}
                style={{ background: '#16a34a' }}
              >
                {exporting ? <Loader2 size={13} className="animate-spin" /> : <FileSpreadsheet size={13} />}
                Excel Export
              </button>
              <button
                className="action-btn"
                onClick={exportPDF}
                disabled={exporting}
                style={{ background: '#7c3aed' }}
              >
                {exporting ? <Loader2 size={13} className="animate-spin" /> : <FileText size={13} />}
                PDF Export
              </button>
            </>
          )}
        </div>
      </div>

      {/* ── FY filter bar ── */}
      <div className="card" style={{ padding: '12px 20px', marginBottom: 16, display: 'flex', gap: 12, alignItems: 'center' }}>
        <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', flexShrink: 0 }}>Financial Year</label>
        <select value={filterFY} onChange={e => handleFYChange(e.target.value)} className="field-input" style={{ width: 120, appearance: 'none' }}>
          {FYS.map(fy => <option key={fy} value={fy}>{fy}</option>)}
        </select>
        {trackerRows.length > 0 && (
          <span style={{ fontSize: 12, color: 'var(--text-3)', marginLeft: 4 }}>
            {trackerRows.length} members imported · {generated ? `${reportRows.length} checked` : 'Click "Check Status" to fetch payment data'}
          </span>
        )}
      </div>

      {/* ── Import preview confirmation ── */}
      {preview && (
        <div className="card" style={{ padding: 20, marginBottom: 16, borderLeft: '4px solid var(--accent)' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
            <Info size={18} style={{ color: 'var(--accent)', flexShrink: 0, marginTop: 2 }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, color: 'var(--text-1)', marginBottom: 4 }}>
                Ready to import: {preview.fileName}
              </div>
              <div style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 12 }}>
                {preview.rows.length} member rows found for FY <strong>{filterFY}</strong>.
                This will <strong>replace</strong> any existing data for this FY.
              </div>
              {/* mini preview table */}
              <div style={{ overflowX: 'auto', marginBottom: 12 }}>
                <table style={{ borderCollapse: 'collapse', fontSize: 12, minWidth: 500 }}>
                  <thead>
                    <tr style={{ background: 'var(--table-header-bg)' }}>
                      {['Member ID', 'Member Name', 'Prev. Pending', 'Curr. Year', 'Total'].map(h => (
                        <th key={h} style={{ padding: '6px 10px', fontWeight: 700, color: 'var(--text-3)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.rows.slice(0, 5).map((r, i) => (
                      <tr key={i} style={{ borderTop: '1px solid var(--table-border)' }}>
                        <td style={{ padding: '5px 10px', fontFamily: 'monospace', fontSize: 12 }}>{r.member_id}</td>
                        <td style={{ padding: '5px 10px', fontSize: 12 }}>{r.member_name}</td>
                        <td style={{ padding: '5px 10px', textAlign: 'right', fontFamily: 'monospace', fontSize: 12 }}>{r.previous_pending > 0 ? r.previous_pending.toLocaleString('en-IN') : '—'}</td>
                        <td style={{ padding: '5px 10px', textAlign: 'right', fontFamily: 'monospace', fontSize: 12 }}>{r.current_year_purchase > 0 ? r.current_year_purchase.toLocaleString('en-IN') : '—'}</td>
                        <td style={{ padding: '5px 10px', textAlign: 'right', fontFamily: 'monospace', fontSize: 12, fontWeight: 600 }}>{r.total > 0 ? r.total.toLocaleString('en-IN') : '—'}</td>
                      </tr>
                    ))}
                    {preview.rows.length > 5 && (
                      <tr><td colSpan={5} style={{ padding: '5px 10px', color: 'var(--text-3)', fontSize: 11, fontStyle: 'italic' }}>…and {preview.rows.length - 5} more rows</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="action-btn" onClick={confirmImport} disabled={loadingImport}
                  style={{ background: 'var(--sidebar-bg)' }}>
                  {loadingImport ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
                  {loadingImport ? 'Importing…' : `Confirm Import (${preview.rows.length} rows)`}
                </button>
                <button className="action-btn" onClick={() => setPreview(null)} disabled={loadingImport}
                  style={{ background: '#64748b' }}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Empty state ── */}
      {!loadingData && trackerRows.length === 0 && !preview && (
        <div className="card" style={{ padding: 48, textAlign: 'center' }}>
          <Gavel size={40} style={{ color: 'var(--text-3)', margin: '0 auto 12px', display: 'block' }} />
          <p style={{ color: 'var(--text-2)', fontWeight: 600, margin: '0 0 6px' }}>No Auction Tracker data for FY {filterFY}</p>
          <p style={{ color: 'var(--text-3)', fontSize: 13, margin: 0 }}>
            Import the "Auction Payment Tracker" Excel file to get started
          </p>
        </div>
      )}

      {loadingData && (
        <div className="card" style={{ padding: 48, textAlign: 'center' }}>
          <Loader2 size={28} className="animate-spin" style={{ color: 'var(--text-3)', margin: '0 auto' }} />
        </div>
      )}

      {/* ── Report section (after Check Status) ── */}
      {generated && !loadingCheck && (
        <>
          {/* Summary cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
            <SummaryCard label="Total Members"   value={summary.totalMembers}   isCount />
            <SummaryCard label="Total Due"        value={summary.totalDue}       />
            <SummaryCard label="Total Paid"       value={summary.totalPaid}      accent />
            <SummaryCard label="Balance Pending"  value={summary.totalBalance}   warn={summary.totalBalance > 0} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12, marginBottom: 16 }}>
            <StatusCard label="Cleared"  count={summary.countCleared} total={summary.totalMembers} type="cleared" />
            <StatusCard label="Pending"  count={summary.countPending} total={summary.totalMembers} type="pending" />
          </div>

          {/* Report table */}
          <div className="card" style={{ overflow: 'hidden' }}>
            <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--table-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-1)', margin: 0 }}>Auction Payment Status</h3>
              <span style={{ fontSize: 12, color: 'var(--text-3)' }}>FY {filterFY} · {reportRows.length} members · Click a row to see receipt details</span>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 760 }}>
                <thead>
                  <tr style={{ background: 'var(--table-header-bg)' }}>
                    <th style={{ width: 32, padding: '9px 8px' }} />
                    {['#', 'Member ID', 'Member Name', 'Prev. Pending', 'Curr. Year', 'Total Due', 'Amount Paid', 'Balance', 'Status'].map(h => (
                      <th key={h} style={{
                        padding: '9px 12px',
                        textAlign: ['#','Member ID','Member Name','Status'].includes(h) ? 'left' : 'right',
                        fontSize: 11, fontWeight: 700, color: 'var(--text-3)',
                        textTransform: 'uppercase', letterSpacing: '0.07em', whiteSpace: 'nowrap',
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {reportRows.map((row, i) => {
                    const cleared    = row.balance <= 0
                    const isExpanded = expandedMember === row.member_id
                    const details    = paidDetailsMap[row.member_id] || []
                    const rowBg      = i % 2 === 0 ? 'transparent' : 'rgba(0,0,0,0.012)'

                    return (
                      <>
                        {/* ── main data row ── */}
                        <tr
                          key={row.member_id}
                          onClick={() => setExpandedMember(isExpanded ? null : row.member_id)}
                          style={{
                            borderTop: '1px solid var(--table-border)',
                            background: isExpanded ? 'rgba(37,99,235,0.06)' : rowBg,
                            cursor: 'pointer',
                            transition: 'background 0.12s',
                          }}
                        >
                          {/* expand chevron */}
                          <td style={{ padding: '9px 8px', textAlign: 'center' }}>
                            <ChevronDown
                              size={13}
                              style={{
                                color: 'var(--text-3)',
                                transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                                transition: 'transform 0.2s ease',
                              }}
                            />
                          </td>
                          <td style={{ padding: '9px 12px', fontSize: 12, color: 'var(--text-3)' }}>{i + 1}</td>
                          <td style={{ padding: '9px 12px', fontSize: 12, fontFamily: 'monospace', fontWeight: 600, color: 'var(--text-1)' }}>{row.member_id}</td>
                          <td style={{ padding: '9px 12px', fontSize: 13, color: 'var(--text-1)', fontWeight: 500 }}>{row.member_name}</td>
                          <td style={{ padding: '9px 12px', textAlign: 'right', fontSize: 13, fontFamily: 'monospace', color: row.previous_pending > 0 ? '#b45309' : 'var(--text-3)' }}>
                            {row.previous_pending > 0 ? row.previous_pending.toLocaleString('en-IN') : '—'}
                          </td>
                          <td style={{ padding: '9px 12px', textAlign: 'right', fontSize: 13, fontFamily: 'monospace', color: row.current_year_purchase > 0 ? 'var(--text-1)' : 'var(--text-3)' }}>
                            {row.current_year_purchase > 0 ? row.current_year_purchase.toLocaleString('en-IN') : '—'}
                          </td>
                          <td style={{ padding: '9px 12px', textAlign: 'right', fontSize: 13, fontFamily: 'monospace', fontWeight: 700, color: 'var(--text-1)' }}>
                            {row.total > 0 ? row.total.toLocaleString('en-IN') : '—'}
                          </td>
                          {/* Amount Paid — shows receipt count badge when paid > 0 */}
                          <td style={{ padding: '9px 12px', textAlign: 'right', fontSize: 13, fontFamily: 'monospace' }}>
                            {row.paid > 0 ? (
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: '#16a34a' }}>
                                {row.paid.toLocaleString('en-IN')}
                                <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 5px', borderRadius: 10, background: '#dcfce7', color: '#15803d', fontFamily: 'var(--font-ui)' }}>
                                  {details.length} rcpt
                                </span>
                              </span>
                            ) : <span style={{ color: 'var(--text-3)' }}>—</span>}
                          </td>
                          <td style={{ padding: '9px 12px', textAlign: 'right', fontSize: 13, fontFamily: 'monospace', fontWeight: 700, color: row.balance > 0 ? '#dc2626' : row.balance < 0 ? '#7c3aed' : 'var(--text-3)' }}>
                            {row.balance !== 0 ? Math.abs(row.balance).toLocaleString('en-IN') : '—'}
                            {row.balance < 0 && <span style={{ fontSize: 10, marginLeft: 3 }}>↑</span>}
                          </td>
                          <td style={{ padding: '9px 12px' }}>
                            <span style={{
                              fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 20,
                              background: cleared ? '#dcfce7' : '#fee2e2',
                              color:      cleared ? '#15803d' : '#dc2626',
                              display: 'inline-flex', alignItems: 'center', gap: 4,
                            }}>
                              {cleared ? <><CheckCircle size={11} /> Cleared</> : <><XCircle size={11} /> Pending</>}
                            </span>
                          </td>
                        </tr>

                        {/* ── expanded receipt detail sub-row ── */}
                        {isExpanded && (
                          <tr key={`${row.member_id}-detail`} style={{ background: 'rgba(37,99,235,0.04)', borderTop: '1px solid rgba(37,99,235,0.12)' }}>
                            <td colSpan={10} style={{ padding: '0 0 12px 52px' }}>
                              {details.length === 0 ? (
                                <div style={{ padding: '10px 0', fontSize: 13, color: 'var(--text-3)', fontStyle: 'italic' }}>
                                  No auction receipts found for this member in FY {filterFY}
                                </div>
                              ) : (
                                <table style={{ borderCollapse: 'collapse', fontSize: 12, marginTop: 8 }}>
                                  <thead>
                                    <tr>
                                      {['Receipt No', 'Date', 'Month(s) Paid', 'Mode', 'Amount (₹)'].map(h => (
                                        <th key={h} style={{
                                          padding: '5px 14px', textAlign: h === 'Amount (₹)' ? 'right' : 'left',
                                          fontSize: 10, fontWeight: 700, color: 'var(--text-3)',
                                          textTransform: 'uppercase', letterSpacing: '0.07em',
                                          borderBottom: '1px solid var(--table-border)', whiteSpace: 'nowrap',
                                        }}>{h}</th>
                                      ))}
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {details.map((d, di) => (
                                      <tr key={di} style={{ borderBottom: '1px solid var(--table-border)' }}>
                                        <td style={{ padding: '5px 14px', fontFamily: 'monospace', fontWeight: 600, color: '#2563eb', fontSize: 12 }}>{d.receipt_number}</td>
                                        <td style={{ padding: '5px 14px', color: 'var(--text-2)', fontSize: 12 }}>
                                          {d.receipt_date ? (() => { const [y,m,dd] = d.receipt_date.split('-'); return `${dd}/${m}/${y}` })() : '—'}
                                        </td>
                                        <td style={{ padding: '5px 14px', color: 'var(--text-1)', fontSize: 12 }}>
                                          {d.month_paid || <span style={{ color: 'var(--text-3)' }}>—</span>}
                                        </td>
                                        <td style={{ padding: '5px 14px', fontSize: 12 }}>
                                          <span style={{ padding: '2px 7px', borderRadius: 4, fontSize: 11, fontWeight: 600, background: d.payment_mode === 'Cash' ? '#f0fdf4' : '#eff6ff', color: d.payment_mode === 'Cash' ? '#15803d' : '#1d4ed8' }}>
                                            {d.payment_mode || '—'}
                                          </span>
                                        </td>
                                        <td style={{ padding: '5px 14px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 600, color: '#16a34a', fontSize: 12 }}>
                                          {d.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                        </td>
                                      </tr>
                                    ))}
                                    {/* subtotal */}
                                    <tr style={{ background: 'rgba(22,163,74,0.06)', borderTop: '2px solid rgba(22,163,74,0.3)' }}>
                                      <td colSpan={4} style={{ padding: '5px 14px', fontSize: 11, fontWeight: 700, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                        Total Paid ({details.length} receipt{details.length !== 1 ? 's' : ''})
                                      </td>
                                      <td style={{ padding: '5px 14px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 800, color: '#15803d', fontSize: 13 }}>
                                        {row.paid.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                      </td>
                                    </tr>
                                  </tbody>
                                </table>
                              )}
                            </td>
                          </tr>
                        )}
                      </>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr style={{ borderTop: '2px solid var(--table-border)', background: 'var(--table-header-bg)' }}>
                    <td />
                    <td colSpan={3} style={{ padding: '10px 12px', fontSize: 13, fontWeight: 700, color: 'var(--text-1)' }}>Grand Total</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 700, color: '#b45309' }}>
                      {summary.totalPrevPending > 0 ? summary.totalPrevPending.toLocaleString('en-IN') : '—'}
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 700, color: 'var(--text-1)' }}>
                      {summary.totalCurrYear > 0 ? summary.totalCurrYear.toLocaleString('en-IN') : '—'}
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', fontFamily: 'monospace', fontSize: 14, fontWeight: 800, color: 'var(--text-1)' }}>
                      {summary.totalDue > 0 ? summary.totalDue.toLocaleString('en-IN') : '—'}
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', fontFamily: 'monospace', fontSize: 14, fontWeight: 800, color: '#16a34a' }}>
                      {summary.totalPaid > 0 ? summary.totalPaid.toLocaleString('en-IN') : '—'}
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', fontFamily: 'monospace', fontSize: 14, fontWeight: 800, color: summary.totalBalance > 0 ? '#dc2626' : 'var(--text-3)' }}>
                      {summary.totalBalance > 0 ? summary.totalBalance.toLocaleString('en-IN') : '—'}
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      <span style={{ fontSize: 11, color: 'var(--text-3)' }}>
                        {summary.countCleared}✓ / {summary.countPending}✗
                      </span>
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </>
      )}

      {/* ── Tracker list (imported, before Check Status) ── */}
      {!generated && !loadingData && trackerRows.length > 0 && (
        <div className="card" style={{ overflow: 'hidden' }}>
          <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--table-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-1)', margin: 0 }}>Imported Tracker — FY {filterFY}</h3>
            <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{trackerRows.length} members · Click "Check Status" to fetch payment data</span>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 520 }}>
              <thead>
                <tr style={{ background: 'var(--table-header-bg)' }}>
                  {['#', 'Member ID', 'Member Name', 'Prev. Pending', 'Curr. Year', 'Total'].map(h => (
                    <th key={h} style={{ padding: '9px 12px', textAlign: ['#','Member ID','Member Name'].includes(h) ? 'left' : 'right', fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {trackerRows.map((row, i) => (
                  <tr key={row.member_id} style={{ borderTop: '1px solid var(--table-border)', background: i % 2 === 0 ? 'transparent' : 'rgba(0,0,0,0.012)' }}>
                    <td style={{ padding: '8px 12px', fontSize: 12, color: 'var(--text-3)' }}>{i + 1}</td>
                    <td style={{ padding: '8px 12px', fontSize: 12, fontFamily: 'monospace', fontWeight: 600, color: 'var(--text-1)' }}>{row.member_id}</td>
                    <td style={{ padding: '8px 12px', fontSize: 13, color: 'var(--text-1)' }}>{row.member_name}</td>
                    <td style={{ padding: '8px 12px', textAlign: 'right', fontSize: 13, fontFamily: 'monospace', color: row.previous_pending > 0 ? '#b45309' : 'var(--text-3)' }}>
                      {row.previous_pending > 0 ? Number(row.previous_pending).toLocaleString('en-IN') : '—'}
                    </td>
                    <td style={{ padding: '8px 12px', textAlign: 'right', fontSize: 13, fontFamily: 'monospace', color: 'var(--text-1)' }}>
                      {row.current_year_purchase > 0 ? Number(row.current_year_purchase).toLocaleString('en-IN') : '—'}
                    </td>
                    <td style={{ padding: '8px 12px', textAlign: 'right', fontSize: 13, fontFamily: 'monospace', fontWeight: 700, color: 'var(--text-1)' }}>
                      {row.total > 0 ? Number(row.total).toLocaleString('en-IN') : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Small sub-components ──────────────────────────────────────────

function SummaryCard({ label, value, isCount, accent, warn }) {
  return (
    <div className="card" style={{ padding: '16px 20px' }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 900, fontFamily: isCount ? 'var(--font-ui)' : 'monospace', color: warn ? '#dc2626' : accent ? '#16a34a' : 'var(--accent)' }}>
        {isCount ? value : '₹' + (Number(value) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
      </div>
    </div>
  )
}

function StatusCard({ label, count, total, type }) {
  const pct     = total > 0 ? ((count / total) * 100).toFixed(0) : 0
  const color   = type === 'cleared' ? '#16a34a' : '#dc2626'
  const bgColor = type === 'cleared' ? '#dcfce7' : '#fee2e2'
  return (
    <div className="card" style={{ padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 16 }}>
      <div style={{ width: 44, height: 44, borderRadius: '50%', background: bgColor, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        {type === 'cleared'
          ? <CheckCircle size={22} style={{ color }} />
          : <AlertCircle size={22} style={{ color }} />
        }
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</div>
        <div style={{ fontSize: 20, fontWeight: 800, color, fontFamily: 'var(--font-ui)' }}>{count} <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-3)' }}>members</span></div>
      </div>
      <div style={{ fontSize: 24, fontWeight: 900, color: 'var(--text-3)', fontFamily: 'monospace' }}>{pct}%</div>
    </div>
  )
}
