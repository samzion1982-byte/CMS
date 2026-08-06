import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase, getChurch } from '../lib/supabase'
import { useToast } from '../lib/toast'
import { exportMultiSheetWithTitle } from '../lib/exportExcel'
import {
  BarChart3, Loader2, Search, FileSpreadsheet, Tag, List, ChevronDown,
  CheckSquare, Square, X,
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
  const [activeTab, setActiveTab] = useState('full')   // 'full' | 'multipayhead'

  // ── reference data ─────────────────────────────────────────────
  const [FYS,     setFYS]     = useState([])   // available FYs from receipts table
  const [allCats, setAllCats] = useState([])   // { id, name, sort_order }
  const [church,  setChurch]  = useState(null)
  const [selCats, setSelCats] = useState([])
  // ── report state ───────────────────────────────────────────────
  const [loading,   setLoading]   = useState(false)
  const [generated, setGenerated] = useState(false)

  // Full report
  const [reportCats,  setReportCats]  = useState([])   // ordered cat names used in report
  const [breakupRows, setBreakupRows] = useState([])   // one row per receipt
  const [summaryRows, setSummaryRows] = useState([])   // one row per category
  const [grandTotal,  setGrandTotal]  = useState(0)

  const [payMonthMap, setPayMonthMap] = useState({})   // receipt_number → month_paid string

  const [catDropdownOpen, setCatDropdownOpen] = useState(false)
  const catDropdownRef = useRef(null)
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

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (catDropdownRef.current && !catDropdownRef.current.contains(event.target)) {
        setCatDropdownOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

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
    if (activeTab === 'multipayhead' && !selCats.length){ toast('Select at least one payment head', 'error'); return }
    setLoading(true)
    setGenerated(false)
    try {
      if (activeTab === 'full') await generateFull()
      else await generateMultiPayHead()
      setGenerated(true)
    } catch (e) {
      toast(e.message, 'error')
    }
    setLoading(false)
  }, [activeTab, dateFrom, dateTo, filterFY, selCats, allCats]) // eslint-disable-line react-hooks/exhaustive-deps

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

  const generateMultiPayHead = async () => {
    const selectedCatNames = allCats.filter(c => selCats.includes(c.name)).map(c => c.name)
    if (!selectedCatNames.length) { toast('Select at least one payment head', 'error'); return }

    const selectedSet = new Set(selectedCatNames)
    const { data, error } = await supabase.rpc('get_receipt_report', {
      p_date_from: dateFrom,
      p_date_to:   dateTo,
      p_fy:        filterFY || null,
    })
    if (error) throw error
    const rows = data || []

    const pivotMap = {}
    const recMeta = {}
    const recOrder = []

    rows.forEach(row => {
      if (!selectedSet.has(row.cat_name)) return
      const id = row.receipt_id
      if (!recMeta[id]) {
        recMeta[id] = {
          receipt_number: row.receipt_number || '',
          receipt_date:   row.receipt_date   || '',
          payment_mode:   row.payment_mode   || '',
          member_id:      row.member_id      || '',
          member_name:    row.member_name    || '',
          grand_total:    0,
        }
        recOrder.push(id)
      }
      if (!pivotMap[id]) pivotMap[id] = {}
      pivotMap[id][row.cat_name] = (pivotMap[id][row.cat_name] || 0) + (row.item_total || 0)
      recMeta[id].grand_total += row.item_total || 0
    })

    const orderedCats = allCats.filter(c => selectedSet.has(c.name)).map(c => c.name)
    setReportCats(orderedCats)

    const bRows = recOrder.map(id => {
      const row = { ...recMeta[id] }
      orderedCats.forEach(cat => { row[cat] = pivotMap[id]?.[cat] || 0 })
      return row
    })
    setBreakupRows(bRows)

    const receiptNos = [...new Set(bRows.map(r => r.receipt_number).filter(Boolean))]
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

    const summMap = {}
    rows.forEach(row => {
      if (!selectedSet.has(row.cat_name)) return
      const mode = recMeta[row.receipt_id]?.payment_mode || 'Unknown'
      if (!summMap[row.cat_name]) summMap[row.cat_name] = {}
      summMap[row.cat_name][mode] = (summMap[row.cat_name][mode] || 0) + (row.item_total || 0)
    })
    const sRows = orderedCats.map(cat => {
      const row = { cat_name: cat, bank_total: 0, row_total: 0 }
      PAYMENT_MODES.forEach(mode => {
        const val = summMap[cat]?.[mode] || 0
        row[mode] = val
        row.row_total += val
      })
      row.bank_total = BANK_MODES.reduce((s, m) => s + (row[m] || 0), 0)
      return row
    })
    setSummaryRows(sRows)
    setGrandTotal(bRows.reduce((s, r) => s + r.grand_total, 0))
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

    } else if (activeTab === 'multipayhead') {
      const selectedHeads = selCats.join(', ')
      const multiTitleLines = [
        { text: churchName, bold: true, size: 14, bg: '1E3A5F', color: 'FFFFFF' },
        { text: selectedHeads ? `Multi Payment Head Report: ${selectedHeads}` : 'Multi Payment Head Report', bold: true, size: 12, bg: '0369A1', color: 'FFFFFF' },
        { text: dateLabel, bold: false, size: 10, bg: 'EEF3FA', color: '1E3A5F' },
      ]

      const listCols = [
        { header: 'R.No',        key: 'receipt_number', align: 'left'   },
        { header: 'Date',        key: 'receipt_date',   align: 'center' },
        { header: 'Mode',        key: 'payment_mode',   align: 'center' },
        { header: 'Member ID',   key: 'member_id',      align: 'center' },
        { header: 'Member Name', key: 'member_name',    align: 'left'   },
        ...reportCats.map(cat => ({ header: cat, key: cat, align: 'right', numFmt: '#,##0' })),
        { header: 'Total',      key: 'grand_total',    align: 'right', numFmt: '#,##0' },
      ]
      const listData = [
        ...breakupRows.map(r => ({ ...r, receipt_date: fmtDateExcel(r.receipt_date) })),
        {
          receipt_number: '', receipt_date: '', payment_mode: '', member_id: '', member_name: 'TOTAL',
          ...reportCats.reduce((acc, cat) => ({ ...acc, [cat]: breakupRows.reduce((s, row) => s + (row[cat] || 0), 0) }), {}),
          grand_total: grandTotal,
          _bold: true,
        },
      ]

      const memberMap = {}
      for (const row of breakupRows) {
        const key = row.member_id || row.member_name
        if (!memberMap[key]) {
          memberMap[key] = { member_id: row.member_id, member_name: row.member_name, rows: [], totals: {}, totalAmt: 0, totalMonths: 0 }
          reportCats.forEach(cat => { memberMap[key].totals[cat] = 0 })
        }
        const monthsStr = payMonthMap[row.receipt_number] || ''
        const monthCount = monthsStr ? monthsStr.split(',').map(s => s.trim()).filter(Boolean).length : 0
        const detailRow = {
          receipt_number: row.receipt_number,
          receipt_date: fmtDateExcel(row.receipt_date),
          payment_mode: row.payment_mode,
          member_id: row.member_id,
          member_name: row.member_name,
          months_paid: monthCount ? `${monthCount} Month${monthCount !== 1 ? 's' : ''}` : '',
        }
        reportCats.forEach(cat => {
          detailRow[cat] = row[cat] || 0
          memberMap[key].totals[cat] += row[cat] || 0
        })
        detailRow.total = reportCats.reduce((s, cat) => s + (detailRow[cat] || 0), 0)
        memberMap[key].rows.push(detailRow)
        memberMap[key].totalAmt += detailRow.total
        memberMap[key].totalMonths += monthCount
      }
      const memberGroups = Object.values(memberMap).sort((a, b) => {
        const na = Number(a.member_id), nb = Number(b.member_id)
        if (!isNaN(na) && !isNaN(nb)) return na - nb
        return String(a.member_id).localeCompare(String(b.member_id))
      })

      const mwCols = [
        { header: 'R.No',        key: 'receipt_number', align: 'left'   },
        { header: 'Date',        key: 'receipt_date',   align: 'center' },
        { header: 'Mode',        key: 'payment_mode',   align: 'center' },
        { header: 'Member ID',   key: 'member_id',      align: 'center' },
        { header: 'Member Name', key: 'member_name',    align: 'left'   },
        { header: 'Months Paid', key: 'months_paid',    align: 'center' },
        ...reportCats.map(cat => ({ header: cat, key: cat, align: 'right', numFmt: '#,##0' })),
        { header: 'Total',      key: 'total',          align: 'right', numFmt: '#,##0' },
      ]
      const mwData = []
      let mwGrand = 0
      for (const grp of memberGroups) {
        for (const row of grp.rows) {
          mwData.push(row)
        }
        mwData.push({
          receipt_number: '', receipt_date: '', payment_mode: '', member_id: '',
          member_name: `${grp.member_name} — TOTAL`, months_paid: grp.totalMonths ? `${grp.totalMonths} Month${grp.totalMonths !== 1 ? 's' : ''}` : '',
          ...reportCats.reduce((acc, cat) => ({ ...acc, [cat]: grp.totals[cat] || 0 }), {}),
          total: grp.totalAmt,
          _bold: true,
        })
        mwGrand += grp.totalAmt
      }
      mwData.push({
        receipt_number: '', receipt_date: '', payment_mode: '', member_id: '', member_name: 'GRAND TOTAL', months_paid: '',
        ...reportCats.reduce((acc, cat) => ({ ...acc, [cat]: breakupRows.reduce((s, row) => s + (row[cat] || 0), 0) }), {}),
        total: grandTotal,
        _bold: true,
      })

      const mthCols = [
        { header: 'Member ID',   key: 'member_id',   align: 'center' },
        { header: 'Member Name', key: 'member_name', align: 'left'   },
        ...FY_MONTHS.map((m, idx) => ({ header: FY_MON_S[idx], key: m, align: 'right', numFmt: '#,##0' })),
        { header: 'Total', key: 'row_total', align: 'right', numFmt: '#,##0' },
      ]
      const monthwiseMap = {}
      for (const row of breakupRows) {
        const key = row.member_id || row.member_name
        if (!monthwiseMap[key]) {
          monthwiseMap[key] = { member_id: row.member_id, member_name: row.member_name, months: {} }
          FY_MONTHS.forEach(m => { monthwiseMap[key].months[m] = 0 })
        }
        const monthsStr = payMonthMap[row.receipt_number] || ''
        const monthsPaid = monthsStr ? monthsStr.split(',').map(s => s.trim()).filter(Boolean) : []
        const rowTotal = reportCats.reduce((s, cat) => s + (row[cat] || 0), 0)
        if (monthsPaid.length > 0) {
          const perMonth = rowTotal / monthsPaid.length
          for (const mp of monthsPaid) {
            const matched = FY_MONTHS.find(m => m.toLowerCase() === mp.toLowerCase())
            if (matched) monthwiseMap[key].months[matched] += perMonth
          }
        } else if (row.receipt_date) {
          const d = new Date(row.receipt_date + 'T00:00:00')
          const mName = d.toLocaleString('en-US', { month: 'long' })
          const matched = FY_MONTHS.find(m => m.toLowerCase() === mName.toLowerCase())
          if (matched) monthwiseMap[key].months[matched] += rowTotal
        }
      }
      const mthData = Object.values(monthwiseMap)
        .sort((a, b) => {
          const na = Number(a.member_id), nb = Number(b.member_id)
          if (!isNaN(na) && !isNaN(nb)) return na - nb
          return String(a.member_id).localeCompare(String(b.member_id))
        })
        .map(mem => {
          const row = { member_id: mem.member_id, member_name: mem.member_name }
          let rowTotal = 0
          FY_MONTHS.forEach(m => { row[m] = mem.months[m] > 0 ? mem.months[m] : 0; rowTotal += row[m] })
          row.row_total = rowTotal
          return row
        })
      const mthTotalRow = { member_id: '', member_name: 'TOTAL', _bold: true }
      let mthGrandTotal = 0
      FY_MONTHS.forEach(m => { mthTotalRow[m] = mthData.reduce((s, row) => s + (row[m] || 0), 0); mthGrandTotal += mthTotalRow[m] })
      mthTotalRow.row_total = mthGrandTotal
      mthData.push(mthTotalRow)

      await exportMultiSheetWithTitle([
        { name: 'Transaction List', columns: listCols, rows: listData, titleLines: multiTitleLines },
        { name: 'Member-wise Detail', columns: mwCols, rows: mwData, titleLines: [...multiTitleLines.slice(0,1), { text: 'Detailed Member-wise', bold: true, size: 12, bg: '166534', color: 'FFFFFF' }, multiTitleLines[2]] },
        { name: 'Monthwise Tabulated', columns: mthCols, rows: mthData, titleLines: [...multiTitleLines.slice(0,1), { text: 'Monthwise Tabulated', bold: true, size: 12, bg: '7C3AED', color: 'FFFFFF' }, multiTitleLines[2]] },
      ], `Multi_Payment_Head_Report_${filterFY || 'All'}_${ts}.xlsx`)

    } else {
      toast('Unsupported report type for export', 'error')
      return
    }
  }

  // ── column totals ──────────────────────────────────────────────
  const catTotal     = cat  => breakupRows.reduce((s, r) => s + (r[cat]  || 0), 0)
  const summColTotal = mode => summaryRows.reduce((s, r) => s + (r[mode] || 0), 0)
  const bankGrand    = summaryRows.reduce((s, r) => s + r.bank_total, 0)

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
          { id: 'full',         label: 'Full Report',           Icon: List },
          { id: 'multipayhead', label: 'By Payment Heads',     Icon: Tag  },
        ].map(({ id, label, Icon }) => (
          <button
            key={id}
            onClick={() => { setActiveTab(id); setGenerated(false); setCatDropdownOpen(false) }}
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

      {/* ── filters + selected-heads layout ───────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: activeTab === 'multipayhead' ? '1.5fr 280px' : '1fr', gap: 16, marginBottom: 20 }}>
        <div className="card" style={{ padding: '16px 20px', overflow: 'visible' }}>
          <div style={{ display: 'grid', gridTemplateColumns: activeTab === 'multipayhead' ? '120px minmax(160px,220px) minmax(170px,230px) 260px max-content' : '120px minmax(160px,220px) minmax(170px,230px) max-content', gap: 16, alignItems: 'end', minWidth: 0, width: '100%' }}>
            <div style={{ flex: '0 0 auto' }}>
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

            <div style={{ flex: '1 1 160px', minWidth: 180 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', display: 'block', marginBottom: 4 }}>To</label>
              <input ref={toRef} type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="field-input" />
            </div>

            {activeTab === 'multipayhead' && (
              <div ref={catDropdownRef} style={{ position: 'relative', width: 260, maxWidth: 260 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', display: 'block', marginBottom: 4 }}>Payment Heads</label>
                <button
                  type="button"
                  onClick={() => setCatDropdownOpen(prev => !prev)}
                  className="field-input"
                  style={{ width: '100%', textAlign: 'left', display: 'flex', justifyContent: 'space-between', alignItems: 'center', minHeight: 42, paddingRight: 12 }}
                >
                  <span style={{ whiteSpace: 'normal', textAlign: 'left', color: 'var(--text-3)' }}>
                    Select payment heads
                  </span>
                  <ChevronDown size={14} style={{ color: 'var(--text-3)' }} />
                </button>
                <div style={{ position: 'absolute', top: '100%', left: 0, width: '100%', marginTop: 6, background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: 10, boxShadow: '0 12px 30px rgba(0,0,0,0.08)', zIndex: 999, width: 260, maxHeight: 260, overflowY: 'auto', display: catDropdownOpen ? 'block' : 'none' }}>
                  <div style={{ padding: '10px 12px', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                    <button
                      type="button"
                      title="Select all"
                      onClick={() => setSelCats(allCats.map(c => c.name))}
                      style={{
                        width: 38, height: 38, borderRadius: 10, border: '1px solid var(--card-border)',
                        background: selCats.length === allCats.length && allCats.length ? 'var(--accent)' : 'transparent',
                        color: selCats.length === allCats.length && allCats.length ? '#fff' : 'var(--text-2)',
                        cursor: 'pointer', display: 'grid', placeItems: 'center',
                      }}
                    >
                      <CheckSquare size={18} />
                    </button>
                    <button
                      type="button"
                      title="Deselect all"
                      onClick={() => setSelCats([])}
                      style={{
                        width: 38, height: 38, borderRadius: 10, border: '1px solid var(--card-border)',
                        background: selCats.length === 0 && allCats.length ? 'var(--accent)' : 'transparent',
                        color: selCats.length === 0 && allCats.length ? '#fff' : 'var(--text-2)',
                        cursor: 'pointer', display: 'grid', placeItems: 'center',
                      }}
                    >
                      <Square size={18} />
                    </button>
                  </div>
                  <div>
                    {allCats.map(c => (
                      <label key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={selCats.includes(c.name)}
                          onChange={e => {
                            const checked = e.target.checked
                            setSelCats(prev => checked ? [...prev, c.name] : prev.filter(name => name !== c.name))
                          }}
                          style={{ width: 14, height: 14, accentColor: 'var(--accent)' }}
                        />
                        <span style={{ fontSize: 13, color: 'var(--text-1)' }}>{c.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, alignItems: 'center', minWidth: 0, whiteSpace: 'nowrap' }}>
              <button className="action-btn" onClick={generate} disabled={loading} style={{ background: 'var(--sidebar-bg)', whiteSpace: 'nowrap' }}>
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

            {!generated && !loading && (
              <div style={{ marginTop: 20, padding: '24px 0', textAlign: 'center', gridColumn: '1 / -1', justifySelf: 'center' }}>
                <BarChart3 size={40} style={{ color: 'var(--text-3)', margin: '0 auto 12px', display: 'block' }} />
                <p style={{ color: 'var(--text-2)', fontWeight: 500, margin: 0 }}>Select filters and click Generate</p>
                <p style={{ color: 'var(--text-3)', fontSize: 13, marginTop: 4, marginBottom: 0 }}>
                  {activeTab === 'full'
                    ? 'Generates Receipt Breakup and Summary by payment mode'
                    : 'Select one or more payment heads to see receipts across those categories'}
                </p>
              </div>
            )}
          </div>
        </div>

        {activeTab === 'multipayhead' && (
          <div className="card" style={{ border: '1px solid var(--card-border)', borderRadius: 12, background: 'var(--card-bg)', padding: 14, minHeight: 180, width: 280, minWidth: 280 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)' }}>Selected Heads</span>
              <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{selCats.length} selected</span>
            </div>
            {selCats.length ? (
              <div style={{ display: 'grid', gap: 6, maxHeight: 220, overflowY: 'auto', paddingRight: 4 }}>
                {selCats.map(name => (
                  <button key={name} type="button" onClick={() => setSelCats(prev => prev.filter(item => item !== name))} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 8px', borderRadius: 8, border: '1px solid var(--card-border)', background: '#fff', color: 'var(--text-1)', cursor: 'pointer', width: '100%' }}>
                    <span style={{ fontSize: 13, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
                    <X size={14} style={{ color: 'var(--accent)', marginLeft: 8 }} />
                  </button>
                ))}
              </div>
            ) : (
              <p style={{ margin: 0, fontSize: 12, color: 'var(--text-3)' }}>No payment heads selected</p>
            )}
          </div>
        )}
      </div>

      {loading && (
        <div className="card" style={{ padding: 48, textAlign: 'center' }}>
          <Loader2 size={32} className="animate-spin" style={{ color: 'var(--text-3)', margin: '0 auto' }} />
        </div>
      )}

      {/* ════════════════════════════════════════════════════════
          FULL REPORT
      ════════════════════════════════════════════════════════ */}
      {generated && !loading && (activeTab === 'full' || activeTab === 'multipayhead') && (
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
          BY PAYMENT HEADS
      ════════════════════════════════════════════════════════ */}

    </div>
  )
}
