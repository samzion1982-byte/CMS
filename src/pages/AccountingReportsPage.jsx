/* ═══════════════════════════════════════════════════════════════
   AccountingReportsPage.jsx — Day Book, Account Summary & GL Reports
   ═══════════════════════════════════════════════════════════════ */

import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useToast } from '../lib/toast'
import { supabase } from '../lib/supabase'
import {
  getFY, fyOptions, fmtAmt, fmtDate,
  getJournalEntries, getChartOfAccounts,
  VOUCHER_COLOR, displayAccountType,
} from '../lib/accountingLib'
import {
  ArrowLeft, BookOpen, Calendar, Filter, Download,
  TrendingUp, TrendingDown, BarChart2, Loader2,
  ChevronDown, FileText, Search, X, Scale,
} from 'lucide-react'

// ── Helpers ───────────────────────────────────────────────────────

function VBadge({ type }) {
  const c = VOUCHER_COLOR[type] || { bg: '#f1f5f9', text: '#475569' }
  return <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 99, background: c.bg, color: c.text, whiteSpace: 'nowrap' }}>{type}</span>
}

function TabBtn({ active, onClick, children }) {
  return (
    <button onClick={onClick} style={{
      padding: '8px 18px', borderRadius: 8, cursor: 'pointer',
      fontSize: 13, fontWeight: active ? 700 : 500,
      background: active ? 'var(--accent)' : 'var(--card-bg)',
      color: active ? '#fff' : 'var(--text-2)',
      border: active ? 'none' : '1.5px solid var(--card-border)',
      transition: 'all 0.15s',
    }}>{children}</button>
  )
}

// ════════════════════════════════════════════════════════════════
//  MAIN PAGE
// ════════════════════════════════════════════════════════════════

