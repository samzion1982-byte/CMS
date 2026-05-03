/* ═══════════════════════════════════════════════════════════════
   ReceiptsPage.jsx — Receipt entry list + modal form
   ═══════════════════════════════════════════════════════════════ */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { supabase }             from '../lib/supabase'
import { useAuth }              from '../lib/AuthContext'
import { useToast }             from '../lib/toast'
import { getActiveCategories }  from '../lib/paymentCategories'
import {
  Plus, Search, X, Loader2, Save, Edit2, Trash2,
  IndianRupee, CheckSquare, Square, Settings, Lock,
  FileSpreadsheet, ChevronDown,
} from 'lucide-react'
import { exportToExcel, exportToExcelMultiSheet } from '../lib/exportExcel'

// ── helpers ─────────────────────────────────────────────────────

function getFY(dateStr) {
  const d = dateStr ? new Date(dateStr + 'T00:00:00') : new Date()
  const m = d.getMonth() + 1
  const y = d.getFullYear()
  return m >= 4 ? `${y}-${String(y + 1).slice(2)}` : `${y - 1}-${String(y).slice(2)}`
}

function prevFY(fy) {
  const s = parseInt(fy.split('-')[0])
  return `${s - 1}-${String(s).slice(-2)}`
}

async function nextReceiptNumber(fy) {
  const prefix = fy + '_'
  const { data } = await supabase
    .from('receipts').select('receipt_number')
    .like('receipt_number', `${prefix}%`)
    .order('receipt_number', { ascending: false }).limit(1)
  if (!data?.length) return prefix + '000001'
  const seq = parseInt(data[0].receipt_number.replace(prefix, ''), 10) || 0
  return prefix + String(seq + 1).padStart(6, '0')
}

function fmtDate(s) {
  if (!s) return '—'
  const [y, m, d] = s.split('-')
  return `${d}/${m}/${y}`
}

const MODES       = ['Cash', 'Cheque', 'DD', 'Net Banking', 'UPI']
const FY_MONTHS   = ['April','May','June','July','August','September','October','November','December','January','February','March']
const FY_MON_S    = ['Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec','Jan','Feb','Mar']
const TEN_DAYS_MS = 10 * 24 * 60 * 60 * 1000

// ════════════════════════════════════════════════════════
//  LIST PAGE
// ════════════════════════════════════════════════════════

