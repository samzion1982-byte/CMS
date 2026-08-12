/* ═══════════════════════════════════════════════════════════════
   ChurchDocumentsVault — invoices / warranty docs
   Active → Archive after warranty period
   Master password only required when deleting
   ═══════════════════════════════════════════════════════════════ */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Lock, Eye, EyeOff, FileText, Plus, Loader2, X, Upload, Trash2,
  Settings, Search, Archive, RotateCcw, ExternalLink, File, ChevronRight,
} from 'lucide-react'
import { useToast } from '../../lib/toast'
import { useAuth } from '../../lib/AuthContext'
import MasterPasswordInput from '../MasterPasswordInput'
import { verifyMasterPassword } from '../../lib/masterPassword'
import {
  getChurchDocuments, getChurchDocumentCategories,
  saveChurchDocument, saveChurchDocumentCategory, deleteChurchDocument,
  setChurchDocumentStatus, archiveExpiredDocuments, isWarrantyExpired,
  flattenMasterOptions, masterDisplayName, buildMasterTree, getAllMasterDescendants,
  formatFileSize, formatDocDate,
} from '../../lib/churchDocumentsLib'

const INPUT = {
  height: 36, padding: '0 12px', border: '1.5px solid var(--card-border)',
  borderRadius: 8, fontSize: 13, background: 'var(--input-bg)',
  color: 'var(--text-1)', outline: 'none', boxSizing: 'border-box', width: '100%',
}

