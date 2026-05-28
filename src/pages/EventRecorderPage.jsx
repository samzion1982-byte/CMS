import { useState, useRef, useEffect } from 'react'
import {
  BookMarked, Upload, Save, Trash2, RotateCcw,
  Edit2, Plus, Camera, Search, FileText, X, Printer, Loader2,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useToast } from '../lib/toast'

/* ─── Constants ──────────────────────────────────────────────────── */
const TABS = [
  { id: 'baptism',      label: 'Baptism'      },
  { id: 'confirmation', label: 'Confirmation' },
  { id: 'wedding',      label: 'Wedding'      },
  { id: 'burial',       label: 'Burial'       },
]
function fmtAadhaar(val) {
  const d = val.replace(/\D/g, '').slice(0, 12)
  return [d.slice(0,4), d.slice(4,8), d.slice(8,12)].filter(p => p.length > 0).join('-')
}

const GROOM_CONDITIONS = ['Bachelor', 'Widower', 'Divorced']
const BRIDE_CONDITIONS  = ['Spinster', 'Widow', 'Divorced']
const BANN_OPTIONS      = ['Banns', 'Licensee']
const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
]

const EMPTY_FORM = {
  seqNum: '', year: new Date().getFullYear(), month: '', day: '',
  dateOfApplication: '',
  nameGroom: '', surnameGroom: '', ageGroom: '', dobGroom: '',
  conditionGroom: '', professionGroom: '', fatherNameGroom: '',
  addressGroom: '', aadhaarGroom: '', churchGroom: '',
  w1NameGroom: '', w1AddrGroom: '', w2NameGroom: '', w2AddrGroom: '',
  nameBride: '', surnameBride: '', ageBride: '', dobBride: '',
  conditionBride: '', professionBride: '', fatherNameBride: '',
  addressBride: '', aadhaarBride: '', churchBride: '',
  w1NameBride: '', w1AddrBride: '', w2NameBride: '', w2AddrBride: '',
  bann: '', placeOfMarriage: '', solemnizedBy: '', remarks: '',
}

const EMPTY_FILE = { name: null, preview: null, fileObj: null, url: null }
const EMPTY_FILES = {
  groomPhoto:   { ...EMPTY_FILE },
  bridePhoto:   { ...EMPTY_FILE },
  weddingPhoto: { ...EMPTY_FILE },
  groomAadhaar: { ...EMPTY_FILE },
  groomBaptism: { ...EMPTY_FILE },
  groomConfirm: { ...EMPTY_FILE },
  brideAadhaar: { ...EMPTY_FILE },
  brideBaptism: { ...EMPTY_FILE },
  brideConfirm: { ...EMPTY_FILE },
}

const FILE_KEYS = ['groomPhoto','bridePhoto','weddingPhoto','groomAadhaar','groomBaptism','groomConfirm','brideAadhaar','brideBaptism','brideConfirm']

const DB_FILE_MAP = {
  groomPhoto:   'groom_photo_url',
  bridePhoto:   'bride_photo_url',
  weddingPhoto: 'wedding_photo_url',
  groomAadhaar: 'groom_aadhaar_url',
  groomBaptism: 'groom_baptism_url',
  groomConfirm: 'groom_confirm_url',
  brideAadhaar: 'bride_aadhaar_url',
  brideBaptism: 'bride_baptism_url',
  brideConfirm: 'bride_confirm_url',
}

/* ─── Root page ──────────────────────────────────────────────────── */
export default function EventRecorderPage() {
  const [activeTab, setActiveTab] = useState('wedding')

  return (
    <div style={{ padding: '32px 28px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24 }}>
        <BookMarked size={22} style={{ color: 'var(--accent, #2563eb)' }} />
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Event Recorder</h1>
      </div>
      <div style={{
        display: 'flex', gap: 4,
        borderBottom: '2px solid var(--border, #e2e8f0)',
        marginBottom: 28,
      }}>
        {TABS.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{
            padding: '9px 22px', fontSize: 14,
            fontWeight: activeTab === tab.id ? 700 : 500,
            border: 'none',
            borderBottom: activeTab === tab.id
              ? '2px solid var(--sidebar-bg, #1e293b)' : '2px solid transparent',
            marginBottom: -2,
            background: activeTab === tab.id ? 'var(--sidebar-bg, #1e293b)' : 'transparent',
            color: activeTab === tab.id ? '#ffffff' : 'var(--text-muted, #64748b)',
            cursor: 'pointer', borderRadius: '6px 6px 0 0', transition: 'all 0.15s',
          }}>
            {tab.label}
          </button>
        ))}
      </div>
      {activeTab === 'baptism'      && <BaptismTab />}
      {activeTab === 'confirmation' && <ConfirmationTab />}
      {activeTab === 'wedding'      && <WeddingTab />}
      {activeTab === 'burial'       && <BurialTab />}
    </div>
  )
}

/* ─── Baptism Tab ────────────────────────────────────────────────── */
const EMPTY_BAPTISM = {
  seqNum: '', year: new Date().getFullYear(),
  dateOfBaptism: '', baptismType: '', dateOfBirth: '',
  name: '', gender: '',
  fatherName: '', motherName: '',
  professionOfParents: '', address: '',
  placeOfBaptism: '', baptizedBy: '',
  godParents: '', remarks: '', certDate: '',
}

function BaptismTab() {
  const { toast } = useToast()
  const [form,    setForm]    = useState(EMPTY_BAPTISM)
  const [photo,   setPhoto]   = useState(EMPTY_FILE)
  const [editId,  setEditId]  = useState(null)
  const [saving,  setSaving]  = useState(false)
  const [seqNumTaken, setSeqNumTaken] = useState(false)
  const [searchBy,  setSearchBy]  = useState('slNo')
  const [searchVal, setSearchVal] = useState('')
  const [searching, setSearching] = useState(false)
  const [searchResults, setSearchResults] = useState([])
  const [viewRecord,  setViewRecord]  = useState(null)
  const [showCert, setShowCert] = useState(false)
  const photoRef = useRef()

  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }))

  async function getNext(yr) {
    const { data } = await supabase.from('baptism_records').select('seq_num')
      .eq('year', yr).order('seq_num', { ascending: false }).limit(1).maybeSingle()
    return data ? data.seq_num + 1 : 1
  }

  useEffect(() => {
    getNext(new Date().getFullYear()).then(n => setForm(f => ({ ...f, seqNum: String(n) })))
  }, []) // eslint-disable-line

  async function handleReset() {
    setPhoto(EMPTY_FILE); setEditId(null); setSeqNumTaken(false); setSearchResults([])
    const n = await getNext(new Date().getFullYear())
    setForm({ ...EMPTY_BAPTISM, seqNum: String(n) })
  }

  function handleSeqChange(e) {
    const val = e.target.value
    setForm(f => ({ ...f, seqNum: val })); setSeqNumTaken(false)
    if (!val || editId) return
    supabase.from('baptism_records').select('id').eq('seq_num', parseInt(val)).eq('year', parseInt(form.year))
      .maybeSingle().then(({ data }) => setSeqNumTaken(!!data))
  }

  function handlePhoto(e) {
    const file = e.target.files?.[0]; if (!file) return
    const reader = new FileReader()
    reader.onload = ev => setPhoto({ name: file.name, preview: ev.target.result, fileObj: file, url: null })
    reader.readAsDataURL(file); e.target.value = ''
  }

  const seqPadded   = form.seqNum ? String(form.seqNum).padStart(4,'0') : '0000'
  const slNoDisplay = `${seqPadded}/${form.year}`
  const slNoPath    = `${seqPadded}-${form.year}`

  async function handleSave() {
    if (!form.seqNum) { toast('Enter a Serial Number', 'error'); return }
    if (seqNumTaken) { toast(`Serial No. ${slNoDisplay} already exists`, 'error'); return }
    if (!form.name)  { toast('Enter the name', 'error'); return }
    if (!editId) {
      const { data: ex } = await supabase.from('baptism_records').select('id')
        .eq('seq_num', parseInt(form.seqNum)).eq('year', parseInt(form.year)).maybeSingle()
      if (ex) { toast(`Serial No. ${slNoDisplay} already exists`, 'error'); return }
    }
    setSaving(true)
    try {
      let photoUrl = photo.url || null
      if (photo.fileObj) {
        const ext = photo.fileObj.name.split('.').pop()
        const path = `baptism/${slNoPath}/photo.${ext}`
        const { error: upErr } = await supabase.storage.from('event-media').upload(path, photo.fileObj, { upsert: true })
        if (upErr) throw upErr
        const { data: pd } = supabase.storage.from('event-media').getPublicUrl(path)
        photoUrl = pd.publicUrl
      }
      const record = {
        seq_num: parseInt(form.seqNum), year: parseInt(form.year),
        date_of_baptism: form.dateOfBaptism || null, baptism_type: form.baptismType || null,
        date_of_birth: form.dateOfBirth || null,
        name: form.name || null, gender: form.gender || null,
        father_name: form.fatherName || null, mother_name: form.motherName || null,
        profession_of_parents: form.professionOfParents || null, address: form.address || null,
        place_of_baptism: form.placeOfBaptism || null, baptized_by: form.baptizedBy || null,
        god_parents: form.godParents || null, remarks: form.remarks || null,
        photo_url: photoUrl, updated_at: new Date().toISOString(),
      }
      let error, newId
      if (editId) {
        ;({ error } = await supabase.from('baptism_records').update(record).eq('id', editId))
      } else {
        const { data, error: insErr } = await supabase.from('baptism_records').insert(record).select('id').single()
        error = insErr; newId = data?.id
      }
      if (error) throw error
      if (newId) setEditId(newId)
      if (photoUrl) setPhoto(p => ({ ...p, url: photoUrl, fileObj: null }))
      toast(`Baptism record ${editId ? 'updated' : 'saved'} — ${slNoDisplay}`, 'success')
    } catch (err) { toast(err.message || 'Save failed', 'error') }
    finally { setSaving(false) }
  }

  async function handleLoad(id) {
    const { data, error } = await supabase.from('baptism_records').select('*').eq('id', id).single()
    if (error || !data) { toast('Record not found', 'error'); return }
    setEditId(data.id)
    setForm({
      seqNum: String(data.seq_num ?? ''), year: data.year ?? new Date().getFullYear(),
      dateOfBaptism: data.date_of_baptism ?? '', baptismType: data.baptism_type ?? '',
      dateOfBirth: data.date_of_birth ?? '',
      name: data.name ?? '', gender: data.gender ?? '',
      fatherName: data.father_name ?? '', motherName: data.mother_name ?? '',
      professionOfParents: data.profession_of_parents ?? '', address: data.address ?? '',
      placeOfBaptism: data.place_of_baptism ?? '', baptizedBy: data.baptized_by ?? '',
      godParents: data.god_parents ?? '', remarks: data.remarks ?? '', certDate: '',
    })
    setPhoto(data.photo_url
      ? { name: data.photo_url.split('/').pop(), preview: data.photo_url, fileObj: null, url: data.photo_url }
      : EMPTY_FILE)
    setSearchResults([])
    toast(`Loaded — ${data.seq_num}/${data.year}`, 'success')
  }

  async function handleDelete() {
    if (!editId) { toast('No record loaded', 'error'); return }
    if (!window.confirm(`Delete baptism record ${slNoDisplay}?`)) return
    setSaving(true)
    try {
      if (photo.url) {
        const idx = photo.url.indexOf('/event-media/'); if (idx >= 0)
          await supabase.storage.from('event-media').remove([photo.url.substring(idx + '/event-media/'.length)])
      }
      const { error } = await supabase.from('baptism_records').delete().eq('id', editId)
      if (error) throw error
      toast(`Record ${slNoDisplay} deleted`, 'success'); handleReset()
    } catch (err) { toast(err.message || 'Delete failed', 'error') }
    finally { setSaving(false) }
  }

  async function handleSearch() {
    if (!searchVal.trim()) { toast('Enter a search value', 'error'); return }
    setSearching(true); setSearchResults([])
    try {
      let query = supabase.from('baptism_records').select('*')
      if (searchBy === 'slNo') {
        const [n, y] = searchVal.split('/'); query = query.eq('seq_num', parseInt(n)); if (y) query = query.eq('year', parseInt(y))
      } else if (searchBy === 'name') {
        query = query.ilike('name', `%${searchVal}%`)
      } else if (searchBy === 'year') {
        query = query.eq('year', parseInt(searchVal))
      }
      const { data, error } = await query.order('year', { ascending: false }).order('seq_num', { ascending: false }).limit(20)
      if (error) throw error
      if (!data?.length) { toast('No records found', 'error'); return }
      if (data.length === 1) { setViewRecord(data[0]); return }
      setSearchResults(data)
    } catch (err) { toast(err.message || 'Search failed', 'error') }
    finally { setSearching(false) }
  }

  return (
    <div style={{ maxWidth: 1100 }}>

      {/* ── Action buttons ── */}
      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom: searchResults.length ? 6 : 18, flexWrap:'wrap' }}>
        <ActionBtn icon={Plus}      label="New"    onClick={handleReset} color="#475569" disabled={saving} />
        <ActionBtn icon={saving ? Loader2 : Save} label={saving ? 'Saving…' : 'Save'} onClick={handleSave} color="#2563eb" disabled={saving} />
        <ActionBtn icon={Edit2}     label={editId ? 'Editing' : 'Edit'} color={editId ? '#0369a1' : '#64748b'} disabled />
        <ActionBtn icon={RotateCcw} label="Reset"  onClick={handleReset} color="#7c3aed" disabled={saving} />
        <ActionBtn icon={Trash2}    label="Delete" onClick={handleDelete} color="#dc2626" disabled={saving || !editId} />
        <div style={{ marginLeft:'auto', display:'flex', gap:8, alignItems:'flex-end' }}>
          <div>
            <div style={lbl()}>Search By</div>
            <select value={searchBy} onChange={e => setSearchBy(e.target.value)} style={{ ...iS, width:140 }}>
              <option value="slNo">Serial No.</option>
              <option value="name">Name</option>
              <option value="year">Year</option>
            </select>
          </div>
          <input value={searchVal} onChange={e => setSearchVal(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSearch()}
            placeholder={searchBy === 'slNo' ? '0001/2026' : searchBy === 'year' ? '2026' : 'Name…'}
            style={{ ...iS, width:140 }} />
          <button onClick={handleSearch} disabled={searching} style={{
            ...iS, width:'auto', padding:'0 16px', background:'#2563eb', color:'#fff',
            border:'none', cursor:'pointer', fontWeight:600, display:'flex', alignItems:'center', gap:6,
            opacity: searching ? 0.7 : 1,
          }}>
            {searching ? <Loader2 size={13} style={{ animation:'spin 1s linear infinite' }} /> : <Search size={13} />} View
          </button>
        </div>
      </div>

      {/* ── Search results ── */}
      {searchResults.length > 0 && (
        <div style={{ background:'#fff', border:'1px solid #e2e8f0', borderRadius:8, marginBottom:18, overflow:'hidden' }}>
          <div style={{ padding:'8px 14px', background:'#f8fafc', borderBottom:'1px solid #e2e8f0', fontSize:12, fontWeight:600, color:'#64748b' }}>
            {searchResults.length} records found — click a row to view
          </div>
          {searchResults.map(r => (
            <button key={r.id} onClick={() => setViewRecord(r)} style={{
              display:'flex', alignItems:'center', gap:14, width:'100%',
              padding:'9px 14px', border:'none', background:'transparent',
              borderBottom:'1px solid #f1f5f9', cursor:'pointer', textAlign:'left', transition:'background 0.12s',
            }}
            onMouseEnter={e => e.currentTarget.style.background = '#f0f9ff'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
              <span style={{ fontFamily:'monospace', fontWeight:700, color:'#2563eb', minWidth:80 }}>
                {String(r.seq_num).padStart(4,'0')}/{r.year}
              </span>
              <span style={{ fontSize:13, color:'#1e293b' }}>{r.name}</span>
            </button>
          ))}
        </div>
      )}

      {/* ── Header block ── */}
      <Card style={{ marginBottom:14 }}>
        <div style={{ display:'flex', alignItems:'stretch' }}>
          <div style={{ flex:1, paddingRight:28 }}>
            <SecHead label="Serial Number" color="#2563eb" small />
            <div style={{ display:'flex', alignItems:'center', gap:6 }}>
              <div>
                <div style={lbl()}>Seq. No.</div>
                <input type="number" value={form.seqNum} onChange={handleSeqChange}
                  placeholder="1" min={1} readOnly={!!editId}
                  style={{ ...iS, width:72, textAlign:'center',
                    background: editId ? '#f1f5f9' : '#fff', cursor: editId ? 'not-allowed' : 'auto',
                    borderColor: seqNumTaken ? '#dc2626' : undefined,
                    boxShadow: seqNumTaken ? '0 0 0 2px #fecaca' : undefined,
                  }} />
                {seqNumTaken && <div style={{ fontSize:10, color:'#dc2626', fontWeight:600, marginTop:3 }}>Already exists</div>}
              </div>
              <span style={{ fontSize:22, fontWeight:700, color:'#94a3b8', paddingTop:18 }}>/</span>
              <div>
                <div style={lbl()}>Year</div>
                <div style={{ ...iS, width:62, display:'flex', alignItems:'center', justifyContent:'center', background:'#f1f5f9', color:'#475569', fontWeight:700 }}>{form.year}</div>
              </div>
            </div>
            <div style={{ marginTop:10, fontFamily:'monospace', fontSize:22, fontWeight:800, color:'#2563eb', letterSpacing:'0.06em' }}>
              {slNoDisplay}
            </div>
          </div>
          <VDivider />
          <div style={{ flex:1, padding:'0 28px' }}>
            <SecHead label="Baptism Date & Type" color="#2563eb" small />
            <div style={{ display:'flex', gap:10 }}>
              <div>
                <div style={lbl()}>Date of Baptism</div>
                <input value={form.dateOfBaptism} onChange={set('dateOfBaptism')} placeholder="DD-MM-YYYY" style={{ ...iS, width:140 }} />
              </div>
              <div>
                <div style={lbl()}>Baptism Type</div>
                <select value={form.baptismType} onChange={set('baptismType')} style={{ ...iS, width:150 }}>
                  <option value="">-- Select --</option>
                  <option value="Infant Baptism">Infant Baptism</option>
                  <option value="Adult Baptism">Adult Baptism</option>
                  <option value="Believer's Baptism">Believer's Baptism</option>
                  <option value="Emergency Baptism">Emergency Baptism</option>
                </select>
              </div>
            </div>
          </div>
          <VDivider />
          <div style={{ flex:1, paddingLeft:28 }}>
            <SecHead label="Date of Birth" color="#2563eb" small />
            <div style={lbl()}>D.O.B.</div>
            <input value={form.dateOfBirth} onChange={set('dateOfBirth')} placeholder="DD-MM-YYYY" style={{ ...iS, width:160 }} />
          </div>
        </div>
      </Card>

      {/* ── Personal + Photo ── */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 220px', gap:14, marginBottom:14 }}>
        <Card>
          <SecHead label="Personal Details" color="#2563eb" />
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
            <F label="Full Name" color="#2563eb">
              <input value={form.name} onChange={set('name')} style={{ ...iS, width:'100%' }} />
            </F>
            <F label="Gender" color="#2563eb">
              <select value={form.gender} onChange={set('gender')} style={{ ...iS, width:'100%' }}>
                <option value="">-- Select --</option>
                <option value="Male">Male</option>
                <option value="Female">Female</option>
                <option value="Transgender">Transgender</option>
              </select>
            </F>
          </div>
        </Card>
        <Card>
          <SecHead label="Photo" color="#7c3aed" small />
          <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:8 }}>
            <div style={{ width:110, height:110, border:`2px dashed ${photo.name ? '#a78bfa' : '#cbd5e1'}`,
              borderRadius:8, background: photo.name ? '#f5f3ff' : '#f8fafc',
              display:'flex', alignItems:'center', justifyContent:'center', overflow:'hidden' }}>
              {photo.preview
                ? <img src={photo.preview} alt="photo" style={{ width:'100%', height:'100%', objectFit:'cover' }} />
                : <Camera size={24} style={{ color:'#c4b5fd' }} />}
            </div>
            <button onClick={() => photoRef.current?.click()} style={uploadBtnStyle(!!photo.name, '#7c3aed')}>
              <Upload size={11} /> {photo.name ? 'Change' : 'Upload'}
            </button>
            <input type="file" accept="image/*" ref={photoRef} onChange={handlePhoto} style={{ display:'none' }} />
          </div>
        </Card>
      </div>

      {/* ── Parents ── */}
      <Card style={{ marginBottom:14 }}>
        <SecHead label="Parent's Details" color="#0369a1" />
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:10 }}>
          <F label="Father's Name" color="#0369a1">
            <input value={form.fatherName} onChange={set('fatherName')} style={{ ...iS, width:'100%' }} />
          </F>
          <F label="Mother's Name" color="#0369a1">
            <input value={form.motherName} onChange={set('motherName')} style={{ ...iS, width:'100%' }} />
          </F>
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
          <F label="Profession of Father / Mother" color="#0369a1">
            <input value={form.professionOfParents} onChange={set('professionOfParents')} style={{ ...iS, width:'100%' }} />
          </F>
          <F label="Place of Abode / Address" color="#0369a1">
            <input value={form.address} onChange={set('address')} style={{ ...iS, width:'100%' }} />
          </F>
        </div>
      </Card>

      {/* ── Ceremony ── */}
      <Card style={{ marginBottom:14 }}>
        <SecHead label="Ceremony Details" color="#7c3aed" />
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:10 }}>
          <F label="Place of Baptism" color="#7c3aed">
            <input value={form.placeOfBaptism} onChange={set('placeOfBaptism')} style={{ ...iS, width:'100%' }} />
          </F>
          <F label="By Whom Baptized" color="#7c3aed">
            <input value={form.baptizedBy} onChange={set('baptizedBy')} style={{ ...iS, width:'100%' }} />
          </F>
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
          <F label="God Parents (if any)" color="#7c3aed">
            <input value={form.godParents} onChange={set('godParents')} style={{ ...iS, width:'100%' }} />
          </F>
          <F label="Remarks" color="#7c3aed">
            <input value={form.remarks} onChange={set('remarks')} style={{ ...iS, width:'100%' }} />
          </F>
        </div>
      </Card>

      {/* ── Reports ── */}
      <Card>
        <div style={{ display:'flex', alignItems:'center', gap:12 }}>
          <span style={{ fontSize:11, fontWeight:800, color:'#ef4444', letterSpacing:'0.1em', textTransform:'uppercase' }}>Reports</span>
          <ReportBtn label="Baptism Extract" onClick={() => setShowCert(true)} color="#800020" />
        </div>
      </Card>

      {/* ── Modals ── */}
      {viewRecord && (
        <BaptismViewModal record={viewRecord} onClose={() => setViewRecord(null)}
          onEdit={() => { handleLoad(viewRecord.id); setViewRecord(null) }} />
      )}
      {showCert && (
        <BaptismCertModal form={form} photo={photo} onClose={() => setShowCert(false)} />
      )}
    </div>
  )
}

