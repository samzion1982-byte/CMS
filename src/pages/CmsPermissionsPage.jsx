/* ═══════════════════════════════════════════════════════════════
   CmsPermissionsPage — Super Admin configures page access by
   Sidebar Category → item / sub-item, per role.
   ═══════════════════════════════════════════════════════════════ */

import { useState, useEffect, useCallback, useRef, Fragment } from 'react'
import { Shield, Save, Loader2, RotateCcw, CheckSquare, Square, ChevronRight } from 'lucide-react'
import { useAuth } from '../lib/AuthContext'
import { useToast } from '../lib/toast'
import { supabase } from '../lib/supabase'
import {
  CMS_CONFIG_ROLES, CMS_PAGES, CMS_PERMISSION_TREE,
  buildDefaultGrants, leafKeysUnder, aggregateState,
} from '../lib/cmsPages'
import { loadAllRolePageGrants, saveRolePageGrants } from '../lib/cmsPermissions'

function emptyMatrix() {
  const m = {}
  for (const r of CMS_CONFIG_ROLES) m[r.value] = buildDefaultGrants(r.value)
  return m
}

export default function CmsPermissionsPage() {
  const { profile, reloadPageGrants } = useAuth()
  const toast = useToast()
  const [matrix, setMatrix] = useState(emptyMatrix)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [expanded, setExpanded] = useState(() => new Set(CMS_PERMISSION_TREE.map(c => c.key)))

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await loadAllRolePageGrants(supabase)
      const next = {}
      for (const r of CMS_CONFIG_ROLES) {
        const { _custom, ...grants } = data[r.value] || buildDefaultGrants(r.value)
        next[r.value] = grants
      }
      setMatrix(next)
      setDirty(false)
    } catch (e) {
      console.error(e)
      toast(
        e.message?.includes('cms_role_page_access')
          ? 'Could not load grants — run the CMS permissions SQL migration in Supabase first.'
          : (e.message || 'Failed to load permissions'),
        'error'
      )
    }
    setLoading(false)
  }, [toast])

  useEffect(() => { load() }, [load])

  if (profile?.role !== 'super_admin') {
    return (
      <div className="page-container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 320 }}>
        <p style={{ color: 'var(--text-3)', fontSize: 14 }}>Access denied. Super Admin only.</p>
      </div>
    )
  }

  function togglePage(role, pageKey, alwaysOn) {
    if (alwaysOn) return
    setMatrix(m => ({
      ...m,
      [role]: { ...m[role], [pageKey]: !m[role]?.[pageKey] },
    }))
    setDirty(true)
  }

  /** Toggle every grantable leaf under a category or folder. */
  function toggleBranch(role, node) {
    const keys = leafKeysUnder(node).filter(k => {
      const page = CMS_PAGES.find(p => p.key === k)
      return page && !page.alwaysOn
    })
    if (!keys.length) return
    const state = aggregateState(node, matrix[role])
    const nextVal = state !== 'all'
    setMatrix(m => {
      const next = { ...m[role] }
      for (const k of keys) next[k] = nextVal
      return { ...m, [role]: next }
    })
    setDirty(true)
  }

  function setRoleAll(role, value) {
    setMatrix(m => {
      const next = { ...m[role] }
      for (const page of CMS_PAGES) {
        if (!page.alwaysOn) next[page.key] = value
      }
      return { ...m, [role]: next }
    })
    setDirty(true)
  }

  function resetDefaults() {
    setMatrix(emptyMatrix())
    setDirty(true)
  }

  function toggleExpand(key) {
    setExpanded(prev => {
      const n = new Set(prev)
      if (n.has(key)) n.delete(key)
      else n.add(key)
      return n
    })
  }

  async function handleSave() {
    setSaving(true)
    try {
      await saveRolePageGrants(supabase, matrix)
      await reloadPageGrants?.()
      toast('CMS permissions saved.', 'success')
      setDirty(false)
    } catch (e) {
      console.error(e)
      toast(
        e.message?.includes('cms_role_page_access')
          ? 'Save failed — run the CMS permissions SQL migration in Supabase first.'
          : (e.message || 'Save failed'),
        'error'
      )
    }
    setSaving(false)
  }

  return (
    <div className="page-container">
      <div className="page-header" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Shield size={20} style={{ color: 'var(--accent)' }} />
            CMS Permissions
          </h1>
          <p style={{ margin: '6px 0 0', fontSize: 13, color: 'var(--text-3)', lineHeight: 1.45 }}>
            Choose which pages each role can open. Admin, User1–User4 start at the same level
            (MAIN pages). Grant Finance, Logs, Fixed Assets, etc. here. Super Admin always has full access.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" onClick={resetDefaults} disabled={loading || saving} style={secondaryBtn}>
            <RotateCcw size={14} /> Reset to defaults
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={loading || saving || !dirty}
            style={{
              ...secondaryBtn,
              border: 'none',
              background: dirty ? 'var(--accent)' : '#e5e7eb',
              color: dirty ? '#fff' : '#9ca3af',
              cursor: dirty && !saving ? 'pointer' : 'not-allowed',
            }}
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            Save Permissions
          </button>
        </div>
      </div>

      <div className="card" style={{ overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-3)' }}>
            <Loader2 size={22} className="animate-spin" style={{ margin: '0 auto 10px' }} />
            Loading permissions…
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
              <thead>
                <tr style={{ background: 'var(--table-header-bg, var(--card-header-bg))' }}>
                  <th style={thStyle(true)}>Category / Page</th>
                  {CMS_CONFIG_ROLES.map(r => (
                    <th key={r.value} style={thStyle(false)}>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                        <span>{r.label}</span>
                        <div style={{ display: 'flex', gap: 4 }}>
                          <button type="button" title={`Allow all for ${r.label}`} onClick={() => setRoleAll(r.value, true)} style={miniBtn}>
                            <CheckSquare size={12} /> All
                          </button>
                          <button type="button" title={`Clear ${r.label}`} onClick={() => setRoleAll(r.value, false)} style={miniBtn}>
                            <Square size={12} /> None
                          </button>
                        </div>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {CMS_PERMISSION_TREE.map(cat => {
                  const open = expanded.has(cat.key)
                  return (
                    <Fragment key={cat.key}>
                      <BranchRow
                        node={cat}
                        depth={0}
                        open={open}
                        onToggleOpen={() => toggleExpand(cat.key)}
                        matrix={matrix}
                        onToggleBranch={toggleBranch}
                      />
                      {open && (cat.children || []).map(child => {
                        if (child.kind === 'folder') {
                          const folderOpen = expanded.has(child.key)
                          return (
                            <Fragment key={child.key}>
                              <BranchRow
                                node={child}
                                depth={1}
                                open={folderOpen}
                                onToggleOpen={() => toggleExpand(child.key)}
                                matrix={matrix}
                                onToggleBranch={toggleBranch}
                              />
                              {folderOpen && (child.children || []).map(leaf => (
                                <PageRow
                                  key={leaf.key}
                                  page={leaf}
                                  depth={2}
                                  matrix={matrix}
                                  onToggle={togglePage}
                                />
                              ))}
                            </Fragment>
                          )
                        }
                        return (
                          <PageRow
                            key={child.key}
                            page={child}
                            depth={1}
                            matrix={matrix}
                            onToggle={togglePage}
                          />
                        )
                      })}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

function BranchRow({ node, depth, open, onToggleOpen, matrix, onToggleBranch }) {
  const isCategory = node.kind === 'category'
  return (
    <tr style={{
      borderTop: '1px solid var(--card-border)',
      background: isCategory ? 'var(--page-bg)' : 'var(--card-header-bg, rgba(0,0,0,0.02))',
    }}>
      <td style={{ padding: '10px 16px', paddingLeft: 16 + depth * 18 }}>
        <button
          type="button"
          onClick={onToggleOpen}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            background: 'none', border: 'none', cursor: 'pointer', padding: 0,
            color: 'var(--text-1)', fontWeight: isCategory ? 800 : 700,
            fontSize: isCategory ? 11 : 13,
            letterSpacing: isCategory ? '0.1em' : 'normal',
            textTransform: isCategory ? 'uppercase' : 'none',
          }}
        >
          <ChevronRight
            size={14}
            style={{
              transform: open ? 'rotate(90deg)' : 'none',
              transition: 'transform 0.15s',
              color: 'var(--text-3)',
              flexShrink: 0,
            }}
          />
          {node.label}
          <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-3)', letterSpacing: 0, textTransform: 'none' }}>
            {isCategory ? 'category' : 'sub-category'}
          </span>
        </button>
      </td>
      {CMS_CONFIG_ROLES.map(r => (
        <td key={r.value} style={{ padding: '8px', textAlign: 'center' }}>
          <TriCheckbox
            state={aggregateState(node, matrix[r.value])}
            onChange={() => onToggleBranch(r.value, node)}
            label={`${node.label} for ${r.label}`}
          />
        </td>
      ))}
    </tr>
  )
}

function PageRow({ page, depth, matrix, onToggle }) {
  return (
    <tr style={{ borderTop: '1px solid var(--card-border)' }}>
      <td style={{
        padding: '11px 16px',
        paddingLeft: 16 + depth * 18 + 22,
        fontSize: 13,
        fontWeight: 500,
        color: 'var(--text-1)',
      }}>
                        {page.label}
                        {page.alwaysOn && (
                          <span style={{
                            marginLeft: 8, fontSize: 10, fontWeight: 700, color: 'var(--text-3)',
                            textTransform: 'uppercase', letterSpacing: '0.06em',
                          }}>
                            always on
                          </span>
                        )}
                        {page.sensitive && (
                          <span style={{
                            marginLeft: 8, fontSize: 10, fontWeight: 700, color: '#b45309',
                            background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 99,
                            padding: '1px 7px', textTransform: 'uppercase', letterSpacing: '0.04em',
                          }}>
                            sensitive
                          </span>
                        )}
      </td>
      {CMS_CONFIG_ROLES.map(r => {
        const on = !!matrix[r.value]?.[page.key]
        return (
          <td key={r.value} style={{ padding: '8px', textAlign: 'center' }}>
            <input
              type="checkbox"
              checked={on}
              disabled={page.alwaysOn}
              onChange={() => onToggle(r.value, page.key, page.alwaysOn)}
              style={{
                width: 16, height: 16,
                cursor: page.alwaysOn ? 'not-allowed' : 'pointer',
                accentColor: 'var(--accent)',
              }}
              aria-label={`${page.label} for ${r.label}`}
            />
          </td>
        )
      })}
    </tr>
  )
}

function TriCheckbox({ state, onChange, label }) {
  const ref = useRef(null)
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = state === 'some'
  }, [state])
  return (
    <input
      ref={ref}
      type="checkbox"
      checked={state === 'all'}
      onChange={onChange}
      aria-label={label}
      style={{ width: 16, height: 16, cursor: 'pointer', accentColor: 'var(--accent)' }}
    />
  )
}

const thStyle = (left) => ({
  padding: '12px 16px',
  fontSize: 11,
  fontWeight: 800,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: 'var(--text-3)',
  textAlign: left ? 'left' : 'center',
  borderBottom: '1px solid var(--card-border)',
  position: 'sticky',
  top: 0,
  background: 'var(--table-header-bg, var(--card-header-bg))',
  zIndex: 1,
})

const miniBtn = {
  display: 'inline-flex', alignItems: 'center', gap: 3,
  padding: '2px 6px', fontSize: 10, fontWeight: 700,
  borderRadius: 5, border: '1px solid var(--card-border)',
  background: 'var(--card-bg)', color: 'var(--text-3)', cursor: 'pointer',
}

const secondaryBtn = {
  display: 'inline-flex', alignItems: 'center', gap: 7, height: 38, padding: '0 14px',
  borderRadius: 8, border: '1.5px solid var(--card-border)', background: 'var(--card-bg)',
  color: 'var(--text-2)', fontSize: 13, fontWeight: 600, cursor: 'pointer',
}
