import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE, createClient } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { useToast } from '../lib/toast'
import { formatDate } from '../lib/date'
import {
  Save, RotateCcw, Edit2, Power, Trash2,
  Eye, EyeOff, Loader2, Users, UserPlus,
  Phone, Mail, Calendar, CheckCircle, XCircle, Activity, Key, AlertTriangle
} from 'lucide-react'

// ---------- Constants ----------
const MAX_SLOTS = 4

const PERMS = {
  admin1: { 'Add member':true,  'Edit member':true,  'Delete member':true,  'Print / export':true,  'Import data':false, 'Manage users':false },
  admin:  { 'Add member':true,  'Edit member':true,  'Delete member':false, 'Print / export':true,  'Import data':false, 'Manage users':false },
  user:   { 'Add member':false, 'Edit member':false, 'Delete member':false, 'Print / export':true,  'Import data':false, 'Manage users':false },
  demo:   { 'Add member':true,  'Edit member':true,  'Delete member':true,  'Print / export':true,  'Import data':false, 'Manage users':false },
}

const ROLES = [
  { value:'admin1', label:'Admin1',  desc:'Full access — except user management', emoji:'👑', color:'#6366f1', bg:'#eef2ff', border:'#c7d2fe' },
  { value:'admin',  label:'Admin',   desc:'Add & edit members only',              emoji:'🛡️', color:'#059669', bg:'#ecfdf5', border:'#a7f3d0' },
  { value:'user',   label:'User',    desc:'View & print only',                    emoji:'👤', color:'#64748b', bg:'#f8fafc', border:'#e2e8f0' },
  { value:'demo',   label:'Demo',    desc:'Demo access',                          emoji:'🧪', color:'#d97706', bg:'#fffbeb', border:'#fde68a' },
]

function ini(name = '') {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase()
  return (parts[0][0] + parts[1][0]).toUpperCase()
}
function fmtDate(iso) { return iso ? formatDate(iso, '') : '' }
function roleConf(r) { return ROLES.find(x=>x.value===r) || { label:r, emoji:'?', color:'#64748b', bg:'#f8fafc', border:'#e2e8f0' } }

const cleanPhone = (raw) => (raw || '').replace(/\D/g, '')
const isValidPhone = (raw) => cleanPhone(raw).length >= 10

