import { useEffect, useRef, useState } from 'react'

function parseIsoDateParts(iso) {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(String(iso))) return { d: '', m: '', y: '' }
  const [y, m, d] = String(iso).split('-')
  return { d, m, y }
}

function daysInMonth(month, year) {
  const mi = Number(month)
  const yi = Number(year)
  if (!mi || mi < 1 || mi > 12) return 31
  if (yi && String(year).length === 4) return new Date(yi, mi, 0).getDate()
  return 31
}

function isoFromParts(d, m, y) {
  if (d.length !== 2 || m.length !== 2 || y.length !== 4) return ''
  const di = Number(d)
  const mi = Number(m)
  const yi = Number(y)
  if (mi < 1 || mi > 12) return ''
  const max = daysInMonth(m, y)
  if (di < 1 || di > max) return ''
  return `${y}-${m}-${d}`
}

function isValidDayPrefix(text, month, year) {
  if (!text) return true
  if (!/^\d{1,2}$/.test(text)) return false
  if (text.length === 1) return Number(text) <= 3
  const n = Number(text)
  const max = daysInMonth(month, year)
  return n >= 1 && n <= max
}

function isValidMonthPrefix(text) {
  if (!text) return true
  if (!/^\d{1,2}$/.test(text)) return false
  const n = Number(text)
  if (text.length === 1) return n <= 1
  return n >= 1 && n <= 12
}

function isValidYearPrefix(text) {
  if (!text) return true
  return /^\d{1,4}$/.test(text)
}

/**
 * DD-MM-YYYY segmented date entry. Emits ISO yyyy-mm-dd when complete; '' when cleared.
 */
export default function DatePartsInput({ value, onChange, onComplete, style, disabled }) {
  const [parts, setParts] = useState(() => parseIsoDateParts(value))
  const dayRef = useRef(null)
  const monthRef = useRef(null)
  const yearRef = useRef(null)
  const focusedRef = useRef(false)

  useEffect(() => {
    if (focusedRef.current) return
    setParts(parseIsoDateParts(value))
  }, [value])

  function commit(next, { advanceTo } = {}) {
    setParts(next)
    const iso = isoFromParts(next.d, next.m, next.y)
    if (iso) {
      onChange?.(iso)
      if (advanceTo === 'done') onComplete?.(yearRef.current)
    } else if (!next.d && !next.m && !next.y) {
      onChange?.('')
    }
    if (advanceTo === 'month') monthRef.current?.focus()
    if (advanceTo === 'year') yearRef.current?.focus()
  }

  function onPartChange(which, raw) {
    const digits = raw.replace(/\D/g, '')
    if (which === 'd') {
      const d = digits.slice(0, 2)
      if (!isValidDayPrefix(d, parts.m, parts.y)) return
      const next = { ...parts, d }
      const complete = d.length === 2 && isValidDayPrefix(d, parts.m, parts.y)
      commit(next, { advanceTo: complete ? 'month' : undefined })
      return
    }
    if (which === 'm') {
      const m = digits.slice(0, 2)
      if (!isValidMonthPrefix(m)) return
      let d = parts.d
      if (d.length === 2 && m.length === 2) {
        const max = daysInMonth(m, parts.y)
        if (Number(d) > max) d = String(max).padStart(2, '0')
      }
      const next = { ...parts, m, d }
      const complete = m.length === 2 && Number(m) >= 1 && Number(m) <= 12
      commit(next, { advanceTo: complete ? 'year' : undefined })
      return
    }
    const y = digits.slice(0, 4)
    if (!isValidYearPrefix(y)) return
    let d = parts.d
    if (d.length === 2 && parts.m.length === 2 && y.length === 4) {
      const max = daysInMonth(parts.m, y)
      if (Number(d) > max) d = String(max).padStart(2, '0')
    }
    const next = { ...parts, y, d }
    const complete = y.length === 4 && !!isoFromParts(next.d, next.m, next.y)
    commit(next, { advanceTo: complete ? 'done' : undefined })
  }

  function onPartKeyDown(which, e) {
    if (e.key === 'Enter') {
      e.preventDefault()
      if (which === 'd') monthRef.current?.focus()
      else if (which === 'm') yearRef.current?.focus()
      else onComplete?.(e.target)
      return
    }
    if (e.key === 'Backspace' && !e.currentTarget.value) {
      e.preventDefault()
      if (which === 'm') dayRef.current?.focus()
      if (which === 'y') monthRef.current?.focus()
      return
    }
    if (e.key === 'ArrowLeft' && e.currentTarget.selectionStart === 0) {
      if (which === 'm') { e.preventDefault(); dayRef.current?.focus() }
      if (which === 'y') { e.preventDefault(); monthRef.current?.focus() }
    }
    if (e.key === 'ArrowRight' && e.currentTarget.selectionStart === e.currentTarget.value.length) {
      if (which === 'd') { e.preventDefault(); monthRef.current?.focus() }
      if (which === 'm') { e.preventDefault(); yearRef.current?.focus() }
    }
  }

  const segStyle = (which) => ({
    width: which === 'y' ? 52 : 30,
    border: 'none',
    outline: 'none',
    background: 'transparent',
    color: 'var(--text-1)',
    fontSize: 13,
    fontWeight: 600,
    textAlign: 'center',
    padding: 0,
    height: 34,
    letterSpacing: which === 'y' ? '0.04em' : '0.06em',
  })

  return (
    <div
      className="date-parts-input"
      data-date-parts="1"
      onFocusCapture={() => { focusedRef.current = true }}
      onBlurCapture={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) focusedRef.current = false
      }}
      style={{
        height: 38,
        boxSizing: 'border-box',
        border: '1.5px solid var(--input-border, var(--card-border))',
        borderRadius: 9,
        background: 'var(--input-bg, var(--card-bg))',
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        padding: '0 10px',
        opacity: disabled ? 0.6 : 1,
        ...style,
      }}
    >
      <input
        ref={dayRef}
        data-date-part="d"
        inputMode="numeric"
        maxLength={2}
        placeholder="dd"
        disabled={disabled}
        value={parts.d}
        onChange={(e) => onPartChange('d', e.target.value)}
        onKeyDown={(e) => onPartKeyDown('d', e)}
        onFocus={(e) => e.target.select()}
        aria-label="Day"
        style={segStyle('d')}
      />
      <span style={{ color: 'var(--text-3)', fontWeight: 700, userSelect: 'none' }}>-</span>
      <input
        ref={monthRef}
        data-date-part="m"
        inputMode="numeric"
        maxLength={2}
        placeholder="mm"
        disabled={disabled}
        value={parts.m}
        onChange={(e) => onPartChange('m', e.target.value)}
        onKeyDown={(e) => onPartKeyDown('m', e)}
        onFocus={(e) => e.target.select()}
        aria-label="Month"
        style={segStyle('m')}
      />
      <span style={{ color: 'var(--text-3)', fontWeight: 700, userSelect: 'none' }}>-</span>
      <input
        ref={yearRef}
        data-date-part="y"
        inputMode="numeric"
        maxLength={4}
        placeholder="yyyy"
        disabled={disabled}
        value={parts.y}
        onChange={(e) => onPartChange('y', e.target.value)}
        onKeyDown={(e) => onPartKeyDown('y', e)}
        onFocus={(e) => e.target.select()}
        aria-label="Year"
        style={segStyle('y')}
      />
    </div>
  )
}
