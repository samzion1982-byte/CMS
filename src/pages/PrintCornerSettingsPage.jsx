import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Settings, ArrowLeft, Plus, Pencil, Trash2, Check, X, Loader2,
  Tags, FileText, Upload, GripVertical, ChevronUp, ChevronDown,
} from 'lucide-react'
import PageHeader from '../components/ui/PageHeader'
import { useToast } from '../lib/toast'
import {
  getPrintCornerCategories,
  savePrintCornerCategory,
  deactivatePrintCornerCategory,
  deletePrintCornerCategory,
  getPrintCornerTemplates,
  savePrintCornerTemplate,
  uploadPrintCornerTemplateDocx,
  normalizeTemplateVariables,
  TEMPLATE_TYPES,
} from '../lib/printCornerLib'

const INPUT = {
  height: 34, padding: '0 10px', border: '1.5px solid var(--card-border)',
  borderRadius: 7, fontSize: 13, background: 'var(--input-bg)', color: 'var(--text-1)',
  outline: 'none', boxSizing: 'border-box', width: '100%',
}

const TABS = [
  { id: 'categories', label: 'Categories', icon: Tags },
  { id: 'templates', label: 'Templates', icon: FileText },
]

function CategoriesPanel() {
  const toast = useToast()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(null)
  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState('')
  const [editingId, setEditingId] = useState(null)
  const [editName, setEditName] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setRows(await getPrintCornerCategories(false))
    } catch (e) {
      toast(e.message, 'error')
    }
    setLoading(false)
  }, [toast])

  useEffect(() => { load() }, [load])

  const topLevel = rows.filter(r => !r.parent_id).sort((a, b) => (a.sort_order - b.sort_order) || a.name.localeCompare(b.name))

  async function handleAdd() {
    if (!newName.trim()) return
    setBusy('add')
    try {
      const max = topLevel.reduce((m, r) => Math.max(m, r.sort_order || 0), 0)
      await savePrintCornerCategory({ name: newName.trim(), sort_order: max + 10 })
      toast('Category added.', 'success')
      setAdding(false); setNewName('')
      await load()
    } catch (e) { toast(e.message, 'error') }
    setBusy(null)
  }

  async function handleSave(row) {
    if (!editName.trim()) return
    setBusy(row.id)
    try {
      await savePrintCornerCategory({ ...row, name: editName.trim(), parent_id: row.parent_id || null })
      toast('Updated.', 'success')
      setEditingId(null)
      await load()
    } catch (e) { toast(e.message, 'error') }
    setBusy(null)
  }

  async function move(row, dir) {
    const list = [...topLevel]
    const idx = list.findIndex(r => r.id === row.id)
    const swapIdx = idx + dir
    if (swapIdx < 0 || swapIdx >= list.length) return
    setBusy(row.id)
    try {
      const other = list[swapIdx]
      await savePrintCornerCategory({ ...row, sort_order: other.sort_order })
      await savePrintCornerCategory({ ...other, sort_order: row.sort_order })
      await load()
    } catch (e) { toast(e.message, 'error') }
    setBusy(null)
  }

  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--card-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <p style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>Template categories</p>
          <p style={{ margin: 0, fontSize: 11, color: 'var(--text-3)' }}>Certificates, Letters, Forms — reorder with arrows</p>
        </div>
        {!adding && (
          <button type="button" onClick={() => setAdding(true)}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
            <Plus size={13} /> Add
          </button>
        )}
      </div>

      {adding && (
        <div style={{ display: 'flex', gap: 8, padding: '10px 16px', borderBottom: '1px solid var(--card-border)', background: 'var(--sidebar-item-active-bg)' }}>
          <input autoFocus value={newName} onChange={e => setNewName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleAdd(); if (e.key === 'Escape') setAdding(false) }}
            placeholder="New category name…" style={{ ...INPUT, flex: 1 }} />
          <button type="button" onClick={handleAdd} disabled={busy === 'add'} style={{ padding: '6px 12px', background: '#16a34a', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 700 }}>Add</button>
          <button type="button" onClick={() => setAdding(false)} style={{ padding: '6px 8px', border: '1px solid var(--card-border)', borderRadius: 6, background: 'none', cursor: 'pointer' }}><X size={13} /></button>
        </div>
      )}

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center' }}><Loader2 size={20} className="animate-spin" /></div>
      ) : topLevel.map((row, idx) => (
        <div key={row.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', borderBottom: '1px solid var(--card-border)', opacity: row.is_active ? 1 : 0.55 }}>
          <GripVertical size={13} style={{ color: 'var(--text-3)', opacity: 0.4 }} />
          {editingId === row.id ? (
            <>
              <input autoFocus value={editName} onChange={e => setEditName(e.target.value)} style={{ ...INPUT, flex: 1 }} />
              <button type="button" onClick={() => handleSave(row)} style={{ padding: '5px 7px', background: '#16a34a', border: 'none', borderRadius: 6, color: '#fff', cursor: 'pointer' }}><Check size={13} /></button>
              <button type="button" onClick={() => setEditingId(null)} style={{ padding: '5px 7px', border: '1px solid var(--card-border)', borderRadius: 6, background: 'none', cursor: 'pointer' }}><X size={13} /></button>
            </>
          ) : (
            <>
              <span style={{ flex: 1, fontWeight: 600, fontSize: 14 }}>{row.name}</span>
              {!row.is_active && <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 99, background: '#f1f5f9', color: '#64748b' }}>INACTIVE</span>}
              <button type="button" disabled={idx === 0 || busy === row.id} onClick={() => move(row, -1)} style={{ padding: 4, border: 'none', background: 'none', cursor: 'pointer', opacity: idx === 0 ? 0.3 : 1 }}><ChevronUp size={14} /></button>
              <button type="button" disabled={idx === topLevel.length - 1 || busy === row.id} onClick={() => move(row, 1)} style={{ padding: 4, border: 'none', background: 'none', cursor: 'pointer', opacity: idx === topLevel.length - 1 ? 0.3 : 1 }}><ChevronDown size={14} /></button>
              <button type="button" onClick={() => { setEditingId(row.id); setEditName(row.name) }} style={{ padding: '4px 6px', background: '#dbeafe', color: '#2563eb', border: 'none', borderRadius: 6, cursor: 'pointer' }}><Pencil size={11} /></button>
              <button type="button" onClick={async () => {
                setBusy(row.id)
                try {
                  if (row.is_active) await deactivatePrintCornerCategory(row.id)
                  else await savePrintCornerCategory({ ...row, is_active: true, parent_id: row.parent_id || null })
                  await load()
                } catch (e) { toast(e.message, 'error') }
                setBusy(null)
              }} style={{ padding: '4px 8px', fontSize: 10, fontWeight: 700, borderRadius: 6, border: '1px solid var(--card-border)', cursor: 'pointer' }}>
                {row.is_active ? 'Off' : 'On'}
              </button>
            </>
          )}
        </div>
      ))}
    </div>
  )
}

