/* ═══════════════════════════════════════════════════════════════
   EntityManagementPage.jsx — Manage accounting books (entities)
   Each entity is an independent set of accounts and journal
   entries. Examples: "St. Paul's Church", "St. Paul's Trust".
   ═══════════════════════════════════════════════════════════════ */

import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useToast } from '../lib/toast'
import { useEntity } from '../lib/EntityContext'
import { supabase, getChurch } from '../lib/supabase'
import { getFY, fyOptions } from '../lib/accountingLib'
import {
  ArrowLeft, Layers, Plus, Pencil, X, Save,
  Loader2, CheckCircle, Power, Check, Trash2,
  Calendar, MapPin, Phone, Mail, Church,
} from 'lucide-react'

const ENTITY_TYPES = ['Church', 'Trust', 'School', 'Complex', 'Other']

const TYPE_COLOR = {
  Church:  { bg: '#dbeafe', text: '#1d4ed8' },
  Trust:   { bg: '#dcfce7', text: '#15803d' },
  School:  { bg: '#fef9c3', text: '#854d0e' },
  Complex: { bg: '#f3e8ff', text: '#7c3aed' },
  Other:   { bg: '#f1f5f9', text: '#475569' },
}

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

// Suggested FY options for the datalist (user can also type any value freely)
const SETUP_FY_OPTIONS = fyOptions('2020-21')

function isValidFY(v) {
  return /^\d{4}-\d{2}$/.test(v.trim())
}

// ── Add / Edit modal ──────────────────────────────────────────────

