import { BrowserRouter, Routes, Route, Navigate, Outlet, useNavigate, useLocation } from 'react-router-dom'
import { useState, useEffect, useRef } from 'react'
import { AuthProvider, useAuth } from './lib/AuthContext'
import { ToastProvider } from './lib/toast'
import { VENDOR } from './lib/supabase'
import {
  evaluateChurchLicense,
  applyLicenseVerificationStamp,
  licenseBlockTitle,
  licenseBlockMessage,
} from './lib/churchLicense'
import { canAccessPath } from './lib/cmsPermissions'

import AppLayout from './components/layout/AppLayout'
import LoginPage from './pages/LoginPage'
import DashboardPage from './pages/DashboardPage'
import MembersPage from './pages/MembersPage'
import ChurchSetupPage from './pages/ChurchSetupPage'
import UsersPage from './pages/UsersPage'
import CmsPermissionsPage from './pages/CmsPermissionsPage'
import ImportPage from './pages/ImportPage'
import DeletedMembersPage from './pages/DeletedMembersPage'
import AnnouncementsPage from './pages/AnnouncementsPage'
import AnnouncementsLogPage from './pages/AnnouncementsLogPage'
import LoginLogsPage from './pages/LoginLogsPage'
import AuditTrailPage from './pages/AuditTrailPage'
import RecycleBinPage from './pages/RecycleBinPage'
import BackupPage from './pages/BackupPage'
import GoogleDriveCallbackPage from './pages/GoogleDriveCallbackPage'
import DeclarationPage from './pages/DeclarationPage'
import ReceiptsPage from './pages/ReceiptsPage'
import MemberStatementPage from './pages/MemberStatementPage'
import ReportsPage          from './pages/ReportsPage'
import AuctionReportPage     from './pages/AuctionReportPage'
import MemberReportPage      from './pages/MemberReportPage'
import TransferReportPage    from './pages/TransferReportPage'
import WhatsAppReceiptLogPage from './pages/WhatsAppReceiptLogPage'
import PaymentSchedulePage    from './pages/PaymentSchedulePage'
import PaymentPage            from './pages/PaymentPage'
import PaymentRequestLogPage  from './pages/PaymentRequestLogPage'
import AccountingPage         from './pages/AccountingPage'
import AccountingSettingsPage from './pages/AccountingSettingsPage'
import ChartOfAccountsPage    from './pages/ChartOfAccountsPage'
import JournalEntryPage       from './pages/JournalEntryPage'
import LedgerPage             from './pages/LedgerPage'
import TrialBalancePage       from './pages/TrialBalancePage'
import FinancialStatementsPage from './pages/FinancialStatementsPage'
import BankAccountsPage        from './pages/BankAccountsPage'
import AccountingReportsPage   from './pages/AccountingReportsPage'
import SimpleAccountsDashboard    from './pages/SimpleAccountsDashboard'
import SimpleTransactionsPage     from './pages/SimpleTransactionsPage'
import SimpleCategoriesPage       from './pages/SimpleCategoriesPage'
import SimpleAccountsManagePage   from './pages/SimpleAccountsManagePage'
import SimpleReportsPage          from './pages/SimpleReportsPage'
import SimpleAccountsSettingsPage from './pages/SimpleAccountsSettingsPage'
import ReceiptVoucherPage         from './pages/ReceiptVoucherPage'
import PaymentVoucherPage         from './pages/PaymentVoucherPage'
import ContraVoucherPage          from './pages/ContraVoucherPage'
import JournalVoucherPage         from './pages/JournalVoucherPage'
import OpeningBalancesPage        from './pages/OpeningBalancesPage'
import FundsPage                  from './pages/FundsPage'
import FundReportPage             from './pages/FundReportPage'
import JournalTemplatesPage       from './pages/JournalTemplatesPage'
import YearEndClosingPage         from './pages/YearEndClosingPage'
import EventPlannerPage           from './pages/EventPlannerPage'
import EventRecorderPage          from './pages/EventRecorderPage'
import EventSettingsPage          from './pages/EventSettingsPage'
import AssetsPage                 from './pages/AssetsPage'
import AssetsSettingsPage         from './pages/AssetsSettingsPage'
import DirectoryPage              from './pages/DirectoryPage'
import PrintCornerPage            from './pages/PrintCornerPage'
import PrintCornerSettingsPage    from './pages/PrintCornerSettingsPage'
import DirectorySettingsPage      from './pages/DirectorySettingsPage'
import BankReconciliationPage     from './pages/BankReconciliationPage'
import BudgetVsActualPage         from './pages/BudgetVsActualPage'
import EntityManagementPage       from './pages/EntityManagementPage'
import { EntityProvider }         from './lib/EntityContext'

