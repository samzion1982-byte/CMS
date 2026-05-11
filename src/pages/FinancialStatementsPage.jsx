/* ═══════════════════════════════════════════════════════════════
   FinancialStatementsPage.jsx
   Church financial statements — three standard reports:

   1. Receipts & Payments Account  (cash-basis summary)
   2. Income & Expenditure Account (accrual — Surplus / Deficit)
   3. Balance Sheet                (Assets vs Liabilities + Corpus Fund)
   ═══════════════════════════════════════════════════════════════ */

import { useState, useCallback, useEffect, useRef } from 'react'
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
  BarChart2, ArrowLeft, Loader2, Printer, ChevronDown,
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
            const rClickable = !!(row.r?.accountId && navigate)
            return (
              <tr key={i} style={{ background: i % 2 === 1 ? 'var(--table-alt-bg, #f9fafb)' : 'transparent' }}>
                <CellPair cell={row.l} navigate={navigate} dateFrom={dateFrom} dateTo={dateTo} />
                <td
                  style={{ ...TD, borderLeft: '2px solid var(--card-border)', fontWeight: row.r?.bold ? 700 : 400, paddingLeft: row.r?.indent ? 36 : 16, color: row.r?.muted ? 'var(--text-3)' : 'var(--text-1)', fontStyle: row.r?.italic ? 'italic' : 'normal', cursor: rClickable ? 'pointer' : 'inherit', textDecoration: rClickable ? 'underline dotted' : 'none', textUnderlineOffset: 3 }}
                  onClick={rClickable ? () => navigate(`/accounting/ledger?accountId=${row.r.accountId}&from=${dateFrom}&to=${dateTo}`) : undefined}
                  title={rClickable ? 'View Ledger' : undefined}
                >
                  {row.r?.label || ''}
                  {rClickable && <ExternalLink size={10} style={{ marginLeft: 4, opacity: 0.45, verticalAlign: 'middle' }} />}
                </td>
                <td style={{ ...TD, textAlign: 'right', fontFamily: 'monospace', fontWeight: row.r?.bold ? 700 : 400, color: 'var(--text-1)' }}>
                  {row.r?.amount !== undefined ? fmtAmt(row.r.amount) : ''}
                </td>
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
  return (
    <>
      <td
        style={{ ...TD, fontWeight: cell?.bold ? 700 : 400, paddingLeft: cell?.indent ? 36 : 16, color: cell?.muted ? 'var(--text-3)' : 'var(--text-1)', fontStyle: cell?.italic ? 'italic' : 'normal', cursor: clickable ? 'pointer' : 'inherit', textDecoration: clickable ? 'underline dotted' : 'none', textUnderlineOffset: 3 }}
        onClick={clickable ? () => navigate(`/accounting/ledger?accountId=${cell.accountId}&from=${dateFrom}&to=${dateTo}`) : undefined}
        title={clickable ? 'View Ledger' : undefined}
      >
        {cell?.label || ''}
        {clickable && <ExternalLink size={10} style={{ marginLeft: 4, opacity: 0.45, verticalAlign: 'middle' }} />}
      </td>
      <td style={{ ...TD, textAlign: 'right', fontFamily: 'monospace', fontWeight: cell?.bold ? 700 : 400, color: 'var(--text-1)' }}>
        {cell?.amount !== undefined ? fmtAmt(cell.amount) : ''}
      </td>
    </>
  )
}

// ════════════════════════════════════════════════════════════════
//  Receipts & Payments Account
// ════════════════════════════════════════════════════════════════

