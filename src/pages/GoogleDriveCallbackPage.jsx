import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { useAuth } from '../lib/AuthContext'
import { finishGoogleOAuthConnect } from '../lib/cmsFullBackup'

export default function GoogleDriveCallbackPage() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [message, setMessage] = useState('Connecting Google Drive…')

  useEffect(() => {
    let cancelled = false
    async function run() {
      if (profile && profile.role !== 'super_admin') {
        setMessage('Super Admin only')
        return
      }
      const err = params.get('error')
      if (err) {
        setMessage(`Google login failed: ${err}`)
        return
      }
      const code = params.get('code')
      const state = params.get('state')
      if (!code) {
        setMessage('Missing authorization code from Google')
        return
      }
      try {
        const r = await finishGoogleOAuthConnect({ code, state })
        if (cancelled) return
        setMessage(`Connected as ${r.email || 'Google account'}. Redirecting…`)
        setTimeout(() => navigate('/backup?google=connected', { replace: true }), 800)
      } catch (e) {
        if (cancelled) return
        setMessage(e.message || 'Failed to connect Google Drive')
      }
    }
    run()
    return () => { cancelled = true }
  }, [params, profile, navigate])

  return (
    <div style={{
      minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: 'var(--font-ui)', padding: 24, color: 'var(--text-1)',
    }}>
      <div style={{ textAlign: 'center', maxWidth: 420 }}>
        <Loader2 size={22} className="spin" style={{ marginBottom: 12 }} />
        <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5 }}>{message}</p>
        {!message.includes('Redirecting') && (
          <button
            type="button"
            onClick={() => navigate('/backup')}
            style={{
              marginTop: 16, padding: '8px 14px', borderRadius: 8, cursor: 'pointer',
              border: '1px solid var(--card-border)', background: 'var(--card-bg)', color: 'var(--text-1)',
            }}
          >
            Back to Backup
          </button>
        )}
      </div>
    </div>
  )
}
