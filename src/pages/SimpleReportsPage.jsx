/* ═══════════════════════════════════════════════════════════════
   SimpleReportsPage.jsx — Monthly summary and category breakdown
   ═══════════════════════════════════════════════════════════════ */

import { useState, useEffect, useCallback } from 'react'
import { BarChart3, TrendingUp, TrendingDown, ChevronDown, RefreshCw, Download } from 'lucide-react'
import { useToast } from '../lib/toast'
import { getMonthlyReport, getCategoryReport, getSimpleSettings, fmtAmt, monthLabel } from '../lib/simpleAccountsLib'

function Tab({ label, active, onClick }) {
  return (
    <button onClick={onClick}
      style={{ padding: '8px 20px', background: active ? 'var(--accent)' : 'transparent', color: active ? '#fff' : 'var(--text-2)', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: active ? 700 : 500, cursor: 'pointer', transition: 'all 0.15s' }}>
      {label}
    </button>
  )
}

function SurplusBar({ income, expense }) {
  const total = income + expense
  if (!total) return null
  const incomePct = Math.round((income / total) * 100)
  return (
    <div style={{ height: 6, borderRadius: 99, background: '#fee2e2', overflow: 'hidden', marginTop: 6 }}>
      <div style={{ height: '100%', width: `${incomePct}%`, background: '#16a34a', borderRadius: 99, transition: 'width 0.4s ease' }} />
    </div>
  )
}

