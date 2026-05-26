import { useState, useRef } from 'react'
import { getRecentNarrations } from '../../lib/accountingLib'

export default function NarrationInput({ value, onChange, disabled, placeholder = 'Description of this entry', className = 'field-input', style }) {
  const [suggestions, setSuggestions] = useState([])
  const [open,        setOpen]        = useState(false)
  const [hi,          setHi]          = useState(0)
  const [pos,         setPos]         = useState({ top: 0, left: 0, width: 0 })
  const inputRef = useRef(null)
  const loaded   = useRef(false)

  async function loadOnce() {
    if (loaded.current) return
    loaded.current = true
    try { setSuggestions(await getRecentNarrations(30)) } catch {}
  }

  function openDrop() {
    if (!inputRef.current) return
    const r = inputRef.current.getBoundingClientRect()
    setPos({ top: r.bottom + 2, left: r.left, width: r.width })
  }

  const filtered = suggestions.filter(s =>
    value ? s.toLowerCase().includes(value.toLowerCase()) : true
  ).slice(0, 8)

  function pick(s) { onChange(s); setOpen(false) }

  function onKey(e) {
    if (!open) return
    if      (e.key === 'ArrowDown')                    { e.preventDefault(); setHi(h => Math.min(h + 1, filtered.length - 1)) }
    else if (e.key === 'ArrowUp')                      { e.preventDefault(); setHi(h => Math.max(h - 1, 0)) }
    else if (e.key === 'Escape')                       { setOpen(false) }
    else if (e.key === 'Enter' && filtered[hi])        { e.preventDefault(); pick(filtered[hi]) }
    else if (e.key === 'Tab'   && filtered[hi])        { pick(filtered[hi]) }
  }

  return (
    <div style={{ position: 'relative', ...style }}>
      <input
        ref={inputRef}
        className={className}
        data-narration
        value={value}
        onChange={e => { onChange(e.target.value); setHi(0); if (open) openDrop() }}
        onFocus={() => { loadOnce(); setOpen(true); setHi(0); openDrop() }}
        onBlur={() => setTimeout(() => setOpen(false), 160)}
        onKeyDown={onKey}
        placeholder={placeholder}
        disabled={disabled}
        autoComplete="off"
      />
      {open && filtered.length > 0 && (
        <div style={{
          position: 'fixed', top: pos.top, left: pos.left, width: pos.width,
          zIndex: 9999, background: 'var(--card-bg)', border: '1px solid var(--card-border)',
          borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
          maxHeight: 220, overflowY: 'auto',
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
