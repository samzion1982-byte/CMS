import { useState, useRef, useMemo } from 'react'
import { PlusCircle, Loader2, Save, X } from 'lucide-react'
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

// ── Quick-add modal ───────────────────────────────────────────────
function QuickAddModal({ initialName, allCoa, entityId, performedBy, onClose, onCreated }) {
  const [name,       setName]       = useState(initialName)
  const [parentId,   setParentId]   = useState('')
  const [parentQ,    setParentQ]    = useState('')
  const [parentOpen, setParentOpen] = useState(false)
  const [saving,     setSaving]     = useState(false)
  const [error,      setError]      = useState('')

  // Allow level 1–3 accounts as parent (new account becomes level 2–4)
  const parentOptions = useMemo(() => {
    const opts = allCoa.filter(a => a.level <= 3 && a.is_active !== false)
    if (!parentQ.trim()) return opts.slice(0, 20)
    return opts.filter(a => matchAcct(a.name, parentQ)).slice(0, 15)
  }, [allCoa, parentQ])

  const selectedParent = allCoa.find(a => a.id === parentId)
  const newLevel       = selectedParent ? selectedParent.level + 1 : 3

  async function handleSave() {
    if (!name.trim())  { setError('Account name is required'); return }
    if (!parentId)     { setError('Select a parent account group'); return }
    if (newLevel > 4)  { setError('Cannot add a sub-account under a Level-4 account'); return }
    setSaving(true)
    setError('')
    try {
      const ts = Date.now().toString(36).toUpperCase()
      const payload = {
        name:        name.trim(),
        account_type: selectedParent.account_type,
        is_active:   true,
        is_postable: newLevel >= 3,
        level:       newLevel,
        parent_id:   parentId,
        entity_id:   entityId,
        sort_order:  0,
        code:        `AC-${ts}`,
      }
      const newAcct = await createAccount(payload, performedBy || 'user')
      onCreated(newAcct)
    } catch (e) { setError(e.message) }
    setSaving(false)
  }

  const LEVEL_LABEL = { 1: 'Main Account', 2: 'Account Group', 3: 'Ledger', 4: 'Sub-Ledger' }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ background: 'var(--card-bg)', borderRadius: 14, width: '100%', maxWidth: 560, boxShadow: '0 24px 60px rgba(0,0,0,0.3)', overflow: 'hidden' }}>

        {/* Header */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--card-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--accent-subtle)' }}>
          <div>
            <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-1)', margin: 0 }}>Add Account to COA</p>
            <p style={{ fontSize: 11, color: 'var(--text-3)', margin: 0 }}>Create a new ledger and continue</p>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', display: 'flex' }}>
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {error && (
            <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: '#dc2626' }}>
              {error}
            </div>
          )}

          <div>
            <label style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-3)', display: 'block', marginBottom: 5 }}>
              Account Name *
            </label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSave()}
              autoFocus
              style={{ width: '100%', height: 38, padding: '0 12px', border: '1.5px solid var(--card-border)', borderRadius: 8, fontSize: 13, background: 'var(--input-bg)', color: 'var(--text-1)', outline: 'none', boxSizing: 'border-box' }}
            />
          </div>

          <div>
            <label style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-3)', display: 'block', marginBottom: 5 }}>
              Parent Group *
            </label>
            <div style={{ position: 'relative' }}>
              <input
                value={parentOpen ? parentQ : (selectedParent?.name || '')}
                onChange={e => { setParentQ(e.target.value); setParentOpen(true) }}
                onFocus={() => { setParentQ(''); setParentOpen(true) }}
                onBlur={() => setTimeout(() => setParentOpen(false), 160)}
                placeholder="Search account group…"
                style={{ width: '100%', height: 38, padding: '0 12px', border: '1.5px solid var(--card-border)', borderRadius: 8, fontSize: 13, background: 'var(--input-bg)', color: 'var(--text-1)', outline: 'none', boxSizing: 'border-box' }}
              />
              {parentOpen && parentOptions.length > 0 && (
                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 300, background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.18)', maxHeight: 280, overflowY: 'auto', marginTop: 2 }}>
                  {parentOptions.map(a => (
                    <div key={a.id} onMouseDown={() => { setParentId(a.id); setParentOpen(false) }}
                      style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid var(--card-border)' }}>
                      <div style={{ fontSize: 10, color: 'var(--text-3)', marginBottom: 1 }}>
                        {'› '.repeat(a.level - 1)}{a.account_type} · {LEVEL_LABEL[a.level] || `Level ${a.level}`}
                      </div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>{a.name}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            {selectedParent && (
              <p style={{ fontSize: 11, color: 'var(--text-3)', margin: '4px 0 0' }}>
                Type: <strong>{selectedParent.account_type}</strong> · Will be created as <strong>{LEVEL_LABEL[newLevel] || `Level ${newLevel}`}</strong>
              </p>
            )}
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding: '14px 20px', borderTop: '1px solid var(--card-border)', display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={onClose}
            style={{ padding: '8px 18px', background: 'var(--card-bg)', border: '1.5px solid var(--card-border)', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', color: 'var(--text-2)' }}>
            Cancel
          </button>
          <button onClick={handleSave} disabled={saving}
            style={{ padding: '8px 22px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 7, opacity: saving ? 0.7 : 1 }}>
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
//   value, accounts, onChange, placeholder, disabled  — existing behaviour
//   allCoa        — full COA list (for quick-add parent picker)
//   entityId      — entity to create account under
//   onAccountCreated(newAcct) — called after quick-add so parent can refresh allCoa
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
  const { profile } = useAuth()
  const [query,    setQuery]    = useState('')
  const [open,     setOpen]     = useState(false)
  const [hi,       setHi]       = useState(0)
  const [quickAdd, setQuickAdd] = useState(false)
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

  function onKey(e) {
    if      (e.key === 'ArrowDown' )         { e.preventDefault(); setHi(h => Math.min(h + 1, filtered.length - 1)) }
    else if (e.key === 'ArrowUp'  )          { e.preventDefault(); setHi(h => Math.max(h - 1, 0)) }
    else if (e.key === 'Escape'   )          { setOpen(false) }
    else if (e.key === 'Enter' && open)      { e.preventDefault(); if (filtered[hi]) pick(filtered[hi]); else setOpen(false) }
    else if (e.key === 'Tab'   && open)      { if (filtered[hi]) pick(filtered[hi]) }
  }

  function handleCreated(newAcct) {
    setQuickAdd(false)
    onAccountCreated?.(newAcct)
    // Select the new account immediately
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
              <div style={{ padding: '10px 12px', borderTop: filtered.length ? '1px solid var(--card-border)' : 'none' }}>
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
