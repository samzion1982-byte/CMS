/* ═══════════════════════════════════════════════════════════════
   FixedAssetsSettingsPanel — create / edit Fixed Asset tiles
   ═══════════════════════════════════════════════════════════════ */

import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Plus, Pencil, Trash2, Loader2, Building2, X, Save, Camera, ExternalLink,
} from 'lucide-react'
import { useToast } from '../../lib/toast'
import { useAuth } from '../../lib/AuthContext'
import {
  FIXED_ASSET_TYPES, FIXED_ASSET_STATUSES, FIXED_COVER_MAX_BYTES,
  getFixedAssets, saveFixedAsset, softDeleteFixedAsset,
  uploadFixedAssetCover, removeFixedAssetFile,
  isFixedAssetsUnlocked, lockFixedAssets, touchFixedAssetsActivity,
  shouldAutoLockFixedAssets,
} from '../../lib/fixedAssetsLib'

const INPUT = {
  height: 38, padding: '0 12px', border: '1.5px solid var(--card-border)',
  borderRadius: 8, fontSize: 13, background: 'var(--input-bg)',
  color: 'var(--text-1)', outline: 'none', boxSizing: 'border-box', width: '100%',
}

function blankForm() {
  return {
    name: '',
    asset_type: 'Building',
    status: 'Active',
    location_label: '',
    description: '',
    drive_url: '',
    cover_url: null,
    cover_path: null,
  }
}

