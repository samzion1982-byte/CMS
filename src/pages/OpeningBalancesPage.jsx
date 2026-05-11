/* ═══════════════════════════════════════════════════════════════
   OpeningBalancesPage.jsx — Enter / edit opening balances
   Creates Journal entries with voucher_type = 'Opening Balance'
   ═══════════════════════════════════════════════════════════════ */

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import { useToast } from '../lib/toast'
import {
  getFY, fyOptions, fyDateRange, fmtAmt,
  getChartOfAccounts, getPostableAccountsWithPath,
  TYPE_COLOR, displayAccountType,
} from '../lib/accountingLib'
import { supabase } from '../lib/supabase'
import {
  ArrowLeft, Loader2, Save, Scale, ChevronDown, Info,
} from 'lucide-react'

const LABEL = { TH: { padding: '9px 14px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-3)', textAlign: 'left' } }

export default function OpeningBalancesPage() {
  const navigate = useNavigate()
  const toast    = useToast()
  const { profile } = useAuth()

  const [fy,       setFy]       = useState(getFY())
  const [fyOpen,   setFyOpen]   = useState(false)
  const [accounts, setAccounts] = useState([])
  const [balances, setBalances] = useState({})   // { [accountId]: { debit, credit } }
  const [loading,  setLoading]  = useState(true)
  const [saving,   setSaving]   = useState(false)
  const FYS = fyOptions()

  const { from: fyFrom } = fyDateRange(fy)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const all = await getChartOfAccounts(false)
      const postable = getPostableAccountsWithPath(all)
      setAccounts(postable)

      // Load existing opening balance entries for this FY
      const { data: entries } = await supabase
        .from('journal_entries')
        .select('id, journal_entry_lines(account_id, debit_amount, credit_amount)')
        .eq('financial_year', fy)
        .eq('voucher_type', 'Opening Balance')
        .eq('is_deleted', false)

      const map = {}
      if (entries) {
        for (const e of entries) {
          for (const l of (e.journal_entry_lines || [])) {
            map[l.account_id] = {
              debit:  String(l.debit_amount  || ''),
              credit: String(l.credit_amount || ''),
            }
          }
        }
      }
      setBalances(map)
    } catch (e) { toast(e.message, 'error') }
    setLoading(false)
  }, [fy, toast])

  useEffect(() => { load() }, [load])

  function setBalance(accountId, field, value) {
    setBalances(prev => ({
      ...prev,
      [accountId]: { ...(prev[accountId] || { debit: '', credit: '' }), [field]: value },
    }))
  }

  const totalDebit  = accounts.reduce((s, a) => s + (parseFloat(balances[a.id]?.debit)  || 0), 0)
  const totalCredit = accounts.reduce((s, a) => s + (parseFloat(balances[a.id]?.credit) || 0), 0)
  const diff = Math.abs(totalDebit - totalCredit)
  const balanced = diff < 0.01

  async function handleSave() {
    const lines = accounts
      .filter(a => parseFloat(balances[a.id]?.debit) > 0 || parseFloat(balances[a.id]?.credit) > 0)
      .map(a => ({
        account_id:    a.id,
        debit_amount:  parseFloat(balances[a.id]?.debit)  || 0,
        credit_amount: parseFloat(balances[a.id]?.credit) || 0,
        description:   'Opening Balance',
        line_number:   0,
      }))

    if (lines.length === 0) { toast('Enter at least one balance.', 'error'); return }
    if (!balanced) { toast(`Opening balances do not balance — difference ₹${diff.toFixed(2)}`, 'error'); return }

    setSaving(true)
    try {
      // Delete any existing opening balance entries for this FY
      const { data: existing } = await supabase
        .from('journal_entries')
        .select('id')
        .eq('financial_year', fy)
        .eq('voucher_type', 'Opening Balance')
        .eq('is_deleted', false)

      if (existing?.length > 0) {
        await supabase.from('journal_entries').update({ is_deleted: true }).in('id', existing.map(e => e.id))
      }

      const totalDr = lines.reduce((s, l) => s + l.debit_amount,  0)
      const totalCr = lines.reduce((s, l) => s + l.credit_amount, 0)

      const { data: je, error: jeErr } = await supabase
        .from('journal_entries')
        .insert({
          entry_number:   `OB-${fy}`,
          entry_date:     fyFrom,
          financial_year: fy,
          voucher_type:   'Opening Balance',
          narration:      `Opening balances for FY ${fy}`,
          total_debit:    totalDr,
          total_credit:   totalCr,
          is_posted:      true,
          created_by:     profile?.email || 'admin',
          updated_by:     profile?.email || 'admin',
        })
        .select().single()
      if (jeErr) throw jeErr

      const lineRows = lines.map((l, i) => ({ ...l, journal_entry_id: je.id, line_number: i + 1 }))
      const { error: lErr } = await supabase.from('journal_entry_lines').insert(lineRows)
      if (lErr) throw lErr

      toast('Opening balances saved!', 'success')
    } catch (e) { toast(e.message, 'error') }
    setSaving(false)
  }

  const grouped = useMemo(() => {
    const groups = {}
    accounts.forEach(a => {
      const t = a.account_type
      if (!groups[t]) groups[t] = []
      groups[t].push(a)
    })
    return groups
  }, [accounts])

  return (
    <div className="page-container">
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={() => navigate('/accounting')} style={{ padding: '6px 8px', background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: 7, cursor: 'pointer', display: 'flex', alignItems: 'center', color: 'var(--text-2)' }}>
            <ArrowLeft size={15} />
          </button>
          <div>
            <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
              <Scale size={20} style={{ color: 'var(--accent)' }} /> Opening Balances
            </h1>
            <p className="page-subtitle">Set account balances at the start of the financial year</p>
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
          <button onClick={handleSave} disabled={saving || loading}
            style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 18px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            Save Opening Balances
          </button>
        </div>
      </div>

      {/* Info banner */}
      <div style={{ marginBottom: 20, padding: '10px 16px', background: '#eff6ff', border: '1.5px solid #bfdbfe', borderRadius: 8, display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <Info size={15} style={{ color: '#2563eb', flexShrink: 0, marginTop: 1 }} />
        <div style={{ fontSize: 12, color: '#1e40af', lineHeight: 1.6 }}>
          Enter the debit or credit balance for each account as of <strong>1 April {fy.split('-')[0]}</strong>.
          Assets & Expenses usually have a Debit balance; Liabilities, Income & Equity usually have a Credit balance.
          Opening balances must balance (Total Debit = Total Credit). Existing opening balances for FY {fy} will be replaced on save.
        </div>
      </div>

      {/* Balance summary */}
      {!loading && (
        <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
          <div className="card" style={{ padding: '12px 18px', flex: 1, background: balanced ? '#f0fdf4' : '#fff7ed', borderLeft: `4px solid ${balanced ? '#16a34a' : '#c2410c'}` }}>
            <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: balanced ? '#16a34a' : '#c2410c', margin: '0 0 4px' }}>
              {balanced ? '✓ Balanced' : `⚠ Difference: ${fmtAmt(diff)}`}
            </p>
            <p style={{ fontSize: 12, color: 'var(--text-2)', margin: 0 }}>
              {balanced ? 'Opening balances are balanced — safe to save.' : 'Debit and credit totals must match before saving.'}
            </p>
          </div>
          <div className="card" style={{ padding: '12px 18px', textAlign: 'center', minWidth: 130 }}>
            <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: '#2563eb', margin: '0 0 3px' }}>Total Debit</p>
            <p style={{ fontSize: 17, fontWeight: 800, fontFamily: 'monospace', color: '#2563eb', margin: 0 }}>{fmtAmt(totalDebit)}</p>
          </div>
          <div className="card" style={{ padding: '12px 18px', textAlign: 'center', minWidth: 130 }}>
            <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: '#16a34a', margin: '0 0 3px' }}>Total Credit</p>
            <p style={{ fontSize: 17, fontWeight: 800, fontFamily: 'monospace', color: '#16a34a', margin: 0 }}>{fmtAmt(totalCredit)}</p>
          </div>
        </div>
      )}

      {loading ? (
        <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--text-3)' }}>
          <Loader2 size={24} className="animate-spin" style={{ display: 'block', margin: '0 auto 8px' }} />Loading accounts…
        </div>
      ) : (
        <div className="card" style={{ overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead style={{ background: 'var(--table-header-bg)' }}>
              <tr>
                <th style={{ ...LABEL.TH }}>Account Name</th>
                <th style={{ ...LABEL.TH, width: 80 }}>Type</th>
                <th style={{ ...LABEL.TH, textAlign: 'right', width: 160, color: '#2563eb' }}>Debit (₹)</th>
                <th style={{ ...LABEL.TH, textAlign: 'right', width: 160, color: '#16a34a' }}>Credit (₹)</th>
              </tr>
            </thead>
            <tbody>
              {['Asset', 'Liability', 'Equity', 'Income', 'Expense'].map(type => {
                const group = grouped[type] || []
                if (!group.length) return null
                const c = TYPE_COLOR[type] || { bg: '#f1f5f9', text: '#475569' }
                return [
                  <tr key={`${type}-header`} style={{ background: c.bg + '55' }}>
                    <td colSpan={4} style={{ padding: '7px 14px', fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.07em', color: c.text }}>
                      {displayAccountType(type)}
                    </td>
                  </tr>,
                  ...group.map((a, i) => {
                    const b = balances[a.id] || { debit: '', credit: '' }
                    return (
                      <tr key={a.id} style={{ background: i % 2 ? 'rgba(0,0,0,0.012)' : 'transparent' }}>
                        <td style={{ padding: '7px 14px', fontSize: 13, color: 'var(--text-1)' }}>{a.name}</td>
                        <td style={{ padding: '7px 14px' }}>
                          <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 99, background: c.bg, color: c.text }}>{displayAccountType(type)}</span>
                        </td>
                        <td style={{ padding: '5px 10px' }}>
                          <input type="number" min="0" step="0.01" placeholder="0.00"
                            value={b.debit}
                            onChange={e => setBalance(a.id, 'debit', e.target.value)}
                            style={{ width: '100%', height: 32, padding: '0 8px', border: '1.5px solid var(--card-border)', borderRadius: 7, fontSize: 12, fontFamily: 'monospace', textAlign: 'right', background: parseFloat(b.debit) > 0 ? '#dbeafe22' : 'var(--input-bg)', color: '#2563eb', outline: 'none', boxSizing: 'border-box' }}
                          />
                        </td>
                        <td style={{ padding: '5px 10px' }}>
                          <input type="number" min="0" step="0.01" placeholder="0.00"
                            value={b.credit}
                            onChange={e => setBalance(a.id, 'credit', e.target.value)}
                            style={{ width: '100%', height: 32, padding: '0 8px', border: '1.5px solid var(--card-border)', borderRadius: 7, fontSize: 12, fontFamily: 'monospace', textAlign: 'right', background: parseFloat(b.credit) > 0 ? '#dcfce722' : 'var(--input-bg)', color: '#16a34a', outline: 'none', boxSizing: 'border-box' }}
                          />
                        </td>
                      </tr>
                    )
                  }),
                ]
              })}
            </tbody>
            <tfoot style={{ background: 'var(--table-header-bg)', borderTop: '2px solid var(--card-border)' }}>
              <tr>
                <td colSpan={2} style={{ padding: '10px 14px', fontSize: 13, fontWeight: 800, color: 'var(--text-1)' }}>GRAND TOTAL</td>
                <td style={{ padding: '10px 14px', fontSize: 14, fontWeight: 800, fontFamily: 'monospace', textAlign: 'right', color: '#2563eb' }}>{fmtAmt(totalDebit)}</td>
                <td style={{ padding: '10px 14px', fontSize: 14, fontWeight: 800, fontFamily: 'monospace', textAlign: 'right', color: '#16a34a' }}>{fmtAmt(totalCredit)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  )
}
