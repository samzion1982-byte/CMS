import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import { displayFirstName } from '../lib/auth'
import { formatDate as formatDateLib } from '../lib/date'
import {
  Users, Home, Calendar, MapPin, Activity, UserPlus,
  Users2, AlertCircle, RefreshCw, User, UserRound,
  Wifi, WifiOff, Settings, Info, BarChart3, Droplets, Lock, Unlock,
  BadgeCheck,
} from 'lucide-react'
import Highcharts from 'highcharts'
import 'highcharts/highcharts-3d'
import * as HighchartsReactModule from 'highcharts-react-official'

function resolveDefault(mod) {
  let current = mod
  while (current && typeof current !== 'function' && current.default) {
    current = current.default
  }
  return current
}

const HighchartsReact = resolveDefault(HighchartsReactModule)

function greetingForNow() {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

function isBaptisedMember(m) {
  const t = String(m?.baptism_type || '').trim().toLowerCase()
  if (t && !['not baptised', 'not baptized', 'no', 'n', 'false', '0', '-'].includes(t)) return true
  if (m?.baptism_date) return true
  return false
}

function isConfirmedMember(m) {
  const v = m?.confirmation_taken
  if (v === true || v === 1) return true
  const s = String(v ?? '').trim().toLowerCase()
  if (['yes', 'y', 'true', '1'].includes(s)) return true
  if (m?.confirmation_date) return true
  return false
}

/* ── Stat Card — tinted tile with texture + accent bar ───────── */
function StatCard({ icon: Icon, label, value, sub, accent, loading, delay = 0 }) {
  return (
    <div
      className="dash-stat-tile"
      style={{
        background: accent.bg,
        border: `1px solid ${accent.border}`,
        boxShadow: accent.shadow,
        ['--tile-accent']: accent.bar,
        ['--tile-shadow-hover']: accent.shadowHover,
        animation: `dashFadeUp 0.35s ease ${delay}s both`,
      }}
    >
      <div style={{
        width: 44, height: 44, borderRadius: 12, flexShrink: 0,
        background: accent.iconBg,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: '0 2px 8px rgba(15,23,42,0.12)',
      }}>
        <Icon size={20} color="#fff" />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: accent.text, margin: '0 0 4px', opacity: 0.85 }}>
          {label}
        </p>
        <p style={{ fontSize: 28, fontWeight: 800, color: 'var(--text-1)', lineHeight: 1, margin: '0 0 3px' }}>
          {loading
            ? <span className="loading-skeleton" style={{ display: 'inline-block', width: 64, height: 28, borderRadius: 6 }} />
            : (value ?? '—')}
        </p>
        <p style={{ fontSize: 11, color: 'var(--text-3)', margin: 0 }}>
          {loading
            ? <span className="loading-skeleton" style={{ display: 'inline-block', width: 100, height: 10, borderRadius: 4 }} />
            : sub}
        </p>
      </div>
    </div>
  )
}

/* ── Gender Card ─────────────────────────────────────────────── */
function GenderCard({ male, female, total, loading }) {
  const mPct = total > 0 ? Math.round((male / total) * 100) : 0
  const fPct = total > 0 ? Math.round((female / total) * 100) : 0
  return (
    <div className="dash-panel" style={{ padding: '20px 24px', animation: 'dashFadeUp 0.35s ease 0.18s both' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
        <div style={{
          width: 40, height: 40, borderRadius: 11,
          background: 'linear-gradient(135deg, var(--sidebar-bg), var(--sidebar-bg-end, var(--sidebar-bg)))',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 2px 8px color-mix(in srgb, var(--sidebar-bg) 35%, transparent)',
        }}>
          <Users2 size={18} color="#fff" />
        </div>
        <div>
          <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)', margin: 0 }}>Gender Distribution</p>
          <p style={{ fontSize: 11, color: 'var(--text-3)', margin: 0 }}>Male vs Female membership</p>
        </div>
        <div style={{ marginLeft: 'auto', fontSize: 20, fontWeight: 800, color: 'var(--text-1)' }}>
          {loading ? '—' : total.toLocaleString()}
          <span style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 500, marginLeft: 4 }}>total</span>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14 }}>
        <div style={{
          width: 52, height: 52, borderRadius: 14, flexShrink: 0,
          background: 'linear-gradient(135deg,#dbeafe,#93c5fd)',
          border: '1px solid #93c5fd',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 4px 12px rgba(37,99,235,0.18)',
        }} title="Men">
          <User size={24} color="#1d4ed8" strokeWidth={2.25} />
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            height: 14, borderRadius: 99, overflow: 'hidden',
            background: 'color-mix(in srgb, var(--sidebar-bg, #0d2244) 6%, #f1f5f9)',
            boxShadow: 'inset 0 1px 2px rgba(15,23,42,0.06)',
          }}>
            <div style={{
              height: '100%', width: `${mPct}%`,
              background: 'linear-gradient(90deg,#60a5fa,#2563eb)',
              float: 'left', transition: 'width .7s ease',
            }} />
            <div style={{
              height: '100%', width: `${fPct}%`,
              background: 'linear-gradient(90deg,#fb7185,#e11d48)',
              float: 'left', transition: 'width .7s ease',
            }} />
          </div>
        </div>

        <div style={{
          width: 52, height: 52, borderRadius: 14, flexShrink: 0,
          background: 'linear-gradient(135deg,#ffe4e6,#fda4af)',
          border: '1px solid #fda4af',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 4px 12px rgba(225,29,72,0.18)',
        }} title="Women">
          <UserRound size={24} color="#be123c" strokeWidth={2.25} />
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '8px 12px', borderRadius: 10,
          background: 'linear-gradient(135deg,#eff6ff,#dbeafe88)',
          border: '1px solid #bfdbfe',
        }}>
          <User size={14} color="#1d4ed8" />
          <span style={{ fontSize: 12, color: 'var(--text-2)', fontWeight: 600 }}>Men</span>
          <span style={{ fontSize: 17, fontWeight: 800, color: '#1d4ed8', marginLeft: 2 }}>{loading ? '—' : male.toLocaleString()}</span>
          <span style={{ fontSize: 11, color: 'var(--text-3)' }}>({mPct}%)</span>
        </div>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '8px 12px', borderRadius: 10,
          background: 'linear-gradient(135deg,#fff1f2,#ffe4e688)',
          border: '1px solid #fecdd3',
        }}>
          <span style={{ fontSize: 11, color: 'var(--text-3)' }}>({fPct}%)</span>
          <span style={{ fontSize: 17, fontWeight: 800, color: '#be123c', marginRight: 2 }}>{loading ? '—' : female.toLocaleString()}</span>
          <span style={{ fontSize: 12, color: 'var(--text-2)', fontWeight: 600 }}>Women</span>
          <UserRound size={14} color="#be123c" />
        </div>
      </div>
    </div>
  )
}

