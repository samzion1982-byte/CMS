/* ═══════════════════════════════════════════════════════════════
   DirectoryPage.jsx — Phone Directory for church external contacts
   ═══════════════════════════════════════════════════════════════ */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  BookUser, Settings, Plus, Search, Mail, User,
  Loader2, Pencil, Trash2, X, Building2, MapPin, ChevronRight,
  FileSpreadsheet, Lock, Eye, EyeOff,
} from 'lucide-react'
import { useAuth } from '../lib/AuthContext'
import { useToast } from '../lib/toast'
import { getChurch } from '../lib/supabase'
import { fmtDate } from '../lib/auth'
import { exportMultiSheetWithTitle } from '../lib/exportExcel'
import MasterPasswordInput from '../components/MasterPasswordInput'
import {
  getDirectoryCategories,
  getDirectoryContacts,
  saveDirectoryContact,
  deleteDirectoryContact,
  buildMasterTree,
  flattenMasterOptions,
  masterDisplayName,
  categoryIdsIncludingDescendants,
} from '../lib/directoryLib'

const ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')
const MASTER_PASSWORD = 'Master007))&'

const EMPTY = {
  id: null,
  contact_kind: 'person',
  name: '',
  organization: '',
  title: '',
  category_id: '',
  phone: '',
  whatsapp: '',
  email: '',
  address: '',
  notes: '',
}

const INPUT = {
  width: '100%', height: 36, padding: '0 12px',
  border: '1.5px solid var(--card-border)', borderRadius: 8,
  fontSize: 13, background: 'var(--input-bg)', color: 'var(--text-1)',
  outline: 'none', boxSizing: 'border-box',
}

function digitsOnly(v) {
  return String(v || '').replace(/\D/g, '')
}

/**
 * CMS Indian mobile: store as 91XXXXXXXXXX (no + / hyphen).
 * Accepts 10-digit, 0XXXXXXXXXX, 91XXXXXXXXXX, +91-… inputs.
 */
function normalizeMemberPhone(raw, { required = false, label = 'Number' } = {}) {
  const trimmed = String(raw || '').trim()
  if (!trimmed) {
    return required
      ? { ok: false, value: '', error: `${label} is required` }
      : { ok: true, value: '', error: null }
  }
  let digits = trimmed.replace(/\D/g, '')
  if (digits.startsWith('91') && digits.length >= 12) digits = digits.slice(-10)
  else if (digits.startsWith('0') && digits.length === 11) digits = digits.slice(1)

  if (digits.length !== 10) {
    return { ok: false, value: '', error: `${label}: enter a valid 10-digit Indian mobile` }
  }
  if (!/^[6-9]/.test(digits)) {
    return { ok: false, value: '', error: `${label}: mobile must start with 6–9` }
  }
  return { ok: true, value: `91${digits}`, error: null }
}

/** Display 919994073545 → 91-99940 73545 for readability. */
function formatDisplayNumber(v) {
  const raw = String(v || '').trim()
  if (!raw) return ''
  const normalized = normalizeMemberPhone(raw)
  const stored = normalized.ok && normalized.value ? normalized.value : raw
  const d = digitsOnly(stored)
  if (d.length === 12 && d.startsWith('91')) {
    return `91-${d.slice(2, 7)} ${d.slice(7)}`
  }
  if (d.length === 10) {
    return `91-${d.slice(0, 5)} ${d.slice(5)}`
  }
  return stored
}

function WhatsAppIcon({ size = 16, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} aria-hidden="true">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.435 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  )
}

/** Prefer WhatsApp app / Desktop; fall back to WhatsApp Web only if app does not open. */
function openWhatsApp(e, value) {
  e?.preventDefault?.()
  e?.stopPropagation?.()
  const normalized = normalizeMemberPhone(value)
  let d = digitsOnly(normalized.ok && normalized.value ? normalized.value : value)
  if (!d) return
  if (d.length === 10) d = `91${d}`

  const appUrl = `whatsapp://send?phone=${d}`
  const webUrl = `https://wa.me/${d}`
  const ua = navigator.userAgent || ''
  const isAndroid = /Android/i.test(ua)

  let appOpened = false
  const markOpened = () => { appOpened = true }
  window.addEventListener('blur', markOpened, { once: true })
  const onVis = () => {
    if (document.visibilityState === 'hidden') appOpened = true
  }
  document.addEventListener('visibilitychange', onVis)

  if (isAndroid) {
    // Android Intent: opens WhatsApp app, falls back to wa.me if not installed
    const intent = `intent://send?phone=${d}#Intent;scheme=whatsapp;package=com.whatsapp;S.browser_fallback_url=${encodeURIComponent(webUrl)};end`
    window.location.href = intent
  } else {
    // iOS / Desktop: custom protocol opens app or WhatsApp Desktop
    window.location.href = appUrl
    setTimeout(() => {
      document.removeEventListener('visibilitychange', onVis)
      if (!appOpened && document.visibilityState === 'visible') {
        window.open(webUrl, '_blank', 'noopener,noreferrer')
      }
    }, 1400)
  }
}

