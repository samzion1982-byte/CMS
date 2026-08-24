/* ═══════════════════════════════════════════════════════════════
   AccountingSettingsPage.jsx — Full Accounting Settings
   ═══════════════════════════════════════════════════════════════ */

import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useToast } from '../lib/toast'
import { supabase, getChurch } from '../lib/supabase'
import {
  flushJournalEntries, resetEntrySystemLock, lockEntrySystem,
  getChartOfAccounts, getPostableAccountsWithPath, VOUCHER_TYPES,
  getFY, fyOptions,
} from '../lib/accountingLib'
import {
  exportAccountingBackup,
  parseAndValidateBackup,
  applyBackupRestore,
} from '../lib/accountingBackup'
import {
  ArrowLeft, Settings, Save, Loader2, ClipboardList,
  Lock, Trash2, RotateCcw, AlertTriangle,
  Globe, Receipt, CreditCard, CalendarOff,
  Link2, Eye, EyeOff, Hash, Calendar,
  Download, Upload, Database, ShieldCheck, XCircle, AlertCircle,
  Plus, Pencil, X, Tag, ShieldAlert, BookOpen, Scale, Copy, Wallet, Archive, ChevronRight, BarChart2, Layers, Star,
  Church, MapPin,
} from 'lucide-react'
import { displayAccountType } from '../lib/accountingLib'
import { useEntity } from '../lib/EntityContext'
import MasterPasswordInput from '../components/MasterPasswordInput'
import { verifyMasterPassword } from '../lib/masterPassword'
import PageHeader from '../components/ui/PageHeader'
import ConfirmDialog from '../components/ui/ConfirmDialog'

const SETUP_FY_OPTIONS = fyOptions('2020-21')
function isValidFY(v) { return /^\d{4}-\d{2}$/.test(v.trim()) }

const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
]

// Comprehensive country → currency/format presets (A-Z, Custom last)
const COUNTRIES = [
  { country: 'Argentina',          currency: '$',     numberFormat: 'international', dateFormat: 'DD-MM-YYYY' },
  { country: 'Australia',          currency: 'A$',    numberFormat: 'international', dateFormat: 'DD-MM-YYYY' },
  { country: 'Bahrain',            currency: 'BD',    numberFormat: 'international', dateFormat: 'DD-MM-YYYY' },
  { country: 'Bangladesh',         currency: '৳',     numberFormat: 'international', dateFormat: 'DD-MM-YYYY' },
  { country: 'Belgium',            currency: '€',     numberFormat: 'international', dateFormat: 'DD-MM-YYYY' },
  { country: 'Brazil',             currency: 'R$',    numberFormat: 'international', dateFormat: 'DD-MM-YYYY' },
  { country: 'Canada',             currency: 'CA$',   numberFormat: 'international', dateFormat: 'DD-MM-YYYY' },
  { country: 'China',              currency: '¥',     numberFormat: 'international', dateFormat: 'YYYY-MM-DD' },
  { country: 'Colombia',           currency: '$',     numberFormat: 'international', dateFormat: 'DD-MM-YYYY' },
  { country: 'Denmark',            currency: 'kr',    numberFormat: 'international', dateFormat: 'DD-MM-YYYY' },
  { country: 'Egypt',              currency: '£',     numberFormat: 'international', dateFormat: 'DD-MM-YYYY' },
  { country: 'Ethiopia',           currency: 'Br',    numberFormat: 'international', dateFormat: 'DD-MM-YYYY' },
  { country: 'Fiji',               currency: 'FJ$',   numberFormat: 'international', dateFormat: 'DD-MM-YYYY' },
  { country: 'France',             currency: '€',     numberFormat: 'international', dateFormat: 'DD-MM-YYYY' },
  { country: 'Germany',            currency: '€',     numberFormat: 'international', dateFormat: 'DD-MM-YYYY' },
  { country: 'Ghana',              currency: '₵',     numberFormat: 'international', dateFormat: 'DD-MM-YYYY' },
  { country: 'Hong Kong',          currency: 'HK$',   numberFormat: 'international', dateFormat: 'DD-MM-YYYY' },
  { country: 'India',              currency: '₹',     numberFormat: 'indian',        dateFormat: 'DD-MM-YYYY' },
  { country: 'Indonesia',          currency: 'Rp',    numberFormat: 'international', dateFormat: 'DD-MM-YYYY' },
  { country: 'Israel',             currency: '₪',     numberFormat: 'international', dateFormat: 'DD-MM-YYYY' },
  { country: 'Italy',              currency: '€',     numberFormat: 'international', dateFormat: 'DD-MM-YYYY' },
  { country: 'Japan',              currency: '¥',     numberFormat: 'international', dateFormat: 'YYYY-MM-DD' },
  { country: 'Kenya',              currency: 'KSh',   numberFormat: 'international', dateFormat: 'DD-MM-YYYY' },
  { country: 'Kuwait',             currency: 'KD',    numberFormat: 'international', dateFormat: 'DD-MM-YYYY' },
  { country: 'Malaysia',           currency: 'RM',    numberFormat: 'international', dateFormat: 'DD-MM-YYYY' },
  { country: 'Mexico',             currency: '$',     numberFormat: 'international', dateFormat: 'DD-MM-YYYY' },
  { country: 'Myanmar',            currency: 'K',     numberFormat: 'international', dateFormat: 'DD-MM-YYYY' },
  { country: 'Nepal',              currency: 'रू',    numberFormat: 'international', dateFormat: 'DD-MM-YYYY' },
  { country: 'Netherlands',        currency: '€',     numberFormat: 'international', dateFormat: 'DD-MM-YYYY' },
  { country: 'New Zealand',        currency: 'NZ$',   numberFormat: 'international', dateFormat: 'DD-MM-YYYY' },
  { country: 'Nigeria',            currency: '₦',     numberFormat: 'international', dateFormat: 'DD-MM-YYYY' },
  { country: 'Norway',             currency: 'kr',    numberFormat: 'international', dateFormat: 'DD-MM-YYYY' },
  { country: 'Oman',               currency: 'OMR',   numberFormat: 'international', dateFormat: 'DD-MM-YYYY' },
  { country: 'Pakistan',           currency: '₨',     numberFormat: 'international', dateFormat: 'DD-MM-YYYY' },
  { country: 'Papua New Guinea',   currency: 'K',     numberFormat: 'international', dateFormat: 'DD-MM-YYYY' },
  { country: 'Philippines',        currency: '₱',     numberFormat: 'international', dateFormat: 'MM-DD-YYYY' },
  { country: 'Portugal',           currency: '€',     numberFormat: 'international', dateFormat: 'DD-MM-YYYY' },
  { country: 'Qatar',              currency: 'QR',    numberFormat: 'international', dateFormat: 'DD-MM-YYYY' },
  { country: 'Saudi Arabia',       currency: '﷼',     numberFormat: 'international', dateFormat: 'DD-MM-YYYY' },
  { country: 'Singapore',          currency: 'S$',    numberFormat: 'international', dateFormat: 'DD-MM-YYYY' },
  { country: 'South Africa',       currency: 'R',     numberFormat: 'international', dateFormat: 'DD-MM-YYYY' },
  { country: 'South Korea',        currency: '₩',     numberFormat: 'international', dateFormat: 'YYYY-MM-DD' },
  { country: 'Spain',              currency: '€',     numberFormat: 'international', dateFormat: 'DD-MM-YYYY' },
  { country: 'Sri Lanka',          currency: 'Rs',    numberFormat: 'international', dateFormat: 'DD-MM-YYYY' },
  { country: 'Sweden',             currency: 'kr',    numberFormat: 'international', dateFormat: 'YYYY-MM-DD' },
  { country: 'Switzerland',        currency: 'CHF',   numberFormat: 'international', dateFormat: 'DD-MM-YYYY' },
  { country: 'Tanzania',           currency: 'TSh',   numberFormat: 'international', dateFormat: 'DD-MM-YYYY' },
  { country: 'Thailand',           currency: '฿',     numberFormat: 'international', dateFormat: 'DD-MM-YYYY' },
  { country: 'UAE',                currency: 'د.إ',   numberFormat: 'international', dateFormat: 'DD-MM-YYYY' },
  { country: 'Uganda',             currency: 'USh',   numberFormat: 'international', dateFormat: 'DD-MM-YYYY' },
  { country: 'UK',                 currency: '£',     numberFormat: 'international', dateFormat: 'DD-MM-YYYY' },
  { country: 'USA',                currency: '$',     numberFormat: 'international', dateFormat: 'MM-DD-YYYY' },
  { country: 'Custom',             currency: '',      numberFormat: 'international', dateFormat: 'DD-MM-YYYY' },
]

// Flat lookup for easy access
const COUNTRY_PRESETS = Object.fromEntries(
  COUNTRIES.map(c => [c.country, c.country === 'Custom' ? null : { currency: c.currency, numberFormat: c.numberFormat, dateFormat: c.dateFormat }])
)

// Built-in voucher types that cannot be deleted
const BUILTIN_VOUCHER_TYPES = ['Receipt', 'Payment', 'Journal', 'Contra', 'Opening']

const DATE_FORMATS   = ['DD-MM-YYYY', 'MM-DD-YYYY', 'YYYY-MM-DD', 'DD/MM/YYYY', 'MM/DD/YYYY']
const NUMBER_FORMATS = [
  { value: 'indian',       label: 'Indian  (1,00,000.00)' },
  { value: 'international',label: 'International  (100,000.00)' },
]

const VOUCHER_PREFIXES = [
  { key: 'prefix_receipt', type: 'Receipt', default: 'RV' },
  { key: 'prefix_payment', type: 'Payment', default: 'PV' },
  { key: 'prefix_journal', type: 'Journal', default: 'JV' },
  { key: 'prefix_contra',  type: 'Contra',  default: 'CT' },
  { key: 'prefix_opening', type: 'Opening', default: 'OB' },
]

