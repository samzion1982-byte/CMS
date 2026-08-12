import React from 'react'

const inputStyle = {
  height: 38, width: '100%',
  padding: '0 11px',
  border: '1.5px solid #e2e8f0',
  borderRadius: 9,
  fontSize: 13, color: '#0f172a',
  background: '#fff',
  fontFamily: 'inherit',
  outline: 'none',
  transition: 'border-color 0.15s, box-shadow 0.15s',
}

export function Input({ className, style, ...props }) {
  const [focused, setFocused] = React.useState(false)
  return (
    <input
      className={className}
      style={{
        ...inputStyle,
        ...(focused ? { borderColor: '#2563eb', boxShadow: '0 0 0 3px rgba(37,99,235,0.1)' } : {}),
        ...(props.disabled ? { background: '#f8fafc', color: '#94a3b8', cursor: 'not-allowed' } : {}),
        ...style,
      }}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      {...props}
    />
  )
}

export function Select({ children, className, style, ...props }) {
  const [focused, setFocused] = React.useState(false)
  return (
    <select
      className={className}
      style={{
        ...inputStyle,
        appearance: 'none',
        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%2394a3b8' d='M6 8L1 3h10z'/%3E%3C/svg%3E")`,
        backgroundRepeat: 'no-repeat',
        backgroundPosition: 'right 10px center',
        paddingRight: 28,
        cursor: 'pointer',
        ...(focused ? { borderColor: '#2563eb', boxShadow: '0 0 0 3px rgba(37,99,235,0.1)' } : {}),
        ...style,
      }}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      {...props}
    >
      {children}
    </select>
  )
}

export function FieldGroup({ label, children, style }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5, ...style }}>
      {label && (
        <label style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#64748b' }}>
          {label}
        </label>
      )}
      {children}
    </div>
  )
}
