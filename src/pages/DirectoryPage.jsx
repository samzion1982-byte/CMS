/* ═══════════════════════════════════════════════════════════════
   DirectoryPage.jsx — Phone Directory for church external contacts
   ═══════════════════════════════════════════════════════════════ */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  BookUser, Settings, Plus, Search, Phone, MessageCircle, Mail,
  Loader2, Pencil, Trash2, X, Building2, MapPin, ChevronRight,
} from 'lucide-react'
import { useAuth } from '../lib/AuthContext'
import { useToast } from '../lib/toast'
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
            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--text-3)', marginBottom: 5 }}>Name *</label>
            <input style={INPUT} value={form.name} onChange={e => set('name', e.target.value)} placeholder="Person or contact name" autoFocus />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--text-3)', marginBottom: 5 }}>Organization</label>
              <input style={INPUT} value={form.organization} onChange={e => set('organization', e.target.value)} placeholder="Office / firm" />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--text-3)', marginBottom: 5 }}>Title / Role</label>
              <input style={INPUT} value={form.title} onChange={e => set('title', e.target.value)} placeholder="e.g. Bishop, Contractor" />
            </div>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--text-3)', marginBottom: 5 }}>Category</label>
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
              <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--text-3)', marginBottom: 5 }}>Phone</label>
              <input style={INPUT} value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="Mobile / landline" />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--text-3)', marginBottom: 5 }}>WhatsApp</label>
              <input style={INPUT} value={form.whatsapp} onChange={e => set('whatsapp', e.target.value)} placeholder="WhatsApp number" />
            </div>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--text-3)', marginBottom: 5 }}>Email</label>
            <input style={INPUT} type="email" value={form.email} onChange={e => set('email', e.target.value)} placeholder="email@example.com" />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--text-3)', marginBottom: 5 }}>Address</label>
            <textarea
              value={form.address}
              onChange={e => set('address', e.target.value)}
              rows={2}
              style={{ ...INPUT, height: 'auto', padding: '8px 12px', resize: 'vertical', fontFamily: 'inherit' }}
              placeholder="Optional address"
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--text-3)', marginBottom: 5 }}>Notes</label>
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
  const [modal, setModal] = useState(null) // null | {} | contact
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
      // Load all active; filter by category client-side so parent includes children
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

  async function handleDelete(c) {
    if (!confirm(`Delete “${c.name}” from the phone directory?`)) return
    try {
      await deleteDirectoryContact(c.id, c.name)
      toast('Contact deleted.', 'success')
      await loadContacts()
    } catch (e) {
      toast(e.message, 'error')
    }
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
        {/* Category rail */}
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

        {/* List */}
        <div style={{ minWidth: 0 }}>
          {/* Search + A–Z */}
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
                  const phoneLink = telHref(c.phone)
                  const waLink = waHref(c.whatsapp || c.phone)
                  return (
                    <div
                      key={c.id}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr auto',
                        gap: 12,
                        padding: '14px 16px',
                        borderBottom: i < filtered.length - 1 ? '1px solid var(--card-border)' : 'none',
                        alignItems: 'center',
                      }}
                    >
                      <div style={{ minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                          <p style={{ margin: 0, fontSize: 14, fontWeight: 800, color: 'var(--text-1)' }}>
                            {c.name}
                          </p>
                          {c.title && (
                            <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{c.title}</span>
                          )}
                          {catLabel && (
                            <span style={{
                              fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 6,
                              background: 'var(--sidebar-item-active-bg)', color: 'var(--accent)',
                            }}>{catLabel}</span>
                          )}
                        </div>
                        {(c.organization || c.address) && (
                          <div style={{ marginTop: 4, display: 'flex', flexDirection: 'column', gap: 2 }}>
                            {c.organization && (
                              <span style={{ fontSize: 12, color: 'var(--text-2)', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                                <Building2 size={11} /> {c.organization}
                              </span>
                            )}
                            {c.address && (
                              <span style={{ fontSize: 12, color: 'var(--text-3)', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                                <MapPin size={11} /> {c.address}
                              </span>
                            )}
                          </div>
                        )}

                        {(c.phone || c.whatsapp) && (
                          <div style={{
                            marginTop: 10,
                            display: 'flex',
                            flexWrap: 'wrap',
                            gap: 10,
                            alignItems: 'stretch',
                          }}>
                            {c.phone && (
                              phoneLink ? (
                                <a href={phoneLink} style={{
                                  display: 'inline-flex', alignItems: 'center', gap: 8,
                                  padding: '8px 14px', borderRadius: 10, textDecoration: 'none',
                                  background: '#eff6ff', color: '#1d4ed8',
                                  border: '1px solid #bfdbfe',
                                }}>
                                  <Phone size={16} strokeWidth={2.4} />
                                  <span>
                                    <span style={{ display: 'block', fontSize: 10, fontWeight: 700, letterSpacing: 0.4, opacity: 0.75, textTransform: 'uppercase' }}>Phone</span>
                                    <span style={{ display: 'block', fontSize: 20, fontWeight: 800, letterSpacing: 0.3, lineHeight: 1.15, fontVariantNumeric: 'tabular-nums' }}>{c.phone}</span>
                                  </span>
                                </a>
                              ) : (
                                <span style={{
                                  display: 'inline-flex', alignItems: 'center', gap: 8,
                                  padding: '8px 14px', borderRadius: 10,
                                  background: '#eff6ff', color: '#1d4ed8',
                                  border: '1px solid #bfdbfe',
                                }}>
                                  <Phone size={16} strokeWidth={2.4} />
                                  <span>
                                    <span style={{ display: 'block', fontSize: 10, fontWeight: 700, letterSpacing: 0.4, opacity: 0.75, textTransform: 'uppercase' }}>Phone</span>
                                    <span style={{ display: 'block', fontSize: 20, fontWeight: 800, letterSpacing: 0.3, lineHeight: 1.15, fontVariantNumeric: 'tabular-nums' }}>{c.phone}</span>
                                  </span>
                                </span>
                              )
                            )}
                            {c.whatsapp && (
                              waHref(c.whatsapp) ? (
                                <a href={waHref(c.whatsapp)} target="_blank" rel="noreferrer" style={{
                                  display: 'inline-flex', alignItems: 'center', gap: 8,
                                  padding: '8px 14px', borderRadius: 10, textDecoration: 'none',
                                  background: '#ecfdf5', color: '#047857',
                                  border: '1px solid #a7f3d0',
                                }}>
                                  <MessageCircle size={16} strokeWidth={2.4} />
                                  <span>
                                    <span style={{ display: 'block', fontSize: 10, fontWeight: 700, letterSpacing: 0.4, opacity: 0.75, textTransform: 'uppercase' }}>WhatsApp</span>
                                    <span style={{ display: 'block', fontSize: 20, fontWeight: 800, letterSpacing: 0.3, lineHeight: 1.15, fontVariantNumeric: 'tabular-nums' }}>{c.whatsapp}</span>
                                  </span>
                                </a>
                              ) : (
                                <span style={{
                                  display: 'inline-flex', alignItems: 'center', gap: 8,
                                  padding: '8px 14px', borderRadius: 10,
                                  background: '#ecfdf5', color: '#047857',
                                  border: '1px solid #a7f3d0',
                                }}>
                                  <MessageCircle size={16} strokeWidth={2.4} />
                                  <span>
                                    <span style={{ display: 'block', fontSize: 10, fontWeight: 700, letterSpacing: 0.4, opacity: 0.75, textTransform: 'uppercase' }}>WhatsApp</span>
                                    <span style={{ display: 'block', fontSize: 20, fontWeight: 800, letterSpacing: 0.3, lineHeight: 1.15, fontVariantNumeric: 'tabular-nums' }}>{c.whatsapp}</span>
                                  </span>
                                </span>
                              )
                            )}
                          </div>
                        )}

                        {c.email && (
                          <div style={{ marginTop: 8 }}>
                            <a href={`mailto:${c.email}`} style={{
                              display: 'inline-flex', alignItems: 'center', gap: 5,
                              padding: '5px 10px', borderRadius: 7, textDecoration: 'none',
                              background: '#f8fafc', color: 'var(--text-2)', fontSize: 12, fontWeight: 600,
                              border: '1px solid var(--card-border)',
                            }}>
                              <Mail size={12} /> {c.email}
                            </a>
                          </div>
                        )}
                        {c.notes && (
                          <p style={{ margin: '8px 0 0', fontSize: 12, color: 'var(--text-3)', lineHeight: 1.4 }}>
                            {c.notes}
                          </p>
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: 6, flexShrink: 0, alignSelf: 'flex-start' }}>
                        <button
                          type="button"
                          title="Edit"
                          onClick={() => setModal(c)}
                          style={{
                            width: 32, height: 32, borderRadius: 8, border: '1px solid var(--card-border)',
                            background: '#dbeafe', color: '#2563eb', cursor: 'pointer', display: 'grid', placeItems: 'center',
                          }}
                        >
                          <Pencil size={13} />
                        </button>
                        <button
                          type="button"
                          title="Delete"
                          onClick={() => handleDelete(c)}
                          style={{
                            width: 32, height: 32, borderRadius: 8, border: '1px solid var(--card-border)',
                            background: '#fee2e2', color: '#b91c1c', cursor: 'pointer', display: 'grid', placeItems: 'center',
                          }}
                        >
                          <Trash2 size={13} />
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

      <style>{`
        @media (max-width: 780px) {
          .directory-layout {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </div>
  )
}
