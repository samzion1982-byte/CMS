/* ═══════════════════════════════════════════════════════════════
   BankAccountsPage.jsx — Manage multiple church bank accounts
   ═══════════════════════════════════════════════════════════════ */

import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useToast } from '../lib/toast'
import { useEntity } from '../lib/EntityContext'
import { supabase } from '../lib/supabase'
import { getChartOfAccounts, getPostableAccountsWithPath, fmtAmt } from '../lib/accountingLib'
import {
  Building2, ArrowLeft, Plus, Pencil, Trash2, Loader2, Save,
  X, CheckCircle, CreditCard, Hash, ChevronDown, ChevronUp,
} from 'lucide-react'

const ACCOUNT_TYPES = ['Savings', 'Current', 'Cash Credit', 'Fixed Deposit', 'Overdraft', 'Cash']

const INPUT_STYLE = {
  height: 38, padding: '0 12px', border: '1.5px solid var(--card-border)',
  borderRadius: 8, fontSize: 13, background: 'var(--input-bg)',
  color: 'var(--text-1)', outline: 'none', boxSizing: 'border-box', width: '100%',
}

function FL({ children }) {
  return (
    <label style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-3)', display: 'block', marginBottom: 6 }}>
      {children}
    </label>
  )
}

// ── Bank Account form modal ───────────────────────────────────────

