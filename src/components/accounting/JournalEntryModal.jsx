/* ═══════════════════════════════════════════════════════════════
   JournalEntryModal.jsx — New Journal Entry modal (two-panel)
   ═══════════════════════════════════════════════════════════════ */

import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { useAuth } from '../../lib/AuthContext'
import { useToast } from '../../lib/toast'
import {
  getFY, fmtAmt,
  createJournalEntry, updateJournalEntry, postJournalEntry, getJournalEntryWithLines,
  nextEntryNumber, getChartOfAccounts, getPostableAccountsWithPath,
  VOUCHER_TYPES, VOUCHER_COLOR, TYPE_COLOR, displayAccountType,
} from '../../lib/accountingLib'
import {
  X, Save, CheckSquare, PlusCircle, Minus, AlertCircle, Zap, Loader2, FileText,
  ChevronUp, ChevronDown,
} from 'lucide-react'

const MAX_LINES = 20
const DEFAULT_BLANK_LINE = () => ({ account_id: '', debit_amount: '', credit_amount: '', side: null })
const localISO = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`

// ── Account type → default side ──────────────────────────────────

function getDefaultSide(accountType) {
  return ['Asset', 'Expense'].includes(accountType) ? 'debit' : 'credit'
}

// ── Typeahead Account Search ──────────────────────────────────────

function AccountSearch({ value, accounts, onChange, lineIdx }) {
  const [input,   setInput]   = useState('')
  const [focused, setFocused] = useState(false)
  const [open,    setOpen]    = useState(false)
  const [hi,      setHi]      = useState(0)
  const savedRef = useRef(null)

  const selected = useMemo(() => accounts.find(a => a.id === value), [value, accounts])
  const displayName = selected
    ? `${selected.name}${selected.code ? '  [' + selected.code + ']' : ''}`
    : ''

  const filtered = useMemo(() => {
    if (!focused) return []
    const q = input.trim().toLowerCase()
    if (!q) return accounts.slice(0, 15)
    return accounts.filter(a =>
      a.name.toLowerCase().includes(q) ||
      (a.code || '').toLowerCase().includes(q) ||
      (a.path || '').toLowerCase().includes(q)
    ).slice(0, 12)
  }, [input, focused, accounts])

  function handleFocus() {
    savedRef.current = value
    setFocused(true)
    setInput('')
    setOpen(true)
    setHi(0)
  }

  function handleBlur() {
    setTimeout(() => {
      setFocused(false)
      setOpen(false)
      // Restore previous selection if nothing was newly chosen
      if (!value && savedRef.current) {
        const restored = accounts.find(a => a.id === savedRef.current)
        const side = restored ? getDefaultSide(restored.account_type) : null
        onChange(savedRef.current, side)
      }
    }, 160)
  }

  function select(a) {
    savedRef.current = a.id
    const side = getDefaultSide(a.account_type)
    onChange(a.id, side)
    setFocused(false)
    setOpen(false)
    setTimeout(() => {
      document.querySelector(`[data-line="${lineIdx}"][data-side="${side}"]`)?.focus()
    }, 40)
  }

  function handleKey(e) {
    // Tab confirms only if user has actually typed a query
    if (e.key === 'Tab' && open && filtered.length > 0 && input.trim()) {
      e.preventDefault()
      select(filtered[hi])
      return
    }
    if (!open || !filtered.length) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setHi(h => Math.min(h + 1, filtered.length - 1)) }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setHi(h => Math.max(h - 1, 0)) }
    if (e.key === 'Enter')     { e.preventDefault(); if (filtered[hi]) select(filtered[hi]) }
    if (e.key === 'Escape')    { setOpen(false); setFocused(false) }
  }

  const tc = TYPE_COLOR[selected?.account_type] || {}

  function clearSelection(e) {
    e.preventDefault()
    savedRef.current = null
    onChange('', null)
    setInput('')
    setFocused(false)
    setOpen(false)
  }

  return (
    <div style={{ position: 'relative', flex: 1 }}>
      <input
        value={focused ? input : displayName}
        onChange={e => { setInput(e.target.value); setHi(0) }}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onKeyDown={handleKey}
        placeholder="Type to search…"
        style={{
          width: '100%', height: 34, padding: selected ? '0 28px 0 8px' : '0 8px',
          border: `1.5px solid ${selected ? (tc.text || 'var(--accent)') + '88' : 'var(--card-border)'}`,
          borderRadius: 7, fontSize: 12,
          background: selected ? (tc.bg || '#f0fdf4') : 'var(--input-bg)',
          color: 'var(--text-1)', outline: 'none', boxSizing: 'border-box',
          transition: 'border-color 0.15s, background 0.15s',
        }}
      />
      {selected && !focused && (
        <button
          onMouseDown={clearSelection}
          style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', display: 'flex', alignItems: 'center', padding: 2, borderRadius: 4 }}
          onMouseEnter={e => e.currentTarget.style.color = '#b91c1c'}
          onMouseLeave={e => e.currentTarget.style.color = 'var(--text-3)'}>
          <X size={12} />
        </button>
      )}
      {open && filtered.length > 0 && (
        <div style={{
          position: 'absolute', top: 36, left: 0, right: 0, zIndex: 2000,
          background: 'var(--card-bg)', border: '1px solid var(--card-border)',
          borderRadius: 9, boxShadow: '0 8px 28px rgba(0,0,0,0.22)',
          maxHeight: 210, overflowY: 'auto',
        }}>
          {filtered.map((a, i) => {
            const bc = TYPE_COLOR[a.account_type] || { bg: '#f1f5f9', text: '#64748b' }
            return (
              <div key={a.id}
                onMouseDown={e => { e.preventDefault(); select(a) }}
                style={{
                  padding: '7px 12px', cursor: 'pointer',
                  background: i === hi ? 'var(--sidebar-item-active-bg)' : 'transparent',
                  borderBottom: i < filtered.length - 1 ? '1px solid var(--card-border)' : 'none',
                  display: 'flex', alignItems: 'center', gap: 8,
                }}>
                <span style={{ flex: 1, fontSize: 12, fontWeight: 600, color: i === hi ? 'var(--accent)' : 'var(--text-1)' }}>{a.name}</span>
                {a.code && <span style={{ fontFamily: 'monospace', fontSize: 10, color: 'var(--text-3)' }}>{a.code}</span>}
                <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: bc.bg, color: bc.text }}>
                  {displayAccountType(a.account_type)}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════
//  MODAL
// ════════════════════════════════════════════════════════════════

export default function JournalEntryModal({ fy: propFY, entryId, onClose, onSaved }) {
  const { profile } = useAuth()
  const toast = useToast()

  const today     = localISO(new Date())
  const currentFY = propFY || getFY()

  const [accounts, setAccounts] = useState([])
  const [saving,   setSaving]   = useState(false)
  const [ready,    setReady]    = useState(false)
  const [isEditing, setIsEditing] = useState(!!entryId)

  const [header, setHeader] = useState({
    entry_number:   '',
    entry_date:     today,
    financial_year: currentFY,
    voucher_type:   'Receipt',
    narration:      '',
    reference_no:   '',
  })

  // Lines: side = 'debit' | 'credit' | null  (set when account is picked)
  const [lines, setLines] = useState(Array.from({ length: 5 }, DEFAULT_BLANK_LINE))
  const [currentLine, setCurrentLine] = useState(0)
  const lineRefs    = useRef([])
  const linesBodyRef = useRef(null)

  // Fetch accounts and existing entry (if editing)
  useEffect(() => {
    Promise.all([
      getChartOfAccounts(true).then(all => setAccounts(getPostableAccountsWithPath(all))),
      entryId ? getJournalEntryWithLines(entryId) : null,
    ])
      .then(([_, entry]) => {
        if (entry) {
          // Pre-populate form with existing entry
          setHeader({
            entry_number: entry.entry_number,
            entry_date: entry.entry_date,
            financial_year: entry.financial_year,
            voucher_type: entry.voucher_type,
            narration: entry.narration || '',
            reference_no: entry.reference_no || '',
          })
          const mapped = entry.journal_entry_lines.map(l => ({
            account_id: l.account_id,
            debit_amount: l.debit_amount || '',
            credit_amount: l.credit_amount || '',
            side: l.debit_amount > 0 ? 'debit' : l.credit_amount > 0 ? 'credit' : null,
          }))
          // Pad to at least 5 lines
          while (mapped.length < 5) mapped.push(DEFAULT_BLANK_LINE())
          setLines(mapped)
          setCurrentLine(0)
        }
        setReady(true)
      })
      .catch(() => setReady(true))
  }, [entryId])

  useEffect(() => {
    nextEntryNumber(header.financial_year, header.voucher_type)
      .then(n => setHeader(h => ({ ...h, entry_number: n })))
      .catch(() => {})
  }, [header.voucher_type, header.financial_year])

  // Focus the active voucher pill on modal open
  useEffect(() => {
    setTimeout(() => document.getElementById(`je-pill-${header.voucher_type}`)?.focus(), 120)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const sh = (k, v) => setHeader(h => ({ ...h, [k]: v }))

  function handleLineAccountChange(i, accountId, side) {
    setLines(ls => ls.map((l, idx) => {
      if (idx !== i) return l
      return { ...l, account_id: accountId, side: accountId ? side : null }
    }))
  }

  function sl(i, k, v) {
    setLines(ls => ls.map((l, idx) => idx === i ? { ...l, [k]: v } : l))
  }

  // Navigate to a line (circular) and scroll it into view
  const goToLine = useCallback((idx, total) => {
    const n = total ?? lines.length
    const target = ((idx % n) + n) % n
    setCurrentLine(target)
    setTimeout(() => {
      lineRefs.current[target]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }, 40)
  }, [lines.length])

  function addLine() {
    if (lines.length >= MAX_LINES) { toast(`Maximum ${MAX_LINES} lines allowed.`, 'error'); return }
    const newIdx = lines.length
    setLines(ls => [...ls, DEFAULT_BLANK_LINE()])
    goToLine(newIdx, newIdx + 1)
  }

  function removeLine(i) {
    if (lines.length <= 2) return
    setLines(ls => ls.filter((_, idx) => idx !== i))
    setCurrentLine(prev => Math.min(prev, lines.length - 2))
  }

  const totalDebit  = lines.reduce((s, l) => s + (parseFloat(l.debit_amount)  || 0), 0)
  const totalCredit = lines.reduce((s, l) => s + (parseFloat(l.credit_amount) || 0), 0)
  const diff        = Math.abs(totalDebit - totalCredit)
  const balanced    = diff < 0.01

  function autoBalance() {
    if (balanced) return
    if (totalDebit > totalCredit) {
      const idx = lines.findIndex(l => !parseFloat(l.credit_amount))
      if (idx >= 0) sl(idx, 'credit_amount', (totalDebit - totalCredit).toFixed(2))
    } else {
      const idx = lines.findIndex(l => !parseFloat(l.debit_amount))
      if (idx >= 0) sl(idx, 'debit_amount', (totalCredit - totalDebit).toFixed(2))
    }
  }

  async function handleSave(andPost = false) {
    if (!header.entry_date) { toast('Entry date is required', 'error'); return }
    const validLines = lines.filter(l => l.account_id && (parseFloat(l.debit_amount) > 0 || parseFloat(l.credit_amount) > 0))
    if (validLines.length < 2) { toast('At least 2 line items with amounts are required', 'error'); return }
    if (!balanced) { toast(`Entry not balanced — difference ₹${diff.toFixed(2)}`, 'error'); return }
    setSaving(true)
    try {
      const je = isEditing
        ? await updateJournalEntry(entryId, header, validLines, profile?.email || 'user')
        : await createJournalEntry(header, validLines, profile?.email || 'user')
      if (andPost) {
        await postJournalEntry(je.id, profile?.email || 'user')
        toast(`Entry ${isEditing ? 'updated' : 'saved'} and posted!`, 'success')
      } else {
        toast(`Entry ${isEditing ? 'updated' : 'saved'} as draft.`, 'success')
      }
      onSaved?.()
      onClose()
    } catch (e) { toast(e.message, 'error') }
    setSaving(false)
  }

  // Stable refs — always point to current closures
  const saveDraftRef = useRef(null)
  const savePostRef  = useRef(null)
  const addLineRef   = useRef(null)
  saveDraftRef.current = () => handleSave(false)
  savePostRef.current  = () => handleSave(true)
  addLineRef.current   = addLine

  // Keyboard shortcuts — capture phase so they fire even inside inputs
  useEffect(() => {
    function onKey(e) {
      if (e.ctrlKey && !e.altKey && !e.shiftKey && e.key === 's') { e.preventDefault(); saveDraftRef.current?.() }
      if (e.ctrlKey && e.key === 'Enter') { e.preventDefault(); savePostRef.current?.() }
      if (e.altKey && e.key.toLowerCase() === 'n') { e.preventDefault(); addLineRef.current?.() }
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [onClose])

  const VCOL = VOUCHER_COLOR[header.voucher_type] || { bg: '#f1f5f9', text: '#475569' }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.65)',
        backdropFilter: 'blur(3px)', zIndex: 9999,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 12,
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{
        width: 'min(98vw, 1180px)', height: '96vh',
        background: 'var(--card-bg)', borderRadius: 14,
        boxShadow: '0 32px 80px rgba(0,0,0,0.45)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>

        {/* ── Header — theme-aware (white/dark), voucher color accent ── */}
        <div style={{
          background: 'var(--card-bg)',
          borderRadius: '14px 14px 0 0',
          padding: '13px 20px',
          display: 'flex', alignItems: 'center', gap: 12,
          flexShrink: 0,
          borderBottom: `3px solid ${VCOL.text}`,
          transition: 'border-color 0.25s ease',
        }}>
          <div style={{
            width: 34, height: 34, borderRadius: 9,
            background: `${VCOL.text}18`, border: `1.5px solid ${VCOL.text}44`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'background 0.25s, border-color 0.25s',
          }}>
            <FileText size={16} style={{ color: VCOL.text, transition: 'color 0.25s' }} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-1)' }}>
              {isEditing ? 'Edit' : 'New'} {header.voucher_type} Entry
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-3)' }}>
              {ready ? header.entry_number || 'Auto-numbered' : 'Loading…'}
            </div>
          </div>
          <button onClick={onClose}
            style={{ background: 'var(--table-header-bg)', border: '1px solid var(--card-border)', borderRadius: 7, padding: '5px 8px', cursor: 'pointer', color: 'var(--text-2)', display: 'flex', alignItems: 'center', transition: 'all 0.15s' }}
            onMouseEnter={e => { e.currentTarget.style.background = '#fee2e2'; e.currentTarget.style.color = '#b91c1c'; e.currentTarget.style.borderColor = '#fecaca' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'var(--table-header-bg)'; e.currentTarget.style.color = 'var(--text-2)'; e.currentTarget.style.borderColor = 'var(--card-border)' }}>
            <X size={14} />
          </button>
        </div>

        {/* ── Voucher Type Pills ────────────────────────────────
             Each pill is individually Tab-able and auto-selects on focus.
             Tab cycles Receipt → Payment → Journal → Contra → Opening → Date.
             ← / → arrows also navigate. Enter from any pill jumps to Date. ── */}
        <div
          role="radiogroup"
          aria-label="Voucher type"
          style={{ padding: '10px 20px', display: 'flex', gap: 7, flexWrap: 'wrap', flexShrink: 0, borderBottom: '1px solid var(--card-border)', alignItems: 'center' }}
        >
          {VOUCHER_TYPES.map((t, idx) => {
            const vc = VOUCHER_COLOR[t] || { bg: '#f1f5f9', text: '#475569' }
            const active = header.voucher_type === t
            const isLast = idx === VOUCHER_TYPES.length - 1
            return (
              <button
                key={t}
                id={`je-pill-${t}`}
                role="radio"
                aria-checked={active}
                tabIndex={0}
                onClick={() => sh('voucher_type', t)}
                onFocus={() => sh('voucher_type', t)}
                onKeyDown={e => {
                  const types = VOUCHER_TYPES
                  const cur   = types.indexOf(t)
                  if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
                    e.preventDefault()
                    const next = types[(cur + 1) % types.length]
                    sh('voucher_type', next)
                    document.getElementById(`je-pill-${next}`)?.focus()
                  } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
                    e.preventDefault()
                    const prev = types[(cur - 1 + types.length) % types.length]
                    sh('voucher_type', prev)
                    document.getElementById(`je-pill-${prev}`)?.focus()
                  } else if (e.key === 'Enter' || (e.key === 'Tab' && isLast && !e.shiftKey)) {
                    // Enter from any pill, or Tab from last pill → jump to date
                    e.preventDefault()
                    document.getElementById('je-modal-date')?.focus()
                  }
                  // Tab on non-last pill: let browser move to next pill naturally
                }}
                style={{
                  padding: '7px 18px',
                  borderRadius: 99,
                  fontSize: 11, fontWeight: 700, cursor: 'pointer',
                  border: `2px solid ${active ? vc.text : 'var(--card-border)'}`,
                  background: active ? vc.text : 'transparent',
                  color: active ? '#fff' : 'var(--text-2)',
                  boxShadow: active ? `0 3px 10px ${vc.text}38` : 'none',
                  outline: 'none',
                  transition: 'background 0.18s ease-out, border-color 0.18s ease-out, color 0.18s ease-out, box-shadow 0.18s ease-out',
                }}>
                {t}
              </button>
            )
          })}
          <span style={{ fontSize: 10, color: 'var(--text-3)', marginLeft: 4 }}>
            Tab / ← → to switch · Enter to go to date
          </span>
        </div>

        {/* ── Body (two-panel) ──────────────────────────────── */}
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 }}>

          {/* LEFT: Entry Details */}
          <div style={{ width: 360, flexShrink: 0, borderRight: '1px solid var(--card-border)', padding: '14px 18px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12 }}>

            {/* FY badge at top */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-3)', margin: 0 }}>Entry Details</p>
              <span style={{
                fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 99,
                background: `${VCOL.text}16`, color: VCOL.text, border: `1px solid ${VCOL.text}40`,
                transition: 'all 0.25s',
              }}>
                FY {header.financial_year}
              </span>
            </div>

            {/* Date — full width, auto-focused */}
            <div>
              <label style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-3)', display: 'block', marginBottom: 4 }}>Entry Date *</label>
              <input id="je-modal-date" type="date" value={header.entry_date}
                onChange={e => { const d = e.target.value; setHeader(h => ({ ...h, entry_date: d, financial_year: d ? getFY(d) : h.financial_year })) }}
                style={{ width: '100%', height: 36, padding: '0 10px', border: `1.5px solid ${VCOL.text}66`, borderRadius: 8, fontSize: 13, background: 'var(--input-bg)', color: 'var(--text-1)', outline: 'none', boxSizing: 'border-box', transition: 'border-color 0.25s' }} />
            </div>

            {/* Entry # + Reference */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <div>
                <label style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-3)', display: 'block', marginBottom: 4 }}>Entry No</label>
                <input value={header.entry_number} onChange={e => sh('entry_number', e.target.value)}
                  style={{ width: '100%', height: 34, padding: '0 8px', border: '1.5px solid var(--card-border)', borderRadius: 7, fontSize: 12, fontFamily: 'monospace', fontWeight: 700, background: 'var(--input-bg)', color: 'var(--text-1)', outline: 'none', boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-3)', display: 'block', marginBottom: 4 }}>Reference</label>
                <input value={header.reference_no} onChange={e => sh('reference_no', e.target.value)} placeholder="Cheque #"
                  style={{ width: '100%', height: 34, padding: '0 8px', border: '1.5px solid var(--card-border)', borderRadius: 7, fontSize: 12, background: 'var(--input-bg)', color: 'var(--text-1)', outline: 'none', boxSizing: 'border-box' }} />
              </div>
            </div>

            {/* Narration */}
            <div>
              <label style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-3)', display: 'block', marginBottom: 4 }}>Narration</label>
              <textarea value={header.narration} onChange={e => sh('narration', e.target.value)} rows={3} placeholder="Describe the transaction…"
                style={{ width: '100%', padding: '8px 10px', border: '1.5px solid var(--card-border)', borderRadius: 8, fontSize: 12, background: 'var(--input-bg)', color: 'var(--text-1)', outline: 'none', resize: 'vertical', boxSizing: 'border-box', minHeight: 72 }} />
            </div>

            {/* Balance summary */}
            <div>
              <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-3)', margin: '0 0 8px' }}>Balance Check</p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, marginBottom: 8 }}>
                <div style={{ textAlign: 'center', padding: '8px 4px', background: '#dbeafe22', borderRadius: 8, border: '1px solid #dbeafe' }}>
                  <p style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', color: '#2563eb', margin: '0 0 2px' }}>Debit</p>
                  <p style={{ fontSize: 14, fontWeight: 800, fontFamily: 'monospace', color: '#2563eb', margin: 0 }}>{fmtAmt(totalDebit)}</p>
                </div>
                <div style={{ textAlign: 'center', padding: '8px 4px', background: '#dcfce722', borderRadius: 8, border: '1px solid #dcfce7' }}>
                  <p style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', color: '#16a34a', margin: '0 0 2px' }}>Credit</p>
                  <p style={{ fontSize: 14, fontWeight: 800, fontFamily: 'monospace', color: '#16a34a', margin: 0 }}>{fmtAmt(totalCredit)}</p>
                </div>
                <div style={{ textAlign: 'center', padding: '8px 4px', background: balanced ? '#dcfce722' : '#fee2e222', borderRadius: 8, border: `1px solid ${balanced ? '#dcfce7' : '#fecaca'}` }}>
                  <p style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', color: balanced ? '#16a34a' : '#b91c1c', margin: '0 0 2px' }}>Status</p>
                  <p style={{ fontSize: 13, fontWeight: 800, fontFamily: 'monospace', color: balanced ? '#16a34a' : '#b91c1c', margin: 0 }}>{balanced ? '✓ OK' : fmtAmt(diff)}</p>
                </div>
              </div>
              {!balanced && totalDebit > 0 && (
                <button onClick={autoBalance}
                  style={{ width: '100%', padding: '6px 10px', background: '#fff7ed', color: '#c2410c', border: '1.5px dashed #fdba74', borderRadius: 7, fontSize: 11, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
                  <Zap size={12} /> Auto-balance {fmtAmt(diff)}
                </button>
              )}
            </div>
          </div>

          {/* RIGHT: Transaction Lines */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
            <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--card-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, gap: 10 }}>
              <div style={{ minWidth: 0 }}>
                <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)', margin: 0 }}>Transaction Lines</p>
                <p style={{ fontSize: 10, color: 'var(--text-3)', margin: '2px 0 0' }}>
                  Tab/Enter to confirm account → cursor jumps to Debit or Credit automatically
                </p>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                {/* Prev / counter / Next */}
                <button
                  onClick={() => goToLine(currentLine - 1)}
                  title="Previous line"
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, background: 'var(--table-header-bg)', border: '1px solid var(--card-border)', borderRadius: 6, cursor: 'pointer', color: 'var(--text-2)' }}>
                  <ChevronUp size={14} />
                </button>
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-2)', minWidth: 62, textAlign: 'center' }}>
                  Line {currentLine + 1} / {lines.length}
                </span>
                <button
                  onClick={() => goToLine(currentLine + 1)}
                  title="Next line"
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, background: 'var(--table-header-bg)', border: '1px solid var(--card-border)', borderRadius: 6, cursor: 'pointer', color: 'var(--text-2)' }}>
                  <ChevronDown size={14} />
                </button>
                {/* Add Line */}
                <button onClick={addLine} disabled={lines.length >= MAX_LINES}
                  title={lines.length >= MAX_LINES ? `Max ${MAX_LINES} lines` : 'Add line (Alt+N)'}
                  style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 12px', background: lines.length >= MAX_LINES ? 'var(--table-header-bg)' : '#dbeafe', color: lines.length >= MAX_LINES ? 'var(--text-3)' : '#2563eb', border: 'none', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: lines.length >= MAX_LINES ? 'not-allowed' : 'pointer', opacity: lines.length >= MAX_LINES ? 0.55 : 1 }}>
                  <PlusCircle size={12} /> Add Line <span style={{ opacity: 0.55, fontSize: 9, marginLeft: 2 }}>Alt+N</span>
                </button>
              </div>
            </div>

            <div ref={linesBodyRef} style={{ flex: 1, overflowY: 'auto', overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 380 }}>
                <thead style={{ background: 'var(--table-header-bg)', position: 'sticky', top: 0, zIndex: 10 }}>
                  <tr>
                    <th style={{ padding: '8px 10px', fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-3)', textAlign: 'center', width: 30 }}>#</th>
                    <th style={{ padding: '8px 10px', fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-3)', textAlign: 'left' }}>Account / Ledger</th>
                    <th style={{ padding: '8px 10px', fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#2563eb', textAlign: 'right', width: 130 }}>Debit (₹)</th>
                    <th style={{ padding: '8px 10px', fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#16a34a', textAlign: 'right', width: 130 }}>Credit (₹)</th>
                    <th style={{ width: 32 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line, i) => {
                    const debitDisabled  = line.side === 'credit'
                    const creditDisabled = line.side === 'debit'
                    const isActive = i === currentLine
                    return (
                      <tr key={i}
                        ref={el => { lineRefs.current[i] = el }}
                        onClick={() => setCurrentLine(i)}
                        style={{ background: isActive ? 'var(--sidebar-item-active-bg)' : i % 2 ? 'rgba(0,0,0,0.012)' : 'transparent', outline: isActive ? `2px solid var(--accent)` : 'none', outlineOffset: -2, cursor: 'default' }}>
                        <td style={{ padding: '6px 10px', fontSize: 11, fontWeight: 700, color: isActive ? 'var(--accent)' : 'var(--text-3)', textAlign: 'center' }}>{i + 1}</td>
                        <td style={{ padding: '4px 6px', minWidth: 180 }}>
                          <AccountSearch
                            value={line.account_id}
                            accounts={accounts}
                            lineIdx={i}
                            onChange={(accountId, side) => handleLineAccountChange(i, accountId, side)}
                          />
                        </td>
                        <td style={{ padding: '4px 6px' }}>
                          <input type="number" min="0" step="0.01"
                            data-line={i} data-side="debit"
                            value={line.debit_amount}
                            onChange={e => sl(i, 'debit_amount', e.target.value)}
                            disabled={debitDisabled}
                            placeholder={debitDisabled ? '—' : '0.00'}
                            style={{
                              width: '100%', height: 34, padding: '0 8px',
                              border: `1.5px solid ${debitDisabled ? 'transparent' : '#bfdbfe'}`,
                              borderRadius: 7, fontSize: 12, fontFamily: 'monospace', textAlign: 'right',
                              background: debitDisabled ? 'var(--table-header-bg)' : parseFloat(line.debit_amount) > 0 ? '#dbeafe44' : 'var(--input-bg)',
                              color: debitDisabled ? 'var(--text-3)' : '#2563eb',
                              outline: 'none', boxSizing: 'border-box',
                              cursor: debitDisabled ? 'not-allowed' : 'text',
                              opacity: debitDisabled ? 0.45 : 1,
                            }} />
                        </td>
                        <td style={{ padding: '4px 6px' }}>
                          <input type="number" min="0" step="0.01"
                            data-line={i} data-side="credit"
                            value={line.credit_amount}
                            onChange={e => sl(i, 'credit_amount', e.target.value)}
                            disabled={creditDisabled}
                            placeholder={creditDisabled ? '—' : '0.00'}
                            style={{
                              width: '100%', height: 34, padding: '0 8px',
                              border: `1.5px solid ${creditDisabled ? 'transparent' : '#bbf7d0'}`,
                              borderRadius: 7, fontSize: 12, fontFamily: 'monospace', textAlign: 'right',
                              background: creditDisabled ? 'var(--table-header-bg)' : parseFloat(line.credit_amount) > 0 ? '#dcfce744' : 'var(--input-bg)',
                              color: creditDisabled ? 'var(--text-3)' : '#16a34a',
                              outline: 'none', boxSizing: 'border-box',
                              cursor: creditDisabled ? 'not-allowed' : 'text',
                              opacity: creditDisabled ? 0.45 : 1,
                            }} />
                        </td>
                        <td style={{ padding: '4px 6px', textAlign: 'center' }}>
                          <button onClick={() => removeLine(i)} disabled={lines.length <= 2}
                            style={{ padding: 4, background: 'none', border: 'none', cursor: lines.length <= 2 ? 'not-allowed' : 'pointer', color: '#b91c1c', opacity: lines.length <= 2 ? 0.18 : 0.55, display: 'flex', alignItems: 'center', transition: 'opacity 0.15s' }}
                            onMouseEnter={e => { if (lines.length > 2) e.currentTarget.style.opacity = '1' }}
                            onMouseLeave={e => { if (lines.length > 2) e.currentTarget.style.opacity = '0.55' }}>
                            <Minus size={13} />
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot style={{ background: 'var(--table-header-bg)', borderTop: '2px solid var(--card-border)' }}>
                  <tr>
                    <td colSpan={2} style={{ padding: '9px 10px', fontSize: 11, fontWeight: 700, color: 'var(--text-2)' }}>TOTAL</td>
                    <td style={{ padding: '9px 10px', fontSize: 13, fontWeight: 800, fontFamily: 'monospace', textAlign: 'right', color: '#2563eb' }}>{fmtAmt(totalDebit)}</td>
                    <td style={{ padding: '9px 10px', fontSize: 13, fontWeight: 800, fontFamily: 'monospace', textAlign: 'right', color: '#16a34a' }}>{fmtAmt(totalCredit)}</td>
                    <td />
                  </tr>
                  {!balanced && totalDebit > 0 && (
                    <tr>
                      <td colSpan={5} style={{ padding: '7px 10px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#c2410c', fontSize: 11, fontWeight: 600 }}>
                          <AlertCircle size={13} /> Not balanced — difference of {fmtAmt(diff)}
                        </div>
                      </td>
                    </tr>
                  )}
                </tfoot>
              </table>
            </div>
          </div>
        </div>

        {/* ── Footer ────────────────────────────────────────── */}
        <div style={{
          flexShrink: 0, borderTop: '1px solid var(--card-border)',
          padding: '10px 20px',
          display: 'flex', alignItems: 'center', gap: 12,
          background: 'var(--table-header-bg)',
        }}>
          <div style={{ flex: 1, display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center' }}>
            {[['Ctrl+S','Draft'],['Ctrl+↵','Post'],['Alt+N','Add Line'],['↑↓','Navigate'],['Esc','Close']].map(([k, l]) => (
              <span key={k} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--text-3)' }}>
                <kbd style={{ padding: '1px 6px', background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: 4, fontSize: 9, fontFamily: 'monospace', fontWeight: 700, color: 'var(--text-2)' }}>{k}</kbd>
                {l}
              </span>
            ))}
          </div>
          <button onClick={onClose}
            style={{ padding: '8px 18px', background: 'var(--card-bg)', border: '1.5px solid var(--card-border)', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer', color: 'var(--text-2)' }}>
            Cancel
          </button>
          <button onClick={() => handleSave(false)} disabled={saving}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 18px', background: 'var(--card-bg)', border: `1.5px solid ${VCOL.text}`, borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer', color: VCOL.text, transition: 'border-color 0.25s, color 0.25s' }}>
            {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
            {isEditing ? 'Update Draft' : 'Save Draft'}
          </button>
          <button onClick={() => handleSave(true)} disabled={saving || !balanced}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 22px', background: balanced ? VCOL.text : '#e5e7eb', color: balanced ? '#fff' : '#9ca3af', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: balanced ? 'pointer' : 'not-allowed', transition: 'background 0.25s', boxShadow: balanced ? `0 4px 12px ${VCOL.text}44` : 'none' }}>
            {saving ? <Loader2 size={13} className="animate-spin" /> : <CheckSquare size={13} />}
            {isEditing ? 'Update & Post' : 'Save & Post'}
          </button>
        </div>
      </div>
    </div>
  )
}
