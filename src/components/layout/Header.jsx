import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../../lib/AuthContext'
import { useTheme, THEMES } from '../../lib/ThemeContext'
import { getChurch, LICENSE_CSV, VENDOR } from '../../lib/supabase'
import { initials, ROLE_LABELS } from '../../lib/auth'
import { ChevronDown, LogOut } from 'lucide-react'

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
    drop: { bg:'#ffffff', text:'#071428', sub:'#6b7280', border:'#e5e7eb', hov:'#f5f8ff' },
  },
  ocean: {
    bg:      'linear-gradient(135deg, #0d1117 0%, #131d2e 16%, #1f3058 33%, #1a3a64 50%, #1f3058 66%, #131d2e 83%, #0d1117 100%)',
    border:  'rgba(255,255,255,0.08)',
    shadow:  '0 2px 24px rgba(10,15,30,0.6)',
    text1:   '#ffffff',
    text2:   'rgba(255,255,255,0.60)',
    divider: 'rgba(255,255,255,0.12)',
    accent:  '#0891b2',
    accentL: 'rgba(8,145,178,0.18)',
    drop: { bg:'#ffffff', text:'#0e1117', sub:'#6b7280', border:'#e5e7eb', hov:'#f0f9ff' },
  },
  midnight: {
    bg:      'linear-gradient(135deg, #050810 0%, #08102a 16%, #111840 33%, #151e52 50%, #111840 66%, #08102a 83%, #050810 100%)',
    border:  'rgba(148,163,184,0.09)',
    shadow:  '0 2px 24px rgba(0,0,0,0.7)',
    text1:   '#f1f5f9',
    text2:   'rgba(241,245,249,0.55)',
    divider: 'rgba(148,163,184,0.16)',
    accent:  '#818cf8',
    accentL: 'rgba(129,140,248,0.18)',
    drop: { bg:'#0f172a', text:'#f1f5f9', sub:'#94a3b8', border:'rgba(148,163,184,0.14)', hov:'rgba(148,163,184,0.07)' },
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
    drop: { bg:'#ffffff', text:'#071a0f', sub:'#6b7280', border:'#e5e7eb', hov:'#f0fdf4' },
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
    drop: { bg:'#ffffff', text:'#140308', sub:'#6b7280', border:'#e5e7eb', hov:'#fff5f7' },
  },
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
      <p style={{ fontSize: 15, fontWeight: 700, color: g.text1, margin: 0, fontVariantNumeric: 'tabular-nums', fontFamily: "'Outfit', sans-serif", letterSpacing: '0.02em' }}>{time}</p>
      <p style={{ fontSize: 11, color: g.text2, margin: '2px 0 0', letterSpacing: '0.06em', textTransform: 'uppercase' }}>{date}</p>
    </div>
  )
}

