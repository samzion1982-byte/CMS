/* ═══════════════════════════════════════════════════════════════
   CmsPermissionsPage — Super Admin configures page access by
   Sidebar Category → item / sub-item, per role.
   ═══════════════════════════════════════════════════════════════ */

import { useState, useEffect, useCallback, useRef, Fragment } from 'react'
import { Shield, Save, Loader2, RotateCcw, CheckSquare, Square, ChevronRight, Users } from 'lucide-react'
import PageHeader from '../components/ui/PageHeader'
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

function personLabel(p) {
  return (p.full_name || '').trim() || p.email || 'User'
}

function initials(name = '') {
  const parts = String(name).trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

/** Soft static column palette — companion colors for each role. */
const ROLE_COL = {
  admin1: {
    ink: '#3730a3',
    bar: '#4f46e5',
    soft: 'color-mix(in srgb, #4f46e5 11%, #ffffff)',
    wash: 'color-mix(in srgb, #4f46e5 4%, transparent)',
  },
  admin: {
    ink: '#1e40af',
    bar: '#2563eb',
    soft: 'color-mix(in srgb, #2563eb 11%, #ffffff)',
    wash: 'color-mix(in srgb, #2563eb 4%, transparent)',
  },
  user: {
    ink: '#0f766e',
    bar: '#0d9488',
    soft: 'color-mix(in srgb, #0d9488 11%, #ffffff)',
    wash: 'color-mix(in srgb, #0d9488 4%, transparent)',
  },
  demo: {
    ink: '#6d28d9',
    bar: '#7c3aed',
    soft: 'color-mix(in srgb, #7c3aed 11%, #ffffff)',
    wash: 'color-mix(in srgb, #7c3aed 4%, transparent)',
  },
  user4: {
    ink: '#9a3412',
    bar: '#c2410c',
    soft: 'color-mix(in srgb, #c2410c 11%, #ffffff)',
    wash: 'color-mix(in srgb, #c2410c 4%, transparent)',
  },
}

function roleCol(role) {
  return ROLE_COL[role] || ROLE_COL.admin1
}

export default function CmsPermissionsPage() {
  const { profile, reloadPageGrants } = useAuth()
  const toast = useToast()
  const [matrix, setMatrix] = useState(emptyMatrix)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [expanded, setExpanded] = useState(() => new Set(CMS_PERMISSION_TREE.map(c => c.key)))
  /** role value → [{ full_name, email, is_active }] */
  const [rolePeople, setRolePeople] = useState({})

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const roleValues = CMS_CONFIG_ROLES.map(r => r.value)
      const [grantsData, peopleRes] = await Promise.all([
        loadAllRolePageGrants(supabase),
        supabase
          .from('profiles')
          .select('full_name, email, role, is_active')
          .in('role', roleValues)
          .order('full_name', { ascending: true }),
      ])

      const next = {}
      for (const r of CMS_CONFIG_ROLES) {
        const { _custom, ...grants } = grantsData[r.value] || buildDefaultGrants(r.value)
        next[r.value] = grants
      }
      setMatrix(next)
      setDirty(false)

      const byRole = {}
      for (const r of roleValues) byRole[r] = []
      if (peopleRes.error) {
        console.warn('[cms-permissions] could not load role names', peopleRes.error)
      } else {
        for (const row of peopleRes.data || []) {
          if (!byRole[row.role]) byRole[row.role] = []
          byRole[row.role].push({
            full_name: (row.full_name || '').trim(),
            email: row.email || '',
            is_active: row.is_active !== false,
          })
        }
      }
      setRolePeople(byRole)
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
    <div className="page-container" style={{ animation: 'cmsPermFadeIn 0.35s ease' }}>
      <style>{`
        @keyframes cmsPermFadeIn {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: none; }
        }
        @keyframes cmsPermChipIn {
          from { opacity: 0; transform: translateY(4px) scale(0.96); }
          to { opacity: 1; transform: none; }
        }
        @keyframes cmsPermBarShine {
          0% { background-position: 0% 50%; }
          100% { background-position: 200% 50%; }
        }
        .cms-perm-col-bar {
          height: 4px;
          border-radius: 4px 4px 0 0;
          margin: -14px -12px 10px;
          background-size: 200% 100%;
          animation: cmsPermBarShine 4.5s linear infinite;
        }
      `}</style>

      <PageHeader
        icon={Shield}
        title={
          <>
            CMS Permissions
            {dirty && (
              <span style={{
                fontSize: 10, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase',
                color: '#b45309', background: '#fffbeb', border: '1px solid #fde68a',
                borderRadius: 99, padding: '3px 8px', marginLeft: 10,
              }}>
                Unsaved
              </span>
            )}
          </>
        }
        subtitle="Choose which pages each role can open. Multiple people can share a role (e.g. User1). Names appear above each role column. Super Admin always has full access."
        style={{
          marginBottom: 18,
          padding: '16px 18px',
          borderRadius: 14,
          border: '1px solid var(--card-border)',
          background: 'linear-gradient(135deg, var(--card-bg) 0%, color-mix(in srgb, var(--sidebar-bg) 6%, var(--card-bg)) 100%)',
          boxShadow: '0 10px 28px rgba(15,23,42,0.06)',
        }}
      >
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
              background: dirty ? 'var(--sidebar-bg)' : '#e5e7eb',
              color: dirty ? '#fff' : '#9ca3af',
              cursor: dirty && !saving ? 'pointer' : 'not-allowed',
              boxShadow: dirty ? '0 6px 16px color-mix(in srgb, var(--sidebar-bg) 30%, transparent)' : 'none',
              transition: 'transform 0.15s ease, box-shadow 0.15s ease',
            }}
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            Save Permissions
          </button>
        </div>
      </PageHeader>

      <div className="card" style={{
        overflow: 'hidden',
        borderRadius: 14,
        border: '1px solid var(--card-border)',
        boxShadow: '0 12px 32px rgba(15,23,42,0.06)',
      }}>
        {loading ? (
          <div style={{ padding: 56, textAlign: 'center', color: 'var(--text-3)' }}>
            <Loader2 size={22} className="animate-spin" style={{ margin: '0 auto 10px' }} />
            Loading permissions…
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 780 }}>
              <thead>
                <tr style={{ background: 'linear-gradient(180deg, color-mix(in srgb, var(--sidebar-bg) 8%, #fff) 0%, var(--card-bg) 100%)' }}>
                  <th style={thStyle(true)}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                      <Users size={13} /> Category / Page
                    </span>
                  </th>
                  {CMS_CONFIG_ROLES.map(r => {
                    const people = (rolePeople[r.value] || []).filter(p => p.is_active !== false)
                    const inactive = (rolePeople[r.value] || []).filter(p => p.is_active === false)
                    const title = [
                      ...people.map(p => {
                        const n = personLabel(p)
                        return p.email && p.full_name ? `${n} <${p.email}>` : n
                      }),
                      ...inactive.map(p => `${personLabel(p)} (inactive)`),
                    ].filter(Boolean).join('\n')
                    const col = roleCol(r.value)
                    return (
                      <th
                        key={r.value}
                        style={{
                          ...thStyle(false),
                          background: `linear-gradient(180deg, ${col.soft} 0%, color-mix(in srgb, ${col.soft} 40%, #fff) 100%)`,
                          verticalAlign: 'bottom',
                          minWidth: 132,
                          borderLeft: '1px solid color-mix(in srgb, var(--card-border) 80%, transparent)',
                          boxShadow: `inset 0 -1px 0 color-mix(in srgb, ${col.bar} 18%, transparent)`,
                        }}
                        title={title || undefined}
                      >
                        <div
                          className="cms-perm-col-bar"
                          style={{
                            backgroundImage: `linear-gradient(90deg, ${col.bar} 0%, color-mix(in srgb, ${col.bar} 55%, #fff) 45%, ${col.bar} 100%)`,
                          }}
                        />
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                          {/* Names ABOVE role */}
                          <div style={{
                            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                            minHeight: 44, justifyContent: 'flex-end', width: '100%',
                          }}>
                            {people.length ? people.map((p, i) => {
                              const label = personLabel(p)
                              return (
                                <span
                                  key={`${r.value}-${p.email || label}-${i}`}
                                  title={p.email || label}
                                  style={{
                                    display: 'inline-flex', alignItems: 'center', gap: 5,
                                    maxWidth: '100%',
                                    padding: '3px 8px 3px 3px',
                                    borderRadius: 99,
                                    background: '#fff',
                                    border: `1px solid color-mix(in srgb, ${col.bar} 28%, transparent)`,
                                    color: col.ink,
                                    fontSize: 11,
                                    fontWeight: 700,
                                    textTransform: 'none',
                                    letterSpacing: 0,
                                    lineHeight: 1.2,
                                    boxShadow: `0 2px 6px color-mix(in srgb, ${col.bar} 14%, transparent)`,
                                    animation: `cmsPermChipIn 0.28s ease ${Math.min(i, 4) * 0.04}s both`,
                                  }}
                                >
                                  <span style={{
                                    width: 18, height: 18, borderRadius: '50%', flexShrink: 0,
                                    background: col.bar, color: '#fff',
                                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                    fontSize: 8, fontWeight: 800,
                                  }}>
                                    {initials(label)}
                                  </span>
                                  <span style={{
                                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                    maxWidth: 96,
                                  }}>
                                    {label}
                                  </span>
                                </span>
                              )
                            }) : (
                              <span style={{
                                fontSize: 10, fontWeight: 600, color: 'var(--text-3)',
                                textTransform: 'none', letterSpacing: 0, fontStyle: 'italic',
                              }}>
                                — unassigned —
                              </span>
                            )}
                          </div>

                          <span style={{
                            fontSize: 11, fontWeight: 800, letterSpacing: '0.1em',
                            color: '#fff',
                            padding: '4px 11px',
                            borderRadius: 7,
                            background: col.bar,
                            boxShadow: `0 3px 8px color-mix(in srgb, ${col.bar} 28%, transparent)`,
                          }}>
                            {r.label}
                          </span>

                          <div style={{ display: 'flex', gap: 5 }}>
                            <button
                              type="button"
                              title={`Allow all for ${r.label}`}
                              onClick={() => setRoleAll(r.value, true)}
                              style={{
                                ...allBtn,
                                background: col.bar,
                                boxShadow: `0 2px 6px color-mix(in srgb, ${col.bar} 30%, transparent)`,
                              }}
                            >
                              <CheckSquare size={11} /> All
                            </button>
                            <button
                              type="button"
                              title={`Clear ${r.label}`}
                              onClick={() => setRoleAll(r.value, false)}
                              style={{
                                ...noneBtn,
                                border: `1px solid color-mix(in srgb, ${col.bar} 40%, transparent)`,
                                background: '#fff',
                                color: col.ink,
                              }}
                            >
                              <Square size={11} /> None
                            </button>
                          </div>
                        </div>
                      </th>
                    )
                  })}
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
    <tr
      style={{
        borderTop: '1px solid var(--card-border)',
        background: isCategory
          ? 'color-mix(in srgb, var(--sidebar-bg) 5%, var(--page-bg))'
          : 'var(--card-header-bg, rgba(0,0,0,0.02))',
      }}
    >
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
              transition: 'transform 0.18s ease',
              color: 'var(--sidebar-bg)',
              flexShrink: 0,
            }}
          />
          {node.label}
          <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-3)', letterSpacing: 0, textTransform: 'none' }}>
            {isCategory ? 'category' : 'sub-category'}
          </span>
        </button>
      </td>
      {CMS_CONFIG_ROLES.map(r => {
        const col = roleCol(r.value)
        return (
          <td
            key={r.value}
            style={{
              padding: '8px', textAlign: 'center',
              background: col.wash,
              borderLeft: '1px solid color-mix(in srgb, var(--card-border) 70%, transparent)',
            }}
          >
            <TriCheckbox
              state={aggregateState(node, matrix[r.value])}
              onChange={() => onToggleBranch(r.value, node)}
              label={`${node.label} for ${r.label}`}
              accent={col.bar}
            />
          </td>
        )
      })}
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
        const col = roleCol(r.value)
        return (
          <td
            key={r.value}
            style={{
              padding: '8px', textAlign: 'center',
              background: col.wash,
              borderLeft: '1px solid color-mix(in srgb, var(--card-border) 70%, transparent)',
            }}
          >
            <input
              type="checkbox"
              checked={on}
              disabled={page.alwaysOn}
              onChange={() => onToggle(r.value, page.key, page.alwaysOn)}
              style={{
                width: 16, height: 16,
                cursor: page.alwaysOn ? 'not-allowed' : 'pointer',
                accentColor: col.bar,
              }}
              aria-label={`${page.label} for ${r.label}`}
            />
          </td>
        )
      })}
    </tr>
  )
}

