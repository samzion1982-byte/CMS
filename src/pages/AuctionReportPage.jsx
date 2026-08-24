import { logCmsAudit } from '../lib/cmsAudit'
/* ═══════════════════════════════════════════════════════════════
   AuctionReportPage.jsx
   ═══════════════════════════════════════════════════════════════ */

import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase, getChurch } from '../lib/supabase'
import { useToast } from '../lib/toast'
import { exportToExcelWithTitle } from '../lib/exportExcel'
import MasterPasswordInput from '../components/MasterPasswordInput'
import { verifyMasterPassword } from '../lib/masterPassword'
import { snapshotAuctionTrackerFY, snapshotCloseYearUndo, flushAllAuctionTracker } from '../lib/cmsRecycleBin'
import { uploadAuctionDocument, deleteAuctionDocument, listUploadedDocsForFY, listCloseReportsForFY } from '../lib/auctionDocumentsLib'
import {
  getAuctionSeason,
  upsertAuctionSeason,
  listCloseBalances,
  replaceCloseBalances,
  reopenAuctionSeason,
} from '../lib/auctionSeasonsLib'
import {
  Gavel, Upload, Loader2, FileSpreadsheet,
  FileText, CheckCircle, XCircle, AlertCircle, Info, ChevronDown, Download, X, Lock, Undo2, Calendar,
  Trash2,
} from 'lucide-react'
import PageHeader from '../components/ui/PageHeader'
import AuctionDocsPanel from '../components/AuctionDocsPanel'

// ── helpers (Auction Report FY = natural Apr–Mar of the Aug/Sep auction) ──

function getFY(dateStr) {
  const d = dateStr ? new Date(dateStr + 'T00:00:00') : new Date()
  const m = d.getMonth() + 1
  const y = d.getFullYear()
  // Apr–Mar FY: Aug/Sep auction in calendar Y → FY Y-(Y+1)
  return m >= 4 ? `${y}-${String((y + 1) % 100).padStart(2, '0')}` : `${y - 1}-${String(y % 100).padStart(2, '0')}`
}

/** Auction / Thanksgiving year = FY start year.
 *  Auction Aug/Sep 2025 → FY 2025-26 → label 2025
 */
function auctionYearFromFY(fy) {
  const y = parseInt(String(fy || '').slice(0, 4), 10)
  if (!Number.isFinite(y)) return new Date().getFullYear()
  return y
}

/** Next Apr–Mar FY: 2025-26 → 2026-27 (never 2026-26 / 2027-27) */
function nextFY(fy) {
  const y = parseInt(String(fy || '').slice(0, 4), 10)
  if (!Number.isFinite(y)) return getFY()
  const n = y + 1
  return `${n}-${String((n + 1) % 100).padStart(2, '0')}`
}

function previousFY(fy) {
  const y = parseInt(String(fy || '').slice(0, 4), 10)
  if (!Number.isFinite(y)) return getFY()
  return `${y - 1}-${String(y % 100).padStart(2, '0')}`
}

