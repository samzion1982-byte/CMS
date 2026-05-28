import { useState, useEffect, useCallback, useRef, useMemo, Fragment } from 'react'
import { supabase, getChurch } from '../lib/supabase'
import { useToast } from '../lib/toast'
import { exportMultiSheetWithTitle } from '../lib/exportExcel'
import {
  BarChart3, Loader2, Search, FileSpreadsheet, Tag, List, ChevronDown,
} from 'lucide-react'

// ── helpers ──────────────────────────────────────────────────────

function getFY(dateStr) {
  const d = dateStr ? new Date(dateStr + 'T00:00:00') : new Date()
  const m = d.getMonth() + 1
  const y = d.getFullYear()
  return m >= 4 ? `${y}-${String(y + 1).slice(2)}` : `${y - 1}-${String(y).slice(2)}`
}


const PAYMENT_MODES = ['Cash', 'Cheque', 'DD', 'Net Banking', 'UPI']
const BANK_MODES    = ['Cheque', 'DD', 'Net Banking', 'UPI']

const FY_MONTHS = ['April','May','June','July','August','September','October','November','December','January','February','March']
const FY_MON_S  = ['Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec','Jan','Feb','Mar']

// Pastel row colors cycling across members in member-wise view
const MEMBER_BG = [
  'rgba(255,242,204,0.55)', 'rgba(209,236,241,0.55)', 'rgba(226,239,218,0.55)',
  'rgba(248,203,173,0.45)', 'rgba(230,224,236,0.55)', 'rgba(221,235,247,0.55)',
  'rgba(255,235,156,0.45)', 'rgba(198,224,180,0.45)', 'rgba(252,213,206,0.45)',
  'rgba(213,232,212,0.55)',
]

const localISO = d =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

const fmtDate = d =>
  d ? new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

const fmtAmt  = n => (n > 0 ? Number(n).toLocaleString('en-IN', { maximumFractionDigits: 0 }) : '—')
const fmtAmtZ = n => Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })

const fmtDateExcel = d => {
  if (!d) return ''
  const dt  = new Date(d + 'T00:00:00')
  const day = String(dt.getDate()).padStart(2, '0')
  const mon = dt.toLocaleString('en-IN', { month: 'short' })
  return `${day}-${mon}-${dt.getFullYear()}`
}

// ── styles ────────────────────────────────────────────────────────

const TH = {
  padding: '9px 10px',
  textAlign: 'left',
  fontSize: 11,
  fontWeight: 700,
  color: 'var(--text-3)',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  whiteSpace: 'nowrap',
}
const TH_R = { ...TH, textAlign: 'right' }

const modeBadge = mode => ({
  fontSize: 11,
  fontWeight: 600,
  padding: '2px 6px',
  borderRadius: 4,
  background: mode === 'Cash' ? '#f0fdf4' : '#eff6ff',
  color: mode === 'Cash' ? '#15803d' : '#1d4ed8',
})

// ── main component ────────────────────────────────────────────────

