/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   TrialBalancePage.jsx â€” Trial Balance Report
   â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */

import { useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useToast } from '../lib/toast'
import { getTrialBalance, getFY, fyOptions, fmtAmt, TYPE_COLOR, displayAccountType } from '../lib/accountingLib'
import { exportToExcel } from '../lib/exportExcel'
import { getChurch } from '../lib/supabase'
import { Scale, ArrowLeft, Loader2, FileSpreadsheet, Printer, ChevronDown } from 'lucide-react'
import DatePresets from '../components/accounting/DatePresets'

export default function TrialBalancePage() {
  const navigate = useNavigate()
  const toast    = useToast()

  const [fy,          setFy]          = useState(getFY())
  const [rows,        setRows]        = useState([])
  const [loading,     setLoading]     = useState(false)
  const [generated,   setGenerated]   = useState(false)
  const [showZero,    setShowZero]    = useState(false)
  const [fyOpen,      setFyOpen]      = useState(false)
  const [church,      setChurch]      = useState(null)
  const FYS = fyOptions()

  const generate = useCallback(async () => {
    setLoading(true)
    try {
      const [data, c] = await Promise.all([getTrialBalance(fy), getChurch()])
      setRows(data)
      setChurch(c)
      setGenerated(true)
    } catch (e) { toast(e.message, 'error') }
    setLoading(false)
  }, [fy, toast])

  const display = showZero ? rows : rows.filter(r => r.total_debit > 0 || r.total_credit > 0)

  const totalDebit  = display.reduce((s, r) => s + r.total_debit,  0)
  const totalCredit = display.reduce((s, r) => s + r.total_credit, 0)
  const balanced    = Math.abs(totalDebit - totalCredit) < 0.01

  function doExport() {
    const cols = [
      { header: 'Account Name', key: 'name',   align: 'left'  },
      { header: 'Type',         key: 'type',   align: 'left'  },
      { header: 'Level',        key: 'level',  align: 'center'},
      { header: 'Debit (â‚¹)',    key: 'debit',  align: 'right' },
      { header: 'Credit (â‚¹)',   key: 'credit', align: 'right' },
    ]
    const rows = display.map(r => ({
      name:   r.name,
      type:   r.account_type,
      level:  r.level ? `L${r.level}` : '',
      debit:  r.total_debit  > 0 ? r.total_debit  : '',
      credit: r.total_credit > 0 ? r.total_credit : '',
    }))
    rows.push({ name: 'TOTAL', type: '', level: '', debit: totalDebit, credit: totalCredit })
    exportToExcel(cols, rows, `Trial Balance FY ${fy}`, `TrialBalance_${fy}.xlsx`)
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={() => navigate(-1)} style={{ padding: '6px 8px', background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: 7, cursor: 'pointer', display: 'flex', alignItems: 'center', color: 'var(--text-2)' }}>
            <ArrowLeft size={15} />
          </button>
          <div>
            <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
              <Scale size={20} style={{ color: 'var(--accent)' }} /> Trial Balance
            </h1>
            <p className="page-subtitle">Verify total debits equal total credits</p>
          </div>
        </div>
        {generated && (
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={doExport} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 14px', background: '#16a34a', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
              <FileSpreadsheet size={15} /> Export
            </button>
            <button onClick={() => window.print()} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 14px', background: 'var(--card-bg)', border: '1.5px solid var(--card-border)', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', color: 'var(--text-1)' }}>
              <Printer size={15} /> Print
            </button>
          </div>
        )}
      </div>

      {/* Date presets */}
      <div style={{ marginBottom: 8 }}>
        <DatePresets onSelect={() => {}} />
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
        {generated && (
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer', color: 'var(--text-2)', marginLeft: 8 }}>
            <input type="checkbox" checked={showZero} onChange={e => setShowZero(e.target.checked)} style={{ width: 15, height: 15 }} />
            Show zero-balance accounts
          </label>
        )}
      </div>

      {!generated && !loading && (
        <div className="card" style={{ padding: '50px 20px', textAlign: 'center', color: 'var(--text-3)' }}>
          <Scale size={32} style={{ opacity: 0.25, display: 'block', margin: '0 auto 12px' }} />
          <p style={{ fontSize: 13 }}>Select a financial year and click Generate.</p>
        </div>
      )}

      {loading && (
        <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--text-3)' }}>
          <Loader2 size={24} className="animate-spin" style={{ display: 'block', margin: '0 auto 8px' }} /> Generating trial balanceâ€¦
        </div>
      )}

      {generated && !loading && (
        <>
          {/* Balance status */}
          <div style={{ display: 'flex', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
            <div className="card" style={{ flex: 1, padding: '16px 20px', background: balanced ? '#dcfce733' : '#fee2e233', borderLeft: `4px solid ${balanced ? '#16a34a' : '#b91c1c'}` }}>
              <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: balanced ? '#16a34a' : '#b91c1c', margin: '0 0 6px' }}>{balanced ? 'âœ“ Trial Balance Agrees' : 'âš  Trial Balance Disagrees'}</p>
              <p style={{ fontSize: 13, color: 'var(--text-2)', margin: 0 }}>
                {balanced ? `Total Debits = Total Credits = ${fmtAmt(totalDebit)}` : `Difference of ${fmtAmt(Math.abs(totalDebit - totalCredit))} â€” check for unposted entries`}
              </p>
            </div>
            <div className="card" style={{ padding: '16px 20px', textAlign: 'center', minWidth: 140 }}>
              <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: '#2563eb', margin: '0 0 4px' }}>Total Debit</p>
              <p style={{ fontSize: 18, fontWeight: 800, fontFamily: 'monospace', color: '#2563eb', margin: 0 }}>{fmtAmt(totalDebit)}</p>
            </div>
            <div className="card" style={{ padding: '16px 20px', textAlign: 'center', minWidth: 140 }}>
              <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: '#16a34a', margin: '0 0 4px' }}>Total Credit</p>
              <p style={{ fontSize: 18, fontWeight: 800, fontFamily: 'monospace', color: '#16a34a', margin: 0 }}>{fmtAmt(totalCredit)}</p>
            </div>
          </div>

          {/* Print header */}
          <div className="print-only" style={{ textAlign: 'center', marginBottom: 16 }}>
            <p style={{ fontSize: 16, fontWeight: 800, margin: '0 0 4px' }}>{church?.church_name}</p>
            <p style={{ fontSize: 12, margin: '0 0 4px' }}>{church?.address}, {church?.city}</p>
            <p style={{ fontSize: 14, fontWeight: 700, margin: '0 0 4px' }}>Trial Balance â€” FY {fy}</p>
          </div>

          <div className="card" style={{ overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead style={{ background: 'var(--table-header-bg)' }}>
                  <tr>
                    <th style={{ padding: '9px 14px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-3)', textAlign: 'left' }}>Account Name</th>
                    <th style={{ padding: '9px 14px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-3)', textAlign: 'left', width: 100 }}>Type</th>
                    <th style={{ padding: '9px 14px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#2563eb', textAlign: 'right', width: 150 }}>Debit (â‚¹)</th>
                    <th style={{ padding: '9px 14px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#16a34a', textAlign: 'right', width: 150 }}>Credit (â‚¹)</th>
                  </tr>
                </thead>
                <tbody>
                  {['Asset','Liability','Equity','Income','Expense'].map(type => {
                    const group = display.filter(r => r.account_type === type)
                    if (!group.length) return null
                    const c = TYPE_COLOR[type]
                    return group.map((r, i) => (
                      <tr key={r.id} style={{ background: i % 2 ? 'rgba(0,0,0,0.012)' : 'transparent' }}>
                        {i === 0 && (
                          <td rowSpan={group.length} style={{ padding: '0', width: 6, background: c.bg + '55' }}>
                            <div style={{ width: 4, height: '100%', background: c.text, borderRadius: 0 }} />
                          </td>
                        )}
                        <td style={{ padding: '9px 14px', fontSize: 13, color: 'var(--text-1)' }}>{r.name}</td>
                        <td style={{ padding: '9px 14px' }}>
                          <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 99, background: c.bg, color: c.text }}>{displayAccountType(type)}</span>
                        </td>
                        <td style={{ padding: '9px 14px', fontSize: 12, fontFamily: 'monospace', textAlign: 'right', color: r.total_debit > 0 ? '#2563eb' : 'var(--text-3)' }}>
                          {r.total_debit > 0 ? fmtAmt(r.total_debit) : 'â€”'}
                        </td>
                        <td style={{ padding: '9px 14px', fontSize: 12, fontFamily: 'monospace', textAlign: 'right', color: r.total_credit > 0 ? '#16a34a' : 'var(--text-3)' }}>
                          {r.total_credit > 0 ? fmtAmt(r.total_credit) : 'â€”'}
                        </td>
                      </tr>
                    ))
                  })}
                </tbody>
                <tfoot style={{ background: 'var(--table-header-bg)', borderTop: '2px solid var(--card-border)' }}>
                  <tr>
                    <td colSpan={2} style={{ padding: '11px 14px', fontSize: 13, fontWeight: 800, color: 'var(--text-1)' }}>GRAND TOTAL</td>
                    <td style={{ padding: '11px 14px', fontSize: 14, fontWeight: 800, fontFamily: 'monospace', textAlign: 'right', color: '#2563eb' }}>{fmtAmt(totalDebit)}</td>
                    <td style={{ padding: '11px 14px', fontSize: 14, fontWeight: 800, fontFamily: 'monospace', textAlign: 'right', color: '#16a34a' }}>{fmtAmt(totalCredit)}</td>
                  </tr>
                  {balanced && (
                    <tr>
                      <td colSpan={4} style={{ padding: '8px 14px', textAlign: 'center', fontSize: 12, fontWeight: 700, color: '#16a34a' }}>
                        âœ“ Trial Balance Agrees â€” Total Debits = Total Credits = {fmtAmt(totalDebit)}
                      </td>
                    </tr>
                  )}
                </tfoot>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
