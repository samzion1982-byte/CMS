/**
 * Header alert preferences — silent, per-alert snooze, enabled alert types (localStorage).
 */

const SILENT_KEY = 'cms_notif_silent'
const SNOOZE_KEY = 'cms_notif_snooze'
const ENABLED_KEY = 'cms_notif_enabled_types'

export const ALERT_IDS = {
  payment: 'payment',
  license: 'license',
  backup: 'backup',
  documents: 'documents',
}

/** Toggle rows in the Alerts settings panel. License is always on. */
export const ALERT_TYPE_OPTIONS = [
  {
    id: ALERT_IDS.payment,
    label: 'Payment confirmations',
    description: 'Payments awaiting confirmation in Receipts',
    locked: false,
  },
  {
    id: ALERT_IDS.license,
    label: 'License validity',
    description: 'Licence expiry and inactive status — always on',
    locked: true,
  },
  {
    id: ALERT_IDS.backup,
    label: 'Backup failures',
    description: 'Failed or partial full backups',
    locked: false,
  },
  {
    id: ALERT_IDS.documents,
    label: 'Documents - Renewal',
    description: 'Subscription and warranty alerts from Documents',
    locked: false,
  },
]

export const SNOOZE_OPTIONS = [
  { id: '1d', label: '1 day', ms: 24 * 60 * 60 * 1000 },
  { id: '2d', label: '2 days', ms: 2 * 24 * 60 * 60 * 1000 },
  { id: '3d', label: '3 days', ms: 3 * 24 * 60 * 60 * 1000 },
  { id: '1w', label: '1 week', ms: 7 * 24 * 60 * 60 * 1000 },
]

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return fallback
    return JSON.parse(raw)
  } catch {
    return fallback
  }
}

function emitPrefsChanged() {
  window.dispatchEvent(new CustomEvent('cms-notif-prefs-changed'))
}

export function isNotificationsSilent() {
  try {
    return localStorage.getItem(SILENT_KEY) === '1'
  } catch {
    return false
  }
}

export function setNotificationsSilent(on) {
  try {
    localStorage.setItem(SILENT_KEY, on ? '1' : '0')
  } catch { /* ignore */ }
  emitPrefsChanged()
}

export function getEnabledAlertTypes() {
  const defaults = {
    [ALERT_IDS.payment]: true,
    [ALERT_IDS.license]: true,
    [ALERT_IDS.backup]: true,
    [ALERT_IDS.documents]: true,
  }
  const stored = readJson(ENABLED_KEY, {})
  const merged = {
    ...defaults,
    ...(stored && typeof stored === 'object' ? stored : {}),
  }
  // Licence validity can never be turned off
  merged[ALERT_IDS.license] = true
  return merged
}

export function isAlertTypeEnabled(alertId) {
  if (alertId === ALERT_IDS.license) return true
  return getEnabledAlertTypes()[alertId] !== false
}

export function setAlertTypeEnabled(alertId, enabled) {
  if (alertId === ALERT_IDS.license) return
  const next = {
    ...getEnabledAlertTypes(),
    [alertId]: !!enabled,
    [ALERT_IDS.license]: true,
  }
  try {
    localStorage.setItem(ENABLED_KEY, JSON.stringify(next))
  } catch { /* ignore */ }
  emitPrefsChanged()
}

export function getSnoozeMap() {
  const map = readJson(SNOOZE_KEY, {})
  return map && typeof map === 'object' ? map : {}
}

export function isAlertSnoozed(alertId, now = Date.now()) {
  const until = getSnoozeMap()[alertId]
  return typeof until === 'number' && until > now
}

export function snoozeAlert(alertId, optionId) {
  const opt = SNOOZE_OPTIONS.find((o) => o.id === optionId)
  if (!opt || !opt.ms) return
  const until = Date.now() + opt.ms
  const next = { ...getSnoozeMap(), [alertId]: until }
  try {
    localStorage.setItem(SNOOZE_KEY, JSON.stringify(next))
  } catch { /* ignore */ }
  emitPrefsChanged()
}

export function clearAlertSnooze(alertId) {
  const next = { ...getSnoozeMap() }
  delete next[alertId]
  try {
    localStorage.setItem(SNOOZE_KEY, JSON.stringify(next))
  } catch { /* ignore */ }
  emitPrefsChanged()
}

export function formatSnoozeUntil(until) {
  if (!until) return ''
  const d = new Date(until)
  return d.toLocaleString('en-IN', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true,
  })
}
