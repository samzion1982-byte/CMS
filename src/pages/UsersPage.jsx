import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE, createClient } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { useToast } from '../lib/toast'
import { formatDate } from '../lib/date'
import {
  Save, RotateCcw, Edit2, Power, Trash2,
  Eye, EyeOff, Loader2, Users, UserPlus,
  Phone, Mail, Calendar, CheckCircle, XCircle, Activity, Key, AlertTriangle,
  Shield, Sparkles,
} from 'lucide-react'
import { ASSIGNABLE_ROLES, ROLE_LABELS } from '../lib/auth'

const MAX_SLOTS = 5

const USER_PERMS_MATRIX = {
  'Add member': true,
  'Edit member': true,
  'Delete member': true,
  'Print / export': true,
  'Import data': false,
  'Manage users': false,
}

const PERMS = {
  admin1: { ...USER_PERMS_MATRIX },
  admin:  { ...USER_PERMS_MATRIX },
  user:   { ...USER_PERMS_MATRIX },
  demo:   { ...USER_PERMS_MATRIX },
  user4:  { ...USER_PERMS_MATRIX },
}

const ROLES = [
  { value: 'admin1', label: ROLE_LABELS.admin1, color: '#1d4ed8', bg: 'rgba(29,78,216,0.10)',  border: 'rgba(29,78,216,0.35)' },
  { value: 'admin',  label: ROLE_LABELS.admin,  color: '#059669', bg: 'rgba(5,150,105,0.10)',  border: 'rgba(5,150,105,0.35)' },
  { value: 'user',   label: ROLE_LABELS.user,   color: '#475569', bg: 'rgba(71,85,105,0.10)',  border: 'rgba(71,85,105,0.28)' },
  { value: 'demo',   label: ROLE_LABELS.demo,   color: '#d97706', bg: 'rgba(217,119,6,0.10)',  border: 'rgba(217,119,6,0.35)' },
  { value: 'user4',  label: ROLE_LABELS.user4,  color: '#0e7490', bg: 'rgba(14,116,144,0.10)', border: 'rgba(14,116,144,0.35)' },
]

function ini(name = '') {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase()
  return (parts[0][0] + parts[1][0]).toUpperCase()
}
function fmtDate(iso) { return iso ? formatDate(iso, '') : '' }
function roleConf(r) {
  return ROLES.find(x => x.value === r) || { label: r, color: '#64748b', bg: 'rgba(100,116,139,0.1)', border: 'rgba(100,116,139,0.3)' }
}

const cleanPhone = (raw) => (raw || '').replace(/\D/g, '')
const isValidPhone = (raw) => cleanPhone(raw).length >= 10

const labelStyle = {
  display: 'block', fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
  letterSpacing: '0.08em', color: 'var(--text-3)', marginBottom: 6,
}

const iconBtn = (color = 'var(--text-3)') => ({
  width: 34, height: 34, borderRadius: 9, border: '1.5px solid var(--card-border)',
  background: 'var(--card-bg)', cursor: 'pointer', display: 'flex',
  alignItems: 'center', justifyContent: 'center', color, transition: 'transform .12s, border-color .12s',
})

