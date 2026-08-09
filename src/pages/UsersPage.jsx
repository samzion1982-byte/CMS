import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE, createClient } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { useToast } from '../lib/toast'
import { formatDate } from '../lib/date'
import {
  Save, RotateCcw, Edit2, Power, Trash2,
  Eye, EyeOff, Loader2, Users, UserPlus,
  Phone, Mail, Calendar, CheckCircle, XCircle, Activity, Key, AlertTriangle,
  Copy, ChevronRight,
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

const ROLES = ASSIGNABLE_ROLES.map(value => ({ value, label: ROLE_LABELS[value] }))

function ini(name = '') {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase()
  return (parts[0][0] + parts[1][0]).toUpperCase()
}
function fmtDate(iso) { return iso ? formatDate(iso, '') : '—' }
const cleanPhone = (raw) => (raw || '').replace(/\D/g, '')
const isValidPhone = (raw) => cleanPhone(raw).length >= 10

async function upsertStoredPassword(userId, password) {
  if (!userId || !password) return
  const { error } = await supabase.from('cms_user_passwords').upsert({
    user_id: userId,
    password,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id' })
  if (error) {
    console.error('Password vault save failed:', error)
    throw error
  }
}

async function deleteStoredPassword(userId) {
  await supabase.from('cms_user_passwords').delete().eq('user_id', userId)
}

const fieldLabel = {
  display: 'block', fontSize: 11, fontWeight: 700, letterSpacing: '0.06em',
  textTransform: 'uppercase', color: 'var(--text-3)', marginBottom: 6,
}

export default function UsersPage() {
  const { profile } = useAuth()
  const toast = useToast()
  const formRef = useRef(null)

  const [users, setUsers] = useState([])
  const [passwords, setPasswords] = useState({})
  const [vaultReady, setVaultReady] = useState(true)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [selectedId, setSelectedId] = useState(null)
  const [mode, setMode] = useState('view') // view | create | edit
  const [editing, setEditing] = useState(null)
  const [showPw, setShowPw] = useState(false)
  const [revealPw, setRevealPw] = useState(false)
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
      setUsers([])
    } else {
      const list = data || []
      setUsers(list)
      setSelectedId(prev => {
        if (prev && list.some(u => u.id === prev)) return prev
        return list[0]?.id || null
      })
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

  useEffect(() => { load() }, [load])

  useEffect(() => {
    setRevealPw(false)
  }, [selectedId])

  function openCreate() {
    setMode('create')
    setEditing(null)
    setForm({ name: '', email: '', password: '', role: '', mobile: '' })
    setShowPw(false)
    setTimeout(() => formRef.current?.querySelector('input')?.focus(), 40)
  }

  function startEdit(u) {
    if (u.id === profile?.id && u.role !== 'super_admin') {
      toast('You cannot edit your own role or demote yourself.', 'error')
      return
    }
    setSelectedId(u.id)
    setMode('edit')
    setEditing(u.id)
    setForm({ name: u.full_name || '', email: u.email || '', password: '', role: u.role || '', mobile: u.mobile || '' })
    setShowPw(false)
    setTimeout(() => formRef.current?.querySelector('input')?.focus(), 40)
  }

  function cancelForm() {
    setMode('view')
    setEditing(null)
    setForm({ name: '', email: '', password: '', role: '', mobile: '' })
    setShowPw(false)
  }

  function selectUser(id) {
    setSelectedId(id)
    if (mode !== 'view') cancelForm()
  }

  async function copyText(text, label = 'Copied') {
    if (!text) return
    try {
      await navigator.clipboard.writeText(text)
      toast(label, 'success')
    } catch {
      toast('Could not copy to clipboard.', 'error')
    }
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
      setSelectedId(editing)
      cancelForm()
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
    setSelectedId(newUserId)
    cancelForm()
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
      if (selectedId === id) setSelectedId(null)
      cancelForm()
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
      setRevealPw(true)
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
  const selected = users.find(u => u.id === selectedId) || null
  const selectedPw = selected ? passwords[selected.id] : null
  const openSlots = Math.max(0, MAX_SLOTS - slotsUsed)
  const busySelected = selected && (toggleLoading === selected.id || deactivateLoading === selected.id)

  return (
    <div className="page-container animate-fade-in" style={{ maxWidth: 1100 }}>
      <div style={{ marginBottom: 16 }}>
        <h1 className="page-title" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
          <Users size={22} style={{ color: 'var(--accent)' }} />
          User Management
        </h1>
        <p style={{ margin: '6px 0 0', fontSize: 13, color: 'var(--text-3)' }}>
          Select a user to inspect credentials and manage access · {slotsUsed}/{MAX_SLOTS} slots
        </p>
      </div>

      {!vaultReady && (
        <div style={{
          marginBottom: 12, padding: '10px 12px', borderRadius: 10, fontSize: 12,
          background: 'var(--warning-subtle)', border: '1px solid var(--warning)', color: 'var(--text-1)',
        }}>
          Password vault missing. Run <code>20260809_cms_user_passwords.sql</code> in Supabase.
        </div>
      )}

      <div
        className="users-split"
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(240px, 300px) 1fr',
          gap: 0,
          minHeight: 520,
          border: '1px solid var(--card-border)',
          borderRadius: 16,
          overflow: 'hidden',
          background: 'var(--card-bg)',
          boxShadow: 'var(--card-shadow)',
        }}
      >
        {/* Roster rail */}
        <aside style={{
          borderRight: '1px solid var(--card-border)',
          background: 'color-mix(in srgb, var(--page-bg) 70%, var(--card-bg))',
          display: 'flex', flexDirection: 'column',
        }}>
          <div style={{
            padding: '14px 14px 10px',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
          }}>
            <span style={{
              fontSize: 11, fontWeight: 800, letterSpacing: '0.1em',
              textTransform: 'uppercase', color: 'var(--text-3)',
            }}>
              Roster
            </span>
            <button
              type="button"
              onClick={openCreate}
              disabled={slotsUsed >= MAX_SLOTS || mode === 'create'}
              title="Add user"
              style={{
                width: 30, height: 30, borderRadius: 8, border: 'none', cursor: slotsUsed >= MAX_SLOTS ? 'not-allowed' : 'pointer',
                background: 'var(--accent)', color: 'var(--accent-text, #fff)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                opacity: slotsUsed >= MAX_SLOTS ? 0.45 : 1,
              }}
            >
              <UserPlus size={15} />
            </button>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '0 8px 12px' }}>
            {loading ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
                <Loader2 size={20} className="animate-spin" style={{ color: 'var(--text-3)' }} />
              </div>
            ) : (
              <>
                {users.map((u, idx) => {
                  const active = selectedId === u.id && mode === 'view'
                  const editingThis = mode === 'edit' && editing === u.id
                  const on = active || editingThis
                  return (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => selectUser(u.id)}
                      style={{
                        width: '100%', textAlign: 'left', marginBottom: 6,
                        padding: '10px 10px', borderRadius: 12, cursor: 'pointer',
                        border: on ? '1.5px solid var(--accent)' : '1.5px solid transparent',
                        background: on ? 'var(--card-bg)' : 'transparent',
                        boxShadow: on ? '0 4px 14px var(--accent-ring)' : 'none',
                        display: 'flex', alignItems: 'center', gap: 10,
                        animation: `usersRosterIn .3s ease ${idx * 0.04}s both`,
                        transition: 'border-color .12s, box-shadow .12s, background .12s',
                      }}
                    >
                      <div style={{
                        width: 38, height: 38, borderRadius: '50%', flexShrink: 0,
                        background: u.is_active === false
                          ? 'color-mix(in srgb, var(--text-3) 35%, var(--card-bg))'
                          : 'var(--sidebar-bg, #0d2244)',
                        color: '#fff', fontSize: 12, fontWeight: 800,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        position: 'relative',
                      }}>
                        {ini(u.full_name)}
                        <span style={{
                          position: 'absolute', right: -1, bottom: -1, width: 9, height: 9,
                          borderRadius: '50%', border: '2px solid var(--card-bg)',
                          background: u.is_active === false ? 'var(--warning)' : 'var(--success)',
                        }} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                          fontSize: 13, fontWeight: 700, color: 'var(--text-1)',
                          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                        }}>
                          {u.full_name}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>
                          {ROLE_LABELS[u.role] || u.role}
                        </div>
                      </div>
                      <ChevronRight size={14} style={{ color: on ? 'var(--accent)' : 'var(--text-3)', flexShrink: 0 }} />
                    </button>
                  )
                })}

                {Array.from({ length: openSlots }).map((_, i) => (
                  <button
                    key={`open-${i}`}
                    type="button"
                    onClick={openCreate}
                    style={{
                      width: '100%', textAlign: 'left', marginBottom: 6,
                      padding: '10px 10px', borderRadius: 12, cursor: 'pointer',
                      border: mode === 'create' && i === 0 ? '1.5px dashed var(--accent)' : '1.5px dashed var(--card-border)',
                      background: 'transparent',
                      display: 'flex', alignItems: 'center', gap: 10,
                      color: 'var(--text-3)',
                    }}
                  >
                    <div style={{
                      width: 38, height: 38, borderRadius: '50%',
                      border: '1.5px dashed var(--card-border)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <UserPlus size={14} />
                    </div>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>Open slot</div>
                      <div style={{ fontSize: 11 }}>Add CMS user</div>
                    </div>
                  </button>
                ))}

                {users.length === 0 && openSlots === 0 && (
                  <p style={{ padding: 16, fontSize: 12, color: 'var(--text-3)', textAlign: 'center' }}>No slots</p>
                )}
              </>
            )}
          </div>
        </aside>

        {/* Inspector */}
        <section ref={formRef} style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          {mode === 'create' || mode === 'edit' ? (
            <>
              <div style={{
                padding: '18px 22px 14px',
                borderBottom: '1px solid var(--card-border)',
              }}>
                <div style={{
                  fontSize: 11, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase',
                  color: 'var(--text-3)', marginBottom: 6,
                }}>
                  {mode === 'edit' ? 'Edit account' : 'New account'}
                </div>
                <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: 'var(--text-1)' }}>
                  {mode === 'edit' ? 'Update user details' : 'Create CMS user'}
                </h2>
              </div>
              <div style={{
                padding: 22, flex: 1, overflowY: 'auto',
                display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, alignContent: 'start',
              }} className="users-form-grid">
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={fieldLabel}>Full name *</label>
                  <input className="field-input" value={form.name} onChange={e => sf('name', e.target.value)} placeholder="e.g. John Samuel" />
                </div>
                <div>
                  <label style={fieldLabel}>Email *</label>
                  <input
                    type="email" className="field-input" value={form.email}
                    onChange={e => sf('email', e.target.value)} placeholder="user@church.org"
                    disabled={mode === 'edit'}
                    style={mode === 'edit' ? { background: 'var(--page-bg)', color: 'var(--text-3)' } : {}}
                  />
                </div>
                <div>
                  <label style={fieldLabel}>Mobile</label>
                  <input className="field-input" value={form.mobile} onChange={e => sf('mobile', e.target.value)} placeholder="+91 99999 99999" />
                </div>
                {mode === 'create' && (
                  <div style={{ gridColumn: '1 / -1' }}>
                    <label style={fieldLabel}>Password *</label>
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
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={fieldLabel}>Role *</label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {ROLES.map(r => {
                      const on = form.role === r.value
                      return (
                        <button
                          key={r.value}
                          type="button"
                          onClick={() => sf('role', r.value)}
                          style={{
                            padding: '8px 12px', borderRadius: 999, cursor: 'pointer',
                            border: on ? '1.5px solid var(--accent)' : '1.5px solid var(--card-border)',
                            background: on ? 'var(--accent-subtle)' : 'var(--card-bg)',
                            color: on ? 'var(--accent)' : 'var(--text-2)',
                            fontSize: 12, fontWeight: 700,
                          }}
                        >
                          {r.label}
                        </button>
                      )
                    })}
                  </div>
                </div>
                {PERMS[form.role] && (
                  <div style={{
                    gridColumn: '1 / -1', borderRadius: 12, padding: 12,
                    background: 'var(--page-bg)', border: '1px solid var(--card-border)',
                  }}>
                    <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-3)', marginBottom: 8 }}>
                      Actions · {ROLE_LABELS[form.role]}
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {Object.entries(PERMS[form.role]).map(([action, allowed]) => (
                        <span key={action} style={{
                          fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 6,
                          display: 'inline-flex', alignItems: 'center', gap: 4,
                          background: allowed ? 'var(--success-subtle)' : 'var(--card-bg)',
                          color: allowed ? 'var(--success)' : 'var(--text-3)',
                          border: `1px solid ${allowed ? 'var(--success-border)' : 'var(--card-border)'}`,
                        }}>
                          {allowed ? <CheckCircle size={11} /> : <XCircle size={11} />}
                          {action}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <div style={{
                padding: '14px 22px', borderTop: '1px solid var(--card-border)',
                display: 'flex', gap: 8, justifyContent: 'flex-end',
              }}>
                <button type="button" className="btn btn-secondary" onClick={cancelForm} style={{ height: 40 }}>
                  <RotateCcw size={14} style={{ marginRight: 6 }} /> Cancel
                </button>
                <button
                  type="button" className="btn btn-primary" onClick={save} disabled={saving}
                  style={{ height: 40, display: 'inline-flex', alignItems: 'center', gap: 7 }}
                >
                  {saving
                    ? <><Loader2 size={14} className="animate-spin" /> Saving…</>
                    : <><Save size={14} />{mode === 'edit' ? 'Update user' : 'Create user'}</>}
                </button>
              </div>
            </>
          ) : selected ? (
            <>
              <div style={{
                padding: '22px 24px 18px',
                background: 'linear-gradient(180deg, color-mix(in srgb, var(--accent-subtle) 80%, var(--card-bg)) 0%, var(--card-bg) 100%)',
                borderBottom: '1px solid var(--card-border)',
                animation: 'usersInspectIn .28s ease',
              }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
                  <div style={{
                    width: 64, height: 64, borderRadius: 18, flexShrink: 0,
                    background: 'var(--sidebar-bg, #0d2244)', color: '#fff',
                    fontSize: 20, fontWeight: 800,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    boxShadow: '0 10px 24px rgba(15,23,42,0.18)',
                  }}>
                    {ini(selected.full_name)}
                  </div>
                  <div style={{ flex: 1, minWidth: 180 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: 'var(--text-1)', letterSpacing: '-0.02em' }}>
                        {selected.full_name}
                      </h2>
                      <span style={{
                        fontSize: 11, fontWeight: 800, padding: '4px 10px', borderRadius: 999,
                        background: 'var(--accent-subtle)', color: 'var(--accent)',
                      }}>
                        {ROLE_LABELS[selected.role] || selected.role}
                      </span>
                      {selected.is_active === false ? (
                        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--danger)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          <XCircle size={13} /> Inactive
                        </span>
                      ) : (
                        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--success)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          <Activity size={13} /> Active
                        </span>
                      )}
                    </div>
                    <div style={{
                      marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: '8px 16px',
                      fontSize: 13, color: 'var(--text-2)',
                    }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <Mail size={14} style={{ color: 'var(--text-3)' }} /> {selected.email}
                      </span>
                      {selected.mobile && (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                          <Phone size={14} style={{ color: 'var(--text-3)' }} /> {selected.mobile}
                        </span>
                      )}
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <Calendar size={14} style={{ color: 'var(--text-3)' }} /> Joined {fmtDate(selected.created_at)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <div style={{ padding: 22, flex: 1, overflowY: 'auto' }}>
                {/* Password focus panel */}
                <div style={{
                  borderRadius: 14, padding: 18,
                  border: '1px solid var(--card-border)',
                  background: 'var(--page-bg)',
                  marginBottom: 18,
                }}>
                  <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    gap: 10, marginBottom: 12, flexWrap: 'wrap',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Key size={15} style={{ color: 'var(--accent)' }} />
                      <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-3)' }}>
                        Current password
                      </span>
                    </div>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => setResetDialog({ id: selected.id, name: selected.full_name, email: selected.email })}
                      style={{ height: 34, fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 6 }}
                    >
                      <Key size={13} /> Reset
                    </button>
                  </div>

                  {selectedPw ? (
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
                      padding: '12px 14px', borderRadius: 12,
                      background: 'var(--card-bg)', border: '1px solid var(--card-border)',
                    }}>
                      <code style={{
                        flex: 1, minWidth: 140, fontSize: 16, fontWeight: 700,
                        letterSpacing: revealPw ? '0.04em' : '0.18em',
                        color: 'var(--text-1)',
                        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                      }}>
                        {revealPw ? selectedPw : '••••••••••••'}
                      </code>
                      <button type="button" onClick={() => setRevealPw(v => !v)} style={iconAction} title={revealPw ? 'Hide' : 'Show'}>
                        {revealPw ? <EyeOff size={15} /> : <Eye size={15} />}
                      </button>
                      <button type="button" onClick={() => copyText(selectedPw, 'Password copied')} style={iconAction} title="Copy">
                        <Copy size={15} />
                      </button>
                    </div>
                  ) : (
                    <div style={{
                      padding: '14px 14px', borderRadius: 12, fontSize: 13, color: 'var(--text-2)',
                      background: 'var(--warning-subtle)', border: '1px solid color-mix(in srgb, var(--warning) 35%, var(--card-border))',
                    }}>
                      No password recorded for this account yet. Reset once to store and view it here.
                    </div>
                  )}
                </div>

                <div style={{
                  display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10, marginBottom: 18,
                }} className="users-meta-grid">
                  <MetaTile label="Role" value={ROLE_LABELS[selected.role] || selected.role} />
                  <MetaTile label="Status" value={selected.is_active === false ? 'Inactive' : 'Active'} />
                  <MetaTile label="Created" value={fmtDate(selected.created_at)} />
                </div>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  <button type="button" className="btn btn-secondary" onClick={() => startEdit(selected)} disabled={busySelected}
                    style={{ height: 38, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <Edit2 size={14} /> Edit
                  </button>
                  {selected.is_active !== false ? (
                    <button
                      type="button" className="btn btn-warning"
                      onClick={() => setDeactivateDialog({ id: selected.id, name: selected.full_name })}
                      style={{ height: 38, display: 'inline-flex', alignItems: 'center', gap: 6 }}
                    >
                      <Power size={14} /> Deactivate
                    </button>
                  ) : (
                    <button
                      type="button" className="btn btn-primary"
                      onClick={() => activateUser(selected.id)}
                      disabled={toggleLoading === selected.id}
                      style={{ height: 38, display: 'inline-flex', alignItems: 'center', gap: 6 }}
                    >
                      {toggleLoading === selected.id ? <Loader2 size={14} className="animate-spin" /> : <Power size={14} />}
                      Activate
                    </button>
                  )}
                  <button
                    type="button" className="btn btn-danger"
                    onClick={() => setPermDeleteDialog({ id: selected.id, name: selected.full_name })}
                    style={{ height: 38, display: 'inline-flex', alignItems: 'center', gap: 6 }}
                  >
                    <Trash2 size={14} /> Delete
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div style={{
              flex: 1, display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center', padding: 40, textAlign: 'center',
            }}>
              <div style={{
                width: 56, height: 56, borderRadius: 16, marginBottom: 14,
                background: 'var(--accent-subtle)', color: 'var(--accent)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Users size={24} />
              </div>
              <p style={{ margin: 0, fontSize: 16, fontWeight: 800, color: 'var(--text-1)' }}>No user selected</p>
              <p style={{ margin: '8px 0 16px', fontSize: 13, color: 'var(--text-3)', maxWidth: 280 }}>
                Choose someone from the roster, or add a new CMS login.
              </p>
              <button
                type="button" className="btn btn-primary" onClick={openCreate}
                disabled={slotsUsed >= MAX_SLOTS}
                style={{ height: 40, display: 'inline-flex', alignItems: 'center', gap: 7 }}
              >
                <UserPlus size={15} /> Add user
              </button>
            </div>
          )}
        </section>
      </div>

      <p style={{ margin: '12px 0 0', fontSize: 11, color: 'var(--text-3)' }}>
        Page access is configured in CMS Permissions.
      </p>

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
            Set a new password for <strong>{resetDialog.name}</strong>. It will be stored for Super Admin viewing.
          </p>
          <div style={{ marginBottom: 16 }}>
            <label style={fieldLabel}>New password</label>
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
        @keyframes usersRosterIn {
          from { opacity: 0; transform: translateX(-6px); }
          to { opacity: 1; transform: none; }
        }
        @keyframes usersInspectIn {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: none; }
        }
        @media (max-width: 820px) {
          .users-split { grid-template-columns: 1fr !important; min-height: auto !important; }
          .users-split > aside { border-right: none !important; border-bottom: 1px solid var(--card-border); max-height: 280px; }
          .users-form-grid { grid-template-columns: 1fr !important; }
          .users-meta-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  )
}

function MetaTile({ label, value }) {
  return (
    <div style={{
      padding: '12px 14px', borderRadius: 12,
      border: '1px solid var(--card-border)', background: 'var(--card-bg)',
    }}>
      <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-3)', marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-1)' }}>{value}</div>
    </div>
  )
}

const iconAction = {
  width: 36, height: 36, borderRadius: 10,
  border: '1px solid var(--card-border)', background: 'var(--card-bg)',
  color: 'var(--text-2)', cursor: 'pointer',
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
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
        background: 'var(--card-bg)', borderRadius: 14, width: '100%', maxWidth: 400,
        padding: 22, border: '1px solid var(--card-border)',
        boxShadow: '0 24px 60px rgba(0,0,0,0.28)',
      }}>
        {children}
      </div>
    </div>
  )
}
