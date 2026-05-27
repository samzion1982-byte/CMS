/* ═══════════════════════════════════════════════════════════════
   ChartOfAccountsPage.jsx — Drill-down Chart of Accounts
   Main Account → Account Group → Ledger (3 levels)
   ═══════════════════════════════════════════════════════════════ */

import { useState, useEffect, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import { useToast } from '../lib/toast'
import {
  getChartOfAccounts, buildCOATree, createAccount, updateAccount, deleteAccount,
  TYPE_COLOR, displayAccountType, getFY, fyDateRange,
} from '../lib/accountingLib'
import { supabase } from '../lib/supabase'
import { useEntity } from '../lib/EntityContext'
import {
  ChevronRight, ChevronDown, Plus, PlusCircle, Edit2, Trash2, ArrowLeft,
  BookOpen, Loader2, Save, X, FolderOpen, Folder, FileText, GripVertical, Download,
} from 'lucide-react'
import JournalEntryModal from '../components/accounting/JournalEntryModal'

// ── Level config ──────────────────────────────────────────────────

const LEVEL_LABEL  = { 1: 'Main Account', 2: 'Account Group', 3: 'Ledger', 4: 'Sub-Ledger' }
const LEVEL_NEXT   = { 1: 'Group', 2: 'Ledger', 3: 'Sub-Ledger' }
const ACCOUNT_TYPES = ['Asset', 'Liability', 'Equity', 'Income', 'Expense']

// ── Single tree node ──────────────────────────────────────────────

function TreeNode({ node, depth, allAccounts, onAdd, onEdit, onDelete, onToggleActive, deleting,
                    dragId, dropId, dropPos, onDragStart, onDragOver, onDrop, onDragEnd }) {
  const [open, setOpen] = useState(depth < 2) // L1 and L2 open by default
  const hasChildren = node.children?.length > 0
  const c = TYPE_COLOR[node.account_type] || { bg: '#f1f5f9', text: '#475569' }

  const isL1 = node.level === 1
  const isL2 = node.level === 2
  const isL3 = node.level === 3
  const isL4 = node.level === 4
  const isDragging  = dragId === node.id
  const isDropOver  = dropId === node.id

  const indent = depth * 28

  const rowBg = isL1 ? c.bg + '44' : isL2 ? 'rgba(0,0,0,0.012)' : 'transparent'

  return (
    <div>
      {/* ── Drop indicator: BEFORE ───────────────────────────── */}
      {isDropOver && dropPos === 'before' && (
        <div style={{ height: 2, background: 'var(--accent)', margin: `0 0 0 ${indent + 16}px`, borderRadius: 2 }} />
      )}

      {/* ── Row ─────────────────────────────────────────────── */}
      <div
        draggable={!isL1}
        onDragStart={e => {
          if (isL1) { e.preventDefault(); return }
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
          display: 'flex', alignItems: 'center',
          padding: isL1 ? '12px 16px' : isL2 ? '9px 16px' : '7px 16px',
          paddingLeft: indent + 16,
          background: isDropOver && dropPos === 'on'
            ? 'var(--accent-subtle)'
            : rowBg,
          borderBottom: isDropOver && dropPos === 'after'
            ? '2px solid var(--accent)'
            : '1px solid var(--card-border)',
          gap: 8,
          opacity: isDragging ? 0.4 : 1,
          transition: 'opacity 0.12s',
          outline: isDropOver && dropPos === 'on' ? '2px solid var(--accent)' : 'none',
          outlineOffset: -2,
        }}
        onMouseEnter={e => { if (!isL1 && dropId !== node.id) e.currentTarget.style.background = 'var(--sidebar-item-hover)' }}
        onMouseLeave={e => { if (!isL1 && dropId !== node.id) e.currentTarget.style.background = rowBg }}
      >
        {/* Drag handle */}
        {!isL1 && (
          <GripVertical size={13} style={{ color: 'var(--text-3)', flexShrink: 0, cursor: 'grab', opacity: 0.5 }} />
        )}

        {/* Expand / leaf icon */}
        <button
          onClick={() => hasChildren && setOpen(o => !o)}
          style={{ background: 'none', border: 'none', cursor: hasChildren ? 'pointer' : 'default', padding: 0, display: 'flex', alignItems: 'center', color: 'var(--text-3)', flexShrink: 0, width: 18 }}
        >
          {hasChildren
            ? (open ? <ChevronDown size={14} /> : <ChevronRight size={14} />)
            : (node.level >= 3) ? <FileText size={12} color={c.text} />
            : <Folder size={13} color={c.text} />}
        </button>

        {/* Name */}
        <span
          onClick={() => hasChildren && setOpen(o => !o)}
          style={{
            flex: 1, cursor: hasChildren ? 'pointer' : 'default',
            fontSize: isL1 ? 14 : 13,
            fontWeight: isL1 ? 800 : isL2 ? 700 : isL3 ? 500 : 400,
            color: isL1 ? c.text : 'var(--text-1)',
            letterSpacing: isL1 ? '0.02em' : 'normal',
            userSelect: 'none',
          }}
        >
          {node.name}
          {(isL3 || isL4) && !node.is_active && (
            <span style={{ fontSize: 10, fontWeight: 600, marginLeft: 8, color: '#94a3b8', background: '#f1f5f9', padding: '1px 6px', borderRadius: 99 }}>Inactive</span>
          )}
        </span>

        {/* Level badge */}
        <span
          style={{ fontSize: 8, fontWeight: 700, padding: '1px 5px', borderRadius: 99, background: c.bg, color: c.text, letterSpacing: '0.05em', flexShrink: 0, cursor: 'default' }}
          onMouseEnter={e => { e.currentTarget.style.background = c.text; e.currentTarget.style.color = '#fff' }}
          onMouseLeave={e => { e.currentTarget.style.background = c.bg; e.currentTarget.style.color = c.text }}
        >
          {LEVEL_LABEL[node.level]}
        </span>

        {/* Child count */}
        {hasChildren && (
          <span style={{ fontSize: 10, color: 'var(--text-3)', flexShrink: 0 }}>
            {node.children.length} {node.level === 1 ? 'groups' : node.level === 2 ? 'ledgers' : 'sub-ledgers'}
          </span>
        )}

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
          {/* Add child (L1→Group, L2→Ledger, L3→Sub-Ledger) */}
          {node.level < 4 && (
            <button
              onClick={() => onAdd(node)}
              title={`Add ${LEVEL_NEXT[node.level]} under ${node.name}`}
              style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', background: c.bg, color: c.text, border: `1px solid ${c.bg}`, borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}
            >
              <Plus size={11} /> {LEVEL_NEXT[node.level]}
            </button>
          )}

          {/* Active/Inactive toggle (L3/L4 only) */}
          {(isL3 || isL4) && (
            <button
              onClick={() => onToggleActive(node)}
              title={node.is_active !== false ? 'Mark Inactive' : 'Mark Active'}
              style={{ padding: '3px 8px', background: node.is_active !== false ? '#f1f5f9' : '#dcfce7', color: node.is_active !== false ? '#64748b' : '#16a34a', border: 'none', borderRadius: 6, fontSize: 10, fontWeight: 700, cursor: 'pointer' }}
            >
              {node.is_active !== false ? 'Active' : 'Activate'}
            </button>
          )}

          {/* Edit (all levels) */}
          <button
            onClick={() => onEdit(node)}
            title="Edit"
            style={{ padding: '4px 8px', background: '#dbeafe', color: '#2563eb', border: 'none', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3 }}
          >
            <Edit2 size={11} />
          </button>

          {/* Delete */}
          <button
            onClick={() => onDelete(node)}
            disabled={deleting === node.id}
            title="Delete"
            style={{ padding: '4px 8px', background: '#fee2e2', color: '#b91c1c', border: 'none', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3, opacity: deleting === node.id ? 0.6 : 1 }}
          >
            {deleting === node.id ? <Loader2 size={11} className="animate-spin" /> : <Trash2 size={11} />}
          </button>
        </div>
      </div>

      {/* ── Children ────────────────────────────────────────── */}
      {open && hasChildren && (
        <div>
          {node.children.map(child => (
            <TreeNode
              key={child.id}
              node={child}
              depth={depth + 1}
              allAccounts={allAccounts}
              onAdd={onAdd}
              onEdit={onEdit}
              onDelete={onDelete}
              onToggleActive={onToggleActive}
              deleting={deleting}
              dragId={dragId}
              dropId={dropId}
              dropPos={dropPos}
              onDragStart={onDragStart}
              onDragOver={onDragOver}
              onDrop={onDrop}
              onDragEnd={onDragEnd}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ── Modal form ────────────────────────────────────────────────────

function AccountModal({ mode, node, parentNode, allAccounts, onClose, onSave, saving, initialName }) {
  const isEdit = mode === 'edit'
  const parentLevel = parentNode?.level || 0
  const thisLevel   = isEdit ? node.level : parentLevel + 1
  const fyStart = fyDateRange(getFY()).from

  const [form, setForm] = useState(() => isEdit
    ? {
        name:         node.name,
        account_type: node.account_type,
        description:  node.description || '',
        is_active:    node.is_active !== false,
        sort_order:   node.sort_order || 0,
      }
    : {
        name:         initialName || '',
        account_type: parentNode?.account_type || 'Asset',
        description:  '',
        is_active:    true,
        sort_order:   0,
      }
  )

  const s = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const c = TYPE_COLOR[form.account_type] || { bg: '#f1f5f9', text: '#475569' }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ background: 'var(--card-bg)', borderRadius: 14, width: '100%', maxWidth: 460, boxShadow: '0 24px 60px rgba(0,0,0,0.3)', overflow: 'hidden' }}>

        {/* Header */}
        <div style={{ padding: '16px 22px', borderBottom: '1px solid var(--card-border)', display: 'flex', alignItems: 'center', gap: 12, background: c.bg + '33' }}>
          <div style={{ width: 36, height: 36, borderRadius: 9, background: c.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {thisLevel >= 3 ? <FileText size={16} color={c.text} /> : <FolderOpen size={16} color={c.text} />}
          </div>
          <div style={{ flex: 1 }}>
            <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-1)', margin: 0 }}>
              {isEdit ? `Edit ${LEVEL_LABEL[thisLevel]}` : `Add ${LEVEL_LABEL[thisLevel]}`}
            </p>
            {parentNode && (
              <p style={{ fontSize: 11, color: 'var(--text-3)', margin: 0 }}>Under: <strong>{parentNode.name}</strong></p>
            )}
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', display: 'flex' }}><X size={18} /></button>
        </div>

        {/* Body */}
        <div style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 14 }}>

          <div>
            <label style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-3)', display: 'block', marginBottom: 5 }}>
              {LEVEL_LABEL[thisLevel]} Name *
            </label>
            <input
              value={form.name}
              onChange={e => s('name', e.target.value)}
              placeholder={thisLevel === 1 ? 'e.g. Assets' : thisLevel === 2 ? 'e.g. Current Assets' : 'e.g. Cash in Hand'}
              autoFocus
              style={{ width: '100%', height: 38, padding: '0 12px', border: '1.5px solid var(--card-border)', borderRadius: 8, fontSize: 13, background: 'var(--input-bg)', color: 'var(--text-1)', outline: 'none', boxSizing: 'border-box' }}
            />
          </div>

          {/* Account type — only editable on L1, locked for children */}
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-3)', display: 'block', marginBottom: 5 }}>Account Type *</label>
            {(isEdit && node.level === 1) || (!isEdit && thisLevel === 1) ? (
              <select value={form.account_type} onChange={e => s('account_type', e.target.value)}
                style={{ width: '100%', height: 38, padding: '0 12px', border: '1.5px solid var(--card-border)', borderRadius: 8, fontSize: 13, background: 'var(--input-bg)', color: 'var(--text-1)', outline: 'none' }}>
                {ACCOUNT_TYPES.map(t => <option key={t} value={t}>{displayAccountType(t)}</option>)}
              </select>
            ) : (
              <div style={{ height: 38, padding: '0 12px', border: '1.5px solid var(--card-border)', borderRadius: 8, fontSize: 13, background: c.bg + '44', color: c.text, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: c.text, flexShrink: 0 }} />
                {displayAccountType(form.account_type)}
                <span style={{ fontSize: 10, color: 'var(--text-3)', fontWeight: 400, marginLeft: 4 }}>(inherited from parent)</span>
              </div>
            )}
          </div>

          <div>
            <label style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-3)', display: 'block', marginBottom: 5 }}>Description</label>
            <input value={form.description} onChange={e => s('description', e.target.value)} placeholder="Optional"
              style={{ width: '100%', height: 38, padding: '0 12px', border: '1.5px solid var(--card-border)', borderRadius: 8, fontSize: 13, background: 'var(--input-bg)', color: 'var(--text-1)', outline: 'none', boxSizing: 'border-box' }} />
          </div>



          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <input type="checkbox" id="is_active_modal" checked={form.is_active} onChange={e => s('is_active', e.target.checked)} style={{ width: 16, height: 16, cursor: 'pointer', accentColor: c.text }} />
            <label htmlFor="is_active_modal" style={{ fontSize: 13, color: 'var(--text-1)', cursor: 'pointer' }}>Active</label>
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding: '14px 22px', borderTop: '1px solid var(--card-border)', display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '8px 18px', background: 'var(--card-bg)', border: '1.5px solid var(--card-border)', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', color: 'var(--text-2)' }}>
            Cancel
          </button>
          <button onClick={() => onSave(form, thisLevel)} disabled={saving}
            style={{ padding: '8px 22px', background: c.text, color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 7, opacity: saving ? 0.7 : 1 }}>
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            {saving ? 'Saving…' : (isEdit ? 'Update' : 'Create')}
          </button>
        </div>
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════
//  MAIN PAGE
// ════════════════════════════════════════════════════════════════

export default function ChartOfAccountsPage({ isModal = false, onClose } = {}) {
  const { profile } = useAuth()
  const toast       = useToast()
  const navigate    = useNavigate()
  const [searchParams] = useSearchParams()
  const returnTo    = searchParams.get('returnTo') || ''
  const prefill     = searchParams.get('prefill') || ''
  const { currentEntityId, currentEntity } = useEntity()

  const [accounts,    setAccounts]    = useState([])
  const [tree,        setTree]        = useState([])
  const [loading,     setLoading]     = useState(true)
  const [modal,       setModal]       = useState(null)   // { mode: 'add'|'edit', node, parentNode }
  const [saving,      setSaving]      = useState(false)
  const [deleting,    setDeleting]    = useState(null)
  const [search,      setSearch]      = useState('')
  const [showNewEntry, setShowNewEntry] = useState(false)

  // ── Drag-and-drop state ────────────────────────────────────────
  const [dragNode, setDragNode] = useState(null)
  const [dragId,   setDragId]   = useState(null)
  const [dropId,   setDropId]   = useState(null)
  const [dropPos,  setDropPos]  = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await getChartOfAccounts(false, currentEntityId)
      setAccounts(data)
      setTree(buildCOATree(data))
    } catch (e) { toast(e.message, 'error') }
    setLoading(false)
  }, [toast])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    function onKey(e) {
      // + key (Shift+= on most keyboards) — capture phase so it fires even when search input is focused
      if (e.key === '+' && !e.ctrlKey && !e.altKey) {
        e.preventDefault()
        setShowNewEntry(true)
      }
    }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [])

  // ── Filter tree by search ──────────────────────────────────────
  function filterTree(nodes, q) {
    if (!q) return nodes
    const lower = q.toLowerCase()
    return nodes.reduce((acc, node) => {
      const filteredChildren = filterTree(node.children || [], q)
      const match = node.name.toLowerCase().includes(lower)
      if (match || filteredChildren.length > 0) {
        acc.push({ ...node, children: filteredChildren })
      }
      return acc
    }, [])
  }

  const displayTree = search ? filterTree(tree, search) : tree

  // ── Stats ──────────────────────────────────────────────────────
  const totalCounts = {
    l1: accounts.filter(a => a.level === 1).length,
    l2: accounts.filter(a => a.level === 2).length,
    l3: accounts.filter(a => a.level === 3).length,
    l4: accounts.filter(a => a.level === 4).length,
  }

  // ── Excel Export ───────────────────────────────────────────────
  const [exporting, setExporting] = useState(false)

  async function exportExcel() {
    setExporting(true)
    try {
      const ExcelJS = (await import('exceljs')).default
      const wb = new ExcelJS.Workbook()
      wb.creator = 'Church CMS'
      wb.created = new Date()

      const ws = wb.addWorksheet('Chart of Accounts', {
        views: [{ state: 'frozen', ySplit: 4 }],
        pageSetup: { orientation: 'portrait', fitToPage: true, fitToWidth: 1 },
      })

      ws.columns = [
        { key: 'seq',   width: 5  },
        { key: 'level', width: 18 },
        { key: 'type',  width: 14 },
        { key: 'name',  width: 52 },
        { key: 'post',  width: 10 },
      ]

      // Title
      ws.mergeCells('A1:E1')
      const title = ws.getCell('A1')
      title.value = `Chart of Accounts — ${currentEntity?.name || 'Unknown Entity'}`
      title.font  = { bold: true, size: 16, color: { argb: 'FF1E3A5F' } }
      title.alignment = { horizontal: 'center', vertical: 'middle' }
      ws.getRow(1).height = 38

      // Entity + Date
      ws.mergeCells('A2:E2')
      const sub = ws.getCell('A2')
      sub.value = `Entity: ${currentEntity?.name || '—'}   |   Exported on ${new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' })}`
      sub.font  = { size: 10, italic: true, color: { argb: 'FF64748B' } }
      sub.alignment = { horizontal: 'center' }
      ws.getRow(2).height = 18

      // Spacer
      ws.getRow(3).height = 6

      // Header
      const hdr = ws.getRow(4)
      hdr.values = ['#', 'Level', 'Type', 'Account Name', 'Postable']
      hdr.height = 22
      hdr.eachCell(cell => {
        cell.font      = { bold: true, size: 10, color: { argb: 'FFFFFFFF' } }
        cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } }
        cell.alignment = { horizontal: 'center', vertical: 'middle' }
        cell.border    = { bottom: { style: 'medium', color: { argb: 'FFFFFFFF' } } }
      })
      ws.getCell('D4').alignment = { horizontal: 'left', vertical: 'middle' }

      // Type colour palette
      const TYPE_BG   = { Asset: 'FFE0F2FE', Liability: 'FFFEE2E2', Equity: 'FFDCFCE7', Income: 'FFDCFCE7', Expense: 'FFFFF7ED' }
      const TYPE_FONT = { Asset: 'FF1D4ED8', Liability: 'FF991B1B', Equity: 'FF166534', Income: 'FF166534', Expense: 'FF9A3412' }
      const LEVEL_LABEL = { 1: 'Main Account', 2: 'Account Group', 3: 'Ledger', 4: 'Sub-Ledger' }

      let rowIdx = 5, seq = 0

      function addNode(node, depth) {
        seq++
        const indent = '    '.repeat(depth)
        const row = ws.getRow(rowIdx++)
        row.values = [seq, LEVEL_LABEL[node.level] || '', node.account_type || '', indent + node.name, node.is_postable ? '✓' : '']
        row.height = node.level === 1 ? 22 : node.level === 2 ? 20 : 18

        if (node.level === 1) {
          const bg   = TYPE_BG[node.account_type]   || 'FFF1F5F9'
          const font = TYPE_FONT[node.account_type] || 'FF1E293B'
          row.eachCell(cell => {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } }
            cell.font = { bold: true, size: 11, color: { argb: font } }
          })
        } else if (node.level === 2) {
          row.eachCell(cell => {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } }
            cell.font = { bold: true, size: 10, color: { argb: 'FF334155' } }
          })
        } else {
          row.eachCell(cell => {
            cell.font = { size: 10, color: { argb: 'FF475569' } }
          })
        }

        row.eachCell(cell => {
          cell.border    = { bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } } }
          cell.alignment = { vertical: 'middle', horizontal: 'center' }
        })
        row.getCell(4).alignment = { vertical: 'middle', horizontal: 'left' }

        for (const child of (node.children || [])) addNode(child, depth + 1)
      }

      for (const root of tree) addNode(root, 0)

      // Footer total
      rowIdx++
      ws.mergeCells(`A${rowIdx}:E${rowIdx}`)
      const footer = ws.getCell(`A${rowIdx}`)
      footer.value = `Total: ${accounts.length} accounts`
      footer.font  = { italic: true, size: 9, color: { argb: 'FF94A3B8' } }
      footer.alignment = { horizontal: 'right' }

      const buffer = await wb.xlsx.writeBuffer()
      const blob   = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
      const url    = URL.createObjectURL(blob)
      const a      = document.createElement('a')
      a.href       = url
      const entitySlug = (currentEntity?.name || 'Entity').replace(/[^a-z0-9]/gi, '-')
      a.download   = `COA-${entitySlug}-${new Date().toISOString().slice(0, 10)}.xlsx`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      toast('Exported successfully', 'success')
    } catch (e) {
      toast('Export failed: ' + e.message, 'error')
    }
    setExporting(false)
  }

  // ── Handlers ──────────────────────────────────────────────────

  function handleAdd(parentNode) {
    setModal({ mode: 'add', node: null, parentNode, initialName: prefill || '' })
  }

  function handleEdit(node) {
    setModal({ mode: 'edit', node, parentNode: accounts.find(a => a.id === node.parent_id) || null })
  }

  async function handleDelete(node) {
    const label = LEVEL_LABEL[node.level]
    if (!window.confirm(`Delete "${node.name}"?\n\nThis ${label.toLowerCase()} will be permanently removed.`)) return
    setDeleting(node.id)
    try {
      await deleteAccount(node.id, profile.email)
      toast(`"${node.name}" deleted.`, 'success')
      load()
    } catch (e) { toast(e.message, 'error') }
    setDeleting(null)
  }

  async function handleToggleActive(node) {
    const newVal = node.is_active === false ? true : false
    try {
      const { error } = await supabase.from('chart_of_accounts').update({ is_active: newVal }).eq('id', node.id)
      if (error) throw error
      toast(`"${node.name}" marked ${newVal ? 'Active' : 'Inactive'}.`, 'success')
      load()
    } catch (e) { toast(e.message, 'error') }
  }

  async function handleSave(form, level) {
    if (!form.name.trim()) { toast('Name is required', 'error'); return }
    setSaving(true)
    try {
      const isEdit = modal.mode === 'edit'
      const parent = modal.parentNode

      // Generate a unique code
      const ts = Date.now().toString(36).toUpperCase()
      const baseCode = parent?.code ? `${parent.code}-${ts}` : ts

      const payload = {
        name:                 form.name.trim(),
        account_type:         form.account_type,
        description:          form.description || null,
        is_active:            form.is_active,
        sort_order:           Number(form.sort_order) || 0,
        level,
        is_postable:          level >= 3,
        parent_id:            parent?.id || null,
        entity_id:            currentEntityId,
        ...(!isEdit && { code: baseCode }),
      }

      if (isEdit) {
        await updateAccount(modal.node.id, payload, profile.email)
        toast(`"${form.name}" updated.`, 'success')
        setModal(null)
        load()
      } else {
        await createAccount(payload, profile.email)
        toast(`"${form.name}" created.`, 'success')
        if (returnTo) {
          navigate(returnTo)
        } else {
          setModal(null)
          load()
        }
      }
    } catch (e) { toast(e.message, 'error') }
    setSaving(false)
  }

  // ── Add a new top-level Main Account ──────────────────────────

  function handleAddMainAccount() {
    setModal({ mode: 'add', node: null, parentNode: null, initialName: prefill || '' })
  }

  // ── Drag-and-drop handlers ─────────────────────────────────────

  function getAllDescendants(nodeId, allAccs) {
    const kids = allAccs.filter(a => a.parent_id === nodeId)
    return kids.reduce((acc, k) => acc.concat(k, getAllDescendants(k.id, allAccs)), [])
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

    // Prevent dropping onto own descendant
    function isDesc(ancestorId, nodeId) {
      const n = accounts.find(a => a.id === nodeId)
      if (!n?.parent_id) return false
      if (n.parent_id === ancestorId) return true
      return isDesc(ancestorId, n.parent_id)
    }
    if (isDesc(dragNode.id, targetNode.id)) {
      toast('Cannot move an account into its own descendant', 'error')
      handleDragEnd(); return
    }

    try {
      if (dropPos === 'on') {
        // Reparent dragNode under targetNode
        const newLevel  = targetNode.level + 1
        const levelDiff = newLevel - dragNode.level
        await updateAccount(dragNode.id, {
          parent_id:    targetNode.id,
          level:        newLevel,
          account_type: targetNode.account_type,
          is_postable:  newLevel >= 3,
        }, profile.email)
        if (levelDiff !== 0) {
          const descs = getAllDescendants(dragNode.id, accounts)
          for (const d of descs)
            await supabase.from('chart_of_accounts').update({ level: d.level + levelDiff }).eq('id', d.id)
        }
      } else {
        // Reorder among targetNode's siblings (also handles cross-parent moves)
        const newParentId = targetNode.parent_id
        const newLevel    = targetNode.level
        const levelDiff   = newLevel - dragNode.level
        const siblings = accounts
          .filter(a => a.parent_id === newParentId && a.id !== dragNode.id)
          .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
        const idx = siblings.findIndex(a => a.id === targetNode.id)
        siblings.splice(dropPos === 'before' ? idx : idx + 1, 0, dragNode)
        for (let i = 0; i < siblings.length; i++) {
          if (siblings[i].id === dragNode.id) {
            await updateAccount(dragNode.id, {
              parent_id: newParentId, level: newLevel, sort_order: i * 10,
              account_type: targetNode.account_type, is_postable: newLevel >= 3,
            }, profile.email)
          } else {
            await supabase.from('chart_of_accounts').update({ sort_order: i * 10 }).eq('id', siblings[i].id)
          }
        }
        if (levelDiff !== 0) {
          const descs = getAllDescendants(dragNode.id, accounts)
          for (const d of descs)
            await supabase.from('chart_of_accounts').update({ level: d.level + levelDiff }).eq('id', d.id)
        }
      }
      toast('Account moved', 'success')
      load()
    } catch (e) { toast(e.message, 'error') }
    handleDragEnd()
  }

  return (
    <div className="page-container">

      {/* Header */}
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
            <button onClick={() => isModal ? onClose?.() : navigate('/accounting')} style={{ padding: '6px 8px', background: 'var(--accent)', border: 'none', borderRadius: 7, cursor: 'pointer', display: 'flex', alignItems: 'center', color: '#fff' }}>
              {isModal ? <X size={15} /> : <ArrowLeft size={15} />}
            </button>
            <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--accent)', whiteSpace: 'nowrap' }}>{isModal ? 'Close' : 'Accounts'}</span>
          </div>
          {!isModal && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
              <button onClick={() => navigate('/accounting/settings')} style={{ padding: '6px 8px', background: 'var(--card-bg)', border: '1.5px solid var(--card-border)', borderRadius: 7, cursor: 'pointer', display: 'flex', alignItems: 'center', color: 'var(--text-2)' }}>
                <ArrowLeft size={15} />
              </button>
              <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-3)', whiteSpace: 'nowrap' }}>Setup</span>
            </div>
          )}
          <div>
            <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
              <BookOpen size={20} style={{ color: 'var(--accent)' }} /> Chart of Accounts
            </h1>
            <p className="page-subtitle">Manage account hierarchy — Main Account → Group → Ledger</p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={exportExcel} disabled={exporting || loading}
            style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 16px', background: 'var(--card-bg)', color: '#16a34a', border: '1.5px solid #16a34a', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: exporting || loading ? 'not-allowed' : 'pointer', opacity: exporting || loading ? 0.6 : 1 }}>
            {exporting ? <Loader2 size={14} style={{ animation: 'spin 0.7s linear infinite' }} /> : <Download size={14} />}
            {exporting ? 'Exporting…' : 'Export Excel'}
          </button>
          <button onClick={handleAddMainAccount}
            style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 16px', background: 'var(--accent)', color: 'var(--accent-text)', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', boxShadow: '0 2px 8px var(--accent-ring)' }}>
            <Plus size={15} /> Add Main Account
          </button>
        </div>
      </div>

      {/* Return-to banner */}
      {returnTo && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16,
          padding: '12px 16px', background: '#eff6ff', border: '1.5px solid #bfdbfe',
          borderRadius: 10, fontSize: 13,
        }}>
          <PlusCircle size={16} style={{ color: '#2563eb', flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <strong style={{ color: '#1d4ed8' }}>
              {prefill ? `Adding "${prefill}" to Chart of Accounts` : 'Adding account to Chart of Accounts'}
            </strong>
            <span style={{ color: '#3b82f6', marginLeft: 8 }}>
              — click <strong>+</strong> next to the right parent group, then save to return automatically.
            </span>
          </div>
          <button onClick={() => navigate(returnTo)}
            style={{ padding: '5px 14px', background: 'none', border: '1.5px solid #93c5fd', borderRadius: 7, fontSize: 12, fontWeight: 600, color: '#2563eb', cursor: 'pointer', whiteSpace: 'nowrap' }}>
            Cancel &amp; Return
          </button>
        </div>
      )}

      {/* Summary + Search bar */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 20, flexWrap: 'wrap', alignItems: 'stretch' }}>
        {/* Stats */}
        {[
          { label: 'Main Accounts', count: totalCounts.l1, icon: '🗂️' },
          { label: 'Account Groups', count: totalCounts.l2, icon: '📁' },
          { label: 'Ledgers',        count: totalCounts.l3, icon: '📄' },
          { label: 'Sub-Ledgers',    count: totalCounts.l4, icon: '📋' },
        ].map(s => (
          <div key={s.label} className="card" style={{ padding: '12px 18px', display: 'flex', alignItems: 'center', gap: 12, flex: '0 0 auto' }}>
            <span style={{ fontSize: 22 }}>{s.icon}</span>
            <div>
              <p style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-1)', margin: 0, lineHeight: 1 }}>{loading ? '—' : s.count}</p>
              <p style={{ fontSize: 11, color: 'var(--text-3)', margin: 0 }}>{s.label}</p>
            </div>
          </div>
        ))}

        {/* Search */}
        <div style={{ flex: 1, minWidth: 220, position: 'relative', display: 'flex', alignItems: 'center' }}>
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search accounts…"
            style={{ width: '100%', height: 40, paddingLeft: 38, paddingRight: search ? 36 : 12, border: '1.5px solid var(--card-border)', borderRadius: 9, fontSize: 13, background: 'var(--input-bg)', color: 'var(--text-1)', outline: 'none', boxSizing: 'border-box' }}
          />
          <span style={{ position: 'absolute', left: 12, color: 'var(--text-3)', pointerEvents: 'none' }}>🔍</span>
          {search && (
            <button onClick={() => setSearch('')} style={{ position: 'absolute', right: 10, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', display: 'flex' }}>
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 14, flexWrap: 'wrap' }}>
        {[
          { icon: <FolderOpen size={13} />, label: 'Main Account — top-level grouping',  color: '#7c3aed' },
          { icon: <Folder size={13} />,     label: 'Account Group — sub-category',       color: '#2563eb' },
          { icon: <FileText size={13} />,   label: 'Ledger — postable account',          color: '#16a34a' },
          { icon: <FileText size={11} />,   label: 'Sub-Ledger — detailed posting level', color: '#c2410c' },
        ].map(l => (
          <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: l.color }}>
            {l.icon} <span style={{ color: 'var(--text-3)' }}>{l.label}</span>
          </div>
        ))}
      </div>

      {/* Tree */}
      {loading ? (
        <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--text-3)' }}>
          <Loader2 size={24} className="animate-spin" style={{ display: 'block', margin: '0 auto 10px' }} />
          Loading chart of accounts…
        </div>
      ) : displayTree.length === 0 ? (
        <div className="card" style={{ padding: '50px 20px', textAlign: 'center', color: 'var(--text-3)' }}>
          <BookOpen size={32} style={{ opacity: 0.25, display: 'block', margin: '0 auto 12px' }} />
          <p style={{ fontSize: 13, margin: '0 0 16px' }}>
            {search ? `No accounts match "${search}"` : 'No accounts yet. Start by adding a Main Account.'}
          </p>
          {!search && (
            <button onClick={handleAddMainAccount}
              style={{ padding: '9px 20px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
              Add First Account
            </button>
          )}
        </div>
      ) : (
        <div className="card" style={{ overflow: 'hidden' }}>
          {displayTree.map(root => (
            <TreeNode
              key={root.id}
              node={root}
              depth={0}
              allAccounts={accounts}
              onAdd={handleAdd}
              onEdit={handleEdit}
              onDelete={handleDelete}
              onToggleActive={handleToggleActive}
              deleting={deleting}
              dragId={dragId}
              dropId={dropId}
              dropPos={dropPos}
              onDragStart={handleDragStart}
              onDragOver={handleDragOver}
              onDrop={handleDrop}
              onDragEnd={handleDragEnd}
            />
          ))}
        </div>
      )}

      {/* Modal */}
      {modal && (
        <AccountModal
          mode={modal.mode}
          node={modal.node}
          parentNode={modal.parentNode}
          allAccounts={accounts}
          onClose={() => setModal(null)}
          onSave={handleSave}
          saving={saving}
          initialName={modal.initialName || ''}
        />
      )}
      {showNewEntry && <JournalEntryModal onClose={() => setShowNewEntry(false)} onSaved={() => {}} />}

    </div>
  )
}
