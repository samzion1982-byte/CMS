/* ═══════════════════════════════════════════════════════════════
   AssetsPage.jsx — Church inventory register
   Tabs: Movable Assets (active) · Buildings · Documents (later)
   ═══════════════════════════════════════════════════════════════ */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Package, Settings, Plus, Pencil, Trash2, Loader2, X, Save,
  Search, Camera, ImageOff, Filter, RotateCcw,
} from 'lucide-react'
import { useToast } from '../lib/toast'
import { useAuth } from '../lib/AuthContext'
import {
  ASSET_CATEGORIES,
  getAssets, saveAsset, softDeleteAsset,
  getAssetLocations, getAssetItemTypes, getAssetConditions,
  uploadAssetPhoto, removeAssetPhoto,
} from '../lib/assetsLib'

const INPUT = {
  height: 38, padding: '0 12px', border: '1.5px solid var(--card-border)',
  borderRadius: 8, fontSize: 13, background: 'var(--input-bg)',
  color: 'var(--text-1)', outline: 'none', boxSizing: 'border-box', width: '100%',
}

function FL({ children, optional }) {
  return (
    <label style={{
      fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em',
      color: 'var(--text-3)', display: 'block', marginBottom: 6,
    }}>
      {children}
      {optional && <span style={{ fontWeight: 500, textTransform: 'none', letterSpacing: 0, marginLeft: 6, color: 'var(--text-3)', opacity: 0.75 }}>(optional)</span>}
    </label>
  )
}

function emptyForm(category, defaults = {}) {
  return {
    asset_category: category,
    description: '',
    location_id: '',
    item_type_id: '',
    condition_id: defaults.workingId || '',
    unit_price: '',
    purchase_value: '',
    invoice_no: '',
    invoice_date: '',
    supplier_name: '',
    supplier_address: '',
    supplier_contact: '',
    notes: '',
    photo_url: null,
    photo_path: null,
  }
}

/* ── Asset form modal ──────────────────────────────────────────── */

