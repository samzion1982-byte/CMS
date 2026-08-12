import { useCallback, useEffect, useState } from 'react'
import {
  ArchiveRestore, Loader2, RefreshCw, RotateCcw, Search, Trash2,
} from 'lucide-react'
import { useAuth } from '../lib/AuthContext'
import { useToast } from '../lib/toast'
import {
  RECYCLE_MODULES,
  RECYCLE_BIN_RETENTION_DAYS,
  listRecycleBin,
  purgeAllRecycleBin,
  purgeRecycleBinItem,
  restoreRecycleBinItem,
} from '../lib/cmsRecycleBin'

const PAGE_SIZE = 50
const ADMIN_ROLES = ['super_admin', 'admin1', 'admin']

const STATUS_TABS = [
  { value: 'deleted',  label: 'Deleted' },
  { value: 'restored', label: 'Restored' },
  { value: 'purged',   label: 'Purged' },
]

const MODULE_STYLE = {
  events:    { bg: '#faf5ff', color: '#6b21a8' },
  assets:    { bg: '#ecfeff', color: '#0e7490' },
  finance:   { bg: '#ecfdf5', color: '#065f46' },
  members:   { bg: '#eff6ff', color: '#1e40af' },
  directory: { bg: '#f0fdfa', color: '#115e59' },
  other:     { bg: '#f1f5f9', color: '#475569' },
}

const STATUS_STYLE = {
  deleted:  { bg: '#fef2f2', color: '#b91c1c' },
  restored: { bg: '#f0fdf4', color: '#15803d' },
  purged:   { bg: '#f1f5f9', color: '#64748b' },
}

