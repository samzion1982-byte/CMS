/* ═══════════════════════════════════════════════════════════════
   AccountingPage.jsx — Accounting Dashboard (Finance → Accounts)
   ═══════════════════════════════════════════════════════════════ */

import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { useToast } from '../lib/toast'
import {
  getFY, fyOptions, fmtAmt,
  getAccountingStats, getJournalEntries, getChartOfAccounts,
  isAccountingEnabled, TYPE_COLOR, VOUCHER_COLOR,
} from '../lib/accountingLib'
import {
  BookOpen, Settings, TrendingUp, TrendingDown, Scale, IndianRupee,
  FileText, PlusCircle, List, ChevronRight, AlertCircle,
  BarChart2, BookMarked, ClipboardList, Wallet, RefreshCw,
  ChevronDown, Landmark,
} from 'lucide-react'

// ── Stat Card ────────────────────────────────────────────────────

function StatCard({ icon: Icon, label, value, sub, iconBg, iconColor, loading, trend }) {
  return (
    <div className="card" style={{ padding: '18px 20px', display: 'flex', alignItems: 'center', gap: 16 }}>
      <div style={{ width: 52, height: 52, borderRadius: 14, flexShrink: 0, background: iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Icon size={22} color={iconColor} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-3)', margin: '0 0 4px' }}>{label}</p>
        <p style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-1)', lineHeight: 1.1, margin: '0 0 3px', fontFamily: 'monospace' }}>
          {loading ? <span className="loading-skeleton" style={{ display: 'inline-block', width: 100, height: 22, borderRadius: 6 }} /> : (value ?? '—')}
        </p>
        <p style={{ fontSize: 11, color: 'var(--text-3)', margin: 0 }}>{loading ? '' : sub}</p>
      </div>
      {trend !== undefined && !loading && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 11, fontWeight: 600, color: trend >= 0 ? '#16a34a' : '#dc2626' }}>
          {trend >= 0 ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
          {fmtAmt(Math.abs(trend))}
        </div>
      )}
    </div>
  )
}

// ── Quick Action Button ───────────────────────────────────────────

