/* ═══════════════════════════════════════════════════════════════
   AuctionReportPage.jsx
   ═══════════════════════════════════════════════════════════════ */

import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase, getChurch } from '../lib/supabase'
import { useToast } from '../lib/toast'
import { exportToExcelWithTitle } from '../lib/exportExcel'
import {
  Gavel, Upload, RefreshCw, Loader2, FileSpreadsheet,
  FileText, CheckCircle, XCircle, AlertCircle, Info,
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

async function exportAuctionPDF({ rows, filterFY, church, summary }) {
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
    { label: 'Total Due',     value: '₹' + summary.totalDue.toLocaleString('en-IN', { minimumFractionDigits: 2 }) },
    { label: 'Total Paid',    value: '₹' + summary.totalPaid.toLocaleString('en-IN', { minimumFractionDigits: 2 }) },
    { label: 'Balance Due',   value: '₹' + summary.totalBalance.toLocaleString('en-IN', { minimumFractionDigits: 2 }) },
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

  rows.forEach((row, idx) => {
    if (y + ROW_H > pageBottom) {
      addPageFooter()
      doc.addPage()
      pageNum++
      y = MT
      // repeat header on new page
      doc.setFillColor(...NAVY)
      doc.rect(ML, y, UW, HDR_H, 'F')
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(7.5)
      doc.setTextColor(...WHITE)
      let hx = ML
      COLS.forEach(col => {
        const tx = col.align === 'C' ? hx + col.w / 2
                 : col.align === 'R' ? hx + col.w - 2
                 : hx + 2
        doc.text(col.label, tx, y + 6, { align: col.align === 'C' ? 'center' : col.align === 'R' ? 'right' : 'left' })
        hx += col.w
      })
      y += HDR_H
    }

    const balance = (row.total || 0) - (row.paid || 0)
    const isAlt   = idx % 2 === 1

    // row background
    if (isAlt) { doc.setFillColor(...ALT); doc.rect(ML, y, UW, ROW_H, 'F') }

    // status badge background
    const statusX = ML + COLS.slice(0, -1).reduce((s, c) => s + c.w, 0)
    const statusW = COLS[COLS.length - 1].w
    if (balance <= 0) {
      doc.setFillColor(...GRN_BG)
      doc.roundedRect(statusX + 1, y + 1, statusW - 2, ROW_H - 2, 1.5, 1.5, 'F')
    } else {
      doc.setFillColor(...RED_BG)
      doc.roundedRect(statusX + 1, y + 1, statusW - 2, ROW_H - 2, 1.5, 1.5, 'F')
    }

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.5)
    let rx = ML
    COLS.forEach(col => {
      let val = ''
      if (col.key === '_sno')                val = String(idx + 1)
      else if (col.key === 'member_id')      val = row.member_id || ''
      else if (col.key === 'member_name')    val = row.member_name || ''
      else if (col.key === 'previous_pending') val = row.previous_pending > 0 ? row.previous_pending.toLocaleString('en-IN') : '—'
      else if (col.key === 'current_year_purchase') val = row.current_year_purchase > 0 ? row.current_year_purchase.toLocaleString('en-IN') : '—'
      else if (col.key === 'total')          val = row.total > 0 ? row.total.toLocaleString('en-IN') : '—'
      else if (col.key === 'paid')           val = row.paid > 0 ? row.paid.toLocaleString('en-IN') : '—'
      else if (col.key === 'balance') {
        val = balance !== 0 ? Math.abs(balance).toLocaleString('en-IN') : '—'
      } else if (col.key === 'status') {
        val = balance <= 0 ? 'Cleared' : 'Pending'
      }

      const ty = y + ROW_H / 2 + 2.5
      const tx = col.align === 'C' ? rx + col.w / 2
               : col.align === 'R' ? rx + col.w - 2
               : rx + 2

      if (col.key === 'balance' && balance > 0)      doc.setTextColor(...RED_TXT)
      else if (col.key === 'status' && balance <= 0)  doc.setTextColor(...GRN_TXT)
      else if (col.key === 'status')                  doc.setTextColor(...RED_TXT)
      else                                            doc.setTextColor(...TEXT1)

      doc.text(val, tx, ty, { align: col.align === 'C' ? 'center' : col.align === 'R' ? 'right' : 'left' })
      rx += col.w
    })

    // thin bottom border
    doc.setDrawColor(200, 210, 230)
    doc.line(ML, y + ROW_H, ML + UW, y + ROW_H)
    y += ROW_H
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
    { label: 'TOTAL', w: COLS[0].w + COLS[1].w + COLS[2].w, align: 'L' },
    { label: summary.totalPrevPending > 0 ? summary.totalPrevPending.toLocaleString('en-IN') : '—', w: COLS[3].w, align: 'R' },
    { label: summary.totalCurrYear > 0 ? summary.totalCurrYear.toLocaleString('en-IN') : '—',  w: COLS[4].w, align: 'R' },
    { label: summary.totalDue > 0 ? summary.totalDue.toLocaleString('en-IN') : '—',      w: COLS[5].w, align: 'R' },
    { label: summary.totalPaid > 0 ? summary.totalPaid.toLocaleString('en-IN') : '—',     w: COLS[6].w, align: 'R' },
    { label: summary.totalBalance > 0 ? summary.totalBalance.toLocaleString('en-IN') : '—', w: COLS[7].w, align: 'R' },
    { label: '',                                                                            w: COLS[8].w, align: 'C' },
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
  const [generated,     setGenerated]     = useState(false)
  const [loadingImport, setLoadingImport] = useState(false)
  const [loadingCheck,  setLoadingCheck]  = useState(false)
  const [loadingData,   setLoadingData]   = useState(false)
  const [exporting,     setExporting]     = useState(false)
  const [preview,       setPreview]       = useState(null) // { rows, fileName } before confirm
  const [church,        setChurch]        = useState(null)

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
    try {
      // Find payment categories containing "auction"
      const { data: cats, error: catErr } = await supabase
        .from('payment_categories')
        .select('id,name')
        .ilike('name', '%auction%')
      if (catErr) throw catErr

      let paidMap = {}   // member_id → paid amount

      if (cats?.length) {
        const catIds = cats.map(c => c.id)

        // Get all receipts for this FY
        const { data: recs, error: recErr } = await supabase
          .from('receipts')
          .select('id,member_id')
          .eq('financial_year', filterFY)
        if (recErr) throw recErr

        if (recs?.length) {
          const recMap = {}
          recs.forEach(r => { recMap[r.id] = r.member_id })
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
            const mId = recMap[item.receipt_id]
            if (mId) paidMap[mId] = (paidMap[mId] || 0) + (item.total || 0)
          })
        }
      }

      // Build report rows
      const rows = trackerRows.map(tr => ({
        ...tr,
        previous_pending:     Number(tr.previous_pending)     || 0,
        current_year_purchase: Number(tr.current_year_purchase) || 0,
        total:                Number(tr.total)                || 0,
        paid:     paidMap[tr.member_id] || 0,
        balance:  (Number(tr.total) || 0) - (paidMap[tr.member_id] || 0),
      }))

      setReportRows(rows)
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

  // ── Excel export ───────────────────────────────────────────────
  const exportExcel = async () => {
    if (!reportRows.length) return
    setExporting(true)
    try {
      const churchName = church?.church_name || 'Church'
      const now        = new Date()
      const dateStr    = now.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })

      const titleLines = [
        { text: churchName,                       bold: true,  size: 14, bg: '1E3A5F', color: 'FFFFFF' },
        { text: `Auction Payment Report — FY ${filterFY}`, bold: true,  size: 12, bg: '0070C0', color: 'FFFFFF' },
        { text: `Generated: ${dateStr}`,           bold: false, size: 10, bg: 'EEF3FA', color: '374151' },
      ]

      const columns = [
        { header: '#',                   key: 'sno',                    align: 'center' },
        { header: 'Member ID',           key: 'member_id',              align: 'center' },
        { header: 'Member Name',         key: 'member_name',            align: 'left'   },
        { header: 'Prev. Pending (₹)',   key: 'previous_pending_fmt',   align: 'right'  },
        { header: 'Curr. Year (₹)',      key: 'current_year_fmt',       align: 'right'  },
        { header: 'Total Due (₹)',       key: 'total_fmt',              align: 'right'  },
        { header: 'Amount Paid (₹)',     key: 'paid_fmt',               align: 'right'  },
        { header: 'Balance (₹)',         key: 'balance_fmt',            align: 'right'  },
        { header: 'Status',              key: 'status',                 align: 'center' },
      ]

      const dataRows = reportRows.map((r, i) => ({
        sno:                  i + 1,
        member_id:            r.member_id,
        member_name:          r.member_name,
        previous_pending_fmt: r.previous_pending || '',
        current_year_fmt:     r.current_year_purchase || '',
        total_fmt:            r.total || '',
        paid_fmt:             r.paid || '',
        balance_fmt:          r.balance || '',
        status:               r.balance <= 0 ? 'Cleared' : 'Pending',
      }))

      // totals row
      dataRows.push({
        _bold: true,
        sno: '',
        member_id: '',
        member_name: 'TOTAL',
        previous_pending_fmt: summary.totalPrevPending || '',
        current_year_fmt:     summary.totalCurrYear    || '',
        total_fmt:            summary.totalDue         || '',
        paid_fmt:             summary.totalPaid        || '',
        balance_fmt:          summary.totalBalance     || '',
        status: `${summary.countCleared} Cleared / ${summary.countPending} Pending`,
      })

      const safeChurch = churchName.replace(/[^a-zA-Z0-9]/g, '_')
      await exportToExcelWithTitle(columns, dataRows, 'Auction Report', `Auction_Report_${safeChurch}_FY${filterFY}.xlsx`, titleLines)
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
      await exportAuctionPDF({ rows: reportRows, filterFY, church, summary })
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
              <span style={{ fontSize: 12, color: 'var(--text-3)' }}>FY {filterFY} · {reportRows.length} members</span>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
                <thead>
                  <tr style={{ background: 'var(--table-header-bg)' }}>
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
                    const cleared = row.balance <= 0
                    return (
                      <tr key={row.member_id} style={{ borderTop: '1px solid var(--table-border)', background: i % 2 === 0 ? 'transparent' : 'rgba(0,0,0,0.012)' }}>
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
                        <td style={{ padding: '9px 12px', textAlign: 'right', fontSize: 13, fontFamily: 'monospace', color: row.paid > 0 ? '#16a34a' : 'var(--text-3)' }}>
                          {row.paid > 0 ? row.paid.toLocaleString('en-IN') : '—'}
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
                            {cleared
                              ? <><CheckCircle size={11} /> Cleared</>
                              : <><XCircle    size={11} /> Pending</>
                            }
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr style={{ borderTop: '2px solid var(--table-border)', background: 'var(--table-header-bg)' }}>
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
