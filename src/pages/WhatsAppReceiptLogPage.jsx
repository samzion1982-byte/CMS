/* ═══════════════════════════════════════════════════════════════
   WhatsAppReceiptLogPage.jsx — WhatsApp receipt send history
   ═══════════════════════════════════════════════════════════════ */

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { exportToExcel } from '../lib/exportExcel'
import { CheckCircle, XCircle, Loader2, ChevronLeft, ChevronRight, MessageSquare, RefreshCw, Download } from 'lucide-react'

const PAGE_SIZE = 50

const fmtDT = iso => {
  if (!iso) return '—'
  const d = new Date(iso)
  const p = n => String(n).padStart(2, '0')
  return `${p(d.getDate())}-${p(d.getMonth()+1)}-${d.getFullYear()}  ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

export default function WhatsAppReceiptLogPage() {
  const { profile } = useAuth()
  const [rows,       setRows]       = useState([])
  const [total,      setTotal]      = useState(0)
  const [page,       setPage]       = useState(0)
  const [loading,    setLoading]    = useState(false)
  const [filterStatus, setFilterStatus] = useState('all')

  const isAdmin = ['super_admin', 'admin', 'admin1'].includes(profile?.role)
  const [exporting, setExporting] = useState(false)

  const handleExport = async () => {
    setExporting(true)
    try {
      let q = supabase
        .from('whatsapp_receipt_logs')
        .select('*')
        .order('sent_at', { ascending: false })
      if (filterStatus !== 'all') q = q.eq('status', filterStatus)
      const { data } = await q
      const cols = [
        { header: 'Date / Time',    key: 'sent_at',         align: 'left'  },
        { header: 'Receipt No',     key: 'receipt_number',  align: 'left'  },
        { header: 'Member Name',    key: 'member_name',     align: 'left'  },
        { header: 'WhatsApp No',    key: 'whatsapp_number', align: 'left'  },
        { header: 'API Type',       key: 'api_type',        align: 'center'},
        { header: 'Status',         key: 'status',          align: 'center'},
      ]
      const rows = (data || []).map(r => ({
        sent_at:         fmtDT(r.sent_at),
        receipt_number:  r.receipt_number  || '',
        member_name:     r.member_name     || '',
        whatsapp_number: r.whatsapp_number || '',
        api_type:        r.api_type === 'official' ? 'Official' : 'Soft7',
        status:          r.status === 'sent' ? 'Sent' : 'Failed',
      }))
      await exportToExcel(cols, rows, 'WhatsApp Receipts', `WhatsApp_Receipts_${new Date().toISOString().slice(0,10)}.xlsx`)
    } catch (e) { console.error(e) }
    setExporting(false)
  }

  const load = useCallback(async () => {
    setLoading(true)
    try {
      let q = supabase
        .from('whatsapp_receipt_logs')
        .select('*', { count: 'exact' })
        .order('sent_at', { ascending: false })
        .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1)

      if (filterStatus !== 'all') q = q.eq('status', filterStatus)

      const { data, count, error } = await q
      if (error) throw error
      setRows(data || [])
      setTotal(count || 0)
    } catch (e) {
      console.error(e)
    }
    setLoading(false)
  }, [page, filterStatus])

  useEffect(() => { load() }, [load])
  useEffect(() => { setPage(0) }, [filterStatus])

  if (!isAdmin) {
    return <div className="flex items-center justify-center h-64 text-slate-400 text-sm">Access denied.</div>
  }

  const totalPages = Math.ceil(total / PAGE_SIZE)

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <MessageSquare size={20} style={{ color: 'var(--accent)', flexShrink: 0 }} />
              WhatsApp Receipt Log
            </h1>
          <p className="page-subtitle">Track all receipt WhatsApp sends — {total} total entries</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={handleExport} disabled={exporting || loading}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', borderRadius: 8,
              border: '1.5px solid var(--accent)', background: 'var(--accent)', color: '#fff',
              fontSize: 12, fontWeight: 600, cursor: exporting ? 'wait' : 'pointer', opacity: exporting ? 0.7 : 1 }}>
            {exporting ? <Loader2 size={13} className="animate-spin"/> : <Download size={13}/>}
            Export Excel
          </button>
          <button onClick={load} disabled={loading} className="btn btn-secondary btn-sm">
            {loading ? <Loader2 size={13} className="animate-spin"/> : <RefreshCw size={13}/>}
            Refresh
          </button>
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex gap-2 mb-4">
        {[['all','All'],['sent','Sent'],['failed','Failed']].map(([val, label]) => (
          <button key={val} onClick={() => setFilterStatus(val)}
            style={{
              padding: '5px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600,
              border: '1.5px solid',
              borderColor: filterStatus === val ? (val === 'failed' ? '#dc2626' : val === 'sent' ? '#16a34a' : 'var(--accent)') : 'var(--card-border)',
              background:  filterStatus === val ? (val === 'failed' ? '#fef2f2' : val === 'sent' ? '#f0fdf4' : 'var(--accent-subtle)') : 'var(--page-bg)',
              color:       filterStatus === val ? (val === 'failed' ? '#dc2626' : val === 'sent' ? '#16a34a' : 'var(--accent)') : 'var(--text-3)',
              cursor: 'pointer',
            }}>
            {label}
          </button>
        ))}
      </div>

      <div className="card overflow-hidden">
        {loading && rows.length === 0 ? (
          <div className="flex items-center justify-center h-40 gap-2 text-slate-400 text-sm">
            <Loader2 size={18} className="animate-spin"/>Loading…
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-slate-400 text-sm gap-2">
            <MessageSquare size={28} className="opacity-20"/>
            No logs found
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: 'var(--table-header-bg, #f1f5f9)' }}>
                {['Date / Time','Receipt No','Member','WhatsApp','API','Status'].map(h => (
                  <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, fontSize: 11,
                    color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.05em',
                    borderBottom: '1px solid var(--card-border)', whiteSpace: 'nowrap' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                return (
                  <>
                    <tr key={r.id}
                      style={{
                        background: i % 2 === 0 ? 'var(--card-bg)' : 'var(--table-alt-row, #f8fafc)',
                        borderBottom: '1px solid var(--card-border)',
                      }}>
                      <td style={{ padding: '10px 14px', whiteSpace: 'nowrap', color: 'var(--text-2)', fontSize: 12 }}>
                        {fmtDT(r.sent_at)}
                      </td>
                      <td style={{ padding: '10px 14px', fontFamily: 'monospace', fontWeight: 600, color: 'var(--text-1)', whiteSpace: 'nowrap' }}>
                        {r.receipt_number || '—'}
                      </td>
                      <td style={{ padding: '10px 14px', color: 'var(--text-1)', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {r.member_name || '—'}
                      </td>
                      <td style={{ padding: '10px 14px', fontFamily: 'monospace', color: 'var(--text-2)', fontSize: 12 }}>
                        {r.whatsapp_number || '—'}
                      </td>
                      <td style={{ padding: '10px 14px' }}>
                        <span style={{
                          display: 'inline-block', padding: '2px 8px', borderRadius: 6,
                          fontSize: 11, fontWeight: 700,
                          background: r.api_type === 'official' ? '#eff6ff' : '#f0fdf4',
                          color:      r.api_type === 'official' ? '#2563eb' : '#15803d',
                        }}>
                          {r.api_type === 'official' ? 'Official' : 'Soft7'}
                        </span>
                      </td>
                      <td style={{ padding: '10px 14px' }}>
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', gap: 5,
                          padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700,
                          background: r.status === 'sent' ? '#f0fdf4' : '#fef2f2',
                          color:      r.status === 'sent' ? '#16a34a' : '#dc2626',
                        }}>
                          {r.status === 'sent'
                            ? <CheckCircle size={11}/>
                            : <XCircle size={11}/>}
                          {r.status === 'sent' ? 'Sent' : 'Failed'}
                        </span>
                      </td>
                    </tr>
                  </>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4 text-sm text-slate-500">
          <span>Page {page + 1} of {totalPages}  ({total} entries)</span>
          <div className="flex gap-2">
            <button onClick={() => setPage(p => p - 1)} disabled={page === 0} className="btn btn-secondary btn-sm">
              <ChevronLeft size={14}/>Prev
            </button>
            <button onClick={() => setPage(p => p + 1)} disabled={page >= totalPages - 1} className="btn btn-secondary btn-sm">
              Next<ChevronRight size={14}/>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
