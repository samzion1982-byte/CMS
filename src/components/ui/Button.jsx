import React from 'react'

const variants = {
  primary:   'btn-primary',
  secondary: 'btn-secondary',
  danger:    'btn-danger',
  ghost:     'btn-ghost',
}

const styles = `
@keyframes btnGlow {
  0%   { box-shadow: 0 4px 0 rgba(0,0,0,0.14), inset 0 1px 0 rgba(255,255,255,0.22), 0 0 14px rgba(248,113,113,0.35); }
  25%  { box-shadow: 0 4px 0 rgba(0,0,0,0.14), inset 0 1px 0 rgba(255,255,255,0.22), 0 0 14px rgba(251,191,36,0.35);  }
  50%  { box-shadow: 0 4px 0 rgba(0,0,0,0.14), inset 0 1px 0 rgba(255,255,255,0.22), 0 0 14px rgba(74,222,128,0.35);  }
  75%  { box-shadow: 0 4px 0 rgba(0,0,0,0.14), inset 0 1px 0 rgba(255,255,255,0.22), 0 0 14px rgba(96,165,250,0.35);  }
  100% { box-shadow: 0 4px 0 rgba(0,0,0,0.14), inset 0 1px 0 rgba(255,255,255,0.22), 0 0 14px rgba(248,113,113,0.35); }
}

.btn {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 7px 16px; font-size: 13px; font-weight: 600;
  border-radius: 9px; border: 1.5px solid transparent;
  cursor: pointer;
  transition: transform 0.22s cubic-bezier(0.34,1.56,0.64,1),
              box-shadow 0.18s ease,
              background 0.15s ease;
  white-space: nowrap; font-family: inherit;
  position: relative; overflow: hidden;
  text-decoration: none; line-height: 1; letter-spacing: 0.01em;
}
.btn::before {
  content: '';
  position: absolute;
  top: 0; left: -120%;
  width: 55%; height: 100%;
  background: linear-gradient(90deg,
    transparent 0%,
    rgba(255,182,193,0.22) 20%,
    rgba(255,255,255,0.32) 40%,
    rgba(173,216,230,0.22) 60%,
    transparent 100%);
  transform: skewX(-15deg);
  transition: left 0.5s ease;
  pointer-events: none;
}
.btn:hover:not(:disabled)::before { left: 155%; }
.btn:disabled { opacity: 0.45; cursor: not-allowed; transform: none !important; animation: none !important; }
.btn:active:not(:disabled) {
  transform: translateY(1px) scale(0.97) !important;
  transition-duration: 0.07s !important;
}

.btn-primary {
  background:
    repeating-linear-gradient(135deg,
      rgba(255,255,255,0.07) 0px, rgba(255,255,255,0.07) 1px,
      transparent 1px, transparent 8px
    ),
    linear-gradient(160deg, #2563eb 0%, #1d4ed8 100%);
  background-size: 8px 8px, 100% 100%;
  color: #fff; border-color: #1d4ed8;
  box-shadow: 0 2px 0 rgba(0,0,0,0.14),
              0 4px 14px rgba(37,99,235,0.32),
              inset 0 1px 0 rgba(255,255,255,0.18);
}
.btn-primary:hover:not(:disabled) {
  transform: translateY(-2px);
  filter: brightness(1.06);
  animation: btnGlow 2.5s ease-in-out infinite;
}

.btn-secondary {
  background:
    repeating-linear-gradient(135deg,
      rgba(100,116,139,0.06) 0px, rgba(100,116,139,0.06) 1px,
      transparent 1px, transparent 8px
    ),
    linear-gradient(180deg, #ffffff 0%, #f8fafc 100%);
  background-size: 8px 8px, 100% 100%;
  color: #334155; border-color: #d1d5db;
  box-shadow: 0 2px 0 rgba(0,0,0,0.06),
              0 2px 6px rgba(0,0,0,0.04),
              inset 0 1px 0 rgba(255,255,255,0.8);
}
.btn-secondary:hover:not(:disabled) {
  transform: translateY(-2px);
  border-color: #94a3b8; color: #1e293b;
  box-shadow: 0 4px 0 rgba(0,0,0,0.07),
              0 10px 20px rgba(0,0,0,0.09),
              inset 0 1px 0 rgba(255,255,255,0.9);
  filter: brightness(1.04);
}

.btn-danger {
  background:
    repeating-linear-gradient(135deg,
      rgba(255,255,255,0.07) 0px, rgba(255,255,255,0.07) 1px,
      transparent 1px, transparent 8px
    ),
    linear-gradient(160deg, #dc2626 0%, #b91c1c 100%);
  background-size: 8px 8px, 100% 100%;
  color: #fff; border-color: #b91c1c;
  box-shadow: 0 2px 0 rgba(0,0,0,0.14),
              0 4px 12px rgba(220,38,38,0.28),
              inset 0 1px 0 rgba(255,255,255,0.16);
}
.btn-danger:hover:not(:disabled) {
  transform: translateY(-2px);
  filter: brightness(1.06);
  animation: btnGlow 2.5s ease-in-out infinite;
}

.btn-ghost { background: transparent; color: #64748b; border-color: transparent; }
.btn-ghost:hover:not(:disabled) {
  transform: translateY(-1px);
  background: #eff6ff; color: #2563eb;
  border-color: rgba(37,99,235,0.18);
  box-shadow: 0 4px 12px rgba(37,99,235,0.14);
}

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
