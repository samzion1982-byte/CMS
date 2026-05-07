/* ═══════════════════════════════════════════════════════════════
   JournalEntryPage.jsx — List + Create/Edit Journal Entries
   ═══════════════════════════════════════════════════════════════ */

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import { useToast } from '../lib/toast'
import {
  getFY, fyOptions, fmtAmt, fmtDate,
  getJournalEntries, getJournalEntryWithLines, createJournalEntry,
  updateJournalEntry, postJournalEntry, deleteJournalEntry,
  nextEntryNumber, getChartOfAccounts, getPostableAccountsWithPath,
  getEntrySystemStatus,
  VOUCHER_TYPES, VOUCHER_COLOR, TYPE_COLOR,
} from '../lib/accountingLib'
import {
  Plus, Search, X, Save, Edit2, Trash2, CheckSquare,
  FileText, ArrowLeft, Loader2, PlusCircle, Minus, AlertCircle, ChevronDown,
} from 'lucide-react'

// ── Voucher type badge ────────────────────────────────────────────

function VBadge({ type }) {
  const c = VOUCHER_COLOR[type] || { bg: '#f1f5f9', text: '#475569' }
  return <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: c.bg, color: c.text }}>{type}</span>
}

// ════════════════════════════════════════════════════════════════
//  LIST PAGE
// ════════════════════════════════════════════════════════════════

export default function JournalEntryPage() {
  const navigate = useNavigate()
  const { id: routeId } = useParams()
  const [checked, setChecked] = useState(false)

  useEffect(() => {
    getEntrySystemStatus().then(s => {
      if (!s.locked) { navigate('/accounting', { replace: true }); return }
      setChecked(true)
    }).catch(() => setChecked(true))
  }, [navigate])

  if (!checked) return (
    <div className="page-container">
      <div style={{ padding: 60, textAlign: 'center', color: 'var(--text-3)' }}>
        <Loader2 size={24} className="animate-spin" style={{ display: 'block', margin: '0 auto 8px' }} />
      </div>
    </div>
  )

  if (routeId === 'new' || (routeId && routeId !== 'new')) {
    return <JournalEntryForm entryId={routeId === 'new' ? null : routeId} />
  }
  return <JournalEntryList />
}

// ── List ─────────────────────────────────────────────────────────

