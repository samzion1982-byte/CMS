/* ═══════════════════════════════════════════════════════════════
   PaymentPage.jsx — Public UPI payment page (no auth required)
   Route: /pay/:requestId
   ═══════════════════════════════════════════════════════════════ */

import { useState, useEffect, useMemo } from 'react'
import { createClient } from '@supabase/supabase-js'
import QRCodeLib from 'qrcode'

// Isolated Supabase client — no auth session, no redirects, no persistence
const SUPABASE_URL      = 'https://wjasjrthijpxlarreics.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndqYXNqcnRoaWpweGxhcnJlaWNzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYxODAzMDAsImV4cCI6MjA5MTc1NjMwMH0.cCWk_U3kbLvCRuk916hoYP7cIlWusHTRbgSpvHnuktY'
const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
})

const SLOT_LABELS = {
  1: 'Monthly', 2: '2-Monthly', 3: 'Quarterly',
  4: '4-Monthly', 6: 'Half-Yearly', 12: 'Annual',
}

export default function PaymentPage({ requestId: propId }) {
  const requestId = propId || new URLSearchParams(window.location.search).get('id') || ''

  const [req,      setReq]      = useState(null)
  const [church,   setChurch]   = useState(null)
  const [catMap,   setCatMap]   = useState({})
  const [loading,  setLoading]  = useState(true)
  const [err,      setErr]      = useState(null)
  const [amounts,  setAmounts]  = useState({})
  const [copied,   setCopied]   = useState(false)
  const [qrDataUrl, setQrDataUrl] = useState('')
  const [paidForm, setPaidForm] = useState(false)
  const [upiRef,   setUpiRef]   = useState('')
  const [saving,   setSaving]   = useState(false)
  const [done,     setDone]     = useState(false)

  useEffect(() => {
    async function load() {
      try {
        const [rRes, cRes, pcRes] = await Promise.all([
          db.from('payment_requests').select('*').eq('id', requestId).single(),
          db.from('churches').select('church_name,city,logo_url,upi_id').limit(1).single(),
          db.from('payment_categories').select('id,name').eq('is_active', true),
        ])
        if (rRes.error) throw new Error(rRes.error.message)
        const r = rRes.data
        if (!r) throw new Error('Payment request not found.')
        if (r.status === 'cancelled') throw new Error('This payment link has been cancelled.')

        setReq(r)
        setChurch(cRes.data)
        setCatMap(Object.fromEntries((pcRes.data || []).map(c => [c.id, c.name])))

        if (r.status === 'paid_by_member' || r.status === 'confirmed') {
          setDone(true)
        } else {
          // Default amounts = monthly_rate × slot
          const init = {}
          Object.entries(r.amounts || {}).forEach(([cid, rate]) => {
            init[cid] = (parseFloat(rate) || 0) * (r.slot || 1)
          })
          setAmounts(init)
        }
      } catch (e) { setErr(e.message) }
      setLoading(false)
    }
    load()
  }, [requestId])

  const total = useMemo(
    () => Object.values(amounts).reduce((s, v) => s + (parseFloat(v) || 0), 0),
    [amounts]
  )

  useEffect(() => {
    if (!church?.upi_id || total <= 0) return
    const upiContent = `upi://pay?pa=${church.upi_id.trim()}&pn=${encodeURIComponent(church.church_name||'Church')}&am=${total}&cu=INR&tn=ChurchOffering`
    QRCodeLib.toDataURL(upiContent, { width: 220, margin: 2, color: { dark: '#0B1F4B', light: '#FFFFFF' } })
      .then(url => setQrDataUrl(url))
  }, [church, total])

  function copyUpiId() {
    if (!church?.upi_id) return
    navigator.clipboard?.writeText(church.upi_id.trim()).catch(() => {
      // Fallback for browsers without clipboard API
      const ta = document.createElement('textarea')
      ta.value = church.upi_id.trim()
      ta.style.position = 'fixed'; ta.style.opacity = '0'
      document.body.appendChild(ta); ta.select()
      document.execCommand('copy'); document.body.removeChild(ta)
    })
    setCopied(true)
    setTimeout(() => setCopied(false), 2500)
  }

  async function markPaid() {
    setSaving(true)
    const base = req.amounts || {}
    let edited = false
    const editedAmts = {}
    Object.entries(amounts).forEach(([cid, v]) => {
      editedAmts[cid] = parseFloat(v) || 0
      if (Math.abs(editedAmts[cid] - ((parseFloat(base[cid]) || 0) * (req.slot || 1))) > 0.01)
        edited = true
    })
    const { error } = await db.from('payment_requests').update({
      status:               'paid_by_member',
      paid_at:              new Date().toISOString(),
      upi_ref:              upiRef.trim() || null,
      grand_total:          total,
      member_edited_amounts: edited ? editedAmts : null,
      updated_at:           new Date().toISOString(),
    }).eq('id', requestId).eq('status', 'pending')
    if (error) alert('Error: ' + error.message)
    else setDone(true)
    setSaving(false)
  }

  if (loading) return <Bg><Spin/></Bg>
  if (err)     return <Bg><ErrCard msg={err}/></Bg>
  if (done)    return <Bg><DoneCard req={req} total={total}/></Bg>

  return (
    <Bg>
      <div style={{
        background: '#fff', width: '100%', maxWidth: 410, borderRadius: 20,
        overflow: 'hidden', boxShadow: '0 30px 80px rgba(0,0,0,0.45)',
        animation: 'rise .65s cubic-bezier(.22,1,.36,1) both', position: 'relative', zIndex: 1,
      }}>

        {/* ── Header ── */}
        <div style={{
          background: 'linear-gradient(160deg,#0B1F4B 0%,#1A3A8F 60%,#2B5CE6 100%)',
          padding: '2.4rem 2rem 2rem', textAlign: 'center',
          position: 'relative', overflow: 'hidden',
        }}>
          <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(circle at 20% 50%,rgba(91,141,239,.15) 0%,transparent 50%)', pointerEvents: 'none' }}/>
          {/* Church window arcs */}
          <svg style={{ position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)', width: 220, height: 130, opacity: .12, pointerEvents: 'none' }}
            viewBox="0 0 220 130" fill="none">
            <path d="M110 130 Q30 130 30 60 Q30 10 110 10 Q190 10 190 60 Q190 130 110 130Z" stroke="white" strokeWidth="1.5" fill="none"/>
            <path d="M110 130 Q55 130 55 65 Q55 25 110 25 Q165 25 165 65 Q165 130 110 130Z" stroke="white" strokeWidth="1" fill="none"/>
            <line x1="110" y1="10" x2="110" y2="130" stroke="white" strokeWidth="1"/>
            <line x1="30" y1="65" x2="190" y2="65" stroke="white" strokeWidth="1"/>
          </svg>
          {/* Cross / logo */}
          <div style={{
            position: 'relative', zIndex: 1, margin: '0 auto 1.1rem', width: 52, height: 52,
            background: 'rgba(255,255,255,.1)', border: '1px solid rgba(255,255,255,.2)',
            borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {church?.logo_url
              ? <img src={church.logo_url} alt="" style={{ width: 32, height: 32, objectFit: 'contain' }}/>
              : <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
                  <rect x="9" y="1" width="4" height="20" rx="1" fill="white"/>
                  <rect x="2" y="6" width="18" height="4" rx="1" fill="white"/>
                </svg>
            }
          </div>
          <div style={{
            fontFamily: "'Playfair Display',serif", fontSize: 21, fontWeight: 700, color: '#fff',
            lineHeight: 1.3, position: 'relative', zIndex: 1,
          }}>
            {church?.church_name || 'Church'}
            <em style={{
              fontStyle: 'italic', fontWeight: 500, color: 'rgba(255,255,255,.75)', fontSize: 13,
              display: 'block', letterSpacing: '.08em', marginTop: 4,
              fontFamily: "'DM Sans',sans-serif", textTransform: 'uppercase',
            }}>
              {church?.city || ''}
            </em>
          </div>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: '1rem', position: 'relative', zIndex: 1, flexWrap: 'wrap' }}>
            {[req.member_name, `${req.months} · ${req.fy}`].map((t, i) => (
              <span key={i} style={{
                fontSize: 10.5, fontWeight: 500, letterSpacing: '.1em', textTransform: 'uppercase',
                color: 'rgba(255,255,255,.55)', background: 'rgba(255,255,255,.08)',
                border: '1px solid rgba(255,255,255,.12)', borderRadius: 20, padding: '3px 10px',
              }}>{t}</span>
            ))}
          </div>
        </div>

        {/* ── Body ── */}
        <div style={{ background: '#F4F7FE', padding: '1.8rem 1.8rem .5rem' }}>
          <div style={{ fontSize: 10, fontWeight: 500, letterSpacing: '.18em', textTransform: 'uppercase', color: '#A8BAD8', marginBottom: '1rem' }}>
            Payment Details — {SLOT_LABELS[req.slot] || ''}
          </div>

          {/* Category rows */}
          <div style={{ background: '#fff', border: '1px solid #DDE6F7', borderRadius: 12, overflow: 'hidden', marginBottom: '1rem' }}>
            {Object.entries(req.amounts || {}).map(([cid], idx) => (
              <div key={cid} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '.95rem 1.1rem', borderTop: idx > 0 ? '1px solid #EEF3FB' : 'none',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                  <div style={{ width: 30, height: 30, borderRadius: 8, background: '#EBF1FD', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <svg width="15" height="15" viewBox="0 0 20 20" fill="none">
                      <circle cx="10" cy="10" r="8" stroke="#2B5CE6" strokeWidth="1.5"/>
                      <path d="M10 6v8M7.5 8h3.75a1.25 1.25 0 010 2.5H8.75A1.25 1.25 0 018.75 13H12.5" stroke="#2B5CE6" strokeWidth="1.5" strokeLinecap="round"/>
                    </svg>
                  </div>
                  <span style={{ fontSize: 13.5, color: '#0D1B3E', fontFamily: "'DM Sans',sans-serif" }}>
                    {catMap[cid] || 'Category'}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 2, background: '#EBF1FD', borderRadius: 8, padding: '5px 9px' }}>
                  <span style={{ fontSize: 13, color: '#5B8DEF', fontWeight: 500 }}>₹</span>
                  <input
                    type="number" min="0" value={amounts[cid] ?? ''}
                    onChange={e => setAmounts(p => ({ ...p, [cid]: e.target.value }))}
                    style={{ width: 68, border: 'none', background: 'transparent', textAlign: 'right', fontSize: 15, fontFamily: "'DM Sans',sans-serif", fontWeight: 500, color: '#0B1F4B', outline: 'none' }}
                  />
                </div>
              </div>
            ))}
          </div>

          {/* Total */}
          <div style={{
            background: 'linear-gradient(135deg,#0B1F4B 0%,#1A3A8F 100%)', borderRadius: 14,
            padding: '1.1rem 1.4rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            marginBottom: '1.4rem', position: 'relative', overflow: 'hidden',
          }}>
            <div style={{ position: 'absolute', right: -20, top: -20, width: 100, height: 100, borderRadius: '50%', background: 'rgba(91,141,239,.18)', pointerEvents: 'none' }}/>
            <div>
              <div style={{ fontSize: 10, letterSpacing: '.15em', textTransform: 'uppercase', color: 'rgba(168,186,216,.8)', marginBottom: 2 }}>Total Payment</div>
              <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 30, fontWeight: 700, color: '#fff', position: 'relative', zIndex: 1 }}>
                ₹{total.toLocaleString('en-IN')}
              </div>
            </div>
            <div style={{ background: 'rgba(255,255,255,.1)', border: '1px solid rgba(255,255,255,.15)', borderRadius: 8, padding: '6px 12px', fontSize: 11, color: 'rgba(255,255,255,.6)' }}>INR</div>
          </div>

          {/* ── UPI Payment ── */}
          {church?.upi_id ? (
            <div style={{ background: '#fff', border: '1.5px solid #DDE6F7', borderRadius: 14, padding: '1.3rem', marginBottom: '1rem' }}>

              {/* Steps */}
              <div style={{ display: 'flex', gap: 6, marginBottom: '1rem' }}>
                {[['1','Save QR\nto phone'],['2','Open GPay\n→ Scan icon'],['3','Gallery →\nselect QR']].map(([n,t])=>(
                  <div key={n} style={{ flex:1, textAlign:'center' }}>
                    <div style={{ width:24, height:24, borderRadius:'50%', background:'#0B1F4B', color:'#fff', fontSize:12, fontWeight:700, display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 4px' }}>{n}</div>
                    <div style={{ fontSize:10.5, color:'#64748b', lineHeight:1.4, whiteSpace:'pre-line', fontFamily:"'DM Sans',sans-serif" }}>{t}</div>
                  </div>
                ))}
              </div>

              {/* QR code + Save button */}
              <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:10, marginBottom:'0.9rem' }}>
                {qrDataUrl
                  ? <img src={qrDataUrl} alt="UPI Payment QR Code"
                      style={{ width:220, height:220, borderRadius:12, border:'2px solid #0B1F4B', display:'block' }}
                    />
                  : <div style={{ width:220, height:220, borderRadius:12, border:'2px solid #DDE6F7', background:'#F4F7FE', display:'flex', alignItems:'center', justifyContent:'center' }}>
                      <div style={{ width:32, height:32, border:'3px solid #DDE6F7', borderTopColor:'#2B5CE6', borderRadius:'50%', animation:'hspin .7s linear infinite' }}/>
                    </div>
                }
                {qrDataUrl && (
                  <a href={qrDataUrl} download="upi-payment-qr.png" style={{
                    display:'flex', alignItems:'center', gap:6,
                    padding:'8px 20px', borderRadius:8, background:'#0B1F4B', color:'#fff',
                    fontSize:13, fontWeight:500, textDecoration:'none', fontFamily:"'DM Sans',sans-serif",
                  }}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
                    </svg>
                    Save QR to phone
                  </a>
                )}
              </div>

              {/* Same-phone tip */}
              <div style={{ background:'#EBF1FD', border:'1px solid #C7D9F8', borderRadius:10, padding:'0.65rem 0.9rem', marginBottom:'0.9rem' }}>
                <div style={{ fontSize:12, fontWeight:600, color:'#1e3a6e', marginBottom:4, fontFamily:"'DM Sans',sans-serif" }}>
                  Paying from this phone?
                </div>
                <div style={{ fontSize:12, color:'#1e3a6e', lineHeight:1.8, fontFamily:"'DM Sans',sans-serif" }}>
                  1. Tap <strong>Save QR to phone</strong> above<br/>
                  2. Open <strong>GPay</strong> → tap the <strong>Scan</strong> icon<br/>
                  3. Tap the <strong>Gallery</strong> icon → select saved QR
                </div>
              </div>

              {/* UPI ID + Copy */}
              <div style={{ display:'flex', alignItems:'center', gap:8, margin:'0 0 0.6rem' }}>
                <div style={{ flex:1, height:1, background:'#EEF3FB' }}/>
                <span style={{ fontSize:11, color:'#A8BAD8', whiteSpace:'nowrap' }}>or pay by UPI ID</span>
                <div style={{ flex:1, height:1, background:'#EEF3FB' }}/>
              </div>
              <div style={{ display:'flex', alignItems:'center', gap:10, background:'#EBF1FD', borderRadius:10, padding:'0.65rem 0.9rem' }}>
                <div style={{ flex:1, minWidth:0, fontSize:14, fontWeight:600, color:'#0B1F4B', wordBreak:'break-all', fontFamily:'monospace' }}>
                  {church.upi_id}
                </div>
                <button onClick={copyUpiId} style={{
                  flexShrink:0, padding:'6px 13px', borderRadius:8, border:'none',
                  background: copied ? '#16a34a' : '#2B5CE6', color:'#fff',
                  fontSize:12, fontWeight:500, cursor:'pointer',
                  display:'flex', alignItems:'center', gap:5, whiteSpace:'nowrap',
                  transition:'background .2s',
                }}>
                  {copied
                    ? <><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>Copied!</>
                    : <><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>Copy</>
                  }
                </button>
              </div>
            </div>
          ) : (
            <div style={{ background:'#fef2f2', border:'1px solid #fecaca', borderRadius:12, padding:'0.9rem 1.1rem', marginBottom:'1rem', fontSize:13, color:'#dc2626' }}>
              UPI ID not configured. Please contact the church office.
            </div>
          )}

          {/* I've Paid section */}
          {!paidForm ? (
            <button onClick={() => setPaidForm(true)} style={{
              width: '100%', padding: '10px 14px', background: 'transparent',
              border: '1.5px solid #DDE6F7', borderRadius: 12, fontSize: 13, fontWeight: 500,
              color: '#64748b', cursor: 'pointer', marginBottom: '.9rem',
              fontFamily: "'DM Sans',sans-serif",
            }}>
              I've already paid — notify treasurer
            </button>
          ) : (
            <div style={{ border: '1.5px solid #DDE6F7', borderRadius: 12, padding: '1rem', marginBottom: '.9rem' }}>
              <p style={{ fontSize: 12, color: '#64748b', marginBottom: 8, fontFamily: "'DM Sans',sans-serif" }}>
                UPI Transaction ID <span style={{ opacity: .6 }}>(optional)</span>
              </p>
              <input value={upiRef} onChange={e => setUpiRef(e.target.value)}
                placeholder="e.g. 123456789012"
                style={{ width: '100%', padding: '8px 12px', border: '1.5px solid #DDE6F7', borderRadius: 8, fontSize: 13, marginBottom: 10, outline: 'none', fontFamily: "'DM Sans',sans-serif", boxSizing: 'border-box' }}/>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => setPaidForm(false)} style={{ flex: 1, padding: 9, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, cursor: 'pointer', color: '#64748b', fontFamily: "'DM Sans',sans-serif" }}>Cancel</button>
                <button onClick={markPaid} disabled={saving} style={{
                  flex: 2, padding: 9, background: '#16a34a', border: 'none', borderRadius: 8,
                  fontSize: 13, fontWeight: 600, color: '#fff',
                  cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? .7 : 1,
                  fontFamily: "'DM Sans',sans-serif",
                }}>
                  {saving ? 'Sending…' : 'Confirm & Notify Treasurer'}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        <div style={{ background: '#F4F7FE', borderTop: '1px solid #DDE6F7', padding: '.8rem 1.8rem 1.2rem', textAlign: 'center' }}>
          <div style={{ fontSize: 11, color: '#A8BAD8', fontFamily: "'DM Sans',sans-serif" }}>
            Scan QR with GPay · PhonePe · or any UPI app · After paying tap "I've already paid" below
          </div>
        </div>
      </div>
    </Bg>
  )
}