function EntityModal({ editing, onSave, onCancel }) {
  const isEdit = !!editing

  const [name,       setName]       = useState(editing?.name        || '')
  const [entityType, setEntityType] = useState(editing?.entity_type || 'Church')
  const [fyStart,    setFyStart]    = useState(editing?.fy_start    || getFY())
  const [diocese,    setDiocese]    = useState(editing?.diocese     || '')
  const [address,    setAddress]    = useState(editing?.address     || '')
  const [city,       setCity]       = useState(editing?.city        || '')
  const [state,      setState]      = useState(editing?.state       || '')
  const [phone,      setPhone]      = useState(editing?.phone       || '')
  const [email,      setEmail]      = useState(editing?.email       || '')
  const [saving,     setSaving]     = useState(false)

  // Auto-populate from Church Setup when creating a new book
  useEffect(() => {
    if (isEdit) return
    getChurch().then(ch => {
      if (!ch) return
      if (ch.church_name)    setName(n    => n || ch.church_name)
      if (ch.diocese)        setDiocese(d => d || ch.diocese)
      if (ch.address)        setAddress(a => a || ch.address)
      if (ch.city)           setCity(c    => c || ch.city)
      if (ch.state)          setState(s   => s || ch.state)
      if (ch.whatsapp_number) setPhone(p  => p || ch.whatsapp_number)
      if (ch.email)           setEmail(e  => e || ch.email)
    })
  }, [isEdit])

  async function handleSave() {
    const n = name.trim()
    if (!n) return
    setSaving(true)
    await onSave({
      name:        n,
      entity_type: entityType,
      fy_start:    fyStart,
      diocese:     diocese.trim() || null,
      address:     address.trim() || null,
      city:        city.trim()    || null,
      state:       state.trim()   || null,
      phone:       phone.trim()   || null,
      email:       email.trim()   || null,
    })
    setSaving(false)
  }

  const canSave = name.trim().length > 0 && isValidFY(fyStart)

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 2000, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, overflowY: 'auto' }}>
      <div style={{ background: 'var(--card-bg)', borderRadius: 16, width: '100%', maxWidth: 540, boxShadow: '0 24px 60px rgba(0,0,0,0.25)', overflow: 'hidden', margin: 'auto' }}>

        {/* Header */}
        <div style={{ padding: '18px 22px', borderBottom: '1px solid var(--card-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <Layers size={15} style={{ color: 'var(--accent)' }} />
            <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-1)', margin: 0 }}>
              {isEdit ? 'Edit Accounting Book' : 'New Accounting Book'}
            </p>
          </div>
          <button onClick={onCancel} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', display: 'flex' }}>
            <X size={16} />
          </button>
        </div>

        <div style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 18 }}>

          {/* ── Section: Identity ── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <p style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--accent)', margin: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Church size={11} /> Book Identity
            </p>

            <div>
              <FL>Book Name *</FL>
              <input value={name} onChange={e => setName(e.target.value)}
                placeholder="e.g. CSI St. Paul's Church"
                style={INPUT_STYLE} autoFocus />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <FL>Type</FL>
                <select value={entityType} onChange={e => setEntityType(e.target.value)} style={INPUT_STYLE}>
                  {ENTITY_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <FL>Books Beginning From *</FL>
                <input
                  list="fy-suggestions"
                  value={fyStart}
                  onChange={e => setFyStart(e.target.value)}
                  placeholder="e.g. 2026-27"
                  style={{ ...INPUT_STYLE, borderColor: fyStart && !isValidFY(fyStart) ? '#f87171' : undefined }}
                />
                <datalist id="fy-suggestions">
                  {SETUP_FY_OPTIONS.map(f => <option key={f} value={f} />)}
                </datalist>
                {fyStart && !isValidFY(fyStart) && (
                  <p style={{ fontSize: 10, color: '#ef4444', margin: '4px 0 0' }}>Format must be YYYY-YY (e.g. 2026-27)</p>
                )}
              </div>
            </div>
          </div>

          {/* ── Section: Contact / Header ── */}
          <div style={{ borderTop: '1px solid var(--card-border)', paddingTop: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <p style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--accent)', margin: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
              <MapPin size={11} /> Contact & Report Header
            </p>

            <div>
              <FL>Diocese / Association</FL>
              <input value={diocese} onChange={e => setDiocese(e.target.value)}
                placeholder="e.g. Diocese of Madras"
                style={INPUT_STYLE} />
            </div>

            <div>
              <FL>Address</FL>
              <input value={address} onChange={e => setAddress(e.target.value)}
                placeholder="Street address"
                style={INPUT_STYLE} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <FL>City</FL>
                <input value={city} onChange={e => setCity(e.target.value)}
                  placeholder="City"
                  style={INPUT_STYLE} />
              </div>
              <div>
                <FL>State</FL>
                <input value={state} onChange={e => setState(e.target.value)}
                  placeholder="State"
                  style={INPUT_STYLE} />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <FL>Phone</FL>
                <input value={phone} onChange={e => setPhone(e.target.value)}
                  placeholder="+91 …"
                  style={INPUT_STYLE} />
              </div>
              <div>
                <FL>Email</FL>
                <input value={email} onChange={e => setEmail(e.target.value)}
                  placeholder="email@church.org"
                  type="email"
                  style={INPUT_STYLE} />
              </div>
            </div>
          </div>

          {/* ── Footer ── */}
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={onCancel} style={{ flex: 1, height: 40, background: 'var(--card-bg)', border: '1.5px solid var(--card-border)', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', color: 'var(--text-2)' }}>
              Cancel
            </button>
            <button onClick={handleSave} disabled={!canSave || saving}
              style={{ flex: 2, height: 40, background: canSave ? 'var(--accent)' : '#e5e7eb', color: canSave ? '#fff' : '#9ca3af', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: canSave ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}>
              {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
              {saving ? 'Saving…' : (isEdit ? 'Save Changes' : 'Create Book')}
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

export default function EntityManagementPage() {
  const navigate = useNavigate()
  const toast    = useToast()
  const { entities, currentEntityId, switchEntity, reload } = useEntity()

  const [modal,       setModal]       = useState(null)   // null | 'add' | { editing: entity }
  const [toggling,    setToggling]    = useState(null)   // id being toggled
  const [savingType,  setSavingType]  = useState(null)   // id whose type is saving
  const [deleting,    setDeleting]    = useState(null)   // id being deleted

  const activeCount = entities.filter(e => e.is_active).length

  async function handleSave(formData) {
    if (modal?.editing) {
      const { error } = await supabase
        .from('accounting_entities')
        .update(formData)
        .eq('id', modal.editing.id)
      if (error) { toast('Save failed: ' + error.message, 'error'); return }
      toast('Book updated.', 'success')
    } else {
      const { error } = await supabase
        .from('accounting_entities')
        .insert(formData)
      if (error) { toast('Save failed: ' + error.message, 'error'); return }
      toast('Accounting book added.', 'success')
    }
    setModal(null)
    reload()
  }

  async function handleDelete(entity) {
    if (!window.confirm(`Delete "${entity.name}"? This cannot be undone.`)) return
    setDeleting(entity.id)
    try {
      // Check for associated data first
      const [{ count: coaCount }, { count: jeCount }] = await Promise.all([
        supabase.from('chart_of_accounts').select('id', { count: 'exact', head: true }).eq('entity_id', entity.id),
        supabase.from('journal_entries').select('id', { count: 'exact', head: true }).eq('entity_id', entity.id),
      ])
      if ((coaCount || 0) > 0 || (jeCount || 0) > 0) {
        toast(`Cannot delete: this book has ${coaCount || 0} accounts and ${jeCount || 0} journal entries. Rename it instead.`, 'error')
        setDeleting(null)
        return
      }
      const { error } = await supabase.from('accounting_entities').delete().eq('id', entity.id)
      if (error) throw error
      toast('Book deleted.', 'success')
      await reload()
    } catch (e) { toast('Delete failed: ' + e.message, 'error') }
    setDeleting(null)
  }

  async function handleTypeChange(entity, newType) {
    setSavingType(entity.id)
    const { error } = await supabase
      .from('accounting_entities')
      .update({ entity_type: newType })
      .eq('id', entity.id)
    if (error) { toast('Update failed: ' + error.message, 'error') }
    else { await reload() }
    setSavingType(null)
  }

  async function handleToggleActive(entity) {
    // Prevent deactivating the last active entity
    if (entity.is_active && activeCount <= 1) {
      toast('Cannot deactivate the last active accounting book.', 'error')
      return
    }
    setToggling(entity.id)
    const newVal = !entity.is_active
    const { error } = await supabase
      .from('accounting_entities')
      .update({ is_active: newVal })
      .eq('id', entity.id)
    if (error) { toast('Update failed: ' + error.message, 'error'); setToggling(null); return }

    // If deactivating the currently selected entity, switch to first remaining active
    if (!newVal && entity.id === currentEntityId) {
      const next = entities.find(e => e.id !== entity.id && e.is_active)
      if (next) switchEntity(next.id)
    }
    await reload()
    setToggling(null)
    toast(`Book ${newVal ? 'activated' : 'deactivated'}.`, 'success')
  }

  return (
    <div className="page-container">

      {modal === 'add' && (
        <EntityModal onSave={handleSave} onCancel={() => setModal(null)} />
      )}
      {modal?.editing && (
        <EntityModal editing={modal.editing} onSave={handleSave} onCancel={() => setModal(null)} />
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
              <Layers size={20} style={{ color: 'var(--accent)' }} /> Entity Management
            </h1>
            <p className="page-subtitle">Manage separate accounting books — each has its own accounts and journal entries</p>
          </div>
        </div>
        <button onClick={() => setModal('add')}
          style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 18px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
          <Plus size={14} /> Add Accounting Book
        </button>
      </div>

      {/* ── Info banner ────────────────────────────────────────── */}
      <div style={{ padding: '12px 18px', borderRadius: 10, marginBottom: 20, background: '#eff6ff', border: '1.5px solid #bfdbfe', display: 'flex', gap: 12 }}>
        <Layers size={16} style={{ color: '#2563eb', flexShrink: 0, marginTop: 1 }} />
        <div>
          <p style={{ fontSize: 13, fontWeight: 600, color: '#1d4ed8', margin: '0 0 3px' }}>
            What are accounting books?
          </p>
          <p style={{ fontSize: 11, color: '#3b82f6', margin: 0, lineHeight: 1.5 }}>
            Each book is a completely independent set of accounts and journal entries. Use this for
            separate financial reporting — e.g. the church body itself vs. a church-run school or
            shopping complex. Switch between books using the switcher on the Accounts home page.
          </p>
        </div>
      </div>

      {/* ── Entity list ──────────────────────────────────────────── */}
      {entities.length === 0 ? (
        <div className="card" style={{ padding: '60px 24px', textAlign: 'center', color: 'var(--text-3)' }}>
          <Layers size={32} style={{ opacity: 0.3, marginBottom: 10 }} />
          <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-2)', margin: '0 0 6px' }}>No accounting books found</p>
          <p style={{ fontSize: 12, margin: '0 0 20px' }}>At least one book is required to use the accounting module.</p>
          <button onClick={() => setModal('add')}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '10px 22px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
            <Plus size={14} /> Add First Book
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {entities.map(entity => {
            const clr       = TYPE_COLOR[entity.entity_type] || TYPE_COLOR.Other
            const isCurrent = entity.id === currentEntityId
            const isActive  = entity.is_active

            return (
              <div key={entity.id} className="card" style={{
                padding: '18px 20px',
                opacity: isActive ? 1 : 0.6,
                border: isCurrent ? '2px solid var(--accent)' : '1.5px solid var(--card-border)',
                background: isCurrent ? 'var(--sidebar-item-active-bg)' : 'var(--card-bg)',
                transition: 'border-color 0.15s',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                  {/* Type badge / icon area */}
                  <div style={{ width: 46, height: 46, borderRadius: 13, background: clr.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Layers size={20} style={{ color: clr.text }} />
                  </div>

                  {/* Info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                      <p style={{ fontSize: 15, fontWeight: 800, color: 'var(--text-1)', margin: 0 }}>{entity.name}</p>
                      <select
                        value={entity.entity_type}
                        onChange={e => handleTypeChange(entity, e.target.value)}
                        disabled={savingType === entity.id}
                        style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 5, background: clr.bg, color: clr.text, border: `1px solid ${clr.text}44`, cursor: 'pointer', outline: 'none', appearance: 'none', WebkitAppearance: 'none' }}
                      >
                        {ENTITY_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                      {entity.fy_start && (
                        <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 5, background: '#f0fdf4', color: '#15803d', display: 'flex', alignItems: 'center', gap: 3 }}>
                          <Calendar size={9} /> FY {entity.fy_start}
                        </span>
                      )}
                      {isCurrent && (
                        <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 5, background: '#dbeafe', color: '#1d4ed8', display: 'flex', alignItems: 'center', gap: 3 }}>
                          <Check size={10} /> Active Book
                        </span>
                      )}
                      {!isActive && (
                        <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 5, background: '#f3f4f6', color: 'var(--text-3)' }}>INACTIVE</span>
                      )}
                    </div>
                    {entity.diocese && (
                      <p style={{ fontSize: 11, color: 'var(--text-3)', margin: '0 0 1px', display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Church size={10} /> {entity.diocese}
                      </p>
                    )}
                    {(entity.address || entity.city) && (
                      <p style={{ fontSize: 11, color: 'var(--text-3)', margin: '0 0 1px', display: 'flex', alignItems: 'center', gap: 4 }}>
                        <MapPin size={10} /> {[entity.address, entity.city, entity.state].filter(Boolean).join(', ')}
                      </p>
                    )}
                    {(entity.phone || entity.email) && (
                      <p style={{ fontSize: 11, color: 'var(--text-3)', margin: '0 0 1px', display: 'flex', alignItems: 'center', gap: 10 }}>
                        {entity.phone && <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Phone size={10} /> {entity.phone}</span>}
                        {entity.email && <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Mail size={10} /> {entity.email}</span>}
                      </p>
                    )}
                    <p style={{ fontSize: 10, color: 'var(--text-3)', margin: '4px 0 0' }}>
                      Created {new Date(entity.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </p>
                  </div>

                  {/* Actions */}
                  <div style={{ display: 'flex', gap: 8, flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                    {!isCurrent && isActive && (
                      <button onClick={() => switchEntity(entity.id)}
                        style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 14px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 7, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                        <CheckCircle size={13} /> Switch to this Book
                      </button>
                    )}
                    <button onClick={() => setModal({ editing: entity })}
                      style={{ padding: '7px 10px', background: 'var(--table-header-bg)', border: '1px solid var(--card-border)', borderRadius: 7, cursor: 'pointer', color: 'var(--text-2)', display: 'flex', alignItems: 'center' }}>
                      <Pencil size={13} />
                    </button>
                    <button
                      onClick={() => handleToggleActive(entity)}
                      disabled={toggling === entity.id || (isActive && activeCount <= 1)}
                      title={isActive && activeCount <= 1 ? 'Cannot deactivate the last active book' : (isActive ? 'Deactivate' : 'Activate')}
                      style={{
                        padding: '7px 10px',
                        background: isActive ? '#fff7ed' : '#f0fdf4',
                        border: `1px solid ${isActive ? '#fed7aa' : '#bbf7d0'}`,
                        borderRadius: 7, cursor: (toggling === entity.id || (isActive && activeCount <= 1)) ? 'not-allowed' : 'pointer',
                        color: isActive ? '#c2410c' : '#15803d',
                        display: 'flex', alignItems: 'center',
                        opacity: (isActive && activeCount <= 1) ? 0.4 : 1,
                      }}>
                      {toggling === entity.id
                        ? <Loader2 size={13} className="animate-spin" />
                        : <Power size={13} />}
                    </button>
                    {!isCurrent && (
                      <button
                        onClick={() => handleDelete(entity)}
                        disabled={deleting === entity.id}
                        title="Delete this book (only if it has no accounts or entries)"
                        style={{ padding: '7px 10px', background: '#fff5f5', border: '1px solid #fca5a5', borderRadius: 7, cursor: 'pointer', color: '#b91c1c', display: 'flex', alignItems: 'center' }}>
                        {deleting === entity.id ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                      </button>
                    )}

                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── Note ─────────────────────────────────────────────────── */}
      {entities.length > 0 && (
        <div style={{ marginTop: 20, padding: '12px 18px', borderRadius: 9, background: 'var(--table-header-bg)', border: '1px solid var(--card-border)' }}>
          <p style={{ fontSize: 11, color: 'var(--text-3)', margin: 0, lineHeight: 1.6 }}>
            <strong style={{ color: 'var(--text-2)' }}>Note:</strong> Accounting books cannot be deleted once created, because they hold financial records. You can deactivate a book to hide it from the switcher. Each book has its own Chart of Accounts and journal entries — data is never shared between books.
          </p>
        </div>
      )}
    </div>
  )
}
