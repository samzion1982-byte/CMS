import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Bell, BellOff, Clock, CreditCard, HardDrive, Loader2,
  ShieldAlert, Volume2, VolumeX, X,
} from 'lucide-react'
import { supabase, getChurch, LICENSE_CSV } from '../../lib/supabase'
import { listBackupLogs } from '../../lib/cmsFullBackup'
import {
  ALERT_IDS,
  SNOOZE_OPTIONS,
  clearAlertSnooze,
  formatSnoozeUntil,
  getSnoozeMap,
  isAlertSnoozed,
  isNotificationsSilent,
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

async function fetchAlerts() {
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
}

export default function NotificationBell({ g }) {
  const navigate = useNavigate()
  const ref = useRef(null)
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [alerts, setAlerts] = useState([])
  const [silent, setSilent] = useState(() => isNotificationsSilent())
  const [snoozeMap, setSnoozeMap] = useState(() => getSnoozeMap())
  const [snoozeFor, setSnoozeFor] = useState(null) // alertId menu open

  const refreshPrefs = useCallback(() => {
    setSilent(isNotificationsSilent())
    setSnoozeMap(getSnoozeMap())
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const next = await fetchAlerts()
      setAlerts(next)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
    const id = setInterval(load, 5 * 60 * 1000)
    return () => clearInterval(id)
  }, [load])

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
      }
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  const now = Date.now()
  const activeAlerts = alerts.filter((a) => !isAlertSnoozed(a.id, now))
  const badgeCount = silent ? 0 : activeAlerts.reduce((s, a) => s + (a.count || 1), 0)
  const showPulse = !silent && activeAlerts.length > 0

  function toggleSilent() {
    const next = !silent
    setNotificationsSilent(next)
    setSilent(next)
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

  return (
    <div ref={ref} style={{ position: 'relative', flexShrink: 0 }}>
      <button
        type="button"
        onClick={() => { setOpen((o) => !o); if (!open) load() }}
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
          right: 120,
          width: 360,
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
              <p style={{ margin: 0, fontSize: 14, fontWeight: 800, color: g.drop.text }}>Alerts</p>
              <p style={{ margin: '2px 0 0', fontSize: 11, color: g.drop.sub }}>
                {silent ? 'Silent mode on' : `${activeAlerts.length} active`}
              </p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <button
                type="button"
                onClick={toggleSilent}
                title={silent ? 'Turn sound/alerts on' : 'Silent — hide badge'}
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
                {silent ? 'Silent' : 'Sound on'}
              </button>
              <button
                type="button"
                onClick={() => { setOpen(false); setSnoozeFor(null) }}
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
            {loading && !alerts.length ? (
              <div style={{ padding: 28, textAlign: 'center', color: g.drop.sub }}>
                <Loader2 size={18} className="animate-spin" style={{ margin: '0 auto 8px' }} />
                <p style={{ margin: 0, fontSize: 12 }}>Checking alerts…</p>
              </div>
            ) : alerts.length === 0 ? (
              <div style={{ padding: 28, textAlign: 'center', color: g.drop.sub, fontSize: 13 }}>
                No alerts right now.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {alerts.map((a) => {
                  const snoozed = isAlertSnoozed(a.id, now)
                  const sev = SEVERITY[a.severity] || SEVERITY.info
                  const Icon = ALERT_ICON[a.id] || Bell
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
                        <div style={{
                          width: 34, height: 34, borderRadius: 9, flexShrink: 0,
                          background: snoozed ? g.drop.hov : '#fff',
                          border: `1px solid ${snoozed ? g.drop.border : sev.border}`,
                          display: 'grid', placeItems: 'center',
                        }}>
                          <Icon size={15} color={snoozed ? g.drop.sub : sev.icon} />
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
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
                      </div>

                      <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
                        <button
                          type="button"
                          onClick={() => { setOpen(false); navigate(a.href) }}
                          style={{
                            fontSize: 11, fontWeight: 700, padding: '5px 10px', borderRadius: 7,
                            border: 'none', cursor: 'pointer',
                            background: sev.icon, color: '#fff',
                          }}
                        >
                          Open
                        </button>
                        {snoozed ? (
                          <button
                            type="button"
                            onClick={() => handleClearSnooze(a.id)}
                            style={{
                              fontSize: 11, fontWeight: 600, padding: '5px 10px', borderRadius: 7,
                              border: `1px solid ${g.drop.border}`, background: 'transparent',
                              color: g.drop.text, cursor: 'pointer',
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
                              color: g.drop.text, cursor: 'pointer',
                              display: 'inline-flex', alignItems: 'center', gap: 4,
                            }}
                          >
                            <Clock size={11} /> Snooze
                          </button>
                        )}
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
      `}</style>
    </div>
  )
}
