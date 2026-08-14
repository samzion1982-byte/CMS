/* ═══════════════════════════════════════════════════════════════
   DirectorySettingsPage.jsx — Categories & sub-categories for
   Phone Directory (Assets-style nested masters)
   ═══════════════════════════════════════════════════════════════ */

import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Settings, ArrowLeft, Plus, Pencil, Trash2, Check, X,
  Loader2, Tags, GripVertical, ChevronDown, ChevronRight, Folder,
} from 'lucide-react'
import { useToast } from '../lib/toast'
import {
  getDirectoryCategories,
  saveDirectoryCategory,
  deactivateDirectoryCategory,
  deleteDirectoryCategory,
  buildMasterTree,
  moveDirectoryCategory,
  getAllMasterDescendants,
} from '../lib/directoryLib'
import PageHeader from '../components/ui/PageHeader'

const INPUT = {
  height: 34, padding: '0 10px', border: '1.5px solid var(--card-border)',
  borderRadius: 7, fontSize: 13, background: 'var(--input-bg)', color: 'var(--text-1)',
  outline: 'none', boxSizing: 'border-box',
}

function TreeNode({
  node, depth, busy, editingId, editName,
  addingChildOf, newName,
  dragId, dropId, dropPos,
  onDragStart, onDragOver, onDrop, onDragEnd,
  onStartEdit, onEditName, onSaveEdit, onCancelEdit,
  onToggle, onDelete, onStartAddChild, onNewName, onCancelAdd, onConfirmAdd,
}) {
  const [open, setOpen] = useState(depth < 2)
  const hasChildren = node.children?.length > 0
  const isDragging = dragId === node.id
  const isDropOver = dropId === node.id
  const indent = depth * 28
  const editing = editingId === node.id
  const addingHere = addingChildOf === node.id

  return (
    <div>
      {isDropOver && dropPos === 'before' && (
        <div style={{ height: 2, background: 'var(--accent)', margin: `0 0 0 ${indent + 16}px`, borderRadius: 2 }} />
      )}

      <div
        draggable
        onDragStart={e => {
          e.dataTransfer.effectAllowed = 'move'
          onDragStart(node)
        }}
        onDragOver={e => {
          e.preventDefault(); e.stopPropagation()
          const rect = e.currentTarget.getBoundingClientRect()
          const y = e.clientY - rect.top
          const h = rect.height
          onDragOver(node, y < h * 0.25 ? 'before' : y > h * 0.75 ? 'after' : 'on')
        }}
        onDrop={e => { e.preventDefault(); e.stopPropagation(); onDrop(node) }}
        onDragEnd={onDragEnd}
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '9px 16px',
          paddingLeft: indent + 16,
          background: isDropOver && dropPos === 'on'
            ? 'var(--accent-subtle, #eff6ff)'
            : depth === 0 ? 'rgba(0,0,0,0.012)' : 'transparent',
          borderBottom: isDropOver && dropPos === 'after'
            ? '2px solid var(--accent)'
            : '1px solid var(--card-border)',
          opacity: isDragging ? 0.4 : (node.is_active ? 1 : 0.55),
          outline: isDropOver && dropPos === 'on' ? '2px solid var(--accent)' : 'none',
          outlineOffset: -2,
        }}
      >
        <GripVertical size={13} style={{ color: 'var(--text-3)', flexShrink: 0, cursor: 'grab', opacity: 0.5 }} />

        <button
          type="button"
          onClick={() => hasChildren && setOpen(o => !o)}
          style={{
            background: 'none', border: 'none', padding: 0, width: 18,
            display: 'flex', alignItems: 'center', color: 'var(--text-3)',
            cursor: hasChildren ? 'pointer' : 'default', flexShrink: 0,
          }}
        >
          {hasChildren
            ? (open ? <ChevronDown size={14} /> : <ChevronRight size={14} />)
            : <Folder size={12} />}
        </button>

        {editing ? (
          <>
            <input
              autoFocus
              value={editName}
              onChange={e => onEditName(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') onSaveEdit(node)
                if (e.key === 'Escape') onCancelEdit()
              }}
              style={{ ...INPUT, flex: 1 }}
            />
            <button onClick={() => onSaveEdit(node)} disabled={busy === node.id}
              style={{ padding: '5px 7px', background: '#16a34a', border: 'none', borderRadius: 6, cursor: 'pointer', color: '#fff', display: 'flex' }}>
              <Check size={13} />
            </button>
            <button onClick={onCancelEdit}
              style={{ padding: '5px 7px', background: 'none', border: '1px solid var(--card-border)', borderRadius: 6, cursor: 'pointer', color: 'var(--text-3)', display: 'flex' }}>
              <X size={13} />
            </button>
          </>
        ) : (
          <>
            <span
              onClick={() => hasChildren && setOpen(o => !o)}
              style={{
                flex: 1, fontSize: depth === 0 ? 14 : 13,
                fontWeight: depth === 0 ? 600 : 500,
                color: 'var(--text-1)', cursor: hasChildren ? 'pointer' : 'default',
                userSelect: 'none',
              }}
            >
              {node.name}
            </span>
            {!node.is_active && (
              <span style={{
                fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 99,
                background: '#f1f5f9', color: '#64748b',
              }}>INACTIVE</span>
            )}
            {hasChildren && (
              <span style={{ fontSize: 10, color: 'var(--text-3)' }}>
                {node.children.length}
              </span>
            )}
            <button
              onClick={() => { setOpen(true); onStartAddChild(node.id) }}
              title="Add sub-category"
              style={{
                display: 'flex', alignItems: 'center', gap: 4, padding: '4px 8px',
                background: 'var(--sidebar-item-active-bg)', color: 'var(--accent)',
                border: '1px solid var(--card-border)', borderRadius: 6,
                fontSize: 11, fontWeight: 700, cursor: 'pointer',
              }}
            >
              <Plus size={11} /> Sub
            </button>
            <button onClick={() => onStartEdit(node)} title="Rename"
              style={{ padding: '4px 6px', background: '#dbeafe', color: '#2563eb', border: 'none', borderRadius: 6, cursor: 'pointer', display: 'flex' }}>
              <Pencil size={11} />
            </button>
            <button onClick={() => onToggle(node)} disabled={busy === node.id}
              title={node.is_active ? 'Deactivate' : 'Reactivate'}
              style={{
                padding: '4px 8px', background: node.is_active ? '#fff7ed' : '#f0fdf4',
                border: `1px solid ${node.is_active ? '#fed7aa' : '#bbf7d0'}`,
                borderRadius: 6, cursor: 'pointer', fontSize: 10, fontWeight: 700,
                color: node.is_active ? '#c2410c' : '#15803d',
              }}>
              {node.is_active ? 'Off' : 'On'}
            </button>
            <button onClick={() => onDelete(node)} disabled={busy === node.id} title="Delete"
              style={{ padding: '4px 6px', background: '#fee2e2', color: '#b91c1c', border: 'none', borderRadius: 6, cursor: 'pointer', display: 'flex' }}>
              {busy === node.id ? <Loader2 size={11} className="animate-spin" /> : <Trash2 size={11} />}
            </button>
          </>
        )}
      </div>

      {addingHere && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '8px 16px', paddingLeft: indent + 44,
          borderBottom: '1px solid var(--card-border)',
          background: 'var(--sidebar-item-active-bg)',
        }}>
          <input
            autoFocus
            value={newName}
            onChange={e => onNewName(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') onConfirmAdd(node.id)
              if (e.key === 'Escape') onCancelAdd()
            }}
            placeholder={`Sub-category under ${node.name}…`}
            style={{ ...INPUT, flex: 1 }}
          />
          <button onClick={() => onConfirmAdd(node.id)} disabled={busy === 'add' || !newName.trim()}
            style={{ padding: '6px 12px', background: '#16a34a', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>
            {busy === 'add' ? '…' : 'Add'}
          </button>
          <button onClick={onCancelAdd}
            style={{ padding: '6px 8px', background: 'none', border: '1px solid var(--card-border)', borderRadius: 6, cursor: 'pointer', color: 'var(--text-3)', display: 'flex' }}>
            <X size={13} />
          </button>
        </div>
      )}

      {open && hasChildren && node.children.map(child => (
        <TreeNode
          key={child.id}
          node={child}
          depth={depth + 1}
          busy={busy}
          editingId={editingId}
          editName={editName}
          addingChildOf={addingChildOf}
          newName={newName}
          dragId={dragId}
          dropId={dropId}
          dropPos={dropPos}
          onDragStart={onDragStart}
          onDragOver={onDragOver}
          onDrop={onDrop}
          onDragEnd={onDragEnd}
          onStartEdit={onStartEdit}
          onEditName={onEditName}
          onSaveEdit={onSaveEdit}
          onCancelEdit={onCancelEdit}
          onToggle={onToggle}
          onDelete={onDelete}
          onStartAddChild={onStartAddChild}
          onNewName={onNewName}
          onCancelAdd={onCancelAdd}
          onConfirmAdd={onConfirmAdd}
        />
      ))}
    </div>
  )
}

