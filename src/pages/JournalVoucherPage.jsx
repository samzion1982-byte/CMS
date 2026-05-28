import { useState, useEffect, useMemo } from 'react'
import { flushSync } from 'react-dom'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import { useToast } from '../lib/toast'
import {
  getFY, fmtAmt,
  getChartOfAccounts, getPostableAccountsWithPath, getAccountsByIds,
  nextEntryNumber, getAccountingSettings,
  createJournalEntry, updateJournalEntry, updatePostedJournalEntry, postJournalEntry,
  getJournalEntryWithLines,
} from '../lib/accountingLib'
import {
  Loader2, Save, CheckSquare, ArrowLeft, CheckCircle2,
  Plus, Trash2, FileText, Printer,
} from 'lucide-react'
import { useEntity } from '../lib/EntityContext'
import NarrationInput from '../components/accounting/NarrationInput'
import VoucherPrint from '../components/accounting/VoucherPrint'
import AccountPicker from '../components/accounting/AccountPicker'
import { getChurch } from '../lib/supabase'
import { getFunds } from '../lib/accountingLib'

const localISO = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`

const ACCENT = '#0891b2'

let _lineId = 0
function newLine() { return { _id: ++_lineId, accountId: '', accountName: '', amount: '' } }

function LinesPanel({ title, accentColor, lines, accounts, onChange, onAdd, onRemove, disabled, total, allCoa, entityId, onAccountCreated }) {
  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Panel header */}
      <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--card-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: `${accentColor}08` }}>
        <p style={{ fontSize: 12, fontWeight: 700, color: accentColor, margin: 0, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{title}</p>
        <span style={{ fontSize: 12, fontWeight: 700, fontFamily: 'monospace', color: accentColor }}>{fmtAmt(total)}</span>
      </div>

      {/* Lines */}
      <div data-lines style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
        {lines.map((line, idx) => (
          <div key={line._id} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <AccountPicker
              value={line.accountId}
              accounts={accounts}
              onChange={(id, name) => onChange(idx, 'accountId', id, name)}
              placeholder="Account…"
              disabled={disabled}
              allCoa={allCoa}
              entityId={entityId}
              onAccountCreated={onAccountCreated}
            />
            <input
              type="number" min="0" step="0.01" placeholder="0.00"
              value={line.amount}
              onChange={e => onChange(idx, 'amount', e.target.value)}
              disabled={disabled}
              className="field-input"
              onKeyDown={e => {
                const isLast = idx === lines.length - 1
                const actOnEnter = e.key === 'Enter' && isLast
                const actOnTab   = e.key === 'Tab'   && !e.shiftKey
                if (!actOnEnter && !actOnTab) return
                e.preventDefault()
                const q = 'input.field-input:not([type="number"]):not([disabled]):not([data-narration])'
                const c = e.target.closest('[data-lines]')
                if (actOnTab && !isLast) { if (c) { const ps = c.querySelectorAll(q); if (ps.length > idx + 1) ps[idx + 1].focus() }; return }
                if (!line.accountId && !parseFloat(line.amount)) { document.querySelector('input[data-narration]:not([disabled])')?.focus(); return }
                flushSync(onAdd)
                if (c) { const ps = c.querySelectorAll(q); if (ps.length) ps[ps.length - 1].focus() }
              }}
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
  const { currentEntityId, currentEntity } = useEntity()
  const [searchParams, setSearchParams] = useSearchParams()
  const editId = searchParams.get('edit') || null

  const [allCoa,    setAllCoa]    = useState([])
  const [voucherNo, setVoucherNo] = useState('')
  const [loaded,    setLoaded]    = useState(false)
  const [entryDate, setEntryDate] = useState(() => localISO(new Date()))
  const [refNo,     setRefNo]     = useState('')
  const [narration, setNarration] = useState('')

  const [debitLines,  setDebitLines]  = useState([newLine()])
  const [creditLines, setCreditLines] = useState([newLine()])

  const [showPrint,  setShowPrint] = useState(false)
  const [funds,   setFunds]   = useState([])
  const [fundId,  setFundId]  = useState('')
  const [saving,    setSaving]    = useState(false)
  const [posting,   setPosting]   = useState(false)
  const [isPosted,  setIsPosted]  = useState(false)
  const [voucherPfx, setVoucherPfx] = useState(null)

  const accounts = useMemo(() => getPostableAccountsWithPath(allCoa), [allCoa])

  const totalDebit  = debitLines.reduce((s, l)  => s + (parseFloat(l.amount)  || 0), 0)
  const totalCredit = creditLines.reduce((s, l) => s + (parseFloat(l.amount) || 0), 0)
  const diff = Math.abs(totalDebit - totalCredit)
  const isBalanced = totalDebit > 0 && totalCredit > 0 && diff < 0.01
  const hasDebitAccounts  = debitLines.every(l => l.accountId)
  const hasCreditAccounts = creditLines.every(l => l.accountId)
  const isValid = isBalanced && hasDebitAccounts && hasCreditAccounts
  const busy = saving || posting

  useEffect(() => { getFunds(true).then(setFunds).catch(() => {}) }, [])

  useEffect(() => {
    if (searchParams.get('coaRefresh')) {
      getChartOfAccounts(true, currentEntityId).then(setAllCoa).catch(() => {})
      setSearchParams(p => { const n = new URLSearchParams(p); n.delete('coaRefresh'); return n }, { replace: true })
    }
  }, [searchParams.get('coaRefresh')])

  useEffect(() => {
    const promises = [getChartOfAccounts(true, currentEntityId), getAccountingSettings()]
    if (editId) promises.push(getJournalEntryWithLines(editId))
    Promise.all(promises).then(async ([coa, s, existing]) => {
      if (existing) {
        const allLineIds = (existing.journal_entry_lines || []).map(l => l.account_id)
        const coaIds = new Set(coa.map(a => a.id))
        const missing = allLineIds.filter(id => id && !coaIds.has(id))
        if (missing.length) { const extra = await getAccountsByIds(missing); coa = [...coa, ...extra] }
      }
      setAllCoa(coa)
      if (editId && existing) {
        setIsPosted(existing.is_posted || false)
        setVoucherNo(existing.entry_number)
        setEntryDate(existing.entry_date || localISO(new Date()))
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
        const fy  = getFY()
        const pfx = { Journal: s.accounting_prefix_journal || 'JV' }
        setVoucherPfx(s.accounting_prefix_journal || 'JV')
        setVoucherNo(await nextEntryNumber(fy, 'Journal', currentEntityId, pfx))
      }
      setLoaded(true)
    }).catch(() => { toast('Failed to load data', 'error'); setLoaded(true) })
  }, [])

  useEffect(() => {
    if (editId || !voucherPfx || !currentEntityId) return
    nextEntryNumber(getFY(entryDate), 'Journal', currentEntityId, { Journal: voucherPfx })
      .then(setVoucherNo).catch(() => {})
  }, [entryDate])

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
        fund_id: fundId || null, entity_id: currentEntityId,
      }
      const jLines = [
        ...debitLines.map(l => ({ account_id: l.accountId, debit_amount: parseFloat(l.amount), credit_amount: 0, description: narration || null })),
        ...creditLines.map(l => ({ account_id: l.accountId, debit_amount: 0, credit_amount: parseFloat(l.amount), description: narration || null })),
      ]
      let je
      if (editId) {
        if (isPosted) {
          je = await updatePostedJournalEntry(editId, { ...entry, is_posted: true }, jLines, user?.email || 'system')
        } else {
          je = await updateJournalEntry(editId, entry, jLines, user?.email || 'system')
        }
        toast(`${voucherNo} updated`, 'success')
      } else {
        je = await createJournalEntry(entry, jLines, user?.email || 'system')
      }
      if (andPost && !isPosted) { await postJournalEntry(je.id, user?.email || 'system'); toast(`${voucherNo} posted`, 'success') }
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
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
          <button onClick={() => navigate('/accounting')}
            style={{ background: 'var(--accent)', border: 'none', borderRadius: 8, cursor: 'pointer', color: '#fff', padding: '6px 8px', display: 'flex', alignItems: 'center', flexShrink: 0 }}>
            <ArrowLeft size={16} />
          </button>
          <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--accent)', whiteSpace: 'nowrap' }}>Accounts</span>
        </div>
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

      {/* Posted-entry warning */}
      {editId && isPosted && (
        <div style={{ marginBottom: 14, padding: '10px 16px', borderRadius: 8, background: '#fefce8', border: '1.5px solid #fbbf24', display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: '#92400e' }}>
          <span style={{ fontSize: 16 }}>⚠️</span>
          <span><strong>This entry is already posted.</strong> Changes will update the posted record directly.</span>
        </div>
      )}

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
          allCoa={allCoa}
          entityId={currentEntityId}
          onAccountCreated={a => setAllCoa(prev => [...prev, a])}
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
          allCoa={allCoa}
          entityId={currentEntityId}
          onAccountCreated={a => setAllCoa(prev => [...prev, a])}
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
        entity={currentEntity}
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
