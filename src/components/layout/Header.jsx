import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../../lib/AuthContext'
import { useTheme, THEMES, FONTS } from '../../lib/ThemeContext'
import { getChurch, LICENSE_CSV, VENDOR } from '../../lib/supabase'
import { initials, ROLE_LABELS, displayFirstName } from '../../lib/auth'
import { ChevronDown, LogOut, Edit, Menu, X } from 'lucide-react'
import NotificationBell from './NotificationBell'

export const HEADER_H = 88

/* ── Per-theme tokens ────────────────────────────────────────── */
const T = {
  royal: {
    bg:      'linear-gradient(135deg, #071428 0%, #0d2550 16%, #1a4690 33%, #1e52a4 50%, #1a4690 66%, #0d2550 83%, #071428 100%)',
    border:  'rgba(255,255,255,0.10)',
    shadow:  '0 2px 24px rgba(7,20,40,0.55)',
    text1:   '#ffffff',
    text2:   'rgba(255,255,255,0.62)',
    divider: 'rgba(255,255,255,0.15)',
    accent:  '#d4a017',
    accentL: 'rgba(212,160,23,0.18)',
    drop: { bg:'#eef3ff', text:'#071428', sub:'#6b7280', border:'#c7d5f5', hov:'#dde8ff' },
  },
  ocean: {
    bg:      'linear-gradient(135deg, #021717 0%, #042f2e 16%, #0a5c57 33%, #0d7a73 50%, #0a5c57 66%, #042f2e 83%, #021717 100%)',
    border:  'rgba(255,255,255,0.10)',
    shadow:  '0 2px 24px rgba(2,23,23,0.65)',
    text1:   '#ffffff',
    text2:   'rgba(255,255,255,0.65)',
    divider: 'rgba(255,255,255,0.15)',
    accent:  '#2dd4bf',
    accentL: 'rgba(45,212,191,0.18)',
    drop: { bg:'#e6faf8', text:'#042f2e', sub:'#4a8a80', border:'#a7e8e0', hov:'#ccf5f0' },
  },
  forest: {
    bg:      'linear-gradient(135deg, #071a0f 0%, #0e3018 16%, #1a5c2e 33%, #1f6e36 50%, #1a5c2e 66%, #0e3018 83%, #071a0f 100%)',
    border:  'rgba(255,255,255,0.09)',
    shadow:  '0 2px 24px rgba(7,26,15,0.6)',
    text1:   '#ffffff',
    text2:   'rgba(255,255,255,0.62)',
    divider: 'rgba(255,255,255,0.15)',
    accent:  '#d4a017',
    accentL: 'rgba(212,160,23,0.18)',
    drop: { bg:'#e8f8ee', text:'#071a0f', sub:'#4a7a58', border:'#b0dfc0', hov:'#cceedd' },
  },
  crimson: {
    bg:      'linear-gradient(135deg, #140308 0%, #280610 16%, #5c1026 33%, #6e1230 50%, #5c1026 66%, #280610 83%, #140308 100%)',
    border:  'rgba(255,255,255,0.09)',
    shadow:  '0 2px 24px rgba(20,3,8,0.65)',
    text1:   '#ffffff',
    text2:   'rgba(255,255,255,0.62)',
    divider: 'rgba(255,255,255,0.15)',
    accent:  '#d4a017',
    accentL: 'rgba(212,160,23,0.18)',
    drop: { bg:'#fdeef2', text:'#140308', sub:'#8a4a5a', border:'#f0c0cc', hov:'#fbd5dd' },
  },
  amber: {
    bg:      'linear-gradient(135deg, #160e02 0%, #2a1a05 16%, #6b4508 33%, #92650a 50%, #6b4508 66%, #2a1a05 83%, #160e02 100%)',
    border:  'rgba(255,255,255,0.10)',
    shadow:  '0 2px 24px rgba(22,14,2,0.6)',
    text1:   '#ffffff',
    text2:   'rgba(255,255,255,0.62)',
    divider: 'rgba(255,255,255,0.15)',
    accent:  '#fbbf24',
    accentL: 'rgba(251,191,36,0.18)',
    drop: { bg:'#fff8e8', text:'#2a1a05', sub:'#8a6a30', border:'#f0d9a0', hov:'#f5e8c4' },
  },
  sky: {
    bg:      'linear-gradient(135deg, #061821 0%, #0c2a3d 16%, #0a4f78 33%, #0369a1 50%, #0a4f78 66%, #0c2a3d 83%, #061821 100%)',
    border:  'rgba(255,255,255,0.10)',
    shadow:  '0 2px 24px rgba(6,24,33,0.6)',
    text1:   '#ffffff',
    text2:   'rgba(255,255,255,0.62)',
    divider: 'rgba(255,255,255,0.15)',
    accent:  '#38bdf8',
    accentL: 'rgba(56,189,248,0.18)',
    drop: { bg:'#e8f5fc', text:'#0c2a3d', sub:'#4a7a96', border:'#a8d4ec', hov:'#d4eaf7' },
  },
  sage: {
    bg:      'linear-gradient(135deg, #0f1713 0%, #1c2a22 16%, #355a40 33%, #4d7c5a 50%, #355a40 66%, #1c2a22 83%, #0f1713 100%)',
    border:  'rgba(255,255,255,0.09)',
    shadow:  '0 2px 24px rgba(15,23,19,0.6)',
    text1:   '#ffffff',
    text2:   'rgba(255,255,255,0.62)',
    divider: 'rgba(255,255,255,0.15)',
    accent:  '#a7c9ae',
    accentL: 'rgba(167,201,174,0.18)',
    drop: { bg:'#eef5f0', text:'#1c2a22', sub:'#5a7562', border:'#b5cdb9', hov:'#dce8df' },
  },
  copper: {
    bg:      'linear-gradient(135deg, #160a06 0%, #2a140c 16%, #7a3018 33%, #9a3412 50%, #7a3018 66%, #2a140c 83%, #160a06 100%)',
    border:  'rgba(255,255,255,0.09)',
    shadow:  '0 2px 24px rgba(22,10,6,0.65)',
    text1:   '#ffffff',
    text2:   'rgba(255,255,255,0.62)',
    divider: 'rgba(255,255,255,0.15)',
    accent:  '#ea8a4a',
    accentL: 'rgba(234,138,74,0.18)',
    drop: { bg:'#fff4ed', text:'#2a140c', sub:'#8a5a40', border:'#e8c0a0', hov:'#f5ddd0' },
  },
  honey: {
    bg:      'linear-gradient(135deg, #241c04 0%, #4a3c0a 16%, #c9a227 33%, #f5d76e 50%, #c9a227 66%, #4a3c0a 83%, #241c04 100%)',
    border:  'rgba(255,255,255,0.10)',
    shadow:  '0 2px 24px rgba(36,28,4,0.55)',
    text1:   '#ffffff',
    text2:   'rgba(255,255,255,0.68)',
    divider: 'rgba(255,255,255,0.16)',
    accent:  '#fde68a',
    accentL: 'rgba(253,230,138,0.22)',
    drop: { bg:'#fffce8', text:'#4a3c0a', sub:'#8a7a40', border:'#eadc9a', hov:'#f7efc8' },
  },
  frost: {
    bg:      'linear-gradient(135deg, #12151c 0%, #2a3140 16%, #6b7280 33%, #9ca3af 50%, #6b7280 66%, #2a3140 83%, #12151c 100%)',
    border:  'rgba(255,255,255,0.12)',
    shadow:  '0 2px 24px rgba(18,21,28,0.6)',
    text1:   '#ffffff',
    text2:   'rgba(255,255,255,0.68)',
    divider: 'rgba(255,255,255,0.16)',
    accent:  '#e5e7eb',
    accentL: 'rgba(229,231,235,0.22)',
    drop: { bg:'#f4f4f5', text:'#18181b', sub:'#71717a', border:'#d4d4d8', hov:'#e4e4e7' },
  },
}