// ── Shared background wrapper ────────────────────────────────
function Bg({ children }) {
  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,700;1,500&family=DM+Sans:wght@400;500;600&display=swap');
        @keyframes rise   { from { opacity:0; transform:translateY(30px) scale(.97); } to { opacity:1; transform:none; } }
        @keyframes hspin  { to   { transform:rotate(360deg); } }
        * { -webkit-user-select:none; user-select:none; }
        input, textarea { -webkit-user-select:text; user-select:text; }
      `}</style>
      <div style={{
        fontFamily: "'DM Sans',sans-serif", minHeight: '100vh', background: '#0B1F4B',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '2rem 1rem', position: 'relative', overflow: 'hidden',
      }}>
        <div style={{ position: 'fixed', width: 600, height: 600, borderRadius: '50%', background: 'radial-gradient(circle,rgba(43,92,230,.35) 0%,transparent 70%)', top: -200, right: -150, pointerEvents: 'none' }}/>
        <div style={{ position: 'fixed', width: 400, height: 400, borderRadius: '50%', background: 'radial-gradient(circle,rgba(91,141,239,.2) 0%,transparent 70%)', bottom: -100, left: -80, pointerEvents: 'none' }}/>
        {children}
      </div>
    </>
  )
}

function Spin() {
  return <div style={{ width: 40, height: 40, border: '3px solid rgba(255,255,255,.2)', borderTopColor: '#5B8DEF', borderRadius: '50%', animation: 'hspin .7s linear infinite' }}/>
}

function ErrCard({ msg }) {
  return (
    <div style={{ background: '#fff', borderRadius: 16, padding: '2rem', maxWidth: 380, width: '100%', textAlign: 'center', animation: 'rise .5s ease both' }}>
      <div style={{ fontSize: 40, marginBottom: 12 }}>⚠️</div>
      <h2 style={{ color: '#0B1F4B', marginBottom: 8, fontFamily: "'DM Sans',sans-serif", fontWeight: 700, fontSize: 18 }}>Not Available</h2>
      <p style={{ color: '#64748b', fontSize: 13 }}>{msg}</p>
    </div>
  )
}

function DoneCard({ req, total }) {
  return (
    <div style={{ background: '#fff', borderRadius: 20, padding: '2.5rem 2rem', maxWidth: 380, width: '100%', textAlign: 'center', animation: 'rise .5s ease both', boxShadow: '0 30px 80px rgba(0,0,0,.45)' }}>
      <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#f0fdf4', border: '2px solid #bbf7d0', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.2rem' }}>
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
      </div>
      <h2 style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 20, fontWeight: 700, color: '#0B1F4B', marginBottom: 8 }}>Payment Notified!</h2>
      <p style={{ fontSize: 13, color: '#64748b', lineHeight: 1.6, marginBottom: '1.5rem' }}>
        Thank you, <strong>{req?.member_name}</strong>. Your payment of{' '}
        <strong>₹{(total || req?.grand_total || 0).toLocaleString('en-IN')}</strong> for{' '}
        <strong>{req?.months}</strong> has been notified to the treasurer for verification.
      </p>
      <div style={{ background: '#f8fafc', borderRadius: 10, padding: '.8rem 1rem', fontSize: 11, color: '#64748b' }}>
        The treasurer will verify your payment and issue the official receipt shortly.
      </div>
    </div>
  )
}