/* ─── Baptism View Modal ─────────────────────────────────────────── */
function BaptismViewModal({ record: r, onClose, onEdit }) {
  const slNo = `${String(r.seq_num).padStart(4,'0')}/${r.year}`
  function Row({ label, value }) {
    if (!value) return null
    return (
      <div style={{ display:'flex', gap:8, padding:'5px 0', borderBottom:'1px solid #f1f5f9' }}>
        <span style={{ minWidth:180, fontSize:12, color:'#64748b', flexShrink:0 }}>{label}</span>
        <span style={{ fontSize:13, fontWeight:500, color:'#1e293b' }}>{value}</span>
      </div>
    )
  }
  return (
    <div style={{ position:'fixed', inset:0, zIndex:1000, background:'rgba(0,0,0,0.55)',
      display:'flex', alignItems:'center', justifyContent:'center', padding:24 }} onClick={onClose}>
      <div style={{ background:'#fff', borderRadius:14, width:'100%', maxWidth:580,
        maxHeight:'90vh', overflow:'auto', boxShadow:'0 24px 60px rgba(0,0,0,0.3)' }}
        onClick={e => e.stopPropagation()}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between',
          padding:'18px 24px', borderBottom:'1px solid #e2e8f0', position:'sticky', top:0, background:'#fff', zIndex:10 }}>
          <div>
            <div style={{ fontSize:11, color:'#64748b', fontWeight:600, letterSpacing:'0.08em', textTransform:'uppercase' }}>Baptism Record</div>
            <div style={{ fontSize:22, fontWeight:800, color:'#1e293b', fontFamily:'monospace' }}>{slNo}</div>
          </div>
          <div style={{ display:'flex', gap:8 }}>
            <button onClick={onEdit} style={{ display:'flex', alignItems:'center', gap:6, padding:'8px 18px', borderRadius:7, border:'none', background:'#2563eb', color:'#fff', fontWeight:700, fontSize:13, cursor:'pointer' }}>
              <Edit2 size={14} /> Edit
            </button>
            <button onClick={onClose} style={{ display:'flex', alignItems:'center', gap:6, padding:'8px 14px', borderRadius:7, border:'1px solid #e2e8f0', background:'#fff', color:'#64748b', fontWeight:600, fontSize:13, cursor:'pointer' }}>
              <X size={14} /> Close
            </button>
          </div>
        </div>
        <div style={{ padding:'24px', display:'flex', gap:24 }}>
          {r.photo_url && (
            <div style={{ flexShrink:0 }}>
              <img src={r.photo_url} alt="photo" style={{ width:100, height:100, objectFit:'cover', borderRadius:8, border:'2px solid #e2e8f0' }} />
            </div>
          )}
          <div style={{ flex:1 }}>
            <Row label="Serial Number"           value={slNo} />
            <Row label="Name"                    value={r.name} />
            <Row label="Gender"                  value={r.gender} />
            <Row label="Date of Baptism"         value={r.date_of_baptism} />
            <Row label="Baptism Type"            value={r.baptism_type} />
            <Row label="Date of Birth"           value={r.date_of_birth} />
            <Row label="Father's Name"           value={r.father_name} />
            <Row label="Mother's Name"           value={r.mother_name} />
            <Row label="Profession of Parents"   value={r.profession_of_parents} />
            <Row label="Address"                 value={r.address} />
            <Row label="Place of Baptism"        value={r.place_of_baptism} />
            <Row label="By Whom Baptized"        value={r.baptized_by} />
            <Row label="God Parents"             value={r.god_parents} />
            <Row label="Remarks"                 value={r.remarks} />
          </div>
        </div>
      </div>
    </div>
  )
}

/* ─── Baptism Certificate Modal ──────────────────────────────────── */
function BaptismCertModal({ form, photo, onClose }) {
  const [church,   setChurch]   = useState(null)
  const [certDate, setCertDate] = useState(form.certDate || '')

  useEffect(() => {
    supabase.from('churches').select('church_name,denomination,diocese,address,city,pincode,logo_url,diocese_logo_url,treasurer_seal_url,presbyter_name,pastor_name').limit(1).single()
      .then(({ data }) => setChurch(data))
  }, [])

  const seqPadded = form.seqNum ? String(form.seqNum).padStart(4,'0') : '____'
  const slNo = `${seqPadded}/${form.year}`
  const churchLine = [church?.church_name, church?.address, church?.city, church?.pincode].filter(Boolean).join(', ')
  const presbyter = church?.presbyter_name || church?.pastor_name || ''

  const BL = '#1a237e'   // base dark blue matching the certificate

  function Line({ label, value, dashed = true }) {
    return (
      <div style={{ display:'flex', alignItems:'baseline', gap:8, marginBottom:10 }}>
        <span style={{ minWidth:190, fontSize:11, color:BL }}>{label}</span>
        <span style={{ flex:1, fontSize:11, color:BL, fontWeight: value ? 600 : 400,
          borderBottom: dashed ? '1px dotted #888' : 'none', paddingBottom:2, minHeight:18 }}>
          {value || ''}
        </span>
      </div>
    )
  }

  function handlePrint() {
    const el  = document.getElementById('baptism-cert-content')
    const win = window.open('', '_blank', 'width=700,height=900')
    win.document.write(`<!DOCTYPE html><html><head>
      <title>Baptism Extract — ${slNo}</title>
      <style>
        @page { size: A5 portrait; margin: 0; }
        * { margin:0; padding:0; box-sizing:border-box; }
        body { font-family: Arial, sans-serif; font-size: 10pt; color: #1a237e; background: #e8f5e9; }
      </style>
    </head><body>${el.innerHTML}</body></html>`)
    win.document.close()
    setTimeout(() => { win.focus(); win.print() }, 500)
  }

  return (
    <div style={{ position:'fixed', inset:0, zIndex:1000, background:'rgba(0,0,0,0.7)',
      display:'flex', flexDirection:'column', alignItems:'center', padding:'16px 12px', overflow:'auto' }}>

      {/* Toolbar */}
      <div style={{ display:'flex', gap:10, marginBottom:12, width:560, flexShrink:0, justifyContent:'space-between', alignItems:'center' }}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <span style={{ color:'#fff', fontWeight:700, fontSize:14 }}>Baptism Extract — {slNo}</span>
          <input value={certDate} onChange={e => setCertDate(e.target.value)}
            placeholder="Date of Extract" style={{ ...iS, width:140, fontSize:12 }} />
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <button onClick={handlePrint} style={{ display:'flex', alignItems:'center', gap:6, padding:'8px 18px', borderRadius:7, border:'none', background:'#2563eb', color:'#fff', fontWeight:700, fontSize:13, cursor:'pointer' }}>
            <Printer size={15} /> Print / Save PDF
          </button>
          <button onClick={onClose} style={{ display:'flex', alignItems:'center', gap:6, padding:'8px 14px', borderRadius:7, border:'1px solid rgba(255,255,255,0.3)', background:'transparent', color:'#fff', fontWeight:600, fontSize:13, cursor:'pointer' }}>
            <X size={14} /> Close
          </button>
        </div>
      </div>

      {/* Certificate — A5 portrait */}
      <div id="baptism-cert-content" style={{
        width:560, background:'#e8f5e9', flexShrink:0,
        boxShadow:'0 8px 32px rgba(0,0,0,0.4)',
        fontFamily:'Arial, sans-serif', color:BL,
        padding:'24px 32px',
      }}>

        {/* Church Header */}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12 }}>
          {church?.logo_url
            ? <img src={church.logo_url} alt="logo" style={{ width:64, height:64, objectFit:'contain' }} />
            : <div style={{ width:64 }} />}
          <div style={{ textAlign:'center', flex:1, padding:'0 12px' }}>
            <div style={{ fontSize:11, fontWeight:700, color:BL }}>{church?.denomination || 'CHURCH OF SOUTH INDIA'}</div>
            <div style={{ fontSize:10, color:BL }}>{church?.diocese || ''}</div>
            <div style={{ fontSize:16, fontWeight:800, color:BL, margin:'2px 0' }}>{church?.church_name || ''}</div>
            <div style={{ fontSize:10, color:BL }}>{[church?.address, church?.city, church?.pincode].filter(Boolean).join(', ')}</div>
          </div>
          {church?.diocese_logo_url
            ? <img src={church.diocese_logo_url} alt="seal" style={{ width:64, height:64, objectFit:'contain' }} />
            : <div style={{ width:64 }} />}
        </div>

        <hr style={{ borderColor:`${BL}44`, marginBottom:10 }} />

        {/* S.No + Date row */}
        <div style={{ display:'flex', justifyContent:'space-between', marginBottom:12, fontSize:11 }}>
          <span><strong>S.No.</strong> {slNo}</span>
          <span>Date : {certDate || '.....................'}</span>
        </div>

        {/* Extract title */}
        <div style={{ textAlign:'center', marginBottom:14 }}>
          <div style={{ fontSize:11, fontWeight:700, color:BL }}>Extract of the Baptism Register kept at</div>
          <div style={{ fontSize:11, fontWeight:700, color:BL }}>{churchLine || '........................................'}</div>
        </div>

        {/* Fields */}
        <Line label="Date of Baptism"           value={form.dateOfBaptism} />
        <Line label="Baptism Type"              value={form.baptismType} />
        <Line label="Date of Birth"             value={form.dateOfBirth} />
        <Line label="Name"                      value={form.name} />
        <Line label="Gender"                    value={form.gender} />
        <div style={{ fontSize:11, fontWeight:700, color:BL, marginBottom:6, textDecoration:'underline' }}>Parent's Name</div>
        <div style={{ paddingLeft:24 }}>
          <Line label="Father" value={form.fatherName} />
          <Line label="Mother" value={form.motherName} />
        </div>
        <Line label="Profession of Father/Mother" value={form.professionOfParents} />
        <Line label="Place of abode/Address"    value={form.address} />
        <Line label="Place of Baptism"          value={form.placeOfBaptism} />
        <Line label="By Whom Baptized"          value={form.baptizedBy} />
        <Line label="God Parents (if any)"      value={form.godParents} />
        <div style={{ display:'flex', alignItems:'baseline', gap:8, marginBottom:4 }}>
          <span style={{ minWidth:190, fontSize:11, color:BL }}>Remarks</span>
          <span style={{ flex:1, borderBottom:'1px dotted #888', minHeight:18 }}>{form.remarks || ''}</span>
        </div>
        <div style={{ borderBottom:'1px dotted #888', minHeight:16, marginBottom:2 }} />
        <div style={{ borderBottom:'1px dotted #888', minHeight:16, marginBottom:16 }} />

        {/* Certification text */}
        <div style={{ fontSize:10, color:BL, marginBottom:4 }}>
          I<span style={{ display:'inline-block', minWidth:260, borderBottom:'1px dotted #888', marginLeft:4, marginRight:4 }}>
            {presbyter ? ` ${presbyter} ` : ''}
          </span> Certify that this is the true extract of the Baptism
        </div>
        <div style={{ fontSize:10, color:BL, marginBottom:20 }}>Register maintained in this Church.</div>

        {/* Footer */}
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-end' }}>
          <div style={{ fontSize:10, color:BL }}>
            <div>Place : .........................</div>
            <div style={{ marginTop:6 }}>Date &nbsp;: .........................</div>
          </div>
          <div style={{ textAlign:'right', fontSize:10, color:BL }}>
            <div>Signature of the Presbyter</div>
            <div style={{ marginTop:4 }}>Seal</div>
          </div>
        </div>

      </div>
    </div>
  )
}

/* ─── Confirmation Tab ───────────────────────────────────────────── */
const EMPTY_CONFIRMATION = {
  seqNum: '', year: new Date().getFullYear(),
  dateOfConfirmation: '', dateOfBirth: '',
  name: '', gender: '',
  fatherName: '', motherName: '',
  address: '',
  dateOfBaptism: '', placeOfBaptism: '', baptizedBy: '', baptismRegNo: '',
  placeOfConfirmation: '', confirmedBy: '',
  remarks: '', certDate: '',
}

