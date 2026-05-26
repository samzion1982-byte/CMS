/* ═══════════════════════════════════════════════════════════════
   JournalEntryPage.jsx — List + Create/Edit Journal Entries
   ═══════════════════════════════════════════════════════════════ */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { flushSync } from 'react-dom'
const localISO = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import { useToast } from '../lib/toast'
import {
  getFY, fmtAmt, fmtDate,
  getJournalEntries, getJournalEntryWithLines, createJournalEntry,
  updateJournalEntry, updatePostedJournalEntry, postJournalEntry,
  softDeleteJournalEntry, restoreJournalEntry, permanentDeleteJournalEntry,
  nextEntryNumber, getChartOfAccounts, getPostableAccountsWithPath,
  getEntrySystemStatus, getEntryAuditLog,
  VOUCHER_TYPES, VOUCHER_COLOR, TYPE_COLOR,
} from '../lib/accountingLib'
import {
  Plus, Search, X, Save, Edit2, Trash2, CheckSquare,
  FileText, ArrowLeft, Loader2, PlusCircle, Minus, AlertCircle, ChevronDown,
  Settings, Zap, Eye, Clock, User, ShieldAlert, RotateCcw, ShieldOff, Lock,
  FileSpreadsheet, Printer, ChevronLeft, ChevronRight, ArrowUp, ArrowDown,
} from 'lucide-react'
import { useEntity } from '../lib/EntityContext'
import { useEntityFY } from '../lib/useEntityFY'
import JournalEntryModal from '../components/accounting/JournalEntryModal'
import VoucherPrint from '../components/accounting/VoucherPrint'
import AccountPicker from '../components/accounting/AccountPicker'
import { exportToExcelWithTitle } from '../lib/exportExcel'

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
  const [searchParams, setSearchParams] = useSearchParams()
  const [checked,    setChecked]    = useState(false)
  const [needsSetup, setNeedsSetup] = useState(false)

  useEffect(() => {
    getEntrySystemStatus()
      .then(s => { if (!s.locked) setNeedsSetup(true); setChecked(true) })
      .catch(() => setChecked(true))
  }, [])

  if (!checked) return (
    <div className="page-container">
      <div style={{ padding: 60, textAlign: 'center', color: 'var(--text-3)' }}>
        <Loader2 size={24} className="animate-spin" style={{ display: 'block', margin: '0 auto 8px' }} />
      </div>
    </div>
  )

  if (needsSetup) return <EntrySetupPrompt />

  if (routeId === 'new') {
    return <JournalEntryForm entryId={null} defaultVoucherType={searchParams.get('type') || 'Journal'} />
  }
  if (routeId) {
    return <JournalEntryForm entryId={routeId} />
  }
  return <JournalEntryList />
}

// ── Entry system setup prompt ─────────────────────────────────────