export default function UsersPage() {
  const { profile } = useAuth()
  const toast = useToast()
  const formRef = useRef(null)

  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [editing, setEditing] = useState(null)
  const [showPw, setShowPw] = useState(false)
  const [deactivateDialog, setDeactivateDialog] = useState(null)  // For deactivate (soft delete)
  const [permDeleteDialog, setPermDeleteDialog] = useState(null)  // For permanent delete
  const [resetDialog, setResetDialog] = useState(null)
  const [resetPassword, setResetPassword] = useState('')
  const [resetShowPw, setResetShowPw] = useState(false)
  const [resetLoading, setResetLoading] = useState(false)
  const [toggleLoading, setToggleLoading] = useState(null)
  const [deactivateLoading, setDeactivateLoading] = useState(null)
  const [permDeleteLoading, setPermDeleteLoading] = useState(false)
  const [form, setForm] = useState({ name:'', email:'', password:'', role:'', mobile:'' })
  const sf = (k,v) => setForm(f=>({...f,[k]:v}))

  const load = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .in('role', ['admin1','admin','user','demo'])
      .order('created_at', { ascending: true })
    if (error) {
      toast('Failed to load users: ' + error.message, 'error')
      console.error(error)
    } else {
      setUsers(data || [])
    }
    setLoading(false)
  }, [toast])

  useEffect(() => { load() }, [load])

  const scrollToForm = () => {
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  function startEdit(u) {
    if (u.id === profile?.id && u.role !== 'super_admin') {
      toast('You cannot edit your own role or demote yourself.', 'error')
      return
    }
    setEditing(u.id)
    setForm({ name: u.full_name || '', email: u.email || '', password: '', role: u.role || '', mobile: u.mobile || '' })
    setShowPw(false)
    scrollToForm()
  }

  function resetForm() {
    setEditing(null)
    setForm({ name:'', email:'', password:'', role:'', mobile:'' })
    setShowPw(false)
  }

  async function save() {
    if (!form.name.trim())  return toast('Full name is required.', 'error')
    if (!form.email.trim()) return toast('Email is required.', 'error')
    if (!/^\S+@\S+\.\S+$/.test(form.email)) return toast('Enter a valid email address.', 'error')
    if (form.mobile && !isValidPhone(form.mobile)) return toast('Mobile must have at least 10 digits (spaces, + allowed).', 'error')
    if (!form.role) return toast('Please select a role.', 'error')
    if (!editing && (!form.password || form.password.length < 8)) return toast('Password must be at least 8 characters.', 'error')

    setSaving(true)

    if (editing) {
      const { error } = await supabase
        .from('profiles')
        .update({ full_name: form.name, role: form.role, mobile: cleanPhone(form.mobile) || null })
        .eq('id', editing)
      if (error) {
        toast('Update failed: ' + error.message, 'error')
        setSaving(false)
        return
      }
      toast(form.name + ' updated.', 'success')
      resetForm()
      load()
      setSaving(false)
      return
    }

    // CREATE NEW USER - using temporary client to avoid session hijacking
    if (users.length >= MAX_SLOTS) {
      toast(`All ${MAX_SLOTS} slots are in use.`, 'error')
      setSaving(false)
      return
    }

    // Create a TEMPORARY client that won't affect the current session
    const tempClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false
      }
    })

    const { data: authData, error: signUpError } = await tempClient.auth.signUp({
      email: form.email,
      password: form.password,
      options: { data: { full_name: form.name } }
    })

    if (signUpError) {
      if (signUpError.message?.includes('429') || signUpError.status === 429) {
        toast('Too many requests. Please wait a moment and try again.', 'error')
      } else {
        toast('Sign up failed: ' + signUpError.message, 'error')
      }
      setSaving(false)
      return
    }

    const newUserId = authData.user?.id
    if (!newUserId) {
      toast('User creation failed – no user ID returned.', 'error')
      setSaving(false)
      return
    }

    const { error: profileError } = await supabase.from('profiles').upsert({
      id: newUserId,
      email: form.email,
      full_name: form.name,
      role: form.role,
      mobile: cleanPhone(form.mobile) || null,
      is_active: true
    }, { onConflict: 'id' })

    if (profileError) {
      toast('User created but profile not saved: ' + profileError.message, 'error')
      setSaving(false)
      return
    }

    toast(form.name + ' created successfully.', 'success')
    resetForm()
    load()
    setSaving(false)
  }

  // Deactivate user (soft delete) - sets is_active = false
  async function deactivateUser(id) {
    if (id === profile?.id) {
      toast('You cannot deactivate your own account.', 'error')
      return
    }
    setDeactivateLoading(id)
    const { error } = await supabase
      .from('profiles')
      .update({ is_active: false })
      .eq('id', id)
    setDeactivateLoading(null)
    setDeactivateDialog(null)
    if (error) {
      toast('Deactivation failed: ' + error.message, 'error')
    } else {
      toast('User deactivated. They cannot log in but their data is preserved.', 'success')
      load()
    }
  }

  // Activate user - sets is_active = true
  async function activateUser(id) {
    if (id === profile?.id) {
      toast('You cannot activate/deactivate your own account.', 'error')
      return
    }
    setToggleLoading(id)
    const { error } = await supabase
      .from('profiles')
      .update({ is_active: true })
      .eq('id', id)
    setToggleLoading(null)
    if (error) {
      toast('Activation failed: ' + error.message, 'error')
    } else {
      toast('User activated. They can now log in.', 'success')
      load()
    }
  }

  // Permanent delete – completely removes user from auth.users and profiles
  async function permanentDelete(id) {
    setPermDeleteLoading(true)
    try {
      const response = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${id}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE}`
        }
      })
      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`Auth deletion failed: ${response.status} - ${errorText}`)
      }

      await supabase.from('profiles').delete().eq('id', id)

      toast('User permanently deleted.', 'success')
      load()
    } catch (err) {
      console.error('Permanent delete error:', err)
      toast('Permanent delete failed: ' + err.message, 'error')
    } finally {
      setPermDeleteLoading(false)
      setPermDeleteDialog(null)
    }
  }

  // Reset password via Admin API
  async function resetUserPassword() {
    if (!resetPassword || resetPassword.length < 8) {
      toast('Password must be at least 8 characters.', 'error')
      return
    }
    setResetLoading(true)

    try {
      const response = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${resetDialog.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE}`
        },
        body: JSON.stringify({ password: resetPassword })
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`Auth update failed: ${response.status} - ${errorText}`)
      }

      toast(`Password for ${resetDialog.name} has been reset.`, 'success')
      setResetDialog(null)
      setResetPassword('')
    } catch (err) {
      console.error('Reset error:', err)
      toast('Reset failed: ' + err.message, 'error')
    } finally {
      setResetLoading(false)
    }
  }

  if (profile?.role !== 'super_admin') {
    return <div className="flex items-center justify-center h-64 text-slate-400 text-sm">Access denied — Super Admin only.</div>
  }

  const slotsUsed = users.length

  return (
    <div className="animate-fade-in" style={{ maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontFamily: 'var(--font-ui)', fontSize: 24, fontWeight: 800, color: 'var(--sidebar-bg)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Users size={22} style={{ color: '#2563eb' }} /> User Management
        </h1>
        <p style={{ fontSize: 13, color: '#94a3b8', marginTop: 4 }}>
          {slotsUsed} of {MAX_SLOTS} slots used
          {slotsUsed < MAX_SLOTS
            ? <span style={{ color: '#16a34a', fontWeight: 600 }}> · {MAX_SLOTS - slotsUsed} slot{MAX_SLOTS - slotsUsed !== 1 ? 's' : ''} available</span>
            : <span style={{ color: '#dc2626', fontWeight: 600 }}> · All slots in use</span>
          }
        </p>
      </div>

      {/* Slot pills */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 28 }}>
        {Array.from({ length: MAX_SLOTS }).map((_, i) => {
          const u = users[i]
          const rc = u ? roleConf(u.role) : null
          return (
            <div key={i} onClick={() => u && startEdit(u)}
              style={{
                flex: 1, padding: '12px 14px', borderRadius: 12,
                border: u ? `1.5px solid ${rc.border}` : '1.5px dashed #e2e8f0',
                background: u ? rc.bg : '#f8fafc',
                cursor: u ? 'pointer' : 'default'
              }}>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: u ? rc.color : '#cbd5e1', marginBottom: 4 }}>
                Slot {i + 1}
              </div>
              {u ? (
                <>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{u.full_name}</div>
                  <div style={{ fontSize: 11, color: rc.color, marginTop: 2 }}>{rc.emoji} {rc.label}</div>
                </>
              ) : (
                <div style={{ fontSize: 12, color: '#94a3b8' }}>— Open —</div>
              )}
            </div>
          )
        })}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '360px 1fr', gap: 24, alignItems: 'start' }}>
        {/* LEFT: Form */}
        <div ref={formRef} id="user-form" style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, overflow: 'hidden', position: 'sticky', top: 24 }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid #f1f5f9', background: editing ? 'linear-gradient(135deg,#fffbeb,#fff)' : 'linear-gradient(135deg,#eff6ff,#fff)' }}>
            <h2 style={{ fontFamily: 'var(--font-ui)', fontSize: 15, fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 8 }}>
              {editing ? <Edit2 size={15} style={{ color: '#d97706' }} /> : <UserPlus size={15} style={{ color: '#2563eb' }} />}
              {editing ? 'Edit user' : 'Add new user'}
            </h2>
            <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{editing ? 'Update details and role assignment' : 'Create a new user account'}</p>
          </div>
          <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* Full name */}
            <div>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#64748b', marginBottom: 6 }}>Full name *</label>
              <input className="field-input" value={form.name} onChange={e => sf('name', e.target.value)} placeholder="e.g. John Samuel" />
            </div>

            {/* Email */}
            <div>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#64748b', marginBottom: 6 }}>Email address *</label>
              <input type="email" className="field-input" value={form.email} onChange={e => sf('email', e.target.value)} placeholder="admin@church.org" disabled={!!editing} style={editing ? { background: '#f8fafc', color: '#94a3b8' } : {}} />
              <p style={{ fontSize: 10, color: '#94a3b8', marginTop: 2 }}>This will be their login email.</p>
            </div>

            {/* Mobile */}
            <div>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#64748b', marginBottom: 6 }}>Mobile number</label>
              <input className="field-input" value={form.mobile} onChange={e => sf('mobile', e.target.value)} placeholder="+91 99999 99999" />
              <p style={{ fontSize: 10, color: '#94a3b8', marginTop: 2 }}>At least 10 digits (spaces, + allowed)</p>
            </div>

            {/* Password (new only) */}
            {!editing && (
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#64748b', marginBottom: 6 }}>Password *</label>
                <div className="relative">
                  <input type={showPw ? 'text' : 'password'} className="field-input w-full pr-10" value={form.password} onChange={e => sf('password', e.target.value)} placeholder="Min 8 characters" />
                  <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => setShowPw(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                    {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
                <p style={{ fontSize: 10, color: '#94a3b8', marginTop: 2 }}>Min 8 characters</p>
              </div>
            )}

            {/* Role selector */}
            <div>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#64748b', marginBottom: 8 }}>Role *</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {ROLES.map(r => (
                  <label key={r.value} style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 10, cursor: 'pointer',
                    border: form.role === r.value ? `2px solid ${r.color}` : '1.5px solid #e2e8f0',
                    background: form.role === r.value ? r.bg : '#fff'
                  }}>
                    <input type="radio" name="role" value={r.value} checked={form.role === r.value} onChange={() => sf('role', r.value)} style={{ accentColor: r.color, width: 14, height: 14 }} />
                    <span style={{ fontSize: 15 }}>{r.emoji}</span>
                    <div style={{ flex: 1 }}><span style={{ fontSize: 12, fontWeight: 700, color: form.role === r.value ? r.color : '#0f172a' }}>{r.label}</span><span style={{ fontSize: 11, color: '#94a3b8', marginLeft: 6 }}>{r.desc}</span></div>
                  </label>
                ))}
              </div>
            </div>

            {/* Permissions preview */}
            {PERMS[form.role] && (
              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: '10px 14px' }}>
                <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#94a3b8', marginBottom: 8 }}>Permissions</p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 12px' }}>
                  {Object.entries(PERMS[form.role]).map(([action, allowed]) => (
                    <div key={action} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12 }}>
                      <span style={{ color: '#475569' }}>{action}</span>
                      {allowed ? <CheckCircle size={13} style={{ color: '#16a34a' }} /> : <XCircle size={13} style={{ color: '#e2e8f0' }} />}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Action buttons */}
            <div style={{ display: 'flex', gap: 8, paddingTop: 4 }}>
              <button onClick={save} disabled={saving}
                style={{
                  flex: 1, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  background: saving ? '#93c5fd' : 'linear-gradient(135deg,#2563eb,#1d4ed8)',
                  color: '#fff', border: 'none', borderRadius: 9, fontSize: 13, fontWeight: 700,
                  cursor: saving ? 'not-allowed' : 'pointer', boxShadow: '0 2px 8px rgba(37,99,235,.3)'
                }}>
                {saving ? <><Loader2 size={13} className="animate-spin" /> Saving...</> : <><Save size={13} />{editing ? ' Update user' : ' Create user'}</>}
              </button>
              <button onClick={resetForm} title="Reset"
                style={{ width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fff', border: '1.5px solid #e2e8f0', borderRadius: 9, cursor: 'pointer', color: '#64748b' }}>
                <RotateCcw size={14} />
              </button>
            </div>
          </div>
        </div>

        {/* RIGHT: User cards */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: '1rem', color: '#0f172a', fontWeight: 700 }}>Current Administrators / Users</h2>
            <span style={{ fontSize: 12, color: '#64748b' }}>{users.length} active</span>
          </div>
          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 32 }}><Loader2 size={24} className="animate-spin text-slate-300" /></div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {users.map(u => {
                const rc = roleConf(u.role)
                return (
                  <div key={u.id} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, borderLeft: `4px solid ${rc.color}` }}>
                    <div style={{ padding: 14 }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                        <div style={{ width: 46, height: 46, borderRadius: '50%', background: `linear-gradient(135deg,${rc.color},${rc.color}cc)`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 14, fontWeight: 800 }}>{ini(u.full_name)}</div>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                            <span style={{ fontSize: 15, fontWeight: 700, color: '#0f172a' }}>{u.full_name}</span>
                            <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: rc.bg, color: rc.color, border: `1px solid ${rc.border}` }}>{rc.emoji} {rc.label}</span>
                            {!u.is_active && <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca' }}>Inactive</span>}
                          </div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 16px', fontSize: 12, color: '#64748b' }}>
                            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Mail size={12} /> {u.email}</span>
                            {u.mobile && <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Phone size={12} /> {u.mobile}</span>}
                            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Calendar size={12} /> Since {fmtDate(u.created_at)}</span>
                            {u.is_active && <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#16a34a' }}><Activity size={12} /> Active</span>}
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button onClick={() => startEdit(u)} title="Edit" disabled={toggleLoading === u.id || deactivateLoading === u.id}
                            style={{ width: 30, height: 30, borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b', opacity: (toggleLoading === u.id || deactivateLoading === u.id) ? 0.5 : 1 }}>
                            <Edit2 size={13} />
                          </button>
                          <button onClick={() => setResetDialog({ id: u.id, name: u.full_name, email: u.email })} title="Reset Password"
                            style={{ width: 30, height: 30, borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b' }}>
                            <Key size={13} />
                          </button>
                          {/* Activate/Deactivate Button */}
                          {u.is_active ? (
                            <button onClick={() => setDeactivateDialog({ id: u.id, name: u.full_name })} title="Deactivate"
                              style={{ width: 30, height: 30, borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#f97316' }}>
                              <Power size={13} />
                            </button>
                          ) : (
                            <button onClick={() => activateUser(u.id)} title="Activate" disabled={toggleLoading === u.id}
                              style={{ width: 30, height: 30, borderRadius: 8, border: '1px solid #a7f3d0', background: '#ecfdf5', color: '#16a34a', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: toggleLoading === u.id ? 0.5 : 1 }}>
                              {toggleLoading === u.id ? <Loader2 size={12} className="animate-spin" /> : <Power size={13} />}
                            </button>
                          )}
                          {/* Permanent Delete Button */}
                          <button onClick={() => setPermDeleteDialog({ id: u.id, name: u.full_name })} title="Permanently Delete"
                            style={{ width: 30, height: 30, borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#dc2626' }}>
                            <AlertTriangle size={13} />
                          </button>
                        </div>
                      </div>
                      <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid #f1f5f9', display: 'flex', gap: 6 }}>
                        <button onClick={() => setResetDialog({ id: u.id, name: u.full_name, email: u.email })} className="btn-sm btn-reset" style={{ fontSize: 11, fontWeight: 600, padding: '4px 12px', borderRadius: 99, border: '1px solid #e2e8f0', background: '#f8fafc', color: '#475569', cursor: 'pointer' }}>Reset password</button>
                        {u.is_active ? (
                          <button onClick={() => setDeactivateDialog({ id: u.id, name: u.full_name })} className="btn-sm btn-warning" style={{ fontSize: 11, fontWeight: 600, padding: '4px 12px', borderRadius: 99, border: '1px solid #e2e8f0', background: '#f8fafc', color: '#f97316', cursor: 'pointer' }}>Deactivate</button>
                        ) : (
                          <button onClick={() => activateUser(u.id)} disabled={toggleLoading === u.id} style={{ fontSize: 11, fontWeight: 600, padding: '4px 12px', borderRadius: 99, border: '1px solid #e2e8f0', background: '#f8fafc', color: '#16a34a', cursor: 'pointer', opacity: toggleLoading === u.id ? 0.5 : 1 }}>Activate</button>
                        )}
                        <button onClick={() => setPermDeleteDialog({ id: u.id, name: u.full_name })} className="btn-sm btn-danger" style={{ fontSize: 11, fontWeight: 600, padding: '4px 12px', borderRadius: 99, border: '1px solid #e2e8f0', background: '#fef2f2', color: '#dc2626', cursor: 'pointer' }}>Perm Delete</button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Deactivate Dialog (Soft Delete) */}
      {deactivateDialog && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 animate-slide-up">
            <h3 className="font-display text-lg font-bold text-slate-900 mb-2">Deactivate User?</h3>
            <p className="text-sm text-slate-500 mb-5">Deactivate <strong>{deactivateDialog.name}</strong>? They will lose access immediately but their data is preserved. You can reactivate them later.</p>
            <div className="flex gap-3 justify-end">
              <button className="btn btn-secondary" onClick={() => setDeactivateDialog(null)}>Cancel</button>
              <button className="btn btn-warning" onClick={() => deactivateUser(deactivateDialog.id)} disabled={deactivateLoading === deactivateDialog.id}>
                {deactivateLoading === deactivateDialog.id ? <><Loader2 size={14} className="animate-spin" /> Deactivating...</> : 'Deactivate'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Permanent Delete Dialog */}
      {permDeleteDialog && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 animate-slide-up">
            <h3 className="font-display text-lg font-bold text-slate-900 mb-2 flex items-center gap-2"><AlertTriangle size={18} className="text-red-600" /> Permanently Delete User?</h3>
            <p className="text-sm text-slate-500 mb-5">
              Delete <strong>{permDeleteDialog.name}</strong>? This action is <strong className="text-red-600">irreversible</strong> and will remove all their data permanently.
            </p>
            <div className="flex gap-3 justify-end">
              <button className="btn btn-secondary" onClick={() => setPermDeleteDialog(null)}>Cancel</button>
              <button className="btn btn-danger" onClick={() => permanentDelete(permDeleteDialog.id)} disabled={permDeleteLoading}>
                {permDeleteLoading ? <><Loader2 size={14} className="animate-spin" /> Deleting...</> : 'Permanently Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reset Password Modal */}
      {resetDialog && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 animate-slide-up">
            <h3 className="font-display text-lg font-bold text-slate-900 mb-2 flex items-center gap-2"><Key size={18} /> Reset Password</h3>
            <p className="text-sm text-slate-500 mb-4">Set a new password for <strong>{resetDialog.name}</strong>.</p>
            <div className="mb-4">
              <label className="block text-xs font-semibold text-slate-600 mb-1">New Password (min 8 characters)</label>
              <div className="relative">
                <input type={resetShowPw ? 'text' : 'password'} className="field-input w-full pr-10" value={resetPassword} onChange={e => setResetPassword(e.target.value)} placeholder="Min 8 characters" />
                <button type="button" onClick={() => setResetShowPw(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                  {resetShowPw ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>
            <div className="flex gap-3 justify-end">
              <button className="btn btn-secondary" onClick={() => { setResetDialog(null); setResetPassword(''); }}>Cancel</button>
              <button className="btn btn-primary" onClick={resetUserPassword} disabled={resetLoading}>
                {resetLoading ? <><Loader2 size={14} className="animate-spin" /> Resetting...</> : 'Reset Password'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}