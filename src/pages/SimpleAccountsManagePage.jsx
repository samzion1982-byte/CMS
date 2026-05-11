/* ═══════════════════════════════════════════════════════════════
   SimpleAccountsManagePage.jsx — Manage Cash / Bank accounts
   ═══════════════════════════════════════════════════════════════ */

import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Wallet, Plus, Pencil, Trash2, Check, X, Loader2, ArrowLeft } from 'lucide-react'
import { useAuth } from '../lib/AuthContext'
import { useToast } from '../lib/toast'
import {
  getSimpleAccounts, createSimpleAccount, updateSimpleAccount, deactivateSimpleAccount,
  getAllAccountBalances, getSimpleSettings, currentFiscalStartYear, fmtAmt, fmtDate,
} from '../lib/simpleAccountsLib'

const inputStyle = {
  height: 38, padding: '0 10px', border: '1.5px solid var(--card-border)',
  borderRadius: 7, fontSize: 13, background: 'var(--input-bg)', color: 'var(--text-1)',
  outline: 'none', boxSizing: 'border-box',
}

const ACCT_TYPES = [
  { value: 'cash', label: 'Cash', color: '#16a34a', bg: '#dcfce7' },
  { value: 'bank', label: 'Bank', color: '#2563eb', bg: '#dbeafe' },
  { value: 'other', label: 'Other', color: '#7c3aed', bg: '#f3e8ff' },
]

function typeConfig(type) {
  return ACCT_TYPES.find(t => t.value === type) || ACCT_TYPES[2]
}

const BLANK = { name: '', account_type: 'cash', opening_balance: '', opening_date: '', account_number: '' }

// FormRow MUST be defined outside the page component to avoid remount-on-every-keystroke
function FormRow({ form, setForm, saving, onSave, onCancel }) {
  return (
    <div style={{ background: 'var(--sidebar-item-active-bg)', padding: '16px 20px', borderBottom: '1px solid var(--card-border)', display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
      <div style={{ flex: '2 1 160px' }}>
        <label style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-3)', display: 'block', marginBottom: 5 }}>Account Name *</label>
        <input
          autoFocus
          value={form.name}
          onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
          placeholder="e.g. Main Cash Box, State Bank"
          style={{ ...inputStyle, width: '100%' }}
          onKeyDown={e => e.key === 'Enter' && onSave()}
        />
      </div>
      <div style={{ flex: '1 1 120px' }}>
        <label style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-3)', display: 'block', marginBottom: 5 }}>Type</label>
        <select value={form.account_type} onChange={e => setForm(f => ({ ...f, account_type: e.target.value }))} style={{ ...inputStyle, width: '100%' }}>
          {ACCT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
      </div>
      <div style={{ flex: '1 1 120px' }}>
        <label style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-3)', display: 'block', marginBottom: 5 }}>Opening Balance</label>
        <input
          type="number" min="0" step="0.01"
          value={form.opening_balance}
          onChange={e => setForm(f => ({ ...f, opening_balance: e.target.value }))}
          onKeyDown={e => e.key === 'Enter' && onSave()}
          placeholder="0.00"
          style={{ ...inputStyle, width: '100%' }}
        />
      </div>
      <div style={{ flex: '1 1 130px' }}>
        <label style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-3)', display: 'block', marginBottom: 5 }}>As of Date</label>
        <input
          type="date"
          value={form.opening_date}
          onChange={e => setForm(f => ({ ...f, opening_date: e.target.value }))}
          onKeyDown={e => e.key === 'Enter' && onSave()}
          style={{ ...inputStyle, width: '100%' }}
        />
      </div>
      {form.account_type === 'bank' && (
        <div style={{ flex: '1 1 150px' }}>
          <label style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-3)', display: 'block', marginBottom: 5 }}>Account Number</label>
          <input
            value={form.account_number}
            onChange={e => setForm(f => ({ ...f, account_number: e.target.value }))}
            onKeyDown={e => e.key === 'Enter' && onSave()}
            placeholder="e.g. 0123456789"
            style={{ ...inputStyle, width: '100%' }}
          />
        </div>
      )}
      <div style={{ display: 'flex', gap: 6, paddingBottom: 1 }}>
        <button onClick={onSave} disabled={saving}
          style={{ height: 38, padding: '0 16px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 7, fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
          {saving ? <Loader2 size={13} style={{ animation: 'spin .7s linear infinite' }} /> : <Check size={13} />}
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button onClick={onCancel}
          style={{ height: 38, padding: '0 10px', background: 'none', border: '1.5px solid var(--card-border)', borderRadius: 7, cursor: 'pointer', color: 'var(--text-2)', display: 'flex', alignItems: 'center' }}>
          <X size={14} />
        </button>
      </div>
    </div>
  )
}

