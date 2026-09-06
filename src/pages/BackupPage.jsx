import { useCallback, useEffect, useState } from 'react'
import {
  Cloud, Database, HardDrive, History, Loader2, RefreshCw,
  RotateCcw, Save, Settings2, Shield, Link2, Unlink, Trash2, FileText,
} from 'lucide-react'
import { useAuth } from '../lib/AuthContext'
import { useToast } from '../lib/toast'
import {
  formatBytes,
  formatWhen,
  getBackupSettings,
  listBackupLogs,
  clearBackupLogs,
  runDriveBackup,
  restoreFromDriveBackup,
  restoreChoicesFromLog,
  inspectDriveBackup,
  backupFolderIdFromLog,
  isCompleteBackupLog,
  listBackupSources,
  saveBackupSelection,
  summarizeBackupSelection,
  runProvision,
  saveBackupSettings,
  startGoogleOAuthConnect,
  disconnectGoogleOAuth,
  verifyGoogleDriveScopes,
  getBackupFunctionVersion,
} from '../lib/cmsFullBackup'
import MasterPasswordInput from '../components/MasterPasswordInput'
import PageHeader from '../components/ui/PageHeader'

const secondaryBtn = {
  gap: 5,
  fontSize: 12,
  padding: '7px 12px',
  background: '#fff',
  color: '#134e4a',
  border: '1.5px solid #99f6e4',
  boxShadow: 'none',
  borderRadius: 9,
  fontWeight: 700,
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
}

/** Primary actions — do not rely on .action-btn (white text, no fill). */
const primaryBtn = {
  gap: 6,
  fontSize: 12,
  padding: '8px 14px',
  background: '#0f766e',
  color: '#ffffff',
  border: 'none',
  boxShadow: 'none',
  borderRadius: 9,
  fontWeight: 700,
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
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

const inputStyle = {
  width: '100%',
  padding: '8px 10px',
  fontSize: 13,
  borderRadius: 8,
  border: '1px solid var(--card-border)',
  background: 'var(--card-bg)',
  color: 'var(--text-1)',
  fontFamily: 'var(--font-ui)',
  boxSizing: 'border-box',
}

const labelStyle = {
  display: 'block',
  fontSize: 11,
  fontWeight: 700,
  color: 'var(--text-3)',
  marginBottom: 4,
  fontFamily: 'var(--font-ui)',
}

function Section({ title, icon: Icon, subtitle, children }) {
  return (
    <section style={{
      marginBottom: 22,
      border: '1px solid var(--card-border)',
      borderRadius: 12,
      background: 'var(--card-bg)',
      overflow: 'hidden',
    }}>
      <div style={{
        padding: '14px 16px',
        borderBottom: '1px solid var(--card-border)',
        display: 'flex',
        gap: 10,
        alignItems: 'flex-start',
      }}>
        <Icon size={18} style={{ marginTop: 2, color: '#0f766e', flexShrink: 0 }} />
        <div>
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: 'var(--text-1)' }}>{title}</h2>
          {subtitle && (
            <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-3)', lineHeight: 1.45 }}>{subtitle}</p>
          )}
        </div>
      </div>
      <div style={{ padding: 16 }}>{children}</div>
    </section>
  )
}

function StatusPill({ status }) {
  const map = {
    success: { bg: '#ecfdf5', color: '#047857' },
    partial: { bg: '#fff7ed', color: '#c2410c' },
    failed: { bg: '#fef2f2', color: '#b91c1c' },
    running: { bg: '#ecfeff', color: '#0e7490' },
    pending: { bg: '#f1f5f9', color: '#475569' },
  }
  const s = map[status] || map.pending
  return (
    <span style={{
      display: 'inline-block', padding: '2px 7px', borderRadius: 999,
      fontSize: 10, fontWeight: 700, background: s.bg, color: s.color,
    }}>
      {String(status || '—')}
    </span>
  )
}

function BackupProgressBar({ active, pct, message, kind }) {
  if (!active) return null
  const value = Math.max(0, Math.min(100, Number(pct) || 0))
  return (
    <div style={{
      marginTop: 12, marginBottom: 4, padding: 12, borderRadius: 10,
      border: '1px solid #99f6e4', background: '#f0fdfa',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 8, alignItems: 'center' }}>
        <strong style={{ fontSize: 12, color: '#115e59' }}>
          {kind === 'full' ? 'Full Backup' : 'Backup'} progress — {value}%
        </strong>
        <Loader2 size={14} className="spin" color="#0f766e" />
      </div>
      <div style={{
        height: 10, borderRadius: 999, background: '#ccfbf1', overflow: 'hidden',
        border: '1px solid #99f6e4',
      }}>
        <div style={{
          width: `${value}%`,
          height: '100%',
          background: 'linear-gradient(90deg, #0f766e, #14b8a6)',
          transition: 'width 0.35s ease',
        }} />
      </div>
      <p style={{
        margin: '8px 0 0', fontSize: 11, color: '#134e4a', lineHeight: 1.45,
        wordBreak: 'break-word',
      }}>
        {message || 'Working…'}
      </p>
    </div>
  )
}

function CheckList({ items, selected, onToggle, empty, renderMeta }) {
  if (!items.length) {
    return <p style={{ margin: 0, fontSize: 12, color: 'var(--text-3)' }}>{empty}</p>
  }
  return (
    <div style={{
      maxHeight: 220, overflow: 'auto', border: '1px solid var(--card-border)',
      borderRadius: 8, padding: '4px 0',
    }}>
      {items.map((item) => {
        const name = item.name
        const checked = selected.has(name)
        return (
          <label
            key={name}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '6px 10px', fontSize: 12, color: 'var(--text-1)',
              cursor: 'pointer', borderBottom: '1px solid var(--table-border)',
            }}
          >
            <input
              type="checkbox"
              checked={checked}
              onChange={() => onToggle(name)}
            />
            <span style={{ flex: 1, fontFamily: 'var(--font-ui)' }}>{name}</span>
            <span style={{ color: 'var(--text-3)', fontSize: 11 }}>{renderMeta?.(item)}</span>
          </label>
        )
      })}
    </div>
  )
}

