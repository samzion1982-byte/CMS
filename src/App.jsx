import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './lib/AuthContext'
import { ToastProvider } from './lib/toast'

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

console.log('📱 App component rendering')

// 🔒 Private Route
function PrivateRoute({ children }) {
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
          <p className="text-sm text-slate-500">Loading session...</p>
        </div>
      </div>
    )
  }

  if (!session) {
    return <Navigate to="/login" replace />
  }

  return children
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