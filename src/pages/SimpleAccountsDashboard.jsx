/* ═══════════════════════════════════════════════════════════════
   SimpleAccountsDashboard.jsx — Simple Accounts home page
   ═══════════════════════════════════════════════════════════════ */

import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { TrendingUp, TrendingDown, Wallet, RefreshCw, Tag, BarChart3, Settings, ArrowLeftRight, PiggyBank } from 'lucide-react'
import { useToast } from '../lib/toast'
import {
  getDashboardStats, getSimpleAccounts, getAllAccountBalances,
  getSimpleSettings, fmtAmt, fmtDate,
} from '../lib/simpleAccountsLib'
import SimpleAddTransactionModal from '../components/simple-accounts/SimpleAddTransactionModal'

function BigStatCard({ label, value, sub, color, bg, icon: Icon, loading }) {
  return (
    <div className="card" style={{ padding: '20px 22px', borderLeft: `4px solid ${color}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <div style={{ width: 34, height: 34, borderRadius: 9, background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Icon size={16} color={color} />
        </div>
        <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-3)', margin: 0 }}>{label}</p>
      </div>
      {loading
        ? <div className="loading-skeleton" style={{ height: 32, borderRadius: 6, width: '70%', marginBottom: 6 }} />
        : <p style={{ fontSize: 26, fontWeight: 800, color, margin: '0 0 4px', fontFamily: 'monospace', lineHeight: 1 }}>{value}</p>
      }
      <p style={{ fontSize: 11, color: 'var(--text-3)', margin: 0 }}>{sub}</p>
    </div>
  )
}

function AccountCard({ account, balance, currency, loading }) {
  const isBank = account.account_type === 'bank'
  const color  = balance >= 0 ? '#2563eb' : '#dc2626'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: 10 }}>
      <div style={{ width: 36, height: 36, borderRadius: 9, background: isBank ? '#dbeafe' : '#f0fdf4', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Wallet size={16} color={isBank ? '#2563eb' : '#16a34a'} />
      </div>
      <div style={{ flex: 1 }}>
        <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)', margin: '0 0 2px' }}>{account.name}</p>
        <p style={{ fontSize: 10, color: 'var(--text-3)', margin: 0, textTransform: 'capitalize' }}>{account.account_type}</p>
      </div>
      {loading
        ? <div className="loading-skeleton" style={{ height: 20, width: 80, borderRadius: 4 }} />
        : <p style={{ fontSize: 16, fontWeight: 800, color, margin: 0, fontFamily: 'monospace' }}>{fmtAmt(balance, currency)}</p>
      }
    </div>
  )
}

function TxnRow({ txn, currency }) {
  const isIncome = txn.txn_type === 'income'
  const isXfer   = txn.txn_type === 'transfer'
  const color    = isIncome ? '#16a34a' : isXfer ? '#2563eb' : '#dc2626'
  const sign     = isIncome ? '+' : isXfer ? '' : '−'

  return (
    <tr style={{ borderBottom: '1px solid var(--card-border)' }}>
      <td style={{ padding: '10px 16px', fontSize: 12, color: 'var(--text-3)', whiteSpace: 'nowrap' }}>{fmtDate(txn.txn_date)}</td>
      <td style={{ padding: '10px 8px' }}>
        <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: isIncome ? '#dcfce7' : isXfer ? '#dbeafe' : '#fee2e2', color }}>
          {isIncome ? 'IN' : isXfer ? 'TRANSFER' : 'OUT'}
        </span>
      </td>
      <td style={{ padding: '10px 8px', fontSize: 13, color: 'var(--text-1)', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {txn.description || txn.category?.name || '—'}
      </td>
      <td style={{ padding: '10px 8px', fontSize: 11, color: 'var(--text-3)' }}>{txn.category?.name || '—'}</td>
      <td style={{ padding: '10px 16px', fontSize: 14, fontWeight: 700, color, textAlign: 'right', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
        {sign}{fmtAmt(txn.amount, currency)}
      </td>
    </tr>
  )
}

export default function SimpleAccountsDashboard() {
  const navigate = useNavigate()
  const toast    = useToast()

  const [loading,   setLoading]   = useState(true)
  const [stats,     setStats]     = useState(null)
  const [accounts,  setAccounts]  = useState([])
  const [balances,  setBalances]  = useState({})
  const [currency,  setCurrency]  = useState('₹')
  const [defaultAct,setDefaultAct]= useState(null)
  const [modal,     setModal]     = useState(null) // null | 'income' | 'expense' | 'transfer'

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [settings, accts] = await Promise.all([getSimpleSettings(), getSimpleAccounts()])
      setCurrency(settings.currency)
      setDefaultAct(settings.defaultAccount)
      setAccounts(accts)

      const [ds, bals] = await Promise.all([
        getDashboardStats(settings.fiscalMonth),
        getAllAccountBalances(accts),
      ])
      setStats(ds)
      setBalances(bals)
    } catch (e) {
      toast('Failed to load: ' + e.message, 'error')
    }
    setLoading(false)
  }, [toast])

  useEffect(() => { load() }, [load])

  const L = loading

  return (
    <div className="page-container">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <PiggyBank size={22} style={{ color: 'var(--accent)' }} /> Money Book
          </h1>
          <p className="page-subtitle">Simple church accounts — track income and expenses</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={load} title="Refresh" style={{ padding: '8px 10px', background: 'var(--card-bg)', border: '1.5px solid var(--card-border)', borderRadius: 8, cursor: 'pointer', display: 'flex', alignItems: 'center', color: 'var(--text-2)' }}>
            <RefreshCw size={15} />
          </button>
          <button onClick={() => setModal('income')}
            style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 16px', background: '#16a34a', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer', boxShadow: '0 2px 8px rgba(22,163,74,0.3)' }}>
            <TrendingUp size={15} /> + Money In
          </button>
          <button onClick={() => setModal('expense')}
            style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 16px', background: '#dc2626', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer', boxShadow: '0 2px 8px rgba(220,38,38,0.3)' }}>
            <TrendingDown size={15} /> − Money Out
          </button>
        </div>
      </div>

      {/* This Month stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 20 }}>
        <BigStatCard
          label="This Month — Income"
          value={L ? null : fmtAmt(stats?.month.income, currency)}
          sub="Money received this month"
          color="#16a34a" bg="#dcfce7"
          icon={TrendingUp} loading={L}
        />
        <BigStatCard
          label="This Month — Expenses"
          value={L ? null : fmtAmt(stats?.month.expense, currency)}
          sub="Money spent this month"
          color="#dc2626" bg="#fee2e2"
          icon={TrendingDown} loading={L}
        />
        <BigStatCard
          label="This Month — Balance"
          value={L ? null : fmtAmt(stats?.month.balance, currency)}
          sub="Income minus Expenses"
          color={!L && stats?.month.balance < 0 ? '#dc2626' : '#7c3aed'}
          bg="#f3e8ff"
          icon={Wallet} loading={L}
        />
      </div>

      {/* Main two-column layout */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: 20 }}>

        {/* Left — Recent transactions */}
        <div className="card" style={{ overflow: 'hidden' }}>
          <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--card-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)', margin: 0 }}>Recent Transactions</p>
            <button onClick={() => navigate('/simple-accounts/transactions')} style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer' }}>
              View All
            </button>
          </div>

          {L ? (
            <div style={{ padding: 20 }}>
              {[1,2,3,4,5].map(i => <div key={i} className="loading-skeleton" style={{ height: 36, borderRadius: 6, marginBottom: 8 }} />)}
            </div>
          ) : !stats?.recent.length ? (
            <div style={{ padding: '48px 20px', textAlign: 'center', color: 'var(--text-3)' }}>
              <PiggyBank size={32} style={{ opacity: 0.25, marginBottom: 12 }} />
              <p style={{ fontSize: 14, margin: '0 0 4px', color: 'var(--text-2)', fontWeight: 600 }}>No transactions yet</p>
              <p style={{ fontSize: 12, margin: '0 0 20px' }}>Add your first income or expense to get started</p>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                <button onClick={() => setModal('income')} style={{ padding: '8px 16px', background: '#16a34a', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>+ Money In</button>
                <button onClick={() => setModal('expense')} style={{ padding: '8px 16px', background: '#dc2626', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>− Money Out</button>
              </div>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: 'var(--table-header-bg)' }}>
                    {['Date', 'Type', 'Description', 'Category', 'Amount'].map(h => (
                      <th key={h} style={{ padding: '8px 16px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-3)', textAlign: h === 'Amount' ? 'right' : 'left', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {stats.recent.map(t => <TxnRow key={t.id} txn={t} currency={currency} />)}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Right column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Year to Date summary */}
          <div className="card" style={{ padding: '16px 18px' }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', margin: '0 0 12px' }}>
              Year to Date {L ? '' : `(FY ${stats?.fyLabel})`}
            </p>
            {L ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {[1,2,3].map(i => <div key={i} className="loading-skeleton" style={{ height: 28, borderRadius: 6 }} />)}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {[
                  { label: 'Total Income',  value: stats?.ytd.income,  color: '#16a34a' },
                  { label: 'Total Expenses',value: stats?.ytd.expense, color: '#dc2626' },
                  { label: 'Net Surplus',   value: stats?.ytd.balance, color: stats?.ytd.balance >= 0 ? '#2563eb' : '#dc2626' },
                ].map(({ label, value, color }) => (
                  <div key={label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px', background: 'var(--sidebar-item-active-bg)', borderRadius: 8 }}>
                    <span style={{ fontSize: 12, color: 'var(--text-2)', fontWeight: 500 }}>{label}</span>
                    <span style={{ fontSize: 14, fontWeight: 800, color, fontFamily: 'monospace' }}>{fmtAmt(value, currency)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Account balances */}
          {accounts.length > 0 && (
            <div className="card" style={{ overflow: 'hidden' }}>
              <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--card-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', margin: 0 }}>Accounts</p>
                <button onClick={() => navigate('/simple-accounts/accounts')} style={{ fontSize: 11, fontWeight: 600, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer' }}>Manage</button>
              </div>
              <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                {accounts.map(a => (
                  <AccountCard key={a.id} account={a} balance={balances[a.id] ?? 0} currency={currency} loading={L} />
                ))}
              </div>
            </div>
          )}

          {/* Quick links */}
          <div className="card" style={{ overflow: 'hidden' }}>
            <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--card-border)' }}>
              <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', margin: 0 }}>Quick Links</p>
            </div>
            <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 4 }}>
              {[
                { icon: ArrowLeftRight, label: 'Record a Transfer',     color: '#2563eb', onClick: () => setModal('transfer') },
                { icon: BarChart3,      label: 'View Reports',          color: '#7c3aed', onClick: () => navigate('/simple-accounts/reports') },
                { icon: Tag,            label: 'Manage Categories',     color: '#0891b2', onClick: () => navigate('/simple-accounts/categories') },
                { icon: Settings,       label: 'Settings',              color: '#64748b', onClick: () => navigate('/simple-accounts/settings') },
              ].map(({ icon: Icon, label, color, onClick }) => (
                <button key={label} onClick={onClick}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 10px', background: 'transparent', border: 'none', borderRadius: 8, cursor: 'pointer', color: 'var(--text-2)', fontSize: 13, fontWeight: 500, textAlign: 'left', width: '100%', transition: 'background 0.12s' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--sidebar-item-hover)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <Icon size={15} color={color} style={{ flexShrink: 0 }} />
                  {label}
                </button>
              ))}
            </div>
          </div>

        </div>
      </div>

      {modal && (
        <SimpleAddTransactionModal
          initialType={modal}
          defaultAccountId={defaultAct}
          currency={currency}
          onClose={() => setModal(null)}
          onSaved={load}
        />
      )}
    </div>
  )
}