export default function UsersPage() {
  const { profile } = useAuth()
  const toast = useToast()
  const formRef = useRef(null)

  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [editing, setEditing] = useState(null)
  const [showPw, setShowPw] = useState(false)
  const [deactivateDialog, setDeactivateDialog] = useState(null)
  const [permDeleteDialog, setPermDeleteDialog] = useState(null)
  const [resetDialog, setResetDialog] = useState(null)
  const [resetPassword, setResetPassword] = useState('')
  const [resetShowPw, setResetShowPw] = useState(false)
  const [resetLoading, setResetLoading] = useState(false)
  const [toggleLoading, setToggleLoading] = useState(null)
  const [deactivateLoading, setDeactivateLoading] = useState(null)
  const [permDeleteLoading, setPermDeleteLoading] = useState(false)
  const [form, setForm] = useState({ name: '', email: '', password: '', role: '', mobile: '' })
  const sf = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const load = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .in('role', ASSIGNABLE_ROLES)
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
    setForm({ name: '', email: '', password: '', role: '', mobile: '' })
    setShowPw(false)
  }

  async function save() {
    if (!form.name.trim()) return toast('Full name is required.', 'error')
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

    if (users.length >= MAX_SLOTS) {
      toast(`All ${MAX_SLOTS} slots are in use.`, 'error')
      setSaving(false)
      return
    }

    const tempClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    })

    const { data: authData, error: signUpError } = await tempClient.auth.signUp({
      email: form.email,
      password: form.password,
      options: { data: { full_name: form.name } },
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
      is_active: true,
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

  async function deactivateUser(id) {
    if (id === profile?.id) {
      toast('You cannot deactivate your own account.', 'error')
      return
    }
    setDeactivateLoading(id)
    const { error } = await supabase.from('profiles').update({ is_active: false }).eq('id', id)
    setDeactivateLoading(null)
    setDeactivateDialog(null)
    if (error) toast('Deactivation failed: ' + error.message, 'error')
    else {
      toast('User deactivated. They cannot log in but their data is preserved.', 'success')
      load()
    }
  }

  async function activateUser(id) {
    if (id === profile?.id) {
      toast('You cannot activate/deactivate your own account.', 'error')
      return
    }
    setToggleLoading(id)
    const { error } = await supabase.from('profiles').update({ is_active: true }).eq('id', id)
    setToggleLoading(null)
    if (error) toast('Activation failed: ' + error.message, 'error')
    else {
      toast('User activated. They can now log in.', 'success')
      load()
    }
  }

  async function permanentDelete(id) {
    setPermDeleteLoading(true)
    try {
      const response = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${id}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE}`,
        },
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
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE}`,
        },
        body: JSON.stringify({ password: resetPassword }),
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
    return (
      <div className="page-container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 280 }}>
        <p style={{ color: 'var(--text-3)', fontSize: 14 }}>Access denied — Super Admin only.</p>
      </div>
    )
  }

  const slotsUsed = users.length
  const fillPct = Math.round((slotsUsed / MAX_SLOTS) * 100)
  const selectedRole = ROLES.find(r => r.value === form.role)

  return (
    <div className="page-container animate-fade-in" style={{ maxWidth: 1120 }}>
      {/* Header band */}
      <div style={{
        position: 'relative', overflow: 'hidden', borderRadius: 18, marginBottom: 22,
        background: 'linear-gradient(135deg, var(--sidebar-bg, #0d2244) 0%, color-mix(in srgb, var(--accent) 55%, #0f172a) 100%)',
        color: '#fff', padding: '22px 24px 20px',
        boxShadow: '0 12px 32px rgba(15,23,42,0.18)',
      }}>
        <div style={{
          position: 'absolute', inset: 0, pointerEvents: 'none', opacity: 0.22,
          background: 'radial-gradient(ellipse 60% 80% at 100% 0%, #fff 0%, transparent 55%)',
        }} />
        <div style={{ position: 'relative', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', opacity: 0.75, marginBottom: 8 }}>
              <Shield size={12} /> Admin · Access control
            </div>
            <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, letterSpacing: '-0.02em', display: 'flex', alignItems: 'center', gap: 10 }}>
              <Users size={24} /> User Management
            </h1>
            <p style={{ margin: '8px 0 0', fontSize: 13, opacity: 0.82, maxWidth: 420, lineHeight: 1.45 }}>
              Create and manage CMS users. Page access is controlled in CMS Permissions.
            </p>
          </div>
          <div style={{
            minWidth: 180, background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.2)',
            borderRadius: 14, padding: '12px 14px', backdropFilter: 'blur(6px)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 600, marginBottom: 8 }}>
              <span>Slots</span>
              <span>{slotsUsed} / {MAX_SLOTS}</span>
            </div>
            <div style={{ height: 8, borderRadius: 99, background: 'rgba(255,255,255,0.18)', overflow: 'hidden' }}>
              <div style={{
                height: '100%', width: `${fillPct}%`, borderRadius: 99,
                background: slotsUsed >= MAX_SLOTS
                  ? 'linear-gradient(90deg,#f97316,#ef4444)'
                  : 'linear-gradient(90deg,#34d399,#a7f3d0)',
                transition: 'width .4s ease',
              }} />
            </div>
            <p style={{ margin: '8px 0 0', fontSize: 11, opacity: 0.8 }}>
              {slotsUsed < MAX_SLOTS ? `${MAX_SLOTS - slotsUsed} available` : 'All slots filled'}
            </p>
          </div>
        </div>
      </div>

      {/* Slot strip */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: 10, marginBottom: 22,
      }} className="users-slot-grid">
        {Array.from({ length: MAX_SLOTS }).map((_, i) => {
          const u = users[i]
          const rc = u ? roleConf(u.role) : null
          const filled = !!u
          return (
            <button
              key={i}
              type="button"
              onClick={() => {
                if (u) startEdit(u)
                else { resetForm(); scrollToForm() }
              }}
              style={{
                textAlign: 'left', padding: '14px 12px', borderRadius: 14, cursor: 'pointer',
                border: filled ? `1.5px solid ${rc.border}` : '1.5px dashed var(--card-border)',
                background: filled
                  ? `linear-gradient(160deg, ${rc.bg} 0%, var(--card-bg) 70%)`
                  : 'var(--card-bg)',
                boxShadow: filled ? '0 4px 14px rgba(15,23,42,0.06)' : 'none',
                transition: 'transform .15s ease, box-shadow .15s ease',
              }}
              onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)' }}
              onMouseLeave={e => { e.currentTarget.style.transform = 'none' }}
            >
              <div style={{
                fontSize: 10, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase',
                color: filled ? rc.color : 'var(--text-3)', marginBottom: 8,
              }}>
                Slot {i + 1}
              </div>
              {filled ? (
                <>
                  <div style={{
                    width: 36, height: 36, borderRadius: 11, marginBottom: 8,
                    background: `linear-gradient(135deg, ${rc.color}, color-mix(in srgb, ${rc.color} 70%, #0f172a))`,
                    color: '#fff', fontSize: 12, fontWeight: 800,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    {ini(u.full_name)}
                  </div>
                  <div style={{
                    fontSize: 13, fontWeight: 700, color: 'var(--text-1)',
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  }}>
                    {u.full_name}
                  </div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: rc.color, marginTop: 3 }}>{rc.label}</div>
                </>
              ) : (
                <div className="users-open-pulse" style={{ display: 'flex', flexDirection: 'column', gap: 6, color: 'var(--text-3)' }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: 11, border: '1.5px dashed var(--card-border)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <UserPlus size={15} />
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 600 }}>Open slot</span>
                </div>
              )}
            </button>
          )
        })}
      </div>

      <div className="users-layout" style={{ display: 'grid', gridTemplateColumns: 'minmax(300px, 380px) 1fr', gap: 22, alignItems: 'start' }}>
        {/* Form */}
        <div
          ref={formRef}
          style={{
            background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: 18,
            overflow: 'hidden', position: 'sticky', top: 20,
            boxShadow: '0 8px 28px rgba(15,23,42,0.06)',
          }}
        >
          <div style={{
            padding: '16px 18px',
            borderBottom: '1px solid var(--card-border)',
            background: editing
              ? 'linear-gradient(120deg, color-mix(in srgb, #d97706 14%, var(--card-bg)), var(--card-bg))'
              : 'linear-gradient(120deg, var(--accent-subtle), var(--card-bg))',
          }}>
            <h2 style={{
              margin: 0, fontSize: 15, fontWeight: 800, color: 'var(--text-1)',
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              {editing
                ? <Edit2 size={15} style={{ color: '#d97706' }} />
                : <UserPlus size={15} style={{ color: 'var(--accent)' }} />}
              {editing ? 'Edit user' : 'Add new user'}
            </h2>
            <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-3)' }}>
              {editing ? 'Update details and role' : 'Fill details to create a login'}
            </p>
          </div>

          <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 13 }}>
            <div>
              <label style={labelStyle}>Full name *</label>
              <input className="field-input" value={form.name} onChange={e => sf('name', e.target.value)} placeholder="e.g. John Samuel" />
            </div>
            <div>
              <label style={labelStyle}>Email address *</label>
              <input
                type="email" className="field-input" value={form.email}
                onChange={e => sf('email', e.target.value)} placeholder="admin@church.org"
                disabled={!!editing}
                style={editing ? { background: 'var(--page-bg)', color: 'var(--text-3)' } : {}}
              />
            </div>
            <div>
              <label style={labelStyle}>Mobile number</label>
              <input className="field-input" value={form.mobile} onChange={e => sf('mobile', e.target.value)} placeholder="+91 99999 99999" />
            </div>

            {!editing && (
              <div>
                <label style={labelStyle}>Password *</label>
                <div style={{ position: 'relative' }}>
                  <input
                    type={showPw ? 'text' : 'password'} className="field-input"
                    value={form.password} onChange={e => sf('password', e.target.value)}
                    placeholder="Min 8 characters" style={{ paddingRight: 40 }}
                  />
                  <button
                    type="button"
                    onMouseDown={e => e.preventDefault()}
                    onClick={() => setShowPw(v => !v)}
                    style={{
                      position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                      background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', display: 'flex',
                    }}
                  >
                    {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </div>
            )}

            <div>
              <label style={labelStyle}>Role *</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {ROLES.map((r, i) => {
                  const on = form.role === r.value
                  const lastOdd = i === ROLES.length - 1 && ROLES.length % 2 === 1
                  return (
                    <button
                      key={r.value}
                      type="button"
                      onClick={() => sf('role', r.value)}
                      style={{
                        padding: '10px 10px', borderRadius: 11, cursor: 'pointer', textAlign: 'left',
                        border: on ? `2px solid ${r.color}` : '1.5px solid var(--card-border)',
                        background: on ? r.bg : 'var(--card-bg)',
                        boxShadow: on ? `0 0 0 3px color-mix(in srgb, ${r.color} 18%, transparent)` : 'none',
                        transition: 'border-color .12s, box-shadow .12s, transform .12s',
                        gridColumn: lastOdd ? '1 / -1' : undefined,
                        transform: on ? 'translateY(-1px)' : 'none',
                      }}
                    >
                      <div style={{ fontSize: 13, fontWeight: 800, color: on ? r.color : 'var(--text-1)' }}>{r.label}</div>
                    </button>
                  )
                })}
              </div>
            </div>

            {PERMS[form.role] && (
              <div style={{
                borderRadius: 12, padding: '12px 12px',
                background: 'var(--page-bg)', border: '1px solid var(--card-border)',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                  <Sparkles size={12} style={{ color: selectedRole?.color || 'var(--accent)' }} />
                  <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-3)' }}>
                    Actions · {selectedRole?.label}
                  </span>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {Object.entries(PERMS[form.role]).map(([action, allowed]) => (
                    <span key={action} style={{
                      fontSize: 11, fontWeight: 600, padding: '4px 8px', borderRadius: 99,
                      display: 'inline-flex', alignItems: 'center', gap: 4,
                      background: allowed ? 'color-mix(in srgb, #16a34a 12%, var(--card-bg))' : 'var(--card-bg)',
                      color: allowed ? '#15803d' : 'var(--text-3)',
                      border: `1px solid ${allowed ? 'rgba(22,163,74,0.25)' : 'var(--card-border)'}`,
                    }}>
                      {allowed ? <CheckCircle size={11} /> : <XCircle size={11} />}
                      {action}
                    </span>
                  ))}
                </div>
                <p style={{ margin: '8px 0 0', fontSize: 11, color: 'var(--text-3)', lineHeight: 1.4 }}>
                  Pages are granted in CMS Permissions.
                </p>
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, paddingTop: 2 }}>
              <button
                type="button" onClick={save} disabled={saving}
                style={{
                  flex: 1, height: 42, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                  background: saving ? 'color-mix(in srgb, var(--accent) 55%, #94a3b8)' : 'var(--accent)',
                  color: 'var(--accent-text, #fff)', border: 'none', borderRadius: 11,
                  fontSize: 13, fontWeight: 700, cursor: saving ? 'wait' : 'pointer',
                  boxShadow: '0 6px 16px var(--accent-ring)',
                }}
              >
                {saving
                  ? <><Loader2 size={14} className="animate-spin" /> Saving…</>
                  : <><Save size={14} />{editing ? ' Update user' : ' Create user'}</>}
              </button>
              <button
                type="button" onClick={resetForm} title="Clear form"
                style={{ ...iconBtn(), width: 42, height: 42 }}
              >
                <RotateCcw size={15} />
              </button>
            </div>
          </div>
        </div>

        {/* User list */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <h2 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: 'var(--text-1)' }}>
              Current users
            </h2>
            <span style={{
              fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 99,
              background: 'var(--accent-subtle)', color: 'var(--accent)',
            }}>
              {users.filter(u => u.is_active !== false).length} active
            </span>
          </div>

          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
              <Loader2 size={24} className="animate-spin" style={{ color: 'var(--text-3)' }} />
            </div>
          ) : users.length === 0 ? (
            <div style={{
              padding: '40px 24px', textAlign: 'center', borderRadius: 16,
              border: '1.5px dashed var(--card-border)', background: 'var(--card-bg)',
            }}>
              <UserPlus size={28} style={{ color: 'var(--text-3)', marginBottom: 10 }} />
              <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--text-1)' }}>No users yet</p>
              <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--text-3)' }}>Add the first user using the form.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {users.map((u, idx) => {
                const rc = roleConf(u.role)
                const busy = toggleLoading === u.id || deactivateLoading === u.id
                return (
                  <div
                    key={u.id}
                    style={{
                      background: 'var(--card-bg)', border: '1px solid var(--card-border)',
                      borderRadius: 16, overflow: 'hidden',
                      boxShadow: '0 4px 16px rgba(15,23,42,0.04)',
                      animation: `usersCardIn .35s ease ${idx * 0.04}s both`,
                    }}
                  >
                    <div style={{ height: 3, background: `linear-gradient(90deg, ${rc.color}, transparent)` }} />
                    <div style={{ padding: '14px 16px' }}>
                      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                        <div style={{
                          width: 48, height: 48, borderRadius: 14, flexShrink: 0,
                          background: `linear-gradient(145deg, ${rc.color}, color-mix(in srgb, ${rc.color} 65%, #0f172a))`,
                          color: '#fff', fontSize: 14, fontWeight: 800,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          boxShadow: `0 6px 14px color-mix(in srgb, ${rc.color} 35%, transparent)`,
                        }}>
                          {ini(u.full_name)}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 5 }}>
                            <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--text-1)' }}>{u.full_name}</span>
                            <span style={{
                              fontSize: 10, fontWeight: 800, padding: '3px 9px', borderRadius: 99,
                              background: rc.bg, color: rc.color, border: `1px solid ${rc.border}`,
                            }}>
                              {rc.label}
                            </span>
                            {u.is_active === false && (
                              <span style={{
                                fontSize: 10, fontWeight: 800, padding: '3px 9px', borderRadius: 99,
                                background: 'color-mix(in srgb, #dc2626 12%, var(--card-bg))',
                                color: '#dc2626',
                                border: '1px solid color-mix(in srgb, #dc2626 28%, var(--card-border))',
                              }}>
                                Inactive
                              </span>
                            )}
                          </div>
                          <div style={{
                            display: 'flex', flexWrap: 'wrap', gap: '6px 14px',
                            fontSize: 12, color: 'var(--text-3)',
                          }}>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Mail size={12} /> {u.email}</span>
                            {u.mobile && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Phone size={12} /> {u.mobile}</span>}
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Calendar size={12} /> {fmtDate(u.created_at)}</span>
                            {u.is_active !== false && (
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#16a34a', fontWeight: 600 }}>
                                <Activity size={12} /> Active
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div style={{
                        marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--card-border)',
                        display: 'flex', flexWrap: 'wrap', gap: 8,
                      }}>
                        <button type="button" onClick={() => startEdit(u)} disabled={busy} style={actionChip('var(--text-2)')}>
                          <Edit2 size={12} /> Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => setResetDialog({ id: u.id, name: u.full_name, email: u.email })}
                          style={actionChip('var(--text-2)')}
                        >
                          <Key size={12} /> Reset password
                        </button>
                        {u.is_active !== false ? (
                          <button
                            type="button"
                            onClick={() => setDeactivateDialog({ id: u.id, name: u.full_name })}
                            style={actionChip('#c2410c')}
                          >
                            <Power size={12} /> Deactivate
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => activateUser(u.id)}
                            disabled={toggleLoading === u.id}
                            style={actionChip('#15803d')}
                          >
                            {toggleLoading === u.id ? <Loader2 size={12} className="animate-spin" /> : <Power size={12} />}
                            Activate
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setPermDeleteDialog({ id: u.id, name: u.full_name })}
                          style={actionChip('#b91c1c', true)}
                        >
                          <Trash2 size={12} /> Delete
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Dialogs */}
      {deactivateDialog && (
        <ModalShell onClose={() => setDeactivateDialog(null)}>
          <h3 style={modalTitle}>Deactivate user?</h3>
          <p style={modalBody}>
            Deactivate <strong>{deactivateDialog.name}</strong>? They lose access immediately; data is kept so you can reactivate later.
          </p>
          <div style={modalActions}>
            <button type="button" className="btn btn-secondary" onClick={() => setDeactivateDialog(null)}>Cancel</button>
            <button
              type="button" className="btn btn-warning"
              onClick={() => deactivateUser(deactivateDialog.id)}
              disabled={deactivateLoading === deactivateDialog.id}
            >
              {deactivateLoading === deactivateDialog.id
                ? <><Loader2 size={14} className="animate-spin" /> Deactivating…</>
                : 'Deactivate'}
            </button>
          </div>
        </ModalShell>
      )}

      {permDeleteDialog && (
        <ModalShell onClose={() => setPermDeleteDialog(null)}>
          <h3 style={{ ...modalTitle, display: 'flex', alignItems: 'center', gap: 8 }}>
            <AlertTriangle size={18} style={{ color: '#dc2626' }} /> Permanently delete?
          </h3>
          <p style={modalBody}>
            Delete <strong>{permDeleteDialog.name}</strong>? This is <strong style={{ color: '#dc2626' }}>irreversible</strong>.
          </p>
          <div style={modalActions}>
            <button type="button" className="btn btn-secondary" onClick={() => setPermDeleteDialog(null)}>Cancel</button>
            <button
              type="button" className="btn btn-danger"
              onClick={() => permanentDelete(permDeleteDialog.id)}
              disabled={permDeleteLoading}
            >
              {permDeleteLoading
                ? <><Loader2 size={14} className="animate-spin" /> Deleting…</>
                : 'Permanently delete'}
            </button>
          </div>
        </ModalShell>
      )}

      {resetDialog && (
        <ModalShell onClose={() => { setResetDialog(null); setResetPassword('') }}>
          <h3 style={{ ...modalTitle, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Key size={18} /> Reset password
          </h3>
          <p style={modalBody}>Set a new password for <strong>{resetDialog.name}</strong>.</p>
          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>New password</label>
            <div style={{ position: 'relative' }}>
              <input
                type={resetShowPw ? 'text' : 'password'} className="field-input"
                value={resetPassword} onChange={e => setResetPassword(e.target.value)}
                placeholder="Min 8 characters" style={{ paddingRight: 40 }}
              />
              <button
                type="button" onClick={() => setResetShowPw(v => !v)}
                style={{
                  position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                  background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', display: 'flex',
                }}
              >
                {resetShowPw ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
          </div>
          <div style={modalActions}>
            <button type="button" className="btn btn-secondary" onClick={() => { setResetDialog(null); setResetPassword('') }}>Cancel</button>
            <button type="button" className="btn btn-primary" onClick={resetUserPassword} disabled={resetLoading}>
              {resetLoading
                ? <><Loader2 size={14} className="animate-spin" /> Resetting…</>
                : 'Reset password'}
            </button>
          </div>
        </ModalShell>
      )}

      <style>{`
        @keyframes usersCardIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: none; }
        }
        @keyframes usersSlotPulse {
          0%, 100% { opacity: 0.55; }
          50% { opacity: 1; }
        }
        .users-slot-grid button:not(:hover) .users-open-pulse {
          animation: usersSlotPulse 2.2s ease-in-out infinite;
        }
        @media (max-width: 900px) {
          .users-layout { grid-template-columns: 1fr !important; }
          .users-slot-grid { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; }
        }
        @media (max-width: 520px) {
          .users-slot-grid { grid-template-columns: 1fr 1fr !important; }
        }
      `}</style>
    </div>
  )
}

function actionChip(color, danger = false) {
  return {
    display: 'inline-flex', alignItems: 'center', gap: 5,
    fontSize: 11, fontWeight: 700, padding: '6px 11px', borderRadius: 9,
    border: `1px solid ${danger ? 'color-mix(in srgb, #dc2626 28%, var(--card-border))' : 'var(--card-border)'}`,
    background: danger ? 'color-mix(in srgb, #dc2626 10%, var(--card-bg))' : 'var(--page-bg)',
    color, cursor: 'pointer',
  }
}

const modalTitle = { margin: '0 0 8px', fontSize: 17, fontWeight: 800, color: 'var(--text-1)' }
const modalBody = { margin: '0 0 18px', fontSize: 13, color: 'var(--text-3)', lineHeight: 1.5 }
const modalActions = { display: 'flex', gap: 10, justifyContent: 'flex-end' }

function ModalShell({ children, onClose }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(15,23,42,0.55)', backdropFilter: 'blur(4px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose?.() }}
    >
      <div style={{
        background: 'var(--card-bg)', borderRadius: 18, width: '100%', maxWidth: 400,
        padding: 22, border: '1px solid var(--card-border)',
        boxShadow: '0 24px 60px rgba(0,0,0,0.28)',
      }}>
        {children}
      </div>
    </div>
  )
}