export default function ReportsPage() {
  const toast = useToast()

  const currentFY = getFY()

  // ── filters ────────────────────────────────────────────────────
  const [filterFY, setFilterFY] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo,   setDateTo]   = useState('')

  // ── tabs ───────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState('full')   // 'full' | 'payhead'

  // ── reference data ─────────────────────────────────────────────
  const [FYS,     setFYS]     = useState([])   // available FYs from receipts table
  const [allCats, setAllCats] = useState([])   // { id, name, sort_order }
  const [church,  setChurch]  = useState(null)
  const [selCat,  setSelCat]  = useState('')

  // ── report state ───────────────────────────────────────────────
  const [loading,   setLoading]   = useState(false)
  const [generated, setGenerated] = useState(false)

  // Full report
  const [reportCats,  setReportCats]  = useState([])   // ordered cat names used in report
  const [breakupRows, setBreakupRows] = useState([])   // one row per receipt
  const [summaryRows, setSummaryRows] = useState([])   // one row per category
  const [grandTotal,  setGrandTotal]  = useState(0)

  // Pay-head report
  const [payheadRows,  setPayheadRows]  = useState([])
  const [payheadTotal, setPayheadTotal] = useState(0)
  const [paySubView,   setPaySubView]   = useState('list')   // 'list' | 'memberwise' | 'monthwise'
  const [payMonthMap,  setPayMonthMap]  = useState({})        // receipt_number → month_paid string

  const fromRef = useRef(null)
  const toRef   = useRef(null)

  // ── on mount ───────────────────────────────────────────────────
  useEffect(() => { loadInitials() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const loadInitials = async () => {
    const [{ data: cats }, churchData, { data: fyRows }] = await Promise.all([
      supabase.from('payment_categories').select('id,name,sort_order').eq('is_active', true).order('sort_order'),
      getChurch(),
      supabase.rpc('get_receipt_financial_years'),
    ])
    if (cats)       setAllCats(cats)
    if (churchData) setChurch(churchData)

    const fySet = (fyRows || []).map(r => r.financial_year).filter(Boolean)
    setFYS(fySet)
  }

  const fetchLastReceiptDate = async (fy) => {
    let q = supabase.from('receipts').select('receipt_date').order('receipt_date', { ascending: false }).limit(1)
    if (fy) q = q.eq('financial_year', fy)
    const { data } = await q.maybeSingle()
    setDateTo(data?.receipt_date || localISO(new Date()))
  }

  // ── FY change ──────────────────────────────────────────────────
  const handleFYChange = async (fy) => {
    setFilterFY(fy)
    if (!fy) { setDateFrom(''); setDateTo(''); return }
    const [yr] = fy.split('-')
    setDateFrom(`${yr}-04-01`)
    await fetchLastReceiptDate(fy)
    setTimeout(() => fromRef.current?.focus(), 50)
  }

  // ── generate ───────────────────────────────────────────────────
  const generate = useCallback(async () => {
    if (!filterFY)                         { toast('Select a financial year', 'error'); return }
    if (!dateFrom || !dateTo)              { toast('Select a date range', 'error'); return }
    if (activeTab === 'payhead' && !selCat){ toast('Select a payment head', 'error'); return }
    setLoading(true)
    setGenerated(false)
    try {
      if (activeTab === 'full') await generateFull()
      else                       await generatePayHead()
      setGenerated(true)
    } catch (e) {
      toast(e.message, 'error')
    }
    setLoading(false)
  }, [activeTab, dateFrom, dateTo, filterFY, selCat, allCats]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── full report ────────────────────────────────────────────────
  const generateFull = async () => {
    const { data, error } = await supabase.rpc('get_receipt_report', {
      p_date_from: dateFrom,
      p_date_to:   dateTo,
      p_fy:        filterFY || null,
    })
    if (error) throw error
    const rows = data || []

    if (!rows.length) {
      setReportCats([]); setBreakupRows([]); setSummaryRows([]); setGrandTotal(0); return
    }

    // Build pivot from flat RPC rows
    const pivotMap  = {}   // receipt_id → { catName: amount }
    const recMeta   = {}   // receipt_id → { receipt_number, receipt_date, payment_mode, member_id, member_name, grand_total }
    const recOrder  = []   // preserve receipt order
    const catSortMap = {}  // catName → sort_order

    rows.forEach(row => {
      const id = row.receipt_id
      if (!recMeta[id]) {
        recMeta[id] = {
          receipt_number: row.receipt_number || '',
          receipt_date:   row.receipt_date   || '',
          payment_mode:   row.payment_mode   || '',
          member_id:      row.member_id      || '',
          member_name:    row.member_name    || '',
          grand_total:    row.grand_total    || 0,
        }
        recOrder.push(id)
      }
      if (!pivotMap[id]) pivotMap[id] = {}
      if (row.cat_name) {
        pivotMap[id][row.cat_name] = (pivotMap[id][row.cat_name] || 0) + (row.item_total || 0)
        catSortMap[row.cat_name] = row.cat_sort_order ?? 999
      }
    })

    // Always show all active categories (ordered by sort_order from DB)
    const orderedCats = allCats.map(c => c.name)
    setReportCats(orderedCats)

    // Breakup rows (one per receipt, preserving DB order)
    const bRows = recOrder.map(id => {
      const row = { ...recMeta[id] }
      orderedCats.forEach(cat => { row[cat] = pivotMap[id]?.[cat] || 0 })
      return row
    })
    setBreakupRows(bRows)

    // Summary: category × mode
    const summMap = {}
    rows.forEach(row => {
      const mode = recMeta[row.receipt_id]?.payment_mode || 'Unknown'
      if (!summMap[row.cat_name]) summMap[row.cat_name] = {}
      summMap[row.cat_name][mode] = (summMap[row.cat_name][mode] || 0) + (row.item_total || 0)
    })
    const sRows = orderedCats.map(cat => {
      const row = { cat_name: cat, bank_total: 0, row_total: 0 }
      PAYMENT_MODES.forEach(mode => {
        const val  = summMap[cat]?.[mode] || 0
        row[mode]       = val
        row.row_total  += val
      })
      row.bank_total = BANK_MODES.reduce((s, m) => s + (row[m] || 0), 0)
      return row
    })
    setSummaryRows(sRows)
    setGrandTotal(bRows.reduce((s, r) => s + r.grand_total, 0))
  }

  // ── pay-head report ────────────────────────────────────────────
  const generatePayHead = async () => {
    const cat = allCats.find(c => c.name === selCat)
    if (!cat) { toast('Category not found', 'error'); return }

    const { data, error } = await supabase.rpc('get_payhead_report', {
      p_date_from:   dateFrom,
      p_date_to:     dateTo,
      p_category_id: cat.id,
      p_fy:          filterFY || null,
    })
    if (error) throw error
    const rows = data || []

    const mapped = rows.map(r => ({
      receipt_number: r.receipt_number || '',
      receipt_date:   r.receipt_date   || '',
      payment_mode:   r.payment_mode   || '',
      member_id:      r.member_id      || '',
      member_name:    r.member_name    || '',
      amount:         r.amount         || 0,
    }))
    setPayheadRows(mapped)
    setPayheadTotal(mapped.reduce((s, r) => s + r.amount, 0))

    // Fetch month_paid for all receipts so member-wise and monthwise views have it
    const receiptNos = [...new Set(mapped.map(r => r.receipt_number).filter(Boolean))]
    if (receiptNos.length) {
      const { data: mData } = await supabase
        .from('receipts')
        .select('receipt_number, month_paid')
        .in('receipt_number', receiptNos)
      const mMap = {}
      for (const r of mData || []) mMap[r.receipt_number] = r.month_paid || ''
      setPayMonthMap(mMap)
    } else {
      setPayMonthMap({})
    }
    setPaySubView('list')
  }

  // ── Excel export ───────────────────────────────────────────────
  const exportExcel = async () => {
    const ts          = new Date().toLocaleDateString('en-IN').replace(/\//g, '-')
    const churchName  = church?.church_name || 'Church'
    const dateLabel   = `From: ${fmtDateExcel(dateFrom)}   To: ${fmtDateExcel(dateTo)}`

    if (activeTab === 'full') {
      // ── Sheet 1: Receipt Breakup ───────────────────────────────
      const breakupCols = [
        { header: 'R.No',        key: 'receipt_number', align: 'left'   },
        { header: 'Date',        key: 'receipt_date',   align: 'center' },
        { header: 'Mode',        key: 'payment_mode',   align: 'center' },
        { header: 'Member ID',   key: 'member_id',      align: 'center' },
        { header: 'Member Name', key: 'member_name',    align: 'left'   },
        ...reportCats.map(cat => ({ header: cat, key: cat, align: 'right', numFmt: '#,##0' })),
        { header: 'Grand Total', key: 'grand_total',    align: 'right',  numFmt: '#,##0' },
      ]

      const bTotalRow = {
        receipt_number: '', receipt_date: '', payment_mode: '',
        member_id: '', member_name: 'TOTAL', grand_total: grandTotal, _bold: true,
      }
      reportCats.forEach(cat => {
        bTotalRow[cat] = breakupRows.reduce((s, r) => s + (r[cat] || 0), 0)
      })

      const breakupData = [
        ...breakupRows.map(r => ({ ...r, receipt_date: fmtDateExcel(r.receipt_date) })),
        bTotalRow,
      ]

      // ── Sheet 2: Summary ───────────────────────────────────────
      const BANK_HDR = { group: 'bank', headerBg: '1D4ED8', headerFg: 'FFFFFF' }
      const summaryCols = [
        { header: 'Payment Head', key: 'cat_name',    align: 'left'  },
        { header: 'Cash',         key: 'Cash',        align: 'right', numFmt: '#,##0' },
        { header: 'Cheque',       key: 'Cheque',      align: 'right', numFmt: '#,##0', ...BANK_HDR },
        { header: 'DD',           key: 'DD',          align: 'right', numFmt: '#,##0', ...BANK_HDR },
        { header: 'Net Banking',  key: 'Net Banking', align: 'right', numFmt: '#,##0', ...BANK_HDR },
        { header: 'UPI',          key: 'UPI',         align: 'right', numFmt: '#,##0', ...BANK_HDR },
        { header: 'Bank Total',   key: 'bank_total',  align: 'right', numFmt: '#,##0' },
        { header: 'Total',        key: 'row_total',   align: 'right', numFmt: '#,##0' },
      ]

      const sTotalRow = {
        cat_name: 'GRAND TOTAL',
        bank_total: summaryRows.reduce((s, r) => s + r.bank_total, 0),
        row_total:  grandTotal,
        _bold: true,
      }
      ;['Cash', 'Cheque', 'DD', 'Net Banking', 'UPI'].forEach(m => {
        sTotalRow[m] = summaryRows.reduce((s, r) => s + (r[m] || 0), 0)
      })

      const summaryData = [...summaryRows, sTotalRow]

      const commonTitle = [
        { text: churchName, bold: true, size: 14, bg: '1E3A5F', color: 'FFFFFF' },
      ]

      await exportMultiSheetWithTitle([
        {
          name: 'Receipt Breakup',
          columns: breakupCols,
          rows: breakupData,
          titleLines: [
            ...commonTitle,
            { text: 'Receipt Breakup', bold: true, size: 12, bg: '2563EB', color: 'FFFFFF' },
            { text: dateLabel, bold: false, size: 10, bg: 'EEF3FA', color: '1E3A5F' },
          ],
        },
        {
          name: 'Summary',
          columns: summaryCols,
          rows: summaryData,
          titleLines: [
            ...commonTitle,
            { text: 'Summary Report', bold: true, size: 12, bg: '16A34A', color: 'FFFFFF' },
            { text: dateLabel, bold: false, size: 10, bg: 'EEF3FA', color: '1E3A5F' },
          ],
        },
      ], `Receipt_Report_${filterFY || 'All'}_${ts}.xlsx`)

    } else {
      // ── Sheet 1: Transaction List ──────────────────────────────
      const listCols = [
        { header: 'R.No',        key: 'receipt_number', align: 'left'   },
        { header: 'Date',        key: 'receipt_date',   align: 'center' },
        { header: 'Mode',        key: 'payment_mode',   align: 'center' },
        { header: 'Member ID',   key: 'member_id',      align: 'center' },
        { header: 'Member Name', key: 'member_name',    align: 'left'   },
        { header: 'Months Paid', key: 'months_display', align: 'center' },
        { header: selCat,        key: 'amount',         align: 'right',  numFmt: '#,##0' },
      ]
      const listTotalRow = { receipt_number: '', receipt_date: '', payment_mode: '', member_id: '', member_name: 'TOTAL', months_display: '', amount: payheadTotal, _bold: true }
      const listData = [
        ...payheadRows.map(r => {
          const mp = payMonthMap[r.receipt_number] || ''
          const mps = mp ? mp.split(',').map(s => s.trim()).filter(Boolean) : []
          return { ...r, receipt_date: fmtDateExcel(r.receipt_date), months_display: mps.length ? `${mps.length} Month${mps.length !== 1 ? 's' : ''}` : '' }
        }),
        listTotalRow,
      ]

      // ── Sheet 2: Detailed Member-wise ─────────────────────────
      const mwCols = [
        { header: 'R.No',        key: 'receipt_number', align: 'left'   },
        { header: 'Date',        key: 'receipt_date',   align: 'center' },
        { header: 'Mode',        key: 'payment_mode',   align: 'center' },
        { header: 'Member ID',   key: 'member_id',      align: 'center' },
        { header: 'Member Name', key: 'member_name',    align: 'left'   },
        { header: 'Months Paid', key: 'months_display', align: 'center' },
        { header: selCat,        key: 'amount',         align: 'right',  numFmt: '#,##0' },
      ]
      const mwData = []
      let mwGrand = 0
      for (const grp of memberGroups) {
        for (const row of grp.rows) {
          mwData.push({ receipt_number: row.receipt_number, receipt_date: fmtDateExcel(row.receipt_date), payment_mode: row.payment_mode, member_id: row.member_id, member_name: row.member_name, months_display: row.monthCount > 0 ? `${row.monthCount} Month${row.monthCount !== 1 ? 's' : ''}` : '', amount: row.amount })
        }
        const subLabel = grp.totalMonths > 0 ? `${grp.totalMonths} Month${grp.totalMonths !== 1 ? 's' : ''}` : ''
        mwData.push({ receipt_number: '', receipt_date: '', payment_mode: '', member_id: '', member_name: `${grp.member_name} — TOTAL`, months_display: subLabel, amount: grp.totalAmt, _bold: true, _subtotal: true })
        mwGrand += grp.totalAmt
      }
      mwData.push({ receipt_number: '', receipt_date: '', payment_mode: '', member_id: '', member_name: 'GRAND TOTAL', months_display: '', amount: mwGrand, _bold: true })

      // ── Sheet 3: Monthwise Tabulated ──────────────────────────
      const mthCols = [
        { header: 'Member ID',   key: 'member_id',   align: 'center' },
        { header: 'Member Name', key: 'member_name', align: 'left'   },
        ...FY_MONTHS.map((m, idx) => ({ header: FY_MON_S[idx], key: m, align: 'right', numFmt: '#,##0' })),
        { header: 'Total', key: 'row_total', align: 'right', numFmt: '#,##0' },
      ]
      const mthData = monthwisePivot.members.map(mem => {
        const row = { member_id: mem.member_id, member_name: mem.member_name }
        let rowTotal = 0
        FY_MONTHS.forEach(m => { row[m] = mem.months[m] > 0 ? mem.months[m] : 0; rowTotal += row[m] })
        row.row_total = rowTotal
        return row
      })
      const mthTotalRow = { member_id: '', member_name: 'TOTAL', _bold: true }
      let mthGrandTotal = 0
      FY_MONTHS.forEach(m => { mthTotalRow[m] = monthwisePivot.colTotals[m] || 0; mthGrandTotal += mthTotalRow[m] })
      mthTotalRow.row_total = mthGrandTotal
      mthData.push(mthTotalRow)

      const payTitleLines = [
        { text: churchName, bold: true, size: 14, bg: '1E3A5F', color: 'FFFFFF' },
        { text: selCat + ' Report', bold: true, size: 12, bg: '0369A1', color: 'FFFFFF' },
        { text: dateLabel, bold: false, size: 10, bg: 'EEF3FA', color: '1E3A5F' },
      ]

      await exportMultiSheetWithTitle([
        { name: 'Transaction List', columns: listCols, rows: listData, titleLines: payTitleLines },
        { name: 'Member-wise Detail', columns: mwCols, rows: mwData, titleLines: [...payTitleLines.slice(0,1), { text: selCat + ' — Detailed Member-wise', bold: true, size: 12, bg: '166534', color: 'FFFFFF' }, payTitleLines[2]] },
        { name: 'Monthwise Tabulated', columns: mthCols, rows: mthData, titleLines: [...payTitleLines.slice(0,1), { text: selCat + ' — Monthwise Tabulated', bold: true, size: 12, bg: '7C3AED', color: 'FFFFFF' }, payTitleLines[2]] },
      ], `${selCat.replace(/\s+/g, '_')}_Report_${ts}.xlsx`)
    }
  }

  // ── column totals ──────────────────────────────────────────────
  const catTotal     = cat  => breakupRows.reduce((s, r) => s + (r[cat]  || 0), 0)
  const summColTotal = mode => summaryRows.reduce((s, r) => s + (r[mode] || 0), 0)
  const bankGrand    = summaryRows.reduce((s, r) => s + r.bank_total, 0)
  const modeTotal    = mode => payheadRows.reduce((s, r) => r.payment_mode === mode ? s + r.amount : s, 0)

  // ── derived: member groups (for member-wise view) ──────────────
  const memberGroups = useMemo(() => {
    if (!payheadRows.length) return []
    const groups = {}
    for (const row of payheadRows) {
      const key = row.member_id || row.member_name
      if (!groups[key]) groups[key] = { member_id: row.member_id, member_name: row.member_name, rows: [], totalAmt: 0, totalMonths: 0 }
      const monthsStr = payMonthMap[row.receipt_number] || ''
      const monthCount = monthsStr ? monthsStr.split(',').map(s => s.trim()).filter(Boolean).length : 0
      groups[key].rows.push({ ...row, month_paid: monthsStr, monthCount })
      groups[key].totalAmt    += row.amount
      groups[key].totalMonths += monthCount
    }
    return Object.values(groups).sort((a, b) => {
      const na = Number(a.member_id), nb = Number(b.member_id)
      return (!isNaN(na) && !isNaN(nb)) ? na - nb : String(a.member_id).localeCompare(String(b.member_id))
    })
  }, [payheadRows, payMonthMap])

  // ── derived: monthwise pivot (member × fiscal-month amounts) ───
  const monthwisePivot = useMemo(() => {
    if (!payheadRows.length) return { members: [], colTotals: {} }
    const memberMap = {}
    for (const row of payheadRows) {
      const key = row.member_id || row.member_name
      if (!memberMap[key]) {
        const mths = {}; FY_MONTHS.forEach(m => { mths[m] = 0 })
        memberMap[key] = { member_id: row.member_id, member_name: row.member_name, months: mths }
      }
      const monthsStr  = payMonthMap[row.receipt_number] || ''
      const monthsPaid = monthsStr ? monthsStr.split(',').map(s => s.trim()).filter(Boolean) : []
      if (monthsPaid.length > 0) {
        const perMonth = row.amount / monthsPaid.length
        for (const mp of monthsPaid) {
          const matched = FY_MONTHS.find(m => m.toLowerCase() === mp.toLowerCase())
          if (matched) memberMap[key].months[matched] += perMonth
        }
      } else if (row.receipt_date) {
        // Fall back to receipt date's calendar month
        const d = new Date(row.receipt_date + 'T00:00:00')
        const mName = d.toLocaleString('en-US', { month: 'long' })
        const matched = FY_MONTHS.find(m => m.toLowerCase() === mName.toLowerCase())
        if (matched) memberMap[key].months[matched] += row.amount
      }
    }
    const members = Object.values(memberMap).sort((a, b) => {
      const na = Number(a.member_id), nb = Number(b.member_id)
      return (!isNaN(na) && !isNaN(nb)) ? na - nb : String(a.member_id).localeCompare(String(b.member_id))
    })
    const colTotals = {}
    FY_MONTHS.forEach(m => { colTotals[m] = members.reduce((s, mem) => s + (mem.months[m] || 0), 0) })
    return { members, colTotals }
  }, [payheadRows, payMonthMap])

  // ── render ────────────────────────────────────────────────────
  return (
    <div className="page-container">

      {/* ── page header ──────────────────────────────────────── */}
      <div className="page-header">
        <div>
          <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <BarChart3 size={20} style={{ color: 'var(--accent)', flexShrink: 0 }} />
            Receipt Report
          </h1>
          <p className="page-subtitle">Consolidated receipts report and payment head analysis</p>
        </div>
      </div>

      {/* ── report-type tabs ──────────────────────────────────── */}
      <div style={{
        display: 'flex', gap: 4, marginBottom: 16,
        background: 'var(--card-bg)', border: '1px solid var(--card-border)',
        borderRadius: 10, padding: 4, width: 'fit-content',
      }}>
        {[
          { id: 'full',    label: 'Full Report',       Icon: List },
          { id: 'payhead', label: 'By Payment Head',   Icon: Tag  },
        ].map(({ id, label, Icon }) => (
          <button
            key={id}
            onClick={() => { setActiveTab(id); setGenerated(false) }}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '8px 16px', borderRadius: 7, border: 'none', cursor: 'pointer',
              background: activeTab === id ? 'var(--accent)' : 'transparent',
              color:      activeTab === id ? '#fff' : 'var(--text-2)',
              fontWeight: activeTab === id ? 700 : 500,
              fontSize: 13, transition: 'all 0.15s',
            }}
          >
            <Icon size={14} /> {label}
          </button>
        ))}
      </div>

      {/* ── filters bar ───────────────────────────────────────── */}
      <div className="card" style={{
        padding: '16px 20px', marginBottom: 20,
        display: 'flex', gap: 16, alignItems: 'flex-end', flexWrap: 'wrap',
      }}>
        <div>
          <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', display: 'block', marginBottom: 4 }}>Financial Year</label>
          <div style={{ position: 'relative', width: 120 }}>
            <select
              value={filterFY}
              onChange={e => handleFYChange(e.target.value)}
              className="field-input"
              style={{ width: '100%', appearance: 'none', paddingRight: 28 }}
            >
              <option value="">— select —</option>
              {FYS.map(fy => <option key={fy} value={fy}>{fy}</option>)}
            </select>
            <ChevronDown size={13} style={{
              position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
              color: 'var(--text-3)', pointerEvents: 'none',
            }} />
          </div>
        </div>
        <div>
          <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', display: 'block', marginBottom: 4 }}>From</label>
          <input ref={fromRef} type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} onBlur={() => toRef.current?.focus()} className="field-input" />
        </div>
        <div>
          <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', display: 'block', marginBottom: 4 }}>To</label>
          <input ref={toRef} type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="field-input" />
        </div>

        {activeTab === 'payhead' && (
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', display: 'block', marginBottom: 4 }}>Payment Head</label>
            <select value={selCat} onChange={e => setSelCat(e.target.value)} className="field-input" style={{ minWidth: 190 }}>
              <option value="">— select —</option>
              {allCats.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
            </select>
          </div>
        )}

        <div style={{ display: 'flex', gap: 8 }}>
          <button className="action-btn" onClick={generate} disabled={loading} style={{ background: 'var(--sidebar-bg)' }}>
            {loading ? <Loader2 size={13} className="animate-spin" /> : <Search size={13} />}
            {loading ? 'Generating…' : 'Generate'}
          </button>
          {generated && (
            <button className="action-btn" onClick={exportExcel} style={{ background: '#16a34a' }}>
              <FileSpreadsheet size={13} />
              Export Excel
            </button>
          )}
        </div>
      </div>

      {/* ── empty state ───────────────────────────────────────── */}
      {!generated && !loading && (
        <div className="card" style={{ padding: 48, textAlign: 'center' }}>
          <BarChart3 size={40} style={{ color: 'var(--text-3)', margin: '0 auto 12px', display: 'block' }} />
          <p style={{ color: 'var(--text-2)', fontWeight: 500, margin: 0 }}>Select filters and click Generate</p>
          <p style={{ color: 'var(--text-3)', fontSize: 13, marginTop: 4, marginBottom: 0 }}>
            {activeTab === 'full'
              ? 'Generates Receipt Breakup and Summary by payment mode'
              : 'Select a payment head to see all receipts for that category'}
          </p>
        </div>
      )}

      {loading && (
        <div className="card" style={{ padding: 48, textAlign: 'center' }}>
          <Loader2 size={32} className="animate-spin" style={{ color: 'var(--text-3)', margin: '0 auto' }} />
        </div>
      )}

      {/* ════════════════════════════════════════════════════════
          FULL REPORT
      ════════════════════════════════════════════════════════ */}
      {generated && !loading && activeTab === 'full' && (
        <>
          {/* ── Receipt Breakup ─────────────────────────────── */}
          <div className="card" style={{ overflow: 'hidden', marginBottom: 20 }}>
            <div style={{
              padding: '14px 20px', borderBottom: '1px solid var(--table-border)',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <h3 style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-1)', margin: 0 }}>Receipt Breakup</h3>
              <span style={{ fontSize: 12, color: 'var(--text-3)' }}>
                {breakupRows.length} receipt{breakupRows.length !== 1 ? 's' : ''} · {fmtDate(dateFrom)} to {fmtDate(dateTo)}
              </span>
            </div>

            {breakupRows.length === 0 ? (
              <p style={{ padding: 32, textAlign: 'center', color: 'var(--text-3)', fontSize: 13, margin: 0 }}>
                No receipts found for this date range
              </p>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: 'max-content', minWidth: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: 'var(--table-header-bg)' }}>
                      <th style={{ ...TH, minWidth: 130 }}>R.No</th>
                      <th style={{ ...TH, minWidth: 100 }}>Date</th>
                      <th style={{ ...TH, minWidth: 80  }}>Mode</th>
                      <th style={{ ...TH, minWidth: 95  }}>Member ID</th>
                      <th style={{ ...TH, minWidth: 160 }}>Member Name</th>
                      {reportCats.map(cat => (
                        <th key={cat} style={{ ...TH_R, fontSize: 10, whiteSpace: 'nowrap' }}>{cat}</th>
                      ))}
                      <th style={{ ...TH_R, color: 'var(--text-2)' }}>Grand Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {breakupRows.map((row, i) => (
                      <tr
                        key={row.receipt_number + i}
                        style={{ borderTop: '1px solid var(--table-border)', background: i % 2 === 0 ? 'transparent' : 'rgba(0,0,0,0.012)' }}
                      >
                        <td style={{ padding: '7px 10px', fontSize: 12, fontFamily: 'monospace', color: 'var(--accent)', fontWeight: 600 }}>{row.receipt_number}</td>
                        <td style={{ padding: '7px 10px', fontSize: 12, color: 'var(--text-2)', whiteSpace: 'nowrap' }}>{fmtDate(row.receipt_date)}</td>
                        <td style={{ padding: '7px 10px' }}>
                          <span style={modeBadge(row.payment_mode)}>{row.payment_mode}</span>
                        </td>
                        <td style={{ padding: '7px 10px', fontSize: 12, color: 'var(--text-2)', fontFamily: 'monospace' }}>{row.member_id}</td>
                        <td style={{ padding: '7px 10px', fontSize: 12, color: 'var(--text-1)', fontWeight: 500 }}>{row.member_name}</td>
                        {reportCats.map(cat => (
                          <td key={cat} style={{ padding: '7px 10px', textAlign: 'right', fontSize: 12, fontFamily: 'monospace', color: row[cat] > 0 ? 'var(--text-1)' : 'var(--text-3)' }}>
                            {fmtAmt(row[cat])}
                          </td>
                        ))}
                        <td style={{ padding: '7px 12px', textAlign: 'right', fontSize: 13, fontFamily: 'monospace', fontWeight: 700, color: 'var(--text-1)' }}>
                          {fmtAmtZ(row.grand_total)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ borderTop: '2px solid var(--table-border)', background: 'var(--table-header-bg)' }}>
                      <td colSpan={5} style={{ padding: '10px 10px', fontSize: 13, fontWeight: 700, color: 'var(--text-1)' }}>
                        Total ({breakupRows.length} receipt{breakupRows.length !== 1 ? 's' : ''})
                      </td>
                      {reportCats.map(cat => (
                        <td key={cat} style={{ padding: '10px 10px', textAlign: 'right', fontSize: 12, fontFamily: 'monospace', fontWeight: 700, color: catTotal(cat) > 0 ? 'var(--text-1)' : 'var(--text-3)' }}>
                          {catTotal(cat) > 0 ? fmtAmtZ(catTotal(cat)) : '—'}
                        </td>
                      ))}
                      <td style={{ padding: '10px 12px', textAlign: 'right', fontSize: 14, fontFamily: 'monospace', fontWeight: 800, color: 'var(--accent)' }}>
                        {fmtAmtZ(grandTotal)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>

          {/* ── Summary ─────────────────────────────────────── */}
          {summaryRows.length > 0 && (
            <div className="card" style={{ overflow: 'hidden' }}>
              <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--table-border)' }}>
                <h3 style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-1)', margin: 0 }}>Summary by Payment Mode</h3>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: 'var(--table-header-bg)' }}>
                      <th style={TH}>Payment Head</th>
                      {PAYMENT_MODES.map(m => <th key={m} style={TH_R}>{m}</th>)}
                      <th style={{ ...TH_R, color: '#1d4ed8' }}>Bank</th>
                      <th style={{ ...TH_R, color: 'var(--text-2)' }}>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summaryRows.map((row, i) => (
                      <tr
                        key={row.cat_name}
                        style={{ borderTop: '1px solid var(--table-border)', background: i % 2 === 0 ? 'transparent' : 'rgba(0,0,0,0.012)' }}
                      >
                        <td style={{ padding: '8px 14px', fontSize: 13, fontWeight: 500, color: 'var(--text-1)' }}>{row.cat_name}</td>
                        {PAYMENT_MODES.map(m => (
                          <td key={m} style={{ padding: '8px 12px', textAlign: 'right', fontSize: 13, fontFamily: 'monospace', color: row[m] > 0 ? 'var(--text-1)' : 'var(--text-3)' }}>
                            {fmtAmt(row[m])}
                          </td>
                        ))}
                        <td style={{ padding: '8px 12px', textAlign: 'right', fontSize: 13, fontFamily: 'monospace', fontWeight: 600, color: row.bank_total > 0 ? '#1d4ed8' : 'var(--text-3)' }}>
                          {fmtAmt(row.bank_total)}
                        </td>
                        <td style={{ padding: '8px 12px', textAlign: 'right', fontSize: 13, fontFamily: 'monospace', fontWeight: 700, color: 'var(--text-1)' }}>
                          {fmtAmtZ(row.row_total)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ borderTop: '2px solid var(--table-border)', background: 'var(--table-header-bg)' }}>
                      <td style={{ padding: '10px 14px', fontSize: 13, fontWeight: 700, color: 'var(--text-1)' }}>Grand Total</td>
                      {PAYMENT_MODES.map(m => (
                        <td key={m} style={{ padding: '10px 12px', textAlign: 'right', fontSize: 13, fontFamily: 'monospace', fontWeight: 700, color: summColTotal(m) > 0 ? 'var(--text-1)' : 'var(--text-3)' }}>
                          {summColTotal(m) > 0 ? fmtAmtZ(summColTotal(m)) : '—'}
                        </td>
                      ))}
                      <td style={{ padding: '10px 12px', textAlign: 'right', fontSize: 13, fontFamily: 'monospace', fontWeight: 700, color: bankGrand > 0 ? '#1d4ed8' : 'var(--text-3)' }}>
                        {bankGrand > 0 ? fmtAmtZ(bankGrand) : '—'}
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'right', fontSize: 15, fontFamily: 'monospace', fontWeight: 800, color: 'var(--accent)' }}>
                        {fmtAmtZ(grandTotal)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* ════════════════════════════════════════════════════════
          BY PAYMENT HEAD
      ════════════════════════════════════════════════════════ */}
      {generated && !loading && activeTab === 'payhead' && (
        <div className="card" style={{ overflow: 'hidden' }}>
          {/* header */}
          <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--table-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-1)', margin: 0 }}>{selCat}</h3>
            <span style={{ fontSize: 12, color: 'var(--text-3)' }}>
              {payheadRows.length} receipt{payheadRows.length !== 1 ? 's' : ''} · {fmtDate(dateFrom)} to {fmtDate(dateTo)}
            </span>
          </div>

          {payheadRows.length === 0 ? (
            <p style={{ padding: 32, textAlign: 'center', color: 'var(--text-3)', fontSize: 13, margin: 0 }}>
              No receipts for this payment head in the selected range
            </p>
          ) : (
            <>
              {/* mode summary strip */}
              <div style={{ padding: '10px 20px', display: 'flex', gap: 20, flexWrap: 'wrap', borderBottom: '1px solid var(--table-border)', background: 'rgba(0,0,0,0.015)', alignItems: 'center' }}>
                {PAYMENT_MODES.filter(m => modeTotal(m) > 0).map(m => (
                  <div key={m} style={{ fontSize: 12 }}>
                    <span style={{ color: 'var(--text-3)', marginRight: 4 }}>{m}:</span>
                    <span style={{ fontWeight: 700, fontFamily: 'monospace', color: 'var(--text-1)' }}>₹{fmtAmtZ(modeTotal(m))}</span>
                  </div>
                ))}
                <div style={{ marginLeft: 'auto', fontSize: 12 }}>
                  <span style={{ color: 'var(--text-3)', marginRight: 4 }}>Total:</span>
                  <span style={{ fontWeight: 800, fontFamily: 'monospace', color: 'var(--accent)', fontSize: 15 }}>₹{fmtAmtZ(payheadTotal)}</span>
                </div>
              </div>

              {/* sub-tabs */}
              <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--table-border)', display: 'flex', gap: 4 }}>
                {[
                  { id: 'list',       label: 'Transaction List' },
                  { id: 'memberwise', label: 'Detailed Member-wise' },
                  { id: 'monthwise',  label: 'Monthwise Tabulated' },
                ].map(t => (
                  <button key={t.id} onClick={() => setPaySubView(t.id)}
                    style={{ padding: '5px 13px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: paySubView === t.id ? 700 : 500,
                      background: paySubView === t.id ? 'var(--accent)' : 'var(--card-border)',
                      color: paySubView === t.id ? '#fff' : 'var(--text-2)', transition: 'all 0.15s' }}>
                    {t.label}
                  </button>
                ))}
              </div>

              {/* ── Transaction List ────────────────────────────── */}
              {paySubView === 'list' && (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ background: 'var(--table-header-bg)' }}>
                        <th style={TH}>R.No</th>
                        <th style={TH}>Date</th>
                        <th style={TH}>Mode</th>
                        <th style={TH}>Member ID</th>
                        <th style={TH}>Member Name</th>
                        <th style={{ ...TH, textAlign: 'center' }}>Months Paid</th>
                        <th style={TH_R}>{selCat}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {payheadRows.map((row, i) => {
                        const mp = payMonthMap[row.receipt_number] || ''
                        const mps = mp ? mp.split(',').map(s => s.trim()).filter(Boolean) : []
                        return (
                          <tr key={row.receipt_number + i} style={{ borderTop: '1px solid var(--table-border)', background: i % 2 === 0 ? 'transparent' : 'rgba(0,0,0,0.012)' }}>
                            <td style={{ padding: '7px 10px', fontSize: 12, fontFamily: 'monospace', color: 'var(--accent)', fontWeight: 600 }}>{row.receipt_number}</td>
                            <td style={{ padding: '7px 10px', fontSize: 12, color: 'var(--text-2)', whiteSpace: 'nowrap' }}>{fmtDate(row.receipt_date)}</td>
                            <td style={{ padding: '7px 10px' }}><span style={modeBadge(row.payment_mode)}>{row.payment_mode}</span></td>
                            <td style={{ padding: '7px 10px', fontSize: 12, color: 'var(--text-2)', fontFamily: 'monospace' }}>{row.member_id}</td>
                            <td style={{ padding: '7px 10px', fontSize: 12, color: 'var(--text-1)', fontWeight: 500 }}>{row.member_name}</td>
                            <td style={{ padding: '7px 10px', textAlign: 'center', fontSize: 11, color: mps.length ? 'var(--text-2)' : 'var(--text-3)' }}>
                              {mps.length ? `${mps.length} Month${mps.length !== 1 ? 's' : ''}` : '—'}
                            </td>
                            <td style={{ padding: '7px 10px', textAlign: 'right', fontSize: 13, fontFamily: 'monospace', fontWeight: 700, color: 'var(--text-1)' }}>{fmtAmtZ(row.amount)}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                    <tfoot>
                      <tr style={{ borderTop: '2px solid var(--table-border)', background: 'var(--table-header-bg)' }}>
                        <td colSpan={6} style={{ padding: '10px 10px', fontSize: 13, fontWeight: 700, color: 'var(--text-1)' }}>
                          Total ({payheadRows.length} receipt{payheadRows.length !== 1 ? 's' : ''})
                        </td>
                        <td style={{ padding: '10px 10px', textAlign: 'right', fontSize: 14, fontFamily: 'monospace', fontWeight: 800, color: 'var(--accent)' }}>{fmtAmtZ(payheadTotal)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}

              {/* ── Detailed Member-wise ─────────────────────────── */}
              {paySubView === 'memberwise' && (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ background: 'var(--table-header-bg)' }}>
                        <th style={TH}>R.No</th>
                        <th style={TH}>Date</th>
                        <th style={TH}>Mode</th>
                        <th style={TH}>Member ID</th>
                        <th style={TH}>Member Name</th>
                        <th style={{ ...TH, textAlign: 'center' }}>Months Paid</th>
                        <th style={TH_R}>{selCat}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {memberGroups.map((grp, gi) => {
                        const bg = MEMBER_BG[gi % MEMBER_BG.length]
                        return (
                          <Fragment key={grp.member_id || gi}>
                            {grp.rows.map((row, ri) => (
                              <tr key={row.receipt_number + ri} style={{ background: bg, borderTop: ri === 0 ? '2px solid var(--card-border)' : '1px solid rgba(0,0,0,0.05)' }}>
                                <td style={{ padding: '7px 10px', fontSize: 12, fontFamily: 'monospace', color: 'var(--accent)', fontWeight: 600 }}>{row.receipt_number}</td>
                                <td style={{ padding: '7px 10px', fontSize: 12, color: 'var(--text-2)', whiteSpace: 'nowrap' }}>{fmtDate(row.receipt_date)}</td>
                                <td style={{ padding: '7px 10px' }}><span style={modeBadge(row.payment_mode)}>{row.payment_mode}</span></td>
                                <td style={{ padding: '7px 10px', fontSize: 12, color: 'var(--text-2)', fontFamily: 'monospace' }}>{row.member_id}</td>
                                <td style={{ padding: '7px 10px', fontSize: 12, color: 'var(--text-1)', fontWeight: 500 }}>{row.member_name}</td>
                                <td style={{ padding: '7px 10px', textAlign: 'center', fontSize: 11, color: row.monthCount ? 'var(--text-2)' : 'var(--text-3)' }}>
                                  {row.monthCount > 0 ? `${row.monthCount} Month${row.monthCount !== 1 ? 's' : ''}` : '—'}
                                </td>
                                <td style={{ padding: '7px 10px', textAlign: 'right', fontSize: 13, fontFamily: 'monospace', fontWeight: 700 }}>{fmtAmtZ(row.amount)}</td>
                              </tr>
                            ))}
                            {/* member subtotal */}
                            <tr style={{ background: 'rgba(0,0,0,0.045)', borderTop: '1px solid var(--card-border)' }}>
                              <td colSpan={5} style={{ padding: '6px 10px', fontSize: 12, fontWeight: 700, color: 'var(--text-2)' }}>
                                {grp.member_name} — TOTAL
                              </td>
                              <td style={{ padding: '6px 10px', textAlign: 'center', fontSize: 11, fontWeight: 600, color: 'var(--text-2)' }}>
                                {grp.totalMonths > 0 ? `${grp.totalMonths} Month${grp.totalMonths !== 1 ? 's' : ''}` : '—'}
                              </td>
                              <td style={{ padding: '6px 10px', textAlign: 'right', fontSize: 13, fontFamily: 'monospace', fontWeight: 800, color: 'var(--text-1)' }}>
                                {fmtAmtZ(grp.totalAmt)}
                              </td>
                            </tr>
                          </Fragment>
                        )
                      })}
                    </tbody>
                    <tfoot>
                      <tr style={{ borderTop: '3px solid var(--table-border)', background: 'var(--table-header-bg)' }}>
                        <td colSpan={5} style={{ padding: '10px 10px', fontSize: 13, fontWeight: 700, color: 'var(--text-1)' }}>
                          Grand Total ({memberGroups.length} member{memberGroups.length !== 1 ? 's' : ''})
                        </td>
                        <td style={{ padding: '10px 10px', textAlign: 'center', fontSize: 12, fontWeight: 700, color: 'var(--text-2)' }}>
                          {memberGroups.reduce((s, g) => s + g.totalMonths, 0)} Months
                        </td>
                        <td style={{ padding: '10px 10px', textAlign: 'right', fontSize: 14, fontFamily: 'monospace', fontWeight: 800, color: 'var(--accent)' }}>
                          {fmtAmtZ(payheadTotal)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}

              {/* ── Monthwise Tabulated ──────────────────────────── */}
              {paySubView === 'monthwise' && (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: 'max-content', minWidth: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ background: 'var(--table-header-bg)' }}>
                        <th style={{ ...TH, minWidth: 90 }}>Member ID</th>
                        <th style={{ ...TH, minWidth: 170 }}>Member Name</th>
                        {FY_MON_S.map(m => (
                          <th key={m} style={{ ...TH_R, fontSize: 10, minWidth: 62 }}>{m}</th>
                        ))}
                        <th style={{ ...TH_R, minWidth: 80, color: 'var(--text-2)' }}>Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {monthwisePivot.members.map((mem, i) => {
                        const rowTotal = FY_MONTHS.reduce((s, m) => s + (mem.months[m] || 0), 0)
                        return (
                          <tr key={mem.member_id + i} style={{ borderTop: '1px solid var(--table-border)', background: i % 2 === 0 ? 'transparent' : 'rgba(0,0,0,0.012)' }}>
                            <td style={{ padding: '7px 10px', fontSize: 12, fontFamily: 'monospace', color: 'var(--text-2)' }}>{mem.member_id}</td>
                            <td style={{ padding: '7px 10px', fontSize: 12, fontWeight: 500 }}>{mem.member_name}</td>
                            {FY_MONTHS.map(m => (
                              <td key={m} style={{ padding: '7px 8px', textAlign: 'right', fontSize: 12, fontFamily: 'monospace', color: mem.months[m] > 0 ? 'var(--text-1)' : 'var(--text-3)' }}>
                                {mem.months[m] > 0 ? fmtAmtZ(mem.months[m]) : '—'}
                              </td>
                            ))}
                            <td style={{ padding: '7px 10px', textAlign: 'right', fontSize: 13, fontFamily: 'monospace', fontWeight: 700, color: 'var(--text-1)' }}>
                              {fmtAmtZ(rowTotal)}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                    <tfoot>
                      <tr style={{ borderTop: '2px solid var(--table-border)', background: 'var(--table-header-bg)' }}>
                        <td colSpan={2} style={{ padding: '10px 10px', fontSize: 13, fontWeight: 700, color: 'var(--text-1)' }}>Total</td>
                        {FY_MONTHS.map(m => (
                          <td key={m} style={{ padding: '10px 8px', textAlign: 'right', fontSize: 12, fontFamily: 'monospace', fontWeight: 700, color: monthwisePivot.colTotals[m] > 0 ? 'var(--text-1)' : 'var(--text-3)' }}>
                            {monthwisePivot.colTotals[m] > 0 ? fmtAmtZ(monthwisePivot.colTotals[m]) : '—'}
                          </td>
                        ))}
                        <td style={{ padding: '10px 10px', textAlign: 'right', fontSize: 14, fontFamily: 'monospace', fontWeight: 800, color: 'var(--accent)' }}>
                          {fmtAmtZ(FY_MONTHS.reduce((s, m) => s + (monthwisePivot.colTotals[m] || 0), 0))}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      )}

    </div>
  )
}