function BankModal({ editing, coaAccounts, onSave, onCancel }) {
  const isEdit = !!editing

  const [bankName,         setBankName]         = useState(editing?.bank_name           || '')
  const [holderName,       setHolderName]       = useState(editing?.account_holder_name || '')
  const [accountNumber,    setAccountNumber]    = useState(editing?.account_number       || '')
  const [branch,           setBranch]           = useState(editing?.branch               || '')
  const [ifscCode,         setIfscCode]         = useState(editing?.ifsc_code            || '')
  const [swiftCode,        setSwiftCode]        = useState(editing?.swift_code           || '')
  const [accountType,      setAccountType]      = useState(editing?.account_type         || 'Savings')
  const [openingBalance,   setOpeningBalance]   = useState(editing?.opening_balance      ?? 0)
  const [openingDate,      setOpeningDate]      = useState(editing?.opening_date         || '')
  const [coaAccountId,     setCoaAccountId]     = useState(editing?.coa_account_id       || '')
  const [notes,            setNotes]            = useState(editing?.notes                || '')
  const [saving,           setSaving]           = useState(false)

  async function handleSave() {
    if (!bankName.trim() || !holderName.trim() || !accountNumber.trim()) return
    setSaving(true)
    await onSave({
      bank_name:           bankName.trim(),
      account_holder_name: holderName.trim(),
      account_number:      accountNumber.trim(),
      branch:              branch.trim()     || null,
      ifsc_code:           ifscCode.trim()   || null,
      swift_code:          swiftCode.trim()  || null,
      account_type:        accountType,
      opening_balance:     Number(openingBalance) || 0,
      opening_date:        openingDate || null,
      coa_account_id:      coaAccountId || null,
      notes:               notes.trim() || null,
    })
    setSaving(false)
  }

  const canSave = bankName.trim() && holderName.trim() && accountNumber.trim()

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 2000, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ background: 'var(--card-bg)', borderRadius: 16, width: '100%', maxWidth: 560, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 24px 60px rgba(0,0,0,0.25)' }}>
        {/* Header */}
        <div style={{ padding: '18px 22px 14px', borderBottom: '1px solid var(--card-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, background: 'var(--card-bg)', zIndex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Building2 size={16} style={{ color: 'var(--accent)' }} />
            <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-1)', margin: 0 }}>
              {isEdit ? 'Edit Bank Account' : 'Add Bank Account'}
            </p>
          </div>
          <button onClick={onCancel} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', display: 'flex' }}>
            <X size={16} />
          </button>
        </div>

        {/* Form */}
        <div style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Row 1: Bank Name + Account Type */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 160px', gap: 14 }}>
            <div>
              <FL>Bank Name *</FL>
              <input value={bankName} onChange={e => setBankName(e.target.value)}
                placeholder="e.g. State Bank of India"
                style={INPUT_STYLE} />
            </div>
            <div>
              <FL>Account Type</FL>
              <select value={accountType} onChange={e => setAccountType(e.target.value)} style={INPUT_STYLE}>
                {ACCOUNT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>

          {/* Row 2: Account Holder */}
          <div>
            <FL>Account Holder Name *</FL>
            <input value={holderName} onChange={e => setHolderName(e.target.value)}
              placeholder="Name as on bank account"
              style={INPUT_STYLE} />
          </div>

          {/* Row 3: Account Number + Branch */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div>
              <FL>Account Number *</FL>
              <input value={accountNumber} onChange={e => setAccountNumber(e.target.value)}
                placeholder="e.g. 00123456789"
                style={{ ...INPUT_STYLE, fontFamily: 'monospace', letterSpacing: '0.05em' }} />
            </div>
            <div>
              <FL>Branch</FL>
              <input value={branch} onChange={e => setBranch(e.target.value)}
                placeholder="Branch name or city"
                style={INPUT_STYLE} />
            </div>
          </div>

          {/* Row 4: IFSC + SWIFT */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div>
              <FL>IFSC Code</FL>
              <input value={ifscCode} onChange={e => setIfscCode(e.target.value.toUpperCase())}
                placeholder="e.g. SBIN0001234"
                style={{ ...INPUT_STYLE, fontFamily: 'monospace', textTransform: 'uppercase' }} />
            </div>
            <div>
              <FL>SWIFT Code (for international)</FL>
              <input value={swiftCode} onChange={e => setSwiftCode(e.target.value.toUpperCase())}
                placeholder="e.g. SBININBB"
                style={{ ...INPUT_STYLE, fontFamily: 'monospace', textTransform: 'uppercase' }} />
            </div>
          </div>

          {/* Row 5: Opening Balance + Date */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div>
              <FL>Opening Balance</FL>
              <input type="number" value={openingBalance} onChange={e => setOpeningBalance(e.target.value)}
                placeholder="0.00" min="0" step="0.01"
                style={{ ...INPUT_STYLE, fontFamily: 'monospace' }} />
            </div>
            <div>
              <FL>Opening Date</FL>
              <input type="date" value={openingDate} onChange={e => setOpeningDate(e.target.value)}
                style={INPUT_STYLE} />
            </div>
          </div>

          {/* COA Link */}
          <div>
            <FL>Link to Chart of Accounts (optional)</FL>
            <select value={coaAccountId} onChange={e => setCoaAccountId(e.target.value)} style={INPUT_STYLE}>
              <option value="">— Not linked —</option>
              {coaAccounts.map(a => <option key={a.id} value={a.id}>{a.path}</option>)}
            </select>
            <p style={{ fontSize: 10, color: 'var(--text-3)', margin: '4px 0 0' }}>
              Link to a ledger account to track this bank in the GL.
            </p>
          </div>

          {/* Notes */}
          <div>
            <FL>Notes (optional)</FL>
            <textarea value={notes} onChange={e => setNotes(e.target.value)}
              rows={2} placeholder="Any additional information…"
              style={{ ...INPUT_STYLE, height: 'auto', padding: '10px 12px', resize: 'vertical' }} />
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={onCancel} style={{ flex: 1, height: 42, background: 'var(--card-bg)', border: '1.5px solid var(--card-border)', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', color: 'var(--text-2)' }}>
              Cancel
            </button>
            <button onClick={handleSave} disabled={!canSave || saving}
              style={{ flex: 2, height: 42, background: canSave ? 'var(--accent)' : '#e5e7eb', color: canSave ? '#fff' : '#9ca3af', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: canSave ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}>
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              {saving ? 'Saving…' : (isEdit ? 'Save Changes' : 'Add Bank Account')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Account Card ──────────────────────────────────────────────────

function AccountCard({ account, coaAccounts, onEdit, onDelete, onToggleActive }) {
  const [expanded, setExpanded] = useState(false)
  const linked = coaAccounts.find(a => a.id === account.coa_account_id)

  const TYPE_COLOR = {
    Savings:       { bg: '#dcfce7', text: '#15803d' },
    Current:       { bg: '#dbeafe', text: '#1d4ed8' },
    'Cash Credit': { bg: '#fff7ed', text: '#c2410c' },
    'Fixed Deposit': { bg: '#f3e8ff', text: '#7c3aed' },
    Overdraft:     { bg: '#fee2e2', text: '#b91c1c' },
    Cash:          { bg: '#fefce8', text: '#854d0e' },
  }
  const clr = TYPE_COLOR[account.account_type] || TYPE_COLOR.Current

  return (
    <div className="card" style={{ padding: '16px 20px', opacity: account.is_active ? 1 : 0.6 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
        {/* Icon */}
        <div style={{ width: 44, height: 44, borderRadius: 12, background: clr.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Building2 size={20} style={{ color: clr.text }} />
        </div>

        {/* Info */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 2 }}>
            <p style={{ fontSize: 15, fontWeight: 800, color: 'var(--text-1)', margin: 0 }}>{account.bank_name}</p>
            <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 5, background: clr.bg, color: clr.text }}>{account.account_type}</span>
            {!account.is_active && <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 5, background: '#f3f4f6', color: 'var(--text-3)' }}>INACTIVE</span>}
          </div>
          <p style={{ fontSize: 12, color: 'var(--text-2)', margin: '0 0 4px' }}>{account.account_holder_name}</p>
          <p style={{ fontSize: 12, fontFamily: 'monospace', color: 'var(--text-3)', margin: 0, letterSpacing: '0.04em' }}>
            ···· {account.account_number.slice(-4)}
            {account.branch && <span style={{ marginLeft: 12, fontFamily: 'inherit' }}>· {account.branch}</span>}
          </p>
        </div>

        {/* Balance + actions */}
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <p style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-1)', margin: '0 0 6px', fontFamily: 'monospace' }}>
            {fmtAmt(account.opening_balance || 0)}
          </p>
          <p style={{ fontSize: 10, color: 'var(--text-3)', margin: '0 0 10px' }}>Opening Balance</p>
          <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
            <button onClick={() => setExpanded(v => !v)}
              style={{ padding: '5px 8px', background: 'var(--table-header-bg)', border: '1px solid var(--card-border)', borderRadius: 6, cursor: 'pointer', color: 'var(--text-3)', display: 'flex', alignItems: 'center' }}>
              {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            </button>
            <button onClick={() => onEdit(account)}
              style={{ padding: '5px 8px', background: 'var(--table-header-bg)', border: '1px solid var(--card-border)', borderRadius: 6, cursor: 'pointer', color: 'var(--text-2)', display: 'flex', alignItems: 'center' }}>
              <Pencil size={13} />
            </button>
            <button onClick={() => onToggleActive(account)}
              style={{ padding: '5px 8px', background: account.is_active ? '#fff7ed' : '#f0fdf4', border: `1px solid ${account.is_active ? '#fed7aa' : '#bbf7d0'}`, borderRadius: 6, cursor: 'pointer', color: account.is_active ? '#c2410c' : '#15803d', display: 'flex', alignItems: 'center' }}>
              {account.is_active ? <X size={13} /> : <CheckCircle size={13} />}
            </button>
            <button onClick={() => onDelete(account)}
              style={{ padding: '5px 8px', background: '#fff5f5', border: '1px solid #fca5a5', borderRadius: 6, cursor: 'pointer', color: '#b91c1c', display: 'flex', alignItems: 'center' }}>
              <Trash2 size={13} />
            </button>
          </div>
        </div>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--card-border)', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 10 }}>
          {[
            { label: 'Full Account No.', value: account.account_number },
            { label: 'IFSC',             value: account.ifsc_code  || '—' },
            { label: 'SWIFT',            value: account.swift_code || '—' },
            { label: 'Branch',           value: account.branch     || '—' },
            { label: 'Opening Date',     value: account.opening_date || '—' },
            { label: 'GL Account',       value: linked?.path || '— Not linked —' },
          ].map(({ label, value }) => (
            <div key={label}>
              <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-3)', margin: '0 0 2px' }}>{label}</p>
              <p style={{ fontSize: 12, fontFamily: label === 'Full Account No.' || label === 'IFSC' || label === 'SWIFT' ? 'monospace' : 'inherit', color: 'var(--text-1)', margin: 0, wordBreak: 'break-all' }}>{value}</p>
            </div>
          ))}
          {account.notes && (
            <div style={{ gridColumn: '1 / -1' }}>
              <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-3)', margin: '0 0 2px' }}>Notes</p>
              <p style={{ fontSize: 12, color: 'var(--text-2)', margin: 0 }}>{account.notes}</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════
//  MAIN PAGE
// ════════════════════════════════════════════════════════════════

export default function BankAccountsPage() {
  const navigate = useNavigate()
  const toast    = useToast()
  const { currentEntityId } = useEntity()

  const [loading,      setLoading]      = useState(true)
  const [accounts,     setAccounts]     = useState([])
  const [coaAccounts,  setCoaAccounts]  = useState([])
  const [modal,        setModal]        = useState(null)   // null | 'add' | { editing: account }
  const [filter,       setFilter]       = useState('active')  // 'active' | 'all'

  useEffect(() => {
    if (!currentEntityId) return
    Promise.all([
      supabase.from('bank_accounts').select('*').order('sort_order').order('created_at'),
      getChartOfAccounts(true, currentEntityId).then(all => getPostableAccountsWithPath(all)),
    ]).then(([{ data: ba, error }, coa]) => {
      if (error) toast('Could not load bank accounts: ' + error.message, 'error')
      setAccounts(ba || [])
      setCoaAccounts(coa || [])
      setLoading(false)
    })
  }, [currentEntityId, toast])

  async function handleSave(formData) {
    const user = (await supabase.auth.getUser()).data?.user
    const by   = user?.email || 'user'

    if (modal?.editing) {
      const { error } = await supabase.from('bank_accounts').update({ ...formData, updated_at: new Date().toISOString(), updated_by: by }).eq('id', modal.editing.id)
      if (error) { toast('Save failed: ' + error.message, 'error'); return }
      setAccounts(prev => prev.map(a => a.id === modal.editing.id ? { ...a, ...formData } : a))
      toast('Bank account updated.', 'success')
    } else {
      const { data: inserted, error } = await supabase.from('bank_accounts').insert({ ...formData, created_by: by, updated_by: by }).select().single()
      if (error) { toast('Save failed: ' + error.message, 'error'); return }
      setAccounts(prev => [...prev, inserted])
      toast('Bank account added.', 'success')
    }
    setModal(null)
  }

  async function handleToggleActive(account) {
    const { error } = await supabase.from('bank_accounts').update({ is_active: !account.is_active }).eq('id', account.id)
    if (error) { toast('Update failed: ' + error.message, 'error'); return }
    setAccounts(prev => prev.map(a => a.id === account.id ? { ...a, is_active: !a.is_active } : a))
  }

  async function handleDelete(account) {
    if (!window.confirm(`Delete "${account.bank_name}" account? This cannot be undone.`)) return
    const { error } = await supabase.from('bank_accounts').delete().eq('id', account.id)
    if (error) { toast('Delete failed: ' + error.message, 'error'); return }
    setAccounts(prev => prev.filter(a => a.id !== account.id))
    toast('Bank account deleted.', 'success')
  }

  const visible = accounts.filter(a => filter === 'all' ? true : a.is_active)
  const totalOpening = accounts.filter(a => a.is_active).reduce((s, a) => s + Number(a.opening_balance || 0), 0)

  if (loading) return (
    <div className="page-container">
      <div style={{ padding: 60, textAlign: 'center', color: 'var(--text-3)' }}>
        <Loader2 size={28} className="animate-spin" style={{ display: 'block', margin: '0 auto 10px' }} />
        Loading bank accounts…
      </div>
    </div>
  )

  return (
    <div className="page-container">

      {modal && (
        <BankModal
          editing={modal.editing || null}
          coaAccounts={coaAccounts}
          onSave={handleSave}
          onCancel={() => setModal(null)}
        />
      )}

      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
            <button onClick={() => navigate('/accounting')} style={{ padding: '6px 8px', background: 'var(--accent)', border: 'none', borderRadius: 7, cursor: 'pointer', display: 'flex', alignItems: 'center', color: '#fff' }}>
              <ArrowLeft size={15} />
            </button>
            <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--accent)', whiteSpace: 'nowrap' }}>Accounts</span>
          </div>
          <div>
            <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
              <Building2 size={20} style={{ color: 'var(--accent)' }} /> Bank Accounts
            </h1>
            <p className="page-subtitle">{accounts.filter(a => a.is_active).length} active accounts &nbsp;·&nbsp; Opening total: {fmtAmt(totalOpening)}</p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <select value={filter} onChange={e => setFilter(e.target.value)}
            style={{ height: 36, padding: '0 10px', border: '1.5px solid var(--card-border)', borderRadius: 8, fontSize: 12, background: 'var(--card-bg)', color: 'var(--text-1)', cursor: 'pointer', outline: 'none' }}>
            <option value="active">Active only</option>
            <option value="all">All accounts</option>
          </select>
          <button onClick={() => setModal({ editing: null })}
            style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 18px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            <Plus size={14} /> Add Bank Account
          </button>
        </div>
      </div>

      {/* ── Summary cards ──────────────────────────────────────── */}
      {accounts.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: 12, marginBottom: 20 }}>
          {['Savings','Current','Cash Credit','Fixed Deposit','Overdraft','Cash'].map(type => {
            const count = accounts.filter(a => a.is_active && a.account_type === type).length
            if (count === 0) return null
            const total = accounts.filter(a => a.is_active && a.account_type === type)
                                  .reduce((s, a) => s + Number(a.opening_balance || 0), 0)
            return (
              <div key={type} className="card" style={{ padding: '14px 16px' }}>
                <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: '0.07em' }}>{type}</p>
                <p style={{ fontSize: 18, fontWeight: 800, color: 'var(--text-1)', margin: '0 0 2px', fontFamily: 'monospace' }}>{count}</p>
                <p style={{ fontSize: 11, color: 'var(--text-3)', margin: 0 }}>{fmtAmt(total)} opening</p>
              </div>
            )
          })}
        </div>
      )}

      {/* ── Account list ──────────────────────────────────────── */}
      {visible.length === 0 ? (
        <div style={{ padding: '60px 24px', textAlign: 'center', background: 'var(--card-bg)', border: '1.5px solid var(--card-border)', borderRadius: 12 }}>
          <Building2 size={36} style={{ color: 'var(--text-3)', display: 'block', margin: '0 auto 12px' }} />
          <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-2)', margin: '0 0 6px' }}>No bank accounts added yet</p>
          <p style={{ fontSize: 12, color: 'var(--text-3)', margin: '0 0 20px' }}>
            Add all church bank accounts here for easy tracking and journal entry selection.
          </p>
          <button onClick={() => setModal({ editing: null })}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '10px 22px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
            <Plus size={14} /> Add First Bank Account
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {visible.map(account => (
            <AccountCard
              key={account.id}
              account={account}
              coaAccounts={coaAccounts}
              onEdit={a => setModal({ editing: a })}
              onDelete={handleDelete}
              onToggleActive={handleToggleActive}
            />
          ))}
        </div>
      )}
    </div>
  )
}