function ConfirmationTab() {
  const { toast } = useToast()
  const [form,    setForm]    = useState(EMPTY_CONFIRMATION)
  const [photo,   setPhoto]   = useState(EMPTY_FILE)
  const [editId,  setEditId]  = useState(null)
  const [saving,  setSaving]  = useState(false)
  const [seqNumTaken, setSeqNumTaken] = useState(false)
  const [searchBy,  setSearchBy]  = useState('slNo')
  const [searchVal, setSearchVal] = useState('')
  const [searching, setSearching] = useState(false)
  const [searchResults, setSearchResults] = useState([])
  const [viewRecord,  setViewRecord]  = useState(null)
  const [showCert, setShowCert] = useState(false)
  const photoRef = useRef()

  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }))

  async function getNext(yr) {
    const { data } = await supabase.from('confirmation_records').select('seq_num')
      .eq('year', yr).order('seq_num', { ascending: false }).limit(1).maybeSingle()
    return data ? data.seq_num + 1 : 1
  }

  useEffect(() => {
    getNext(new Date().getFullYear()).then(n => setForm(f => ({ ...f, seqNum: String(n) })))
  }, []) // eslint-disable-line

  async function handleReset() {
    setPhoto(EMPTY_FILE); setEditId(null); setSeqNumTaken(false); setSearchResults([])
    const n = await getNext(new Date().getFullYear())
    setForm({ ...EMPTY_CONFIRMATION, seqNum: String(n) })
  }

  function handleSeqChange(e) {
    const val = e.target.value
    setForm(f => ({ ...f, seqNum: val })); setSeqNumTaken(false)
    if (!val || editId) return
    supabase.from('confirmation_records').select('id').eq('seq_num', parseInt(val)).eq('year', parseInt(form.year))
      .maybeSingle().then(({ data }) => setSeqNumTaken(!!data))
  }

  function handlePhoto(e) {
    const file = e.target.files?.[0]; if (!file) return
    const reader = new FileReader()
    reader.onload = ev => setPhoto({ name: file.name, preview: ev.target.result, fileObj: file, url: null })
    reader.readAsDataURL(file); e.target.value = ''
  }

  const seqPadded   = form.seqNum ? String(form.seqNum).padStart(4,'0') : '0000'
  const slNoDisplay = `${seqPadded}/${form.year}`
  const slNoPath    = `${seqPadded}-${form.year}`

  async function handleSave() {
    if (!form.seqNum) { toast('Enter a Serial Number', 'error'); return }
    if (seqNumTaken) { toast(`Serial No. ${slNoDisplay} already exists`, 'error'); return }
    if (!form.name)  { toast('Enter the name', 'error'); return }
    if (!editId) {
      const { data: ex } = await supabase.from('confirmation_records').select('id')
        .eq('seq_num', parseInt(form.seqNum)).eq('year', parseInt(form.year)).maybeSingle()
      if (ex) { toast(`Serial No. ${slNoDisplay} already exists`, 'error'); return }
    }
    setSaving(true)
    try {
      let photoUrl = photo.url || null
      if (photo.fileObj) {
        const ext = photo.fileObj.name.split('.').pop()
        const path = `confirmation/${slNoPath}/photo.${ext}`
        const { error: upErr } = await supabase.storage.from('event-media').upload(path, photo.fileObj, { upsert: true })
        if (upErr) throw upErr
        const { data: pd } = supabase.storage.from('event-media').getPublicUrl(path)
        photoUrl = pd.publicUrl
      }
      const record = {
        seq_num: parseInt(form.seqNum), year: parseInt(form.year),
        date_of_confirmation: form.dateOfConfirmation || null,
        date_of_birth: form.dateOfBirth || null,
        name: form.name || null, gender: form.gender || null,
        father_name: form.fatherName || null, mother_name: form.motherName || null,
        address: form.address || null,
        date_of_baptism: form.dateOfBaptism || null,
        place_of_baptism: form.placeOfBaptism || null,
        baptized_by: form.baptizedBy || null,
        baptism_reg_no: form.baptismRegNo || null,
        place_of_confirmation: form.placeOfConfirmation || null,
        confirmed_by: form.confirmedBy || null,
        remarks: form.remarks || null,
        photo_url: photoUrl, updated_at: new Date().toISOString(),
      }
      let error, newId
      if (editId) {
        ;({ error } = await supabase.from('confirmation_records').update(record).eq('id', editId))
      } else {
        const { data, error: insErr } = await supabase.from('confirmation_records').insert(record).select('id').single()
        error = insErr; newId = data?.id
      }
      if (error) throw error
      if (newId) setEditId(newId)
      if (photoUrl) setPhoto(p => ({ ...p, url: photoUrl, fileObj: null }))
      toast(`Confirmation record ${editId ? 'updated' : 'saved'} — ${slNoDisplay}`, 'success')
    } catch (err) { toast(err.message || 'Save failed', 'error') }
    finally { setSaving(false) }
  }

  async function handleLoad(id) {
    const { data, error } = await supabase.from('confirmation_records').select('*').eq('id', id).single()
    if (error || !data) { toast('Record not found', 'error'); return }
    setEditId(data.id)
    setForm({
      seqNum: String(data.seq_num ?? ''), year: data.year ?? new Date().getFullYear(),
      dateOfConfirmation: data.date_of_confirmation ?? '',
      dateOfBirth: data.date_of_birth ?? '',
      name: data.name ?? '', gender: data.gender ?? '',
      fatherName: data.father_name ?? '', motherName: data.mother_name ?? '',
      address: data.address ?? '',
      dateOfBaptism: data.date_of_baptism ?? '',
      placeOfBaptism: data.place_of_baptism ?? '',
      baptizedBy: data.baptized_by ?? '',
      baptismRegNo: data.baptism_reg_no ?? '',
      placeOfConfirmation: data.place_of_confirmation ?? '',
      confirmedBy: data.confirmed_by ?? '',
      remarks: data.remarks ?? '', certDate: '',
    })
    setPhoto(data.photo_url
      ? { name: data.photo_url.split('/').pop(), preview: data.photo_url, fileObj: null, url: data.photo_url }
      : EMPTY_FILE)
    setSearchResults([])
    toast(`Loaded — ${data.seq_num}/${data.year}`, 'success')
  }

  async function handleDelete() {
    if (!editId) { toast('No record loaded', 'error'); return }
    if (!window.confirm(`Delete confirmation record ${slNoDisplay}?`)) return
    setSaving(true)
    try {
      if (photo.url) {
        const idx = photo.url.indexOf('/event-media/'); if (idx >= 0)
          await supabase.storage.from('event-media').remove([photo.url.substring(idx + '/event-media/'.length)])
      }
      const { error } = await supabase.from('confirmation_records').delete().eq('id', editId)
      if (error) throw error
      toast(`Record ${slNoDisplay} deleted`, 'success'); handleReset()
    } catch (err) { toast(err.message || 'Delete failed', 'error') }
    finally { setSaving(false) }
  }

  async function handleSearch() {
    if (!searchVal.trim()) { toast('Enter a search value', 'error'); return }
    setSearching(true); setSearchResults([])
    try {
      let query = supabase.from('confirmation_records').select('*')
      if (searchBy === 'slNo') {
        const [n, y] = searchVal.split('/'); query = query.eq('seq_num', parseInt(n)); if (y) query = query.eq('year', parseInt(y))
      } else if (searchBy === 'name') {
        query = query.ilike('name', `%${searchVal}%`)
      } else if (searchBy === 'year') {
        query = query.eq('year', parseInt(searchVal))
      }
      const { data, error } = await query.order('year', { ascending: false }).order('seq_num', { ascending: false }).limit(20)
      if (error) throw error
      if (!data?.length) { toast('No records found', 'error'); return }
      if (data.length === 1) { setViewRecord(data[0]); return }
      setSearchResults(data)
    } catch (err) { toast(err.message || 'Search failed', 'error') }
    finally { setSearching(false) }
  }

  return (
    <div style={{ maxWidth: 1100 }}>

      {/* ── Action buttons ── */}
      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom: searchResults.length ? 6 : 18, flexWrap:'wrap' }}>
        <ActionBtn icon={Plus}      label="New"    onClick={handleReset} color="#475569" disabled={saving} />
        <ActionBtn icon={saving ? Loader2 : Save} label={saving ? 'Saving…' : 'Save'} onClick={handleSave} color="#2563eb" disabled={saving} />
        <ActionBtn icon={Edit2}     label={editId ? 'Editing' : 'Edit'} color={editId ? '#0369a1' : '#64748b'} disabled />
        <ActionBtn icon={RotateCcw} label="Reset"  onClick={handleReset} color="#7c3aed" disabled={saving} />
        <ActionBtn icon={Trash2}    label="Delete" onClick={handleDelete} color="#dc2626" disabled={saving || !editId} />
        <div style={{ marginLeft:'auto', display:'flex', gap:8, alignItems:'flex-end' }}>
          <div>
            <div style={lbl()}>Search By</div>
            <select value={searchBy} onChange={e => setSearchBy(e.target.value)} style={{ ...iS, width:140 }}>
              <option value="slNo">Serial No.</option>
              <option value="name">Name</option>
              <option value="year">Year</option>
            </select>
          </div>
          <input value={searchVal} onChange={e => setSearchVal(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSearch()}
            placeholder={searchBy === 'slNo' ? '0001/2026' : searchBy === 'year' ? '2026' : 'Name…'}
            style={{ ...iS, width:140 }} />
          <button onClick={handleSearch} disabled={searching} style={{
            ...iS, width:'auto', padding:'0 16px', background:'#2563eb', color:'#fff',
            border:'none', cursor:'pointer', fontWeight:600, display:'flex', alignItems:'center', gap:6,
            opacity: searching ? 0.7 : 1,
          }}>
            {searching ? <Loader2 size={13} style={{ animation:'spin 1s linear infinite' }} /> : <Search size={13} />} View
          </button>
        </div>
      </div>

      {/* ── Search results ── */}
      {searchResults.length > 0 && (
        <div style={{ background:'#fff', border:'1px solid #e2e8f0', borderRadius:8, marginBottom:18, overflow:'hidden' }}>
          <div style={{ padding:'8px 14px', background:'#f8fafc', borderBottom:'1px solid #e2e8f0', fontSize:12, fontWeight:600, color:'#64748b' }}>
            {searchResults.length} records found — click a row to view
          </div>
          {searchResults.map(r => (
            <button key={r.id} onClick={() => setViewRecord(r)} style={{
              display:'flex', alignItems:'center', gap:14, width:'100%',
              padding:'9px 14px', border:'none', background:'transparent',
              borderBottom:'1px solid #f1f5f9', cursor:'pointer', textAlign:'left', transition:'background 0.12s',
            }}
            onMouseEnter={e => e.currentTarget.style.background = '#f0f9ff'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
              <span style={{ fontFamily:'monospace', fontWeight:700, color:'#2563eb', minWidth:80 }}>
                {String(r.seq_num).padStart(4,'0')}/{r.year}
              </span>
              <span style={{ fontSize:13, color:'#1e293b' }}>{r.name}</span>
            </button>
          ))}
        </div>
      )}

      {/* ── Header block ── */}
      <Card style={{ marginBottom:14 }}>
        <div style={{ display:'flex', alignItems:'stretch' }}>
          <div style={{ flex:1, paddingRight:28 }}>
            <SecHead label="Serial Number" color="#2563eb" small />
            <div style={{ display:'flex', alignItems:'center', gap:6 }}>
              <div>
                <div style={lbl()}>Seq. No.</div>
                <input type="number" value={form.seqNum} onChange={handleSeqChange}
                  placeholder="1" min={1} readOnly={!!editId}
                  style={{ ...iS, width:72, textAlign:'center',
                    background: editId ? '#f1f5f9' : '#fff', cursor: editId ? 'not-allowed' : 'auto',
                    borderColor: seqNumTaken ? '#dc2626' : undefined,
                    boxShadow: seqNumTaken ? '0 0 0 2px #fecaca' : undefined,
                  }} />
                {seqNumTaken && <div style={{ fontSize:10, color:'#dc2626', fontWeight:600, marginTop:3 }}>Already exists</div>}
              </div>
              <span style={{ fontSize:22, fontWeight:700, color:'#94a3b8', paddingTop:18 }}>/</span>
              <div>
                <div style={lbl()}>Year</div>
                <div style={{ ...iS, width:62, display:'flex', alignItems:'center', justifyContent:'center', background:'#f1f5f9', color:'#475569', fontWeight:700 }}>{form.year}</div>
              </div>
            </div>
            <div style={{ marginTop:10, fontFamily:'monospace', fontSize:22, fontWeight:800, color:'#2563eb', letterSpacing:'0.06em' }}>
              {slNoDisplay}
            </div>
          </div>
          <VDivider />
          <div style={{ flex:1, padding:'0 28px' }}>
            <SecHead label="Confirmation Date" color="#2563eb" small />
            <div style={lbl()}>Date of Confirmation</div>
            <input value={form.dateOfConfirmation} onChange={set('dateOfConfirmation')} placeholder="DD-MM-YYYY" style={{ ...iS, width:160 }} />
          </div>
          <VDivider />
          <div style={{ flex:1, paddingLeft:28 }}>
            <SecHead label="Date of Birth" color="#2563eb" small />
            <div style={lbl()}>D.O.B.</div>
            <input value={form.dateOfBirth} onChange={set('dateOfBirth')} placeholder="DD-MM-YYYY" style={{ ...iS, width:160 }} />
          </div>
        </div>
      </Card>

      {/* ── Personal + Photo ── */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 220px', gap:14, marginBottom:14 }}>
        <Card>
          <SecHead label="Personal Details" color="#2563eb" />
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
            <F label="Full Name" color="#2563eb">
              <input value={form.name} onChange={set('name')} style={{ ...iS, width:'100%' }} />
            </F>
            <F label="Gender" color="#2563eb">
              <select value={form.gender} onChange={set('gender')} style={{ ...iS, width:'100%' }}>
                <option value="">-- Select --</option>
                <option value="Male">Male</option>
                <option value="Female">Female</option>
                <option value="Transgender">Transgender</option>
              </select>
            </F>
          </div>
        </Card>
        <Card>
          <SecHead label="Photo" color="#7c3aed" small />
          <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:8 }}>
            <div style={{ width:110, height:110, border:`2px dashed ${photo.name ? '#a78bfa' : '#cbd5e1'}`,
              borderRadius:8, background: photo.name ? '#f5f3ff' : '#f8fafc',
              display:'flex', alignItems:'center', justifyContent:'center', overflow:'hidden' }}>
              {photo.preview
                ? <img src={photo.preview} alt="photo" style={{ width:'100%', height:'100%', objectFit:'cover' }} />
                : <Camera size={24} style={{ color:'#c4b5fd' }} />}
            </div>
            <button onClick={() => photoRef.current?.click()} style={uploadBtnStyle(!!photo.name, '#7c3aed')}>
              <Upload size={11} /> {photo.name ? 'Change' : 'Upload'}
            </button>
            <input type="file" accept="image/*" ref={photoRef} onChange={handlePhoto} style={{ display:'none' }} />
          </div>
        </Card>
      </div>

      {/* ── Parents ── */}
      <Card style={{ marginBottom:14 }}>
        <SecHead label="Parent's Details" color="#0369a1" />
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:10 }}>
          <F label="Father's Name" color="#0369a1">
            <input value={form.fatherName} onChange={set('fatherName')} style={{ ...iS, width:'100%' }} />
          </F>
          <F label="Mother's Name" color="#0369a1">
            <input value={form.motherName} onChange={set('motherName')} style={{ ...iS, width:'100%' }} />
          </F>
        </div>
        <F label="Place of Abode / Address" color="#0369a1">
          <input value={form.address} onChange={set('address')} style={{ ...iS, width:'100%' }} />
        </F>
      </Card>

      {/* ── Baptism Details ── */}
      <Card style={{ marginBottom:14 }}>
        <SecHead label="Baptism Details" color="#0369a1" />
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr 1fr', gap:10 }}>
          <F label="Date of Baptism" color="#0369a1">
            <input value={form.dateOfBaptism} onChange={set('dateOfBaptism')} placeholder="DD-MM-YYYY" style={{ ...iS, width:'100%' }} />
          </F>
          <F label="Place of Baptism" color="#0369a1">
            <input value={form.placeOfBaptism} onChange={set('placeOfBaptism')} style={{ ...iS, width:'100%' }} />
          </F>
          <F label="Baptized By" color="#0369a1">
            <input value={form.baptizedBy} onChange={set('baptizedBy')} style={{ ...iS, width:'100%' }} />
          </F>
          <F label="Baptism Reg. No." color="#0369a1">
            <input value={form.baptismRegNo} onChange={set('baptismRegNo')} placeholder="e.g. 0012/2010" style={{ ...iS, width:'100%' }} />
          </F>
        </div>
      </Card>

      {/* ── Ceremony ── */}
      <Card style={{ marginBottom:14 }}>
        <SecHead label="Ceremony Details" color="#7c3aed" />
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:10 }}>
          <F label="Place of Confirmation" color="#7c3aed">
            <input value={form.placeOfConfirmation} onChange={set('placeOfConfirmation')} style={{ ...iS, width:'100%' }} />
          </F>
          <F label="Confirmed By" color="#7c3aed">
            <input value={form.confirmedBy} onChange={set('confirmedBy')} style={{ ...iS, width:'100%' }} />
          </F>
        </div>
        <F label="Remarks" color="#7c3aed">
          <input value={form.remarks} onChange={set('remarks')} style={{ ...iS, width:'100%' }} />
        </F>
      </Card>

      {/* ── Reports ── */}
      <Card>
        <div style={{ display:'flex', alignItems:'center', gap:12 }}>
          <span style={{ fontSize:11, fontWeight:800, color:'#ef4444', letterSpacing:'0.1em', textTransform:'uppercase' }}>Reports</span>
          <ReportBtn label="Confirmation Extract" onClick={() => setShowCert(true)} color="#800020" />
        </div>
      </Card>

      {/* ── Modals ── */}
      {viewRecord && (
        <ConfirmationViewModal record={viewRecord} onClose={() => setViewRecord(null)}
          onEdit={() => { handleLoad(viewRecord.id); setViewRecord(null) }} />
      )}
      {showCert && (
        <ConfirmationCertModal form={form} photo={photo} onClose={() => setShowCert(false)} />
      )}
    </div>
  )
}

/* ─── Confirmation View Modal ────────────────────────────────────── */
function ConfirmationViewModal({ record: r, onClose, onEdit }) {
  const slNo = `${String(r.seq_num).padStart(4,'0')}/${r.year}`
  function Row({ label, value }) {
    if (!value) return null
    return (
      <div style={{ display:'flex', gap:8, padding:'5px 0', borderBottom:'1px solid #f1f5f9' }}>
        <span style={{ minWidth:180, fontSize:12, color:'#64748b', flexShrink:0 }}>{label}</span>
        <span style={{ fontSize:13, fontWeight:500, color:'#1e293b' }}>{value}</span>
      </div>
    )
  }
  return (
    <div style={{ position:'fixed', inset:0, zIndex:1000, background:'rgba(0,0,0,0.55)',
      display:'flex', alignItems:'center', justifyContent:'center', padding:24 }} onClick={onClose}>
      <div style={{ background:'#fff', borderRadius:14, width:'100%', maxWidth:580,
        maxHeight:'90vh', overflow:'auto', boxShadow:'0 24px 60px rgba(0,0,0,0.3)' }}
        onClick={e => e.stopPropagation()}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between',
          padding:'18px 24px', borderBottom:'1px solid #e2e8f0', position:'sticky', top:0, background:'#fff', zIndex:10 }}>
          <div>
            <div style={{ fontSize:11, color:'#64748b', fontWeight:600, letterSpacing:'0.08em', textTransform:'uppercase' }}>Confirmation Record</div>
            <div style={{ fontSize:22, fontWeight:800, color:'#1e293b', fontFamily:'monospace' }}>{slNo}</div>
          </div>
          <div style={{ display:'flex', gap:8 }}>
            <button onClick={onEdit} style={{ display:'flex', alignItems:'center', gap:6, padding:'8px 18px', borderRadius:7, border:'none', background:'#2563eb', color:'#fff', fontWeight:700, fontSize:13, cursor:'pointer' }}>
              <Edit2 size={14} /> Edit
            </button>
            <button onClick={onClose} style={{ display:'flex', alignItems:'center', gap:6, padding:'8px 14px', borderRadius:7, border:'1px solid #e2e8f0', background:'#fff', color:'#64748b', fontWeight:600, fontSize:13, cursor:'pointer' }}>
              <X size={14} /> Close
            </button>
          </div>
        </div>
        <div style={{ padding:'24px', display:'flex', gap:24 }}>
          {r.photo_url && (
            <div style={{ flexShrink:0 }}>
              <img src={r.photo_url} alt="photo" style={{ width:100, height:100, objectFit:'cover', borderRadius:8, border:'2px solid #e2e8f0' }} />
            </div>
          )}
          <div style={{ flex:1 }}>
            <Row label="Serial Number"           value={slNo} />
            <Row label="Name"                    value={r.name} />
            <Row label="Gender"                  value={r.gender} />
            <Row label="Date of Confirmation"    value={r.date_of_confirmation} />
            <Row label="Date of Birth"           value={r.date_of_birth} />
            <Row label="Father's Name"           value={r.father_name} />
            <Row label="Mother's Name"           value={r.mother_name} />
            <Row label="Address"                 value={r.address} />
            <Row label="Date of Baptism"         value={r.date_of_baptism} />
            <Row label="Place of Baptism"        value={r.place_of_baptism} />
            <Row label="Baptized By"             value={r.baptized_by} />
            <Row label="Baptism Reg. No."        value={r.baptism_reg_no} />
            <Row label="Place of Confirmation"   value={r.place_of_confirmation} />
            <Row label="Confirmed By"            value={r.confirmed_by} />
            <Row label="Remarks"                 value={r.remarks} />
          </div>
        </div>
      </div>
    </div>
  )
}

/* ─── Confirmation Certificate Modal ─────────────────────────────── */
function ConfirmationCertModal({ form, photo, onClose }) {
  const [church,   setChurch]   = useState(null)
  const [certDate, setCertDate] = useState(form.certDate || '')

  useEffect(() => {
    supabase.from('churches').select('church_name,denomination,diocese,address,city,pincode,logo_url,diocese_logo_url,presbyter_name,pastor_name').limit(1).single()
      .then(({ data }) => setChurch(data))
  }, [])

  const seqPadded = form.seqNum ? String(form.seqNum).padStart(4,'0') : '____'
  const slNo = `${seqPadded}/${form.year}`
  const churchLine = [church?.church_name, church?.address, church?.city, church?.pincode].filter(Boolean).join(', ')
  const presbyter = church?.presbyter_name || church?.pastor_name || ''

  const BL = '#1a237e'

  function Line({ label, value }) {
    return (
      <div style={{ display:'flex', alignItems:'baseline', gap:8, marginBottom:10 }}>
        <span style={{ minWidth:190, fontSize:11, color:BL }}>{label}</span>
        <span style={{ flex:1, fontSize:11, color:BL, fontWeight: value ? 600 : 400,
          borderBottom:'1px dotted #888', paddingBottom:2, minHeight:18 }}>
          {value || ''}
        </span>
      </div>
    )
  }

  function handlePrint() {
    const el  = document.getElementById('confirmation-cert-content')
    const win = window.open('', '_blank', 'width=700,height=900')
    win.document.write(`<!DOCTYPE html><html><head>
      <title>Confirmation Extract — ${slNo}</title>
      <style>
        @page { size: A5 portrait; margin: 0; }
        * { margin:0; padding:0; box-sizing:border-box; }
        body { font-family: Arial, sans-serif; font-size: 10pt; color: #1a237e; background: #e8f5e9; }
      </style>
    </head><body>${el.innerHTML}</body></html>`)
    win.document.close()
    setTimeout(() => { win.focus(); win.print() }, 500)
  }

  return (
    <div style={{ position:'fixed', inset:0, zIndex:1000, background:'rgba(0,0,0,0.7)',
      display:'flex', flexDirection:'column', alignItems:'center', padding:'16px 12px', overflow:'auto' }}>

      {/* Toolbar */}
      <div style={{ display:'flex', gap:10, marginBottom:12, width:560, flexShrink:0, justifyContent:'space-between', alignItems:'center' }}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <span style={{ color:'#fff', fontWeight:700, fontSize:14 }}>Confirmation Extract — {slNo}</span>
          <input value={certDate} onChange={e => setCertDate(e.target.value)}
            placeholder="Date of Extract" style={{ ...iS, width:140, fontSize:12 }} />
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <button onClick={handlePrint} style={{ display:'flex', alignItems:'center', gap:6, padding:'8px 18px', borderRadius:7, border:'none', background:'#2563eb', color:'#fff', fontWeight:700, fontSize:13, cursor:'pointer' }}>
            <Printer size={15} /> Print / Save PDF
          </button>
          <button onClick={onClose} style={{ display:'flex', alignItems:'center', gap:6, padding:'8px 14px', borderRadius:7, border:'1px solid rgba(255,255,255,0.3)', background:'transparent', color:'#fff', fontWeight:600, fontSize:13, cursor:'pointer' }}>
            <X size={14} /> Close
          </button>
        </div>
      </div>

      {/* Certificate — A5 portrait */}
      <div id="confirmation-cert-content" style={{
        width:560, background:'#e8f5e9', flexShrink:0,
        boxShadow:'0 8px 32px rgba(0,0,0,0.4)',
        fontFamily:'Arial, sans-serif', color:BL,
        padding:'24px 32px',
      }}>

        {/* Church Header */}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12 }}>
          {church?.logo_url
            ? <img src={church.logo_url} alt="logo" style={{ width:64, height:64, objectFit:'contain' }} />
            : <div style={{ width:64 }} />}
          <div style={{ textAlign:'center', flex:1, padding:'0 12px' }}>
            <div style={{ fontSize:11, fontWeight:700, color:BL }}>{church?.denomination || 'CHURCH OF SOUTH INDIA'}</div>
            <div style={{ fontSize:10, color:BL }}>{church?.diocese || ''}</div>
            <div style={{ fontSize:16, fontWeight:800, color:BL, margin:'2px 0' }}>{church?.church_name || ''}</div>
            <div style={{ fontSize:10, color:BL }}>{[church?.address, church?.city, church?.pincode].filter(Boolean).join(', ')}</div>
          </div>
          {church?.diocese_logo_url
            ? <img src={church.diocese_logo_url} alt="seal" style={{ width:64, height:64, objectFit:'contain' }} />
            : <div style={{ width:64 }} />}
        </div>

        <hr style={{ borderColor:`${BL}44`, marginBottom:10 }} />

        {/* S.No + Date row */}
        <div style={{ display:'flex', justifyContent:'space-between', marginBottom:12, fontSize:11 }}>
          <span><strong>S.No.</strong> {slNo}</span>
          <span>Date : {certDate || '.....................'}</span>
        </div>

        {/* Extract title */}
        <div style={{ textAlign:'center', marginBottom:14 }}>
          <div style={{ fontSize:11, fontWeight:700, color:BL }}>Extract of the Confirmation Register kept at</div>
          <div style={{ fontSize:11, fontWeight:700, color:BL }}>{churchLine || '........................................'}</div>
        </div>

        {/* Fields */}
        <Line label="Date of Confirmation"      value={form.dateOfConfirmation} />
        <Line label="Date of Birth"             value={form.dateOfBirth} />
        <Line label="Name"                      value={form.name} />
        <Line label="Gender"                    value={form.gender} />
        <div style={{ fontSize:11, fontWeight:700, color:BL, marginBottom:6, textDecoration:'underline' }}>Parent's Name</div>
        <div style={{ paddingLeft:24 }}>
          <Line label="Father" value={form.fatherName} />
          <Line label="Mother" value={form.motherName} />
        </div>
        <Line label="Place of abode / Address"  value={form.address} />
        <div style={{ fontSize:11, fontWeight:700, color:BL, marginBottom:6, textDecoration:'underline' }}>Baptism Details</div>
        <div style={{ paddingLeft:24 }}>
          <Line label="Date of Baptism"         value={form.dateOfBaptism} />
          <Line label="Place of Baptism"        value={form.placeOfBaptism} />
          <Line label="Baptized By"             value={form.baptizedBy} />
          <Line label="Baptism Reg. No."        value={form.baptismRegNo} />
        </div>
        <Line label="Place of Confirmation"     value={form.placeOfConfirmation} />
        <Line label="Confirmed By"              value={form.confirmedBy} />
        <div style={{ display:'flex', alignItems:'baseline', gap:8, marginBottom:4 }}>
          <span style={{ minWidth:190, fontSize:11, color:BL }}>Remarks</span>
          <span style={{ flex:1, borderBottom:'1px dotted #888', minHeight:18 }}>{form.remarks || ''}</span>
        </div>
        <div style={{ borderBottom:'1px dotted #888', minHeight:16, marginBottom:2 }} />
        <div style={{ borderBottom:'1px dotted #888', minHeight:16, marginBottom:16 }} />

        {/* Certification text */}
        <div style={{ fontSize:10, color:BL, marginBottom:4 }}>
          I<span style={{ display:'inline-block', minWidth:260, borderBottom:'1px dotted #888', marginLeft:4, marginRight:4 }}>
            {presbyter ? ` ${presbyter} ` : ''}
          </span> Certify that this is the true extract of the Confirmation
        </div>
        <div style={{ fontSize:10, color:BL, marginBottom:20 }}>Register maintained in this Church.</div>

        {/* Footer */}
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-end' }}>
          <div style={{ fontSize:10, color:BL }}>
            <div>Place : .........................</div>
            <div style={{ marginTop:6 }}>Date &nbsp;: .........................</div>
          </div>
          <div style={{ textAlign:'right', fontSize:10, color:BL }}>
            <div>Signature of the Presbyter</div>
            <div style={{ marginTop:4 }}>Seal</div>
          </div>
        </div>

      </div>
    </div>
  )
}

