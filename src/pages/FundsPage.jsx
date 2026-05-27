/* ═══════════════════════════════════════════════════════════════
   FundsPage.jsx — Manage designated / corpus funds
   ═══════════════════════════════════════════════════════════════ */

import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useToast } from '../lib/toast'
import { fmtAmt, getFunds } from '../lib/accountingLib'
import { supabase } from '../lib/supabase'
import {
  ArrowLeft, Plus, Trash2, Edit2, Loader2, X, Save, Wallet,
} from 'lucide-react'

const PRESET_COLORS = [
  '#2563eb', '#16a34a', '#7c3aed', '#0891b2', '#c2410c',
  '#d97706', '#db2777', '#065f46', '#1d4ed8', '#6d28d9',
]

function FundModal({ fund, onSave, onClose }) {
  const toast   = useToast()
  const [name,    setName]    = useState(fund?.name          || '')
  const [desc,    setDesc]    = useState(fund?.description   || '')
  const [target,  setTarget]  = useState(fund?.target_amount != null ? String(fund.target_amount) : '')
  const [color,   setColor]   = useState(fund?.color         || '#2563eb')
  const [active,  setActive]  = useState(fund?.is_active     ?? true)
  const [saving,  setSaving]  = useState(false)

  async function handleSave() {
    if (!name.trim()) { toast('Fund name is required.', 'error'); return }
    const payload = {
      name:          name.trim(),
      description:   desc.trim() || null,
      target_amount: parseFloat(target) > 0 ? parseFloat(target) : null,
      color,
      is_active:     active,
      updated_at:    new Date().toISOString(),
    }
    setSaving(true)
    try {
      if (fund?.id) {
        const { error } = await supabase.from('funds').update(payload).eq('id', fund.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('funds').insert(payload)
        if (error) throw error
      }
      toast(fund?.id ? 'Fund updated.' : 'Fund created.', 'success')
      onSave()
    } catch (e) { toast(e.message, 'error') }
    setSaving(false)
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ background: 'var(--card-bg)', borderRadius: 14, width: '100%', maxWidth: 460, boxShadow: '0 24px 60px rgba(0,0,0,0.3)' }}>
        <div style={{ padding: '18px 22px', borderBottom: '1px solid var(--card-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-1)', margin: 0 }}>
            {fund?.id ? 'Edit Fund' : 'New Designated Fund'}
          </h3>
          <button onClick={onClose} style={{ padding: 6, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)' }}><X size={16} /></button>
        </div>
        <div style={{ padding: '18px 22px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 5 }}>Fund Name *</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Building Fund"
              style={{ width: '100%', height: 36, padding: '0 10px', border: '1.5px solid var(--card-border)', borderRadius: 7, fontSize: 13, background: 'var(--input-bg)', color: 'var(--text-1)', boxSizing: 'border-box' }} />
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 5 }}>Description</label>
            <input value={desc} onChange={e => setDesc(e.target.value)} placeholder="Purpose of this fund"
              style={{ width: '100%', height: 36, padding: '0 10px', border: '1.5px solid var(--card-border)', borderRadius: 7, fontSize: 13, background: 'var(--input-bg)', color: 'var(--text-1)', boxSizing: 'border-box' }} />
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 5 }}>Target Amount (₹) — optional</label>
            <input type="number" min="0" step="0.01" value={target} onChange={e => setTarget(e.target.value)} placeholder="0.00"
              style={{ width: '100%', height: 36, padding: '0 10px', border: '1.5px solid var(--card-border)', borderRadius: 7, fontSize: 13, fontFamily: 'monospace', background: 'var(--input-bg)', color: 'var(--text-1)', boxSizing: 'border-box' }} />
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 8 }}>Color</label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {PRESET_COLORS.map(c => (
                <button key={c} onClick={() => setColor(c)}
                  style={{ width: 28, height: 28, borderRadius: '50%', background: c, border: color === c ? `3px solid var(--text-1)` : '3px solid transparent', cursor: 'pointer', outline: 'none', boxSizing: 'border-box' }} />
              ))}
            </div>
          </div>
          {fund?.id && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <input type="checkbox" id="active-toggle" checked={active} onChange={e => setActive(e.target.checked)}
                style={{ width: 16, height: 16, cursor: 'pointer' }} />
              <label htmlFor="active-toggle" style={{ fontSize: 13, color: 'var(--text-2)', cursor: 'pointer' }}>Active (show in fund picker)</label>
            </div>
          )}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', paddingTop: 4 }}>
            <button onClick={onClose} style={{ padding: '8px 20px', background: 'var(--card-bg)', border: '1.5px solid var(--card-border)', borderRadius: 8, cursor: 'pointer', fontSize: 13, color: 'var(--text-2)' }}>Cancel</button>
            <button onClick={handleSave} disabled={saving}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 20px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
              {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
              {fund?.id ? 'Update Fund' : 'Create Fund'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function FundsPage() {
  const navigate = useNavigate()
  const toast    = useToast()
  const [funds,    setFunds]    = useState([])
  const [loading,  setLoading]  = useState(true)
  const [modal,    setModal]    = useState(null)  // null | {} (new) | fund object (edit)
  const [deleting, setDeleting] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await getFunds(false)
      setFunds(data)
    } catch (e) { toast(e.message, 'error') }
    setLoading(false)
  }, [toast])

  useEffect(() => { load() }, [load])

  async function handleDelete(id) {
    if (!confirm('Delete this fund? Tagged transactions will have their fund tag removed.')) return
    setDeleting(id)
    try {
      const { error } = await supabase.from('funds').delete().eq('id', id)
      if (error) throw error
      toast('Fund deleted.', 'success')
      setFunds(fs => fs.filter(f => f.id !== id))
    } catch (e) { toast(e.message, 'error') }
    setDeleting(null)
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
              <Wallet size={19} style={{ color: 'var(--accent)' }} /> Designated Funds
            </h1>
            <p className="page-subtitle">Manage Building Fund, Benevolence Fund, and other designated funds</p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => navigate('/accounting/fund-report')}
            style={{ padding: '8px 16px', background: 'var(--card-bg)', border: '1.5px solid var(--card-border)', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600, color: 'var(--text-2)' }}>
            View Report
          </button>
          <button onClick={() => setModal({})}
            style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 18px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            <Plus size={14} /> New Fund
          </button>
        </div>
      </div>

      {loading ? (
        <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--text-3)' }}>
          <Loader2 size={24} className="animate-spin" style={{ display: 'block', margin: '0 auto 8px' }} />Loading funds…
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
          {funds.map(f => (
            <div key={f.id} className="card" style={{ padding: '18px 20px', borderLeft: `4px solid ${f.color}`, opacity: f.is_active ? 1 : 0.6 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <div style={{ width: 10, height: 10, borderRadius: '50%', background: f.color, flexShrink: 0 }} />
                    <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-1)', margin: 0 }}>{f.name}</p>
                    {!f.is_active && (
                      <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 99, background: '#f1f5f9', color: '#64748b' }}>Inactive</span>
                    )}
                  </div>
                  {f.description && (
                    <p style={{ fontSize: 12, color: 'var(--text-3)', margin: 0, lineHeight: 1.5 }}>{f.description}</p>
                  )}
                </div>
              </div>
              {f.target_amount != null && (
                <div style={{ marginBottom: 12 }}>
                  <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-3)', margin: '0 0 3px' }}>Target</p>
                  <p style={{ fontSize: 15, fontWeight: 800, fontFamily: 'monospace', color: f.color, margin: 0 }}>{fmtAmt(f.target_amount)}</p>
                </div>
              )}
              <div style={{ display: 'flex', gap: 7, marginTop: 12 }}>
                <button onClick={() => setModal(f)}
                  style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, padding: '7px 0', background: 'var(--card-bg)', border: '1.5px solid var(--card-border)', borderRadius: 7, cursor: 'pointer', fontSize: 12, color: 'var(--text-2)' }}>
                  <Edit2 size={12} /> Edit
                </button>
                <button onClick={() => handleDelete(f.id)} disabled={deleting === f.id}
                  style={{ padding: '7px 12px', background: '#fee2e2', border: 'none', borderRadius: 7, cursor: 'pointer', color: '#dc2626', display: 'flex', alignItems: 'center' }}>
                  {deleting === f.id ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                </button>
              </div>
            </div>
          ))}
          {funds.length === 0 && (
            <div style={{ gridColumn: '1 / -1', padding: '50px 24px', textAlign: 'center', color: 'var(--text-3)' }}>
              <Wallet size={32} style={{ opacity: 0.3, marginBottom: 12 }} />
              <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-2)', margin: '0 0 16px' }}>No funds yet</p>
              <button onClick={() => setModal({})}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 20px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
                <Plus size={14} /> Create First Fund
              </button>
            </div>
          )}
        </div>
      )}

      {modal !== null && (
        <FundModal
          fund={modal?.id ? modal : null}
          onSave={() => { setModal(null); load() }}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  )
}
