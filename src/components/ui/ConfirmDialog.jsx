export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  danger = false,
  busy = false,
  onConfirm,
  onCancel,
}) {
  if (!open) return null
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="cms-confirm-title"
      onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onCancel?.() }}
      style={{
        position: 'fixed', inset: 0, zIndex: 10040,
        background: 'var(--overlay, rgba(15,23,42,0.45))',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
      }}
    >
      <div
        className="card"
        style={{ width: '100%', maxWidth: 400, padding: 22, boxShadow: '0 16px 40px rgba(0,0,0,0.18)' }}
      >
        <h3 id="cms-confirm-title" style={{ margin: '0 0 8px', fontSize: 16, fontWeight: 800, color: 'var(--text-1)' }}>
          {title}
        </h3>
        {message && (
          <p style={{ margin: '0 0 18px', fontSize: 13, color: 'var(--text-2)', lineHeight: 1.55 }}>
            {message}
          </p>
        )}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" className="btn btn-secondary btn-sm" onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </button>
          <button
            type="button"
            className={danger ? 'btn btn-danger btn-sm' : 'btn btn-primary btn-sm'}
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? 'Please wait…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