console.log('📱 App component rendering')

function GateLoading() {
  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--page-bg, #f1f5f9)',
    }}>
      <div style={{
        width: 36, height: 36, borderRadius: '50%',
        border: '3px solid rgba(37,99,235,0.2)', borderTopColor: '#2563eb',
        animation: 'spin 0.8s linear infinite',
      }} />
    </div>
  )
}

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
      const result = await evaluateChurchLicense()
      if (!result.ok) {
        if (result.reason === 'inactive' || result.reason === 'expired') {
          await applyLicenseVerificationStamp(result.church, false)
        }
        setInfo(result.info)
        setBlockReason(result.reason)
        setStatus('blocked')
        return
      }
      if (result.reason !== 'grace') {
        await applyLicenseVerificationStamp(result.church, true)
      }
      setStatus('ok')
    }

    check()
  }, [profile])

  if (status === 'checking') {
    return <GateLoading />
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
            {licenseBlockTitle(blockReason)}
          </h2>
          <p style={{ color:'rgba(255,255,255,0.55)', fontSize:14, margin:'0 0 24px', lineHeight:1.6 }}>
            {licenseBlockMessage(blockReason)}
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
    return <GateLoading />
  }

  if (!session) {
    return <Navigate to="/login" replace />
  }

  return (
    <LicenseGate>
      <PageAccess>{children}</PageAccess>
    </LicenseGate>
  )
}

/** Block direct URL access when the role is not granted the page. */
function PageAccess({ children }) {
  const { profile, pageGrants, loading, session } = useAuth()
  const location = useLocation()

  if (loading || !profile?.role) {
    return <GateLoading />
  }
  if (!session) return <Navigate to="/login" replace />

  if (!canAccessPath(location.pathname, profile.role, pageGrants)) {
    return <Navigate to="/dashboard" replace />
  }

  return children
}

// 🌐 Public Route
function PublicRoute({ children }) {
  const { session, loading } = useAuth()
  const [canRedirect, setCanRedirect] = useState(false)
  const timerRef = useRef(null)

  useEffect(() => {
    if (!session) {
      setCanRedirect(false)
      clearTimeout(timerRef.current)
      return
    }
    if (sessionStorage.getItem('login_welcome')) {
      // Hold redirect: ~3s Authenticating slider + ~3s Welcome overlay
      timerRef.current = setTimeout(() => {
        sessionStorage.removeItem('login_welcome')
        setCanRedirect(true)
      }, 6000)
    } else {
      setCanRedirect(true)
    }
    return () => clearTimeout(timerRef.current)
  }, [session])

  if (loading) {
    return <GateLoading />
  }

  if (session && canRedirect) return <Navigate to="/dashboard" replace />

  return children
}

// Shared EntityProvider for all /accounting/* routes (persists entity selection across pages)
function AccountingLayout() {
  return (
    <EntityProvider>
      <Outlet />
    </EntityProvider>
  )
}

