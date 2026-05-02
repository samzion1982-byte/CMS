/* ═══════════════════════════════════════════════════════════════
   ReceiptsPage.jsx — Receipt entry with modal form + Excel import
   ═══════════════════════════════════════════════════════════════ */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { supabase }             from '../lib/supabase'
import { useAuth }              from '../lib/AuthContext'
import { useToast }             from '../lib/toast'
import { getActiveCategories }  from '../lib/paymentCategories'
import {
  Plus, Search, X, Loader2, Save, Edit2, Trash2,
  IndianRupee, Upload, CheckSquare, Square,
} from 'lucide-react'
import * as XLSX from 'xlsx'

// ── helpers ─────────────────────────────────────────────────────

function getFY(dateStr) {
  const d = dateStr ? new Date(dateStr + 'T00:00:00') : new Date()
  const m = d.getMonth() + 1
  const y = d.getFullYear()
  return m >= 4 ? `${y}-${String(y + 1).slice(2)}` : `${y - 1}-${String(y).slice(2)}`
}

async function nextReceiptNumber(fy) {
  const prefix = fy + '_'
  const { data } = await supabase
    .from('receipts')
    .select('receipt_number')
    .like('receipt_number', `${prefix}%`)
    .order('receipt_number', { ascending: false })
    .limit(1)
  if (!data?.length) return prefix + '000001'
  const seq = parseInt(data[0].receipt_number.replace(prefix, ''), 10) || 0
  return prefix + String(seq + 1).padStart(6, '0')
}

function fmtDate(s) {
  if (!s) return '—'
  const [y, m, d] = s.split('-')
  return `${d}/${m}/${y}`
}

function parseDateDMY(s) {
  if (!s) return ''
  const str = String(s).trim()
  const m1 = str.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/)
  if (m1) return `${m1[3]}-${m1[2].padStart(2,'0')}-${m1[1].padStart(2,'0')}`
  const m2 = str.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (m2) return str
  if (/^\d+$/.test(str)) {
    const d = new Date((parseInt(str) - 25569) * 86400 * 1000)
    if (!isNaN(d)) return d.toISOString().slice(0, 10)
  }
  return ''
}

function normalize(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '')
}

const MODES     = ['Cash', 'Cheque', 'DD', 'Net Banking', 'UPI']
const FY_MONTHS = ['April','May','June','July','August','September','October','November','December','January','February','March']
const FY_MON_S  = ['Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec','Jan','Feb','Mar']

function fyOptions() {
  const seen = new Set(), opts = []
  for (let d = -3; d <= 1; d++) {
    const y = new Date().getFullYear() + d
    const m = new Date().getMonth() + 1
    const fy = m >= 4 ? `${y}-${String(y + 1).slice(2)}` : `${y - 1}-${String(y).slice(2)}`
    if (!seen.has(fy)) { seen.add(fy); opts.push(fy) }
  }
  return opts.sort()
}

// ════════════════════════════════════════════════════════
//  LIST PAGE
// ════════════════════════════════════════════════════════

