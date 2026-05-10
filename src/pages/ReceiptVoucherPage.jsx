import { useState, useEffect, useRef, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import { useToast } from '../lib/toast'
import { supabase } from '../lib/supabase'
import {
  getFY, fmtAmt,
  getChartOfAccounts, getPostableAccountsWithPath,
  nextEntryNumber, getAccountingSettings,
  createJournalEntry, postJournalEntry,
  TYPE_COLOR,
} from '../lib/accountingLib'
import {
  PlusCircle, Trash2, Loader2, Save, CheckSquare, ArrowLeft,
  CheckCircle2, Banknote, Landmark, ChevronRight, Pencil,
} from 'lucide-react'

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
    if (e.key === 'ArrowDown')          { e.preventDefault(); setHi(h => Math.min(h + 1, filtered.length - 1)) }
    else if (e.key === 'ArrowUp')       { e.preventDefault(); setHi(h => Math.max(h - 1, 0)) }
    else if (e.key === 'Escape')        { setOpen(false) }
    else if (e.key === 'Enter' && open) { e.preventDefault(); if (filtered[hi]) pick(filtered[hi]); else setOpen(false) }
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

// mask last 4 of account number
function maskAccNo(no) {
  if (!no) return ''
  const s = String(no).replace(/\s/g, '')
  return s.length > 4 ? '•••• ' + s.slice(-4) : s
}

// ── Main Page ─────────────────────────────────────────────────────
export default function ReceiptVoucherPage() {
  const { user }  = useAuth()
  const navigate  = useNavigate()
  const toast     = useToast()

  // ── Data
  const [allCoa,       setAllCoa]       = useState([])
  const [bankAccounts, setBankAccounts] = useState([])
  const [receiptNo,    setReceiptNo]    = useState('')
  const [loaded,       setLoaded]       = useState(false)

  // ── Voucher header (always visible)
  const [entryDate,    setEntryDate]    = useState(() => new Date().toISOString().slice(0, 10))
  const [receivedFrom, setReceivedFrom] = useState('')
  const [refNo,        setRefNo]        = useState('')
  const [narration,    setNarration]    = useState('')

  // ── Wizard state
  // step: 1 = cash/bank choice  2 = pick account  3 = credit entries
  const [step,         setStep]         = useState(1)
  const [receiptType,  setReceiptType]  = useState('')   // 'cash' | 'bank'
  const [debitCoaId,   setDebitCoaId]   = useState('')   // COA account id for the debit line
  const [debitLabel,   setDebitLabel]   = useState('')   // display label
  const [needCoaLink,  setNeedCoaLink]  = useState(false) // bank account has no coa_account_id

  // ── Credit entries
  const [lines, setLines] = useState(() => [blankLine(), blankLine()])

  // ── Save state
  const [saving,  setSaving]  = useState(false)
  const [posting, setPosting] = useState(false)

  // ── Derived
  const assetAccounts = useMemo(() => getPostableAccountsWithPath(allCoa).filter(a => a.account_type === 'Asset'), [allCoa])

  const cashAccounts  = useMemo(() => {
    const filtered = assetAccounts.filter(a => /cash|hand|petty/i.test(a.name))
    return filtered.length > 0 ? filtered : assetAccounts
  }, [assetAccounts])

  const bankCoaAccounts = useMemo(() =>
    assetAccounts.filter(a => /bank/i.test(a.name)),
  [assetAccounts])

  const creditAccounts = useMemo(() => getPostableAccountsWithPath(allCoa), [allCoa])

  const total   = useMemo(() => lines.reduce((s, l) => s + (parseFloat(l.amount) || 0), 0), [lines])
  const isValid = debitCoaId && lines.some(l => l.account_id && parseFloat(l.amount) > 0)
  const busy    = saving || posting

  useEffect(() => {
    Promise.all([
      getChartOfAccounts(true),
      getAccountingSettings(),
      supabase.from('bank_accounts').select('*').eq('is_active', true).order('sort_order').order('created_at'),
    ]).then(async ([coa, s, { data: banks }]) => {
      setAllCoa(coa)
      setBankAccounts(banks || [])
      const fy  = getFY(new Date().toISOString().slice(0, 10))
      const pfx = { Receipt: s.accounting_prefix_receipt || 'RV' }
      setReceiptNo(await nextEntryNumber(fy, 'Receipt', pfx))
      setLoaded(true)
    }).catch(() => { toast('Failed to load data', 'error'); setLoaded(true) })
  }, [])

  // ── Wizard navigation ─────────────────────────────────────────
  function chooseType(type) {
    setReceiptType(type)
    setDebitCoaId('')
    setDebitLabel('')
    setNeedCoaLink(false)
    setStep(2)
  }

  function chooseCashAccount(acc) {
    setDebitCoaId(acc.id)
    setDebitLabel(acc.name)
    setNeedCoaLink(false)
    setStep(3)
  }

  function chooseBankAccount(bank) {
    if (bank.coa_account_id) {
      setDebitCoaId(bank.coa_account_id)
      setDebitLabel(`${bank.bank_name} — ${maskAccNo(bank.account_number)}`)
      setNeedCoaLink(false)
      setStep(3)
    } else {
      // Bank account not linked to COA — need user to pick the COA account
      setDebitLabel(`${bank.bank_name} — ${maskAccNo(bank.account_number)}`)
      setDebitCoaId('')
      setNeedCoaLink(true)
      setStep(3)
    }
  }

  function goBack() {
    if (step === 3) { setStep(2); setNeedCoaLink(false) }
    else if (step === 2) { setStep(1) }
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
        voucher_type: 'Receipt', narration: narration || null, reference_no: refNo || null,
      }
      const jLines = [
        { account_id: debitCoaId, debit_amount: total, credit_amount: 0, description: receivedFrom || null },
        ...validLines.map(l => ({ account_id: l.account_id, debit_amount: 0, credit_amount: parseFloat(l.amount), description: l.description || null })),
      ]
      const je = await createJournalEntry(entry, jLines, user?.email || 'system')
      if (andPost) { await postJournalEntry(je.id, user?.email || 'system'); toast(`${receiptNo} posted`, 'success') }
      else         { toast(`${receiptNo} saved as draft`, 'success') }
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
        <button onClick={() => navigate(-1)} className="nav-item"
          style={{ background: 'none', border: '1px solid var(--card-border)', borderRadius: 8, cursor: 'pointer', color: 'var(--text-3)', padding: '6px 8px', display: 'flex', alignItems: 'center' }}>
          <ArrowLeft size={16} />
        </button>
        <div style={{ flex: 1 }}>
          <h1 className="page-title" style={{ marginBottom: 1 }}>Receipt Voucher</h1>
        </div>
        <div style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 13, color: 'var(--accent)', background: 'var(--accent-subtle)', padding: '4px 10px', borderRadius: 6 }}>
          {receiptNo}
        </div>
      </div>

      {/* Voucher meta row */}
      <div className="card" style={{ marginBottom: 20, padding: '14px 18px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr 1fr 1fr', gap: '10px 16px' }}>
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
          <div>
            <label className="field-label" style={{ display: 'block', marginBottom: 4 }}>Narration</label>
            <input className="field-input" placeholder="Brief description"
              value={narration} onChange={e => setNarration(e.target.value)} disabled={busy} />
          </div>
        </div>
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
        <div className="card" style={{ padding: '28px 24px' }}>
          <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-2)', marginBottom: 24, textAlign: 'center' }}>
            How was this receipt received?
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, maxWidth: 480, margin: '0 auto' }}>
            {/* Cash button */}
            <button onClick={() => chooseType('cash')}
              style={{
                padding: '28px 16px', borderRadius: 14,
                border: '2px solid var(--card-border)',
                background: 'var(--card-bg)', cursor: 'pointer',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12,
                transition: 'border-color 0.15s, background 0.15s',
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = '#16a34a'; e.currentTarget.style.background = 'rgba(22,163,74,0.05)' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--card-border)'; e.currentTarget.style.background = 'var(--card-bg)' }}
            >
              <div style={{ width: 52, height: 52, borderRadius: 14, background: 'rgba(22,163,74,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Banknote size={26} color="#16a34a" />
              </div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--text-1)', marginBottom: 4 }}>Cash</div>
                <div style={{ fontSize: 11, color: 'var(--text-3)' }}>Cash in hand / petty cash</div>
              </div>
            </button>

            {/* Bank button */}
            <button onClick={() => chooseType('bank')}
              style={{
                padding: '28px 16px', borderRadius: 14,
                border: '2px solid var(--card-border)',
                background: 'var(--card-bg)', cursor: 'pointer',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12,
                transition: 'border-color 0.15s, background 0.15s',
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = '#2563eb'; e.currentTarget.style.background = 'rgba(37,99,235,0.05)' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--card-border)'; e.currentTarget.style.background = 'var(--card-bg)' }}
            >
              <div style={{ width: 52, height: 52, borderRadius: 14, background: 'rgba(37,99,235,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Landmark size={26} color="#2563eb" />
              </div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--text-1)', marginBottom: 4 }}>Bank</div>
                <div style={{ fontSize: 11, color: 'var(--text-3)' }}>Cheque / transfer / UPI</div>
              </div>
            </button>
          </div>
        </div>
      )}

      {/* ══ STEP 2: Pick account ══ */}
      {step === 2 && (
        <div className="card" style={{ padding: '22px 24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
            <button onClick={goBack} className="nav-item"
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent)', fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4, padding: '4px 0' }}>
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
                <button key={acc.id} onClick={() => chooseCashAccount(acc)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 14,
                    padding: '14px 16px', borderRadius: 10,
                    border: '1.5px solid var(--card-border)',
                    background: 'var(--card-bg)', cursor: 'pointer', textAlign: 'left',
                    transition: 'border-color 0.15s, background 0.15s',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = '#16a34a'; e.currentTarget.style.background = 'rgba(22,163,74,0.05)' }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--card-border)'; e.currentTarget.style.background = 'var(--card-bg)' }}
                >
                  <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(22,163,74,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Banknote size={18} color="#16a34a" />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-1)' }}>{acc.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>{acc.path}</div>
                  </div>
                  <ChevronRight size={16} color="var(--text-3)" />
                </button>
              ))}
            </div>
          )}

          {/* BANK accounts */}
          {receiptType === 'bank' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {bankAccounts.length === 0 && (
                <p style={{ fontSize: 13, color: 'var(--text-3)', textAlign: 'center', padding: 20 }}>
                  No bank accounts found. Add one in Accounting → Bank Accounts.
                </p>
              )}
              {bankAccounts.map(bank => (
                <button key={bank.id} onClick={() => chooseBankAccount(bank)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 14,
                    padding: '14px 16px', borderRadius: 10,
                    border: '1.5px solid var(--card-border)',
                    background: 'var(--card-bg)', cursor: 'pointer', textAlign: 'left',
                    transition: 'border-color 0.15s, background 0.15s',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = '#2563eb'; e.currentTarget.style.background = 'rgba(37,99,235,0.05)' }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--card-border)'; e.currentTarget.style.background = 'var(--card-bg)' }}
                >
                  <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(37,99,235,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Landmark size={18} color="#2563eb" />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-1)' }}>{bank.bank_name}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 2, fontFamily: 'monospace', letterSpacing: '0.05em' }}>
                      A/c: {maskAccNo(bank.account_number)}
                    </div>
                    {bank.branch && <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 1 }}>{bank.branch}</div>}
                  </div>
                  <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-3)', background: 'var(--page-bg)', padding: '2px 8px', borderRadius: 6, marginRight: 6 }}>
                    {bank.account_type}
                  </span>
                  <ChevronRight size={16} color="var(--text-3)" />
                </button>
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

          {/* If bank account has no COA link, ask user to pick */}
          {needCoaLink && (
            <div className="card" style={{ marginBottom: 14, padding: '14px 18px', borderLeft: '3px solid #f59e0b' }}>
              <p style={{ fontSize: 12, color: '#92400e', fontWeight: 600, marginBottom: 8 }}>
                This bank account is not linked to a Chart of Accounts entry. Please select the matching account:
              </p>
              <AccountPicker
                value={debitCoaId}
                accounts={bankCoaAccounts.length > 0 ? bankCoaAccounts : assetAccounts}
                onChange={id => setDebitCoaId(id)}
                placeholder="Select the bank's COA account…"
              />
            </div>
          )}

          {/* Credit entries table */}
          <div className="card" style={{ marginBottom: 16, padding: '18px 20px' }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#16a34a', marginBottom: 12 }}>
              Credit Entries
            </div>

            {/* Column headers */}
            <div style={{ display: 'grid', gridTemplateColumns: '24px 1fr 130px 32px', gap: 10, marginBottom: 8 }}>
              {['#', 'Account / Description', 'Amount (₹)', ''].map(h => (
                <span key={h} style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-3)' }}>{h}</span>
              ))}
            </div>

            {lines.map((line, idx) => (
              <div key={line._key}
                style={{ display: 'grid', gridTemplateColumns: '24px 1fr 130px 32px', gap: 10, marginBottom: 12, alignItems: 'start' }}>
                <span style={{ fontSize: 12, color: 'var(--text-3)', fontWeight: 700, textAlign: 'center', paddingTop: 10 }}>{idx + 1}</span>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  <AccountPicker
                    value={line.account_id}
                    accounts={creditAccounts}
                    onChange={id => updateLine(idx, 'account_id', id)}
                    placeholder="Select account…"
                    disabled={busy}
                  />
                  <input className="field-input" placeholder="Description (optional)"
                    value={line.description} onChange={e => updateLine(idx, 'description', e.target.value)}
                    disabled={busy}
                    style={{ fontSize: 12, height: 30 }} />
                </div>
                <input className="field-input" type="number" step="0.01" min="0" placeholder="0.00"
                  value={line.amount} onChange={e => updateLine(idx, 'amount', e.target.value)}
                  disabled={busy}
                  style={{ textAlign: 'right', fontFamily: 'monospace', fontWeight: 700, color: '#16a34a', fontSize: 15, paddingTop: 6 }} />
                <button onClick={() => removeLine(idx)} disabled={lines.length === 1 || busy} className="nav-item"
                  style={{ background: 'none', border: 'none', padding: 4, borderRadius: 6, display: 'flex', alignItems: 'center', marginTop: 6,
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

    </div>
  )
}
