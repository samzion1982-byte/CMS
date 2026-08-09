import { useCallback, useEffect, useState } from 'react'
import {
  Archive, Cloud, Database, Download, HardDrive, History, Loader2,
  RefreshCw, Search, Trash2, Undo2,
} from 'lucide-react'
import { useAuth } from '../lib/AuthContext'
import { useToast } from '../lib/toast'
import {
  formatBytes,
  listBackupLogs,
  runManualFullBackup,
  triggerServerFullBackup,
} from '../lib/cmsFullBackup'
import {
  listRecycleBin,
  purgeAllRecycleBin,
  purgeRecycleBinItem,
  RECYCLE_MODULES,
  restoreRecycleBinItem,
} from '../lib/cmsRecycleBin'
import { useNavigate } from 'react-router-dom'

const ADMIN_ROLES = ['super_admin', 'admin1', 'admin']

const secondaryBtn = {
  gap: 5,
  fontSize: 12,
  padding: '7px 12px',
  background: 'var(--card-bg)',
  color: 'var(--text-1)',
  border: '1.5px solid var(--card-border)',
  boxShadow: 'none',
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
  fontFamily: 'var(--font-ui)',
}

const tdStyle = {
  padding: '8px 10px',
  verticalAlign: 'middle',
  borderBottom: '1px solid var(--table-border)',
  fontSize: 12,
  color: 'var(--text-1)',
  fontFamily: 'var(--font-ui)',
}

function formatWhen(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return String(iso)
  const p = (n) => String(n).padStart(2, '0')
  return `${p(d.getDate())}-${p(d.getMonth() + 1)}-${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`
}

function labelize(s) {
  return String(s || '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

function StatusPill({ status }) {
  const map = {
    success: { bg: '#ecfdf5', color: '#047857' },
    partial: { bg: '#fff7ed', color: '#c2410c' },
    failed: { bg: '#fef2f2', color: '#b91c1c' },
    pending: { bg: '#f1f5f9', color: '#475569' },
    deleted: { bg: '#fef2f2', color: '#b91c1c' },
    restored: { bg: '#ecfdf5', color: '#047857' },
  }
  const style = map[status] || map.pending
  return (
    <span style={{
      display: 'inline-block', padding: '2px 7px', borderRadius: 999,
      fontSize: 10, fontWeight: 700, background: style.bg, color: style.color,
      fontFamily: 'var(--font-ui)',
    }}>
      {labelize(status)}
    </span>
  )
}

export default function BackupPage() {
  const { profile } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const [tab, setTab] = useState('full') // full | snapshot

  if (!ADMIN_ROLES.includes(profile?.role)) {
    return (
      <div style={{ padding: 32, fontFamily: 'var(--font-ui)', color: 'var(--text-2)' }}>
        You do not have access to Backup &amp; Restore.
      </div>
    )
  }

  return (
    <div style={{ padding: '20px 24px 40px', maxWidth: 1100, margin: '0 auto', fontFamily: 'var(--font-ui)' }}>
      <div style={{ marginBottom: 18 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: 'var(--text-1)', letterSpacing: '-0.02em' }}>
          Backup &amp; Restore
        </h1>
        <p style={{ margin: '6px 0 0', fontSize: 13, color: 'var(--text-3)', lineHeight: 1.45 }}>
          Full Backup copies the whole database. Snapshot lets you restore a single record after accidental deletion.
        </p>
      </div>

      <div style={{
        display: 'flex', gap: 6, marginBottom: 20,
        borderBottom: '1px solid var(--card-border)', paddingBottom: 0,
      }}>
        {[
          { id: 'full', label: 'Full Backup', icon: Database },
          { id: 'snapshot', label: 'Snapshot', icon: Archive },
        ].map(({ id, label, icon: Icon }) => {
          const active = tab === id
          return (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 7,
                padding: '10px 16px', border: 'none', cursor: 'pointer',
                background: 'transparent',
                color: active ? 'var(--text-1)' : 'var(--text-3)',
                fontWeight: active ? 700 : 500, fontSize: 13,
                borderBottom: active ? '2px solid var(--accent, #0f766e)' : '2px solid transparent',
                marginBottom: -1, fontFamily: 'var(--font-ui)',
              }}
            >
              <Icon size={15} /> {label}
            </button>
          )
        })}
      </div>

      {tab === 'full' ? <FullBackupTab profile={profile} toast={toast} /> : (
        <SnapshotTab profile={profile} toast={toast} navigate={navigate} />
      )}
    </div>
  )
}

