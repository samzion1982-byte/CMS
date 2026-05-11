/* ═══════════════════════════════════════════════════════════════
   SimpleAccountsSettingsPage.jsx — Settings for Simple Accounts
   ═══════════════════════════════════════════════════════════════ */

import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Settings, Check, Loader2, Lock, Eye, EyeOff, Wallet, Info,
  ArrowLeft, AlertTriangle, Trash2,
  Globe, FileText, Database, Upload, ShieldCheck,
  XCircle, AlertCircle, Hash, Calendar, FileSpreadsheet,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import { useToast } from '../lib/toast'
import {
  getSimpleSettings, saveSimpleSettings,
  getSimpleAccounts, updateSimpleAccount,
  flushAllSimpleData, getChurchInfo,
} from '../lib/simpleAccountsLib'
import {
  exportSimpleAccountsBackup,
  parseAndValidateSimpleBackup,
  applySimpleBackupRestore,
} from '../lib/simpleAccountsBackup'

const MASTER_PASSWORD = 'Master007))&'

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']

const COUNTRIES = [
  { country: 'Argentina',        currency: '$',    numberFormat: 'international', dateFormat: 'DD-MM-YYYY' },
  { country: 'Australia',        currency: 'A$',   numberFormat: 'international', dateFormat: 'DD-MM-YYYY' },
  { country: 'Bahrain',          currency: 'BD',   numberFormat: 'international', dateFormat: 'DD-MM-YYYY' },
  { country: 'Bangladesh',       currency: '৳',    numberFormat: 'international', dateFormat: 'DD-MM-YYYY' },
  { country: 'Belgium',          currency: '€',    numberFormat: 'international', dateFormat: 'DD-MM-YYYY' },
  { country: 'Brazil',           currency: 'R$',   numberFormat: 'international', dateFormat: 'DD-MM-YYYY' },
  { country: 'Canada',           currency: 'CA$',  numberFormat: 'international', dateFormat: 'DD-MM-YYYY' },
  { country: 'China',            currency: '¥',    numberFormat: 'international', dateFormat: 'YYYY-MM-DD' },
  { country: 'Denmark',          currency: 'kr',   numberFormat: 'international', dateFormat: 'DD-MM-YYYY' },
  { country: 'Egypt',            currency: '£',    numberFormat: 'international', dateFormat: 'DD-MM-YYYY' },
  { country: 'Ethiopia',         currency: 'Br',   numberFormat: 'international', dateFormat: 'DD-MM-YYYY' },
  { country: 'Fiji',             currency: 'FJ$',  numberFormat: 'international', dateFormat: 'DD-MM-YYYY' },
  { country: 'France',           currency: '€',    numberFormat: 'international', dateFormat: 'DD-MM-YYYY' },
  { country: 'Germany',          currency: '€',    numberFormat: 'international', dateFormat: 'DD-MM-YYYY' },
  { country: 'Ghana',            currency: '₵',    numberFormat: 'international', dateFormat: 'DD-MM-YYYY' },
  { country: 'Hong Kong',        currency: 'HK$',  numberFormat: 'international', dateFormat: 'DD-MM-YYYY' },
  { country: 'India',            currency: '₹',    numberFormat: 'indian',        dateFormat: 'DD-MM-YYYY' },
  { country: 'Indonesia',        currency: 'Rp',   numberFormat: 'international', dateFormat: 'DD-MM-YYYY' },
  { country: 'Israel',           currency: '₪',    numberFormat: 'international', dateFormat: 'DD-MM-YYYY' },
  { country: 'Italy',            currency: '€',    numberFormat: 'international', dateFormat: 'DD-MM-YYYY' },
  { country: 'Japan',            currency: '¥',    numberFormat: 'international', dateFormat: 'YYYY-MM-DD' },
  { country: 'Kenya',            currency: 'KSh',  numberFormat: 'international', dateFormat: 'DD-MM-YYYY' },
  { country: 'Kuwait',           currency: 'KD',   numberFormat: 'international', dateFormat: 'DD-MM-YYYY' },
  { country: 'Malaysia',         currency: 'RM',   numberFormat: 'international', dateFormat: 'DD-MM-YYYY' },
  { country: 'Mexico',           currency: '$',    numberFormat: 'international', dateFormat: 'DD-MM-YYYY' },
  { country: 'Myanmar',          currency: 'K',    numberFormat: 'international', dateFormat: 'DD-MM-YYYY' },
  { country: 'Nepal',            currency: 'रू',   numberFormat: 'international', dateFormat: 'DD-MM-YYYY' },
  { country: 'Netherlands',      currency: '€',    numberFormat: 'international', dateFormat: 'DD-MM-YYYY' },
  { country: 'New Zealand',      currency: 'NZ$',  numberFormat: 'international', dateFormat: 'DD-MM-YYYY' },
  { country: 'Nigeria',          currency: '₦',    numberFormat: 'international', dateFormat: 'DD-MM-YYYY' },
  { country: 'Norway',           currency: 'kr',   numberFormat: 'international', dateFormat: 'DD-MM-YYYY' },
  { country: 'Oman',             currency: 'OMR',  numberFormat: 'international', dateFormat: 'DD-MM-YYYY' },
  { country: 'Pakistan',         currency: '₨',    numberFormat: 'international', dateFormat: 'DD-MM-YYYY' },
  { country: 'Papua New Guinea', currency: 'K',    numberFormat: 'international', dateFormat: 'DD-MM-YYYY' },
  { country: 'Philippines',      currency: '₱',    numberFormat: 'international', dateFormat: 'MM-DD-YYYY' },
  { country: 'Portugal',         currency: '€',    numberFormat: 'international', dateFormat: 'DD-MM-YYYY' },
  { country: 'Qatar',            currency: 'QR',   numberFormat: 'international', dateFormat: 'DD-MM-YYYY' },
  { country: 'Saudi Arabia',     currency: '﷼',    numberFormat: 'international', dateFormat: 'DD-MM-YYYY' },
  { country: 'Singapore',        currency: 'S$',   numberFormat: 'international', dateFormat: 'DD-MM-YYYY' },
  { country: 'South Africa',     currency: 'R',    numberFormat: 'international', dateFormat: 'DD-MM-YYYY' },
  { country: 'South Korea',      currency: '₩',    numberFormat: 'international', dateFormat: 'YYYY-MM-DD' },
  { country: 'Spain',            currency: '€',    numberFormat: 'international', dateFormat: 'DD-MM-YYYY' },
  { country: 'Sri Lanka',        currency: 'Rs',   numberFormat: 'international', dateFormat: 'DD-MM-YYYY' },
  { country: 'Sweden',           currency: 'kr',   numberFormat: 'international', dateFormat: 'YYYY-MM-DD' },
  { country: 'Switzerland',      currency: 'CHF',  numberFormat: 'international', dateFormat: 'DD-MM-YYYY' },
  { country: 'Tanzania',         currency: 'TSh',  numberFormat: 'international', dateFormat: 'DD-MM-YYYY' },
  { country: 'Thailand',         currency: '฿',    numberFormat: 'international', dateFormat: 'DD-MM-YYYY' },
  { country: 'UAE',              currency: 'د.إ',  numberFormat: 'international', dateFormat: 'DD-MM-YYYY' },
  { country: 'Uganda',           currency: 'USh',  numberFormat: 'international', dateFormat: 'DD-MM-YYYY' },
  { country: 'UK',               currency: '£',    numberFormat: 'international', dateFormat: 'DD-MM-YYYY' },
  { country: 'USA',              currency: '$',    numberFormat: 'international', dateFormat: 'MM-DD-YYYY' },
  { country: 'Custom',           currency: '',     numberFormat: 'international', dateFormat: 'DD-MM-YYYY' },
]