// ── Helpers ───────────────────────────────────────────────────────

function FL({ children }) {
  return (
    <label style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-3)', display: 'block', marginBottom: 6 }}>
      {children}
    </label>
  )
}

function SectionCard({ icon: Icon, title, subtitle, children, style = {} }) {
  return (
    <div className="card" style={{ padding: '22px 24px', marginBottom: 20, ...style }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 5 }}>
        <Icon size={16} style={{ color: 'var(--accent)', flexShrink: 0 }} />
        <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-1)', margin: 0 }}>{title}</p>
      </div>
      {subtitle && <p style={{ fontSize: 12, color: 'var(--text-3)', margin: '0 0 18px' }}>{subtitle}</p>}
      {children}
    </div>
  )
}

function ToggleRow({ checked, onChange, label, desc }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '12px 16px', borderRadius: 9,
      background: checked ? '#f0fdf4' : 'var(--table-header-bg)',
      border: `1.5px solid ${checked ? '#86efac' : 'var(--card-border)'}`,
      gap: 16, flexWrap: 'wrap',
    }}>
      <div>
        <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)', margin: '0 0 2px' }}>{label}</p>
        <p style={{ fontSize: 11, color: 'var(--text-3)', margin: 0 }}>{desc}</p>
      </div>
      <button onClick={() => onChange(!checked)} style={{
        width: 44, height: 24, borderRadius: 99, border: 'none', cursor: 'pointer',
        background: checked ? '#16a34a' : '#d1d5db', position: 'relative',
        transition: 'background 0.2s', flexShrink: 0,
      }}>
        <span style={{
          position: 'absolute', top: 2,
          left: checked ? 22 : 2,
          width: 20, height: 20, borderRadius: '50%', background: '#fff',
          transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
        }} />
      </button>
    </div>
  )
}

// ── Master Password Modal ─────────────────────────────────────────

