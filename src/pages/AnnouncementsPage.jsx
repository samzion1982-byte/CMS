/* ═══════════════════════════════════════════════════════════════
   AnnouncementsPage.jsx — Birthdays, Anniversaries, Reports, Settings
   ═══════════════════════════════════════════════════════════════ */

import { useState, useEffect, useCallback, useRef } from 'react'
import { jsPDF } from 'jspdf'
import * as XLSX from 'xlsx'
import { useAuth } from '../lib/AuthContext'
import { getPerms } from '../lib/auth'
import { useToast } from '../lib/toast'
import { supabase } from '../lib/supabase'
import { sendWhatsAppMessage } from '../lib/whatsapp'
import { generateGreetingCard } from '../lib/greetingCard'
import {
  getUpcomingBirthdays, getUpcomingAnniversaries,
  getBirthdaysInRange, getAnniversariesInRange,
  getBibleVerses, saveBibleVerse, deleteBibleVerse, toggleVerseActive,
  getRandomVerse, getAnnouncementSettings, saveAnnouncementSettings,
  logAnnouncement, uploadToStorage, getNextWeekRange, bulkUpsertVerses,
} from '../lib/announcements'
import {
  Megaphone, Cake, Heart, BookOpen, Settings, Loader2,
  Send, CheckCircle, XCircle, Plus, Pencil, Trash2,
  FileDown, ToggleLeft, ToggleRight, Eye, Upload, Download,
} from 'lucide-react'

const TABS = [
  { key: 'dashboard', label: 'Dashboard',    icon: Megaphone },
  { key: 'reports',   label: 'Reports',      icon: FileDown  },
  { key: 'verses',    label: 'Bible Verses', icon: BookOpen  },
  { key: 'settings',  label: 'Settings',     icon: Settings  },
]

const fmtDate = iso => {
  if (!iso) return ''
  const [y, m, d] = iso.split('-')
  return `${d}-${m}-${y}`
}
const fmtDayDate = (iso, dayName) => `${dayName}, ${fmtDate(iso)}`

export default function AnnouncementsPage() {
  const { profile } = useAuth()
  const toast = useToast()
  const perms = getPerms(profile?.role)
  const [tab, setTab] = useState('dashboard')
  const [church, setChurch] = useState(null)

  useEffect(() => {
    supabase.from('churches').select('*').limit(1).maybeSingle()
      .then(({ data }) => setChurch(data))
  }, [])

  return (
    <div className="animate-fade-in p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-1">Announcements</h1>
        <p className="text-gray-500 dark:text-gray-400 text-sm">
          Birthday & anniversary wishes, weekly reports and automation settings
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-gray-200 dark:border-gray-700">
        {TABS.map(t => {
          const Icon = t.icon
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition rounded-t-lg"
              style={{
                borderBottom: tab === t.key ? '2px solid #7f1d1d' : '2px solid transparent',
                color: tab === t.key ? '#7f1d1d' : undefined,
                background: tab === t.key ? 'rgba(127,29,29,0.06)' : 'transparent',
              }}
            >
              <Icon size={15} />{t.label}
            </button>
          )
        })}
      </div>

      {tab === 'dashboard' && <DashboardTab church={church} profile={profile} toast={toast} />}
      {tab === 'reports'   && <ReportsTab   church={church} profile={profile} toast={toast} />}
      {tab === 'verses'    && <VersesTab    perms={perms}   profile={profile} toast={toast} />}
      {tab === 'settings'  && <SettingsTab  perms={perms}   profile={profile} toast={toast} />}
    </div>
  )
}

/* ════════════════════════════════════════════════════════════
   DASHBOARD TAB — Upcoming 7-day board
   ════════════════════════════════════════════════════════════ */
const SELF_TEST_NUMBER = '919994073545'

