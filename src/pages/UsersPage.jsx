import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE, createClient } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { useToast } from '../lib/toast'
import { formatDate } from '../lib/date'
import {
  Save, RotateCcw, Edit2, Power, Trash2,
  Eye, EyeOff, Loader2, Users, UserPlus,
  Phone, Mail, Calendar, CheckCircle, XCircle, Activity, Key, AlertTriangle, Copy,
} from 'lucide-react'
import { ASSIGNABLE_ROLES, ROLE_LABELS } from '../lib/auth'

async function upsertStoredPassword(userId, password) {
  if (!userId || !password) return
  const { error } = await supabase.from('cms_user_passwords').upsert({
    user_id: userId,
    password,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id' })
  if (error) throw error
}

async function deleteStoredPassword(userId) {
  await supabase.from('cms_user_passwords').delete().eq('user_id', userId)
}

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
  { value: 'admin1', label: ROLE_LABELS.admin1, emoji: '👑', color: '#1d4ed8', bg: 'rgba(29,78,216,0.12)', border: 'rgba(29,78,216,0.38)' },
  { value: 'admin',  label: ROLE_LABELS.admin,  emoji: '🛡️', color: '#059669', bg: 'rgba(5,150,105,0.12)', border: 'rgba(5,150,105,0.38)' },
  { value: 'user',   label: ROLE_LABELS.user,   emoji: '👤', color: '#475569', bg: 'rgba(71,85,105,0.10)', border: 'rgba(71,85,105,0.30)' },
  { value: 'demo',   label: ROLE_LABELS.demo,   emoji: '🧪', color: '#d97706', bg: 'rgba(217,119,6,0.12)', border: 'rgba(217,119,6,0.38)' },
  { value: 'user4',  label: ROLE_LABELS.user4,  emoji: '👥', color: '#0e7490', bg: 'rgba(14,116,144,0.12)', border: 'rgba(14,116,144,0.38)' },
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
  return ROLES.find(x => x.value === r) || { label: r, emoji: '?', color: '#64748b', bg: 'rgba(100,116,139,0.1)', border: 'rgba(100,116,139,0.3)' }
}

const cleanPhone = (raw) => (raw || '').replace(/\D/g, '')
const isValidPhone = (raw) => cleanPhone(raw).length >= 10

const labelStyle = {
  display: 'block', fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
  letterSpacing: '0.08em', color: 'var(--text-3)', marginBottom: 6,
}

export default function UsersPage() {
  const { profile } = useAuth()
  const toast = useToast()
  const formRef = useRef(null)

  const [users, setUsers] = useState([])
  const [passwords, setPasswords] = useState({})
  const [vaultReady, setVaultReady] = useState(true)
  const [revealed, setRevealed] = useState({})
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

    const { data: pwRows, error: pwErr } = await supabase
      .from('cms_user_passwords')
      .select('user_id, password')
    if (pwErr) {
      console.error(pwErr)
      setVaultReady(false)
      setPasswords({})
      if (pwErr.message?.includes('cms_user_passwords') || pwErr.code === '42P01') {
        toast('Password vault missing — run the cms_user_passwords SQL migration in Supabase.', 'error')
      }
    } else {
      setVaultReady(true)
      const map = {}
      for (const row of pwRows || []) map[row.user_id] = row.password
      setPasswords(map)
    }
    setLoading(false)
  }, [toast])

  async function copyText(text, label = 'Copied') {
    if (!text) return
    try {
      await navigator.clipboard.writeText(text)
      toast(label, 'success')
    } catch {
      toast('Could not copy to clipboard.', 'error')
    }
  }

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

  function openCreateFromSlot() {
    resetForm()
    scrollToForm()
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

    try {
      await upsertStoredPassword(newUserId, form.password)
    } catch (e) {
      toast(
        e.message?.includes('cms_user_passwords')
          ? 'User created, but password vault is missing — run the SQL migration.'
          : 'User created, but password could not be stored for viewing.',
        'error'
      )
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
      await deleteStoredPassword(id)
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
      try {
        await upsertStoredPassword(resetDialog.id, resetPassword)
      } catch {
        toast('Password reset in Auth, but vault update failed. Run the SQL migration if needed.', 'error')
      }
      toast(`Password for ${resetDialog.name} has been reset.`, 'success')
      setResetDialog(null)
      setResetPassword('')
      load()
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

  return (
    <div className="page-container animate-fade-in users-page" style={{ maxWidth: 1120 }}>
      {/* Header */}
      <div style={{
        position: 'relative', overflow: 'hidden', borderRadius: 18, marginBottom: 20,
        padding: '20px 22px',
        background: 'linear-gradient(125deg, var(--sidebar-bg, #0d2244) 0%, color-mix(in srgb, var(--accent) 45%, #0f172a) 100%)',
        color: '#fff',
        boxShadow: '0 14px 36px rgba(15,23,42,0.16)',
      }}>
        <div style={{
          position: 'absolute', inset: 0, pointerEvents: 'none',
          background: 'radial-gradient(ellipse 70% 90% at 100% -10%, rgba(255,255,255,0.22), transparent 55%)',
        }} />
        <div style={{
          position: 'absolute', width: 180, height: 180, borderRadius: '50%',
          right: -40, bottom: -70, background: 'rgba(255,255,255,0.06)', pointerEvents: 'none',
        }} />
        <div style={{ position: 'relative', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <h1 style={{
              margin: 0, fontSize: 26, fontWeight: 800, letterSpacing: '-0.02em',
              display: 'flex', alignItems: 'center', gap: 10,
            }}>
              <Users size={24} /> User Management
            </h1>
            <p style={{ margin: '8px 0 0', fontSize: 13, opacity: 0.82, maxWidth: 420, lineHeight: 1.45 }}>
              Manage CMS logins, roles, and passwords
            </p>
          </div>
          <div style={{
            minWidth: 168, padding: '11px 13px', borderRadius: 14,
            background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.2)',
            backdropFilter: 'blur(6px)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 700, marginBottom: 8 }}>
              <span style={{ opacity: 0.85 }}>Slots</span>
              <span>{slotsUsed} / {MAX_SLOTS}</span>
            </div>
            <div style={{ height: 7, borderRadius: 99, background: 'rgba(255,255,255,0.18)', overflow: 'hidden' }}>
              <div style={{
                height: '100%', width: `${fillPct}%`, borderRadius: 99,
                background: slotsUsed >= MAX_SLOTS
                  ? 'linear-gradient(90deg,#f97316,#ef4444)'
                  : 'linear-gradient(90deg,#34d399,#6ee7b7)',
                transition: 'width .45s ease',
                boxShadow: '0 0 12px rgba(52,211,153,0.45)',
              }} />
            </div>
            <p style={{ margin: '7px 0 0', fontSize: 11, opacity: 0.8 }}>
              {slotsUsed < MAX_SLOTS ? `${MAX_SLOTS - slotsUsed} available` : 'All slots filled'}
            </p>
          </div>
        </div>
      </div>

      {/* Slot tiles */}
      <div className="users-slot-grid" style={{
        display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: 12, marginBottom: 22,
      }}>
        {Array.from({ length: MAX_SLOTS }).map((_, i) => {
          const u = users[i]
          const rc = u ? roleConf(u.role) : null
          const filled = !!u
          return (
            <button
              key={i}
              type="button"
              className={filled ? 'users-slot filled' : 'users-slot open'}
              onClick={() => (filled ? startEdit(u) : openCreateFromSlot())}
              style={{
                position: 'relative', overflow: 'hidden', textAlign: 'left',
                padding: '14px 13px 13px', borderRadius: 16, cursor: 'pointer',
                border: filled ? `1.5px solid ${rc.border}` : '1.5px dashed var(--card-border)',
                background: filled
                  ? `linear-gradient(155deg, ${rc.bg} 0%, var(--card-bg) 72%)`
                  : 'var(--card-bg)',
                boxShadow: filled
                  ? `0 8px 22px color-mix(in srgb, ${rc.color} 18%, transparent)`
                  : '0 2px 8px rgba(15,23,42,0.04)',
                animation: `usersSlotIn .4s ease ${i * 0.05}s both`,
                transition: 'transform .18s ease, box-shadow .18s ease, border-color .18s ease',
              }}
            >
              {filled && (
                <>
                  <div style={{
                    position: 'absolute', top: 0, left: 0, right: 0, height: 3,
                    background: `linear-gradient(90deg, ${rc.color}, transparent)`,
                  }} />
                  <div className="users-slot-shine" style={{
                    position: 'absolute', inset: 0, pointerEvents: 'none',
                    background: 'linear-gradient(115deg, transparent 35%, rgba(255,255,255,0.22) 50%, transparent 65%)',
                    transform: 'translateX(-120%)',
                  }} />
                </>
              )}
              <div style={{
                fontSize: 10, fontWeight: 800, letterSpacing: '0.11em', textTransform: 'uppercase',
                color: filled ? rc.color : 'var(--text-3)', marginBottom: 10,
              }}>
                Slot {i + 1}
              </div>
              {filled ? (
                <>
                  <div style={{
                    width: 38, height: 38, borderRadius: 12, marginBottom: 9,
                    background: `linear-gradient(145deg, ${rc.color}, color-mix(in srgb, ${rc.color} 65%, #0f172a))`,
                    color: '#fff', fontSize: 12, fontWeight: 800,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    boxShadow: `0 6px 14px color-mix(in srgb, ${rc.color} 35%, transparent)`,
                  }}>
                    {ini(u.full_name)}
                  </div>
                  <div style={{
                    fontSize: 13, fontWeight: 800, color: 'var(--text-1)',
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  }}>
                    {u.full_name}
                  </div>
                  <div style={{
                    marginTop: 4, fontSize: 11, fontWeight: 700, color: rc.color,
                    display: 'flex', alignItems: 'center', gap: 4,
                  }}>
                    <span>{rc.emoji}</span> {rc.label}
                    {u.is_active === false && (
                      <span style={{ color: 'var(--danger)', fontWeight: 700 }}>· Off</span>
                    )}
                  </div>
                </>
              ) : (
                <div className="users-open-pulse" style={{ color: 'var(--text-3)' }}>
                  <div style={{
                    width: 38, height: 38, borderRadius: 12, marginBottom: 9,
                    border: '1.5px dashed var(--card-border)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: 'var(--page-bg)',
                  }}>
                    <UserPlus size={15} />
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>Open slot</div>
                  <div style={{ fontSize: 11, marginTop: 3, opacity: 0.85 }}>Tap to add user</div>
                </div>
              )}
            </button>
          )
        })}
      </div>

      <div className="users-layout" style={{
        display: 'grid', gridTemplateColumns: 'minmax(300px, 370px) 1fr', gap: 22, alignItems: 'start',
      }}>
        {/* Form */}
        <div
          ref={formRef}
          style={{
            background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: 18,
            overflow: 'hidden', position: 'sticky', top: 20,
            boxShadow: '0 10px 30px rgba(15,23,42,0.07)',
          }}
        >
          <div style={{
            padding: '16px 18px',
            borderBottom: '1px solid var(--card-border)',
            background: editing
              ? 'linear-gradient(120deg, color-mix(in srgb, #d97706 16%, var(--card-bg)), var(--card-bg))'
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
              {editing ? 'Update details and role assignment' : 'Create a new user account'}
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
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                {ROLES.map(r => {
                  const on = form.role === r.value
                  return (
                    <label
                      key={r.value}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
                        borderRadius: 12, cursor: 'pointer',
                        border: on ? `2px solid ${r.color}` : '1.5px solid var(--card-border)',
                        background: on ? r.bg : 'var(--card-bg)',
                        boxShadow: on ? `0 0 0 3px color-mix(in srgb, ${r.color} 16%, transparent)` : 'none',
                        transition: 'border-color .12s, box-shadow .12s, transform .12s',
                        transform: on ? 'translateX(2px)' : 'none',
                      }}
                    >
                      <input
                        type="radio" name="role" value={r.value} checked={on}
                        onChange={() => sf('role', r.value)}
                        style={{ accentColor: r.color, width: 14, height: 14 }}
                      />
                      <span style={{ fontSize: 15 }}>{r.emoji}</span>
                      <span style={{ fontSize: 13, fontWeight: 800, color: on ? r.color : 'var(--text-1)' }}>{r.label}</span>
                    </label>
                  )
                })}
              </div>
            </div>

            {PERMS[form.role] && (
              <div style={{
                background: 'var(--page-bg)', border: '1px solid var(--card-border)',
                borderRadius: 12, padding: '12px 12px',
              }}>
                <p style={{
                  fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em',
                  color: 'var(--text-3)', margin: '0 0 8px',
                }}>
                  Permissions
                </p>
                <p style={{ fontSize: 11, color: 'var(--text-3)', margin: '0 0 8px', lineHeight: 1.4 }}>
                  Pages are granted in <strong>CMS Permissions</strong>.
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 12px' }}>
                  {Object.entries(PERMS[form.role]).map(([action, allowed]) => (
                    <div key={action} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12 }}>
                      <span style={{ color: 'var(--text-2)' }}>{action}</span>
                      {allowed
                        ? <CheckCircle size={13} style={{ color: 'var(--success)' }} />
                        : <XCircle size={13} style={{ color: 'var(--card-border)' }} />}
                    </div>
                  ))}
                </div>
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
                  boxShadow: '0 8px 18px var(--accent-ring)',
                }}
              >
                {saving
                  ? <><Loader2 size={14} className="animate-spin" /> Saving…</>
                  : <><Save size={14} />{editing ? ' Update user' : ' Create user'}</>}
              </button>
              <button
                type="button" onClick={resetForm} title="Clear form"
                style={{
                  width: 42, height: 42, borderRadius: 11, border: '1.5px solid var(--card-border)',
                  background: 'var(--card-bg)', cursor: 'pointer', color: 'var(--text-3)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                <RotateCcw size={15} />
              </button>
            </div>
          </div>
        </div>

        {/* User cards */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <h2 style={{
              margin: 0, fontSize: 16, fontWeight: 800, color: 'var(--text-1)',
              fontFamily: 'var(--font-display, var(--font-ui))',
            }}>
              Current Administrators / Users
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
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {users.map((u, idx) => {
                const rc = roleConf(u.role)
                const busy = toggleLoading === u.id || deactivateLoading === u.id
                return (
                  <div
                    key={u.id}
                    style={{
                      background: 'var(--card-bg)',
                      border: '1px solid var(--card-border)',
                      borderRadius: 16,
                      overflow: 'hidden',
                      boxShadow: '0 6px 20px rgba(15,23,42,0.05)',
                      animation: `usersCardIn .35s ease ${idx * 0.05}s both`,
                      transition: 'transform .15s ease, box-shadow .15s ease',
                    }}
                    className="users-card"
                  >
                    <div style={{ display: 'flex' }}>
                      <div style={{
                        width: 5, flexShrink: 0,
                        background: `linear-gradient(180deg, ${rc.color}, color-mix(in srgb, ${rc.color} 40%, transparent))`,
                      }} />
                      <div style={{ flex: 1, padding: '15px 16px' }}>
                        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                          <div style={{
                            width: 48, height: 48, borderRadius: 14, flexShrink: 0,
                            background: `linear-gradient(145deg, ${rc.color}, color-mix(in srgb, ${rc.color} 65%, #0f172a))`,
                            color: '#fff', fontSize: 14, fontWeight: 800,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            boxShadow: `0 8px 16px color-mix(in srgb, ${rc.color} 32%, transparent)`,
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
                                {rc.emoji} {rc.label}
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
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Calendar size={12} /> Since {fmtDate(u.created_at)}</span>
                              {u.is_active !== false && (
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--success)', fontWeight: 600 }}>
                                  <Activity size={12} /> Active
                                </span>
                              )}
                            </div>

                            {/* Password */}
                            <div style={{
                              marginTop: 10, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
                              padding: '8px 10px', borderRadius: 10,
                              background: 'var(--page-bg)', border: '1px solid var(--card-border)',
                            }}>
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--text-3)', fontWeight: 600 }}>
                                <Key size={12} /> Password
                              </span>
                              {passwords[u.id] ? (
                                <>
                                  <code style={{
                                    fontSize: 12, fontWeight: 700, color: 'var(--text-1)',
                                    letterSpacing: revealed[u.id] ? '0.02em' : '0.12em',
                                    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                                  }}>
                                    {revealed[u.id] ? passwords[u.id] : '••••••••'}
                                  </code>
                                  <button
                                    type="button"
                                    title={revealed[u.id] ? 'Hide' : 'Show'}
                                    onClick={() => setRevealed(r => ({ ...r, [u.id]: !r[u.id] }))}
                                    style={miniBtn}
                                  >
                                    {revealed[u.id] ? <EyeOff size={12} /> : <Eye size={12} />}
                                  </button>
                                  <button
                                    type="button"
                                    title="Copy password"
                                    onClick={() => copyText(passwords[u.id], 'Password copied')}
                                    style={miniBtn}
                                  >
                                    <Copy size={12} />
                                  </button>
                                </>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => setResetDialog({ id: u.id, name: u.full_name, email: u.email })}
                                  style={{
                                    fontSize: 11, fontWeight: 700, color: 'var(--warning)',
                                    background: 'var(--warning-subtle)',
                                    border: '1px solid color-mix(in srgb, var(--warning) 35%, var(--card-border))',
                                    borderRadius: 7, padding: '3px 8px', cursor: 'pointer',
                                  }}
                                  title={vaultReady ? 'No password recorded yet — reset to store one' : 'Password vault missing — run SQL migration'}
                                >
                                  Not recorded · Reset to set
                                </button>
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
                            <Trash2 size={12} /> Perm Delete
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

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
            <AlertTriangle size={18} style={{ color: 'var(--danger)' }} /> Permanently delete?
          </h3>
          <p style={modalBody}>
            Delete <strong>{permDeleteDialog.name}</strong>? This is <strong style={{ color: 'var(--danger)' }}>irreversible</strong>.
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
          <p style={modalBody}>
            Set a new password for <strong>{resetDialog.name}</strong>. It will be stored so you can view it on their card.
          </p>
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
        @keyframes usersSlotIn {
          from { opacity: 0; transform: translateY(10px) scale(0.98); }
          to { opacity: 1; transform: none; }
        }
        @keyframes usersCardIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: none; }
        }
        @keyframes usersOpenPulse {
          0%, 100% { opacity: 0.65; }
          50% { opacity: 1; }
        }
        @keyframes usersShine {
          0% { transform: translateX(-120%); }
          55%, 100% { transform: translateX(120%); }
        }
        .users-slot:hover {
          transform: translateY(-3px) !important;
        }
        .users-slot.filled:hover {
          box-shadow: 0 14px 28px rgba(15,23,42,0.12) !important;
        }
        .users-slot.filled:hover .users-slot-shine {
          animation: usersShine 1.1s ease;
        }
        .users-slot.open .users-open-pulse {
          animation: usersOpenPulse 2.2s ease-in-out infinite;
        }
        .users-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 12px 28px rgba(15,23,42,0.09) !important;
        }
        @media (max-width: 900px) {
          .users-layout { grid-template-columns: 1fr !important; }
          .users-slot-grid { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; }
        }
      `}</style>
    </div>
  )
}

const miniBtn = {
  width: 26, height: 26, borderRadius: 7, border: '1px solid var(--card-border)',
  background: 'var(--card-bg)', cursor: 'pointer',
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-3)',
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
        background: 'var(--card-bg)', borderRadius: 16, width: '100%', maxWidth: 400,
        padding: 22, border: '1px solid var(--card-border)',
        boxShadow: '0 24px 60px rgba(0,0,0,0.28)',
      }}>
        {children}
      </div>
    </div>
  )
}