export default function SimpleAccountsManagePage() {
  const { profile } = useAuth()
  const toast    = useToast()
  const navigate = useNavigate()

  const [accounts,  setAccounts]  = useState([])
  const [balances,  setBalances]  = useState({})
  const [currency,  setCurrency]  = useState('₹')
  const [fyDate,    setFyDate]    = useState('')
  const [loading,   setLoading]   = useState(true)
  const [showAdd,   setShowAdd]   = useState(false)
  const [editId,    setEditId]    = useState(null)
  const [deleteId,  setDeleteId]  = useState(null)
  const [form,      setForm]      = useState(BLANK)
  const [saving,    setSaving]    = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [settings, accts] = await Promise.all([getSimpleSettings(), getSimpleAccounts()])
      setCurrency(settings.currency)
      const fyYear = currentFiscalStartYear(settings.fiscalMonth)
      const fyMM   = String(settings.fiscalMonth).padStart(2, '0')
      setFyDate(`${fyYear}-${fyMM}-01`)
      setAccounts(accts)
      setBalances(await getAllAccountBalances(accts))
    } catch (e) {
      toast('Failed to load: ' + e.message, 'error')
    }
    setLoading(false)
  }, [toast])

  useEffect(() => { load() }, [load])

  function startEdit(acct) {
    setEditId(acct.id)
    setForm({
      name:            acct.name,
      account_type:    acct.account_type,
      opening_balance: String(acct.opening_balance || ''),
      opening_date:    acct.opening_date || '',
      account_number:  acct.account_number || '',
    })
    setShowAdd(false)
  }

  function startAdd() {
    setShowAdd(true)
    setEditId(null)
    setForm({ ...BLANK, opening_date: fyDate })
  }

  function cancelForm() {
    setShowAdd(false)
    setEditId(null)
    setForm(BLANK)
  }

  async function handleSave() {
    if (!form.name.trim()) { toast('Account name is required', 'error'); return }
    setSaving(true)
    try {
      const payload = {
        name:            form.name.trim(),
        account_type:    form.account_type,
        opening_balance: parseFloat(form.opening_balance) || 0,
        opening_date:    form.opening_date || null,
      }
      const acctNum = form.account_type === 'bank' ? form.account_number.trim() : ''
      if (acctNum) payload.account_number = acctNum
      if (editId) {
        await updateSimpleAccount(editId, payload, profile?.email)
        toast('Account updated', 'success')
        setEditId(null)
      } else {
        await createSimpleAccount(payload, profile?.email)
        toast('Account added', 'success')
        setShowAdd(false)
      }
      setForm(BLANK)
      load()
    } catch (e) {
      toast('Failed: ' + e.message, 'error')
    }
    setSaving(false)
  }

  async function handleDelete(id) {
    try {
      await deactivateSimpleAccount(id, profile?.email)
      toast('Account removed', 'success')
      setDeleteId(null)
      load()
    } catch (e) {
      toast('Failed: ' + e.message, 'error')
    }
  }

  return (
    <div className="page-container simple-accounts-scope">
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={() => navigate('/simple-accounts')} title="Back to Money Book"
            style={{ display: 'flex', alignItems: 'center', padding: '7px 10px', background: 'var(--card-bg)', border: '1.5px solid var(--card-border)', borderRadius: 8, cursor: 'pointer', color: 'var(--text-2)' }}>
            <ArrowLeft size={16} />
          </button>
          <div>
            <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Wallet size={20} style={{ color: 'var(--accent)' }} /> Accounts
            </h1>
            <p className="page-subtitle">Manage your cash, bank and other money accounts</p>
          </div>
        </div>
        <button onClick={startAdd} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 16px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
          <Plus size={14} /> Add Account
        </button>
      </div>

      <div className="card" style={{ overflow: 'hidden' }}>
        {/* Add form at top */}
        {showAdd && (
          <FormRow form={form} setForm={setForm} saving={saving} onSave={handleSave} onCancel={cancelForm} />
        )}

        {/* Table header */}
        <div style={{ background: 'var(--table-header-bg)', padding: '9px 20px', display: 'grid', gridTemplateColumns: '1fr 100px 140px 130px 140px 80px', gap: 12, borderBottom: '1px solid var(--card-border)' }}>
          {['Account Name', 'Type', 'Opening Balance', 'As of Date', 'Current Balance', ''].map(h => (
            <span key={h} style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-3)' }}>{h}</span>
          ))}
        </div>

        {loading
          ? [1,2,3].map(i => <div key={i} className="loading-skeleton" style={{ margin: '12px 20px', height: 44, borderRadius: 6 }} />)
          : accounts.length === 0
          ? (
            <div style={{ padding: '48px 20px', textAlign: 'center', color: 'var(--text-3)' }}>
              <Wallet size={32} style={{ opacity: 0.2, marginBottom: 12, display: 'block', margin: '0 auto 12px' }} />
              <p style={{ fontSize: 14, fontWeight: 600, margin: '0 0 6px', color: 'var(--text-2)' }}>No accounts yet</p>
              <p style={{ fontSize: 12, margin: '0 0 18px', color: 'var(--text-3)' }}>Add Cash, Bank, and Petty Cash accounts to start tracking balances</p>
              <button onClick={startAdd} style={{ padding: '8px 20px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                + Add Account
              </button>
            </div>
          )
          : accounts.map(acct => {
            const cfg     = typeConfig(acct.account_type)
            const balance = balances[acct.id] ?? 0
            const isEdit  = editId === acct.id
            return (
              <div key={acct.id}>
                {isEdit && (
                  <FormRow form={form} setForm={setForm} saving={saving} onSave={handleSave} onCancel={cancelForm} />
                )}
                {!isEdit && (
                  <div style={{ padding: '12px 20px', display: 'grid', gridTemplateColumns: '1fr 100px 140px 130px 140px 80px', gap: 12, alignItems: 'center', borderBottom: '1px solid var(--card-border)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ width: 32, height: 32, borderRadius: 8, background: cfg.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <Wallet size={14} color={cfg.color} />
                      </div>
                      <div>
                        <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-1)' }}>{acct.name}</span>
                        {acct.account_number && (
                          <div style={{ fontSize: 10, color: 'var(--text-3)', fontFamily: 'monospace', marginTop: 1 }}>A/c: {acct.account_number}</div>
                        )}
                      </div>
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 99, background: cfg.bg, color: cfg.color, display: 'inline-flex', width: 'fit-content' }}>
                      {cfg.label}
                    </span>
                    <span style={{ fontSize: 13, fontFamily: 'monospace', color: 'var(--text-2)' }}>{fmtAmt(acct.opening_balance, currency)}</span>
                    <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{acct.opening_date ? fmtDate(acct.opening_date) : '—'}</span>
                    <span style={{ fontSize: 15, fontWeight: 800, fontFamily: 'monospace', color: balance >= 0 ? cfg.color : '#dc2626' }}>{fmtAmt(balance, currency)}</span>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button onClick={() => startEdit(acct)} title="Edit"
                        style={{ padding: '5px 7px', background: 'none', border: '1px solid var(--card-border)', borderRadius: 6, cursor: 'pointer', color: 'var(--text-3)', display: 'flex' }}>
                        <Pencil size={12} />
                      </button>
                      <button onClick={() => setDeleteId(acct.id)} title="Remove"
                        style={{ padding: '5px 7px', background: 'none', border: '1px solid var(--card-border)', borderRadius: 6, cursor: 'pointer', color: '#dc2626', display: 'flex' }}>
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })
        }
      </div>

      {/* Delete confirm */}
      {deleteId && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'var(--card-bg)', borderRadius: 14, padding: '28px 32px', maxWidth: 360, width: '90%', boxShadow: '0 16px 48px rgba(0,0,0,0.25)', textAlign: 'center' }}>
            <div style={{ width: 48, height: 48, borderRadius: '50%', background: '#fee2e2', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              <Trash2 size={22} color="#dc2626" />
            </div>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-1)', margin: '0 0 8px' }}>Remove Account?</h3>
            <p style={{ fontSize: 13, color: 'var(--text-3)', margin: '0 0 24px', lineHeight: 1.5 }}>
              The account will be hidden. Past transactions will not be affected.
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setDeleteId(null)} style={{ flex: 1, height: 40, background: 'var(--card-bg)', border: '1.5px solid var(--card-border)', borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: 'pointer', color: 'var(--text-2)' }}>Cancel</button>
              <button onClick={() => handleDelete(deleteId)} style={{ flex: 1, height: 40, background: '#dc2626', color: '#fff', border: 'none', borderRadius: 9, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Remove</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
