import { useState, useEffect } from 'react'
import { Monitor, Loader2 } from 'lucide-react'
import { useAuth } from '../../lib/AuthContext'
import { saveDevice, tagLoginWithDevice, getOrCreateDeviceId, checkDeviceRegistered, checkDeviceRegisteredByUser } from '../../lib/loginLogs'
import Sidebar from './Sidebar'
import Header, { HEADER_H } from './Header'

const DEVICE_PENDING_KEY = 'device_setup_pending'

export default function AppLayout({ children }) {
  const { user } = useAuth()

  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem('sidebar_collapsed') === 'true'
  )

  const [showDeviceSetup, setShowDeviceSetup] = useState(false)
  const [isEditMode,      setIsEditMode]      = useState(false)
  const [pendingInfo,     setPendingInfo]     = useState(null)
  const [savingDevice,    setSavingDevice]    = useState(false)
  const [deviceForm,      setDeviceForm]      = useState({ userName: '', orgName: '', area: '', city: '', avatarName: '' })

  // ── New-device detection on mount ──────────────────────────────
  useEffect(() => {
    function tryRead() {
      const raw = sessionStorage.getItem(DEVICE_PENDING_KEY)
      if (!raw) return false
      try {
        const info = JSON.parse(raw)
        if (!info.userId) return false
        setPendingInfo(info)
        setDeviceForm({ userName: '', orgName: '', area: '', city: '', avatarName: '', ...(info.prefill || {}) })
        setIsEditMode(false)
        setShowDeviceSetup(true)
        return true
      } catch {
        sessionStorage.removeItem(DEVICE_PENDING_KEY)
        return true
      }
    }

    if (tryRead()) return
    const iv = setInterval(() => { if (tryRead()) clearInterval(iv) }, 100)
    const to = setTimeout(() => clearInterval(iv), 3000)
    return () => { clearInterval(iv); clearTimeout(to) }
  }, [])

  // ── Edit-mode trigger (called from Header dropdown) ─────────────
  const openEditMode = async () => {
    const devId = getOrCreateDeviceId()
    // Prefer this device; after a cache flush fall back to any prior registration for the user
    const existing = (await checkDeviceRegistered(devId))
      || (user?.id ? await checkDeviceRegisteredByUser(user.id) : null)
    const loc = existing?.location || ''
    const idx = loc.lastIndexOf(', ')
    setDeviceForm({
      userName:   existing?.user_name || '',
      orgName:    existing?.org_name  || '',
      area:       idx !== -1 ? loc.slice(0, idx) : '',
      city:       idx !== -1 ? loc.slice(idx + 2) : loc,
      avatarName: localStorage.getItem('avatar_display_name') || existing?.avatar_name || '',
    })
    setPendingInfo({ deviceId: devId, userId: user?.id })
    setIsEditMode(true)
    setShowDeviceSetup(true)
  }

  // ── Save handler ────────────────────────────────────────────────
  const handleSaveDevice = async () => {
    setSavingDevice(true)
    const location = [deviceForm.area, deviceForm.city].filter(Boolean).join(', ')
    try {
      await saveDevice({
        deviceId:   pendingInfo.deviceId,
        userId:     pendingInfo.userId,
        orgName:    deviceForm.orgName,
        userName:   deviceForm.userName,
        location,
        avatarName: deviceForm.avatarName?.trim() || null,
      })
      // Always tag/update the current login — including Edit Device Info —
      // so User Name / Area / City are not left blank after a cache flush.
      tagLoginWithDevice(pendingInfo.userId, {
        deviceId: pendingInfo.deviceId,
        userName: deviceForm.userName,
        location,
        org: deviceForm.orgName,
      })
    } catch (e) { console.error(e) }
    if (deviceForm.avatarName?.trim()) {
      localStorage.setItem('avatar_display_name', deviceForm.avatarName.trim())
    } else {
      localStorage.removeItem('avatar_display_name')
    }
    window.dispatchEvent(new CustomEvent('avatar-updated'))
    sessionStorage.removeItem(DEVICE_PENDING_KEY)
    setShowDeviceSetup(false)
    setIsEditMode(false)
    setSavingDevice(false)
  }

  const toggle = () => {
    const next = !collapsed
    setCollapsed(next)
    localStorage.setItem('sidebar_collapsed', String(next))
  }

  const sidebarW = collapsed ? 60 : 240

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--page-bg)' }}>
      <div className="no-print" style={{ display: 'contents' }}>
        <Header onEditDevice={openEditMode} />
      </div>
      <div className="no-print" style={{ display: 'contents' }}>
        <Sidebar collapsed={collapsed} sidebarW={sidebarW} onToggle={toggle} />
      </div>
      <main className="app-main" style={{
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

      {/* ── Device Registration / Edit Popup ──────────────────────── */}
      {showDeviceSetup && pendingInfo && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(5,8,30,0.82)', backdropFilter: 'blur(6px)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ width: '100%', maxWidth: 420, background: 'linear-gradient(180deg,rgba(15,20,56,0.98) 0%,rgba(10,14,42,0.99) 100%)', border: '1px solid rgba(59,130,246,0.3)', borderRadius: 18, overflow: 'hidden', boxShadow: '0 24px 64px rgba(0,0,0,0.7)' }}>

            <div style={{ padding: '18px 22px 14px', borderBottom: '1px solid rgba(59,130,246,0.15)', display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 38, height: 38, borderRadius: 10, background: 'rgba(59,130,246,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Monitor size={18} style={{ color: '#60a5fa' }} />
              </div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>
                  {isEditMode ? 'Edit Device Info' : 'New Device Detected'}
                </div>
                <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
                  {isEditMode ? 'Update your name, organisation and location' : 'One-time setup — saved for all future logins'}
                </div>
              </div>
            </div>

            <div style={{ padding: '14px 22px 0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: 'rgba(255,255,255,0.04)', borderRadius: 8, border: '1px solid rgba(255,255,255,0.08)' }}>
                <span style={{ fontSize: 10, color: '#64748b', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Device ID</span>
                <span style={{ fontSize: 11, color: '#60a5fa', fontFamily: 'monospace', fontWeight: 700, letterSpacing: '0.05em' }}>{pendingInfo.deviceId?.slice(0, 8).toUpperCase()}</span>
                <span style={{ fontSize: 10, color: '#334155', marginLeft: 'auto' }}>auto-captured</span>
              </div>
            </div>

            <div style={{ padding: '16px 22px' }}>
              {[
                { label: 'YOUR NAME',          key: 'userName',   required: true,  hint: null },
                { label: 'AVATAR NAME',        key: 'avatarName', required: false, hint: 'Initials shown in the avatar circle — leave blank to use your account name' },
                { label: 'ORGANISATION  ROLE', key: 'orgName',    required: false, hint: null },
                { label: 'AREA',               key: 'area',       required: false, hint: null },
                { label: 'CITY',               key: 'city',       required: true,  hint: null },
              ].map(f => (
                <div key={f.key} style={{ marginBottom: 14 }}>
                  <label style={{ display: 'block', fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', color: '#60a5fa', marginBottom: 6 }}>
                    {f.label}{f.required && <span style={{ color: '#f87171', marginLeft: 3 }}>*</span>}
                  </label>
                  <input
                    style={{ width: '100%', height: 44, padding: '0 14px', background: 'rgba(10,14,42,0.8)', border: '1px solid rgba(59,130,246,0.25)', borderRadius: 10, fontSize: 13, color: '#e2e8f0', fontFamily: 'inherit', outline: 'none' }}
                    value={deviceForm[f.key]}
                    onChange={e => setDeviceForm(v => ({ ...v, [f.key]: e.target.value }))}
                  />
                  {f.hint && <p style={{ fontSize: 9, color: '#475569', margin: '5px 0 0', letterSpacing: '0.04em' }}>{f.hint}</p>}
                </div>
              ))}
            </div>

            <div style={{ padding: '0 22px 20px', display: 'flex', gap: 10 }}>
              {isEditMode && (
                <button onClick={() => { setShowDeviceSetup(false); setIsEditMode(false) }} disabled={savingDevice}
                  style={{ flex: '0 0 auto', padding: '10px 18px', borderRadius: 9, border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: '#64748b', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                  Cancel
                </button>
              )}
              <button onClick={handleSaveDevice} disabled={savingDevice || !deviceForm.userName || !deviceForm.city}
                style={{ flex: 1, padding: '11px 0', borderRadius: 9, border: 'none', background: !deviceForm.userName || !deviceForm.city ? 'rgba(37,99,235,0.4)' : 'linear-gradient(135deg,#2563eb,#1d4ed8)', color: '#fff', fontSize: 13, fontWeight: 700, cursor: !deviceForm.userName || !deviceForm.city ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                {savingDevice
                  ? <><Loader2 size={14} style={{ animation: 'spin 0.8s linear infinite' }} /> Saving…</>
                  : isEditMode ? 'Update →' : 'Save & Continue →'}
              </button>
            </div>

          </div>
        </div>
      )}
    </div>
  )
}
