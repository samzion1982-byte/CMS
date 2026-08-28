import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Settings, ArrowLeft, Plus, Pencil, Trash2, Check, X, Loader2,
  Tags, FileText, Upload, GripVertical, ChevronUp, ChevronDown, ClipboardList,
  BookOpen, Download,
} from 'lucide-react'
import PageHeader from '../components/ui/PageHeader'
import { useToast } from '../lib/toast'
import { useAuth } from '../lib/AuthContext'
import {
  getPrintCornerCategories,
  savePrintCornerCategory,
  deactivatePrintCornerCategory,
  deletePrintCornerCategory,
  countTemplatesInCategory,
  getPrintCornerTemplates,
  savePrintCornerTemplate,
  deletePrintCornerTemplate,
  uploadPrintCornerTemplateDocx,
  normalizeTemplateVariables,
  finalizeTemplateVariables,
  getChurchForPrintCorner,
  getOfficeBearerSignatureStatus,
  getPrintCornerApplicationForms,
  savePrintCornerApplicationForm,
  deletePrintCornerApplicationForm,
  uploadPrintCornerApplicationFormFile,
  getApplicationFormSignedUrl,
  previewPrintCornerTemplate,
  warmTemplatePreview,
  inferTemplateTypeFromCategory,
  resolveTemplateTypeDisplay,
  sortPrintCornerCategories,
  sortPrintCornerTemplates,
  buildPrintCornerSidebarBrowseItems,
  PRINT_CORNER_FORMS_SIDEBAR_ID,
  isPrintCornerFormCategoryName,
  PRINT_CORNER_PLACEHOLDER_GUIDE,
  downloadPrintCornerPlaceholderGuide,
  downloadChurchLetterPad,
} from '../lib/printCornerLib'
import MasterDeleteGate from '../components/printCorner/MasterDeleteGate'

const INPUT = {
  height: 34, padding: '0 10px', border: '1.5px solid var(--card-border)',
  borderRadius: 7, fontSize: 13, background: 'var(--input-bg)', color: 'var(--text-1)',
  outline: 'none', boxSizing: 'border-box', width: '100%',
}

const TABS = [
  { id: 'templates', label: 'Templates', icon: FileText },
  { id: 'categories', label: 'Categories', icon: Tags },
  { id: 'helpers', label: 'Helper Docs', icon: BookOpen },
]

const APP_FORMS_SIDEBAR_ID = PRINT_CORNER_FORMS_SIDEBAR_ID

