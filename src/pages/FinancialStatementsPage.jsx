/* ═══════════════════════════════════════════════════════════════
   FinancialStatementsPage.jsx — P&L + Balance Sheet
   ═══════════════════════════════════════════════════════════════ */

import { useState, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useToast } from '../lib/toast'
import { getIncomeStatement, getBalanceSheet, getFY, fyOptions, fmtAmt } from '../lib/accountingLib'
import { getChurch } from '../lib/supabase'
import { BarChart2, ArrowLeft, Loader2, Printer, ChevronDown } from 'lucide-react'

// ── Section Row ───────────────────────────────────────────────────

function StmtRow({ label, amount, bold, indent, positive = true, isHeader, isTotal }) {
  return (
    <tr style={{ background: isHeader ? 'var(--table-header-bg)' : isTotal ? 'rgba(0,0,0,0.04)' : 'transparent', borderTop: isTotal ? '2px solid var(--card-border)' : 'none' }}>
      <td style={{ padding: isHeader ? '9px 16px' : '7px 16px', fontSize: isHeader ? 11 : 13, fontWeight: isHeader ? 700 : (bold || isTotal ? 700 : 400), color: isHeader ? 'var(--text-3)' : 'var(--text-1)', textTransform: isHeader ? 'uppercase' : 'none', letterSpacing: isHeader ? '0.07em' : 'normal', paddingLeft: indent ? 32 : 16 }}>
        {label}
      </td>
      <td style={{ padding: isHeader ? '9px 16px' : '7px 16px', fontSize: isHeader ? 11 : 13, fontWeight: bold || isTotal ? 700 : 400, fontFamily: amount !== undefined ? 'monospace' : 'inherit', textAlign: 'right', color: amount !== undefined ? (amount >= 0 ? (positive ? '#16a34a' : '#b91c1c') : (positive ? '#b91c1c' : '#16a34a')) : 'var(--text-3)' }}>
        {amount !== undefined ? fmtAmt(Math.abs(amount)) : ''}
      </td>
    </tr>
  )
}

// ════════════════════════════════════════════════════════════════
//  MAIN PAGE
// ════════════════════════════════════════════════════════════════