/* ─── Burial Tab ─────────────────────────────────────────────────── */
const DOC_TYPES = ['Aadhaar Copy', 'Police Certificate', 'Death Certificate', 'Church Permission', 'Other']
const EMPTY_DOC  = { label: '', name: null, fileObj: null, url: null }
const EMPTY_DOCS = [{ ...EMPTY_DOC }, { ...EMPTY_DOC }, { ...EMPTY_DOC }]

const EMPTY_BURIAL = {
  seqNum: '', year: new Date().getFullYear(),
  whenDied: '', whenBuried: '',
  name: '', gender: '', age: '', aadhaar: '',
  profession: '', causeOfDeath: '',
  parentsName: '', spouseName: '',
  whereBuried: '', buriedBy: '',
  applicantName: '', applicantContact: '', applicantAddress: '',
  remarks: '', certDate: '',
}

function BurialTab() {
  const { toast } = useToast()
  const [form,    setForm]    = useState(EMPTY_BURIAL)
  const [photo,   setPhoto]   = useState(EMPTY_FILE)
  const [docs,    setDocs]    = useState(EMPTY_DOCS.map(d => ({ ...d })))
  const [editId,  setEditId]  = useState(null)
  const [saving,  setSaving]  = useState(false)
  const [seqNumTaken, setSeqNumTaken] = useState(false)
  const [searchBy,  setSearchBy]  = useState('slNo')
  const [searchVal, setSearchVal] = useState('')
  const [searching, setSearching] = useState(false)
  const [searchResults, setSearchResults] = useState([])
  const [viewRecord,  setViewRecord]  = useState(null)
  const [showCert, setShowCert] = useState(false)
  const photoRef = useRef()
  const docRefs  = [useRef(), useRef(), useRef()]

  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }))

  async function getNext(yr) {
    const { data } = await supabase.from('burial_records').select('seq_num')
      .eq('year', yr).order('seq_num', { ascending: false }).limit(1).maybeSingle()
    return data ? data.seq_num + 1 : 1
  }

  useEffect(() => {
    getNext(new Date().getFullYear()).then(n => setForm(f => ({ ...f, seqNum: String(n) })))
  }, []) // eslint-disable-line

  async function handleReset() {
    setPhoto(EMPTY_FILE); setDocs(EMPTY_DOCS.map(d => ({ ...d }))); setEditId(null); setSeqNumTaken(false); setSearchResults([])
    const n = await getNext(new Date().getFullYear())
    setForm({ ...EMPTY_BURIAL, seqNum: String(n) })
  }

  function handleDocFile(i, e) {
    const file = e.target.files?.[0]; if (!file) return
    setDocs(prev => prev.map((d, idx) => idx === i ? { ...d, name: file.name, fileObj: file, url: null } : d))
    e.target.value = ''
  }
  function setDocLabel(i, val) {
    setDocs(prev => prev.map((d, idx) => idx === i ? { ...d, label: val } : d))
  }
  function removeDoc(i) {
    setDocs(prev => prev.map((d, idx) => idx === i ? { ...EMPTY_DOC } : d))
  }

  function handleSeqChange(e) {
    const val = e.target.value
    setForm(f => ({ ...f, seqNum: val })); setSeqNumTaken(false)
    if (!val || editId) return
    supabase.from('burial_records').select('id').eq('seq_num', parseInt(val)).eq('year', parseInt(form.year))
      .maybeSingle().then(({ data }) => setSeqNumTaken(!!data))
  }

  function handlePhoto(e) {
    const file = e.target.files?.[0]; if (!file) return
    const reader = new FileReader()
    reader.onload = ev => setPhoto({ name: file.name, preview: ev.target.result, fileObj: file, url: null })
    reader.readAsDataURL(file); e.target.value = ''
  }

  const seqPadded   = form.seqNum ? String(form.seqNum).padStart(4,'0') : '0000'
  const slNoDisplay = `${seqPadded}/${form.year}`
  const slNoPath    = `${seqPadded}-${form.year}`

  async function handleSave() {
    if (!form.seqNum) { toast('Enter a Serial Number', 'error'); return }
    if (seqNumTaken) { toast(`Serial No. ${slNoDisplay} already exists`, 'error'); return }
    if (!form.name)  { toast('Enter the name', 'error'); return }
    if (!editId) {
      const { data: ex } = await supabase.from('burial_records').select('id')
        .eq('seq_num', parseInt(form.seqNum)).eq('year', parseInt(form.year)).maybeSingle()
      if (ex) { toast(`Serial No. ${slNoDisplay} already exists`, 'error'); return }
    }
    setSaving(true)
    try {
      let photoUrl = photo.url || null
      if (photo.fileObj) {
        const ext = photo.fileObj.name.split('.').pop()
        const path = `burial/${slNoPath}/photo.${ext}`
        const { error: upErr } = await supabase.storage.from('event-media').upload(path, photo.fileObj, { upsert: true })
        if (upErr) throw upErr
        const { data: pd } = supabase.storage.from('event-media').getPublicUrl(path)
        photoUrl = pd.publicUrl
      }
      const savedDocs = [...docs]
      for (let i = 0; i < 3; i++) {
        if (docs[i].fileObj) {
          const ext = docs[i].fileObj.name.split('.').pop()
          const path = `burial/${slNoPath}/doc${i + 1}.${ext}`
          const { error: upErr } = await supabase.storage.from('event-media').upload(path, docs[i].fileObj, { upsert: true })
          if (upErr) throw upErr
          const { data: pd } = supabase.storage.from('event-media').getPublicUrl(path)
          savedDocs[i] = { ...savedDocs[i], url: pd.publicUrl, fileObj: null }
        }
      }
      const record = {
        seq_num: parseInt(form.seqNum), year: parseInt(form.year),
        when_died: form.whenDied || null, when_buried: form.whenBuried || null,
        name: form.name || null, gender: form.gender || null, age: form.age || null,
        aadhaar: form.aadhaar || null,
        profession: form.profession || null, cause_of_death: form.causeOfDeath || null,
        parents_name: form.parentsName || null, spouse_name: form.spouseName || null,
        where_buried: form.whereBuried || null, buried_by: form.buriedBy || null,
        applicant_name: form.applicantName || null,
        applicant_contact: form.applicantContact || null,
        applicant_address: form.applicantAddress || null,
        remarks: form.remarks || null,
        photo_url: photoUrl,
        doc1_label: savedDocs[0].label || null, doc1_url: savedDocs[0].url || null,
        doc2_label: savedDocs[1].label || null, doc2_url: savedDocs[1].url || null,
        doc3_label: savedDocs[2].label || null, doc3_url: savedDocs[2].url || null,
        updated_at: new Date().toISOString(),
      }
      let error, newId
      if (editId) {
        ;({ error } = await supabase.from('burial_records').update(record).eq('id', editId))
      } else {
        const { data, error: insErr } = await supabase.from('burial_records').insert(record).select('id').single()
        error = insErr; newId = data?.id
      }
      if (error) throw error
      if (newId) setEditId(newId)
      if (photoUrl) setPhoto(p => ({ ...p, url: photoUrl, fileObj: null }))
      setDocs(savedDocs)
      toast(`Burial record ${editId ? 'updated' : 'saved'} — ${slNoDisplay}`, 'success')
    } catch (err) { toast(err.message || 'Save failed', 'error') }
    finally { setSaving(false) }
  }

  async function handleLoad(id) {
    const { data, error } = await supabase.from('burial_records').select('*').eq('id', id).single()
    if (error || !data) { toast('Record not found', 'error'); return }
    setEditId(data.id)
    setForm({
      seqNum: String(data.seq_num ?? ''), year: data.year ?? new Date().getFullYear(),
      whenDied: data.when_died ?? '', whenBuried: data.when_buried ?? '',
      name: data.name ?? '', gender: data.gender ?? '', age: data.age ?? '',
      aadhaar: data.aadhaar ?? '',
      profession: data.profession ?? '', causeOfDeath: data.cause_of_death ?? '',
      parentsName: data.parents_name ?? '', spouseName: data.spouse_name ?? '',
      whereBuried: data.where_buried ?? '', buriedBy: data.buried_by ?? '',
      applicantName: data.applicant_name ?? '',
      applicantContact: data.applicant_contact ?? '',
      applicantAddress: data.applicant_address ?? '',
      remarks: data.remarks ?? '', certDate: '',
    })
    setPhoto(data.photo_url
      ? { name: data.photo_url.split('/').pop(), preview: data.photo_url, fileObj: null, url: data.photo_url }
      : EMPTY_FILE)
    setDocs([
      { label: data.doc1_label || '', name: data.doc1_url ? data.doc1_url.split('/').pop() : null, fileObj: null, url: data.doc1_url || null },
      { label: data.doc2_label || '', name: data.doc2_url ? data.doc2_url.split('/').pop() : null, fileObj: null, url: data.doc2_url || null },
      { label: data.doc3_label || '', name: data.doc3_url ? data.doc3_url.split('/').pop() : null, fileObj: null, url: data.doc3_url || null },
    ])
    setSearchResults([])
    toast(`Loaded — ${data.seq_num}/${data.year}`, 'success')
  }

  async function handleDelete() {
    if (!editId) { toast('No record loaded', 'error'); return }
    if (!window.confirm(`Delete burial record ${slNoDisplay}?`)) return
    setSaving(true)
    try {
      const toRemove = [photo.url, docs[0].url, docs[1].url, docs[2].url].filter(Boolean)
        .map(u => { const i = u.indexOf('/event-media/'); return i >= 0 ? u.substring(i + '/event-media/'.length) : null })
        .filter(Boolean)
      if (toRemove.length) await supabase.storage.from('event-media').remove(toRemove)
      const { error } = await supabase.from('burial_records').delete().eq('id', editId)
      if (error) throw error
      toast(`Record ${slNoDisplay} deleted`, 'success'); handleReset()
    } catch (err) { toast(err.message || 'Delete failed', 'error') }
    finally { setSaving(false) }
  }

  async function handleSearch() {
    if (!searchVal.trim()) { toast('Enter a search value', 'error'); return }
    setSearching(true); setSearchResults([])
    try {
      let query = supabase.from('burial_records').select('*')
      if (searchBy === 'slNo') {
        const [n, y] = searchVal.split('/'); query = query.eq('seq_num', parseInt(n)); if (y) query = query.eq('year', parseInt(y))
      } else if (searchBy === 'name') {
        query = query.ilike('name', `%${searchVal}%`)
      } else if (searchBy === 'year') {
        query = query.eq('year', parseInt(searchVal))
      }
      const { data, error } = await query.order('year', { ascending: false }).order('seq_num', { ascending: false }).limit(20)
      if (error) throw error
      if (!data?.length) { toast('No records found', 'error'); return }
      if (data.length === 1) { setViewRecord(data[0]); return }
      setSearchResults(data)
    } catch (err) { toast(err.message || 'Search failed', 'error') }
    finally { setSearching(false) }
  }

  return (
    <div style={{ maxWidth: 1100 }}>

      {/* ── Action buttons ── */}
      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom: searchResults.length ? 6 : 18, flexWrap:'wrap' }}>
        <ActionBtn icon={Plus}      label="New"    onClick={handleReset} color="#475569" disabled={saving} />
        <ActionBtn icon={saving ? Loader2 : Save} label={saving ? 'Saving…' : 'Save'} onClick={handleSave} color="#2563eb" disabled={saving} />
        <ActionBtn icon={Edit2}     label={editId ? 'Editing' : 'Edit'} color={editId ? '#0369a1' : '#64748b'} disabled />
        <ActionBtn icon={RotateCcw} label="Reset"  onClick={handleReset} color="#7c3aed" disabled={saving} />
        <ActionBtn icon={Trash2}    label="Delete" onClick={handleDelete} color="#dc2626" disabled={saving || !editId} />
        <div style={{ marginLeft:'auto', display:'flex', gap:8, alignItems:'flex-end' }}>
          <div>
            <div style={lbl()}>Search By</div>
            <select value={searchBy} onChange={e => setSearchBy(e.target.value)} style={{ ...iS, width:140 }}>
              <option value="slNo">Serial No.</option>
              <option value="name">Name</option>
              <option value="year">Year</option>
            </select>
          </div>
          <input value={searchVal} onChange={e => setSearchVal(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSearch()}
            placeholder={searchBy === 'slNo' ? '0001/2026' : searchBy === 'year' ? '2026' : 'Name…'}
            style={{ ...iS, width:140 }} />
          <button onClick={handleSearch} disabled={searching} style={{
            ...iS, width:'auto', padding:'0 16px', background:'#2563eb', color:'#fff',
            border:'none', cursor:'pointer', fontWeight:600, display:'flex', alignItems:'center', gap:6,
            opacity: searching ? 0.7 : 1,
          }}>
            {searching ? <Loader2 size={13} style={{ animation:'spin 1s linear infinite' }} /> : <Search size={13} />} View
          </button>
        </div>
      </div>

      {/* ── Search results ── */}
      {searchResults.length > 0 && (
        <div style={{ background:'#fff', border:'1px solid #e2e8f0', borderRadius:8, marginBottom:18, overflow:'hidden' }}>
          <div style={{ padding:'8px 14px', background:'#f8fafc', borderBottom:'1px solid #e2e8f0', fontSize:12, fontWeight:600, color:'#64748b' }}>
            {searchResults.length} records found — click a row to view
          </div>
          {searchResults.map(r => (
            <button key={r.id} onClick={() => setViewRecord(r)} style={{
              display:'flex', alignItems:'center', gap:14, width:'100%',
              padding:'9px 14px', border:'none', background:'transparent',
              borderBottom:'1px solid #f1f5f9', cursor:'pointer', textAlign:'left', transition:'background 0.12s',
            }}
            onMouseEnter={e => e.currentTarget.style.background = '#f0f9ff'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
              <span style={{ fontFamily:'monospace', fontWeight:700, color:'#2563eb', minWidth:80 }}>
                {String(r.seq_num).padStart(4,'0')}/{r.year}
              </span>
              <span style={{ fontSize:13, color:'#1e293b' }}>{r.name}</span>
              {r.when_died && <span style={{ fontSize:12, color:'#64748b' }}>Died: {r.when_died}</span>}
            </button>
          ))}
        </div>
      )}

      {/* ── Header block ── */}
      <Card style={{ marginBottom:14 }}>
        <div style={{ display:'flex', alignItems:'stretch' }}>
          <div style={{ flex:1, paddingRight:28 }}>
            <SecHead label="Serial Number" color="#2563eb" small />
            <div style={{ display:'flex', alignItems:'center', gap:6 }}>
              <div>
                <div style={lbl()}>Seq. No.</div>
                <input type="number" value={form.seqNum} onChange={handleSeqChange}
                  placeholder="1" min={1} readOnly={!!editId}
                  style={{ ...iS, width:72, textAlign:'center',
                    background: editId ? '#f1f5f9' : '#fff', cursor: editId ? 'not-allowed' : 'auto',
                    borderColor: seqNumTaken ? '#dc2626' : undefined,
                    boxShadow: seqNumTaken ? '0 0 0 2px #fecaca' : undefined,
                  }} />
                {seqNumTaken && <div style={{ fontSize:10, color:'#dc2626', fontWeight:600, marginTop:3 }}>Already exists</div>}
              </div>
              <span style={{ fontSize:22, fontWeight:700, color:'#94a3b8', paddingTop:18 }}>/</span>
              <div>
                <div style={lbl()}>Year</div>
                <div style={{ ...iS, width:62, display:'flex', alignItems:'center', justifyContent:'center', background:'#f1f5f9', color:'#475569', fontWeight:700 }}>{form.year}</div>
              </div>
            </div>
            <div style={{ marginTop:10, fontFamily:'monospace', fontSize:22, fontWeight:800, color:'#2563eb', letterSpacing:'0.06em' }}>
              {slNoDisplay}
            </div>
          </div>
          <VDivider />
          <div style={{ flex:1, padding:'0 28px' }}>
            <SecHead label="When Died" color="#dc2626" small />
            <div style={lbl()}>Date of Death</div>
            <input value={form.whenDied} onChange={set('whenDied')} placeholder="DD-MM-YYYY" style={{ ...iS, width:160 }} />
          </div>
          <VDivider />
          <div style={{ flex:1, paddingLeft:28 }}>
            <SecHead label="When Buried" color="#7c3aed" small />
            <div style={lbl()}>Date of Burial</div>
            <input value={form.whenBuried} onChange={set('whenBuried')} placeholder="DD-MM-YYYY" style={{ ...iS, width:160 }} />
          </div>
        </div>
      </Card>

      {/* ── Personal + Photo ── */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 220px', gap:14, marginBottom:14 }}>
        <Card>
          <SecHead label="Personal Details" color="#2563eb" />
          <div style={{ display:'grid', gridTemplateColumns:'2fr 1fr 1fr 1fr', gap:10, marginBottom:10 }}>
            <F label="Name of Person" color="#2563eb">
              <input value={form.name} onChange={set('name')} style={{ ...iS, width:'100%' }} />
            </F>
            <F label="Gender" color="#2563eb">
              <select value={form.gender} onChange={set('gender')} style={{ ...iS, width:'100%' }}>
                <option value="">-- Select --</option>
                <option value="Male">Male</option>
                <option value="Female">Female</option>
                <option value="Transgender">Transgender</option>
              </select>
            </F>
            <F label="Age" color="#2563eb">
              <input value={form.age} onChange={set('age')} placeholder="e.g. 65" style={{ ...iS, width:'100%' }} />
            </F>
            <F label="Aadhaar No." color="#2563eb">
              <input value={form.aadhaar}
                onChange={e => setForm(f => ({ ...f, aadhaar: fmtAadhaar(e.target.value) }))}
                placeholder="XXXX-XXXX-XXXX" maxLength={14} style={{ ...iS, width:'100%' }} />
            </F>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
            <F label="Trade of Profession" color="#2563eb">
              <input value={form.profession} onChange={set('profession')} style={{ ...iS, width:'100%' }} />
            </F>
            <F label="Cause of Death" color="#dc2626">
              <input value={form.causeOfDeath} onChange={set('causeOfDeath')} style={{ ...iS, width:'100%' }} />
            </F>
          </div>
        </Card>
        <Card>
          <SecHead label="Photo" color="#7c3aed" small />
          <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:8 }}>
            <div style={{ width:110, height:110, border:`2px dashed ${photo.name ? '#a78bfa' : '#cbd5e1'}`,
              borderRadius:8, background: photo.name ? '#f5f3ff' : '#f8fafc',
              display:'flex', alignItems:'center', justifyContent:'center', overflow:'hidden' }}>
              {photo.preview
                ? <img src={photo.preview} alt="photo" style={{ width:'100%', height:'100%', objectFit:'cover' }} />
                : <Camera size={24} style={{ color:'#c4b5fd' }} />}
            </div>
            <button onClick={() => photoRef.current?.click()} style={uploadBtnStyle(!!photo.name, '#7c3aed')}>
              <Upload size={11} /> {photo.name ? 'Change' : 'Upload'}
            </button>
            <input type="file" accept="image/*" ref={photoRef} onChange={handlePhoto} style={{ display:'none' }} />
          </div>
        </Card>
      </div>

      {/* ── Family ── */}
      <Card style={{ marginBottom:14 }}>
        <SecHead label="Family Details" color="#0369a1" />
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
          <F label="Parents Name" color="#0369a1">
            <input value={form.parentsName} onChange={set('parentsName')} style={{ ...iS, width:'100%' }} />
          </F>
          <F label="Spouse Name" color="#0369a1">
            <input value={form.spouseName} onChange={set('spouseName')} style={{ ...iS, width:'100%' }} />
          </F>
        </div>
      </Card>

      {/* ── Burial ── */}
      <Card style={{ marginBottom:14 }}>
        <SecHead label="Burial Details" color="#7c3aed" />
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:10 }}>
          <F label="Where Buried" color="#7c3aed">
            <input value={form.whereBuried} onChange={set('whereBuried')} style={{ ...iS, width:'100%' }} />
          </F>
          <F label="Signature / By Whom Buried" color="#7c3aed">
            <input value={form.buriedBy} onChange={set('buriedBy')} style={{ ...iS, width:'100%' }} />
          </F>
        </div>
        <F label="Remarks" color="#7c3aed">
          <input value={form.remarks} onChange={set('remarks')} style={{ ...iS, width:'100%' }} />
        </F>
      </Card>

      {/* ── Applicant ── */}
      <Card style={{ marginBottom:14 }}>
        <SecHead label="Applicant Details" color="#475569" />
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:10 }}>
          <F label="Name Who Applied" color="#475569">
            <input value={form.applicantName} onChange={set('applicantName')} style={{ ...iS, width:'100%' }} />
          </F>
          <F label="Contact No." color="#475569">
            <input value={form.applicantContact} onChange={set('applicantContact')} style={{ ...iS, width:'100%' }} />
          </F>
          <F label="Address" color="#475569">
            <input value={form.applicantAddress} onChange={set('applicantAddress')} style={{ ...iS, width:'100%' }} />
          </F>
        </div>
      </Card>

      {/* ── Documents ── */}
      <Card style={{ marginBottom:14 }}>
        <SecHead label="Documents (max 3)" color="#475569" />
        {docs.map((doc, i) => (
          <div key={i} style={{ display:'flex', alignItems:'center', gap:8, marginBottom: i < 2 ? 8 : 0 }}>
            <span style={{ fontSize:12, fontWeight:700, color:'#94a3b8', minWidth:16 }}>{i + 1}.</span>
            <select value={doc.label} onChange={e => setDocLabel(i, e.target.value)}
              style={{ ...iS, width:180, flexShrink:0 }}>
              <option value="">-- Document Type --</option>
              {DOC_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            {doc.url ? (
              <a href={doc.url} target="_blank" rel="noreferrer" style={{
                flex:1, fontSize:12, color:'#2563eb', fontWeight:600,
                overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap',
                textDecoration:'none', border:'1px solid #bfdbfe', borderRadius:6,
                padding:'5px 10px', background:'#eff6ff',
              }}>
                {doc.label || 'Document'} — View
              </a>
            ) : doc.name ? (
              <span style={{
                flex:1, fontSize:12, color:'#475569', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap',
                border:'1px solid #e2e8f0', borderRadius:6, padding:'5px 10px', background:'#f8fafc',
              }}>
                {doc.name}
              </span>
            ) : (
              <button onClick={() => docRefs[i].current?.click()} style={{
                flex:1, ...iS, background:'#f8fafc', color:'#64748b', border:'1px dashed #cbd5e1',
                cursor:'pointer', display:'flex', alignItems:'center', gap:6, justifyContent:'center',
              }}>
                <Upload size={12} /> Attach File
              </button>
            )}
            <input type="file" accept="image/*,.pdf,.doc,.docx" ref={docRefs[i]}
              onChange={e => handleDocFile(i, e)} style={{ display:'none' }} />
            {(doc.name || doc.url) && (
              <button onClick={() => removeDoc(i)} title="Remove" style={{
                border:'none', background:'transparent', color:'#ef4444',
                cursor:'pointer', padding:'4px', borderRadius:4, display:'flex', alignItems:'center',
              }}>
                <X size={14} />
              </button>
            )}
          </div>
        ))}
      </Card>

      {/* ── Reports ── */}
      <Card>
        <div style={{ display:'flex', alignItems:'center', gap:12 }}>
          <span style={{ fontSize:11, fontWeight:800, color:'#ef4444', letterSpacing:'0.1em', textTransform:'uppercase' }}>Reports</span>
          <ReportBtn label="Burial Extract" onClick={() => setShowCert(true)} color="#800020" />
        </div>
      </Card>

      {/* ── Modals ── */}
      {viewRecord && (
        <BurialViewModal record={viewRecord} onClose={() => setViewRecord(null)}
          onEdit={() => { handleLoad(viewRecord.id); setViewRecord(null) }} />
      )}
      {showCert && (
        <BurialCertModal form={form} photo={photo} onClose={() => setShowCert(false)} />
      )}
    </div>
  )
}

