import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Bell, BellOff, CalendarClock, Clock, CreditCard, FileText, HardDrive, Loader2, Lock,
  Plus, Settings, ShieldAlert, Trash2, Volume2, VolumeX, X,
} from 'lucide-react'
import { supabase, getChurch, LICENSE_CSV } from '../../lib/supabase'
import { listBackupLogs } from '../../lib/cmsFullBackup'
import { getChurchDocumentsDueForAlert, daysUntilDate } from '../../lib/churchDocumentsLib'
import { formatDate } from '../../lib/date'
import { useAuth } from '../../lib/AuthContext'
import {
  createUserAlert,
  deleteUserAlert,
  isUserAlertDue,
  listEnrolledUsersForAlerts,
  listUserAlerts,
  updateUserAlert,
  USER_ALERT_SCOPES,
} from '../../lib/userAlertsLib'
import {
  ALERT_IDS,
  ALERT_TYPE_OPTIONS,
  SNOOZE_OPTIONS,
  clearAlertSnooze,
  formatSnoozeUntil,
  getEnabledAlertTypes,
  getSnoozeMap,
  isAlertSnoozed,
  isAlertTypeEnabled,
  isNotificationsSilent,
  setAlertTypeEnabled,
  setNotificationsSilent,
  snoozeAlert,
} from '../../lib/cmsNotifications'

const PANEL_TOP = 96 // HEADER_H (88) + 8

function parseLicenseExpiry(validUpto) {
  const parts = validUpto?.split(/[-\/]/)
  if (parts?.length !== 3) return null
  const d = new Date(parseInt(parts[2], 10), parseInt(parts[1], 10) - 1, parseInt(parts[0], 10))
  return Number.isNaN(d.getTime()) ? null : d
}

const EMPTY_FORM = {
  title: '',
  due_date: '',
  alert_days_before: '10',
  scope: 'self',
  allUsers: false,
  recipientIds: [],
}

