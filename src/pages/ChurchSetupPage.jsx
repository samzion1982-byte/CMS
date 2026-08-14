import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase, LICENSE_CSV, VENDOR } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { useToast } from '../lib/toast'
import { Save, Upload, CheckCircle, XCircle, Loader2, ShieldCheck, Trash2,
         Plus, Pencil, ChevronUp, ChevronDown, X, Check, AlertTriangle, Church } from 'lucide-react'
import PageHeader from '../components/ui/PageHeader'
import { getZones, addZone, updateZone, deleteZone } from '../lib/zones'
import { getCategories, updateCategory, toggleCategory, reorderCategory } from '../lib/paymentCategories'
import MasterPasswordInput from '../components/MasterPasswordInput'
import { canAccessChurchSetup } from '../lib/cmsPermissions'
import {
  verifyMasterPassword,
  setChurchMasterPassword,
  clearChurchMasterPasswordBySuperAdmin,
  MASTER_PASSWORD_MIN_LENGTH,
} from '../lib/masterPassword'

const IDENTITY_KEYS = [
  'church_name', 'church_code', 'diocese', 'denomination', 'email',
  'address', 'city', 'state', 'pincode',
]
const BEARER_KEYS = [
  'presbyter_name', 'presbyter_whatsapp',
  'secretary_name', 'secretary_whatsapp',
  'treasurer_name', 'treasurer_whatsapp',
  'admin1_name', 'admin1_whatsapp',
]

const DENOMS = ['CSI','CNI','Catholic','Pentecostal','Methodist','Baptist','Anglican','Others']

