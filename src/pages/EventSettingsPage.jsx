/* ═══════════════════════════════════════════════════════════════
   EventSettingsPage.jsx — Settings for the Event Planner
   ═══════════════════════════════════════════════════════════════ */

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Settings, Calendar, ChevronLeft, Check, Globe } from 'lucide-react'
import { useToast } from '../lib/toast'

// ── Country → week start day mapping ─────────────────────────────────────────
// weekStart: 0 = Sunday, 1 = Monday, 6 = Saturday
const COUNTRIES = [
  // Sunday start
  { country: 'India',                weekStart: 0 },
  { country: 'United States',        weekStart: 0 },
  { country: 'Canada',               weekStart: 0 },
  { country: 'Brazil',               weekStart: 0 },
  { country: 'Mexico',               weekStart: 0 },
  { country: 'Japan',                weekStart: 0 },
  { country: 'South Korea',          weekStart: 0 },
  { country: 'Philippines',          weekStart: 0 },
  { country: 'Pakistan',             weekStart: 0 },
  { country: 'Sri Lanka',            weekStart: 0 },
  { country: 'Bangladesh',           weekStart: 0 },
  { country: 'Nepal',                weekStart: 0 },
  { country: 'Myanmar',              weekStart: 0 },
  { country: 'Indonesia',            weekStart: 0 },
  { country: 'Malaysia',             weekStart: 0 },
  { country: 'Singapore',            weekStart: 0 },
  { country: 'Taiwan',               weekStart: 0 },
  { country: 'Hong Kong',            weekStart: 0 },
  { country: 'China',                weekStart: 0 },
  { country: 'Egypt',                weekStart: 0 },
  { country: 'Jordan',               weekStart: 0 },
  { country: 'Israel',               weekStart: 0 },
  // Monday start
  { country: 'Australia',            weekStart: 1 },
  { country: 'New Zealand',          weekStart: 1 },
  { country: 'United Kingdom',       weekStart: 1 },
  { country: 'Germany',              weekStart: 1 },
  { country: 'France',               weekStart: 1 },
  { country: 'Italy',                weekStart: 1 },
  { country: 'Spain',                weekStart: 1 },
  { country: 'Portugal',             weekStart: 1 },
  { country: 'Netherlands',          weekStart: 1 },
  { country: 'Belgium',              weekStart: 1 },
  { country: 'Switzerland',          weekStart: 1 },
  { country: 'Sweden',               weekStart: 1 },
  { country: 'Norway',               weekStart: 1 },
  { country: 'Denmark',              weekStart: 1 },
  { country: 'Finland',              weekStart: 1 },
  { country: 'Poland',               weekStart: 1 },
  { country: 'Russia',               weekStart: 1 },
  { country: 'Ukraine',              weekStart: 1 },
  { country: 'South Africa',         weekStart: 1 },
  { country: 'Nigeria',              weekStart: 1 },
  { country: 'Kenya',                weekStart: 1 },
  { country: 'Ghana',                weekStart: 1 },
  { country: 'Ethiopia',             weekStart: 1 },
  { country: 'Argentina',            weekStart: 1 },
  { country: 'Chile',                weekStart: 1 },
  { country: 'Colombia',             weekStart: 1 },
  // Saturday start (Gulf / Middle East traditional calendar)
  { country: 'United Arab Emirates', weekStart: 6 },
  { country: 'Saudi Arabia',         weekStart: 6 },
  { country: 'Kuwait',               weekStart: 6 },
  { country: 'Qatar',                weekStart: 6 },
  { country: 'Bahrain',              weekStart: 6 },
  { country: 'Oman',                 weekStart: 6 },
  { country: 'Iran',                 weekStart: 6 },
]

// Sorted alphabetically for the dropdown
const COUNTRIES_SORTED = [...COUNTRIES].sort((a, b) => a.country.localeCompare(b.country))

const WEEK_START_OPTIONS = [
  { value: 0, label: 'Sunday',    note: 'India, USA, East Asia'     },
  { value: 1, label: 'Monday',    note: 'Europe, UK, Australia'     },
  { value: 2, label: 'Tuesday',   note: ''                          },
  { value: 3, label: 'Wednesday', note: ''                          },
  { value: 4, label: 'Thursday',  note: ''                          },
  { value: 5, label: 'Friday',    note: ''                          },
  { value: 6, label: 'Saturday',  note: 'UAE, Gulf countries, Iran' },
]

const WS_LABEL = { 0:'Sunday', 1:'Monday', 2:'Tuesday', 3:'Wednesday', 4:'Thursday', 5:'Friday', 6:'Saturday' }

const STORAGE_KEY = 'epSettings'

