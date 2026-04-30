import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { AuthProvider, useAuth } from './lib/AuthContext'
import { ToastProvider } from './lib/toast'
import { supabase, getChurch, LICENSE_CSV, VENDOR } from './lib/supabase'

import AppLayout from './components/layout/AppLayout'
import LoginPage from './pages/LoginPage'
import DashboardPage from './pages/DashboardPage'
import MembersPage from './pages/MembersPage'
import ChurchSetupPage from './pages/ChurchSetupPage'
import UsersPage from './pages/UsersPage'
import ImportPage from './pages/ImportPage'
import DeletedMembersPage from './pages/DeletedMembersPage'
import AnnouncementsPage from './pages/AnnouncementsPage'
import AnnouncementsLogPage from './pages/AnnouncementsLogPage'
import LoginLogsPage from './pages/LoginLogsPage'

console.log('📱 App component rendering')

const SPINNER = (
  <div style={{ width:32, height:32, border:'3px solid #e2e8f0', borderTopColor:'#2563eb', borderRadius:'50%', animation:'spin .7s linear infinite', margin:'0 auto 12px' }} />
)

// 🔒 License Gate – blocks non-super_admin users when license is inactive/expired
function LicenseGate({ children }) {
  const { profile, signOut } = useAuth()
  const [status, setStatus] = useState('checking') // 'checking' | 'ok' | 'blocked'
  const [blockReason, setBlockReason] = useState(null)
  const [info, setInfo] = useState(null)

  useEffect(() => {
    if (!profile) return

    if (profile.role === 'super_admin') {
      setStatus('ok')
      return
    }

    async function check() {
      // Fetch church record first — needed for auth_code and grace period timestamp
      const church = await getChurch()
      const code = church?.auth_code?.trim()?.toUpperCase()
      if (!code) { setStatus('ok'); return }

      try {
        const resp = await fetch(LICENSE_CSV)
        const text = await resp.text()
        const rows = text.trim().split('\n').slice(1)
        let found = null
        for (const row of rows) {
          const cols = row.split(',').map(c => c.trim().replace(/^"|"$/g, ''))
          const [rowCode, churchCode, churchName, validUpto, licStatus] = cols
          if (rowCode?.toUpperCase() === code) {
            found = { code: rowCode, churchCode, churchName, validUpto, licStatus }
            break
          }
        }

        if (!found) { setStatus('ok'); return }

        const isDemo = code === '0000-DEMOACCOUNT'
        const inactive = found.licStatus?.toLowerCase().includes('inactive')
        let isExpired = false
        let daysLeft = null

        if (!isDemo) {
          const parts = found.validUpto?.split(/[-\/]/)
          if (parts?.length === 3) {
            const d = new Date(parseInt(parts[2], 10), parseInt(parts[1], 10) - 1, parseInt(parts[0], 10))
            if (!isNaN(d.getTime())) {
              daysLeft = Math.ceil((d - new Date()) / 86400000)
              isExpired = !inactive && d < new Date()
            }
          }
        }

        if (inactive || isExpired) {
          // Clear the grace period timestamp so offline cannot bypass the block
          await supabase.from('churches').update({ license_ok_ts: null }).eq('id', church.id)
          setInfo({ ...found, daysLeft })
          setBlockReason(inactive ? 'inactive' : 'expired')
          setStatus('blocked')
        } else {
          // Stamp the last successful verification time in Supabase
          await supabase.from('churches').update({ license_ok_ts: new Date().toISOString() }).eq('id', church.id)
          setStatus('ok')
        }
      } catch (e) {
        // CSV unreachable — allow up to 24 hours from last verified timestamp in Supabase
        console.error('License CSV fetch failed:', e)
        const lastOk = church?.license_ok_ts ? new Date(church.license_ok_ts).getTime() : 0
        const hoursElapsed = (Date.now() - lastOk) / 3600000
        if (lastOk && hoursElapsed < 24) {
          setStatus('ok')
        } else {
          setBlockReason('network')
          setStatus('blocked')
        }
      }
    }

    check()
  }, [profile])

  if (status === 'checking') {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#f8fafc' }}>
        <div className="text-center">{SPINNER}<p className="text-sm text-slate-500">Verifying license...</p></div>
      </div>
    )
  }

  if (status === 'blocked') {
    return (
      <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'linear-gradient(135deg,#071428 0%,#0d2550 40%,#1a4690 100%)' }}>
        <div style={{ background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.12)', borderRadius:16, padding:'48px 40px', maxWidth:420, width:'90%', textAlign:'center', boxShadow:'0 8px 40px rgba(0,0,0,0.5)' }}>
          {/* Lock icon */}
          <div style={{ width:64, height:64, borderRadius:'50%', background:'rgba(239,68,68,0.15)', border:'2px solid rgba(239,68,68,0.4)', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 24px' }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
          </div>

          <h2 style={{ color:'#fff', fontSize:22, fontWeight:700, margin:'0 0 8px' }}>
            {blockReason === 'network' ? 'License Unverified' : `License ${blockReason === 'inactive' ? 'Inactive' : 'Expired'}`}
          </h2>
          <p style={{ color:'rgba(255,255,255,0.55)', fontSize:14, margin:'0 0 24px', lineHeight:1.6 }}>
            {blockReason === 'inactive'
              ? 'Your church license has been deactivated. Access is restricted until the license is reactivated.'
              : blockReason === 'expired'
              ? 'Your church license has expired. Please renew to continue using the system.'
              : 'License could not be verified and the 24-hour offline grace period has elapsed. Please check your internet connection or contact support.'}
          </p>

          {info?.churchCode && (
            <div style={{ background:'rgba(255,255,255,0.05)', borderRadius:8, padding:'12px 16px', marginBottom:24, textAlign:'left' }}>
              <div style={{ color:'rgba(255,255,255,0.45)', fontSize:11, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:6 }}>Church ID</div>
              <div style={{ color:'#fff', fontWeight:600, fontSize:15 }}>{info.churchCode}</div>
              {info.validUpto && (
                <>
                  <div style={{ color:'rgba(255,255,255,0.45)', fontSize:11, textTransform:'uppercase', letterSpacing:'0.08em', marginTop:10, marginBottom:4 }}>
                    {blockReason === 'expired' ? 'Expired On' : 'Valid Until'}
                  </div>
                  <div style={{ color: blockReason === 'expired' ? '#ef4444' : '#f59e0b', fontWeight:600, fontSize:15 }}>{info.validUpto}</div>
                </>
              )}
            </div>
          )}

          <div style={{ background:'rgba(255,255,255,0.04)', borderRadius:8, padding:'12px 16px', marginBottom:28 }}>
            <div style={{ color:'rgba(255,255,255,0.45)', fontSize:12, marginBottom:4 }}>Contact for support</div>
            <div style={{ color:'#60a5fa', fontWeight:600, fontSize:15 }}>{VENDOR.name}</div>
            <div style={{ color:'rgba(255,255,255,0.7)', fontSize:14, marginTop:2 }}>{VENDOR.phone}</div>
          </div>

          <button
            onClick={signOut}
            style={{ background:'rgba(255,255,255,0.08)', border:'1px solid rgba(255,255,255,0.2)', color:'rgba(255,255,255,0.8)', borderRadius:8, padding:'10px 28px', cursor:'pointer', fontSize:14, fontWeight:500 }}
          >
            Sign Out
          </button>
        </div>
      </div>
    )
  }

  return children
}

