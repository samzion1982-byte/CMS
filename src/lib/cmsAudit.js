import { supabase } from './supabase'

/**
 * Write a CMS audit trail entry. Never throws to callers — logging must not break saves.
 */
export async function logCmsAudit({
  action,
  module,
  entityType,
  entityId = null,
  entityLabel = null,
  summary = '',
  changes = null,
  actor = null,
}) {
  try {
    let actorId = actor?.id || null
    let actorEmail = actor?.email || null
    let actorName = actor?.full_name || actor?.name || null
    let actorRole = actor?.role || null

    if (!actorEmail) {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        actorId = actorId || user.id
        actorEmail = user.email || null
      }
      if (!actorName || !actorRole) {
        const { data: prof } = await supabase
          .from('profiles')
          .select('full_name, role, email')
          .eq('id', actorId || user?.id)
          .maybeSingle()
        if (prof) {
          actorName = actorName || prof.full_name
          actorRole = actorRole || prof.role
          actorEmail = actorEmail || prof.email
        }
      }
    }

    const { error } = await supabase.from('cms_audit_log').insert({
      action,
      module,
      entity_type: entityType,
      entity_id: entityId != null ? String(entityId) : null,
      entity_label: entityLabel,
      summary: summary || `${action} ${entityType}`,
      changes: changes && (Array.isArray(changes) ? changes : changes),
      actor_id: actorId,
      actor_email: actorEmail,
      actor_name: actorName,
      actor_role: actorRole,
    })
    if (error) console.error('cms_audit_log insert failed:', error)
  } catch (e) {
    console.error('logCmsAudit error:', e)
  }
}

/** Build [{ field, from, to }] for keys that changed between two plain objects. */
export function diffFields(before = {}, after = {}, keys = null) {
  const list = keys || [...new Set([...Object.keys(before || {}), ...Object.keys(after || {})])]
  const out = []
  for (const field of list) {
    const from = before?.[field] ?? null
    const to = after?.[field] ?? null
    const a = from == null || from === '' ? null : String(from)
    const b = to == null || to === '' ? null : String(to)
    if (a === b) continue
    out.push({ field, from: a, to: b })
  }
  return out
}

export async function getCmsAuditLogs({
  limit = 50,
  offset = 0,
  module = '',
  actor = '',
  action = '',
  q = '',
} = {}) {
  let query = supabase
    .from('cms_audit_log')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (module && module !== 'all') query = query.eq('module', module)
  if (action && action !== 'all') query = query.eq('action', action)
  if (actor) {
    query = query.or(`actor_email.ilike.%${actor}%,actor_name.ilike.%${actor}%`)
  }
  if (q) {
    const term = q.replace(/%/g, '')
    query = query.or(
      `summary.ilike.%${term}%,entity_label.ilike.%${term}%,entity_id.ilike.%${term}%,actor_name.ilike.%${term}%,actor_email.ilike.%${term}%,module.ilike.%${term}%`
    )
  }

  const { data, error, count } = await query
  if (error) throw error
  return { data: data || [], count: count || 0 }
}

export const AUDIT_MODULES = [
  { value: '', label: 'All modules' },
  { value: 'users', label: 'Users' },
  { value: 'church_setup', label: 'Church Setup' },
  { value: 'cms_permissions', label: 'CMS Permissions' },
  { value: 'members', label: 'Members' },
  { value: 'events', label: 'Events' },
  { value: 'assets', label: 'Asset Management' },
  { value: 'finance', label: 'Finance' },
]

export const AUDIT_ACTIONS = [
  { value: '', label: 'All actions' },
  { value: 'created', label: 'Created' },
  { value: 'updated', label: 'Updated' },
  { value: 'deleted', label: 'Deleted' },
  { value: 'deactivated', label: 'Deactivated' },
  { value: 'activated', label: 'Activated' },
  { value: 'restored', label: 'Restored' },
  { value: 'reset_password', label: 'Reset password' },
  { value: 'saved', label: 'Saved' },
  { value: 'posted', label: 'Posted' },
  { value: 'moved', label: 'Moved' },
  { value: 'transferred', label: 'Transferred' },
]
