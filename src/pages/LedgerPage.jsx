/* ═══════════════════════════════════════════════════════════════
   LedgerPage.jsx — Account Ledger View (multi-account)
   ═══════════════════════════════════════════════════════════════ */

import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useToast } from '../lib/toast'
import { getLedger, getChartOfAccounts, getPostableAccountsWithPath, getFY, fyDateRange, fmtAmt, TYPE_COLOR, displayAccountType } from '../lib/accountingLib'
import { exportToExcel } from '../lib/exportExcel'
import { getChurch } from '../lib/supabase'
import { BookMarked, ArrowLeft, Loader2, FileSpreadsheet, Printer, Search, X } from 'lucide-react'
import DatePresets from '../components/accounting/DatePresets'

// ── Account multi-select dropdown ────────────────────────────────
function AccountSelector({ accounts, selectedIds, onChange }) {
  const [open,  setOpen]  = useState(false)
  const [query, setQuery] = useState('')
  const wrapRef = useRef(null)
  const types   = ['Asset', 'Liability', 'Equity', 'Income', 'Expense']

  // Close on outside click
  useEffect(() => {
    function onDown(e) { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [])

  const filtered = query.trim()
    ? accounts.filter(a => a.name.toLowerCase().includes(query.toLowerCase()))
    : accounts

  function toggle(id) {
    const next = new Set(selectedIds)
    next.has(id) ? next.delete(id) : next.add(id)
    onChange(next)
  }

  function toggleGroup(type) {
    const group = filtered.filter(a => a.account_type === type)
    const allSel = group.every(a => selectedIds.has(a.id))
    const next = new Set(selectedIds)
    group.forEach(a => allSel ? next.delete(a.id) : next.add(a.id))
    onChange(next)
  }

  // Label shown on the trigger button
  const triggerLabel = selectedIds.size === 0
    ? 'Select accounts…'
    : selectedIds.size === 1
      ? accounts.find(a => a.id === [...selectedIds][0])?.name || '1 account'
      : `${selectedIds.size} accounts selected`

  return (
    <div ref={wrapRef} style={{ position: 'relative', flex: 2, minWidth: 220 }}>
      <label style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-3)', display: 'block', marginBottom: 5 }}>Account *</label>

      {/* Trigger */}
      <button
        onClick={() => setOpen(o => !o)}
        style={{ width: '100%', height: 36, padding: '0 10px', border: `1.5px solid ${open ? 'var(--accent)' : 'var(--card-border)'}`, borderRadius: 8, fontSize: 13, background: 'var(--input-bg)', color: selectedIds.size ? 'var(--text-1)' : 'var(--text-3)', cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, outline: 'none' }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{triggerLabel}</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          {selectedIds.size > 0 && (
            <span
              onMouseDown={e => { e.stopPropagation(); onChange(new Set()) }}
              style={{ display: 'flex', alignItems: 'center', color: 'var(--text-3)', padding: 2, borderRadius: 4 }}
            >
              <X size={12} />
            </span>
          )}
          <svg width="12" height="12" viewBox="0 0 12 12" style={{ transition: 'transform 0.15s', transform: open ? 'rotate(180deg)' : 'none', color: 'var(--text-3)' }}>
            <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" />
          </svg>
        </span>
      </button>

      {/* Dropdown panel */}
      {open && (
        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 400, marginTop: 4, background: 'var(--card-bg)', border: '1.5px solid var(--card-border)', borderRadius: 10, boxShadow: '0 8px 32px rgba(0,0,0,0.18)', overflow: 'hidden' }}>

          {/* Search */}
          <div style={{ padding: '8px 10px', borderBottom: '1px solid var(--card-border)', position: 'relative' }}>
            <Search size={12} style={{ position: 'absolute', left: 18, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)', pointerEvents: 'none' }} />
            <input
              autoFocus
              value={query} onChange={e => setQuery(e.target.value)}
              placeholder="Search accounts…"
              style={{ width: '100%', height: 30, padding: '0 8px 0 26px', border: '1px solid var(--card-border)', borderRadius: 6, fontSize: 12, background: 'var(--input-bg)', color: 'var(--text-1)', outline: 'none', boxSizing: 'border-box' }}
            />
          </div>

          {/* Grouped checkboxes */}
          <div style={{ maxHeight: 280, overflowY: 'auto', padding: '6px 0' }}>
            {types.map(type => {
              const group = filtered.filter(a => a.account_type === type)
              if (!group.length) return null
              const allSel  = group.every(a => selectedIds.has(a.id))
              const someSel = group.some(a => selectedIds.has(a.id))
              const tc      = TYPE_COLOR[type] || { text: '#475569' }
              return (
                <div key={type}>
                  {/* Group header row */}
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 12px', cursor: 'pointer', background: tc.text + '0a' }}>
                    <input type="checkbox" checked={allSel}
                      ref={el => { if (el) el.indeterminate = someSel && !allSel }}
                      onChange={() => toggleGroup(type)}
                      style={{ cursor: 'pointer', accentColor: tc.text, flexShrink: 0 }} />
                    <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: tc.text }}>
                      {displayAccountType(type)}
                    </span>
                  </label>

                  {/* Account rows */}
                  {group.map(a => {
                    const sel = selectedIds.has(a.id)
                    return (
                      <label key={a.id}
                        style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px 6px 28px', cursor: 'pointer', background: sel ? tc.text + '0d' : 'transparent' }}
                        onMouseEnter={e => { if (!sel) e.currentTarget.style.background = 'var(--sidebar-item-hover)' }}
                        onMouseLeave={e => { e.currentTarget.style.background = sel ? tc.text + '0d' : 'transparent' }}
                      >
                        <input type="checkbox" checked={sel} onChange={() => toggle(a.id)}
                          style={{ cursor: 'pointer', accentColor: tc.text, flexShrink: 0 }} />
                        <span style={{ fontSize: 13, color: sel ? 'var(--text-1)' : 'var(--text-2)', fontWeight: sel ? 600 : 400 }}>{a.name}</span>
                      </label>
                    )
                  })}
                </div>
              )
            })}
            {filtered.length === 0 && (
              <p style={{ fontSize: 12, color: 'var(--text-3)', padding: '10px 14px' }}>No accounts match "{query}"</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Single account ledger card ────────────────────────────────────
function LedgerCard({ account, lines, dateFrom, dateTo }) {
  const c          = TYPE_COLOR[account.account_type] || { bg: '#f1f5f9', text: '#475569' }
  const periodLines = lines.filter(l => !l.isOpening)
  const totalDebit  = periodLines.reduce((s, l) => s + l.debit,  0)
  const totalCredit = periodLines.reduce((s, l) => s + l.credit, 0)
  const closingBal  = lines.length > 0 ? lines[lines.length - 1].running_balance : 0

  return (
    <div className="card" style={{ overflow: 'hidden', marginBottom: 24 }}>
      {/* Account header */}
      <div style={{ padding: '12px 20px', background: c.text + '0f', borderBottom: '1px solid var(--card-border)', display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: c.text, margin: '0 0 1px', letterSpacing: '0.07em' }}>{account.account_type}</p>
          <p style={{ fontSize: 15, fontWeight: 800, color: 'var(--text-1)', margin: 0 }}>{account.name}</p>
        </div>
        <div style={{ display: 'flex', gap: 20, fontSize: 12, fontFamily: 'monospace', flexWrap: 'wrap' }}>
          <span style={{ color: '#2563eb', fontWeight: 600 }}>Dr&nbsp;{fmtAmt(totalDebit)}</span>
          <span style={{ color: '#16a34a', fontWeight: 600 }}>Cr&nbsp;{fmtAmt(totalCredit)}</span>
          <span style={{ color: closingBal >= 0 ? '#2563eb' : '#b91c1c', fontWeight: 700 }}>
            Closing:&nbsp;{fmtAmt(Math.abs(closingBal))}&nbsp;{closingBal >= 0 ? 'Dr' : 'Cr'}
          </span>
        </div>
      </div>

      {lines.length === 0 ? (
        <div style={{ padding: '30px', textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>
          No posted transactions in the selected period.
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead style={{ background: 'var(--table-header-bg)' }}>
              <tr>
                {['Date','Entry #','Type','Narration','Debit (₹)','Credit (₹)','Balance (₹)'].map(h => (
                  <th key={h} style={{ padding: '9px 14px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-3)', textAlign: ['Debit (₹)','Credit (₹)','Balance (₹)'].includes(h) ? 'right' : 'left', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {lines.map((l, i) => (
                <tr key={i} style={{ background: l.isOpening ? 'rgba(37,99,235,0.05)' : i % 2 ? 'rgba(0,0,0,0.012)' : 'transparent' }}>
                  <td style={{ padding: '9px 14px', fontSize: 12, color: 'var(--text-2)', whiteSpace: 'nowrap' }}>
                    {l.isOpening ? '—' : new Date(l.date + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                  </td>
                  <td style={{ padding: '9px 14px', fontSize: 12, fontWeight: 700, fontFamily: 'monospace', color: 'var(--accent)', whiteSpace: 'nowrap' }}>{l.entry_number || '—'}</td>
                  <td style={{ padding: '9px 14px' }}>
                    {l.voucher_type
                      ? <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 99, background: '#f1f5f9', color: '#475569' }}>{l.voucher_type}</span>
                      : l.isOpening ? <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 99, background: '#dbeafe', color: '#2563eb' }}>Opening</span>
                      : null}
                  </td>
                  <td style={{ padding: '9px 14px', fontSize: 12, color: l.isOpening ? '#2563eb' : 'var(--text-2)', fontWeight: l.isOpening ? 700 : 400, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.narration || '—'}</td>
                  <td style={{ padding: '9px 14px', fontSize: 12, fontFamily: 'monospace', textAlign: 'right', color: l.debit > 0 ? '#2563eb' : 'var(--text-3)' }}>{l.debit > 0 ? fmtAmt(l.debit) : '—'}</td>
                  <td style={{ padding: '9px 14px', fontSize: 12, fontFamily: 'monospace', textAlign: 'right', color: l.credit > 0 ? '#16a34a' : 'var(--text-3)' }}>{l.credit > 0 ? fmtAmt(l.credit) : '—'}</td>
                  <td style={{ padding: '9px 14px', fontSize: 12, fontFamily: 'monospace', fontWeight: 700, textAlign: 'right', color: l.running_balance >= 0 ? '#2563eb' : '#b91c1c' }}>
                    {fmtAmt(Math.abs(l.running_balance))} <span style={{ fontSize: 10 }}>{l.running_balance >= 0 ? 'Dr' : 'Cr'}</span>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot style={{ background: 'var(--table-header-bg)', borderTop: '2px solid var(--card-border)' }}>
              <tr>
                <td colSpan={4} style={{ padding: '10px 14px', fontSize: 12, fontWeight: 700, color: 'var(--text-2)' }}>TOTAL ({periodLines.length} entries)</td>
                <td style={{ padding: '10px 14px', fontSize: 13, fontWeight: 800, fontFamily: 'monospace', textAlign: 'right', color: '#2563eb' }}>{fmtAmt(totalDebit)}</td>
                <td style={{ padding: '10px 14px', fontSize: 13, fontWeight: 800, fontFamily: 'monospace', textAlign: 'right', color: '#16a34a' }}>{fmtAmt(totalCredit)}</td>
                <td style={{ padding: '10px 14px', fontSize: 13, fontWeight: 800, fontFamily: 'monospace', textAlign: 'right', color: closingBal >= 0 ? '#2563eb' : '#b91c1c' }}>
                  {fmtAmt(Math.abs(closingBal))} <span style={{ fontSize: 11 }}>{closingBal >= 0 ? 'Dr' : 'Cr'}</span>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────
export default function LedgerPage() {
  const navigate     = useNavigate()
  const toast        = useToast()
  const [searchParams] = useSearchParams()

  const today = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` })()
  const fy    = getFY()
  const { from: fyFrom } = fyDateRange(fy)

  const initAccountId = searchParams.get('accountId') || ''
  const initFrom      = searchParams.get('from') || fyFrom
  const initTo        = searchParams.get('to')   || today

  const [accounts,     setAccounts]     = useState([])
  const [selectedIds,  setSelectedIds]  = useState(() => new Set(initAccountId ? [initAccountId] : []))
  const [dateFrom,     setDateFrom]     = useState(initFrom)
  const [dateTo,       setDateTo]       = useState(initTo)
  const [ledgers,      setLedgers]      = useState([]) // [{ account, lines }]
  const [loading,      setLoading]      = useState(false)
  const [generated,    setGenerated]    = useState(false)
  const [church,       setChurch]       = useState(null)
  const autoGenDone = useRef(false)

  useEffect(() => {
    getChartOfAccounts(true).then(all => setAccounts(getPostableAccountsWithPath(all))).catch(() => {})
    getChurch().then(setChurch).catch(() => {})
  }, [])

  const generate = useCallback(async () => {
    if (selectedIds.size === 0) { toast('Please select at least one account', 'error'); return }
    setLoading(true)
    try {
      const results = await Promise.all(
        [...selectedIds].map(async id => {
          const account = accounts.find(a => a.id === id)
          const lines   = await getLedger(id, dateFrom, dateTo)
          return { account, lines }
        })
      )
      setLedgers(results.filter(r => r.account))
      setGenerated(true)
    } catch (e) { toast(e.message, 'error') }
    setLoading(false)
  }, [selectedIds, dateFrom, dateTo, accounts, toast])

  // Auto-generate when navigating here with a pre-selected account
  useEffect(() => {
    if (!autoGenDone.current && accounts.length > 0 && initAccountId) {
      autoGenDone.current = true
      generate()
    }
  }, [accounts]) // eslint-disable-line react-hooks/exhaustive-deps

  function doExport() {
    const rows = []
    ledgers.forEach(({ account, lines }) => {
      rows.push({ Date: `── ${account.name} ──`, 'Entry #': '', Type: '', Narration: '', 'Debit (₹)': '', 'Credit (₹)': '', 'Balance (₹)': '' })
      lines.forEach(l => rows.push({
        Date:         l.date,
        'Entry #':    l.entry_number,
        Type:         l.voucher_type || (l.isOpening ? 'Opening' : ''),
        Narration:    l.narration,
        'Debit (₹)':  l.debit,
        'Credit (₹)': l.credit,
        'Balance (₹)':l.running_balance,
      }))
    })
    exportToExcel(rows, `Ledger_${dateFrom}_${dateTo}`)
  }

  function doPrint() { window.print() }

  const canGenerate = selectedIds.size > 0

  return (
    <div className="page-container">
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={() => navigate('/accounting')} style={{ padding: '6px 8px', background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: 7, cursor: 'pointer', display: 'flex', alignItems: 'center', color: 'var(--text-2)' }}>
            <ArrowLeft size={15} />
          </button>
          <div>
            <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
              <BookMarked size={20} style={{ color: 'var(--accent)' }} /> Ledger
            </h1>
            <p className="page-subtitle">View account-wise transaction history</p>
          </div>
        </div>
        {generated && (
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={doExport} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 14px', background: '#16a34a', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
              <FileSpreadsheet size={15} /> Export
            </button>
            <button onClick={doPrint} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 14px', background: 'var(--card-bg)', border: '1.5px solid var(--card-border)', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', color: 'var(--text-1)' }}>
              <Printer size={15} /> Print
            </button>
          </div>
        )}
      </div>

      {/* Date presets */}
      <div style={{ marginBottom: 10 }}>
        <DatePresets onSelect={(f, t) => { setDateFrom(f); setDateTo(t) }} />
      </div>

      {/* Filter bar — account dropdown + dates + generate */}
      <div className="card" style={{ padding: '14px 18px', marginBottom: 24, display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <AccountSelector accounts={accounts} selectedIds={selectedIds} onChange={setSelectedIds} />
        <div style={{ flex: 1, minWidth: 140 }}>
          <label style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-3)', display: 'block', marginBottom: 5 }}>From Date</label>
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
            style={{ width: '100%', height: 36, padding: '0 10px', border: '1.5px solid var(--card-border)', borderRadius: 8, fontSize: 13, background: 'var(--input-bg)', color: 'var(--text-1)', outline: 'none', boxSizing: 'border-box' }} />
        </div>
        <div style={{ flex: 1, minWidth: 140 }}>
          <label style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-3)', display: 'block', marginBottom: 5 }}>To Date</label>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
            style={{ width: '100%', height: 36, padding: '0 10px', border: '1.5px solid var(--card-border)', borderRadius: 8, fontSize: 13, background: 'var(--input-bg)', color: 'var(--text-1)', outline: 'none', boxSizing: 'border-box' }} />
        </div>
        <button onClick={generate} disabled={loading || !canGenerate}
          style={{ height: 36, padding: '0 24px', background: canGenerate ? 'var(--accent)' : '#e5e7eb', color: canGenerate ? '#fff' : '#9ca3af', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: canGenerate ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', gap: 7, alignSelf: 'flex-end' }}>
          {loading ? <Loader2 size={14} className="animate-spin" /> : null}
          Generate{selectedIds.size > 1 ? ` (${selectedIds.size})` : ''}
        </button>
      </div>

      {/* Empty state */}
      {!generated && !loading && (
        <div className="card" style={{ padding: '50px 20px', textAlign: 'center', color: 'var(--text-3)' }}>
          <BookMarked size={32} style={{ opacity: 0.25, display: 'block', margin: '0 auto 12px' }} />
          <p style={{ fontSize: 13 }}>Select one or more accounts and click Generate.</p>
        </div>
      )}

      {loading && (
        <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--text-3)' }}>
          <Loader2 size={24} className="animate-spin" style={{ display: 'block', margin: '0 auto 8px' }} /> Loading ledger…
        </div>
      )}

      {/* Ledger cards */}
      {generated && !loading && ledgers.map(({ account, lines }) => (
        <LedgerCard key={account.id} account={account} lines={lines} dateFrom={dateFrom} dateTo={dateTo} />
      ))}
    </div>
  )
}
