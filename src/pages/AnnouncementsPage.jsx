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
  getExclusions, upsertExclusion, removeExclusion,
} from '../lib/announcements'
import {
  Megaphone, Cake, Heart, BookOpen, Settings, Loader2,
  Send, CheckCircle, XCircle, Plus, Pencil, Trash2,
  FileDown, ToggleLeft, ToggleRight, Eye, Upload, Download, UserX,
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
      {tab === 'settings'  && <SettingsTab  perms={perms}   profile={profile} toast={toast} church={church} />}
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
    const n = new Date()
    const today = `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}-${String(n.getDate()).padStart(2,'0')}`
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
      await logAnnouncement({
        log_type: 'birthday_wish', recipient_name: 'Self Test', recipient_number: SELF_TEST_NUMBER,
        event_date: new Date().toISOString().slice(0, 10), status: 'sent',
        triggered_by: 'manual', message_preview: message,
      })
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

  const downloadWeeklyPdf = () => {
    if (!bdays?.length && !annivers?.length) { toast('Generate reports first.', 'error'); return }
    buildWeeklyReportPdf(bdays || [], annivers || [], church, startBday, endBday, false)
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

  const openWeeklySendModal = () => {
    if (!bdays?.length && !annivers?.length) { toast('Generate reports first.', 'error'); return }
    const hasBearer = church?.presbyter_whatsapp || church?.secretary_whatsapp ||
                      church?.treasurer_whatsapp  || church?.admin1_whatsapp
    if (!hasBearer) {
      toast('No office bearer WhatsApp numbers configured in Church Setup.', 'error'); return
    }
    setSendModal({ type: 'weekly', data: { birthdays: bdays || [], anniversaries: annivers || [] }, start: startBday, end: endBday })
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

      {(bdays !== null || annivers !== null) && (
        <div className="flex gap-2 justify-end pt-1 items-center">
          {!(bdays !== null && annivers !== null) && (
            <span className="text-xs text-slate-400 italic mr-1">
              Generate both reports to unlock Combined Weekly
            </span>
          )}
          <button onClick={downloadWeeklyPdf}
            disabled={bdays === null || annivers === null}
            title={bdays === null || annivers === null ? 'Generate both Birthday and Anniversary reports first' : ''}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium border border-slate-400 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition">
            <FileDown size={13} /> Download Combined Weekly PDF
          </button>
          <button onClick={openWeeklySendModal}
            disabled={bdays === null || annivers === null}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium text-white bg-slate-700 hover:bg-slate-800 dark:bg-slate-600 dark:hover:bg-slate-500 disabled:opacity-40 disabled:cursor-not-allowed transition">
            <Send size={13} /> Send Combined Weekly Report
          </button>
        </div>
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
      const isWeekly = type === 'weekly'
      const pdf = isWeekly
        ? buildWeeklyReportPdf(data.birthdays, data.anniversaries, church, startDate, endDate, true)
        : buildReportPdf(type, data, church, startDate, endDate, true)
      const blob   = pdf.output('blob')
      const fname  = `${type}-report-${startDate}.pdf`
      const pdfUrl = await uploadToStorage('announcement-reports', fname, blob, 'application/pdf')
      const msg    = isWeekly
        ? `${church?.church_name || 'Church'} — Weekly Report (${fmtDate(startDate)} to ${fmtDate(endDate)})`
        : `${church?.church_name || 'Church'} — ${type === 'birthday' ? 'Birthday' : 'Anniversary'} Report (${fmtDate(startDate)} to ${fmtDate(endDate)})`

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
            {type === 'weekly' ? 'Combined Weekly' : type === 'birthday' ? 'Birthday' : 'Anniversary'} report · {fmtDate(startDate)} to {fmtDate(endDate)}
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
   EXCLUSION WISH LIST PANEL
   ════════════════════════════════════════════════════════════ */
/* ────────────────────────────────────────────────────────────
   Greeting card template generator
   ──────────────────────────────────────────────────────────── */
function GreetingTemplatesPanel({ perms, toast, church }) {
  const [counts,      setCounts]      = useState({ birthday: 0, anniversary: 0 })
  const [generating,  setGenerating]  = useState(null) // 'birthday' | 'anniversary' | null

  const loadCounts = useCallback(async () => {
    try {
      const [bRes, aRes] = await Promise.all([
        supabase.storage.from('announcement-cards').list('templates/birthday',  { limit: 100 }),
        supabase.storage.from('announcement-cards').list('templates/anniversary', { limit: 100 }),
      ])
      const count = files => (files || []).filter(f => f.name.endsWith('.png') && !f.name.startsWith('.')).length
      setCounts({ birthday: count(bRes.data), anniversary: count(aRes.data) })
    } catch { /* bucket may not exist yet */ }
  }, [])

  useEffect(() => { loadCounts() }, [loadCounts])

  const generate = async (type) => {
    if (!perms?.canEdit) return
    setGenerating(type)
    try {
      const { getRandomVerse } = await import('../lib/announcements')
      const { generateGreetingCard } = await import('../lib/greetingCard')
      const N = 5
      for (let i = 0; i < N; i++) {
        const verse = await getRandomVerse(type)
        const blob  = await generateGreetingCard({
          type,
          names:      '',
          churchName: church?.church_name || '',
          city:       church?.city        || '',
          address:    church?.address     || '',
          verse,
        })
        const path = `templates/${type}/card_${Date.now()}_${i}.png`
        const { error } = await supabase.storage
          .from('announcement-cards')
          .upload(path, blob, { contentType: 'image/jpeg', upsert: true })
        if (error) throw error
      }
      toast(`${N} ${type} templates generated.`, 'success')
      loadCounts()
    } catch (err) {
      toast('Generate failed: ' + err.message, 'error')
    }
    setGenerating(null)
  }

  const clear = async (type) => {
    if (!perms?.canEdit) return
    try {
      const { data: files } = await supabase.storage
        .from('announcement-cards').list(`templates/${type}`, { limit: 100 })
      const names = (files || []).filter(f => f.name.endsWith('.png'))
        .map(f => `templates/${type}/${f.name}`)
      if (names.length) await supabase.storage.from('announcement-cards').remove(names)
      toast(`${type} templates cleared.`, 'success')
      loadCounts()
    } catch (err) {
      toast('Clear failed: ' + err.message, 'error')
    }
  }

  const TypeRow = ({ type, label }) => (
    <div className="flex items-center justify-between py-2">
      <div>
        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{label}</span>
        <span className="ml-2 text-xs text-gray-400">({counts[type]} card{counts[type] !== 1 ? 's' : ''})</span>
      </div>
      <div className="flex gap-2">
        <button
          onClick={() => generate(type)}
          disabled={!!generating || !perms?.canEdit}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium text-white transition"
          style={{ background: generating === type ? '#6b7280' : '#1d4ed8' }}
        >
          {generating === type
            ? <><Loader2 size={11} className="animate-spin" /> Generating…</>
            : <><Plus size={11} /> Generate 5</>}
        </button>
        {counts[type] > 0 && perms?.canEdit && (
          <button
            onClick={() => clear(type)}
            disabled={!!generating}
            className="px-2.5 py-1.5 rounded text-xs text-red-600 border border-red-200 hover:bg-red-50 dark:border-red-800 dark:hover:bg-red-900/20 transition"
          >
            Clear
          </button>
        )}
      </div>
    </div>
  )

  return (
    <div className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700">
        <p className="font-semibold text-sm text-gray-800 dark:text-white">Greeting Card Templates</p>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
          Pre-generated cards stored in Supabase Storage. Auto greetings pick one randomly per send.
        </p>
      </div>
      <div className="px-4 divide-y divide-gray-100 dark:divide-gray-700">
        <TypeRow type="birthday"    label="🎂 Birthday" />
        <TypeRow type="anniversary" label="💍 Anniversary" />
      </div>
    </div>
  )
}

function ExclusionPanel({ perms, profile, toast }) {
  const [exclusions,   setExclusions]   = useState([])
  const [loadingList,  setLoadingList]  = useState(true)
  const [searchVal,    setSearchVal]    = useState('')
  const [searchResults,setSearchResults]= useState([])
  const [searching,    setSearching]    = useState(false)
  const [showDrop,     setShowDrop]     = useState(false)
  const [selected,     setSelected]     = useState(null)   // {member_id,member_name,family_id}
  const [exType,       setExType]       = useState('anniversary')
  const [reason,       setReason]       = useState('')
  const [adding,       setAdding]       = useState(false)
  const [removingIds,  setRemovingIds]  = useState(new Set())
  const searchTimer = useRef(null)

  const load = useCallback(async () => {
    setLoadingList(true)
    try { setExclusions(await getExclusions()) } catch {}
    finally { setLoadingList(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const onSearch = val => {
    setSearchVal(val); setSelected(null)
    clearTimeout(searchTimer.current)
    if (!val.trim()) { setSearchResults([]); setShowDrop(false); return }
    searchTimer.current = setTimeout(async () => {
      setSearching(true)
      const { data } = await supabase.from('members')
        .select('member_id,member_name,family_id')
        .or(`member_id.ilike.%${val}%,member_name.ilike.%${val}%`)
        .eq('is_active', true).order('member_id').limit(10)
      setSearchResults(data || [])
      setShowDrop(true)
      setSearching(false)
    }, 300)
  }

  const pick = m => {
    setSelected(m)
    setSearchVal(`${m.member_id} — ${m.member_name}`)
    setShowDrop(false)
  }

  const add = async () => {
    if (!selected) { toast('Select a member first', 'error'); return }
    setAdding(true)
    try {
      await upsertExclusion({
        member_id: selected.member_id, member_name: selected.member_name,
        family_id: selected.family_id, exclusion_type: exType,
        reason, added_by: profile?.full_name || profile?.email,
      })
      toast(`${selected.member_name} added to exclusion list`, 'success')
      setSelected(null); setSearchVal(''); setReason(''); setExType('anniversary')
      await load()
    } catch (err) { toast('Error: ' + err.message, 'error') }
    finally { setAdding(false) }
  }

  const remove = async (id, name) => {
    setRemovingIds(s => new Set(s).add(id))
    try {
      await removeExclusion(id)
      toast(`${name} removed from exclusion list`, 'success')
      setExclusions(e => e.filter(x => x.id !== id))
    } catch (err) { toast('Error: ' + err.message, 'error') }
    finally { setRemovingIds(s => { const n = new Set(s); n.delete(id); return n }) }
  }

  const typeLabel = t => t === 'anniversary' ? 'Anniversary' : t === 'birthday' ? 'Birthday' : 'Both'
  const typePill  = t => t === 'both' ? 'pill-red' : t === 'anniversary' ? 'pill-purple' : 'pill-blue'

  return (
    <div className="space-y-4 mt-6 pt-6" style={{ borderTop: '1px solid var(--card-border)' }}>
      {/* Header */}
      <div className="flex items-center gap-2">
        <UserX size={16} className="text-red-500" />
        <h3 className="font-semibold text-sm text-gray-800 dark:text-white">Exclusion Wish List</h3>
      </div>
      <p className="text-xs text-gray-500 dark:text-gray-400 -mt-2">
        Members listed here are skipped in all wish sends — WhatsApp (auto &amp; manual) and PDF reports.
        Useful for widowed or divorced members who prefer not to receive anniversary wishes.
      </p>

      {/* Add form */}
      {perms?.canEdit && (
        <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 space-y-3">
          {/* Member search */}
          <div style={{ position: 'relative' }}>
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">
              Search member
            </label>
            <div style={{ position: 'relative' }}>
              <input
                className="field-input w-full"
                placeholder="Type member ID or name…"
                value={searchVal}
                onChange={e => onSearch(e.target.value)}
                onFocus={() => searchResults.length > 0 && setShowDrop(true)}
                onBlur={() => setTimeout(() => setShowDrop(false), 200)}
                autoComplete="off"
              />
              {searching && (
                <Loader2 size={14} className="animate-spin absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)' }} />
              )}
            </div>
            {showDrop && searchResults.length > 0 && (
              <div style={{
                position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 300,
                background: 'var(--card-bg)', border: '1px solid var(--card-border)',
                borderRadius: 8, boxShadow: '0 6px 20px rgba(0,0,0,0.13)',
                maxHeight: 200, overflowY: 'auto', marginTop: 3,
              }}>
                {searchResults.map(m => (
                  <div key={m.member_id} onMouseDown={() => pick(m)}
                    className="hover:bg-gray-50 dark:hover:bg-slate-700"
                    style={{ padding: '7px 12px', cursor: 'pointer', fontSize: 13, display: 'flex', gap: 10 }}>
                    <span style={{ fontWeight: 700, fontFamily: 'monospace', color: 'var(--info)', minWidth: 84 }}>{m.member_id}</span>
                    <span style={{ color: 'var(--text-2)' }}>{m.member_name}</span>
                    <span style={{ color: 'var(--text-3)', fontSize: 11, marginLeft: 'auto' }}>{m.family_id}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Exclude from */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1.5">
              Exclude from
            </label>
            <div className="flex gap-5 flex-wrap">
              {[['anniversary','Anniversary wishes'],['birthday','Birthday wishes'],['both','Both']].map(([val, lbl]) => (
                <label key={val} className="flex items-center gap-1.5 cursor-pointer text-sm text-gray-700 dark:text-gray-300">
                  <input type="radio" name="exType" value={val} checked={exType === val}
                    onChange={() => setExType(val)} className="accent-red-600" />
                  {lbl}
                </label>
              ))}
            </div>
          </div>

          {/* Reason */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">
              Reason <span className="font-normal">(optional)</span>
            </label>
            <input
              className="field-input w-full"
              placeholder="e.g. Widowed, Divorced"
              value={reason}
              onChange={e => setReason(e.target.value)}
            />
          </div>

          <button onClick={add} disabled={adding || !selected}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm text-white font-medium disabled:opacity-50 transition"
            style={{ background: '#991b1b' }}>
            {adding ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
            Add to Exclusion List
          </button>
        </div>
      )}

      {/* Current list */}
      {loadingList ? <Spinner label="Loading exclusions…" /> : exclusions.length === 0 ? (
        <p className="text-xs text-gray-400 italic">No exclusions configured — all members receive wishes.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
          <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--page-bg)', borderBottom: '2px solid var(--card-border)' }}>
                {['Member ID','Name','Excluded From','Reason','Added By',''].map(h => (
                  <th key={h} style={{ padding: '7px 10px', fontWeight: 700, color: 'var(--text-3)', fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5, textAlign: 'left' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {exclusions.map(ex => (
                <tr key={ex.id} style={{ borderBottom: '1px solid var(--table-border)' }}>
                  <td style={{ padding: '7px 10px', fontFamily: 'monospace', fontWeight: 700, color: 'var(--info)' }}>{ex.member_id}</td>
                  <td style={{ padding: '7px 10px', color: 'var(--text-1)', fontWeight: 600 }}>{ex.member_name}</td>
                  <td style={{ padding: '7px 10px' }}>
                    <span className={`pill ${typePill(ex.exclusion_type)}`}>{typeLabel(ex.exclusion_type)}</span>
                  </td>
                  <td style={{ padding: '7px 10px', color: 'var(--text-2)' }}>{ex.reason || '—'}</td>
                  <td style={{ padding: '7px 10px', color: 'var(--text-3)', fontSize: 11 }}>{ex.added_by || '—'}</td>
                  <td style={{ padding: '7px 10px' }}>
                    {perms?.canEdit && (
                      <button onClick={() => remove(ex.id, ex.member_name)}
                        disabled={removingIds.has(ex.id)}
                        className="text-red-400 hover:text-red-600 disabled:opacity-40 transition">
                        {removingIds.has(ex.id) ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                      </button>
                    )}
                  </td>
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
   SETTINGS TAB
   ════════════════════════════════════════════════════════════ */
const DAYS_OF_WEEK = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']
const BEARER_OPTIONS = [
  { key: 'presbyter',  label: 'Presbyter / Pastor' },
  { key: 'secretary',  label: 'Secretary'           },
  { key: 'treasurer',  label: 'Treasurer'           },
  { key: 'admin1',     label: 'Admin 1'             },
]

function SettingsTab({ perms, profile, toast, church }) {
  const DEFAULTS = {
    auto_report_enabled: false,
    auto_greeting_enabled: false,
    report_day: 6,
    report_time: '18:00',
    report_bearers: 'presbyter,secretary,treasurer',
    greeting_time: '08:00',
  }
  const [settings,       setSettings]       = useState(DEFAULTS)
  const [loading,        setLoading]        = useState(true)
  const [savingReport,   setSavingReport]   = useState(false)
  const [savingGreeting, setSavingGreeting] = useState(false)

  useEffect(() => {
    getAnnouncementSettings().then(s => {
      if (s) setSettings({
        auto_report_enabled:   s.auto_report_enabled   ?? false,
        auto_greeting_enabled: s.auto_greeting_enabled ?? false,
        report_day:     s.report_day     ?? 6,
        report_time:    s.report_time    ?? '18:00',
        report_bearers: s.report_bearers ?? 'presbyter,secretary,treasurer',
        greeting_time:  s.greeting_time  ?? '08:00',
      })
      setLoading(false)
    })
  }, [])

  const set = (k, v) => setSettings(s => ({ ...s, [k]: v }))

  const toggleBearer = key => {
    const current = settings.report_bearers.split(',').filter(Boolean)
    const next = current.includes(key) ? current.filter(k => k !== key) : [...current, key]
    set('report_bearers', next.join(','))
  }

  const bearerList = settings.report_bearers.split(',').filter(Boolean)
  const by = profile?.full_name || profile?.email

  const saveReport = async () => {
    if (settings.auto_report_enabled && bearerList.length === 0) {
      toast('Select at least one office bearer to receive the report.', 'error'); return
    }
    setSavingReport(true)
    try {
      await saveAnnouncementSettings({
        auto_report_enabled: settings.auto_report_enabled,
        report_day:          settings.report_day,
        report_time:         settings.report_time,
        report_bearers:      settings.report_bearers,
      }, by)
      toast('Weekly report settings saved.', 'success')
    } catch (err) { toast('Save failed: ' + err.message, 'error') }
    setSavingReport(false)
  }

  const saveGreeting = async () => {
    setSavingGreeting(true)
    try {
      await saveAnnouncementSettings({
        auto_greeting_enabled: settings.auto_greeting_enabled,
        greeting_time:         settings.greeting_time,
      }, by)
      toast('Greeting settings saved.', 'success')
    } catch (err) { toast('Save failed: ' + err.message, 'error') }
    setSavingGreeting(false)
  }

  if (loading) return <Spinner label="Loading settings…" />

  const Toggle = ({ keyName }) => (
    <button
      onClick={() => perms?.canEdit && set(keyName, !settings[keyName])}
      disabled={!perms?.canEdit}
      className="flex-shrink-0 transition"
    >
      {settings[keyName]
        ? <ToggleRight size={36} className="text-green-500" />
        : <ToggleLeft  size={36} className="text-gray-300 dark:text-gray-600" />}
    </button>
  )

  const SaveBtn = ({ onClick, saving, label = 'Save' }) => (
    perms?.canEdit ? (
      <button onClick={onClick} disabled={saving}
        className="flex items-center gap-1.5 px-4 py-1.5 rounded text-xs font-semibold text-white transition"
        style={{ background: saving ? '#6b7280' : '#14532d' }}>
        {saving && <Loader2 size={11} className="animate-spin" />}
        {saving ? 'Saving…' : label}
      </button>
    ) : null
  )

  return (
    <div className="space-y-4 max-w-xl">
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3 text-xs text-blue-800 dark:text-blue-300">
        Automated sends require Supabase Edge Functions and pg_cron to be deployed.
        Manual send from the Dashboard tab works independently.
      </div>

      {/* ── Auto Weekly Report ── */}
      <div className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="flex items-start justify-between gap-4 p-4">
          <div>
            <p className="font-semibold text-sm text-gray-800 dark:text-white">Auto Weekly Report</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              Sends the forthcoming week's birthday &amp; anniversary report via WhatsApp.
            </p>
          </div>
          <Toggle keyName="auto_report_enabled" />
        </div>

        <div className="px-4 pb-4 space-y-4 border-t border-gray-100 dark:border-gray-700 pt-4">
          {settings.auto_report_enabled && (<>
            {/* Day + Time */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">Send on day</label>
                <select
                  value={settings.report_day}
                  onChange={e => set('report_day', Number(e.target.value))}
                  disabled={!perms?.canEdit}
                  className="field-input w-full"
                >
                  {DAYS_OF_WEEK.map((d, i) => <option key={i} value={i}>{d}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">Send at time</label>
                <input
                  type="time"
                  value={settings.report_time}
                  onChange={e => set('report_time', e.target.value)}
                  disabled={!perms?.canEdit}
                  className="field-input w-full"
                />
              </div>
            </div>

            {/* Office bearers */}
            <div>
              <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-2">Send report to</label>
              <div className="flex flex-wrap gap-3">
                {BEARER_OPTIONS.map(({ key, label }) => (
                  <label key={key} className="flex items-center gap-2 cursor-pointer text-sm text-gray-700 dark:text-gray-300">
                    <input
                      type="checkbox"
                      checked={bearerList.includes(key)}
                      onChange={() => perms?.canEdit && toggleBearer(key)}
                      disabled={!perms?.canEdit}
                      className="accent-green-600 w-4 h-4"
                    />
                    {label}
                  </label>
                ))}
              </div>
            </div>
          </>)}

          <div className="flex justify-end">
            <SaveBtn onClick={saveReport} saving={savingReport} label="Save Report Settings" />
          </div>
        </div>
      </div>

      {/* ── Auto Greeting Wishes ── */}
      <div className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="flex items-start justify-between gap-4 p-4">
          <div>
            <p className="font-semibold text-sm text-gray-800 dark:text-white">Auto Greeting Wishes</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              Sends birthday &amp; anniversary greeting card images to members on their special day via WhatsApp.
            </p>
          </div>
          <Toggle keyName="auto_greeting_enabled" />
        </div>

        <div className="px-4 pb-4 border-t border-gray-100 dark:border-gray-700 pt-4 space-y-4">
          {settings.auto_greeting_enabled && (
            <div className="max-w-[160px]">
              <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">Send at time</label>
              <input
                type="time"
                value={settings.greeting_time}
                onChange={e => set('greeting_time', e.target.value)}
                disabled={!perms?.canEdit}
                className="field-input w-full"
              />
            </div>
          )}
          <div className="flex justify-end">
            <SaveBtn onClick={saveGreeting} saving={savingGreeting} label="Save Greeting Settings" />
          </div>
        </div>
      </div>

      <GreetingTemplatesPanel perms={perms} toast={toast} church={church} />

      <ExclusionPanel perms={perms} profile={profile} toast={toast} />
    </div>
  )
}

/* ════════════════════════════════════════════════════════════
   PDF builder (jsPDF)
   ════════════════════════════════════════════════════════════ */
function buildReportPages(doc, type, data, church, startDate, endDate, { skipFinalPass = false } = {}) {
  const pw = doc.internal.pageSize.getWidth()   // 210
  const ph = doc.internal.pageSize.getHeight()  // 297
  const isBday = type === 'birthday'

  const MX = 12, MY = 10
  const cw = pw - MX * 2   // 186
  const ch = ph - MY * 2   // 277

  // Accent colour per section
  const ACCENT = isBday ? [175, 75, 0] : [155, 20, 75]

  // Professional pastel day palette
  const DAY = {
    Sunday:    { row: [255, 247, 237], badge: [217, 119,   6] },
    Monday:    { row: [239, 246, 255], badge: [ 37,  99, 235] },
    Tuesday:   { row: [240, 253, 244], badge: [ 22, 163,  74] },
    Wednesday: { row: [254, 252, 232], badge: [202, 138,   4] },
    Thursday:  { row: [250, 245, 255], badge: [124,  58, 237] },
    Friday:    { row: [255, 241, 242], badge: [225,  29,  72] },
    Saturday:  { row: [236, 254, 255], badge: [ 14, 116, 144] },
  }
  const DAY_DEF = { row: [248, 249, 251], badge: [120, 130, 150] }

  // Layout
  const HEADER_H  = 28
  const TH_H      = 8
  const ROW_H     = 8
  const FOOTER_H  = 7
  const TABLE_TOP = MY + HEADER_H      // 38
  const TABLE_BOT = ph - MY - FOOTER_H // 280
  const FOOTER_Y  = ph - MY - FOOTER_H // 280

  // Column defs: [label, width_mm, align]
  const colDefs = isBday
    ? [['#', 7, 'c'], ['Member ID', 22, 'c'], ['Member Name', 72, 'l'],
       ['Date', 26, 'c'], ['Age', 18, 'c'], ['Day', 41, 'c']]
    : [['#', 7, 'c'], ['Family ID', 20, 'c'], ['Couple Names', 76, 'l'],
       ['Ann. Date', 26, 'c'], ['Years', 16, 'c'], ['Day', 41, 'c']]

  const initPage = () => {
    doc.setFillColor(255, 255, 255)
    doc.rect(MX, MY, cw, ch, 'F')
  }

  const drawHeader = () => {
    doc.setFillColor(255, 255, 255)
    doc.rect(MX, MY, cw, HEADER_H, 'F')

    // Church name — Times Bold for elegance
    doc.setFont('times', 'bold')
    doc.setFontSize(16)
    doc.setTextColor(25, 25, 35)
    doc.text(church?.church_name || 'Church', pw / 2, MY + 9, { align: 'center' })

    // City / state
    const cityLine = [church?.city, church?.state].filter(Boolean).join(', ')
    if (cityLine) {
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(7.5)
      doc.setTextColor(120, 120, 130)
      doc.text(cityLine, pw / 2, MY + 14, { align: 'center' })
    }

    // Thin accent rule
    const ruleY = cityLine ? MY + 17 : MY + 15
    doc.setDrawColor(...ACCENT)
    doc.setLineWidth(0.4)
    doc.line(MX + 10, ruleY, MX + cw - 10, ruleY)

    // Report title
    doc.setFont('helvetica', 'bolditalic')
    doc.setFontSize(11)
    doc.setTextColor(...ACCENT)
    doc.text(
      isBday ? 'Birthday Report' : 'Wedding Anniversary Report',
      pw / 2, ruleY + 6, { align: 'center' }
    )

    // Date range + record count
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7)
    doc.setTextColor(145, 148, 158)
    doc.text(`${fmtDate(startDate)} – ${fmtDate(endDate)}`, MX + 3, MY + HEADER_H - 1.5)
    doc.text(`${data.length} Record${data.length !== 1 ? 's' : ''}`,
      MX + cw - 3, MY + HEADER_H - 1.5, { align: 'right' })
  }

  // ── Column header row ────────────────────────────────────
  const drawTableHeader = () => {
    doc.setFillColor(242, 244, 247)
    doc.rect(MX, TABLE_TOP, cw, TH_H, 'F')

    // Accent underline
    doc.setDrawColor(...ACCENT)
    doc.setLineWidth(0.55)
    doc.line(MX, TABLE_TOP + TH_H, MX + cw, TABLE_TOP + TH_H)

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7.5)
    doc.setTextColor(55, 60, 75)
    let cx = MX
    colDefs.forEach(([label, w, align]) => {
      const x = align === 'c' ? cx + w / 2 : cx + 3
      doc.text(label, x, TABLE_TOP + 5.5, { align: align === 'c' ? 'center' : 'left' })
      doc.setDrawColor(205, 210, 220)
      doc.setLineWidth(0.15)
      if (cx + w < MX + cw) doc.line(cx + w, TABLE_TOP + 1, cx + w, TABLE_TOP + TH_H - 1)
      cx += w
    })
  }

  const drawFooter = (pageNum, pageCount) => {
    doc.setDrawColor(200, 205, 215)
    doc.setLineWidth(0.3)
    doc.line(MX, FOOTER_Y, MX + cw, FOOTER_Y)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(6.5)
    doc.setTextColor(150, 155, 165)
    doc.text(`Generated: ${new Date().toLocaleDateString('en-IN')}`, MX + 2, FOOTER_Y + 4.5)
    doc.text(`Page ${pageNum} / ${pageCount}`, MX + cw - 2, FOOTER_Y + 4.5, { align: 'right' })
  }

  const drawBorder = () => {
    doc.setDrawColor(25, 25, 35)
    doc.setLineWidth(0.5)
    doc.rect(MX, MY, cw, ch)
  }

  const rows = data.map(r => isBday
    ? [r.serial, r.member_id || r.family_id, r.member_name, r.displayDate, r.age, r.dayName]
    : [r.serial, r.member_id || r.family_id, r.displayName, r.displayDate, r.years, r.dayName]
  )

  const startNewPage = () => {
    doc.addPage()
    initPage()
    drawHeader()
    drawTableHeader()
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(30, 32, 42)
  }

  initPage()
  drawHeader()
  drawTableHeader()
  let y = TABLE_TOP + TH_H
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(30, 32, 42)

  rows.forEach(row => {
    if (y + ROW_H > TABLE_BOT - 2) { startNewPage(); y = TABLE_TOP + TH_H }

    const dayKey = String(row[5] || '')
    const dc = DAY[dayKey] || DAY_DEF

    doc.setFillColor(...dc.row)
    doc.rect(MX, y, cw, ROW_H, 'F')

    let cx = MX
    colDefs.forEach(([, w, align], i) => {
      const cell   = row[i] != null ? String(row[i]) : ''
      const isLast = i === colDefs.length - 1

      if (isLast) {
        const bPad = 2
        doc.setFillColor(...dc.badge)
        doc.roundedRect(cx + bPad, y + bPad, w - 2 * bPad, ROW_H - 2 * bPad, 1.5, 1.5, 'F')
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(6.5)
        doc.setTextColor(255, 255, 255)
        doc.text(cell, cx + w / 2, y + ROW_H / 2 + 0.8, { align: 'center' })
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(8)
        doc.setTextColor(30, 32, 42)
      } else {
        const x = align === 'c' ? cx + w / 2 : cx + 3
        doc.text(cell, x, y + 5.5, {
          align: align === 'c' ? 'center' : 'left',
          maxWidth: align === 'l' ? w - 5 : undefined,
        })
      }

      if (i < colDefs.length - 1) {
        doc.setDrawColor(210, 215, 228)
        doc.setLineWidth(0.12)
        doc.line(cx + w, y + 1, cx + w, y + ROW_H - 1)
      }
      cx += w
    })

    doc.setDrawColor(225, 228, 238)
    doc.setLineWidth(0.1)
    doc.line(MX, y + ROW_H, MX + cw, y + ROW_H)
    y += ROW_H
  })

  if (!skipFinalPass) {
    const totalPages = doc.getNumberOfPages()
    for (let pg = 1; pg <= totalPages; pg++) {
      doc.setPage(pg)
      drawBorder()
      drawFooter(pg, totalPages)
    }
  }

  return { drawBorder, drawFooter }
}

function buildReportPdf(type, data, church, startDate, endDate, returnDoc = false) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  buildReportPages(doc, type, data, church, startDate, endDate)
  if (returnDoc) return doc
  doc.save(`${type}-report-${startDate}.pdf`)
}

function buildWeeklyReportPdf(birthdays, anniversaries, church, start, end, returnDoc = false) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })

  // Birthday section — skip final pass so we can continue adding pages
  const bdHandles = buildReportPages(doc, 'birthday', birthdays, church, start, end, { skipFinalPass: true })
  const bdPageCount = doc.getNumberOfPages()

  // Anniversary section on new page
  doc.addPage()
  const annHandles = buildReportPages(doc, 'anniversary', anniversaries, church, start, end, { skipFinalPass: true })

  // Single final pass over all pages with correct section numbering + accent colour
  const totalPages = doc.getNumberOfPages()
  const annPageCount = totalPages - bdPageCount

  for (let pg = 1; pg <= totalPages; pg++) {
    doc.setPage(pg)
    if (pg <= bdPageCount) {
      bdHandles.drawBorder()
      bdHandles.drawFooter(pg, bdPageCount)
    } else {
      const annPg = pg - bdPageCount
      annHandles.drawBorder()
      annHandles.drawFooter(annPg, annPageCount)
    }
  }

  if (returnDoc) return doc
  doc.save(`weekly-report-${start}.pdf`)
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
