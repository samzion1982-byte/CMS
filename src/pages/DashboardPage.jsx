import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { useTheme } from '../lib/ThemeContext'
import { formatDate as formatDateLib } from '../lib/date'
import {
  Users, Home, Calendar, MapPin, Activity, UserPlus,
  Users2, AlertCircle, RefreshCw,
  Wifi, WifiOff, Settings, Info, BarChart3, Heart, Lock, Unlock,
} from 'lucide-react'
import Highcharts from 'highcharts'
import HighchartsReact from 'highcharts-react-official'
import highcharts3d from 'highcharts/highcharts-3d'

highcharts3d(Highcharts)

/* ── Stat Card — clean white with colored icon badge ─────────── */
function StatCard({ icon: Icon, label, value, sub, iconBg, iconColor, loading }) {
  return (
    <div className="card" style={{ padding: '18px 20px', display: 'flex', alignItems: 'center', gap: 16 }}>
      {/* Icon badge */}
      <div style={{
        width: 52, height: 52, borderRadius: 14, flexShrink: 0,
        background: iconBg,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Icon size={22} color={iconColor} />
      </div>
      {/* Text */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-3)', margin: '0 0 4px' }}>
          {label}
        </p>
        <p style={{ fontSize: 30, fontWeight: 800, color: 'var(--text-1)', lineHeight: 1, margin: '0 0 3px' }}>
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
    <div className="card" style={{ padding: '20px 24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
        <div style={{ width: 38, height: 38, borderRadius: 10, background: 'linear-gradient(135deg,#a855f7,#7c3aed)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Users2 size={18} color="#fff" />
        </div>
        <div>
          <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)' }}>Gender Distribution</p>
          <p style={{ fontSize: 11, color: 'var(--text-3)' }}>Male vs Female membership</p>
        </div>
        <div style={{ marginLeft: 'auto', fontSize: 20, fontWeight: 800, color: 'var(--text-1)' }}>
          {loading ? '—' : total.toLocaleString()}
          <span style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 500, marginLeft: 4 }}>total</span>
        </div>
      </div>
      <div style={{ height: 12, borderRadius: 99, overflow: 'hidden', background: 'var(--page-bg)', marginBottom: 12 }}>
        <div style={{ height: '100%', width: `${mPct}%`, background: 'linear-gradient(90deg,#3b82f6,#2563eb)', float: 'left', transition: 'width .6s ease' }} />
        <div style={{ height: '100%', width: `${fPct}%`, background: 'linear-gradient(90deg,#f97316,#ea580c)', float: 'left', transition: 'width .6s ease' }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 9, height: 9, borderRadius: 3, background: '#3b82f6' }} />
          <span style={{ fontSize: 12, color: 'var(--text-2)' }}>Male</span>
          <span style={{ fontSize: 17, fontWeight: 800, color: '#2563eb', marginLeft: 4 }}>{loading ? '—' : male.toLocaleString()}</span>
          <span style={{ fontSize: 11, color: 'var(--text-3)' }}>({mPct}%)</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 11, color: 'var(--text-3)' }}>({fPct}%)</span>
          <span style={{ fontSize: 17, fontWeight: 800, color: '#ea580c', marginRight: 4 }}>{loading ? '—' : female.toLocaleString()}</span>
          <span style={{ fontSize: 12, color: 'var(--text-2)' }}>Female</span>
          <div style={{ width: 9, height: 9, borderRadius: 3, background: '#f97316' }} />
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
  const { theme } = useTheme()
  const isDarkTheme = theme === 'midnight'
  
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
            color: isDarkTheme ? '#f1f5f9' : '#111827',
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
function SectionCard({ accentColor, icon: Icon, title, subtitle, children }) {
  return (
    <div className="card">
      <div style={{
        padding: '14px 20px',
        borderBottom: '1px solid var(--card-border)',
        background: 'var(--card-header-bg)',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
      }}>
        <div style={{
          width: 34, height: 34, borderRadius: 9,
          background: accentColor,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Icon size={16} color="#fff" />
        </div>
        <div>
          <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)' }}>{title}</p>
          <p style={{ fontSize: 11, color: 'var(--text-3)' }}>{subtitle}</p>
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
      setStats({ total: activeCount, families, male, female, married, single })

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
      return <span style={{ fontSize: 11, background: 'var(--success-subtle)', color: 'var(--success)', padding: '3px 10px', borderRadius: 99, display: 'flex', alignItems: 'center', gap: 4, border: '1px solid var(--success-border)' }}><Wifi size={11} /> Live</span>
    if (connectionStatus === 'error')
      return <span style={{ fontSize: 11, background: 'var(--danger-subtle)', color: 'var(--danger)', padding: '3px 10px', borderRadius: 99, display: 'flex', alignItems: 'center', gap: 4, border: '1px solid var(--danger-border)' }}><WifiOff size={11} /> Offline</span>
    return <span style={{ fontSize: 11, background: 'var(--page-bg)', color: 'var(--text-3)', padding: '3px 10px', borderRadius: 99, display: 'flex', alignItems: 'center', gap: 4, border: '1px solid var(--card-border)' }}><Settings size={11} /> Connecting…</span>
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

  const STAT_CARDS = [
    { icon: Users,    label: 'Active Members', value: stats?.total?.toLocaleString(),    sub: `Out of ${totalMembersCount} total`,     iconBg: '#dbeafe', iconColor: '#1d4ed8' },
    { icon: Home,     label: 'Families',       value: stats?.families?.toLocaleString(), sub: 'Family units registered',              iconBg: '#dcfce7', iconColor: '#15803d' },
    { icon: Calendar, label: 'Married',         value: stats?.married?.toLocaleString(), sub: `${stats?.single || 0} single members`, iconBg: '#ede9fe', iconColor: '#6d28d9' },
    { icon: Heart,    label: 'Baptised',        value: stats?.total ? Math.round(stats.total * 0.9).toLocaleString() : '—', sub: 'Est. 90% baptised', iconBg: '#fef3c7', iconColor: '#b45309' },
  ]

  return (
    <div className="animate-fade-in" style={{ paddingBottom: 32 }}>

      {/* ── Page header ── */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 12,
        marginBottom: 24,
        paddingBottom: 20,
        borderBottom: '1px solid var(--card-border)',
      }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-1)', fontFamily: "'Outfit', sans-serif", margin: 0, lineHeight: 1.2 }}>
            Dashboard
          </h2>
          <p style={{ fontSize: 12, color: 'var(--text-3)', margin: '3px 0 0' }}>
            Overview &amp; congregation statistics
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <StatusBadge />
          <button onClick={handleRefresh} disabled={loading} className="btn btn-secondary btn-sm">
            <RefreshCw size={13} style={loading ? { animation: 'spin 1s linear infinite' } : {}} />
            Refresh
          </button>
        </div>
      </div>

      {/* ── Info Banner ── */}
      {totalMembersCount > 0 && stats && stats.total < totalMembersCount && (
        <div style={{
          marginBottom: 20, background: 'var(--info-subtle)', border: '1px solid var(--info-border)',
          borderRadius: 10, padding: '11px 16px', display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <Info size={16} color="var(--info)" />
          <p style={{ flex: 1, fontSize: 12, color: 'var(--info)' }}>
            Total: <strong>{totalMembersCount}</strong> · Active: <strong>{stats.total}</strong> · Inactive: <strong>{inactiveMembersCount}</strong>
          </p>
          <button onClick={() => window.location.href = '/members'}
            style={{ fontSize: 12, color: 'var(--info)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>
            Manage →
          </button>
        </div>
      )}

      {/* ── Error Banner ── */}
      {error && (
        <div style={{
          marginBottom: 20, background: 'var(--danger-subtle)', border: '1px solid var(--danger-border)',
          borderRadius: 10, padding: '11px 16px', display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <AlertCircle size={16} color="var(--danger)" />
          <p style={{ flex: 1, fontSize: 12, color: 'var(--danger)' }}>{error}</p>
          <button onClick={handleRefresh} style={{ fontSize: 12, color: 'var(--danger)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>Retry</button>
        </div>
      )}

      {/* ── Stat Cards ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))', gap: 16, marginBottom: 20 }}>
        {STAT_CARDS.map(c => <StatCard key={c.label} {...c} loading={loading} />)}
      </div>

      {/* ── Gender Card ── */}
      <div style={{ marginBottom: 20 }}>
        <GenderCard male={stats?.male || 0} female={stats?.female || 0} total={stats?.total || 0} loading={loading} />
      </div>

      {/* ── Age & Gender + Ministries ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 20, marginBottom: 20 }}>
        <SectionCard accentColor="linear-gradient(135deg,#3b82f6,#1d4ed8)" icon={BarChart3} title="Age & Gender Categorization" subtitle="Member distribution by age group and gender">
          <AgeGroupChart ageGroups={ageGroups} loading={loading} />
        </SectionCard>

        <div className="card" style={{ overflow: 'hidden' }}>
          <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--card-border)', background: 'var(--card-header-bg)', display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 34, height: 34, borderRadius: 9, background: 'linear-gradient(135deg,#a855f7,#7c3aed)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Activity size={16} color="#fff" />
            </div>
            <div>
              <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)' }}>Church Ministries</p>
              <p style={{ fontSize: 11, color: 'var(--text-3)' }}>Participation by activity</p>
            </div>
          </div>
          {activities.length > 0 ? activities.map(act => (
            <div key={act.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 20px', borderBottom: '1px solid var(--table-border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 9, height: 9, borderRadius: 3, background: act.color, flexShrink: 0 }} />
                <span style={{ fontSize: 12, color: 'var(--text-2)', fontWeight: 500 }}>{act.label}</span>
              </div>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#fff', background: act.color, padding: '2px 9px', borderRadius: 99, minWidth: 30, textAlign: 'center' }}>
                {act.count}
              </span>
            </div>
          )) : (
            <p style={{ fontSize: 12, color: 'var(--text-3)', textAlign: 'center', padding: '32px 0' }}>No activity data</p>
          )}
        </div>
      </div>

      {/* ── Area Wise Distribution ── */}
      <div style={{ marginBottom: 20 }}>
        <SectionCard accentColor="linear-gradient(135deg,#10b981,#059669)" icon={MapPin} title="Area Wise Distribution" subtitle="Members by locality / zone">
          <ZonePieChart zones={zones} profile={profile} />
        </SectionCard>
      </div>

      {/* ── Recent Members ── */}
      <div className="card" style={{ overflow: 'hidden' }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--card-border)', background: 'var(--card-header-bg)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 34, height: 34, borderRadius: 9, background: 'linear-gradient(135deg,#14b8a6,#0d9488)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <UserPlus size={16} color="#fff" />
            </div>
            <div>
              <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)' }}>Recently Added Members</p>
              <p style={{ fontSize: 11, color: 'var(--text-3)' }}>Last 8 additions</p>
            </div>
          </div>
          <a href="/members" style={{ fontSize: 12, color: 'var(--accent)', fontWeight: 600, textDecoration: 'none' }}>View all →</a>
        </div>
        {recent.length > 0 ? recent.map((m, idx) => (
          <div key={m.member_id || idx} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '11px 20px', borderBottom: '1px solid var(--table-border)' }}>
            <div style={{
              width: 38, height: 38, borderRadius: '50%', flexShrink: 0,
              background: 'var(--accent-subtle)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 12, fontWeight: 800, color: 'var(--accent)',
            }}>
              {getInitials(m.member_name)}
            </div>
            <div style={{ flex: 1 }}>
              <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)' }}>
                {m.title ? `${m.title} ` : ''}{m.member_name}
              </p>
              <p style={{ fontSize: 11, color: 'var(--text-3)' }}>
                ID: {m.member_id || 'N/A'} · Added {formatDate(m.created_at?.slice(0, 10))}
              </p>
            </div>
            {m.zonal_area && (
              <span style={{ fontSize: 11, background: 'var(--page-bg)', color: 'var(--text-2)', padding: '3px 9px', borderRadius: 99, fontWeight: 500, border: '1px solid var(--card-border)' }}>
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