/* ─── Burial View Modal ──────────────────────────────────────────── */
function BurialViewModal({ record: r, onClose, onEdit }) {
  const slNo = `${String(r.seq_num).padStart(4,'0')}/${r.year}`
  function Row({ label, value }) {
    if (!value) return null
    return (
      <div style={{ display:'flex', gap:8, padding:'5px 0', borderBottom:'1px solid #f1f5f9' }}>
        <span style={{ minWidth:180, fontSize:12, color:'#64748b', flexShrink:0 }}>{label}</span>
        <span style={{ fontSize:13, fontWeight:500, color:'#1e293b' }}>{value}</span>
      </div>
    )
  }
  return (
    <div style={{ position:'fixed', inset:0, zIndex:1000, background:'rgba(0,0,0,0.55)',
      display:'flex', alignItems:'center', justifyContent:'center', padding:24 }} onClick={onClose}>
      <div style={{ background:'#fff', borderRadius:14, width:'100%', maxWidth:580,
        maxHeight:'90vh', overflow:'auto', boxShadow:'0 24px 60px rgba(0,0,0,0.3)' }}
        onClick={e => e.stopPropagation()}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between',
          padding:'18px 24px', borderBottom:'1px solid #e2e8f0', position:'sticky', top:0, background:'#fff', zIndex:10 }}>
          <div>
            <div style={{ fontSize:11, color:'#64748b', fontWeight:600, letterSpacing:'0.08em', textTransform:'uppercase' }}>Burial Record</div>
            <div style={{ fontSize:22, fontWeight:800, color:'#1e293b', fontFamily:'monospace' }}>{slNo}</div>
          </div>
          <div style={{ display:'flex', gap:8 }}>
            <button onClick={onEdit} style={{ display:'flex', alignItems:'center', gap:6, padding:'8px 18px', borderRadius:7, border:'none', background:'#2563eb', color:'#fff', fontWeight:700, fontSize:13, cursor:'pointer' }}>
              <Edit2 size={14} /> Edit
            </button>
            <button onClick={onClose} style={{ display:'flex', alignItems:'center', gap:6, padding:'8px 14px', borderRadius:7, border:'1px solid #e2e8f0', background:'#fff', color:'#64748b', fontWeight:600, fontSize:13, cursor:'pointer' }}>
              <X size={14} /> Close
            </button>
          </div>
        </div>
        <div style={{ padding:'24px', display:'flex', gap:24 }}>
          {r.photo_url && (
            <div style={{ flexShrink:0 }}>
              <img src={r.photo_url} alt="photo" style={{ width:100, height:100, objectFit:'cover', borderRadius:8, border:'2px solid #e2e8f0' }} />
            </div>
          )}
          <div style={{ flex:1 }}>
            <Row label="Serial Number"           value={slNo} />
            <Row label="Name of Person"          value={r.name} />
            <Row label="Gender"                  value={r.gender} />
            <Row label="Age"                     value={r.age} />
            <Row label="Aadhaar No."             value={r.aadhaar} />
            <Row label="When Died"               value={r.when_died} />
            <Row label="When Buried"             value={r.when_buried} />
            <Row label="Trade of Profession"     value={r.profession} />
            <Row label="Cause of Death"          value={r.cause_of_death} />
            <Row label="Parents Name"            value={r.parents_name} />
            <Row label="Spouse Name"             value={r.spouse_name} />
            <Row label="Where Buried"            value={r.where_buried} />
            <Row label="By Whom Buried"          value={r.buried_by} />
            <Row label="Applicant Name"          value={r.applicant_name} />
            <Row label="Applicant Contact"       value={r.applicant_contact} />
            <Row label="Applicant Address"       value={r.applicant_address} />
            <Row label="Remarks"                 value={r.remarks} />
            {[r.doc1_url, r.doc2_url, r.doc3_url].some(Boolean) && (
              <div style={{ marginTop:10, paddingTop:10, borderTop:'1px solid #f1f5f9' }}>
                <div style={{ fontSize:11, fontWeight:700, color:'#64748b', marginBottom:6, textTransform:'uppercase', letterSpacing:'0.06em' }}>Documents</div>
                {[[r.doc1_label, r.doc1_url],[r.doc2_label, r.doc2_url],[r.doc3_label, r.doc3_url]].map(([label, url], i) =>
                  url ? (
                    <a key={i} href={url} target="_blank" rel="noreferrer" style={{
                      display:'flex', alignItems:'center', gap:8, padding:'6px 10px', marginBottom:4,
                      background:'#eff6ff', borderRadius:6, border:'1px solid #bfdbfe',
                      color:'#2563eb', fontWeight:600, fontSize:12, textDecoration:'none',
                    }}>
                      <FileText size={13} /> {label || `Document ${i + 1}`}
                    </a>
                  ) : null
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

/* ─── Burial Certificate Modal ───────────────────────────────────── */
function BurialCertModal({ form, onClose }) {
  const [church,   setChurch]   = useState(null)
  const [certDate, setCertDate] = useState(form.certDate || '')

  useEffect(() => {
    supabase.from('churches').select('church_name,denomination,diocese,address,city,pincode,logo_url,diocese_logo_url,presbyter_name,pastor_name').limit(1).single()
      .then(({ data }) => setChurch(data))
  }, [])

  const seqPadded = form.seqNum ? String(form.seqNum).padStart(4,'0') : '____'
  const slNo = `${seqPadded}/${form.year}`
  const churchName = church?.church_name || ''
  const churchAddr = [church?.address, church?.city].filter(Boolean).join(', ')
  const minister   = church?.presbyter_name || church?.pastor_name || ''

  const BL = '#1a237e'

  function Line({ label, value, wide }) {
    return (
      <div style={{ display:'flex', alignItems:'baseline', gap:8, marginBottom:12 }}>
        <span style={{ minWidth: wide ? 160 : 140, fontSize:11, color:BL, fontWeight:600 }}>{label}</span>
        <span style={{ flex:1, fontSize:11, color:BL, fontWeight: value ? 600 : 400,
          borderBottom:'1px solid #333', paddingBottom:2, minHeight:20 }}>
          {value || ''}
        </span>
      </div>
    )
  }

  function handlePrint() {
    const el  = document.getElementById('burial-cert-content')
    const win = window.open('', '_blank', 'width=700,height=960')
    win.document.write(`<!DOCTYPE html><html><head>
      <title>Burial Extract — ${slNo}</title>
      <style>
        @page { size: A5 portrait; margin: 0.5in 0.6in; }
        * { margin:0; padding:0; box-sizing:border-box; }
        body { font-family: Arial, sans-serif; font-size: 10pt; color: #1a237e; background: #fff; }
      </style>
    </head><body>${el.innerHTML}</body></html>`)
    win.document.close()
    setTimeout(() => { win.focus(); win.print() }, 500)
  }

  return (
    <div style={{ position:'fixed', inset:0, zIndex:1000, background:'rgba(0,0,0,0.7)',
      display:'flex', flexDirection:'column', alignItems:'center', padding:'16px 12px', overflow:'auto' }}>

      {/* Toolbar */}
      <div style={{ display:'flex', gap:10, marginBottom:12, width:520, flexShrink:0, justifyContent:'space-between', alignItems:'center' }}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <span style={{ color:'#fff', fontWeight:700, fontSize:14 }}>Burial Extract — {slNo}</span>
          <input value={certDate} onChange={e => setCertDate(e.target.value)}
            placeholder="Date of Extract" style={{ ...iS, width:140, fontSize:12 }} />
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <button onClick={handlePrint} style={{ display:'flex', alignItems:'center', gap:6, padding:'8px 18px', borderRadius:7, border:'none', background:'#2563eb', color:'#fff', fontWeight:700, fontSize:13, cursor:'pointer' }}>
            <Printer size={15} /> Print / Save PDF
          </button>
          <button onClick={onClose} style={{ display:'flex', alignItems:'center', gap:6, padding:'8px 14px', borderRadius:7, border:'1px solid rgba(255,255,255,0.3)', background:'transparent', color:'#fff', fontWeight:600, fontSize:13, cursor:'pointer' }}>
            <X size={14} /> Close
          </button>
        </div>
      </div>

      {/* Certificate — A5 portrait, white background matching physical form */}
      <div id="burial-cert-content" style={{
        width:520, background:'#fff', flexShrink:0,
        boxShadow:'0 8px 32px rgba(0,0,0,0.4)',
        fontFamily:'Arial, sans-serif', color:BL,
        padding:'28px 36px',
      }}>

        {/* Header */}
        <div style={{ textAlign:'center', marginBottom:16 }}>
          <div style={{ fontSize:12, fontWeight:800, color:BL, textTransform:'uppercase', letterSpacing:'0.05em' }}>
            {church?.denomination || 'The Church of South India'}
          </div>
          <div style={{ fontSize:12, fontWeight:700, color:BL, marginTop:6, lineHeight:1.5 }}>
            Extract from the Register of Burials kept in {churchName}{churchAddr ? `, ${churchAddr}` : ''}.
          </div>
        </div>

        <div style={{ marginBottom:10, fontSize:11, color:BL }}>
          <strong>Sl. No.</strong> {slNo}
        </div>

        {/* Fields matching physical form layout */}
        <Line label="When Died"            value={form.whenDied} />
        <Line label="When Buried"          value={form.whenBuried} />
        <Line label="Name of Person"       value={form.name} />

        {/* Sex + Age on same row */}
        <div style={{ display:'flex', gap:24, marginBottom:12 }}>
          <div style={{ display:'flex', alignItems:'baseline', gap:8, flex:1 }}>
            <span style={{ minWidth:40, fontSize:11, color:BL, fontWeight:600 }}>Sex</span>
            <span style={{ flex:1, fontSize:11, color:BL, fontWeight: form.gender ? 600 : 400,
              borderBottom:'1px solid #333', paddingBottom:2, minHeight:20 }}>{form.gender || ''}</span>
          </div>
          <div style={{ display:'flex', alignItems:'baseline', gap:8, flex:1 }}>
            <span style={{ minWidth:40, fontSize:11, color:BL, fontWeight:600 }}>Age</span>
            <span style={{ flex:1, fontSize:11, color:BL, fontWeight: form.age ? 600 : 400,
              borderBottom:'1px solid #333', paddingBottom:2, minHeight:20 }}>{form.age || ''}</span>
          </div>
        </div>

        <Line label="Trade of Profession"  value={form.profession} />
        <Line label="Cause of Death"       value={form.causeOfDeath} />
        <Line label="Parents Name"         value={form.parentsName} />
        <Line label="Spouse Name"          value={form.spouseName} />
        <Line label="Where Buried"         value={form.whereBuried} />

        {/* Applicant block */}
        <div style={{ marginBottom:12 }}>
          <div style={{ display:'flex', alignItems:'baseline', gap:8, marginBottom:6 }}>
            <span style={{ minWidth:140, fontSize:11, color:BL, fontWeight:600 }}>Name who applied</span>
            <span style={{ flex:1, fontSize:11, color:BL, fontWeight: form.applicantName ? 600 : 400,
              borderBottom:'1px solid #333', paddingBottom:2, minHeight:20 }}>{form.applicantName || ''}</span>
          </div>
          <div style={{ paddingLeft:0 }}>
            <div style={{ display:'flex', alignItems:'baseline', gap:8, marginBottom:6 }}>
              <span style={{ minWidth:140, fontSize:11, color:BL, fontWeight:600 }}>Contact No.</span>
              <span style={{ flex:1, fontSize:11, color:BL, fontWeight: form.applicantContact ? 600 : 400,
                borderBottom:'1px solid #333', paddingBottom:2, minHeight:20 }}>{form.applicantContact || ''}</span>
            </div>
            <div style={{ display:'flex', alignItems:'baseline', gap:8, marginBottom:6 }}>
              <span style={{ minWidth:140, fontSize:11, color:BL, fontWeight:600 }}>Address</span>
              <span style={{ flex:1, fontSize:11, color:BL, fontWeight: form.applicantAddress ? 600 : 400,
                borderBottom:'1px solid #333', paddingBottom:2, minHeight:20 }}>{form.applicantAddress || ''}</span>
            </div>
          </div>
        </div>

        <Line label="Signature by whom buried" value={form.buriedBy} />

        {/* Certification */}
        <div style={{ marginTop:16, marginBottom:20, fontSize:10, color:BL, lineHeight:1.6 }}>
          I<span style={{ display:'inline-block', minWidth:220, borderBottom:'1px dotted #555', marginLeft:4, marginRight:4 }}>
            {minister ? ` ${minister} ` : ''}
          </span> hereby certify that the above is a true extract taken from the
          <div style={{ textAlign:'center', fontWeight:700, marginTop:4 }}>
            Register of Burials kept in {churchName}{churchAddr ? `, ${churchAddr}` : ''}.
          </div>
        </div>

        {/* Footer */}
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-end', marginTop:8 }}>
          <div style={{ fontSize:10, color:BL }}>
            <div>{church?.city || churchAddr || '.........................'}</div>
            <div style={{ marginTop:4 }}>Date : {certDate || '.........................'}</div>
          </div>
          <div style={{ textAlign:'right', fontSize:10, color:BL, fontWeight:700 }}>
            Minister
          </div>
        </div>

      </div>
    </div>
  )
}

/* ─── Wedding Tab ────────────────────────────────────────────────── */
function WeddingTab() {
  const { toast } = useToast()
  const [form,    setForm]    = useState(EMPTY_FORM)
  const [files,   setFiles]   = useState(EMPTY_FILES)
  const [showIV,  setShowIV]  = useState(false)
  const [editId,  setEditId]  = useState(null)
  const [saving,  setSaving]  = useState(false)
  const [searchBy,  setSearchBy]  = useState('slNo')
  const [searchVal, setSearchVal] = useState('')
  const [searching, setSearching] = useState(false)
  const [searchResults, setSearchResults] = useState([])
  const [viewRecord,  setViewRecord]  = useState(null)

  const groomPhotoRef    = useRef()
  const bridePhotoRef    = useRef()
  const weddingPhotoRef  = useRef()
  const groomAadhaarRef  = useRef()
  const groomBaptismRef  = useRef()
  const groomConfirmRef  = useRef()
  const brideAadhaarRef  = useRef()
  const brideBaptismRef  = useRef()
  const brideConfirmRef  = useRef()

  const REFS = {
    groomPhoto: groomPhotoRef, bridePhoto: bridePhotoRef, weddingPhoto: weddingPhotoRef,
    groomAadhaar: groomAadhaarRef, groomBaptism: groomBaptismRef, groomConfirm: groomConfirmRef,
    brideAadhaar: brideAadhaarRef, brideBaptism: brideBaptismRef, brideConfirm: brideConfirmRef,
  }

  const [seqNumTaken, setSeqNumTaken] = useState(false)

  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }))

  function handleSeqNumChange(e) {
    const val = e.target.value
    setForm(f => ({ ...f, seqNum: val }))
    setSeqNumTaken(false)
    if (!val || editId) return
    supabase.from('wedding_records')
      .select('id').eq('seq_num', parseInt(val)).eq('year', parseInt(form.year))
      .maybeSingle()
      .then(({ data }) => setSeqNumTaken(!!data))
  }

  async function getNextSeqNum(yr) {
    const { data } = await supabase
      .from('wedding_records')
      .select('seq_num')
      .eq('year', yr)
      .order('seq_num', { ascending: false })
      .limit(1)
      .maybeSingle()
    return data ? data.seq_num + 1 : 1
  }

  useEffect(() => {
    getNextSeqNum(new Date().getFullYear()).then(next =>
      setForm(f => ({ ...f, seqNum: String(next) }))
    )
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleReset() {
    setFiles(EMPTY_FILES)
    setEditId(null)
    setSearchResults([])
    setSeqNumTaken(false)
    const next = await getNextSeqNum(new Date().getFullYear())
    setForm({ ...EMPTY_FORM, seqNum: String(next) })
  }

  function handleFile(key, e) {
    const file = e.target.files?.[0]
    if (!file) return
    const isImg = /\.(jpg|jpeg|png|gif|webp)$/i.test(file.name)
    if (isImg) {
      const reader = new FileReader()
      reader.onload = ev =>
        setFiles(f => ({ ...f, [key]: { name: file.name, preview: ev.target.result, fileObj: file, url: null } }))
      reader.readAsDataURL(file)
    } else {
      setFiles(f => ({ ...f, [key]: { name: file.name, preview: null, fileObj: file, url: null } }))
    }
    e.target.value = ''
  }

  function handleReset() { setForm(EMPTY_FORM); setFiles(EMPTY_FILES); setEditId(null); setSearchResults([]) }

  async function uploadFile(key, fileObj, slNoPath) {
    const ext = fileObj.name.split('.').pop()
    const path = `wedding/${slNoPath}/${key}.${ext}`
    const { error } = await supabase.storage.from('event-media').upload(path, fileObj, { upsert: true })
    if (error) throw error
    const { data } = supabase.storage.from('event-media').getPublicUrl(path)
    return data.publicUrl
  }

  async function handleSave() {
    if (!form.seqNum) { toast('Enter a Serial Number', 'error'); return }
    if (seqNumTaken) { toast(`Serial No. ${slNoDisplay} already exists`, 'error'); return }
    if (!form.month || !form.day) { toast('Enter the marriage date (month + day)', 'error'); return }
    // Duplicate check — only for new records or if seq_num/year changed
    if (!editId) {
      const { data: existing } = await supabase
        .from('wedding_records')
        .select('id')
        .eq('seq_num', parseInt(form.seqNum))
        .eq('year', parseInt(form.year))
        .maybeSingle()
      if (existing) {
        toast(`Serial No. ${slNoDisplay} already exists — use a different number`, 'error')
        return
      }
    }
    setSaving(true)
    try {
      const urls = {}
      for (const key of FILE_KEYS) {
        if (files[key].fileObj) {
          urls[key] = await uploadFile(key, files[key].fileObj, slNoPath)
        } else {
          urls[key] = files[key].url || null
        }
      }
      const record = {
        seq_num: parseInt(form.seqNum), year: parseInt(form.year),
        month: form.month ? parseInt(form.month) : null, day: form.day ? parseInt(form.day) : null,
        date_of_application: form.dateOfApplication || null,
        name_groom: form.nameGroom || null, surname_groom: form.surnameGroom || null,
        age_groom: form.ageGroom || null, dob_groom: form.dobGroom || null,
        condition_groom: form.conditionGroom || null, profession_groom: form.professionGroom || null,
        father_name_groom: form.fatherNameGroom || null, address_groom: form.addressGroom || null,
        aadhaar_groom: form.aadhaarGroom || null, church_groom: form.churchGroom || null,
        w1_name_groom: form.w1NameGroom || null, w1_addr_groom: form.w1AddrGroom || null,
        w2_name_groom: form.w2NameGroom || null, w2_addr_groom: form.w2AddrGroom || null,
        name_bride: form.nameBride || null, surname_bride: form.surnameBride || null,
        age_bride: form.ageBride || null, dob_bride: form.dobBride || null,
        condition_bride: form.conditionBride || null, profession_bride: form.professionBride || null,
        father_name_bride: form.fatherNameBride || null, address_bride: form.addressBride || null,
        aadhaar_bride: form.aadhaarBride || null, church_bride: form.churchBride || null,
        w1_name_bride: form.w1NameBride || null, w1_addr_bride: form.w1AddrBride || null,
        w2_name_bride: form.w2NameBride || null, w2_addr_bride: form.w2AddrBride || null,
        bann: form.bann || null, place_of_marriage: form.placeOfMarriage || null,
        solemnized_by: form.solemnizedBy || null, remarks: form.remarks || null,
        groom_photo_url: urls.groomPhoto, bride_photo_url: urls.bridePhoto,
        wedding_photo_url: urls.weddingPhoto, groom_aadhaar_url: urls.groomAadhaar,
        groom_baptism_url: urls.groomBaptism, groom_confirm_url: urls.groomConfirm,
        bride_aadhaar_url: urls.brideAadhaar, bride_baptism_url: urls.brideBaptism,
        bride_confirm_url: urls.brideConfirm, updated_at: new Date().toISOString(),
      }
      let error, newId
      if (editId) {
        ;({ error } = await supabase.from('wedding_records').update(record).eq('id', editId))
      } else {
        const { data, error: insErr } = await supabase.from('wedding_records').insert(record).select('id').single()
        error = insErr; newId = data?.id
      }
      if (error) throw error
      if (newId) setEditId(newId)
      setFiles(prev => {
        const updated = { ...prev }
        for (const key of FILE_KEYS) {
          if (urls[key]) updated[key] = { ...updated[key], url: urls[key], fileObj: null }
        }
        return updated
      })
      toast(`Wedding record ${editId ? 'updated' : 'saved'} — ${slNoDisplay}`, 'success')
    } catch (err) {
      toast(err.message || 'Save failed', 'error')
    } finally {
      setSaving(false)
    }
  }

  async function handleLoad(id) {
    const { data, error } = await supabase.from('wedding_records').select('*').eq('id', id).single()
    if (error || !data) { toast('Record not found', 'error'); return }
    setEditId(data.id)
    setForm({
      seqNum: String(data.seq_num ?? ''), year: data.year ?? new Date().getFullYear(),
      month: data.month ? String(data.month) : '', day: data.day ? String(data.day) : '',
      dateOfApplication: data.date_of_application ?? '',
      nameGroom: data.name_groom ?? '', surnameGroom: data.surname_groom ?? '',
      ageGroom: data.age_groom ?? '', dobGroom: data.dob_groom ?? '',
      conditionGroom: data.condition_groom ?? '', professionGroom: data.profession_groom ?? '',
      fatherNameGroom: data.father_name_groom ?? '', addressGroom: data.address_groom ?? '',
      aadhaarGroom: data.aadhaar_groom ?? '', churchGroom: data.church_groom ?? '',
      w1NameGroom: data.w1_name_groom ?? '', w1AddrGroom: data.w1_addr_groom ?? '',
      w2NameGroom: data.w2_name_groom ?? '', w2AddrGroom: data.w2_addr_groom ?? '',
      nameBride: data.name_bride ?? '', surnameBride: data.surname_bride ?? '',
      ageBride: data.age_bride ?? '', dobBride: data.dob_bride ?? '',
      conditionBride: data.condition_bride ?? '', professionBride: data.profession_bride ?? '',
      fatherNameBride: data.father_name_bride ?? '', addressBride: data.address_bride ?? '',
      aadhaarBride: data.aadhaar_bride ?? '', churchBride: data.church_bride ?? '',
      w1NameBride: data.w1_name_bride ?? '', w1AddrBride: data.w1_addr_bride ?? '',
      w2NameBride: data.w2_name_bride ?? '', w2AddrBride: data.w2_addr_bride ?? '',
      bann: data.bann ?? '', placeOfMarriage: data.place_of_marriage ?? '',
      solemnizedBy: data.solemnized_by ?? '', remarks: data.remarks ?? '',
    })
    const newFiles = { ...EMPTY_FILES }
    for (const [key, col] of Object.entries(DB_FILE_MAP)) {
      const url = data[col]
      if (url) newFiles[key] = { name: url.split('/').pop(), preview: url, fileObj: null, url }
    }
    setFiles(newFiles)
    setSearchResults([])
    toast(`Loaded ${data.name_groom ?? ''} & ${data.name_bride ?? ''} — ${data.seq_num}/${data.year}`, 'success')
  }

  async function handleDelete() {
    if (!editId) { toast('No record loaded to delete', 'error'); return }
    if (!window.confirm(`Delete wedding record ${slNoDisplay}? This cannot be undone.`)) return
    setSaving(true)
    try {
      const paths = FILE_KEYS.filter(k => files[k].url).map(k => {
        const url = files[k].url
        const idx = url.indexOf('/event-media/')
        return idx >= 0 ? url.substring(idx + '/event-media/'.length) : null
      }).filter(Boolean)
      if (paths.length) await supabase.storage.from('event-media').remove(paths)
      const { error } = await supabase.from('wedding_records').delete().eq('id', editId)
      if (error) throw error
      toast(`Record ${slNoDisplay} deleted`, 'success')
      handleReset()
    } catch (err) {
      toast(err.message || 'Delete failed', 'error')
    } finally {
      setSaving(false)
    }
  }

  async function handleSearch() {
    if (!searchVal.trim()) { toast('Enter a search value', 'error'); return }
    setSearching(true)
    setSearchResults([])
    try {
      let query = supabase.from('wedding_records').select('*')
      if (searchBy === 'slNo') {
        const [n, y] = searchVal.split('/')
        query = query.eq('seq_num', parseInt(n))
        if (y) query = query.eq('year', parseInt(y))
      } else if (searchBy === 'name') {
        query = query.or(`name_groom.ilike.%${searchVal}%,surname_groom.ilike.%${searchVal}%,name_bride.ilike.%${searchVal}%,surname_bride.ilike.%${searchVal}%`)
      } else if (searchBy === 'year') {
        query = query.eq('year', parseInt(searchVal))
      }
      const { data, error } = await query.order('year', { ascending: false }).order('seq_num', { ascending: false }).limit(20)
      if (error) throw error
      if (!data?.length) { toast('No records found', 'error'); return }
      if (data.length === 1) { setViewRecord(data[0]); return }
      setSearchResults(data)
    } catch (err) {
      toast(err.message || 'Search failed', 'error')
    } finally {
      setSearching(false)
    }
  }

  const seqPadded   = form.seqNum ? String(form.seqNum).padStart(4, '0') : '0000'
  const slNoDisplay = `${seqPadded}/${form.year}`
  const slNoPath    = `${seqPadded}-${form.year}`

  const [showRegister, setShowRegister] = useState(false)

  return (
    <div style={{ maxWidth: 1300 }}>

      {/* ── Action buttons ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: searchResults.length ? 6 : 18, flexWrap: 'wrap' }}>
        <ActionBtn icon={Plus}      label="New"    onClick={handleReset} color="#475569" disabled={saving} />
        <ActionBtn icon={saving ? Loader2 : Save} label={saving ? 'Saving…' : 'Save'} onClick={handleSave} color="#2563eb" disabled={saving} />
        <ActionBtn icon={Edit2}     label={editId ? 'Editing' : 'Edit'} color={editId ? '#0369a1' : '#64748b'} disabled />
        <ActionBtn icon={RotateCcw} label="Reset"  onClick={handleReset} color="#7c3aed" disabled={saving} />
        <ActionBtn icon={Trash2}    label="Delete" onClick={handleDelete} color="#dc2626" disabled={saving || !editId} />
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'flex-end' }}>
          <div>
            <div style={lbl()}>Search By</div>
            <select value={searchBy} onChange={e => setSearchBy(e.target.value)} style={{ ...iS, width: 140 }}>
              <option value="slNo">Serial No.</option>
              <option value="name">Name</option>
              <option value="year">Year</option>
            </select>
          </div>
          <input value={searchVal} onChange={e => setSearchVal(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSearch()}
            placeholder={searchBy === 'slNo' ? '0001/2026' : searchBy === 'year' ? '2026' : 'Name…'}
            style={{ ...iS, width: 140 }} />
          <button onClick={handleSearch} disabled={searching} style={{
            ...iS, width: 'auto', padding: '0 16px',
            background: '#2563eb', color: '#fff',
            border: 'none', cursor: 'pointer', fontWeight: 600,
            display: 'flex', alignItems: 'center', gap: 6,
            opacity: searching ? 0.7 : 1,
          }}>
            {searching ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Search size={13} />}
            View
          </button>
        </div>
      </div>

      {/* ── Search results ── */}
      {searchResults.length > 0 && (
        <div style={{
          background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8,
          marginBottom: 18, overflow: 'hidden',
        }}>
          <div style={{ padding: '8px 14px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', fontSize: 12, fontWeight: 600, color: '#64748b' }}>
            {searchResults.length} records found — click a row to view
          </div>
          {searchResults.map(r => (
            <button key={r.id} onClick={() => setViewRecord(r)} style={{
              display: 'flex', alignItems: 'center', gap: 14, width: '100%',
              padding: '9px 14px', border: 'none', background: 'transparent',
              borderBottom: '1px solid #f1f5f9', cursor: 'pointer', textAlign: 'left',
              transition: 'background 0.12s',
            }}
            onMouseEnter={e => e.currentTarget.style.background = '#f0f9ff'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
              <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#2563eb', minWidth: 80 }}>
                {String(r.seq_num).padStart(4,'0')}/{r.year}
              </span>
              <span style={{ fontSize: 13, color: '#1e293b' }}>
                {r.name_groom} {r.surname_groom} &amp; {r.name_bride} {r.surname_bride}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* ── Three-block header ── */}
      <Card style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'stretch' }}>

          {/* LEFT: Serial Number */}
          <div style={{ flex: 1, paddingRight: 28 }}>
            <SecHead label="Serial Number" color="#2563eb" small />
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div>
                <div style={lbl()}>Seq. No.</div>
                <input type="number" value={form.seqNum} onChange={handleSeqNumChange}
                  placeholder="1" min={1} readOnly={!!editId}
                  style={{ ...iS, width: 72, textAlign: 'center',
                    background: editId ? '#f1f5f9' : '#fff',
                    cursor: editId ? 'not-allowed' : 'auto',
                    borderColor: seqNumTaken ? '#dc2626' : undefined,
                    boxShadow: seqNumTaken ? '0 0 0 2px #fecaca' : undefined,
                  }} />
                {seqNumTaken && (
                  <div style={{ fontSize: 10, color: '#dc2626', fontWeight: 600, marginTop: 3 }}>
                    Already exists
                  </div>
                )}
              </div>
              <span style={{ fontSize: 22, fontWeight: 700, color: '#94a3b8', paddingTop: 18 }}>/</span>
              <div>
                <div style={lbl()}>Year</div>
                <div style={{
                  ...iS, width: 62, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: '#f1f5f9', color: '#475569', fontWeight: 700,
                }}>
                  {form.year}
                </div>
              </div>
            </div>
            <div style={{ marginTop: 10, fontFamily: 'monospace', fontSize: 22, fontWeight: 800, color: '#2563eb', letterSpacing: '0.06em' }}>
              {slNoDisplay}
            </div>
          </div>

          <VDivider />

          {/* MIDDLE: Marriage Date */}
          <div style={{ flex: 1, padding: '0 28px' }}>
            <SecHead label="Marriage Date" color="#2563eb" small />
            <div style={{ display: 'flex', gap: 10 }}>
              <div>
                <div style={lbl()}>Year</div>
                <input type="number" value={form.year} onChange={set('year')} style={{ ...iS, width: 78 }} />
              </div>
              <div>
                <div style={lbl()}>Month</div>
                <select value={form.month} onChange={set('month')} style={{ ...iS, width: 130 }}>
                  <option value="">-- Month --</option>
                  {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
                </select>
              </div>
              <div>
                <div style={lbl()}>Day</div>
                <input type="number" min={1} max={31} value={form.day} onChange={set('day')}
                  style={{ ...iS, width: 58 }} />
              </div>
            </div>
          </div>

          <VDivider />

          {/* RIGHT: Date of Application */}
          <div style={{ flex: 1, paddingLeft: 28 }}>
            <SecHead label="Date of Application" color="#2563eb" small />
            <div style={lbl()}>Date</div>
            <input value={form.dateOfApplication} onChange={set('dateOfApplication')}
              placeholder="DD-MM-YYYY" style={{ ...iS, width: 160 }} />
          </div>
        </div>
      </Card>

      {/* ── Personal Details ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
        <Card>
          <SecHead label="Bridegroom Details" color="#2563eb" />
          <PersonFields form={form} set={set} setForm={setForm} side="Groom" color="#2563eb" />
        </Card>
        <Card>
          <SecHead label="Bride Details" color="#db2777" />
          <PersonFields form={form} set={set} setForm={setForm} side="Bride" color="#db2777" />
        </Card>
      </div>

      {/* ── Witnesses ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
        <Card>
          <SecHead label="Bridegroom's Witnesses" color="#3b82f6" small />
          <WitnessFields form={form} set={set} side="Groom" color="#3b82f6" />
        </Card>
        <Card>
          <SecHead label="Bride's Witnesses" color="#ec4899" small />
          <WitnessFields form={form} set={set} side="Bride" color="#ec4899" />
        </Card>
      </div>

      {/* ── Photo & Documents ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
        <Card>
          <SecHead label="Bridegroom — Photo & Documents" color="#3b82f6" small />
          <MediaRow
            photoKey="groomPhoto" photoRef={groomPhotoRef}
            docs={[
              { key: 'groomAadhaar', label: 'Aadhaar',        fileRef: groomAadhaarRef },
              { key: 'groomBaptism', label: 'Baptism Cert.',  fileRef: groomBaptismRef },
              { key: 'groomConfirm', label: 'Confirm. Cert.', fileRef: groomConfirmRef },
            ]}
            files={files} slNoPath={slNoPath} side="Groom"
          />
          {['groomPhoto','groomAadhaar','groomBaptism','groomConfirm'].map(key => (
            <input key={key} type="file"
              accept={key === 'groomPhoto' ? 'image/*' : 'image/*,application/pdf'}
              ref={REFS[key]} onChange={e => handleFile(key, e)} style={{ display: 'none' }} />
          ))}
        </Card>
        <Card>
          <SecHead label="Bride — Photo & Documents" color="#ec4899" small />
          <MediaRow
            photoKey="bridePhoto" photoRef={bridePhotoRef}
            docs={[
              { key: 'brideAadhaar', label: 'Aadhaar',        fileRef: brideAadhaarRef },
              { key: 'brideBaptism', label: 'Baptism Cert.',  fileRef: brideBaptismRef },
              { key: 'brideConfirm', label: 'Confirm. Cert.', fileRef: brideConfirmRef },
            ]}
            files={files} slNoPath={slNoPath} side="Bride"
          />
          {['bridePhoto','brideAadhaar','brideBaptism','brideConfirm'].map(key => (
            <input key={key} type="file"
              accept={key === 'bridePhoto' ? 'image/*' : 'image/*,application/pdf'}
              ref={REFS[key]} onChange={e => handleFile(key, e)} style={{ display: 'none' }} />
          ))}
        </Card>
      </div>

      {/* ── Ceremony Details ── */}
      <Card style={{ marginBottom: 14 }}>
        <SecHead label="Ceremony Details" color="#2563eb" />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 14 }}>
          <div>
            <div style={lbl('#2563eb')}>Banns / Licensee</div>
            <select value={form.bann} onChange={set('bann')} style={{ ...iS, width: '100%' }}>
              <option value="">-- Select --</option>
              {BANN_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
          <div style={{ gridColumn: 'span 2' }}>
            <div style={lbl('#2563eb')}>Place of Marriage</div>
            <input value={form.placeOfMarriage} onChange={set('placeOfMarriage')}
              style={{ ...iS, width: '100%' }} />
          </div>
          <div style={{ gridColumn: 'span 2' }}>
            <div style={lbl('#2563eb')}>Solemnized By</div>
            <input value={form.solemnizedBy} onChange={set('solemnizedBy')}
              style={{ ...iS, width: '100%' }} />
          </div>
        </div>

        {/* Wedding Photo */}
        <div style={{ marginTop: 20, paddingTop: 18, borderTop: '1px dashed #e2e8f0' }}>
          <SecHead label="Wedding Photo (Common)" color="#7c3aed" small />
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 20 }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, flexShrink: 0 }}>
              <div style={{
                width: 180, height: 110,
                border: `2px dashed ${files.weddingPhoto.name ? '#a78bfa' : '#cbd5e1'}`,
                borderRadius: 8, background: files.weddingPhoto.name ? '#f5f3ff' : '#f8fafc',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                overflow: 'hidden', transition: 'all 0.2s',
              }}>
                {files.weddingPhoto.preview
                  ? <img src={files.weddingPhoto.preview} alt="wedding"
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  : <Camera size={28} style={{ color: '#c4b5fd' }} />
                }
              </div>
              <button onClick={() => weddingPhotoRef.current?.click()}
                style={uploadBtnStyle(!!files.weddingPhoto.name, '#7c3aed')}>
                <Upload size={12} />
                {files.weddingPhoto.name ? 'Change Photo' : 'Upload Wedding Photo'}
              </button>
              {files.weddingPhoto.name && (
                <div style={{ fontSize: 10, color: '#7c3aed', fontWeight: 600 }}>
                  {files.weddingPhoto.name}
                </div>
              )}
            </div>
            <div style={{ flex: 1, paddingTop: 4 }}>
              <div style={{ marginTop: 4 }}>
                <div style={lbl('#7c3aed')}>Remarks</div>
                <textarea value={form.remarks} onChange={set('remarks')} rows={3}
                  style={{ ...iS, height: 'auto', padding: '8px 10px', resize: 'vertical', width: '100%' }} />
              </div>
            </div>
          </div>
          <input type="file" accept="image/*" ref={weddingPhotoRef}
            onChange={e => handleFile('weddingPhoto', e)} style={{ display: 'none' }} />
        </div>
      </Card>

      {/* ── Reports ── */}
      <Card>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, fontWeight: 800, color: '#ef4444',
            letterSpacing: '0.1em', textTransform: 'uppercase' }}>
            Reports
          </span>
          <ReportBtn label="Marriage Reg. Sch. IV Form" onClick={() => setShowIV(true)} color="#800020" />
          <ReportBtn label="Marriage Register" color="#1e40af" onClick={() => setShowRegister(true)} />
        </div>
      </Card>

      {/* ── Schedule IV Modal ── */}
      {showIV && (
        <ScheduleIVModal form={form} files={files} onClose={() => setShowIV(false)} />
      )}

      {/* ── Marriage Register Modal ── */}
      {showRegister && (
        <MarriageRegisterModal onClose={() => setShowRegister(false)} />
      )}

      {/* ── View Record Modal ── */}
      {viewRecord && (
        <ViewRecordModal
          record={viewRecord}
          onClose={() => setViewRecord(null)}
          onEdit={() => { handleLoad(viewRecord.id); setViewRecord(null) }}
        />
      )}
    </div>
  )
}

/* ─── Media row ──────────────────────────────────────────────────── */
function MediaRow({ photoKey, photoRef, docs, files, slNoPath, side }) {
  const photo = files[photoKey]
  return (
    <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <div style={{
          width: 110, height: 140,
          border: '2px dashed #cbd5e1', borderRadius: 8,
          background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center',
          overflow: 'hidden',
        }}>
          {photo.preview
            ? <img src={photo.preview} alt="photo" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            : <Camera size={28} style={{ color: '#cbd5e1' }} />
          }
        </div>
        <button onClick={() => photoRef.current?.click()} style={uploadBtnStyle(!!photo.name)}>
          <Upload size={11} /> {photo.name ? 'Change' : 'Upload'}
        </button>
        {photo.name && (
          <div style={{ fontSize: 9, color: '#64748b', maxWidth: 110, overflow: 'hidden',
            textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {photo.name}
          </div>
        )}
      </div>
      <VDivider />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8',
          letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 10 }}>
          Documents
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
          {docs.map(({ key, label, fileRef }) => (
            <DocSlot key={key} label={label} fileData={files[key]} fileRef={fileRef}
              pathHint={`Events/Wedding/${slNoPath}/${side}/${label.replace(/[\s.]/g, '_')}`} />
          ))}
        </div>
      </div>
    </div>
  )
}

/* ─── Document slot ──────────────────────────────────────────────── */
function DocSlot({ label, fileData, fileRef, pathHint }) {
  const { name, preview } = fileData
  const isPdf = name && /\.pdf$/i.test(name)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
      <div style={{
        width: '100%', height: 90,
        border: `1px dashed ${name ? '#86efac' : '#cbd5e1'}`,
        borderRadius: 6, background: name ? '#f0fdf4' : '#f8fafc',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        overflow: 'hidden', transition: 'all 0.2s',
      }}>
        {name
          ? isPdf
            ? <div style={{ textAlign: 'center' }}>
                <FileText size={26} style={{ color: '#16a34a' }} />
                <div style={{ fontSize: 9, color: '#16a34a', fontWeight: 700, marginTop: 2 }}>PDF</div>
              </div>
            : preview
              ? <img src={preview} alt={label} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : <FileText size={24} style={{ color: '#16a34a' }} />
          : <Upload size={20} style={{ color: '#e2e8f0' }} />
        }
      </div>
      <span style={{ fontSize: 9, fontWeight: 700, color: '#475569', textAlign: 'center',
        textTransform: 'uppercase', letterSpacing: '0.04em', lineHeight: 1.3 }}>
        {label}
      </span>
      <button onClick={() => fileRef.current?.click()} style={uploadBtnStyle(!!name)}>
        <Upload size={9} /> {name ? 'Change' : 'Upload'}
      </button>
      {name && (
        <div style={{ fontSize: 9, color: '#94a3b8', width: '100%',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'center' }}>
          {name}
        </div>
      )}
    </div>
  )
}

