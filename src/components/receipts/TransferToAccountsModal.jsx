import { useState, useEffect, useCallback, useRef } from 'react'
import {
  ArrowRightLeft, Loader2, CheckCircle, ChevronDown, ChevronRight,
  RotateCcw, AlertTriangle, X, Info,
} from 'lucide-react'
import {
  getUntransferredReceipts,
  getUntransferredRange,
  aggregateByCategoryAndMode,
  getAccountingEntities,
  getCashAccountsForTransfer,
  getBankAccountsForTransfer,
  executeTransfer,
  getTransferBatches,
  reverseTransfer,
} from '../../lib/receiptTransferLib'
import { supabase } from '../../lib/supabase'
import { getActiveCategories } from '../../lib/paymentCategories'

const MODAL_Z = 2000

function fmtDate(iso) {
  if (!iso) return '—'
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  const [y, m, d] = iso.split('-')
  return `${d}-${months[parseInt(m, 10) - 1]}-${y}`
}

function fmtAmt(n) {
  if (!n && n !== 0) return '—'
  return '₹' + Number(n).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

export default function TransferToAccountsModal({ profile, fy, toast, onClose, onTransferred }) {
  const [tab, setTab]           = useState('transfer')  // 'transfer' | 'history'

  // Transfer form
  const [fromDate,      setFromDate]      = useState('')
  const [toDate,        setToDate]        = useState('')
  const [fromReceiptNo, setFromReceiptNo] = useState('')
  const [toReceiptNo,   setToReceiptNo]   = useState('')
  const [entities,      setEntities]      = useState([])
  const [selEntityId,   setSelEntityId]   = useState('')
  const [cashAccounts,  setCashAccounts]  = useState([])
  const [selCashId,     setSelCashId]     = useState('')
  const [bankAccounts,  setBankAccounts]  = useState([])
  const [selBankId,     setSelBankId]     = useState('')

  // Preview
  const [previewing,    setPreviewing]    = useState(false)
  const [previewData,   setPreviewData]   = useState(null)   // { receipts, cashByCategory, bankByCategory, cashTotal, bankTotal, categories }
  const [categories,    setCategories]    = useState([])

  // Transfer execution
  const [transferring,  setTransferring]  = useState(false)
  const [done,          setDone]          = useState(false)

  // History
  const [batches,       setBatches]       = useState([])
  const [histLoading,   setHistLoading]   = useState(false)
  const [expandedBatch, setExpandedBatch] = useState(null)

  // Reversal
  const [reverseTarget, setReverseTarget] = useState(null)  // batch id
  const [reversePw,     setReversePw]     = useState('')
  const [datesReady, setDatesReady] = useState(false)  // true after initial auto-fill renders
  const [reversing,     setReversing]     = useState(false)

  // ── Init ─────────────────────────────────────────────────────────
  useEffect(() => {
    Promise.all([
      getAccountingEntities(),
      getActiveCategories(),
    ]).then(([ents, cats]) => {
      setEntities(ents)
      setCategories(cats)
      // Auto-select: prefer the entity the user last used in Accounting module
      const stored    = sessionStorage.getItem('ac_entity_id')
      const defStored = localStorage.getItem('ac_default_entity_id')
      const pick = (stored && ents.find(e => e.id === stored))
        || (defStored && ents.find(e => e.id === defStored))
        || ents[0]
      if (pick) setSelEntityId(pick.id)
    }).catch(e => toast(e.message, 'error'))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Re-fetch cash/bank COA accounts when entity changes
  useEffect(() => {
    setCashAccounts([]); setBankAccounts([])
    setSelCashId('');    setSelBankId('')
    setPreviewData(null)
    Promise.all([
      getCashAccountsForTransfer(selEntityId || undefined),
      getBankAccountsForTransfer(selEntityId || undefined),
    ]).then(([cash, banks]) => {
      setCashAccounts(cash)
      setBankAccounts(banks)
      if (cash.length  === 1) setSelCashId(cash[0].id)
      if (banks.length === 1) setSelBankId(banks[0].id)
    }).catch(() => {})
  }, [selEntityId])  // eslint-disable-line react-hooks/exhaustive-deps

  // Initial load: fill dates and receipt numbers from the FY-wide untransferred range
  useEffect(() => {
    setDatesReady(false)
    getUntransferredRange(fy).then(r => {
      if (r.fromDate)      setFromDate(r.fromDate)
      if (r.toDate)        setToDate(r.toDate)
      if (r.fromReceiptNo) setFromReceiptNo(r.fromReceiptNo)
      if (r.toReceiptNo)   setToReceiptNo(r.toReceiptNo)
    }).catch(() => {}).finally(() => setDatesReady(true))
  }, [fy])

  // Re-fetch receipt number range whenever the user changes the date range.
  // Only runs after the initial auto-fill has rendered (datesReady = true).
  useEffect(() => {
    if (!datesReady || !fromDate || !toDate) return
    getUntransferredRange(fy, fromDate, toDate).then(r => {
      if (r.fromReceiptNo) setFromReceiptNo(r.fromReceiptNo)
      if (r.toReceiptNo)   setToReceiptNo(r.toReceiptNo)
    }).catch(() => {})
  }, [fromDate, toDate, fy, datesReady])

  const loadHistory = useCallback(async () => {
    setHistLoading(true)
    try {
      const data = await getTransferBatches(fy)
      setBatches(data)
    } catch (e) { toast(e.message, 'error') }
    setHistLoading(false)
  }, [fy, toast])

  useEffect(() => { if (tab === 'history') loadHistory() }, [tab, loadHistory])

  // ── Preview ───────────────────────────────────────────────────────
  const handlePreview = async () => {
    if (entities.length > 0 && !selEntityId) { toast('Select an accounting book', 'error'); return }
    if (!fromDate || !toDate) { toast('Select From and To date', 'error'); return }
    setPreviewing(true)
    setPreviewData(null)
    try {
      const receipts = await getUntransferredReceipts({ fromDate, toDate, fromReceiptNo, toReceiptNo })
      if (!receipts.length) {
        toast('No untransferred receipts found in this range.', 'info')
        setPreviewing(false)
        return
      }
      const { cashByCategory, bankByCategory, cashTotal, bankTotal } = aggregateByCategoryAndMode(receipts)
      setPreviewData({ receipts, cashByCategory, bankByCategory, cashTotal, bankTotal })
    } catch (e) { toast(e.message, 'error') }
    setPreviewing(false)
  }

  // ── Execute transfer ──────────────────────────────────────────────
  const handleTransfer = async () => {
    if (!previewData) return
    if (previewData.cashTotal > 0 && !selCashId) {
      toast('Select a Cash account for the Cash JV', 'error'); return
    }
    if (previewData.bankTotal > 0 && !selBankId) {
      toast('Select a Bank account for the Bank JV', 'error'); return
    }

    setTransferring(true)
    try {
      await executeTransfer({
        receipts:         previewData.receipts,
        fromDate,
        toDate,
        fromReceiptNo:    fromReceiptNo || previewData.receipts[0]?.receipt_number,
        toReceiptNo:      toReceiptNo   || previewData.receipts.at(-1)?.receipt_number,
        cashCoaAccountId: selCashId    || null,
        bankCoaAccountId: selBankId    || null,
        entityId:         selEntityId  || null,
        performedBy:      profile?.email || 'system',
      })
      setDone(true)
      onTransferred?.()
    } catch (e) { toast(e.message, 'error') }
    setTransferring(false)
  }

  // ── Reverse ───────────────────────────────────────────────────────
  const handleReverse = async () => {
    if (!reversePw) { toast('Enter your login password', 'error'); return }
    setReversing(true)
    try {
      await reverseTransfer(reverseTarget, reversePw, profile?.email || 'system')
      toast('Transfer reversed successfully', 'success')
      setReverseTarget(null)
      setReversePw('')
      loadHistory()
    } catch (e) { toast(e.message, 'error') }
    setReversing(false)
  }

  // ── Category name lookup ──────────────────────────────────────────
  const catName = (id) => categories.find(c => c.id === id)?.name || id

  // ── Render ────────────────────────────────────────────────────────
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: MODAL_Z, padding: 16,
    }} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{
        background: 'var(--card-bg)', borderRadius: 14, width: '100%', maxWidth: 960,
        maxHeight: '90vh', display: 'flex', flexDirection: 'column',
        boxShadow: '0 24px 60px rgba(0,0,0,0.25)',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '16px 20px', borderBottom: '1px solid var(--card-border)',
          flexShrink: 0,
        }}>
          <ArrowRightLeft size={18} style={{ color: 'var(--accent)' }}/>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-1)' }}>Transfer to Accounts</div>
            <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 1 }}>
              FY {fy} — creates Receipt Vouchers in the Accounting module
            </div>
          </div>
          <button onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 4 }}>
            <X size={18}/>
          </button>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--card-border)', flexShrink: 0 }}>
          {[['transfer','Transfer'], ['history','History']].map(([key, label]) => (
            <button key={key} onClick={() => setTab(key)}
              style={{
                flex: 1, padding: '10px 0', background: 'none', border: 'none',
                cursor: 'pointer', fontSize: 13, fontWeight: tab === key ? 700 : 500,
                color: tab === key ? 'var(--accent)' : 'var(--text-2)',
                borderBottom: tab === key ? '2px solid var(--accent)' : '2px solid transparent',
              }}>{label}</button>
          ))}
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>

          {/* ═══ TRANSFER TAB ═══ */}
          {tab === 'transfer' && !done && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

              {/* Accounting Book (Entity) selector */}
              {entities.length > 0 && (
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)' }}>Accounting Book</span>
                  <select value={selEntityId} onChange={e => setSelEntityId(e.target.value)}
                    style={{ padding: '7px 10px', borderRadius: 7, border: '1px solid var(--card-border)', background: 'var(--input-bg)', color: 'var(--text-1)', fontSize: 13 }}>
                    <option value="">— Select accounting book —</option>
                    {entities.map(e => (
                      <option key={e.id} value={e.id}>{e.name}</option>
                    ))}
                  </select>
                </label>
              )}

              {/* Date Range */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)' }}>From Date</span>
                  <input type="date" value={fromDate} onChange={e => { setFromDate(e.target.value); setPreviewData(null) }}
                    style={{ padding: '7px 10px', borderRadius: 7, border: '1px solid var(--card-border)', background: 'var(--input-bg)', color: 'var(--text-1)', fontSize: 13 }}/>
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)' }}>To Date</span>
                  <input type="date" value={toDate} onChange={e => { setToDate(e.target.value); setPreviewData(null) }}
                    style={{ padding: '7px 10px', borderRadius: 7, border: '1px solid var(--card-border)', background: 'var(--input-bg)', color: 'var(--text-1)', fontSize: 13 }}/>
                </label>
              </div>

              {/* Receipt Number Range */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)' }}>From Receipt No.</span>
                  <input type="text" value={fromReceiptNo} onChange={e => { setFromReceiptNo(e.target.value); setPreviewData(null) }}
                    placeholder="e.g. 2026-27_000001"
                    style={{ padding: '7px 10px', borderRadius: 7, border: '1px solid var(--card-border)', background: 'var(--input-bg)', color: 'var(--text-1)', fontSize: 13 }}/>
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)' }}>To Receipt No.</span>
                  <input type="text" value={toReceiptNo} onChange={e => { setToReceiptNo(e.target.value); setPreviewData(null) }}
                    placeholder="e.g. 2026-27_000602"
                    style={{ padding: '7px 10px', borderRadius: 7, border: '1px solid var(--card-border)', background: 'var(--input-bg)', color: 'var(--text-1)', fontSize: 13 }}/>
                </label>
              </div>

              {/* Preview button */}
              {!previewData && (
                <button onClick={handlePreview} disabled={previewing}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                    padding: '9px 20px', borderRadius: 8, border: 'none', cursor: 'pointer',
                    background: 'var(--sidebar-bg)', color: '#fff', fontWeight: 600, fontSize: 13,
                    opacity: previewing ? 0.7 : 1,
                  }}>
                  {previewing ? <Loader2 size={14} className="animate-spin"/> : <ArrowRightLeft size={14}/>}
                  {previewing ? 'Loading preview…' : 'Preview Transfer'}
                </button>
              )}

              {/* Preview panel — 2-column layout */}
              {previewData && (
                <>
                  {/* Header row */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)' }}>
                      Preview — {previewData.receipts.length} receipt{previewData.receipts.length !== 1 ? 's' : ''}
                    </span>
                    <button onClick={() => setPreviewData(null)}
                      style={{ fontSize: 11, color: 'var(--text-3)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>
                      Change range
                    </button>
                  </div>

                  {/* Two-column JV panels */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>

                    {/* ── LEFT: Cash ── */}
                    <div style={{
                      border: '1px solid #bbf7d0', borderRadius: 10, padding: 14,
                      background: 'rgba(22,163,74,0.03)',
                      display: 'flex', flexDirection: 'column', gap: 10,
                    }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: '#16a34a', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                        Cash JV (Receipt Voucher)
                      </div>

                      {previewData.cashTotal > 0 ? (
                        <>
                          {/* Account selector */}
                          {cashAccounts.length === 0 ? (
                            <div style={{ fontSize: 11, color: '#d97706', display: 'flex', alignItems: 'center', gap: 5 }}>
                              <AlertTriangle size={12}/> No cash accounts in COA
                            </div>
                          ) : (
                            <select value={selCashId} onChange={e => setSelCashId(e.target.value)}
                              style={{ width: '100%', padding: '5px 8px', borderRadius: 6, border: '1px solid #bbf7d0', background: 'var(--input-bg)', color: 'var(--text-1)', fontSize: 12 }}>
                              <option value="">— Select cash account —</option>
                              {cashAccounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                            </select>
                          )}
                          {/* JV lines */}
                          <JVLines
                            debitLabel={cashAccounts.find(a => a.id === selCashId)?.name || '—'}
                            debitAmt={previewData.cashTotal}
                            byCategory={previewData.cashByCategory}
                            catName={catName}
                            color="#16a34a"
                            categories={categories}
                          />
                        </>
                      ) : (
                        <div style={{ fontSize: 12, color: 'var(--text-3)', fontStyle: 'italic' }}>No cash receipts</div>
                      )}
                    </div>

                    {/* ── RIGHT: Bank ── */}
                    <div style={{
                      border: '1px solid #bfdbfe', borderRadius: 10, padding: 14,
                      background: 'rgba(37,99,235,0.03)',
                      display: 'flex', flexDirection: 'column', gap: 10,
                    }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: '#2563eb', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                        Bank JV (Receipt Voucher)
                      </div>

                      {previewData.bankTotal > 0 ? (
                        <>
                          {/* Account selector */}
                          {bankAccounts.length === 0 ? (
                            <div style={{ fontSize: 11, color: '#d97706', display: 'flex', alignItems: 'center', gap: 5 }}>
                              <AlertTriangle size={12}/> No bank accounts in COA
                            </div>
                          ) : (
                            <select value={selBankId} onChange={e => setSelBankId(e.target.value)}
                              style={{ width: '100%', padding: '5px 8px', borderRadius: 6, border: '1px solid #bfdbfe', background: 'var(--input-bg)', color: 'var(--text-1)', fontSize: 12 }}>
                              <option value="">— Select bank account —</option>
                              {bankAccounts.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                            </select>
                          )}
                          {/* JV lines */}
                          <JVLines
                            debitLabel={bankAccounts.find(b => b.id === selBankId)?.name || '—'}
                            debitAmt={previewData.bankTotal}
                            byCategory={previewData.bankByCategory}
                            catName={catName}
                            color="#2563eb"
                            categories={categories}
                          />
                        </>
                      ) : (
                        <div style={{ fontSize: 12, color: 'var(--text-3)', fontStyle: 'italic' }}>No bank receipts</div>
                      )}
                    </div>
                  </div>

                  {/* Info + Execute */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{
                      flex: 1, padding: '7px 10px', borderRadius: 7,
                      background: 'rgba(37,99,235,0.06)', border: '1px solid rgba(37,99,235,0.15)',
                      fontSize: 11, color: '#1d4ed8', display: 'flex', alignItems: 'center', gap: 6,
                    }}>
                      <Info size={12} style={{ flexShrink: 0 }}/>
                      Unmapped categories will be auto-created under &ldquo;Receipt Income&rdquo; in COA.
                    </div>
                    <button onClick={handleTransfer} disabled={transferring}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 7, whiteSpace: 'nowrap',
                        padding: '9px 20px', borderRadius: 8, border: 'none', cursor: 'pointer',
                        background: '#16a34a', color: '#fff', fontWeight: 700, fontSize: 13,
                        opacity: transferring ? 0.7 : 1,
                      }}>
                      {transferring ? <Loader2 size={14} className="animate-spin"/> : <ArrowRightLeft size={14}/>}
                      {transferring ? 'Transferring…' : 'Execute Transfer'}
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          {/* ═══ DONE STATE ═══ */}
          {tab === 'transfer' && done && (
            <div style={{ textAlign: 'center', padding: '32px 0' }}>
              <CheckCircle size={48} style={{ color: '#16a34a', marginBottom: 16 }}/>
              <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-1)', marginBottom: 8 }}>
                Transfer Complete!
              </div>
              <div style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 24 }}>
                Journal entries created and receipts marked as transferred.
              </div>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
                <button onClick={() => { setDone(false); setPreviewData(null) }}
                  style={{ padding: '8px 18px', borderRadius: 8, border: '1px solid var(--card-border)', background: 'none', cursor: 'pointer', fontSize: 13, color: 'var(--text-1)' }}>
                  Transfer Another Range
                </button>
                <button onClick={() => { setTab('history'); loadHistory() }}
                  style={{ padding: '8px 18px', borderRadius: 8, border: 'none', background: 'var(--sidebar-bg)', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
                  View History
                </button>
              </div>
            </div>
          )}

          {/* ═══ HISTORY TAB ═══ */}
          {tab === 'history' && (
            <div>
              {histLoading ? (
                <div style={{ textAlign: 'center', padding: 32, color: 'var(--text-3)' }}>
                  <Loader2 size={22} className="animate-spin"/>
                </div>
              ) : batches.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 32, color: 'var(--text-3)', fontSize: 13 }}>
                  No transfers done yet for FY {fy}.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {batches.map(b => (
                    <div key={b.id} style={{
                      border: '1px solid var(--card-border)', borderRadius: 10,
                      overflow: 'hidden',
                      opacity: b.is_reversed ? 0.6 : 1,
                    }}>
                      <div style={{
                        display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px',
                        cursor: 'pointer', background: expandedBatch === b.id ? 'var(--page-bg)' : 'transparent',
                      }} onClick={() => setExpandedBatch(expandedBatch === b.id ? null : b.id)}>
                        {expandedBatch === b.id
                          ? <ChevronDown size={14} style={{ color: 'var(--text-3)', flexShrink: 0 }}/>
                          : <ChevronRight size={14} style={{ color: 'var(--text-3)', flexShrink: 0 }}/>
                        }
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>
                            {fmtDate(b.from_date)} to {fmtDate(b.to_date)}
                            {b.is_reversed && <span style={{ marginLeft: 8, fontSize: 10, fontWeight: 700, color: '#b91c1c', background: '#fee2e2', padding: '1px 6px', borderRadius: 4 }}>REVERSED</span>}
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>
                            {b.from_receipt_no} → {b.to_receipt_no} &nbsp;·&nbsp; {b.receipt_count} receipt{b.receipt_count !== 1 ? 's' : ''}
                          </div>
                        </div>
                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)', fontVariantNumeric: 'tabular-nums' }}>
                            {fmtAmt(Number(b.cash_total) + Number(b.bank_total))}
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--text-3)' }}>
                            Cash {fmtAmt(b.cash_total)} · Bank {fmtAmt(b.bank_total)}
                          </div>
                        </div>
                      </div>

                      {expandedBatch === b.id && (
                        <div style={{ padding: '0 14px 12px', borderTop: '1px solid var(--card-border)' }}>
                          <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 10, marginBottom: 8 }}>
                            Transferred on {new Date(b.transferred_at).toLocaleString('en-IN')} by {b.transferred_by || '—'}
                          </div>
                          <div style={{ display: 'flex', gap: 8 }}>
                            {b.cash_journal_id && (
                              <span style={{ fontSize: 11, padding: '3px 8px', borderRadius: 5, background: '#dcfce7', color: '#16a34a', fontWeight: 600 }}>
                                Cash JV created
                              </span>
                            )}
                            {b.bank_journal_id && (
                              <span style={{ fontSize: 11, padding: '3px 8px', borderRadius: 5, background: '#dbeafe', color: '#2563eb', fontWeight: 600 }}>
                                Bank JV created
                              </span>
                            )}
                          </div>
                          {!b.is_reversed && (
                            <div style={{ marginTop: 12 }}>
                              {reverseTarget === b.id ? (
                                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                  <input
                                    type="password"
                                    value={reversePw}
                                    onChange={e => setReversePw(e.target.value)}
                                    placeholder="Your login password"
                                    style={{ flex: 1, padding: '6px 10px', borderRadius: 7, border: '1px solid var(--card-border)', background: 'var(--input-bg)', color: 'var(--text-1)', fontSize: 12 }}
                                  />
                                  <button onClick={handleReverse} disabled={reversing}
                                    style={{ padding: '6px 14px', borderRadius: 7, border: 'none', background: '#b91c1c', color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap' }}>
                                    {reversing ? <Loader2 size={12} className="animate-spin"/> : 'Confirm Reverse'}
                                  </button>
                                  <button onClick={() => { setReverseTarget(null); setReversePw('') }}
                                    style={{ padding: '6px 12px', borderRadius: 7, border: '1px solid var(--card-border)', background: 'none', cursor: 'pointer', fontSize: 12 }}>
                                    Cancel
                                  </button>
                                </div>
                              ) : (
                                <button onClick={() => { setReverseTarget(b.id); setReversePw('') }}
                                  style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 12px', borderRadius: 7, border: '1px solid #fca5a5', background: '#fff1f2', color: '#b91c1c', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                                  <RotateCcw size={12}/> Reverse Transfer
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── JV Lines sub-component ────────────────────────────────────────

function JVLines({ debitLabel, debitAmt, byCategory, catName, color, categories }) {
  const lines = Object.entries(byCategory)
    .filter(([, amt]) => amt > 0)
    .sort(([aId], [bId]) => {
      const ai = categories.findIndex(c => c.id === aId)
      const bi = categories.findIndex(c => c.id === bId)
      return (ai === -1 ? 9999 : ai) - (bi === -1 ? 9999 : bi)
    })
  return (
    <div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <tbody>
          <tr>
            <td style={{ padding: '4px 8px', color: 'var(--text-2)', whiteSpace: 'nowrap' }}>
              <span style={{ fontWeight: 600 }}>Dr</span> &nbsp;{debitLabel}
            </td>
            <td style={{ padding: '4px 8px', textAlign: 'right', fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: 'var(--text-1)', whiteSpace: 'nowrap' }}>
              {fmtAmt(debitAmt)}
            </td>
          </tr>
          {lines.map(([catId, amt]) => (
            <tr key={catId} style={{ background: 'rgba(0,0,0,0.02)' }}>
              <td style={{ padding: '4px 8px 4px 24px', color: 'var(--text-3)', whiteSpace: 'nowrap' }}>
                <span style={{ fontWeight: 600 }}>Cr</span> &nbsp;{catName(catId)}
              </td>
              <td style={{ padding: '4px 8px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: 'var(--text-2)', whiteSpace: 'nowrap' }}>
                {fmtAmt(amt)}
              </td>
            </tr>
          ))}
          <tr style={{ borderTop: '1px solid var(--card-border)' }}>
            <td style={{ padding: '4px 8px', fontSize: 11, fontWeight: 700, color: 'var(--text-3)' }}>Total</td>
            <td style={{ padding: '4px 8px', textAlign: 'right', fontWeight: 700, fontVariantNumeric: 'tabular-nums', color }}>
              {fmtAmt(debitAmt)}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}