const COUNTRY_PRESETS = Object.fromEntries(
  COUNTRIES.map(c => [c.country, c.country === 'Custom' ? null : { currency: c.currency, numberFormat: c.numberFormat, dateFormat: c.dateFormat }])
)

const DATE_FORMATS   = ['DD-MM-YYYY', 'MM-DD-YYYY', 'YYYY-MM-DD', 'DD/MM/YYYY', 'MM/DD/YYYY']
const NUMBER_FORMATS = [
  { value: 'indian',        label: 'Indian  (1,00,000.00)' },
  { value: 'international', label: 'International  (100,000.00)' },
]

// ── Shared sub-components ─────────────────────────────────────────

const inputStyle = {
  height: 40, padding: '0 12px', border: '1.5px solid var(--card-border)',
  borderRadius: 8, fontSize: 14, background: 'var(--input-bg)', color: 'var(--text-1)',
  outline: 'none', boxSizing: 'border-box', width: '100%',
}

const smInputStyle = {
  height: 38, padding: '0 12px', border: '1.5px solid var(--card-border)',
  borderRadius: 8, fontSize: 13, background: 'var(--input-bg)', color: 'var(--text-1)',
  outline: 'none', boxSizing: 'border-box', width: '100%',
}

function FL({ children }) {
  return (
    <label style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-3)', display: 'block', marginBottom: 6 }}>
      {children}
    </label>
  )
}

function Field({ label, hint, children }) {
  return (
    <div>
      <FL>{label}</FL>
      {children}
      {hint && <p style={{ fontSize: 11, color: 'var(--text-3)', margin: '5px 0 0', lineHeight: 1.5 }}>{hint}</p>}
    </div>
  )
}

function SectionCard({ icon: Icon, title, subtitle, children }) {
  return (
    <div className="card" style={{ padding: '24px 28px', marginBottom: 20, maxWidth: 680 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: subtitle ? 4 : 18 }}>
        <Icon size={16} style={{ color: 'var(--accent)', flexShrink: 0 }} />
        <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-1)', margin: 0 }}>{title}</h3>
      </div>
      {subtitle && <p style={{ fontSize: 12, color: 'var(--text-3)', margin: '0 0 18px', lineHeight: 1.55 }}>{subtitle}</p>}
      {children}
    </div>
  )
}

