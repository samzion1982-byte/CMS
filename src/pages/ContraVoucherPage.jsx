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
  Banknote, Landmark, ChevronRight, Pencil, ArrowLeftRight,
} from 'lucide-react'

function norm(s)    { return s.toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim() }
function compact(s) { return s.toLowerCase().replace(/[^a-z0-9]/g, '') }
function matchAcct(name, q) {
  if (!q) return true
  const nl = name.toLowerCase(), qn = norm(q), nc = compact(name), qc = compact(q)
  if (nl.includes(q) || norm(name).includes(qn) || nc.includes(qc)) return true
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
    matched.sort((a, b) => (compact(a.name).startsWith(compact(q)) ? 0 : 1) - (compact(b.name).startsWith(compact(q)) ? 0 : 1))
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
        placeholder={placeholder} disabled={disabled} autoComplete="off" />
      {open && filtered.length > 0 && (
        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 300, background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.18)', maxHeight: 220, overflowY: 'auto', marginTop: 2 }}>
          {filtered.map((a, i) => (
            <div key={a.id} onMouseDown={() => pick(a)} style={{ padding: '8px 12px', cursor: 'pointer', background: i === hi ? 'var(--accent-subtle)' : 'transparent', borderBottom: '1px solid var(--card-border)' }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>{a.name}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// classify account for icon
function acctIcon(name, hov) {
  if (/bank/i.test(name)) return <Landmark size={16} color={hov ? '#fff' : '#2563eb'} />
  return <Banknote size={16} color={hov ? '#fff' : '#16a34a'} />
}
function acctBg(name) {
  return /bank/i.test(name) ? 'rgba(37,99,235,0.12)' : 'rgba(22,163,74,0.12)'
}

function AccCard({ acc, onClick }) {
  const [hov, setHov] = useState(false)
  return (
    <button onClick={onClick} className="no-lift"
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderRadius: 8, border: '1px solid var(--card-border)', background: hov ? 'var(--text-1)' : 'var(--card-bg)', cursor: 'pointer', textAlign: 'left', width: '100%' }}>
      <div style={{ width: 28, height: 28, borderRadius: 7, background: hov ? 'rgba(255,255,255,0.12)' : acctBg(acc.name), display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        {acctIcon(acc.name, hov)}
      </div>
      <div style={{ flex: 1, fontSize: 12, fontWeight: 600, color: hov ? '#fff' : 'var(--text-1)' }}>{acc.name}</div>
      <ChevronRight size={13} color={hov ? 'rgba(255,255,255,0.6)' : 'var(--text-3)'} />
    </button>
  )
}

const ACCENT = '#7c3aed'

export default function ContraVoucherPage() {
  const { user }   = useAuth()
  const navigate   = useNavigate()
  const toast      = useToast()
  const [searchParams] = useSearchParams()
  const editId = searchParams.get('edit') || null

  const [allCoa,        setAllCoa]        = useState([])
  const [voucherNo,     setVoucherNo]     = useState('')
  const [loaded,        setLoaded]        = useState(false)
  const [entryDate,     setEntryDate]     = useState(() => new Date().toISOString().slice(0, 10))
  const [refNo,         setRefNo]         = useState('')
  const [narration,     setNarration]     = useState('')

  const [step,          setStep]          = useState(1)
  const [fromId,        setFromId]        = useState('')   // credited (money leaves)
  const [fromLabel,     setFromLabel]     = useState('')
  const [toId,          setToId]          = useState('')   // debited (money arrives)
  const [toLabel,       setToLabel]       = useState('')
  const [amount,        setAmount]        = useState('')

  const [saving,  setSaving]  = useState(false)
  const [posting, setPosting] = useState(false)

  const assetAccounts = useMemo(() => getPostableAccountsWithPath(allCoa).filter(a => a.account_type === 'Asset'), [allCoa])

  const isValid = fromId && toId && fromId !== toId && parseFloat(amount) > 0
  const busy    = saving || posting

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
        const debitLine  = existing.journal_entry_lines?.find(l => Number(l.debit_amount)  > 0)
        const creditLine = existing.journal_entry_lines?.find(l => Number(l.credit_amount) > 0)
        if (debitLine)  { setToId(debitLine.account_id);    setToLabel(debitLine.chart_of_accounts?.name || '') }
        if (creditLine) { setFromId(creditLine.account_id); setFromLabel(creditLine.chart_of_accounts?.name || '') }
        setAmount(String(existing.total_debit || ''))
        setStep(3)
      } else {
        const fy  = getFY(new Date().toISOString().slice(0, 10))
        const pfx = { Contra: s.accounting_prefix_contra || 'CT' }
        setVoucherNo(await nextEntryNumber(fy, 'Contra', pfx))
      }
      setLoaded(true)
    }).catch(() => { toast('Failed to load data', 'error'); setLoaded(true) })
  }, [])

  function goBack() { if (step === 3) setStep(2); else if (step === 2) setStep(1) }

  function chooseFrom(id, name) { setFromId(id); setFromLabel(name); setStep(2) }
  function chooseTo(id, name)   { setToId(id);   setToLabel(name);   setStep(3) }

  // step 2 excludes the already-chosen From account
  const toAccounts = useMemo(() => assetAccounts.filter(a => a.id !== fromId), [assetAccounts, fromId])

  async function handleSave(andPost = false) {
    if (!isValid) return
    const setSt = andPost ? setPosting : setSaving
    setSt(true)
    try {
      const fy  = getFY(entryDate)
      const amt = parseFloat(amount)
      const entry = {
        entry_number: voucherNo, entry_date: entryDate, financial_year: fy,
        voucher_type: 'Contra', narration: narration || null, reference_no: refNo || null,
      }
      const jLines = [
        { account_id: toId,   debit_amount: amt, credit_amount: 0,   description: narration || null },
        { account_id: fromId, debit_amount: 0,   credit_amount: amt, description: narration || null },
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
    <div style={{ maxWidth: 720, margin: '0 auto' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
        <button onClick={() => navigate(-1)} className="nav-item"
          style={{ background: 'none', border: '1px solid var(--card-border)', borderRadius: 8, cursor: 'pointer', color: 'var(--text-3)', padding: '6px 8px', display: 'flex', alignItems: 'center', width: 'auto', flexShrink: 0 }}>
          <ArrowLeft size={16} />
        </button>
        <div style={{ flex: 1 }}>
          <h1 className="page-title" style={{ marginBottom: 1 }}>{editId ? 'Edit Contra Entry' : 'Contra Entry'}</h1>
          <p className="page-subtitle" style={{ margin: 0 }}>Transfer between cash and bank accounts</p>
        </div>
        <div style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 13, color: ACCENT, background: '#f3e8ff', padding: '4px 10px', borderRadius: 6 }}>
          {voucherNo}
        </div>
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
            <input className="field-input" placeholder="e.g. Cash deposited to bank" value={narration} onChange={e => setNarration(e.target.value)} disabled={busy} />
          </div>
          <div>
            <label className="field-label" style={{ display: 'block', marginBottom: 4 }}>Reference No</label>
            <input className="field-input" placeholder="Slip / txn no" value={refNo} onChange={e => setRefNo(e.target.value)} disabled={busy} />
          </div>
        </div>
      </div>

      {/* Step progress */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 20, fontSize: 12 }}>
        {[
          { n: 1, label: 'Transfer From' },
          { n: 2, label: 'Transfer To' },
          { n: 3, label: 'Amount' },
        ].map((s, i) => (
          <div key={s.n} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 22, height: 22, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, background: step >= s.n ? ACCENT : 'var(--card-border)', color: step >= s.n ? '#fff' : 'var(--text-3)', flexShrink: 0 }}>
              {step > s.n ? '✓' : s.n}
            </div>
            <span style={{ color: step >= s.n ? 'var(--text-1)' : 'var(--text-3)', fontWeight: step === s.n ? 700 : 400 }}>{s.label}</span>
            {i < 2 && <ChevronRight size={14} color="var(--text-3)" />}
          </div>
        ))}
      </div>

      {/* Step 1: From */}
      {step === 1 && (
        <div className="card" style={{ padding: '22px 24px' }}>
          <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-2)', marginBottom: 16 }}>Select the account to transfer <strong>from</strong> (money leaves here)</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {assetAccounts.length === 0 && (
              <p style={{ fontSize: 13, color: 'var(--text-3)', textAlign: 'center', padding: 20 }}>No asset accounts found.</p>
            )}
            {assetAccounts.map(acc => (
              <AccCard key={acc.id} acc={acc} onClick={() => chooseFrom(acc.id, acc.name)} />
            ))}
          </div>
        </div>
      )}

      {/* Step 2: To */}
      {step === 2 && (
        <div className="card" style={{ padding: '22px 24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
            <button onClick={goBack} className="nav-item"
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: ACCENT, fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4, padding: '4px 0', width: 'auto' }}>
              <ArrowLeft size={14} /> Back
            </button>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)' }}>Select the account to transfer <strong>to</strong></span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {toAccounts.map(acc => (
              <AccCard key={acc.id} acc={acc} onClick={() => chooseTo(acc.id, acc.name)} />
            ))}
          </div>
        </div>
      )}

      {/* Step 3: Amount */}
      {step === 3 && (
        <>
          {/* Transfer summary banner */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14, padding: '12px 16px', borderRadius: 10, background: 'rgba(124,58,237,0.06)', border: '1.5px solid rgba(124,58,237,0.2)' }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: ACCENT, marginBottom: 6 }}>Transfer</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ width: 24, height: 24, borderRadius: 6, background: acctBg(fromLabel), display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {acctIcon(fromLabel)}
                  </div>
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)' }}>{fromLabel}</span>
                </div>
                <ArrowLeftRight size={14} color={ACCENT} />
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ width: 24, height: 24, borderRadius: 6, background: acctBg(toLabel), display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {acctIcon(toLabel)}
                  </div>
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)' }}>{toLabel}</span>
                </div>
              </div>
            </div>
            {isValid && <CheckCircle2 size={18} color="#16a34a" />}
            <button onClick={goBack}
              style={{ background: 'none', border: '1px solid var(--card-border)', borderRadius: 7, cursor: 'pointer', color: 'var(--text-2)', padding: '5px 10px', display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600 }}>
              <Pencil size={11} /> Change
            </button>
          </div>

          {/* Amount card */}
          <div className="card" style={{ marginBottom: 16, padding: '24px 28px' }}>
            <label className="field-label" style={{ display: 'block', marginBottom: 8 }}>Transfer Amount (₹) *</label>
            <input
              type="number" min="0" step="0.01" placeholder="0.00"
              value={amount} onChange={e => setAmount(e.target.value)} disabled={busy}
              autoFocus
              className="field-input"
              style={{ fontSize: 22, fontWeight: 800, fontFamily: 'monospace', textAlign: 'right', height: 52 }}
            />
            {parseFloat(amount) > 0 && (
              <p style={{ textAlign: 'right', fontSize: 12, color: 'var(--text-3)', marginTop: 6 }}>
                {fmtAmt(parseFloat(amount))}
              </p>
            )}
          </div>

          {/* Save */}
          <div className="card" style={{ padding: '14px 20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10 }}>
              <button onClick={() => handleSave(false)} disabled={!isValid || busy}
                style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 18px', background: isValid ? '#f3e8ff' : '#e5e7eb', color: isValid ? ACCENT : '#9ca3af', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: isValid ? 'pointer' : 'not-allowed' }}>
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
        </>
      )}
    </div>
  )
}