async function fetchAlerts(userId) {
  const alerts = []

  // 1) Pending payment confirmations
  try {
    const { count, error } = await supabase
      .from('payment_requests')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'paid_by_member')
    if (!error && (count || 0) > 0) {
      alerts.push({
        id: ALERT_IDS.payment,
        severity: 'warning',
        title: 'Pending Payment Confirmations',
        detail: `${count} payment${count === 1 ? '' : 's'} awaiting confirmation`,
        count,
        href: '/receipts',
      })
    }
  } catch (e) {
    console.warn('[notifications] payment check failed', e)
  }

  // 2) License expiry in less than 30 days
  try {
    const church = await getChurch()
    const code = church?.auth_code?.trim()?.toUpperCase()
    if (code && code !== '0000-DEMOACCOUNT') {
      const resp = await fetch(LICENSE_CSV)
      const text = await resp.text()
      const rows = text.trim().split('\n').slice(1)
      let found = null
      for (const row of rows) {
        const cols = row.split(',').map((c) => c.trim().replace(/^"|"$/g, ''))
        const [rowCode, , , validUpto, status] = cols
        if (rowCode?.toUpperCase() === code) {
          found = { validUpto, status }
          break
        }
      }
      if (found) {
        const inactive = found.status?.toLowerCase().includes('inactive')
        const expiry = parseLicenseExpiry(found.validUpto)
        if (!inactive && expiry) {
          const daysLeft = Math.ceil((expiry - new Date()) / 86400000)
          if (daysLeft < 30) {
            alerts.push({
              id: ALERT_IDS.license,
              severity: daysLeft <= 0 ? 'danger' : 'warning',
              title: 'License Expiry',
              detail: daysLeft <= 0
                ? `License expired${found.validUpto ? ` on ${found.validUpto}` : ''}`
                : `Expires in ${daysLeft} day${daysLeft === 1 ? '' : 's'} (${found.validUpto})`,
              count: 1,
              href: '/church-setup',
            })
          }
        } else if (inactive) {
          alerts.push({
            id: ALERT_IDS.license,
            severity: 'danger',
            title: 'License Inactive',
            detail: 'Church license is currently inactive',
            count: 1,
            href: '/church-setup',
          })
        }
      }
    }
  } catch (e) {
    console.warn('[notifications] license check failed', e)
  }

  // 3) Failed backup (recent)
  try {
    const { rows } = await listBackupLogs({ kind: 'full', pageSize: 15 })
    const failed = (rows || []).filter((r) => r.status === 'failed' || r.status === 'partial')
    if (failed.length) {
      const latest = failed[0]
      const when = latest.created_at
        ? new Date(latest.created_at).toLocaleString('en-IN', {
            day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true,
          })
        : 'recently'
      alerts.push({
        id: ALERT_IDS.backup,
        severity: latest.status === 'failed' ? 'danger' : 'warning',
        title: 'Failed Backup',
        detail: latest.status === 'partial'
          ? `Partial backup ${when}`
          : `Backup failed ${when}`,
        count: failed.length,
        href: '/backup',
      })
    }
  } catch (e) {
    console.warn('[notifications] backup check failed', e)
  }

  // 4) Document renewal / expiry alerts
  try {
    const due = await getChurchDocumentsDueForAlert()
    if (due.length) {
      const sorted = [...due].sort((a, b) => {
        const da = daysUntilDate(a.warranty_upto) ?? 9999
        const db = daysUntilDate(b.warranty_upto) ?? 9999
        return da - db
      })
      const first = sorted[0]
      const left = daysUntilDate(first.warranty_upto)
      const firstLine = left == null
        ? first.title
        : left <= 0
          ? `${first.title} — overdue`
          : `${first.title} — ${left} day${left === 1 ? '' : 's'} left`
      const extra = sorted.length > 1 ? ` (+${sorted.length - 1} more)` : ''
      alerts.push({
        id: ALERT_IDS.documents,
        severity: (left != null && left <= 0) ? 'danger' : 'warning',
        title: 'Documents - Renewal',
        detail: `${firstLine}${extra}`,
        count: sorted.length,
        href: '/assets?tab=document',
      })
    }
  } catch (e) {
    console.warn('[notifications] document renewal check failed', e)
  }

  // 5) User-created reminders
  try {
    const rows = await listUserAlerts()
    for (const row of rows) {
      const mine = !!userId && row.created_by === userId
      const due = isUserAlertDue(row)
      if (!mine && !due) continue
      const left = daysUntilDate(row.due_date)
      const dueLabel = formatDate(row.due_date)
      let detail
      let severity
      if (left == null) {
        detail = `Due ${dueLabel}`
        severity = 'info'
      } else if (left <= 0) {
        detail = `Due ${dueLabel} — overdue`
        severity = 'danger'
      } else if (due) {
        detail = `Due ${dueLabel} — ${left} day${left === 1 ? '' : 's'} left`
        severity = 'warning'
      } else {
        const before = row.alert_days_before
        detail = `Due ${dueLabel} · alert ${before} day${before === 1 ? '' : 's'} before`
        severity = 'info'
      }
      if (row.scope === 'all') {
        detail += mine ? ' · for all' : ' · shared'
      } else if (row.scope === 'selected') {
        const n = row.recipientIds?.length || 0
        detail += mine ? ` · for ${n} user${n === 1 ? '' : 's'}` : ' · shared'
      }
      alerts.push({
        id: `user:${row.id}`,
        typeId: ALERT_IDS.user,
        userAlertId: row.id,
        canDelete: mine,
        due_date: row.due_date,
        alert_days_before: row.alert_days_before,
        scope: row.scope,
        recipientIds: row.recipientIds || [],
        due,
        severity,
        title: row.title,
        detail,
        count: due ? 1 : 0,
        href: null,
      })
    }
  } catch (e) {
    console.warn('[notifications] user alerts check failed', e)
  }

  return alerts
}

const SEVERITY = {
  danger:  { bg: '#fef2f2', border: '#fecaca', color: '#b91c1c', icon: '#dc2626' },
  warning: { bg: '#fffbeb', border: '#fde68a', color: '#92400e', icon: '#d97706' },
  info:    { bg: '#eff6ff', border: '#bfdbfe', color: '#1e40af', icon: '#2563eb' },
}

const ALERT_ICON = {
  [ALERT_IDS.payment]: CreditCard,
  [ALERT_IDS.license]: ShieldAlert,
  [ALERT_IDS.backup]: HardDrive,
  [ALERT_IDS.documents]: FileText,
  [ALERT_IDS.user]: CalendarClock,
}

