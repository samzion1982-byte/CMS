import { useState, useEffect, useRef } from 'react'
import { supabase, LICENSE_CSV, VENDOR } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { useToast } from '../lib/toast'
import { Save, Upload, CheckCircle, XCircle, Loader2, ShieldCheck, Trash2 } from 'lucide-react'

const DENOMS = ['CSI','CNI','Catholic','Pentecostal','Methodist','Baptist','Anglican','Others']

export default function ChurchSetupPage() {
  const { profile } = useAuth()
  const toast = useToast()
  const logoRef = useRef(null)
  const dioceseLogoRef = useRef(null)

  const [church, setChurch] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [flushing, setFlushing] = useState(false)
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
    auth_code: ''
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
        auth_code:          data.auth_code          || ''
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

  async function flush() {
    if (!church) { toast('No church record to flush.', 'error'); return }
    if (!window.confirm('This will permanently clear ALL church details, logos and office bearer information from the database.\n\nAre you sure?')) return
    setFlushing(true)
    try {
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
        updated_at: new Date().toISOString()
      }
      const { error } = await supabase.from('churches').update(blank).eq('id', church.id)
      if (error) throw error

      // Reset local state
      setLogoFile(null); setLogoPreview(null)
      setDioceseLogoFile(null); setDioceseLogoPreview(null)
      setAuthCode(''); setLicenseStatus(null); setLicenseInfo(null)
      toast('Church details flushed successfully.', 'success')
      loadChurch()
    } catch (err) {
      toast('Flush failed: ' + err.message, 'error')
    } finally {
      setFlushing(false)
    }
  }

  if (profile?.role !== 'super_admin') {
    return <div className="flex items-center justify-center h-64 text-slate-400 text-sm">Access denied. Super Admin only.</div>
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
    <div className="animate-fade-in max-w-3xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900 tracking-tight">Church setup</h1>
          <p className="text-xs text-slate-400 mt-0.5">Configure church details, logo and license</p>
        </div>
        <div className="flex gap-2">
          <button onClick={flush} disabled={flushing || saving || !church} className="btn btn-secondary"
            style={{borderColor:'#fca5a5',color:'#dc2626',background:'#fff5f5'}}>
            {flushing ? <><Loader2 size={14} className="animate-spin"/>Flushing...</> : <><Trash2 size={14}/>Flush</>}
          </button>
          <button onClick={save} disabled={saving || flushing} className="btn btn-primary" style={{background:'#14532d',borderColor:'#14532d'}}>
            {saving ? <><Loader2 size={14} className="animate-spin"/>Saving...</> : <><Save size={14}/>Save changes</>}
          </button>
        </div>
      </div>

      <div className="space-y-6">

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
          <p className="form-section form-section-blue" style={{color:'#7c3aed',borderColor:'#ddd6fe'}}>Key Office Bearers</p>
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

        {/* LICENSE */}
        <div className="card p-6">
          <p className="form-section" style={{color:'#d97706',borderColor:'#fde68a'}}>License validation</p>
          <p className="text-xs text-slate-400 mb-4">Enter the AUTH CODE provided by {VENDOR.name}. This must be verified before saving.</p>
          <div className="flex gap-2 mb-3">
            <input className="field-input flex-1" value={authCode} onChange={e=>setAuthCode(e.target.value.toUpperCase())}
              placeholder="e.g. 0001-XXXXXXXX" style={{fontFamily:'monospace',letterSpacing:'0.05em'}}
              onKeyDown={e=>e.key==='Enter'&&verifyLicense()}/>
            <button onClick={verifyLicense} disabled={verifying||!authCode.trim()} className="btn btn-secondary" style={{flexShrink:0}}>
              {verifying ? <><Loader2 size={13} className="animate-spin"/>Verifying...</> : <><ShieldCheck size={13}/>Verify</>}
            </button>
          </div>
          <LicenseBadge/>
          {licenseStatus !== 'valid' && (
            <p className="text-xs text-slate-400 mt-3">Need a license? Contact <strong className="text-slate-600">{VENDOR.name}</strong> — {VENDOR.phone}</p>
          )}
        </div>

      </div>
    </div>
  )
}
