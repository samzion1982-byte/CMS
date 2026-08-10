/* ═══════════════════════════════════════════════════════════════
   DirectoryPage.jsx — Phone Directory for church external contacts
   ═══════════════════════════════════════════════════════════════ */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  BookUser, Settings, Plus, Search, Phone, MessageCircle, Mail,
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

function telHref(v) {
  const d = digitsOnly(v)
  return d ? `tel:${d}` : null
}

function waHref(v) {
  const d = digitsOnly(v)
  return d ? `https://wa.me/${d}` : null
}

/** Primary = whatsapp (green), Secondary = phone (blue). Number only — no WA/Ph text. */
function NumberChip({ kind, value, href }) {
  const isPrimary = kind === 'primary'
  const style = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 7,
    padding: '4px 11px',
    borderRadius: 8,
    textDecoration: 'none',
    lineHeight: 1.1,
    background: isPrimary ? '#ecfdf5' : '#eff6ff',
    color: isPrimary ? '#047857' : '#1d4ed8',
    border: `1px solid ${isPrimary ? '#a7f3d0' : '#bfdbfe'}`,
    whiteSpace: 'nowrap',
  }
  const inner = (
    <>
      {isPrimary
        ? <MessageCircle size={14} strokeWidth={2.4} />
        : <Phone size={14} strokeWidth={2.4} />}
      <span style={{
        fontSize: 18, fontWeight: 800, letterSpacing: 0.2,
        fontVariantNumeric: 'tabular-nums',
      }}>
        {value}
      </span>
    </>
  )
  if (href) {
    return (
      <a
        href={href}
        target={isPrimary ? '_blank' : undefined}
        rel={isPrimary ? 'noreferrer' : undefined}
        style={style}
      >
        {inner}
      </a>
    )
  }
  return <span style={style}>{inner}</span>
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
      position: 'fixed', inset: 0, zIndex: 100,
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

  function set(k, v) { setForm(f => ({ ...f, [k]: v })) }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.name.trim()) {
      toast('Name is required.', 'error')
      return
    }
    setSaving(true)
    try {
      await onSave(form)
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
        position: 'fixed', inset: 0, zIndex: 80,
        background: 'rgba(15,23,42,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16,
      }}
      onClick={onClose}
    >
      <form
        className="card"
        onClick={e => e.stopPropagation()}
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
          <div>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#0f172a', marginBottom: 5 }}>Name *</label>
            <input style={INPUT} value={form.name} onChange={e => set('name', e.target.value)} placeholder="Person or contact name" autoFocus />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#0369a1', marginBottom: 5 }}>Organization</label>
              <input style={INPUT} value={form.organization} onChange={e => set('organization', e.target.value)} placeholder="Office / firm" />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#7c3aed', marginBottom: 5 }}>Title / Role</label>
              <input style={INPUT} value={form.title} onChange={e => set('title', e.target.value)} placeholder="e.g. Bishop, Contractor" />
            </div>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#0f766e', marginBottom: 5 }}>Category</label>
            <select
              style={{ ...INPUT, appearance: 'none' }}
              value={form.category_id}
              onChange={e => set('category_id', e.target.value)}
            >
              <option value="">— Select —</option>
              {catOpts.map(c => (
                <option key={c.id} value={c.id}>
                  {'\u00A0'.repeat(c.depth * 2)}{c.name}
                </option>
              ))}
            </select>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#047857', marginBottom: 5 }}>
                Primary (WhatsApp)
              </label>
              <input
                style={{ ...INPUT, borderColor: '#a7f3d0' }}
                value={form.whatsapp}
                onChange={e => set('whatsapp', e.target.value)}
                placeholder="Primary / WhatsApp number"
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
                placeholder="Secondary / alternate number"
              />
            </div>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#b45309', marginBottom: 5 }}>Email</label>
            <input style={INPUT} type="email" value={form.email} onChange={e => set('email', e.target.value)} placeholder="email@example.com" />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#64748b', marginBottom: 5 }}>Address</label>
            <textarea
              value={form.address}
              onChange={e => set('address', e.target.value)}
              rows={2}
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
              style={{ ...INPUT, height: 'auto', padding: '8px 12px', resize: 'vertical', fontFamily: 'inherit' }}
              placeholder="Optional notes"
            />
          </div>
        </div>

        <div style={{
          padding: '12px 18px', borderTop: '1px solid var(--card-border)',
          display: 'flex', justifyContent: 'flex-end', gap: 8,
        }}>
          <button type="button" onClick={onClose}
            style={{ padding: '8px 14px', borderRadius: 8, border: '1.5px solid var(--card-border)', background: 'transparent', color: 'var(--text-2)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            Cancel
          </button>
          <button type="submit" disabled={saving}
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
  { header: 'Name', key: 'name', align: 'left' },
  { header: 'Organization', key: 'organization', align: 'left' },
  { header: 'Title / Role', key: 'title', align: 'left' },
  { header: 'Category', key: 'category', align: 'left' },
  { header: 'Primary (WhatsApp)', key: 'primary', align: 'center' },
  { header: 'Secondary', key: 'secondary', align: 'center' },
  { header: 'Email', key: 'email', align: 'left' },
  { header: 'Address', key: 'address', align: 'left' },
  { header: 'Notes', key: 'notes', align: 'left' },
]

function contactExportRow(c, categories) {
  const catRow = c.category_id ? categories.find(x => x.id === c.category_id) : null
  return {
    name: c.name || '',
    organization: c.organization || '',
    title: c.title || '',
    category: catRow ? masterDisplayName(catRow, categories) : (c.category?.name || ''),
    primary: c.whatsapp || '',
    secondary: c.phone || '',
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
            onClick={() => setModal({})}
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
                {contacts.length === 0
                  ? 'No contacts yet. Add your first phone directory entry.'
                  : 'No contacts match this filter.'}
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
                  const primaryHref = primary ? waHref(primary) || telHref(primary) : null
                  const secondaryHref = secondary ? telHref(secondary) : null
                  const hasBoth = !!(primary && secondary)
                  return (
                    <div
                      key={c.id}
                      className="directory-row"
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'minmax(0, 1.2fr) minmax(150px, auto) auto',
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
                        {(c.email || c.notes) && (
                          <div style={{ marginTop: 3, display: 'flex', flexDirection: 'column', gap: 2 }}>
                            {c.email && (
                              <a href={`mailto:${c.email}`} style={{
                                display: 'inline-flex', alignItems: 'center', gap: 4, width: 'fit-content',
                                padding: '2px 7px', borderRadius: 5, textDecoration: 'none',
                                background: '#fffbeb', color: '#b45309', fontSize: 11, fontWeight: 600,
                                border: '1px solid #fde68a', lineHeight: 1.3,
                              }}>
                                <Mail size={11} /> {c.email}
                              </a>
                            )}
                            {c.notes && (
                              <p style={{ margin: 0, fontSize: 11, color: '#94a3b8', lineHeight: 1.3 }}>
                                {c.notes}
                              </p>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Middle: numbers top/bottom */}
                      <div style={{
                        display: 'flex', flexDirection: 'column', gap: 4,
                        alignItems: 'flex-start', justifyContent: 'center',
                        minWidth: 0,
                      }}>
                        {primary && (
                          <NumberChip kind="primary" value={primary} href={primaryHref} />
                        )}
                        {secondary && (
                          <NumberChip kind="secondary" value={secondary} href={secondaryHref} />
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
                          onClick={() => setModal(c)}
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
          editing={modal.id ? modal : null}
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
            grid-column: 2 / 3;
            grid-row: 1 / 3;
            align-self: start;
          }
        }
      `}</style>
    </div>
  )
}