export default function SimpleReportsPage() {
  const toast = useToast()

  const [tab,      setTab]      = useState('monthly')
  const [year,     setYear]     = useState(new Date().getFullYear())
  const [currency, setCurrency] = useState('₹')
  const [loading,  setLoading]  = useState(true)
  const [monthly,  setMonthly]  = useState([])
  const [incomeCats,  setIncomeCats]  = useState([])
  const [expenseCats, setExpenseCats] = useState([])
  const [yearOpen, setYearOpen] = useState(false)

  const years = []
  for (let y = new Date().getFullYear(); y >= 2024; y--) years.push(y)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const settings = await getSimpleSettings()
      setCurrency(settings.currency)

      const [mon, incCats, expCats] = await Promise.all([
        getMonthlyReport(year),
        getCategoryReport({ type: 'income',  from: `${year}-01-01`, to: `${year}-12-31` }),
        getCategoryReport({ type: 'expense', from: `${year}-01-01`, to: `${year}-12-31` }),
      ])
      setMonthly(mon)
      setIncomeCats(incCats)
      setExpenseCats(expCats)
    } catch (e) {
      toast('Failed to load: ' + e.message, 'error')
    }
    setLoading(false)
  }, [year, toast])

  useEffect(() => { load() }, [load])

  const totalIncome  = monthly.reduce((s, m) => s + m.income,  0)
  const totalExpense = monthly.reduce((s, m) => s + m.expense, 0)
  const totalSurplus = totalIncome - totalExpense

  function exportCSV() {
    if (tab === 'monthly') {
      const rows = [['Month', 'Income', 'Expenses', 'Surplus']]
      monthly.forEach(m => rows.push([m.label, m.income.toFixed(2), m.expense.toFixed(2), m.surplus.toFixed(2)]))
      rows.push(['TOTAL', totalIncome.toFixed(2), totalExpense.toFixed(2), totalSurplus.toFixed(2)])
      downloadCSV(rows, `monthly-report-${year}`)
    } else {
      const rows = [['Category', 'Type', 'Total']]
      incomeCats.forEach(c => rows.push([c.name, 'Income', c.total.toFixed(2)]))
      expenseCats.forEach(c => rows.push([c.name, 'Expense', c.total.toFixed(2)]))
      downloadCSV(rows, `category-report-${year}`)
    }
  }

  function downloadCSV(rows, filename) {
    const csv = rows.map(r => r.join(',')).join('\n')
    const a = Object.assign(document.createElement('a'), { href: 'data:text/csv,' + encodeURIComponent(csv), download: `${filename}.csv` })
    a.click()
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <BarChart3 size={20} style={{ color: 'var(--accent)' }} /> Reports
          </h1>
          <p className="page-subtitle">Summarised view of your church finances</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {/* Year picker */}
          <div style={{ position: 'relative' }}>
            <button onClick={() => setYearOpen(o => !o)}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', background: 'var(--card-bg)', border: '1.5px solid var(--card-border)', borderRadius: 8, fontSize: 13, fontWeight: 600, color: 'var(--text-1)', cursor: 'pointer' }}>
              {year} <ChevronDown size={13} />
            </button>
            {yearOpen && (
              <div style={{ position: 'absolute', top: '110%', right: 0, background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: 9, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', zIndex: 50, minWidth: 100, overflow: 'hidden' }}>
                {years.map(y => (
                  <button key={y} onClick={() => { setYear(y); setYearOpen(false) }}
                    style={{ display: 'block', width: '100%', padding: '9px 16px', fontSize: 13, textAlign: 'left', background: y === year ? 'var(--sidebar-item-active-bg)' : 'transparent', color: y === year ? 'var(--accent)' : 'var(--text-1)', fontWeight: y === year ? 700 : 400, border: 'none', cursor: 'pointer' }}>
                    {y}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button onClick={load} title="Refresh" style={{ padding: '8px 10px', background: 'var(--card-bg)', border: '1.5px solid var(--card-border)', borderRadius: 8, cursor: 'pointer', display: 'flex', alignItems: 'center', color: 'var(--text-2)' }}>
            <RefreshCw size={15} />
          </button>
          <button onClick={exportCSV} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 14px', background: 'var(--card-bg)', border: '1.5px solid var(--card-border)', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', color: 'var(--text-2)' }}>
            <Download size={14} /> Export CSV
          </button>
        </div>
      </div>

      {/* Annual summary strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 20 }}>
        {[
          { label: `${year} — Total Income`,   value: totalIncome,  color: '#16a34a', bg: '#dcfce7', icon: TrendingUp },
          { label: `${year} — Total Expenses`,  value: totalExpense, color: '#dc2626', bg: '#fee2e2', icon: TrendingDown },
          { label: `${year} — Net Surplus`,     value: totalSurplus, color: totalSurplus >= 0 ? '#2563eb' : '#dc2626', bg: totalSurplus >= 0 ? '#dbeafe' : '#fee2e2', icon: BarChart3 },
        ].map(({ label, value, color, bg, icon: Icon }) => (
          <div key={label} className="card" style={{ padding: '16px 18px', borderLeft: `4px solid ${color}` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <div style={{ width: 28, height: 28, borderRadius: 7, background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon size={13} color={color} />
              </div>
              <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-3)' }}>{label}</span>
            </div>
            {loading
              ? <div className="loading-skeleton" style={{ height: 28, width: '60%', borderRadius: 5 }} />
              : <p style={{ fontSize: 22, fontWeight: 800, color, margin: 0, fontFamily: 'monospace' }}>{fmtAmt(value, currency)}</p>
            }
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 16, background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: 10, padding: 4, width: 'fit-content' }}>
        <Tab label="Monthly Breakdown" active={tab === 'monthly'}  onClick={() => setTab('monthly')} />
        <Tab label="By Category"       active={tab === 'category'} onClick={() => setTab('category')} />
      </div>

      {/* Monthly tab */}
      {tab === 'monthly' && (
        <div className="card" style={{ overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 600 }}>
              <thead>
                <tr style={{ background: 'var(--table-header-bg)' }}>
                  {['Month', 'Income', 'Expenses', 'Surplus / Deficit', ''].map(h => (
                    <th key={h} style={{ padding: '10px 16px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-3)', textAlign: h === 'Month' || h === '' ? 'left' : 'right' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading
                  ? [1,2,3,4,5].map(i => (
                    <tr key={i}>
                      <td colSpan={5} style={{ padding: 10 }}><div className="loading-skeleton" style={{ height: 32, borderRadius: 5 }} /></td>
                    </tr>
                  ))
                  : monthly.map((m, i) => {
                    const hasData = m.income > 0 || m.expense > 0
                    return (
                      <tr key={m.month} style={{ background: i % 2 ? 'rgba(0,0,0,0.012)' : 'transparent', borderBottom: '1px solid var(--card-border)', opacity: hasData ? 1 : 0.45 }}>
                        <td style={{ padding: '12px 16px', fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>{m.label} {year}</td>
                        <td style={{ padding: '12px 16px', fontSize: 13, fontWeight: hasData ? 700 : 400, color: '#16a34a', textAlign: 'right', fontFamily: 'monospace' }}>
                          {hasData ? fmtAmt(m.income, currency) : '—'}
                        </td>
                        <td style={{ padding: '12px 16px', fontSize: 13, fontWeight: hasData ? 700 : 400, color: '#dc2626', textAlign: 'right', fontFamily: 'monospace' }}>
                          {hasData ? fmtAmt(m.expense, currency) : '—'}
                        </td>
                        <td style={{ padding: '12px 16px', fontSize: 13, fontWeight: 700, color: m.surplus >= 0 ? '#2563eb' : '#dc2626', textAlign: 'right', fontFamily: 'monospace' }}>
                          {hasData ? (m.surplus >= 0 ? '+' : '') + fmtAmt(m.surplus, currency) : '—'}
                        </td>
                        <td style={{ padding: '12px 16px', minWidth: 120 }}>
                          {hasData && <SurplusBar income={m.income} expense={m.expense} />}
                        </td>
                      </tr>
                    )
                  })
                }
                {/* Totals row */}
                {!loading && (
                  <tr style={{ background: 'var(--sidebar-item-active-bg)', borderTop: '2px solid var(--card-border)' }}>
                    <td style={{ padding: '12px 16px', fontSize: 13, fontWeight: 800, color: 'var(--text-1)' }}>TOTAL {year}</td>
                    <td style={{ padding: '12px 16px', fontSize: 14, fontWeight: 800, color: '#16a34a', textAlign: 'right', fontFamily: 'monospace' }}>{fmtAmt(totalIncome, currency)}</td>
                    <td style={{ padding: '12px 16px', fontSize: 14, fontWeight: 800, color: '#dc2626', textAlign: 'right', fontFamily: 'monospace' }}>{fmtAmt(totalExpense, currency)}</td>
                    <td style={{ padding: '12px 16px', fontSize: 14, fontWeight: 800, color: totalSurplus >= 0 ? '#2563eb' : '#dc2626', textAlign: 'right', fontFamily: 'monospace' }}>
                      {(totalSurplus >= 0 ? '+' : '') + fmtAmt(totalSurplus, currency)}
                    </td>
                    <td />
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Category tab */}
      {tab === 'category' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
          {[
            { title: 'Income by Category', cats: incomeCats, color: '#16a34a', bg: '#dcfce7', total: incomeCats.reduce((s, c) => s + c.total, 0) },
            { title: 'Expenses by Category', cats: expenseCats, color: '#dc2626', bg: '#fee2e2', total: expenseCats.reduce((s, c) => s + c.total, 0) },
          ].map(({ title, cats, color, bg, total }) => (
            <div key={title} className="card" style={{ overflow: 'hidden' }}>
              <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--card-border)' }}>
                <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)', margin: 0 }}>{title}</p>
              </div>
              {loading ? (
                <div style={{ padding: '16px 18px' }}>
                  {[1,2,3].map(i => <div key={i} className="loading-skeleton" style={{ height: 32, borderRadius: 5, marginBottom: 8 }} />)}
                </div>
              ) : cats.length === 0 ? (
                <p style={{ padding: '32px 18px', textAlign: 'center', fontSize: 13, color: 'var(--text-3)', margin: 0 }}>No data for {year}</p>
              ) : (
                <div>
                  {cats.map(c => {
                    const pct = total > 0 ? (c.total / total) * 100 : 0
                    return (
                      <div key={c.name} style={{ padding: '10px 18px', borderBottom: '1px solid var(--card-border)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                          <span style={{ fontSize: 13, color: 'var(--text-1)', fontWeight: 500 }}>{c.name}</span>
                          <span style={{ fontSize: 13, fontWeight: 700, color, fontFamily: 'monospace' }}>{fmtAmt(c.total, currency)}</span>
                        </div>
                        <div style={{ height: 5, borderRadius: 99, background: 'var(--card-border)', overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 99, transition: 'width 0.4s ease' }} />
                        </div>
                        <span style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 2, display: 'block' }}>{pct.toFixed(1)}%</span>
                      </div>
                    )
                  })}
                  <div style={{ padding: '11px 18px', display: 'flex', justifyContent: 'space-between', background: 'var(--sidebar-item-active-bg)' }}>
                    <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-1)' }}>Total</span>
                    <span style={{ fontSize: 14, fontWeight: 800, color, fontFamily: 'monospace' }}>{fmtAmt(total, currency)}</span>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
