/* ═══════════════════════════════════════════════════════════════
   FinancialStatementsPage.jsx
   Church financial statements — three standard reports:

   1. Receipts & Payments Account  (cash-basis summary)
   2. Income & Expenditure Account (accrual — Surplus / Deficit)
   3. Balance Sheet                (Assets vs Liabilities + Corpus Fund)
   ═══════════════════════════════════════════════════════════════ */

import { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useToast } from '../lib/toast'
import {
  getReceiptsAndPayments,
  getIncomeStatement,
  getBalanceSheet,
  getFY, fyOptions, fyDateRange, fmtAmt,
} from '../lib/accountingLib'
import { getChurch } from '../lib/supabase'
import {
  BarChart2, ArrowLeft, Loader2, Printer, ChevronDown, ChevronRight,
  RefreshCw, CheckCircle, XCircle, Calendar, ExternalLink,
} from 'lucide-react'

// DD-MM-YYYY display format for ISO date strings
function fmtD(iso) {
  if (!iso) return ''
  const [y, m, d] = iso.split('-')
  return `${d}-${m}-${y}`
}

// ════════════════════════════════════════════════════════════════
//  Shared layout helpers
// ════════════════════════════════════════════════════════════════

const TABS = [
  { id: 'rp', label: 'Receipts & Payments' },
  { id: 'ie', label: 'Income & Expenditure' },
  { id: 'bs', label: 'Balance Sheet'        },
]

const TH = {
  padding: '10px 16px', fontSize: 11, fontWeight: 700,
  textTransform: 'uppercase', letterSpacing: '0.07em',
  color: 'var(--text-3)', textAlign: 'left',
}
const TD = { padding: '8px 16px', fontSize: 13, color: 'var(--text-1)', verticalAlign: 'middle' }

