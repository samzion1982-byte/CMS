/* ═══════════════════════════════════════════════════════════════
   SimpleCategoriesPage.jsx — Manage income / expense categories
   ═══════════════════════════════════════════════════════════════ */

import { useState, useEffect, useCallback, useRef } from 'react'
import { Tag, Plus, Pencil, Trash2, Check, X, ArrowLeft, Loader2, Sparkles, Download, Upload, FileSpreadsheet, AlertCircle } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useToast } from '../lib/toast'
import {
  getSimpleCategories, createSimpleCategory, updateSimpleCategory, deactivateSimpleCategory,
  getCategoryUsageCounts, seedDefaultSimpleCategories, deduplicateSimpleCategories,
} from '../lib/simpleAccountsLib'
import {
  downloadCategoryTemplate, readAndParseCategoryFile, importParsedCategories,
} from '../lib/simpleCategoryImport'

const inputStyle = {
  height: 36, padding: '0 10px', border: '1.5px solid var(--card-border)',
  borderRadius: 7, fontSize: 13, background: 'var(--input-bg)', color: 'var(--text-1)',
  outline: 'none', boxSizing: 'border-box', width: '100%',
}

function buildTree(cats) {
  const parents = cats.filter(c => !c.parent_id)
  const byParent = {}
  cats.filter(c => c.parent_id).forEach(c => {
    if (!byParent[c.parent_id]) byParent[c.parent_id] = []
    byParent[c.parent_id].push(c)
  })
  return { parents, byParent }
}

function InlineEdit({ value, onSave, onCancel }) {
  const [val, setVal] = useState(value)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px', borderBottom: '1px solid var(--card-border)', background: 'var(--sidebar-item-active-bg)' }}>
      <input autoFocus value={val} onChange={e => setVal(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') onSave(val.trim()); if (e.key === 'Escape') onCancel() }}
        style={{ ...inputStyle, flex: 1 }} />
      <button onClick={() => onSave(val.trim())} style={{ padding: '5px 7px', background: '#16a34a', border: 'none', borderRadius: 6, cursor: 'pointer', color: '#fff', display: 'flex' }}><Check size={13} /></button>
      <button onClick={onCancel} style={{ padding: '5px 7px', background: 'none', border: '1px solid var(--card-border)', borderRadius: 6, cursor: 'pointer', color: 'var(--text-3)', display: 'flex' }}><X size={13} /></button>
    </div>
  )
}

function CatRow({ cat, usageCount, isChild, type, onEdit, onDelete }) {
  const isIncome = type === 'income'
  const color    = isIncome ? '#16a34a' : '#dc2626'
  const bg       = isIncome ? '#dcfce7' : '#fee2e2'
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: isChild ? '9px 16px 9px 42px' : '11px 16px',
      borderBottom: '1px solid var(--card-border)',
      background: isChild ? 'rgba(0,0,0,0.018)' : 'transparent',
    }}>
      {isChild
        ? <span style={{ fontSize: 13, color: 'var(--text-3)', flexShrink: 0, lineHeight: 1 }}>↳</span>
        : <div style={{ width: 28, height: 28, borderRadius: 7, background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Tag size={12} color={color} />
          </div>
      }
      <span style={{ flex: 1, fontSize: isChild ? 13 : 14, color: 'var(--text-1)', fontWeight: isChild ? 400 : 500 }}>{cat.name}</span>
      {cat.is_default && (
        <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 99, background: 'var(--sidebar-item-active-bg)', color: 'var(--text-3)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
          DEFAULT
        </span>
      )}
      <span style={{ fontSize: 11, color: 'var(--text-3)', minWidth: 52, textAlign: 'right' }}>
        {usageCount ? `${usageCount} txn${usageCount > 1 ? 's' : ''}` : 'unused'}
      </span>
      <div style={{ display: 'flex', gap: 4 }}>
        <button onClick={onEdit} title="Rename" style={{ padding: '4px 6px', background: 'none', border: '1px solid var(--card-border)', borderRadius: 6, cursor: 'pointer', color: 'var(--text-3)', display: 'flex' }}>
          <Pencil size={11} />
        </button>
        <button onClick={onDelete} title="Delete" style={{ padding: '4px 6px', background: 'none', border: '1px solid var(--card-border)', borderRadius: 6, cursor: 'pointer', color: usageCount > 0 ? '#9ca3af' : '#dc2626', display: 'flex' }}>
          <Trash2 size={11} />
        </button>
      </div>
    </div>
  )
}

