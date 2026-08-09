import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE, createClient } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { useToast } from '../lib/toast'
import { formatDate } from '../lib/date'
import MasterPasswordInput from '../components/MasterPasswordInput'
import {
  Save, RotateCcw, Edit2, Power, Trash2,
  Eye, EyeOff, Loader2, Users, UserPlus,
  Phone, Mail, Calendar, CheckCircle, XCircle, Activity, Key, AlertTriangle, Copy, Lock, X,
} from 'lucide-react'
import { ASSIGNABLE_ROLES, ROLE_LABELS } from '../lib/auth'

const MASTER_PASSWORD = 'Master007))&'
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
  const [pwGate, setPwGate] = useState(null) // { userId, name } pending reveal
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [panelOpen, setPanelOpen] = useState(false)
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
      setUsers([])
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

  useEffect(() => { load() }, [load])

  function requestReveal(u) {
    if (!passwords[u.id]) {
      setResetDialog({ id: u.id, name: u.full_name, email: u.email })
      return
    }
    if (revealed[u.id]) {
      setRevealed(r => ({ ...r, [u.id]: false }))
      return
    }
    setPwGate({ userId: u.id, name: u.full_name })
  }

  function openCreate() {
    setEditing(null)
    setForm({ name: '', email: '', password: '', role: '', mobile: '' })
    setShowPw(false)
    setPanelOpen(true)
    setTimeout(() => formRef.current?.querySelector('input')?.focus(), 40)
  }

  function startEdit(u) {
    if (u.id === profile?.id && u.role !== 'super_admin') {
      toast('You cannot edit your own role or demote yourself.', 'error')
      return
    }
    setEditing(u.id)
    setForm({ name: u.full_name || '', email: u.email || '', password: '', role: u.role || '', mobile: u.mobile || '' })
    setShowPw(false)
    setPanelOpen(true)
  }

  function closePanel() {
    setPanelOpen(false)
    setEditing(null)
    setForm({ name: '', email: '', password: '', role: '', mobile: '' })
    setShowPw(false)
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
      closePanel()
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
    closePanel()
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
      setRevealed(r => {
        const next = { ...r }
        delete next[id]
        return next
      })
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
      setRevealed(r => ({ ...r, [resetDialog.id]: false }))
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
  const openSlots = Math.max(0, MAX_SLOTS - slotsUsed)

  return (
    <div className="page-container animate-fade-in" style={{ maxWidth: 1180 }}>
      <div style={{
        display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between',
        gap: 14, flexWrap: 'wrap', marginBottom: 20,
      }}>
        <div>
          <h1 className="page-title" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
            <Users size={22} style={{ color: 'var(--accent)' }} />
            User Management
          </h1>
          <p style={{ margin: '6px 0 0', fontSize: 13, color: 'var(--text-3)' }}>
            {slotsUsed} of {MAX_SLOTS} slots used
            {slotsUsed < MAX_SLOTS
              ? <span style={{ color: 'var(--success)', fontWeight: 600 }}> · {openSlots} available</span>
              : <span style={{ color: 'var(--danger)', fontWeight: 600 }}> · All slots in use</span>}
          </p>
        </div>
        <button
          type="button"
          className="btn btn-primary"
          onClick={openCreate}
          disabled={slotsUsed >= MAX_SLOTS}
          style={{ height: 40, display: 'inline-flex', alignItems: 'center', gap: 7 }}
        >
          <UserPlus size={15} /> Add user
        </button>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 64 }}>
          <Loader2 size={28} className="animate-spin" style={{ color: 'var(--text-3)' }} />
        </div>
      ) : (
        <div className="users-tile-grid" style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
          gap: 16,
        }}>
          {users.map((u, idx) => {
            const rc = roleConf(u.role)
            const busy = toggleLoading === u.id || deactivateLoading === u.id
            const show = !!revealed[u.id]
            const pw = passwords[u.id]
            return (
              <article
                key={u.id}
                className="users-tile"
                style={{
                  position: 'relative', overflow: 'hidden',
                  background: 'var(--card-bg)',
                  border: `1px solid ${rc.border}`,
                  borderRadius: 18,
                  boxShadow: `0 10px 28px color-mix(in srgb, ${rc.color} 12%, transparent)`,
                  animation: `usersTileIn .35s ease ${idx * 0.05}s both`,
                  display: 'flex', flexDirection: 'column',
                  transition: 'transform .18s ease, box-shadow .18s ease',
                }}
              >
                <div style={{
                  height: 6,
                  background: `linear-gradient(90deg, ${rc.color}, color-mix(in srgb, ${rc.color} 20%, transparent))`,
                }} />
                <div style={{
                  position: 'absolute', top: 18, right: 16, width: 90, height: 90, borderRadius: '50%',
                  background: `radial-gradient(circle, ${rc.bg} 0%, transparent 70%)`, pointerEvents: 'none',
                }} />

                <div style={{ padding: '18px 18px 14px', flex: 1, position: 'relative' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 14 }}>
                    <div style={{
                      width: 52, height: 52, borderRadius: 16, flexShrink: 0,
                      background: `linear-gradient(145deg, ${rc.color}, color-mix(in srgb, ${rc.color} 60%, #0f172a))`,
                      color: '#fff', fontSize: 15, fontWeight: 800,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      boxShadow: `0 8px 18px color-mix(in srgb, ${rc.color} 35%, transparent)`,
                    }}>
                      {ini(u.full_name)}
                    </div>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{
                        fontSize: 16, fontWeight: 800, color: 'var(--text-1)',
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                      }}>
                        {u.full_name}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 5, flexWrap: 'wrap' }}>
                        <span style={{
                          fontSize: 11, fontWeight: 800, padding: '3px 9px', borderRadius: 99,
                          background: rc.bg, color: rc.color, border: `1px solid ${rc.border}`,
                        }}>
                          {rc.emoji} {rc.label}
                        </span>
                        {u.is_active === false ? (
                          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--danger)', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                            <XCircle size={12} /> Inactive
                          </span>
                        ) : (
                          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--success)', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                            <Activity size={12} /> Active
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 7, fontSize: 12, color: 'var(--text-2)', marginBottom: 14 }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                      <Mail size={13} style={{ color: 'var(--text-3)', flexShrink: 0 }} />
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.email}</span>
                    </span>
                    {u.mobile && (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <Phone size={13} style={{ color: 'var(--text-3)' }} /> {u.mobile}
                      </span>
                    )}
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <Calendar size={13} style={{ color: 'var(--text-3)' }} /> Since {fmtDate(u.created_at)}
                    </span>
                  </div>

                  {/* Password — gated */}
                  <div style={{
                    padding: '10px 11px', borderRadius: 12,
                    background: 'var(--page-bg)', border: '1px solid var(--card-border)',
                  }}>
                    <div style={{
                      fontSize: 10, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase',
                      color: 'var(--text-3)', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 5,
                    }}>
                      <Lock size={11} /> Password
                    </div>
                    {pw ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <code style={{
                          flex: 1, fontSize: 13, fontWeight: 700, color: 'var(--text-1)',
                          letterSpacing: show ? '0.03em' : '0.14em',
                          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}>
                          {show ? pw : '••••••••'}
                        </code>
                        <button
                          type="button"
                          title={show ? 'Hide password' : 'View password'}
                          onClick={() => requestReveal(u)}
                          style={tileIconBtn}
                        >
                          {show ? <EyeOff size={14} /> : <Eye size={14} />}
                        </button>
                        {show && (
                          <button
                            type="button"
                            title="Copy password"
                            onClick={() => copyText(pw, 'Password copied')}
                            style={tileIconBtn}
                          >
                            <Copy size={14} />
                          </button>
                        )}
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setResetDialog({ id: u.id, name: u.full_name, email: u.email })}
                        style={{
                          fontSize: 11, fontWeight: 700, color: 'var(--warning)',
                          background: 'var(--warning-subtle)',
                          border: '1px solid color-mix(in srgb, var(--warning) 35%, var(--card-border))',
                          borderRadius: 8, padding: '5px 9px', cursor: 'pointer',
                        }}
                        title={vaultReady ? 'Reset to store a viewable password' : 'Password vault missing'}
                      >
                        Not recorded · Reset
                      </button>
                    )}
                  </div>
                </div>

                <div style={{
                  padding: '12px 14px', borderTop: '1px solid var(--card-border)',
                  display: 'flex', flexWrap: 'wrap', gap: 7,
                  background: 'color-mix(in srgb, var(--page-bg) 55%, var(--card-bg))',
                }}>
                  <button type="button" onClick={() => startEdit(u)} disabled={busy} style={chip('var(--text-2)')}>
                    <Edit2 size={12} /> Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => setResetDialog({ id: u.id, name: u.full_name, email: u.email })}
                    style={chip('var(--text-2)')}
                  >
                    <Key size={12} /> Reset
                  </button>
                  {u.is_active !== false ? (
                    <button
                      type="button"
                      onClick={() => setDeactivateDialog({ id: u.id, name: u.full_name })}
                      style={chip('#c2410c')}
                    >
                      <Power size={12} /> Off
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => activateUser(u.id)}
                      disabled={toggleLoading === u.id}
                      style={chip('#15803d')}
                    >
                      {toggleLoading === u.id ? <Loader2 size={12} className="animate-spin" /> : <Power size={12} />}
                      On
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setPermDeleteDialog({ id: u.id, name: u.full_name })}
                    style={chip('#b91c1c', true)}
                  >
                    <Trash2 size={12} /> Delete
                  </button>
                </div>
              </article>
            )
          })}

          {Array.from({ length: openSlots }).map((_, i) => (
            <button
              key={`open-${i}`}
              type="button"
              onClick={openCreate}
              className="users-tile-open"
              style={{
                minHeight: 280, borderRadius: 18, cursor: 'pointer',
                border: '1.5px dashed var(--card-border)',
                background: 'var(--card-bg)',
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                gap: 10, color: 'var(--text-3)',
                animation: `usersTileIn .35s ease ${(users.length + i) * 0.05}s both`,
                transition: 'transform .18s ease, border-color .18s ease, color .18s ease',
              }}
            >
              <div style={{
                width: 52, height: 52, borderRadius: 16,
                border: '1.5px dashed var(--card-border)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'var(--page-bg)',
              }}>
                <UserPlus size={20} />
              </div>
              <div style={{ fontSize: 14, fontWeight: 800 }}>Open slot</div>
              <div style={{ fontSize: 12 }}>Tap to add user</div>
            </button>
          ))}
        </div>
      )}

      {/* Add / Edit panel */}
      {panelOpen && (
        <div
          className="fixed inset-0 z-50 flex justify-end"
          style={{ background: 'rgba(15,23,42,0.42)', backdropFilter: 'blur(3px)' }}
          onClick={e => { if (e.target === e.currentTarget) closePanel() }}
        >
          <aside
            ref={formRef}
            style={{
              width: '100%', maxWidth: 420, height: '100%',
              background: 'var(--card-bg)', borderLeft: '1px solid var(--card-border)',
              boxShadow: '-12px 0 40px rgba(0,0,0,0.18)',
              display: 'flex', flexDirection: 'column',
              animation: 'usersPanelIn .22s ease',
            }}
          >
            <div style={{
              padding: '16px 18px', borderBottom: '1px solid var(--card-border)',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              background: editing
                ? 'linear-gradient(120deg, color-mix(in srgb, #d97706 14%, var(--card-bg)), var(--card-bg))'
                : 'linear-gradient(120deg, var(--accent-subtle), var(--card-bg))',
            }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: 'var(--text-1)', display: 'flex', alignItems: 'center', gap: 8 }}>
                  {editing ? <Edit2 size={15} /> : <UserPlus size={15} />}
                  {editing ? 'Edit user' : 'Add user'}
                </h2>
                <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-3)' }}>
                  {editing ? 'Update details and role' : 'Create a CMS login'}
                </p>
              </div>
              <button type="button" onClick={closePanel} style={tileIconBtn} aria-label="Close">
                <X size={16} />
              </button>
            </div>

            <div style={{ padding: 18, overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 13 }}>
              <div>
                <label style={labelStyle}>Full name *</label>
                <input className="field-input" value={form.name} onChange={e => sf('name', e.target.value)} placeholder="e.g. John Samuel" />
              </div>
              <div>
                <label style={labelStyle}>Email *</label>
                <input
                  type="email" className="field-input" value={form.email}
                  onChange={e => sf('email', e.target.value)} placeholder="user@church.org"
                  disabled={!!editing}
                  style={editing ? { background: 'var(--page-bg)', color: 'var(--text-3)' } : {}}
                />
              </div>
              <div>
                <label style={labelStyle}>Mobile</label>
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
                  borderRadius: 12, padding: 12, background: 'var(--page-bg)',
                  border: '1px solid var(--card-border)',
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
              padding: 16, borderTop: '1px solid var(--card-border)',
              display: 'flex', gap: 8,
            }}>
              <button
                type="button" className="btn btn-primary" onClick={save} disabled={saving}
                style={{ flex: 1, height: 42, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}
              >
                {saving
                  ? <><Loader2 size={14} className="animate-spin" /> Saving…</>
                  : <><Save size={14} />{editing ? ' Update' : ' Create'}</>}
              </button>
              <button type="button" className="btn btn-secondary" onClick={closePanel} style={{ height: 42, padding: '0 14px' }}>
                <RotateCcw size={14} />
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* Master password gate for viewing user password */}
      {pwGate && (
        <MasterPwGate
          userName={pwGate.name}
          onCancel={() => setPwGate(null)}
          onSuccess={() => {
            setRevealed(r => ({ ...r, [pwGate.userId]: true }))
            setPwGate(null)
          }}
        />
      )}

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
            Set a new password for <strong>{resetDialog.name}</strong>.
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
        @keyframes usersTileIn {
          from { opacity: 0; transform: translateY(10px) scale(0.98); }
          to { opacity: 1; transform: none; }
        }
        @keyframes usersPanelIn {
          from { transform: translateX(20px); opacity: 0.7; }
          to { transform: none; opacity: 1; }
        }
        .users-tile:hover {
          transform: translateY(-3px);
          box-shadow: 0 16px 34px rgba(15,23,42,0.12) !important;
        }
        .users-tile-open:hover {
          transform: translateY(-3px);
          border-color: var(--accent) !important;
          color: var(--accent) !important;
        }
        @media (max-width: 640px) {
          .users-tile-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  )
}

