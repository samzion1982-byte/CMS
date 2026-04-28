import { useState } from 'react'
import Sidebar from './Sidebar'
import Header, { HEADER_H } from './Header'

export default function AppLayout({ children }) {
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem('sidebar_collapsed') === 'true'
  )

  const toggle = () => {
    const next = !collapsed
    setCollapsed(next)
    localStorage.setItem('sidebar_collapsed', String(next))
  }

  const sidebarW = collapsed ? 60 : 240

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--page-bg)' }}>
      <Header />
      <Sidebar collapsed={collapsed} sidebarW={sidebarW} onToggle={toggle} />
      <main style={{
        flex: 1,
        marginLeft: sidebarW,
        marginTop: HEADER_H,
        minHeight: `calc(100vh - ${HEADER_H}px)`,
        padding: '28px 32px',
        width: '100%',
        transition: 'margin-left 0.25s ease',
        minWidth: 0,
      }}>
        {children}
      </main>
    </div>
  )
}
