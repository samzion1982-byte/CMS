import { useState, useEffect, useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import { useToast } from '../lib/toast'
import {
  getFY, fmtAmt,
  getChartOfAccounts, getPostableAccountsWithPath,
  nextEntryNumber, getAccountingSettings,
  createJournalEntry, updateJournalEntry, postJournalEntry,
  getJournalEntryWithLines,
} from '../lib/accountingLib'
import {
  Loader2, Save, CheckSquare, ArrowLeft, CheckCircle2,
  Plus, Trash2, FileText, Printer,
} from 'lucide-react'
import NarrationInput from '../components/accounting/NarrationInput'
import VoucherPrint from '../components/accounting/VoucherPrint'
import { getChurch } from '../lib/supabase'
import { getFunds } from '../lib/accountingLib'

const ACCENT = '#0891b2'

let _lineId = 0
function newLine() { return { _id: ++_lineId, accountId: '', accountName: '', amount: '' } }

// strip specials to spaces → "Men's" → "men s"
function norm(s)    { return s.toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim() }
// strip ALL non-alphanumeric → "Men's" → "mens"
function compact(s) { return s.toLowerCase().replace(/[^a-z0-9]/g, '') }
function matchAcct(name, q) {
  if (!q) return true
  const nl = name.toLowerCase(), qn = norm(q), nc = compact(name), qc = compact(q)
  // substring match on raw / normalised / compacted forms
  if (nl.includes(q) || norm(name).includes(qn) || nc.includes(qc)) return true
  // all query words must appear somewhere in normalised name (order-independent)
  return qn.split(' ').filter(Boolean).every(w => norm(name).includes(w))
}

function AccountPicker({ value, accounts, onChange, placeholder = 'Select account…', disabled = false }) {
  const [query, setQuery] = useState('')
  const [open,  setOpen]  = useState(false)
  const [hi,    setHi]    = useState(0)
  const selected    = useMemo(() => accounts.find(a => a.id === value), [value, accounts])
  const displayName = selected ? selected.name : ''
  const filtered = useMemo(() => {
    if (!open) return []
    const q = query.trim().toLowerCase()
    if (!q) return accounts.slice(0, 15)
    const matched = accounts.filter(a => matchAcct(a.name, q))
    // rank: starts-with first, then rest
    matched.sort((a, b) => {
      const as = compact(a.name).startsWith(compact(q)) ? 0 : 1
      const bs = compact(b.name).startsWith(compact(q)) ? 0 : 1
      return as - bs
    })
    return matched.slice(0, 15)
  }, [query, open, accounts])
  function onFocus() { setQuery(''); setOpen(true); setHi(0) }
  function onBlur()  { setTimeout(() => setOpen(false), 160) }
  function pick(a)   { onChange(a.id, a.name); setOpen(false) }
  function onKey(e) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setHi(h => Math.min(h + 1, filtered.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHi(h => Math.max(h - 1, 0)) }
    else if (e.key === 'Escape') { setOpen(false) }
    else if (e.key === 'Enter' && open) { e.preventDefault(); if (filtered[hi]) pick(filtered[hi]); else setOpen(false) }
    else if (e.key === 'Tab'   && open) { if (filtered[hi]) pick(filtered[hi]) }
  }
  return (
    <div style={{ position: 'relative', flex: 1, minWidth: 0 }}>
      <input className="field-input" value={open ? query : displayName}
        onChange={e => { setQuery(e.target.value); setHi(0) }}
        onFocus={onFocus} onBlur={onBlur} onKeyDown={onKey}
        placeholder={placeholder} disabled={disabled} autoComplete="off"
        style={{ fontSize: 12 }} />
      {open && filtered.length > 0 && (
        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 300, background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.18)', maxHeight: 220, overflowY: 'auto', marginTop: 2 }}>
          {filtered.map((a, i) => (
            <div key={a.id} onMouseDown={() => pick(a)} style={{ padding: '8px 12px', cursor: 'pointer', background: i === hi ? 'var(--accent-subtle)' : 'transparent', borderBottom: '1px solid var(--card-border)' }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-1)' }}>{a.name}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function LinesPanel({ title, accentColor, lines, accounts, onChange, onAdd, onRemove, disabled, total }) {
  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Panel header */}
      <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--card-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: `${accentColor}08` }}>
        <p style={{ fontSize: 12, fontWeight: 700, color: accentColor, margin: 0, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{title}</p>
        <span style={{ fontSize: 12, fontWeight: 700, fontFamily: 'monospace', color: accentColor }}>{fmtAmt(total)}</span>
      </div>

      {/* Lines */}
      <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
        {lines.map((line, idx) => (
          <div key={line._id} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <AccountPicker
              value={line.accountId}
              accounts={accounts}
              onChange={(id, name) => onChange(idx, 'accountId', id, name)}
              placeholder="Account…"
              disabled={disabled}
            />
            <input
              type="number" min="0" step="0.01" placeholder="0.00"
              value={line.amount}
              onChange={e => onChange(idx, 'amount', e.target.value)}
              disabled={disabled}
              className="field-input"
              style={{ width: 100, textAlign: 'right', fontSize: 12, fontFamily: 'monospace', flexShrink: 0 }}
            />
            <button
              onClick={() => onRemove(idx)}
              disabled={lines.length === 1 || disabled}
              className="no-lift"
              style={{ padding: '5px 6px', background: 'none', border: '1px solid var(--card-border)', borderRadius: 6, cursor: lines.length === 1 ? 'not-allowed' : 'pointer', color: lines.length === 1 ? 'var(--text-3)' : '#dc2626', flexShrink: 0, display: 'flex', alignItems: 'center' }}
            >
              <Trash2 size={12} />
            </button>
          </div>
        ))}
      </div>

      {/* Add line */}
      <div style={{ padding: '8px 12px', borderTop: '1px solid var(--card-border)' }}>
        <button onClick={onAdd} disabled={disabled} className="no-lift"
          style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 600, color: accentColor, background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0' }}>
          <Plus size={13} /> Add Line
        </button>
      </div>
    </div>
  )
}

export default function JournalVoucherPage() {
  const { user }   = useAuth()
  const navigate   = useNavigate()
  const toast      = useToast()
  const [searchParams] = useSearchParams()
  const editId = searchParams.get('edit') || null

  const [allCoa,    setAllCoa]    = useState([])
  const [voucherNo, setVoucherNo] = useState('')
  const [loaded,    setLoaded]    = useState(false)
  const [entryDate, setEntryDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [refNo,     setRefNo]     = useState('')
  const [narration, setNarration] = useState('')

  const [debitLines,  setDebitLines]  = useState([newLine()])
  const [creditLines, setCreditLines] = useState([newLine()])

  const [church,     setChurch]    = useState(null)
  const [showPrint,  setShowPrint] = useState(false)
  const [funds,   setFunds]   = useState([])
  const [fundId,  setFundId]  = useState('')
  const [saving,  setSaving]  = useState(false)
  const [posting, setPosting] = useState(false)

  const accounts = useMemo(() => getPostableAccountsWithPath(allCoa), [allCoa])

  const totalDebit  = debitLines.reduce((s, l)  => s + (parseFloat(l.amount)  || 0), 0)
  const totalCredit = creditLines.reduce((s, l) => s + (parseFloat(l.amount) || 0), 0)
  const diff = Math.abs(totalDebit - totalCredit)
  const isBalanced = totalDebit > 0 && totalCredit > 0 && diff < 0.01
  const hasDebitAccounts  = debitLines.every(l => l.accountId)
  const hasCreditAccounts = creditLines.every(l => l.accountId)
  const isValid = isBalanced && hasDebitAccounts && hasCreditAccounts
  const busy = saving || posting

  useEffect(() => { getChurch().then(setChurch).catch(() => {}) }, [])
  useEffect(() => { getFunds(true).then(setFunds).catch(() => {}) }, [])

  useEffect(() => {
    const promises = [getChartOfAccounts(true), getAccountingSettings()]
    if (editId) promises.push(getJournalEntryWithLines(editId))
    Promise.all(promises).then(async ([coa, s, existing]) => {
      setAllCoa(coa)
      if (editId && existing) {
        setVoucherNo(existing.entry_number)
        setEntryDate(existing.entry_date || new Date().toISOString().slice(0, 10))
        setRefNo(existing.reference_no || '')
        setNarration(existing.narration || '')
        if (existing.fund_id) setFundId(existing.fund_id)
        const dLines = (existing.journal_entry_lines || []).filter(l => Number(l.debit_amount) > 0)
        const cLines = (existing.journal_entry_lines || []).filter(l => Number(l.credit_amount) > 0)
        if (dLines.length > 0) {
          setDebitLines(dLines.map(l => ({ _id: ++_lineId, accountId: l.account_id, accountName: l.chart_of_accounts?.name || '', amount: String(l.debit_amount) })))
        }
        if (cLines.length > 0) {
          setCreditLines(cLines.map(l => ({ _id: ++_lineId, accountId: l.account_id, accountName: l.chart_of_accounts?.name || '', amount: String(l.credit_amount) })))
        }
      } else {
        const fy  = getFY(new Date().toISOString().slice(0, 10))
        const pfx = { Journal: s.accounting_prefix_journal || 'JV' }
        setVoucherNo(await nextEntryNumber(fy, 'Journal', pfx))
      }
      setLoaded(true)
    }).catch(() => { toast('Failed to load data', 'error'); setLoaded(true) })
  }, [])

  function updateLine(setter, idx, field, value, name) {
    setter(prev => prev.map((l, i) => {
      if (i !== idx) return l
      if (field === 'accountId') return { ...l, accountId: value, accountName: name }
      return { ...l, [field]: value }
    }))
  }

  function addLine(setter) { setter(prev => [...prev, newLine()]) }
  function removeLine(setter, idx) { setter(prev => prev.filter((_, i) => i !== idx)) }

  async function handleSave(andPost = false) {
    if (!isValid) return
    const setSt = andPost ? setPosting : setSaving
    setSt(true)
    try {
      const fy = getFY(entryDate)
      const entry = {
        entry_number: voucherNo, entry_date: entryDate, financial_year: fy,
        voucher_type: 'Journal', narration: narration || null, reference_no: refNo || null,
        fund_id: fundId || null,
      }
      const jLines = [
        ...debitLines.map(l => ({ account_id: l.accountId, debit_amount: parseFloat(l.amount), credit_amount: 0, description: narration || null })),
        ...creditLines.map(l => ({ account_id: l.accountId, debit_amount: 0, credit_amount: parseFloat(l.amount), description: narration || null })),
      ]
      let je
      if (editId) {
        je = await updateJournalEntry(editId, entry, jLines, user?.email || 'system')
        toast(`${voucherNo} updated`, 'success')
      } else {
        je = await createJournalEntry(entry, jLines, user?.email || 'system')
      }
      if (andPost) { await postJournalEntry(je.id, user?.email || 'system'); toast(`${voucherNo} posted`, 'success') }
      else if (!editId) { toast(`${voucherNo} saved as draft`, 'success') }
      navigate('/accounting/journal-entries')
    } catch (err) { toast(err.message || 'Failed to save', 'error'); setSt(false) }
  }

  if (!loaded) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 300 }}>
      <Loader2 size={28} style={{ animation: 'spin 0.7s linear infinite', color: 'var(--accent)' }} />
    </div>
  )

  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
        <button onClick={() => navigate(-1)} className="nav-item"
          style={{ background: 'none', border: '1px solid var(--card-border)', borderRadius: 8, cursor: 'pointer', color: 'var(--text-3)', padding: '6px 8px', display: 'flex', alignItems: 'center', width: 'auto', flexShrink: 0 }}>
          <ArrowLeft size={16} />
        </button>
        <div style={{ flex: 1 }}>
          <h1 className="page-title" style={{ marginBottom: 1 }}>{editId ? 'Edit Journal Entry' : 'Journal Entry'}</h1>
          <p className="page-subtitle" style={{ margin: 0 }}>General double-entry posting</p>
        </div>
        <div style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 13, color: ACCENT, background: '#e0f2fe', padding: '4px 10px', borderRadius: 6 }}>
          {voucherNo}
        </div>
        <button onClick={() => setShowPrint(true)} title="Print voucher"
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', background: 'var(--card-bg)', border: '1.5px solid var(--card-border)', borderRadius: 8, cursor: 'pointer', color: 'var(--text-2)', fontSize: 12, fontWeight: 600 }}>
          <Printer size={14} /> Print
        </button>
      </div>

      {/* Voucher meta */}
      <div className="card" style={{ marginBottom: 20, padding: '14px 18px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr 1fr', gap: '10px 16px' }}>
          <div>
            <label className="field-label" style={{ display: 'block', marginBottom: 4 }}>Date *</label>
            <input className="field-input" type="date" value={entryDate} onChange={e => setEntryDate(e.target.value)} disabled={busy} />
          </div>
          <div>
            <label className="field-label" style={{ display: 'block', marginBottom: 4 }}>Narration</label>
            <NarrationInput placeholder="Description of this entry" value={narration} onChange={setNarration} disabled={busy} />
          </div>
          <div>
            <label className="field-label" style={{ display: 'block', marginBottom: 4 }}>Reference No</label>
            <input className="field-input" placeholder="Voucher / cheque no" value={refNo} onChange={e => setRefNo(e.target.value)} disabled={busy} />
          </div>
        </div>
        {funds.length > 0 && (
          <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--card-border)', display: 'flex', alignItems: 'center', gap: 12 }}>
            <label className="field-label" style={{ marginBottom: 0, whiteSpace: 'nowrap' }}>Designated Fund</label>
            <select value={fundId} onChange={e => setFundId(e.target.value)} disabled={busy}
              style={{ height: 32, padding: '0 8px', border: '1.5px solid var(--card-border)', borderRadius: 7, fontSize: 12, background: 'var(--input-bg)', color: fundId ? 'var(--text-1)' : 'var(--text-3)', flex: 1, maxWidth: 280 }}>
              <option value="">— None (General) —</option>
              {funds.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
            {fundId && <span style={{ fontSize: 11, fontWeight: 700, color: funds.find(f => f.id === fundId)?.color || 'var(--accent)' }}>●</span>}
          </div>
        )}
      </div>

      {/* Debit / Credit panels side-by-side */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 14 }}>
        <LinesPanel
          title="Debit (Dr)"
          accentColor="#2563eb"
          lines={debitLines}
          accounts={accounts}
          onChange={(idx, field, val, name) => updateLine(setDebitLines, idx, field, val, name)}
          onAdd={() => addLine(setDebitLines)}
          onRemove={idx => removeLine(setDebitLines, idx)}
          disabled={busy}
          total={totalDebit}
        />
        <LinesPanel
          title="Credit (Cr)"
          accentColor="#16a34a"
          lines={creditLines}
          accounts={accounts}
          onChange={(idx, field, val, name) => updateLine(setCreditLines, idx, field, val, name)}
          onAdd={() => addLine(setCreditLines)}
          onRemove={idx => removeLine(setCreditLines, idx)}
          disabled={busy}
          total={totalCredit}
        />
      </div>

      {/* Balance indicator */}
      <div style={{ marginBottom: 16, padding: '10px 16px', borderRadius: 9, display: 'flex', alignItems: 'center', gap: 12, background: isBalanced ? 'rgba(22,163,74,0.06)' : diff > 0 && totalDebit > 0 ? 'rgba(239,68,68,0.06)' : 'rgba(0,0,0,0.03)', border: `1.5px solid ${isBalanced ? 'rgba(22,163,74,0.25)' : diff > 0 && totalDebit > 0 ? 'rgba(239,68,68,0.2)' : 'var(--card-border)'}` }}>
        {isBalanced
          ? <CheckCircle2 size={16} color="#16a34a" />
          : <FileText size={16} color="var(--text-3)" />}
        <div style={{ flex: 1, display: 'flex', gap: 24, fontSize: 12 }}>
          <span>Debit: <strong style={{ fontFamily: 'monospace' }}>{fmtAmt(totalDebit)}</strong></span>
          <span>Credit: <strong style={{ fontFamily: 'monospace' }}>{fmtAmt(totalCredit)}</strong></span>
          {diff > 0.005 && totalDebit > 0 && (
            <span style={{ color: '#dc2626', fontWeight: 600 }}>Difference: {fmtAmt(diff)}</span>
          )}
        </div>
        {isBalanced && <span style={{ fontSize: 11, fontWeight: 700, color: '#16a34a' }}>Balanced</span>}
      </div>

      {/* Save / Post */}
      <div className="card" style={{ padding: '14px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10 }}>
          <button onClick={() => handleSave(false)} disabled={!isValid || busy}
            style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 18px', background: isValid ? '#e0f2fe' : '#e5e7eb', color: isValid ? ACCENT : '#9ca3af', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: isValid ? 'pointer' : 'not-allowed' }}>
            {saving ? <Loader2 size={14} style={{ animation: 'spin 0.7s linear infinite' }} /> : <Save size={14} />}
            Save Draft
          </button>
          <button onClick={() => handleSave(true)} disabled={!isValid || busy}
            style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 18px', background: isValid ? ACCENT : '#e5e7eb', color: isValid ? '#fff' : '#9ca3af', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: isValid ? 'pointer' : 'not-allowed' }}>
            {posting ? <Loader2 size={14} style={{ animation: 'spin 0.7s linear infinite' }} /> : <CheckSquare size={14} />}
            Post
          </button>
        </div>
      </div>

      <VoucherPrint
        open={showPrint} onClose={() => setShowPrint(false)}
        church={church}
        voucherType="Journal"
        voucherNo={voucherNo}
        date={entryDate}
        refNo={refNo}
        narration={narration}
        rows={[
          ...debitLines.filter(l => l.accountId && parseFloat(l.amount) > 0).map(l => ({
            label: `Dr: ${l.accountName || accounts.find(a => a.id === l.accountId)?.name || l.accountId}`,
            amount: parseFloat(l.amount),
          })),
          ...creditLines.filter(l => l.accountId && parseFloat(l.amount) > 0).map(l => ({
            label: `Cr: ${l.accountName || accounts.find(a => a.id === l.accountId)?.name || l.accountId}`,
            amount: parseFloat(l.amount),
          })),
        ]}
        totalAmount={totalDebit}
      />
    </div>
  )
}