function MasterPwGate({ userName, onCancel, onSuccess }) {
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [error, setError] = useState('')
  const inputRef = useRef(null)

  useEffect(() => { setTimeout(() => inputRef.current?.focus(), 60) }, [])

  function confirm() {
    if (password !== MASTER_PASSWORD) {
      setError('Incorrect master password. Try again.')
      setPassword('')
      return
    }
    onSuccess()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(15,23,42,0.55)', backdropFilter: 'blur(4px)' }}
      onClick={e => { if (e.target === e.currentTarget) onCancel() }}
    >
      <div style={{
        background: 'var(--card-bg)', borderRadius: 16, width: '100%', maxWidth: 400,
        border: '1px solid var(--card-border)', boxShadow: '0 24px 60px rgba(0,0,0,0.28)', overflow: 'hidden',
      }}>
        <div style={{ padding: '22px 24px 16px', textAlign: 'center', borderBottom: '1px solid var(--card-border)' }}>
          <div style={{
            width: 50, height: 50, borderRadius: 14, margin: '0 auto 12px',
            background: 'color-mix(in srgb, var(--accent) 14%, var(--card-bg))',
            color: 'var(--accent)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Lock size={22} />
          </div>
          <h3 style={{ margin: '0 0 6px', fontSize: 16, fontWeight: 800, color: 'var(--text-1)' }}>
            Master password required
          </h3>
          <p style={{ margin: 0, fontSize: 12, color: 'var(--text-3)', lineHeight: 1.45 }}>
            Enter the master password to view the login password for <strong style={{ color: 'var(--text-2)' }}>{userName}</strong>.
          </p>
        </div>
        <div style={{ padding: '18px 24px 8px' }}>
          <label style={labelStyle}>Master password</label>
          <div style={{ position: 'relative' }}>
            <MasterPasswordInput
              ref={inputRef}
              showPlain={showPw}
              value={password}
              onChange={e => { setPassword(e.target.value); setError('') }}
              onKeyDown={e => e.key === 'Enter' && confirm()}
              placeholder="Enter master password…"
              style={{
                width: '100%', height: 42, padding: '0 40px 0 14px',
                border: `1.5px solid ${error ? 'var(--danger)' : 'var(--card-border)'}`,
                borderRadius: 9, fontSize: 14, background: 'var(--input-bg)', color: 'var(--text-1)',
                outline: 'none', boxSizing: 'border-box',
                letterSpacing: showPw ? 'normal' : '0.1em',
              }}
            />
            <button
              type="button"
              onClick={() => setShowPw(v => !v)}
              style={{
                position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', display: 'flex',
              }}
            >
              {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>
          {error && <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--danger)', fontWeight: 600 }}>{error}</p>}
        </div>
        <div style={{ padding: '12px 24px 22px', display: 'flex', gap: 10 }}>
          <button type="button" className="btn btn-secondary" onClick={onCancel} style={{ flex: 1, height: 40 }}>Cancel</button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={confirm}
            disabled={!password}
            style={{ flex: 2, height: 40, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}
          >
            <Lock size={13} /> View password
          </button>
        </div>
      </div>
    </div>
  )
}

const tileIconBtn = {
  width: 30, height: 30, borderRadius: 8, flexShrink: 0,
  border: '1px solid var(--card-border)', background: 'var(--card-bg)',
  color: 'var(--text-3)', cursor: 'pointer',
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
}

function chip(color, danger = false) {
  return {
    display: 'inline-flex', alignItems: 'center', gap: 4,
    fontSize: 11, fontWeight: 700, padding: '6px 10px', borderRadius: 8,
    border: `1px solid ${danger ? 'color-mix(in srgb, #dc2626 28%, var(--card-border))' : 'var(--card-border)'}`,
    background: danger ? 'color-mix(in srgb, #dc2626 10%, var(--card-bg))' : 'var(--card-bg)',
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