export default function ReceiptsPage() {
  const { profile } = useAuth()
  const toast       = useToast()

  const [categories,    setCategories]    = useState([])
  const [catsLoading,   setCatsLoading]   = useState(true)
  const [receipts,      setReceipts]      = useState([])
  const [listLoading,   setListLoading]   = useState(false)
  const [filterFY,      setFilterFY]      = useState(getFY)
  const [listSearch,    setListSearch]    = useState('')
  const [fyStats,       setFyStats]       = useState({})
  const [showModal,     setShowModal]     = useState(false)
  const [editId,        setEditId]        = useState(null)
  const [fyLocks,         setFyLocks]         = useState({})
  const [showFYMgr,       setShowFYMgr]       = useState(false)
  const [lockedFYModal,   setLockedFYModal]   = useState(null)
  const [receiptDateMode, setReceiptDateMode] = useState('today')
  const [showExportMenu,  setShowExportMenu]  = useState(false)
  const [exporting,       setExporting]       = useState(false)
  const exportMenuRef = useRef(null)

  // only show FYs that have actual data + the current FY
  const availableFYs = useMemo(() => {
    const all = new Set([...Object.keys(fyStats), getFY()])
    return [...all].sort()
  }, [fyStats])

  const loadCategories = useCallback(() => {
    setCatsLoading(true)
    getActiveCategories()
      .then(cats => setCategories(cats))
      .catch(() => setCategories([]))
      .finally(() => setCatsLoading(false))
  }, [])
  useEffect(() => { loadCategories() }, [loadCategories])

  // always start on current FY when the page mounts (handles SPA navigation)
  useEffect(() => { setFilterFY(getFY()) }, [])

  const loadFyStats = useCallback(async () => {
    const cur = getFY()
    const [startYear] = cur.split('-').map(Number)
    const fysToCheck = Array.from({ length: 12 }, (_, i) => {
      const s = startYear - i
      return `${s}-${String(s + 1).slice(-2)}`
    })
    const results = await Promise.all(
      fysToCheck.map(fy =>
        supabase.from('receipts').select('*', { count: 'exact', head: true }).eq('financial_year', fy)
      )
    )
    const counts = {}
    fysToCheck.forEach((fy, i) => {
      const c = results[i].count
      if (c != null && c > 0) counts[fy] = c
    })
    setFyStats(counts)
  }, [])
  useEffect(() => { loadFyStats() }, [loadFyStats])

  const loadList = useCallback(async () => {
    setListLoading(true)
    try {
      let q = supabase
        .from('receipts')
        .select('id,receipt_number,receipt_date,member_id,member_name,payment_mode,month_paid,grand_total,financial_year')
        .order('receipt_number', { ascending: false })
      if (filterFY)          q = q.eq('financial_year', filterFY)
      if (listSearch.trim()) {
        const s = listSearch.trim()
        q = q.or(`receipt_number.ilike.%${s}%,member_name.ilike.%${s}%,member_id.ilike.%${s}%`)
      }
      const { data, error } = await q
      if (error) throw error
      setReceipts(data || [])
    } catch (e) { toast(e.message, 'error') }
    setListLoading(false)
  }, [filterFY, listSearch, toast])
  useEffect(() => { loadList() }, [loadList])

  useEffect(() => {
    supabase.from('churches').select('receipt_date_mode').limit(1).single()
      .then(({ data }) => { if (data?.receipt_date_mode) setReceiptDateMode(data.receipt_date_mode) })
  }, [])

  const loadFYLockData = useCallback(async () => {
    const { data, error } = await supabase.from('receipt_financial_years').select('*')
    if (error) return  // table may not exist yet; silently ignore until SQL is run
    const map = {}
    ;(data || []).forEach(r => { map[r.fy] = r })
    setFyLocks(map)
  }, [])
  useEffect(() => { loadFYLockData() }, [loadFYLockData])

  // auto-lock FYs idle > 10 days
  useEffect(() => {
    if (!Object.keys(fyLocks).length) return
    const toLock = Object.entries(fyLocks)
      .filter(([, r]) => !r.is_locked && r.last_activity_at && Date.now() - new Date(r.last_activity_at).getTime() > TEN_DAYS_MS)
      .map(([fy]) => fy)
    if (!toLock.length) return
    Promise.all(toLock.map(fy =>
      supabase.from('receipt_financial_years').upsert({ fy, is_locked: true }, { onConflict: 'fy' })
    )).then(loadFYLockData)
  }, [fyLocks]) // eslint-disable-line react-hooks/exhaustive-deps

  const updateFYActivity = useCallback(async (fy) => {
    const { error } = await supabase.from('receipt_financial_years')
      .upsert({ fy, is_locked: false, last_activity_at: new Date().toISOString() }, { onConflict: 'fy' })
    if (!error) loadFYLockData()
  }, [loadFYLockData])

  const isAutoLocked = (fy) => {
    const r = fyLocks[fy]
    return r?.is_locked === true && !!r.last_activity_at && Date.now() - new Date(r.last_activity_at).getTime() > TEN_DAYS_MS
  }

  const openNew = useCallback(() => {
    if (catsLoading) { toast('Loading categories…', 'info'); return }
    if (fyLocks[filterFY]?.is_locked) { setLockedFYModal(filterFY); return }
    setEditId(null); setShowModal(true)
  }, [catsLoading, toast, filterFY, fyLocks])

  const openEdit = (row) => {
    if (fyLocks[row.financial_year]?.is_locked) { setLockedFYModal(row.financial_year); return }
    setEditId(row.id); setShowModal(true)
  }

  const del = async (row) => {
    if (!window.confirm(`Delete receipt ${row.receipt_number}?`)) return
    await supabase.from('receipt_items').delete().eq('receipt_id', row.id)
    const { error } = await supabase.from('receipts').delete().eq('id', row.id)
    if (error) { toast(error.message, 'error'); return }
    toast('Receipt deleted', 'success')
    updateFYActivity(row.financial_year)
    loadList(); loadFyStats()
  }

  // close export menu on outside click
  useEffect(() => {
    if (!showExportMenu) return
    const h = e => { if (exportMenuRef.current && !exportMenuRef.current.contains(e.target)) setShowExportMenu(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [showExportMenu])

  // ── excel export (receipts list) ─────────────────────────────
  const RECEIPT_EXPORT_COLS = [
    { key: 'receipt_number',   header: 'Receipt No',        align: 'center' },
    { key: 'receipt_date',     header: 'Date',              align: 'center' },
    { key: 'financial_year',   header: 'Financial Year',    align: 'center' },
    { key: 'member_id',        header: 'Member ID',         align: 'center' },
    { key: 'member_name',      header: 'Member Name',       align: 'left'   },
    { key: 'address',          header: 'Address',           align: 'left'   },
    { key: 'address1',         header: 'Area 1',            align: 'left'   },
    { key: 'address2',         header: 'Area 2',            align: 'left'   },
    { key: 'city',             header: 'City',              align: 'left'   },
    { key: 'mobile',           header: 'Mobile',            align: 'center' },
    { key: 'whatsapp',         header: 'WhatsApp',          align: 'center' },
    { key: 'month_paid',       header: 'Month(s) Paid',     align: 'center' },
    { key: 'payment_mode',     header: 'Payment Mode',      align: 'center' },
    { key: 'cheque_dd_no',     header: 'Cheque/DD No',      align: 'center' },
    { key: 'transaction_date', header: 'Transaction Date',  align: 'center' },
    { key: 'narration',        header: 'Narration',         align: 'left'   },
    { key: 'grand_total',        header: 'Amount (₹)',        align: 'right'  },
    { key: 'created_by',         header: 'Created By',        align: 'left'   },
    { key: 'last_modified_by',   header: 'Modified By',       align: 'left'   },
    { key: 'last_modified_at',   header: 'Modified On',       align: 'center' },
  ]
  const fmtDatetime = iso => {
    if (!iso) return ''
    const d = new Date(iso)
    if (isNaN(d.getTime())) return iso
    const dd   = String(d.getDate()).padStart(2,'0')
    const mm   = String(d.getMonth()+1).padStart(2,'0')
    const yyyy = d.getFullYear()
    const hh   = String(d.getHours()).padStart(2,'0')
    const min  = String(d.getMinutes()).padStart(2,'0')
    return `${dd}-${mm}-${yyyy} ${hh}:${min}`
  }
  const toReceiptRow = r => ({
    receipt_number:    r.receipt_number   || '',
    receipt_date:      fmtDate(r.receipt_date),
    financial_year:    r.financial_year   || '',
    member_id:         r.member_id        || '',
    member_name:       r.member_name      || '',
    address:           r.address          || '',
    address1:          r.address1         || '',
    address2:          r.address2         || '',
    city:              r.city             || '',
    mobile:            r.mobile           || '',
    whatsapp:          r.whatsapp         || '',
    month_paid:        r.month_paid       || '',
    payment_mode:      r.payment_mode     || '',
    cheque_dd_no:      r.cheque_dd_no     || '',
    transaction_date:  fmtDate(r.transaction_date),
    narration:         r.narration        || '',
    grand_total:       Math.round(parseFloat(r.grand_total) || 0),
    created_by:        r.created_by       || '',
    last_modified_by:  r.last_modified_by || '',
    last_modified_at:  fmtDatetime(r.last_modified_at),
  })

  const fetchAllReceipts = async (fy) => {
    const PAGE = 1000
    let all = [], offset = 0
    while (true) {
      let q = supabase
        .from('receipts')
        .select('receipt_number,receipt_date,financial_year,member_id,member_name,address,address1,address2,city,mobile,whatsapp,month_paid,payment_mode,cheque_dd_no,transaction_date,narration,grand_total,created_by,last_modified_by,last_modified_at,receipt_items(category_id,amt,months,total)')
        .order('receipt_number', { ascending: true })
        .range(offset, offset + PAGE - 1)
      if (fy) q = q.eq('financial_year', fy)
      const { data, error } = await q
      if (error) throw error
      all = all.concat(data || [])
      if (!data?.length || data.length < PAGE) break
      offset += PAGE
    }
    return all
  }

  const doExport = async (fy) => {
    setExporting(true); setShowExportMenu(false)
    try {
      const [data, cats] = await Promise.all([fetchAllReceipts(fy), getActiveCategories()])
      if (!data.length) { toast('No data to export', 'error'); setExporting(false); return }

      // Build dynamic per-category columns (rate/month, months, total)
      const catCols = cats.flatMap(cat => [
        { key: `_camt_${cat.id}`,  header: cat.name,               align: 'right'  },
        { key: `_cmon_${cat.id}`,  header: `${cat.name} Months`,   align: 'center' },
        { key: `_ctot_${cat.id}`,  header: `${cat.name} Total`,    align: 'right'  },
      ])
      const cols = [...RECEIPT_EXPORT_COLS, ...catCols]

      const buildRow = r => {
        const row = toReceiptRow(r)
        const itemMap = {}
        ;(r.receipt_items || []).forEach(i => { itemMap[i.category_id] = i })
        cats.forEach(cat => {
          const item = itemMap[cat.id]
          row[`_camt_${cat.id}`]  = item ? (Math.round(parseFloat(item.amt)   || 0) || '') : ''
          row[`_cmon_${cat.id}`]  = item ? (item.months || '')                              : ''
          row[`_ctot_${cat.id}`]  = item ? (Math.round(parseFloat(item.total) || 0) || '') : ''
        })
        return row
      }

      if (fy) {
        await exportToExcel(cols, data.map(buildRow), `FY ${fy}`, `Receipts_${fy}.xlsx`)
      } else {
        const byFY = {}
        data.forEach(r => { if (!byFY[r.financial_year]) byFY[r.financial_year] = []; byFY[r.financial_year].push(buildRow(r)) })
        const sheets = Object.keys(byFY).sort().map(f => ({ name: `FY ${f}`, rows: byFY[f] }))
        await exportToExcelMultiSheet(cols, sheets, 'Receipts_All.xlsx')
      }
    } catch (e) { toast(e.message, 'error') }
    setExporting(false)
  }

  // "+" hotkey → new receipt (skips when focus is inside an input)
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== '+' && e.key !== '=') return
      const tag = document.activeElement?.tagName?.toLowerCase()
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return
      openNew()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [openNew])

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Receipt Entry</h1>
          <p className="page-subtitle">Record member payments across all categories</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>

          {/* Excel Export dropdown */}
          <div ref={exportMenuRef} style={{ position: 'relative' }}>
            <button onClick={() => setShowExportMenu(o => !o)} disabled={exporting}
              className="action-btn"
              style={{ background: '#16a34a', opacity: exporting ? 0.6 : 1, gap: 5 }}>
              {exporting ? <Loader2 size={13} className="animate-spin"/> : <FileSpreadsheet size={13}/>}
              Excel Export
              <ChevronDown size={11} style={{ marginLeft: 1, transition: 'transform 0.15s', transform: showExportMenu ? 'rotate(180deg)' : 'none' }}/>
            </button>
            {showExportMenu && (
              <div style={{ position: 'absolute', top: 'calc(100% + 5px)', right: 0, zIndex: 400,
                background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: 10,
                boxShadow: '0 12px 32px rgba(0,0,0,0.15)', width: 240, overflow: 'hidden',
                animation: 'dropDown 0.15s ease both' }}>
                <button onClick={() => doExport(null)}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '11px 14px',
                    background: 'none', border: 'none', borderBottom: '1px solid var(--card-border)',
                    cursor: 'pointer', textAlign: 'left' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--table-row-hover)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'none'}>
                  <FileSpreadsheet size={14} style={{ color: '#16a34a', flexShrink: 0 }}/>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>All Financial Years</div>
                    <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 1 }}>One worksheet per FY</div>
                  </div>
                </button>
                {availableFYs.filter(fy => (fyStats[fy] || 0) > 0).map(fy => (
                  <button key={fy} onClick={() => doExport(fy)}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      width: '100%', padding: '9px 14px', background: 'none', border: 'none',
                      borderBottom: '1px solid var(--card-border)', cursor: 'pointer', textAlign: 'left' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--table-row-hover)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'none'}>
                    <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-1)' }}>FY {fy}</span>
                    <span style={{ fontSize: 11, color: 'var(--text-3)', fontVariantNumeric: 'tabular-nums' }}>
                      {fyStats[fy]} receipt{fyStats[fy] !== 1 ? 's' : ''}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* New Receipt */}
          <button className="action-btn" onClick={openNew} disabled={catsLoading}
            style={{ background: 'var(--sidebar-bg)' }} title="New receipt  (+)">
            {catsLoading ? <Loader2 size={13} className="animate-spin"/> : <Plus size={13}/>}
            New Receipt
          </button>

        </div>
      </div>

      {/* FY tiles + gear */}
      {availableFYs.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div className="card" style={{ padding: 0, display: 'flex', overflow: 'hidden' }}>
            {availableFYs.map((fy, i, arr) => {
              const count    = fyStats[fy] || 0
              const active   = filterFY === fy
              const locked   = fyLocks[fy]?.is_locked === true
              const autoLk   = isAutoLocked(fy)
              return (
                <div key={fy} onClick={() => setFilterFY(fy)}
                  style={{
                    flex: 1, minWidth: 0, padding: '12px 18px', cursor: 'pointer',
                    borderRight: i < arr.length - 1 ? '1px solid var(--card-border)' : 'none',
                    background: active ? 'var(--sidebar-bg)' : locked ? 'rgba(217,119,6,0.06)' : 'transparent',
                    transition: 'background 0.15s', position: 'relative',
                  }}>
                  {locked && (
                    <div style={{ position: 'absolute', top: 6, right: 8, fontSize: 9, fontWeight: 700,
                      background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a',
                      borderRadius: 4, padding: '1px 5px', letterSpacing: '0.05em' }}>
                      {autoLk ? 'AUTO-LOCKED' : 'LOCKED'}
                    </div>
                  )}
                  <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.09em',
                    color: active ? 'rgba(255,255,255,0.6)' : locked ? '#d97706' : 'var(--text-3)', marginBottom: 4 }}>FY {fy}</div>
                  <div style={{ fontSize: 34, fontWeight: 800,
                    color: active ? '#fff' : locked ? '#d97706' : 'var(--text-1)',
                    fontVariantNumeric: 'tabular-nums', lineHeight: 1.1 }}>{count}</div>
                  <div style={{ fontSize: 11, marginTop: 4,
                    color: active ? 'rgba(255,255,255,0.5)' : locked ? '#d97706' : 'var(--text-3)' }}>
                    {locked ? (autoLk ? 'auto-locked' : 'locked') : `receipt${count !== 1 ? 's' : ''}`}
                  </div>
                </div>
              )
            })}
            {/* Gear — FY Manager */}
            <div style={{ display: 'flex', alignItems: 'center', padding: '0 14px',
              borderLeft: '1px solid var(--card-border)', flexShrink: 0 }}>
              <button onClick={e => { e.stopPropagation(); setShowFYMgr(true) }}
                title="FY Lock Manager"
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 6, borderRadius: 6,
                  color: 'var(--text-3)', display: 'flex', alignItems: 'center', transition: 'all 0.15s' }}
                onMouseEnter={e => { e.currentTarget.style.background = 'var(--table-row-hover)'; e.currentTarget.style.color = 'var(--text-1)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = 'var(--text-3)' }}>
                <Settings size={16}/>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Search bar */}
      <div className="card" style={{ padding: '12px 16px', marginBottom: 16, display: 'flex', gap: 12, alignItems: 'center' }}>
        <div style={{ flex: 1, position: 'relative' }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }}/>
          <input value={listSearch} onChange={e => setListSearch(e.target.value)}
            placeholder="Search receipt no, member name or ID…"
            className="field-input" style={{ paddingLeft: 32, width: '100%' }}/>
          {listSearch && (
            <button onClick={() => setListSearch('')}
              style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)' }}>
              <X size={13}/>
            </button>
          )}
        </div>
        <span style={{ fontSize: 13, color: 'var(--text-3)', whiteSpace: 'nowrap' }}>
          {listLoading ? <Loader2 size={13} className="animate-spin inline"/> : `${receipts.length} receipt${receipts.length !== 1 ? 's' : ''}`}
        </span>
      </div>

      {/* Receipt table */}
      <div className="card" style={{ overflow: 'hidden' }}>
        {listLoading ? (
          <div style={{ padding: 48, textAlign: 'center' }}>
            <Loader2 size={28} className="animate-spin" style={{ color: 'var(--text-3)', margin: '0 auto' }}/>
          </div>
        ) : receipts.length === 0 ? (
          <div style={{ padding: 48, textAlign: 'center' }}>
            <IndianRupee size={36} style={{ color: 'var(--text-3)', margin: '0 auto 12px', display: 'block' }}/>
            <p style={{ color: 'var(--text-2)', fontWeight: 500, margin: 0 }}>No receipts found</p>
            <p style={{ color: 'var(--text-3)', fontSize: 13, marginTop: 4 }}>
              {listSearch ? 'Try a different search' : `No receipts for FY ${filterFY}`}
            </p>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--table-header-bg)', borderBottom: '1px solid var(--table-border)' }}>
                {['Receipt No','Date','Member','Month(s) Paid','Mode','Amount',''].map(h => (
                  <th key={h} style={{ padding: '10px 14px', textAlign: h === 'Amount' ? 'right' : 'left',
                    fontSize: 11, fontWeight: 700, color: 'var(--text-3)',
                    textTransform: 'uppercase', letterSpacing: '0.07em', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {receipts.map((r, i) => (
                <tr key={r.id} style={{ borderBottom: '1px solid var(--table-border)', background: i % 2 === 0 ? 'transparent' : 'rgba(0,0,0,0.012)' }}>
                  <td style={{ padding: '10px 14px', fontFamily: 'monospace', fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>{r.receipt_number}</td>
                  <td style={{ padding: '10px 14px', fontSize: 13, color: 'var(--text-2)', whiteSpace: 'nowrap' }}>{fmtDate(r.receipt_date)}</td>
                  <td style={{ padding: '10px 14px' }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>{r.member_name}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{r.member_id}</div>
                  </td>
                  <td style={{ padding: '10px 14px', fontSize: 12, color: 'var(--text-2)' }}>{r.month_paid || '—'}</td>
                  <td style={{ padding: '10px 14px' }}>
                    <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 4,
                      background: r.payment_mode === 'Cash' ? '#f0fdf4' : '#eff6ff',
                      color:      r.payment_mode === 'Cash' ? '#15803d' : '#1d4ed8' }}>
                      {r.payment_mode}
                    </span>
                  </td>
                  <td style={{ padding: '10px 14px', textAlign: 'right', fontSize: 13, fontWeight: 700, color: 'var(--text-1)', whiteSpace: 'nowrap', fontFamily: 'monospace' }}>
                    ₹{Number(r.grand_total || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </td>
                  <td style={{ padding: '10px 14px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <button onClick={() => openEdit(r)} title="Edit"
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: '4px 6px', borderRadius: 4 }}
                      onMouseEnter={e => e.currentTarget.style.color = '#2563eb'}
                      onMouseLeave={e => e.currentTarget.style.color = 'var(--text-3)'}>
                      <Edit2 size={14}/>
                    </button>
                    <button onClick={() => del(r)} title="Delete"
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: '4px 6px', borderRadius: 4 }}
                      onMouseEnter={e => e.currentTarget.style.color = '#dc2626'}
                      onMouseLeave={e => e.currentTarget.style.color = 'var(--text-3)'}>
                      <Trash2 size={14}/>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* FY Manager popup */}
      {showFYMgr && (
        <ReceiptFYManagerPopup
          fyLocks={fyLocks}
          availableFYs={availableFYs}
          onClose={() => setShowFYMgr(false)}
          onRefresh={loadFYLockData}
          toast={toast}
        />
      )}

      {/* Locked FY alert */}
      {lockedFYModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'var(--overlay)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <div style={{ background: 'var(--card-bg)', borderRadius: 14, padding: '32px 36px',
            maxWidth: 400, textAlign: 'center',
            boxShadow: '0 24px 60px rgba(0,0,0,0.4)' }}>
            <div style={{ width: 48, height: 48, borderRadius: 12, background: '#fef3c7',
              display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              <Lock size={22} style={{ color: '#d97706' }}/>
            </div>
            <h3 style={{ margin: '0 0 8px', fontSize: 16, fontWeight: 700, color: 'var(--text-1)' }}>
              FY {lockedFYModal} is Locked
            </h3>
            <p style={{ margin: '0 0 20px', fontSize: 13, color: 'var(--text-2)', lineHeight: 1.6 }}>
              This financial year is locked and cannot be edited.<br/>
              Use the <strong>FY Manager</strong> (⚙ gear icon) to unlock it.
            </p>
            <button onClick={() => setLockedFYModal(null)} autoFocus
              style={{ padding: '8px 28px', borderRadius: 8, background: 'var(--sidebar-bg)',
                color: '#fff', border: 'none', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
              OK
            </button>
          </div>
        </div>
      )}

      {showModal && (
        <ReceiptModal
          editId={editId}
          initialFY={filterFY}
          categories={categories}
          profile={profile}
          toast={toast}
          receiptDateMode={receiptDateMode}
          onClose={() => setShowModal(false)}
          onSaved={(fy) => {
            setShowModal(false); loadList(); loadFyStats()
            if (fy) updateFYActivity(fy)
          }}
        />
      )}
    </div>
  )
}

// ════════════════════════════════════════════════════════
//  FY LOCK MANAGER POPUP
// ════════════════════════════════════════════════════════

function ReceiptFYManagerPopup({ fyLocks, availableFYs, onClose, onRefresh, toast }) {
  const [unlockingFY, setUnlockingFY] = useState(null)
  const [unlockPw,    setUnlockPw]    = useState('')
  const [unlockErr,   setUnlockErr]   = useState('')
  const [unlocking,   setUnlocking]   = useState(false)
  const pwRef = useRef(null)

  const allFYs = useMemo(() => {
    const all = new Set([...availableFYs, ...Object.keys(fyLocks)])
    return [...all].sort()
  }, [availableFYs, fyLocks])

  useEffect(() => {
    if (unlockingFY) setTimeout(() => pwRef.current?.focus(), 60)
  }, [unlockingFY])

  const lockFY = async (fy) => {
    const { error } = await supabase.from('receipt_financial_years').upsert({ fy, is_locked: true }, { onConflict: 'fy' })
    if (error) { toast?.('Lock failed: ' + error.message, 'error'); return }
    onRefresh()
  }

  const doUnlock = async (fy) => {
    if (!unlockPw) return
    setUnlocking(true); setUnlockErr('')
    const { data: { user } } = await supabase.auth.getUser()
    const { error } = await supabase.auth.signInWithPassword({ email: user?.email || '', password: unlockPw })
    setUnlocking(false)
    if (error) { setUnlockErr('Incorrect password'); pwRef.current?.select(); return }
    await supabase.from('receipt_financial_years').upsert({ fy, is_locked: false }, { onConflict: 'fy' })
    setUnlockingFY(null); setUnlockPw(''); setUnlockErr('')
    onRefresh()
    toast(`FY ${fy} unlocked`, 'success')
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'var(--overlay)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
      <div style={{ background: 'var(--card-bg)', borderRadius: 14, width: 460,
        maxHeight: '80vh', display: 'flex', flexDirection: 'column',
        boxShadow: '0 32px 80px rgba(0,0,0,0.4)' }}>

        {/* Header */}
        <div style={{ background: 'var(--sidebar-bg)', borderRadius: '16px 16px 0 0',
          padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0,
          boxShadow: 'inset 0 1.5px 0 rgba(255,255,255,0.25), inset 0 -3px 0 rgba(0,0,0,0.3)',
          position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none',
            background: 'linear-gradient(130deg, rgba(255,255,255,0.15) 0%, transparent 50%)' }}/>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(255,255,255,0.15)',
            border: '1px solid rgba(255,255,255,0.25)', display: 'flex', alignItems: 'center',
            justifyContent: 'center', position: 'relative' }}>
            <Settings size={15} style={{ color: '#fff' }}/>
          </div>
          <div style={{ position: 'relative', flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>FY Lock Manager</div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>Manage financial year lock state</div>
          </div>
          <button onClick={onClose} tabIndex={-1}
            style={{ background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.22)',
              borderRadius: 7, padding: '5px 8px', cursor: 'pointer', color: '#fff',
              position: 'relative', display: 'flex', alignItems: 'center', transition: 'all 0.15s' }}
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(239,68,68,0.8)'}
            onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.12)'}>
            <X size={14}/>
          </button>
        </div>

        {/* Body */}
        <div style={{ overflowY: 'auto', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {allFYs.map(fy => {
            const row      = fyLocks[fy]
            const locked   = row?.is_locked === true
            const autoLk   = locked && !!row?.last_activity_at && Date.now() - new Date(row.last_activity_at).getTime() > TEN_DAYS_MS
            const isExpanded = unlockingFY === fy

            return (
              <div key={fy} style={{
                borderRadius: 10, overflow: 'hidden', transition: 'all 0.15s',
                border: `1px solid ${locked ? '#fde68a' : 'var(--card-border)'}`,
                background: locked ? 'rgba(253,246,224,0.5)' : 'transparent',
              }}>
                <div style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: locked ? '#d97706' : 'var(--text-1)' }}>
                      FY {fy}
                    </div>
                    {locked && (
                      <div style={{ fontSize: 11, color: '#d97706', marginTop: 2 }}>
                        {autoLk ? 'Auto-locked (idle > 10 days)' : 'Manually locked'}
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => {
                      if (locked) {
                        setUnlockingFY(isExpanded ? null : fy)
                        setUnlockPw(''); setUnlockErr('')
                      } else {
                        lockFY(fy)
                      }
                    }}
                    style={{ padding: '5px 14px', borderRadius: 7, fontSize: 12, fontWeight: 600,
                      border: '1px solid', cursor: 'pointer', transition: 'all 0.12s',
                      background: locked ? '#fef3c7' : 'transparent',
                      borderColor: locked ? '#fde68a' : 'var(--card-border)',
                      color: locked ? '#d97706' : 'var(--text-2)',
                      display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Lock size={11}/>
                    {locked ? (isExpanded ? 'Cancel' : 'Unlock…') : 'Lock'}
                  </button>
                </div>
                {isExpanded && locked && (
                  <div style={{ borderTop: '1px solid #fde68a', padding: '10px 14px',
                    background: 'rgba(254,243,199,0.7)' }}>
                    <div style={{ fontSize: 11, color: '#92400e', marginBottom: 7 }}>
                      Enter your password to unlock FY {fy}:
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <input ref={pwRef} type="password" value={unlockPw}
                        onChange={e => { setUnlockPw(e.target.value); setUnlockErr('') }}
                        onKeyDown={e => { if (e.key === 'Enter') doUnlock(fy) }}
                        placeholder="Password"
                        className="field-input"
                        style={{ flex: 1, height: 32, fontSize: 13 }}/>
                      <button onClick={() => doUnlock(fy)} disabled={unlocking || !unlockPw}
                        style={{ padding: '0 16px', height: 32, borderRadius: 7, fontSize: 12,
                          fontWeight: 700, border: 'none', cursor: unlocking || !unlockPw ? 'default' : 'pointer',
                          background: 'var(--sidebar-bg)', color: '#fff', opacity: !unlockPw ? 0.5 : 1,
                          display: 'flex', alignItems: 'center', gap: 6, transition: 'opacity 0.15s' }}>
                        {unlocking ? <Loader2 size={12} className="animate-spin"/> : null}
                        Unlock
                      </button>
                    </div>
                    {unlockErr && (
                      <div style={{ marginTop: 6, fontSize: 11, color: '#dc2626', fontWeight: 600 }}>
                        {unlockErr}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
          {allFYs.length === 0 && (
            <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>
              No financial years found
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════
//  RECEIPT MODAL
// ════════════════════════════════════════════════════════

function ReceiptModal({ editId, initialFY, categories, profile, toast, onClose, onSaved, receiptDateMode }) {
  const today = new Date().toISOString().slice(0, 10)

  const [dateIsCarryForward, setDateIsCarryForward] = useState(false)

  const [form, setForm] = useState({
    receipt_number: '', receipt_date: today,
    financial_year: editId ? (initialFY || getFY()) : getFY(),
    month_paid: '', payment_mode: 'Cash',
    cheque_dd_no: '', transaction_date: '', narration: '',
    member_id: '', member_name: '',
    address: '', address1: '', address2: '', city: '',
    mobile: '', whatsapp: '',
  })
  const [items,      setItems]      = useState([])
  const [saving,     setSaving]     = useState(false)
  const [loading,    setLoading]    = useState(!!editId)
  const [paidMonths, setPaidMonths] = useState(new Set())
  const [selMonths,  setSelMonths]  = useState([])

  const [memberId,            setMemberId]            = useState('')
  const [selMember,           setSelMember]           = useState(null)
  const [memberIdSuggestions, setMemberIdSuggestions] = useState([])
  const [showMemberIdPopup,   setShowMemberIdPopup]   = useState(false)
  const memberIdTimer = useRef(null)
  const memberIdRef   = useRef(null)
  const dateRef       = useRef(null)

  // drag-select state (ref avoids re-renders during drag)
  const dragRef = useRef({ active: false, action: null })

  const sf = k => v => setForm(f => ({ ...f, [k]: v }))

  // ── mouseup anywhere ends drag ──────────────────────────────
  useEffect(() => {
    const onUp = () => { dragRef.current.active = false }
    document.addEventListener('mouseup', onUp)
    return () => document.removeEventListener('mouseup', onUp)
  }, [])

  // Carry-forward date: for new receipts in 'fixed' mode, pre-fill with last saved receipt date
  useEffect(() => {
    if (editId || receiptDateMode !== 'fixed') return
    const fy = getFY()   // always today's FY — prevents carrying a past-FY date into a new FY
    supabase.from('receipts').select('receipt_date')
      .eq('financial_year', fy)
      .order('receipt_number', { ascending: false })
      .limit(1)
      .then(({ data }) => {
        if (data?.[0]?.receipt_date) {
          setForm(f => ({ ...f, receipt_date: data[0].receipt_date }))
          setDateIsCarryForward(true)
        }
      })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const loadPaidMonths = useCallback(async (mId, fy, excludeId = null) => {
    // Select both month_paid and receipt_date — fall back to date-derived month when month_paid is null
    let q = supabase.from('receipts').select('month_paid,receipt_date')
      .eq('member_id', mId).eq('financial_year', fy)
    if (excludeId) q = q.neq('id', excludeId)
    const { data } = await q
    const CAL_MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']
    const paid = new Set()
    ;(data || []).forEach(r => {
      if (r.month_paid) {
        r.month_paid.split(',').forEach(m => {
          const t = m.trim(); if (!t) return
          const fi = FY_MONTHS.findIndex(n => n.toLowerCase() === t.toLowerCase())
          if (fi >= 0) { paid.add(FY_MONTHS[fi]); return }
          const si = FY_MON_S.findIndex(n => n.toLowerCase() === t.toLowerCase())
          if (si >= 0) { paid.add(FY_MONTHS[si]); return }
          const num = parseInt(t, 10)
          if (!isNaN(num) && num >= 1 && num <= 12) { paid.add(CAL_MONTHS[num - 1]); return }
          paid.add(t)
        })
      } else if (r.receipt_date) {
        // No explicit month stored (e.g. imported receipts) — derive from receipt date
        const d = new Date(r.receipt_date + 'T00:00:00')
        if (!isNaN(d.getTime())) paid.add(CAL_MONTHS[d.getMonth()])
      }
    })
    setPaidMonths(paid)
  }, [])

  const onMonthMouseDown = useCallback((month) => {
    if (paidMonths.has(month)) return
    const action = selMonths.includes(month) ? 'deselect' : 'select'
    dragRef.current = { active: true, action }
    setSelMonths(prev =>
      action === 'select'
        ? prev.includes(month) ? prev : [...prev, month]
        : prev.filter(m => m !== month)
    )
  }, [paidMonths, selMonths])

  const onMonthDragEnter = useCallback((month) => {
    if (!dragRef.current.active || paidMonths.has(month)) return
    setSelMonths(prev => {
      if (dragRef.current.action === 'select'   && !prev.includes(month)) return [...prev, month]
      if (dragRef.current.action === 'deselect' &&  prev.includes(month)) return prev.filter(m => m !== month)
      return prev
    })
  }, [paidMonths])

  // init items
  useEffect(() => {
    if (!categories.length) return
    setItems(categories.map(c => ({ category_id: c.id, name: c.name, enabled: false, amt: '', months: '1', total: 0 })))
  }, [categories])

  // auto receipt number
  useEffect(() => {
    if (editId || !form.financial_year) return
    nextReceiptNumber(form.financial_year).then(n => setForm(f => ({ ...f, receipt_number: n })))
  }, [editId, form.financial_year])

  // selMonths → form.month_paid + auto-sync category months (new only)
  useEffect(() => {
    setForm(f => ({ ...f, month_paid: selMonths.join(', ') }))
    if (!editId && selMonths.length > 0) {
      setItems(prev => prev.map(item =>
        item.enabled
          ? { ...item, months: String(selMonths.length), total: (parseFloat(item.amt) || 0) * selMonths.length }
          : item
      ))
    }
  }, [selMonths]) // eslint-disable-line react-hooks/exhaustive-deps

  // load edit
  useEffect(() => {
    if (!editId) return
    setLoading(true)
    Promise.all([
      supabase.from('receipts').select('*').eq('id', editId).single(),
      supabase.from('receipt_items').select('*').eq('receipt_id', editId),
    ]).then(async ([{ data: rec }, { data: recItems }]) => {
      if (!rec) return
      setForm({
        receipt_number: rec.receipt_number || '', receipt_date: rec.receipt_date || '',
        financial_year: rec.financial_year || '', month_paid: rec.month_paid || '',
        payment_mode: rec.payment_mode || 'Cash', cheque_dd_no: rec.cheque_dd_no || '',
        transaction_date: rec.transaction_date || '', narration: rec.narration || '',
        member_id: rec.member_id || '', member_name: rec.member_name || '',
        address: rec.address || '', address1: rec.address1 || '',
        address2: rec.address2 || '', city: rec.city || '',
        mobile: rec.mobile || '', whatsapp: rec.whatsapp || '',
      })
      setMemberId(rec.member_id || '')
      setSelMember({ member_id: rec.member_id, member_name: rec.member_name })
      setSelMonths(rec.month_paid ? rec.month_paid.split(',').map(s => s.trim()).filter(Boolean) : [])
      const map = {}
      ;(recItems || []).forEach(i => { map[i.category_id] = i })
      setItems(categories.map(c => {
        const li = map[c.id]
        if (!li) return { category_id: c.id, name: c.name, enabled: false, amt: '', months: '1', total: 0 }
        return { category_id: c.id, name: c.name, enabled: true,
          amt: String(li.amt || ''), months: String(li.months || '1'), total: li.total || 0 }
      }))
      if (rec.member_id && rec.financial_year)
        await loadPaidMonths(rec.member_id, rec.financial_year, editId)
    }).finally(() => setLoading(false))
  }, [editId, categories, loadPaidMonths])

  useEffect(() => {
    if (loading) return
    setTimeout(() => memberIdRef.current?.focus(), 80)
  }, [loading])

  // FY from date — when date crosses FY boundary, update FY and reload paid months
  useEffect(() => {
    if (!form.receipt_date) return
    const newFY = getFY(form.receipt_date)
    if (newFY !== form.financial_year) {
      setForm(f => ({ ...f, financial_year: newFY }))
      if (selMember?.member_id)
        loadPaidMonths(selMember.member_id, newFY)
    }
  }, [form.receipt_date]) // eslint-disable-line react-hooks/exhaustive-deps

  const onMemberIdChange = (val) => {
    setMemberId(val)
    if (selMember) setSelMember(null)
    clearTimeout(memberIdTimer.current)
    if (!val.trim()) { setShowMemberIdPopup(false); setMemberIdSuggestions([]); return }
    memberIdTimer.current = setTimeout(async () => {
      const { data } = await supabase.from('members')
        .select('member_id,member_name,address_street,area_1,area_2,city,mobile,whatsapp')
        .ilike('member_id', `${val.trim()}%`).eq('is_active', true)
        .order('member_id', { ascending: true }).limit(20)
      const rows = data || []
      setMemberIdSuggestions(rows)
      setShowMemberIdPopup(rows.length > 0)
    }, 250)
  }

  const loadMember = async (m) => {
    setMemberId(m.member_id)
    setSelMember(m)
    setShowMemberIdPopup(false)
    setMemberIdSuggestions([])
    setForm(f => ({
      ...f,
      member_id: m.member_id, member_name: m.member_name,
      address: m.address_street || '', address1: m.area_1 || '',
      address2: m.area_2 || '', city: m.city || '',
      mobile: m.mobile || '', whatsapp: m.whatsapp || '',
    }))
    const fy = form.financial_year
    await loadPaidMonths(m.member_id, fy)
    // find last receipt in current FY; fall back to previous FY if none
    let sourceReceipt = null
    const { data: currFYRec } = await supabase.from('receipts')
      .select('id').eq('member_id', m.member_id).eq('financial_year', fy)
      .order('receipt_number', { ascending: false }).limit(1)
    if (currFYRec?.length) {
      sourceReceipt = currFYRec[0]
    } else {
      const { data: prevFYRec } = await supabase.from('receipts')
        .select('id').eq('member_id', m.member_id).eq('financial_year', prevFY(fy))
        .order('receipt_number', { ascending: false }).limit(1)
      if (prevFYRec?.length) sourceReceipt = prevFYRec[0]
    }
    if (sourceReceipt) {
      const { data: prevItems } = await supabase.from('receipt_items').select('*').eq('receipt_id', sourceReceipt.id)
      if (prevItems?.length) {
        const map = {}
        prevItems.forEach(i => { map[i.category_id] = i })
        setItems(curr => curr.map(item => {
          const li = map[item.category_id]
          if (!li) return item
          const amt = String(li.amt || ''), months = String(li.months || '1')
          return { ...item, enabled: true, amt, months, total: (parseFloat(amt)||0) * (parseFloat(months)||0) }
        }))
      }
    }
    setTimeout(() => dateRef.current?.focus(), 50)
  }

  const lookupById = async (id) => {
    const trimmed = id.trim()
    if (!trimmed) return
    const { data } = await supabase.from('members')
      .select('member_id,member_name,address_street,area_1,area_2,city,mobile,whatsapp')
      .ilike('member_id', trimmed).limit(1)
    if (data?.length) await loadMember(data[0])
    else toast(`No member found with ID "${trimmed}"`, 'error')
  }

  const setItem = (idx, field, val) => {
    setItems(prev => {
      const next = [...prev]
      const row  = { ...next[idx], [field]: val }
      if (field === 'amt' || field === 'months') {
        const a  = parseFloat(field === 'amt'    ? val : row.amt)    || 0
        const mo = parseFloat(field === 'months' ? val : row.months) || 0
        row.total = a * mo
      }
      next[idx] = row
      return next
    })
  }

  const grandTotal   = items.filter(i => i.enabled).reduce((s, i) => s + (i.total || 0), 0)
  const enabledCount = items.filter(i => i.enabled).length

  const save = async () => {
    if (!selMember?.member_id && !form.member_id) { toast('Please select a member', 'error'); return }
    if (!form.receipt_date)                         { toast('Enter receipt date', 'error');    return }
    const enabled = items.filter(i => i.enabled && (parseFloat(i.amt) || 0) > 0)
    if (!enabled.length) { toast('Enable at least one category with an amount', 'error'); return }

    setSaving(true)
    try {
      const recData = {
        receipt_number: form.receipt_number, receipt_date: form.receipt_date,
        financial_year: form.financial_year, month_paid: form.month_paid || null,
        payment_mode: form.payment_mode, cheque_dd_no: form.cheque_dd_no || null,
        transaction_date: form.transaction_date || null, narration: form.narration || null,
        member_id: form.member_id, member_name: form.member_name,
        address: form.address || null, address1: form.address1 || null,
        address2: form.address2 || null, city: form.city || null,
        mobile: form.mobile || null, whatsapp: form.whatsapp || null,
        grand_total: grandTotal, created_by: profile?.full_name || profile?.email,
        last_modified_by: profile?.full_name || profile?.email,
        last_modified_at: new Date().toISOString(),
      }
      let receiptId = editId
      if (editId) {
        const { error } = await supabase.from('receipts').update(recData).eq('id', editId)
        if (error) throw error
        await supabase.from('receipt_items').delete().eq('receipt_id', editId)
      } else {
        const { data, error } = await supabase.from('receipts').insert(recData).select('id').single()
        if (error) throw error
        receiptId = data.id
      }
      const itemRows = enabled.map(i => ({
        receipt_id: receiptId, category_id: i.category_id,
        amt: parseFloat(i.amt) || 0, months: parseFloat(i.months) || 0, total: i.total,
      }))
      const { error: iErr } = await supabase.from('receipt_items').insert(itemRows)
      if (iErr) throw iErr
      toast(editId ? 'Receipt updated' : `Receipt ${form.receipt_number} saved`, 'success')
      onSaved(recData.financial_year)
    } catch (e) { toast(e.message, 'error') }
    setSaving(false)
  }

  const showChequeFields = ['Cheque', 'DD'].includes(form.payment_mode)
  const showTxnDate      = ['Cheque', 'DD', 'Net Banking'].includes(form.payment_mode)

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'var(--overlay)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 9999, padding: 12 }}>
      <div className="receipt-modal-official" style={{
        background: '#ffffff', borderRadius: 18, width: '100%',
        maxWidth: 920, maxHeight: '97vh', display: 'flex', flexDirection: 'column',
        boxShadow: '0 40px 80px rgba(0,0,0,0.22), 0 8px 30px rgba(0,0,0,0.10), 0 0 0 1px rgba(13,34,68,0.07)',
        fontFamily: "'Poppins', var(--font-ui, Inter), sans-serif",
      }}>

        {/* ══ Header ══ */}
        <div style={{
          background: 'var(--card-bg)',
          borderRadius: '18px 18px 0 0', padding: '14px 18px', flexShrink: 0,
          borderBottom: '1px solid var(--card-border)',
          display: 'flex', alignItems: 'center', gap: 14,
        }}>
          {/* Icon */}
          <div style={{ width: 40, height: 40, borderRadius: 12, flexShrink: 0,
            background: 'var(--sidebar-light)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 4px 12px rgba(13,34,68,0.22)' }}>
            <IndianRupee size={19} style={{ color: '#fff' }}/>
          </div>
          {/* Title + receipt number */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <span style={{ fontSize: 17, fontWeight: 800, color: 'var(--sidebar-light)', letterSpacing: '-0.01em', lineHeight: 1 }}>
              {editId ? 'Edit Receipt' : 'New Receipt'}
            </span>
            {form.receipt_number && (
              <span className="receipt-no-badge">
                {form.receipt_number}
              </span>
            )}
          </div>
          {/* Spacer pushes FY badge to the right */}
          <div style={{ flex: 1 }}/>
          {/* FY badge — centred in remaining space */}
          <span style={{ background: '#eef2ff', border: '1.5px solid #c7d2fe',
            color: '#3730a3', fontSize: 12, fontWeight: 700,
            borderRadius: 8, padding: '4px 14px', letterSpacing: '0.03em',
            boxShadow: '0 1px 4px rgba(55,48,163,0.12)' }}>
            FY {form.financial_year}
          </span>
          {/* Close */}
          <button onClick={onClose} tabIndex={-1}
            style={{ background: '#991b1b', border: 'none', borderRadius: 8,
              width: 32, height: 32, cursor: 'pointer', color: '#fff',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'all 0.15s', flexShrink: 0 }}
            onMouseEnter={e => { e.currentTarget.style.background = '#7f1d1d'; e.currentTarget.style.transform = 'scale(1.08)' }}
            onMouseLeave={e => { e.currentTarget.style.background = '#991b1b'; e.currentTarget.style.transform = 'scale(1)' }}>
            <X size={15}/>
          </button>
        </div>

        {/* ══ Body ══ */}
        {loading ? (
          <div style={{ padding: 60, textAlign: 'center' }}>
            <Loader2 size={28} className="animate-spin" style={{ color: 'var(--text-3)', margin: '0 auto' }}/>
          </div>
        ) : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '390px 1fr', overflow: 'hidden' }}>

              {/* ── Left panel ── */}
              <div style={{ borderRight: '2px solid #e2e8f0', overflowY: 'auto',
                maxHeight: 'calc(95vh - 140px)', background: '#ffffff',
                padding: '14px 18px 14px', display: 'flex', flexDirection: 'column', gap: 0 }}>

                {/* MEMBER */}
                <FieldLabel>Member</FieldLabel>
                <div style={{ position: 'relative', marginBottom: 6 }}>
                  <input
                    ref={memberIdRef}
                    value={memberId}
                    onChange={e => onMemberIdChange(e.target.value)}
                    onKeyDown={e => {
                      if ((e.key === 'Tab' || e.key === 'Enter') && memberId.trim()) {
                        e.preventDefault()
                        setShowMemberIdPopup(false)
                        if (selMember) dateRef.current?.focus()
                        else lookupById(memberId)
                      }
                      if (e.key === 'Escape') setShowMemberIdPopup(false)
                    }}
                    onFocus={() => memberIdSuggestions.length > 0 && setShowMemberIdPopup(true)}
                    onBlur={() => setTimeout(() => {
                      setShowMemberIdPopup(false)
                      if (memberId.trim() && !selMember) lookupById(memberId)
                    }, 200)}
                    placeholder="Member ID + Tab"
                    className="field-input"
                    style={{ height: 32, width: '100%' }}
                    autoComplete="off"
                  />
                  {showMemberIdPopup && memberIdSuggestions.length > 0 && (
                    <div style={{ position: 'absolute', top: '100%', left: 0, zIndex: 300,
                      minWidth: 300, background: 'var(--card-bg)', border: '1px solid var(--card-border)',
                      borderRadius: 9, boxShadow: '0 10px 32px rgba(0,0,0,0.18)',
                      maxHeight: 220, overflowY: 'auto', marginTop: 3 }}>
                      <div style={{ padding: '5px 12px', fontSize: 10, fontWeight: 700,
                        color: 'var(--text-3)', borderBottom: '1px solid var(--card-border)',
                        textTransform: 'uppercase', letterSpacing: '0.06em',
                        background: 'var(--page-bg)', borderRadius: '9px 9px 0 0' }}>
                        Matching Members
                      </div>
                      {memberIdSuggestions.map(m => (
                        <button key={m.member_id}
                          onMouseDown={e => { e.preventDefault(); loadMember(m) }}
                          style={{ display: 'flex', width: '100%', padding: '6px 12px', gap: 10,
                            alignItems: 'center', background: 'none', border: 'none',
                            cursor: 'pointer', borderBottom: '1px solid var(--table-border)', textAlign: 'left' }}
                          onMouseEnter={e => e.currentTarget.style.background = 'var(--table-row-hover)'}
                          onMouseLeave={e => e.currentTarget.style.background = 'none'}>
                          <span style={{ fontWeight: 700, fontFamily: 'monospace', color: 'var(--info)', minWidth: 70, fontSize: 12 }}>{m.member_id}</span>
                          <span style={{ fontSize: 13, color: 'var(--text-1)', fontWeight: 500 }}>{m.member_name}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* compact member strip */}
                {selMember && (
                  <div style={{ marginBottom: 8, padding: '6px 10px', borderRadius: 7,
                    background: 'rgba(59,130,246,0.07)', border: '1px solid rgba(59,130,246,0.18)',
                    display: 'flex', alignItems: 'center', gap: 10, minHeight: 30 }}>
                    <span style={{ fontSize: 12, fontFamily: 'monospace', fontWeight: 700, color: 'var(--info)', flexShrink: 0 }}>{form.member_id}</span>
                    <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-1)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{form.member_name}</span>
                    {form.mobile && <span style={{ fontSize: 11, color: 'var(--text-3)', flexShrink: 0 }}>📱 {form.mobile}</span>}
                  </div>
                )}

                <HDivider/>

                {/* RECEIPT DETAILS */}
                <FieldLabel>Receipt Details</FieldLabel>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-2)', marginBottom: 3 }}>Receipt Date</div>
                    <input ref={dateRef} type="date" value={form.receipt_date}
                      onChange={e => { sf('receipt_date')(e.target.value); setDateIsCarryForward(false) }}
                      className={`field-input${dateIsCarryForward ? ' date-carry-forward' : ''}`}
                      style={{ height: 31, width: '100%' }}/>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
                    {selMonths.length > 0 && (
                      <div style={{ padding: '4px 10px', borderRadius: 6, textAlign: 'center',
                        background: 'rgba(37,99,235,0.1)', border: '1px solid rgba(37,99,235,0.2)',
                        fontSize: 11, fontWeight: 700, color: '#1d4ed8' }}>
                        {selMonths.length} month{selMonths.length !== 1 ? 's' : ''} selected
                      </div>
                    )}
                  </div>
                </div>

                {/* Month palette */}
                <div style={{ marginBottom: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                      Months Paid
                    </span>
                    <span style={{ fontSize: 9, color: 'var(--text-3)' }}>
                      {paidMonths.size > 0 ? '— drag to select' : '— click or drag to select'}
                    </span>
                    {selMonths.length > 0 && (
                      <button onClick={() => setSelMonths([])}
                        style={{ marginLeft: 'auto', fontSize: 9, color: 'var(--text-3)', background: 'none',
                          border: 'none', cursor: 'pointer', padding: '0 4px', transition: 'color 0.1s' }}
                        onMouseEnter={e => e.currentTarget.style.color = '#dc2626'}
                        onMouseLeave={e => e.currentTarget.style.color = 'var(--text-3)'}>
                        Clear
                      </button>
                    )}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 3, userSelect: 'none' }}>
                    {FY_MONTHS.map((month, i) => (
                      <MonthTile
                        key={month}
                        label={FY_MON_S[i]}
                        isPaid={paidMonths.has(month)}
                        isSelected={selMonths.includes(month)}
                        onMouseDown={() => onMonthMouseDown(month)}
                        onDragEnter={() => onMonthDragEnter(month)}
                      />
                    ))}
                  </div>
                  {paidMonths.size > 0 && (
                    <div style={{ marginTop: 4, display: 'flex', gap: 10, fontSize: 9, color: 'var(--text-3)' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                        <span style={{ width: 6, height: 6, borderRadius: 1, background: '#16a34a', display: 'inline-block' }}/>
                        Already paid
                      </span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                        <span style={{ width: 6, height: 6, borderRadius: 1, background: '#2563eb', display: 'inline-block' }}/>
                        Selected
                      </span>
                    </div>
                  )}
                </div>

                <HDivider/>

                {/* PAYMENT */}
                <FieldLabel>Payment</FieldLabel>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 6 }}>
                  {MODES.map(m => (
                    <button key={m} onClick={() => sf('payment_mode')(m)}
                      className={`payment-mode-btn${form.payment_mode === m ? ' payment-mode-btn--active' : ''}`}
                      style={{ padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                        border: '1px solid', cursor: 'pointer',
                        background: form.payment_mode === m ? 'var(--sidebar-light)' : 'transparent',
                        borderColor: form.payment_mode === m ? 'var(--sidebar-light)' : 'var(--card-border)',
                        color: form.payment_mode === m ? '#fff' : 'var(--text-2)',
                        boxShadow: form.payment_mode === m
                          ? 'inset 0 1px 0 rgba(255,255,255,0.15), 0 2px 6px rgba(13,34,68,0.3)' : 'none',
                      }}>
                      {m}
                    </button>
                  ))}
                </div>

                {(showChequeFields || showTxnDate) && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 6 }}>
                    {showChequeFields && (
                      <div>
                        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-2)', marginBottom: 3 }}>
                          {form.payment_mode === 'DD' ? 'DD No.' : 'Cheque No.'}
                        </div>
                        <input value={form.cheque_dd_no} onChange={e => sf('cheque_dd_no')(e.target.value)}
                          className="field-input" style={{ height: 31, width: '100%' }} placeholder="Number"/>
                      </div>
                    )}
                    {showTxnDate && (
                      <div>
                        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-2)', marginBottom: 3 }}>Txn Date</div>
                        <input type="date" value={form.transaction_date}
                          onChange={e => sf('transaction_date')(e.target.value)}
                          className="field-input" style={{ height: 31, width: '100%' }}/>
                      </div>
                    )}
                  </div>
                )}

                <div style={{ marginBottom: 8 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-2)', marginBottom: 3 }}>Narration</div>
                  <input value={form.narration} onChange={e => sf('narration')(e.target.value)}
                    className="field-input" style={{ height: 31, width: '100%' }} placeholder="Optional note…"/>
                </div>
              </div>

              {/* ── Right panel — categories ── */}
              <div style={{ overflowY: 'auto', maxHeight: 'calc(95vh - 140px)', display: 'flex', flexDirection: 'column', background: '#f8fafc' }}>
                <div style={{ padding: '9px 16px', borderBottom: '1px solid #e2e8f0',
                  background: '#f8fafc', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--sidebar-light)',
                    textTransform: 'uppercase', letterSpacing: '0.1em' }}>Payment Categories</span>
                  <span style={{ fontSize: 10, color: '#8896a8', marginLeft: 'auto' }}>
                    Click name or enter amount
                  </span>
                  {enabledCount > 0 && (
                    <span style={{ fontSize: 11, fontWeight: 700, background: 'var(--sidebar-light)',
                      color: '#fff', borderRadius: 10, padding: '2px 9px',
                      boxShadow: '0 1px 4px rgba(13,34,68,0.25)' }}>
                      {enabledCount} active
                    </span>
                  )}
                </div>

                <table style={{ width: '100%', borderCollapse: 'collapse', flex: 1, tableLayout: 'fixed' }}>
                  <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
                    <tr style={{ background: '#edf2f7', borderBottom: '2px solid #e2e8f0' }}>
                      <th style={{ width: 36, padding: '6px 8px' }}/>
                      <th style={{ padding: '6px 12px', textAlign: 'left', fontSize: 10, fontWeight: 700,
                        color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Category</th>
                      <th style={{ width: 110, padding: '6px 8px', textAlign: 'right', fontSize: 10,
                        fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Rate / Month ₹</th>
                      <th style={{ width: 64, padding: '6px 6px', textAlign: 'center', fontSize: 10,
                        fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Months</th>
                      <th style={{ width: 90, padding: '6px 12px', textAlign: 'right', fontSize: 10,
                        fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Total ₹</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item, idx) => (
                      <CategoryRow key={item.category_id} item={item} idx={idx} onChange={setItem}/>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* ══ Footer ══ */}
            <div style={{
              background: 'var(--card-header-bg)',
              borderRadius: '0 0 18px 18px', padding: '12px 20px', flexShrink: 0,
              borderTop: '2px solid var(--card-border)',
              display: 'flex', alignItems: 'center', gap: 24,
            }}>
              {/* Grand Total */}
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)',
                  textTransform: 'uppercase', letterSpacing: '0.14em' }}>Grand Total</span>
                <span style={{ fontSize: 30, fontWeight: 900, fontFamily: 'monospace',
                  color: 'var(--text-1)', lineHeight: 1 }}>
                  ₹{grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 0 })}
                </span>
              </div>
              <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
                <button onClick={onClose}
                  style={{ padding: '7px 18px', borderRadius: 8, background: 'transparent',
                    border: '1.5px solid var(--card-border)', color: 'var(--text-2)', fontWeight: 600,
                    fontSize: 13, cursor: 'pointer', transition: 'all 0.15s' }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'var(--page-bg)'; e.currentTarget.style.borderColor = 'var(--text-3)' }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'var(--card-border)' }}>
                  Cancel
                </button>
                <button onClick={save} disabled={saving}
                  className="btn-confirm-payment"
                  style={{ padding: '7px 24px', borderRadius: 8,
                    background: saving ? '#bbf7d0' : 'linear-gradient(135deg, #15803d 0%, #166534 100%)',
                    color: '#fff', border: 'none', fontWeight: 700, fontSize: 13,
                    cursor: saving ? 'not-allowed' : 'pointer',
                    boxShadow: saving ? 'none' : '0 4px 14px rgba(22,163,74,0.35)',
                    display: 'flex', alignItems: 'center', gap: 7,
                    fontFamily: "'Poppins', sans-serif" }}>
                  {saving ? <Loader2 size={14} className="animate-spin"/> : <Save size={14}/>}
                  {saving ? 'Saving…' : 'Confirm Payment'}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ── Month Tile ────────────────────────────────────────────────────

function MonthTile({ label, isPaid, isSelected, onMouseDown, onDragEnter }) {
  const [hov, setHov] = useState(false)
  return (
    <button
      onMouseDown={e => { e.preventDefault(); onMouseDown() }}
      onMouseEnter={() => { setHov(true); onDragEnter() }}
      onMouseLeave={() => setHov(false)}
      disabled={isPaid}
      style={{
        padding: '6px 1px 4px', borderRadius: 6, border: '1.5px solid', textAlign: 'center',
        fontSize: 10, fontWeight: 700, lineHeight: 1.1, cursor: isPaid ? 'default' : 'pointer',
        transition: 'all 0.12s',
        borderColor: isPaid ? '#15803d' : isSelected ? '#2563eb' : hov ? 'var(--input-focus-border)' : 'var(--card-border)',
        background: isPaid
          ? 'linear-gradient(160deg, #4ade80 0%, #16a34a 100%)'
          : isSelected
            ? 'linear-gradient(160deg, #60a5fa 0%, #1d4ed8 100%)'
            : hov ? 'var(--info-subtle)' : 'transparent',
        color: isPaid || isSelected ? '#fff' : hov ? 'var(--info)' : 'var(--text-2)',
        boxShadow: isPaid
          ? 'inset 0 1px 0 rgba(255,255,255,0.25), 0 1px 5px rgba(22,163,74,0.3)'
          : isSelected
            ? 'inset 0 1px 0 rgba(255,255,255,0.25), 0 1px 5px rgba(37,99,235,0.3)'
            : 'none',
        transform: !isPaid && (isSelected || hov) ? 'translateY(-1px) scale(1.05)' : 'none',
      }}
    >
      {label}
      <div style={{ fontSize: 7, marginTop: 1, opacity: isPaid || isSelected ? 0.9 : 0 }}>
        {isPaid ? '✓' : '●'}
      </div>
    </button>
  )
}

// ── Category Row ──────────────────────────────────────────────────

function CategoryRow({ item, idx, onChange }) {
  const [hov, setHov] = useState(false)
  return (
    <tr
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{
        borderBottom: '1px solid var(--table-border)',
        borderLeft: `3px solid ${item.enabled ? 'var(--sidebar-light)' : 'transparent'}`,
        background: item.enabled ? 'rgba(30,58,95,0.05)' : hov ? 'var(--table-row-hover)' : 'transparent',
        transition: 'background 0.1s, border-left-color 0.15s',
      }}
    >
      <td style={{ padding: '4px 8px', textAlign: 'center' }}>
        <button onClick={() => onChange(idx, 'enabled', !item.enabled)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2,
            color: item.enabled ? '#16a34a' : 'var(--text-3)', display: 'flex', alignItems: 'center',
            transition: 'transform 0.1s', transform: item.enabled ? 'scale(1.15)' : 'scale(1)' }}>
          {item.enabled ? <CheckSquare size={14}/> : <Square size={14}/>}
        </button>
      </td>
      <td style={{ padding: '4px 12px' }}>
        <span onClick={() => onChange(idx, 'enabled', !item.enabled)}
          style={{ fontSize: 12, fontWeight: item.enabled ? 600 : 400, cursor: 'pointer',
            color: item.enabled ? 'var(--text-1)' : 'var(--text-2)', transition: 'all 0.1s' }}>
          {item.name}
        </span>
      </td>
      <td style={{ padding: '3px 8px' }}>
        <input type="number" min="0" step="0.01" value={item.amt} disabled={!item.enabled}
          onChange={e => onChange(idx, 'amt', e.target.value)}
          onFocus={() => !item.enabled && onChange(idx, 'enabled', true)}
          className="field-input"
          style={{ textAlign: 'right', padding: '2px 6px', fontSize: 12,
            width: '100%', height: 24, opacity: item.enabled ? 1 : 0.35, transition: 'opacity 0.1s' }}
          placeholder="0"/>
      </td>
      <td style={{ padding: '3px 6px' }}>
        <input type="number" min="1" max="12" step="1" value={item.months} disabled={!item.enabled}
          onChange={e => onChange(idx, 'months', e.target.value)}
          className="field-input"
          style={{ textAlign: 'center', padding: '2px 4px', fontSize: 12,
            width: '100%', height: 24, opacity: item.enabled ? 1 : 0.35, transition: 'opacity 0.1s' }}
          placeholder="1"/>
      </td>
      <td style={{ padding: '4px 12px', textAlign: 'right' }}>
        {item.enabled && item.total > 0 ? (
          <span style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: 700, color: 'var(--text-1)' }}>
            ₹{item.total.toLocaleString('en-IN', { minimumFractionDigits: 0 })}
          </span>
        ) : null}
      </td>
    </tr>
  )
}

// ── Layout helpers ────────────────────────────────────────────────

function FieldLabel({ children }) {
  return (
    <div style={{ fontSize: 10, fontWeight: 700, color: '#fff',
      background: 'var(--sidebar-light)', borderRadius: 4, padding: '3px 8px',
      textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 7,
      display: 'inline-block' }}>
      {children}
    </div>
  )
}

function HDivider() {
  return (
    <div style={{ height: 1, margin: '10px 0',
      background: 'linear-gradient(90deg, var(--sidebar-light) 0%, rgba(30,74,138,0.12) 60%, transparent 100%)' }}/>
  )
}
