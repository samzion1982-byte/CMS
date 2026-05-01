/* ═══════════════════════════════════════════════════════════════
   AnnouncementsLogPage.jsx — Sent message history (admin)
   ═══════════════════════════════════════════════════════════════ */

import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../lib/AuthContext'
import { getAnnouncementsLog } from '../lib/announcements'
import { exportToExcel } from '../lib/exportExcel'
import { CheckCircle, XCircle, Clock, Loader2, ChevronLeft, ChevronRight, ClipboardList, FileSpreadsheet } from 'lucide-react'

const ADMIN_ROLES = ['super_admin', 'admin', 'admin1']
const PAGE_SIZE   = 50

const TYPE_LABELS = {
  birthday_wish:    { label: 'Birthday Wish',    color: '#92400e', bg: '#fef3c7' },
  anniversary_wish: { label: 'Anniversary Wish', color: '#9d174d', bg: '#fce7f3' },
  weekly_report:    { label: 'Weekly Report',    color: '#1e40af', bg: '#eff6ff' },
}

const STATUS_ICONS = {
  sent:    <CheckCircle size={14} className="text-green-500" />,
  failed:  <XCircle    size={14} className="text-red-500"   />,
  pending: <Clock      size={14} className="text-amber-500" />,
}

const fmtDT = iso => {
  if (!iso) return '—'
  const d = new Date(iso)
  const p = n => String(n).padStart(2, '0')
  return `${p(d.getDate())}-${p(d.getMonth()+1)}-${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`
}

