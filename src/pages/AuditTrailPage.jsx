import { useCallback, useEffect, useState } from 'react'
import { FileSpreadsheet, RefreshCw, Search, History, Loader2 } from 'lucide-react'
import { useAuth } from '../lib/AuthContext'
import { ROLE_LABELS } from '../lib/auth'
import { AUDIT_ACTIONS, AUDIT_MODULES, getCmsAuditLogs } from '../lib/cmsAudit'
import { exportToExcel } from '../lib/exportExcel'

const PAGE_SIZE = 50
const ADMIN_ROLES = ['super_admin', 'admin1', 'admin']

const MODULE_STYLE = {
  members: { bg: '#eff6ff', color: '#1e40af' },
  events:  { bg: '#faf5ff', color: '#6b21a8' },
  assets:  { bg: '#ecfeff', color: '#0e7490' },
  finance: { bg: '#ecfdf5', color: '#065f46' },
}

const ACTION_STYLE = {
  created:         { bg: '#ecfdf5', color: '#047857' },
  updated:         { bg: '#eff6ff', color: '#1d4ed8' },
  saved:           { bg: '#eff6ff', color: '#1d4ed8' },
  deleted:         { bg: '#fef2f2', color: '#b91c1c' },
  deactivated:     { bg: '#fff7ed', color: '#c2410c' },
  activated:       { bg: '#ecfdf5', color: '#047857' },
  restored:        { bg: '#f0fdf4', color: '#15803d' },
  posted:          { bg: '#faf5ff', color: '#7e22ce' },
  moved:           { bg: '#ecfeff', color: '#0e7490' },
  transferred:     { bg: '#fdf4ff', color: '#a21caf' },
}

function formatWhen(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return String(iso)
  const p = (n) => String(n).padStart(2, '0')
  return `${p(d.getDate())}-${p(d.getMonth() + 1)}-${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`
}

function labelize(s) {
  return String(s || '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

function formatChangesList(changes) {
  if (!changes) return []
  if (Array.isArray(changes)) {
    return changes.map((c) => {
      const from = c.from == null || c.from === '' ? '∅' : String(c.from)
      const to = c.to == null || c.to === '' ? '∅' : String(c.to)
      return `${c.field}: ${from} → ${to}`
    })
  }
  if (typeof changes === 'object') {
    return Object.keys(changes).map((k) => `${k}: ${String(changes[k])}`)
  }
  return [String(changes)]
}

function Pill({ text, styleMap, fallback }) {
  const style = styleMap[text] || fallback || { bg: '#f1f5f9', color: '#475569' }
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '3px 9px',
        borderRadius: 999,
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: '0.02em',
        background: style.bg,
        color: style.color,
        whiteSpace: 'nowrap',
        lineHeight: 1.3,
      }}
    >
      {labelize(text)}
    </span>
  )
}

const thStyle = {
  padding: '10px 12px',
  textAlign: 'left',
  fontSize: 11,
  fontWeight: 700,
  color: 'var(--text-3)',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  whiteSpace: 'nowrap',
  borderBottom: '1px solid var(--card-border)',
  background: 'var(--table-header-bg)',
  position: 'sticky',
  top: 0,
  zIndex: 1,
}

const tdStyle = {
  padding: '12px',
  verticalAlign: 'top',
  borderBottom: '1px solid var(--table-border)',
  fontSize: 13,
  color: 'var(--text-1)',
}

