import { useCallback, useEffect, useRef, useState } from 'react'
import { FileSpreadsheet, RefreshCw, Search, History, Loader2, Trash2, X } from 'lucide-react'
import { useAuth } from '../lib/AuthContext'
import { useToast } from '../lib/toast'
import { ROLE_LABELS } from '../lib/auth'
import { supabase, getChurch } from '../lib/supabase'
import { AUDIT_ACTIONS, AUDIT_MODULES, flushCmsAuditLogs, getCmsAuditLogs } from '../lib/cmsAudit'
import { exportToExcelWithTitle } from '../lib/exportExcel'

const PAGE_SIZE = 50
const ADMIN_ROLES = ['super_admin', 'admin1', 'admin']

const MODULE_STYLE = {
  members: { bg: '#eff6ff', color: '#1e40af' },
  events:  { bg: '#faf5ff', color: '#6b21a8' },
  assets:  { bg: '#ecfeff', color: '#0e7490' },
  finance: { bg: '#ecfdf5', color: '#065f46' },
}

const ACTION_STYLE = {
  created:     { bg: '#ecfdf5', color: '#047857' },
  updated:     { bg: '#eff6ff', color: '#1d4ed8' },
  saved:       { bg: '#eff6ff', color: '#1d4ed8' },
  deleted:     { bg: '#fef2f2', color: '#b91c1c' },
  deactivated: { bg: '#fff7ed', color: '#c2410c' },
  activated:   { bg: '#ecfdf5', color: '#047857' },
  restored:    { bg: '#f0fdf4', color: '#15803d' },
  posted:      { bg: '#faf5ff', color: '#7e22ce' },
  moved:       { bg: '#ecfeff', color: '#0e7490' },
  transferred: { bg: '#fdf4ff', color: '#a21caf' },
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

function Pill({ text, styleMap }) {
  const style = styleMap[text] || { bg: '#f1f5f9', color: '#475569' }
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '2px 7px',
        borderRadius: 999,
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: '0.02em',
        background: style.bg,
        color: style.color,
        whiteSpace: 'nowrap',
        lineHeight: 1.3,
        fontFamily: 'var(--font-ui)',
      }}
    >
      {labelize(text)}
    </span>
  )
}

const thStyle = {
  padding: '8px 10px',
  textAlign: 'left',
  fontSize: 10,
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
  fontFamily: 'var(--font-ui)',
}

const tdStyle = {
  padding: '8px 10px',
  verticalAlign: 'top',
  borderBottom: '1px solid var(--table-border)',
  fontSize: 12,
  color: 'var(--text-1)',
  fontFamily: 'var(--font-ui)',
}

/** Secondary action-btn: visible on light surfaces (default action-btn text is white). */
const secondaryBtn = {
  gap: 5,
  fontSize: 12,
  padding: '7px 12px',
  background: 'var(--card-bg)',
  color: 'var(--text-1)',
  border: '1.5px solid var(--card-border)',
  boxShadow: 'none',
}