export default function AnnouncementsLogPage() {
  const { profile } = useAuth()

  const [rows,      setRows]      = useState([])
  const [total,     setTotal]     = useState(0)
  const [page,      setPage]      = useState(0)
  const [loading,   setLoading]   = useState(false)
  const [exporting, setExporting] = useState(false)
  const [logType,   setLogType]   = useState('')
  const [status,    setStatus]    = useState('')

  if (!ADMIN_ROLES.includes(profile?.role)) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-1">Access Denied</h2>
          <p className="text-gray-500 dark:text-gray-400 text-sm">Admin access required.</p>
        </div>
      </div>
    )
  }

  const load = useCallback(async (p = 0) => {
    setLoading(true)
    try {
      const { data, count } = await getAnnouncementsLog({
        limit: PAGE_SIZE, offset: p * PAGE_SIZE, logType, status,
      })
      setRows(data); setTotal(count); setPage(p)
    } finally {
      setLoading(false)
    }
  }, [logType, status])

  useEffect(() => { load(0) }, [load])

  const totalPages = Math.ceil(total / PAGE_SIZE)

  async function exportExcel() {
    setExporting(true)
    try {
      const { data: all } = await getAnnouncementsLog({ limit: 10000, offset: 0, logType, status })
      const columns = [
        { header: 'Sent At',      key: 'sent_at',      width: 20 },
        { header: 'Type',         key: 'type',         width: 22 },
        { header: 'Recipient',    key: 'recipient',    width: 28 },
        { header: 'Number',       key: 'number',       width: 18 },
        { header: 'Event Date',   key: 'event_date',   width: 14 },
        { header: 'Status',       key: 'status',       width: 12 },
        { header: 'Triggered By', key: 'triggered_by', width: 14 },
        { header: 'Message',      key: 'message',      width: 50 },
      ]
      const rows = (all || []).map(r => ({
        sent_at:      fmtDT(r.sent_at),
        type:         TYPE_LABELS[r.log_type]?.label || r.log_type || '—',
        recipient:    r.recipient_name   || '—',
        number:       r.recipient_number || '—',
        event_date:   r.event_date       || '—',
        status:       r.status           || '—',
        triggered_by: r.triggered_by     || 'auto',
        message:      r.message_preview  || '—',
      }))
      const date = new Date().toISOString().slice(0, 10)
      await exportToExcel(columns, rows, 'Announcements Log', `announcements-log-${date}.xlsx`)
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="animate-fade-in p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-1">Announcements Log</h1>
        <p className="text-gray-500 dark:text-gray-400 text-sm">History of all WhatsApp messages sent via Announcements.</p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-4">
        <select value={logType} onChange={e => { setLogType(e.target.value) }}
          className="field-input" style={{ width: 200 }}>
          <option value="">All Types</option>
          <option value="birthday_wish">Birthday Wish</option>
          <option value="anniversary_wish">Anniversary Wish</option>
          <option value="weekly_report">Weekly Report</option>
        </select>
        <select value={status} onChange={e => { setStatus(e.target.value) }}
          className="field-input" style={{ width: 160 }}>
          <option value="">All Statuses</option>
          <option value="sent">Sent</option>
          <option value="failed">Failed</option>
          <option value="pending">Pending</option>
        </select>
        <div className="ml-auto flex items-center gap-3">
          <span className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
            <ClipboardList size={15} /> {total} records
          </span>
          <button onClick={exportExcel} disabled={exporting || !total}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-green-300 bg-green-50 text-green-700 hover:bg-green-100 disabled:opacity-50 transition">
            {exporting ? <Loader2 size={13} className="animate-spin" /> : <FileSpreadsheet size={13} />}
            {exporting ? 'Exporting…' : 'Excel Export'}
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-40 gap-2 text-gray-500">
            <Loader2 size={20} className="animate-spin" />
            <span className="text-sm">Loading…</span>
          </div>
        ) : !rows.length ? (
          <div className="flex items-center justify-center h-40">
            <p className="text-gray-400 text-sm">No log entries found.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full" style={{ fontSize: 12 }}>
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
                  {['Sent At','Type','Recipient','Number','Event Date','Status','Triggered By','Message'].map(h => (
                    <th key={h} className="px-3 py-2 text-left text-xs font-semibold text-gray-600 dark:text-gray-300">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map(r => {
                  const tm = TYPE_LABELS[r.log_type] || { label: r.log_type, color: '#374151', bg: '#f9fafb' }
                  return (
                    <tr key={r.id} className="border-t border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/40">
                      <td className="px-3 py-2 text-gray-600 dark:text-gray-400 whitespace-nowrap">{fmtDT(r.sent_at)}</td>
                      <td className="px-3 py-2">
                        <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium"
                          style={{ background: tm.bg, color: tm.color }}>{tm.label}</span>
                      </td>
                      <td className="px-3 py-2 text-gray-800 dark:text-white">{r.recipient_name || '—'}</td>
                      <td className="px-3 py-2 text-gray-500 dark:text-gray-400 font-mono">{r.recipient_number || '—'}</td>
                      <td className="px-3 py-2 text-gray-500 dark:text-gray-400">{r.event_date || '—'}</td>
                      <td className="px-3 py-2">
                        <span className="flex items-center gap-1 capitalize">
                          {STATUS_ICONS[r.status] || null} {r.status}
                        </span>
                        {r.status === 'failed' && r.error_message && (
                          <span className="block text-xs text-red-400 mt-0.5 max-w-xs truncate" title={r.error_message}>
                            {r.error_message}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <span className="inline-block px-2 py-0.5 rounded text-xs capitalize"
                          style={{ background: r.triggered_by === 'auto' ? '#eff6ff' : '#f0fdf4',
                            color: r.triggered_by === 'auto' ? '#1e40af' : '#166534' }}>
                          {r.triggered_by || 'auto'}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-gray-500 dark:text-gray-400 max-w-xs truncate" title={r.message_preview}>
                        {r.message_preview || '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Page {page + 1} of {totalPages} ({total} records)
          </p>
          <div className="flex gap-2">
            <button onClick={() => load(page - 1)} disabled={page === 0 || loading}
              className="p-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 transition">
              <ChevronLeft size={16} />
            </button>
            <button onClick={() => load(page + 1)} disabled={page >= totalPages - 1 || loading}
              className="p-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 transition">
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
