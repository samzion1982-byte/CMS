/* ═══════════════════════════════════════════════════════════════
   PaymentRequestLogPage.jsx — Full history of payment requests
   ═══════════════════════════════════════════════════════════════ */

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useToast } from '../lib/toast'
import { Send, Loader2, Search, X, RefreshCw, CheckCircle, XCircle, Clock } from 'lucide-react'

const STATUS = {
  pending:        { bg: '#eff6ff', color: '#2563eb', label: 'Pending'           },
  paid_by_member: { bg: '#fef3c7', color: '#d97706', label: 'Paid (Unconfirmed)'},
  confirmed:      { bg: '#f0fdf4', color: '#16a34a', label: 'Confirmed'         },
  cancelled:      { bg: '#fef2f2', color: '#dc2626', label: 'Cancelled'         },
}

function fmtDT(s) {
  if (!s) return '—'
  return new Date(s).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

export default function PaymentRequestLogPage() {
  const toast = useToast()

  const [requests,      setRequests]      = useState([])
  const [loading,       setLoading]       = useState(true)
  const [search,        setSearch]        = useState('')
  const [filterStatus,  setFilterStatus]  = useState('all')

  const load = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('payment_requests')
      .select('*, payment_request_logs(id, status, error_text, sent_at)')
      .order('created_at', { ascending: false })
      .limit(500)
    if (!error) setRequests(data || [])
    else toast(error.message, 'error')
    setLoading(false)
  }, [toast])

  useEffect(() => { load() }, [load])

  const counts = { all: requests.length }
  Object.keys(STATUS).forEach(s => { counts[s] = requests.filter(r => r.status === s).length })

  const filtered = requests.filter(r => {
    const q = search.toLowerCase()
    const ok = !q
      || r.member_name?.toLowerCase().includes(q)
      || r.member_id?.toLowerCase().includes(q)
      || r.months?.toLowerCase().includes(q)
      || r.fy?.toLowerCase().includes(q)
    return ok && (filterStatus === 'all' || r.status === filterStatus)
  })

  const tabs = [
    ['all', 'All', counts.all, '#64748b'],
    ...Object.entries(STATUS).map(([k, v]) => [k, v.label, counts[k] || 0, v.color]),
  ]

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Send size={20} style={{ color: 'var(--accent)', flexShrink: 0 }}/>
            Payment Request Log
          </h1>
          <p className="page-subtitle">History of all payment requests sent to members</p>
        </div>
        <button onClick={load} disabled={loading} className="btn btn-ghost btn-sm" title="Refresh">
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''}/>
        </button>
      </div>

      {/* Status filter */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
        {tabs.map(([val, label, count, color]) => (
          <button key={val} onClick={() => setFilterStatus(val)} style={{
            padding: '4px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600,
            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5,
            border: `1.5px solid ${filterStatus === val ? color : 'var(--card-border)'}`,
            background: filterStatus === val ? color + '18' : 'transparent',
            color: filterStatus === val ? color : 'var(--text-3)',
          }}>
            {label}
            <span style={{
              background: filterStatus === val ? color : 'var(--page-bg)',
              color: filterStatus === val ? '#fff' : 'var(--text-3)',
              borderRadius: 10, padding: '0 5px', fontSize: 10, minWidth: 18, textAlign: 'center',
            }}>{count}</span>
          </button>
        ))}
      </div>

      {/* Search */}
      <div style={{ position: 'relative', marginBottom: 14 }}>
        <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }}/>
        <input className="field-input" style={{ paddingLeft: 30 }}
          placeholder="Search member name, ID, month or FY…"
          value={search} onChange={e => setSearch(e.target.value)}/>
        {search && (
          <button onClick={() => setSearch('')} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 2 }}>
            <X size={13}/>
          </button>
        )}
      </div>

      {loading ? (
        <div style={{ padding: 48, textAlign: 'center' }}>
          <Loader2 size={24} className="animate-spin" style={{ color: 'var(--text-3)', margin: '0 auto' }}/>
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>
          No payment requests found.
        </div>
      ) : (
        <div className="card" style={{ overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--card-border)', background: 'var(--page-bg)' }}>
                {['Member', 'Month(s) / FY', 'Total', 'Status', 'WhatsApp', 'Sent On', 'UPI Ref', 'Edited?'].map((h, i) => (
                  <th key={h} style={{
                    padding: '10px 14px',
                    textAlign: i === 2 ? 'right' : 'left',
                    fontWeight: 700, color: 'var(--text-3)', fontSize: 11,
                    textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap',
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((r, i) => {
                const ss = STATUS[r.status] || STATUS.pending
                return (
                  <tr key={r.id} style={{ borderBottom: '1px solid var(--card-border)', background: i % 2 === 0 ? 'transparent' : 'var(--page-bg)' }}>
                    <td style={{ padding: '10px 14px' }}>
                      <div style={{ fontWeight: 600, color: 'var(--text-1)' }}>{r.member_name}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}>{r.member_id}</div>
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      <div style={{ fontSize: 13, color: 'var(--text-1)', fontWeight: 500 }}>{r.months}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}>{r.fy}</div>
                    </td>
                    <td style={{ padding: '10px 14px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--text-1)' }}>
                      ₹{(r.grand_total || 0).toLocaleString('en-IN')}
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 5, background: ss.bg, color: ss.color }}>
                        {ss.label}
                      </span>
                      {r.status === 'paid_by_member' && r.paid_at && (
                        <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 2 }}>{fmtDT(r.paid_at)}</div>
                      )}
                      {r.status === 'confirmed' && r.confirmed_by && (
                        <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 2 }}>by {r.confirmed_by}</div>
                      )}
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      {(() => {
                        const logs = r.payment_request_logs || []
                        if (!r.whatsapp) return <span style={{ fontSize: 11, color: 'var(--text-3)' }}>No number</span>
                        if (!logs.length) return (
                          <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#94a3b8' }}>
                            <Clock size={13}/> Not sent
                          </span>
                        )
                        const last = logs[logs.length - 1]
                        return last.status === 'sent'
                          ? <div>
                              <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#16a34a' }}>
                                <CheckCircle size={13}/> Sent
                              </span>
                              {last.whatsapp_number && (
                                <div style={{ fontSize: 10, color: 'var(--text-3)', fontFamily: 'var(--font-mono)', marginTop: 2 }}>
                                  {last.whatsapp_number}
                                </div>
                              )}
                            </div>
                          : <div>
                              <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#dc2626' }}>
                                <XCircle size={13}/> Failed
                              </span>
                              {last.whatsapp_number && (
                                <div style={{ fontSize: 10, color: 'var(--text-3)', fontFamily: 'var(--font-mono)', marginTop: 2 }}>
                                  {last.whatsapp_number}
                                </div>
                              )}
                              {last.error_text && (
                                <div style={{ fontSize: 10, color: '#dc2626', marginTop: 2, maxWidth: 160, wordBreak: 'break-word' }}>
                                  {last.error_text}
                                </div>
                              )}
                            </div>
                      })()}
                    </td>
                    <td style={{ padding: '10px 14px', fontSize: 11, color: 'var(--text-3)', whiteSpace: 'nowrap' }}>
                      {fmtDT(r.created_at)}
                    </td>
                    <td style={{ padding: '10px 14px', fontSize: 12, color: 'var(--text-2)', fontFamily: 'var(--font-mono)' }}>
                      {r.upi_ref || '—'}
                    </td>
                    <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                      {r.member_edited_amounts
                        ? <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 7px', borderRadius: 4, background: '#fef3c7', color: '#d97706' }}>Yes</span>
                        : <span style={{ fontSize: 11, color: 'var(--text-3)' }}>—</span>
                      }
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
