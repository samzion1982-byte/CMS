import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE, createClient } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { useToast } from '../lib/toast'
import { formatDate } from '../lib/date'
import {
  Save, RotateCcw, Edit2, Power, Trash2,
  Eye, EyeOff, Loader2, Users, UserPlus,
  Phone, Mail, Calendar, CheckCircle, XCircle, Activity, Key, AlertTriangle,
  Copy, X, Search,
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
  const panelRef = useRef(null)

  const [users, setUsers] = useState([])
  const [passwords, setPasswords] = useState({}) // userId -> password
  const [vaultReady, setVaultReady] = useState(true)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [editing, setEditing] = useState(null)
  const [panelOpen, setPanelOpen] = useState(false)
  const [showPw, setShowPw] = useState(false)
  const [revealAll, setRevealAll] = useState(false)
  const [revealed, setRevealed] = useState({}) // id -> bool
  const [query, setQuery] = useState('')
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

  function openCreate() {
    setEditing(null)
    setForm({ name: '', email: '', password: '', role: '', mobile: '' })
    setShowPw(false)
    setPanelOpen(true)
    setTimeout(() => panelRef.current?.querySelector('input')?.focus(), 50)
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
      } catch (e) {
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
  const filtered = users.filter(u => {
    const q = query.trim().toLowerCase()
    if (!q) return true
    return (
      (u.full_name || '').toLowerCase().includes(q) ||
      (u.email || '').toLowerCase().includes(q) ||
      (u.mobile || '').includes(q) ||
      (ROLE_LABELS[u.role] || u.role || '').toLowerCase().includes(q)
    )
  })

  return (
    <div className="page-container animate-fade-in users-dir" style={{ maxWidth: 1180 }}>
      {/* Compact directory header */}
      <header style={{
        display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between',
        gap: 16, flexWrap: 'wrap', marginBottom: 18,
        paddingBottom: 16, borderBottom: '1px solid var(--card-border)',
      }}>
        <div>
          <p style={{
            margin: '0 0 4px', fontSize: 11, fontWeight: 700, letterSpacing: '0.14em',
            textTransform: 'uppercase', color: 'var(--text-3)',
          }}>
            Super Admin
          </p>
          <h1 className="page-title" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
            <Users size={22} style={{ color: 'var(--accent)' }} />
            User directory
          </h1>
          <p style={{ margin: '6px 0 0', fontSize: 13, color: 'var(--text-3)', maxWidth: 480 }}>
            Manage CMS logins. Passwords are stored for Super Admin viewing when created or reset here.
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '8px 12px', borderRadius: 10,
            border: '1px solid var(--card-border)', background: 'var(--card-bg)',
            fontSize: 12, fontWeight: 700, color: 'var(--text-2)',
          }}>
            <span style={{ color: 'var(--text-3)', fontWeight: 600 }}>Slots</span>
            <div style={{ display: 'flex', gap: 4 }}>
              {Array.from({ length: MAX_SLOTS }).map((_, i) => (
                <span
                  key={i}
                  title={users[i]?.full_name || `Open slot ${i + 1}`}
                  style={{
                    width: 10, height: 10, borderRadius: 3,
                    background: users[i]
                      ? (users[i].is_active === false ? 'var(--warning)' : 'var(--accent)')
                      : 'var(--card-border)',
                  }}
                />
              ))}
            </div>
            <span>{slotsUsed}/{MAX_SLOTS}</span>
          </div>
          <button
            type="button"
            className="btn btn-primary"
            onClick={openCreate}
            disabled={slotsUsed >= MAX_SLOTS}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 7, height: 40 }}
          >
            <UserPlus size={15} /> Add user
          </button>
        </div>
      </header>

      {/* Toolbar */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: 12, flexWrap: 'wrap', marginBottom: 12,
      }}>
        <div style={{ position: 'relative', flex: '1 1 220px', maxWidth: 320 }}>
          <Search size={14} style={{
            position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)',
            color: 'var(--text-3)', pointerEvents: 'none',
          }} />
          <input
            className="field-input"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search name, email, role…"
            style={{ paddingLeft: 34, height: 38 }}
          />
        </div>
        <button
          type="button"
          onClick={() => {
            setRevealAll(v => {
              const next = !v
              if (!next) setRevealed({})
              return next
            })
          }}
          style={{
            height: 38, padding: '0 12px', borderRadius: 9, cursor: 'pointer',
            border: '1px solid var(--card-border)', background: 'var(--card-bg)',
            color: 'var(--text-2)', fontSize: 12, fontWeight: 700,
            display: 'inline-flex', alignItems: 'center', gap: 7,
          }}
          title={revealAll ? 'Hide all passwords' : 'Show all passwords'}
        >
          {revealAll ? <EyeOff size={14} /> : <Eye size={14} />}
          {revealAll ? 'Hide passwords' : 'Show passwords'}
        </button>
      </div>

      {!vaultReady && (
        <div style={{
          marginBottom: 12, padding: '10px 12px', borderRadius: 10, fontSize: 12,
          background: 'var(--warning-subtle)', border: '1px solid var(--warning)',
          color: 'var(--text-1)',
        }}>
          Password vault table is missing. Run <code>20260809_cms_user_passwords.sql</code> in Supabase to enable viewing passwords.
        </div>
      )}

      {/* Table directory */}
      <div style={{
        background: 'var(--card-bg)', border: '1px solid var(--card-border)',
        borderRadius: 14, overflow: 'hidden',
        boxShadow: 'var(--card-shadow)',
      }}>
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 56 }}>
            <Loader2 size={24} className="animate-spin" style={{ color: 'var(--text-3)' }} />
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: '48px 20px', textAlign: 'center' }}>
            <Users size={28} style={{ color: 'var(--text-3)', marginBottom: 8 }} />
            <p style={{ margin: 0, fontWeight: 700, color: 'var(--text-1)' }}>
              {users.length === 0 ? 'No users yet' : 'No matches'}
            </p>
            <p style={{ margin: '6px 0 0', fontSize: 13, color: 'var(--text-3)' }}>
              {users.length === 0 ? 'Add the first CMS user to get started.' : 'Try a different search.'}
            </p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="users-table" style={{ width: '100%', borderCollapse: 'collapse', minWidth: 860 }}>
              <thead>
                <tr style={{ background: 'var(--card-header-bg)', borderBottom: '1px solid var(--card-border)' }}>
                  {['#', 'User', 'Role', 'Contact', 'Password', 'Status', 'Actions'].map(h => (
                    <th key={h} style={{
                      textAlign: 'left', padding: '11px 14px', fontSize: 10, fontWeight: 800,
                      letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-3)',
                      whiteSpace: 'nowrap',
                    }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((u, idx) => {
                  const pw = passwords[u.id]
                  const show = revealAll || !!revealed[u.id]
                  const busy = toggleLoading === u.id || deactivateLoading === u.id
                  return (
                    <tr
                      key={u.id}
                      style={{
                        borderBottom: '1px solid var(--card-border)',
                        background: idx % 2 ? 'color-mix(in srgb, var(--page-bg) 55%, var(--card-bg))' : 'var(--card-bg)',
                        animation: `usersRowIn .28s ease ${idx * 0.03}s both`,
                      }}
                    >
                      <td style={{ padding: '14px', fontSize: 12, fontWeight: 700, color: 'var(--text-3)', width: 40 }}>
                        {idx + 1}
                      </td>
                      <td style={{ padding: '14px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div style={{
                            width: 36, height: 36, borderRadius: 8, flexShrink: 0,
                            background: 'var(--sidebar-bg, #0d2244)', color: '#fff',
                            fontSize: 11, fontWeight: 800,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                          }}>
                            {ini(u.full_name)}
                          </div>
                          <div>
                            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-1)' }}>{u.full_name}</div>
                            <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2, display: 'flex', alignItems: 'center', gap: 4 }}>
                              <Calendar size={11} /> {fmtDate(u.created_at)}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td style={{ padding: '14px' }}>
                        <span style={{
                          fontSize: 11, fontWeight: 800, padding: '4px 9px', borderRadius: 6,
                          background: 'var(--accent-subtle)', color: 'var(--accent)',
                          border: '1px solid color-mix(in srgb, var(--accent) 25%, var(--card-border))',
                        }}>
                          {ROLE_LABELS[u.role] || u.role}
                        </span>
                      </td>
                      <td style={{ padding: '14px' }}>
                        <div style={{ fontSize: 12, color: 'var(--text-2)', display: 'flex', flexDirection: 'column', gap: 4 }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                            <Mail size={12} style={{ color: 'var(--text-3)' }} /> {u.email}
                          </span>
                          {u.mobile && (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                              <Phone size={12} style={{ color: 'var(--text-3)' }} /> {u.mobile}
                            </span>
                          )}
                        </div>
                      </td>
                      <td style={{ padding: '14px', minWidth: 180 }}>
                        {pw ? (
                          <div style={{
                            display: 'inline-flex', alignItems: 'center', gap: 6,
                            padding: '5px 8px', borderRadius: 8,
                            background: 'var(--page-bg)', border: '1px solid var(--card-border)',
                          }}>
                            <Key size={12} style={{ color: 'var(--text-3)', flexShrink: 0 }} />
                            <code style={{
                              fontSize: 12, fontWeight: 600, color: 'var(--text-1)',
                              letterSpacing: show ? '0.02em' : '0.12em',
                              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                              maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                            }}>
                              {show ? pw : '••••••••'}
                            </code>
                            <button
                              type="button"
                              title={show ? 'Hide' : 'Show'}
                              onClick={() => setRevealed(r => ({ ...r, [u.id]: !r[u.id] }))}
                              style={miniIconBtn}
                            >
                              {show ? <EyeOff size={13} /> : <Eye size={13} />}
                            </button>
                            <button
                              type="button"
                              title="Copy password"
                              onClick={() => copyText(pw, 'Password copied')}
                              style={miniIconBtn}
                            >
                              <Copy size={13} />
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setResetDialog({ id: u.id, name: u.full_name, email: u.email })}
                            style={{
                              fontSize: 11, fontWeight: 700, color: 'var(--warning)',
                              background: 'var(--warning-subtle)', border: '1px solid color-mix(in srgb, var(--warning) 35%, var(--card-border))',
                              borderRadius: 8, padding: '5px 9px', cursor: 'pointer',
                            }}
                            title="No password recorded yet — reset to store one"
                          >
                            Not recorded · Reset
                          </button>
                        )}
                      </td>
                      <td style={{ padding: '14px' }}>
                        {u.is_active === false ? (
                          <span style={{
                            display: 'inline-flex', alignItems: 'center', gap: 5,
                            fontSize: 11, fontWeight: 700, color: 'var(--danger)',
                          }}>
                            <XCircle size={13} /> Inactive
                          </span>
                        ) : (
                          <span style={{
                            display: 'inline-flex', alignItems: 'center', gap: 5,
                            fontSize: 11, fontWeight: 700, color: 'var(--success)',
                          }}>
                            <Activity size={13} /> Active
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '14px' }}>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                          <button type="button" onClick={() => startEdit(u)} disabled={busy} style={rowBtn}>
                            <Edit2 size={12} /> Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => setResetDialog({ id: u.id, name: u.full_name, email: u.email })}
                            style={rowBtn}
                          >
                            <Key size={12} /> Reset
                          </button>
                          {u.is_active !== false ? (
                            <button
                              type="button"
                              onClick={() => setDeactivateDialog({ id: u.id, name: u.full_name })}
                              style={{ ...rowBtn, color: 'var(--warning)' }}
                            >
                              <Power size={12} /> Off
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => activateUser(u.id)}
                              disabled={toggleLoading === u.id}
                              style={{ ...rowBtn, color: 'var(--success)' }}
                            >
                              {toggleLoading === u.id ? <Loader2 size={12} className="animate-spin" /> : <Power size={12} />}
                              On
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => setPermDeleteDialog({ id: u.id, name: u.full_name })}
                            style={{ ...rowBtn, color: 'var(--danger)' }}
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p style={{ margin: '10px 0 0', fontSize: 11, color: 'var(--text-3)' }}>
        Page access is configured in CMS Permissions. Action rights are the same for all assignable roles.
      </p>

      {/* Add / Edit slide-over */}
      {panelOpen && (
        <div
          className="fixed inset-0 z-50 flex justify-end"
          style={{ background: 'rgba(15,23,42,0.4)', backdropFilter: 'blur(3px)' }}
          onClick={e => { if (e.target === e.currentTarget) closePanel() }}
        >
          <aside
            ref={panelRef}
            className="users-panel"
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
              background: 'var(--card-header-bg)',
            }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: 'var(--text-1)', display: 'flex', alignItems: 'center', gap: 8 }}>
                  {editing ? <Edit2 size={15} /> : <UserPlus size={15} />}
                  {editing ? 'Edit user' : 'Add user'}
                </h2>
                <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-3)' }}>
                  {editing ? 'Update name, role, or mobile' : 'Creates a login and stores the password for viewing'}
                </p>
              </div>
              <button type="button" onClick={closePanel} style={miniIconBtn} aria-label="Close">
                <X size={16} />
              </button>
            </div>

            <div style={{ padding: 18, overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={fieldLabel}>Full name *</label>
                <input className="field-input" value={form.name} onChange={e => sf('name', e.target.value)} placeholder="e.g. John Samuel" />
              </div>
              <div>
                <label style={fieldLabel}>Email *</label>
                <input
                  type="email" className="field-input" value={form.email}
                  onChange={e => sf('email', e.target.value)} placeholder="user@church.org"
                  disabled={!!editing}
                  style={editing ? { background: 'var(--page-bg)', color: 'var(--text-3)' } : {}}
                />
              </div>
              <div>
                <label style={fieldLabel}>Mobile</label>
                <input className="field-input" value={form.mobile} onChange={e => sf('mobile', e.target.value)} placeholder="+91 99999 99999" />
              </div>
              {!editing && (
                <div>
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
              <div>
                <label style={fieldLabel}>Role *</label>
                <select
                  className="field-input"
                  value={form.role}
                  onChange={e => sf('role', e.target.value)}
                >
                  <option value="">Select role…</option>
                  {ROLES.map(r => (
                    <option key={r.value} value={r.value}>{r.label}</option>
                  ))}
                </select>
              </div>

              {PERMS[form.role] && (
                <div style={{
                  borderRadius: 10, padding: 12, background: 'var(--page-bg)',
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
              display: 'flex', gap: 8, background: 'var(--card-bg)',
            }}>
              <button
                type="button" onClick={save} disabled={saving}
                className="btn btn-primary"
                style={{ flex: 1, height: 42, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}
              >
                {saving
                  ? <><Loader2 size={14} className="animate-spin" /> Saving…</>
                  : <><Save size={14} />{editing ? ' Update' : ' Create'}</>}
              </button>
              <button type="button" onClick={closePanel} className="btn btn-secondary" style={{ height: 42, padding: '0 14px' }}>
                <RotateCcw size={14} />
              </button>
            </div>
          </aside>
        </div>
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
            Set a new password for <strong>{resetDialog.name}</strong>. It will be stored so you can view it in the directory.
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
        @keyframes usersRowIn {
          from { opacity: 0; transform: translateY(4px); }
          to { opacity: 1; transform: none; }
        }
        @keyframes usersPanelIn {
          from { transform: translateX(24px); opacity: 0.6; }
          to { transform: none; opacity: 1; }
        }
        .users-table tbody tr:hover td {
          background: color-mix(in srgb, var(--accent-subtle) 70%, transparent);
        }
        @media (max-width: 640px) {
          .users-panel { max-width: 100% !important; }
        }
      `}</style>
    </div>
  )
}

const miniIconBtn = {
  width: 28, height: 28, borderRadius: 7, border: 'none',
  background: 'transparent', cursor: 'pointer', color: 'var(--text-3)',
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
}

const rowBtn = {
  display: 'inline-flex', alignItems: 'center', gap: 4,
  fontSize: 11, fontWeight: 700, padding: '5px 8px', borderRadius: 7,
  border: '1px solid var(--card-border)', background: 'var(--card-bg)',
  color: 'var(--text-2)', cursor: 'pointer',
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
