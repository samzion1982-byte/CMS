/* ═══════════════════════════════════════════════════════════════
   SimpleAddTransactionModal.jsx — Add / Edit income or expense
   ═══════════════════════════════════════════════════════════════ */

import { useState, useEffect, useRef } from 'react'
import { X, TrendingUp, TrendingDown, ArrowLeftRight, Loader2 } from 'lucide-react'
import { useAuth } from '../../lib/AuthContext'
import { useToast } from '../../lib/toast'
import {
  getSimpleCategories, getSimpleAccounts,
  createSimpleTransaction, updateSimpleTransaction,
  todayISO,
} from '../../lib/simpleAccountsLib'

const TYPE_CONFIG = {
  income:   { label: 'Money In',    icon: TrendingUp,       color: '#16a34a', bg: '#dcfce7', border: '#86efac' },
  expense:  { label: 'Money Out',   icon: TrendingDown,     color: '#dc2626', bg: '#fee2e2', border: '#fca5a5' },
  transfer: { label: 'Transfer',    icon: ArrowLeftRight,   color: '#2563eb', bg: '#dbeafe', border: '#93c5fd' },
}

function Input({ label, required, children, hint }) {
  return (
    <div>
      <label style={{ display: 'flex', alignItems: 'baseline', gap: 4, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-3)', marginBottom: 6 }}>
        {label}
        {required && <span style={{ color: '#dc2626' }}>*</span>}
        {hint && <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0, marginLeft: 'auto', fontSize: 10, color: 'var(--text-3)' }}>{hint}</span>}
      </label>
      {children}
    </div>
  )
}

const inputStyle = {
  width: '100%', height: 40, padding: '0 12px',
  border: '1.5px solid var(--card-border)', borderRadius: 8,
  fontSize: 14, background: 'var(--input-bg)', color: 'var(--text-1)',
  outline: 'none', boxSizing: 'border-box',
}