function MasterPasswordModal({ title, message, confirmLabel, onConfirm, onClose }) {
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [error, setError] = useState('')
  const [working, setWorking] = useState(false)
  const inputRef = useRef(null)
  useEffect(() => { setTimeout(() => inputRef.current?.focus(), 80) }, [])

  async function attempt() {
    setWorking(true)
    setError('')
    try {
      const ok = await verifyMasterPassword(password)
      if (!ok) {
        setError('Incorrect master password.')
        setPassword('')
        return
      }
      await onConfirm()
    } finally {
      setWorking(false)
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 2200, background: 'rgba(0,0,0,0.55)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
    }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        background: 'var(--card-bg)', borderRadius: 16, width: '100%', maxWidth: 400,
        boxShadow: '0 24px 60px rgba(0,0,0,0.25)', overflow: 'hidden',
      }}>
        <div style={{ padding: '20px 22px 8px', textAlign: 'center' }}>
          <div style={{
            width: 48, height: 48, borderRadius: 14, background: '#fee2e2',
            display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px',
          }}>
            <Lock size={20} color="#b91c1c" />
          </div>
          <p style={{ margin: '0 0 6px', fontSize: 16, fontWeight: 800 }}>{title}</p>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--text-3)', lineHeight: 1.45 }}>{message}</p>
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
              onKeyDown={e => { if (e.key === 'Enter') attempt() }}
              style={{ ...INPUT, paddingRight: 40 }}
            />
            <button type="button" onClick={() => setShowPw(s => !s)}
              style={{ position: 'absolute', right: 8, top: 6, border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-3)' }}>
              {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>
          {error && <p style={{ margin: '0 0 8px', fontSize: 12, color: '#b91c1c' }}>{error}</p>}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" onClick={onClose} style={{
              padding: '8px 14px', borderRadius: 8, border: '1.5px solid var(--card-border)',
              background: 'transparent', fontSize: 13, fontWeight: 600, cursor: 'pointer',
            }}>Cancel</button>
            <button type="button" onClick={attempt} disabled={working || !password} style={{
              padding: '8px 16px', borderRadius: 8, border: 'none', background: '#b91c1c', color: '#fff',
              fontSize: 13, fontWeight: 700, cursor: working ? 'wait' : 'pointer', opacity: working || !password ? 0.65 : 1,
              display: 'inline-flex', alignItems: 'center', gap: 6,
            }}>
              {working ? <Loader2 size={14} className="animate-spin" /> : null}
              {confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

async function resolveCategoryId(label, categories) {
  const want = String(label || '').trim()
  if (!want) return null
  const lower = want.toLowerCase()
  for (const c of categories) {
    if (masterDisplayName(c, categories).toLowerCase() === lower) return c.id
  }
  for (const c of categories) {
    if ((c.name || '').toLowerCase() === lower) return c.id
  }
  const leaf = lower.split(/[›>/|]/).map(s => s.trim()).filter(Boolean).pop()
  if (leaf) {
    for (const c of categories) {
      if ((c.name || '').toLowerCase() === leaf) return c.id
    }
  }
  // Create new top-level category from typed value
  const created = await saveChurchDocumentCategory({ name: want })
  return created.id
}

function DocFormModal({ editing, categories, onSave, onClose }) {
  const initialCat = editing?.category_id
    ? masterDisplayName(categories.find(c => c.id === editing.category_id), categories)
    : (editing?.category?.name || '')
  const [form, setForm] = useState(() => ({
    title: editing?.title || '',
    category: initialCat === '—' ? '' : initialCat,
    doc_date: editing?.doc_date || '',
    warranty_upto: editing?.warranty_upto || '',
    vendor: editing?.vendor || '',
    notes: editing?.notes || '',
    file: null,
  }))
  const [saving, setSaving] = useState(false)
  const toast = useToast()
  const catOpts = useMemo(
    () => flattenMasterOptions(categories.filter(c => c.is_active !== false)),
    [categories],
  )

  function set(k, v) { setForm(f => ({ ...f, [k]: v })) }

  async function submit(e) {
    e.preventDefault()
    if (!form.title.trim() && !form.file && !editing) {
      toast('Title or file is required.', 'error')
      return
    }
    if (!editing && !form.file) {
      toast('Choose a file to upload.', 'error')
      return
    }
    setSaving(true)
    try {
      const category_id = await resolveCategoryId(form.category, categories)
      await onSave({
        id: editing?.id || null,
        title: form.title.trim() || form.file?.name || editing?.title,
        category_id,
        doc_type: null,
        doc_date: form.doc_date || null,
        warranty_upto: form.warranty_upto || null,
        vendor: form.vendor,
        notes: form.notes,
        file: form.file,
      })
    } catch (err) {
      toast(err.message || 'Save failed.', 'error')
      setSaving(false)
      return
    }
    setSaving(false)
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 2100, background: 'rgba(15,23,42,0.45)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
    }} onClick={onClose}>
      <form
        className="card"
        onClick={e => e.stopPropagation()}
        onSubmit={submit}
        style={{ width: '100%', maxWidth: 520, padding: 0, overflow: 'hidden', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}
      >
        <div style={{
          padding: '14px 18px', borderBottom: '1px solid var(--card-border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div>
            <p style={{ margin: 0, fontSize: 15, fontWeight: 800 }}>{editing ? 'Edit Document' : 'Add Document'}</p>
            <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--text-3)' }}>
              Keep until warranty ends, then archive
            </p>
          </div>
          <button type="button" onClick={onClose} style={{
            width: 30, height: 30, borderRadius: 8, border: 'none', background: 'transparent',
            color: 'var(--text-3)', cursor: 'pointer', display: 'grid', placeItems: 'center',
          }}><X size={16} /></button>
        </div>

        <div style={{ padding: 18, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, marginBottom: 5 }}>Title *</label>
            <input style={INPUT} value={form.title} onChange={e => set('title', e.target.value)}
              placeholder="e.g. Keyboard purchase invoice" autoFocus />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, marginBottom: 5 }}>Category</label>
            <input
              style={INPUT}
              list="church-doc-categories"
              value={form.category}
              onChange={e => set('category', e.target.value)}
              placeholder="Select or type…"
              autoComplete="off"
            />
            <datalist id="church-doc-categories">
              {catOpts.map(c => (
                <option key={c.id} value={masterDisplayName(c, categories)} />
              ))}
            </datalist>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 700, marginBottom: 5 }}>Document date</label>
              <input style={INPUT} type="date" value={form.doc_date} onChange={e => set('doc_date', e.target.value)} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 700, marginBottom: 5 }}>Warranty until</label>
              <input style={INPUT} type="date" value={form.warranty_upto} onChange={e => set('warranty_upto', e.target.value)} />
              <p style={{ margin: '4px 0 0', fontSize: 10, color: 'var(--text-3)' }}>
                After this date the document moves to Archive
              </p>
            </div>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, marginBottom: 5 }}>Vendor / Shop</label>
            <input style={INPUT} value={form.vendor} onChange={e => set('vendor', e.target.value)}
              placeholder="Optional" />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, marginBottom: 5 }}>
              File {editing ? '(optional replace)' : '*'}
            </label>
            <label style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px',
              border: '1.5px dashed var(--card-border)', borderRadius: 8, cursor: 'pointer',
              background: 'var(--input-bg)', fontSize: 13, color: 'var(--text-2)',
            }}>
              <Upload size={15} />
              {form.file ? form.file.name : (editing?.file_name || 'Choose PDF / image / Office file…')}
              <input type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,image/*" hidden
                onChange={e => {
                  const f = e.target.files?.[0]
                  if (!f) return
                  set('file', f)
                  if (!form.title.trim()) set('title', f.name.replace(/\.[^.]+$/, ''))
                }} />
            </label>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, marginBottom: 5 }}>Notes</label>
            <textarea
              value={form.notes}
              onChange={e => set('notes', e.target.value)}
              rows={2}
              style={{ ...INPUT, height: 'auto', padding: '8px 12px', resize: 'vertical', fontFamily: 'inherit' }}
              placeholder="Optional notes / keywords"
            />
          </div>
        </div>

        <div style={{
          padding: '12px 18px', borderTop: '1px solid var(--card-border)',
          display: 'flex', justifyContent: 'flex-end', gap: 8,
        }}>
          <button type="button" onClick={onClose} style={{
            padding: '8px 14px', borderRadius: 8, border: '1.5px solid var(--card-border)',
            background: 'transparent', fontSize: 13, fontWeight: 600, cursor: 'pointer',
          }}>Cancel</button>
          <button type="submit" disabled={saving} style={{
            padding: '8px 16px', borderRadius: 8, border: 'none', background: '#0e7490', color: '#fff',
            fontSize: 13, fontWeight: 700, cursor: saving ? 'wait' : 'pointer',
            display: 'inline-flex', alignItems: 'center', gap: 6, opacity: saving ? 0.7 : 1,
          }}>
            {saving ? <Loader2 size={14} className="animate-spin" /> : null}
            {editing ? 'Save' : 'Upload'}
          </button>
        </div>
      </form>
    </div>
  )
}

function isPdf(doc) {
  return /pdf/i.test(doc?.mime_type || '') || /\.pdf$/i.test(doc?.file_name || '')
}
function isImage(doc) {
  return /^image\//i.test(doc?.mime_type || '') || /\.(jpe?g|png|gif|webp)$/i.test(doc?.file_name || '')
}

function categoryIdsIncluding(rootId, allRows) {
  if (!rootId) return []
  const kids = getAllMasterDescendants(rootId, allRows)
  return [rootId, ...kids.map(k => k.id)]
}

function CategoryNav({ tree, selectedId, counts, onSelect, allCount }) {
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
            background: active ? '#ecfeff' : 'transparent',
            color: active ? '#0e7490' : 'var(--text-1)',
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
              fontSize: 10, fontWeight: 700,
              color: active ? '#0e7490' : 'var(--text-3)',
              background: active ? 'rgba(14,116,144,0.12)' : 'var(--card-border)',
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '8px 8px 12px' }}>
      <button
        type="button"
        onClick={() => onSelect(null)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 6,
          padding: '8px 10px', border: 'none', borderRadius: 8, cursor: 'pointer',
          background: !selectedId ? '#ecfeff' : 'transparent',
          color: !selectedId ? '#0e7490' : 'var(--text-1)',
          fontWeight: 700, fontSize: 13, textAlign: 'left',
        }}
      >
        <span style={{ width: 16 }} />
        <span style={{ flex: 1 }}>All Documents</span>
        <span style={{
          fontSize: 10, fontWeight: 700,
          color: !selectedId ? '#0e7490' : 'var(--text-3)',
          background: !selectedId ? 'rgba(14,116,144,0.12)' : 'var(--card-border)',
          padding: '1px 6px', borderRadius: 99,
        }}>{allCount}</span>
      </button>
      {tree.map(n => <Node key={n.id} node={n} />)}
    </div>
  )
}

export default function ChurchDocumentsVault() {
  const navigate = useNavigate()
  const toast = useToast()
  const { profile } = useAuth()
  const actor = profile?.email || profile?.full_name || null

  const [statusTab, setStatusTab] = useState('active')
  const [docs, setDocs] = useState([])
  const [categories, setCategories] = useState([])
  const [categoryId, setCategoryId] = useState(null)
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [searchVal, setSearchVal] = useState('')
  const [selected, setSelected] = useState(null)
  const [modal, setModal] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const searchTimer = useRef(null)

  const catTree = useMemo(
    () => buildMasterTree(categories.filter(c => c.is_active !== false)),
    [categories],
  )

  const categoryCounts = useMemo(() => {
    const map = {}
    for (const cat of categories) {
      const ids = new Set(categoryIdsIncluding(cat.id, categories))
      map[cat.id] = docs.filter(d => d.category_id && ids.has(d.category_id)).length
    }
    return map
  }, [categories, docs])

  const filteredDocs = useMemo(() => {
    if (!categoryId) return docs
    const ids = new Set(categoryIdsIncluding(categoryId, categories))
    return docs.filter(d => d.category_id && ids.has(d.category_id))
  }, [docs, categoryId, categories])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      // Always run archive check (any tab) so expired warranties don't linger
      const n = await archiveExpiredDocuments(actor)
      if (n > 0 && statusTab === 'active') {
        toast(`${n} document(s) moved to Archive (warranty ended).`, 'success')
      }
      const [rows, cats] = await Promise.all([
        getChurchDocuments({ status: statusTab, search: searchVal }),
        getChurchDocumentCategories(false),
      ])
      setDocs(rows)
      setCategories(cats)
    } catch (e) {
      toast(e.message || 'Failed to load documents.', 'error')
    }
    setLoading(false)
  }, [statusTab, searchVal, actor, toast])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    setSelected(prev => {
      if (!filteredDocs.length) return null
      if (prev && filteredDocs.some(d => d.id === prev.id)) return prev
      return filteredDocs[0]
    })
  }, [filteredDocs])

  useEffect(() => {
    clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => setSearchVal(search), 280)
    return () => clearTimeout(searchTimer.current)
  }, [search])

  async function handleSave(payload) {
    await saveChurchDocument({ ...payload, created_by: actor })
    toast(payload.id ? 'Document updated.' : 'Document uploaded.', 'success')
    setModal(null)
    await load()
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    try {
      await deleteChurchDocument(deleteTarget.id, actor)
      toast('Document deleted (Recycle Bin).', 'success')
      setDeleteTarget(null)
      await load()
    } catch (e) {
      toast(e.message || 'Delete failed.', 'error')
    }
  }

  async function handleArchive(doc) {
    try {
      await setChurchDocumentStatus(doc.id, 'archived', actor)
      toast('Moved to Archive.', 'success')
      await load()
    } catch (e) {
      toast(e.message, 'error')
    }
  }

  async function handleRestore(doc) {
    try {
      await setChurchDocumentStatus(doc.id, 'active', actor)
      toast('Restored to Active.', 'success')
      await load()
    } catch (e) {
      toast(e.message, 'error')
    }
  }

  return (
    <div>
      <div style={{
        display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center',
        marginBottom: 14,
      }}>
        <div style={{
          display: 'inline-flex', padding: 3, borderRadius: 10, gap: 3,
          background: 'color-mix(in srgb, var(--sidebar-bg, #1e293b) 8%, #fff)',
          border: '1px solid var(--card-border)',
        }}>
          {[
            { id: 'active', label: 'Active', Icon: FileText },
            { id: 'archived', label: 'Archive', Icon: Archive },
          ].map(({ id, label, Icon }) => {
            const on = statusTab === id
            return (
              <button
                key={id}
                type="button"
                onClick={() => setStatusTab(id)}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '7px 12px', borderRadius: 8, border: 'none', cursor: 'pointer',
                  background: on ? '#0e7490' : 'transparent',
                  color: on ? '#fff' : 'var(--text-2)',
                  fontSize: 12, fontWeight: 700,
                }}
              >
                <Icon size={13} /> {label}
              </button>
            )
          })}
        </div>

        <div style={{ position: 'relative', flex: '1 1 180px', maxWidth: 280 }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: 11, color: 'var(--text-3)' }} />
          <input
            style={{ ...INPUT, paddingLeft: 32 }}
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search title, vendor, notes…"
          />
        </div>

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button
            type="button"
            onClick={() => navigate('/assets/settings?tab=doc-categories')}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 12px',
              borderRadius: 8, border: '1.5px solid var(--card-border)', background: 'var(--card-bg)',
              fontSize: 12, fontWeight: 600, cursor: 'pointer', color: 'var(--text-2)',
            }}
          >
            <Settings size={13} /> Categories
          </button>
          {statusTab === 'active' && (
            <button
              type="button"
              onClick={() => setModal({})}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px',
                borderRadius: 8, border: 'none', background: '#0e7490', color: '#fff',
                fontSize: 12, fontWeight: 700, cursor: 'pointer',
              }}
            >
              <Plus size={14} /> Add Document
            </button>
          )}
        </div>
      </div>

      <div className="card church-docs-layout" style={{
        padding: 0, overflow: 'hidden', minHeight: 420,
        display: 'grid',
        gridTemplateColumns: 'minmax(180px, 220px) minmax(220px, 1fr) minmax(280px, 1.25fr)',
      }}>
        {/* Categories */}
        <div style={{
          borderRight: '1px solid var(--card-border)',
          overflowY: 'auto', maxHeight: 560, background: '#fafbfc',
        }}>
          <div style={{
            padding: '10px 12px 6px', fontSize: 10, fontWeight: 800,
            textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-3)',
          }}>
            Categories
          </div>
          <CategoryNav
            tree={catTree}
            selectedId={categoryId}
            counts={categoryCounts}
            allCount={docs.length}
            onSelect={setCategoryId}
          />
        </div>

        {/* Document list */}
        <div style={{ borderRight: '1px solid var(--card-border)', overflowY: 'auto', maxHeight: 560 }}>
          <div style={{
            padding: '10px 12px 6px', fontSize: 10, fontWeight: 800,
            textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-3)',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <span>Documents</span>
            <span style={{ fontWeight: 700, letterSpacing: 0, textTransform: 'none' }}>
              {filteredDocs.length}
            </span>
          </div>
          {loading ? (
            <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-3)' }}>
              <Loader2 size={18} className="animate-spin" style={{ display: 'block', margin: '0 auto 8px' }} />
              Loading…
            </div>
          ) : filteredDocs.length === 0 ? (
            <div style={{ padding: 28, textAlign: 'center', color: 'var(--text-3)', fontSize: 12, lineHeight: 1.45 }}>
              {statusTab === 'active'
                ? (categoryId ? 'No documents in this category.' : 'No active documents yet.')
                : 'Archive is empty.'}
            </div>
          ) : (
            filteredDocs.map(doc => {
              const on = selected?.id === doc.id
              const expired = isWarrantyExpired(doc)
              const catLabel = doc.category_id
                ? masterDisplayName(categories.find(c => c.id === doc.category_id), categories)
                : (doc.category?.name || '')
              return (
                <button
                  key={doc.id}
                  type="button"
                  onClick={() => setSelected(doc)}
                  style={{
                    display: 'block', width: '100%', textAlign: 'left',
                    padding: '12px 14px', border: 'none', cursor: 'pointer',
                    borderBottom: '1px solid var(--card-border)',
                    background: on ? '#ecfeff' : 'transparent',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                    <FileText size={15} style={{ color: '#0e7490', marginTop: 2, flexShrink: 0 }} />
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: '#0f172a', lineHeight: 1.3 }}>
                        {doc.title}
                      </p>
                      {!categoryId && (
                        <p style={{ margin: '3px 0 0', fontSize: 11, color: 'var(--text-3)' }}>
                          {catLabel || '—'}
                        </p>
                      )}
                      <p style={{ margin: '2px 0 0', fontSize: 11, color: 'var(--text-3)' }}>
                        {doc.warranty_upto
                          ? `Warranty until ${formatDocDate(doc.warranty_upto)}`
                          : `Doc date ${formatDocDate(doc.doc_date)}`}
                      </p>
                      {statusTab === 'active' && expired && (
                        <span style={{
                          display: 'inline-block', marginTop: 4, fontSize: 10, fontWeight: 700,
                          padding: '1px 6px', borderRadius: 5, background: '#fff7ed', color: '#c2410c',
                        }}>
                          Warranty ended
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              )
            })
          )}
        </div>

        {/* Viewer */}
        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12, minHeight: 420 }}>
          <div style={{
            fontSize: 10, fontWeight: 800, textTransform: 'uppercase',
            letterSpacing: '0.06em', color: 'var(--text-3)',
          }}>
            Viewer
          </div>
          {selected ? (
            <>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>{selected.title}</p>
                  <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-3)' }}>
                    {[
                      selected.category_id
                        ? masterDisplayName(categories.find(c => c.id === selected.category_id), categories)
                        : null,
                      selected.vendor,
                    ].filter(Boolean).join(' · ')}
                    {selected.file_size != null ? ` · ${formatFileSize(selected.file_size)}` : ''}
                  </p>
                </div>
                {selected.file_url && (
                  <a href={selected.file_url} target="_blank" rel="noreferrer" style={{
                    display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 10px',
                    borderRadius: 7, border: '1px solid var(--card-border)', textDecoration: 'none',
                    fontSize: 12, fontWeight: 600, color: '#0e7490',
                  }}>
                    <ExternalLink size={13} /> Open
                  </a>
                )}
                {statusTab === 'active' && (
                  <button type="button" onClick={() => handleArchive(selected)} style={{
                    display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 10px',
                    borderRadius: 7, border: '1px solid #fed7aa', background: '#fff7ed',
                    fontSize: 12, fontWeight: 700, color: '#c2410c', cursor: 'pointer',
                  }}>
                    <Archive size={13} /> Archive
                  </button>
                )}
                {statusTab === 'archived' && (
                  <button type="button" onClick={() => handleRestore(selected)} style={{
                    display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 10px',
                    borderRadius: 7, border: '1px solid #bbf7d0', background: '#f0fdf4',
                    fontSize: 12, fontWeight: 700, color: '#15803d', cursor: 'pointer',
                  }}>
                    <RotateCcw size={13} /> To Active
                  </button>
                )}
                <button type="button" onClick={() => setModal(selected)} style={{
                  padding: '6px 10px', borderRadius: 7, border: '1px solid var(--card-border)',
                  background: 'transparent', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                }}>Edit</button>
                <button type="button" onClick={() => setDeleteTarget(selected)} style={{
                  padding: '6px 8px', borderRadius: 7, border: 'none', background: 'transparent',
                  color: '#b91c1c', cursor: 'pointer', display: 'grid', placeItems: 'center',
                }} title="Delete"><Trash2 size={14} /></button>
              </div>

              <div style={{
                flex: 1, borderRadius: 10, border: '1px solid var(--card-border)',
                background: '#f8fafc', overflow: 'hidden', minHeight: 280,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {selected.file_url && isImage(selected) ? (
                  <img src={selected.file_url} alt={selected.title}
                    style={{ maxWidth: '100%', maxHeight: 420, objectFit: 'contain' }} />
                ) : selected.file_url && isPdf(selected) ? (
                  <iframe title={selected.title} src={selected.file_url}
                    style={{ width: '100%', height: 420, border: 'none' }} />
                ) : (
                  <div style={{ textAlign: 'center', color: 'var(--text-3)', padding: 24 }}>
                    <File size={28} style={{ marginBottom: 8, opacity: 0.5 }} />
                    <p style={{ margin: 0, fontSize: 13 }}>{selected.file_name || 'File'}</p>
                    {selected.file_url && (
                      <a href={selected.file_url} target="_blank" rel="noreferrer"
                        style={{ fontSize: 12, color: '#0e7490', fontWeight: 600 }}>Open file</a>
                    )}
                  </div>
                )}
              </div>

              {selected.notes && (
                <p style={{ margin: 0, fontSize: 12, color: 'var(--text-2)', lineHeight: 1.45 }}>
                  {selected.notes}
                </p>
              )}
            </>
          ) : (
            <div style={{ margin: 'auto', color: 'var(--text-3)', fontSize: 13 }}>Select a document</div>
          )}
        </div>
      </div>

      <style>{`
        @media (max-width: 900px) {
          .church-docs-layout {
            grid-template-columns: 1fr !important;
          }
          .church-docs-layout > div {
            border-right: none !important;
            max-height: none !important;
          }
        }
      `}</style>

      {modal && (
        <DocFormModal
          editing={modal.id ? modal : null}
          categories={categories}
          onSave={handleSave}
          onClose={() => setModal(null)}
        />
      )}

      {deleteTarget && (
        <MasterPasswordModal
          title="Delete Document"
          message={`Delete “${deleteTarget.title}”? It can be restored from Recycle Bin.`}
          confirmLabel="Delete"
          onConfirm={confirmDelete}
          onClose={() => setDeleteTarget(null)}
        />
      )}
    </div>
  )
}
