import { useCallback, useEffect, useState } from 'react'
import {
  Cloud, Database, HardDrive, History, Loader2, RefreshCw,
  RotateCcw, Save, Settings2, Shield,
} from 'lucide-react'
import { useAuth } from '../lib/AuthContext'
import { useToast } from '../lib/toast'
import {
  formatBytes,
  formatWhen,
  getBackupSettings,
  listBackupLogs,
  runDriveBackup,
  runProvision,
  saveBackupSettings,
} from '../lib/cmsFullBackup'

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

function LogTable({ rows, loading, empty }) {
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
            <th style={thStyle}>Drive</th>
            <th style={thStyle}>File</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={8} style={{ ...tdStyle, textAlign: 'center', color: 'var(--text-3)' }}>Loading…</td></tr>
          ) : !rows.length ? (
            <tr><td colSpan={8} style={{ ...tdStyle, textAlign: 'center', color: 'var(--text-3)' }}>{empty}</td></tr>
          ) : rows.map((row) => (
            <tr key={row.id}>
              <td style={tdStyle}>{formatWhen(row.created_at)}</td>
              <td style={tdStyle}>{row.trigger_mode || '—'}</td>
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
  )
}

export default function BackupPage() {
  const { profile } = useAuth()
  const toast = useToast()
  const isSuper = profile?.role === 'super_admin'

  const [settings, setSettings] = useState(null)
  const [driveFolderId, setDriveFolderId] = useState('')
  const [savingDrive, setSavingDrive] = useState(false)
  const [savingAuto, setSavingAuto] = useState(false)

  const [fullLogs, setFullLogs] = useState([])
  const [snapLogs, setSnapLogs] = useState([])
  const [loadingLogs, setLoadingLogs] = useState(true)
  const [runningFull, setRunningFull] = useState(false)
  const [runningSnap, setRunningSnap] = useState(false)

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

  const loadSettings = useCallback(async () => {
    try {
      const s = await getBackupSettings()
      setSettings(s)
      setDriveFolderId(s.drive_folder_id || '')
    } catch (e) {
      toast(e.message || 'Failed to load backup settings', 'error')
    }
  }, [toast])

  const loadLogs = useCallback(async () => {
    setLoadingLogs(true)
    try {
      const [f, s] = await Promise.all([
        listBackupLogs({ kind: 'full', pageSize: 25 }),
        listBackupLogs({ kind: 'snapshot', pageSize: 25 }),
      ])
      setFullLogs(f.rows)
      setSnapLogs(s.rows)
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
  }, [isSuper, loadSettings, loadLogs])

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

  async function handleRun(kind) {
    const setBusy = kind === 'full' ? setRunningFull : setRunningSnap
    setBusy(true)
    try {
      const r = await runDriveBackup({ kind, triggerMode: 'manual', actor: profile })
      toast(
        `${kind === 'full' ? 'Full Backup' : 'Snapshot'} saved to Google Drive — ${r.tables_count} tables, ${r.rows_count} rows.`,
        'success',
      )
      await loadLogs()
    } catch (e) {
      toast(e.message || 'Backup failed (deploy cms-full-backup + set GOOGLE_SERVICE_ACCOUNT_JSON)', 'error')
    } finally {
      setBusy(false)
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
      toast(e.message || 'Provision failed (deploy cms-provision function)', 'error')
    } finally {
      setProvRunning(false)
    }
  }

  const driveOk = !!(settings?.drive_folder_id || driveFolderId.trim())

  return (
    <div style={{ padding: '20px 24px 48px', maxWidth: 960, margin: '0 auto', fontFamily: 'var(--font-ui)' }}>
      <div style={{ marginBottom: 18 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: 'var(--text-1)', letterSpacing: '-0.02em' }}>
          Backup &amp; Restore
        </h1>
        <p style={{ margin: '6px 0 0', fontSize: 13, color: 'var(--text-3)', lineHeight: 1.45 }}>
          Super Admin only. Backups and snapshots are stored in Google Drive. Use New Setup when deploying a church to a new Supabase project.
        </p>
      </div>

      {/* 1. Google Drive */}
      <Section
        title="Google Drive"
        icon={Cloud}
        subtitle="Save this church’s Drive folder ID. All Full Backups and Snapshots are stored only here."
      >
        <div style={{ display: 'grid', gap: 10, maxWidth: 520 }}>
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
            <button type="button" className="action-btn" style={{ gap: 6, fontSize: 12, padding: '8px 14px' }} disabled={savingDrive} onClick={handleSaveDrive}>
              {savingDrive ? <Loader2 size={14} className="spin" /> : <Save size={14} />}
              Save folder ID
            </button>
            <span style={{
              fontSize: 12, fontWeight: 600,
              color: driveOk ? '#047857' : '#b45309',
            }}>
              {driveOk ? 'Drive folder configured' : 'Not configured yet'}
            </span>
          </div>
          <p style={{ margin: 0, fontSize: 11, color: 'var(--text-3)', lineHeight: 1.5 }}>
            Share the folder with your Google service-account email. Set Edge Function secret <code>GOOGLE_SERVICE_ACCOUNT_JSON</code>.
          </p>
        </div>
      </Section>

      {/* 2. Full Backup */}
      <Section
        title="Full Backup"
        icon={Database}
        subtitle="Complete safety copy for crash recovery or moving to a new Supabase project. Automatic daily + manual."
      >
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 14, alignItems: 'center' }}>
          <button
            type="button"
            className="action-btn"
            style={{ gap: 6, fontSize: 12, padding: '8px 14px' }}
            disabled={runningFull || !driveOk}
            onClick={() => handleRun('full')}
          >
            {runningFull ? <Loader2 size={14} className="spin" /> : <HardDrive size={14} />}
            {runningFull ? 'Backing up…' : 'Run Full Backup now'}
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
          <button type="button" className="action-btn" style={secondaryBtn} onClick={loadLogs}>
            <RefreshCw size={13} /> Refresh
          </button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
          <History size={14} color="var(--text-3)" />
          <strong style={{ fontSize: 12 }}>Full Backup history</strong>
        </div>
        <LogTable rows={fullLogs} loading={loadingLogs} empty="No full backups yet" />
        <p style={{ margin: '10px 0 0', fontSize: 11, color: 'var(--text-3)', lineHeight: 1.5 }}>
          Restore: open the Drive file, then use New Setup / restore tooling on the target project. A one-click restore will replace live data — use Snapshots for “back to yesterday”.
        </p>
      </Section>

      {/* 3. Snapshot */}
      <Section
        title="Snapshot"
        icon={RotateCcw}
        subtitle="Dated restore points so you can roll the church back (e.g. to yesterday) if wrong entries were made."
      >
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 14, alignItems: 'center' }}>
          <button
            type="button"
            className="action-btn"
            style={{ gap: 6, fontSize: 12, padding: '8px 14px' }}
            disabled={runningSnap || !driveOk}
            onClick={() => handleRun('snapshot')}
          >
            {runningSnap ? <Loader2 size={14} className="spin" /> : <RotateCcw size={14} />}
            {runningSnap ? 'Taking snapshot…' : 'Take Snapshot now'}
          </button>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-2)' }}>
            <input
              type="checkbox"
              checked={!!settings?.snapshot_auto_enabled}
              disabled={savingAuto || !settings}
              onChange={(e) => handleSaveAuto({ snapshot_auto_enabled: e.target.checked })}
            />
            Automatic nightly (default 1:00 AM IST)
          </label>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
          <History size={14} color="var(--text-3)" />
          <strong style={{ fontSize: 12 }}>Snapshot restore points</strong>
        </div>
        <LogTable rows={snapLogs} loading={loadingLogs} empty="No snapshots yet" />
        <p style={{ margin: '10px 0 0', fontSize: 11, color: 'var(--text-3)', lineHeight: 1.5 }}>
          Restoring a snapshot replaces current data with that day’s copy. Keep automatic snapshots on for treasurer “back to yesterday” recovery.
        </p>
      </Section>

      {/* 4. New Setup / Upgrade */}
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
                fontWeight: prov.mode === m ? 800 : 500,
                borderColor: prov.mode === m ? '#0f766e' : 'var(--card-border)',
                background: prov.mode === m ? '#f0fdfa' : 'var(--card-bg)',
              }}
              className="action-btn"
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
            <input style={{ ...inputStyle }} type="password" value={prov.dbPassword} onChange={(e) => setProv({ ...prov, dbPassword: e.target.value })} autoComplete="new-password" />
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
            <input style={inputStyle} type="password" value={prov.superAdminPassword} onChange={(e) => setProv({ ...prov, superAdminPassword: e.target.value })} autoComplete="new-password" />
          </div>
        </div>

        <div style={{ marginTop: 14, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            type="button"
            className="action-btn"
            style={{ gap: 6, fontSize: 12, padding: '8px 14px' }}
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
    </div>
  )
}