function loadSettings() {
  try { return { weekStartDay: 0, country: 'India', ...JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') } }
  catch { return { weekStartDay: 0, country: 'India' } }
}

// ── Styles ────────────────────────────────────────────────────────────────────
const card = { background: 'var(--card-bg,#fff)', border: '1px solid var(--card-border,#e2e8f0)', borderRadius: 12, padding: '22px 24px', marginBottom: 18 }
const iSt  = { width: '100%', padding: '9px 11px', borderRadius: 8, border: '1px solid var(--card-border,#e2e8f0)', background: 'var(--input-bg,#f8fafc)', color: 'var(--text-1)', fontSize: 14, outline: 'none', boxSizing: 'border-box' }
const btnP = { padding: '9px 22px', borderRadius: 8, border: 'none', background: 'var(--accent,#2563eb)', color: '#fff', fontWeight: 600, fontSize: 14, cursor: 'pointer' }
const btnS = { padding: '8px 16px', borderRadius: 8, border: '1px solid var(--card-border,#e2e8f0)', background: 'transparent', color: 'var(--text-2)', fontWeight: 500, fontSize: 14, cursor: 'pointer' }

// ── Week Preview strip ────────────────────────────────────────────────────────
function WeekPreview({ weekStart }) {
  const allDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const days = [...allDays.slice(weekStart), ...allDays.slice(0, weekStart)]
  return (
    <div style={{ display: 'flex', gap: 4, marginTop: 12 }}>
      {days.map((d, i) => {
        const isStart = i === 0
        return (
          <div key={i} style={{
            flex: 1, textAlign: 'center', padding: '8px 2px', borderRadius: 6,
            background: isStart ? 'rgba(239,68,68,0.08)' : 'var(--input-bg,#f1f5f9)',
            border: `1px solid ${isStart ? 'rgba(239,68,68,0.25)' : 'transparent'}`,
          }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: isStart ? '#ef4444' : 'var(--text-2)' }}>{d}</div>
            {isStart && <div style={{ fontSize: 9, color: '#ef4444', marginTop: 1 }}>Start</div>}
          </div>
        )
      })}
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function EventSettingsPage() {
  const navigate = useNavigate()
  const toast    = useToast()
  const [form, setForm]   = useState(loadSettings)
  const [saved, setSaved] = useState(false)

  function handleCountryChange(country) {
    const match = COUNTRIES.find(c => c.country === country)
    setForm(f => ({ ...f, country, weekStartDay: match ? match.weekStart : f.weekStartDay }))
    setSaved(false)
  }

  function handleWeekStartChange(v) {
    setForm(f => ({ ...f, weekStartDay: parseInt(v) }))
    setSaved(false)
  }

  function handleSave() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(form))
    setSaved(true)
    toast('Event settings saved', 'success')
  }

  const selectedOpt = WEEK_START_OPTIONS.find(o => o.value === form.weekStartDay)

  return (
    <div style={{ maxWidth: 680, margin: '0 auto', padding: '28px 24px' }}>

      {/* Page header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 26 }}>
        <button onClick={() => navigate('/events/planner')}
          style={{ ...btnS, display: 'flex', alignItems: 'center', gap: 6, padding: '7px 13px' }}>
          <ChevronLeft size={15} /> Event Planner
        </button>
        <div style={{ width: 1, height: 22, background: 'var(--card-border,#e2e8f0)' }} />
        <Settings size={20} color="var(--accent,#2563eb)" />
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: 'var(--text-1)' }}>Event Settings</h1>
      </div>

      {/* ── Calendar section ──────────────────────────────────── */}
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 20 }}>
          <Calendar size={17} color="var(--accent,#2563eb)" />
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--text-1)' }}>Calendar</h2>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>

          {/* Country */}
          <div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
              <Globe size={11} /> Country / Region
            </label>
            <select value={form.country || ''} onChange={e => handleCountryChange(e.target.value)} style={iSt}>
              <option value="">— Select country —</option>
              {COUNTRIES_SORTED.map(c => (
                <option key={c.country} value={c.country}>{c.country}</option>
              ))}
            </select>
          </div>

          {/* Week Starts On */}
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6, display: 'block' }}>
              Week Starts On
            </label>
            <select value={form.weekStartDay} onChange={e => handleWeekStartChange(e.target.value)} style={iSt}>
              {WEEK_START_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}{o.note ? ` — ${o.note}` : ''}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Hint row */}
        {form.country && (
          <p style={{ margin: '0 0 16px', fontSize: 12, color: 'var(--text-3)' }}>
            <strong>{form.country}</strong> calendar convention: week starts on <strong>{WS_LABEL[form.weekStartDay]}</strong>.
            You can override the day above if needed.
          </p>
        )}

        {/* Preview */}
        <div style={{ background: 'var(--input-bg,#f8fafc)', borderRadius: 8, padding: '14px 14px 12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Calendar Preview
            </span>
            {selectedOpt && (
              <span style={{ fontSize: 11, color: 'var(--accent,#2563eb)', fontWeight: 600 }}>
                Starts {selectedOpt.label}
              </span>
            )}
          </div>
          <WeekPreview weekStart={form.weekStartDay} />
          <p style={{ margin: '10px 0 0', fontSize: 11, color: '#ef4444', fontWeight: 500 }}>
            The week start day is highlighted in red across all calendar views.
          </p>
        </div>
      </div>

      {/* Save row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button style={btnP} onClick={handleSave}>Save Settings</button>
        <button style={btnS} onClick={() => navigate('/events/planner')}>Cancel</button>
        {saved && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 13, color: '#16a34a', fontWeight: 500 }}>
            <Check size={14} /> Saved
          </span>
        )}
      </div>

    </div>
  )
}