function BackupChooserModal({
  open,
  kind,
  loading,
  tables,
  buckets,
  selectedTables,
  selectedBuckets,
  saveAsDefault,
  onSaveAsDefaultChange,
  onClose,
  onSelectAll,
  onDeselectAll,
  onSelectAllTables,
  onDeselectAllTables,
  onSelectAllBuckets,
  onDeselectAllBuckets,
  onToggleTable,
  onToggleBucket,
  onConfirm,
  confirming,
}) {
  if (!open) return null
  const tableCount = selectedTables.size
  const bucketCount = selectedBuckets.size
  const canGo = tableCount > 0 || bucketCount > 0
  const title = 'Choose Full Backup items'

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(15, 23, 42, 0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16,
      }}
      onClick={(e) => { if (e.target === e.currentTarget && !confirming) onClose() }}
    >
      <div style={{
        width: 'min(720px, 100%)', maxHeight: '90vh', overflow: 'auto',
        background: 'var(--card-bg, #fff)', borderRadius: 14,
        border: '1px solid var(--card-border)',
        boxShadow: '0 20px 50px rgba(15,23,42,0.25)',
        fontFamily: 'var(--font-ui)',
      }}>
        <div style={{
          padding: '14px 16px', borderBottom: '1px solid var(--card-border)',
          display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start',
        }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: 'var(--text-1)' }}>
              {title}
            </h3>
            <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-3)', lineHeight: 1.45 }}>
              All storage buckets use incremental sync under the parent Drive folder — new/changed files are uploaded, and files deleted from Supabase are removed from Drive on the next sync.
            </p>
          </div>
          <button type="button" className="no-lift" style={secondaryBtn} disabled={confirming} onClick={onClose}>
            Close
          </button>
        </div>

        <div style={{ padding: 16, display: 'grid', gap: 14 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <button type="button" className="no-lift" style={secondaryBtn} disabled={loading || confirming} onClick={onSelectAll}>
              Select all
            </button>
            <button type="button" className="no-lift" style={secondaryBtn} disabled={loading || confirming} onClick={onDeselectAll}>
              Deselect all
            </button>
          </div>

          {loading && !tables.length && !buckets.length ? (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>
              <Loader2 size={18} className="spin" style={{ verticalAlign: 'middle', marginRight: 8 }} />
              Loading tables and storage buckets…
            </div>
          ) : (
            <>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, gap: 8, flexWrap: 'wrap' }}>
                  <strong style={{ fontSize: 13 }}>Database tables ({tableCount}/{tables.length})</strong>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button type="button" className="no-lift" style={{ ...secondaryBtn, padding: '5px 8px' }} disabled={confirming} onClick={onSelectAllTables}>Select all</button>
                    <button type="button" className="no-lift" style={{ ...secondaryBtn, padding: '5px 8px' }} disabled={confirming} onClick={onDeselectAllTables}>Deselect all</button>
                  </div>
                </div>
                <CheckList
                  items={tables}
                  selected={selectedTables}
                  onToggle={onToggleTable}
                  empty="No tables found."
                />
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, gap: 8, flexWrap: 'wrap' }}>
                  <strong style={{ fontSize: 13 }}>Storage buckets ({bucketCount}/{buckets.length})</strong>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button type="button" className="no-lift" style={{ ...secondaryBtn, padding: '5px 8px' }} disabled={confirming} onClick={onSelectAllBuckets}>Select all</button>
                    <button type="button" className="no-lift" style={{ ...secondaryBtn, padding: '5px 8px' }} disabled={confirming} onClick={onDeselectAllBuckets}>Deselect all</button>
                  </div>
                </div>
                <CheckList
                  items={buckets}
                  selected={selectedBuckets}
                  onToggle={onToggleBucket}
                  empty="No storage buckets found."
                  renderMeta={(item) => {
                    const count = item.files != null ? `${item.files} file${item.files === 1 ? '' : 's'}` : ''
                    const mode = item.sync ? 'sync' : ''
                    return [mode, count].filter(Boolean).join(' · ')
                  }}
                />
                <p style={{ margin: '8px 0 0', fontSize: 11, color: '#9a3412', lineHeight: 1.45 }}>
                  Tip: after the first sync, later backups upload new/changed files into <code>cms-storage-sync/</code> and prune Drive copies of files deleted from Supabase.
                </p>
              </div>
            </>
          )}

          <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 12, color: 'var(--text-2)', lineHeight: 1.45 }}>
            <input
              type="checkbox"
              checked={!!saveAsDefault}
              disabled={confirming}
              onChange={(e) => onSaveAsDefaultChange(e.target.checked)}
              style={{ marginTop: 2 }}
            />
            <span>Save this selection for automatic backups too (recommended)</span>
          </label>
        </div>

        <div style={{
          padding: '12px 16px', borderTop: '1px solid var(--card-border)',
          display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', alignItems: 'center',
        }}>
          <span style={{ fontSize: 12, color: 'var(--text-3)' }}>
            {canGo
              ? `Will back up ${tableCount} table(s) and ${bucketCount} bucket(s)`
              : 'Select at least one item'}
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="no-lift" style={secondaryBtn} disabled={confirming} onClick={onClose}>
              Cancel
            </button>
            <button
              type="button"
              className="no-lift"
              style={{ ...primaryBtn, opacity: canGo ? 1 : 0.5 }}
              disabled={!canGo || confirming || loading}
              onClick={onConfirm}
            >
              {confirming ? <Loader2 size={14} className="spin" /> : <HardDrive size={14} />}
              {confirming ? 'Backing up…' : 'Run Backup'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function RestoreChooserModal({
  open,
  row,
  loading,
  tables,
  buckets,
  selectedTables,
  selectedBuckets,
  onClose,
  onSelectAll,
  onDeselectAll,
  onSelectAllTables,
  onDeselectAllTables,
  onSelectAllBuckets,
  onDeselectAllBuckets,
  onToggleTable,
  onToggleBucket,
  onRefresh,
  onConfirm,
  confirming,
}) {
  if (!open) return null
  const label = row?.download_filename || 'backup'
  const tableCount = selectedTables.size
  const bucketCount = selectedBuckets.size
  const canGo = tableCount > 0 || bucketCount > 0

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(15, 23, 42, 0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16,
      }}
      onClick={(e) => { if (e.target === e.currentTarget && !confirming) onClose() }}
    >
      <div style={{
        width: 'min(720px, 100%)', maxHeight: '90vh', overflow: 'auto',
        background: 'var(--card-bg, #fff)', borderRadius: 14,
        border: '1px solid var(--card-border)',
        boxShadow: '0 20px 50px rgba(15,23,42,0.25)',
        fontFamily: 'var(--font-ui)',
      }}>
        <div style={{
          padding: '14px 16px', borderBottom: '1px solid var(--card-border)',
          display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start',
        }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: 'var(--text-1)' }}>
              Choose what to restore
            </h3>
            <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-3)', lineHeight: 1.45 }}>
              From <strong>{label}</strong>. Only checked items are replaced. Unchecked tables and buckets stay as they are now.
            </p>
          </div>
          <button
            type="button"
            className="no-lift"
            style={secondaryBtn}
            disabled={confirming}
            onClick={onClose}
          >
            Close
          </button>
        </div>

        <div style={{ padding: 16, display: 'grid', gap: 14 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <button type="button" className="no-lift" style={secondaryBtn} disabled={loading || confirming} onClick={onSelectAll}>
              Select all
            </button>
            <button type="button" className="no-lift" style={secondaryBtn} disabled={loading || confirming} onClick={onDeselectAll}>
              Deselect all
            </button>
            <button type="button" className="no-lift" style={secondaryBtn} disabled={loading || confirming} onClick={onRefresh}>
              {loading ? <Loader2 size={13} className="spin" /> : <RefreshCw size={13} />}
              Refresh list from Drive
            </button>
          </div>

          {loading && !tables.length && !buckets.length ? (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>
              <Loader2 size={18} className="spin" style={{ verticalAlign: 'middle', marginRight: 8 }} />
              Loading backup contents…
            </div>
          ) : (
            <>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, gap: 8, flexWrap: 'wrap' }}>
                  <strong style={{ fontSize: 13 }}>Database tables ({tableCount}/{tables.length})</strong>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button type="button" className="no-lift" style={{ ...secondaryBtn, padding: '5px 8px' }} disabled={confirming} onClick={onSelectAllTables}>Select all</button>
                    <button type="button" className="no-lift" style={{ ...secondaryBtn, padding: '5px 8px' }} disabled={confirming} onClick={onDeselectAllTables}>Deselect all</button>
                  </div>
                </div>
                <CheckList
                  items={tables}
                  selected={selectedTables}
                  onToggle={onToggleTable}
                  empty="No tables found in this backup."
                  renderMeta={(item) => (item.rows != null ? `${item.rows} rows` : '')}
                />
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, gap: 8, flexWrap: 'wrap' }}>
                  <strong style={{ fontSize: 13 }}>Storage buckets ({bucketCount}/{buckets.length})</strong>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button type="button" className="no-lift" style={{ ...secondaryBtn, padding: '5px 8px' }} disabled={confirming} onClick={onSelectAllBuckets}>Select all</button>
                    <button type="button" className="no-lift" style={{ ...secondaryBtn, padding: '5px 8px' }} disabled={confirming} onClick={onDeselectAllBuckets}>Deselect all</button>
                  </div>
                </div>
                <CheckList
                  items={buckets}
                  selected={selectedBuckets}
                  onToggle={onToggleBucket}
                  empty="No storage files in this backup (DB-only or older backup)."
                  renderMeta={(item) => {
                    const count = item.files != null
                      ? `${item.files} file${item.files === 1 ? '' : 's'}${item.bytes ? ` · ${formatBytes(item.bytes)}` : ''}`
                      : ''
                    const mode = item.sync ? 'sync' : ''
                    return [mode, count].filter(Boolean).join(' · ')
                  }}
                />
              </div>
            </>
          )}

          <p style={{ margin: 0, fontSize: 11, color: '#9a3412', lineHeight: 1.45, background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 8, padding: '8px 10px' }}>
            Selected tables are truncated then reloaded from the backup. Storage restore is incremental from the parent <code>cms-storage-sync/</code> folder — only missing or changed files are downloaded.
          </p>
        </div>

        <div style={{
          padding: '12px 16px', borderTop: '1px solid var(--card-border)',
          display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', alignItems: 'center',
        }}>
          <span style={{ fontSize: 12, color: 'var(--text-3)' }}>
            {canGo
              ? `Will restore ${tableCount} table(s) and ${bucketCount} bucket(s)`
              : 'Select at least one item'}
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="no-lift" style={secondaryBtn} disabled={confirming} onClick={onClose}>
              Cancel
            </button>
            <button
              type="button"
              className="no-lift"
              style={{ ...primaryBtn, opacity: canGo ? 1 : 0.5 }}
              disabled={!canGo || confirming || loading}
              onClick={onConfirm}
            >
              {confirming ? <Loader2 size={14} className="spin" /> : <RotateCcw size={14} />}
              {confirming ? 'Restoring…' : 'Restore selected'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function LogTable({ rows, loading, empty, restoringId, onRestore }) {
  return (
    <div style={{ overflow: 'auto', border: '1px solid var(--card-border)', borderRadius: 8 }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={thStyle}>When</th>
            <th style={thStyle}>Mode</th>
            <th style={thStyle}>Status</th>
            <th style={thStyle}>Tables</th>
            <th style={thStyle}>Rows</th>
            <th style={thStyle}>Size</th>
            <th style={thStyle}>Files</th>
            <th style={thStyle}>Drive</th>
            <th style={thStyle}>Folder / file</th>
            <th style={thStyle}>Restore</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={10} style={{ ...tdStyle, textAlign: 'center', color: 'var(--text-3)' }}>Loading…</td></tr>
          ) : !rows.length ? (
            <tr><td colSpan={10} style={{ ...tdStyle, textAlign: 'center', color: 'var(--text-3)' }}>{empty}</td></tr>
          ) : rows.map((row) => {
            const folderId = backupFolderIdFromLog(row)
            const storageCount = row?.meta?.storage_file_count
            const isComplete = isCompleteBackupLog(row)
            const canRestore = !!folderId && (row.status === 'success' || row.status === 'partial')
            const busy = restoringId === row.id
            const debugTail = Array.isArray(row?.meta?.debug) ? row.meta.debug.slice(-3) : []
            return (
              <tr key={row.id}>
                <td style={tdStyle}>{formatWhen(row.created_at)}</td>
                <td style={tdStyle}>{row.trigger_mode || '—'}</td>
                <td style={tdStyle}><StatusPill status={row.status} /></td>
                <td style={tdStyle}>{row.tables_count ?? '—'}</td>
                <td style={tdStyle}>{row.rows_count ?? '—'}</td>
                <td style={tdStyle}>{formatBytes(row.file_size_bytes ?? row.bytes)}</td>
                <td style={tdStyle}>
                  {isComplete
                    ? (storageCount != null ? storageCount : 'yes')
                    : 'DB only'}
                </td>
                <td style={tdStyle}>
                  {row.drive_web_link ? (
                    <a href={row.drive_web_link} target="_blank" rel="noreferrer" style={{ color: '#0369a1', fontWeight: 600 }}>
                      Open
                    </a>
                  ) : row.drive_file_id ? 'Yes' : '—'}
                </td>
                <td style={{ ...tdStyle, fontSize: 11, color: 'var(--text-3)' }}>
                  <div>{row.download_filename || '—'}</div>
                  {debugTail.length > 0 && (
                    <div style={{ marginTop: 4, fontSize: 10, color: '#0e7490', lineHeight: 1.35 }}>
                      last: {debugTail[debugTail.length - 1]?.step}
                      {debugTail[debugTail.length - 1]?.file ? ` · ${debugTail[debugTail.length - 1].file}` : ''}
                      {debugTail[debugTail.length - 1]?.error ? ` · ${debugTail[debugTail.length - 1].error}` : ''}
                    </div>
                  )}
                </td>
                <td style={tdStyle}>
                  <button
                    type="button"
                    className="no-lift"
                    style={{
                      ...secondaryBtn,
                      padding: '5px 8px',
                      opacity: canRestore ? 1 : 0.45,
                      cursor: canRestore && !busy ? 'pointer' : 'not-allowed',
                    }}
                    disabled={!canRestore || !!restoringId}
                    title={
                      canRestore
                        ? (isComplete
                          ? 'Choose tables and storage to restore'
                          : 'DB-only backup — restore tables (no storage files in this backup)')
                        : 'No Drive file linked to this history row'
                    }
                    onClick={() => onRestore?.(row)}
                  >
                    {busy ? <Loader2 size={12} className="spin" /> : <RotateCcw size={12} />}
                    Restore…
                  </button>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export default function BackupPage() {
  const { profile } = useAuth()
  const toast = useToast()
  const isSuper = profile?.role === 'super_admin'

  const [settings, setSettings] = useState(null)
  const [driveFolderId, setDriveFolderId] = useState('')
  const [savingDrive, setSavingDrive] = useState(false)
  const [connectingGoogle, setConnectingGoogle] = useState(false)
  const [disconnectingGoogle, setDisconnectingGoogle] = useState(false)
  const [verifyingGoogle, setVerifyingGoogle] = useState(false)
  const [clearingKind, setClearingKind] = useState(null)
  const [savingAuto, setSavingAuto] = useState(false)

  const [fullLogs, setFullLogs] = useState([])
  const [loadingLogs, setLoadingLogs] = useState(true)
  const [runningFull, setRunningFull] = useState(false)
  const [backupProgress, setBackupProgress] = useState({ kind: null, pct: 0, message: '' })
  const [restoringId, setRestoringId] = useState(null)
  const [backupModal, setBackupModal] = useState(null) // { kind: 'full' }
  const [backupSourcesLoading, setBackupSourcesLoading] = useState(false)
  const [backupTables, setBackupTables] = useState([])
  const [backupBuckets, setBackupBuckets] = useState([])
  const [backupSelectedTables, setBackupSelectedTables] = useState(() => new Set())
  const [backupSelectedBuckets, setBackupSelectedBuckets] = useState(() => new Set())
  const [backupSaveAsDefault, setBackupSaveAsDefault] = useState(true)
  const [restoreModal, setRestoreModal] = useState(null) // { row, folderId }
  const [restoreTables, setRestoreTables] = useState([])
  const [restoreBuckets, setRestoreBuckets] = useState([])
  const [selectedTables, setSelectedTables] = useState(() => new Set())
  const [selectedBuckets, setSelectedBuckets] = useState(() => new Set())
  const [restoreLoading, setRestoreLoading] = useState(false)

  const [prov, setProv] = useState({
    mode: 'initialize',
    supabaseUrl: '',
    anonKey: '',
    serviceRoleKey: '',
    dbPassword: '',
    superAdminEmail: '',
    superAdminPassword: '',
    driveFolderId: '',
  })
  const [provRunning, setProvRunning] = useState(false)
  const [provResult, setProvResult] = useState(null)
  const [fnVersion, setFnVersion] = useState(null)

  const loadSettings = useCallback(async () => {
    try {
      const s = await getBackupSettings()
      setSettings(s)
      setDriveFolderId(s.drive_folder_id || '')
    } catch (e) {
      toast(e.message || 'Failed to load backup settings', 'error')
    }
  }, [toast])

  const loadFnVersion = useCallback(async () => {
    try {
      const info = await getBackupFunctionVersion()
      setFnVersion(info)
    } catch (e) {
      setFnVersion({
        ok: false,
        canPrune: false,
        version: 0,
        message: e.message || 'Could not read Edge Function version',
      })
    }
  }, [])

  const loadLogs = useCallback(async () => {
    setLoadingLogs(true)
    try {
      const f = await listBackupLogs({ kind: 'full', pageSize: 25 })
      setFullLogs(f.rows)
    } catch (e) {
      toast(e.message || 'Failed to load backup history', 'error')
    } finally {
      setLoadingLogs(false)
    }
  }, [toast])

  useEffect(() => {
    if (!isSuper) return
    loadSettings()
    loadLogs()
    loadFnVersion()
  }, [isSuper, loadSettings, loadLogs, loadFnVersion])

  useEffect(() => {
    const q = new URLSearchParams(window.location.search)
    if (q.get('google') === 'connected') {
      toast('Google Drive connected', 'success')
      window.history.replaceState({}, '', '/backup')
      loadSettings()
    }
  }, [toast, loadSettings])

  if (!isSuper) {
    return (
      <div style={{ padding: 32, fontFamily: 'var(--font-ui)', color: 'var(--text-2)' }}>
        <Shield size={18} style={{ verticalAlign: 'middle', marginRight: 8 }} />
        Backup &amp; Restore is available to Super Admin only.
      </div>
    )
  }

  async function handleSaveDrive() {
    setSavingDrive(true)
    try {
      const s = await saveBackupSettings({
        drive_folder_id: driveFolderId.trim() || null,
        drive_enabled: !!driveFolderId.trim(),
      }, profile)
      setSettings(s)
      toast('Google Drive folder saved', 'success')
    } catch (e) {
      toast(e.message || 'Save failed', 'error')
    } finally {
      setSavingDrive(false)
    }
  }

  async function handleConnectGoogle() {
    setConnectingGoogle(true)
    try {
      await startGoogleOAuthConnect()
    } catch (e) {
      const msg = e.message || 'Could not start Google login (deploy cms-google-oauth + set OAuth secrets)'
      console.error('[backup-ui] Connect Google failed', e)
      toast(msg, 'error')
      setConnectingGoogle(false)
    }
  }

  async function handleDisconnectGoogle() {
    if (!window.confirm('Disconnect Google Drive from backups?')) return
    setDisconnectingGoogle(true)
    try {
      await disconnectGoogleOAuth()
      await loadSettings()
      toast('Google Drive disconnected', 'success')
    } catch (e) {
      toast(e.message || 'Disconnect failed', 'error')
    } finally {
      setDisconnectingGoogle(false)
    }
  }

  async function handleVerifyGoogle() {
    setVerifyingGoogle(true)
    try {
      const r = await verifyGoogleDriveScopes()
      if (r?.drive_scope_ok) {
        toast(`Drive access OK${r.email ? ` (${r.email})` : ''}`, 'success')
      } else {
        toast(r?.error || 'Drive scope missing — reconnect Google and keep Drive checked', 'error')
      }
    } catch (e) {
      toast(e.message || 'Could not verify Google Drive', 'error')
    } finally {
      setVerifyingGoogle(false)
    }
  }

  async function handleSaveAuto(patch) {
    setSavingAuto(true)
    try {
      const s = await saveBackupSettings(patch, profile)
      setSettings(s)
      toast('Schedule settings saved', 'success')
    } catch (e) {
      toast(e.message || 'Save failed', 'error')
    } finally {
      setSavingAuto(false)
    }
  }

  async function openBackupChooser(kind) {
    if (!backupReady) {
      toast(!googleConnected ? 'Connect Google first' : 'Save Google Drive folder ID first', 'error')
      return
    }
    setBackupModal({ kind })
    setBackupSaveAsDefault(true)
    setBackupSourcesLoading(true)
    try {
      const sources = await listBackupSources()
      const tables = sources.tables || []
      const buckets = sources.storage_buckets || []
      setBackupTables(tables)
      setBackupBuckets(buckets)

      const saved = settings?.backup_selection || sources.selection || {}
      const tableNames = tables.map((t) => t.name)
      const bucketNames = buckets.map((b) => b.name)
      const selTables = saved.tables == null ? tableNames : saved.tables.filter((n) => tableNames.includes(n))
      const selBuckets = saved.storage_buckets == null
        ? bucketNames
        : saved.storage_buckets.filter((n) => bucketNames.includes(n))
      setBackupSelectedTables(new Set(selTables))
      setBackupSelectedBuckets(new Set(selBuckets))
    } catch (e) {
      const msg = e.message || 'Could not load backup items'
      toast(msg, 'error')
      setBackupModal(null)
    } finally {
      setBackupSourcesLoading(false)
    }
  }

  async function confirmBackupSelected() {
    if (!backupModal) return
    const kind = backupModal.kind
    const tables = [...backupSelectedTables]
    const storageBuckets = [...backupSelectedBuckets]
    if (!tables.length && !storageBuckets.length) {
      toast('Select at least one table or storage bucket', 'error')
      return
    }

    if (backupSaveAsDefault) {
      try {
        const s = await saveBackupSelection({ tables, storageBuckets }, profile)
        setSettings(s)
      } catch (e) {
        toast(e.message || 'Could not save selection for automatic backups', 'error')
        // still continue with this run
      }
    }

    setBackupModal(null)
    setRunningFull(true)
    setBackupProgress({ kind, pct: 0, message: 'Starting…' })
    try {
      const r = await runDriveBackup({
        kind,
        triggerMode: 'manual',
        actor: profile,
        tables,
        storageBuckets,
        onProgress: ({ pct, message }) => {
          setBackupProgress({ kind, pct: pct ?? 0, message: message || 'Working…' })
        },
      })
      if (r.via === 'local_download') {
        toast(r.message || 'Full Backup downloaded locally.', 'success')
      } else {
        const files = r.storage_file_count != null ? `, ${r.storage_file_count} storage files` : ''
        const pruned = r.sync_pruned ? `, ${r.sync_pruned} pruned from Drive` : ''
        const label = r.status === 'partial' ? 'Partial' : 'Complete'
        toast(
          `${label} Full Backup — ${r.tables_count} tables, ${r.rows_count} rows${files}${pruned} (${formatBytes(r.file_size_bytes)}).`,
          r.status === 'partial' ? 'error' : 'success',
        )
      }
      await loadLogs()
      await loadSettings()
      await loadFnVersion()
    } catch (e) {
      const msg = e.message || 'Backup failed'
      console.error('[backup-ui] run failed', e)
      toast(msg, 'error')
    } finally {
      setRunningFull(false)
      setBackupProgress({ kind: null, pct: 0, message: '' })
    }
  }

  async function openRestoreChooser(row) {
    const folderId = backupFolderIdFromLog(row)
    if (!folderId) {
      toast('This history row has no Drive backup folder id. Run a new Complete Backup first.', 'error')
      return
    }

    setRestoreModal({ row, folderId })

    const fromLog = restoreChoicesFromLog(row)
    const needsDriveList = fromLog.incomplete
      || (row?.meta?.complete && (row?.meta?.storage_file_count || 0) > 0 && !fromLog.storage_buckets.length)

    if (!needsDriveList) {
      setRestoreTables(fromLog.tables)
      setRestoreBuckets(fromLog.storage_buckets)
      setSelectedTables(new Set(fromLog.tables.map((t) => t.name)))
      setSelectedBuckets(new Set(fromLog.storage_buckets.map((b) => b.name)))
      return
    }

    // Thin history meta — load from Drive
    setRestoreLoading(true)
    setRestoreTables([])
    setRestoreBuckets([])
    setSelectedTables(new Set())
    setSelectedBuckets(new Set())
    try {
      const info = await inspectDriveBackup({ logId: row.id, folderId })
      const tables = info.tables || []
      const buckets = info.storage_buckets || []
      setRestoreTables(tables)
      setRestoreBuckets(buckets)
      setSelectedTables(new Set(tables.map((t) => t.name)))
      setSelectedBuckets(new Set(buckets.map((b) => b.name)))
    } catch (e) {
      const msg = e.message || 'Could not load backup contents'
      toast(msg, 'error')
    } finally {
      setRestoreLoading(false)
    }
  }

  async function refreshRestoreChooser() {
    if (!restoreModal) return
    setRestoreLoading(true)
    try {
      const info = await inspectDriveBackup({
        logId: restoreModal.row.id,
        folderId: restoreModal.folderId,
      })
      const tables = info.tables || []
      const buckets = info.storage_buckets || []
      setRestoreTables(tables)
      setRestoreBuckets(buckets)
      setSelectedTables(new Set(tables.map((t) => t.name)))
      setSelectedBuckets(new Set(buckets.map((b) => b.name)))
      toast('Backup contents refreshed from Drive', 'success')
    } catch (e) {
      const msg = e.message || 'Refresh failed'
      toast(msg, 'error')
    } finally {
      setRestoreLoading(false)
    }
  }

  function closeRestoreChooser() {
    if (restoringId) return
    setRestoreModal(null)
  }

  function toggleInSet(setter, name) {
    setter((prev) => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  async function confirmRestoreSelected() {
    if (!restoreModal) return
    const tables = [...selectedTables]
    const buckets = [...selectedBuckets]
    if (!tables.length && !buckets.length) {
      toast('Select at least one table or storage bucket', 'error')
      return
    }

    const label = restoreModal.row.download_filename || restoreModal.folderId
    if (!window.confirm(
      `Restore ${tables.length} table(s) and ${buckets.length} storage bucket(s) from "${label}"?\n\nSelected tables will be wiped and replaced. Selected storage files will be overwritten.\n\nThis cannot be undone except by restoring another backup.`,
    )) return

    setRestoringId(restoreModal.row.id)
    try {
      const r = await restoreFromDriveBackup({
        logId: restoreModal.row.id,
        folderId: restoreModal.folderId,
        tables,
        storageBuckets: buckets,
        actor: profile,
      })
      toast(
        `Restore ${r.status || 'done'}: ${r.restored_rows ?? 0} rows, ${r.restored_files ?? 0} files.`,
        r.status === 'failed' ? 'error' : 'success',
      )
      setRestoreModal(null)
      await loadLogs()
    } catch (e) {
      const msg = e.message || 'Restore failed'
      toast(msg, 'error')
    } finally {
      setRestoringId(null)
    }
  }

  async function handleClearHistory(kind) {
    const label = kind === 'full' ? 'Full Backup' : 'backup'
    if (!window.confirm(`Clear ${label} history from this list? This does not delete files already in Google Drive.`)) {
      return
    }
    setClearingKind(kind || 'all')
    try {
      const r = await clearBackupLogs({ kind })
      toast(`Cleared ${r.deleted} history row(s)`, 'success')
      await loadLogs()
    } catch (e) {
      const msg = e.message || 'Clear history failed (run SQL cms_backup_log_delete if missing)'
      toast(msg, 'error')
    } finally {
      setClearingKind(null)
    }
  }

  async function handleProvision() {
    if (!window.confirm(
      prov.mode === 'initialize'
        ? 'Initialize the TARGET Supabase project? This creates schema bootstrap, buckets, and Super Admin on that project.'
        : 'Upgrade the TARGET Supabase project bootstrap / buckets / Super Admin?',
    )) return
    setProvRunning(true)
    setProvResult(null)
    try {
      const r = await runProvision({
        mode: prov.mode,
        supabaseUrl: prov.supabaseUrl,
        anonKey: prov.anonKey,
        serviceRoleKey: prov.serviceRoleKey,
        dbPassword: prov.dbPassword,
        superAdminEmail: prov.superAdminEmail,
        superAdminPassword: prov.superAdminPassword,
        driveFolderId: prov.driveFolderId || null,
        actor: profile,
      })
      setProvResult(r)
      toast(prov.mode === 'initialize' ? 'New Setup completed' : 'Upgrade completed', 'success')
    } catch (e) {
      const msg = e.message || 'Provision failed (deploy cms-provision function)'
      toast(msg, 'error')
    } finally {
      setProvRunning(false)
    }
  }

  const driveOk = !!(settings?.drive_folder_id || driveFolderId.trim())
  const googleConnected = !!settings?.google_connected_email
  const backupReady = driveOk && googleConnected

  return (
    <div style={{ padding: '20px 24px 48px', maxWidth: 960, margin: '0 auto', fontFamily: 'var(--font-ui)' }}>
      <PageHeader
        icon={Database}
        title="Backup & Restore"
        subtitle="Super Admin only. Complete backups include every database table and every storage file (photos, PDFs, logos, etc.) in a Google Drive folder. Restore replaces live data from that folder."
        style={{ marginBottom: 18 }}
      >
        <p style={{ margin: 0, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <a
            href="/docs/Google_Drive_Backup_Setup_Guide.docx"
            download="Google_Drive_Backup_Setup_Guide.docx"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              fontSize: 13, fontWeight: 700, color: '#0f766e',
              textDecoration: 'none',
              padding: '8px 12px', borderRadius: 8,
              border: '1px solid #99f6e4', background: '#f0fdfa',
            }}
          >
            <FileText size={15} />
            Setup Documentation
          </a>
          <a
            href="/docs/Multi_Church_Deployment_Guide.docx"
            download="Multi_Church_Deployment_Guide.docx"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              fontSize: 13, fontWeight: 700, color: '#0f766e',
              textDecoration: 'none',
              padding: '8px 12px', borderRadius: 8,
              border: '1px solid #99f6e4', background: '#f0fdfa',
            }}
          >
            <FileText size={15} />
            Deployment Guide
          </a>
        </p>
      </PageHeader>

      {fnVersion && !fnVersion.canPrune && (
        <div style={{
          marginBottom: 16, padding: '12px 14px', borderRadius: 10,
          border: '1px solid #fca5a5', background: '#fef2f2', color: '#991b1b',
          fontSize: 13, lineHeight: 1.5,
        }}>
          <strong style={{ display: 'block', marginBottom: 4 }}>
            Google Drive is not mirroring Supabase yet
          </strong>
          Live Edge Function <code>cms-full-backup</code> is version{' '}
          <strong>{fnVersion.version || '?'}</strong>. Version <strong>7+</strong> is required so sync
          deletes Drive files that were removed from Supabase (exact replica of all storage buckets).
          <div style={{ marginTop: 8 }}>
            Supabase Dashboard → Edge Functions → <code>cms-full-backup</code> → paste repo file{' '}
            <code>supabase/functions/cms-full-backup/index.ts</code> → Deploy → run storage sync again.
          </div>
          <button
            type="button"
            className="no-lift"
            style={{ ...secondaryBtn, marginTop: 10, borderColor: '#fca5a5' }}
            onClick={loadFnVersion}
          >
            <RefreshCw size={13} /> Recheck version
          </button>
        </div>
      )}

      {/* 1. Google Drive */}
      <Section
        title="Google Drive"
        icon={Cloud}
        subtitle="Connect your Google account (OAuth), then save the folder ID. Backups upload as you — using your Drive storage."
      >
        <div style={{ display: 'grid', gap: 12, maxWidth: 560 }}>
          <div style={{
            padding: 12, borderRadius: 8, border: '1px solid var(--card-border)',
            background: googleConnected ? '#f0fdfa' : '#fffbeb',
          }}>
            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6, color: 'var(--text-1)' }}>
              {googleConnected ? 'Google connected' : 'Google not connected'}
            </div>
            <p style={{ margin: '0 0 10px', fontSize: 12, color: 'var(--text-3)', lineHeight: 1.45 }}>
              {googleConnected
                ? `Signed in as ${settings.google_connected_email}`
                : 'Connect once so automatic and manual backups can upload to your Drive folder.'}
            </p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {!googleConnected ? (
                <button
                  type="button"
                  className="no-lift"
                  style={primaryBtn}
                  disabled={connectingGoogle}
                  onClick={handleConnectGoogle}
                >
                  {connectingGoogle ? <Loader2 size={14} className="spin" /> : <Link2 size={14} />}
                  Connect Google
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    className="no-lift"
                    style={secondaryBtn}
                    disabled={verifyingGoogle || disconnectingGoogle}
                    onClick={handleVerifyGoogle}
                  >
                    {verifyingGoogle ? <Loader2 size={14} className="spin" /> : <Shield size={14} />}
                    Check Drive access
                  </button>
                  <button
                    type="button"
                    className="no-lift"
                    style={secondaryBtn}
                    disabled={disconnectingGoogle}
                    onClick={handleDisconnectGoogle}
                  >
                    {disconnectingGoogle ? <Loader2 size={14} className="spin" /> : <Unlink size={14} />}
                    Disconnect
                  </button>
                  <button
                    type="button"
                    className="no-lift"
                    style={secondaryBtn}
                    disabled={connectingGoogle || disconnectingGoogle}
                    onClick={handleConnectGoogle}
                  >
                    {connectingGoogle ? <Loader2 size={14} className="spin" /> : <Link2 size={14} />}
                    Reconnect
                  </button>
                </>
              )}
            </div>
            <p style={{ margin: '10px 0 0', fontSize: 11, color: 'var(--text-3)', lineHeight: 1.45 }}>
              If Issue PDF / backup shows “insufficient authentication scopes”, revoke this app at{' '}
              <a href="https://myaccount.google.com/permissions" target="_blank" rel="noreferrer">
                Google Account → Permissions
              </a>
              , then Disconnect → Connect again and leave <strong>Google Drive</strong> checked on the consent screen.
            </p>
          </div>

          <div>
            <label style={labelStyle}>Google Drive folder ID</label>
            <input
              style={inputStyle}
              value={driveFolderId}
              onChange={(e) => setDriveFolderId(e.target.value)}
              placeholder="e.g. 1aBcD... from the folder URL"
              autoComplete="off"
            />
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <button type="button" className="no-lift" style={primaryBtn} disabled={savingDrive} onClick={handleSaveDrive}>
              {savingDrive ? <Loader2 size={14} className="spin" /> : <Save size={14} />}
              Save folder ID
            </button>
            <span style={{
              fontSize: 12, fontWeight: 600,
              color: backupReady ? '#047857' : '#b45309',
            }}>
              {backupReady
                ? 'Ready for Drive backups'
                : !googleConnected
                  ? 'Connect Google first'
                  : 'Save folder ID'}
            </span>
          </div>
          <p style={{ margin: 0, fontSize: 11, color: 'var(--text-3)', lineHeight: 1.5 }}>
            OAuth redirect URI to add in Google Cloud:{' '}
            <code>{typeof window !== 'undefined' ? `${window.location.origin}/backup/google-callback` : '/backup/google-callback'}</code>
          </p>
        </div>
      </Section>

      {/* 2. Full Backup */}
      <Section
        title="Full Backup"
        icon={Database}
        subtitle="Complete safety copy: all tables + all storage files (member photos, receipt PDFs, logos, event media, etc.) into one Drive folder. Automatic daily + manual."
      >
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 14, alignItems: 'center' }}>
          <button
            type="button"
            className="no-lift"
            style={primaryBtn}
            disabled={runningFull || !backupReady || !!backupModal}
            onClick={() => openBackupChooser('full')}
          >
            {runningFull ? <Loader2 size={14} className="spin" /> : <HardDrive size={14} />}
            {runningFull ? 'Backing up…' : 'Run Complete Full Backup'}
          </button>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-2)' }}>
            <input
              type="checkbox"
              checked={!!settings?.full_auto_enabled}
              disabled={savingAuto || !settings}
              onChange={(e) => handleSaveAuto({ full_auto_enabled: e.target.checked })}
            />
            Automatic daily (default 2:00 AM IST)
          </label>
          <button type="button" className="no-lift" style={secondaryBtn} onClick={loadLogs}>
            <RefreshCw size={13} /> Refresh
          </button>
        </div>
        <BackupProgressBar
          active={runningFull && backupProgress.kind === 'full'}
          pct={backupProgress.pct}
          message={backupProgress.message}
          kind="full"
        />
        <p style={{ margin: '0 0 12px', fontSize: 11, color: 'var(--text-3)', lineHeight: 1.45 }}>
          Current selection (manual + automatic):{' '}
          <strong>{summarizeBackupSelection(settings?.backup_selection)}</strong>
          {' · '}Click Run to choose items (you can leave photos unchecked for speed).
        </p>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <History size={14} color="var(--text-3)" />
            <strong style={{ fontSize: 12 }}>Full Backup history</strong>
          </div>
          <button
            type="button"
            className="no-lift"
            style={{ ...secondaryBtn, color: '#b91c1c', borderColor: '#fecaca' }}
            disabled={clearingKind === 'full' || !fullLogs.length}
            onClick={() => handleClearHistory('full')}
          >
            {clearingKind === 'full' ? <Loader2 size={13} className="spin" /> : <Trash2 size={13} />}
            Clear history
          </button>
        </div>
        <LogTable
          rows={fullLogs}
          loading={loadingLogs}
          empty="No full backups yet"
          restoringId={restoringId}
          onRestore={openRestoreChooser}
        />
        <p style={{ margin: '10px 0 0', fontSize: 11, color: 'var(--text-3)', lineHeight: 1.5 }}>
          Each successful run creates a Drive folder with <code>database.json</code>, <code>storage/…</code>, and <code>manifest.json</code>.
          Use <strong>Restore</strong> for disaster recovery on this project. Large photo libraries may take several minutes; keep the tab open.
        </p>
      </Section>

      {/* 3. New Setup / Upgrade */}
      <Section
        title="New Setup / Upgrade"
        icon={Settings2}
        subtitle="Prepare a NEW Supabase project for a church, or upgrade bootstrap on an existing one. Credentials are used once and not stored."
      >
        <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
          {['initialize', 'upgrade'].map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setProv((p) => ({ ...p, mode: m }))}
              style={{
                ...secondaryBtn,
                fontWeight: prov.mode === m ? 800 : 600,
                borderColor: prov.mode === m ? '#0f766e' : '#99f6e4',
                background: prov.mode === m ? '#ccfbf1' : '#fff',
                color: '#134e4a',
              }}
              className="no-lift"
            >
              {m === 'initialize' ? 'Initialize (new church)' : 'Upgrade'}
            </button>
          ))}
        </div>

        <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={labelStyle}>Target SUPABASE_URL</label>
            <input style={inputStyle} value={prov.supabaseUrl} onChange={(e) => setProv({ ...prov, supabaseUrl: e.target.value })} placeholder="https://xxxx.supabase.co" autoComplete="off" />
          </div>
          <div>
            <label style={labelStyle}>ANON_KEY</label>
            <input style={inputStyle} value={prov.anonKey} onChange={(e) => setProv({ ...prov, anonKey: e.target.value })} autoComplete="off" />
          </div>
          <div>
            <label style={labelStyle}>SERVICE_ROLE_KEY</label>
            <input style={inputStyle} value={prov.serviceRoleKey} onChange={(e) => setProv({ ...prov, serviceRoleKey: e.target.value })} autoComplete="off" />
          </div>
          <div>
            <label style={labelStyle}>Database password</label>
            <MasterPasswordInput style={{ ...inputStyle }} value={prov.dbPassword} onChange={(e) => setProv({ ...prov, dbPassword: e.target.value })} />
          </div>
          <div>
            <label style={labelStyle}>Google Drive folder ID (optional)</label>
            <input style={inputStyle} value={prov.driveFolderId} onChange={(e) => setProv({ ...prov, driveFolderId: e.target.value })} autoComplete="off" />
          </div>
          <div>
            <label style={labelStyle}>Super Admin email {prov.mode === 'upgrade' ? '(optional)' : ''}</label>
            <input style={inputStyle} value={prov.superAdminEmail} onChange={(e) => setProv({ ...prov, superAdminEmail: e.target.value })} autoComplete="off" />
          </div>
          <div>
            <label style={labelStyle}>Super Admin password {prov.mode === 'upgrade' ? '(optional)' : ''}</label>
            <MasterPasswordInput style={inputStyle} value={prov.superAdminPassword} onChange={(e) => setProv({ ...prov, superAdminPassword: e.target.value })} />
          </div>
        </div>

        <div style={{ marginTop: 14, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            type="button"
            className="no-lift"
            style={primaryBtn}
            disabled={provRunning}
            onClick={handleProvision}
          >
            {provRunning ? <Loader2 size={14} className="spin" /> : <Settings2 size={14} />}
            {provRunning ? 'Working…' : (prov.mode === 'initialize' ? 'Initialize church project' : 'Run Upgrade')}
          </button>
        </div>

        {provResult && (
          <div style={{
            marginTop: 14, padding: 12, borderRadius: 8,
            background: '#f0fdfa', border: '1px solid #99f6e4',
            fontSize: 12, color: '#115e59', lineHeight: 1.5,
          }}>
            <strong>Done ({provResult.mode})</strong>
            <ul style={{ margin: '8px 0 0', paddingLeft: 18 }}>
              {(provResult.steps || []).map((s, i) => <li key={i}>{s}</li>)}
            </ul>
            {provResult.next?.length > 0 && (
              <>
                <strong style={{ display: 'block', marginTop: 8 }}>Next</strong>
                <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
                  {provResult.next.map((s, i) => <li key={i}>{s}</li>)}
                </ul>
              </>
            )}
          </div>
        )}

        <p style={{ margin: '12px 0 0', fontSize: 11, color: 'var(--text-3)', lineHeight: 1.5 }}>
          Initialize creates bootstrap tables, storage buckets, and your Super Admin on the <em>target</em> project.
          Run the full <code>supabase/migrations</code> SQL on that project (or Upgrade with extra SQL) so it matches this CMS version, then point the website at the new URL + anon key.
        </p>
      </Section>

      <RestoreChooserModal
        open={!!restoreModal}
        row={restoreModal?.row}
        loading={restoreLoading}
        tables={restoreTables}
        buckets={restoreBuckets}
        selectedTables={selectedTables}
        selectedBuckets={selectedBuckets}
        confirming={!!restoringId}
        onClose={closeRestoreChooser}
        onSelectAll={() => {
          setSelectedTables(new Set(restoreTables.map((t) => t.name)))
          setSelectedBuckets(new Set(restoreBuckets.map((b) => b.name)))
        }}
        onDeselectAll={() => {
          setSelectedTables(new Set())
          setSelectedBuckets(new Set())
        }}
        onSelectAllTables={() => setSelectedTables(new Set(restoreTables.map((t) => t.name)))}
        onDeselectAllTables={() => setSelectedTables(new Set())}
        onSelectAllBuckets={() => setSelectedBuckets(new Set(restoreBuckets.map((b) => b.name)))}
        onDeselectAllBuckets={() => setSelectedBuckets(new Set())}
        onToggleTable={(name) => toggleInSet(setSelectedTables, name)}
        onToggleBucket={(name) => toggleInSet(setSelectedBuckets, name)}
        onRefresh={refreshRestoreChooser}
        onConfirm={confirmRestoreSelected}
      />

      <BackupChooserModal
        open={!!backupModal}
        kind={backupModal?.kind}
        loading={backupSourcesLoading}
        tables={backupTables}
        buckets={backupBuckets}
        selectedTables={backupSelectedTables}
        selectedBuckets={backupSelectedBuckets}
        saveAsDefault={backupSaveAsDefault}
        onSaveAsDefaultChange={setBackupSaveAsDefault}
        confirming={runningFull}
        onClose={() => { if (!runningFull) setBackupModal(null) }}
        onSelectAll={() => {
          setBackupSelectedTables(new Set(backupTables.map((t) => t.name)))
          setBackupSelectedBuckets(new Set(backupBuckets.map((b) => b.name)))
        }}
        onDeselectAll={() => {
          setBackupSelectedTables(new Set())
          setBackupSelectedBuckets(new Set())
        }}
        onSelectAllTables={() => setBackupSelectedTables(new Set(backupTables.map((t) => t.name)))}
        onDeselectAllTables={() => setBackupSelectedTables(new Set())}
        onSelectAllBuckets={() => setBackupSelectedBuckets(new Set(backupBuckets.map((b) => b.name)))}
        onDeselectAllBuckets={() => setBackupSelectedBuckets(new Set())}
        onToggleTable={(name) => toggleInSet(setBackupSelectedTables, name)}
        onToggleBucket={(name) => toggleInSet(setBackupSelectedBuckets, name)}
        onConfirm={confirmBackupSelected}
      />
    </div>
  )
}
