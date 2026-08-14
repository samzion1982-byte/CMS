/* ═══════════════════════════════════════════════════════════════
   PaymentSchedulePage.jsx — Member payment frequency management
   ═══════════════════════════════════════════════════════════════ */

import { useState, useEffect, useCallback } from 'react'
import { supabase, getChurch } from '../lib/supabase'
import { getActiveCategories }  from '../lib/paymentCategories'
import { sendWhatsAppMessage }   from '../lib/whatsapp'
import { useAuth } from '../lib/AuthContext'
import { useToast } from '../lib/toast'
import { logCmsAudit } from '../lib/cmsAudit'
import {
  CreditCard, ScanLine, Loader2, Search, UserX,
  CheckSquare, Square, ChevronDown, RefreshCw, Send,
} from 'lucide-react'
import PageHeader from '../components/ui/PageHeader'

const FY_MONTHS  = ['April','May','June','July','August','September','October','November','December','January','February','March']

function getCurFY() {
  const d = new Date(), m = d.getMonth() + 1, y = d.getFullYear()
  return m >= 4 ? `${y}-${String(y + 1).slice(2)}` : `${y - 1}-${String(y).slice(2)}`
}
const VALID_SLOTS = [1, 2, 3, 4, 6, 12]
const SLOT_LABELS = { 1:'Monthly', 2:'Every 2 Months', 3:'Quarterly', 4:'Every 4 Months', 6:'Half-Yearly', 12:'Annual' }
const SLOT_COLORS = { 1:'#2563eb', 2:'#7c3aed', 3:'#0891b2', 4:'#d97706', 6:'#16a34a', 12:'#dc2626' }

function detectSlot(receipts) {
  if (!receipts.length) return 1
  // Use receipt_items.months (number of months per line item) — most reliable source
  const itemMonths = receipts.flatMap(r =>
    (r.receipt_items || []).map(i => parseInt(i.months) || 0).filter(v => v > 0)
  )
  const vals = itemMonths.length ? itemMonths
    // Fallback: count months in month_paid string
    : receipts.map(r => Math.max(1, (r.month_paid || '').split(',').filter(m => m.trim()).length))
  const freq = {}
  vals.forEach(v => { freq[v] = (freq[v] || 0) + 1 })
  const mode = parseInt(Object.entries(freq).sort((a, b) => b[1] - a[1])[0][0])
  return VALID_SLOTS.reduce((p, c) => Math.abs(c - mode) < Math.abs(p - mode) ? c : p)
}

// ── Push Payment helpers ─────────────────────────────────
const FY_MONTHS_PR = ['April','May','June','July','August','September','October','November','December','January','February','March']
const SLOT_DUE_IDX = { 1:[0,1,2,3,4,5,6,7,8,9,10,11], 2:[0,2,4,6,8,10], 3:[0,3,6,9], 4:[0,4,8], 6:[0,6], 12:[0] }
const SLOT_LBL_PR  = { 1:'Monthly', 2:'Every 2 mo', 3:'Quarterly', 4:'Every 4 mo', 6:'Half-Yearly', 12:'Annual' }

function curFY() {
  const m = new Date().getMonth() + 1, y = new Date().getFullYear()
  return m >= 4 ? `${y}-${String(y+1).slice(-2)}` : `${y-1}-${String(y).slice(-2)}`
}
function fyMonthIdx(monthName) { return FY_MONTHS_PR.indexOf(monthName) }
function billingMonths(slot, startIdx) {
  return Array.from({ length: slot }, (_, i) => FY_MONTHS_PR[(startIdx + i) % 12]).join(', ')
}

