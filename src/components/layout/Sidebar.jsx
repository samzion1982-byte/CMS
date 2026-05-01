import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../../lib/AuthContext'
import { Menu, ChevronLeft,
  LayoutDashboard, Users, FileText, Receipt,
  BarChart3, Megaphone, Church, UserCog, Upload, ClipboardList, LogIn,
  BookOpen,
} from 'lucide-react'
import { HEADER_H } from './Header'

const NAV = [
  { group: 'MAIN', items: [
    { label: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },
    { label: 'Members',   path: '/members',   icon: Users },
  ]},
  { group: 'FINANCE', items: [
    { label: 'Declaration',      path: '/declaration',      icon: FileText  },
    { label: 'Receipt Entry',    path: '/receipts',         icon: Receipt   },
    { label: 'Member Statement', path: '/member-statement', icon: BookOpen  },
    { label: 'Reports',          path: '/reports',          icon: BarChart3 },
  ]},
  { group: 'MODULES', items: [
    { label: 'Announcements', path: '/announcements', icon: Megaphone },
  ]},
  { group: 'ADMIN', adminOnly: true, items: [
    { label: 'Church Setup',      path: '/church-setup',    icon: Church,         superOnly: true },
    { label: 'Users',             path: '/users',           icon: UserCog,        superOnly: true },
    { label: 'Import Data',       path: '/import',          icon: Upload,         superOnly: true },
  ]},
  { group: 'LOGS', adminOnly: true, items: [
    { label: 'Announcements Log', path: '/announcements-log', icon: ClipboardList },
    { label: 'Login Details',     path: '/login-logs',        icon: LogIn },
  ]},
]

export default function Sidebar({ collapsed, sidebarW, onToggle }) {
  const { profile } = useAuth()
  const navigate    = useNavigate()
  const location    = useLocation()
  const isSuperAdmin = profile?.role === 'super_admin'
  const isAdmin      = ['super_admin', 'admin', 'admin1'].includes(profile?.role)

  return (
    <aside style={{
      width: sidebarW,
      minWidth: sidebarW,
      background: `linear-gradient(180deg, var(--sidebar-bg) 0%, var(--sidebar-bg-end) 100%)`,
      borderRight: '1px solid var(--sidebar-border)',
      display: 'flex',
      flexDirection: 'column',
      height: `calc(100vh / 0.95 - ${HEADER_H}px)`,
      position: 'fixed',
      left: 0, top: HEADER_H,
      zIndex: 300,
      transition: 'width 0.25s ease, min-width 0.25s ease',
      overflow: 'hidden',
    }}>

      <nav style={{
        flex: 1,
        overflowY: 'auto',
        overflowX: 'hidden',
        padding: collapsed ? '14px 8px' : '18px 10px',
        scrollbarWidth: 'thin',
        scrollbarColor: 'rgba(255,255,255,0.08) transparent',
      }}>

        {/* Collapsed: toggle at top */}
        {collapsed && (
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
            <CollapseBtn collapsed={collapsed} onToggle={onToggle} />
          </div>
        )}

        {NAV.map(group => {
          if (group.superOnly && !isSuperAdmin) return null
          if (group.adminOnly  && !isAdmin)     return null
          const isMain = group.group === 'MAIN'
          return (
            <div key={group.group} style={{ marginBottom: 26 }}>
              {!collapsed && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 6px', marginBottom: 6 }}>
                  <span style={{
                    fontSize: 9, fontWeight: 800, letterSpacing: '0.14em',
                    textTransform: 'uppercase', color: 'var(--sidebar-group)',
                    fontFamily: 'var(--font-ui)',
                  }}>
                    {group.group}
                  </span>
                  {isMain && <CollapseBtn collapsed={collapsed} onToggle={onToggle} />}
                </div>
              )}

              {group.items.map(item => {
                if (item.superOnly && !isSuperAdmin) return null
                const isActive = location.pathname === item.path
                return (
                  <NavItem
                    key={item.label}
                    item={item}
                    isActive={isActive}
                    collapsed={collapsed}
                    onClick={() => !item.soon && navigate(item.path)}
                  />
                )
              })}
            </div>
          )
        })}
      </nav>
    </aside>
  )
}

