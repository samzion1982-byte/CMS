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

  async function sharePaymentFile() {
    if (!qrDataUrl || !church?.upi_id) return
    const upiId  = church.upi_id.trim()
    const catRows = Object.entries(req.amounts || {}).map(([cid, rate]) => ({
      name: catMap[cid] || 'Category',
      amount: (parseFloat(rate) || 0) * (req.slot || 1),
    }))
    const esc = s => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
    const js  = s => String(s ?? '').replace(/\\/g,'\\\\').replace(/'/g,"\\'").replace(/\n/g,'\\n')
    const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
<title>Payment &#8212; ${esc(church.church_name)}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box;-webkit-user-select:none;user-select:none}
input{-webkit-user-select:text;user-select:text}
body{font-family:'Segoe UI',Arial,sans-serif;background:#0B1F4B;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:16px}
.card{background:#fff;width:100%;max-width:400px;border-radius:20px;overflow:hidden;box-shadow:0 30px 80px rgba(0,0,0,.5)}
.hdr{background:linear-gradient(160deg,#0B1F4B 0%,#1A3A8F 60%,#2B5CE6 100%);padding:28px 20px 20px;text-align:center}
.hdr h1{color:#fff;font-size:19px;font-weight:700}.hdr p{color:rgba(255,255,255,.6);font-size:12px;margin-top:2px}
.badge{display:inline-block;background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.15);border-radius:20px;padding:3px 10px;font-size:10px;color:rgba(255,255,255,.6);margin:8px 3px 0;letter-spacing:.06em}
.body{background:#F4F7FE;padding:18px}
.cats{background:#fff;border:1px solid #DDE6F7;border-radius:12px;overflow:hidden;margin-bottom:12px}
.cr{display:flex;justify-content:space-between;padding:12px 14px;border-top:1px solid #EEF3FB;font-size:14px}
.cr:first-child{border-top:none}.cn{color:#0D1B3E}.ca{color:#0B1F4B;font-weight:600}
.tbox{background:linear-gradient(135deg,#0B1F4B 0%,#1A3A8F 100%);border-radius:14px;padding:14px 18px;display:flex;justify-content:space-between;align-items:center;margin-bottom:14px}
.tlbl{font-size:10px;letter-spacing:.15em;text-transform:uppercase;color:rgba(168,186,216,.8);margin-bottom:2px}.tamt{font-size:28px;font-weight:700;color:#fff}
.sec{background:#fff;border:1.5px solid #DDE6F7;border-radius:14px;padding:14px;margin-bottom:10px}
.btn{display:block;width:100%;padding:12px;border:none;border-radius:10px;font-size:14px;font-weight:700;cursor:pointer;text-align:center;margin-bottom:8px}
.bg{background:linear-gradient(135deg,#0B1F4B 0%,#2B5CE6 100%);color:#fff}
.qw{text-align:center;margin:10px 0}.qw img{border-radius:12px;border:2px solid #0B1F4B;display:block;margin:0 auto}
.or{display:flex;align-items:center;gap:8px;margin:8px 0}.or hr{flex:1;border:none;border-top:1px solid #EEF3FB}.or span{font-size:11px;color:#A8BAD8;white-space:nowrap}
.urow{display:flex;align-items:center;gap:8px;background:#EBF1FD;border-radius:10px;padding:10px 12px;margin-bottom:8px}
.uid{flex:1;font-family:monospace;font-size:13px;font-weight:600;color:#0B1F4B;word-break:break-all}
.cp{flex-shrink:0;padding:6px 12px;border-radius:8px;border:none;background:#2B5CE6;color:#fff;font-size:12px;font-weight:500;cursor:pointer}
.tip{background:#EBF1FD;border:1px solid #C7D9F8;border-radius:10px;padding:10px 12px;font-size:11.5px;color:#1e3a6e;line-height:1.7}
.pf{border-top:1px solid #EEF3FB;margin-top:10px;padding-top:10px}.pl{font-size:12px;color:#2B5CE6;font-weight:500;cursor:pointer;text-align:center;margin-bottom:6px}
.pi{display:none}.pi input{width:100%;padding:9px 12px;border:1.5px solid #DDE6F7;border-radius:8px;font-size:13px;margin-bottom:8px;outline:none}
.pr{display:flex;gap:8px}.bc{flex:1;padding:9px;border:1px solid #e2e8f0;border-radius:8px;font-size:13px;cursor:pointer;background:#f8fafc;color:#64748b}
.bk{flex:2;padding:9px;background:#16a34a;color:#fff;border:none;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer}
.done{padding:40px 24px;text-align:center}
.ck{width:64px;height:64px;border-radius:50%;background:#f0fdf4;border:2px solid #bbf7d0;display:flex;align-items:center;justify-content:center;margin:0 auto 16px}
.ftr{background:#F4F7FE;border-top:1px solid #DDE6F7;padding:10px 20px;text-align:center;font-size:11px;color:#A8BAD8}
</style></head><body>
<div class="card">
<div class="hdr"><h1>${esc(church.church_name)}</h1>${church.city?`<p>${esc(church.city)}</p>`:''}
<div><span class="badge">${esc(req.member_name)}</span><span class="badge">${esc(req.months)} &middot; ${esc(req.fy)}</span></div></div>
<div id="ps"><div class="body">
<div style="font-size:10px;letter-spacing:.18em;text-transform:uppercase;color:#A8BAD8;margin-bottom:10px">Payment Details</div>
<div class="cats">${catRows.map(c=>`<div class="cr"><span class="cn">${esc(c.name)}</span><span class="ca">&#8377;${c.amount.toLocaleString('en-IN')}</span></div>`).join('')}</div>
<div class="tbox"><div><div class="tlbl">Total Payment</div><div class="tamt">&#8377;${total.toLocaleString('en-IN')}</div></div>
<div style="background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.15);border-radius:8px;padding:5px 11px;font-size:11px;color:rgba(255,255,255,.6)">INR</div></div>
<div class="sec">
<div style="display:flex;gap:6px;margin-bottom:14px">
<div style="flex:1;text-align:center"><div style="width:24px;height:24px;border-radius:50%;background:#0B1F4B;color:#fff;font-size:12px;font-weight:700;display:flex;align-items:center;justify-content:center;margin:0 auto 4px">1</div><div style="font-size:10px;color:#64748b;line-height:1.4">Tap Pay<br>with GPay</div></div>
<div style="flex:1;text-align:center"><div style="width:24px;height:24px;border-radius:50%;background:#0B1F4B;color:#fff;font-size:12px;font-weight:700;display:flex;align-items:center;justify-content:center;margin:0 auto 4px">2</div><div style="font-size:10px;color:#64748b;line-height:1.4">GPay opens<br>automatically</div></div>
<div style="flex:1;text-align:center"><div style="width:24px;height:24px;border-radius:50%;background:#0B1F4B;color:#fff;font-size:12px;font-weight:700;display:flex;align-items:center;justify-content:center;margin:0 auto 4px">3</div><div style="font-size:10px;color:#64748b;line-height:1.4">Confirm<br>payment</div></div>
</div>
<a class="btn bg" href="gpay://upi/pay?pa=${esc(upiId)}&amp;am=${total}&amp;cu=INR" style="text-decoration:none">Pay &#8377;${total.toLocaleString('en-IN')} with GPay</a>
<a href="upi://pay?pa=${esc(upiId)}&amp;am=${total}&amp;cu=INR" style="display:block;text-align:center;font-size:12px;color:#64748b;margin-bottom:6px;text-decoration:none">PhonePe / other UPI app</a>
<div class="qw"><img src="${qrDataUrl}" alt="UPI QR" width="220" height="220">
<div style="font-size:11px;color:#64748b;margin-top:6px">Or scan QR in GPay &middot; PhonePe &middot; any UPI app</div></div>
<div class="or"><hr><span>or pay by UPI ID</span><hr></div>
<div class="urow"><span class="uid">${esc(upiId)}</span><button class="cp" id="cb" onclick="copyUpi()">Copy</button></div>
<div class="tip"><strong>Same phone?</strong> Tap <em>Pay with GPay</em> above &mdash; GPay will open with the amount pre-filled.</div>
<div class="pf">
<div class="pl" onclick="togglePaid()">&#10003; I&#39;ve already paid &mdash; notify treasurer</div>
<div class="pi" id="pf"><input type="text" id="ur" placeholder="UPI Transaction ID (optional)">
<div class="pr"><button class="bc" onclick="togglePaid()">Cancel</button>
<button class="bk" id="cb2" onclick="markPaid()">Confirm &amp; Notify Treasurer</button></div></div></div>
</div></div></div>
<div id="dc" style="display:none"><div class="done">
<div class="ck"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#16a34a" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></div>
<h2 style="font-size:20px;font-weight:700;color:#0B1F4B;margin-bottom:8px">Payment Notified!</h2>
<p style="font-size:13px;color:#64748b;line-height:1.6;margin-bottom:16px">Thank you, <strong>${esc(req.member_name)}</strong>. Your payment of <strong>&#8377;${total.toLocaleString('en-IN')}</strong> for <strong>${esc(req.months)}</strong> has been notified to the treasurer.</p>
<div style="background:#f8fafc;border-radius:10px;padding:10px 14px;font-size:11px;color:#64748b">The treasurer will verify your payment and issue the official receipt shortly.</div>
</div></div>
<div class="ftr">GPay &middot; PhonePe &middot; Any UPI app &middot; After paying tap &#8220;I&#39;ve already paid&#8221;</div>
</div>
<script>
var SB='${js(SUPABASE_URL)}',KEY='${js(SUPABASE_ANON_KEY)}',RID='${js(req.id || requestId)}';
function copyUpi(){var id='${js(upiId)}',b=document.getElementById('cb');function done(){b.textContent='Copied!';b.style.background='#16a34a';setTimeout(function(){b.textContent='Copy';b.style.background='#2B5CE6';},2500);}if(navigator.clipboard){navigator.clipboard.writeText(id).then(done).catch(fb);}else{fb();}function fb(){var t=document.createElement('textarea');t.value=id;t.style.cssText='position:fixed;opacity:0;';document.body.appendChild(t);t.select();document.execCommand('copy');document.body.removeChild(t);done();}}
function togglePaid(){var d=document.getElementById('pf');d.style.display=(d.style.display==='block')?'none':'block';}
function markPaid(){var ref=document.getElementById('ur').value.trim(),b=document.getElementById('cb2');b.textContent='Saving…';b.disabled=true;fetch(SB+'/rest/v1/payment_requests?id=eq.'+RID,{method:'PATCH',headers:{'Content-Type':'application/json','apikey':KEY,'Authorization':'Bearer '+KEY,'Prefer':'return=minimal'},body:JSON.stringify({status:'paid_by_member',paid_at:new Date().toISOString(),upi_ref:ref||null,grand_total:${total},updated_at:new Date().toISOString()})}).then(function(r){if(r.ok||r.status===204){document.getElementById('ps').style.display='none';document.getElementById('dc').style.display='block';}else{r.text().then(function(t){alert('Error: '+t);b.textContent='Confirm';b.disabled=false;});}}).catch(function(e){alert('Error: '+e.message);b.textContent='Confirm';b.disabled=false;});}
</script></body></html>`
    const blob = new Blob([html], { type: 'text/html' })
    const file = new File([blob], 'payment.html', { type: 'text/html' })

    // Web Share API — shares the HTML file directly into WhatsApp.
    // When the member opens it from WhatsApp it opens as content:// URI
    // which allows gpay:// iframe to create a PAY (not COLLECT) transaction.
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: `Payment — ${church?.church_name || ''}` })
        return
      } catch (e) {
        if (e.name === 'AbortError') return  // user cancelled share sheet
        // fall through to download
      }
    }
    // Fallback: plain download (works on desktop / iOS)
    const url = URL.createObjectURL(blob)
    const a   = document.createElement('a')
    a.href = url; a.download = 'payment.html'
    document.body.appendChild(a); a.click()
    document.body.removeChild(a); URL.revokeObjectURL(url)
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

              {/* Share payment file button */}
              {qrDataUrl && (
                <button onClick={sharePaymentFile} style={{
                  width:'100%', padding:'13px', border:'none', borderRadius:12, marginBottom:'0.7rem',
                  background:'linear-gradient(135deg,#0B1F4B 0%,#2B5CE6 100%)', color:'#fff',
                  fontSize:15, fontWeight:700, cursor:'pointer', display:'flex', alignItems:'center',
                  justifyContent:'center', gap:8, fontFamily:"'DM Sans',sans-serif",
                }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
                    <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
                  </svg>
                  Share Payment File to WhatsApp
                </button>
              )}
              <div style={{ background:'#EBF1FD', border:'1px solid #C7D9F8', borderRadius:10, padding:'0.6rem 0.9rem', marginBottom:'0.9rem' }}>
                <div style={{ fontSize:11.5, color:'#1e3a6e', lineHeight:1.8, fontFamily:"'DM Sans',sans-serif" }}>
                  1. Tap <strong>Share Payment File to WhatsApp</strong> above<br/>
                  2. Share it to <strong>yourself</strong> (Saved Messages / your own chat)<br/>
                  3. Open WhatsApp → tap the file you just received<br/>
                  4. Tap <strong>Pay ₹{total.toLocaleString('en-IN')} with GPay</strong>
                </div>
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
