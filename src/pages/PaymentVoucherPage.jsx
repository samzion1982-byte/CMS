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
  PlusCircle, Trash2, Loader2, Save, CheckSquare, ArrowLeft,
  CheckCircle2, Banknote, Landmark, ChevronRight, Pencil, Printer,
} from 'lucide-react'
import NarrationInput from '../components/accounting/NarrationInput'
import VoucherPrint from '../components/accounting/VoucherPrint'
import { getChurch } from '../lib/supabase'
import { getFunds } from '../lib/accountingLib'

const localISO = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`

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
  function pick(a)   { onChange(a.id); setOpen(false) }
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

const blankLine = () => ({ _key: crypto.randomUUID(), account_id: '', amount: '' })

function AccCard({ label, iconNode, iconBg, onClick }) {
  const [hov, setHov] = useState(false)
  return (
    <button onClick={onClick} className="no-lift"
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '10px 14px', borderRadius: 8, border: '1px solid var(--card-border)', background: hov ? 'var(--text-1)' : 'var(--card-bg)', cursor: 'pointer', textAlign: 'left', width: '100%' }}>
      <div style={{ width: 28, height: 28, borderRadius: 7, background: hov ? 'rgba(255,255,255,0.12)' : iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        {iconNode(hov)}
      </div>
      <div style={{ flex: 1, fontSize: 12, fontWeight: 600, color: hov ? '#fff' : 'var(--text-1)' }}>{label}</div>
      <ChevronRight size={13} color={hov ? 'rgba(255,255,255,0.6)' : 'var(--text-3)'} />
    </button>
  )
}

function PayStep1CashOrBank({ onChoose, accentColor }) {
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
        How was this payment made?
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, maxWidth: 480, margin: '0 auto' }}>
        <button onClick={() => onChoose('cash')} className="no-lift" style={card(hovCash)}
          onMouseEnter={() => setHovCash(true)} onMouseLeave={() => setHovCash(false)}>
          <div style={{ width: 52, height: 52, borderRadius: 14, background: hovCash ? 'rgba(255,255,255,0.12)' : 'rgba(220,38,38,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Banknote size={26} color={hovCash ? '#fff' : accentColor} />
          </div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 800, color: hovCash ? '#fff' : 'var(--text-1)', marginBottom: 4 }}>Cash</div>
            <div style={{ fontSize: 11, color: hovCash ? 'rgba(255,255,255,0.6)' : 'var(--text-3)' }}>Cash in hand / petty cash</div>
          </div>
        </button>
        <button onClick={() => onChoose('bank')} className="no-lift" style={card(hovBank)}
          onMouseEnter={() => setHovBank(true)} onMouseLeave={() => setHovBank(false)}>
          <div style={{ width: 52, height: 52, borderRadius: 14, background: hovBank ? 'rgba(255,255,255,0.12)' : 'rgba(220,38,38,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Landmark size={26} color={hovBank ? '#fff' : accentColor} />
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

export default function PaymentVoucherPage() {
  const { user }   = useAuth()
  const navigate   = useNavigate()
  const toast      = useToast()
  const [searchParams] = useSearchParams()
  const editId = searchParams.get('edit') || null

  const [allCoa,        setAllCoa]        = useState([])
  const [voucherNo,     setVoucherNo]     = useState('')
  const [loaded,        setLoaded]        = useState(false)
  const [entryDate,     setEntryDate]     = useState(() => localISO(new Date()))
  const [paidTo,        setPaidTo]        = useState('')
  const [refNo,         setRefNo]         = useState('')
  const [step,          setStep]          = useState(1)
  const [paymentType,   setPaymentType]   = useState('')  // 'cash' | 'bank'
  const [creditCoaId,   setCreditCoaId]   = useState('')  // cash/bank account (credit side)
  const [creditLabel,   setCreditLabel]   = useState('')
  const [lines,         setLines]         = useState(() => [blankLine(), blankLine()])
  const [lineNarration, setLineNarration] = useState('')
  const [church,        setChurch]        = useState(null)
  const [showPrint,     setShowPrint]     = useState(false)
  const [funds,         setFunds]         = useState([])
  const [fundId,        setFundId]        = useState('')
  const [saving,        setSaving]        = useState(false)
  const [posting,       setPosting]       = useState(false)

  const assetAccounts = useMemo(() => getPostableAccountsWithPath(allCoa).filter(a => a.account_type === 'Asset'), [allCoa])
  const cashAccounts  = useMemo(() => {
    const f = assetAccounts.filter(a => /cash|hand|petty/i.test(a.name))
    return f.length > 0 ? f : assetAccounts
  }, [assetAccounts])
  const bankAccounts  = useMemo(() => {
    const parentIds = new Set(allCoa.map(a => a.parent_id).filter(Boolean))
    return assetAccounts.filter(a => /bank/i.test(a.name) && !parentIds.has(a.id))
  }, [assetAccounts, allCoa])
  const debitAccounts = useMemo(() => getPostableAccountsWithPath(allCoa), [allCoa])

  const total   = useMemo(() => lines.reduce((s, l) => s + (parseFloat(l.amount) || 0), 0), [lines])
  const isValid = creditCoaId && lines.some(l => l.account_id && parseFloat(l.amount) > 0)
  const busy    = saving || posting

  useEffect(() => { getChurch().then(setChurch).catch(() => {}) }, [])
  useEffect(() => { getFunds(true).then(setFunds).catch(() => {}) }, [])

  useEffect(() => {
    const promises = [getChartOfAccounts(true), getAccountingSettings()]
    if (editId) promises.push(getJournalEntryWithLines(editId))
    Promise.all(promises).then(async ([coa, s, existing]) => {
      setAllCoa(coa)
      if (editId && existing) {
        setVoucherNo(existing.entry_number)
        setEntryDate(existing.entry_date || localISO(new Date()))
        setRefNo(existing.reference_no || '')
        const creditLine = existing.journal_entry_lines?.find(l => Number(l.credit_amount) > 0)
        const debitLines = existing.journal_entry_lines?.filter(l => Number(l.debit_amount) > 0) || []
        if (creditLine) {
          setCreditCoaId(creditLine.account_id)
          setCreditLabel(creditLine.chart_of_accounts?.name || '')
          setPaidTo(creditLine.description || '')
          setPaymentType(/bank/i.test(creditLine.chart_of_accounts?.name || '') ? 'bank' : 'cash')
        }
        setLines(debitLines.map(l => ({ _key: crypto.randomUUID(), account_id: l.account_id, amount: String(l.debit_amount) })))
        setLineNarration(existing.narration || debitLines[0]?.description || '')
        if (existing.fund_id) setFundId(existing.fund_id)
        setStep(3)
      } else {
        const fy  = getFY()
        const pfx = { Payment: s.accounting_prefix_payment || 'PV' }
        setVoucherNo(await nextEntryNumber(fy, 'Payment', pfx))
      }
      setLoaded(true)
    }).catch(() => { toast('Failed to load data', 'error'); setLoaded(true) })
  }, [])

  function chooseType(type) { setPaymentType(type); setCreditCoaId(''); setCreditLabel(''); setStep(2) }
  function chooseAccount(acc) { setCreditCoaId(acc.id); setCreditLabel(acc.name); setStep(3) }
  function goBack() { if (step === 3) setStep(2); else if (step === 2) setStep(1) }

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
        entry_number: voucherNo, entry_date: entryDate, financial_year: fy,
        voucher_type: 'Payment', narration: lineNarration || null, reference_no: refNo || null,
        fund_id: fundId || null,
      }
      const jLines = [
        { account_id: creditCoaId, debit_amount: 0, credit_amount: total, description: paidTo || null },
        ...validLines.map(l => ({ account_id: l.account_id, debit_amount: parseFloat(l.amount), credit_amount: 0, description: lineNarration || null })),
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

  const accentColor = '#dc2626'   // red for payments

  return (
    <div style={{ maxWidth: 760, margin: '0 auto' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
          <button onClick={() => navigate('/accounting')}
            style={{ background: 'var(--accent)', border: 'none', borderRadius: 8, cursor: 'pointer', color: '#fff', padding: '6px 8px', display: 'flex', alignItems: 'center', flexShrink: 0 }}>
            <ArrowLeft size={16} />
          </button>
          <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--accent)', whiteSpace: 'nowrap' }}>Accounts</span>
        </div>
        <div style={{ flex: 1 }}>
          <h1 className="page-title" style={{ marginBottom: 1 }}>{editId ? 'Edit Payment Voucher' : 'Payment Voucher'}</h1>
        </div>
        <div style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 13, color: accentColor, background: '#fee2e2', padding: '4px 10px', borderRadius: 6 }}>
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
            <label className="field-label" style={{ display: 'block', marginBottom: 4 }}>Paid To</label>
            <input className="field-input" placeholder="Vendor / payee name" value={paidTo} onChange={e => setPaidTo(e.target.value)} disabled={busy} />
          </div>
          <div>
            <label className="field-label" style={{ display: 'block', marginBottom: 4 }}>Reference No</label>
            <input className="field-input" placeholder="Cheque / txn no" value={refNo} onChange={e => setRefNo(e.target.value)} disabled={busy} />
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

      {/* Step progress */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 20, fontSize: 12 }}>
        {[
          { n: 1, label: 'Cash or Bank?' },
          { n: 2, label: paymentType === 'bank' ? 'Select Bank Account' : 'Select Cash Account' },
          { n: 3, label: 'Debit Entries' },
        ].map((s, i) => (
          <div key={s.n} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 22, height: 22, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, background: step >= s.n ? accentColor : 'var(--card-border)', color: step >= s.n ? '#fff' : 'var(--text-3)', flexShrink: 0 }}>
              {step > s.n ? '✓' : s.n}
            </div>
            <span style={{ color: step >= s.n ? 'var(--text-1)' : 'var(--text-3)', fontWeight: step === s.n ? 700 : 400 }}>{s.label}</span>
            {i < 2 && <ChevronRight size={14} color="var(--text-3)" />}
          </div>
        ))}
      </div>

      {/* Step 1: Cash or Bank */}
      {step === 1 && (
        <PayStep1CashOrBank onChoose={chooseType} accentColor={accentColor} />
      )}

      {/* Step 2: Pick account */}
      {step === 2 && (
        <div className="card" style={{ padding: '22px 24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
            <button onClick={goBack} className="nav-item"
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: accentColor, fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4, padding: '4px 0', width: 'auto' }}>
              <ArrowLeft size={14} /> Back
            </button>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)' }}>
              {paymentType === 'bank' ? 'Select Bank Account' : 'Select Cash Account'}
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {(paymentType === 'bank' ? bankAccounts : cashAccounts).map(acc => (
              <AccCard key={acc.id} label={acc.name} iconBg="rgba(220,38,38,0.1)"
                iconNode={hov => paymentType === 'bank'
                  ? <Landmark size={14} color={hov ? '#fff' : accentColor} />
                  : <Banknote size={14} color={hov ? '#fff' : accentColor} />}
                onClick={() => chooseAccount(acc)} />
            ))}
          </div>
        </div>
      )}

      {/* Step 3: Debit entries */}
      {step === 3 && (
        <>
          {/* Selected account banner */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14, padding: '12px 16px', borderRadius: 10, background: 'rgba(220,38,38,0.06)', border: '1.5px solid rgba(220,38,38,0.2)' }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(220,38,38,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              {paymentType === 'bank' ? <Landmark size={16} color={accentColor} /> : <Banknote size={16} color={accentColor} />}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: accentColor, marginBottom: 2 }}>Credit — Paid From</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)' }}>{creditLabel}</div>
            </div>
            <div style={{ textAlign: 'right', marginRight: 12 }}>
              <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>Credit Amount</div>
              <div style={{ fontFamily: 'monospace', fontWeight: 900, fontSize: 18, color: total > 0 ? accentColor : 'var(--text-3)' }}>
                {total > 0 ? fmtAmt(total) : '—'}
              </div>
            </div>
            {total > 0 && <CheckCircle2 size={16} color="#16a34a" />}
            <button onClick={goBack} style={{ background: 'none', border: '1px solid var(--card-border)', borderRadius: 7, cursor: 'pointer', color: 'var(--text-2)', padding: '5px 10px', display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600 }}>
              <Pencil size={11} /> Change
            </button>
          </div>

          {/* Debit entries */}
          <div className="card" style={{ marginBottom: 16, padding: '18px 20px' }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: accentColor, marginBottom: 12 }}>
              Debit Entries
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '24px 1fr 130px 32px', gap: 10, marginBottom: 8 }}>
              <div />
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-3)' }}>Account</div>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-3)', textAlign: 'right' }}>Amount (₹)</div>
              <div />
            </div>
            {lines.map((line, idx) => (
              <div key={line._key} style={{ display: 'grid', gridTemplateColumns: '24px 1fr 130px 32px', gap: 10, alignItems: 'center', marginBottom: 8 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-3)', textAlign: 'center' }}>{idx + 1}</div>
                <AccountPicker value={line.account_id} accounts={debitAccounts} onChange={v => updateLine(idx, 'account_id', v)} placeholder="Select expense / payment account" disabled={busy} />
                <input type="number" min="0" step="0.01" placeholder="0.00" value={line.amount} onChange={e => updateLine(idx, 'amount', e.target.value)} disabled={busy}
                  className="field-input" style={{ textAlign: 'right', fontFamily: 'monospace' }} />
                <button onClick={() => removeLine(idx)} disabled={lines.length === 1 || busy}
                  style={{ padding: 4, background: 'none', border: 'none', cursor: 'pointer', color: '#b91c1c', opacity: lines.length === 1 ? 0.3 : 1, display: 'flex' }}>
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
            <button onClick={addLine} disabled={busy}
              style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', background: 'none', border: '1px dashed var(--card-border)', borderRadius: 7, fontSize: 12, color: 'var(--text-3)', cursor: 'pointer' }}>
              <PlusCircle size={13} /> Add Line
            </button>

            {/* Narration */}
            <div style={{ marginTop: 16, borderTop: '1px solid var(--card-border)', paddingTop: 14 }}>
              <label className="field-label" style={{ display: 'block', marginBottom: 5 }}>Narration</label>
              <NarrationInput placeholder="Narration for this payment…" value={lineNarration} onChange={setLineNarration} disabled={busy} />
            </div>
          </div>

          {/* Total + Save */}
          <div className="card" style={{ padding: '14px 20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-3)', marginBottom: 3 }}>Total Payment</div>
                <div style={{ fontFamily: 'monospace', fontWeight: 900, fontSize: 22, color: total > 0 ? accentColor : 'var(--text-3)' }}>{total > 0 ? fmtAmt(total) : '—'}</div>
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={() => handleSave(false)} disabled={!isValid || busy}
                  style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 18px', background: isValid ? '#fee2e2' : '#e5e7eb', color: isValid ? accentColor : '#9ca3af', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: isValid ? 'pointer' : 'not-allowed' }}>
                  {saving ? <Loader2 size={14} style={{ animation: 'spin 0.7s linear infinite' }} /> : <Save size={14} />}
                  Save Draft
                </button>
                <button onClick={() => handleSave(true)} disabled={!isValid || busy}
                  style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 18px', background: isValid ? accentColor : '#e5e7eb', color: isValid ? '#fff' : '#9ca3af', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: isValid ? 'pointer' : 'not-allowed' }}>
                  {posting ? <Loader2 size={14} style={{ animation: 'spin 0.7s linear infinite' }} /> : <CheckSquare size={14} />}
                  Post
                </button>
              </div>
            </div>
          </div>
        </>
      )}
      <VoucherPrint
        open={showPrint} onClose={() => setShowPrint(false)}
        church={church}
        voucherType="Payment"
        voucherNo={voucherNo}
        date={entryDate}
        refNo={refNo}
        narration={lineNarration}
        party={paidTo}
        rows={[
          ...lines.filter(l => l.account_id && parseFloat(l.amount) > 0).map(l => ({
            label: `Dr: ${debitAccounts.find(a => a.id === l.account_id)?.name || l.account_id}`,
            amount: parseFloat(l.amount),
          })),
          { label: `Cr: ${creditLabel}`, amount: total, bold: true },
        ]}
        totalAmount={total}
      />
    </div>
  )
}
