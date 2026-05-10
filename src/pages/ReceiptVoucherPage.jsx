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

// ── Typeahead account picker ──────────────────────────────────────
function AccountPicker({ value, accounts, onChange, placeholder = 'Select account…', disabled = false }) {
  const [query,  setQuery]  = useState('')
  const [open,   setOpen]   = useState(false)
  const [hi,     setHi]     = useState(0)
  const saved = useRef(value)

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
  function onBlur()  { setTimeout(() => { setOpen(false); if (!value && saved.current) onChange(saved.current) }, 160) }
  function pick(a)   { saved.current = a.id; onChange(a.id); setOpen(false) }

  function onKey(e) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setHi(h => Math.min(h + 1, filtered.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHi(h => Math.max(h - 1, 0)) }
    else if (e.key === 'Escape') { setOpen(false) }
    else if (e.key === 'Enter' && open) { e.preventDefault(); if (filtered[hi]) pick(filtered[hi]); else setOpen(false) }
  }

  return (
    <div style={{ position: 'relative', flex: 1, minWidth: 0 }}>
      <input
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

const blankLine = () => ({ _key: crypto.randomUUID(), account_id: '', description: '', amount: '' })

// ── Column header ─────────────────────────────────────────────────
const COL = '1fr 150px 150px 32px'
function ColHead({ children, align = 'left', color }) {
  return (
    <span style={{
      fontSize: 11, fontWeight: 700, letterSpacing: '0.08em',
      textTransform: 'uppercase', color: color || 'var(--text-3)',
      textAlign: align, display: 'block',
    }}>{children}</span>
  )
}

// ── Read-only amount cell ─────────────────────────────────────────
function AmtCell({ value, color = 'var(--text-1)' }) {
  return (
    <div style={{ textAlign: 'right', fontFamily: 'monospace', fontWeight: 800, fontSize: 14, color, paddingRight: 4 }}>
      {value > 0 ? fmtAmt(value) : <span style={{ color: 'var(--text-3)', fontWeight: 400 }}>—</span>}
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────
export default function ReceiptVoucherPage() {
  const { user }  = useAuth()
  const navigate  = useNavigate()
  const toast     = useToast()

  const [allAccounts,  setAllAccounts]  = useState([])
  const [receiptNo,    setReceiptNo]    = useState('')
  const [entryDate,    setEntryDate]    = useState(() => new Date().toISOString().slice(0, 10))
  const [receivedFrom, setReceivedFrom] = useState('')
  const [refNo,        setRefNo]        = useState('')
  const [cashBankId,   setCashBankId]   = useState('')
  const [lines,        setLines]        = useState(() => [blankLine(), blankLine()])
  const [narration,    setNarration]    = useState('')
  const [saving,       setSaving]       = useState(false)
  const [posting,      setPosting]      = useState(false)
  const [loaded,       setLoaded]       = useState(false)

  const assetAccounts  = useMemo(() => getPostableAccountsWithPath(allAccounts).filter(a => a.account_type === 'Asset'), [allAccounts])
  const creditAccounts = useMemo(() => getPostableAccountsWithPath(allAccounts), [allAccounts])

  // Total of all credit lines = automatically becomes the debit to cash/bank
  const total   = useMemo(() => lines.reduce((s, l) => s + (parseFloat(l.amount) || 0), 0), [lines])
  const isValid = cashBankId && lines.some(l => l.account_id && parseFloat(l.amount) > 0)

  const cashBankAccount = useMemo(() => assetAccounts.find(a => a.id === cashBankId), [assetAccounts, cashBankId])

  useEffect(() => {
    Promise.all([getChartOfAccounts(true), getAccountingSettings()])
      .then(async ([accounts, s]) => {
        setAllAccounts(accounts)
        const fy  = getFY(new Date().toISOString().slice(0, 10))
        const pfx = { Receipt: s.accounting_prefix_receipt || 'RV' }
        setReceiptNo(await nextEntryNumber(fy, 'Receipt', pfx))
        if (s.accounting_default_cash_id) setCashBankId(s.accounting_default_cash_id)
        setLoaded(true)
      })
      .catch(() => { toast.error('Failed to load accounts'); setLoaded(true) })
  }, [])

  function updateLine(idx, field, val) { setLines(ls => ls.map((l, i) => i === idx ? { ...l, [field]: val } : l)) }
  function addLine()        { setLines(ls => [...ls, blankLine()]) }
  function removeLine(idx)  { setLines(ls => ls.length > 1 ? ls.filter((_, i) => i !== idx) : ls) }

  async function handleSave(andPost = false) {
    if (!isValid) return
    const setSt = andPost ? setPosting : setSaving
    setSt(true)
    try {
      const fy         = getFY(entryDate)
      const validLines = lines.filter(l => l.account_id && parseFloat(l.amount) > 0)
      const entry = {
        entry_number: receiptNo, entry_date: entryDate, financial_year: fy,
        voucher_type: 'Receipt', narration: narration || null, reference_no: refNo || null,
      }
      const jLines = [
        { account_id: cashBankId, debit_amount: total, credit_amount: 0, description: receivedFrom || null },
        ...validLines.map(l => ({ account_id: l.account_id, debit_amount: 0, credit_amount: parseFloat(l.amount), description: l.description || null })),
      ]
      const je = await createJournalEntry(entry, jLines, user?.email || 'system')
      if (andPost) { await postJournalEntry(je.id, user?.email || 'system'); toast.success(`${receiptNo} posted`) }
      else { toast.success(`${receiptNo} saved as draft`) }
      navigate('/accounting/journal-entries')
    } catch (err) { toast.error(err.message || 'Failed to save'); setSt(false) }
  }

  if (!loaded) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 300 }}>
      <Loader2 size={28} style={{ animation: 'spin 0.7s linear infinite', color: 'var(--accent)' }} />
    </div>
  )

  const busy = saving || posting

  return (
    <div style={{ maxWidth: 860, margin: '0 auto' }}>

      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <button onClick={() => navigate(-1)} className="nav-item"
          style={{ background: 'none', border: '1px solid var(--card-border)', borderRadius: 8, cursor: 'pointer', color: 'var(--text-3)', padding: '6px 8px', display: 'flex', alignItems: 'center' }}>
          <ArrowLeft size={16} />
        </button>
        <div>
          <h1 className="page-title" style={{ marginBottom: 2 }}>Receipt Voucher</h1>
          <p className="page-subtitle">Record money received into cash or bank</p>
        </div>
        <div style={{ marginLeft: 'auto', fontSize: 13, fontWeight: 700, fontFamily: 'monospace', color: 'var(--accent)' }}>
          {receiptNo}
        </div>
      </div>

      {/* ── Voucher metadata ── */}
      <div className="card" style={{ marginBottom: 14, padding: '16px 20px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '10px 16px' }}>
          <div>
            <label className="field-label" style={{ display: 'block', marginBottom: 4 }}>Date *</label>
            <input className="field-input" type="date" value={entryDate} onChange={e => setEntryDate(e.target.value)} disabled={busy} />
          </div>
          <div>
            <label className="field-label" style={{ display: 'block', marginBottom: 4 }}>Received From</label>
            <input className="field-input" placeholder="Donor / member name" value={receivedFrom} onChange={e => setReceivedFrom(e.target.value)} disabled={busy} />
          </div>
          <div>
            <label className="field-label" style={{ display: 'block', marginBottom: 4 }}>Reference No</label>
            <input className="field-input" placeholder="Cheque / UPI ref." value={refNo} onChange={e => setRefNo(e.target.value)} disabled={busy} />
          </div>
          <div>
            <label className="field-label" style={{ display: 'block', marginBottom: 4 }}>Narration</label>
            <input className="field-input" placeholder="Brief description" value={narration} onChange={e => setNarration(e.target.value)} disabled={busy} />
          </div>
        </div>
      </div>

      {/* ── Ledger table ── */}
      <div className="card" style={{ marginBottom: 20, overflow: 'hidden' }}>

        {/* Table column headers */}
        <div style={{ display: 'grid', gridTemplateColumns: COL, gap: 0, padding: '10px 20px 8px', background: 'var(--page-bg)', borderBottom: '2px solid var(--card-border)' }}>
          <ColHead>Account</ColHead>
          <ColHead align="right" color="#dc2626">Debit (₹)</ColHead>
          <ColHead align="right" color="#16a34a">Credit (₹)</ColHead>
          <span />
        </div>

        {/* ── DEBIT ROW: Cash / Bank (step 1) ── */}
        <div style={{ borderBottom: '1px solid var(--card-border)', background: 'rgba(220,38,38,0.03)' }}>
          <div style={{ padding: '6px 20px 4px', fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#dc2626' }}>
            Received Into — Cash / Bank Account
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: COL, gap: 8, padding: '4px 20px 12px', alignItems: 'center' }}>
            <AccountPicker
              value={cashBankId}
              accounts={assetAccounts}
              onChange={setCashBankId}
              placeholder="Select cash or bank account…"
              disabled={busy}
            />
            {/* Debit: auto-calculated — blank when no credits yet */}
            <div style={{
              textAlign: 'right', fontFamily: 'monospace', fontWeight: 800, fontSize: 15,
              color: total > 0 ? '#dc2626' : 'var(--text-3)',
              paddingRight: 4,
              borderBottom: total > 0 ? '2px solid #dc262640' : '2px dashed var(--card-border)',
              paddingBottom: 2,
            }}>
              {total > 0 ? fmtAmt(total) : ''}
            </div>
            {/* Credit: not applicable */}
            <div style={{ textAlign: 'right', color: 'var(--text-3)', fontSize: 12, paddingRight: 4 }}>—</div>
            <div />
          </div>
          {cashBankAccount && (
            <div style={{ padding: '0 20px 8px', fontSize: 10, color: 'var(--text-3)' }}>
              {cashBankAccount.path}
            </div>
          )}
        </div>

        {/* ── CREDIT ROWS (step 2) ── */}
        <div style={{ borderBottom: '1px solid var(--card-border)' }}>
          <div style={{ padding: '6px 20px 4px', fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#16a34a' }}>
            Credit Entries — Income / Other Accounts
          </div>

          {lines.map((line, idx) => (
            <div key={line._key} style={{ display: 'grid', gridTemplateColumns: COL, gap: 8, padding: '4px 20px', alignItems: 'center', borderTop: idx > 0 ? '1px solid var(--card-border)' : 'none' }}>
              {/* Account + description stacked in account column */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                <span style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 600, minWidth: 16, textAlign: 'right', flexShrink: 0 }}>{idx + 1}</span>
                <AccountPicker
                  value={line.account_id}
                  accounts={creditAccounts}
                  onChange={id => updateLine(idx, 'account_id', id)}
                  placeholder="Select account…"
                  disabled={busy}
                />
                <input
                  className="field-input"
                  placeholder="Description"
                  value={line.description}
                  onChange={e => updateLine(idx, 'description', e.target.value)}
                  disabled={busy}
                  style={{ width: 140, flexShrink: 0 }}
                />
              </div>

              {/* Debit: not applicable for credit entries */}
              <div style={{ textAlign: 'right', color: 'var(--text-3)', fontSize: 12, paddingRight: 4 }}>—</div>

              {/* Credit: amount input */}
              <input
                className="field-input"
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                value={line.amount}
                onChange={e => updateLine(idx, 'amount', e.target.value)}
                disabled={busy}
                style={{ textAlign: 'right', fontFamily: 'monospace', fontWeight: 700, color: '#16a34a' }}
              />

              <button onClick={() => removeLine(idx)} disabled={lines.length === 1 || busy}
                className="nav-item"
                style={{
                  background: 'none', border: 'none', padding: 4, borderRadius: 6,
                  cursor: lines.length === 1 ? 'not-allowed' : 'pointer',
                  color: lines.length === 1 ? 'var(--text-3)' : '#dc2626',
                  display: 'flex', alignItems: 'center',
                }}>
                <Trash2 size={14} />
              </button>
            </div>
          ))}

          <div style={{ padding: '8px 20px 12px' }}>
            <button onClick={addLine} disabled={busy}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '6px 14px', borderRadius: 8,
                border: '1.5px dashed var(--card-border)',
                background: 'transparent', color: 'var(--accent)',
                fontSize: 12, fontWeight: 600, cursor: 'pointer',
              }}>
              <PlusCircle size={13} /> Add Line
            </button>
          </div>
        </div>

        {/* ── TOTAL row ── */}
        <div style={{ display: 'grid', gridTemplateColumns: COL, gap: 8, padding: '12px 20px', background: 'var(--page-bg)' }}>
          <span style={{ fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-2)', alignSelf: 'center' }}>
            Total
            {total > 0 && (
              <span style={{ marginLeft: 8, fontSize: 10, fontWeight: 600, color: '#16a34a' }}>✓ Balanced</span>
            )}
          </span>
          {/* Total Debit */}
          <div style={{ textAlign: 'right', fontFamily: 'monospace', fontWeight: 900, fontSize: 16, color: total > 0 ? '#dc2626' : 'var(--text-3)', paddingRight: 4 }}>
            {total > 0 ? fmtAmt(total) : '—'}
          </div>
          {/* Total Credit */}
          <div style={{ textAlign: 'right', fontFamily: 'monospace', fontWeight: 900, fontSize: 16, color: total > 0 ? '#16a34a' : 'var(--text-3)', paddingRight: 4 }}>
            {total > 0 ? fmtAmt(total) : '—'}
          </div>
          <div />
        </div>
      </div>

      {/* ── Action buttons ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10 }}>
        <button onClick={() => handleSave(false)} disabled={!isValid || busy} className="btn btn-secondary"
          style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {saving ? <Loader2 size={14} style={{ animation: 'spin 0.7s linear infinite' }} /> : <Save size={14} />}
          Save Draft
        </button>
        <button onClick={() => handleSave(true)} disabled={!isValid || busy} className="btn btn-primary"
          style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {posting ? <Loader2 size={14} style={{ animation: 'spin 0.7s linear infinite' }} /> : <CheckSquare size={14} />}
          Post
        </button>
      </div>

    </div>
  )
}