function FullBackupTab({ profile, toast }) {
  const [running, setRunning] = useState(false)
  const [serverRunning, setServerRunning] = useState(false)
  const [logs, setLogs] = useState([])
  const [loadingLogs, setLoadingLogs] = useState(true)

  const loadLogs = useCallback(async () => {
    setLoadingLogs(true)
    try {
      const { rows } = await listBackupLogs({ pageSize: 40 })
      setLogs(rows)
    } catch (e) {
      toast(e.message || 'Failed to load backup history', 'error')
    } finally {
      setLoadingLogs(false)
    }
  }, [toast])

  useEffect(() => { loadLogs() }, [loadLogs])

  async function handleManual() {
    setRunning(true)
    try {
      const r = await runManualFullBackup(profile)
      if (r.driveFileId) {
        toast(`Full backup saved — ${r.tablesCount} tables, ${r.rowsCount} rows. Copied to Google Drive.`, 'success')
      } else if (r.storagePath) {
        toast(`Full backup downloaded & stored (${formatBytes(r.bytes)}). Add Google Drive secrets to auto-copy to Drive.`, 'success')
      } else {
        toast(`Full backup downloaded (${formatBytes(r.bytes)}). ${r.errorMessage || ''}`, r.status === 'failed' ? 'error' : 'success')
      }
      await loadLogs()
    } catch (e) {
      toast(e.message || 'Backup failed', 'error')
    } finally {
      setRunning(false)
    }
  }

  async function handleServer() {
    setServerRunning(true)
    try {
      const r = await triggerServerFullBackup(profile)
      if (r.drive_file_id) {
        toast(`Server backup complete — Drive file created.`, 'success')
      } else if (r.drive_skipped) {
        toast(`Server backup stored in cms-backups. Configure Google Drive secrets for Drive copies.`, 'success')
      } else {
        toast(`Server backup: ${r.status || 'done'}`, 'success')
      }
      await loadLogs()
    } catch (e) {
      toast(e.message || 'Server backup failed (deploy cms-full-backup function if missing)', 'error')
    } finally {
      setServerRunning(false)
    }
  }

  return (
    <div>
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
        gap: 14, marginBottom: 22,
      }}>
        <div style={{
          padding: 18, borderRadius: 12, border: '1px solid var(--card-border)',
          background: 'var(--card-bg)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <Download size={16} color="#0f766e" />
            <strong style={{ fontSize: 14 }}>Manual Full Backup</strong>
          </div>
          <p style={{ margin: '0 0 14px', fontSize: 12, color: 'var(--text-3)', lineHeight: 1.5 }}>
            Export the whole database as JSON now. File downloads to your device and is also saved to secure storage.
          </p>
          <button
            type="button"
            className="action-btn"
            disabled={running}
            onClick={handleManual}
            style={{ gap: 6, fontSize: 12, padding: '8px 14px' }}
          >
            {running ? <Loader2 size={14} className="spin" /> : <HardDrive size={14} />}
            {running ? 'Backing up…' : 'Run Full Backup'}
          </button>
        </div>

        <div style={{
          padding: 18, borderRadius: 12, border: '1px solid var(--card-border)',
          background: 'var(--card-bg)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <Cloud size={16} color="#0369a1" />
            <strong style={{ fontSize: 14 }}>Automatic + Google Drive</strong>
          </div>
          <p style={{ margin: '0 0 10px', fontSize: 12, color: 'var(--text-3)', lineHeight: 1.5 }}>
            Daily automatic backup runs at 2:00 AM IST via Edge Function. When Drive secrets are set, a copy is uploaded to your Google Drive folder.
          </p>
          <ul style={{ margin: '0 0 14px', paddingLeft: 18, fontSize: 11, color: 'var(--text-3)', lineHeight: 1.55 }}>
            <li><code>GOOGLE_SERVICE_ACCOUNT_JSON</code></li>
            <li><code>GOOGLE_DRIVE_FOLDER_ID</code></li>
          </ul>
          <button
            type="button"
            disabled={serverRunning}
            onClick={handleServer}
            style={secondaryBtn}
            className="action-btn"
          >
            {serverRunning ? <Loader2 size={14} className="spin" /> : <Cloud size={14} />}
            {serverRunning ? 'Running…' : 'Run Server Backup Now'}
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <History size={15} color="var(--text-3)" />
          <strong style={{ fontSize: 13 }}>Backup history</strong>
        </div>
        <button type="button" className="action-btn" style={secondaryBtn} onClick={loadLogs} disabled={loadingLogs}>
          <RefreshCw size={13} /> Refresh
        </button>
      </div>

      <div style={{ overflow: 'auto', border: '1px solid var(--card-border)', borderRadius: 10, background: 'var(--card-bg)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={thStyle}>When</th>
              <th style={thStyle}>Mode</th>
              <th style={thStyle}>Status</th>
              <th style={thStyle}>Tables</th>
              <th style={thStyle}>Rows</th>
              <th style={thStyle}>Size</th>
              <th style={thStyle}>Drive</th>
              <th style={thStyle}>File</th>
            </tr>
          </thead>
          <tbody>
            {loadingLogs ? (
              <tr><td colSpan={8} style={{ ...tdStyle, textAlign: 'center', color: 'var(--text-3)' }}>Loading…</td></tr>
            ) : !logs.length ? (
              <tr><td colSpan={8} style={{ ...tdStyle, textAlign: 'center', color: 'var(--text-3)' }}>No backups yet</td></tr>
            ) : logs.map((row) => (
              <tr key={row.id}>
                <td style={tdStyle}>{formatWhen(row.created_at)}</td>
                <td style={tdStyle}>{labelize(row.trigger_mode)}</td>
                <td style={tdStyle}><StatusPill status={row.status} /></td>
                <td style={tdStyle}>{row.tables_count ?? '—'}</td>
                <td style={tdStyle}>{row.rows_count ?? '—'}</td>
                <td style={tdStyle}>{formatBytes(row.file_size_bytes)}</td>
                <td style={tdStyle}>
                  {row.drive_web_link ? (
                    <a href={row.drive_web_link} target="_blank" rel="noreferrer" style={{ color: '#0369a1', fontWeight: 600 }}>
                      Open
                    </a>
                  ) : row.drive_file_id ? 'Yes' : '—'}
                </td>
                <td style={{ ...tdStyle, fontSize: 11, color: 'var(--text-3)' }}>{row.download_filename || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function SnapshotTab({ profile, toast, navigate }) {
  const [rows, setRows] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [module, setModule] = useState('')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState(null)
  const PAGE_SIZE = 40

  const load = useCallback(async (pageNum = page, mod = module, q = search) => {
    setLoading(true)
    try {
      const { rows: data, total: t } = await listRecycleBin({
        module: mod || null,
        search: q,
        page: pageNum,
        pageSize: PAGE_SIZE,
      })
      setRows(data)
      setTotal(t)
      setPage(pageNum)
    } catch (e) {
      toast(e.message || 'Failed to load snapshots', 'error')
    } finally {
      setLoading(false)
    }
  }, [module, page, search, toast])

  useEffect(() => { load(0, module, search) }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleRestore(id) {
    if (!window.confirm('Restore this record to the live database?')) return
    setBusyId(id)
    try {
      await restoreRecycleBinItem(id, profile)
      toast('Record restored from snapshot', 'success')
      await load(page, module, search)
    } catch (e) {
      toast(e.message || 'Restore failed', 'error')
    } finally {
      setBusyId(null)
    }
  }

  async function handlePurge(id) {
    if (!window.confirm('Permanently discard this snapshot? It cannot be restored later.')) return
    setBusyId(id)
    try {
      await purgeRecycleBinItem(id, profile)
      toast('Snapshot purged', 'success')
      await load(page, module, search)
    } catch (e) {
      toast(e.message || 'Purge failed', 'error')
    } finally {
      setBusyId(null)
    }
  }

  async function handlePurgeAll() {
    if (!window.confirm('Permanently discard ALL snapshots in the recycle bin?')) return
    setBusyId('all')
    try {
      const n = await purgeAllRecycleBin(profile)
      toast(`Purged ${n} snapshot(s)`, 'success')
      await load(0, module, search)
    } catch (e) {
      toast(e.message || 'Purge failed', 'error')
    } finally {
      setBusyId(null)
    }
  }

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <div>
      <div style={{
        padding: 14, borderRadius: 10, marginBottom: 16,
        background: '#f0fdfa', border: '1px solid #99f6e4',
        fontSize: 12, color: '#115e59', lineHeight: 1.5,
      }}>
        When a record is deleted (events, receipts, assets, etc.), a snapshot is kept here so you can restore it.
        Members already use the dedicated{' '}
        <button
          type="button"
          onClick={() => navigate('/deleted-members')}
          style={{ background: 'none', border: 'none', color: '#0f766e', fontWeight: 700, cursor: 'pointer', padding: 0, fontSize: 12, textDecoration: 'underline' }}
        >
          Deleted Members
        </button>{' '}
        page.
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14, alignItems: 'center' }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          border: '1px solid var(--card-border)', borderRadius: 8,
          padding: '6px 10px', background: 'var(--card-bg)', flex: '1 1 200px',
        }}>
          <Search size={14} color="var(--text-3)" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') load(0, module, search) }}
            placeholder="Search label, id, table…"
            style={{ border: 'none', outline: 'none', flex: 1, fontSize: 12, background: 'transparent', color: 'var(--text-1)', fontFamily: 'var(--font-ui)' }}
          />
        </div>
        <select
          value={module}
          onChange={(e) => { setModule(e.target.value); load(0, e.target.value, search) }}
          style={{
            fontSize: 12, padding: '7px 10px', borderRadius: 8,
            border: '1px solid var(--card-border)', background: 'var(--card-bg)',
            color: 'var(--text-1)', fontFamily: 'var(--font-ui)',
          }}
        >
          {RECYCLE_MODULES.map((m) => (
            <option key={m.value || 'all'} value={m.value}>{m.label}</option>
          ))}
        </select>
        <button type="button" className="action-btn" style={secondaryBtn} onClick={() => load(0, module, search)}>
          <RefreshCw size={13} /> Search
        </button>
        <button
          type="button"
          className="action-btn"
          style={{ ...secondaryBtn, color: '#b91c1c', borderColor: '#fecaca' }}
          disabled={busyId === 'all' || !rows.length}
          onClick={handlePurgeAll}
        >
          <Trash2 size={13} /> Purge all
        </button>
      </div>

      <div style={{ overflow: 'auto', border: '1px solid var(--card-border)', borderRadius: 10, background: 'var(--card-bg)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={thStyle}>Deleted</th>
              <th style={thStyle}>Module</th>
              <th style={thStyle}>Type</th>
              <th style={thStyle}>Record</th>
              <th style={thStyle}>Deleted by</th>
              <th style={thStyle}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} style={{ ...tdStyle, textAlign: 'center', color: 'var(--text-3)' }}>Loading…</td></tr>
            ) : !rows.length ? (
              <tr><td colSpan={6} style={{ ...tdStyle, textAlign: 'center', color: 'var(--text-3)' }}>No snapshots — deleted records will appear here</td></tr>
            ) : rows.map((row) => (
              <tr key={row.id}>
                <td style={tdStyle}>{formatWhen(row.deleted_at)}</td>
                <td style={tdStyle}>{labelize(row.module)}</td>
                <td style={tdStyle}>{labelize(row.table_name)}</td>
                <td style={tdStyle}>
                  <div style={{ fontWeight: 600 }}>{row.record_label || row.record_id}</div>
                  <div style={{ fontSize: 10, color: 'var(--text-3)' }}>{row.record_id}</div>
                </td>
                <td style={tdStyle}>{row.deleted_by_email || '—'}</td>
                <td style={tdStyle}>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button
                      type="button"
                      className="action-btn"
                      style={{ ...secondaryBtn, color: '#047857', borderColor: '#a7f3d0' }}
                      disabled={busyId === row.id}
                      onClick={() => handleRestore(row.id)}
                      title="Restore"
                    >
                      {busyId === row.id ? <Loader2 size={13} className="spin" /> : <Undo2 size={13} />}
                      Restore
                    </button>
                    <button
                      type="button"
                      className="action-btn"
                      style={{ ...secondaryBtn, color: '#b91c1c', borderColor: '#fecaca' }}
                      disabled={busyId === row.id}
                      onClick={() => handlePurge(row.id)}
                      title="Purge forever"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {total > PAGE_SIZE && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, fontSize: 12, color: 'var(--text-3)' }}>
          <span>{total} snapshot(s) · page {page + 1} / {pages}</span>
          <div style={{ display: 'flex', gap: 6 }}>
            <button type="button" className="action-btn" style={secondaryBtn} disabled={page <= 0} onClick={() => load(page - 1, module, search)}>Prev</button>
            <button type="button" className="action-btn" style={secondaryBtn} disabled={page + 1 >= pages} onClick={() => load(page + 1, module, search)}>Next</button>
          </div>
        </div>
      )}
    </div>
  )
}