/* ── User badge + dropdown ───────────────────────────────────── */
function UserBadge({ profile, ini, firstName, roleLabel, g, theme, setTheme, onSignOut }) {
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
        {/* Avatar */}
        <div style={{
          width: 44, height: 44, borderRadius: '50%',
          background: 'linear-gradient(180deg, rgba(255,255,255,0.92) 0%, rgba(255,255,255,0.76) 45%, rgba(241,245,249,0.68) 100%)',
          border: '1px solid rgba(255,255,255,0.80)',
          backdropFilter: 'blur(10px)',
          WebkitBackdropFilter: 'blur(10px)',
          boxShadow: `
            inset 0 1px 0 rgba(255,255,255,0.85),
            0 12px 28px rgba(15,23,42,0.12)
          `,
          display: 'grid', placeItems: 'center',
          fontSize: 15, fontWeight: 800, color: '#111827',
          flexShrink: 0, fontFamily: "'Outfit', sans-serif",
          letterSpacing: '0.03em',
          textShadow: '0 1px 2px rgba(255,255,255,0.85)',
        }}>
          {ini}
        </div>
        {/* Name + role */}
        <div style={{ textAlign: 'left', lineHeight: 1.4 }}>
          <p style={{ fontSize: 14, fontWeight: 700, color: '#fff', margin: 0, fontFamily: "'Outfit', sans-serif" }}>{firstName}</p>
          <p style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.60)', margin: '2px 0 0', letterSpacing: '0.05em', textTransform: 'uppercase' }}>{roleLabel}</p>
        </div>
        <ChevronDown size={13} color="rgba(255,255,255,0.65)"
          style={{ transition: 'transform 0.2s', transform: open ? 'rotate(180deg)' : 'none', marginLeft: 2, flexShrink: 0 }} />
      </button>

      {/* Dropdown — rendered in the natural DOM flow so no clipping */}
      {open && (
        <div style={{
          position: 'fixed',
          top: HEADER_H + 8,
          right: 16,
          width: 260,
          background: g.drop.bg,
          border: `1px solid ${g.drop.border}`,
          borderRadius: 16,
          boxShadow: '0 16px 48px rgba(0,0,0,0.22), 0 4px 12px rgba(0,0,0,0.1)',
          overflow: 'hidden',
          zIndex: 9999,
          animation: 'dropDown 0.18s ease both',
        }}>

          {/* Profile section */}
          <div style={{ padding: '16px 18px 14px', borderBottom: `1px solid ${g.drop.border}` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
              <div style={{
                width: 46, height: 46, borderRadius: '50%',
                background: 'linear-gradient(180deg, rgba(255,255,255,0.94) 0%, rgba(255,255,255,0.78) 48%, rgba(241,245,249,0.72) 100%)',
                border: '1px solid rgba(255,255,255,0.72)',
                backdropFilter: 'blur(10px)',
                WebkitBackdropFilter: 'blur(10px)',
                boxShadow: '0 12px 28px rgba(15,23,42,0.12)',
                display: 'grid', placeItems: 'center',
                fontSize: 16, fontWeight: 800, color: '#111827', flexShrink: 0,
                fontFamily: "'Outfit', sans-serif",
                letterSpacing: '0.03em',
              }}>
                {ini}
              </div>
              <div style={{ overflow: 'hidden' }}>
                <p style={{ fontSize: 14, fontWeight: 700, color: g.drop.text, margin: 0, fontFamily: "'Outfit', sans-serif", whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {profile.full_name || 'User'}
                </p>
                <p style={{ fontSize: 11, color: g.drop.sub, margin: '2px 0 0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {profile.email || ''}
                </p>
              </div>
            </div>
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              fontSize: 10, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase',
              color: g.drop.text, background: g.drop.hov,
              padding: '5px 12px', borderRadius: 6,
              border: `1px solid ${g.drop.border}`,
              fontFamily: "'Outfit', sans-serif",
            }}>
              ★ {roleLabel}
            </span>
          </div>

          {/* Theme picker */}
          <div style={{ padding: '14px 18px', borderBottom: `1px solid ${g.drop.border}` }}>
            <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.09em', textTransform: 'uppercase', color: g.drop.sub, margin: '0 0 10px', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
              Appearance
            </p>
            <div style={{ display: 'flex', gap: 6 }}>
              {Object.entries(THEMES).map(([key, t]) => (
                <button key={key} onClick={() => setTheme(key)} style={{
                  flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
                  padding: '8px 4px', borderRadius: 10,
                  border: theme === key ? `2px solid ${g.accent}` : `2px solid ${g.drop.border}`,
                  background: theme === key ? g.accentL : 'transparent',
                  cursor: 'pointer', outline: 'none', transition: 'all 0.15s',
                }}>
                  <span style={{ fontSize: 17 }}>{t.icon}</span>
                  <span style={{ fontSize: 9, fontWeight: 600, color: theme === key ? g.accent : g.drop.sub, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
                    {t.name}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Sign out */}
          <button
            onClick={() => { setOpen(false); onSignOut() }}
            onMouseEnter={e => e.currentTarget.style.background = g.drop.hov}
            onMouseLeave={e => e.currentTarget.style.background = 'none'}
            style={{
              display: 'flex', alignItems: 'center', gap: 10,
              width: '100%', padding: '13px 18px',
              background: 'none', border: 'none',
              color: '#ef4444', cursor: 'pointer',
              fontSize: 13, fontWeight: 600,
              fontFamily: "'Plus Jakarta Sans', sans-serif",
              transition: 'background 0.15s',
            }}
          >
            <LogOut size={15} />
            Sign Out
          </button>
        </div>
      )}
    </div>
  )
}

/* ── Header ──────────────────────────────────────────────────── */
export default function Header() {
  const { profile, signOut } = useAuth()
  const { theme, setTheme }  = useTheme()
  const [church, setChurch]  = useState(null)
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

  const ini       = initials(profile?.full_name || '')
  const firstName = profile?.full_name?.split(' ')[0] || 'User'
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
        height: HEADER_H,
        background: g.bg,
        borderBottom: `1px solid ${g.border}`,
        boxShadow: g.shadow,
        display: 'flex',
        alignItems: 'center',
        padding: '0 28px 0 24px',
        gap: 20,
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

        {/* ── Branding ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexShrink: 0, animation: 'hdrSlideL 0.5s 0.05s ease both' }}>
          {church?.logo_url && (
            <img
              src={church.logo_url}
              alt="Church logo"
              style={{ width: 64, height: 64, objectFit: 'contain', borderRadius: 14, flexShrink: 0,
                filter: 'drop-shadow(0 3px 12px rgba(0,0,0,0.45))',
                animation: 'logoSpin 0.55s 0.08s ease both',
              }}
            />
          )}
          <div>
            {church?.diocese && (
              <p style={{
                fontSize: 10.5, fontWeight: 600, color: g.text2,
                margin: '0 0 4px', whiteSpace: 'nowrap',
                fontFamily: "'Plus Jakarta Sans', sans-serif",
                letterSpacing: '0.07em', textTransform: 'uppercase', opacity: 0.75,
              }}>
                {church.diocese}
              </p>
            )}
            <h1 style={{
              fontSize: 22, fontWeight: 800, color: g.text1, margin: 0,
              fontFamily: "'Outfit', sans-serif", lineHeight: 1.2,
              letterSpacing: '0.3px', whiteSpace: 'nowrap',
            }}>
              {church?.church_name || 'Church CMS'}
            </h1>
            {(church?.address || church?.city) && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4 }}>
                <p style={{
                  fontSize: 12, color: g.text2, margin: 0,
                  whiteSpace: 'nowrap', fontFamily: "'Plus Jakarta Sans', sans-serif",
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
          <LiveClock g={g} />
          <div style={{ width: 1, height: 36, background: g.divider, flexShrink: 0, margin: '0 16px' }} />

          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12 }}>
            <UserBadge
              profile={profile} ini={ini} firstName={firstName} roleLabel={roleLabel}
              g={g} theme={theme} setTheme={setTheme} onSignOut={signOut}
            />

            <div ref={licenseRef} style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', marginBottom: 6 }}>
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
      `}</style>
    </>
  )
}
