import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase, photoUrl } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { getPerms, fmtDate, initials } from '../lib/auth'
import { useToast } from '../lib/toast'
import { Search, UserPlus, Printer, Users, Loader2, UserX, Save, RotateCcw, Trash2, Upload, FileSpreadsheet, Archive } from 'lucide-react'
import { getZones } from '../lib/zones'
import MemberPrintModal from './MemberPrintModal'
import BulkPrintModal  from './BulkPrintModal'
import FamilyRecordsModal from './FamilyRecordsModal'
import DeleteMemberModal from './DeleteMemberModal'

const BATCH_SIZE = 1000 // Supabase max per request
// ZONES loaded from church_zones table at runtime (see useEffect in MembersPage)
const SECTORS=['Government','Private','Self Employed','Business','Student','Home Maker','Retired','Not Working','Diocese - Government','Diocese - Private']
const RELS=['Self','Spouse','Son','Daughter','Father','Mother','Brother','Sister','Son-in-law','Daughter-in-law','Grandson','Granddaughter','Others']
const DENOMS=['CSI','CNI','Catholic','Pentecostal','Methodist','Baptist','Others']
const ACTS=[
  ['act_mens_fellowship',"Men's Fellowship"],['act_womens_fellowship',"Women's Fellowship"],
  ['act_youth_association','Youth Association'],['act_sunday_school','Sunday School'],
  ['act_choir','Choir'],['act_pastorate_committee','Pastorate Committee'],
  ['act_village_ministry','Village Ministry'],['act_dcc','DCC'],
  ['act_dc','DC'],['act_volunteers','Volunteers'],['act_others','Others'],
]
const ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')

const EMPTY = {
  family_id:'',member_id:'',title:'',member_name:'',father_name:'',gender:'',aadhaar:'',
  dob_actual:'',dob_certificate:'',marital_status:'',date_of_marriage:'',spouse_name:'',
  address_street:'',area_1:'',area_2:'',city:'Trichy',state:'Tamil Nadu',zonal_area:'',
  mobile:'',whatsapp:'',email:'',qualification:'',profession:'',working_sector:'',
  is_first_gen_christian:'',is_family_head:'',relationship_with_fh:'',membership_type:'',
  primary_church_name:'',denomination:'CSI',membership_from_year:'',baptism_type:'',
  baptism_date:'',confirmation_taken:'',confirmation_date:'',is_fbrf_member:'',
  ...Object.fromEntries(ACTS.map(([k])=>[k,false]))
}

function Sel({id,value,onChange,options,placeholder='— Select —'}) {
  return (
    <select id={id} value={value||''} onChange={e=>onChange(e.target.value)}
      className="field-input" style={{appearance:'none',backgroundImage:"url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%2394a3b8' d='M6 8L1 3h10z'/%3E%3C/svg%3E\")",backgroundRepeat:'no-repeat',backgroundPosition:'right 10px center',paddingRight:28}}>
      <option value="">{placeholder}</option>
      {options.map(o=><option key={o} value={o}>{o}</option>)}
    </select>
  )
}