function ThemeSwatches({ theme, setTheme, g }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 5 }}>
      {Object.entries(THEMES).map(([key, t]) => {
        const sel = theme === key
        return (
          <button key={key} onClick={() => setTheme(key)}
            onMouseEnter={e => { if (!sel) { e.currentTarget.style.transform = 'translateY(-3px) scale(1.07)'; e.currentTarget.style.boxShadow = `0 6px 16px rgba(0,0,0,0.14)`; e.currentTarget.style.borderColor = g.accent; e.currentTarget.style.background = g.drop.hov }}}
            onMouseLeave={e => { if (!sel) { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.borderColor = g.drop.border; e.currentTarget.style.background = 'transparent' }}}
            style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
            padding: '7px 4px', borderRadius: 10,
            border: `1.5px solid ${sel ? g.drop.text : g.drop.border}`,
            background: sel ? g.drop.hov : 'transparent',
            boxShadow: sel ? `inset 0 -3px 0 ${g.drop.text}` : 'none',
            transform: sel ? 'translateY(-1px)' : 'none',
            cursor: 'pointer', outline: 'none', transition: 'all 0.18s cubic-bezier(0.34,1.56,0.64,1)',
          }}>
                <span style={{ fontSize: 15, fontFamily: '"Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif', lineHeight: 1 }}>{t.icon}</span>
            <span style={{ fontSize: 8, fontWeight: sel ? 700 : 600, color: sel ? g.drop.text : g.drop.sub, fontFamily: 'var(--font-ui)' }}>
              {t.name}
            </span>
          </button>
        )
      })}
    </div>
  )
}