function ReceiptsPayments({ data }) {
  const leftRows = [
    { label: 'Opening Balance', bold: true },
    { label: 'Cash in Hand',  amount: data.cashOpeningBalance, indent: true },
    { label: 'Cash at Bank',  amount: data.bankOpeningBalance, indent: true },
    { label: 'Total Opening', amount: data.openingBalance, bold: true },
    { label: '' },
    { label: 'RECEIPTS', bold: true, muted: true },
    ...data.receipts.map(r => ({ label: r.name, amount: r.amount, indent: true })),
    { label: '' },
    { label: 'Total Receipts', amount: data.totalReceipts, bold: true },
  ]

  const rightRows = [
    { label: 'PAYMENTS', bold: true, muted: true },
    { label: '' },
    ...data.payments.map(p => ({ label: p.name, amount: p.amount, indent: true })),
    { label: '' },
    { label: 'Total Payments', amount: data.totalPayments, bold: true },
    { label: '' },
    { label: 'Closing Balance', bold: true },
    { label: 'Cash in Hand',  amount: data.cashClosingBalance, indent: true },
    { label: 'Cash at Bank',  amount: data.bankClosingBalance, indent: true },
    { label: 'Total Closing', amount: data.closingBalance, bold: true },
  ]

  const leftTotal  = data.openingBalance + data.totalReceipts
  const rightTotal = data.totalPayments  + data.closingBalance

  return (
    <div>
      <TwoColTable
        leftRows={leftRows} rightRows={rightRows}
        leftTotal={leftTotal} rightTotal={rightTotal}
        leftLabel="Dr  —  Receipts"
        rightLabel="Cr  —  Payments"
      />
      <p style={{ fontSize: 11, color: 'var(--text-3)', textAlign: 'right', margin: '8px 0 0' }}>
        Receipts grouped by income category · Payments grouped by expense category ·
        Opening balance from Chart of Accounts settings
      </p>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════
//  Income & Expenditure Account
// ════════════════════════════════════════════════════════════════

function IncomeExpenditure({ data, showZero, navigate, dateFrom, dateTo }) {
  const surplus   = data.surplus
  const isDeficit = surplus < 0

  const expenses = showZero ? data.expenses : data.expenses.filter(a => Math.abs(a.total_debit - a.total_credit) >= 0.01)
  const income   = showZero ? data.income   : data.income.filter(a => Math.abs(a.total_credit - a.total_debit) >= 0.01)

  const leftRows = [
    { label: 'EXPENDITURE', bold: true, muted: true },
    { label: '' },
    ...expenses.map(a => ({ label: a.name, amount: Math.max(0, a.total_debit - a.total_credit), indent: true, accountId: a.id })),
    { label: '' },
    { label: 'Total Expenditure', amount: data.totalExpenses, bold: true },
    { label: '' },
    ...(!isDeficit ? [{ label: 'Surplus transferred to Corpus Fund', amount: surplus, bold: true, italic: true }] : []),
  ]

  const rightRows = [
    { label: 'INCOME', bold: true, muted: true },
    { label: '' },
    ...income.map(a => ({ label: a.name, amount: Math.max(0, a.total_credit - a.total_debit), indent: true, accountId: a.id })),
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
  const isBalanced = Math.abs(data.totalAssets - (data.totalLiabilities + data.totalCorpus)) < 0.01

  const filterAccts = (list, getAmt) =>
    showZero ? list : list.filter(a => Math.abs(getAmt(a)) >= 0.01)

  const corpus      = filterAccts(data.corpus,      a => a.total_credit - a.total_debit)
  const liabilities = filterAccts(data.liabilities, a => a.total_credit - a.total_debit)
  const assets      = filterAccts(data.assets,      a => a.total_debit  - a.total_credit)

  const leftRows = [
    { label: 'CORPUS / GENERAL FUND', bold: true, muted: true },
    { label: '' },
    ...corpus.map(a => ({ label: a.name, amount: Math.max(0, a.total_credit - a.total_debit), indent: true, accountId: a.id })),
    { label: data.surplus >= 0 ? 'Add: Surplus for the year' : 'Less: Deficit for the year', amount: Math.abs(data.surplus), indent: true, italic: true },
    { label: 'Total Corpus Fund', amount: data.totalCorpus, bold: true },
    { label: '' },
    { label: 'LIABILITIES', bold: true, muted: true },
    { label: '' },
    ...liabilities.map(a => ({ label: a.name, amount: Math.max(0, a.total_credit - a.total_debit), indent: true, accountId: a.id })),
    { label: 'Total Liabilities', amount: data.totalLiabilities, bold: true },
  ]

  const rightRows = [
    { label: 'ASSETS', bold: true, muted: true },
    { label: '' },
    ...assets.map(a => ({ label: a.name, amount: Math.max(0, a.total_debit - a.total_credit), indent: true, accountId: a.id })),
    { label: '' },
    { label: 'Total Assets', amount: data.totalAssets, bold: true },
  ]

  const leftTotal  = data.totalCorpus + data.totalLiabilities
  const rightTotal = data.totalAssets

  return (
    <div>
      <TwoColTable
        leftRows={leftRows} rightRows={rightRows}
        leftTotal={leftTotal} rightTotal={rightTotal}
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
      <div className="page-header">
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
            <button onClick={() => window.print()}
              style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 16px', background: 'var(--card-bg)', border: '1.5px solid var(--card-border)', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', color: 'var(--text-2)' }}>
              <Printer size={14} /> Print
            </button>
          )}
        </div>
      </div>

      {/* ── Date Range Picker ───────────────────────────────────── */}
      <div className="card" style={{ padding: '12px 20px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
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
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, background: 'var(--table-header-bg)', padding: 4, borderRadius: 10, width: 'fit-content' }}>
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
        <div className="card" style={{ padding: 24 }}>
          {/* Church header */}
          <div style={{ marginBottom: 20, paddingBottom: 16, borderBottom: '1px solid var(--card-border)' }}>
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

          {tab === 'rp' && rp && <ReceiptsPayments data={rp} />}
          {tab === 'ie' && ie && <IncomeExpenditure data={ie} showZero={showZero} navigate={navigate} dateFrom={genFrom} dateTo={genTo} />}
          {tab === 'bs' && bs && <BalanceSheet data={bs} showZero={showZero} navigate={navigate} dateFrom={genFrom} dateTo={genTo} />}
        </div>
      )}

    </div>
  )
}
