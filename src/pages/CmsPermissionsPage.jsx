/* ═══════════════════════════════════════════════════════════════
   CmsPermissionsPage — Super Admin configures which pages each
   role (Admin1 / Admin / User / Demo) may open in the CMS.
   ═══════════════════════════════════════════════════════════════ */

import { useState, useEffect, useCallback, Fragment } from 'react'
import { Shield, Save, Loader2, RotateCcw, CheckSquare, Square } from 'lucide-react'
import { useAuth } from '../lib/AuthContext'
import { useToast } from '../lib/toast'
import { supabase } from '../lib/supabase'
import { CMS_CONFIG_ROLES, CMS_PAGES, groupedPages, buildDefaultGrants } from '../lib/cmsPages'
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
          ? 'Permissions table missing — run the CMS permissions SQL migration in Supabase.'
          : (e.message || 'Failed to load permissions'),
        'error'
      )
      setMatrix(emptyMatrix())
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

  function toggle(role, pageKey, alwaysOn) {
    if (alwaysOn) return
    setMatrix(m => ({
      ...m,
      [role]: { ...m[role], [pageKey]: !m[role]?.[pageKey] },
    }))
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

  const groups = groupedPages()

  return (
    <div className="page-container">
      <div className="page-header" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Shield size={20} style={{ color: 'var(--accent)' }} />
            CMS Permissions
          </h1>
          <p style={{ margin: '6px 0 0', fontSize: 13, color: 'var(--text-3)', lineHeight: 1.45 }}>
            Choose which pages each role can open. Super Admin always has full access.
            Users, Import Data, and this page stay Super Admin only.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={resetDefaults}
            disabled={loading || saving}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 7, height: 38, padding: '0 14px',
              borderRadius: 8, border: '1.5px solid var(--card-border)', background: 'var(--card-bg)',
              color: 'var(--text-2)', fontSize: 13, fontWeight: 600, cursor: 'pointer',
            }}
          >
            <RotateCcw size={14} /> Reset to defaults
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={loading || saving || !dirty}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 7, height: 38, padding: '0 16px',
              borderRadius: 8, border: 'none',
              background: dirty ? 'var(--accent)' : '#e5e7eb',
              color: dirty ? '#fff' : '#9ca3af',
              fontSize: 13, fontWeight: 700,
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
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 640 }}>
              <thead>
                <tr style={{ background: 'var(--table-header-bg, var(--card-header-bg))' }}>
                  <th style={thStyle(true)}>Page</th>
                  {CMS_CONFIG_ROLES.map(r => (
                    <th key={r.value} style={thStyle(false)}>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                        <span>{r.label}</span>
                        <div style={{ display: 'flex', gap: 4 }}>
                          <button type="button" title={`Allow all for ${r.label}`} onClick={() => setRoleAll(r.value, true)}
                            style={miniBtn}>
                            <CheckSquare size={12} /> All
                          </button>
                          <button type="button" title={`Clear ${r.label}`} onClick={() => setRoleAll(r.value, false)}
                            style={miniBtn}>
                            <Square size={12} /> None
                          </button>
                        </div>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {groups.map(g => (
                  <Fragment key={`g-${g.group}`}>
                    <tr>
                      <td colSpan={1 + CMS_CONFIG_ROLES.length} style={{
                        padding: '10px 16px', fontSize: 11, fontWeight: 800, letterSpacing: '0.1em',
                        textTransform: 'uppercase', color: 'var(--text-3)',
                        background: 'var(--page-bg)', borderTop: '1px solid var(--card-border)',
                      }}>
                        {g.group}
                      </td>
                    </tr>
                    {g.pages.map(page => (
                      <tr key={page.key} style={{ borderTop: '1px solid var(--card-border)' }}>
                        <td style={{ padding: '12px 16px', fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>
                          {page.label}
                          {page.alwaysOn && (
                            <span style={{
                              marginLeft: 8, fontSize: 10, fontWeight: 700, color: 'var(--text-3)',
                              textTransform: 'uppercase', letterSpacing: '0.06em',
                            }}>
                              always on
                            </span>
                          )}
                        </td>
                        {CMS_CONFIG_ROLES.map(r => {
                          const on = !!matrix[r.value]?.[page.key]
                          return (
                            <td key={r.value} style={{ padding: '10px 8px', textAlign: 'center' }}>
                              <input
                                type="checkbox"
                                checked={on}
                                disabled={page.alwaysOn}
                                onChange={() => toggle(r.value, page.key, page.alwaysOn)}
                                style={{ width: 16, height: 16, cursor: page.alwaysOn ? 'not-allowed' : 'pointer', accentColor: 'var(--accent)' }}
                                aria-label={`${page.label} for ${r.label}`}
                              />
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
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
