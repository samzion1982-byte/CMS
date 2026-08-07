/* ═══════════════════════════════════════════════════════════════
   AssetsSettingsPage.jsx — Locations / Item Types (with sub-cats)
   and Conditions for Asset Management
   ═══════════════════════════════════════════════════════════════ */

import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Settings, ArrowLeft, Plus, Pencil, Trash2, Check, X,
  Loader2, MapPin, Tag, HeartPulse,
} from 'lucide-react'
import { useToast } from '../lib/toast'
import {
  getAssetLocations, getAssetItemTypes, getAssetConditions,
  saveAssetLocation, saveAssetItemType, saveAssetCondition,
  deactivateMaster, deleteMaster, buildMasterTree,
} from '../lib/assetsLib'

const TABS = [
  { id: 'locations',  label: 'Locations',  icon: MapPin,     table: 'asset_locations',  load: getAssetLocations,  save: saveAssetLocation,  hierarchical: true  },
  { id: 'types',      label: 'Item Types', icon: Tag,        table: 'asset_item_types', load: getAssetItemTypes,  save: saveAssetItemType,  hierarchical: true  },
  { id: 'conditions', label: 'Conditions', icon: HeartPulse, table: 'asset_conditions', load: getAssetConditions, save: saveAssetCondition, hierarchical: false },
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

function RowActions({ row, busy, onEdit, onToggle, onDelete }) {
  return (
    <div style={{ display: 'flex', gap: 4 }}>
      <button onClick={onEdit} title="Rename"
        style={{
          padding: '4px 6px', background: 'none', border: '1px solid var(--card-border)',
          borderRadius: 6, cursor: 'pointer', color: 'var(--text-3)', display: 'flex',
        }}>
        <Pencil size={11} />
      </button>
      <button onClick={onToggle} disabled={busy === row.id}
        title={row.is_active ? 'Deactivate' : 'Reactivate'}
        style={{
          padding: '4px 8px', background: row.is_active ? '#fff7ed' : '#f0fdf4',
          border: `1px solid ${row.is_active ? '#fed7aa' : '#bbf7d0'}`,
          borderRadius: 6, cursor: 'pointer', fontSize: 10, fontWeight: 700,
          color: row.is_active ? '#c2410c' : '#15803d',
        }}>
        {row.is_active ? 'Off' : 'On'}
      </button>
      <button onClick={onDelete} disabled={busy === row.id} title="Delete"
        style={{
          padding: '4px 6px', background: 'none', border: '1px solid var(--card-border)',
          borderRadius: 6, cursor: 'pointer', color: '#dc2626', display: 'flex',
        }}>
        {busy === row.id ? <Loader2 size={11} className="animate-spin" /> : <Trash2 size={11} />}
      </button>
    </div>
  )
}

function InlineEdit({ value, color, showColor, busy, onChange, onColor, onSave, onCancel }) {
  return (
    <>
      <input
        autoFocus
        value={value}
        onChange={e => onChange(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter') onSave()
          if (e.key === 'Escape') onCancel()
        }}
        style={{ ...INPUT, flex: 1 }}
      />
      {showColor && (
        <div style={{ display: 'flex', gap: 4 }}>
          {PRESET_COLORS.map(c => (
            <button key={c} type="button" onClick={() => onColor(c)}
              style={{
                width: 18, height: 18, borderRadius: '50%', background: c, cursor: 'pointer',
                border: color === c ? '2px solid var(--text-1)' : '2px solid transparent',
              }} />
          ))}
        </div>
      )}
      <button onClick={onSave} disabled={busy}
        style={{ padding: '5px 7px', background: '#16a34a', border: 'none', borderRadius: 6, cursor: 'pointer', color: '#fff', display: 'flex' }}>
        <Check size={13} />
      </button>
      <button onClick={onCancel}
        style={{ padding: '5px 7px', background: 'none', border: '1px solid var(--card-border)', borderRadius: 6, cursor: 'pointer', color: 'var(--text-3)', display: 'flex' }}>
        <X size={13} />
      </button>
    </>
  )
}

function MasterList({ tabDef }) {
  const toast = useToast()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [addingParent, setAddingParent] = useState(false)
  const [addingChildOf, setAddingChildOf] = useState(null) // parent id
  const [newName, setNewName] = useState('')
  const [newColor, setNewColor] = useState('#16a34a')
  const [editingId, setEditingId] = useState(null)
  const [editName, setEditName] = useState('')
  const [editColor, setEditColor] = useState('')
  const [busy, setBusy] = useState(null)

  const isConditions = tabDef.id === 'conditions'
  const hierarchical = tabDef.hierarchical
  const { parents, byParent } = buildMasterTree(rows)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await tabDef.load(false)
      setRows(data)
    } catch (e) {
      toast(e.message, 'error')
    }
    setLoading(false)
  }, [tabDef, toast])

  useEffect(() => { load() }, [load])

  function resetAdd() {
    setAddingParent(false)
    setAddingChildOf(null)
    setNewName('')
  }

  async function handleAdd(parentId = null) {
    if (!newName.trim()) return
    setBusy('add')
    try {
      const siblings = parentId
        ? (byParent[parentId] || [])
        : parents
      await tabDef.save({
        name: newName.trim(),
        parent_id: parentId,
        sort_order: (siblings.reduce((m, r) => Math.max(m, r.sort_order || 0), 0) || 0) + 10,
        color: isConditions ? newColor : undefined,
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
        color: isConditions ? editColor : undefined,
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
    const kids = byParent[row.id] || []
    const msg = kids.length
      ? `Permanently delete “${row.name}” and its ${kids.length} sub-categor${kids.length === 1 ? 'y' : 'ies'}?`
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

  function startEdit(row) {
    setEditingId(row.id)
    setEditName(row.name)
    setEditColor(row.color || '#64748b')
  }

  const Icon = tabDef.icon
  const listRows = hierarchical ? parents : rows

  function renderRow(row, { isChild = false } = {}) {
    const editing = editingId === row.id
    return (
      <div key={row.id} style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: isChild ? '9px 16px 9px 42px' : '11px 16px',
        borderBottom: '1px solid var(--card-border)',
        background: isChild ? 'rgba(0,0,0,0.018)' : 'transparent',
        opacity: row.is_active ? 1 : 0.55,
      }}>
        {editing ? (
          <InlineEdit
            value={editName}
            color={editColor}
            showColor={isConditions}
            busy={busy === row.id}
            onChange={setEditName}
            onColor={setEditColor}
            onSave={() => handleUpdate(row)}
            onCancel={() => setEditingId(null)}
          />
        ) : (
          <>
            {isChild
              ? <span style={{ fontSize: 13, color: 'var(--text-3)', flexShrink: 0 }}>↳</span>
              : isConditions
                ? <span style={{ width: 10, height: 10, borderRadius: '50%', background: row.color || '#64748b', flexShrink: 0 }} />
                : null
            }
            <span style={{ flex: 1, fontSize: isChild ? 13 : 14, color: 'var(--text-1)', fontWeight: isChild ? 400 : 500 }}>
              {row.name}
            </span>
            {!row.is_active && (
              <span style={{
                fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 99,
                background: '#f1f5f9', color: '#64748b', letterSpacing: '0.05em',
              }}>
                INACTIVE
              </span>
            )}
            <RowActions
              row={row}
              busy={busy}
              onEdit={() => startEdit(row)}
              onToggle={() => handleToggle(row)}
              onDelete={() => handleDelete(row)}
            />
          </>
        )}
      </div>
    )
  }

  function renderAddBar({ parentId = null, placeholder }) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
        padding: parentId ? '8px 16px 8px 42px' : '10px 16px',
        borderBottom: '1px solid var(--card-border)',
        background: 'var(--sidebar-item-active-bg)',
      }}>
        <input
          autoFocus
          value={newName}
          onChange={e => setNewName(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') handleAdd(parentId)
            if (e.key === 'Escape') resetAdd()
          }}
          placeholder={placeholder}
          style={{ ...INPUT, flex: 1, minWidth: 160 }}
        />
        {isConditions && (
          <div style={{ display: 'flex', gap: 5 }}>
            {PRESET_COLORS.map(c => (
              <button key={c} type="button" onClick={() => setNewColor(c)}
                style={{
                  width: 22, height: 22, borderRadius: '50%', background: c, cursor: 'pointer',
                  border: newColor === c ? '2px solid var(--text-1)' : '2px solid transparent',
                }} />
            ))}
          </div>
        )}
        <button onClick={() => handleAdd(parentId)} disabled={busy === 'add' || !newName.trim()}
          style={{
            padding: '6px 12px', background: '#16a34a', color: '#fff', border: 'none',
            borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 700,
          }}>
          {busy === 'add' ? '…' : 'Add'}
        </button>
        <button onClick={resetAdd}
          style={{
            padding: '6px 8px', background: 'none', border: '1px solid var(--card-border)',
            borderRadius: 6, cursor: 'pointer', color: 'var(--text-3)', display: 'flex',
          }}>
          <X size={13} />
        </button>
      </div>
    )
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
              {hierarchical
                ? 'Create categories and multiple sub-categories for each'
                : 'Used in the Asset Management form dropdowns'}
            </p>
          </div>
        </div>
        {!addingParent && addingChildOf == null && (
          <button onClick={() => { setAddingParent(true); setNewName('') }}
            style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px',
              background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8,
              fontSize: 12, fontWeight: 600, cursor: 'pointer',
            }}>
            <Plus size={13} /> Add
          </button>
        )}
      </div>

      {addingParent && renderAddBar({
        placeholder: hierarchical
          ? `New ${tabDef.label.slice(0, -1).toLowerCase()}…`
          : `New ${tabDef.label.slice(0, -1).toLowerCase()}…`,
      })}

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-3)' }}>
          <Loader2 size={20} className="animate-spin" style={{ display: 'block', margin: '0 auto 8px' }} />
          Loading…
        </div>
      ) : listRows.length === 0 && !addingParent ? (
        <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>
          No entries yet. Add your first {tabDef.label.slice(0, -1).toLowerCase()}.
        </div>
      ) : (
        listRows.map(parent => (
          <div key={parent.id}>
            {renderRow(parent)}
            {hierarchical && (byParent[parent.id] || []).map(child => renderRow(child, { isChild: true }))}
            {hierarchical && addingChildOf === parent.id && renderAddBar({
              parentId: parent.id,
              placeholder: `Sub-category under ${parent.name}…`,
            })}
            {hierarchical && addingChildOf !== parent.id && (
              <button
                onClick={() => { setAddingChildOf(parent.id); setAddingParent(false); setNewName('') }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6, width: '100%',
                  padding: '7px 16px 7px 42px', background: 'none', border: 'none',
                  cursor: 'pointer', color: 'var(--text-3)', fontSize: 12,
                  borderBottom: '1px solid var(--card-border)',
                }}
              >
                <Plus size={12} /> Add sub-category
              </button>
            )}
          </div>
        ))
      )}
    </div>
  )
}

export default function AssetsSettingsPage() {
  const navigate = useNavigate()
  const [tab, setTab] = useState('locations')
  const tabDef = TABS.find(t => t.id === tab)

  return (
    <div className="page-container">
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
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
          <div>
            <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
              <Settings size={18} style={{ color: 'var(--accent)' }} />
              Asset Settings
            </h1>
            <p className="page-subtitle">Locations, item types (with sub-categories), and conditions</p>
          </div>
        </div>
      </div>

      <div style={{
        display: 'flex', gap: 4, borderBottom: '2px solid var(--border, #e2e8f0)', marginBottom: 20,
      }}>
        {TABS.map(t => {
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

      {tabDef && <MasterList key={tabDef.id} tabDef={tabDef} />}
    </div>
  )
}
