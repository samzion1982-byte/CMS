/* ═══════════════════════════════════════════════════════════════
   YearEndClosingPage.jsx — Year-end closing entries wizard
   Transfers Income/Expense balances to Corpus Fund (Equity)
   ═══════════════════════════════════════════════════════════════ */

import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import { useToast } from '../lib/toast'
import {
  getFY, fyOptions, fyDateRange, fmtAmt,
  getIncomeStatement, getChartOfAccounts,
  createJournalEntry, nextEntryNumber,
} from '../lib/accountingLib'
import { supabase } from '../lib/supabase'
import { useEntity } from '../lib/EntityContext'
import {
  ArrowLeft, Loader2, CheckCircle, AlertTriangle, RefreshCw,
  ChevronDown, Archive,
} from 'lucide-react'

const LABEL_TH = { padding: '8px 14px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-3)', textAlign: 'left' }

export default function YearEndClosingPage() {
  const navigate = useNavigate()
  const toast    = useToast()
  const { profile } = useAuth()
  const { currentEntityId } = useEntity()

  const [fy,          setFy]          = useState(getFY())
  const [fyOpen,      setFyOpen]      = useState(false)
  const [loading,     setLoading]     = useState(false)
  const [saving,      setSaving]      = useState(false)
  const [preview,     setPreview]     = useState(null) // { income, expenses, surplus, equityAccounts }
  const [equityId,    setEquityId]    = useState('')
  const [alreadyDone, setAlreadyDone] = useState(false)
  const FYS = fyOptions()

  const loadPreview = useCallback(async () => {
    setLoading(true)
    setPreview(null)
    setAlreadyDone(false)
    try {
      const [stmt, all] = await Promise.all([
        getIncomeStatement(fy, currentEntityId),
        getChartOfAccounts(true, currentEntityId),
      ])

      // Check if closing entry already exists for this FY
      const { data: existing } = await supabase
        .from('journal_entries')
        .select('id')
        .eq('financial_year', fy)
        .eq('narration', `Year-End Closing entries for FY ${fy}`)
        .eq('is_deleted', false)
      if (existing?.length > 0) setAlreadyDone(true)

      const equityAccounts = all.filter(a => a.account_type === 'Equity' && !a.parent_id === false || a.account_level >= 3)
        .filter(a => a.account_type === 'Equity')

      // Filter accounts with non-zero net balance
      const income   = stmt.income.filter(a => Math.abs(a.total_credit - a.total_debit) > 0.005)
      const expenses = stmt.expenses.filter(a => Math.abs(a.total_debit - a.total_credit) > 0.005)

      setPreview({ income, expenses, surplus: stmt.surplus, equityAccounts })
      if (equityAccounts.length > 0 && !equityId) setEquityId(equityAccounts[0].id)
    } catch (e) { toast(e.message, 'error') }
    setLoading(false)
  }, [fy, toast])

  useEffect(() => { loadPreview() }, [loadPreview])

  async function handleGenerate() {
    if (!equityId) { toast('Select a Corpus Fund / Equity account.', 'error'); return }
    if (!preview)  { toast('Load the preview first.', 'error'); return }

    const { income, expenses, surplus } = preview
    const { to: fyTo } = fyDateRange(fy)

    const lines = []

    // Dr each income account (zero out its credit balance)
    income.forEach(a => {
      const net = a.total_credit - a.total_debit
      if (net > 0) {
        lines.push({ account_id: a.id, debit_amount: net, credit_amount: 0, description: `Closing: ${a.name}`, line_number: 0 })
      }
    })

    // Cr each expense account (zero out its debit balance)
    expenses.forEach(a => {
      const net = a.total_debit - a.total_credit
      if (net > 0) {
        lines.push({ account_id: a.id, debit_amount: 0, credit_amount: net, description: `Closing: ${a.name}`, line_number: 0 })
      }
    })

    // Surplus → Cr Corpus Fund; Deficit → Dr Corpus Fund
    if (Math.abs(surplus) > 0.005) {
      if (surplus > 0) {
        lines.push({ account_id: equityId, debit_amount: 0, credit_amount: surplus, description: 'Surplus transferred to Corpus Fund', line_number: 0 })
      } else {
        lines.push({ account_id: equityId, debit_amount: Math.abs(surplus), credit_amount: 0, description: 'Deficit charged to Corpus Fund', line_number: 0 })
      }
    }

    if (lines.length === 0) { toast('No balances to close.', 'error'); return }

    const totalDr = lines.reduce((s, l) => s + l.debit_amount,  0)
    const totalCr = lines.reduce((s, l) => s + l.credit_amount, 0)

    setSaving(true)
    try {
      const entryNo = await nextEntryNumber(fy, 'Journal', currentEntityId)
      const entry = {
        entry_number:   `YEC-${fy}`,
        entry_date:     fyTo,
        financial_year: fy,
        voucher_type:   'Journal',
        narration:      `Year-End Closing entries for FY ${fy}`,
        total_debit:    totalDr,
        total_credit:   totalCr,
        is_posted:      true,
        entity_id:      currentEntityId,
      }
      await createJournalEntry(entry, lines.map((l, i) => ({ ...l, line_number: i + 1 })), profile?.email || 'admin')
      toast('Year-end closing entries generated and posted!', 'success')
      setAlreadyDone(true)
      loadPreview()
    } catch (e) { toast(e.message, 'error') }
    setSaving(false)
  }

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
              <Archive size={20} style={{ color: 'var(--accent)' }} /> Year-End Closing
            </h1>
            <p className="page-subtitle">Transfer Income &amp; Expense balances to Corpus Fund</p>
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
          <button onClick={loadPreview} disabled={loading} title="Refresh"
            style={{ padding: '8px 10px', background: 'var(--card-bg)', border: '1.5px solid var(--card-border)', borderRadius: 8, cursor: 'pointer', display: 'flex', alignItems: 'center', color: 'var(--text-2)' }}>
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Already done warning */}
      {alreadyDone && (
        <div style={{ marginBottom: 16, padding: '10px 16px', background: '#fefce8', border: '1.5px solid #fde047', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 10 }}>
          <AlertTriangle size={15} style={{ color: '#ca8a04', flexShrink: 0 }} />
          <span style={{ fontSize: 13, color: '#713f12' }}>
            A year-end closing entry already exists for FY {fy}. Generating again will create a duplicate — review the existing entry in Journal Entries first.
          </span>
        </div>
      )}

      {loading ? (
        <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--text-3)' }}>
          <Loader2 size={24} className="animate-spin" style={{ display: 'block', margin: '0 auto 8px' }} />Loading income statement…
        </div>
      ) : preview ? (
        <>
          {/* Surplus/Deficit summary */}
          <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
            <div className="card" style={{ padding: '12px 18px', textAlign: 'center', minWidth: 130 }}>
              <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: '#16a34a', margin: '0 0 3px' }}>Total Income</p>
              <p style={{ fontSize: 17, fontWeight: 800, fontFamily: 'monospace', color: '#16a34a', margin: 0 }}>{fmtAmt(preview.income.reduce((s, a) => s + (a.total_credit - a.total_debit), 0))}</p>
            </div>
            <div className="card" style={{ padding: '12px 18px', textAlign: 'center', minWidth: 130 }}>
              <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: '#dc2626', margin: '0 0 3px' }}>Total Expenses</p>
              <p style={{ fontSize: 17, fontWeight: 800, fontFamily: 'monospace', color: '#dc2626', margin: 0 }}>{fmtAmt(preview.expenses.reduce((s, a) => s + (a.total_debit - a.total_credit), 0))}</p>
            </div>
            <div className="card" style={{ padding: '12px 18px', flex: 1, borderLeft: `4px solid ${preview.surplus >= 0 ? '#16a34a' : '#dc2626'}`, background: preview.surplus >= 0 ? '#f0fdf4' : '#fff1f2' }}>
              <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: preview.surplus >= 0 ? '#16a34a' : '#dc2626', margin: '0 0 3px' }}>
                {preview.surplus >= 0 ? 'Surplus' : 'Deficit'}
              </p>
              <p style={{ fontSize: 20, fontWeight: 800, fontFamily: 'monospace', color: preview.surplus >= 0 ? '#16a34a' : '#dc2626', margin: 0 }}>
                {fmtAmt(Math.abs(preview.surplus))}
              </p>
              <p style={{ fontSize: 11, color: 'var(--text-3)', margin: '4px 0 0' }}>
                Will be {preview.surplus >= 0 ? 'credited to' : 'debited from'} selected Corpus Fund account
              </p>
            </div>
          </div>

          {/* Corpus Fund selector + Generate button */}
          <div className="card" style={{ padding: '14px 18px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 240 }}>
              <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 5 }}>
                Corpus Fund / Equity Account *
              </label>
              <select value={equityId} onChange={e => setEquityId(e.target.value)}
                style={{ width: '100%', height: 36, padding: '0 8px', border: '1.5px solid var(--card-border)', borderRadius: 7, fontSize: 13, background: 'var(--input-bg)', color: 'var(--text-1)' }}>
                <option value="">— select account —</option>
                {(preview.equityAccounts || []).map(a => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </div>
            <button onClick={handleGenerate} disabled={saving || !equityId || preview.income.length + preview.expenses.length === 0}
              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 22px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>
              {saving ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />}
              Generate &amp; Post Closing Entry
            </button>
          </div>

          {/* Preview table */}
          <div className="card" style={{ overflow: 'hidden' }}>
            <div style={{ padding: '12px 18px', borderBottom: '1px solid var(--card-border)', fontSize: 12, fontWeight: 700, color: 'var(--text-2)' }}>
              Closing Entry Preview — FY {fy}
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead style={{ background: 'var(--table-header-bg)' }}>
                <tr>
                  <th style={{ ...LABEL_TH }}>Account</th>
                  <th style={{ ...LABEL_TH, width: 80 }}>Type</th>
                  <th style={{ ...LABEL_TH, textAlign: 'right', width: 140, color: 'var(--text-3)' }}>Net Balance</th>
                  <th style={{ ...LABEL_TH, textAlign: 'right', width: 140, color: '#2563eb' }}>Closing Dr (₹)</th>
                  <th style={{ ...LABEL_TH, textAlign: 'right', width: 140, color: '#16a34a' }}>Closing Cr (₹)</th>
                </tr>
              </thead>
              <tbody>
                {/* Income rows — will be Dr'd to zero */}
                {preview.income.length > 0 && (
                  <tr style={{ background: '#f0fdf455' }}>
                    <td colSpan={5} style={{ padding: '6px 14px', fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#15803d' }}>
                      Income Accounts
                    </td>
                  </tr>
                )}
                {preview.income.map((a, i) => {
                  const net = a.total_credit - a.total_debit
                  return (
                    <tr key={a.id} style={{ background: i % 2 ? 'rgba(0,0,0,0.012)' : 'transparent' }}>
                      <td style={{ padding: '7px 14px', fontSize: 13, color: 'var(--text-1)' }}>{a.name}</td>
                      <td style={{ padding: '7px 14px' }}>
                        <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 99, background: '#dcfce7', color: '#15803d' }}>Income</span>
                      </td>
                      <td style={{ padding: '7px 14px', fontSize: 12, fontFamily: 'monospace', textAlign: 'right', color: '#15803d' }}>{fmtAmt(net)}</td>
                      <td style={{ padding: '7px 14px', fontSize: 12, fontFamily: 'monospace', textAlign: 'right', color: '#2563eb', fontWeight: 600 }}>{fmtAmt(net)}</td>
                      <td style={{ padding: '7px 14px', fontSize: 12, fontFamily: 'monospace', textAlign: 'right', color: 'var(--text-3)' }}>—</td>
                    </tr>
                  )
                })}

                {/* Expense rows — will be Cr'd to zero */}
                {preview.expenses.length > 0 && (
                  <tr style={{ background: '#fff7ed55' }}>
                    <td colSpan={5} style={{ padding: '6px 14px', fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#c2410c' }}>
                      Expense Accounts
                    </td>
                  </tr>
                )}
                {preview.expenses.map((a, i) => {
                  const net = a.total_debit - a.total_credit
                  return (
                    <tr key={a.id} style={{ background: i % 2 ? 'rgba(0,0,0,0.012)' : 'transparent' }}>
                      <td style={{ padding: '7px 14px', fontSize: 13, color: 'var(--text-1)' }}>{a.name}</td>
                      <td style={{ padding: '7px 14px' }}>
                        <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 99, background: '#fff7ed', color: '#c2410c' }}>Expense</span>
                      </td>
                      <td style={{ padding: '7px 14px', fontSize: 12, fontFamily: 'monospace', textAlign: 'right', color: '#c2410c' }}>{fmtAmt(net)}</td>
                      <td style={{ padding: '7px 14px', fontSize: 12, fontFamily: 'monospace', textAlign: 'right', color: 'var(--text-3)' }}>—</td>
                      <td style={{ padding: '7px 14px', fontSize: 12, fontFamily: 'monospace', textAlign: 'right', color: '#16a34a', fontWeight: 600 }}>{fmtAmt(net)}</td>
                    </tr>
                  )
                })}

                {/* Surplus / Deficit row */}
                {Math.abs(preview.surplus) > 0.005 && equityId && (
                  <>
                    <tr style={{ background: '#eff6ff55' }}>
                      <td colSpan={5} style={{ padding: '6px 14px', fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#2563eb' }}>
                        Surplus / Deficit
                      </td>
                    </tr>
                    <tr>
                      <td style={{ padding: '7px 14px', fontSize: 13, color: 'var(--text-1)' }}>
                        {preview.equityAccounts?.find(a => a.id === equityId)?.name || 'Corpus Fund'}
                      </td>
                      <td style={{ padding: '7px 14px' }}>
                        <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 99, background: '#dbeafe', color: '#1d4ed8' }}>Equity</span>
                      </td>
                      <td style={{ padding: '7px 14px', fontSize: 12, fontFamily: 'monospace', textAlign: 'right', color: 'var(--text-3)' }}>—</td>
                      <td style={{ padding: '7px 14px', fontSize: 12, fontFamily: 'monospace', textAlign: 'right', color: preview.surplus < 0 ? '#2563eb' : 'var(--text-3)', fontWeight: preview.surplus < 0 ? 600 : 400 }}>
                        {preview.surplus < 0 ? fmtAmt(Math.abs(preview.surplus)) : '—'}
                      </td>
                      <td style={{ padding: '7px 14px', fontSize: 12, fontFamily: 'monospace', textAlign: 'right', color: preview.surplus > 0 ? '#16a34a' : 'var(--text-3)', fontWeight: preview.surplus > 0 ? 600 : 400 }}>
                        {preview.surplus > 0 ? fmtAmt(preview.surplus) : '—'}
                      </td>
                    </tr>
                  </>
                )}
              </tbody>
              <tfoot style={{ background: 'var(--table-header-bg)', borderTop: '2px solid var(--card-border)' }}>
                <tr>
                  <td colSpan={3} style={{ padding: '10px 14px', fontSize: 13, fontWeight: 800, color: 'var(--text-1)' }}>GRAND TOTAL</td>
                  <td style={{ padding: '10px 14px', fontSize: 14, fontWeight: 800, fontFamily: 'monospace', textAlign: 'right', color: '#2563eb' }}>
                    {fmtAmt(preview.income.reduce((s, a) => s + Math.max(0, a.total_credit - a.total_debit), 0) + (preview.surplus < 0 ? Math.abs(preview.surplus) : 0))}
                  </td>
                  <td style={{ padding: '10px 14px', fontSize: 14, fontWeight: 800, fontFamily: 'monospace', textAlign: 'right', color: '#16a34a' }}>
                    {fmtAmt(preview.expenses.reduce((s, a) => s + Math.max(0, a.total_debit - a.total_credit), 0) + (preview.surplus > 0 ? preview.surplus : 0))}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      ) : null}
    </div>
  )
}
