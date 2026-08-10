/**
 * Header alert preferences — silent + per-alert snooze (localStorage).
 */

const SILENT_KEY = 'cms_notif_silent'
const SNOOZE_KEY = 'cms_notif_snooze'

export const ALERT_IDS = {
  payment: 'payment',
  license: 'license',
  backup: 'backup',
}

export const SNOOZE_OPTIONS = [
  { id: '1h', label: '1 hour', ms: 60 * 60 * 1000 },
  { id: '4h', label: '4 hours', ms: 4 * 60 * 60 * 1000 },
  { id: 'tomorrow', label: 'Until tomorrow', ms: null }, // computed
  { id: '1d', label: '1 day', ms: 24 * 60 * 60 * 1000 },
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
  window.dispatchEvent(new CustomEvent('cms-notif-prefs-changed'))
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
  if (!opt) return
  let until
  if (optionId === 'tomorrow') {
    const d = new Date()
    d.setHours(24, 0, 0, 0)
    until = d.getTime()
  } else {
    until = Date.now() + (opt.ms || 0)
  }
  const next = { ...getSnoozeMap(), [alertId]: until }
  try {
    localStorage.setItem(SNOOZE_KEY, JSON.stringify(next))
  } catch { /* ignore */ }
  window.dispatchEvent(new CustomEvent('cms-notif-prefs-changed'))
}

export function clearAlertSnooze(alertId) {
  const next = { ...getSnoozeMap() }
  delete next[alertId]
  try {
    localStorage.setItem(SNOOZE_KEY, JSON.stringify(next))
  } catch { /* ignore */ }
  window.dispatchEvent(new CustomEvent('cms-notif-prefs-changed'))
}

export function formatSnoozeUntil(until) {
  if (!until) return ''
  const d = new Date(until)
  return d.toLocaleString('en-IN', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true,
  })
}
