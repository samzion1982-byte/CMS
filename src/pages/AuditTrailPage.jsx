import { useCallback, useEffect, useState } from 'react'
import { Download, RefreshCw, Search, History } from 'lucide-react'
import { useAuth } from '../lib/AuthContext'
import { AUDIT_ACTIONS, AUDIT_MODULES, getCmsAuditLogs } from '../lib/cmsAudit'

const PAGE_SIZE = 50
const ADMIN_ROLES = ['super_admin', 'admin1', 'admin']

function formatWhen(iso) {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString()
  } catch {
    return String(iso)
  }
}

function summarizeChanges(changes) {
  if (!changes) return '—'
  if (Array.isArray(changes)) {
    if (!changes.length) return '—'
    return changes
      .slice(0, 6)
      .map((c) => {
        const from = c.from == null || c.from === '' ? '∅' : String(c.from).slice(0, 36)
        const to = c.to == null || c.to === '' ? '∅' : String(c.to).slice(0, 36)
        return `${c.field}: ${from} → ${to}`
      })
      .join(' · ')
  }
  if (typeof changes === 'object') {
    const keys = Object.keys(changes).slice(0, 6)
    return keys.length ? keys.join(', ') : '—'
  }
  return String(changes).slice(0, 120)
}

function toCsvValue(v) {
  const s = v == null ? '' : String(v)
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

export default function AuditTrailPage() {
  const { profile } = useAuth()
  const [rows, setRows] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [moduleFilter, setModuleFilter] = useState('')
  const [actionFilter, setActionFilter] = useState('')
  const [qInput, setQInput] = useState('')
  const [q, setQ] = useState('')
  const [page, setPage] = useState(0)

  const load = useCallback(async (p = 0) => {
    setLoading(true)
    setError('')
    try {
      const { data, count } = await getCmsAuditLogs({
        module: moduleFilter,
        action: actionFilter,
        q,
        limit: PAGE_SIZE,
        offset: p * PAGE_SIZE,
      })
      setRows(data)
      setTotal(count)
      setPage(p)
    } catch (err) {
      setError(err?.message || 'Failed to load audit trail')
      setRows([])
      setTotal(0)
    } finally {
      setLoading(false)
    }
  }, [moduleFilter, actionFilter, q])

  useEffect(() => {
    load(0)
  }, [load])

  if (!ADMIN_ROLES.includes(profile?.role)) {
    return (
      <div className="page-container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 280 }}>
        <p style={{ color: 'var(--text-3)', fontSize: 14 }}>Access denied — Admin access required.</p>
      </div>
    )
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const exportCsv = () => {
    const header = ['When', 'Module', 'Action', 'Entity', 'Entity ID', 'Label', 'Actor', 'Role', 'Summary', 'Changes']
    const lines = [header.join(',')]
    for (const r of rows) {
      lines.push(
        [
          formatWhen(r.created_at),
          r.module,
          r.action,
          r.entity_type || '',
          r.entity_id || '',
          r.entity_label || '',
          r.actor_name || r.actor_email || '',
          r.actor_role || '',
          r.summary || '',
          JSON.stringify(r.changes || []),
        ]
          .map(toCsvValue)
          .join(',')
      )
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `cms-audit-trail-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="page-container">
      <div className="page-header" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ display: 'flex', alignItems: 'center', gap: 10, margin: 0 }}>
            <History size={22} /> Audit Trail
          </h1>
          <p style={{ margin: '6px 0 0', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
            Who changed what across the CMS — create, update, and delete actions.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-secondary" onClick={() => load(page)} disabled={loading}>
            <RefreshCw size={16} /> Refresh
          </button>
          <button type="button" className="btn btn-secondary" onClick={exportCsv} disabled={!rows.length}>
            <Download size={16} /> Export CSV
          </button>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end' }}>
          <div className="form-group" style={{ marginBottom: 0, minWidth: 160 }}>
            <label>Module</label>
            <select className="form-control" value={moduleFilter} onChange={(e) => setModuleFilter(e.target.value)}>
              {AUDIT_MODULES.map((m) => (
                <option key={m.value || 'all'} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>
          <div className="form-group" style={{ marginBottom: 0, minWidth: 140 }}>
            <label>Action</label>
            <select className="form-control" value={actionFilter} onChange={(e) => setActionFilter(e.target.value)}>
              {AUDIT_ACTIONS.map((a) => (
                <option key={a.value || 'all'} value={a.value}>
                  {a.label}
                </option>
              ))}
            </select>
          </div>
          <form
            className="form-group"
            style={{ marginBottom: 0, flex: 1, minWidth: 200 }}
            onSubmit={(e) => {
              e.preventDefault()
              setQ(qInput.trim())
            }}
          >
            <label>Search</label>
            <div style={{ position: 'relative', display: 'flex', gap: 8 }}>
              <div style={{ position: 'relative', flex: 1 }}>
                <Search
                  size={16}
                  style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}
                />
                <input
                  className="form-control"
                  style={{ paddingLeft: 34 }}
                  placeholder="Actor, summary, entity…"
                  value={qInput}
                  onChange={(e) => setQInput(e.target.value)}
                />
              </div>
              <button type="submit" className="btn btn-secondary">
                Search
              </button>
            </div>
          </form>
        </div>
        <p style={{ margin: '12px 0 0', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
          {loading ? 'Loading…' : `${total} entr${total === 1 ? 'y' : 'ies'}`}
          {!loading && totalPages > 1 ? ` · Page ${page + 1} of ${totalPages}` : ''}
        </p>
      </div>

      {error && (
        <div className="alert alert-error" style={{ marginBottom: 16 }}>
          {error}
          {/relation .* does not exist|cms_audit_log/i.test(error) && (
            <div style={{ marginTop: 8, fontSize: '0.9rem' }}>
              Run migration <code>supabase/migrations/20260809_cms_audit_log.sql</code> in the Supabase SQL Editor, then refresh.
            </div>
          )}
        </div>
      )}

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table" style={{ margin: 0 }}>
            <thead>
              <tr>
                <th>When</th>
                <th>Module</th>
                <th>Action</th>
                <th>Actor</th>
                <th>Summary</th>
                <th>Changes</th>
              </tr>
            </thead>
            <tbody>
              {!loading && rows.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: 32, color: 'var(--text-muted)' }}>
                    No audit entries yet. Changes to Members, Events, Assets, Finance, Users, and Church Setup will appear here.
                  </td>
                </tr>
              )}
              {rows.map((r) => (
                <tr key={r.id}>
                  <td style={{ whiteSpace: 'nowrap', fontSize: '0.85rem' }}>{formatWhen(r.created_at)}</td>
                  <td>
                    <span className="badge badge-secondary" style={{ textTransform: 'capitalize' }}>
                      {(r.module || '').replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td style={{ textTransform: 'capitalize', fontWeight: 600 }}>{(r.action || '').replace(/_/g, ' ')}</td>
                  <td>
                    <div style={{ fontWeight: 600 }}>{r.actor_name || r.actor_email || '—'}</div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      {[r.actor_role, r.actor_email].filter(Boolean).join(' · ')}
                    </div>
                  </td>
                  <td style={{ maxWidth: 280 }}>
                    <div>{r.summary || '—'}</div>
                    {(r.entity_label || r.entity_type || r.entity_id) && (
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                        {[r.entity_label, r.entity_type, r.entity_id].filter(Boolean).join(' · ')}
                      </div>
                    )}
                  </td>
                  <td style={{ maxWidth: 360, fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                    {summarizeChanges(r.changes)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {totalPages > 1 && (
          <div style={{ padding: 12, borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'center', gap: 8 }}>
            <button type="button" className="btn btn-secondary" disabled={loading || page <= 0} onClick={() => load(page - 1)}>
              Previous
            </button>
            <button type="button" className="btn btn-secondary" disabled={loading || page + 1 >= totalPages} onClick={() => load(page + 1)}>
              Next
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
