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
  IndianRupee, FileSpreadsheet, Upload, CheckSquare, Square,
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
  // DD-MM-YYYY or DD/MM/YYYY
  const m1 = str.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/)
  if (m1) return `${m1[3]}-${m1[2].padStart(2,'0')}-${m1[1].padStart(2,'0')}`
  // YYYY-MM-DD already
  const m2 = str.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (m2) return str
  // Excel serial date
  if (/^\d+$/.test(str)) {
    const d = new Date((parseInt(str) - 25569) * 86400 * 1000)
    if (!isNaN(d)) return d.toISOString().slice(0, 10)
  }
  return ''
}

function normalize(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '')
}

const MODES       = ['Cash', 'Cheque', 'DD', 'Net Banking', 'UPI']
const MONTHS_LIST = ['January','February','March','April','May','June',
                     'July','August','September','October','November','December']

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

  // load categories
  const loadCategories = useCallback(() => {
    setCatsLoading(true)
    getActiveCategories()
      .then(cats => setCategories(cats))
      .catch(() => setCategories([]))
      .finally(() => setCatsLoading(false))
  }, [])
  useEffect(() => { loadCategories() }, [loadCategories])

  // load FY stats (receipt counts)
  const loadFyStats = useCallback(async () => {
    const { data } = await supabase.from('receipts').select('financial_year')
    const counts = {}
    ;(data || []).forEach(r => { counts[r.financial_year] = (counts[r.financial_year] || 0) + 1 })
    setFyStats(counts)
  }, [])
  useEffect(() => { loadFyStats() }, [loadFyStats])

  // load receipt list
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
        // only process FY-named sheets like "2024-25"
        if (!/^\d{4}-\d{2}$/.test(sheetName)) continue
        const ws   = wb.Sheets[sheetName]
        const rows = XLSX.utils.sheet_to_json(ws, { defval: '', raw: false })
        if (!rows.length) continue

        // build column → field map from the first row's keys
        const headers = Object.keys(rows[0])

        // detect which columns belong to each category (3 consecutive columns per category)
        const catCols = {} // category_id → [amtCol, monthsCol, totalCol]
        for (const cat of cats) {
          const norm = normalize(cat.name)
          const matching = headers.filter(h => normalize(h).startsWith(norm) || normalize(h).includes(norm))
          if (matching.length >= 1) catCols[cat.id] = matching.slice(0, 3)
        }

        // find scalar field columns (case-insensitive partial match)
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

          // derive FY from sheet name or column
          const fy = sheetName

          // check duplicate
          const { data: ex } = await supabase.from('receipts').select('id').eq('receipt_number', rcptNo).limit(1)
          if (ex?.length) { skipped++; continue }

          const rcptDate = dateCol ? parseDateDMY(row[dateCol]) : ''
          const grandTot = parseFloat(String(row[grandTotCol] || '').replace(/[^0-9.]/g,'')) || 0

          // build receipt row
          const recData = {
            receipt_number:      rcptNo,
            receipt_date:        rcptDate || null,
            financial_year:      fy,
            payment_mode:        row[modeCol]    || 'Cash',
            cheque_dd_no:        row[chequeNoCol] ? String(row[chequeNoCol]).trim() : null,
            transaction_date:    txnDateCol ? parseDateDMY(row[txnDateCol]) || null : null,
            narration:           row[narrationCol] ? String(row[narrationCol]).trim() : null,
            member_id:           memberIdCol ? String(row[memberIdCol] || '').trim() : '',
            member_name:         memberNmCol ? String(row[memberNmCol] || '').trim() : '',
            address:             addrCol  ? String(row[addrCol]  || '').trim() : null,
            address1:            addr1Col ? String(row[addr1Col] || '').trim() : null,
            address2:            addr2Col ? String(row[addr2Col] || '').trim() : null,
            city:                cityCol  ? String(row[cityCol]  || '').trim() : null,
            mobile:              mobileCol ? String(row[mobileCol] || '').trim() : null,
            whatsapp:            waCol ? String(row[waCol] || '').trim() : null,
            month_paid:          monthCol ? String(row[monthCol] || '').trim() : null,
            grand_total:         grandTot,
            created_by:          profile?.full_name || profile?.email || 'Import',
          }

          try {
            const { data: ins, error: recErr } = await supabase.from('receipts').insert(recData).select('id').single()
            if (recErr) throw recErr

            // build receipt_items
            const itemRows = []
            for (const cat of cats) {
              const cols = catCols[cat.id]
              if (!cols?.length) continue
              const amt    = parseFloat(String(row[cols[0]] || '').replace(/[^0-9.]/g,'')) || 0
              const months = parseFloat(String(row[cols[1]] || '').replace(/[^0-9.]/g,'')) || 1
              const total  = parseFloat(String(row[cols[2]] || '').replace(/[^0-9.]/g,'')) || (amt * months)
              if (amt > 0) {
                itemRows.push({ receipt_id: ins.id, category_id: cat.id, amt, months, total })
              }
            }
            if (itemRows.length) {
              await supabase.from('receipt_items').insert(itemRows)
            }
            imported++
          } catch { errors++ }
        }
      }

      toast(`Import complete — ${imported} receipts imported, ${skipped} skipped (duplicates/empty), ${errors > 0 ? `${errors} errors` : 'no errors'}`, imported > 0 ? 'success' : 'error')
      loadList(); loadFyStats()
    } catch (e) {
      toast(`Import failed: ${e.message}`, 'error')
    }
    setImporting(false)
  }

  // ── render ────────────────────────────────────────────────────
  return (
    <div className="page-container">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Receipt Entry</h1>
          <p className="page-subtitle">Record member payments across all categories</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {/* Import Excel */}
          <input ref={importRef} type="file" accept=".xlsx,.xls" style={{ display: 'none' }} onChange={handleImport}/>
          <button
            onClick={() => importRef.current?.click()}
            disabled={importing || catsLoading}
            className="action-btn"
            style={{ background: '#0369a1', opacity: importing ? 0.6 : 1 }}>
            {importing ? <Loader2 size={13} className="animate-spin"/> : <Upload size={13}/>}
            {importing ? 'Importing…' : 'Import Excel'}
          </button>
          {/* New Receipt */}
          <button className="action-btn" onClick={openNew} disabled={catsLoading}
            style={{ background: 'var(--sidebar-bg)' }}
            title="New receipt">
            {catsLoading ? <Loader2 size={13} className="animate-spin"/> : <Plus size={13}/>}
            New Receipt
          </button>
        </div>
      </div>

      {/* FY tiles */}
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
                {['Receipt No','Date','Member','Month','Mode','Amount',''].map(h => (
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

      {/* Modal */}
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
  const [items,   setItems]   = useState([])
  const [saving,  setSaving]  = useState(false)
  const [loading, setLoading] = useState(!!editId)

  // Member ID suggestions (prefix search)
  const [memberId,           setMemberId]           = useState('')
  const [selMember,          setSelMember]          = useState(null)
  const [memberIdSuggestions,setMemberIdSuggestions]= useState([])
  const [showMemberIdPopup,  setShowMemberIdPopup]  = useState(false)
  const memberIdTimer = useRef(null)
  const memberIdRef   = useRef(null)
  const dateRef       = useRef(null)

  const sf = k => v => setForm(f => ({ ...f, [k]: v }))

  // init items from categories
  useEffect(() => {
    if (!categories.length) return
    setItems(categories.map(c => ({ category_id: c.id, name: c.name, enabled: false, amt: '', months: '1', total: 0 })))
  }, [categories])

  // auto-generate receipt number for new
  useEffect(() => {
    if (editId || !form.financial_year) return
    nextReceiptNumber(form.financial_year).then(n => setForm(f => ({ ...f, receipt_number: n })))
  }, [editId, form.financial_year])

  // load existing receipt when editing
  useEffect(() => {
    if (!editId) return
    setLoading(true)
    Promise.all([
      supabase.from('receipts').select('*').eq('id', editId).single(),
      supabase.from('receipt_items').select('*').eq('receipt_id', editId),
    ]).then(([{ data: rec }, { data: recItems }]) => {
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
      const map = {}
      ;(recItems || []).forEach(i => { map[i.category_id] = i })
      setItems(categories.map(c => {
        const li = map[c.id]
        if (!li) return { category_id: c.id, name: c.name, enabled: false, amt: '', months: '1', total: 0 }
        return { category_id: c.id, name: c.name, enabled: true,
          amt: String(li.amt || ''), months: String(li.months || '1'), total: li.total || 0 }
      }))
    }).finally(() => setLoading(false))
  }, [editId, categories])

  // autofocus member ID after load
  useEffect(() => {
    if (loading) return
    setTimeout(() => memberIdRef.current?.focus(), 80)
  }, [loading])

  // recalc FY when receipt date changes
  useEffect(() => {
    if (!form.receipt_date) return
    const newFY = getFY(form.receipt_date)
    if (newFY !== form.financial_year) setForm(f => ({ ...f, financial_year: newFY }))
  }, [form.receipt_date])

  // member ID prefix suggestions
  const onMemberIdChange = (val) => {
    setMemberId(val)
    if (selMember) { setSelMember(null) }
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
    // auto-populate amounts from last receipt in this FY
    const fy = form.financial_year
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
    if (data?.length) {
      await loadMember(data[0])
    } else {
      toast(`No member found with ID "${trimmed}"`, 'error')
    }
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
    const enabled  = items.filter(i => i.enabled && (parseFloat(i.amt) || 0) > 0)
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

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'var(--overlay)', display: 'flex',
      alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: 12 }}>
      <div style={{ background: 'var(--card-bg)', borderRadius: 12, width: '100%', maxWidth: 1060,
        maxHeight: '96vh', display: 'flex', flexDirection: 'column',
        boxShadow: '0 24px 64px rgba(0,0,0,0.4)' }}>

        {/* ══ Header ══ */}
        <div style={{ background: 'var(--sidebar-bg)', borderRadius: '12px 12px 0 0',
          padding: '11px 18px', flexShrink: 0, position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', inset: 0,
            background: 'linear-gradient(175deg, rgba(255,255,255,0.2) 0%, rgba(255,255,255,0.04) 50%, rgba(0,0,0,0.08) 100%)',
            pointerEvents: 'none', borderRadius: '12px 12px 0 0' }}/>
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <h2 style={{ color: '#fff', fontSize: 15, fontWeight: 700, margin: 0,
              textShadow: '0 1px 3px rgba(0,0,0,0.3)' }}>
              {editId ? `Edit Receipt` : 'New Receipt'}
            </h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {/* Receipt number badge */}
              {form.receipt_number && (
                <div style={{ background: 'rgba(255,255,255,0.14)', border: '1px solid rgba(255,255,255,0.28)',
                  borderRadius: 6, padding: '4px 12px', fontFamily: 'monospace',
                  fontSize: 13, fontWeight: 700, color: '#fff', letterSpacing: '0.05em' }}>
                  {form.receipt_number}
                </div>
              )}
              {/* FY badge */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6,
                background: 'rgba(255,255,255,0.14)', border: '1px solid rgba(255,255,255,0.28)',
                borderRadius: 6, padding: '4px 10px' }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.55)',
                  textTransform: 'uppercase', letterSpacing: '0.1em' }}>FY</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>{form.financial_year}</span>
              </div>
              <button onClick={onClose} tabIndex={-1}
                style={{ background: 'rgba(255,255,255,0.14)', border: '1px solid rgba(255,255,255,0.26)',
                  borderRadius: 7, padding: '5px 9px', cursor: 'pointer', color: '#fff',
                  display: 'flex', alignItems: 'center', transition: 'all 0.15s' }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.75)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.14)' }}>
                <X size={15}/>
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
          <div style={{ display: 'grid', gridTemplateColumns: '340px 1fr', flex: 1, minHeight: 0, overflow: 'hidden' }}>

            {/* ── Left panel ── */}
            <div style={{ borderRight: '1px solid var(--card-border)', overflowY: 'auto',
              padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 14 }}>

              {/* Member ID */}
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase',
                  letterSpacing: '0.08em', marginBottom: 8 }}>Member</div>
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
                      placeholder="ID + Tab"
                      className="field-input"
                      style={{ height: 32 }}
                      autoComplete="off"
                    />
                    {showMemberIdPopup && memberIdSuggestions.length > 0 && (
                      <div style={{ position: 'absolute', top: '100%', left: 0, zIndex: 300,
                        minWidth: 280, background: 'var(--card-bg)', border: '1px solid var(--card-border)',
                        borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
                        maxHeight: 200, overflowY: 'auto', marginTop: 3 }}>
                        <div style={{ padding: '5px 10px', fontSize: 10, fontWeight: 700,
                          color: 'var(--text-3)', borderBottom: '1px solid var(--card-border)',
                          textTransform: 'uppercase', letterSpacing: '0.06em',
                          background: 'var(--page-bg)', borderRadius: '8px 8px 0 0' }}>
                          Matching Members
                        </div>
                        {memberIdSuggestions.map(m => (
                          <button key={m.member_id}
                            onMouseDown={e => { e.preventDefault(); loadMember(m) }}
                            style={{ display: 'flex', width: '100%', padding: '6px 10px', gap: 10,
                              alignItems: 'center', background: 'none', border: 'none',
                              cursor: 'pointer', borderBottom: '1px solid var(--table-border)', textAlign: 'left' }}
                            onMouseEnter={e => e.currentTarget.style.background = 'var(--table-row-hover)'}
                            onMouseLeave={e => e.currentTarget.style.background = 'none'}>
                            <span style={{ fontWeight: 700, fontFamily: 'monospace', color: 'var(--info)', minWidth: 70, fontSize: 12 }}>{m.member_id}</span>
                            <span style={{ fontSize: 12, color: 'var(--text-2)' }}>{m.member_name}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </Row>
                {selMember && (
                  <>
                    <Row label="Member Name" style={{ marginTop: 8 }}>
                      <input value={form.member_name} readOnly className="field-input"
                        style={{ height: 32, background: 'var(--page-bg)', fontWeight: 600, fontSize: 13 }}/>
                    </Row>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 8 }}>
                      <Row label="Mobile">
                        <input value={form.mobile} readOnly className="field-input" style={{ height: 32, background: 'var(--page-bg)', fontSize: 12 }}/>
                      </Row>
                      <Row label="WhatsApp">
                        <input value={form.whatsapp} readOnly className="field-input" style={{ height: 32, background: 'var(--page-bg)', fontSize: 12 }}/>
                      </Row>
                    </div>
                    {(form.address || form.address1 || form.city) && (
                      <Row label="Address" style={{ marginTop: 8 }}>
                        <input value={[form.address, form.address1, form.address2, form.city].filter(Boolean).join(', ')}
                          readOnly className="field-input" style={{ height: 32, background: 'var(--page-bg)', fontSize: 11 }}/>
                      </Row>
                    )}
                  </>
                )}
              </div>

              {/* Divider */}
              <div style={{ borderTop: '1px solid var(--card-border)' }}/>

              {/* Receipt details */}
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase',
                  letterSpacing: '0.08em', marginBottom: 8 }}>Receipt Details</div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <Row label="Receipt Date">
                    <input ref={dateRef} type="date" value={form.receipt_date}
                      onChange={e => sf('receipt_date')(e.target.value)}
                      className="field-input" style={{ height: 32 }}/>
                  </Row>
                  <Row label="Month Paid">
                    <select value={form.month_paid} onChange={e => sf('month_paid')(e.target.value)}
                      className="field-input" style={{ height: 32 }}>
                      <option value="">— Select —</option>
                      {MONTHS_LIST.map(m => <option key={m} value={m}>{m}</option>)}
                      <option value="Jan-Mar">Jan – Mar</option>
                      <option value="Apr-Jun">Apr – Jun</option>
                      <option value="Jul-Sep">Jul – Sep</option>
                      <option value="Oct-Dec">Oct – Dec</option>
                      <option value="Annual">Annual</option>
                    </select>
                  </Row>
                </div>

                {/* Payment mode toggle */}
                <div style={{ marginTop: 10 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-2)', marginBottom: 6 }}>Payment Mode</div>
                  <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                    {MODES.map(m => (
                      <button key={m} onClick={() => sf('payment_mode')(m)}
                        style={{ padding: '4px 10px', borderRadius: 6, fontSize: 12, fontWeight: 600,
                          border: '1px solid',
                          background: form.payment_mode === m ? 'var(--sidebar-bg)' : 'transparent',
                          borderColor: form.payment_mode === m ? 'var(--sidebar-bg)' : 'var(--card-border)',
                          color: form.payment_mode === m ? '#fff' : 'var(--text-2)',
                          cursor: 'pointer', transition: 'all 0.12s' }}>
                        {m}
                      </button>
                    ))}
                  </div>
                </div>

                {showChequeFields && (
                  <Row label={form.payment_mode === 'DD' ? 'DD Number' : 'Cheque Number'} style={{ marginTop: 10 }}>
                    <input value={form.cheque_dd_no} onChange={e => sf('cheque_dd_no')(e.target.value)}
                      className="field-input" style={{ height: 32 }} placeholder="Enter number"/>
                  </Row>
                )}
                {showTxnDate && (
                  <Row label="Transaction Date" style={{ marginTop: 8 }}>
                    <input type="date" value={form.transaction_date}
                      onChange={e => sf('transaction_date')(e.target.value)}
                      className="field-input" style={{ height: 32 }}/>
                  </Row>
                )}

                <Row label="Narration" style={{ marginTop: 8 }}>
                  <input value={form.narration} onChange={e => sf('narration')(e.target.value)}
                    className="field-input" style={{ height: 32 }} placeholder="Optional note…"/>
                </Row>
              </div>

              {/* Spacer + Grand Total + Save */}
              <div style={{ marginTop: 'auto', paddingTop: 12, borderTop: '1px solid var(--card-border)' }}>
                {/* Category summary */}
                {items.filter(i => i.enabled && i.total > 0).length > 0 && (
                  <div style={{ marginBottom: 12, display: 'flex', flexDirection: 'column', gap: 4 }}>
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
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-1)' }}>Grand Total</span>
                  <span style={{ fontSize: 22, fontWeight: 800, fontFamily: 'monospace', color: 'var(--sidebar-bg)' }}>
                    ₹{grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </span>
                </div>
                <button onClick={save} disabled={saving}
                  style={{ width: '100%', padding: '9px 0', borderRadius: 8, background: 'var(--sidebar-bg)',
                    color: '#fff', border: 'none', fontWeight: 700, fontSize: 14, cursor: saving ? 'not-allowed' : 'pointer',
                    opacity: saving ? 0.7 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                    fontFamily: 'var(--font-ui)' }}>
                  {saving ? <Loader2 size={15} className="animate-spin"/> : <Save size={15}/>}
                  {saving ? 'Saving…' : 'Save Receipt'}
                </button>
              </div>
            </div>

            {/* ── Right panel — categories ── */}
            <div style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
              {/* Month/Duration header bar */}
              <div style={{ padding: '10px 18px', borderBottom: '1px solid var(--card-border)',
                background: 'var(--table-header-bg)', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                  Payment Categories
                </span>
                <span style={{ fontSize: 11, color: 'var(--text-3)', marginLeft: 'auto' }}>
                  ✓ Check to include · enter Rate/Month × Months
                </span>
              </div>

              <table style={{ width: '100%', borderCollapse: 'collapse', flex: 1 }}>
                <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
                  <tr style={{ background: 'var(--table-header-bg)', borderBottom: '1px solid var(--table-border)' }}>
                    <th style={{ width: 36, padding: '8px 10px' }}></th>
                    <th style={{ padding: '8px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700,
                      color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Category</th>
                    <th style={{ width: 110, padding: '8px 10px', textAlign: 'right', fontSize: 11,
                      fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Rate / Month ₹</th>
                    <th style={{ width: 80, padding: '8px 10px', textAlign: 'center', fontSize: 11,
                      fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Months</th>
                    <th style={{ width: 120, padding: '8px 14px', textAlign: 'right', fontSize: 11,
                      fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Total ₹</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, idx) => (
                    <tr key={item.category_id}
                      style={{ borderBottom: '1px solid var(--table-border)',
                        background: item.enabled ? 'rgba(var(--accent-rgb,30,58,95),0.04)' : 'transparent',
                        opacity: item.enabled ? 1 : 0.6, transition: 'background 0.1s' }}>
                      <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                        <button onClick={() => setItem(idx, 'enabled', !item.enabled)}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                            color: item.enabled ? 'var(--success)' : 'var(--text-3)', display: 'flex', alignItems: 'center' }}>
                          {item.enabled ? <CheckSquare size={16}/> : <Square size={16}/>}
                        </button>
                      </td>
                      <td style={{ padding: '8px 14px' }}>
                        <span style={{ fontSize: 13, fontWeight: item.enabled ? 600 : 400, color: 'var(--text-1)',
                          cursor: 'pointer' }}
                          onClick={() => setItem(idx, 'enabled', !item.enabled)}>
                          {item.name}
                        </span>
                      </td>
                      <td style={{ padding: '6px 10px' }}>
                        <input type="number" min="0" step="0.01"
                          value={item.amt} disabled={!item.enabled}
                          onChange={e => setItem(idx, 'amt', e.target.value)}
                          onFocus={e => !item.enabled && setItem(idx, 'enabled', true)}
                          className="field-input"
                          style={{ textAlign: 'right', padding: '4px 8px', fontSize: 13, width: '100%',
                            height: 30, opacity: item.enabled ? 1 : 0.4 }}
                          placeholder="0.00"/>
                      </td>
                      <td style={{ padding: '6px 10px' }}>
                        <input type="number" min="1" max="12" step="1"
                          value={item.months} disabled={!item.enabled}
                          onChange={e => setItem(idx, 'months', e.target.value)}
                          className="field-input"
                          style={{ textAlign: 'center', padding: '4px 8px', fontSize: 13, width: '100%',
                            height: 30, opacity: item.enabled ? 1 : 0.4 }}
                          placeholder="1"/>
                      </td>
                      <td style={{ padding: '8px 14px', textAlign: 'right', fontFamily: 'monospace',
                        fontSize: 13, fontWeight: item.enabled && item.total > 0 ? 700 : 400,
                        color: item.enabled && item.total > 0 ? 'var(--text-1)' : 'var(--text-3)' }}>
                        {item.enabled && item.total > 0
                          ? item.total.toLocaleString('en-IN', { minimumFractionDigits: 2 })
                          : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── row label helper ──────────────────────────────────────────────

function Row({ label, children, style }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, ...style }}>
      <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-2)' }}>{label}</label>
      {children}
    </div>
  )
}