function AssetFormModal({ editing, onSave, onClose }) {
  const [form, setForm] = useState(() => editing ? {
    name: editing.name || '',
    asset_type: editing.asset_type || 'Building',
    status: editing.status || 'Active',
    location_label: editing.location_label || '',
    description: editing.description || '',
    drive_url: editing.drive_url || '',
    cover_url: editing.cover_url || null,
    cover_path: editing.cover_path || null,
  } : blankForm())
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef(null)
  const toast = useToast()

  function set(key, val) { setForm(f => ({ ...f, [key]: val })) }

  async function onCoverPick(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (file.size > FIXED_COVER_MAX_BYTES) {
      toast('Cover photo must be under 1 MB.', 'error')
      return
    }
    setUploading(true)
    try {
      const uploaded = await uploadFixedAssetCover(file, editing?.id)
      if (form.cover_path && form.cover_path !== uploaded.path) {
        await removeFixedAssetFile(form.cover_path).catch(() => {})
      }
      setForm(f => ({ ...f, cover_url: uploaded.url, cover_path: uploaded.path }))
    } catch (err) {
      toast(err.message || 'Upload failed.', 'error')
    }
    setUploading(false)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.name.trim()) {
      toast('Asset name is required.', 'error')
      return
    }
    setSaving(true)
    try {
      await onSave(form)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 2000, background: 'rgba(0,0,0,0.55)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
    }} onClick={onClose}>
      <form
        onClick={e => e.stopPropagation()}
        onSubmit={handleSubmit}
        style={{
          background: 'var(--card-bg)', borderRadius: 16, width: '100%', maxWidth: 480,
          maxHeight: '90vh', overflow: 'auto', boxShadow: '0 24px 60px rgba(0,0,0,0.25)',
        }}
      >
        <div style={{
          padding: '16px 20px', borderBottom: '1px solid var(--card-border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--text-1)' }}>
            {editing ? 'Edit Fixed Asset' : 'Add Fixed Asset'}
          </p>
          <button type="button" onClick={onClose} style={{
            background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', display: 'flex',
          }}>
            <X size={18} />
          </button>
        </div>

        <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              style={{
                width: 72, height: 72, borderRadius: 12, flexShrink: 0,
                border: '1.5px dashed var(--card-border)', background: 'var(--table-header-bg)',
                cursor: 'pointer', overflow: 'hidden', display: 'flex',
                alignItems: 'center', justifyContent: 'center', padding: 0,
              }}
            >
              {uploading ? <Loader2 size={18} className="animate-spin" style={{ color: 'var(--text-3)' }} />
                : form.cover_url
                  ? <img src={form.cover_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  : <Camera size={20} style={{ color: 'var(--text-3)' }} />}
            </button>
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={onCoverPick} />
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', display: 'block', marginBottom: 6 }}>Name *</label>
              <input value={form.name} onChange={e => set('name', e.target.value)} placeholder="e.g. Church Building" style={INPUT} autoFocus />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', display: 'block', marginBottom: 6 }}>Type</label>
              <select value={form.asset_type} onChange={e => set('asset_type', e.target.value)} style={INPUT}>
                {FIXED_ASSET_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', display: 'block', marginBottom: 6 }}>Status</label>
              <select value={form.status} onChange={e => set('status', e.target.value)} style={INPUT}>
                {FIXED_ASSET_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', display: 'block', marginBottom: 6 }}>Location / Campus</label>
            <input value={form.location_label} onChange={e => set('location_label', e.target.value)} placeholder="e.g. Main campus" style={INPUT} />
          </div>

          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', display: 'block', marginBottom: 6 }}>Description</label>
            <textarea
              value={form.description}
              onChange={e => set('description', e.target.value)}
              rows={3}
              placeholder="Optional notes about this property…"
              style={{ ...INPUT, height: 'auto', padding: '10px 12px', resize: 'vertical' }}
            />
          </div>

          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', display: 'block', marginBottom: 6 }}>
              Google Drive folder link <span style={{ fontWeight: 500 }}>(optional)</span>
            </label>
            <input
              value={form.drive_url}
              onChange={e => set('drive_url', e.target.value)}
              placeholder="https://drive.google.com/…"
              style={INPUT}
            />
          </div>
        </div>

        <div style={{
          padding: '14px 20px', borderTop: '1px solid var(--card-border)',
          display: 'flex', gap: 10, justifyContent: 'flex-end',
        }}>
          <button type="button" onClick={onClose} style={{
            height: 40, padding: '0 16px', background: 'var(--card-bg)',
            border: '1.5px solid var(--card-border)', borderRadius: 8,
            fontSize: 13, fontWeight: 600, cursor: 'pointer', color: 'var(--text-2)',
          }}>Cancel</button>
          <button type="submit" disabled={saving} style={{
            height: 40, padding: '0 18px', background: 'var(--accent)', color: '#fff',
            border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700,
            cursor: saving ? 'wait' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: 7,
          }}>
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            {editing ? 'Save' : 'Add Asset'}
          </button>
        </div>
      </form>
    </div>
  )
}

export default function FixedAssetsSettingsPanel() {
  const toast = useToast()
  const { profile } = useAuth()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(null) // null | {} | row
  const [busy, setBusy] = useState(null)

  // Keep Fixed Assets vault session alive / auto-lock while managing tiles
  useEffect(() => {
    if (!isFixedAssetsUnlocked()) return undefined
    if (shouldAutoLockFixedAssets()) {
      lockFixedAssets()
      toast('Fixed Assets locked after 5 minutes of inactivity.', 'success')
      return undefined
    }
    touchFixedAssetsActivity()
    const bump = () => touchFixedAssetsActivity()
    const events = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'wheel']
    events.forEach(ev => window.addEventListener(ev, bump, { passive: true }))
    const tick = window.setInterval(() => {
      if (shouldAutoLockFixedAssets()) {
        lockFixedAssets()
        toast('Fixed Assets locked after 5 minutes of inactivity.', 'success')
      }
    }, 15_000)
    return () => {
      events.forEach(ev => window.removeEventListener(ev, bump))
      window.clearInterval(tick)
    }
  }, [toast])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setRows(await getFixedAssets(true))
    } catch (e) {
      toast(e.message, 'error')
    }
    setLoading(false)
  }, [toast])

  useEffect(() => { load() }, [load])

  async function handleSave(form) {
    const who = profile?.full_name || profile?.email || null
    try {
      await saveFixedAsset({
        ...form,
        created_by: who,
        updated_by: who,
      }, modal?.id || null)
      toast(modal?.id ? 'Fixed asset updated.' : 'Fixed asset added.', 'success')
      setModal(null)
      await load()
    } catch (e) {
      toast(e.message, 'error')
      throw e
    }
  }

  async function handleDelete(row) {
    if (!confirm(`Remove “${row.name}” from Fixed Assets?\n\nIt goes to Recycle Bin with cover photo and documents.`)) return
    setBusy(row.id)
    try {
      await softDeleteFixedAsset(row.id, profile?.full_name || profile?.email || null)
      toast('Fixed asset moved to Recycle Bin.', 'success')
      await load()
    } catch (e) {
      toast(e.message, 'error')
    }
    setBusy(null)
  }

  return (
    <div>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 14, gap: 12, flexWrap: 'wrap',
      }}>
        <div>
          <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--text-1)' }}>Fixed Asset tiles</p>
          <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-3)' }}>
            Create property tiles here. Open Fixed Assets (master password) to store documents in each tile.
          </p>
        </div>
        <button
          onClick={() => setModal({})}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 7, padding: '8px 16px',
            background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8,
            fontSize: 13, fontWeight: 600, cursor: 'pointer',
          }}
        >
          <Plus size={14} /> Add Fixed Asset
        </button>
      </div>

      {loading ? (
        <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--text-3)' }}>
          <Loader2 size={22} className="animate-spin" style={{ display: 'block', margin: '0 auto 8px' }} />
          Loading…
        </div>
      ) : rows.filter(r => r.is_active).length === 0 ? (
        <div className="card" style={{ padding: '40px 24px', textAlign: 'center' }}>
          <Building2 size={28} style={{ color: 'var(--text-3)', margin: '0 auto 10px', display: 'block', opacity: 0.5 }} />
          <p style={{ margin: '0 0 4px', fontSize: 14, fontWeight: 600, color: 'var(--text-1)' }}>No fixed assets yet</p>
          <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--text-3)' }}>Add Land, Church Building, Parsonage, Hall, etc.</p>
          <button onClick={() => setModal({})} style={{
            display: 'inline-flex', alignItems: 'center', gap: 7, padding: '8px 16px',
            background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8,
            fontSize: 13, fontWeight: 600, cursor: 'pointer',
          }}>
            <Plus size={14} /> Add Fixed Asset
          </button>
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          {rows.filter(r => r.is_active).map(row => (
            <div key={row.id} style={{
              display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px',
              borderBottom: '1px solid var(--card-border)',
            }}>
              <div style={{
                width: 44, height: 44, borderRadius: 10, overflow: 'hidden', flexShrink: 0,
                background: 'var(--table-header-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {row.cover_url
                  ? <img src={row.cover_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  : <Building2 size={18} style={{ color: 'var(--text-3)' }} />}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--text-1)' }}>{row.name}</p>
                <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--text-3)' }}>
                  {[row.asset_type, row.status, row.location_label].filter(Boolean).join(' · ')}
                </p>
              </div>
              {row.drive_url && (
                <a href={row.drive_url} target="_blank" rel="noreferrer" title="Google Drive"
                  style={{ padding: '6px', color: 'var(--accent)', display: 'flex' }}>
                  <ExternalLink size={14} />
                </a>
              )}
              <button onClick={() => setModal(row)} title="Edit"
                style={{
                  padding: '5px 7px', background: 'var(--table-header-bg)',
                  border: '1px solid var(--card-border)', borderRadius: 6, cursor: 'pointer',
                  color: 'var(--text-2)', display: 'inline-flex',
                }}>
                <Pencil size={13} />
              </button>
              <button onClick={() => handleDelete(row)} disabled={busy === row.id} title="Remove"
                style={{
                  padding: '5px 7px', background: '#fff5f5', border: '1px solid #fca5a5',
                  borderRadius: 6, cursor: 'pointer', color: '#b91c1c', display: 'inline-flex',
                }}>
                {busy === row.id ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
              </button>
            </div>
          ))}
        </div>
      )}

      {modal && (
        <AssetFormModal
          editing={modal.id ? modal : null}
          onSave={handleSave}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  )
}
