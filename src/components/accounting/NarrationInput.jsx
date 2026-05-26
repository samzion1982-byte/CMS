import { useState, useRef, useEffect } from 'react'
import { getRecentNarrations } from '../../lib/accountingLib'

export default function NarrationInput({ value, onChange, disabled, placeholder = 'Description of this entry', className = 'field-input', style }) {
  const [suggestions, setSuggestions] = useState([])
  const [open,        setOpen]        = useState(false)
  const [hi,          setHi]          = useState(0)
  const loaded = useRef(false)

  async function loadOnce() {
    if (loaded.current) return
    loaded.current = true
    try { setSuggestions(await getRecentNarrations(30)) } catch {}
  }

  const filtered = suggestions.filter(s =>
    value ? s.toLowerCase().includes(value.toLowerCase()) : true
  ).slice(0, 8)

  function pick(s) { onChange(s); setOpen(false) }

  function onKey(e) {
    if (!open) return
    if (e.key === 'ArrowDown')          { e.preventDefault(); setHi(h => Math.min(h + 1, filtered.length - 1)) }
    else if (e.key === 'ArrowUp')       { e.preventDefault(); setHi(h => Math.max(h - 1, 0)) }
    else if (e.key === 'Escape')        { setOpen(false) }
    else if (e.key === 'Enter' && filtered[hi]) { e.preventDefault(); pick(filtered[hi]) }
    else if (e.key === 'Tab'   && filtered[hi]) { pick(filtered[hi]) }
  }

  return (
    <div style={{ position: 'relative', ...style }}>
      <input
        className={className}
        data-narration
        value={value}
        onChange={e => { onChange(e.target.value); setHi(0) }}
        onFocus={() => { loadOnce(); setOpen(true); setHi(0) }}
        onBlur={() => setTimeout(() => setOpen(false), 160)}
        onKeyDown={onKey}
        placeholder={placeholder}
        disabled={disabled}
        autoComplete="off"
      />
      {open && filtered.length > 0 && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 400,
          background: 'var(--card-bg)', border: '1px solid var(--card-border)',
          borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
          maxHeight: 200, overflowY: 'auto', marginTop: 2,
        }}>
          {filtered.map((s, i) => (
            <div key={s} onMouseDown={() => pick(s)} style={{
              padding: '8px 12px', cursor: 'pointer', fontSize: 13,
              background: i === hi ? 'var(--accent-subtle, #eff6ff)' : 'transparent',
              borderBottom: i < filtered.length - 1 ? '1px solid var(--card-border)' : 'none',
              color: 'var(--text-1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}>
              {s}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
