import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { useToast } from '../lib/toast'
import { getActiveCategories } from '../lib/paymentCategories'
import { Search, Loader2, Save, X, FileText, Plus, Edit2, Trash2, RotateCcw, FileSpreadsheet, Settings, ChevronDown, Lock, Unlock } from 'lucide-react'
import { exportToExcel, exportToExcelMultiSheet } from '../lib/exportExcel'

// ── helpers ─────────────────────────────────────────────────────

function getFY(dateStr) {
  const d = dateStr ? new Date(dateStr + 'T00:00:00') : new Date()
  const m = d.getMonth() + 1
  const y = d.getFullYear()
  return m >= 4 ? `${y}-${String(y + 1).slice(2)}` : `${y - 1}-${String(y).slice(2)}`
}

function fyOptions() {
  const seen = new Set(), opts = []
  for (let d = -2; d <= 1; d++) {
    const y = new Date().getFullYear() + d
    const m = new Date().getMonth() + 1
    const fy = m >= 4 ? `${y}-${String(y + 1).slice(2)}` : `${y - 1}-${String(y).slice(2)}`
    if (!seen.has(fy)) { seen.add(fy); opts.push(fy) }
  }
  return opts.sort()  // ascending: oldest → newest
}

// Validate FY format "YYYY-YY" and that the suffix matches
function isValidFY(s) {
  if (!/^\d{4}-\d{2}$/.test(s)) return false
  const [start, end] = s.split('-')
  return String(parseInt(start) + 1).slice(2) === end
}

function fmtDate(s) {
  if (!s) return '—'
  const [y, m, d] = s.split('-')
  return `${d}/${m}/${y}`
}

function parseAmt(s) {
  return Math.round(parseFloat(String(s).replace(/,/g, '')) || 0)
}

function toWords(n) {
  const num = Math.round(n)
  if (!num) return ''
  const ones = ['','One','Two','Three','Four','Five','Six','Seven','Eight','Nine',
                 'Ten','Eleven','Twelve','Thirteen','Fourteen','Fifteen','Sixteen',
                 'Seventeen','Eighteen','Nineteen']
  const tens = ['','','Twenty','Thirty','Forty','Fifty','Sixty','Seventy','Eighty','Ninety']
  const b100 = n => n < 20 ? ones[n] : tens[Math.floor(n/10)] + (n%10 ? ' '+ones[n%10] : '')
  const b1000 = n => n < 100 ? b100(n) : ones[Math.floor(n/100)]+' Hundred'+(n%100 ? ' and '+b100(n%100) : '')
  let r = '', rem = num
  if (rem >= 10000000) { r += b1000(Math.floor(rem/10000000))+' Crore '; rem %= 10000000 }
  if (rem >= 100000)   { r += b100(Math.floor(rem/100000))+' Lakh ';     rem %= 100000   }
  if (rem >= 1000)     { r += b100(Math.floor(rem/1000))+' Thousand ';   rem %= 1000     }
  if (rem > 0)           r += b1000(rem)
  return r.trim() + ' Rupees Only'
}

async function nextDeclNumber(fy) {
  const { count } = await supabase
    .from('declarations')
    .select('id', { count: 'exact', head: true })
    .eq('financial_year', fy)
  return (count || 0) + 1
}

const INCOME_CATEGORIES = ['Salary', 'Pension', 'Business', 'Agriculture', 'Others']
const SUB_PCTS = [3, 1, 0]
const FYS = fyOptions()

// FY persisted in localStorage — auto-resets to current FY after 30 days of inactivity
function getStoredFY() {
  try {
    const raw = localStorage.getItem('church_decl_fy')
    if (!raw) return getFY()
    const { fy, ts } = JSON.parse(raw)
    if ((Date.now() - ts) / 86400000 > 30) return getFY()
    return fy
  } catch { return getFY() }
}
function saveStoredFY(fy) {
  localStorage.setItem('church_decl_fy', JSON.stringify({ fy, ts: Date.now() }))
}

// ── main page ────────────────────────────────────────────────────