export default function AccountingReportsPage() {
  const navigate = useNavigate()
  const toast    = useToast()

  const [tab, setTab] = useState('daybook') // 'daybook' | 'account-summary'

  const today = new Date().toISOString().slice(0, 10)
  const monthStart = today.slice(0, 8) + '01'

  // ── Day Book state ────────────────────────────────────────────
  const [dbFrom,    setDbFrom]    = useState(monthStart)
  const [dbTo,      setDbTo]      = useState(today)
  const [dbType,    setDbType]    = useState('')
  const [dbPosted,  setDbPosted]  = useState('true')
  const [dbSearch,  setDbSearch]  = useState('')
  const [dbEntries, setDbEntries] = useState([])
  const [dbLoading, setDbLoading] = useState(false)
  const [dbLines,   setDbLines]   = useState({}) // id → lines[]

  // ── Account Summary state ─────────────────────────────────────
  const [fy,          setFy]          = useState(getFY())
  const [fyOpen,      setFyOpen]      = useState(false)
  const [acTypeFilter, setAcTypeFilter] = useState('')
  const [allAccounts, setAllAccounts] = useState([])
  const [balances,    setBalances]    = useState([])
  const [acLoading,   setAcLoading]   = useState(false)

  const FYS = fyOptions()
  const AC_TYPES = ['Asset', 'Liability', 'Equity', 'Income', 'Expense']

  // ── Load Day Book ─────────────────────────────────────────────
  const loadDayBook = useCallback(async () => {
    if (!dbFrom || !dbTo) return
    setDbLoading(true)
    try {
      const entries = await getJournalEntries({
        from:   dbFrom,
        to:     dbTo,
        type:   dbType || undefined,
        posted: dbPosted === '' ? undefined : dbPosted === 'true',
      })
      setDbEntries(entries)
      setDbLines({})
    } catch (e) { toast(e.message, 'error') }
    setDbLoading(false)
  }, [dbFrom, dbTo, dbType, dbPosted, toast])

  useEffect(() => { if (tab === 'daybook') loadDayBook() }, [tab, loadDayBook])

  // ── Load Account Summary ──────────────────────────────────────
  const loadAccountSummary = useCallback(async () => {
    setAcLoading(true)
    try {
      const [accounts, { data: bals }] = await Promise.all([
        getChartOfAccounts(true),
        supabase.from('account_balances')
          .select('*')
          .eq('financial_year', fy),
      ])
      setAllAccounts(accounts)
      setBalances(bals || [])
    } catch (e) { toast(e.message, 'error') }
    setAcLoading(false)
  }, [fy, toast])

  useEffect(() => { if (tab === 'account-summary') loadAccountSummary() }, [tab, loadAccountSummary])

  // ── Expand row to show entry lines ────────────────────────────
  async function toggleLines(entry) {
    if (dbLines[entry.id]) {
      setDbLines(prev => { const n = { ...prev }; delete n[entry.id]; return n })
      return
    }
    try {
      const { data } = await supabase
        .from('journal_entry_lines')
        .select('*, chart_of_accounts(code, name)')
        .eq('journal_entry_id', entry.id)
        .order('line_number')
      setDbLines(prev => ({ ...prev, [entry.id]: data || [] }))
    } catch (e) { toast(e.message, 'error') }
  }

  // ── Day Book filtered ─────────────────────────────────────────
  const dbFiltered = dbEntries.filter(e => {
    if (!dbSearch) return true
    const q = dbSearch.toLowerCase()
    return e.entry_number.toLowerCase().includes(q) || (e.narration || '').toLowerCase().includes(q)
  })

  const dbTotalDebit  = dbFiltered.reduce((s, e) => s + Number(e.total_debit  || 0), 0)
  const dbTotalCredit = dbFiltered.reduce((s, e) => s + Number(e.total_credit || 0), 0)

  // ── Account Summary filtered ──────────────────────────────────
  const balMap = Object.fromEntries(balances.map(b => [b.account_id, b]))

  const acFiltered = allAccounts
    .filter(a => !acTypeFilter || a.account_type === acTypeFilter)
    .map(a => {
      const b = balMap[a.id]
      return {
        ...a,
        total_debit:  Number(b?.total_debit  || 0),
        total_credit: Number(b?.total_credit || 0),
        opening:      Number(b?.opening_balance || a.opening_balance || 0),
      }
    })
    .filter(a => a.total_debit > 0 || a.total_credit > 0 || a.opening > 0)

  const acByType = AC_TYPES.reduce((acc, t) => {
    acc[t] = acFiltered.filter(a => a.account_type === t)
    return acc
  }, {})

  const TYPE_COLOR_MAP = {
    Asset:     { bg: '#dbeafe', text: '#1d4ed8' },
    Liability: { bg: '#fee2e2', text: '#b91c1c' },
    Equity:    { bg: '#f3e8ff', text: '#7c3aed' },
    Income:    { bg: '#dcfce7', text: '#16a34a' },
    Expense:   { bg: '#fff7ed', text: '#c2410c' },
  }

  return (
    <div className="page-container">

      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={() => navigate('/accounting')} style={{ padding: '6px 8px', background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: 7, cursor: 'pointer', display: 'flex', alignItems: 'center', color: 'var(--text-2)' }}>
            <ArrowLeft size={15} />
          </button>
          <div>
            <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
              <BarChart2 size={20} style={{ color: 'var(--accent)' }} /> GL Reports
            </h1>
            <p className="page-subtitle">Day Book &amp; Account Balance Summary</p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <TabBtn active={tab === 'daybook'}        onClick={() => setTab('daybook')}>Day Book</TabBtn>
          <TabBtn active={tab === 'account-summary'} onClick={() => setTab('account-summary')}>Account Summary</TabBtn>
        </div>
      </div>

      {/* ══════════ DAY BOOK TAB ═══════════════════════════════════ */}
      {tab === 'daybook' && (
        <>
          {/* Filter bar */}
          <div className="card" style={{ padding: '12px 16px', marginBottom: 20, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Calendar size={13} style={{ color: 'var(--text-3)' }} />
              <span style={{ fontSize: 12, color: 'var(--text-3)', fontWeight: 600 }}>From</span>
              <input type="date" value={dbFrom} onChange={e => setDbFrom(e.target.value)}
                style={{ height: 34, padding: '0 10px', border: '1.5px solid var(--card-border)', borderRadius: 7, fontSize: 13, background: 'var(--input-bg)', color: 'var(--text-1)', outline: 'none' }} />
              <span style={{ fontSize: 12, color: 'var(--text-3)' }}>to</span>
              <input type="date" value={dbTo} onChange={e => setDbTo(e.target.value)}
                style={{ height: 34, padding: '0 10px', border: '1.5px solid var(--card-border)', borderRadius: 7, fontSize: 13, background: 'var(--input-bg)', color: 'var(--text-1)', outline: 'none' }} />
            </div>

            <select value={dbType} onChange={e => setDbType(e.target.value)} style={{ height: 34, padding: '0 10px', border: '1.5px solid var(--card-border)', borderRadius: 7, fontSize: 13, background: 'var(--input-bg)', color: 'var(--text-1)', outline: 'none' }}>
              <option value="">All Types</option>
              {['Receipt','Payment','Journal','Contra','Opening'].map(t => <option key={t} value={t}>{t}</option>)}
            </select>

            <select value={dbPosted} onChange={e => setDbPosted(e.target.value)} style={{ height: 34, padding: '0 10px', border: '1.5px solid var(--card-border)', borderRadius: 7, fontSize: 13, background: 'var(--input-bg)', color: 'var(--text-1)', outline: 'none' }}>
              <option value="true">Posted Only</option>
              <option value="false">Drafts Only</option>
              <option value="">All</option>
            </select>

            <div style={{ position: 'relative', flex: 1, minWidth: 180 }}>
              <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }} />
              <input value={dbSearch} onChange={e => setDbSearch(e.target.value)} placeholder="Search…"
                style={{ width: '100%', paddingLeft: 30, paddingRight: 10, height: 34, border: '1.5px solid var(--card-border)', borderRadius: 7, fontSize: 13, background: 'var(--input-bg)', color: 'var(--text-1)', outline: 'none', boxSizing: 'border-box' }} />
              {dbSearch && <button onClick={() => setDbSearch('')} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', display: 'flex' }}><X size={13} /></button>}
            </div>

            <button onClick={loadDayBook} style={{ height: 34, padding: '0 14px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 7, fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
              <Filter size={13} /> Apply
            </button>
          </div>

          {/* Day Book table */}
          <div className="card" style={{ overflow: 'hidden' }}>
            {dbLoading ? (
              <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-3)' }}><Loader2 size={24} className="animate-spin" style={{ display: 'block', margin: '0 auto 8px' }} />Loading day book…</div>
            ) : dbFiltered.length === 0 ? (
              <div style={{ padding: '48px 20px', textAlign: 'center', color: 'var(--text-3)' }}>
                <FileText size={28} style={{ opacity: 0.3, display: 'block', margin: '0 auto 8px' }} />
                <p style={{ margin: 0, fontSize: 13 }}>No entries for this period</p>
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead style={{ background: 'var(--table-header-bg)' }}>
                    <tr>
                      {['Date','Entry #','Type','Narration','Ref No','Debit','Credit','Status',''].map(h => (
                        <th key={h} style={{ padding: '9px 14px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-3)', textAlign: ['Debit','Credit'].includes(h) ? 'right' : 'left', whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {dbFiltered.map((e, i) => (
                      <>
                        <tr key={e.id}
                          style={{ background: i % 2 ? 'rgba(0,0,0,0.012)' : 'transparent', cursor: 'pointer' }}
                          onMouseEnter={ev => ev.currentTarget.style.background = 'var(--sidebar-item-hover)'}
                          onMouseLeave={ev => ev.currentTarget.style.background = i % 2 ? 'rgba(0,0,0,0.012)' : 'transparent'}
                          onClick={() => toggleLines(e)}
                        >
                          <td style={{ padding: '9px 14px', fontSize: 12, color: 'var(--text-2)', whiteSpace: 'nowrap' }}>
                            {e.entry_date ? new Date(e.entry_date + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                          </td>
                          <td style={{ padding: '9px 14px', fontSize: 12, fontWeight: 700, fontFamily: 'monospace', color: 'var(--accent)', whiteSpace: 'nowrap' }}>{e.entry_number}</td>
                          <td style={{ padding: '9px 14px' }}><VBadge type={e.voucher_type} /></td>
                          <td style={{ padding: '9px 14px', fontSize: 12, color: 'var(--text-2)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.narration || '—'}</td>
                          <td style={{ padding: '9px 14px', fontSize: 12, color: 'var(--text-3)' }}>{e.reference_no || '—'}</td>
                          <td style={{ padding: '9px 14px', fontSize: 12, fontFamily: 'monospace', textAlign: 'right', color: '#2563eb' }}>{fmtAmt(e.total_debit)}</td>
                          <td style={{ padding: '9px 14px', fontSize: 12, fontFamily: 'monospace', textAlign: 'right', color: '#16a34a' }}>{fmtAmt(e.total_credit)}</td>
                          <td style={{ padding: '9px 14px' }}>
                            <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 99, background: e.is_posted ? '#dcfce7' : '#fff7ed', color: e.is_posted ? '#16a34a' : '#c2410c' }}>
                              {e.is_posted ? 'Posted' : 'Draft'}
                            </span>
                          </td>
                          <td style={{ padding: '9px 14px', fontSize: 11, color: 'var(--text-3)' }}>
                            <ChevronDown size={13} style={{ transform: dbLines[e.id] ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
                          </td>
                        </tr>
                        {dbLines[e.id] && (
                          <tr key={e.id + '-lines'}>
                            <td colSpan={9} style={{ padding: 0 }}>
                              <table style={{ width: '100%', borderCollapse: 'collapse', background: 'var(--table-header-bg)' }}>
                                <thead>
                                  <tr>
                                    <th style={{ padding: '6px 14px 6px 32px', fontSize: 10, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', textAlign: 'left' }}>Account</th>
                                    <th style={{ padding: '6px 14px', fontSize: 10, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', textAlign: 'left' }}>Description</th>
                                    <th style={{ padding: '6px 14px', fontSize: 10, fontWeight: 700, color: '#2563eb', textTransform: 'uppercase', letterSpacing: '0.06em', textAlign: 'right' }}>Debit</th>
                                    <th style={{ padding: '6px 14px', fontSize: 10, fontWeight: 700, color: '#16a34a', textTransform: 'uppercase', letterSpacing: '0.06em', textAlign: 'right' }}>Credit</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {dbLines[e.id].map(ln => (
                                    <tr key={ln.id}>
                                      <td style={{ padding: '6px 14px 6px 32px', fontSize: 12, color: 'var(--text-1)', borderTop: '1px solid var(--card-border)' }}>
                                        <span style={{ fontSize: 10, color: 'var(--text-3)', fontFamily: 'monospace', marginRight: 6 }}>{ln.chart_of_accounts?.code}</span>
                                        {ln.chart_of_accounts?.name}
                                      </td>
                                      <td style={{ padding: '6px 14px', fontSize: 12, color: 'var(--text-3)', borderTop: '1px solid var(--card-border)' }}>{ln.description || '—'}</td>
                                      <td style={{ padding: '6px 14px', fontSize: 12, fontFamily: 'monospace', textAlign: 'right', color: '#2563eb', borderTop: '1px solid var(--card-border)' }}>{ln.debit_amount > 0 ? fmtAmt(ln.debit_amount) : ''}</td>
                                      <td style={{ padding: '6px 14px', fontSize: 12, fontFamily: 'monospace', textAlign: 'right', color: '#16a34a', borderTop: '1px solid var(--card-border)' }}>{ln.credit_amount > 0 ? fmtAmt(ln.credit_amount) : ''}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </td>
                          </tr>
                        )}
                      </>
                    ))}
                  </tbody>
                  <tfoot style={{ background: 'var(--table-header-bg)', borderTop: '2px solid var(--card-border)' }}>
                    <tr>
                      <td colSpan={5} style={{ padding: '10px 14px', fontSize: 12, fontWeight: 700, color: 'var(--text-2)' }}>
                        Total — {dbFiltered.length} {dbFiltered.length === 1 ? 'entry' : 'entries'}
                      </td>
                      <td style={{ padding: '10px 14px', fontSize: 13, fontWeight: 800, fontFamily: 'monospace', textAlign: 'right', color: '#2563eb' }}>{fmtAmt(dbTotalDebit)}</td>
                      <td style={{ padding: '10px 14px', fontSize: 13, fontWeight: 800, fontFamily: 'monospace', textAlign: 'right', color: '#16a34a' }}>{fmtAmt(dbTotalCredit)}</td>
                      <td colSpan={2} style={{ padding: '10px 14px' }}>
                        {Math.abs(dbTotalDebit - dbTotalCredit) < 0.01
                          ? <span style={{ fontSize: 11, fontWeight: 700, color: '#16a34a' }}>✓ Balanced</span>
                          : <span style={{ fontSize: 11, fontWeight: 700, color: '#c2410c' }}>Diff: {fmtAmt(Math.abs(dbTotalDebit - dbTotalCredit))}</span>
                        }
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* ══════════ ACCOUNT SUMMARY TAB ════════════════════════════ */}
      {tab === 'account-summary' && (
        <>
          {/* Controls */}
          <div className="card" style={{ padding: '12px 16px', marginBottom: 20, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            {/* FY */}
            <div style={{ position: 'relative' }}>
              <button onClick={() => setFyOpen(o => !o)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', background: 'var(--card-bg)', border: '1.5px solid var(--card-border)', borderRadius: 7, fontSize: 13, fontWeight: 600, cursor: 'pointer', color: 'var(--text-1)' }}>
                FY {fy} <ChevronDown size={13} />
              </button>
              {fyOpen && (
                <div style={{ position: 'absolute', top: '110%', left: 0, background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: 9, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', zIndex: 50, minWidth: 140 }}>
                  {FYS.map(f => (
                    <button key={f} onClick={() => { setFy(f); setFyOpen(false) }} style={{ display: 'block', width: '100%', padding: '9px 16px', fontSize: 13, textAlign: 'left', background: f === fy ? 'var(--sidebar-item-active-bg)' : 'transparent', color: f === fy ? 'var(--accent)' : 'var(--text-1)', fontWeight: f === fy ? 700 : 400, border: 'none', cursor: 'pointer' }}>FY {f}</button>
                  ))}
                </div>
              )}
            </div>
            <select value={acTypeFilter} onChange={e => setAcTypeFilter(e.target.value)} style={{ height: 34, padding: '0 10px', border: '1.5px solid var(--card-border)', borderRadius: 7, fontSize: 13, background: 'var(--input-bg)', color: 'var(--text-1)', outline: 'none' }}>
              <option value="">All Account Types</option>
              {AC_TYPES.map(t => <option key={t} value={t}>{displayAccountType(t)}</option>)}
            </select>
            <span style={{ fontSize: 12, color: 'var(--text-3)', marginLeft: 'auto' }}>
              {acFiltered.length} active accounts
            </span>
          </div>

          {acLoading ? (
            <div className="card" style={{ padding: 48, textAlign: 'center', color: 'var(--text-3)' }}>
              <Loader2 size={24} className="animate-spin" style={{ display: 'block', margin: '0 auto 8px' }} />Loading account balances…
            </div>
          ) : acFiltered.length === 0 ? (
            <div className="card" style={{ padding: '48px 20px', textAlign: 'center', color: 'var(--text-3)' }}>
              <Scale size={28} style={{ opacity: 0.3, display: 'block', margin: '0 auto 8px' }} />
              <p style={{ margin: 0, fontSize: 13 }}>No account balances for FY {fy}</p>
              <p style={{ margin: '6px 0 0', fontSize: 12 }}>Post some journal entries to see balances here.</p>
            </div>
          ) : (
            <>
              {AC_TYPES.filter(t => !acTypeFilter || t === acTypeFilter).map(type => {
                const accounts = acByType[type] || []
                if (accounts.length === 0) return null
                const tc = TYPE_COLOR_MAP[type]
                const totalDr = accounts.reduce((s, a) => s + a.total_debit, 0)
                const totalCr = accounts.reduce((s, a) => s + a.total_credit, 0)
                return (
                  <div key={type} className="card" style={{ marginBottom: 16, overflow: 'hidden' }}>
                    <div style={{ padding: '12px 16px', background: tc.bg, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: tc.text }}>{displayAccountType(type)} Accounts</span>
                      <div style={{ display: 'flex', gap: 24, fontSize: 12, fontFamily: 'monospace' }}>
                        <span style={{ color: '#2563eb' }}>Dr: {fmtAmt(totalDr)}</span>
                        <span style={{ color: '#16a34a' }}>Cr: {fmtAmt(totalCr)}</span>
                      </div>
                    </div>
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead style={{ background: 'var(--table-header-bg)' }}>
                          <tr>
                            {['Code','Account Name','Level','Opening Balance','Total Debit','Total Credit','Net Balance',''].map(h => (
                              <th key={h} style={{ padding: '8px 14px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-3)', textAlign: ['Opening Balance','Total Debit','Total Credit','Net Balance'].includes(h) ? 'right' : 'left', whiteSpace: 'nowrap' }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {accounts.map((a, i) => {
                            const net = ['Asset','Expense'].includes(a.account_type)
                              ? a.opening + a.total_debit - a.total_credit
                              : a.opening + a.total_credit - a.total_debit
                            return (
                              <tr key={a.id}
                                style={{ background: i % 2 ? 'rgba(0,0,0,0.012)' : 'transparent', cursor: 'pointer' }}
                                onMouseEnter={ev => ev.currentTarget.style.background = 'var(--sidebar-item-hover)'}
                                onMouseLeave={ev => ev.currentTarget.style.background = i % 2 ? 'rgba(0,0,0,0.012)' : 'transparent'}
                                onClick={() => navigate(`/accounting/ledger?account=${a.id}`)}
                              >
                                <td style={{ padding: '9px 14px', fontSize: 11, fontFamily: 'monospace', color: 'var(--text-3)' }}>{a.code}</td>
                                <td style={{ padding: '9px 14px', fontSize: 13, color: 'var(--text-1)', fontWeight: 500 }}>
                                  {a.level > 1 && <span style={{ display: 'inline-block', width: (a.level - 1) * 16, flexShrink: 0 }} />}
                                  {a.name}
                                </td>
                                <td style={{ padding: '9px 14px', fontSize: 11, color: 'var(--text-3)' }}>L{a.level}</td>
                                <td style={{ padding: '9px 14px', fontSize: 12, fontFamily: 'monospace', textAlign: 'right', color: 'var(--text-2)' }}>{a.opening !== 0 ? fmtAmt(a.opening) : '—'}</td>
                                <td style={{ padding: '9px 14px', fontSize: 12, fontFamily: 'monospace', textAlign: 'right', color: '#2563eb' }}>{a.total_debit > 0 ? fmtAmt(a.total_debit) : '—'}</td>
                                <td style={{ padding: '9px 14px', fontSize: 12, fontFamily: 'monospace', textAlign: 'right', color: '#16a34a' }}>{a.total_credit > 0 ? fmtAmt(a.total_credit) : '—'}</td>
                                <td style={{ padding: '9px 14px', fontSize: 13, fontFamily: 'monospace', textAlign: 'right', fontWeight: 700, color: net >= 0 ? 'var(--text-1)' : '#b91c1c' }}>
                                  {fmtAmt(Math.abs(net))}{net < 0 ? ' (Cr)' : ''}
                                </td>
                                <td style={{ padding: '9px 14px', fontSize: 11, color: 'var(--accent)' }}>
                                  Ledger →
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )
              })}
            </>
          )}
        </>
      )}
    </div>
  )
}
