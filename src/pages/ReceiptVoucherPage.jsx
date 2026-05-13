import { useState, useEffect, useRef, useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import { useToast } from '../lib/toast'
import {
  getFY, fmtAmt,
  getChartOfAccounts, getPostableAccountsWithPath,
  nextEntryNumber, getAccountingSettings,
  createJournalEntry, updateJournalEntry, postJournalEntry,
  getJournalEntryWithLines,
  TYPE_COLOR,
} from '../lib/accountingLib'
import {
  PlusCircle, Trash2, Loader2, Save, CheckSquare, ArrowLeft,
  CheckCircle2, Banknote, Landmark, ChevronRight, Pencil, Printer,
} from 'lucide-react'
import NarrationInput from '../components/accounting/NarrationInput'
import VoucherPrint from '../components/accounting/VoucherPrint'
import { getChurch } from '../lib/supabase'
import { getFunds } from '../lib/accountingLib'

const localISO = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`

// strip punctuation for fuzzy matching ("Mens" → "Men's Fellowship")
function norm(s)    { return s.toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim() }
function compact(s) { return s.toLowerCase().replace(/[^a-z0-9]/g, '') }
function matchAcct(name, q) {
  if (!q) return true
  const nl = name.toLowerCase(), qn = norm(q), nc = compact(name), qc = compact(q)
  if (nl.includes(q) || norm(name).includes(qn) || nc.includes(qc)) return true
  return qn.split(' ').filter(Boolean).every(w => norm(name).includes(w))
}

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
    const qn = norm(q)
    if (!q) return accounts.slice(0, 15)
    const matched = accounts.filter(a => matchAcct(a.name, q))
    matched.sort((a, b) => (compact(a.name).startsWith(compact(q)) ? 0 : 1) - (compact(b.name).startsWith(compact(q)) ? 0 : 1))
    return matched.slice(0, 15)
  }, [query, open, accounts])

  function onFocus() { saved.current = value; setQuery(''); setOpen(true); setHi(0) }
  function onBlur()  { setTimeout(() => { setOpen(false); if (!value && saved.current) onChange(saved.current) }, 160) }
  function pick(a)   { saved.current = a.id; onChange(a.id); setOpen(false) }

  function onKey(e) {
    if (e.key === 'ArrowDown')          { e.preventDefault(); setHi(h => Math.min(h + 1, filtered.length - 1)) }
    else if (e.key === 'ArrowUp')       { e.preventDefault(); setHi(h => Math.max(h - 1, 0)) }
    else if (e.key === 'Escape')        { setOpen(false) }
    else if (e.key === 'Enter' && open) { e.preventDefault(); if (filtered[hi]) pick(filtered[hi]); else setOpen(false) }
    else if (e.key === 'Tab'   && open) { if (filtered[hi]) pick(filtered[hi]) }
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
              padding: '8px 12px', cursor: 'pointer',
              background: i === hi ? 'var(--accent-subtle)' : 'transparent',
              borderBottom: '1px solid var(--card-border)',
            }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>{a.name}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

const blankLine = () => ({ _key: crypto.randomUUID(), account_id: '', amount: '' })

function AccCard({ label, iconNode, iconBg, iconBgHov = 'rgba(255,255,255,0.12)', onClick }) {
  const [hov, setHov] = useState(false)
  return (
    <button onClick={onClick} className="no-lift"
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '10px 14px', borderRadius: 8, border: '1px solid var(--card-border)', background: hov ? 'var(--text-1)' : 'var(--card-bg)', cursor: 'pointer', textAlign: 'left', width: '100%' }}>
      <div style={{ width: 28, height: 28, borderRadius: 7, background: hov ? iconBgHov : iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        {iconNode(hov)}
      </div>
      <div style={{ flex: 1, fontSize: 12, fontWeight: 600, color: hov ? '#fff' : 'var(--text-1)' }}>{label}</div>
      <ChevronRight size={13} color={hov ? 'rgba(255,255,255,0.6)' : 'var(--text-3)'} />
    </button>
  )
}

function Step1CashOrBank({ onChoose }) {
  const [hovCash, setHovCash] = useState(false)
  const [hovBank, setHovBank] = useState(false)
  const card = hov => ({
    padding: '28px 16px', borderRadius: 14, border: '2px solid var(--card-border)',
    background: hov ? 'var(--text-1)' : 'var(--card-bg)',
    cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12,
  })
  return (
    <div className="card" style={{ padding: '28px 24px' }}>
      <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-2)', marginBottom: 24, textAlign: 'center' }}>
        How was this receipt received?
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, maxWidth: 480, margin: '0 auto' }}>
        <button onClick={() => onChoose('cash')} className="no-lift" style={card(hovCash)}
          onMouseEnter={() => setHovCash(true)} onMouseLeave={() => setHovCash(false)}>
          <div style={{ width: 52, height: 52, borderRadius: 14, background: hovCash ? 'rgba(255,255,255,0.12)' : 'rgba(22,163,74,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Banknote size={26} color={hovCash ? '#fff' : '#16a34a'} />
          </div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 800, color: hovCash ? '#fff' : 'var(--text-1)', marginBottom: 4 }}>Cash</div>
            <div style={{ fontSize: 11, color: hovCash ? 'rgba(255,255,255,0.6)' : 'var(--text-3)' }}>Cash in hand / petty cash</div>
          </div>
        </button>
        <button onClick={() => onChoose('bank')} className="no-lift" style={card(hovBank)}
          onMouseEnter={() => setHovBank(true)} onMouseLeave={() => setHovBank(false)}>
          <div style={{ width: 52, height: 52, borderRadius: 14, background: hovBank ? 'rgba(255,255,255,0.12)' : 'rgba(37,99,235,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Landmark size={26} color={hovBank ? '#fff' : '#2563eb'} />
          </div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 800, color: hovBank ? '#fff' : 'var(--text-1)', marginBottom: 4 }}>Bank</div>
            <div style={{ fontSize: 11, color: hovBank ? 'rgba(255,255,255,0.6)' : 'var(--text-3)' }}>Cheque / transfer / UPI</div>
          </div>
        </button>
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────
export default function ReceiptVoucherPage() {
  const { user }  = useAuth()
  const navigate  = useNavigate()
  const toast     = useToast()
  const [searchParams] = useSearchParams()
  const editId = searchParams.get('edit') || null   // set when editing existing entry

  // ── Data
  const [allCoa,       setAllCoa]       = useState([])
  const [receiptNo,    setReceiptNo]    = useState('')
  const [loaded,       setLoaded]       = useState(false)

  // ── Voucher header (always visible)
  const [entryDate,    setEntryDate]    = useState(() => localISO(new Date()))
  const [receivedFrom, setReceivedFrom] = useState('')
  const [refNo,        setRefNo]        = useState('')

  // ── Wizard state
  // step: 1 = cash/bank choice  2 = pick account  3 = credit entries
  const [step,         setStep]         = useState(1)
  const [receiptType,  setReceiptType]  = useState('')   // 'cash' | 'bank'
  const [debitCoaId,   setDebitCoaId]   = useState('')   // COA account id for the debit line
  const [debitLabel,   setDebitLabel]   = useState('')   // display label

  // ── Credit entries
  const [lines,        setLines]        = useState(() => [blankLine(), blankLine()])
  const [lineNarration, setLineNarration] = useState('')

  const [church,     setChurch]    = useState(null)
  const [showPrint,  setShowPrint] = useState(false)
  const [funds,  setFunds]  = useState([])
  const [fundId, setFundId] = useState('')

  // ── Save state
  const [saving,  setSaving]  = useState(false)
  const [posting, setPosting] = useState(false)

  // ── Derived
  const assetAccounts = useMemo(() => getPostableAccountsWithPath(allCoa).filter(a => a.account_type === 'Asset'), [allCoa])

  const cashAccounts  = useMemo(() => {
    const parentIds = new Set(allCoa.map(a => a.parent_id).filter(Boolean))
    const filtered = assetAccounts.filter(a => /cash|hand|petty/i.test(a.name) && !parentIds.has(a.id))
    return filtered.length > 0 ? filtered : assetAccounts.filter(a => !parentIds.has(a.id))
  }, [assetAccounts, allCoa])

  const bankCoaAccounts = useMemo(() => {
    const parentIds = new Set(allCoa.map(a => a.parent_id).filter(Boolean))
    return assetAccounts.filter(a => /bank/i.test(a.name) && !parentIds.has(a.id))
  }, [assetAccounts, allCoa])

  const creditAccounts = useMemo(() => getPostableAccountsWithPath(allCoa), [allCoa])

  const total   = useMemo(() => lines.reduce((s, l) => s + (parseFloat(l.amount) || 0), 0), [lines])
  const isValid = debitCoaId && lines.some(l => l.account_id && parseFloat(l.amount) > 0)
  const busy    = saving || posting

  useEffect(() => { getChurch().then(setChurch).catch(() => {}) }, [])
  useEffect(() => { getFunds(true).then(setFunds).catch(() => {}) }, [])

  useEffect(() => {
    const promises = [getChartOfAccounts(true), getAccountingSettings()]
    if (editId) promises.push(getJournalEntryWithLines(editId))
    Promise.all(promises).then(async ([coa, s, existingEntry]) => {
      setAllCoa(coa)
      if (editId && existingEntry) {
        // Pre-populate from existing entry
        setReceiptNo(existingEntry.entry_number)
        setEntryDate(existingEntry.entry_date || localISO(new Date()))
        setRefNo(existingEntry.reference_no || '')
        const debitLine  = existingEntry.journal_entry_lines?.find(l => Number(l.debit_amount) > 0)
        const creditLines = existingEntry.journal_entry_lines?.filter(l => Number(l.credit_amount) > 0) || []
        if (debitLine) {
          setDebitCoaId(debitLine.account_id)
          setDebitLabel(debitLine.chart_of_accounts?.name || '')
          setReceivedFrom(debitLine.description || '')
          const acctName = debitLine.chart_of_accounts?.name || ''
          setReceiptType(/bank/i.test(acctName) ? 'bank' : 'cash')
        }
        setLines(creditLines.map(l => ({ _key: crypto.randomUUID(), account_id: l.account_id, amount: String(l.credit_amount) })))
        setLineNarration(existingEntry.narration || creditLines[0]?.description || '')
        if (existingEntry.fund_id) setFundId(existingEntry.fund_id)
        setStep(3)
      } else {
        const fy  = getFY()
        const pfx = { Receipt: s.accounting_prefix_receipt || 'RV' }
        setReceiptNo(await nextEntryNumber(fy, 'Receipt', pfx))
      }
      setLoaded(true)
    }).catch(() => { toast('Failed to load data', 'error'); setLoaded(true) })
  }, [])

  // ── Wizard navigation ─────────────────────────────────────────
  function chooseType(type) {
    setReceiptType(type)
    setDebitCoaId('')
    setDebitLabel('')
    setStep(2)
  }

  function chooseCashAccount(acc) {
    setDebitCoaId(acc.id)
    setDebitLabel(acc.name)
    setStep(3)
  }

  function chooseBankAccount(acc) {
    setDebitCoaId(acc.id)
    setDebitLabel(acc.name)
    setStep(3)
  }

  function goBack() {
    if (step === 3) setStep(2)
    else if (step === 2) setStep(1)
  }

  // ── Credit line helpers ───────────────────────────────────────
  function updateLine(idx, field, val) { setLines(ls => ls.map((l, i) => i === idx ? { ...l, [field]: val } : l)) }
  function addLine()       { setLines(ls => [...ls, blankLine()]) }
  function removeLine(idx) { setLines(ls => ls.length > 1 ? ls.filter((_, i) => i !== idx) : ls) }

  // ── Save / Post ───────────────────────────────────────────────
  async function handleSave(andPost = false) {
    if (!isValid) return
    const setSt = andPost ? setPosting : setSaving
    setSt(true)
    try {
      const fy         = getFY(entryDate)
      const validLines = lines.filter(l => l.account_id && parseFloat(l.amount) > 0)
      const entry = {
        entry_number: receiptNo, entry_date: entryDate, financial_year: fy,
        voucher_type: 'Receipt', narration: lineNarration || null, reference_no: refNo || null,
        fund_id: fundId || null,
      }
      const jLines = [
        { account_id: debitCoaId, debit_amount: total, credit_amount: 0, description: receivedFrom || null },
        ...validLines.map(l => ({ account_id: l.account_id, debit_amount: 0, credit_amount: parseFloat(l.amount), description: lineNarration || null })),
      ]
      let je
      if (editId) {
        je = await updateJournalEntry(editId, entry, jLines, user?.email || 'system')
        toast(`${receiptNo} updated`, 'success')
      } else {
        je = await createJournalEntry(entry, jLines, user?.email || 'system')
      }
      if (andPost) { await postJournalEntry(je.id, user?.email || 'system'); toast(`${receiptNo} posted`, 'success') }
      else if (!editId) { toast(`${receiptNo} saved as draft`, 'success') }
      navigate('/accounting/journal-entries')
    } catch (err) { toast(err.message || 'Failed to save', 'error'); setSt(false) }
  }

  // ── Loading ───────────────────────────────────────────────────
  if (!loaded) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 300 }}>
      <Loader2 size={28} style={{ animation: 'spin 0.7s linear infinite', color: 'var(--accent)' }} />
    </div>
  )

  return (
    <div style={{ maxWidth: 760, margin: '0 auto' }}>

      {/* ══ ALWAYS VISIBLE: header + voucher details ══ */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
          <button onClick={() => navigate('/accounting')}
            style={{ background: 'var(--accent)', border: 'none', borderRadius: 8, cursor: 'pointer', color: '#fff', padding: '6px 8px', display: 'flex', alignItems: 'center', flexShrink: 0 }}>
            <ArrowLeft size={16} />
          </button>
          <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--accent)', whiteSpace: 'nowrap' }}>Accounts</span>
        </div>
        <div style={{ flex: 1 }}>
          <h1 className="page-title" style={{ marginBottom: 1 }}>{editId ? 'Edit Receipt Voucher' : 'Receipt Voucher'}</h1>
        </div>
        <div style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 13, color: 'var(--accent)', background: 'var(--accent-subtle)', padding: '4px 10px', borderRadius: 6 }}>
          {receiptNo}
        </div>
        <button onClick={() => setShowPrint(true)} title="Print voucher"
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', background: 'var(--card-bg)', border: '1.5px solid var(--card-border)', borderRadius: 8, cursor: 'pointer', color: 'var(--text-2)', fontSize: 12, fontWeight: 600 }}>
          <Printer size={14} /> Print
        </button>
      </div>

      {/* Voucher meta row */}
      <div className="card" style={{ marginBottom: 20, padding: '14px 18px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr 1fr', gap: '10px 16px' }}>
          <div>
            <label className="field-label" style={{ display: 'block', marginBottom: 4 }}>Date *</label>
            <input className="field-input" type="date" value={entryDate}
              onChange={e => setEntryDate(e.target.value)} disabled={busy} />
          </div>
          <div>
            <label className="field-label" style={{ display: 'block', marginBottom: 4 }}>Received From</label>
            <input className="field-input" placeholder="Donor / member name"
              value={receivedFrom} onChange={e => setReceivedFrom(e.target.value)} disabled={busy} />
          </div>
          <div>
            <label className="field-label" style={{ display: 'block', marginBottom: 4 }}>Reference No</label>
            <input className="field-input" placeholder="Cheque / UPI ref."
              value={refNo} onChange={e => setRefNo(e.target.value)} disabled={busy} />
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

      {/* ══ STEP PROGRESS ══ */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 20, fontSize: 12 }}>
        {[
          { n: 1, label: 'Cash or Bank?' },
          { n: 2, label: receiptType === 'bank' ? 'Select Bank Account' : 'Select Cash Account' },
          { n: 3, label: 'Credit Entries' },
        ].map((s, i) => (
          <div key={s.n} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{
              width: 22, height: 22, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 11, fontWeight: 700,
              background: step >= s.n ? 'var(--accent)' : 'var(--card-border)',
              color: step >= s.n ? '#fff' : 'var(--text-3)',
              flexShrink: 0,
            }}>{step > s.n ? '✓' : s.n}</div>
            <span style={{ color: step >= s.n ? 'var(--text-1)' : 'var(--text-3)', fontWeight: step === s.n ? 700 : 400 }}>
              {s.label}
            </span>
            {i < 2 && <ChevronRight size={14} color="var(--text-3)" />}
          </div>
        ))}
      </div>

      {/* ══ STEP 1: Cash or Bank ══ */}
      {step === 1 && (
        <Step1CashOrBank onChoose={chooseType} />
      )}

      {/* ══ STEP 2: Pick account ══ */}
      {step === 2 && (
        <div className="card" style={{ padding: '22px 24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
            <button onClick={goBack} className="nav-item"
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent)', fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4, padding: '4px 0', width: 'auto' }}>
              <ArrowLeft size={14} /> Back
            </button>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)' }}>
              {receiptType === 'bank' ? 'Select Bank Account' : 'Select Cash Account'}
            </span>
          </div>

          {/* CASH accounts */}
          {receiptType === 'cash' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {cashAccounts.length === 0 && (
                <p style={{ fontSize: 13, color: 'var(--text-3)', textAlign: 'center', padding: 20 }}>
                  No cash accounts found. Add one in Chart of Accounts.
                </p>
              )}
              {cashAccounts.map(acc => (
                <AccCard key={acc.id} label={acc.name} iconBg="rgba(22,163,74,0.1)"
                  iconNode={hov => <Banknote size={14} color={hov ? '#fff' : '#16a34a'} />}
                  onClick={() => chooseCashAccount(acc)} />
              ))}
            </div>
          )}

          {/* BANK accounts */}
          {receiptType === 'bank' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {bankCoaAccounts.length === 0 && (
                <p style={{ fontSize: 13, color: 'var(--text-3)', textAlign: 'center', padding: 20 }}>
                  No bank accounts found in Chart of Accounts. Add an account with "Bank" in the name.
                </p>
              )}
              {bankCoaAccounts.map(acc => (
                <AccCard key={acc.id} label={acc.name} iconBg="rgba(37,99,235,0.1)"
                  iconNode={hov => <Landmark size={14} color={hov ? '#fff' : '#2563eb'} />}
                  onClick={() => chooseBankAccount(acc)} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ══ STEP 3: Credit entries ══ */}
      {step === 3 && (
        <>
          {/* Selected account banner */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14,
            padding: '12px 16px', borderRadius: 10,
            background: receiptType === 'bank' ? 'rgba(37,99,235,0.07)' : 'rgba(22,163,74,0.07)',
            border: `1.5px solid ${receiptType === 'bank' ? 'rgba(37,99,235,0.2)' : 'rgba(22,163,74,0.2)'}`,
          }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: receiptType === 'bank' ? 'rgba(37,99,235,0.15)' : 'rgba(22,163,74,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              {receiptType === 'bank' ? <Landmark size={16} color="#2563eb" /> : <Banknote size={16} color="#16a34a" />}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: receiptType === 'bank' ? '#2563eb' : '#16a34a', marginBottom: 2 }}>
                Debit — Received Into
              </div>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)' }}>{debitLabel}</div>
            </div>
            {/* Auto debit amount */}
            <div style={{ textAlign: 'right', marginRight: 12 }}>
              <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>Debit Amount</div>
              <div style={{ fontFamily: 'monospace', fontWeight: 900, fontSize: 18, color: total > 0 ? '#dc2626' : 'var(--text-3)' }}>
                {total > 0 ? fmtAmt(total) : '—'}
              </div>
            </div>
            {total > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#16a34a' }}>
                <CheckCircle2 size={16} />
              </div>
            )}
            <button onClick={goBack}
              style={{ background: 'none', border: '1px solid var(--card-border)', borderRadius: 7, cursor: 'pointer', color: 'var(--text-2)', padding: '5px 10px', display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600 }}>
              <Pencil size={11} /> Change
            </button>
          </div>

          {/* Credit entries table */}
          <div className="card" style={{ marginBottom: 16, padding: '18px 20px' }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#16a34a', marginBottom: 12 }}>
              Credit Entries
            </div>

            {/* Column headers */}
            <div style={{ display: 'grid', gridTemplateColumns: '24px 1fr 130px 32px', gap: 10, marginBottom: 8 }}>
              {['#', 'Account', 'Amount (₹)', ''].map(h => (
                <span key={h} style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-3)' }}>{h}</span>
              ))}
            </div>

            {lines.map((line, idx) => (
              <div key={line._key}
                style={{ display: 'grid', gridTemplateColumns: '24px 1fr 130px 32px', gap: 10, marginBottom: 8, alignItems: 'center' }}>
                <span style={{ fontSize: 12, color: 'var(--text-3)', fontWeight: 700, textAlign: 'center' }}>{idx + 1}</span>
                <AccountPicker
                  value={line.account_id}
                  accounts={creditAccounts}
                  onChange={id => updateLine(idx, 'account_id', id)}
                  placeholder="Select account…"
                  disabled={busy}
                />
                <input className="field-input" type="number" step="0.01" min="0" placeholder="0.00"
                  value={line.amount} onChange={e => updateLine(idx, 'amount', e.target.value)}
                  disabled={busy}
                  style={{ textAlign: 'right', fontFamily: 'monospace', fontWeight: 700, color: '#16a34a', fontSize: 15 }} />
                <button onClick={() => removeLine(idx)} disabled={lines.length === 1 || busy} className="nav-item"
                  style={{ background: 'none', border: 'none', padding: 4, borderRadius: 6, display: 'flex', alignItems: 'center', width: 'auto',
                    cursor: lines.length === 1 ? 'not-allowed' : 'pointer',
                    color: lines.length === 1 ? 'var(--text-3)' : '#dc2626' }}>
                  <Trash2 size={15} />
                </button>
              </div>
            ))}

            {/* Add line + total */}
            <div style={{ display: 'flex', alignItems: 'center', marginTop: 10, gap: 12 }}>
              <button onClick={addLine} disabled={busy}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', borderRadius: 8,
                  border: '1.5px dashed var(--card-border)', background: 'transparent',
                  color: 'var(--accent)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                <PlusCircle size={13} /> Add Line
              </button>
              <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-3)' }}>Total Credit</span>
                <span style={{ fontFamily: 'monospace', fontWeight: 900, fontSize: 20, color: total > 0 ? '#16a34a' : 'var(--text-3)' }}>
                  {total > 0 ? fmtAmt(total) : '—'}
                </span>
              </div>
            </div>

            {/* Single narration for all entries */}
            <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--card-border)' }}>
              <label className="field-label" style={{ display: 'block', marginBottom: 5 }}>Narration</label>
              <NarrationInput placeholder="Particulars / narration for this receipt"
                value={lineNarration} onChange={setLineNarration}
                disabled={busy} />
            </div>
          </div>

          {/* Save / Post */}
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
        </>
      )}

      <VoucherPrint
        open={showPrint} onClose={() => setShowPrint(false)}
        church={church}
        voucherType="Receipt"
        voucherNo={receiptNo}
        date={entryDate}
        refNo={refNo}
        narration={lineNarration}
        party={receivedFrom}
        rows={[
          { label: `Dr: ${debitLabel}`, amount: total, bold: true },
          ...lines.filter(l => l.account_id && parseFloat(l.amount) > 0).map(l => ({
            label: `Cr: ${creditAccounts.find(a => a.id === l.account_id)?.name || l.account_id}`,
            amount: parseFloat(l.amount),
          })),
        ]}
        totalAmount={total}
      />
    </div>
  )
}
