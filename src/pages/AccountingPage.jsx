/* ═══════════════════════════════════════════════════════════════
   AccountingPage.jsx — Accounting Dashboard (Finance → Accounts)
   ═══════════════════════════════════════════════════════════════ */

import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { useToast } from '../lib/toast'
import { useEntity } from '../lib/EntityContext'
import {
  getFY, fyOptions, fmtAmt,
  getAccountingStats, getJournalEntries, getChartOfAccounts,
  isAccountingEnabled, getEntrySystemStatus, lockEntrySystem,
  TYPE_COLOR, VOUCHER_COLOR, displayAccountType,
} from '../lib/accountingLib'
import {
  Settings, TrendingUp, TrendingDown, Scale, IndianRupee,
  FileText, PlusCircle, List, ChevronRight, AlertCircle,
  BarChart2, ClipboardList, Wallet, RefreshCw,
  ChevronDown, Landmark, Lock, Loader2, CreditCard, ArrowLeftRight,
  CheckSquare, BarChart, Target, Building2, Layers, BookOpen,
} from 'lucide-react'
import JournalEntryModal from '../components/accounting/JournalEntryModal'

// ── Balance Bar (Cash | Bank | Total) ────────────────────────────

function BalanceBar({ cashAccounts, bankAccounts, cashTotal, bankTotal, loading }) {
  const [hovered, setHovered] = useState(false)
  const open = hovered && !loading
  const totalFunds = cashTotal + bankTotal

  function Detail({ accounts, color, extraRows }) {
    const rows = accounts.length > 0 ? accounts : extraRows || []
    if (!open) return null
    return (
      <div>
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--card-border)', display: 'flex', flexDirection: 'column', gap: 5 }}>
          {rows.map((r, i) => (
            <div key={r.id ?? i} style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 11, color: 'var(--text-2)' }}>{r.name}</span>
              <span style={{ fontSize: 11, fontWeight: 700, fontFamily: 'monospace', color: r.balance >= 0 ? (r.color || color) : '#b91c1c' }}>
                {fmtAmt(r.balance)}
              </span>
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div
      className="card"
      onMouseEnter={() => !loading && setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{ display: 'flex', marginBottom: 14, overflow: 'hidden' }}
    >
      {/* Cash */}
      <div style={{ flex: 1, padding: '16px 22px', borderRight: '1px solid var(--card-border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <div style={{ width: 26, height: 26, borderRadius: 7, background: '#dcfce7', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Wallet size={13} color="#16a34a" />
          </div>
          <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-3)', flex: 1 }}>Cash & Petty Cash</span>
        </div>
        {loading
          ? <div className="loading-skeleton" style={{ height: 28, borderRadius: 5, width: '55%' }} />
          : <p style={{ fontWeight: 900, color: '#16a34a', margin: 0, lineHeight: 1, fontSize: 24 }}>{fmtAmt(cashTotal)}</p>
        }
        {!loading && cashAccounts.length === 0
          ? <p style={{ fontSize: 10, color: 'var(--text-3)', margin: '4px 0 0', fontStyle: 'italic' }}>No accounts</p>
          : <Detail accounts={cashAccounts} color="#16a34a" />
        }
      </div>

      {/* Bank */}
      <div style={{ flex: 1, padding: '16px 22px', borderRight: '1px solid var(--card-border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <div style={{ width: 26, height: 26, borderRadius: 7, background: '#dbeafe', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Building2 size={13} color="#2563eb" />
          </div>
          <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-3)', flex: 1 }}>Bank Accounts</span>
        </div>
        {loading
          ? <div className="loading-skeleton" style={{ height: 28, borderRadius: 5, width: '55%' }} />
          : <p style={{ fontWeight: 900, color: '#2563eb', margin: 0, lineHeight: 1, fontSize: 24 }}>{fmtAmt(bankTotal)}</p>
        }
        {!loading && bankAccounts.length === 0
          ? <p style={{ fontSize: 10, color: 'var(--text-3)', margin: '4px 0 0', fontStyle: 'italic' }}>No accounts</p>
          : <Detail accounts={bankAccounts} color="#2563eb" />
        }
      </div>

      {/* Total */}
      <div style={{ flex: 1, padding: '16px 22px', background: 'var(--card-header-bg)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <div style={{ width: 26, height: 26, borderRadius: 7, background: '#f3e8ff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <IndianRupee size={13} color="#7c3aed" />
          </div>
          <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-3)' }}>Total Funds</span>
        </div>
        {loading
          ? <div className="loading-skeleton" style={{ height: 28, borderRadius: 5, width: '55%' }} />
          : <p style={{ fontWeight: 900, color: '#7c3aed', margin: 0, lineHeight: 1, fontSize: 24 }}>{fmtAmt(totalFunds)}</p>
        }
        <Detail
          accounts={[]}
          extraRows={[
            { id: 'cash', name: 'Cash & Petty Cash', balance: cashTotal,  color: '#16a34a' },
            { id: 'bank', name: 'Bank Accounts',      balance: bankTotal,  color: '#2563eb' },
          ]}
          color="#7c3aed"
        />
      </div>
    </div>
  )
}

// ── Metrics Bar (Income | Expenses | Surplus) ─────────────────────

function MetricsBar({ totalIncome, totalExpenses, netIncome, fy, loading }) {
  const surplus = !loading && netIncome >= 0
  const surplusColor = surplus ? '#16a34a' : '#dc2626'
  return (
    <div className="card" style={{ display: 'flex', marginBottom: 24, overflow: 'hidden' }}>
      <div style={{ flex: 1, padding: '14px 22px', borderRight: '1px solid var(--card-border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 5 }}>
          <TrendingUp size={13} color="#16a34a" />
          <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-3)', flex: 1 }}>Total Income</span>
          <span style={{ fontSize: 10, color: 'var(--text-3)' }}>FY {fy}</span>
        </div>
        {loading
          ? <div className="loading-skeleton" style={{ height: 24, borderRadius: 5, width: '60%' }} />
          : <p style={{ fontSize: 22, fontWeight: 900, color: '#16a34a', margin: 0, lineHeight: 1 }}>{fmtAmt(totalIncome)}</p>
        }
      </div>
      <div style={{ flex: 1, padding: '14px 22px', borderRight: '1px solid var(--card-border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 5 }}>
          <TrendingDown size={13} color="#c2410c" />
          <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-3)' }}>Total Expenses</span>
        </div>
        {loading
          ? <div className="loading-skeleton" style={{ height: 24, borderRadius: 5, width: '60%' }} />
          : <p style={{ fontSize: 22, fontWeight: 900, color: '#c2410c', margin: 0, lineHeight: 1 }}>{fmtAmt(totalExpenses)}</p>
        }
      </div>
      <div style={{ flex: 1, padding: '14px 22px', background: loading ? 'transparent' : surplus ? '#f0fdf4' : '#fff1f2' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 5 }}>
          <Scale size={13} color={loading ? 'var(--text-3)' : surplusColor} />
          <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-3)' }}>
            {loading ? 'Surplus / Deficit' : surplus ? 'Surplus' : 'Deficit'}
          </span>
        </div>
        {loading
          ? <div className="loading-skeleton" style={{ height: 24, borderRadius: 5, width: '60%' }} />
          : <p style={{ fontSize: 22, fontWeight: 900, color: surplusColor, margin: 0, lineHeight: 1 }}>{fmtAmt(Math.abs(netIncome))}</p>
        }
      </div>
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
      className="no-lift"
      style={{
        display: 'flex', alignItems: 'center', gap: 14,
        width: '100%', padding: '12px 16px',
        background: hov ? 'var(--text-1)' : 'transparent',
        border: '1px solid var(--card-border)',
        borderRadius: 10, cursor: 'pointer', textAlign: 'left',
      }}
    >
      <div style={{ width: 36, height: 36, borderRadius: 9, background: hov ? 'rgba(255,255,255,0.12)' : `${color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Icon size={17} color={hov ? '#fff' : color} />
      </div>
      <div style={{ flex: 1 }}>
        <p style={{ fontSize: 13, fontWeight: 600, color: hov ? '#fff' : 'var(--text-1)', margin: 0 }}>{label}</p>
        <p style={{ fontSize: 11, color: hov ? 'rgba(255,255,255,0.6)' : 'var(--text-3)', margin: 0 }}>{desc}</p>
      </div>
      <ChevronRight size={14} color={hov ? '#fff' : 'var(--text-3)'} />
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
      <span style={{ fontSize: 12, fontWeight: 600, color: c.text, flex: 1 }}>{displayAccountType(type)}</span>
      <span style={{ fontSize: 16, fontWeight: 800, color: c.text }}>
        {loading ? '—' : count}
      </span>
    </div>
  )
}


const MASTER_PASSWORD = 'Master007))&'

// ════════════════════════════════════════════════════════════════
//  ENTRY SYSTEM SETUP MODAL  (one-time, two-step: choose → password)
// ════════════════════════════════════════════════════════════════

function EntrySystemSetupModal({ onLocked }) {
  const toast = useToast()
  const [step,     setStep]     = useState('choose')   // 'choose' | 'password'
  const [selected, setSelected] = useState(null)
  const [password, setPassword] = useState('')
  const [pwError,  setPwError]  = useState('')
  const [saving,   setSaving]   = useState(false)
  const [churchId, setChurchId] = useState(null)

  useEffect(() => {
    getEntrySystemStatus().then(s => setChurchId(s.id)).catch(() => {})
  }, [])

  function handleProceedToPassword() {
    setPassword('')
    setPwError('')
    setStep('password')
  }

  function handleSkip() {
    sessionStorage.setItem('ac_setup_skipped', '1')
    onLocked(null)
  }

  async function handleConfirmLock() {
    if (password !== MASTER_PASSWORD) {
      setPwError('Incorrect password. Please try again.')
      setPassword('')
      return
    }
    setPwError('')
    setSaving(true)
    try {
      await lockEntrySystem(churchId, selected)
      toast(`${selected === 'double' ? 'Double' : 'Single'} Entry System locked successfully.`, 'success')
      onLocked(selected)
    } catch (e) {
      toast('Failed to save: ' + e.message, 'error')
    }
    setSaving(false)
  }

  const CARDS = [
    {
      value:    'single',
      icon:     '📒',
      title:    'Single Entry System',
      subtitle: 'Simple cash-book style recording — income and payments only.',
      bullets:  [
        'Easy to use — no accounting background needed',
        'Record cash received and cash paid out',
        'Basic income & expenditure reports',
        'Best for small or newly registered churches',
      ],
    },
    {
      value:    'double',
      icon:     '📊',
      title:    'Double Entry System',
      subtitle: 'Full double-entry bookkeeping — every transaction has debit and credit entries.',
      bullets:  [
        'Complete Chart of Accounts (Assets, Liabilities, Corpus Fund)',
        'Trial Balance, Balance Sheet, Income & Expenditure reports',
        'Audit-ready financial statements',
        'Recommended for larger or registered churches',
      ],
    },
  ]

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 2000,
      background: 'rgba(0,0,0,0.65)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 24,
    }}>
      <div style={{
        background: 'var(--card-bg)', borderRadius: 18,
        width: '100%', maxWidth: step === 'password' ? 420 : 660,
        boxShadow: '0 32px 80px rgba(0,0,0,0.35)',
        overflow: 'hidden', transition: 'max-width 0.2s',
      }}>

        {/* ── STEP 1: Choose ───────────────────────────────────── */}
        {step === 'choose' && <>
          <div style={{ padding: '24px 28px 20px', borderBottom: '1px solid var(--card-border)', textAlign: 'center' }}>
            <div style={{ width: 56, height: 56, borderRadius: 16, background: '#dbeafe', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
              <Lock size={26} color="#2563eb" />
            </div>
            <h2 style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-1)', margin: '0 0 8px' }}>
              Choose Your Accounting System
            </h2>
            <p style={{ fontSize: 13, color: 'var(--text-3)', margin: 0, maxWidth: 460, marginLeft: 'auto', marginRight: 'auto', lineHeight: 1.6 }}>
              This is a <strong style={{ color: 'var(--text-2)' }}>one-time setup</strong>. Once confirmed with the master password, this cannot be changed.
            </p>
          </div>

          <div style={{ padding: '22px 28px', display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            {CARDS.map(card => {
              const active = selected === card.value
              return (
                <div key={card.value} onClick={() => setSelected(card.value)}
                  style={{
                    flex: 1, minWidth: 200, padding: '18px 20px', borderRadius: 12, cursor: 'pointer',
                    border: `2px solid ${active ? 'var(--accent)' : 'var(--card-border)'}`,
                    background: active ? 'var(--sidebar-item-active-bg)' : 'var(--card-bg)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                    <div style={{
                      width: 18, height: 18, borderRadius: '50%', flexShrink: 0,
                      border: `2px solid ${active ? 'var(--accent)' : 'var(--card-border)'}`,
                      background: active ? 'var(--accent)' : 'transparent',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      {active && <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#fff', display: 'block' }} />}
                    </div>
                    <span style={{ fontSize: 20 }}>{card.icon}</span>
                    <p style={{ fontSize: 14, fontWeight: 700, color: active ? 'var(--accent)' : 'var(--text-1)', margin: 0 }}>
                      {card.title}
                    </p>
                  </div>
                  <p style={{ fontSize: 12, color: 'var(--text-2)', margin: '0 0 10px', lineHeight: 1.5 }}>{card.subtitle}</p>
                  <ul style={{ margin: 0, padding: '0 0 0 14px', display: 'flex', flexDirection: 'column', gap: 3 }}>
                    {card.bullets.map(b => (
                      <li key={b} style={{ fontSize: 11, color: 'var(--text-3)', lineHeight: 1.4 }}>{b}</li>
                    ))}
                  </ul>
                </div>
              )
            })}
          </div>

          <div style={{ padding: '16px 28px 20px', borderTop: '1px solid var(--card-border)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
            <button
              onClick={handleProceedToPassword}
              disabled={!selected}
              style={{
                width: '100%', maxWidth: 320, height: 46,
                background: selected ? 'var(--accent)' : '#e5e7eb',
                color: selected ? '#fff' : '#9ca3af',
                border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 700,
                cursor: selected ? 'pointer' : 'not-allowed',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              }}
            >
              <Lock size={15} /> Confirm &amp; Lock →
            </button>
            <button onClick={handleSkip}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: 'var(--text-3)', textDecoration: 'underline', padding: 0 }}>
              Skip for now (development only)
            </button>
          </div>
        </>}

        {/* ── STEP 2: Master Password ───────────────────────────── */}
        {step === 'password' && <>
          <div style={{ padding: '28px 32px 24px', borderBottom: '1px solid var(--card-border)', textAlign: 'center' }}>
            <div style={{ width: 56, height: 56, borderRadius: 16, background: '#fef3c7', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
              <Lock size={26} color="#d97706" />
            </div>
            <h2 style={{ fontSize: 18, fontWeight: 800, color: 'var(--text-1)', margin: '0 0 6px' }}>
              Enter Master Password
            </h2>
            <p style={{ fontSize: 12, color: 'var(--text-3)', margin: 0, lineHeight: 1.5 }}>
              Locking as: <strong style={{ color: 'var(--accent)' }}>
                {selected === 'double' ? 'Double Entry System' : 'Single Entry System'}
              </strong>
              <br />Enter the master password to confirm this permanent change.
            </p>
          </div>

          <div style={{ padding: '24px 32px' }}>
            <label style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-3)', display: 'block', marginBottom: 8 }}>
              Master Password
            </label>
            <input
              type="password"
              value={password}
              onChange={e => { setPassword(e.target.value); setPwError('') }}
              onKeyDown={e => e.key === 'Enter' && handleConfirmLock()}
              placeholder="Enter master password…"
              autoFocus
              style={{
                width: '100%', height: 42, padding: '0 14px',
                border: `1.5px solid ${pwError ? '#b91c1c' : 'var(--card-border)'}`,
                borderRadius: 9, fontSize: 14, background: 'var(--input-bg)',
                color: 'var(--text-1)', outline: 'none', boxSizing: 'border-box',
                letterSpacing: '0.1em',
              }}
            />
            {pwError && (
              <p style={{ fontSize: 12, color: '#b91c1c', margin: '6px 0 0', fontWeight: 600 }}>{pwError}</p>
            )}
          </div>

          <div style={{ padding: '0 32px 28px', display: 'flex', gap: 10 }}>
            <button onClick={() => { setStep('choose'); setPwError('') }}
              style={{ flex: 1, height: 42, background: 'var(--card-bg)', border: '1.5px solid var(--card-border)', borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: 'pointer', color: 'var(--text-2)' }}>
              ← Back
            </button>
            <button onClick={handleConfirmLock} disabled={!password || saving}
              style={{
                flex: 2, height: 42,
                background: password ? '#d97706' : '#e5e7eb',
                color: password ? '#fff' : '#9ca3af',
                border: 'none', borderRadius: 9, fontSize: 13, fontWeight: 700,
                cursor: password ? 'pointer' : 'not-allowed',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              }}
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Lock size={14} />}
              {saving ? 'Locking…' : 'Confirm & Lock'}
            </button>
          </div>
        </>}

      </div>
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
  const { entities, currentEntity, currentEntityId, switchEntity, loading: entityLoading } = useEntity()
  const [entityOpen,     setEntityOpen]     = useState(false)
  const [switchTarget,   setSwitchTarget]   = useState(null)  // entity pending password
  const [switchPwInput,  setSwitchPwInput]  = useState('')
  const [switchPwError,  setSwitchPwError]  = useState('')

  const [enabled,         setEnabled]         = useState(null) // null = loading
  const [entryLocked,     setEntryLocked]     = useState(null) // null = loading
  const [entrySystem,     setEntrySystem]     = useState(null)
  const [setupDismissed,  setSetupDismissed]  = useState(() => !!sessionStorage.getItem('ac_setup_skipped'))
  const [showNewEntry,    setShowNewEntry]    = useState(false)
  const [fy,            setFy]            = useState(getFY())
  const [stats,         setStats]         = useState(null)
  const [accounts,      setAccounts]      = useState([])
  const [entries,       setEntries]       = useState([])
  const [loading,       setLoading]       = useState(true)
  const [fyOpen,        setFyOpen]        = useState(false)
  const FYS = fyOptions()

  const load = useCallback(async () => {
    if (!currentEntityId) { setLoading(false); return }
    setLoading(true)
    try {
      const [on, setup] = await Promise.all([isAccountingEnabled(), getEntrySystemStatus()])
      setEnabled(on)
      setEntryLocked(setup.locked)
      setEntrySystem(setup.entry_system)
      if (!on) { setLoading(false); return }
      const [s, accts, ents] = await Promise.all([
        getAccountingStats(fy, currentEntityId),
        getChartOfAccounts(true, currentEntityId),
        getJournalEntries({ fy, entityId: currentEntityId }),
      ])
      setStats(s)
      setAccounts(accts)
      setEntries(ents.slice(0, 8))
    } catch (e) {
      toast('Failed to load accounting data: ' + e.message, 'error')
    }
    setLoading(false)
  }, [fy, currentEntityId, toast])

  useEffect(() => { load() }, [load])

  // + key opens new entry modal (capture phase — works even when buttons/links have focus)
  useEffect(() => {
    function onKey(e) {
      if (e.key !== '+') return
      const tag = document.activeElement?.tagName?.toUpperCase()
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag)) return
      if (showNewEntry) return
      e.preventDefault()
      setShowNewEntry(true)
    }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [showNewEntry])

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

  // ── No entity in DB ───────────────────────────────────────────
  if (!entityLoading && !currentEntityId) {
    return (
      <div className="page-container">
        <div className="page-header">
          <div>
            <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Landmark size={22} style={{ color: 'var(--accent)' }} /> Accounts
            </h1>
            <p className="page-subtitle">Financial overview &amp; accounting management</p>
          </div>
        </div>
        <div className="card" style={{ padding: '60px 40px', textAlign: 'center' }}>
          <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#eff6ff', border: '2px solid #bfdbfe', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
            <Layers size={28} color="#2563eb" />
          </div>
          <h3 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-1)', margin: '0 0 8px' }}>No Accounting Book Found</h3>
          <p style={{ fontSize: 13, color: 'var(--text-3)', maxWidth: 440, margin: '0 auto 24px', lineHeight: 1.6 }}>
            The database migration ran but no accounting entity was seeded. Create your first accounting book to get started.
          </p>
          <button
            onClick={() => navigate('/accounting/entities')}
            style={{ background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 24px', fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8 }}
          >
            <Layers size={15} /> Set Up Accounting Book
          </button>
        </div>
      </div>
    )
  }

  const L = loading || enabled === null || entryLocked === null

  // Blocks navigation to any entry-creation page until the entry system is locked
  function guardedNav(path) {
    if (!entryLocked) {
      toast('Accounting method not set up. Go to Settings and lock the entry system first.', 'error')
      return
    }
    navigate(path)
  }

  // Show setup modal when accounting is on, not yet locked, and not skipped this session
  const showSetup = enabled === true && entryLocked === false && !setupDismissed

  return (
    <div className="page-container">
      {showSetup && (
        <EntrySystemSetupModal onLocked={system => {
          if (system) { setEntryLocked(true); setEntrySystem(system) }
          setSetupDismissed(true)
        }} />
      )}

      {/* Switch entity — master password gate */}
      {switchTarget && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 2000, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div style={{ background: 'var(--card-bg)', borderRadius: 16, width: '100%', maxWidth: 400, boxShadow: '0 24px 60px rgba(0,0,0,0.3)', overflow: 'hidden' }}>
            <div style={{ padding: '22px 26px 18px', borderBottom: '1px solid var(--card-border)', textAlign: 'center' }}>
              <div style={{ width: 48, height: 48, borderRadius: 14, background: '#fef3c7', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
                <Lock size={22} color="#d97706" />
              </div>
              <h3 style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-1)', margin: '0 0 4px' }}>Switch Accounting Book</h3>
              <p style={{ fontSize: 12, color: 'var(--text-3)', margin: 0, lineHeight: 1.5 }}>
                Switching to <strong style={{ color: 'var(--accent)' }}>{switchTarget.name}</strong> requires the master password.
              </p>
            </div>
            <div style={{ padding: '20px 26px' }}>
              <label style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-3)', display: 'block', marginBottom: 7 }}>Master Password</label>
              <input
                type="password"
                value={switchPwInput}
                onChange={e => { setSwitchPwInput(e.target.value); setSwitchPwError('') }}
                onKeyDown={e => {
                  if (e.key === 'Enter' && switchPwInput) {
                    if (switchPwInput !== MASTER_PASSWORD) { setSwitchPwError('Incorrect password.'); setSwitchPwInput(''); return }
                    switchEntity(switchTarget.id); toast(`Switched to "${switchTarget.name}".`, 'success')
                    setSwitchTarget(null); setSwitchPwInput(''); setSwitchPwError('')
                  }
                }}
                placeholder="Enter master password…"
                autoFocus
                style={{ width: '100%', height: 40, padding: '0 12px', border: `1.5px solid ${switchPwError ? '#b91c1c' : 'var(--card-border)'}`, borderRadius: 8, fontSize: 14, background: 'var(--input-bg)', color: 'var(--text-1)', outline: 'none', boxSizing: 'border-box', letterSpacing: '0.1em' }}
              />
              {switchPwError && <p style={{ fontSize: 12, color: '#b91c1c', margin: '5px 0 0', fontWeight: 600 }}>{switchPwError}</p>}
            </div>
            <div style={{ padding: '0 26px 24px', display: 'flex', gap: 10 }}>
              <button onClick={() => { setSwitchTarget(null); setSwitchPwInput(''); setSwitchPwError('') }} className="no-lift"
                style={{ flex: 1, height: 40, background: 'var(--card-bg)', border: '1.5px solid var(--card-border)', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', color: 'var(--text-2)' }}>
                Cancel
              </button>
              <button disabled={!switchPwInput} className="no-lift"
                onClick={() => {
                  if (switchPwInput !== MASTER_PASSWORD) { setSwitchPwError('Incorrect password.'); setSwitchPwInput(''); return }
                  switchEntity(switchTarget.id); toast(`Switched to "${switchTarget.name}".`, 'success')
                  setSwitchTarget(null); setSwitchPwInput(''); setSwitchPwError('')
                }}
                style={{ flex: 2, height: 40, background: switchPwInput ? '#d97706' : '#e5e7eb', color: switchPwInput ? '#fff' : '#9ca3af', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: switchPwInput ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}>
                <Lock size={13} /> Confirm &amp; Switch
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="page-header">
        <div>
          <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Landmark size={22} style={{ color: 'var(--accent)' }} /> Accounts
          </h1>
          <p className="page-subtitle">Financial overview &amp; accounting management</p>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {/* Entity Switcher */}
          {entities.length > 1 && (
            <div style={{ position: 'relative' }}>
              <button
                onClick={() => setEntityOpen(o => !o)}
                className="no-lift ac-entity-btn"
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 16px', background: '#eff6ff', border: '1.5px solid #bfdbfe', borderRadius: 9, fontSize: 15, fontWeight: 700, color: '#1d4ed8', cursor: 'pointer' }}
              >
                <Layers size={15} />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{currentEntity?.name || 'Select Entity'}</span>
                <ChevronDown size={15} style={{ flexShrink: 0 }} />
              </button>
              {entityOpen && (
                <div style={{ position: 'absolute', top: '110%', left: 0, background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: 9, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', zIndex: 50, minWidth: 220, overflow: 'hidden' }}>
                  {entities.filter(e => e.is_active).map(e => (
                    <button key={e.id}
                      onClick={() => {
                        setEntityOpen(false)
                        if (e.id === currentEntityId) return
                        setSwitchTarget(e); setSwitchPwInput(''); setSwitchPwError('')
                      }}
                      className="no-lift"
                      style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '9px 16px', fontSize: 13, textAlign: 'left', background: e.id === currentEntityId ? 'var(--sidebar-item-active-bg)' : 'transparent', color: e.id === currentEntityId ? 'var(--accent)' : 'var(--text-1)', fontWeight: e.id === currentEntityId ? 700 : 400, border: 'none', cursor: e.id === currentEntityId ? 'default' : 'pointer' }}>
                      <Layers size={12} style={{ flexShrink: 0 }} /> {e.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* FY Selector */}
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setFyOpen(o => !o)}
              className="no-lift ac-fy-btn"
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', background: 'var(--card-bg)', border: '1.5px solid var(--card-border)', borderRadius: 8, fontSize: 13, fontWeight: 600, color: 'var(--text-1)', cursor: 'pointer' }}
            >
              FY {fy} <ChevronDown size={13} />
            </button>
            {fyOpen && (
              <div style={{ position: 'absolute', top: '110%', right: 0, background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: 9, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', zIndex: 50, minWidth: 140, overflow: 'hidden' }}>
                {FYS.map(f => (
                  <button key={f} onClick={() => { setFy(f); setFyOpen(false) }}
                    className="no-lift"
                    style={{ display: 'block', width: '100%', padding: '9px 16px', fontSize: 13, textAlign: 'left', background: f === fy ? 'var(--sidebar-item-active-bg)' : 'transparent', color: f === fy ? 'var(--accent)' : 'var(--text-1)', fontWeight: f === fy ? 700 : 400, border: 'none', cursor: 'pointer' }}>
                    FY {f}
                  </button>
                ))}
              </div>
            )}
          </div>

          <button onClick={load} title="Refresh" className="no-lift ac-icon-btn" style={{ padding: '8px 10px', background: 'var(--card-bg)', border: '1.5px solid var(--card-border)', borderRadius: 8, cursor: 'pointer', display: 'flex', alignItems: 'center', color: 'var(--text-2)' }}>
            <RefreshCw size={15} />
          </button>

          <button
            onClick={() => navigate('/accounting/settings')}
            title="Accounting Settings"
            className="no-lift ac-icon-btn"
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
          <button onClick={() => navigate('/accounting/journal-entries')} className="no-lift" style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 600, color: '#c2410c', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>View All</button>
        </div>
      )}

      {/* ── Current book title ──────────────────────────────────── */}
      {currentEntity?.name && (
        <div style={{ textAlign: 'center', margin: '-6px 0 20px' }}>
          <span className="ac-entity-badge">
            <Layers size={16} />
            {currentEntity.name}
          </span>
        </div>
      )}

      {/* ── Balance bar (Cash | Bank | Total) ───────────────────── */}
      <BalanceBar
        cashAccounts={L ? [] : (stats?.cashAccounts || [])}
        bankAccounts={L ? [] : (stats?.bankAccounts || [])}
        cashTotal={L ? 0 : (stats?.cashTotal || 0)}
        bankTotal={L ? 0 : (stats?.bankTotal || 0)}
        loading={L}
      />

      {/* ── Metrics bar (Income | Expenses | Surplus) ───────────── */}
      <MetricsBar
        totalIncome={stats?.totalIncome || 0}
        totalExpenses={stats?.totalExpenses || 0}
        netIncome={stats?.netIncome || 0}
        fy={fy}
        loading={L}
      />

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
              <button onClick={() => navigate('/accounting/journal-entries')} style={{ marginTop: 12, fontSize: 12, fontWeight: 600, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer' }}>
                Go to Journal Entries
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
                      onMouseEnter={ev => { ev.currentTarget.style.background = 'var(--sidebar-item-hover)' }}
                      onMouseLeave={ev => { ev.currentTarget.style.background = i % 2 ? 'rgba(0,0,0,0.012)' : 'transparent' }}
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

          {/* Quick Entries */}
          <div className="card" style={{ overflow: 'hidden' }}>
            <div style={{ padding: '12px 18px', borderBottom: '1px solid var(--card-border)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <PlusCircle size={14} color="#16a34a" />
              <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-1)', margin: 0, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Quick Entries</p>
            </div>
            <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 5 }}>
              <QuickBtn icon={IndianRupee}    label="Receipt Voucher" desc="Money received — cash or bank" onClick={() => guardedNav('/accounting/receipt-voucher')} color="#16a34a" />
              <QuickBtn icon={CreditCard}     label="Payment Voucher" desc="Money paid out — cash or bank"  onClick={() => guardedNav('/accounting/payment-voucher')} color="#dc2626" />
              <QuickBtn icon={ArrowLeftRight} label="Contra Entry"    desc="Cash ↔ bank transfers"          onClick={() => guardedNav('/accounting/contra-voucher')} color="#7c3aed" />
              <QuickBtn icon={FileText}       label="Journal Entry"   desc="General double-entry posting"   onClick={() => guardedNav('/accounting/journal-voucher')} color="#0891b2" />
            </div>
          </div>

          {/* Statements */}
          <div className="card" style={{ overflow: 'hidden' }}>
            <div style={{ padding: '12px 18px', borderBottom: '1px solid var(--card-border)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <BarChart2 size={14} color="#0891b2" />
              <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-1)', margin: 0, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Statements</p>
            </div>
            <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 5 }}>
              <QuickBtn icon={BookOpen}      label="Chart of Accounts"    desc="View & manage account hierarchy"  onClick={() => navigate('/accounting/chart-of-accounts')}   color="#374151" />
              <QuickBtn icon={BarChart2}     label="Financial Statements" desc="R&P, I&E, Balance Sheet"          onClick={() => navigate('/accounting/statements')}           color="#0891b2" />
              <QuickBtn icon={Scale}         label="Trial Balance"        desc="Verify debits = credits"          onClick={() => navigate('/accounting/trial-balance')}        color="#7c3aed" />
              <QuickBtn icon={ClipboardList} label="Ledger"               desc="Account-wise transactions"        onClick={() => navigate('/accounting/ledger')}               color="#2563eb" />
              <QuickBtn icon={List}          label="GL Reports"           desc="Day Book & account summary"       onClick={() => navigate('/accounting/gl-reports')}           color="#065f46" />
            </div>
          </div>

          {/* Analysis */}
          <div className="card" style={{ overflow: 'hidden' }}>
            <div style={{ padding: '12px 18px', borderBottom: '1px solid var(--card-border)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <BarChart size={14} color="#c2410c" />
              <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-1)', margin: 0, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Analysis</p>
            </div>
            <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 5 }}>
              <QuickBtn icon={CheckSquare} label="Bank Reconciliation"  desc="Match entries against bank statement"  onClick={() => navigate('/accounting/bank-reconciliation')} color="#0891b2" />
              <QuickBtn icon={BarChart}    label="Budget vs Actual"     desc="Compare budgets to real spending"      onClick={() => navigate('/accounting/budget-vs-actual')}    color="#16a34a" />
              <QuickBtn icon={Target}      label="Fund Report"          desc="Balances per designated fund"          onClick={() => navigate('/accounting/fund-report')}         color="#7c3aed" />
            </div>
          </div>

        </div>
      </div>

    </div>
  )
}
