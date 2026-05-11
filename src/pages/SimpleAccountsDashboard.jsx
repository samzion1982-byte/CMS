/* ═══════════════════════════════════════════════════════════════
   SimpleAccountsDashboard.jsx — Simple Accounts home page
   ═══════════════════════════════════════════════════════════════ */

import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  TrendingUp, TrendingDown, Wallet, RefreshCw,
  Tag, BarChart3, Settings, ArrowLeftRight, Building2,
} from 'lucide-react'
import { useToast } from '../lib/toast'
import {
  getDashboardStats, getSimpleAccounts, getAllAccountBalances,
  getSimpleSettings, fmtAmt, fmtDate, txnLabel,
} from '../lib/simpleAccountsLib'
import SimpleAddTransactionModal from '../components/simple-accounts/SimpleAddTransactionModal'

// Card showing cumulative total at top + individual breakdown below
function BalanceGroupCard({ label, accounts, balances, currency, color, bg, icon: Icon, loading }) {
  const total = accounts.reduce((s, a) => s + (balances[a.id] ?? 0), 0)
  return (
    <div className="card" style={{ padding: '20px 22px', flex: 1 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <div style={{ width: 32, height: 32, borderRadius: 8, background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Icon size={16} color={color} />
        </div>
        <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-3)', margin: 0 }}>{label}</p>
      </div>

      {/* Cumulative total */}
      {loading
        ? <div className="loading-skeleton" style={{ height: 34, borderRadius: 6, width: '65%', marginBottom: 12 }} />
        : <p style={{ fontSize: 30, fontWeight: 900, color, margin: '0 0 12px', fontFamily: 'monospace', lineHeight: 1 }}>
            {fmtAmt(total, currency)}
          </p>
      }

      {/* Individual account breakdown */}
      {accounts.length > 0 && (
        <div style={{ borderTop: '1px solid var(--card-border)', paddingTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {accounts.map(a => {
            const bal = balances[a.id] ?? 0
            return (
              <div key={a.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 12, color: 'var(--text-2)' }}>{a.name}</span>
                {loading
                  ? <div className="loading-skeleton" style={{ height: 14, width: 64, borderRadius: 3 }} />
                  : <span style={{ fontSize: 12, fontWeight: 700, color: bal >= 0 ? color : '#dc2626', fontFamily: 'monospace' }}>
                      {fmtAmt(bal, currency)}
                    </span>
                }
              </div>
            )
          })}
        </div>
      )}

      {accounts.length === 0 && (
        <p style={{ fontSize: 11, color: 'var(--text-3)', margin: 0, fontStyle: 'italic' }}>No accounts set up</p>
      )}
    </div>
  )
}

function StatCard({ label, value, color, bg, icon: Icon, loading }) {
  return (
    <div className="card" style={{ padding: '16px 18px', flex: 1, borderTop: `3px solid ${color}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <div style={{ width: 26, height: 26, borderRadius: 7, background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon size={13} color={color} />
        </div>
        <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-3)', margin: 0 }}>{label}</p>
      </div>
      {loading
        ? <div className="loading-skeleton" style={{ height: 24, borderRadius: 5, width: '65%' }} />
        : <p style={{ fontSize: 20, fontWeight: 800, color, margin: 0, fontFamily: 'monospace', lineHeight: 1 }}>{value}</p>
      }
    </div>
  )
}

function QuickLink({ icon: Icon, label, color, onClick }) {
  const [hov, setHov] = useState(false)
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      className="no-lift"
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        width: '100%', padding: '9px 10px',
        background: hov ? 'var(--text-1)' : 'transparent',
        border: 'none', borderRadius: 8, cursor: 'pointer', textAlign: 'left',
      }}
    >
      <Icon size={14} color={hov ? '#fff' : color} style={{ flexShrink: 0 }} />
      <span style={{ fontSize: 13, fontWeight: 500, color: hov ? '#fff' : 'var(--text-2)' }}>{label}</span>
    </button>
  )
}

function TxnRow({ txn, currency }) {
  const lbl = txnLabel(txn)
  const acctLabel = txn.txn_type === 'transfer'
    ? `${txn.account?.name || '?'} → ${txn.to_account?.name || '?'}`
    : (txn.account?.name || '—')
  return (
    <tr style={{ borderBottom: '1px solid var(--card-border)' }}>
      <td style={{ padding: '10px 16px', fontSize: 12, color: 'var(--text-3)', whiteSpace: 'nowrap' }}>{fmtDate(txn.txn_date)}</td>
      <td style={{ padding: '10px 8px' }}>
        <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: lbl.bg, color: lbl.color, whiteSpace: 'nowrap' }}>
          {lbl.label}
        </span>
      </td>
      <td style={{ padding: '10px 8px', fontSize: 13, color: 'var(--text-1)', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {txn.description || txn.category?.name || acctLabel}
      </td>
      <td style={{ padding: '10px 8px', fontSize: 11, color: 'var(--text-3)', whiteSpace: 'nowrap', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {txn.txn_type === 'transfer' ? acctLabel : (txn.account?.name || '—')}
      </td>
      <td style={{ padding: '10px 16px', fontSize: 14, fontWeight: 700, color: lbl.color, textAlign: 'right', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
        {lbl.sign}{fmtAmt(txn.amount, currency)}
      </td>
    </tr>
  )
}

export default function SimpleAccountsDashboard() {
  const navigate = useNavigate()
  const toast    = useToast()

  const [loading,    setLoading]    = useState(true)
  const [stats,      setStats]      = useState(null)
  const [accounts,   setAccounts]   = useState([])
  const [balances,   setBalances]   = useState({})
  const [currency,   setCurrency]   = useState('₹')
  const [defaultAct, setDefaultAct] = useState(null)
  const [modal,      setModal]      = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [settings, accts] = await Promise.all([getSimpleSettings(), getSimpleAccounts()])
      setCurrency(settings.currency)
      setDefaultAct(settings.defaultAccount)
      setAccounts(accts)
      const [ds, bals] = await Promise.all([getDashboardStats(), getAllAccountBalances(accts)])
      setStats(ds)
      setBalances(bals)
    } catch (e) {
      toast('Failed to load: ' + e.message, 'error')
    }
    setLoading(false)
  }, [toast])

  useEffect(() => { load() }, [load])

  const L = loading

  const cashAccounts  = accounts.filter(a => a.account_type === 'cash')
  const bankAccounts  = accounts.filter(a => a.account_type === 'bank')
  const otherAccounts = accounts.filter(a => a.account_type !== 'cash' && a.account_type !== 'bank')
  const cashTotal     = cashAccounts.reduce((s, a)  => s + (balances[a.id] ?? 0), 0)
  const bankTotal     = bankAccounts.reduce((s, a)  => s + (balances[a.id] ?? 0), 0)
  const otherTotal    = otherAccounts.reduce((s, a) => s + (balances[a.id] ?? 0), 0)
  const grandTotal    = cashTotal + bankTotal + otherTotal

  return (
    <div className="page-container simple-accounts-scope">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Wallet size={22} style={{ color: 'var(--accent)' }} /> Money Book
          </h1>
          <p className="page-subtitle">Simple church accounts — receipts, payments and bank movements</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => setModal('transfer')}
            style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 14px', background: 'var(--card-bg)', color: '#2563eb', border: '1.5px solid #93c5fd', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
            <ArrowLeftRight size={14} /> Transfer
          </button>
          <button onClick={() => setModal('expense')}
            style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 14px', background: '#dc2626', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
            <TrendingDown size={14} /> Payment
          </button>
          <button onClick={() => setModal('income')}
            style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 14px', background: '#16a34a', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
            <TrendingUp size={14} /> Receipt
          </button>
          <button onClick={load} title="Refresh"
            style={{ padding: '8px 10px', background: 'var(--card-bg)', border: '1.5px solid var(--card-border)', borderRadius: 8, cursor: 'pointer', display: 'flex', alignItems: 'center', color: 'var(--text-2)' }}>
            <RefreshCw size={15} />
          </button>
          <button onClick={() => navigate('/simple-accounts/settings')} title="Settings"
            style={{ padding: '8px 10px', background: 'var(--card-bg)', border: '1.5px solid var(--card-border)', borderRadius: 8, cursor: 'pointer', display: 'flex', alignItems: 'center', color: 'var(--text-2)' }}>
            <Settings size={15} />
          </button>
        </div>
      </div>

      {/* ── Balance cards: Cash + Bank (+ Other if any) ─── */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
        <BalanceGroupCard
          label="Cash & Petty Cash"
          accounts={cashAccounts}
          balances={balances}
          currency={currency}
          color="#16a34a" bg="#dcfce7"
          icon={Wallet}
          loading={L}
        />
        <BalanceGroupCard
          label="Bank Accounts"
          accounts={bankAccounts}
          balances={balances}
          currency={currency}
          color="#2563eb" bg="#dbeafe"
          icon={Building2}
          loading={L}
        />
        {/* Net Balance card */}
        <div className="card" style={{ padding: '20px 22px', minWidth: 200 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: '#f3e8ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Wallet size={16} color="#7c3aed" />
            </div>
            <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-3)', margin: 0 }}>Total Funds</p>
          </div>
          {L
            ? <div className="loading-skeleton" style={{ height: 34, borderRadius: 6, width: '65%', marginBottom: 12 }} />
            : <p style={{ fontSize: 30, fontWeight: 900, color: '#7c3aed', margin: '0 0 12px', fontFamily: 'monospace', lineHeight: 1 }}>
                {fmtAmt(grandTotal, currency)}
              </p>
          }
          <div style={{ borderTop: '1px solid var(--card-border)', paddingTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 11, color: 'var(--text-3)' }}>Net surplus</span>
              {L ? <div className="loading-skeleton" style={{ height: 14, width: 60, borderRadius: 3 }} />
                 : <span style={{ fontSize: 12, fontWeight: 700, color: (stats?.total.balance ?? 0) >= 0 ? '#16a34a' : '#dc2626', fontFamily: 'monospace' }}>
                     {fmtAmt(stats?.total.balance ?? 0, currency)}
                   </span>
              }
            </div>
            {otherAccounts.length > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 11, color: 'var(--text-3)' }}>Other accounts</span>
                {L ? <div className="loading-skeleton" style={{ height: 14, width: 60, borderRadius: 3 }} />
                   : <span style={{ fontSize: 12, fontWeight: 700, color: '#7c3aed', fontFamily: 'monospace' }}>{fmtAmt(otherTotal, currency)}</span>
                }
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Cumulative stats ───────────────────────────────── */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
        <StatCard label="Total Receipts"   value={L ? null : fmtAmt(stats?.total.income,    currency)} color="#16a34a" bg="#dcfce7" icon={TrendingUp}     loading={L} />
        <StatCard label="Total Payments"   value={L ? null : fmtAmt(stats?.total.expense,   currency)} color="#dc2626" bg="#fee2e2" icon={TrendingDown}   loading={L} />
        <StatCard label="Bank Deposits"    value={L ? null : fmtAmt(stats?.deposits ?? 0,   currency)} color="#2563eb" bg="#dbeafe" icon={ArrowLeftRight} loading={L} />
        <StatCard label="Bank Withdrawals" value={L ? null : fmtAmt(stats?.withdrawals ?? 0,currency)} color="#ea580c" bg="#ffedd5" icon={ArrowLeftRight} loading={L} />
      </div>

      {/* ── Main 2-column layout ──────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 250px', gap: 20 }}>

        {/* Recent transactions */}
        <div className="card" style={{ overflow: 'hidden' }}>
          <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--card-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)', margin: 0 }}>Recent Transactions</p>
            <button onClick={() => navigate('/simple-accounts/transactions')}
              style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer' }}>
              View All →
            </button>
          </div>

          {L ? (
            <div style={{ padding: 20 }}>
              {[1,2,3,4,5].map(i => <div key={i} className="loading-skeleton" style={{ height: 36, borderRadius: 6, marginBottom: 8 }} />)}
            </div>
          ) : !stats?.recent.length ? (
            <div style={{ padding: '48px 20px', textAlign: 'center' }}>
              <Wallet size={32} style={{ opacity: 0.18, display: 'block', margin: '0 auto 12px' }} />
              <p style={{ fontSize: 14, margin: '0 0 4px', color: 'var(--text-2)', fontWeight: 600 }}>No transactions yet</p>
              <p style={{ fontSize: 12, margin: '0 0 20px', color: 'var(--text-3)' }}>Add your first receipt or payment to get started</p>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                <button onClick={() => setModal('income')}  style={{ padding: '8px 16px', background: '#16a34a', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>+ Receipt</button>
                <button onClick={() => setModal('expense')} style={{ padding: '8px 16px', background: '#dc2626', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>− Payment</button>
              </div>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: 'var(--table-header-bg)' }}>
                    {['Date','Type','Details','Account','Amount'].map(h => (
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

        {/* Quick links */}
        <div className="card" style={{ overflow: 'hidden', alignSelf: 'start' }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--card-border)' }}>
            <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-3)', margin: 0 }}>Quick Links</p>
          </div>
          <div style={{ padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 2 }}>
            <QuickLink icon={TrendingUp} label="All Transactions" color="#16a34a" onClick={() => navigate('/simple-accounts/transactions')} />
            <QuickLink icon={Wallet}     label="Manage Accounts"  color="#2563eb" onClick={() => navigate('/simple-accounts/accounts')} />
            <QuickLink icon={BarChart3}  label="Reports"          color="#7c3aed" onClick={() => navigate('/simple-accounts/reports')} />
            <QuickLink icon={Tag}        label="Categories"       color="#0891b2" onClick={() => navigate('/simple-accounts/categories')} />
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