function fmtDispDate(iso) {
  if (!iso) return ''
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

export default function AuditTrailPage() {
  const { profile } = useAuth()
  const toast = useToast()
  const [church, setChurch] = useState(null)
  const [rows, setRows] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState('')
  const [moduleFilter, setModuleFilter] = useState('')
  const [actionFilter, setActionFilter] = useState('')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [qInput, setQInput] = useState('')
  const [q, setQ] = useState('')
  const [page, setPage] = useState(0)

  const [showFlush, setShowFlush] = useState(false)
  const [flushFrom, setFlushFrom] = useState('')
  const [flushTo, setFlushTo] = useState('')
  const [flushPw, setFlushPw] = useState('')
  const [flushPwErr, setFlushPwErr] = useState(false)
  const [flushing, setFlushing] = useState(false)
  const flushPwRef = useRef(null)

  useEffect(() => {
    getChurch().then(setChurch).catch(() => {})
  }, [])

  const load = useCallback(async (p = 0) => {
    setLoading(true)
    setError('')
    try {
      const { data, count } = await getCmsAuditLogs({
        module: moduleFilter,
        action: actionFilter,
        q,
        from: fromDate,
        to: toDate,
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
  }, [moduleFilter, actionFilter, q, fromDate, toDate])

  useEffect(() => {
    load(0)
  }, [load])

  if (!ADMIN_ROLES.includes(profile?.role)) {
    return (
      <div className="page-container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 280 }}>
        <p style={{ color: 'var(--text-3)', fontSize: 13, fontFamily: 'var(--font-ui)' }}>Access denied — Admin access required.</p>
      </div>
    )
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const openFlush = () => {
    setFlushFrom(fromDate || '')
    setFlushTo(toDate || '')
    setFlushPw('')
    setFlushPwErr(false)
    setShowFlush(true)
    setTimeout(() => flushPwRef.current?.focus(), 80)
  }

  const doFlush = async () => {
    if (!flushFrom || !flushTo) {
      toast('Select From and To dates.', 'error')
      return
    }
    if (!flushPw || flushing) return
    setFlushPwErr(false)
    setFlushing(true)
    try {
      const { error: authErr } = await supabase.auth.signInWithPassword({
        email: profile.email,
        password: flushPw,
      })
      if (authErr) {
        setFlushPwErr(true)
        setFlushing(false)
        setTimeout(() => flushPwRef.current?.focus(), 30)
        return
      }
      const count = await flushCmsAuditLogs({ from: flushFrom, to: flushTo })
      toast(`Flushed ${count} audit entr${count === 1 ? 'y' : 'ies'}.`, 'success')
      setShowFlush(false)
      load(0)
    } catch (err) {
      toast(err?.message || 'Flush failed', 'error')
    } finally {
      setFlushing(false)
    }
  }

  const exportExcel = async () => {
    setExporting(true)
    try {
      const { data: all } = await getCmsAuditLogs({
        module: moduleFilter,
        action: actionFilter,
        q,
        from: fromDate,
        to: toDate,
        limit: 10000,
        offset: 0,
      })
      const columns = [
        { header: 'When',      key: 'when',      width: 18, align: 'center' },
        { header: 'Module',    key: 'module',    width: 16, align: 'center' },
        { header: 'Action',    key: 'action',    width: 14, align: 'center' },
        { header: 'User',      key: 'user',      width: 24, align: 'left' },
        { header: 'Role',      key: 'role',      width: 14, align: 'center' },
        { header: 'Email',     key: 'email',     width: 28, align: 'left' },
        { header: 'Summary',   key: 'summary',   width: 40, align: 'left' },
        { header: 'Entity',    key: 'entity',    width: 22, align: 'left' },
        { header: 'Entity ID', key: 'entity_id', width: 16, align: 'center' },
        { header: 'Changes',   key: 'changes',   width: 50, align: 'left' },
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

      const churchName = church?.church_name || 'Church'
      const diocese = church?.diocese ? `${church.diocese}` : ''
      const rangeLabel = fromDate || toDate
        ? `Period: ${fmtDispDate(fromDate) || '…'} – ${fmtDispDate(toDate) || '…'}`
        : 'Period: All dates'
      const filterBits = [
        moduleFilter ? `Module: ${labelize(moduleFilter)}` : null,
        actionFilter ? `Action: ${labelize(actionFilter)}` : null,
        q ? `Search: ${q}` : null,
      ].filter(Boolean).join(' · ')

      const titleLines = [
        { text: churchName, bold: true, size: 14, bg: '1E3A5F', color: 'FFFFFF' },
        ...(diocese ? [{ text: diocese, size: 10, bg: '1E3A5F', color: 'D1D5DB' }] : []),
        { text: 'Audit Trail', bold: true, size: 12, bg: 'EEF3FA', color: '1E3A5F' },
        { text: `${rangeLabel}${filterBits ? `  |  ${filterBits}` : ''}  |  Generated ${formatWhen(new Date().toISOString())}`, size: 9, italic: true },
      ]

      const date = new Date().toISOString().slice(0, 10)
      await exportToExcelWithTitle(columns, excelRows, 'Audit Trail', `cms-audit-trail-${date}.xlsx`, titleLines)
    } catch (err) {
      toast(err?.message || 'Excel export failed', 'error')
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="page-container animate-fade-in" style={{ fontFamily: 'var(--font-ui)' }}>
      <div className="page-header" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
        <div>
          <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 8, margin: 0, fontSize: 20 }}>
            <History size={18} style={{ color: 'var(--accent)', flexShrink: 0 }} />
            Audit Trail
          </h1>
          <p className="page-subtitle" style={{ margin: '4px 0 0', fontSize: 12 }}>
            Who changed what across Members, Events, Assets, and Finance.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <button type="button" className="action-btn" onClick={() => load(page)} disabled={loading} style={secondaryBtn}>
            {loading ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
            Refresh
          </button>
          <button
            type="button"
            className="action-btn"
            onClick={exportExcel}
            disabled={exporting || !total}
            style={{ background: '#16a34a', opacity: exporting || !total ? 0.6 : 1, gap: 5, fontSize: 12, padding: '7px 12px' }}
          >
            {exporting ? <Loader2 size={13} className="animate-spin" /> : <FileSpreadsheet size={13} />}
            {exporting ? 'Exporting…' : 'Excel Export'}
          </button>
          <button
            type="button"
            className="action-btn"
            onClick={openFlush}
            style={{ background: '#dc2626', gap: 5, fontSize: 12, padding: '7px 12px' }}
          >
            <Trash2 size={13} /> Flush
          </button>
        </div>
      </div>

      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 8,
          alignItems: 'flex-end',
          marginBottom: 12,
          padding: '10px 12px',
          background: 'var(--card-bg)',
          border: '1px solid var(--card-border)',
          borderRadius: 10,
        }}
      >
        <div className="field-group" style={{ minWidth: 130 }}>
          <label className="field-label">Module</label>
          <select className="field-input" value={moduleFilter} onChange={(e) => setModuleFilter(e.target.value)} style={{ minWidth: 130, fontSize: 12, height: 32 }}>
            {AUDIT_MODULES.map((m) => (
              <option key={m.value || 'all'} value={m.value}>{m.label}</option>
            ))}
          </select>
        </div>
        <div className="field-group" style={{ minWidth: 120 }}>
          <label className="field-label">Action</label>
          <select className="field-input" value={actionFilter} onChange={(e) => setActionFilter(e.target.value)} style={{ minWidth: 120, fontSize: 12, height: 32 }}>
            {AUDIT_ACTIONS.map((a) => (
              <option key={a.value || 'all'} value={a.value}>{a.label}</option>
            ))}
          </select>
        </div>
        <div className="field-group" style={{ minWidth: 130 }}>
          <label className="field-label">From</label>
          <input type="date" className="field-input" value={fromDate} onChange={(e) => setFromDate(e.target.value)} style={{ fontSize: 12, height: 32 }} />
        </div>
        <div className="field-group" style={{ minWidth: 130 }}>
          <label className="field-label">To</label>
          <input type="date" className="field-input" value={toDate} onChange={(e) => setToDate(e.target.value)} style={{ fontSize: 12, height: 32 }} />
        </div>
        <form
          onSubmit={(e) => { e.preventDefault(); setQ(qInput.trim()) }}
          style={{ flex: 1, minWidth: 200, display: 'flex', gap: 6, alignItems: 'flex-end' }}
        >
          <div className="field-group" style={{ flex: 1 }}>
            <label className="field-label">Search</label>
            <div style={{ position: 'relative' }}>
              <Search size={13} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)', pointerEvents: 'none' }} />
              <input
                className="field-input"
                style={{ paddingLeft: 28, fontSize: 12, height: 32 }}
                placeholder="User, summary, entity…"
                value={qInput}
                onChange={(e) => setQInput(e.target.value)}
              />
            </div>
          </div>
          <button type="submit" className="action-btn" style={{ ...secondaryBtn, height: 32 }}>Search</button>
        </form>
        <div style={{ fontSize: 12, color: 'var(--text-3)', paddingBottom: 6, whiteSpace: 'nowrap', fontFamily: 'var(--font-ui)' }}>
          {loading ? 'Loading…' : `${total} entr${total === 1 ? 'y' : 'ies'}`}
          {!loading && totalPages > 1 ? ` · ${page + 1}/${totalPages}` : ''}
        </div>
      </div>

      {error && (
        <div className="alert alert-error" style={{ marginBottom: 12, fontSize: 12 }}>
          {error}
          {/relation .* does not exist|cms_audit_log|permission denied|policy/i.test(error) && (
            <div style={{ marginTop: 6 }}>
              If flush fails, run <code>supabase/migrations/20260809_cms_audit_log_delete.sql</code> in Supabase.
            </div>
          )}
        </div>
      )}

      <div style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: 10, overflow: 'hidden' }}>
        {loading && !rows.length ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, height: 140, color: 'var(--text-3)', fontSize: 12 }}>
            <Loader2 size={16} className="animate-spin" /> Loading…
          </div>
        ) : !loading && !rows.length ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 140, color: 'var(--text-3)', fontSize: 12, padding: 20, textAlign: 'center' }}>
            No audit entries for this filter.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', minWidth: 900, borderCollapse: 'collapse', tableLayout: 'fixed' }}>
              <colgroup>
                <col style={{ width: 120 }} />
                <col style={{ width: 100 }} />
                <col style={{ width: 90 }} />
                <col style={{ width: 170 }} />
                <col style={{ width: 230 }} />
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
                      <td style={{ ...tdStyle, whiteSpace: 'nowrap', fontFamily: 'var(--font-mono, monospace)', fontSize: 11, color: 'var(--text-2)' }}>
                        {formatWhen(r.created_at)}
                      </td>
                      <td style={tdStyle}><Pill text={r.module} styleMap={MODULE_STYLE} /></td>
                      <td style={tdStyle}><Pill text={r.action} styleMap={ACTION_STYLE} /></td>
                      <td style={tdStyle}>
                        <div style={{ fontWeight: 600, fontSize: 12, lineHeight: 1.3, wordBreak: 'break-word' }}>
                          {r.actor_name || r.actor_email || '—'}
                        </div>
                        {(roleLabel || r.actor_email) && (
                          <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 2, lineHeight: 1.3, wordBreak: 'break-word' }}>
                            {[roleLabel, r.actor_email].filter(Boolean).join(' · ')}
                          </div>
                        )}
                      </td>
                      <td style={tdStyle}>
                        <div style={{ fontWeight: 500, fontSize: 12, lineHeight: 1.35, wordBreak: 'break-word' }}>
                          {r.summary || '—'}
                        </div>
                        {(r.entity_label || r.entity_type || r.entity_id) && (
                          <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 2, lineHeight: 1.3, wordBreak: 'break-word' }}>
                            {[r.entity_label, r.entity_type, r.entity_id].filter(Boolean).join(' · ')}
                          </div>
                        )}
                      </td>
                      <td style={{ ...tdStyle, fontSize: 11, color: 'var(--text-2)', lineHeight: 1.4, wordBreak: 'break-word' }}>
                        {!changeLines.length ? '—' : (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                            {changeLines.slice(0, 6).map((line, i) => <div key={i}>{line}</div>)}
                            {changeLines.length > 6 && <div style={{ color: 'var(--text-3)' }}>+{changeLines.length - 6} more</div>}
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
          <div style={{ padding: '8px 10px', borderTop: '1px solid var(--card-border)', display: 'flex', justifyContent: 'center', gap: 8 }}>
            <button type="button" className="action-btn" disabled={loading || page <= 0} onClick={() => load(page - 1)} style={{ ...secondaryBtn, padding: '6px 10px' }}>
              Previous
            </button>
            <button type="button" className="action-btn" disabled={loading || page + 1 >= totalPages} onClick={() => load(page + 1)} style={{ ...secondaryBtn, padding: '6px 10px' }}>
              Next
            </button>
          </div>
        )}
      </div>

      {showFlush && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
          onClick={(e) => { if (e.target === e.currentTarget && !flushing) setShowFlush(false) }}
        >
          <div style={{ background: 'var(--card-bg)', borderRadius: 12, width: '100%', maxWidth: 420, boxShadow: '0 20px 50px rgba(0,0,0,0.3)', overflow: 'hidden', fontFamily: 'var(--font-ui)' }}>
            <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--card-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Trash2 size={16} color="#dc2626" />
                <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>Flush Audit Trail</h3>
              </div>
              <button type="button" onClick={() => !flushing && setShowFlush(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 4 }}>
                <X size={16} />
              </button>
            </div>
            <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <p style={{ margin: 0, fontSize: 12, color: 'var(--text-2)', lineHeight: 1.45 }}>
                Permanently delete audit entries between the dates below. This cannot be undone.
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div className="field-group">
                  <label className="field-label">From</label>
                  <input type="date" className="field-input" value={flushFrom} onChange={(e) => setFlushFrom(e.target.value)} style={{ fontSize: 12, height: 34 }} />
                </div>
                <div className="field-group">
                  <label className="field-label">To</label>
                  <input type="date" className="field-input" value={flushTo} onChange={(e) => setFlushTo(e.target.value)} style={{ fontSize: 12, height: 34 }} />
                </div>
              </div>
              <div className="field-group">
                <label className="field-label">Confirm with your password</label>
                <input
                  ref={flushPwRef}
                  type="password"
                  className="field-input"
                  value={flushPw}
                  onChange={(e) => { setFlushPw(e.target.value); setFlushPwErr(false) }}
                  onKeyDown={(e) => e.key === 'Enter' && doFlush()}
                  placeholder="Login password"
                  style={{ fontSize: 12, height: 34, borderColor: flushPwErr ? '#dc2626' : undefined }}
                  autoComplete="current-password"
                />
                {flushPwErr && <span style={{ fontSize: 11, color: '#dc2626' }}>Incorrect password</span>}
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
                <button type="button" className="action-btn" disabled={flushing} onClick={() => setShowFlush(false)} style={secondaryBtn}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="action-btn"
                  disabled={flushing || !flushFrom || !flushTo || !flushPw}
                  onClick={doFlush}
                  style={{ background: '#dc2626', fontSize: 12, padding: '7px 12px', opacity: flushing || !flushFrom || !flushTo || !flushPw ? 0.6 : 1 }}
                >
                  {flushing ? <><Loader2 size={13} className="animate-spin" /> Flushing…</> : 'Flush entries'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
