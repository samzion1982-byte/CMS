/* ═══════════════════════════════════════════════════════════════
   BulkReceiptsPrintModal.jsx — Batch print / WhatsApp receipts
   ═══════════════════════════════════════════════════════════════ */

import { useState, useEffect } from 'react'
import { supabase }                            from '../lib/supabase'
import { exportReceiptPDF, formatMonthsPaid }  from '../lib/exportReceiptPDF'
import { sendWhatsAppMessage }                 from '../lib/whatsapp'
import { getActiveCategories }                 from '../lib/paymentCategories'
import {
  X, Loader2, ChevronRight, ChevronLeft,
  ChevronsRight, ChevronsLeft, MessageCircle, Printer, Phone, CalendarX,
} from 'lucide-react'
import JSZip from 'jszip'

// ── helpers ──────────────────────────────────────────────────────────────────

function toYMD(d) {
  return d.toISOString().split('T')[0]
}

function getWeekRange() {
  const today = new Date()
  const day   = today.getDay()                    // 0 = Sunday
  const sun   = new Date(today); sun.setDate(today.getDate() - day)
  const sat   = new Date(today); sat.setDate(today.getDate() + (6 - day))
  return { from: toYMD(sun), to: toYMD(sat) }
}

function fmtDate(s) {
  if (!s) return '—'
  const [y, m, d] = s.split('-')
  return `${d}/${m}/${y}`
}

function buildWAMessage(receipt, church) {
  const dp  = (receipt.receipt_date || '').split('-')
  const dtF = dp.length === 3 ? `${dp[2]}-${dp[1]}-${dp[0]}` : receipt.receipt_date
  return [
    `Dear ${receipt.member_name},`,
    '',
    `Your payment to *${church.church_name}* has been received ✅`,
    '',
    `📋 Receipt No : ${receipt.receipt_number}`,
    `📅 Date          : ${dtF}`,
    `💰 Amount       : ₹${Number(receipt.grand_total).toLocaleString('en-IN')}`,
    receipt.month_paid ? `📆 Month(s)     : ${formatMonthsPaid(receipt.month_paid)}` : null,
    `💳 Mode          : ${receipt.payment_mode}`,
    '',
    'Thank you for your faithful giving. God bless you! 🙏',
  ].filter(l => l !== null).join('\n')
}

// ── component ─────────────────────────────────────────────────────────────────