function AssetModal({ editing, category, locations, itemTypes, conditions, onSave, onClose }) {
  const toast = useToast()
  const workingId = conditions.find(c => c.name === 'Working')?.id || ''
  const [form, setForm] = useState(() => editing
    ? {
        asset_category: editing.asset_category || category,
        description: editing.description || '',
        location_id: editing.location_id || '',
        item_type_id: editing.item_type_id || '',
        condition_id: editing.condition_id || workingId,
        unit_price: editing.unit_price ?? '',
        purchase_value: editing.purchase_value ?? '',
        invoice_no: editing.invoice_no || '',
        invoice_date: editing.invoice_date || '',
        supplier_name: editing.supplier_name || '',
        supplier_address: editing.supplier_address || '',
        supplier_contact: editing.supplier_contact || '',
        notes: editing.notes || '',
        photo_url: editing.photo_url || null,
        photo_path: editing.photo_path || null,
      }
    : emptyForm(category, { workingId })
  )
  const [photoFile, setPhotoFile] = useState(null)
  const [photoPreview, setPhotoPreview] = useState(editing?.photo_url || null)
  const [removePhoto, setRemovePhoto] = useState(false)
  const [saving, setSaving] = useState(false)
  const fileRef = useRef(null)

  function set(key, value) { setForm(f => ({ ...f, [key]: value })) }

  function onPhotoPick(e) {
    const f = e.target.files?.[0]
    if (!f) return
    if (!f.type.startsWith('image/')) { toast('Please choose an image file.', 'error'); return }
    if (f.size > 5 * 1024 * 1024) { toast('Photo must be under 5 MB.', 'error'); return }
    setPhotoFile(f)
    setPhotoPreview(URL.createObjectURL(f))
    setRemovePhoto(false)
  }

  function clearPhoto() {
    setPhotoFile(null)
    setPhotoPreview(null)
    setRemovePhoto(true)
    if (fileRef.current) fileRef.current.value = ''
  }

  async function handleSave() {
    if (!form.description.trim()) { toast('Description is required.', 'error'); return }
    setSaving(true)
    try {
      let photo_url = form.photo_url
      let photo_path = form.photo_path

      if (removePhoto && !photoFile) {
        if (photo_path) await removeAssetPhoto(photo_path).catch(() => {})
        photo_url = null
        photo_path = null
      }

      if (photoFile) {
        if (photo_path) await removeAssetPhoto(photo_path).catch(() => {})
        const up = await uploadAssetPhoto(photoFile, editing?.id)
        photo_url = up.url
        photo_path = up.path
      }

      await onSave({
        ...form,
        photo_url,
        photo_path,
      }, editing?.id || null)
      onClose()
    } catch (e) {
      toast(e.message || 'Save failed', 'error')
    }
    setSaving(false)
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 2000, background: 'rgba(0,0,0,0.55)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
    }}>
      <div style={{
        background: 'var(--card-bg)', borderRadius: 16, width: '100%', maxWidth: 640,
        maxHeight: '92vh', overflowY: 'auto', boxShadow: '0 24px 60px rgba(0,0,0,0.25)',
      }}>
        <div style={{
          padding: '18px 22px 14px', borderBottom: '1px solid var(--card-border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          position: 'sticky', top: 0, background: 'var(--card-bg)', zIndex: 1,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Package size={16} style={{ color: 'var(--accent)' }} />
            <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-1)', margin: 0 }}>
              {editing ? `Edit Asset #${editing.serial_no}` : 'Add Asset'}
            </p>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', display: 'flex' }}>
            <X size={16} />
          </button>
        </div>

        <div style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Photo */}
          <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
            <div
              onClick={() => fileRef.current?.click()}
              style={{
                width: 96, height: 96, borderRadius: 12, flexShrink: 0,
                border: '1.5px dashed var(--card-border)', background: 'var(--table-header-bg)',
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', overflow: 'hidden', position: 'relative',
              }}
              title="Upload photo (optional)"
            >
              {photoPreview
                ? <img src={photoPreview} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : <>
                    <Camera size={22} style={{ color: 'var(--text-3)' }} />
                    <span style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 4 }}>Photo</span>
                  </>
              }
            </div>
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={onPhotoPick} />
            <div style={{ flex: 1 }}>
              <FL optional>Photo</FL>
              <p style={{ fontSize: 12, color: 'var(--text-3)', margin: '0 0 8px', lineHeight: 1.45 }}>
                Optional. JPEG / PNG / WebP, up to 5 MB.
              </p>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" onClick={() => fileRef.current?.click()}
                  style={{
                    padding: '6px 12px', fontSize: 12, fontWeight: 600, borderRadius: 7, cursor: 'pointer',
                    background: 'var(--card-bg)', border: '1.5px solid var(--card-border)', color: 'var(--text-2)',
                  }}>
                  Choose…
                </button>
                {(photoPreview || form.photo_url) && (
                  <button type="button" onClick={clearPhoto}
                    style={{
                      padding: '6px 12px', fontSize: 12, fontWeight: 600, borderRadius: 7, cursor: 'pointer',
                      background: '#fff5f5', border: '1px solid #fca5a5', color: '#b91c1c',
                    }}>
                    Remove
                  </button>
                )}
              </div>
            </div>
          </div>

          <div>
            <FL>Description *</FL>
            <input value={form.description} onChange={e => set('description', e.target.value)}
              placeholder="e.g. Wooden Pulpit" style={INPUT} autoFocus />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
            <div>
              <FL>Item Type</FL>
              <select value={form.item_type_id} onChange={e => set('item_type_id', e.target.value)} style={INPUT}>
                <option value="">— Select —</option>
                {itemTypes.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            <div>
              <FL>Location</FL>
              <select value={form.location_id} onChange={e => set('location_id', e.target.value)} style={INPUT}>
                <option value="">— Select —</option>
                {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </div>
            <div>
              <FL>Condition</FL>
              <select value={form.condition_id} onChange={e => set('condition_id', e.target.value)} style={INPUT}>
                <option value="">— Select —</option>
                {conditions.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          </div>

          <div style={{
            borderTop: '1px solid var(--card-border)', paddingTop: 14,
            display: 'flex', flexDirection: 'column', gap: 14,
          }}>
            <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-3)', margin: 0 }}>
              Purchase &amp; supplier — optional
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
              <div>
                <FL optional>Unit Price (₹)</FL>
                <input type="number" min="0" step="0.01" value={form.unit_price}
                  onChange={e => set('unit_price', e.target.value)} placeholder="0.00" style={INPUT} />
              </div>
              <div>
                <FL optional>Purchase Value (₹)</FL>
                <input type="number" min="0" step="0.01" value={form.purchase_value}
                  onChange={e => set('purchase_value', e.target.value)} placeholder="0.00" style={INPUT} />
              </div>
              <div>
                <FL optional>Invoice Date</FL>
                <input type="date" value={form.invoice_date}
                  onChange={e => set('invoice_date', e.target.value)} style={INPUT} />
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <div>
                <FL optional>Invoice No.</FL>
                <input value={form.invoice_no} onChange={e => set('invoice_no', e.target.value)}
                  placeholder="Invoice reference" style={INPUT} />
              </div>
              <div>
                <FL optional>Supplier Name</FL>
                <input value={form.supplier_name} onChange={e => set('supplier_name', e.target.value)}
                  placeholder="Vendor name" style={INPUT} />
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <div>
                <FL optional>Supplier Address</FL>
                <input value={form.supplier_address} onChange={e => set('supplier_address', e.target.value)}
                  placeholder="Address" style={INPUT} />
              </div>
              <div>
                <FL optional>Contact No.</FL>
                <input value={form.supplier_contact} onChange={e => set('supplier_contact', e.target.value)}
                  placeholder="Phone" style={INPUT} />
              </div>
            </div>
          </div>

          <div>
            <FL optional>Notes</FL>
            <textarea value={form.notes} onChange={e => set('notes', e.target.value)}
              rows={2} placeholder="Any additional remarks"
              style={{ ...INPUT, height: 'auto', padding: '10px 12px', resize: 'vertical' }} />
          </div>
        </div>

        <div style={{
          padding: '14px 22px', borderTop: '1px solid var(--card-border)',
          display: 'flex', justifyContent: 'flex-end', gap: 10,
          position: 'sticky', bottom: 0, background: 'var(--card-bg)',
        }}>
          <button onClick={onClose}
            style={{
              padding: '8px 18px', background: 'var(--card-bg)', border: '1.5px solid var(--card-border)',
              borderRadius: 8, cursor: 'pointer', fontSize: 13, color: 'var(--text-2)',
            }}>
            Cancel
          </button>
          <button onClick={handleSave} disabled={saving || !form.description.trim()}
            style={{
              display: 'flex', alignItems: 'center', gap: 7, padding: '8px 18px',
              background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8,
              fontSize: 13, fontWeight: 600, cursor: saving ? 'wait' : 'pointer',
              opacity: saving || !form.description.trim() ? 0.65 : 1,
            }}>
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            {editing ? 'Update' : 'Save Asset'}
          </button>
        </div>
      </div>
    </div>
  )
}