export default function FinancialStatementsPage() {
  const navigate      = useNavigate()
  const toast         = useToast()
  const [searchParams] = useSearchParams()
  const initTab = searchParams.get('tab') === 'bs' ? 'bs' : 'pl'

  const [tab,       setTab]       = useState(initTab)
  const [fy,        setFy]        = useState(getFY())
  const [fyOpen,    setFyOpen]    = useState(false)
  const [loading,   setLoading]   = useState(false)
  const [generated, setGenerated] = useState(false)
  const [pl,        setPl]        = useState(null)
  const [bs,        setBs]        = useState(null)
  const [church,    setChurch]    = useState(null)
  const FYS = fyOptions()

  const generate = useCallback(async () => {
    setLoading(true)
    try {
      const [plData, bsData, c] = await Promise.all([getIncomeStatement(fy), getBalanceSheet(fy), getChurch()])
      setPl(plData); setBs(bsData); setChurch(c)
      setGenerated(true)
    } catch (e) { toast(e.message, 'error') }
    setLoading(false)
  }, [fy, toast])

  const bsBalanced = bs ? Math.abs(bs.totalAssets - (bs.totalLiabilities + bs.totalEquity)) < 0.01 : false

  return (
    <div className="page-container">
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={() => navigate('/accounting')} style={{ padding: '6px 8px', background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: 7, cursor: 'pointer', display: 'flex', alignItems: 'center', color: 'var(--text-2)' }}>
            <ArrowLeft size={15} />
          </button>
          <div>
            <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
              <BarChart2 size={20} style={{ color: 'var(--accent)' }} /> Financial Statements
            </h1>
            <p className="page-subtitle">Income Statement &amp; Balance Sheet</p>
          </div>
        </div>
        {generated && (
          <button onClick={() => window.print()} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 14px', background: 'var(--card-bg)', border: '1.5px solid var(--card-border)', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', color: 'var(--text-1)' }}>
            <Printer size={15} /> Print
          </button>
        )}
      </div>

      {/* Controls */}
      <div className="card" style={{ padding: '14px 18px', marginBottom: 24, display: 'flex', gap: 14, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div style={{ position: 'relative' }}>
          <label style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-3)', display: 'block', marginBottom: 5 }}>Financial Year</label>
          <button onClick={() => setFyOpen(o => !o)} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 14px', height: 36, background: 'var(--input-bg)', border: '1.5px solid var(--card-border)', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', color: 'var(--text-1)' }}>
            FY {fy} <ChevronDown size={13} />
          </button>
          {fyOpen && (
            <div style={{ position: 'absolute', top: '110%', left: 0, background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: 9, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', zIndex: 50, minWidth: 140 }}>
              {FYS.map(f => <button key={f} onClick={() => { setFy(f); setFyOpen(false); setGenerated(false) }} style={{ display: 'block', width: '100%', padding: '9px 16px', fontSize: 13, textAlign: 'left', background: f === fy ? 'var(--sidebar-item-active-bg)' : 'transparent', color: f === fy ? 'var(--accent)' : 'var(--text-1)', fontWeight: f === fy ? 700 : 400, border: 'none', cursor: 'pointer' }}>FY {f}</button>)}
            </div>
          )}
        </div>
        <button onClick={generate} disabled={loading}
          style={{ height: 36, padding: '0 22px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 7 }}>
          {loading ? <Loader2 size={14} className="animate-spin" /> : null} Generate
        </button>
      </div>

      {/* Tab selector */}
      {generated && (
        <div style={{ display: 'flex', gap: 4, marginBottom: 20 }}>
          {[['pl', 'Income Statement (P&L)'], ['bs', 'Balance Sheet']].map(([key, label]) => (
            <button key={key} onClick={() => setTab(key)}
              style={{ padding: '8px 20px', borderRadius: 8, border: '2px solid', borderColor: tab === key ? 'var(--accent)' : 'var(--card-border)', background: tab === key ? 'var(--accent)' : 'var(--card-bg)', color: tab === key ? '#fff' : 'var(--text-2)', fontSize: 13, fontWeight: 700, cursor: 'pointer', transition: 'all 0.15s' }}>
              {label}
            </button>
          ))}
        </div>
      )}

      {!generated && !loading && (
        <div className="card" style={{ padding: '50px 20px', textAlign: 'center', color: 'var(--text-3)' }}>
          <BarChart2 size={32} style={{ opacity: 0.25, display: 'block', margin: '0 auto 12px' }} />
          <p style={{ fontSize: 13 }}>Select a financial year and click Generate to view statements.</p>
        </div>
      )}

      {loading && (
        <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--text-3)' }}>
          <Loader2 size={24} className="animate-spin" style={{ display: 'block', margin: '0 auto 8px' }} /> Generating statements…
        </div>
      )}

      {/* Print header (visible in print only) */}
      {generated && (
        <div className="print-only" style={{ textAlign: 'center', marginBottom: 16 }}>
          <p style={{ fontSize: 17, fontWeight: 800, margin: '0 0 4px' }}>{church?.church_name}</p>
          <p style={{ fontSize: 12, margin: '0 0 4px' }}>{church?.address}, {church?.city}</p>
          <p style={{ fontSize: 14, fontWeight: 700, margin: '0 0 2px' }}>{tab === 'pl' ? 'Income & Expenditure Statement' : 'Balance Sheet'}</p>
          <p style={{ fontSize: 12, margin: 0 }}>For the Financial Year {fy}</p>
        </div>
      )}

      {/* ── P&L ─────────────────────────────────────────────── */}
      {generated && !loading && tab === 'pl' && pl && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
          {/* Income */}
          <div className="card" style={{ overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <StmtRow label="INCOME" isHeader />
              {pl.income.map(a => (
                <StmtRow key={a.id} label={a.name} amount={a.total_credit - a.total_debit} indent positive />
              ))}
              <StmtRow label="Total Income" amount={pl.totalIncome} bold isTotal positive />
            </table>
          </div>

          {/* Expenses */}
          <div className="card" style={{ overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <StmtRow label="EXPENDITURE" isHeader />
              {pl.expenses.map(a => (
                <StmtRow key={a.id} label={a.name} amount={a.total_debit - a.total_credit} indent positive={false} />
              ))}
              <StmtRow label="Total Expenditure" amount={pl.totalExpenses} bold isTotal positive={false} />
            </table>
          </div>

          {/* Net result */}
          <div className="card" style={{ gridColumn: '1 / -1', padding: '18px 22px', background: pl.netIncome >= 0 ? '#dcfce733' : '#fee2e233', borderLeft: `4px solid ${pl.netIncome >= 0 ? '#16a34a' : '#b91c1c'}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: pl.netIncome >= 0 ? '#16a34a' : '#b91c1c', margin: '0 0 4px' }}>
                  {pl.netIncome >= 0 ? 'Net Surplus (Income over Expenditure)' : 'Net Deficit (Expenditure over Income)'}
                </p>
                <p style={{ fontSize: 12, color: 'var(--text-3)', margin: 0 }}>For Financial Year {fy}</p>
              </div>
              <p style={{ fontSize: 26, fontWeight: 800, fontFamily: 'monospace', color: pl.netIncome >= 0 ? '#16a34a' : '#b91c1c', margin: 0 }}>
                {fmtAmt(Math.abs(pl.netIncome))}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ── Balance Sheet ────────────────────────────────────── */}
      {generated && !loading && tab === 'bs' && bs && (
        <>
          {/* Balance status */}
          <div style={{ marginBottom: 16 }}>
            <div className="card" style={{ padding: '14px 20px', background: bsBalanced ? '#dcfce733' : '#fee2e233', borderLeft: `4px solid ${bsBalanced ? '#16a34a' : '#b91c1c'}` }}>
              <p style={{ fontSize: 12, fontWeight: 700, color: bsBalanced ? '#16a34a' : '#b91c1c', margin: 0 }}>
                {bsBalanced ? '✓ Balance Sheet Agrees — Assets = Liabilities + Equity' : `⚠ Balance Sheet Disagrees — difference of ${fmtAmt(Math.abs(bs.totalAssets - (bs.totalLiabilities + bs.totalEquity)))}`}
              </p>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
            {/* Assets */}
            <div className="card" style={{ overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <StmtRow label="ASSETS" isHeader />
                {bs.assets.map(a => (
                  <StmtRow key={a.id} label={a.name} amount={a.total_debit - a.total_credit} indent positive />
                ))}
                <StmtRow label="Total Assets" amount={bs.totalAssets} bold isTotal positive />
              </table>
            </div>

            {/* Liabilities + Equity */}
            <div className="card" style={{ overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <StmtRow label="LIABILITIES" isHeader />
                {bs.liabilities.map(a => (
                  <StmtRow key={a.id} label={a.name} amount={a.total_credit - a.total_debit} indent positive={false} />
                ))}
                <StmtRow label="Total Liabilities" amount={bs.totalLiabilities} bold isTotal positive={false} />

                <StmtRow label="FUNDS & EQUITY" isHeader />
                {bs.equity.map(a => (
                  <StmtRow key={a.id} label={a.name} amount={a.total_credit - a.total_debit} indent positive />
                ))}
                <tr style={{ background: 'rgba(0,0,0,0.012)' }}>
                  <td style={{ padding: '7px 16px 7px 32px', fontSize: 13, color: pl?.netIncome >= 0 ? '#16a34a' : '#b91c1c', fontStyle: 'italic' }}>
                    {pl?.netIncome >= 0 ? '+ Surplus for the year' : '− Deficit for the year'}
                  </td>
                  <td style={{ padding: '7px 16px', fontSize: 13, fontFamily: 'monospace', textAlign: 'right', color: pl?.netIncome >= 0 ? '#16a34a' : '#b91c1c' }}>
                    {pl ? fmtAmt(Math.abs(pl.netIncome)) : '—'}
                  </td>
                </tr>
                <StmtRow label="Total Funds & Equity" amount={bs.totalEquity} bold isTotal positive />
              </table>
            </div>

            {/* Total check */}
            <div className="card" style={{ gridColumn: '1 / -1', padding: '14px 20px', display: 'flex', justifyContent: 'space-around', flexWrap: 'wrap', gap: 16 }}>
              <div style={{ textAlign: 'center' }}>
                <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: '#2563eb', margin: '0 0 4px' }}>Total Assets</p>
                <p style={{ fontSize: 22, fontWeight: 800, fontFamily: 'monospace', color: '#2563eb', margin: 0 }}>{fmtAmt(bs.totalAssets)}</p>
              </div>
              <div style={{ textAlign: 'center', fontSize: 24, fontWeight: 800, color: 'var(--text-3)', display: 'flex', alignItems: 'center' }}>=</div>
              <div style={{ textAlign: 'center' }}>
                <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: '#b91c1c', margin: '0 0 4px' }}>Liabilities</p>
                <p style={{ fontSize: 22, fontWeight: 800, fontFamily: 'monospace', color: '#b91c1c', margin: 0 }}>{fmtAmt(bs.totalLiabilities)}</p>
              </div>
              <div style={{ textAlign: 'center', fontSize: 24, fontWeight: 800, color: 'var(--text-3)', display: 'flex', alignItems: 'center' }}>+</div>
              <div style={{ textAlign: 'center' }}>
                <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: '#16a34a', margin: '0 0 4px' }}>Funds &amp; Equity</p>
                <p style={{ fontSize: 22, fontWeight: 800, fontFamily: 'monospace', color: '#16a34a', margin: 0 }}>{fmtAmt(bs.totalEquity)}</p>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
