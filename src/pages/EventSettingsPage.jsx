/* ═══════════════════════════════════════════════════════════════
   EventSettingsPage.jsx — Settings for the Event Planner
   ═══════════════════════════════════════════════════════════════ */

import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Settings, Calendar, ChevronLeft, ChevronDown, Check, Globe, Download, UploadCloud, Trash2, Plus, Pencil } from 'lucide-react'
import { useAuth } from '../lib/AuthContext'
import { useToast } from '../lib/toast'
import {
  getEventPlannerMasterData,
  downloadEventPlannerMasterData,
  downloadEventPlannerMasterTemplate,
  readAndParseEventPlannerMasterFile,
  importEventPlannerMasterData,
  getTaskLibrary,
  updateLibraryItemName,
  deleteLibraryItem,
  saveLibraryTask,
  addLibraryCategory,
  addLibrarySubtask,
  getEventVolunteers,
  saveEventVolunteer,
  deleteEventVolunteer,
  searchMemberContactsByName,
  downloadEventPlannerVolunteersTemplate,
  downloadEventPlannerVolunteersData,
  readAndParseVolunteersFile,
  importEventPlannerVolunteers,
} from '../lib/eventPlannerLib'
import { normalizeWhatsAppNumber } from '../lib/whatsapp'

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
  const { profile } = useAuth()
  const [tab, setTab] = useState('settings')
  const [form, setForm]   = useState(loadSettings)
  const [saved, setSaved] = useState(false)
  const [importError, setImportError] = useState('')
  const [importing, setImporting] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [libraryTasks, setLibraryTasks] = useState([])
  const [loadingLibrary, setLoadingLibrary] = useState(false)
  const [librarySaving, setLibrarySaving] = useState(false)
  const [libraryFormType, setLibraryFormType] = useState('category')
  const [libraryFormCategory, setLibraryFormCategory] = useState('')
  const [libraryFormName, setLibraryFormName] = useState('New Category')
  const [collapsedCategories, setCollapsedCategories] = useState(new Set())
  const [volunteers, setVolunteers] = useState([])
  const [loadingVolunteers, setLoadingVolunteers] = useState(false)
  const [volunteerSaving, setVolunteerSaving] = useState(false)
  const [volunteerFormName, setVolunteerFormName] = useState('')
  const [volunteerFormRole, setVolunteerFormRole] = useState('')
  const [volunteerFormWhatsApp, setVolunteerFormWhatsApp] = useState('')
  const [volunteerLookupLoading, setVolunteerLookupLoading] = useState(false)
  const [memberSuggestions, setMemberSuggestions] = useState([])
  const [volunteerExporting, setVolunteerExporting] = useState(false)
  const [volunteerImporting, setVolunteerImporting] = useState(false)
  const volunteerImportRef = useRef(null)
  const volunteerLookupTimer = useRef(null)
  const libraryFormNameRef = useRef(null)
  const importInputRef = useRef(null)
  const libraryCategories = Array.from(new Set(libraryTasks.map(t => t.category?.trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b))

  useEffect(() => {
    loadMasterData()
    loadVolunteerData()
  }, [])

  useEffect(() => {
    if (libraryCategories.length && !libraryFormCategory) {
      setLibraryFormCategory(libraryCategories[0])
    }
  }, [libraryCategories, libraryFormCategory])

  async function loadMasterData() {
    setLoadingLibrary(true)
    try {
      const tasks = await getTaskLibrary()
      setLibraryTasks(tasks || [])
    } catch (err) {
      console.error(err)
      toast('Failed to load library data', 'error')
    } finally {
      setLoadingLibrary(false)
    }
  }

  function updateLibraryTaskValue(id, field, value) {
    setLibraryTasks(prev => prev.map(task => task.id === id ? { ...task, [field]: value } : task))
  }

  function updateVolunteerValue(id, field, value) {
    setVolunteers(prev => prev.map(item => {
      if (item.id !== id) return item
      if (field === 'name' && !String(value || '').trim()) {
        return { ...item, name: value, role: '', whatsapp: '' }
      }
      return { ...item, [field]: value }
    }))
  }

  async function handleSaveLibraryTaskInline(id, field, value) {
    if (!value.trim()) {
      toast('Field cannot be blank', 'error')
      return
    }
    setLibrarySaving(true)
    try {
      await saveLibraryTask(id, { [field]: value.trim() }, profile?.email)
      await loadMasterData()
      toast('Saved', 'success')
    } catch (err) {
      console.error(err)
      toast('Failed to save', 'error')
    } finally {
      setLibrarySaving(false)
    }
  }

  async function loadVolunteerData() {
    setLoadingVolunteers(true)
    try {
      const data = await getEventVolunteers()
      setVolunteers(data || [])
    } catch (err) {
      console.error(err)
      toast('Failed to load volunteers', 'error')
    } finally {
      setLoadingVolunteers(false)
    }
  }

  async function lookupVolunteerByName(name) {
    if (!name.trim()) return
    setVolunteerLookupLoading(true)
    try {
      const members = await searchMemberContactsByName(name)
      setMemberSuggestions(members || [])
      if (members?.length) {
        const exactMatch = members.find(m => String(m.member_name || '').trim().toLowerCase() === name.trim().toLowerCase())
        const chosen = exactMatch || members[0]
        if (chosen?.whatsapp) {
          setVolunteerFormWhatsApp(chosen.whatsapp)
        } else if (chosen?.mobile) {
          setVolunteerFormWhatsApp(chosen.mobile)
        }
      }
    } catch (err) {
      console.warn('Volunteer lookup failed', err)
    } finally {
      setVolunteerLookupLoading(false)
    }
  }

  function scheduleVolunteerLookup(name) {
    if (volunteerLookupTimer.current) {
      clearTimeout(volunteerLookupTimer.current)
    }
    if (!name.trim()) {
      setMemberSuggestions([])
      return
    }
    volunteerLookupTimer.current = setTimeout(() => lookupVolunteerByName(name), 320)
  }

  function handleSelectVolunteerSuggestion(member) {
    const memberName = String(member.member_name || '').trim()
    setVolunteerFormName(memberName)
    setVolunteerFormWhatsApp(member.whatsapp || member.mobile || '')
    setMemberSuggestions([])
  }

  async function handleSaveVolunteerInline(id, field, value) {
    if (field === 'name' && !value.trim()) {
      toast('Name cannot be blank', 'error')
      return
    }
    setVolunteerSaving(true)
    try {
      const payload = field === 'whatsapp'
        ? { whatsapp: normalizeWhatsAppNumber(value.trim() || '', { provider: 'soft7' }) || null }
        : { [field]: value.trim() || null }
      await saveEventVolunteer(id, payload, profile?.email)
      await loadVolunteerData()
      toast('Saved', 'success')
    } catch (err) {
      console.error(err)
      toast('Failed to save volunteer', 'error')
    } finally {
      setVolunteerSaving(false)
    }
  }

  async function handleAddVolunteer() {
    const name = volunteerFormName.trim()
    if (!name) {
      toast('Name cannot be blank', 'error')
      return
    }
    setVolunteerSaving(true)
    try {
      await saveEventVolunteer(null, {
        name,
        role: volunteerFormRole.trim() || null,
        whatsapp: normalizeWhatsAppNumber(volunteerFormWhatsApp.trim() || '', { provider: 'soft7' }) || null,
        sort_order: volunteers.length
      }, profile?.email)
      await loadVolunteerData()
      setVolunteerFormName('')
      setVolunteerFormRole('')
      setVolunteerFormWhatsApp('')
      toast('Added volunteer', 'success')
    } catch (err) {
      console.error(err)
      toast('Failed to add volunteer', 'error')
    } finally {
      setVolunteerSaving(false)
    }
  }

  async function handleDeleteVolunteer(id) {
    if (!window.confirm('Delete this volunteer?')) return
    setVolunteerSaving(true)
    try {
      await deleteEventVolunteer(id)
      await loadVolunteerData()
      toast('Deleted', 'success')
    } catch (err) {
      console.error(err)
      toast('Failed to delete volunteer', 'error')
    } finally {
      setVolunteerSaving(false)
    }
  }

  function focusVolunteerNameInput(id) {
    const el = document.getElementById(`volunteer-name-${id}`)
    if (el) el.focus()
  }

  function focusLibraryCategoryInput(id) {
    const el = document.getElementById(`library-category-${id}`)
    if (el) el.focus()
  }

  async function handleAddLibraryEntry() {
    const name = libraryFormName.trim()
    if (!name) {
      toast('Name cannot be blank', 'error')
      return
    }
    if (libraryFormType === 'subcategory' && !libraryFormCategory.trim()) {
      toast('Please select a parent category', 'error')
      return
    }

    setLibrarySaving(true)
    try {
      const maxSort = Math.max(0, ...libraryTasks.map(t => t.sort_order || 0))
      if (libraryFormType === 'category') {
        // create a single category row via addLibraryCategory then update its name
        const newId = await addLibraryCategory(profile?.email)
        await saveLibraryTask(newId, { category: name, subcategory: null, sort_order: maxSort + 1 }, profile?.email)
        await loadMasterData()
        setLibraryFormName('New Category')
        toast('Added category', 'success')
      } else {
        const payload = {
          category: libraryFormCategory,
          subcategory: name,
          sort_order: maxSort + 1,
        }
        await saveLibraryTask(null, payload, profile?.email)
        await loadMasterData()
        setLibraryFormName('New Subcategory')
        toast('Added subcategory', 'success')
      }
    } catch (err) {
      console.error(err)
      toast('Failed to add library item', 'error')
    } finally {
      setLibrarySaving(false)
    }
  }

  async function handleDeleteLibraryTask(id) {
    if (!window.confirm('Delete this row?')) return
    setLibrarySaving(true)
    try {
      await deleteLibraryItem(id)
      await loadMasterData()
      toast('Deleted', 'success')
    } catch (err) {
      console.error(err)
      toast('Failed to delete', 'error')
    } finally {
      setLibrarySaving(false)
    }
  }

  async function handleDeleteCategory(category) {
    if (!window.confirm(`Delete all items in category "${category}"?`)) return
    setLibrarySaving(true)
    try {
      const ids = libraryTasks.filter(t => t.category === category).map(t => t.id).filter(Boolean)
      await Promise.all(ids.map(id => deleteLibraryItem(id)))
      await loadMasterData()
      toast('Deleted category', 'success')
    } catch (err) {
      console.error(err)
      toast('Failed to delete category', 'error')
    } finally {
      setLibrarySaving(false)
    }
  }

  async function handleExportMasterData() {
    setExporting(true)
    try {
      await downloadEventPlannerMasterData()
      toast('Master data export ready', 'success')
    } catch (err) {
      console.error(err)
      toast('Failed to export master data', 'error')
    } finally {
      setExporting(false)
    }
  }

  async function handleDownloadTemplate() {
    setExporting(true)
    try {
      await downloadEventPlannerMasterTemplate()
      toast('Template download ready', 'success')
    } catch (err) {
      console.error(err)
      toast('Failed to download template', 'error')
    } finally {
      setExporting(false)
    }
  }

  async function handleImportMasterData(file) {
    setImportError('')
    if (!file) return
    setImporting(true)
    try {
      const parsed = await readAndParseEventPlannerMasterFile(file)
      if (!parsed.valid) {
        setImportError(parsed.errors.join(' '))
        toast('Failed to import master data', 'error')
        return
      }
      await importEventPlannerMasterData(parsed, profile?.email || null)
      toast('Imported master data successfully', 'success')
      await loadMasterData()
    } catch (err) {
      console.error(err)
      setImportError('Invalid Excel file or unsupported format.')
      toast('Failed to import master data', 'error')
    } finally {
      setImporting(false)
    }
  }

  async function handleDownloadVolunteerTemplate() {
    setVolunteerExporting(true)
    try {
      await downloadEventPlannerVolunteersTemplate()
      toast('Volunteer template download ready', 'success')
    } catch (err) {
      console.error(err)
      toast('Failed to download volunteer template', 'error')
    } finally { setVolunteerExporting(false) }
  }

  async function handleExportVolunteerData() {
    setVolunteerExporting(true)
    try {
      await downloadEventPlannerVolunteersData()
      toast('Volunteer data export ready', 'success')
    } catch (err) {
      console.error(err)
      toast('Failed to export volunteer data', 'error')
    } finally { setVolunteerExporting(false) }
  }

  async function handleImportVolunteerData(file) {
    if (!file) return
    setVolunteerImporting(true)
    try {
      const parsed = await readAndParseVolunteersFile(file)
      if (!parsed.valid) {
        toast(parsed.errors.join(' '),'error')
        return
      }
      await importEventPlannerVolunteers(parsed.volunteers || [], profile?.email)
      toast('Imported volunteers successfully', 'success')
      await loadVolunteerData()
    } catch (err) {
      console.error(err)
      toast('Failed to import volunteers', 'error')
    } finally { setVolunteerImporting(false) }
  }

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
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '28px 24px' }}>

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

      {/* Tab Navigation */}
      <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--card-border,#e2e8f0)', marginBottom: 28 }}>
        {['settings', 'library', 'volunteers'].map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              padding: '12px 20px',
              border: 'none',
              borderBottom: tab === t ? '3px solid var(--sidebar-bg, #1e293b)' : '3px solid transparent',
              background: tab === t ? 'var(--sidebar-bg, #1e293b)' : 'transparent',
              color: tab === t ? '#fff' : 'var(--text-2)',
              fontWeight: tab === t ? 700 : 500,
              fontSize: 14,
              cursor: 'pointer',
              textTransform: 'capitalize',
              transition: 'all 0.2s ease',
              borderRadius: tab === t ? '6px 6px 0 0' : '0',
            }}
          >
            {t}
          </button>
        ))}
      </div>

      {/* ──────────────────────────────────────────────────────────────────────── */}
      {/* LIBRARY TAB */}
      {/* ──────────────────────────────────────────────────────────────────────── */}
      {tab === 'library' && (
        <div>
          <div style={{ marginBottom: 20 }}>
            <h2 style={{ margin: '0 0 12px', fontSize: 16, fontWeight: 700, color: 'var(--text-1)' }}>Library</h2>
            <p style={{ margin: 0, fontSize: 13, color: 'var(--text-3)' }}>Manage task templates with Category and Subcategory columns.</p>
          </div>

          <div style={{ marginBottom: 12, display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
            <button
              style={{ padding: '7px 14px', borderRadius: 6, border: 'none', background: '#0ea5e9', color: '#fff', fontWeight: 500, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
              onClick={handleDownloadTemplate}
              disabled={exporting}
              title="Download template"
            >
              <Download size={13} /> {exporting ? 'Downloading…' : 'Download Template'}
            </button>
            <button
              style={{ padding: '7px 14px', borderRadius: 6, border: 'none', background: '#8b5cf6', color: '#fff', fontWeight: 500, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
              onClick={handleExportMasterData}
              disabled={exporting}
              title="Export data"
            >
              <Download size={13} /> {exporting ? 'Exporting…' : 'Export Data'}
            </button>
            <button
              style={{ padding: '7px 14px', borderRadius: 6, border: 'none', background: '#10b981', color: '#fff', fontWeight: 500, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
              onClick={() => importInputRef.current?.click()}
              disabled={importing}
              title="Import template"
            >
              <UploadCloud size={13} /> {importing ? 'Importing…' : 'Import Template'}
            </button>
            <input
              ref={importInputRef}
              type="file"
              accept=".xlsx,.xls"
              style={{ display: 'none' }}
              onChange={e => handleImportMasterData(e.target.files?.[0])}
              disabled={importing}
            />
          </div>

          <div style={{ marginBottom: 16, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <div style={{ width: '100%', borderRadius: 12, border: '1px solid var(--card-border,#e2e8f0)', background: 'var(--input-bg,#f8fafc)', padding: 16, display: 'grid', gap: 12 }}>
              {/* (Removed top toggle) */}

              <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                  <input type="radio" name="library-form-type" value="category" checked={libraryFormType === 'category'} onChange={() => { setLibraryFormType('category'); setLibraryFormName('New Category') }} />
                  <span style={{ fontSize: 14, color: 'var(--text-1)' }}>Category</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                  <input type="radio" name="library-form-type" value="subcategory" checked={libraryFormType === 'subcategory'} onChange={() => { setLibraryFormType('subcategory'); setLibraryFormName('New Subcategory') }} />
                  <span style={{ fontSize: 14, color: 'var(--text-1)' }}>Subcategory</span>
                </label>
              </div>

              {libraryFormType === 'subcategory' && (
                <select value={libraryFormCategory} onChange={e => setLibraryFormCategory(e.target.value)} style={iSt}>
                  {libraryCategories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                </select>
              )}

              <input
                id="library-add-name"
                ref={libraryFormNameRef}
                value={libraryFormName}
                onChange={e => setLibraryFormName(e.target.value)}
                style={iSt}
                placeholder={libraryFormType === 'category' ? 'Category name' : 'Subcategory name'}
              />

              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button onClick={handleAddLibraryEntry} disabled={librarySaving || (libraryFormType === 'subcategory' && libraryCategories.length === 0)} style={{ ...btnP, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Plus size={16} />
                  {librarySaving ? 'Adding…' : 'Add ' + (libraryFormType === 'category' ? 'Category' : 'Subcategory')}
                </button>
              </div>
            </div>
          </div>
          {importError && <p style={{ margin: '0 0 16px', color: '#dc2626', fontSize: 12 }}>{importError}</p>}

          {/* Two-column table with scroll and collapse */}
          <div style={{ borderRadius: 8, overflow: 'hidden', border: '1px solid var(--card-border,#e2e8f0)', display: 'flex', flexDirection: 'column', maxHeight: 700 }}>
            {/* Header */}
            <div style={{ display: 'grid', gridTemplateColumns: '45px 1fr 1fr 100px', background: 'var(--input-bg,#f8fafc)', borderBottom: '2px solid var(--card-border,#e2e8f0)', position: 'sticky', top: 0, zIndex: 10 }}>
              <div style={{ padding: '12px 8px', fontWeight: 700, fontSize: 12, color: '#fff', background: '#4a5568', textAlign: 'center', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                <button
                  onClick={() => setCollapsedCategories(collapsedCategories.size === libraryCategories.length ? new Set() : new Set(libraryCategories))}
                  title={collapsedCategories.size === libraryCategories.length ? 'Expand all' : 'Collapse all'}
                  style={{ border: 'none', background: 'transparent', color: '#fff', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', padding: 0 }}
                >
                  <ChevronDown size={16} style={{ transform: collapsedCategories.size === libraryCategories.length ? 'rotate(-90deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }} />
                </button>
              </div>
              <div style={{ padding: '12px 16px', fontWeight: 700, fontSize: 12, color: '#fff', background: '#4a5568' }}>Category</div>
              <div style={{ padding: '12px 16px', fontWeight: 700, fontSize: 12, color: '#fff', background: '#4a5568' }}>Subcategory</div>
              <div style={{ padding: '12px 16px', fontWeight: 700, fontSize: 12, color: '#fff', background: '#4a5568', textAlign: 'center' }}>Action</div>
            </div>

            {/* Rows with scrollbar */}
            <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>
              {loadingLibrary ? (
                <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-3)' }}>Loading...</div>
              ) : libraryTasks.length === 0 ? (
                <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-3)' }}>No items yet. Click "Add Category" to start.</div>
              ) : (
                libraryCategories.map((category) => {
                  const isCollapsed = collapsedCategories.has(category)
                  const categoryTasks = [...libraryTasks].filter(t => t.category === category)
                  const categoryItems = categoryTasks
                    .filter(t => t.subcategory != null && t.subcategory !== '')
                    .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
                  
                  return (
                    <div key={`cat-${category}`}>
                      {/* Category Header Row */}
                      <div style={{
                        display: 'grid',
                        gridTemplateColumns: '45px 1fr 1fr 60px',
                        borderBottom: '1px solid var(--card-border,#e2e8f0)',
                        background: '#f0f4f8',
                        fontWeight: 600,
                      }}>
                        <button
                          style={{
                            border: 'none',
                            background: 'transparent',
                            color: '#4a5568',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            padding: '12px 8px',
                          }}
                          onClick={() => {
                            const newCollapsed = new Set(collapsedCategories)
                            if (isCollapsed) newCollapsed.delete(category)
                            else newCollapsed.add(category)
                            setCollapsedCategories(newCollapsed)
                          }}
                          title={isCollapsed ? 'Expand' : 'Collapse'}
                        >
                          <ChevronDown size={18} style={{ transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }} />
                        </button>
                        <div style={{ padding: '12px 16px', color: '#4a5568' }}>{category}</div>
                        <div style={{ padding: '12px 16px', color: '#999', fontSize: 13 }}>({categoryItems.length} item{categoryItems.length !== 1 ? 's' : ''})</div>
                        <div style={{ padding: '12px 16px', textAlign: 'center' }}>
                          <button
                            onClick={() => handleDeleteCategory(category)}
                            disabled={librarySaving}
                            title="Delete category"
                            style={{ border: 'none', background: 'transparent', color: '#ef4444', cursor: 'pointer' }}
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>

                      {/* Category Items */}
                      {!isCollapsed && categoryItems.map((task, idx) => (
                        <div key={task.id} style={{
                          display: 'grid',
                          gridTemplateColumns: '45px 1fr 1fr 100px',
                          borderBottom: '1px solid var(--card-border,#e2e8f0)',
                          background: idx % 2 === 0 ? 'transparent' : 'var(--input-bg,#f8fafc)'
                        }}>
                          <div style={{ padding: '12px 8px' }}></div>
                          <input
                            id={`library-category-${task.id}`}
                            style={{ ...iSt, border: 'none', borderRadius: 0, background: 'transparent', padding: '12px 16px' }}
                            value={task.category || ''}
                            onChange={e => updateLibraryTaskValue(task.id, 'category', e.target.value)}
                            onBlur={e => handleSaveLibraryTaskInline(task.id, 'category', e.target.value)}
                            disabled={librarySaving}
                          />
                          <input
                            style={{ ...iSt, border: 'none', borderRadius: 0, background: 'transparent', padding: '12px 16px', borderLeft: '1px solid var(--card-border,#e2e8f0)' }}
                            value={task.subcategory || ''}
                            onChange={e => updateLibraryTaskValue(task.id, 'subcategory', e.target.value)}
                            onBlur={e => handleSaveLibraryTaskInline(task.id, 'subcategory', e.target.value)}
                            disabled={librarySaving}
                          />
                          <div style={{ display: 'flex', justifyContent: 'center', gap: 4, alignItems: 'center', borderLeft: '1px solid var(--card-border,#e2e8f0)' }}>
                            <button
                              style={{
                                border: 'none',
                                background: 'transparent',
                                color: 'var(--text-2)',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                padding: 8,
                              }}
                              onClick={() => focusLibraryCategoryInput(task.id)}
                              disabled={librarySaving}
                              title="Edit row"
                            >
                              <Pencil size={16} />
                            </button>
                            <button
                              style={{
                                border: 'none',
                                background: 'transparent',
                                color: '#ef4444',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                padding: 8,
                              }}
                              onClick={() => handleDeleteLibraryTask(task.id)}
                              disabled={librarySaving}
                              title="Delete row"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* ──────────────────────────────────────────────────────────────────────── */}
      {/* SETTINGS TAB */}
      {/* ──────────────────────────────────────────────────────────────────────── */}
      {tab === 'settings' && (
        <div>
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
      )}

      {/* ──────────────────────────────────────────────────────────────────────── */}
      {/* VOLUNTEERS TAB */}
      {/* ──────────────────────────────────────────────────────────────────────── */}
      {tab === 'volunteers' && (
        <div>
          <div style={{ marginBottom: 20 }}>
            <h2 style={{ margin: '0 0 12px', fontSize: 16, fontWeight: 700, color: 'var(--text-1)' }}>Volunteers</h2>
            <p style={{ margin: 0, fontSize: 13, color: 'var(--text-3)' }}>Manage volunteers with Name, Role, and WhatsApp number.</p>
          </div>

          <div style={{ marginBottom: 12, display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
            <button
              style={{ padding: '7px 14px', borderRadius: 6, border: 'none', background: '#0ea5e9', color: '#fff', fontWeight: 500, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
              onClick={handleDownloadVolunteerTemplate}
              disabled={volunteerExporting}
              title="Download volunteer template"
            >
              <Download size={13} /> {volunteerExporting ? 'Downloading…' : 'Download Template'}
            </button>
            <button
              style={{ padding: '7px 14px', borderRadius: 6, border: 'none', background: '#8b5cf6', color: '#fff', fontWeight: 500, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
              onClick={handleExportVolunteerData}
              disabled={volunteerExporting}
              title="Export volunteer data"
            >
              <Download size={13} /> {volunteerExporting ? 'Exporting…' : 'Export Data'}
            </button>
            <button
              style={{ padding: '7px 14px', borderRadius: 6, border: 'none', background: '#10b981', color: '#fff', fontWeight: 500, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
              onClick={() => volunteerImportRef.current?.click()}
              disabled={volunteerImporting}
              title="Import volunteer template"
            >
              <UploadCloud size={13} /> {volunteerImporting ? 'Importing…' : 'Import Template'}
            </button>
            <input
              ref={volunteerImportRef}
              type="file"
              accept=".xlsx,.xls"
              style={{ display: 'none' }}
              onChange={e => handleImportVolunteerData(e.target.files?.[0])}
              disabled={volunteerImporting}
            />
          </div>

          <div style={{ marginBottom: 16, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <div style={{ width: '100%', borderRadius: 12, border: '1px solid var(--card-border,#e2e8f0)', background: 'var(--input-bg,#f8fafc)', padding: 16, display: 'grid', gap: 12 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-1)' }}>Add Volunteer</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr 1fr', gap: 12, alignItems: 'start' }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--text-3)', marginBottom: 6 }}>Name</label>
                  <input
                    value={volunteerFormName}
                    onChange={e => {
                      const v = e.target.value
                      setVolunteerFormName(v)
                      if (!v.trim()) {
                        setVolunteerFormWhatsApp('')
                        setVolunteerFormRole('')
                        setMemberSuggestions([])
                        return
                      }
                      scheduleVolunteerLookup(v)
                    }}
                    style={iSt}
                    placeholder="Volunteer name"
                  />
                  {memberSuggestions.length > 0 && (
                    <div style={{ position: 'relative' }}>
                      <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20, background: '#fff', border: '1px solid var(--card-border,#e2e8f0)', borderRadius: 8, marginTop: 6, boxShadow: '0 10px 20px rgba(0,0,0,0.08)' }}>
                        {memberSuggestions.map(member => (
                          <button
                            key={member.member_name + (member.whatsapp || member.mobile || '')}
                            type="button"
                            onClick={() => handleSelectVolunteerSuggestion(member)}
                            style={{
                              width: '100%', textAlign: 'left', padding: '10px 12px', border: 'none', background: 'transparent', cursor: 'pointer',
                              fontSize: 13, color: 'var(--text-1)'
                            }}
                          >
                            <div style={{ fontWeight: 600 }}>{member.member_name}</div>
                            <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>{member.whatsapp || member.mobile || 'No contact'}</div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--text-3)', marginBottom: 6 }}>Role</label>
                  <input
                    value={volunteerFormRole}
                    onChange={e => setVolunteerFormRole(e.target.value)}
                    style={iSt}
                    placeholder="Role (optional)"
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--text-3)', marginBottom: 6 }}>WhatsApp Number</label>
                  <input
                    value={volunteerFormWhatsApp}
                    onChange={e => setVolunteerFormWhatsApp(e.target.value)}
                    style={iSt}
                    placeholder="917708252929"
                  />
                  <div style={{ minHeight: 18, marginTop: 4, fontSize: 11, color: 'var(--text-3)' }}>
                    {volunteerLookupLoading ? 'Looking up WhatsApp...' : '\u00A0'}
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button
                  onClick={handleAddVolunteer}
                  disabled={volunteerSaving}
                  style={{ ...btnP, display: 'flex', alignItems: 'center', gap: 6 }}
                >
                  <Plus size={16} />
                  {volunteerSaving ? 'Adding…' : 'Add Volunteer'}
                </button>
              </div>
            </div>
          </div>

          <div style={{ borderRadius: 8, overflow: 'hidden', border: '1px solid var(--card-border,#e2e8f0)', display: 'flex', flexDirection: 'column', maxHeight: 700 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 100px', background: 'var(--input-bg,#f8fafc)', borderBottom: '2px solid var(--card-border,#e2e8f0)', position: 'sticky', top: 0, zIndex: 10 }}>
              <div style={{ padding: '12px 16px', fontWeight: 700, fontSize: 12, color: '#fff', background: '#4a5568' }}>Name</div>
              <div style={{ padding: '12px 16px', fontWeight: 700, fontSize: 12, color: '#fff', background: '#4a5568' }}>Role</div>
              <div style={{ padding: '12px 16px', fontWeight: 700, fontSize: 12, color: '#fff', background: '#4a5568' }}>WhatsApp</div>
              <div style={{ padding: '12px 16px', fontWeight: 700, fontSize: 12, color: '#fff', background: '#4a5568', textAlign: 'center' }}>Action</div>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>
              {loadingVolunteers ? (
                <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-3)' }}>Loading...</div>
              ) : volunteers.length === 0 ? (
                <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-3)' }}>No volunteers yet. Add a volunteer to start.</div>
              ) : (
                volunteers.map((volunteer, idx) => (
                  <div key={volunteer.id} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 100px', borderBottom: '1px solid var(--card-border,#e2e8f0)', background: idx % 2 === 0 ? 'transparent' : 'var(--input-bg,#f8fafc)' }}>
                    <input
                      id={`volunteer-name-${volunteer.id}`}
                      style={{ ...iSt, border: 'none', borderRadius: 0, background: 'transparent', padding: '12px 16px' }}
                      value={volunteer.name || ''}
                      onChange={e => updateVolunteerValue(volunteer.id, 'name', e.target.value)}
                      onBlur={e => handleSaveVolunteerInline(volunteer.id, 'name', e.target.value)}
                      disabled={volunteerSaving}
                    />
                    <input
                      style={{ ...iSt, border: 'none', borderRadius: 0, background: 'transparent', padding: '12px 16px' }}
                      value={volunteer.role || ''}
                      onChange={e => updateVolunteerValue(volunteer.id, 'role', e.target.value)}
                      onBlur={e => handleSaveVolunteerInline(volunteer.id, 'role', e.target.value)}
                      disabled={volunteerSaving}
                    />
                    <input
                      style={{ ...iSt, border: 'none', borderRadius: 0, background: 'transparent', padding: '12px 16px' }}
                      value={volunteer.whatsapp || ''}
                      onChange={e => updateVolunteerValue(volunteer.id, 'whatsapp', e.target.value)}
                      onBlur={e => handleSaveVolunteerInline(volunteer.id, 'whatsapp', e.target.value)}
                      disabled={volunteerSaving}
                    />
                    <div style={{ display: 'flex', justifyContent: 'center', gap: 4, alignItems: 'center', borderLeft: '1px solid var(--card-border,#e2e8f0)' }}>
                      <button
                        style={{
                          border: 'none',
                          background: 'transparent',
                          color: 'var(--text-2)',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          padding: 8,
                        }}
                        onClick={() => focusVolunteerNameInput(volunteer.id)}
                        disabled={volunteerSaving}
                        title="Edit volunteer"
                      >
                        <Pencil size={16} />
                      </button>
                      <button
                        style={{
                          border: 'none',
                          background: 'transparent',
                          color: '#ef4444',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          padding: 8,
                        }}
                        onClick={() => handleDeleteVolunteer(volunteer.id)}
                        disabled={volunteerSaving}
                        title="Delete volunteer"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