/* ── Live clock ──────────────────────────────────────────────── */
function LiveClock({ g }) {
  const [now, setNow] = useState(new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])
  const time = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true })
  const date = now.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
  return (
    <div style={{ textAlign: 'right', lineHeight: 1.45, flexShrink: 0 }}>
      <p style={{ fontSize: 15, fontWeight: 700, color: g.text1, margin: 0, fontVariantNumeric: 'tabular-nums', fontFamily: 'var(--font-ui)', letterSpacing: '0.02em' }}>{time}</p>
      <p style={{ fontSize: 11, color: g.text2, margin: '2px 0 0', letterSpacing: '0.06em', textTransform: 'uppercase' }}>{date}</p>
    </div>
  )
}

/* ── User badge + dropdown ───────────────────────────────────── */
const DEVICE_EDIT_ROLES = ['super_admin', 'admin1', 'admin', 'user', 'demo', 'user4']

function UserBadge({ profile, ini, firstName, roleLabel, g, theme, setTheme, font, setFont, onSignOut, onEditDevice }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  if (!profile) return null

  return (
    <div ref={ref} style={{ position: 'relative', flexShrink: 0, animation: 'hdrSlideR 0.5s 0.2s ease both' }}>

      {/* Trigger button */}
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '6px 16px 6px 6px',
          borderRadius: 50,
          background: 'rgba(0,0,0,0.30)',
          border: `1.5px solid ${open ? g.accent : 'rgba(255,255,255,0.22)'}`,
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          boxShadow: open ? `0 0 0 3px ${g.accentL}` : '0 2px 12px rgba(0,0,0,0.35)',
          cursor: 'pointer', outline: 'none',
          transition: 'border-color 0.2s, box-shadow 0.2s',
        }}
      >
        {/* Avatar — 3-layer: colour base + sheen + initials */}
        <div style={{
          width: 44, height: 44, borderRadius: '50%', position: 'relative',
          flexShrink: 0,
          animation: 'avatarFill 6s linear infinite',
          boxShadow: 'inset -4px -4px 8px rgba(0,0,0,0.22), inset 3px 3px 6px rgba(255,255,255,0.55), 0 6px 18px rgba(0,0,0,0.38)',
        }}>
          {/* Gradient sheen — sphere highlight */}
          <div style={{
            position: 'absolute', inset: 0, borderRadius: '50%',
            background: 'linear-gradient(135deg, rgba(255,255,255,0.52) 0%, rgba(255,255,255,0.18) 42%, transparent 58%, rgba(0,0,0,0.10) 100%)',
            pointerEvents: 'none',
          }} />
          {/* Initials */}
          <div style={{
            position: 'absolute', inset: 0, borderRadius: '50%',
            display: 'grid', placeItems: 'center',
            fontSize: 15, fontWeight: 800, color: '#1e293b',
            fontFamily: 'var(--font-ui)', letterSpacing: '0.03em',
            textShadow: '0 1px 3px rgba(255,255,255,0.7)',
          }}>
            {ini}
          </div>
        </div>
        {/* Name + role */}
        <div style={{ textAlign: 'left', lineHeight: 1.4 }}>
          <p style={{ fontSize: 14, fontWeight: 700, color: '#fff', margin: 0, fontFamily: 'var(--font-ui)' }}>{firstName}</p>
          <p style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.60)', margin: '2px 0 0', letterSpacing: '0.05em', textTransform: 'uppercase' }}>{roleLabel}</p>
        </div>
        <ChevronDown size={13} color="rgba(255,255,255,0.65)"
          style={{ transition: 'transform 0.2s', transform: open ? 'rotate(180deg)' : 'none', marginLeft: 2, flexShrink: 0 }} />
      </button>

      {/* Dropdown — rendered in the natural DOM flow so no clipping */}
      {open && (
        <div className="user-dropdown" style={{
          position: 'fixed',
          top: HEADER_H + 8,
          right: 16,
          width: 320,
          maxHeight: 'calc(100vh - 110px)',
          overflowY: 'auto',
          scrollbarWidth: 'none',
          msOverflowStyle: 'none',
          background: g.drop.bg,
          border: `1px solid ${g.drop.border}`,
          borderRadius: 16,
          boxShadow: '0 16px 48px rgba(0,0,0,0.22), 0 4px 12px rgba(0,0,0,0.1)',
          zIndex: 9999,
          animation: 'dropDown 0.18s ease both',
        }}>

          {/* Profile section */}
          <div style={{ padding: '16px 18px 14px', borderBottom: `1px solid ${g.drop.border}` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
              {/* Avatar — 3-layer: colour base + sheen + initials */}
              <div style={{
                width: 46, height: 46, borderRadius: '50%', position: 'relative',
                flexShrink: 0,
                animation: 'avatarFill 6s linear infinite',
                boxShadow: 'inset -4px -4px 8px rgba(0,0,0,0.22), inset 3px 3px 6px rgba(255,255,255,0.55), 0 6px 18px rgba(0,0,0,0.38)',
              }}>
                <div style={{
                  position: 'absolute', inset: 0, borderRadius: '50%',
                  background: 'linear-gradient(135deg, rgba(255,255,255,0.52) 0%, rgba(255,255,255,0.18) 42%, transparent 58%, rgba(0,0,0,0.10) 100%)',
                  pointerEvents: 'none',
                }} />
                <div style={{
                  position: 'absolute', inset: 0, borderRadius: '50%',
                  display: 'grid', placeItems: 'center',
                  fontSize: 16, fontWeight: 800, color: '#1e293b',
                  fontFamily: 'var(--font-ui)', letterSpacing: '0.03em',
                  textShadow: '0 1px 3px rgba(255,255,255,0.7)',
                }}>
                  {ini}
                </div>
              </div>
              <div style={{ overflow: 'hidden' }}>
                <p style={{ fontSize: 14, fontWeight: 700, color: g.drop.text, margin: 0, fontFamily: 'var(--font-ui)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {profile.full_name || 'User'}
                </p>
                <p style={{ fontSize: 11, color: g.drop.sub, margin: '2px 0 0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {profile.email || ''}
                </p>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                fontSize: 10, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase',
                color: g.drop.text, background: g.accentL,
                padding: '5px 12px', borderRadius: 6,
                border: `1px solid ${g.accent}55`,
                fontFamily: 'var(--font-ui)',
              }}>
                ★ {roleLabel}
              </span>
              <button
                onClick={() => { setOpen(false); onSignOut() }}
                onMouseEnter={e => e.currentTarget.style.background = '#7f1d1d'}
                onMouseLeave={e => e.currentTarget.style.background = '#991b1b'}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '5px 10px', borderRadius: 6,
                  border: 'none',
                  background: '#991b1b',
                  color: '#fff', cursor: 'pointer',
                  fontSize: 11, fontWeight: 600,
                  fontFamily: 'var(--font-ui)',
                  transition: 'background 0.15s',
                }}
              >
                <LogOut size={12} />
                Sign Out
              </button>
            </div>
          </div>

          {/* Edit Device Info */}
          {DEVICE_EDIT_ROLES.includes(profile?.role) && (
            <button
              onClick={() => { setOpen(false); onEditDevice?.() }}
              onMouseEnter={e => e.currentTarget.style.background = g.drop.hov}
              onMouseLeave={e => e.currentTarget.style.background = 'none'}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                width: '100%', padding: '13px 18px',
                background: 'none', border: 'none',
                borderBottom: `1px solid ${g.drop.border}`,
                color: g.drop.text, cursor: 'pointer',
                fontSize: 13, fontWeight: 600,
                fontFamily: 'var(--font-ui)',
                transition: 'background 0.15s',
              }}
            >
              <Edit size={15} />
              Edit Device Info
            </button>
          )}

          {/* Theme picker */}
          <div style={{ padding: '14px 18px', borderBottom: `1px solid ${g.drop.border}` }}>
            <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.09em', textTransform: 'uppercase', color: g.drop.sub, margin: '0 0 10px', fontFamily: 'var(--font-ui)' }}>
              Appearance
            </p>
            <ThemeSwatches theme={theme} setTheme={setTheme} g={g} />
          </div>

          {/* Font picker */}
          <div style={{ padding: '14px 18px', borderBottom: `1px solid ${g.drop.border}` }}>
            <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.09em', textTransform: 'uppercase', color: g.drop.sub, margin: '0 0 10px', fontFamily: 'var(--font-ui)' }}>
              Typography
            </p>
            <div style={{ display: 'flex', gap: 5 }}>
              {Object.entries(FONTS).map(([key, f]) => {
                const sel = font === key
                return (
                  <button key={key} onClick={() => setFont(key)}
                    onMouseEnter={e => { if (!sel) { e.currentTarget.style.transform = 'translateY(-3px) scale(1.07)'; e.currentTarget.style.boxShadow = `0 6px 16px rgba(0,0,0,0.14)`; e.currentTarget.style.borderColor = g.accent; e.currentTarget.style.background = g.drop.hov }}}
                    onMouseLeave={e => { if (!sel) { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.borderColor = g.drop.border; e.currentTarget.style.background = 'transparent' }}}
                    style={{
                    flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                    padding: '7px 3px', borderRadius: 8,
                    border: `1.5px solid ${sel ? g.drop.text : g.drop.border}`,
                    background: sel ? g.drop.hov : 'transparent',
                    boxShadow: sel ? `inset 0 -3px 0 ${g.drop.text}` : 'none',
                    transform: sel ? 'translateY(-1px)' : 'none',
                    cursor: 'pointer', outline: 'none', transition: 'all 0.18s cubic-bezier(0.34,1.56,0.64,1)',
                  }}>
                    <span style={{ fontSize: 18, fontFamily: f.family, fontWeight: 700, color: g.drop.text, lineHeight: 1 }}>{f.sample}</span>
                    <span style={{ fontSize: 8, fontWeight: sel ? 700 : 500, color: sel ? g.drop.text : g.drop.sub, fontFamily: 'var(--font-ui)', marginTop: 2 }}>
                      {f.name}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>

        </div>
      )}
    </div>
  )
}

/* ── Header ──────────────────────────────────────────────────── */
export default function Header({ onEditDevice, onMenuClick, mobile = false, mobileNavOpen = false }) {
  const { profile, signOut } = useAuth()
  const { theme, setTheme, font, setFont } = useTheme()
  const [church, setChurch]  = useState(null)
  const [avatarDisplayName, setAvatarDisplayName] = useState(() => localStorage.getItem('avatar_display_name') || '')

  useEffect(() => {
    function onAvatarUpdated() {
      setAvatarDisplayName(localStorage.getItem('avatar_display_name') || '')
    }
    window.addEventListener('avatar-updated', onAvatarUpdated)
    return () => window.removeEventListener('avatar-updated', onAvatarUpdated)
  }, [])
  const [licenseStatus, setLicenseStatus] = useState(null)
  const [licenseInfo, setLicenseInfo] = useState(null)
  const [licenseOpen, setLicenseOpen] = useState(false)
  const licenseRef = useRef(null)

  useEffect(() => { getChurch().then(setChurch) }, [])

  useEffect(() => {
    const close = (e) => {
      if (licenseRef.current && !licenseRef.current.contains(e.target)) {
        setLicenseOpen(false)
      }
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  useEffect(() => {
    async function loadLicense() {
      const code = church?.auth_code?.trim()?.toUpperCase()
      if (!code) {
        setLicenseStatus('unknown')
        setLicenseInfo(null)
        return
      }

      try {
        const resp = await fetch(LICENSE_CSV)
        const text = await resp.text()
        const rows = text.trim().split('\n').slice(1)
        let found = null

        for (const row of rows) {
          const cols = row.split(',').map(c => c.trim().replace(/^"|"$/g, ''))
          const [rowCode, churchCode, churchName, validUpto, status] = cols
          if (rowCode?.toUpperCase() === code) {
            found = { code: rowCode, churchCode, churchName, validUpto, status }
            break
          }
        }

        if (!found) {
          setLicenseStatus('invalid')
          setLicenseInfo(null)
          return
        }

        const parts = found.validUpto?.split(/[-\/]/)
        let expiry = null
        if (parts?.length === 3) {
          const d = new Date(parseInt(parts[2], 10), parseInt(parts[1], 10) - 1, parseInt(parts[0], 10))
          if (!isNaN(d.getTime())) expiry = d
        }

        const now = new Date()
        const isDemo = code === '0000-DEMOACCOUNT'
        const inactive = found.status && found.status.toLowerCase().includes('inactive')
        const isExpired = !inactive && expiry && !isDemo && expiry < now

        const daysLeft = expiry ? Math.ceil((expiry - now) / (1000 * 60 * 60 * 24)) : null

        if (inactive) {
          setLicenseStatus('inactive')
          setLicenseInfo({ ...found, expiry, daysLeft })
          return
        }
        if (isExpired) {
          setLicenseStatus('expired')
          setLicenseInfo({ ...found, expiry, daysLeft: 0 })
          return
        }
        if (expiry) {
          setLicenseStatus(daysLeft < 20 ? 'expiring' : 'valid')
          setLicenseInfo({ ...found, expiry, daysLeft })
          return
        }

        setLicenseStatus('valid')
        setLicenseInfo({ ...found, expiry, daysLeft })
      } catch (error) {
        console.error('License load failed:', error)
        setLicenseStatus('invalid')
        setLicenseInfo(null)
      }
    }

    loadLicense()
  }, [church?.auth_code])

  const ini       = avatarDisplayName
    ? avatarDisplayName.trim().slice(0, 3).toUpperCase()
    : initials(profile?.full_name || '').slice(0, 3)
  const firstName = displayFirstName(profile)
  const roleLabel = ROLE_LABELS[profile?.role] || profile?.role || ''
  const g         = T[theme] || T.royal

  const churchId = church?.church_code || church?.id || 'Unknown'
  const licenseValidUntil = licenseInfo?.validUpto || 'Unknown'
  const licenseDaysLeft = typeof licenseInfo?.daysLeft === 'number' ? licenseInfo.daysLeft : null
  const licenseRemainingText = licenseDaysLeft == null ? null
    : licenseDaysLeft >= 0
      ? licenseDaysLeft === 0 ? 'EXPIRES TODAY' : `${licenseDaysLeft} DAYS REMAINING`
      : 'EXPIRED'
  const statusLabel = licenseStatus === 'valid'
    ? 'Active'
    : licenseStatus === 'expiring'
      ? 'Expiring soon'
      : licenseStatus === 'expired'
        ? 'Expired — may be on 3-day grace'
        : licenseStatus === 'inactive'
          ? 'Inactive'
          : licenseStatus === 'invalid'
            ? 'Invalid / not found'
            : 'Unknown'

  const licenseDotStyle = {
    width: 10,
    height: 10,
    borderRadius: '50%',
    background: licenseStatus === 'valid' ? '#2dd4bf'
      : licenseStatus === 'expiring' ? '#f59e0b'
      : licenseStatus === 'expired' ? '#ef4444'
      : licenseStatus === 'inactive' ? '#f59e0b'
      : '#8b98a6',
    boxShadow: 'none',
    animation: licenseStatus === 'expiring'
      ? 'licensePulseAmber 1.4s ease-in-out infinite'
      : licenseStatus === 'expired'
        ? 'licensePulseRed 1.4s ease-in-out infinite'
        : 'none',
  }

  return (
    <>
      <header key={theme} style={{
        position: 'fixed',
        top: 0, left: 0, right: 0,
        height: mobile ? 64 : HEADER_H,
        background: g.bg,
        borderBottom: `1px solid ${g.border}`,
        boxShadow: g.shadow,
        display: 'flex',
        alignItems: 'center',
        padding: mobile ? '0 12px 0 10px' : '0 28px 0 24px',
        gap: mobile ? 10 : 20,
        zIndex: 400,
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        backgroundSize: '300% 100%',
        animation: 'hdrDrop 0.45s ease both, bgWave 12s ease-in-out infinite',
      }}>

        {/* Animated bottom accent line */}
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0, height: 3,
          background: 'linear-gradient(90deg, transparent 0%, #b8860b 15%, #f5c518 35%, #ffd700 50%, #f5c518 65%, #b8860b 85%, transparent 100%)',
          backgroundSize: '200% 100%',
          animation: 'accentSlide 8s ease-in-out infinite',
          pointerEvents: 'none',
        }} />

        {mobile && (
          <button
            type="button"
            className="no-print"
            onClick={onMenuClick}
            aria-label={mobileNavOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={mobileNavOpen}
            style={{
              width: 40, height: 40, borderRadius: 10, flexShrink: 0,
              border: '1.5px solid rgba(255,255,255,0.22)',
              background: 'rgba(0,0,0,0.28)', color: '#fff',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer',
            }}
          >
            {mobileNavOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
        )}

        {/* ── Branding ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: mobile ? 10 : 20, flexShrink: 1, minWidth: 0, animation: 'hdrSlideL 0.5s 0.05s ease both' }}>
          {church?.logo_url && (
            <img
              src={church.logo_url}
              alt="Church logo"
              style={{ width: mobile ? 40 : 64, height: mobile ? 40 : 64, objectFit: 'contain', borderRadius: mobile ? 10 : 14, flexShrink: 0,
                filter: 'drop-shadow(0 3px 12px rgba(0,0,0,0.45))',
                animation: 'logoSpin 0.55s 0.08s ease both',
              }}
            />
          )}
          <div style={{ minWidth: 0 }}>
            {church?.diocese && !mobile && (
              <p style={{
                fontSize: 10.5, fontWeight: 600, color: g.text2,
                margin: '0 0 4px', whiteSpace: 'nowrap',
                fontFamily: 'var(--font-ui)',
                letterSpacing: '0.07em', textTransform: 'uppercase', opacity: 0.75,
              }}>
                {church.diocese}
              </p>
            )}
            <h1 style={{
              fontSize: mobile ? 15 : 22, fontWeight: 800, color: g.text1, margin: 0,
              fontFamily: 'var(--font-ui)', lineHeight: 1.2,
              letterSpacing: '0.3px', whiteSpace: 'nowrap',
              overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: mobile ? '42vw' : undefined,
            }} title={church?.church_name || 'Church CMS'}>
              {church?.church_name || 'Church CMS'}
            </h1>
            {(church?.address || church?.city) && !mobile && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4 }}>
                <p style={{
                  fontSize: 12, color: g.text2, margin: 0,
                  whiteSpace: 'nowrap', fontFamily: 'var(--font-ui)',
                  letterSpacing: '0.03em',
                }}>
                  {[church?.address, church?.city].filter(Boolean).join(', ')}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* ── Right side ── */}
        <div style={{ display: 'flex', alignItems: 'center', animation: 'hdrSlideR 0.5s 0.12s ease both' }}>
          {!mobile && <LiveClock g={g} />}
          {!mobile && <div style={{ width: 1, height: 36, background: g.divider, flexShrink: 0, margin: '0 14px' }} />}
          <NotificationBell g={g} />
          <div style={{ width: 1, height: mobile ? 28 : 36, background: g.divider, flexShrink: 0, margin: mobile ? '0 8px' : '0 14px' }} />

          <div style={{ display: 'flex', alignItems: 'flex-end', gap: mobile ? 8 : 12 }}>
            <UserBadge
              profile={profile} ini={ini} firstName={firstName} roleLabel={roleLabel}
              g={g} theme={theme} setTheme={setTheme} font={font} setFont={setFont}
              onSignOut={signOut} onEditDevice={onEditDevice}
            />

            <div ref={licenseRef} style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', marginBottom: mobile ? 2 : 6 }}>
              <button
                onClick={() => setLicenseOpen(o => !o)}
                style={{
                  width: 28,
                  height: 28,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  border: 'none',
                  borderRadius: '50%',
                  background: 'transparent',
                  padding: 0,
                  cursor: 'pointer',
                  outline: 'none',
                  transition: 'transform 0.18s ease',
                }}
                aria-expanded={licenseOpen}
                aria-label="License status"
              >
                <span style={licenseDotStyle} />
              </button>

              {licenseOpen && (
                <div style={{
                  position: 'absolute',
                  top: 'calc(100% + 10px)',
                  right: 0,
                  width: 296,
                  background: '#0b1120',
                  border: '1px solid rgba(148,163,184,0.28)',
                  borderRadius: 24,
                  boxShadow: '0 22px 54px rgba(0,0,0,0.24)',
                  padding: 18,
                  zIndex: 999,
                  color: '#f8fafc',
                  textAlign: 'center',
                }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                    <div>
                      <p style={{ margin: 0, fontSize: 10, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: '#7dd3fc' }}>
                        Church ID
                      </p>
                      <p style={{ margin: '6px 0 0', fontSize: 15, fontWeight: 800, color: '#ecfeff', letterSpacing: '0.02em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {churchId}
                      </p>
                    </div>
                  </div>

                  <div style={{ background: '#111b2f', border: '1px solid rgba(56,189,248,0.18)', borderRadius: 18, padding: '16px 18px', display: 'grid', gap: 12, marginTop: 14 }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.14em' }}>
                        License details
                      </span>
                      <div style={{ width: '100%', height: 1, background: 'rgba(148,163,184,0.18)', borderRadius: 1 }} />
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, flexWrap: 'wrap' }}>
                      <div style={{ color: '#e2e8f0', fontSize: 14, fontWeight: 700, whiteSpace: 'nowrap' }}>{licenseValidUntil}</div>
                      {licenseRemainingText && (
                        <div style={{ color: '#fde047', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', whiteSpace: 'nowrap' }}>
                          {licenseRemainingText}
                        </div>
                      )}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '12px 14px', background: '#0d162b', borderRadius: 18, border: `1px solid ${licenseStatus === 'expired' ? 'rgba(248,113,113,0.28)' : licenseStatus === 'expiring' ? 'rgba(251,191,36,0.28)' : 'rgba(34,197,94,0.18)'}` }}>
                      <span style={{ fontSize: 10, fontWeight: 700, color: '#facc15', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Current Status</span>
                      <span style={{ color: '#f8fafc', fontSize: 14, fontWeight: 700 }}>{statusLabel}</span>
                      <span style={{ width: 10, height: 10, borderRadius: '50%', background: licenseDotStyle.background, display: 'inline-block' }} />
                    </div>
                  </div>

                  <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid rgba(148,163,184,0.18)', color: '#94a3b8', fontSize: 12, lineHeight: 1.6, textAlign: 'center' }}>
                    <div>Contact:</div>
                    <div style={{ color: '#7dd3fc' }}>{VENDOR.name}</div>
                    <div style={{ color: '#e2e8f0' }}>{VENDOR.phone}</div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      <style>{`
        .user-dropdown::-webkit-scrollbar { display: none; }
        @keyframes dropDown {
          from { opacity: 0; transform: translateY(-6px) scale(0.98); }
          to   { opacity: 1; transform: translateY(0)   scale(1); }
        }
        @keyframes accentSlide {
          0%   { background-position: 100% 0; opacity: 0.75; }
          50%  { background-position:   0% 0; opacity: 1;    }
          100% { background-position: 100% 0; opacity: 0.75; }
        }
        @keyframes hdrDrop {
          from { opacity: 0; transform: translateY(-100%); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes hdrSlideL {
          from { opacity: 0; transform: translateX(-20px); }
          to   { opacity: 1; transform: translateX(0); }
        }
        @keyframes hdrSlideR {
          from { opacity: 0; transform: translateX(16px); }
          to   { opacity: 1; transform: translateX(0); }
        }
        @keyframes hdrFade {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes logoSpin {
          from { opacity: 0; transform: scale(0.75) rotate(-8deg); }
          to   { opacity: 1; transform: scale(1)    rotate(0deg);  }
        }
        @keyframes bgWave {
          0%   { background-position:   0% 50%; }
          50%  { background-position: 100% 50%; }
          100% { background-position:   0% 50%; }
        }
        @keyframes licensePulseAmber {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.2); opacity: 0.55; }
        }
        @keyframes licensePulseRed {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.2); opacity: 0.55; }
        }
        @keyframes avatarFill {
          0%   { background-color: hsl(0,   90%, 65%); }
          14%  { background-color: hsl(40,  95%, 60%); }
          28%  { background-color: hsl(80,  80%, 55%); }
          42%  { background-color: hsl(150, 75%, 50%); }
          57%  { background-color: hsl(200, 90%, 58%); }
          71%  { background-color: hsl(240, 80%, 68%); }
          85%  { background-color: hsl(290, 80%, 65%); }
          100% { background-color: hsl(0,   90%, 65%); }
        }
      `}</style>
    </>
  )
}