function isFormCategoryName(name) {
  return isPrintCornerFormCategoryName(name)
}

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

  const topLevel = sortPrintCornerCategories(rows.filter(r => !r.parent_id))

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

  async function handleDelete(row) {
    setBusy(row.id)
    try {
      const n = await countTemplatesInCategory(row.id)
      const msg = n > 0
        ? `Delete category “${row.name}”? This also permanently deletes ${n} template${n === 1 ? '' : 's'} in it.`
        : `Delete category “${row.name}”?`
      if (!window.confirm(msg)) { setBusy(null); return }
      await deletePrintCornerCategory(row.id)
      toast('Category deleted.', 'success')
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
      ) : topLevel.length === 0 ? (
        <div style={{ padding: 24, fontSize: 13, color: 'var(--text-3)' }}>No categories yet.</div>
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
              <button type="button" onClick={() => { setEditingId(row.id); setEditName(row.name) }} title="Edit"
                style={{ padding: '4px 6px', background: '#dbeafe', color: '#2563eb', border: 'none', borderRadius: 6, cursor: 'pointer' }}><Pencil size={11} /></button>
              <button type="button" disabled={busy === row.id} onClick={() => handleDelete(row)} title="Delete category"
                style={{ padding: '4px 6px', background: '#fee2e2', color: '#b91c1c', border: 'none', borderRadius: 6, cursor: 'pointer' }}><Trash2 size={11} /></button>
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
  const blankFileRef = useRef(null)
  const [categories, setCategories] = useState([])
  const [templates, setTemplates] = useState([])
  const [blankForms, setBlankForms] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState(null)
  const [selectedBlankId, setSelectedBlankId] = useState(null)
  const [activeCategoryId, setActiveCategoryId] = useState(null)
  const browseSeededRef = useRef(false)
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState(null)
  const [blankForm, setBlankForm] = useState(null)
  const [varRows, setVarRows] = useState([])
  const [adding, setAdding] = useState(false)
  const [newTpl, setNewTpl] = useState({ category_id: '', label: '' })
  const [newBlankLabel, setNewBlankLabel] = useState('')
  const [blankPreviewUrl, setBlankPreviewUrl] = useState(null)
  const [tplPreviewUrl, setTplPreviewUrl] = useState(null)
  const [tplPreviewLoading, setTplPreviewLoading] = useState(false)
  const [tplPreviewError, setTplPreviewError] = useState(null)
  const [tplPreviewCached, setTplPreviewCached] = useState(false)
  const [tplPreviewTick, setTplPreviewTick] = useState(0)
  const [tplPreviewForce, setTplPreviewForce] = useState(false)
  const [church, setChurch] = useState(null)
  const [deletePrompt, setDeletePrompt] = useState(null) // { kind: 'template'|'form', item }

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [cats, tpls, forms, churchRow] = await Promise.all([
        getPrintCornerCategories(false),
        getPrintCornerTemplates(false),
        getPrintCornerApplicationForms(false).catch(() => []),
        getChurchForPrintCorner().catch(() => null),
      ])

      // Remove legacy mail-merge "form" templates (blank scanned forms replace them)
      const legacyForms = (tpls || []).filter(t => t.template_type === 'form')
      for (const t of legacyForms) {
        try {
          await deletePrintCornerTemplate(t.id, t.storage_path)
        } catch { /* ignore */ }
      }
      const cleaned = (tpls || []).filter(t => t.template_type !== 'form')

      setCategories(cats)
      setTemplates(cleaned)
      setBlankForms(forms || [])
      setChurch(churchRow)
      setSelectedId(prev => {
        if (prev && cleaned.some(t => t.id === prev)) return prev
        return null
      })
      setSelectedBlankId(prev => {
        if (prev && (forms || []).some(f => f.id === prev)) return prev
        return (forms || [])[0]?.id || null
      })
    } catch (e) {
      toast(e.message, 'error')
    }
    setLoading(false)
  }, [toast])

  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const mergeCategories = useMemo(
    () => sortPrintCornerCategories(
      categories.filter(c => !c.parent_id && !isFormCategoryName(c.name)),
    ),
    [categories],
  )

  const activeMergeCategories = useMemo(
    () => mergeCategories.filter(c => c.is_active),
    [mergeCategories],
  )

  const grouped = useMemo(() => {
    const groups = mergeCategories.map(c => ({
      category: c,
      templates: sortPrintCornerTemplates(
        templates.filter(t => t.category_id === c.id),
      ),
    }))
    const known = new Set(mergeCategories.map(c => c.id))
    const orphans = templates.filter(t => !known.has(t.category_id))
    if (orphans.length) {
      groups.push({
        category: { id: '__unassigned', name: 'Unassigned (fix category)', is_active: true },
        templates: orphans,
      })
    }
    return groups
  }, [mergeCategories, templates])

  const sidebarBrowseItems = useMemo(() => {
    const templateCountByCategoryId = {}
    for (const g of grouped) {
      if (g.category.id !== '__unassigned') {
        templateCountByCategoryId[g.category.id] = g.templates.length
      }
    }
    return buildPrintCornerSidebarBrowseItems(categories, {
      templateCountByCategoryId,
      blankFormsCount: blankForms.length,
      activeOnly: false,
    })
  }, [categories, grouped, blankForms.length])

  const isAppFormsMode = activeCategoryId === APP_FORMS_SIDEBAR_ID
  const selected = templates.find(t => t.id === selectedId)
  const selectedBlank = blankForms.find(f => f.id === selectedBlankId) || null

  useEffect(() => {
    if (!sidebarBrowseItems.length || browseSeededRef.current) return
    browseSeededRef.current = true
    setActiveCategoryId(sidebarBrowseItems[0].id)
  }, [sidebarBrowseItems])

  useEffect(() => {
    if (isAppFormsMode) return
    if (!sidebarBrowseItems.length) return
    setActiveCategoryId(prev => {
      if (prev && sidebarBrowseItems.some(i => i.id === prev)) return prev
      if (selected?.category_id && sidebarBrowseItems.some(i => i.id === selected.category_id)) {
        return selected.category_id
      }
      const firstTemplates = sidebarBrowseItems.find(i => !i.isForms)
      return firstTemplates?.id || sidebarBrowseItems[0]?.id || APP_FORMS_SIDEBAR_ID
    })
  }, [sidebarBrowseItems, selected?.category_id, isAppFormsMode])

  const activeGroup = useMemo(
    () => grouped.find(g => g.category.id === activeCategoryId) || null,
    [grouped, activeCategoryId],
  )

  const sidebarTemplates = activeGroup?.templates || []

  useEffect(() => {
    if (!selected || isAppFormsMode) {
      if (!isAppFormsMode) { setForm(null); setVarRows([]) }
      return
    }
    setForm({
      label: selected.label,
      category_id: selected.category_id || '',
      is_active: selected.is_active !== false,
    })
    setVarRows(finalizeTemplateVariables(
      normalizeTemplateVariables(selected.variables).map(v => v.key),
      selected.variables,
    ).map(v => ({ key: v.key || '', label: v.label || v.key || '' })))
    if (selected.category_id) setActiveCategoryId(selected.category_id)
  }, [selectedId, selected, isAppFormsMode])

  useEffect(() => {
    if (!selectedBlank) { setBlankForm(null); return }
    setBlankForm({
      label: selectedBlank.label || '',
      description: selectedBlank.description || '',
      is_active: selectedBlank.is_active !== false,
      sort_order: selectedBlank.sort_order ?? 0,
    })
  }, [selectedBlank?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!selectedBlank?.storage_path) {
      setBlankPreviewUrl(null)
      return
    }
    let cancelled = false
    setBlankPreviewUrl(null)
    ;(async () => {
      try {
        const url = await getApplicationFormSignedUrl(selectedBlank.storage_path)
        if (!cancelled) setBlankPreviewUrl(url)
      } catch {
        if (!cancelled) setBlankPreviewUrl(null)
      }
    })()
    return () => { cancelled = true }
  }, [selectedBlank?.id, selectedBlank?.storage_path])

  useEffect(() => {
    if (isAppFormsMode || !selected?.storage_path) {
      setTplPreviewUrl(null)
      setTplPreviewLoading(false)
      setTplPreviewError(null)
      setTplPreviewCached(false)
      return
    }
    let cancelled = false
    const force = tplPreviewForce
    setTplPreviewLoading(true)
    setTplPreviewError(null)
    if (force) setTplPreviewUrl(null)
    ;(async () => {
      try {
        const res = await previewPrintCornerTemplate(selected, church, { force })
        if (!cancelled) {
          setTplPreviewUrl(res.signed_url || null)
          setTplPreviewCached(!!res.cached)
        }
      } catch (e) {
        if (!cancelled) setTplPreviewError(e.message || 'Preview failed')
      } finally {
        if (!cancelled) {
          setTplPreviewLoading(false)
          setTplPreviewForce(false)
        }
      }
    })()
    return () => { cancelled = true }
  }, [selected?.id, selected?.storage_path, isAppFormsMode, church, tplPreviewTick]) // eslint-disable-line react-hooks/exhaustive-deps

  function refreshTplPreview() {
    setTplPreviewForce(true)
    setTplPreviewTick(t => t + 1)
  }

  async function handleSaveMeta() {
    if (!selected || !form) return
    if (!form.category_id) {
      toast('Choose a category for this template.', 'error')
      return
    }
    setBusy(true)
    try {
      await savePrintCornerTemplate({
        id: selected.id,
        label: form.label,
        category_id: form.category_id,
        is_active: form.is_active,
        variables: finalizeTemplateVariables(
          varRows.filter(v => v.key.trim()).map(v => v.key.trim()),
          varRows.filter(v => v.key.trim()).map(v => ({ key: v.key.trim(), label: (v.label || v.key).trim() })),
        ),
      })
      toast('Template saved.', 'success')
      await load()
    } catch (e) { toast(e.message, 'error') }
    setBusy(false)
  }

  async function confirmDelete() {
    if (!deletePrompt) return
    setBusy(true)
    try {
      if (deletePrompt.kind === 'template') {
        const t = deletePrompt.item
        await deletePrintCornerTemplate(t.id, t.storage_path)
        if (selectedId === t.id) setSelectedId(null)
        toast('Template deleted.', 'success')
      } else {
        const f = deletePrompt.item
        await deletePrintCornerApplicationForm(f.id, f.storage_path)
        if (selectedBlankId === f.id) setSelectedBlankId(null)
        toast('Deleted.', 'success')
      }
      await load()
    } catch (e) {
      toast(e.message, 'error')
      throw e
    } finally {
      setBusy(false)
    }
  }

  async function handleDeleteTemplate() {
    if (!selected) return
    setDeletePrompt({ kind: 'template', item: selected })
  }

  async function handleDeleteBlankForm() {
    if (!selectedBlank) return
    setDeletePrompt({ kind: 'form', item: selectedBlank })
  }

  async function handleAddTemplate() {
    if (!newTpl.category_id) { toast('Choose a category.', 'error'); return }
    if (!newTpl.label.trim()) { toast('Enter a display label.', 'error'); return }
    const key = newTpl.label.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
      || `template-${Date.now()}`
    const cat = mergeCategories.find(c => c.id === newTpl.category_id)
    const catName = String(cat?.name || '')
    const templateType = inferTemplateTypeFromCategory(catName)

    setBusy(true)
    try {
      const max = templates.filter(t => t.category_id === newTpl.category_id).reduce((m, t) => Math.max(m, t.sort_order || 0), 0)
      let uniqueKey = key
      const existing = new Set(templates.map(t => t.template_key))
      let n = 2
      while (existing.has(uniqueKey)) {
        uniqueKey = `${key}-${n}`
        n += 1
      }
      const row = await savePrintCornerTemplate({
        category_id: newTpl.category_id,
        label: newTpl.label.trim(),
        template_key: uniqueKey,
        template_type: templateType,
        sort_order: max + 10,
        variables: [],
        is_active: true,
      })
      toast('Template created.', 'success')
      setAdding(false)
      setNewTpl({ category_id: '', label: '' })
      await load()
      setSelectedId(row.id)
      setActiveCategoryId(row.category_id)
    } catch (e) { toast(e.message, 'error') }
    setBusy(false)
  }

  async function handleAddBlankForm() {
    if (!newBlankLabel.trim()) return
    setBusy(true)
    try {
      const max = blankForms.reduce((m, r) => Math.max(m, r.sort_order || 0), 0)
      const row = await savePrintCornerApplicationForm({
        label: newBlankLabel.trim(),
        sort_order: max + 10,
        is_active: true,
      })
      toast('Form added — upload the scanned PDF or JPEG next.', 'success')
      setAdding(false)
      setNewBlankLabel('')
      await load()
      setSelectedBlankId(row.id)
      setActiveCategoryId(APP_FORMS_SIDEBAR_ID)
    } catch (e) {
      toast(e.message, 'error')
    }
    setBusy(false)
  }

  async function handleSaveBlankForm() {
    if (!selectedBlank || !blankForm) return
    setBusy(true)
    try {
      await savePrintCornerApplicationForm({
        id: selectedBlank.id,
        form_key: selectedBlank.form_key,
        label: blankForm.label,
        description: blankForm.description,
        is_active: blankForm.is_active,
        sort_order: blankForm.sort_order,
        storage_path: selectedBlank.storage_path,
        file_name: selectedBlank.file_name,
        mime_type: selectedBlank.mime_type,
        file_size: selectedBlank.file_size,
      })
      toast('Saved.', 'success')
      await load()
    } catch (e) {
      toast(e.message, 'error')
    }
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
        toast(`Uploaded — ${n} field${n === 1 ? '' : 's'} captured for the wizard.`, 'success')
      } else {
        toast('Uploaded, but no {placeholders} found. Add tags like {member_name} and re-upload.', 'error')
      }
      await load()
      // Rebuild cached preview.pdf in the background, then refresh the panel
      warmTemplatePreview(result.template || selected, church)
      setTplPreviewForce(true)
      setTplPreviewTick(t => t + 1)
    } catch (err) { toast(err.message, 'error') }
    setBusy(false)
  }

  async function handleBlankUpload(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !selectedBlank) return
    setBusy(true)
    try {
      await uploadPrintCornerApplicationFormFile(file, selectedBlank)
      toast('Blank form uploaded to repository.', 'success')
      await load()
    } catch (err) {
      toast(err.message || 'Upload failed', 'error')
    }
    setBusy(false)
  }

  if (loading) {
    return <div style={{ padding: 40, textAlign: 'center' }}><Loader2 size={20} className="animate-spin" /></div>
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: 16, alignItems: 'start' }}>
      {isAppFormsMode ? (
        selectedBlank && blankForm ? (
          <div className="card" style={{ padding: 20 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', marginBottom: 6, letterSpacing: '0.06em' }}>
              SCANNED APPLICATION FORM
            </div>
            <p style={{ fontSize: 13, color: 'var(--text-2)', margin: '0 0 16px', lineHeight: 1.5 }}>
              Upload the printed blank form (PDF or JPEG). Staff print or share it as-is — no mail-merge.
            </p>
            <div style={{ display: 'grid', gap: 12, maxWidth: 480, marginBottom: 18 }}>
              <label style={{ fontSize: 12, fontWeight: 600 }}>
                Display label
                <input value={blankForm.label} onChange={e => setBlankForm(f => ({ ...f, label: e.target.value }))} style={{ ...INPUT, marginTop: 4 }} />
              </label>
              <label style={{ fontSize: 12, fontWeight: 600 }}>
                Notes (optional)
                <input value={blankForm.description} onChange={e => setBlankForm(f => ({ ...f, description: e.target.value }))} style={{ ...INPUT, marginTop: 4 }} placeholder="e.g. For office + parents" />
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                <input type="checkbox" checked={blankForm.is_active} onChange={e => setBlankForm(f => ({ ...f, is_active: e.target.checked }))} />
                Active (visible in Print Corner)
              </label>
            </div>
            <div style={{
              padding: 14, borderRadius: 10, marginBottom: 16,
              background: selectedBlank.storage_path ? '#f0fdf4' : '#fff7ed',
              border: `1px solid ${selectedBlank.storage_path ? '#bbf7d0' : '#fed7aa'}`,
            }}>
              <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Repository file</div>
              <div style={{ fontSize: 12, color: 'var(--text-2)', marginBottom: 10, wordBreak: 'break-all' }}>
                {selectedBlank.storage_path
                  ? `${selectedBlank.file_name || selectedBlank.storage_path}${selectedBlank.file_size ? ` · ${(selectedBlank.file_size / 1024).toFixed(0)} KB` : ''}`
                  : 'Not uploaded yet'}
              </div>
              <input ref={blankFileRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/*" onChange={handleBlankUpload} style={{ display: 'none' }} />
              <button type="button" disabled={busy} onClick={() => blankFileRef.current?.click()}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', background: '#7c3aed', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                {busy ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                {selectedBlank.storage_path ? 'Replace file' : 'Upload PDF / JPEG'}
              </button>
            </div>

            {selectedBlank.storage_path && (
              <div style={{
                marginBottom: 16, borderRadius: 10, overflow: 'hidden',
                border: '1px solid var(--card-border)', background: '#f8fafc',
              }}>
                <div style={{
                  padding: '8px 12px', fontSize: 11, fontWeight: 700, color: 'var(--text-3)',
                  borderBottom: '1px solid var(--card-border)', letterSpacing: '0.04em', textTransform: 'uppercase',
                }}>
                  Preview
                </div>
                {!blankPreviewUrl ? (
                  <div style={{ padding: 28, textAlign: 'center', color: 'var(--text-3)' }}>
                    <Loader2 size={16} className="animate-spin" style={{ display: 'inline' }} /> Loading preview…
                  </div>
                ) : (() => {
                  const hint = `${selectedBlank.mime_type || ''} ${selectedBlank.storage_path || ''} ${selectedBlank.file_name || ''}`.toLowerCase()
                  const pdf = hint.includes('pdf')
                  return pdf ? (
                    <iframe title="Form preview" src={blankPreviewUrl} style={{ display: 'block', width: '100%', height: 360, border: 'none', background: '#fff' }} />
                  ) : (
                    <div style={{ display: 'flex', justifyContent: 'center', padding: 12, maxHeight: 360, overflow: 'auto' }}>
                      <img src={blankPreviewUrl} alt={selectedBlank.label} style={{ maxWidth: '100%', maxHeight: 340, objectFit: 'contain' }} />
                    </div>
                  )
                })()}
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button type="button" disabled={busy} onClick={handleSaveBlankForm}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                {busy ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                Save
              </button>
              <button type="button" disabled={busy} onClick={handleDeleteBlankForm}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', background: '#fee2e2', color: '#b91c1c', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                <Trash2 size={14} /> Delete
              </button>
            </div>
          </div>
        ) : (
          <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--text-3)' }}>
            Select a blank form, or add one.
          </div>
        )
      ) : selected && form ? (
        <div className="card" style={{ padding: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16, gap: 12, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{resolveTemplateTypeDisplay(selected, activeGroup?.category?.name).label} · {selected.template_key}</div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" disabled={busy} onClick={handleDeleteTemplate}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 12px', background: '#fee2e2', color: '#b91c1c', border: 'none', borderRadius: 8, fontWeight: 600, fontSize: 13, cursor: busy ? 'wait' : 'pointer' }}>
                <Trash2 size={14} /> Delete
              </button>
              <button type="button" disabled={busy} onClick={handleSaveMeta}
                style={{ padding: '8px 16px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 600, fontSize: 13, cursor: busy ? 'wait' : 'pointer' }}>
                Save template
              </button>
            </div>
          </div>

          <div style={{ display: 'grid', gap: 12, marginBottom: 16 }}>
            <label style={{ fontSize: 12, fontWeight: 600 }}>Category
              <select value={form.category_id} onChange={e => setForm(f => ({ ...f, category_id: e.target.value }))} style={{ ...INPUT, marginTop: 4 }}>
                <option value="">Select category…</option>
                {mergeCategories.map(c => (
                  <option key={c.id} value={c.id}>{c.name}{c.is_active === false ? ' (inactive)' : ''}</option>
                ))}
              </select>
            </label>
            <label style={{ fontSize: 12, fontWeight: 600 }}>Display label
              <input value={form.label} onChange={e => setForm(f => ({ ...f, label: e.target.value }))} style={{ ...INPUT, marginTop: 4 }} />
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
              <input type="checkbox" checked={form.is_active} onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))} />
              Active (show in Print Corner)
            </label>
          </div>

          <div style={{ marginBottom: 16, padding: 14, borderRadius: 8, background: 'var(--input-bg)', border: '1px solid var(--card-border)' }}>
            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>Template file (.docx or .pptx)</div>
            <div style={{ fontSize: 12, color: 'var(--text-2)', marginBottom: 10 }}>
              {selected.storage_path || <span style={{ color: '#c2410c' }}>Not uploaded yet</span>}
            </div>
            <input ref={fileRef} type="file" accept=".docx,.pptx" className="hidden" onChange={handleUpload} />
            <button type="button" disabled={busy} onClick={() => fileRef.current?.click()}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', background: 'var(--card-bg)', border: '1.5px solid var(--card-border)', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
              <Upload size={14} /> Upload .docx / .pptx
            </button>
            <p style={{ fontSize: 11, color: 'var(--text-3)', margin: '8px 0 0' }}>
              Canva → PowerPoint works. Detects {'{placeholders}'} and picture Alt Text like {'{presbyter_sign}'} or {'{member_photo}'} (ID cards).
            </p>
          </div>

          {selected.storage_path && (
            <div style={{
              marginBottom: 16, borderRadius: 10, overflow: 'hidden',
              border: '1px solid var(--card-border)', background: '#f8fafc',
            }}>
              <div style={{
                padding: '8px 12px', fontSize: 11, fontWeight: 700, color: 'var(--text-3)',
                borderBottom: '1px solid var(--card-border)', letterSpacing: '0.04em', textTransform: 'uppercase',
                display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center',
              }}>
                <span>Template preview</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontWeight: 600, textTransform: 'none', letterSpacing: 0 }}>
                    {tplPreviewCached ? 'Cached' : 'Sample data · not issued'}
                  </span>
                  <button type="button" disabled={tplPreviewLoading} onClick={refreshTplPreview}
                    style={{
                      fontSize: 11, fontWeight: 700, textTransform: 'none', letterSpacing: 0,
                      padding: '3px 8px', borderRadius: 6, border: '1px solid var(--card-border)',
                      background: 'var(--card-bg)', color: 'var(--text-2)', cursor: tplPreviewLoading ? 'wait' : 'pointer',
                    }}>
                    Refresh
                  </button>
                </span>
              </div>
              {tplPreviewLoading ? (
                <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-3)', fontSize: 13, lineHeight: 1.5 }}>
                  <Loader2 size={16} className="animate-spin" style={{ display: 'inline' }} />
                  <div style={{ marginTop: 8 }}>Loading preview…</div>
                  <div style={{ fontSize: 11, marginTop: 4 }}>First load builds a cache; later opens are much faster.</div>
                </div>
              ) : tplPreviewError ? (
                <div style={{ padding: 14, fontSize: 13, color: '#b91c1c', lineHeight: 1.45 }}>{tplPreviewError}</div>
              ) : tplPreviewUrl ? (
                <iframe
                  title={`Preview — ${selected.label}`}
                  src={tplPreviewUrl}
                  style={{ display: 'block', width: '100%', height: 360, border: 'none', background: '#fff' }}
                />
              ) : null}
            </div>
          )}

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 700 }}>Wizard variables</span>
              <button type="button" onClick={() => setVarRows(r => [...r, { key: '', label: '' }])}
                style={{ fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 6, border: '1px solid var(--card-border)', background: 'var(--card-bg)', cursor: 'pointer' }}>
                + Add field
              </button>
            </div>
            {varRows.length === 0 ? (
              <p style={{ fontSize: 12, color: 'var(--text-3)' }}>
                Upload a .docx or .pptx with {'{tags}'} — fields appear here automatically.
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

      <div className="card pc-sidebar-panel" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="pc-sidebar-panel__header" style={{ padding: '12px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-3)' }}>BY CATEGORY</span>
          <button type="button" onClick={() => {
            setAdding(true)
            if (!isAppFormsMode) {
              setNewTpl(n => ({ ...n, category_id: n.category_id || activeCategoryId || activeMergeCategories[0]?.id || '' }))
            }
          }}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 8px', background: isAppFormsMode ? '#7c3aed' : 'var(--accent)', color: '#fff', border: 'none', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
            <Plus size={12} /> Add
          </button>
        </div>

        {adding && (
          <div style={{ padding: 12, borderBottom: '1px solid var(--card-border)', background: 'var(--sidebar-item-active-bg)', display: 'grid', gap: 8 }}>
            {isAppFormsMode ? (
              <>
                <input placeholder="e.g. Baptism information form" value={newBlankLabel}
                  onChange={e => setNewBlankLabel(e.target.value)} style={INPUT}
                  onKeyDown={e => { if (e.key === 'Enter') handleAddBlankForm() }} />
                <div style={{ display: 'flex', gap: 6 }}>
                  <button type="button" disabled={busy} onClick={handleAddBlankForm}
                    style={{ flex: 1, padding: '6px 10px', background: '#16a34a', color: '#fff', border: 'none', borderRadius: 6, fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>Create</button>
                  <button type="button" onClick={() => { setAdding(false); setNewBlankLabel('') }}
                    style={{ padding: '6px 8px', border: '1px solid var(--card-border)', borderRadius: 6, background: 'none', cursor: 'pointer' }}><X size={13} /></button>
                </div>
              </>
            ) : (
              <>
                <select value={newTpl.category_id} onChange={e => setNewTpl(f => ({ ...f, category_id: e.target.value }))} style={INPUT}>
                  <option value="">Category…</option>
                  {activeMergeCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <input placeholder="Display label" value={newTpl.label} onChange={e => setNewTpl(f => ({ ...f, label: e.target.value }))} style={INPUT} />
                <div style={{ display: 'flex', gap: 6 }}>
                  <button type="button" disabled={busy} onClick={handleAddTemplate} style={{ flex: 1, padding: '6px 10px', background: '#16a34a', color: '#fff', border: 'none', borderRadius: 6, fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>Create</button>
                  <button type="button" onClick={() => setAdding(false)} style={{ padding: '6px 8px', border: '1px solid var(--card-border)', borderRadius: 6, background: 'none', cursor: 'pointer' }}><X size={13} /></button>
                </div>
              </>
            )}
          </div>
        )}

        <div className="pc-sidebar-panel__category" style={{ padding: '10px 12px', borderBottom: '1px solid var(--card-border)' }}>
          <label style={{ display: 'block', fontSize: 10, fontWeight: 800, letterSpacing: '0.07em', color: 'var(--text-3)', marginBottom: 6 }}>
            CATEGORY
          </label>
          <select
            value={activeCategoryId || sidebarBrowseItems[0]?.id || APP_FORMS_SIDEBAR_ID}
            onChange={e => {
              const v = e.target.value
              setActiveCategoryId(v)
              setAdding(false)
              if (v === APP_FORMS_SIDEBAR_ID) {
                setSelectedId(null)
                setSelectedBlankId(null)
              } else {
                setSelectedBlankId(null)
              }
            }}
            style={{ ...INPUT, cursor: 'pointer', fontWeight: 600 }}
          >
            {sidebarBrowseItems.map(item => (
              <option key={item.categoryId} value={item.id}>
                {item.name} ({item.count}){item.isActive === false ? ' — inactive' : ''}
              </option>
            ))}
          </select>
        </div>

        <div className="pc-sidebar-list">
        {isAppFormsMode ? (
          blankForms.length === 0 ? (
            <div style={{ padding: 20, fontSize: 12, color: 'var(--text-3)' }}>
              No blank forms yet. Add one and upload the scanned PDF or JPEG.
            </div>
          ) : blankForms.map(f => (
            <div
              key={f.id}
              className={`pc-sidebar-row pc-sidebar-row--compact${selectedBlankId === f.id ? ' is-active' : ''}`}
              style={{
                '--pc-accent': '#7c3aed',
                '--pc-active-bg': '#f5f3ff',
                opacity: f.is_active === false ? 0.55 : 1,
              }}
            >
              <button type="button" className="pc-sidebar-select" onClick={() => setSelectedBlankId(f.id)}>
                <span className="pc-sidebar-label">{f.label}</span>
                <span className="pc-sidebar-sub">
                  {f.storage_path ? (f.mime_type?.includes('pdf') ? 'PDF' : 'Image') : 'File not uploaded'}
                </span>
              </button>
              <button
                type="button"
                className="pc-sidebar-delete"
                title="Delete form (master password)"
                onClick={() => setDeletePrompt({ kind: 'form', item: f })}
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))
        ) : sidebarTemplates.length === 0 ? (
          <div style={{ padding: 20, fontSize: 12, color: 'var(--text-3)' }}>
            {grouped.length === 0 ? 'No templates yet. Add one under a category.' : 'No templates in this category.'}
          </div>
        ) : sidebarTemplates.map(t => (
          <div
            key={t.id}
            className={`pc-sidebar-row pc-sidebar-row--compact${selectedId === t.id ? ' is-active' : ''}`}
            style={{
              '--pc-accent': 'var(--accent)',
              '--pc-active-bg': 'var(--accent-subtle, #eff6ff)',
              opacity: t.is_active === false ? 0.55 : 1,
            }}
          >
            <button type="button" className="pc-sidebar-select" onClick={() => setSelectedId(t.id)}>
              <span className="pc-sidebar-label">{t.label}</span>
              <span className="pc-sidebar-sub">{t.template_key}</span>
            </button>
            <button
              type="button"
              className="pc-sidebar-delete"
              title="Delete template (master password)"
              onClick={() => setDeletePrompt({ kind: 'template', item: t })}
            >
              <Trash2 size={13} />
            </button>
          </div>
        ))}
        </div>
      </div>

      <MasterDeleteGate
        open={!!deletePrompt}
        title={deletePrompt?.kind === 'form' ? 'Delete application form' : 'Delete template'}
        message={
          deletePrompt
            ? `Enter the master password to permanently delete “${deletePrompt.item?.label}”. This cannot be undone.`
            : ''
        }
        onConfirm={confirmDelete}
        onClose={() => setDeletePrompt(null)}
      />
    </div>
  )
}


function HelperDocsPanel() {
  const navigate = useNavigate()
  const toast = useToast()
  const { profile } = useAuth()
  const isSuperAdmin = profile?.role === 'super_admin'
  const [church, setChurch] = useState(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(null)

  useEffect(() => {
    ;(async () => {
      try {
        setChurch(await getChurchForPrintCorner())
      } catch (e) {
        toast(e.message, 'error')
      } finally {
        setLoading(false)
      }
    })()
  }, [toast])

  async function handleLetterPad() {
    setBusy('pad')
    try {
      await downloadChurchLetterPad(church)
      toast('Opening church letter pad…', 'success')
    } catch (e) {
      toast(e.message || 'Letter pad not available', 'error')
    } finally {
      setBusy(null)
    }
  }

  function handlePlaceholderGuide() {
    try {
      downloadPrintCornerPlaceholderGuide({ churchName: church?.church_name || '' })
      toast('Placeholder guide downloaded.', 'success')
    } catch (e) {
      toast(e.message || 'Could not download guide', 'error')
    }
  }

  const hasPad = !!church?.letter_pad_url
  const padMime = church?.letter_pad_mime_type || ''
  const padName = church?.letter_pad_file_name || ''
  const padIsImage = String(padMime).startsWith('image/') && !/photoshop/i.test(padMime) && !/\.psd$/i.test(padName)
  const padIsPdf = String(padMime).includes('pdf') || /\.pdf$/i.test(padName)
  const padExt = (() => {
    const n = String(padName || '')
    if (n.includes('.')) return n.split('.').pop().toUpperCase()
    if (padIsImage) return 'IMG'
    if (padIsPdf) return 'PDF'
    if (/word|docx?/i.test(padMime + padName)) return 'DOCX'
    return 'FILE'
  })()
  const sigStatus = getOfficeBearerSignatureStatus(church)
  const allSigsReady = sigStatus.every(s => s.ready)

  return (
    <div style={{ display: 'grid', gap: 16, maxWidth: 920 }}>
      <div className="card" style={{ padding: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>Office bearer signatures</div>
            <p style={{ fontSize: 13, color: 'var(--text-2)', margin: '0 0 14px', lineHeight: 1.55, maxWidth: 640 }}>
              Status of signature images used in letters. In Word, set picture Alt Text to{' '}
              <code style={{ fontSize: 12 }}>{'{presbyter_sign}'}</code>
              {' '}(or secretary_sign / treasurer_sign). Uploads are managed in Church Setup.
            </p>
          </div>
          {isSuperAdmin && (
            <button
              type="button"
              onClick={() => navigate('/church-setup')}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px',
                background: '#7c3aed', color: '#fff', border: 'none', borderRadius: 8,
                fontSize: 13, fontWeight: 600, cursor: 'pointer', flexShrink: 0,
              }}
            >
              Open Church Setup
            </button>
          )}
        </div>

        {loading ? (
          <Loader2 size={18} className="animate-spin" />
        ) : (
          <>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 14 }}>
              {sigStatus.map(s => (
                <div key={s.role} style={{
                  width: 120, padding: 12, borderRadius: 8, border: '1px solid var(--card-border)',
                  background: s.ready ? '#f0fdf4' : '#fef2f2', textAlign: 'center',
                }}>
                  <div style={{
                    height: 56, marginBottom: 8, borderRadius: 6, background: '#fff',
                    border: '1px dashed var(--card-border)', display: 'flex', alignItems: 'center',
                    justifyContent: 'center', overflow: 'hidden',
                  }}>
                    {s.url
                      ? <img src={s.url} alt={s.role} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                      : <span style={{ fontSize: 10, color: 'var(--text-3)' }}>Missing</span>}
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 700 }}>{s.role}</div>
                  <div style={{ fontSize: 10, color: s.ready ? '#16a34a' : '#dc2626', fontWeight: 600 }}>
                    {s.ready ? 'Ready' : 'Not uploaded'}
                  </div>
                </div>
              ))}
            </div>
            <div style={{
              padding: 12, borderRadius: 8, fontSize: 12, lineHeight: 1.5,
              background: allSigsReady ? '#f0fdf4' : '#fff7ed',
              border: `1px solid ${allSigsReady ? '#bbf7d0' : '#fed7aa'}`,
              color: 'var(--text-2)',
            }}>
              {allSigsReady
                ? 'All three signature images are stored. Use Alt Text {presbyter_sign} on a sized placeholder image in Word.'
                : isSuperAdmin
                  ? 'Some signatures are missing. Open Church Setup → Print Corner — Signature images, then Save.'
                  : 'Some signatures are missing. Ask a super admin to upload them in Church Setup.'}
            </div>
          </>
        )}
      </div>

      <div className="card" style={{ padding: 20 }}>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>Church letter pad</div>
        <p style={{ fontSize: 13, color: 'var(--text-2)', margin: '0 0 14px', lineHeight: 1.55 }}>
          Download the scanned blank letter pad uploaded in Church Setup. Use it as a visual reference
          when designing Word / PowerPoint / Canva templates for letters and certificates.
        </p>
        {loading ? (
          <Loader2 size={18} className="animate-spin" />
        ) : (
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{
              width: 140, height: 110, borderRadius: 8,
              border: hasPad ? '1.5px solid #5eead4' : '1px dashed var(--card-border)',
              background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center',
              overflow: 'hidden', position: 'relative', flexShrink: 0,
            }}>
              {hasPad && padIsImage ? (
                <img src={church.letter_pad_url} alt="Letter pad" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', padding: 4 }} />
              ) : hasPad && padIsPdf ? (
                <>
                  <object
                    data={`${church.letter_pad_url}#page=1&toolbar=0&navpanes=0&scrollbar=0`}
                    type="application/pdf"
                    style={{ width: '100%', height: '100%', pointerEvents: 'none' }}
                    aria-label="Letter pad PDF"
                  >
                    <span style={{ fontSize: 11, color: 'var(--text-3)', textAlign: 'center', padding: 8 }}>{padExt} on file</span>
                  </object>
                  <span style={{
                    position: 'absolute', top: 4, right: 4, background: '#0f766e', color: '#fff',
                    fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 4,
                  }}>On file</span>
                </>
              ) : hasPad ? (
                <div style={{ textAlign: 'center', padding: 8 }}>
                  <span style={{
                    display: 'inline-block', fontSize: 10, fontWeight: 700, letterSpacing: '0.04em',
                    background: '#ccfbf1', color: '#0f766e', padding: '2px 8px', borderRadius: 4, marginBottom: 6,
                  }}>{padExt}</span>
                  <div style={{ fontSize: 10, color: 'var(--text-2)', lineHeight: 1.3, maxWidth: 110, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {padName || 'Uploaded'}
                  </div>
                  <span style={{
                    position: 'absolute', top: 4, right: 4, background: '#0f766e', color: '#fff',
                    fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 4,
                  }}>On file</span>
                </div>
              ) : (
                <span style={{ fontSize: 11, color: 'var(--text-3)', textAlign: 'center', padding: 8 }}>
                  Not uploaded
                </span>
              )}
            </div>
            <div style={{ flex: 1, minWidth: 200 }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
                {hasPad ? (church.letter_pad_file_name || 'Church letter pad') : 'No letter pad yet'}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 10 }}>
                {hasPad
                  ? (church.letter_pad_mime_type || 'Ready to download')
                  : isSuperAdmin
                    ? 'Upload it in Church Setup → Print Corner — Church letter pad.'
                    : 'Ask a super admin to upload the letter pad in Church Setup.'}
              </div>
              <button
                type="button"
                disabled={!hasPad || busy === 'pad'}
                onClick={handleLetterPad}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px',
                  background: hasPad ? '#0f766e' : 'var(--input-bg)', color: hasPad ? '#fff' : 'var(--text-3)',
                  border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600,
                  cursor: hasPad ? 'pointer' : 'not-allowed',
                }}
              >
                {busy === 'pad' ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                Download letter pad
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="card" style={{ padding: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start', marginBottom: 10 }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>Placeholder field list</div>
            <p style={{ fontSize: 13, color: 'var(--text-2)', margin: 0, lineHeight: 1.55, maxWidth: 640 }}>
              Use these tags in Word / PowerPoint / Canva when building certificates, letters, and ID cards.
              Text tags go in the document body; image tags go in the picture Alt Text.
              Church name, presbyter/pastor, secretary, treasurer, diocese, and address auto-fill from Church Setup.
            </p>
          </div>
          <button
            type="button"
            onClick={handlePlaceholderGuide}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px',
              background: '#2563eb', color: '#fff', border: 'none', borderRadius: 8,
              fontSize: 13, fontWeight: 600, cursor: 'pointer', flexShrink: 0,
            }}
          >
            <Download size={14} /> Download guide (HTML)
          </button>
        </div>

        <div style={{ display: 'grid', gap: 14, marginTop: 8 }}>
          {PRINT_CORNER_PLACEHOLDER_GUIDE.map(group => (
            <div key={group.id} style={{ border: '1px solid var(--card-border)', borderRadius: 10, overflow: 'hidden' }}>
              <div style={{ padding: '10px 12px', background: 'var(--input-bg)', borderBottom: '1px solid var(--card-border)' }}>
                <div style={{ fontSize: 13, fontWeight: 700 }}>{group.title}</div>
                {group.hint && (
                  <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2, lineHeight: 1.4 }}>{group.hint}</div>
                )}
              </div>
              <div style={{ maxHeight: 220, overflow: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ textAlign: 'left', color: 'var(--text-3)' }}>
                      <th style={{ padding: '8px 12px', fontWeight: 700 }}>Placeholder</th>
                      <th style={{ padding: '8px 12px', fontWeight: 700 }}>Meaning</th>
                      <th style={{ padding: '8px 12px', fontWeight: 700 }}>Example</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.items.map(it => (
                      <tr key={it.key} style={{ borderTop: '1px solid var(--card-border)' }}>
                        <td style={{ padding: '7px 12px', fontFamily: 'ui-monospace, Consolas, monospace', color: '#1d4ed8', whiteSpace: 'nowrap' }}>
                          {`{${it.key}}`}
                        </td>
                        <td style={{ padding: '7px 12px', color: 'var(--text-1)' }}>{it.label}</td>
                        <td style={{ padding: '7px 12px', color: 'var(--text-3)' }}>{it.example}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default function PrintCornerSettingsPage() {
  const navigate = useNavigate()
  const [tab, setTab] = useState('templates')

  return (
    <div className="page-container">
      <PageHeader icon={Settings} title="Print Corner Settings" subtitle="Templates, categories, and helper docs">
        <button type="button" onClick={() => navigate('/print-corner')}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', background: 'var(--card-bg)', border: '1.5px solid var(--card-border)', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', color: 'var(--text-2)' }}>
          <ArrowLeft size={14} /> Back
        </button>
      </PageHeader>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
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

      {tab === 'categories' && <CategoriesPanel />}
      {tab === 'templates' && <TemplatesPanel />}
      {tab === 'helpers' && <HelperDocsPanel />}
    </div>
  )
}
