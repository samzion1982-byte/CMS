/**
 * CMS page catalog — mirrors Sidebar categories & nested items.
 * Grants are stored per leaf page key; category/folder checkboxes are aggregates.
 */

export const CMS_CONFIG_ROLES = [
  { value: 'admin1', label: 'Admin'  },
  { value: 'admin',  label: 'User1'  },
  { value: 'user',   label: 'User2'  },
  { value: 'demo',   label: 'User3'  },
  { value: 'user4',  label: 'User4'  },
]

/**
 * Permission tree (Categories → items / folders → sub-items).
 * `kind: 'category' | 'folder' | 'page'`
 * Only `page` nodes are stored in cms_role_page_access.
 */
export const CMS_PERMISSION_TREE = [
  {
    key: 'cat-main',
    label: 'MAIN',
    kind: 'category',
    children: [
      { key: 'dashboard',     label: 'Dashboard',         kind: 'page', match: '/dashboard', alwaysOn: true },
      { key: 'members',       label: 'Members',           kind: 'page', match: '/members' },
      { key: 'announcements', label: 'Announcements',     kind: 'page', match: '/announcements', exclude: ['/announcements-log'] },
      {
        key: 'folder-events',
        label: 'Events',
        kind: 'folder',
        children: [
          { key: 'events-planner',  label: 'Event Planner',  kind: 'page', match: '/events/planner' },
          { key: 'events-recorder', label: 'Event Recorder', kind: 'page', match: '/events/recorder' },
          { key: 'events-settings', label: 'Event Settings', kind: 'page', match: '/events/settings' },
        ],
      },
      {
        key: 'folder-assets',
        label: 'Asset Management',
        kind: 'folder',
        children: [
          // Tabs share /assets — access is enforced by assetTab grants, not path alone
          { key: 'assets-movable',   label: 'Movable Assets', kind: 'page', assetTab: 'movable' },
          { key: 'assets-fixed',     label: 'Fixed Assets',   kind: 'page', assetTab: 'building', adminDefault: true, sensitive: true },
          { key: 'assets-documents', label: 'Documents',      kind: 'page', assetTab: 'document', adminDefault: true, sensitive: true },
        ],
      },
    ],
  },
  {
    key: 'cat-finance',
    label: 'FINANCE',
    kind: 'category',
    children: [
      { key: 'declaration',      label: 'Declaration',      kind: 'page', match: '/declaration',      adminDefault: true },
      { key: 'receipts',         label: 'Receipt Entry',    kind: 'page', match: '/receipts',         adminDefault: true },
      { key: 'payment-schedule', label: 'Payment Schedule', kind: 'page', match: '/payment-schedule', adminDefault: true },
      { key: 'accounting',       label: 'Accounts',         kind: 'page', match: '/accounting',       adminDefault: true },
      { key: 'simple-accounts',  label: 'Simple Accounts',  kind: 'page', match: '/simple-accounts',  adminDefault: true },
      {
        key: 'folder-reports',
        label: 'Reports',
        kind: 'folder',
        children: [
          { key: 'report-member',    label: 'Member Report',    kind: 'page', match: '/reports/member',    adminDefault: true },
          { key: 'member-statement', label: 'Member Statement', kind: 'page', match: '/member-statement',  adminDefault: true },
          { key: 'report-receipts',  label: 'Receipt Report',   kind: 'page', match: '/reports',           adminDefault: true, exact: true },
          { key: 'report-auction',   label: 'Auction Report',   kind: 'page', match: '/reports/auction',   adminDefault: true },
          { key: 'report-transfers', label: 'Transfer Report',  kind: 'page', match: '/reports/transfers', adminDefault: true },
        ],
      },
    ],
  },
  {
    key: 'cat-admin',
    label: 'ADMIN',
    kind: 'category',
    children: [
      { key: 'church-setup', label: 'Church Setup', kind: 'page', match: '/church-setup', admin1Default: true },
    ],
  },
  {
    key: 'cat-logs',
    label: 'LOGS',
    kind: 'category',
    children: [
      { key: 'announcements-log',    label: 'Announcements Log', kind: 'page', match: '/announcements-log',    adminDefault: true },
      { key: 'whatsapp-receipt-log', label: 'WhatsApp Receipts', kind: 'page', match: '/whatsapp-receipt-log', adminDefault: true },
      { key: 'payment-request-log',  label: 'Payment Req. Log',  kind: 'page', match: '/payment-request-log',  adminDefault: true },
      { key: 'login-logs',           label: 'Login Details',     kind: 'page', match: '/login-logs',           adminDefault: true },
    ],
  },
]

/** Flat leaf pages (what gets saved / checked on routes). */
export const CMS_PAGES = flattenPages(CMS_PERMISSION_TREE)

/** Super Admin–only tools — never grantable via CMS Permissions. */
export const CMS_SUPER_ONLY_MATCHES = [
  '/users',
  '/cms-permissions',
  '/import',
]

function flattenPages(nodes, groupLabel = null) {
  const out = []
  for (const node of nodes) {
    if (node.kind === 'category') {
      out.push(...flattenPages(node.children || [], node.label))
    } else if (node.kind === 'folder') {
      out.push(...flattenPages(node.children || [], groupLabel))
    } else if (node.kind === 'page') {
      out.push({ ...node, group: groupLabel || node.group || '' })
    }
  }
  return out
}

/** All leaf page keys under a category or folder node. */
export function leafKeysUnder(node) {
  if (!node) return []
  if (node.kind === 'page') return [node.key]
  const keys = []
  for (const child of node.children || []) {
    keys.push(...leafKeysUnder(child))
  }
  return keys
}

export function pathMatchesPage(pathname, page) {
  if (!pathname || !page?.match) return false
  if (page.exclude?.some(ex => pathname === ex || pathname.startsWith(ex + '/'))) return false
  if (page.exact) return pathname === page.match
  return pathname === page.match || pathname.startsWith(page.match + '/')
}

export function findPageForPath(pathname) {
  const hits = CMS_PAGES.filter(p => pathMatchesPage(pathname, p))
  if (!hits.length) return null
  hits.sort((a, b) => b.match.length - a.match.length)
  return hits[0]
}

/** Legacy defaults before Super Admin customizes a role. */
export function defaultPageAllowed(role, page) {
  if (role === 'super_admin') return true
  if (page.alwaysOn) return true
  if (page.admin1Default) return role === 'admin1'
  if (page.adminDefault) return role === 'admin1' || role === 'admin'
  if (page.group === 'MAIN') return ['admin1', 'admin', 'user', 'demo', 'user4'].includes(role)
  return false
}

export function buildDefaultGrants(role) {
  const grants = {}
  for (const page of CMS_PAGES) {
    grants[page.key] = defaultPageAllowed(role, page)
  }
  return grants
}

/** @deprecated use CMS_PERMISSION_TREE — kept for any callers */
export function groupedPages() {
  return CMS_PERMISSION_TREE.map(cat => ({
    group: cat.label,
    pages: leafKeysUnder(cat).map(k => CMS_PAGES.find(p => p.key === k)).filter(Boolean),
  }))
}

/**
 * Aggregate checkbox state for a category/folder given a role's grant map.
 * @returns {'all'|'some'|'none'}
 */
export function aggregateState(node, grants) {
  const keys = leafKeysUnder(node).filter(k => {
    const page = CMS_PAGES.find(p => p.key === k)
    return page && !page.alwaysOn
  })
  if (!keys.length) return 'all'
  const on = keys.filter(k => !!grants?.[k]).length
  if (on === 0) return 'none'
  if (on === keys.length) return 'all'
  return 'some'
}
