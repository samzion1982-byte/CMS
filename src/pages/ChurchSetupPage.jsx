import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase, LICENSE_CSV, VENDOR } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { useToast } from '../lib/toast'
import { Save, Upload, CheckCircle, XCircle, Loader2, ShieldCheck, Trash2,
         Plus, Pencil, ChevronUp, ChevronDown, X, Check, AlertTriangle } from 'lucide-react'
import { getZones, addZone, updateZone, deleteZone } from '../lib/zones'
import { getCategories, updateCategory, toggleCategory } from '../lib/paymentCategories'

const DENOMS = ['CSI','CNI','Catholic','Pentecostal','Methodist','Baptist','Anglican','Others']

export default function ChurchSetupPage() {
  const { profile } = useAuth()
  const toast = useToast()
  const logoRef = useRef(null)
  const dioceseLogoRef = useRef(null)

  const [church, setChurch] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [flushing,          setFlushing]          = useState(false)
  const [showFlushConfirm,  setShowFlushConfirm]  = useState(false)
  const [flushPassword,     setFlushPassword]     = useState('')
  const [flushPwErr,        setFlushPwErr]        = useState(false)
  const flushPwRef = useRef(null)
  const [logoFile, setLogoFile] = useState(null)
  const [logoPreview, setLogoPreview] = useState(null)
  const [dioceseLogoFile, setDioceseLogoFile] = useState(null)
  const [dioceseLogoPreview, setDioceseLogoPreview] = useState(null)

  // License verification
  const [authCode, setAuthCode] = useState('')
  const [verifying, setVerifying] = useState(false)
  const [licenseStatus, setLicenseStatus] = useState(null) // null | 'valid' | 'inactive' | 'expired' | 'invalid'
  const [licenseInfo, setLicenseInfo] = useState(null)

  const [form, setForm] = useState({
    church_name: '', church_code: '', diocese: '', denomination: 'CSI',
    address: '', city: '', state: 'Tamil Nadu', pincode: '',
    whatsapp_number: '', whatsapp_url: '', instance_id: '', access_token: '',
    whatsapp_api_type: 'soft7', official_phone_number_id: '', official_bearer_token: '',
    presbyter_name: '', presbyter_whatsapp: '',
    secretary_name: '', secretary_whatsapp: '',
    treasurer_name: '', treasurer_whatsapp: '',
    admin1_name:    '', admin1_whatsapp: '',
    auth_code: '',
    receipt_date_mode: 'today',
    whatsapp_receipt_mode: 'instant',
  })

  useEffect(() => { loadChurch() }, [])

  async function loadChurch() {
    setLoading(true)
    const { data } = await supabase.from('churches').select('*').limit(1).single()
    if (data) {
      setChurch(data)
      setForm({
        church_name:    data.church_name    || '',
        church_code:    data.church_code    || '',
        diocese:        data.diocese        || '',
        denomination:   data.denomination   || 'CSI',
        address:        data.address        || '',
        city:           data.city           || '',
        state:          data.state          || 'Tamil Nadu',
        pincode:        data.pincode        || '',
        whatsapp_number:    data.whatsapp_number    || '',
        whatsapp_url:       data.whatsapp_url       || '',
        instance_id:        data.instance_id        || '',
        access_token:       data.access_token       || '',
        whatsapp_api_type:         data.whatsapp_api_type         || 'soft7',
        official_phone_number_id:  data.official_phone_number_id  || '',
        official_bearer_token:     data.official_bearer_token     || '',
        presbyter_name:     data.presbyter_name     || '',
        presbyter_whatsapp: data.presbyter_whatsapp || '',
        secretary_name:     data.secretary_name     || '',
        secretary_whatsapp: data.secretary_whatsapp || '',
        treasurer_name:     data.treasurer_name     || '',
        treasurer_whatsapp: data.treasurer_whatsapp || '',
        admin1_name:        data.admin1_name        || '',
        admin1_whatsapp:    data.admin1_whatsapp    || '',
        auth_code:          data.auth_code          || '',
        receipt_date_mode:     data.receipt_date_mode     || 'today',
        whatsapp_receipt_mode: data.whatsapp_receipt_mode || 'instant',
      })
      setAuthCode(data.auth_code || '')
      if (data.logo_url) setLogoPreview(data.logo_url)
      if (data.diocese_logo_url) setDioceseLogoPreview(data.diocese_logo_url)
      if (data.auth_code) setLicenseStatus('valid')
    }
    setLoading(false)
  }

  const s = (k, v) => setForm(f => ({ ...f, [k]: v }))

  function onLogo(e) {
    const f = e.target.files?.[0]; if (!f) return
    setLogoFile(f); setLogoPreview(URL.createObjectURL(f))
  }

  function onDioceseLogo(e) {
    const f = e.target.files?.[0]; if (!f) return
    setDioceseLogoFile(f); setDioceseLogoPreview(URL.createObjectURL(f))
  }

  async function verifyLicense() {
    const code = authCode.trim().toUpperCase()
    if (!code) return
    setVerifying(true); setLicenseStatus(null); setLicenseInfo(null)
    try {
      const resp = await fetch(LICENSE_CSV)
      const text = await resp.text()
      const rows = text.trim().split('\n').slice(1) // skip header
      let found = null
      for (const row of rows) {
        const cols = row.split(',').map(c => c.trim().replace(/^"|"$/g,''))
        const [rowCode, churchCode, churchName, validUpto, status] = cols
        if (rowCode.toUpperCase() === code) {
          found = { code:rowCode, churchCode, churchName, validUpto, status }
          break
        }
      }
      if (!found) {
        setLicenseStatus('invalid'); setVerifying(false); return
      }
      // Parse validity date (dd-mm-yyyy or similar)
      const parts = found.validUpto.split(/[-\/]/)
      let expiry = null
      if (parts.length === 3) {
        // Try dd-mm-yyyy
        const d = new Date(parseInt(parts[2]), parseInt(parts[1])-1, parseInt(parts[0]))
        if (!isNaN(d.getTime())) expiry = d
      }
      const isDemo = code === '0000-DEMOACCOUNT'
      const inactive = found.status && found.status.toLowerCase().includes('inactive')
      const isExpired = !inactive && expiry && !isDemo && expiry < new Date()
      if (inactive) { setLicenseStatus('inactive'); setLicenseInfo(found) }
      else if (isExpired) { setLicenseStatus('expired'); setLicenseInfo(found) }
      else { setLicenseStatus('valid'); setLicenseInfo(found); setForm(f => ({...f, auth_code: code})) }
    } catch(e) {
      console.error(e); setLicenseStatus('invalid')
    }
    setVerifying(false)
  }

  async function save() {
    if (!form.church_name) { toast('Church name is required.', 'error'); return }
    if (!form.auth_code && licenseStatus !== 'valid') { toast('Please verify the AUTH CODE first.', 'error'); return }
    setSaving(true)
    let logo_url = church?.logo_url || null
    let diocese_logo_url = church?.diocese_logo_url || null
    if (logoFile) {
      const ext = logoFile.name.split('.').pop()
      const path = 'church-logo.' + ext.toLowerCase()
      const { error: ue } = await supabase.storage.from('church-logos').upload(path, logoFile, { upsert:true })
      if (ue) {
        console.error('Church logo upload failed:', ue)
        setSaving(false)
        toast('Church logo upload failed: ' + ue.message, 'error')
        return
      }
      const { data:pd } = supabase.storage.from('church-logos').getPublicUrl(path)
      logo_url = pd?.publicUrl || null
    }
    if (dioceseLogoFile) {
      const ext = dioceseLogoFile.name.split('.').pop()
      const path = 'diocese-logo.' + ext.toLowerCase()
      const { error: ude } = await supabase.storage.from('church-logos').upload(path, dioceseLogoFile, { upsert:true })
      if (ude) {
        console.error('Diocese logo upload failed:', ude)
        setSaving(false)
        toast('Diocese logo upload failed: ' + ude.message, 'error')
        return
      }
      const { data:pd } = supabase.storage.from('church-logos').getPublicUrl(path)
      diocese_logo_url = pd?.publicUrl || null
    }
    const payload = { ...form, logo_url, diocese_logo_url, updated_at: new Date().toISOString() }
    let err
    if (church) {
      const r = await supabase.from('churches').update(payload).eq('id', church.id)
      err = r.error
    } else {
      const r = await supabase.from('churches').insert(payload)
      err = r.error
    }
    setSaving(false)
    if (err) { toast('Save failed: ' + err.message, 'error'); return }
    toast('Church details saved.', 'success')
    loadChurch()
  }

  function flush() {
    if (!church) { toast('No church record to flush.', 'error'); return }
    setFlushPassword('')
    setFlushPwErr(false)
    setShowFlushConfirm(true)
    setTimeout(() => flushPwRef.current?.focus(), 80)
  }

  async function doFlush() {
    if (!flushPassword || flushing) return
    setFlushPwErr(false)
    setFlushing(true)
    try {
      const { error: authErr } = await supabase.auth.signInWithPassword({ email: profile.email, password: flushPassword })
      if (authErr) { setFlushPwErr(true); setFlushing(false); setTimeout(() => flushPwRef.current?.focus(), 30); return }

      // Remove logos from storage
      const logoFiles = ['church-logo.png','church-logo.jpg','church-logo.jpeg',
                         'diocese-logo.png','diocese-logo.jpg','diocese-logo.jpeg']
      await supabase.storage.from('church-logos').remove(logoFiles)

      // Reset all text fields in the DB row
      const blank = {
        church_name:'', church_code:'', diocese:'', denomination:'CSI',
        address:'', city:'', state:'', pincode:'',
        whatsapp_number:'', whatsapp_url:'', instance_id:'', access_token:'',
        whatsapp_api_type:'soft7', official_phone_number_id:'', official_bearer_token:'',
        presbyter_name:'', presbyter_whatsapp:'',
        secretary_name:'', secretary_whatsapp:'',
        treasurer_name:'', treasurer_whatsapp:'',
        admin1_name:'',    admin1_whatsapp:'',
        auth_code:'', logo_url: null, diocese_logo_url: null,
        receipt_date_mode:'today', whatsapp_receipt_mode:'instant',
        updated_at: new Date().toISOString()
      }
      const { error } = await supabase.from('churches').update(blank).eq('id', church.id)
      if (error) throw error

      // Clear all church zones
      await supabase.from('church_zones').delete().gte('sort_order', 0)

      // Reset local state
      setLogoFile(null); setLogoPreview(null)
      setDioceseLogoFile(null); setDioceseLogoPreview(null)
      setAuthCode(''); setLicenseStatus(null); setLicenseInfo(null)
      setShowFlushConfirm(false)
      toast('Church details flushed successfully.', 'success')
      loadChurch()
    } catch (err) {
      toast('Flush failed: ' + err.message, 'error')
    } finally {
      setFlushing(false)
    }
  }

  const isSuperAdmin = profile?.role === 'super_admin'
  const isAdmin1     = profile?.role === 'admin1'

  if (!isSuperAdmin && !isAdmin1) {
    return <div className="flex items-center justify-center h-64 text-slate-400 text-sm">Access denied. Super Admin or Admin1 only.</div>
  }
  if (loading) {
    return <div className="flex items-center justify-center h-64"><Loader2 size={24} className="animate-spin text-blue-500"/></div>
  }

  const LicenseBadge = () => {
    if (!licenseStatus) return null
    if (licenseStatus === 'valid') return (
      <div className="flex items-center gap-2 px-3 py-2 bg-green-50 border border-green-200 rounded-lg text-sm">
        <CheckCircle size={15} className="text-green-600 flex-shrink-0"/>
        <span className="text-green-700 font-medium">
          License Active — valid until {licenseInfo?.validUpto}
        </span>
      </div>
    )
    if (licenseStatus === 'inactive') return (
      <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-sm">
        <XCircle size={15} className="text-amber-600 flex-shrink-0"/>
        <span className="text-amber-700 font-medium">
          This license is currently Inactive. Contact {VENDOR.name} — {VENDOR.phone} to activate.
        </span>
      </div>
    )
    if (licenseStatus === 'expired') return (
      <div className="flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm">
        <XCircle size={15} className="text-red-600 flex-shrink-0"/>
        <span className="text-red-700 font-medium">
          License expired on {licenseInfo?.validUpto}. Contact {VENDOR.name} — {VENDOR.phone}.
        </span>
      </div>
    )
    return (
      <div className="flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm">
        <XCircle size={15} className="text-red-600 flex-shrink-0"/>
        <span className="text-red-700 font-medium">Invalid AUTH CODE. Contact {VENDOR.name} — {VENDOR.phone}</span>
      </div>
    )
  }

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900 tracking-tight">Church setup</h1>
          <p className="text-xs text-slate-400 mt-0.5">
            {isSuperAdmin ? 'Configure church details, logo, zones and license' : 'Manage zonal areas'}
          </p>
        </div>
        {isSuperAdmin && (
          <div className="flex gap-2">
            <button onClick={flush} disabled={flushing || saving || !church} className="btn btn-secondary"
              style={{borderColor:'#fca5a5',color:'#dc2626',background:'#fff5f5'}}>
              {flushing ? <><Loader2 size={14} className="animate-spin"/>Flushing...</> : <><Trash2 size={14}/>Flush</>}
            </button>
            <button onClick={save} disabled={saving || flushing} className="btn btn-primary" style={{background:'#14532d',borderColor:'#14532d'}}>
              {saving ? <><Loader2 size={14} className="animate-spin"/>Saving...</> : <><Save size={14}/>Save changes</>}
            </button>
          </div>
        )}
      </div>

      {/* Two-column layout for super_admin; single for admin1 */}
      {isSuperAdmin ? (
        <div style={{display:'flex', gap:24, alignItems:'flex-start'}}>

          {/* ── LEFT: main church cards ── */}
          <div style={{flex:1, minWidth:0, display:'flex', flexDirection:'column', gap:24}}>
          {/* IDENTITY */}
        <div className="card p-6">
          <p className="form-section form-section-blue">Church identity</p>
          <div className="flex gap-6">
            <div className="flex-1 space-y-4">
              <div className="field-group">
                <label className="field-label">Church name *</label>
                <input className="field-input" value={form.church_name} onChange={e=>s('church_name',e.target.value)} placeholder="e.g. CSITA St. Paul's Pastorate"/>
              </div>
              <div className="field-group">
                <label className="field-label">Church code</label>
                <input className="field-input" value={form.church_code} onChange={e=>s('church_code',e.target.value)} placeholder="e.g. TN-TRY-0001" style={{fontFamily:'monospace',letterSpacing:'0.05em'}}/>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="field-group">
                  <label className="field-label">Diocese</label>
                  <input className="field-input" value={form.diocese} onChange={e=>s('diocese',e.target.value)} placeholder="e.g. CSI Tirunelveli Diocese"/>
                </div>
                <div className="field-group">
                  <label className="field-label">Denomination</label>
                  <select className="field-input" value={form.denomination} onChange={e=>s('denomination',e.target.value)}
                    style={{appearance:'none',backgroundImage:"url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%2394a3b8' d='M6 8L1 3h10z'/%3E%3C/svg%3E\")",backgroundRepeat:'no-repeat',backgroundPosition:'right 10px center',paddingRight:28}}>
                    {DENOMS.map(d=><option key={d}>{d}</option>)}
                  </select>
                </div>
              </div>
            </div>

            <div className="flex flex-col items-center gap-3 flex-shrink-0">
              <div onClick={()=>logoRef.current?.click()}
                className="w-24 h-24 rounded-xl border-2 border-dashed border-slate-200 overflow-hidden cursor-pointer hover:border-blue-400 transition-colors flex items-center justify-center bg-slate-50">
                {logoPreview
                  ? <img src={logoPreview} className="w-full h-full object-contain p-2" alt="Logo"/>
                  : <div className="text-center p-2">
                      <div className="w-8 h-8 mx-auto mb-1 opacity-20">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                      </div>
                      <p className="text-[10px] text-slate-400">Logo</p>
                    </div>
                }
              </div>
              <input ref={logoRef} type="file" accept="image/*" className="hidden" onChange={onLogo}/>
              <button className="btn btn-ghost btn-sm" onClick={()=>logoRef.current?.click()}>
                <Upload size={11}/>Upload
              </button>
            </div>
            <div className="flex flex-col items-center gap-2 flex-shrink-0">
              <div onClick={()=>dioceseLogoRef.current?.click()}
                className="w-24 h-24 rounded-xl border-2 border-dashed border-slate-200 overflow-hidden cursor-pointer hover:border-blue-400 transition-colors flex items-center justify-center bg-slate-50">
                {dioceseLogoPreview
                  ? <img src={dioceseLogoPreview} className="w-full h-full object-contain p-2" alt="Diocese Logo"/>
                  : <div className="text-center p-2">
                      <div className="w-8 h-8 mx-auto mb-1 opacity-20">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                      </div>
                      <p className="text-[10px] text-slate-400">Diocese Logo</p>
                    </div>
                }
              </div>
              <input ref={dioceseLogoRef} type="file" accept="image/*" className="hidden" onChange={onDioceseLogo}/>
              <button className="btn btn-ghost btn-sm" onClick={()=>dioceseLogoRef.current?.click()}>
                <Upload size={11}/>Upload
              </button>
            </div>
          </div>
        </div>

        {/* ADDRESS */}
        <div className="card p-6">
          <p className="form-section form-section-blue">Location</p>
          <div className="space-y-3">
            <div className="field-group">
              <label className="field-label">Street address</label>
              <input className="field-input" value={form.address} onChange={e=>s('address',e.target.value)} placeholder="Street address"/>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="field-group">
                <label className="field-label">City</label>
                <input className="field-input" value={form.city} onChange={e=>s('city',e.target.value)} placeholder="Trichy"/>
              </div>
              <div className="field-group">
                <label className="field-label">State</label>
                <input className="field-input" value={form.state} onChange={e=>s('state',e.target.value)} placeholder="Tamil Nadu"/>
              </div>
              <div className="field-group">
                <label className="field-label">Pincode</label>
                <input className="field-input" value={form.pincode} onChange={e=>s('pincode',e.target.value)} placeholder="620003" maxLength={6}/>
              </div>
            </div>
          </div>
        </div>


        {/* WHATSAPP */}
        <div className="card p-6">
          <p className="form-section form-section-blue" style={{color:'#15803d',borderColor:'#bbf7d0'}}>WhatsApp</p>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="field-group">
                <label className="field-label">Church WhatsApp Number</label>
                <input className="field-input" value={form.whatsapp_number} onChange={e=>s('whatsapp_number',e.target.value)} placeholder="+91XXXXXXXXXX"/>
              </div>
              <div className="field-group">
                <label className="field-label">WhatsApp URL</label>
                <input className="field-input" value={form.whatsapp_url} onChange={e=>s('whatsapp_url',e.target.value)} placeholder="https://chat.whatsapp.com/..."/>
              </div>
            </div>
            <div className="field-group">
              <label className="field-label">API Type</label>
              <select className="field-input" value={form.whatsapp_api_type} onChange={e=>s('whatsapp_api_type',e.target.value)}
                style={{appearance:'none',backgroundImage:"url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%2394a3b8' d='M6 8L1 3h10z'/%3E%3C/svg%3E\")",backgroundRepeat:'no-repeat',backgroundPosition:'right 10px center',paddingRight:28}}>
                <option value="soft7">Soft7 (Unofficial)</option>
                <option value="official">Official (Meta WABA)</option>
              </select>
            </div>
            {form.whatsapp_api_type === 'soft7' && (
              <div className="grid grid-cols-2 gap-3">
                <div className="field-group">
                  <label className="field-label">Instance ID</label>
                  <input className="field-input" value={form.instance_id} onChange={e=>s('instance_id',e.target.value)} placeholder="Instance ID"/>
                </div>
                <div className="field-group">
                  <label className="field-label">Access Token</label>
                  <input className="field-input" value={form.access_token} onChange={e=>s('access_token',e.target.value)} placeholder="Access Token"/>
                </div>
              </div>
            )}
            {form.whatsapp_api_type === 'official' && (
              <div className="grid grid-cols-2 gap-3">
                <div className="field-group">
                  <label className="field-label">Phone Number ID</label>
                  <input className="field-input" value={form.official_phone_number_id} onChange={e=>s('official_phone_number_id',e.target.value)} placeholder="Meta phone number ID"/>
                </div>
                <div className="field-group">
                  <label className="field-label">Bearer Token</label>
                  <input className="field-input" value={form.official_bearer_token} onChange={e=>s('official_bearer_token',e.target.value)} placeholder="Meta bearer token"/>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* OFFICE BEARERS */}
        <div className="card p-6">
          <p className="form-section form-section-blue" style={{color:'var(--accent)',borderColor:'var(--accent-ring)'}}>Key Office Bearers</p>
          <div className="space-y-4">
            {[
              { role: 'Presbyter / Pastor', nameKey: 'presbyter_name', waKey: 'presbyter_whatsapp' },
              { role: 'Secretary',           nameKey: 'secretary_name', waKey: 'secretary_whatsapp' },
              { role: 'Treasurer',           nameKey: 'treasurer_name', waKey: 'treasurer_whatsapp' },
              { role: 'Admin 1',             nameKey: 'admin1_name',    waKey: 'admin1_whatsapp'    },
            ].map(({ role, nameKey, waKey }) => (
              <div key={nameKey}>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">{role}</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="field-group">
                    <label className="field-label">Name</label>
                    <input className="field-input" value={form[nameKey]} onChange={e=>s(nameKey,e.target.value)} placeholder={`${role} name`}/>
                  </div>
                  <div className="field-group">
                    <label className="field-label">WhatsApp Number</label>
                    <input className="field-input" value={form[waKey]} onChange={e=>s(waKey,e.target.value)} placeholder="+91XXXXXXXXXX"/>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

            {/* PAYMENTS */}
            <div className="card p-6">
              <p className="form-section form-section-blue" style={{color:'#7c3aed',borderColor:'#ddd6fe'}}>Payments</p>
              <div className="space-y-5">

                {/* Receipt date mode */}
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Receipt date</p>
                  <div style={{display:'flex',gap:8}}>
                    {[['today',"Today's date"],['fixed','Last saved date']].map(([val,label])=>(
                      <button key={val} onClick={()=>s('receipt_date_mode',val)}
                        style={{flex:1,padding:'8px 0',borderRadius:8,border:'1.5px solid',fontSize:12,fontWeight:600,cursor:'pointer',transition:'all .15s',
                          borderColor: form.receipt_date_mode===val ? '#7c3aed' : '#e2e8f0',
                          background:  form.receipt_date_mode===val ? '#f5f3ff' : '#f8fafc',
                          color:       form.receipt_date_mode===val ? '#7c3aed' : '#64748b',
                        }}>
                        {label}
                      </button>
                    ))}
                  </div>
                  <p className="text-xs text-slate-400 mt-2">
                    {form.receipt_date_mode === 'fixed'
                      ? 'New receipts pre-fill with the last saved receipt\'s date. The field flashes yellow until you change it.'
                      : "New receipts always start with today's date."}</p>
                </div>

                {/* WhatsApp receipt mode */}
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">WhatsApp receipt</p>
                  <div style={{display:'flex',gap:8}}>
                    {[['instant','Instant on save'],['batch','Batch send later']].map(([val,label])=>(
                      <button key={val} onClick={()=>s('whatsapp_receipt_mode',val)}
                        style={{flex:1,padding:'8px 0',borderRadius:8,border:'1.5px solid',fontSize:12,fontWeight:600,cursor:'pointer',transition:'all .15s',
                          borderColor: form.whatsapp_receipt_mode===val ? '#15803d' : '#e2e8f0',
                          background:  form.whatsapp_receipt_mode===val ? '#f0fdf4' : '#f8fafc',
                          color:       form.whatsapp_receipt_mode===val ? '#15803d' : '#64748b',
                        }}>
                        {label}
                      </button>
                    ))}
                  </div>
                  <p className="text-xs text-slate-400 mt-2">
                    {form.whatsapp_receipt_mode === 'instant'
                      ? 'WhatsApp receipt is sent immediately when a payment is confirmed.'
                      : 'Receipts are queued — send them in bulk from the Receipts page.'}
                  </p>
                </div>

              </div>
            </div>

            {/* ZONAL AREAS */}
            <ZonesPanel profile={profile} toast={toast} />

            {/* PAYMENT CATEGORIES */}
            <PaymentCategoriesPanel profile={profile} toast={toast} />

          </div>{/* end left column */}

          {/* ── RIGHT: license (sticky) ── */}
          <div style={{width:280, flexShrink:0, position:'sticky', top:16, display:'flex', flexDirection:'column', gap:16}}>
            <div className="card p-5">
              <p className="form-section" style={{color:'#d97706',borderColor:'#fde68a'}}>License validation</p>
              <p className="text-xs text-slate-400 mb-3">Enter the AUTH CODE provided by {VENDOR.name}.</p>
              <div className="flex gap-2 mb-3">
                <input className="field-input flex-1" value={authCode} onChange={e=>setAuthCode(e.target.value.toUpperCase())}
                  placeholder="e.g. 0001-XXXXXXXX" style={{fontFamily:'monospace',letterSpacing:'0.05em',fontSize:12}}
                  onKeyDown={e=>e.key==='Enter'&&verifyLicense()}/>
                <button onClick={verifyLicense} disabled={verifying||!authCode.trim()} className="btn btn-secondary btn-sm" style={{flexShrink:0}}>
                  {verifying ? <Loader2 size={13} className="animate-spin"/> : <ShieldCheck size={13}/>}
                </button>
              </div>
              <LicenseBadge/>
              {licenseStatus !== 'valid' && (
                <p className="text-xs text-slate-400 mt-3">Need a license?<br/><strong className="text-slate-600">{VENDOR.name}</strong> — {VENDOR.phone}</p>
              )}
            </div>
          </div>

        </div>
      ) : (
        /* admin1: zones + categories */
        <div style={{maxWidth:560, display:'flex', flexDirection:'column', gap:16}}>
          <ZonesPanel profile={profile} toast={toast} />
          <PaymentCategoriesPanel profile={profile} toast={toast} />
        </div>
      )}

      {/* ── Flush password confirmation modal ── */}
      {showFlushConfirm && (
        <div
          onClick={e => { if (e.target === e.currentTarget && !flushing) setShowFlushConfirm(false) }}
          style={{ position:'fixed', inset:0, background:'rgba(15,23,42,0.65)', backdropFilter:'blur(3px)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:9999, padding:16 }}>
          <div style={{ background:'var(--card-bg)', borderRadius:14, width:'100%', maxWidth:400, boxShadow:'0 24px 64px rgba(0,0,0,0.45)', overflow:'hidden' }}>
            {/* header */}
            <div style={{ background:'#dc2626', padding:'13px 20px', display:'flex', alignItems:'center', justifyContent:'space-between', position:'relative', overflow:'hidden' }}>
              <div style={{ position:'absolute', inset:0, background:'linear-gradient(135deg,rgba(255,255,255,0.08) 0%,transparent 60%)', pointerEvents:'none' }}/>
              <div style={{ display:'flex', alignItems:'center', gap:10, position:'relative' }}>
                <div style={{ background:'rgba(255,255,255,0.2)', borderRadius:8, padding:6, display:'flex', alignItems:'center', justifyContent:'center' }}>
                  <AlertTriangle size={16} color="#fff"/>
                </div>
                <div>
                  <h3 style={{ margin:0, fontSize:14, fontWeight:700, color:'#fff', fontFamily:'var(--font-ui)' }}>Confirm Flush</h3>
                  <p style={{ margin:0, fontSize:11, color:'rgba(255,255,255,0.8)', fontFamily:'var(--font-ui)' }}>This action cannot be undone</p>
                </div>
              </div>
              {!flushing && (
                <button onClick={() => setShowFlushConfirm(false)} style={{ background:'rgba(255,255,255,0.2)', border:'none', borderRadius:6, padding:'4px 8px', cursor:'pointer', color:'#fff', lineHeight:1, fontSize:16, fontWeight:700 }}>×</button>
              )}
            </div>
            {/* body */}
            <div style={{ padding:'20px' }}>
              <p style={{ margin:'0 0 14px', fontSize:13, color:'var(--text-1)', lineHeight:1.55, fontFamily:'var(--font-ui)' }}>
                This will permanently delete all church data including logos, zones, payment categories, and the church record.
                Enter your password to confirm.
              </p>
              <input
                ref={flushPwRef}
                type="password"
                value={flushPassword}
                onChange={e => { setFlushPassword(e.target.value); setFlushPwErr(false) }}
                onKeyDown={e => e.key === 'Enter' && doFlush()}
                placeholder="Your account password"
                style={{
                  width:'100%', boxSizing:'border-box', padding:'9px 12px',
                  borderRadius:8, border:`1.5px solid ${flushPwErr ? '#dc2626' : 'var(--border)'}`,
                  background:'var(--input-bg)', color:'var(--text-1)', fontSize:13,
                  fontFamily:'var(--font-ui)', outline:'none', marginBottom: flushPwErr ? 6 : 16
                }}
              />
              {flushPwErr && (
                <p style={{ margin:'0 0 12px', fontSize:12, color:'#dc2626', fontFamily:'var(--font-ui)' }}>Incorrect password. Please try again.</p>
              )}
              <div style={{ display:'flex', gap:10, justifyContent:'flex-end' }}>
                <button
                  onClick={() => setShowFlushConfirm(false)}
                  disabled={flushing}
                  className="btn btn-secondary btn-sm"
                  style={{ fontFamily:'var(--font-ui)' }}>
                  Cancel
                </button>
                <button
                  onClick={doFlush}
                  disabled={flushing || !flushPassword}
                  style={{
                    display:'flex', alignItems:'center', gap:6,
                    padding:'7px 16px', borderRadius:8, border:'none', cursor: flushing || !flushPassword ? 'not-allowed' : 'pointer',
                    background: flushing || !flushPassword ? '#f87171' : '#dc2626',
                    color:'#fff', fontSize:13, fontWeight:600, fontFamily:'var(--font-ui)'
                  }}>
                  {flushing ? <Loader2 size={13} className="animate-spin"/> : <Trash2 size={13}/>}
                  {flushing ? 'Flushing…' : 'Flush All Data'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}

/* ════════════════════════════════════════════════════════════
   ZONES PANEL
   ════════════════════════════════════════════════════════════ */
function ZonesPanel({ profile, toast }) {
  const [zones,      setZones]      = useState([])
  const [loading,    setLoading]    = useState(true)
  const [newName,    setNewName]    = useState('')
  const [adding,     setAdding]     = useState(false)
  const [editId,     setEditId]     = useState(null)
  const [editName,   setEditName]   = useState('')
  const [savingId,   setSavingId]   = useState(null)
  const [deletingId, setDeletingId] = useState(null)
  const [expanded,   setExpanded]   = useState(false)
  const editRef = useRef(null)

  const load = useCallback(async () => {
    setLoading(true)
    try { setZones(await getZones()) } catch {}
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])
  useEffect(() => { if (editRef.current) editRef.current.focus() }, [editId])

  const add = async () => {
    const name = newName.trim()
    if (!name) return
    setAdding(true)
    try {
      const maxOrder = zones.length ? Math.max(...zones.map(z => z.sort_order)) : 0
      await addZone(name, maxOrder + 1, profile?.full_name || profile?.email)
      setNewName('')
      await load()
      toast(`Zone "${name}" added`, 'success')
    } catch (err) {
      toast(err.message.includes('unique') ? `"${name}" already exists` : err.message, 'error')
    }
    setAdding(false)
  }

  const startEdit = z => { setEditId(z.id); setEditName(z.zone_name) }

  const saveEdit = async (z) => {
    const name = editName.trim()
    if (!name || name === z.zone_name) { setEditId(null); return }
    setSavingId(z.id)
    try {
      await updateZone(z.id, name, z.sort_order)
      await load()
      toast('Zone updated', 'success')
    } catch (err) {
      toast(err.message.includes('unique') ? `"${name}" already exists` : err.message, 'error')
    }
    setSavingId(null)
    setEditId(null)
  }

  const remove = async (z) => {
    if (!window.confirm(`Remove zone "${z.zone_name}"? Members already assigned to it will keep their zone value.`)) return
    setDeletingId(z.id)
    try {
      await deleteZone(z.id)
      setZones(prev => prev.filter(x => x.id !== z.id))
      toast(`Zone "${z.zone_name}" removed`, 'success')
    } catch (err) { toast(err.message, 'error') }
    setDeletingId(null)
  }

  const move = async (idx, dir) => {
    const next = [...zones]
    const swapIdx = idx + dir
    if (swapIdx < 0 || swapIdx >= next.length) return
    // Swap sort_order values
    const aOrder = next[idx].sort_order
    const bOrder = next[swapIdx].sort_order
    const a = next[idx], b = next[swapIdx]
    next[idx]     = { ...a, sort_order: bOrder }
    next[swapIdx] = { ...b, sort_order: aOrder }
    setZones(next.sort((x, y) => x.sort_order - y.sort_order))
    // Persist both
    await Promise.all([
      updateZone(a.id, a.zone_name, bOrder),
      updateZone(b.id, b.zone_name, aOrder),
    ])
  }

  return (
    <div className="card p-6">
      {/* Header row — always visible */}
      <div className="flex items-center justify-between mb-0">
        <div className="flex items-center gap-2">
          <p className="form-section form-section-blue mb-0" style={{color:'#0369a1',borderColor:'#bae6fd',marginBottom:0}}>
            Zonal Areas
          </p>
          {!expanded && !loading && zones.length > 0 && (
            <span className="text-xs text-slate-400 font-normal">
              ({zones.length} {zones.length === 1 ? 'zone' : 'zones'}: {zones.map(z => z.zone_name).join(', ')})
            </span>
          )}
        </div>
        <button
          onClick={() => setExpanded(e => !e)}
          className="flex items-center gap-1 px-3 py-1 rounded-lg border text-xs font-medium transition-colors"
          style={{
            borderColor: expanded ? '#bae6fd' : '#e2e8f0',
            color:        expanded ? '#0369a1' : '#64748b',
            background:   expanded ? '#f0f9ff' : '#f8fafc',
          }}
          title={expanded ? 'Minimize Zonal Areas' : 'Expand to edit zones'}
        >
          {expanded ? <ChevronUp size={13}/> : <ChevronDown size={13}/>}
          {expanded ? 'Minimize' : 'Edit Zones'}
        </button>
      </div>

      {/* Collapsible body */}
      {expanded && (
        <>
          <p className="text-xs text-slate-400 mt-2 mb-4">
            These zones appear in the member form. Changes apply immediately — no need to save.
          </p>

          {/* Add new zone */}
          <div className="flex gap-2 mb-5">
            <input
              className="field-input flex-1"
              placeholder="New zone name…"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && add()}
              disabled={adding}
            />
            <button onClick={add} disabled={adding || !newName.trim()}
              className="btn btn-primary btn-sm flex-shrink-0" style={{background:'#14532d',borderColor:'#14532d'}}>
              {adding ? <Loader2 size={13} className="animate-spin"/> : <Plus size={13}/>}
              Add
            </button>
          </div>

          {/* Zone list */}
          {loading ? (
            <div className="flex items-center gap-2 text-slate-400 text-sm"><Loader2 size={14} className="animate-spin"/>Loading zones…</div>
          ) : zones.length === 0 ? (
            <p className="text-xs text-slate-400 italic">No zones configured. Add one above.</p>
          ) : (
            <div className="space-y-1">
              {zones.map((z, idx) => (
                <div key={z.id}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg border border-transparent hover:border-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 dark:hover:border-slate-700 group transition-colors">

                  {/* Sort order buttons */}
                  <div className="flex flex-col gap-0.5 flex-shrink-0">
                    <button onClick={() => move(idx, -1)} disabled={idx === 0}
                      className="text-slate-300 hover:text-slate-600 disabled:opacity-0 disabled:pointer-events-none transition-colors">
                      <ChevronUp size={13}/>
                    </button>
                    <button onClick={() => move(idx, 1)} disabled={idx === zones.length - 1}
                      className="text-slate-300 hover:text-slate-600 disabled:opacity-0 disabled:pointer-events-none transition-colors">
                      <ChevronDown size={13}/>
                    </button>
                  </div>

                  {/* Zone name / inline edit */}
                  {editId === z.id ? (
                    <input
                      ref={editRef}
                      className="field-input flex-1 py-1 text-sm"
                      value={editName}
                      onChange={e => setEditName(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') saveEdit(z)
                        if (e.key === 'Escape') setEditId(null)
                      }}
                      onBlur={() => saveEdit(z)}
                    />
                  ) : (
                    <span className="flex-1 text-sm text-slate-700 dark:text-slate-200 font-medium">{z.zone_name}</span>
                  )}

                  {/* Action buttons — visible on row hover */}
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                    {savingId === z.id ? (
                      <Loader2 size={14} className="animate-spin text-slate-400"/>
                    ) : editId === z.id ? (
                      <button onClick={() => setEditId(null)} className="text-slate-400 hover:text-slate-600 p-1">
                        <X size={13}/>
                      </button>
                    ) : (
                      <button onClick={() => startEdit(z)} className="text-slate-400 hover:text-blue-600 p-1 transition-colors">
                        <Pencil size={13}/>
                      </button>
                    )}
                    <button onClick={() => remove(z)} disabled={deletingId === z.id}
                      className="text-slate-400 hover:text-red-600 p-1 transition-colors disabled:opacity-40">
                      {deletingId === z.id ? <Loader2 size={13} className="animate-spin"/> : <Trash2 size={13}/>}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}

/* ════════════════════════════════════════════════════════════
   PAYMENT CATEGORIES PANEL
   ════════════════════════════════════════════════════════════ */
function PaymentCategoriesPanel({ toast }) {
  const [cats,       setCats]       = useState([])
  const [loading,    setLoading]    = useState(true)
  const [expanded,   setExpanded]   = useState(false)
  const [editId,   setEditId]   = useState(null)
  const [editName, setEditName] = useState('')
  const [savingId, setSavingId] = useState(null)
  const [togglingId, setTogglingId] = useState(null)
  const editRef = useRef(null)

  const load = useCallback(async () => {
    setLoading(true)
    try { setCats(await getCategories()) } catch (err) { toast(err.message, 'error') }
    finally { setLoading(false) }
  }, [toast])

  useEffect(() => { load() }, [load])
  useEffect(() => { if (editRef.current) editRef.current.focus() }, [editId])

  const startEdit = c => { setEditId(c.id); setEditName(c.name) }

  const saveEdit = async (c) => {
    const name = editName.trim()
    if (!name) { setEditId(null); return }
    if (name === c.name) { setEditId(null); return }
    setSavingId(c.id)
    try {
      await updateCategory(c.id, name, c.sort_order)
      setCats(prev => prev.map(x => x.id === c.id ? { ...x, name } : x))
      toast('Category renamed', 'success')
    } catch (err) {
      toast(err.message.includes('unique') ? `"${name}" already exists` : err.message, 'error')
    }
    setSavingId(null)
    setEditId(null)
  }

  const toggle = async (c) => {
    setTogglingId(c.id)
    try {
      await toggleCategory(c.id, !c.is_active)
      setCats(prev => prev.map(x => x.id === c.id ? { ...x, is_active: !c.is_active } : x))
    } catch (err) { toast(err.message, 'error') }
    setTogglingId(null)
  }

  const activeCount = cats.filter(c => c.is_active).length

  return (
    <div className="card p-6">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <p className="form-section form-section-blue mb-0" style={{ color: 'var(--accent)', borderColor: 'var(--accent-ring)', marginBottom: 0 }}>
            Payment Categories
          </p>
          {!loading && cats.length > 0 && (
            <span className="text-xs text-slate-400 font-normal">
              ({activeCount} of {cats.length} active)
            </span>
          )}
        </div>
        <button
          onClick={() => setExpanded(e => !e)}
          className="flex items-center gap-1 px-3 py-1 rounded-lg border text-xs font-medium transition-colors"
          style={{
            borderColor: expanded ? 'var(--accent-ring)' : 'var(--card-border)',
            color:        expanded ? 'var(--accent)' : 'var(--text-3)',
            background:   expanded ? 'var(--accent-subtle)' : 'var(--page-bg)',
          }}
        >
          {expanded ? <ChevronUp size={13}/> : <ChevronDown size={13}/>}
          {expanded ? 'Collapse' : 'Manage'}
        </button>
      </div>

      {expanded && (
        <div style={{ marginTop: 16 }}>
          <p className="text-xs mb-4" style={{ color: 'var(--text-3)' }}>
            Toggle the switch to enable or disable a category. Click the pencil to rename it. Changes apply immediately to Receipt Entry and Declaration forms.
          </p>

          {loading ? (
            <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-3)' }}>
              <Loader2 size={14} className="animate-spin"/> Loading…
            </div>
          ) : cats.length === 0 ? (
            <p className="text-xs italic" style={{ color: 'var(--text-3)' }}>
              No categories found. Run the Finance module SQL in Supabase to seed the 14 default categories.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {cats.map((c) => (
                <div key={c.id}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '9px 12px', borderRadius: 8,
                    border: '1px solid',
                    borderColor: c.is_active ? 'var(--card-border)' : 'transparent',
                    background: c.is_active ? 'var(--card-bg)' : 'var(--page-bg)',
                    transition: 'all 0.15s',
                  }}
                >
                  {/* Toggle switch */}
                  <button
                    onClick={() => toggle(c)}
                    disabled={togglingId === c.id}
                    title={c.is_active ? 'Disable' : 'Enable'}
                    style={{
                      flexShrink: 0,
                      width: 36, height: 20, borderRadius: 10,
                      border: 'none', cursor: togglingId === c.id ? 'wait' : 'pointer',
                      background: c.is_active ? 'var(--accent)' : 'var(--input-border)',
                      position: 'relative', transition: 'background 0.2s',
                      padding: 0,
                    }}
                  >
                    {togglingId === c.id ? (
                      <Loader2 size={10} className="animate-spin" style={{ color: '#fff', position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)' }}/>
                    ) : (
                      <span style={{
                        position: 'absolute', top: 2,
                        left: c.is_active ? 18 : 2,
                        width: 16, height: 16, borderRadius: '50%',
                        background: '#fff',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                        transition: 'left 0.2s',
                        display: 'block',
                      }}/>
                    )}
                  </button>

                  {/* Name / inline edit */}
                  {editId === c.id ? (
                    <div style={{ display: 'flex', gap: 6, flex: 1, alignItems: 'center' }}>
                      <input
                        ref={editRef}
                        className="field-input"
                        value={editName}
                        onChange={e => setEditName(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') saveEdit(c); if (e.key === 'Escape') setEditId(null) }}
                        style={{ flex: 1, height: 30, fontSize: 13 }}
                      />
                      <button
                        onClick={() => saveEdit(c)}
                        disabled={savingId === c.id}
                        style={{ flexShrink: 0, background: 'var(--accent)', border: 'none', borderRadius: 6, padding: '4px 10px', cursor: 'pointer', color: '#fff', display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 600 }}
                      >
                        {savingId === c.id ? <Loader2 size={12} className="animate-spin"/> : <Check size={12}/>}
                        Save
                      </button>
                      <button
                        onClick={() => setEditId(null)}
                        style={{ flexShrink: 0, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: '4px 6px' }}
                      >
                        <X size={13}/>
                      </button>
                    </div>
                  ) : (
                    <>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: c.is_active ? 'var(--text-1)' : 'var(--text-3)', transition: 'color 0.15s' }}>
                          {c.name}
                        </span>
                      </div>
                      <button
                        onClick={() => startEdit(c)}
                        title="Rename"
                        style={{ flexShrink: 0, background: 'none', border: '1px solid var(--card-border)', borderRadius: 6, padding: '3px 8px', cursor: 'pointer', color: 'var(--text-3)', display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600, transition: 'all 0.15s' }}
                        onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.color = 'var(--accent)' }}
                        onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--card-border)'; e.currentTarget.style.color = 'var(--text-3)' }}
                      >
                        <Pencil size={11}/> Rename
                      </button>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