function TriCheckbox({ state, onChange, label, accent = 'var(--sidebar-bg)' }) {
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
      style={{ width: 16, height: 16, cursor: 'pointer', accentColor: accent }}
    />
  )
}

const thStyle = (left) => ({
  padding: '14px 12px',
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
  zIndex: 2,
})

const allBtn = {
  display: 'inline-flex', alignItems: 'center', gap: 3,
  padding: '4px 8px', fontSize: 10, fontWeight: 800,
  borderRadius: 6,
  border: 'none',
  background: 'var(--sidebar-bg)',
  color: '#fff',
  cursor: 'pointer',
  boxShadow: '0 2px 6px color-mix(in srgb, var(--sidebar-bg) 28%, transparent)',
  transition: 'transform 0.12s ease, filter 0.12s ease',
}

const noneBtn = {
  display: 'inline-flex', alignItems: 'center', gap: 3,
  padding: '4px 8px', fontSize: 10, fontWeight: 800,
  borderRadius: 6,
  border: '1px solid color-mix(in srgb, var(--sidebar-bg) 35%, transparent)',
  background: 'color-mix(in srgb, var(--sidebar-bg) 12%, #fff)',
  color: 'var(--sidebar-bg)',
  cursor: 'pointer',
  transition: 'transform 0.12s ease, filter 0.12s ease',
}

const secondaryBtn = {
  display: 'inline-flex', alignItems: 'center', gap: 7, height: 38, padding: '0 14px',
  borderRadius: 8, border: '1.5px solid var(--card-border)', background: 'var(--card-bg)',
  color: 'var(--text-2)', fontSize: 13, fontWeight: 600, cursor: 'pointer',
}