/* ── Age Group Chart (SVG) ───────────────────────────────────── */
const AGE_ORDER  = ['Super Senior', 'Senior Citizen', 'Adult', 'Youth', 'Children']
const AGE_RANGES = { 'Super Senior': '80+', 'Senior Citizen': '60–79', 'Adult': '36–59', 'Youth': '18–35', 'Children': '0–17' }
const MALE_COLOR   = '#2563eb'
const FEMALE_COLOR = '#ec4899'

function AgeGroupChart({ ageGroups, loading }) {
  if (loading) {
    return (
      <div style={{ height: 280, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 10 }}>
        <div style={{ width: 34, height: 34, border: '3px solid var(--card-border)', borderTop: '3px solid var(--accent)', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
        <p style={{ fontSize: 12, color: 'var(--text-3)' }}>Loading chart…</p>
      </div>
    )
  }

  const map = {}
  ;(ageGroups || []).forEach(g => {
    const key = AGE_ORDER.find(k => g.title.includes(k.split(' ')[0]))
    if (key) map[key] = g
  })
  const groups = AGE_ORDER.map(key => ({ label: key, male: map[key]?.male ?? 0, female: map[key]?.female ?? 0 }))
  const allVals = groups.flatMap(g => [g.male, g.female])
  const maxVal  = Math.max(...allVals, 1)

  const W = 640, H = 280
  const padL = 42, padR = 16, padT = 28, padB = 56
  const chartW = W - padL - padR
  const chartH = H - padT - padB
  const groupW = chartW / groups.length
  const barW   = Math.min(28, groupW * 0.28)
  const gap    = 4
  const ticks  = Array.from({ length: 6 }, (_, i) => Math.round((maxVal / 5) * i))

  return (
    <div>
      <div style={{ display: 'flex', gap: 22, marginBottom: 10, paddingLeft: padL }}>
        {[['Male', MALE_COLOR], ['Female', FEMALE_COLOR]].map(([lbl, col]) => (
          <div key={lbl} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 13, height: 13, borderRadius: 3, background: col }} />
            <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--text-2)' }}>{lbl}</span>
          </div>
        ))}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
        <defs>
          <linearGradient id="mGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor="#60a5fa" />
            <stop offset="100%" stopColor="#1d4ed8" />
          </linearGradient>
          <linearGradient id="fGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor="#f9a8d4" />
            <stop offset="100%" stopColor="#be185d" />
          </linearGradient>
          <linearGradient id="mSide" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%"   stopColor="#1e40af" />
            <stop offset="100%" stopColor="#1e3a8a" />
          </linearGradient>
          <linearGradient id="fSide" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%"   stopColor="#9d174d" />
            <stop offset="100%" stopColor="#831843" />
          </linearGradient>
          <filter id="barShadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="2" dy="3" stdDeviation="3" floodColor="rgba(0,0,0,0.22)" />
          </filter>
        </defs>

        {ticks.map(t => {
          const y = padT + chartH - (t / maxVal) * chartH
          return (
            <g key={t}>
              <line x1={padL} y1={y} x2={W - padR} y2={y}
                stroke={t === 0 ? '#cbd5e1' : '#e2e8f0'}
                strokeWidth={t === 0 ? 1.5 : 0.8}
                strokeDasharray={t === 0 ? '' : '4 4'} />
              <text x={padL - 6} y={y + 4} textAnchor="end" fontSize={9} fill="#94a3b8" fontFamily="Arial,sans-serif">{t}</text>
            </g>
          )
        })}

        {groups.map((g, gi) => {
          const SIDE = 6
          const cx  = padL + gi * groupW + groupW / 2
          const mX  = cx - barW - gap / 2
          const fX  = cx + gap / 2
          const mH  = maxVal > 0 ? (g.male   / maxVal) * chartH : 0
          const fH  = maxVal > 0 ? (g.female / maxVal) * chartH : 0
          const mY  = padT + chartH - mH
          const fY  = padT + chartH - fH
          const baseY = padT + chartH
          return (
            <g key={g.label} filter="url(#barShadow)">
              {g.male > 0 && (
                <g>
                  {/* 3D right side */}
                  <path d={`M ${mX+barW} ${mY} L ${mX+barW+SIDE} ${mY-SIDE} L ${mX+barW+SIDE} ${baseY-SIDE} L ${mX+barW} ${baseY} Z`} fill="url(#mSide)" opacity={0.85} />
                  {/* 3D top cap */}
                  <path d={`M ${mX} ${mY} L ${mX+SIDE} ${mY-SIDE} L ${mX+barW+SIDE} ${mY-SIDE} L ${mX+barW} ${mY} Z`} fill="#93c5fd" opacity={0.9} />
                  {/* Main bar */}
                  <rect x={mX} y={mY} width={barW} height={mH} fill="url(#mGrad)" />
                  <text x={mX + barW/2} y={mY - SIDE - 5} textAnchor="middle" fontSize={9.5} fontWeight="700" fill={MALE_COLOR} fontFamily="Arial,sans-serif">{g.male}</text>
                </g>
              )}
              {g.female > 0 && (
                <g>
                  {/* 3D right side */}
                  <path d={`M ${fX+barW} ${fY} L ${fX+barW+SIDE} ${fY-SIDE} L ${fX+barW+SIDE} ${baseY-SIDE} L ${fX+barW} ${baseY} Z`} fill="url(#fSide)" opacity={0.85} />
                  {/* 3D top cap */}
                  <path d={`M ${fX} ${fY} L ${fX+SIDE} ${fY-SIDE} L ${fX+barW+SIDE} ${fY-SIDE} L ${fX+barW} ${fY} Z`} fill="#fbcfe8" opacity={0.9} />
                  {/* Main bar */}
                  <rect x={fX} y={fY} width={barW} height={fH} fill="url(#fGrad)" />
                  <text x={fX + barW/2} y={fY - SIDE - 5} textAnchor="middle" fontSize={9.5} fontWeight="700" fill={FEMALE_COLOR} fontFamily="Arial,sans-serif">{g.female}</text>
                </g>
              )}
              <text x={cx + 3} y={baseY + 16} textAnchor="middle" fontSize={10} fontWeight="700" fill="#334155" fontFamily="Arial,sans-serif">
                {g.label === 'Senior Citizen' ? 'Sr. Citizen' : g.label}
              </text>
              <text x={cx + 3} y={baseY + 29} textAnchor="middle" fontSize={9} fill="#64748b" fontFamily="Arial,sans-serif">
                {g.male + g.female > 0 ? `(${g.male + g.female})` : '—'}
              </text>
            </g>
          )
        })}
        <line x1={padL} y1={padT + chartH} x2={W - padR} y2={padT + chartH} stroke="#cbd5e1" strokeWidth={1.5} />
      </svg>
      <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
        {groups.map(g => (
          <div key={g.label} style={{
            flex: 1, minWidth: 80, background: 'var(--page-bg)', borderRadius: 10,
            padding: '8px 10px', textAlign: 'center', border: '1px solid var(--card-border)',
          }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-2)' }}>
              {g.label === 'Senior Citizen' ? 'Sr. Citizen' : g.label}
            </div>
            <div style={{ fontSize: 9, color: 'var(--text-3)', marginBottom: 5 }}>({AGE_RANGES[g.label]})</div>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 800, color: MALE_COLOR }}>{g.male}</span>
              <span style={{ fontSize: 11, color: 'var(--text-3)', alignSelf: 'center' }}>|</span>
              <span style={{ fontSize: 13, fontWeight: 800, color: FEMALE_COLOR }}>{g.female}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ── Zone Donut Pie Chart ────────────────────────────────────── */
function ZonePieChart({ zones, profile }) {
  const [rotation, setRotation] = useState(() => {
    if (typeof window === 'undefined') return 0
    const saved = window.localStorage.getItem('dashboard-zone-rotation')
    return saved !== null ? Number(saved) : 0
  })
  const [locked, setLocked] = useState(() => {
    if (typeof window === 'undefined') return true
    const saved = window.localStorage.getItem('dashboard-zone-rotation-locked')
    return saved !== 'false'
  })

  useEffect(() => {
    if (profile?.dashboard_zone_rotation != null) {
      setRotation(Number(profile.dashboard_zone_rotation))
    }
  }, [profile?.dashboard_zone_rotation])

  const saveRotation = async value => {
    setRotation(value)
    if (locked && typeof window !== 'undefined') {
      window.localStorage.setItem('dashboard-zone-rotation', String(value))
    }
    if (locked && profile?.id) {
      const { error } = await supabase
        .from('profiles')
        .update({ dashboard_zone_rotation: value })
        .eq('id', profile.id)
      if (error) console.error('Failed to save dashboard rotation:', error.message)
    }
  }

  const toggleLock = async () => {
    const next = !locked
    setLocked(next)
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('dashboard-zone-rotation-locked', String(next))
      if (next) {
        window.localStorage.setItem('dashboard-zone-rotation', String(rotation))
      } else {
        window.localStorage.removeItem('dashboard-zone-rotation')
      }
    }
    if (profile?.id) {
      const updatePayload = next ? { dashboard_zone_rotation: rotation } : { dashboard_zone_rotation: null }
      const { error } = await supabase
        .from('profiles')
        .update(updatePayload)
        .eq('id', profile.id)
      if (error) console.error('Failed to update rotation lock on profile:', error.message)
    }
  }

  const filtered = (zones || []).filter(([z]) =>
    !['not assigned', 'unassigned', 'n/a', ''].includes(z.toLowerCase().trim())
  )
  if (filtered.length === 0)
    return <p style={{ fontSize: 12, color: 'var(--text-3)', textAlign: 'center', padding: '40px 0' }}>No zone data available</p>

  const slices = filtered.slice(0, 12)
  const seriesData = slices.map(([zone, count]) => ({
    name: zone,
    y: count,
  }))

  const options = {
    chart: {
      type: 'pie',
      backgroundColor: 'transparent',
      spacing: [20, 20, 20, 20],
      options3d: {
        enabled: true,
        alpha: 45,
        beta: 0,
        depth: 60,
        viewDistance: 30,
      },
    },
    title: {
      text: 'Membership Zone',
      style: { color: 'var(--text-1)', fontSize: '16px', fontWeight: '700' },
    },
    credits: {
      enabled: false,
    },
    tooltip: {
      pointFormat: '{series.name}: <b>{point.y}</b> ({point.percentage:.0f}%)',
    },
    plotOptions: {
      pie: {
        startAngle: rotation,
        allowPointSelect: true,
        cursor: 'pointer',
        depth: 60,
        innerSize: '42%',
        borderColor: '#fff',
        borderWidth: 1,
        shadow: false,
        showInLegend: false,
        dataLabels: {
          enabled: true,
          distance: 36,
          connectorWidth: 1,
          connectorColor: '#6b7280',
          softConnector: false,
          connectorPadding: 5,
          connectorShape: 'fixedOffset',
          crop: false,
          overflow: 'justify',
          format: '{point.name}: {point.y} ({point.percentage:.0f}%)',
          style: {
            color: '#111827',
            fontSize: '12px',
            textOutline: '0px',
            fontWeight: 'normal',
          },
        },
      },
    },
    series: [
      {
        name: 'Members',
        data: seriesData,
      },
    ],
  }

  return (
    <div style={{ width: '100%', minHeight: 520 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', alignItems: 'center', gap: 12, marginBottom: 18 }}>
        <div style={{ fontSize: 12, color: 'var(--text-2)' }}>Rotation: {rotation}°</div>
        <input
          type="range"
          min={-45}
          max={45}
          value={rotation}
          onChange={e => saveRotation(Number(e.target.value))}
          style={{ width: '100%', cursor: 'pointer' }}
        />
        <button
          type="button"
          onClick={toggleLock}
          title={locked ? 'Rotation is locked and will persist' : 'Unlock rotation persistence'}
          style={{
            width: 38, height: 38, borderRadius: 12,
            border: '1px solid var(--card-border)',
            background: locked ? 'var(--accent)' : 'var(--page-bg)',
            color: locked ? '#fff' : 'var(--text-2)',
            display: 'grid', placeItems: 'center', cursor: 'pointer',
          }}
        >
          {locked ? <Lock size={16} /> : <Unlock size={16} />}
        </button>
      </div>
      <div style={{ width: '100%', minHeight: 460 }}>
        <HighchartsReact highcharts={Highcharts} options={options} />
      </div>
    </div>
  )
}

/* ── Section Card wrapper ────────────────────────────────────── */
function SectionCard({ accentColor, accentBar = '#2563eb', headerTint, icon: Icon, title, subtitle, children, delay = 0 }) {
  return (
    <div
      className="dash-panel"
      style={{
        ['--panel-accent']: accentBar,
        animation: `dashFadeUp 0.35s ease ${delay}s both`,
      }}
    >
      <div style={{
        padding: '14px 20px',
        borderBottom: '1px solid var(--card-border)',
        background: headerTint || 'linear-gradient(135deg, color-mix(in srgb, var(--sidebar-bg, #0d2244) 5%, #fff) 0%, var(--card-header-bg) 100%)',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        position: 'relative',
        overflow: 'hidden',
      }}>
        <div style={{
          position: 'absolute', inset: 0, pointerEvents: 'none', opacity: 0.45,
          backgroundImage: 'repeating-linear-gradient(115deg, transparent, transparent 8px, rgba(255,255,255,0.35) 8px, rgba(255,255,255,0.35) 9px)',
        }} />
        <div style={{
          width: 36, height: 36, borderRadius: 10,
          background: accentColor,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 2px 8px rgba(15,23,42,0.14)',
          position: 'relative', zIndex: 1,
        }}>
          <Icon size={16} color="#fff" />
        </div>
        <div style={{ position: 'relative', zIndex: 1 }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)', margin: 0 }}>{title}</p>
          <p style={{ fontSize: 11, color: 'var(--text-3)', margin: 0 }}>{subtitle}</p>
        </div>
      </div>
      <div style={{ padding: '16px 20px' }}>{children}</div>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════
   MAIN DASHBOARD
   ══════════════════════════════════════════════════════════════ */
export default function DashboardPage() {
  const navigate = useNavigate()
  const { session, user, profile, loading: authLoading } = useAuth()
  const [stats, setStats]                   = useState(null)
  const [totalMembersCount, setTotalMembersCount] = useState(0)
  const [inactiveMembersCount, setInactiveMembersCount] = useState(0)
  const [recent, setRecent]                 = useState([])
  const [zones, setZones]                   = useState([])
  const [activities, setActivities]         = useState([])
  const [ageGroups, setAgeGroups]           = useState([])
  const [loading, setLoading]               = useState(true)
  const [error, setError]                   = useState(null)
  const [connectionStatus, setConnectionStatus] = useState('checking')
  const dataFetchedRef  = useRef(false)
  const refreshTimeoutRef = useRef(null)

  useEffect(() => {
    if (!authLoading && session && !dataFetchedRef.current) {
      dataFetchedRef.current = true; loadStats()
    }
  }, [authLoading, session])
  useEffect(() => () => { if (refreshTimeoutRef.current) clearTimeout(refreshTimeoutRef.current) }, [])

  async function loadStats() {
    try {
      setLoading(true); setError(null); setConnectionStatus('connecting')
      const { count: totalCount, error: totalError } = await supabase.from('members').select('*', { count: 'exact', head: true })
      if (totalError) throw new Error(`Cannot access members: ${totalError.message}`)
      setTotalMembersCount(totalCount)

      const { data: membersData, error: membersError } = await supabase.from('members').select('*').eq('is_active', true).limit(2000)
      if (membersError) throw membersError
      const activeCount = membersData?.length || 0
      setInactiveMembersCount(totalCount - activeCount)
      if (activeCount === 0) throw new Error('No active members found')

      const families = new Set(membersData.map(m => m.family_id).filter(Boolean)).size
      const male     = membersData.filter(m => m.gender === 'Male' || m.gender === 'M').length
      const female   = membersData.filter(m => m.gender === 'Female' || m.gender === 'F').length
      const married  = membersData.filter(m => m.marital_status === 'Married' || m.marital_status === 'M').length
      const single   = membersData.filter(m => m.marital_status === 'Single' || m.marital_status === 'S').length
      const baptised = membersData.filter(isBaptisedMember).length
      const confirmed = membersData.filter(isConfirmedMember).length
      setStats({ total: activeCount, families, male, female, married, single, baptised, confirmed })

      const ageData = {
        'Super Senior':  { title: 'Super Senior (80+)',      male: 0, female: 0 },
        'Senior Citizen':{ title: 'Senior Citizen (60-79)',  male: 0, female: 0 },
        'Adult':         { title: 'Adult (36-59)',           male: 0, female: 0 },
        'Youth':         { title: 'Youth (18-35)',           male: 0, female: 0 },
        'Children':      { title: 'Children (0-17)',         male: 0, female: 0 },
      }
      const currentYear = new Date().getFullYear()
      membersData.forEach(m => {
        if (!m.dob_actual) return
        try {
          const birthYear = new Date(m.dob_actual).getFullYear()
          if (isNaN(birthYear) || birthYear <= 1900 || birthYear > currentYear) return
          const age    = currentYear - birthYear
          const gender = (m.gender === 'Male' || m.gender === 'M') ? 'male' : 'female'
          if      (age >= 80) ageData['Super Senior'][gender]++
          else if (age >= 60) ageData['Senior Citizen'][gender]++
          else if (age >= 36) ageData['Adult'][gender]++
          else if (age >= 18) ageData['Youth'][gender]++
          else                ageData['Children'][gender]++
        } catch {}
      })
      setAgeGroups(Object.values(ageData))

      const zMap = {}
      membersData.forEach(m => { const z = m.zonal_area || 'Not assigned'; zMap[z] = (zMap[z] || 0) + 1 })
      setZones(Object.entries(zMap).sort((a, b) => b[1] - a[1]))

      const activityMapping = [
        ['act_mens_fellowship',     "Men's Fellowship",    '#3b82f6'],
        ['act_womens_fellowship',   "Women's Fellowship",  '#ec4899'],
        ['act_youth_association',   'Youth Association',   '#f59e0b'],
        ['act_sunday_school',       'Sunday School',       '#10b981'],
        ['act_choir',               'Choir',               '#8b5cf6'],
        ['act_pastorate_committee', 'Pastorate Committee', '#f97316'],
        ['act_village_ministry',    'Village Ministry',    '#06b6d4'],
        ['act_dcc',                 'DCC',                 '#6366f1'],
        ['act_dc',                  'DC',                  '#84cc16'],
        ['act_volunteers',          'Volunteers',          '#14b8a6'],
        ['act_others',              'Others',              '#94a3b8'],
      ]
      const newActivities = activityMapping.map(([col, label, color]) => ({
        label, color,
        count: membersData.filter(m => {
          const v = m[col]
          return v === true || v === 'true' || v === 1 || v === '1' || v === 'yes' || v === 'Yes'
        }).length,
      })).filter(a => a.count > 0).sort((a, b) => b.count - a.count)
      setActivities(newActivities)

      setRecent([...membersData].sort((a, b) =>
        (a.created_at && b.created_at) ? new Date(b.created_at) - new Date(a.created_at) : 0
      ).slice(0, 8))

      setConnectionStatus('connected')
    } catch (err) {
      setError(err.message); setConnectionStatus('error')
    } finally {
      setLoading(false)
    }
  }

  const handleRefresh = () => {
    if (refreshTimeoutRef.current) clearTimeout(refreshTimeoutRef.current)
    dataFetchedRef.current = false
    setLoading(true); setError(null)
    refreshTimeoutRef.current = setTimeout(loadStats, 100)
  }

  const getInitials = name => name ? name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase() : '?'
  const formatDate = d => formatDateLib(d)

  const StatusBadge = () => {
    if (connectionStatus === 'connected')
      return <span style={{ fontSize: 11, background: 'rgba(34,197,94,0.18)', color: '#86efac', padding: '4px 10px', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 4, border: '1px solid rgba(134,239,172,0.35)', fontWeight: 600 }}><Wifi size={11} /> Live</span>
    if (connectionStatus === 'error')
      return <span style={{ fontSize: 11, background: 'rgba(239,68,68,0.18)', color: '#fca5a5', padding: '4px 10px', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 4, border: '1px solid rgba(252,165,165,0.4)', fontWeight: 600 }}><WifiOff size={11} /> Offline</span>
    return <span style={{ fontSize: 11, background: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.75)', padding: '4px 10px', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 4, border: '1px solid rgba(255,255,255,0.2)', fontWeight: 600 }}><Settings size={11} /> Connecting…</span>
  }

  if (authLoading || (loading && !stats)) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 400, flexDirection: 'column', gap: 14 }}>
        <div style={{ width: 40, height: 40, border: '3px solid var(--card-border)', borderTop: '3px solid var(--accent)', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
        <p style={{ color: 'var(--text-3)', fontSize: 13 }}>{authLoading ? 'Authenticating…' : 'Loading dashboard…'}</p>
      </div>
    )
  }
  if (!session) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 400, flexDirection: 'column', gap: 12 }}>
        <Users2 size={44} color="var(--text-3)" />
        <p style={{ color: 'var(--text-3)' }}>Please log in to view the dashboard</p>
      </div>
    )
  }

  const firstName = displayFirstName(profile, user?.email)
  const ministryMax = Math.max(...activities.map(a => a.count), 1)

  const STAT_CARDS = [
    {
      icon: Users, label: 'Active Members',
      value: stats?.total?.toLocaleString(),
      sub: `Out of ${totalMembersCount} total`,
      accent: {
        bg: 'linear-gradient(155deg, #eff6ff 0%, #dbeafe 48%, #bfdbfe55 100%)',
        border: '#93c5fd', text: '#1e40af', bar: '#3b82f6',
        iconBg: 'linear-gradient(135deg,#60a5fa,#2563eb)',
        shadow: '0 4px 16px rgba(37,99,235,0.12)',
        shadowHover: '0 12px 28px rgba(37,99,235,0.2)',
      },
    },
    {
      icon: Home, label: 'Families',
      value: stats?.families?.toLocaleString(),
      sub: 'Family units registered',
      accent: {
        bg: 'linear-gradient(155deg, #ecfdf5 0%, #d1fae5 48%, #a7f3d055 100%)',
        border: '#6ee7b7', text: '#065f46', bar: '#10b981',
        iconBg: 'linear-gradient(135deg,#34d399,#059669)',
        shadow: '0 4px 16px rgba(16,185,129,0.12)',
        shadowHover: '0 12px 28px rgba(16,185,129,0.2)',
      },
    },
    {
      icon: Calendar, label: 'Married',
      value: stats?.married?.toLocaleString(),
      sub: `${stats?.single || 0} single members`,
      accent: {
        bg: 'linear-gradient(155deg, #ecfeff 0%, #cffafe 48%, #a5f3fc55 100%)',
        border: '#67e8f9', text: '#155e75', bar: '#0891b2',
        iconBg: 'linear-gradient(135deg,#22d3ee,#0891b2)',
        shadow: '0 4px 16px rgba(8,145,178,0.12)',
        shadowHover: '0 12px 28px rgba(8,145,178,0.2)',
      },
    },
    {
      icon: Droplets, label: 'Baptised',
      value: stats?.baptised?.toLocaleString() ?? '—',
      sub: stats?.total
        ? `${Math.round(((stats.baptised || 0) / stats.total) * 100)}% of active members`
        : 'From baptism records',
      accent: {
        bg: 'linear-gradient(155deg, #fffbeb 0%, #fef3c7 48%, #fde68a55 100%)',
        border: '#f6d58a', text: '#92400e', bar: '#f59e0b',
        iconBg: 'linear-gradient(135deg,#fbbf24,#d97706)',
        shadow: '0 4px 16px rgba(245,158,11,0.14)',
        shadowHover: '0 12px 28px rgba(245,158,11,0.22)',
      },
    },
    {
      icon: BadgeCheck, label: 'Confirmed',
      value: stats?.confirmed?.toLocaleString() ?? '—',
      sub: stats?.total
        ? `${Math.round(((stats.confirmed || 0) / stats.total) * 100)}% of active members`
        : 'From confirmation records',
      accent: {
        bg: 'linear-gradient(155deg, #f0f9ff 0%, #e0f2fe 48%, #bae6fd55 100%)',
        border: '#7dd3fc', text: '#075985', bar: '#0284c7',
        iconBg: 'linear-gradient(135deg,#38bdf8,#0284c7)',
        shadow: '0 4px 16px rgba(2,132,199,0.12)',
        shadowHover: '0 12px 28px rgba(2,132,199,0.2)',
      },
    },
  ]

  return (
    <div className="animate-fade-in" style={{ paddingBottom: 32 }}>
      <style>{`
        @keyframes dashFadeUp {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .dash-stat-tile {
          position: relative;
          overflow: hidden;
          border-radius: 14px;
          padding: 18px 18px 18px 20px;
          display: flex;
          align-items: center;
          gap: 14px;
          transition: transform 0.18s ease, box-shadow 0.18s ease;
        }
        .dash-stat-tile::before {
          content: '';
          position: absolute;
          inset: 0;
          background-image:
            radial-gradient(circle at 100% 0%, rgba(255,255,255,0.7) 0%, transparent 42%),
            repeating-linear-gradient(-32deg, transparent, transparent 5px, rgba(255,255,255,0.28) 5px, rgba(255,255,255,0.28) 6px);
          pointer-events: none;
          border-radius: inherit;
        }
        .dash-stat-tile::after {
          content: '';
          position: absolute;
          left: 0; top: 0; bottom: 0;
          width: 4px;
          background: var(--tile-accent, #3b82f6);
          border-radius: 14px 0 0 14px;
        }
        .dash-stat-tile:hover {
          transform: translateY(-3px);
          box-shadow: var(--tile-shadow-hover, 0 12px 28px rgba(15,23,42,0.12));
        }
        .dash-stat-tile > * { position: relative; z-index: 1; }
        .dash-panel {
          position: relative;
          overflow: hidden;
          background: var(--card-bg, #fff);
          border: 1px solid var(--card-border);
          border-radius: 14px;
          box-shadow: 0 2px 10px rgba(15,23,42,0.04);
        }
        .dash-panel::after {
          content: '';
          position: absolute;
          left: 0; top: 0; bottom: 0;
          width: 4px;
          background: var(--panel-accent, var(--sidebar-bg, #0d2244));
          border-radius: 14px 0 0 14px;
        }
        .dash-hero {
          position: relative;
          overflow: hidden;
          border-radius: 16px;
          margin-bottom: 22px;
          padding: 26px 24px;
          background:
            radial-gradient(ellipse at 12% 30%, color-mix(in srgb, var(--accent) 28%, transparent) 0%, transparent 52%),
            radial-gradient(ellipse at 90% 80%, rgba(255,255,255,0.1) 0%, transparent 45%),
            linear-gradient(135deg, var(--sidebar-bg) 0%, color-mix(in srgb, var(--sidebar-bg) 70%, var(--accent)) 48%, var(--sidebar-bg-end, var(--sidebar-bg)) 100%);
          box-shadow: 0 8px 28px color-mix(in srgb, var(--sidebar-bg) 45%, transparent);
          color: #fff;
          animation: dashFadeUp 0.3s ease both;
        }
        .dash-hero-content { position: relative; z-index: 2; }
        .dash-snow {
          position: absolute;
          inset: 0;
          pointer-events: none;
          z-index: 1;
          overflow: hidden;
        }
        .dash-snow span {
          position: absolute;
          top: -12px;
          border-radius: 50%;
          background: rgba(255,255,255,0.85);
          box-shadow: 0 0 6px rgba(255,255,255,0.35);
          animation-name: dashSnowFall;
          animation-timing-function: linear;
          animation-iteration-count: infinite;
        }
        @keyframes dashSnowFall {
          0%   { transform: translate3d(0, -12px, 0); opacity: 0; }
          12%  { opacity: 0.9; }
          85%  { opacity: 0.65; }
          100% { transform: translate3d(var(--drift, 14px), 240px, 0); opacity: 0; }
        }
        .dash-ministry-row {
          transition: background 0.15s ease, transform 0.15s ease;
        }
        .dash-ministry-row:hover {
          transform: translateX(2px);
        }
        .dash-recent-row {
          transition: background 0.15s ease;
        }
        @media (max-width: 900px) {
          .dash-age-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>

      {/* ── Welcome hero ── */}
      <div className="dash-hero">
        <div className="dash-snow" aria-hidden="true">
          {Array.from({ length: 36 }).map((_, i) => {
            const size = 2 + (i % 4)
            const left = ((i * 37) % 100)
            const delay = ((i * 0.37) % 6).toFixed(2)
            const dur = (7 + (i % 8) * 0.7).toFixed(1)
            const drift = (i % 2 === 0 ? 1 : -1) * (8 + (i % 5) * 4)
            return (
              <span
                key={i}
                style={{
                  left: `${left}%`,
                  width: size,
                  height: size,
                  opacity: 0.55 + (i % 5) * 0.08,
                  animationDelay: `${delay}s`,
                  animationDuration: `${dur}s`,
                  ['--drift']: `${drift}px`,
                }}
              />
            )
          })}
        </div>
        <div className="dash-hero-content" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap' }}>
          <h2 style={{ margin: 0, fontSize: 26, fontWeight: 800, letterSpacing: '-0.02em', color: '#fff' }}>
            {greetingForNow()}, {firstName}
          </h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <StatusBadge />
            <button
              onClick={handleRefresh}
              disabled={loading}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '8px 14px', fontSize: 12, fontWeight: 700,
                borderRadius: 9, border: '1px solid rgba(255,255,255,0.22)',
                background: 'color-mix(in srgb, var(--accent) 35%, rgba(255,255,255,0.12))', color: '#fff',
                cursor: loading ? 'default' : 'pointer',
              }}
            >
              <RefreshCw size={13} style={loading ? { animation: 'spin 1s linear infinite' } : {}} />
              Refresh
            </button>
          </div>
        </div>
      </div>

      {/* ── Info Banner ── */}
      {totalMembersCount > 0 && stats && stats.total < totalMembersCount && (
        <div style={{
          marginBottom: 20, background: 'var(--info-subtle)', border: '1px solid var(--info-border)',
          borderRadius: 12, padding: '11px 16px', display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <Info size={16} color="var(--info)" />
          <p style={{ flex: 1, fontSize: 12, color: 'var(--info)', margin: 0 }}>
            Total: <strong>{totalMembersCount}</strong> · Active: <strong>{stats.total}</strong> · Inactive: <strong>{inactiveMembersCount}</strong>
          </p>
          <button onClick={() => navigate('/members')}
            style={{ fontSize: 12, color: 'var(--info)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>
            Manage →
          </button>
        </div>
      )}

      {/* ── Error Banner ── */}
      {error && (
        <div style={{
          marginBottom: 20, background: 'var(--danger-subtle)', border: '1px solid var(--danger-border)',
          borderRadius: 12, padding: '11px 16px', display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <AlertCircle size={16} color="var(--danger)" />
          <p style={{ flex: 1, fontSize: 12, color: 'var(--danger)', margin: 0 }}>{error}</p>
          <button onClick={handleRefresh} style={{ fontSize: 12, color: 'var(--danger)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>Retry</button>
        </div>
      )}

      {/* ── Stat Cards ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))', gap: 14, marginBottom: 20 }}>
        {STAT_CARDS.map((c, i) => (
          <StatCard key={c.label} {...c} loading={loading} delay={0.04 + i * 0.05} />
        ))}
      </div>

      {/* ── Gender Card ── */}
      <div style={{ marginBottom: 20 }}>
        <GenderCard male={stats?.male || 0} female={stats?.female || 0} total={stats?.total || 0} loading={loading} />
      </div>

      {/* ── Age & Gender + Ministries ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 20, marginBottom: 20 }} className="dash-age-grid">
        <SectionCard
          accentColor="linear-gradient(135deg,#3b82f6,#1d4ed8)"
          accentBar="#2563eb"
          headerTint="linear-gradient(135deg,#eff6ff 0%, #f8fafc 100%)"
          icon={BarChart3}
          title="Age & Gender Categorization"
          subtitle="Member distribution by age group and gender"
          delay={0.22}
        >
          <AgeGroupChart ageGroups={ageGroups} loading={loading} />
        </SectionCard>

        <div
          className="dash-panel"
          style={{ overflow: 'hidden', ['--panel-accent']: '#0f766e', animation: 'dashFadeUp 0.35s ease 0.26s both' }}
        >
          <div style={{
            padding: '14px 20px', borderBottom: '1px solid var(--card-border)',
            background: 'linear-gradient(135deg,#ecfdf5 0%, #f8fafc 100%)',
            display: 'flex', alignItems: 'center', gap: 10, position: 'relative', overflow: 'hidden',
          }}>
            <div style={{
              position: 'absolute', inset: 0, pointerEvents: 'none', opacity: 0.4,
              backgroundImage: 'repeating-linear-gradient(115deg, transparent, transparent 8px, rgba(255,255,255,0.4) 8px, rgba(255,255,255,0.4) 9px)',
            }} />
            <div style={{
              width: 36, height: 36, borderRadius: 10,
              background: 'linear-gradient(135deg,#14b8a6,#0f766e)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 2px 8px rgba(15,118,110,0.25)', position: 'relative', zIndex: 1,
            }}>
              <Activity size={16} color="#fff" />
            </div>
            <div style={{ position: 'relative', zIndex: 1 }}>
              <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)', margin: 0 }}>Church Ministries</p>
              <p style={{ fontSize: 11, color: 'var(--text-3)', margin: 0 }}>Participation by activity</p>
            </div>
          </div>
          {activities.length > 0 ? activities.map((act, idx) => {
            const pct = Math.max(6, Math.round((act.count / ministryMax) * 100))
            return (
              <div
                key={act.label}
                className="dash-ministry-row"
                style={{
                  padding: '11px 18px',
                  borderBottom: '1px solid var(--table-border)',
                  background: idx % 2 === 0
                    ? `color-mix(in srgb, ${act.color} 7%, transparent)`
                    : `color-mix(in srgb, ${act.color} 12%, transparent)`,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 7 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                    <div style={{ width: 9, height: 9, borderRadius: 3, background: act.color, flexShrink: 0 }} />
                    <span style={{ fontSize: 12, color: 'var(--text-2)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{act.label}</span>
                  </div>
                  <span style={{
                    fontSize: 11, fontWeight: 700, color: '#fff', background: act.color,
                    padding: '2px 9px', borderRadius: 8, minWidth: 30, textAlign: 'center', flexShrink: 0,
                  }}>
                    {act.count}
                  </span>
                </div>
                <div style={{ height: 5, borderRadius: 99, background: 'rgba(15,23,42,0.06)', overflow: 'hidden' }}>
                  <div style={{
                    height: '100%', width: `${pct}%`, borderRadius: 99,
                    background: act.color, transition: 'width .6s ease', opacity: 0.85,
                  }} />
                </div>
              </div>
            )
          }) : (
            <p style={{ fontSize: 12, color: 'var(--text-3)', textAlign: 'center', padding: '32px 0' }}>No activity data</p>
          )}
        </div>
      </div>

      {/* ── Area Wise Distribution ── */}
      <div style={{ marginBottom: 20 }}>
        <SectionCard
          accentColor="linear-gradient(135deg,#10b981,#059669)"
          accentBar="#059669"
          headerTint="linear-gradient(135deg,#ecfdf5 0%, #f8fafc 100%)"
          icon={MapPin}
          title="Area Wise Distribution"
          subtitle="Members by locality / zone"
          delay={0.3}
        >
          <ZonePieChart zones={zones} profile={profile} />
        </SectionCard>
      </div>

      {/* ── Recent Members ── */}
      <div
        className="dash-panel"
        style={{ overflow: 'hidden', ['--panel-accent']: '#0d9488', animation: 'dashFadeUp 0.35s ease 0.34s both' }}
      >
        <div style={{
          padding: '14px 20px', borderBottom: '1px solid var(--card-border)',
          background: 'linear-gradient(135deg,#f0fdfa 0%, #f8fafc 100%)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          position: 'relative', overflow: 'hidden',
        }}>
          <div style={{
            position: 'absolute', inset: 0, pointerEvents: 'none', opacity: 0.4,
            backgroundImage: 'repeating-linear-gradient(115deg, transparent, transparent 8px, rgba(255,255,255,0.4) 8px, rgba(255,255,255,0.4) 9px)',
          }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, position: 'relative', zIndex: 1 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 10,
              background: 'linear-gradient(135deg,#14b8a6,#0d9488)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 2px 8px rgba(13,148,136,0.25)',
            }}>
              <UserPlus size={16} color="#fff" />
            </div>
            <div>
              <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)', margin: 0 }}>Recently Added Members</p>
              <p style={{ fontSize: 11, color: 'var(--text-3)', margin: 0 }}>Last 8 additions</p>
            </div>
          </div>
          <a href="/members" style={{ fontSize: 12, color: 'var(--accent)', fontWeight: 700, textDecoration: 'none', position: 'relative', zIndex: 1 }}>View all →</a>
        </div>
        {recent.length > 0 ? recent.map((m, idx) => (
          <div
            key={m.member_id || idx}
            className="dash-recent-row"
            style={{
              display: 'flex', alignItems: 'center', gap: 14, padding: '12px 20px',
              borderBottom: '1px solid var(--table-border)',
              background: idx % 2 === 0
                ? 'transparent'
                : 'color-mix(in srgb, var(--sidebar-bg, #0d2244) 3.5%, transparent)',
            }}
          >
            <div style={{
              width: 40, height: 40, borderRadius: '50%', flexShrink: 0,
              background: 'linear-gradient(135deg,#ecfeff,#cffafe)',
              border: '2px solid #22d3ee',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 12, fontWeight: 800, color: '#0e7490',
              boxShadow: '0 0 0 3px rgba(34,211,238,0.18)',
            }}>
              {getInitials(m.member_name)}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)', margin: 0 }}>
                {m.title ? `${m.title} ` : ''}{m.member_name}
              </p>
              <p style={{ fontSize: 11, color: 'var(--text-3)', margin: '2px 0 0' }}>
                ID: {m.member_id || 'N/A'} · Added {formatDate(m.created_at?.slice(0, 10))}
              </p>
            </div>
            {m.zonal_area && (
              <span style={{
                fontSize: 11, fontWeight: 600,
                background: 'linear-gradient(135deg,#eff6ff,#dbeafe)',
                color: '#1e40af',
                padding: '4px 10px', borderRadius: 8,
                border: '1px solid #bfdbfe',
                whiteSpace: 'nowrap',
              }}>
                {m.zonal_area}
              </span>
            )}
          </div>
        )) : (
          <p style={{ fontSize: 12, color: 'var(--text-3)', textAlign: 'center', padding: '32px 0' }}>No members found</p>
        )}
      </div>
    </div>
  )
}
