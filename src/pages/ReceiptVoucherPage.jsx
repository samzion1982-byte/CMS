import { useState, useEffect, useRef, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import { useToast } from '../lib/toast'
import {
  getFY, fmtAmt,
  getChartOfAccounts, getPostableAccountsWithPath,
  nextEntryNumber, getAccountingSettings,
  createJournalEntry, postJournalEntry,
  TYPE_COLOR,
} from '../lib/accountingLib'
import { PlusCircle, Trash2, Loader2, Save, CheckSquare, ArrowLeft } from 'lucide-react'

// ── Inline typeahead account picker ──────────────────────────────
function AccountPicker({ value, accounts, onChange, placeholder = 'Select account…', disabled = false, inputRef: extRef }) {
  const [query,   setQuery]   = useState('')
  const [open,    setOpen]    = useState(false)
  const [hi,      setHi]      = useState(0)
  const localRef = useRef(null)
  const ref      = extRef || localRef
  const saved    = useRef(value)

  const selected    = useMemo(() => accounts.find(a => a.id === value), [value, accounts])
  const displayName = selected ? selected.name : ''

  const filtered = useMemo(() => {
    if (!open) return []
    const q = query.trim().toLowerCase()
    if (!q) return accounts.slice(0, 15)
    return accounts.filter(a =>
      a.name.toLowerCase().includes(q) ||
      (a.path || '').toLowerCase().includes(q)
    ).slice(0, 12)
  }, [query, open, accounts])

  function onFocus() { saved.current = value; setQuery(''); setOpen(true); setHi(0) }

  function onBlur() {
    setTimeout(() => {
      setOpen(false)
      if (!value && saved.current) onChange(saved.current)
    }, 160)
  }

  function pick(a) { saved.current = a.id; onChange(a.id); setOpen(false) }

  function onKey(e) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setHi(h => Math.min(h + 1, filtered.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHi(h => Math.max(h - 1, 0)) }
    else if (e.key === 'Escape') { setOpen(false) }
    else if (e.key === 'Enter' && open) {
      e.preventDefault()
      if (filtered[hi]) pick(filtered[hi])
      else setOpen(false)
    }
  }

  return (
    <div style={{ position: 'relative' }}>
      <input
        ref={ref}
        className="field-input"
        value={open ? query : displayName}
        onChange={e => { setQuery(e.target.value); setHi(0) }}
        onFocus={onFocus}
        onBlur={onBlur}
        onKeyDown={onKey}
        placeholder={placeholder}
        disabled={disabled}
        autoComplete="off"
      />
      {open && filtered.length > 0 && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 300,
          background: 'var(--card-bg)', border: '1px solid var(--card-border)',
          borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
          maxHeight: 220, overflowY: 'auto', marginTop: 2,
        }}>
          {filtered.map((a, i) => (
            <div key={a.id} onMouseDown={() => pick(a)} style={{
              padding: '7px 12px', cursor: 'pointer',
              background: i === hi ? 'var(--accent-subtle)' : 'transparent',
              borderBottom: '1px solid var(--card-border)',
            }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>{a.name}</div>
              {a.path && a.path !== a.name && (
                <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 1 }}>{a.path}</div>
              )}
              <span style={{
                fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 4, marginTop: 2,
                background: TYPE_COLOR[a.account_type]?.bg, color: TYPE_COLOR[a.account_type]?.text,
                display: 'inline-block',
              }}>{a.account_type}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Blank credit line factory ─────────────────────────────────────
const blankLine = () => ({ _key: crypto.randomUUID(), account_id: '', description: '', amount: '' })

// ── Section header ────────────────────────────────────────────────
function SectionHead({ color, label }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
      <div style={{ width: 5, height: 18, borderRadius: 3, background: color, flexShrink: 0 }} />
      <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.09em', textTransform: 'uppercase', color: 'var(--text-2)' }}>
        {label}
      </span>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────
export default function ReceiptVoucherPage() {
  const { user }  = useAuth()
  const navigate  = useNavigate()
  const toast     = useToast()

  const [allAccounts,   setAllAccounts]   = useState([])
  const [settings,      setSettings]      = useState({})
  const [receiptNo,     setReceiptNo]     = useState('')
  const [entryDate,     setEntryDate]     = useState(() => new Date().toISOString().slice(0, 10))
  const [receivedFrom,  setReceivedFrom]  = useState('')
  const [refNo,         setRefNo]         = useState('')
  const [cashBankId,    setCashBankId]    = useState('')
  const [lines,         setLines]         = useState(() => [blankLine(), blankLine()])
  const [narration,     setNarration]     = useState('')
  const [saving,        setSaving]        = useState(false)
  const [posting,       setPosting]       = useState(false)
  const [loaded,        setLoaded]        = useState(false)

  // Asset accounts for the "Received Into" picker
  const assetAccounts = useMemo(
    () => getPostableAccountsWithPath(allAccounts).filter(a => a.account_type === 'Asset'),
    [allAccounts]
  )

  // All postable accounts for credit lines
  const creditAccounts = useMemo(
    () => getPostableAccountsWithPath(allAccounts),
    [allAccounts]
  )

  const total   = useMemo(() => lines.reduce((s, l) => s + (parseFloat(l.amount) || 0), 0), [lines])
  const isValid = cashBankId && lines.some(l => l.account_id && parseFloat(l.amount) > 0)

  useEffect(() => {
    Promise.all([getChartOfAccounts(true), getAccountingSettings()])
      .then(async ([accounts, s]) => {
        setAllAccounts(accounts)
        setSettings(s)
        const fy  = getFY(new Date().toISOString().slice(0, 10))
        const pfx = { Receipt: s.accounting_prefix_receipt || 'RV' }
        setReceiptNo(await nextEntryNumber(fy, 'Receipt', pfx))
        if (s.accounting_default_cash_id) setCashBankId(s.accounting_default_cash_id)
        setLoaded(true)
      })
      .catch(() => { toast.error('Failed to load accounts'); setLoaded(true) })
  }, [])

  function updateLine(idx, field, val) {
    setLines(ls => ls.map((l, i) => i === idx ? { ...l, [field]: val } : l))
  }

  function addLine() { setLines(ls => [...ls, blankLine()]) }

  function removeLine(idx) {
    setLines(ls => ls.length > 1 ? ls.filter((_, i) => i !== idx) : ls)
  }

  async function handleSave(andPost = false) {
    if (!isValid) return
    const setSt = andPost ? setPosting : setSaving
    setSt(true)
    try {
      const fy         = getFY(entryDate)
      const validLines = lines.filter(l => l.account_id && parseFloat(l.amount) > 0)
      const entry = {
        entry_number:   receiptNo,
        entry_date:     entryDate,
        financial_year: fy,
        voucher_type:   'Receipt',
        narration:      narration || null,
        reference_no:   refNo     || null,
      }
      const jLines = [
        // Debit: cash/bank account receives the total
        { account_id: cashBankId, debit_amount: total, credit_amount: 0, description: receivedFrom || null },
        // Credit: each income line
        ...validLines.map(l => ({
          account_id:    l.account_id,
          debit_amount:  0,
          credit_amount: parseFloat(l.amount),
          description:   l.description || null,
        })),
      ]
      const je = await createJournalEntry(entry, jLines, user?.email || 'system')
      if (andPost) {
        await postJournalEntry(je.id, user?.email || 'system')
        toast.success(`${receiptNo} posted successfully`)
      } else {
        toast.success(`${receiptNo} saved as draft`)
      }
      navigate('/accounting/journal-entries')
    } catch (err) {
      toast.error(err.message || 'Failed to save receipt')
      setSt(false)
    }
  }

  if (!loaded) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 300 }}>
        <Loader2 size={28} style={{ animation: 'spin 0.7s linear infinite', color: 'var(--accent)' }} />
      </div>
    )
  }

  const busy = saving || posting

  return (
    <div style={{ maxWidth: 820, margin: '0 auto' }}>

      {/* ── Page header ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <button onClick={() => navigate(-1)} className="nav-item"
          style={{ background: 'none', border: '1px solid var(--card-border)', borderRadius: 8, cursor: 'pointer', color: 'var(--text-3)', padding: '6px 8px', display: 'flex', alignItems: 'center' }}>
          <ArrowLeft size={16} />
        </button>
        <div>
          <h1 className="page-title" style={{ marginBottom: 2 }}>Receipt Voucher</h1>
          <p className="page-subtitle">Record money received into cash or bank</p>
        </div>
      </div>

      {/* ── Section 1: Voucher metadata ── */}
      <div className="card" style={{ marginBottom: 14, padding: '18px 22px' }}>
        <SectionHead color="var(--accent)" label="Voucher Details" />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 20px' }}>
          <div>
            <label className="field-label" style={{ display: 'block', marginBottom: 5 }}>Receipt No</label>
            <input className="field-input" value={receiptNo} readOnly
              style={{ fontFamily: 'monospace', fontWeight: 700, cursor: 'default', opacity: 0.7 }} />
          </div>
          <div>
            <label className="field-label" style={{ display: 'block', marginBottom: 5 }}>
              Date <span style={{ color: '#dc2626' }}>*</span>
            </label>
            <input className="field-input" type="date" value={entryDate}
              onChange={e => setEntryDate(e.target.value)} disabled={busy} />
          </div>
          <div>
            <label className="field-label" style={{ display: 'block', marginBottom: 5 }}>Received From</label>
            <input className="field-input" placeholder="Donor / member name (optional)"
              value={receivedFrom} onChange={e => setReceivedFrom(e.target.value)} disabled={busy} />
          </div>
          <div>
            <label className="field-label" style={{ display: 'block', marginBottom: 5 }}>Reference No</label>
            <input className="field-input" placeholder="Cheque no., UPI ref., etc."
              value={refNo} onChange={e => setRefNo(e.target.value)} disabled={busy} />
          </div>
        </div>
      </div>

      {/* ── Section 2: Cash / Bank account ── */}
      <div className="card" style={{ marginBottom: 14, padding: '18px 22px' }}>
        <SectionHead color="#16a34a" label="Received Into — Cash / Bank Account" />
        <AccountPicker
          value={cashBankId}
          accounts={assetAccounts}
          onChange={setCashBankId}
          placeholder="Select the cash or bank account that received this money…"
          disabled={busy}
        />
        {cashBankId && (() => {
          const acc = assetAccounts.find(a => a.id === cashBankId)
          return acc ? (
            <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text-3)', display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 4, background: TYPE_COLOR.Asset?.bg, color: TYPE_COLOR.Asset?.text }}>Asset</span>
              {acc.path}
            </div>
          ) : null
        })()}
      </div>

      {/* ── Section 3: Credit entries ── */}
      <div className="card" style={{ marginBottom: 14, padding: '18px 22px' }}>
        <SectionHead color="#2563eb" label="Credit Entries — Income / Other Accounts" />

        {/* Column headers */}
        <div style={{ display: 'grid', gridTemplateColumns: '22px 1fr 180px 110px 30px', gap: 8, marginBottom: 6, padding: '0 2px' }}>
          {['#', 'Account', 'Description', 'Amount (₹)', ''].map(h => (
            <span key={h} style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-3)' }}>{h}</span>
          ))}
        </div>

        {/* Credit line rows */}
        {lines.map((line, idx) => (
          <div key={line._key} style={{ display: 'grid', gridTemplateColumns: '22px 1fr 180px 110px 30px', gap: 8, marginBottom: 8, alignItems: 'center' }}>
            <span style={{ fontSize: 12, color: 'var(--text-3)', textAlign: 'center', fontWeight: 600, paddingTop: 2 }}>{idx + 1}</span>
            <AccountPicker
              value={line.account_id}
              accounts={creditAccounts}
              onChange={id => updateLine(idx, 'account_id', id)}
              placeholder="Select account…"
              disabled={busy}
            />
            <input
              className="field-input"
              placeholder="Description (optional)"
              value={line.description}
              onChange={e => updateLine(idx, 'description', e.target.value)}
              disabled={busy}
            />
            <input
              className="field-input"
              type="number"
              step="0.01"
              min="0"
              placeholder="0.00"
              value={line.amount}
              onChange={e => updateLine(idx, 'amount', e.target.value)}
              disabled={busy}
              style={{ textAlign: 'right', fontFamily: 'monospace', fontWeight: 700 }}
            />
            <button onClick={() => removeLine(idx)} disabled={lines.length === 1 || busy}
              className="nav-item"
              style={{
                background: 'none', border: 'none', padding: '4px',
                cursor: lines.length === 1 ? 'not-allowed' : 'pointer',
                color: lines.length === 1 ? 'var(--text-3)' : '#dc2626',
                borderRadius: 6, display: 'flex', alignItems: 'center',
              }}>
              <Trash2 size={14} />
            </button>
          </div>
        ))}

        <button onClick={addLine} disabled={busy}
          style={{
            display: 'flex', alignItems: 'center', gap: 6, marginTop: 6,
            padding: '7px 14px', borderRadius: 8,
            border: '1.5px dashed var(--card-border)',
            background: 'transparent', color: 'var(--accent)',
            fontSize: 12, fontWeight: 600, cursor: 'pointer',
          }}>
          <PlusCircle size={14} /> Add Line
        </button>
      </div>

      {/* ── Section 4: Narration ── */}
      <div className="card" style={{ marginBottom: 20, padding: '18px 22px' }}>
        <SectionHead color="var(--text-3)" label="Narration" />
        <textarea
          className="field-input"
          rows={2}
          placeholder="Brief description of this receipt…"
          value={narration}
          onChange={e => setNarration(e.target.value)}
          disabled={busy}
          style={{ height: 'auto', padding: '8px 10px', resize: 'vertical' }}
        />
      </div>

      {/* ── Footer: Total + buttons ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <div style={{ flex: 1, display: 'flex', alignItems: 'baseline', gap: 10 }}>
          <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-3)' }}>
            Total
          </span>
          <span style={{ fontSize: 24, fontWeight: 800, fontFamily: 'monospace', color: total > 0 ? 'var(--text-1)' : 'var(--text-3)' }}>
            {fmtAmt(total)}
          </span>
        </div>

        <button
          onClick={() => handleSave(false)}
          disabled={!isValid || busy}
          className="btn btn-secondary"
          style={{ display: 'flex', alignItems: 'center', gap: 6 }}
        >
          {saving ? <Loader2 size={14} style={{ animation: 'spin 0.7s linear infinite' }} /> : <Save size={14} />}
          Save Draft
        </button>

        <button
          onClick={() => handleSave(true)}
          disabled={!isValid || busy}
          className="btn btn-primary"
          style={{ display: 'flex', alignItems: 'center', gap: 6 }}
        >
          {posting ? <Loader2 size={14} style={{ animation: 'spin 0.7s linear infinite' }} /> : <CheckSquare size={14} />}
          Post
        </button>
      </div>

    </div>
  )
}