function QuickBtn({ icon: Icon, label, desc, onClick, color = '#2563eb' }) {
  const [hov, setHov] = useState(false)
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 14,
        width: '100%', padding: '12px 16px',
        background: hov ? `${color}10` : 'transparent',
        border: `1px solid ${hov ? color + '40' : 'var(--card-border)'}`,
        borderRadius: 10, cursor: 'pointer', textAlign: 'left',
        transition: 'all 0.15s ease',
        transform: hov ? 'translateX(3px)' : 'none',
      }}
    >
      <div style={{ width: 36, height: 36, borderRadius: 9, background: `${color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Icon size={17} color={color} />
      </div>
      <div style={{ flex: 1 }}>
        <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)', margin: 0 }}>{label}</p>
        <p style={{ fontSize: 11, color: 'var(--text-3)', margin: 0 }}>{desc}</p>
      </div>
      <ChevronRight size={14} color="var(--text-3)" />
    </button>
  )
}

// ── Type Badge ────────────────────────────────────────────────────

function TypeBadge({ type, map }) {
  const c = map[type] || { bg: '#f1f5f9', text: '#475569' }
  return (
    <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: c.bg, color: c.text, letterSpacing: '0.05em' }}>
      {type}
    </span>
  )
}

// ── Account Type Summary ──────────────────────────────────────────

const TYPE_VARS = {
  Asset:     { bg: 'var(--info-subtle)',    border: 'var(--info-border)',    text: 'var(--info)'    },
  Liability: { bg: 'var(--danger-subtle)',  border: 'var(--danger-border)',  text: 'var(--danger)'  },
  Equity:    { bg: 'var(--success-subtle)', border: 'var(--success-border)', text: 'var(--success)' },
  Income:    { bg: 'var(--success-subtle)', border: 'var(--success-border)', text: 'var(--success)' },
  Expense:   { bg: 'var(--warning-subtle)', border: 'var(--warning-border)', text: 'var(--warning)' },
}

function TypeSummaryCard({ type, count, loading }) {
  const c = TYPE_VARS[type] || { bg: 'var(--card-bg)', border: 'var(--card-border)', text: 'var(--text-2)' }
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: c.bg, borderRadius: 8, border: `1px solid ${c.border}` }}>
      <div style={{ width: 8, height: 8, borderRadius: '50%', background: c.text, flexShrink: 0 }} />
      <span style={{ fontSize: 12, fontWeight: 600, color: c.text, flex: 1 }}>{type}</span>
      <span style={{ fontSize: 16, fontWeight: 800, color: c.text }}>
        {loading ? '—' : count}
      </span>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════
//  MAIN PAGE
// ════════════════════════════════════════════════════════════════

export default function AccountingPage() {
  const { profile } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()

  const [enabled,   setEnabled]   = useState(null) // null = loading
  const [fy,        setFy]        = useState(getFY())
  const [stats,     setStats]     = useState(null)
  const [accounts,  setAccounts]  = useState([])
  const [entries,   setEntries]   = useState([])
  const [loading,   setLoading]   = useState(true)
  const [fyOpen,    setFyOpen]    = useState(false)
  const FYS = fyOptions()

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const on = await isAccountingEnabled()
      setEnabled(on)
      if (!on) { setLoading(false); return }
      const [s, accts, ents] = await Promise.all([
        getAccountingStats(fy),
        getChartOfAccounts(true),
        getJournalEntries({ fy }),
      ])
      setStats(s)
      setAccounts(accts)
      setEntries(ents.slice(0, 8))
    } catch (e) {
      toast('Failed to load accounting data: ' + e.message, 'error')
    }
    setLoading(false)
  }, [fy, toast])

  useEffect(() => { load() }, [load])

  // ── Account type counts ────────────────────────────────────────
  const typeCounts = ['Asset', 'Liability', 'Equity', 'Income', 'Expense'].reduce((acc, t) => {
    acc[t] = accounts.filter(a => a.account_type === t).length
    return acc
  }, {})

  // ── Disabled state ─────────────────────────────────────────────
  if (enabled === false) {
    return (
      <div className="page-container">
        <div className="page-header">
          <div>
            <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Landmark size={22} style={{ color: 'var(--accent)' }} /> Accounts
            </h1>
            <p className="page-subtitle">Double-entry accounting for your church</p>
          </div>
        </div>
        <div className="card" style={{ padding: '60px 40px', textAlign: 'center' }}>
          <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#fff7ed', border: '2px solid #fed7aa', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
            <BookOpen size={28} color="#f97316" />
          </div>
          <h3 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-1)', margin: '0 0 8px' }}>Accounting Module is Disabled</h3>
          <p style={{ fontSize: 13, color: 'var(--text-3)', maxWidth: 420, margin: '0 auto 24px', lineHeight: 1.6 }}>
            The accounting module is currently turned off. Enable it from Church Setup if your church manages accounts here.
          </p>
          <button
            onClick={() => navigate('/church-setup')}
            style={{ background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 24px', fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8 }}
          >
            <Settings size={15} /> Go to Church Setup
          </button>
        </div>
      </div>
    )
  }

  const L = loading || enabled === null

  return (
    <div className="page-container">

      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="page-header">
        <div>
          <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Landmark size={22} style={{ color: 'var(--accent)' }} /> Accounts
          </h1>
          <p className="page-subtitle">Financial overview &amp; accounting management</p>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {/* FY Selector */}
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setFyOpen(o => !o)}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', background: 'var(--card-bg)', border: '1.5px solid var(--card-border)', borderRadius: 8, fontSize: 13, fontWeight: 600, color: 'var(--text-1)', cursor: 'pointer' }}
            >
              FY {fy} <ChevronDown size={13} />
            </button>
            {fyOpen && (
              <div style={{ position: 'absolute', top: '110%', right: 0, background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: 9, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', zIndex: 50, minWidth: 140, overflow: 'hidden' }}>
                {FYS.map(f => (
                  <button key={f} onClick={() => { setFy(f); setFyOpen(false) }}
                    style={{ display: 'block', width: '100%', padding: '9px 16px', fontSize: 13, textAlign: 'left', background: f === fy ? 'var(--sidebar-item-active-bg)' : 'transparent', color: f === fy ? 'var(--accent)' : 'var(--text-1)', fontWeight: f === fy ? 700 : 400, border: 'none', cursor: 'pointer' }}>
                    FY {f}
                  </button>
                ))}
              </div>
            )}
          </div>

          <button onClick={load} title="Refresh" style={{ padding: '8px 10px', background: 'var(--card-bg)', border: '1.5px solid var(--card-border)', borderRadius: 8, cursor: 'pointer', display: 'flex', alignItems: 'center', color: 'var(--text-2)' }}>
            <RefreshCw size={15} />
          </button>

          <button
            onClick={() => navigate('/accounting/journal-entry/new')}
            style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 16px', background: 'var(--accent)', color: 'var(--accent-text)', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', boxShadow: '0 2px 8px var(--accent-ring)' }}
          >
            <PlusCircle size={15} /> New Entry
          </button>

          <button
            onClick={() => navigate('/accounting/settings')}
            title="Accounting Settings"
            style={{ padding: '8px 10px', background: 'var(--card-bg)', border: '1.5px solid var(--card-border)', borderRadius: 8, cursor: 'pointer', display: 'flex', alignItems: 'center', color: 'var(--text-2)' }}
          >
            <Settings size={15} />
          </button>
        </div>
      </div>

      {/* Draft entries warning */}
      {!L && stats?.draftEntries > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 8, marginBottom: 20, fontSize: 13, color: '#c2410c' }}>
          <AlertCircle size={16} />
          <span><strong>{stats.draftEntries}</strong> draft {stats.draftEntries === 1 ? 'entry' : 'entries'} pending posting. Post them to update balances.</span>
          <button onClick={() => navigate('/accounting/journal-entries')} style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 600, color: '#c2410c', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>View All</button>
        </div>
      )}

      {/* ── Stats Row ───────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 16, marginBottom: 24 }}>
        <StatCard icon={Wallet}      label="Total Assets"      value={L ? null : fmtAmt(stats?.totalAssets)}      sub="All asset accounts"          iconBg="#dbeafe" iconColor="#2563eb" loading={L} />
        <StatCard icon={Scale}       label="Total Liabilities" value={L ? null : fmtAmt(stats?.totalLiabilities)} sub="All liability accounts"      iconBg="#fee2e2" iconColor="#b91c1c" loading={L} />
        <StatCard icon={TrendingUp}  label="Total Income"      value={L ? null : fmtAmt(stats?.totalIncome)}      sub={`FY ${fy}`}                  iconBg="#dcfce7" iconColor="#16a34a" loading={L} />
        <StatCard icon={TrendingDown}label="Total Expenses"    value={L ? null : fmtAmt(stats?.totalExpenses)}    sub={`FY ${fy}`}                  iconBg="#fff7ed" iconColor="#c2410c" loading={L} />
        <StatCard icon={IndianRupee} label="Net Income"        value={L ? null : fmtAmt(stats?.netIncome)}        sub="Income minus Expenses"       iconBg="#f3e8ff" iconColor="#7c3aed" loading={L} trend={L ? undefined : stats?.netIncome} />
      </div>

      {/* ── Main 2-col layout ───────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 20, marginBottom: 24 }}>

        {/* Left — Recent Journal Entries */}
        <div className="card" style={{ overflow: 'hidden' }}>
          <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--card-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 32, height: 32, borderRadius: 8, background: '#dbeafe', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <FileText size={15} color="#2563eb" />
              </div>
              <div>
                <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)', margin: 0 }}>Recent Journal Entries</p>
                <p style={{ fontSize: 11, color: 'var(--text-3)', margin: 0 }}>FY {fy}</p>
              </div>
            </div>
            <button onClick={() => navigate('/accounting/journal-entries')} style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
              View All <ChevronRight size={13} />
            </button>
          </div>

          {L ? (
            <div style={{ padding: 20 }}>
              {[1,2,3,4].map(i => <div key={i} className="loading-skeleton" style={{ height: 36, borderRadius: 6, marginBottom: 8 }} />)}
            </div>
          ) : entries.length === 0 ? (
            <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-3)' }}>
              <FileText size={28} style={{ opacity: 0.3, marginBottom: 8 }} />
              <p style={{ fontSize: 13, margin: 0 }}>No entries yet for FY {fy}</p>
              <button onClick={() => navigate('/accounting/journal-entry/new')} style={{ marginTop: 12, fontSize: 12, fontWeight: 600, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer' }}>
                Create first entry
              </button>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead style={{ background: 'var(--table-header-bg)' }}>
                  <tr>
                    {['Entry #', 'Date', 'Type', 'Narration', 'Debit', 'Credit', 'Status'].map(h => (
                      <th key={h} style={{ padding: '8px 14px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-3)', textAlign: h === 'Debit' || h === 'Credit' ? 'right' : 'left', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {entries.map((e, i) => (
                    <tr key={e.id}
                      onClick={() => navigate(`/accounting/journal-entries/${e.id}`)}
                      style={{ background: i % 2 ? 'rgba(0,0,0,0.012)' : 'transparent', cursor: 'pointer' }}
                      onMouseEnter={ev => ev.currentTarget.style.background = 'var(--sidebar-item-hover)'}
                      onMouseLeave={ev => ev.currentTarget.style.background = i % 2 ? 'rgba(0,0,0,0.012)' : 'transparent'}
                    >
                      <td style={{ padding: '9px 14px', fontSize: 12, fontWeight: 600, color: 'var(--accent)', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>{e.entry_number}</td>
                      <td style={{ padding: '9px 14px', fontSize: 12, color: 'var(--text-2)', whiteSpace: 'nowrap' }}>
                        {e.entry_date ? new Date(e.entry_date + 'T00:00:00').toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' }) : '—'}
                      </td>
                      <td style={{ padding: '9px 14px' }}><TypeBadge type={e.voucher_type} map={VOUCHER_COLOR} /></td>
                      <td style={{ padding: '9px 14px', fontSize: 12, color: 'var(--text-2)', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.narration || '—'}</td>
                      <td style={{ padding: '9px 14px', fontSize: 12, fontFamily: 'monospace', textAlign: 'right', color: '#2563eb' }}>{fmtAmt(e.total_debit)}</td>
                      <td style={{ padding: '9px 14px', fontSize: 12, fontFamily: 'monospace', textAlign: 'right', color: '#16a34a' }}>{fmtAmt(e.total_credit)}</td>
                      <td style={{ padding: '9px 14px' }}>
                        <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: e.is_posted ? '#dcfce7' : '#fff7ed', color: e.is_posted ? '#16a34a' : '#c2410c' }}>
                          {e.is_posted ? 'Posted' : 'Draft'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Right — Quick Actions + COA Summary */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Quick Actions */}
          <div className="card" style={{ overflow: 'hidden' }}>
            <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--card-border)', display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 32, height: 32, borderRadius: 8, background: '#f3e8ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <BarChart2 size={15} color="#7c3aed" />
              </div>
              <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)', margin: 0 }}>Quick Actions</p>
            </div>
            <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 6 }}>
              <QuickBtn icon={PlusCircle}    label="New Journal Entry"  desc="Record a transaction"       onClick={() => navigate('/accounting/journal-entry/new')}   color="#2563eb" />
              <QuickBtn icon={BookMarked}    label="Chart of Accounts"  desc="Manage account heads"       onClick={() => navigate('/accounting/chart-of-accounts')}   color="#16a34a" />
              <QuickBtn icon={ClipboardList} label="Ledger"             desc="View account transactions"  onClick={() => navigate('/accounting/ledger')}               color="#7c3aed" />
              <QuickBtn icon={Scale}         label="Trial Balance"      desc="Verify debit = credit"      onClick={() => navigate('/accounting/trial-balance')}        color="#c2410c" />
              <QuickBtn icon={BarChart2}     label="Income Statement"   desc="Profit &amp; Loss report"       onClick={() => navigate('/accounting/statements')}           color="#0891b2" />
              <QuickBtn icon={List}          label="Balance Sheet"      desc="Assets vs Liabilities"      onClick={() => navigate('/accounting/statements?tab=bs')}    color="#065f46" />
            </div>
          </div>

          {/* COA Summary */}
          <div className="card" style={{ overflow: 'hidden' }}>
            <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--card-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 32, height: 32, borderRadius: 8, background: '#dcfce7', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <BookOpen size={15} color="#16a34a" />
                </div>
                <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)', margin: 0 }}>Accounts</p>
              </div>
              <button onClick={() => navigate('/accounting/chart-of-accounts')} style={{ fontSize: 11, fontWeight: 600, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer' }}>Manage</button>
            </div>
            <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 6 }}>
              {['Asset', 'Liability', 'Equity', 'Income', 'Expense'].map(t => (
                <TypeSummaryCard key={t} type={t} count={typeCounts[t] || 0} loading={L} />
              ))}
              <p style={{ fontSize: 11, color: 'var(--text-3)', textAlign: 'center', margin: '4px 0 0' }}>
                {L ? '' : `${accounts.length} active accounts total`}
              </p>
            </div>
          </div>

        </div>
      </div>

    </div>
  )
}
