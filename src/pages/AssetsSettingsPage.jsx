/* ═══════════════════════════════════════════════════════════════
   AssetsSettingsPage.jsx — Locations / Item Types (nested + movable
   like Chart of Accounts) and Conditions for Asset Management
   ═══════════════════════════════════════════════════════════════ */

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Settings, ArrowLeft, Plus, Pencil, Trash2, Check, X,
  Loader2, MapPin, Tag, HeartPulse, GripVertical,
  ChevronDown, ChevronRight, Folder, Building2, FileText,
} from 'lucide-react'
import { useToast } from '../lib/toast'
import { useAuth } from '../lib/AuthContext'
import { canAccessAssetTab } from '../lib/cmsPermissions'
import {
  getAssetLocations, getAssetItemTypes, getAssetConditions,
  saveAssetLocation, saveAssetItemType, saveAssetCondition,
  deactivateMaster, deleteMaster,
  buildMasterTree, moveMasterItem, reorderFlatMaster, getAllMasterDescendants,
} from '../lib/assetsLib'
import {
  getChurchDocumentCategories,
  saveChurchDocumentCategory,
  moveChurchDocumentCategory,
} from '../lib/churchDocumentsLib'
import FixedAssetsSettingsPanel from '../components/assets/FixedAssetsSettingsPanel'
import PageHeader from '../components/ui/PageHeader'

const TABS = [
  { id: 'locations',      label: 'Locations',      icon: MapPin,     table: 'asset_locations',            load: getAssetLocations,           save: saveAssetLocation,           hierarchical: true,  kind: 'master', move: (d, t, p, a) => moveMasterItem('asset_locations', d, t, p, a) },
  { id: 'types',          label: 'Item Types',     icon: Tag,        table: 'asset_item_types',           load: getAssetItemTypes,           save: saveAssetItemType,           hierarchical: true,  kind: 'master', move: (d, t, p, a) => moveMasterItem('asset_item_types', d, t, p, a) },
  { id: 'conditions',     label: 'Conditions',     icon: HeartPulse, table: 'asset_conditions',           load: getAssetConditions,          save: saveAssetCondition,          hierarchical: false, kind: 'master' },
  { id: 'fixed-assets',   label: 'Fixed Assets',   icon: Building2,  hierarchical: false, kind: 'fixed' },
  { id: 'doc-categories', label: 'Doc Categories', icon: FileText,   table: 'church_document_categories', load: getChurchDocumentCategories, save: saveChurchDocumentCategory, hierarchical: true,  kind: 'master', move: moveChurchDocumentCategory },
]

const PRESET_COLORS = [
  '#16a34a', '#dc2626', '#c2410c', '#d97706', '#64748b',
  '#2563eb', '#7c3aed', '#0891b2', '#db2777', '#065f46',
]

const INPUT = {
  height: 34, padding: '0 10px', border: '1.5px solid var(--card-border)',
  borderRadius: 7, fontSize: 13, background: 'var(--input-bg)', color: 'var(--text-1)',
  outline: 'none', boxSizing: 'border-box',
}

/* ── Nested tree node (COA-style drag & drop) ─────────────────── */

function TreeNode({
  node, depth, allRows, busy, editingId, editName,
  addingChildOf, newName,
  dragId, dropId, dropPos,
  onDragStart, onDragOver, onDrop, onDragEnd,
  onStartEdit, onEditName, onSaveEdit, onCancelEdit,
  onToggle, onDelete, onAddChild, onStartAddChild, onNewName, onCancelAdd, onConfirmAdd,
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
          allRows={allRows}
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
          onAddChild={onAddChild}
          onStartAddChild={onStartAddChild}
          onNewName={onNewName}
          onCancelAdd={onCancelAdd}
          onConfirmAdd={onConfirmAdd}
        />
      ))}
    </div>
  )
}

/* ── Hierarchical master list ─────────────────────────────────── */

