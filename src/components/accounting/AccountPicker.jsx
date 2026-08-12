import { useState, useRef, useMemo } from 'react'
import { PlusCircle, Loader2, Save, X, ChevronRight } from 'lucide-react'
import { createAccount } from '../../lib/accountingLib'
import { useAuth } from '../../lib/AuthContext'

// ── Fuzzy match helpers ───────────────────────────────────────────
function norm(s)    { return s.toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim() }
function compact(s) { return s.toLowerCase().replace(/[^a-z0-9]/g, '') }
export function matchAcct(name, q) {
  if (!q) return true
  const nl = name.toLowerCase(), qn = norm(q), nc = compact(name), qc = compact(q)
  if (nl.includes(q) || norm(name).includes(qn) || nc.includes(qc)) return true
  return qn.split(' ').filter(Boolean).every(w => norm(name).includes(w))
}

const LEVEL_LABEL = { 1: 'Main Account', 2: 'Account Group', 3: 'Ledger', 4: 'Sub-Ledger' }

// ── Searchable cascading combobox ────────────────────────────────
function MiniSelect({ label, required, options, selectedId, onSelect, onClear, placeholder, disabled }) {
  const [q,    setQ]    = useState('')
  const [open, setOpen] = useState(false)
  const [hi,   setHi]   = useState(0)
  const [pos,  setPos]  = useState({ top: 0, left: 0, width: 0 })
  const inputRef        = useRef(null)

  const sel      = options.find(o => o.id === selectedId)
  const filtered = q.trim() ? options.filter(o => matchAcct(o.name, q)).slice(0, 20) : options.slice(0, 20)

  function openDrop() {
    if (!inputRef.current) return
    const r = inputRef.current.getBoundingClientRect()
    setPos({ top: r.bottom + 2, left: r.left, width: r.width })
  }

  function pick(a) { onSelect(a); setQ(''); setOpen(false); setHi(0) }

  function onKey(e) {
    if (!open) return
    if      (e.key === 'ArrowDown')                                      { e.preventDefault(); setHi(h => Math.min(h + 1, filtered.length - 1)) }
    else if (e.key === 'ArrowUp')                                        { e.preventDefault(); setHi(h => Math.max(h - 1, 0)) }
    else if (e.key === 'Escape')                                         { setOpen(false) }
    else if ((e.key === 'Enter' || e.key === 'Tab') && filtered.length > 0) { e.preventDefault(); pick(filtered[hi] ?? filtered[0]) }
  }

  return (
    <div>
      <label style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-3)', display: 'block', marginBottom: 4 }}>
        {label}{required ? ' *' : ''}
      </label>
      <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
        <div style={{ flex: 1, position: 'relative' }}>
          <input
            ref={inputRef}
            value={open ? q : (sel?.name || '')}
            onChange={e => { setQ(e.target.value); setOpen(true); setHi(0); openDrop() }}
            onFocus={() => { setQ(''); setOpen(true); setHi(0); openDrop() }}
            onBlur={() => setTimeout(() => setOpen(false), 160)}
            onKeyDown={onKey}
            placeholder={disabled ? (options.length === 0 ? 'None yet' : '—') : placeholder}
            disabled={disabled}
            style={{ width: '100%', height: 34, padding: '0 10px', border: '1.5px solid var(--card-border)', borderRadius: 8, fontSize: 13, background: disabled ? 'rgba(0,0,0,0.03)' : 'var(--input-bg)', color: 'var(--text-1)', outline: 'none', boxSizing: 'border-box', opacity: disabled ? 0.65 : 1 }}
          />
          {open && !disabled && filtered.length > 0 && (
            <div style={{ position: 'fixed', top: pos.top, left: pos.left, width: pos.width, zIndex: 9999, background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.18)', maxHeight: 280, overflowY: 'auto' }}>
              {filtered.map((a, i) => (
                <div key={a.id} onMouseDown={() => pick(a)}
                  style={{ padding: '7px 10px', cursor: 'pointer', borderBottom: '1px solid var(--card-border)', fontSize: 13, fontWeight: 600, color: 'var(--text-1)', background: i === hi ? 'var(--accent-subtle)' : 'transparent' }}>
                  {a.name}
                </div>
              ))}
            </div>
          )}
        </div>
        {selectedId && onClear && (
          <button onMouseDown={e => { e.preventDefault(); onClear() }}
            title="Clear selection"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 3, display: 'flex', flexShrink: 0 }}>
            <X size={13} />
          </button>
        )}
      </div>
    </div>
  )
}

