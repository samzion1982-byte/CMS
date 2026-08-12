import { useState, useEffect, useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import { useToast } from '../lib/toast'
import {
  getFY, fmtAmt,
  getChartOfAccounts, getAccountingSettings, getAccountsByIds,
  nextEntryNumber, createJournalEntry, updateJournalEntry, updatePostedJournalEntry,
  postJournalEntry, getJournalEntryWithLines,
} from '../lib/accountingLib'
import {
  Loader2, Save, CheckSquare, ArrowLeft, CheckCircle2,
  Banknote, Landmark, ArrowLeftRight, Printer,
} from 'lucide-react'
import { useEntity } from '../lib/EntityContext'
import NarrationInput from '../components/accounting/NarrationInput'
import VoucherPrint from '../components/accounting/VoucherPrint'
import { getChurch } from '../lib/supabase'

const localISO = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`

function acctIsBank(name) { return /bank/i.test(name) }
function acctBg(name)     { return acctIsBank(name) ? 'rgba(37,99,235,0.12)' : 'rgba(22,163,74,0.12)' }
function acctColor(name)  { return acctIsBank(name) ? '#2563eb' : '#16a34a' }

function AccCard({ acc, selected, dimmed, onClick }) {
  const col = acctColor(acc.name)
  const [hov, setHov] = useState(false)
  return (
    <button
      onClick={dimmed ? undefined : onClick}
      onMouseEnter={() => !dimmed && setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '9px 12px', borderRadius: 8, width: '100%', textAlign: 'left',
        border: selected ? `2px solid ${col}` : `1.5px solid ${hov ? 'var(--card-border)' : 'var(--card-border)'}`,
        background: selected ? `${col}14` : hov ? 'var(--sidebar-item-hover)' : 'var(--card-bg)',
        cursor: dimmed ? 'default' : 'pointer',
        opacity: dimmed ? 0.3 : 1,
        transition: 'all 0.12s',
        boxSizing: 'border-box',
      }}
    >
      <div style={{
        width: 26, height: 26, borderRadius: 6, flexShrink: 0,
        background: selected ? `${col}22` : acctBg(acc.name),
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {selected
          ? <CheckCircle2 size={14} color={col} />
          : acctIsBank(acc.name)
            ? <Landmark size={14} color={hov ? '#2563eb' : '#2563eb'} />
            : <Banknote  size={14} color={hov ? '#16a34a' : '#16a34a'} />
        }
      </div>
      <span style={{
        flex: 1, fontSize: 12,
        fontWeight: selected ? 700 : 500,
        color: selected ? col : 'var(--text-1)',
        lineHeight: 1.3,
      }}>
        {acc.name}
      </span>
      {selected && (
        <span style={{ fontSize: 10, fontWeight: 700, color: col, whiteSpace: 'nowrap' }}>✓ Selected</span>
      )}
    </button>
  )
}

function AccountColumn({ heading, bankAccounts, cashAccounts, selectedId, dimmedId, onSelect }) {
  const isFrom = heading === 'FROM'
  const hdrColor = isFrom ? '#7c3aed' : '#0891b2'
  const hdrBg    = isFrom ? 'rgba(124,58,237,0.06)' : 'rgba(8,145,178,0.06)'
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {/* Column header */}
      <div style={{
        padding: '10px 16px', background: hdrBg,
        borderBottom: `2px solid ${hdrColor}30`,
        display: 'flex', alignItems: 'center', gap: 8,
      }}>
        {isFrom
          ? <ArrowLeft  size={14} color={hdrColor} />
          : <ArrowLeftRight size={14} color={hdrColor} />
        }
        <span style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: hdrColor }}>
          {heading}
        </span>
        {selectedId && (
          <span style={{ fontSize: 11, color: hdrColor, fontWeight: 600, marginLeft: 'auto' }}>
            {[...bankAccounts, ...cashAccounts].find(a => a.id === selectedId)?.name}
          </span>
        )}
      </div>

      <div style={{ padding: '14px 14px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* Bank section */}
        {bankAccounts.length > 0 && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 8 }}>
              <Landmark size={11} color="#2563eb" />
              <span style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.09em', color: '#2563eb' }}>Bank Accounts</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {bankAccounts.map(acc => (
                <AccCard
                  key={acc.id} acc={acc}
                  selected={selectedId === acc.id}
                  dimmed={dimmedId === acc.id}
                  onClick={() => onSelect(acc.id, acc.name)}
                />
              ))}
            </div>
          </div>
        )}

        {/* Cash section */}
        {cashAccounts.length > 0 && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 8 }}>
              <Banknote size={11} color="#16a34a" />
              <span style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.09em', color: '#16a34a' }}>Cash Accounts</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {cashAccounts.map(acc => (
                <AccCard
                  key={acc.id} acc={acc}
                  selected={selectedId === acc.id}
                  dimmed={dimmedId === acc.id}
                  onClick={() => onSelect(acc.id, acc.name)}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

const ACCENT = '#7c3aed'

export default function ContraVoucherPage() {
  const { user }   = useAuth()
  const navigate   = useNavigate()
  const toast      = useToast()
  const { currentEntityId, currentEntity } = useEntity()
  const [searchParams] = useSearchParams()
  const editId = searchParams.get('edit') || null

  const [allCoa,    setAllCoa]    = useState([])
  const [voucherNo, setVoucherNo] = useState('')
  const [loaded,    setLoaded]    = useState(false)
  const [entryDate, setEntryDate] = useState(() => localISO(new Date()))
  const [refNo,     setRefNo]     = useState('')
  const [narration, setNarration] = useState('')
  const [fromId,    setFromId]    = useState('')
  const [fromLabel, setFromLabel] = useState('')
  const [toId,      setToId]      = useState('')
  const [toLabel,   setToLabel]   = useState('')
  const [amount,    setAmount]    = useState('')
  const [showPrint,  setShowPrint] = useState(false)
  const [saving,    setSaving]    = useState(false)
  const [posting,   setPosting]   = useState(false)
  const [isPosted,  setIsPosted]  = useState(false)
  const [voucherPfx, setVoucherPfx] = useState(null)

  // Only leaf cash/bank asset accounts; exclude bare group names like "Bank" / "Cash"
  const cashBankAccounts = useMemo(() => {
    const parentIds = new Set(allCoa.map(a => a.parent_id).filter(Boolean))
    return allCoa.filter(a => {
      if (a.account_type !== 'Asset') return false
      if (!/cash|hand|petty|bank/i.test(a.name)) return false
      if (parentIds.has(a.id) && /^(bank|cash)$/i.test(a.name.trim())) return false
      return true
    })
  }, [allCoa])

  const bankAccounts = useMemo(() => cashBankAccounts.filter(a =>  /bank/i.test(a.name)), [cashBankAccounts])
  const cashAccounts = useMemo(() => cashBankAccounts.filter(a => !/bank/i.test(a.name)), [cashBankAccounts])

  const isValid = fromId && toId && fromId !== toId && parseFloat(amount) > 0
  const busy    = saving || posting


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
        const debitLine  = existing.journal_entry_lines?.find(l => Number(l.debit_amount)  > 0)
        const creditLine = existing.journal_entry_lines?.find(l => Number(l.credit_amount) > 0)
        if (debitLine)  { setToId(debitLine.account_id);    setToLabel(debitLine.chart_of_accounts?.name   || '') }
        if (creditLine) { setFromId(creditLine.account_id); setFromLabel(creditLine.chart_of_accounts?.name || '') }
        setAmount(String(existing.total_debit || ''))
      } else {
        const fy  = getFY()
        const pfx = { Contra: s.accounting_prefix_contra || 'CT' }
        setVoucherPfx(s.accounting_prefix_contra || 'CT')
        setVoucherNo(await nextEntryNumber(fy, 'Contra', currentEntityId, pfx))
      }
      setLoaded(true)
    }).catch(() => { toast('Failed to load data', 'error'); setLoaded(true) })
  }, [])

  useEffect(() => {
    if (editId || !voucherPfx || !currentEntityId) return
    nextEntryNumber(getFY(entryDate), 'Contra', currentEntityId, { Contra: voucherPfx })
      .then(setVoucherNo).catch(() => {})
  }, [entryDate])

  function selectFrom(id, name) {
    setFromId(id); setFromLabel(name)
    if (toId === id) { setToId(''); setToLabel('') }
  }
  function selectTo(id, name) {
    setToId(id); setToLabel(name)
    if (fromId === id) { setFromId(''); setFromLabel('') }
  }

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
        entity_id: currentEntityId,
      }
      const jLines = [
        { account_id: toId,   debit_amount: amt, credit_amount: 0,   description: narration || null },
        { account_id: fromId, debit_amount: 0,   credit_amount: amt, description: narration || null },
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
    <div style={{ maxWidth: 860, margin: '0 auto' }}>

      {/* ── Header ─────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
          <button onClick={() => navigate('/accounting')}
            style={{ background: 'var(--accent)', border: 'none', borderRadius: 8, cursor: 'pointer', color: '#fff', padding: '6px 8px', display: 'flex', alignItems: 'center', flexShrink: 0 }}>
            <ArrowLeft size={16} />
          </button>
          <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--accent)', whiteSpace: 'nowrap' }}>Accounts</span>
        </div>
        <div style={{ flex: 1 }}>
          <h1 className="page-title" style={{ marginBottom: 1 }}>{editId ? 'Edit Contra Entry' : 'Contra Entry'}</h1>
          <p className="page-subtitle" style={{ margin: 0 }}>Transfer between cash and bank accounts</p>
        </div>
        <div style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 13, color: ACCENT, background: '#f3e8ff', padding: '4px 10px', borderRadius: 6 }}>
          {voucherNo}
        </div>
        <button onClick={() => setShowPrint(true)}
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

      {/* ── Voucher meta ────────────────────────────────────────── */}
      <div className="card" style={{ marginBottom: 16, padding: '14px 18px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr 1fr', gap: '10px 16px' }}>
          <div>
            <label className="field-label" style={{ display: 'block', marginBottom: 4 }}>Date *</label>
            <input className="field-input" type="date" value={entryDate} onChange={e => setEntryDate(e.target.value)} disabled={busy} />
          </div>
          <div>
            <label className="field-label" style={{ display: 'block', marginBottom: 4 }}>Narration</label>
            <NarrationInput placeholder="e.g. Cash deposited to bank" value={narration} onChange={setNarration} disabled={busy} />
          </div>
          <div>
            <label className="field-label" style={{ display: 'block', marginBottom: 4 }}>Reference No</label>
            <input className="field-input" placeholder="Slip / txn no" value={refNo} onChange={e => setRefNo(e.target.value)} disabled={busy} />
          </div>
        </div>
      </div>

      {/* ── From | To panels ────────────────────────────────────── */}
      {cashBankAccounts.length === 0 ? (
        <div className="card" style={{ padding: '48px 20px', textAlign: 'center', color: 'var(--text-3)' }}>
          <p style={{ margin: 0, fontSize: 13 }}>No cash or bank accounts found. Add them in Chart of Accounts first.</p>
        </div>
      ) : (
        <div className="card" style={{ marginBottom: 16, overflow: 'hidden', padding: 0 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1px 1fr' }}>
            {/* FROM column */}
            <AccountColumn
              heading="FROM"
              bankAccounts={bankAccounts}
              cashAccounts={cashAccounts}
              selectedId={fromId}
              dimmedId={toId}
              onSelect={selectFrom}
            />
            {/* Divider */}
            <div style={{ background: 'var(--card-border)' }} />
            {/* TO column */}
            <AccountColumn
              heading="TO"
              bankAccounts={bankAccounts}
              cashAccounts={cashAccounts}
              selectedId={toId}
              dimmedId={fromId}
              onSelect={selectTo}
            />
          </div>
        </div>
      )}

      {/* ── Transfer summary + Amount + Actions ─────────────────── */}
      <div className="card" style={{ padding: '18px 20px' }}>
        {/* Summary bar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, padding: '10px 14px', borderRadius: 8, background: 'rgba(124,58,237,0.05)', border: '1.5px solid rgba(124,58,237,0.15)' }}>
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {fromId
                ? <><div style={{ width: 20, height: 20, borderRadius: 5, background: acctBg(fromLabel), display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {acctIsBank(fromLabel) ? <Landmark size={11} color="#2563eb" /> : <Banknote size={11} color="#16a34a" />}
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-1)' }}>{fromLabel}</span></>
                : <span style={{ fontSize: 12, color: 'var(--text-3)' }}>Select FROM account</span>
              }
            </div>
            <ArrowLeftRight size={13} color={fromId && toId ? ACCENT : 'var(--text-3)'} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {toId
                ? <><div style={{ width: 20, height: 20, borderRadius: 5, background: acctBg(toLabel), display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {acctIsBank(toLabel) ? <Landmark size={11} color="#2563eb" /> : <Banknote size={11} color="#16a34a" />}
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-1)' }}>{toLabel}</span></>
                : <span style={{ fontSize: 12, color: 'var(--text-3)' }}>Select TO account</span>
              }
            </div>
          </div>
          {isValid && <CheckCircle2 size={16} color="#16a34a" />}
        </div>

        {/* Amount row + buttons */}
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12 }}>
          <div style={{ flex: 1 }}>
            <label className="field-label" style={{ display: 'block', marginBottom: 6 }}>Transfer Amount (₹) *</label>
            <input
              type="number" min="0" step="0.01" placeholder="0.00"
              value={amount} onChange={e => setAmount(e.target.value)} disabled={busy}
              className="field-input"
              style={{ fontSize: 20, fontWeight: 800, fontFamily: 'monospace', textAlign: 'right', height: 48 }}
            />
            {parseFloat(amount) > 0 && (
              <p style={{ textAlign: 'right', fontSize: 11, color: 'var(--text-3)', marginTop: 4 }}>{fmtAmt(parseFloat(amount))}</p>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8, paddingBottom: parseFloat(amount) > 0 ? 24 : 0 }}>
            <button onClick={() => handleSave(false)} disabled={!isValid || busy}
              style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '12px 18px', background: isValid ? '#f3e8ff' : '#e5e7eb', color: isValid ? ACCENT : '#9ca3af', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: isValid ? 'pointer' : 'not-allowed', whiteSpace: 'nowrap' }}>
              {saving ? <Loader2 size={14} style={{ animation: 'spin 0.7s linear infinite' }} /> : <Save size={14} />}
              Save Draft
            </button>
            <button onClick={() => handleSave(true)} disabled={!isValid || busy}
              style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '12px 18px', background: isValid ? ACCENT : '#e5e7eb', color: isValid ? '#fff' : '#9ca3af', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: isValid ? 'pointer' : 'not-allowed', whiteSpace: 'nowrap' }}>
              {posting ? <Loader2 size={14} style={{ animation: 'spin 0.7s linear infinite' }} /> : <CheckSquare size={14} />}
              Post
            </button>
          </div>
        </div>
      </div>

      <VoucherPrint
        open={showPrint} onClose={() => setShowPrint(false)}
        entity={currentEntity}
        voucherType="Contra"
        voucherNo={voucherNo}
        date={entryDate}
        refNo={refNo}
        narration={narration}
        rows={[
          { label: `Dr: ${toLabel}`,   amount: parseFloat(amount) || 0, bold: true },
          { label: `Cr: ${fromLabel}`, amount: parseFloat(amount) || 0, bold: true },
        ]}
        totalAmount={parseFloat(amount) || 0}
      />
    </div>
  )
}