export default function ChurchSetupPage() {
  const { profile, pageGrants } = useAuth()
  const toast = useToast()
  const logoRef = useRef(null)
  const dioceseLogoRef = useRef(null)
  const sealRef = useRef(null)

  const [church, setChurch] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [flushing,          setFlushing]          = useState(false)
  const [showFlushConfirm,  setShowFlushConfirm]  = useState(false)
  const [flushPassword,     setFlushPassword]     = useState('')
  const [flushPwErr,        setFlushPwErr]        = useState(false)
  const flushPwRef = useRef(null)

  const [showFlushAc,          setShowFlushAc]          = useState(false)
  const [flushAcStep,          setFlushAcStep]          = useState(1)   // 1=choose 2=select books 3=confirm
  const [flushAcTarget,        setFlushAcTarget]        = useState(null) // 'simple'|'advanced'
  const [flushAcPw,            setFlushAcPw]            = useState('')
  const [flushAcPwErr,         setFlushAcPwErr]         = useState(false)
  const [flushingAc,           setFlushingAc]           = useState(false)
  const [flushAcEntities,      setFlushAcEntities]      = useState([])
  const [flushAcSelected,      setFlushAcSelected]      = useState(new Set())
  const [flushAcEntitiesLoading, setFlushAcEntitiesLoading] = useState(false)
  const flushAcPwRef = useRef(null)

  const [mpNew, setMpNew] = useState('')
  const [mpConfirm, setMpConfirm] = useState('')
  const [mpShow, setMpShow] = useState(false)
  const [mpSaving, setMpSaving] = useState(false)
  const [mpCustom, setMpCustom] = useState(false)
  const [mpStatusMsg, setMpStatusMsg] = useState('')
  const [mpError, setMpError] = useState('')
  const [mpClearing, setMpClearing] = useState(false)
  const [logoFile, setLogoFile] = useState(null)
  const [logoPreview, setLogoPreview] = useState(null)
  const [dioceseLogoFile, setDioceseLogoFile] = useState(null)
  const [dioceseLogoPreview, setDioceseLogoPreview] = useState(null)
  const [sealFile, setSealFile] = useState(null)
  const [sealPreview, setSealPreview] = useState(null)

  // License verification
  const [authCode, setAuthCode] = useState('')
  const [verifying, setVerifying] = useState(false)
  const [licenseStatus, setLicenseStatus] = useState(null) // null | 'valid' | 'inactive' | 'expired' | 'invalid'
  const [licenseInfo, setLicenseInfo] = useState(null)

  const [form, setForm] = useState({
    church_name: '', church_code: '', diocese: '', denomination: 'CSI',
    email: '',
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
    upi_id: '',
    site_url: '',
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
        email:          data.email          || '',
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
        upi_id:                data.upi_id                || '',
        site_url:              data.site_url              || '',
      })
      setAuthCode(data.auth_code || '')
      if (data.logo_url) setLogoPreview(data.logo_url)
      if (data.diocese_logo_url) setDioceseLogoPreview(data.diocese_logo_url)
      if (data.treasurer_seal_url) setSealPreview(data.treasurer_seal_url)
      if (data.auth_code) setLicenseStatus('valid')
      setMpCustom(!!data.master_password_hash)
    } else {
      setMpCustom(false)
    }
    setLoading(false)
  }

  async function saveMasterPassword() {
    setMpError('')
    setMpStatusMsg('')
    if (!mpNew || mpNew.length < MASTER_PASSWORD_MIN_LENGTH) {
      setMpError(`New password must be at least ${MASTER_PASSWORD_MIN_LENGTH} characters.`)
      return
    }
    if (mpNew !== mpConfirm) {
      setMpError('New password and confirmation do not match.')
      return
    }
    setMpSaving(true)
    try {
      await setChurchMasterPassword({ newPassword: mpNew })
      setMpNew('')
      setMpConfirm('')
      setMpCustom(true)
      setMpStatusMsg('Master password saved.')
      toast('Master password saved.', 'success')
    } catch (e) {
      setMpError(e.message || 'Could not save master password.')
    } finally {
      setMpSaving(false)
    }
  }

  async function restoreDefaultMasterPassword() {
    if (!window.confirm('Clear the custom master password and restore the built-in default? Gates will accept the default password again until you set a new one.')) {
      return
    }
    setMpError('')
    setMpStatusMsg('')
    setMpClearing(true)
    try {
      await clearChurchMasterPasswordBySuperAdmin()
      setMpCustom(false)
      setMpStatusMsg('Custom password cleared. Built-in default is active again.')
      toast('Master password restored to built-in default.', 'success')
    } catch (e) {
      setMpError(e.message || 'Could not clear master password.')
    } finally {
      setMpClearing(false)
    }
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

  function onSeal(e) {
    const f = e.target.files?.[0]; if (!f) return
    setSealFile(f); setSealPreview(URL.createObjectURL(f))
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

  async function saveBasics() {
    if (canIdentity && !form.church_name) {
      toast('Church name is required.', 'error')
      return
    }
    if (!church?.id) {
      toast('No church record found.', 'error')
      return
    }
    setSaving(true)
    try {
      const payload = { updated_at: new Date().toISOString() }
      if (canIdentity) {
        for (const k of IDENTITY_KEYS) payload[k] = form[k]
        let logo_url = church?.logo_url || null
        let diocese_logo_url = church?.diocese_logo_url || null
        let treasurer_seal_url = church?.treasurer_seal_url || null
        if (logoFile) {
          const ext = logoFile.name.split('.').pop()
          const path = 'church-logo.' + ext.toLowerCase()
          const { error: ue } = await supabase.storage.from('church-logos').upload(path, logoFile, { upsert: true })
          if (ue) throw ue
          logo_url = supabase.storage.from('church-logos').getPublicUrl(path).data?.publicUrl || null
        }
        if (dioceseLogoFile) {
          const ext = dioceseLogoFile.name.split('.').pop()
          const path = 'diocese-logo.' + ext.toLowerCase()
          const { error: ude } = await supabase.storage.from('church-logos').upload(path, dioceseLogoFile, { upsert: true })
          if (ude) throw ude
          diocese_logo_url = supabase.storage.from('church-logos').getPublicUrl(path).data?.publicUrl || null
        }
        if (sealFile) {
          const ext = sealFile.name.split('.').pop()
          const path = 'treasurer-seal.' + ext.toLowerCase()
          const { error: use } = await supabase.storage.from('church-logos').upload(path, sealFile, { upsert: true })
          if (use) throw use
          treasurer_seal_url = supabase.storage.from('church-logos').getPublicUrl(path).data?.publicUrl || null
        }
        payload.logo_url = logo_url
        payload.diocese_logo_url = diocese_logo_url
        payload.treasurer_seal_url = treasurer_seal_url
      }
      if (canBearers) {
        for (const k of BEARER_KEYS) payload[k] = form[k]
      }
      const { error } = await supabase.from('churches').update(payload).eq('id', church.id)
      if (error) throw error
      toast('Church details saved.', 'success')
      window.dispatchEvent(new CustomEvent('church-settings-updated'))
      loadChurch()
    } catch (e) {
      toast('Save failed: ' + (e.message || e), 'error')
    } finally {
      setSaving(false)
    }
  }

  async function save() {
    if (!form.church_name) { toast('Church name is required.', 'error'); return }
    if (!form.auth_code && licenseStatus !== 'valid') { toast('Please verify the AUTH CODE first.', 'error'); return }
    setSaving(true)
    let logo_url = church?.logo_url || null
    let diocese_logo_url = church?.diocese_logo_url || null
    let treasurer_seal_url = church?.treasurer_seal_url || null
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
    if (sealFile) {
      const ext  = sealFile.name.split('.').pop()
      const path = 'treasurer-seal.' + ext.toLowerCase()
      const { error: use } = await supabase.storage.from('church-logos').upload(path, sealFile, { upsert: true })
      if (use) {
        setSaving(false)
        toast('Treasurer seal upload failed: ' + use.message, 'error')
        return
      }
      const { data: pd } = supabase.storage.from('church-logos').getPublicUrl(path)
      treasurer_seal_url = pd?.publicUrl || null
    }
    const payload = { ...form, logo_url, diocese_logo_url, treasurer_seal_url, updated_at: new Date().toISOString() }
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
    window.dispatchEvent(new CustomEvent('church-settings-updated'))
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
        email:'',
        address:'', city:'', state:'', pincode:'',
        whatsapp_number:'', whatsapp_url:'', instance_id:'', access_token:'',
        whatsapp_api_type:'soft7', official_phone_number_id:'', official_bearer_token:'',
        presbyter_name:'', presbyter_whatsapp:'',
        secretary_name:'', secretary_whatsapp:'',
        treasurer_name:'', treasurer_whatsapp:'',
        admin1_name:'',    admin1_whatsapp:'',
        auth_code:'', logo_url: null, diocese_logo_url: null, treasurer_seal_url: null,
        receipt_date_mode:'today', whatsapp_receipt_mode:'instant', upi_id:'', site_url:'',
        updated_at: new Date().toISOString()
      }
      const { error } = await supabase.from('churches').update(blank).eq('id', church.id)
      if (error) throw error

      // Clear all church zones
      await supabase.from('church_zones').delete().gte('sort_order', 0)

      // Reset local state
      setLogoFile(null); setLogoPreview(null)
      setDioceseLogoFile(null); setDioceseLogoPreview(null)
      setSealFile(null); setSealPreview(null)
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

  async function doFlushAccounts() {
    if (flushingAc) return
    const ok = await verifyMasterPassword(flushAcPw)
    if (!ok) {
      setFlushAcPwErr(true)
      setTimeout(() => flushAcPwRef.current?.focus(), 30)
      return
    }
    setFlushAcPwErr(false)
    setFlushingAc(true)
    try {
      if (flushAcTarget === 'simple') {
        const { error } = await supabase.rpc('flush_simple_accounts')
        if (error) throw error
        toast('Simple Accounts flushed. Default accounts & categories restored.', 'success')
      } else {
        const ids = Array.from(flushAcSelected)
        if (ids.length === 0) { toast('No books selected.', 'error'); setFlushingAc(false); return }
        const { error } = await supabase.rpc('flush_selected_entities', { p_entity_ids: ids })
        if (error) throw error
        const names = flushAcEntities.filter(e => flushAcSelected.has(e.id)).map(e => e.name).join(', ')
        const allCleared = ids.length === flushAcEntities.length
        toast(`Flushed: ${names}. Create a new Accounting Book to get started.`, 'success')
        if (allCleared) {
          Object.keys(sessionStorage).filter(k => k.startsWith('ac_')).forEach(k => sessionStorage.removeItem(k))
          Object.keys(localStorage).filter(k => k.startsWith('ac_')).forEach(k => localStorage.removeItem(k))
          setTimeout(() => window.location.reload(), 1200)
        }
      }
      setShowFlushAc(false)
    } catch (err) {
      toast('Flush failed: ' + err.message, 'error')
    } finally {
      setFlushingAc(false)
    }
  }

  const isSuperAdmin = profile?.role === 'super_admin'
  const role = profile?.role
  // Single CMS Permissions grant for Church Setup → Admin edits identity + bearers
  const hasChurchSetup = canAccessChurchSetup(role, pageGrants)
  const canIdentity = !isSuperAdmin && hasChurchSetup
  const canBearers  = !isSuperAdmin && hasChurchSetup
  const canEditBasics = canIdentity || canBearers
  // Non–super-admin roles that were granted this page get the zones/categories view.
  const isAdmin1     = profile?.role === 'admin1' || (!isSuperAdmin && !!profile?.role)

  if (!profile) {
    return <div className="flex items-center justify-center h-64 text-slate-400 text-sm">Loading…</div>
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
      <PageHeader
        icon={Church}
        title="Church Setup"
        subtitle={
          isSuperAdmin
            ? 'Configure church details, logo, zones and license'
            : canEditBasics
              ? 'Update church identity and office bearers'
              : 'Manage zonal areas'
        }
      >
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
        {canEditBasics && (
          <button onClick={saveBasics} disabled={saving || !church} className="btn btn-primary" style={{background:'#14532d',borderColor:'#14532d'}}>
            {saving ? <><Loader2 size={14} className="animate-spin"/>Saving...</> : <><Save size={14}/>Save changes</>}
          </button>
        )}
      </PageHeader>

      {/* Two-column layout for super_admin; section cards for Admin grants; zones for others */}
      {isSuperAdmin ? (
        <div style={{display:'flex', gap:24, alignItems:'flex-start'}}>

          {/* ── LEFT: main church cards ── */}
          <div style={{flex:1, minWidth:0, display:'flex', flexDirection:'column', gap:24}}>
          {/* IDENTITY + LOCATION */}
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
              <div className="field-group">
                <label className="field-label">Church Email ID</label>
                <input className="field-input" type="email" value={form.email} onChange={e=>s('email',e.target.value)} placeholder="e.g. stpauls@example.com"/>
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
            <div className="flex flex-col items-center gap-2 flex-shrink-0">
              <div onClick={()=>sealRef.current?.click()}
                className="w-24 h-24 rounded-xl border-2 border-dashed border-slate-200 overflow-hidden cursor-pointer hover:border-blue-400 transition-colors flex items-center justify-center bg-slate-50">
                {sealPreview
                  ? <img src={sealPreview} className="w-full h-full object-contain p-2" alt="Treasurer Seal"/>
                  : <div className="text-center p-2">
                      <div className="w-8 h-8 mx-auto mb-1 opacity-20">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></svg>
                      </div>
                      <p className="text-[10px] text-slate-400">Treasurer<br/>Seal</p>
                    </div>
                }
              </div>
              <input ref={sealRef} type="file" accept="image/*" className="hidden" onChange={onSeal}/>
              <button className="btn btn-ghost btn-sm" onClick={()=>sealRef.current?.click()}>
                <Upload size={11}/>Upload
              </button>
            </div>
          </div>
          <p className="form-section form-section-blue" style={{marginTop:20}}>Location</p>
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

        {/* ACCOUNTS MODULE */}
        <div className="card p-6">
          <p className="form-section form-section-blue" style={{color:'#16a34a',borderColor:'#86efac'}}>Accounts Module</p>
          {(() => {
            const masterOn = !!(church?.accounting_enabled || church?.simple_accounting_enabled)
            const mode     = church?.accounting_enabled ? 'advanced' : 'simple'
            const OPTS = [
              { key: 'simple',   emoji: '💰', title: 'Simple Accounts',   desc: 'Easy cash-book — no accounting knowledge needed. Track money in and out with plain English.' },
              { key: 'advanced', emoji: '📊', title: 'Advanced Accounts',  desc: 'Full double-entry bookkeeping. Chart of accounts, journal entries, trial balance and financial statements.' },
            ]
            return (
              <>
                {/* Master on/off row */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: masterOn ? '#f0fdf4' : '#f8fafc', borderRadius: 10, border: `1.5px solid ${masterOn ? '#86efac' : '#e2e8f0'}`, marginBottom: masterOn ? 10 : 0 }}>
                  <div>
                    <p style={{ fontSize: 13, fontWeight: 600, color: masterOn ? '#16a34a' : '#64748b', margin: '0 0 2px' }}>
                      {masterOn ? `Accounts Enabled — ${mode === 'simple' ? 'Simple' : 'Advanced'}` : 'Accounts Disabled'}
                    </p>
                    <p style={{ fontSize: 11, color: '#94a3b8', margin: 0 }}>
                      {masterOn ? 'Visible in the sidebar under Finance' : 'Enable to track church income and expenses'}
                    </p>
                  </div>
                  <button
                    onClick={async () => {
                      const newOn   = !masterOn
                      const updates = newOn
                        ? { simple_accounting_enabled: true,  accounting_enabled: false }
                        : { simple_accounting_enabled: false, accounting_enabled: false }
                      const { error } = await supabase.from('churches').update(updates).eq('id', church.id)
                      if (error) { toast('Failed: ' + error.message, 'error'); return }
                      setChurch(c => ({ ...c, ...updates }))
                      toast(newOn ? 'Accounts module enabled.' : 'Accounts module disabled.', 'success')
                      window.dispatchEvent(new CustomEvent('church-settings-updated'))
                    }}
                    style={{ width: 48, height: 26, borderRadius: 99, border: 'none', cursor: 'pointer', background: masterOn ? '#16a34a' : '#d1d5db', position: 'relative', transition: 'background 0.2s', flexShrink: 0 }}
                  >
                    <span style={{ position: 'absolute', top: 3, left: masterOn ? 24 : 3, width: 20, height: 20, borderRadius: '50%', background: '#fff', transition: 'left 0.2s', boxShadow: '0 1px 4px rgba(0,0,0,0.2)' }} />
                  </button>
                </div>

                {/* Mode selector — visible only when accounts are on */}
                {masterOn && (
                  <div style={{ display: 'flex', gap: 10 }}>
                    {OPTS.map(opt => {
                      const active = mode === opt.key
                      return (
                        <button key={opt.key}
                          onClick={async () => {
                            if (mode === opt.key) return
                            const updates = opt.key === 'advanced'
                              ? { accounting_enabled: true,  simple_accounting_enabled: false }
                              : { accounting_enabled: false, simple_accounting_enabled: true  }
                            const { error } = await supabase.from('churches').update(updates).eq('id', church.id)
                            if (error) { toast('Failed: ' + error.message, 'error'); return }
                            setChurch(c => ({ ...c, ...updates }))
                            toast(`Switched to ${opt.title}.`, 'success')
                            window.dispatchEvent(new CustomEvent('church-settings-updated'))
                          }}
                          style={{ flex: 1, display: 'flex', alignItems: 'flex-start', gap: 10, padding: '12px 14px', borderRadius: 10, border: `2px solid ${active ? '#2563eb' : '#e2e8f0'}`, background: active ? '#eff6ff' : '#f8fafc', cursor: mode === opt.key ? 'default' : 'pointer', textAlign: 'left', transition: 'all 0.15s' }}
                        >
                          <span style={{ fontSize: 22, lineHeight: 1, flexShrink: 0, marginTop: 1 }}>{opt.emoji}</span>
                          <div>
                            <p style={{ fontSize: 13, fontWeight: 700, color: active ? '#2563eb' : '#374151', margin: '0 0 3px' }}>{opt.title}</p>
                            <p style={{ fontSize: 11, color: '#94a3b8', margin: 0, lineHeight: 1.45 }}>{opt.desc}</p>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                )}

                {/* Flush Accounts */}
                <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px dashed #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                  <p style={{ fontSize: 11, color: '#94a3b8', margin: 0, lineHeight: 1.5 }}>
                    Clears all journal entries, balances and COA. Accounting Books are preserved. Standard COA is auto-restored for each book.
                  </p>
                  <button
                    onClick={() => { setFlushAcPw(''); setFlushAcPwErr(false); setFlushAcTarget(null); setFlushAcStep(1); setFlushAcEntities([]); setFlushAcSelected(new Set()); setShowFlushAc(true) }}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', background: '#fff5f5', border: '1.5px solid #fca5a5', borderRadius: 8, fontSize: 12, fontWeight: 600, color: '#b91c1c', cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}
                  >
                    <Trash2 size={12} /> Flush Accounts
                  </button>
                </div>
              </>
            )
          })()}
        </div>

        {/* WHATSAPP */}
        <div className="card p-6">
          <p className="form-section form-section-blue" style={{color:'#15803d',borderColor:'#bbf7d0'}}>WhatsApp</p>
          <div className="space-y-3">
            <div className="field-group">
              <label className="field-label">Church WhatsApp Number</label>
              <input className="field-input" value={form.whatsapp_number} onChange={e=>s('whatsapp_number',e.target.value)} placeholder="+91XXXXXXXXXX"/>
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
              <div className="space-y-3">
                <div className="field-group">
                  <label className="field-label">API Endpoint URL</label>
                  <input className="field-input" value={form.whatsapp_url} onChange={e=>s('whatsapp_url',e.target.value)} placeholder="https://your-instance.soft7.in/api/send"/>
                  <p className="text-xs text-slate-400 mt-1">Full URL provided by your Soft7 / WhatsApp API provider</p>
                </div>
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

            {/* RECEIPTS & PAYMENTS */}
            <div className="card p-6">
              <p className="form-section form-section-blue" style={{color:'#7c3aed',borderColor:'#ddd6fe'}}>Receipts & Payments</p>
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

                {/* Site URL */}
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">App / Site URL</p>
                  <div className="field-group">
                    <input className="field-input" value={form.site_url} onChange={e => s('site_url', e.target.value)}
                      placeholder="https://yourchurch.app"
                      style={{ fontFamily: 'monospace', letterSpacing: '0.02em' }}/>
                    <p className="text-xs text-slate-400 mt-1">
                      Public URL of this app. Used in WhatsApp payment links so members can open the payment page. Leave blank to auto-detect.
                    </p>
                  </div>
                </div>

                {/* UPI ID */}
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">UPI ID</p>
                  <div className="field-group">
                    <input className="field-input" value={form.upi_id} onChange={e => s('upi_id', e.target.value)}
                      placeholder="e.g. samzion1982@oksbi"
                      style={{ fontFamily: 'monospace', letterSpacing: '0.02em' }}/>
                    <p className="text-xs text-slate-400 mt-1">
                      Used on the online payment page for GPay / UPI deep-link. Members pay directly to this ID.
                    </p>
                  </div>
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

            <div className="card p-5">
              <p className="form-section" style={{color:'#0f766e',borderColor:'#99f6e4'}}>Master password</p>
              <p className="text-xs text-slate-400 mb-3" style={{lineHeight:1.45}}>
                Super Admin only. Protects Fixed Assets, document deletes, directory deletes, accounting locks, and similar gates.
              </p>
              {mpCustom ? (
                <div className="flex items-center gap-2 px-3 py-2 mb-3 bg-teal-50 border border-teal-200 rounded-lg text-xs">
                  <CheckCircle size={14} className="text-teal-600 flex-shrink-0"/>
                  <span className="text-teal-800 font-medium">Custom password is set</span>
                </div>
              ) : (
                <div className="flex items-center gap-2 px-3 py-2 mb-3 bg-amber-50 border border-amber-200 rounded-lg text-xs">
                  <AlertTriangle size={14} className="text-amber-600 flex-shrink-0"/>
                  <span className="text-amber-800 font-medium">Using built-in default — set a custom password</span>
                </div>
              )}
              <div className="field-group mb-2">
                <label className="field-label">New password</label>
                <MasterPasswordInput
                  className="field-input"
                  value={mpNew}
                  showPlain={mpShow}
                  onChange={e => setMpNew(e.target.value)}
                  placeholder={`At least ${MASTER_PASSWORD_MIN_LENGTH} characters`}
                />
              </div>
              <div className="field-group mb-3">
                <label className="field-label">Confirm password</label>
                <MasterPasswordInput
                  className="field-input"
                  value={mpConfirm}
                  showPlain={mpShow}
                  onChange={e => setMpConfirm(e.target.value)}
                  placeholder="Re-enter password"
                  onKeyDown={e => e.key === 'Enter' && saveMasterPassword()}
                />
              </div>
              <label className="flex items-center gap-2 text-xs text-slate-500 mb-3 cursor-pointer select-none">
                <input type="checkbox" checked={mpShow} onChange={e => setMpShow(e.target.checked)} />
                Show passwords
              </label>
              {mpError && (
                <p className="text-xs font-semibold mb-2" style={{ color: '#dc2626' }}>{mpError}</p>
              )}
              {mpStatusMsg && !mpError && (
                <p className="text-xs font-semibold mb-2" style={{ color: '#0f766e' }}>{mpStatusMsg}</p>
              )}
              <button
                type="button"
                onClick={saveMasterPassword}
                disabled={mpSaving || mpClearing || !mpNew || !mpConfirm}
                className="btn btn-secondary btn-sm"
                style={{ width: '100%' }}
              >
                {mpSaving
                  ? <><Loader2 size={13} className="animate-spin"/> Saving…</>
                  : <><ShieldCheck size={13}/> Save master password</>}
              </button>
              {mpCustom && (
                <button
                  type="button"
                  onClick={restoreDefaultMasterPassword}
                  disabled={mpSaving || mpClearing}
                  className="btn btn-ghost btn-sm"
                  style={{ width: '100%', marginTop: 8, color: '#b45309' }}
                >
                  {mpClearing
                    ? <><Loader2 size={13} className="animate-spin"/> Clearing…</>
                    : 'Restore built-in default'}
                </button>
              )}
            </div>
          </div>

        </div>
      ) : canEditBasics ? (
        <div style={{ maxWidth: 820, display: 'flex', flexDirection: 'column', gap: 24 }}>
          {canIdentity && (
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
                  <div className="field-group">
                    <label className="field-label">Church Email ID</label>
                    <input className="field-input" type="email" value={form.email} onChange={e=>s('email',e.target.value)} placeholder="e.g. stpauls@example.com"/>
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
                <div className="flex flex-col items-center gap-2 flex-shrink-0">
                  <div onClick={()=>sealRef.current?.click()}
                    className="w-24 h-24 rounded-xl border-2 border-dashed border-slate-200 overflow-hidden cursor-pointer hover:border-blue-400 transition-colors flex items-center justify-center bg-slate-50">
                    {sealPreview
                      ? <img src={sealPreview} className="w-full h-full object-contain p-2" alt="Treasurer Seal"/>
                      : <div className="text-center p-2">
                          <div className="w-8 h-8 mx-auto mb-1 opacity-20">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></svg>
                          </div>
                          <p className="text-[10px] text-slate-400">Treasurer<br/>Seal</p>
                        </div>
                    }
                  </div>
                  <input ref={sealRef} type="file" accept="image/*" className="hidden" onChange={onSeal}/>
                  <button className="btn btn-ghost btn-sm" onClick={()=>sealRef.current?.click()}>
                    <Upload size={11}/>Upload
                  </button>
                </div>
              </div>
              <p className="form-section form-section-blue" style={{marginTop:20}}>Location</p>
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
          )}

          {canBearers && (
            <div className="card p-6">
              <p className="form-section form-section-blue" style={{color:'var(--accent)',borderColor:'var(--accent-ring)'}}>Key Office Bearers</p>
              <div className="space-y-4">
                {[
                  { role: 'Presbyter / Pastor', nameKey: 'presbyter_name', waKey: 'presbyter_whatsapp' },
                  { role: 'Secretary',           nameKey: 'secretary_name', waKey: 'secretary_whatsapp' },
                  { role: 'Treasurer',           nameKey: 'treasurer_name', waKey: 'treasurer_whatsapp' },
                  { role: 'Admin 1',             nameKey: 'admin1_name',    waKey: 'admin1_whatsapp'    },
                ].map(({ role: rLabel, nameKey, waKey }) => (
                  <div key={nameKey}>
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">{rLabel}</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="field-group">
                        <label className="field-label">Name</label>
                        <input className="field-input" value={form[nameKey]} onChange={e=>s(nameKey,e.target.value)} placeholder={`${rLabel} name`}/>
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
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <ZonesPanel profile={profile} toast={toast} />
            <PaymentCategoriesPanel profile={profile} toast={toast} />
          </div>
        </div>
      ) : (
        /* other roles: zones + categories */
        <div style={{maxWidth:560, display:'flex', flexDirection:'column', gap:16}}>
          <ZonesPanel profile={profile} toast={toast} />
          <PaymentCategoriesPanel profile={profile} toast={toast} />
        </div>
      )}

      {/* ── Flush Accounts modal (2-step) ── */}
      {showFlushAc && (
        <div onClick={e => { if (e.target === e.currentTarget && !flushingAc) setShowFlushAc(false) }}
          style={{ position:'fixed', inset:0, background:'rgba(15,23,42,0.72)', backdropFilter:'blur(4px)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:9999, padding:16 }}>
          <div style={{ background:'var(--card-bg)', borderRadius:16, width:'100%', maxWidth:460, boxShadow:'0 32px 80px rgba(0,0,0,0.5)', overflow:'hidden' }}>

            {/* ── Step 1: Choose module ── */}
            {flushAcStep === 1 && (<>
              <div style={{ padding:'18px 22px', borderBottom:'1px solid var(--card-border)', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                <div>
                  <p style={{ margin:0, fontSize:15, fontWeight:800, color:'var(--text-1)', fontFamily:'var(--font-ui)' }}>Flush Accounts</p>
                  <p style={{ margin:0, fontSize:12, color:'var(--text-3)', fontFamily:'var(--font-ui)' }}>Choose which module to flush</p>
                </div>
                <button onClick={() => setShowFlushAc(false)} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--text-3)', fontSize:20, lineHeight:1, padding:'2px 6px' }}>×</button>
              </div>
              <div style={{ padding:'20px 22px', display:'flex', flexDirection:'column', gap:12 }}>
                {[
                  { key:'simple',   emoji:'💰', title:'Simple Accounts',   sub:'Cash-book style',      items:['All transactions', 'All cash/bank accounts', 'All categories', 'Resets to default accounts & categories'] },
                  { key:'advanced', emoji:'📊', title:'Advanced Accounts',  sub:'Double-entry bookkeeping', items:['All accounting books (entities)', 'Chart of accounts', 'All journal entries & balances', 'Resets accounting method lock'] },
                ].map(opt => {
                  const sel = flushAcTarget === opt.key
                  return (
                    <button key={opt.key} onClick={() => setFlushAcTarget(opt.key)}
                      style={{ display:'flex', alignItems:'flex-start', gap:14, padding:'14px 16px', borderRadius:12, border:`2px solid ${sel ? '#dc2626' : 'var(--card-border)'}`, background: sel ? '#fff5f5' : 'var(--table-header-bg)', cursor:'pointer', textAlign:'left', transition:'all 0.15s' }}>
                      <span style={{ fontSize:26, lineHeight:1, flexShrink:0, marginTop:2 }}>{opt.emoji}</span>
                      <div style={{ flex:1 }}>
                        <div style={{ display:'flex', alignItems:'baseline', gap:8, marginBottom:6 }}>
                          <p style={{ margin:0, fontSize:14, fontWeight:700, color: sel ? '#b91c1c' : 'var(--text-1)', fontFamily:'var(--font-ui)' }}>{opt.title}</p>
                          <span style={{ fontSize:11, color:'var(--text-3)', fontFamily:'var(--font-ui)' }}>{opt.sub}</span>
                        </div>
                        <div style={{ display:'flex', flexDirection:'column', gap:3 }}>
                          {opt.items.map(item => (
                            <div key={item} style={{ display:'flex', alignItems:'center', gap:6 }}>
                              <div style={{ width:4, height:4, borderRadius:'50%', background: sel ? '#dc2626' : '#94a3b8', flexShrink:0 }}/>
                              <span style={{ fontSize:11, color: sel ? '#b91c1c' : 'var(--text-3)', fontFamily:'var(--font-ui)' }}>{item}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div style={{ width:18, height:18, borderRadius:'50%', border:`2px solid ${sel ? '#dc2626' : 'var(--card-border)'}`, background: sel ? '#dc2626' : 'transparent', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, marginTop:2 }}>
                        {sel && <div style={{ width:7, height:7, borderRadius:'50%', background:'#fff' }}/>}
                      </div>
                    </button>
                  )
                })}
                <div style={{ display:'flex', gap:10, marginTop:4 }}>
                  <button onClick={() => setShowFlushAc(false)}
                    style={{ flex:1, height:40, background:'var(--card-bg)', border:'1.5px solid var(--card-border)', borderRadius:8, fontSize:13, fontWeight:600, cursor:'pointer', color:'var(--text-2)', fontFamily:'var(--font-ui)' }}>
                    Cancel
                  </button>
                  <button
                    disabled={!flushAcTarget}
                    onClick={async () => {
                      if (flushAcTarget === 'simple') {
                        setFlushAcPw(''); setFlushAcPwErr(false); setFlushAcStep(3)
                        setTimeout(() => flushAcPwRef.current?.focus(), 80)
                      } else {
                        setFlushAcEntitiesLoading(true); setFlushAcStep(2)
                        const { data } = await supabase.from('accounting_entities').select('id,name,entity_type,is_active').order('created_at')
                        const list = data || []
                        setFlushAcEntities(list)
                        setFlushAcSelected(new Set(list.map(e => e.id)))
                        setFlushAcEntitiesLoading(false)
                      }
                    }}
                    style={{ flex:2, height:40, background:flushAcTarget ? '#dc2626' : '#e5e7eb', color:flushAcTarget ? '#fff' : '#9ca3af', border:'none', borderRadius:8, fontSize:13, fontWeight:700, cursor:flushAcTarget ? 'pointer' : 'not-allowed', fontFamily:'var(--font-ui)' }}>
                    Continue →
                  </button>
                </div>
              </div>
            </>)}

            {/* ── Step 2: Select Accounting Books (Advanced only) ── */}
            {flushAcStep === 2 && (<>
              <div style={{ padding:'16px 22px', borderBottom:'1px solid var(--card-border)', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                <div>
                  <p style={{ margin:0, fontSize:15, fontWeight:800, color:'var(--text-1)', fontFamily:'var(--font-ui)' }}>Select Accounting Books to Flush</p>
                  <p style={{ margin:0, fontSize:12, color:'var(--text-3)', fontFamily:'var(--font-ui)' }}>Unchecked books will be kept intact</p>
                </div>
                <button onClick={() => setShowFlushAc(false)} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--text-3)', fontSize:20, lineHeight:1, padding:'2px 6px' }}>×</button>
              </div>
              <div style={{ padding:'16px 22px' }}>
                {flushAcEntitiesLoading ? (
                  <div style={{ display:'flex', justifyContent:'center', padding:'24px 0' }}>
                    <Loader2 size={22} style={{ animation:'spin 0.7s linear infinite', color:'var(--accent)' }} />
                  </div>
                ) : flushAcEntities.length === 0 ? (
                  <p style={{ fontSize:13, color:'var(--text-3)', textAlign:'center', padding:'16px 0', fontFamily:'var(--font-ui)' }}>No accounting books found.</p>
                ) : (<>
                  {/* Select All toggle */}
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
                    <span style={{ fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.06em', color:'var(--text-3)', fontFamily:'var(--font-ui)' }}>
                      {flushAcSelected.size} of {flushAcEntities.length} selected
                    </span>
                    <button onClick={() => {
                      if (flushAcSelected.size === flushAcEntities.length)
                        setFlushAcSelected(new Set())
                      else
                        setFlushAcSelected(new Set(flushAcEntities.map(e => e.id)))
                    }} style={{ fontSize:12, fontWeight:600, color:'#dc2626', background:'none', border:'none', cursor:'pointer', fontFamily:'var(--font-ui)', textDecoration:'underline' }}>
                      {flushAcSelected.size === flushAcEntities.length ? 'Deselect All' : 'Select All'}
                    </button>
                  </div>
                  {/* Book list */}
                  <div style={{ display:'flex', flexDirection:'column', gap:8, marginBottom:16, maxHeight:220, overflowY:'auto' }}>
                    {flushAcEntities.map(entity => {
                      const checked = flushAcSelected.has(entity.id)
                      return (
                        <label key={entity.id} style={{ display:'flex', alignItems:'center', gap:12, padding:'10px 14px', borderRadius:10, border:`2px solid ${checked ? '#fca5a5' : 'var(--card-border)'}`, background: checked ? '#fff5f5' : 'var(--table-header-bg)', cursor:'pointer', transition:'all 0.15s' }}>
                          <input type="checkbox" checked={checked} onChange={e => {
                            const next = new Set(flushAcSelected)
                            e.target.checked ? next.add(entity.id) : next.delete(entity.id)
                            setFlushAcSelected(next)
                          }} style={{ width:16, height:16, accentColor:'#dc2626', flexShrink:0 }} />
                          <div style={{ flex:1 }}>
                            <p style={{ margin:0, fontSize:13, fontWeight:700, color: checked ? '#b91c1c' : 'var(--text-1)', fontFamily:'var(--font-ui)' }}>{entity.name}</p>
                            <p style={{ margin:0, fontSize:11, color:'var(--text-3)', fontFamily:'var(--font-ui)' }}>{entity.entity_type || 'Church'}{!entity.is_active ? ' · Inactive' : ''}</p>
                          </div>
                          {checked && <span style={{ fontSize:10, fontWeight:700, color:'#dc2626', background:'#fee2e2', padding:'2px 8px', borderRadius:99, flexShrink:0, fontFamily:'var(--font-ui)' }}>WILL ERASE</span>}
                        </label>
                      )
                    })}
                  </div>
                </>)}
                <div style={{ display:'flex', gap:10 }}>
                  <button onClick={() => setFlushAcStep(1)} disabled={flushingAc}
                    style={{ flex:1, height:40, background:'var(--card-bg)', border:'1.5px solid var(--card-border)', borderRadius:8, fontSize:13, fontWeight:600, cursor:'pointer', color:'var(--text-2)', fontFamily:'var(--font-ui)' }}>
                    ← Back
                  </button>
                  <button
                    disabled={flushAcSelected.size === 0}
                    onClick={() => { setFlushAcPw(''); setFlushAcPwErr(false); setFlushAcStep(3); setTimeout(() => flushAcPwRef.current?.focus(), 80) }}
                    style={{ flex:2, height:40, background: flushAcSelected.size > 0 ? '#dc2626' : '#e5e7eb', color: flushAcSelected.size > 0 ? '#fff' : '#9ca3af', border:'none', borderRadius:8, fontSize:13, fontWeight:700, cursor: flushAcSelected.size > 0 ? 'pointer' : 'not-allowed', fontFamily:'var(--font-ui)' }}>
                    Continue → ({flushAcSelected.size} book{flushAcSelected.size !== 1 ? 's' : ''})
                  </button>
                </div>
              </div>
            </>)}

            {/* ── Step 3: Severe warning + master password ── */}
            {flushAcStep === 3 && (<>
              <div style={{ background:'#7f1d1d', padding:'16px 22px' }}>
                <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:8 }}>
                  <div style={{ background:'rgba(255,255,255,0.15)', borderRadius:8, padding:7, display:'flex' }}>
                    <AlertTriangle size={18} color="#fca5a5"/>
                  </div>
                  <div>
                    <p style={{ margin:0, fontSize:15, fontWeight:800, color:'#fff', fontFamily:'var(--font-ui)' }}>
                      Permanently erase {flushAcTarget === 'simple' ? 'Simple Accounts' : 'Advanced Accounts'}?
                    </p>
                    <p style={{ margin:0, fontSize:11, color:'#fca5a5', fontFamily:'var(--font-ui)' }}>This action is irreversible — there is no undo</p>
                  </div>
                  {!flushingAc && <button onClick={() => setShowFlushAc(false)} style={{ marginLeft:'auto', background:'rgba(255,255,255,0.15)', border:'none', borderRadius:6, padding:'4px 9px', cursor:'pointer', color:'#fff', fontSize:16, fontWeight:700 }}>×</button>}
                </div>
                <div style={{ background:'rgba(0,0,0,0.25)', borderRadius:8, padding:'10px 14px' }}>
                  {flushAcTarget === 'simple'
                    ? <p style={{ margin:0, fontSize:12, color:'#fca5a5', lineHeight:1.6, fontFamily:'var(--font-ui)' }}>All transactions, cash/bank accounts and categories will be <strong style={{color:'#fff'}}>permanently deleted</strong>. Default accounts and categories will be re-seeded. Your church members and payment records are not affected.</p>
                    : <p style={{ margin:0, fontSize:12, color:'#fca5a5', lineHeight:1.6, fontFamily:'var(--font-ui)' }}>
                        The following {flushAcSelected.size} book{flushAcSelected.size !== 1 ? 's' : ''} will be <strong style={{color:'#fff'}}>permanently deleted</strong> — all journal entries, balances and COA:{' '}
                        <strong style={{color:'#fff'}}>{flushAcEntities.filter(e => flushAcSelected.has(e.id)).map(e => e.name).join(', ')}</strong>.
                        {' '}Standard COA auto-restores when you create a new Accounting Book.
                        {flushAcSelected.size < flushAcEntities.length && <span> Other books will remain intact.</span>}
                      </p>
                  }
                </div>
              </div>
              <div style={{ padding:'20px 22px' }}>
                <p style={{ margin:'0 0 10px', fontSize:12, fontWeight:700, color:'var(--text-2)', textTransform:'uppercase', letterSpacing:'0.06em', fontFamily:'var(--font-ui)' }}>Enter master password to confirm</p>
                <MasterPasswordInput ref={flushAcPwRef} value={flushAcPw}
                  onChange={e => { setFlushAcPw(e.target.value); setFlushAcPwErr(false) }}
                  onKeyDown={e => e.key === 'Enter' && doFlushAccounts()}
                  placeholder="Master password"
                  style={{ width:'100%', boxSizing:'border-box', padding:'10px 14px', borderRadius:8, border:`2px solid ${flushAcPwErr ? '#dc2626' : 'var(--card-border)'}`, background:'var(--input-bg)', color:'var(--text-1)', fontSize:14, fontFamily:'var(--font-ui)', outline:'none', marginBottom: flushAcPwErr ? 6 : 16 }}
                />
                {flushAcPwErr && <p style={{ margin:'0 0 12px', fontSize:12, color:'#dc2626', fontWeight:600, fontFamily:'var(--font-ui)' }}>Incorrect master password. Try again.</p>}
                <div style={{ display:'flex', gap:10 }}>
                  <button onClick={() => setFlushAcStep(flushAcTarget === 'advanced' ? 2 : 1)} disabled={flushingAc}
                    style={{ flex:1, height:42, background:'var(--card-bg)', border:'1.5px solid var(--card-border)', borderRadius:8, fontSize:13, fontWeight:600, cursor:'pointer', color:'var(--text-2)', fontFamily:'var(--font-ui)' }}>
                    ← Back
                  </button>
                  <button onClick={doFlushAccounts} disabled={!flushAcPw || flushingAc}
                    style={{ flex:2, height:42, background:(flushAcPw && !flushingAc) ? '#b91c1c' : '#e5e7eb', color:(flushAcPw && !flushingAc) ? '#fff' : '#9ca3af', border:'none', borderRadius:8, fontSize:13, fontWeight:800, cursor:(flushAcPw && !flushingAc) ? 'pointer' : 'not-allowed', display:'flex', alignItems:'center', justifyContent:'center', gap:8, fontFamily:'var(--font-ui)', letterSpacing:'0.01em' }}>
                    {flushingAc ? <Loader2 size={14} className="animate-spin"/> : <Trash2 size={14}/>}
                    {flushingAc ? 'Flushing…' : flushAcTarget === 'simple' ? 'Erase Simple Accounts' : `Erase ${flushAcSelected.size} Book${flushAcSelected.size !== 1 ? 's' : ''}`}
                  </button>
                </div>
              </div>
            </>)}

          </div>
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
              <MasterPasswordInput
                ref={flushPwRef}
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

  const moveCat = async (idx, dir) => {
    const next = [...cats]
    const swapIdx = idx + dir
    if (swapIdx < 0 || swapIdx >= next.length) return
    const aOrder = next[idx].sort_order
    const bOrder = next[swapIdx].sort_order
    const a = next[idx], b = next[swapIdx]
    next[idx]     = { ...a, sort_order: bOrder }
    next[swapIdx] = { ...b, sort_order: aOrder }
    setCats(next.sort((x, y) => x.sort_order - y.sort_order))
    await Promise.all([
      reorderCategory(a.id, bOrder),
      reorderCategory(b.id, aOrder),
    ])
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
              {cats.map((c, idx) => (
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
                      {/* Up / Down reorder */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 1, flexShrink: 0 }}>
                        <button onClick={() => moveCat(idx, -1)} disabled={idx === 0}
                          title="Move up"
                          style={{ padding: '1px 4px', borderRadius: 4, border: '1px solid var(--card-border)', background: 'none', cursor: idx === 0 ? 'default' : 'pointer', color: idx === 0 ? 'var(--text-3)' : 'var(--text-2)', opacity: idx === 0 ? 0.35 : 1, lineHeight: 1 }}>
                          <ChevronUp size={11}/>
                        </button>
                        <button onClick={() => moveCat(idx, 1)} disabled={idx === cats.length - 1}
                          title="Move down"
                          style={{ padding: '1px 4px', borderRadius: 4, border: '1px solid var(--card-border)', background: 'none', cursor: idx === cats.length - 1 ? 'default' : 'pointer', color: idx === cats.length - 1 ? 'var(--text-3)' : 'var(--text-2)', opacity: idx === cats.length - 1 ? 0.35 : 1, lineHeight: 1 }}>
                          <ChevronDown size={11}/>
                        </button>
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