export default function AuditTrailPage() {
  const { profile } = useAuth()
  const [rows, setRows] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)
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

  const exportExcel = async () => {
    setExporting(true)
    try {
      const { data: all } = await getCmsAuditLogs({
        module: moduleFilter,
        action: actionFilter,
        q,
        limit: 10000,
        offset: 0,
      })
      const columns = [
        { header: 'When',      key: 'when',      width: 18 },
        { header: 'Module',    key: 'module',    width: 16 },
        { header: 'Action',    key: 'action',    width: 14 },
        { header: 'User',      key: 'user',      width: 24 },
        { header: 'Role',      key: 'role',      width: 14 },
        { header: 'Email',     key: 'email',     width: 28 },
        { header: 'Summary',   key: 'summary',   width: 40 },
        { header: 'Entity',    key: 'entity',    width: 22 },
        { header: 'Entity ID', key: 'entity_id', width: 16 },
        { header: 'Changes',   key: 'changes',   width: 50 },
      ]
      const excelRows = (all || []).map((r) => ({
        when: formatWhen(r.created_at),
        module: labelize(r.module),
        action: labelize(r.action),
        user: r.actor_name || '—',
        role: ROLE_LABELS[r.actor_role] || r.actor_role || '—',
        email: r.actor_email || '—',
        summary: r.summary || '—',
        entity: r.entity_label || r.entity_type || '—',
        entity_id: r.entity_id || '—',
        changes: formatChangesList(r.changes).join(' | ') || '—',
      }))
      const date = new Date().toISOString().slice(0, 10)
      await exportToExcel(columns, excelRows, 'Audit Trail', `cms-audit-trail-${date}.xlsx`)
    } catch (err) {
      setError(err?.message || 'Excel export failed')
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="page-container animate-fade-in">
      <div className="page-header" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 16 }}>
        <div>
          <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 8, margin: 0 }}>
            <History size={20} style={{ color: 'var(--accent)', flexShrink: 0 }} />
            Audit Trail
          </h1>
          <p className="page-subtitle" style={{ margin: '6px 0 0' }}>
            Who changed what across Members, Events, Assets, and Finance.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-secondary" onClick={() => load(page)} disabled={loading} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            {loading ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
            Refresh
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={exportExcel}
            disabled={exporting || !total}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            {exporting ? <Loader2 size={15} className="animate-spin" /> : <FileSpreadsheet size={15} />}
            {exporting ? 'Exporting…' : 'Export Excel'}
          </button>
        </div>
      </div>

      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 10,
          alignItems: 'flex-end',
          marginBottom: 14,
          padding: '12px 14px',
          background: 'var(--card-bg)',
          border: '1px solid var(--card-border)',
          borderRadius: 10,
        }}
      >
        <div style={{ minWidth: 150 }}>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--text-3)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Module
          </label>
          <select className="form-control" value={moduleFilter} onChange={(e) => setModuleFilter(e.target.value)} style={{ minWidth: 150 }}>
            {AUDIT_MODULES.map((m) => (
              <option key={m.value || 'all'} value={m.value}>{m.label}</option>
            ))}
          </select>
        </div>
        <div style={{ minWidth: 140 }}>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--text-3)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Action
          </label>
          <select className="form-control" value={actionFilter} onChange={(e) => setActionFilter(e.target.value)} style={{ minWidth: 140 }}>
            {AUDIT_ACTIONS.map((a) => (
              <option key={a.value || 'all'} value={a.value}>{a.label}</option>
            ))}
          </select>
        </div>
        <form
          onSubmit={(e) => { e.preventDefault(); setQ(qInput.trim()) }}
          style={{ flex: 1, minWidth: 220, display: 'flex', gap: 8, alignItems: 'flex-end' }}
        >
          <div style={{ flex: 1 }}>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--text-3)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Search
            </label>
            <div style={{ position: 'relative' }}>
              <Search size={15} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)', pointerEvents: 'none' }} />
              <input
                className="form-control"
                style={{ paddingLeft: 32 }}
                placeholder="User, summary, entity…"
                value={qInput}
                onChange={(e) => setQInput(e.target.value)}
              />
            </div>
          </div>
          <button type="submit" className="btn btn-secondary">Search</button>
        </form>
        <div style={{ marginLeft: 'auto', fontSize: 13, color: 'var(--text-3)', paddingBottom: 8, whiteSpace: 'nowrap' }}>
          {loading ? 'Loading…' : `${total} entr${total === 1 ? 'y' : 'ies'}`}
          {!loading && totalPages > 1 ? ` · Page ${page + 1}/${totalPages}` : ''}
        </div>
      </div>

      {error && (
        <div className="alert alert-error" style={{ marginBottom: 14 }}>
          {error}
          {/relation .* does not exist|cms_audit_log/i.test(error) && (
            <div style={{ marginTop: 8, fontSize: '0.9rem' }}>
              Run migration <code>supabase/migrations/20260809_cms_audit_log.sql</code> in the Supabase SQL Editor, then refresh.
            </div>
          )}
        </div>
      )}

      <div
        style={{
          background: 'var(--card-bg)',
          border: '1px solid var(--card-border)',
          borderRadius: 10,
          overflow: 'hidden',
        }}
      >
        {loading && !rows.length ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, height: 160, color: 'var(--text-3)' }}>
            <Loader2 size={18} className="animate-spin" />
            <span style={{ fontSize: 13 }}>Loading…</span>
          </div>
        ) : !loading && !rows.length ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 160, color: 'var(--text-3)', fontSize: 13, padding: 24, textAlign: 'center' }}>
            No audit entries yet. Changes to Members, Events, Assets, and Finance will appear here.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table
              style={{
                width: '100%',
                minWidth: 960,
                borderCollapse: 'collapse',
                tableLayout: 'fixed',
              }}
            >
              <colgroup>
                <col style={{ width: 140 }} />
                <col style={{ width: 120 }} />
                <col style={{ width: 110 }} />
                <col style={{ width: 200 }} />
                <col style={{ width: 260 }} />
                <col />
              </colgroup>
              <thead>
                <tr>
                  {['When', 'Module', 'Action', 'User', 'Summary', 'Changes'].map((h) => (
                    <th key={h} style={thStyle}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const roleLabel = ROLE_LABELS[r.actor_role] || r.actor_role || ''
                  const changeLines = formatChangesList(r.changes)
                  return (
                    <tr
                      key={r.id}
                      style={{ background: 'transparent' }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--table-row-hover)' }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
                    >
                      <td style={{ ...tdStyle, whiteSpace: 'nowrap', fontFamily: 'var(--font-mono, monospace)', fontSize: 12, color: 'var(--text-2)' }}>
                        {formatWhen(r.created_at)}
                      </td>
                      <td style={tdStyle}>
                        <Pill text={r.module} styleMap={MODULE_STYLE} />
                      </td>
                      <td style={tdStyle}>
                        <Pill text={r.action} styleMap={ACTION_STYLE} />
                      </td>
                      <td style={tdStyle}>
                        <div style={{ fontWeight: 600, fontSize: 13, lineHeight: 1.35, wordBreak: 'break-word' }}>
                          {r.actor_name || r.actor_email || '—'}
                        </div>
                        {(roleLabel || r.actor_email) && (
                          <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 3, lineHeight: 1.35, wordBreak: 'break-word' }}>
                            {[roleLabel, r.actor_email].filter(Boolean).join(' · ')}
                          </div>
                        )}
                      </td>
                      <td style={tdStyle}>
                        <div style={{ fontWeight: 500, lineHeight: 1.4, wordBreak: 'break-word' }}>
                          {r.summary || '—'}
                        </div>
                        {(r.entity_label || r.entity_type || r.entity_id) && (
                          <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 4, lineHeight: 1.35, wordBreak: 'break-word' }}>
                            {[r.entity_label, r.entity_type, r.entity_id].filter(Boolean).join(' · ')}
                          </div>
                        )}
                      </td>
                      <td style={{ ...tdStyle, fontSize: 12, color: 'var(--text-2)', lineHeight: 1.45, wordBreak: 'break-word' }}>
                        {!changeLines.length ? (
                          '—'
                        ) : (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                            {changeLines.slice(0, 8).map((line, i) => (
                              <div key={i}>{line}</div>
                            ))}
                            {changeLines.length > 8 && (
                              <div style={{ color: 'var(--text-3)' }}>+{changeLines.length - 8} more</div>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {totalPages > 1 && (
          <div style={{ padding: '10px 12px', borderTop: '1px solid var(--card-border)', display: 'flex', justifyContent: 'center', gap: 8 }}>
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