// 🛣️ Routes
function AppRoutes() {
  const navigate = useNavigate()
  const [showCOAModal, setShowCOAModal] = useState(false)

  // Global Enter-key navigation: pressing Enter on any text input advances to the next focusable element
  useEffect(() => {
    function handleEnter(e) {
      if (e.key !== 'Enter' || e.defaultPrevented) return
      const el = e.target
      if (el.tagName !== 'INPUT') return
      if (el.type === 'submit' || el.type === 'button' || el.type === 'checkbox' || el.type === 'radio') return
      e.preventDefault()
      const all = Array.from(
        document.querySelectorAll('input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled])')
      ).filter(n => n.tabIndex !== -1 && n.offsetParent !== null)
      const idx = all.indexOf(el)
      if (idx !== -1 && idx < all.length - 1) all[idx + 1].focus()
    }
    document.addEventListener('keydown', handleEnter)
    return () => document.removeEventListener('keydown', handleEnter)
  }, [])

  const location = useLocation()

  // Alt+C → Chart of Accounts (modal overlay), only on /accounting pages
  useEffect(() => {
    function handleHotkey(e) {
      if (!location.pathname.startsWith('/accounting')) return
      if (e.altKey && e.key.toLowerCase() === 'c' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault()
        setShowCOAModal(true)
      }
    }
    document.addEventListener('keydown', handleHotkey)
    return () => document.removeEventListener('keydown', handleHotkey)
  }, [location.pathname])

  // Escape closes the COA modal
  useEffect(() => {
    if (!showCOAModal) return
    const onEsc = e => { if (e.key === 'Escape') setShowCOAModal(false) }
    document.addEventListener('keydown', onEsc)
    return () => document.removeEventListener('keydown', onEsc)
  }, [showCOAModal])

  return (
    <>
    {/* Alt+C — Chart of Accounts modal */}
    {showCOAModal && (
      <div
        onClick={() => setShowCOAModal(false)}
        style={{
          position: 'fixed', inset: 0, zIndex: 900,
          background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(3px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 24,
        }}
      >
        <div
          onClick={e => e.stopPropagation()}
          style={{
            width: '92vw', maxWidth: 1100, height: '88vh',
            background: 'var(--page-bg, #f1f5f9)',
            borderRadius: 14,
            boxShadow: '0 24px 80px rgba(0,0,0,0.35)',
            display: 'flex', flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          <div style={{ flex: 1, overflowY: 'auto' }}>
            <EntityProvider>
              <ChartOfAccountsPage isModal onClose={() => setShowCOAModal(false)} />
            </EntityProvider>
          </div>
        </div>
      </div>
    )}
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
        path="/directory"
        element={
          <PrivateRoute>
            <AppLayout><DirectoryPage /></AppLayout>
          </PrivateRoute>
        }
      />
      <Route
        path="/directory/settings"
        element={
          <PrivateRoute>
            <AppLayout><DirectorySettingsPage /></AppLayout>
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
        path="/cms-permissions"
        element={
          <PrivateRoute>
            <AppLayout><CmsPermissionsPage /></AppLayout>
          </PrivateRoute>
        }
      />

      <Route
        path="/import"
        element={
          <PrivateRoute>
            <EntityProvider>
              <AppLayout><ImportPage /></AppLayout>
            </EntityProvider>
          </PrivateRoute>
        }
      />

      <Route path="/declaration"
        element={<PrivateRoute><AppLayout><DeclarationPage /></AppLayout></PrivateRoute>}
      />
      <Route path="/receipts"
        element={<PrivateRoute><AppLayout><ReceiptsPage /></AppLayout></PrivateRoute>}
      />
      <Route path="/member-statement"
        element={<PrivateRoute><AppLayout><MemberStatementPage /></AppLayout></PrivateRoute>}
      />
      <Route path="/reports"
        element={<PrivateRoute><AppLayout><ReportsPage /></AppLayout></PrivateRoute>}
      />
      <Route path="/reports/auction"
        element={<PrivateRoute><AppLayout><AuctionReportPage /></AppLayout></PrivateRoute>}
      />
      <Route path="/reports/member"
        element={<PrivateRoute><AppLayout><MemberReportPage /></AppLayout></PrivateRoute>}
      />
      <Route path="/reports/transfers"
        element={<PrivateRoute><AppLayout><TransferReportPage /></AppLayout></PrivateRoute>}
      />

      <Route
        path="/announcements"
        element={<PrivateRoute><AppLayout><AnnouncementsPage /></AppLayout></PrivateRoute>}
      />
      <Route
        path="/print-corner"
        element={<PrivateRoute><AppLayout><PrintCornerPage /></AppLayout></PrivateRoute>}
      />
      <Route
        path="/print-corner/settings"
        element={<PrivateRoute><AppLayout><PrintCornerSettingsPage /></AppLayout></PrivateRoute>}
      />
      <Route
        path="/announcements-log"
        element={<PrivateRoute><AppLayout><AnnouncementsLogPage /></AppLayout></PrivateRoute>}
      />
      <Route
        path="/login-logs"
        element={<PrivateRoute><AppLayout><LoginLogsPage /></AppLayout></PrivateRoute>}
      />
      <Route
        path="/audit-trail"
        element={<PrivateRoute><AppLayout><AuditTrailPage /></AppLayout></PrivateRoute>}
      />
      <Route
        path="/recycle-bin"
        element={<PrivateRoute><AppLayout><RecycleBinPage /></AppLayout></PrivateRoute>}
      />
      <Route
        path="/backup"
        element={<PrivateRoute><AppLayout><BackupPage /></AppLayout></PrivateRoute>}
      />
      <Route
        path="/backup/google-callback"
        element={<PrivateRoute><AppLayout><GoogleDriveCallbackPage /></AppLayout></PrivateRoute>}
      />
      <Route
        path="/whatsapp-receipt-log"
        element={<PrivateRoute><AppLayout><WhatsAppReceiptLogPage /></AppLayout></PrivateRoute>}
      />
      <Route
        path="/payment-schedule"
        element={<PrivateRoute><AppLayout><PaymentSchedulePage /></AppLayout></PrivateRoute>}
      />
      <Route
        path="/payment-request-log"
        element={<PrivateRoute><AppLayout><PaymentRequestLogPage /></AppLayout></PrivateRoute>}
      />

      {/* ── Accounting Module — all under a single EntityProvider ── */}
      <Route path="/accounting" element={<PrivateRoute><AccountingLayout /></PrivateRoute>}>
        <Route index                    element={<AppLayout><AccountingPage /></AppLayout>} />
        <Route path="chart-of-accounts" element={<AppLayout><ChartOfAccountsPage /></AppLayout>} />
        <Route path="journal-entries"   element={<AppLayout><JournalEntryPage /></AppLayout>} />
        <Route path="journal-entries/:id" element={<AppLayout><JournalEntryPage /></AppLayout>} />
        <Route path="ledger"            element={<AppLayout><LedgerPage /></AppLayout>} />
        <Route path="trial-balance"     element={<AppLayout><TrialBalancePage /></AppLayout>} />
        <Route path="statements"        element={<AppLayout><FinancialStatementsPage /></AppLayout>} />
        <Route path="settings"          element={<AppLayout><AccountingSettingsPage /></AppLayout>} />
        <Route path="bank-accounts"     element={<AppLayout><BankAccountsPage /></AppLayout>} />
        <Route path="gl-reports"        element={<AppLayout><AccountingReportsPage /></AppLayout>} />
        <Route path="receipt-voucher"   element={<AppLayout><ReceiptVoucherPage /></AppLayout>} />
        <Route path="payment-voucher"   element={<AppLayout><PaymentVoucherPage /></AppLayout>} />
        <Route path="contra-voucher"    element={<AppLayout><ContraVoucherPage /></AppLayout>} />
        <Route path="journal-voucher"   element={<AppLayout><JournalVoucherPage /></AppLayout>} />
        <Route path="opening-balances"  element={<AppLayout><OpeningBalancesPage /></AppLayout>} />
        <Route path="templates"         element={<AppLayout><JournalTemplatesPage /></AppLayout>} />
        <Route path="year-end-closing"  element={<AppLayout><YearEndClosingPage /></AppLayout>} />
        <Route path="bank-reconciliation" element={<AppLayout><BankReconciliationPage /></AppLayout>} />
        <Route path="budget-vs-actual"  element={<AppLayout><BudgetVsActualPage /></AppLayout>} />
        <Route path="funds"             element={<AppLayout><FundsPage /></AppLayout>} />
        <Route path="fund-report"       element={<AppLayout><FundReportPage /></AppLayout>} />
        <Route path="entities"          element={<AppLayout><EntityManagementPage /></AppLayout>} />
      </Route>

      {/* ── Events Module ── */}
      <Route path="/events/planner"
        element={<PrivateRoute><AppLayout><EventPlannerPage /></AppLayout></PrivateRoute>}
      />
      <Route path="/events/recorder"
        element={<PrivateRoute><AppLayout><EventRecorderPage /></AppLayout></PrivateRoute>}
      />
      <Route path="/events/settings"
        element={<PrivateRoute><AppLayout><EventSettingsPage /></AppLayout></PrivateRoute>}
      />

      {/* ── Asset Management ── */}
      <Route path="/assets"
        element={<PrivateRoute><AppLayout><AssetsPage /></AppLayout></PrivateRoute>}
      />
      <Route path="/assets/settings"
        element={<PrivateRoute><AppLayout><AssetsSettingsPage /></AppLayout></PrivateRoute>}
      />

      {/* ── Simple Accounts Module ── */}
      <Route path="/simple-accounts"             element={<PrivateRoute><AppLayout><SimpleAccountsDashboard /></AppLayout></PrivateRoute>} />
      <Route path="/simple-accounts/transactions" element={<PrivateRoute><AppLayout><SimpleTransactionsPage /></AppLayout></PrivateRoute>} />
      <Route path="/simple-accounts/categories"   element={<PrivateRoute><AppLayout><SimpleCategoriesPage /></AppLayout></PrivateRoute>} />
      <Route path="/simple-accounts/accounts"     element={<PrivateRoute><AppLayout><SimpleAccountsManagePage /></AppLayout></PrivateRoute>} />
      <Route path="/simple-accounts/reports"      element={<PrivateRoute><AppLayout><SimpleReportsPage /></AppLayout></PrivateRoute>} />
      <Route path="/simple-accounts/settings"     element={<PrivateRoute><AppLayout><SimpleAccountsSettingsPage /></AppLayout></PrivateRoute>} />

      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
    </>
  )
}

// 🎯 Main App Component
function App() {
  console.log('🎯 App mounting')

  // Intercept /pay/:requestId before any Router/Auth setup.
  // PaymentPage is a public page — members must never see a login form.
  const payMatch = window.location.pathname.match(/^\/pay\/([^/]+)/)
  if (payMatch) {
    return <PaymentPage requestId={payMatch[1]} />
  }

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