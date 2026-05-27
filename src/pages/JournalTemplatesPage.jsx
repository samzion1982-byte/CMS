/* ═══════════════════════════════════════════════════════════════
   JournalTemplatesPage.jsx — Save & reuse journal entry templates
   Uses journal_templates table (id, church_id, name, voucher_type,
   narration, lines JSONB)
   ═══════════════════════════════════════════════════════════════ */

import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import { useToast } from '../lib/toast'
import {
  fmtAmt, getChartOfAccounts, getPostableAccountsWithPath,
  createJournalEntry, nextEntryNumber, fyDateRange, VOUCHER_TYPES,
} from '../lib/accountingLib'
import { supabase, getChurch } from '../lib/supabase'
import { useEntity } from '../lib/EntityContext'
import { useEntityFY } from '../lib/useEntityFY'
import {
  ArrowLeft, Plus, Trash2, Edit2, Loader2,
  X, Save, Play, Copy,
} from 'lucide-react'

const VOUCHER_OPTS = ['Journal', 'Receipt', 'Payment', 'Contra']
const localISO = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`

// ── small helpers ────────────────────────────────────────────────
function emptyLine() {
  return { _key: Math.random(), account_id: '', account_name: '', debit_amount: '', credit_amount: '', description: '' }
}

// ── Line editor row ──────────────────────────────────────────────
function LineRow({ line, accounts, onChange, onRemove }) {
  const sel = accounts.find(a => a.id === line.account_id)
  return (
    <tr>
      <td style={{ padding: '4px 6px', width: '40%' }}>
        <select value={line.account_id}
          onChange={e => {
            const a = accounts.find(x => x.id === e.target.value)
            onChange({ ...line, account_id: e.target.value, account_name: a?.name || '' })
          }}
          style={{ width: '100%', height: 32, padding: '0 6px', border: '1.5px solid var(--card-border)', borderRadius: 6, fontSize: 12, background: 'var(--input-bg)', color: 'var(--text-1)' }}>
          <option value="">— select account —</option>
          {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </td>
      <td style={{ padding: '4px 6px', width: '25%' }}>
        <input type="number" min="0" step="0.01" placeholder="0.00" value={line.debit_amount}
          onChange={e => onChange({ ...line, debit_amount: e.target.value, credit_amount: e.target.value ? '' : line.credit_amount })}
          style={{ width: '100%', height: 32, padding: '0 8px', border: '1.5px solid var(--card-border)', borderRadius: 6, fontSize: 12, fontFamily: 'monospace', textAlign: 'right', background: 'var(--input-bg)', color: '#2563eb' }} />
      </td>
      <td style={{ padding: '4px 6px', width: '25%' }}>
        <input type="number" min="0" step="0.01" placeholder="0.00" value={line.credit_amount}
          onChange={e => onChange({ ...line, credit_amount: e.target.value, debit_amount: e.target.value ? '' : line.debit_amount })}
          style={{ width: '100%', height: 32, padding: '0 8px', border: '1.5px solid var(--card-border)', borderRadius: 6, fontSize: 12, fontFamily: 'monospace', textAlign: 'right', background: 'var(--input-bg)', color: '#16a34a' }} />
      </td>
      <td style={{ padding: '4px 6px', textAlign: 'center', width: 36 }}>
        <button onClick={onRemove} style={{ padding: '4px 6px', background: '#fee2e2', border: 'none', borderRadius: 5, cursor: 'pointer', color: '#dc2626', display: 'flex', alignItems: 'center' }}>
          <X size={12} />
        </button>
      </td>
    </tr>
  )
}

// ── Template Form Modal ──────────────────────────────────────────
function TemplateModal({ template, accounts, churchId, onSave, onClose }) {
  const toast = useToast()
  const [name,        setName]        = useState(template?.name        || '')
  const [voucherType, setVoucherType] = useState(template?.voucher_type || 'Journal')
  const [narration,   setNarration]   = useState(template?.narration   || '')
  const [lines,       setLines]       = useState(() => {
    if (template?.lines?.length) {
      return template.lines.map(l => ({ ...l, _key: Math.random(), debit_amount: String(l.debit_amount || ''), credit_amount: String(l.credit_amount || '') }))
    }
    return [emptyLine(), emptyLine()]
  })
  const [saving, setSaving] = useState(false)

  const totalDr = lines.reduce((s, l) => s + (parseFloat(l.debit_amount) || 0), 0)
  const totalCr = lines.reduce((s, l) => s + (parseFloat(l.credit_amount) || 0), 0)
  const balanced = Math.abs(totalDr - totalCr) < 0.01

  function updateLine(key, val) { setLines(ls => ls.map(l => l._key === key ? val : l)) }
  function removeLine(key) { setLines(ls => ls.filter(l => l._key !== key)) }

  async function handleSave() {
    if (!name.trim()) { toast('Template name is required.', 'error'); return }
    const validLines = lines.filter(l => l.account_id && (parseFloat(l.debit_amount) > 0 || parseFloat(l.credit_amount) > 0))
    if (validLines.length < 2) { toast('Add at least 2 lines with amounts.', 'error'); return }
    if (!balanced) { toast('Template lines do not balance.', 'error'); return }

    const payload = {
      church_id:    churchId,
      name:         name.trim(),
      voucher_type: voucherType,
      narration:    narration.trim(),
      lines:        validLines.map(l => ({
        account_id:    l.account_id,
        account_name:  l.account_name,
        debit_amount:  parseFloat(l.debit_amount)  || 0,
        credit_amount: parseFloat(l.credit_amount) || 0,
        description:   l.description || '',
      })),
    }

    setSaving(true)
    try {
      if (template?.id) {
        const { error } = await supabase.from('journal_templates').update(payload).eq('id', template.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('journal_templates').insert(payload)
        if (error) throw error
      }
      toast(template?.id ? 'Template updated.' : 'Template saved.', 'success')
      onSave()
    } catch (e) { toast(e.message, 'error') }
    setSaving(false)
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ background: 'var(--card-bg)', borderRadius: 14, width: '100%', maxWidth: 680, maxHeight: '90vh', overflow: 'auto', boxShadow: '0 24px 60px rgba(0,0,0,0.3)' }}>
        <div style={{ padding: '18px 22px', borderBottom: '1px solid var(--card-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-1)', margin: 0 }}>
            {template?.id ? 'Edit Template' : 'New Template'}
          </h3>
          <button onClick={onClose} style={{ padding: 6, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', borderRadius: 6 }}><X size={16} /></button>
        </div>
        <div style={{ padding: '18px 22px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 160px', gap: 12, marginBottom: 12 }}>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 5 }}>Template Name *</label>
              <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Monthly Rent Payment"
                style={{ width: '100%', height: 36, padding: '0 10px', border: '1.5px solid var(--card-border)', borderRadius: 7, fontSize: 13, background: 'var(--input-bg)', color: 'var(--text-1)', boxSizing: 'border-box' }} />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 5 }}>Voucher Type</label>
              <select value={voucherType} onChange={e => setVoucherType(e.target.value)}
                style={{ width: '100%', height: 36, padding: '0 8px', border: '1.5px solid var(--card-border)', borderRadius: 7, fontSize: 13, background: 'var(--input-bg)', color: 'var(--text-1)' }}>
                {VOUCHER_OPTS.map(v => <option key={v} value={v}>{v}</option>)}
              </select>
            </div>
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 5 }}>Default Narration</label>
            <input value={narration} onChange={e => setNarration(e.target.value)} placeholder="e.g. Monthly office rent"
              style={{ width: '100%', height: 36, padding: '0 10px', border: '1.5px solid var(--card-border)', borderRadius: 7, fontSize: 13, background: 'var(--input-bg)', color: 'var(--text-1)', boxSizing: 'border-box' }} />
          </div>

          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Entry Lines</div>
          <div style={{ border: '1px solid var(--card-border)', borderRadius: 8, overflow: 'hidden', marginBottom: 10 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead style={{ background: 'var(--table-header-bg)' }}>
                <tr>
                  <th style={{ padding: '7px 6px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-3)', textAlign: 'left' }}>Account</th>
                  <th style={{ padding: '7px 6px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#2563eb', textAlign: 'right' }}>Debit (₹)</th>
                  <th style={{ padding: '7px 6px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#16a34a', textAlign: 'right' }}>Credit (₹)</th>
                  <th style={{ width: 36 }} />
                </tr>
              </thead>
              <tbody>
                {lines.map(l => (
                  <LineRow key={l._key} line={l} accounts={accounts}
                    onChange={v => updateLine(l._key, v)}
                    onRemove={() => removeLine(l._key)} />
                ))}
              </tbody>
              <tfoot style={{ background: 'var(--table-header-bg)', borderTop: '1.5px solid var(--card-border)' }}>
                <tr>
                  <td style={{ padding: '7px 6px', fontSize: 11, fontWeight: 700, color: 'var(--text-2)' }}>TOTAL</td>
                  <td style={{ padding: '7px 6px', fontSize: 12, fontWeight: 800, fontFamily: 'monospace', textAlign: 'right', color: '#2563eb' }}>{fmtAmt(totalDr)}</td>
                  <td style={{ padding: '7px 6px', fontSize: 12, fontWeight: 800, fontFamily: 'monospace', textAlign: 'right', color: '#16a34a' }}>{fmtAmt(totalCr)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <button onClick={() => setLines(ls => [...ls, emptyLine()])}
              style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 12px', background: 'var(--card-bg)', border: '1.5px solid var(--card-border)', borderRadius: 6, cursor: 'pointer', fontSize: 12, color: 'var(--text-2)' }}>
              <Plus size={13} /> Add Line
            </button>
            {!balanced && totalDr + totalCr > 0 && (
              <span style={{ fontSize: 11, color: '#c2410c', fontWeight: 700 }}>
                ⚠ Difference: {fmtAmt(Math.abs(totalDr - totalCr))}
              </span>
            )}
            {balanced && totalDr > 0 && (
              <span style={{ fontSize: 11, color: '#16a34a', fontWeight: 700 }}>✓ Balanced</span>
            )}
          </div>

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button onClick={onClose} style={{ padding: '8px 20px', background: 'var(--card-bg)', border: '1.5px solid var(--card-border)', borderRadius: 8, cursor: 'pointer', fontSize: 13, color: 'var(--text-2)' }}>Cancel</button>
            <button onClick={handleSave} disabled={saving}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 20px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
              {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
              Save Template
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Use Template Modal ───────────────────────────────────────────
function UseTemplateModal({ template, onClose, onCreated }) {
  const toast    = useToast()
  const { profile } = useAuth()
  const { currentEntityId } = useEntity()
  const { fy } = useEntityFY()
  const [date,      setDate]      = useState(localISO(new Date()))
  const [narration, setNarration] = useState(template.narration || '')
  const [saving,    setSaving]    = useState(false)

  async function handleCreate() {
    if (!date) { toast('Date is required.', 'error'); return }
    const lines = template.lines.map(l => ({
      account_id:    l.account_id,
      debit_amount:  l.debit_amount  || 0,
      credit_amount: l.credit_amount || 0,
      description:   narration || 'Template entry',
      line_number:   0,
    }))
    const totalDr = lines.reduce((s, l) => s + l.debit_amount, 0)
    const totalCr = lines.reduce((s, l) => s + l.credit_amount, 0)

    setSaving(true)
    try {
      const entryNo = await nextEntryNumber(fy, template.voucher_type, currentEntityId)
      const entry = {
        entry_number:   entryNo,
        entry_date:     date,
        financial_year: fy,
        voucher_type:   template.voucher_type || 'Journal',
        narration:      narration || template.narration,
        entity_id:      currentEntityId,
        total_debit:    totalDr,
        total_credit:   totalCr,
        is_posted:      false,
      }
      await createJournalEntry(entry, lines, profile?.email || 'admin')
      toast('Journal entry created from template.', 'success')
      onCreated()
    } catch (e) { toast(e.message, 'error') }
    setSaving(false)
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ background: 'var(--card-bg)', borderRadius: 14, width: '100%', maxWidth: 440, boxShadow: '0 24px 60px rgba(0,0,0,0.3)' }}>
        <div style={{ padding: '18px 22px', borderBottom: '1px solid var(--card-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-1)', margin: 0 }}>Use Template: {template.name}</h3>
          <button onClick={onClose} style={{ padding: 6, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)' }}><X size={16} /></button>
        </div>
        <div style={{ padding: '18px 22px' }}>
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 5 }}>Date *</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)}
              style={{ width: '100%', height: 36, padding: '0 10px', border: '1.5px solid var(--card-border)', borderRadius: 7, fontSize: 13, background: 'var(--input-bg)', color: 'var(--text-1)', boxSizing: 'border-box' }} />
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 5 }}>Narration</label>
            <input value={narration} onChange={e => setNarration(e.target.value)}
              style={{ width: '100%', height: 36, padding: '0 10px', border: '1.5px solid var(--card-border)', borderRadius: 7, fontSize: 13, background: 'var(--input-bg)', color: 'var(--text-1)', boxSizing: 'border-box' }} />
          </div>
          <div style={{ background: 'var(--table-header-bg)', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 12, color: 'var(--text-2)', lineHeight: 1.7 }}>
            {template.lines?.map((l, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>{l.account_name}</span>
                <span style={{ fontFamily: 'monospace', color: l.debit_amount > 0 ? '#2563eb' : '#16a34a' }}>
                  {l.debit_amount > 0 ? `Dr ${fmtAmt(l.debit_amount)}` : `Cr ${fmtAmt(l.credit_amount)}`}
                </span>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button onClick={onClose} style={{ padding: '8px 20px', background: 'var(--card-bg)', border: '1.5px solid var(--card-border)', borderRadius: 8, cursor: 'pointer', fontSize: 13, color: 'var(--text-2)' }}>Cancel</button>
            <button onClick={handleCreate} disabled={saving}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 20px', background: '#16a34a', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
              {saving ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />}
              Create Entry
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
export default function JournalTemplatesPage() {
  const navigate = useNavigate()
  const toast    = useToast()
  const { profile } = useAuth()
  const { currentEntityId } = useEntity()

  const [templates, setTemplates] = useState([])
  const [accounts,  setAccounts]  = useState([])
  const [churchId,  setChurchId]  = useState(null)
  const [loading,   setLoading]   = useState(true)
  const [editModal, setEditModal] = useState(null)  // null | template object (with id) or {} for new
  const [useModal,  setUseModal]  = useState(null)  // template to use
  const [deleting,  setDeleting]  = useState(null)  // id being deleted

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [church, all] = await Promise.all([getChurch(), getChartOfAccounts(false, currentEntityId)])
      setChurchId(church?.id)
      setAccounts(getPostableAccountsWithPath(all))
      const { data, error } = await supabase
        .from('journal_templates')
        .select('*')
        .eq('church_id', church?.id)
        .order('name')
      if (error) throw error
      setTemplates(data || [])
    } catch (e) { toast(e.message, 'error') }
    setLoading(false)
  }, [currentEntityId, toast])

  useEffect(() => { load() }, [load])

  async function handleDelete(id) {
    setDeleting(id)
    try {
      const { error } = await supabase.from('journal_templates').delete().eq('id', id)
      if (error) throw error
      toast('Template deleted.', 'success')
      setTemplates(ts => ts.filter(t => t.id !== id))
    } catch (e) { toast(e.message, 'error') }
    setDeleting(null)
  }

  const VOUCHER_COLOR = {
    Journal:  { bg: '#dbeafe', text: '#1d4ed8' },
    Receipt:  { bg: '#dcfce7', text: '#15803d' },
    Payment:  { bg: '#fee2e2', text: '#b91c1c' },
    Contra:   { bg: '#f3e8ff', text: '#7c3aed' },
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
            <button onClick={() => navigate('/accounting')} style={{ padding: '6px 8px', background: 'var(--accent)', border: 'none', borderRadius: 7, cursor: 'pointer', display: 'flex', alignItems: 'center', color: '#fff' }}>
              <ArrowLeft size={15} />
            </button>
            <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--accent)', whiteSpace: 'nowrap' }}>Accounts</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
            <button onClick={() => navigate('/accounting/settings')} style={{ padding: '6px 8px', background: 'var(--card-bg)', border: '1.5px solid var(--card-border)', borderRadius: 7, cursor: 'pointer', display: 'flex', alignItems: 'center', color: 'var(--text-2)' }}>
              <ArrowLeft size={15} />
            </button>
            <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-3)', whiteSpace: 'nowrap' }}>Setup</span>
          </div>
          <div>
            <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
              <Copy size={19} style={{ color: 'var(--accent)' }} /> Journal Templates
            </h1>
            <p className="page-subtitle">Save recurring entries as templates for quick reuse</p>
          </div>
        </div>
        <button onClick={() => setEditModal({})}
          style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 18px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
          <Plus size={14} /> New Template
        </button>
      </div>

      {loading ? (
        <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--text-3)' }}>
          <Loader2 size={24} className="animate-spin" style={{ display: 'block', margin: '0 auto 8px' }} />Loading templates…
        </div>
      ) : templates.length === 0 ? (
        <div className="card" style={{ padding: '60px 40px', textAlign: 'center' }}>
          <Copy size={36} style={{ color: 'var(--text-3)', opacity: 0.3, marginBottom: 12 }} />
          <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-2)', margin: '0 0 6px' }}>No templates yet</p>
          <p style={{ fontSize: 13, color: 'var(--text-3)', margin: '0 0 20px' }}>Save frequently used journal entries as templates for one-click reuse.</p>
          <button onClick={() => setEditModal({})}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 20px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
            <Plus size={14} /> Create First Template
          </button>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 14 }}>
          {templates.map(t => {
            const vc = VOUCHER_COLOR[t.voucher_type] || { bg: '#f1f5f9', text: '#475569' }
            const totalDr = (t.lines || []).reduce((s, l) => s + (l.debit_amount || 0), 0)
            return (
              <div key={t.id} className="card" style={{ padding: 18 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: vc.bg, color: vc.text }}>{t.voucher_type}</span>
                    </div>
                    <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-1)', margin: 0 }}>{t.name}</p>
                    {t.narration && <p style={{ fontSize: 11, color: 'var(--text-3)', margin: '3px 0 0' }}>{t.narration}</p>}
                  </div>
                </div>

                <div style={{ background: 'var(--table-header-bg)', borderRadius: 7, padding: '8px 12px', marginBottom: 12, fontSize: 12 }}>
                  {(t.lines || []).map((l, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0', color: 'var(--text-2)' }}>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, marginRight: 8 }}>{l.account_name}</span>
                      <span style={{ fontFamily: 'monospace', color: l.debit_amount > 0 ? '#2563eb' : '#16a34a', flexShrink: 0 }}>
                        {l.debit_amount > 0 ? `Dr ${fmtAmt(l.debit_amount)}` : `Cr ${fmtAmt(l.credit_amount)}`}
                      </span>
                    </div>
                  ))}
                  <div style={{ borderTop: '1px solid var(--card-border)', marginTop: 6, paddingTop: 5, display: 'flex', justifyContent: 'flex-end', fontFamily: 'monospace', fontWeight: 700, fontSize: 12, color: '#2563eb' }}>
                    {fmtAmt(totalDr)}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 7 }}>
                  <button onClick={() => setUseModal(t)}
                    style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '7px 0', background: '#dcfce7', color: '#15803d', border: 'none', borderRadius: 7, cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>
                    <Play size={12} /> Use Template
                  </button>
                  <button onClick={() => setEditModal(t)}
                    style={{ padding: '7px 12px', background: 'var(--card-bg)', border: '1.5px solid var(--card-border)', borderRadius: 7, cursor: 'pointer', color: 'var(--text-2)', display: 'flex', alignItems: 'center' }}>
                    <Edit2 size={13} />
                  </button>
                  <button onClick={() => handleDelete(t.id)} disabled={deleting === t.id}
                    style={{ padding: '7px 12px', background: '#fee2e2', border: 'none', borderRadius: 7, cursor: 'pointer', color: '#dc2626', display: 'flex', alignItems: 'center' }}>
                    {deleting === t.id ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {editModal !== null && (
        <TemplateModal
          template={editModal?.id ? editModal : null}
          accounts={accounts}
          churchId={churchId}
          onSave={() => { setEditModal(null); load() }}
          onClose={() => setEditModal(null)}
        />
      )}

      {useModal && (
        <UseTemplateModal
          template={useModal}
          onClose={() => setUseModal(null)}
          onCreated={() => { setUseModal(null); navigate('/accounting/journal-entries') }}
        />
      )}
    </div>
  )
}
