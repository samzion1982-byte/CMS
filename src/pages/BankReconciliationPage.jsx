/* ═══════════════════════════════════════════════════════════════
   BankReconciliationPage.jsx — Mark journal lines as reconciled
   Uses is_reconciled, reconciled_at, reconciled_by columns on
   journal_entry_lines
   ═══════════════════════════════════════════════════════════════ */

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import { useToast } from '../lib/toast'
import { useEntity } from '../lib/EntityContext'
import { useEntityFY } from '../lib/useEntityFY'
import {
  fyDateRange, fmtAmt, fmtDate,
  getChartOfAccounts,
} from '../lib/accountingLib'
import { supabase } from '../lib/supabase'
import {
  ArrowLeft, Loader2, CheckSquare, Square, RefreshCw,
  CheckCircle, AlertCircle, Landmark, ChevronDown,
} from 'lucide-react'

const LABEL_TH = { padding: '8px 14px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-3)', textAlign: 'left' }

export default function BankReconciliationPage() {
  const navigate = useNavigate()
  const toast    = useToast()
  const { profile } = useAuth()
  const { currentEntityId } = useEntity()

  const { fy, setFy, fyOpen, setFyOpen, FYS } = useEntityFY()
  const [accounts,    setAccounts]    = useState([])
  const [accountId,   setAccountId]   = useState('')
  const [lines,       setLines]       = useState([])
  const [loading,     setLoading]     = useState(false)
  const [toggling,    setToggling]    = useState(null) // line id being toggled
  const [showAll,     setShowAll]     = useState(false) // false = unreconciled only
  const { from: fyFrom, to: fyTo } = fyDateRange(fy)

  // Load bank/cash asset accounts
  useEffect(() => {
    if (!currentEntityId) return
    getChartOfAccounts(true, currentEntityId).then(all => {
      const bankCash = all.filter(a =>
        a.account_type === 'Asset' && a.account_level >= 3 &&
        /bank|cash|hand|petty/i.test(a.name)
      )
      setAccounts(bankCash)
      if (bankCash.length > 0) setAccountId(bankCash[0].id)
    })
  }, [currentEntityId])

  const loadLines = useCallback(async () => {
    if (!accountId) return
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('journal_entry_lines')
        .select(`
          id, debit_amount, credit_amount, description,
          is_reconciled, reconciled_at, reconciled_by,
          journal_entries!inner(
            id, entry_number, entry_date, voucher_type, narration,
            is_posted, is_deleted, financial_year
          )
        `)
        .eq('account_id', accountId)
        .eq('journal_entries.is_posted', true)
        .eq('journal_entries.is_deleted', false)
        .eq('journal_entries.financial_year', fy)
        .order('journal_entries(entry_date)', { ascending: true })
      if (error) throw error
      setLines(data || [])
    } catch (e) { toast(e.message, 'error') }
    setLoading(false)
  }, [accountId, fy, toast])

  useEffect(() => { loadLines() }, [loadLines])

  async function toggleReconciled(line) {
    setToggling(line.id)
    const newVal = !line.is_reconciled
    try {
      const update = {
        is_reconciled:  newVal,
        reconciled_at:  newVal ? new Date().toISOString() : null,
        reconciled_by:  newVal ? (profile?.email || 'admin') : null,
      }
      const { error } = await supabase
        .from('journal_entry_lines')
        .update(update)
        .eq('id', line.id)
      if (error) throw error
      setLines(ls => ls.map(l => l.id === line.id ? { ...l, ...update } : l))
    } catch (e) { toast(e.message, 'error') }
    setToggling(null)
  }

  async function markAllReconciled() {
    const unreconciled = lines.filter(l => !l.is_reconciled)
    if (unreconciled.length === 0) return
    setLoading(true)
    try {
      const ids = unreconciled.map(l => l.id)
      const update = { is_reconciled: true, reconciled_at: new Date().toISOString(), reconciled_by: profile?.email || 'admin' }
      const { error } = await supabase.from('journal_entry_lines').update(update).in('id', ids)
      if (error) throw error
      setLines(ls => ls.map(l => unreconciled.some(u => u.id === l.id) ? { ...l, ...update } : l))
      toast(`${ids.length} line${ids.length > 1 ? 's' : ''} marked as reconciled.`, 'success')
    } catch (e) { toast(e.message, 'error') }
    setLoading(false)
  }

  const displayed = useMemo(() => showAll ? lines : lines.filter(l => !l.is_reconciled), [lines, showAll])

  const totalDebit  = lines.reduce((s, l) => s + (Number(l.debit_amount)  || 0), 0)
  const totalCredit = lines.reduce((s, l) => s + (Number(l.credit_amount) || 0), 0)
  const clearedDebit  = lines.filter(l => l.is_reconciled).reduce((s, l) => s + (Number(l.debit_amount)  || 0), 0)
  const clearedCredit = lines.filter(l => l.is_reconciled).reduce((s, l) => s + (Number(l.credit_amount) || 0), 0)
  const unclearedCount = lines.filter(l => !l.is_reconciled).length

  const selAccount = accounts.find(a => a.id === accountId)

  return (
    <div className="page-container">
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
            <button onClick={() => navigate('/accounting')} style={{ padding: '6px 8px', background: 'var(--accent)', border: 'none', borderRadius: 7, cursor: 'pointer', display: 'flex', alignItems: 'center', color: '#fff' }}>
              <ArrowLeft size={15} />
            </button>
            <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--accent)', whiteSpace: 'nowrap' }}>Accounts</span>
          </div>
          <div>
            <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
              <Landmark size={20} style={{ color: 'var(--accent)' }} /> Bank Reconciliation
            </h1>
            <p className="page-subtitle">Mark transactions as cleared against bank statements</p>
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
          <button onClick={loadLines} disabled={loading} title="Refresh"
            style={{ padding: '8px 10px', background: 'var(--card-bg)', border: '1.5px solid var(--card-border)', borderRadius: 8, cursor: 'pointer', display: 'flex', alignItems: 'center', color: 'var(--text-2)' }}>
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Controls */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 18, alignItems: 'center', flexWrap: 'wrap' }}>
        <div>
          <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 5 }}>Account</label>
          <select value={accountId} onChange={e => setAccountId(e.target.value)}
            style={{ height: 36, padding: '0 10px', border: '1.5px solid var(--card-border)', borderRadius: 7, fontSize: 13, background: 'var(--input-bg)', color: 'var(--text-1)', minWidth: 220 }}>
            {accounts.length === 0 && <option value="">No bank/cash accounts found</option>}
            {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'flex-end' }}>
          <button onClick={() => setShowAll(s => !s)}
            style={{ height: 36, padding: '0 14px', background: 'var(--card-bg)', border: '1.5px solid var(--card-border)', borderRadius: 7, cursor: 'pointer', fontSize: 12, fontWeight: 600, color: 'var(--text-2)' }}>
            {showAll ? 'Show Uncleared Only' : 'Show All'}
          </button>
          {unclearedCount > 0 && (
            <button onClick={markAllReconciled} disabled={loading}
              style={{ height: 36, padding: '0 14px', background: '#16a34a', color: '#fff', border: 'none', borderRadius: 7, cursor: 'pointer', fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
              <CheckSquare size={13} /> Mark All Cleared
            </button>
          )}
        </div>
      </div>

      {/* Summary cards */}
      {!loading && lines.length > 0 && (
        <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
          <div className="card" style={{ padding: '12px 18px', flex: 1, minWidth: 140 }}>
            <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-3)', margin: '0 0 3px' }}>Total Debits</p>
            <p style={{ fontSize: 17, fontWeight: 800, fontFamily: 'monospace', color: '#2563eb', margin: 0 }}>{fmtAmt(totalDebit)}</p>
          </div>
          <div className="card" style={{ padding: '12px 18px', flex: 1, minWidth: 140 }}>
            <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-3)', margin: '0 0 3px' }}>Total Credits</p>
            <p style={{ fontSize: 17, fontWeight: 800, fontFamily: 'monospace', color: '#16a34a', margin: 0 }}>{fmtAmt(totalCredit)}</p>
          </div>
          <div className="card" style={{ padding: '12px 18px', flex: 1, minWidth: 140, background: '#f0fdf4', borderLeft: '4px solid #16a34a' }}>
            <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: '#16a34a', margin: '0 0 3px' }}>Cleared Dr / Cr</p>
            <p style={{ fontSize: 14, fontWeight: 800, fontFamily: 'monospace', color: '#16a34a', margin: 0 }}>
              {fmtAmt(clearedDebit)} / {fmtAmt(clearedCredit)}
            </p>
          </div>
          <div className="card" style={{ padding: '12px 18px', flex: 1, minWidth: 140, background: unclearedCount > 0 ? '#fff7ed' : '#f0fdf4', borderLeft: `4px solid ${unclearedCount > 0 ? '#c2410c' : '#16a34a'}` }}>
            <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: unclearedCount > 0 ? '#c2410c' : '#16a34a', margin: '0 0 3px' }}>Uncleared Items</p>
            <p style={{ fontSize: 20, fontWeight: 800, fontFamily: 'monospace', color: unclearedCount > 0 ? '#c2410c' : '#16a34a', margin: 0 }}>{unclearedCount}</p>
          </div>
        </div>
      )}

      {loading ? (
        <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--text-3)' }}>
          <Loader2 size={24} className="animate-spin" style={{ display: 'block', margin: '0 auto 8px' }} />Loading transactions…
        </div>
      ) : displayed.length === 0 ? (
        <div className="card" style={{ padding: '40px 24px', textAlign: 'center', color: 'var(--text-3)' }}>
          <CheckCircle size={28} style={{ opacity: 0.3, marginBottom: 8 }} />
          <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-2)', margin: '0 0 4px' }}>
            {lines.length === 0 ? `No transactions for ${selAccount?.name || 'this account'} in FY ${fy}` : 'All transactions are reconciled!'}
          </p>
          {lines.length > 0 && !showAll && (
            <button onClick={() => setShowAll(true)} style={{ marginTop: 8, fontSize: 12, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer' }}>
              Show reconciled entries
            </button>
          )}
        </div>
      ) : (
        <div className="card" style={{ overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead style={{ background: 'var(--table-header-bg)' }}>
              <tr>
                <th style={{ ...LABEL_TH, width: 40 }}>Clear</th>
                <th style={{ ...LABEL_TH }}>Date</th>
                <th style={{ ...LABEL_TH }}>Entry #</th>
                <th style={{ ...LABEL_TH }}>Type</th>
                <th style={{ ...LABEL_TH }}>Narration</th>
                <th style={{ ...LABEL_TH, textAlign: 'right', color: '#2563eb' }}>Debit (₹)</th>
                <th style={{ ...LABEL_TH, textAlign: 'right', color: '#16a34a' }}>Credit (₹)</th>
                <th style={{ ...LABEL_TH }}>Reconciled By</th>
              </tr>
            </thead>
            <tbody>
              {displayed.map((l, i) => {
                const je = l.journal_entries
                const dateStr = je?.entry_date
                  ? new Date(je.entry_date + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
                  : '—'
                return (
                  <tr key={l.id} style={{ background: l.is_reconciled ? '#f0fdf430' : i % 2 ? 'rgba(0,0,0,0.012)' : 'transparent' }}>
                    <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                      <button onClick={() => toggleReconciled(l)} disabled={toggling === l.id}
                        style={{ padding: 4, background: 'none', border: 'none', cursor: 'pointer', color: l.is_reconciled ? '#16a34a' : 'var(--text-3)', display: 'flex', alignItems: 'center' }}>
                        {toggling === l.id
                          ? <Loader2 size={16} className="animate-spin" />
                          : l.is_reconciled
                            ? <CheckSquare size={16} />
                            : <Square size={16} />}
                      </button>
                    </td>
                    <td style={{ padding: '8px 14px', fontSize: 12, color: 'var(--text-2)', whiteSpace: 'nowrap' }}>{dateStr}</td>
                    <td style={{ padding: '8px 14px', fontSize: 12, fontWeight: 600, color: 'var(--accent)', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>{je?.entry_number || '—'}</td>
                    <td style={{ padding: '8px 14px' }}>
                      <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 99, background: '#f1f5f9', color: '#475569' }}>{je?.voucher_type || '—'}</span>
                    </td>
                    <td style={{ padding: '8px 14px', fontSize: 12, color: 'var(--text-2)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {l.description || je?.narration || '—'}
                    </td>
                    <td style={{ padding: '8px 14px', fontSize: 12, fontFamily: 'monospace', textAlign: 'right', color: '#2563eb' }}>
                      {Number(l.debit_amount) > 0 ? fmtAmt(l.debit_amount) : '—'}
                    </td>
                    <td style={{ padding: '8px 14px', fontSize: 12, fontFamily: 'monospace', textAlign: 'right', color: '#16a34a' }}>
                      {Number(l.credit_amount) > 0 ? fmtAmt(l.credit_amount) : '—'}
                    </td>
                    <td style={{ padding: '8px 14px', fontSize: 11, color: l.is_reconciled ? '#16a34a' : 'var(--text-3)' }}>
                      {l.is_reconciled
                        ? <span title={l.reconciled_at ? new Date(l.reconciled_at).toLocaleString('en-IN') : ''}>{l.reconciled_by || 'reconciled'}</span>
                        : <span style={{ opacity: 0.5 }}>—</span>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot style={{ background: 'var(--table-header-bg)', borderTop: '2px solid var(--card-border)' }}>
              <tr>
                <td colSpan={5} style={{ padding: '10px 14px', fontSize: 13, fontWeight: 800, color: 'var(--text-1)' }}>
                  TOTAL ({displayed.length} {showAll ? '' : 'uncleared '}line{displayed.length !== 1 ? 's' : ''})
                </td>
                <td style={{ padding: '10px 14px', fontSize: 14, fontWeight: 800, fontFamily: 'monospace', textAlign: 'right', color: '#2563eb' }}>
                  {fmtAmt(displayed.reduce((s, l) => s + (Number(l.debit_amount) || 0), 0))}
                </td>
                <td style={{ padding: '10px 14px', fontSize: 14, fontWeight: 800, fontFamily: 'monospace', textAlign: 'right', color: '#16a34a' }}>
                  {fmtAmt(displayed.reduce((s, l) => s + (Number(l.credit_amount) || 0), 0))}
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  )
}