function InfoBox({ children }) {
  return (
    <div style={{ display: 'flex', gap: 10, padding: '10px 14px', background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 8, marginBottom: 16 }}>
      <Info size={15} color="#0369a1" style={{ flexShrink: 0, marginTop: 1 }} />
      <p style={{ fontSize: 12, color: '#0369a1', margin: 0, lineHeight: 1.55 }}>{children}</p>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────

export default function SimpleAccountsSettingsPage() {
  const { profile } = useAuth()
  const toast       = useToast()
  const navigate    = useNavigate()
  const fileInputRef = useRef(null)

  // Lock screen
  const [locked,      setLocked]      = useState(true)
  const [unlockInput, setUnlockInput] = useState('')
  const [unlockError, setUnlockError] = useState('')
  const [showPwd,     setShowPwd]     = useState(false)

  // Page state
  const [loading,    setLoading]    = useState(true)
  const [saving,     setSaving]     = useState(false)
  const [obSaving,   setObSaving]   = useState(false)
  const [accounts,   setAccounts]   = useState([])
  const [obForm,     setObForm]     = useState({})

  // Display & Format
  const [country,        setCountry]        = useState('India')
  const [currency,       setCurrency]       = useState('₹')
  const [numberFormat,   setNumberFormat]   = useState('indian')
  const [dateFormat,     setDateFormat]     = useState('DD-MM-YYYY')
  const [fiscalMonth,    setFiscalMonth]    = useState(4)
  const [defaultAccount, setDefaultAccount] = useState('')

  // Report Settings
  const [churchName,     setChurchName]     = useState('')
  const [diocese,        setDiocese]        = useState('')
  const [reportSubtitle, setReportSubtitle] = useState('')

  // Danger zone — flush
  const [flushOpen,  setFlushOpen]  = useState(false)
  const [flushPwd,   setFlushPwd]   = useState('')
  const [flushErr,   setFlushErr]   = useState('')
  const [flushing,   setFlushing]   = useState(false)

  // Backup & Restore
  const [exportWorking, setExportWorking] = useState(false)
  const [validating,    setValidating]    = useState(false)
  const [validation,    setValidation]    = useState(null)
  const [restoreOpen,   setRestoreOpen]   = useState(false)
  const [restoring,     setRestoring]     = useState(false)
  const [restPwd,       setRestPwd]       = useState('')
  const [restErr,       setRestErr]       = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [settings, accts, church] = await Promise.all([
        getSimpleSettings(),
        getSimpleAccounts(),
        getChurchInfo(),
      ])
      setCountry(settings.country        || 'India')
      setCurrency(settings.currency      || '₹')
      setNumberFormat(settings.numberFormat || 'indian')
      setDateFormat(settings.dateFormat  || 'DD-MM-YYYY')
      setFiscalMonth(settings.fiscalMonth)
      setDefaultAccount(settings.defaultAccount || '')
      setReportSubtitle(settings.reportSubtitle || '')
      setChurchName(church.name    || '')
      setDiocese(church.diocese    || '')
      setAccounts(accts)
      const ob = {}
      accts.forEach(a => { ob[a.id] = { balance: String(a.opening_balance || ''), date: a.opening_date || '' } })
      setObForm(ob)
    } catch (e) {
      toast('Failed to load settings: ' + e.message, 'error')
    }
    setLoading(false)
  }, [toast])

  useEffect(() => { load() }, [load])

  function tryUnlock() {
    if (unlockInput === MASTER_PASSWORD) {
      setLocked(false); setUnlockError(''); setUnlockInput('')
    } else {
      setUnlockError('Incorrect password. Please try again.')
    }
  }

  function handleCountryChange(c) {
    setCountry(c)
    const preset = COUNTRY_PRESETS[c]
    if (preset) {
      setCurrency(preset.currency)
      setNumberFormat(preset.numberFormat)
      setDateFormat(preset.dateFormat)
    }
  }

  async function handleSave() {
    setSaving(true)
    try {
      await saveSimpleSettings({
        currency:       currency.trim() || '₹',
        fiscalMonth:    parseInt(fiscalMonth),
        defaultAccount: defaultAccount || null,
        country,
        numberFormat,
        dateFormat,
        reportSubtitle: reportSubtitle.trim(),
      })
      toast('Settings saved', 'success')
    } catch (e) {
      toast('Failed to save: ' + e.message, 'error')
    }
    setSaving(false)
  }

  async function handleSaveOpeningBalances() {
    setObSaving(true)
    try {
      await Promise.all(accounts.map(a =>
        updateSimpleAccount(a.id, {
          opening_balance: parseFloat(obForm[a.id]?.balance) || 0,
          opening_date:    obForm[a.id]?.date || null,
        })
      ))
      toast('Opening balances saved', 'success')
      load()
    } catch (e) {
      toast('Failed: ' + e.message, 'error')
    }
    setObSaving(false)
  }

  async function handleFlush() {
    if (flushPwd !== MASTER_PASSWORD) { setFlushErr('Incorrect master password'); return }
    setFlushing(true)
    try {
      await flushAllSimpleData()
      toast('All Simple Accounts data deleted', 'success')
      setFlushOpen(false); setFlushPwd(''); setFlushErr('')
    } catch (e) {
      toast('Failed: ' + e.message, 'error')
    }
    setFlushing(false)
  }

  async function handleExport() {
    setExportWorking(true)
    try {
      const r = await exportSimpleAccountsBackup(churchName)
      toast(`Backup downloaded — ${r.accounts} accounts, ${r.categories} categories, ${r.transactions} transactions.`, 'success')
    } catch (e) {
      toast('Export failed: ' + e.message, 'error')
    }
    setExportWorking(false)
  }

  async function handleFileChosen(e) {
    const file = e.target.files?.[0]
    if (fileInputRef.current) fileInputRef.current.value = ''
    if (!file) return
    setValidation(null)
    setValidating(true)
    try {
      setValidation(await parseAndValidateSimpleBackup(file))
    } catch (err) {
      setValidation({ valid: false, errors: [err.message], warnings: [], summary: null, parsed: null })
    }
    setValidating(false)
  }

  async function handleRestore() {
    if (restPwd !== MASTER_PASSWORD) { setRestErr('Incorrect master password'); return }
    if (!validation?.parsed) return
    setRestoring(true)
    try {
      await applySimpleBackupRestore(validation.parsed)
      toast('Restore complete! All data has been replaced from the backup.', 'success')
      setValidation(null); setRestoreOpen(false); setRestPwd(''); setRestErr('')
      load()
    } catch (e) {
      toast('Restore failed: ' + e.message, 'error')
    }
    setRestoring(false)
  }

  // Preview helpers
  const previewAmount = (() => {
    const locale = numberFormat === 'international' ? 'en-US' : 'en-IN'
    return currency + Number(123456.78).toLocaleString(locale, { minimumFractionDigits: 2 })
  })()
  const today = new Date()
  const dd = String(today.getDate()).padStart(2, '0')
  const mm = String(today.getMonth() + 1).padStart(2, '0')
  const yyyy = String(today.getFullYear())
  const previewDate = (dateFormat || 'DD-MM-YYYY')
    .replace('DD', dd).replace('MM', mm).replace('YYYY', yyyy)

  // ── Lock screen ───────────────────────────────────────────────
  if (locked) {
    return (
      <div className="page-container simple-accounts-scope">
        <button onClick={() => navigate('/simple-accounts')} title="Back to Money Book"
          style={{ display: 'inline-flex', alignItems: 'center', padding: '7px 10px', background: 'var(--card-bg)', border: '1.5px solid var(--card-border)', borderRadius: 8, cursor: 'pointer', color: 'var(--text-2)', marginBottom: 20 }}>
          <ArrowLeft size={16} />
        </button>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 380 }}>
          <div className="card" style={{ padding: '44px 40px', maxWidth: 380, width: '100%', textAlign: 'center' }}>
            <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#f0fdf4', border: '2px solid #86efac', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
              <Lock size={28} color="#16a34a" />
            </div>
            <h2 style={{ fontSize: 18, fontWeight: 800, color: 'var(--text-1)', margin: '0 0 6px' }}>Settings Locked</h2>
            <p style={{ fontSize: 13, color: 'var(--text-3)', margin: '0 0 28px', lineHeight: 1.55 }}>
              Enter the master password to access Simple Accounts settings.
            </p>
            <div style={{ position: 'relative', marginBottom: 10 }}>
              <input
                type={showPwd ? 'text' : 'password'}
                value={unlockInput}
                onChange={e => { setUnlockInput(e.target.value); setUnlockError('') }}
                onKeyDown={e => e.key === 'Enter' && tryUnlock()}
                placeholder="Master password…"
                autoFocus
                style={{ ...inputStyle, paddingRight: 44, textAlign: 'center', letterSpacing: showPwd ? 0 : 3, height: 46, fontSize: 15 }}
              />
              <button onClick={() => setShowPwd(v => !v)}
                style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', display: 'flex', padding: 4 }}>
                {showPwd ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            {unlockError && <p style={{ fontSize: 12, color: '#dc2626', margin: '0 0 10px', fontWeight: 600 }}>{unlockError}</p>}
            <button onClick={tryUnlock}
              style={{ width: '100%', height: 44, background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: 'pointer', marginTop: unlockError ? 0 : 4 }}>
              Unlock Settings
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── Loading skeleton ──────────────────────────────────────────
  if (loading) {
    return (
      <div className="page-container simple-accounts-scope">
        <div className="page-header">
          <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Settings size={20} style={{ color: 'var(--accent)' }} /> Simple Accounts Settings
          </h1>
        </div>
        <div className="card" style={{ padding: 24 }}>
          {[1,2,3,4].map(i => <div key={i} className="loading-skeleton" style={{ height: 48, borderRadius: 8, marginBottom: 14 }} />)}
        </div>
      </div>
    )
  }

  const hasAccounts = accounts.length > 0

  return (
    <div className="page-container simple-accounts-scope">
      <div className="page-header">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button onClick={() => navigate('/simple-accounts')} title="Back to Money Book"
              style={{ display: 'flex', alignItems: 'center', padding: '7px 10px', background: 'var(--card-bg)', border: '1.5px solid var(--card-border)', borderRadius: 8, cursor: 'pointer', color: 'var(--text-2)', flexShrink: 0 }}>
              <ArrowLeft size={16} />
            </button>
            <div>
              <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Settings size={20} style={{ color: 'var(--accent)' }} /> Simple Accounts Settings
              </h1>
              <p className="page-subtitle">Customise how Simple Accounts works for your church</p>
            </div>
          </div>
        </div>
      </div>

      {/* ── 1. Display & Format ──────────────────────────────── */}
      <SectionCard icon={Globe} title="Display & Format" subtitle="Set how amounts, dates and currency appear across all reports and screens.">

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 16, marginBottom: 16 }}>

          {/* Country / Region */}
          <div>
            <FL>Country / Region</FL>
            <select value={country} onChange={e => handleCountryChange(e.target.value)} style={{ ...smInputStyle }}>
              {COUNTRIES.map(c => <option key={c.country} value={c.country}>{c.country}</option>)}
            </select>
          </div>

          {/* Currency */}
          <div>
            <FL>Currency Symbol</FL>
            <input value={currency} onChange={e => { setCurrency(e.target.value); setCountry('Custom') }}
              placeholder="₹" maxLength={6} style={{ ...smInputStyle }} />
          </div>

          {/* Number format */}
          <div>
            <FL>Number Format</FL>
            <select value={numberFormat} onChange={e => { setNumberFormat(e.target.value); setCountry('Custom') }} style={{ ...smInputStyle }}>
              {NUMBER_FORMATS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
            </select>
          </div>

          {/* Date format */}
          <div>
            <FL>Date Format</FL>
            <select value={dateFormat} onChange={e => { setDateFormat(e.target.value); setCountry('Custom') }} style={{ ...smInputStyle }}>
              {DATE_FORMATS.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
          </div>

          {/* Fiscal year */}
          <div>
            <FL>Fiscal Year Start Month</FL>
            <select value={fiscalMonth} onChange={e => setFiscalMonth(e.target.value)} style={{ ...smInputStyle }}>
              {MONTHS.map((m, i) => <option key={i+1} value={i+1}>{m}</option>)}
            </select>
          </div>

          {/* Default Account */}
          <div style={{ gridColumn: 'span 2' }}>
            <FL>Default Account</FL>
            {!hasAccounts ? (
              <InfoBox>
                No accounts yet. Go to{' '}
                <button onClick={() => navigate('/simple-accounts/accounts')}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#0369a1', fontWeight: 700, fontSize: 12, padding: 0, textDecoration: 'underline' }}>
                  Manage Accounts
                </button>
                {' '}to add your Cash, Bank, and Petty Cash accounts first.
              </InfoBox>
            ) : (
              <select value={defaultAccount} onChange={e => setDefaultAccount(e.target.value)} style={{ ...smInputStyle, maxWidth: 320 }}>
                <option value="">— None —</option>
                {accounts.map(a => <option key={a.id} value={a.id}>{a.name} ({a.account_type})</option>)}
              </select>
            )}
          </div>
        </div>

        {/* Preview strip */}
        <div style={{ display: 'flex', gap: 28, padding: '10px 16px', background: 'var(--table-header-bg)', borderRadius: 8, marginBottom: 20, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Hash size={13} style={{ color: 'var(--text-3)', flexShrink: 0 }} />
            <div>
              <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-3)', margin: '0 0 2px' }}>Amount Preview</p>
              <p style={{ fontSize: 14, fontWeight: 700, fontFamily: 'monospace', color: 'var(--text-1)', margin: 0 }}>{previewAmount}</p>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Calendar size={13} style={{ color: 'var(--text-3)', flexShrink: 0 }} />
            <div>
              <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-3)', margin: '0 0 2px' }}>Date Preview</p>
              <p style={{ fontSize: 14, fontWeight: 700, fontFamily: 'monospace', color: 'var(--text-1)', margin: 0 }}>{previewDate}</p>
            </div>
          </div>
        </div>

        <div style={{ paddingTop: 4, display: 'flex', gap: 10 }}>
          <button onClick={handleSave} disabled={saving}
            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 24px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 9, fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
            {saving ? <Loader2 size={15} style={{ animation: 'spin .7s linear infinite' }} /> : <Check size={15} />}
            {saving ? 'Saving…' : 'Save Settings'}
          </button>
        </div>
      </SectionCard>

      {/* ── 2. Report Settings ──────────────────────────────── */}
      <SectionCard icon={FileText} title="Report Settings" subtitle="Appears on all printed reports and exports.">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 16 }}>
          <div>
            <FL>Church Name (from Church Setup)</FL>
            <input value={churchName} disabled
              style={{ ...smInputStyle, background: 'var(--table-header-bg)', color: 'var(--text-3)', cursor: 'not-allowed' }} />
            <p style={{ fontSize: 10, color: 'var(--text-3)', margin: '4px 0 0' }}>Edit in Church Setup</p>
          </div>
          <div>
            <FL>Diocese (from Church Setup)</FL>
            <input value={diocese} disabled
              style={{ ...smInputStyle, background: 'var(--table-header-bg)', color: 'var(--text-3)', cursor: 'not-allowed' }} />
            <p style={{ fontSize: 10, color: 'var(--text-3)', margin: '4px 0 0' }}>Shown on reports below church name</p>
          </div>
          <div>
            <FL>Additional Subtitle (optional)</FL>
            <input value={reportSubtitle} onChange={e => setReportSubtitle(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSave()}
              placeholder="e.g. Finance Department"
              style={{ ...smInputStyle }} />
            <p style={{ fontSize: 10, color: 'var(--text-3)', margin: '4px 0 0' }}>Third line on printed reports</p>
          </div>
        </div>
        <div style={{ marginTop: 18, paddingTop: 16, borderTop: '1px solid var(--card-border)' }}>
          <button onClick={handleSave} disabled={saving}
            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 24px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 9, fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
            {saving ? <Loader2 size={15} style={{ animation: 'spin .7s linear infinite' }} /> : <Check size={15} />}
            {saving ? 'Saving…' : 'Save Settings'}
          </button>
        </div>
      </SectionCard>

      {/* ── 3. Backup & Restore ──────────────────────────────── */}
      <SectionCard
        icon={Database}
        title="Backup & Restore"
        subtitle="Export all Simple Accounts data to Excel and restore from a backup file."
      >
        {/* Hidden file input */}
        <input ref={fileInputRef} type="file" accept=".xlsx" style={{ display: 'none' }} onChange={handleFileChosen} />

        {/* Export */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 18px', borderRadius: 10, background: '#f0fdf4', border: '1.5px solid #86efac', marginBottom: 12, flexWrap: 'wrap', gap: 12 }}>
          <div>
            <p style={{ fontSize: 13, fontWeight: 700, color: '#15803d', margin: '0 0 4px' }}>Export Full Backup</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 16px' }}>
              {['Accounts', 'Categories', 'All Transactions'].map(item => (
                <span key={item} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#166534' }}>
                  <ShieldCheck size={11} /> {item}
                </span>
              ))}
            </div>
          </div>
          <button onClick={handleExport} disabled={exportWorking} className="action-btn"
            style={{ background: '#16a34a', opacity: exportWorking ? 0.6 : 1, flexShrink: 0 }}>
            {exportWorking ? <Loader2 size={13} style={{ animation: 'spin .7s linear infinite' }} /> : <FileSpreadsheet size={13} />}
            {exportWorking ? 'Exporting…' : 'Excel Export'}
          </button>
        </div>

        {/* Restore */}
        <div style={{ padding: '16px 18px', borderRadius: 10, background: '#f5f3ff', border: '1.5px solid #c4b5fd' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: validation ? 16 : 0 }}>
            <div>
              <p style={{ fontSize: 13, fontWeight: 700, color: '#6d28d9', margin: '0 0 3px' }}>Restore from Backup</p>
              <p style={{ fontSize: 11, color: 'var(--text-3)', margin: 0 }}>Choose an exported .xlsx file. All current data will be replaced.</p>
            </div>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={validating}
              style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 18px', background: validating ? '#c4b5fd' : '#7c3aed', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: validating ? 'not-allowed' : 'pointer', flexShrink: 0 }}>
              {validating ? <Loader2 size={14} style={{ animation: 'spin .7s linear infinite' }} /> : <Upload size={14} />}
              {validating ? 'Validating…' : 'Choose Backup File (.xlsx)'}
            </button>
          </div>

          {/* Validation result */}
          {validation && (
            <div style={{ borderTop: '1px solid #ddd6fe', paddingTop: 16 }}>
              {validation.valid ? (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                    <ShieldCheck size={18} color="#16a34a" />
                    <p style={{ fontSize: 13, fontWeight: 700, color: '#15803d', margin: 0 }}>Backup file validated successfully</p>
                  </div>
                  {validation.summary && (
                    <div style={{ marginBottom: 12 }}>
                      {validation.summary.churchName && (
                        <p style={{ fontSize: 12, color: 'var(--text-2)', margin: '0 0 8px' }}>
                          Church: <strong>{validation.summary.churchName}</strong>
                          {validation.summary.exportDate && (
                            <span style={{ marginLeft: 12, color: 'var(--text-3)', fontSize: 11 }}>
                              Exported: {new Date(validation.summary.exportDate).toLocaleDateString('en-IN', { dateStyle: 'medium' })}
                            </span>
                          )}
                        </p>
                      )}
                      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                        {[
                          { label: 'Accounts',     value: validation.summary.accounts,     color: '#dbeafe', text: '#1d4ed8' },
                          { label: 'Categories',   value: validation.summary.categories,   color: '#dcfce7', text: '#15803d' },
                          { label: 'Transactions', value: validation.summary.transactions, color: '#f3e8ff', text: '#7c3aed' },
                        ].map(({ label, value, color, text }) => (
                          <div key={label} style={{ padding: '4px 12px', borderRadius: 6, background: color }}>
                            <span style={{ fontSize: 16, fontWeight: 800, color: text }}>{value}</span>
                            <span style={{ fontSize: 10, fontWeight: 600, color: text, marginLeft: 5 }}>{label}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {validation.warnings.length > 0 && (
                    <div style={{ padding: '10px 14px', background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 8, marginBottom: 12 }}>
                      <p style={{ fontSize: 11, fontWeight: 700, color: '#d97706', margin: '0 0 6px', display: 'flex', alignItems: 'center', gap: 5 }}>
                        <AlertCircle size={12} /> {validation.warnings.length} warning{validation.warnings.length > 1 ? 's' : ''}
                      </p>
                      {validation.warnings.map((w, i) => (
                        <p key={i} style={{ fontSize: 11, color: '#92400e', margin: '2px 0 0', paddingLeft: 17 }}>{w}</p>
                      ))}
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                    <button onClick={() => setValidation(null)}
                      style={{ padding: '8px 16px', background: 'var(--card-bg)', border: '1.5px solid var(--card-border)', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer', color: 'var(--text-2)' }}>
                      Cancel
                    </button>
                    <button onClick={() => { setRestoreOpen(true); setRestPwd(''); setRestErr('') }}
                      style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 18px', background: '#7c3aed', color: '#fff', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                      <Lock size={13} /> Restore Now — requires master password
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                    <XCircle size={18} color="#b91c1c" />
                    <p style={{ fontSize: 13, fontWeight: 700, color: '#b91c1c', margin: 0 }}>Validation failed — this file cannot be restored</p>
                  </div>
                  <div style={{ padding: '10px 14px', background: '#fff5f5', border: '1px solid #fca5a5', borderRadius: 8, marginBottom: 12 }}>
                    {validation.errors.map((err, i) => (
                      <p key={i} style={{ fontSize: 11, color: '#b91c1c', margin: i === 0 ? 0 : '4px 0 0' }}>• {err}</p>
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                    <button onClick={() => setValidation(null)}
                      style={{ padding: '8px 16px', background: 'var(--card-bg)', border: '1.5px solid var(--card-border)', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer', color: 'var(--text-2)' }}>
                      Dismiss
                    </button>
                    <button onClick={() => { setValidation(null); fileInputRef.current?.click() }}
                      style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 16px', background: '#7c3aed', color: '#fff', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                      <Upload size={13} /> Try Another File
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </SectionCard>

      {/* ── 4. Opening Balances ──────────────────────────────── */}
      <div className="card" style={{ padding: '24px 28px', marginBottom: 20, maxWidth: 680 }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-1)', margin: '0 0 8px', paddingBottom: 12, borderBottom: '1px solid var(--card-border)' }}>
          Opening Balances
        </h3>
        <p style={{ fontSize: 12, color: 'var(--text-3)', margin: '0 0 16px', lineHeight: 1.65 }}>
          <strong style={{ color: 'var(--text-2)' }}>What is this?</strong> If you are starting this system with money already in your accounts, enter those amounts here. The system adds these opening amounts to all calculations so your balances are accurate from day one.
        </p>

        {!hasAccounts ? (
          <InfoBox>
            No accounts found. Go to{' '}
            <button onClick={() => navigate('/simple-accounts/accounts')}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#0369a1', fontWeight: 700, fontSize: 12, padding: 0, textDecoration: 'underline' }}>
              Manage Accounts
            </button>
            {' '}and create your Cash, Bank, and Petty Cash accounts first.
          </InfoBox>
        ) : (
          <>
            <div style={{ borderRadius: 8, border: '1px solid var(--card-border)', overflow: 'hidden', marginBottom: 20 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 150px 150px', background: 'var(--sidebar-item-active-bg)', padding: '8px 14px', borderBottom: '1px solid var(--card-border)' }}>
                <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-3)' }}>Account</span>
                <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-3)' }}>Opening Balance</span>
                <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-3)' }}>As of Date</span>
              </div>
              {accounts.map((a, i) => {
                const tc = a.account_type === 'cash' ? { color: '#16a34a', bg: '#dcfce7' }
                         : a.account_type === 'bank' ? { color: '#2563eb', bg: '#dbeafe' }
                         :                             { color: '#7c3aed', bg: '#f3e8ff' }
                return (
                  <div key={a.id} style={{ display: 'grid', gridTemplateColumns: '1fr 150px 150px', padding: '10px 14px', alignItems: 'center', borderBottom: i < accounts.length - 1 ? '1px solid var(--card-border)' : 'none' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: tc.bg, color: tc.color, textTransform: 'capitalize' }}>{a.account_type}</span>
                      <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-1)' }}>{a.name}</span>
                    </div>
                    <div style={{ paddingRight: 10 }}>
                      <input
                        type="number" min="0" step="0.01"
                        value={obForm[a.id]?.balance ?? ''}
                        onChange={e => setObForm(f => ({ ...f, [a.id]: { ...f[a.id], balance: e.target.value } }))}
                        placeholder="0.00"
                        style={{ height: 36, width: '100%', padding: '0 10px', border: '1.5px solid var(--card-border)', borderRadius: 7, fontSize: 13, background: 'var(--input-bg)', color: 'var(--text-1)', outline: 'none', boxSizing: 'border-box' }}
                      />
                    </div>
                    <div>
                      <input
                        type="date"
                        value={obForm[a.id]?.date ?? ''}
                        onChange={e => setObForm(f => ({ ...f, [a.id]: { ...f[a.id], date: e.target.value } }))}
                        style={{ height: 36, width: '100%', padding: '0 10px', border: '1.5px solid var(--card-border)', borderRadius: 7, fontSize: 13, background: 'var(--input-bg)', color: 'var(--text-1)', outline: 'none', boxSizing: 'border-box' }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
            <button onClick={handleSaveOpeningBalances} disabled={obSaving}
              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 24px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 9, fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
              {obSaving ? <Loader2 size={15} style={{ animation: 'spin .7s linear infinite' }} /> : <Check size={15} />}
              {obSaving ? 'Saving…' : 'Save Opening Balances'}
            </button>
          </>
        )}
      </div>

      {/* ── Accounts reminder ────────────────────────────────── */}
      {!hasAccounts && (
        <div className="card" style={{ padding: '20px 28px', maxWidth: 680, display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
          <div style={{ width: 44, height: 44, borderRadius: 10, background: '#dbeafe', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Wallet size={20} color="#2563eb" />
          </div>
          <div style={{ flex: 1 }}>
            <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)', margin: '0 0 2px' }}>Set up your accounts first</p>
            <p style={{ fontSize: 12, color: 'var(--text-3)', margin: 0, lineHeight: 1.5 }}>
              Create Cash, Bank, and Petty Cash accounts to start recording transactions.
            </p>
          </div>
          <button onClick={() => navigate('/simple-accounts/accounts')}
            style={{ padding: '9px 20px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 9, fontSize: 13, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>
            Manage Accounts →
          </button>
        </div>
      )}

      {/* ── Danger Zone ──────────────────────────────────────── */}
      <div className="card" style={{ padding: '24px 28px', maxWidth: 680, border: '1.5px solid #fca5a5' }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: '#dc2626', margin: '0 0 8px', display: 'flex', alignItems: 'center', gap: 8 }}>
          <AlertTriangle size={15} /> Danger Zone
        </h3>
        <p style={{ fontSize: 12, color: 'var(--text-3)', margin: '0 0 18px', lineHeight: 1.65 }}>
          Actions here are irreversible. Use with extreme caution.
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '14px 18px', background: '#fff5f5', borderRadius: 10, border: '1px solid #fecaca' }}>
          <div style={{ flex: 1 }}>
            <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)', margin: '0 0 3px' }}>Delete All Simple Accounts Data</p>
            <p style={{ fontSize: 11, color: 'var(--text-3)', margin: 0 }}>
              Permanently deletes all transactions, accounts, and categories. Cannot be undone. Requires master password.
            </p>
          </div>
          <button onClick={() => { setFlushOpen(true); setFlushPwd(''); setFlushErr('') }}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px', background: '#dc2626', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}>
            <Trash2 size={13} /> Clear All
          </button>
        </div>
      </div>

      {/* ── Flush confirm modal ─────────────────────────────── */}
      {flushOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: 'var(--card-bg)', borderRadius: 16, padding: '32px 36px', maxWidth: 420, width: '100%', boxShadow: '0 24px 64px rgba(0,0,0,0.28)', textAlign: 'center' }}>
            <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#fee2e2', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 18px' }}>
              <AlertTriangle size={26} color="#dc2626" />
            </div>
            <h3 style={{ fontSize: 17, fontWeight: 800, color: 'var(--text-1)', margin: '0 0 8px' }}>Delete All Data?</h3>
            <p style={{ fontSize: 13, color: 'var(--text-3)', margin: '0 0 20px', lineHeight: 1.6 }}>
              This will <strong>permanently delete</strong> all transactions, accounts, and categories from Simple Accounts. This cannot be undone.
            </p>
            <input
              type="password"
              value={flushPwd}
              onChange={e => { setFlushPwd(e.target.value); setFlushErr('') }}
              onKeyDown={e => e.key === 'Enter' && handleFlush()}
              placeholder="Master password…"
              autoFocus
              style={{ ...inputStyle, marginBottom: 8, textAlign: 'center', letterSpacing: 3 }}
            />
            {flushErr && <p style={{ fontSize: 12, color: '#dc2626', margin: '0 0 10px', fontWeight: 600 }}>{flushErr}</p>}
            <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
              <button onClick={() => setFlushOpen(false)}
                style={{ flex: 1, height: 42, background: 'var(--card-bg)', border: '1.5px solid var(--card-border)', borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: 'pointer', color: 'var(--text-2)' }}>
                Cancel
              </button>
              <button onClick={handleFlush} disabled={flushing}
                style={{ flex: 1, height: 42, background: '#dc2626', color: '#fff', border: 'none', borderRadius: 9, fontSize: 13, fontWeight: 700, cursor: flushing ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                {flushing ? <Loader2 size={14} style={{ animation: 'spin .7s linear infinite' }} /> : <Trash2 size={14} />}
                {flushing ? 'Deleting…' : 'Yes, Delete All'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Restore confirm modal ───────────────────────────── */}
      {restoreOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: 'var(--card-bg)', borderRadius: 16, padding: '32px 36px', maxWidth: 420, width: '100%', boxShadow: '0 24px 64px rgba(0,0,0,0.28)', textAlign: 'center' }}>
            <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#f5f3ff', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 18px' }}>
              <Lock size={26} color="#7c3aed" />
            </div>
            <h3 style={{ fontSize: 17, fontWeight: 800, color: 'var(--text-1)', margin: '0 0 8px' }}>Confirm Restore from Backup</h3>
            <p style={{ fontSize: 13, color: 'var(--text-3)', margin: '0 0 20px', lineHeight: 1.6 }}>
              This will <strong>permanently replace</strong> all current accounts, categories, and transactions with the backup file contents. This cannot be undone. Enter the master password to confirm.
            </p>
            <input
              type="password"
              value={restPwd}
              onChange={e => { setRestPwd(e.target.value); setRestErr('') }}
              onKeyDown={e => e.key === 'Enter' && handleRestore()}
              placeholder="Master password…"
              autoFocus
              style={{ ...inputStyle, marginBottom: 8, textAlign: 'center', letterSpacing: 3 }}
            />
            {restErr && <p style={{ fontSize: 12, color: '#dc2626', margin: '0 0 10px', fontWeight: 600 }}>{restErr}</p>}
            <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
              <button onClick={() => setRestoreOpen(false)}
                style={{ flex: 1, height: 42, background: 'var(--card-bg)', border: '1.5px solid var(--card-border)', borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: 'pointer', color: 'var(--text-2)' }}>
                Cancel
              </button>
              <button onClick={handleRestore} disabled={restoring}
                style={{ flex: 2, height: 42, background: '#7c3aed', color: '#fff', border: 'none', borderRadius: 9, fontSize: 13, fontWeight: 700, cursor: restoring ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                {restoring ? <Loader2 size={14} style={{ animation: 'spin .7s linear infinite' }} /> : <Upload size={14} />}
                {restoring ? 'Restoring…' : 'Replace & Restore'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