/* ─── Person fields ──────────────────────────────────────────────── */
function PersonFields({ form, set, setForm, side, color }) {
  const conditions = side === 'Groom' ? GROOM_CONDITIONS : BRIDE_CONDITIONS

  function calcAge(dob) {
    const [d, m, y] = dob.split('-').map(Number)
    if (!d || !m || !y || y < 1900) return ''
    const today = new Date()
    let age = today.getFullYear() - y
    if (today.getMonth() + 1 < m || (today.getMonth() + 1 === m && today.getDate() < d)) age--
    return age > 0 ? String(age) : ''
  }

  function handleDob(e) {
    const val = e.target.value
    const age = val.length === 10 ? calcAge(val) : ''
    setForm(f => ({ ...f, [`dob${side}`]: val, ...(age ? { [`age${side}`]: age } : {}) }))
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <F label="Name" color={color}>
          <input value={form[`name${side}`]} onChange={set(`name${side}`)} style={{ ...iS, width: '100%' }} />
        </F>
        <F label="Surname" color={color}>
          <input value={form[`surname${side}`]} onChange={set(`surname${side}`)} style={{ ...iS, width: '100%' }} />
        </F>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '90px 1fr 70px', gap: 10 }}>
        <F label="Sex" color={color}>
          <input value={side === 'Groom' ? 'Male' : 'Female'} readOnly style={{
            ...iS, width: '100%', background: '#f8fafc', color, fontWeight: 700, cursor: 'default',
          }} />
        </F>
        <F label="D.O.B." color={color}>
          <input value={form[`dob${side}`]} onChange={handleDob}
            placeholder="DD-MM-YYYY" style={{ ...iS, width: '100%' }} />
        </F>
        <F label="Age" color={color}>
          <input type="number" value={form[`age${side}`]} onChange={set(`age${side}`)}
            style={{ ...iS, width: '100%' }} />
        </F>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <F label="Condition" color={color}>
          <select value={form[`condition${side}`]} onChange={set(`condition${side}`)} style={{ ...iS, width: '100%' }}>
            <option value="">-- Select --</option>
            {conditions.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </F>
        <F label="Profession" color={color}>
          <input value={form[`profession${side}`]} onChange={set(`profession${side}`)}
            style={{ ...iS, width: '100%' }} />
        </F>
      </div>
      <F label="Father's Name" color={color}>
        <input value={form[`fatherName${side}`]} onChange={set(`fatherName${side}`)}
          style={{ ...iS, width: '100%' }} />
      </F>
      <F label="Address" color={color}>
        <textarea value={form[`address${side}`]} onChange={set(`address${side}`)} rows={2}
          style={{ ...iS, height: 'auto', padding: '8px 10px', resize: 'vertical', width: '100%' }} />
      </F>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <F label="Aadhaar No." color={color}>
          <input value={form[`aadhaar${side}`]}
            onChange={e => setForm(f => ({ ...f, [`aadhaar${side}`]: fmtAadhaar(e.target.value) }))}
            placeholder="XXXX-XXXX-XXXX" maxLength={14} style={{ ...iS, width: '100%' }} />
        </F>
        <F label="Member Church" color={color}>
          <input value={form[`church${side}`]} onChange={set(`church${side}`)}
            style={{ ...iS, width: '100%' }} />
        </F>
      </div>
    </div>
  )
}

