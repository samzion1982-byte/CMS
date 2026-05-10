/* ═══════════════════════════════════════════════════════════════
   SimpleAccountsSettingsPage.jsx — Settings for Simple Accounts
   ═══════════════════════════════════════════════════════════════ */

import { useState, useEffect, useCallback } from 'react'
import { Settings, AlertTriangle, Check, Loader2 } from 'lucide-react'
import { useToast } from '../lib/toast'
import {
  getSimpleSettings, saveSimpleSettings, toggleSimpleAccounting,
  getSimpleAccounts,
} from '../lib/simpleAccountsLib'

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']

const inputStyle = {
  height: 40, padding: '0 12px', border: '1.5px solid var(--card-border)',
  borderRadius: 8, fontSize: 14, background: 'var(--input-bg)', color: 'var(--text-1)',
  outline: 'none', boxSizing: 'border-box', width: '100%',
}

function Field({ label, hint, children }) {
  return (
    <div>
      <label style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-3)', display: 'block', marginBottom: 6 }}>
        {label}
      </label>
      {children}
      {hint && <p style={{ fontSize: 11, color: 'var(--text-3)', margin: '5px 0 0', lineHeight: 1.5 }}>{hint}</p>}
    </div>
  )
}

export default function SimpleAccountsSettingsPage() {
  const toast = useToast()

  const [loading,    setLoading]    = useState(true)
  const [saving,     setSaving]     = useState(false)
  const [accounts,   setAccounts]   = useState([])
  const [showDisable,setShowDisable]= useState(false)

  const [currency,       setCurrency]       = useState('₹')
  const [fiscalMonth,    setFiscalMonth]    = useState(4)
  const [reportTitle,    setReportTitle]    = useState('')
  const [defaultAccount, setDefaultAccount] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [settings, accts] = await Promise.all([getSimpleSettings(), getSimpleAccounts()])
      setCurrency(settings.currency)
      setFiscalMonth(settings.fiscalMonth)
      setReportTitle(settings.reportTitle || '')
      setDefaultAccount(settings.defaultAccount || '')
      setAccounts(accts)
    } catch (e) {
      toast('Failed to load settings: ' + e.message, 'error')
    }
    setLoading(false)
  }, [toast])

  useEffect(() => { load() }, [load])

  async function handleSave() {
    setSaving(true)
    try {
      await saveSimpleSettings({
        currency:       currency.trim() || '₹',
        fiscalMonth:    parseInt(fiscalMonth),
        reportTitle:    reportTitle.trim(),
        defaultAccount: defaultAccount || null,
      })
      toast('Settings saved', 'success')
    } catch (e) {
      toast('Failed to save: ' + e.message, 'error')
    }
    setSaving(false)
  }

  async function handleDisable() {
    try {
      await toggleSimpleAccounting(false)
      toast('Simple Accounts disabled. Restart the page to see changes.', 'info')
      setShowDisable(false)
    } catch (e) {
      toast('Failed: ' + e.message, 'error')
    }
  }

  if (loading) {
    return (
      <div className="page-container">
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

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Settings size={20} style={{ color: 'var(--accent)' }} /> Simple Accounts Settings
          </h1>
          <p className="page-subtitle">Customise how Simple Accounts works for your church</p>
        </div>
      </div>

      {/* Main settings card */}
      <div className="card" style={{ padding: '24px 28px', marginBottom: 20, maxWidth: 640 }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-1)', margin: '0 0 20px', paddingBottom: 12, borderBottom: '1px solid var(--card-border)' }}>
          Display &amp; Format
        </h3>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

          <Field label="Currency Symbol" hint="Shown before every amount. Example: ₹, $, £, €">
            <input value={currency} onChange={e => setCurrency(e.target.value)}
              placeholder="₹" maxLength={4} style={{ ...inputStyle, width: 100 }} />
          </Field>

          <Field label="Report Title" hint="Appears at the top of printed / exported reports">
            <input value={reportTitle} onChange={e => setReportTitle(e.target.value)}
              placeholder="e.g. Grace Fellowship Church — Accounts" style={inputStyle} />
          </Field>

          <Field label="Fiscal Year Start Month" hint="The month your financial year begins. Most churches use April.">
            <select value={fiscalMonth} onChange={e => setFiscalMonth(e.target.value)} style={{ ...inputStyle, width: 200 }}>
              {MONTHS.map((m, i) => <option key={i+1} value={i+1}>{m}</option>)}
            </select>
          </Field>

          <Field label="Default Account" hint="Pre-selected account when adding income or expenses">
            <select value={defaultAccount} onChange={e => setDefaultAccount(e.target.value)} style={{ ...inputStyle, width: 260 }}>
              <option value="">— None —</option>
              {accounts.map(a => <option key={a.id} value={a.id}>{a.name} ({a.account_type})</option>)}
            </select>
          </Field>
        </div>

        <div style={{ marginTop: 24, paddingTop: 20, borderTop: '1px solid var(--card-border)', display: 'flex', gap: 10 }}>
          <button onClick={handleSave} disabled={saving}
            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 24px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 9, fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
            {saving ? <Loader2 size={15} style={{ animation: 'spin .7s linear infinite' }} /> : <Check size={15} />}
            {saving ? 'Saving…' : 'Save Settings'}
          </button>
        </div>
      </div>

      {/* Danger zone */}
      <div className="card" style={{ padding: '20px 28px', maxWidth: 640, border: '1px solid #fca5a5' }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: '#dc2626', margin: '0 0 8px', display: 'flex', alignItems: 'center', gap: 8 }}>
          <AlertTriangle size={16} /> Danger Zone
        </h3>
        <p style={{ fontSize: 13, color: 'var(--text-3)', margin: '0 0 16px', lineHeight: 1.6 }}>
          Disabling Simple Accounts will hide it from the sidebar. Your existing data will be preserved and can be re-enabled at any time from Church Setup.
        </p>
        <button onClick={() => setShowDisable(true)}
          style={{ padding: '9px 20px', background: 'none', border: '1.5px solid #dc2626', borderRadius: 8, color: '#dc2626', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
          Disable Simple Accounts
        </button>
      </div>

      {/* Disable confirm */}
      {showDisable && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'var(--card-bg)', borderRadius: 14, padding: '28px 32px', maxWidth: 380, width: '90%', boxShadow: '0 16px 48px rgba(0,0,0,0.25)', textAlign: 'center' }}>
            <div style={{ width: 52, height: 52, borderRadius: '50%', background: '#fff7ed', border: '2px solid #fed7aa', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              <AlertTriangle size={24} color="#f97316" />
            </div>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-1)', margin: '0 0 8px' }}>Disable Simple Accounts?</h3>
            <p style={{ fontSize: 13, color: 'var(--text-3)', margin: '0 0 24px', lineHeight: 1.5 }}>
              The module will be hidden from the sidebar. All your data is safe and can be restored via Church Setup.
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setShowDisable(false)} style={{ flex: 1, height: 40, background: 'var(--card-bg)', border: '1.5px solid var(--card-border)', borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: 'pointer', color: 'var(--text-2)' }}>Cancel</button>
              <button onClick={handleDisable} style={{ flex: 1, height: 40, background: '#dc2626', color: '#fff', border: 'none', borderRadius: 9, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Disable</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