// ── Quick-add modal ───────────────────────────────────────────────
function QuickAddModal({ initialName, allCoa, entityId, performedBy, onClose, onCreated }) {
  const [name,   setName]   = useState(initialName)
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState('')

  const [l1Id, setL1Id] = useState('')
  const [l2Id, setL2Id] = useState('')
  const [l3Id, setL3Id] = useState('')

  const l1Options = useMemo(() => allCoa.filter(a => a.level === 1 && a.is_active !== false), [allCoa])
  const l2Options = useMemo(() => allCoa.filter(a => a.level === 2 && a.parent_id === l1Id && a.is_active !== false), [allCoa, l1Id])
  const l3Options = useMemo(() => allCoa.filter(a => a.level === 3 && a.parent_id === l2Id && a.is_active !== false), [allCoa, l2Id])

  const sel1 = l1Options.find(a => a.id === l1Id)
  const sel2 = l2Options.find(a => a.id === l2Id)
  const sel3 = l3Options.find(a => a.id === l3Id)

  const parentAcct = sel3 || sel2 || sel1 || null
  const newLevel   = parentAcct ? parentAcct.level + 1 : null
  const canSave    = !saving && name.trim() && parentAcct && (!newLevel || newLevel <= 4)

  async function handleSave() {
    if (!name.trim()) { setError('Account name is required'); return }
    if (!parentAcct)  { setError('Select a Main Account to place the new account under'); return }
    if (newLevel > 4) { setError('Cannot add sub-accounts under a Level-4 account'); return }
    setSaving(true); setError('')
    try {
      const ts = Date.now().toString(36).toUpperCase()
      const newAcct = await createAccount({
        name:         name.trim(),
        account_type: parentAcct.account_type,
        is_active:    true,
        is_postable:  newLevel >= 3,
        level:        newLevel,
        parent_id:    parentAcct.id,
        entity_id:    entityId,
        sort_order:   0,
        code:         `AC-${ts}`,
      }, performedBy || 'user')
      onCreated(newAcct)
    } catch (e) { setError(e.message) }
    setSaving(false)
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ background: 'var(--card-bg)', borderRadius: 14, width: '100%', maxWidth: 600, boxShadow: '0 24px 60px rgba(0,0,0,0.3)' }}>

        {/* Header */}
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--card-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--accent-subtle)', borderRadius: '13px 13px 0 0' }}>
          <div>
            <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-1)', margin: 0 }}>Quick Add Account</p>
            <p style={{ fontSize: 11, color: 'var(--text-3)', margin: 0 }}>Add to Chart of Accounts and continue</p>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', display: 'flex' }}><X size={18} /></button>
        </div>

        {/* Body */}
        <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>

          {error && (
            <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: '#dc2626' }}>
              {error}
            </div>
          )}

          {/* Account name */}
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-3)', display: 'block', marginBottom: 4 }}>
              Account Name *
            </label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && canSave && handleSave()}
              autoFocus
              style={{ width: '100%', height: 38, padding: '0 12px', border: '1.5px solid var(--card-border)', borderRadius: 8, fontSize: 13, background: 'var(--input-bg)', color: 'var(--text-1)', outline: 'none', boxSizing: 'border-box' }}
            />
          </div>

          {/* Cascading parent selectors */}
          <div style={{ background: 'rgba(0,0,0,0.02)', borderRadius: 10, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10, border: '1px solid var(--card-border)' }}>
            <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-3)', margin: 0 }}>Place Under</p>

            <MiniSelect
              label="Main Account"
              required
              options={l1Options}
              selectedId={l1Id}
              onSelect={a => { setL1Id(a.id); setL2Id(''); setL3Id('') }}
              placeholder="Select Main Account…"
            />

            {l1Id && (
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                <ChevronRight size={14} style={{ color: 'var(--text-3)', marginTop: 26, flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <MiniSelect
                    label="Account Group"
                    options={l2Options}
                    selectedId={l2Id}
                    onSelect={a => { setL2Id(a.id); setL3Id('') }}
                    onClear={() => { setL2Id(''); setL3Id('') }}
                    placeholder={l2Options.length ? 'Select Group (or skip to add as Group)…' : 'No groups yet — will add as Group'}
                    disabled={l2Options.length === 0}
                  />
                </div>
              </div>
            )}

            {l2Id && (
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', paddingLeft: 22 }}>
                <ChevronRight size={14} style={{ color: 'var(--text-3)', marginTop: 26, flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <MiniSelect
                    label="Ledger"
                    options={l3Options}
                    selectedId={l3Id}
                    onSelect={a => setL3Id(a.id)}
                    onClear={() => setL3Id('')}
                    placeholder={l3Options.length ? 'Select Ledger (or skip to add as Ledger)…' : 'No ledgers yet — will add as Ledger'}
                    disabled={l3Options.length === 0}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Result preview */}
          {parentAcct && (
            <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 6, background: 'var(--accent-subtle)', borderRadius: 8, padding: '8px 12px', fontSize: 12 }}>
              <span style={{ color: 'var(--text-3)' }}>Will create:</span>
              <strong style={{ color: 'var(--text-1)' }}>{LEVEL_LABEL[newLevel] || `Level ${newLevel}`}</strong>
              <span style={{ color: 'var(--text-3)' }}>under</span>
              <strong style={{ color: 'var(--accent)' }}>{parentAcct.name}</strong>
              <span style={{ fontSize: 10, color: 'var(--text-3)', background: 'var(--card-bg)', borderRadius: 4, padding: '1px 6px', border: '1px solid var(--card-border)' }}>
                {parentAcct.account_type}
              </span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '12px 20px', borderTop: '1px solid var(--card-border)', display: 'flex', gap: 10, justifyContent: 'flex-end', borderRadius: '0 0 13px 13px', background: 'var(--card-bg)' }}>
          <button onClick={onClose}
            style={{ padding: '8px 16px', background: 'var(--card-bg)', border: '1.5px solid var(--card-border)', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', color: 'var(--text-2)' }}>
            Cancel
          </button>
          <button onClick={handleSave} disabled={!canSave}
            style={{ padding: '8px 20px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 7, opacity: canSave ? 1 : 0.5 }}>
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            {saving ? 'Creating…' : 'Create & Select'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── AccountPicker ─────────────────────────────────────────────────
// Props:
//   value, accounts, onChange, placeholder, disabled — core behaviour
//   allCoa, entityId, onAccountCreated              — for quick-add
export default function AccountPicker({
  value,
  accounts,
  onChange,
  placeholder = 'Select account…',
  disabled    = false,
  allCoa      = [],
  entityId,
  onAccountCreated,
}) {
  const { profile }              = useAuth()
  const [query,    setQuery]     = useState('')
  const [open,     setOpen]      = useState(false)
  const [hi,       setHi]        = useState(0)
  const [quickAdd, setQuickAdd]  = useState(false)
  const saved = useRef(value)

  const selected    = useMemo(() => accounts.find(a => a.id === value), [value, accounts])
  const displayName = selected ? selected.name : ''

  const filtered = useMemo(() => {
    if (!open) return []
    const q = query.trim().toLowerCase()
    if (!q) return accounts.slice(0, 15)
    const matched = accounts.filter(a => matchAcct(a.name, q))
    matched.sort((a, b) => (compact(a.name).startsWith(compact(q)) ? 0 : 1) - (compact(b.name).startsWith(compact(q)) ? 0 : 1))
    return matched.slice(0, 15)
  }, [query, open, accounts])

  const noResults = open && query.trim().length > 0 && filtered.length === 0

  function onFocus() { saved.current = value; setQuery(''); setOpen(true); setHi(0) }
  function onBlur()  { setTimeout(() => { setOpen(false); if (!value && saved.current) onChange(saved.current) }, 160) }
  function pick(a)   { saved.current = a.id; onChange(a.id, a.name); setOpen(false) }

  function openQuickAdd() { setOpen(false); setQuickAdd(true) }

  function onKey(e) {
    if      (e.key === 'ArrowDown')     { e.preventDefault(); setHi(h => Math.min(h + 1, filtered.length - 1)) }
    else if (e.key === 'ArrowUp')       { e.preventDefault(); setHi(h => Math.max(h - 1, 0)) }
    else if (e.key === 'Escape')        { setOpen(false) }
    else if (e.key === '+' && noResults && allCoa.length > 0) { e.preventDefault(); openQuickAdd() }
    else if (e.key === 'Enter' && open) {
      const hasIntent = query.trim().length > 0 || hi > 0
      if (filtered[hi] && hasIntent)           { e.preventDefault(); pick(filtered[hi]) }
      else if (noResults && allCoa.length > 0) { e.preventDefault(); openQuickAdd() }
      else setOpen(false)
    }
    else if (e.key === 'Tab' && open) {
      const hasIntent = query.trim().length > 0 || hi > 0
      if (filtered[hi] && hasIntent) pick(filtered[hi])
      else setOpen(false)
    }
  }

  function handleCreated(newAcct) {
    setQuickAdd(false)
    onAccountCreated?.(newAcct)
    saved.current = newAcct.id
    onChange(newAcct.id, newAcct.name)
    setOpen(false)
  }

  return (
    <>
      <div style={{ position: 'relative', flex: 1, minWidth: 0 }}>
        <input
          className="field-input"
          value={open ? query : displayName}
          onChange={e => { setQuery(e.target.value); setHi(0) }}
          onFocus={onFocus} onBlur={onBlur} onKeyDown={onKey}
          placeholder={placeholder} disabled={disabled} autoComplete="off"
        />

        {open && (filtered.length > 0 || noResults) && (
          <div style={{
            position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 300,
            background: 'var(--card-bg)', border: '1px solid var(--card-border)',
            borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
            maxHeight: 240, overflowY: 'auto', marginTop: 2,
          }}>
            {filtered.map((a, i) => (
              <div key={a.id} onMouseDown={() => pick(a)} style={{
                padding: '8px 12px', cursor: 'pointer',
                background: i === hi ? 'var(--accent-subtle)' : 'transparent',
                borderBottom: '1px solid var(--card-border)',
              }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>{a.name}</div>
              </div>
            ))}

            {noResults && (
              <div style={{ padding: '10px 12px' }}>
                <p style={{ fontSize: 12, color: 'var(--text-3)', margin: '0 0 8px' }}>
                  "<strong>{query}</strong>" not found in Chart of Accounts
                </p>
                {allCoa.length > 0 ? (
                  <button
                    onMouseDown={e => { e.preventDefault(); setOpen(false); setQuickAdd(true) }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 6,
                      padding: '7px 12px', width: '100%',
                      background: 'var(--accent)', color: '#fff',
                      border: 'none', borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                    }}
                  >
                    <PlusCircle size={13} /> Add "{query}" to Chart of Accounts
                  </button>
                ) : (
                  <p style={{ fontSize: 11, color: 'var(--text-3)', margin: 0 }}>
                    Open Chart of Accounts (Alt+C) to add it.
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {quickAdd && (
        <QuickAddModal
          initialName={query}
          allCoa={allCoa}
          entityId={entityId}
          performedBy={profile?.email || 'user'}
          onClose={() => setQuickAdd(false)}
          onCreated={handleCreated}
        />
      )}
    </>
  )
}