export default function MembersPage() {
  const { profile } = useAuth()
  const toast = useToast()
  const perms = getPerms(profile?.role)
  const fileRef = useRef(null)
  const navigate = useNavigate()

  const [tab, setTab] = useState('list')
  const [members, setMembers] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [searchCol, setSearchCol] = useState('all')
  const [searchVal, setSearchVal] = useState('')
  const [alpha, setAlpha] = useState('')
  const [selected, setSelected] = useState(null)
  const [form, setForm] = useState(EMPTY)
  const [saving, setSaving] = useState(false)
  const [photoFile, setPhotoFile] = useState(null)
  const [photoPreview, setPhotoPreview] = useState(null)
  const [showSaveDialog, setShowSaveDialog] = useState(false)
  const [showDelDialog, setShowDelDialog] = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [showPrintModal,         setShowPrintModal]         = useState(false)
  const [showBulkPrintModal,     setShowBulkPrintModal]     = useState(false)
  const [showFamilyRecordsModal, setShowFamilyRecordsModal] = useState(false)
  const [saveType, setSaveType] = useState('new')
  const [oldMemberId, setOldMemberId] = useState('')
  const [changeReason, setChangeReason] = useState('')
  const [restoredInfo, setRestoredInfo] = useState(null)   // { restore_reason, restored_by, restored_at }
  const [restoredIds, setRestoredIds] = useState(new Set()) // member_ids that were reinstated
  const searchTimer = useRef(null)
  const [memberIdSuggestions, setMemberIdSuggestions] = useState([])
  const [showMemberIdPopup, setShowMemberIdPopup] = useState(false)
  const memberIdSuggestTimer = useRef(null)
  const [zones, setZones] = useState([])

  const loadMembers = useCallback(async (ac=alpha, col=searchCol, val=searchVal) => {
    setLoading(true)
    const buildQuery = (from, to) => {
      let q = supabase.from('members')
        .select('*', { count: 'exact' })
        .eq('is_active', true).order('member_id', { ascending: true })
        .range(from, to)
      if (ac) q = q.ilike('family_id', ac + '%')
      if (val.trim()) {
        if (col === 'all') q = q.or(`family_id.ilike.%${val}%,member_id.ilike.%${val}%,member_name.ilike.%${val}%,mobile.ilike.%${val}%`)
        else if (col === 'member_id') q = q.ilike('member_id', `%${val}%`)
        else q = q.ilike(col, `%${val}%`)
      }
      return q
    }
    // First batch also fetches total count
    const { data: firstBatch, count } = await buildQuery(0, BATCH_SIZE - 1)
    const totalCount = count || 0
    let allData = firstBatch || []
    // Fetch remaining batches in parallel if needed
    if (totalCount > BATCH_SIZE) {
      const extraFetches = []
      for (let from = BATCH_SIZE; from < totalCount; from += BATCH_SIZE) {
        extraFetches.push(buildQuery(from, from + BATCH_SIZE - 1))
      }
      const results = await Promise.all(extraFetches)
      results.forEach(r => { if (r.data) allData = allData.concat(r.data) })
    }
    setMembers(allData); setTotal(totalCount); setLoading(false)

    // Fetch which of these member_ids were restored from deleted_members
    if (allData.length) {
      const ids = allData.map(m => m.member_id)
      const { data: restored } = await supabase
        .from('deleted_members')
        .select('member_id')
        .in('member_id', ids)
        .not('restored_at', 'is', null)
      setRestoredIds(new Set((restored || []).map(r => r.member_id)))
    }
  }, [])

  useEffect(() => { getZones().then(rows => setZones(rows.map(z => z.zone_name))).catch(() => {}) }, [])
  useEffect(() => { loadMembers(alpha, searchCol, searchVal) }, [alpha, searchCol])
  useEffect(() => {
    clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => { loadMembers(alpha, searchCol, searchVal) }, 300)
  }, [searchVal])

  const selectRow = async id => {
    const { data } = await supabase.from('members').select('*').eq('member_id',id).single()
    setSelected(data); setForm({...EMPTY,...data})
    setPhotoPreview(null); setPhotoFile(null)
    // Load photo
    const url = photoUrl(id)
    if (url) setPhotoPreview(url)
    // Check if this member was restored from deleted_members
    setRestoredInfo(null)
    const { data: rd, error: rdErr } = await supabase
      .from('deleted_members')
      .select('*')
      .eq('member_id', id)
      .not('restored_at', 'is', null)
      .order('restored_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    console.log('[restoredInfo] for', id, rd, rdErr)
    if (rd) {
      // Normalise field names — RPC may store reason under different keys
      setRestoredInfo({
        restore_reason: rd.restore_reason || rd.restored_reason || rd.reason || null,
        restored_by:    rd.restored_by   || rd.restored_by_email || null,
        restored_at:    rd.restored_at,
      })
    }
    setTab('form')
  }

  const newMember = () => {
    setSelected(null); setForm(EMPTY); setPhotoPreview(null); setPhotoFile(null); setRestoredInfo(null)
    setMemberIdSuggestions([]); setShowMemberIdPopup(false)
    setTab('form')
  }

  const s = (k,v) => setForm(f=>({...f,[k]:v}))

  const onMemberIdChange = (val) => {
    s('member_id', val)
    clearTimeout(memberIdSuggestTimer.current)
    if (!val.trim()) { setShowMemberIdPopup(false); return }
    memberIdSuggestTimer.current = setTimeout(async () => {
      // If family_id is already filled use it; otherwise match member_id prefix
      const familyId = form.family_id?.trim()
      let rows = []
      if (familyId) {
        const { data } = await supabase
          .from('members').select('member_id,member_name')
          .eq('family_id', familyId).eq('is_active', true)
          .order('member_id', { ascending: true })
        rows = data || []
      } else if (val.length >= 2) {
        const { data } = await supabase
          .from('members').select('member_id,member_name')
          .ilike('member_id', `${val}%`).eq('is_active', true)
          .order('member_id', { ascending: true }).limit(20)
        rows = data || []
      }
      setMemberIdSuggestions(rows)
      setShowMemberIdPopup(rows.length > 0)
    }, 300)
  }

  const onPhoto = e => {
    const f = e.target.files[0]; if(!f) return
    setPhotoFile(f); setPhotoPreview(URL.createObjectURL(f))
  }

  const doSave = async () => {
    setSaving(true)
    let age = null
    if (form.dob_actual) {
      const d=new Date(form.dob_actual),t=new Date()
      age=t.getFullYear()-d.getFullYear()
      if (t.getMonth()-d.getMonth()<0||(t.getMonth()===d.getMonth()&&t.getDate()<d.getDate())) age--
    }
    let photo_url = form.photo_url
    if (photoFile) {
      const ext=photoFile.name.split('.').pop()
      const path=`active/${form.member_id}.${ext}`
      const { error:upe } = await supabase.storage.from('member-photos').upload(path,photoFile,{upsert:true})
      if (!upe) { const {data:pd} = supabase.storage.from('member-photos').getPublicUrl(path); photo_url=pd.publicUrl }
    }
    const isNewMigrant = !selected && saveType === 'migrant'
    const record = { ...form, age, photo_url,
      old_member_id: isNewMigrant ? oldMemberId : null,
      change_reason: isNewMigrant ? changeReason : null,
      last_modified_by: profile?.full_name, last_modified_at: new Date().toISOString()
    }
    let err
    if (selected) { const r = await supabase.from('members').update(record).eq('member_id',form.member_id); err=r.error }
    else { const r = await supabase.from('members').insert({...record,is_active:true}); err=r.error }
    setSaving(false); setShowSaveDialog(false)
    if (err) toast('Save failed: '+err.message,'error')
    else { toast(form.member_name+' saved.','success'); setTab('list'); loadMembers(alpha,searchCol,searchVal) }
  }

  const doDelete = async () => {
    const {error} = await supabase.from('members').update({is_active:false}).eq('member_id',selected.member_id)
    setShowDelDialog(false)
    if (error) toast('Delete failed.','error')
    else { toast(selected.member_name+' deleted.','success'); setTab('list'); loadMembers() }
  }

  const [exporting, setExporting] = useState(false)

  const exportExcel = async () => {
    setExporting(true)
    try {
      const ExcelJS = (await import('https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js')).default || window.ExcelJS

      // Fetch ALL columns (not just list-view columns) for the current filter
      const fetchAllFull = async () => {
        const buildQ = (from, to) => {
          let q = supabase.from('members').select('*', { count: 'exact' })
            .eq('is_active', true).order('member_id', { ascending: true })
            .range(from, to)
          if (alpha) q = q.ilike('family_id', alpha + '%')
          if (searchVal.trim()) {
            if (searchCol === 'all') q = q.or(`family_id.ilike.%${searchVal}%,member_id.ilike.%${searchVal}%,member_name.ilike.%${searchVal}%,mobile.ilike.%${searchVal}%`)
            else if (searchCol === 'member_id') q = q.eq('member_id', searchVal)
            else q = q.ilike(searchCol, `%${searchVal}%`)
          }
          return q
        }
        const { data: first, count } = await buildQ(0, BATCH_SIZE - 1)
        let all = first || []
        if ((count || 0) > BATCH_SIZE) {
          const extras = []
          for (let f = BATCH_SIZE; f < count; f += BATCH_SIZE) extras.push(buildQ(f, f + BATCH_SIZE - 1))
          const results = await Promise.all(extras)
          results.forEach(r => { if (r.data) all = all.concat(r.data) })
        }
        return all
      }

      const fullData = await fetchAllFull()

      // Fetch ALL deleted_members rows (select * avoids column-name guessing)
      // then build a map keyed by member_id — most-recent entry wins
      let dmMap = {}
      let dmPageFrom = 0
      const DM_PAGE = 1000
      while (true) {
        const { data: dmRows, error: dmErr } = await supabase
          .from('deleted_members')
          .select('*')
          .order('deleted_at', { ascending: false })
          .range(dmPageFrom, dmPageFrom + DM_PAGE - 1)
        if (dmErr || !dmRows?.length) break
        dmRows.forEach(r => { if (r.member_id && !dmMap[r.member_id]) dmMap[r.member_id] = r })
        if (dmRows.length < DM_PAGE) break
        dmPageFrom += DM_PAGE
      }

      // Helper: pick first truthy value from candidate keys
      const pick = (obj, ...keys) => { for (const k of keys) if (obj?.[k]) return obj[k]; return '' }

      // Resolve email → display name via profiles (covers last_modified_by, deleted_by, restored_by)
      const emailSet = new Set()
      fullData.forEach(m => { if (m.last_modified_by?.includes('@')) emailSet.add(m.last_modified_by) })
      Object.values(dmMap).forEach(dm => {
        const db = pick(dm, 'deleted_by', 'deleted_by_email')
        const rb = pick(dm, 'restored_by', 'restored_by_email')
        if (db?.includes('@')) emailSet.add(db)
        if (rb?.includes('@')) emailSet.add(rb)
      })
      let nameMap = {}
      if (emailSet.size) {
        const { data: profs } = await supabase.from('profiles').select('email,full_name').in('email', [...emailSet])
        ;(profs || []).forEach(p => { if (p.email && p.full_name) nameMap[p.email] = p.full_name })
      }
      const n = v => nameMap[v] || v || ''

      // Merge into fullData as virtual fields
      const mergedData = fullData.map(m => {
        const dm = dmMap[m.member_id]
        return {
          ...m,
          last_modified_by:   n(m.last_modified_by),
          _dm_deleted_reason: pick(dm, 'deleted_reason', 'reason', 'delete_reason'),
          _dm_deleted_by:     n(pick(dm, 'deleted_by', 'deleted_by_email')),
          _dm_deleted_at:     dm?.deleted_at   || '',
          _dm_restore_reason: pick(dm, 'restore_reason', 'restored_reason', 'reinstate_reason'),
          _dm_restored_by:    n(pick(dm, 'restored_by', 'restored_by_email')),
          _dm_restored_at:    dm?.restored_at  || '',
        }
      })

      const cols = [
        { key: 'member_id',             label: 'Member ID',             left: false },
        { key: 'family_id',             label: 'Family ID',             left: false },
        { key: 'title',                 label: 'Title',                 left: false },
        { key: 'member_name',           label: 'Full Name',             left: true  },
        { key: 'father_name',           label: "Father's Name",         left: true  },
        { key: 'gender',                label: 'Gender',                left: false },
        { key: 'aadhaar',               label: 'Aadhaar',               left: false },
        { key: 'dob_actual',            label: 'DOB (Actual)',          left: false },
        { key: 'dob_certificate',       label: 'DOB (Certificate)',     left: false },
        { key: 'age',                   label: 'Age',                   left: false },
        { key: 'marital_status',        label: 'Marital Status',        left: false },
        { key: 'date_of_marriage',      label: 'Date of Marriage',      left: false },
        { key: 'spouse_name',           label: 'Spouse Name',           left: true  },
        { key: 'address_street',        label: 'Street',                left: true  },
        { key: 'area_1',                label: 'Area 1',                left: true  },
        { key: 'area_2',                label: 'Area 2',                left: true  },
        { key: 'city',                  label: 'City',                  left: false },
        { key: 'state',                 label: 'State',                 left: false },
        { key: 'zonal_area',            label: 'Zone',                  left: false },
        { key: 'mobile',                label: 'Mobile',                left: false },
        { key: 'whatsapp',              label: 'WhatsApp',              left: false },
        { key: 'email',                 label: 'Email',                 left: true  },
        { key: 'qualification',         label: 'Qualification',         left: false },
        { key: 'profession',            label: 'Profession',            left: false },
        { key: 'working_sector',        label: 'Working Sector',        left: false },
        { key: 'is_first_gen_christian',label: 'First Gen Christian?',  left: false },
        { key: 'is_family_head',        label: 'Family Head?',          left: false },
        { key: 'relationship_with_fh',  label: 'Relation to Family Head', left: false },
        { key: 'membership_type',       label: 'Membership Type',       left: false },
        { key: 'primary_church_name',   label: 'Primary Church',        left: true  },
        { key: 'denomination',          label: 'Denomination',          left: false },
        { key: 'membership_from_year',  label: 'Member Since',          left: false },
        { key: 'baptism_type',          label: 'Baptism Type',          left: false },
        { key: 'baptism_date',          label: 'Baptism Date',          left: false },
        { key: 'confirmation_taken',    label: 'Confirmation?',         left: false },
        { key: 'confirmation_date',     label: 'Confirmation Date',     left: false },
        { key: 'is_fbrf_member',        label: 'FBRF Member?',          left: false },
        ...ACTS.map(([k, l]) => ({ key: k, label: l, left: false })),
        { key: 'last_modified_by',      label: 'Modified By',           left: true  },
        { key: 'last_modified_at',      label: 'Modified At',           left: false },
        { key: 'created_at',            label: 'Created At',            left: false },
        { key: 'old_member_id',         label: 'Old Member ID',         left: false },
        { key: 'change_reason',         label: 'Change Reason',         left: true  },
        // ── Deletion & Reinstatement (sourced from deleted_members) ──
        { key: '_dm_deleted_reason',    label: 'Deletion Reason',       left: true  },
        { key: '_dm_deleted_by',        label: 'Deleted By',            left: true  },
        { key: '_dm_deleted_at',        label: 'Deleted On',            left: false },
        { key: '_dm_restore_reason',    label: 'Reinstatement Reason',  left: true  },
        { key: '_dm_restored_by',       label: 'Reinstated By',         left: true  },
        { key: '_dm_restored_at',       label: 'Reinstated On',         left: false },
      ]

      // ── ExcelJS workbook ──────────────────────────────────────────
      const wb = new ExcelJS.Workbook()
      wb.creator = 'Church Members App'
      wb.created = new Date()
      const sheetName = alpha ? `Members - ${alpha}` : 'All Members'
      const ws = wb.addWorksheet(sheetName, { views: [{ state: 'frozen', ySplit: 1 }] })

      // Column definitions with auto-width estimation
      ws.columns = cols.map(c => {
        const maxLen = Math.max(
          c.label.length,
          ...mergedData.map(m => {
            const v = m[c.key]
            if (v === true || v === false) return 3
            return String(v ?? '').length
          })
        )
        return { header: c.label, key: c.key, width: Math.min(Math.max(maxLen + 2, 10), 42) }
      })

      // Shared styles
      const thinBorder = { style: 'thin', color: { argb: 'FFBBBBBB' } }
      const allBorders = { top: thinBorder, left: thinBorder, bottom: thinBorder, right: thinBorder }

      // Style header row
      const headerRow = ws.getRow(1)
      headerRow.height = 20
      headerRow.eachCell(cell => {
        cell.font      = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11, name: 'Calibri' }
        cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } }
        cell.alignment = { horizontal: 'center', vertical: 'middle' }
        cell.border    = allBorders
      })

      // Indian date/datetime formatter
      const DATETIME_KEYS = new Set(['last_modified_at', 'created_at', '_dm_deleted_at', '_dm_restored_at'])
      const DATE_KEYS      = new Set(['dob_actual', 'dob_certificate', 'date_of_marriage', 'baptism_date', 'confirmation_date'])
      const fmtDate = iso => {
        if (!iso) return ''
        const d = new Date(iso)
        if (isNaN(d.getTime())) return iso
        const dd = String(d.getDate()).padStart(2,'0')
        const mm = String(d.getMonth()+1).padStart(2,'0')
        const yyyy = d.getFullYear()
        return `${dd}-${mm}-${yyyy}`
      }
      const fmtDatetime = iso => {
        if (!iso) return ''
        const d = new Date(iso)
        if (isNaN(d.getTime())) return iso
        const dd = String(d.getDate()).padStart(2,'0')
        const mm = String(d.getMonth()+1).padStart(2,'0')
        const yyyy = d.getFullYear()
        const hh = String(d.getHours()).padStart(2,'0')
        const min = String(d.getMinutes()).padStart(2,'0')
        const ss = String(d.getSeconds()).padStart(2,'0')
        return `${dd}-${mm}-${yyyy} ${hh}:${min}:${ss}`
      }

      // Add data rows
      mergedData.forEach((m, idx) => {
        const rowData = cols.map(c => {
          const v = m[c.key]
          if (v === true) return 'Yes'
          if (v === false) return 'No'
          if (DATETIME_KEYS.has(c.key)) return fmtDatetime(v)
          if (DATE_KEYS.has(c.key))     return fmtDate(v)
          return v ?? ''
        })
        const row = ws.addRow(rowData)
        row.height = 15
        const isAlt = idx % 2 === 1
        row.eachCell({ includeEmpty: true }, (cell, colNum) => {
          const col = cols[colNum - 1]
          cell.font      = { size: 10, name: 'Calibri' }
          cell.alignment = { horizontal: col?.left ? 'left' : 'center', vertical: 'middle' }
          cell.border    = allBorders
          if (isAlt) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F4FA' } }
        })
      })

      // Write and trigger download
      const buffer = await wb.xlsx.writeBuffer()
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      const date = new Date().toISOString().slice(0, 10)
      a.href = url
      a.download = alpha ? `members_${alpha}_${date}.xlsx` : `members_all_${date}.xlsx`
      a.click()
      URL.revokeObjectURL(url)
      toast(`Exported ${mergedData.length} members successfully.`, 'success')
    } catch (e) {
      toast('Export failed: ' + e.message, 'error')
    }
    setExporting(false)
  }

  const isEdit = !!selected

  const SEL_ARROW = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%2394a3b8' d='M6 8L1 3h10z'/%3E%3C/svg%3E")`

  return (
    <div className="animate-fade-in">

      {/* ── Page Header ── */}
      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', flexWrap:'wrap', gap:12, marginBottom:24, paddingBottom:20, borderBottom:'1px solid var(--card-border)' }}>
        <div>
          <h1 style={{ fontFamily:'var(--font-ui)', fontSize:22, fontWeight:800, color:'var(--sidebar-bg)', letterSpacing:-0.3, margin:0 }}>
            Member Entry
          </h1>
          <p style={{ fontSize:12, color:'var(--text-3)', marginTop:3 }}>{total.toLocaleString()} members total</p>
        </div>
        <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
          {['super_admin','admin1'].includes(profile?.role) && (
            <button className="action-btn" onClick={() => navigate('/deleted-members')} style={{background:'#0d9488'}}>
              <Archive size={13}/> Deleted Members
            </button>
          )}
          <button className="action-btn" onClick={exportExcel} disabled={exporting||members.length===0} style={{background:'#16a34a'}}>
            {exporting ? <><Loader2 size={13} className="animate-spin"/>Exporting…</> : <><FileSpreadsheet size={13}/>Excel Export</>}
          </button>
          {perms.canPrint && (
            <button className="action-btn" onClick={() => setShowBulkPrintModal(true)} style={{background:'#334155'}}>
              <Printer size={13}/>Bulk Print
            </button>
          )}
          <button className="action-btn" onClick={() => setShowFamilyRecordsModal(true)} style={{background:'#1e3a8a'}}>
            <Users size={13}/>Family records
          </button>
          {perms.canAdd && (
            <button className="action-btn" onClick={newMember} style={{background:'#7f1d1d'}}>
              <UserPlus size={13}/>Add member
            </button>
          )}
        </div>
      </div>

      {/* ── Tabs ── */}
      <div style={{ display:'flex', borderBottom:'1px solid var(--card-border)', marginBottom:20, gap:0 }}>
        {[['list','Members List'],['form', isEdit ? `Edit — ${selected?.member_id}` : 'Member Form']].map(([id,lbl])=>(
          <button key={id} onClick={()=>setTab(id)} style={{
            padding:'9px 18px',
            fontSize:13,
            fontWeight:600,
            border:'none',
            background:'transparent',
            borderBottom: tab===id ? '2.5px solid var(--accent)' : '2.5px solid transparent',
            color: tab===id ? 'var(--accent)' : 'var(--text-3)',
            cursor:'pointer',
            transition:'all 0.15s',
            fontFamily:'inherit',
          }}>
            {lbl}
          </button>
        ))}
      </div>

      {/* ══════════════ LIST TAB ══════════════ */}
      {tab==='list' && (
        <>
          {/* A–Z filter */}
          <div style={{ display:'flex', flexWrap:'wrap', gap:4, marginBottom:12 }}>
            {['ALL',...ALPHA].map(l => {
              const active = l==='ALL' ? alpha==='' : alpha===l
              return (
                <button key={l} onClick={()=>setAlpha(l==='ALL' ? '' : l)} style={{
                  width: l==='ALL' ? 38 : 26,
                  height: 26,
                  padding: 0,
                  fontSize: 11,
                  fontWeight: 700,
                  borderRadius: 6,
                  border: `1px solid ${active ? 'var(--accent)' : 'var(--card-border)'}`,
                  background: active ? 'var(--accent)' : 'var(--card-bg)',
                  color: active ? 'var(--accent-text)' : 'var(--text-3)',
                  cursor: 'pointer',
                  transition: 'all 0.12s',
                }}>
                  {l}
                </button>
              )
            })}
          </div>

          {/* Search bar */}
          <div style={{ display:'flex', gap:8, marginBottom:16 }}>
            <select value={searchCol} onChange={e=>setSearchCol(e.target.value)}
              className="field-input" style={{width:150,appearance:'none',backgroundImage:SEL_ARROW,backgroundRepeat:'no-repeat',backgroundPosition:'right 8px center',paddingRight:24}}>
              {[['all','All fields'],['family_id','Family ID'],['member_id','Member ID'],['member_name','Name'],['mobile','Mobile']].map(([v,l])=>(
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
            <div style={{ position:'relative', flex:1, maxWidth:320 }}>
              <Search size={14} style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)', color:'var(--text-3)', pointerEvents:'none' }}/>
              <input value={searchVal} onChange={e=>setSearchVal(e.target.value)}
                placeholder="Search members…" className="field-input" style={{paddingLeft:32}}/>
            </div>
            {searchVal && (
              <button className="btn btn-ghost btn-sm" onClick={()=>setSearchVal('')}>Clear</button>
            )}
          </div>

          {/* Table */}
          <div className="card">
            <div style={{overflowX:'auto'}}>
              <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
                <thead>
                  <tr>
                    {['Family ID','Member ID','Name','Father','Gender','DOB','Age','Status','Zone','Mobile'].map(h=>(
                      <th key={h} style={{
                        textAlign:'left', padding:'10px 14px',
                        fontSize:10.5, fontWeight:700, textTransform:'uppercase', letterSpacing:'.06em',
                        color:'var(--text-3)',
                        background:'var(--table-header-bg)',
                        borderBottom:'1px solid var(--card-border)',
                        whiteSpace:'nowrap',
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan={10} style={{textAlign:'center',padding:52,color:'var(--text-3)'}}>
                      <Loader2 size={20} style={{display:'inline',marginRight:8,animation:'spin 1s linear infinite'}}/>Loading…
                    </td></tr>
                  ) : members.length===0 ? (
                    <tr><td colSpan={10} style={{textAlign:'center',padding:52,color:'var(--text-3)'}}>
                      <UserX size={30} style={{margin:'0 auto 8px',opacity:.3,display:'block'}}/> No members found.
                    </td></tr>
                  ) : members.map(m=>(
                    <tr key={m.member_id} onClick={()=>selectRow(m.member_id)}
                      style={{
                        cursor:'pointer',
                        borderBottom:'1px solid var(--table-border)',
                        background: selected?.member_id===m.member_id ? 'var(--accent-subtle)' : 'transparent',
                        transition:'background 0.1s',
                      }}
                      onMouseEnter={e=>{ if(selected?.member_id!==m.member_id) e.currentTarget.style.background='var(--table-row-hover)' }}
                      onMouseLeave={e=>{ if(selected?.member_id!==m.member_id) e.currentTarget.style.background='transparent' }}
                    >
                      <td style={{padding:'9px 14px'}}><span className="pill pill-purple">{m.family_id}</span></td>
                      <td style={{padding:'9px 14px'}}>
                        <span className="pill pill-blue"
                          title={restoredIds.has(m.member_id) ? 'Reinstated member' : ''}
                          style={restoredIds.has(m.member_id) ? {background:'#ccfbf1',color:'#0f766e',border:'1px solid #99f6e4'} : {}}>
                          {m.member_id}
                        </span>
                      </td>
                      <td style={{padding:'9px 14px',fontWeight:600,color:'var(--text-1)',whiteSpace:'nowrap'}}>{m.title?m.title+' ':''}{m.member_name}</td>
                      <td style={{padding:'9px 14px',color:'var(--text-2)'}}>{m.father_name||'—'}</td>
                      <td style={{padding:'9px 14px',color:'var(--text-2)'}}>{m.gender||'—'}</td>
                      <td style={{padding:'9px 14px',color:'var(--text-2)',whiteSpace:'nowrap'}}>{fmtDate(m.dob_actual)}</td>
                      <td style={{padding:'9px 14px',color:'var(--text-2)'}}>{m.age||'—'}</td>
                      <td style={{padding:'9px 14px'}}><span className={'pill '+(m.marital_status==='Married'?'pill-green':'pill-gray')}>{m.marital_status||'—'}</span></td>
                      <td style={{padding:'9px 14px',color:'var(--text-2)',maxWidth:120,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{m.zonal_area||'—'}</td>
                      <td style={{padding:'9px 14px',color:'var(--text-2)'}}>{m.mobile||'—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {members.length > 0 && (
              <div style={{ padding:'9px 16px', borderTop:'1px solid var(--card-border)', fontSize:11, color:'var(--text-3)' }}>
                Showing {members.length.toLocaleString()} of {total.toLocaleString()} members
              </div>
            )}
          </div>
        </>
      )}

      {/* ══════════════ FORM TAB ══════════════ */}
      {tab==='form' && (
        <>
          {/* Mode badge */}
          <div style={{ marginBottom:20, display:'flex', alignItems:'center', gap:10, flexWrap:'wrap' }}>
            <span style={{
              display:'inline-flex', alignItems:'center', gap:6,
              fontSize:11, fontWeight:700,
              padding:'5px 12px', borderRadius:99,
              background: isEdit ? 'var(--warning-subtle)' : 'var(--success-subtle)',
              color: isEdit ? 'var(--warning)' : 'var(--success)',
              border: `1px solid ${isEdit ? 'var(--warning-border)' : 'var(--success-border)'}`,
            }}>
              <span style={{ width:6, height:6, borderRadius:'50%', background: isEdit ? 'var(--warning)' : 'var(--success)', display:'inline-block' }}/>
              {isEdit ? 'Existing member — edit mode' : 'New member — adding mode'}
            </span>
            {isEdit && restoredInfo && (
              <span style={{
                display:'inline-flex', alignItems:'center', gap:6,
                fontSize:11, fontWeight:700,
                padding:'5px 12px', borderRadius:99,
                background:'#ccfbf1', color:'#0f766e', border:'1px solid #99f6e4',
              }}>
                <span style={{ width:6, height:6, borderRadius:'50%', background:'#0d9488', display:'inline-block' }}/>
                Reinstated member
                {restoredInfo.restore_reason
                  ? <span style={{fontWeight:400}}>— {restoredInfo.restore_reason}</span>
                  : null}
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            {/* ── Personal details ── */}
            <div className="card" style={{padding:20}}>
              <p className="form-section form-section-blue">Personal details</p>
              <div style={{display:'flex',flexDirection:'column',gap:14}}>
                <div className="grid grid-cols-2 gap-3">
                  <div className="field-group" style={{position:'relative'}}>
                    <label className="field-label">Member ID *</label>
                    <input
                      className="field-input"
                      value={form.member_id}
                      onChange={e => isEdit ? s('member_id', e.target.value) : onMemberIdChange(e.target.value)}
                      onFocus={() => !isEdit && memberIdSuggestions.length > 0 && setShowMemberIdPopup(true)}
                      onBlur={() => setTimeout(() => setShowMemberIdPopup(false), 200)}
                      disabled={isEdit}
                      placeholder="A00101"
                      autoComplete="off"
                    />
                    {!isEdit && showMemberIdPopup && memberIdSuggestions.length > 0 && (
                      <div style={{
                        position:'absolute', top:'100%', left:0, right:0, zIndex:200,
                        background:'var(--card-bg)', border:'1px solid var(--card-border)',
                        borderRadius:8, boxShadow:'0 8px 24px rgba(0,0,0,0.13)',
                        maxHeight:220, overflowY:'auto', marginTop:3,
                      }}>
                        <div style={{
                          padding:'5px 10px', fontSize:10, fontWeight:700,
                          color:'var(--text-3)', borderBottom:'1px solid var(--card-border)',
                          textTransform:'uppercase', letterSpacing:0.6, background:'var(--page-bg)',
                          borderRadius:'8px 8px 0 0',
                        }}>
                          Already used in this family
                        </div>
                        {memberIdSuggestions.map(m => (
                          <div key={m.member_id} style={{
                            padding:'6px 10px', fontSize:12,
                            display:'flex', gap:10, alignItems:'center',
                            borderBottom:'1px solid var(--table-border)',
                          }}>
                            <span style={{fontWeight:700, fontFamily:'monospace', color:'var(--info)', minWidth:84}}>{m.member_id}</span>
                            <span style={{color:'var(--text-2)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>{m.member_name}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="field-group"><label className="field-label">Family ID *</label>
                    <input className="field-input" value={form.family_id} onChange={e=>s('family_id',e.target.value)} disabled={isEdit} placeholder="A001"/></div>
                </div>
                <div style={{display:'flex',gap:12}}>
                  <div style={{flex:1,display:'flex',flexDirection:'column',gap:10}}>
                    <div style={{display:'grid',gap:8,gridTemplateColumns:'80px 1fr'}}>
                      <div className="field-group"><label className="field-label">Title</label>
                        <Sel value={form.title} onChange={v=>s('title',v)} options={['Mr.','Mrs.','Ms.','Dr.','Rev.','Pr.']}/></div>
                      <div className="field-group"><label className="field-label">Full name *</label>
                        <input className="field-input" value={form.member_name} onChange={e=>s('member_name',e.target.value)} placeholder="Full name"/></div>
                    </div>
                    <div className="field-group"><label className="field-label">Father's name</label>
                      <input className="field-input" value={form.father_name||''} onChange={e=>s('father_name',e.target.value)} placeholder="Father's full name"/></div>
                  </div>
                  {/* Photo */}
                  <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:6,flexShrink:0}}>
                    <div onClick={()=>fileRef.current?.click()} style={{
                      width:88,height:108,
                      border:'2px dashed var(--input-border)',borderRadius:10,
                      display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',
                      background:'var(--page-bg)',cursor:'pointer',overflow:'hidden',
                    }}>
                      {photoPreview
                        ? <img src={photoPreview} style={{width:88,height:108,objectFit:'cover',objectPosition:'top'}} alt="Photo"/>
                        : <><svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke="var(--text-3)" strokeWidth={1.5}><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2M12 11a4 4 0 100-8 4 4 0 000 8z"/></svg><span style={{fontSize:9,color:'var(--text-3)',marginTop:4}}>Photo</span></>
                      }
                    </div>
                    <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onPhoto}/>
                    <button className="btn btn-ghost btn-sm" onClick={()=>fileRef.current?.click()} style={{fontSize:11}}><Upload size={11}/>Upload</button>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="field-group"><label className="field-label">Gender</label><Sel value={form.gender} onChange={v=>s('gender',v)} options={['Male','Female']}/></div>
                  <div className="field-group"><label className="field-label">Aadhaar</label><input className="field-input" value={form.aadhaar||''} onChange={e=>s('aadhaar',e.target.value)} placeholder="12-digit" maxLength={12}/></div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="field-group"><label className="field-label">DOB (actual)</label><input type="date" className="field-input" value={form.dob_actual||''} onChange={e=>{s('dob_actual',e.target.value);s('dob_certificate',e.target.value)}}/></div>
                  <div className="field-group"><label className="field-label">DOB (certificate)</label><input type="date" className="field-input" value={form.dob_certificate||''} onChange={e=>s('dob_certificate',e.target.value)}/></div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="field-group"><label className="field-label">Marital status</label><Sel value={form.marital_status} onChange={v=>s('marital_status',v)} options={['Single','Married','Widowed','Divorced']}/></div>
                  <div className="field-group"><label className="field-label">Marriage date</label><input type="date" className="field-input" value={form.date_of_marriage||''} onChange={e=>s('date_of_marriage',e.target.value)}/></div>
                </div>
                <div className="field-group"><label className="field-label">Spouse name</label><input className="field-input" value={form.spouse_name||''} onChange={e=>s('spouse_name',e.target.value)}/></div>
                <div className="field-group"><label className="field-label">Door no. & street</label><input className="field-input" value={form.address_street||''} onChange={e=>s('address_street',e.target.value)}/></div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="field-group"><label className="field-label">Area 1</label><input className="field-input" value={form.area_1||''} onChange={e=>s('area_1',e.target.value)}/></div>
                  <div className="field-group"><label className="field-label">Area 2</label><input className="field-input" value={form.area_2||''} onChange={e=>s('area_2',e.target.value)}/></div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="field-group"><label className="field-label">City</label><input className="field-input" value={form.city||''} onChange={e=>s('city',e.target.value)}/></div>
                  <div className="field-group"><label className="field-label">State</label><input className="field-input" value={form.state||''} onChange={e=>s('state',e.target.value)}/></div>
                </div>
                <div className="field-group"><label className="field-label">Zonal area</label><Sel value={form.zonal_area} onChange={v=>s('zonal_area',v)} options={zones} placeholder="— Select zone —"/></div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="field-group"><label className="field-label">Mobile</label><input className="field-input" value={form.mobile||''} onChange={e=>s('mobile',e.target.value)}/></div>
                  <div className="field-group"><label className="field-label">WhatsApp</label><input className="field-input" value={form.whatsapp||''} onChange={e=>s('whatsapp',e.target.value)}/></div>
                </div>
                <div className="field-group"><label className="field-label">Email</label><input type="email" className="field-input" value={form.email||''} onChange={e=>s('email',e.target.value)}/></div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="field-group"><label className="field-label">Qualification</label><input className="field-input" value={form.qualification||''} onChange={e=>s('qualification',e.target.value)}/></div>
                  <div className="field-group"><label className="field-label">Profession</label><input className="field-input" value={form.profession||''} onChange={e=>s('profession',e.target.value)}/></div>
                </div>
                <div className="field-group"><label className="field-label">Working sector</label><Sel value={form.working_sector} onChange={v=>s('working_sector',v)} options={SECTORS}/></div>
              </div>
            </div>

            {/* ── Church details ── */}
            <div className="card" style={{padding:20}}>
              <p className="form-section form-section-purple">Church related details</p>
              <div style={{display:'flex',flexDirection:'column',gap:14}}>
                <div className="grid grid-cols-2 gap-3">
                  <div className="field-group"><label className="field-label">First gen Christian?</label><Sel value={form.is_first_gen_christian} onChange={v=>s('is_first_gen_christian',v)} options={['Yes','No']}/></div>
                  <div className="field-group"><label className="field-label">Is family head?</label><Sel value={form.is_family_head} onChange={v=>s('is_family_head',v)} options={['Yes','No']}/></div>
                </div>
                <div className="field-group"><label className="field-label">Relationship with family head</label><Sel value={form.relationship_with_fh} onChange={v=>s('relationship_with_fh',v)} options={RELS}/></div>
                <div className="field-group"><label className="field-label">Membership</label><Sel value={form.membership_type} onChange={v=>s('membership_type',v)} options={['Primary','Secondary']}/></div>
                {form.membership_type==='Secondary' && (
                  <div className="field-group"><label className="field-label">Primary church name</label><input className="field-input" value={form.primary_church_name||''} onChange={e=>s('primary_church_name',e.target.value)}/></div>
                )}
                <div className="grid grid-cols-2 gap-3">
                  <div className="field-group"><label className="field-label">Denomination</label><Sel value={form.denomination} onChange={v=>s('denomination',v)} options={DENOMS}/></div>
                  <div className="field-group"><label className="field-label">Member since year</label><input className="field-input" value={form.membership_from_year||''} onChange={e=>s('membership_from_year',e.target.value)} placeholder="e.g. 1998" maxLength={4}/></div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="field-group"><label className="field-label">Baptism type</label><Sel value={form.baptism_type} onChange={v=>s('baptism_type',v)} options={['Child Baptism','Adult Baptism','Not Baptised']}/></div>
                  <div className="field-group"><label className="field-label">Baptism date</label><input type="date" className="field-input" value={form.baptism_date||''} onChange={e=>s('baptism_date',e.target.value)}/></div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="field-group"><label className="field-label">Confirmation?</label><Sel value={form.confirmation_taken} onChange={v=>s('confirmation_taken',v)} options={['Yes','No']}/></div>
                  <div className="field-group"><label className="field-label">Confirmation date</label><input type="date" className="field-input" value={form.confirmation_date||''} onChange={e=>s('confirmation_date',e.target.value)}/></div>
                </div>
                <div className="field-group"><label className="field-label">Family Benefit Relief Fund?</label><Sel value={form.is_fbrf_member} onChange={v=>s('is_fbrf_member',v)} options={['Yes','No']}/></div>
                <div>
                  <p className="field-label" style={{marginBottom:8}}>Church activities</p>
                  <div style={{
                    border:'1px solid var(--card-border)',
                    borderRadius:10,
                    padding:16,
                    background:'var(--page-bg)',
                    display:'grid',
                    gridTemplateColumns:'1fr 1fr',
                    gap:10,
                  }}>
                    {ACTS.map(([k,l])=>(
                      <label key={k} style={{ display:'flex', alignItems:'center', gap:8, cursor:'pointer', fontSize:13, color:'var(--text-1)' }}>
                        <input type="checkbox" checked={!!form[k]} onChange={e=>s(k,e.target.checked)} style={{accentColor:'var(--accent)',width:14,height:14}}/>
                        {l}
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ── Form Actions ── */}
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginTop:24, paddingTop:20, borderTop:'1px solid var(--card-border)' }}>
            <div>
              {perms.canDelete && isEdit && (
                <button className="btn btn-danger btn-sm" onClick={()=>setShowDeleteModal(true)}><Trash2 size={13}/>Delete</button>
              )}
            </div>
            <div style={{ display:'flex', gap:8 }}>
              {perms.canPrint && isEdit && (
                <button className="btn btn-secondary btn-sm" onClick={()=>setShowPrintModal(true)}><Printer size={13}/>Print</button>
              )}
              <button className="btn btn-secondary btn-sm" onClick={()=>{setTab('list');setSelected(null)}}><RotateCcw size={13}/>Reset</button>
              <button className="btn btn-primary btn-sm"
                onClick={isEdit ? doSave : ()=>setShowSaveDialog(true)}
                disabled={!form.member_id||!form.member_name||saving}>
                {saving ? <><Loader2 size={13} className="animate-spin"/>Saving…</> : <><Save size={13}/>{isEdit?'Update member':'Submit'}</>}
              </button>
            </div>
          </div>
        </>
      )}

      {/* ── Save dialog ── */}
      {showSaveDialog && (
        <div style={{ position:'fixed', inset:0, background:'var(--overlay)', backdropFilter:'blur(4px)', zIndex:50, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
          <div className="card animate-slide-up" style={{ padding:24, width:'100%', maxWidth:420 }}>
            <h3 style={{ fontFamily:'var(--font-ui)', fontSize:15, fontWeight:700, color:'var(--text-1)', marginBottom:4 }}>
              {isEdit ? 'Save member changes' : 'Save new member'}
            </h3>
            <p style={{ fontSize:13, color:'var(--text-3)', marginBottom:16 }}>Select the appropriate option.</p>
            {[['new','New member','First time joining this church.'],['migrant','Migrant member','Transferring from another church.']].map(([v,l,d])=>(
              <label key={v} style={{
                display:'flex', alignItems:'flex-start', gap:12, padding:14, borderRadius:10,
                border: `2px solid ${saveType===v ? 'var(--accent)' : 'var(--card-border)'}`,
                background: saveType===v ? 'var(--accent-subtle)' : 'var(--page-bg)',
                cursor:'pointer', marginBottom:10, transition:'all 0.15s',
              }}>
                <input type="radio" name="st" value={v} checked={saveType===v} onChange={()=>setSaveType(v)} style={{accentColor:'var(--accent)',marginTop:2}}/>
                <div style={{flex:1}}>
                  <p style={{fontSize:13,fontWeight:600,color:'var(--text-1)'}}>{l}</p>
                  <p style={{fontSize:11,color:'var(--text-3)',marginTop:2}}>{d}</p>
                  {v==='migrant' && saveType==='migrant' && (
                    <div style={{marginTop:12,display:'flex',flexDirection:'column',gap:8}}>
                      <div className="field-group"><label className="field-label">Old member ID</label><input className="field-input" value={oldMemberId} onChange={e=>setOldMemberId(e.target.value)} placeholder="e.g. B00203"/></div>
                      <div className="field-group"><label className="field-label">Reason</label><textarea className="field-input" rows={2} value={changeReason} onChange={e=>setChangeReason(e.target.value)} placeholder="e.g. Relocated from Chennai" style={{height:'auto',padding:'8px 10px',resize:'none'}}/></div>
                    </div>
                  )}
                </div>
              </label>
            ))}
            <div style={{ display:'flex', gap:8, justifyContent:'flex-end', marginTop:4 }}>
              <button className="btn btn-secondary btn-sm" onClick={()=>setShowSaveDialog(false)}>Cancel</button>
              <button className="btn btn-primary btn-sm" onClick={doSave} disabled={saving||(!saveType)||(saveType==='migrant'&&(!oldMemberId||!changeReason))}>Save member</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete dialog (OLD - TO BE REMOVED) ── */}
      {showDelDialog && (
        <div style={{ position:'fixed', inset:0, background:'var(--overlay)', backdropFilter:'blur(4px)', zIndex:50, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
          <div className="card animate-slide-up" style={{ padding:24, width:'100%', maxWidth:360 }}>
            <h3 style={{ fontFamily:'var(--font-ui)', fontSize:15, fontWeight:700, color:'var(--text-1)', marginBottom:8 }}>Delete member?</h3>
            <p style={{ fontSize:13, color:'var(--text-2)', marginBottom:20 }}>
              Delete <strong>{selected?.member_name}</strong> ({selected?.member_id})? This cannot be undone.
            </p>
            <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
              <button className="btn btn-secondary btn-sm" onClick={()=>setShowDelDialog(false)}>Cancel</button>
              <button className="btn btn-danger btn-sm" onClick={doDelete}>Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Member Modal (NEW) ── */}
      <DeleteMemberModal
        member={selected}
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        onDeleted={() => {
          setTab('list')
          setSelected(null)
          loadMembers(alpha, searchCol, searchVal)
        }}
        userEmail={profile?.full_name || profile?.email}
      />

      {showPrintModal && selected && (
        <MemberPrintModal member={selected} onClose={() => setShowPrintModal(false)} />
      )}
      {showBulkPrintModal && (
        <BulkPrintModal onClose={() => setShowBulkPrintModal(false)} />
      )}
      {showFamilyRecordsModal && (
        <FamilyRecordsModal onClose={() => setShowFamilyRecordsModal(false)} />
      )}
    </div>
  )
}