/* ── Coming soon placeholder ───────────────────────────────────── */

function ComingSoon({ label }) {
  return (
    <div className="card" style={{ padding: '56px 24px', textAlign: 'center' }}>
      <Package size={36} style={{ color: 'var(--text-3)', margin: '0 auto 12px', display: 'block', opacity: 0.5 }} />
      <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-1)', margin: '0 0 6px' }}>{label}</p>
      <p style={{ fontSize: 13, color: 'var(--text-3)', margin: 0, maxWidth: 360, marginInline: 'auto', lineHeight: 1.5 }}>
        Coming next. We&apos;re focusing on movable assets first — buildings and important church documents will follow.
      </p>
    </div>
  )
}

/* ── Main page ─────────────────────────────────────────────────── */

export default function AssetsPage() {
  const navigate = useNavigate()
  const toast = useToast()
  const { profile } = useAuth()

  const [tab, setTab] = useState('movable')
  const [assets, setAssets] = useState([])
  const [locations, setLocations] = useState([])
  const [itemTypes, setItemTypes] = useState([])
  const [conditions, setConditions] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(null) // null | {} | asset
  const [search, setSearch] = useState('')
  const [filterType, setFilterType] = useState('')
  const [filterLoc, setFilterLoc] = useState('')
  const [filterCond, setFilterCond] = useState('')
  const [deleting, setDeleting] = useState(null)

  const loadMasters = useCallback(async () => {
    const [locs, types, conds] = await Promise.all([
      getAssetLocations(true),
      getAssetItemTypes(true),
      getAssetConditions(true),
    ])
    setLocations(locs)
    setItemTypes(types)
    setConditions(conds)
  }, [])

  const loadAssets = useCallback(async () => {
    if (tab !== 'movable') { setAssets([]); setLoading(false); return }
    setLoading(true)
    try {
      const data = await getAssets(tab)
      setAssets(data)
    } catch (e) {
      toast(e.message, 'error')
    }
    setLoading(false)
  }, [tab, toast])

  useEffect(() => { loadMasters().catch(e => toast(e.message, 'error')) }, [loadMasters, toast])
  useEffect(() => { loadAssets() }, [loadAssets])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return assets.filter(a => {
      if (filterType && a.item_type_id !== filterType) return false
      if (filterLoc && a.location_id !== filterLoc) return false
      if (filterCond && a.condition_id !== filterCond) return false
      if (!q) return true
      const hay = [
        a.description, a.serial_no, a.location?.name, a.item_type?.name,
        a.condition?.name, a.supplier_name, a.invoice_no, a.notes,
      ].filter(Boolean).join(' ').toLowerCase()
      return hay.includes(q)
    })
  }, [assets, search, filterType, filterLoc, filterCond])

  const hasFilters = !!(search || filterType || filterLoc || filterCond)

  async function handleSave(payload, id) {
    await saveAsset({
      ...payload,
      created_by: profile?.full_name || profile?.email || null,
      updated_by: profile?.full_name || profile?.email || null,
    }, id)
    toast(id ? 'Asset updated.' : 'Asset added.', 'success')
    await loadAssets()
  }

  async function handleDelete(asset) {
    if (!confirm(`Remove “${asset.description}” from the register?`)) return
    setDeleting(asset.id)
    try {
      await softDeleteAsset(asset.id, profile?.full_name || profile?.email || null)
      toast('Asset removed.', 'success')
      setAssets(list => list.filter(a => a.id !== asset.id))
    } catch (e) {
      toast(e.message, 'error')
    }
    setDeleting(null)
  }

  function clearFilters() {
    setSearch('')
    setFilterType('')
    setFilterLoc('')
    setFilterCond('')
  }

  function fmtMoney(v) {
    if (v == null || v === '') return '—'
    return `₹${Number(v).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`
  }

  return (
    <div className="page-container">
      {/* Header */}
      <div className="page-header" style={{ alignItems: 'flex-start' }}>
        <div>
          <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Package size={20} style={{ color: 'var(--accent)' }} />
            Assets
          </h1>
          <p className="page-subtitle">Track church inventory — one entry per item</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button
            onClick={() => navigate('/assets/settings')}
            title="Asset Settings"
            style={{
              padding: '8px 10px', background: 'var(--card-bg)', border: '1.5px solid var(--card-border)',
              borderRadius: 8, cursor: 'pointer', display: 'flex', alignItems: 'center', color: 'var(--text-2)',
            }}
          >
            <Settings size={15} />
          </button>
          {tab === 'movable' && (
            <button
              onClick={() => setModal({})}
              style={{
                display: 'flex', alignItems: 'center', gap: 7, padding: '8px 18px',
                background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8,
                fontSize: 13, fontWeight: 600, cursor: 'pointer',
              }}
            >
              <Plus size={14} /> Add Asset
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div style={{
        display: 'flex', gap: 4, borderBottom: '2px solid var(--border, #e2e8f0)', marginBottom: 20,
      }}>
        {ASSET_CATEGORIES.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              padding: '9px 22px', fontSize: 14,
              fontWeight: tab === t.id ? 700 : 500,
              border: 'none',
              borderBottom: tab === t.id
                ? '2px solid var(--sidebar-bg, #1e293b)' : '2px solid transparent',
              marginBottom: -2,
              background: tab === t.id ? 'var(--sidebar-bg, #1e293b)' : 'transparent',
              color: tab === t.id ? '#ffffff' : 'var(--text-muted, #64748b)',
              cursor: 'pointer', borderRadius: '6px 6px 0 0', transition: 'all 0.15s',
            }}
          >
            {t.label}
            {!t.enabled && tab !== t.id && (
              <span style={{ marginLeft: 8, fontSize: 10, fontWeight: 700, opacity: 0.7 }}>SOON</span>
            )}
          </button>
        ))}
      </div>

      {tab !== 'movable' ? (
        <ComingSoon label={ASSET_CATEGORIES.find(c => c.id === tab)?.label} />
      ) : (
        <>
          {/* Filters */}
          <div className="card" style={{ padding: '12px 14px', marginBottom: 14 }}>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
              <div style={{ position: 'relative', flex: '1 1 200px', minWidth: 180 }}>
                <Search size={13} style={{
                  position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)',
                  color: 'var(--text-3)', pointerEvents: 'none',
                }} />
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search description, supplier, invoice…"
                  style={{ ...INPUT, paddingLeft: 32 }}
                />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Filter size={12} style={{ color: 'var(--text-3)' }} />
                <select value={filterType} onChange={e => setFilterType(e.target.value)} style={{ ...INPUT, width: 'auto', minWidth: 150 }}>
                  <option value="">All types</option>
                  {itemTypes.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
                <select value={filterLoc} onChange={e => setFilterLoc(e.target.value)} style={{ ...INPUT, width: 'auto', minWidth: 130 }}>
                  <option value="">All locations</option>
                  {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
                <select value={filterCond} onChange={e => setFilterCond(e.target.value)} style={{ ...INPUT, width: 'auto', minWidth: 130 }}>
                  <option value="">All conditions</option>
                  {conditions.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                {hasFilters && (
                  <button onClick={clearFilters} title="Clear filters"
                    style={{
                      display: 'flex', alignItems: 'center', gap: 4, padding: '0 10px', height: 38,
                      background: 'none', border: '1px solid var(--card-border)', borderRadius: 8,
                      cursor: 'pointer', fontSize: 12, color: 'var(--text-3)',
                    }}>
                    <RotateCcw size={12} /> Clear
                  </button>
                )}
              </div>
            </div>
            <p style={{ fontSize: 11, color: 'var(--text-3)', margin: '8px 0 0' }}>
              Showing {filtered.length} of {assets.length} item{assets.length === 1 ? '' : 's'}
            </p>
          </div>

          {loading ? (
            <div className="card" style={{ padding: 48, textAlign: 'center', color: 'var(--text-3)' }}>
              <Loader2 size={24} className="animate-spin" style={{ display: 'block', margin: '0 auto 8px' }} />
              Loading assets…
            </div>
          ) : filtered.length === 0 ? (
            <div className="card" style={{ padding: '48px 24px', textAlign: 'center' }}>
              <ImageOff size={28} style={{ color: 'var(--text-3)', margin: '0 auto 10px', display: 'block', opacity: 0.5 }} />
              <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-1)', margin: '0 0 4px' }}>
                {assets.length === 0 ? 'No assets yet' : 'No matching assets'}
              </p>
              <p style={{ fontSize: 13, color: 'var(--text-3)', margin: '0 0 16px' }}>
                {assets.length === 0
                  ? 'Add the first item from your inventory register.'
                  : 'Try clearing filters or adjusting your search.'}
              </p>
              {assets.length === 0 && (
                <button onClick={() => setModal({})}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 7, padding: '8px 18px',
                    background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8,
                    fontSize: 13, fontWeight: 600, cursor: 'pointer',
                  }}>
                  <Plus size={14} /> Add Asset
                </button>
              )}
            </div>
          ) : (
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: 'var(--table-header-bg)', borderBottom: '1px solid var(--card-border)' }}>
                      {['#', 'Photo', 'Description', 'Type', 'Location', 'Condition', 'Purchase', ''].map(h => (
                        <th key={h || 'actions'} style={{
                          textAlign: h === '' ? 'right' : 'left',
                          padding: '10px 14px', fontSize: 10, fontWeight: 700,
                          textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-3)',
                          whiteSpace: 'nowrap',
                        }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map(a => {
                      const condColor = a.condition?.color || '#64748b'
                      return (
                        <tr key={a.id} style={{ borderBottom: '1px solid var(--card-border)' }}>
                          <td style={{ padding: '10px 14px', color: 'var(--text-3)', fontFamily: 'monospace', width: 48 }}>
                            {a.serial_no}
                          </td>
                          <td style={{ padding: '8px 14px', width: 56 }}>
                            <div style={{
                              width: 40, height: 40, borderRadius: 8, overflow: 'hidden',
                              background: 'var(--table-header-bg)', display: 'flex',
                              alignItems: 'center', justifyContent: 'center',
                            }}>
                              {a.photo_url
                                ? <img src={a.photo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                : <Camera size={14} style={{ color: 'var(--text-3)', opacity: 0.45 }} />
                              }
                            </div>
                          </td>
                          <td style={{ padding: '10px 14px', maxWidth: 260 }}>
                            <p style={{ margin: 0, fontWeight: 600, color: 'var(--text-1)' }}>{a.description}</p>
                            {a.supplier_name && (
                              <p style={{ margin: '2px 0 0', fontSize: 11, color: 'var(--text-3)' }}>{a.supplier_name}</p>
                            )}
                          </td>
                          <td style={{ padding: '10px 14px', color: 'var(--text-2)', whiteSpace: 'nowrap' }}>
                            {a.item_type?.name || '—'}
                          </td>
                          <td style={{ padding: '10px 14px', color: 'var(--text-2)', whiteSpace: 'nowrap' }}>
                            {a.location?.name || '—'}
                          </td>
                          <td style={{ padding: '10px 14px' }}>
                            {a.condition ? (
                              <span style={{
                                fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 6,
                                background: `${condColor}18`, color: condColor, whiteSpace: 'nowrap',
                              }}>
                                {a.condition.name}
                              </span>
                            ) : '—'}
                          </td>
                          <td style={{ padding: '10px 14px', fontFamily: 'monospace', color: 'var(--text-2)', whiteSpace: 'nowrap' }}>
                            {fmtMoney(a.purchase_value ?? a.unit_price)}
                          </td>
                          <td style={{ padding: '10px 14px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                            <button onClick={() => setModal(a)} title="Edit"
                              style={{
                                padding: '5px 7px', marginRight: 4, background: 'var(--table-header-bg)',
                                border: '1px solid var(--card-border)', borderRadius: 6, cursor: 'pointer',
                                color: 'var(--text-2)', display: 'inline-flex',
                              }}>
                              <Pencil size={13} />
                            </button>
                            <button onClick={() => handleDelete(a)} disabled={deleting === a.id} title="Remove"
                              style={{
                                padding: '5px 7px', background: '#fff5f5', border: '1px solid #fca5a5',
                                borderRadius: 6, cursor: 'pointer', color: '#b91c1c', display: 'inline-flex',
                              }}>
                              {deleting === a.id ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {modal && (
        <AssetModal
          editing={modal.id ? modal : null}
          category={tab}
          locations={locations}
          itemTypes={itemTypes}
          conditions={conditions}
          onSave={handleSave}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  )
}
