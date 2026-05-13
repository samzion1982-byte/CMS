/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   BudgetVsActualPage.jsx â€” Budget entry & variance report
   Uses budgets table (church_id, financial_year, account_id,
   budgeted_amount)
   â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useToast } from '../lib/toast'
import {
  getFY, fyOptions, fmtAmt,
  getChartOfAccounts, getPostableAccountsWithPath,
  getTrialBalance, displayAccountType, TYPE_COLOR,
} from '../lib/accountingLib'
import { supabase, getChurch } from '../lib/supabase'
import {
  ArrowLeft, Loader2, Save, BarChart2, ChevronDown,
  TrendingUp, TrendingDown, Minus,
} from 'lucide-react'

const LABEL_TH = { padding: '8px 14px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-3)', textAlign: 'left' }
const BUDGET_TYPES = ['Income', 'Expense']

export default function BudgetVsActualPage() {
  const navigate = useNavigate()
  const toast    = useToast()

  const [tab,      setTab]      = useState('setup')   // 'setup' | 'report'
  const [fy,       setFy]       = useState(getFY())
  const [fyOpen,   setFyOpen]   = useState(false)
  const [accounts, setAccounts] = useState([])         // postable accounts
  const [budgets,  setBudgets]  = useState({})         // { [accountId]: amount string }
  const [actuals,  setActuals]  = useState({})         // { [accountId]: net amount }
  const [churchId, setChurchId] = useState(null)
  const [loading,  setLoading]  = useState(true)
  const [saving,   setSaving]   = useState(false)
  const FYS = fyOptions()

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [church, all] = await Promise.all([getChurch(), getChartOfAccounts(false)])
      setChurchId(church?.id)
      const postable = getPostableAccountsWithPath(all).filter(a => BUDGET_TYPES.includes(a.account_type))
      setAccounts(postable)

      // Load existing budgets
      const { data: budgetRows } = await supabase
        .from('budgets')
        .select('account_id, budgeted_amount')
        .eq('church_id', church?.id)
        .eq('financial_year', fy)
      const bMap = {}
      for (const b of budgetRows || []) bMap[b.account_id] = String(b.budgeted_amount || '')
      setBudgets(bMap)

      // Load actuals from trial balance
      const tb = await getTrialBalance(fy)
      const aMap = {}
      for (const a of tb) {
        if (a.account_type === 'Income')  aMap[a.id] = a.total_credit - a.total_debit
        if (a.account_type === 'Expense') aMap[a.id] = a.total_debit  - a.total_credit
      }
      setActuals(aMap)
    } catch (e) { toast(e.message, 'error') }
    setLoading(false)
  }, [fy, toast])

  useEffect(() => { load() }, [load])

  function setBudget(accountId, value) {
    setBudgets(prev => ({ ...prev, [accountId]: value }))
  }

  async function handleSave() {
    if (!churchId) { toast('Church not found.', 'error'); return }
    setSaving(true)
    try {
      const rows = accounts
        .filter(a => parseFloat(budgets[a.id]) > 0)
        .map(a => ({
          church_id:       churchId,
          financial_year:  fy,
          account_id:      a.id,
          budgeted_amount: parseFloat(budgets[a.id]) || 0,
        }))

      // Upsert using unique constraint (church_id, financial_year, account_id)
      const { error } = await supabase
        .from('budgets')
        .upsert(rows, { onConflict: 'church_id,financial_year,account_id' })
      if (error) throw error

      // Remove budgets where amount was cleared
      const clearedIds = accounts
        .filter(a => budgets[a.id] !== undefined && !(parseFloat(budgets[a.id]) > 0))
        .map(a => a.id)
      if (clearedIds.length > 0) {
        await supabase.from('budgets')
          .delete()
          .eq('church_id', churchId)
          .eq('financial_year', fy)
          .in('account_id', clearedIds)
      }

      toast('Budgets saved!', 'success')
    } catch (e) { toast(e.message, 'error') }
    setSaving(false)
  }

  const grouped = useMemo(() => {
    const g = {}
    accounts.forEach(a => {
      if (!g[a.account_type]) g[a.account_type] = []
      g[a.account_type].push(a)
    })
    return g
  }, [accounts])

  // Report totals
  const reportTotals = useMemo(() => {
    const r = { Income: { budget: 0, actual: 0 }, Expense: { budget: 0, actual: 0 } }
    accounts.forEach(a => {
      const b = parseFloat(budgets[a.id]) || 0
      const ac = actuals[a.id] || 0
      r[a.account_type].budget += b
      r[a.account_type].actual += ac
    })
    return r
  }, [accounts, budgets, actuals])

  return (
    <div className="page-container">
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={() => navigate(-1)} style={{ padding: '6px 8px', background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: 7, cursor: 'pointer', display: 'flex', alignItems: 'center', color: 'var(--text-2)' }}>
            <ArrowLeft size={15} />
          </button>
          <div>
            <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
              <BarChart2 size={20} style={{ color: 'var(--accent)' }} /> Budget vs Actual
            </h1>
            <p className="page-subtitle">Set annual budgets and compare against actual income &amp; expenses</p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {/* FY picker */}
          <div style={{ position: 'relative' }}>
            <button onClick={() => setFyOpen(o => !o)} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', background: 'var(--card-bg)', border: '1.5px solid var(--card-border)', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', color: 'var(--text-1)' }}>
              FY {fy} <ChevronDown size={13} />
            </button>
            {fyOpen && (
              <div style={{ position: 'absolute', top: '110%', right: 0, background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: 9, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', zIndex: 50, minWidth: 140 }}>
                {FYS.map(f => (
                  <button key={f} onClick={() => { setFy(f); setFyOpen(false) }} style={{ display: 'block', width: '100%', padding: '9px 16px', fontSize: 13, textAlign: 'left', background: f === fy ? 'var(--sidebar-item-active-bg)' : 'transparent', color: f === fy ? 'var(--accent)' : 'var(--text-1)', fontWeight: f === fy ? 700 : 400, border: 'none', cursor: 'pointer' }}>
                    FY {f}
                  </button>
                ))}
              </div>
            )}
          </div>
          {tab === 'setup' && (
            <button onClick={handleSave} disabled={saving || loading}
              style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 18px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              Save Budgets
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: '2px solid var(--card-border)', paddingBottom: 0 }}>
        {[{ key: 'setup', label: 'Budget Setup' }, { key: 'report', label: 'Budget vs Actual Report' }].map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            style={{ padding: '9px 20px', fontSize: 13, fontWeight: tab === t.key ? 700 : 500, color: tab === t.key ? 'var(--accent)' : 'var(--text-3)', background: 'none', border: 'none', cursor: 'pointer', borderBottom: `2px solid ${tab === t.key ? 'var(--accent)' : 'transparent'}`, marginBottom: -2 }}>
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--text-3)' }}>
          <Loader2 size={24} className="animate-spin" style={{ display: 'block', margin: '0 auto 8px' }} />Loadingâ€¦
        </div>
      ) : tab === 'setup' ? (
        /* â”€â”€â”€ Budget Setup Tab â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
        <div className="card" style={{ overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead style={{ background: 'var(--table-header-bg)' }}>
              <tr>
                <th style={{ ...LABEL_TH }}>Account Name</th>
                <th style={{ ...LABEL_TH, width: 80 }}>Type</th>
                <th style={{ ...LABEL_TH, textAlign: 'right', width: 180 }}>Budget Amount (â‚¹)</th>
              </tr>
            </thead>
            <tbody>
              {BUDGET_TYPES.map(type => {
                const group = grouped[type] || []
                if (!group.length) return null
                const c = TYPE_COLOR[type] || { bg: '#f1f5f9', text: '#475569' }
                return [
                  <tr key={`${type}-header`} style={{ background: c.bg + '55' }}>
                    <td colSpan={3} style={{ padding: '7px 14px', fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.07em', color: c.text }}>
                      {displayAccountType(type)}
                    </td>
                  </tr>,
                  ...group.map((a, i) => (
                    <tr key={a.id} style={{ background: i % 2 ? 'rgba(0,0,0,0.012)' : 'transparent' }}>
                      <td style={{ padding: '7px 14px', fontSize: 13, color: 'var(--text-1)' }}>{a.name}</td>
                      <td style={{ padding: '7px 14px' }}>
                        <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 99, background: c.bg, color: c.text }}>{displayAccountType(type)}</span>
                      </td>
                      <td style={{ padding: '5px 10px' }}>
                        <input type="number" min="0" step="0.01" placeholder="0.00"
                          value={budgets[a.id] || ''}
                          onChange={e => setBudget(a.id, e.target.value)}
                          style={{ width: '100%', height: 32, padding: '0 8px', border: '1.5px solid var(--card-border)', borderRadius: 7, fontSize: 12, fontFamily: 'monospace', textAlign: 'right', background: parseFloat(budgets[a.id]) > 0 ? '#eff6ff' : 'var(--input-bg)', color: 'var(--accent)', outline: 'none', boxSizing: 'border-box' }} />
                      </td>
                    </tr>
                  )),
                ]
              })}
            </tbody>
          </table>
        </div>
      ) : (
        /* â”€â”€â”€ Report Tab â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
        <>
          {/* Summary cards */}
          <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
            {BUDGET_TYPES.map(type => {
              const t = reportTotals[type]
              const variance = t.budget - t.actual
              const pct = t.budget > 0 ? ((t.actual / t.budget) * 100).toFixed(0) : null
              const over = type === 'Expense' ? t.actual > t.budget : t.actual < t.budget
              return (
                <div key={type} className="card" style={{ padding: '14px 18px', flex: 1, minWidth: 200 }}>
                  <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-3)', margin: '0 0 10px' }}>{displayAccountType(type)}</p>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                    <div>
                      <p style={{ fontSize: 10, color: 'var(--text-3)', margin: '0 0 3px' }}>Budget</p>
                      <p style={{ fontSize: 15, fontWeight: 800, fontFamily: 'monospace', color: 'var(--text-1)', margin: 0 }}>{fmtAmt(t.budget)}</p>
                    </div>
                    <div>
                      <p style={{ fontSize: 10, color: 'var(--text-3)', margin: '0 0 3px' }}>Actual</p>
                      <p style={{ fontSize: 15, fontWeight: 800, fontFamily: 'monospace', color: type === 'Income' ? '#16a34a' : '#dc2626', margin: 0 }}>{fmtAmt(t.actual)}</p>
                    </div>
                    <div>
                      <p style={{ fontSize: 10, color: 'var(--text-3)', margin: '0 0 3px' }}>{type === 'Expense' ? 'Over/Under' : 'Achieved'}</p>
                      <p style={{ fontSize: 15, fontWeight: 800, fontFamily: 'monospace', color: over ? '#dc2626' : '#16a34a', margin: 0 }}>
                        {pct !== null ? `${pct}%` : 'â€”'}
                      </p>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          <div className="card" style={{ overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead style={{ background: 'var(--table-header-bg)' }}>
                <tr>
                  <th style={{ ...LABEL_TH }}>Account</th>
                  <th style={{ ...LABEL_TH, width: 80 }}>Type</th>
                  <th style={{ ...LABEL_TH, textAlign: 'right', width: 150 }}>Budget (â‚¹)</th>
                  <th style={{ ...LABEL_TH, textAlign: 'right', width: 150 }}>Actual (â‚¹)</th>
                  <th style={{ ...LABEL_TH, textAlign: 'right', width: 150 }}>Variance (â‚¹)</th>
                  <th style={{ ...LABEL_TH, textAlign: 'right', width: 90 }}>% Used</th>
                </tr>
              </thead>
              <tbody>
                {BUDGET_TYPES.map(type => {
                  const group = grouped[type] || []
                  if (!group.length) return null
                  const c = TYPE_COLOR[type] || { bg: '#f1f5f9', text: '#475569' }
                  return [
                    <tr key={`${type}-header`} style={{ background: c.bg + '55' }}>
                      <td colSpan={6} style={{ padding: '7px 14px', fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.07em', color: c.text }}>
                        {displayAccountType(type)}
                      </td>
                    </tr>,
                    ...group.map((a, i) => {
                      const budget = parseFloat(budgets[a.id]) || 0
                      const actual = actuals[a.id] || 0
                      const variance = type === 'Income' ? actual - budget : budget - actual
                      const pct = budget > 0 ? ((actual / budget) * 100).toFixed(1) : null
                      const isOver = type === 'Expense' ? actual > budget : actual < budget

                      return (
                        <tr key={a.id} style={{ background: i % 2 ? 'rgba(0,0,0,0.012)' : 'transparent' }}>
                          <td style={{ padding: '7px 14px', fontSize: 13, color: 'var(--text-1)' }}>{a.name}</td>
                          <td style={{ padding: '7px 14px' }}>
                            <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 99, background: c.bg, color: c.text }}>{displayAccountType(type)}</span>
                          </td>
                          <td style={{ padding: '7px 14px', fontSize: 12, fontFamily: 'monospace', textAlign: 'right', color: 'var(--text-2)' }}>
                            {budget > 0 ? fmtAmt(budget) : <span style={{ color: 'var(--text-3)' }}>â€”</span>}
                          </td>
                          <td style={{ padding: '7px 14px', fontSize: 12, fontFamily: 'monospace', textAlign: 'right', color: type === 'Income' ? '#16a34a' : '#dc2626', fontWeight: actual > 0 ? 600 : 400 }}>
                            {actual > 0 ? fmtAmt(actual) : <span style={{ color: 'var(--text-3)' }}>â€”</span>}
                          </td>
                          <td style={{ padding: '7px 14px', fontSize: 12, fontFamily: 'monospace', textAlign: 'right', color: budget > 0 ? (variance >= 0 ? '#16a34a' : '#dc2626') : 'var(--text-3)', fontWeight: budget > 0 ? 600 : 400 }}>
                            {budget > 0 ? (
                              <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 4 }}>
                                {variance > 0 ? <TrendingUp size={11} /> : variance < 0 ? <TrendingDown size={11} /> : <Minus size={11} />}
                                {fmtAmt(Math.abs(variance))}
                              </span>
                            ) : 'â€”'}
                          </td>
                          <td style={{ padding: '7px 14px', textAlign: 'right' }}>
                            {pct !== null ? (
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end' }}>
                                <div style={{ width: 50, height: 5, borderRadius: 99, background: 'var(--card-border)', overflow: 'hidden' }}>
                                  <div style={{ width: `${Math.min(100, parseFloat(pct))}%`, height: '100%', background: isOver ? '#dc2626' : '#16a34a', borderRadius: 99 }} />
                                </div>
                                <span style={{ fontSize: 11, fontWeight: 700, color: isOver ? '#dc2626' : '#16a34a', minWidth: 35, textAlign: 'right' }}>
                                  {pct}%
                                </span>
                              </div>
                            ) : <span style={{ fontSize: 11, color: 'var(--text-3)' }}>â€”</span>}
                          </td>
                        </tr>
                      )
                    }),
                    // Group subtotal
                    <tr key={`${type}-total`} style={{ background: c.bg + '44', borderTop: '1.5px solid var(--card-border)' }}>
                      <td colSpan={2} style={{ padding: '8px 14px', fontSize: 12, fontWeight: 700, color: c.text }}>Total {displayAccountType(type)}</td>
                      <td style={{ padding: '8px 14px', fontSize: 12, fontWeight: 800, fontFamily: 'monospace', textAlign: 'right', color: 'var(--text-1)' }}>{fmtAmt(reportTotals[type].budget)}</td>
                      <td style={{ padding: '8px 14px', fontSize: 12, fontWeight: 800, fontFamily: 'monospace', textAlign: 'right', color: type === 'Income' ? '#16a34a' : '#dc2626' }}>{fmtAmt(reportTotals[type].actual)}</td>
                      <td colSpan={2} />
                    </tr>,
                  ]
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
