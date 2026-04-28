import { useState, useRef, useEffect, useCallback } from 'react'
import ReactDOM from 'react-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { useToast } from '../lib/toast'
import { Upload, FileSpreadsheet, Image, CheckCircle, Loader2, RefreshCw, Camera, Trash2, Database, History, ShieldAlert, AlertTriangle } from 'lucide-react'

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

function pad2(value) {
  return String(value).padStart(2, '0')
}

function safeDateToIso(date) {
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`
}

function parseDateString(s) {
  const raw = String(s).trim()
  if (!raw) return null

  // YYYY-MM-DD or YYYY/MM/DD (ISO-like)
  const isoMatch = raw.match(/^(\d{4})[-\/\.](\d{1,2})[-\/\.](\d{1,2})$/)
  if (isoMatch) {
    const [, y, m, d] = isoMatch.map(Number)
    const dt = new Date(Date.UTC(y, m - 1, d))
    return isNaN(dt.getTime()) ? null : dt
  }

  // DD-MM-YYYY or DD.MM.YYYY (Indian format, dash/dot + 4-digit year)
  const dmyMatch = raw.match(/^(\d{1,2})[-\.](\d{1,2})[-\.](\d{4})$/)
  if (dmyMatch) {
    const [, d, m, y] = dmyMatch.map(Number)
    const dt = new Date(Date.UTC(y, m - 1, d))
    return isNaN(dt.getTime()) ? null : dt
  }

  // M/D/YY or M/D/YYYY (US format with slash — as stored in this Excel)
  const mdyMatch = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/)
  if (mdyMatch) {
    const m = parseInt(mdyMatch[1], 10)
    const d = parseInt(mdyMatch[2], 10)
    let y = parseInt(mdyMatch[3], 10)
    if (y < 100) y += y < 30 ? 2000 : 1900
    const dt = new Date(Date.UTC(y, m - 1, d))
    return isNaN(dt.getTime()) ? null : dt
  }

  // DD-Mon-YYYY or DD Mon YYYY (named month, e.g. 15-Jun-1985)
  const parts = raw.split(/[-\/\.\s]+/)
  if (parts.length === 3) {
    const d = parseInt(parts[0], 10)
    let y = parseInt(parts[2], 10)
    if (y < 100) y += y < 30 ? 2000 : 1900
    const months = {
      jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
      jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
    }
    const mo = months[parts[1].toLowerCase().substring(0, 3)]
    if (mo !== undefined && !isNaN(d) && !isNaN(y)) {
      const dt = new Date(Date.UTC(y, mo, d))
      return isNaN(dt.getTime()) ? null : dt
    }
  }

  return null
}

function cleanVal(val, dbCol) {
  if (val === null || val === undefined || val === '') return null
  const s = String(val).trim(); if (!s) return null
  if (ACT_COLS.includes(dbCol)) return (s && s !== '0' && s.toLowerCase() !== 'false' && s.toLowerCase() !== 'no')
  if (DATE_COLS.includes(dbCol)) {
    if (val instanceof Date) {
      if (!isNaN(val.getTime())) return safeDateToIso(val)
    }
    const d = parseDateString(s)
    if (d) return safeDateToIso(d)
    return null
  }
  if (dbCol === 'age') return parseInt(s) || null
  return s
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
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.5)',backdropFilter:'blur(6px)',WebkitBackdropFilter:'blur(6px)',zIndex:2000,display:'flex',alignItems:'center',justifyContent:'center',padding:16}}>
      <div style={{background:'#ffffff',borderRadius:'var(--border-radius-lg)',border:'0.5px solid var(--color-border-tertiary)',padding:'24px',width:'100%',maxWidth:340,boxShadow:'0 24px 64px rgba(0,0,0,0.35)'}}>
        <p style={{margin:'0 0 4px',fontSize:15,fontWeight:500,color:'var(--color-text-primary)'}}>Confirm identity</p>
        <p style={{margin:'0 0 16px',fontSize:12,color:'var(--color-text-secondary)'}}>Enter your login password to proceed</p>
        <div style={{position:'relative',marginBottom:err?8:16}}>
          <input type={show?'text':'password'} value={pw}
            onChange={e=>{setPw(e.target.value);setErr('')}}
            onKeyDown={e=>e.key==='Enter'&&submit()}
            placeholder="Password" autoFocus
            style={{width:'100%',boxSizing:'border-box',padding:'8px 36px 8px 10px',fontSize:13,border:'0.5px solid var(--color-border-secondary)',borderRadius:'var(--border-radius-md)',background:'var(--color-background-secondary)',color:'var(--color-text-primary)',outline:'none'}}/>
          <button onClick={()=>setShow(s=>!s)}
            style={{position:'absolute',right:8,top:'50%',transform:'translateY(-50%)',background:'none',border:'none',cursor:'pointer',color:'var(--color-text-secondary)',padding:2,display:'flex',alignItems:'center'}}>
            {show
              ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
              : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>}
          </button>
        </div>
        {err && <p style={{margin:'0 0 12px',fontSize:11,color:'#A32D2D'}}>{err}</p>}
        <div style={{display:'flex',gap:8,justifyContent:'flex-end'}}>
          <button onClick={cancel} style={{fontSize:12,padding:'6px 14px',border:'0.5px solid var(--color-border-secondary)',borderRadius:'var(--border-radius-md)',background:'none',color:'var(--color-text-secondary)',cursor:'pointer'}}>Cancel</button>
          <button onClick={submit} disabled={!pw||busy}
            style={{fontSize:12,padding:'6px 14px',border:'none',borderRadius:'var(--border-radius-md)',background:'#2563eb',color:'#fff',cursor:'pointer',opacity:(!pw||busy)?0.5:1}}>
            {busy?'Verifying…':'Confirm'}
          </button>
        </div>
      </div>
    </div>,
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

    // ── 1. Probe each known table individually — skip any 404s ───────────────
    const KNOWN_TABLES = ['members', 'members_deleted']
    for (const tbl of KNOWN_TABLES) {
      try {
        const { count, error } = await supabase.from(tbl).select('*', { count:'exact', head:true })
        if (!error) discovered.push({ id:`table::${tbl}`, label:tbl, type:'table', count:count||0, checked:false })
      } catch (_) {}
    }

    // ── 2. Storage: probe known bucket/folder paths directly ─────────────────
    // listBuckets() requires service role key — not available client-side.
    // Instead we probe known bucket+folder combos by attempting to list them.
    const KNOWN_STORAGE = [
      { bucket: 'member-photos', folder: 'active' },
      { bucket: 'member-photos', folder: 'deleted' },
    ]
    for (const { bucket, folder } of KNOWN_STORAGE) {
      try {
        const { data: files, error } = await supabase.storage.from(bucket).list(folder, { limit: 10000 })
        if (!error) {
          const fileCount = (files||[]).filter(f => f.metadata).length
          discovered.push({
            id:      `storage::${bucket}::${folder}`,
            label:   `${bucket} / ${folder}`,
            type:    'storage',
            count:   fileCount,
            checked: false
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

  async function doFlush() {
    const selected = items.filter(it => it.checked)
    if (selected.length === 0) { toast('Select at least one item to flush.', 'error'); return }

    // Password confirmation
    const ok = await askPassword(setPasswordModal)
    if (!ok) return

    setFlushing(true)
    try {
      for (const item of selected) {
        setProgress(`Flushing ${item.label}…`)
        if (item.type === 'table') {
          const tbl = item.id.replace('table::', '')
          const { error } = await supabase.from(tbl).delete().gte('created_at', '1970-01-01')
          if (error) throw new Error(`${tbl}: ${error.message}`)
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
      // Mark matching migration_history rows as flushed
      await supabase.from('migration_history')
        .update({ status:'flushed', flushed_at: new Date().toISOString() })
        .neq('status', 'flushed')
      toast(`${selected.length} item${selected.length>1?'s':''} flushed successfully.`, 'success')
      onDone()
      onClose()
    } catch (err) {
      toast(`Flush failed: ${err.message}`, 'error')
    } finally {
      setFlushing(false); setProgress('')
    }
  }

  if (!open) return null

  const allChecked = items.length > 0 && items.every(i => i.checked)
  const anyChecked = items.some(i => i.checked)

  return ReactDOM.createPortal(
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.5)',backdropFilter:'blur(6px)',WebkitBackdropFilter:'blur(6px)',zIndex:3000,display:'flex',alignItems:'center',justifyContent:'center',padding:24}}>
      <div style={{background:'#ffffff',borderRadius:'var(--border-radius-lg)',border:'0.5px solid var(--color-border-tertiary)',width:'100%',maxWidth:500,maxHeight:'75vh',display:'flex',flexDirection:'column',boxShadow:'0 24px 64px rgba(0,0,0,0.35)'}}>

        {/* Header */}
        <div style={{padding:'20px 20px 14px',borderBottom:'0.5px solid var(--color-border-tertiary)'}}>
          <p style={{margin:'0 0 2px',fontSize:15,fontWeight:500,color:'var(--color-text-primary)'}}>Flush data</p>
          <p style={{margin:0,fontSize:12,color:'var(--color-text-secondary)'}}>
            Select tables and storage folders to clear. Records only — table structures and folder containers are preserved.
          </p>
        </div>

        {/* Body */}
        <div style={{flex:1,overflowY:'auto',padding:'12px 20px'}}>
          {loading ? (
            <div style={{display:'flex',alignItems:'center',gap:8,padding:'20px 0',color:'var(--color-text-secondary)',fontSize:13}}>
              <Loader2 size={15} style={{animation:'spin 1s linear infinite'}}/> Scanning tables and storage…
            </div>
          ) : (
            <>
              {/* Select all */}
              <label style={{display:'flex',alignItems:'center',gap:10,padding:'8px 10px',borderRadius:'var(--border-radius-md)',background:'#f8fafc',marginBottom:10,cursor:'pointer',fontSize:12,fontWeight:500,color:'var(--color-text-secondary)'}}>
                <input type="checkbox" checked={allChecked} onChange={e=>toggleAll(e.target.checked)} style={{width:14,height:14,accentColor:'#2563eb'}}/>
                Select all
              </label>

              {/* Tables */}
              {items.filter(i=>i.type==='table').length > 0 && (
                <>
                  <p style={{margin:'0 0 6px',fontSize:10,fontWeight:500,textTransform:'uppercase',letterSpacing:'.06em',color:'var(--color-text-secondary)'}}>Database tables</p>
                  {items.filter(i=>i.type==='table').map(item => (
                    <label key={item.id} style={{display:'flex',alignItems:'center',gap:10,padding:'9px 10px',borderRadius:'var(--border-radius-md)',border:'0.5px solid var(--color-border-tertiary)',marginBottom:6,cursor:'pointer',background: item.checked ? '#EFF6FF' : '#ffffff'}}>
                      <input type="checkbox" checked={item.checked} onChange={()=>toggle(item.id)} style={{width:14,height:14,accentColor:'#2563eb',flexShrink:0}}/>
                      <Database size={13} style={{color:'var(--color-text-secondary)',flexShrink:0}}/>
                      <span style={{flex:1,fontSize:13,color:'var(--color-text-primary)',fontFamily:'var(--font-mono)'}}>{item.label}</span>
                      <span style={{fontSize:11,color:'var(--color-text-secondary)',flexShrink:0}}>{item.count.toLocaleString()} rows</span>
                    </label>
                  ))}
                </>
              )}

              {/* Storage */}
              {items.filter(i=>i.type==='storage').length > 0 && (
                <>
                  <p style={{margin:'10px 0 6px',fontSize:10,fontWeight:500,textTransform:'uppercase',letterSpacing:'.06em',color:'var(--color-text-secondary)'}}>Storage folders</p>
                  {items.filter(i=>i.type==='storage').map(item => (
                    <label key={item.id} style={{display:'flex',alignItems:'center',gap:10,padding:'9px 10px',borderRadius:'var(--border-radius-md)',border:'0.5px solid var(--color-border-tertiary)',marginBottom:6,cursor:'pointer',background: item.checked ? '#EFF6FF' : '#ffffff'}}>
                      <input type="checkbox" checked={item.checked} onChange={()=>toggle(item.id)} style={{width:14,height:14,accentColor:'#2563eb',flexShrink:0}}/>
                      <Camera size={13} style={{color:'var(--color-text-secondary)',flexShrink:0}}/>
                      <span style={{flex:1,fontSize:13,color:'var(--color-text-primary)',fontFamily:'var(--font-mono)'}}>{item.label}</span>
                      <span style={{fontSize:11,color:'var(--color-text-secondary)',flexShrink:0}}>{item.count.toLocaleString()} files</span>
                    </label>
                  ))}
                </>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div style={{padding:'12px 20px',borderTop:'0.5px solid var(--color-border-tertiary)',display:'flex',alignItems:'center',justifyContent:'space-between',gap:8}}>
          {flushing
            ? <p style={{margin:0,fontSize:12,color:'var(--color-text-secondary)',display:'flex',alignItems:'center',gap:6}}>
                <Loader2 size={12} style={{animation:'spin 1s linear infinite'}}/>{progress}
              </p>
            : <p style={{margin:0,fontSize:12,color:'var(--color-text-secondary)'}}>
                {anyChecked ? `${items.filter(i=>i.checked).length} item${items.filter(i=>i.checked).length>1?'s':''} selected` : 'Nothing selected'}
              </p>
          }
          <div style={{display:'flex',gap:8}}>
            <button onClick={onClose} disabled={flushing}
              style={{fontSize:12,padding:'6px 14px',border:'0.5px solid var(--color-border-secondary)',borderRadius:'var(--border-radius-md)',background:'none',color:'var(--color-text-secondary)',cursor:'pointer'}}>
              Cancel
            </button>
            <button onClick={doFlush} disabled={!anyChecked||flushing||loading}
              style={{fontSize:12,padding:'6px 14px',border:'none',borderRadius:'var(--border-radius-md)',background: anyChecked&&!flushing ? '#dc2626':'#dc262680',color:'#fff',cursor: anyChecked&&!flushing ?'pointer':'default',display:'flex',alignItems:'center',gap:6}}>
              {flushing ? <Loader2 size={12} style={{animation:'spin 1s linear infinite'}}/> : <Trash2 size={12}/>}
              {flushing ? 'Flushing…' : 'Flush selected'}
            </button>
          </div>
        </div>
      </div>
    </div>,
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
// NOTE: .neq('id',0) fails on UUID primary keys. Use .gte('created_at',...)
// as a universally true filter that works regardless of PK type.
async function eraseCategory(category) {
  if (category === 'members') {
    const { error } = await supabase.from('members').delete().gte('created_at', '1970-01-01')
    if (error) throw new Error(error.message)
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
  const date = d.toLocaleDateString('en-IN', { ...opts, day:'2-digit', month:'short', year:'numeric' })
  const time = d.toLocaleTimeString('en-IN', { ...opts, hour:'2-digit', minute:'2-digit' })
  return date + ', ' + time
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
    <div style={{background:'var(--color-background-primary)',border:'0.5px solid var(--color-border-tertiary)',borderRadius:'var(--border-radius-lg)',display:'flex',flexDirection:'column',height:'100%',overflow:'hidden'}}>
      {/* Header */}
      <div style={{padding:'14px 16px 12px',borderBottom:'0.5px solid var(--color-border-tertiary)'}}>
        <p style={{margin:0,fontSize:13,fontWeight:500,color:'var(--color-text-primary)'}}>Import Board</p>
        {history.length > 0
          ? <p style={{margin:'3px 0 0',fontSize:11,color:'var(--color-text-secondary)',lineHeight:1.4}}>
              {history.length} import{history.length!==1?'s':''}
              {totalRecords>0?` · ${totalRecords.toLocaleString()} records`:''}
              {totalPhotos >0?` · ${totalPhotos.toLocaleString()} photos`:''}
            </p>
          : <p style={{margin:'3px 0 0',fontSize:11,color:'var(--color-text-secondary)'}}>No active imports</p>
        }
      </div>

      {/* Rows */}
      <div style={{flex:1,overflowY:'auto',padding:'8px 0'}}>
        {loading ? (
          <div style={{display:'flex',justifyContent:'center',padding:'40px 0'}}>
            <Loader2 size={18} style={{animation:'spin 1s linear infinite',color:'var(--color-text-secondary)'}}/>
          </div>
        ) : history.length === 0 ? (
          <div style={{padding:'40px 16px',textAlign:'center'}}>
            <Database size={28} style={{color:'var(--color-text-secondary)',opacity:0.3,margin:'0 auto 10px',display:'block'}}/>
            <p style={{margin:0,fontSize:12,color:'var(--color-text-secondary)'}}>Nothing imported yet</p>
          </div>
        ) : history.map(entry => {
          const bs = badgeStyle(entry.category)
          const isFlushing = flushingId === entry.id
          return (
            <div key={entry.id} style={{padding:'10px 16px',borderBottom:'0.5px solid var(--color-border-tertiary)',display:'flex',flexDirection:'column',gap:5}}>
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:8}}>
                <span style={{display:'inline-flex',alignItems:'center',gap:5,fontSize:11,fontWeight:500,padding:'3px 8px',borderRadius:20,background:bs.bg,color:bs.color,flexShrink:0}}>
                  <span style={{width:6,height:6,borderRadius:'50%',background:bs.dot,flexShrink:0}}/>
                  {entry.source_file || entry.category}
                </span>
                <button onClick={()=>onFlushRow(entry)} disabled={!!flushingId}
                  title="Delete all records in this category"
                  style={{background:'none',border:'none',cursor:'pointer',padding:4,color:'var(--color-text-secondary)',opacity:!!flushingId?0.3:1,display:'flex',alignItems:'center'}}>
                  {isFlushing
                    ? <Loader2 size={13} style={{animation:'spin 1s linear infinite',color:'#E24B4A'}}/>
                    : <Trash2 size={13}/>}
                </button>
              </div>
              <p style={{margin:0,fontSize:13,fontWeight:500,color:'var(--color-text-primary)'}}>
                {recordLabel(entry.category, entry.records_succeeded)}
              </p>
              <p style={{margin:0,fontSize:11,color:'var(--color-text-secondary)'}}>
                {fmtDateTime(entry.performed_at)}
              </p>
              {entry.performed_by && (
                <p style={{margin:0,fontSize:10,color:'var(--color-text-secondary)',opacity:0.7}}>
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
  const fileRef = useRef(null)
  const [step, setStep] = useState(1)
  const [wb, setWb] = useState(null)
  const [sheetName, setSheetName] = useState('')
  const [headers, setHeaders] = useState([])
  const [rows, setRows] = useState([])
  const [progress, setProgress] = useState(0)
  const [result, setResult] = useState(null)
  const [importing, setImporting] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [importError, setImportError] = useState(null)

  async function handleFile(file) {
    if (!file) return
    const XLSX = await import('xlsx')
    const data = await file.arrayBuffer()
    const workbook = XLSX.read(data, { type:'array', cellDates:true })
    setWb(workbook)
    setImportError(null)
    const membersSheet = workbook.SheetNames.find(n=>n.toLowerCase().includes('member'))
    if (membersSheet) { setSheetName(membersSheet); loadSheet(workbook, membersSheet) }
    setStep(2)
  }

  function loadSheet(workbook, name) {
    setImportError(null)
    import('xlsx').then(XLSX => {
      const ws = workbook.Sheets[name]
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

  async function doImport() {
    setImportError(null)

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
    const records = validRows.map(row => {
      const rec = { is_active: true }
      row.forEach((cell, idx) => {
        const dbCol = mapHeader(idx)
        if (!dbCol || SKIP.includes(dbCol)) return
        const v = cleanVal(cell, dbCol)
        if (v !== null) rec[dbCol] = v
        else if (ACT_COLS.includes(dbCol)) rec[dbCol] = false
      })
      return rec
    }).filter(r => String(r.member_id ?? '').trim() && String(r.member_name ?? '').trim())

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
      // Truncate staging BEFORE inserting
      await supabase.from('members_staging').delete().gte('created_at', '1970-01-01')

      const { error: stagingError } = await supabase.from('members_staging').insert(dedupedRecords)
      if (stagingError) throw new Error(`Staging insert failed: ${stagingError.message}`)

      const { error: swapError } = await supabase.rpc('atomic_swap_members')
      if (swapError) throw new Error(`Atomic swap failed: ${swapError.message}`)

      // Only log on success
      await logMigration('members', sheetName, 'success', dedupedRecords.length, dedupedRecords.length, 0)
      setResult({ total: dedupedRecords.length, inserted: dedupedRecords.length, errors: 0, dups: dupCount })
      toast(`${records.length} members imported successfully.`, 'success')
      onRefreshBoard?.()
    } catch (err) {
      console.error(err)
      // Do NOT log failed attempts to migration_history
      setImportError(err.message)
      setStep(3)
      toast(`Import failed: ${err.message}`, 'error')
    } finally {
      setImporting(false)
      await supabase.from('members_staging').delete().gte('created_at', '1970-01-01')
    }
  }

  function reset() {
    setWb(null);setSheetName('');setHeaders([]);setRows([]);setProgress(0)
    setResult(null);setStep(1);setImporting(false);setImportError(null)
  }

  // Preview uses DB column name derived by position
  const previewCols = headers
    .map((h, i) => ({ header: h, dbCol: mapHeader(i), idx: i }))
    .filter(({ dbCol }) => dbCol && !SKIP.includes(dbCol))
    .slice(0, 8)

  return (
    <div className="space-y-5">
      {/* Steps */}
      <div className="flex items-center gap-0">
        {[['1','Upload'],['2','Select sheet'],['3','Preview'],['4','Import']].map(([n,l],i)=>(
          <div key={n} className="flex items-center flex-1">
            <div className="flex items-center gap-1.5">
              <div className={'w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold '+(step>parseInt(n)?'bg-green-500 text-white':(step===parseInt(n)?'bg-blue-600 text-white':'bg-slate-100 text-slate-400'))}>
                {step>parseInt(n)?'✓':n}
              </div>
              <span className={'text-xs font-semibold '+(step===parseInt(n)?'text-blue-600':step>parseInt(n)?'text-green-600':'text-slate-400')}>{l}</span>
            </div>
            {i<3&&<div className="flex-1 h-px bg-slate-200 mx-2"/>}
          </div>
        ))}
      </div>

      {/* Step 1: Upload */}
      <div className="card p-5">
        <p className="form-section form-section-blue">Step 1 — Upload Excel file</p>
        <div className={'rounded-xl p-8 text-center cursor-pointer transition-all border-2 border-dashed '+(dragOver?'border-blue-400 bg-blue-50':(wb?'border-green-400 bg-green-50':'border-slate-200 bg-slate-50 hover:border-blue-300 hover:bg-blue-50/50'))}
          onClick={()=>fileRef.current?.click()}
          onDragOver={e=>{e.preventDefault();setDragOver(true)}}
          onDragLeave={()=>setDragOver(false)}
          onDrop={e=>{e.preventDefault();setDragOver(false);const f=e.dataTransfer.files[0];if(f)handleFile(f)}}>
          <FileSpreadsheet size={36} className={'mx-auto mb-3 '+(wb?'text-green-500':'text-slate-300')}/>
          <p className="text-sm font-semibold text-slate-700">{wb?'File loaded ✓ — click to change':'Click or drag to upload'}</p>
          <p className="text-xs text-slate-400 mt-1">Main.xlsm or any .xlsx / .xls</p>
        </div>
        <input ref={fileRef} type="file" accept=".xlsx,.xlsm,.xls" className="hidden" onChange={e=>handleFile(e.target.files[0])}/>
      </div>

      {/* Step 2: Sheet select */}
      {step>=2 && wb && (
        <div className="card p-5">
          <p className="form-section form-section-blue">Step 2 — Select worksheet</p>
          <div className="flex flex-wrap gap-2">
            {wb.SheetNames.map(name=>(
              <label key={name} className={'flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer text-sm font-medium transition-all '+(sheetName===name?'border-blue-500 bg-blue-50 text-blue-700':'border-slate-200 text-slate-600 hover:border-slate-300')}>
                <input type="radio" name="sheet" value={name} checked={sheetName===name} onChange={()=>{setSheetName(name);loadSheet(wb,name)}} style={{accentColor:'#2563eb'}}/>
                {name}
                {name.toLowerCase().includes('member')&&<span className="text-[10px] bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded font-bold">Recommended</span>}
              </label>
            ))}
          </div>
        </div>
      )}

      {/* Error banner */}
      {importError && (
        <div style={{display:'flex',gap:10,alignItems:'flex-start',padding:'12px 14px',background:'#FCEBEB',border:'0.5px solid #F7C1C1',borderRadius:'var(--border-radius-md)'}}>
          <AlertTriangle size={16} style={{color:'#A32D2D',flexShrink:0,marginTop:1}}/>
          <div>
            <p style={{margin:'0 0 2px',fontSize:13,fontWeight:500,color:'#791F1F'}}>Import failed</p>
            <p style={{margin:0,fontSize:12,color:'#A32D2D',lineHeight:1.5}}>{importError}</p>
          </div>
        </div>
      )}

      {/* Step 3: Preview */}
      {step>=3 && rows.length>0 && (
        <div className="card p-5">
          <p className="form-section form-section-blue">Step 3 — Preview ({rows.length} rows from "{sheetName}")</p>
          <div className="overflow-x-auto rounded-xl border border-slate-200 mb-4" style={{maxHeight:280}}>
            <table style={{width:'100%',borderCollapse:'collapse',fontSize:11}}>
              <thead>
                <tr>
                  {previewCols.map(({header, dbCol})=>(
                    <th key={dbCol} style={{textAlign:'left',padding:'8px 10px',fontSize:10,fontWeight:700,textTransform:'uppercase',letterSpacing:'.05em',color:'#94a3b8',background:'#f8fafc',borderBottom:'1px solid #e2e8f0',whiteSpace:'nowrap'}}>
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.slice(0,5).map((row,i)=>(
                  <tr key={i}>
                    {previewCols.map(({header, idx})=>(
                      <td key={header} style={{padding:'7px 10px',borderBottom:'1px solid #f1f5f9',color:'#334155',maxWidth:120,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                        {row[idx]||'-'}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex gap-2">
            <button onClick={doImport} disabled={importing} className="btn btn-primary">
              {importing?<><Loader2 size={13} className="animate-spin"/>Importing...</>:<><CheckCircle size={13}/>Confirm &amp; import {rows.length} members</>}
            </button>
            <button onClick={reset} className="btn btn-secondary"><RefreshCw size={13}/>Start over</button>
          </div>
        </div>
      )}

      {/* Step 4: Result */}
      {step>=4 && result && (
        <div className="card p-5">
          <p className="form-section form-section-blue">Import complete — "{sheetName}"</p>
          <div className="grid grid-cols-3 gap-3 mb-4">
            {[['Imported',result.inserted,'#16a34a'],['Errors',result.errors,result.errors?'#dc2626':'#16a34a'],['Total',result.total,'#2563eb']].map(([l,v,c])=>(
              <div key={l} className="card p-4 text-center"><p className="font-display text-3xl font-bold" style={{color:c}}>{v}</p><p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mt-1">{l}</p></div>
            ))}
          </div>
          {result.dups > 0 && (
            <div style={{display:'flex',gap:8,alignItems:'center',padding:'8px 12px',background:'#FAEEDA',border:'0.5px solid #FAC775',borderRadius:'var(--border-radius-md)',marginBottom:12}}>
              <AlertTriangle size={13} style={{color:'#854F0B',flexShrink:0}}/>
              <p style={{margin:0,fontSize:12,color:'#854F0B'}}>
                {result.dups} duplicate Member ID{result.dups>1?'s':''} found in the sheet — last occurrence was kept for each.
              </p>
            </div>
          )}
          <div className="flex gap-2">
            <a href="/members" className="btn btn-primary btn-sm">View members</a>
            <button onClick={reset} className="btn btn-secondary btn-sm">Import another file</button>
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
              style={{fontSize:11,padding:'3px 10px',border:'0.5px solid #F7C1C1',borderRadius:'var(--border-radius-md)',background:'#FCEBEB',color:'#A32D2D',cursor:'pointer',display:'flex',alignItems:'center',gap:4}}>
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

// ── MAIN PAGE ─────────────────────────────────────────────────────────────────
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

    // ── Tables: probe each individually — skip any that return 404/error ──────
    const KNOWN_TABLES = ['members', 'members_deleted']
    for (const tbl of KNOWN_TABLES) {
      try {
        const { count, error } = await supabase.from(tbl).select('*', { count:'exact', head:true })
        if (!error) newStats.push({ label: tbl, count: count || 0 })
      } catch (_) {}
    }

    // ── Storage: probe known bucket/folder paths directly ────────────────────
    const KNOWN_STORAGE = [
      { bucket: 'member-photos', folder: 'active' },
      { bucket: 'member-photos', folder: 'deleted' },
    ]
    for (const { bucket, folder } of KNOWN_STORAGE) {
      try {
        const { data: files, error } = await supabase.storage.from(bucket).list(folder, { limit: 10000 })
        if (!error) newStats.push({ label: `${bucket} / ${folder}`, count: (files||[]).filter(f=>f.metadata).length })
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
      {/* Header */}
      <div className="mb-6" style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',gap:12}}>
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900 tracking-tight">Migration Dashboard</h1>
          <p className="text-xs text-slate-400 mt-0.5">Import worksheets and photos · Monitor all imports on the board</p>
        </div>
        <button onClick={()=>setFlushAllModal(true)}
          style={{flexShrink:0,display:'flex',alignItems:'center',gap:6,padding:'8px 16px',fontSize:13,fontWeight:500,border:'0.5px solid #F7C1C1',borderRadius:'var(--border-radius-md)',background:'#FCEBEB',color:'#A32D2D',cursor:'pointer',marginTop:4}}>
          <Trash2 size={13}/> Flush All
        </button>
      </div>

      {/* Stats tiles — dynamic, auto-sizing, queries live counts */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))',gap:12,marginBottom:24}}>
        {stats.map(s => (
          <div key={s.label} style={{background:'var(--color-background-primary)',border:'0.5px solid var(--color-border-tertiary)',borderRadius:'var(--border-radius-lg)',padding:'12px 16px',textAlign:'center'}}>
            <p style={{margin:'0 0 4px',fontSize:11,color:'var(--color-text-secondary)',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{s.label}</p>
            <p style={{margin:0,fontSize:24,fontWeight:700,color:'var(--color-text-primary)',lineHeight:1.2}}>{s.count.toLocaleString()}</p>
          </div>
        ))}
        {stats.length === 0 && [1,2,3].map(i => (
          <div key={i} style={{background:'var(--color-background-secondary)',border:'0.5px solid var(--color-border-tertiary)',borderRadius:'var(--border-radius-lg)',padding:'12px 16px',textAlign:'center',opacity:0.4}}>
            <p style={{margin:'0 0 4px',fontSize:11,color:'var(--color-text-secondary)'}}>—</p>
            <p style={{margin:0,fontSize:24,fontWeight:700,color:'var(--color-text-primary)'}}>…</p>
          </div>
        ))}
      </div>

      {/* Split layout: left = tools · right = board */}
      <div style={{display:'grid', gridTemplateColumns:'1fr 300px', gap:20, alignItems:'start'}}>

        {/* LEFT: import tools */}
        <div>
          <div className="flex border-b border-slate-200 mb-5">
            <button onClick={()=>setTab('import')}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 transition-all ${tab==='import'?'border-blue-600 text-blue-600':'border-transparent text-slate-400 hover:text-slate-600'}`}>
              <FileSpreadsheet size={15}/> Import Excel
            </button>
            <button onClick={()=>setTab('photos')}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 transition-all ${tab==='photos'?'border-blue-600 text-blue-600':'border-transparent text-slate-400 hover:text-slate-600'}`}>
              <Image size={15}/> Upload Photos
            </button>
          </div>
          {tab === 'import' && <ImportTab onRefreshBoard={() => { loadHistory(); refreshStats() }} setPasswordModal={setPasswordModal}/>}
          {tab === 'photos' && <PhotosTab onRefreshBoard={() => { loadHistory(); refreshStats() }}/>}
        </div>

        {/* RIGHT: sticky import board */}
        <div style={{position:'sticky', top:20, height:'calc(100vh - 220px)'}}>
          <ImportBoard
            history={history}
            loading={historyLoading}
            onFlushRow={flushRow}
            flushingId={flushingId}
          />
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
      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    </div>
  )
}