// 🔒 Private Route
function PrivateRoute({ children }) {
  const { session, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#f8fafc' }}>
        <div className="text-center">
          {SPINNER}
          <p className="text-sm text-slate-500">Loading session...</p>
        </div>
      </div>
    )
  }

  if (!session) {
    return <Navigate to="/login" replace />
  }

  return <LicenseGate>{children}</LicenseGate>
}

// 🌐 Public Route
function PublicRoute({ children }) {
  const { session, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#f8fafc' }}>
        <div className="text-center">
          <div
            style={{
              width: 32,
              height: 32,
              border: '3px solid #e2e8f0',
              borderTopColor: '#2563eb',
              borderRadius: '50%',
              animation: 'spin .7s linear infinite',
              margin: '0 auto 12px',
            }}
          />
          <p className="text-sm text-slate-500">Loading...</p>
        </div>
      </div>
    )
  }

  if (session) {
    return <Navigate to="/dashboard" replace />
  }

  return children
}

// 🛣️ Routes
function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<PublicRoute><LoginPage /></PublicRoute>} />
      <Route path="/" element={<Navigate to="/dashboard" replace />} />

      <Route
        path="/dashboard"
        element={
          <PrivateRoute>
            <AppLayout><DashboardPage /></AppLayout>
          </PrivateRoute>
        }
      />

      <Route
        path="/members"
        element={
          <PrivateRoute>
            <AppLayout><MembersPage /></AppLayout>
          </PrivateRoute>
        }
      />

      <Route
        path="/deleted-members"
        element={
          <PrivateRoute>
            <AppLayout><DeletedMembersPage /></AppLayout>
          </PrivateRoute>
        }
      />

      <Route
        path="/church-setup"
        element={
          <PrivateRoute>
            <AppLayout><ChurchSetupPage /></AppLayout>
          </PrivateRoute>
        }
      />

      <Route
        path="/users"
        element={
          <PrivateRoute>
            <AppLayout><UsersPage /></AppLayout>
          </PrivateRoute>
        }
      />

      <Route
        path="/import"
        element={
          <PrivateRoute>
            <AppLayout><ImportPage /></AppLayout>
          </PrivateRoute>
        }
      />

      <Route
        path="/announcements"
        element={<PrivateRoute><AppLayout><AnnouncementsPage /></AppLayout></PrivateRoute>}
      />
      <Route
        path="/announcements-log"
        element={<PrivateRoute><AppLayout><AnnouncementsLogPage /></AppLayout></PrivateRoute>}
      />
      <Route
        path="/login-logs"
        element={<PrivateRoute><AppLayout><LoginLogsPage /></AppLayout></PrivateRoute>}
      />

      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  )
}

// 🎯 Main App Component
function App() {
  console.log('🎯 App mounting')

  return (
    <AuthProvider>
      <ToastProvider>
        <BrowserRouter
          future={{
            v7_startTransition: true,
            v7_relativeSplatPath: true,
          }}
        >
          <AppRoutes />
        </BrowserRouter>
      </ToastProvider>
    </AuthProvider>
  )
}

// ✅ IMPORTANT: Default export (this fixes your error)
export default App