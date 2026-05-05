/* ═══════════════════════════════════════════════════════════════
   PaymentSchedulePage.jsx — Member payment frequency management
   ═══════════════════════════════════════════════════════════════ */

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { useToast } from '../lib/toast'
import {
  CreditCard, ScanLine, Loader2, Search, UserX,
  CheckSquare, ChevronDown, RefreshCw,
} from 'lucide-react'

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
  const [movingId,    setMovingId]    = useState(null)

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
      toast(`${rows.length} members scanned from FY ${fy}`, 'success')
      setDisplayFY(fy)
      load()
    } catch (e) { toast('Scan failed: ' + e.message, 'error') }
    setScanning(false)
  }

  async function changeSlot(id, slot) {
    setMovingId(id)
    const { error } = await supabase
      .from('member_payment_schedules')
      .update({ slot, last_modified_by: profile?.email, updated_at: new Date().toISOString() })
      .eq('id', id)
    if (!error) setSchedules(prev => prev.map(s => s.id === id ? { ...s, slot } : s))
    else toast(error.message, 'error')
    setMovingId(null)
  }

  async function toggleExclude(s) {
    const next = !s.excluded_from_online
    const { error } = await supabase
      .from('member_payment_schedules')
      .update({ excluded_from_online: next, last_modified_by: profile?.email, updated_at: new Date().toISOString() })
      .eq('id', s.id)
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
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <CreditCard size={20} style={{ color: 'var(--accent)', flexShrink: 0 }}/>
            Payment Schedule
          </h1>
          <p className="page-subtitle">Configure payment frequency and online eligibility per member</p>
        </div>
        <button onClick={load} disabled={loading} className="btn btn-ghost btn-sm" title="Refresh">
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''}/>
        </button>
      </div>

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
