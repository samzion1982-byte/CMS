import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import { signIn, displayFirstName } from '../lib/auth'
import { VENDOR, getChurch } from '../lib/supabase'
import { getOrCreateDeviceId, checkDeviceRegistered, checkDeviceRegisteredByUser, saveDevice, insertLoginLog } from '../lib/loginLogs'
import { Eye, EyeOff, Loader2, CheckCircle2 } from 'lucide-react'

/** Prefer CSS disc mask so browsers do not treat the field as a saveable password. */
const supportsDiscMask = typeof CSS !== 'undefined'
  && typeof CSS.supports === 'function'
  && CSS.supports('-webkit-text-security', 'disc')

const AUTH_STEPS = [
  { text: 'Verifying credentials', tone: 'wait' },
  { text: 'Authenticating session', tone: 'wait' },
  { text: 'Access granted', tone: 'ok' },
]

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

export default function LoginPage() {
  const { session, profile } = useAuth()
  const navigate    = useNavigate()
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [showPw,   setShowPw]   = useState(false)
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState('')
  const [inputErr, setInputErr] = useState(false)
  const [status,   setStatus]   = useState('')   // '' | 'authenticating' | 'welcome'
  const [authStep, setAuthStep] = useState(0)
  const [welcomeFirst, setWelcomeFirst] = useState('')
  const [church,   setChurch]   = useState(null)

  const orbParticles = useMemo(() => {
    const palette = [
      { fill: 'rgba(59,130,246,0.85)',  glow: '0 0 14px 5px rgba(59,130,246,0.45)' },
      { fill: 'rgba(96,165,250,0.75)',  glow: '0 0 12px 4px rgba(96,165,250,0.40)' },
      { fill: 'rgba(34,211,238,0.75)',  glow: '0 0 16px 5px rgba(34,211,238,0.40)' },
      { fill: 'rgba(139,92,246,0.70)',  glow: '0 0 14px 5px rgba(139,92,246,0.38)' },
      { fill: 'rgba(251,191,36,0.70)',  glow: '0 0 14px 4px rgba(251,191,36,0.35)' },
      { fill: 'rgba(224,242,254,0.65)', glow: '0 0 10px 3px rgba(255,255,255,0.30)' },
    ]
    return [...Array(58)].map((_, i) => {
      const c    = palette[Math.floor(Math.random() * palette.length)]
      const size = 3 + Math.random() * 11
      return {
        id: i,
        left:              `${Math.random() * 100}%`,
        width:             `${size}px`,
        height:            `${size}px`,
        animationDelay:    `${Math.random() * 18}s`,
        animationDuration: `${12 + Math.random() * 14}s`,
        background:        c.fill,
        boxShadow:         c.glow,
      }
    })
  }, [])

  const starParticles = useMemo(() =>
    [...Array(48)].map((_, i) => ({
      id: i,
      left: `${Math.random() * 100}%`,
      top:  `${Math.random() * 100}%`,
      width: `${1 + Math.random() * 2.4}px`,
      height: `${1 + Math.random() * 2.4}px`,
      animationDelay: `${Math.random() * 5}s`,
      animationDuration: `${2 + Math.random() * 3}s`
    })), []
  )

  const goldDust = useMemo(() =>
    [...Array(22)].map((_, i) => ({
      id: i,
      left: `${Math.random() * 100}%`,
      top: `${Math.random() * 100}%`,
      size: 2 + Math.random() * 4,
      delay: `${Math.random() * 8}s`,
      duration: `${6 + Math.random() * 8}s`,
    })), []
  )

  useEffect(() => {
    if (session) navigate('/dashboard')  // already logged in — redirect immediately
    getChurch().then(setChurch)
  }, []) // eslint-disable-line

  const handleSubmit = async e => {
    e.preventDefault()
    setLoading(true)
    setAuthStep(0)
    setStatus('authenticating')
    setError('')
    sessionStorage.setItem('login_welcome', '1')  // hold redirect so welcome overlay is visible
    // Clear any leftover setup flag from a prior attempt
    sessionStorage.removeItem('device_setup_pending')

    const toSession = setTimeout(() => setAuthStep(1), 1100)

    try {
      const devId = getOrCreateDeviceId()

      // Sign in first — device/login tables require an authenticated session
      // (service-role key is no longer shipped in the browser).
      const { error: err, data: authData, profile } = await signIn(email.trim(), password)
      clearTimeout(toSession)

      if (err) {
        sessionStorage.removeItem('login_welcome')
        setError(err.message)
        setInputErr(true)
        setStatus('')
        setAuthStep(0)
        setLoading(false)
      } else {
        const uid = authData?.user?.id

        // Resolve device meta before writing the login row (atomic insert).
        // Popup is ONLY for a truly new user/device — never after a cache flush
        // when we already know this user from a prior registration.
        let deviceMeta = null
        const knownByDevice = await checkDeviceRegistered(devId)

        if (knownByDevice) {
          deviceMeta = {
            deviceId: devId,
            userName: knownByDevice.user_name,
            location: knownByDevice.location,
            org:      knownByDevice.org_name,
          }
        } else {
          const knownByUser = await checkDeviceRegisteredByUser(uid)
          if (knownByUser) {
            // Cache/cookie flush: new device ID, known user — silent re-bind, no popup
            try {
              await saveDevice({
                deviceId:   devId,
                userId:     uid,
                orgName:    knownByUser.org_name || '',
                userName:   knownByUser.user_name || '',
                location:   knownByUser.location || '',
                avatarName: knownByUser.avatar_name || null,
              })
            } catch (rebindErr) {
              console.warn('[login] rebind device failed:', rebindErr)
            }
            deviceMeta = {
              deviceId: devId,
              userName: knownByUser.user_name,
              location: knownByUser.location,
              org:      knownByUser.org_name,
            }
          } else {
            // Truly new — ask once via the setup popup; login row is written blank for now
            sessionStorage.setItem('device_setup_pending', JSON.stringify({ deviceId: devId, userId: uid }))
          }
        }

        // Await so the row lands with device fields already filled (when known)
        await insertLoginLog({
          userId:    uid,
          email:     profile?.email || email.trim(),
          fullName:  profile?.full_name,
          role:      profile?.role,
          userAgent: navigator.userAgent,
          ...(deviceMeta || {}),
        })

        setAuthStep(1)
        await sleep(900)
        setAuthStep(2)
        await sleep(1200)
        setWelcomeFirst(displayFirstName(profile, email.trim()))
        setStatus('welcome')
      }
    } catch (ex) {
      clearTimeout(toSession)
      sessionStorage.removeItem('device_setup_pending')
      sessionStorage.removeItem('login_welcome')
      setError('Login failed. Please try again.')
      setInputErr(true)
      setStatus('')
      setAuthStep(0)
      setLoading(false)
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
          background: #010409;
          position: relative;
          overflow: hidden;
        }

        /* Deep animated colour blobs */
        .animated-bg {
          position: absolute;
          inset: 0;
          background:
            radial-gradient(ellipse 60% 50% at 15% 20%, rgba(37,99,235,0.32) 0%, transparent 70%),
            radial-gradient(ellipse 50% 40% at 85% 80%, rgba(139,92,246,0.26) 0%, transparent 70%),
            radial-gradient(ellipse 40% 35% at 80% 15%, rgba(251,191,36,0.12) 0%, transparent 70%),
            radial-gradient(ellipse 70% 60% at 50% 50%, rgba(10,14,42,0.92)   0%, transparent 100%);
          animation: bgShift 10s ease-in-out infinite alternate;
        }
        @keyframes bgShift {
          0%   { opacity: 0.7; filter: hue-rotate(0deg);   transform: scale(1); }
          50%  { opacity: 1;   filter: hue-rotate(15deg);  transform: scale(1.08); }
          100% { opacity: 0.8; filter: hue-rotate(-10deg); transform: scale(1); }
        }

        /* Secondary blob that drifts independently */
        .bg-blob2 {
          position: absolute;
          inset: 0;
          background:
            radial-gradient(ellipse 45% 35% at 75% 25%, rgba(34,211,238,0.10) 0%, transparent 70%),
            radial-gradient(ellipse 55% 45% at 25% 75%, rgba(59,130,246,0.12)  0%, transparent 70%);
          animation: blobDrift 14s ease-in-out infinite alternate;
          pointer-events: none;
        }
        @keyframes blobDrift {
          0%   { transform: translate(0, 0)   scale(1); }
          50%  { transform: translate(4%, 3%) scale(1.06); }
          100% { transform: translate(-3%, 2%) scale(0.97); }
        }

        /* Sweeping light rays */
        .ray {
          position: absolute;
          top: -20%;
          width: 1.5px;
          height: 140%;
          background: linear-gradient(to bottom, transparent 0%, rgba(96,165,250,0.22) 40%, rgba(251,191,36,0.12) 60%, transparent 100%);
          transform-origin: top center;
          pointer-events: none;
        }
        .ray-1 { left: 25%; transform: rotate(-18deg); animation: raySweep 18s ease-in-out infinite; }
        .ray-2 { left: 55%; transform: rotate(12deg);  animation: raySweep 24s ease-in-out infinite reverse; opacity: 0.75; }
        .ray-3 { left: 75%; transform: rotate(-8deg);  animation: raySweep 20s ease-in-out infinite 4s; opacity: 0.55; }
        .ray-4 { left: 40%; width: 2px; transform: rotate(6deg); animation: raySweep 16s ease-in-out infinite 2s; opacity: 0.5; }
        @keyframes raySweep {
          0%, 100% { opacity: 0; transform: rotate(var(--r, -18deg)) translateX(0px); }
          20%      { opacity: 1; }
          50%      { transform: rotate(var(--r, -18deg)) translateX(30px); opacity: 0.9; }
          80%      { opacity: 0.7; }
        }

        /* Aurora effect — enhanced */
        .aurora {
          position: absolute;
          top: -50%;
          left: -50%;
          width: 200%;
          height: 200%;
          background: conic-gradient(from 180deg at 50% 50%,
            rgba(37,99,235,0.06)  0deg,
            rgba(139,92,246,0.10) 90deg,
            rgba(34,211,238,0.07) 180deg,
            rgba(37,99,235,0.06)  270deg,
            rgba(139,92,246,0.08) 360deg);
          animation: auroraMove 20s ease-in-out infinite;
          pointer-events: none;
        }
        @keyframes auroraMove {
          0%   { transform: translate(0%,   0%)  rotate(0deg);  opacity: 0.5; }
          33%  { transform: translate(4%,   3%)  rotate(3deg);  opacity: 0.9; }
          66%  { transform: translate(-3%,  5%)  rotate(-2deg); opacity: 0.6; }
          100% { transform: translate(0%,   0%)  rotate(0deg);  opacity: 0.5; }
        }

        /* Rising glowing orbs */
        .orb {
          position: absolute;
          top: 0;
          border-radius: 50%;
          pointer-events: none;
          animation: riseOrb linear infinite;
        }
        @keyframes riseOrb {
          0%   { transform: translateY(115vh) translateX(0px);   opacity: 0; }
          7%   { opacity: 1; }
          28%  { transform: translateY(82vh)  translateX(20px); }
          52%  { transform: translateY(50vh)  translateX(-16px); }
          76%  { transform: translateY(20vh)  translateX(14px); }
          93%  { opacity: 0.7; }
          100% { transform: translateY(-8vh)  translateX(0px);  opacity: 0; }
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

        .bg-grid {
          position: absolute;
          inset: -30% -10% -10%;
          background-image:
            linear-gradient(rgba(96,165,250,0.09) 1px, transparent 1px),
            linear-gradient(90deg, rgba(96,165,250,0.09) 1px, transparent 1px);
          background-size: 56px 56px;
          transform: perspective(700px) rotateX(58deg) translateY(0);
          transform-origin: center top;
          animation: gridDrift 22s linear infinite;
          mask-image: radial-gradient(ellipse 75% 70% at 50% 40%, #000 10%, transparent 78%);
          -webkit-mask-image: radial-gradient(ellipse 75% 70% at 50% 40%, #000 10%, transparent 78%);
          pointer-events: none;
        }
        @keyframes gridDrift {
          0%   { background-position: 0 0; opacity: 0.35; }
          50%  { opacity: 0.7; }
          100% { background-position: 0 56px; opacity: 0.35; }
        }

        .bg-halo {
          position: absolute;
          width: min(90vw, 780px);
          height: min(90vw, 780px);
          left: 50%;
          top: 48%;
          transform: translate(-50%, -50%);
          background: conic-gradient(from 0deg,
            transparent 0 38%,
            rgba(96,165,250,0.16),
            rgba(251,191,36,0.14),
            rgba(167,139,250,0.16),
            transparent 72% 100%);
          border-radius: 50%;
          animation: haloSpin 26s linear infinite;
          filter: blur(22px);
          pointer-events: none;
        }
        @keyframes haloSpin {
          from { transform: translate(-50%, -50%) rotate(0deg); }
          to   { transform: translate(-50%, -50%) rotate(360deg); }
        }

        .bg-ring {
          position: absolute;
          left: 50%;
          top: 48%;
          border-radius: 50%;
          border: 1px solid rgba(96,165,250,0.16);
          box-shadow: 0 0 24px rgba(96,165,250,0.08), inset 0 0 18px rgba(251,191,36,0.05);
          pointer-events: none;
          transform: translate(-50%, -50%);
          animation: ringPulse 9s ease-out infinite;
        }
        .bg-ring-a { width: 280px; height: 280px; animation-delay: 0s; }
        .bg-ring-b { width: 420px; height: 420px; animation-delay: 2.2s; border-color: rgba(251,191,36,0.14); }
        .bg-ring-c { width: 580px; height: 580px; animation-delay: 4.4s; }
        @keyframes ringPulse {
          0%   { opacity: 0; transform: translate(-50%, -50%) scale(0.86); }
          25%  { opacity: 0.85; }
          100% { opacity: 0; transform: translate(-50%, -50%) scale(1.18); }
        }

        .gold-dust {
          position: absolute;
          border-radius: 50%;
          background: rgba(253, 224, 71, 0.85);
          box-shadow: 0 0 10px 3px rgba(251,191,36,0.35);
          pointer-events: none;
          animation: dustDrift ease-in-out infinite;
        }
        @keyframes dustDrift {
          0%, 100% { transform: translate(0, 0) scale(0.7); opacity: 0.15; }
          40%      { transform: translate(12px, -18px) scale(1.15); opacity: 0.9; }
          70%      { transform: translate(-10px, 8px) scale(0.9); opacity: 0.45; }
        }

        .bg-vignette {
          position: absolute;
          inset: 0;
          pointer-events: none;
          background:
            radial-gradient(ellipse 90% 80% at 50% 50%, transparent 40%, rgba(1,4,9,0.55) 100%),
            linear-gradient(180deg, rgba(251,191,36,0.06) 0%, transparent 18%, transparent 82%, rgba(37,99,235,0.12) 100%);
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
          background: linear-gradient(180deg, rgba(8,12,36,0.96) 0%, rgba(3,5,18,0.98) 100%);
          backdrop-filter: blur(2px);
          border-radius: 22px;
          padding: 20px 30px 18px;
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
          margin-bottom: 14px;
          padding-bottom: 12px;
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
          margin-bottom: 14px;
          width: 100%;
        }

        .church-header {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 8px;
          margin-bottom: 6px;
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
          margin: 12px 0;
        }

        /* CMS LABEL - Golden effect only */
        .cms-section {
          margin-bottom: 14px;
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
        .f-group { margin-bottom: 12px; }
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
          background: rgba(4,6,20,0.85);
          border: 1px solid rgba(59,130,246,0.22);
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
          background: rgba(4,6,20,1);
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

        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          15%       { transform: translateX(-7px); }
          30%       { transform: translateX(7px); }
          45%       { transform: translateX(-5px); }
          60%       { transform: translateX(5px); }
          75%       { transform: translateX(-3px); }
          90%       { transform: translateX(3px); }
        }
        .form-shake { animation: shake 0.5s ease; }

        .f-input-error {
          border-color: rgba(239,68,68,0.6) !important;
          box-shadow: 0 0 0 3px rgba(239,68,68,0.12) !important;
        }

        @keyframes btnPulse {
          0%, 100% { box-shadow: 0 4px 14px rgba(37,99,235,0.4); }
          50%       { box-shadow: 0 4px 22px rgba(59,130,246,0.7); }
        }
        .btn-submit:not(:disabled) { animation: btnPulse 2.5s ease-in-out infinite; }
        .btn-submit:hover:not(:disabled),
        .btn-submit:active:not(:disabled) { animation: none; }

        .forgot-link {
          display: block;
          text-align: right;
          font-size: 11px;
          color: #60a5fa;
          text-decoration: none;
          margin-top: -8px;
          margin-bottom: 16px;
          opacity: 0.75;
          transition: opacity 0.2s;
          cursor: pointer;
          background: none;
          border: none;
          font-family: inherit;
          padding: 0;
        }
        .forgot-link:hover { opacity: 1; text-decoration: underline; }

        /* Status overlay */
        .status-overlay {
          position: absolute;
          inset: 0;
          border-radius: 22px;
          background: rgba(3,5,18,0.95);
          backdrop-filter: blur(6px);
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 20px;
          z-index: 30;
          animation: fadeIn 0.25s ease;
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to   { opacity: 1; }
        }

        .status-ring {
          width: 56px; height: 56px;
          border: 3px solid rgba(59,130,246,0.15);
          border-top-color: #3b82f6;
          border-radius: 50%;
          animation: spin 0.85s linear infinite;
        }

        /* Shield + lock auth animation */
        .auth-verify {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          width: 100%;
          max-width: 280px;
          animation: authShieldIn 0.45s ease both;
        }
        .auth-ecg {
          flex: 1;
          height: 44px;
          overflow: visible;
        }
        .auth-ecg path {
          fill: none;
          stroke: #38bdf8;
          stroke-width: 1.6;
          stroke-linecap: round;
          stroke-linejoin: round;
          filter: drop-shadow(0 0 4px rgba(56, 189, 248, 0.55));
          stroke-dasharray: 120;
          animation: authEcgDash 1.35s linear infinite;
        }
        .auth-ecg-r path {
          animation-direction: reverse;
          animation-duration: 1.5s;
          opacity: 0.85;
        }
        .auth-shield {
          width: 72px;
          height: 80px;
          flex-shrink: 0;
          display: grid;
          place-items: center;
          position: relative;
        }
        .auth-shield svg {
          overflow: visible;
        }
        .auth-shield-glow {
          fill: rgba(56, 189, 248, 0.12);
          transform-origin: 40px 42px;
          transform-box: fill-box;
          animation: authGlowPulse 2s ease-in-out infinite;
        }
        .auth-shield-body {
          fill: rgba(15, 23, 42, 0.72);
          stroke: #38bdf8;
          filter: drop-shadow(0 0 8px rgba(56, 189, 248, 0.35));
          stroke-dasharray: 220;
          stroke-dashoffset: 220;
          animation: authDrawShield 1.1s ease forwards;
        }
        .auth-binary {
          font-family: ui-monospace, 'Cascadia Code', Consolas, monospace;
          font-size: 5.2px;
          font-weight: 600;
          fill: #67e8f9;
          opacity: 0.55;
          letter-spacing: 0.4px;
        }
        .auth-binary-scroll {
          animation: authBinaryScroll 2.4s linear infinite;
        }
        .auth-binary-scroll-b {
          animation: authBinaryScroll 3.1s linear infinite reverse;
          opacity: 0.35;
        }
        .auth-lens {
          animation: authLensScan 2.2s ease-in-out infinite;
          transform-origin: 40px 40px;
        }
        .auth-lens-glass {
          fill: rgba(56, 189, 248, 0.14);
          stroke: #fbbf24;
          stroke-width: 1.5;
          filter: drop-shadow(0 0 4px rgba(251, 191, 36, 0.45));
        }
        .auth-lens-handle {
          stroke: #fbbf24;
          stroke-width: 1.8;
          stroke-linecap: round;
        }
        /* Closed lock — verified by scan + check (no shackle swing) */
        .auth-lock {
          opacity: 0;
          animation: authLockFade 0.4s ease 0.5s forwards;
        }
        .auth-lock-body {
          fill: rgba(15, 23, 42, 0.9);
          stroke: #fbbf24;
          stroke-width: 2;
        }
        .auth-lock-shackle {
          fill: none;
          stroke: #fbbf24;
          stroke-width: 2;
          stroke-linecap: round;
        }
        .auth-lock-keyhole {
          fill: #fde68a;
          animation: authKeyPulse 1.4s ease-in-out 0.8s infinite;
        }
        .auth-scan-beam {
          fill: url(#authScanGrad);
          opacity: 0;
          animation: authScanSweep 1.6s ease-in-out 1.1s 1 forwards;
        }
        .auth-lock-ring {
          fill: none;
          stroke: #38bdf8;
          stroke-width: 1.6;
          stroke-linecap: round;
          stroke-dasharray: 72;
          stroke-dashoffset: 72;
          opacity: 0;
          animation: authRingDraw 1.2s ease 1.2s forwards;
        }
        .auth-lock-check {
          fill: none;
          stroke: #4ade80;
          stroke-width: 2.2;
          stroke-linecap: round;
          stroke-linejoin: round;
          stroke-dasharray: 24;
          stroke-dashoffset: 24;
          opacity: 0;
          filter: drop-shadow(0 0 4px rgba(74, 222, 128, 0.7));
          animation: authCheckDraw 0.45s ease 2.15s forwards;
        }
        .auth-lock-verified .auth-lock-body {
          animation: authLockVerified 0.5s ease 2.15s forwards;
        }
        .auth-lock-verified .auth-lock-keyhole {
          animation: authKeyholeHide 0.25s ease 2.1s forwards;
        }
        @keyframes authShieldIn {
          from { opacity: 0; transform: translateY(8px) scale(0.92); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes authDrawShield {
          to { stroke-dashoffset: 0; }
        }
        @keyframes authGlowPulse {
          0%, 100% { opacity: 0.55; transform: scale(1); }
          50%      { opacity: 1; transform: scale(1.06); }
        }
        @keyframes authLockFade {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes authKeyPulse {
          0%, 100% { opacity: 0.7; }
          50%      { opacity: 1; }
        }
        @keyframes authScanSweep {
          0%   { opacity: 0; transform: translateY(-28px); }
          15%  { opacity: 0.85; }
          85%  { opacity: 0.75; }
          100% { opacity: 0; transform: translateY(34px); }
        }
        @keyframes authRingDraw {
          0%   { opacity: 0; stroke-dashoffset: 72; }
          10%  { opacity: 1; }
          100% { opacity: 1; stroke-dashoffset: 0; }
        }
        @keyframes authCheckDraw {
          0%   { opacity: 0; stroke-dashoffset: 24; }
          20%  { opacity: 1; }
          100% { opacity: 1; stroke-dashoffset: 0; }
        }
        @keyframes authKeyholeHide {
          to { opacity: 0; }
        }
        @keyframes authLockVerified {
          to {
            stroke: #4ade80;
            fill: rgba(6, 78, 59, 0.55);
            filter: drop-shadow(0 0 6px rgba(74, 222, 128, 0.45));
          }
        }
        @keyframes authEcgDash {
          0%   { stroke-dashoffset: 120; }
          100% { stroke-dashoffset: 0; }
        }
        @keyframes authBinaryScroll {
          0%   { transform: translateY(0); }
          100% { transform: translateY(-18px); }
        }
        @keyframes authLensScan {
          0%   { transform: translate(0px, 2px); }
          25%  { transform: translate(8px, -6px); }
          50%  { transform: translate(-6px, 4px); }
          75%  { transform: translate(4px, -2px); }
          100% { transform: translate(0px, 2px); }
        }

        .status-check {
          color: #22c55e;
          filter: drop-shadow(0 0 10px rgba(34,197,94,0.5));
          animation: checkPop 0.4s cubic-bezier(0.2, 0.9, 0.4, 1.4) both;
        }
        @keyframes checkPop {
          from { opacity: 0; transform: scale(0.4); }
          to   { opacity: 1; transform: scale(1); }
        }

        .praise-label {
          font-family: 'Sora', sans-serif;
          font-size: 12px;
          font-weight: 800;
          letter-spacing: 2.6px;
          text-transform: uppercase;
          margin-bottom: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          position: relative;
        }
        .praise-star {
          color: #fbbf24;
          -webkit-text-fill-color: #fbbf24;
          display: inline-block;
          animation: praiseStar 2.4s ease-in-out infinite;
          filter: drop-shadow(0 0 8px rgba(251,191,36,0.75));
        }
        .praise-star-r { animation-delay: 0.4s; }
        @keyframes praiseStar {
          0%, 100% { transform: rotate(0deg) scale(1); opacity: 0.75; }
          50%      { transform: rotate(180deg) scale(1.35); opacity: 1; }
        }
        .praise-word {
          display: inline-flex;
        }
        .praise-letter {
          display: inline-block;
          background: linear-gradient(135deg, #fff6c2, #ffd700, #daa520, #ffd700, #fff6c2);
          background-size: 220% auto;
          -webkit-background-clip: text;
          background-clip: text;
          -webkit-text-fill-color: transparent;
          animation: goldenShimmer 2.2s ease infinite, praiseBounce 2.6s ease-in-out infinite;
          animation-delay: 0s, calc(var(--i) * 0.07s);
        }
        @keyframes praiseBounce {
          0%, 100% { transform: translateY(0); }
          40%      { transform: translateY(-4px); }
          55%      { transform: translateY(1px); }
        }

        .status-msg {
          font-family: 'Sora', sans-serif;
          font-size: 17px;
          font-weight: 700;
          letter-spacing: 0.8px;
          color: #e2e8f0;
          min-height: 1.35em;
        }
        .status-msg.auth-line { animation: authLineIn 0.38s ease both; }
        .status-msg.auth-ok { color: #86efac; }
        @keyframes authLineIn {
          from { opacity: 0; transform: translateY(8px); filter: blur(4px); }
          to   { opacity: 1; transform: translateY(0); filter: blur(0); }
        }
        .status-msg.welcome { color: #86efac; animation: welcomeFade 0.5s ease both; }
        @keyframes welcomeFade {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }

        .welcome-name {
          font-family: 'Sora', sans-serif;
          font-size: 26px;
          font-weight: 800;
          letter-spacing: 0.6px;
          margin-top: 4px;
          text-align: center;
          max-width: 320px;
          color: #ffffff;
          transform-origin: center center;
          animation: nameZoom 0.7s cubic-bezier(0.16, 0.84, 0.32, 1.12) both;
        }
        @keyframes nameZoom {
          from { opacity: 0; transform: scale(0.2); }
          to   { opacity: 1; transform: scale(1); }
        }

        .status-dots::after {
          content: '';
          animation: dots 1.4s steps(4, end) infinite;
        }
        @keyframes dots {
          0%   { content: ''; }
          25%  { content: '.'; }
          50%  { content: '..'; }
          75%, 100% { content: '...'; }
        }

        /* Indeterminate loading slider under Authenticating */
        .status-slider {
          width: min(220px, 70%);
          height: 4px;
          margin-top: 4px;
          border-radius: 99px;
          background: rgba(148,163,184,0.22);
          overflow: hidden;
          position: relative;
        }
        .status-slider-bar {
          position: absolute;
          top: 0; left: 0;
          height: 100%;
          width: 40%;
          border-radius: 99px;
          background: linear-gradient(90deg, #38bdf8, #60a5fa, #fbbf24);
          box-shadow: 0 0 12px rgba(56,189,248,0.45);
          animation: statusSlide 1.25s ease-in-out infinite;
        }
        @keyframes statusSlide {
          0%   { transform: translateX(-120%); }
          100% { transform: translateX(280%); }
        }
        .status-slider-done .status-slider-bar {
          width: 100%;
          left: 0;
          animation: none;
          transform: none;
          background: linear-gradient(90deg, #22c55e, #86efac);
          box-shadow: 0 0 12px rgba(34,197,94,0.45);
        }

        @media (max-width: 550px) {
          .card { padding: 16px 20px 16px; }
          .church-name { font-size: 18px; letter-spacing: 1px; }
          .church-location { font-size: 10px; }
          .church-cms-label { font-size: 14px; letter-spacing: 1.5px; }
        }
      `}</style>

      <div className="login-page">
        <div className="animated-bg"/>
        <div className="bg-grid"/>
        <div className="bg-halo"/>
        <div className="bg-ring bg-ring-a"/>
        <div className="bg-ring bg-ring-b"/>
        <div className="bg-ring bg-ring-c"/>
        <div className="bg-blob2"/>
        <div className="ray ray-1"/>
        <div className="ray ray-2"/>
        <div className="ray ray-3"/>
        <div className="ray ray-4"/>
        <div className="aurora"/>

        {/* Rising glowing orbs */}
        {orbParticles.map(o => (
          <div
            key={o.id}
            className="orb"
            style={{
              left: o.left, width: o.width, height: o.height,
              background: o.background, boxShadow: o.boxShadow,
              animationDelay: o.animationDelay, animationDuration: o.animationDuration,
            }}
          />
        ))}

        {/* Stars - memoized */}
        {starParticles.map(s => (
          <div
            key={`star-${s.id}`}
            className="star"
            style={{
              left: s.left, top: s.top, width: s.width, height: s.height,
              animationDelay: s.animationDelay, animationDuration: s.animationDuration
            }}
          />
        ))}

        {goldDust.map(d => (
          <div
            key={`dust-${d.id}`}
            className="gold-dust"
            style={{
              left: d.left, top: d.top, width: d.size, height: d.size,
              animationDelay: d.delay, animationDuration: d.duration,
            }}
          />
        ))}

        <div className="bg-vignette"/>

        <div className="card-wrap">
          <div className="card-border"/>
          <div className="card">

            {/* Status overlay — shown during auth and on success */}
            {status && (
              <div className="status-overlay">
                {status === 'authenticating' ? (
                  <>
                    <div className="auth-verify" aria-hidden>
                      {/* Left ECG */}
                      <svg className="auth-ecg auth-ecg-l" viewBox="0 0 64 44" preserveAspectRatio="none">
                        <path d="M0 22 H10 L14 22 L17 8 L21 36 L25 22 H34 L37 14 L41 30 L45 22 H64" />
                      </svg>

                      <div className="auth-shield">
                        <svg viewBox="0 0 80 88" width="72" height="80" fill="none">
                          <defs>
                            <clipPath id="authShieldClip">
                              <path d="M40 10 L64 21 V39 C64 55 53 68 40 74 C27 68 16 55 16 39 V21 Z" />
                            </clipPath>
                            <linearGradient id="authScanGrad" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#38bdf8" stopOpacity="0" />
                              <stop offset="45%" stopColor="#67e8f9" stopOpacity="0.55" />
                              <stop offset="100%" stopColor="#38bdf8" stopOpacity="0" />
                            </linearGradient>
                          </defs>
                          <circle className="auth-shield-glow" cx="40" cy="42" r="28" />
                          <path
                            className="auth-shield-body"
                            d="M40 8 L66 20 V40 C66 58 54 72 40 78 C26 72 14 58 14 40 V20 Z"
                            strokeWidth="2.4"
                            strokeLinejoin="round"
                          />

                          {/* Scrolling binary inside shield */}
                          <g clipPath="url(#authShieldClip)">
                            <g className="auth-binary auth-binary-scroll">
                              <text x="20" y="22">1 0 1 1 0</text>
                              <text x="20" y="30">0 1 0 1 1</text>
                              <text x="20" y="38">1 1 0 0 1</text>
                              <text x="20" y="46">0 0 1 1 0</text>
                              <text x="20" y="54">1 0 1 0 1</text>
                              <text x="20" y="62">0 1 1 0 0</text>
                              <text x="20" y="70">1 0 0 1 1</text>
                              <text x="20" y="78">0 1 0 1 0</text>
                              <text x="20" y="86">1 1 0 1 0</text>
                              <text x="20" y="94">0 0 1 0 1</text>
                            </g>
                            <g className="auth-binary auth-binary-scroll-b">
                              <text x="42" y="18">0 1</text>
                              <text x="42" y="26">1 0</text>
                              <text x="42" y="34">1 1</text>
                              <text x="42" y="42">0 0</text>
                              <text x="42" y="50">1 0</text>
                              <text x="42" y="58">0 1</text>
                              <text x="42" y="66">1 1</text>
                              <text x="42" y="74">0 1</text>
                              <text x="42" y="82">1 0</text>
                              <text x="42" y="90">0 1</text>
                            </g>
                            {/* Scan beam through binary */}
                            <rect className="auth-scan-beam" x="16" y="18" width="48" height="10" rx="2" />
                          </g>

                          {/* Magnifying lens scanning binary */}
                          <g className="auth-lens">
                            <circle className="auth-lens-glass" cx="36" cy="36" r="9" />
                            <line className="auth-lens-handle" x1="42.5" y1="42.5" x2="49" y2="49" />
                          </g>

                          {/* Closed lock → ring verify → green check */}
                          <g className="auth-lock auth-lock-verified">
                            <path
                              className="auth-lock-shackle"
                              d="M34 50 V44 C34 40.2 36.7 37.5 40 37.5 C43.3 37.5 46 40.2 46 44 V50"
                            />
                            <rect className="auth-lock-body" x="30" y="50" width="20" height="15" rx="2.5" />
                            <circle className="auth-lock-keyhole" cx="40" cy="56" r="1.7" />
                            <rect className="auth-lock-keyhole" x="39.15" y="57.2" width="1.7" height="3.4" rx="0.5" />
                            <circle className="auth-lock-ring" cx="40" cy="55" r="11.5" />
                            <path className="auth-lock-check" d="M34.5 56.2 L38.2 59.8 L46 51.5" />
                          </g>
                        </svg>
                      </div>

                      {/* Right ECG */}
                      <svg className="auth-ecg auth-ecg-r" viewBox="0 0 64 44" preserveAspectRatio="none">
                        <path d="M0 22 H19 L23 22 L26 6 L30 38 L34 22 H43 L46 12 L50 32 L54 22 H64" />
                      </svg>
                    </div>
                    <p
                      key={authStep}
                      className={`status-msg auth-line${AUTH_STEPS[authStep]?.tone === 'ok' ? ' auth-ok' : ''}`}
                    >
                      {AUTH_STEPS[authStep]?.text}
                      {AUTH_STEPS[authStep]?.tone === 'wait' ? <span className="status-dots"/> : null}
                    </p>
                    <div className={`status-slider${AUTH_STEPS[authStep]?.tone === 'ok' ? ' status-slider-done' : ''}`} aria-hidden>
                      <div className="status-slider-bar"/>
                    </div>
                  </>
                ) : (
                  <>
                    <p className="praise-label">
                      <span className="praise-star">✦</span>
                      <span className="praise-word">
                        {'Praise the Lord'.split('').map((ch, i) => (
                          <span key={i} className="praise-letter" style={{ '--i': i }}>
                            {ch === ' ' ? '\u00a0' : ch}
                          </span>
                        ))}
                      </span>
                      <span className="praise-star praise-star-r">✦</span>
                    </p>
                    <CheckCircle2 size={52} className="status-check"/>
                    <p className="status-msg welcome">Welcome back</p>
                    <p className="welcome-name">
                      {welcomeFirst || displayFirstName(profile, email)}
                    </p>
                  </>
                )}
              </div>
            )}

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

            {/* Login Form — remember email; do not offer to save password */}
            <form
              onSubmit={handleSubmit}
              className={error ? 'form-shake' : ''}
              key={error}
              autoComplete="on"
            >
              <div className="f-group">
                <label className="f-label">EMAIL</label>
                <input
                  className={`f-input${inputErr ? ' f-input-error' : ''}`}
                  type="email"
                  name="username"
                  placeholder="you@church.org"
                  value={email}
                  onChange={e => { setEmail(e.target.value); setInputErr(false); setError(''); }}
                  required
                  autoFocus
                  autoComplete="username"
                />
              </div>

              <div className="f-group">
                <label className="f-label">PASSWORD</label>
                <div className="pw-wrap">
                  <input
                    className={`f-input f-input-pw${inputErr ? ' f-input-error' : ''}`}
                    type={supportsDiscMask || showPw ? 'text' : 'password'}
                    name="cms-login-gate"
                    placeholder="Enter your password"
                    value={password}
                    onChange={e => { setPassword(e.target.value); setInputErr(false); setError(''); }}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleSubmit(e); } }}
                    required
                    autoComplete="off"
                    autoCorrect="off"
                    autoCapitalize="off"
                    spellCheck={false}
                    data-lpignore="true"
                    data-1p-ignore="true"
                    data-bwignore="true"
                    data-form-type="other"
                    data-np-ignore="true"
                    data-protonpass-ignore="true"
                    style={{ WebkitTextSecurity: showPw || !supportsDiscMask ? 'none' : 'disc' }}
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

              <button
                type="button"
                className="forgot-link"
                onClick={() => alert('Please contact your administrator to reset your password.')}
              >
                Forgot password?
              </button>

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