function MasterPasswordModal({ title, description, confirmLabel, confirmColor = '#b91c1c', onConfirm, onCancel }) {
  const [password, setPassword] = useState('')
  const [showPw,   setShowPw]   = useState(false)
  const [error,    setError]    = useState('')
  const [working,  setWorking]  = useState(false)
  const inputRef = useRef(null)

  useEffect(() => { setTimeout(() => inputRef.current?.focus(), 60) }, [])

  async function handleConfirm() {
    setWorking(true)
    setError('')
    try {
      const ok = await verifyMasterPassword(password)
      if (!ok) {
        setError('Incorrect password. Please try again.')
        setPassword('')
        return
      }
      await onConfirm()
    } finally {
      setWorking(false)
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 3000, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ background: 'var(--card-bg)', borderRadius: 16, width: '100%', maxWidth: 400, boxShadow: '0 24px 60px rgba(0,0,0,0.3)', overflow: 'hidden' }}>
        <div style={{ padding: '22px 24px 18px', borderBottom: '1px solid var(--card-border)', textAlign: 'center' }}>
          <div style={{ width: 50, height: 50, borderRadius: 14, background: '#fee2e2', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
            <Lock size={22} color="#b91c1c" />
          </div>
          <p style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-1)', margin: '0 0 6px' }}>{title}</p>
          <p style={{ fontSize: 12, color: 'var(--text-3)', margin: 0, lineHeight: 1.5 }}>{description}</p>
        </div>
        <div style={{ padding: '20px 24px' }}>
          <FL>Master Password</FL>
          <div style={{ position: 'relative' }}>
            <MasterPasswordInput ref={inputRef} showPlain={showPw} value={password}
              onChange={e => { setPassword(e.target.value); setError('') }}
              onKeyDown={e => e.key === 'Enter' && handleConfirm()}
              placeholder="Enter master password…"
              style={{ width: '100%', height: 42, padding: '0 40px 0 14px', border: `1.5px solid ${error ? '#b91c1c' : 'var(--card-border)'}`, borderRadius: 9, fontSize: 14, background: 'var(--input-bg)', color: 'var(--text-1)', outline: 'none', boxSizing: 'border-box', letterSpacing: showPw ? 'normal' : '0.1em' }} />
            <button type="button" onClick={() => setShowPw(v => !v)} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', display: 'flex' }}>
              {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>
          {error && <p style={{ fontSize: 12, color: '#b91c1c', margin: '6px 0 0', fontWeight: 600 }}>{error}</p>}
        </div>
        <div style={{ padding: '0 24px 22px', display: 'flex', gap: 10 }}>
          <button onClick={onCancel} disabled={working} style={{ flex: 1, height: 40, background: 'var(--card-bg)', border: '1.5px solid var(--card-border)', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', color: 'var(--text-2)' }}>Cancel</button>
          <button onClick={handleConfirm} disabled={!password || working} style={{ flex: 2, height: 40, background: password ? confirmColor : '#e5e7eb', color: password ? '#fff' : '#9ca3af', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: password ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}>
            {working ? <Loader2 size={13} className="animate-spin" /> : <Lock size={13} />}
            {working ? 'Processing…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Settings page lock screen (master password required to open) ──

function SettingsLockScreen({ onUnlock }) {
  const [password, setPassword] = useState('')
  const [showPw,   setShowPw]   = useState(false)
  const [error,    setError]    = useState('')
  const inputRef = useRef(null)
  useEffect(() => { setTimeout(() => inputRef.current?.focus(), 80) }, [])

  async function attempt() {
    const ok = await verifyMasterPassword(password)
    if (ok) onUnlock()
    else { setError('Incorrect password.'); setPassword('') }
  }

  return (
    <div style={{ minHeight: '80vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ background: 'var(--card-bg)', borderRadius: 20, width: '100%', maxWidth: 420, boxShadow: '0 24px 60px rgba(0,0,0,0.18)', overflow: 'hidden' }}>
        <div style={{ padding: '32px 32px 24px', textAlign: 'center' }}>
          <div style={{ width: 60, height: 60, borderRadius: 18, background: '#fee2e2', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
            <Lock size={26} color="#b91c1c" />
          </div>
          <p style={{ fontSize: 18, fontWeight: 800, color: 'var(--text-1)', margin: '0 0 6px' }}>Account Settings</p>
          <p style={{ fontSize: 13, color: 'var(--text-3)', margin: 0, lineHeight: 1.5 }}>
            Enter the master password to access accounting settings.
          </p>
        </div>
        <div style={{ padding: '0 32px 28px' }}>
          <FL>Master Password</FL>
          <div style={{ position: 'relative', marginBottom: 14 }}>
            <MasterPasswordInput ref={inputRef} showPlain={showPw} value={password}
              onChange={e => { setPassword(e.target.value); setError('') }}
              onKeyDown={e => e.key === 'Enter' && attempt()}
              placeholder="Enter master password…"
              style={{ ...INPUT_STYLE, letterSpacing: showPw ? 'normal' : '0.12em', border: `1.5px solid ${error ? '#b91c1c' : 'var(--card-border)'}` }} />
            <button type="button" onClick={() => setShowPw(v => !v)} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', display: 'flex' }}>
              {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>
          {error && <p style={{ fontSize: 12, color: '#b91c1c', fontWeight: 600, margin: '-8px 0 10px' }}>{error}</p>}
          <button onClick={attempt} disabled={!password}
            style={{ width: '100%', height: 44, background: password ? '#b91c1c' : '#e5e7eb', color: password ? '#fff' : '#9ca3af', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: password ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <Lock size={15} /> Unlock Settings
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Custom Voucher Type modal ──────────────────────────────────────

function VoucherTypeModal({ editing, onSave, onCancel }) {
  const [name,   setName]   = useState(editing?.name   || '')
  const [prefix, setPrefix] = useState(editing?.prefix || '')
  const [color,  setColor]  = useState(editing?.color  || 'blue')

  const COLOR_OPTS = [
    { value: 'blue',   label: 'Blue',   bg: '#dbeafe', text: '#1d4ed8' },
    { value: 'green',  label: 'Green',  bg: '#dcfce7', text: '#16a34a' },
    { value: 'purple', label: 'Purple', bg: '#f3e8ff', text: '#7c3aed' },
    { value: 'orange', label: 'Orange', bg: '#fff7ed', text: '#c2410c' },
    { value: 'pink',   label: 'Pink',   bg: '#fce7f3', text: '#be185d' },
  ]

  function handleSave() {
    const n = name.trim()
    const p = prefix.trim().toUpperCase().slice(0, 4)
    if (!n || !p) return
    if (BUILTIN_VOUCHER_TYPES.includes(n)) return
    onSave({ name: n, prefix: p, color })
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 3000, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ background: 'var(--card-bg)', borderRadius: 16, width: '100%', maxWidth: 380, boxShadow: '0 24px 60px rgba(0,0,0,0.25)', overflow: 'hidden' }}>
        <div style={{ padding: '18px 22px', borderBottom: '1px solid var(--card-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-1)', margin: 0 }}>{editing ? 'Edit Voucher Type' : 'Add Voucher Type'}</p>
          <button onClick={onCancel} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', display: 'flex' }}><X size={16} /></button>
        </div>
        <div style={{ padding: '18px 22px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <FL>Voucher Type Name</FL>
            <input value={name} onChange={e => setName(e.target.value)}
              placeholder="e.g. Tithe Receipt, Salary, Building Fund…"
              style={{ ...INPUT_STYLE }} />
          </div>
          <div>
            <FL>Entry Number Prefix (2–4 chars)</FL>
            <input value={prefix} onChange={e => setPrefix(e.target.value.toUpperCase().slice(0, 4))}
              placeholder="e.g. TR, SF, SL"
              style={{ ...INPUT_STYLE, fontFamily: 'monospace', fontWeight: 700, textTransform: 'uppercase' }} />
          </div>
          <div>
            <FL>Badge Color</FL>
            <div style={{ display: 'flex', gap: 8 }}>
              {COLOR_OPTS.map(c => (
                <button key={c.value} onClick={() => setColor(c.value)}
                  style={{ flex: 1, padding: '6px 4px', borderRadius: 7, border: `2px solid ${color === c.value ? c.text : 'transparent'}`, background: c.bg, cursor: 'pointer', fontSize: 10, fontWeight: 700, color: c.text }}>
                  {c.label}
                </button>
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, paddingTop: 4 }}>
            <button onClick={onCancel} style={{ flex: 1, height: 40, background: 'var(--card-bg)', border: '1.5px solid var(--card-border)', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', color: 'var(--text-2)' }}>Cancel</button>
            <button onClick={handleSave} disabled={!name.trim() || !prefix.trim()}
              style={{ flex: 2, height: 40, background: (name.trim() && prefix.trim()) ? 'var(--accent)' : '#e5e7eb', color: (name.trim() && prefix.trim()) ? '#fff' : '#9ca3af', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: (name.trim() && prefix.trim()) ? 'pointer' : 'not-allowed' }}>
              {editing ? 'Save Changes' : 'Add Type'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════
//  MAIN PAGE
// ════════════════════════════════════════════════════════════════

const INPUT_STYLE = { height: 38, padding: '0 12px', border: '1.5px solid var(--card-border)', borderRadius: 8, fontSize: 13, background: 'var(--input-bg)', color: 'var(--text-1)', outline: 'none', boxSizing: 'border-box', width: '100%' }

export default function AccountingSettingsPage() {
  const navigate = useNavigate()
  const toast    = useToast()
  const { entities, currentEntityId, defaultEntityId, switchEntity, setDefaultEntity, reload: reloadEntities } = useEntity()

  const [pageUnlocked, setPageUnlocked] = useState(() => sessionStorage.getItem('ac_settings_unlocked') === '1')
  const [loading,     setLoading]     = useState(true)
  const [saving,      setSaving]      = useState(false)
  const [churchId,    setChurchId]    = useState(null)
  const [churchName,  setChurchName]  = useState('')
  const [acEnabled,   setAcEnabled]   = useState(false)
  const [accounts,    setAccounts]    = useState([])
  const [dangerModal, setDangerModal] = useState(null)
  const [voucherModal, setVoucherModal] = useState(null) // null | 'add' | { editing: obj, idx: number }

  // ── Form state ────────────────────────────────────────────────
  const [entrySystem,   setEntrySystem]   = useState('double')
  const [entryLocked,   setEntryLocked]   = useState(false)

  // Display & Format
  const [country,       setCountry]       = useState('India')
  const [currency,      setCurrency]      = useState('₹')
  const [numberFormat,  setNumberFormat]  = useState('indian')
  const [dateFormat,    setDateFormat]    = useState('DD-MM-YYYY')


  const [autoPost,        setAutoPost]        = useState(false)
  const [prefixes, setPrefixes] = useState({
    prefix_receipt: 'RV', prefix_payment: 'PV', prefix_journal: 'JV',
    prefix_contra:  'CT', prefix_opening: 'OB',
  })

  // Default Accounts
  const [defaultCashId, setDefaultCashId] = useState('')
  const [defaultBankId, setDefaultBankId] = useState('')

  // Period & Dates
  const [periodLockDate, setPeriodLockDate] = useState('')
  const [openingDate,    setOpeningDate]    = useState('')

  // Receipt Integration
  const [autoPostReceipts, setAutoPostReceipts] = useState(false)

  // Fiscal Year
  const [fiscalMonth, setFiscalMonth] = useState(4)

  // Custom Voucher Types (stored as JSON in churches)
  const [customVouchers, setCustomVouchers] = useState([])  // [{name, prefix, color}]

  const [lockingSystem, setLockingSystem] = useState(false)

  // Backup & Restore
  const fileInputRef                  = useRef(null)
  const [exportWorking, setExportWorking] = useState(false)
  const [validation,    setValidation]    = useState(null)  // null | { valid, errors, warnings, summary, parsed }
  const [validating,    setValidating]    = useState(false)
  const [restoring,     setRestoring]     = useState(false)

  // Entity management (inline)
  const ENTITY_TYPES = ['Church', 'Trust', 'School', 'Complex', 'Other']
  const [entityModal,      setEntityModal]      = useState(null)  // null | 'add' | { editing: entity }
  const [entityDeleting,   setEntityDeleting]   = useState(null)
  const [confirmEntity,    setConfirmEntity]    = useState(null)
  const [entityToggling,   setEntityToggling]   = useState(null)
  const [entitySavingType, setEntitySavingType] = useState(null)
  const activeEntityCount = entities.filter(e => e.is_active).length

  // Switch entity — master password gate
  const [switchTarget,  setSwitchTarget]  = useState(null)  // entity object pending switch
  const [switchPwInput, setSwitchPwInput] = useState('')
  const [switchPwError, setSwitchPwError] = useState('')

  // ── Load church settings (no entityId needed) ─────────────────
  useEffect(() => {
    supabase.from('churches').select('*').limit(1).single().then(({ data, error }) => {
      if (error || !data) { toast('Could not load settings', 'error'); setLoading(false); return }
      setChurchId(data.id)
      setChurchName(data.church_name || '')
      setAcEnabled(!!data.accounting_enabled)
      setCustomVouchers(Array.isArray(data.accounting_custom_vouchers) ? data.accounting_custom_vouchers : [])
      setEntrySystem(data.accounting_entry_system || 'double')
      setEntryLocked(!!data.accounting_entry_system_locked)
      setCountry(data.accounting_country || 'India')
      setCurrency(data.accounting_currency || '₹')
      setNumberFormat(data.accounting_number_format || 'indian')
      setDateFormat(data.accounting_date_format || 'DD-MM-YYYY')
      setAutoPost(!!data.accounting_auto_post)
      setPrefixes({
        prefix_receipt: data.accounting_prefix_receipt || 'RV',
        prefix_payment: data.accounting_prefix_payment || 'PV',
        prefix_journal: data.accounting_prefix_journal || 'JV',
        prefix_contra:  data.accounting_prefix_contra  || 'CT',
        prefix_opening: data.accounting_prefix_opening || 'OB',
      })
      setDefaultCashId(data.accounting_default_cash_id || '')
      setDefaultBankId(data.accounting_default_bank_id || '')
      setPeriodLockDate(data.accounting_period_lock_date || '')
      setOpeningDate(data.accounting_opening_date || '')
      setAutoPostReceipts(!!data.accounting_auto_post_receipts)
      setFiscalMonth(data.accounting_fiscal_month || 4)
      setLoading(false)
    })
  }, [toast])

  // ── Load accounts list when entity changes ─────────────────────
  useEffect(() => {
    if (!currentEntityId) return
    getChartOfAccounts(true, currentEntityId).then(all => setAccounts(getPostableAccountsWithPath(all)))
  }, [currentEntityId])

  // When country changes, auto-apply presets
  function handleCountryChange(c) {
    setCountry(c)
    const preset = COUNTRY_PRESETS[c]
    if (preset) {
      setCurrency(preset.currency)
      setNumberFormat(preset.numberFormat)
      setDateFormat(preset.dateFormat)
    }
  }

  // Custom voucher type handlers
  function handleAddVoucher(v) {
    setCustomVouchers(prev => [...prev, v])
    setVoucherModal(null)
  }
  function handleEditVoucher(v, idx) {
    setCustomVouchers(prev => prev.map((item, i) => i === idx ? v : item))
    setVoucherModal(null)
  }
  function handleDeleteVoucher(idx) {
    setCustomVouchers(prev => prev.filter((_, i) => i !== idx))
  }

  // ── Backup export ─────────────────────────────────────────────
  async function handleExport() {
    setExportWorking(true)
    try {
      const result = await exportAccountingBackup()
      toast(`Backup downloaded — ${result.accounts} accounts, ${result.entries} entries, ${result.lines} lines.`, 'success')
    } catch (e) {
      toast('Export failed: ' + e.message, 'error')
    }
    setExportWorking(false)
  }

  // ── Backup file chosen → validate ─────────────────────────────
  async function handleFileChosen(e) {
    const file = e.target.files?.[0]
    if (!fileInputRef.current) return
    fileInputRef.current.value = ''
    if (!file) return
    setValidation(null)
    setValidating(true)
    try {
      const result = await parseAndValidateBackup(file)
      result._file = file  // keep reference for restore step
      setValidation(result)
    } catch (err) {
      setValidation({ valid: false, errors: [err.message], warnings: [], summary: null, parsed: null })
    }
    setValidating(false)
  }

  // ── Restore confirmed (after master password) ─────────────────
  async function handleRestore() {
    if (!validation?.parsed || !churchId) return
    setRestoring(true)
    try {
      const user = (await supabase.auth.getUser()).data?.user
      await applyBackupRestore(validation.parsed, churchId, user?.email || 'restore')
      toast('Restore complete! All data has been replaced from the backup.', 'success')
      setValidation(null)
      setDangerModal(null)
      // Reload settings from DB
      window.location.reload()
    } catch (err) {
      toast('Restore failed: ' + err.message, 'error')
    }
    setRestoring(false)
  }

  // ── Entity handlers ───────────────────────────────────────────
  async function handleEntitySave(formData) {
    if (entityModal?.editing) {
      const { error } = await supabase.from('accounting_entities').update(formData).eq('id', entityModal.editing.id)
      if (error) { toast('Save failed: ' + error.message, 'error'); return }
      toast('Book updated.', 'success')
    } else {
      const { data: newEntity, error } = await supabase.from('accounting_entities').insert(formData).select().single()
      if (error) { toast('Save failed: ' + error.message, 'error'); return }
      const { error: seedErr } = await supabase.rpc('seed_standard_coa', { p_entity_id: newEntity.id })
      if (seedErr) toast('Book created but COA seed failed: ' + seedErr.message, 'error')
      else toast('Accounting book created with standard Chart of Accounts.', 'success')
    }
    setEntityModal(null)
    reloadEntities()
  }

  async function handleEntityDelete(entity) {
    setConfirmEntity(entity)
  }

  async function confirmEntityDelete() {
    const entity = confirmEntity
    if (!entity) return
    setEntityDeleting(entity.id)
    try {
      const [{ count: coaCount }, { count: jeCount }] = await Promise.all([
        supabase.from('chart_of_accounts').select('id', { count: 'exact', head: true }).eq('entity_id', entity.id),
        supabase.from('journal_entries').select('id', { count: 'exact', head: true }).eq('entity_id', entity.id),
      ])
      if ((coaCount || 0) > 0 || (jeCount || 0) > 0) {
        toast(`Cannot delete: this book has ${coaCount || 0} accounts and ${jeCount || 0} journal entries. Rename it instead.`, 'error')
        setEntityDeleting(null)
        setConfirmEntity(null)
        return
      }
      const { error } = await supabase.from('accounting_entities').delete().eq('id', entity.id)
      if (error) throw error
      await reloadEntities()
      toast('Book deleted.', 'success')
      setConfirmEntity(null)
    } catch (e) { toast('Delete failed: ' + e.message, 'error') }
    setEntityDeleting(null)
  }

  async function handleEntityToggle(entity) {
    if (entity.is_active && activeEntityCount <= 1) { toast('Cannot deactivate the last active book.', 'error'); return }
    setEntityToggling(entity.id)
    const newVal = !entity.is_active
    const { error } = await supabase.from('accounting_entities').update({ is_active: newVal }).eq('id', entity.id)
    if (error) { toast('Update failed: ' + error.message, 'error'); setEntityToggling(null); return }
    if (!newVal && entity.id === currentEntityId) {
      const next = entities.find(e => e.id !== entity.id && e.is_active)
      if (next) switchEntity(next.id)
    }
    await reloadEntities()
    setEntityToggling(null)
    toast(`Book ${newVal ? 'activated' : 'deactivated'}.`, 'success')
  }

  async function handleSwitchConfirm() {
    const ok = await verifyMasterPassword(switchPwInput)
    if (!ok) {
      setSwitchPwError('Incorrect password.')
      setSwitchPwInput('')
      return
    }
    switchEntity(switchTarget.id)
    toast(`Switched to "${switchTarget.name}".`, 'success')
    setSwitchTarget(null)
    setSwitchPwInput('')
    setSwitchPwError('')
  }

  async function handleEntityTypeChange(entity, newType) {
    setEntitySavingType(entity.id)
    const { error } = await supabase.from('accounting_entities').update({ entity_type: newType }).eq('id', entity.id)
    if (error) toast('Update failed: ' + error.message, 'error')
    else { reloadEntities(); toast('Type updated.', 'success') }
    setEntitySavingType(null)
  }

  // ── Save ──────────────────────────────────────────────────────
  async function handleSave() {
    if (!churchId) return
    setSaving(true)
    const { error } = await supabase.from('churches').update({
      accounting_country:           country,
      accounting_currency:          currency,
      accounting_number_format:     numberFormat,
      accounting_date_format:       dateFormat,
      accounting_auto_post:         autoPost,
      accounting_prefix_receipt:    prefixes.prefix_receipt || 'RV',
      accounting_prefix_payment:    prefixes.prefix_payment || 'PV',
      accounting_prefix_journal:    prefixes.prefix_journal || 'JV',
      accounting_prefix_contra:     prefixes.prefix_contra  || 'CT',
      accounting_prefix_opening:    prefixes.prefix_opening || 'OB',
      accounting_default_cash_id:   defaultCashId   || null,
      accounting_default_bank_id:   defaultBankId   || null,
      accounting_period_lock_date:  periodLockDate  || null,
      accounting_opening_date:      openingDate     || null,
      accounting_auto_post_receipts:   autoPostReceipts,
      accounting_fiscal_month:         fiscalMonth,
      accounting_custom_vouchers:      customVouchers,
    }).eq('id', churchId)
    if (error) { toast('Failed to save: ' + error.message, 'error'); setSaving(false); return }

    toast('Settings saved.', 'success')
    setSaving(false)
  }

  // ── Danger zone ───────────────────────────────────────────────
  async function handleFlush() {
    try {
      await flushJournalEntries()
      toast('All journal entries flushed.', 'success')
      setDangerModal(null)
    } catch (e) { toast('Flush failed: ' + e.message, 'error'); throw e }
  }

  async function handleResetLock() {
    try {
      await resetEntrySystemLock(churchId)
      setEntryLocked(false)
      sessionStorage.removeItem('ac_setup_skipped')
      toast('Entry system lock reset.', 'success')
      setDangerModal(null)
    } catch (e) { toast('Reset failed: ' + e.message, 'error'); throw e }
  }

  // ── Preview helpers ───────────────────────────────────────────
  const previewAmount = numberFormat === 'indian'
    ? currency + Number(123456.78).toLocaleString('en-IN', { minimumFractionDigits: 2 })
    : currency + Number(123456.78).toLocaleString('en-US', { minimumFractionDigits: 2 })

  const today = new Date()
  const dd = String(today.getDate()).padStart(2, '0')
  const mm = String(today.getMonth() + 1).padStart(2, '0')
  const yyyy = today.getFullYear()
  const previewDate = dateFormat
    .replace('DD', dd).replace('MM', mm).replace('YYYY', yyyy)

  const fyPart = `${new Date().getFullYear()}${String(new Date().getFullYear() + 1).slice(2)}`
  const previewEntry = `${prefixes.prefix_receipt}-${fyPart}-00001`

  if (!pageUnlocked) return (
    <div className="page-container">
      <SettingsLockScreen onUnlock={() => { sessionStorage.setItem('ac_settings_unlocked', '1'); setPageUnlocked(true) }} />
    </div>
  )

  if (loading) return (
    <div className="page-container">
      <div style={{ padding: 60, textAlign: 'center', color: 'var(--text-3)' }}>
        <Loader2 size={28} className="animate-spin" style={{ display: 'block', margin: '0 auto 10px' }} />
        Loading settings…
      </div>
    </div>
  )

  // ── Inline entity add/edit modal ─────────────────────────────
  function EntityFormModal({ editing, onSave, onCancel }) {
    const isEdit = !!editing
    const [name,       setName]       = useState(editing?.name        || '')
    const [entityType, setEntityType] = useState(editing?.entity_type || 'Church')
    const [fyStart,    setFyStart]    = useState(editing?.fy_start    || getFY())
    const [diocese,    setDiocese]    = useState(editing?.diocese     || '')
    const [address,    setAddress]    = useState(editing?.address     || '')
    const [city,       setCity]       = useState(editing?.city        || '')
    const [stateVal,   setStateVal]   = useState(editing?.state       || '')
    const [phone,      setPhone]      = useState(editing?.phone       || '')
    const [email,      setEmail]      = useState(editing?.email       || '')
    const [saving2,    setSaving2]    = useState(false)

    useEffect(() => {
      if (isEdit) return
      getChurch().then(ch => {
        if (!ch) return
        if (ch.church_name)     setName(n  => n  || ch.church_name)
        if (ch.diocese)         setDiocese(d => d || ch.diocese)
        if (ch.address)         setAddress(a => a || ch.address)
        if (ch.city)            setCity(c  => c  || ch.city)
        if (ch.state)           setStateVal(s => s || ch.state)
        if (ch.whatsapp_number) setPhone(p => p  || ch.whatsapp_number)
        if (ch.email)           setEmail(e => e  || ch.email)
      })
    }, [isEdit])

    const canSave = name.trim().length > 0 && isValidFY(fyStart)

    async function doSave() {
      if (!canSave) return
      setSaving2(true)
      await onSave({
        name:        name.trim(),
        entity_type: entityType,
        fy_start:    fyStart,
        diocese:     diocese.trim()  || null,
        address:     address.trim()  || null,
        city:        city.trim()     || null,
        state:       stateVal.trim() || null,
        phone:       phone.trim()    || null,
        email:       email.trim()    || null,
      })
      setSaving2(false)
    }

    return (
      <div style={{ position: 'fixed', inset: 0, zIndex: 4000, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, overflowY: 'auto' }}>
        <div style={{ background: 'var(--card-bg)', borderRadius: 16, width: '100%', maxWidth: 540, boxShadow: '0 24px 60px rgba(0,0,0,0.28)', overflow: 'hidden', margin: 'auto' }}>
          <div style={{ padding: '18px 22px', borderBottom: '1px solid var(--card-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
              <Layers size={15} style={{ color: 'var(--accent)' }} />
              <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-1)', margin: 0 }}>{isEdit ? 'Edit Accounting Book' : 'New Accounting Book'}</p>
            </div>
            <button onClick={onCancel} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', display: 'flex' }}><X size={16} /></button>
          </div>
          <div style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 18 }}>

            {/* Book Identity */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <p style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--accent)', margin: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
                <Church size={11} /> Book Identity
              </p>
              <div>
                <FL>Book Name *</FL>
                <input value={name} onChange={e => setName(e.target.value)} autoFocus placeholder="e.g. CSI St. Paul's Church" style={{ ...INPUT_STYLE }} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <FL>Type</FL>
                  <select value={entityType} onChange={e => setEntityType(e.target.value)} style={{ ...INPUT_STYLE }}>
                    {ENTITY_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <FL>Books Beginning From *</FL>
                  <input list="fy-suggestions-settings" value={fyStart}
                    onChange={e => setFyStart(e.target.value)}
                    placeholder="e.g. 2026-27"
                    style={{ ...INPUT_STYLE, borderColor: fyStart && !isValidFY(fyStart) ? '#f87171' : undefined }} />
                  <datalist id="fy-suggestions-settings">
                    {SETUP_FY_OPTIONS.map(f => <option key={f} value={f} />)}
                  </datalist>
                  {fyStart && !isValidFY(fyStart) && (
                    <p style={{ fontSize: 10, color: '#ef4444', margin: '4px 0 0' }}>Format must be YYYY-YY (e.g. 2026-27)</p>
                  )}
                </div>
              </div>
            </div>

            {/* Contact & Report Header */}
            <div style={{ borderTop: '1px solid var(--card-border)', paddingTop: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
              <p style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--accent)', margin: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
                <MapPin size={11} /> Contact & Report Header
              </p>
              <div>
                <FL>Diocese / Association</FL>
                <input value={diocese} onChange={e => setDiocese(e.target.value)} placeholder="e.g. Diocese of Madras" style={{ ...INPUT_STYLE }} />
              </div>
              <div>
                <FL>Address</FL>
                <input value={address} onChange={e => setAddress(e.target.value)} placeholder="Street address" style={{ ...INPUT_STYLE }} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <FL>City</FL>
                  <input value={city} onChange={e => setCity(e.target.value)} placeholder="City" style={{ ...INPUT_STYLE }} />
                </div>
                <div>
                  <FL>State</FL>
                  <input value={stateVal} onChange={e => setStateVal(e.target.value)} placeholder="State" style={{ ...INPUT_STYLE }} />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <FL>Phone</FL>
                  <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="+91 …" style={{ ...INPUT_STYLE }} />
                </div>
                <div>
                  <FL>Email</FL>
                  <input value={email} onChange={e => setEmail(e.target.value)} placeholder="email@church.org" type="email" style={{ ...INPUT_STYLE }} />
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={onCancel} style={{ flex: 1, height: 40, background: 'var(--card-bg)', border: '1.5px solid var(--card-border)', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', color: 'var(--text-2)' }}>Cancel</button>
              <button onClick={doSave} disabled={!canSave || saving2}
                style={{ flex: 2, height: 40, background: canSave ? 'var(--accent)' : '#e5e7eb', color: canSave ? '#fff' : '#9ca3af', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: canSave ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}>
                {saving2 ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
                {saving2 ? 'Saving…' : (isEdit ? 'Save Changes' : 'Create Book')}
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="page-container">

      {/* Entity modal */}
      {entityModal === 'add' && <EntityFormModal onSave={handleEntitySave} onCancel={() => setEntityModal(null)} />}
      {entityModal?.editing && <EntityFormModal editing={entityModal.editing} onSave={handleEntitySave} onCancel={() => setEntityModal(null)} />}

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
              <MasterPasswordInput
                value={switchPwInput}
                onChange={e => { setSwitchPwInput(e.target.value); setSwitchPwError('') }}
                onKeyDown={e => e.key === 'Enter' && handleSwitchConfirm()}
                placeholder="Enter master password…"
                autoFocus
                style={{ ...INPUT_STYLE, letterSpacing: '0.1em', borderColor: switchPwError ? '#b91c1c' : undefined }}
              />
              {switchPwError && <p style={{ fontSize: 12, color: '#b91c1c', margin: '5px 0 0', fontWeight: 600 }}>{switchPwError}</p>}
            </div>
            <div style={{ padding: '0 26px 24px', display: 'flex', gap: 10 }}>
              <button onClick={() => { setSwitchTarget(null); setSwitchPwInput(''); setSwitchPwError('') }}
                style={{ flex: 1, height: 40, background: 'var(--card-bg)', border: '1.5px solid var(--card-border)', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', color: 'var(--text-2)' }}>
                Cancel
              </button>
              <button onClick={handleSwitchConfirm} disabled={!switchPwInput}
                style={{ flex: 2, height: 40, background: switchPwInput ? '#d97706' : '#e5e7eb', color: switchPwInput ? '#fff' : '#9ca3af', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: switchPwInput ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}>
                <Lock size={13} /> Confirm &amp; Switch
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Danger modals */}
      {/* Voucher type modal */}
      {voucherModal === 'add' && (
        <VoucherTypeModal onSave={handleAddVoucher} onCancel={() => setVoucherModal(null)} />
      )}
      {voucherModal && voucherModal !== 'add' && (
        <VoucherTypeModal editing={voucherModal.editing} onSave={v => handleEditVoucher(v, voucherModal.idx)} onCancel={() => setVoucherModal(null)} />
      )}

      {dangerModal === 'flush' && (
        <MasterPasswordModal
          title="Flush All Journal Entries"
          description="Permanently deletes all journal entries and resets account balances. Chart of Accounts is preserved."
          confirmLabel="Flush Entries" confirmColor="#b91c1c"
          onConfirm={handleFlush} onCancel={() => setDangerModal(null)}
        />
      )}
      {dangerModal === 'resetLock' && (
        <MasterPasswordModal
          title="Reset Entry System Lock"
          description="Unlocks the accounting method so you can choose Single or Double Entry again."
          confirmLabel="Reset Lock" confirmColor="#d97706"
          onConfirm={handleResetLock} onCancel={() => setDangerModal(null)}
        />
      )}
      {dangerModal === 'restore' && (
        <MasterPasswordModal
          title="Confirm Restore from Backup"
          description={`This will PERMANENTLY REPLACE all accounts, journal entries, and settings with the backup file contents. This cannot be undone.`}
          confirmLabel={restoring ? 'Restoring…' : 'Replace & Restore'}
          confirmColor="#7c3aed"
          onConfirm={handleRestore}
          onCancel={() => setDangerModal(null)}
        />
      )}

      {/* ── Header ─────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 28, paddingBottom: 22, borderBottom: '1px solid var(--card-border)', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, paddingTop: 2 }}>
          <button onClick={() => navigate('/accounting')} style={{ padding: '6px 8px', background: 'var(--accent)', border: 'none', borderRadius: 7, cursor: 'pointer', display: 'flex', alignItems: 'center', color: '#fff' }}>
            <ArrowLeft size={15} />
          </button>
          <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--accent)', whiteSpace: 'nowrap' }}>Accounts</span>
        </div>
        <PageHeader
          icon={Settings}
          title="Account Settings"
          subtitle="Configure the accounting module for your church"
          style={{ flex: 1, marginBottom: 0, paddingBottom: 0, borderBottom: 'none', minWidth: 220 }}
        >
          <button onClick={handleSave} disabled={saving}
            style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 20px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: saving ? 0.7 : 1 }}>
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            {saving ? 'Saving…' : 'Save Settings'}
          </button>
        </PageHeader>
      </div>

      {/* Module status */}
      <div style={{ padding: '12px 18px', borderRadius: 10, marginBottom: 20, background: acEnabled ? '#dcfce733' : '#fff7ed33', border: `1.5px solid ${acEnabled ? '#86efac' : '#fed7aa'}`, display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 18 }}>{acEnabled ? '✓' : '⚠'}</span>
        <div>
          <p style={{ fontSize: 13, fontWeight: 600, color: acEnabled ? '#16a34a' : '#c2410c', margin: 0 }}>
            Accounting Module is {acEnabled ? 'Enabled' : 'Disabled'}
          </p>
          <p style={{ fontSize: 11, color: 'var(--text-3)', margin: 0 }}>
            {acEnabled ? 'Active — changes take effect immediately.' : 'Enable from Church Setup first.'}
          </p>
        </div>
      </div>

      {/* ── Accounting Books (Entity Management) ────────────────── */}
      <SectionCard icon={Layers} title="Accounting Books" subtitle="Each book is a completely separate set of accounts and journal entries — e.g. Church body vs. a Trust or School.">

        {/* Warning banner */}
        <div style={{ display: 'flex', gap: 10, padding: '12px 16px', background: '#fff7ed', border: '1.5px solid #fed7aa', borderRadius: 9, marginBottom: 16 }}>
          <AlertTriangle size={15} style={{ color: '#c2410c', flexShrink: 0, marginTop: 1 }} />
          <p style={{ fontSize: 12, color: '#92400e', margin: 0, lineHeight: 1.6 }}>
            <strong>Important:</strong> Books cannot be deleted once they have accounting data (accounts or journal entries). Each book is completely isolated — data is never shared between books. Switching books changes all reports and entries across the entire module.
          </p>
        </div>

        {/* Entity rows */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
          {entities.map(entity => {
            const TYPE_CLR = { Church: { bg: '#dbeafe', text: '#1d4ed8' }, Trust: { bg: '#dcfce7', text: '#15803d' }, School: { bg: '#fef9c3', text: '#854d0e' }, Complex: { bg: '#f3e8ff', text: '#7c3aed' }, Other: { bg: '#f1f5f9', text: '#475569' } }
            const clr = TYPE_CLR[entity.entity_type] || TYPE_CLR.Other
            const isCurrent = entity.id === currentEntityId

            return (
              <div key={entity.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 9, background: isCurrent ? 'var(--sidebar-item-active-bg)' : 'var(--table-header-bg)', border: `1.5px solid ${isCurrent ? 'var(--accent)' : 'var(--card-border)'}`, opacity: entity.is_active ? 1 : 0.55 }}>
                {/* Type inline select */}
                <select
                  value={entity.entity_type}
                  onChange={e => handleEntityTypeChange(entity, e.target.value)}
                  disabled={entitySavingType === entity.id}
                  style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 5, background: clr.bg, color: clr.text, border: `1px solid ${clr.text}44`, cursor: 'pointer', outline: 'none', appearance: 'none', WebkitAppearance: 'none', flexShrink: 0 }}
                >
                  {ENTITY_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>

                {/* Name + status */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{entity.name}</p>
                  {entity.description && <p style={{ fontSize: 11, color: 'var(--text-3)', margin: '1px 0 0' }}>{entity.description}</p>}
                </div>

                {/* Badges */}
                {isCurrent && <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 5, background: '#dbeafe', color: '#1d4ed8', whiteSpace: 'nowrap', flexShrink: 0 }}>Active</span>}
                {entity.id === defaultEntityId && <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 5, background: '#fef9c3', color: '#854d0e', whiteSpace: 'nowrap', flexShrink: 0 }}>Default</span>}
                {!entity.is_active && <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 5, background: '#f3f4f6', color: 'var(--text-3)', flexShrink: 0 }}>Inactive</span>}

                {/* Actions */}
                <div style={{ display: 'flex', gap: 5, flexShrink: 0 }}>
                  {!isCurrent && entity.is_active && (
                    <button onClick={() => { setSwitchTarget(entity); setSwitchPwInput(''); setSwitchPwError('') }} title="Use this book"
                      style={{ padding: '5px 10px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                      Switch
                    </button>
                  )}
                  {/* Set as default */}
                  <button
                    onClick={() => { setDefaultEntity(entity.id); toast(`"${entity.name}" set as default book.`, 'success') }}
                    title={entity.id === defaultEntityId ? 'Default book' : 'Set as default book'}
                    style={{ padding: '5px 8px', background: entity.id === defaultEntityId ? '#fef9c3' : 'var(--card-bg)', border: `1px solid ${entity.id === defaultEntityId ? '#fde68a' : 'var(--card-border)'}`, borderRadius: 6, cursor: 'pointer', color: entity.id === defaultEntityId ? '#92400e' : 'var(--text-3)', display: 'flex', alignItems: 'center' }}>
                    <Star size={12} fill={entity.id === defaultEntityId ? '#f59e0b' : 'none'} />
                  </button>
                  <button onClick={() => setEntityModal({ editing: entity })} title="Edit"
                    style={{ padding: '5px 8px', background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: 6, cursor: 'pointer', color: 'var(--text-2)', display: 'flex', alignItems: 'center' }}>
                    <Pencil size={12} />
                  </button>
                  <button onClick={() => handleEntityToggle(entity)}
                    disabled={entityToggling === entity.id || (entity.is_active && activeEntityCount <= 1)}
                    title={entity.is_active ? 'Deactivate' : 'Activate'}
                    style={{ padding: '5px 8px', background: entity.is_active ? '#fff7ed' : '#f0fdf4', border: `1px solid ${entity.is_active ? '#fed7aa' : '#bbf7d0'}`, borderRadius: 6, cursor: 'pointer', color: entity.is_active ? '#c2410c' : '#15803d', display: 'flex', alignItems: 'center', opacity: (entity.is_active && activeEntityCount <= 1) ? 0.4 : 1 }}>
                    {entityToggling === entity.id ? <Loader2 size={12} className="animate-spin" /> : <X size={12} />}
                  </button>
                  {!isCurrent && (
                    <button onClick={() => handleEntityDelete(entity)} disabled={entityDeleting === entity.id} title="Delete (only if empty)"
                      style={{ padding: '5px 8px', background: '#fff5f5', border: '1px solid #fca5a5', borderRadius: 6, cursor: 'pointer', color: '#b91c1c', display: 'flex', alignItems: 'center' }}>
                      {entityDeleting === entity.id ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        <button onClick={() => setEntityModal('add')}
          style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 18px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
          <Plus size={14} /> Add Accounting Book
        </button>
      </SectionCard>

      {/* ── Accounting Method ─────────────────────────────────────── */}
      <SectionCard icon={BarChart2} title="Accounting Method"
        subtitle={entryLocked ? 'Your accounting method is set and locked. Use Danger Zone to reset.' : 'Choose the accounting method. Once locked, it cannot be changed without a reset.'}>

        {entryLocked ? (
          /* Locked — compact status */
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '14px 18px', borderRadius: 10, background: '#eff6ff', border: '1.5px solid #bfdbfe' }}>
            <div style={{ width: 42, height: 42, borderRadius: 10, background: '#dbeafe', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              {entrySystem === 'double' ? <BarChart2 size={20} color="#2563eb" /> : <ClipboardList size={20} color="#2563eb" />}
            </div>
            <div style={{ flex: 1 }}>
              <p style={{ fontSize: 14, fontWeight: 800, color: '#1d4ed8', margin: '0 0 3px' }}>
                {entrySystem === 'double' ? 'Double Entry System' : 'Single Entry System'}
              </p>
              <p style={{ fontSize: 12, color: '#3b82f6', margin: 0 }}>
                {entrySystem === 'double'
                  ? 'Full double-entry — every transaction has a debit and credit posting.'
                  : 'Simple cash-book style — income and payment recording only.'}
              </p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 12px', background: '#fee2e2', borderRadius: 7, flexShrink: 0 }}>
              <Lock size={12} color="#b91c1c" />
              <span style={{ fontSize: 11, fontWeight: 700, color: '#b91c1c' }}>Locked</span>
            </div>
          </div>
        ) : (
          /* Unlocked — selection cards + lock button */
          <>
            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 16 }}>
              {[
                {
                  value: 'single',
                  icon: ClipboardList,
                  title: 'Single Entry System',
                  subtitle: 'Simple cash-book style — income and payments only.',
                  bullets: ['No accounting background needed', 'Record cash received and paid out', 'Basic income & expenditure reports', 'Best for small or new churches'],
                },
                {
                  value: 'double',
                  icon: BarChart2,
                  title: 'Double Entry System',
                  subtitle: 'Full double-entry — every transaction has debit and credit.',
                  bullets: ['Chart of Accounts — Assets, Liabilities, Corpus Fund', 'Trial Balance, Balance Sheet, I&E reports', 'Audit-ready financial statements', 'Recommended for registered churches'],
                },
              ].map(card => {
                const active = entrySystem === card.value
                const Icon = card.icon
                return (
                  <div key={card.value} onClick={() => setEntrySystem(card.value)}
                    style={{ flex: 1, minWidth: 220, padding: '16px 18px', borderRadius: 12, cursor: 'pointer', border: `2px solid ${active ? 'var(--accent)' : 'var(--card-border)'}`, background: active ? 'var(--sidebar-item-active-bg)' : 'var(--card-bg)', transition: 'all 0.15s' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                      <div style={{ width: 18, height: 18, borderRadius: '50%', flexShrink: 0, border: `2px solid ${active ? 'var(--accent)' : 'var(--card-border)'}`, background: active ? 'var(--accent)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {active && <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#fff', display: 'block' }} />}
                      </div>
                      <Icon size={16} style={{ color: active ? 'var(--accent)' : 'var(--text-3)' }} />
                      <p style={{ fontSize: 13, fontWeight: 700, color: active ? 'var(--accent)' : 'var(--text-1)', margin: 0 }}>{card.title}</p>
                    </div>
                    <p style={{ fontSize: 12, color: 'var(--text-2)', margin: '0 0 8px', lineHeight: 1.5 }}>{card.subtitle}</p>
                    <ul style={{ margin: 0, padding: '0 0 0 14px', display: 'flex', flexDirection: 'column', gap: 3 }}>
                      {card.bullets.map(b => <li key={b} style={{ fontSize: 11, color: 'var(--text-3)', lineHeight: 1.4 }}>{b}</li>)}
                    </ul>
                  </div>
                )
              })}
            </div>
            <button
              onClick={async () => {
                if (!churchId) return
                setLockingSystem(true)
                try {
                  await lockEntrySystem(churchId, entrySystem)
                  setEntryLocked(true)
                  toast(`${entrySystem === 'double' ? 'Double' : 'Single'} Entry System locked.`, 'success')
                } catch (e) { toast('Failed to lock: ' + e.message, 'error') }
                setLockingSystem(false)
              }}
              disabled={lockingSystem}
              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 22px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 9, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
              {lockingSystem ? <Loader2 size={14} className="animate-spin" /> : <Lock size={14} />}
              {lockingSystem ? 'Locking…' : `Lock as ${entrySystem === 'double' ? 'Double' : 'Single'} Entry`}
            </button>
            <p style={{ fontSize: 11, color: 'var(--text-3)', margin: '8px 0 0' }}>
              Once locked this cannot be changed without using Danger Zone → Reset Entry System Lock.
            </p>
          </>
        )}
      </SectionCard>

      {/* ── Fiscal Year ──────────────────────────────────────────── */}
      <SectionCard icon={ClipboardList} title="Fiscal Year" subtitle="Set the month your financial year begins. Indian churches typically start in April.">
        <div style={{ maxWidth: 260 }}>
          <FL>Financial Year Starts In</FL>
          <select value={fiscalMonth} onChange={e => setFiscalMonth(Number(e.target.value))} style={{ ...INPUT_STYLE }}>
            {MONTHS.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
          </select>
          <p style={{ fontSize: 11, color: 'var(--text-3)', margin: '8px 0 0' }}>
            Current FY: {MONTHS[fiscalMonth - 1]} – {MONTHS[(fiscalMonth + 10) % 12]}
          </p>
        </div>
      </SectionCard>

      {/* ── Display & Format ─────────────────────────────────────── */}
      <SectionCard icon={Globe} title="Display & Format" subtitle="Set how amounts, dates and currency appear across all reports and screens.">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 16, marginBottom: 16 }}>

          {/* Country */}
          <div>
            <FL>Country / Region</FL>
            <select value={country} onChange={e => handleCountryChange(e.target.value)} style={{ ...INPUT_STYLE }}>
              {COUNTRIES.map(c => <option key={c.country} value={c.country}>{c.country}</option>)}
            </select>
          </div>

          {/* Currency */}
          <div>
            <FL>Currency Symbol</FL>
            <input value={currency} onChange={e => { setCurrency(e.target.value); setCountry('Custom') }}
              placeholder="₹" style={{ ...INPUT_STYLE }} />
          </div>

          {/* Number format */}
          <div>
            <FL>Number Format</FL>
            <select value={numberFormat} onChange={e => { setNumberFormat(e.target.value); setCountry('Custom') }} style={{ ...INPUT_STYLE }}>
              {NUMBER_FORMATS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
            </select>
          </div>

          {/* Date format */}
          <div>
            <FL>Date Format</FL>
            <select value={dateFormat} onChange={e => { setDateFormat(e.target.value); setCountry('Custom') }} style={{ ...INPUT_STYLE }}>
              {DATE_FORMATS.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
          </div>
        </div>

        {/* Preview strip */}
        <div style={{ display: 'flex', gap: 20, padding: '10px 16px', background: 'var(--table-header-bg)', borderRadius: 8, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', align: 'center', gap: 8 }}>
            <Hash size={13} style={{ color: 'var(--text-3)', marginTop: 2 }} />
            <div>
              <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-3)', margin: '0 0 2px' }}>Amount Preview</p>
              <p style={{ fontSize: 13, fontWeight: 700, fontFamily: 'monospace', color: 'var(--text-1)', margin: 0 }}>{previewAmount}</p>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Calendar size={13} style={{ color: 'var(--text-3)', marginTop: 2 }} />
            <div>
              <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-3)', margin: '0 0 2px' }}>Date Preview</p>
              <p style={{ fontSize: 13, fontWeight: 700, fontFamily: 'monospace', color: 'var(--text-1)', margin: 0 }}>{previewDate}</p>
            </div>
          </div>
        </div>
      </SectionCard>

      {/* ── 4. Voucher Types & Prefixes ──────────────────────────── */}
      <SectionCard icon={Receipt} title="Voucher Types & Prefixes" subtitle="Manage all voucher types, their entry number prefixes, and posting behaviour.">

        <ToggleRow
          checked={autoPost}
          onChange={setAutoPost}
          label="Auto-post entries on Save"
          desc="Entries are posted immediately instead of saving as drafts."
        />

        {/* Unified voucher types table */}
        <div style={{ marginTop: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <FL>All Voucher Types &amp; Prefixes</FL>
            <button onClick={() => setVoucherModal('add')}
              style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 12px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 7, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
              <Plus size={12} /> Add Custom Type
            </button>
          </div>

          <div style={{ border: '1.5px solid var(--card-border)', borderRadius: 9, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead style={{ background: 'var(--table-header-bg)' }}>
                <tr>
                  {['Voucher Type', 'Prefix', 'Entry # Preview', 'Source', ''].map(h => (
                    <th key={h} style={{ padding: '8px 14px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-3)', textAlign: 'left' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {/* Built-in types — prefix editable */}
                {BUILTIN_VOUCHER_TYPES.map(type => {
                  const pk  = `prefix_${type.toLowerCase()}`
                  const pfx = prefixes[pk] || type.slice(0, 2).toUpperCase()
                  return (
                    <tr key={type} style={{ borderTop: '1px solid var(--card-border)', background: 'var(--table-header-bg)' }}>
                      <td style={{ padding: '7px 14px', fontSize: 13, color: 'var(--text-1)', fontWeight: 600 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <Tag size={12} style={{ color: 'var(--text-3)' }} /> {type}
                        </div>
                      </td>
                      <td style={{ padding: '5px 10px', width: 110 }}>
                        <input value={prefixes[pk] || ''}
                          onChange={e => setPrefixes(p => ({ ...p, [pk]: e.target.value.toUpperCase().slice(0, 4) }))}
                          style={{ ...INPUT_STYLE, height: 30, width: 75, fontFamily: 'monospace', fontWeight: 700, textTransform: 'uppercase' }} />
                      </td>
                      <td style={{ padding: '7px 14px', fontSize: 11, fontFamily: 'monospace', color: 'var(--text-3)' }}>
                        {pfx}-{fyPart}-00001
                      </td>
                      <td style={{ padding: '7px 14px' }}>
                        <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 5, background: 'var(--card-border)', color: 'var(--text-3)', fontWeight: 700 }}>BUILT-IN</span>
                      </td>
                      <td style={{ padding: '7px 10px' }} />
                    </tr>
                  )
                })}

                {/* Custom types */}
                {customVouchers.map((v, idx) => {
                  const COLOR_MAP = {
                    blue:   { bg: '#dbeafe', text: '#1d4ed8' },
                    green:  { bg: '#dcfce7', text: '#16a34a' },
                    purple: { bg: '#f3e8ff', text: '#7c3aed' },
                    orange: { bg: '#fff7ed', text: '#c2410c' },
                    pink:   { bg: '#fce7f3', text: '#be185d' },
                  }
                  const clr = COLOR_MAP[v.color] || COLOR_MAP.blue
                  return (
                    <tr key={idx} style={{ borderTop: '1px solid var(--card-border)' }}>
                      <td style={{ padding: '7px 14px' }}>
                        <span style={{ fontSize: 12, fontWeight: 700, padding: '3px 10px', borderRadius: 6, background: clr.bg, color: clr.text }}>{v.name}</span>
                      </td>
                      <td style={{ padding: '7px 14px', fontSize: 12, fontFamily: 'monospace', fontWeight: 700, color: 'var(--text-1)' }}>{v.prefix}</td>
                      <td style={{ padding: '7px 14px', fontSize: 11, fontFamily: 'monospace', color: 'var(--text-3)' }}>
                        {v.prefix}-{fyPart}-00001
                      </td>
                      <td style={{ padding: '7px 14px' }}>
                        <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 5, background: clr.bg, color: clr.text, fontWeight: 700 }}>CUSTOM</span>
                      </td>
                      <td style={{ padding: '5px 10px', whiteSpace: 'nowrap' }}>
                        <button onClick={() => setVoucherModal({ editing: v, idx })}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: '4px 6px', borderRadius: 5, marginRight: 2 }}>
                          <Pencil size={13} />
                        </button>
                        <button onClick={() => handleDeleteVoucher(idx)}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#b91c1c', padding: '4px 6px', borderRadius: 5 }}>
                          <Trash2 size={13} />
                        </button>
                      </td>
                    </tr>
                  )
                })}

                {customVouchers.length === 0 && (
                  <tr style={{ borderTop: '1px solid var(--card-border)' }}>
                    <td colSpan={5} style={{ padding: '14px', textAlign: 'center', fontSize: 12, color: 'var(--text-3)', fontStyle: 'italic' }}>
                      No custom types yet — click Add Custom Type to create one
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <p style={{ fontSize: 10, color: 'var(--text-3)', margin: '6px 0 0' }}>
            Built-in prefixes are saved with Settings. Custom types appear alongside built-in types when creating journal entries.
          </p>
        </div>
      </SectionCard>

      {/* ── 5. Default Accounts ──────────────────────────────────── */}
      <SectionCard icon={CreditCard} title="Default Accounts" subtitle="Pre-fill these accounts when creating Cash or Bank vouchers.">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div>
            <FL>Default Cash Account</FL>
            <select value={defaultCashId} onChange={e => setDefaultCashId(e.target.value)} style={{ ...INPUT_STYLE }}>
              <option value="">— None —</option>
              {['Asset','Liability','Equity','Income','Expense'].map(type => {
                const group = accounts.filter(a => a.account_type === type)
                if (!group.length) return null
                return (
                  <optgroup key={type} label={displayAccountType(type)}>
                    {group.map(a => <option key={a.id} value={a.id}>{a.path}</option>)}
                  </optgroup>
                )
              })}
            </select>
          </div>
          <div>
            <FL>Default Bank Account</FL>
            <select value={defaultBankId} onChange={e => setDefaultBankId(e.target.value)} style={{ ...INPUT_STYLE }}>
              <option value="">— None —</option>
              {['Asset','Liability','Equity','Income','Expense'].map(type => {
                const group = accounts.filter(a => a.account_type === type)
                if (!group.length) return null
                return (
                  <optgroup key={type} label={displayAccountType(type)}>
                    {group.map(a => <option key={a.id} value={a.id}>{a.path}</option>)}
                  </optgroup>
                )
              })}
            </select>
          </div>
        </div>
      </SectionCard>

      {/* ── 6. Period Lock & Opening Date ────────────────────────── */}
      <SectionCard icon={CalendarOff} title="Period Lock & Opening Date" subtitle="Prevent edits to past periods and define when records begin.">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div>
            <FL>Period Lock Date</FL>
            <input type="date" value={periodLockDate} onChange={e => setPeriodLockDate(e.target.value)}
              style={{ ...INPUT_STYLE }} />
            <p style={{ fontSize: 10, color: 'var(--text-3)', margin: '4px 0 0' }}>
              Entries before this date cannot be created or modified.
            </p>
          </div>
          <div>
            <FL>Opening Balance Date</FL>
            <input type="date" value={openingDate} onChange={e => setOpeningDate(e.target.value)}
              style={{ ...INPUT_STYLE }} />
            <p style={{ fontSize: 10, color: 'var(--text-3)', margin: '4px 0 0' }}>
              The date from which this system's records begin.
            </p>
          </div>
        </div>
      </SectionCard>

      {/* ── 7. Receipt Integration ───────────────────────────────── */}
      <SectionCard icon={Link2} title="Receipt Integration" subtitle="Control how the Finance → Receipt module connects with accounting entries.">
        <ToggleRow
          checked={autoPostReceipts}
          onChange={setAutoPostReceipts}
          label="Auto-create GL entry when a receipt is posted"
          desc="A journal entry is automatically generated in the ledger when a receipt is saved in the Finance module."
        />
      </SectionCard>

      {/* ── Backup & Restore ─────────────────────────────────── */}
      <SectionCard
        icon={Database}
        title="Backup & Restore"
        subtitle="Export everything to Excel and restore with a single click. The backup includes all settings, chart of accounts, and every journal entry."
      >
        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx"
          style={{ display: 'none' }}
          onChange={handleFileChosen}
        />

        {/* Export row */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 18px', borderRadius: 10, background: '#f0fdf4', border: '1.5px solid #86efac', marginBottom: 12, flexWrap: 'wrap', gap: 12 }}>
          <div>
            <p style={{ fontSize: 13, fontWeight: 700, color: '#15803d', margin: '0 0 4px' }}>Export Full Backup</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 16px' }}>
              {['Settings & configuration', 'Chart of Accounts', 'All Journal Entries', 'All Entry Lines'].map(item => (
                <span key={item} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#166534' }}>
                  <ShieldCheck size={11} /> {item}
                </span>
              ))}
            </div>
          </div>
          <button
            onClick={handleExport}
            disabled={exportWorking}
            style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 18px', background: exportWorking ? '#86efac' : '#16a34a', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: exportWorking ? 'not-allowed' : 'pointer', flexShrink: 0, transition: 'background 0.15s' }}
          >
            {exportWorking ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
            {exportWorking ? 'Exporting…' : 'Download Backup (.xlsx)'}
          </button>
        </div>

        {/* Restore row */}
        <div style={{ padding: '16px 18px', borderRadius: 10, background: '#f5f3ff', border: '1.5px solid #c4b5fd' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: validation ? 16 : 0 }}>
            <div>
              <p style={{ fontSize: 13, fontWeight: 700, color: '#6d28d9', margin: '0 0 3px' }}>Restore from Backup</p>
              <p style={{ fontSize: 11, color: 'var(--text-3)', margin: 0 }}>
                Choose an exported .xlsx file. All current data will be replaced.
              </p>
            </div>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={validating}
              style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 18px', background: validating ? '#c4b5fd' : '#7c3aed', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: validating ? 'not-allowed' : 'pointer', flexShrink: 0 }}
            >
              {validating ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
              {validating ? 'Validating…' : 'Choose Backup File (.xlsx)'}
            </button>
          </div>

          {/* Validation result panel */}
          {validation && (
            <div style={{ borderTop: '1px solid #ddd6fe', paddingTop: 16 }}>
              {validation.valid ? (
                <>
                  {/* Success header */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                    <ShieldCheck size={18} color="#16a34a" />
                    <p style={{ fontSize: 13, fontWeight: 700, color: '#15803d', margin: 0 }}>Backup file validated successfully</p>
                  </div>

                  {/* Meta info */}
                  {validation.summary && (
                    <div style={{ marginBottom: 12 }}>
                      {validation.summary.churchName && (
                        <p style={{ fontSize: 12, color: 'var(--text-2)', margin: '0 0 4px' }}>
                          Church: <strong>{validation.summary.churchName}</strong>
                          {validation.summary.exportDate && (
                            <span style={{ marginLeft: 12, color: 'var(--text-3)' }}>
                              Exported: {new Date(validation.summary.exportDate).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
                            </span>
                          )}
                        </p>
                      )}
                      {/* Count pills */}
                      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 8 }}>
                        {[
                          { label: 'Accounts',       value: validation.summary.accounts,      color: '#dbeafe', text: '#1d4ed8' },
                          { label: 'Journal Entries', value: validation.summary.entries,       color: '#dcfce7', text: '#15803d' },
                          { label: 'Posted',          value: validation.summary.postedEntries, color: '#d1fae5', text: '#065f46' },
                          { label: 'Drafts',          value: validation.summary.draftEntries,  color: '#fff7ed', text: '#c2410c' },
                          { label: 'Entry Lines',     value: validation.summary.lines,         color: '#f3e8ff', text: '#7c3aed' },
                        ].map(({ label, value, color, text }) => (
                          <div key={label} style={{ padding: '4px 10px', borderRadius: 6, background: color }}>
                            <span style={{ fontSize: 16, fontWeight: 800, color: text }}>{value}</span>
                            <span style={{ fontSize: 10, fontWeight: 600, color: text, marginLeft: 5 }}>{label}</span>
                          </div>
                        ))}
                      </div>
                      {/* Debit/credit totals */}
                      {(validation.summary.totalDebit > 0 || validation.summary.totalCredit > 0) && (
                        <div style={{ display: 'flex', gap: 20, marginTop: 8 }}>
                          <p style={{ fontSize: 11, color: 'var(--text-3)', margin: 0 }}>
                            Total Debit: <strong style={{ color: 'var(--text-1)' }}>
                              ₹{Number(validation.summary.totalDebit).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                            </strong>
                          </p>
                          <p style={{ fontSize: 11, color: 'var(--text-3)', margin: 0 }}>
                            Total Credit: <strong style={{ color: 'var(--text-1)' }}>
                              ₹{Number(validation.summary.totalCredit).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                            </strong>
                          </p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Warnings */}
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

                  {/* Action buttons */}
                  <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                    <button
                      onClick={() => setValidation(null)}
                      style={{ padding: '8px 16px', background: 'var(--card-bg)', border: '1.5px solid var(--card-border)', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer', color: 'var(--text-2)' }}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => setDangerModal('restore')}
                      style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 18px', background: '#7c3aed', color: '#fff', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
                    >
                      <Lock size={13} /> Restore Now — requires master password
                    </button>
                  </div>
                </>
              ) : (
                /* Errors */
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
                    <button
                      onClick={() => setValidation(null)}
                      style={{ padding: '8px 16px', background: 'var(--card-bg)', border: '1.5px solid var(--card-border)', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer', color: 'var(--text-2)' }}
                    >
                      Dismiss
                    </button>
                    <button
                      onClick={() => { setValidation(null); fileInputRef.current?.click() }}
                      style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 16px', background: '#7c3aed', color: '#fff', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
                    >
                      <Upload size={13} /> Try Another File
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </SectionCard>

      {/* ── Administration ───────────────────────────────────── */}
      <SectionCard icon={ShieldAlert} title="Administration" subtitle="Sensitive setup tasks. Access is protected by this master password screen.">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {[
            { icon: BookOpen, label: 'Chart of Accounts',  desc: 'View and manage the account hierarchy',           path: '/accounting/chart-of-accounts' },
            { icon: Scale,    label: 'Opening Balances',   desc: 'Set account balances at the start of each FY',    path: '/accounting/opening-balances'  },
            { icon: Copy,     label: 'Journal Templates',  desc: 'Save and reuse recurring journal entries',        path: '/accounting/templates'          },
            { icon: Wallet,   label: 'Designated Funds',   desc: 'Building, Benevolence and other funds',           path: '/accounting/funds'              },
            { icon: Archive,  label: 'Year-End Closing',   desc: 'Post closing entries and close the FY',           path: '/accounting/year-end-closing'   },
          ].map(({ icon: Icon, label, desc, path }) => (
            <button key={path} onClick={() => navigate(path)}
              style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 16px', background: 'var(--table-header-bg)', border: '1.5px solid var(--card-border)', borderRadius: 9, cursor: 'pointer', textAlign: 'left', width: '100%' }}>
              <div style={{ width: 34, height: 34, borderRadius: 8, background: 'var(--sidebar-item-active-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Icon size={16} style={{ color: 'var(--accent)' }} />
              </div>
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)', margin: '0 0 2px' }}>{label}</p>
                <p style={{ fontSize: 11, color: 'var(--text-3)', margin: 0 }}>{desc}</p>
              </div>
              <ChevronRight size={15} style={{ color: 'var(--text-3)', flexShrink: 0 }} />
            </button>
          ))}
        </div>
      </SectionCard>

      {/* ── 10. Danger Zone ──────────────────────────────────────── */}
      <div className="card" style={{ padding: '22px 24px', border: '1.5px solid #fca5a5', marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 5 }}>
          <AlertTriangle size={16} color="#b91c1c" />
          <p style={{ fontSize: 14, fontWeight: 700, color: '#b91c1c', margin: 0 }}>Danger Zone</p>
        </div>
        <p style={{ fontSize: 12, color: 'var(--text-3)', margin: '0 0 18px' }}>
          Irreversible actions. Master password required.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', background: '#fff5f5', borderRadius: 10, border: '1px solid #fca5a5', flexWrap: 'wrap', gap: 12 }}>
            <div>
              <p style={{ fontSize: 13, fontWeight: 700, color: '#b91c1c', margin: '0 0 3px' }}>Flush All Journal Entries</p>
              <p style={{ fontSize: 11, color: 'var(--text-3)', margin: 0 }}>Deletes all entries and resets balances. Chart of Accounts is preserved.</p>
            </div>
            <button onClick={() => setDangerModal('flush')} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 16px', background: '#b91c1c', color: '#fff', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer', flexShrink: 0 }}>
              <Trash2 size={13} /> Flush Entries
            </button>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', background: '#fffbeb', borderRadius: 10, border: '1px solid #fcd34d', flexWrap: 'wrap', gap: 12 }}>
            <div>
              <p style={{ fontSize: 13, fontWeight: 700, color: '#d97706', margin: '0 0 3px' }}>Reset Entry System Lock</p>
              <p style={{ fontSize: 11, color: 'var(--text-3)', margin: 0 }}>
                Unlocks the accounting method selection.
                {entryLocked && <span style={{ marginLeft: 5, fontWeight: 600, color: '#d97706' }}>Currently: {entrySystem === 'double' ? 'Double Entry' : 'Single Entry'}</span>}
              </p>
            </div>
            <button onClick={() => setDangerModal('resetLock')} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 16px', background: '#d97706', color: '#fff', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer', flexShrink: 0 }}>
              <RotateCcw size={13} /> Reset Lock
            </button>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button onClick={handleSave} disabled={saving}
          style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '10px 28px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: saving ? 0.7 : 1 }}>
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          {saving ? 'Saving…' : 'Save Settings'}
        </button>
      </div>

      <ConfirmDialog
        open={!!confirmEntity}
        title="Delete book?"
        message={confirmEntity ? `Delete "${confirmEntity.name}"? This cannot be undone.` : ''}
        confirmLabel="Delete"
        danger
        busy={!!entityDeleting}
        onCancel={() => { if (!entityDeleting) setConfirmEntity(null) }}
        onConfirm={confirmEntityDelete}
      />
    </div>
  )
}
