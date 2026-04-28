import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import { signIn } from '../lib/auth'
import { VENDOR, getChurch } from '../lib/supabase'
import { Eye, EyeOff, Loader2 } from 'lucide-react'

export default function LoginPage() {
  const { session } = useAuth()
  const navigate    = useNavigate()
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [showPw,   setShowPw]   = useState(false)
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState('')
  const [church,   setChurch]   = useState(null)

  useEffect(() => {
    if (session) navigate('/dashboard')
    getChurch().then(setChurch)
  }, [session])

  const handleSubmit = async e => {
    e.preventDefault()
    setLoading(true)
    setError('')
    
    const { error: err } = await signIn(email.trim(), password)
    
    if (err) {
      // Display the actual error message from signIn()
      setError(err.message)
      setLoading(false)
    } else {
      navigate('/dashboard')
    }
  }

  // Dynamic church info
  const churchCity = church?.city || ''
  const churchName = church?.church_name || 'CSI ST. PAUL\'S PASTORATE'
  const churchAddress = church?.address || ''
  const churchCityName = church?.city || 'TRICHY'
  
  // Combine address and city with comma
  const fullLocation = churchAddress && churchCityName 
    ? `${churchAddress.toUpperCase()}, ${churchCityName.toUpperCase()}`
    : churchAddress.toUpperCase() || churchCityName.toUpperCase() || 'WORAIYUR, TRICHY'

  return (
    <>
      <style>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        .login-page {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 24px;
          font-family: 'Inter', sans-serif;
          background: linear-gradient(135deg, #0a0e2a 0%, #0f1438 30%, #1a1f4a 60%, #0f1438 100%);
          position: relative;
          overflow: hidden;
        }

        /* Animated gradient background */
        .animated-bg {
          position: absolute;
          inset: 0;
          background: 
            radial-gradient(circle at 20% 30%, rgba(37,99,235,0.15) 0%, transparent 50%),
            radial-gradient(circle at 80% 70%, rgba(96,165,250,0.12) 0%, transparent 50%),
            radial-gradient(circle at 40% 50%, rgba(59,130,246,0.08) 0%, transparent 60%);
          animation: bgPulse 6s ease-in-out infinite;
        }
        @keyframes bgPulse {
          0%, 100% { opacity: 0.6; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.05); }
        }

        /* Aurora effect */
        .aurora {
          position: absolute;
          top: -50%;
          left: -50%;
          width: 200%;
          height: 200%;
          background: linear-gradient(45deg, 
            rgba(37,99,235,0.05) 0%, 
            rgba(96,165,250,0.08) 25%, 
            rgba(59,130,246,0.05) 50%, 
            rgba(37,99,235,0.08) 75%, 
            rgba(96,165,250,0.05) 100%);
          animation: auroraMove 15s ease-in-out infinite;
          pointer-events: none;
        }
        @keyframes auroraMove {
          0% { transform: translate(0%, 0%) rotate(0deg); }
          33% { transform: translate(5%, 3%) rotate(2deg); }
          66% { transform: translate(-3%, 5%) rotate(-2deg); }
          100% { transform: translate(0%, 0%) rotate(0deg); }
        }

        /* Snow falling - original */
        .snow {
          position: absolute;
          top: -10px;
          background: white;
          border-radius: 50%;
          pointer-events: none;
          opacity: 0.8;
          animation: snowFall linear infinite;
        }
        @keyframes snowFall {
          0% { transform: translateY(-10vh) rotate(0deg); opacity: 0; }
          10% { opacity: 0.8; }
          90% { opacity: 0.6; }
          100% { transform: translateY(110vh) rotate(360deg); opacity: 0; }
        }

        /* Stars */
        .star {
          position: absolute;
          background: white;
          border-radius: 50%;
          pointer-events: none;
          animation: twinkle 3s ease-in-out infinite;
        }
        @keyframes twinkle {
          0%, 100% { opacity: 0.2; transform: scale(1); }
          50% { opacity: 0.8; transform: scale(1.3); }
        }

        .card-wrap { 
          position: relative; 
          z-index: 10; 
          width: 100%; 
          max-width: 460px;
          animation: cardAppear 0.5s cubic-bezier(0.2, 0.9, 0.4, 1.1);
        }
        @keyframes cardAppear {
          from { opacity: 0; transform: translateY(20px) scale(0.96); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }

        /* Card border */
        .card-border {
          position: absolute; inset: -1px; border-radius: 24px;
          background: linear-gradient(135deg, #3b82f6, #60a5fa, #2563eb);
          background-size: 200% 200%;
          animation: borderAnim 3s ease infinite;
          filter: blur(3px);
          opacity: 0.5;
        }
        @keyframes borderAnim {
          0%, 100% { background-position: 0% 50%; opacity: 0.3; }
          50% { background-position: 100% 50%; opacity: 0.6; }
        }

        .card {
          position: relative;
          background: linear-gradient(180deg, rgba(15,20,56,0.94) 0%, rgba(10,14,42,0.96) 100%);
          backdrop-filter: blur(2px);
          border-radius: 22px;
          padding: 28px 30px 24px;
          overflow: hidden;
          transition: all 0.3s ease;
          border: 1px solid rgba(59,130,246,0.2);
          box-shadow: 0 8px 32px rgba(0,0,0,0.4);
        }
        .card:hover {
          transform: translateY(-2px);
          box-shadow: 0 12px 45px rgba(0,0,0,0.5);
          border-color: rgba(59,130,246,0.3);
        }

        /* Verse */
        .verse-top {
          text-align: center;
          margin-bottom: 20px;
          padding-bottom: 16px;
          border-bottom: 1px solid rgba(59,130,246,0.2);
        }
        .verse-text {
          font-size: 14px;
          font-style: italic;
          color: #94a3b8;
          line-height: 1.6;
          font-family: 'Georgia', serif;
          margin-bottom: 6px;
        }
        .verse-ref {
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: #60a5fa;
          text-align: right;
        }

        /* Church section */
        .church-section {
          display: flex;
          flex-direction: column;
          align-items: center;
          margin-bottom: 20px;
          width: 100%;
        }
        
        .church-header {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 12px;
          margin-bottom: 10px;
          width: 100%;
        }
        
        .church-icon {
          display: block;
          filter: drop-shadow(0 4px 12px rgba(59,130,246,0.4));
          transition: all 0.3s ease;
        }
        .church-icon:hover {
          filter: drop-shadow(0 6px 20px rgba(59,130,246,0.6));
          transform: scale(1.02);
        }
        
        .church-info {
          text-align: center;
          width: 100%;
        }
        
        .church-name {
          font-family: 'Sora', sans-serif;
          font-size: 20px;
          font-weight: 800;
          color: #ffffff;
          letter-spacing: 1.2px;
          line-height: 1.4;
          margin-bottom: 6px;
          text-transform: uppercase;
        }
        
        .church-location {
          font-size: 11px;
          font-weight: 600;
          color: #60a5fa;
          text-align: center;
          opacity: 0.9;
          letter-spacing: 0.4px;
          text-transform: uppercase;
        }

        /* Divider above CMS */
        .cms-divider {
          height: 1px;
          background: linear-gradient(90deg, transparent, rgba(59,130,246,0.4), #60a5fa, rgba(59,130,246,0.4), transparent);
          margin: 20px 0 20px 0;
        }

        /* CMS LABEL - Golden effect only */
        .cms-section {
          margin-bottom: 18px;
          text-align: center;
        }
        .church-cms-label {
          font-family: 'Sora', sans-serif;
          font-size: 16px;
          font-weight: 800;
          text-align: center;
          letter-spacing: 1.8px;
          text-transform: uppercase;
          background: linear-gradient(135deg, #ffd700, #daa520, #b8860b, #daa520, #ffd700);
          background-size: 300% auto;
          -webkit-background-clip: text;
          background-clip: text;
          -webkit-text-fill-color: transparent;
          animation: goldenShimmer 3s ease infinite;
          transition: all 0.3s ease;
          display: inline-block;
          padding: 0 6px;
        }
        .church-cms-label:hover {
          letter-spacing: 2.5px;
          background: linear-gradient(135deg, #ffed4e, #ffd700, #ffed4e);
          background-size: 300% auto;
          -webkit-background-clip: text;
          background-clip: text;
        }
        @keyframes goldenShimmer {
          0% { background-position: 0% 50%; opacity: 0.9; }
          50% { background-position: 100% 50%; opacity: 1; }
          100% { background-position: 0% 50%; opacity: 0.9; }
        }

        /* Form inputs */
        .f-group { margin-bottom: 16px; }
        .f-label {
          display: block;
          font-size: 11px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.15em;
          color: #60a5fa;
          margin-bottom: 8px;
        }
        .f-input {
          width: 100%;
          height: 48px;
          padding: 0 16px;
          background: rgba(10,14,42,0.8);
          border: 1px solid rgba(59,130,246,0.25);
          border-radius: 10px;
          font-size: 14px;
          color: #e2e8f0;
          font-family: inherit;
          outline: none;
          transition: all 0.2s ease;
        }
        .f-input::placeholder { color: #334155; }
        .f-input:focus {
          border-color: #3b82f6;
          background: rgba(10,14,42,1);
          box-shadow: 0 0 0 3px rgba(59,130,246,0.15);
        }

        .pw-wrap { position: relative; }
        .f-input-pw { padding-right: 46px; }
        .f-input-pw::-ms-reveal,
        .f-input-pw::-ms-clear { display: none; }
        input[type="password"]::-webkit-credentials-auto-fill-button,
        input[type="password"]::-webkit-contacts-auto-fill-button {
          display: none !important;
        }

        .eye-btn {
          position: absolute;
          right: 14px;
          top: 50%;
          transform: translateY(-50%);
          background: none;
          border: none;
          cursor: pointer;
          color: #475569;
          padding: 4px;
          display: flex;
          align-items: center;
          transition: all 0.2s ease;
          z-index: 2;
        }
        .eye-btn:hover { 
          color: #60a5fa; 
          transform: translateY(-50%) scale(1.05);
        }

        .f-error {
          background: rgba(239,68,68,0.1);
          border: 1px solid rgba(239,68,68,0.25);
          border-radius: 8px;
          padding: 10px 14px;
          font-size: 12px;
          color: #fca5a5;
          margin-bottom: 18px;
        }

        .btn-submit {
          width: 100%;
          height: 46px;
          background: linear-gradient(135deg, #2563eb, #1d4ed8);
          color: #fff;
          border: none;
          border-radius: 10px;
          font-size: 14px;
          font-weight: 700;
          font-family: 'Sora', sans-serif;
          cursor: pointer;
          letter-spacing: 1px;
          box-shadow: 0 4px 14px rgba(37,99,235,0.4);
          transition: all 0.2s ease;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          margin-bottom: 18px;
        }
        .btn-submit:hover:not(:disabled) {
          background: linear-gradient(135deg, #3b82f6, #2563eb);
          transform: translateY(-1px);
          box-shadow: 0 6px 20px rgba(37,99,235,0.5);
        }
        .btn-submit:active:not(:disabled) { transform: translateY(1px); }
        .btn-submit:disabled { opacity: 0.55; cursor: not-allowed; }

        .footer { 
          text-align: center; 
          font-size: 10px; 
          color: #475569;
        }
        .footer strong { color: #60a5fa; font-weight: 600; }

        @keyframes spin { to { transform: rotate(360deg); } }
        .spin { animation: spin 0.8s linear infinite; }

        @media (max-width: 550px) {
          .card { padding: 28px 24px 26px; }
          .church-name { font-size: 18px; letter-spacing: 1px; }
          .church-location { font-size: 10px; }
          .church-cms-label { font-size: 14px; letter-spacing: 1.5px; }
        }
      `}</style>

      <div className="login-page">
        <div className="animated-bg"/>
        <div className="aurora"/>
        
        {/* Snow falling - kept original */}
        {[...Array(60)].map((_, i) => (
          <div
            key={i}
            className="snow"
            style={{
              left: `${Math.random() * 100}%`,
              width: `${2 + Math.random() * 6}px`,
              height: `${2 + Math.random() * 6}px`,
              animationDelay: `${Math.random() * 15}s`,
              animationDuration: `${5 + Math.random() * 8}s`,
              opacity: 0.4 + Math.random() * 0.5,
              background: `rgba(255, 255, 255, ${0.4 + Math.random() * 0.6})`
            }}
          />
        ))}
        
        {/* Stars */}
        {[...Array(30)].map((_, i) => (
          <div
            key={`star-${i}`}
            className="star"
            style={{
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
              width: `${1 + Math.random() * 2}px`,
              height: `${1 + Math.random() * 2}px`,
              animationDelay: `${Math.random() * 5}s`,
              animationDuration: `${2 + Math.random() * 3}s`
            }}
          />
        ))}

        <div className="card-wrap">
          <div className="card-border"/>
          <div className="card">

            {/* Bible verse */}
            <div className="verse-top">
              <p className="verse-text">
                "Whatever you do, do everything for the glory of God."
              </p>
              <p className="verse-ref">— 1 CORINTHIANS 10:31</p>
            </div>

            {/* Church section */}
            <div className="church-section">
              <div className="church-header">
                <svg className="church-icon" width="55" height="52" viewBox="0 0 72 68" fill="none">
                  <rect x="33" y="0" width="6" height="16" rx="1.5" fill="#60a5fa"/>
                  <rect x="27" y="4" width="18" height="5.5" rx="1.5" fill="#60a5fa"/>
                  <polygon points="8,28 36,14 64,28" fill="#1e3a8a" stroke="#3b82f6" strokeWidth="1.5" strokeLinejoin="round"/>
                  <rect x="10" y="28" width="52" height="40" rx="1" fill="#0f1438" stroke="#3b82f6" strokeWidth="1.5"/>
                  <circle cx="36" cy="37" r="5.5" fill="none" stroke="#60a5fa" strokeWidth="1.5"/>
                  <circle cx="36" cy="37" r="2" fill="#3b82f6" opacity="0.5"/>
                  <path d="M29 68 L29 52 Q29 45 36 45 Q43 45 43 52 L43 68" fill="#0a0e2a" stroke="#3b82f6" strokeWidth="1.5"/>
                  <rect x="13" y="38" width="10" height="10" rx="2" fill="none" stroke="#3b82f6" strokeWidth="1.2"/>
                  <line x1="18" y1="38" x2="18" y2="48" stroke="#60a5fa" strokeWidth="0.8" opacity="0.6"/>
                  <line x1="13" y1="43" x2="23" y2="43" stroke="#60a5fa" strokeWidth="0.8" opacity="0.6"/>
                  <rect x="49" y="38" width="10" height="10" rx="2" fill="none" stroke="#3b82f6" strokeWidth="1.2"/>
                  <line x1="54" y1="38" x2="54" y2="48" stroke="#60a5fa" strokeWidth="0.8" opacity="0.6"/>
                  <line x1="49" y1="43" x2="59" y2="43" stroke="#60a5fa" strokeWidth="0.8" opacity="0.6"/>
                  <line x1="4" y1="67" x2="68" y2="67" stroke="#3b82f6" strokeWidth="1.5" strokeLinecap="round" opacity="0.4"/>
                </svg>

                <div className="church-info">
                  <p className="church-name">{churchName.toUpperCase()}</p>
                  <p className="church-location">{fullLocation}</p>
                </div>
              </div>
            </div>

            {/* Divider above CMS */}
            <div className="cms-divider"></div>

            {/* CMS LABEL - ONLY THIS HAS GOLDEN EFFECT */}
            <div className="cms-section">
              <p className="church-cms-label">CHURCH MANAGEMENT SYSTEM</p>
            </div>

            {/* Login Form */}
            <form onSubmit={handleSubmit}>
              <div className="f-group">
                <label className="f-label">EMAIL</label>
                <input
                  className="f-input"
                  type="email"
                  placeholder="you@church.org"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  autoFocus
                  autoComplete="username"
                />
              </div>

              <div className="f-group">
                <label className="f-label">PASSWORD</label>
                <div className="pw-wrap">
                  <input
                    className="f-input f-input-pw"
                    type={showPw ? 'text' : 'password'}
                    placeholder="Enter your password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    required
                    autoComplete="current-password"
                  />
                  {password.length > 0 && (
                    <button
                      type="button"
                      className="eye-btn"
                      onMouseDown={e => e.preventDefault()}
                      onClick={() => setShowPw(v => !v)}
                      tabIndex={-1}
                    >
                      {showPw ? <EyeOff size={16}/> : <Eye size={16}/>}
                    </button>
                  )}
                </div>
              </div>

              {error && <div className="f-error">⚠ {error}</div>}

              <button
                className="btn-submit"
                type="submit"
                disabled={loading}
              >
                {loading
                  ? <><Loader2 size={16} className="spin"/> SIGNING IN...</>
                  : 'SIGN IN'
                }
              </button>
            </form>

            <div className="footer">
              Powered by <strong>{VENDOR.name}</strong>, {VENDOR.city}
            </div>

          </div>
        </div>
      </div>
    </>
  )
}