export default function PaymentSchedulePage() {
  const { profile } = useAuth()
  const toast = useToast()

  const [schedules,   setSchedules]   = useState([])
  const [loading,     setLoading]     = useState(true)
  const [scanning,    setScanning]    = useState(false)
  const [scanFY,      setScanFY]      = useState(getCurFY)
  const [displayFY,   setDisplayFY]   = useState('')   // '' = show all
  const [availFYs,    setAvailFYs]    = useState([])
  const [search,      setSearch]      = useState('')
  const [activeSlot,  setActiveSlot]  = useState('all')
  const [movingId,      setMovingId]      = useState(null)
  const [church,        setChurch]        = useState(null)
  const [categories,    setCategories]    = useState([])
  const [showPushModal, setShowPushModal] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('member_payment_schedules').select('*').order('member_name')
    if (!error) {
      const rows = data || []
      setSchedules(rows)
      // Collect distinct detected_from_fy values for the filter selector
      const fys = [...new Set(rows.map(r => r.detected_from_fy).filter(Boolean))].sort().reverse()
      setAvailFYs(fys)
      // Auto-select the only FY if there's just one; keep current selection otherwise
      setDisplayFY(prev => (fys.length === 1 && !prev) ? fys[0] : prev)
    } else toast(error.message, 'error')
    setLoading(false)
  }, [toast])

  useEffect(() => { load() }, [load])
  useEffect(() => { getChurch().then(setChurch).catch(() => {}) }, [])
  useEffect(() => { getActiveCategories().then(setCategories).catch(() => setCategories([])) }, [])

  async function runScan() {
    const fy = scanFY.trim()
    if (!fy.match(/^\d{4}-\d{2}$/)) {
      toast('Enter FY as YYYY-YY (e.g. 2026-27)', 'error'); return
    }
    setScanning(true)
    try {
      const { data: allReceipts, error } = await supabase
        .from('receipts')
        .select('id, member_id, member_name, whatsapp, month_paid, financial_year, receipt_items(category_id, amt, months)')
        .eq('financial_year', fy)
      if (error) throw error

      // JS-side guard: only process rows that exactly match the requested FY
      const receipts = (allReceipts || []).filter(r => r.financial_year === fy)
      if (!receipts.length) { toast(`No receipts found in FY ${fy}`, 'info'); setScanning(false); return }

      const byMember = {}
      receipts.forEach(r => {
        if (!byMember[r.member_id])
          byMember[r.member_id] = { member_name: r.member_name, whatsapp: r.whatsapp || '', recs: [] }
        else if (!byMember[r.member_id].whatsapp && r.whatsapp)
          byMember[r.member_id].whatsapp = r.whatsapp
        byMember[r.member_id].recs.push(r)
      })

      // Fill in missing WhatsApp numbers from members table
      const missingWA = Object.entries(byMember).filter(([, v]) => !v.whatsapp).map(([id]) => id)
      if (missingWA.length) {
        const { data: mems } = await supabase
          .from('members').select('member_id, whatsapp, mobile').in('member_id', missingWA)
        ;(mems || []).forEach(m => {
          if (byMember[m.member_id]) byMember[m.member_id].whatsapp = m.whatsapp || m.mobile || ''
        })
      }

      const rows = []
      for (const [member_id, { member_name, whatsapp, recs }] of Object.entries(byMember)) {
        const slot   = detectSlot(recs)
        const latest = recs[recs.length - 1]
        const amounts = {}
        ;(latest.receipt_items || []).forEach(i => {
          if (i.amt) amounts[i.category_id] = parseFloat(i.amt)
        })
        rows.push({
          member_id, member_name, whatsapp, slot, amounts,
          detected_from_fy: fy,
          created_by:       profile?.email || '',
          last_modified_by: profile?.email || '',
          updated_at:       new Date().toISOString(),
        })
      }

      const { error: uErr } = await supabase
        .from('member_payment_schedules')
        .upsert(rows, { onConflict: 'member_id' })
      if (uErr) throw uErr
      await logCmsAudit({
        action: 'saved', module: 'finance', entityType: 'payment_schedule',
        entityId: fy, summary: `Scanned payment schedule for ${rows.length} members (FY ${fy})`,
        actor: profile,
      })
      toast(`${rows.length} members scanned from FY ${fy}`, 'success')
      setDisplayFY(fy)
      load()
    } catch (e) { toast('Scan failed: ' + e.message, 'error') }
    setScanning(false)
  }

  async function changeSlot(id, slot) {
    setMovingId(id)
    const prev = schedules.find(s => s.id === id)
    const { error } = await supabase
      .from('member_payment_schedules')
      .update({ slot, last_modified_by: profile?.email, updated_at: new Date().toISOString() })
      .eq('id', id)
    if (!error) {
      setSchedules(prevRows => prevRows.map(s => s.id === id ? { ...s, slot } : s))
      await logCmsAudit({
        action: 'updated', module: 'finance', entityType: 'payment_schedule',
        entityId: id, entityLabel: prev?.member_name || prev?.member_id || id,
        summary: `Changed payment slot for ${prev?.member_name || prev?.member_id || id} → ${slot}`,
        changes: [{ field: 'slot', from: String(prev?.slot ?? ''), to: String(slot) }],
        actor: profile,
      })
    }
    else toast(error.message, 'error')
    setMovingId(null)
  }

  async function toggleExclude(s) {
    const next = !s.excluded_from_online
    const { error } = await supabase
      .from('member_payment_schedules')
      .update({ excluded_from_online: next, last_modified_by: profile?.email, updated_at: new Date().toISOString() })
      .eq('id', s.id)
    if (!error) {
      await logCmsAudit({
        action: 'updated', module: 'finance', entityType: 'payment_schedule',
        entityId: s.id, entityLabel: s.member_name || s.member_id,
        summary: `${next ? 'Excluded' : 'Included'} ${s.member_name || s.member_id} from online payments`,
        changes: [{ field: 'excluded_from_online', from: String(!next), to: String(next) }],
        actor: profile,
      })
    }
    if (!error) setSchedules(prev => prev.map(x => x.id === s.id ? { ...x, excluded_from_online: next } : x))
    else toast(error.message, 'error')
  }

  const fyFiltered = displayFY
    ? schedules.filter(s => s.detected_from_fy === displayFY)
    : schedules

  const counts = { all: fyFiltered.length, excluded: fyFiltered.filter(s => s.excluded_from_online).length }
  VALID_SLOTS.forEach(sl => {
    counts[sl] = fyFiltered.filter(s => s.slot === sl && !s.excluded_from_online).length
  })

  const filtered = fyFiltered.filter(s => {
    const q = search.toLowerCase()
    const matchSearch = !q || s.member_name?.toLowerCase().includes(q) || s.member_id?.toLowerCase().includes(q)
    const matchSlot   = activeSlot === 'all'
      || (activeSlot === 'excluded' ? s.excluded_from_online : (!s.excluded_from_online && s.slot === +activeSlot))
    return matchSearch && matchSlot
  })

  const tabs = [
    ['all', 'All', counts.all, '#64748b'],
    ...VALID_SLOTS.map(s => [String(s), SLOT_LABELS[s], counts[s], SLOT_COLORS[s]]),
    ['excluded', 'Excluded', counts.excluded, '#94a3b8'],
  ]

  return (
    <div className="animate-fade-in">
      <PageHeader
        icon={CreditCard}
        title="Payment Schedule"
        subtitle="Configure payment frequency and online eligibility per member"
      >
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button onClick={() => setShowPushModal(true)}
            className="btn btn-sm"
            style={{ background: '#7c3aed', color: '#fff', border: 'none' }}
            title="Send payment requests to eligible members">
            <Send size={13}/>Push Payment
          </button>
          <button onClick={load} disabled={loading} className="btn btn-ghost btn-sm" title="Refresh">
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''}/>
          </button>
        </div>
      </PageHeader>

      {/* Auto-Scan card */}
      <div className="card p-5 mb-5">
        <p className="form-section form-section-blue" style={{ color: '#0891b2', borderColor: '#a5f3fc' }}>
          Auto-Scan from FY
        </p>
        <p className="text-xs mb-3" style={{ color: 'var(--text-3)' }}>
          Analyses receipt history to detect each member's payment frequency and default monthly amounts.
          Existing entries are updated; new members are added.
        </p>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div className="field-group" style={{ flex: '0 0 160px' }}>
            <label className="field-label">Financial Year</label>
            <input className="field-input" value={scanFY} onChange={e => setScanFY(e.target.value)}
              placeholder="YYYY-YY" style={{ fontFamily: 'monospace' }}/>
          </div>
          <button onClick={runScan} disabled={scanning} className="btn btn-primary"
            style={{ background: '#0891b2', borderColor: '#0891b2' }}>
            {scanning
              ? <><Loader2 size={14} className="animate-spin"/>Scanning…</>
              : <><ScanLine size={14}/>Run Scan</>}
          </button>
        </div>
        <p className="text-xs mt-2" style={{ color: 'var(--text-3)' }}>
          Tip: Slot is detected from the <strong>months</strong> column on each receipt line item (imported from the worksheet).
          Even a single month's data is enough — each member's slot is read directly from their receipt.
        </p>
      </div>

      {/* FY display filter */}
      {availFYs.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            Showing FY:
          </span>
          {availFYs.map(fy => (
            <button key={fy} onClick={() => setDisplayFY(fy === displayFY ? '' : fy)} style={{
              padding: '3px 10px', borderRadius: 6, fontSize: 12, fontWeight: 700,
              cursor: 'pointer', fontFamily: 'monospace',
              border: `1.5px solid ${displayFY === fy ? '#0891b2' : 'var(--card-border)'}`,
              background: displayFY === fy ? '#0891b218' : 'transparent',
              color: displayFY === fy ? '#0891b2' : 'var(--text-3)',
            }}>{fy}</button>
          ))}
          {displayFY && (
            <button onClick={() => setDisplayFY('')} style={{
              padding: '3px 8px', borderRadius: 6, fontSize: 11, cursor: 'pointer',
              border: '1px solid var(--card-border)', background: 'transparent', color: 'var(--text-3)',
            }}>Show All</button>
          )}
        </div>
      )}

      {/* Slot filter tabs */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
        {tabs.map(([val, label, count, color]) => (
          <button key={val} onClick={() => setActiveSlot(val)} style={{
            padding: '4px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600,
            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5,
            border: `1.5px solid ${activeSlot === val ? color : 'var(--card-border)'}`,
            background: activeSlot === val ? color + '18' : 'transparent',
            color: activeSlot === val ? color : 'var(--text-3)',
          }}>
            {label}
            <span style={{
              background: activeSlot === val ? color : 'var(--page-bg)',
              color: activeSlot === val ? '#fff' : 'var(--text-3)',
              borderRadius: 10, padding: '0 5px', fontSize: 10, minWidth: 18, textAlign: 'center',
            }}>{count}</span>
          </button>
        ))}
      </div>

      {/* Search */}
      <div style={{ position: 'relative', marginBottom: 14 }}>
        <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }}/>
        <input className="field-input" style={{ paddingLeft: 30 }}
          placeholder="Search by name or member ID…"
          value={search} onChange={e => setSearch(e.target.value)}/>
      </div>

      {/* Table */}
      {loading ? (
        <div style={{ padding: 48, textAlign: 'center' }}>
          <Loader2 size={24} className="animate-spin" style={{ color: 'var(--text-3)', margin: '0 auto' }}/>
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>
          {schedules.length === 0
            ? 'No members yet — run Auto-Scan to populate.'
            : 'No members match this filter.'}
        </div>
      ) : (
        <div className="card" style={{ overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--card-border)', background: 'var(--page-bg)' }}>
                {['Member', 'WhatsApp', 'Payment Slot', 'Monthly Rate', 'Online'].map((h, i) => (
                  <th key={h} style={{
                    padding: '10px 14px',
                    textAlign: i === 3 ? 'right' : i === 4 ? 'center' : 'left',
                    fontWeight: 700, color: 'var(--text-3)', fontSize: 11,
                    textTransform: 'uppercase', letterSpacing: '0.06em',
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((s, i) => (
                <ScheduleRow key={s.id} s={s} i={i} moving={movingId === s.id}
                  onSlotChange={slot => changeSlot(s.id, slot)}
                  onToggle={() => toggleExclude(s)}/>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showPushModal && (
        <PushPaymentRequestModal
          church={church}
          categories={categories}
          profile={profile}
          toast={toast}
          onClose={() => setShowPushModal(false)}
          onSent={() => setShowPushModal(false)}
        />
      )}
    </div>
  )
}

// ── Schedule row with slot dropdown ─────────────────────────
function ScheduleRow({ s, i, moving, onSlotChange, onToggle }) {
  const [open, setOpen] = useState(false)
  const total = Object.values(s.amounts || {}).reduce((a, b) => a + (parseFloat(b) || 0), 0)
  const color = s.excluded_from_online ? '#94a3b8' : (SLOT_COLORS[s.slot] || '#64748b')

  return (
    <tr style={{ borderBottom: '1px solid var(--card-border)', background: i % 2 === 0 ? 'transparent' : 'var(--page-bg)' }}>
      <td style={{ padding: '10px 14px' }}>
        <div style={{ fontWeight: 600, color: 'var(--text-1)' }}>{s.member_name}</div>
        <div style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}>{s.member_id}</div>
      </td>
      <td style={{ padding: '10px 14px', fontSize: 12, color: 'var(--text-2)', fontFamily: 'var(--font-mono)' }}>
        {s.whatsapp || '—'}
      </td>
      <td style={{ padding: '10px 14px' }}>
        <div style={{ position: 'relative', display: 'inline-block' }}>
          <button
            onClick={() => !s.excluded_from_online && setOpen(o => !o)}
            disabled={moving}
            style={{
              display: 'flex', alignItems: 'center', gap: 5,
              padding: '4px 10px', borderRadius: 8,
              border: `1.5px solid ${color}`, background: `${color}18`, color,
              fontSize: 11, fontWeight: 700,
              cursor: s.excluded_from_online ? 'default' : 'pointer',
              opacity: moving ? 0.5 : 1,
            }}>
            {moving && <Loader2 size={10} className="animate-spin"/>}
            {SLOT_LABELS[s.slot]}
            {!s.excluded_from_online && <ChevronDown size={10}/>}
          </button>
          {open && !s.excluded_from_online && (
            <div style={{
              position: 'absolute', top: '110%', left: '50%', transform: 'translateX(-50%)', zIndex: 200,
              background: 'var(--card-bg)', border: '1px solid var(--card-border)',
              borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.15)', overflow: 'hidden', minWidth: 165,
            }}>
              {VALID_SLOTS.map(sl => (
                <button key={sl} onClick={() => { setOpen(false); if (sl !== s.slot) onSlotChange(sl) }}
                  style={{
                    display: 'block', width: '100%', padding: '9px 14px', textAlign: 'left',
                    background: sl === s.slot ? `${SLOT_COLORS[sl]}18` : 'transparent',
                    color: sl === s.slot ? SLOT_COLORS[sl] : 'var(--text-1)',
                    fontSize: 12, fontWeight: sl === s.slot ? 700 : 400,
                    cursor: 'pointer', border: 'none',
                  }}>
                  {SLOT_LABELS[sl]}
                </button>
              ))}
            </div>
          )}
        </div>
      </td>
      <td style={{ padding: '10px 14px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 600, color: 'var(--text-1)' }}>
        ₹{total.toLocaleString('en-IN')}
      </td>
      <td style={{ padding: '10px 14px', textAlign: 'center' }}>
        <button onClick={onToggle}
          title={s.excluded_from_online ? 'Include in online payments' : 'Exclude from online payments'}
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}>
          {s.excluded_from_online
            ? <UserX size={16} style={{ color: '#94a3b8' }}/>
            : <CheckSquare size={16} style={{ color: '#16a34a' }}/>}
        </button>
      </td>
    </tr>
  )
}

// ════════════════════════════════════════════════════════
//  PUSH PAYMENT REQUEST MODAL
// ════════════════════════════════════════════════════════

function PushPaymentRequestModal({ church, categories, profile, toast, onClose, onSent }) {
  const fy = curFY()
  const today = new Date()
  const calMonth = today.getMonth() + 1
  const defaultMonth = FY_MONTHS_PR[calMonth >= 4 ? calMonth - 4 : calMonth + 8]

  const [selMonth,    setSelMonth]    = useState(defaultMonth)
  const [eligible,    setEligible]    = useState(null)
  const [finding,     setFinding]     = useState(false)
  const [selected,    setSelected]    = useState(new Set())
  const [sending,     setSending]     = useState(false)
  const [progress,    setProgress]    = useState(null)
  const [prSearch,    setPrSearch]    = useState('')

  const catMap = Object.fromEntries(categories.map(c => [c.id, c.name]))

  async function findEligible() {
    setFinding(true); setEligible(null); setPrSearch('')
    try {
      const { data: schedules, error } = await supabase
        .from('member_payment_schedules')
        .select('*')
        .eq('excluded_from_online', false)
      if (error) throw error

      const idx = fyMonthIdx(selMonth)
      const due = (schedules || []).filter(s => (SLOT_DUE_IDX[s.slot] || []).includes(idx))

      const missingWA = due.filter(s => !s.whatsapp).map(s => s.member_id)
      let waMap = {}
      if (missingWA.length) {
        const { data: mems } = await supabase
          .from('members')
          .select('member_id, whatsapp, mobile')
          .in('member_id', missingWA)
        ;(mems || []).forEach(m => { waMap[m.member_id] = m.whatsapp || m.mobile || '' })
      }

      const result = due.map(s => {
        const months   = billingMonths(s.slot, idx)
        const totalAmt = Object.values(s.amounts || {}).reduce((a, b) => a + (parseFloat(b) || 0) * s.slot, 0)
        const whatsapp = s.whatsapp || waMap[s.member_id] || ''
        return { ...s, whatsapp, billingMonths: months, totalAmt }
      }).sort((a, b) => (a.member_id || '').localeCompare(b.member_id || '', undefined, { numeric: true }))

      setEligible(result)
      setSelected(new Set())
    } catch (e) { toast('Error: ' + e.message, 'error') }
    setFinding(false)
  }

  function toggleAll() {
    if (selected.size === eligible.length) setSelected(new Set())
    else setSelected(new Set(eligible.map(r => r.member_id)))
  }

  async function sendRequests() {
    if (!church?.upi_id) { toast('Please set UPI ID in Church Setup first.', 'error'); return }
    const toSend = (eligible || []).filter(r => selected.has(r.member_id))
    if (!toSend.length) { toast('No members selected', 'info'); return }

    setSending(true); setProgress({ done: 0, total: toSend.length })
    const batchId = Date.now().toString()
    let done = 0

    const { data: catData } = await supabase.from('payment_categories').select('id, name')
    const catMapLocal = Object.fromEntries((catData || []).map(c => [c.id, c.name]))

    for (const m of toSend) {
      try {
        const { data: req, error: rErr } = await supabase.from('payment_requests').insert({
          member_id:   m.member_id,
          member_name: m.member_name,
          whatsapp:    m.whatsapp,
          fy,
          months:      m.billingMonths,
          slot:        m.slot,
          amounts:     m.amounts || {},
          grand_total: m.totalAmt,
          status:      'pending',
          push_batch_id: batchId,
          created_by:  profile?.email || '',
        }).select('*').single()
        if (rErr) throw rErr

        const baseUrl = (church?.site_url || '').trim().replace(/\/+$/, '') || window.location.origin
        const payUrl  = `${baseUrl}/pay/${req.id}`

        const msg = `${church.church_name} — Payment Request\n\nDear ${m.member_name},\n\nAmount: ₹${m.totalAmt.toLocaleString('en-IN')}\nPeriod: ${m.billingMonths} (${fy})\n\nTap the link below and press *Pay with GPay*:\n${payUrl}\n\nThank you.`

        if (m.whatsapp) {
          try {
            const apiResp = await sendWhatsAppMessage(church, { to: m.whatsapp, message: msg })
            await supabase.from('payment_request_logs').insert({
              payment_request_id: req.id, member_id: m.member_id,
              member_name: m.member_name, whatsapp_number: m.whatsapp,
              message: msg, status: 'sent',
              error_text: JSON.stringify(apiResp),
              api_type: church.whatsapp_api_type || 'soft7',
              sent_by: profile?.email || '',
            })
          } catch (waErr) {
            await supabase.from('payment_request_logs').insert({
              payment_request_id: req.id, member_id: m.member_id,
              member_name: m.member_name, whatsapp_number: m.whatsapp,
              message: msg, status: 'failed', error_text: waErr.message,
              api_type: church.whatsapp_api_type || 'soft7',
              sent_by: profile?.email || '',
            })
          }
        }
      } catch (e) {
        console.error('Failed for', m.member_id, e.message)
      }
      done++
      setProgress({ done, total: toSend.length })
    }

    await logCmsAudit({
      action: 'created', module: 'finance', entityType: 'payment_request',
      entityId: batchId, summary: `Sent ${done} payment request${done !== 1 ? 's' : ''} (FY ${fy})`,
      actor: profile,
    })
    toast(`${done} payment request${done !== 1 ? 's' : ''} sent`, 'success')
    setSending(false)
    onSent()
  }

  const allSelected = eligible?.length > 0 && selected.size === eligible.length

  return (
    <div onClick={e => { if (e.target === e.currentTarget && !sending) onClose() }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.65)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: 16 }}>
      <div style={{ background: 'var(--card-bg)', borderRadius: 16, width: '100%', maxWidth: 680, maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 64px rgba(0,0,0,0.4)', overflow: 'hidden' }}>

        {/* Header */}
        <div style={{ background: '#7c3aed', padding: '14px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(135deg,rgba(255,255,255,0.08) 0%,transparent 60%)', pointerEvents: 'none' }}/>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, position: 'relative' }}>
            <div style={{ background: 'rgba(255,255,255,0.2)', borderRadius: 8, padding: 6, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Send size={16} color="#fff"/>
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#fff', fontFamily: 'var(--font-ui)' }}>Push Payment Request</h3>
              <p style={{ margin: 0, fontSize: 11, color: 'rgba(255,255,255,0.75)', fontFamily: 'var(--font-ui)' }}>FY {fy}</p>
            </div>
          </div>
          {!sending && (
            <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: 6, padding: '4px 10px', cursor: 'pointer', color: '#fff', fontSize: 16, fontWeight: 700, lineHeight: 1 }}>×</button>
          )}
        </div>

        {/* Body */}
        <div style={{ padding: 20, overflowY: 'auto', flex: 1 }}>

          {/* Month selector + Find button */}
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', marginBottom: 20 }}>
            <div className="field-group" style={{ flex: '0 0 180px' }}>
              <label className="field-label">Payment Month</label>
              <select className="field-input" value={selMonth} onChange={e => { setSelMonth(e.target.value); setEligible(null) }}
                style={{ appearance: 'none', backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%2394a3b8' d='M6 8L1 3h10z'/%3E%3C/svg%3E\")", backgroundRepeat: 'no-repeat', backgroundPosition: 'right 10px center', paddingRight: 28 }}>
                {FY_MONTHS_PR.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <button onClick={findEligible} disabled={finding} className="btn btn-primary" style={{ background: '#7c3aed', borderColor: '#7c3aed' }}>
              {finding ? <><Loader2 size={14} className="animate-spin"/>Finding…</> : <><Search size={14}/>Find Eligible</>}
            </button>
          </div>

          {eligible === null && !finding && (
            <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text-3)', fontSize: 13 }}>
              Select a month and click "Find Eligible" to see which members are due.
            </div>
          )}

          {eligible !== null && eligible.length === 0 && (
            <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text-3)', fontSize: 13 }}>
              No members are due for <strong>{selMonth}</strong>. Check Payment Schedule or run Auto-Scan first.
            </div>
          )}

          {eligible !== null && eligible.length > 0 && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>
                  {eligible.length} member{eligible.length !== 1 ? 's' : ''} eligible · {selected.size} selected
                </div>
                <button onClick={toggleAll} className="btn btn-ghost btn-sm">
                  {allSelected ? <Square size={13}/> : <CheckSquare size={13}/>}
                  {allSelected ? 'Deselect All' : 'Select All'}
                </button>
              </div>

              {/* Search */}
              <div style={{ position: 'relative', marginBottom: 10 }}>
                <Search size={12} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)', pointerEvents: 'none' }}/>
                <input
                  className="field-input"
                  style={{ paddingLeft: 28, fontSize: 12 }}
                  placeholder="Search by name or member ID…"
                  value={prSearch}
                  onChange={e => setPrSearch(e.target.value)}
                />
              </div>

              <div className="card" style={{ overflow: 'hidden', marginBottom: 16 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--card-border)', background: 'var(--page-bg)' }}>
                      <th style={{ padding: '8px 12px', width: 30 }}/>
                      <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 700, color: 'var(--text-3)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Member</th>
                      <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 700, color: 'var(--text-3)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Period</th>
                      <th style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 700, color: 'var(--text-3)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Slot</th>
                      <th style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700, color: 'var(--text-3)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {eligible.filter(m => {
                      const q = prSearch.trim().toLowerCase()
                      return !q || m.member_name?.toLowerCase().includes(q) || m.member_id?.toLowerCase().includes(q)
                    }).map((m, i) => {
                      const chk = selected.has(m.member_id)
                      return (
                        <tr key={m.member_id} onClick={() => setSelected(prev => { const n = new Set(prev); if (n.has(m.member_id)) n.delete(m.member_id); else n.add(m.member_id); return n })}
                          style={{ borderBottom: '1px solid var(--card-border)', cursor: 'pointer', background: chk ? 'rgba(124,58,237,0.05)' : i % 2 === 0 ? 'transparent' : 'var(--page-bg)' }}>
                          <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                            {chk ? <CheckSquare size={14} style={{ color: '#7c3aed' }}/> : <Square size={14} style={{ color: 'var(--text-3)' }}/>}
                          </td>
                          <td style={{ padding: '8px 12px' }}>
                            <div style={{ fontWeight: 600, color: 'var(--text-1)' }}>{m.member_name}</div>
                            <div style={{ fontSize: 10, color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}>{m.member_id} · {m.whatsapp || 'No WhatsApp'}</div>
                          </td>
                          <td style={{ padding: '8px 12px', color: 'var(--text-2)', fontSize: 12 }}>{m.billingMonths}</td>
                          <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                            <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: '#f5f3ff', color: '#7c3aed' }}>{SLOT_LBL_PR[m.slot]}</span>
                          </td>
                          <td style={{ padding: '8px 12px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--text-1)' }}>₹{m.totalAmt.toLocaleString('en-IN')}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              {sending && progress && (
                <div style={{ marginBottom: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-2)', marginBottom: 4 }}>
                    <span>Sending requests…</span>
                    <span>{progress.done} / {progress.total}</span>
                  </div>
                  <div style={{ height: 6, background: 'var(--card-border)', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{ height: '100%', background: '#7c3aed', borderRadius: 3, width: `${(progress.done / progress.total) * 100}%`, transition: 'width 0.3s ease' }}/>
                  </div>
                </div>
              )}

              <button onClick={sendRequests} disabled={sending || selected.size === 0}
                style={{ width: '100%', padding: '11px 0', background: '#7c3aed', color: '#fff', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: sending || selected.size === 0 ? 'not-allowed' : 'pointer', opacity: sending || selected.size === 0 ? 0.6 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                {sending ? <Loader2 size={15} className="animate-spin"/> : <Send size={15}/>}
                {sending ? 'Sending…' : `Send to ${selected.size} Member${selected.size !== 1 ? 's' : ''} via WhatsApp`}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
