import React from 'react'

const variants = {
  primary:   'btn-primary',
  secondary: 'btn-secondary',
  danger:    'btn-danger',
  ghost:     'btn-ghost',
}

const styles = `
.btn {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 7px 16px; font-size: 13px; font-weight: 600;
  border-radius: 9px; border: 1.5px solid transparent;
  cursor: pointer; transition: all 0.15s;
  white-space: nowrap; font-family: inherit;
  position: relative; overflow: hidden;
  text-decoration: none; line-height: 1;
}
.btn:disabled { opacity: 0.45; cursor: not-allowed; transform: none !important; }
.btn:active:not(:disabled) { transform: scale(0.98); }

.btn-primary {
  background: linear-gradient(135deg, #2563eb, #1d4ed8);
  color: #fff; border-color: #1d4ed8;
  box-shadow: 0 2px 8px rgba(37,99,235,0.3), inset 0 1px 0 rgba(255,255,255,0.12);
}
.btn-primary:hover:not(:disabled) {
  background: linear-gradient(135deg, #1d4ed8, #1e40af);
  box-shadow: 0 4px 14px rgba(37,99,235,0.4);
  transform: translateY(-1px);
}

.btn-secondary {
  background: #fff; color: #334155;
  border-color: #d1d5db;
  box-shadow: 0 1px 3px rgba(0,0,0,0.06);
}
.btn-secondary:hover:not(:disabled) { background: #f8fafc; border-color: #94a3b8; }

.btn-danger {
  background: linear-gradient(135deg, #dc2626, #b91c1c);
  color: #fff; border-color: #b91c1c;
  box-shadow: 0 2px 8px rgba(220,38,38,0.3);
}
.btn-danger:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 4px 12px rgba(220,38,38,0.4); }

.btn-ghost { background: transparent; color: #64748b; border-color: transparent; }
.btn-ghost:hover:not(:disabled) { background: #f1f5f9; color: #334155; }

.btn-sm { padding: 5px 11px; font-size: 12px; }
.btn-icon { padding: 7px; }
`

let injected = false
function injectStyles() {
  if (injected) return
  const el = document.createElement('style')
  el.textContent = styles
  document.head.appendChild(el)
  injected = true
}

export function Button({ children, variant = 'primary', size, className = '', loading, as: Tag = 'button', ...props }) {
  injectStyles()
  const cls = ['btn', variants[variant] || 'btn-primary', size === 'sm' ? 'btn-sm' : '', size === 'icon' ? 'btn-icon' : '', className].filter(Boolean).join(' ')
  return (
    <Tag className={cls} disabled={loading || props.disabled} {...props}>
      {loading && <span className="spinner" style={{ width: 14, height: 14, borderWidth: 1.5 }} />}
      {children}
    </Tag>
  )
}
