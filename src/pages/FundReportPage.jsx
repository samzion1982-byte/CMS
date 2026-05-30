/* ═══════════════════════════════════════════════════════════════
   FundReportPage.jsx — Fund balance summary + transaction drill-down
   ═══════════════════════════════════════════════════════════════ */

import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useToast } from '../lib/toast'
import {
  fmtAmt, getFundReport,
} from '../lib/accountingLib'
import { supabase } from '../lib/supabase'
import { useEntity } from '../lib/EntityContext'
import { useEntityFY } from '../lib/useEntityFY'
import {
  ArrowLeft, Loader2, RefreshCw, ChevronDown, Wallet,
  TrendingUp, TrendingDown, Target, ChevronRight,
} from 'lucide-react'

const LABEL_TH = { padding: '8px 14px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-3)', textAlign: 'left' }

export default function FundReportPage() {
  const navigate = useNavigate()
  const toast    = useToast()
  const { currentEntityId } = useEntity()

  const { fy, setFy, fyOpen, setFyOpen, FYS } = useEntityFY()
  const [loading,      setLoading]      = useState(true)
  const [funds,        setFunds]        = useState([])
  const [selectedFund, setSelectedFund] = useState(null)
  const [txnLoading,   setTxnLoading]   = useState(false)
  const [transactions, setTransactions] = useState([])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const report = await getFundReport(fy, currentEntityId)
      setFunds(report)
    } catch (e) { toast(e.message, 'error') }
    setLoading(false)
  }, [fy, currentEntityId, toast])

  useEffect(() => { load() }, [load])

  async function loadTransactions(fund) {
    setSelectedFund(fund)
    setTxnLoading(true)
    try {
      const { data, error } = await supabase
        .from('journal_entries')
        .select(`
          id, entry_number, entry_date, voucher_type, narration, total_debit, total_credit, is_posted,
          journal_entry_lines(
            account_id, debit_amount, credit_amount,
            chart_of_accounts(name, account_type)
          )
        `)
        .eq('fund_id', fund.id)
        .eq('financial_year', fy)
        .eq('is_posted', true)
        .eq('is_deleted', false)
        .order('entry_date', { ascending: false })
      if (error) throw error
      setTransactions(data || [])
    } catch (e) { toast(e.message, 'error') }
    setTxnLoading(false)
  }

  const totalIncome   = funds.reduce((s, f) => s + f.income,   0)
  const totalExpenses = funds.reduce((s, f) => s + f.expenses, 0)
  const totalNet      = funds.reduce((s, f) => s + f.net,      0)

  return (
    <div className="page-container">
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={() => navigate('/accounting/funds')} style={{ padding: '6px 8px', background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: 7, cursor: 'pointer', display: 'flex', alignItems: 'center', color: 'var(--text-2)' }}>
            <ArrowLeft size={15} />
          </button>
          <div>
            <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
              <Target size={20} style={{ color: 'var(--accent)' }} /> Fund Report
            </h1>
            <p className="page-subtitle">Income and expenses by designated fund</p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div style={{ position: 'relative' }}>
            <button onClick={() => setFyOpen(o => !o)} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', background: 'var(--card-bg)', border: '1.5px solid var(--card-border)', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', color: 'var(--text-1)' }}>
              FY {fy} <ChevronDown size={13} />
            </button>
            {fyOpen && (
              <div style={{ position: 'absolute', top: '110%', right: 0, background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: 9, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', zIndex: 50, minWidth: 140 }}>
                {FYS.map(f => (
                  <button key={f} onClick={() => { setFy(f); setFyOpen(false); setSelectedFund(null) }} style={{ display: 'block', width: '100%', padding: '9px 16px', fontSize: 13, textAlign: 'left', background: f === fy ? 'var(--sidebar-item-active-bg)' : 'transparent', color: f === fy ? 'var(--accent)' : 'var(--text-1)', fontWeight: f === fy ? 700 : 400, border: 'none', cursor: 'pointer' }}>
                    FY {f}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button onClick={load} disabled={loading} title="Refresh"
            style={{ padding: '8px 10px', background: 'var(--card-bg)', border: '1.5px solid var(--card-border)', borderRadius: 8, cursor: 'pointer', display: 'flex', alignItems: 'center', color: 'var(--text-2)' }}>
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--text-3)' }}>
          <Loader2 size={24} className="animate-spin" style={{ display: 'block', margin: '0 auto 8px' }} />Loading fund report…
        </div>
      ) : (
        <>
          {/* Totals row */}
          <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
            <div className="card" style={{ padding: '12px 18px', flex: 1, minWidth: 130, textAlign: 'center' }}>
              <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: '#16a34a', margin: '0 0 3px' }}>Total Income</p>
              <p style={{ fontSize: 17, fontWeight: 800, fontFamily: 'monospace', color: '#16a34a', margin: 0 }}>{fmtAmt(totalIncome)}</p>
            </div>
            <div className="card" style={{ padding: '12px 18px', flex: 1, minWidth: 130, textAlign: 'center' }}>
              <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: '#dc2626', margin: '0 0 3px' }}>Total Expenses</p>
              <p style={{ fontSize: 17, fontWeight: 800, fontFamily: 'monospace', color: '#dc2626', margin: 0 }}>{fmtAmt(totalExpenses)}</p>
            </div>
            <div className="card" style={{ padding: '12px 18px', flex: 1, minWidth: 130, textAlign: 'center', borderLeft: `4px solid ${totalNet >= 0 ? '#16a34a' : '#dc2626'}`, background: totalNet >= 0 ? '#f0fdf4' : '#fff1f2' }}>
              <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: totalNet >= 0 ? '#16a34a' : '#dc2626', margin: '0 0 3px' }}>Net Balance (All Funds)</p>
              <p style={{ fontSize: 17, fontWeight: 800, fontFamily: 'monospace', color: totalNet >= 0 ? '#16a34a' : '#dc2626', margin: 0 }}>{fmtAmt(Math.abs(totalNet))}</p>
            </div>
          </div>

          {/* Fund cards grid */}
          {funds.length === 0 ? (
            <div className="card" style={{ padding: '50px 24px', textAlign: 'center', color: 'var(--text-3)' }}>
              <Wallet size={32} style={{ opacity: 0.3, marginBottom: 12 }} />
              <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-2)', margin: '0 0 8px' }}>No fund-tagged transactions for FY {fy}</p>
              <p style={{ fontSize: 13, margin: '0 0 16px' }}>Tag receipts and payments to a designated fund when creating vouchers.</p>
              <button onClick={() => navigate('/accounting/funds')} style={{ fontSize: 13, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>
                Manage Funds →
              </button>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 14, marginBottom: 24 }}>
              {funds.map(f => {
                const pct = f.target_amount > 0 ? Math.min(100, (f.net / f.target_amount) * 100) : null
                const isSelected = selectedFund?.id === f.id
                return (
                  <div key={f.id} className="card" onClick={() => isSelected ? setSelectedFund(null) : loadTransactions(f)}
                    style={{ padding: '18px 20px', borderLeft: `4px solid ${f.color}`, cursor: 'pointer', border: isSelected ? `2px solid ${f.color}` : `1px solid var(--card-border)`, background: isSelected ? `${f.color}08` : 'var(--card-bg)', transition: 'all 0.15s' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ width: 10, height: 10, borderRadius: '50%', background: f.color, flexShrink: 0 }} />
                        <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-1)', margin: 0 }}>{f.name}</p>
                      </div>
                      <ChevronRight size={14} color={f.color} style={{ transform: isSelected ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }} />
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: pct !== null ? 12 : 0 }}>
                      <div>
                        <p style={{ fontSize: 10, fontWeight: 700, color: '#16a34a', textTransform: 'uppercase', margin: '0 0 3px' }}>Income</p>
                        <p style={{ fontSize: 14, fontWeight: 800, fontFamily: 'monospace', color: '#16a34a', margin: 0 }}>{fmtAmt(f.income)}</p>
                      </div>
                      <div>
                        <p style={{ fontSize: 10, fontWeight: 700, color: '#dc2626', textTransform: 'uppercase', margin: '0 0 3px' }}>Expenses</p>
                        <p style={{ fontSize: 14, fontWeight: 800, fontFamily: 'monospace', color: '#dc2626', margin: 0 }}>{fmtAmt(f.expenses)}</p>
                      </div>
                      <div>
                        <p style={{ fontSize: 10, fontWeight: 700, color: f.net >= 0 ? '#16a34a' : '#dc2626', textTransform: 'uppercase', margin: '0 0 3px' }}>Net</p>
                        <p style={{ fontSize: 14, fontWeight: 800, fontFamily: 'monospace', color: f.net >= 0 ? '#16a34a' : '#dc2626', margin: 0 }}>
                          {f.net >= 0 ? '' : '-'}{fmtAmt(Math.abs(f.net))}
                        </p>
                      </div>
                    </div>

                    {pct !== null && (
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                          <span style={{ fontSize: 10, color: 'var(--text-3)' }}>Target: {fmtAmt(f.target_amount)}</span>
                          <span style={{ fontSize: 10, fontWeight: 700, color: f.color }}>{pct.toFixed(0)}%</span>
                        </div>
                        <div style={{ width: '100%', height: 5, borderRadius: 99, background: 'var(--card-border)' }}>
                          <div style={{ width: `${pct}%`, height: '100%', borderRadius: 99, background: f.color }} />
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {/* Transactions drill-down */}
          {selectedFund && (
            <div className="card" style={{ overflow: 'hidden' }}>
              <div style={{ padding: '12px 18px', borderBottom: '1px solid var(--card-border)', display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: selectedFund.color }} />
                <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)', margin: 0 }}>{selectedFund.name} — Transactions (FY {fy})</p>
                {txnLoading && <Loader2 size={14} className="animate-spin" style={{ marginLeft: 'auto' }} />}
              </div>
              {txnLoading ? (
                <div style={{ padding: 30, textAlign: 'center', color: 'var(--text-3)' }}>Loading…</div>
              ) : transactions.length === 0 ? (
                <div style={{ padding: '30px 24px', textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>
                  No posted transactions tagged to {selectedFund.name} for FY {fy}.
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead style={{ background: 'var(--table-header-bg)' }}>
                      <tr>
                        <th style={{ ...LABEL_TH }}>Date</th>
                        <th style={{ ...LABEL_TH }}>Entry #</th>
                        <th style={{ ...LABEL_TH }}>Type</th>
                        <th style={{ ...LABEL_TH }}>Narration</th>
                        <th style={{ ...LABEL_TH, textAlign: 'right', color: '#16a34a' }}>Income (₹)</th>
                        <th style={{ ...LABEL_TH, textAlign: 'right', color: '#dc2626' }}>Expenses (₹)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {transactions.map((e, i) => {
                        const incomeAmt   = (e.journal_entry_lines || []).filter(l => l.chart_of_accounts?.account_type === 'Income').reduce((s, l) => s + (Number(l.credit_amount) - Number(l.debit_amount)), 0)
                        const expenseAmt  = (e.journal_entry_lines || []).filter(l => l.chart_of_accounts?.account_type === 'Expense').reduce((s, l) => s + (Number(l.debit_amount) - Number(l.credit_amount)), 0)
                        const dateStr = e.entry_date ? new Date(e.entry_date + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'
                        const VOUCHER_COLOR = { Receipt: { bg: '#dcfce7', text: '#15803d' }, Payment: { bg: '#fee2e2', text: '#b91c1c' }, Journal: { bg: '#dbeafe', text: '#1d4ed8' }, Contra: { bg: '#f3e8ff', text: '#7c3aed' } }
                        const vc = VOUCHER_COLOR[e.voucher_type] || { bg: '#f1f5f9', text: '#475569' }
                        return (
                          <tr key={e.id} style={{ background: i % 2 ? 'rgba(0,0,0,0.012)' : 'transparent', cursor: 'pointer' }}
                            onClick={() => navigate(`/accounting/journal-entries/${e.id}`)}
                            onMouseEnter={ev => ev.currentTarget.style.background = 'var(--sidebar-item-hover)'}
                            onMouseLeave={ev => ev.currentTarget.style.background = i % 2 ? 'rgba(0,0,0,0.012)' : 'transparent'}>
                            <td style={{ padding: '8px 14px', fontSize: 12, color: 'var(--text-2)', whiteSpace: 'nowrap' }}>{dateStr}</td>
                            <td style={{ padding: '8px 14px', fontSize: 12, fontWeight: 600, color: 'var(--accent)', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>{e.entry_number}</td>
                            <td style={{ padding: '8px 14px' }}>
                              <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 99, background: vc.bg, color: vc.text }}>{e.voucher_type}</span>
                            </td>
                            <td style={{ padding: '8px 14px', fontSize: 12, color: 'var(--text-2)', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.narration || '—'}</td>
                            <td style={{ padding: '8px 14px', fontSize: 12, fontFamily: 'monospace', textAlign: 'right', color: '#16a34a', fontWeight: incomeAmt > 0 ? 700 : 400 }}>
                              {incomeAmt > 0 ? fmtAmt(incomeAmt) : '—'}
                            </td>
                            <td style={{ padding: '8px 14px', fontSize: 12, fontFamily: 'monospace', textAlign: 'right', color: '#dc2626', fontWeight: expenseAmt > 0 ? 700 : 400 }}>
                              {expenseAmt > 0 ? fmtAmt(expenseAmt) : '—'}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                    <tfoot style={{ background: 'var(--table-header-bg)', borderTop: '2px solid var(--card-border)' }}>
                      <tr>
                        <td colSpan={4} style={{ padding: '10px 14px', fontSize: 12, fontWeight: 800, color: 'var(--text-1)' }}>
                          TOTAL ({transactions.length} entries)
                        </td>
                        <td style={{ padding: '10px 14px', fontSize: 14, fontWeight: 800, fontFamily: 'monospace', textAlign: 'right', color: '#16a34a' }}>
                          {fmtAmt(selectedFund.income)}
                        </td>
                        <td style={{ padding: '10px 14px', fontSize: 14, fontWeight: 800, fontFamily: 'monospace', textAlign: 'right', color: '#dc2626' }}>
                          {fmtAmt(selectedFund.expenses)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
