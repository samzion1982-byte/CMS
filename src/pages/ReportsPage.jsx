import { useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useToast } from '../lib/toast'
import { BarChart3, Loader2, Search } from 'lucide-react'

// ── helpers ─────────────────────────────────────────────────────

function getFY(dateStr) {
  const d = dateStr ? new Date(dateStr + 'T00:00:00') : new Date()
  const m = d.getMonth() + 1
  const y = d.getFullYear()
  return m >= 4
    ? `${y}-${String(y + 1).slice(2)}`
    : `${y - 1}-${String(y).slice(2)}`
}

function fyOptions() {
  const baseYear = new Date().getFullYear()
  const options = []
  for (let d = -2; d <= 1; d++) {
    const y = baseYear + d
    const m = new Date().getMonth() + 1
    const fy = m >= 4 ? `${y}-${String(y + 1).slice(2)}` : `${y - 1}-${String(y).slice(2)}`
    if (!options.includes(fy)) options.push(fy)
  }
  return [...new Set(options)].sort().reverse()
}

function fmtAmt(n) {
  if (!n && n !== 0) return '—'
  return '₹' + Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

const PAYMENT_MODES = ['Cash', 'Cheque', 'DD', 'Net Banking', 'UPI']

// ── main component ──────────────────────────────────────────────

export default function ReportsPage() {
  const toast = useToast()

  const FYS = fyOptions()
  const today = new Date()
  // Default: current FY start to today
  const currentFY = getFY()
  const [fyYear] = currentFY.split('-')
  const fyStart = `${fyYear}-04-01`
  const fyEnd   = today.toISOString().slice(0, 10)

  const [filterFY,    setFilterFY]    = useState(currentFY)
  const [dateFrom,    setDateFrom]    = useState(fyStart)
  const [dateTo,      setDateTo]      = useState(fyEnd)
  const [loading,     setLoading]     = useState(false)
  const [generated,   setGenerated]   = useState(false)

  // Report data
  const [breakup,   setBreakup]   = useState([]) // { cat_name, mode, total }
  const [summary,   setSummary]   = useState([]) // { mode, total }
  const [grandTotal, setGrandTotal] = useState(0)
  const [categories, setCategories] = useState([]) // distinct cat names in report

  const generate = useCallback(async () => {
    if (!dateFrom || !dateTo) { toast('Select date range', 'error'); return }
    setLoading(true)
    try {
      // Step 1: get receipts in date range
      let rq = supabase
        .from('receipts')
        .select('id,payment_mode')
        .gte('receipt_date', dateFrom)
        .lte('receipt_date', dateTo)
      if (filterFY) rq = rq.eq('financial_year', filterFY)
      const { data: recs, error: recErr } = await rq
      if (recErr) throw recErr
      if (!recs?.length) {
        setBreakup([]); setSummary([]); setGrandTotal(0); setCategories([]); setGenerated(true)
        setLoading(false); return
      }

      // Step 2: get receipt_items for those receipts
      const recMap = {}
      recs.forEach(r => { recMap[r.id] = r.payment_mode })
      const ids = recs.map(r => r.id)
      const { data: riData, error: riErr } = await supabase
        .from('receipt_items')
        .select('receipt_id,category_id,total,payment_categories(name)')
        .in('receipt_id', ids)
      if (riErr) throw riErr

      // Build breakup: category × mode
      const breakupMap = {}
      const catSet     = new Set()
      let grand        = 0

      ;(riData || []).forEach(row => {
        const cat  = row.payment_categories?.name || 'Unknown'
        const mode = recMap[row.receipt_id]        || 'Unknown'
        const key  = `${cat}|${mode}`
        breakupMap[key] = (breakupMap[key] || 0) + (row.total || 0)
        catSet.add(cat)
        grand += row.total || 0
      })

      const cats = [...catSet].sort()
      setCategories(cats)

      // Build breakup rows: one per cat, one col per mode
      const breakupRows = cats.map(cat => {
        const row = { cat_name: cat, row_total: 0 }
        PAYMENT_MODES.forEach(mode => {
          const val = breakupMap[`${cat}|${mode}`] || 0
          row[mode] = val
          row.row_total += val
        })
        return row
      })
      setBreakup(breakupRows)

      // Summary: totals by mode
      const modeMap = {}
      ;(riData || []).forEach(row => {
        const mode = recMap[row.receipt_id] || 'Unknown'
        modeMap[mode] = (modeMap[mode] || 0) + (row.total || 0)
      })
      const summaryRows = PAYMENT_MODES.filter(m => modeMap[m] > 0).map(m => ({ mode: m, total: modeMap[m] }))
      setSummary(summaryRows)
      setGrandTotal(grand)
      setGenerated(true)
    } catch (e) {
      toast(e.message, 'error')
    }
    setLoading(false)
  }, [dateFrom, dateTo, filterFY, toast])

  // Update date range when FY changes
  const handleFYChange = (fy) => {
    setFilterFY(fy)
    setGenerated(false)
    const [yr] = fy.split('-')
    setDateFrom(`${yr}-04-01`)
    setDateTo(new Date().toISOString().slice(0, 10))
  }

  const colTotal = (mode) => breakup.reduce((s, r) => s + (r[mode] || 0), 0)

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Reports</h1>
          <p className="page-subtitle">Receipt breakup and summary by date range</p>
        </div>
      </div>

      {/* Filters */}
      <div className="card" style={{ padding: '16px 20px', marginBottom: 20, display: 'flex', gap: 16, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div>
          <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', display: 'block', marginBottom: 4 }}>Financial Year</label>
          <select value={filterFY} onChange={e => handleFYChange(e.target.value)} className="field-input" style={{ width: 120, appearance: 'none' }}>
            <option value="">All FY</option>
            {FYS.map(fy => <option key={fy} value={fy}>{fy}</option>)}
          </select>
        </div>
        <div>
          <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', display: 'block', marginBottom: 4 }}>From</label>
          <input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setGenerated(false) }} className="field-input"/>
        </div>
        <div>
          <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', display: 'block', marginBottom: 4 }}>To</label>
          <input type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setGenerated(false) }} className="field-input"/>
        </div>
        <button className="btn-primary" onClick={generate} disabled={loading}>
          {loading ? <Loader2 size={14} className="animate-spin"/> : <Search size={14}/>}
          {loading ? 'Generating…' : 'Generate Report'}
        </button>
      </div>

      {/* Empty prompt */}
      {!generated && !loading && (
        <div className="card" style={{ padding: 48, textAlign: 'center' }}>
          <BarChart3 size={40} style={{ color: 'var(--text-3)', margin: '0 auto 12px', display: 'block' }}/>
          <p style={{ color: 'var(--text-2)', fontWeight: 500, margin: 0 }}>Select FY and date range, then click Generate</p>
          <p style={{ color: 'var(--text-3)', fontSize: 13, marginTop: 4 }}>Report shows Receipt Breakup and Summary by payment mode</p>
        </div>
      )}

      {loading && (
        <div className="card" style={{ padding: 48, textAlign: 'center' }}>
          <Loader2 size={32} className="animate-spin" style={{ color: 'var(--text-3)', margin: '0 auto' }}/>
        </div>
      )}

      {generated && !loading && (
        <>
          {/* ── RECEIPT BREAKUP ── */}
          <div className="card" style={{ overflow: 'hidden', marginBottom: 20 }}>
            <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--table-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-1)', margin: 0 }}>Receipt Breakup</h3>
              <span style={{ fontSize: 12, color: 'var(--text-3)' }}>
                FY {filterFY || 'All'} · {dateFrom} to {dateTo}
              </span>
            </div>

            {breakup.length === 0 ? (
              <p style={{ padding: 32, textAlign: 'center', color: 'var(--text-3)', fontSize: 13, margin: 0 }}>No receipts in this date range</p>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 600 }}>
                  <thead>
                    <tr style={{ background: 'var(--table-header-bg)' }}>
                      <th style={{ padding: '9px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', whiteSpace: 'nowrap' }}>Category</th>
                      {PAYMENT_MODES.map(m => (
                        <th key={m} style={{ padding: '9px 10px', textAlign: 'right', fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', whiteSpace: 'nowrap' }}>{m}</th>
                      ))}
                      <th style={{ padding: '9px 14px', textAlign: 'right', fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', whiteSpace: 'nowrap' }}>Row Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {breakup.map((row, i) => (
                      <tr key={row.cat_name} style={{ borderTop: '1px solid var(--table-border)', background: i % 2 === 0 ? 'transparent' : 'rgba(0,0,0,0.012)' }}>
                        <td style={{ padding: '9px 14px', fontSize: 13, color: 'var(--text-1)', fontWeight: 500 }}>{row.cat_name}</td>
                        {PAYMENT_MODES.map(m => (
                          <td key={m} style={{ padding: '9px 10px', textAlign: 'right', fontSize: 13, fontFamily: 'monospace', color: row[m] > 0 ? 'var(--text-1)' : 'var(--text-3)' }}>
                            {row[m] > 0 ? Number(row[m]).toLocaleString('en-IN', { minimumFractionDigits: 2 }) : '—'}
                          </td>
                        ))}
                        <td style={{ padding: '9px 14px', textAlign: 'right', fontSize: 13, fontFamily: 'monospace', fontWeight: 700, color: 'var(--text-1)' }}>
                          {Number(row.row_total).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ borderTop: '2px solid var(--table-border)', background: 'var(--table-header-bg)' }}>
                      <td style={{ padding: '10px 14px', fontSize: 13, fontWeight: 700, color: 'var(--text-1)' }}>Column Total</td>
                      {PAYMENT_MODES.map(m => (
                        <td key={m} style={{ padding: '10px 10px', textAlign: 'right', fontFamily: 'monospace', fontSize: 13, fontWeight: 700, color: colTotal(m) > 0 ? 'var(--text-1)' : 'var(--text-3)' }}>
                          {colTotal(m) > 0 ? Number(colTotal(m)).toLocaleString('en-IN', { minimumFractionDigits: 2 }) : '—'}
                        </td>
                      ))}
                      <td style={{ padding: '10px 14px', textAlign: 'right', fontFamily: 'monospace', fontSize: 14, fontWeight: 800, color: 'var(--accent)' }}>
                        {Number(grandTotal).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>

          {/* ── SUMMARY BY MODE ── */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: 16 }}>
            <div className="card" style={{ overflow: 'hidden' }}>
              <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--table-border)' }}>
                <h3 style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-1)', margin: 0 }}>Summary by Payment Mode</h3>
              </div>
              {summary.length === 0 ? (
                <p style={{ padding: 24, textAlign: 'center', color: 'var(--text-3)', fontSize: 13, margin: 0 }}>No data</p>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: 'var(--table-header-bg)' }}>
                      <th style={{ padding: '9px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Payment Mode</th>
                      <th style={{ padding: '9px 16px', textAlign: 'right', fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Total Amount</th>
                      <th style={{ padding: '9px 16px', textAlign: 'right', fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>% Share</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.map((row, i) => (
                      <tr key={row.mode} style={{ borderTop: '1px solid var(--table-border)', background: i % 2 === 0 ? 'transparent' : 'rgba(0,0,0,0.012)' }}>
                        <td style={{ padding: '10px 16px' }}>
                          <span style={{ fontSize: 12, fontWeight: 700, padding: '2px 8px', borderRadius: 4, background: row.mode === 'Cash' ? '#f0fdf4' : '#eff6ff', color: row.mode === 'Cash' ? '#15803d' : '#1d4ed8' }}>
                            {row.mode}
                          </span>
                        </td>
                        <td style={{ padding: '10px 16px', textAlign: 'right', fontSize: 13, fontFamily: 'monospace', fontWeight: 600, color: 'var(--text-1)' }}>
                          {Number(row.total).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </td>
                        <td style={{ padding: '10px 16px', textAlign: 'right', fontSize: 13, color: 'var(--text-2)', fontWeight: 600 }}>
                          {grandTotal > 0 ? ((row.total / grandTotal) * 100).toFixed(1) + '%' : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ borderTop: '2px solid var(--table-border)', background: 'var(--table-header-bg)' }}>
                      <td style={{ padding: '10px 16px', fontSize: 13, fontWeight: 700, color: 'var(--text-1)' }}>Grand Total</td>
                      <td style={{ padding: '10px 16px', textAlign: 'right', fontSize: 15, fontFamily: 'monospace', fontWeight: 800, color: 'var(--accent)' }}>
                        {Number(grandTotal).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                      <td style={{ padding: '10px 16px', textAlign: 'right', fontSize: 13, fontWeight: 700, color: 'var(--text-2)' }}>100%</td>
                    </tr>
                  </tfoot>
                </table>
              )}
            </div>

            {/* Quick stats */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="card" style={{ padding: 20 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>Grand Total</div>
                <div style={{ fontSize: 28, fontWeight: 900, fontFamily: 'monospace', color: 'var(--accent)' }}>
                  ₹{Number(grandTotal).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 4 }}>
                  {filterFY ? `FY ${filterFY}` : 'All FY'} · {dateFrom} to {dateTo}
                </div>
              </div>
              <div className="card" style={{ padding: 20 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>By Mode</div>
                {summary.map(row => (
                  <div key={row.mode} style={{ marginBottom: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span style={{ fontSize: 12, color: 'var(--text-2)' }}>{row.mode}</span>
                      <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-1)', fontFamily: 'monospace' }}>
                        {grandTotal > 0 ? ((row.total / grandTotal) * 100).toFixed(1) : 0}%
                      </span>
                    </div>
                    <div style={{ height: 6, background: 'var(--card-border)', borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{
                        height: '100%',
                        width: grandTotal > 0 ? `${(row.total / grandTotal) * 100}%` : '0%',
                        background: row.mode === 'Cash' ? '#16a34a' : row.mode === 'UPI' ? '#7c3aed' : '#2563eb',
                        borderRadius: 3,
                        transition: 'width 0.4s ease',
                      }}/>
                    </div>
                  </div>
                ))}
                {summary.length === 0 && <p style={{ fontSize: 12, color: 'var(--text-3)', margin: 0 }}>No data</p>}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
