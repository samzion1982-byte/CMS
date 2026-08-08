/**
 * CMS page catalog — used by CMS Permissions UI, Sidebar filtering, and route guards.
 * `match` is a path prefix (exact or startsWith match + '/').
 */

export const CMS_CONFIG_ROLES = [
  { value: 'admin1', label: 'Admin1' },
  { value: 'admin',  label: 'Admin'  },
  { value: 'user',   label: 'User'   },
  { value: 'demo',   label: 'Demo'   },
]

/** Pages Super Admin can grant to other roles. */
export const CMS_PAGES = [
  // MAIN
  { key: 'dashboard',       label: 'Dashboard',         group: 'MAIN',    match: '/dashboard',       alwaysOn: true },
  { key: 'members',         label: 'Members',           group: 'MAIN',    match: '/members' },
  { key: 'announcements',   label: 'Announcements',     group: 'MAIN',    match: '/announcements',   exclude: ['/announcements-log'] },
  { key: 'events',          label: 'Events',            group: 'MAIN',    match: '/events' },
  { key: 'assets',          label: 'Asset Management',  group: 'MAIN',    match: '/assets' },

  // FINANCE
  { key: 'declaration',       label: 'Declaration',       group: 'FINANCE', match: '/declaration',       adminDefault: true },
  { key: 'receipts',          label: 'Receipt Entry',     group: 'FINANCE', match: '/receipts',          adminDefault: true },
  { key: 'payment-schedule',  label: 'Payment Schedule',  group: 'FINANCE', match: '/payment-schedule',  adminDefault: true },
  { key: 'accounting',        label: 'Accounts',          group: 'FINANCE', match: '/accounting',        adminDefault: true },
  { key: 'simple-accounts',   label: 'Simple Accounts',   group: 'FINANCE', match: '/simple-accounts',   adminDefault: true },
  { key: 'report-member',     label: 'Member Report',     group: 'FINANCE', match: '/reports/member',    adminDefault: true },
  { key: 'member-statement',  label: 'Member Statement',  group: 'FINANCE', match: '/member-statement',  adminDefault: true },
  { key: 'report-receipts',   label: 'Receipt Report',    group: 'FINANCE', match: '/reports',           adminDefault: true, exact: true },
  { key: 'report-auction',    label: 'Auction Report',    group: 'FINANCE', match: '/reports/auction',   adminDefault: true },
  { key: 'report-transfers',  label: 'Transfer Report',   group: 'FINANCE', match: '/reports/transfers', adminDefault: true },

  // ADMIN (grantable — Church Setup historically available to Admin1)
  { key: 'church-setup',      label: 'Church Setup',      group: 'ADMIN',   match: '/church-setup',      admin1Default: true },

  // LOGS
  { key: 'announcements-log',    label: 'Announcements Log',  group: 'LOGS', match: '/announcements-log',    adminDefault: true },
  { key: 'whatsapp-receipt-log', label: 'WhatsApp Receipts',  group: 'LOGS', match: '/whatsapp-receipt-log', adminDefault: true },
  { key: 'payment-request-log',  label: 'Payment Req. Log',   group: 'LOGS', match: '/payment-request-log',  adminDefault: true },
  { key: 'login-logs',           label: 'Login Details',      group: 'LOGS', match: '/login-logs',           adminDefault: true },
]

/** Super Admin–only tools — never grantable via CMS Permissions. */
export const CMS_SUPER_ONLY_MATCHES = [
  '/users',
  '/cms-permissions',
  '/import',
]

export function pathMatchesPage(pathname, page) {
  if (!pathname || !page?.match) return false
  if (page.exclude?.some(ex => pathname === ex || pathname.startsWith(ex + '/'))) return false
  if (page.exact) return pathname === page.match
  return pathname === page.match || pathname.startsWith(page.match + '/')
}

export function findPageForPath(pathname) {
  // Prefer longest / most specific match
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
  // MAIN (non-alwaysOn): all roles
  if (page.group === 'MAIN') return true
  return false
}

export function buildDefaultGrants(role) {
  const grants = {}
  for (const page of CMS_PAGES) {
    grants[page.key] = defaultPageAllowed(role, page)
  }
  return grants
}

export function groupedPages() {
  const order = ['MAIN', 'FINANCE', 'ADMIN', 'LOGS']
  return order.map(group => ({
    group,
    pages: CMS_PAGES.filter(p => p.group === group),
  })).filter(g => g.pages.length)
}
