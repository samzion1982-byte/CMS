/* ═══════════════════════════════════════════════════════════════
   AssetsPage.jsx — Asset Management register
   Tabs: Movable Assets (active) · Fixed Assets · Documents (later)
   ═══════════════════════════════════════════════════════════════ */

import { useState, useEffect, useCallback, useMemo, useRef, Fragment } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  Package, Settings, Plus, Pencil, Trash2, Loader2, X, Save,
  Search, Camera, ImageOff, Filter, RotateCcw, ChevronDown, ChevronRight,
  Folder, FolderOpen, CornerDownRight, ArrowRightLeft, FileSpreadsheet,
} from 'lucide-react'
import { useToast } from '../lib/toast'
import { useAuth } from '../lib/AuthContext'
import { getChurch } from '../lib/supabase'
import { exportToExcelWithTitle, exportMultiSheetWithTitle } from '../lib/exportExcel'
import FixedAssetsVault from '../components/assets/FixedAssetsVault'
import ChurchDocumentsVault from '../components/assets/ChurchDocumentsVault'
import { canAccessAssetTab } from '../lib/cmsPermissions'
import { isPlusHotkey, isTypingTarget } from '../lib/plusHotkey'
import {
  ASSET_CATEGORIES, PHOTO_MAX_BYTES,
  getAssets, saveAsset, hardDeleteAsset, moveStockOut, moveStockIn, returnStockToHand,
  getAssetLocations, getAssetItemTypes, getAssetConditions,
  uploadAssetPhoto, removeAssetPhoto,
  masterDisplayName, flattenMasterOptions, buildMasterTree, isAssetOnHand,
  userFacingNotes, findConditionId, assertStockDates,
} from '../lib/assetsLib'
import PageHeader from '../components/ui/PageHeader'
import DatePartsInput from '../components/ui/DatePartsInput'

const INPUT = {
  height: 38, padding: '0 12px', border: '1.5px solid var(--card-border)',
  borderRadius: 8, fontSize: 13, background: 'var(--input-bg)',
  color: 'var(--text-1)', outline: 'none', boxSizing: 'border-box', width: '100%',
}

function getModalFocusables(root) {
  if (!root) return []
  return Array.from(
    root.querySelectorAll(
      'input:not([disabled]):not([type="hidden"]):not([tabindex="-1"]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]):not([tabindex="-1"])'
    )
  ).filter(n => {
    if (n.dataset.displayOnly === '1') return false
    const style = window.getComputedStyle(n)
    if (style.visibility === 'hidden' || style.display === 'none') return false
    return true
  })
}

function getFormFocusables(fromEl) {
  const root = fromEl?.closest?.('[data-asset-modal]')
    || fromEl?.closest?.('[data-asset-form]')
    || document
  return getModalFocusables(root).filter(n => n.dataset.treeSearch !== '1')
}

function focusNextFormField(fromEl, { openPicker = false } = {}) {
  if (!fromEl) return false
  const list = getFormFocusables(fromEl)
  const idx = list.indexOf(fromEl)
  if (idx === -1 || idx >= list.length - 1) return false
  const next = list[idx + 1]
  next.focus()
  if (openPicker && typeof next.showPicker === 'function') {
    try { next.showPicker() } catch { /* needs user gesture; ignore */ }
  }
  return true
}

/**
 * After a discrete pick (tree/select/date), move focus to the next field.
 * Retries once after paint — Location used to steal focus back by reopening
 * its dropdown on accidental re-focus after the menu unmounted.
 */
function advanceAfterChange(el) {
  if (!el) return
  if (focusNextFormField(el)) return
  requestAnimationFrame(() => {
    setTimeout(() => focusNextFormField(el), 0)
  })
}

/** Enter advances; Tab uses the modal trap. Textareas keep Enter for newlines. */
function onAdvanceKeyDown(e) {
  if (e.key !== 'Enter') return
  if (e.target?.tagName === 'TEXTAREA') return
  // Date segments handle Enter themselves
  if (e.target?.dataset?.datePart) return
  e.preventDefault()
  advanceAfterChange(e.target)
}

function MasterTreeSelect({ rows, value, onChange, placeholder = '— Select —' }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0 })
  const wrapRef = useRef(null)
  const btnRef = useRef(null)
  const searchRef = useRef(null)
  const suppressOpenRef = useRef(false)
  const tree = useMemo(() => buildMasterTree(rows), [rows])
  const selected = rows.find(r => r.id === value) || null
  const label = selected ? masterDisplayName(selected, rows) : ''

  useEffect(() => {
    function onDown(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setOpen(false)
        setQuery('')
      }
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [])

  function openDrop() {
    if (!btnRef.current) return
    const r = btnRef.current.getBoundingClientRect()
    const spaceBelow = window.innerHeight - r.bottom
    const openUp = spaceBelow < 300 && r.top > spaceBelow
    setPos({
      top: openUp ? undefined : r.bottom + 4,
      bottom: openUp ? window.innerHeight - r.top + 4 : undefined,
      left: r.left,
      width: Math.max(r.width, 240),
    })
    setOpen(true)
    requestAnimationFrame(() => searchRef.current?.focus())
  }

  const q = query.trim().toLowerCase()

  function nodeMatches(node) {
    if (!q) return true
    if (node.name.toLowerCase().includes(q)) return true
    return (node.children || []).some(nodeMatches)
  }

  function pick(id) {
    // Prevent this trigger's onFocus from reopening the menu when focus
    // briefly returns here after the dropdown unmounts (was blocking
    // Location → Condition advance).
    suppressOpenRef.current = true
    onChange(id)
    setOpen(false)
    setQuery('')
    const from = btnRef.current
    // Advance now (still in the click gesture) so select/date can open
    focusNextFormField(from, { openPicker: true })
    requestAnimationFrame(() => {
      setTimeout(() => focusNextFormField(from), 0)
    })
  }

  function renderNode(node, depth) {
    if (q && !nodeMatches(node)) return null
    const isRoot = depth === 0
    const hasKids = node.children?.length > 0
    const isSel = value === node.id
    const kids = (node.children || []).map(c => renderNode(c, depth + 1)).filter(Boolean)

    return (
      <div key={node.id}>
        <button
          type="button"
          tabIndex={-1}
          onClick={() => pick(node.id)}
          style={{
            display: 'flex', alignItems: 'center', gap: 8, width: '100%',
            padding: isRoot ? '9px 12px' : '7px 12px',
            paddingLeft: 12 + depth * 18,
            border: 'none', cursor: 'pointer', textAlign: 'left',
            background: isSel
              ? 'var(--accent-subtle, #eff6ff)'
              : isRoot ? 'rgba(15, 23, 42, 0.04)' : 'transparent',
            borderBottom: isRoot ? '1px solid var(--card-border)' : 'none',
            borderLeft: !isRoot ? '3px solid var(--accent)' : '3px solid transparent',
            borderRadius: isRoot ? 0 : '0 6px 6px 0',
          }}
        >
          {isRoot
            ? (hasKids
              ? <FolderOpen size={14} style={{ color: 'var(--accent)', flexShrink: 0 }} />
              : <Folder size={14} style={{ color: 'var(--text-3)', flexShrink: 0 }} />)
            : <CornerDownRight size={13} style={{ color: 'var(--accent)', flexShrink: 0, opacity: 0.7 }} />
          }
          <span style={{
            flex: 1,
            fontSize: isRoot ? 13 : 12.5,
            fontWeight: isRoot ? 700 : 500,
            color: isSel ? 'var(--accent)' : 'var(--text-1)',
            letterSpacing: isRoot ? '0.01em' : 'normal',
          }}>
            {node.name}
          </span>
          {isRoot && hasKids && (
            <span style={{
              fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 99,
              background: 'var(--card-bg)', color: 'var(--text-3)',
              border: '1px solid var(--card-border)',
            }}>
              {node.children.length}
            </span>
          )}
        </button>
        {kids.length > 0 && (
          <div style={{
            background: isRoot ? 'rgba(37, 99, 235, 0.03)' : 'transparent',
            paddingBottom: isRoot ? 4 : 0,
          }}>
            {kids}
          </div>
        )}
      </div>
    )
  }

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <div style={{ position: 'relative' }}>
        <input
          ref={btnRef}
          readOnly
          value={label}
          placeholder={placeholder}
          data-tree-trigger="1"
          className="asset-focus-field"
          onClick={() => (open ? (setOpen(false), setQuery('')) : openDrop())}
          onFocus={() => {
            if (suppressOpenRef.current) {
              suppressOpenRef.current = false
              return
            }
            if (!open) openDrop()
          }}
          onKeyDown={e => {
            if (e.key === 'ArrowDown' || e.key === ' ') {
              e.preventDefault()
              if (!open) openDrop()
            }
            if (e.key === 'Enter') {
              if (open) e.preventDefault()
            }
            if (e.key === 'Escape' && open) {
              e.preventDefault()
              suppressOpenRef.current = true
              setOpen(false)
              setQuery('')
            }
            if (e.key === 'Tab' && open) {
              e.preventDefault()
              suppressOpenRef.current = true
              setOpen(false)
              setQuery('')
              const from = btnRef.current
              focusNextFormField(from)
              requestAnimationFrame(() => {
                setTimeout(() => focusNextFormField(from), 0)
              })
            }
          }}
          style={{
            ...INPUT,
            cursor: 'pointer',
            paddingRight: 34,
            color: label ? 'var(--text-1)' : undefined,
            fontWeight: label ? 600 : 400,
          }}
        />
        {value ? (
          <button
            type="button"
            tabIndex={-1}
            title="Clear"
            onClick={e => { e.stopPropagation(); onChange(''); btnRef.current?.focus() }}
            style={{
              position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
              display: 'flex', color: 'var(--text-3)', padding: 2, background: 'none',
              border: 'none', cursor: 'pointer',
            }}
          >
            <X size={13} />
          </button>
        ) : (
          <ChevronDown
            size={14}
            style={{
              position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
              color: 'var(--text-3)', pointerEvents: 'none',
            }}
          />
        )}
      </div>

      {open && (
        <div style={{
          position: 'fixed',
          top: pos.top,
          bottom: pos.bottom,
          left: pos.left,
          width: pos.width,
          zIndex: 4000,
          background: 'var(--card-bg)', border: '1px solid var(--card-border)',
          borderRadius: 10, boxShadow: '0 12px 32px rgba(0,0,0,0.16)',
          overflow: 'hidden', display: 'flex', flexDirection: 'column',
          maxHeight: 320,
        }}>
          <div style={{ padding: 8, borderBottom: '1px solid var(--card-border)', flexShrink: 0 }}>
            <div style={{ position: 'relative' }}>
              <Search size={12} style={{
                position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)',
                color: 'var(--text-3)', pointerEvents: 'none',
              }} />
              <input
                ref={searchRef}
                data-tree-search="1"
                value={query}
                onChange={e => setQuery(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    const flat = []
                    const walk = (nodes) => {
                      nodes.forEach(n => {
                        if (!q || nodeMatches(n)) flat.push(n)
                        if (n.children?.length) walk(n.children)
                      })
                    }
                    walk(tree)
                    const hit = flat.find(n => !q || n.name.toLowerCase().includes(q))
                    if (hit) pick(hit.id)
                  }
                  if (e.key === 'Escape') {
                    e.preventDefault()
                    suppressOpenRef.current = true
                    setOpen(false)
                    setQuery('')
                    btnRef.current?.focus()
                  }
                  if (e.key === 'Tab') {
                    e.preventDefault()
                    suppressOpenRef.current = true
                    setOpen(false)
                    setQuery('')
                    if (e.shiftKey) {
                      btnRef.current?.focus()
                    } else {
                      const from = btnRef.current
                      focusNextFormField(from)
                      requestAnimationFrame(() => {
                        setTimeout(() => focusNextFormField(from), 0)
                      })
                    }
                  }
                }}
                placeholder="Search… (Enter to select)"
                style={{ ...INPUT, height: 32, paddingLeft: 28, fontSize: 12 }}
              />
            </div>
          </div>
          <div style={{ overflowY: 'auto', flex: 1 }}>
            <button
              type="button"
              tabIndex={-1}
              onClick={() => pick('')}
              style={{
                display: 'block', width: '100%', padding: '8px 12px', border: 'none',
                background: !value ? 'var(--accent-subtle, #eff6ff)' : 'transparent',
                color: 'var(--text-3)', fontSize: 12, fontWeight: 600, cursor: 'pointer', textAlign: 'left',
                borderBottom: '1px solid var(--card-border)',
              }}
            >
              {placeholder}
            </button>
            {tree.length === 0 ? (
              <p style={{ padding: 16, margin: 0, fontSize: 12, color: 'var(--text-3)', textAlign: 'center' }}>
                No options yet — add them in Asset Settings
              </p>
            ) : (
              tree.map(n => renderNode(n, 0))
            )}
          </div>
        </div>
      )}
    </div>
  )
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