function JournalEntryList() {
  const toast = useToast()
  const navigate = useNavigate()

  const [entries,    setEntries]    = useState([])
  const [loading,    setLoading]    = useState(true)
  const [fy,         setFy]         = useState(getFY())
  const [search,     setSearch]     = useState('')
  const [filterType, setFilterType] = useState('')
  const [filterPost, setFilterPost] = useState('')
  const [fyOpen,     setFyOpen]     = useState(false)
  const FYS = fyOptions()

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await getJournalEntries({
        fy,
        type:   filterType || undefined,
        posted: filterPost === '' ? undefined : filterPost === 'true',
      })
      setEntries(data)
    } catch (e) { toast(e.message, 'error') }
    setLoading(false)
  }, [fy, filterType, filterPost, toast])

  useEffect(() => { load() }, [load])

  async function handlePost(id, e) {
    e.stopPropagation()
    const { profile } = useAuth ? {} : {}
    try {
      // We post with a placeholder email since this is called from list
      await postJournalEntry(id, 'user')
      toast('Entry posted successfully.', 'success')
      load()
    } catch (err) { toast(err.message, 'error') }
  }

  async function handleDelete(id, e) {
    e.stopPropagation()
    if (!window.confirm('Delete this draft entry?')) return
    try {
      await deleteJournalEntry(id, 'user')
      toast('Entry deleted.', 'success')
      load()
    } catch (err) { toast(err.message, 'error') }
  }

  const filtered = entries.filter(e => {
    if (!search) return true
    const q = search.toLowerCase()
    return e.entry_number.toLowerCase().includes(q) || (e.narration || '').toLowerCase().includes(q)
  })

  const totalDebit  = filtered.reduce((s, e) => s + Number(e.total_debit  || 0), 0)
  const totalCredit = filtered.reduce((s, e) => s + Number(e.total_credit || 0), 0)

  return (
    <div className="page-container">
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={() => navigate('/accounting')} style={{ padding: '6px 8px', background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: 7, cursor: 'pointer', display: 'flex', alignItems: 'center', color: 'var(--text-2)' }}>
            <ArrowLeft size={15} />
          </button>
          <div>
            <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
              <FileText size={20} style={{ color: 'var(--accent)' }} /> Journal Entries
            </h1>
            <p className="page-subtitle">Voucher register &amp; transaction ledger</p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {/* FY */}
          <div style={{ position: 'relative' }}>
            <button onClick={() => setFyOpen(o => !o)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', background: 'var(--card-bg)', border: '1.5px solid var(--card-border)', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', color: 'var(--text-1)' }}>
              FY {fy} <ChevronDown size={13} />
            </button>
            {fyOpen && (
              <div style={{ position: 'absolute', top: '110%', right: 0, background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: 9, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', zIndex: 50, minWidth: 140 }}>
                {FYS.map(f => (
                  <button key={f} onClick={() => { setFy(f); setFyOpen(false) }} style={{ display: 'block', width: '100%', padding: '9px 16px', fontSize: 13, textAlign: 'left', background: f === fy ? 'var(--sidebar-item-active-bg)' : 'transparent', color: f === fy ? 'var(--accent)' : 'var(--text-1)', fontWeight: f === fy ? 700 : 400, border: 'none', cursor: 'pointer' }}>FY {f}</button>
                ))}
              </div>
            )}
          </div>
          <button onClick={() => navigate('/accounting/journal-entry/new')} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 16px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            <Plus size={15} /> New Entry
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="card" style={{ padding: '12px 16px', marginBottom: 20, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
          <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search entry # or narration…"
            style={{ width: '100%', paddingLeft: 30, paddingRight: 10, height: 36, border: '1.5px solid var(--card-border)', borderRadius: 8, fontSize: 13, background: 'var(--input-bg)', color: 'var(--text-1)', outline: 'none', boxSizing: 'border-box' }} />
          {search && <button onClick={() => setSearch('')} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', display: 'flex' }}><X size={13} /></button>}
        </div>
        <select value={filterType} onChange={e => setFilterType(e.target.value)} style={{ height: 36, padding: '0 12px', border: '1.5px solid var(--card-border)', borderRadius: 8, fontSize: 13, background: 'var(--input-bg)', color: 'var(--text-1)', outline: 'none' }}>
          <option value="">All Types</option>
          {VOUCHER_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <select value={filterPost} onChange={e => setFilterPost(e.target.value)} style={{ height: 36, padding: '0 12px', border: '1.5px solid var(--card-border)', borderRadius: 8, fontSize: 13, background: 'var(--input-bg)', color: 'var(--text-1)', outline: 'none' }}>
          <option value="">All Status</option>
          <option value="false">Drafts</option>
          <option value="true">Posted</option>
        </select>
        <span style={{ fontSize: 12, color: 'var(--text-3)', marginLeft: 'auto' }}>{filtered.length} entries</span>
      </div>

      {/* Table */}
      <div className="card" style={{ overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-3)' }}><Loader2 size={24} className="animate-spin" style={{ display: 'block', margin: '0 auto 8px' }} />Loading…</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-3)' }}>
            <FileText size={28} style={{ opacity: 0.3, display: 'block', margin: '0 auto 8px' }} />
            <p style={{ margin: 0, fontSize: 13 }}>No entries found</p>
          </div>
        ) : (
          <>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead style={{ background: 'var(--table-header-bg)' }}>
                  <tr>
                    {['Entry #','Date','Type','Narration','Ref No','Debit','Credit','Status','Actions'].map(h => (
                      <th key={h} style={{ padding: '9px 14px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-3)', textAlign: ['Debit','Credit'].includes(h) ? 'right' : 'left', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((e, i) => (
                    <tr key={e.id} onClick={() => navigate(`/accounting/journal-entries/${e.id}`)}
                      style={{ background: i % 2 ? 'rgba(0,0,0,0.012)' : 'transparent', cursor: 'pointer' }}
                      onMouseEnter={ev => ev.currentTarget.style.background = 'var(--sidebar-item-hover)'}
                      onMouseLeave={ev => ev.currentTarget.style.background = i % 2 ? 'rgba(0,0,0,0.012)' : 'transparent'}
                    >
                      <td style={{ padding: '10px 14px', fontSize: 12, fontWeight: 700, fontFamily: 'monospace', color: 'var(--accent)', whiteSpace: 'nowrap' }}>{e.entry_number}</td>
                      <td style={{ padding: '10px 14px', fontSize: 12, color: 'var(--text-2)', whiteSpace: 'nowrap' }}>
                        {e.entry_date ? new Date(e.entry_date + 'T00:00:00').toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' }) : '—'}
                      </td>
                      <td style={{ padding: '10px 14px' }}><VBadge type={e.voucher_type} /></td>
                      <td style={{ padding: '10px 14px', fontSize: 12, color: 'var(--text-2)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.narration || '—'}</td>
                      <td style={{ padding: '10px 14px', fontSize: 12, color: 'var(--text-3)' }}>{e.reference_no || '—'}</td>
                      <td style={{ padding: '10px 14px', fontSize: 12, fontFamily: 'monospace', textAlign: 'right', color: '#2563eb' }}>{fmtAmt(e.total_debit)}</td>
                      <td style={{ padding: '10px 14px', fontSize: 12, fontFamily: 'monospace', textAlign: 'right', color: '#16a34a' }}>{fmtAmt(e.total_credit)}</td>
                      <td style={{ padding: '10px 14px' }}>
                        <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: e.is_posted ? '#dcfce7' : '#fff7ed', color: e.is_posted ? '#16a34a' : '#c2410c' }}>
                          {e.is_posted ? 'Posted' : 'Draft'}
                        </span>
                      </td>
                      <td style={{ padding: '10px 14px' }} onClick={ev => ev.stopPropagation()}>
                        <div style={{ display: 'flex', gap: 5 }}>
                          {!e.is_posted && (
                            <>
                              <button onClick={ev => { ev.stopPropagation(); navigate(`/accounting/journal-entries/${e.id}`) }} style={{ padding: '4px 8px', background: '#dbeafe', color: '#2563eb', border: 'none', borderRadius: 5, fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>Edit</button>
                              <button onClick={async ev => { ev.stopPropagation(); try { await postJournalEntry(e.id, 'user'); toast('Posted!', 'success'); load() } catch(err){toast(err.message,'error')} }} style={{ padding: '4px 8px', background: '#dcfce7', color: '#16a34a', border: 'none', borderRadius: 5, fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>Post</button>
                              <button onClick={async ev => { ev.stopPropagation(); if(!window.confirm('Delete?')) return; try { await deleteJournalEntry(e.id, 'user'); toast('Deleted.','success'); load() } catch(err){toast(err.message,'error')} }} style={{ padding: '4px 8px', background: '#fee2e2', color: '#b91c1c', border: 'none', borderRadius: 5, fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>Del</button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot style={{ background: 'var(--table-header-bg)', borderTop: '2px solid var(--card-border)' }}>
                  <tr>
                    <td colSpan={5} style={{ padding: '10px 14px', fontSize: 12, fontWeight: 700, color: 'var(--text-2)' }}>Total ({filtered.length} entries)</td>
                    <td style={{ padding: '10px 14px', fontSize: 13, fontWeight: 800, fontFamily: 'monospace', textAlign: 'right', color: '#2563eb' }}>{fmtAmt(totalDebit)}</td>
                    <td style={{ padding: '10px 14px', fontSize: 13, fontWeight: 800, fontFamily: 'monospace', textAlign: 'right', color: '#16a34a' }}>{fmtAmt(totalCredit)}</td>
                    <td colSpan={2} style={{ padding: '10px 14px' }}>
                      {Math.abs(totalDebit - totalCredit) < 0.01
                        ? <span style={{ fontSize: 11, fontWeight: 700, color: '#16a34a' }}>✓ Balanced</span>
                        : <span style={{ fontSize: 11, fontWeight: 700, color: '#c2410c' }}>Diff: {fmtAmt(Math.abs(totalDebit - totalCredit))}</span>
                      }
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════
//  FORM (New / Edit)
// ════════════════════════════════════════════════════════════════

function JournalEntryForm({ entryId }) {
  const { profile } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()

  const today = new Date().toISOString().slice(0, 10)
  const currentFY = getFY()

  const [accounts, setAccounts]   = useState([])
  const [loading,  setLoading]    = useState(!!entryId)
  const [saving,   setSaving]     = useState(false)
  const [posting,  setPosting]    = useState(false)
  const [isPosted, setIsPosted]   = useState(false)

  const [header, setHeader] = useState({
    entry_number:  '',
    entry_date:    today,
    financial_year: currentFY,
    voucher_type:  'Receipt',
    narration:     '',
    reference_no:  '',
  })

  const [lines, setLines] = useState([
    { account_id: '', debit_amount: '', credit_amount: '', description: '' },
    { account_id: '', debit_amount: '', credit_amount: '', description: '' },
  ])

  useEffect(() => {
    getChartOfAccounts(true).then(all => setAccounts(getPostableAccountsWithPath(all))).catch(() => {})
  }, [])

  useEffect(() => {
    if (!entryId) {
      // Auto-generate entry number
      nextEntryNumber(currentFY, 'Receipt').then(n => setHeader(h => ({ ...h, entry_number: n }))).catch(() => {})
      return
    }
    setLoading(true)
    getJournalEntryWithLines(entryId).then(entry => {
      setIsPosted(entry.is_posted)
      setHeader({
        entry_number:   entry.entry_number,
        entry_date:     entry.entry_date,
        financial_year: entry.financial_year,
        voucher_type:   entry.voucher_type,
        narration:      entry.narration || '',
        reference_no:   entry.reference_no || '',
      })
      setLines(entry.journal_entry_lines.map(l => ({
        account_id:    l.account_id,
        debit_amount:  l.debit_amount || '',
        credit_amount: l.credit_amount || '',
        description:   l.description || '',
      })))
      setLoading(false)
    }).catch(e => { toast(e.message, 'error'); setLoading(false) })
  }, [entryId, currentFY, toast])

  // Auto-update entry number when voucher type changes (new entry only)
  useEffect(() => {
    if (entryId) return
    nextEntryNumber(header.financial_year, header.voucher_type)
      .then(n => setHeader(h => ({ ...h, entry_number: n })))
      .catch(() => {})
  }, [header.voucher_type, header.financial_year, entryId])

  const sh = (k, v) => setHeader(h => ({ ...h, [k]: v }))

  const totalDebit  = lines.reduce((s, l) => s + (parseFloat(l.debit_amount)  || 0), 0)
  const totalCredit = lines.reduce((s, l) => s + (parseFloat(l.credit_amount) || 0), 0)
  const diff        = Math.abs(totalDebit - totalCredit)
  const balanced    = diff < 0.01

  function addLine() {
    setLines(ls => [...ls, { account_id: '', debit_amount: '', credit_amount: '', description: '' }])
  }
  function removeLine(i) {
    setLines(ls => ls.filter((_, idx) => idx !== i))
  }
  function setLine(i, k, v) {
    setLines(ls => ls.map((l, idx) => idx === i ? { ...l, [k]: v } : l))
  }

  async function handleSave(andPost = false) {
    if (!header.entry_date) { toast('Entry date is required', 'error'); return }
    const validLines = lines.filter(l => l.account_id && (parseFloat(l.debit_amount) > 0 || parseFloat(l.credit_amount) > 0))
    if (validLines.length < 2) { toast('At least 2 line items with amounts are required', 'error'); return }
    if (!balanced) { toast(`Entry is not balanced. Difference: ₹${diff.toFixed(2)}`, 'error'); return }

    setSaving(true)
    try {
      let je
      if (entryId) {
        je = await updateJournalEntry(entryId, header, validLines, profile.email)
      } else {
        je = await createJournalEntry(header, validLines, profile.email)
      }
      if (andPost) {
        await postJournalEntry(je.id, profile.email)
        toast('Entry saved and posted!', 'success')
      } else {
        toast('Entry saved as draft.', 'success')
      }
      navigate('/accounting/journal-entries')
    } catch (e) { toast(e.message, 'error') }
    setSaving(false)
  }

  if (loading) return (
    <div className="page-container">
      <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-3)' }}>
        <Loader2 size={28} className="animate-spin" style={{ display: 'block', margin: '0 auto 10px' }} />
        Loading entry…
      </div>
    </div>
  )

  const VCOL = VOUCHER_COLOR[header.voucher_type] || { bg: '#f1f5f9', text: '#475569' }

  return (
    <div className="page-container">
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={() => navigate('/accounting/journal-entries')} style={{ padding: '6px 8px', background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: 7, cursor: 'pointer', display: 'flex', alignItems: 'center', color: 'var(--text-2)' }}>
            <ArrowLeft size={15} />
          </button>
          <div>
            <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
              <FileText size={20} style={{ color: 'var(--accent)' }} />
              {isPosted ? `View: ${header.entry_number}` : (entryId ? `Edit: ${header.entry_number}` : 'New Journal Entry')}
            </h1>
            <p className="page-subtitle">{isPosted ? 'Posted entry (read-only)' : 'Fill debit and credit accounts'}</p>
          </div>
        </div>
        {!isPosted && (
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => handleSave(false)} disabled={saving} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 16px', background: 'var(--card-bg)', border: '1.5px solid var(--card-border)', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', color: 'var(--text-1)' }}>
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Save Draft
            </button>
            <button onClick={() => handleSave(true)} disabled={saving || !balanced} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 16px', background: balanced ? '#16a34a' : '#e5e7eb', color: balanced ? '#fff' : '#9ca3af', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: balanced ? 'pointer' : 'not-allowed' }}>
              {saving ? <Loader2 size={14} className="animate-spin" /> : <CheckSquare size={14} />} Save &amp; Post
            </button>
          </div>
        )}
      </div>

      {/* Voucher type selector */}
      {!isPosted && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
          {VOUCHER_TYPES.map(t => {
            const vc = VOUCHER_COLOR[t] || { bg: '#f1f5f9', text: '#475569' }
            const active = header.voucher_type === t
            return (
              <button key={t} onClick={() => sh('voucher_type', t)}
                style={{ padding: '7px 18px', borderRadius: 99, fontSize: 12, fontWeight: 700, cursor: 'pointer', border: `2px solid ${active ? vc.text : 'var(--card-border)'}`, background: active ? vc.bg : 'var(--card-bg)', color: active ? vc.text : 'var(--text-2)', transition: 'all 0.15s' }}>
                {t}
              </button>
            )
          })}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>
        {/* Header fields */}
        <div className="card" style={{ padding: '18px 20px' }}>
          <p style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-3)', margin: '0 0 14px' }}>Entry Details</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-3)', display: 'block', marginBottom: 5 }}>Entry Number</label>
              <input value={header.entry_number} onChange={e => sh('entry_number', e.target.value)} disabled={isPosted}
                style={{ width: '100%', height: 36, padding: '0 10px', border: '1.5px solid var(--card-border)', borderRadius: 8, fontSize: 13, fontFamily: 'monospace', fontWeight: 700, background: 'var(--input-bg)', color: 'var(--text-1)', outline: 'none', boxSizing: 'border-box' }} />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-3)', display: 'block', marginBottom: 5 }}>Entry Date *</label>
              <input type="date" value={header.entry_date} onChange={e => sh('entry_date', e.target.value)} disabled={isPosted}
                style={{ width: '100%', height: 36, padding: '0 10px', border: '1.5px solid var(--card-border)', borderRadius: 8, fontSize: 13, background: 'var(--input-bg)', color: 'var(--text-1)', outline: 'none', boxSizing: 'border-box' }} />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-3)', display: 'block', marginBottom: 5 }}>Financial Year</label>
              <input value={header.financial_year} disabled
                style={{ width: '100%', height: 36, padding: '0 10px', border: '1.5px solid var(--card-border)', borderRadius: 8, fontSize: 13, background: 'var(--input-bg)', color: 'var(--text-3)', outline: 'none', boxSizing: 'border-box' }} />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-3)', display: 'block', marginBottom: 5 }}>Reference No</label>
              <input value={header.reference_no} onChange={e => sh('reference_no', e.target.value)} disabled={isPosted} placeholder="e.g. Cheque no."
                style={{ width: '100%', height: 36, padding: '0 10px', border: '1.5px solid var(--card-border)', borderRadius: 8, fontSize: 13, background: 'var(--input-bg)', color: 'var(--text-1)', outline: 'none', boxSizing: 'border-box' }} />
            </div>
          </div>
        </div>

        {/* Narration + Balance summary */}
        <div className="card" style={{ padding: '18px 20px' }}>
          <p style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-3)', margin: '0 0 14px' }}>Narration &amp; Summary</p>
          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-3)', display: 'block', marginBottom: 5 }}>Narration / Description</label>
            <textarea value={header.narration} onChange={e => sh('narration', e.target.value)} disabled={isPosted} rows={3} placeholder="Describe the transaction…"
              style={{ width: '100%', padding: '8px 10px', border: '1.5px solid var(--card-border)', borderRadius: 8, fontSize: 13, background: 'var(--input-bg)', color: 'var(--text-1)', outline: 'none', resize: 'none', boxSizing: 'border-box' }} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
            <div style={{ textAlign: 'center', padding: '8px', background: '#dbeafe33', borderRadius: 8 }}>
              <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: '#2563eb', margin: '0 0 2px' }}>Total Debit</p>
              <p style={{ fontSize: 16, fontWeight: 800, fontFamily: 'monospace', color: '#2563eb', margin: 0 }}>{fmtAmt(totalDebit)}</p>
            </div>
            <div style={{ textAlign: 'center', padding: '8px', background: '#dcfce733', borderRadius: 8 }}>
              <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: '#16a34a', margin: '0 0 2px' }}>Total Credit</p>
              <p style={{ fontSize: 16, fontWeight: 800, fontFamily: 'monospace', color: '#16a34a', margin: 0 }}>{fmtAmt(totalCredit)}</p>
            </div>
            <div style={{ textAlign: 'center', padding: '8px', background: balanced ? '#dcfce733' : '#fee2e233', borderRadius: 8, border: `1.5px solid ${balanced ? '#16a34a44' : '#b91c1c44'}` }}>
              <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: balanced ? '#16a34a' : '#b91c1c', margin: '0 0 2px' }}>Balance</p>
              <p style={{ fontSize: 15, fontWeight: 800, fontFamily: 'monospace', color: balanced ? '#16a34a' : '#b91c1c', margin: 0 }}>{balanced ? '✓ OK' : fmtAmt(diff)}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Lines */}
      <div className="card" style={{ overflow: 'hidden', marginBottom: 20 }}>
        <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--card-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)', margin: 0 }}>Transaction Lines</p>
          {!isPosted && (
            <button onClick={addLine} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 12px', background: '#dbeafe', color: '#2563eb', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
              <PlusCircle size={13} /> Add Line
            </button>
          )}
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead style={{ background: 'var(--table-header-bg)' }}>
              <tr>
                <th style={{ padding: '8px 14px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-3)', textAlign: 'left', width: 40 }}>#</th>
                <th style={{ padding: '8px 14px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-3)', textAlign: 'left' }}>Account</th>
                <th style={{ padding: '8px 14px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-3)', textAlign: 'left' }}>Description</th>
                <th style={{ padding: '8px 14px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#2563eb', textAlign: 'right', width: 140 }}>Debit (₹)</th>
                <th style={{ padding: '8px 14px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#16a34a', textAlign: 'right', width: 140 }}>Credit (₹)</th>
                {!isPosted && <th style={{ width: 40 }}></th>}
              </tr>
            </thead>
            <tbody>
              {lines.map((line, i) => (
                <tr key={i} style={{ background: i % 2 ? 'rgba(0,0,0,0.012)' : 'transparent' }}>
                  <td style={{ padding: '8px 14px', fontSize: 12, color: 'var(--text-3)', textAlign: 'center' }}>{i + 1}</td>
                  <td style={{ padding: '6px 10px' }}>
                    <select value={line.account_id} onChange={e => setLine(i, 'account_id', e.target.value)} disabled={isPosted}
                      style={{ width: '100%', height: 34, padding: '0 8px', border: '1.5px solid var(--card-border)', borderRadius: 7, fontSize: 12, background: 'var(--input-bg)', color: 'var(--text-1)', outline: 'none' }}>
                      <option value="">— Select Ledger —</option>
                      {['Asset','Liability','Equity','Income','Expense'].map(type => {
                        const group = accounts.filter(a => a.account_type === type)
                        if (!group.length) return null
                        return (
                          <optgroup key={type} label={type}>
                            {group.map(a => <option key={a.id} value={a.id}>{a.path}</option>)}
                          </optgroup>
                        )
                      })}
                    </select>
                  </td>
                  <td style={{ padding: '6px 10px' }}>
                    <input value={line.description} onChange={e => setLine(i, 'description', e.target.value)} disabled={isPosted} placeholder="Optional"
                      style={{ width: '100%', height: 34, padding: '0 8px', border: '1.5px solid var(--card-border)', borderRadius: 7, fontSize: 12, background: 'var(--input-bg)', color: 'var(--text-1)', outline: 'none', boxSizing: 'border-box' }} />
                  </td>
                  <td style={{ padding: '6px 10px' }}>
                    <input type="number" min="0" step="0.01" value={line.debit_amount} onChange={e => setLine(i, 'debit_amount', e.target.value)} disabled={isPosted} placeholder="0.00"
                      style={{ width: '100%', height: 34, padding: '0 8px', border: '1.5px solid var(--card-border)', borderRadius: 7, fontSize: 12, fontFamily: 'monospace', textAlign: 'right', background: parseFloat(line.debit_amount) > 0 ? '#dbeafe22' : 'var(--input-bg)', color: '#2563eb', outline: 'none', boxSizing: 'border-box' }} />
                  </td>
                  <td style={{ padding: '6px 10px' }}>
                    <input type="number" min="0" step="0.01" value={line.credit_amount} onChange={e => setLine(i, 'credit_amount', e.target.value)} disabled={isPosted} placeholder="0.00"
                      style={{ width: '100%', height: 34, padding: '0 8px', border: '1.5px solid var(--card-border)', borderRadius: 7, fontSize: 12, fontFamily: 'monospace', textAlign: 'right', background: parseFloat(line.credit_amount) > 0 ? '#dcfce722' : 'var(--input-bg)', color: '#16a34a', outline: 'none', boxSizing: 'border-box' }} />
                  </td>
                  {!isPosted && (
                    <td style={{ padding: '6px 10px', textAlign: 'center' }}>
                      <button onClick={() => removeLine(i)} disabled={lines.length <= 2} style={{ padding: '4px', background: 'none', border: 'none', cursor: lines.length <= 2 ? 'not-allowed' : 'pointer', color: '#b91c1c', opacity: lines.length <= 2 ? 0.3 : 1, display: 'flex', alignItems: 'center' }}>
                        <Minus size={14} />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
            <tfoot style={{ background: 'var(--table-header-bg)', borderTop: '2px solid var(--card-border)' }}>
              <tr>
                <td colSpan={3} style={{ padding: '10px 14px', fontSize: 12, fontWeight: 700, color: 'var(--text-2)' }}>TOTAL</td>
                <td style={{ padding: '10px 14px', fontSize: 13, fontWeight: 800, fontFamily: 'monospace', textAlign: 'right', color: '#2563eb' }}>{fmtAmt(totalDebit)}</td>
                <td style={{ padding: '10px 14px', fontSize: 13, fontWeight: 800, fontFamily: 'monospace', textAlign: 'right', color: '#16a34a' }}>{fmtAmt(totalCredit)}</td>
                {!isPosted && <td />}
              </tr>
              {!balanced && totalDebit > 0 && (
                <tr>
                  <td colSpan={isPosted ? 5 : 6} style={{ padding: '8px 14px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#c2410c', fontSize: 12, fontWeight: 600 }}>
                      <AlertCircle size={14} /> Entry not balanced — difference of {fmtAmt(diff)}
                    </div>
                  </td>
                </tr>
              )}
            </tfoot>
          </table>
        </div>
      </div>

      {!isPosted && (
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={() => navigate('/accounting/journal-entries')} style={{ padding: '9px 20px', background: 'var(--card-bg)', border: '1.5px solid var(--card-border)', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', color: 'var(--text-2)' }}>Cancel</button>
          <button onClick={() => handleSave(false)} disabled={saving} style={{ padding: '9px 20px', background: 'var(--card-bg)', border: '1.5px solid var(--accent)', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: 7 }}>
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Save Draft
          </button>
          <button onClick={() => handleSave(true)} disabled={saving || !balanced}
            style={{ padding: '9px 22px', background: balanced ? '#16a34a' : '#e5e7eb', color: balanced ? '#fff' : '#9ca3af', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: balanced ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', gap: 7 }}>
            {saving ? <Loader2 size={14} className="animate-spin" /> : <CheckSquare size={14} />} Save &amp; Post
          </button>
        </div>
      )}
    </div>
  )
}
