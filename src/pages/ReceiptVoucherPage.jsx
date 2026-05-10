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
import { PlusCircle, Trash2, Loader2, Save, CheckSquare, ArrowLeft, CheckCircle2 } from 'lucide-react'

// ── Typeahead account picker ──────────────────────────────────────
function AccountPicker({ value, accounts, onChange, placeholder = 'Select account…', disabled = false }) {
  const [query, setQuery] = useState('')
  const [open,  setOpen]  = useState(false)
  const [hi,    setHi]    = useState(0)
  const saved = useRef(value)

  const selected    = useMemo(() => accounts.find(a => a.id === value), [value, accounts])
  const displayName = selected ? selected.name : ''

  const filtered = useMemo(() => {
    if (!open) return []
    const q = query.trim().toLowerCase()
    if (!q) return accounts.slice(0, 15)
    return accounts.filter(a =>
      a.name.toLowerCase().includes(q) || (a.path || '').toLowerCase().includes(q)
    ).slice(0, 12)
  }, [query, open, accounts])

  function onFocus() { saved.current = value; setQuery(''); setOpen(true); setHi(0) }
  function onBlur()  { setTimeout(() => { setOpen(false); if (!value && saved.current) onChange(saved.current) }, 160) }
  function pick(a)   { saved.current = a.id; onChange(a.id); setOpen(false) }

  function onKey(e) {
    if (e.key === 'ArrowDown')             { e.preventDefault(); setHi(h => Math.min(h + 1, filtered.length - 1)) }
    else if (e.key === 'ArrowUp')          { e.preventDefault(); setHi(h => Math.max(h - 1, 0)) }
    else if (e.key === 'Escape')           { setOpen(false) }
    else if (e.key === 'Enter' && open)    { e.preventDefault(); if (filtered[hi]) pick(filtered[hi]); else setOpen(false) }
  }

  return (
    <div style={{ position: 'relative', flex: 1, minWidth: 0 }}>
      <input
        className="field-input"
        value={open ? query : displayName}
        onChange={e => { setQuery(e.target.value); setHi(0) }}
        onFocus={onFocus} onBlur={onBlur} onKeyDown={onKey}
        placeholder={placeholder} disabled={disabled} autoComplete="off"
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
              {a.path && a.path !== a.name && <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 1 }}>{a.path}</div>}
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

  const total          = useMemo(() => lines.reduce((s, l) => s + (parseFloat(l.amount) || 0), 0), [lines])
  const isValid        = cashBankId && lines.some(l => l.account_id && parseFloat(l.amount) > 0)
  const cashBankAcc    = useMemo(() => assetAccounts.find(a => a.id === cashBankId), [assetAccounts, cashBankId])
  const balanced       = total > 0  // debit === credit always by design

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
  function addLine()       { setLines(ls => [...ls, blankLine()]) }
  function removeLine(idx) { setLines(ls => ls.length > 1 ? ls.filter((_, i) => i !== idx) : ls) }

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
      else         { toast.success(`${receiptNo} saved as draft`) }
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
    <div style={{ maxWidth: 820, margin: '0 auto' }}>

      {/* ── Page header ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 22 }}>
        <button onClick={() => navigate(-1)} className="nav-item"
          style={{ background: 'none', border: '1px solid var(--card-border)', borderRadius: 8, cursor: 'pointer', color: 'var(--text-3)', padding: '6px 8px', display: 'flex', alignItems: 'center' }}>
          <ArrowLeft size={16} />
        </button>
        <div style={{ flex: 1 }}>
          <h1 className="page-title" style={{ marginBottom: 2 }}>Receipt Voucher</h1>
          <p className="page-subtitle">Record money received into cash or bank</p>
        </div>
        <div style={{ fontSize: 13, fontWeight: 700, fontFamily: 'monospace', color: 'var(--accent)' }}>{receiptNo}</div>
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

      {/* ── Two-column layout: Cash/Bank | Credit entries ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 14, alignItems: 'start', marginBottom: 20 }}>

        {/* LEFT — Cash / Bank card (DEBIT side) */}
        <div className="card" style={{ padding: '18px 20px', position: 'sticky', top: 80 }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#dc2626', marginBottom: 10 }}>
            Debit — Received Into
          </div>

          {/* Account picker */}
          <AccountPicker
            value={cashBankId}
            accounts={assetAccounts}
            onChange={setCashBankId}
            placeholder="Cash or bank account…"
            disabled={busy}
          />
          {cashBankAcc && (
            <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 5 }}>{cashBankAcc.path}</div>
          )}

          {/* Divider */}
          <div style={{ borderTop: '1px solid var(--card-border)', margin: '16px 0 12px' }} />

          {/* Auto-debit amount display */}
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-3)', marginBottom: 6 }}>
            Debit Amount
            <span style={{ marginLeft: 6, fontSize: 9, color: '#94a3b8', fontWeight: 500, textTransform: 'none', letterSpacing: 0 }}>
              (auto-calculated)
            </span>
          </div>

          <div style={{
            padding: '14px 16px', borderRadius: 10,
            background: balanced ? 'rgba(220,38,38,0.06)' : 'var(--page-bg)',
            border: `2px ${balanced ? 'solid #dc262630' : 'dashed var(--card-border)'}`,
            textAlign: 'center',
            transition: 'all 0.25s ease',
          }}>
            {balanced ? (
              <div style={{ fontFamily: 'monospace', fontWeight: 900, fontSize: 22, color: '#dc2626', letterSpacing: '0.02em' }}>
                {fmtAmt(total)}
              </div>
            ) : (
              <div style={{ fontSize: 12, color: 'var(--text-3)', fontStyle: 'italic' }}>
                Enter credit amounts →
              </div>
            )}
          </div>

          {/* Balance indicator */}
          {balanced && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 12, padding: '8px 12px', borderRadius: 8, background: 'rgba(22,163,74,0.08)', border: '1px solid rgba(22,163,74,0.2)' }}>
              <CheckCircle2 size={14} color="#16a34a" />
              <span style={{ fontSize: 12, fontWeight: 700, color: '#16a34a' }}>Entry Balanced</span>
            </div>
          )}
        </div>

        {/* RIGHT — Credit entries */}
        <div className="card" style={{ padding: '18px 20px' }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#16a34a', marginBottom: 12 }}>
            Credit Entries — Income / Other Accounts
          </div>

          {/* Column headers */}
          <div style={{ display: 'grid', gridTemplateColumns: '20px 1fr 130px 110px 30px', gap: 8, marginBottom: 6 }}>
            {['#', 'Account', 'Description', 'Amount (₹)', ''].map(h => (
              <span key={h} style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-3)' }}>{h}</span>
            ))}
          </div>

          {/* Credit lines */}
          {lines.map((line, idx) => (
            <div key={line._key}
              style={{ display: 'grid', gridTemplateColumns: '20px 1fr 130px 110px 30px', gap: 8, marginBottom: 8, alignItems: 'center' }}>
              <span style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 600, textAlign: 'right' }}>{idx + 1}</span>
              <AccountPicker
                value={line.account_id}
                accounts={creditAccounts}
                onChange={id => updateLine(idx, 'account_id', id)}
                placeholder="Select account…"
                disabled={busy}
              />
              <input className="field-input" placeholder="Description"
                value={line.description} onChange={e => updateLine(idx, 'description', e.target.value)} disabled={busy} />
              <input className="field-input" type="number" step="0.01" min="0" placeholder="0.00"
                value={line.amount} onChange={e => updateLine(idx, 'amount', e.target.value)}
                disabled={busy}
                style={{ textAlign: 'right', fontFamily: 'monospace', fontWeight: 700, color: '#16a34a' }} />
              <button onClick={() => removeLine(idx)} disabled={lines.length === 1 || busy} className="nav-item"
                style={{ background: 'none', border: 'none', padding: 4, borderRadius: 6, display: 'flex', alignItems: 'center',
                  cursor: lines.length === 1 ? 'not-allowed' : 'pointer',
                  color: lines.length === 1 ? 'var(--text-3)' : '#dc2626' }}>
                <Trash2 size={14} />
              </button>
            </div>
          ))}

          {/* Add line + running total */}
          <div style={{ display: 'flex', alignItems: 'center', marginTop: 10, gap: 12 }}>
            <button onClick={addLine} disabled={busy}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', borderRadius: 8,
                border: '1.5px dashed var(--card-border)', background: 'transparent',
                color: 'var(--accent)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
              <PlusCircle size={13} /> Add Line
            </button>
            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-3)' }}>
                Total Credit
              </span>
              <span style={{ fontFamily: 'monospace', fontWeight: 900, fontSize: 18, color: total > 0 ? '#16a34a' : 'var(--text-3)' }}>
                {total > 0 ? fmtAmt(total) : '—'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Action buttons ── */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
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
