/* ═══════════════════════════════════════════════════════════════
   ChartOfAccountsPage.jsx — Manage Chart of Accounts
   ═══════════════════════════════════════════════════════════════ */

import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import { useToast } from '../lib/toast'
import {
  getChartOfAccounts, createAccount, updateAccount, deleteAccount,
  ACCOUNT_TYPES, TYPE_COLOR,
} from '../lib/accountingLib'
import { exportToExcel } from '../lib/exportExcel'
import {
  Plus, Search, X, Save, Edit2, Trash2, FileSpreadsheet,
  ChevronDown, BookOpen, ArrowLeft, Loader2, AlertCircle,
} from 'lucide-react'

const BLANK = { code: '', name: '', account_type: 'Asset', parent_id: '', description: '', opening_balance: '', opening_balance_date: '', sort_order: 0, is_active: true }

export default function ChartOfAccountsPage() {
  const { profile } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()

  const [accounts,    setAccounts]    = useState([])
  const [loading,     setLoading]     = useState(true)
  const [search,      setSearch]      = useState('')
  const [filterType,  setFilterType]  = useState('')
  const [showModal,   setShowModal]   = useState(false)
  const [editId,      setEditId]      = useState(null)
  const [form,        setForm]        = useState(BLANK)
  const [saving,      setSaving]      = useState(false)
  const [deleting,    setDeleting]    = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await getChartOfAccounts()
      setAccounts(data)
    } catch (e) { toast(e.message, 'error') }
    setLoading(false)
  }, [toast])

  useEffect(() => { load() }, [load])

  function openNew() {
    setForm(BLANK); setEditId(null); setShowModal(true)
  }
  function openEdit(a) {
    setForm({
      code: a.code, name: a.name, account_type: a.account_type,
      parent_id: a.parent_id || '', description: a.description || '',
      opening_balance: a.opening_balance || '', opening_balance_date: a.opening_balance_date || '',
      sort_order: a.sort_order || 0, is_active: a.is_active !== false,
    })
    setEditId(a.id); setShowModal(true)
  }

  async function save() {
    if (!form.code.trim()) { toast('Account code is required', 'error'); return }
    if (!form.name.trim()) { toast('Account name is required', 'error'); return }
    setSaving(true)
    try {
      const payload = {
        code: form.code.trim().toUpperCase(),
        name: form.name.trim(),
        account_type: form.account_type,
        parent_id: form.parent_id || null,
        description: form.description || null,
        opening_balance: Number(form.opening_balance) || 0,
        opening_balance_date: form.opening_balance_date || null,
        sort_order: Number(form.sort_order) || 0,
        is_active: form.is_active,
      }
      if (editId) {
        await updateAccount(editId, payload, profile.email)
        toast('Account updated.', 'success')
      } else {
        await createAccount(payload, profile.email)
        toast('Account created.', 'success')
      }
      setShowModal(false)
      load()
    } catch (e) { toast(e.message, 'error') }
    setSaving(false)
  }

  async function handleDelete(id) {
    if (!window.confirm('Delete this account? This cannot be undone.')) return
    setDeleting(id)
    try {
      await deleteAccount(id, profile.email)
      toast('Account deleted.', 'success')
      load()
    } catch (e) { toast(e.message, 'error') }
    setDeleting(null)
  }

  function doExport() {
    const rows = filtered.map(a => ({
      Code: a.code, Name: a.name, Type: a.account_type,
      'Opening Balance': a.opening_balance || 0,
      Status: a.is_active ? 'Active' : 'Inactive',
    }))
    exportToExcel(rows, 'ChartOfAccounts')
  }

  const filtered = accounts.filter(a => {
    const q = search.toLowerCase()
    const matchQ = !q || a.code.toLowerCase().includes(q) || a.name.toLowerCase().includes(q)
    const matchT = !filterType || a.account_type === filterType
    return matchQ && matchT
  })

  // Group by type for display
  const grouped = ACCOUNT_TYPES.reduce((acc, t) => {
    acc[t] = filtered.filter(a => a.account_type === t)
    return acc
  }, {})

  const s = (k, v) => setForm(f => ({ ...f, [k]: v }))

  return (
    <div className="page-container">

      {/* Header */}
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={() => navigate('/accounting')} style={{ padding: '6px 8px', background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: 7, cursor: 'pointer', display: 'flex', alignItems: 'center', color: 'var(--text-2)' }}>
            <ArrowLeft size={15} />
          </button>
          <div>
            <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
              <BookOpen size={20} style={{ color: 'var(--accent)' }} /> Chart of Accounts
            </h1>
            <p className="page-subtitle">Manage account heads and ledger groups</p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={doExport} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 14px', background: '#16a34a', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            <FileSpreadsheet size={15} /> Export
          </button>
          <button onClick={openNew} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 16px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', boxShadow: '0 2px 8px rgba(37,99,235,0.25)' }}>
            <Plus size={15} /> Add Account
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="card" style={{ padding: '12px 16px', marginBottom: 20, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
          <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by code or name…"
            style={{ width: '100%', paddingLeft: 30, paddingRight: 10, height: 36, border: '1.5px solid var(--card-border)', borderRadius: 8, fontSize: 13, background: 'var(--input-bg)', color: 'var(--text-1)', outline: 'none', boxSizing: 'border-box' }} />
          {search && <button onClick={() => setSearch('')} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', display: 'flex' }}><X size={13} /></button>}
        </div>
        <select value={filterType} onChange={e => setFilterType(e.target.value)}
          style={{ height: 36, padding: '0 12px', border: '1.5px solid var(--card-border)', borderRadius: 8, fontSize: 13, background: 'var(--input-bg)', color: 'var(--text-1)', outline: 'none', minWidth: 140 }}>
          <option value="">All Types</option>
          {ACCOUNT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{filtered.length} accounts</span>
      </div>

      {/* Grouped tables */}
      {loading ? (
        <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--text-3)' }}>
          <Loader2 size={24} className="animate-spin" style={{ margin: '0 auto 8px', display: 'block' }} />
          Loading accounts…
        </div>
      ) : (
        ACCOUNT_TYPES.map(type => {
          const rows = grouped[type]
          if (rows.length === 0) return null
          const c = TYPE_COLOR[type]
          return (
            <div key={type} className="card" style={{ overflow: 'hidden', marginBottom: 16 }}>
              {/* Type header */}
              <div style={{ padding: '12px 20px', background: c.bg + '44', borderBottom: '1px solid var(--card-border)', display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: c.text }} />
                <span style={{ fontSize: 13, fontWeight: 700, color: c.text }}>{type} Accounts</span>
                <span style={{ fontSize: 11, color: c.text, opacity: 0.7 }}>({rows.length})</span>
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead style={{ background: 'var(--table-header-bg)' }}>
                  <tr>
                    {['Code', 'Account Name', 'Opening Balance', 'Status', 'Actions'].map(h => (
                      <th key={h} style={{ padding: '8px 16px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-3)', textAlign: h === 'Opening Balance' ? 'right' : 'left', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((a, i) => (
                    <tr key={a.id} style={{ background: i % 2 ? 'rgba(0,0,0,0.012)' : 'transparent' }}>
                      <td style={{ padding: '10px 16px', fontSize: 12, fontWeight: 700, fontFamily: 'monospace', color: c.text }}>{a.code}</td>
                      <td style={{ padding: '10px 16px', fontSize: 13, color: 'var(--text-1)' }}>
                        {a.name}
                        {a.description && <span style={{ fontSize: 11, color: 'var(--text-3)', marginLeft: 8 }}>— {a.description}</span>}
                      </td>
                      <td style={{ padding: '10px 16px', fontSize: 12, fontFamily: 'monospace', textAlign: 'right', color: 'var(--text-2)' }}>
                        {a.opening_balance ? `₹${Number(a.opening_balance).toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '—'}
                      </td>
                      <td style={{ padding: '10px 16px' }}>
                        <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: a.is_active ? '#dcfce7' : '#f1f5f9', color: a.is_active ? '#16a34a' : '#94a3b8' }}>
                          {a.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td style={{ padding: '10px 16px' }}>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button onClick={() => openEdit(a)} style={{ padding: '5px 10px', background: '#dbeafe', color: '#2563eb', border: 'none', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                            <Edit2 size={11} /> Edit
                          </button>
                          <button onClick={() => handleDelete(a.id)} disabled={deleting === a.id} style={{ padding: '5px 10px', background: '#fee2e2', color: '#b91c1c', border: 'none', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                            {deleting === a.id ? <Loader2 size={11} className="animate-spin" /> : <Trash2 size={11} />}
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        })
      )}

      {!loading && filtered.length === 0 && (
        <div className="card" style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-3)' }}>
          <BookOpen size={28} style={{ opacity: 0.3, marginBottom: 8, display: 'block', margin: '0 auto 8px' }} />
          <p style={{ fontSize: 13, margin: 0 }}>No accounts found</p>
          {!search && !filterType && <button onClick={openNew} style={{ marginTop: 12, fontSize: 12, fontWeight: 600, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer' }}>Add your first account</button>}
        </div>
      )}

      {/* ── Modal ───────────────────────────────────────────────── */}
      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: 'var(--card-bg)', borderRadius: 14, width: '100%', maxWidth: 480, maxHeight: '90vh', overflow: 'auto', boxShadow: '0 24px 60px rgba(0,0,0,0.3)' }}>
            <div style={{ padding: '18px 22px', borderBottom: '1px solid var(--card-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-1)', margin: 0 }}>{editId ? 'Edit Account' : 'New Account'}</p>
              <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', display: 'flex' }}><X size={18} /></button>
            </div>

            <div style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-3)', display: 'block', marginBottom: 5 }}>Account Code *</label>
                  <input value={form.code} onChange={e => s('code', e.target.value)} placeholder="e.g. 1001"
                    style={{ width: '100%', height: 36, padding: '0 10px', border: '1.5px solid var(--card-border)', borderRadius: 8, fontSize: 13, background: 'var(--input-bg)', color: 'var(--text-1)', outline: 'none', boxSizing: 'border-box' }} />
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-3)', display: 'block', marginBottom: 5 }}>Account Type *</label>
                  <select value={form.account_type} onChange={e => s('account_type', e.target.value)}
                    style={{ width: '100%', height: 36, padding: '0 10px', border: '1.5px solid var(--card-border)', borderRadius: 8, fontSize: 13, background: 'var(--input-bg)', color: 'var(--text-1)', outline: 'none', boxSizing: 'border-box' }}>
                    {ACCOUNT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-3)', display: 'block', marginBottom: 5 }}>Account Name *</label>
                <input value={form.name} onChange={e => s('name', e.target.value)} placeholder="e.g. Cash in Hand"
                  style={{ width: '100%', height: 36, padding: '0 10px', border: '1.5px solid var(--card-border)', borderRadius: 8, fontSize: 13, background: 'var(--input-bg)', color: 'var(--text-1)', outline: 'none', boxSizing: 'border-box' }} />
              </div>

              <div>
                <label style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-3)', display: 'block', marginBottom: 5 }}>Description</label>
                <input value={form.description} onChange={e => s('description', e.target.value)} placeholder="Optional description"
                  style={{ width: '100%', height: 36, padding: '0 10px', border: '1.5px solid var(--card-border)', borderRadius: 8, fontSize: 13, background: 'var(--input-bg)', color: 'var(--text-1)', outline: 'none', boxSizing: 'border-box' }} />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-3)', display: 'block', marginBottom: 5 }}>Opening Balance (₹)</label>
                  <input type="number" value={form.opening_balance} onChange={e => s('opening_balance', e.target.value)} placeholder="0.00"
                    style={{ width: '100%', height: 36, padding: '0 10px', border: '1.5px solid var(--card-border)', borderRadius: 8, fontSize: 13, background: 'var(--input-bg)', color: 'var(--text-1)', outline: 'none', boxSizing: 'border-box' }} />
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-3)', display: 'block', marginBottom: 5 }}>As of Date</label>
                  <input type="date" value={form.opening_balance_date} onChange={e => s('opening_balance_date', e.target.value)}
                    style={{ width: '100%', height: 36, padding: '0 10px', border: '1.5px solid var(--card-border)', borderRadius: 8, fontSize: 13, background: 'var(--input-bg)', color: 'var(--text-1)', outline: 'none', boxSizing: 'border-box' }} />
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <input type="checkbox" id="is_active" checked={form.is_active} onChange={e => s('is_active', e.target.checked)} style={{ width: 16, height: 16, cursor: 'pointer' }} />
                <label htmlFor="is_active" style={{ fontSize: 13, color: 'var(--text-1)', cursor: 'pointer' }}>Active account</label>
              </div>
            </div>

            <div style={{ padding: '14px 22px', borderTop: '1px solid var(--card-border)', display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowModal(false)} style={{ padding: '8px 18px', background: 'var(--card-bg)', border: '1.5px solid var(--card-border)', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', color: 'var(--text-2)' }}>Cancel</button>
              <button onClick={save} disabled={saving} style={{ padding: '8px 20px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 7 }}>
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                {saving ? 'Saving…' : (editId ? 'Update' : 'Create Account')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