export default function SimpleAddTransactionModal({ initialType = 'income', editTxn = null, cloneTxn = null, defaultAccountId = null, currency = '₹', onClose, onSaved }) {
  const { profile } = useAuth()
  const toast = useToast()

  const src = editTxn || cloneTxn  // source for pre-filling fields
  const [type,       setType]       = useState(src?.txn_type || initialType)
  const [amount,     setAmount]     = useState(src ? String(src.amount) : '')
  const [date,       setDate]       = useState(editTxn?.txn_date || todayISO())
  const [categoryId, setCategoryId] = useState(src?.category_id || '')
  const [accountId,  setAccountId]  = useState(src?.account_id || defaultAccountId || '')
  const [toAcctId,   setToAcctId]   = useState(src?.to_account_id || '')
  const [desc,       setDesc]       = useState(src?.description || '')
  const [refNo,      setRefNo]      = useState(editTxn?.reference_no || '')
  const [saving,     setSaving]     = useState(false)

  const [categories, setCategories] = useState([])
  const [accounts,   setAccounts]   = useState([])
  const amountRef = useRef(null)

  useEffect(() => {
    Promise.all([getSimpleCategories(), getSimpleAccounts()])
      .then(([cats, accts]) => { setCategories(cats); setAccounts(accts) })
      .catch(() => {})
    setTimeout(() => amountRef.current?.focus(), 80)
  }, [])

  // Reset category when type changes
  useEffect(() => {
    if (!editTxn) setCategoryId('')
  }, [type]) // eslint-disable-line

  const typeCats   = categories.filter(c => c.type === type)
  const catParents = typeCats.filter(c => !c.parent_id)
  const catByParent = {}
  typeCats.filter(c => c.parent_id).forEach(c => {
    if (!catByParent[c.parent_id]) catByParent[c.parent_id] = []
    catByParent[c.parent_id].push(c)
  })

  async function handleSave() {
    const amt = parseFloat(amount)
    if (!amount || isNaN(amt) || amt <= 0) { toast('Enter a valid amount', 'error'); return }
    if (!date) { toast('Select a date', 'error'); return }
    if (type === 'transfer' && !toAcctId) { toast('Select the destination account', 'error'); return }
    if (type === 'transfer' && toAcctId === accountId) { toast('Source and destination accounts must be different', 'error'); return }

    setSaving(true)
    try {
      const payload = {
        txn_type:      type,
        txn_date:      date,
        amount:        amt,
        category_id:   (type !== 'transfer' && categoryId) ? categoryId : null,
        account_id:    accountId || null,
        to_account_id: type === 'transfer' ? toAcctId : null,
        description:   desc.trim() || null,
        reference_no:  refNo.trim() || null,
      }
      if (editTxn) {
        await updateSimpleTransaction(editTxn.id, payload, profile?.email)
        toast('Transaction updated', 'success')
      } else {
        await createSimpleTransaction(payload, profile?.email)
        toast('Transaction saved', 'success')
      }
      onSaved?.()
      onClose()
    } catch (e) {
      toast('Failed to save: ' + e.message, 'error')
    }
    setSaving(false)
  }

  const cfg = TYPE_CONFIG[type]

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: 'var(--card-bg)', borderRadius: 16, width: '100%', maxWidth: 480, boxShadow: '0 24px 64px rgba(0,0,0,0.28)', overflow: 'hidden' }}>

        {/* Header */}
        <div style={{ padding: '18px 20px', borderBottom: '1px solid var(--card-border)', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: cfg.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <cfg.icon size={18} color={cfg.color} />
          </div>
          <h2 style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-1)', margin: 0, flex: 1 }}>
            {editTxn ? 'Edit Transaction' : cloneTxn ? 'Clone Transaction' : 'Add Transaction'}
          </h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 4, borderRadius: 6, display: 'flex' }}>
            <X size={18} />
          </button>
        </div>

        {/* Type toggle */}
        {(!editTxn) && (
          <div style={{ padding: '14px 20px 0', display: 'flex', gap: 8 }}>
            {Object.entries(TYPE_CONFIG).map(([key, c]) => {
              const active = type === key
              return (
                <button key={key} onClick={() => setType(key)}
                  style={{
                    flex: 1, height: 38, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                    border: `2px solid ${active ? c.color : 'var(--card-border)'}`,
                    borderRadius: 9, background: active ? c.bg : 'transparent',
                    color: active ? c.color : 'var(--text-3)',
                    fontWeight: active ? 700 : 500, fontSize: 13, cursor: 'pointer',
                    transition: 'all 0.15s',
                  }}>
                  <c.icon size={14} />
                  {c.label}
                </button>
              )
            })}
          </div>
        )}

        {/* Form */}
        <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Amount — large and prominent */}
          <Input label="Amount" required>
            <div style={{ position: 'relative' }}>
              <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 18, fontWeight: 700, color: cfg.color }}>{currency}</span>
              <input
                ref={amountRef}
                type="number" min="0" step="0.01"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                placeholder="0.00"
                style={{ ...inputStyle, height: 52, paddingLeft: 34, fontSize: 22, fontWeight: 700, color: cfg.color, borderColor: cfg.border }}
              />
            </div>
          </Input>

          {/* Date + Category row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Input label="Date" required>
              <input type="date" value={date} onChange={e => setDate(e.target.value)} style={inputStyle} />
            </Input>

            {type !== 'transfer' && (
              <Input label="Category" hint="optional">
                <select value={categoryId} onChange={e => setCategoryId(e.target.value)} style={{ ...inputStyle, appearance: 'auto' }}>
                  <option value="">— Select —</option>
                  {catParents.map(p =>
                    catByParent[p.id]?.length
                      ? <optgroup key={p.id} label={p.name}>
                          {catByParent[p.id].map(sub => <option key={sub.id} value={sub.id}>{sub.name}</option>)}
                        </optgroup>
                      : <option key={p.id} value={p.id}>{p.name}</option>
                  )}
                </select>
              </Input>
            )}
          </div>

          {/* Account(s) */}
          {type === 'transfer' ? (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Input label="From Account">
                <select value={accountId} onChange={e => setAccountId(e.target.value)} style={{ ...inputStyle, appearance: 'auto' }}>
                  <option value="">— Select —</option>
                  {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </Input>
              <Input label="To Account" required>
                <select value={toAcctId} onChange={e => setToAcctId(e.target.value)} style={{ ...inputStyle, appearance: 'auto' }}>
                  <option value="">— Select —</option>
                  {accounts.filter(a => a.id !== accountId).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </Input>
            </div>
          ) : (
            <Input label="Account" hint="optional">
              <select value={accountId} onChange={e => setAccountId(e.target.value)} style={{ ...inputStyle, appearance: 'auto' }}>
                <option value="">— Not specified —</option>
                {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </Input>
          )}

          {/* Description */}
          <Input label="Description" hint="optional">
            <input
              type="text" value={desc} onChange={e => setDesc(e.target.value)}
              placeholder="e.g. Sunday collection, Electricity bill…"
              style={inputStyle}
              onKeyDown={e => e.key === 'Enter' && handleSave()}
            />
          </Input>

          {/* Reference No */}
          <Input label="Reference No." hint="optional">
            <input
              type="text" value={refNo} onChange={e => setRefNo(e.target.value)}
              placeholder="Receipt no., cheque no.…"
              style={inputStyle}
              onKeyDown={e => e.key === 'Enter' && handleSave()}
            />
          </Input>
        </div>

        {/* Footer */}
        <div style={{ padding: '0 20px 20px', display: 'flex', gap: 10 }}>
          <button onClick={onClose} style={{ flex: 1, height: 42, background: 'transparent', border: '1.5px solid var(--card-border)', borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: 'pointer', color: 'var(--text-2)' }}>
            Cancel
          </button>
          <button onClick={handleSave} disabled={saving}
            style={{ flex: 2, height: 42, background: saving ? '#9ca3af' : cfg.color, color: '#fff', border: 'none', borderRadius: 9, fontSize: 14, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            {saving ? <Loader2 size={15} style={{ animation: 'spin .7s linear infinite' }} /> : <cfg.icon size={15} />}
            {saving ? 'Saving…' : editTxn ? 'Update' : cloneTxn ? `Clone ${cfg.label}` : `Save ${cfg.label}`}
          </button>
        </div>

      </div>
    </div>
  )
}