export default function DeclarationPage() {
  const { profile } = useAuth()
  const toast = useToast()

  const [categories,   setCategories]  = useState([])
  const [catsLoading,  setCatsLoading] = useState(true)
  const [declarations, setDeclarations]= useState([])
  const [listLoading,  setListLoading] = useState(false)
  const [filterFY,     setFilterFY]    = useState(() => getFY())
  const [listSearch,   setListSearch]  = useState('')
  const [showModal,    setShowModal]   = useState(false)
  const [editId,       setEditId]      = useState(null)
  const [exporting,      setExporting]      = useState(false)
  const [showExportMenu, setShowExportMenu] = useState(false)
  const [fyStats,        setFyStats]        = useState({})
  const [manualFYs,      setManualFYs]      = useState([])
  const [showFYMgr,      setShowFYMgr]      = useState(false)
  const [lockedFYs,      setLockedFYs]      = useState(new Set())
  const [fyActivity,     setFyActivity]     = useState({})
  const [fyLockedAlert,  setFyLockedAlert]  = useState(null)
  const exportMenuRef = useRef(null)

  // Union of data-bearing and manually added FYs — always ascending (fully manual, no auto range)
  const availableFYs = useMemo(() => {
    const all = new Set([...Object.keys(fyStats), ...manualFYs])
    return [...all].sort()
  }, [fyStats, manualFYs])

  const TEN_DAYS_MS = 10 * 24 * 60 * 60 * 1000

  const loadFYData = useCallback(async () => {
    const { data } = await supabase.from('decl_financial_years')
      .select('fy, is_locked, last_activity_at').order('fy')
    const rows = data || []
    setManualFYs(rows.map(r => r.fy))
    setLockedFYs(new Set(rows.filter(r => r.is_locked).map(r => r.fy)))
    setFyActivity(Object.fromEntries(rows.map(r => [r.fy, r.last_activity_at])))
  }, [])

  useEffect(() => { loadFYData() }, [loadFYData])

  const updateFYActivity = useCallback(async (fy) => {
    if (!fy) return
    const now = new Date().toISOString()
    await supabase.from('decl_financial_years')
      .upsert({ fy, is_locked: false, last_activity_at: now }, { onConflict: 'fy' })
    setFyActivity(prev => ({ ...prev, [fy]: now }))
    setManualFYs(prev => prev.includes(fy) ? prev : [...prev, fy].sort())
    setLockedFYs(prev => {
      if (!prev.has(fy)) return prev
      const next = new Set(prev); next.delete(fy); return next
    })
  }, [])

  // Auto-lock FYs with no activity in the last 10 days (only if they have declarations)
  useEffect(() => {
    if (!availableFYs.length) return
    const now = Date.now()
    const toAutoLock = availableFYs.filter(fy => {
      if (lockedFYs.has(fy)) return false
      if (!(fyStats[fy] > 0)) return false
      const lastAct = fyActivity[fy] ? new Date(fyActivity[fy]).getTime() : null
      return lastAct !== null && (now - lastAct) > TEN_DAYS_MS
    })
    if (!toAutoLock.length) return
    Promise.all(toAutoLock.map(fy =>
      supabase.from('decl_financial_years').update({ is_locked: true }).eq('fy', fy)
    )).then(() =>
      setLockedFYs(prev => { const next = new Set(prev); toAutoLock.forEach(f => next.add(f)); return next })
    )
  }, [availableFYs, fyStats, fyActivity, lockedFYs, TEN_DAYS_MS])

  const addFY = useCallback(async (fy) => {
    if (!isValidFY(fy))            return 'Format must be YYYY-YY (e.g. 2028-29)'
    if (manualFYs.includes(fy))    return 'Already in your list'
    const { error } = await supabase.from('decl_financial_years').insert({ fy })
    if (error) return error.message
    setManualFYs(prev => [...prev, fy].sort())
    return null
  }, [manualFYs])

  const deleteFY = useCallback(async (fy, password) => {
    const count = fyStats[fy] || 0
    if (count > 0) {
      const { error: authErr } = await supabase.auth.signInWithPassword({ email: profile.email, password })
      if (authErr) return 'wrong_password'
      const { data: decls } = await supabase.from('declarations').select('id').eq('financial_year', fy)
      if (decls?.length) {
        const ids = decls.map(d => d.id)
        await supabase.from('declaration_items').delete().in('declaration_id', ids)
        await supabase.from('declarations').delete().eq('financial_year', fy)
      }
      setFyStats(prev => { const n = { ...prev }; delete n[fy]; return n })
    }
    const { error } = await supabase.from('decl_financial_years').delete().eq('fy', fy)
    if (error) return error.message
    setManualFYs(prev => prev.filter(f => f !== fy))
    setLockedFYs(prev => { const next = new Set(prev); next.delete(fy); return next })
    setFyActivity(prev => { const next = { ...prev }; delete next[fy]; return next })
    return null
  }, [fyStats, profile])

  const loadCategories = useCallback(() => {
    setCatsLoading(true)
    getActiveCategories()
      .then(cats => setCategories(cats))
      .catch(() => setCategories([]))
      .finally(() => setCatsLoading(false))
  }, [])

  useEffect(() => { loadCategories() }, [loadCategories])

  const loadList = useCallback(async () => {
    setListLoading(true)
    try {
      let q = supabase
        .from('declarations')
        .select('id,declaration_number,member_id,member_name,financial_year,declaration_date,income_category,declared_income,percentage')
        .order('declaration_number', { ascending: true })
      if (filterFY)          q = q.eq('financial_year', filterFY)
      if (listSearch.trim()) q = q.or(`member_name.ilike.%${listSearch}%,member_id.ilike.%${listSearch}%`)
      const { data, error } = await q
      if (error) throw error
      setDeclarations(data || [])
    } catch (e) { toast(e.message, 'error') }
    setListLoading(false)
  }, [filterFY, listSearch, toast])

  useEffect(() => { loadList() }, [loadList])

  const loadFyStats = useCallback(async () => {
    const { data } = await supabase.from('declarations').select('financial_year')
    const counts = {}
    ;(data || []).forEach(r => { counts[r.financial_year] = (counts[r.financial_year] || 0) + 1 })
    setFyStats(counts)
  }, [])

  useEffect(() => { loadFyStats() }, [loadFyStats])

  const isAutoLocked = useCallback((fy) => {
    if (!lockedFYs.has(fy)) return false
    const lastAct = fyActivity[fy] ? new Date(fyActivity[fy]).getTime() : null
    return lastAct !== null && (Date.now() - lastAct) > TEN_DAYS_MS
  }, [lockedFYs, fyActivity, TEN_DAYS_MS])

  const toggleFYLock = useCallback(async (fy) => {
    const willLock = !lockedFYs.has(fy)
    const { error } = await supabase.from('decl_financial_years')
      .update({ is_locked: willLock }).eq('fy', fy)
    if (error) return
    setLockedFYs(prev => {
      const next = new Set(prev)
      if (next.has(fy)) next.delete(fy); else next.add(fy)
      return next
    })
  }, [lockedFYs])

  const openNew = useCallback(() => {
    if (lockedFYs.has(filterFY)) { setFyLockedAlert(filterFY); return }
    setEditId(null); setShowModal(true)
  }, [lockedFYs, filterFY])

  const openEdit = row => {
    if (lockedFYs.has(row.financial_year)) { setFyLockedAlert(row.financial_year); return }
    setEditId(row.id); setShowModal(true)
  }

  // "+" hotkey opens new declaration (ignored when typing in any field)
  useEffect(() => {
    const handler = e => {
      if (e.key !== '+') return
      const tag = document.activeElement?.tagName?.toUpperCase()
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag)) return
      if (showModal) return
      openNew()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [showModal, openNew])

  const del = async row => {
    if (!window.confirm(`Delete declaration for ${row.member_name} (FY ${row.financial_year})?`)) return
    const { error } = await supabase.from('declarations').delete().eq('id', row.id)
    if (error) { toast(error.message, 'error'); return }
    toast('Declaration deleted', 'success')
    updateFYActivity(row.financial_year)
    loadList(); loadFyStats()
  }

  // ── click-outside closes export menu ─────────────────────────
  useEffect(() => {
    if (!showExportMenu) return
    const h = e => { if (exportMenuRef.current && !exportMenuRef.current.contains(e.target)) setShowExportMenu(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [showExportMenu])

  // ── excel export (fy = null → all FYs, multi-sheet) ──────────
  const EXPORT_COLS = [
    { key: 'decl_no',      header: 'Decl No',            align: 'center' },
    { key: 'member_id',    header: 'Member ID',           align: 'center' },
    { key: 'member_name',  header: 'Member Name',         align: 'left'   },
    { key: 'fy',           header: 'Financial Year',      align: 'center' },
    { key: 'date',         header: 'Date',                align: 'center' },
    { key: 'income_cat',   header: 'Income Category',     align: 'center' },
    { key: 'declared_inc', header: 'Declared Income (₹)', align: 'center' },
    { key: 'sub_pct',      header: 'Sub %',               align: 'center' },
    { key: 'declared_sub', header: 'Declared Sub (₹)',    align: 'center' },
  ]
  const toExcelRow = d => ({
    decl_no:      d.declaration_number != null ? String(d.declaration_number).padStart(4, '0') : '',
    member_id:    d.member_id,
    member_name:  d.member_name,
    fy:           d.financial_year,
    date:         fmtDate(d.declaration_date),
    income_cat:   d.income_category || '',
    declared_inc: Math.round(parseFloat(d.declared_income) || 0),
    sub_pct:      parseFloat(d.percentage) || 0,
    declared_sub: Math.round((parseFloat(d.declared_income) || 0) * (parseFloat(d.percentage) || 0) / 100),
  })

  const doExport = async (fy) => {
    setExporting(true)
    setShowExportMenu(false)
    try {
      let q = supabase
        .from('declarations')
        .select('id,declaration_number,member_id,member_name,financial_year,declaration_date,income_category,declared_income,percentage')
        .order('declaration_number', { ascending: true })
      if (fy) q = q.eq('financial_year', fy)
      else    q = q.order('financial_year', { ascending: true })
      const { data, error } = await q
      if (error) throw error
      if (!data?.length) { toast('No data to export', 'error'); setExporting(false); return }

      if (fy) {
        await exportToExcel(EXPORT_COLS, data.map(toExcelRow), `FY ${fy}`, `Declarations_${fy}.xlsx`)
      } else {
        const byFY = {}
        data.forEach(d => { if (!byFY[d.financial_year]) byFY[d.financial_year] = []; byFY[d.financial_year].push(toExcelRow(d)) })
        const sheets = Object.keys(byFY).sort().map(f => ({ name: `FY ${f}`, rows: byFY[f] }))
        await exportToExcelMultiSheet(EXPORT_COLS, sheets, 'Declarations_All.xlsx')
      }
    } catch (e) { toast(e.message, 'error') }
    setExporting(false)
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Declaration</h1>
          <p className="page-subtitle">Annual income declaration per member</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>

          {/* Export submenu */}
          <div ref={exportMenuRef} style={{ position: 'relative' }}>
            <button onClick={() => setShowExportMenu(o => !o)} disabled={exporting}
              className="action-btn"
              style={{ background: '#16a34a', opacity: exporting ? 0.6 : 1, gap: 5 }}>
              {exporting ? <Loader2 size={13} className="animate-spin"/> : <FileSpreadsheet size={13}/>}
              Excel Export
              <ChevronDown size={11} style={{ marginLeft: 1, transition: 'transform 0.15s', transform: showExportMenu ? 'rotate(180deg)' : 'none' }}/>
            </button>
            {showExportMenu && (
              <div style={{ position: 'absolute', top: 'calc(100% + 5px)', right: 0, zIndex: 400,
                background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: 10,
                boxShadow: '0 12px 32px rgba(0,0,0,0.15)', width: 240, overflow: 'hidden',
                animation: 'dropDown 0.15s ease both' }}>
                {/* All FYs */}
                <button onClick={() => doExport(null)}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '11px 14px',
                    background: 'none', border: 'none', borderBottom: '1px solid var(--card-border)',
                    cursor: 'pointer', textAlign: 'left' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--table-row-hover)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'none'}>
                  <FileSpreadsheet size={14} style={{ color: '#16a34a', flexShrink: 0 }}/>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>All Financial Years</div>
                    <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 1 }}>One worksheet per FY</div>
                  </div>
                </button>
                {/* Per-FY */}
                {availableFYs.filter(fy => (fyStats[fy] || 0) > 0).map(fy => (
                  <button key={fy} onClick={() => doExport(fy)}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      width: '100%', padding: '9px 14px', background: 'none', border: 'none',
                      borderBottom: '1px solid var(--card-border)', cursor: 'pointer', textAlign: 'left' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--table-row-hover)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'none'}>
                    <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-1)' }}>FY {fy}</span>
                    <span style={{ fontSize: 11, color: 'var(--text-3)', fontVariantNumeric: 'tabular-nums' }}>
                      {fyStats[fy]} record{fyStats[fy] !== 1 ? 's' : ''}
                    </span>
                  </button>
                ))}
                {availableFYs.every(fy => !(fyStats[fy] > 0)) && (
                  <div style={{ padding: '12px 14px', fontSize: 13, color: 'var(--text-3)' }}>No data to export</div>
                )}
              </div>
            )}
          </div>

          <button className="action-btn" onClick={openNew}
            style={{ background: 'var(--sidebar-bg)' }}
            title="Keyboard shortcut: Press + key">
            <Plus size={13}/> New Declaration
            <span style={{ marginLeft: 6, fontSize: 10, background: 'rgba(255,255,255,0.18)', padding: '1px 5px', borderRadius: 3, fontWeight: 800, letterSpacing: '0.05em' }}>+</span>
          </button>
        </div>
      </div>
      {/* FY count tiles — click to filter + gear for FY management */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 16 }}>
        {availableFYs.length > 0 && (
          <div className="card" style={{ flex: '1 1 auto', padding: 0, display: 'flex', overflow: 'hidden' }}>
            {availableFYs.map((fy, i, arr) => {
              const count    = fyStats[fy] || 0
              const active   = filterFY === fy
              const isLocked = lockedFYs.has(fy)
              const autoLock = isLocked && isAutoLocked(fy)
              return (
                <div key={fy} onClick={() => setFilterFY(fy)}
                  style={{ flex: 1, minWidth: 0, padding: '14px 22px', cursor: 'pointer',
                    borderRight: i < arr.length - 1 ? '1px solid var(--card-border)' : 'none',
                    background: active ? 'var(--sidebar-bg)' : isLocked ? 'rgba(251,191,36,0.08)' : 'transparent',
                    transition: 'background 0.15s', position: 'relative' }}>
                  {isLocked && (
                    <div style={{ position: 'absolute', top: 7, right: 8, display: 'flex', alignItems: 'center', gap: 3,
                      background: active ? 'rgba(0,0,0,0.25)' : 'rgba(251,191,36,0.2)',
                      border: `1px solid ${active ? 'rgba(255,255,255,0.2)' : 'rgba(217,119,6,0.4)'}`,
                      borderRadius: 4, padding: '1px 5px' }}>
                      <Lock size={9} style={{ color: active ? '#fde68a' : '#d97706' }}/>
                      <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.06em',
                        color: active ? '#fde68a' : '#d97706', textTransform: 'uppercase' }}>
                        {autoLock ? 'Auto-Locked' : 'Locked'}
                      </span>
                    </div>
                  )}
                  <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.09em',
                    color: active ? 'rgba(255,255,255,0.6)' : isLocked ? '#d97706' : 'var(--text-3)',
                    marginBottom: 4 }}>
                    FY {fy}
                  </div>
                  <div style={{ fontSize: 36, fontWeight: 800,
                    color: active ? '#fff' : isLocked ? '#92400e' : 'var(--text-1)',
                    fontVariantNumeric: 'tabular-nums', lineHeight: 1.1,
                    opacity: isLocked && !active ? 0.65 : 1 }}>
                    {count}
                  </div>
                  <div style={{ fontSize: 11, marginTop: 4,
                    color: active ? 'rgba(255,255,255,0.55)' : isLocked ? '#d97706' : 'var(--text-3)' }}>
                    {isLocked ? (autoLock ? 'auto-locked' : 'locked') : `declaration${count !== 1 ? 's' : ''}`}
                  </div>
                </div>
              )
            })}
          </div>
        )}
        {/* Gear — FY manager */}
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <button onClick={() => setShowFYMgr(o => !o)} title="Manage financial years"
            className="card"
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 42, height: 42, padding: 0, cursor: 'pointer', border: showFYMgr ? '1.5px solid var(--input-focus-border)' : undefined, background: showFYMgr ? 'var(--info-subtle)' : undefined }}>
            <Settings size={17} style={{ color: showFYMgr ? 'var(--info)' : 'var(--text-3)', transition: 'color 0.15s', transform: showFYMgr ? 'rotate(45deg)' : 'none', transition: 'transform 0.2s' }}/>
          </button>
          {showFYMgr && (
            <FYManagerPopup
              availableFYs={availableFYs}
              fyStats={fyStats}
              lockedFYs={lockedFYs}
              onToggleFYLock={toggleFYLock}
              profile={profile}
              onAdd={addFY}
              onDelete={deleteFY}
              toast={toast}
              onClose={() => setShowFYMgr(false)}
            />
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="card" style={{ padding: '14px 16px', marginBottom: 16, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <label style={{ fontSize: 13, color: 'var(--text-2)', fontWeight: 500, whiteSpace: 'nowrap' }}>Financial Year</label>
          <select value={filterFY} onChange={e => setFilterFY(e.target.value)} className="field-input" style={{ width: 120 }}>
            {availableFYs.map(fy => <option key={fy} value={fy}>{fy}</option>)}
          </select>
        </div>
        <div style={{ flex: 1, position: 'relative', minWidth: 220 }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }}/>
          <input value={listSearch} onChange={e => setListSearch(e.target.value)}
            placeholder="Search member name or ID…" className="field-input" style={{ paddingLeft: 32, width: '100%' }}/>
        </div>
        <span style={{ fontSize: 13, color: 'var(--text-3)', whiteSpace: 'nowrap' }}>
          {listLoading ? <Loader2 size={13} className="animate-spin inline"/> : `${declarations.length} record${declarations.length !== 1 ? 's' : ''}`}
        </span>
      </div>

      {/* Table */}
      <div className="card" style={{ overflow: 'hidden' }}>
        {listLoading ? (
          <div style={{ padding: 48, textAlign: 'center' }}>
            <Loader2 size={28} className="animate-spin" style={{ color: 'var(--text-3)', margin: '0 auto' }}/>
          </div>
        ) : declarations.length === 0 ? (
          <div style={{ padding: 48, textAlign: 'center' }}>
            <FileText size={36} style={{ color: 'var(--text-3)', margin: '0 auto 12px', display: 'block' }}/>
            <p style={{ color: 'var(--text-2)', fontWeight: 500, margin: 0 }}>No declarations found</p>
            <p style={{ color: 'var(--text-3)', fontSize: 13, marginTop: 4 }}>
              {listSearch ? 'Try a different search' : `No declarations for FY ${filterFY}`}
            </p>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--table-header-bg)', borderBottom: '1px solid var(--table-border)' }}>
                {['Decl No','Member','FY','Date','Income Source','Income (₹)','Sub %','Declared Sub (₹)',''].map(h => (
                  <th key={h} style={{ padding: '10px 14px', textAlign: ['Income (₹)','Declared Sub (₹)'].includes(h) ? 'right' : 'left', fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {declarations.map((d, i) => {
                const sub = Math.round((parseFloat(d.declared_income) || 0) * (parseFloat(d.percentage) || 0) / 100)
                return (
                  <tr key={d.id} style={{ borderBottom: '1px solid var(--table-border)', background: i % 2 === 0 ? 'transparent' : 'rgba(0,0,0,0.012)' }}>
                    <td style={{ padding: '10px 14px', fontSize: 13, fontWeight: 700, color: 'var(--text-1)' }}>
                      {d.declaration_number != null ? String(d.declaration_number).padStart(4, '0') : '—'}
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>{d.member_name}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{d.member_id}</div>
                    </td>
                    <td style={{ padding: '10px 14px', fontSize: 13, fontWeight: 600 }}>{d.financial_year}</td>
                    <td style={{ padding: '10px 14px', fontSize: 13, color: 'var(--text-2)', whiteSpace: 'nowrap' }}>{fmtDate(d.declaration_date)}</td>
                    <td style={{ padding: '10px 14px', fontSize: 13, color: 'var(--text-2)' }}>{d.income_category || '—'}</td>
                    <td style={{ padding: '10px 14px', textAlign: 'right', fontSize: 13, fontFamily: 'monospace' }}>
                      {Number(d.declared_income || 0).toLocaleString('en-IN')}
                    </td>
                    <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                      <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 4, background: 'var(--success-subtle)', color: 'var(--success)' }}>
                        {d.percentage}%
                      </span>
                    </td>
                    <td style={{ padding: '10px 14px', textAlign: 'right', fontSize: 13, fontWeight: 700, fontFamily: 'monospace' }}>
                      {sub.toLocaleString('en-IN')}
                    </td>
                    <td style={{ padding: '10px 14px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <button onClick={() => openEdit(d)} title="Edit"
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: '4px 6px', borderRadius: 4 }}
                        onMouseEnter={e => e.currentTarget.style.color = '#2563eb'}
                        onMouseLeave={e => e.currentTarget.style.color = 'var(--text-3)'}>
                        <Edit2 size={14}/>
                      </button>
                      <button onClick={() => del(d)} title="Delete"
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: '4px 6px', borderRadius: 4 }}
                        onMouseEnter={e => e.currentTarget.style.color = '#dc2626'}
                        onMouseLeave={e => e.currentTarget.style.color = 'var(--text-3)'}>
                        <Trash2 size={14}/>
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {showModal && (
        <DeclarationModal
          editId={editId}
          initialFY={filterFY}
          categories={categories}
          catsLoading={catsLoading}
          profile={profile}
          toast={toast}
          onClose={() => setShowModal(false)}
          onSaved={(fy) => { setShowModal(false); updateFYActivity(fy); loadList(); loadFyStats() }}
        />
      )}

      {/* ── FY locked alert ── */}
      {fyLockedAlert && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9998, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(15,23,42,0.55)', backdropFilter: 'blur(3px)' }}>
          <div style={{ background: 'var(--card-bg)', borderRadius: 14, padding: '28px 30px 22px', maxWidth: 390, width: '100%', margin: 16, boxShadow: '0 24px 64px rgba(0,0,0,0.45)', textAlign: 'center', fontFamily: 'var(--font-ui)' }}>
            <div style={{ fontSize: 38, marginBottom: 10, lineHeight: 1 }}>🔒</div>
            <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-1)', margin: '0 0 10px' }}>FY {fyLockedAlert} is Locked</h3>
            <p style={{ fontSize: 13, color: 'var(--text-2)', margin: '0 0 22px', lineHeight: 1.65 }}>
              This financial year is locked — no declarations can be added or edited.<br/>
              Open the <strong>FY Manager</strong> <span style={{ fontSize: 12, background: 'var(--page-bg)', padding: '1px 6px', borderRadius: 4, border: '1px solid var(--card-border)' }}>⚙ gear icon</span> and unlock <strong>FY {fyLockedAlert}</strong> to make changes.
            </p>
            <button autoFocus onClick={() => setFyLockedAlert(null)}
              style={{ padding: '8px 32px', borderRadius: 8, background: 'var(--sidebar-bg)', color: '#fff', border: 'none', fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'var(--font-ui)' }}>
              OK
            </button>
          </div>
        </div>
      )}

    </div>
  )
}

// ════════════════════════════════════════════════════════
//  FY MANAGER POPUP
// ════════════════════════════════════════════════════════

function FYManagerPopup({ availableFYs, fyStats, lockedFYs, onToggleFYLock, profile, onAdd, onDelete, toast, onClose }) {
  const [input,     setInput]     = useState('')
  const [err,       setErr]       = useState('')
  const [saving,    setSaving]    = useState(false)
  const [deleting,  setDeleting]  = useState(null)
  const [confirmFY, setConfirmFY] = useState(null)
  const [password,  setPassword]  = useState('')
  const [pwErr,     setPwErr]     = useState(false)
  const [hoveredFY,      setHoveredFY]      = useState(null)
  const [fyUnlockTarget, setFyUnlockTarget] = useState(null)
  const [fyUnlockPw,     setFyUnlockPw]     = useState('')
  const [fyUnlockPwErr,  setFyUnlockPwErr]  = useState(false)
  const [fyUnlocking,    setFyUnlocking]    = useState(false)
  const ref        = useRef(null)
  const pwRef      = useRef(null)
  const fyUnlockPwRef = useRef(null)

  const requestFYUnlock = (fy) => {
    setFyUnlockTarget(fy)
    setFyUnlockPw('')
    setFyUnlockPwErr(false)
    setTimeout(() => fyUnlockPwRef.current?.focus(), 50)
  }

  const doFYUnlock = async () => {
    if (!fyUnlockPw || fyUnlocking) return
    setFyUnlocking(true)
    const { error } = await supabase.auth.signInWithPassword({ email: profile.email, password: fyUnlockPw })
    setFyUnlocking(false)
    if (error) { setFyUnlockPwErr(true); setTimeout(() => fyUnlockPwRef.current?.focus(), 30); return }
    await onToggleFYLock?.(fyUnlockTarget)
    setFyUnlockTarget(null)
    setFyUnlockPw('')
  }

  useEffect(() => {
    const h = e => { if (ref.current && !ref.current.contains(e.target)) onClose() }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [onClose])

  useEffect(() => {
    if (confirmFY) setTimeout(() => pwRef.current?.focus(), 50)
  }, [confirmFY])

  const handleAdd = async () => {
    const v = input.trim()
    if (!v) return
    setSaving(true)
    const result = await onAdd(v)
    setSaving(false)
    if (!result) { setInput(''); setErr('') }
    else setErr(result)
  }

  const handleDeleteClick = (fy) => {
    const count = fyStats[fy] || 0
    if (count > 0) {
      setConfirmFY(fy)
      setPassword('')
      setPwErr(false)
    } else {
      doDelete(fy)
    }
  }

  const doDelete = async (fy, pw) => {
    setDeleting(fy)
    const result = await onDelete(fy, pw)
    setDeleting(null)
    if (result === 'wrong_password') {
      setPwErr(true)
      setTimeout(() => pwRef.current?.focus(), 30)
    } else if (result) {
      toast(result, 'error')
    } else {
      const count = fyStats[fy] || 0
      toast(count > 0
        ? `FY ${fy} and ${count} declaration${count !== 1 ? 's' : ''} permanently deleted`
        : `FY ${fy} removed`,
        'success')
      setConfirmFY(null)
      setPassword('')
    }
  }

  return (
    <div ref={ref} style={{ position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 500,
      background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: 12,
      boxShadow: '0 16px 40px rgba(0,0,0,0.2)', width: 340, overflow: 'hidden' }}>

      {/* Header */}
      <div style={{ padding: '11px 14px', background: 'var(--sidebar-bg)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(175deg, rgba(255,255,255,0.12) 0%, rgba(255,255,255,0.02) 60%, rgba(0,0,0,0.06) 100%)', pointerEvents: 'none' }}/>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, position: 'relative' }}>
          <Settings size={13} style={{ color: 'rgba(255,255,255,0.7)' }}/>
          <span style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>Financial Year Manager</span>
        </div>
        <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.14)', border: '1px solid rgba(255,255,255,0.26)', borderRadius: 5, padding: '3px 7px', cursor: 'pointer', color: '#fff', display: 'flex', position: 'relative' }}>
          <X size={12}/>
        </button>
      </div>

      {/* FY list */}
      <div style={{ maxHeight: 300, overflowY: 'auto' }}>
        {availableFYs.length === 0 ? (
          <div style={{ padding: '20px 14px', fontSize: 13, color: 'var(--text-3)', textAlign: 'center' }}>No financial years yet. Add one below.</div>
        ) : availableFYs.map((fy, i, arr) => {
          const count      = fyStats[fy] || 0
          const isConf     = confirmFY === fy
          const isUnlocking = fyUnlockTarget === fy
          const isLast     = i === arr.length - 1
          const isFYLocked = lockedFYs?.has(fy)
          const isHovered = hoveredFY === fy
          return (
            <div key={fy}>
              <div
                onMouseEnter={() => setHoveredFY(fy)}
                onMouseLeave={() => setHoveredFY(null)}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 14px',
                borderBottom: '1px solid var(--card-border)',
                background: isConf ? 'rgba(220,38,38,0.06)' : isUnlocking ? 'rgba(251,191,36,0.07)' : isHovered ? 'var(--table-row-hover)' : isFYLocked ? 'rgba(251,191,36,0.05)' : 'transparent',
                transition: 'background 0.15s' }}>
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>FY {fy}</span>
                  {isFYLocked && <span style={{ fontSize: 10, fontWeight: 700, color: '#d97706', background: 'rgba(251,191,36,0.15)', border: '1px solid rgba(251,191,36,0.35)', borderRadius: 4, padding: '1px 6px', letterSpacing: '0.04em' }}>LOCKED</span>}
                </div>
                <span style={{ fontSize: 11, color: count > 0 ? 'var(--text-2)' : 'var(--text-3)', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
                  {count > 0 ? `${count} record${count !== 1 ? 's' : ''}` : 'No data'}
                </span>
                {/* Per-FY lock toggle — lock directly, unlock requires password */}
                <button
                  onClick={() => isFYLocked ? requestFYUnlock(fy) : onToggleFYLock?.(fy)}
                  title={isFYLocked ? `Unlock FY ${fy}` : `Lock FY ${fy}`}
                  style={{ background: 'none', border: 'none', padding: '3px 4px', borderRadius: 4,
                    display: 'flex', flexShrink: 0, cursor: 'pointer',
                    color: isFYLocked ? '#d97706' : 'var(--text-3)',
                    opacity: 1 }}>
                  {isFYLocked ? <Lock size={13}/> : <Unlock size={13}/>}
                </button>
                <button
                  onClick={() => handleDeleteClick(fy)}
                  disabled={deleting === fy}
                  title={count > 0 ? 'Delete FY and all its declarations' : 'Remove this FY'}
                  style={{ background: 'none', border: 'none',
                    cursor: deleting === fy ? 'not-allowed' : 'pointer',
                    color: '#dc2626',
                    padding: '3px 4px', borderRadius: 4, display: 'flex', flexShrink: 0,
                    opacity: deleting === fy ? 0.4 : 1 }}>
                  {deleting === fy ? <Loader2 size={13} className="animate-spin"/> : <Trash2 size={13}/>}
                </button>
              </div>
              {isConf && (
                <div style={{ padding: '12px 14px', background: 'rgba(220,38,38,0.06)',
                  borderBottom: !isLast ? '1px solid var(--card-border)' : 'none' }}>
                  <p style={{ fontSize: 11, color: '#dc2626', fontWeight: 700, margin: '0 0 8px', lineHeight: 1.55 }}>
                    ⚠ This will permanently delete {count} declaration{count !== 1 ? 's' : ''} for FY {fy}. Enter your password to confirm.
                  </p>
                  <input
                    ref={pwRef}
                    type="password"
                    value={password}
                    onChange={e => { setPassword(e.target.value); setPwErr(false) }}
                    onKeyDown={e => {
                      if (e.key === 'Enter') doDelete(confirmFY, password)
                      if (e.key === 'Escape') { setConfirmFY(null); setPassword('') }
                    }}
                    placeholder="Your password"
                    className="field-input"
                    style={{ width: '100%', height: 32, fontSize: 13, marginBottom: pwErr ? 4 : 6,
                      boxSizing: 'border-box', borderColor: pwErr ? '#dc2626' : undefined }}
                  />
                  {pwErr && <p style={{ fontSize: 11, color: '#dc2626', margin: '0 0 6px', fontWeight: 600 }}>Incorrect password</p>}
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button onClick={() => { setConfirmFY(null); setPassword(''); setPwErr(false) }}
                      style={{ flex: 1, height: 30, borderRadius: 6, fontSize: 12, fontWeight: 600,
                        background: 'transparent', color: 'var(--text-2)', border: '1px solid var(--card-border)', cursor: 'pointer' }}>
                      Cancel
                    </button>
                    <button onClick={() => doDelete(confirmFY, password)} disabled={!password || deleting === fy}
                      style={{ flex: 1, height: 30, borderRadius: 6, fontSize: 12, fontWeight: 700,
                        background: '#dc2626', color: '#fff', border: 'none',
                        cursor: !password || deleting === fy ? 'not-allowed' : 'pointer',
                        opacity: !password || deleting === fy ? 0.6 : 1,
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
                      {deleting === fy ? <Loader2 size={11} className="animate-spin"/> : null}
                      Delete All
                    </button>
                  </div>
                </div>
              )}
              {isUnlocking && (
                <div style={{ padding: '12px 14px', background: 'rgba(251,191,36,0.08)',
                  borderBottom: !isLast ? '1px solid var(--card-border)' : 'none' }}>
                  <p style={{ fontSize: 11, color: '#92400e', fontWeight: 700, margin: '0 0 8px', lineHeight: 1.55, display: 'flex', alignItems: 'center', gap: 5 }}>
                    <Unlock size={11}/> Enter your password to unlock FY {fy}
                  </p>
                  <div style={{ display: 'flex', gap: 6, marginBottom: fyUnlockPwErr ? 4 : 6 }}>
                    <input
                      ref={fyUnlockPwRef}
                      type="password"
                      value={fyUnlockPw}
                      onChange={e => { setFyUnlockPw(e.target.value); setFyUnlockPwErr(false) }}
                      onKeyDown={e => {
                        if (e.key === 'Enter') doFYUnlock()
                        if (e.key === 'Escape') { setFyUnlockTarget(null); setFyUnlockPw('') }
                      }}
                      placeholder="Your password"
                      className="field-input"
                      style={{ flex: 1, height: 32, fontSize: 13,
                        borderColor: fyUnlockPwErr ? '#dc2626' : undefined }}
                    />
                    <button onClick={() => { setFyUnlockTarget(null); setFyUnlockPw('') }}
                      style={{ height: 32, padding: '0 10px', borderRadius: 6, fontSize: 12, fontWeight: 600,
                        background: 'transparent', color: 'var(--text-2)', border: '1px solid var(--card-border)',
                        cursor: 'pointer', flexShrink: 0 }}>
                      Cancel
                    </button>
                    <button onClick={doFYUnlock} disabled={!fyUnlockPw || fyUnlocking}
                      style={{ height: 32, padding: '0 12px', borderRadius: 6, fontSize: 12, fontWeight: 700,
                        background: '#d97706', color: '#fff', border: 'none', flexShrink: 0,
                        cursor: !fyUnlockPw || fyUnlocking ? 'not-allowed' : 'pointer',
                        opacity: !fyUnlockPw || fyUnlocking ? 0.6 : 1,
                        display: 'flex', alignItems: 'center', gap: 5 }}>
                      {fyUnlocking ? <Loader2 size={11} className="animate-spin"/> : <Unlock size={11}/>}
                      Unlock
                    </button>
                  </div>
                  {fyUnlockPwErr && <p style={{ fontSize: 11, color: '#dc2626', margin: '0', fontWeight: 600 }}>Incorrect password</p>}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Add new FY */}
      <div style={{ padding: '12px 14px', borderTop: '1px solid var(--card-border)', background: 'var(--card-header-bg)' }}>
        <>
            <div style={{ display: 'flex', gap: 6 }}>
              <input
                value={input}
                onChange={e => { setInput(e.target.value); setErr('') }}
                onKeyDown={e => { if (e.key === 'Enter') handleAdd() }}
                placeholder="Add FY — e.g. 2028-29"
                className="field-input"
                style={{ flex: 1, height: 32, fontSize: 13 }}
              />
              <button onClick={handleAdd} disabled={saving || !input.trim()}
                style={{ height: 32, padding: '0 14px', borderRadius: 7, fontSize: 13, fontWeight: 600,
                  background: 'var(--sidebar-bg)', color: '#fff', border: 'none',
                  cursor: saving || !input.trim() ? 'not-allowed' : 'pointer', flexShrink: 0,
                  opacity: saving || !input.trim() ? 0.55 : 1, display: 'flex', alignItems: 'center', gap: 5 }}>
                {saving ? <Loader2 size={12} className="animate-spin"/> : <Plus size={12}/>}
                Add
              </button>
            </div>
            {err && <p style={{ fontSize: 11, color: 'var(--danger)', margin: '5px 0 0', fontWeight: 600 }}>{err}</p>}
          </>
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════
//  MODAL
// ════════════════════════════════════════════════════════

function DeclarationModal({ editId, initialFY, categories, catsLoading, profile, toast, onClose, onSaved }) {
  const today = new Date().toISOString().slice(0, 10)

  const [decl,    setDecl]    = useState({ financial_year: initialFY || getStoredFY(), declaration_date: today, income_category: '', declared_income: '', percentage: '' })
  const [declNo,  setDeclNo]  = useState(null)
  const [items,   setItems]   = useState([])
  const [saving,  setSaving]  = useState(false)
  const [loading, setLoading] = useState(!!editId)

  const [memberId,       setMemberId]       = useState('')
  const [memberName,     setMemberName]     = useState('')
  const [memberMobile,   setMemberMobile]   = useState('')
  const [memberWhatsapp, setMemberWhatsapp] = useState('')
  const [selMember,      setSelMember]      = useState(null)

  const [nameQ,       setNameQ]       = useState('')
  const [suggestions, setSuggestions] = useState([])
  const [suggesting,  setSuggesting]  = useState(false)
  const nameTimer       = useRef(null)
  const memberIdTimer   = useRef(null)

  const [memberIdSuggestions, setMemberIdSuggestions] = useState([])
  const [showMemberIdPopup,   setShowMemberIdPopup]   = useState(false)

  const [incomeRaw,     setIncomeRaw]     = useState('')
  const [incomeDisplay, setIncomeDisplay] = useState('')
  const [subRaw,        setSubRaw]        = useState('')
  const [subDisplay,    setSubDisplay]    = useState('')
  const [declNoInput,   setDeclNoInput]   = useState('')

  const [overrideEditId, setOverrideEditId] = useState(null)
  const [dupNotice,      setDupNotice]      = useState(null)
  const [alertModal,     setAlertModal]     = useState(null)

  const effectiveEditId = editId || overrideEditId

  // Focus management refs
  const memberIdRef        = useRef(null)
  const declNoRef          = useRef(null)
  const incomeCatRef       = useRef(null)
  const declarationDateRef = useRef(null)
  const firstContribRef    = useRef(null)

  const subCat    = categories[0]
  const otherCats = categories.slice(1)

  const incomeNum = parseAmt(incomeRaw)
  const pctNum    = parseFloat(decl.percentage) || 0
  const sub       = Math.round(incomeNum * pctNum / 100)

  // init items from categories
  useEffect(() => {
    if (!categories.length) return
    setItems(categories.map(c => ({ category_id: c.id, name: c.name, amount: '' })))
  }, [categories])

  // auto-generate declaration number for new
  useEffect(() => {
    if (editId || !decl.financial_year) return
    nextDeclNumber(decl.financial_year).then(n => { setDeclNo(n); setDeclNoInput(String(n).padStart(4, '0')) })
  }, [editId, decl.financial_year])

  // load existing when editing
  useEffect(() => {
    if (!editId) return
    setLoading(true)
    Promise.all([
      supabase.from('declarations').select('*').eq('id', editId).single(),
      supabase.from('declaration_items').select('*').eq('declaration_id', editId),
    ]).then(([{ data: d }, { data: di }]) => {
      if (!d) return
      setDecl({ financial_year: d.financial_year || '', declaration_date: d.declaration_date || '', income_category: d.income_category || '', declared_income: d.declared_income != null ? String(d.declared_income) : '', percentage: d.percentage != null ? String(d.percentage) : '' })
      setDeclNo(d.declaration_number ?? null)
      setDeclNoInput(d.declaration_number != null ? String(d.declaration_number).padStart(4, '0') : '')
      setMemberId(d.member_id || '')
      setMemberName(d.member_name || '')
      setSelMember({ member_id: d.member_id, member_name: d.member_name })
      const raw = d.declared_income != null ? String(Math.round(d.declared_income)) : ''
      setIncomeRaw(raw)
      setIncomeDisplay(raw ? Number(raw).toLocaleString('en-IN') : '')
      const map = {}
      ;(di || []).forEach(i => { map[i.category_id] = i })
      setItems(categories.map(c => ({ category_id: c.id, name: c.name, amount: map[c.id] ? String(Math.round(map[c.id].amount)) : '' })))
      const subItem = map[categories[0]?.id]
      if (subItem) {
        const val = String(Math.round(subItem.amount))
        setSubRaw(val)
        setSubDisplay(Number(val).toLocaleString('en-IN'))
      }
    }).finally(() => setLoading(false))
  }, [editId, categories])

  // (subscription auto-fill is handled directly in handleIncomeChange and selectPct)

  // autofocus Member ID after modal renders (or after edit load completes)
  useEffect(() => {
    if (loading) return
    const t = setTimeout(() => memberIdRef.current?.focus(), 80)
    return () => clearTimeout(t)
  }, [loading])

  // check if member already has a declaration for the active FY; if so, load it for editing
  const checkAndLoadExisting = useCallback(async (mid, fy) => {
    if (editId) return false  // already editing a specific record, skip
    const { data } = await supabase.from('declarations').select('id,declaration_number')
      .ilike('member_id', mid).eq('financial_year', fy).limit(1)
    if (!data?.length) { setDupNotice(null); setOverrideEditId(null); return false }
    const ex = data[0]
    setDupNotice({ declNo: ex.declaration_number, fy })
    setOverrideEditId(ex.id)
    const [{ data: d }, { data: di }] = await Promise.all([
      supabase.from('declarations').select('*').eq('id', ex.id).single(),
      supabase.from('declaration_items').select('*').eq('declaration_id', ex.id),
    ])
    if (d) {
      setDecl({ financial_year: d.financial_year || '', declaration_date: d.declaration_date || '', income_category: d.income_category || '', declared_income: d.declared_income != null ? String(d.declared_income) : '', percentage: d.percentage != null ? String(d.percentage) : '' })
      setDeclNo(d.declaration_number ?? null)
      setDeclNoInput(d.declaration_number != null ? String(d.declaration_number).padStart(4, '0') : '')
      const raw = d.declared_income != null ? String(Math.round(d.declared_income)) : ''
      setIncomeRaw(raw)
      setIncomeDisplay(raw ? Number(raw).toLocaleString('en-IN') : '')
      const map = {}
      ;(di || []).forEach(i => { map[i.category_id] = i })
      setItems(categories.map(c => ({ category_id: c.id, name: c.name, amount: map[c.id] ? String(Math.round(map[c.id].amount)) : '' })))
      const subItem = map[categories[0]?.id]
      if (subItem) {
        const val = String(Math.round(subItem.amount))
        setSubRaw(val)
        setSubDisplay(Number(val).toLocaleString('en-IN'))
      }
    }
    return true
  }, [editId, categories])

  // member ID prefix suggestion (as-you-type)
  const onMemberIdChange = (val) => {
    setMemberId(val)
    if (selMember) { setSelMember(null); setMemberName(''); setMemberMobile(''); setMemberWhatsapp('') }
    clearTimeout(memberIdTimer.current)
    if (!val.trim()) { setShowMemberIdPopup(false); setMemberIdSuggestions([]); return }
    memberIdTimer.current = setTimeout(async () => {
      const { data } = await supabase
        .from('members').select('member_id,member_name')
        .ilike('member_id', `${val.trim()}%`).eq('is_active', true)
        .order('member_id', { ascending: true }).limit(20)
      const rows = data || []
      setMemberIdSuggestions(rows)
      setShowMemberIdPopup(rows.length > 0)
    }, 250)
  }

  // lookup member by ID (Tab key handler)
  const lookupById = async (id) => {
    const trimmed = id.trim()
    if (!trimmed) return
    const { data } = await supabase
      .from('members')
      .select('member_id,member_name,mobile,whatsapp')
      .ilike('member_id', trimmed)
      .limit(1)
    if (data?.length) {
      const m = data[0]
      setMemberId(m.member_id)
      setMemberName(m.member_name)
      setMemberMobile(m.mobile || '')
      setMemberWhatsapp(m.whatsapp || '')
      setSelMember(m)
      setNameQ('')
      setSuggestions([])
      const found = await checkAndLoadExisting(m.member_id, decl.financial_year)
      if (!found) setTimeout(() => declNoRef.current?.focus(), 50)
    } else {
      setAlertModal({ icon: '🔍', title: 'Member Not Found', message: `No member with ID "${trimmed}" exists. Please check the Member ID and try again.` })
    }
  }

  // name autocomplete
  useEffect(() => {
    if (!nameQ.trim()) { setSuggestions([]); return }
    clearTimeout(nameTimer.current)
    nameTimer.current = setTimeout(async () => {
      setSuggesting(true)
      const { data } = await supabase.from('members')
        .select('member_id,member_name,mobile,whatsapp')
        .ilike('member_name', `%${nameQ.trim()}%`)
        .limit(8)
      setSuggestions(data || [])
      setSuggesting(false)
    }, 280)
  }, [nameQ])

  const selectMember = async m => {
    setSuggestions([])
    setNameQ('')
    setMemberId(m.member_id)
    setMemberName(m.member_name)
    setMemberMobile(m.mobile || '')
    setMemberWhatsapp(m.whatsapp || '')
    setSelMember(m)
    const found = await checkAndLoadExisting(m.member_id, decl.financial_year)
    if (!found) setTimeout(() => declNoRef.current?.focus(), 50)
  }

  const setItemAmt = (catId, val) =>
    setItems(prev => prev.map(i => i.category_id === catId ? { ...i, amount: val.replace(/[^0-9]/g, '') } : i))

  const sd = k => v => setDecl(f => ({ ...f, [k]: v }))

  const handleIncomeChange = e => {
    const raw = e.target.value.replace(/[^0-9]/g, '')
    setIncomeRaw(raw)
    setIncomeDisplay(raw ? Number(raw).toLocaleString('en-IN') : '')
    setDecl(f => ({ ...f, declared_income: raw }))
    const newIncome = Math.round(parseFloat(raw) || 0)
    const newSub    = Math.round(newIncome * pctNum / 100)
    const subVal    = newSub > 0 ? String(newSub) : ''
    setSubRaw(subVal)
    setSubDisplay(subVal ? Number(subVal).toLocaleString('en-IN') : '')
    if (subCat) setItems(prev => prev.map(i => i.category_id === subCat.id ? { ...i, amount: subVal } : i))
  }
  const handleIncomeBlur  = () => { if (incomeRaw) setIncomeDisplay(Number(incomeRaw).toLocaleString('en-IN')) }
  const handleIncomeFocus = () => { setIncomeDisplay(incomeRaw) }

  const handleSubChange = e => {
    const raw = e.target.value.replace(/[^0-9]/g, '')
    setSubRaw(raw)
    setSubDisplay(raw ? Number(raw).toLocaleString('en-IN') : '')
    if (subCat) setItems(prev => prev.map(i => i.category_id === subCat.id ? { ...i, amount: raw } : i))
  }
  const handleSubBlur  = () => { if (subRaw) setSubDisplay(Number(subRaw).toLocaleString('en-IN')) }
  const handleSubFocus = () => { setSubDisplay(subRaw) }

  // select % and jump to first contribution (Men's Fellowship)
  const selectPct = p => {
    sd('percentage')(String(p))
    const newSub = Math.round(incomeNum * p / 100)
    const subVal = newSub > 0 ? String(newSub) : ''
    setSubRaw(subVal)
    setSubDisplay(subVal ? Number(subVal).toLocaleString('en-IN') : '')
    if (subCat) setItems(prev => prev.map(i => i.category_id === subCat.id ? { ...i, amount: subVal } : i))
    setTimeout(() => firstContribRef.current?.focus(), 30)
  }

  // clear all member + amount fields (keep FY and date)
  const clearForm = () => {
    setMemberId(''); setMemberName(''); setMemberMobile(''); setMemberWhatsapp(''); setSelMember(null)
    setNameQ(''); setSuggestions([])
    setMemberIdSuggestions([]); setShowMemberIdPopup(false)
    setIncomeRaw(''); setIncomeDisplay('')
    setSubRaw(''); setSubDisplay('')
    setDecl(f => ({ ...f, income_category: '', declared_income: '', percentage: '' }))
    setItems(categories.map(c => ({ category_id: c.id, name: c.name, amount: '' })))
    setDeclNoInput(declNo != null ? String(declNo).padStart(4, '0') : '')
    setDupNotice(null)
    setOverrideEditId(null)
    setTimeout(() => memberIdRef.current?.focus(), 50)
  }

  const save = async () => {
    if (!selMember?.member_id) { toast('Please select a member', 'error'); return }
    if (!decl.financial_year)  { toast('Select financial year', 'error');  return }
    if (!incomeNum)            { toast('Enter declared income', 'error');   return }
    if (decl.percentage === '') { toast('Select subscription %', 'error'); return }
    if (pctNum > 0) {
      const minSub     = Math.round(incomeNum * pctNum / 100)
      const enteredSub = parseInt(subRaw) || 0
      if (enteredSub < minSub) {
        setAlertModal({
          icon: '⚠️',
          title: 'Subscription Too Low',
          message: `Declared Subscription cannot be less than ₹${minSub.toLocaleString('en-IN')}.\n(${pctNum}% of declared income ₹${incomeNum.toLocaleString('en-IN')})`,
        })
        return
      }
    }

    setSaving(true)
    try {
      const declData = {
        member_id:          selMember.member_id,
        member_name:        selMember.member_name,
        financial_year:     decl.financial_year,
        declaration_date:   decl.declaration_date || null,
        income_category:    decl.income_category  || null,
        declared_income:    incomeNum,
        percentage:         pctNum,
        declaration_number: parseInt(declNoInput) || null,
        created_by:         profile?.full_name || profile?.email,
      }

      let declId = effectiveEditId
      if (effectiveEditId) {
        const { error } = await supabase.from('declarations').update(declData).eq('id', effectiveEditId)
        if (error) throw error
        await supabase.from('declaration_items').delete().eq('declaration_id', effectiveEditId)
      } else {
        const { data: existingCheck } = await supabase.from('declarations').select('id,declaration_number')
          .eq('member_id', selMember.member_id).eq('financial_year', decl.financial_year).limit(1)
        if (existingCheck?.length) {
          const ex = existingCheck[0]
          setDupNotice({ declNo: ex.declaration_number, fy: decl.financial_year })
          setOverrideEditId(ex.id)
          toast(`Member already has a declaration for FY ${decl.financial_year} — loaded for editing`, 'error')
          setSaving(false); return
        }
        const { data, error } = await supabase.from('declarations').insert(declData).select('id').single()
        if (error) throw error
        declId = data.id
      }

      const rows = items.filter(i => parseInt(i.amount) > 0)
        .map(i => ({ declaration_id: declId, category_id: i.category_id, amount: parseInt(i.amount) }))
      if (rows.length) {
        const { error } = await supabase.from('declaration_items').insert(rows)
        if (error) throw error
      }

      toast(effectiveEditId ? 'Declaration updated' : 'Declaration saved', 'success')
      onSaved(decl.financial_year)
    } catch (e) { toast(e.message, 'error') }
    setSaving(false)
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'var(--overlay)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: 12 }}>
      <div style={{ background: 'var(--card-bg)', borderRadius: 12, width: '100%', maxWidth: 980, maxHeight: '96vh', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 64px rgba(0,0,0,0.4)' }}>

        {/* ══ Glossy Header ══ */}
        <div style={{ background: 'var(--sidebar-bg)', borderRadius: '12px 12px 0 0', padding: '11px 18px 11px', flexShrink: 0, position: 'relative', overflow: 'hidden' }}>
          {/* Gloss sheen */}
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(175deg, rgba(255,255,255,0.2) 0%, rgba(255,255,255,0.04) 50%, rgba(0,0,0,0.08) 100%)', pointerEvents: 'none', borderRadius: '12px 12px 0 0' }}/>
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <h2 style={{ color: '#fff', fontSize: 15, fontWeight: 700, margin: 0, textShadow: '0 1px 3px rgba(0,0,0,0.3)', letterSpacing: '0.01em' }}>
              {effectiveEditId ? 'Edit Declaration' : 'New Declaration'}
            </h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              {/* FY badge — fixed to the selected FY, not changeable mid-form */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6,
                background: 'rgba(255,255,255,0.14)', border: '1px solid rgba(255,255,255,0.28)',
                borderRadius: 6, padding: '4px 10px' }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.55)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>FY</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>{decl.financial_year}</span>
              </div>
              <button onClick={onClose} tabIndex={-1}
                style={{ background: 'rgba(255,255,255,0.14)', border: '1px solid rgba(255,255,255,0.26)', borderRadius: 7, padding: '5px 9px', cursor: 'pointer', color: '#fff', display: 'flex', alignItems: 'center', transition: 'all 0.15s' }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.75)'; e.currentTarget.style.borderColor = 'rgba(239,68,68,0.9)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.14)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.26)' }}>
                <X size={15}/>
              </button>
            </div>
          </div>
        </div>

        {/* ── Body ── */}
        {loading ? (
          <div style={{ padding: 60, textAlign: 'center' }}>
            <Loader2 size={28} className="animate-spin" style={{ color: 'var(--text-3)', margin: '0 auto' }}/>
          </div>
        ) : (
          <>
          {dupNotice && (
            <div style={{ padding: '8px 18px', background: 'rgba(234,179,8,0.1)', borderBottom: '1px solid rgba(234,179,8,0.3)', display: 'flex', alignItems: 'center', gap: 9, flexShrink: 0 }}>
              <span style={{ fontSize: 15, flexShrink: 0 }}>⚠️</span>
              <p style={{ fontSize: 12, fontWeight: 600, color: '#92400e', margin: 0, lineHeight: 1.45 }}>
                Member already has Declaration <strong>#{String(dupNotice.declNo ?? 0).padStart(4, '0')}</strong> for FY {dupNotice.fy} — loaded for editing.
              </p>
            </div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', overflow: 'hidden', flex: 1, minHeight: 0 }}>

            {/* ══ Left column ══ */}
            <div style={{ padding: '14px 18px', overflowY: 'auto', borderRight: '1px solid var(--card-border)', display: 'flex', flexDirection: 'column', gap: 9 }}>

              {/* Row 1: Member ID | Member Name | WhatsApp — 3 columns */}
              <div style={{ display: 'grid', gridTemplateColumns: '0.8fr 1.4fr 1fr', gap: 8 }}>
                <Row label="Member ID">
                  <div style={{ position: 'relative' }}>
                    <input
                      ref={memberIdRef}
                      value={memberId}
                      onChange={e => onMemberIdChange(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Tab' || e.key === 'Enter') {
                          if (!memberId.trim()) return
                          e.preventDefault()
                          setShowMemberIdPopup(false)
                          if (selMember) { declNoRef.current?.focus() } else { lookupById(memberId) }
                        }
                        if (e.key === 'Escape') { setShowMemberIdPopup(false) }
                      }}
                      onFocus={() => memberIdSuggestions.length > 0 && setShowMemberIdPopup(true)}
                      onBlur={() => setTimeout(() => {
                        setShowMemberIdPopup(false)
                        if (memberId.trim() && !selMember) lookupById(memberId)
                      }, 200)}
                      placeholder="ID + Tab"
                      className="field-input"
                      style={{ height: 32 }}
                      tabIndex={0}
                      autoComplete="off"
                    />
                    {showMemberIdPopup && memberIdSuggestions.length > 0 && (
                      <div style={{ position: 'absolute', top: '100%', left: 0, zIndex: 300,
                        minWidth: 280,
                        background: 'var(--card-bg)', border: '1px solid var(--card-border)',
                        borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
                        maxHeight: 200, overflowY: 'auto', marginTop: 3 }}>
                        <div style={{ padding: '5px 10px', fontSize: 10, fontWeight: 700,
                          color: 'var(--text-3)', borderBottom: '1px solid var(--card-border)',
                          textTransform: 'uppercase', letterSpacing: '0.06em',
                          background: 'var(--page-bg)', borderRadius: '8px 8px 0 0' }}>
                          Matching Members
                        </div>
                        {memberIdSuggestions.map(m => (
                          <button key={m.member_id}
                            onMouseDown={e => { e.preventDefault(); lookupById(m.member_id); setShowMemberIdPopup(false) }}
                            style={{ display: 'flex', width: '100%', padding: '6px 10px', gap: 10,
                              alignItems: 'center', background: 'none', border: 'none',
                              cursor: 'pointer', borderBottom: '1px solid var(--table-border)',
                              textAlign: 'left' }}
                            onMouseEnter={e => e.currentTarget.style.background = 'var(--table-row-hover)'}
                            onMouseLeave={e => e.currentTarget.style.background = 'none'}>
                            <span style={{ fontWeight: 700, fontFamily: 'monospace', color: 'var(--info)', minWidth: 70, fontSize: 12 }}>{m.member_id}</span>
                            <span style={{ fontSize: 12, color: 'var(--text-2)' }}>{m.member_name}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </Row>
                <Row label="Member Name">
                  <div style={{ position: 'relative' }}>
                    <input
                      value={selMember ? memberName : nameQ}
                      onChange={e => {
                        if (selMember) { setSelMember(null); setMemberId(''); setMemberName(''); setMemberMobile(''); setMemberWhatsapp('') }
                        setNameQ(e.target.value)
                      }}
                      placeholder="Or search by name…"
                      className="field-input"
                      style={{ height: 32, paddingRight: suggesting ? 32 : undefined }}
                      tabIndex={-1}
                    />
                    {suggesting && <Loader2 size={12} className="animate-spin" style={{ position: 'absolute', right: 9, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }}/>}
                    {suggestions.length > 0 && (
                      <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 200, background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.15)', overflow: 'hidden', marginTop: 2 }}>
                        {suggestions.map(m => (
                          <button key={m.member_id} onClick={() => selectMember(m)}
                            style={{ display: 'block', width: '100%', padding: '7px 12px', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', borderBottom: '1px solid var(--table-border)' }}
                            onMouseEnter={e => e.currentTarget.style.background = 'var(--table-row-hover)'}
                            onMouseLeave={e => e.currentTarget.style.background = 'none'}>
                            <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-1)' }}>{m.member_name}</span>
                            <span style={{ fontSize: 11, color: 'var(--text-3)', marginLeft: 8 }}>{m.member_id}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </Row>
                <Row label="WhatsApp">
                  <input
                    value={memberWhatsapp || memberMobile}
                    readOnly
                    className="field-input"
                    style={{ height: 32, background: 'var(--page-bg)', color: 'var(--text-2)', fontVariantNumeric: 'tabular-nums' }}
                    placeholder="Auto-filled"
                    tabIndex={-1}
                  />
                </Row>
              </div>

              {/* Row 2: Declaration No | Declaration Date — Date is tab-skipped (pre-filled) */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <Row label="Declaration No.">
                  <input
                    ref={declNoRef}
                    type="text" inputMode="numeric"
                    value={declNoInput}
                    onChange={e => setDeclNoInput(e.target.value.replace(/[^0-9]/g, ''))}
                    className="field-input"
                    style={{ height: 32, fontVariantNumeric: 'tabular-nums', fontWeight: 700, fontSize: 15 }}
                    placeholder="Auto"
                    tabIndex={0}
                  />
                </Row>
                <Row label="Declaration Date">
                  <input
                    ref={declarationDateRef}
                    type="date"
                    value={decl.declaration_date}
                    onChange={e => sd('declaration_date')(e.target.value)}
                    className="field-input"
                    style={{ height: 32 }}
                    tabIndex={-1}
                  />
                </Row>
              </div>

              {/* ─── Income Declaration section ─── */}
              <Divider label="Income Declaration" />

              {/* Tab 4: Category of Income */}
              <Row label="Category of Income">
                <select
                  ref={incomeCatRef}
                  value={decl.income_category}
                  onChange={e => sd('income_category')(e.target.value)}
                  className="field-input"
                  style={{ appearance: 'none', height: 32 }}
                  tabIndex={0}
                >
                  <option value="">— Select —</option>
                  {INCOME_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </Row>

              {/* Tab 5: Declared Income + Subscription side by side */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <Row label="Declared Income (₹)">
                  <input
                    type="text" inputMode="numeric"
                    value={incomeDisplay}
                    onChange={handleIncomeChange}
                    onFocus={handleIncomeFocus}
                    onBlur={handleIncomeBlur}
                    className="field-input"
                    style={{ height: 36, textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 700, fontSize: 15 }}
                    placeholder="0"
                    tabIndex={0}
                  />
                </Row>
                <Row label="Declared Subscription (₹)">
                  <input
                    type="text" inputMode="numeric"
                    value={subDisplay}
                    onChange={handleSubChange}
                    onFocus={handleSubFocus}
                    onBlur={handleSubBlur}
                    className="field-input"
                    style={{ height: 36, textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 800, fontSize: 15, border: '1.5px solid var(--sidebar-bg)', color: 'var(--sidebar-bg)' }}
                    placeholder="0"
                    tabIndex={0}
                  />
                </Row>
              </div>

              {/* In-words labels */}
              {(incomeNum > 0 || (parseInt(subRaw) || 0) > 0) && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: -3 }}>
                  <div style={{ fontSize: 11, color: 'var(--text-3)', fontStyle: 'italic', lineHeight: 1.4 }}>
                    {incomeNum > 0 ? toWords(incomeNum) : ''}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-2)', fontStyle: 'italic', fontWeight: 600, lineHeight: 1.4 }}>
                    {(parseInt(subRaw) || 0) > 0 ? toWords(parseInt(subRaw)) : ''}
                  </div>
                </div>
              )}

              {/* Subscription % buttons */}
              <Row label="Declared Subscription %">
                <div style={{ display: 'flex', gap: 6 }}>
                  {SUB_PCTS.map(p => {
                    const sel = String(decl.percentage) === String(p)
                    return (
                      <button key={p}
                        onClick={() => selectPct(p)}
                        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectPct(p) } }}
                        style={{ flex: 1, height: 32, borderRadius: 7, fontSize: 13, fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s', outline: 'none', fontFamily: 'inherit',
                          ...(sel
                            ? { background: 'var(--sidebar-bg)', color: '#fff', border: '2px solid var(--sidebar-bg)' }
                            : { background: 'var(--card-bg)', color: 'var(--text-2)', border: '1.5px solid var(--card-border)' })
                        }}
                        tabIndex={0}
                      >
                        {p === 0 ? '0% (Nominal)' : `${p}%`}
                      </button>
                    )
                  })}
                </div>
              </Row>

            </div>

            {/* ── Right column — Declared Contributions ── */}
            <div style={{ padding: '10px 16px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 3 }}>
              <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-2)', margin: '0 0 4px', textAlign: 'center', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Declared Contributions
              </p>

              {catsLoading ? (
                <div style={{ textAlign: 'center', padding: 24 }}>
                  <Loader2 size={20} className="animate-spin" style={{ color: 'var(--text-3)', margin: '0 auto' }}/>
                </div>
              ) : otherCats.length === 0 ? (
                <p style={{ fontSize: 12, color: 'var(--text-3)', textAlign: 'center' }}>
                  No categories found. Add them in Church Setup.
                </p>
              ) : (
                otherCats.map((cat, idx) => {
                  const item = items.find(i => i.category_id === cat.id)
                  const hasVal = parseInt(item?.amount) > 0
                  return (
                    <div key={cat.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <label style={{ flex: 1, fontSize: 12, fontWeight: hasVal ? 600 : 400, color: hasVal ? 'var(--text-1)' : 'var(--text-2)' }}>
                        {cat.name}
                      </label>
                      <input
                        ref={idx === 0 ? firstContribRef : null}
                        type="text" inputMode="numeric"
                        value={item?.amount || ''}
                        onChange={e => setItemAmt(cat.id, e.target.value)}
                        className="field-input"
                        style={{ width: 110, textAlign: 'right', height: 28, fontSize: 13, fontWeight: 700, fontVariantNumeric: 'tabular-nums', letterSpacing: '0.01em' }}
                        placeholder="0"
                        tabIndex={0}
                      />
                    </div>
                  )
                })
              )}
            </div>
          </div>
          </>
        )}

        {/* ══ Footer ══ */}
        <div style={{ padding: '11px 18px', borderTop: '1px solid var(--card-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexShrink: 0, background: 'var(--card-header-bg)', borderRadius: '0 0 12px 12px' }}>
          <div>
            {!effectiveEditId && (
              <FooterBtn onClick={clearForm} color="text" title="Reset all fields">
                <RotateCcw size={13}/> Clear
              </FooterBtn>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <FooterBtn onClick={onClose} color="cancel">Cancel</FooterBtn>
            <FooterBtn onClick={save} disabled={saving} color="submit">
              {saving ? <Loader2 size={14} className="animate-spin"/> : <Save size={14}/>}
              {saving ? 'Saving…' : effectiveEditId ? 'Update' : 'Submit'}
            </FooterBtn>
          </div>
        </div>

      </div>

      {/* ── Alert popup (member not found / subscription minimum) ── */}
      {alertModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 10001, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(15,23,42,0.55)', backdropFilter: 'blur(3px)' }}>
          <div style={{ background: 'var(--card-bg)', borderRadius: 14, padding: '28px 30px 22px', maxWidth: 360, width: '100%', margin: 16, boxShadow: '0 24px 64px rgba(0,0,0,0.45)', textAlign: 'center', fontFamily: 'var(--font-ui)' }}>
            <div style={{ fontSize: 38, marginBottom: 10, lineHeight: 1 }}>{alertModal.icon}</div>
            <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-1)', margin: '0 0 10px' }}>{alertModal.title}</h3>
            <p style={{ fontSize: 13, color: 'var(--text-2)', margin: '0 0 22px', lineHeight: 1.6, whiteSpace: 'pre-line' }}>{alertModal.message}</p>
            <button
              autoFocus
              onClick={() => setAlertModal(null)}
              style={{ padding: '8px 32px', borderRadius: 8, background: 'var(--sidebar-bg)', color: '#fff', border: 'none', fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'var(--font-ui)' }}>
              OK
            </button>
          </div>
        </div>
      )}

    </div>
  )
}

function Row({ label, children }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 4 }}>
        {label}
      </label>
      {children}
    </div>
  )
}

function FooterBtn({ onClick, disabled, color, children, title }) {
  const base = { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 18px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: disabled ? 'not-allowed' : 'pointer', border: 'none', transition: 'all 0.18s', opacity: disabled ? 0.55 : 1, outline: 'none', fontFamily: 'inherit' }
  const styles = {
    submit: { ...base, background: 'var(--sidebar-bg)', color: '#fff', boxShadow: '0 3px 12px rgba(13,34,68,0.35)' },
    cancel: { ...base, background: 'var(--card-bg)', color: 'var(--text-2)', border: '1.5px solid var(--card-border)' },
    text:   { ...base, background: 'transparent', color: 'var(--text-3)', border: '1.5px solid var(--card-border)' },
  }
  const hoverIn = e => {
    if (disabled) return
    if (color === 'submit') { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 6px 20px rgba(13,34,68,0.5)' }
    if (color === 'cancel') { e.currentTarget.style.borderColor = 'var(--input-focus-border)'; e.currentTarget.style.color = 'var(--text-1)' }
    if (color === 'text')   { e.currentTarget.style.borderColor = 'var(--warning)'; e.currentTarget.style.color = 'var(--warning)' }
  }
  const hoverOut = e => {
    if (color === 'submit') { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 3px 12px var(--accent-ring)' }
    if (color === 'cancel') { e.currentTarget.style.borderColor = 'var(--card-border)'; e.currentTarget.style.color = 'var(--text-2)' }
    if (color === 'text')   { e.currentTarget.style.borderColor = 'var(--card-border)'; e.currentTarget.style.color = 'var(--text-3)' }
  }
  return <button style={styles[color]} onClick={onClick} disabled={disabled} title={title} onMouseEnter={hoverIn} onMouseLeave={hoverOut}>{children}</button>
}

function Divider({ label }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '2px 0' }}>
      <span style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--sidebar-bg)', whiteSpace: 'nowrap' }}>
        {label}
      </span>
      <div style={{ flex: 1, height: 1, background: 'var(--card-border)' }}/>
    </div>
  )
}