function AddRow({ type, parentId, onAdded }) {
  const [open,   setOpen]   = useState(false)
  const [name,   setName]   = useState('')
  const [saving, setSaving] = useState(false)
  const toast = useToast()
  const color = type === 'income' ? '#16a34a' : '#dc2626'

  async function handleAdd() {
    if (!name.trim()) return
    setSaving(true)
    try {
      await createSimpleCategory({ name: name.trim(), type, is_default: false, sort_order: 99, parent_id: parentId || null })
      toast(parentId ? 'Sub-category added' : 'Category added', 'success')
      setName(''); setOpen(false); onAdded()
    } catch (e) { toast('Failed: ' + e.message, 'error') }
    setSaving(false)
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)}
        style={{
          display: 'flex', alignItems: 'center', gap: 6, width: '100%',
          padding: parentId ? '7px 16px 7px 42px' : '9px 16px',
          background: 'none', border: 'none', cursor: 'pointer',
          color: parentId ? 'var(--text-3)' : color,
          fontSize: 12, fontWeight: parentId ? 400 : 600,
          borderBottom: '1px solid var(--card-border)',
        }}>
        <Plus size={12} />
        {parentId ? 'Add sub-category' : `Add ${type} category`}
      </button>
    )
  }

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      padding: parentId ? '8px 16px 8px 42px' : '8px 16px',
      borderBottom: '1px solid var(--card-border)',
      background: 'var(--sidebar-item-active-bg)',
    }}>
      <input autoFocus value={name} onChange={e => setName(e.target.value)}
        placeholder={parentId ? 'Sub-category name…' : (type === 'income' ? 'e.g. Rental Income' : 'e.g. Food & Catering')}
        onKeyDown={e => { if (e.key === 'Enter') handleAdd(); if (e.key === 'Escape') setOpen(false) }}
        style={{ ...inputStyle, flex: 1 }} />
      <button onClick={handleAdd} disabled={saving || !name.trim()}
        style={{ padding: '5px 10px', background: color, color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>
        {saving ? '…' : 'Add'}
      </button>
      <button onClick={() => setOpen(false)} style={{ padding: '5px 7px', background: 'none', border: '1px solid var(--card-border)', borderRadius: 6, cursor: 'pointer', color: 'var(--text-3)', display: 'flex' }}>
        <X size={13} />
      </button>
    </div>
  )
}