function emptyForm(category) {
  const today = new Date().toISOString().slice(0, 10)
  return {
    asset_category: category,
    description: '',
    location_id: '',
    item_type_id: '',
    condition_id: '',
    quantity: 1,
    stock_in_date: today,
    warranty_upto: '',
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
  const modalRef = useRef(null)
  const [form, setForm] = useState(() => editing
    ? {
        asset_category: editing.asset_category || category,
        description: editing.description || '',
        location_id: editing.location_id || '',
        item_type_id: editing.item_type_id || '',
        condition_id: editing.condition_id || '',
        quantity: editing.quantity ?? 1,
        stock_in_date: editing.stock_in_date || new Date().toISOString().slice(0, 10),
        warranty_upto: editing.warranty_upto || '',
        unit_price: editing.unit_price ?? '',
        purchase_value: editing.purchase_value ?? '',
        invoice_no: editing.invoice_no || '',
        invoice_date: editing.invoice_date || '',
        supplier_name: editing.supplier_name || '',
        supplier_address: editing.supplier_address || '',
        supplier_contact: editing.supplier_contact || '',
        notes: userFacingNotes(editing.notes) || '',
        photo_url: editing.photo_url || null,
        photo_path: editing.photo_path || null,
      }
    : emptyForm(category)
  )
  const [photoFile, setPhotoFile] = useState(null)
  const [photoPreview, setPhotoPreview] = useState(editing?.photo_url || null)
  const [removePhoto, setRemovePhoto] = useState(false)
  const [saving, setSaving] = useState(false)
  const [pvManual, setPvManual] = useState(false)
  const fileRef = useRef(null)

  // Keep Tab/Enter inside the modal (don't jump to page filters behind the overlay)
  useEffect(() => {
    function onKeyDown(e) {
      if (e.key !== 'Tab') return
      const root = modalRef.current
      if (!root) return
      const list = getModalFocusables(root).filter(n => n.dataset.treeSearch !== '1')
      if (!list.length) return

      // If focus left the modal, pull it back
      if (!root.contains(document.activeElement)) {
        e.preventDefault()
        list[0].focus()
        return
      }

      const active = document.activeElement
      // Dropdown search handles its own Tab
      if (active?.dataset?.treeSearch === '1') return

      const idx = list.indexOf(active)
      if (idx === -1) return

      e.preventDefault()
      const next = e.shiftKey
        ? list[(idx - 1 + list.length) % list.length]
        : list[(idx + 1) % list.length]
      next.focus()
    }
    document.addEventListener('keydown', onKeyDown, true)
    return () => document.removeEventListener('keydown', onKeyDown, true)
  }, [])

  function set(key, value) { setForm(f => ({ ...f, [key]: value })) }

  function calcPurchaseValue(unitPrice, quantity) {
    if (unitPrice === '' || unitPrice == null) return ''
    const up = Number(unitPrice)
    const qty = Number(quantity)
    if (!Number.isFinite(up) || up < 0) return ''
    if (!Number.isFinite(qty) || qty < 1) return ''
    return String(Math.round(up * qty * 100) / 100)
  }

  // Keep Cost in sync with Unit Price × Quantity unless user overrides
  useEffect(() => {
    if (pvManual) return
    const next = calcPurchaseValue(form.unit_price, form.quantity)
    setForm(f => (String(f.purchase_value ?? '') === next ? f : { ...f, purchase_value: next }))
  }, [form.unit_price, form.quantity, pvManual])

  function setUnitPrice(value) {
    setPvManual(false)
    setForm(f => ({
      ...f,
      unit_price: value,
      purchase_value: calcPurchaseValue(value, f.quantity),
    }))
  }

  function setQuantity(value) {
    setPvManual(false)
    setForm(f => ({
      ...f,
      quantity: value,
      purchase_value: calcPurchaseValue(f.unit_price, value),
    }))
  }

  function setPurchaseValue(value) {
    setPvManual(true)
    setForm(f => ({ ...f, purchase_value: value }))
  }

  function onPhotoPick(e) {
    const f = e.target.files?.[0]
    if (!f) return
    if (!f.type.startsWith('image/')) { toast('Please choose an image file.', 'error'); return }
    if (f.size > PHOTO_MAX_BYTES) { toast('Photo must be under 1 MB.', 'error'); return }
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
    if (!form.stock_in_date) { toast('Stock In date is required.', 'error'); return }
    if (editing?.stock_out_date) {
      try { assertStockDates(form.stock_in_date, editing.stock_out_date) }
      catch (e) { toast(e.message, 'error'); return }
    }
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
      <div
        ref={modalRef}
        data-asset-modal="1"
        style={{
        background: 'var(--card-bg)', borderRadius: 16, width: '100%', maxWidth: 704,
        maxHeight: '92vh', overflow: 'hidden', boxShadow: '0 24px 60px rgba(0,0,0,0.25)',
        display: 'flex', flexDirection: 'column',
      }}>
        <div style={{
          padding: '18px 22px 14px', borderBottom: '1px solid var(--card-border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: 'var(--card-bg)', flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Package size={16} style={{ color: 'var(--accent)' }} />
            <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-1)', margin: 0 }}>
              {editing ? `Edit Asset #${editing.serial_no}` : 'Add Asset'}
            </p>
          </div>
          <button type="button" tabIndex={-1} onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', display: 'flex' }}>
            <X size={16} />
          </button>
        </div>

        <div
          data-asset-form="1"
          style={{
          padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 16,
          overflowY: 'auto', flex: 1, minHeight: 0,
        }}>
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
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={onPhotoPick} tabIndex={-1} />
            <div style={{ flex: 1 }}>
              <FL optional>Photo</FL>
              <p style={{ fontSize: 12, color: 'var(--text-3)', margin: '0 0 8px', lineHeight: 1.45 }}>
                Optional. JPEG / PNG / WebP, max 1 MB.
              </p>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" tabIndex={-1} onClick={() => fileRef.current?.click()}
                  style={{
                    padding: '6px 12px', fontSize: 12, fontWeight: 600, borderRadius: 7, cursor: 'pointer',
                    background: 'var(--card-bg)', border: '1.5px solid var(--card-border)', color: 'var(--text-2)',
                  }}>
                  Choose…
                </button>
                {(photoPreview || form.photo_url) && (
                  <button type="button" tabIndex={-1} onClick={clearPhoto}
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

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 110px', gap: 14, alignItems: 'start' }}>
            <div>
              <FL>Description *</FL>
              <input value={form.description} onChange={e => set('description', e.target.value)}
                onKeyDown={onAdvanceKeyDown} className="asset-focus-field"
                placeholder="e.g. Wooden Pulpit" style={INPUT} autoFocus />
            </div>
            <div>
              <FL>Quantity *</FL>
              <input
                type="number" min="1" step="1" value={form.quantity}
                onChange={e => setQuantity(e.target.value)}
                onKeyDown={onAdvanceKeyDown}
                className="asset-focus-field"
                disabled={!!editing}
                style={{
                  ...INPUT,
                  opacity: editing ? 0.7 : 1,
                  cursor: editing ? 'not-allowed' : undefined,
                  textAlign: 'center',
                  fontWeight: 700,
                }}
              />
              {editing && (
                <p style={{ fontSize: 10, color: 'var(--text-3)', margin: '4px 0 0' }}>
                  Via Stock Movement
                </p>
              )}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div>
              <FL>Item Type</FL>
              <MasterTreeSelect
                rows={itemTypes}
                value={form.item_type_id}
                onChange={id => set('item_type_id', id)}
                placeholder="— Select —"
              />
            </div>
            <div>
              <FL>Location</FL>
              <MasterTreeSelect
                rows={locations}
                value={form.location_id}
                onChange={id => set('location_id', id)}
                placeholder="— Select —"
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div>
              <FL>Condition</FL>
              <select
                value={form.condition_id}
                className="asset-focus-field"
                onChange={e => {
                  set('condition_id', e.target.value)
                  advanceAfterChange(e.target)
                }}
                onKeyDown={onAdvanceKeyDown}
                style={INPUT}
              >
                <option value="">— Select —</option>
                {conditions.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <FL optional>Warranty Upto</FL>
              <DatePartsInput
                value={form.warranty_upto}
                onChange={v => set('warranty_upto', v)}
                onComplete={el => advanceAfterChange(el)}
              />
            </div>
          </div>

          <div>
            <FL>Stock In Date *</FL>
            <DatePartsInput
              value={form.stock_in_date}
              onChange={v => set('stock_in_date', v)}
              onComplete={el => advanceAfterChange(el)}
            />
            <p style={{ fontSize: 10, color: 'var(--text-3)', margin: '4px 0 0' }}>
              When brought into account
            </p>
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
                <FL>Quantity</FL>
                <input type="number" min="1" step="1" value={form.quantity}
                  readOnly disabled data-display-only="1"
                  tabIndex={-1}
                  style={{ ...INPUT, opacity: 0.7, cursor: 'not-allowed', fontWeight: 700 }} />
                <p style={{ fontSize: 10, color: 'var(--text-3)', margin: '4px 0 0' }}>
                  {editing ? 'Use Stock Movement to change quantity' : 'Set quantity next to Description above'}
                </p>
              </div>
              <div>
                <FL optional>Unit Price (₹)</FL>
                <input type="number" min="0" step="0.01" value={form.unit_price}
                  onChange={e => setUnitPrice(e.target.value)}
                  onKeyDown={onAdvanceKeyDown}
                  className="asset-focus-field"
                  placeholder="0.00" style={INPUT} />
              </div>
              <div>
                <FL optional>Cost (₹)</FL>
                <input type="number" min="0" step="0.01" value={form.purchase_value}
                  onChange={e => setPurchaseValue(e.target.value)}
                  onKeyDown={onAdvanceKeyDown}
                  className="asset-focus-field"
                  placeholder="0.00" style={INPUT} />
                {!pvManual && form.unit_price !== '' && form.unit_price != null && (
                  <p style={{ fontSize: 10, color: 'var(--text-3)', margin: '4px 0 0' }}>
                    Auto: Unit Price × Quantity
                  </p>
                )}
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <div>
                <FL optional>Invoice Date</FL>
                <DatePartsInput
                  value={form.invoice_date}
                  onChange={v => set('invoice_date', v)}
                  onComplete={el => advanceAfterChange(el)}
                />
              </div>
              <div>
                <FL optional>Invoice No.</FL>
                <input value={form.invoice_no} onChange={e => set('invoice_no', e.target.value)}
                  onKeyDown={onAdvanceKeyDown}
                  className="asset-focus-field"
                  placeholder="Invoice reference" style={INPUT} />
              </div>
            </div>
            <div>
              <FL optional>Supplier Name</FL>
              <input value={form.supplier_name} onChange={e => set('supplier_name', e.target.value)}
                onKeyDown={onAdvanceKeyDown}
                className="asset-focus-field"
                placeholder="Vendor name" style={INPUT} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <div>
                <FL optional>Supplier Address</FL>
                <input value={form.supplier_address} onChange={e => set('supplier_address', e.target.value)}
                  onKeyDown={onAdvanceKeyDown}
                  className="asset-focus-field"
                  placeholder="Address" style={INPUT} />
              </div>
              <div>
                <FL optional>Contact No.</FL>
                <input value={form.supplier_contact} onChange={e => set('supplier_contact', e.target.value)}
                  onKeyDown={onAdvanceKeyDown}
                  className="asset-focus-field"
                  placeholder="Phone" style={INPUT} />
              </div>
            </div>
          </div>

          <div>
            <FL optional>Notes</FL>
            <textarea value={form.notes} onChange={e => set('notes', e.target.value)}
              className="asset-focus-field"
              rows={2} placeholder="Any additional remarks"
              style={{ ...INPUT, height: 'auto', padding: '10px 12px', resize: 'vertical' }} />
          </div>
        </div>

        <div style={{
          padding: '14px 22px', borderTop: '1px solid var(--card-border)',
          display: 'flex', justifyContent: 'flex-end', gap: 10,
          background: 'var(--card-bg)', flexShrink: 0,
        }}>
          <button type="button" tabIndex={-1} onClick={onClose}
            style={{
              padding: '8px 18px', background: 'var(--card-bg)', border: '1.5px solid var(--card-border)',
              borderRadius: 8, cursor: 'pointer', fontSize: 13, color: 'var(--text-2)',
            }}>
            Cancel
          </button>
          <button type="button" onClick={handleSave} disabled={saving || !form.description.trim() || !form.stock_in_date}
            className="asset-focus-field asset-save-btn"
            style={{
              display: 'flex', alignItems: 'center', gap: 7, padding: '8px 18px',
              background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8,
              fontSize: 13, fontWeight: 600, cursor: saving ? 'wait' : 'pointer',
              opacity: saving || !form.description.trim() || !form.stock_in_date ? 0.65 : 1,
            }}>
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            {editing ? 'Update' : 'Save Asset'}
          </button>
        </div>
      </div>
    </div>
  )
}

/* ── Stock Movement modal (In + Out + Return) ──────────────────── */

function StockMovementModal({ asset, conditions, onDone, onClose }) {
  const toast = useToast()
  const available = Number(asset.quantity)
  const availableSafe = Number.isFinite(available) && available >= 1 ? Math.floor(available) : 0
  const canMoveOut = !asset.stock_out_date && availableSafe >= 1
  const canReturn = !!asset.stock_out_date
  const workingId = findConditionId(conditions, ['Working', 'Good']) || ''
  const stockInDate = asset.stock_in_date ? String(asset.stock_in_date).slice(0, 10) : ''

  const [direction, setDirection] = useState(canMoveOut ? 'out' : (canReturn ? 'return' : 'in'))
  const [qty, setQty] = useState(canMoveOut ? '1' : '1')
  const [moveDate, setMoveDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [conditionId, setConditionId] = useState(
    canMoveOut ? (asset.condition_id || '') : (workingId || asset.condition_id || '')
  )
  const [unitPrice, setUnitPrice] = useState(
    asset.unit_price != null ? String(asset.unit_price) : ''
  )
  const [cost, setCost] = useState('')
  const [costManual, setCostManual] = useState(false)
  const [invoiceNo, setInvoiceNo] = useState('')
  const [invoiceDate, setInvoiceDate] = useState('')
  const [supplierName, setSupplierName] = useState(asset.supplier_name || '')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  const moveQty = Math.max(0, parseInt(qty, 10) || 0)

  useEffect(() => {
    if (direction === 'in' && !costManual) {
      const up = Number(unitPrice)
      if (unitPrice !== '' && Number.isFinite(up) && moveQty >= 1) {
        setCost(String(Math.round(up * moveQty * 100) / 100))
      }
    }
  }, [direction, unitPrice, moveQty, costManual])

  useEffect(() => {
    if (direction === 'out') {
      setConditionId(asset.condition_id || '')
      setQty(String(Math.min(1, availableSafe || 1)))
      // Out date cannot be before stock-in
      if (stockInDate && moveDate < stockInDate) setMoveDate(stockInDate)
    } else if (direction === 'in') {
      setConditionId(workingId || asset.condition_id || '')
      setQty('1')
      setCostManual(false)
    }
  }, [direction]) // eslint-disable-line react-hooks/exhaustive-deps

  const dateError = (() => {
    if (direction !== 'out') return null
    if (!moveDate) return 'Stock Out date is required.'
    if (stockInDate && moveDate < stockInDate) {
      return `Stock Out date cannot be before Stock In date (${stockInDate.split('-').reverse().join('-')}).`
    }
    return null
  })()

  const canSaveOut = direction === 'out' && moveQty >= 1 && moveQty <= availableSafe && !!moveDate && !dateError
  const canSaveIn = direction === 'in' && moveQty >= 1 && !!moveDate
  const canSaveReturn = direction === 'return'
  const canSave = direction === 'out' ? canSaveOut : direction === 'return' ? canSaveReturn : canSaveIn

  async function handleMove() {
    if (!canSave) return
    setSaving(true)
    try {
      if (direction === 'out') {
        assertStockDates(stockInDate, moveDate)
      }
      const result = await onDone({
        direction,
        quantity: moveQty,
        move_date: moveDate,
        condition_id: conditionId || null,
        unit_price: unitPrice,
        purchase_value: cost,
        invoice_no: invoiceNo,
        invoice_date: invoiceDate,
        supplier_name: supplierName,
        notes: notes.trim() || null,
      })
      if (direction === 'return') {
        toast(result?.mode === 'merged'
          ? 'Returned to stock — quantity merged back into the source line.'
          : 'Returned to stock.', 'success')
      } else if (direction === 'in') {
        toast(`Stock in ${moveQty} recorded as new line #${result?.moved?.serial_no || ''}.`.trim(), 'success')
      } else if (result?.mode === 'full') {
        toast(`Moved all ${moveQty} out of stock.`, 'success')
      } else {
        toast(`Moved ${moveQty} out — ${availableSafe - moveQty} remain in stock.`, 'success')
      }
      onClose()
    } catch (e) {
      toast(e.message || 'Stock movement failed', 'error')
    }
    setSaving(false)
  }

  const tabCount = (canMoveOut ? 1 : 0) + 1 + (canReturn ? 1 : 0)

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 2100, background: 'rgba(0,0,0,0.55)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
    }}>
      <div style={{
        background: 'var(--card-bg)', borderRadius: 16, width: '100%', maxWidth: 500,
        maxHeight: '92vh', overflow: 'hidden', boxShadow: '0 24px 60px rgba(0,0,0,0.25)',
        display: 'flex', flexDirection: 'column',
      }}>
        <div style={{
          padding: '18px 22px 14px', borderBottom: '1px solid var(--card-border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <ArrowRightLeft size={16} style={{ color: 'var(--accent)' }} />
            <div>
              <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-1)', margin: 0 }}>Stock Movement</p>
              <p style={{ fontSize: 12, color: 'var(--text-3)', margin: 0 }}>
                #{asset.serial_no} · {asset.description}
                {stockInDate ? ` · In ${stockInDate.split('-').reverse().join('-')}` : ''}
              </p>
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', display: 'flex' }}>
            <X size={16} />
          </button>
        </div>

        <div style={{ padding: '16px 22px', overflowY: 'auto', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{
            display: 'grid', gridTemplateColumns: `repeat(${tabCount}, 1fr)`, gap: 8,
            padding: 4, borderRadius: 10, background: 'var(--table-header-bg)',
          }}>
            {canMoveOut && (
              <button type="button" onClick={() => setDirection('out')}
                style={{
                  padding: '9px 12px', border: 'none', borderRadius: 8, cursor: 'pointer',
                  fontSize: 13, fontWeight: 700,
                  background: direction === 'out' ? 'var(--card-bg)' : 'transparent',
                  color: direction === 'out' ? '#b91c1c' : 'var(--text-3)',
                  boxShadow: direction === 'out' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                }}>
                Move Out
              </button>
            )}
            <button type="button" onClick={() => setDirection('in')}
              style={{
                padding: '9px 12px', border: 'none', borderRadius: 8, cursor: 'pointer',
                fontSize: 13, fontWeight: 700,
                background: direction === 'in' ? 'var(--card-bg)' : 'transparent',
                color: direction === 'in' ? '#15803d' : 'var(--text-3)',
                boxShadow: direction === 'in' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
              }}>
              Move In
            </button>
            {canReturn && (
              <button type="button" onClick={() => setDirection('return')}
                style={{
                  padding: '9px 12px', border: 'none', borderRadius: 8, cursor: 'pointer',
                  fontSize: 13, fontWeight: 700,
                  background: direction === 'return' ? 'var(--card-bg)' : 'transparent',
                  color: direction === 'return' ? '#1d4ed8' : 'var(--text-3)',
                  boxShadow: direction === 'return' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                }}>
                Return to Stock
              </button>
            )}
          </div>

          <div style={{
            padding: '10px 12px', borderRadius: 8, background: 'var(--table-header-bg)',
            fontSize: 12, color: 'var(--text-2)',
          }}>
            {direction === 'out' && (
              <>Currently in stock on this line: <strong style={{ color: 'var(--text-1)' }}>{availableSafe}</strong>
                {stockInDate ? <> · Stock In {stockInDate.split('-').reverse().join('-')}</> : null}</>
            )}
            {direction === 'in' && (
              <>Adds a <strong>new</strong> in-stock line (same item details) so historical counts stay correct.</>
            )}
            {direction === 'return' && (
              <>Clears Stock Out and puts this quantity back in stock
                {asset.source_asset_id ? ' (merges into the original line when possible)' : ''}.</>
            )}
          </div>

          {direction !== 'return' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <FL>{direction === 'out' ? 'Qty to move out *' : 'Qty to bring in *'}</FL>
                <input
                  type="number" min="1" max={direction === 'out' ? availableSafe : undefined} step="1" value={qty}
                  onChange={e => setQty(e.target.value)}
                  style={INPUT} autoFocus
                />
              </div>
              <div>
                <FL>{direction === 'out' ? 'Stock Out Date *' : 'Stock In Date *'}</FL>
                <input
                  type="date"
                  value={moveDate}
                  min={direction === 'out' && stockInDate ? stockInDate : undefined}
                  onChange={e => setMoveDate(e.target.value)}
                  style={INPUT}
                />
                {dateError && (
                  <p style={{ fontSize: 11, color: '#b91c1c', margin: '4px 0 0', fontWeight: 600 }}>{dateError}</p>
                )}
              </div>
            </div>
          )}

          {direction !== 'return' && (
            <div>
              <FL optional>Condition</FL>
              <select value={conditionId} onChange={e => setConditionId(e.target.value)} style={INPUT}>
                <option value="">— Select —</option>
                {conditions.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              {direction === 'out' && (
                <p style={{ fontSize: 10, color: 'var(--text-3)', margin: '4px 0 0' }}>
                  Choose Damaged / Disposed / etc. only when it applies
                </p>
              )}
            </div>
          )}

          {direction === 'in' && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <FL optional>Unit Price (₹)</FL>
                  <input type="number" min="0" step="0.01" value={unitPrice}
                    onChange={e => { setUnitPrice(e.target.value); setCostManual(false) }}
                    placeholder="0.00" style={INPUT} />
                </div>
                <div>
                  <FL optional>Cost (₹)</FL>
                  <input type="number" min="0" step="0.01" value={cost}
                    onChange={e => { setCost(e.target.value); setCostManual(true) }}
                    placeholder="0.00" style={INPUT} />
                  {!costManual && unitPrice !== '' && (
                    <p style={{ fontSize: 10, color: 'var(--text-3)', margin: '4px 0 0' }}>Auto: Unit Price × Qty</p>
                  )}
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <FL optional>Invoice No.</FL>
                  <input value={invoiceNo} onChange={e => setInvoiceNo(e.target.value)} style={INPUT} />
                </div>
                <div>
                  <FL optional>Invoice Date</FL>
                  <input type="date" value={invoiceDate} onChange={e => setInvoiceDate(e.target.value)} style={INPUT} />
                </div>
              </div>
              <div>
                <FL optional>Supplier</FL>
                <input value={supplierName} onChange={e => setSupplierName(e.target.value)} style={INPUT} />
              </div>
            </>
          )}

          {direction !== 'return' && (
            <div>
              <FL optional>Notes</FL>
              <input
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder={direction === 'out' ? 'e.g. Given to school / Damaged' : 'e.g. New purchase batch'}
                style={INPUT}
              />
            </div>
          )}

          {canSave && (
            <div style={{
              fontSize: 12, color: 'var(--text-2)', padding: '10px 12px', borderRadius: 8,
              background: direction === 'in' || direction === 'return' ? '#f0fdf4' : 'var(--accent-subtle, #eff6ff)',
              border: '1px solid var(--card-border)', lineHeight: 1.45,
            }}>
              {direction === 'return' && (
                <>This line will return to <strong>In stock</strong> (Stock Out cleared).</>
              )}
              {direction === 'in' && (
                <>Will create a new line for <strong>{moveQty}</strong> with Stock In on {moveDate}. Existing #{asset.serial_no} stays unchanged.</>
              )}
              {direction === 'out' && moveQty === availableSafe && (
                <>All <strong>{availableSafe}</strong> will be marked Stock Out on {moveDate}.</>
              )}
              {direction === 'out' && moveQty !== availableSafe && (
                <>Create out line for <strong>{moveQty}</strong>; keep <strong>{availableSafe - moveQty}</strong> in stock on the original line.</>
              )}
            </div>
          )}
        </div>

        <div style={{
          padding: '14px 22px', borderTop: '1px solid var(--card-border)',
          display: 'flex', justifyContent: 'flex-end', gap: 10, flexShrink: 0,
        }}>
          <button onClick={onClose}
            style={{
              padding: '8px 18px', background: 'var(--card-bg)', border: '1.5px solid var(--card-border)',
              borderRadius: 8, cursor: 'pointer', fontSize: 13, color: 'var(--text-2)',
            }}>
            Cancel
          </button>
          <button onClick={handleMove} disabled={saving || !canSave}
            style={{
              display: 'flex', alignItems: 'center', gap: 7, padding: '8px 18px',
              background: direction === 'in' || direction === 'return' ? '#16a34a' : 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8,
              fontSize: 13, fontWeight: 600, cursor: saving ? 'wait' : 'pointer',
              opacity: saving || !canSave ? 0.65 : 1,
            }}>
            {saving ? <Loader2 size={14} className="animate-spin" /> : <ArrowRightLeft size={14} />}
            {direction === 'in' ? 'Move In' : direction === 'return' ? 'Return to Stock' : 'Move Out'}
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
      <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-1)', margin: '0 0 6px' }}>{label || 'Assets'}</p>
      <p style={{ fontSize: 13, color: 'var(--text-3)', margin: 0, maxWidth: 360, marginInline: 'auto', lineHeight: 1.5 }}>
        This asset section is not available for your account.
      </p>
    </div>
  )
}

/* ── Main page ─────────────────────────────────────────────────── */

export default function AssetsPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const toast = useToast()
  const { profile, pageGrants } = useAuth()
  const role = profile?.role

  const allowedCategories = useMemo(
    () => ASSET_CATEGORIES.filter(t => canAccessAssetTab(t.id, role, pageGrants)),
    [role, pageGrants]
  )

  const [tab, setTab] = useState(() => allowedCategories[0]?.id || 'movable')

  useEffect(() => {
    if (!allowedCategories.length) return
    const q = searchParams.get('tab')
    if (q && allowedCategories.some(t => t.id === q)) {
      setTab(q)
      return
    }
    setTab(prev => (allowedCategories.some(t => t.id === prev) ? prev : allowedCategories[0].id))
  }, [allowedCategories, searchParams])
  const [assets, setAssets] = useState([])
  const [locations, setLocations] = useState([])
  const [itemTypes, setItemTypes] = useState([])
  const [conditions, setConditions] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(null) // null | {} | asset
  const [moveAsset, setMoveAsset] = useState(null)
  const [search, setSearch] = useState('')
  const [filterType, setFilterType] = useState('')
  const [filterLoc, setFilterLoc] = useState('')
  const [filterCond, setFilterCond] = useState('')
  const [asOnDate, setAsOnDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [deleting, setDeleting] = useState(null)
  const [exporting, setExporting] = useState(false)
  const [expandedGroups, setExpandedGroups] = useState(() => new Set())

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

  // "+" opens Add Asset (movable tab only; ignore while typing / modal open)
  useEffect(() => {
    function onKey(e) {
      if (!isPlusHotkey(e)) return
      if (tab !== 'movable') return
      if (modal || moveAsset) return
      if (isTypingTarget(e.target) || isTypingTarget()) return
      e.preventDefault()
      setModal({})
    }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [tab, modal, moveAsset])

  function assetGroupKey(a) {
    return [
      (a.description || '').trim().toLowerCase(),
      a.item_type_id || '',
      a.location_id || '',
    ].join('||')
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return assets.filter(a => {
      if (filterType && a.item_type_id !== filterType) return false
      if (filterLoc && a.location_id !== filterLoc) return false
      if (filterCond && a.condition_id !== filterCond) return false

      if (asOnDate) {
        // Not acquired yet as of that date
        if (a.stock_in_date && a.stock_in_date > asOnDate) return false
        // All Conditions (and every condition filter) shows every status,
        // including moved-out / damaged / disposed lines.
      }

      if (!q) return true
      const hay = [
        a.description, a.serial_no, a.location?.name, a.item_type?.name,
        a.condition?.name, a.supplier_name, a.invoice_no, a.notes,
      ].filter(Boolean).join(' ').toLowerCase()
      return hay.includes(q)
    })
  }, [assets, search, filterType, filterLoc, filterCond, asOnDate])

  const groups = useMemo(() => {
    const map = new Map()
    for (const a of filtered) {
      const key = assetGroupKey(a)
      if (!map.has(key)) map.set(key, [])
      map.get(key).push(a)
    }
    return [...map.entries()].map(([key, lines]) => {
      const sorted = [...lines].sort((a, b) =>
        String(a.stock_in_date || '').localeCompare(String(b.stock_in_date || ''))
        || (a.serial_no || 0) - (b.serial_no || 0)
      )
      const onHandLines = sorted.filter(l => isAssetOnHand(l, asOnDate || null))
      const qtyOnHand = onHandLines.reduce((s, l) => s + (Number(l.quantity) || 1), 0)
      const costOnHand = onHandLines.reduce((s, l) => {
        const c = l.purchase_value != null ? Number(l.purchase_value) : null
        return s + (c != null && Number.isFinite(c) ? c : 0)
      }, 0)
      // Qty/cost: display on-hand as primary; keep total of all lines for reference
      const qtyDisplay = onHandLines.reduce((s, l) => s + (Number(l.quantity) || 1), 0)
      const qtyAllLines = sorted.reduce((s, l) => s + (Number(l.quantity) || 1), 0)
      const costDisplay = onHandLines.reduce((s, l) => {
        const c = l.purchase_value != null ? Number(l.purchase_value) : null
        return s + (c != null && Number.isFinite(c) ? c : 0)
      }, 0)
      const hasCost = onHandLines.some(l => l.purchase_value != null || l.unit_price != null)
        || sorted.some(l => l.purchase_value != null || l.unit_price != null)
      const primary = onHandLines[0] || sorted[0]
      const allOut = onHandLines.length === 0
      return {
        key,
        lines: sorted,
        primary,
        qtyOnHand,
        qtyDisplay,
        qtyAllLines,
        costOnHand,
        costDisplay,
        hasCost,
        lineCount: sorted.length,
        allOut,
      }
    }).sort((a, b) => a.primary.description.localeCompare(b.primary.description))
  }, [filtered, asOnDate])

  const qtyOnHand = useMemo(
    () => groups.reduce((s, g) => s + g.qtyOnHand, 0),
    [groups]
  )

  const qtyAllTotal = useMemo(
    () => groups.reduce((s, g) => s + (g.qtyAllLines ?? g.qtyDisplay), 0),
    [groups]
  )

  const qtyDisplayTotal = qtyOnHand

  function toggleGroup(key) {
    setExpandedGroups(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const hasFilters = !!(search || filterType || filterLoc || filterCond)

  function clearFilters() {
    setSearch('')
    setFilterType('')
    setFilterLoc('')
    setFilterCond('')
  }

  async function handleSave(payload, id) {
    await saveAsset({
      ...payload,
      created_by: profile?.full_name || profile?.email || null,
      updated_by: profile?.full_name || profile?.email || null,
    }, id)
    toast(id ? 'Asset updated.' : 'Asset added.', 'success')
    await loadAssets()
  }

  async function handleStockMove(payload) {
    const performed_by = profile?.full_name || profile?.email || null
    let result
    if (payload.direction === 'return') {
      result = await returnStockToHand(moveAsset, { performed_by })
    } else if (payload.direction === 'in') {
      result = await moveStockIn(moveAsset, {
        quantity: payload.quantity,
        stock_in_date: payload.move_date,
        unit_price: payload.unit_price,
        purchase_value: payload.purchase_value,
        condition_id: payload.condition_id,
        invoice_no: payload.invoice_no,
        invoice_date: payload.invoice_date,
        supplier_name: payload.supplier_name,
        notes: payload.notes,
        performed_by,
      })
    } else {
      result = await moveStockOut(moveAsset, {
        quantity: payload.quantity,
        stock_out_date: payload.move_date,
        condition_id: payload.condition_id,
        notes: payload.notes,
        performed_by,
      })
    }
    await loadAssets()
    return result
  }

  async function handleDelete(asset) {
    const msg = asset.stock_out_date
      ? `Remove “${asset.description}” from the register?\n\nIt goes to Recycle Bin (with photo). Prefer Return to Stock if this was a mistake.`
      : `Remove “${asset.description}” from the register?\n\nIt goes to Recycle Bin (with photo). For disposals/transfers use Stock Movement → Move Out.`
    if (!confirm(msg)) return
    setDeleting(asset.id)
    try {
      await hardDeleteAsset(asset.id)
      toast('Asset moved to Recycle Bin.', 'success')
      setAssets(list => list.filter(a => a.id !== asset.id))
    } catch (e) {
      toast(e.message, 'error')
    }
    setDeleting(null)
  }

  function fmtDate(d) {
    if (!d) return '—'
    // Indian format DD-MM-YYYY
    const [y, m, day] = String(d).slice(0, 10).split('-')
    if (!y || !m || !day) return d
    return `${day}-${m}-${y}`
  }

  function fmtMoney(v) {
    if (v == null || v === '') return '—'
    return `₹${Number(v).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`
  }

  function assetExportColumns() {
    return [
      // Description merges adjacent identical values (grouped stock lines)
      { header: 'Description', key: 'description', align: 'left' },
      { header: 'On Hand', key: 'total_qty', align: 'center', merge: true },
      { header: 'Sub Qty', key: 'sub_qty', align: 'center' },
      { header: 'Type', key: 'type', align: 'left', merge: false },
      { header: 'Location', key: 'location', align: 'left', merge: false },
      { header: 'Stock Status', key: 'stock', align: 'center' },
      { header: 'Stock In', key: 'stock_in', align: 'center' },
      { header: 'Stock Out', key: 'stock_out', align: 'center' },
      { header: 'Condition', key: 'condition', align: 'center' },
      { header: 'Unit Price', key: 'unit_price', align: 'right' },
      { header: 'Cost', key: 'cost', align: 'right' },
      { header: 'Supplier', key: 'supplier', align: 'left', merge: false },
      { header: 'Invoice No', key: 'invoice', align: 'left', merge: false },
      { header: 'Notes', key: 'notes', align: 'left', merge: false },
    ]
  }

  /**
   * Line-level rows with description grouping (merged in Excel).
   * Total Qty = group total (also merged); Sub Qty = line quantity.
   */
  function buildLineExportRows(sourceGroups) {
    // Invisible suffix so same description at different locations doesn't cross-merge
    function mergeSuffix(key) {
      let h = 0
      const s = String(key || '')
      for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0
      return '\u200B'.repeat((Math.abs(h) % 40) + 1)
    }

    const rows = []
    for (const g of sourceGroups) {
      const totalQty = g.qtyDisplay
      const desc = `${g.primary?.description || g.lines[0]?.description || ''}${mergeSuffix(g.key)}`
      for (const line of g.lines) {
        const subQty = Number(line.quantity) || 1
        const cost = line.purchase_value != null && Number.isFinite(Number(line.purchase_value))
          ? Number(line.purchase_value) : null
        rows.push({
          description: desc,
          total_qty: totalQty,
          sub_qty: subQty,
          type: line.item_type ? masterDisplayName(line.item_type, itemTypes) : '',
          location: line.location ? masterDisplayName(line.location, locations) : '',
          stock: line.stock_out_date ? 'Moved out' : 'In stock',
          stock_in: line.stock_in_date ? fmtDate(line.stock_in_date) : '',
          stock_out: line.stock_out_date ? fmtDate(line.stock_out_date) : '',
          condition: line.condition?.name || '',
          unit_price: line.unit_price != null ? Number(line.unit_price) : '',
          cost: cost != null ? cost : '',
          supplier: line.supplier_name || '',
          invoice: line.invoice_no || '',
          notes: userFacingNotes(line.notes),
        })
      }
    }
    return rows
  }

  function groupAssetsForExport(list) {
    const map = new Map()
    for (const a of list) {
      const key = [
        (a.description || '').trim().toLowerCase(),
        a.item_type_id || '',
        a.location_id || '',
      ].join('||')
      if (!map.has(key)) map.set(key, [])
      map.get(key).push(a)
    }
    return [...map.entries()].map(([key, lines]) => {
      const sorted = [...lines].sort((a, b) =>
        String(a.stock_in_date || '').localeCompare(String(b.stock_in_date || ''))
      )
      const onHandLines = sorted.filter(l => isAssetOnHand(l, asOnDate || null))
      const qtyDisplay = onHandLines.reduce((s, l) => s + (Number(l.quantity) || 1), 0)
      const primary = onHandLines[0] || sorted[0]
      return {
        key,
        lines: sorted,
        primary,
        qtyDisplay,
        allOut: onHandLines.length === 0,
      }
    }).sort((a, b) => (a.primary?.description || '').localeCompare(b.primary?.description || ''))
  }

  /** Export list: all conditions + moved-out (full status picture). */
  function assetsForAllStatusesSheet() {
    const q = search.trim().toLowerCase()
    return assets.filter(a => {
      if (filterType && a.item_type_id !== filterType) return false
      if (filterLoc && a.location_id !== filterLoc) return false
      if (asOnDate) {
        if (a.stock_in_date && a.stock_in_date > asOnDate) return false
      }
      if (!q) return true
      const hay = [
        a.description, a.serial_no, a.location?.name, a.item_type?.name,
        a.condition?.name, a.supplier_name, a.invoice_no, a.notes,
      ].filter(Boolean).join(' ').toLowerCase()
      return hay.includes(q)
    })
  }

  /** Assets for a condition sheet — includes moved-out lines (unlike on-hand UI view). */
  function assetsForConditionSheet(conditionId) {
    const q = search.trim().toLowerCase()
    return assets.filter(a => {
      if (conditionId === '__none__') {
        if (a.condition_id) return false
      } else if (a.condition_id !== conditionId) {
        return false
      }
      if (filterType && a.item_type_id !== filterType) return false
      if (filterLoc && a.location_id !== filterLoc) return false
      if (asOnDate) {
        if (a.stock_in_date && a.stock_in_date > asOnDate) return false
      }
      if (!q) return true
      const hay = [
        a.description, a.serial_no, a.location?.name, a.item_type?.name,
        a.condition?.name, a.supplier_name, a.invoice_no, a.notes,
      ].filter(Boolean).join(' ').toLowerCase()
      return hay.includes(q)
    })
  }

  function normConditionName(name) {
    return String(name || '').toLowerCase().replace(/\s+/g, ' ').trim()
  }

  /** Combined export groups: Working+Good, Not Working+Damaged. */
  function conditionExportBundles() {
    const OK = new Set(['working', 'good'])
    const BAD = new Set(['not working', 'damaged'])

    const okConds = conditions.filter(c => OK.has(normConditionName(c.name)))
    const badConds = conditions.filter(c => BAD.has(normConditionName(c.name)))
    const usedIds = new Set([...okConds, ...badConds].map(c => c.id))
    const otherConds = conditions.filter(c => !usedIds.has(c.id))

    return {
      ok: {
        sheetName: 'Working & Good',
        label: okConds.length
          ? `Condition: ${okConds.map(c => c.name).join(' + ')}`
          : 'Condition: Working & Good',
        ids: new Set(okConds.map(c => c.id)),
        color: okConds.find(c => c.color)?.color || '#16a34a',
      },
      bad: {
        sheetName: 'Not Working & Damaged',
        label: badConds.length
          ? `Condition: ${badConds.map(c => c.name).join(' + ')}`
          : 'Condition: Not Working & Damaged',
        ids: new Set(badConds.map(c => c.id)),
        color: badConds.find(c => /damaged|not/i.test(c.name))?.color || badConds[0]?.color || '#dc2626',
      },
      other: otherConds,
    }
  }

  function assetsForConditionIds(idSet) {
    if (!idSet || idSet.size === 0) return []
    const q = search.trim().toLowerCase()
    return assets.filter(a => {
      if (!idSet.has(a.condition_id)) return false
      if (filterType && a.item_type_id !== filterType) return false
      if (filterLoc && a.location_id !== filterLoc) return false
      if (asOnDate) {
        if (a.stock_in_date && a.stock_in_date > asOnDate) return false
      }
      if (!q) return true
      const hay = [
        a.description, a.serial_no, a.location?.name, a.item_type?.name,
        a.condition?.name, a.supplier_name, a.invoice_no, a.notes,
      ].filter(Boolean).join(' ').toLowerCase()
      return hay.includes(q)
    })
  }

  function makeSheet(name, sourceGroups, titleExtra, tabColor) {
    return {
      name: String(name || 'Sheet').slice(0, 31),
      columns: assetExportColumns(),
      rows: buildLineExportRows(sourceGroups),
      tabColor: tabColor ? String(tabColor).replace('#', '') : undefined,
      titleLines: titleExtra,
    }
  }

  async function handleExport() {
    const allLines = assetsForAllStatusesSheet()
    if (!filterCond && allLines.length === 0) {
      toast('Nothing to export.', 'error')
      return
    }
    if (filterCond && groups.length === 0 && assetsForConditionSheet(filterCond).length === 0) {
      toast('Nothing to export.', 'error')
      return
    }
    setExporting(true)
    try {
      const church = await getChurch().catch(() => null)
      const stamp = fmtDate(new Date().toISOString().slice(0, 10))

      const baseTitle = [
        church?.church_name ? { text: church.church_name, bold: true, size: 13, bg: 'DBEAFE' } : null,
        (church?.address || church?.city)
          ? { text: [church.address, church.city].filter(Boolean).join(', '), size: 10 }
          : null,
        { text: 'ASSET MANAGEMENT — MOVABLE ASSETS', bold: true, size: 12, bg: '1E3A5F', color: 'FFFFFF' },
      ].filter(Boolean)

      const filterBits = [
        asOnDate ? `As on ${fmtDate(asOnDate)}` : null,
        filterType ? `Type: ${masterDisplayName(itemTypes.find(t => t.id === filterType) || { name: '' }, itemTypes)}` : null,
        filterLoc ? `Location: ${masterDisplayName(locations.find(l => l.id === filterLoc) || { name: '' }, locations)}` : null,
        search.trim() ? `Search: “${search.trim()}”` : null,
      ].filter(Boolean)

      function titleFor(condLabel) {
        return [
          ...baseTitle,
          {
            text: [...filterBits, condLabel].filter(Boolean).join('  ·  ') || condLabel,
            size: 10,
          },
        ]
      }

      if (!filterCond) {
        const sheets = []
        const bundles = conditionExportBundles()

        // 1) All Conditions — every status (in stock + moved out, all conditions)
        sheets.push(makeSheet(
          'All Conditions',
          groupAssetsForExport(allLines),
          titleFor('Condition: All Conditions (all statuses)'),
          '1E3A5F',
        ))

        // 2) Working + Good combined
        const okLines = assetsForConditionIds(bundles.ok.ids)
        sheets.push(makeSheet(
          bundles.ok.sheetName,
          groupAssetsForExport(okLines),
          titleFor(bundles.ok.label),
          bundles.ok.color,
        ))

        // 3) Not Working + Damaged combined
        const badLines = assetsForConditionIds(bundles.bad.ids)
        sheets.push(makeSheet(
          bundles.bad.sheetName,
          groupAssetsForExport(badLines),
          titleFor(bundles.bad.label),
          bundles.bad.color,
        ))

        // Any other custom conditions (not in the two bundles)
        for (const c of bundles.other) {
          const lines = assetsForConditionSheet(c.id)
          sheets.push(makeSheet(
            c.name,
            groupAssetsForExport(lines),
            titleFor(`Condition: ${c.name}`),
            c.color,
          ))
        }

        const none = assetsForConditionSheet('__none__')
        if (none.length > 0) {
          sheets.push(makeSheet(
            'Unspecified',
            groupAssetsForExport(none),
            titleFor('Condition: Unspecified'),
            null,
          ))
        }

        await exportMultiSheetWithTitle(sheets, `Assets_${stamp}.xlsx`)
      } else {
        const condName = conditions.find(c => c.id === filterCond)?.name || 'Condition'
        const exportGroups = groups.length > 0
          ? groups
          : groupAssetsForExport(assetsForConditionSheet(filterCond))
        if (exportGroups.length === 0) {
          toast('Nothing to export.', 'error')
          setExporting(false)
          return
        }
        await exportToExcelWithTitle(
          assetExportColumns(),
          buildLineExportRows(exportGroups),
          condName.slice(0, 31),
          `Assets_${stamp}.xlsx`,
          titleFor(`Condition: ${condName}`),
        )
      }
      toast('Excel exported.', 'success')
    } catch (e) {
      toast(e.message || 'Export failed.', 'error')
    }
    setExporting(false)
  }

  return (
    <div className="page-container">
      {/* Header */}
      <PageHeader
        icon={Package}
        title="Asset Management"
        subtitle="Track church inventory — one entry per item"
        style={{ alignItems: 'flex-start' }}
      >
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
            <>
              <button
                onClick={handleExport}
                disabled={exporting || loading || groups.length === 0}
                title="Export to Excel"
                style={{
                  display: 'flex', alignItems: 'center', gap: 7, padding: '8px 14px',
                  background: '#16a34a', color: '#fff', border: 'none', borderRadius: 8,
                  fontSize: 13, fontWeight: 600, cursor: exporting || groups.length === 0 ? 'not-allowed' : 'pointer',
                  opacity: exporting || groups.length === 0 ? 0.6 : 1,
                }}
              >
                {exporting
                  ? <Loader2 size={14} className="animate-spin" />
                  : <FileSpreadsheet size={14} />}
                Export
              </button>
              <button
                onClick={() => setModal({})}
                style={{
                  display: 'flex', alignItems: 'center', gap: 7, padding: '8px 18px',
                  background: 'var(--sidebar-bg, #1e293b)', color: '#fff', border: 'none', borderRadius: 8,
                  fontSize: 13, fontWeight: 600, cursor: 'pointer',
                }}
              >
                <Plus size={14} /> Add Asset
              </button>
            </>
          )}
          {tab === 'building' && (
            <button
              onClick={() => navigate('/assets/settings?tab=fixed-assets')}
              title="Manage Fixed Asset tiles"
              style={{
                display: 'flex', alignItems: 'center', gap: 7, padding: '8px 14px',
                background: 'var(--card-bg)', border: '1.5px solid var(--card-border)', borderRadius: 8,
                fontSize: 13, fontWeight: 600, cursor: 'pointer', color: 'var(--text-2)',
              }}
            >
              <Settings size={14} /> Manage tiles
            </button>
          )}
        </div>
      </PageHeader>

      {/* Tabs */}
      <div style={{
        display: 'flex', gap: 4, borderBottom: '2px solid var(--border, #e2e8f0)', marginBottom: 20,
      }}>
        {allowedCategories.map(t => (
          <button
            key={t.id}
            onClick={() => {
              setTab(t.id)
              const next = new URLSearchParams(searchParams)
              if (t.id === allowedCategories[0]?.id) next.delete('tab')
              else next.set('tab', t.id)
              setSearchParams(next, { replace: true })
            }}
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

      {!allowedCategories.length ? (
        <div className="card" style={{ padding: '48px 24px', textAlign: 'center', color: 'var(--text-3)', fontSize: 14 }}>
          You do not have access to any Asset Management tabs.
        </div>
      ) : tab === 'movable' ? (
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
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <Filter size={12} style={{ color: 'var(--text-3)' }} />
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-2)', fontWeight: 600 }}>
                  As on
                  <input
                    type="date"
                    value={asOnDate}
                    onChange={e => setAsOnDate(e.target.value)}
                    style={{ ...INPUT, width: 'auto', minWidth: 140 }}
                  />
                </label>
                <div style={{ minWidth: 170 }}>
                  <MasterTreeSelect
                    rows={itemTypes}
                    value={filterType}
                    onChange={setFilterType}
                    placeholder="All types"
                  />
                </div>
                <div style={{ minWidth: 170 }}>
                  <MasterTreeSelect
                    rows={locations}
                    value={filterLoc}
                    onChange={setFilterLoc}
                    placeholder="All locations"
                  />
                </div>
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
              {asOnDate
                ? <>As on {fmtDate(asOnDate)}: <strong style={{ color: 'var(--text-1)' }}>{qtyOnHand}</strong> on hand
                  {qtyAllTotal !== qtyOnHand ? <> · <strong style={{ color: 'var(--text-1)' }}>{qtyAllTotal}</strong> listed incl. moved-out</> : null}
                  {' '}across {groups.length} item{groups.length === 1 ? '' : 's'}</>
                : <>Showing {groups.length} item{groups.length === 1 ? '' : 's'} ({filtered.length} stock line{filtered.length === 1 ? '' : 's'}) · <strong style={{ color: 'var(--text-1)' }}>{qtyOnHand}</strong> on hand</>
              }
            </p>
          </div>

          {loading ? (
            <div className="card" style={{ padding: 48, textAlign: 'center', color: 'var(--text-3)' }}>
              <Loader2 size={24} className="animate-spin" style={{ display: 'block', margin: '0 auto 8px' }} />
              Loading assets…
            </div>
          ) : groups.length === 0 ? (
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
                    background: 'var(--sidebar-bg, #1e293b)', color: '#fff', border: 'none', borderRadius: 8,
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
                      {['', 'Photo', 'Description', 'Qty', 'Type', 'Location', 'Stock', 'Condition', 'Cost', ''].map((h, i) => (
                        <th key={h || `h${i}`} style={{
                          textAlign: h === 'Qty' ? 'center' : (h === '' && i > 0 ? 'right' : 'left'),
                          padding: '10px 14px', fontSize: 10, fontWeight: 700,
                          textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-3)',
                          whiteSpace: 'nowrap',
                        }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {groups.map(g => {
                      const a = g.primary
                      const condColor = a.condition?.color || '#64748b'
                      const open = expandedGroups.has(g.key) || g.lineCount === 1
                      const multi = g.lineCount > 1
                      return (
                        <Fragment key={g.key}>
                          <tr
                            onClick={() => multi && toggleGroup(g.key)}
                            style={{
                              borderBottom: '1px solid var(--card-border)',
                              cursor: multi ? 'pointer' : 'default',
                              background: multi && open ? 'rgba(37,99,235,0.03)' : 'transparent',
                            }}
                          >
                            <td style={{ padding: '10px 8px', width: 36, textAlign: 'center' }}>
                              {multi ? (
                                open
                                  ? <ChevronDown size={14} style={{ color: 'var(--accent)' }} />
                                  : <ChevronRight size={14} style={{ color: 'var(--text-3)' }} />
                              ) : null}
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
                            <td style={{ padding: '10px 14px', maxWidth: 280 }}>
                              <p style={{ margin: 0, fontWeight: 600, color: 'var(--text-1)' }}>{a.description}</p>
                              {multi && (
                                <p style={{ margin: '2px 0 0', fontSize: 11, color: 'var(--accent)', fontWeight: 600 }}>
                                  {g.lineCount} stock lines · click to {open ? 'collapse' : 'expand'}
                                </p>
                              )}
                            </td>
                            <td style={{
                              padding: '10px 14px', fontFamily: 'monospace', textAlign: 'center',
                              fontWeight: 800, fontSize: 14,
                              color: g.allOut ? 'var(--text-3)' : 'var(--text-1)',
                            }}>
                              {g.qtyOnHand}
                              {g.qtyAllLines !== g.qtyOnHand && (
                                <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-3)', marginTop: 2 }}>
                                  {g.qtyAllLines} total
                                </div>
                              )}
                            </td>
                            <td style={{ padding: '10px 14px', color: 'var(--text-2)', whiteSpace: 'nowrap' }}>
                              {a.item_type ? masterDisplayName(a.item_type, itemTypes) : '—'}
                            </td>
                            <td style={{ padding: '10px 14px', color: 'var(--text-2)', whiteSpace: 'nowrap' }}>
                              {a.location ? masterDisplayName(a.location, locations) : '—'}
                            </td>
                            <td style={{ padding: '10px 14px', color: 'var(--text-2)', whiteSpace: 'nowrap', fontSize: 12 }}>
                              {g.allOut ? (
                                <span style={{ color: '#b91c1c', fontWeight: 600 }}>Moved out</span>
                              ) : (
                                <span style={{ color: '#16a34a', fontWeight: 600 }}>In stock</span>
                              )}
                            </td>
                            <td style={{ padding: '10px 14px' }}>
                              {multi ? (
                                <span style={{ fontSize: 11, color: 'var(--text-3)' }}>See lines</span>
                              ) : a.condition ? (
                                <span style={{
                                  fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 6,
                                  background: `${condColor}18`, color: condColor, whiteSpace: 'nowrap',
                                }}>
                                  {a.condition.name}
                                </span>
                              ) : '—'}
                            </td>
                            <td style={{ padding: '10px 14px', fontFamily: 'monospace', color: 'var(--text-2)', whiteSpace: 'nowrap' }}>
                              {g.hasCost ? fmtMoney(g.costDisplay) : '—'}
                            </td>
                            <td style={{ padding: '10px 14px', textAlign: 'right', whiteSpace: 'nowrap' }} onClick={e => e.stopPropagation()}>
                              {/* Stock Movement only on single-line groups — multi-line: use each stock line */}
                              {!multi && (
                                <button onClick={() => setMoveAsset(a)} title="Stock Movement — in / out / return"
                                  style={{
                                    padding: '5px 7px', marginRight: 4, background: '#eff6ff',
                                    border: '1px solid #bfdbfe', borderRadius: 6, cursor: 'pointer',
                                    color: '#1d4ed8', display: 'inline-flex',
                                  }}>
                                  <ArrowRightLeft size={13} />
                                </button>
                              )}
                              {!multi && (
                                <>
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
                                </>
                              )}
                              {multi && (
                                <span style={{ fontSize: 10, color: 'var(--text-3)' }}>Expand lines to move</span>
                              )}
                            </td>
                          </tr>

                          {multi && open && g.lines.map(line => {
                            const lc = line.condition?.color || '#64748b'
                            const notes = userFacingNotes(line.notes)
                            return (
                              <tr key={line.id} style={{
                                borderBottom: '1px solid var(--card-border)',
                                background: 'rgba(0,0,0,0.015)',
                              }}>
                                <td style={{ padding: '8px 8px', textAlign: 'center' }}>
                                  <CornerDownRight size={12} style={{ color: 'var(--accent)', opacity: 0.7 }} />
                                </td>
                                <td style={{ padding: '6px 14px' }}>
                                  <div style={{
                                    width: 28, height: 28, borderRadius: 6, overflow: 'hidden', marginLeft: 6,
                                    background: 'var(--table-header-bg)', display: 'flex',
                                    alignItems: 'center', justifyContent: 'center',
                                  }}>
                                    {line.photo_url
                                      ? <img src={line.photo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                      : <Camera size={11} style={{ color: 'var(--text-3)', opacity: 0.4 }} />
                                    }
                                  </div>
                                </td>
                                <td style={{ padding: '8px 14px', maxWidth: 280 }}>
                                  <p style={{ margin: 0, fontSize: 13, color: 'var(--text-2)' }}>{line.description || '—'}</p>
                                  {notes ? (
                                    <p style={{ margin: '2px 0 0', fontSize: 11, color: 'var(--text-3)' }}>{notes}</p>
                                  ) : null}
                                </td>
                                <td style={{ padding: '8px 14px', fontFamily: 'monospace', textAlign: 'center', color: 'var(--text-1)', fontWeight: 700 }}>
                                  {line.quantity ?? 1}
                                </td>
                                <td style={{ padding: '8px 14px', color: 'var(--text-2)', fontSize: 12, whiteSpace: 'nowrap' }}>
                                  {line.item_type ? masterDisplayName(line.item_type, itemTypes) : '—'}
                                </td>
                                <td style={{ padding: '8px 14px', color: 'var(--text-2)', fontSize: 12, whiteSpace: 'nowrap' }}>
                                  {line.location ? masterDisplayName(line.location, locations) : '—'}
                                </td>
                                <td style={{ padding: '8px 14px', fontSize: 12 }}>
                                  {line.stock_out_date ? (
                                    <span style={{ color: '#b91c1c', fontWeight: 600 }}>Moved out</span>
                                  ) : (
                                    <span style={{ color: '#16a34a', fontWeight: 600 }}>In stock</span>
                                  )}
                                  <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 2 }}>
                                    In {fmtDate(line.stock_in_date)}
                                    {line.stock_out_date ? ` → Out ${fmtDate(line.stock_out_date)}` : ''}
                                  </div>
                                </td>
                                <td style={{ padding: '8px 14px' }}>
                                  {line.condition ? (
                                    <span style={{
                                      fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 6,
                                      background: `${lc}18`, color: lc, whiteSpace: 'nowrap',
                                    }}>
                                      {line.condition.name}
                                    </span>
                                  ) : '—'}
                                </td>
                                <td style={{ padding: '8px 14px', fontFamily: 'monospace', color: 'var(--text-2)', fontSize: 12 }}>
                                  {fmtMoney(line.purchase_value ?? line.unit_price)}
                                </td>
                                <td style={{ padding: '8px 14px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                                  <button onClick={() => setMoveAsset(line)} title="Stock Movement"
                                    style={{
                                      padding: '4px 6px', marginRight: 4, background: '#eff6ff',
                                      border: '1px solid #bfdbfe', borderRadius: 6, cursor: 'pointer',
                                      color: '#1d4ed8', display: 'inline-flex',
                                    }}>
                                    <ArrowRightLeft size={12} />
                                  </button>
                                  <button onClick={() => setModal(line)} title="Edit"
                                    style={{
                                      padding: '4px 6px', marginRight: 4, background: 'var(--table-header-bg)',
                                      border: '1px solid var(--card-border)', borderRadius: 6, cursor: 'pointer',
                                      color: 'var(--text-2)', display: 'inline-flex',
                                    }}>
                                    <Pencil size={12} />
                                  </button>
                                  <button onClick={() => handleDelete(line)} disabled={deleting === line.id} title="Remove"
                                    style={{
                                      padding: '4px 6px', background: '#fff5f5', border: '1px solid #fca5a5',
                                      borderRadius: 6, cursor: 'pointer', color: '#b91c1c', display: 'inline-flex',
                                    }}>
                                    {deleting === line.id ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                                  </button>
                                </td>
                              </tr>
                            )
                          })}
                        </Fragment>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      ) : tab === 'building' ? (
        canAccessAssetTab('building', role, pageGrants)
          ? <FixedAssetsVault />
          : (
            <div className="card" style={{ padding: '48px 24px', textAlign: 'center', color: 'var(--text-3)', fontSize: 14 }}>
              Fixed Assets access is restricted for your role.
            </div>
          )
      ) : tab === 'document' ? (
        canAccessAssetTab('document', role, pageGrants)
          ? <ChurchDocumentsVault />
          : (
            <div className="card" style={{ padding: '48px 24px', textAlign: 'center', color: 'var(--text-3)', fontSize: 14 }}>
              Documents access is restricted for your role.
            </div>
          )
      ) : (
        <ComingSoon label={ASSET_CATEGORIES.find(c => c.id === tab)?.label} />
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

      {moveAsset && (
        <StockMovementModal
          asset={moveAsset}
          conditions={conditions}
          onDone={handleStockMove}
          onClose={() => setMoveAsset(null)}
        />
      )}
    </div>
  )
}