function EntrySetupPrompt() {
  const navigate = useNavigate()
  return (
    <div className="page-container">
      <div style={{ maxWidth: 520, margin: '80px auto', textAlign: 'center' }}>
        <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#fff7ed', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
          <Settings size={28} style={{ color: '#c2410c' }} />
        </div>
        <h2 style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-1)', margin: '0 0 10px' }}>Entry System Not Configured</h2>
        <p style={{ fontSize: 14, color: 'var(--text-2)', lineHeight: 1.6, margin: '0 0 6px' }}>
          Before creating journal entries, you need to choose your accounting method and lock it with the master password.
        </p>
        <p style={{ fontSize: 13, color: 'var(--text-3)', margin: '0 0 28px' }}>
          Go to <strong>Accounts → Settings</strong> and select Single-Entry or Double-Entry, then click <em>Lock Entry System</em>.
        </p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
          <button onClick={() => navigate(-1)}
            style={{ padding: '10px 20px', background: 'var(--card-bg)', border: '1.5px solid var(--card-border)', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', color: 'var(--text-2)' }}>
            ← Back
          </button>
          <button onClick={() => navigate('/accounting/settings')}
            style={{ padding: '10px 22px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 7 }}>
            <Settings size={14} /> Go to Settings
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Permanent Delete Modal ────────────────────────────────────────

function PermanentDeleteModal({ entry, onClose, onDeleted }) {
  const { profile } = useAuth()
  const toast = useToast()
  const [password, setPassword] = useState('')
  const [deleting, setDeleting] = useState(false)
  const inputRef = useRef(null)

  useEffect(() => { setTimeout(() => inputRef.current?.focus(), 80) }, [])

  async function handlePermanentDelete() {
    if (!password.trim()) { toast('Enter the delete password.', 'error'); return }
    setDeleting(true)
    try {
      await permanentDeleteJournalEntry(entry.id, profile.email, password)
      toast(`"${entry.entry_number}" permanently deleted.`, 'success')
      onDeleted()
      onClose()
    } catch (e) { toast(e.message, 'error') }
    setDeleting(false)
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ background: 'var(--card-bg)', borderRadius: 14, width: '100%', maxWidth: 440, boxShadow: '0 32px 80px rgba(0,0,0,0.45)', overflow: 'hidden' }}>

        {/* Header */}
        <div style={{ padding: '16px 20px', background: '#fee2e2', borderBottom: '1px solid #fecaca', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 38, height: 38, borderRadius: 10, background: '#b91c1c', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <ShieldOff size={18} color="#fff" />
          </div>
          <div style={{ flex: 1 }}>
            <p style={{ fontSize: 14, fontWeight: 800, color: '#7f1d1d', margin: 0 }}>Permanent Delete</p>
            <p style={{ fontSize: 11, color: '#b91c1c', margin: 0 }}>This action cannot be undone</p>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#b91c1c', display: 'flex' }}><X size={16} /></button>
        </div>

        {/* Warning */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--card-border)' }}>
          <div style={{ display: 'flex', gap: 10, padding: '12px 14px', background: '#fff7ed', border: '1.5px solid #fdba74', borderRadius: 9, marginBottom: 14 }}>
            <AlertCircle size={16} style={{ color: '#c2410c', flexShrink: 0, marginTop: 1 }} />
            <div style={{ fontSize: 12, color: '#92400e', lineHeight: 1.6 }}>
              <strong>You are about to permanently erase this entry.</strong> All journal lines and audit history linked to this voucher will be removed from the system forever. This cannot be recovered.
            </div>
          </div>
          <div style={{ padding: '10px 14px', background: 'var(--table-header-bg)', borderRadius: 8, border: '1px solid var(--card-border)', display: 'flex', gap: 14, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12 }}><span style={{ color: 'var(--text-3)', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', display: 'block' }}>Entry</span><strong style={{ color: 'var(--text-1)', fontFamily: 'monospace' }}>{entry.entry_number}</strong></span>
            <span style={{ fontSize: 12 }}><span style={{ color: 'var(--text-3)', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', display: 'block' }}>Type</span><strong style={{ color: 'var(--text-1)' }}>{entry.voucher_type}</strong></span>
            <span style={{ fontSize: 12 }}><span style={{ color: 'var(--text-3)', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', display: 'block' }}>Amount</span><strong style={{ color: '#2563eb', fontFamily: 'monospace' }}>{fmtAmt(entry.total_debit)}</strong></span>
            {entry.is_posted && (
              <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: '#dcfce7', color: '#16a34a', alignSelf: 'center' }}>Posted</span>
            )}
          </div>
        </div>

        {/* Password */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--card-border)' }}>
          <label style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-3)', display: 'flex', alignItems: 'center', gap: 5, marginBottom: 7 }}>
            <Lock size={11} /> Delete Password
          </label>
          <input
            ref={inputRef}
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handlePermanentDelete() }}
            placeholder="Enter accounting delete password…"
            style={{ width: '100%', height: 38, padding: '0 12px', border: '1.5px solid #fca5a5', borderRadius: 8, fontSize: 13, background: 'var(--input-bg)', color: 'var(--text-1)', outline: 'none', boxSizing: 'border-box' }}
          />
          <p style={{ fontSize: 10, color: 'var(--text-3)', margin: '6px 0 0' }}>
            The delete password is set in Accounting → Settings.
          </p>
        </div>

        {/* Footer */}
        <div style={{ padding: '14px 20px', display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '8px 18px', background: 'var(--card-bg)', border: '1.5px solid var(--card-border)', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', color: 'var(--text-2)' }}>
            Cancel
          </button>
          <button onClick={handlePermanentDelete} disabled={deleting || !password.trim()}
            style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 20px', background: password.trim() ? '#b91c1c' : '#e5e7eb', color: password.trim() ? '#fff' : '#9ca3af', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: password.trim() ? 'pointer' : 'not-allowed' }}>
            {deleting ? <Loader2 size={14} className="animate-spin" /> : <ShieldOff size={14} />}
            Delete Forever
          </button>
        </div>
      </div>
    </div>
  )
}

// ── List ─────────────────────────────────────────────────────────

function JournalEntryList() {
  const { profile } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const { currentEntityId, currentEntity } = useEntity()

  const [showNewEntry, setShowNewEntry] = useState(false)
  const [entries,    setEntries]    = useState([])
  const [loading,    setLoading]    = useState(true)

  // + key opens new entry modal — capture phase so it fires even when filters are focused
  useEffect(() => {
    function handler(e) {
      if (e.key !== '+') return
      const tag = document.activeElement?.tagName?.toUpperCase()
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag)) return
      if (showNewEntry) return
      e.preventDefault()
      setShowNewEntry(true)
    }
    document.addEventListener('keydown', handler, true)
    return () => document.removeEventListener('keydown', handler, true)
  }, [showNewEntry])
  const { fy, setFy, fyOpen, setFyOpen, FYS } = useEntityFY()
  const [search,      setSearch]      = useState('')
  const [filterType,  setFilterType]  = useState('')
  const [filterPost,  setFilterPost]  = useState('')
  const [showTrash,   setShowTrash]   = useState(false)
  const [permDeleteEntry, setPermDeleteEntry] = useState(null)
  const [page,        setPage]        = useState(0)
  const [dateSort,    setDateSort]    = useState('desc') // 'asc' | 'desc'
  const PAGE_SIZE = 25

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await getJournalEntries({
        fy,
        type:     filterType || undefined,
        posted:   filterPost === '' ? undefined : filterPost === 'true',
        deleted:  showTrash,
        entityId: currentEntityId,
      })
      setEntries(data)
    } catch (e) { toast(e.message, 'error') }
    setLoading(false)
  }, [fy, filterType, filterPost, showTrash, currentEntityId, toast])

  useEffect(() => { load() }, [load])

  const filtered = entries.filter(e => {
    if (!search) return true
    const q = search.toLowerCase()
    return e.entry_number.toLowerCase().includes(q) || (e.narration || '').toLowerCase().includes(q)
  })

  const sorted = [...filtered].sort((a, b) =>
    dateSort === 'asc'
      ? (a.entry_date || '').localeCompare(b.entry_date || '')
      : (b.entry_date || '').localeCompare(a.entry_date || '')
  )
  const totalPages  = Math.ceil(sorted.length / PAGE_SIZE)
  const pageEntries = sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  // Reset to page 0 whenever filters change
  useEffect(() => { setPage(0) }, [search, filterType, filterPost, showTrash, fy])

  const totalDebit  = filtered.reduce((s, e) => s + Number(e.total_debit  || 0), 0)
  const totalCredit = filtered.reduce((s, e) => s + Number(e.total_credit || 0), 0)

  function doExport() {
    const cols = [
      { header: 'Entry #',     key: 'entry',  align: 'left'  },
      { header: 'Date',        key: 'date',   align: 'left'  },
      { header: 'Type',        key: 'type',   align: 'left'  },
      { header: 'Narration',   key: 'narr',   align: 'left'  },
      { header: 'Ref No',      key: 'ref',    align: 'left'  },
      { header: 'Debit (₹)',   key: 'debit',  align: 'right' },
      { header: 'Credit (₹)',  key: 'credit', align: 'right' },
      { header: 'Status',      key: 'status', align: 'left'  },
    ]
    const rows = filtered.map(e => ({
      entry:  e.entry_number,
      date:   e.entry_date,
      type:   e.voucher_type,
      narr:   e.narration || '',
      ref:    e.reference_no || '',
      debit:  Number(e.total_debit  || 0) || '',
      credit: Number(e.total_credit || 0) || '',
      status: e.is_posted ? 'Posted' : 'Draft',
    }))
    rows.push({ entry: 'TOTAL', date: '', type: '', narr: '', ref: '', debit: totalDebit, credit: totalCredit, status: '' })
    const titleLines = [
      currentEntity?.name ? { text: currentEntity.name, bold: true, size: 13, bg: 'DBEAFE' } : null,
      (currentEntity?.address || currentEntity?.city) ? { text: [currentEntity.address, currentEntity.city].filter(Boolean).join(', '), size: 10 } : null,
      currentEntity?.diocese ? { text: currentEntity.diocese, size: 10, italic: true } : null,
      currentEntity?.description ? { text: currentEntity.description, size: 10, italic: true } : null,
      { text: 'JOURNAL ENTRIES', bold: true, size: 12, bg: '1E3A5F', color: 'FFFFFF' },
      { text: `FY ${fy}`, size: 10 },
    ].filter(Boolean)
    exportToExcelWithTitle(cols, rows, 'Journal Entries', `JournalEntries_FY${fy}.xlsx`, titleLines)
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
            <button onClick={() => navigate('/accounting')} style={{ padding: '6px 8px', background: 'var(--accent)', border: 'none', borderRadius: 7, cursor: 'pointer', display: 'flex', alignItems: 'center', color: '#fff' }}>
              <ArrowLeft size={15} />
            </button>
            <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--accent)', whiteSpace: 'nowrap' }}>Accounts</span>
          </div>
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
          {!loading && filtered.length > 0 && (
            <>
              <button onClick={doExport} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', background: '#16a34a', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                <FileSpreadsheet size={14} /> Export
              </button>
              <button onClick={() => window.print()} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', background: 'var(--card-bg)', border: '1.5px solid var(--card-border)', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', color: 'var(--text-1)' }}>
                <Printer size={14} /> Print
              </button>
            </>
          )}
          <button onClick={() => setShowNewEntry(true)} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 16px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
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
        {!showTrash && (
          <select value={filterPost} onChange={e => setFilterPost(e.target.value)} style={{ height: 36, padding: '0 12px', border: '1.5px solid var(--card-border)', borderRadius: 8, fontSize: 13, background: 'var(--input-bg)', color: 'var(--text-1)', outline: 'none' }}>
            <option value="">All Status</option>
            <option value="false">Drafts</option>
            <option value="true">Posted</option>
          </select>
        )}
        <button onClick={() => setShowTrash(t => !t)}
          style={{ display: 'flex', alignItems: 'center', gap: 5, height: 36, padding: '0 14px', background: showTrash ? '#fee2e2' : 'var(--input-bg)', color: showTrash ? '#b91c1c' : 'var(--text-2)', border: `1.5px solid ${showTrash ? '#fca5a5' : 'var(--card-border)'}`, borderRadius: 8, fontSize: 13, fontWeight: showTrash ? 700 : 400, cursor: 'pointer' }}>
          <Trash2 size={13} /> {showTrash ? 'Trash (active)' : 'Trash'}
        </button>
        <span style={{ fontSize: 12, color: 'var(--text-3)', marginLeft: 'auto' }}>{filtered.length} {showTrash ? 'deleted' : ''} entries</span>
      </div>

      {/* Trash mode banner */}
      {showTrash && (
        <div style={{ marginBottom: 16, padding: '10px 16px', background: '#fee2e2', border: '1.5px solid #fca5a5', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 10 }}>
          <Trash2 size={15} style={{ color: '#b91c1c', flexShrink: 0 }} />
          <span style={{ fontSize: 13, color: '#7f1d1d', fontWeight: 500 }}>
            You are viewing <strong>deleted entries</strong>. Restore to recover, or permanently delete to erase forever.
          </span>
        </div>
      )}

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
                      <th key={h}
                        onClick={h === 'Date' ? () => setDateSort(s => s === 'asc' ? 'desc' : 'asc') : undefined}
                        style={{ padding: '9px 14px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-3)', textAlign: ['Debit','Credit'].includes(h) ? 'right' : 'left', whiteSpace: 'nowrap', cursor: h === 'Date' ? 'pointer' : 'default', userSelect: 'none' }}>
                        {h === 'Date'
                          ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>Date {dateSort === 'asc' ? <ArrowUp size={10} /> : <ArrowDown size={10} />}</span>
                          : h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pageEntries.map((e, i) => (
                    <tr key={e.id} onClick={() => navigate(`/accounting/journal-entries/${e.id}`)}
                      style={{ background: i % 2 ? 'rgba(0,0,0,0.012)' : 'transparent', cursor: 'pointer' }}
                      onMouseEnter={ev => { ev.currentTarget.style.background = 'var(--sidebar-item-hover)' }}
                      onMouseLeave={ev => { ev.currentTarget.style.background = i % 2 ? 'rgba(0,0,0,0.012)' : 'transparent' }}
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
                          {showTrash ? (
                            <>
                              <button onClick={async ev => { ev.stopPropagation(); try { await restoreJournalEntry(e.id, profile?.email || 'admin'); toast('Entry restored.', 'success'); load() } catch(err){toast(err.message,'error')} }}
                                style={{ padding: '4px 8px', background: '#dcfce7', color: '#16a34a', border: 'none', borderRadius: 5, fontSize: 11, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                                <RotateCcw size={11} /> Restore
                              </button>
                              <button onClick={ev => { ev.stopPropagation(); setPermDeleteEntry(e) }}
                                style={{ padding: '4px 8px', background: '#fee2e2', color: '#b91c1c', border: 'none', borderRadius: 5, fontSize: 11, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                                <ShieldOff size={11} /> Del Forever
                              </button>
                            </>
                          ) : e.is_posted ? (
                            <>
                              <button onClick={ev => { ev.stopPropagation(); navigate(`/accounting/journal-entries/${e.id}`) }}
                                style={{ padding: '4px 8px', background: '#f1f5f9', color: '#475569', border: 'none', borderRadius: 5, fontSize: 11, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                                <Eye size={11} />
                              </button>
                              <button onClick={async ev => { ev.stopPropagation(); if(!window.confirm('Move this posted entry to trash?')) return; try { await softDeleteJournalEntry(e.id, profile?.email || 'admin'); toast('Moved to trash.','success'); load() } catch(err){toast(err.message,'error')} }}
                                style={{ padding: '4px 8px', background: '#fee2e2', color: '#b91c1c', border: 'none', borderRadius: 5, fontSize: 11, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                                <Trash2 size={11} />
                              </button>
                            </>
                          ) : (
                            <>
                              <button onClick={ev => { ev.stopPropagation(); e.voucher_type === 'Receipt' ? navigate(`/accounting/receipt-voucher?edit=${e.id}`) : e.voucher_type === 'Payment' ? navigate(`/accounting/payment-voucher?edit=${e.id}`) : e.voucher_type === 'Contra' ? navigate(`/accounting/contra-voucher?edit=${e.id}`) : e.voucher_type === 'Journal' ? navigate(`/accounting/journal-voucher?edit=${e.id}`) : navigate(`/accounting/journal-entries/${e.id}`) }}
                                style={{ padding: '4px 8px', background: '#dbeafe', color: '#2563eb', border: 'none', borderRadius: 5, fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>Edit</button>
                              <button onClick={async ev => { ev.stopPropagation(); try { await postJournalEntry(e.id, profile?.email || 'admin'); toast('Posted!', 'success'); load() } catch(err){toast(err.message,'error')} }}
                                style={{ padding: '4px 8px', background: '#dcfce7', color: '#16a34a', border: 'none', borderRadius: 5, fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>Post</button>
                              <button onClick={async ev => { ev.stopPropagation(); if(!window.confirm('Move this entry to trash?')) return; try { await softDeleteJournalEntry(e.id, profile?.email || 'admin'); toast('Moved to trash.','success'); load() } catch(err){toast(err.message,'error')} }}
                                style={{ padding: '4px 8px', background: '#fee2e2', color: '#b91c1c', border: 'none', borderRadius: 5, fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>Del</button>
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

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 16, padding: '10px 16px', background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: 10 }}>
          <span style={{ fontSize: 12, color: 'var(--text-3)' }}>
            Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, filtered.length)} of {filtered.length}
          </span>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
              style={{ padding: '5px 10px', border: '1.5px solid var(--card-border)', borderRadius: 7, background: 'var(--card-bg)', cursor: page === 0 ? 'not-allowed' : 'pointer', color: page === 0 ? 'var(--text-3)' : 'var(--text-1)', display: 'flex', alignItems: 'center' }}>
              <ChevronLeft size={14} />
            </button>
            {Array.from({ length: totalPages }, (_, i) => i).filter(i => Math.abs(i - page) <= 2).map(i => (
              <button key={i} onClick={() => setPage(i)}
                style={{ padding: '5px 10px', border: '1.5px solid var(--card-border)', borderRadius: 7, background: i === page ? 'var(--accent)' : 'var(--card-bg)', color: i === page ? '#fff' : 'var(--text-1)', fontSize: 12, fontWeight: i === page ? 700 : 400, cursor: 'pointer' }}>
                {i + 1}
              </button>
            ))}
            <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}
              style={{ padding: '5px 10px', border: '1.5px solid var(--card-border)', borderRadius: 7, background: 'var(--card-bg)', cursor: page >= totalPages - 1 ? 'not-allowed' : 'pointer', color: page >= totalPages - 1 ? 'var(--text-3)' : 'var(--text-1)', display: 'flex', alignItems: 'center' }}>
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}

      {showNewEntry && <JournalEntryModal onClose={() => setShowNewEntry(false)} onSaved={load} />}
      {permDeleteEntry && <PermanentDeleteModal entry={permDeleteEntry} onClose={() => setPermDeleteEntry(null)} onDeleted={load} />}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════
//  FORM (New / Edit)
// ════════════════════════════════════════════════════════════════

function JournalEntryForm({ entryId, defaultVoucherType = 'Journal' }) {
  const { profile } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { currentEntityId, currentEntity } = useEntity()

  const today = localISO(new Date())
  const currentFY = getFY()

  const [accounts,  setAccounts]  = useState([])
  const [allCoa,    setAllCoa]    = useState([])
  const [loading,       setLoading]       = useState(!!entryId)
  const [saving,        setSaving]        = useState(false)
  const [posting,       setPosting]       = useState(false)
  const [isPosted,      setIsPosted]      = useState(false)
  const [editingPosted, setEditingPosted] = useState(false)
  const [auditLog,      setAuditLog]      = useState([])
  const [showPrint,     setShowPrint]     = useState(false)

  const dateInputRef = useRef(null)
  // stable refs for keyboard handlers — always point to latest functions
  const saveDraftRef = useRef(null)
  const savePostRef  = useRef(null)
  const addLineRef   = useRef(null)

  const [header, setHeader] = useState({
    entry_number:  '',
    entry_date:    today,
    financial_year: currentFY,
    voucher_type:  defaultVoucherType,
    narration:     '',
    reference_no:  '',
  })

  const [lines, setLines] = useState([
    { account_id: '', debit_amount: '', credit_amount: '', description: '' },
    { account_id: '', debit_amount: '', credit_amount: '', description: '' },
  ])

  useEffect(() => {
    getChartOfAccounts(true, currentEntityId).then(all => { setAllCoa(all); setAccounts(getPostableAccountsWithPath(all)) }).catch(() => {})
  }, [])

  useEffect(() => {
    if (searchParams.get('coaRefresh')) {
      getChartOfAccounts(true, currentEntityId).then(all => { setAllCoa(all); setAccounts(getPostableAccountsWithPath(all)) }).catch(() => {})
      setSearchParams(p => { const n = new URLSearchParams(p); n.delete('coaRefresh'); return n }, { replace: true })
    }
  }, [searchParams.get('coaRefresh')])

  useEffect(() => {
    if (!entryId) {
      // Auto-generate entry number
      nextEntryNumber(currentFY, 'Receipt', currentEntityId).then(n => setHeader(h => ({ ...h, entry_number: n }))).catch(() => {})
      return
    }
    setLoading(true)
    getJournalEntryWithLines(entryId).then(entry => {
      const t = entry.voucher_type
      if      (t === 'Receipt') { navigate(`/accounting/receipt-voucher?edit=${entryId}`, { replace: true }); return }
      else if (t === 'Payment') { navigate(`/accounting/payment-voucher?edit=${entryId}`, { replace: true }); return }
      else if (t === 'Contra')  { navigate(`/accounting/contra-voucher?edit=${entryId}`,  { replace: true }); return }
      else if (t === 'Journal') { navigate(`/accounting/journal-voucher?edit=${entryId}`, { replace: true }); return }
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
      getEntryAuditLog(entryId).then(setAuditLog).catch(() => {})
    }).catch(e => { toast(e.message, 'error'); setLoading(false) })
  }, [entryId, currentFY, toast])

  // Auto-update entry number when voucher type changes (new entry only)
  useEffect(() => {
    if (entryId) return
    nextEntryNumber(header.financial_year, header.voucher_type, currentEntityId)
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

  function autoBalance() {
    if (balanced) return
    if (totalDebit > totalCredit) {
      const need = (totalDebit - totalCredit).toFixed(2)
      const idx = lines.findIndex(l => !parseFloat(l.credit_amount))
      if (idx >= 0) setLine(idx, 'credit_amount', need)
    } else {
      const need = (totalCredit - totalDebit).toFixed(2)
      const idx = lines.findIndex(l => !parseFloat(l.debit_amount))
      if (idx >= 0) setLine(idx, 'debit_amount', need)
    }
  }

  async function handleSave(andPost = false) {
    if (!header.entry_date) { toast('Entry date is required', 'error'); return }
    const validLines = lines.filter(l => l.account_id && (parseFloat(l.debit_amount) > 0 || parseFloat(l.credit_amount) > 0))
    if (validLines.length < 2) { toast('At least 2 line items with amounts are required', 'error'); return }
    if (!balanced) { toast(`Entry is not balanced. Difference: ₹${diff.toFixed(2)}`, 'error'); return }

    setSaving(true)
    try {
      let je
      if (entryId && editingPosted) {
        je = await updatePostedJournalEntry(entryId, header, validLines, profile.email)
        toast('Posted entry updated.', 'success')
        setEditingPosted(false)
        getEntryAuditLog(entryId).then(setAuditLog).catch(() => {})
      } else if (entryId) {
        je = await updateJournalEntry(entryId, header, validLines, profile.email)
        if (andPost) {
          await postJournalEntry(je.id, profile.email)
          toast('Entry saved and posted!', 'success')
        } else {
          toast('Entry saved as draft.', 'success')
        }
        navigate('/accounting/journal-entries')
      } else {
        je = await createJournalEntry({ ...header, entity_id: currentEntityId }, validLines, profile.email)
        if (andPost) {
          await postJournalEntry(je.id, profile.email)
          toast('Entry saved and posted!', 'success')
        } else {
          toast('Entry saved as draft.', 'success')
        }
        navigate('/accounting/journal-entries')
      }
    } catch (e) { toast(e.message, 'error') }
    setSaving(false)
  }

  // When editing a posted entry treat it as editable for form purposes
  const formReadOnly = isPosted && !editingPosted

  // Keep refs current every render so keyboard handler never captures stale closures
  saveDraftRef.current = () => handleSave(false)
  savePostRef.current  = () => handleSave(true)
  addLineRef.current   = addLine

  // Auto-focus entry date on new entry load
  useEffect(() => {
    if (!loading && !entryId) {
      setTimeout(() => dateInputRef.current?.focus(), 80)
    }
  }, [loading]) // eslint-disable-line

  // Global keyboard shortcuts
  useEffect(() => {
    if (formReadOnly) return
    function onKey(e) {
      if (e.ctrlKey && !e.altKey && !e.shiftKey && e.key === 's') {
        e.preventDefault(); saveDraftRef.current?.()
      }
      if (e.ctrlKey && e.key === 'Enter') {
        e.preventDefault(); savePostRef.current?.()
      }
      if (e.altKey && e.key.toLowerCase() === 'n') {
        e.preventDefault(); addLineRef.current?.()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [isPosted])

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
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
            <button onClick={() => navigate('/accounting')} style={{ padding: '6px 8px', background: 'var(--accent)', border: 'none', borderRadius: 7, cursor: 'pointer', display: 'flex', alignItems: 'center', color: '#fff' }}>
              <ArrowLeft size={15} />
            </button>
            <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--accent)', whiteSpace: 'nowrap' }}>Accounts</span>
          </div>
          <div>
            <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
              <FileText size={20} style={{ color: 'var(--accent)' }} />
              {formReadOnly ? `View: ${header.entry_number}` : (entryId ? `Edit: ${header.entry_number}` : 'New Journal Entry')}
            </h1>
            <p className="page-subtitle">
              {editingPosted ? 'Editing posted entry — changes update financial records' : formReadOnly ? 'Posted entry (read-only)' : 'Fill debit and credit accounts'}
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {entryId && (
            <button onClick={() => setShowPrint(true)}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', background: 'var(--card-bg)', border: '1.5px solid var(--card-border)', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', color: 'var(--text-2)' }}>
              <Printer size={14} /> Print
            </button>
          )}
          {isPosted && !editingPosted && (
            <button onClick={() => {
              if (!window.confirm('This entry is posted. Editing it will update financial records and is logged. Continue?')) return
              setEditingPosted(true)
            }} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 16px', background: '#fff7ed', color: '#c2410c', border: '1.5px solid #fdba74', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
              <Edit2 size={14} /> Edit Entry
            </button>
          )}
          {editingPosted && (
            <>
              <button onClick={() => setEditingPosted(false)} style={{ padding: '8px 16px', background: 'var(--card-bg)', border: '1.5px solid var(--card-border)', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', color: 'var(--text-2)' }}>
                Cancel
              </button>
              <button onClick={() => handleSave(false)} disabled={saving || !balanced} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 16px', background: balanced ? '#c2410c' : '#e5e7eb', color: balanced ? '#fff' : '#9ca3af', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: balanced ? 'pointer' : 'not-allowed' }}>
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Save Changes
              </button>
            </>
          )}
          {!isPosted && (
            <>
              <button onClick={() => handleSave(false)} disabled={saving} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 16px', background: 'var(--card-bg)', border: '1.5px solid var(--card-border)', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', color: 'var(--text-1)' }}>
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Save Draft
              </button>
              <button onClick={() => handleSave(true)} disabled={saving || !balanced} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 16px', background: balanced ? '#16a34a' : '#e5e7eb', color: balanced ? '#fff' : '#9ca3af', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: balanced ? 'pointer' : 'not-allowed' }}>
                {saving ? <Loader2 size={14} className="animate-spin" /> : <CheckSquare size={14} />} Save &amp; Post
              </button>
            </>
          )}
        </div>
      </div>

      {/* Warning banner when editing posted entry */}
      {editingPosted && (
        <div style={{ marginBottom: 16, padding: '10px 16px', background: '#fff7ed', border: '1.5px solid #fdba74', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 10 }}>
          <ShieldAlert size={16} style={{ color: '#c2410c', flexShrink: 0 }} />
          <span style={{ fontSize: 13, color: '#92400e', fontWeight: 500 }}>
            You are editing a <strong>posted entry</strong>. Changes will update account balances and are permanently logged with your name.
          </span>
        </div>
      )}

      {/* Voucher type selector */}
      {!formReadOnly && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
          {VOUCHER_TYPES.map(t => {
            const vc = VOUCHER_COLOR[t] || { bg: '#f1f5f9', text: '#475569' }
            const active = header.voucher_type === t
            return (
              <button key={t} onClick={() => sh('voucher_type', t)}
                style={{ padding: '7px 18px', borderRadius: 99, fontSize: 12, fontWeight: 700, cursor: 'pointer', border: `2px solid ${active ? vc.text : 'var(--card-border)'}`, background: active ? vc.bg : 'var(--card-bg)', color: active ? vc.text : 'var(--text-2)' }}>
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
              <input value={header.entry_number} onChange={e => sh('entry_number', e.target.value)} disabled={formReadOnly}
                style={{ width: '100%', height: 36, padding: '0 10px', border: '1.5px solid var(--card-border)', borderRadius: 8, fontSize: 13, fontFamily: 'monospace', fontWeight: 700, background: 'var(--input-bg)', color: 'var(--text-1)', outline: 'none', boxSizing: 'border-box' }} />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-3)', display: 'block', marginBottom: 5 }}>Entry Date *</label>
              <input ref={dateInputRef} type="date" value={header.entry_date}
                onChange={e => {
                  const d = e.target.value
                  setHeader(h => ({ ...h, entry_date: d, financial_year: d ? getFY(d) : h.financial_year }))
                }}
                disabled={formReadOnly}
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
              <input value={header.reference_no} onChange={e => sh('reference_no', e.target.value)} disabled={formReadOnly} placeholder="e.g. Cheque no."
                style={{ width: '100%', height: 36, padding: '0 10px', border: '1.5px solid var(--card-border)', borderRadius: 8, fontSize: 13, background: 'var(--input-bg)', color: 'var(--text-1)', outline: 'none', boxSizing: 'border-box' }} />
            </div>
          </div>
        </div>

        {/* Narration + Balance summary */}
        <div className="card" style={{ padding: '18px 20px' }}>
          <p style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-3)', margin: '0 0 14px' }}>Narration &amp; Summary</p>
          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-3)', display: 'block', marginBottom: 5 }}>Narration</label>
            <textarea value={header.narration} onChange={e => sh('narration', e.target.value)} disabled={formReadOnly} rows={3} placeholder="Describe the transaction…"
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
          {!formReadOnly && !balanced && totalDebit > 0 && (
            <button onClick={autoBalance}
              style={{ marginTop: 10, width: '100%', padding: '6px 12px', background: '#fff7ed', color: '#c2410c', border: '1.5px dashed #fdba74', borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              <Zap size={13} /> Auto-balance: fill {fmtAmt(diff)} on next empty line
            </button>
          )}
        </div>
      </div>

      {/* Lines */}
      <div className="card" style={{ overflow: 'hidden', marginBottom: 20 }}>
        <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--card-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)', margin: 0 }}>Transaction Lines</p>
          {!formReadOnly && (
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
                {!formReadOnly && <th style={{ width: 40 }}></th>}
              </tr>
            </thead>
            <tbody data-lines>
              {lines.map((line, i) => (
                <tr key={i} style={{ background: i % 2 ? 'rgba(0,0,0,0.012)' : 'transparent' }}>
                  <td style={{ padding: '8px 14px', fontSize: 12, color: 'var(--text-3)', textAlign: 'center' }}>{i + 1}</td>
                  <td style={{ padding: '6px 10px' }}>
                    <AccountPicker
                      value={line.account_id}
                      accounts={accounts}
                      onChange={v => setLine(i, 'account_id', v)}
                      placeholder="— Select Ledger —"
                      disabled={formReadOnly}
                      allCoa={allCoa}
                      entityId={currentEntityId}
                      onAccountCreated={a => { setAllCoa(prev => [...prev, a]); setAccounts(prev => [...prev, a]) }}
                    />
                  </td>
                  <td style={{ padding: '6px 10px' }}>
                    <input value={line.description} onChange={e => setLine(i, 'description', e.target.value)} disabled={formReadOnly} placeholder="Optional"
                      style={{ width: '100%', height: 34, padding: '0 8px', border: '1.5px solid var(--card-border)', borderRadius: 7, fontSize: 12, background: 'var(--input-bg)', color: 'var(--text-1)', outline: 'none', boxSizing: 'border-box' }} />
                  </td>
                  <td style={{ padding: '6px 10px' }}>
                    <input type="number" min="0" step="0.01" value={line.debit_amount} onChange={e => setLine(i, 'debit_amount', e.target.value)} disabled={formReadOnly} placeholder="0.00"
                      style={{ width: '100%', height: 34, padding: '0 8px', border: '1.5px solid var(--card-border)', borderRadius: 7, fontSize: 12, fontFamily: 'monospace', textAlign: 'right', background: parseFloat(line.debit_amount) > 0 ? '#dbeafe22' : 'var(--input-bg)', color: '#2563eb', outline: 'none', boxSizing: 'border-box' }} />
                  </td>
                  <td style={{ padding: '6px 10px' }}>
                    <input type="number" min="0" step="0.01" value={line.credit_amount} onChange={e => setLine(i, 'credit_amount', e.target.value)} disabled={formReadOnly} placeholder="0.00"
                      onKeyDown={e => {
                        if (formReadOnly) return
                        const isLast = i === lines.length - 1
                        const actOnEnter = e.key === 'Enter' && isLast
                        const actOnTab   = e.key === 'Tab'   && !e.shiftKey
                        if (!actOnEnter && !actOnTab) return
                        e.preventDefault()
                        const q = 'input.field-input:not([type="number"]):not([disabled]):not([data-narration])'
                        const c = e.target.closest('[data-lines]')
                        if (actOnTab && !isLast) { if (c) { const ps = c.querySelectorAll(q); if (ps.length > i + 1) ps[i + 1].focus() }; return }
                        if (!line.account_id && !parseFloat(line.debit_amount) && !parseFloat(line.credit_amount)) { document.querySelector('input[data-narration]:not([disabled])')?.focus(); return }
                        flushSync(addLine)
                        if (c) { const ps = c.querySelectorAll(q); if (ps.length) ps[ps.length - 1].focus() }
                      }}
                      style={{ width: '100%', height: 34, padding: '0 8px', border: '1.5px solid var(--card-border)', borderRadius: 7, fontSize: 12, fontFamily: 'monospace', textAlign: 'right', background: parseFloat(line.credit_amount) > 0 ? '#dcfce722' : 'var(--input-bg)', color: '#16a34a', outline: 'none', boxSizing: 'border-box' }} />
                  </td>
                  {!formReadOnly && (
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
                {!formReadOnly && <td />}
              </tr>
              {!balanced && totalDebit > 0 && (
                <tr>
                  <td colSpan={formReadOnly ? 5 : 6} style={{ padding: '8px 14px' }}>
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

      {!formReadOnly && (
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={() => { if (editingPosted) setEditingPosted(false); else navigate('/accounting/journal-entries') }} style={{ padding: '9px 20px', background: 'var(--card-bg)', border: '1.5px solid var(--card-border)', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', color: 'var(--text-2)' }}>Cancel</button>
          {editingPosted ? (
            <button onClick={() => handleSave(false)} disabled={saving || !balanced}
              style={{ padding: '9px 22px', background: balanced ? '#c2410c' : '#e5e7eb', color: balanced ? '#fff' : '#9ca3af', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: balanced ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', gap: 7 }}>
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Save Changes
            </button>
          ) : (
            <>
              <button onClick={() => handleSave(false)} disabled={saving} style={{ padding: '9px 20px', background: 'var(--card-bg)', border: '1.5px solid var(--accent)', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: 7 }}>
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Save Draft
              </button>
              <button onClick={() => handleSave(true)} disabled={saving || !balanced}
                style={{ padding: '9px 22px', background: balanced ? '#16a34a' : '#e5e7eb', color: balanced ? '#fff' : '#9ca3af', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: balanced ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', gap: 7 }}>
                {saving ? <Loader2 size={14} className="animate-spin" /> : <CheckSquare size={14} />} Save &amp; Post
              </button>
            </>
          )}
        </div>
      )}

      {!formReadOnly && (
        <div style={{ marginTop: 12, padding: '7px 14px', background: 'var(--table-header-bg)', border: '1px solid var(--card-border)', borderRadius: 8, display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.07em', color: 'var(--text-3)', textTransform: 'uppercase' }}>Shortcuts</span>
          {(editingPosted
            ? [['Ctrl+S','Save Changes']]
            : [['Ctrl+S','Save Draft'],['Ctrl+Enter','Save & Post'],['Alt+N','Add Line']]
          ).map(([k, l]) => (
            <span key={k} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--text-2)' }}>
              <kbd style={{ padding: '2px 7px', background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: 4, fontSize: 10, fontFamily: 'monospace', fontWeight: 700, color: 'var(--text-1)' }}>{k}</kbd>
              {l}
            </span>
          ))}
        </div>
      )}

      <VoucherPrint
        open={showPrint} onClose={() => setShowPrint(false)}
        entity={currentEntity}
        voucherType={header.voucher_type}
        voucherNo={header.entry_number}
        date={header.entry_date}
        refNo={header.reference_no}
        narration={header.narration}
        party={
          header.voucher_type === 'Payment'
            ? lines.find(l => parseFloat(l.credit_amount) > 0)?.description || ''
            : header.voucher_type === 'Receipt'
            ? lines.find(l => parseFloat(l.debit_amount) > 0)?.description || ''
            : ''
        }
        rows={[
          ...lines.filter(l => parseFloat(l.debit_amount) > 0).map(l => ({
            label: `Dr: ${accounts.find(a => a.id === l.account_id)?.name || l.account_id}`,
            amount: parseFloat(l.debit_amount),
          })),
          ...lines.filter(l => parseFloat(l.credit_amount) > 0).map(l => ({
            label: `Cr: ${accounts.find(a => a.id === l.account_id)?.name || l.account_id}`,
            amount: parseFloat(l.credit_amount),
          })),
        ]}
        totalAmount={totalDebit}
      />

      {/* Audit Log */}
      {entryId && auditLog.length > 0 && (
        <div className="card" style={{ marginTop: 24, overflow: 'hidden' }}>
          <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--card-border)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Clock size={14} style={{ color: 'var(--text-3)' }} />
            <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)', margin: 0 }}>Change History</p>
          </div>
          <div>
            {auditLog.map((log, i) => {
              const ACTION_STYLE = {
                created:        { bg: '#dcfce7', text: '#16a34a', label: 'Created' },
                modified:       { bg: '#dbeafe', text: '#2563eb', label: 'Modified (Draft)' },
                modified_posted:{ bg: '#fff7ed', text: '#c2410c', label: 'Modified (Posted)' },
                posted:         { bg: '#f3e8ff', text: '#7c3aed', label: 'Posted' },
                deleted:        { bg: '#fee2e2', text: '#b91c1c', label: 'Deleted' },
              }
              const s = ACTION_STYLE[log.action] || { bg: '#f1f5f9', text: '#475569', label: log.action }
              const at = new Date(log.performed_at)
              const dateStr = at.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
              const timeStr = at.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
              return (
                <div key={log.id} style={{ padding: '12px 20px', borderBottom: i < auditLog.length - 1 ? '1px solid var(--card-border)' : 'none', display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 9px', borderRadius: 99, background: s.bg, color: s.text, whiteSpace: 'nowrap', marginTop: 1 }}>{s.label}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--text-2)' }}>
                        <User size={11} style={{ color: 'var(--text-3)' }} />
                        <strong>{log.performed_by}</strong>
                      </span>
                      <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{dateStr} at {timeStr}</span>
                    </div>
                    {log.old_data && log.entity_data && (
                      <div style={{ marginTop: 6, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                        {['narration','voucher_type','entry_date','reference_no','total_debit','total_credit'].map(field => {
                          const oldVal = log.old_data[field]
                          const newVal = log.entity_data[field]
                          if (oldVal === newVal || (oldVal == null && newVal == null)) return null
                          return (
                            <span key={field} style={{ fontSize: 11, color: 'var(--text-3)' }}>
                              <span style={{ fontWeight: 600, color: 'var(--text-2)', textTransform: 'capitalize' }}>{field.replace(/_/g,' ')}:</span>{' '}
                              <span style={{ textDecoration: 'line-through', color: '#b91c1c' }}>{String(oldVal ?? '—')}</span>
                              {' → '}
                              <span style={{ color: '#16a34a' }}>{String(newVal ?? '—')}</span>
                            </span>
                          )
                        })}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