/* ─── Witness fields ─────────────────────────────────────────────── */
function WitnessFields({ form, set, side, color }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {[1, 2].map(n => (
        <div key={n}>
          <F label={`Witness ${n} Name`} color={color}>
            <input value={form[`w${n}Name${side}`]} onChange={set(`w${n}Name${side}`)}
              style={{ ...iS, width: '100%' }} />
          </F>
          <div style={{ marginTop: 8 }}>
            <F label={`Witness ${n} Address`} color={color}>
              <textarea value={form[`w${n}Addr${side}`]} onChange={set(`w${n}Addr${side}`)} rows={2}
                style={{ ...iS, height: 'auto', padding: '8px 10px', resize: 'vertical', width: '100%' }} />
            </F>
          </div>
          {n === 1 && <div style={{ borderBottom: '1px dashed #e2e8f0', margin: '12px 0' }} />}
        </div>
      ))}
    </div>
  )
}

/* ─── View Record Modal ──────────────────────────────────────────── */
function ViewRecordModal({ record: r, onClose, onEdit }) {
  const slNo = `${String(r.seq_num).padStart(4,'0')}/${r.year}`
  const monthName = r.month ? MONTHS[r.month - 1] : ''
  const marriageDate = [r.day, monthName, r.year].filter(Boolean).join(' ')

  function Row({ label, value, bold }) {
    if (!value) return null
    return (
      <div style={{ display:'flex', gap:8, padding:'5px 0', borderBottom:'1px solid #f1f5f9' }}>
        <span style={{ minWidth:160, fontSize:12, color:'#64748b', flexShrink:0 }}>{label}</span>
        <span style={{ fontSize:13, fontWeight: bold ? 700 : 500, color:'#1e293b' }}>{value}</span>
      </div>
    )
  }

  function Section({ title, color='#2563eb', children }) {
    return (
      <div style={{ marginBottom:18 }}>
        <div style={{ fontSize:10, fontWeight:800, letterSpacing:'0.1em', textTransform:'uppercase',
          color, borderBottom:`2px solid ${color}22`, paddingBottom:4, marginBottom:8 }}>
          {title}
        </div>
        {children}
      </div>
    )
  }

  return (
    <div style={{
      position:'fixed', inset:0, zIndex:1000, background:'rgba(0,0,0,0.55)',
      display:'flex', alignItems:'center', justifyContent:'center', padding:24,
    }} onClick={onClose}>
      <div style={{
        background:'#fff', borderRadius:14, width:'100%', maxWidth:820,
        maxHeight:'90vh', overflow:'auto', boxShadow:'0 24px 60px rgba(0,0,0,0.3)',
      }} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{
          display:'flex', alignItems:'center', justifyContent:'space-between',
          padding:'18px 24px', borderBottom:'1px solid #e2e8f0',
          position:'sticky', top:0, background:'#fff', zIndex:10,
        }}>
          <div>
            <div style={{ fontSize:11, color:'#64748b', fontWeight:600, letterSpacing:'0.08em', textTransform:'uppercase' }}>Wedding Record</div>
            <div style={{ fontSize:22, fontWeight:800, color:'#1e293b', fontFamily:'monospace', letterSpacing:'0.06em' }}>{slNo}</div>
          </div>
          <div style={{ display:'flex', gap:8 }}>
            <button onClick={onEdit} style={{
              display:'flex', alignItems:'center', gap:6, padding:'8px 18px',
              borderRadius:7, border:'none', background:'#2563eb', color:'#fff',
              fontWeight:700, fontSize:13, cursor:'pointer',
            }}>
              <Edit2 size={14} /> Edit
            </button>
            <button onClick={onClose} style={{
              display:'flex', alignItems:'center', gap:6, padding:'8px 14px',
              borderRadius:7, border:'1px solid #e2e8f0', background:'#fff',
              color:'#64748b', fontWeight:600, fontSize:13, cursor:'pointer',
            }}>
              <X size={14} /> Close
            </button>
          </div>
        </div>

        {/* Body */}
        <div style={{ padding:'24px' }}>

          {/* Row 1: Marriage Details (full width) */}
          <Section title="Marriage Details" color="#2563eb">
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'0 32px' }}>
              <div>
                <Row label="Serial Number"      value={slNo}                bold />
                <Row label="Marriage Date"       value={marriageDate}        bold />
                <Row label="Date of Application" value={r.date_of_application} />
                <Row label="Place of Marriage"   value={r.place_of_marriage} bold />
              </div>
              <div>
                <Row label="Banns / Licensee" value={r.bann} />
                <Row label="Solemnized By"    value={r.solemnized_by} bold />
                <Row label="Remarks"          value={r.remarks} />
              </div>
            </div>
          </Section>

          {/* Row 2: Bridegroom | Bride — parallel with photos */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:24, marginBottom:18 }}>
            <Section title="Bridegroom" color="#2563eb">
              {r.groom_photo_url && (
                <div style={{ display:'flex', justifyContent:'center', marginBottom:12 }}>
                  <div style={{ textAlign:'center' }}>
                    <img src={r.groom_photo_url} alt="Groom"
                      style={{ width:110, height:110, objectFit:'cover', borderRadius:10, border:'3px solid #bfdbfe' }} />
                  </div>
                </div>
              )}
              <Row label="Name"          value={`${r.name_groom || ''} ${r.surname_groom || ''}`.trim()} bold />
              <Row label="Date of Birth" value={r.dob_groom} />
              <Row label="Age"           value={r.age_groom ? `${r.age_groom} years` : ''} />
              <Row label="Condition"     value={r.condition_groom} />
              <Row label="Profession"    value={r.profession_groom} bold />
              <Row label="Address"       value={r.address_groom} />
              <Row label="Father's Name" value={r.father_name_groom} bold />
              <Row label="Aadhaar No."   value={r.aadhaar_groom} />
              <Row label="Church"        value={r.church_groom} />
            </Section>
            <Section title="Bride" color="#db2777">
              {r.bride_photo_url && (
                <div style={{ display:'flex', justifyContent:'center', marginBottom:12 }}>
                  <div style={{ textAlign:'center' }}>
                    <img src={r.bride_photo_url} alt="Bride"
                      style={{ width:110, height:110, objectFit:'cover', borderRadius:10, border:'3px solid #fbcfe8' }} />
                  </div>
                </div>
              )}
              <Row label="Name"          value={`${r.name_bride || ''} ${r.surname_bride || ''}`.trim()} bold />
              <Row label="Date of Birth" value={r.dob_bride} />
              <Row label="Age"           value={r.age_bride ? `${r.age_bride} years` : ''} />
              <Row label="Condition"     value={r.condition_bride} />
              <Row label="Profession"    value={r.profession_bride} bold />
              <Row label="Address"       value={r.address_bride} />
              <Row label="Father's Name" value={r.father_name_bride} bold />
              <Row label="Aadhaar No."   value={r.aadhaar_bride} />
              <Row label="Church"        value={r.church_bride} />
            </Section>
          </div>

          {/* Wedding photo centred if present */}
          {r.wedding_photo_url && (
            <div style={{ textAlign:'center', marginBottom:18 }}>
              <div style={{ fontSize:10, fontWeight:800, letterSpacing:'0.1em', textTransform:'uppercase',
                color:'#7c3aed', marginBottom:8 }}>Wedding Photo</div>
              <img src={r.wedding_photo_url} alt="Wedding"
                style={{ maxWidth:260, maxHeight:160, objectFit:'cover', borderRadius:10, border:'3px solid #ede9fe' }} />
            </div>
          )}

          {/* Row 4: Witnesses — parallel */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:24, marginBottom:18 }}>
            <Section title="Bridegroom's Witnesses" color="#3b82f6">
              <Row label="Witness 1" value={r.w1_name_groom} bold />
              <Row label="Address"   value={r.w1_addr_groom} />
              <Row label="Witness 2" value={r.w2_name_groom} bold />
              <Row label="Address"   value={r.w2_addr_groom} />
            </Section>
            <Section title="Bride's Witnesses" color="#ec4899">
              <Row label="Witness 1" value={r.w1_name_bride} bold />
              <Row label="Address"   value={r.w1_addr_bride} />
              <Row label="Witness 2" value={r.w2_name_bride} bold />
              <Row label="Address"   value={r.w2_addr_bride} />
            </Section>
          </div>

          {/* Row 5: Documents */}
          {[r.groom_aadhaar_url, r.groom_baptism_url, r.groom_confirm_url,
            r.bride_aadhaar_url, r.bride_baptism_url, r.bride_confirm_url].some(Boolean) && (
            <Section title="Documents" color="#0369a1">
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'4px 24px' }}>
              {[
                { url: r.groom_aadhaar_url,   label: 'Groom — Aadhaar' },
                { url: r.bride_aadhaar_url,   label: 'Bride — Aadhaar' },
                { url: r.groom_baptism_url,   label: 'Groom — Baptism Cert.' },
                { url: r.bride_baptism_url,   label: 'Bride — Baptism Cert.' },
                { url: r.groom_confirm_url,   label: 'Groom — Confirmation Cert.' },
                { url: r.bride_confirm_url,   label: 'Bride — Confirmation Cert.' },
              ].map(({ url, label }) => url ? (
                <div key={label} style={{ display:'flex', alignItems:'center', gap:8, padding:'4px 0', borderBottom:'1px solid #f1f5f9' }}>
                  <FileText size={13} style={{ color:'#0369a1', flexShrink:0 }} />
                  <a href={url} target="_blank" rel="noreferrer"
                    style={{ fontSize:12, color:'#0369a1', textDecoration:'none', fontWeight:500 }}>
                    {label}
                  </a>
                </div>
              ) : null)}
              </div>
            </Section>
          )}

        </div>
      </div>
    </div>
  )
}

