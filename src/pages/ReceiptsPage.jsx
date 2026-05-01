import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { useToast } from '../lib/toast'
import { getActiveCategories } from '../lib/paymentCategories'
import {
  Plus, Search, X, Loader2, Save, ArrowLeft,
  Edit2, Trash2, IndianRupee, CheckSquare, Square,
} from 'lucide-react'

// ── helpers ─────────────────────────────────────────────────────

function getFY(dateStr) {
  const d = dateStr ? new Date(dateStr + 'T00:00:00') : new Date()
  const m = d.getMonth() + 1
  const y = d.getFullYear()
  return m >= 4
    ? `${y}-${String(y + 1).slice(2)}`
    : `${y - 1}-${String(y).slice(2)}`
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

function fmtAmt(n) {
  if (!n && n !== 0) return '—'
  return '₹' + Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

const MODES = ['Cash', 'Cheque', 'DD', 'Net Banking', 'UPI']

const MONTHS_LIST = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
]

const EMPTY = {
  receipt_number: '', receipt_date: '', financial_year: '',
  month_paid: '', subscription_period: '',
  payment_mode: 'Cash', cheque_dd_no: '', transaction_date: '', narration: '',
  member_id: '', member_name: '',
  address: '', address1: '', address2: '', city: '',
  mobile: '', whatsapp: '',
}

// ── main component ──────────────────────────────────────────────

export default function ReceiptsPage() {
  const { profile } = useAuth()
  const toast = useToast()

  const [view, setView]     = useState('list')   // 'list' | 'form'
  const [editId, setEditId] = useState(null)
  const [categories, setCategories] = useState([])
  const [catsLoading, setCatsLoading] = useState(true)
  const [form, setForm]   = useState(EMPTY)
  const [items, setItems] = useState([])
  const [saving, setSaving] = useState(false)

  // list
  const [receipts, setReceipts]       = useState([])
  const [listLoading, setListLoading] = useState(false)
  const [filterFY, setFilterFY]       = useState(() => getFY())
  const [search, setSearch]           = useState('')

  // member autocomplete
  const [memberQ, setMemberQ]       = useState('')
  const [suggestions, setSuggestions] = useState([])
  const [suggesting, setSuggesting]   = useState(false)
  const memberTimer = useRef(null)
  const memberRef   = useRef(null)

  // ── load categories (called on mount + retry)
  const loadCategories = useCallback(() => {
    setCatsLoading(true)
    getActiveCategories()
      .then(cats => setCategories(cats))
      .catch(() => setCategories([]))
      .finally(() => setCatsLoading(false))
  }, [])

  useEffect(() => { loadCategories() }, [loadCategories])

  // ── list loader
  const loadList = useCallback(async () => {
    setListLoading(true)
    try {
      let q = supabase
        .from('receipts')
        .select('id,receipt_number,receipt_date,member_id,member_name,payment_mode,grand_total')
        .order('receipt_number', { ascending: false })
      if (filterFY) q = q.eq('financial_year', filterFY)
      if (search.trim()) {
        const s = search.trim()
        q = q.or(`receipt_number.ilike.%${s}%,member_name.ilike.%${s}%,member_id.ilike.%${s}%`)
      }
      const { data, error } = await q
      if (error) throw error
      setReceipts(data || [])
    } catch (e) { toast(e.message, 'error') }
    setListLoading(false)
  }, [filterFY, search, toast])

  useEffect(() => { if (view === 'list') loadList() }, [view, loadList])

  // ── open new form
  const openNew = useCallback(async () => {
    if (catsLoading) {
      toast('Loading payment categories, please wait…', 'info')
      return
    }
    const today = new Date().toISOString().slice(0, 10)
    const fy    = getFY(today)
    const num   = await nextReceiptNumber(fy)
    setForm({ ...EMPTY, receipt_date: today, financial_year: fy, receipt_number: num })
    setItems(categories.map(c => ({
      category_id: c.id, name: c.name,
      enabled: false, amt: '', months: '1', total: 0,
    })))
    setMemberQ('')
    setSuggestions([])
    setEditId(null)
    setView('form')
  }, [categories, catsLoading, toast])

  // ── open edit form
  const openEdit = async (row) => {
    const [{ data: rec, error: recErr }, { data: recItems }] = await Promise.all([
      supabase.from('receipts').select('*').eq('id', row.id).single(),
      supabase.from('receipt_items').select('*').eq('receipt_id', row.id),
    ])
    if (recErr || !rec) { toast('Could not load receipt', 'error'); return }

    setForm({ ...EMPTY, ...rec })
    setMemberQ(rec.member_name || '')
    setEditId(row.id)

    const map = {}
    ;(recItems || []).forEach(i => { map[i.category_id] = i })
    setItems(categories.map(c => {
      const li = map[c.id]
      if (!li) return {
        category_id: c.id, name: c.name,
        enabled: false, amt: '', months: '1', total: 0,
      }
      return {
        category_id: c.id, name: c.name,
        enabled: true, amt: String(li.amt), months: String(li.months), total: li.total,
      }
    }))
    setView('form')
  }

  // ── recalc FY when date changes
  useEffect(() => {
    if (view !== 'form' || !form.receipt_date) return
    const newFY = getFY(form.receipt_date)
    if (newFY !== form.financial_year) {
      setForm(f => ({ ...f, financial_year: newFY }))
    }
  }, [form.receipt_date])                 // intentionally omitting view/form.financial_year

  // ── member autocomplete
  useEffect(() => {
    if (!memberQ.trim()) { setSuggestions([]); return }
    clearTimeout(memberTimer.current)
    memberTimer.current = setTimeout(async () => {
      setSuggesting(true)
      const s = memberQ.trim()
      const { data } = await supabase
        .from('members')
        .select('member_id,member_name,address_street,area_1,area_2,city,mobile,whatsapp')
        .or(`member_name.ilike.%${s}%,member_id.ilike.%${s}%`)
        .limit(8)
      setSuggestions(data || [])
      setSuggesting(false)
    }, 280)
  }, [memberQ])

  const selectMember = async (m) => {
    setSuggestions([])
    setMemberQ(m.member_name)
    const fy = form.financial_year || getFY()
    setForm(f => ({
      ...f,
      member_id:   m.member_id,
      member_name: m.member_name,
      address:     m.address_street || '',
      address1:    m.area_1 || '',
      address2:    m.area_2 || '',
      city:        m.city   || '',
      mobile:      m.mobile   || '',
      whatsapp:    m.whatsapp || '',
    }))
    // Auto-populate amounts from last receipt this FY
    const { data: prev } = await supabase
      .from('receipts')
      .select('id')
      .eq('member_id', m.member_id)
      .eq('financial_year', fy)
      .order('receipt_number', { ascending: false })
      .limit(1)
    if (prev?.length) {
      const { data: prevItems } = await supabase
        .from('receipt_items').select('*').eq('receipt_id', prev[0].id)
      if (prevItems?.length) {
        const map = {}
        prevItems.forEach(i => { map[i.category_id] = i })
        setItems(curr => curr.map(item => {
          const li = map[item.category_id]
          if (!li) return item
          const amt    = String(li.amt    || '')
          const months = String(li.months || '1')
          return { ...item, enabled: true, amt, months, total: (parseFloat(amt) || 0) * (parseFloat(months) || 0) }
        }))
      }
    }
  }

  // ── update item row
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

  // ── save receipt
  const save = async () => {
    if (!form.member_id)  { toast('Please select a member', 'error'); return }
    if (!form.receipt_date) { toast('Enter receipt date', 'error'); return }
    const enabled     = items.filter(i => i.enabled)
    if (!enabled.length) { toast('Enable at least one payment category', 'error'); return }
    const withAmt     = enabled.filter(i => (parseFloat(i.amt) || 0) > 0)
    if (!withAmt.length) { toast('Enter amount for enabled categories', 'error'); return }

    setSaving(true)
    try {
      const recData = {
        receipt_number:      form.receipt_number,
        receipt_date:        form.receipt_date,
        financial_year:      form.financial_year,
        month_paid:          form.month_paid          || null,
        subscription_period: form.subscription_period || null,
        payment_mode:        form.payment_mode,
        cheque_dd_no:        form.cheque_dd_no        || null,
        transaction_date:    form.transaction_date     || null,
        narration:           form.narration           || null,
        member_id:           form.member_id,
        member_name:         form.member_name,
        address:             form.address  || null,
        address1:            form.address1 || null,
        address2:            form.address2 || null,
        city:                form.city     || null,
        mobile:              form.mobile   || null,
        whatsapp:            form.whatsapp || null,
        grand_total:         grandTotal,
        created_by:          profile?.full_name || profile?.email,
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

      const itemRows = withAmt.map(i => ({
        receipt_id:  receiptId,
        category_id: i.category_id,
        amt:         parseFloat(i.amt)    || 0,
        months:      parseFloat(i.months) || 0,
        total:       i.total,
      }))
      const { error: iErr } = await supabase.from('receipt_items').insert(itemRows)
      if (iErr) throw iErr

      toast(editId ? 'Receipt updated' : `Receipt ${form.receipt_number} saved`, 'success')
      setView('list')
    } catch (e) { toast(e.message, 'error') }
    setSaving(false)
  }

  // ── delete
  const del = async (row) => {
    if (!window.confirm(`Delete receipt ${row.receipt_number}? This cannot be undone.`)) return
    const { error } = await supabase.from('receipts').delete().eq('id', row.id)
    if (error) { toast(error.message, 'error'); return }
    toast('Receipt deleted', 'success')
    loadList()
  }

  const showChequeFields = ['Cheque', 'DD'].includes(form.payment_mode)
  const showTxnDate      = ['Cheque', 'DD', 'Net Banking'].includes(form.payment_mode)
  const sf = (k) => (v) => setForm(f => ({ ...f, [k]: v }))

  // ════════════════════════════════════════════════════════
  //  LIST VIEW
  // ════════════════════════════════════════════════════════
  if (view === 'list') {
    // build FY options: current + 2 prior + 1 future
    const baseYear = new Date().getFullYear()
    const fyOptions = [-2, -1, 0, 1].map(d => {
      const y = baseYear + d
      const m = new Date().getMonth() + 1
      const fy = m >= 4 ? `${y}-${String(y+1).slice(2)}` : `${y-1}-${String(y).slice(2)}`
      return fy
    }).filter((v, i, a) => a.indexOf(v) === i).sort().reverse()

    return (
      <div className="page-container">
        <div className="page-header">
          <div>
            <h1 className="page-title">Receipt Entry</h1>
            <p className="page-subtitle">Record member payments across all categories</p>
          </div>
          <button className="btn btn-primary" onClick={openNew} disabled={catsLoading}>
            {catsLoading ? <Loader2 size={14} className="animate-spin"/> : <Plus size={14}/>}
            New Receipt
          </button>
        </div>

        {/* Filters */}
        <div className="card" style={{ padding: '14px 16px', marginBottom: 16, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <label style={{ fontSize: 13, color: 'var(--text-2)', fontWeight: 500, whiteSpace: 'nowrap' }}>Financial Year</label>
            <select
              value={filterFY}
              onChange={e => setFilterFY(e.target.value)}
              className="field-input"
              style={{ width: 120 }}
            >
              {fyOptions.map(fy => <option key={fy} value={fy}>{fy}</option>)}
            </select>
          </div>
          <div style={{ flex: 1, position: 'relative', minWidth: 220 }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }}/>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search receipt no, member name or ID…"
              className="field-input"
              style={{ paddingLeft: 32, width: '100%' }}
            />
            {search && (
              <button onClick={() => setSearch('')} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)' }}>
                <X size={13}/>
              </button>
            )}
          </div>
          <span style={{ fontSize: 13, color: 'var(--text-3)', whiteSpace: 'nowrap' }}>
            {listLoading ? <Loader2 size={13} className="animate-spin inline"/> : `${receipts.length} receipt${receipts.length !== 1 ? 's' : ''}`}
          </span>
        </div>

        {/* Table */}
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
                {search ? 'Try a different search term' : `No receipts for FY ${filterFY}`}
              </p>
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--table-header-bg)', borderBottom: '1px solid var(--table-border)' }}>
                  {['Receipt No', 'Date', 'Member', 'Mode', 'Amount', ''].map(h => (
                    <th key={h} style={{ padding: '10px 14px', textAlign: h === 'Amount' ? 'right' : 'left', fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', whiteSpace: 'nowrap' }}>{h}</th>
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
                    <td style={{ padding: '10px 14px' }}>
                      <span style={{
                        fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 4,
                        background: r.payment_mode === 'Cash' ? '#f0fdf4' : '#eff6ff',
                        color:      r.payment_mode === 'Cash' ? '#15803d' : '#1d4ed8',
                      }}>{r.payment_mode}</span>
                    </td>
                    <td style={{ padding: '10px 14px', textAlign: 'right', fontSize: 13, fontWeight: 700, color: 'var(--text-1)', whiteSpace: 'nowrap' }}>{fmtAmt(r.grand_total)}</td>
                    <td style={{ padding: '10px 14px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <button onClick={() => openEdit(r)} title="Edit" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: '4px 6px', borderRadius: 4 }} onMouseEnter={e => e.currentTarget.style.color='#2563eb'} onMouseLeave={e => e.currentTarget.style.color='var(--text-3)'}>
                        <Edit2 size={14}/>
                      </button>
                      <button onClick={() => del(r)} title="Delete" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: '4px 6px', borderRadius: 4 }} onMouseEnter={e => e.currentTarget.style.color='#dc2626'} onMouseLeave={e => e.currentTarget.style.color='var(--text-3)'}>
                        <Trash2 size={14}/>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    )
  }

  // ════════════════════════════════════════════════════════
  //  FORM VIEW (new / edit)
  // ════════════════════════════════════════════════════════
  return (
    <div className="page-container">
      {/* Header */}
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button className="btn btn-secondary" onClick={() => setView('list')}>
            <ArrowLeft size={14}/> Back
          </button>
          <div>
            <h1 className="page-title">{editId ? 'Edit Receipt' : 'New Receipt'}</h1>
            <p className="page-subtitle">{editId ? `Editing ${form.receipt_number}` : 'Record a new member payment'}</p>
          </div>
        </div>
        <button className="btn btn-primary" onClick={save} disabled={saving}>
          {saving ? <Loader2 size={14} className="animate-spin"/> : <Save size={14}/>}
          {saving ? 'Saving…' : 'Save Receipt'}
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 16, alignItems: 'start' }}>

        {/* ── Left column ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Receipt Info */}
          <Section title="Receipt Details">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
              <Field label="Receipt Number">
                <input value={form.receipt_number} readOnly className="field-input"
                  style={{ fontFamily: 'monospace', fontWeight: 600, background: '#f8f9fc', color: 'var(--text-2)' }}/>
              </Field>
              <Field label="Receipt Date">
                <input type="date" value={form.receipt_date} onChange={e => sf('receipt_date')(e.target.value)} className="field-input"/>
              </Field>
              <Field label="Financial Year">
                <input value={form.financial_year} readOnly className="field-input"
                  style={{ background: '#f8f9fc', color: 'var(--text-2)', fontWeight: 600 }}/>
              </Field>
            </div>
          </Section>

          {/* Member */}
          <Section title="Member">
            <Field label="Search Member">
              <div style={{ position: 'relative' }}>
                <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)', zIndex: 1 }}/>
                <input
                  ref={memberRef}
                  value={memberQ}
                  onChange={e => { setMemberQ(e.target.value); if (!e.target.value) setForm(f => ({ ...f, member_id: '', member_name: '' })) }}
                  placeholder="Type member name or ID…"
                  className="field-input"
                  style={{ paddingLeft: 32 }}
                />
                {suggesting && <Loader2 size={13} className="animate-spin" style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }}/>}
                {suggestions.length > 0 && (
                  <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 200, background: 'white', border: '1px solid var(--card-border)', borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', overflow: 'hidden', marginTop: 2 }}>
                    {suggestions.map(m => (
                      <button key={m.member_id} onClick={() => selectMember(m)}
                        style={{ display: 'block', width: '100%', padding: '9px 14px', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', borderBottom: '1px solid var(--table-border)' }}
                        onMouseEnter={e => e.currentTarget.style.background = 'var(--table-row-hover)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'none'}
                      >
                        <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-1)' }}>{m.member_name}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{m.member_id}{m.city ? ` · ${m.city}` : ''}</div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </Field>

            {form.member_id && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12 }}>
                <Field label="Member ID">
                  <input value={form.member_id} readOnly className="field-input" style={{ background: '#f8f9fc', color: 'var(--text-2)', fontWeight: 600 }}/>
                </Field>
                <Field label="Mobile">
                  <input value={form.mobile} readOnly className="field-input" style={{ background: '#f8f9fc', color: 'var(--text-2)' }}/>
                </Field>
                <Field label="Address">
                  <input value={[form.address, form.address1, form.address2, form.city].filter(Boolean).join(', ')} readOnly className="field-input" style={{ background: '#f8f9fc', color: 'var(--text-2)', fontSize: 12 }}/>
                </Field>
                <Field label="WhatsApp">
                  <input value={form.whatsapp} readOnly className="field-input" style={{ background: '#f8f9fc', color: 'var(--text-2)' }}/>
                </Field>
              </div>
            )}
          </Section>

          {/* Payment Details */}
          <Section title="Payment Details">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field label="Month Paid">
                <select value={form.month_paid} onChange={e => sf('month_paid')(e.target.value)} className="field-input" style={{ appearance: 'none' }}>
                  <option value="">— Select month —</option>
                  {MONTHS_LIST.map(m => <option key={m} value={m}>{m}</option>)}
                  <option value="Jan-Mar">Jan – Mar</option>
                  <option value="Apr-Jun">Apr – Jun</option>
                  <option value="Jul-Sep">Jul – Sep</option>
                  <option value="Oct-Dec">Oct – Dec</option>
                  <option value="Annual">Annual</option>
                </select>
              </Field>
              <Field label="Subscription Period">
                <input value={form.subscription_period} onChange={e => sf('subscription_period')(e.target.value)}
                  placeholder="e.g. Apr 2025 – Mar 2026" className="field-input"/>
              </Field>
            </div>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
              {MODES.map(m => (
                <button key={m} onClick={() => sf('payment_mode')(m)}
                  className={`btn btn-sm ${form.payment_mode === m ? 'btn-primary' : 'btn-secondary'}`}>
                  {m}
                </button>
              ))}
            </div>

            {(showChequeFields || showTxnDate) && (
              <div style={{ display: 'grid', gridTemplateColumns: showChequeFields ? '1fr 1fr' : '1fr', gap: 12, marginTop: 12 }}>
                {showChequeFields && (
                  <Field label={form.payment_mode === 'DD' ? 'DD Number' : 'Cheque Number'}>
                    <input value={form.cheque_dd_no} onChange={e => sf('cheque_dd_no')(e.target.value)} className="field-input" placeholder="Enter number"/>
                  </Field>
                )}
                {showTxnDate && (
                  <Field label="Transaction Date">
                    <input type="date" value={form.transaction_date} onChange={e => sf('transaction_date')(e.target.value)} className="field-input"/>
                  </Field>
                )}
              </div>
            )}

            <div style={{ marginTop: 12 }}>
              <Field label="Narration (optional)">
                <input value={form.narration} onChange={e => sf('narration')(e.target.value)} className="field-input" placeholder="Notes about this payment…"/>
              </Field>
            </div>
          </Section>

          {/* Categories */}
          <Section title="Payment Categories">
            <p style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 12, marginTop: -4 }}>
              Check a category to include it. Enter Rate/Month × No. of Months to calculate the total.
            </p>
            {categories.length === 0 && !catsLoading && (
              <div style={{ padding: '14px 16px', background: 'var(--warning-subtle)', border: '1px solid var(--warning-border)', borderRadius: 8, marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <span style={{ fontSize: 13, color: 'var(--warning)' }}>No payment categories found. Add them in Church Setup → Payment Categories, then retry.</span>
                <button className="btn btn-sm btn-secondary" onClick={loadCategories}>Retry</button>
              </div>
            )}
            <div style={{ border: '1px solid var(--table-border)', borderRadius: 8, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: 'var(--table-header-bg)' }}>
                    <th style={{ width: 32, padding: '8px 10px' }}></th>
                    <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Category</th>
                    <th style={{ width: 100, padding: '8px 10px', textAlign: 'right', fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Rate/Month ₹</th>
                    <th style={{ width: 80,  padding: '8px 10px', textAlign: 'center', fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Months</th>
                    <th style={{ width: 110, padding: '8px 10px', textAlign: 'right', fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Total ₹</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, idx) => (
                    <tr key={item.category_id}
                      style={{ borderTop: '1px solid var(--table-border)', background: item.enabled ? 'rgba(212,160,23,0.04)' : 'transparent', opacity: item.enabled ? 1 : 0.55 }}>
                      <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                        <button onClick={() => setItem(idx, 'enabled', !item.enabled)}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: item.enabled ? 'var(--success)' : 'var(--text-3)', padding: 0, display: 'flex', alignItems: 'center' }}>
                          {item.enabled ? <CheckSquare size={16}/> : <Square size={16}/>}
                        </button>
                      </td>
                      <td style={{ padding: '8px 12px' }}>
                        <span style={{ fontSize: 13, fontWeight: item.enabled ? 600 : 400, color: 'var(--text-1)' }}>{item.name}</span>
                      </td>
                      <td style={{ padding: '6px 10px' }}>
                        <input
                          type="number" min="0" step="0.01"
                          value={item.amt}
                          disabled={!item.enabled}
                          onChange={e => setItem(idx, 'amt', e.target.value)}
                          className="field-input"
                          style={{ textAlign: 'right', padding: '4px 8px', fontSize: 13, width: '100%', opacity: item.enabled ? 1 : 0.4 }}
                          placeholder="0.00"
                        />
                      </td>
                      <td style={{ padding: '6px 10px' }}>
                        <input
                          type="number" min="1" max="12" step="1"
                          value={item.months}
                          disabled={!item.enabled}
                          onChange={e => setItem(idx, 'months', e.target.value)}
                          className="field-input"
                          style={{ textAlign: 'center', padding: '4px 8px', fontSize: 13, width: '100%', opacity: item.enabled ? 1 : 0.4 }}
                          placeholder="1"
                        />
                      </td>
                      <td style={{ padding: '8px 10px', textAlign: 'right', fontFamily: 'monospace', fontSize: 13, fontWeight: item.enabled && item.total > 0 ? 700 : 400, color: item.enabled && item.total > 0 ? 'var(--text-1)' : 'var(--text-3)' }}>
                        {item.enabled && item.total > 0 ? item.total.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>
        </div>

        {/* ── Right column — Summary ── */}
        <div style={{ position: 'sticky', top: 16 }}>
          <div className="card" style={{ padding: 20 }}>
            <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 16 }}>Summary</h3>

            {items.filter(i => i.enabled && i.total > 0).length === 0 ? (
              <p style={{ fontSize: 13, color: 'var(--text-3)', textAlign: 'center', padding: '24px 0' }}>No categories selected</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {items.filter(i => i.enabled && i.total > 0).map(item => (
                  <div key={item.category_id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                    <span style={{ fontSize: 12, color: 'var(--text-2)', flex: 1 }}>{item.name}</span>
                    <span style={{ fontSize: 13, fontWeight: 600, fontFamily: 'monospace', color: 'var(--text-1)', whiteSpace: 'nowrap' }}>
                      {item.total.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                ))}
              </div>
            )}

            <div style={{ borderTop: '2px solid var(--card-border)', marginTop: 16, paddingTop: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-1)' }}>Grand Total</span>
              <span style={{ fontSize: 20, fontWeight: 800, color: 'var(--accent)', fontFamily: 'monospace' }}>
                ₹{grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </span>
            </div>

            <div style={{ marginTop: 16, padding: '10px 14px', background: 'var(--accent-subtle)', borderRadius: 8, fontSize: 12, color: 'var(--text-2)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span>Mode</span>
                <span style={{ fontWeight: 700 }}>{form.payment_mode || '—'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span>Date</span>
                <span style={{ fontWeight: 700 }}>{form.receipt_date ? fmtDate(form.receipt_date) : '—'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>FY</span>
                <span style={{ fontWeight: 700 }}>{form.financial_year || '—'}</span>
              </div>
            </div>

            <button className="btn btn-primary" onClick={save} disabled={saving} style={{ width: '100%', marginTop: 16, justifyContent: 'center' }}>
              {saving ? <Loader2 size={14} className="animate-spin"/> : <Save size={14}/>}
              {saving ? 'Saving…' : 'Save Receipt'}
            </button>
            <button className="btn btn-secondary" onClick={() => setView('list')} style={{ width: '100%', marginTop: 8, justifyContent: 'center' }}>
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── tiny helpers ─────────────────────────────────────────────────

function Section({ title, children }) {
  return (
    <div className="card" style={{ padding: 20 }}>
      <h3 style={{ fontSize: 12, fontWeight: 800, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 16 }}>{title}</h3>
      {children}
    </div>
  )
}

function Field({ label, children }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)' }}>{label}</label>
      {children}
    </div>
  )
}