function CategoriesList() {
  const toast = useToast()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [addingRoot, setAddingRoot] = useState(false)
  const [addingChildOf, setAddingChildOf] = useState(null)
  const [newName, setNewName] = useState('')
  const [editingId, setEditingId] = useState(null)
  const [editName, setEditName] = useState('')
  const [busy, setBusy] = useState(null)
  const [dragNode, setDragNode] = useState(null)
  const [dragId, setDragId] = useState(null)
  const [dropId, setDropId] = useState(null)
  const [dropPos, setDropPos] = useState(null)

  const tree = buildMasterTree(rows)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setRows(await getDirectoryCategories(false))
    } catch (e) {
      toast(e.message, 'error')
    }
    setLoading(false)
  }, [toast])

  useEffect(() => { load() }, [load])

  function resetAdd() {
    setAddingRoot(false)
    setAddingChildOf(null)
    setNewName('')
  }

  async function handleAdd(parentId = null) {
    if (!newName.trim()) return
    setBusy('add')
    try {
      const siblings = rows.filter(r => (r.parent_id || null) === (parentId || null))
      await saveDirectoryCategory({
        name: newName.trim(),
        parent_id: parentId,
        sort_order: (siblings.reduce((m, r) => Math.max(m, r.sort_order || 0), 0) || 0) + 10,
      })
      toast(parentId ? 'Sub-category added.' : 'Category added.', 'success')
      resetAdd()
      await load()
    } catch (e) {
      toast(e.message, 'error')
    }
    setBusy(null)
  }

  async function handleUpdate(row) {
    if (!editName.trim()) return
    setBusy(row.id)
    try {
      await saveDirectoryCategory({
        id: row.id,
        name: editName.trim(),
        sort_order: row.sort_order,
        is_active: row.is_active,
        parent_id: row.parent_id || null,
      })
      toast('Updated.', 'success')
      setEditingId(null)
      await load()
    } catch (e) {
      toast(e.message, 'error')
    }
    setBusy(null)
  }

  async function handleToggle(row) {
    setBusy(row.id)
    try {
      if (row.is_active) {
        await deactivateDirectoryCategory(row.id)
        toast('Deactivated.', 'success')
      } else {
        await saveDirectoryCategory({ ...row, is_active: true, parent_id: row.parent_id || null })
        toast('Reactivated.', 'success')
      }
      await load()
    } catch (e) {
      toast(e.message, 'error')
    }
    setBusy(null)
  }

  async function handleDelete(row) {
    const kids = getAllMasterDescendants(row.id, rows)
    const msg = kids.length
      ? `Delete “${row.name}” and its ${kids.length} nested sub-categor${kids.length === 1 ? 'y' : 'ies'}? They can be restored from Recycle Bin.`
      : `Delete “${row.name}”? Contacts in it will keep a blank category. It can be restored from Recycle Bin.`
    if (!confirm(msg)) return
    setBusy(row.id)
    try {
      await deleteDirectoryCategory(row.id)
      toast('Deleted.', 'success')
      await load()
    } catch (e) {
      toast(e.message + ' — deactivate it instead if it is in use.', 'error')
    }
    setBusy(null)
  }

  function handleDragStart(node) { setDragNode(node); setDragId(node.id) }
  function handleDragOver(node, pos) {
    if (node.id === dragId) return
    setDropId(node.id); setDropPos(pos)
  }
  function handleDragEnd() {
    setDragNode(null); setDragId(null); setDropId(null); setDropPos(null)
  }

  async function handleDrop(targetNode) {
    if (!dragNode || !targetNode || dragNode.id === targetNode.id) { handleDragEnd(); return }
    try {
      await moveDirectoryCategory(dragNode, targetNode, dropPos, rows)
      toast('Moved.', 'success')
      await load()
    } catch (e) {
      toast(e.message, 'error')
    }
    handleDragEnd()
  }

  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      <div style={{
        padding: '14px 18px', borderBottom: '1px solid var(--card-border)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 8, background: 'var(--sidebar-item-active-bg)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Tags size={15} style={{ color: 'var(--accent)' }} />
          </div>
          <div>
            <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--text-1)' }}>Categories</p>
            <p style={{ margin: 0, fontSize: 11, color: 'var(--text-3)' }}>
              Nested sub-categories — drag to reorder or nest (like Assets)
            </p>
          </div>
        </div>
        {!addingRoot && (
          <button onClick={() => { setAddingRoot(true); setAddingChildOf(null); setNewName('') }}
            style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px',
              background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8,
              fontSize: 12, fontWeight: 600, cursor: 'pointer',
            }}>
            <Plus size={13} /> Add
          </button>
        )}
      </div>

      {addingRoot && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px',
          borderBottom: '1px solid var(--card-border)', background: 'var(--sidebar-item-active-bg)',
        }}>
          <input
            autoFocus
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') handleAdd(null)
              if (e.key === 'Escape') resetAdd()
            }}
            placeholder="New top-level category…"
            style={{ ...INPUT, flex: 1 }}
          />
          <button onClick={() => handleAdd(null)} disabled={busy === 'add' || !newName.trim()}
            style={{ padding: '6px 12px', background: '#16a34a', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>
            {busy === 'add' ? '…' : 'Add'}
          </button>
          <button onClick={resetAdd}
            style={{ padding: '6px 8px', background: 'none', border: '1px solid var(--card-border)', borderRadius: 6, cursor: 'pointer', color: 'var(--text-3)', display: 'flex' }}>
            <X size={13} />
          </button>
        </div>
      )}

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-3)' }}>
          <Loader2 size={20} className="animate-spin" style={{ display: 'block', margin: '0 auto 8px' }} />
          Loading…
        </div>
      ) : tree.length === 0 && !addingRoot ? (
        <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>
          No categories yet. Add Diocese, Vendors, Service Providers, and more.
        </div>
      ) : (
        tree.map(node => (
          <TreeNode
            key={node.id}
            node={node}
            depth={0}
            busy={busy}
            editingId={editingId}
            editName={editName}
            addingChildOf={addingChildOf}
            newName={newName}
            dragId={dragId}
            dropId={dropId}
            dropPos={dropPos}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            onDragEnd={handleDragEnd}
            onStartEdit={(row) => { setEditingId(row.id); setEditName(row.name) }}
            onEditName={setEditName}
            onSaveEdit={handleUpdate}
            onCancelEdit={() => setEditingId(null)}
            onToggle={handleToggle}
            onDelete={handleDelete}
            onStartAddChild={(id) => { setAddingChildOf(id); setAddingRoot(false); setNewName('') }}
            onNewName={setNewName}
            onCancelAdd={resetAdd}
            onConfirmAdd={handleAdd}
          />
        ))
      )}
    </div>
  )
}

export default function DirectorySettingsPage() {
  const navigate = useNavigate()

  return (
    <div className="page-container">
      <PageHeader
        icon={Settings}
        title="Directory Setup"
        subtitle="Create categories and sub-categories for your phone directory"
      >
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
          <button
            onClick={() => navigate('/directory')}
            style={{
              padding: '6px 8px', background: 'var(--accent)', border: 'none', borderRadius: 7,
              cursor: 'pointer', display: 'flex', alignItems: 'center', color: '#fff',
            }}
          >
            <ArrowLeft size={15} />
          </button>
          <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--accent)', letterSpacing: 0.3 }}>Directory</span>
        </div>
      </PageHeader>

      <CategoriesList />
    </div>
  )
}