function DashboardTab({ church, profile, toast }) {
  const [birthdays,     setBirthdays]     = useState([])
  const [anniversaries, setAnniversaries] = useState([])
  const [loading,       setLoading]       = useState(true)
  const [sendingId,     setSendingId]     = useState(null)
  const [sentIds,       setSentIds]       = useState(new Set())
  const [sendingTest,   setSendingTest]   = useState(false)
  const [testStatus,    setTestStatus]    = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    const [b, a] = await Promise.all([getUpcomingBirthdays(7), getUpcomingAnniversaries(7)])
    setBirthdays(b); setAnniversaries(a)
    // Mark already-sent today (namespaced to avoid birthday/anniversary collision)
    const today = new Date().toISOString().split('T')[0]
    const { data: logs } = await supabase
      .from('announcements_log')
      .select('member_id, family_id, log_type')
      .gte('sent_at', today)
      .eq('status', 'sent')
      .in('log_type', ['birthday_wish', 'anniversary_wish'])
    if (logs) {
      const ids = new Set()
      logs.forEach(l => {
        if (l.log_type === 'birthday_wish'    && l.member_id) ids.add(`b_${l.member_id}`)
        if (l.log_type === 'anniversary_wish' && l.family_id) ids.add(`a_${l.family_id}`)
      })
      setSentIds(ids)
    }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const handleSend = async event => {
    if (!church?.instance_id && !church?.official_phone_number_id) {
      toast('WhatsApp API not configured in Church Setup.', 'error'); return
    }
    const phone = event.whatsapp || event.mobile
    if (!phone) { toast(`No WhatsApp number for ${event.displayName}`, 'error'); return }

    const uid = event.eventType === 'birthday' ? `b_${event.member_id}` : `a_${event.family_id}`
    setSendingId(uid)
    try {
      const verse = await getRandomVerse(event.eventType)
      const blob  = await generateGreetingCard({
        type: event.eventType, names: event.displayName,
        years: event.years || 0,
        churchName: church?.church_name || '',
        city: church?.city || '',
        address: church?.address || '',
        verse,
      })
      const filename = `${event.eventType}/${uid}_${event.eventDate}.jpg`
      const cardUrl  = await uploadToStorage('announcement-cards', filename, blob)
      const message  = event.eventType === 'birthday'
        ? `Birthday wishes to ${event.displayName} from ${church?.church_name || 'Church'}!`
        : `Anniversary wishes to ${event.displayName} from ${church?.church_name || 'Church'}!`
      await sendWhatsAppMessage(church, { to: phone, message, mediaUrl: cardUrl })
      await logAnnouncement({
        log_type: event.eventType === 'birthday' ? 'birthday_wish' : 'anniversary_wish',
        recipient_name: event.displayName, recipient_number: phone,
        member_id: event.member_id, family_id: event.family_id,
        event_date: event.eventDate, status: 'sent', triggered_by: 'manual',
        card_url: cardUrl, message_preview: message,
      })
      setSentIds(prev => new Set([...prev, uid]))
      toast(`Wish sent to ${event.displayName}!`, 'success')
    } catch (err) {
      await logAnnouncement({
        log_type: event.eventType === 'birthday' ? 'birthday_wish' : 'anniversary_wish',
        recipient_name: event.displayName, status: 'failed',
        error_message: err.message, triggered_by: 'manual',
      })
      toast(`Send failed: ${err.message}`, 'error')
    } finally {
      setSendingId(null)
    }
  }

  const sendSelfTest = async () => {
    if (!church?.instance_id && !church?.official_phone_number_id) {
      toast('WhatsApp API not configured in Church Setup.', 'error'); return
    }
    setSendingTest(true)
    setTestStatus(null)
    try {
      const verse = await getRandomVerse('birthday').catch(e => { throw new Error(`[verse] ${e.message}`) })

      const blob = await generateGreetingCard({
        type: 'birthday', names: 'Test Person', years: 0,
        churchName: church?.church_name || '', city: church?.city || '',
        address: church?.address || '', verse,
      }).catch(e => { throw new Error(`[card] ${e.message}`) })

      const filename = `birthday/self-test_${Date.now()}.jpg`
      const cardUrl  = await uploadToStorage('announcement-cards', filename, blob)
        .catch(e => { throw new Error(`[upload] ${e.message}`) })

      const message = `[TEST] Birthday greetings from ${church?.church_name || 'Church CMS'}! WhatsApp media integration check.`
      const result  = await sendWhatsAppMessage(church, { to: SELF_TEST_NUMBER, message, mediaUrl: cardUrl })
        .catch(e => { throw new Error(`[whatsapp] ${e.message}`) })

      const msgId = result?.messages?.[0]?.id || result?.message_id || result?.id || null
      setTestStatus({ ok: true, text: `Delivered${msgId ? ` · ID: ${msgId}` : ''}` })
      toast(`Test sent to ${SELF_TEST_NUMBER}!`, 'success')
    } catch (err) {
      setTestStatus({ ok: false, text: err.message })
      toast(`Test failed: ${err.message}`, 'error')
    } finally {
      setSendingTest(false)
    }
  }

  const all = [
    ...birthdays.map(e => ({ ...e, _type: 'birthday' })),
    ...anniversaries.map(e => ({ ...e, _type: 'anniversary' })),
  ].sort((a, b) => a.daysAway - b.daysAway || a.displayName.localeCompare(b.displayName))

  return (
    <div className="space-y-4">
      {/* WhatsApp self-test panel */}
      <div className="flex flex-wrap items-center gap-3 px-4 py-3 bg-slate-50 dark:bg-slate-800/60 rounded-lg border border-slate-200 dark:border-slate-700">
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">WhatsApp Self-Test</p>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
            Sends a greeting card to <span className="font-mono">{SELF_TEST_NUMBER}</span>
          </p>
          {testStatus && (
            <p className={`text-xs mt-1 font-medium flex items-center gap-1 ${testStatus.ok ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'}`}>
              {testStatus.ok ? <CheckCircle size={11} /> : <XCircle size={11} />}
              {testStatus.text}
            </p>
          )}
        </div>
        <button onClick={sendSelfTest} disabled={sendingTest}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold text-white transition disabled:opacity-50"
          style={{ background: '#142c5c' }}>
          {sendingTest ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
          {sendingTest ? 'Sending…' : 'WhatsApp Self Test'}
        </button>
      </div>

      {loading ? <Spinner label="Loading upcoming events..." /> : !all.length ? (
        <EmptyState icon={<Cake size={32} />} text="No birthdays or anniversaries in the next 7 days." />
      ) : (
      <div className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
        <table className="w-full" style={{ fontSize: 13 }}>
          <thead>
            <tr className="bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
              <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600 dark:text-gray-300">Date</th>
              <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600 dark:text-gray-300">Type</th>
              <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600 dark:text-gray-300">Name</th>
              <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600 dark:text-gray-300">Detail</th>
              <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600 dark:text-gray-300">WhatsApp</th>
              <th className="px-4 py-2 text-center text-xs font-semibold text-gray-600 dark:text-gray-300">Action</th>
            </tr>
          </thead>
          <tbody>
            {all.map((ev, idx) => {
              const uid     = ev.eventType === 'birthday' ? `b_${ev.member_id}` : `a_${ev.family_id}`
              const alreadySent = sentIds.has(uid)
              const isSending   = sendingId === uid
              const isBday      = ev.eventType === 'birthday'
              const dayLabel    = ev.daysAway === 0 ? 'Today' : ev.daysAway === 1 ? 'Tomorrow' : ev.dayName
              return (
                <tr key={idx}
                  className="border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/40 transition">
                  <td className="px-4 py-2 text-gray-700 dark:text-gray-300 whitespace-nowrap">
                    <span className="font-medium">{dayLabel}</span>
                    <span className="text-gray-400 ml-1 text-xs">{fmtDate(ev.eventDate)}</span>
                  </td>
                  <td className="px-4 py-2">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
                      style={isBday
                        ? { background: '#fef3c7', color: '#92400e' }
                        : { background: '#fce7f3', color: '#9d174d' }}>
                      {isBday ? <Cake size={11} /> : <Heart size={11} />}
                      {isBday ? 'Birthday' : 'Anniversary'}
                    </span>
                  </td>
                  <td className="px-4 py-2 font-medium text-gray-900 dark:text-white">{ev.displayName}</td>
                  <td className="px-4 py-2 text-gray-500 dark:text-gray-400">
                    {isBday ? `Turning ${ev.age}` : `${ev.years} years`}
                  </td>
                  <td className="px-4 py-2 text-gray-500 dark:text-gray-400 font-mono text-xs">
                    {ev.whatsapp || ev.mobile || '—'}
                  </td>
                  <td className="px-4 py-2 text-center">
                    {alreadySent ? (
                      <span className="inline-flex items-center gap-1 text-green-600 text-xs font-medium">
                        <CheckCircle size={13} /> Sent
                      </span>
                    ) : (
                      <button
                        onClick={() => handleSend(ev)}
                        disabled={!!sendingId}
                        className="inline-flex items-center gap-1 px-3 py-1 rounded text-xs font-medium transition"
                        style={{ background: isBday ? '#fef3c7' : '#fce7f3',
                          color: isBday ? '#92400e' : '#9d174d' }}>
                        {isSending ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
                        {isSending ? 'Sending…' : 'Send Wish'}
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      )}
    </div>
  )
}

/* ════════════════════════════════════════════════════════════
   REPORTS TAB
   ════════════════════════════════════════════════════════════ */
function ReportsTab({ church, profile, toast }) {
  const [startBday,      setStartBday]      = useState('')
  const [endBday,        setEndBday]        = useState('')
  const [startAnniv,     setStartAnniv]     = useState('')
  const [endAnniv,       setEndAnniv]       = useState('')
  const [bdays,          setBdays]          = useState(null)
  const [annivers,       setAnnivers]       = useState(null)
  const [generatingBday, setGeneratingBday] = useState(false)
  const [generatingAnniv,setGeneratingAnniv]= useState(false)
  const [sendModal,      setSendModal]      = useState(null)
  const [activeReport,   setActiveReport]   = useState('birthday')

  useEffect(() => {
    const { start, end } = getNextWeekRange()
    setStartBday(start); setEndBday(end)
    setStartAnniv(start); setEndAnniv(end)
  }, [])

  const generateBirthdays = async () => {
    if (!startBday || !endBday) { toast('Select birthday date range first.', 'error'); return }
    setGeneratingBday(true)
    try { setBdays(await getBirthdaysInRange(startBday, endBday)) }
    finally { setGeneratingBday(false) }
  }

  const generateAnniversaries = async () => {
    if (!startAnniv || !endAnniv) { toast('Select anniversary date range first.', 'error'); return }
    setGeneratingAnniv(true)
    try { setAnnivers(await getAnniversariesInRange(startAnniv, endAnniv)) }
    finally { setGeneratingAnniv(false) }
  }

  const downloadPdf = (type) => {
    const data  = type === 'birthday' ? bdays : annivers
    const start = type === 'birthday' ? startBday : startAnniv
    const end   = type === 'birthday' ? endBday   : endAnniv
    if (!data?.length) { toast('No data to export.', 'error'); return }
    buildReportPdf(type, data, church, start, end, false)
  }

  const openSendModal = (type) => {
    const data  = type === 'birthday' ? bdays : annivers
    const start = type === 'birthday' ? startBday : startAnniv
    const end   = type === 'birthday' ? endBday   : endAnniv
    if (!data?.length) { toast('No data to send.', 'error'); return }
    const hasBearer = church?.presbyter_whatsapp || church?.secretary_whatsapp ||
                      church?.treasurer_whatsapp  || church?.admin1_whatsapp
    if (!hasBearer) {
      toast('No office bearer WhatsApp numbers configured in Church Setup.', 'error'); return
    }
    setSendModal({ type, data, start, end })
  }

  const REPORT_COLS = {
    birthday:    ['#', 'Member ID', 'Name',          'DOB',        'Age',   'Day'],
    anniversary: ['#', 'Family ID', 'Couple Names',  'Ann. Date',  'Years', 'Day'],
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2 mb-4">
        <button type="button" onClick={() => setActiveReport('birthday')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition ${activeReport === 'birthday' ? 'bg-slate-900 text-white' : 'bg-white text-slate-700 border border-slate-200'}`}>
          Birthday Reports
        </button>
        <button type="button" onClick={() => setActiveReport('anniversary')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition ${activeReport === 'anniversary' ? 'bg-slate-900 text-white' : 'bg-white text-slate-700 border border-slate-200'}`}>
          Anniversary Reports
        </button>
      </div>

      {activeReport === 'birthday' ? (
        <div className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Birthday Date Range</p>
          <div className="flex flex-wrap gap-3 items-end">
            <div>
              <label className="block text-xs text-gray-500 mb-1">From</label>
              <input type="date" value={startBday} onChange={e => setStartBday(e.target.value)}
                className="field-input" style={{ width: 160 }} />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">To</label>
              <input type="date" value={endBday} onChange={e => setEndBday(e.target.value)}
                className="field-input" style={{ width: 160 }} />
            </div>
            <button onClick={generateBirthdays} disabled={generatingBday}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-white text-sm font-medium transition"
              style={{ background: '#92400e' }}>
              {generatingBday ? <Loader2 size={14} className="animate-spin" /> : <Eye size={14} />}
              {generatingBday ? 'Generating…' : 'Generate Birthdays'}
            </button>
          </div>
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Anniversary Date Range</p>
          <div className="flex flex-wrap gap-3 items-end">
            <div>
              <label className="block text-xs text-gray-500 mb-1">From</label>
              <input type="date" value={startAnniv} onChange={e => setStartAnniv(e.target.value)}
                className="field-input" style={{ width: 160 }} />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">To</label>
              <input type="date" value={endAnniv} onChange={e => setEndAnniv(e.target.value)}
                className="field-input" style={{ width: 160 }} />
            </div>
            <button onClick={generateAnniversaries} disabled={generatingAnniv}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-white text-sm font-medium transition"
              style={{ background: '#9d174d' }}>
              {generatingAnniv ? <Loader2 size={14} className="animate-spin" /> : <Eye size={14} />}
              {generatingAnniv ? 'Generating…' : 'Generate Anniversaries'}
            </button>
          </div>
        </div>
      )}

      {activeReport === 'birthday' && bdays !== null && (
        <ReportSection
          title="Birthday Report" icon={<Cake size={16} />}
          cols={REPORT_COLS.birthday} data={bdays}
          rowMapper={r => [r.serial, r.member_id, r.member_name, r.displayDate, r.age, r.dayName]}
          accentColor="#92400e" bgColor="#fffbeb"
          onDownload={() => downloadPdf('birthday')}
          onSend={() => openSendModal('birthday')}
        />
      )}

      {activeReport === 'anniversary' && annivers !== null && (
        <ReportSection
          title="Anniversary Report" icon={<Heart size={16} />}
          cols={REPORT_COLS.anniversary} data={annivers}
          rowMapper={r => [r.serial, r.family_id, r.displayName, r.displayDate, r.years, r.dayName]}
          accentColor="#9d174d" bgColor="#fdf2f8"
          onDownload={() => downloadPdf('anniversary')}
          onSend={() => openSendModal('anniversary')}
        />
      )}

      {sendModal && (
        <SendToBearersModal
          church={church} type={sendModal.type} data={sendModal.data}
          startDate={sendModal.start} endDate={sendModal.end} toast={toast}
          onClose={() => setSendModal(null)}
        />
      )}
    </div>
  )
}

function ReportSection({ title, icon, cols, data, rowMapper, accentColor, bgColor, onDownload, onSend }) {
  return (
    <div className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700"
        style={{ background: bgColor }}>
        <span className="flex items-center gap-2 font-semibold text-sm" style={{ color: accentColor }}>
          {icon} {title}
          <span className="ml-2 px-2 py-0.5 rounded-full text-xs font-bold"
            style={{ background: accentColor, color: '#fff' }}>{data.length}</span>
        </span>
        <div className="flex gap-2">
          <button onClick={onDownload} disabled={!data.length}
            className="flex items-center gap-1 px-3 py-1 rounded text-xs font-medium border transition disabled:opacity-40"
            style={{ borderColor: accentColor, color: accentColor }}>
            <FileDown size={12} /> Download PDF
          </button>
          <button onClick={onSend} disabled={!data.length}
            className="flex items-center gap-1 px-3 py-1 rounded text-xs font-medium text-white transition disabled:opacity-40"
            style={{ background: accentColor }}>
            <Send size={12} /> Send to Office Bearers
          </button>
        </div>
      </div>
      {!data.length ? (
        <p className="text-center text-gray-400 text-sm py-8">No records found for this date range.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full" style={{ fontSize: 12 }}>
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-900">
                {cols.map(c => (
                  <th key={c} className="px-3 py-2 text-left text-xs font-semibold text-gray-600 dark:text-gray-300">{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.map((row, i) => (
                <tr key={i} className="border-t border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/40">
                  {rowMapper(row).map((v, j) => (
                    <td key={j} className="px-3 py-1.5 text-gray-700 dark:text-gray-300">{v ?? ''}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

/* ════════════════════════════════════════════════════════════
   SEND TO OFFICE BEARERS MODAL
   ════════════════════════════════════════════════════════════ */
function SendToBearersModal({ church, type, data, startDate, endDate, toast, onClose }) {
  const allBearers = [
    { key: 'pastor',     label: 'Pastor / Presbyter', name: church?.presbyter_name, num: church?.presbyter_whatsapp },
    { key: 'secretary',  label: 'Secretary',           name: church?.secretary_name, num: church?.secretary_whatsapp },
    { key: 'treasurer',  label: 'Treasurer',           name: church?.treasurer_name, num: church?.treasurer_whatsapp },
    { key: 'admin1',     label: 'Admin 1',             name: church?.admin1_name,    num: church?.admin1_whatsapp    },
  ]
  const configured = allBearers.filter(b => b.num)

  const [selected, setSelected] = useState(() => new Set(configured.map(b => b.key)))
  const [sending,  setSending]  = useState(false)
  const [results,  setResults]  = useState(null)   // null = not sent yet

  const toggle = key => {
    if (sending) return
    setSelected(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n })
  }

  const handleSend = async () => {
    const targets = configured.filter(b => selected.has(b.key))
    if (!targets.length) { toast('Select at least one recipient.', 'error'); return }
    setSending(true)
    try {
      const pdf    = buildReportPdf(type, data, church, startDate, endDate, true)
      const blob   = pdf.output('blob')
      const fname  = `${type}-report-${startDate}.pdf`
      const pdfUrl = await uploadToStorage('announcement-reports', fname, blob, 'application/pdf')
      const msg    = `${church?.church_name || 'Church'} — ${type === 'birthday' ? 'Birthday' : 'Anniversary'} Report (${fmtDate(startDate)} to ${fmtDate(endDate)})`

      const out = []
      for (const b of targets) {
        try {
          await sendWhatsAppMessage(church, { to: b.num, message: msg, mediaUrl: pdfUrl })
          await logAnnouncement({
            log_type: 'weekly_report', recipient_name: b.name, recipient_number: b.num,
            status: 'sent', triggered_by: 'manual', card_url: pdfUrl, message_preview: msg,
          })
          out.push({ ...b, ok: true })
        } catch (e) {
          await logAnnouncement({
            log_type: 'weekly_report', recipient_name: b.name, recipient_number: b.num,
            status: 'failed', error_message: e.message, triggered_by: 'manual',
          })
          out.push({ ...b, ok: false, err: e.message })
        }
      }
      setResults(out)
      const sentCount = out.filter(r => r.ok).length
      toast(`Sent to ${sentCount} of ${targets.length} recipient${targets.length !== 1 ? 's' : ''}.`,
        sentCount > 0 ? 'success' : 'error')
    } catch (err) {
      toast(`Send failed: ${err.message}`, 'error')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl w-full max-w-md">

        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-700">
          <h3 className="font-semibold text-gray-900 dark:text-white">Send to Office Bearers</h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            {type === 'birthday' ? 'Birthday' : 'Anniversary'} report · {fmtDate(startDate)} to {fmtDate(endDate)}
          </p>
        </div>

        {/* Recipient list */}
        <div className="px-5 py-4 space-y-1">
          {allBearers.map(b => {
            const isConfigured = !!b.num
            const result = results?.find(r => r.key === b.key)
            return (
              <label key={b.key}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition select-none
                  ${isConfigured ? 'cursor-pointer hover:bg-gray-50 dark:hover:bg-slate-700/50' : 'opacity-40 cursor-not-allowed'}`}>
                <input type="checkbox"
                  checked={isConfigured && selected.has(b.key)}
                  disabled={!isConfigured || sending}
                  onChange={() => toggle(b.key)}
                  className="w-4 h-4 rounded border-gray-300 accent-red-900" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-800 dark:text-white">{b.label}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                    {isConfigured
                      ? <>{b.name && <span className="mr-2">{b.name}</span>}<span className="font-mono">{b.num}</span></>
                      : 'Not configured in Church Setup'}
                  </p>
                </div>
                {result && (
                  result.ok
                    ? <span className="flex items-center gap-1 text-xs text-green-600 font-medium">
                        <CheckCircle size={14} /> Sent
                      </span>
                    : <span className="flex items-center gap-1 text-xs text-red-500 font-medium" title={result.err}>
                        <XCircle size={14} /> Failed
                      </span>
                )}
              </label>
            )
          })}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-gray-200 dark:border-gray-700 flex gap-2 justify-end">
          <button onClick={onClose}
            className="px-4 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition">
            {results ? 'Close' : 'Cancel'}
          </button>
          {!results && (
            <button onClick={handleSend} disabled={sending || selected.size === 0}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm text-white font-medium transition disabled:opacity-50"
              style={{ background: '#7f1d1d' }}>
              {sending ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
              {sending ? 'Sending…' : 'Send Report'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

/* ════════════════════════════════════════════════════════════
   BIBLE VERSES TAB
   ════════════════════════════════════════════════════════════ */
function VersesTab({ perms, profile, toast }) {
  const [verseTab,  setVerseTab]  = useState('birthday')
  const [verses,    setVerses]    = useState([])
  const [loading,   setLoading]   = useState(true)
  const [editing,   setEditing]   = useState(null)
  const [form,      setForm]      = useState({ verse_reference: '', verse_text_english: '', verse_text_tamil_reference: '', verse_text_tamil: '', is_active: true })
  const [saving,    setSaving]    = useState(false)
  const [importing, setImporting] = useState(false)
  const importRef = useRef(null)

  const loadVerses = useCallback(async () => {
    setLoading(true)
    setVerses(await getBibleVerses(verseTab))
    setLoading(false)
  }, [verseTab])

  useEffect(() => { loadVerses(); setEditing(null) }, [loadVerses])

  const openNew = () => {
    setForm({ verse_reference: '', verse_text_english: '', verse_text_tamil_reference: '', verse_text_tamil: '', is_active: true })
    setEditing('new')
  }
  const openEdit = v => {
    setForm({
      verse_reference: v.verse_reference,
      verse_text_english: v.verse_text_english,
      verse_text_tamil_reference: v.verse_text_tamil_reference || '',
      verse_text_tamil: v.verse_text_tamil || '',
      is_active: v.is_active,
    })
    setEditing(v)
  }

  const handleSave = async () => {
    if (!form.verse_reference.trim() || !form.verse_text_english.trim()) {
      toast('Reference and English verse are required.', 'error'); return
    }
    setSaving(true)
    try {
      await saveBibleVerse({
        ...(editing !== 'new' ? { id: editing.id } : {}),
        type: verseTab, ...form,
        created_by: profile?.full_name || profile?.email,
      })
      toast('Verse saved.', 'success')
      setEditing(null); loadVerses()
    } catch (err) { toast('Save failed: ' + err.message, 'error') }
    setSaving(false)
  }

  const handleDelete = async id => {
    if (!window.confirm('Delete this verse?')) return
    try { await deleteBibleVerse(id); loadVerses(); toast('Verse deleted.', 'success') }
    catch (err) { toast('Delete failed: ' + err.message, 'error') }
  }

  const handleToggle = async (v) => {
    try { await toggleVerseActive(v.id, !v.is_active); loadVerses() }
    catch (err) { toast('Toggle failed: ' + err.message, 'error') }
  }

  const handleImport = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    e.target.value = ''
    setImporting(true)
    try {
      const buf = await file.arrayBuffer()
      const wb  = XLSX.read(buf, { type: 'array' })
      const sheetName = verseTab === 'birthday' ? 'Birthdays' : 'Anniversaries'
      const sheet = wb.Sheets[sheetName]
      if (!sheet) {
        toast(`Sheet "${sheetName}" not found. Use the BibleVerses.xlsx template.`, 'error')
        return
      }
      const rows = XLSX.utils.sheet_to_json(sheet)
      const verses = rows
        .filter(r => r.verse_reference && r.verse_text_english)
        .map(r => ({
          type: verseTab,
          verse_reference:    String(r.verse_reference).trim(),
          verse_text_english: String(r.verse_text_english).trim(),
          verse_text_tamil_reference: r.verse_text_tamil_reference ? String(r.verse_text_tamil_reference).trim() : null,
          verse_text_tamil:   r.verse_text_tamil ? String(r.verse_text_tamil).trim() : null,
          is_active: String(r.is_active).toUpperCase() === 'FALSE' ? false : true,
        }))
      if (!verses.length) { toast('No valid rows found in the sheet.', 'error'); return }

      const refs = verses.map(v => v.verse_reference)
      const { data: existing } = await supabase.from('bible_verses')
        .select('verse_reference').in('verse_reference', refs).eq('type', verseTab)
      const existingSet = new Set((existing || []).map(v => v.verse_reference))
      const newCount    = verses.filter(v => !existingSet.has(v.verse_reference)).length
      const updateCount = verses.length - newCount

      const msg = newCount > 0 && updateCount > 0
        ? `Found ${verses.length} verses.\n• ${newCount} new — will be inserted\n• ${updateCount} existing — will be updated (incl. Tamil text)\n\nProceed?`
        : updateCount > 0
        ? `${updateCount} verse${updateCount !== 1 ? 's' : ''} already exist and will be updated (incl. Tamil text). Proceed?`
        : `Import ${newCount} new verse${newCount !== 1 ? 's' : ''}?`
      if (!window.confirm(msg)) return

      await bulkUpsertVerses(verses)
      const parts = []
      if (newCount)    parts.push(`${newCount} inserted`)
      if (updateCount) parts.push(`${updateCount} updated`)
      toast(`${parts.join(', ')} (${verseTab}).`, 'success')
      loadVerses()
    } catch (err) {
      toast('Import failed: ' + err.message, 'error')
    } finally {
      setImporting(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* Sub-tabs + action buttons */}
      <div className="flex flex-wrap gap-2 items-center">
        {[['birthday','Birthday Verses','#92400e','#fef3c7'],['anniversary','Anniversary Verses','#9d174d','#fce7f3']].map(([k,l,c,bg]) => (
          <button key={k} onClick={() => setVerseTab(k)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition"
            style={{ background: verseTab === k ? bg : 'transparent',
              color: verseTab === k ? c : undefined,
              border: `1px solid ${verseTab === k ? c : '#e5e7eb'}` }}>
            {k === 'birthday' ? <Cake size={14} /> : <Heart size={14} />}{l}
          </button>
        ))}
        <div className="ml-auto flex gap-2">
          {/* Download template */}
          <a href="/BibleVerses.xlsx" download
            className="flex items-center gap-1 px-3 py-2 rounded-lg text-sm font-medium border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition">
            <Download size={14} /> Template
          </a>
          {perms?.canEdit && (
            <>
              <input type="file" accept=".xlsx,.xls" ref={importRef} className="hidden" onChange={handleImport} />
              <button onClick={() => importRef.current?.click()} disabled={importing}
                className="flex items-center gap-1 px-3 py-2 rounded-lg text-sm font-medium border transition disabled:opacity-50"
                style={{ borderColor: '#7f1d1d', color: '#7f1d1d' }}>
                {importing ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                {importing ? 'Importing…' : 'Import Excel'}
              </button>
              <button onClick={openNew}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white transition"
                style={{ background: '#7f1d1d' }}>
                <Plus size={14} /> Add Verse
              </button>
            </>
          )}
        </div>
      </div>

      {/* Add/Edit form */}
      {editing && (
        <div className="bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800 rounded-lg p-4 space-y-3">
          <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
            {editing === 'new' ? 'Add New Verse' : 'Edit Verse'}
          </p>
          <div className="grid grid-cols-1 gap-3">
            <div className="field-group">
              <label className="field-label">Verse Reference *</label>
              <input className="field-input" value={form.verse_reference}
                onChange={e => setForm(f => ({ ...f, verse_reference: e.target.value }))}
                placeholder="e.g., Jeremiah 29:11" />
            </div>
            <div className="field-group">
              <label className="field-label">Verse (English) *</label>
              <textarea className="field-input" rows={3} value={form.verse_text_english}
                onChange={e => setForm(f => ({ ...f, verse_text_english: e.target.value }))}
                placeholder="For I know the plans I have for you..." />
            </div>
            <div className="field-group">
              <label className="field-label">Tamil Reference</label>
              <input className="field-input" value={form.verse_text_tamil_reference}
                onChange={e => setForm(f => ({ ...f, verse_text_tamil_reference: e.target.value }))}
                placeholder="e.g., எரேமியா 29:11" />
            </div>
            <div className="field-group">
              <label className="field-label">Verse (Tamil)</label>
              <textarea className="field-input" rows={3} value={form.verse_text_tamil}
                onChange={e => setForm(f => ({ ...f, verse_text_tamil: e.target.value }))}
                placeholder="Tamil translation..." />
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setEditing(null)}
              className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition">
              Cancel
            </button>
            <button onClick={handleSave} disabled={saving}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm text-white font-medium transition"
              style={{ background: '#7f1d1d' }}>
              {saving ? <Loader2 size={13} className="animate-spin" /> : null}
              {saving ? 'Saving…' : 'Save Verse'}
            </button>
          </div>
        </div>
      )}

      {/* List */}
      {loading ? <Spinner label="Loading verses…" /> : verses.length === 0 ? (
        <EmptyState icon={<BookOpen size={32} />} text={`No ${verseTab} verses added yet.`} />
      ) : (
        <div className="space-y-2">
          {verses.map(v => (
            <div key={v.id}
              className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 flex gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-bold text-sm text-gray-800 dark:text-white">{v.verse_reference}</span>
                  {!v.is_active && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-400">Inactive</span>
                  )}
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-300 italic">"{v.verse_text_english}"</p>
                {v.verse_text_tamil && (
                  <div className="mt-1">
                    {v.verse_text_tamil_reference && (
                      <span className="text-xs font-semibold text-amber-700 dark:text-amber-400 mr-1">
                        {v.verse_text_tamil_reference} —
                      </span>
                    )}
                    <span className="text-sm text-gray-500 dark:text-gray-400">"{v.verse_text_tamil}"</span>
                  </div>
                )}
              </div>
              {perms?.canEdit && (
                <div className="flex flex-col gap-1 flex-shrink-0">
                  <button onClick={() => handleToggle(v)} title={v.is_active ? 'Deactivate' : 'Activate'}
                    className="p-1.5 rounded text-gray-400 hover:text-blue-500 transition">
                    {v.is_active ? <ToggleRight size={18} className="text-green-500" /> : <ToggleLeft size={18} />}
                  </button>
                  <button onClick={() => openEdit(v)} title="Edit"
                    className="p-1.5 rounded text-gray-400 hover:text-blue-500 transition">
                    <Pencil size={14} />
                  </button>
                  <button onClick={() => handleDelete(v.id)} title="Delete"
                    className="p-1.5 rounded text-gray-400 hover:text-red-500 transition">
                    <Trash2 size={14} />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/* ════════════════════════════════════════════════════════════
   SETTINGS TAB
   ════════════════════════════════════════════════════════════ */
function SettingsTab({ perms, profile, toast }) {
  const [settings, setSettings] = useState({ auto_report_enabled: false, auto_greeting_enabled: false })
  const [loading,  setLoading]  = useState(true)
  const [saving,   setSaving]   = useState(false)

  useEffect(() => {
    getAnnouncementSettings().then(s => {
      if (s) setSettings({ auto_report_enabled: s.auto_report_enabled, auto_greeting_enabled: s.auto_greeting_enabled })
      setLoading(false)
    })
  }, [])

  const save = async () => {
    setSaving(true)
    try {
      await saveAnnouncementSettings(settings, profile?.full_name || profile?.email)
      toast('Settings saved.', 'success')
    } catch (err) { toast('Save failed: ' + err.message, 'error') }
    setSaving(false)
  }

  if (loading) return <Spinner label="Loading settings…" />

  const toggleRow = (key, label, description) => (
    <div className="flex items-start justify-between gap-4 p-4 bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-gray-700">
      <div>
        <p className="font-semibold text-sm text-gray-800 dark:text-white">{label}</p>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{description}</p>
      </div>
      <button
        onClick={() => perms?.canEdit && setSettings(s => ({ ...s, [key]: !s[key] }))}
        disabled={!perms?.canEdit}
        className="flex-shrink-0 transition"
      >
        {settings[key]
          ? <ToggleRight size={36} className="text-green-500" />
          : <ToggleLeft  size={36} className="text-gray-300 dark:text-gray-600" />}
      </button>
    </div>
  )

  return (
    <div className="space-y-4 max-w-xl">
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3 text-xs text-blue-800 dark:text-blue-300">
        Automated sends require Supabase Edge Functions and pg_cron to be deployed.
        Manual send from the Dashboard tab works independently.
      </div>

      {toggleRow(
        'auto_report_enabled',
        'Auto Weekly Report',
        'Every Saturday at 6:00 PM — sends the forthcoming week\'s birthday & anniversary report to Presbyter, Secretary and Treasurer via WhatsApp.'
      )}
      {toggleRow(
        'auto_greeting_enabled',
        'Auto Greeting Wishes',
        'Every day at 12:01 AM — sends birthday and anniversary greeting cards to members on their special day via WhatsApp.'
      )}

      {perms?.canEdit && (
        <button onClick={save} disabled={saving}
          className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm text-white font-medium transition"
          style={{ background: '#14532d' }}>
          {saving ? <Loader2 size={13} className="animate-spin" /> : null}
          {saving ? 'Saving…' : 'Save Settings'}
        </button>
      )}
    </div>
  )
}

/* ════════════════════════════════════════════════════════════
   PDF builder (jsPDF)
   ════════════════════════════════════════════════════════════ */
function buildReportPages(doc, type, data, church, startDate, endDate) {
  const pw = doc.internal.pageSize.getWidth()
  const ph = doc.internal.pageSize.getHeight()
  const isBday = type === 'birthday'
  const MX = 10, MY = 10
  const cw = pw - MX * 2
  const ch = ph - MY * 2

  // ── Palette ──────────────────────────────────────────────
  const NAVY    = [18, 44, 88]
  const ACCENT  = isBday ? [204, 102, 0] : [158, 18, 80]
  const STEEL   = [55, 80, 116]
  const WHITE   = [255, 255, 255]
  const DIVIDER = [185, 200, 220]
  const BODY    = [20, 32, 58]

  // Rich day colours — row background / day-cell bg / day-cell text
  const DAY = {
    Sunday:    { row: [255, 222, 158], cell: [220, 135, 28],  txt: WHITE },
    Monday:    { row: [170, 210, 255], cell: [50, 118, 208],  txt: WHITE },
    Tuesday:   { row: [145, 228, 190], cell: [22, 152, 92],   txt: WHITE },
    Wednesday: { row: [255, 228, 90],  cell: [198, 145, 4],   txt: WHITE },
    Thursday:  { row: [215, 183, 255], cell: [124, 68, 208],  txt: WHITE },
    Friday:    { row: [255, 166, 162], cell: [202, 45, 58],   txt: WHITE },
    Saturday:  { row: [145, 220, 248], cell: [28, 155, 205],  txt: WHITE },
  }
  const DAY_DEF = { row: [238, 242, 248], cell: [168, 178, 198], txt: WHITE }

  // ── Layout ───────────────────────────────────────────────
  const HEADER_H  = 44
  const TH_H      = 11
  const ROW_H     = 9
  const FOOTER_H  = 9
  const TABLE_TOP = MY + HEADER_H
  const TABLE_BOT = ph - MY - FOOTER_H - 1
  const FOOTER_Y  = ph - MY - FOOTER_H

  // ── White canvas for table area ───────────────────────────
  const initPage = () => {
    doc.setFillColor(...WHITE)
    doc.rect(MX, MY, cw, ch, 'F')
  }

  // ── Header (full navy block) ──────────────────────────────
  const drawHeader = () => {
    doc.setFillColor(...NAVY)
    doc.rect(MX, MY, cw, HEADER_H, 'F')

    // Top accent stripe
    doc.setFillColor(...ACCENT)
    doc.rect(MX, MY, cw, 3, 'F')

    // Church name
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(17)
    doc.setTextColor(...WHITE)
    doc.text(church?.church_name || 'Church', pw / 2, MY + 15, { align: 'center' })

    // City / state
    const cityLine = [church?.city, church?.state].filter(Boolean).join(', ')
    if (cityLine) {
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(8)
      doc.setTextColor(170, 196, 232)
      doc.text(cityLine, pw / 2, MY + 22, { align: 'center' })
    }

    // Report title
    doc.setFont('helvetica', 'bolditalic')
    doc.setFontSize(11)
    doc.setTextColor(...(isBday ? [255, 210, 125] : [255, 170, 205]))
    doc.text(
      isBday ? 'Birthday Report' : 'Wedding Anniversary Report',
      pw / 2, cityLine ? MY + 31 : MY + 27, { align: 'center' }
    )

    // Bottom accent stripe
    doc.setFillColor(...ACCENT)
    doc.rect(MX, MY + HEADER_H - 2.5, cw, 2.5, 'F')

    // Date range (left) + record count (right) above accent stripe
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.5)
    doc.setTextColor(170, 198, 235)
    doc.text(`${fmtDate(startDate)}  to  ${fmtDate(endDate)}`, MX + 5, MY + HEADER_H - 6)
    doc.text(`${data.length} Record${data.length !== 1 ? 's' : ''}`,
      MX + cw - 5, MY + HEADER_H - 6, { align: 'right' })
  }

  // ── Column defs ──────────────────────────────────────────
  const colDefs = isBday
    ? [['#', 0.05, 'c'], ['Member ID', 0.13, 'c'], ['Member Name', 0.37, 'l'],
       ['Date', 0.14, 'c'], ['Age', 0.16, 'c'], ['Day', 0.15, 'c']]
    : [['#', 0.05, 'c'], ['Family ID', 0.12, 'c'], ['Couple Names', 0.48, 'l'],
       ['Ann. Date', 0.14, 'c'], ['Years', 0.09, 'c'], ['Day', 0.12, 'c']]
  const colW = colDefs.map(c => c[1] * cw)

  // ── Column header row ────────────────────────────────────
  const drawTableHeader = () => {
    doc.setFillColor(...STEEL)
    doc.rect(MX, TABLE_TOP, cw, TH_H, 'F')
    doc.setFillColor(...ACCENT)
    doc.rect(MX, TABLE_TOP + TH_H - 1, cw, 1, 'F')

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8.5)
    doc.setTextColor(...WHITE)
    let cx = MX
    colDefs.forEach(([label, , align], i) => {
      const x = align === 'c' ? cx + colW[i] / 2 : cx + 3
      doc.text(label, x, TABLE_TOP + 7.5, { align: align === 'c' ? 'center' : 'left' })
      if (i < colDefs.length - 1) {
        doc.setDrawColor(100, 130, 172)
        doc.setLineWidth(0.18)
        doc.line(cx + colW[i], TABLE_TOP + 2, cx + colW[i], TABLE_TOP + TH_H - 2)
      }
      cx += colW[i]
    })
  }

  // ── Footer ───────────────────────────────────────────────
  const drawFooter = (pageNum, pageCount) => {
    doc.setFillColor(...NAVY)
    doc.rect(MX, FOOTER_Y, cw, FOOTER_H, 'F')
    doc.setFillColor(...ACCENT)
    doc.rect(MX, FOOTER_Y + FOOTER_H - 1.5, cw, 1.5, 'F')
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7)
    doc.setTextColor(170, 198, 235)
    doc.text(`Generated: ${new Date().toLocaleDateString('en-IN')}`, MX + 4, FOOTER_Y + 6)
    doc.text(`Page ${pageNum} / ${pageCount}`, MX + cw - 4, FOOTER_Y + 6, { align: 'right' })
  }

  // ── Double-border frame (drawn last so it's on top) ───────
  const drawBorder = () => {
    doc.setDrawColor(...NAVY)
    doc.setLineWidth(1.4)
    doc.rect(MX, MY, cw, ch)
    doc.setDrawColor(...ACCENT)
    doc.setLineWidth(0.4)
    doc.rect(MX + 1.3, MY + 1.3, cw - 2.6, ch - 2.6)
  }

  // ── Data rows ─────────────────────────────────────────────
  const rows = data.map(r => isBday
    ? [r.serial, r.member_id || r.family_id, r.member_name, r.displayDate, r.age,   r.dayName]
    : [r.serial, r.member_id || r.family_id, r.displayName, r.displayDate, r.years, r.dayName]
  )

  const startNewPage = () => {
    doc.addPage(); initPage(); drawHeader(); drawTableHeader()
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(...BODY)
  }

  initPage(); drawHeader(); drawTableHeader()
  let y = TABLE_TOP + TH_H
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(...BODY)

  rows.forEach(row => {
    if (y + ROW_H > TABLE_BOT) { startNewPage(); y = TABLE_TOP + TH_H }

    const dayKey = String(row[5] || '')
    const dc = DAY[dayKey] || DAY_DEF

    // Row background — rich day colour
    doc.setFillColor(...dc.row)
    doc.rect(MX, y, cw, ROW_H, 'F')

    let cx = MX
    colDefs.forEach(([, , align], i) => {
      const cell   = row[i] != null ? String(row[i]) : ''
      const isLast = i === colDefs.length - 1

      if (isLast) {
        // Day cell — saturated bg + white bold text
        doc.setFillColor(...dc.cell)
        doc.rect(cx, y, colW[i], ROW_H, 'F')
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(8)
        doc.setTextColor(...dc.txt)
        doc.text(cell, cx + colW[i] / 2, y + 6, { align: 'center' })
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(8.5)
        doc.setTextColor(...BODY)
      } else {
        const x = align === 'c' ? cx + colW[i] / 2 : cx + 3
        doc.text(cell, x, y + 6, { align: align === 'c' ? 'center' : 'left' })
      }

      if (i < colDefs.length - 1) {
        doc.setDrawColor(...DIVIDER)
        doc.setLineWidth(0.12)
        doc.line(cx + colW[i], y + 0.8, cx + colW[i], y + ROW_H - 0.8)
      }
      cx += colW[i]
    })

    doc.setDrawColor(...DIVIDER)
    doc.setLineWidth(0.1)
    doc.line(MX, y + ROW_H, MX + cw, y + ROW_H)
    y += ROW_H
  })

  // Final pass: border + footer on every page
  const totalPages = doc.getNumberOfPages()
  for (let pg = 1; pg <= totalPages; pg++) {
    doc.setPage(pg); drawBorder(); drawFooter(pg, totalPages)
  }
}

function buildReportPdf(type, data, church, startDate, endDate, returnDoc = false) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  buildReportPages(doc, type, data, church, startDate, endDate)
  if (returnDoc) return doc
  doc.save(`${type}-report-${startDate}.pdf`)
}

/* ════════════════════════════════════════════════════════════
   Shared micro-components
   ════════════════════════════════════════════════════════════ */
function Spinner({ label }) {
  return (
    <div className="flex items-center justify-center h-40 gap-3 text-gray-500 dark:text-gray-400">
      <Loader2 size={22} className="animate-spin" />
      <span className="text-sm">{label}</span>
    </div>
  )
}

function EmptyState({ icon, text }) {
  return (
    <div className="flex flex-col items-center justify-center h-40 gap-3 text-gray-400 dark:text-gray-500">
      {icon}
      <p className="text-sm">{text}</p>
    </div>
  )
}