function isoDateLocal(d = new Date()) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function addYearsIso(iso, years = 1) {
  const [y, m, d] = String(iso || '').split('-').map(Number)
  if (!y || !m || !d) return isoDateLocal()
  return `${y + years}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

function dayBeforeIso(iso) {
  const d = new Date(String(iso) + 'T00:00:00')
  if (Number.isNaN(d.getTime())) return isoDateLocal()
  d.setDate(d.getDate() - 1)
  return isoDateLocal(d)
}

function memberKey(id) {
  return String(id || '').trim().toUpperCase()
}

function spillRangeFromSeason(season, fy) {
  const today = isoDateLocal()
  const from = season?.auction_date || defaultSpillRangeForFY(fy).from
  let to = today
  if (season?.status === 'closed' && season.close_cutoff_date) to = season.close_cutoff_date
  if (to < from) to = from
  return { from, to }
}

/** Default spill-over window: FY start (1 Apr) through today (includes payments after 31 Mar). */
function defaultSpillRangeForFY(fy, now = new Date()) {
  const y = parseInt(String(fy || '').slice(0, 4), 10)
  const today = isoDateLocal(now)
  if (!Number.isFinite(y)) return { from: today, to: today }
  const from = `${y}-04-01`
  return { from, to: today < from ? from : today }
}

function fyOptions() {
  const seen = new Set(), opts = []
  // Auction seasons from 2025 onward (drop older 2023-24 / 2024-25)
  const startY = 2025
  const endY = new Date().getFullYear() + 2
  for (let y = startY; y <= endY; y++) {
    const fy = `${y}-${String((y + 1) % 100).padStart(2, '0')}`
    if (!seen.has(fy)) { seen.add(fy); opts.push(fy) }
  }
  return opts.sort().reverse()
}

function fmtDateIN(s) {
  if (!s) return ''
  const [y, m, d] = String(s).split('-')
  if (!y || !m || !d) return s
  return `${d}/${m}/${y}`
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

/** Receipt FYs to scan for auction payments against a tracker FY.
 *  Includes next FY: late / legacy payments often sit on next-FY receipts
 *  (e.g. Auction 2025 tracker on 2025-26, payments receipted under 2026-27).
 */
function receiptFYsForAuctionCheck(fy) {
  const fys = [fy]
  const nxt = nextFY(fy)
  if (nxt && nxt !== fy) fys.push(nxt)
  return fys
}

/** Paid totals (+ optional receipt details) for auction category.
 *  Close Year: receipts tagged FY + next FY.
 *  Spill-over: receipts whose receipt_date is in [dateFrom, dateTo] (inclusive).
 */
async function fetchAuctionPaidForFY(fy, { withDetails = false, dateFrom, dateTo } = {}) {
  const paidMap = {}
  const detailsMap = {}

  const { data: cats, error: catErr } = await supabase
    .from('payment_categories')
    .select('id,name')
    .ilike('name', '%auction%')
  if (catErr) throw catErr
  if (!cats?.length) return { paidMap, detailsMap }

  const catIds = cats.map(c => c.id)
  const byDate = !!(dateFrom && dateTo)

  // Paginate receipts — PostgREST/Supabase caps each request at 1000 rows.
  // FY 2026-27 alone has 2700+ receipts; without paging, newer payments are missed.
  const PAGE = 1000
  const recs = []
  let from = 0
  for (;;) {
    let q = supabase
      .from('receipts')
      .select('id,member_id,receipt_number,receipt_date,month_paid,payment_mode')
      .order('id')
    if (byDate) q = q.gte('receipt_date', dateFrom).lte('receipt_date', dateTo)
    else q = q.in('financial_year', receiptFYsForAuctionCheck(fy))
    const { data, error } = await q.range(from, from + PAGE - 1)
    if (error) throw error
    if (!data?.length) break
    recs.push(...data)
    if (data.length < PAGE) break
    from += PAGE
  }
  if (!recs.length) return { paidMap, detailsMap }

  const recMap = {}
  recs.forEach(r => { recMap[r.id] = r })
  const recIds = recs.map(r => r.id)
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
    const mId = memberKey(rec.member_id)
    paidMap[mId] = (paidMap[mId] || 0) + (item.total || 0)
    if (withDetails) {
      if (!detailsMap[mId]) detailsMap[mId] = []
      detailsMap[mId].push({
        receipt_number: rec.receipt_number || '—',
        receipt_date:   rec.receipt_date   || '',
        month_paid:     rec.month_paid      || '',
        payment_mode:   rec.payment_mode    || '',
        amount:         item.total          || 0,
      })
    }
  })

  if (withDetails) {
    Object.values(detailsMap).forEach(arr =>
      arr.sort((a, b) => (a.receipt_date || '').localeCompare(b.receipt_date || ''))
    )
  }
  return { paidMap, detailsMap }
}

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
          const memberId = String(row[ci.memberId] || '').trim().toUpperCase()
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

/** Parse Total Purchase sheet from Auction Prep / Credit Purchase workbook */
async function parseTotalPurchaseFile(file) {
  const xlsxMod = await import('xlsx')
  const { read, utils } = xlsxMod.default ?? xlsxMod
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Failed to read file'))
    reader.onload = (e) => {
      try {
        const wb = read(e.target.result, { type: 'array' })
        const sName = wb.SheetNames.find(n => {
          const l = n.toLowerCase()
          return l.includes('total purchase') || l === 'total purchase'
        }) || wb.SheetNames.find(n => n.toLowerCase().includes('total')) || wb.SheetNames[0]
        const ws = wb.Sheets[sName]
        const rows = utils.sheet_to_json(ws, { header: 1, defval: '' })

        let headerIdx = -1
        for (let i = 0; i < Math.min(rows.length, 20); i++) {
          const cells = (rows[i] || []).map(h => String(h).toLowerCase().trim())
          const joined = cells.join(' | ')
          if (joined.includes('member id') && (joined.includes('purchase') || joined.includes('member name'))) {
            headerIdx = i
            break
          }
          if (cells.some(c => c === 'member id') && cells.some(c => c.includes('name'))) {
            headerIdx = i
            break
          }
        }
        if (headerIdx === -1) throw new Error('Could not find Total Purchase header row (Member ID / Member Name / Current Year Purchase)')

        const headers = rows[headerIdx].map(h => String(h).toLowerCase().trim())
        const idxOf = (...keys) => {
          for (const k of keys) {
            const i = headers.findIndex(h => h.includes(k))
            if (i >= 0) return i
          }
          return -1
        }
        const ci = {
          memberId:   idxOf('member id', 'memberid'),
          memberName: idxOf('member name', 'name'),
          previousPending: idxOf('previous pending', 'prev. pending', 'prev pending'),
          currentYearPurchase: idxOf('current year purchase', 'current year'),
        }
        if (ci.currentYearPurchase === -1) ci.currentYearPurchase = idxOf('purchase')
        if (ci.memberId === -1) throw new Error('Column "Member ID" not found on Total Purchase sheet')
        if (ci.memberName === -1) throw new Error('Column "Member Name" not found on Total Purchase sheet')
        if (ci.currentYearPurchase === -1) throw new Error('Column "Current Year Purchase" not found on Total Purchase sheet')

        const hasPrevCol = ci.previousPending >= 0
        const data = []
        for (let i = headerIdx + 1; i < rows.length; i++) {
          const row = rows[i]
          const memberId = String(row[ci.memberId] || '').trim().toUpperCase()
          const nameRaw = String(row[ci.memberName] || '').trim()
          if (!memberId) continue
          if (/^grand\s*total$/i.test(nameRaw)) continue
          const current_year_purchase = parseNum(row[ci.currentYearPurchase])
          const previous_pending = hasPrevCol ? parseNum(row[ci.previousPending]) : null
          const prevAmt = previous_pending || 0
          data.push({
            member_id: memberId,
            member_name: nameRaw,
            previous_pending,
            current_year_purchase,
            total: prevAmt + current_year_purchase,
          })
        }
        if (data.length === 0) throw new Error('No member rows found on Total Purchase sheet')
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

async function exportAuctionPDF({ rows, filterFY, church, summary, paidDetailsMap = {}, dateFrom, dateTo } = {}) {
  const { jsPDF } = await import('jspdf')
  const auctionYr = auctionYearFromFY(filterFY)
  const isSpill = !!(dateFrom && dateTo)
  const rangeLabel = isSpill ? `${fmtDateIN(dateFrom)} to ${fmtDateIN(dateTo)}` : ''

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
  doc.text(
    isSpill
      ? `AUCTION SPILL-OVER REPORT — FY ${filterFY} (Auction ${auctionYr})  ·  ${rangeLabel}`
      : `AUCTION PAYMENT REPORT — FY ${filterFY} (Auction ${auctionYr})`,
    PW / 2, y + 6, { align: 'center' },
  )
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
    { label: isSpill ? 'Opening' : 'Prev Pending',  w: 28,  align: 'R', key: 'previous_pending' },
    { label: String(auctionYr), w: 28,  align: 'R', key: 'current_year_purchase' },
    { label: 'Total Due',     w: 28,  align: 'R', key: 'total'          },
    { label: isSpill ? 'Payments' : 'Amount Paid',   w: 28,  align: 'R', key: 'paid'           },
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
  const rangeFile = isSpill ? `_${dateFrom}_to_${dateTo}` : ''
  doc.save(`${isSpill ? 'Auction_Spillover' : 'Auction_Report'}_${safeChurch}_FY${filterFY}${rangeFile}.pdf`)
}

// ══════════════════════════════════════════════════════════════════
//  Main page
// ══════════════════════════════════════════════════════════════════

export default function AuctionReportPage() {
  const toast = useToast()
  const fileRef = useRef(null)

  const [filterFY,      setFilterFY]      = useState(() => getFY())
  const [trackerRows,   setTrackerRows]   = useState([])   // imported data from auction_tracker
  const [reportRows,    setReportRows]    = useState([])   // after Spill-over Report
  const [generated,       setGenerated]       = useState(false)
  const [loadingImport,   setLoadingImport]   = useState(false)
  const [loadingData,     setLoadingData]     = useState(false)
  const [exporting,       setExporting]       = useState(false)
  const [preview,         setPreview]         = useState(null) // { rows, fileName, mode, file }
  const [church,          setChurch]          = useState(null)
  const [paidDetailsMap,  setPaidDetailsMap]  = useState({})  // member_id → [{receipt_number,receipt_date,month_paid,payment_mode,amount}]
  const [expandedMember,  setExpandedMember]  = useState(null)
  const [closeModalOpen,  setCloseModalOpen]  = useState(false)
  const [closePw,         setClosePw]         = useState('')
  const [closePwError,    setClosePwError]    = useState('')
  const [closePreview,    setClosePreview]    = useState(null) // Stage 1 close report
  const [closePolicy,     setClosePolicy]     = useState('carry')
  const [closeNextAuctionDate, setCloseNextAuctionDate] = useState('')
  const [loadingClose,    setLoadingClose]    = useState(false)
  const [showClosePw,     setShowClosePw]     = useState(false)
  const [revertModalOpen, setRevertModalOpen] = useState(false)
  const [revertPreview,   setRevertPreview]   = useState(null) // { fromFY, toFY, nextCount }
  const [revertPw,        setRevertPw]        = useState('')
  const [revertPwError,   setRevertPwError]   = useState('')
  const [showRevertPw,    setShowRevertPw]    = useState(false)
  const [loadingRevert,   setLoadingRevert]   = useState(false)
  const [spillModalOpen,  setSpillModalOpen]  = useState(false)
  const [spillFrom,       setSpillFrom]       = useState(() => defaultSpillRangeForFY(getFY()).from)
  const [spillTo,         setSpillTo]         = useState(() => defaultSpillRangeForFY(getFY()).to)
  const [loadingSpill,    setLoadingSpill]    = useState(false)
  const [reportKind,      setReportKind]      = useState('spillover') // 'spillover'
  const [spillRange,      setSpillRange]      = useState(null) // { from, to } when spillover generated
  const [season,          setSeason]          = useState(null)
  const [prevSeason,      setPrevSeason]      = useState(null)
  const [importAuctionDate, setImportAuctionDate] = useState('')
  const [docsRefreshKey,  setDocsRefreshKey]  = useState(0)
  const [flushModalOpen,  setFlushModalOpen]  = useState(false)
  const [flushPw,         setFlushPw]         = useState('')
  const [flushPwError,    setFlushPwError]    = useState('')
  const [showFlushPw,     setShowFlushPw]     = useState(false)
  const [flushing,        setFlushing]        = useState(false)
  const [deleteDocModal,  setDeleteDocModal]  = useState(null) // { doc, reload }
  const [deleteDocPw,     setDeleteDocPw]     = useState('')
  const [deleteDocPwError,setDeleteDocPwError]= useState('')
  const [showDeleteDocPw, setShowDeleteDocPw] = useState(false)
  const [deletingDoc,     setDeletingDoc]     = useState(false)


  const auctionYear = auctionYearFromFY(filterFY)
  const currYearColLabel = String(auctionYear)
  const isSpillReport = reportKind === 'spillover' && spillRange
  const spillRangeLabel = isSpillReport ? `${fmtDateIN(spillRange.from)} to ${fmtDateIN(spillRange.to)}` : ''

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
      setReportKind('spillover')
      setSpillRange(null)
      const s = await getAuctionSeason(fy)
      setSeason(s)
      const prev = await getAuctionSeason(previousFY(fy))
      setPrevSeason(prev)
      const range = spillRangeFromSeason(s, fy)
      setSpillFrom(range.from)
      setSpillTo(range.to)
    } catch (e) {
      toast(e.message, 'error')
    }
    setLoadingData(false)
  }, [toast])

  useEffect(() => { loadTracker(filterFY) }, [filterFY, loadTracker])

  const handleFYChange = (fy) => {
    setFilterFY(fy)
    setPreview(null)
    setSpillModalOpen(false)
    const range = defaultSpillRangeForFY(fy)
    setSpillFrom(range.from)
    setSpillTo(range.to)
  }

  const handleFilePick = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setLoadingImport(true)
    try {
      const xlsxMod = await import('xlsx')
      const { read } = xlsxMod.default ?? xlsxMod
      const buf = await file.arrayBuffer()
      const wb = read(buf, { type: 'array', cellDates: true })
      const hasTotalPurchase = (wb.SheetNames || []).some((n) => {
        const l = String(n).toLowerCase()
        return l.includes('total purchase') || l === 'total purchase'
      })
      const rows = hasTotalPurchase
        ? await parseTotalPurchaseFile(file)
        : await parseAuctionFile(file)
      setPreview({
        rows,
        fileName: file.name,
        mode: hasTotalPurchase ? 'total_purchase' : 'tracker',
        file,
      })
      const s = season || await getAuctionSeason(filterFY)
      setImportAuctionDate(s?.auction_date || `${auctionYearFromFY(filterFY)}-09-01`)
    } catch (err) {
      toast(err.message, 'error')
    }
    setLoadingImport(false)
  }

  // ── Confirm import → save to Supabase ─────────────────────────
  const confirmImport = async () => {
    if (!preview) return
    if (!importAuctionDate) {
      toast('Enter the current year auction date', 'error')
      return
    }
    setLoadingImport(true)
    try {
      const existingSeason = await getAuctionSeason(filterFY)
      if (existingSeason?.status === 'closed') {
        throw new Error(`FY ${filterFY} is already closed. Undo Close Year first (Alt+Click Close Year), then import.`)
      }
      const existingFiles = await listUploadedDocsForFY(filterFY)
      if (existingFiles.length) {
        throw new Error(`FY ${filterFY} already has an uploaded file. Delete it (master password), then import the correct file.`)
      }

      const seen = new Map()
      preview.rows.forEach(r => seen.set(memberKey(r.member_id), r))
      const fileRows = [...seen.values()]

      const prevSeason = await getAuctionSeason(previousFY(filterFY))
      const prevClosedCarry = prevSeason?.status === 'closed' && prevSeason.close_policy === 'carry'
      const carryRows = prevClosedCarry
        ? await listCloseBalances(previousFY(filterFY))
        : []
      const carryMap = new Map(carryRows.map(r => [memberKey(r.member_id), r]))
      const forfeitPrev = prevSeason?.status === 'closed' && prevSeason.close_policy === 'forfeit'

      await snapshotAuctionTrackerFY(filterFY, {
        operation: 'total_purchase_upload',
        notes: `Before Total Purchase import (${preview.fileName})`,
      })

      const { data: existing, error: loadErr } = await supabase
        .from('auction_tracker')
        .select('member_id,member_name,previous_pending,current_year_purchase,total')
        .eq('financial_year', filterFY)
      if (loadErr) throw loadErr

      const existingMap = new Map(
        (existing || []).map(r => [memberKey(r.member_id), r]),
      )

      const upserts = fileRows.map(r => {
        const key = memberKey(r.member_id)
        const prev = existingMap.get(key)
        const current_year_purchase = Number(r.current_year_purchase) || 0
        let previous_pending = 0
        if (forfeitPrev) {
          previous_pending = 0
        } else if (prevClosedCarry) {
          previous_pending = Number(carryMap.get(key)?.balance) || 0
        } else if (r.previous_pending != null) {
          previous_pending = Number(r.previous_pending) || 0
        } else {
          previous_pending = prev ? (Number(prev.previous_pending) || 0) : 0
        }
        return {
          member_id: prev?.member_id || key,
          member_name: r.member_name || prev?.member_name || carryMap.get(key)?.member_name || '',
          previous_pending,
          current_year_purchase,
          total: previous_pending + current_year_purchase,
          financial_year: filterFY,
        }
      })

      if (carryMap.size) {
        for (const [key, c] of carryMap) {
          if (upserts.some(u => memberKey(u.member_id) === key)) continue
          const prev = existingMap.get(key)
          const previous_pending = Number(c.balance) || 0
          upserts.push({
            member_id: prev?.member_id || key,
            member_name: c.member_name || prev?.member_name || '',
            previous_pending,
            current_year_purchase: prev ? (Number(prev.current_year_purchase) || 0) : 0,
            total: previous_pending + (prev ? (Number(prev.current_year_purchase) || 0) : 0),
            financial_year: filterFY,
          })
        }
      }

      const CHUNK = 500
      for (let i = 0; i < upserts.length; i += CHUNK) {
        const { error } = await supabase
          .from('auction_tracker')
          .upsert(upserts.slice(i, i + CHUNK), { onConflict: 'financial_year,member_id' })
        if (error) throw error
      }

      await upsertAuctionSeason(filterFY, {
        auction_date: importAuctionDate,
        status: 'open',
        close_policy: null,
        next_auction_date: null,
        close_cutoff_date: null,
        closed_at: null,
      })

      await logCmsAudit({
        action: 'saved', module: 'auction', entityType: 'auction_tracker',
        entityId: filterFY,
        summary: `Imported ${upserts.length} Total Purchase rows (FY ${filterFY}, auction ${importAuctionDate})`,
      })
      toast(`Imported ${upserts.length} members for FY ${filterFY}. Auction date ${fmtDateIN(importAuctionDate)}.`, 'success')

      if (preview.file) {
        try {
          await uploadAuctionDocument({
            fy: filterFY,
            file: preview.file,
            kind: 'current_year',
          })
          setDocsRefreshKey((k) => k + 1)
        } catch (fileErr) {
          toast(`Tracker saved, but the reference file was not stored: ${fileErr.message}`, 'error')
        }
      }

      setPreview(null)
      setImportAuctionDate('')
      setGenerated(false)
      setReportRows([])
      await loadTracker(filterFY)
    } catch (e) {
      toast(e.message, 'error')
    }
    setLoadingImport(false)
  }

  // ── Spill-over report (payments in a chosen date range only) ──
  const confirmSpilloverReport = async () => {
    if (!trackerRows.length) { toast('Import the Total Purchase file first', 'error'); return }
    if (!spillFrom || !spillTo) { toast('Select a date range', 'error'); return }
    if (spillFrom > spillTo) { toast('From date must be on or before To date', 'error'); return }
    setLoadingSpill(true)
    setExpandedMember(null)
    try {
      const { paidMap, detailsMap } = await fetchAuctionPaidForFY(filterFY, {
        withDetails: true,
        dateFrom: spillFrom,
        dateTo: spillTo,
      })
      const detailsById = {}
      const rows = trackerRows.map(tr => {
        const paid = paidMap[memberKey(tr.member_id)] || 0
        detailsById[tr.member_id] = detailsMap[memberKey(tr.member_id)] || []
        return {
          ...tr,
          previous_pending:      Number(tr.previous_pending)      || 0,
          current_year_purchase: Number(tr.current_year_purchase) || 0,
          total:                 Number(tr.total)                 || 0,
          paid,
          balance: (Number(tr.total) || 0) - paid,
        }
      })
      setReportRows(rows)
      setPaidDetailsMap(detailsById)
      setGenerated(true)
      setReportKind('spillover')
      setSpillRange({ from: spillFrom, to: spillTo })
      setSpillModalOpen(false)
    } catch (e) {
      toast(e.message, 'error')
    }
    setLoadingSpill(false)
  }

  // ── Close auction year (Forfeit vs Carry; freeze this FY) ──
  const openCloseYearModal = async () => {
    if (!trackerRows.length) {
      toast('No tracker rows for this FY to close', 'error')
      return
    }
    const s = season || await getAuctionSeason(filterFY)
    if (s?.status === 'closed') {
      toast('This year is already closed. Alt+Click Close Year to undo, then close again.', 'error')
      return
    }
    setLoadingClose(true)
    setClosePw('')
    setClosePwError('')
    try {
      const fromFY = filterFY
      const toFY = nextFY(fromFY)
      const auctionDate = s?.auction_date || `${auctionYearFromFY(fromFY)}-09-01`
      const nextDate = addYearsIso(auctionDate, 1)
      setCloseNextAuctionDate(nextDate)
      setClosePolicy('carry')
      const cutoff = dayBeforeIso(nextDate)
      const { paidMap, detailsMap } = await fetchAuctionPaidForFY(fromFY, {
        withDetails: true,
        dateFrom: auctionDate,
        dateTo: cutoff,
      })
      const detailsById = {}
      const allRows = trackerRows.map(tr => {
        const paid = paidMap[memberKey(tr.member_id)] || 0
        const total = Number(tr.total) || 0
        detailsById[tr.member_id] = detailsMap[memberKey(tr.member_id)] || []
        const balance = total - paid
        return {
          ...tr,
          previous_pending: Number(tr.previous_pending) || 0,
          current_year_purchase: Number(tr.current_year_purchase) || 0,
          total,
          paid,
          balance,
          member_id: tr.member_id,
          member_name: tr.member_name,
        }
      })
      const carryRows = allRows.filter(r => r.balance > 0).map(r => ({
        member_id: r.member_id,
        member_name: r.member_name,
        balance: r.balance,
        previous_pending: r.balance,
        total: r.total,
        paid: r.paid,
      }))
      setClosePreview({
        fromFY,
        toFY,
        auctionDate,
        nextAuctionDate: nextDate,
        cutoff,
        allRows,
        detailsById,
        rows: carryRows,
        allCount: allRows.length,
        totalCarry: carryRows.reduce((s, r) => s + r.balance, 0),
      })
      setCloseModalOpen(true)
    } catch (e) {
      toast(e.message, 'error')
    }
    setLoadingClose(false)
  }

  const confirmCloseYear = async () => {
    if (!closePreview) return
    if (!closeNextAuctionDate) {
      setClosePwError('Enter the next auction date.')
      return
    }
    if (!closePolicy) {
      setClosePwError('Choose Forfeit or Carry forward.')
      return
    }
    const ok = await verifyMasterPassword(closePw)
    if (!ok) {
      setClosePwError('Incorrect master password.')
      setClosePw('')
      return
    }
    setLoadingClose(true)
    setClosePwError('')
    try {
      const { fromFY, toFY, auctionDate } = closePreview
      const thisAuctionDate = auctionDate || closePreview.auctionDate
      const cutoff = dayBeforeIso(closeNextAuctionDate)
      const { paidMap, detailsMap } = await fetchAuctionPaidForFY(fromFY, {
        withDetails: true,
        dateFrom: thisAuctionDate,
        dateTo: cutoff,
      })
      const detailsById = {}
      const allRows = trackerRows.map(tr => {
        const paid = paidMap[memberKey(tr.member_id)] || 0
        const total = Number(tr.total) || 0
        detailsById[tr.member_id] = detailsMap[memberKey(tr.member_id)] || []
        return {
          ...tr,
          previous_pending: Number(tr.previous_pending) || 0,
          current_year_purchase: Number(tr.current_year_purchase) || 0,
          total,
          paid,
          balance: total - paid,
          member_id: tr.member_id,
          member_name: tr.member_name,
        }
      })
      const { count: nextCount, error: nextErr } = await supabase
        .from('auction_tracker')
        .select('id', { count: 'exact', head: true })
        .eq('financial_year', toFY)
      if (nextErr) throw nextErr

      await snapshotCloseYearUndo({
        fromFY,
        toFY,
        priorRows: [],
        extra: {
          season: season,
          closeBalances: await listCloseBalances(fromFY),
          nextTrackerCount: nextCount || 0,
        },
        notes: `Before close ${fromFY} (${closePolicy}) cutoff ${cutoff}`,
      })

      const carryRows = closePolicy === 'carry'
        ? allRows.filter(r => r.balance > 0).map(r => ({
            member_id: r.member_id,
            member_name: r.member_name,
            balance: r.balance,
          }))
        : []
      await upsertAuctionSeason(fromFY, {
        auction_date: thisAuctionDate,
        next_auction_date: closeNextAuctionDate,
        close_cutoff_date: cutoff,
        status: 'closed',
        close_policy: closePolicy,
        closed_at: new Date().toISOString(),
      })
      await replaceCloseBalances(fromFY, carryRows)

      setReportRows(allRows)
      setPaidDetailsMap(detailsById)
      setGenerated(true)
      setReportKind('spillover')
      setSpillRange({ from: thisAuctionDate, to: cutoff })

      try {
        const blob = await exportExcel({
          rowsOverride: allRows,
          detailsOverride: detailsById,
          includeDefaulters: true,
          download: false,
          reportTitle: `Auction Close Report — ${closePolicy === 'forfeit' ? 'Forfeit' : 'Carry'}`,
          dateFrom: thisAuctionDate,
          dateTo: cutoff,
          fy: fromFY,
        })
        if (blob) {
          const existingClose = await listCloseReportsForFY(fromFY)
          for (const doc of existingClose) {
            await deleteAuctionDocument(doc)
          }
          const file = new File(
            [blob],
            `Auction_Close_${fromFY}_${cutoff}.xlsx`,
            { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
          )
          await uploadAuctionDocument({ fy: fromFY, file, kind: 'close_report' })
          setDocsRefreshKey((k) => k + 1)
        }
      } catch (fileErr) {
        toast(`Year closed, but the close report was not stored: ${fileErr.message}`, 'error')
      }

      await logCmsAudit({
        action: 'saved', module: 'auction', entityType: 'auction_seasons',
        entityId: fromFY,
        summary: `Closed auction FY ${fromFY} as ${closePolicy} (cutoff ${cutoff}). Next auction ${closeNextAuctionDate}.`,
      })
      toast(
        closePolicy === 'forfeit'
          ? `Closed FY ${fromFY} (Forfeit). Next season starts clean when you import. Alt+Click Close Year to undo.`
          : `Closed FY ${fromFY} (Carry). Import the new Total Purchase for FY ${toFY} to open next year. Alt+Click Close Year to undo.`,
        'success',
      )
      setCloseModalOpen(false)
      setClosePreview(null)
      setClosePw('')
      setFilterFY(toFY)
    } catch (e) {
      toast(e.message, 'error')
    }
    setLoadingClose(false)
  }

  const openRevertCloseYearModal = async () => {
    setLoadingRevert(true)
    setRevertPw('')
    setRevertPwError('')
    try {
      let fromFY = filterFY
      let s = await getAuctionSeason(fromFY)
      if (s?.status !== 'closed') {
        const prev = previousFY(filterFY)
        s = await getAuctionSeason(prev)
        if (s?.status === 'closed') fromFY = prev
      }
      if (s?.status !== 'closed') {
        toast('This year is not closed. Nothing to undo.', 'error')
        setLoadingRevert(false)
        return
      }
      const toFY = nextFY(fromFY)
      const { count, error: countErr } = await supabase
        .from('auction_tracker')
        .select('*', { count: 'exact', head: true })
        .eq('financial_year', toFY)
      if (countErr) throw countErr
      const nextSeason = await getAuctionSeason(toFY)
      setRevertPreview({
        fromFY,
        toFY,
        nextCount: count || 0,
        hasNextSeason: !!nextSeason,
        policy: s.close_policy,
      })
      setRevertModalOpen(true)
    } catch (e) {
      toast(e.message, 'error')
    }
    setLoadingRevert(false)
  }

  const confirmRevertCloseYear = async () => {
    if (!revertPreview) return
    const ok = await verifyMasterPassword(revertPw)
    if (!ok) {
      setRevertPwError('Incorrect master password.')
      setRevertPw('')
      return
    }
    setLoadingRevert(true)
    setRevertPwError('')
    try {
      const { fromFY, toFY, nextCount, hasNextSeason } = revertPreview
      const clearNext = (nextCount > 0) || hasNextSeason
      await snapshotCloseYearUndo({
        fromFY,
        toFY,
        priorRows: [],
        extra: { season: await getAuctionSeason(fromFY) },
        notes: `Before undo close ${fromFY}`,
      })

      if (clearNext) {
        await snapshotAuctionTrackerFY(toFY, {
          operation: 'undo_close_year_clear_next',
          notes: `Before undo close ${fromFY}: clearing imported FY ${toFY}`,
        })
      }

      const reopened = await reopenAuctionSeason(fromFY)
      if (!reopened || reopened.status !== 'open') {
        throw new Error(`Could not reopen FY ${fromFY}. Check that auction_seasons exists on this church.`)
      }

      if (clearNext) {
        const { error: balErr } = await supabase.from('auction_close_balances').delete().eq('financial_year', toFY)
        if (balErr && !String(balErr.message || '').includes('auction_close_balances')) throw balErr
        const { error: seasonErr } = await supabase.from('auction_seasons').delete().eq('financial_year', toFY)
        if (seasonErr && !String(seasonErr.message || '').includes('auction_seasons')) throw seasonErr
        const { error: trErr } = await supabase.from('auction_tracker').delete().eq('financial_year', toFY)
        if (trErr) throw trErr
        const nextDocs = [
          ...(await listUploadedDocsForFY(toFY)),
          ...(await listCloseReportsForFY(toFY)),
        ]
        for (const doc of nextDocs) {
          try { await deleteAuctionDocument(doc) } catch (e) { console.warn('undo close: file', doc.path, e) }
        }
        setDocsRefreshKey((k) => k + 1)
      }

      await logCmsAudit({
        action: 'saved', module: 'auction', entityType: 'auction_seasons',
        entityId: fromFY,
        summary: clearNext
          ? `Undid Close Year ${fromFY} and removed the ${toFY} import. Close ${fromFY} again as Forfeit or Carry, then import ${toFY}.`
          : `Undid Close Year ${fromFY}. Season is open. Close again to choose Forfeit or Carry.`,
      })
      toast(
        clearNext
          ? `FY ${fromFY} is open again. Removed the ${toFY} import${nextCount ? ` (${nextCount} members)` : ''} so you can close ${fromFY} as Forfeit or Carry, then import ${toFY} again.`
          : `FY ${fromFY} is open again. Close Year and choose Forfeit or Carry.`,
        'success',
      )
      setRevertModalOpen(false)
      setRevertPreview(null)
      setRevertPw('')
      setFilterFY(fromFY)
      await loadTracker(fromFY)
    } catch (e) {
      toast(e.message, 'error')
    }
    setLoadingRevert(false)
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
  const exportExcel = async (opts = {}) => {
    if (opts && typeof opts.preventDefault === 'function') opts = {}
    const rows = opts.rowsOverride || reportRows
    const details = opts.detailsOverride || paidDetailsMap
    const includeDefaulters = !!opts.includeDefaulters
    const doDownload = opts.download !== false
    const dateFrom = opts.dateFrom || spillRange?.from
    const dateTo = opts.dateTo || spillRange?.to
    const fyLabel = opts.fy || filterFY
    if (!rows.length) return null
    setExporting(true)
    try {
      const ExcelJS    = (await import('exceljs')).default
      const churchName = church?.church_name || 'Church'
      const now        = new Date()
      const dateStr    = now.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
      const NCOLS      = 9

      const isSpill = !!(dateFrom && dateTo)
      const rangeLabel = isSpill ? `${fmtDateIN(dateFrom)} to ${fmtDateIN(dateTo)}` : ''
      const reportName = opts.reportTitle || (isSpill ? 'Auction Spill-over Report' : 'Auction Payment Report')
      const sheetSummary = {
        totalMembers:     rows.length,
        totalPrevPending: rows.reduce((s, r) => s + (Number(r.previous_pending) || 0), 0),
        totalCurrYear:    rows.reduce((s, r) => s + (Number(r.current_year_purchase) || 0), 0),
        totalDue:         rows.reduce((s, r) => s + (Number(r.total) || 0), 0),
        totalPaid:        rows.reduce((s, r) => s + (Number(r.paid) || 0), 0),
        totalBalance:     rows.reduce((s, r) => s + (Number(r.balance) || 0), 0),
        countCleared:     rows.filter(r => (Number(r.balance) || 0) <= 0).length,
        countPending:     rows.filter(r => (Number(r.balance) || 0) > 0).length,
      }

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
      const HDR_LABELS = ['#', 'Member ID', 'Member Name', isSpill ? 'Opening (₹)' : 'Prev. Pending (₹)', `${auctionYear} (₹)`, 'Total Due (₹)', isSpill ? 'Payments (₹)' : 'Amount Paid (₹)', 'Balance (₹)', 'Status']
      const fmtDate = s => { if (!s) return ''; const [y, m, d] = s.split('-'); return `${d}/${m}/${y}` }

      // ── shared: build title block + col headers on a worksheet ──
      const buildSheetHeader = (ws, sheetTitle) => {
        ws.columns = COL_W.map((w, i) => ({ key: String.fromCharCode(97 + i), width: w }))
        ws.views = [{ state: 'frozen', ySplit: 4 }]

        const titles = [
          { text: churchName,                                    bold: true,  size: 14, bg: C_HDR, fg: C_WHITE },
          { text: `${sheetTitle} — FY ${fyLabel}${rangeLabel ? ` · ${rangeLabel}` : ''}`, bold: true,  size: 12, bg: C_SUB, fg: C_WHITE },
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
          '', 'TOTAL', '', sheetSummary.totalPrevPending || null, sheetSummary.totalCurrYear || null,
          sheetSummary.totalDue || null, sheetSummary.totalPaid || null, sheetSummary.totalBalance || null,
          `${sheetSummary.countCleared}✓ / ${sheetSummary.countPending}✗`,
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
      buildSheetHeader(wsSummary, `${reportName} (Summary)`)
      rows.forEach((row, i) => {
        addMemberRow(wsSummary, row, i, i === rows.length - 1)
      })
      addTotalRow(wsSummary)

      // ════════════════════════════════
      //  Sheet 2 — Detailed (with receipt sub-rows)
      // ════════════════════════════════
      const wsDetail = wb.addWorksheet('Detailed')
      buildSheetHeader(wsDetail, `${reportName} (Detailed)`)

      rows.forEach((row, i) => {
        const recs = details[row.member_id] || []
        const isLast  = i === rows.length - 1 && recs.length === 0
        addMemberRow(wsDetail, row, i, isLast)

        if (!recs.length) return

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
        recs.forEach((d, di) => {
          const isLastDetail = di === recs.length - 1
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
        const st = wsDetail.addRow(['', '', `Total Paid (${recs.length} receipt${recs.length !== 1 ? 's' : ''})`, '', '', '', row.paid || null, '', ''])
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

      // ════════════════════════════════
      //  Sheet 3 — Monthwise breakup (payments by receipt month)
      // ════════════════════════════════
      const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
      const monthKey = s => (s && String(s).length >= 7) ? String(s).slice(0, 7) : ''
      const monthLabel = ym => {
        const [yy, mm] = String(ym).split('-')
        const mi = Number(mm) - 1
        if (!yy || mi < 0 || mi > 11) return ym
        return `${MONTH_NAMES[mi]}-${String(yy).slice(2)}`
      }
      const monthsInRange = (from, to) => {
        const out = []
        const [fy, fm] = String(from).split('-').map(Number)
        const [ty, tm] = String(to).split('-').map(Number)
        if (!fy || !fm || !ty || !tm) return out
        let y = fy, m = fm
        while (y < ty || (y === ty && m <= tm)) {
          out.push(`${y}-${String(m).padStart(2, '0')}`)
          m += 1
          if (m > 12) { m = 1; y += 1 }
        }
        return out
      }

      let monthKeys
      if (isSpill && dateFrom && dateTo) {
        monthKeys = monthsInRange(dateFrom, dateTo)
      } else {
        const seen = new Set()
        Object.values(details).forEach(arr => {
          (arr || []).forEach(d => { const k = monthKey(d.receipt_date); if (k) seen.add(k) })
        })
        monthKeys = [...seen].sort()
      }

      const monthStartCol = 7
      const monthEndCol = monthKeys.length ? 6 + monthKeys.length : 6
      const mwN = 3 + 3 + monthKeys.length + 3
      const mwHdr = [
        '#', 'Member ID', 'Member Name',
        'Opening (₹)', `${auctionYear} (₹)`, 'Total Due (₹)',
        ...monthKeys.map(monthLabel),
        'Total Paid (₹)', 'Closing Balance (₹)', 'Status',
      ]
      const wsMonth = wb.addWorksheet('Monthwise Breakup')
      wsMonth.columns = [
        { width: 7 }, { width: 18 }, { width: 32 },
        { width: 14 }, { width: 14 }, { width: 14 },
        ...monthKeys.map(() => ({ width: 12 })),
        { width: 16 }, { width: 18 }, { width: 14 },
      ]
      wsMonth.views = [{ state: 'frozen', ySplit: 5, xSplit: 3 }]
      wsMonth.properties.outlineLevelCol = monthKeys.length ? 1 : 0
      wsMonth.properties.outlineProperties = { summaryBelow: true, summaryRight: true }

      const mwTitles = [
        { text: churchName, bold: true,  size: 14, bg: C_HDR, fg: C_WHITE },
        { text: `${reportName} (Monthwise Breakup) — FY ${fyLabel}${rangeLabel ? ` · ${rangeLabel}` : ''}`, bold: true, size: 12, bg: C_SUB, fg: C_WHITE },
        { text: `Generated: ${dateStr}`, bold: false, size: 10, bg: 'EEF3FA', fg: '374151' },
      ]
      mwTitles.forEach(({ text, bold, size, bg, fg }, idx) => {
        const r = wsMonth.addRow([text, ...Array(Math.max(mwN - 1, 0)).fill('')])
        if (mwN > 1) wsMonth.mergeCells(r.number, 1, r.number, mwN)
        const cell = wsMonth.getCell(r.number, 1)
        cell.value = text
        cell.font  = { bold, size, name: 'Calibri', color: { argb: fg } }
        cell.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } }
        cell.alignment = { horizontal: 'center', vertical: 'middle' }
        cell.border = { top: idx === 0 ? outerMed : innerThn, bottom: idx === mwTitles.length - 1 ? outerMed : innerThn, left: outerMed, right: outerMed }
        r.height = size * 2.1
      })

      const cap = wsMonth.addRow(Array(mwN).fill(''))
      cap.height = 20
      cap.eachCell({ includeEmpty: true }, (cell, ci) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C_HDR } }
        cell.font = { bold: true, color: { argb: C_WHITE }, size: 10, name: 'Calibri' }
        cell.alignment = { vertical: 'middle', horizontal: 'center' }
        cell.border = border(true, false, ci === 1, ci === mwN)
      })
      if (monthKeys.length) {
        const rangeText = monthKeys.length === 1
          ? monthLabel(monthKeys[0])
          : `${monthLabel(monthKeys[0])} to ${monthLabel(monthKeys[monthKeys.length - 1])}`
        wsMonth.mergeCells(cap.number, monthStartCol, cap.number, monthEndCol)
        for (let c = monthStartCol; c <= monthEndCol; c++) {
          const cell = wsMonth.getCell(cap.number, c)
          cell.value = c === monthStartCol ? `Payments (${rangeText})` : ''
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C_SUB } }
          cell.font = { bold: true, color: { argb: C_WHITE }, size: 10, name: 'Calibri' }
          cell.alignment = { horizontal: 'center', vertical: 'middle' }
          cell.border = border(true, false, c === 1, c === mwN)
        }
      }

      const mwHr = wsMonth.addRow(mwHdr)
      mwHr.height = 24
      mwHr.eachCell({ includeEmpty: true }, (cell, ci) => {
        cell.font      = { bold: true, color: { argb: C_WHITE }, size: 10, name: 'Calibri' }
        cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: C_HDR } }
        cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
        cell.border    = border(true, false, ci === 1, ci === mwN)
      })

      const monthTotals = monthKeys.map(() => 0)
      let grandOpening = 0
      let grandAuction = 0
      let grandDue = 0
      let grandPaid = 0
      let grandClosing = 0
      let countClearedMw = 0
      let countPendingMw = 0
      const closeCol = mwN - 1
      const statusCol = mwN

      rows.forEach((row, i) => {
        const byMonth = {}
        ;(details[row.member_id] || []).forEach(d => {
          const k = monthKey(d.receipt_date)
          if (!k) return
          byMonth[k] = (byMonth[k] || 0) + (Number(d.amount) || 0)
        })
        const monthVals = monthKeys.map((k, mi) => {
          const v = byMonth[k] || 0
          monthTotals[mi] += v
          return v || null
        })
        const opening = Number(row.previous_pending) || 0
        const auctionAmt = Number(row.current_year_purchase) || 0
        const totalDue = Number(row.total) || (opening + auctionAmt)
        const paid = Number(row.paid) || 0
        const closing = Number(row.balance) || 0
        const cleared = closing <= 0
        if (cleared) countClearedMw += 1
        else countPendingMw += 1
        grandOpening += opening
        grandAuction += auctionAmt
        grandDue += totalDue
        grandPaid += paid
        grandClosing += closing
        const isLast = i === rows.length - 1
        const isAlt = i % 2 === 1
        const dr = wsMonth.addRow([
          i + 1, row.member_id, row.member_name,
          opening || null, auctionAmt || null, totalDue || null,
          ...monthVals,
          paid || null, closing || null,
          cleared ? 'Cleared' : 'Pending',
        ])
        dr.height = 18
        dr.eachCell({ includeEmpty: true }, (cell, ci) => {
          cell.font      = { size: 10, name: 'Calibri' }
          cell.alignment = { vertical: 'middle', horizontal: ci <= 3 ? (ci === 1 ? 'center' : 'left') : 'right' }
          cell.border    = border(false, isLast, ci === 1, ci === mwN)
          if (isAlt) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C_ALT } }
          if (ci >= 4 && ci < statusCol && cell.value != null) cell.numFmt = numFmt
          if (ci === closeCol && closing > 0) cell.font = { ...cell.font, color: { argb: 'DC2626' } }
          if (ci === statusCol) {
            cell.alignment = { vertical: 'middle', horizontal: 'center' }
            cell.font = { ...cell.font, bold: true, color: { argb: cleared ? '15803D' : 'DC2626' } }
          }
        })
      })

      const mwTot = wsMonth.addRow([
        '', 'TOTAL', '',
        grandOpening || null, grandAuction || null, grandDue || null,
        ...monthTotals.map(v => v || null),
        grandPaid || null, grandClosing || null,
        `${countClearedMw}✓ / ${countPendingMw}✗`,
      ])
      mwTot.height = 22
      mwTot.eachCell({ includeEmpty: true }, (cell, ci) => {
        cell.font      = { bold: true, size: 11, name: 'Calibri', color: { argb: C_WHITE } }
        cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: C_HDR } }
        cell.alignment = { vertical: 'middle', horizontal: ci <= 3 ? 'left' : 'right' }
        cell.border    = border(true, true, ci === 1, ci === mwN)
        if (ci >= 4 && ci < mwN && cell.value != null) cell.numFmt = numFmt
      })

      if (monthKeys.length) {
        for (let c = monthStartCol; c <= monthEndCol; c++) {
          wsMonth.getColumn(c).outlineLevel = 1
        }
      }

      if (includeDefaulters) {
        const defRows = rows.filter(r => (Number(r.balance) || 0) > 0)
        const wsDef = wb.addWorksheet('Defaulters')
        wsDef.columns = [
          { width: 18 }, { width: 32 }, { width: 16 }, { width: 16 }, { width: 16 },
        ]
        const defTitles = [
          { text: churchName, bold: true, size: 14, bg: C_HDR, fg: C_WHITE },
          { text: `Defaulters — FY ${fyLabel}${rangeLabel ? ` · ${rangeLabel}` : ''} (balance > 0)`, bold: true, size: 12, bg: C_SUB, fg: C_WHITE },
          { text: `Generated: ${dateStr}`, bold: false, size: 10, bg: 'EEF3FA', fg: '374151' },
        ]
        defTitles.forEach(({ text, bold, size, bg, fg }, idx) => {
          const r = wsDef.addRow([text, '', '', '', ''])
          wsDef.mergeCells(r.number, 1, r.number, 5)
          const cell = wsDef.getCell(r.number, 1)
          cell.value = text
          cell.font = { bold, size, name: 'Calibri', color: { argb: fg } }
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } }
          cell.alignment = { horizontal: 'center', vertical: 'middle' }
          cell.border = { top: idx === 0 ? outerMed : innerThn, bottom: idx === defTitles.length - 1 ? innerThn : innerThn, left: outerMed, right: outerMed }
          r.height = size * 2.1
        })
        const dhr = wsDef.addRow(['Member ID', 'Name', 'Due (₹)', 'Paid (₹)', 'Balance (₹)'])
        dhr.height = 22
        dhr.eachCell({ includeEmpty: true }, (cell, ci) => {
          cell.font = { bold: true, color: { argb: C_WHITE }, size: 11, name: 'Calibri' }
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C_HDR } }
          cell.alignment = { vertical: 'middle', horizontal: ci <= 2 ? 'left' : 'right' }
          cell.border = border(true, false, ci === 1, ci === 5)
        })
        defRows.forEach((row, i) => {
          const dr = wsDef.addRow([
            row.member_id, row.member_name,
            Number(row.total) || null, Number(row.paid) || null, Number(row.balance) || null,
          ])
          dr.height = 18
          dr.eachCell({ includeEmpty: true }, (cell, ci) => {
            cell.font = { size: 10, name: 'Calibri' }
            cell.alignment = { vertical: 'middle', horizontal: ci <= 2 ? 'left' : 'right' }
            cell.border = border(false, i === defRows.length - 1, ci === 1, ci === 5)
            if (i % 2 === 1) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C_ALT } }
            if (ci >= 3 && cell.value != null) cell.numFmt = numFmt
            if (ci === 5) cell.font = { ...cell.font, color: { argb: 'DC2626' } }
          })
        })
        if (!defRows.length) {
          const empty = wsDef.addRow(['None', 'No members with balance due at cut-off', '', '', ''])
          wsDef.mergeCells(empty.number, 1, empty.number, 5)
        }
      }

      const buf = await wb.xlsx.writeBuffer()
      const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
      if (doDownload) {
        const url  = URL.createObjectURL(blob)
        const a    = document.createElement('a')
        const safeChurch = churchName.replace(/[^a-zA-Z0-9]/g, '_')
        a.href = url
        a.download = `${includeDefaulters ? 'Auction_Close' : (isSpill ? 'Auction_Spillover' : 'Auction_Report')}_${safeChurch}_FY${fyLabel}${isSpill ? `_${dateFrom}_to_${dateTo}` : ''}.xlsx`
        a.click()
        URL.revokeObjectURL(url)
      }
      return blob
    } catch (e) {
      toast(e.message, 'error')
      return null
    } finally {
      setExporting(false)
    }
  }

  // ── PDF export ─────────────────────────────────────────────────
  const exportPDF = async () => {
    if (!reportRows.length) return
    setExporting(true)
    try {
      await exportAuctionPDF({
        rows: reportRows, filterFY, church, summary, paidDetailsMap,
        dateFrom: reportKind === 'spillover' ? spillRange?.from : undefined,
        dateTo: reportKind === 'spillover' ? spillRange?.to : undefined,
      })
    } catch (e) {
      toast(e.message, 'error')
    }
    setExporting(false)
  }

  const confirmFlushAuction = async () => {
    setFlushPwError('')
    const ok = await verifyMasterPassword(flushPw)
    if (!ok) {
      setFlushPwError('Incorrect master password.')
      setFlushPw('')
      return
    }
    setFlushing(true)
    try {
      const result = await flushAllAuctionTracker()
      setFlushModalOpen(false)
      setFlushPw('')
      setGenerated(false)
      setReportRows([])
      await loadTracker(filterFY)
      if (!result.deleted && !result.seasons && !result.filesDeleted) toast('No auction report data to flush.', 'success')
      else toast(`Flushed ${result.deleted} tracker rows, ${result.seasons || 0} season(s), ${result.filesDeleted || 0} file(s). Receipts were not changed.`, 'success')
    } catch (e) {
      setFlushPwError(e.message || 'Flush failed')
    }
    setFlushing(false)
  }

  const confirmDeleteAuctionDoc = async () => {
    if (!deleteDocModal?.doc) return
    setDeleteDocPwError('')
    const ok = await verifyMasterPassword(deleteDocPw)
    if (!ok) {
      setDeleteDocPwError('Incorrect master password.')
      setDeleteDocPw('')
      return
    }
    setDeletingDoc(true)
    try {
      await deleteAuctionDocument(deleteDocModal.doc)
      await deleteDocModal.reload?.()
      setDocsRefreshKey((k) => k + 1)
      setDeleteDocModal(null)
      setDeleteDocPw('')
      toast('Reference file deleted. A copy is in Recycle Bin.', 'success')
    } catch (e) {
      setDeleteDocPwError(e.message || 'Delete failed')
    }
    setDeletingDoc(false)
  }

  // ══════════════════════════════════════════════════════════════
  //  Render
  // ══════════════════════════════════════════════════════════════

  return (
    <div className="page-container">
      {/* ── Header ── */}
      <PageHeader
        icon={Gavel}
        title="Auction Report"
        subtitle="Import Total Purchase, run Spill-over Report, and export"
      >
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xlsm,.xls,.csv,application/vnd.ms-excel.sheet.macroEnabled.12,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            style={{ display: 'none' }}
            onChange={handleFilePick}
          />
          <a
            className="action-btn"
            href="/templates/Auction-Prep-Template.xlsm"
            download="Auction-Prep-Template-Blank.xlsm"
            style={{ background: '#0f766e', textDecoration: 'none', color: '#fff' }}
          >
            <Download size={13} />
            Prep Template
          </a>
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
            onClick={() => {
              const range = spillRangeFromSeason(season, filterFY)
              setSpillFrom(range.from)
              setSpillTo(range.to)
              setSpillModalOpen(true)
            }}
            disabled={loadingSpill || !trackerRows.length}
            style={{ background: '#2563eb' }}
            title="Opening, payments in a date range, and remaining balance"
          >
            {loadingSpill ? <Loader2 size={13} className="animate-spin" /> : <Calendar size={13} />}
            {loadingSpill ? 'Preparing…' : 'Spill-over Report'}
          </button>

          <button
            className="action-btn"
            onClick={(e) => {
              if (e.altKey) {
                e.preventDefault()
                openRevertCloseYearModal()
                return
              }
              openCloseYearModal()
            }}
            disabled={loadingClose || loadingRevert || !trackerRows.length}
            style={{ background: '#b45309' }}
            title="Close Year — freeze this auction (Forfeit or Carry). Alt+Click to undo Close."
          >
            {(loadingClose || loadingRevert) ? <Loader2 size={13} className="animate-spin" /> : <Lock size={13} />}
            {loadingClose ? 'Preparing…' : loadingRevert ? 'Undo…' : 'Close Year'}
          </button>

          {generated && (
            <>
              <button
                className="action-btn"
                onClick={() => exportExcel()}
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

          <button
            className="action-btn"
            onClick={() => {
              setFlushPw('')
              setFlushPwError('')
              setShowFlushPw(false)
              setFlushModalOpen(true)
            }}
            disabled={flushing}
            style={{
              background: '#dc2626',
              justifyContent: 'center',
              paddingLeft: 10,
              paddingRight: 10,
            }}
            title="Flush — delete all auction tracker rows, seasons, and stored files. Receipts are not touched."
            aria-label="Flush auction records"
          >
            {flushing ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
          </button>
        </div>
      </PageHeader>

      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
      <div style={{ flex: 1, minWidth: 0 }}>

      {/* ── FY filter bar ── */}
      <div className="card" style={{ padding: '12px 20px', marginBottom: 16, display: 'flex', gap: 12, alignItems: 'center' }}>
        <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', flexShrink: 0 }}>Financial Year</label>
        <select value={filterFY} onChange={e => handleFYChange(e.target.value)} className="field-input" style={{ width: 120, appearance: 'none' }}>
          {FYS.map(fy => <option key={fy} value={fy}>{fy}</option>)}
        </select>
        {trackerRows.length > 0 && (
          <span style={{ fontSize: 12, color: 'var(--text-3)', marginLeft: 4 }}>
            {trackerRows.length} members imported · Auction {auctionYear}
            {season?.auction_date ? ` · ${fmtDateIN(season.auction_date)}` : ''}
            {season?.status === 'closed' ? ` · Closed (${season.close_policy === 'forfeit' ? 'Forfeit' : 'Carry'})` : ''}
            {season?.status !== 'closed' && prevSeason?.status === 'closed' ? ` · Previous ${previousFY(filterFY)} closed (${prevSeason.close_policy === 'forfeit' ? 'Forfeit' : 'Carry'})` : ''}
            {generated ? ` · ${reportRows.length} spill-over` : ' · Spill-over Report'}
          </span>
        )}
      </div>

      {/* ── Spill-over date range ── */}
      {spillModalOpen && (
        <div
          className="modal-overlay"
          style={{
            position: 'fixed', inset: 0, zIndex: 80,
            background: 'rgba(15, 23, 42, 0.45)', backdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
          }}
          onClick={() => !loadingSpill && setSpillModalOpen(false)}
        >
          <div
            className="card"
            style={{ width: '100%', maxWidth: 440, padding: 24, position: 'relative' }}
            onClick={e => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => !loadingSpill && setSpillModalOpen(false)}
              style={{ position: 'absolute', top: 12, right: 12, border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-3)' }}
              aria-label="Close"
            >
              <X size={18} />
            </button>
            <h3 style={{ margin: '0 0 6px', fontSize: 16, fontWeight: 800, color: 'var(--text-1)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Calendar size={16} style={{ color: '#0e7490' }} />
              Spill-over Report
            </h3>
            <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--text-2)', lineHeight: 1.45 }}>
              Tracker members for FY <strong>{filterFY}</strong>. Opening is Previous Pending.
              Payments are counted when the receipt date falls in this range.
              From defaults to this auction’s date{season?.auction_date ? ` (${fmtDateIN(season.auction_date)})` : ''};
              To is today{season?.status === 'closed' && season.close_cutoff_date ? `, or the close cut-off (${fmtDateIN(season.close_cutoff_date)})` : ''}.
              Does not close the year.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-3)', display: 'block', marginBottom: 6 }}>From</label>
                <input
                  type="date"
                  value={spillFrom}
                  onChange={e => setSpillFrom(e.target.value)}
                  className="field-input"
                  style={{ width: '100%' }}
                />
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-3)', display: 'block', marginBottom: 6 }}>To</label>
                <input
                  type="date"
                  value={spillTo}
                  onChange={e => setSpillTo(e.target.value)}
                  className="field-input"
                  style={{ width: '100%' }}
                />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                className="action-btn"
                onClick={confirmSpilloverReport}
                disabled={loadingSpill || !spillFrom || !spillTo}
                style={{ background: '#0e7490' }}
              >
                {loadingSpill ? <Loader2 size={13} className="animate-spin" /> : <Calendar size={13} />}
                {loadingSpill ? 'Preparing…' : 'Prepare Report'}
              </button>
              <button
                className="action-btn"
                onClick={() => setSpillModalOpen(false)}
                disabled={loadingSpill}
                style={{ background: '#64748b' }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Import preview confirmation ── */}
      {preview && (
        <div className="card" style={{ padding: 20, marginBottom: 16, borderLeft: '4px solid var(--accent)' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
            <Info size={18} style={{ color: 'var(--accent)', flexShrink: 0, marginTop: 2 }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, color: 'var(--text-1)', marginBottom: 4 }}>
                Ready to import: {preview.fileName}
                <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 999, background: '#dbeafe', color: '#1d4ed8' }}>
                  {preview.mode === 'total_purchase' ? 'Total Purchase' : 'Auction Tracker'}
                </span>
              </div>
              <div style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 12 }}>
                {preview.rows.length} member rows found for FY <strong>{filterFY}</strong>.
                This will <strong>merge/update</strong> by Member ID. Previous Pending and Current Year Purchase
                are both saved. If the previous year was closed as Carry, pending comes from that snapshot
                (Excel pending is ignored). Forfeit starts Previous Pending at 0.
                One uploaded file is allowed per year — delete the existing file first if you need to replace it.
              </div>
              <div style={{ marginBottom: 12, maxWidth: 280 }}>
                <label style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-3)', display: 'block', marginBottom: 6 }}>
                  This auction’s date
                </label>
                <input
                  type="date"
                  value={importAuctionDate}
                  onChange={(e) => setImportAuctionDate(e.target.value)}
                  className="field-input"
                  style={{ width: '100%' }}
                  required
                />
              </div>
              {/* mini preview table */}
              <div style={{ overflowX: 'auto', marginBottom: 12 }}>
                <table style={{ borderCollapse: 'collapse', fontSize: 12, minWidth: 500 }}>
                  <thead>
                    <tr style={{ background: 'var(--table-header-bg)' }}>
                      {['Member ID', 'Member Name', 'Prev. Pending', currYearColLabel, 'Total'].map(h => (
                        <th key={h} style={{ padding: '6px 10px', fontWeight: 700, color: 'var(--text-3)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.rows.slice(0, 5).map((r, i) => (
                      <tr key={i} style={{ borderTop: '1px solid var(--table-border)' }}>
                        <td style={{ padding: '5px 10px', fontFamily: 'monospace', fontSize: 12 }}>{r.member_id}</td>
                        <td style={{ padding: '5px 10px', fontSize: 12 }}>{r.member_name}</td>
                        <td style={{ padding: '5px 10px', textAlign: 'right', fontFamily: 'monospace', fontSize: 12 }}>{r.previous_pending > 0 ? Number(r.previous_pending).toLocaleString('en-IN') : '—'}</td>
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
                <button className="action-btn" onClick={confirmImport} disabled={loadingImport || !importAuctionDate}
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
            Import the Prep Template Total Purchase sheet (Previous Pending is optional)
          </p>
        </div>
      )}

      {loadingData && (
        <div className="card" style={{ padding: 48, textAlign: 'center' }}>
          <Loader2 size={28} className="animate-spin" style={{ color: 'var(--text-3)', margin: '0 auto' }} />
        </div>
      )}

      {/* ── Report section ── */}
      {generated && !loadingSpill && (
        <>
          {/* Summary cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
            <SummaryCard label="Total Members"   value={summary.totalMembers}   isCount />
            <SummaryCard label="Total Due"        value={summary.totalDue}       />
            <SummaryCard label={isSpillReport ? 'Payments in Range' : 'Total Paid'} value={summary.totalPaid} accent />
            <SummaryCard label="Balance Pending"  value={summary.totalBalance}   warn={summary.totalBalance > 0} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12, marginBottom: 16 }}>
            <StatusCard label="Cleared"  count={summary.countCleared} total={summary.totalMembers} type="cleared" />
            <StatusCard label="Pending"  count={summary.countPending} total={summary.totalMembers} type="pending" />
          </div>

          {/* Report table */}
          <div className="card" style={{ overflow: 'hidden' }}>
            <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--table-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-1)', margin: 0 }}>
                {isSpillReport ? 'Auction Spill-over Report' : 'Auction Payment Status'}
              </h3>
              <span style={{ fontSize: 12, color: 'var(--text-3)' }}>
                FY {filterFY} · Auction {auctionYear}
                {isSpillReport ? ` · Payments ${spillRangeLabel}` : ''}
                {' · '}{reportRows.length} members · Click a row to see receipt details
              </span>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 760 }}>
                <thead>
                  <tr style={{ background: 'var(--table-header-bg)' }}>
                    <th style={{ width: 32, padding: '9px 8px' }} />
                    {['#', 'Member ID', 'Member Name', isSpillReport ? 'Opening' : 'Prev. Pending', currYearColLabel, 'Total Due', isSpillReport ? 'Payments' : 'Amount Paid', 'Balance', 'Status'].map(h => (
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
                                  No auction receipts found for this member
                                  {spillRangeLabel ? ` (${spillRangeLabel})` : ''}
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

      {/* ── Tracker list (imported, before Spill-over Report) ── */}
      {!generated && !loadingData && trackerRows.length > 0 && (
        <div className="card" style={{ overflow: 'hidden' }}>
          <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--table-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-1)', margin: 0 }}>Imported Tracker — FY {filterFY}</h3>
            <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{trackerRows.length} members · Spill-over Report</span>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 520 }}>
              <thead>
                <tr style={{ background: 'var(--table-header-bg)' }}>
                  {['#', 'Member ID', 'Member Name', 'Prev. Pending', currYearColLabel, 'Total'].map(h => (
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

      <AuctionDocsPanel
          refreshKey={docsRefreshKey}
          onRequestDelete={(doc, reload) => {
            setDeleteDocPw('')
            setDeleteDocPwError('')
            setShowDeleteDocPw(false)
            setDeleteDocModal({ doc, reload })
          }}
        />
      </div>

      {/* ── Close auction year (master password) ── */}
      {closeModalOpen && closePreview && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 90,
            background: 'rgba(15, 23, 42, 0.5)', backdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
          }}
          onClick={() => !loadingClose && setCloseModalOpen(false)}
        >
          <div
            className="card"
            style={{ width: '100%', maxWidth: 520, padding: 24, position: 'relative', maxHeight: '90vh', overflow: 'auto' }}
            onClick={e => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => !loadingClose && setCloseModalOpen(false)}
              style={{ position: 'absolute', top: 12, right: 12, border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-3)' }}
              aria-label="Close"
            >
              <X size={18} />
            </button>
            <h3 style={{ margin: '0 0 6px', fontSize: 16, fontWeight: 800, color: 'var(--text-1)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Lock size={16} style={{ color: '#b45309' }} />
              Close Auction Year
            </h3>
            <p style={{ margin: '0 0 14px', fontSize: 13, color: 'var(--text-2)', lineHeight: 1.45 }}>
              Freeze <strong>FY {closePreview.fromFY}</strong> (Auction {auctionYearFromFY(closePreview.fromFY)}
              {closePreview.auctionDate ? ` · ${fmtDateIN(closePreview.auctionDate)}` : ''}).
              Cut-off is the day before the next auction. This does not create next-year purchases —
              the next year starts when you import that Total Purchase.
              Wrong Forfeit: undo Close (Alt+Click), then close again as Carry.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-3)', display: 'block', marginBottom: 6 }}>
                  Next auction date
                </label>
                <input
                  type="date"
                  value={closeNextAuctionDate}
                  onChange={e => setCloseNextAuctionDate(e.target.value)}
                  className="field-input"
                  style={{ width: '100%' }}
                />
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-3)', display: 'block', marginBottom: 6 }}>
                  Cut-off
                </label>
                <div className="field-input" style={{ display: 'flex', alignItems: 'center', background: 'var(--table-header-bg)' }}>
                  {closeNextAuctionDate ? fmtDateIN(dayBeforeIso(closeNextAuctionDate)) : '—'}
                </div>
              </div>
            </div>
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-3)', marginBottom: 8 }}>
                Unpaid balances
              </div>
              <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 8, cursor: 'pointer', fontSize: 13 }}>
                <input type="radio" name="closePolicy" checked={closePolicy === 'forfeit'} onChange={() => setClosePolicy('forfeit')} style={{ marginTop: 3 }} />
                <span><strong>Forfeit (start clean)</strong> — next year Previous Pending is 0. Defaulters are recorded but not carried.</span>
              </label>
              <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', cursor: 'pointer', fontSize: 13 }}>
                <input type="radio" name="closePolicy" checked={closePolicy === 'carry'} onChange={() => setClosePolicy('carry')} style={{ marginTop: 3 }} />
                <span><strong>Carry forward</strong> — unpaid (not overpay) becomes Previous Pending when you import next year’s file.</span>
              </label>
            </div>
            <div style={{ background: 'rgba(180,83,9,0.08)', border: '1px solid rgba(180,83,9,0.25)', borderRadius: 8, padding: '10px 12px', marginBottom: 14, fontSize: 13 }}>
              <div><strong>{closePreview.rows.length}</strong> of {closePreview.allCount} members have a balance due</div>
              <div style={{ marginTop: 4 }}>
                {closePolicy === 'carry' ? 'Amount that will carry:' : 'Due at cut-off (not carried):'}{' '}
                <strong style={{ color: '#b45309' }}>
                  ₹{closePreview.totalCarry.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </strong>
              </div>
            </div>
            {closePreview.rows.length > 0 && (
              <div style={{ overflowX: 'auto', marginBottom: 14, maxHeight: 180 }}>
                <table style={{ borderCollapse: 'collapse', fontSize: 12, width: '100%' }}>
                  <thead>
                    <tr style={{ background: 'var(--table-header-bg)' }}>
                      {['Member ID', 'Name', 'Balance'].map(h => (
                        <th key={h} style={{ padding: '6px 8px', textAlign: h === 'Balance' ? 'right' : 'left', fontSize: 10, color: 'var(--text-3)', textTransform: 'uppercase' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {closePreview.rows.slice(0, 8).map(r => (
                      <tr key={r.member_id} style={{ borderTop: '1px solid var(--table-border)' }}>
                        <td style={{ padding: '5px 8px', fontFamily: 'monospace' }}>{r.member_id}</td>
                        <td style={{ padding: '5px 8px' }}>{r.member_name}</td>
                        <td style={{ padding: '5px 8px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 600 }}>
                          {(r.balance ?? r.previous_pending).toLocaleString('en-IN')}
                        </td>
                      </tr>
                    ))}
                    {closePreview.rows.length > 8 && (
                      <tr><td colSpan={3} style={{ padding: '5px 8px', color: 'var(--text-3)', fontStyle: 'italic' }}>…and {closePreview.rows.length - 8} more</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
            <label style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-3)', display: 'block', marginBottom: 7 }}>
              Master Password
            </label>
            <MasterPasswordInput
              showPlain={showClosePw}
              value={closePw}
              onChange={e => { setClosePw(e.target.value); setClosePwError('') }}
              onKeyDown={e => { if (e.key === 'Enter') confirmCloseYear() }}
              placeholder="Enter master password…"
              className="field-input"
              style={{ width: '100%', marginBottom: 8 }}
            />
            <button type="button" onClick={() => setShowClosePw(v => !v)} style={{ border: 'none', background: 'none', fontSize: 12, color: 'var(--text-3)', cursor: 'pointer', marginBottom: 8, padding: 0 }}>
              {showClosePw ? 'Hide password' : 'Show password'}
            </button>
            {closePwError && (
              <p style={{ margin: '0 0 10px', fontSize: 12, color: '#dc2626', fontWeight: 600 }}>{closePwError}</p>
            )}
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button
                className="action-btn"
                onClick={confirmCloseYear}
                disabled={loadingClose || !closeNextAuctionDate || !closePolicy}
                style={{ background: '#b45309' }}
              >
                {loadingClose ? <Loader2 size={13} className="animate-spin" /> : <Lock size={13} />}
                {loadingClose ? 'Closing…' : `Confirm Close (${closePolicy === 'forfeit' ? 'Forfeit' : 'Carry'})`}
              </button>
              <button
                className="action-btn"
                onClick={() => setCloseModalOpen(false)}
                disabled={loadingClose}
                style={{ background: '#64748b' }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Revert Close Year (secret: Alt+Click Close Year) ── */}
      {revertModalOpen && revertPreview && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 90,
            background: 'rgba(15, 23, 42, 0.5)', backdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
          }}
          onClick={() => !loadingRevert && setRevertModalOpen(false)}
        >
          <div
            className="card"
            style={{ width: '100%', maxWidth: 480, padding: 24, position: 'relative' }}
            onClick={e => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => !loadingRevert && setRevertModalOpen(false)}
              style={{ position: 'absolute', top: 12, right: 12, border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-3)' }}
              aria-label="Close"
            >
              <X size={18} />
            </button>
            <h3 style={{ margin: '0 0 6px', fontSize: 16, fontWeight: 800, color: 'var(--text-1)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Undo2 size={16} style={{ color: '#0f766e' }} />
              Undo Close Year
            </h3>
            <p style={{ margin: '0 0 14px', fontSize: 13, color: 'var(--text-2)', lineHeight: 1.45 }}>
              Reopens <strong>FY {revertPreview.fromFY}</strong> so you can Close Year again as Forfeit or Carry.
              {revertPreview.fromFY} tracker history is kept.
              {revertPreview.nextCount > 0
                ? ` FY ${revertPreview.toFY} already has ${revertPreview.nextCount} imported member(s) from after that close. Those ${revertPreview.toFY} tracker rows, season, and stored files will be removed (snapshotted to Recycle Bin). Then close ${revertPreview.fromFY} as Forfeit or Carry and import ${revertPreview.toFY} again.`
                : ''}
            </p>
            <div style={{ background: 'rgba(15,118,110,0.08)', border: '1px solid rgba(15,118,110,0.25)', borderRadius: 8, padding: '10px 12px', marginBottom: 14, fontSize: 13 }}>
              Undo close: <strong>{revertPreview.fromFY}</strong>
              {revertPreview.policy ? ` · was ${revertPreview.policy === 'forfeit' ? 'Forfeit' : 'Carry'}` : ''}
              {revertPreview.nextCount > 0 ? ` · remove ${revertPreview.toFY} import` : ''}
            </div>
            <label style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-3)', display: 'block', marginBottom: 7 }}>
              Master Password
            </label>
            <MasterPasswordInput
              showPlain={showRevertPw}
              value={revertPw}
              onChange={e => { setRevertPw(e.target.value); setRevertPwError('') }}
              onKeyDown={e => { if (e.key === 'Enter') confirmRevertCloseYear() }}
              placeholder="Enter master password…"
              className="field-input"
              style={{ width: '100%', marginBottom: 8 }}
            />
            <button type="button" onClick={() => setShowRevertPw(v => !v)} style={{ border: 'none', background: 'none', fontSize: 12, color: 'var(--text-3)', cursor: 'pointer', marginBottom: 8, padding: 0 }}>
              {showRevertPw ? 'Hide password' : 'Show password'}
            </button>
            {revertPwError && (
              <p style={{ margin: '0 0 10px', fontSize: 12, color: '#dc2626', fontWeight: 600 }}>{revertPwError}</p>
            )}
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button
                className="action-btn"
                onClick={confirmRevertCloseYear}
                disabled={loadingRevert}
                style={{ background: '#0f766e' }}
              >
                {loadingRevert ? <Loader2 size={13} className="animate-spin" /> : <Undo2 size={13} />}
                {loadingRevert ? 'Reverting…' : `Undo Close ${revertPreview.fromFY}`}
              </button>
              <button
                className="action-btn"
                onClick={() => setRevertModalOpen(false)}
                disabled={loadingRevert}
                style={{ background: '#64748b' }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {flushModalOpen && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 90,
            background: 'rgba(15, 23, 42, 0.5)', backdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
          }}
          onClick={() => !flushing && setFlushModalOpen(false)}
        >
          <div
            className="card"
            style={{ width: '100%', maxWidth: 480, padding: 24, position: 'relative' }}
            onClick={e => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => !flushing && setFlushModalOpen(false)}
              style={{ position: 'absolute', top: 12, right: 12, border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-3)' }}
              aria-label="Close"
            >
              <X size={18} />
            </button>
            <h3 style={{ margin: '0 0 6px', fontSize: 16, fontWeight: 800, color: 'var(--text-1)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Trash2 size={16} style={{ color: '#dc2626' }} />
              Flush auction records
            </h3>
            <p style={{ margin: '0 0 14px', fontSize: 13, color: 'var(--text-2)', lineHeight: 1.45 }}>
              Deletes <strong>all Auction Report data</strong>: tracker rows, season close policy, and stored files (Uploaded Documents and Closed reports).
              Receipts, members, and other CMS data are not touched.
              A Recycle Bin snapshot is saved first.
            </p>
            <label style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-3)', display: 'block', marginBottom: 7 }}>
              Master Password
            </label>
            <MasterPasswordInput
              showPlain={showFlushPw}
              value={flushPw}
              onChange={e => { setFlushPw(e.target.value); setFlushPwError('') }}
              onKeyDown={e => { if (e.key === 'Enter') confirmFlushAuction() }}
              placeholder="Enter master password…"
              className="field-input"
              style={{ width: '100%', marginBottom: 8 }}
            />
            <button type="button" onClick={() => setShowFlushPw(v => !v)} style={{ border: 'none', background: 'none', fontSize: 12, color: 'var(--text-3)', cursor: 'pointer', marginBottom: 8, padding: 0 }}>
              {showFlushPw ? 'Hide password' : 'Show password'}
            </button>
            {flushPwError && (
              <p style={{ margin: '0 0 10px', fontSize: 12, color: '#dc2626', fontWeight: 600 }}>{flushPwError}</p>
            )}
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button
                className="action-btn"
                onClick={confirmFlushAuction}
                disabled={flushing || !flushPw}
                style={{ background: '#dc2626' }}
              >
                {flushing ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                {flushing ? 'Flushing…' : 'Yes, flush auction tracker'}
              </button>
              <button
                className="action-btn"
                onClick={() => setFlushModalOpen(false)}
                disabled={flushing}
                style={{ background: '#64748b' }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteDocModal && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 110,
            background: 'rgba(15, 23, 42, 0.5)', backdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
          }}
          onClick={() => !deletingDoc && setDeleteDocModal(null)}
        >
          <div
            className="card"
            style={{ width: '100%', maxWidth: 440, padding: 24, position: 'relative' }}
            onClick={e => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => !deletingDoc && setDeleteDocModal(null)}
              style={{ position: 'absolute', top: 12, right: 12, border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-3)' }}
              aria-label="Close"
            >
              <X size={18} />
            </button>
            <h3 style={{ margin: '0 0 6px', fontSize: 16, fontWeight: 800, color: 'var(--text-1)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Lock size={16} style={{ color: '#dc2626' }} />
              Delete reference file
            </h3>
            <p style={{ margin: '0 0 14px', fontSize: 13, color: 'var(--text-2)', lineHeight: 1.45 }}>
              Delete <strong>{deleteDocModal.doc?.originalName}</strong>
              {deleteDocModal.doc?.fy ? ` (FY ${deleteDocModal.doc.fy})` : ''}?
              Master password is required. The file is moved to Recycle Bin.
            </p>
            <label style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-3)', display: 'block', marginBottom: 7 }}>
              Master Password
            </label>
            <MasterPasswordInput
              showPlain={showDeleteDocPw}
              value={deleteDocPw}
              onChange={e => { setDeleteDocPw(e.target.value); setDeleteDocPwError('') }}
              onKeyDown={e => { if (e.key === 'Enter') confirmDeleteAuctionDoc() }}
              placeholder="Enter master password…"
              className="field-input"
              style={{ width: '100%', marginBottom: 8 }}
            />
            <button type="button" onClick={() => setShowDeleteDocPw(v => !v)} style={{ border: 'none', background: 'none', fontSize: 12, color: 'var(--text-3)', cursor: 'pointer', marginBottom: 8, padding: 0 }}>
              {showDeleteDocPw ? 'Hide password' : 'Show password'}
            </button>
            {deleteDocPwError && (
              <p style={{ margin: '0 0 10px', fontSize: 12, color: '#dc2626', fontWeight: 600 }}>{deleteDocPwError}</p>
            )}
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button
                className="action-btn"
                onClick={confirmDeleteAuctionDoc}
                disabled={deletingDoc || !deleteDocPw}
                style={{ background: '#dc2626' }}
              >
                {deletingDoc ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                {deletingDoc ? 'Deleting…' : 'Delete file'}
              </button>
              <button
                className="action-btn"
                onClick={() => setDeleteDocModal(null)}
                disabled={deletingDoc}
                style={{ background: '#64748b' }}
              >
                Cancel
              </button>
            </div>
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
