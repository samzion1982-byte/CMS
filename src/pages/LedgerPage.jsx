/* ═══════════════════════════════════════════════════════════════
   LedgerPage.jsx — Account Ledger View (multi-account)
   ═══════════════════════════════════════════════════════════════ */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom'
import { useToast } from '../lib/toast'
import { getLedger, getChartOfAccounts, getAccountById, getPostableAccountsWithPath, getFY, fyDateRange, fmtAmt, TYPE_COLOR, displayAccountType } from '../lib/accountingLib'
import { exportToExcelWithTitle } from '../lib/exportExcel'
import { useEntity } from '../lib/EntityContext'
import { BookMarked, ArrowLeft, Loader2, FileSpreadsheet, Printer, Search, X } from 'lucide-react'
import DatePresets from '../components/accounting/DatePresets'

// ── Account multi-select dropdown (tree view) ─────────────────────
function AccountSelector({ allAccounts, postableIds, selectedIds, onChange }) {
  const [open,  setOpen]  = useState(false)
  const [query, setQuery] = useState('')
  const wrapRef = useRef(null)
  const types   = ['Asset', 'Liability', 'Equity', 'Income', 'Expense']

  useEffect(() => {
    function onDown(e) { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [])

  // Build id → children map once
  const childrenOf = useMemo(() => {
    const map = {}
    allAccounts.forEach(a => {
      if (!map[a.parent_id]) map[a.parent_id] = []
      map[a.parent_id].push(a)
    })
    return map
  }, [allAccounts])

  const q = query.trim().toLowerCase()

  // Does this node or any descendant match the search query?
  function hasMatch(node) {
    if (node.name.toLowerCase().includes(q)) return true
    return (childrenOf[node.id] || []).some(hasMatch)
  }

  function getPostableDescendants(id) {
    const result = []
    for (const child of (childrenOf[id] || [])) {
      if (postableIds.has(child.id)) result.push(child.id)
      result.push(...getPostableDescendants(child.id))
    }
    return result
  }

  function toggle(id) {
    const next = new Set(selectedIds)
    const desc = getPostableDescendants(id)
    const hasChildren = (childrenOf[id] || []).length > 0
    if (next.has(id) || (hasChildren && desc.every(did => next.has(did)))) {
      // Deselect: remove this account and all postable descendants
      next.delete(id)
      desc.forEach(did => next.delete(did))
    } else {
      // Select: add the parent itself AND all postable descendants so that entries
      // posted directly to the parent account (e.g. old OB entries on "Cash") are not missed
      next.add(id)
      desc.forEach(did => next.add(did))
    }
    onChange(next)
  }

  // Render one node + its children recursively
  function renderNode(node, depth) {
    if (q && !hasMatch(node)) return null
    const children   = (childrenOf[node.id] || []).sort((a, b) => a.name.localeCompare(b.name))
    const isPostable = postableIds.has(node.id)
    const sel        = selectedIds.has(node.id)
    const tc         = TYPE_COLOR[node.account_type] || { text: '#64748b' }
    const indent     = 12 + depth * 18

    const hasChildren = children.length > 0
    const descIds     = getPostableDescendants(node.id)
    const allDescSel  = descIds.length > 0 && descIds.every(did => selectedIds.has(did))
    const someDescSel = descIds.some(did => selectedIds.has(did))
    // For accounts with children, treat checked/indeterminate by descendants (not self)
    const effectiveSel = hasChildren ? allDescSel : sel

    return (
      <div key={node.id}>
        <label style={{
          display: 'flex', alignItems: 'center', gap: 8,
          paddingLeft: indent, paddingRight: 12, paddingTop: 5, paddingBottom: 5,
          cursor: 'pointer',
          background: (sel || someDescSel) ? tc.text + '12' : 'transparent',
        }}
          onMouseEnter={e => { e.currentTarget.style.background = tc.text + '1a' }}
          onMouseLeave={e => { e.currentTarget.style.background = (sel || someDescSel) ? tc.text + '12' : 'transparent' }}
        >
          {hasChildren
            ? <input type="checkbox" checked={effectiveSel}
                ref={el => { if (el) el.indeterminate = someDescSel && !allDescSel }}
                onChange={() => toggle(node.id)}
                style={{ cursor: 'pointer', accentColor: tc.text, flexShrink: 0 }} />
            : isPostable
              ? <input type="checkbox" checked={sel} onChange={() => toggle(node.id)}
                  style={{ cursor: 'pointer', accentColor: tc.text, flexShrink: 0 }} />
              : <span style={{ width: 14, flexShrink: 0 }} />
          }
          <span style={{
            fontSize: isPostable ? 13 : 12,
            color: isPostable ? (effectiveSel || sel ? 'var(--text-1)' : 'var(--text-2)') : tc.text,
            fontWeight: hasChildren ? 600 : (sel ? 600 : 400),
          }}>
            {node.name}
          </span>
        </label>
        {children.map(child => renderNode(child, depth + 1))}
      </div>
    )
  }

  const triggerLabel = selectedIds.size === 0
    ? 'Select accounts…'
    : selectedIds.size === 1
      ? allAccounts.find(a => a.id === [...selectedIds][0])?.name || '1 account'
      : `${selectedIds.size} accounts selected`

  return (
    <div ref={wrapRef} style={{ position: 'relative', flex: 2, minWidth: 220 }}>
      <label style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-3)', display: 'block', marginBottom: 5 }}>Account *</label>

      {/* Trigger */}
      <button onClick={() => setOpen(o => !o)}
        style={{ width: '100%', height: 36, padding: '0 10px', border: `1.5px solid ${open ? 'var(--accent)' : 'var(--card-border)'}`, borderRadius: 8, fontSize: 13, background: 'var(--input-bg)', color: selectedIds.size ? 'var(--text-1)' : 'var(--text-3)', cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, outline: 'none' }}>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{triggerLabel}</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          {selectedIds.size > 0 && (
            <span onMouseDown={e => { e.stopPropagation(); onChange(new Set()) }}
              style={{ display: 'flex', alignItems: 'center', color: 'var(--text-3)', padding: 2 }}>
              <X size={12} />
            </span>
          )}
          <svg width="12" height="12" viewBox="0 0 12 12" style={{ transition: 'transform 0.15s', transform: open ? 'rotate(180deg)' : 'none', color: 'var(--text-3)' }}>
            <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" />
          </svg>
        </span>
      </button>

      {/* Dropdown */}
      {open && (
        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 400, marginTop: 4, background: 'var(--card-bg)', border: '1.5px solid var(--card-border)', borderRadius: 10, boxShadow: '0 8px 32px rgba(0,0,0,0.18)', overflow: 'hidden' }}>

          {/* Search */}
          <div style={{ padding: '8px 10px', borderBottom: '1px solid var(--card-border)', position: 'relative' }}>
            <Search size={12} style={{ position: 'absolute', left: 18, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)', pointerEvents: 'none' }} />
            <input autoFocus value={query} onChange={e => setQuery(e.target.value)}
              placeholder="Search accounts…"
              style={{ width: '100%', height: 30, padding: '0 8px 0 26px', border: '1px solid var(--card-border)', borderRadius: 6, fontSize: 12, background: 'var(--input-bg)', color: 'var(--text-1)', outline: 'none', boxSizing: 'border-box' }} />
          </div>

          {/* Tree grouped by type */}
          <div style={{ maxHeight: 320, overflowY: 'auto', padding: '4px 0' }}>
            {types.map(type => {
              const root = allAccounts.find(a => a.account_type === type && !a.parent_id)
              if (!root) return null
              const topLevel = (childrenOf[root.id] || []).sort((a, b) => a.name.localeCompare(b.name))
              if (!topLevel.length) return null
              if (q && !topLevel.some(hasMatch)) return null
              const tc = TYPE_COLOR[type] || { text: '#475569' }
              return (
                <div key={type}>
                  <div style={{ padding: '6px 12px 4px', background: tc.text + '0a', borderTop: '1px solid var(--card-border)' }}>
                    <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.09em', color: tc.text }}>
                      {displayAccountType(type)}
                    </span>
                  </div>
                  {topLevel.map(node => renderNode(node, 0))}
                </div>
              )
            })}
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
  const location     = useLocation()
  const toast        = useToast()
  const { currentEntityId, currentEntity } = useEntity()
  const [searchParams] = useSearchParams()

  const cameFromReport = !!location.state?.from

  const today = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` })()
  const fy    = currentEntity?.fy_start || getFY()
  const { from: fyFrom } = fyDateRange(fy)

  const initAccountId = searchParams.get('accountId') || ''
  const initFrom      = searchParams.get('from') || fyFrom
  const initTo        = searchParams.get('to')   || today

  const [allAccounts,  setAllAccounts]  = useState([])
  const [postable,     setPostable]     = useState([]) // postable accounts with path
  const [selectedIds,  setSelectedIds]  = useState(() => new Set(initAccountId ? [initAccountId] : []))
  const [dateFrom,     setDateFrom]     = useState(initFrom)
  const [dateTo,       setDateTo]       = useState(initTo)
  const [ledgers,      setLedgers]      = useState([]) // [{ account, lines }]
  const [loading,      setLoading]      = useState(false)
  const [generated,    setGenerated]    = useState(false)
  const autoGenDone = useRef(false)

  const postableIds = useMemo(() => new Set(postable.map(a => a.id)), [postable])

  useEffect(() => {
    getChartOfAccounts(true, currentEntityId).then(async all => {
      // If the pre-selected account isn't in the entity-filtered list (e.g. auto-created
      // receipt-transfer accounts with a mismatched entity_id), fetch it by ID directly.
      if (initAccountId && !all.find(a => a.id === initAccountId)) {
        const extra = await getAccountById(initAccountId)
        if (extra) all = [...all, extra]
      }
      setAllAccounts(all)
      setPostable(getPostableAccountsWithPath(all))
    }).catch(() => {})
  }, [])

  const generate = useCallback(async () => {
    if (selectedIds.size === 0) { toast('Please select at least one account', 'error'); return }
    setLoading(true)
    try {
      const results = await Promise.all(
        [...selectedIds].map(async id => {
          const account = allAccounts.find(a => a.id === id)
          const lines   = await getLedger(id, currentEntityId, dateFrom, dateTo)
          return { account, lines }
        })
      )
      // Only show cards that have at least one period transaction or a non-zero opening balance
      const meaningful = results.filter(r => {
        if (!r.account) return false
        const periodLines = r.lines.filter(l => !l.isOpening)
        const ob = r.lines.find(l => l.isOpening)
        return periodLines.length > 0 || (ob && Math.abs(ob.running_balance) >= 0.01)
      })
      setLedgers(meaningful)
      setGenerated(true)
    } catch (e) { toast(e.message, 'error') }
    setLoading(false)
  }, [selectedIds, dateFrom, dateTo, allAccounts, toast])

  // Auto-generate when navigating here with a pre-selected account
  useEffect(() => {
    if (!autoGenDone.current && allAccounts.length > 0 && initAccountId) {
      autoGenDone.current = true
      generate()
    }
  }, [allAccounts]) // eslint-disable-line react-hooks/exhaustive-deps

  function doExport() {
    const cols = [
      { header: 'Date',        key: 'date',    align: 'left'  },
      { header: 'Entry #',     key: 'entry',   align: 'left'  },
      { header: 'Type',        key: 'type',    align: 'left'  },
      { header: 'Narration',   key: 'narr',    align: 'left'  },
      { header: 'Debit (₹)',   key: 'debit',   align: 'right' },
      { header: 'Credit (₹)',  key: 'credit',  align: 'right' },
      { header: 'Balance (₹)', key: 'balance', align: 'right' },
    ]
    const rows = []
    ledgers.forEach(({ account, lines }) => {
      rows.push({ date: `── ${account.name} ──`, entry: '', type: '', narr: '', debit: '', credit: '', balance: '' })
      lines.forEach(l => rows.push({
        date:    l.date,
        entry:   l.entry_number,
        type:    l.voucher_type || (l.isOpening ? 'Opening' : ''),
        narr:    l.narration,
        debit:   l.debit   || '',
        credit:  l.credit  || '',
        balance: l.running_balance != null ? `${Math.abs(l.running_balance).toLocaleString('en-IN', { minimumFractionDigits: 2 })} ${l.running_balance >= 0 ? 'Dr' : 'Cr'}` : '',
      }))
      const periodLines  = lines.filter(l => !l.isOpening)
      const totalDebit   = periodLines.reduce((s, l) => s + l.debit,  0)
      const totalCredit  = periodLines.reduce((s, l) => s + l.credit, 0)
      const closingBal   = lines.length > 0 ? lines[lines.length - 1].running_balance : 0
      const closingLabel = `${Math.abs(closingBal).toLocaleString('en-IN', { minimumFractionDigits: 2 })} ${closingBal >= 0 ? 'Dr' : 'Cr'}`
      rows.push({ date: 'TOTAL', entry: '', type: '', narr: `${periodLines.length} entries`, debit: totalDebit || '', credit: totalCredit || '', balance: closingLabel, _bold: true })
    })
    const titleLines = [
      currentEntity?.name ? { text: currentEntity.name, bold: true, size: 13, bg: 'DBEAFE' } : null,
      (currentEntity?.address || currentEntity?.city) ? { text: [currentEntity.address, currentEntity.city].filter(Boolean).join(', '), size: 10 } : null,
      currentEntity?.diocese ? { text: currentEntity.diocese, size: 10, italic: true } : null,
      currentEntity?.description ? { text: currentEntity.description, size: 10, italic: true } : null,
      { text: 'LEDGER', bold: true, size: 12, bg: '1E3A5F', color: 'FFFFFF' },
      { text: `${dateFrom}  to  ${dateTo}`, size: 10 },
    ].filter(Boolean)
    exportToExcelWithTitle(cols, rows, 'Ledger', `Ledger_${dateFrom}_${dateTo}.xlsx`, titleLines)
  }

  function doPrint() {
    const s = document.createElement('style')
    s.id = 'ledger-page-override'
    s.textContent = '@page { size: A4 landscape; margin: 0.8cm 1cm; } #ledger-print-area { zoom: 0.85; }'
    document.head.appendChild(s)
    window.print()
    setTimeout(() => document.getElementById('ledger-page-override')?.remove(), 500)
  }

  const canGenerate = selectedIds.size > 0

  return (
    <div className="page-container">
      <div className="page-header no-print">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
              <button onClick={() => navigate('/accounting')} style={{ padding: '6px 8px', background: 'var(--accent)', border: 'none', borderRadius: 7, cursor: 'pointer', display: 'flex', alignItems: 'center', color: '#fff' }}>
                <ArrowLeft size={15} />
              </button>
              <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--accent)', whiteSpace: 'nowrap' }}>Accounts</span>
            </div>
            {cameFromReport && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                <button onClick={() => navigate(-1)} style={{ padding: '6px 8px', background: 'var(--accent)', border: 'none', borderRadius: 7, cursor: 'pointer', display: 'flex', alignItems: 'center', color: '#fff' }}>
                  <ArrowLeft size={15} />
                </button>
                <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--accent)', whiteSpace: 'nowrap' }}>Back</span>
              </div>
            )}
          </div>
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
      <div className="no-print" style={{ marginBottom: 10 }}>
        <DatePresets onSelect={(f, t) => { setDateFrom(f); setDateTo(t) }} />
      </div>

      {/* Filter bar — account dropdown + dates + generate */}
      <div className="card no-print" style={{ padding: '14px 18px', marginBottom: 24, display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'flex-end', overflow: 'visible' }}>
        <AccountSelector allAccounts={allAccounts} postableIds={postableIds} selectedIds={selectedIds} onChange={setSelectedIds} />
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
      <div id="ledger-print-area">
        {/* Print-only report header */}
        {generated && !loading && (
          <div className="print-only" style={{ textAlign: 'center', padding: '16px 0 20px', borderBottom: '2px solid #d1d5db', marginBottom: 20 }}>
            <p style={{ margin: '0 0 2px', fontSize: 16, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '1.5px', color: '#111827' }}>
              {currentEntity?.name || 'Entity Name'}
            </p>
            {(currentEntity?.address || currentEntity?.city) && (
              <p style={{ margin: '0 0 1px', fontSize: 11, color: '#6b7280' }}>
                {[currentEntity.address, currentEntity.city].filter(Boolean).join(', ')}
              </p>
            )}
            {currentEntity?.diocese && (
              <p style={{ margin: '0 0 3px', fontSize: 11, color: '#6b7280' }}>{currentEntity.diocese}</p>
            )}
            {currentEntity?.description && (
              <p style={{ margin: '0 0 2px', fontSize: 11, color: '#6b7280', fontStyle: 'italic' }}>{currentEntity.description}</p>
            )}
            <p style={{ margin: '0 0 2px', fontSize: 13, fontWeight: 700, letterSpacing: '1px', color: '#111827' }}>LEDGER</p>
            <p style={{ margin: 0, fontSize: 11, color: '#6b7280' }}>
              {new Date(dateFrom + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
              {' — '}
              {new Date(dateTo + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
            </p>
          </div>
        )}
        {generated && !loading && ledgers.map(({ account, lines }) => (
          <LedgerCard key={account.id} account={account} lines={lines} dateFrom={dateFrom} dateTo={dateTo} />
        ))}
      </div>
    </div>
  )
}