function TemplatesPanel() {
  const toast = useToast()
  const fileRef = useRef(null)
  const [categories, setCategories] = useState([])
  const [templates, setTemplates] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState(null)
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState(null)
  const [varRows, setVarRows] = useState([])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [cats, tpls] = await Promise.all([
        getPrintCornerCategories(true),
        getPrintCornerTemplates(false),
      ])
      setCategories(cats)
      setTemplates(tpls)
      if (!selectedId && tpls[0]) setSelectedId(tpls[0].id)
    } catch (e) {
      toast(e.message, 'error')
    }
    setLoading(false)
  }, [toast, selectedId])

  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const selected = templates.find(t => t.id === selectedId)
  const catName = id => categories.find(c => c.id === id)?.name || '—'

  useEffect(() => {
    if (!selected) { setForm(null); setVarRows([]); return }
    setForm({
      label: selected.label,
      description: selected.description || '',
      include_tamil: !!selected.include_tamil,
      is_active: selected.is_active !== false,
    })
    setVarRows(normalizeTemplateVariables(selected.variables).map(v => ({ key: v.key || '', label: v.label || v.key || '' })))
  }, [selectedId, selected])

  async function handleSaveMeta() {
    if (!selected || !form) return
    setBusy(true)
    try {
      await savePrintCornerTemplate({
        id: selected.id,
        label: form.label,
        description: form.description,
        include_tamil: form.include_tamil,
        is_active: form.is_active,
        variables: varRows.filter(v => v.key.trim()).map(v => ({ key: v.key.trim(), label: (v.label || v.key).trim() })),
      })
      toast('Template saved.', 'success')
      await load()
    } catch (e) { toast(e.message, 'error') }
    setBusy(false)
  }

  async function handleUpload(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !selected) return
    setBusy(true)
    try {
      const result = await uploadPrintCornerTemplateDocx(file, selected)
      const n = result.placeholders?.length || 0
      if (n) {
        setVarRows((result.variables || []).map(v => ({ key: v.key, label: v.label || v.key })))
        toast(`Word uploaded — ${n} field${n === 1 ? '' : 's'} captured for the wizard.`, 'success')
      } else {
        toast('Word uploaded, but no {placeholders} found. Add tags like {member_name} in Word and re-upload.', 'error')
      }
      await load()
    } catch (err) { toast(err.message, 'error') }
    setBusy(false)
  }

  if (loading) {
    return <div style={{ padding: 40, textAlign: 'center' }}><Loader2 size={20} className="animate-spin" /></div>
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: 16, alignItems: 'start' }}>
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--card-border)', fontSize: 12, fontWeight: 700, color: 'var(--text-3)' }}>TEMPLATES</div>
        {templates.map(t => (
          <button key={t.id} type="button" onClick={() => setSelectedId(t.id)}
            style={{
              display: 'block', width: '100%', textAlign: 'left', padding: '10px 14px', border: 'none',
              borderBottom: '1px solid var(--card-border)', cursor: 'pointer',
              background: selectedId === t.id ? 'var(--accent-subtle, #eff6ff)' : 'transparent',
              fontSize: 13,
            }}>
            <div style={{ fontWeight: 600 }}>{t.label}</div>
            <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{catName(t.category_id)} · {t.template_key}</div>
          </button>
        ))}
      </div>

      {selected && form ? (
        <div className="card" style={{ padding: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16, gap: 12, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{TEMPLATE_TYPES[selected.template_type]?.label} · {selected.template_key}</div>
            </div>
            <button type="button" disabled={busy} onClick={handleSaveMeta}
              style={{ padding: '8px 16px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 600, fontSize: 13, cursor: busy ? 'wait' : 'pointer' }}>
              Save template
            </button>
          </div>

          <div style={{ display: 'grid', gap: 12, marginBottom: 16 }}>
            <label style={{ fontSize: 12, fontWeight: 600 }}>Display label
              <input value={form.label} onChange={e => setForm(f => ({ ...f, label: e.target.value }))} style={{ ...INPUT, marginTop: 4 }} />
            </label>
            <label style={{ fontSize: 12, fontWeight: 600 }}>Description
              <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} style={{ ...INPUT, marginTop: 4 }} />
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
              <input type="checkbox" checked={form.include_tamil} onChange={e => setForm(f => ({ ...f, include_tamil: e.target.checked }))} />
              Optional Tamil block in wizard
            </label>
          </div>

          <div style={{ marginBottom: 16, padding: 14, borderRadius: 8, background: 'var(--input-bg)', border: '1px solid var(--card-border)' }}>
            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>Word template (.docx)</div>
            <div style={{ fontSize: 12, color: 'var(--text-2)', marginBottom: 10 }}>
              {selected.storage_path || <span style={{ color: '#c2410c' }}>Not uploaded yet</span>}
            </div>
            <input ref={fileRef} type="file" accept=".docx" className="hidden" onChange={handleUpload} />
            <button type="button" disabled={busy} onClick={() => fileRef.current?.click()}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', background: 'var(--card-bg)', border: '1.5px solid var(--card-border)', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
              <Upload size={14} /> Upload .docx
            </button>
            <p style={{ fontSize: 11, color: 'var(--text-3)', margin: '8px 0 0' }}>
              On upload, all {'{placeholders}'} in the Word file are detected automatically and become wizard fields.
            </p>
          </div>

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 700 }}>Wizard variables (from Word)</span>
              <button type="button" onClick={() => setVarRows(r => [...r, { key: '', label: '' }])}
                style={{ fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 6, border: '1px solid var(--card-border)', background: 'var(--card-bg)', cursor: 'pointer' }}>
                + Add field
              </button>
            </div>
            {varRows.length === 0 ? (
              <p style={{ fontSize: 12, color: 'var(--text-3)' }}>
                Upload a .docx with {'{tags}'} — fields appear here automatically. You can rename labels anytime.
              </p>
            ) : varRows.map((v, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 8, marginBottom: 8 }}>
                <input placeholder="key e.g. member_name" value={v.key} onChange={e => setVarRows(rows => rows.map((r, j) => j === i ? { ...r, key: e.target.value } : r))} style={INPUT} />
                <input placeholder="Label" value={v.label} onChange={e => setVarRows(rows => rows.map((r, j) => j === i ? { ...r, label: e.target.value } : r))} style={INPUT} />
                <button type="button" onClick={() => setVarRows(rows => rows.filter((_, j) => j !== i))} style={{ padding: '6px 8px', border: 'none', background: '#fee2e2', color: '#b91c1c', borderRadius: 6, cursor: 'pointer' }}><Trash2 size={13} /></button>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--text-3)' }}>Select a template</div>
      )}
    </div>
  )
}

export default function PrintCornerSettingsPage() {
  const navigate = useNavigate()
  const [tab, setTab] = useState('templates')

  return (
    <div className="page-container">
      <PageHeader icon={Settings} title="Print Corner Settings" subtitle="Categories and Word templates">
        <button type="button" onClick={() => navigate('/print-corner')}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', background: 'var(--card-bg)', border: '1.5px solid var(--card-border)', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', color: 'var(--text-2)' }}>
          <ArrowLeft size={14} /> Back
        </button>
      </PageHeader>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {TABS.map(t => {
          const Icon = t.icon
          const active = tab === t.id
          return (
            <button key={t.id} type="button" onClick={() => setTab(t.id)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px',
                borderRadius: 8, border: `1.5px solid ${active ? 'var(--accent)' : 'var(--card-border)'}`,
                background: active ? 'var(--accent-subtle, #eff6ff)' : 'var(--card-bg)',
                fontSize: 13, fontWeight: 600, cursor: 'pointer', color: active ? 'var(--accent)' : 'var(--text-2)',
              }}>
              <Icon size={14} /> {t.label}
            </button>
          )
        })}
      </div>

      {tab === 'categories' ? <CategoriesPanel /> : <TemplatesPanel />}
    </div>
  )
}
