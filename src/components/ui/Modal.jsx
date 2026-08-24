import { useEffect, useRef } from 'react'

const FOCUSABLE = 'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])'

/**
 * Accessible modal shell with focus trap, Escape, and optional backdrop dismiss.
 */
export default function Modal({
  open,
  onClose,
  title,
  children,
  width = 440,
  dismissOnBackdrop = true,
  zIndex = 10040,
}) {
  const panelRef = useRef(null)
  const prevFocus = useRef(null)

  useEffect(() => {
    if (!open) return
    prevFocus.current = document.activeElement
    const t = setTimeout(() => {
      const first = panelRef.current?.querySelector(FOCUSABLE)
      first?.focus?.()
    }, 20)
    function onKey(e) {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose?.()
        return
      }
      if (e.key !== 'Tab' || !panelRef.current) return
      const nodes = [...panelRef.current.querySelectorAll(FOCUSABLE)]
      if (!nodes.length) return
      const first = nodes[0]
      const last = nodes[nodes.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKey, true)
    return () => {
      clearTimeout(t)
      document.removeEventListener('keydown', onKey, true)
      if (prevFocus.current && typeof prevFocus.current.focus === 'function') {
        prevFocus.current.focus()
      }
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={typeof title === 'string' ? title : undefined}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && dismissOnBackdrop) onClose?.()
      }}
      style={{
        position: 'fixed', inset: 0, zIndex,
        background: 'var(--overlay, rgba(15,23,42,0.45))',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
      }}
    >
      <div
        ref={panelRef}
        className="card"
        style={{
          width: '100%', maxWidth: width, maxHeight: 'min(90vh, 900px)',
          overflow: 'auto', padding: 0,
          boxShadow: '0 16px 40px rgba(0,0,0,0.18)',
        }}
      >
        {title != null && title !== false && (
          <div style={{
            padding: '14px 18px', borderBottom: '1px solid var(--card-border)',
            fontSize: 15, fontWeight: 800, color: 'var(--text-1)',
          }}>
            {title}
          </div>
        )}
        <div style={{ padding: 18 }}>{children}</div>
      </div>
    </div>
  )
}
