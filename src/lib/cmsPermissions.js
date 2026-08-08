import {
  CMS_PAGES, CMS_CONFIG_ROLES, CMS_SUPER_ONLY_MATCHES,
  buildDefaultGrants, findPageForPath, defaultPageAllowed,
} from './cmsPages'

/** Older flat keys → new leaf keys. */
const LEGACY_PAGE_KEYS = {
  events: ['events-planner', 'events-recorder', 'events-settings'],
  assets: ['assets-movable', 'assets-fixed', 'assets-documents'],
}

const ASSET_TAB_KEYS = {
  movable:  'assets-movable',
  building: 'assets-fixed',
  document: 'assets-documents',
}

const ASSET_PATH_KEYS = ['assets-movable', 'assets-fixed', 'assets-documents']

function applyGrantRows(target, rowsByKey) {
  for (const [key, allowed] of Object.entries(rowsByKey)) {
    if (Object.prototype.hasOwnProperty.call(target, key)) {
      target[key] = !!allowed
      continue
    }
    const mapped = LEGACY_PAGE_KEYS[key]
    if (mapped) {
      for (const k of mapped) {
        if (Object.prototype.hasOwnProperty.call(target, k)) target[k] = !!allowed
      }
    }
  }
  for (const page of CMS_PAGES) {
    if (page.alwaysOn) target[page.key] = true
  }
  return target
}

/**
 * Load stored grants for all configurable roles.
 * Returns { admin1: { pageKey: bool, _custom }, ... }
 */
export async function loadAllRolePageGrants(client) {
  const { data, error } = await client
    .from('cms_role_page_access')
    .select('role, page_key, allowed')

  if (error) throw error

  const rowsByRole = {}
  for (const row of data || []) {
    if (!rowsByRole[row.role]) rowsByRole[row.role] = {}
    rowsByRole[row.role][row.page_key] = !!row.allowed
  }

  const result = {}
  for (const r of CMS_CONFIG_ROLES) {
    if (!rowsByRole[r.value]) {
      result[r.value] = { ...buildDefaultGrants(r.value), _custom: false }
    } else {
      const grants = {}
      for (const page of CMS_PAGES) {
        grants[page.key] = page.alwaysOn ? true : false
      }
      applyGrantRows(grants, rowsByRole[r.value])
      result[r.value] = { ...grants, _custom: true }
    }
  }
  return result
}

/** Grants map for one role (pageKey → boolean). */
export async function loadRolePageGrants(client, role) {
  if (!role || role === 'super_admin') {
    const all = {}
    for (const p of CMS_PAGES) all[p.key] = true
    return all
  }

  const { data, error } = await client
    .from('cms_role_page_access')
    .select('page_key, allowed')
    .eq('role', role)

  if (error) throw error

  if (!data?.length) return buildDefaultGrants(role)

  const grants = {}
  for (const page of CMS_PAGES) {
    grants[page.key] = page.alwaysOn ? true : false
  }
  const rowsByKey = {}
  for (const row of data) rowsByKey[row.page_key] = row.allowed
  applyGrantRows(grants, rowsByKey)
  return grants
}

/**
 * Replace all grants for configurable roles.
 * matrix: { admin1: { dashboard: true, ... }, ... }
 */
export async function saveRolePageGrants(client, matrix) {
  const roles = CMS_CONFIG_ROLES.map(r => r.value)
  const rows = []
  for (const role of roles) {
    const grants = matrix[role] || {}
    for (const page of CMS_PAGES) {
      rows.push({
        role,
        page_key: page.key,
        allowed: page.alwaysOn ? true : !!grants[page.key],
        updated_at: new Date().toISOString(),
      })
    }
  }

  const { error: delErr } = await client
    .from('cms_role_page_access')
    .delete()
    .in('role', roles)
  if (delErr) throw delErr

  const { error } = await client
    .from('cms_role_page_access')
    .upsert(rows, { onConflict: 'role,page_key' })
  if (error) throw error
}

export function isSuperOnlyPath(pathname) {
  return CMS_SUPER_ONLY_MATCHES.some(
    p => pathname === p || pathname.startsWith(p + '/')
  )
}

function pageAllowedByKey(pageKey, role, grants) {
  const page = CMS_PAGES.find(p => p.key === pageKey)
  if (!page) return false
  if (page.alwaysOn) return true
  if (grants && Object.prototype.hasOwnProperty.call(grants, pageKey)) {
    return !!grants[pageKey]
  }
  return defaultPageAllowed(role, page)
}

/** Asset Management tabs: movable | building | document */
export function canAccessAssetTab(tabId, role, grants = null) {
  if (role === 'super_admin') return true
  const key = ASSET_TAB_KEYS[tabId]
  if (!key) return false
  return pageAllowedByKey(key, role, grants)
}

export function canAccessAnyAssetTab(role, grants = null) {
  if (role === 'super_admin') return true
  return ASSET_PATH_KEYS.some(k => pageAllowedByKey(k, role, grants))
}

export function canAccessPath(pathname, role, grants = null) {
  if (!pathname) return false
  if (role === 'super_admin') return true
  if (isSuperOnlyPath(pathname)) return false

  // Asset Management hub + settings — allowed if any asset tab is granted
  if (pathname === '/assets' || pathname.startsWith('/assets/')) {
    return canAccessAnyAssetTab(role, grants)
  }

  const page = findPageForPath(pathname)
  if (!page) {
    if (pathname.startsWith('/members')) {
      return grants ? !!grants.members : ['admin1', 'admin', 'user', 'demo', 'user4'].includes(role)
    }
    return false
  }

  return pageAllowedByKey(page.key, role, grants)
}

export function canAccessNavItem(item, role, grants) {
  if (role === 'super_admin') return true
  if (item.superOnly) return false
  if (item.children?.length) {
    return item.children.some(c => canAccessPath(c.path, role, grants))
  }
  if (!item.path) return false
  return canAccessPath(item.path, role, grants)
}