/* ── Collapse button ─────────────────────────────────────────── */
function CollapseBtn({ collapsed, onToggle }) {
  const [hov, setHov] = useState(false)
  return (
    <button
      onClick={onToggle}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      style={{
        width: 26, height: 26,
        borderRadius: 7,
        border: '1px solid var(--sidebar-item-active-border)',
        background: hov ? 'var(--sidebar-item-active-bg)' : 'transparent',
        color: 'var(--sidebar-item-active-border)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: 'pointer', outline: 'none',
        transition: 'all 0.18s',
        transform: hov ? 'scale(1.1) translateY(-2px)' : 'scale(1) translateY(0)',
        boxShadow: hov 
          ? '0 2px 4px rgba(0,0,0,0.1), 0 6px 12px rgba(0,0,0,0.15), inset 0 1px 0 rgba(255,255,255,0.1)' 
          : '0 1px 2px rgba(0,0,0,0.05), inset 0 1px 0 rgba(255,255,255,0.05)',
        flexShrink: 0,
      }}
    >
      {collapsed ? <Menu size={12} /> : <ChevronLeft size={12} />}
    </button>
  )
}

/* ── Nav item ─────────────────────────────────────────────────── */
function NavItem({ item, isActive, collapsed, onClick }) {
  const [hov, setHov] = useState(false)
  const Icon = item.icon

  return (
    <button
      onClick={onClick}
      title={collapsed ? item.label : undefined}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: collapsed ? 0 : 10,
        justifyContent: collapsed ? 'center' : 'flex-start',
        width: '100%',
        padding: collapsed ? '11px 0' : '10px 10px',
        borderRadius: 8,
        border: 'none',
        borderLeft: !collapsed && isActive
          ? '3px solid var(--sidebar-item-active-border)'
          : '3px solid transparent',
        marginBottom: 3,
        cursor: item.soon ? 'default' : 'pointer',
        background: isActive
          ? 'var(--sidebar-item-active-bg)'
          : hov && !item.soon ? 'var(--sidebar-item-hover)' : 'transparent',
        color: isActive
          ? 'var(--sidebar-text-active)'
          : item.soon ? 'rgba(255,255,255,0.16)'
          : hov ? '#ffffff'
          : 'var(--sidebar-text)',
        fontFamily: 'var(--font-ui)',
        fontSize: 13, fontWeight: isActive ? 700 : 500,
        outline: 'none', textAlign: 'left',
        transition: 'all 0.15s ease',
        transform: hov && !item.soon && !isActive ? 'translateX(4px) translateY(-1px)' : 'none',
        boxShadow: item.soon 
          ? 'none'
          : isActive
          ? '0 2px 6px rgba(0,0,0,0.15), inset 0 1px 2px rgba(255,255,255,0.08)'
          : hov
          ? '0 4px 12px rgba(0,0,0,0.2), 0 1px 3px rgba(0,0,0,0.1), inset 0 1px 0 rgba(255,255,255,0.1)'
          : '0 1px 3px rgba(0,0,0,0.05), inset 0 1px 0 rgba(255,255,255,0.04)',
      }}
    >
      <Icon
        size={16}
        style={{
          flexShrink: 0,
          opacity: item.soon ? 0.25 : 1,
          transform: hov && !item.soon ? 'scale(1.12)' : 'scale(1)',
          transition: 'transform 0.15s ease',
        }}
      />
      {!collapsed && (
        <>
          <span style={{ flex: 1, letterSpacing: '0.01em' }}>{item.label}</span>
          {item.soon && (
            <span style={{
              fontSize: 8, fontWeight: 700, padding: '2px 5px', borderRadius: 4,
              background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.18)',
              letterSpacing: '.06em', fontFamily: 'var(--font-ui)',
            }}>
              SOON
            </span>
          )}
        </>
      )}
    </button>
  )
}