function HierarchicalMasterList({ tabDef }) {
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
  const Icon = tabDef.icon

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setRows(await tabDef.load(false))
    } catch (e) {
      toast(e.message, 'error')
    }
    setLoading(false)
  }, [tabDef, toast])

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
      await tabDef.save({
        name: newName.trim(),
        parent_id: parentId,
        sort_order: (siblings.reduce((m, r) => Math.max(m, r.sort_order || 0), 0) || 0) + 10,
      })
      toast(parentId ? 'Sub-category added.' : 'Added.', 'success')
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
      await tabDef.save({
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
        await deactivateMaster(tabDef.table, row.id)
        toast('Deactivated.', 'success')
      } else {
        await tabDef.save({ ...row, is_active: true, parent_id: row.parent_id || null })
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
      ? `Permanently delete “${row.name}” and its ${kids.length} nested sub-categor${kids.length === 1 ? 'y' : 'ies'}?`
      : `Permanently delete “${row.name}”? Items using it will keep a blank value.`
    if (!confirm(msg)) return
    setBusy(row.id)
    try {
      await deleteMaster(tabDef.table, row.id)
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
      await (tabDef.move
        ? tabDef.move(dragNode, targetNode, dropPos, rows)
        : moveMasterItem(tabDef.table, dragNode, targetNode, dropPos, rows))
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
            <Icon size={15} style={{ color: 'var(--accent)' }} />
          </div>
          <div>
            <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--text-1)' }}>{tabDef.label}</p>
            <p style={{ margin: 0, fontSize: 11, color: 'var(--text-3)' }}>
              Nested sub-categories — drag to reorder or nest (like Chart of Accounts)
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
            placeholder={`New top-level ${tabDef.label.slice(0, -1).toLowerCase()}…`}
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
          No entries yet. Add your first {tabDef.label.slice(0, -1).toLowerCase()}.
        </div>
      ) : (
        tree.map(node => (
          <TreeNode
            key={node.id}
            node={node}
            depth={0}
            allRows={rows}
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
            onAddChild={() => {}}
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

/* ── Flat conditions list (draggable reorder) ─────────────────── */

function FlatMasterList({ tabDef }) {
  const toast = useToast()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState('')
  const [newColor, setNewColor] = useState('#16a34a')
  const [editingId, setEditingId] = useState(null)
  const [editName, setEditName] = useState('')
  const [editColor, setEditColor] = useState('')
  const [busy, setBusy] = useState(null)
  const [dragRow, setDragRow] = useState(null)
  const [dragId, setDragId] = useState(null)
  const [dropId, setDropId] = useState(null)
  const [dropPos, setDropPos] = useState(null)
  const Icon = tabDef.icon

  const load = useCallback(async () => {
    setLoading(true)
    try { setRows(await tabDef.load(false)) }
    catch (e) { toast(e.message, 'error') }
    setLoading(false)
  }, [tabDef, toast])

  useEffect(() => { load() }, [load])

  async function handleAdd() {
    if (!newName.trim()) return
    setBusy('add')
    try {
      await tabDef.save({
        name: newName.trim(),
        sort_order: (rows.reduce((m, r) => Math.max(m, r.sort_order || 0), 0) || 0) + 10,
        color: newColor,
      })
      toast('Added.', 'success')
      setNewName(''); setAdding(false)
      await load()
    } catch (e) { toast(e.message, 'error') }
    setBusy(null)
  }

  async function handleUpdate(row) {
    if (!editName.trim()) return
    setBusy(row.id)
    try {
      await tabDef.save({
        id: row.id, name: editName.trim(), sort_order: row.sort_order,
        is_active: row.is_active, color: editColor,
      })
      toast('Updated.', 'success')
      setEditingId(null)
      await load()
    } catch (e) { toast(e.message, 'error') }
    setBusy(null)
  }

  async function handleToggle(row) {
    setBusy(row.id)
    try {
      if (row.is_active) {
        await deactivateMaster(tabDef.table, row.id)
        toast('Deactivated.', 'success')
      } else {
        await tabDef.save({ ...row, is_active: true })
        toast('Reactivated.', 'success')
      }
      await load()
    } catch (e) { toast(e.message, 'error') }
    setBusy(null)
  }

  async function handleDelete(row) {
    if (!confirm(`Permanently delete “${row.name}”?`)) return
    setBusy(row.id)
    try {
      await deleteMaster(tabDef.table, row.id)
      toast('Deleted.', 'success')
      await load()
    } catch (e) { toast(e.message, 'error') }
    setBusy(null)
  }

  function handleDragStart(row) {
    setDragRow(row)
    setDragId(row.id)
  }

  function handleDragOver(row, pos) {
    if (row.id === dragId) return
    setDropId(row.id)
    setDropPos(pos)
  }

  function handleDragEnd() {
    setDragRow(null)
    setDragId(null)
    setDropId(null)
    setDropPos(null)
  }

  async function handleDrop(targetRow) {
    if (!dragRow || !targetRow || dragRow.id === targetRow.id) {
      handleDragEnd()
      return
    }
    try {
      await reorderFlatMaster(tabDef.table, dragRow, targetRow, dropPos, rows)
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
            <Icon size={15} style={{ color: 'var(--accent)' }} />
          </div>
          <div>
            <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--text-1)' }}>{tabDef.label}</p>
            <p style={{ margin: 0, fontSize: 11, color: 'var(--text-3)' }}>
              Drag to rearrange — order is used in Asset Management
            </p>
          </div>
        </div>
        {!adding && (
          <button onClick={() => setAdding(true)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px',
              background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8,
              fontSize: 12, fontWeight: 600, cursor: 'pointer',
            }}>
            <Plus size={13} /> Add
          </button>
        )}
      </div>

      {adding && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
          padding: '10px 16px', borderBottom: '1px solid var(--card-border)',
          background: 'var(--sidebar-item-active-bg)',
        }}>
          <input autoFocus value={newName} onChange={e => setNewName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleAdd(); if (e.key === 'Escape') setAdding(false) }}
            placeholder="New condition…" style={{ ...INPUT, flex: 1, minWidth: 160 }} />
          <div style={{ display: 'flex', gap: 5 }}>
            {PRESET_COLORS.map(c => (
              <button key={c} type="button" onClick={() => setNewColor(c)}
                style={{
                  width: 22, height: 22, borderRadius: '50%', background: c, cursor: 'pointer',
                  border: newColor === c ? '2px solid var(--text-1)' : '2px solid transparent',
                }} />
            ))}
          </div>
          <button onClick={handleAdd} disabled={busy === 'add' || !newName.trim()}
            style={{ padding: '6px 12px', background: '#16a34a', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>
            {busy === 'add' ? '…' : 'Add'}
          </button>
          <button onClick={() => { setAdding(false); setNewName('') }}
            style={{ padding: '6px 8px', background: 'none', border: '1px solid var(--card-border)', borderRadius: 6, cursor: 'pointer', color: 'var(--text-3)', display: 'flex' }}>
            <X size={13} />
          </button>
        </div>
      )}

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-3)' }}>
          <Loader2 size={20} className="animate-spin" style={{ display: 'block', margin: '0 auto 8px' }} />Loading…
        </div>
      ) : rows.length === 0 ? (
        <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>No conditions yet.</div>
      ) : rows.map(row => {
        const isDragging = dragId === row.id
        const isDropOver = dropId === row.id
        return (
          <div key={row.id}>
            {isDropOver && dropPos === 'before' && (
              <div style={{ height: 2, background: 'var(--accent)', margin: '0 16px', borderRadius: 2 }} />
            )}
            <div
              draggable={editingId !== row.id}
              onDragStart={e => {
                if (editingId === row.id) { e.preventDefault(); return }
                e.dataTransfer.effectAllowed = 'move'
                handleDragStart(row)
              }}
              onDragOver={e => {
                e.preventDefault()
                e.stopPropagation()
                const rect = e.currentTarget.getBoundingClientRect()
                const y = e.clientY - rect.top
                handleDragOver(row, y < rect.height / 2 ? 'before' : 'after')
              }}
              onDrop={e => { e.preventDefault(); e.stopPropagation(); handleDrop(row) }}
              onDragEnd={handleDragEnd}
              style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '11px 16px',
                borderBottom: isDropOver && dropPos === 'after'
                  ? '2px solid var(--accent)'
                  : '1px solid var(--card-border)',
                opacity: isDragging ? 0.4 : (row.is_active ? 1 : 0.55),
                cursor: editingId === row.id ? 'default' : 'grab',
                background: isDropOver ? 'var(--accent-subtle, #eff6ff)' : 'transparent',
              }}
            >
              {editingId === row.id ? (
                <>
                  <input autoFocus value={editName} onChange={e => setEditName(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleUpdate(row); if (e.key === 'Escape') setEditingId(null) }}
                    style={{ ...INPUT, flex: 1 }} />
                  <div style={{ display: 'flex', gap: 4 }}>
                    {PRESET_COLORS.map(c => (
                      <button key={c} type="button" onClick={() => setEditColor(c)}
                        style={{
                          width: 18, height: 18, borderRadius: '50%', background: c, cursor: 'pointer',
                          border: editColor === c ? '2px solid var(--text-1)' : '2px solid transparent',
                        }} />
                    ))}
                  </div>
                  <button onClick={() => handleUpdate(row)} style={{ padding: '5px 7px', background: '#16a34a', border: 'none', borderRadius: 6, cursor: 'pointer', color: '#fff', display: 'flex' }}><Check size={13} /></button>
                  <button onClick={() => setEditingId(null)} style={{ padding: '5px 7px', background: 'none', border: '1px solid var(--card-border)', borderRadius: 6, cursor: 'pointer', color: 'var(--text-3)', display: 'flex' }}><X size={13} /></button>
                </>
              ) : (
                <>
                  <GripVertical size={13} style={{ color: 'var(--text-3)', flexShrink: 0, opacity: 0.5 }} />
                  <span style={{ width: 10, height: 10, borderRadius: '50%', background: row.color || '#64748b', flexShrink: 0 }} />
                  <span style={{ flex: 1, fontSize: 14, color: 'var(--text-1)', fontWeight: 500, userSelect: 'none' }}>{row.name}</span>
                  {!row.is_active && (
                    <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 99, background: '#f1f5f9', color: '#64748b' }}>INACTIVE</span>
                  )}
                  <button onClick={() => { setEditingId(row.id); setEditName(row.name); setEditColor(row.color || '#64748b') }}
                    style={{ padding: '4px 6px', background: 'none', border: '1px solid var(--card-border)', borderRadius: 6, cursor: 'pointer', color: 'var(--text-3)', display: 'flex' }}>
                    <Pencil size={11} />
                  </button>
                  <button onClick={() => handleToggle(row)}
                    style={{
                      padding: '4px 8px', background: row.is_active ? '#fff7ed' : '#f0fdf4',
                      border: `1px solid ${row.is_active ? '#fed7aa' : '#bbf7d0'}`,
                      borderRadius: 6, cursor: 'pointer', fontSize: 10, fontWeight: 700,
                      color: row.is_active ? '#c2410c' : '#15803d',
                    }}>
                    {row.is_active ? 'Off' : 'On'}
                  </button>
                  <button onClick={() => handleDelete(row)}
                    style={{ padding: '4px 6px', background: 'none', border: '1px solid var(--card-border)', borderRadius: 6, cursor: 'pointer', color: '#dc2626', display: 'flex' }}>
                    {busy === row.id ? <Loader2 size={11} className="animate-spin" /> : <Trash2 size={11} />}
                  </button>
                </>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

export default function AssetsSettingsPage() {
  const navigate = useNavigate()
  const { profile, pageGrants } = useAuth()
  const role = profile?.role

  const visibleTabs = useMemo(() => TABS.filter(t => {
    if (t.id === 'fixed-assets') return canAccessAssetTab('building', role, pageGrants)
    if (t.id === 'doc-categories') return canAccessAssetTab('document', role, pageGrants)
    return canAccessAssetTab('movable', role, pageGrants)
  }), [role, pageGrants])

  const [tab, setTab] = useState(() => {
    try {
      const q = new URLSearchParams(window.location.search).get('tab')
      if (q && TABS.some(t => t.id === q)) return q
    } catch { /* ignore */ }
    return 'locations'
  })

  useEffect(() => {
    if (!visibleTabs.length) return
    if (!visibleTabs.some(t => t.id === tab)) setTab(visibleTabs[0].id)
  }, [visibleTabs, tab])

  const tabDef = visibleTabs.find(t => t.id === tab) || TABS.find(t => t.id === tab)

  return (
    <div className="page-container">
      <PageHeader
        icon={Settings}
        title="Asset Settings"
        subtitle="Masters for movable inventory · Fixed Asset tiles for the vault"
      >
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
          <button
            onClick={() => navigate('/assets')}
            style={{
              padding: '6px 8px', background: 'var(--accent)', border: 'none', borderRadius: 7,
              cursor: 'pointer', display: 'flex', alignItems: 'center', color: '#fff',
            }}
          >
            <ArrowLeft size={15} />
          </button>
          <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--accent)', whiteSpace: 'nowrap' }}>Assets</span>
        </div>
      </PageHeader>

      <div style={{
        display: 'flex', gap: 4, borderBottom: '2px solid var(--border, #e2e8f0)', marginBottom: 20,
      }}>
        {visibleTabs.map(t => {
          const Icon = t.icon
          const active = tab === t.id
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 7,
                padding: '9px 18px', fontSize: 13,
                fontWeight: active ? 700 : 500,
                border: 'none',
                borderBottom: active
                  ? '2px solid var(--sidebar-bg, #1e293b)' : '2px solid transparent',
                marginBottom: -2,
                background: active ? 'var(--sidebar-bg, #1e293b)' : 'transparent',
                color: active ? '#ffffff' : 'var(--text-muted, #64748b)',
                cursor: 'pointer', borderRadius: '6px 6px 0 0', transition: 'all 0.15s',
              }}
            >
              <Icon size={14} />
              {t.label}
            </button>
          )
        })}
      </div>

      {tabDef?.kind === 'fixed' ? (
        <FixedAssetsSettingsPanel />
      ) : tabDef?.hierarchical ? (
        <HierarchicalMasterList key={tabDef.id} tabDef={tabDef} />
      ) : (
        <FlatMasterList key={tabDef.id} tabDef={tabDef} />
      )}
    </div>
  )
}