/* ─── Marriage Register Modal ────────────────────────────────────── */
function MarriageRegisterModal({ onClose }) {
  const [year,    setYear]    = useState(new Date().getFullYear())
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(false)

  async function load(yr) {
    setLoading(true)
    const { data, error } = await supabase
      .from('wedding_records')
      .select('seq_num,year,month,day,name_groom,surname_groom,age_groom,dob_groom,condition_groom,profession_groom,address_groom,father_name_groom,name_bride,surname_bride,age_bride,dob_bride,condition_bride,profession_bride,address_bride,father_name_bride,bann,place_of_marriage,solemnized_by,remarks,w1_name_groom,w1_addr_groom,w2_name_groom,w2_addr_groom,w1_name_bride,w1_addr_bride,w2_name_bride,w2_addr_bride')
      .eq('year', yr)
      .order('seq_num', { ascending: true })
    setLoading(false)
    if (!error) setRecords(data || [])
  }

  useEffect(() => { load(year) }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function handleYearChange(yr) { setYear(yr); load(yr) }

  function handlePrint() {
    const el  = document.getElementById('marriage-register-content')
    const win = window.open('', '_blank', 'width=1300,height=900')
    win.document.write(`<!DOCTYPE html>
<html>
<head>
  <title>Marriage Register ${year}</title>
  <style>
    @page { size: A4 landscape; margin: 0.75in 0.5in; }
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family:'Times New Roman',serif; font-size:8pt; color:#000; }
    table { width:100%; border-collapse:collapse; table-layout:fixed; }
    th,td { border:1px solid #000; padding:3pt 4pt; vertical-align:top; }
    th { text-align:center; font-weight:bold; background:#fff; }
    [style*="writing-mode"] { writing-mode:vertical-rl; transform:rotate(180deg); text-align:center; white-space:nowrap; }
  </style>
</head>
<body>${el.innerHTML}</body>
</html>`)
    win.document.close()
    setTimeout(() => { win.focus(); win.print() }, 500)
  }

  const TH = { border:'1px solid #333', padding:'4px 5px', textAlign:'center', fontWeight:700, fontSize:9, background:'#fff' }
  const TD = { border:'1px solid #333', padding:'6px 5px', verticalAlign:'top', fontSize:8.5 }
  const VT = { writingMode:'vertical-rl', transform:'rotate(180deg)', whiteSpace:'nowrap', textAlign:'center', width:22 }

  const yearOpts = []
  for (let y = new Date().getFullYear(); y >= 2000; y--) yearOpts.push(y)

  return (
    <div style={{
      position:'fixed', inset:0, zIndex:1000,
      background:'rgba(0,0,0,0.7)',
      display:'flex', flexDirection:'column', alignItems:'center',
      padding:'16px 12px', overflow:'auto',
    }}>
      {/* Toolbar */}
      <div style={{
        display:'flex', gap:10, marginBottom:12,
        width:'297mm', flexShrink:0, justifyContent:'space-between', alignItems:'center',
      }}>
        <div style={{ display:'flex', alignItems:'center', gap:12 }}>
          <span style={{ color:'#fff', fontWeight:700, fontSize:14 }}>
            Marriage Register
          </span>
          <div style={{ display:'flex', alignItems:'center', gap:6 }}>
            <label style={{ color:'#cbd5e1', fontSize:12 }}>Year</label>
            <select value={year} onChange={e => handleYearChange(Number(e.target.value))}
              style={{ padding:'5px 10px', borderRadius:6, border:'1px solid #475569', background:'#1e293b', color:'#fff', fontSize:13 }}>
              {yearOpts.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          {loading && <Loader2 size={16} style={{ color:'#94a3b8', animation:'spin 1s linear infinite' }} />}
          {!loading && <span style={{ color:'#94a3b8', fontSize:12 }}>{records.length} record{records.length !== 1 ? 's' : ''}</span>}
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <button onClick={handlePrint} style={{
            display:'flex', alignItems:'center', gap:6,
            padding:'8px 18px', borderRadius:7, border:'none',
            background:'#2563eb', color:'#fff', fontWeight:700, fontSize:13, cursor:'pointer',
          }}>
            <Printer size={15} /> Print / Save PDF
          </button>
          <button onClick={onClose} style={{
            display:'flex', alignItems:'center', gap:6,
            padding:'8px 14px', borderRadius:7,
            border:'1px solid rgba(255,255,255,0.3)', background:'transparent',
            color:'#fff', fontWeight:600, fontSize:13, cursor:'pointer',
          }}>
            <X size={14} /> Close
          </button>
        </div>
      </div>

      {/* Document */}
      <div style={{
        background:'#fff', width:'297mm', boxSizing:'border-box',
        flexShrink:0, boxShadow:'0 8px 32px rgba(0,0,0,0.4)',
        fontFamily:'"Times New Roman",serif', color:'#000',
      }}>
        <div style={{ margin:'0.75in 0.5in', border:'2px solid #000', borderRadius:3, padding:'0.25in 0.3in', boxSizing:'border-box' }}>
          <div id="marriage-register-content">

            {/* Title */}
            <div style={{ textAlign:'center', marginBottom:12 }}>
              <div style={{ fontSize:20, fontWeight:700, letterSpacing:'0.18em', marginBottom:3 }}>MARRIAGE REGISTER</div>
              <div style={{ fontSize:11, marginBottom:3 }}>Indian Christian Marriage Act 1872</div>
              <div style={{ fontSize:10, marginBottom:6 }}>Year: <strong>{year}</strong></div>
            </div>

            {records.length === 0 ? (
              <div style={{ textAlign:'center', padding:'40px 0', color:'#94a3b8', fontSize:13 }}>
                {loading ? 'Loading…' : 'No records found for this year.'}
              </div>
            ) : (
              <table style={{ width:'100%', borderCollapse:'collapse', tableLayout:'fixed' }}>
                <colgroup>
                  <col style={{ width:'5%'   }} />{/* No */}
                  <col style={{ width:'3%'   }} />{/* Year */}
                  <col style={{ width:'3.5%' }} />{/* Month */}
                  <col style={{ width:'2.5%' }} />{/* Day */}
                  <col style={{ width:'9%'   }} />{/* Chr. Name */}
                  <col style={{ width:'7%'   }} />{/* Surname */}
                  <col style={{ width:'7%'   }} />{/* DOB & Age */}
                  <col style={{ width:'5.5%' }} />{/* Condition */}
                  <col style={{ width:'7%'   }} />{/* Profession */}
                  <col                          />{/* Residence */}
                  <col style={{ width:'8%'   }} />{/* Father */}
                  <col style={{ width:'7%'   }} />{/* Banns */}
                </colgroup>
                <thead>
                  <tr>
                    <th rowSpan={3} style={{ ...TH, ...VT }}>NO</th>
                    <th colSpan={3} style={TH}>When Married</th>
                    <th colSpan={2} style={TH}>Name of Parties</th>
                    <th rowSpan={3} style={TH}>Date of Birth &amp; Age</th>
                    <th rowSpan={3} style={TH}>Condition</th>
                    <th rowSpan={3} style={TH}>Rank or Profession</th>
                    <th rowSpan={3} style={TH}>Residence at the time of Marriage</th>
                    <th rowSpan={3} style={TH}>Father's name and Surname</th>
                    <th rowSpan={3} style={TH}>Banns or Licensee</th>
                  </tr>
                  <tr>
                    <th style={{ ...TH, ...VT }}>Year</th>
                    <th style={{ ...TH, ...VT }}>Month</th>
                    <th style={{ ...TH, ...VT }}>Day</th>
                    <th style={TH}>Christian Name</th>
                    <th style={TH}>Surname</th>
                  </tr>
                </thead>
                <tbody>
                  {records.map(r => {
                    const slNo = `${String(r.seq_num).padStart(4,'0')}/${r.year}`
                    const monthAbbr = r.month ? MONTHS[r.month - 1]?.slice(0,3).toUpperCase() : ''
                    return (
                      <tr key={r.seq_num}>
                        <td style={{ ...TD, ...VT, fontWeight:700, fontSize:8 }}>{slNo}</td>
                        <td style={{ ...TD, ...VT, fontSize:8 }}>{r.year}</td>
                        <td style={{ ...TD, ...VT, fontSize:8 }}>{monthAbbr}</td>
                        <td style={{ ...TD, ...VT, fontSize:8 }}>{r.day}</td>
                        <td style={TD}>
                          <div style={{ fontWeight:700 }}>{r.name_groom?.toUpperCase()}</div>
                          <div style={{ marginTop:4, paddingTop:4, borderTop:'1px solid #ccc', fontWeight:700 }}>{r.name_bride?.toUpperCase()}</div>
                        </td>
                        <td style={TD}>
                          <div style={{ fontWeight:700 }}>{r.surname_groom?.toUpperCase()}</div>
                          <div style={{ marginTop:4, paddingTop:4, borderTop:'1px solid #ccc', fontWeight:700 }}>{r.surname_bride?.toUpperCase()}</div>
                        </td>
                        <td style={TD}>
                          <div>{r.dob_groom}</div>
                          {r.age_groom && <div style={{ fontWeight:700 }}>{r.age_groom} YRS</div>}
                          <div style={{ marginTop:4, paddingTop:4, borderTop:'1px solid #ccc' }}>{r.dob_bride}</div>
                          {r.age_bride && <div style={{ fontWeight:700 }}>{r.age_bride} YRS</div>}
                        </td>
                        <td style={TD}>
                          <div>{r.condition_groom?.toUpperCase()}</div>
                          <div style={{ marginTop:4, paddingTop:4, borderTop:'1px solid #ccc' }}>{r.condition_bride?.toUpperCase()}</div>
                        </td>
                        <td style={TD}>
                          <div style={{ fontWeight:700 }}>{r.profession_groom?.toUpperCase()}</div>
                          <div style={{ marginTop:4, paddingTop:4, borderTop:'1px solid #ccc', fontWeight:700 }}>{r.profession_bride?.toUpperCase()}</div>
                        </td>
                        <td style={TD}>
                          <div>{r.address_groom?.toUpperCase()}</div>
                          <div style={{ marginTop:4, paddingTop:4, borderTop:'1px solid #ccc' }}>{r.address_bride?.toUpperCase()}</div>
                        </td>
                        <td style={TD}>
                          <div style={{ fontWeight:700 }}>{r.father_name_groom?.toUpperCase()}</div>
                          <div style={{ marginTop:4, paddingTop:4, borderTop:'1px solid #ccc', fontWeight:700 }}>{r.father_name_bride?.toUpperCase()}</div>
                        </td>
                        <td style={{ ...TD, textAlign:'center', verticalAlign:'middle', fontWeight:700, wordBreak:'break-word' }}>
                          {r.bann?.toUpperCase()}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}

          </div>
        </div>
      </div>
    </div>
  )
}

/* ─── Schedule IV Modal ──────────────────────────────────────────── */
function ScheduleIVModal({ form, files, onClose }) {
  const seqPadded   = form.seqNum ? String(form.seqNum).padStart(4, '0') : '0000'
  const slNo        = `${seqPadded}/${form.year}`
  const monthAbbr   = form.month ? MONTHS[form.month - 1]?.substring(0, 3).toUpperCase() : ''
  const groomFull   = [form.nameGroom, form.surnameGroom].filter(Boolean).join(' ').toUpperCase()
  const brideFull   = [form.nameBride, form.surnameBride].filter(Boolean).join(' ').toUpperCase()
  const marriageDate = [form.day, form.month, form.year].filter(Boolean).join('/')

  function handlePrint() {
    const el  = document.getElementById('schedule-iv-content')
    const win = window.open('', '_blank', 'width=1200,height=800')
    win.document.write(`<!DOCTYPE html>
<html>
<head>
  <title>Marriage Register – Schedule IV</title>
  <style>
    @page { size:A4 landscape; margin:1in 0.5in 0.5in 0.5in; }
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family:'Times New Roman',serif; font-size:10pt; color:#000; background:#fff; border:2px solid #000; padding:0.25in 0.3in; box-sizing:border-box; }
    table { width:100%; border-collapse:collapse; table-layout:fixed; font-size:8.5pt; }
    th, td { border:1px solid #000; padding:3pt 4pt; vertical-align:top; }
    th { text-align:center; font-weight:bold; }
    [style*="writing-mode"] { writing-mode:vertical-rl; transform:rotate(180deg); text-align:center; white-space:nowrap; }
    .grid { display:grid; grid-template-columns:1fr 1fr; gap:16pt; margin-top:14pt; font-size:8.5pt; }
    .box  { border:1px solid #000; padding:8pt 10pt; }
  </style>
</head>
<body>
${el.innerHTML}
</body>
</html>`)
    win.document.close()
    setTimeout(() => { win.focus(); win.print() }, 500)
  }

  /* table cell styles */
  const TH = { border: '1px solid #333', padding: '4px 5px', textAlign: 'center',
    fontWeight: 700, fontSize: 9, background: '#fff' }
  const TD = { border: '1px solid #333', padding: '12px 8px',
    verticalAlign: 'top', fontSize: 9 }
  const VT = { writingMode: 'vertical-rl', transform: 'rotate(180deg)',
    whiteSpace: 'nowrap', textAlign: 'center', width: 24 }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(0,0,0,0.7)',
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      padding: '16px 12px', overflow: 'auto',
    }}>
      {/* Toolbar */}
      <div style={{
        display: 'flex', gap: 10, marginBottom: 12,
        width: '297mm', flexShrink: 0, justifyContent: 'space-between', alignItems: 'center',
      }}>
        <span style={{ color: '#fff', fontWeight: 700, fontSize: 14 }}>
          Marriage Register — Schedule IV Preview
        </span>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={handlePrint} style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '8px 18px', borderRadius: 7, border: 'none',
            background: '#2563eb', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer',
          }}>
            <Printer size={15} /> Print / Save PDF
          </button>
          <button onClick={onClose} style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '8px 14px', borderRadius: 7,
            border: '1px solid rgba(255,255,255,0.3)', background: 'transparent',
            color: '#fff', fontWeight: 600, fontSize: 13, cursor: 'pointer',
          }}>
            <X size={14} /> Close
          </button>
        </div>
      </div>

      {/* Document — A4 Landscape */}
      <div style={{
        background: '#fff',
        width: '297mm',
        boxSizing: 'border-box',
        flexShrink: 0,
        boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
        fontFamily: '"Times New Roman", serif', color: '#000',
      }}>
        {/* Border — 1in top, 0.5in bottom, 0.5in left/right */}
        <div style={{
          margin: '1in 0.5in 0.5in 0.5in',
          border: '2px solid #000',
          borderRadius: 3,
          padding: '0.25in 0.3in',
          boxSizing: 'border-box',
        }}>
        <div id="schedule-iv-content" style={{ display: 'flex', flexDirection: 'column', minHeight: '152mm' }}>

          {/* Title block */}
          <div style={{ textAlign: 'center', marginBottom: 14 }}>
            <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: '0.18em', marginBottom: 3 }}>
              MARRIAGE REGISTER
            </div>
            <div style={{ fontSize: 11, marginBottom: 3 }}>Indian Christian Marriage Act 1872</div>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 2 }}>SCHEDULE - IV</div>
            <div style={{ fontSize: 10, marginBottom: 5 }}>(Sec.32 &amp; 54)</div>
            <div style={{ fontSize: 14, fontWeight: 700 }}>
              {form.placeOfMarriage || '[CHURCH NAME, ADDRESS]'}
            </div>
          </div>

          {/* Main table */}
          <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
            <colgroup>
              <col style={{ width: '4%'   }} />{/* NO */}
              <col style={{ width: '3%'   }} />{/* Year */}
              <col style={{ width: '3%'   }} />{/* Month */}
              <col style={{ width: '2.5%' }} />{/* Day */}
              <col style={{ width: '9.5%' }} />{/* Christian Name */}
              <col style={{ width: '7.5%' }} />{/* Surname */}
              <col style={{ width: '8%'   }} />{/* Age & DOB */}
              <col style={{ width: '6%'   }} />{/* Condition */}
              <col style={{ width: '8%'   }} />{/* Profession */}
              <col                           />{/* Residence — takes remaining */}
              <col style={{ width: '9%'   }} />{/* Father */}
              <col style={{ width: '7%'   }} />{/* Banns */}
            </colgroup>
            <thead>
              <tr>
                <th rowSpan={2} style={TH}>NO</th>
                <th colSpan={3} style={TH}>When Married</th>
                <th colSpan={2} style={TH}>Name of Parties</th>
                <th rowSpan={2} style={TH}>Date of Birth &amp; Age</th>
                <th rowSpan={2} style={TH}>Condition</th>
                <th rowSpan={2} style={TH}>Rank or Profession</th>
                <th rowSpan={2} style={TH}>Residence at the time of Marriage</th>
                <th rowSpan={2} style={TH}>Father's name and Surname</th>
                <th rowSpan={2} style={TH}>Banns or Licensee</th>
              </tr>
              <tr>
                <th style={{ ...TH, ...VT }}>Year</th>
                <th style={{ ...TH, ...VT }}>Month</th>
                <th style={{ ...TH, ...VT }}>Day</th>
                <th style={TH}>Christian Name</th>
                <th style={TH}>Surname</th>
              </tr>
            </thead>
            <tbody>
              {/* Groom row */}
              <tr>
                <td rowSpan={2} style={{ ...TD, ...VT, textAlign: 'center', fontSize: 10, fontWeight: 700 }}>
                  {slNo}
                </td>
                <td rowSpan={2} style={{ ...TD, ...VT }}>{form.year}</td>
                <td rowSpan={2} style={{ ...TD, ...VT }}>{monthAbbr}</td>
                <td rowSpan={2} style={{ ...TD, ...VT }}>{form.day}</td>
                <td style={{ ...TD, minHeight: 80, fontWeight: 700 }}>{form.nameGroom?.toUpperCase()}</td>
                <td style={{ ...TD, fontWeight: 700 }}>{form.surnameGroom?.toUpperCase()}</td>
                <td style={TD}>
                  {form.dobGroom && <div>{form.dobGroom}</div>}
                  {form.ageGroom && <div style={{ fontWeight: 700 }}>{form.ageGroom} YEARS</div>}
                </td>
                <td style={TD}>{form.conditionGroom?.toUpperCase()}</td>
                <td style={{ ...TD, fontWeight: 700 }}>{form.professionGroom?.toUpperCase()}</td>
                <td style={TD}>{form.addressGroom?.toUpperCase()}</td>
                <td style={{ ...TD, fontWeight: 700 }}>{form.fatherNameGroom?.toUpperCase()}</td>
                <td rowSpan={2} style={{ ...TD, textAlign: 'center', verticalAlign: 'middle', fontWeight: 700, wordBreak: 'break-word', overflowWrap: 'break-word' }}>
                  {form.bann?.toUpperCase()}
                </td>
              </tr>
              {/* Bride row */}
              <tr>
                <td style={{ ...TD, minHeight: 80, fontWeight: 700 }}>
                  {form.nameBride?.toUpperCase()}
                </td>
                <td style={{ ...TD, fontWeight: 700 }}>{form.surnameBride?.toUpperCase()}</td>
                <td style={TD}>
                  {form.dobBride && <div>{form.dobBride}</div>}
                  {form.ageBride && <div style={{ fontWeight: 700 }}>{form.ageBride} YEARS</div>}
                </td>
                <td style={TD}>{form.conditionBride?.toUpperCase()}</td>
                <td style={{ ...TD, fontWeight: 700 }}>{form.professionBride?.toUpperCase()}</td>
                <td style={TD}>{form.addressBride?.toUpperCase()}</td>
                <td style={{ ...TD, fontWeight: 700 }}>{form.fatherNameBride?.toUpperCase()}</td>
              </tr>
            </tbody>
          </table>

          {/* Bottom section */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginTop: 32, flex: 1 }}>

            {/* Left: Place + Witnesses */}
            <div>
              <div style={{ fontWeight: 700, fontSize: 10, marginBottom: 4 }}>
                MARRIED IN THE PLACE OF :
              </div>
              <div style={{ fontSize: 9, marginBottom: 2 }}>(Name of the Church / Place / District)</div>
              <div style={{ fontSize: 10, fontWeight: 700, marginBottom: 16 }}>
                {form.placeOfMarriage?.toUpperCase()}
              </div>

              <div style={{ fontWeight: 700, fontSize: 10, marginBottom: 10 }}>
                MARRIAGE IN THE PRESENCE OF US :
              </div>
              {/* Witness 1 */}
              {form.w1NameGroom && (
                <div style={{ marginBottom: 8 }}>
                  <div style={{ fontSize: 9 }}>NAME : <strong>{form.w1NameGroom.toUpperCase()}</strong></div>
                  {form.w1AddrGroom && (
                    <div style={{ fontSize: 9 }}>ADDRESS : {form.w1AddrGroom.toUpperCase()}</div>
                  )}
                </div>
              )}
              {/* Witness 2 */}
              {form.w2NameGroom && (
                <div>
                  <div style={{ fontSize: 9 }}>NAME : <strong>{form.w2NameGroom.toUpperCase()}</strong></div>
                  {form.w2AddrGroom && (
                    <div style={{ fontSize: 9 }}>ADDRESS : {form.w2AddrGroom.toUpperCase()}</div>
                  )}
                </div>
              )}
            </div>

            {/* Right: Solemnization boxes */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* Box 1: Parties */}
              <div style={{ border: '1px solid #333', padding: '18px 18px' }}>
                <div style={{ fontWeight: 700, fontSize: 9, marginBottom: 10 }}>
                  THIS MARRIAGE WAS SOLEMNIZED BETWEEN US
                </div>
                <div style={{ fontSize: 9, marginBottom: 6 }}>
                  FULL NAME : <strong>{groomFull}</strong>
                </div>
                <div style={{ fontSize: 9 }}>
                  FULL NAME : <strong>{brideFull}</strong>
                </div>
              </div>

              {/* Box 2: Authority */}
              <div style={{ border: '1px solid #333', padding: '18px 18px' }}>
                <div style={{ fontWeight: 700, fontSize: 9, marginBottom: 10 }}>
                  THIS MARRIAGE WAS SOLEMNIZED / AUTHORITY BY
                </div>
                <div style={{ fontSize: 9, marginBottom: 10 }}>SIGNATURE :</div>
                <div style={{ fontSize: 9, marginBottom: 6 }}>
                  FULLNAME : <strong>{form.solemnizedBy?.toUpperCase() || ''}</strong>
                </div>
                <div style={{ fontSize: 9, marginBottom: 6 }}>DATE : {marriageDate}</div>
                <div style={{ fontSize: 9, marginTop: 10 }}>OFFICE SEAL</div>
              </div>
            </div>

          </div>

</div>{/* end schedule-iv-content */}
        </div>{/* end border frame */}
      </div>
    </div>
  )
}

/* ─── Shared primitives ──────────────────────────────────────────── */
const iS = {
  height: 34, padding: '0 10px',
  border: '1px solid #e2e8f0', borderRadius: 6,
  fontSize: 13, background: '#fff', outline: 'none',
  boxSizing: 'border-box', color: '#1e293b',
  fontFamily: 'var(--font-ui, inherit)',
}

const lbl = (color = '#64748b') => ({
  fontSize: 10, fontWeight: 700, color,
  letterSpacing: '0.06em', textTransform: 'uppercase',
  marginBottom: 4, display: 'block',
})

const uploadBtnStyle = (uploaded, baseColor = '#64748b') => ({
  display: 'flex', alignItems: 'center', gap: 4,
  padding: '4px 10px', borderRadius: 5,
  border: uploaded ? '1px solid #86efac' : `1px solid ${baseColor}33`,
  background: uploaded ? '#f0fdf4' : '#f8fafc',
  color: uploaded ? '#16a34a' : baseColor,
  cursor: 'pointer', fontSize: 11, fontWeight: 600,
  transition: 'all 0.15s',
})

function F({ label, color = '#64748b', children }) {
  return (
    <div>
      <label style={lbl(color)}>{label}</label>
      {children}
    </div>
  )
}

function Card({ children, style }) {
  return (
    <div style={{
      background: '#fff', border: '1px solid #e2e8f0',
      borderRadius: 12, padding: '16px 20px', ...style,
    }}>
      {children}
    </div>
  )
}

function SecHead({ label, color, small }) {
  return (
    <div style={{
      fontSize: small ? 11 : 13, fontWeight: 800, color,
      letterSpacing: '0.08em', textTransform: 'uppercase',
      paddingBottom: 10, marginBottom: 12,
      borderBottom: `2px solid ${color}28`,
    }}>
      {label}
    </div>
  )
}

function VDivider() {
  return <div style={{ width: 1, background: '#f1f5f9', flexShrink: 0, alignSelf: 'stretch', margin: '0 2px' }} />
}

function PathHint({ children }) {
  return (
    <div style={{
      fontSize: 9, color: '#94a3b8', textAlign: 'center',
      background: '#f8fafc', borderRadius: 3, padding: '2px 6px',
      border: '1px solid #f1f5f9', fontFamily: 'monospace',
      wordBreak: 'break-all', lineHeight: 1.4,
    }}>
      {children}
    </div>
  )
}

function ActionBtn({ icon: Icon, label, onClick, color = '#475569', disabled }) {
  const [hov, setHov] = useState(false)
  return (
    <button onClick={onClick} disabled={disabled}
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '7px 16px', borderRadius: 7,
        border: 'none',
        background: disabled ? '#94a3b8' : color,
        color: '#fff',
        fontSize: 13, fontWeight: 600,
        cursor: disabled ? 'not-allowed' : 'pointer',
        transition: 'all 0.15s',
        filter: !disabled && hov ? 'brightness(0.85)' : 'brightness(1)',
        boxShadow: !disabled && hov
          ? '0 4px 10px rgba(0,0,0,0.22)'
          : '0 2px 4px rgba(0,0,0,0.15)',
        opacity: disabled ? 0.65 : 1,
      }}>
      <Icon size={14} style={label === 'Saving…' ? { animation: 'spin 1s linear infinite' } : {}} />
      {label}
    </button>
  )
}

function ReportBtn({ label, onClick, color = '#1e40af' }) {
  const [hov, setHov] = useState(false)
  return (
    <button onClick={onClick}
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '7px 16px', borderRadius: 7,
        border: 'none',
        background: color,
        color: '#fff', fontSize: 12, fontWeight: 600,
        cursor: 'pointer', transition: 'all 0.15s',
        filter: hov ? 'brightness(0.85)' : 'brightness(1)',
        boxShadow: hov ? '0 4px 10px rgba(0,0,0,0.22)' : '0 2px 4px rgba(0,0,0,0.15)',
      }}>
      <FileText size={13} /> {label}
    </button>
  )
}