const secondaryBtn = {
  background: 'var(--card-bg)',
  color: 'var(--text-1)',
  border: '1px solid var(--card-border)',
  gap: 5,
  fontSize: 12,
  padding: '7px 12px',
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

function Pill({ text, styleMap }) {
  const style = styleMap[text] || { bg: '#f1f5f9', color: '#475569' }
  return (
    <span style={{
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
    }}>
      {labelize(text)}
    </span>
  )
}

export default function RecycleBinPage() {
  const { profile } = useAuth()
  const toast = useToast()
  const canAccess = ADMIN_ROLES.includes(profile?.role)

  const [status, setStatus] = useState('deleted')
  const [moduleFilter, setModuleFilter] = useState('')
  const [qInput, setQInput] = useState('')
  const [q, setQ] = useState('')
  const [page, setPage] = useState(0)
  const [rows, setRows] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [busyId, setBusyId] = useState(null)
  const [purgingAll, setPurgingAll] = useState(false)

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const load = useCallback(async (pageOverride = page) => {
    setLoading(true)
    setError(null)
    try {
      const { rows: data, total: count } = await listRecycleBin({
        module: moduleFilter || null,
        search: q,
        page: pageOverride,
        pageSize: PAGE_SIZE,
        status,
      })
      setRows(data)
      setTotal(count)
    } catch (err) {
      console.error(err)
      setError(err?.message || 'Failed to load recycle bin')
      setRows([])
      setTotal(0)
    } finally {
      setLoading(false)
    }
  }, [moduleFilter, q, page, status])

  useEffect(() => { setPage(0) }, [status, moduleFilter, q])

  useEffect(() => {
    if (!canAccess) return
    load(page)
  }, [canAccess, load, page])

  async function handleRestore(row) {
    const kind = row?.payload?.kind
    const isCloseUndo = kind === 'close_year_undo'
    const isBulk = kind === 'table_snapshot' || isCloseUndo
    const count = isBulk ? (row.payload?.rows?.length || 0) : 1
    const toFy = row?.payload?.meta?.to_fy || row?.payload?.meta?.financial_year
    const fromFy = row?.payload?.meta?.from_fy
    const msg = isCloseUndo
      ? `Undo Close Year${fromFy ? ` ${fromFy}` : ''}?\n\nThis replaces FY ${toFy || '?'} with the pre-close state (${count} row(s) — often empty, which clears the carried balances).`
      : isBulk
        ? `Restore auction tracker snapshot "${row.record_label || row.record_id}"?\n\nThis replaces the current FY data with ${count} saved member row(s).`
        : `Restore "${row.record_label || row.record_id}" back into ${row.table_name}?`
    if (!window.confirm(msg)) return
    setBusyId(row.id)
    try {
      await restoreRecycleBinItem(row.id, profile)
      toast(
        isCloseUndo
          ? `Close Year undone — FY ${toFy || ''} restored to prior state.`
          : isBulk
            ? `Restored ${count} auction tracker rows.`
            : 'Record restored successfully.',
        'success',
      )
      await load(page)
    } catch (err) {
      toast(err?.message || 'Restore failed', 'error')
    } finally {
      setBusyId(null)
    }
  }

  async function handlePurge(row) {
    if (!window.confirm(`Permanently discard snapshot for "${row.record_label || row.record_id}"?\n\nThis cannot be undone.`)) return
    setBusyId(row.id)
    try {
      await purgeRecycleBinItem(row.id, profile)
      toast('Snapshot purged.', 'success')
      await load(page)
    } catch (err) {
      toast(err?.message || 'Purge failed', 'error')
    } finally {
      setBusyId(null)
    }
  }

  async function handlePurgeAll() {
    if (!window.confirm('Permanently discard ALL deleted snapshots in the recycle bin?\n\nRestorable items will be lost. This cannot be undone.')) return
    setPurgingAll(true)
    try {
      const n = await purgeAllRecycleBin(profile)
      toast(`Purged ${n} snapshot${n !== 1 ? 's' : ''}.`, 'success')
      await load(0)
      setPage(0)
    } catch (err) {
      toast(err?.message || 'Purge all failed', 'error')
    } finally {
      setPurgingAll(false)
    }
  }

  if (!canAccess) {
    return (
      <div className="page-container animate-fade-in" style={{ fontFamily: 'var(--font-ui)' }}>
        <p style={{ color: 'var(--text-3)', fontSize: 13 }}>Recycle Bin is available to Admin users only.</p>
      </div>
    )
  }

  return (
    <div className="page-container animate-fade-in" style={{ fontFamily: 'var(--font-ui)' }}>
      <div className="page-header" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
        <div>
          <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 8, margin: 0, fontSize: 20 }}>
            <ArchiveRestore size={18} style={{ color: 'var(--accent)', flexShrink: 0 }} />
            Recycle Bin
          </h1>
          <p className="page-subtitle" style={{ margin: '4px 0 0', fontSize: 12 }}>
            Soft-deleted records from Events, Assets, and Finance. Photos/files are held in quarantine until you Restore or Purge.
            {' '}Items older than {RECYCLE_BIN_RETENTION_DAYS} days are auto-purged.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <button type="button" className="action-btn" onClick={() => load(page)} disabled={loading} style={secondaryBtn}>
            {loading ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
            Refresh
          </button>
          {status === 'deleted' && (
            <button
              type="button"
              className="action-btn"
              onClick={handlePurgeAll}
              disabled={purgingAll || !total}
              style={{ background: '#dc2626', opacity: purgingAll || !total ? 0.55 : 1, gap: 5, fontSize: 12, padding: '7px 12px' }}
            >
              {purgingAll ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
              Purge all
            </button>
          )}
        </div>
      </div>

      {/* Status tabs */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
        {STATUS_TABS.map(tab => {
          const on = status === tab.value
          return (
            <button
              key={tab.value}
              type="button"
              onClick={() => setStatus(tab.value)}
              style={{
                fontSize: 12,
                fontWeight: 600,
                padding: '6px 14px',
                borderRadius: 8,
                border: on ? 'none' : '1px solid var(--card-border)',
                background: on ? 'var(--sidebar-bg, #0d2244)' : 'var(--card-bg)',
                color: on ? '#fff' : 'var(--text-2)',
                cursor: 'pointer',
              }}
            >
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* Filters */}
      <div style={{
        display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'flex-end', marginBottom: 12,
        padding: '10px 12px', background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: 10,
      }}>
        <div className="field-group" style={{ minWidth: 140 }}>
          <label className="field-label">Module</label>
          <select
            className="field-input"
            value={moduleFilter}
            onChange={(e) => setModuleFilter(e.target.value)}
            style={{ minWidth: 140, fontSize: 12, height: 32 }}
          >
            {RECYCLE_MODULES.map((m) => (
              <option key={m.value || 'all'} value={m.value}>{m.label}</option>
            ))}
          </select>
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
                placeholder="Label, table, id, deleted by…"
                value={qInput}
                onChange={(e) => setQInput(e.target.value)}
              />
            </div>
          </div>
          <button type="submit" className="action-btn" style={{ ...secondaryBtn, height: 32 }}>Search</button>
        </form>
        <div style={{ fontSize: 12, color: 'var(--text-3)', paddingBottom: 6, whiteSpace: 'nowrap' }}>
          {loading ? 'Loading…' : `${total} item${total === 1 ? '' : 's'}`}
          {!loading && totalPages > 1 ? ` · ${page + 1}/${totalPages}` : ''}
        </div>
      </div>

      {error && (
        <div style={{ marginBottom: 12, padding: '10px 12px', borderRadius: 8, background: '#fef2f2', color: '#b91c1c', fontSize: 12 }}>
          {error}
        </div>
      )}

      <div style={{
        background: 'var(--card-bg)',
        border: '1px solid var(--card-border)',
        borderRadius: 12,
        overflow: 'hidden',
      }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: 'color-mix(in srgb, var(--sidebar-bg) 8%, #fff)', textAlign: 'left' }}>
                <th style={th}>Deleted</th>
                <th style={th}>Module</th>
                <th style={th}>Record</th>
                <th style={th}>Table</th>
                <th style={th}>Deleted by</th>
                <th style={th}>Status</th>
                <th style={{ ...th, textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && !rows.length ? (
                <tr>
                  <td colSpan={7} style={{ padding: 28, textAlign: 'center', color: 'var(--text-3)' }}>
                    <Loader2 size={16} className="animate-spin" style={{ verticalAlign: 'middle', marginRight: 8 }} />
                    Loading…
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ padding: 36, textAlign: 'center', color: 'var(--text-3)' }}>
                    No {status} snapshots found.
                  </td>
                </tr>
              ) : rows.map((row) => {
                const busy = busyId === row.id
                return (
                  <tr key={row.id} style={{ borderTop: '1px solid var(--card-border)' }}>
                    <td style={td}>{formatWhen(row.deleted_at)}</td>
                    <td style={td}><Pill text={row.module || 'other'} styleMap={MODULE_STYLE} /></td>
                    <td style={td}>
                      <div style={{ fontWeight: 600, color: 'var(--text-1)' }}>{row.record_label || row.record_id}</div>
                      <div style={{ fontSize: 10, color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}>{row.record_id}</div>
                    </td>
                    <td style={{ ...td, fontFamily: 'var(--font-mono)', fontSize: 11 }}>{row.table_name}</td>
                    <td style={td}>
                      <div>{row.deleted_by_name || '—'}</div>
                      <div style={{ fontSize: 10, color: 'var(--text-3)' }}>{row.deleted_by_email || ''}</div>
                    </td>
                    <td style={td}><Pill text={row.status} styleMap={STATUS_STYLE} /></td>
                    <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                      {row.status === 'deleted' ? (
                        <>
                          <button
                            type="button"
                            className="action-btn"
                            disabled={busy}
                            onClick={() => handleRestore(row)}
                            style={{
                              background: '#16a34a', gap: 4, fontSize: 11, padding: '5px 10px',
                              marginRight: 6, opacity: busy ? 0.6 : 1,
                            }}
                          >
                            {busy ? <Loader2 size={12} className="animate-spin" /> : <RotateCcw size={12} />}
                            Restore
                          </button>
                          <button
                            type="button"
                            className="action-btn"
                            disabled={busy}
                            onClick={() => handlePurge(row)}
                            style={{
                              background: '#fff', color: '#b91c1c', border: '1px solid #fecaca',
                              gap: 4, fontSize: 11, padding: '5px 10px', opacity: busy ? 0.6 : 1,
                            }}
                          >
                            <Trash2 size={12} />
                            Purge
                          </button>
                        </>
                      ) : row.status === 'restored' ? (
                        <span style={{ fontSize: 11, color: 'var(--text-3)' }}>
                          Restored {formatWhen(row.restored_at)}
                          {row.restored_by_email ? ` · ${row.restored_by_email}` : ''}
                        </span>
                      ) : (
                        <span style={{ fontSize: 11, color: 'var(--text-3)' }}>
                          Purged {formatWhen(row.purged_at)}
                        </span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div style={{
            display: 'flex', justifyContent: 'flex-end', gap: 8, alignItems: 'center',
            padding: '10px 12px', borderTop: '1px solid var(--card-border)',
          }}>
            <button
              type="button"
              className="action-btn"
              style={secondaryBtn}
              disabled={page <= 0 || loading}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
            >
              Prev
            </button>
            <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{page + 1} / {totalPages}</span>
            <button
              type="button"
              className="action-btn"
              style={secondaryBtn}
              disabled={page >= totalPages - 1 || loading}
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            >
              Next
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

const th = {
  padding: '10px 12px',
  fontSize: 10,
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  color: 'var(--text-3)',
  whiteSpace: 'nowrap',
}

const td = {
  padding: '10px 12px',
  verticalAlign: 'top',
  color: 'var(--text-1)',
}
