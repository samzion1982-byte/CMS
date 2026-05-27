/* ═══════════════════════════════════════════════════════════════
   OpeningBalancesPage.jsx — Enter / edit opening balances
   Creates Journal entries with voucher_type = 'Opening Balance'
   ═══════════════════════════════════════════════════════════════ */

import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import { useToast } from '../lib/toast'
import {
  fyDateRange, fmtAmt,
  getChartOfAccounts, getPostableAccounts, getPostableAccountsWithPath,
  TYPE_COLOR, displayAccountType, getEntrySystemStatus,
} from '../lib/accountingLib'
import { supabase } from '../lib/supabase'
import { useEntity } from '../lib/EntityContext'
import { useEntityFY } from '../lib/useEntityFY'
import {
  ArrowLeft, Loader2, Save, Scale, ChevronDown, ChevronRight, Info,
} from 'lucide-react'

const LABEL = { TH: { padding: '9px 14px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-3)', textAlign: 'left' } }

export default function OpeningBalancesPage() {
  const navigate = useNavigate()
  const toast    = useToast()
  const { profile } = useAuth()
  const { currentEntityId } = useEntity()

  const { fy, setFy, fyOpen, setFyOpen, FYS } = useEntityFY()
  const [allAccounts,     setAllAccounts]   = useState([])
  const [accounts,        setAccounts]      = useState([])   // postable (level 3/4) only
  const [balances,        setBalances]      = useState({})   // { [accountId]: { debit, credit } }
  const [autoEquityId,    setAutoEquityId]  = useState('')
  const [collapsedGroups, setCollapsedGroups] = useState(new Set())
  const [loading,  setLoading]  = useState(true)
  const [saving,   setSaving]   = useState(false)

  const { from: fyFrom } = fyDateRange(fy)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const all = await getChartOfAccounts(false, currentEntityId)
      setAllAccounts(all)
      const postable = getPostableAccountsWithPath(all)
      setAccounts(postable)

      // Load existing opening balance entries for this FY
      let obQ = supabase
        .from('journal_entries')
        .select('id, journal_entry_lines(account_id, debit_amount, credit_amount)')
        .eq('financial_year', fy)
        .eq('voucher_type', 'Opening')
        .eq('is_deleted', false)
      if (currentEntityId) obQ = obQ.eq('entity_id', currentEntityId)
      const { data: entries } = await obQ

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

      // Pre-populate from COA opening_balance field for accounts not yet in the journal entry
      const postable2 = getPostableAccounts(all)
      for (const a of postable2) {
        if (!map[a.id] && Number(a.opening_balance)) {
          const amt = String(Math.abs(Number(a.opening_balance)))
          const drTypes = ['Asset', 'Expense']
          map[a.id] = drTypes.includes(a.account_type)
            ? { debit: amt, credit: '' }
            : { debit: '', credit: amt }
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

  // Leaf accounts = accounts with no children (actual posting accounts)
  const leafAccounts = useMemo(() => {
    const parentIds = new Set(allAccounts.filter(a => a.parent_id).map(a => a.parent_id))
    return allAccounts.filter(a => a.level >= 3 && !parentIds.has(a.id))
  }, [allAccounts])

  const grouped = useMemo(() => {
    const parentIds = new Set(allAccounts.filter(a => a.parent_id).map(a => a.parent_id))

    return ['Asset', 'Liability', 'Equity', 'Income', 'Expense'].map(type => {
      const ofType = allAccounts.filter(a => a.account_type === type)

      const level2 = ofType.filter(a => a.level === 2).sort((a, b) => a.name.localeCompare(b.name))
      const level3 = ofType.filter(a => a.level === 3).sort((a, b) => a.name.localeCompare(b.name))
      const level4 = ofType.filter(a => a.level === 4).sort((a, b) => a.name.localeCompare(b.name))

      const level3Nodes = level3.map(a => ({
        ...a,
        isGroup: parentIds.has(a.id),
        children: level4.filter(c => c.parent_id === a.id).sort((a, b) => a.name.localeCompare(b.name)),
      }))

      const level2Ids = new Set(level2.map(g => g.id))
      const groups = level2.map(g => ({
        ...g,
        items: level3Nodes.filter(a => a.parent_id === g.id),
      })).filter(g => g.items.length > 0)

      const ungrouped = level3Nodes.filter(a => !level2Ids.has(a.parent_id))
      return { type, groups, ungrouped }
    }).filter(({ groups, ungrouped }) => groups.length > 0 || ungrouped.length > 0)
  }, [allAccounts])

  const totalDebit  = leafAccounts.reduce((s, a) => s + (parseFloat(balances[a.id]?.debit)  || 0), 0)
  const totalCredit = leafAccounts.reduce((s, a) => s + (parseFloat(balances[a.id]?.credit) || 0), 0)
  const diff = Math.abs(totalDebit - totalCredit)
  const balanced = diff < 0.01

  async function handleSave() {
    const systemStatus = await getEntrySystemStatus()
    if (!systemStatus.locked) {
      toast('Accounting method not configured. Go to Accounting → Settings and lock the entry system first.', 'error')
      return
    }

    const lines = leafAccounts
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
      // entry_number is globally unique; include entity suffix to avoid cross-entity conflicts
      const entitySuffix = currentEntityId ? `-${currentEntityId.slice(-8)}` : ''
      const obEntryNumber = `OB-${fy}${entitySuffix}`

      // Hard-delete by exact entry_number (covers all is_deleted states; lines cascade)
      await supabase.from('journal_entries').delete().eq('entry_number', obEntryNumber)
      // Also clean up any old-format entries (OB-YYYY-YY without entity suffix)
      if (currentEntityId) {
        const { data: oldFmt } = await supabase
          .from('journal_entries')
          .select('id')
          .eq('financial_year', fy)
          .eq('voucher_type', 'Opening')
          .eq('entity_id', currentEntityId)
        if (oldFmt?.length > 0) {
          await supabase.from('journal_entries').delete().in('id', oldFmt.map(e => e.id))
        }
      }

      const totalDr = lines.reduce((s, l) => s + l.debit_amount,  0)
      const totalCr = lines.reduce((s, l) => s + l.credit_amount, 0)

      const { data: je, error: jeErr } = await supabase
        .from('journal_entries')
        .insert({
          entry_number:   obEntryNumber,
          entry_date:     fyFrom,
          financial_year: fy,
          voucher_type:   'Opening',
          narration:      `Opening balances for FY ${fy}`,
          total_debit:    totalDr,
          total_credit:   totalCr,
          is_posted:      true,
          entity_id:      currentEntityId,
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

  const equityAccounts = useMemo(
    () => leafAccounts.filter(a => a.account_type === 'Equity'),
    [leafAccounts]
  )

  function handleAutoBalance() {
    if (!autoEquityId) return
    const dr = totalDebit - totalCredit
    setBalance(autoEquityId, dr > 0 ? 'credit' : 'debit', Math.abs(dr).toFixed(2))
    setBalance(autoEquityId, dr > 0 ? 'debit'  : 'credit', '')
  }

  function toggleGroup(id) {
    setCollapsedGroups(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
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
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
            <button onClick={() => navigate('/accounting/settings')} style={{ padding: '6px 8px', background: 'var(--card-bg)', border: '1.5px solid var(--card-border)', borderRadius: 7, cursor: 'pointer', display: 'flex', alignItems: 'center', color: 'var(--text-2)' }}>
              <ArrowLeft size={15} />
            </button>
            <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-3)', whiteSpace: 'nowrap' }}>Setup</span>
          </div>
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

      {/* Auto-balance strip — shown only when unbalanced */}
      {!loading && !balanced && equityAccounts.length > 0 && (
        <div style={{ marginBottom: 16, padding: '12px 18px', background: '#fff7ed', border: '1.5px solid #fdba74', borderRadius: 10, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: '#92400e' }}>
            Auto-balance {fmtAmt(diff)} →
          </span>
          <select value={autoEquityId} onChange={e => setAutoEquityId(e.target.value)}
            style={{ flex: 1, minWidth: 200, maxWidth: 320, height: 34, padding: '0 10px', border: '1.5px solid #fdba74', borderRadius: 7, fontSize: 13, background: '#fff', color: 'var(--text-1)' }}>
            <option value="">Select Corpus / Equity account…</option>
            {equityAccounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <button onClick={handleAutoBalance} disabled={!autoEquityId}
            style={{ padding: '7px 16px', background: autoEquityId ? '#c2410c' : '#e5e7eb', color: autoEquityId ? '#fff' : '#9ca3af', border: 'none', borderRadius: 7, fontSize: 13, fontWeight: 700, cursor: autoEquityId ? 'pointer' : 'not-allowed' }}>
            Auto-balance
          </button>
          <span style={{ fontSize: 11, color: '#b45309' }}>
            This will {totalDebit > totalCredit ? 'credit' : 'debit'} the selected account with {fmtAmt(diff)} to make the entry balance.
          </span>
        </div>
      )}

      {loading ? (
        <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--text-3)' }}>
          <Loader2 size={24} className="animate-spin" style={{ display: 'block', margin: '0 auto 8px' }} />Loading accounts…
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {grouped.map(({ type, groups, ungrouped }) => {
            const c = TYPE_COLOR[type] || { bg: '#f1f5f9', text: '#475569' }

            // Sum all leaf balances under an array of accounts recursively
            function leafSum(items, field) {
              let s = 0
              for (const a of items) {
                if (a.isGroup) s += leafSum(a.children, field)
                else s += parseFloat(balances[a.id]?.[field]) || 0
              }
              return s
            }

            const allItems = [...groups.flatMap(g => g.items), ...ungrouped]
            const typeDr = leafSum(allItems, 'debit')
            const typeCr = leafSum(allItems, 'credit')

            // Render an editable leaf row (level-3 without children, or level-4)
            function renderLeaf(a, indent) {
              const b     = balances[a.id] || { debit: '', credit: '' }
              const hasDr = parseFloat(b.debit)  > 0
              const hasCr = parseFloat(b.credit) > 0
              return (
                <tr key={a.id} style={{ borderTop: `1px solid ${c.text}12` }}>
                  <td style={{ padding: `7px 16px 7px ${indent}px`, fontSize: 13, color: 'var(--text-1)', fontWeight: (hasDr || hasCr) ? 600 : 400 }}>
                    {a.name}
                  </td>
                  <td style={{ padding: '5px 10px', width: 180 }}>
                    <input type="number" min="0" step="0.01" placeholder="0.00"
                      value={b.debit}
                      onChange={e => setBalance(a.id, 'debit', e.target.value)}
                      style={{ width: '100%', height: 32, padding: '0 10px', border: `1.5px solid ${hasDr ? '#93c5fd' : 'var(--card-border)'}`, borderRadius: 7, fontSize: 12, fontFamily: 'monospace', textAlign: 'right', background: hasDr ? '#eff6ff' : 'var(--input-bg)', color: '#2563eb', outline: 'none', boxSizing: 'border-box', fontWeight: hasDr ? 700 : 400 }}
                    />
                  </td>
                  <td style={{ padding: '5px 10px', width: 180 }}>
                    <input type="number" min="0" step="0.01" placeholder="0.00"
                      value={b.credit}
                      onChange={e => setBalance(a.id, 'credit', e.target.value)}
                      style={{ width: '100%', height: 32, padding: '0 10px', border: `1.5px solid ${hasCr ? '#86efac' : 'var(--card-border)'}`, borderRadius: 7, fontSize: 12, fontFamily: 'monospace', textAlign: 'right', background: hasCr ? '#f0fdf4' : 'var(--input-bg)', color: '#16a34a', outline: 'none', boxSizing: 'border-box', fontWeight: hasCr ? 700 : 400 }}
                    />
                  </td>
                </tr>
              )
            }

            // Render a level-3 item: either a sub-group row (with L4 children) or a leaf row
            function renderL3(item) {
              if (!item.isGroup) return renderLeaf(item, 32)
              const isCollapsed = collapsedGroups.has(item.id)
              const sDr = leafSum(item.children, 'debit')
              const sCr = leafSum(item.children, 'credit')
              return (
                <React.Fragment key={item.id}>
                  <tr onClick={() => toggleGroup(item.id)}
                    style={{ cursor: 'pointer', background: c.bg + '40', borderTop: `1px solid ${c.text}15` }}>
                    <td style={{ padding: '7px 16px 7px 32px', fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                        <ChevronRight size={13} style={{ transform: isCollapsed ? 'rotate(0deg)' : 'rotate(90deg)', transition: 'transform 0.15s', color: c.text }} />
                        {item.name}
                      </span>
                    </td>
                    <td style={{ padding: '7px 10px', textAlign: 'right', fontSize: 12, fontFamily: 'monospace', color: '#2563eb', fontWeight: 600 }}>
                      {sDr > 0 ? fmtAmt(sDr) : ''}
                    </td>
                    <td style={{ padding: '7px 10px', textAlign: 'right', fontSize: 12, fontFamily: 'monospace', color: '#16a34a', fontWeight: 600 }}>
                      {sCr > 0 ? fmtAmt(sCr) : ''}
                    </td>
                  </tr>
                  {!isCollapsed && item.children.map(ch => renderLeaf(ch, 52))}
                </React.Fragment>
              )
            }

            return (
              <div key={type} className="card" style={{ overflow: 'hidden', border: `1.5px solid ${c.text}30` }}>
                {/* Type header */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', background: c.bg, borderBottom: `1.5px solid ${c.text}25` }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 10, height: 10, borderRadius: '50%', background: c.text }} />
                    <span style={{ fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: c.text }}>
                      {displayAccountType(type)}
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: 24 }}>
                    {typeDr > 0 && <span style={{ fontSize: 12, fontFamily: 'monospace', fontWeight: 700, color: '#2563eb' }}>Dr {fmtAmt(typeDr)}</span>}
                    {typeCr > 0 && <span style={{ fontSize: 12, fontFamily: 'monospace', fontWeight: 700, color: '#16a34a' }}>Cr {fmtAmt(typeCr)}</span>}
                  </div>
                </div>

                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: c.bg + '55' }}>
                      <th style={{ ...LABEL.TH }}>Account Name</th>
                      <th style={{ ...LABEL.TH, textAlign: 'right', width: 180, color: '#2563eb' }}>Debit (₹)</th>
                      <th style={{ ...LABEL.TH, textAlign: 'right', width: 180, color: '#16a34a' }}>Credit (₹)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {groups.map(g => {
                      const isCollapsed = collapsedGroups.has(g.id)
                      const gDr = leafSum(g.items, 'debit')
                      const gCr = leafSum(g.items, 'credit')
                      return (
                        <React.Fragment key={g.id}>
                          {/* Level-2 group row */}
                          <tr onClick={() => toggleGroup(g.id)}
                            style={{ cursor: 'pointer', background: c.bg + '70', borderTop: `1.5px solid ${c.text}20` }}>
                            <td style={{ padding: '8px 16px', fontSize: 12, fontWeight: 700, color: c.text }}>
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                                <ChevronRight size={13} style={{ transform: isCollapsed ? 'rotate(0deg)' : 'rotate(90deg)', transition: 'transform 0.15s', color: c.text }} />
                                {g.name}
                              </span>
                            </td>
                            <td style={{ padding: '8px 10px', textAlign: 'right', fontSize: 12, fontFamily: 'monospace', color: '#2563eb', fontWeight: 600 }}>
                              {gDr > 0 ? fmtAmt(gDr) : ''}
                            </td>
                            <td style={{ padding: '8px 10px', textAlign: 'right', fontSize: 12, fontFamily: 'monospace', color: '#16a34a', fontWeight: 600 }}>
                              {gCr > 0 ? fmtAmt(gCr) : ''}
                            </td>
                          </tr>
                          {/* Level-3 items (sub-group or leaf) */}
                          {!isCollapsed && g.items.map(item => renderL3(item))}
                        </React.Fragment>
                      )
                    })}
                    {ungrouped.map(item => renderL3(item))}
                  </tbody>
                </table>
              </div>
            )
          })}

          {/* Grand total */}
          <div className="card" style={{ padding: '12px 18px', display: 'flex', justifyContent: 'flex-end', gap: 32, borderTop: '2px solid var(--card-border)' }}>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: '#2563eb', marginBottom: 2 }}>Grand Total Debit</div>
              <div style={{ fontSize: 17, fontWeight: 800, fontFamily: 'monospace', color: '#2563eb' }}>{fmtAmt(totalDebit)}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: '#16a34a', marginBottom: 2 }}>Grand Total Credit</div>
              <div style={{ fontSize: 17, fontWeight: 800, fontFamily: 'monospace', color: '#16a34a' }}>{fmtAmt(totalCredit)}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