export default function BulkReceiptsPrintModal({ onClose, initialFY }) {
  const [available,      setAvailable]      = useState([])
  const [selected,       setSelected]       = useState([])
  const [availHighlight, setAvailHighlight] = useState(new Set())
  const [selHighlight,   setSelHighlight]   = useState(new Set())
  const [searchAvail,    setSearchAvail]    = useState('')
  const [searchSel,      setSearchSel]      = useState('')
  const [filterFY,       setFilterFY]       = useState(initialFY || '')
  const [dateFrom,       setDateFrom]       = useState(() => getWeekRange().from)
  const [dateTo,         setDateTo]         = useState(() => getWeekRange().to)
  const [availableFYs,   setAvailableFYs]   = useState([])
  const [loading,        setLoading]        = useState(true)
  const [categories,     setCategories]     = useState([])
  const [church,         setChurch]         = useState(null)
  const [userEmail,      setUserEmail]      = useState('')
  const [generating,     setGenerating]     = useState(false)
  const [genAction,      setGenAction]      = useState('')   // 'print' | 'whatsapp'
  const [progress,       setProgress]       = useState({ current: 0, total: 0, name: '' })
  const [result,         setResult]         = useState(null)
  const [selfChecking,   setSelfChecking]   = useState(false)
  const [selfCheckMsg,   setSelfCheckMsg]   = useState(null)

  // ── init: church, categories, FYs ────────────────────────────────────────
  useEffect(() => {
    const init = async () => {
      let ch = null
      const { data: d1 } = await supabase.from('churches').select('*').eq('is_active', true).limit(1)
      if (d1?.length) ch = d1[0]
      else {
        const { data: d2 } = await supabase.from('churches').select('*').limit(1)
        if (d2?.length) ch = d2[0]
      }
      setChurch(ch)

      const { data: { user } } = await supabase.auth.getUser()
      setUserEmail(user?.email || '')

      const cats = await getActiveCategories().catch(() => [])
      setCategories(cats)

      const { data: fyData } = await supabase
        .from('receipts')
        .select('financial_year')
        .order('financial_year', { ascending: false })
      const fys = [...new Set((fyData || []).map(r => r.financial_year).filter(Boolean))]
      setAvailableFYs(fys)
      if (!initialFY && fys.length) setFilterFY(fys[0])
    }
    init()
  }, [initialFY])

  // ── load receipts when FY changes ────────────────────────────────────────
  useEffect(() => {
    if (!filterFY) { setLoading(false); return }
    setLoading(true)
    // Reset date filters to current week when FY changes
    const wr = getWeekRange()
    setDateFrom(wr.from)
    setDateTo(wr.to)
    setSelected([])
    setAvailHighlight(new Set())
    setSelHighlight(new Set())
    setResult(null)
    supabase
      .from('receipts')
      .select('id,receipt_number,receipt_date,member_id,member_name,whatsapp,mobile,payment_mode,month_paid,grand_total,financial_year,cheque_dd_no,transaction_date,narration')
      .eq('financial_year', filterFY)
      .order('receipt_number', { ascending: false })   // descending — latest first
      .then(({ data }) => {
        setAvailable(data || [])
        setLoading(false)
      })
  }, [filterFY])

  // ── filtered views ────────────────────────────────────────────────────────
  const filteredAvail = available.filter(r => {
    const q = searchAvail.toLowerCase()
    const matchText = (r.receipt_number || '').toLowerCase().includes(q) ||
                      (r.member_name    || '').toLowerCase().includes(q) ||
                      (r.member_id      || '').toLowerCase().includes(q)
    if (!matchText) return false
    if (dateFrom && r.receipt_date && r.receipt_date < dateFrom) return false
    if (dateTo   && r.receipt_date && r.receipt_date > dateTo)   return false
    return true
  })

  const filteredSel = selected.filter(r => {
    const q = searchSel.toLowerCase()
    return (r.receipt_number || '').toLowerCase().includes(q) ||
           (r.member_name    || '').toLowerCase().includes(q) ||
           (r.member_id      || '').toLowerCase().includes(q)
  })

  // descending by receipt_number
  const sortByNo = arr => [...arr].sort((a, b) =>
    (b.receipt_number || '').localeCompare(a.receipt_number || '')
  )

  // ── move handlers ─────────────────────────────────────────────────────────
  const moveHighlighted = () => {
    const moving = available.filter(r => availHighlight.has(r.id))
    setSelected(prev => sortByNo([...prev, ...moving]))
    setAvailable(prev => prev.filter(r => !availHighlight.has(r.id)))
    setAvailHighlight(new Set())
  }

  // "Select All" only moves what is currently visible (respects date + search filter)
  const moveAll = () => {
    const visibleIds = new Set(filteredAvail.map(r => r.id))
    const moving = available.filter(r => visibleIds.has(r.id))
    setSelected(prev => sortByNo([...prev, ...moving]))
    setAvailable(prev => prev.filter(r => !visibleIds.has(r.id)))
    setAvailHighlight(new Set())
  }

  const revertHighlighted = () => {
    const moving = selected.filter(r => selHighlight.has(r.id))
    setAvailable(prev => sortByNo([...prev, ...moving]))
    setSelected(prev => prev.filter(r => !selHighlight.has(r.id)))
    setSelHighlight(new Set())
  }
  const revertAll = () => {
    setAvailable(prev => sortByNo([...prev, ...selected]))
    setSelected([])
    setSelHighlight(new Set())
  }
  const toggleHighlight = (setter, id, evt) => {
    setter(prev => {
      const next = new Set(evt.ctrlKey || evt.metaKey ? prev : [])
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const clearDates = () => { setDateFrom(''); setDateTo('') }
  const hasDateFilter = dateFrom || dateTo

  // ── WhatsApp Self Check — sends from church number TO admin1 ─────────────
  const doSelfCheck = async () => {
    if (!church) return
    // Recipient: admin1 → treasurer → whatsapp_number (fallback)
    const to = church.admin1_whatsapp || church.treasurer_whatsapp || church.whatsapp_number
    if (!to) {
      setSelfCheckMsg({ ok: false, text: 'No admin / treasurer WhatsApp number found in Church Setup.' })
      return
    }
    setSelfChecking(true)
    setSelfCheckMsg(null)
    const timeStr  = new Date().toLocaleTimeString('en-IN', { hour12: true })
    const apiLabel = church.whatsapp_api_type === 'official' ? 'Official (Meta WABA)' : 'Unofficial (Soft7)'
    const msg = [
      `🔔 *WhatsApp Test Message*`,
      '',
      `Church : *${church.church_name}*`,
      `API     : ${apiLabel}`,
      `Time   : ${timeStr}`,
      '',
      `✅ Receipt WhatsApp delivery is working correctly.`,
    ].join('\n')
    try {
      await sendWhatsAppMessage(church, { to, message: msg })
      setSelfCheckMsg({ ok: true, text: `Test message sent to ${to} (Admin)` })
    } catch (err) {
      setSelfCheckMsg({ ok: false, text: `Failed: ${err.message}` })
    }
    setSelfChecking(false)
  }

  // ── Print All → ZIP ───────────────────────────────────────────────────────
  const doPrintAll = async () => {
    if (!selected.length) return
    setGenerating(true)
    setGenAction('print')
    setResult(null)
    let printed = 0, failed = 0
    try {
      const zip    = new JSZip()
      const folder = zip.folder(`receipts_${filterFY}`)
      for (let i = 0; i < selected.length; i++) {
        const rec = selected[i]
        setProgress({ current: i + 1, total: selected.length, name: rec.receipt_number })
        try {
          const { data: items } = await supabase
            .from('receipt_items').select('category_id,amt,months,total')
            .eq('receipt_id', rec.id)
          const blob = await exportReceiptPDF({ receipt: rec, receiptItems: items || [], categories, church })
          folder.file(`${rec.receipt_number}.pdf`, blob)
          printed++
        } catch { failed++ }
      }
      const zipBlob = await zip.generateAsync({ type: 'blob' })
      const url   = URL.createObjectURL(zipBlob)
      const a     = document.createElement('a')
      const now   = new Date()
      const stamp = `${String(now.getDate()).padStart(2,'0')}-${String(now.getMonth()+1).padStart(2,'0')}-${now.getFullYear()}`
      a.href = url
      a.download = `receipts_${filterFY}_${stamp}.zip`
      a.click()
      URL.revokeObjectURL(url)
      setResult({ printed, failed })
    } catch (e) {
      alert('Bulk PDF generation failed: ' + e.message)
    }
    setGenerating(false)
    setProgress({ current: 0, total: 0, name: '' })
  }

  // ── WhatsApp All ──────────────────────────────────────────────────────────
  const doWhatsAppAll = async () => {
    if (!selected.length || !church) return
    setGenerating(true)
    setGenAction('whatsapp')
    setResult(null)
    let sent = 0, failed = 0, skipped = 0
    for (let i = 0; i < selected.length; i++) {
      const rec = selected[i]
      let to = rec.whatsapp || rec.mobile
      setProgress({ current: i + 1, total: selected.length, name: rec.member_name || rec.receipt_number })

      // Receipt may have been saved without a phone — fall back to member record
      if (!to && rec.member_id) {
        const { data: mem } = await supabase
          .from('members').select('whatsapp, mobile')
          .eq('member_id', rec.member_id).single()
        to = mem?.whatsapp || mem?.mobile || ''
      }

      if (!to) { skipped++; continue }

      const logBase = {
        receipt_number:  rec.receipt_number,
        member_name:     rec.member_name,
        whatsapp_number: to,
        api_type:        church.whatsapp_api_type || 'soft7',
        created_by:      userEmail,
      }
      try {
        const { data: items } = await supabase
          .from('receipt_items').select('category_id,amt,months,total')
          .eq('receipt_id', rec.id)

        let pdfUrl = null
        try {
          const pdfBlob = await exportReceiptPDF({ receipt: rec, receiptItems: items || [], categories, church })
          const pdfPath = `${rec.financial_year}/${rec.receipt_number}.pdf`
          await supabase.storage.from('receipt-pdfs').upload(pdfPath, pdfBlob, { contentType: 'application/pdf', upsert: true })
          const { data: urlData } = supabase.storage.from('receipt-pdfs').getPublicUrl(pdfPath)
          pdfUrl = urlData?.publicUrl || null
        } catch { /* send text-only if PDF fails */ }

        const msg     = buildWAMessage(rec, church)
        const apiResp = await sendWhatsAppMessage(church, { to, message: msg, mediaUrl: pdfUrl })
        await supabase.from('whatsapp_receipt_logs').insert({ ...logBase, message: msg, status: 'sent', api_response: apiResp })
        sent++
      } catch (err) {
        await supabase.from('whatsapp_receipt_logs').insert({
          receipt_number:  rec.receipt_number,
          member_name:     rec.member_name,
          whatsapp_number: to,
          api_type:        church.whatsapp_api_type || 'soft7',
          created_by:      userEmail,
          status:          'failed',
          error_text:      err.message,
        }).catch(() => {})
        failed++
      }
    }
    setResult({ sent, failed, skipped })
    setGenerating(false)
    setProgress({ current: 0, total: 0, name: '' })
  }

  // ── derived ───────────────────────────────────────────────────────────────
  const canWA       = !!(church?.whatsapp_api_type)
  const isBatchMode = church?.whatsapp_receipt_mode === 'batch'
  const canWAAction = canWA && isBatchMode   // WA Self Check + WA All require batch mode
  const pct         = progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0

  // ── styles ────────────────────────────────────────────────────────────────
  const panelStyle = {
    flex: 1, display: 'flex', flexDirection: 'column',
    background: '#fff', border: '1px solid #d1d5db', borderRadius: 8, overflow: 'hidden', minWidth: 0,
  }
  const listStyle = { flex: 1, overflowY: 'auto', padding: '4px 0', minHeight: 0 }
  const itemStyle = (hi) => ({
    padding: '5px 10px', cursor: 'pointer', fontSize: 12,
    fontFamily: 'Arial, sans-serif', userSelect: 'none',
    background: hi ? '#1e3a5f' : 'transparent',
    color: hi ? '#fff' : '#111',
    display: 'flex', gap: 4, alignItems: 'baseline',
  })
  const midBtn = (disabled, bg = '#1e3a5f') => ({
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
    background: disabled ? '#9ca3af' : bg, color: '#fff',
    border: 'none', borderRadius: 6, padding: '6px 10px',
    cursor: disabled ? 'not-allowed' : 'pointer',
    fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap',
    opacity: disabled ? 0.65 : 1,
  })
  const searchStyle = {
    width: '100%', padding: '6px 10px', fontSize: 12,
    border: 'none', borderBottom: '1px solid #e5e7eb', outline: 'none',
    background: '#f9fafb', boxSizing: 'border-box',
  }
  const panelHdr = {
    padding: '8px 12px', background: '#1e3a5f', color: '#fff',
    fontSize: 12, fontWeight: 700, letterSpacing: 0.5,
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    flexShrink: 0,
  }
  const labelStyle = { fontSize: 11, fontWeight: 700, color: '#64748b', whiteSpace: 'nowrap' }
  const dateInput  = {
    padding: '4px 8px', fontSize: 12, borderRadius: 6,
    border: '1px solid #cbd5e1', background: '#fff', color: '#1e293b',
    outline: 'none', cursor: 'pointer',
  }

  // ── render ────────────────────────────────────────────────────────────────
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.78)',
      zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        width: 960, maxHeight: '94vh', background: '#f1f5f9',
        borderRadius: 12, boxShadow: '0 20px 60px rgba(0,0,0,0.45)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>

        {/* ── Title bar ──────────────────────────────────────────────── */}
        <div style={{
          background: '#1e3a5f', color: '#fff', padding: '14px 20px',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          flexShrink: 0,
        }}>
          <div>
            <span style={{ fontWeight: 700, fontSize: 15, letterSpacing: 0.3 }}>
              Bulk Receipts Print / WhatsApp
            </span>
            {church && (
              <span style={{ marginLeft: 12, fontSize: 11, opacity: 0.6 }}>
                {canWA
                  ? `WhatsApp: ${church.whatsapp_api_type === 'official' ? 'Official API' : 'Unofficial API'}`
                  : 'WhatsApp not configured'}
              </span>
            )}
          </div>
          <button onClick={onClose}
            style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', padding: 4 }}>
            <X size={18} />
          </button>
        </div>

        {/* ── Filter bar: FY dropdown + date range ───────────────────── */}
        <div style={{
          padding: '10px 16px', background: '#e2e8f0', borderBottom: '1px solid #cbd5e1',
          display: 'flex', gap: 16, alignItems: 'center', flexShrink: 0, flexWrap: 'wrap',
        }}>
          {/* FY dropdown */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={labelStyle}>Financial Year</span>
            <select
              value={filterFY}
              onChange={e => !generating && setFilterFY(e.target.value)}
              disabled={generating}
              style={{
                padding: '4px 28px 4px 10px', fontSize: 12, fontWeight: 600,
                borderRadius: 6, border: '1px solid #cbd5e1',
                background: '#fff', color: '#1e293b', cursor: generating ? 'not-allowed' : 'pointer',
                outline: 'none', appearance: 'none',
                backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2364748b' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`,
                backgroundRepeat: 'no-repeat', backgroundPosition: 'right 8px center',
              }}
            >
              {availableFYs.length === 0
                ? <option value="">No FYs found</option>
                : availableFYs.map(fy => (
                    <option key={fy} value={fy}>FY {fy}</option>
                  ))
              }
            </select>
          </div>

          {/* Divider */}
          <div style={{ width: 1, height: 24, background: '#cbd5e1' }} />

          {/* Date range */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={labelStyle}>From</span>
            <input
              type="date"
              value={dateFrom}
              onChange={e => setDateFrom(e.target.value)}
              disabled={generating}
              style={dateInput}
            />
            <span style={labelStyle}>To</span>
            <input
              type="date"
              value={dateTo}
              onChange={e => setDateTo(e.target.value)}
              disabled={generating}
              style={dateInput}
            />
            {hasDateFilter && (
              <button
                onClick={clearDates}
                disabled={generating}
                title="Clear date filter"
                style={{
                  display: 'flex', alignItems: 'center', gap: 4,
                  padding: '4px 10px', borderRadius: 6, border: '1px solid #fca5a5',
                  background: '#fef2f2', color: '#dc2626', fontSize: 11, fontWeight: 600,
                  cursor: generating ? 'not-allowed' : 'pointer',
                }}>
                <CalendarX size={12}/> Clear
              </button>
            )}
          </div>

          {/* Live count hint */}
          {hasDateFilter && !loading && (
            <span style={{ fontSize: 11, color: '#64748b', marginLeft: 'auto' }}>
              {filteredAvail.length} of {available.length} receipts match date filter
            </span>
          )}
        </div>

        {/* ── Body ───────────────────────────────────────────────────── */}
        <div style={{ flex: 1, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10, minHeight: 0, overflowY: 'auto' }}>

          {/* ── Batch-mode warning ─────────────────────────────────────── */}
          {canWA && !isBatchMode && (
            <div style={{
              padding: '8px 14px', borderRadius: 7, fontSize: 12, fontWeight: 500,
              background: '#fffbeb', border: '1px solid #fcd34d', color: '#92400e',
              flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <span style={{ fontSize: 16 }}>⚠️</span>
              <span>
                WhatsApp receipt mode is set to <strong>Instant on save</strong> — WA Self Check and WhatsApp All are disabled.
                Go to <strong>Church Setup → WhatsApp Receipt</strong> and switch to <strong>Batch send later</strong> to enable bulk sending.
              </span>
            </div>
          )}

          {/* Dual listbox */}
          <div style={{ display: 'flex', gap: 10, flex: 1, minHeight: 300 }}>

            {/* LEFT — Available */}
            <div style={panelStyle}>
              <div style={panelHdr}>
                <span>Available Receipts</span>
                <span style={{ fontSize: 11, fontWeight: 400, opacity: 0.8 }}>
                  {loading ? '…' : (
                    hasDateFilter
                      ? `${filteredAvail.length} shown / ${available.length} total`
                      : `${available.length} receipts`
                  )}
                </span>
              </div>
              <input
                placeholder="Search receipt no, member…"
                value={searchAvail}
                onChange={e => setSearchAvail(e.target.value)}
                style={searchStyle}
              />
              <div style={listStyle}>
                {loading
                  ? <div style={{ padding: 20, textAlign: 'center', color: '#6b7280', fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                      <Loader2 size={14} className="animate-spin"/> Loading…
                    </div>
                  : filteredAvail.length === 0
                  ? <div style={{ padding: 20, textAlign: 'center', color: '#9ca3af', fontSize: 12 }}>
                      {searchAvail || hasDateFilter ? 'No receipts match filters' : `No receipts for FY ${filterFY}`}
                    </div>
                  : filteredAvail.map(r => (
                      <div key={r.id}
                        style={itemStyle(availHighlight.has(r.id))}
                        onClick={e => toggleHighlight(setAvailHighlight, r.id, e)}
                        onDoubleClick={() => {
                          setSelected(prev => sortByNo([...prev, r]))
                          setAvailable(prev => prev.filter(x => x.id !== r.id))
                          setAvailHighlight(new Set())
                        }}
                      >
                        <span style={{ fontWeight: 700, flexShrink: 0 }}>{r.receipt_number}</span>
                        <span style={{ opacity: 0.7, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {r.member_name}
                        </span>
                        <span style={{ opacity: 0.5, fontSize: 10, flexShrink: 0 }}>{fmtDate(r.receipt_date)}</span>
                        <span style={{ fontWeight: 700, fontSize: 11, flexShrink: 0, marginLeft: 4 }}>
                          ₹{Number(r.grand_total || 0).toLocaleString('en-IN')}
                        </span>
                      </div>
                    ))
                }
              </div>
            </div>

            {/* CENTER — action buttons */}
            <div style={{
              display: 'flex', flexDirection: 'column', justifyContent: 'center',
              gap: 6, flexShrink: 0, width: 136,
            }}>
              <button title="Move highlighted →" onClick={moveHighlighted}
                disabled={availHighlight.size === 0 || generating}
                style={midBtn(availHighlight.size === 0 || generating)}>
                <ChevronRight size={13}/> Move
              </button>
              <button
                title={hasDateFilter ? 'Select all visible (date-filtered)' : 'Select all'}
                onClick={moveAll}
                disabled={filteredAvail.length === 0 || generating}
                style={midBtn(filteredAvail.length === 0 || generating)}>
                <ChevronsRight size={13}/>
                {hasDateFilter ? 'Sel. Filtered' : 'Select All'}
              </button>
              <button title="← Revert highlighted" onClick={revertHighlighted}
                disabled={selHighlight.size === 0 || generating}
                style={midBtn(selHighlight.size === 0 || generating)}>
                <ChevronLeft size={13}/> Revert
              </button>
              <button title="← Deselect all" onClick={revertAll}
                disabled={selected.length === 0 || generating}
                style={midBtn(selected.length === 0 || generating)}>
                <ChevronsLeft size={13}/> Deselect All
              </button>

              <div style={{ borderTop: '1px solid #cbd5e1', margin: '4px 0' }} />

              {/* WhatsApp Self Check */}
              <button
                onClick={doSelfCheck}
                disabled={selfChecking || generating || !canWAAction}
                title={
                  !canWA        ? 'Configure WhatsApp in Church Setup first' :
                  !isBatchMode  ? 'Change WhatsApp Receipt to "Batch send later" in Church Setup' :
                                  `Send test WA from church to Admin (${church?.admin1_whatsapp || church?.treasurer_whatsapp || '—'})`
                }
                style={midBtn(selfChecking || generating || !canWAAction, '#7c3aed')}>
                {selfChecking ? <Loader2 size={12} className="animate-spin"/> : <Phone size={12}/>}
                WA Self Check
              </button>

              {/* Print All */}
              <button
                onClick={doPrintAll}
                disabled={generating || selected.length === 0}
                title={`Generate PDFs for ${selected.length} selected receipt(s) and download as ZIP`}
                style={midBtn(generating || selected.length === 0, '#15803d')}>
                {generating && genAction === 'print'
                  ? <Loader2 size={12} className="animate-spin"/>
                  : <Printer size={12}/>}
                Print All {selected.length > 0 ? `(${selected.length})` : ''}
              </button>

              {/* WhatsApp All */}
              <button
                onClick={doWhatsAppAll}
                disabled={generating || selected.length === 0 || !canWAAction}
                title={
                  !canWA       ? 'Configure WhatsApp in Church Setup first' :
                  !isBatchMode ? 'Change WhatsApp Receipt to "Batch send later" in Church Setup' :
                                 `Send WhatsApp to ${selected.length} member(s)`
                }
                style={midBtn(generating || selected.length === 0 || !canWAAction, '#d97706')}>
                {generating && genAction === 'whatsapp'
                  ? <Loader2 size={12} className="animate-spin"/>
                  : <MessageCircle size={12}/>}
                WA All {selected.length > 0 ? `(${selected.length})` : ''}
              </button>
            </div>

            {/* RIGHT — Selected */}
            <div style={panelStyle}>
              <div style={panelHdr}>
                <span>Selected for Action</span>
                <span style={{ fontSize: 11, fontWeight: 400, opacity: 0.8 }}>
                  {selected.length} selected
                </span>
              </div>
              <input
                placeholder="Search…"
                value={searchSel}
                onChange={e => setSearchSel(e.target.value)}
                style={searchStyle}
              />
              <div style={listStyle}>
                {filteredSel.length === 0
                  ? <div style={{ padding: 20, textAlign: 'center', color: '#9ca3af', fontSize: 12 }}>
                      Double-click or use arrows to add receipts
                    </div>
                  : filteredSel.map(r => (
                      <div key={r.id}
                        style={itemStyle(selHighlight.has(r.id))}
                        onClick={e => toggleHighlight(setSelHighlight, r.id, e)}
                        onDoubleClick={() => {
                          setAvailable(prev => sortByNo([...prev, r]))
                          setSelected(prev => prev.filter(x => x.id !== r.id))
                          setSelHighlight(new Set())
                        }}
                      >
                        <span style={{ fontWeight: 700, flexShrink: 0 }}>{r.receipt_number}</span>
                        <span style={{ opacity: 0.7, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {r.member_name}
                        </span>
                        <span style={{ opacity: 0.5, fontSize: 10, flexShrink: 0 }}>{fmtDate(r.receipt_date)}</span>
                        <span style={{ fontWeight: 700, fontSize: 11, flexShrink: 0, marginLeft: 4 }}>
                          ₹{Number(r.grand_total || 0).toLocaleString('en-IN')}
                        </span>
                      </div>
                    ))
                }
              </div>
            </div>
          </div>

          {/* ── Self-check result ──────────────────────────────────────── */}
          {selfCheckMsg && (
            <div style={{
              padding: '8px 14px', borderRadius: 7, fontSize: 12, fontWeight: 600,
              background: selfCheckMsg.ok ? '#f0fdf4' : '#fef2f2',
              color:      selfCheckMsg.ok ? '#15803d' : '#dc2626',
              border:     `1px solid ${selfCheckMsg.ok ? '#bbf7d0' : '#fecaca'}`,
              flexShrink: 0,
            }}>
              {selfCheckMsg.ok ? '✅ ' : '❌ '}{selfCheckMsg.text}
            </div>
          )}

          {/* ── Progress bar ───────────────────────────────────────────── */}
          {generating && (
            <div style={{ flexShrink: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#374151', marginBottom: 4 }}>
                <span>
                  {genAction === 'print' ? 'Generating PDF' : 'Sending WhatsApp'}{' '}
                  {progress.current} of {progress.total}:{' '}
                  <strong>{progress.name}</strong>
                </span>
                <span>{pct}%</span>
              </div>
              <div style={{ height: 8, background: '#e5e7eb', borderRadius: 4, overflow: 'hidden' }}>
                <div style={{
                  height: '100%', width: `${pct}%`, borderRadius: 4, transition: 'width 0.3s',
                  background: genAction === 'whatsapp' ? '#d97706' : '#15803d',
                }} />
              </div>
            </div>
          )}

          {/* ── Result summary ─────────────────────────────────────────── */}
          {result && !generating && (
            <div style={{
              padding: '10px 16px', borderRadius: 8, fontSize: 12,
              background: '#f0f9ff', border: '1px solid #bae6fd', flexShrink: 0,
              display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'center',
            }}>
              <strong style={{ color: '#0369a1' }}>Result:</strong>
              {result.printed != null && (
                <span>📄 <strong>{result.printed}</strong> PDF{result.printed !== 1 ? 's' : ''} generated</span>
              )}
              {result.sent != null && (
                <span style={{ color: '#15803d' }}>✅ <strong>{result.sent}</strong> sent</span>
              )}
              {result.failed != null && result.failed > 0 && (
                <span style={{ color: '#dc2626' }}>❌ <strong>{result.failed}</strong> failed</span>
              )}
              {result.skipped != null && result.skipped > 0 && (
                <span style={{ color: '#d97706' }}>⚠️ <strong>{result.skipped}</strong> skipped (no number)</span>
              )}
              {result.failed != null && result.failed > 0 && (
                <span style={{ color: '#6b7280', marginLeft: 'auto' }}>Check WhatsApp Logs for details</span>
              )}
            </div>
          )}

          {/* ── Footer ─────────────────────────────────────────────────── */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
            <span style={{ fontSize: 11, color: '#9ca3af' }}>
              Click to highlight · Ctrl+Click for multi-select · Double-click to move
            </span>
            <button onClick={onClose} style={{
              padding: '8px 22px', borderRadius: 7, border: '1px solid #d1d5db',
              background: '#fff', fontSize: 13, cursor: 'pointer', fontWeight: 600, color: '#374151',
            }}>
              Close
            </button>
          </div>

        </div>
      </div>
    </div>
  )
}
