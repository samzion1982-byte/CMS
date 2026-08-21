import { supabase } from './supabase'
import { daysUntilDate, normalizeAlertDays } from './churchDocumentsLib'

export const USER_ALERT_SCOPES = [
  { id: 'self', label: 'For me only' },
  { id: 'all', label: 'For all' },
]

export function isUserAlertDue(row, today = new Date()) {
  const days = normalizeAlertDays(row?.alert_days_before) ?? 10
  const left = daysUntilDate(row?.due_date, today)
  return left != null && left <= days
}

export async function listUserAlerts() {
  const { data, error } = await supabase
    .from('user_alerts')
    .select('id, title, due_date, alert_days_before, scope, created_by, created_at')
    .order('due_date', { ascending: true })
  if (error) throw error
  return data || []
}

export async function createUserAlert({ title, due_date, alert_days_before, scope }) {
  const trimmed = String(title || '').trim()
  if (!trimmed) throw new Error('Enter a title.')
  if (!due_date) throw new Error('Choose a due date.')
  const days = normalizeAlertDays(alert_days_before)
  if (!days) throw new Error('Alert before must be between 1 and 365 days.')
  const nextScope = scope === 'all' ? 'all' : 'self'

  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.id) throw new Error('You need to be signed in.')

  const { data, error } = await supabase
    .from('user_alerts')
    .insert({
      title: trimmed,
      due_date,
      alert_days_before: days,
      scope: nextScope,
      created_by: user.id,
    })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateUserAlert(id, { title, due_date, alert_days_before, scope }) {
  if (!id) throw new Error('Missing alert.')
  const trimmed = String(title || '').trim()
  if (!trimmed) throw new Error('Enter a title.')
  if (!due_date) throw new Error('Choose a due date.')
  const days = normalizeAlertDays(alert_days_before)
  if (!days) throw new Error('Alert before must be between 1 and 365 days.')
  const nextScope = scope === 'all' ? 'all' : 'self'

  const { data, error } = await supabase
    .from('user_alerts')
    .update({
      title: trimmed,
      due_date,
      alert_days_before: days,
      scope: nextScope,
    })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteUserAlert(id) {
  if (!id) return
  const { error } = await supabase.from('user_alerts').delete().eq('id', id)
  if (error) throw error
}
