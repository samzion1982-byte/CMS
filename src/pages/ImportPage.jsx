import { useState, useRef, useEffect, useCallback } from 'react'
import ReactDOM from 'react-dom'
import { supabase, adminSupabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { useToast } from '../lib/toast'
import { Upload, FileSpreadsheet, CheckCircle, Loader2, RefreshCw, Camera, Trash2, Database, ShieldAlert, AlertTriangle, Zap, XCircle, Clock, IndianRupee } from 'lucide-react'
import { getActiveCategories } from '../lib/paymentCategories'

// ── TABLES TO EXCLUDE FROM FLUSH ALL & STATS TILES ───────────────────────────
// Add any table names here that should never appear in the Flush All modal
// or the stats tiles. These are system/config tables not managed by imports.
const EXCLUDED_TABLES = [
  'migration_history',
  'members_staging',
  'lookups',
  'profiles',
  'churches',
  'auth_tracker',
  'announcement_settings',
  'bible_verses',
  // Add more here as needed ↓
]

// ── COLUMN MAPPING — exact Excel column order, position-only, no name parsing ─
// Col:  A          B           C       D             E          F
// Pos:  0          1           2       3             4          5
//       FamilyID   MemberID    Title   MemberName    Fname      Gender
//
// Col:  G          H     I    J     K            L
// Pos:  6          7     8    9     10           11
//       Aadhar     DOB   Age  DOBC  Is_Married   DOM
//
// Col:  M       N       O        P        Q         R         S     T
// Pos:  12      13      14       15       16        17        18    19
//       Dummy1  Dummy2  Spouse   Address  Address1  Address2  City  State
//
// Col:  U       V            W       X          Y
// Pos:  20      21           22      23         24
//       Dummy3  Zonal Area   Mobile  Whatsapp   Email
//
// Col:  Z               AA          AB      AC      AD      AE
// Pos:  25              26          27      28      29      30
//       Qualification   Profession  Sector  Dummy4  Dummy5  Dummy6
//
// Col:  AF          AG         AH             AI          AJ
// Pos:  31          32         33             34          35
//       Converted   FHStatus   Relationship   MemStatus   Church
//
// Col:  AK            AL        AM            AN      AO           AP
// Pos:  36             37        38            39      40           41
//       Denomination  Mem_Year  Is_Baptised   DOBapt  Is_Confirm   DOC
//
// Col:  AQ      AR      AS      AT      AU        AV
// Pos:  42      43      44      45      46        47
//       Dummy7  Dummy8  Dummy9  Dummy10 Is_FBRF   Photo
//
// Col:  AW                   AX                    AY                   AZ
// Pos:  48                   49                    50                   51
//       Ch1-Men's Fellowship Ch2-Women's Fellowship Ch3-Youth Association Ch4-Sunday School
//
// Col:  BA      BB                      BC                  BD     BE    BF             BG
// Pos:  52      53                      54                  55     56    57             58
//       Ch5-Choir Ch6-Pastorate Comm.  Ch7-Village Ministry Ch8-DCC Ch9-DC Ch10-Volunteers Ch11-Others
//
// Col:  BH      BI      BJ      BK      BL              BM
// Pos:  59      60      61      62      63              64
//       Dummy11 Dummy12 Dummy13 Dummy14 Old Member ID   Reason
//
// Col:  BN          BO           ... (all ignored)
// Pos:  65          66
//       Timestamp   Modified by
//
const POS_MAP = {
   0: 'family_id',
   1: 'member_id',
   2: 'title',
   3: 'member_name',
   4: 'father_name',
   5: 'gender',
   6: 'aadhaar',
   7: 'dob_actual',
   8: 'age',
   9: 'dob_certificate',
  10: 'marital_status',
  11: 'date_of_marriage',
  12: null,                      // Dummy1
  13: null,                      // Dummy2
  14: 'spouse_name',
  15: 'address_street',
  16: 'area_1',
  17: 'area_2',
  18: 'city',
  19: 'state',
  20: null,                      // Dummy3
  21: 'zonal_area',
  22: 'mobile',
  23: 'whatsapp',
  24: 'email',
  25: 'qualification',
  26: 'profession',
  27: 'working_sector',
  28: null,                      // Dummy4
  29: null,                      // Dummy5
  30: null,                      // Dummy6
  31: 'is_first_gen_christian',  // Converted
  32: 'is_family_head',          // FHStatus
  33: 'relationship_with_fh',    // Relationship
  34: 'membership_type',         // MemStatus
  35: 'primary_church_name',     // Church
  36: 'denomination',
  37: 'membership_from_year',    // Mem_Year
  38: 'baptism_type',            // Is_Baptised
  39: 'baptism_date',            // DOBapt
  40: 'confirmation_taken',      // Is_Confirm
  41: 'confirmation_date',       // DOC
  42: null,                      // Dummy7
  43: null,                      // Dummy8
  44: null,                      // Dummy9
  45: null,                      // Dummy10
  46: 'is_fbrf_member',          // Is_FBRF
  47: 'photo_url',               // Photo — in SKIP, never written
  48: 'act_mens_fellowship',     // Ch1-Men's Fellowship
  49: 'act_womens_fellowship',   // Ch2-Women's Fellowship
  50: 'act_youth_association',   // Ch3-Youth Association
  51: 'act_sunday_school',       // Ch4-Sunday School
  52: 'act_choir',               // Ch5-Choir
  53: 'act_pastorate_committee', // Ch6-Pastorate Committee
  54: 'act_village_ministry',    // Ch7-Village Ministry
  55: 'act_dcc',                 // Ch8-DCC
  56: 'act_dc',                  // Ch9-DC
  57: 'act_volunteers',          // Ch10-Volunteers
  58: 'act_others',              // Ch11-Others
  59: null,                      // Dummy11
  60: null,                      // Dummy12
  61: null,                      // Dummy13
  62: null,                      // Dummy14
  63: 'old_member_id',
  64: 'change_reason',
  // 65+ = Timestamp, Modified by, Dummy15-19, Family ID Helper — all ignored
}

const SKIP     = ['photo_url', 'last_modified_at', 'last_modified_by']
const ACT_COLS = [
  'act_mens_fellowship','act_womens_fellowship','act_youth_association',
  'act_sunday_school','act_choir','act_pastorate_committee',
  'act_village_ministry','act_dcc','act_dc','act_volunteers','act_others'
]
const DATE_COLS = ['dob_actual','dob_certificate','date_of_marriage','baptism_date','confirmation_date']

// ── mapHeader: POSITION ONLY — header names are irrelevant ───────────────────
// Returns the DB column name for a given column index, or null to skip.
function mapHeader(idx) {
  return POS_MAP[idx] ?? null
}

function cleanVal(val, dbCol) {
  if (val===null||val===undefined||val==='') return null
  const s = String(val).trim(); if (!s) return null
  if (ACT_COLS.includes(dbCol)) return (s&&s!=='0'&&s.toLowerCase()!=='false'&&s.toLowerCase()!=='no')
  if (DATE_COLS.includes(dbCol)) {
    // ── Handle JS Date objects directly ───────────────────────────────────
    if (val instanceof Date && !isNaN(val.getTime())) {
      const dateStr = val.toISOString().split('T')[0]
      if (isValidDateForField(dateStr, dbCol)) return dateStr
      console.warn(`[cleanVal] Date object rejected as future/invalid for ${dbCol}:`, dateStr)
      return null
    }
    
    // ── Try ISO string format first (YYYY-MM-DD) ──────────────────────────
    const isoMatch = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
    if (isoMatch) {
      const [, y, m, d] = isoMatch
      const year = parseInt(y, 10), month = parseInt(m, 10), day = parseInt(d, 10)
      if (isValidYMD(year, month, day)) {
        const dateStr = formatYMD(year, month, day)
        if (isValidDateForField(dateStr, dbCol)) {
          console.log(`[cleanVal] Parsed ISO date for ${dbCol}:`, s, '→', dateStr)
          return dateStr
        }
        console.warn(`[cleanVal] ISO date rejected for ${dbCol}:`, s)
      }
    }
    
    // ── Handle Excel numeric date format (days since 1899-12-30) ──────────
    // Only accept reasonable ranges: year 1900-2100
    const num = Number(val)
    if (!isNaN(num) && num > 0 && num < 73050) { // 73050 ≈ 2099-12-31
      const excelEpoch = new Date(1899, 11, 30)
      const date = new Date(excelEpoch.getTime() + num * 24 * 60 * 60 * 1000)
      if (!isNaN(date.getTime())) {
        const dateStr = date.toISOString().split('T')[0]
        if (isValidDateForField(dateStr, dbCol)) {
          console.log(`[cleanVal] Parsed Excel numeric date for ${dbCol}:`, num, '→', dateStr)
          return dateStr
        }
        console.warn(`[cleanVal] Excel date rejected for ${dbCol}:`, dateStr)
      }
    }
    
    // ── Parse manual date strings with explicit format detection ──────────
    const parts = s.split(/[-\/\s]+/)
    if (parts.length === 3) {
      const months = {jan:0,feb:1,mar:2,apr:3,may:4,jun:5,jul:6,aug:7,sep:8,oct:9,nov:10,dec:11}
      const p0 = parts[0].trim()
      const p1 = parts[1].trim()
      const p2 = parts[2].trim()

      // Try month-name format (e.g., "28-Jun-2026", "Jun-28-2026", etc.)
      const monthIdx = months[p1.toLowerCase().substring(0,3)]
      if (monthIdx !== undefined) {
        // Month name in p1: try day-month-year or month-day-year pattern
        const day = parseInt(p0, 10)
        const year = parseInt(p2, 10)
        if (isValidYMD(year, monthIdx + 1, day)) {
          const dateStr = formatYMD(year, monthIdx + 1, day)
          if (isValidDateForField(dateStr, dbCol)) {
            console.log(`[cleanVal] Parsed month-name date for ${dbCol}:`, s, '→', dateStr)
            return dateStr
          }
        }
      }

      // Try numeric date formats
      const a = parseInt(p0, 10)
      const b = parseInt(p1, 10)
      const c = parseInt(p2, 10)
      if (!Number.isNaN(a) && !Number.isNaN(b) && !Number.isNaN(c)) {
        const isYear1st = p0.length === 4
        // Slash separator = US M/D format; dash/dot/space = Indian D/M format
        const usSlash = s.indexOf('/') !== -1 && s.indexOf('-') === -1 && s.indexOf('.') === -1

        if (isYear1st) {
          // YYYY-MM-DD
          const year = a
          if (isValidYMD(year, b, c)) {
            const dateStr = formatYMD(year, b, c)
            if (isValidDateForField(dateStr, dbCol)) return dateStr
          }
          if (c <= 12 && isValidYMD(year, c, b)) {
            const dateStr = formatYMD(year, c, b)
            if (isValidDateForField(dateStr, dbCol)) return dateStr
          }
        } else {
          // ?-?-YY or ?-?-YYYY — expand 2-digit year across full range
          const year = p2.length <= 2 ? (c < 30 ? c + 2000 : c + 1900) : c

          // Unambiguous: b > 12 → b is the day, a is month (M/D)
          if (b > 12 && isValidYMD(year, a, b)) {
            const dateStr = formatYMD(year, a, b)
            if (isValidDateForField(dateStr, dbCol)) return dateStr
          }
          // Unambiguous: a > 12 → a is the day, b is month (D/M)
          if (a > 12 && isValidYMD(year, b, a)) {
            const dateStr = formatYMD(year, b, a)
            if (isValidDateForField(dateStr, dbCol)) return dateStr
          }
          // Ambiguous (both ≤ 12): slash = M/D first, dash/dot = D/M first
          if (usSlash) {
            if (isValidYMD(year, a, b)) {
              const dateStr = formatYMD(year, a, b)
              if (isValidDateForField(dateStr, dbCol)) return dateStr
            }
            if (isValidYMD(year, b, a)) {
              const dateStr = formatYMD(year, b, a)
              if (isValidDateForField(dateStr, dbCol)) return dateStr
            }
          } else {
            if (isValidYMD(year, b, a)) {
              const dateStr = formatYMD(year, b, a)
              if (isValidDateForField(dateStr, dbCol)) return dateStr
            }
            if (isValidYMD(year, a, b)) {
              const dateStr = formatYMD(year, a, b)
              if (isValidDateForField(dateStr, dbCol)) return dateStr
            }
          }
        }
      }
    }
    if (s) console.warn(`[cleanVal] Failed to parse date for ${dbCol}:`, s)
    return null
  }
  if (dbCol==='age') return parseInt(s)||null
  return s
}

// Helper: Validate year-month-day components
function isValidYMD(year, month, day) {
  if (year < 1900 || year > 2100) return false
  if (month < 1 || month > 12) return false
  if (day < 1 || day > 31) return false
  // Additional validation: check days in month
  const daysInMonth = [31, (year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  return day <= daysInMonth[month - 1]
}

// Helper: Format as YYYY-MM-DD
function formatYMD(year, month, day) {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

// Helper: Validate date makes sense for the field (e.g., DOB not in future)
function isValidDateForField(dateStr, dbCol) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const dateObj = new Date(dateStr + 'T00:00:00Z')
  
  // DOB-related fields should not be in the future
  if (dbCol.includes('dob') || dbCol === 'baptism_date' || dbCol === 'confirmation_date') {
    if (dateObj > today) return false
  }
  
  return !isNaN(dateObj.getTime())
}


// ── Password Modal (eye toggle, used only for Flush All) ─────────────────────
let _passwordModalResolve = null
function askPassword(setModalState) {
  return new Promise(resolve => {
    _passwordModalResolve = resolve
    setModalState(true)
  })
}
function PasswordModal({ open, onClose }) {
  const [pw, setPw] = useState('')
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  if (!open) return null
  async function submit() {
    if (!pw) return
    setBusy(true); setErr('')
    const { data: { user } } = await supabase.auth.getUser()
    if (!user?.email) { setErr('Session error. Please log in again.'); setBusy(false); return }
    const { error } = await supabase.auth.signInWithPassword({ email: user.email, password: pw })
    setBusy(false)
    if (error) { setErr('Incorrect password. Please try again.'); return }
    onClose()
    if (_passwordModalResolve) { _passwordModalResolve(true); _passwordModalResolve = null }
  }
  function cancel() {
    onClose()
    if (_passwordModalResolve) { _passwordModalResolve(false); _passwordModalResolve = null }
  }
  return ReactDOM.createPortal(
    <>
      <div style={{position:'fixed',inset:0,backgroundColor:'rgba(15,23,42,0.7)',backdropFilter:'blur(4px)',WebkitBackdropFilter:'blur(4px)',zIndex:4999}} onClick={cancel}/>
      <div style={{position:'fixed',top:'50%',left:'50%',transform:'translate(-50%,-50%)',width:'calc(100% - 48px)',maxWidth:340,backgroundColor:'#ffffff',borderRadius:12,border:'1px solid #e2e8f0',padding:'24px',boxShadow:'0 25px 50px -12px rgba(0,0,0,0.5)',zIndex:5000}}>
        <p style={{margin:'0 0 4px',fontSize:15,fontWeight:500,color:'#0f172a'}}>Confirm identity</p>
        <p style={{margin:'0 0 16px',fontSize:12,color:'#64748b'}}>Enter your login password to proceed</p>
        <div style={{position:'relative',marginBottom:err?8:16}}>
          <style>{`input.pw-no-reveal::-ms-reveal,input.pw-no-reveal::-ms-clear{display:none}input.pw-no-reveal::-webkit-contacts-auto-fill-button,input.pw-no-reveal::-webkit-credentials-auto-fill-button{display:none}`}</style>
          <input className="pw-no-reveal" type={show?'text':'password'} value={pw}
            onChange={e=>{setPw(e.target.value);setErr('')}}
            onKeyDown={e=>e.key==='Enter'&&submit()}
            placeholder="Password" autoFocus
            style={{width:'100%',boxSizing:'border-box',padding:'8px 36px 8px 10px',fontSize:13,border:'1px solid #cbd5e1',borderRadius:8,background:'#f8fafc',color:'#0f172a',outline:'none'}}/>
          <button onClick={()=>setShow(s=>!s)}
            style={{position:'absolute',right:8,top:'50%',transform:'translateY(-50%)',background:'none',border:'none',cursor:'pointer',color:'#94a3b8',padding:2,display:'flex',alignItems:'center'}}>
            {show
              ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
              : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>}
          </button>
        </div>
        {err && <p style={{margin:'0 0 12px',fontSize:11,color:'#dc2626'}}>{err}</p>}
        <div style={{display:'flex',gap:8,justifyContent:'flex-end'}}>
          <button onClick={cancel} style={{fontSize:12,padding:'6px 14px',border:'1px solid #e2e8f0',borderRadius:8,background:'none',color:'#64748b',cursor:'pointer'}}>Cancel</button>
          <button onClick={submit} disabled={!pw||busy}
            style={{fontSize:12,padding:'6px 14px',border:'none',borderRadius:8,background:'#2563eb',color:'#fff',cursor:'pointer',opacity:(!pw||busy)?0.5:1}}>
            {busy?'Verifying…':'Confirm'}
          </button>
        </div>
      </div>
    </>,
    document.body
  )
}

// ── Flush All Modal — queries live tables & buckets, checkbox selection ───────
function FlushAllModal({ open, onClose, onDone, setPasswordModal, profile, toast }) {
  const [items, setItems]       = useState([])   // { id, label, type, checked, count }
  const [loading, setLoading]   = useState(false)
  const [flushing, setFlushing] = useState(false)
  const [progress, setProgress] = useState('')

  useEffect(() => { if (open) loadItems() }, [open])

  async function loadItems() {
    setLoading(true)
    const discovered = []

    const PRIMARY_TABLES   = new Set(['members', 'deleted_members'])
    const PRIMARY_STORAGE  = new Set(['storage::member-photos::active', 'storage::member-photos::deleted'])

    // ── 1. Tables: try RPC; fallback = only 'members' ────────────────────────
    let knownTables = ['members']
    try {
      const { data: tables } = await supabase.rpc('get_user_tables')
      if (tables?.length) {
        knownTables = tables.map(t => t.table_name).filter(n => !EXCLUDED_TABLES.includes(n))
      }
    } catch (_) {}

    for (const tbl of knownTables) {
      try {
        const { count, error } = await supabase.from(tbl).select('*', { count:'exact', head:true })
        if (!error) discovered.push({
          id: `table::${tbl}`, label: tbl, type: 'table', count: count||0, checked: false,
          tier: PRIMARY_TABLES.has(tbl) ? 'primary' : 'secondary',
        })
      } catch (_) {}
    }

    // ── 2. Storage: include photo folders for cleanup ─────────────────
    const KNOWN_STORAGE = [
      { bucket: 'member-photos', folder: 'active',  label: 'Photos - Active Members'  },
      { bucket: 'member-photos', folder: 'deleted', label: 'Photos - Deleted Members' },
    ]
    for (const { bucket, folder, label } of KNOWN_STORAGE) {
      try {
        const { data: files, error } = await supabase.storage.from(bucket).list(folder, { limit: 10000 })
        if (!error) {
          const fileCount = (files||[]).filter(f => f.metadata).length
          const id = `storage::${bucket}::${folder}`
          discovered.push({
            id, label, type: 'storage', count: fileCount, checked: false,
            tier: PRIMARY_STORAGE.has(id) ? 'primary' : 'secondary',
          })
        }
      } catch (_) {}
    }

    setItems(discovered)
    setLoading(false)
  }

  function toggle(id) {
    setItems(prev => prev.map(it => it.id === id ? { ...it, checked: !it.checked } : it))
  }
  function toggleAll(val) {
    setItems(prev => prev.map(it => ({ ...it, checked: val })))
  }
  function toggleTier(tier, val) {
    setItems(prev => prev.map(it => it.tier === tier ? { ...it, checked: val } : it))
  }

  async function doFlush() {
    const selected = items.filter(it => it.checked)
    if (selected.length === 0) { toast('Select at least one item to flush.', 'error'); return }

    const ok = await askPassword(setPasswordModal)
    if (!ok) return

    setFlushing(true)
    const skipped = []
    try {
      for (const item of selected) {
        setProgress(`Flushing ${item.label}…`)
        if (item.type === 'table') {
          const tbl = item.id.replace('table::', '')
          // Use adminSupabase (service role) to bypass RLS on all tables.
          // .not('id','is',null) works universally for any table with a UUID id column.
          const { error } = await adminSupabase.from(tbl).delete().not('id', 'is', null)
          if (error) {
            console.error(`[flush] error on ${tbl}:`, error)
            const msg = error.message?.toLowerCase() ?? ''
            const isNotFound = error.code === '42P01' || error.code === 'PGRST116' ||
              msg.includes('does not exist') ||
              error.details?.includes('404') || String(error.code) === '404'
            if (isNotFound) {
              skipped.push(item.label)
            } else {
              throw new Error(`${tbl}: ${error.message} (code: ${error.code})`)
            }
          }
        } else {
          const [, bucket, folder] = item.id.split('::')
          const prefix = folder ? `${folder}/` : ''
          const { data: files } = await supabase.storage.from(bucket).list(folder || '', { limit: 10000 })
          const toDelete = (files || []).filter(f => f.metadata).map(f => `${prefix}${f.name}`)
          if (toDelete.length) {
            const { error } = await supabase.storage.from(bucket).remove(toDelete)
            if (error) throw new Error(`${item.label}: ${error.message}`)
          }
        }
      }
      await supabase.from('migration_history')
        .update({ status:'flushed', flushed_at: new Date().toISOString() })
        .neq('status', 'flushed')

      const done = selected.length - skipped.length
      if (skipped.length > 0) {
        toast(`${done} item${done!==1?'s':''} flushed. Skipped: ${skipped.join(', ')} (table not found in database).`, 'warning')
      } else {
        toast(`${done} item${done!==1?'s':''} flushed successfully.`, 'success')
      }
      onDone()
      onClose()
    } catch (err) {
      toast(`Flush failed: ${err.message}`, 'error')
    } finally {
      setFlushing(false); setProgress('')
    }
  }

  if (!open) return null

  const allChecked      = items.length > 0 && items.every(i => i.checked)
  const anyChecked      = items.some(i => i.checked)
  const primaryItems    = items.filter(i => i.tier === 'primary')
  const secondaryItems  = items.filter(i => i.tier === 'secondary')
  const allPrimChecked  = primaryItems.length > 0 && primaryItems.every(i => i.checked)
  const allSecChecked   = secondaryItems.length > 0 && secondaryItems.every(i => i.checked)

  function FlushItem({ item }) {
    const isPrimary = item.tier === 'primary'
    const isStorage = item.type === 'storage'
    return (
      <label style={{display:'flex',alignItems:'center',gap:10,padding:'9px 10px',borderRadius:8,
        border:`1px solid ${item.checked ? (isPrimary ? '#bfdbfe' : '#e2e8f0') : '#e2e8f0'}`,
        marginBottom:6,cursor:'pointer',
        background: item.checked ? (isPrimary ? '#eff6ff' : '#f8fafc') : '#ffffff'}}>
        <input type="checkbox" checked={item.checked} onChange={()=>toggle(item.id)} style={{width:14,height:14,accentColor:'#2563eb',flexShrink:0}}/>
        {isStorage
          ? <Camera size={13} style={{color:'#64748b',flexShrink:0}}/>
          : <Database size={13} style={{color:'#64748b',flexShrink:0}}/>}
        <span style={{flex:1,fontSize:13,color:'#0f172a',fontFamily:'var(--font-mono)'}}>{item.label}</span>
        <span style={{fontSize:11,color:'#64748b',flexShrink:0}}>
          {item.count.toLocaleString()} {isStorage ? 'files' : 'rows'}
        </span>
      </label>
    )
  }

  return ReactDOM.createPortal(
    <>
      <div style={{position:'fixed',inset:0,backgroundColor:'rgba(15,23,42,0.7)',backdropFilter:'blur(4px)',WebkitBackdropFilter:'blur(4px)',zIndex:2999}} onClick={!flushing ? onClose : undefined}/>
      <div style={{position:'fixed',top:'50%',left:'50%',transform:'translate(-50%,-50%)',width:'calc(100% - 48px)',maxWidth:520,maxHeight:'80vh',display:'flex',flexDirection:'column',backgroundColor:'#ffffff',borderRadius:12,border:'1px solid #e2e8f0',boxShadow:'0 25px 50px -12px rgba(0,0,0,0.5)',zIndex:3000,overflow:'hidden'}}>

        {/* Header */}
        <div style={{padding:'20px 20px 14px',borderBottom:'1px solid #e2e8f0'}}>
          <p style={{margin:'0 0 2px',fontSize:15,fontWeight:500,color:'#0f172a'}}>Flush data</p>
          <p style={{margin:0,fontSize:12,color:'#64748b'}}>
            Records only — table structures and folder containers are preserved.
          </p>
        </div>

        {/* Body */}
        <div style={{flex:1,overflowY:'auto',padding:'14px 20px'}}>
          {loading ? (
            <div style={{display:'flex',alignItems:'center',gap:8,padding:'20px 0',color:'#64748b',fontSize:13}}>
              <Loader2 size={15} style={{animation:'spin 1s linear infinite'}}/> Scanning tables and storage…
            </div>
          ) : (
            <>
              {/* Select all */}
              <label style={{display:'flex',alignItems:'center',gap:10,padding:'8px 10px',borderRadius:8,background:'#f8fafc',marginBottom:14,cursor:'pointer',fontSize:12,fontWeight:500,color:'#64748b'}}>
                <input type="checkbox" checked={allChecked} onChange={e=>toggleAll(e.target.checked)} style={{width:14,height:14,accentColor:'#2563eb'}}/>
                Select all
              </label>

              {/* ── PRIMARY ──────────────────────────────────────── */}
              {primaryItems.length > 0 && (
                <div style={{marginBottom:16}}>
                  <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8}}>
                    <div style={{display:'flex',alignItems:'center',gap:7}}>
                      <span style={{display:'inline-block',width:8,height:8,borderRadius:'50%',background:'#2563eb'}}/>
                      <span style={{fontSize:11,fontWeight:700,textTransform:'uppercase',letterSpacing:'.07em',color:'#1e40af'}}>Primary</span>
                    </div>
                    <label style={{display:'flex',alignItems:'center',gap:6,cursor:'pointer',fontSize:11,color:'#64748b'}}>
                      <input type="checkbox" checked={allPrimChecked} onChange={e=>toggleTier('primary',e.target.checked)} style={{width:12,height:12,accentColor:'#2563eb'}}/>
                      Select all
                    </label>
                  </div>
                  <div style={{borderRadius:10,border:'1px solid #bfdbfe',padding:'4px 6px',background:'#f8fbff'}}>
                    {primaryItems.map(item => <FlushItem key={item.id} item={item}/>)}
                  </div>
                </div>
              )}

              {/* ── SECONDARY ────────────────────────────────────── */}
              {secondaryItems.length > 0 && (
                <div>
                  <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8}}>
                    <div style={{display:'flex',alignItems:'center',gap:7}}>
                      <span style={{display:'inline-block',width:8,height:8,borderRadius:'50%',background:'#94a3b8'}}/>
                      <span style={{fontSize:11,fontWeight:700,textTransform:'uppercase',letterSpacing:'.07em',color:'#64748b'}}>Secondary</span>
                    </div>
                    <label style={{display:'flex',alignItems:'center',gap:6,cursor:'pointer',fontSize:11,color:'#64748b'}}>
                      <input type="checkbox" checked={allSecChecked} onChange={e=>toggleTier('secondary',e.target.checked)} style={{width:12,height:12,accentColor:'#94a3b8'}}/>
                      Select all
                    </label>
                  </div>
                  <div style={{borderRadius:10,border:'1px solid #e2e8f0',padding:'4px 6px',background:'#fafafa'}}>
                    {secondaryItems.map(item => <FlushItem key={item.id} item={item}/>)}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div style={{padding:'12px 20px',borderTop:'1px solid #e2e8f0',display:'flex',alignItems:'center',justifyContent:'space-between',gap:8}}>
          {flushing
            ? <p style={{margin:0,fontSize:12,color:'#64748b',display:'flex',alignItems:'center',gap:6}}>
                <Loader2 size={12} style={{animation:'spin 1s linear infinite'}}/>{progress}
              </p>
            : <p style={{margin:0,fontSize:12,color:'#64748b'}}>
                {anyChecked ? `${items.filter(i=>i.checked).length} item${items.filter(i=>i.checked).length>1?'s':''} selected` : 'Nothing selected'}
              </p>
          }
          <div style={{display:'flex',gap:8}}>
            <button onClick={onClose} disabled={flushing}
              style={{fontSize:12,padding:'6px 14px',border:'1px solid #e2e8f0',borderRadius:8,background:'none',color:'#64748b',cursor:'pointer'}}>
              Cancel
            </button>
            <button onClick={doFlush} disabled={!anyChecked||flushing||loading}
              style={{fontSize:12,padding:'6px 14px',border:'none',borderRadius:8,background: anyChecked&&!flushing ? '#dc2626':'#dc262680',color:'#fff',cursor: anyChecked&&!flushing ?'pointer':'default',display:'flex',alignItems:'center',gap:6}}>
              {flushing ? <Loader2 size={12} style={{animation:'spin 1s linear infinite'}}/> : <Trash2 size={12}/>}
              {flushing ? 'Flushing…' : 'Flush selected'}
            </button>
          </div>
        </div>
      </div>
    </>,
    document.body
  )
}

// ── confirmSuperAdmin (only used by FlushAllModal internally now) ─────────────
async function confirmSuperAdmin(profile, toast, setPasswordModal) {
  if (profile?.role !== 'super_admin') {
    toast('Access denied. Super Admin only.', 'error')
    return false
  }
  return await askPassword(setPasswordModal)
}



// ── Log migration — only called on SUCCESS ────────────────────────────────────
async function logMigration(category, sourceFile, status, attempted, succeeded, failed, errorMsg = null) {
  const { data: { user } } = await supabase.auth.getUser()
  await supabase.from('migration_history').insert({
    category,
    source_file:       sourceFile,
    status,
    records_attempted: attempted,
    records_succeeded: succeeded,
    records_failed:    failed,
    error_details:     errorMsg,
    performed_by:      user?.email,
    performed_at:      new Date().toISOString()   // explicit — don't rely on DB default
  })
}

// ── Erase data for a category (never drops table / bucket) ───────────────────
// NOTE: .neq('id',0) fails on UUID primary keys. deleted_members has no created_at,
// so use .gte('member_id','') there — it's always present and non-null.
async function eraseCategory(category) {
  if (category === 'members') {
    const { error } = await supabase.from('members').delete().gte('created_at', '1970-01-01')
    if (error) throw new Error(error.message)
  } else if (category === 'members_deleted') {
    const res = await supabase.from('deleted_members').delete().not('id', 'is', null)
    console.log('[eraseCategory] deleted_members result:', res)
    if (res.error) throw new Error(`${res.error.message} (code: ${res.error.code})`)
  } else if (category.startsWith('photos_')) {
    const folder = category.replace('photos_', '')
    const { data: photos } = await supabase.storage.from('member-photos').list(folder, { limit: 10000 })
    if (photos?.length) {
      const { error } = await supabase.storage.from('member-photos').remove(photos.map(f => `${folder}/${f.name}`))
      if (error) throw new Error(error.message)
    }
  }
}

function fmtDateTime(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  const opts = { timeZone:'Asia/Kolkata', hour12:true }
  const day   = d.toLocaleDateString('en-IN', { ...opts, day:'2-digit' })
  const month = d.toLocaleDateString('en-IN', { ...opts, month:'2-digit' })
  const year  = d.toLocaleDateString('en-IN', { ...opts, year:'numeric' })
  const time  = d.toLocaleTimeString('en-IN', { ...opts, hour:'2-digit', minute:'2-digit' })
  return `${day}-${month}-${year}, ${time}`
}

// Format a YYYY-MM-DD string for display as dd-mm-yyyy
function fmtDateDisplay(val) {
  if (!val) return val
  const s = String(val).trim()
  // Handle ISO YYYY-MM-DD
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (iso) return `${iso[3]}-${iso[2]}-${iso[1]}`
  return s
}

// ── Badge colours ─────────────────────────────────────────────────────────────
function badgeStyle(cat) {
  if (cat === 'members')         return { bg:'#EAF3DE', color:'#3B6D11', dot:'#639922' }
  if (cat === 'members_deleted') return { bg:'#FAEEDA', color:'#854F0B', dot:'#EF9F27' }
  if (cat === 'photos_active')   return { bg:'#E6F1FB', color:'#185FA5', dot:'#378ADD' }
  if (cat === 'photos_deleted')  return { bg:'#FBEAF0', color:'#993556', dot:'#D4537E' }
  return { bg:'#F1EFE8', color:'#5F5E5A', dot:'#888780' }
}
function recordLabel(cat, count) {
  if (!count && count !== 0) return '—'
  return cat.startsWith('photos_') ? `${count.toLocaleString()} photos` : `${count.toLocaleString()} records`
}

// ── IMPORT BOARD (right panel) ────────────────────────────────────────────────
function ImportBoard({ history, loading, onFlushRow, flushingId }) {
  const totalRecords = history.filter(h=>!h.category.startsWith('photos_')).reduce((s,h)=>s+(h.records_succeeded||0),0)
  const totalPhotos  = history.filter(h=> h.category.startsWith('photos_')).reduce((s,h)=>s+(h.records_succeeded||0),0)

  return (
    <div style={{background:'#fff',border:'1px solid #e2e8f0',borderRadius:14,display:'flex',flexDirection:'column',height:'100%',overflow:'hidden',boxShadow:'0 1px 6px rgba(0,0,0,0.04)'}}>
      {/* Header */}
      <div style={{padding:'14px 16px 12px',borderBottom:'1px solid #f1f5f9',background:'linear-gradient(to bottom,#fafbff,#fff)'}}>
        <div style={{display:'flex',alignItems:'center',gap:7,marginBottom:3}}>
          <div style={{width:7,height:7,borderRadius:'50%',background:'#22c55e',boxShadow:'0 0 0 2px #dcfce7'}}/>
          <p style={{margin:0,fontSize:13,fontWeight:600,color:'#0f172a',letterSpacing:'-0.1px'}}>Import Board</p>
        </div>
        {history.length > 0
          ? <p style={{margin:0,fontSize:11,color:'#94a3b8',paddingLeft:14}}>
              {history.length} import{history.length!==1?'s':''}
              {totalRecords>0?` · ${totalRecords.toLocaleString()} records`:''}
              {totalPhotos >0?` · ${totalPhotos.toLocaleString()} photos`:''}
            </p>
          : <p style={{margin:0,fontSize:11,color:'#cbd5e1',paddingLeft:14}}>No active imports</p>
        }
      </div>

      {/* Rows */}
      <div style={{flex:1,overflowY:'auto',padding:'6px 0'}}>
        {loading ? (
          <div style={{display:'flex',justifyContent:'center',padding:'40px 0'}}>
            <Loader2 size={18} style={{animation:'spin 1s linear infinite',color:'#94a3b8'}}/>
          </div>
        ) : history.length === 0 ? (
          <div style={{padding:'36px 16px',textAlign:'center'}}>
            <div style={{width:44,height:44,borderRadius:12,background:'#f1f5f9',display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto 10px'}}>
              <Database size={20} style={{color:'#cbd5e1'}}/>
            </div>
            <p style={{margin:'0 0 3px',fontSize:13,fontWeight:500,color:'#94a3b8'}}>Nothing imported yet</p>
            <p style={{margin:0,fontSize:11,color:'#cbd5e1'}}>Import a worksheet to get started</p>
          </div>
        ) : history.map((entry, i) => {
          const bs = badgeStyle(entry.category)
          const isFlushing = flushingId === entry.id
          return (
            <div key={entry.id} className="board-row" style={{
              padding:'11px 14px',
              borderBottom:'1px solid #f8fafc',
              display:'flex',flexDirection:'column',gap:5,
              animation:`fadeSlideUp 0.25s ease ${i*0.04}s both`
            }}>
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:8}}>
                <span style={{display:'inline-flex',alignItems:'center',gap:5,fontSize:11,fontWeight:600,padding:'3px 9px',borderRadius:20,background:bs.bg,color:bs.color,flexShrink:0,letterSpacing:'0.01em'}}>
                  <span style={{width:5,height:5,borderRadius:'50%',background:bs.dot,flexShrink:0}}/>
                  {entry.source_file || entry.category}
                </span>
                <button onClick={()=>onFlushRow(entry)} disabled={!!flushingId}
                  className="flush-btn-row"
                  title="Delete all records in this category"
                  style={{background:'none',border:'none',cursor:'pointer',padding:'4px 5px',borderRadius:6,color:'#cbd5e1',opacity:!!flushingId?0.3:1,display:'flex',alignItems:'center'}}>
                  {isFlushing
                    ? <Loader2 size={13} style={{animation:'spin 1s linear infinite',color:'#ef4444'}}/>
                    : <Trash2 size={13}/>}
                </button>
              </div>
              <p style={{margin:0,fontSize:15,fontWeight:700,color:'#0f172a',letterSpacing:'-0.2px'}}>
                {recordLabel(entry.category, entry.records_succeeded)}
              </p>
              <p style={{margin:0,fontSize:10,color:'#94a3b8',display:'flex',alignItems:'center',gap:4}}>
                <span style={{width:3,height:3,borderRadius:'50%',background:'#e2e8f0',flexShrink:0}}/>
                {fmtDateTime(entry.performed_at)}
              </p>
              {entry.performed_by && (
                <p style={{margin:0,fontSize:10,color:'#cbd5e1'}}>
                  by {entry.performed_by}
                </p>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── IMPORT TAB ────────────────────────────────────────────────────────────────
function ImportTab({ onRefreshBoard, setPasswordModal }) {
  const toast = useToast()
  const { profile } = useAuth()
  const fileRef = useRef(null)
  const [step, setStep] = useState(1)
  const [wb, setWb] = useState(null)
  const [sheetName, setSheetName] = useState('')
  const [headers, setHeaders] = useState([])
  const [rows, setRows] = useState([])
  const [progress,    setProgress]    = useState(0)
  const [result,      setResult]      = useState(null)
  const [importing,   setImporting]   = useState(false)
  const [dragOver,    setDragOver]    = useState(false)
  const [importError, setImportError] = useState(null)
  const [overwriteFY, setOverwriteFY] = useState(false)

  async function handleFile(file) {
    if (!file) return
    const XLSX = await import('xlsx')
    const data = await file.arrayBuffer()
    const workbook = XLSX.read(data, { type:'array', cellDates:true })
    setWb(workbook)
    setImportError(null)

    // Auto-select current FY sheet and jump straight to preview if present
    const d = new Date(), m = d.getMonth() + 1, y = d.getFullYear()
    const curFY = m >= 4 ? `${y}-${String(y+1).slice(2)}` : `${y-1}-${String(y).slice(2)}`
    const fySheets = workbook.SheetNames.filter(n => /^\d{4}-\d{2}$/.test(n.trim()))
      .sort((a, b) => a.localeCompare(b))
    const autoSheet = fySheets.includes(curFY) ? curFY : (fySheets.length > 0 ? fySheets[fySheets.length - 1] : null)
    if (autoSheet) {
      setSheetName(autoSheet)
      loadSheet(workbook, autoSheet)  // advances to step 3
    } else {
      setStep(2)
    }
  }

  function loadSheet(workbook, name) {
    setImportError(null)
    import('xlsx').then(XLSX => {
      const ws = workbook.Sheets[name]
      // raw:true preserves JS Date objects (from cellDates:true in XLSX.read) and numeric values as-is.
      // raw:false can produce unpredictable locale-formatted date strings that break parseDateDMY.
      const raw = XLSX.utils.sheet_to_json(ws, { header:1, defval:'', raw:true })
      if (raw.length < 2) return
      const headerRow = raw[0]
      const headerLen = headerRow.length
      setHeaders(headerRow.map(h=>String(h||'').trim()))
      // Pad every data row to header length so short trailing rows aren't dropped
      const dataRows = raw.slice(1)
        .map(r => { while (r.length < headerLen) r.push(''); return r })
        .filter(r => r.some(c => c !== ''))
      setRows(dataRows)
      setStep(3)
    })
  }

  async function doImportReceipts() {
    const fy = sheetName.trim()
    const cats = await getActiveCategories()

    // Build column index map from the `headers` state (already header-row content)
    const hdrMap = {}
    headers.forEach((h, i) => { if (h) hdrMap[normalizeCol(h)] = i })

    // Log actual headers so column mapping is visible in devtools
    console.log('[ReceiptImport] headers:', headers)
    console.log('[ReceiptImport] hdrMap:', hdrMap)

    // Return column index by header name; fall back to `fallbackPos` if not found
    const col = (fallbackPos, ...names) => {
      for (const n of names) {
        const v = hdrMap[normalizeCol(n)]
        if (v != null) return v
      }
      return fallbackPos  // use positional default when header not recognised
    }

    // Standard receipt fields — positional defaults match original VBA column order
    const rcptNoIdx   = col(0,  'receipt_number','receiptno','receipt no','receiptnum','receipt#','rcptno','sno','sr no','srno')
    const memberIdIdx = col(1,  'member_id','memberid','member id','memid','mem id')
    const memberNmIdx = col(2,  'member_name','membername','member name','name','mem name')
    const dateIdx     = col(3,  'receipt_date','receiptdate','receipt date','date','rcptdate')
    const modeIdx     = col(4,  'payment_mode','paymentmode','payment mode','mode','paymode','pay mode')
    const monthIdx    = col(5,  'month_paid','monthpaid','months paid','month paid','months','month')
    const totalIdx    = col(-1, 'grand_total','grandtotal','grand total','total','amount','grandtotal')

    console.log('[ReceiptImport] col indices:', { rcptNoIdx, memberIdIdx, memberNmIdx, dateIdx, modeIdx, monthIdx, totalIdx })

    // Category column detection — amt / months / total per category
    const catCols = {}
    cats.forEach(cat => {
      const nc     = normalizeCol(cat.name)
      const amtIdx = hdrMap[nc] ?? hdrMap[nc + 'amt'] ?? hdrMap[nc + 'amount'] ?? -1
      const monIdx = hdrMap[nc + 'months'] ?? hdrMap[nc + 'month'] ?? -1
      const totIdx = hdrMap[nc + 'total'] ?? -1
      if (amtIdx >= 0) catCols[cat.id] = { amtIdx, monIdx, totIdx }
    })

    // Debug: log first row's raw date value to help diagnose format issues
    if (rows.length > 0) {
      const dateIdx0 = (() => {
        const hdrMap0 = {}
        headers.forEach((h, i) => { if (h) hdrMap0[normalizeCol(h)] = i })
        const col0 = (fb, ...names) => { for (const n of names) { const v = hdrMap0[normalizeCol(n)]; if (v != null) return v } return fb }
        return col0(3, 'receipt_date','receiptdate','receipt date','date','rcptdate')
      })()
      const sampleDate = rows[0][dateIdx0]
      console.log('[ReceiptImport] sample date cell value:', sampleDate, '| type:', typeof sampleDate, '| isDate:', sampleDate instanceof Date)
      console.log('[ReceiptImport] parseDateDMY result →', parseDateDMY(sampleDate))
    }

    setImporting(true); setStep(4); setProgress(0)

    // Overwrite mode: delete all existing receipts for this FY first
    if (overwriteFY) {
      const { data: exIds } = await supabase.from('receipts').select('id').eq('financial_year', fy)
      if (exIds?.length) {
        const ids = exIds.map(r => r.id)
        await supabase.from('receipt_items').delete().in('receipt_id', ids)
        await supabase.from('receipts').delete().eq('financial_year', fy)
      }
    }

    // Pre-fetch existing receipt numbers for this FY (single query, no N+1)
    const { data: existing } = await supabase.from('receipts')
      .select('receipt_number').eq('financial_year', fy)
    const existingNums = new Set((existing || []).map(r => r.receipt_number))

    let imported = 0, skipped = 0, errors = 0
    const total = rows.length

    try {
      // `rows` is already header-stripped by loadSheet; iterate all data rows
      for (let ri = 0; ri < rows.length; ri++) {
        if (ri % 10 === 0) setProgress(Math.round((ri / total) * 100))
        const row = rows[ri]
        try {
          // Skip fully blank rows
          if (!row.some(c => String(c || '').trim())) { skipped++; continue }

          let receiptNo = String(row[rcptNoIdx] ?? '').trim()
          // If receipt number is blank, auto-generate from FY + sequential index
          if (!receiptNo) receiptNo = `${fy}_imp_${String(ri + 1).padStart(6, '0')}`

          if (existingNums.has(receiptNo)) { skipped++; continue }

          const memberId    = String(row[memberIdIdx] ?? '').trim()
          const memberName  = String(row[memberNmIdx] ?? '').trim()
          const dateRaw     = row[dateIdx] ?? ''   // keep Date objects intact — don't stringify before parseDateDMY
          const receiptDate = parseDateDMY(dateRaw) || new Date().toISOString().slice(0, 10)
          const payMode   = String(row[modeIdx] ?? '').trim() || 'Cash'
          let monthPaid   = String(row[monthIdx] ?? '').trim() || null
          // Derive month from receipt date if not present in the spreadsheet
          if (!monthPaid && receiptDate) {
            const _MD = ['January','February','March','April','May','June','July','August','September','October','November','December']
            const _d  = new Date(receiptDate + 'T00:00:00')
            if (!isNaN(_d.getTime())) monthPaid = _MD[_d.getMonth()]
          }
          const grandTotal  = totalIdx >= 0
            ? parseFloat(String(row[totalIdx] ?? '0').replace(/[^0-9.]/g, '')) || 0
            : 0

          const { data: ins, error: insErr } = await supabase.from('receipts').insert({
            receipt_number: receiptNo, receipt_date: receiptDate, financial_year: fy,
            member_id: memberId || null, member_name: memberName || null,
            payment_mode: payMode, month_paid: monthPaid, grand_total: grandTotal,
          }).select('id').single()
          if (insErr) { errors++; continue }

          const itemRows = []
          for (const cat of cats) {
            const cc = catCols[cat.id]
            if (!cc) continue
            const amt    = parseFloat(String(row[cc.amtIdx] ?? '0').replace(/[^0-9.]/g, '')) || 0
            const months = cc.monIdx >= 0 ? parseFloat(String(row[cc.monIdx] ?? '1').replace(/[^0-9.]/g, '')) || 1 : 1
            const total  = cc.totIdx >= 0 ? parseFloat(String(row[cc.totIdx] ?? '0').replace(/[^0-9.]/g, '')) || (amt * months) : (amt * months)
            if (amt > 0) itemRows.push({ receipt_id: ins.id, category_id: cat.id, amt, months, total })
          }
          if (itemRows.length) await supabase.from('receipt_items').insert(itemRows)
          existingNums.add(receiptNo)
          imported++
        } catch (e) { console.warn('[ReceiptImport] row error:', e); errors++ }
      }

      setResult({ total: rows.length, inserted: imported, errors, dups: skipped })
      if (imported > 0) {
        await logMigration('receipts', `${sheetName} (FY)`, 'success', imported + skipped, imported, errors)
        onRefreshBoard?.()
      }
      toast(
        `Receipts FY ${fy}: ${imported} imported, ${skipped} skipped${errors ? `, ${errors} errors` : ''}`,
        imported > 0 ? 'success' : 'error'
      )
    } catch (e) {
      setImportError(e.message)
      setStep(3)
    }
    setImporting(false)
  }

  async function doImport() {
    setImportError(null)

    // Route FY-named sheets (e.g. 2024-25) to receipt import
    if (/^\d{4}-\d{2}$/.test(sheetName.trim())) {
      return doImportReceipts()
    }

    // Normalise: remove spaces so "DeletedMembers" and "Deleted Members" both match
    const sheetNorm = sheetName.toLowerCase().trim().replace(/\s+/g, '')
    let targetTable = null
    let targetCategory = null

    if (sheetNorm.includes('deletedmember')) {
      targetTable    = 'deleted_members'
      targetCategory = 'members_deleted'
    } else if (sheetNorm.includes('member')) {
      targetTable    = 'members'
      targetCategory = 'members'
    }

    // ── Workings → church_zones ──────────────────────────────────────────────
    if (sheetNorm.includes('working')) {
      const zones = rows.map(r => String(r[3] ?? '').trim()).filter(Boolean)
      if (!zones.length) {
        setImportError('No zone names found in column D.')
        return
      }

      setImporting(true); setStep(4); setProgress(0)

      try {
        const records = zones
          .filter(z => z.toLowerCase() !== 'others')
          .map((zone_name, idx) => ({ zone_name, sort_order: idx + 1, created_by: profile?.email }))
        records.push({ zone_name: 'Others', sort_order: 99, created_by: profile?.email })

        const { error: delErr } = await supabase.from('church_zones').delete().not('id', 'is', null)
        if (delErr) throw new Error(`Clear failed: ${delErr.message}`)

        const { error: insErr } = await supabase.from('church_zones').insert(records)
        if (insErr) throw new Error(`Insert failed: ${insErr.message}`)

        await logMigration('zones', sheetName, 'success', records.length, records.length, 0)
        setResult({ total: records.length, inserted: records.length, errors: 0, dups: 0 })
        toast(`${records.length} zones imported successfully.`, 'success')
        onRefreshBoard?.()
      } catch (err) {
        setImportError(err.message)
        await logMigration('zones', sheetName, 'error', zones.length, 0, 0, err.message)
      } finally {
        setImporting(false)
      }
      return
    }

    if (!targetTable) {
      setImportError(
        `Sheet "${sheetName}" is not a recognised import sheet.\n` +
        `Only sheets named "Members", "Deleted Members", or "Workings" can be imported. ` +
        `Please select the correct worksheet.`
      )
      return
    }

    // ── Check target table exists in Supabase ─────────────────────────────────
    const { error: probeError } = await supabase.from(targetTable).select('member_id').limit(1)
    if (probeError && (probeError.code === '42P01' || probeError.message?.toLowerCase().includes('does not exist'))) {
      setImportError(
        `Relevant table not found in database.\n` +
        `Sheet "${sheetName}" maps to table "${targetTable}" but it does not exist in Supabase yet. ` +
        `Please create it first and then proceed.`
      )
      return
    }

    // member_id is position 1, member_name is position 3
    // Trim aggressively — Excel sometimes pads cells with spaces or \r\n
    const validRows = rows.filter(r =>
      String(r[1] ?? '').trim().length > 0 &&
      String(r[3] ?? '').trim().length > 0
    )
    if (validRows.length === 0) {
      setImportError('No valid rows found. Each row must have a Member ID (col B) and Member Name (col D).')
      return
    }

    setImporting(true); setStep(4); setProgress(0)

    // Transform rows using position-only mapping
    const dateDebugLog = []
    const records = validRows.map((row, rowIdx) => {
      const rec = targetTable === 'members' ? { is_active: true } : {}
      row.forEach((cell, idx) => {
        const dbCol = mapHeader(idx)
        if (!dbCol || SKIP.includes(dbCol)) return
        const v = cleanVal(cell, dbCol)
        // Log date parsing for first 5 rows and any failures
        if (DATE_COLS.includes(dbCol) && (rowIdx < 5 || v === null)) {
          dateDebugLog.push(`Row ${rowIdx + 1}, ${dbCol}: raw=${JSON.stringify(cell)} (type=${typeof cell}), parsed=${v}`)
        }
        if (v !== null) rec[dbCol] = v
        else if (ACT_COLS.includes(dbCol)) rec[dbCol] = false
      })
      return rec
    }).filter(r => String(r.member_id ?? '').trim() && String(r.member_name ?? '').trim())

    if (dateDebugLog.length > 0) {
      console.group('📅 Date Field Parsing Log')
      dateDebugLog.forEach(log => console.log(log))
      console.groupEnd()
    }

    if (records.length === 0) {
      setImportError('No records could be mapped. Check that your Excel columns are in the expected order.')
      setImporting(false); setStep(3); return
    }

    // Deduplicate by member_id — if the same member_id appears more than once
    // in the sheet, keep the last occurrence (last row wins).
    const dedupedMap = new Map()
    records.forEach(r => dedupedMap.set(String(r.member_id).trim(), r))
    const dedupedRecords = [...dedupedMap.values()]
    const dupCount = records.length - dedupedRecords.length
    if (dupCount > 0) console.warn(`⚠️ ${dupCount} duplicate member_id(s) found — last occurrence kept.`)

    try {
      if (targetTable === 'members') {
        // Atomic swap via staging for main members table
        await supabase.from('members_staging').delete().gte('created_at', '1970-01-01')
        const { error: stagingError } = await supabase.from('members_staging').insert(dedupedRecords)
        if (stagingError) throw new Error(`Staging insert failed: ${stagingError.message}`)
        const { error: swapError } = await supabase.rpc('atomic_swap_members')
        if (swapError) throw new Error(`Atomic swap failed: ${swapError.message}`)
      } else {
        // Stamp required fields for deleted_members
        const now = new Date().toISOString()
        const importedBy = profile?.email || profile?.id || 'import'
        const stamped = dedupedRecords.map(r => ({
          ...r,
          deleted_by:  r.deleted_by  || importedBy,
          deleted_at:  r.deleted_at  || now,
        }))
        // Clear and re-insert (no unique constraint needed)
        const { error: delError } = await supabase.from(targetTable).delete().gte('member_id', '')
        if (delError) throw new Error(`Clear failed: ${delError.message}`)
        const { error } = await supabase.from(targetTable).insert(stamped)
        if (error) throw new Error(`Import failed: ${error.message}`)
      }

      // Only log on success
      await logMigration(targetCategory, sheetName, 'success', dedupedRecords.length, dedupedRecords.length, 0)
      setResult({ total: dedupedRecords.length, inserted: dedupedRecords.length, errors: 0, dups: dupCount })
      toast(`${dedupedRecords.length} records imported successfully from "${sheetName}".`, 'success')
      onRefreshBoard?.()
    } catch (err) {
      console.error(err)
      setImportError(err.message)
      setStep(3)
      toast(`Import failed: ${err.message}`, 'error')
    } finally {
      setImporting(false)
      if (targetTable === 'members') {
        await supabase.from('members_staging').delete().gte('created_at', '1970-01-01')
      }
    }
  }

  function reset() {
    setWb(null);setSheetName('');setHeaders([]);setRows([]);setProgress(0)
    setResult(null);setStep(1);setImporting(false);setImportError(null);setOverwriteFY(false)
  }

  // Preview uses DB column name derived by position
  const previewCols = headers
    .map((h, i) => ({ header: h, dbCol: mapHeader(i), idx: i }))
    .filter(({ dbCol }) => dbCol && !SKIP.includes(dbCol))
    .slice(0, 8)

  return (
    <div style={{display:'flex',flexDirection:'column',gap:16}}>
      {/* Steps — refined pill stepper */}
      <div style={{display:'flex',alignItems:'center',background:'#f8fafc',borderRadius:12,padding:'10px 16px'}}>
        {[['1','Upload'],['2','Select sheet'],['3','Preview'],['4','Import']].map(([n,l],i)=>(
          <div key={n} style={{display:'flex',alignItems:'center',flex:1}}>
            <div style={{display:'flex',alignItems:'center',gap:7}}>
              <div style={{
                width:24,height:24,borderRadius:'50%',display:'flex',alignItems:'center',justifyContent:'center',
                fontSize:11,fontWeight:700,flexShrink:0,
                background: step>parseInt(n) ? '#22c55e' : step===parseInt(n) ? '#2563eb' : '#e2e8f0',
                color: step>=parseInt(n) ? '#fff' : '#94a3b8',
                boxShadow: step===parseInt(n) ? '0 0 0 3px #dbeafe' : 'none'
              }}>
                {step>parseInt(n)?'✓':n}
              </div>
              <span style={{fontSize:11,fontWeight:600,color:step===parseInt(n)?'#2563eb':step>parseInt(n)?'#22c55e':'#94a3b8',whiteSpace:'nowrap'}}>{l}</span>
            </div>
            {i<3&&<div style={{flex:1,height:2,margin:'0 8px',borderRadius:2,background:step>i+1?'#22c55e':'#e2e8f0'}}/>}
          </div>
        ))}
      </div>

      {/* Step 1: Upload */}
      <div style={{background:'#fff',border:'1px solid #e2e8f0',borderRadius:12,padding:20,boxShadow:'0 1px 4px rgba(0,0,0,0.03)'}}>
        <p style={{margin:'0 0 12px',fontSize:11,fontWeight:600,textTransform:'uppercase',letterSpacing:'0.06em',color:'#3b82f6'}}>Step 1 — Upload Excel file</p>
        <div
          style={{
            borderRadius:10,padding:'28px 24px',textAlign:'center',cursor:'pointer',
            border:`2px dashed ${dragOver?'#3b82f6':wb?'#22c55e':'#e2e8f0'}`,
            background: dragOver?'#eff6ff':wb?'#f0fdf4':'#fafafa',
            transition:'all 0.2s ease'
          }}
          onClick={()=>fileRef.current?.click()}
          onDragOver={e=>{e.preventDefault();setDragOver(true)}}
          onDragLeave={()=>setDragOver(false)}
          onDrop={e=>{e.preventDefault();setDragOver(false);const f=e.dataTransfer.files[0];if(f)handleFile(f)}}>
          <div style={{width:48,height:48,borderRadius:12,background:wb?'#dcfce7':dragOver?'#dbeafe':'#f1f5f9',display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto 12px'}}>
            <FileSpreadsheet size={22} style={{color:wb?'#22c55e':dragOver?'#3b82f6':'#94a3b8'}}/>
          </div>
          <p style={{margin:'0 0 4px',fontSize:14,fontWeight:600,color:'#334155'}}>{wb?'File loaded ✓ — click to change':'Click or drag to upload'}</p>
          <p style={{margin:0,fontSize:12,color:'#94a3b8'}}>Main.xlsm or any .xlsx / .xls</p>
        </div>
        <input ref={fileRef} type="file" accept=".xlsx,.xlsm,.xls" className="hidden" onChange={e=>handleFile(e.target.files[0])}/>
      </div>

      {/* Step 2: Sheet select */}
      {step>=2 && wb && (
        <div style={{background:'#fff',border:'1px solid #e2e8f0',borderRadius:12,padding:20,boxShadow:'0 1px 4px rgba(0,0,0,0.03)'}}>
          <p style={{margin:'0 0 4px',fontSize:11,fontWeight:600,textTransform:'uppercase',letterSpacing:'0.06em',color:'#3b82f6'}}>Step 2 — Select worksheet</p>
          <p style={{margin:'0 0 14px',fontSize:12,color:'#94a3b8'}}>
            Import <strong style={{color:'#3b82f6'}}>Members</strong>, <strong style={{color:'#d97706'}}>Deleted Members</strong>, <strong style={{color:'#059669'}}>Workings</strong>, or <strong style={{color:'#d97706'}}>FY Receipt sheets</strong> (e.g. <em>2024-25</em>, <em>2025-26</em>).
          </p>
          <div style={{display:'flex',flexWrap:'wrap',gap:8}}>
            {[...wb.SheetNames].sort((a, b) => {
              const aFY = /^\d{4}-\d{2}$/.test(a.trim())
              const bFY = /^\d{4}-\d{2}$/.test(b.trim())
              if (aFY && bFY) return a.trim().localeCompare(b.trim())
              if (aFY) return -1; if (bFY) return 1
              return a.localeCompare(b)
            }).map(name => {
              const nl         = name.toLowerCase().trim().replace(/\s+/g, '')
              const isDeleted  = nl.includes('deletedmember')
              const isMember   = !isDeleted && nl.includes('member')
              const isWorkings = nl.includes('working')
              const isReceipts = /^\d{4}-\d{2}$/.test(name.trim())
              const isKnown    = isDeleted || isMember || isWorkings || isReceipts
              const badge      = isDeleted ? 'Deleted Members' : isMember ? 'Members' : isWorkings ? 'Zonal Areas' : isReceipts ? 'Receipts' : null
              const accentColor = isDeleted ? '#d97706' : isWorkings ? '#059669' : isReceipts ? '#d97706' : '#2563eb'
              const isSelected  = sheetName === name
              const selBorder   = isDeleted ? '#fcd34d' : isWorkings ? '#6ee7b7' : isReceipts ? '#fcd34d' : '#93c5fd'
              const selBg       = isDeleted ? '#fffbeb' : isWorkings ? '#ecfdf5' : isReceipts ? '#fffbeb' : '#eff6ff'
              const badgeBg     = isDeleted ? '#fef3c7' : isWorkings ? '#d1fae5' : isReceipts ? '#fef3c7' : '#dbeafe'
              const badgeColor  = isDeleted ? '#92400e' : isWorkings ? '#065f46' : isReceipts ? '#92400e' : '#1e40af'
              const labelColor  = isDeleted ? '#92400e' : isWorkings ? '#065f46' : isReceipts ? '#92400e' : '#1e40af'
              return (
                <label key={name} style={{
                  display:'flex',alignItems:'center',gap:8,padding:'8px 12px',borderRadius:9,
                  border:`1px solid ${isSelected ? selBorder : isKnown ? '#e2e8f0' : '#f1f5f9'}`,
                  background: isSelected ? selBg : '#fff',
                  cursor:'pointer',opacity:isKnown?1:0.45,transition:'all 0.15s ease'
                }}>
                  <input type="radio" name="sheet" value={name} checked={isSelected} onChange={()=>{setSheetName(name);loadSheet(wb,name)}} style={{accentColor}}/>
                  <span style={{fontSize:13,fontWeight:500,color:isSelected ? labelColor : '#475569'}}>{name}</span>
                  {badge && (
                    <span style={{fontSize:10,fontWeight:600,padding:'2px 7px',borderRadius:12,background:badgeBg,color:badgeColor}}>
                      → {badge}
                    </span>
                  )}
                  {!isKnown && <span style={{fontSize:10,color:'#cbd5e1',background:'#f8fafc',padding:'2px 6px',borderRadius:8}}>Not importable</span>}
                </label>
              )
            })}
          </div>
        </div>
      )}

      {/* Error banner */}
      {importError && (
        <div style={{display:'flex',gap:12,alignItems:'flex-start',padding:'14px 16px',background:'#fef2f2',border:'1px solid #fecaca',borderRadius:10}}>
          <div style={{width:32,height:32,borderRadius:8,background:'#fee2e2',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
            <AlertTriangle size={15} style={{color:'#dc2626'}}/>
          </div>
          <div>
            <p style={{margin:'0 0 2px',fontSize:13,fontWeight:600,color:'#991b1b'}}>Import failed</p>
            <p style={{margin:0,fontSize:12,color:'#dc2626',lineHeight:1.6}}>{importError}</p>
          </div>
        </div>
      )}

      {/* Step 3: Preview */}
      {step>=3 && rows.length>0 && (() => {
        const isWorkings = sheetName.toLowerCase().trim().replace(/\s+/g,'').includes('working')
        const isReceipts = /^\d{4}-\d{2}$/.test(sheetName.trim())
        const zoneNames  = isWorkings ? rows.map(r => String(r[3] ?? '').trim()).filter(Boolean) : []
        const accentCol  = isWorkings ? '#059669' : isReceipts ? '#d97706' : '#3b82f6'
        const btnBg      = isWorkings ? '#059669' : isReceipts ? '#d97706' : '#2563eb'
        const btnShadow  = isWorkings ? 'rgba(5,150,105,0.25)' : isReceipts ? 'rgba(217,119,6,0.25)' : 'rgba(37,99,235,0.25)'
        return (
          <div style={{background:'#fff',border:'1px solid #e2e8f0',borderRadius:12,padding:20,boxShadow:'0 1px 4px rgba(0,0,0,0.03)'}}>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:14}}>
              <div>
                <p style={{margin:'0 0 2px',fontSize:11,fontWeight:600,textTransform:'uppercase',letterSpacing:'0.06em',color:accentCol}}>Step 3 — Preview</p>
                <p style={{margin:0,fontSize:12,color:'#64748b'}}>
                  <strong style={{color:'#0f172a'}}>{isWorkings ? zoneNames.length : rows.length}</strong>
                  {isWorkings ? ' zones' : isReceipts ? ' receipt rows' : ' rows'} from <strong style={{color:'#0f172a'}}>"{sheetName}"</strong>
                  {isWorkings && <span style={{marginLeft:8,fontSize:11,color:'#94a3b8'}}>— reading column D only</span>}
                  {isReceipts && <span style={{marginLeft:8,fontSize:11,color:'#94a3b8'}}>— FY {sheetName} receipts sheet</span>}
                </p>
              </div>
            </div>

            {isWorkings ? (
              /* Zone preview */
              <div style={{borderRadius:8,border:'1px solid #d1fae5',marginBottom:16,maxHeight:260,overflowY:'auto',background:'#f0fdf4'}}>
                {zoneNames.map((name, i) => (
                  <div key={i} style={{display:'flex',alignItems:'center',gap:10,padding:'7px 12px',borderBottom:'1px solid #d1fae5',background:i%2===0?'#f0fdf4':'#fff'}}>
                    <span style={{fontSize:10,fontWeight:700,color:'#6ee7b7',width:22,textAlign:'right',flexShrink:0}}>{i+1}</span>
                    <span style={{fontSize:13,color:'#065f46'}}>{name}</span>
                    {name.toLowerCase()==='others' && (
                      <span style={{fontSize:10,padding:'1px 6px',borderRadius:8,background:'#fef3c7',color:'#92400e',marginLeft:'auto'}}>pinned last</span>
                    )}
                  </div>
                ))}
              </div>
            ) : isReceipts ? (
              /* Receipt preview — amber info box */
              <div style={{borderRadius:8,border:'1px solid #fde68a',marginBottom:16,padding:'14px 16px',background:'#fffbeb'}}>
                <p style={{margin:'0 0 6px',fontSize:13,fontWeight:600,color:'#92400e'}}>
                  {rows.length.toLocaleString()} receipt rows ready to import into FY {sheetName}
                </p>
                {/* Sample date debug panel */}
                {rows.length > 0 && (() => {
                  const hdrMap0 = {}
                  headers.forEach((h, i) => { if (h) hdrMap0[normalizeCol(h)] = i })
                  const col0 = (fb, ...ns) => { for (const n of ns) { const v = hdrMap0[normalizeCol(n)]; if (v != null) return v } return fb }
                  const dIdx = col0(3,'receipt_date','receiptdate','receipt date','date','rcptdate')
                  const sample = rows[0]?.[dIdx]
                  const parsed = parseDateDMY(sample)
                  const isDate = sample instanceof Date
                  const asString = String(sample ?? '')
                  return (
                    <div style={{margin:'4px 0 8px',padding:'8px 10px',background:'rgba(0,0,0,0.06)',borderRadius:6,fontFamily:'monospace',fontSize:11,lineHeight:1.7}}>
                      <div><span style={{color:'#78350f',fontWeight:600}}>type:</span> {isDate ? '📅 Date object' : typeof sample}</div>
                      <div><span style={{color:'#78350f',fontWeight:600}}>raw value:</span> {isDate ? sample.toISOString() : asString || '(empty)'}</div>
                      <div><span style={{color:'#78350f',fontWeight:600}}>String(raw):</span> <span style={{color:'#dc2626'}}>{asString.slice(0,60)}</span></div>
                      <div><span style={{color:'#78350f',fontWeight:600}}>parseDateDMY:</span> <strong style={{color: parsed ? '#065f46' : '#dc2626'}}>{parsed || '⚠ FAILED — will store today\'s date'}</strong></div>
                    </div>
                  )
                })()}
                <p style={{margin:'0 0 8px',fontSize:12,color:'#78350f',lineHeight:1.6}}>
                  Duplicate receipts (matched by receipt number) will be skipped automatically.
                  Month is derived from receipt date when no month column is present.
                </p>
                {/* Overwrite toggle */}
                <label style={{display:'flex',alignItems:'center',gap:7,cursor:'pointer',marginTop:4}}>
                  <input type="checkbox" checked={overwriteFY} onChange={e=>setOverwriteFY(e.target.checked)}
                    style={{width:14,height:14,accentColor:'#d97706',cursor:'pointer'}}/>
                  <span style={{fontSize:12,fontWeight:600,color:'#92400e'}}>
                    Clear existing receipts for FY {sheetName} and re-import (overwrite mode)
                  </span>
                </label>
                {overwriteFY && (
                  <p style={{margin:'5px 0 0 21px',fontSize:11,color:'#dc2626',fontWeight:600}}>
                    ⚠ All existing receipts for FY {sheetName} will be deleted before importing.
                  </p>
                )}
              </div>
            ) : (
              /* Normal member/deleted preview table */
              <div style={{overflowX:'auto',borderRadius:8,border:'1px solid #f1f5f9',marginBottom:16,maxHeight:260}}>
                <table style={{width:'100%',borderCollapse:'collapse',fontSize:11}}>
                  <thead>
                    <tr style={{background:'#f8fafc'}}>
                      {previewCols.map(({header, dbCol})=>(
                        <th key={dbCol} style={{textAlign:'left',padding:'8px 10px',fontSize:10,fontWeight:700,textTransform:'uppercase',letterSpacing:'.05em',color:'#94a3b8',borderBottom:'1px solid #e2e8f0',whiteSpace:'nowrap'}}>{header}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.slice(0,5).map((row,i)=>(
                      <tr key={i} style={{background:i%2===0?'#fff':'#fafafa'}}>
                        {previewCols.map(({header, idx, dbCol})=>(
                          <td key={header} style={{padding:'7px 10px',borderBottom:'1px solid #f8fafc',color:'#334155',maxWidth:120,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                            {row[idx]
                              ? (DATE_COLS.includes(dbCol)
                                  ? fmtDateDisplay(cleanVal(row[idx], dbCol)) || row[idx]
                                  : row[idx])
                              : <span style={{color:'#cbd5e1'}}>—</span>}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div style={{display:'flex',gap:8}}>
              <button onClick={doImport} disabled={importing}
                style={{display:'flex',alignItems:'center',gap:7,padding:'9px 18px',fontSize:13,fontWeight:600,borderRadius:9,border:'none',
                  background:importing?'#93c5fd':btnBg,
                  color:'#fff',cursor:importing?'default':'pointer',
                  boxShadow:`0 2px 8px ${btnShadow}`}}>
                {importing
                  ? <><Loader2 size={13} style={{animation:'spin 1s linear infinite'}}/>Importing…</>
                  : isWorkings
                  ? <><CheckCircle size={13}/>Replace {zoneNames.length} zones</>
                  : isReceipts
                  ? <><CheckCircle size={13}/>Import {rows.length.toLocaleString()} receipts — FY {sheetName}</>
                  : <><CheckCircle size={13}/>Confirm &amp; import {rows.length.toLocaleString()} records</>}
              </button>
              <button onClick={reset}
                style={{display:'flex',alignItems:'center',gap:6,padding:'9px 16px',fontSize:13,fontWeight:500,borderRadius:9,border:'1px solid #e2e8f0',background:'#fff',color:'#64748b',cursor:'pointer'}}>
                <RefreshCw size={13}/>Start over
              </button>
            </div>
          </div>
        )
      })()}

      {/* Step 4: Progress */}
      {step>=4 && importing && !result && (
        <div style={{background:'#fff',border:'1px solid #e2e8f0',borderRadius:12,padding:20,boxShadow:'0 1px 4px rgba(0,0,0,0.03)'}}>
          <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:14}}>
            <Loader2 size={16} style={{color:'#2563eb',animation:'spin 1s linear infinite',flexShrink:0}}/>
            <div>
              <p style={{margin:'0 0 1px',fontSize:13,fontWeight:600,color:'#0f172a'}}>Importing receipts…</p>
              <p style={{margin:0,fontSize:11,color:'#94a3b8'}}>"{sheetName}"</p>
            </div>
            <span style={{marginLeft:'auto',fontSize:13,fontWeight:700,color:'#2563eb'}}>{progress}%</span>
          </div>
          <div style={{height:8,borderRadius:4,background:'#e2e8f0',overflow:'hidden'}}>
            <div style={{height:'100%',borderRadius:4,background:'#2563eb',transition:'width .3s',width:progress+'%'}}/>
          </div>
          <p style={{margin:'8px 0 0',fontSize:11,color:'#94a3b8'}}>Please wait — do not close this page.</p>
        </div>
      )}

      {/* Step 4: Result */}
      {step>=4 && result && (
        <div style={{background:'#fff',border:'1px solid #e2e8f0',borderRadius:12,padding:20,boxShadow:'0 1px 4px rgba(0,0,0,0.03)'}}>
          <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:16}}>
            <div style={{width:32,height:32,borderRadius:8,background:'#f0fdf4',display:'flex',alignItems:'center',justifyContent:'center'}}>
              <CheckCircle size={16} style={{color:'#22c55e'}}/>
            </div>
            <div>
              <p style={{margin:'0 0 1px',fontSize:13,fontWeight:600,color:'#0f172a'}}>Import complete</p>
              <p style={{margin:0,fontSize:11,color:'#94a3b8'}}>"{sheetName}"</p>
            </div>
          </div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:10,marginBottom:14}}>
            {[['Imported',result.inserted,'#22c55e','#f0fdf4'],['Errors',result.errors,result.errors?'#ef4444':'#22c55e',result.errors?'#fef2f2':'#f0fdf4'],['Total',result.total,'#2563eb','#eff6ff']].map(([l,v,c,bg])=>(
              <div key={l} style={{background:bg,borderRadius:10,padding:'14px 12px',textAlign:'center'}}>
                <p style={{margin:'0 0 3px',fontSize:26,fontWeight:800,color:c,lineHeight:1}}>{v}</p>
                <p style={{margin:0,fontSize:10,fontWeight:600,textTransform:'uppercase',letterSpacing:'0.06em',color:c,opacity:0.7}}>{l}</p>
              </div>
            ))}
          </div>
          {result.dups > 0 && (
            <div style={{display:'flex',gap:8,alignItems:'center',padding:'10px 14px',background:'#fffbeb',border:'1px solid #fde68a',borderRadius:9,marginBottom:12}}>
              <AlertTriangle size={13} style={{color:'#d97706',flexShrink:0}}/>
              <p style={{margin:0,fontSize:12,color:'#92400e'}}>
                {result.dups} duplicate Member ID{result.dups>1?'s':''} found — last occurrence kept for each.
              </p>
            </div>
          )}
          <div style={{display:'flex',gap:8}}>
            <a href="/members" style={{display:'flex',alignItems:'center',gap:6,padding:'8px 16px',fontSize:13,fontWeight:600,borderRadius:9,background:'#2563eb',color:'#fff',textDecoration:'none',boxShadow:'0 2px 8px rgba(37,99,235,0.2)'}}>View members</a>
            <button onClick={reset} style={{display:'flex',alignItems:'center',gap:6,padding:'8px 16px',fontSize:13,fontWeight:500,borderRadius:9,border:'1px solid #e2e8f0',background:'#fff',color:'#64748b',cursor:'pointer'}}>
              <RefreshCw size={13}/>Import another
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── PHOTOS TAB ────────────────────────────────────────────────────────────────
function PhotosTab({ onRefreshBoard }) {
  const toast = useToast()
  const fileRef = useRef(null)
  const [folder, setFolder] = useState('active')
  const [files, setFiles] = useState([])
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [done, setDone] = useState(0)
  const [errors, setErrors] = useState(0)
  const [existing, setExisting] = useState([])
  const [loadingExisting, setLoadingExisting] = useState(false)
  const [dragOver, setDragOver] = useState(false)

  useEffect(() => { loadExisting(); setFiles([]) }, [folder])

  async function loadExisting() {
    setLoadingExisting(true)
    const { data } = await supabase.storage.from('member-photos').list(folder, { limit:10000, sortBy:{column:'name',order:'asc'} })
    setExisting((data||[]).filter(f=>/\.(jpg|jpeg|png)$/i.test(f.name)))
    setLoadingExisting(false)
  }

  function handleFiles(fileList) {
    const imgs = Array.from(fileList).filter(f=>/\.(jpg|jpeg|png)$/i.test(f.name))
    if (!imgs.length) { toast('No valid image files selected.','error'); return }
    setFiles(imgs)
  }

  async function upload() {
    if (!files.length) return
    const targetFolder = folder // capture at call time — avoids stale closure
    setUploading(true); setProgress(0); setDone(0); setErrors(0)
    let d=0, e=0
    for (let i=0;i<files.length;i++) {
      const f = files[i]
      const memberId = f.name.replace(/\.[^.]+$/,'')
      const ext = f.name.split('.').pop().toLowerCase()
      const { error } = await supabase.storage.from('member-photos').upload(`${targetFolder}/${memberId}.${ext}`, f, { upsert:true })
      if (error) { e++; console.error(f.name, error.message) } else d++
      setProgress(Math.round(((i+1)/files.length)*100))
      setDone(d); setErrors(e)
      await new Promise(r=>setTimeout(r,50))
    }
    setUploading(false)
    toast(d+' photos uploaded to '+targetFolder+(e?' ('+e+' failed)':''), e?'warning':'success')
    if (d > 0) {
      await logMigration(`photos_${targetFolder}`, targetFolder === 'active' ? 'Photos — Active' : 'Photos — Deleted', 'success', files.length, d, e)
      onRefreshBoard?.()
    }
    setFiles([]); loadExisting()
  }

  async function flushFolder(targetFolder) {
    if (!confirm(`Delete ALL photos in "${targetFolder}" folder?\nThis cannot be undone.`)) return
    const { data: allFiles } = await supabase.storage.from('member-photos').list(targetFolder, { limit:10000 })
    if (allFiles?.length) {
      const paths = allFiles.filter(f=>f.metadata).map(f=>`${targetFolder}/${f.name}`)
      if (paths.length) await supabase.storage.from('member-photos').remove(paths)
    }
    toast(`All photos in "${targetFolder}" deleted.`, 'success')
    loadExisting(); onRefreshBoard?.()
  }

  return (
    <div className="space-y-5">
      {/* Folder tabs with per-folder flush buttons */}
      <div className="flex border-b border-slate-200 justify-between items-end">
        <div className="flex">
          {[['active','Active Members'],['deleted','Deleted Members']].map(([id,label])=>(
            <button key={id} onClick={()=>{ setFolder(id); setFiles([]) }}
              className={'px-4 py-2.5 text-sm font-semibold border-b-2 transition-all '+(folder===id?'border-blue-600 text-blue-600':'border-transparent text-slate-400 hover:text-slate-600')}>
              {label}
            </button>
          ))}
        </div>
        <div className="flex gap-2 pb-2">
          {[['active','Active'],['deleted','Deleted']].map(([id,label])=>(
            <button key={id} onClick={()=>flushFolder(id)}
              style={{fontSize:11,padding:'3px 10px',border:'0.5px solid #F7C1C1',borderRadius:8,background:'#FCEBEB',color:'#A32D2D',cursor:'pointer',display:'flex',alignItems:'center',gap:4}}>
              <Trash2 size={10}/> Flush {label}
            </button>
          ))}
        </div>
      </div>

      <div className={'rounded-xl p-8 text-center cursor-pointer transition-all border-2 border-dashed '+(dragOver?'border-blue-400 bg-blue-50':(files.length?'border-green-400 bg-green-50':'border-slate-200 bg-slate-50 hover:border-blue-300'))}
        onClick={()=>fileRef.current?.click()}
        onDragOver={e=>{e.preventDefault();setDragOver(true)}}
        onDragLeave={()=>setDragOver(false)}
        onDrop={e=>{e.preventDefault();setDragOver(false);handleFiles(e.dataTransfer.files)}}>
        <Camera size={36} className={'mx-auto mb-3 '+(files.length?'text-green-500':'text-slate-300')}/>
        <p className="text-sm font-semibold text-slate-700">
          {files.length ? files.length+' photo(s) selected' : 'Click or drag photos here'}
        </p>
        <p className="text-xs text-slate-400 mt-1">JPG, JPEG, PNG — filename must be Member ID</p>
        <p className="text-xs text-blue-600 mt-1.5 font-medium">Uploading to: member-photos/{folder}/</p>
      </div>
      <input ref={fileRef} type="file" accept="image/jpeg,image/jpg,image/png" multiple className="hidden" onChange={e=>handleFiles(e.target.files)}/>

      {files.length > 0 && (
        <div className="card p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-semibold text-slate-700">{files.length} photo(s) ready</p>
            <div className="flex gap-2">
              <button onClick={()=>setFiles([])} className="btn btn-ghost btn-sm">Clear</button>
              <button onClick={upload} disabled={uploading} className="btn btn-primary btn-sm">
                {uploading?<><Loader2 size={13} className="animate-spin"/>Uploading {progress}%...</>:<><Upload size={13}/>Upload {files.length} photos</>}
              </button>
            </div>
          </div>
          {uploading && (
            <>
              <div className="h-2 rounded bg-slate-100 overflow-hidden mb-1.5"><div className="h-full rounded bg-blue-600 transition-all" style={{width:progress+'%'}}/></div>
              <p className="text-xs text-slate-400">{done} uploaded{errors?', '+errors+' failed':''}</p>
            </>
          )}
          <div className="grid gap-2 mt-3" style={{gridTemplateColumns:'repeat(auto-fill,minmax(80px,1fr))'}}>
            {files.slice(0,12).map((f,i)=>(
              <div key={i} className="rounded-lg overflow-hidden border border-slate-200 bg-slate-50">
                <img src={URL.createObjectURL(f)} className="w-full h-16 object-cover" alt=""/>
                <p className="text-[9px] text-slate-500 p-1 text-center truncate">{f.name.replace(/\.[^.]+$/,'')}</p>
              </div>
            ))}
            {files.length>12&&<div className="rounded-lg border border-dashed border-slate-200 h-20 flex items-center justify-center text-xs text-slate-400">+{files.length-12} more</div>}
          </div>
        </div>
      )}

      <div className="card">
        <div className="card-header">
          <span className="card-title">Photos in {folder}/ ({existing.length})</span>
          <button onClick={loadExisting} className="btn btn-ghost btn-sm"><RefreshCw size={12}/>Refresh</button>
        </div>
        <div className="p-4">
          {loadingExisting ? (
            <div className="flex justify-center py-8"><Loader2 size={18} className="animate-spin text-slate-300"/></div>
          ) : existing.length===0 ? (
            <p className="text-center py-8 text-slate-400 text-sm">No photos in {folder}/ yet.</p>
          ) : (
            <div className="grid gap-2" style={{gridTemplateColumns:'repeat(auto-fill,minmax(90px,1fr))'}}>
              {existing.map(p=>{
                const { data: { publicUrl } } = supabase.storage.from('member-photos').getPublicUrl(`${folder}/${p.name}`)
                return (
                  <div key={p.name} className="rounded-lg overflow-hidden border border-slate-200">
                    <img src={publicUrl} loading="lazy" className="w-full h-20 object-cover" alt=""/>
                    <p className="text-[9px] text-slate-500 p-1 text-center truncate">{p.name.replace(/\.[^.]+$/,'')}</p>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── AUTO FLUSH ────────────────────────────────────────────────────────────────
const CLEANUP_RULES = [
  { bucket: 'announcement-cards',   label: 'Announcement Cards',   maxAgeHours: 48,  note: 'Root-level files only — templates/ subfolder is never touched.' },
  { bucket: 'announcement-reports', label: 'Announcement Reports', maxAgeHours: 48,  note: 'Files with "template" in the name are kept forever.' },
  { bucket: 'family-records',       label: 'Family Records',       maxAgeHours: 168, note: 'Files with "template" in the name are kept forever.' },
]

// A file is a template if it has no metadata (folder) or name contains "template"
const isTemplateFile = f => !f.metadata || f.name.toLowerCase().includes('template')

function fmtAge(hours) {
  return hours >= 24 ? `${hours / 24} day${hours / 24 !== 1 ? 's' : ''}` : `${hours}h`
}

function AutoFlushTab() {
  const toast = useToast()
  const [running,  setRunning]  = useState(false)
  const [results,  setResults]  = useState(null)
  const [lastRun,  setLastRun]  = useState(() => {
    try { return localStorage.getItem('storage_cleanup_last_run') } catch { return null }
  })

  async function runCleanup() {
    setRunning(true)
    setResults(null)
    const out = []

    for (const rule of CLEANUP_RULES) {
      // List root to discover both files and subfolders
      const { data: rootItems, error: listErr } = await adminSupabase.storage
        .from(rule.bucket).list('', { limit: 10_000 })

      if (listErr) {
        out.push({ label: rule.label, deleted: 0, kept: 0, error: listErr.message })
        continue
      }

      const toDelete = []
      let kept = 0

      for (const item of (rootItems || [])) {
        if (item.metadata) {
          // Root-level file
          if (isTemplateFile(item)) { kept++; continue }
          toDelete.push(item.name)
        } else {
          // Subfolder — skip anything named template*
          if (item.name.toLowerCase().includes('template')) continue
          const { data: subItems } = await adminSupabase.storage
            .from(rule.bucket).list(item.name, { limit: 10_000 })
          for (const f of (subItems || [])) {
            if (!f.metadata) continue
            if (isTemplateFile(f)) { kept++; continue }
            toDelete.push(`${item.name}/${f.name}`)
          }
        }
      }

      if (!toDelete.length) {
        out.push({ label: rule.label, deleted: 0, kept, error: null })
        continue
      }

      const { error: delErr } = await adminSupabase.storage.from(rule.bucket).remove(toDelete)
      out.push({ label: rule.label, deleted: toDelete.length, kept, error: delErr?.message ?? null })
    }

    const ts = new Date().toISOString()
    try { localStorage.setItem('storage_cleanup_last_run', ts) } catch { /* ignore */ }
    setLastRun(ts)
    setResults(out)
    setRunning(false)

    const total = out.reduce((s, r) => s + r.deleted, 0)
    toast(total > 0 ? `Cleanup done — ${total} file${total !== 1 ? 's' : ''} removed.` : 'Cleanup done — nothing to remove.', 'success')
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Config card */}
      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 20, boxShadow: '0 1px 4px rgba(0,0,0,0.03)' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 18 }}>
          <div>
            <p style={{ margin: '0 0 4px', fontSize: 13, fontWeight: 700, color: '#0f172a' }}>Storage Auto-Flush</p>
            <p style={{ margin: 0, fontSize: 12, color: '#94a3b8', lineHeight: 1.5 }}>
              Runs automatically every hour via scheduled job (FIFO).<br/>
              <strong style={{ color: '#64748b' }}>Templates are never deleted.</strong>
            </p>
          </div>
          <button onClick={runCleanup} disabled={running} style={{
            flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6,
            padding: '8px 16px', fontSize: 12, fontWeight: 600, borderRadius: 9,
            border: 'none', background: running ? '#93c5fd' : '#2563eb', color: '#fff',
            cursor: running ? 'default' : 'pointer', whiteSpace: 'nowrap',
          }}>
            {running
              ? <><Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} />Running…</>
              : <><Zap size={13} />Run Now</>}
          </button>
        </div>

        {/* Rules list */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {CLEANUP_RULES.map(rule => (
            <div key={rule.bucket} style={{
              display: 'flex', alignItems: 'center', gap: 12, padding: '11px 14px',
              borderRadius: 10, border: '1px solid #e2e8f0', background: '#f8fafc',
            }}>
              <div style={{ width: 34, height: 34, borderRadius: 8, background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Camera size={15} style={{ color: '#3b82f6' }} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: '0 0 2px', fontSize: 13, fontWeight: 600, color: '#0f172a' }}>{rule.label}</p>
                <p style={{ margin: 0, fontSize: 10, color: '#94a3b8', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{rule.bucket}</p>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                <span style={{ fontSize: 11, padding: '3px 9px', borderRadius: 20, background: '#fef3c7', color: '#92400e', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Clock size={10} /> {fmtAge(rule.maxAgeHours)}
                </span>
                <span style={{ fontSize: 11, padding: '3px 9px', borderRadius: 20, background: '#f0fdf4', color: '#166534', fontWeight: 500 }}>
                  🛡 Templates safe
                </span>
              </div>
            </div>
          ))}
        </div>

        {lastRun && (
          <p style={{ margin: '14px 0 0', fontSize: 11, color: '#cbd5e1', display: 'flex', alignItems: 'center', gap: 5 }}>
            <CheckCircle size={11} style={{ color: '#22c55e' }} />
            Last run: {fmtDateTime(lastRun)}
          </p>
        )}
      </div>

      {/* Results */}
      {results && (
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 20, boxShadow: '0 1px 4px rgba(0,0,0,0.03)' }}>
          <p style={{ margin: '0 0 12px', fontSize: 12, fontWeight: 700, color: '#0f172a' }}>Cleanup results — {fmtDateTime(new Date().toISOString())}</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {results.map(r => (
              <div key={r.label} style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
                borderRadius: 9, border: `1px solid ${r.error ? '#fecaca' : r.deleted > 0 ? '#bbf7d0' : '#e2e8f0'}`,
                background: r.error ? '#fef2f2' : r.deleted > 0 ? '#f0fdf4' : '#f8fafc',
              }}>
                {r.error
                  ? <XCircle size={15} style={{ color: '#ef4444', flexShrink: 0 }} />
                  : r.deleted > 0
                  ? <Trash2 size={15} style={{ color: '#16a34a', flexShrink: 0 }} />
                  : <CheckCircle size={15} style={{ color: '#94a3b8', flexShrink: 0 }} />}
                <span style={{ flex: 1, fontSize: 13, color: '#0f172a', fontWeight: 500 }}>{r.label}</span>
                {r.error ? (
                  <span style={{ fontSize: 11, color: '#dc2626' }}>{r.error}</span>
                ) : (
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span style={{ fontSize: 12, fontWeight: r.deleted > 0 ? 700 : 400, color: r.deleted > 0 ? '#15803d' : '#94a3b8' }}>
                      {r.deleted > 0 ? `${r.deleted} removed` : 'Nothing to remove'}
                    </span>
                    {r.kept > 0 && (
                      <span style={{ fontSize: 11, color: '#64748b', padding: '2px 7px', borderRadius: 12, background: '#f0fdf4' }}>
                        {r.kept} template{r.kept !== 1 ? 's' : ''} kept
                      </span>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Receipt import helpers (used by ImportTab.doImportReceipts) ───────────────
const _DMY_MONS = {jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12}
function parseDateDMY(s) {
  if (!s && s !== 0) return ''
  // JS Date object (raw:true + cellDates:true in XLSX.read).
  // SheetJS uses new Date(y, m, d) (local midnight), but floating-point serial math can
  // produce a value a few seconds BEFORE midnight — e.g. 23:59:50 IST instead of 00:00:00.
  // Adding 30 min clears that gap without ever crossing a real day boundary.
  if (s instanceof Date) {
    if (isNaN(s.getTime())) return ''
    const adj = new Date(s.getTime() + 30 * 60 * 1000)
    return `${adj.getFullYear()}-${String(adj.getMonth()+1).padStart(2,'0')}-${String(adj.getDate()).padStart(2,'0')}`
  }
  const str = String(s).trim()
  if (!str) return ''
  // ISO date / datetime: "2026-04-01" or "2026-04-01T00:00:00…"
  const m2 = str.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (m2) return `${m2[1]}-${m2[2]}-${m2[3]}`
  // DD-MM-YYYY or DD/MM/YYYY
  const m1 = str.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/)
  if (m1) return `${m1[3]}-${m1[2].padStart(2,'0')}-${m1[1].padStart(2,'0')}`
  // DD-MMM-YYYY or DD MMM YYYY  e.g. "01-Apr-2026" / "1 April 2026"
  const m3 = str.match(/^(\d{1,2})[-/ ]([a-zA-Z]{3,9})[-/ ](\d{4})$/)
  if (m3) {
    const mo = _DMY_MONS[m3[2].toLowerCase().slice(0,3)]
    if (mo) return `${m3[3]}-${String(mo).padStart(2,'0')}-${m3[1].padStart(2,'0')}`
  }
  // Excel serial number string
  if (/^\d+$/.test(str)) {
    const n = parseInt(str, 10)
    if (n > 1000) {
      const d = new Date((n - 25569) * 86400 * 1000)
      if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10)
    }
  }
  return ''
}
function normalizeCol(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '')
}


export default function ImportPage() {
  const { profile } = useAuth()
  const toast = useToast()
  const [tab, setTab] = useState('import')
  const [stats, setStats] = useState([])   // [{ label, count, icon }]
  const [history, setHistory] = useState([])
  const [historyLoading, setHistoryLoading] = useState(true)
  const [flushingId, setFlushingId]           = useState(null)
  const [passwordModal, setPasswordModal]     = useState(false)
  const [flushAllModal, setFlushAllModal]     = useState(false)

  const refreshStats = async () => {
    const newStats = []

    // Stats tiles show only the 4 primary items
    for (const tbl of ['members', 'deleted_members']) {
      try {
        const { count, error } = await supabase.from(tbl).select('*', { count:'exact', head:true })
        if (!error) newStats.push({ label: tbl, count: count || 0 })
      } catch (_) {}
    }

    const KNOWN_STORAGE = [
      { bucket: 'member-photos', folder: 'active',  label: 'Photos - Active Members'  },
      { bucket: 'member-photos', folder: 'deleted', label: 'Photos - Deleted Members' },
    ]
    for (const { bucket, folder, label } of KNOWN_STORAGE) {
      try {
        const { data: files, error } = await supabase.storage.from(bucket).list(folder, { limit: 10000 })
        if (!error) {
          const fileCount = (files||[]).filter(f => f.metadata).length
          newStats.push({ label, count: fileCount, type: 'storage' })
        }
      } catch (_) {}
    }

    setStats(newStats)
  }

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true)
    const { data, error } = await supabase
      .from('migration_history')
      .select('*')
      .neq('status', 'flushed')
      .gt('records_succeeded', 0)        // hide ghost rows from failed past attempts
      .order('performed_at', { ascending: false })
    if (!error) setHistory(data || [])
    setHistoryLoading(false)
  }, [])

  useEffect(() => { refreshStats(); loadHistory() }, [loadHistory])

  async function flushRow(entry) {
    const label = entry.source_file || entry.category
    if (!window.confirm(`Delete all records in "${label}"?\nTable structure is preserved. This cannot be undone.`)) return
    setFlushingId(entry.id)
    try {
      await eraseCategory(entry.category)
      await supabase.from('migration_history')
        .update({ status:'flushed', flushed_at: new Date().toISOString(), flushed_by: profile?.email })
        .eq('category', entry.category)
      toast(`"${label}" flushed.`, 'success')
      loadHistory(); refreshStats()
    } catch (err) {
      toast(`Flush failed: ${err.message}`, 'error')
    } finally {
      setFlushingId(null)
    }
  }

  if (profile?.role !== 'super_admin') {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <ShieldAlert size={32} className="text-slate-300"/>
        <p className="text-slate-400 text-sm">Access denied. Super Admin only.</p>
      </div>
    )
  }

  return (
    <div className="animate-fade-in max-w-6xl mx-auto">
      <style>{`
        @keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
        @keyframes fadeSlideUp { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
        .imp-page { font-family: 'DM Sans', ui-sans-serif, system-ui, sans-serif; }
        .stat-tile { transition: transform 0.15s ease, box-shadow 0.15s ease; }
        .stat-tile:hover { transform: translateY(-2px); box-shadow: 0 8px 24px rgba(0,0,0,0.08); }
        .imp-tab-btn { transition: all 0.15s ease; }
        .board-row { transition: background 0.12s ease; }
        .board-row:hover { background: #f8fafc; }
        .flush-btn-row { transition: all 0.15s ease; }
        .flush-btn-row:hover { color: #dc2626 !important; background: #fef2f2 !important; }
      `}</style>

      <div className="imp-page">
        {/* ── Header ── */}
        <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',gap:12,marginBottom:28}}>
          <div>
            <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:4}}>
              <div style={{width:32,height:32,borderRadius:8,background:'linear-gradient(135deg,#2563eb,#4f46e5)',display:'flex',alignItems:'center',justifyContent:'center'}}>
                <Database size={16} style={{color:'#fff'}}/>
              </div>
              <h1 style={{margin:0,fontSize:22,fontWeight:700,color:'#0f172a',letterSpacing:'-0.3px'}}>Migration Dashboard</h1>
            </div>
            <p style={{margin:0,fontSize:12,color:'#94a3b8',paddingLeft:42}}>Import worksheets &amp; photos · Monitor all activity on the board</p>
          </div>
          <button onClick={()=>setFlushAllModal(true)}
            style={{flexShrink:0,display:'flex',alignItems:'center',gap:6,padding:'9px 18px',fontSize:13,fontWeight:500,border:'1px solid #fecaca',borderRadius:10,background:'#fff5f5',color:'#dc2626',cursor:'pointer',marginTop:4,transition:'all 0.15s ease',boxShadow:'0 1px 3px rgba(220,38,38,0.1)'}}
            onMouseEnter={e=>{e.currentTarget.style.background='#fee2e2';e.currentTarget.style.boxShadow='0 4px 12px rgba(220,38,38,0.15)'}}
            onMouseLeave={e=>{e.currentTarget.style.background='#fff5f5';e.currentTarget.style.boxShadow='0 1px 3px rgba(220,38,38,0.1)'}}>
            <Trash2 size={14}/> Flush All
          </button>
        </div>

        {/* ── Stats tiles ── */}
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(170px,1fr))',gap:14,marginBottom:28}}>
          {stats.map((s, i) => {
            const isTable   = !s.type || s.type === 'table'
            const isDeleted = s.label.toLowerCase().includes('deleted')
            const accent    = isTable
              ? (isDeleted ? { light:'#fffbeb', border:'#fde68a', text:'#92400e', icon:'#d97706' }
                           : { light:'#eff6ff', border:'#bfdbfe', text:'#1e40af', icon:'#3b82f6' })
              : (isDeleted ? { light:'#fdf2f8', border:'#f0abfc', text:'#86198f', icon:'#c026d3' }
                           : { light:'#f0fdf4', border:'#bbf7d0', text:'#166534', icon:'#22c55e' })
            return (
              <div key={s.label} className="stat-tile" style={{
                background:'#fff', border:`1px solid ${accent.border}`,
                borderRadius:12, padding:'16px 18px',
                animation:`fadeSlideUp 0.3s ease ${i * 0.05}s both`
              }}>
                <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:10}}>
                  <div style={{width:28,height:28,borderRadius:7,background:accent.light,display:'flex',alignItems:'center',justifyContent:'center'}}>
                    {isTable ? <Database size={13} style={{color:accent.icon}}/> : <Camera size={13} style={{color:accent.icon}}/>}
                  </div>
                </div>
                <p style={{margin:'0 0 3px',fontSize:22,fontWeight:700,color:'#0f172a',lineHeight:1}}>{s.count.toLocaleString()}</p>
                <p style={{margin:0,fontSize:11,color:accent.text,fontWeight:500,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{s.label}</p>
              </div>
            )
          })}
          {stats.length === 0 && [1,2,3,4].map(i => (
            <div key={i} className="stat-tile" style={{background:'#f8fafc',border:'1px solid #e2e8f0',borderRadius:12,padding:'16px 18px',opacity:0.5}}>
              <div style={{width:28,height:28,borderRadius:7,background:'#e2e8f0',marginBottom:10}}/>
              <div style={{height:22,width:'60%',background:'#e2e8f0',borderRadius:4,marginBottom:6}}/>
              <div style={{height:11,width:'80%',background:'#e2e8f0',borderRadius:4}}/>
            </div>
          ))}
        </div>

        {/* ── Split layout ── */}
        <div style={{display:'grid',gridTemplateColumns:'1fr 290px',gap:24,alignItems:'start'}}>

          {/* LEFT: import tools */}
          <div>
            {/* Tab bar */}
            <div style={{display:'flex',gap:4,marginBottom:20,background:'#f1f5f9',padding:4,borderRadius:10,width:'fit-content'}}>
              {[['import','Import Excel',FileSpreadsheet],['photos','Upload Photos',Camera],['autoflush','Auto Flush',Zap]].map(([id,label,Icon])=>(
                <button key={id} onClick={()=>setTab(id)} className="imp-tab-btn"
                  style={{display:'flex',alignItems:'center',gap:7,padding:'7px 16px',fontSize:13,fontWeight:500,borderRadius:7,border:'none',cursor:'pointer',
                    background: tab===id ? '#fff' : 'transparent',
                    color:       tab===id ? '#2563eb' : '#64748b',
                    boxShadow:   tab===id ? '0 1px 4px rgba(0,0,0,0.1)' : 'none'}}>
                  <Icon size={14}/>{label}
                </button>
              ))}
            </div>
            {tab === 'import'    && <ImportTab onRefreshBoard={() => { loadHistory(); refreshStats() }} setPasswordModal={setPasswordModal}/>}
            {tab === 'photos'    && <PhotosTab onRefreshBoard={() => { loadHistory(); refreshStats() }}/>}
            {tab === 'autoflush' && <AutoFlushTab />}
          </div>

          {/* RIGHT: sticky import board */}
          <div style={{position:'sticky',top:20,height:'calc(100vh - 220px)'}}>
            <ImportBoard
              history={history}
              loading={historyLoading}
              onFlushRow={flushRow}
              flushingId={flushingId}
            />
          </div>

        </div>
      </div>

      <PasswordModal open={passwordModal} onClose={() => setPasswordModal(false)}/>
      <FlushAllModal
        open={flushAllModal}
        onClose={() => setFlushAllModal(false)}
        onDone={() => { loadHistory(); refreshStats() }}
        setPasswordModal={setPasswordModal}
        profile={profile}
        toast={toast}
      />
    </div>
  )
}