export default function SimpleCategoriesPage() {
  const toast    = useToast()
  const navigate = useNavigate()
  const [incomes,  setIncomes]  = useState([])
  const [expenses, setExpenses] = useState([])
  const [usage,    setUsage]    = useState({})
  const [loading,  setLoading]  = useState(true)
  const [seeding,         setSeeding]         = useState(false)
  const [deduping,        setDeduping]        = useState(false)
  const [templateLoading, setTemplateLoading] = useState(false)
  const [importPreview,   setImportPreview]   = useState(null)  // { income, expense } parsed rows
  const [importing,       setImporting]       = useState(false)
  const [editId,          setEditId]          = useState(null)
  const [deleteId,        setDeleteId]        = useState(null)
  const importFileRef = useRef(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [cats, counts] = await Promise.all([getSimpleCategories(), getCategoryUsageCounts()])
      setIncomes(cats.filter(c => c.type === 'income'))
      setExpenses(cats.filter(c => c.type === 'expense'))
      setUsage(counts)
    } catch (e) { toast('Failed to load: ' + e.message, 'error') }
    setLoading(false)
  }, [toast])

  useEffect(() => { load() }, [load])

  async function handleDeduplicate() {
    setDeduping(true)
    try {
      const removed = await deduplicateSimpleCategories()
      toast(removed > 0 ? `Cleaned up ${removed} duplicate categor${removed === 1 ? 'y' : 'ies'}.` : 'No duplicates found.', 'success')
      load()
    } catch (e) { toast('Failed: ' + e.message, 'error') }
    setDeduping(false)
  }

  async function handleDownloadTemplate() {
    setTemplateLoading(true)
    try {
      await downloadCategoryTemplate()
    } catch (e) { toast('Failed to generate template: ' + e.message, 'error') }
    setTemplateLoading(false)
  }

  async function handleImportFileChosen(e) {
    const file = e.target.files?.[0]
    if (importFileRef.current) importFileRef.current.value = ''
    if (!file) return
    try {
      const result = await readAndParseCategoryFile(file)
      if (!result.valid) { toast(result.errors[0], 'error'); return }
      setImportPreview({ income: result.income, expense: result.expense })
    } catch (e) { toast('Failed to read file: ' + e.message, 'error') }
  }

  async function handleConfirmImport() {
    if (!importPreview) return
    setImporting(true)
    try {
      const { added, skipped } = await importParsedCategories(importPreview.income, importPreview.expense)
      const msg = skipped > 0
        ? `Imported ${added} categor${added === 1 ? 'y' : 'ies'}. ${skipped} already existed and were skipped.`
        : `Imported ${added} categor${added === 1 ? 'y' : 'ies'} successfully.`
      toast(msg, 'success')
      setImportPreview(null)
      load()
    } catch (e) { toast('Import failed: ' + e.message, 'error') }
    setImporting(false)
  }

  async function handleSeedDefaults() {
    setSeeding(true)
    try {
      const { added, skipped } = await seedDefaultSimpleCategories()
      if (added === 0) {
        toast('All starter categories already exist — nothing new was added.', 'info')
      } else {
        const msg = skipped > 0
          ? `Added ${added} starter categor${added === 1 ? 'y' : 'ies'}. ${skipped} already existed and were skipped.`
          : `Added ${added} starter categor${added === 1 ? 'y' : 'ies'}.`
        toast(msg, 'success')
      }
      load()
    } catch (e) { toast('Failed: ' + e.message, 'error') }
    setSeeding(false)
  }

  async function handleRename(id, newName) {
    if (!newName) { toast('Name cannot be empty', 'error'); return }
    try {
      await updateSimpleCategory(id, { name: newName })
      toast('Renamed', 'success')
      setEditId(null); load()
    } catch (e) { toast('Failed: ' + e.message, 'error') }
  }

  async function handleDelete(id) {
    const count = usage[id] || 0
    if (count > 0) { toast(`${count} transaction(s) use this category. Reassign them first.`, 'error'); setDeleteId(null); return }
    const allCats = [...incomes, ...expenses]
    const children = allCats.filter(c => c.parent_id === id)
    const childInUse = children.some(c => (usage[c.id] || 0) > 0)
    if (childInUse) { toast('A sub-category has transactions. Reassign them first.', 'error'); setDeleteId(null); return }
    try {
      for (const child of children) await deactivateSimpleCategory(child.id)
      await deactivateSimpleCategory(id)
      toast('Category removed', 'success')
      setDeleteId(null); load()
    } catch (e) { toast('Failed: ' + e.message, 'error') }
  }

  function CatSection({ title, cats, type, color }) {
    const { parents, byParent } = buildTree(cats)
    const allCats = [...incomes, ...expenses]
    return (
      <div className="card" style={{ overflow: 'hidden', flex: 1, minWidth: 300 }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--card-border)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 28, height: 28, borderRadius: 7, background: type === 'income' ? '#dcfce7' : '#fee2e2', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Tag size={13} color={color} />
          </div>
          <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)', margin: 0 }}>{title}</p>
          <span style={{ fontSize: 12, color: 'var(--text-3)', marginLeft: 4 }}>({cats.length})</span>
        </div>
        <div>
          {loading
            ? [1,2,3].map(i => <div key={i} className="loading-skeleton" style={{ margin: '10px 16px', height: 36, borderRadius: 6 }} />)
            : parents.map(parent => {
                const children = byParent[parent.id] || []
                const childCount = children.length
                return (
                  <div key={parent.id}>
                    {editId === parent.id
                      ? <InlineEdit value={parent.name} onSave={n => handleRename(parent.id, n)} onCancel={() => setEditId(null)} />
                      : <CatRow cat={parent} usageCount={usage[parent.id] || 0} isChild={false} type={type}
                          onEdit={() => setEditId(parent.id)} onDelete={() => setDeleteId(parent.id)} />
                    }
                    {children.map(sub => (
                      editId === sub.id
                        ? <InlineEdit key={sub.id} value={sub.name} onSave={n => handleRename(sub.id, n)} onCancel={() => setEditId(null)} />
                        : <CatRow key={sub.id} cat={sub} usageCount={usage[sub.id] || 0} isChild type={type}
                            onEdit={() => setEditId(sub.id)} onDelete={() => setDeleteId(sub.id)} />
                    ))}
                    <AddRow type={type} parentId={parent.id} onAdded={load} />
                  </div>
                )
              })
          }
        </div>
        <AddRow type={type} parentId={null} onAdded={load} />
      </div>
    )
  }

  const allCats = [...incomes, ...expenses]
  const deleteChildren = allCats.filter(c => c.parent_id === deleteId)

  return (
    <div className="page-container simple-accounts-scope">
      <div className="page-header">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button onClick={() => navigate('/simple-accounts')} title="Back to Money Book"
              style={{ display: 'flex', alignItems: 'center', padding: '7px 10px', background: 'var(--card-bg)', border: '1.5px solid var(--card-border)', borderRadius: 8, cursor: 'pointer', color: 'var(--text-2)', flexShrink: 0 }}>
              <ArrowLeft size={16} />
            </button>
            <div>
              <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Tag size={20} style={{ color: 'var(--accent)' }} /> Categories
              </h1>
              <p className="page-subtitle">Organise income and expenses — use sub-categories to group related items</p>
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button onClick={handleSeedDefaults} disabled={seeding}
            style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 14px', background: 'var(--card-bg)', border: '1.5px solid var(--card-border)', borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: seeding ? 'not-allowed' : 'pointer', color: 'var(--text-2)', whiteSpace: 'nowrap', opacity: seeding ? 0.6 : 1 }}
            title="Insert commonly used church income and expense categories">
            {seeding ? <Loader2 size={14} style={{ animation: 'spin .7s linear infinite' }} /> : <Sparkles size={14} />}
            {seeding ? 'Loading…' : 'Load Starter'}
          </button>
          <button onClick={handleDownloadTemplate} disabled={templateLoading}
            style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 14px', background: 'var(--card-bg)', border: '1.5px solid var(--card-border)', borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: templateLoading ? 'not-allowed' : 'pointer', color: 'var(--text-2)', whiteSpace: 'nowrap', opacity: templateLoading ? 0.6 : 1 }}
            title="Download Excel template for importing categories">
            {templateLoading ? <Loader2 size={14} style={{ animation: 'spin .7s linear infinite' }} /> : <Download size={14} />}
            Template
          </button>
          <button onClick={() => importFileRef.current?.click()}
            style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 14px', background: '#16a34a', color: '#fff', border: 'none', borderRadius: 9, fontSize: 13, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}
            title="Import categories from a filled-in Excel template">
            <FileSpreadsheet size={14} /> Import from Excel
          </button>
          <input ref={importFileRef} type="file" accept=".xlsx" style={{ display: 'none' }} onChange={handleImportFileChosen} />
        </div>
      </div>

      {!loading && incomes.length === 0 && expenses.length === 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 20, padding: '20px 24px', background: 'var(--card-bg)', border: '1.5px dashed var(--card-border)', borderRadius: 12, marginBottom: 20 }}>
          <div style={{ width: 48, height: 48, borderRadius: 12, background: '#f0fdf4', border: '1.5px solid #86efac', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Sparkles size={22} color="#16a34a" />
          </div>
          <div style={{ flex: 1 }}>
            <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-1)', margin: '0 0 3px' }}>No categories yet</p>
            <p style={{ fontSize: 12, color: 'var(--text-3)', margin: 0, lineHeight: 1.55 }}>
              Load 10 income and 15 expense categories commonly used by churches — you can rename or remove any of them afterwards.
            </p>
          </div>
          <button onClick={handleSeedDefaults} disabled={seeding}
            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 20px', background: '#16a34a', color: '#fff', border: 'none', borderRadius: 9, fontSize: 13, fontWeight: 700, cursor: seeding ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}>
            {seeding ? <Loader2 size={14} style={{ animation: 'spin .7s linear infinite' }} /> : <Sparkles size={14} />}
            {seeding ? 'Loading…' : 'Load Starter Categories'}
          </button>
        </div>
      )}

      {/* Duplicate warning banner */}
      {!loading && (() => {
        const allCats = [...incomes, ...expenses]
        const seen = new Set()
        let hasDupes = false
        for (const c of allCats) {
          const key = `${c.type}|${c.name.toLowerCase()}`
          if (seen.has(key)) { hasDupes = true; break }
          seen.add(key)
        }
        if (!hasDupes) return null
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '14px 20px', background: '#fffbeb', border: '1.5px solid #fcd34d', borderRadius: 12, marginBottom: 20 }}>
            <AlertCircle size={20} color="#d97706" style={{ flexShrink: 0 }} />
            <div style={{ flex: 1 }}>
              <p style={{ fontSize: 13, fontWeight: 700, color: '#92400e', margin: '0 0 2px' }}>Duplicate categories detected</p>
              <p style={{ fontSize: 12, color: '#92400e', margin: 0, lineHeight: 1.5 }}>
                Some category names appear more than once. Click "Clean Up" to merge them automatically — sub-categories will be preserved under one parent.
              </p>
            </div>
            <button onClick={handleDeduplicate} disabled={deduping}
              style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 18px', background: '#d97706', color: '#fff', border: 'none', borderRadius: 9, fontSize: 13, fontWeight: 700, cursor: deduping ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap', flexShrink: 0, opacity: deduping ? 0.7 : 1 }}>
              {deduping ? <Loader2 size={14} style={{ animation: 'spin .7s linear infinite' }} /> : <Check size={14} />}
              {deduping ? 'Cleaning…' : 'Clean Up Duplicates'}
            </button>
          </div>
        )
      })()}

      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <CatSection title="Income Categories" cats={incomes} type="income" color="#16a34a" />
        <CatSection title="Expense Categories" cats={expenses} type="expense" color="#dc2626" />
      </div>

      {importPreview && (() => {
        // Build tree for preview display
        function treeOf(rows) {
          const parents = []
          const seen = new Set()
          for (const row of rows) {
            if (!seen.has(row.category)) {
              seen.add(row.category)
              parents.push({ name: row.category, subs: [] })
            }
            if (row.subCategory) {
              const p = parents.find(p => p.name === row.category)
              if (p) p.subs.push(row.subCategory)
            }
          }
          return parents
        }
        const incTree  = treeOf(importPreview.income)
        const expTree  = treeOf(importPreview.expense)
        const totalCats = incTree.length + incTree.reduce((s, p) => s + p.subs.length, 0)
                        + expTree.length + expTree.reduce((s, p) => s + p.subs.length, 0)
        return (
          <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
            <div style={{ background: 'var(--card-bg)', borderRadius: 16, padding: '28px 32px', maxWidth: 640, width: '100%', boxShadow: '0 24px 64px rgba(0,0,0,0.28)' }}>
              {/* Header */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
                <div style={{ width: 42, height: 42, borderRadius: 10, background: '#f0fdf4', border: '1.5px solid #86efac', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <FileSpreadsheet size={20} color="#16a34a" />
                </div>
                <div>
                  <h3 style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-1)', margin: '0 0 2px' }}>Import Categories</h3>
                  <p style={{ fontSize: 12, color: 'var(--text-3)', margin: 0 }}>
                    {totalCats} categor{totalCats === 1 ? 'y' : 'ies'} found — existing ones will be skipped automatically.
                  </p>
                </div>
              </div>

              {/* Two-column preview */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 18 }}>
                {[
                  { label: 'Income', tree: incTree, color: '#16a34a', bg: '#f0fdf4', border: '#86efac' },
                  { label: 'Expenses', tree: expTree, color: '#dc2626', bg: '#fff5f5', border: '#fca5a5' },
                ].map(({ label, tree, color, bg, border }) => (
                  <div key={label} style={{ borderRadius: 10, border: `1.5px solid ${border}`, overflow: 'hidden' }}>
                    <div style={{ padding: '8px 14px', background: bg, borderBottom: `1px solid ${border}`, display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Tag size={12} color={color} />
                      <span style={{ fontSize: 12, fontWeight: 700, color }}>{label}</span>
                      <span style={{ fontSize: 11, color: 'var(--text-3)', marginLeft: 'auto' }}>
                        {tree.length} parent{tree.length !== 1 ? 's' : ''}
                        {tree.reduce((s, p) => s + p.subs.length, 0) > 0 && `, ${tree.reduce((s, p) => s + p.subs.length, 0)} sub`}
                      </span>
                    </div>
                    {tree.length === 0 ? (
                      <p style={{ fontSize: 12, color: 'var(--text-3)', margin: 0, padding: '10px 14px', fontStyle: 'italic' }}>No {label.toLowerCase()} categories in file</p>
                    ) : (
                      <div style={{ maxHeight: 200, overflowY: 'auto', padding: '8px 0' }}>
                        {tree.map(parent => (
                          <div key={parent.name}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 14px' }}>
                              <div style={{ width: 6, height: 6, borderRadius: '50%', background: color, flexShrink: 0 }} />
                              <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-1)' }}>{parent.name}</span>
                            </div>
                            {parent.subs.map(sub => (
                              <div key={sub} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '2px 14px 2px 28px' }}>
                                <span style={{ fontSize: 11, color: 'var(--text-3)' }}>↳</span>
                                <span style={{ fontSize: 12, color: 'var(--text-2)' }}>{sub}</span>
                              </div>
                            ))}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Info note */}
              <div style={{ display: 'flex', gap: 8, padding: '10px 14px', background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 8, marginBottom: 18 }}>
                <AlertCircle size={14} color="#d97706" style={{ flexShrink: 0, marginTop: 1 }} />
                <p style={{ fontSize: 12, color: '#92400e', margin: 0, lineHeight: 1.55 }}>
                  Categories with the same name that already exist will be skipped. All other categories will be added. This does not affect existing categories or transactions.
                </p>
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button onClick={() => setImportPreview(null)} disabled={importing}
                  style={{ padding: '9px 20px', background: 'var(--card-bg)', border: '1.5px solid var(--card-border)', borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: 'pointer', color: 'var(--text-2)' }}>
                  Cancel
                </button>
                <button onClick={handleConfirmImport} disabled={importing}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 22px', background: '#16a34a', color: '#fff', border: 'none', borderRadius: 9, fontSize: 13, fontWeight: 700, cursor: importing ? 'not-allowed' : 'pointer', opacity: importing ? 0.7 : 1 }}>
                  {importing ? <Loader2 size={14} style={{ animation: 'spin .7s linear infinite' }} /> : <Upload size={14} />}
                  {importing ? 'Importing…' : `Import ${totalCats} Categor${totalCats === 1 ? 'y' : 'ies'}`}
                </button>
              </div>
            </div>
          </div>
        )
      })()}

      {deleteId && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'var(--card-bg)', borderRadius: 14, padding: '28px 32px', maxWidth: 360, width: '90%', boxShadow: '0 16px 48px rgba(0,0,0,0.25)', textAlign: 'center' }}>
            <div style={{ width: 48, height: 48, borderRadius: '50%', background: '#fee2e2', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              <Trash2 size={22} color="#dc2626" />
            </div>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-1)', margin: '0 0 8px' }}>Remove Category?</h3>
            <p style={{ fontSize: 13, color: 'var(--text-3)', margin: '0 0 24px', lineHeight: 1.5 }}>
              {(usage[deleteId] || 0) > 0
                ? `This category has ${usage[deleteId]} transaction(s). Reassign or delete them first.`
                : deleteChildren.length > 0
                ? `This category has ${deleteChildren.length} sub-categor${deleteChildren.length > 1 ? 'ies' : 'y'} which will also be removed.`
                : 'This category will be permanently removed.'}
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setDeleteId(null)} style={{ flex: 1, height: 40, background: 'var(--card-bg)', border: '1.5px solid var(--card-border)', borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: 'pointer', color: 'var(--text-2)' }}>Cancel</button>
              <button onClick={() => handleDelete(deleteId)} disabled={(usage[deleteId] || 0) > 0}
                style={{ flex: 1, height: 40, background: (usage[deleteId] || 0) > 0 ? '#9ca3af' : '#dc2626', color: '#fff', border: 'none', borderRadius: 9, fontSize: 13, fontWeight: 700, cursor: (usage[deleteId] || 0) > 0 ? 'not-allowed' : 'pointer' }}>
                Remove
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