function ToggleSwitch({ on, disabled, onToggle, accent }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={disabled}
      onClick={(e) => { e.stopPropagation(); if (!disabled) onToggle() }}
      title={disabled ? 'Always on' : (on ? 'Turn off' : 'Turn on')}
      style={{
        width: 42, height: 24, borderRadius: 99, flexShrink: 0,
        border: 'none', padding: 2, cursor: disabled ? 'not-allowed' : 'pointer',
        background: on ? (accent || '#2563eb') : '#cbd5e1',
        opacity: disabled ? 0.85 : 1,
        transition: 'background 0.15s',
        position: 'relative',
        outline: 'none',
      }}
    >
      <span style={{
        position: 'absolute',
        top: 2, left: on ? 20 : 2,
        width: 20, height: 20, borderRadius: '50%',
        background: '#fff',
        boxShadow: '0 1px 3px rgba(0,0,0,0.25)',
        transition: 'left 0.15s',
      }} />
    </button>
  )
}

export default function NotificationBell({ g }) {
  const navigate = useNavigate()
  const { user } = useAuth()
  const ref = useRef(null)
  const [open, setOpen] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [enrolledUsers, setEnrolledUsers] = useState([])
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [loading, setLoading] = useState(true)
  const [alerts, setAlerts] = useState([])
  const [silent, setSilent] = useState(() => isNotificationsSilent())
  const [snoozeMap, setSnoozeMap] = useState(() => getSnoozeMap())
  const [enabledTypes, setEnabledTypes] = useState(() => getEnabledAlertTypes())
  const [snoozeFor, setSnoozeFor] = useState(null) // alertId menu open

  const refreshPrefs = useCallback(() => {
    setSilent(isNotificationsSilent())
    setSnoozeMap(getSnoozeMap())
    setEnabledTypes(getEnabledAlertTypes())
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const next = await fetchAlerts(user?.id)
      setAlerts(next)
    } finally {
      setLoading(false)
    }
  }, [user?.id])

  useEffect(() => {
    load()
    const id = setInterval(load, 5 * 60 * 1000)
    return () => clearInterval(id)
  }, [load])

  useEffect(() => {
    if (!showCreate) return
    let cancelled = false
    listEnrolledUsersForAlerts()
      .then((rows) => { if (!cancelled) setEnrolledUsers(rows) })
      .catch((e) => {
        console.warn('[notifications] enrolled users failed', e)
        if (!cancelled) setEnrolledUsers([])
      })
    return () => { cancelled = true }
  }, [showCreate])

  useEffect(() => {
    const onPrefs = () => refreshPrefs()
    window.addEventListener('cms-notif-prefs-changed', onPrefs)
    return () => window.removeEventListener('cms-notif-prefs-changed', onPrefs)
  }, [refreshPrefs])

  useEffect(() => {
    const close = (e) => {
      if (ref.current && !ref.current.contains(e.target)) {
        setOpen(false)
        setSnoozeFor(null)
        setShowSettings(false)
        setShowCreate(false)
        setFormError('')
      }
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  const now = Date.now()
  const visibleAlerts = alerts.filter((a) => isAlertTypeEnabled(a.typeId || a.id))
  const activeAlerts = visibleAlerts.filter((a) => a.due !== false && !isAlertSnoozed(a.id, now))
  const badgeCount = silent ? 0 : activeAlerts.reduce((s, a) => s + (a.count ?? 1), 0)
  const showPulse = !silent && badgeCount > 0

  function toggleSilent() {
    const next = !silent
    setNotificationsSilent(next)
    setSilent(next)
  }

  function handleTypeToggle(alertId) {
    if (alertId === ALERT_IDS.license) return
    const nextOn = !enabledTypes[alertId]
    setAlertTypeEnabled(alertId, nextOn)
    setEnabledTypes(getEnabledAlertTypes())
  }

  function handleSnooze(alertId, optionId) {
    snoozeAlert(alertId, optionId)
    setSnoozeMap(getSnoozeMap())
    setSnoozeFor(null)
  }

  function handleClearSnooze(alertId) {
    clearAlertSnooze(alertId)
    setSnoozeMap(getSnoozeMap())
  }

  function openCreate() {
    setShowCreate(true)
    setShowSettings(false)
    setSnoozeFor(null)
    setForm(EMPTY_FORM)
    setFormError('')
  }

  function openEdit(alert) {
    if (!alert?.userAlertId || !alert.canDelete) return
    setShowCreate(true)
    setShowSettings(false)
    setSnoozeFor(null)
    const shared = alert.scope === 'all' || alert.scope === 'selected'
    setForm({
      id: alert.userAlertId,
      title: alert.title || '',
      due_date: String(alert.due_date || '').slice(0, 10),
      alert_days_before: String(alert.alert_days_before || 10),
      scope: shared ? 'selected' : 'self',
      allUsers: alert.scope === 'all',
      recipientIds: alert.scope === 'selected' ? (alert.recipientIds || []) : [],
    })
    setFormError('')
  }

  function closeCreate() {
    setShowCreate(false)
    setFormError('')
    setSaving(false)
    setForm(EMPTY_FORM)
  }

  async function handleSaveAlert(e) {
    e.preventDefault()
    setSaving(true)
    setFormError('')
    try {
      if (form.id) await updateUserAlert(form.id, form)
      else await createUserAlert(form)
      closeCreate()
      await load()
    } catch (err) {
      setFormError(err?.message || 'Could not save alert.')
    } finally {
      setSaving(false)
    }
  }

  async function handleDeleteUserAlert(alert) {
    if (!alert?.userAlertId || !alert.canDelete) return
    if (!window.confirm(`Delete reminder “${alert.title}”?`)) return
    try {
      await deleteUserAlert(alert.userAlertId)
      clearAlertSnooze(alert.id)
      setSnoozeMap(getSnoozeMap())
      setAlerts((prev) => prev.filter((a) => a.id !== alert.id))
    } catch (err) {
      console.warn('[notifications] delete user alert failed', err)
    }
  }

  return (
    <div ref={ref} style={{ position: 'relative', flexShrink: 0 }}>
      <button
        type="button"
        onClick={() => {
          setOpen((o) => !o)
          if (!open) {
            load()
            setShowSettings(false)
            setShowCreate(false)
            setFormError('')
          }
        }}
        aria-label="Notifications"
        aria-expanded={open}
        style={{
          position: 'relative',
          width: 42, height: 42, borderRadius: 12,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          border: `1.5px solid ${open ? g.accent : 'rgba(255,255,255,0.22)'}`,
          background: open ? 'rgba(0,0,0,0.38)' : 'rgba(0,0,0,0.28)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          boxShadow: open ? `0 0 0 3px ${g.accentL}` : '0 2px 10px rgba(0,0,0,0.28)',
          cursor: 'pointer', outline: 'none',
          transition: 'border-color 0.2s, box-shadow 0.2s',
        }}
      >
        {silent
          ? <BellOff size={18} color="#fff" />
          : <Bell size={18} color="#fff" className={showPulse ? 'notif-bell-pulse' : undefined} />}
        {badgeCount > 0 && (
          <span style={{
            position: 'absolute', top: -4, right: -4,
            minWidth: 18, height: 18, padding: '0 5px',
            borderRadius: 99, background: '#ef4444', color: '#fff',
            fontSize: 10, fontWeight: 800, lineHeight: '18px', textAlign: 'center',
            border: '2px solid rgba(7,20,40,0.9)',
            boxShadow: '0 2px 8px rgba(239,68,68,0.45)',
          }}>
            {badgeCount > 99 ? '99+' : badgeCount}
          </span>
        )}
      </button>

      {open && (
        <div style={{
          position: 'fixed',
          top: PANEL_TOP,
          right: 16,
          width: 380,
          maxWidth: 'calc(100vw - 24px)',
          maxHeight: 'min(480px, calc(100vh - 110px))',
          overflow: 'hidden',
          background: g.drop.bg,
          border: `1px solid ${g.drop.border}`,
          borderRadius: 16,
          boxShadow: '0 16px 48px rgba(0,0,0,0.22), 0 4px 12px rgba(0,0,0,0.1)',
          zIndex: 1000,
          display: 'flex',
          flexDirection: 'column',
          animation: 'dropDown 0.18s ease both',
        }}>
          {/* Panel header */}
          <div style={{
            padding: '14px 16px',
            borderBottom: `1px solid ${g.drop.border}`,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
          }}>
            <div>
              <p style={{ margin: 0, fontSize: 14, fontWeight: 800, color: g.drop.text }}>
                {showSettings ? 'Alert settings' : showCreate ? (form.id ? 'Edit alert' : 'Create alert') : 'Alerts'}
              </p>
              <p style={{ margin: '2px 0 0', fontSize: 11, color: g.drop.sub }}>
                {showSettings
                  ? 'Choose which alerts you receive'
                  : showCreate
                    ? (form.id ? 'Update your reminder' : 'Personal or shared reminder')
                    : (silent ? 'Silent mode on' : `${activeAlerts.length} active`)}
              </p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {!showSettings && !showCreate && (
                <button
                  type="button"
                  onClick={toggleSilent}
                  title={silent ? 'Turn notifications on' : 'Turn notifications off — hide badge'}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 5,
                    padding: '6px 10px', borderRadius: 8, cursor: 'pointer',
                    border: `1px solid ${g.drop.border}`,
                    background: silent ? 'rgba(239,68,68,0.1)' : 'transparent',
                    color: silent ? '#dc2626' : g.drop.text,
                    fontSize: 11, fontWeight: 700,
                  }}
                >
                  {silent ? <VolumeX size={13} /> : <Volume2 size={13} />}
                  {silent ? 'Notification Off' : 'Notification On'}
                </button>
              )}
              {!showSettings && (
                <button
                  type="button"
                  className={showCreate ? undefined : 'notif-create-plus'}
                  onClick={() => (showCreate ? closeCreate() : openCreate())}
                  title={showCreate ? 'Back to alerts' : 'Create alert'}
                  aria-label="Create alert"
                  style={{
                    height: 28, borderRadius: 8, cursor: 'pointer',
                    padding: showCreate ? '0 8px' : 0,
                    width: showCreate ? 'auto' : 28,
                    border: showCreate ? `1px solid ${g.drop.border}` : 'none',
                    background: showCreate ? 'transparent' : g.drop.text,
                    color: showCreate ? g.drop.sub : g.drop.bg,
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                    fontSize: 11, fontWeight: 700,
                    position: 'relative',
                    ['--plus-glow']: g.drop.text,
                  }}
                >
                  {showCreate ? <X size={14} /> : <Plus size={14} />}
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  setShowSettings((s) => !s)
                  setSnoozeFor(null)
                  setShowCreate(false)
                  setFormError('')
                }}
                title={showSettings ? 'Back to alerts' : 'Alert settings'}
                aria-label="Alert settings"
                style={{
                  width: 28, height: 28, borderRadius: 8,
                  border: `1px solid ${showSettings ? g.accent : g.drop.border}`,
                  background: showSettings ? (g.accentL || 'rgba(37,99,235,0.12)') : 'transparent',
                  color: showSettings ? g.accent : g.drop.sub,
                  cursor: 'pointer',
                  display: 'grid', placeItems: 'center',
                }}
              >
                <Settings size={14} />
              </button>
              <button
                type="button"
                aria-label="Close notifications"
                onClick={() => {
                  setOpen(false)
                  setSnoozeFor(null)
                  setShowSettings(false)
                  setShowCreate(false)
                  setFormError('')
                }}
                style={{
                  width: 28, height: 28, borderRadius: 8, border: 'none',
                  background: 'transparent', color: g.drop.sub, cursor: 'pointer',
                  display: 'grid', placeItems: 'center',
                }}
              >
                <X size={14} />
              </button>
            </div>
          </div>

          {/* Body */}
          <div style={{ overflowY: 'auto', flex: 1, padding: 10 }}>
            {showCreate ? (
              <form onSubmit={handleSaveAlert} style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '2px 2px 6px' }}>
                {(() => {
                  const inputStyle = {
                    width: '100%',
                    boxSizing: 'border-box',
                    padding: '8px 10px',
                    borderRadius: 8,
                    border: `1px solid ${g.drop.border}`,
                    background: g.drop.bg,
                    color: g.drop.text,
                    fontSize: 13,
                    outline: 'none',
                  }
                  const labelStyle = { display: 'block', fontSize: 11, fontWeight: 700, marginBottom: 5, color: g.drop.text }
                  return (
                    <>
                      <div>
                        <label style={labelStyle}>Title</label>
                        <input
                          style={inputStyle}
                          value={form.title}
                          onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                          placeholder="e.g. BSNL sim recharge"
                          autoFocus
                          required
                        />
                      </div>
                      <div>
                        <label style={labelStyle}>Due date</label>
                        <input
                          style={inputStyle}
                          type="date"
                          value={form.due_date}
                          onChange={(e) => setForm((f) => ({ ...f, due_date: e.target.value }))}
                          required
                        />
                        <p style={{ margin: '4px 0 0', fontSize: 10, color: g.drop.sub }}>
                          {form.due_date ? formatDate(form.due_date) : 'DD-MM-YYYY'}
                        </p>
                      </div>
                      <div>
                        <label style={labelStyle}>Alert before</label>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <input
                            style={{ ...inputStyle, width: 88 }}
                            type="number"
                            min={1}
                            max={365}
                            value={form.alert_days_before}
                            onChange={(e) => setForm((f) => ({ ...f, alert_days_before: e.target.value }))}
                            required
                          />
                          <span style={{ fontSize: 13, color: g.drop.sub }}>days</span>
                        </div>
                      </div>
                      <div>
                        <label style={labelStyle}>Alert type</label>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                          {USER_ALERT_SCOPES.map((opt) => {
                            const on = form.scope === opt.id
                            return (
                              <button
                                key={opt.id}
                                type="button"
                                onClick={() => setForm((f) => ({
                                  ...f,
                                  scope: opt.id,
                                  allUsers: opt.id === 'selected' ? (f.scope === 'selected' ? f.allUsers : true) : false,
                                  recipientIds: opt.id === 'selected' ? f.recipientIds : [],
                                }))}
                                style={{
                                  padding: '8px 10px',
                                  borderRadius: 8,
                                  border: `1px solid ${on ? g.accent : g.drop.border}`,
                                  background: on ? (g.accentL || 'rgba(37,99,235,0.12)') : 'transparent',
                                  color: g.drop.text,
                                  fontSize: 12,
                                  fontWeight: 700,
                                  cursor: 'pointer',
                                }}
                              >
                                {opt.label}
                              </button>
                            )
                          })}
                        </div>
                        {form.scope === 'selected' && (
                          <div style={{
                            marginTop: 6,
                            maxHeight: 168,
                            overflowY: 'auto',
                            borderRadius: 8,
                            border: `1px solid ${g.drop.border}`,
                            padding: 4,
                          }}>
                            <label style={{
                              display: 'flex', alignItems: 'center', gap: 8,
                              padding: '7px 8px', borderRadius: 6, cursor: 'pointer',
                              background: form.allUsers ? (g.accentL || 'rgba(37,99,235,0.12)') : 'transparent',
                              fontSize: 12, fontWeight: 800, color: g.drop.text,
                            }}>
                              <input
                                type="checkbox"
                                checked={!!form.allUsers}
                                onChange={() => setForm((f) => ({
                                  ...f,
                                  allUsers: !f.allUsers,
                                  recipientIds: !f.allUsers ? [] : f.recipientIds,
                                }))}
                              />
                              All
                            </label>
                            {enrolledUsers.filter((u) => u.id !== user?.id).map((u) => {
                              const checked = !form.allUsers && form.recipientIds.includes(u.id)
                              return (
                                <label
                                  key={u.id}
                                  style={{
                                    display: 'flex', alignItems: 'center', gap: 8,
                                    padding: '6px 8px', borderRadius: 6, cursor: 'pointer',
                                    opacity: form.allUsers ? 0.55 : 1,
                                    fontSize: 12, fontWeight: 600, color: g.drop.text,
                                  }}
                                >
                                  <input
                                    type="checkbox"
                                    disabled={form.allUsers}
                                    checked={form.allUsers || checked}
                                    onChange={() => setForm((f) => {
                                      const next = new Set(f.recipientIds)
                                      if (next.has(u.id)) next.delete(u.id)
                                      else next.add(u.id)
                                      return { ...f, allUsers: false, recipientIds: [...next] }
                                    })}
                                  />
                                  {u.label}
                                </label>
                              )
                            })}
                            {!enrolledUsers.length && (
                              <p style={{ margin: '4px 8px 6px', fontSize: 11, color: g.drop.sub }}>
                                No enrolled users found.
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                      {formError && (
                        <p style={{ margin: 0, fontSize: 12, color: '#b91c1c' }}>{formError}</p>
                      )}
                      <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                        <button
                          type="button"
                          onClick={closeCreate}
                          style={{
                            flex: 1, padding: '9px 10px', borderRadius: 8, cursor: 'pointer',
                            border: `1px solid ${g.drop.border}`, background: 'transparent',
                            color: g.drop.text, fontSize: 13, fontWeight: 700,
                          }}
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          disabled={saving}
                          style={{
                            flex: 1, padding: '9px 10px', borderRadius: 8, cursor: saving ? 'wait' : 'pointer',
                            border: 'none', background: g.accent || '#2563eb', color: '#fff',
                            fontSize: 13, fontWeight: 800,
                            opacity: saving ? 0.75 : 1,
                          }}
                        >
                          {saving ? 'Saving…' : (form.id ? 'Save changes' : 'Save alert')}
                        </button>
                      </div>
                    </>
                  )
                })()}
              </form>
            ) : showSettings ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {ALERT_TYPE_OPTIONS.map((opt) => {
                  const on = enabledTypes[opt.id] !== false
                  const Icon = ALERT_ICON[opt.id] || Bell
                  const locked = !!opt.locked
                  return (
                    <div
                      key={opt.id}
                      style={{
                        borderRadius: 12,
                        border: `1px solid ${g.drop.border}`,
                        background: g.drop.hov || 'rgba(15,23,42,0.03)',
                        padding: '12px 12px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                      }}
                    >
                      <div style={{
                        width: 34, height: 34, borderRadius: 9, flexShrink: 0,
                        background: g.drop.bg,
                        border: `1px solid ${g.drop.border}`,
                        display: 'grid', placeItems: 'center',
                      }}>
                        <Icon size={15} color={g.drop.sub} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{
                          margin: 0, fontSize: 13, fontWeight: 800, color: g.drop.text,
                          display: 'flex', alignItems: 'center', gap: 6,
                        }}>
                          {opt.label}
                          {locked && (
                            <span style={{
                              display: 'inline-flex', alignItems: 'center', gap: 3,
                              fontSize: 10, fontWeight: 700, color: g.drop.sub,
                              background: 'rgba(15,23,42,0.06)',
                              padding: '2px 6px', borderRadius: 99,
                            }}>
                              <Lock size={9} /> Always on
                            </span>
                          )}
                        </p>
                        <p style={{ margin: '3px 0 0', fontSize: 11, color: g.drop.sub, lineHeight: 1.4 }}>
                          {opt.description}
                        </p>
                      </div>
                      <ToggleSwitch
                        on={on}
                        disabled={locked}
                        accent={g.accent}
                        onToggle={() => handleTypeToggle(opt.id)}
                      />
                    </div>
                  )
                })}
              </div>
            ) : loading && !visibleAlerts.length ? (
              <div style={{ padding: 28, textAlign: 'center', color: g.drop.sub }}>
                <Loader2 size={18} className="animate-spin" style={{ margin: '0 auto 8px' }} />
                <p style={{ margin: 0, fontSize: 12 }}>Checking alerts…</p>
              </div>
            ) : visibleAlerts.length === 0 ? (
              <div style={{ padding: 28, textAlign: 'center', color: g.drop.sub, fontSize: 13 }}>
                No alerts right now.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {visibleAlerts.map((a) => {
                  const snoozed = isAlertSnoozed(a.id, now)
                  const sev = SEVERITY[a.severity] || SEVERITY.info
                  const Icon = ALERT_ICON[a.typeId || a.id] || Bell
                  const until = snoozeMap[a.id]
                  return (
                    <div
                      key={a.id}
                      style={{
                        borderRadius: 12,
                        border: `1px solid ${snoozed ? g.drop.border : sev.border}`,
                        background: snoozed ? 'transparent' : sev.bg,
                        padding: '12px 12px 10px',
                        opacity: snoozed ? 0.72 : 1,
                      }}
                    >
                      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                        <div
                          role={a.canDelete ? 'button' : undefined}
                          title={a.canDelete ? 'Edit alert' : undefined}
                          onClick={() => openEdit(a)}
                          style={{
                            width: 34, height: 34, borderRadius: 9, flexShrink: 0,
                            background: snoozed ? g.drop.hov : '#fff',
                            border: `1px solid ${snoozed ? g.drop.border : sev.border}`,
                            display: 'grid', placeItems: 'center',
                            cursor: a.canDelete ? 'pointer' : 'default',
                          }}
                        >
                          <Icon size={15} color={snoozed ? g.drop.sub : sev.icon} />
                        </div>
                        <div
                          style={{ flex: 1, minWidth: 0, cursor: a.href ? 'pointer' : 'default' }}
                          onClick={() => {
                            if (!a.href) return
                            setOpen(false)
                            setSnoozeFor(null)
                            navigate(a.href)
                          }}
                        >
                          <p style={{ margin: 0, fontSize: 13, fontWeight: 800, color: snoozed ? g.drop.sub : sev.color }}>
                            {a.title}
                          </p>
                          <p style={{ margin: '3px 0 0', fontSize: 12, color: g.drop.sub, lineHeight: 1.4 }}>
                            {a.detail}
                          </p>
                          {snoozed && until && (
                            <p style={{ margin: '6px 0 0', fontSize: 11, color: g.drop.sub, display: 'flex', alignItems: 'center', gap: 4 }}>
                              <Clock size={11} /> Snoozed until {formatSnoozeUntil(until)}
                            </p>
                          )}
                        </div>
                        <div style={{ flexShrink: 0, alignSelf: 'center', display: 'flex', alignItems: 'center', gap: 4 }}>
                          {a.canDelete && (
                            <button
                              type="button"
                              title="Delete alert"
                              aria-label="Delete alert"
                              onClick={() => handleDeleteUserAlert(a)}
                              style={{
                                width: 28, height: 28, borderRadius: 7, cursor: 'pointer',
                                border: `1px solid ${g.drop.border}`, background: 'transparent',
                                color: g.drop.sub, display: 'grid', placeItems: 'center',
                              }}
                            >
                              <Trash2 size={12} />
                            </button>
                          )}
                          {a.due === false ? null : snoozed ? (
                            <button
                              type="button"
                              onClick={() => handleClearSnooze(a.id)}
                              style={{
                                fontSize: 11, fontWeight: 600, padding: '5px 10px', borderRadius: 7,
                                border: `1px solid ${g.drop.border}`, background: 'transparent',
                                color: g.drop.text, cursor: 'pointer', whiteSpace: 'nowrap',
                              }}
                            >
                              Unsnooze
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setSnoozeFor(snoozeFor === a.id ? null : a.id)}
                              style={{
                                fontSize: 11, fontWeight: 600, padding: '5px 10px', borderRadius: 7,
                                border: `1px solid ${snoozeFor === a.id ? sev.icon : g.drop.border}`,
                                background: snoozeFor === a.id ? 'rgba(15,23,42,0.04)' : 'transparent',
                                color: g.drop.text, cursor: 'pointer', whiteSpace: 'nowrap',
                                display: 'inline-flex', alignItems: 'center', gap: 4,
                              }}
                            >
                              <Clock size={11} /> Snooze
                            </button>
                          )}
                        </div>
                      </div>

                      {snoozeFor === a.id && !snoozed && (
                        <div style={{
                          marginTop: 8,
                          display: 'grid',
                          gridTemplateColumns: '1fr 1fr',
                          gap: 6,
                          padding: 8,
                          borderRadius: 10,
                          border: `1px solid ${g.drop.border}`,
                          background: g.drop.bg,
                        }}>
                          {SNOOZE_OPTIONS.map((opt) => (
                            <button
                              key={opt.id}
                              type="button"
                              onClick={() => handleSnooze(a.id, opt.id)}
                              style={{
                                padding: '8px 10px', borderRadius: 8,
                                border: `1px solid ${g.drop.border}`,
                                background: g.drop.hov || 'rgba(15,23,42,0.04)',
                                color: g.drop.text, fontSize: 12, fontWeight: 700,
                                cursor: 'pointer', textAlign: 'center',
                              }}
                            >
                              {opt.label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}

      <style>{`
        @keyframes notifBellPulse {
          0%, 100% { transform: rotate(0deg); }
          15% { transform: rotate(12deg); }
          30% { transform: rotate(-10deg); }
          45% { transform: rotate(8deg); }
          60% { transform: rotate(-6deg); }
          75% { transform: rotate(3deg); }
        }
        .notif-bell-pulse {
          animation: notifBellPulse 1.8s ease-in-out infinite;
          transform-origin: top center;
        }
        .notif-create-plus {
          box-shadow: 0 0 0 0 color-mix(in srgb, var(--plus-glow, #071428) 45%, transparent);
          animation: notifPlusPulse 1.8s ease-out infinite;
        }
        @keyframes notifPlusPulse {
          0%   { box-shadow: 0 0 0 0 color-mix(in srgb, var(--plus-glow, #071428) 45%, transparent); transform: scale(1); }
          55%  { box-shadow: 0 0 0 8px color-mix(in srgb, var(--plus-glow, #071428) 0%, transparent); transform: scale(1.06); }
          100% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--plus-glow, #071428) 0%, transparent); transform: scale(1); }
        }
      `}</style>
    </div>
  )
}
