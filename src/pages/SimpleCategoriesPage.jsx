/* ═══════════════════════════════════════════════════════════════
   SimpleCategoriesPage.jsx — Manage income / expense categories
   ═══════════════════════════════════════════════════════════════ */

import { useState, useEffect, useCallback } from 'react'
import { Tag, Plus, Pencil, Trash2, Check, X } from 'lucide-react'
import { useToast } from '../lib/toast'
import {
  getSimpleCategories, createSimpleCategory, updateSimpleCategory, deactivateSimpleCategory,
  getCategoryUsageCounts,
} from '../lib/simpleAccountsLib'

const inputStyle = {
  height: 36, padding: '0 10px', border: '1.5px solid var(--card-border)',
  borderRadius: 7, fontSize: 13, background: 'var(--input-bg)', color: 'var(--text-1)',
  outline: 'none', boxSizing: 'border-box', width: '100%',
}

function CategoryRow({ cat, usageCount, onEdit, onDelete }) {
  const isIncome = cat.type === 'income'
  const color    = isIncome ? '#16a34a' : '#dc2626'
  const bg       = isIncome ? '#dcfce7' : '#fee2e2'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 16px', borderBottom: '1px solid var(--card-border)' }}>
      <div style={{ width: 30, height: 30, borderRadius: 8, background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Tag size={13} color={color} />
      </div>
      <span style={{ flex: 1, fontSize: 14, color: 'var(--text-1)', fontWeight: 500 }}>{cat.name}</span>
      {cat.is_default && (
        <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 99, background: 'var(--sidebar-item-active-bg)', color: 'var(--text-3)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
          DEFAULT
        </span>
      )}
      <span style={{ fontSize: 11, color: 'var(--text-3)' }}>
        {usageCount ? `${usageCount} txn${usageCount > 1 ? 's' : ''}` : 'unused'}
      </span>
      <div style={{ display: 'flex', gap: 4 }}>
        <button onClick={onEdit} title="Edit name" style={{ padding: '5px 7px', background: 'none', border: '1px solid var(--card-border)', borderRadius: 6, cursor: 'pointer', color: 'var(--text-3)', display: 'flex' }}>
          <Pencil size={12} />
        </button>
        <button onClick={onDelete} title="Delete" style={{ padding: '5px 7px', background: 'none', border: '1px solid var(--card-border)', borderRadius: 6, cursor: 'pointer', color: usageCount > 0 ? '#9ca3af' : '#dc2626', display: 'flex' }}>
          <Trash2 size={12} />
        </button>
      </div>
    </div>
  )
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

function AddRow({ type, onAdded }) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const toast = useToast()

  async function handleAdd() {
    if (!name.trim()) return
    setSaving(true)
    try {
      await createSimpleCategory({ name: name.trim(), type, is_default: false, sort_order: 99 })
      toast('Category added', 'success')
      setName('')
      setOpen(false)
      onAdded()
    } catch (e) {
      toast('Failed: ' + e.message, 'error')
    }
    setSaving(false)
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)}
        style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '10px 16px', background: 'none', border: 'none', cursor: 'pointer', color: type === 'income' ? '#16a34a' : '#dc2626', fontSize: 13, fontWeight: 600 }}>
        <Plus size={14} /> Add {type === 'income' ? 'income' : 'expense'} category
      </button>
    )
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px' }}>
      <input autoFocus value={name} onChange={e => setName(e.target.value)}
        placeholder={`e.g. ${type === 'income' ? 'Rental Income' : 'Food & Catering'}`}
        onKeyDown={e => { if (e.key === 'Enter') handleAdd(); if (e.key === 'Escape') setOpen(false) }}
        style={{ ...inputStyle, flex: 1 }} />
      <button onClick={handleAdd} disabled={saving || !name.trim()}
        style={{ padding: '5px 10px', background: type === 'income' ? '#16a34a' : '#dc2626', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>
        {saving ? '…' : 'Add'}
      </button>
      <button onClick={() => setOpen(false)} style={{ padding: '5px 7px', background: 'none', border: '1px solid var(--card-border)', borderRadius: 6, cursor: 'pointer', color: 'var(--text-3)', display: 'flex' }}>
        <X size={13} />
      </button>
    </div>
  )
}

export default function SimpleCategoriesPage() {
  const toast = useToast()
  const [incomes,   setIncomes]   = useState([])
  const [expenses,  setExpenses]  = useState([])
  const [usage,     setUsage]     = useState({})
  const [loading,   setLoading]   = useState(true)
  const [editId,    setEditId]    = useState(null)
  const [deleteId,  setDeleteId]  = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [cats, counts] = await Promise.all([getSimpleCategories(), getCategoryUsageCounts()])
      setIncomes(cats.filter(c => c.type === 'income'))
      setExpenses(cats.filter(c => c.type === 'expense'))
      setUsage(counts)
    } catch (e) {
      toast('Failed to load: ' + e.message, 'error')
    }
    setLoading(false)
  }, [toast])

  useEffect(() => { load() }, [load])

  async function handleRename(id, newName) {
    if (!newName) { toast('Name cannot be empty', 'error'); return }
    try {
      await updateSimpleCategory(id, { name: newName })
      toast('Category updated', 'success')
      setEditId(null)
      load()
    } catch (e) {
      toast('Failed: ' + e.message, 'error')
    }
  }

  async function handleDelete(id) {
    const count = usage[id] || 0
    if (count > 0) { toast(`Cannot delete — ${count} transaction(s) use this category. Reassign them first.`, 'error'); setDeleteId(null); return }
    try {
      await deactivateSimpleCategory(id)
      toast('Category removed', 'success')
      setDeleteId(null)
      load()
    } catch (e) {
      toast('Failed: ' + e.message, 'error')
    }
  }

  function CatSection({ title, cats, type, color }) {
    return (
      <div className="card" style={{ overflow: 'hidden', flex: 1, minWidth: 280 }}>
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
            : cats.map(c => (
              editId === c.id
                ? <InlineEdit key={c.id} value={c.name} onSave={n => handleRename(c.id, n)} onCancel={() => setEditId(null)} />
                : <CategoryRow key={c.id} cat={c} usageCount={usage[c.id] || 0} onEdit={() => setEditId(c.id)} onDelete={() => setDeleteId(c.id)} />
            ))
          }
        </div>
        <AddRow type={type} onAdded={load} />
      </div>
    )
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Tag size={20} style={{ color: 'var(--accent)' }} /> Categories
          </h1>
          <p className="page-subtitle">Group your income and expenses into meaningful categories</p>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <CatSection title="Income Categories" cats={incomes} type="income" color="#16a34a" />
        <CatSection title="Expense Categories" cats={expenses} type="expense" color="#dc2626" />
      </div>

      {/* Delete confirm */}
      {deleteId && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'var(--card-bg)', borderRadius: 14, padding: '28px 32px', maxWidth: 360, width: '90%', boxShadow: '0 16px 48px rgba(0,0,0,0.25)', textAlign: 'center' }}>
            <div style={{ width: 48, height: 48, borderRadius: '50%', background: '#fee2e2', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              <Trash2 size={22} color="#dc2626" />
            </div>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-1)', margin: '0 0 8px' }}>Remove Category?</h3>
            <p style={{ fontSize: 13, color: 'var(--text-3)', margin: '0 0 24px', lineHeight: 1.5 }}>
              {(usage[deleteId] || 0) > 0
                ? `This category has ${usage[deleteId]} transaction(s). Reassign or delete those transactions first.`
                : 'This category will be removed. Existing transactions will not be affected.'}
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