export default function ReceiptsPage() {
  const { profile } = useAuth()
  const toast       = useToast()

  const [categories,   setCategories]  = useState([])
  const [catsLoading,  setCatsLoading] = useState(true)
  const [receipts,     setReceipts]    = useState([])
  const [listLoading,  setListLoading] = useState(false)
  const [filterFY,     setFilterFY]    = useState(() => getFY())
  const [listSearch,   setListSearch]  = useState('')
  const [fyStats,      setFyStats]     = useState({})
  const [showModal,    setShowModal]   = useState(false)
  const [editId,       setEditId]      = useState(null)
  const [importing,    setImporting]   = useState(false)
  const importRef = useRef(null)

  const availableFYs = useMemo(() => {
    const all = new Set([...Object.keys(fyStats), ...fyOptions()])
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

  const loadFyStats = useCallback(async () => {
    const { data } = await supabase.from('receipts').select('financial_year')
    const counts = {}
    ;(data || []).forEach(r => { counts[r.financial_year] = (counts[r.financial_year] || 0) + 1 })
    setFyStats(counts)
  }, [])
  useEffect(() => { loadFyStats() }, [loadFyStats])

  const loadList = useCallback(async () => {
    setListLoading(true)
    try {
      let q = supabase
        .from('receipts')
        .select('id,receipt_number,receipt_date,member_id,member_name,payment_mode,month_paid,grand_total')
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

  const openNew = useCallback(() => {
    if (catsLoading) { toast('Loading categories…', 'info'); return }
    setEditId(null); setShowModal(true)
  }, [catsLoading, toast])

  const openEdit = (row) => { setEditId(row.id); setShowModal(true) }

  const del = async (row) => {
    if (!window.confirm(`Delete receipt ${row.receipt_number}?`)) return
    await supabase.from('receipt_items').delete().eq('receipt_id', row.id)
    const { error } = await supabase.from('receipts').delete().eq('id', row.id)
    if (error) { toast(error.message, 'error'); return }
    toast('Receipt deleted', 'success')
    loadList(); loadFyStats()
  }

  // ── Excel import ─────────────────────────────────────────────
  const handleImport = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setImporting(true)
    try {
      const buf  = await file.arrayBuffer()
      const wb   = XLSX.read(buf, { type: 'array', cellDates: true })
      const cats = categories.length ? categories : await getActiveCategories()

      let imported = 0, skipped = 0, errors = 0

      for (const sheetName of wb.SheetNames) {
        if (!/^\d{4}-\d{2}$/.test(sheetName)) continue
        const ws   = wb.Sheets[sheetName]
        const rows = XLSX.utils.sheet_to_json(ws, { defval: '', raw: false })
        if (!rows.length) continue

        const headers = Object.keys(rows[0])
        const catCols = {}
        for (const cat of cats) {
          const norm = normalize(cat.name)
          const matching = headers.filter(h => normalize(h).startsWith(norm) || normalize(h).includes(norm))
          if (matching.length >= 1) catCols[cat.id] = matching.slice(0, 3)
        }

        const col = (patterns) => headers.find(h => patterns.some(p => normalize(h).includes(normalize(p)))) || ''

        const rcptNoCol    = col(['receipt_number','receiptno','r.no','rno','receiptnum'])
        const dateCol      = col(['receipt_date','receiptdate','date'])
        const modeCol      = col(['payment_mode','paymentmode','mode'])
        const chequeNoCol  = col(['cheque_dd_no','chequeno','ddno','chequedd','chq'])
        const txnDateCol   = col(['transaction_date','cheque_dd_date','txndate','chequedate'])
        const narrationCol = col(['narration','remark','note'])
        const memberIdCol  = col(['member_id','memberid','member_no','memberno','membernum'])
        const memberNmCol  = col(['member_name','membername'])
        const addrCol      = col(['address','addr'])
        const addr1Col     = col(['address1','addr1','area1'])
        const addr2Col     = col(['address2','addr2','area2'])
        const cityCol      = col(['city'])
        const mobileCol    = col(['mobile'])
        const waCol        = col(['whatsapp','wa'])
        const monthCol     = col(['cmbmonth','month_paid','monthpaid','month'])
        const grandTotCol  = col(['grandtotal','grand_total','total'])

        for (const row of rows) {
          const rcptNo = String(row[rcptNoCol] || '').trim()
          if (!rcptNo) { skipped++; continue }
          const fy = sheetName
          const { data: ex } = await supabase.from('receipts').select('id').eq('receipt_number', rcptNo).limit(1)
          if (ex?.length) { skipped++; continue }

          const rcptDate = dateCol ? parseDateDMY(row[dateCol]) : ''
          const grandTot = parseFloat(String(row[grandTotCol] || '').replace(/[^0-9.]/g,'')) || 0

          const recData = {
            receipt_number:   rcptNo,
            receipt_date:     rcptDate || null,
            financial_year:   fy,
            payment_mode:     row[modeCol]    || 'Cash',
            cheque_dd_no:     row[chequeNoCol] ? String(row[chequeNoCol]).trim() : null,
            transaction_date: txnDateCol ? parseDateDMY(row[txnDateCol]) || null : null,
            narration:        row[narrationCol] ? String(row[narrationCol]).trim() : null,
            member_id:        memberIdCol ? String(row[memberIdCol] || '').trim() : '',
            member_name:      memberNmCol ? String(row[memberNmCol] || '').trim() : '',
            address:          addrCol  ? String(row[addrCol]  || '').trim() : null,
            address1:         addr1Col ? String(row[addr1Col] || '').trim() : null,
            address2:         addr2Col ? String(row[addr2Col] || '').trim() : null,
            city:             cityCol  ? String(row[cityCol]  || '').trim() : null,
            mobile:           mobileCol ? String(row[mobileCol] || '').trim() : null,
            whatsapp:         waCol ? String(row[waCol] || '').trim() : null,
            month_paid:       monthCol ? String(row[monthCol] || '').trim() : null,
            grand_total:      grandTot,
            created_by:       profile?.full_name || profile?.email || 'Import',
          }

          try {
            const { data: ins, error: recErr } = await supabase.from('receipts').insert(recData).select('id').single()
            if (recErr) throw recErr
            const itemRows = []
            for (const cat of cats) {
              const cols = catCols[cat.id]
              if (!cols?.length) continue
              const amt    = parseFloat(String(row[cols[0]] || '').replace(/[^0-9.]/g,'')) || 0
              const months = parseFloat(String(row[cols[1]] || '').replace(/[^0-9.]/g,'')) || 1
              const total  = parseFloat(String(row[cols[2]] || '').replace(/[^0-9.]/g,'')) || (amt * months)
              if (amt > 0) itemRows.push({ receipt_id: ins.id, category_id: cat.id, amt, months, total })
            }
            if (itemRows.length) await supabase.from('receipt_items').insert(itemRows)
            imported++
          } catch { errors++ }
        }
      }

      toast(`Import complete — ${imported} receipts imported, ${skipped} skipped, ${errors > 0 ? `${errors} errors` : 'no errors'}`, imported > 0 ? 'success' : 'error')
      loadList(); loadFyStats()
    } catch (e) {
      toast(`Import failed: ${e.message}`, 'error')
    }
    setImporting(false)
  }

  // ── render ────────────────────────────────────────────────────
  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Receipt Entry</h1>
          <p className="page-subtitle">Record member payments across all categories</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input ref={importRef} type="file" accept=".xlsx,.xls" style={{ display: 'none' }} onChange={handleImport}/>
          <button onClick={() => importRef.current?.click()} disabled={importing || catsLoading}
            className="action-btn" style={{ background: '#0369a1', opacity: importing ? 0.6 : 1 }}>
            {importing ? <Loader2 size={13} className="animate-spin"/> : <Upload size={13}/>}
            {importing ? 'Importing…' : 'Import Excel'}
          </button>
          <button className="action-btn" onClick={openNew} disabled={catsLoading}
            style={{ background: 'var(--sidebar-bg)' }} title="New receipt">
            {catsLoading ? <Loader2 size={13} className="animate-spin"/> : <Plus size={13}/>}
            New Receipt
          </button>
        </div>
      </div>

      {availableFYs.length > 0 && (
        <div className="card" style={{ padding: 0, display: 'flex', overflow: 'hidden', marginBottom: 16 }}>
          {availableFYs.map((fy, i, arr) => {
            const count  = fyStats[fy] || 0
            const active = filterFY === fy
            return (
              <div key={fy} onClick={() => setFilterFY(fy)}
                style={{ flex: 1, minWidth: 0, padding: '14px 22px', cursor: 'pointer',
                  borderRight: i < arr.length - 1 ? '1px solid var(--card-border)' : 'none',
                  background: active ? 'var(--sidebar-bg)' : 'transparent',
                  transition: 'background 0.15s' }}>
                <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.09em',
                  color: active ? 'rgba(255,255,255,0.6)' : 'var(--text-3)', marginBottom: 4 }}>
                  FY {fy}
                </div>
                <div style={{ fontSize: 36, fontWeight: 800,
                  color: active ? '#fff' : 'var(--text-1)',
                  fontVariantNumeric: 'tabular-nums', lineHeight: 1.1 }}>
                  {count}
                </div>
                <div style={{ fontSize: 11, color: active ? 'rgba(255,255,255,0.5)' : 'var(--text-3)', marginTop: 4 }}>
                  receipt{count !== 1 ? 's' : ''}
                </div>
              </div>
            )
          })}
        </div>
      )}

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
                  <th key={h} style={{ padding: '10px 14px',
                    textAlign: h === 'Amount' ? 'right' : 'left',
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

      {showModal && (
        <ReceiptModal
          editId={editId}
          initialFY={filterFY}
          categories={categories}
          profile={profile}
          toast={toast}
          onClose={() => setShowModal(false)}
          onSaved={() => { setShowModal(false); loadList(); loadFyStats() }}
        />
      )}
    </div>
  )
}

// ════════════════════════════════════════════════════════
//  RECEIPT MODAL
// ════════════════════════════════════════════════════════

function ReceiptModal({ editId, initialFY, categories, profile, toast, onClose, onSaved }) {
  const today = new Date().toISOString().slice(0, 10)

  const [form, setForm] = useState({
    receipt_number: '', receipt_date: today,
    financial_year: initialFY || getFY(),
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

  const sf = k => v => setForm(f => ({ ...f, [k]: v }))

  const loadPaidMonths = useCallback(async (mId, fy, excludeId = null) => {
    let q = supabase.from('receipts').select('month_paid')
      .eq('member_id', mId).eq('financial_year', fy)
      .not('month_paid', 'is', null)
    if (excludeId) q = q.neq('id', excludeId)
    const { data } = await q
    const paid = new Set()
    ;(data || []).forEach(r => {
      r.month_paid?.split(',').forEach(m => { const t = m.trim(); if (t) paid.add(t) })
    })
    setPaidMonths(paid)
  }, [])

  const toggleMonth = (month) => {
    if (paidMonths.has(month)) return
    setSelMonths(prev => prev.includes(month) ? prev.filter(m => m !== month) : [...prev, month])
  }

  // init items from categories
  useEffect(() => {
    if (!categories.length) return
    setItems(categories.map(c => ({ category_id: c.id, name: c.name, enabled: false, amt: '', months: '1', total: 0 })))
  }, [categories])

  // auto receipt number for new
  useEffect(() => {
    if (editId || !form.financial_year) return
    nextReceiptNumber(form.financial_year).then(n => setForm(f => ({ ...f, receipt_number: n })))
  }, [editId, form.financial_year])

  // sync selMonths → form.month_paid + category months count (new receipts only)
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

  // load existing receipt when editing
  useEffect(() => {
    if (!editId) return
    setLoading(true)
    Promise.all([
      supabase.from('receipts').select('*').eq('id', editId).single(),
      supabase.from('receipt_items').select('*').eq('receipt_id', editId),
    ]).then(async ([{ data: rec }, { data: recItems }]) => {
      if (!rec) return
      setForm({
        receipt_number:   rec.receipt_number   || '',
        receipt_date:     rec.receipt_date      || '',
        financial_year:   rec.financial_year    || '',
        month_paid:       rec.month_paid        || '',
        payment_mode:     rec.payment_mode      || 'Cash',
        cheque_dd_no:     rec.cheque_dd_no      || '',
        transaction_date: rec.transaction_date  || '',
        narration:        rec.narration         || '',
        member_id:        rec.member_id         || '',
        member_name:      rec.member_name       || '',
        address:          rec.address           || '',
        address1:         rec.address1          || '',
        address2:         rec.address2          || '',
        city:             rec.city              || '',
        mobile:           rec.mobile            || '',
        whatsapp:         rec.whatsapp          || '',
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
      if (rec.member_id && rec.financial_year) {
        await loadPaidMonths(rec.member_id, rec.financial_year, editId)
      }
    }).finally(() => setLoading(false))
  }, [editId, categories, loadPaidMonths])

  // autofocus member ID after load
  useEffect(() => {
    if (loading) return
    setTimeout(() => memberIdRef.current?.focus(), 80)
  }, [loading])

  // recalc FY when receipt date changes
  useEffect(() => {
    if (!form.receipt_date) return
    const newFY = getFY(form.receipt_date)
    if (newFY !== form.financial_year) {
      setForm(f => ({ ...f, financial_year: newFY }))
      if (selMember?.member_id) loadPaidMonths(selMember.member_id, newFY)
    }
  }, [form.receipt_date]) // eslint-disable-line react-hooks/exhaustive-deps

  // member ID prefix suggestions
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
      member_id:   m.member_id,
      member_name: m.member_name,
      address:     m.address_street || '',
      address1:    m.area_1         || '',
      address2:    m.area_2         || '',
      city:        m.city           || '',
      mobile:      m.mobile         || '',
      whatsapp:    m.whatsapp       || '',
    }))
    const fy = form.financial_year
    await loadPaidMonths(m.member_id, fy)
    // pre-fill amounts from last receipt in same FY
    const { data: prev } = await supabase.from('receipts')
      .select('id').eq('member_id', m.member_id).eq('financial_year', fy)
      .order('receipt_number', { ascending: false }).limit(1)
    if (prev?.length) {
      const { data: prevItems } = await supabase.from('receipt_items').select('*').eq('receipt_id', prev[0].id)
      if (prevItems?.length) {
        const map = {}
        prevItems.forEach(i => { map[i.category_id] = i })
        setItems(curr => curr.map(item => {
          const li = map[item.category_id]
          if (!li) return item
          const amt    = String(li.amt    || '')
          const months = String(li.months || '1')
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

  const grandTotal = items.filter(i => i.enabled).reduce((s, i) => s + (i.total || 0), 0)

  const save = async () => {
    if (!selMember?.member_id && !form.member_id) { toast('Please select a member', 'error'); return }
    if (!form.receipt_date)                         { toast('Enter receipt date', 'error');    return }
    const enabled = items.filter(i => i.enabled && (parseFloat(i.amt) || 0) > 0)
    if (!enabled.length) { toast('Enable at least one category with an amount', 'error'); return }

    setSaving(true)
    try {
      const recData = {
        receipt_number:   form.receipt_number,
        receipt_date:     form.receipt_date,
        financial_year:   form.financial_year,
        month_paid:       form.month_paid       || null,
        payment_mode:     form.payment_mode,
        cheque_dd_no:     form.cheque_dd_no     || null,
        transaction_date: form.transaction_date || null,
        narration:        form.narration        || null,
        member_id:        form.member_id,
        member_name:      form.member_name,
        address:          form.address          || null,
        address1:         form.address1         || null,
        address2:         form.address2         || null,
        city:             form.city             || null,
        mobile:           form.mobile           || null,
        whatsapp:         form.whatsapp         || null,
        grand_total:      grandTotal,
        created_by:       profile?.full_name || profile?.email,
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
        receipt_id:  receiptId,
        category_id: i.category_id,
        amt:         parseFloat(i.amt)    || 0,
        months:      parseFloat(i.months) || 0,
        total:       i.total,
      }))
      const { error: iErr } = await supabase.from('receipt_items').insert(itemRows)
      if (iErr) throw iErr
      toast(editId ? 'Receipt updated' : `Receipt ${form.receipt_number} saved`, 'success')
      onSaved()
    } catch (e) { toast(e.message, 'error') }
    setSaving(false)
  }

  const showChequeFields = ['Cheque', 'DD'].includes(form.payment_mode)
  const showTxnDate      = ['Cheque', 'DD', 'Net Banking'].includes(form.payment_mode)
  const enabledCount     = items.filter(i => i.enabled).length

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'var(--overlay)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 9999, padding: 12 }}>
      <div style={{
        background: 'var(--card-bg)', borderRadius: 14, width: '100%',
        maxWidth: 1280, maxHeight: '96vh', display: 'flex', flexDirection: 'column',
        boxShadow: '0 32px 80px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.06)',
      }}>

        {/* ══ 3D Header ══ */}
        <div style={{
          background: 'linear-gradient(145deg, #2a5298 0%, #1e3a5f 45%, #0d1f40 100%)',
          borderRadius: '14px 14px 0 0', padding: '14px 22px', flexShrink: 0,
          position: 'relative', overflow: 'hidden',
          boxShadow: 'inset 0 1.5px 0 rgba(255,255,255,0.28), inset 0 -3px 0 rgba(0,0,0,0.35), 0 6px 24px rgba(0,0,0,0.4)',
        }}>
          {/* Diagonal gloss */}
          <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', borderRadius: '14px 14px 0 0',
            background: 'linear-gradient(130deg, rgba(255,255,255,0.20) 0%, rgba(255,255,255,0.06) 38%, transparent 55%)' }}/>
          {/* Left specular edge */}
          <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 2, pointerEvents: 'none',
            background: 'linear-gradient(180deg, rgba(255,255,255,0.5) 0%, rgba(255,255,255,0.08) 100%)',
            borderRadius: '14px 0 0 0' }}/>
          {/* Top edge highlight */}
          <div style={{ position: 'absolute', left: 0, top: 0, right: 0, height: 1, pointerEvents: 'none',
            background: 'rgba(255,255,255,0.32)', borderRadius: '14px 14px 0 0' }}/>
          {/* Subtle dot grid texture */}
          <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', opacity: 0.06,
            backgroundImage: 'radial-gradient(circle, #fff 1px, transparent 1px)',
            backgroundSize: '20px 20px' }}/>

          <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
            {/* Left: icon + title */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{
                width: 42, height: 42, borderRadius: 11, flexShrink: 0,
                background: 'linear-gradient(145deg, rgba(255,255,255,0.22) 0%, rgba(255,255,255,0.08) 100%)',
                border: '1px solid rgba(255,255,255,0.28)',
                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.25), 0 3px 10px rgba(0,0,0,0.25)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <IndianRupee size={20} style={{ color: '#fff', filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.3))' }}/>
              </div>
              <div>
                <h2 style={{ color: '#fff', fontSize: 17, fontWeight: 800, margin: 0,
                  textShadow: '0 1px 6px rgba(0,0,0,0.5)', letterSpacing: '-0.01em' }}>
                  {editId ? 'Edit Receipt' : 'New Receipt'}
                </h2>
                {form.receipt_number && (
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginTop: 2,
                    fontFamily: 'monospace', letterSpacing: '0.05em' }}>
                    {form.receipt_number}
                  </div>
                )}
              </div>
            </div>

            {/* Right: FY badge + close */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{
                background: 'linear-gradient(145deg, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0.07) 100%)',
                border: '1px solid rgba(255,255,255,0.26)', borderRadius: 9, padding: '6px 14px',
                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.15), 0 2px 8px rgba(0,0,0,0.2)',
              }}>
                <div style={{ fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,0.45)',
                  textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 2 }}>
                  Financial Year
                </div>
                <div style={{ fontSize: 14, fontWeight: 800, color: '#fff', letterSpacing: '0.04em',
                  textShadow: '0 1px 3px rgba(0,0,0,0.3)' }}>
                  {form.financial_year}
                </div>
              </div>
              <button onClick={onClose} tabIndex={-1}
                style={{ background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.22)',
                  borderRadius: 9, padding: '8px 11px', cursor: 'pointer', color: '#fff',
                  display: 'flex', alignItems: 'center',
                  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.15), 0 2px 6px rgba(0,0,0,0.2)',
                  transition: 'all 0.15s' }}
                onMouseEnter={e => {
                  e.currentTarget.style.background = 'rgba(239,68,68,0.8)'
                  e.currentTarget.style.borderColor = 'rgba(220,38,38,0.7)'
                  e.currentTarget.style.transform   = 'scale(1.06)'
                  e.currentTarget.style.boxShadow   = '0 3px 10px rgba(239,68,68,0.4)'
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.background = 'rgba(255,255,255,0.12)'
                  e.currentTarget.style.borderColor = 'rgba(255,255,255,0.22)'
                  e.currentTarget.style.transform   = 'scale(1)'
                  e.currentTarget.style.boxShadow   = 'inset 0 1px 0 rgba(255,255,255,0.15), 0 2px 6px rgba(0,0,0,0.2)'
                }}>
                <X size={16}/>
              </button>
            </div>
          </div>
        </div>

        {/* ══ Body ══ */}
        {loading ? (
          <div style={{ padding: 60, textAlign: 'center' }}>
            <Loader2 size={28} className="animate-spin" style={{ color: 'var(--text-3)', margin: '0 auto' }}/>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '400px 1fr', flex: 1, minHeight: 0, overflow: 'hidden' }}>

            {/* ── Left panel ── */}
            <div style={{ borderRight: '1px solid var(--card-border)', overflowY: 'auto',
              padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>

              {/* ─ Member ─ */}
              <div>
                <SectionLabel>Member</SectionLabel>
                <Row label="Member ID">
                  <div style={{ position: 'relative' }}>
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
                      placeholder="Type ID + Tab to lookup"
                      className="field-input"
                      style={{ height: 34 }}
                      autoComplete="off"
                    />
                    {showMemberIdPopup && memberIdSuggestions.length > 0 && (
                      <div style={{ position: 'absolute', top: '100%', left: 0, zIndex: 300,
                        minWidth: 300, background: 'var(--card-bg)', border: '1px solid var(--card-border)',
                        borderRadius: 9, boxShadow: '0 10px 32px rgba(0,0,0,0.18)',
                        maxHeight: 220, overflowY: 'auto', marginTop: 4 }}>
                        <div style={{ padding: '6px 12px', fontSize: 10, fontWeight: 700,
                          color: 'var(--text-3)', borderBottom: '1px solid var(--card-border)',
                          textTransform: 'uppercase', letterSpacing: '0.06em',
                          background: 'var(--page-bg)', borderRadius: '9px 9px 0 0' }}>
                          Matching Members
                        </div>
                        {memberIdSuggestions.map(m => (
                          <button key={m.member_id}
                            onMouseDown={e => { e.preventDefault(); loadMember(m) }}
                            style={{ display: 'flex', width: '100%', padding: '7px 12px', gap: 10,
                              alignItems: 'center', background: 'none', border: 'none',
                              cursor: 'pointer', borderBottom: '1px solid var(--table-border)', textAlign: 'left' }}
                            onMouseEnter={e => e.currentTarget.style.background = 'var(--table-row-hover)'}
                            onMouseLeave={e => e.currentTarget.style.background = 'none'}>
                            <span style={{ fontWeight: 700, fontFamily: 'monospace', color: 'var(--info)', minWidth: 72, fontSize: 12 }}>{m.member_id}</span>
                            <span style={{ fontSize: 13, color: 'var(--text-1)', fontWeight: 500 }}>{m.member_name}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </Row>

                {selMember && (
                  <div style={{ marginTop: 10, padding: '12px 14px', borderRadius: 9,
                    background: 'linear-gradient(135deg, rgba(59,130,246,0.08) 0%, rgba(30,58,95,0.06) 100%)',
                    border: '1px solid rgba(59,130,246,0.2)',
                    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.5)' }}>
                    <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-1)' }}>{form.member_name}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2, fontFamily: 'monospace' }}>{form.member_id}</div>
                    {(form.mobile || form.whatsapp) && (
                      <div style={{ display: 'flex', gap: 16, marginTop: 8 }}>
                        {form.mobile   && <span style={{ fontSize: 12, color: 'var(--text-2)' }}>📱 {form.mobile}</span>}
                        {form.whatsapp && <span style={{ fontSize: 12, color: 'var(--text-2)' }}>💬 {form.whatsapp}</span>}
                      </div>
                    )}
                    {(form.address || form.address1 || form.city) && (
                      <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 6 }}>
                        📍 {[form.address, form.address1, form.address2, form.city].filter(Boolean).join(', ')}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <Divider/>

              {/* ─ Receipt Details ─ */}
              <div>
                <SectionLabel>Receipt Details</SectionLabel>
                <Row label="Receipt Date">
                  <input ref={dateRef} type="date" value={form.receipt_date}
                    onChange={e => sf('receipt_date')(e.target.value)}
                    className="field-input" style={{ height: 34, maxWidth: 200 }}/>
                </Row>

                {/* Month Palette */}
                <div style={{ marginTop: 14 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 9 }}>
                    <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-2)' }}>Months Paid</span>
                    {selMonths.length > 0 && (
                      <span style={{
                        background: 'linear-gradient(135deg, #2563eb, var(--sidebar-bg))',
                        color: '#fff', borderRadius: 10, padding: '2px 9px',
                        fontSize: 10, fontWeight: 700,
                        boxShadow: '0 1px 6px rgba(30,58,95,0.35)',
                      }}>
                        {selMonths.length} month{selMonths.length !== 1 ? 's' : ''}
                      </span>
                    )}
                    {selMonths.length > 0 && (
                      <button onClick={() => setSelMonths([])}
                        style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--text-3)',
                          background: 'none', border: 'none', cursor: 'pointer', padding: '1px 6px',
                          borderRadius: 4, transition: 'color 0.12s' }}
                        onMouseEnter={e => e.currentTarget.style.color = '#dc2626'}
                        onMouseLeave={e => e.currentTarget.style.color = 'var(--text-3)'}>
                        Clear
                      </button>
                    )}
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 5 }}>
                    {FY_MONTHS.map((month, i) => (
                      <MonthTile
                        key={month}
                        label={FY_MON_S[i]}
                        isPaid={paidMonths.has(month)}
                        isSelected={selMonths.includes(month)}
                        onClick={() => toggleMonth(month)}
                      />
                    ))}
                  </div>

                  {paidMonths.size > 0 && (
                    <div style={{ marginTop: 7, display: 'flex', gap: 12, fontSize: 10, color: 'var(--text-3)' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <span style={{ width: 8, height: 8, borderRadius: 2, background: '#16a34a', display: 'inline-block' }}/>
                        Already paid
                      </span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <span style={{ width: 8, height: 8, borderRadius: 2, background: '#2563eb', display: 'inline-block' }}/>
                        Selected
                      </span>
                    </div>
                  )}
                </div>
              </div>

              <Divider/>

              {/* ─ Payment ─ */}
              <div>
                <SectionLabel>Payment</SectionLabel>
                <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                  {MODES.map(m => (
                    <button key={m} onClick={() => sf('payment_mode')(m)}
                      style={{ padding: '5px 13px', borderRadius: 7, fontSize: 12, fontWeight: 600,
                        border: '1px solid', cursor: 'pointer', transition: 'all 0.12s',
                        background: form.payment_mode === m
                          ? 'linear-gradient(135deg, #2563eb 0%, #0f2550 100%)'
                          : 'transparent',
                        borderColor: form.payment_mode === m ? '#2563eb' : 'var(--card-border)',
                        color: form.payment_mode === m ? '#fff' : 'var(--text-2)',
                        boxShadow: form.payment_mode === m
                          ? 'inset 0 1px 0 rgba(255,255,255,0.2), 0 2px 8px rgba(37,99,235,0.35)'
                          : 'none',
                      }}>
                      {m}
                    </button>
                  ))}
                </div>

                {showChequeFields && (
                  <Row label={form.payment_mode === 'DD' ? 'DD Number' : 'Cheque Number'} style={{ marginTop: 10 }}>
                    <input value={form.cheque_dd_no} onChange={e => sf('cheque_dd_no')(e.target.value)}
                      className="field-input" style={{ height: 34 }} placeholder="Enter number"/>
                  </Row>
                )}
                {showTxnDate && (
                  <Row label="Transaction Date" style={{ marginTop: 8 }}>
                    <input type="date" value={form.transaction_date}
                      onChange={e => sf('transaction_date')(e.target.value)}
                      className="field-input" style={{ height: 34 }}/>
                  </Row>
                )}
                <Row label="Narration" style={{ marginTop: 8 }}>
                  <input value={form.narration} onChange={e => sf('narration')(e.target.value)}
                    className="field-input" style={{ height: 34 }} placeholder="Optional note…"/>
                </Row>
              </div>

              {/* ─ Grand Total + Save ─ */}
              <div style={{ marginTop: 'auto', paddingTop: 16 }}>
                {/* Category summary */}
                {items.filter(i => i.enabled && i.total > 0).length > 0 && (
                  <div style={{ marginBottom: 14, padding: '10px 14px', borderRadius: 9,
                    background: 'var(--page-bg)', border: '1px solid var(--card-border)',
                    display: 'flex', flexDirection: 'column', gap: 5 }}>
                    {items.filter(i => i.enabled && i.total > 0).map(item => (
                      <div key={item.category_id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                        <span style={{ color: 'var(--text-2)' }}>{item.name}</span>
                        <span style={{ fontFamily: 'monospace', fontWeight: 600, color: 'var(--text-1)' }}>
                          ₹{item.total.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Grand total card */}
                <div style={{
                  borderRadius: 11, marginBottom: 12, overflow: 'hidden',
                  background: 'linear-gradient(140deg, #2a5298 0%, #1e3a5f 55%, #0d1f40 100%)',
                  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.2), 0 6px 20px rgba(30,58,95,0.4)',
                  position: 'relative',
                }}>
                  <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none',
                    background: 'linear-gradient(130deg, rgba(255,255,255,0.12) 0%, transparent 45%)',
                    borderRadius: 11 }}/>
                  <div style={{ position: 'relative', padding: '14px 18px' }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.45)',
                      textTransform: 'uppercase', letterSpacing: '0.14em', marginBottom: 4 }}>
                      Grand Total
                    </div>
                    <div style={{ fontSize: 30, fontWeight: 900, fontFamily: 'monospace', color: '#fff',
                      textShadow: '0 2px 8px rgba(0,0,0,0.35)', letterSpacing: '-0.01em' }}>
                      ₹{grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </div>
                  </div>
                </div>

                <button onClick={save} disabled={saving}
                  style={{ width: '100%', padding: '11px 0', borderRadius: 9,
                    background: saving
                      ? 'var(--text-3)'
                      : 'linear-gradient(135deg, #22c55e 0%, #15803d 100%)',
                    color: '#fff', border: 'none', fontWeight: 700, fontSize: 14,
                    cursor: saving ? 'not-allowed' : 'pointer',
                    boxShadow: saving ? 'none' : 'inset 0 1px 0 rgba(255,255,255,0.22), 0 4px 14px rgba(22,163,74,0.4)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    transition: 'all 0.15s', fontFamily: 'var(--font-ui)',
                  }}
                  onMouseEnter={e => { if (!saving) e.currentTarget.style.filter = 'brightness(1.08)' }}
                  onMouseLeave={e => { e.currentTarget.style.filter = 'none' }}>
                  {saving ? <Loader2 size={15} className="animate-spin"/> : <Save size={15}/>}
                  {saving ? 'Saving…' : 'Save Receipt'}
                </button>
              </div>
            </div>

            {/* ── Right panel — categories ── */}
            <div style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
              <div style={{ padding: '10px 20px', borderBottom: '1px solid var(--card-border)',
                background: 'var(--table-header-bg)', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)',
                  textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                  Payment Categories
                </span>
                <span style={{ fontSize: 11, color: 'var(--text-3)', marginLeft: 'auto' }}>
                  Click name or enter amount to include
                </span>
                {enabledCount > 0 && (
                  <span style={{ fontSize: 11, fontWeight: 700,
                    background: 'linear-gradient(135deg, #2563eb, var(--sidebar-bg))',
                    color: '#fff', borderRadius: 10, padding: '2px 9px',
                    boxShadow: '0 1px 4px rgba(30,58,95,0.3)' }}>
                    {enabledCount} active
                  </span>
                )}
              </div>

              <table style={{ width: '100%', borderCollapse: 'collapse', flex: 1 }}>
                <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
                  <tr style={{ background: 'var(--table-header-bg)', borderBottom: '2px solid var(--table-border)' }}>
                    <th style={{ width: 42, padding: '9px 10px' }}/>
                    <th style={{ padding: '9px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700,
                      color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Category</th>
                    <th style={{ width: 130, padding: '9px 12px', textAlign: 'right', fontSize: 11,
                      fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Rate / Month ₹</th>
                    <th style={{ width: 85, padding: '9px 10px', textAlign: 'center', fontSize: 11,
                      fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Months</th>
                    <th style={{ width: 140, padding: '9px 18px', textAlign: 'right', fontSize: 11,
                      fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Total ₹</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, idx) => (
                    <CategoryRow key={item.category_id} item={item} idx={idx} onChange={setItem}/>
                  ))}
                </tbody>
              </table>

              {grandTotal > 0 && (
                <div style={{ padding: '13px 18px', borderTop: '2px solid var(--card-border)',
                  display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 18,
                  background: 'var(--table-header-bg)', flexShrink: 0 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)',
                    textTransform: 'uppercase', letterSpacing: '0.07em' }}>Grand Total</span>
                  <span style={{ fontSize: 20, fontWeight: 800, fontFamily: 'monospace', color: 'var(--sidebar-bg)' }}>
                    ₹{grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Month Tile ────────────────────────────────────────────────────

function MonthTile({ label, isPaid, isSelected, onClick }) {
  const [hov, setHov] = useState(false)
  return (
    <button
      onClick={onClick}
      disabled={isPaid}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      title={isPaid ? `${label} — already paid` : label}
      style={{
        padding: '8px 2px 6px', borderRadius: 7, border: '1.5px solid', textAlign: 'center',
        fontSize: 11, fontWeight: 700, cursor: isPaid ? 'default' : 'pointer',
        transition: 'all 0.14s',
        borderColor: isPaid ? '#15803d' : isSelected ? '#2563eb' : hov ? 'var(--input-focus-border)' : 'var(--card-border)',
        background: isPaid
          ? 'linear-gradient(160deg, #4ade80 0%, #16a34a 100%)'
          : isSelected
            ? 'linear-gradient(160deg, #60a5fa 0%, #1d4ed8 100%)'
            : hov ? 'var(--info-subtle)' : 'transparent',
        color: isPaid || isSelected ? '#fff' : hov ? 'var(--info)' : 'var(--text-2)',
        boxShadow: isPaid
          ? 'inset 0 1px 0 rgba(255,255,255,0.28), 0 2px 7px rgba(22,163,74,0.35)'
          : isSelected
            ? 'inset 0 1px 0 rgba(255,255,255,0.28), 0 2px 7px rgba(37,99,235,0.35)'
            : hov ? '0 1px 4px rgba(0,0,0,0.08)' : 'none',
        transform: !isPaid && (isSelected || hov) ? 'translateY(-2px) scale(1.04)' : 'none',
      }}
    >
      {label}
      <div style={{ fontSize: 8, marginTop: 1, letterSpacing: 0, opacity: isPaid || isSelected ? 0.9 : 0 }}>
        {isPaid ? '✓' : isSelected ? '●' : '·'}
      </div>
    </button>
  )
}

// ── Category Row ────────────────────────────────────────────────

function CategoryRow({ item, idx, onChange }) {
  const [hov, setHov] = useState(false)
  return (
    <tr
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        borderBottom: '1px solid var(--table-border)',
        borderLeft: `3px solid ${item.enabled ? 'var(--sidebar-bg)' : 'transparent'}`,
        background: item.enabled ? 'rgba(30,58,95,0.05)' : hov ? 'var(--table-row-hover)' : 'transparent',
        transition: 'background 0.12s, border-left-color 0.15s',
      }}
    >
      <td style={{ padding: '8px 10px', textAlign: 'center' }}>
        <button onClick={() => onChange(idx, 'enabled', !item.enabled)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2,
            color: item.enabled ? '#16a34a' : 'var(--text-3)',
            display: 'flex', alignItems: 'center',
            transition: 'color 0.12s, transform 0.12s',
            transform: item.enabled ? 'scale(1.15)' : 'scale(1)' }}>
          {item.enabled ? <CheckSquare size={16}/> : <Square size={16}/>}
        </button>
      </td>
      <td style={{ padding: '8px 16px' }}>
        <span
          onClick={() => onChange(idx, 'enabled', !item.enabled)}
          style={{ fontSize: 13, fontWeight: item.enabled ? 600 : 400, cursor: 'pointer',
            color: item.enabled ? 'var(--text-1)' : 'var(--text-2)', transition: 'all 0.12s' }}>
          {item.name}
        </span>
      </td>
      <td style={{ padding: '6px 12px' }}>
        <input type="number" min="0" step="0.01"
          value={item.amt} disabled={!item.enabled}
          onChange={e => onChange(idx, 'amt', e.target.value)}
          onFocus={() => !item.enabled && onChange(idx, 'enabled', true)}
          className="field-input"
          style={{ textAlign: 'right', padding: '4px 8px', fontSize: 13,
            width: '100%', height: 30, opacity: item.enabled ? 1 : 0.35, transition: 'opacity 0.12s' }}
          placeholder="0.00"/>
      </td>
      <td style={{ padding: '6px 10px' }}>
        <input type="number" min="1" max="12" step="1"
          value={item.months} disabled={!item.enabled}
          onChange={e => onChange(idx, 'months', e.target.value)}
          className="field-input"
          style={{ textAlign: 'center', padding: '4px 8px', fontSize: 13,
            width: '100%', height: 30, opacity: item.enabled ? 1 : 0.35, transition: 'opacity 0.12s' }}
          placeholder="1"/>
      </td>
      <td style={{ padding: '8px 18px', textAlign: 'right' }}>
        {item.enabled && item.total > 0 ? (
          <span style={{ fontFamily: 'monospace', fontSize: 13, fontWeight: 700, color: 'var(--text-1)' }}>
            ₹{item.total.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
          </span>
        ) : (
          <span style={{ color: 'var(--text-3)', fontSize: 12 }}>—</span>
        )}
      </td>
    </tr>
  )
}

// ── Layout helpers ────────────────────────────────────────────────

function SectionLabel({ children }) {
  return (
    <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase',
      letterSpacing: '0.1em', marginBottom: 10 }}>
      {children}
    </div>
  )
}

function Divider() {
  return <div style={{ borderTop: '1px solid var(--card-border)' }}/>
}

function Row({ label, children, style }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, ...style }}>
      <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-2)' }}>{label}</label>
      {children}
    </div>
  )
}
