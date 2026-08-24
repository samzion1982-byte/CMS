import { supabase } from './supabase'
import { displayFirstName } from './auth'
import { daysUntilDate, normalizeAlertDays } from './churchDocumentsLib'

export const USER_ALERT_SCOPES = [
  { id: 'self', label: 'For me only' },
  { id: 'selected', label: 'For selected' },
]

export function isUserAlertDue(row, today = new Date()) {
  const days = normalizeAlertDays(row?.alert_days_before) ?? 10
  const left = daysUntilDate(row?.due_date, today)
  return left != null && left <= days
}

function recipientIdsFromRow(row) {
  return (row?.user_alert_recipients || []).map((r) => r.user_id).filter(Boolean)
}

export async function listEnrolledUsersForAlerts() {
  const { data, error } = await supabase.rpc('list_enrolled_users_for_alerts')
  if (error) throw error
  return (data || []).map((row) => ({
    id: row.id,
    label: displayFirstName(row, row.email),
  }))
}

export async function listUserAlerts() {
  const { data, error } = await supabase
    .from('user_alerts')
    .select('id, title, due_date, alert_days_before, scope, created_by, created_at, user_alert_recipients(user_id)')
    .order('due_date', { ascending: true })
  if (error) throw error
  return (data || []).map((row) => ({
    ...row,
    recipientIds: recipientIdsFromRow(row),
  }))
}

function normalizeScopeAndRecipients({ scope, allUsers, recipientIds }) {
  if (scope === 'selected') {
    if (allUsers) return { scope: 'all', recipientIds: [] }
    const ids = [...new Set((recipientIds || []).filter(Boolean))]
    if (!ids.length) throw new Error('Select All or at least one user.')
    return { scope: 'selected', recipientIds: ids }
  }
  return { scope: 'self', recipientIds: [] }
}

async function replaceRecipients(alertId, recipientIds) {
  const { error: delError } = await supabase
    .from('user_alert_recipients')
    .delete()
    .eq('alert_id', alertId)
  if (delError) throw delError
  if (!recipientIds.length) return
  const { error: insError } = await supabase
    .from('user_alert_recipients')
    .insert(recipientIds.map((user_id) => ({ alert_id: alertId, user_id })))
  if (insError) throw insError
}

export async function createUserAlert({ title, due_date, alert_days_before, scope, allUsers, recipientIds }) {
  const trimmed = String(title || '').trim()
  if (!trimmed) throw new Error('Enter a title.')
  if (!due_date) throw new Error('Choose a due date.')
  const days = normalizeAlertDays(alert_days_before)
  if (!days) throw new Error('Alert before must be between 1 and 365 days.')
  const next = normalizeScopeAndRecipients({ scope, allUsers, recipientIds })

  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.id) throw new Error('You need to be signed in.')

  const { data, error } = await supabase
    .from('user_alerts')
    .insert({
      title: trimmed,
      due_date,
      alert_days_before: days,
      scope: next.scope,
      created_by: user.id,
    })
    .select()
    .single()
  if (error) throw error
  if (next.scope === 'selected') await replaceRecipients(data.id, next.recipientIds)
  return data
}

export async function updateUserAlert(id, { title, due_date, alert_days_before, scope, allUsers, recipientIds }) {
  if (!id) throw new Error('Missing alert.')
  const trimmed = String(title || '').trim()
  if (!trimmed) throw new Error('Enter a title.')
  if (!due_date) throw new Error('Choose a due date.')
  const days = normalizeAlertDays(alert_days_before)
  if (!days) throw new Error('Alert before must be between 1 and 365 days.')
  const next = normalizeScopeAndRecipients({ scope, allUsers, recipientIds })

  const { data, error } = await supabase
    .from('user_alerts')
    .update({
      title: trimmed,
      due_date,
      alert_days_before: days,
      scope: next.scope,
    })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  await replaceRecipients(id, next.recipientIds)
  return data
}

export async function deleteUserAlert(id) {
  if (!id) return
  const { error } = await supabase.from('user_alerts').delete().eq('id', id)
  if (error) throw error
}
