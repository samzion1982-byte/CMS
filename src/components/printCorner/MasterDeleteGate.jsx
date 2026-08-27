import { useEffect, useRef, useState } from 'react'
import { Eye, EyeOff, Lock } from 'lucide-react'
import MasterPasswordInput from '../MasterPasswordInput'
import { verifyMasterPassword } from '../../lib/masterPassword'

const INPUT = {
  height: 40, padding: '0 12px', border: '1.5px solid var(--card-border)',
  borderRadius: 8, fontSize: 13, background: 'var(--input-bg)', color: 'var(--text-1)',
  outline: 'none', boxSizing: 'border-box', width: '100%',
}

/** Master-password gate before deleting Print Corner templates / forms. */
export default function MasterDeleteGate({ open, title, message, onConfirm, onClose }) {
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [error, setError] = useState('')
  const [working, setWorking] = useState(false)
  const inputRef = useRef(null)

  useEffect(() => {
    if (!open) return
    setPassword('')
    setShowPw(false)
    setError('')
    setWorking(false)
    const t = setTimeout(() => inputRef.current?.focus(), 80)
    return () => clearTimeout(t)
  }, [open])

  if (!open) return null

  async function attempt() {
    setWorking(true)
    setError('')
    try {
      const ok = await verifyMasterPassword(password)
      if (!ok) {
        setError('Incorrect master password.')
        setPassword('')
        return
      }
      await onConfirm()
      onClose()
    } catch (e) {
      setError(e.message || 'Delete failed.')
    } finally {
      setWorking(false)
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed', inset: 0, zIndex: 10050,
        background: 'rgba(0,0,0,0.55)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
      }}
      onClick={() => { if (!working) onClose() }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--card-bg)', borderRadius: 16, width: '100%', maxWidth: 400,
          boxShadow: '0 24px 60px rgba(0,0,0,0.25)', overflow: 'hidden',
        }}
      >
        <div style={{ padding: '20px 22px 8px', textAlign: 'center' }}>
          <div style={{
            width: 48, height: 48, borderRadius: 14, background: '#fee2e2',
            display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px',
          }}>
            <Lock size={20} color="#b91c1c" />
          </div>
          <p style={{ margin: '0 0 6px', fontSize: 16, fontWeight: 800, color: 'var(--text-1)' }}>
            {title}
          </p>
          {message && (
            <p style={{ margin: 0, fontSize: 13, color: 'var(--text-3)', lineHeight: 1.45 }}>
              {message}
            </p>
          )}
        </div>
        <div style={{ padding: '14px 22px 22px' }}>
          <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', display: 'block', marginBottom: 7 }}>
            Master password
          </label>
          <div style={{ position: 'relative', marginBottom: 10 }}>
            <MasterPasswordInput
              ref={inputRef}
              showPlain={showPw}
              value={password}
              onChange={e => { setPassword(e.target.value); setError('') }}
              onKeyDown={e => e.key === 'Enter' && attempt()}
              placeholder="Enter master password…"
              disabled={working}
              style={{
                ...INPUT, paddingRight: 42,
                letterSpacing: showPw ? 'normal' : '0.12em',
                border: `1.5px solid ${error ? '#b91c1c' : 'var(--card-border)'}`,
              }}
            />
            <button type="button" onClick={() => setShowPw(v => !v)} style={{
              position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
              background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', display: 'flex',
            }}>
              {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>
          {error && (
            <p style={{ margin: '0 0 10px', fontSize: 12, color: '#dc2626', fontWeight: 600 }}>{error}</p>
          )}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" onClick={onClose} disabled={working}
              style={{
                padding: '8px 14px', borderRadius: 8, border: '1.5px solid var(--card-border)',
                background: 'transparent', color: 'var(--text-2)', fontSize: 13, fontWeight: 600, cursor: 'pointer',
              }}>
              Cancel
            </button>
            <button type="button" onClick={attempt} disabled={working || !password}
              style={{
                padding: '8px 14px', borderRadius: 8, border: 'none',
                background: '#b91c1c', color: '#fff', fontSize: 13, fontWeight: 700,
                cursor: working || !password ? 'not-allowed' : 'pointer',
                opacity: working || !password ? 0.6 : 1,
              }}>
              {working ? 'Deleting…' : 'Delete'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
