/* ═══════════════════════════════════════════════════════════════
   SimpleReportsPage.jsx — Monthly summary and category breakdown
   ═══════════════════════════════════════════════════════════════ */

import { useState, useEffect, useCallback } from 'react'
import { BarChart3, TrendingUp, TrendingDown, ChevronDown, RefreshCw, ArrowLeft, Calendar, X, Loader2, FileSpreadsheet } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useToast } from '../lib/toast'
import {
  getMonthlyReport, getMonthlyReportRange, getCategoryReport,
  getSimpleTransactions, getSimpleSettings,
  getEarliestTransactionYear, fiscalYearRange,
  fmtAmt, fmtDate, txnLabel, todayISO,
} from '../lib/simpleAccountsLib'
import { exportToExcel, exportToExcelMultiSheet } from '../lib/exportExcel'
import PageHeader from '../components/ui/PageHeader'

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

function TypeBadge({ txn }) {
  const c = txnLabel(txn)
  return (
    <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: c.bg, color: c.color, whiteSpace: 'nowrap' }}>
      {c.label}
    </span>
  )
}

export default function SimpleReportsPage() {
  const toast    = useToast()
  const navigate = useNavigate()

  const [tab,          setTab]         = useState('monthly')
  const [year,         setYear]        = useState(new Date().getFullYear())
  const [fyMode,       setFyMode]      = useState(false)
  const [currency,     setCurrency]    = useState('₹')
  const [dateFormat,   setDateFormat]  = useState('DD-MM-YYYY')
  const [numberFormat, setNumberFormat]= useState('indian')
  const [fiscalMonth,  setFiscalMonth] = useState(4)
  const [loading,      setLoading]     = useState(true)
  const [exporting,    setExporting]   = useState(false)
  const [monthly,     setMonthly]     = useState([])
  const [incomeCats,  setIncomeCats]  = useState([])
  const [expenseCats, setExpenseCats] = useState([])
  const [yearOpen,    setYearOpen]    = useState(false)
  const [years,       setYears]       = useState([new Date().getFullYear()])

  // Category drill-down
  const [drillCat,    setDrillCat]    = useState(null)  // { id, name, type, from, to }
  const [drillTxns,   setDrillTxns]   = useState([])
  const [drillLoad,   setDrillLoad]   = useState(false)

  // Compute FY date range
  function getFyRange(y, fm) {
    return fiscalYearRange(y, fm)
  }

  // Build date range for current settings
  function getDateRange() {
    if (fyMode) return getFyRange(year, fiscalMonth)
    return { from: `${year}-01-01`, to: `${year}-12-31` }
  }

  function fyLabel(y) {
    const endYY = String(y + 1).slice(2)
    return `FY ${y}-${endYY}`
  }

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [settings, earliest] = await Promise.all([
        getSimpleSettings(),
        getEarliestTransactionYear(),
      ])
      setCurrency(settings.currency)
      setDateFormat(settings.dateFormat    || 'DD-MM-YYYY')
      setNumberFormat(settings.numberFormat || 'indian')
      setFiscalMonth(settings.fiscalMonth)

      // Build year list
      const currentYear = new Date().getFullYear()
      const fromYear = Math.min(earliest, currentYear)
      const yearList = []
      for (let y = currentYear; y >= fromYear; y--) yearList.push(y)
      setYears(yearList)

      const { from, to } = fyMode
        ? getFyRange(year, settings.fiscalMonth)
        : { from: `${year}-01-01`, to: `${year}-12-31` }

      const [mon, incCats, expCats] = await Promise.all([
        fyMode ? getMonthlyReportRange(from, to) : getMonthlyReport(year),
        getCategoryReport({ type: 'income',  from, to }),
        getCategoryReport({ type: 'expense', from, to }),
      ])
      setMonthly(mon)
      setIncomeCats(incCats)
      setExpenseCats(expCats)
    } catch (e) {
      toast('Failed to load: ' + e.message, 'error')
    }
    setLoading(false)
  }, [year, fyMode, toast]) // eslint-disable-line

  useEffect(() => { load() }, [load])

  async function openDrillDown(cat, type) {
    const { from, to } = getDateRange()
    setDrillCat({ ...cat, type, from, to })
    setDrillLoad(true)
    setDrillTxns([])
    try {
      const txns = await getSimpleTransactions({ from, to, type, categoryId: cat.id })
      setDrillTxns(txns)
    } catch (e) {
      toast('Failed to load: ' + e.message, 'error')
    }
    setDrillLoad(false)
  }

  const totalIncome  = monthly.reduce((s, m) => s + m.income,  0)
  const totalExpense = monthly.reduce((s, m) => s + m.expense, 0)
  const totalSurplus = totalIncome - totalExpense

  const periodLabel = fyMode ? fyLabel(year) : String(year)

  async function handleExport() {
    if (loading) return
    setExporting(true)
    try {
      const locale  = numberFormat === 'international' ? 'en-US' : 'en-IN'
      const fmtNum  = n => currency + Number(n).toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      const dateSfx = todayISO().replace(/-/g, '')

      if (tab === 'monthly') {
        const columns = [
          { header: 'Month',                       key: 'month',   align: 'left'  },
          { header: `Income (${currency})`,         key: 'income',  align: 'right' },
          { header: `Expenses (${currency})`,       key: 'expense', align: 'right' },
          { header: `Surplus / Deficit (${currency})`, key: 'surplus', align: 'right' },
        ]
        const rows = monthly.map(m => ({
          month:   fyMode ? m.label : `${m.label} ${year}`,
          income:  fmtNum(m.income),
          expense: fmtNum(m.expense),
          surplus: fmtNum(m.surplus),
        }))
        rows.push({
          month:   `TOTAL — ${periodLabel}`,
          income:  fmtNum(totalIncome),
          expense: fmtNum(totalExpense),
          surplus: fmtNum(totalSurplus),
        })
        await exportToExcel(columns, rows, 'Monthly Report', `monthly-report-${periodLabel}-${dateSfx}.xlsx`)
      } else {
        const catColumns = [
          { header: 'Category',              key: 'category', align: 'left'  },
          { header: `Total (${currency})`,   key: 'total',    align: 'right' },
        ]
        const incomeRows = [
          ...incomeCats.map(c => ({ category: c.name, total: fmtNum(c.total) })),
          { category: 'TOTAL', total: fmtNum(incomeCats.reduce((s, c) => s + c.total, 0)) },
        ]
        const expenseRows = [
          ...expenseCats.map(c => ({ category: c.name, total: fmtNum(c.total) })),
          { category: 'TOTAL', total: fmtNum(expenseCats.reduce((s, c) => s + c.total, 0)) },
        ]
        await exportToExcelMultiSheet(catColumns, [
          { name: 'Income by Category',   rows: incomeRows  },
          { name: 'Expenses by Category', rows: expenseRows },
        ], `category-report-${periodLabel}-${dateSfx}.xlsx`)
      }
      toast('Report exported to Excel', 'success')
    } catch (e) {
      toast('Export failed: ' + e.message, 'error')
    }
    setExporting(false)
  }

  return (
    <div className="page-container simple-accounts-scope">
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 28, paddingBottom: 22, borderBottom: '1px solid var(--card-border)', flexWrap: 'wrap' }}>
        <button onClick={() => navigate('/simple-accounts')} title="Back to Money Book"
          style={{ display: 'flex', alignItems: 'center', padding: '7px 10px', background: 'var(--card-bg)', border: '1.5px solid var(--card-border)', borderRadius: 8, cursor: 'pointer', color: 'var(--text-2)', flexShrink: 0, marginTop: 2 }}>
          <ArrowLeft size={16} />
        </button>
        <PageHeader
          icon={BarChart3}
          title="Reports"
          subtitle="Summarised view of your church finances"
          style={{ flex: 1, marginBottom: 0, paddingBottom: 0, borderBottom: 'none', minWidth: 220 }}
        >
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {/* FY / Calendar toggle */}
            <div style={{ display: 'flex', background: 'var(--card-bg)', border: '1.5px solid var(--card-border)', borderRadius: 8, overflow: 'hidden' }}>
              <button onClick={() => setFyMode(false)}
                style={{ padding: '7px 12px', fontSize: 12, fontWeight: fyMode ? 500 : 700, background: fyMode ? 'transparent' : 'var(--accent)', color: fyMode ? 'var(--text-2)' : '#fff', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
                <Calendar size={12} /> Calendar
              </button>
              <button onClick={() => setFyMode(true)}
                style={{ padding: '7px 12px', fontSize: 12, fontWeight: fyMode ? 700 : 500, background: fyMode ? 'var(--accent)' : 'transparent', color: fyMode ? '#fff' : 'var(--text-2)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
                <Calendar size={12} /> Fiscal Year
              </button>
            </div>

            {/* Year picker */}
            <div style={{ position: 'relative' }}>
              <button onClick={() => setYearOpen(o => !o)}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', background: 'var(--card-bg)', border: '1.5px solid var(--card-border)', borderRadius: 8, fontSize: 13, fontWeight: 600, color: 'var(--text-1)', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                {fyMode ? fyLabel(year) : year} <ChevronDown size={13} />
              </button>
              {yearOpen && (
                <div style={{ position: 'absolute', top: '110%', right: 0, background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: 9, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', zIndex: 50, minWidth: 120, overflow: 'hidden' }}>
                  {years.map(y => (
                    <button key={y} onClick={() => { setYear(y); setYearOpen(false) }}
                      style={{ display: 'block', width: '100%', padding: '9px 16px', fontSize: 13, textAlign: 'left', background: y === year ? 'var(--sidebar-item-active-bg)' : 'transparent', color: y === year ? 'var(--accent)' : 'var(--text-1)', fontWeight: y === year ? 700 : 400, border: 'none', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                      {fyMode ? fyLabel(y) : y}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button onClick={load} title="Refresh" style={{ padding: '8px 10px', background: 'var(--card-bg)', border: '1.5px solid var(--card-border)', borderRadius: 8, cursor: 'pointer', display: 'flex', alignItems: 'center', color: 'var(--text-2)' }}>
              <RefreshCw size={15} />
            </button>
            <button onClick={handleExport} disabled={exporting || loading} className="action-btn"
              style={{ background: '#16a34a', opacity: (exporting || loading) ? 0.6 : 1 }}>
              {exporting ? <Loader2 size={13} style={{ animation: 'spin .7s linear infinite' }} /> : <FileSpreadsheet size={13} />}
              {exporting ? 'Exporting…' : 'Excel Export'}
            </button>
          </div>
        </PageHeader>
      </div>

      {/* Annual summary strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 20 }}>
        {[
          { label: `${periodLabel} — Total Income`,   value: totalIncome,  color: '#16a34a', bg: '#dcfce7', icon: TrendingUp },
          { label: `${periodLabel} — Total Expenses`,  value: totalExpense, color: '#dc2626', bg: '#fee2e2', icon: TrendingDown },
          { label: `${periodLabel} — Net Surplus`,     value: totalSurplus, color: totalSurplus >= 0 ? '#2563eb' : '#dc2626', bg: totalSurplus >= 0 ? '#dbeafe' : '#fee2e2', icon: BarChart3 },
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
              : <p style={{ fontSize: 22, fontWeight: 800, color, margin: 0, fontFamily: 'monospace' }}>{fmtAmt(value, currency, numberFormat)}</p>
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
                    const rowLabel = fyMode ? m.label : `${m.label} ${year}`
                    return (
                      <tr key={`${m.year ?? year}-${m.month}`} style={{ background: i % 2 ? 'rgba(0,0,0,0.012)' : 'transparent', borderBottom: '1px solid var(--card-border)', opacity: hasData ? 1 : 0.45 }}>
                        <td style={{ padding: '12px 16px', fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>{rowLabel}</td>
                        <td style={{ padding: '12px 16px', fontSize: 13, fontWeight: hasData ? 700 : 400, color: '#16a34a', textAlign: 'right', fontFamily: 'monospace' }}>
                          {hasData ? fmtAmt(m.income, currency, numberFormat) : '—'}
                        </td>
                        <td style={{ padding: '12px 16px', fontSize: 13, fontWeight: hasData ? 700 : 400, color: '#dc2626', textAlign: 'right', fontFamily: 'monospace' }}>
                          {hasData ? fmtAmt(m.expense, currency, numberFormat) : '—'}
                        </td>
                        <td style={{ padding: '12px 16px', fontSize: 13, fontWeight: 700, color: m.surplus >= 0 ? '#2563eb' : '#dc2626', textAlign: 'right', fontFamily: 'monospace' }}>
                          {hasData ? (m.surplus >= 0 ? '+' : '') + fmtAmt(m.surplus, currency, numberFormat) : '—'}
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
                    <td style={{ padding: '12px 16px', fontSize: 13, fontWeight: 800, color: 'var(--text-1)' }}>TOTAL {periodLabel}</td>
                    <td style={{ padding: '12px 16px', fontSize: 14, fontWeight: 800, color: '#16a34a', textAlign: 'right', fontFamily: 'monospace' }}>{fmtAmt(totalIncome, currency, numberFormat)}</td>
                    <td style={{ padding: '12px 16px', fontSize: 14, fontWeight: 800, color: '#dc2626', textAlign: 'right', fontFamily: 'monospace' }}>{fmtAmt(totalExpense, currency, numberFormat)}</td>
                    <td style={{ padding: '12px 16px', fontSize: 14, fontWeight: 800, color: totalSurplus >= 0 ? '#2563eb' : '#dc2626', textAlign: 'right', fontFamily: 'monospace' }}>
                      {(totalSurplus >= 0 ? '+' : '') + fmtAmt(totalSurplus, currency, numberFormat)}
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
            { title: 'Income by Category', cats: incomeCats, color: '#16a34a', bg: '#dcfce7', type: 'income',  total: incomeCats.reduce((s, c)  => s + c.total, 0) },
            { title: 'Expenses by Category', cats: expenseCats, color: '#dc2626', bg: '#fee2e2', type: 'expense', total: expenseCats.reduce((s, c) => s + c.total, 0) },
          ].map(({ title, cats, color, bg, type, total }) => (
            <div key={title} className="card" style={{ overflow: 'hidden' }}>
              <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--card-border)' }}>
                <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)', margin: 0 }}>{title}</p>
              </div>
              {loading ? (
                <div style={{ padding: '16px 18px' }}>
                  {[1,2,3].map(i => <div key={i} className="loading-skeleton" style={{ height: 32, borderRadius: 5, marginBottom: 8 }} />)}
                </div>
              ) : cats.length === 0 ? (
                <p style={{ padding: '32px 18px', textAlign: 'center', fontSize: 13, color: 'var(--text-3)', margin: 0 }}>No data for {periodLabel}</p>
              ) : (
                <div>
                  {cats.map(c => {
                    const pct = total > 0 ? (c.total / total) * 100 : 0
                    return (
                      <div key={c.name}
                        onClick={() => c.id && openDrillDown(c, type)}
                        style={{ padding: '10px 18px', borderBottom: '1px solid var(--card-border)', cursor: c.id ? 'pointer' : 'default', transition: 'background 0.1s' }}
                        onMouseEnter={e => { if (c.id) e.currentTarget.style.background = 'var(--sidebar-item-active-bg)' }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                          <span style={{ fontSize: 13, color: 'var(--text-1)', fontWeight: 500 }}>
                            {c.name}
                            {c.id && <span style={{ fontSize: 10, color: 'var(--text-3)', marginLeft: 6 }}>↗ view</span>}
                          </span>
                          <span style={{ fontSize: 13, fontWeight: 700, color, fontFamily: 'monospace' }}>{fmtAmt(c.total, currency, numberFormat)}</span>
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
                    <span style={{ fontSize: 14, fontWeight: 800, color, fontFamily: 'monospace' }}>{fmtAmt(total, currency, numberFormat)}</span>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Category drill-down modal */}
      {drillCat && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: 'var(--card-bg)', borderRadius: 16, width: '100%', maxWidth: 680, maxHeight: '85vh', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 64px rgba(0,0,0,0.28)', overflow: 'hidden' }}>
            {/* Modal header */}
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--card-border)', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: 15, fontWeight: 800, color: 'var(--text-1)', margin: '0 0 2px' }}>{drillCat.name}</p>
                <p style={{ fontSize: 11, color: 'var(--text-3)', margin: 0 }}>
                  {drillCat.type === 'income' ? 'Income' : 'Expense'} transactions · {periodLabel}
                </p>
              </div>
              <button onClick={() => setDrillCat(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', display: 'flex', padding: 4 }}>
                <X size={18} />
              </button>
            </div>
            {/* Modal body */}
            <div style={{ overflow: 'auto', flex: 1 }}>
              {drillLoad ? (
                <div style={{ padding: 20 }}>
                  {[1,2,3].map(i => <div key={i} className="loading-skeleton" style={{ height: 40, borderRadius: 6, marginBottom: 8 }} />)}
                </div>
              ) : drillTxns.length === 0 ? (
                <p style={{ padding: '32px 20px', textAlign: 'center', fontSize: 13, color: 'var(--text-3)', margin: 0 }}>No transactions found</p>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: 'var(--table-header-bg)' }}>
                      {['Date', 'Description', 'Account', 'Amount'].map(h => (
                        <th key={h} style={{ padding: '9px 16px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-3)', textAlign: h === 'Amount' ? 'right' : 'left' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {drillTxns.map((t, i) => {
                      const lbl = txnLabel(t)
                      return (
                        <tr key={t.id} style={{ background: i % 2 ? 'rgba(0,0,0,0.012)' : 'transparent', borderBottom: '1px solid var(--card-border)' }}>
                          <td style={{ padding: '10px 16px', fontSize: 12, color: 'var(--text-3)', whiteSpace: 'nowrap' }}>{fmtDate(t.txn_date, dateFormat)}</td>
                          <td style={{ padding: '10px 16px', fontSize: 13, color: 'var(--text-1)' }}>
                            {t.description || '—'}
                            {t.reference_no && <span style={{ fontSize: 10, color: 'var(--text-3)', marginLeft: 6 }}>#{t.reference_no}</span>}
                          </td>
                          <td style={{ padding: '10px 16px', fontSize: 12, color: 'var(--text-2)' }}>{t.account?.name || '—'}</td>
                          <td style={{ padding: '10px 16px', fontSize: 14, fontWeight: 700, color: lbl.color, textAlign: 'right', fontFamily: 'monospace' }}>
                            {lbl.sign}{fmtAmt(t.amount, currency, numberFormat)}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                  <tfoot>
                    <tr style={{ background: 'var(--sidebar-item-active-bg)', borderTop: '2px solid var(--card-border)' }}>
                      <td colSpan={3} style={{ padding: '10px 16px', fontSize: 13, fontWeight: 800, color: 'var(--text-1)' }}>TOTAL</td>
                      <td style={{ padding: '10px 16px', fontSize: 14, fontWeight: 800, fontFamily: 'monospace', textAlign: 'right', color: drillCat.type === 'income' ? '#16a34a' : '#dc2626' }}>
                        {fmtAmt(drillTxns.reduce((s, t) => s + Number(t.amount), 0), currency, numberFormat)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