/** Primary (green) / Secondary (blue). Both open WhatsApp. */
function NumberChip({ kind, value }) {
  const isPrimary = kind === 'primary'
  const brand = isPrimary ? '#25D366' : '#1d4ed8'
  const style = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 7,
    padding: '4px 11px',
    borderRadius: 8,
    textDecoration: 'none',
    lineHeight: 1.1,
    background: isPrimary ? '#ecfdf5' : '#eff6ff',
    color: isPrimary ? '#128C7E' : '#1d4ed8',
    border: `1px solid ${isPrimary ? '#a7f3d0' : '#bfdbfe'}`,
    whiteSpace: 'nowrap',
    cursor: 'pointer',
  }
  return (
    <button
      type="button"
      title="Open in WhatsApp"
      onClick={(e) => openWhatsApp(e, value)}
      style={{ ...style, font: 'inherit' }}
    >
      <WhatsAppIcon size={15} color={brand} />
      <span style={{
        fontSize: 18, fontWeight: 800, letterSpacing: 0.2,
        fontVariantNumeric: 'tabular-nums',
      }}>
        {formatDisplayNumber(value)}
      </span>
    </button>
  )
}

function DeleteContactModal({ contact, onConfirm, onClose }) {
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [error, setError] = useState('')
  const [working, setWorking] = useState(false)
  const inputRef = useRef(null)
  useEffect(() => { setTimeout(() => inputRef.current?.focus(), 80) }, [])

  async function attempt() {
    if (password !== MASTER_PASSWORD) {
      setError('Incorrect master password.')
      setPassword('')
      return
    }
    setWorking(true)
    try {
      await onConfirm()
    } finally {
      setWorking(false)
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 2100,
      background: 'rgba(0,0,0,0.55)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
    }} onClick={onClose}>
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--card-bg)', borderRadius: 16, width: '100%', maxWidth: 400,
          boxShadow: '0 24px 60px rgba(0,0,0,0.25)', overflow: 'hidden',
        }}
      >
        <div style={{ padding: '20px 22px 8px', textAlign: 'center' }}>
          <div style={{
            width: 48, height: 48, borderRadius: 14, background: '#fee2e2',
            display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px',
          }}>
            <Lock size={20} color="#b91c1c" />
          </div>
          <p style={{ margin: '0 0 6px', fontSize: 16, fontWeight: 800, color: 'var(--text-1)' }}>
            Delete Contact
          </p>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--text-3)', lineHeight: 1.45 }}>
            Enter the master password to permanently remove “{contact?.name}” from the phone directory.
          </p>
        </div>
        <div style={{ padding: '14px 22px 22px' }}>
          <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', display: 'block', marginBottom: 7 }}>
            Master Password
          </label>
          <div style={{ position: 'relative', marginBottom: 10 }}>
            <MasterPasswordInput
              ref={inputRef}
              showPlain={showPw}
              value={password}
              onChange={e => { setPassword(e.target.value); setError('') }}
              onKeyDown={e => e.key === 'Enter' && attempt()}
              placeholder="Enter master password…"
              style={{
                ...INPUT, height: 40, fontSize: 13, paddingRight: 42,
                letterSpacing: showPw ? 'normal' : '0.12em',
                border: `1.5px solid ${error ? '#b91c1c' : 'var(--card-border)'}`,
              }}
            />
            <button type="button" onClick={() => setShowPw(v => !v)} style={{
              position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
              background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', display: 'flex',
            }}>
              {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>
          {error && (
            <p style={{ margin: '0 0 10px', fontSize: 12, color: '#dc2626', fontWeight: 600 }}>{error}</p>
          )}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" onClick={onClose}
              style={{
                padding: '8px 14px', borderRadius: 8, border: '1.5px solid var(--card-border)',
                background: 'transparent', color: 'var(--text-2)', fontSize: 13, fontWeight: 600, cursor: 'pointer',
              }}>
              Cancel
            </button>
            <button type="button" onClick={attempt} disabled={working || !password}
              style={{
                padding: '8px 14px', borderRadius: 8, border: 'none',
                background: '#b91c1c', color: '#fff', fontSize: 13, fontWeight: 700,
                cursor: working || !password ? 'not-allowed' : 'pointer',
                opacity: working || !password ? 0.65 : 1,
                display: 'inline-flex', alignItems: 'center', gap: 6,
              }}>
              {working ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
              Delete
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function ContactModal({ editing, categories, onSave, onClose }) {
  const [form, setForm] = useState(() => editing
    ? {
        id: editing.id,
        contact_kind: editing.contact_kind === 'organisation' ? 'organisation' : 'person',
        name: editing.name || '',
        organization: editing.organization || '',
        title: editing.title || '',
        category_id: editing.category_id || '',
        phone: editing.phone || '',
        whatsapp: editing.whatsapp || '',
        email: editing.email || '',
        address: editing.address || '',
        notes: editing.notes || '',
      }
    : { ...EMPTY })
  const [saving, setSaving] = useState(false)
  const toast = useToast()
  const catOpts = flattenMasterOptions(categories.filter(c => c.is_active !== false))
  const ignoreBackdropRef = useRef(false)
  const isOrg = form.contact_kind === 'organisation'

  function set(k, v) { setForm(f => ({ ...f, [k]: v })) }

  function armBackdropGuard() {
    ignoreBackdropRef.current = true
    setTimeout(() => { ignoreBackdropRef.current = false }, 500)
  }
  function onBackdropPointerDown(e) {
    if (e.target !== e.currentTarget) return
    if (ignoreBackdropRef.current) return
    e.currentTarget.dataset.backdropDown = '1'
  }
  function onBackdropClick(e) {
    if (e.target !== e.currentTarget) return
    if (ignoreBackdropRef.current) return
    if (e.currentTarget.dataset.backdropDown !== '1') return
    e.currentTarget.dataset.backdropDown = ''
    onClose()
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.name.trim()) {
      toast(isOrg ? 'Organisation name is required.' : 'Name is required.', 'error')
      return
    }
    const primary = normalizeMemberPhone(form.whatsapp, { label: 'Primary number' })
    if (!primary.ok) {
      toast(primary.error, 'error')
      return
    }
    const secondary = normalizeMemberPhone(form.phone, { label: 'Secondary number' })
    if (!secondary.ok) {
      toast(secondary.error, 'error')
      return
    }
    if (!primary.value && !secondary.value) {
      toast('Enter at least one phone number.', 'error')
      return
    }
    setSaving(true)
    try {
      await onSave({
        ...form,
        contact_kind: isOrg ? 'organisation' : 'person',
        whatsapp: primary.value,
        phone: secondary.value,
      })
    } catch (err) {
      toast(err.message || 'Save failed.', 'error')
      setSaving(false)
      return
    }
    setSaving(false)
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 2000,
        background: 'rgba(15,23,42,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16,
      }}
      onPointerDown={onBackdropPointerDown}
      onClick={onBackdropClick}
    >
      <form
        className="card"
        onPointerDown={e => e.stopPropagation()}
        onClick={e => e.stopPropagation()}
        onFocusCapture={armBackdropGuard}
        onSubmit={handleSubmit}
        style={{
          width: '100%', maxWidth: 520, padding: 0, overflow: 'hidden',
          maxHeight: '90vh', display: 'flex', flexDirection: 'column',
        }}
      >
        <div style={{
          padding: '16px 18px', borderBottom: '1px solid var(--card-border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div>
            <p style={{ margin: 0, fontSize: 15, fontWeight: 800, color: 'var(--text-1)' }}>
              {editing ? 'Edit Contact' : 'Add Contact'}
            </p>
            <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--text-3)' }}>
              Phone directory entry
            </p>
          </div>
          <button type="button" onClick={onClose}
            style={{ width: 30, height: 30, borderRadius: 8, border: 'none', background: 'transparent', color: 'var(--text-3)', cursor: 'pointer', display: 'grid', placeItems: 'center' }}>
            <X size={16} />
          </button>
        </div>

        <div style={{ padding: 18, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Person / Organisation toggle */}
          <div
            role="group"
            aria-label="Contact type"
            style={{
              display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6,
              padding: 4, borderRadius: 10,
              background: 'var(--sidebar-item-active-bg, #f1f5f9)',
              border: '1px solid var(--card-border)',
            }}
          >
            {[
              { id: 'person', label: 'Person', Icon: User, color: '#7c3aed' },
              { id: 'organisation', label: 'Organisation', Icon: Building2, color: '#0369a1' },
            ].map(({ id, label, Icon, color }) => {
              const on = form.contact_kind === id
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => set('contact_kind', id)}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                    padding: '10px 12px', borderRadius: 8, border: 'none', cursor: 'pointer',
                    background: on ? '#fff' : 'transparent',
                    color: on ? color : 'var(--text-3)',
                    fontSize: 13, fontWeight: 800,
                    boxShadow: on ? '0 1px 3px rgba(15,23,42,0.12)' : 'none',
                  }}
                >
                  <Icon size={15} /> {label}
                </button>
              )
            })}
          </div>

          {isOrg ? (
            <>
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#0369a1', marginBottom: 5 }}>
                  Organisation name *
                </label>
                <input
                  style={INPUT}
                  value={form.name}
                  onChange={e => set('name', e.target.value)}
                  placeholder="e.g. AAA Systems"
                  autoFocus
                  tabIndex={1}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#0369a1', marginBottom: 5 }}>
                  Type
                </label>
                <input
                  style={INPUT}
                  value={form.organization}
                  onChange={e => set('organization', e.target.value)}
                  placeholder="e.g. Firm, Vendor, Office"
                  tabIndex={2}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#7c3aed', marginBottom: 5 }}>
                  Title / Role
                </label>
                <input
                  style={INPUT}
                  value={form.title}
                  onChange={e => set('title', e.target.value)}
                  placeholder="Optional contact person / role"
                  tabIndex={3}
                />
              </div>
            </>
          ) : (
            <>
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#7c3aed', marginBottom: 5 }}>
                  Title / Role
                </label>
                <input
                  style={INPUT}
                  value={form.title}
                  onChange={e => set('title', e.target.value)}
                  placeholder="e.g. Bishop, Contractor"
                  autoFocus
                  tabIndex={1}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#0f172a', marginBottom: 5 }}>
                  Name *
                </label>
                <input
                  style={INPUT}
                  value={form.name}
                  onChange={e => set('name', e.target.value)}
                  placeholder="Person name"
                  tabIndex={2}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#0369a1', marginBottom: 5 }}>
                  Organisation
                </label>
                <input
                  style={INPUT}
                  value={form.organization}
                  onChange={e => set('organization', e.target.value)}
                  placeholder="Office / firm"
                  tabIndex={3}
                />
              </div>
            </>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#128C7E', marginBottom: 5 }}>
                Primary number
              </label>
              <input
                style={{ ...INPUT, borderColor: '#a7f3d0' }}
                value={form.whatsapp}
                onChange={e => set('whatsapp', e.target.value)}
                placeholder="10-digit mobile"
                tabIndex={4}
                inputMode="tel"
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#1d4ed8', marginBottom: 5 }}>
                Secondary number
              </label>
              <input
                style={{ ...INPUT, borderColor: '#bfdbfe' }}
                value={form.phone}
                onChange={e => set('phone', e.target.value)}
                placeholder="10-digit mobile"
                tabIndex={5}
                inputMode="tel"
              />
            </div>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#b45309', marginBottom: 5 }}>Email</label>
            <input
              style={INPUT}
              type="email"
              value={form.email}
              onChange={e => set('email', e.target.value)}
              placeholder="email@example.com"
              tabIndex={6}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#0f766e', marginBottom: 5 }}>Category</label>
            <select
              style={{ ...INPUT, appearance: 'none' }}
              value={form.category_id}
              onChange={e => set('category_id', e.target.value)}
              tabIndex={7}
            >
              <option value="">— Select —</option>
              {catOpts.map(c => (
                <option key={c.id} value={c.id}>
                  {'\u00A0'.repeat(c.depth * 2)}{c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#64748b', marginBottom: 5 }}>Address</label>
            <textarea
              value={form.address}
              onChange={e => set('address', e.target.value)}
              rows={2}
              tabIndex={8}
              style={{ ...INPUT, height: 'auto', padding: '8px 12px', resize: 'vertical', fontFamily: 'inherit' }}
              placeholder="Optional address"
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#64748b', marginBottom: 5 }}>Notes</label>
            <textarea
              value={form.notes}
              onChange={e => set('notes', e.target.value)}
              rows={2}
              tabIndex={9}
              style={{ ...INPUT, height: 'auto', padding: '8px 12px', resize: 'vertical', fontFamily: 'inherit' }}
              placeholder="Optional notes"
            />
          </div>
        </div>

        <div style={{
          padding: '12px 18px', borderTop: '1px solid var(--card-border)',
          display: 'flex', justifyContent: 'flex-end', gap: 8,
        }}>
          <button type="button" onClick={onClose} tabIndex={10}
            style={{ padding: '8px 14px', borderRadius: 8, border: '1.5px solid var(--card-border)', background: 'transparent', color: 'var(--text-2)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            Cancel
          </button>
          <button type="submit" disabled={saving} tabIndex={11}
            style={{
              padding: '8px 16px', borderRadius: 8, border: 'none',
              background: 'var(--sidebar-bg, #1e293b)', color: '#fff',
              fontSize: 13, fontWeight: 700, cursor: saving ? 'wait' : 'pointer',
              display: 'inline-flex', alignItems: 'center', gap: 6, opacity: saving ? 0.7 : 1,
            }}>
            {saving ? <Loader2 size={14} className="animate-spin" /> : null}
            {editing ? 'Save' : 'Add Contact'}
          </button>
        </div>
      </form>
    </div>
  )
}

function CategoryNav({ tree, selectedId, counts, onSelect }) {
  function Node({ node, depth = 0 }) {
    const [open, setOpen] = useState(depth < 1)
    const hasKids = node.children?.length > 0
    const active = selectedId === node.id
    const count = counts[node.id] || 0

    return (
      <div>
        <button
          type="button"
          onClick={() => onSelect(node.id)}
          style={{
            width: '100%', display: 'flex', alignItems: 'center', gap: 6,
            padding: '8px 10px', paddingLeft: 10 + depth * 14,
            border: 'none', borderRadius: 8, cursor: 'pointer', textAlign: 'left',
            background: active ? 'var(--sidebar-item-active-bg)' : 'transparent',
            color: active ? 'var(--accent)' : 'var(--text-1)',
            fontWeight: active ? 700 : depth === 0 ? 600 : 500,
            fontSize: depth === 0 ? 13 : 12,
          }}
        >
          {hasKids ? (
            <span
              onClick={e => { e.stopPropagation(); setOpen(o => !o) }}
              style={{ display: 'grid', placeItems: 'center', width: 16, color: 'var(--text-3)' }}
            >
              <ChevronRight size={13} style={{ transform: open ? 'rotate(90deg)' : 'none', transition: 'transform .15s' }} />
            </span>
          ) : (
            <span style={{ width: 16 }} />
          )}
          <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {node.name}
          </span>
          {count > 0 && (
            <span style={{
              fontSize: 10, fontWeight: 700, color: active ? 'var(--accent)' : 'var(--text-3)',
              background: active ? 'rgba(37,99,235,0.1)' : 'var(--card-border)',
              padding: '1px 6px', borderRadius: 99,
            }}>{count}</span>
          )}
        </button>
        {open && hasKids && node.children.map(c => (
          <Node key={c.id} node={c} depth={depth + 1} />
        ))}
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <button
        type="button"
        onClick={() => onSelect(null)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 6,
          padding: '8px 10px', border: 'none', borderRadius: 8, cursor: 'pointer',
          background: !selectedId ? 'var(--sidebar-item-active-bg)' : 'transparent',
          color: !selectedId ? 'var(--accent)' : 'var(--text-1)',
          fontWeight: 700, fontSize: 13, textAlign: 'left',
        }}
      >
        <span style={{ width: 16 }} />
        <span style={{ flex: 1 }}>All Contacts</span>
        <span style={{
          fontSize: 10, fontWeight: 700, color: !selectedId ? 'var(--accent)' : 'var(--text-3)',
          background: !selectedId ? 'rgba(37,99,235,0.1)' : 'var(--card-border)',
          padding: '1px 6px', borderRadius: 99,
        }}>{counts.__all || 0}</span>
      </button>
      {tree.map(n => <Node key={n.id} node={n} />)}
    </div>
  )
}

const EXPORT_COLUMNS = [
  { header: 'Kind', key: 'kind', align: 'center' },
  { header: 'Name', key: 'name', align: 'left' },
  { header: 'Organization', key: 'organization', align: 'left' },
  { header: 'Title / Role', key: 'title', align: 'left' },
  { header: 'Category', key: 'category', align: 'left' },
  { header: 'Primary number', key: 'primary', align: 'center' },
  { header: 'Secondary number', key: 'secondary', align: 'center' },
  { header: 'Email', key: 'email', align: 'left' },
  { header: 'Address', key: 'address', align: 'left' },
  { header: 'Notes', key: 'notes', align: 'left' },
]

function contactExportRow(c, categories) {
  const catRow = c.category_id ? categories.find(x => x.id === c.category_id) : null
  return {
    kind: c.contact_kind === 'organisation' ? 'Organisation' : 'Person',
    name: c.name || '',
    organization: c.organization || '',
    title: c.title || '',
    category: catRow ? masterDisplayName(catRow, categories) : (c.category?.name || ''),
    primary: formatDisplayNumber(c.whatsapp || ''),
    secondary: formatDisplayNumber(c.phone || ''),
    email: c.email || '',
    address: c.address || '',
    notes: c.notes || '',
  }
}

export default function DirectoryPage() {
  const navigate = useNavigate()
  const toast = useToast()
  const { profile } = useAuth()
  const profileName = profile?.full_name || profile?.email || ''

  const [categories, setCategories] = useState([])
  const [contacts, setContacts] = useState([])
  const [loading, setLoading] = useState(true)
  const [categoryId, setCategoryId] = useState(null)
  const [alpha, setAlpha] = useState('')
  const [search, setSearch] = useState('')
  const [searchVal, setSearchVal] = useState('')
  const [modal, setModal] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [exporting, setExporting] = useState(false)
  const searchTimer = useRef(null)

  const catTree = useMemo(() => buildMasterTree(categories.filter(c => c.is_active)), [categories])

  const loadCategories = useCallback(async () => {
    try {
      setCategories(await getDirectoryCategories(false))
    } catch (e) {
      toast(e.message, 'error')
    }
  }, [toast])

  const loadContacts = useCallback(async () => {
    setLoading(true)
    try {
      const rows = await getDirectoryContacts({
        search: searchVal,
        alpha,
      })
      setContacts(rows)
    } catch (e) {
      toast(e.message, 'error')
    }
    setLoading(false)
  }, [searchVal, alpha, toast])

  useEffect(() => { loadCategories() }, [loadCategories])
  useEffect(() => { loadContacts() }, [loadContacts])

  // "+" key opens Add Contact (ignore when typing in fields / when a modal is open)
  useEffect(() => {
    function onKey(e) {
      if (modal || deleteTarget) return
      if (e.ctrlKey || e.metaKey || e.altKey) return
      const tag = (e.target?.tagName || '').toLowerCase()
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || e.target?.isContentEditable) return
      if (e.key === '+' || (e.key === '=' && e.shiftKey) || e.code === 'NumpadAdd') {
        e.preventDefault()
        setModal({ mode: 'add' })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [modal, deleteTarget])

  useEffect(() => {
    clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => setSearchVal(search), 280)
    return () => clearTimeout(searchTimer.current)
  }, [search])

  const filtered = useMemo(() => {
    if (!categoryId) return contacts
    const ids = new Set(categoryIdsIncludingDescendants(categoryId, categories))
    return contacts.filter(c => ids.has(c.category_id))
  }, [contacts, categoryId, categories])

  const counts = useMemo(() => {
    const map = { __all: contacts.length }
    for (const cat of categories) {
      const ids = new Set(categoryIdsIncludingDescendants(cat.id, categories))
      map[cat.id] = contacts.filter(c => ids.has(c.category_id)).length
    }
    return map
  }, [contacts, categories])

  async function handleSave(form) {
    await saveDirectoryContact({
      ...form,
      category_id: form.category_id || null,
    }, profileName)
    toast(form.id ? 'Contact updated.' : 'Contact added.', 'success')
    setModal(null)
    await loadContacts()
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    try {
      await deleteDirectoryContact(deleteTarget.id, deleteTarget.name)
      toast('Contact deleted.', 'success')
      setDeleteTarget(null)
      await loadContacts()
    } catch (e) {
      toast(e.message, 'error')
    }
  }

  async function handleExport() {
    if (filtered.length === 0) {
      toast('Nothing to export.', 'error')
      return
    }
    setExporting(true)
    try {
      const church = await getChurch().catch(() => null)
      const stamp = fmtDate(new Date().toISOString().slice(0, 10))
      const selectedCat = categoryId
        ? categories.find(c => c.id === categoryId)
        : null
      const filterBits = [
        selectedCat ? `Category: ${masterDisplayName(selectedCat, categories)}` : null,
        alpha ? `Letter: ${alpha}` : null,
        searchVal.trim() ? `Search: “${searchVal.trim()}”` : null,
      ].filter(Boolean)

      const baseTitle = [
        church?.church_name ? { text: church.church_name, bold: true, size: 13, bg: 'DBEAFE' } : null,
        (church?.address || church?.city)
          ? { text: [church.address, church.city].filter(Boolean).join(', '), size: 10 }
          : null,
        { text: 'PHONE DIRECTORY', bold: true, size: 12, bg: '1E3A5F', color: 'FFFFFF' },
      ].filter(Boolean)

      function titleFor(extra) {
        return [
          ...baseTitle,
          {
            text: [...filterBits, extra].filter(Boolean).join('  ·  ') || extra,
            size: 10,
          },
        ]
      }

      const sheets = []

      // All Contacts (current filter view)
      sheets.push({
        name: 'All Contacts',
        columns: EXPORT_COLUMNS,
        rows: filtered.map(c => contactExportRow(c, categories)),
        tabColor: '1E3A5F',
        titleLines: titleFor(`Contacts: ${filtered.length}`),
      })

      // One sheet per top-level category (within current filtered set)
      for (const root of catTree) {
        const ids = new Set(categoryIdsIncludingDescendants(root.id, categories))
        const rows = filtered.filter(c => ids.has(c.category_id))
        if (!rows.length) continue
        sheets.push({
          name: String(root.name || 'Category').slice(0, 31),
          columns: EXPORT_COLUMNS,
          rows: rows.map(c => contactExportRow(c, categories)),
          tabColor: '0F766E',
          titleLines: titleFor(`Category: ${root.name}  ·  ${rows.length}`),
        })
      }

      const uncategorized = filtered.filter(c => !c.category_id)
      if (uncategorized.length) {
        sheets.push({
          name: 'Uncategorized',
          columns: EXPORT_COLUMNS,
          rows: uncategorized.map(c => contactExportRow(c, categories)),
          tabColor: '64748B',
          titleLines: titleFor(`Uncategorized · ${uncategorized.length}`),
        })
      }

      await exportMultiSheetWithTitle(sheets, `Phone_Directory_${stamp}.xlsx`)
      toast('Excel exported.', 'success')
    } catch (e) {
      toast(e.message || 'Export failed.', 'error')
    }
    setExporting(false)
  }

  return (
    <div className="page-container">
      <div className="page-header" style={{ alignItems: 'flex-start' }}>
        <div>
          <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <BookUser size={20} style={{ color: 'var(--accent)' }} />
            Phone Directory
          </h1>
          <p className="page-subtitle">
            Diocese, vendors, service providers, officials — quick dial contacts
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button
            onClick={() => navigate('/directory/settings')}
            title="Directory Setup — categories"
            style={{
              padding: '8px 10px', background: 'var(--card-bg)', border: '1.5px solid var(--card-border)',
              borderRadius: 8, cursor: 'pointer', display: 'flex', alignItems: 'center', color: 'var(--text-2)',
            }}
          >
            <Settings size={15} />
          </button>
          <button
            onClick={handleExport}
            disabled={exporting || loading || filtered.length === 0}
            title="Export to Excel"
            style={{
              display: 'flex', alignItems: 'center', gap: 7, padding: '8px 14px',
              background: '#16a34a', color: '#fff', border: 'none', borderRadius: 8,
              fontSize: 13, fontWeight: 600,
              cursor: exporting || filtered.length === 0 ? 'not-allowed' : 'pointer',
              opacity: exporting || filtered.length === 0 ? 0.6 : 1,
            }}
          >
            {exporting
              ? <Loader2 size={14} className="animate-spin" />
              : <FileSpreadsheet size={14} />}
            Export
          </button>
          <button
            type="button"
            onClick={() => setModal({ mode: 'add' })}
            style={{
              display: 'flex', alignItems: 'center', gap: 7, padding: '8px 18px',
              background: 'var(--sidebar-bg, #1e293b)', color: '#fff', border: 'none', borderRadius: 8,
              fontSize: 13, fontWeight: 600, cursor: 'pointer',
            }}
          >
            <Plus size={14} /> Add Contact
          </button>
        </div>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(180px, 220px) 1fr',
        gap: 16,
        alignItems: 'start',
      }}
        className="directory-layout"
      >
        <div className="card" style={{ padding: 10, position: 'sticky', top: 12 }}>
          <p style={{
            margin: '4px 8px 10px', fontSize: 11, fontWeight: 800,
            color: 'var(--text-3)', letterSpacing: 0.6, textTransform: 'uppercase',
          }}>
            Categories
          </p>
          <CategoryNav
            tree={catTree}
            selectedId={categoryId}
            counts={counts}
            onSelect={setCategoryId}
          />
          {catTree.length === 0 && (
            <p style={{ margin: '12px 8px', fontSize: 12, color: 'var(--text-3)', lineHeight: 1.4 }}>
              No categories yet. Use Setup to add Diocese, Vendors, and more.
            </p>
          )}
        </div>

        <div style={{ minWidth: 0 }}>
          <div className="card" style={{ padding: '12px 14px', marginBottom: 12 }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ position: 'relative', flex: 1, minWidth: 180 }}>
                <Search size={14} style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }} />
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search name, org, phone, email…"
                  style={{ ...INPUT, paddingLeft: 34 }}
                />
              </div>
              <span style={{ fontSize: 12, color: 'var(--text-3)', fontWeight: 600 }}>
                {filtered.length} contact{filtered.length === 1 ? '' : 's'}
              </span>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 10 }}>
              <button
                type="button"
                onClick={() => setAlpha('')}
                style={{
                  minWidth: 28, height: 28, borderRadius: 6, fontSize: 11, fontWeight: 700,
                  border: `1px solid ${!alpha ? 'var(--accent)' : 'var(--card-border)'}`,
                  background: !alpha ? 'var(--sidebar-item-active-bg)' : 'transparent',
                  color: !alpha ? 'var(--accent)' : 'var(--text-2)', cursor: 'pointer',
                }}
              >All</button>
              {ALPHA.map(letter => (
                <button
                  key={letter}
                  type="button"
                  onClick={() => setAlpha(a => a === letter ? '' : letter)}
                  style={{
                    minWidth: 28, height: 28, borderRadius: 6, fontSize: 11, fontWeight: 700,
                    border: `1px solid ${alpha === letter ? 'var(--accent)' : 'var(--card-border)'}`,
                    background: alpha === letter ? 'var(--sidebar-item-active-bg)' : 'transparent',
                    color: alpha === letter ? 'var(--accent)' : 'var(--text-2)', cursor: 'pointer',
                  }}
                >{letter}</button>
              ))}
            </div>
          </div>

          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            {loading ? (
              <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-3)' }}>
                <Loader2 size={22} className="animate-spin" style={{ display: 'block', margin: '0 auto 10px' }} />
                Loading directory…
              </div>
            ) : filtered.length === 0 ? (
              <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>
                <p style={{ margin: '0 0 14px' }}>
                  {contacts.length === 0
                    ? 'No contacts yet. Add your first phone directory entry.'
                    : 'No contacts match this filter.'}
                </p>
                {contacts.length === 0 && (
                  <button
                    type="button"
                    onClick={() => setModal({ mode: 'add' })}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 7, padding: '8px 16px',
                      background: 'var(--sidebar-bg, #1e293b)', color: '#fff', border: 'none', borderRadius: 8,
                      fontSize: 13, fontWeight: 600, cursor: 'pointer',
                    }}
                  >
                    <Plus size={14} /> Add Contact
                  </button>
                )}
              </div>
            ) : (
              <div>
                {filtered.map((c, i) => {
                  const catRow = c.category_id
                    ? categories.find(x => x.id === c.category_id)
                    : null
                  const catLabel = catRow
                    ? masterDisplayName(catRow, categories)
                    : (c.category?.name || '')
                  const primary = c.whatsapp || ''
                  const secondary = c.phone || ''
                  const hasBoth = !!(primary && secondary)
                  return (
                    <div
                      key={c.id}
                      className="directory-row"
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'minmax(0, 1.1fr) minmax(120px, 1fr) minmax(150px, auto) auto',
                        gap: 12,
                        padding: '10px 14px',
                        borderBottom: i < filtered.length - 1 ? '1px solid var(--card-border)' : 'none',
                        alignItems: 'center',
                      }}
                    >
                      {/* Left: identity with color separation */}
                      <div style={{ minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' }}>
                          <p style={{ margin: 0, fontSize: 13, fontWeight: 800, color: '#0f172a', lineHeight: 1.25 }}>
                            {c.name}
                          </p>
                          {c.title && (
                            <span style={{ fontSize: 11, color: '#7c3aed', fontWeight: 600, lineHeight: 1.2 }}>{c.title}</span>
                          )}
                          {catLabel && (
                            <span style={{
                              fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 5,
                              background: '#ccfbf1', color: '#0f766e',
                              lineHeight: 1.3,
                            }}>{catLabel}</span>
                          )}
                        </div>
                        {(c.organization || c.address) && (
                          <div style={{ marginTop: 2, display: 'flex', flexDirection: 'column', gap: 1 }}>
                            {c.organization && (
                              <span style={{ fontSize: 11, color: '#0369a1', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4, lineHeight: 1.3 }}>
                                <Building2 size={10} /> {c.organization}
                              </span>
                            )}
                            {c.address && (
                              <span style={{ fontSize: 11, color: '#64748b', display: 'inline-flex', alignItems: 'center', gap: 4, lineHeight: 1.3 }}>
                                <MapPin size={10} /> {c.address}
                              </span>
                            )}
                          </div>
                        )}
                        {c.email && (
                          <div style={{ marginTop: 3 }}>
                            <a href={`mailto:${c.email}`} style={{
                              display: 'inline-flex', alignItems: 'center', gap: 4, width: 'fit-content',
                              padding: '2px 7px', borderRadius: 5, textDecoration: 'none',
                              background: '#fffbeb', color: '#b45309', fontSize: 11, fontWeight: 600,
                              border: '1px solid #fde68a', lineHeight: 1.3,
                            }}>
                              <Mail size={11} /> {c.email}
                            </a>
                          </div>
                        )}
                      </div>

                      {/* Middle: notes — medium-big font */}
                      <div style={{ minWidth: 0, padding: '0 4px' }}>
                        {c.notes ? (
                          <p style={{
                            margin: 0,
                            fontSize: 15,
                            fontWeight: 600,
                            color: '#334155',
                            lineHeight: 1.35,
                            wordBreak: 'break-word',
                          }}>
                            {c.notes}
                          </p>
                        ) : (
                          <span style={{ fontSize: 13, color: '#cbd5e1' }}>—</span>
                        )}
                      </div>

                      {/* Numbers top/bottom */}
                      <div style={{
                        display: 'flex', flexDirection: 'column', gap: 4,
                        alignItems: 'flex-start', justifyContent: 'center',
                        minWidth: 0,
                      }}>
                        {primary && (
                          <NumberChip kind="primary" value={primary} />
                        )}
                        {secondary && (
                          <NumberChip kind="secondary" value={secondary} />
                        )}
                        {!primary && !secondary && (
                          <span style={{ fontSize: 11, color: '#94a3b8' }}>—</span>
                        )}
                      </div>

                      {/* Right: Edit top, Trash bottom */}
                      <div style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: hasBoth ? 4 : 0,
                        flexShrink: 0,
                        alignSelf: 'center',
                        justifyContent: 'center',
                      }}>
                        <button
                          type="button"
                          title="Edit"
                          onClick={() => setModal({ mode: 'edit', ...c })}
                          style={{
                            width: 28, height: 28, borderRadius: 7, border: '1px solid var(--card-border)',
                            background: '#dbeafe', color: '#2563eb', cursor: 'pointer', display: 'grid', placeItems: 'center',
                          }}
                        >
                          <Pencil size={12} />
                        </button>
                        <button
                          type="button"
                          title="Delete"
                          onClick={() => setDeleteTarget(c)}
                          style={{
                            width: 28, height: 28, borderRadius: 7, border: '1px solid var(--card-border)',
                            background: '#fee2e2', color: '#b91c1c', cursor: 'pointer', display: 'grid', placeItems: 'center',
                          }}
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {modal && (
        <ContactModal
          editing={modal.mode === 'edit' || modal.id ? modal : null}
          categories={categories}
          onSave={handleSave}
          onClose={() => setModal(null)}
        />
      )}

      {deleteTarget && (
        <DeleteContactModal
          contact={deleteTarget}
          onConfirm={confirmDelete}
          onClose={() => setDeleteTarget(null)}
        />
      )}

      <style>{`
        @media (max-width: 780px) {
          .directory-layout {
            grid-template-columns: 1fr !important;
          }
          .directory-row {
            grid-template-columns: 1fr auto !important;
          }
          .directory-row > div:nth-child(2) {
            grid-column: 1 / 2;
            grid-row: 2;
          }
          .directory-row > div:nth-child(3) {
            grid-column: 1 / 2;
            grid-row: 3;
          }
          .directory-row > div:nth-child(4) {
            grid-column: 2 / 3;
            grid-row: 1 / 4;
            align-self: start;
          }
        }
      `}</style>
    </div>
  )
}