// Two-column table used for both R&P and I&E
function TwoColTable({ leftRows, rightRows, leftTotal, rightTotal, leftLabel, rightLabel, navigate, dateFrom, dateTo }) {
  const maxLen = Math.max(leftRows.length, rightRows.length)
  const rows   = Array.from({ length: maxLen }, (_, i) => ({ l: leftRows[i] || null, r: rightRows[i] || null }))

  return (
    <div style={{ border: '1.5px solid var(--card-border)', borderRadius: 10, overflow: 'hidden' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead style={{ background: 'var(--table-header-bg)' }}>
          <tr>
            <th style={TH}>{leftLabel}</th>
            <th style={{ ...TH, textAlign: 'right', width: 150 }}>Amount</th>
            <th style={{ ...TH, borderLeft: '2px solid var(--card-border)' }}>{rightLabel}</th>
            <th style={{ ...TH, textAlign: 'right', width: 150 }}>Amount</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => {
            const isGrpHdr  = !!(row.l?.isGroup) || !!(row.r?.isGroup)
            const isSubItem = (!!row.l?.indent && !row.l?.isGroup) || (!!row.r?.indent && !row.r?.isGroup)
            const isBold    = (row.l?.bold && !row.l?.isGroup) || (row.r?.bold && !row.r?.isGroup)
            return (
              <tr key={i} style={{
                borderTop: '1px solid rgba(0,0,0,0.04)',
                background: isGrpHdr  ? 'rgba(79,70,229,0.06)'
                  : isSubItem ? 'rgba(79,70,229,0.03)'
                  : isBold    ? 'rgba(0,0,0,0.025)'
                  : 'transparent',
              }}>
                <CellPair cell={row.l} navigate={navigate} dateFrom={dateFrom} dateTo={dateTo} />
                {(() => {
                  const r = row.r
                  const rIsGroup   = !!r?.isGroup
                  const rClickable = !!(r?.accountId && navigate) && !rIsGroup
                  function rClick() {
                    if (rIsGroup) { r.onToggle?.(); return }
                    if (rClickable) navigate(`/accounting/ledger?accountId=${r.accountId}&from=${dateFrom}&to=${dateTo}`)
                  }
                  return (
                    <>
                      <td
                        style={{ ...TD, borderLeft: '2px solid var(--card-border)', fontWeight: (r?.bold || rIsGroup) ? 700 : 400, paddingLeft: r?.indent2 ? 60 : (r?.indent && rIsGroup) ? 24 : r?.indent ? 40 : 16, color: r?.muted ? 'var(--text-3)' : 'var(--text-1)', fontStyle: r?.italic ? 'italic' : 'normal', cursor: (rIsGroup || rClickable) ? 'pointer' : 'inherit', textDecoration: rClickable ? 'underline dotted' : 'none', textUnderlineOffset: 3 }}
                        onClick={rClick}
                        title={rClickable ? 'View Ledger' : rIsGroup ? (r.isExpanded ? 'Collapse' : 'Expand') : undefined}
                      >
                        {rIsGroup && (
                          <ChevronRight size={12} style={{ marginRight: 4, display: 'inline-block', verticalAlign: 'middle', color: 'var(--text-3)', transform: r.isExpanded ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }} />
                        )}
                        {r?.label || ''}
                        {rClickable && <ExternalLink size={10} style={{ marginLeft: 4, opacity: 0.45, verticalAlign: 'middle' }} />}
                      </td>
                      <td style={{ ...TD, textAlign: 'right', fontFamily: 'monospace', fontWeight: (r?.bold || rIsGroup) ? 700 : 400, color: 'var(--text-1)' }}>
                        {r?.amount !== undefined ? fmtAmt(r.amount) : ''}
                      </td>
                    </>
                  )
                })()}
              </tr>
            )
          })}
        </tbody>
        <tfoot>
          <tr style={{ background: 'var(--table-header-bg)', borderTop: '2px solid var(--card-border)' }}>
            <td style={{ ...TD, fontWeight: 800 }}>TOTAL</td>
            <td style={{ ...TD, textAlign: 'right', fontFamily: 'monospace', fontWeight: 800 }}>{fmtAmt(leftTotal)}</td>
            <td style={{ ...TD, fontWeight: 800, borderLeft: '2px solid var(--card-border)' }}>TOTAL</td>
            <td style={{ ...TD, textAlign: 'right', fontFamily: 'monospace', fontWeight: 800 }}>{fmtAmt(rightTotal)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}

function CellPair({ cell, navigate, dateFrom, dateTo }) {
  const clickable = !!(cell?.accountId && navigate)
  const isGroup   = !!cell?.isGroup
  function handleClick() {
    if (isGroup) { cell.onToggle?.(); return }
    if (clickable) navigate(`/accounting/ledger?accountId=${cell.accountId}&from=${dateFrom}&to=${dateTo}`)
  }
  return (
    <>
      <td
        style={{ ...TD, fontWeight: (cell?.bold || isGroup) ? 700 : 400,
          borderLeft: isGroup ? '3px solid var(--accent)' : 'none',
          paddingLeft: cell?.indent2 ? 60 : cell?.indent ? (isGroup ? 21 : 40) : (isGroup ? 13 : 16),
          color: cell?.muted ? 'var(--text-3)' : 'var(--text-1)', fontStyle: cell?.italic ? 'italic' : 'normal',
          cursor: (isGroup || clickable) ? 'pointer' : 'inherit',
          textDecoration: clickable && !isGroup ? 'underline dotted' : 'none', textUnderlineOffset: 3 }}
        onClick={handleClick}
        title={clickable && !isGroup ? 'View Ledger' : isGroup ? (cell.isExpanded ? 'Collapse' : 'Expand') : undefined}
      >
        {isGroup && (
          <ChevronRight size={12} style={{ marginRight: 4, display: 'inline-block', verticalAlign: 'middle', color: 'var(--text-3)', transform: cell.isExpanded ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }} />
        )}
        {cell?.label || ''}
        {clickable && !isGroup && <ExternalLink size={10} style={{ marginLeft: 4, opacity: 0.45, verticalAlign: 'middle' }} />}
      </td>
      <td style={{ ...TD, textAlign: 'right', fontFamily: 'monospace', fontWeight: (cell?.bold || isGroup) ? 700 : 400, color: 'var(--text-1)' }}>
        {cell?.amount !== undefined ? fmtAmt(cell.amount) : ''}
      </td>
    </>
  )
}

// ════════════════════════════════════════════════════════════════
//  R&P Table — 6-column layout (3 per side: label | detail | amount)
//  inner = expanded sub-item (dim)  outer = group total / standalone (bold)
// ════════════════════════════════════════════════════════════════

function RPTable({ leftRows, rightRows, leftTotal, rightTotal, leftLabel, rightLabel, navigate, dateFrom, dateTo }) {
  function renderSide(cell, isRight) {
    const sepBorder = isRight ? '2px solid var(--card-border)' : 'none'
    if (!cell) return <><td style={{ borderLeft: sepBorder }} /><td /><td /></>

    const clickable = !!(cell.accountId && navigate) && !cell.isGroup
    const isGroup   = !!cell.isGroup
    function handleClick() {
      if (isGroup) { cell.onToggle?.(); return }
      if (clickable) navigate(`/accounting/ledger?accountId=${cell.accountId}&from=${dateFrom}&to=${dateTo}`)
    }

    // Compensate paddingLeft for chevron width so text aligns with non-group rows
    const pl = cell.indent2
      ? (isGroup ? 48 : 68)          // sub-items pushed further right
      : cell.indent
        ? (isGroup ? 16 : 32)
        : 14

    // Left accent border on group header rows (left side only — right side keeps its divider)
    const accentBorder = isGroup && cell.indent && !isRight
    const labelBorderLeft = accentBorder ? '3px solid var(--accent)' : sepBorder

    return (
      <>
        <td
          style={{ ...TD, borderLeft: labelBorderLeft, paddingTop: 6, paddingBottom: 6,
            fontWeight: cell.bold ? 700 : 400, paddingLeft: accentBorder ? pl - 3 : pl,
            color: cell.muted ? 'var(--text-3)' : 'var(--text-1)',
            fontStyle: cell.italic ? 'italic' : 'normal',
            cursor: (isGroup || clickable) ? 'pointer' : 'default' }}
          onClick={handleClick}
        >
          {isGroup && (
            <ChevronRight size={12} style={{ marginRight: 4, display: 'inline-block', verticalAlign: 'middle', color: 'var(--text-3)', transform: cell.isExpanded ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }} />
          )}
          {cell.label || ''}
          {clickable && <ExternalLink size={10} style={{ marginLeft: 4, opacity: 0.4, verticalAlign: 'middle' }} />}
        </td>
        {/* Detail column — expanded sub-items only (dim) */}
        <td style={{ paddingRight: 8, paddingTop: 6, paddingBottom: 6, textAlign: 'right', fontFamily: 'monospace', fontSize: 12, width: 120, color: 'var(--text-3)', verticalAlign: 'middle', whiteSpace: 'nowrap' }}>
          {cell.inner !== undefined ? fmtAmt(cell.inner) : ''}
        </td>
        {/* Amount column — standalone items, group totals, section totals (bold) */}
        <td style={{ paddingRight: 16, paddingTop: 6, paddingBottom: 6, textAlign: 'right', fontFamily: 'monospace', fontSize: cell.bold ? 14 : 13, width: 145, fontWeight: cell.bold ? 800 : 500, color: 'var(--text-1)', verticalAlign: 'middle', whiteSpace: 'nowrap' }}>
          {cell.outer !== undefined ? fmtAmt(cell.outer) : ''}
        </td>
      </>
    )
  }

  const maxLen = Math.max(leftRows.length, rightRows.length)
  return (
    <div style={{ border: '1.5px solid var(--card-border)', borderRadius: 10, overflow: 'hidden' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead style={{ background: 'var(--table-header-bg)' }}>
          <tr>
            <th style={TH}>{leftLabel}</th>
            <th style={{ ...TH, width: 120, textAlign: 'right' }}>Detail</th>
            <th style={{ ...TH, width: 145, textAlign: 'right' }}>Amount</th>
            <th style={{ ...TH, borderLeft: '2px solid var(--card-border)' }}>{rightLabel}</th>
            <th style={{ ...TH, width: 120, textAlign: 'right' }}>Detail</th>
            <th style={{ ...TH, width: 145, textAlign: 'right' }}>Amount</th>
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: maxLen }, (_, i) => {
            const l = leftRows[i]
            const r = rightRows[i]
            const isSectionTotal = (l?.bold && !l?.indent) || (r?.bold && !r?.indent)
            const isGroupTotal   = (l?.bold && l?.indent && !l?.isGroup) || (r?.bold && r?.indent && !r?.isGroup)
            const isGroupHeader  = !!(l?.isGroup) || !!(r?.isGroup)
            const isSubItem      = !!(l?.indent2) || !!(r?.indent2)
            return (
              <tr key={i} style={{
                borderTop: isSectionTotal ? '1.5px solid var(--card-border)' : '1px solid rgba(0,0,0,0.04)',
                background: isSectionTotal ? 'var(--table-header-bg)'
                  : isGroupTotal  ? 'rgba(79,70,229,0.10)'
                  : isGroupHeader ? 'rgba(79,70,229,0.06)'
                  : isSubItem     ? 'rgba(79,70,229,0.03)'
                  : 'transparent',
              }}>
                {renderSide(l || null, false)}
                {renderSide(r || null, true)}
              </tr>
            )
          })}
        </tbody>
        <tfoot>
          <tr style={{ background: 'var(--table-header-bg)', borderTop: '2px solid var(--card-border)' }}>
            <td style={{ ...TD, fontWeight: 800, paddingTop: 10, paddingBottom: 10 }}>TOTAL</td>
            <td />
            <td style={{ ...TD, textAlign: 'right', fontFamily: 'monospace', fontWeight: 800, fontSize: 15, paddingRight: 16 }}>{fmtAmt(leftTotal)}</td>
            <td style={{ ...TD, fontWeight: 800, borderLeft: '2px solid var(--card-border)', paddingTop: 10, paddingBottom: 10 }}>TOTAL</td>
            <td />
            <td style={{ ...TD, textAlign: 'right', fontFamily: 'monospace', fontWeight: 800, fontSize: 15, paddingRight: 16 }}>{fmtAmt(rightTotal)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════
//  Receipts & Payments Account
// ════════════════════════════════════════════════════════════════

function ReceiptsPayments({ data, navigate, dateFrom, dateTo }) {
  const [expanded, setExpanded] = useState(new Set())
  function toggle(key) {
    setExpanded(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n })
  }

  const cashAccts   = data.cashAccounts   || []
  const bankAccts   = data.bankAccounts   || []
  const cashAcctsOB = data.cashAccountsOB || []
  const bankAcctsOB = data.bankAccountsOB || []

  const allGroupKeys = useMemo(() => {
    const keys = []
    if (cashAcctsOB.length > 1) keys.push('obCash')
    if (bankAcctsOB.length > 1) keys.push('obBank')
    for (const r of data.receipts || []) if ((r.children?.length || 0) > 0) keys.push('r_' + r.name)
    for (const p of data.payments || []) if ((p.children?.length || 0) > 0) keys.push('p_' + p.name)
    if (cashAccts.length > 1) keys.push('cbCash')
    if (bankAccts.length > 1) keys.push('cbBank')
    return keys
  }, [data, cashAccts, bankAccts, cashAcctsOB, bankAcctsOB])

  const allExpanded = allGroupKeys.length > 0 && allGroupKeys.every(k => expanded.has(k))

  // Balance section rows (opening or closing) — drill-down if multiple accounts
  function balRows(key, label, total, accounts) {
    if (accounts.length <= 1) {
      const name = accounts.length === 1 ? accounts[0].name : label
      return [{ label: name, outer: total, indent: true, accountId: accounts[0]?.id }]
    }
    const isExp = expanded.has(key)
    if (!isExp) return [{ label, outer: total, indent: true, isGroup: true, isExpanded: false, onToggle: () => toggle(key) }]
    return [
      { label, indent: true, isGroup: true, isExpanded: true, onToggle: () => toggle(key) },
      ...accounts.map(a => ({ label: a.name, inner: a.balance, indent2: true, accountId: a.id })),
      { label: `Total ${label}`, outer: total, indent: true, bold: true },
    ]
  }

  // Receipt/payment group rows — drill-down when multiple child accounts
  function grpRows(prefix, item) {
    if (item.children.length === 0) {
      return [{ label: item.name, outer: item.amount, indent: true, accountId: item.accountId }]
    }
    const key = prefix + item.name
    const isExp = expanded.has(key)
    if (!isExp) return [{ label: item.name, outer: item.amount, indent: true, isGroup: true, isExpanded: false, onToggle: () => toggle(key) }]
    return [
      { label: item.name, indent: true, isGroup: true, isExpanded: true, onToggle: () => toggle(key) },
      ...item.children.map(c => ({ label: c.name, inner: c.amount, indent2: true, accountId: c.accountId })),
      { label: `Total ${item.name}`, outer: item.amount, indent: true, bold: true },
    ]
  }

  const leftRows = [
    { label: 'Opening Balance', bold: true },
    ...balRows('obCash', 'Cash in Hand', data.cashOpeningBalance, cashAcctsOB),
    ...balRows('obBank', 'Cash at Bank', data.bankOpeningBalance, bankAcctsOB),
    { label: 'Total Opening', outer: data.openingBalance, bold: true },
    { label: '' },
    { label: 'RECEIPTS', bold: true, muted: true },
    ...data.receipts.flatMap(r => grpRows('r_', r)),
    { label: '' },
    { label: 'Total Receipts', outer: data.totalReceipts, bold: true },
  ]

  const rightRows = [
    { label: 'PAYMENTS', bold: true, muted: true },
    { label: '' },
    ...data.payments.flatMap(p => grpRows('p_', p)),
    { label: '' },
    { label: 'Total Payments', outer: data.totalPayments, bold: true },
    { label: '' },
    { label: 'Closing Balance', bold: true },
    ...balRows('cbCash', 'Cash in Hand', data.cashClosingBalance, cashAccts),
    ...balRows('cbBank', 'Cash at Bank', data.bankClosingBalance, bankAccts),
    { label: 'Total Closing', outer: data.closingBalance, bold: true },
  ]

  return (
    <div>
      {allGroupKeys.length > 0 && (
        <div className="no-print" style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
          <button
            onClick={() => setExpanded(allExpanded ? new Set() : new Set(allGroupKeys))}
            style={{
              fontSize: 12, padding: '4px 14px', borderRadius: 6,
              border: '1px solid var(--card-border)', background: 'var(--card-bg)',
              cursor: 'pointer', color: 'var(--text-2)', display: 'flex', alignItems: 'center', gap: 5,
            }}
          >
            {allExpanded
              ? <><ChevronDown size={13} /> Collapse All</>
              : <><ChevronRight size={13} /> Expand All</>}
          </button>
        </div>
      )}
      <RPTable
        leftRows={leftRows} rightRows={rightRows}
        leftTotal={data.openingBalance + data.totalReceipts}
        rightTotal={data.totalPayments + data.closingBalance}
        leftLabel="Dr  —  Receipts"
        rightLabel="Cr  —  Payments"
        navigate={navigate} dateFrom={dateFrom} dateTo={dateTo}
      />
      <p className="no-print" style={{ fontSize: 11, color: 'var(--text-3)', textAlign: 'right', margin: '8px 0 0' }}>
        Receipts &amp; Payments grouped by COA hierarchy · click ▶ to expand groups · click account to view ledger
      </p>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════
//  Income & Expenditure Account
// ════════════════════════════════════════════════════════════════

function IncomeExpenditure({ data, showZero, navigate, dateFrom, dateTo }) {
  const [expanded, setExpanded] = useState(new Set())
  const surplus   = data.surplus
  const isDeficit = surplus < 0

  function toggleGroup(id) {
    setExpanded(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  function buildHierRows(accounts, getAmt) {
    const rel    = accounts.filter(a => (a.level || 0) >= 3)
    const allIds = new Set(rel.map(a => a.id))
    const childrenOf = {}
    for (const a of rel) {
      if (a.parent_id && allIds.has(a.parent_id)) {
        if (!childrenOf[a.parent_id]) childrenOf[a.parent_id] = []
        childrenOf[a.parent_id].push(a)
      }
    }
    const groupIds = new Set(Object.keys(childrenOf))
    const topLevel = rel.filter(a => !allIds.has(a.parent_id))
    const rows = []
    for (const acct of topLevel) {
      if (groupIds.has(acct.id)) {
        const children = (childrenOf[acct.id] || []).filter(c => showZero || Math.abs(getAmt(c)) >= 0.01)
        const groupTotal = children.reduce((s, c) => s + getAmt(c), 0)
        if (!showZero && Math.abs(groupTotal) < 0.01) continue
        const isExp = expanded.has(acct.id)
        rows.push({ label: acct.name, amount: Math.max(0, groupTotal), bold: true, isGroup: true, isExpanded: isExp, onToggle: () => toggleGroup(acct.id) })
        if (isExp) {
          for (const c of children) {
            rows.push({ label: c.name, amount: Math.max(0, getAmt(c)), indent: true, accountId: c.id })
          }
        }
      } else {
        const amt = getAmt(acct)
        if (!showZero && Math.abs(amt) < 0.01) continue
        rows.push({ label: acct.name, amount: Math.max(0, amt), accountId: acct.id })
      }
    }
    return rows
  }

  const leftRows = [
    { label: 'EXPENDITURE', bold: true, muted: true },
    { label: '' },
    ...buildHierRows(data.expenses, a => a.total_debit - a.total_credit),
    { label: '' },
    { label: 'Total Expenditure', amount: data.totalExpenses, bold: true },
    { label: '' },
    ...(!isDeficit ? [{ label: 'Surplus transferred to Corpus Fund', amount: surplus, bold: true, italic: true }] : []),
  ]

  const rightRows = [
    { label: 'INCOME', bold: true, muted: true },
    { label: '' },
    ...buildHierRows(data.income, a => a.total_credit - a.total_debit),
    { label: '' },
    { label: 'Total Income', amount: data.totalIncome, bold: true },
    { label: '' },
    ...(isDeficit ? [{ label: 'Deficit (Excess of Expenditure)', amount: Math.abs(surplus), bold: true, italic: true }] : []),
  ]

  const leftTotal  = data.totalExpenses + (surplus > 0 ? surplus : 0)
  const rightTotal = data.totalIncome   + (surplus < 0 ? Math.abs(surplus) : 0)

  return (
    <div>
      <TwoColTable
        leftRows={leftRows} rightRows={rightRows}
        leftTotal={leftTotal} rightTotal={rightTotal}
        leftLabel="Dr  —  Expenditure"
        rightLabel="Cr  —  Income"
        navigate={navigate} dateFrom={dateFrom} dateTo={dateTo}
      />
      <div style={{ marginTop: 14, padding: '12px 20px', borderRadius: 10, background: isDeficit ? '#fff5f5' : '#f0fdf4', border: `1.5px solid ${isDeficit ? '#fca5a5' : '#86efac'}`, display: 'flex', alignItems: 'center', gap: 12 }}>
        {isDeficit ? <XCircle size={20} color="#b91c1c" /> : <CheckCircle size={20} color="#16a34a" />}
        <div>
          <p style={{ fontSize: 14, fontWeight: 800, margin: 0, color: isDeficit ? '#b91c1c' : '#15803d' }}>
            {isDeficit ? `Deficit: ${fmtAmt(Math.abs(surplus))}` : `Surplus: ${fmtAmt(surplus)}`}
          </p>
          <p style={{ fontSize: 11, color: 'var(--text-3)', margin: 0 }}>
            {isDeficit
              ? 'Expenditure exceeds Income — deficit carried to Corpus Fund.'
              : 'Income exceeds Expenditure — surplus transferred to Corpus Fund.'}
          </p>
        </div>
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════
//  Balance Sheet
// ════════════════════════════════════════════════════════════════

function BalanceSheet({ data, showZero, navigate, dateFrom, dateTo }) {
  const [expanded, setExpanded] = useState(new Set())

  function toggleGroup(id) {
    setExpanded(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  // Build hierarchical rows from a flat account list.
  // Only shows level 3+ accounts; groups those that have children within the list.
  function buildHierRows(accounts, getAmt) {
    const rel    = accounts.filter(a => (a.level || 0) >= 3)
    const allIds = new Set(rel.map(a => a.id))
    const childrenOf = {}
    for (const a of rel) {
      if (a.parent_id && allIds.has(a.parent_id)) {
        if (!childrenOf[a.parent_id]) childrenOf[a.parent_id] = []
        childrenOf[a.parent_id].push(a)
      }
    }
    const groupIds = new Set(Object.keys(childrenOf))
    const topLevel = rel.filter(a => !allIds.has(a.parent_id))
    const rows = []
    for (const acct of topLevel) {
      if (groupIds.has(acct.id)) {
        const children = (childrenOf[acct.id] || []).filter(c => showZero || Math.abs(getAmt(c)) >= 0.01)
        const groupTotal = children.reduce((s, c) => s + getAmt(c), 0)
        if (!showZero && Math.abs(groupTotal) < 0.01) continue
        const isExp = expanded.has(acct.id)
        rows.push({ label: acct.name, amount: Math.max(0, groupTotal), bold: true, isGroup: true, isExpanded: isExp, onToggle: () => toggleGroup(acct.id) })
        if (isExp) {
          for (const c of children) {
            rows.push({ label: c.name, amount: Math.max(0, getAmt(c)), indent: true, accountId: c.id })
          }
        }
      } else {
        const amt = getAmt(acct)
        if (!showZero && Math.abs(amt) < 0.01) continue
        rows.push({ label: acct.name, amount: Math.max(0, amt), accountId: acct.id })
      }
    }
    return rows
  }

  const isBalanced = Math.abs(data.totalAssets - (data.totalLiabilities + data.totalCorpus)) < 0.01

  const leftRows = [
    { label: 'CORPUS / GENERAL FUND', bold: true, muted: true },
    { label: '' },
    ...buildHierRows(data.corpus, a => a.total_credit - a.total_debit),
    { label: data.surplus >= 0 ? 'Add: Surplus for the year' : 'Less: Deficit for the year', amount: Math.abs(data.surplus), indent: true, italic: true },
    { label: 'Total Corpus Fund', amount: data.totalCorpus, bold: true },
    { label: '' },
    { label: 'LIABILITIES', bold: true, muted: true },
    { label: '' },
    ...buildHierRows(data.liabilities, a => a.total_credit - a.total_debit),
    { label: 'Total Liabilities', amount: data.totalLiabilities, bold: true },
  ]

  const rightRows = [
    { label: 'ASSETS', bold: true, muted: true },
    { label: '' },
    ...buildHierRows(data.assets, a => a.total_debit - a.total_credit),
    { label: '' },
    { label: 'Total Assets', amount: data.totalAssets, bold: true },
  ]

  return (
    <div>
      <TwoColTable
        leftRows={leftRows} rightRows={rightRows}
        leftTotal={data.totalCorpus + data.totalLiabilities} rightTotal={data.totalAssets}
        leftLabel="Corpus Fund & Liabilities"
        rightLabel="Assets"
        navigate={navigate} dateFrom={dateFrom} dateTo={dateTo}
      />
      <div style={{ marginTop: 14, padding: '12px 20px', borderRadius: 10, background: isBalanced ? '#f0fdf4' : '#fff5f5', border: `1.5px solid ${isBalanced ? '#86efac' : '#fca5a5'}`, display: 'flex', alignItems: 'center', gap: 12 }}>
        {isBalanced ? <CheckCircle size={20} color="#16a34a" /> : <XCircle size={20} color="#b91c1c" />}
        <p style={{ fontSize: 13, fontWeight: 700, margin: 0, color: isBalanced ? '#15803d' : '#b91c1c' }}>
          {isBalanced
            ? 'Balance Sheet is balanced — Assets = Corpus Fund + Liabilities'
            : `Does not balance — difference ${fmtAmt(Math.abs(data.totalAssets - data.totalLiabilities - data.totalCorpus))}`}
        </p>
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════
//  MAIN PAGE
// ════════════════════════════════════════════════════════════════

export default function FinancialStatementsPage() {
  const navigate = useNavigate()
  const toast    = useToast()

  const [tab,        setTab]        = useState('rp')
  const [fy,         setFy]         = useState(getFY())
  const [fyOpen,     setFyOpen]     = useState(false)
  const [rangeMode,  setRangeMode]  = useState('full')   // 'full' | 'custom'
  const [fromDate,   setFromDate]   = useState(() => fyDateRange(getFY()).from)
  const [toDate,     setToDate]     = useState(() => fyDateRange(getFY()).to)
  const [loading,    setLoading]    = useState(false)
  const [generated,  setGenerated]  = useState(false)
  const [rp,         setRp]         = useState(null)
  const [ie,         setIe]         = useState(null)
  const [bs,         setBs]         = useState(null)
  const [church,     setChurch]     = useState(null)
  const [genFrom,    setGenFrom]    = useState(null)   // dates used for last generate (for display)
  const [genTo,      setGenTo]      = useState(null)
  const [showZero,   setShowZero]   = useState(false)
  const FYS = fyOptions()

  function handleFyChange(f) {
    setFy(f)
    setFyOpen(false)
    setGenerated(false)
    const { from, to } = fyDateRange(f)
    setFromDate(from)
    setToDate(to)
  }

  function handlePrint() {
    const style = document.createElement('style')
    style.id = '__fin_print_css__'
    style.textContent = `
      @media print {
        @page { size: A4 landscape; margin: 1cm 1.5cm; }
        body * { visibility: hidden !important; }
        #financial-print-area, #financial-print-area * { visibility: visible !important; }
        #financial-print-area {
          position: absolute !important; top: 0 !important; left: 0 !important;
          right: 0 !important; padding: 20px !important;
          border: none !important; border-radius: 0 !important;
          background: #fff !important; box-shadow: none !important;
        }
        #financial-print-area .no-print { display: none !important; }
        #financial-print-area table { border-collapse: collapse !important; width: 100% !important; }
        #financial-print-area thead { background: #f3f4f6 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        #financial-print-area tfoot { background: #f3f4f6 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        #financial-print-area th  { font-size: 9px !important; padding: 5px 8px !important; border: 0.5px solid #ccc !important; }
        #financial-print-area td  { font-size: 11px !important; padding: 5px 8px !important; }
        #financial-print-area tr  { page-break-inside: avoid; }
      }
    `
    document.head.appendChild(style)
    window.addEventListener('afterprint', () => {
      document.getElementById('__fin_print_css__')?.remove()
    }, { once: true })
    window.print()
  }

  const generate = useCallback(async () => {
    const fd = rangeMode === 'custom' ? fromDate : null
    const td = rangeMode === 'custom' ? toDate   : null
    setLoading(true)
    setGenerated(false)
    try {
      const [rpData, ieData, bsData, c] = await Promise.all([
        getReceiptsAndPayments(fy, fd, td),
        getIncomeStatement(fy, fd, td),
        getBalanceSheet(fy, fd, td),
        getChurch(),
      ])
      setRp(rpData); setIe(ieData); setBs(bsData); setChurch(c)
      const { from, to } = fyDateRange(fy)
      setGenFrom(fd || from)
      setGenTo(td || to)
      setGenerated(true)
    } catch (e) { toast(e.message, 'error') }
    setLoading(false)
  }, [fy, rangeMode, fromDate, toDate, toast])

  // Auto-generate on every mount so navigating back always shows fresh data
  const didMount = useRef(false)
  useEffect(() => {
    if (!didMount.current) { didMount.current = true; generate() }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="page-container">

      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="page-header no-print">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={() => navigate('/accounting')} style={{ padding: '6px 8px', background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: 7, cursor: 'pointer', display: 'flex', alignItems: 'center', color: 'var(--text-2)' }}>
            <ArrowLeft size={15} />
          </button>
          <div>
            <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
              <BarChart2 size={20} style={{ color: 'var(--accent)' }} /> Financial Statements
            </h1>
            <p className="page-subtitle">R&amp;P · Income &amp; Expenditure · Balance Sheet — FY {fy}</p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          {/* FY picker */}
          <div style={{ position: 'relative' }}>
            <button onClick={() => setFyOpen(v => !v)}
              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', background: 'var(--card-bg)', border: '1.5px solid var(--card-border)', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', color: 'var(--text-1)' }}>
              FY {fy} <ChevronDown size={14} />
            </button>
            {fyOpen && (
              <div style={{ position: 'absolute', top: '110%', right: 0, background: 'var(--card-bg)', border: '1.5px solid var(--card-border)', borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.15)', zIndex: 200, minWidth: 130, overflow: 'hidden' }}>
                {FYS.map(f => (
                  <button key={f} onClick={() => handleFyChange(f)}
                    style={{ display: 'block', width: '100%', padding: '9px 14px', fontSize: 13, textAlign: 'left', background: f === fy ? 'var(--sidebar-item-active-bg)' : 'transparent', color: f === fy ? 'var(--accent)' : 'var(--text-1)', fontWeight: f === fy ? 700 : 400, border: 'none', cursor: 'pointer' }}>
                    {f}
                  </button>
                ))}
              </div>
            )}
          </div>

          <button onClick={generate} disabled={loading}
            style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 18px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1 }}>
            {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            {loading ? 'Generating…' : generated ? 'Refresh' : 'Generate'}
          </button>

          {generated && (
            <button onClick={handlePrint}
              style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 16px', background: 'var(--card-bg)', border: '1.5px solid var(--card-border)', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', color: 'var(--text-2)' }}>
              <Printer size={14} /> Print
            </button>
          )}
        </div>
      </div>

      {/* ── Date Range Picker ───────────────────────────────────── */}
      <div className="card no-print" style={{ padding: '12px 20px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        <Calendar size={15} style={{ color: 'var(--text-3)', flexShrink: 0 }} />
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Period</span>

        {/* Full Year / Custom toggle */}
        <div style={{ display: 'flex', background: 'var(--table-header-bg)', borderRadius: 8, padding: 3, gap: 2 }}>
          {[['full', 'Full Year'], ['custom', 'Custom Range']].map(([mode, label]) => (
            <button key={mode} onClick={() => { setRangeMode(mode); setGenerated(false) }}
              style={{
                padding: '5px 14px', borderRadius: 6, border: 'none', cursor: 'pointer',
                fontSize: 12, fontWeight: rangeMode === mode ? 700 : 500,
                background: rangeMode === mode ? 'var(--card-bg)' : 'transparent',
                color: rangeMode === mode ? 'var(--accent)' : 'var(--text-2)',
                boxShadow: rangeMode === mode ? '0 1px 4px rgba(0,0,0,0.1)' : 'none',
                transition: 'all 0.15s',
              }}>
              {label}
            </button>
          ))}
        </div>

        {rangeMode === 'custom' && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase' }}>From</label>
              <input type="date" value={fromDate}
                min={fyDateRange(fy).from} max={toDate}
                onChange={e => { setFromDate(e.target.value); setGenerated(false) }}
                style={{ height: 34, padding: '0 10px', border: '1.5px solid var(--card-border)', borderRadius: 7, fontSize: 13, background: 'var(--input-bg)', color: 'var(--text-1)', outline: 'none' }} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase' }}>To</label>
              <input type="date" value={toDate}
                min={fromDate} max={fyDateRange(fy).to}
                onChange={e => { setToDate(e.target.value); setGenerated(false) }}
                style={{ height: 34, padding: '0 10px', border: '1.5px solid var(--card-border)', borderRadius: 7, fontSize: 13, background: 'var(--input-bg)', color: 'var(--text-1)', outline: 'none' }} />
            </div>
          </>
        )}

        {rangeMode === 'full' && (
          <span style={{ fontSize: 12, color: 'var(--text-3)' }}>
            {fmtD(fyDateRange(fy).from)} — {fmtD(fyDateRange(fy).to)}
          </span>
        )}

        {/* divider */}
        <div style={{ width: 1, height: 22, background: 'var(--card-border)', marginLeft: 4 }} />

        {/* Zero-balance toggle */}
        <label style={{ display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer', fontSize: 12, color: 'var(--text-2)', userSelect: 'none' }}>
          <input type="checkbox" checked={showZero} onChange={e => setShowZero(e.target.checked)}
            style={{ width: 15, height: 15, accentColor: 'var(--accent)', cursor: 'pointer' }} />
          Show zero-balance accounts
        </label>
      </div>

      {/* ── Tabs ───────────────────────────────────────────────── */}
      <div className="no-print" style={{ display: 'flex', gap: 4, marginBottom: 20, background: 'var(--table-header-bg)', padding: 4, borderRadius: 10, width: 'fit-content' }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{ padding: '8px 22px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: tab === t.id ? 700 : 500, background: tab === t.id ? 'var(--card-bg)' : 'transparent', color: tab === t.id ? 'var(--accent)' : 'var(--text-2)', boxShadow: tab === t.id ? '0 1px 4px rgba(0,0,0,0.1)' : 'none', transition: 'all 0.15s', whiteSpace: 'nowrap' }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Empty state ─────────────────────────────────────────── */}
      {!generated && !loading && (
        <div style={{ padding: '60px 24px', textAlign: 'center', background: 'var(--card-bg)', border: '1.5px solid var(--card-border)', borderRadius: 12 }}>
          <BarChart2 size={36} style={{ color: 'var(--text-3)', display: 'block', margin: '0 auto 12px' }} />
          <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-2)', margin: '0 0 6px' }}>
            Select a period and click Generate
          </p>
          <p style={{ fontSize: 12, color: 'var(--text-3)', margin: '0 0 20px' }}>
            {rangeMode === 'custom'
              ? `${fmtD(fromDate)} to ${fmtD(toDate)}`
              : `Full year — FY ${fy}`}
          </p>
          <button onClick={generate}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '10px 24px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
            <RefreshCw size={14} />
            {rangeMode === 'custom' ? `Generate ${fmtD(fromDate)} → ${fmtD(toDate)}` : `Generate for FY ${fy}`}
          </button>
        </div>
      )}

      {loading && (
        <div style={{ padding: 60, textAlign: 'center', color: 'var(--text-3)' }}>
          <Loader2 size={28} className="animate-spin" style={{ display: 'block', margin: '0 auto 10px' }} />
          Generating financial statements…
        </div>
      )}

      {/* ── Reports ─────────────────────────────────────────────── */}
      {generated && !loading && (
        <div id="financial-print-area" className="card" style={{ padding: 24 }}>
          {/* Church header */}
          <div style={{ marginBottom: 20, paddingBottom: 16, borderBottom: '1px solid var(--card-border)', textAlign: 'center' }}>
            <p style={{ fontSize: 18, fontWeight: 800, color: 'var(--text-1)', margin: '0 0 2px' }}>
              {church?.church_name || 'Church'}
            </p>
            {church?.diocese && (
              <p style={{ fontSize: 13, color: 'var(--text-2)', margin: '0 0 2px' }}>{church.diocese}</p>
            )}
            <p style={{ fontSize: 12, color: 'var(--text-3)', margin: 0 }}>
              {tab === 'rp' ? 'Receipts & Payments Account' : tab === 'ie' ? 'Income & Expenditure Account' : 'Balance Sheet'}
              &nbsp;·&nbsp;
              {genFrom === fyDateRange(fy).from && genTo === fyDateRange(fy).to
                ? `Full Year FY ${fy}`
                : `${fmtD(genFrom)} to ${fmtD(genTo)}`}
            </p>
          </div>

          {tab === 'rp' && rp && <ReceiptsPayments data={rp} navigate={navigate} dateFrom={genFrom} dateTo={genTo} />}
          {tab === 'ie' && ie && <IncomeExpenditure data={ie} showZero={showZero} navigate={navigate} dateFrom={genFrom} dateTo={genTo} />}
          {tab === 'bs' && bs && <BalanceSheet data={bs} showZero={showZero} navigate={navigate} dateFrom={genFrom} dateTo={genTo} />}
        </div>
      )}

    </div>
  )
}
