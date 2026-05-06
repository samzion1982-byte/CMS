import QRCodeLib from 'qrcode'
import { adminSupabase, SUPABASE_URL, SUPABASE_ANON_KEY } from './supabase'

const SLOT_LABELS = {
  1: 'Monthly', 2: '2-Monthly', 3: 'Quarterly',
  4: '4-Monthly', 6: 'Half-Yearly', 12: 'Annual',
}

export async function generateAndUploadPaymentHtml({ req, church, catMap }) {
  const total      = req.grand_total
  const upiId      = (church.upi_id || '').trim()
  const churchName = church.church_name || 'Church'

  const upiContent = `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(churchName)}&am=${parseFloat(total)}&cu=INR`
  const gpayUrl    = `gpay://upi/pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(churchName)}&am=${parseFloat(total)}&cu=INR`

  const qrDataUrl = await QRCodeLib.toDataURL(upiContent, {
    width: 280, margin: 2, color: { dark: '#0B1F4B', light: '#FFFFFF' },
  })

  const catRows = Object.entries(req.amounts || {}).map(([cid, rate]) => ({
    name:   catMap[cid] || 'Category',
    amount: (parseFloat(rate) || 0) * (req.slot || 1),
  }))

  const html = buildHtml({
    req, church, catRows, total, qrDataUrl, upiContent, gpayUrl,
    upiId, churchName, slotLabel: SLOT_LABELS[req.slot] || '',
  })

  const blob     = new Blob([html], { type: 'text/html' })
  const filename = `payment-${req.id}.html`

  const { error: upErr } = await adminSupabase.storage.from('payment-pages').upload(filename, blob, {
    contentType:  'text/html',
    upsert:       true,
    cacheControl: '86400',
  })
  if (upErr) throw new Error(`Storage upload failed: ${upErr.message}`)

  const { data } = adminSupabase.storage.from('payment-pages').getPublicUrl(filename)
  return data.publicUrl
}

// ── HTML builder ────────────────────────────────────────────────────────────

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
function jsStr(s) {
  return String(s ?? '').replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n').replace(/\r/g, '')
}

function buildHtml({ req, church, catRows, total, qrDataUrl, upiContent, gpayUrl, upiId, churchName, slotLabel }) {
  const catRowsHtml = catRows.map(c =>
    `<div class="cr"><span class="cn">${esc(c.name)}</span><span class="ca">&#8377;${c.amount.toLocaleString('en-IN')}</span></div>`
  ).join('\n')

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
<title>Payment &#8212; ${esc(churchName)}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box;-webkit-user-select:none;user-select:none}
input{-webkit-user-select:text;user-select:text}
body{font-family:'Segoe UI',Arial,sans-serif;background:#0B1F4B;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:16px}
.card{background:#fff;width:100%;max-width:400px;border-radius:20px;overflow:hidden;box-shadow:0 30px 80px rgba(0,0,0,.5)}
.hdr{background:linear-gradient(160deg,#0B1F4B 0%,#1A3A8F 60%,#2B5CE6 100%);padding:28px 20px 20px;text-align:center}
.hdr h1{color:#fff;font-size:19px;font-weight:700}
.hdr p{color:rgba(255,255,255,.6);font-size:12px;margin-top:2px}
.badge{display:inline-block;background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.15);border-radius:20px;padding:3px 10px;font-size:10px;color:rgba(255,255,255,.6);margin:8px 3px 0;letter-spacing:.06em}
.body{background:#F4F7FE;padding:18px}
.lbl{font-size:10px;letter-spacing:.18em;text-transform:uppercase;color:#A8BAD8;margin-bottom:10px}
.cats{background:#fff;border:1px solid #DDE6F7;border-radius:12px;overflow:hidden;margin-bottom:12px}
.cr{display:flex;justify-content:space-between;padding:12px 14px;border-top:1px solid #EEF3FB;font-size:14px}
.cr:first-child{border-top:none}
.cn{color:#0D1B3E}.ca{color:#0B1F4B;font-weight:600}
.tbox{background:linear-gradient(135deg,#0B1F4B 0%,#1A3A8F 100%);border-radius:14px;padding:14px 18px;display:flex;justify-content:space-between;align-items:center;margin-bottom:14px}
.tlbl{font-size:10px;letter-spacing:.15em;text-transform:uppercase;color:rgba(168,186,216,.8);margin-bottom:2px}
.tamt{font-size:28px;font-weight:700;color:#fff}
.sec{background:#fff;border:1.5px solid #DDE6F7;border-radius:14px;padding:14px;margin-bottom:10px}
.steps{display:flex;gap:6px;margin-bottom:14px}
.step{flex:1;text-align:center}
.snum{width:24px;height:24px;border-radius:50%;background:#0B1F4B;color:#fff;font-size:12px;font-weight:700;display:flex;align-items:center;justify-content:center;margin:0 auto 4px}
.stxt{font-size:10px;color:#64748b;line-height:1.4}
.btn{display:block;width:100%;padding:12px;border:none;border-radius:10px;font-size:14px;font-weight:700;cursor:pointer;text-align:center;margin-bottom:8px}
.bg{background:linear-gradient(135deg,#0B1F4B 0%,#2B5CE6 100%);color:#fff}
.qw{text-align:center;margin:10px 0}
.qw img{border-radius:12px;border:2px solid #0B1F4B;display:block;margin:0 auto}
.or{display:flex;align-items:center;gap:8px;margin:8px 0}
.or hr{flex:1;border:none;border-top:1px solid #EEF3FB}
.or span{font-size:11px;color:#A8BAD8;white-space:nowrap}
.urow{display:flex;align-items:center;gap:8px;background:#EBF1FD;border-radius:10px;padding:10px 12px;margin-bottom:8px}
.uid{flex:1;font-family:monospace;font-size:13px;font-weight:600;color:#0B1F4B;word-break:break-all}
.cp{flex-shrink:0;padding:6px 12px;border-radius:8px;border:none;background:#2B5CE6;color:#fff;font-size:12px;font-weight:500;cursor:pointer}
.tip{background:#EBF1FD;border:1px solid #C7D9F8;border-radius:10px;padding:10px 12px;font-size:11.5px;color:#1e3a6e;line-height:1.7}
.pf{border-top:1px solid #EEF3FB;margin-top:10px;padding-top:10px}
.pl{font-size:12px;color:#2B5CE6;font-weight:500;cursor:pointer;text-align:center;margin-bottom:6px}
.pi{display:none}
.pi input{width:100%;padding:9px 12px;border:1.5px solid #DDE6F7;border-radius:8px;font-size:13px;margin-bottom:8px;outline:none}
.pr{display:flex;gap:8px}
.bc{flex:1;padding:9px;border:1px solid #e2e8f0;border-radius:8px;font-size:13px;cursor:pointer;background:#f8fafc;color:#64748b}
.bk{flex:2;padding:9px;background:#16a34a;color:#fff;border:none;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer}
.done{padding:40px 24px;text-align:center}
.ck{width:64px;height:64px;border-radius:50%;background:#f0fdf4;border:2px solid #bbf7d0;display:flex;align-items:center;justify-content:center;margin:0 auto 16px}
.ftr{background:#F4F7FE;border-top:1px solid #DDE6F7;padding:10px 20px;text-align:center;font-size:11px;color:#A8BAD8}
</style>
</head>
<body>
<div class="card">

<div class="hdr">
  <h1>${esc(churchName)}</h1>
  ${church.city ? `<p>${esc(church.city)}</p>` : ''}
  <div><span class="badge">${esc(req.member_name)}</span><span class="badge">${esc(req.months)} &middot; ${esc(req.fy)}</span></div>
</div>

<div id="ps">
<div class="body">
  <div class="lbl">Payment Details${slotLabel ? ' &#8212; ' + esc(slotLabel) : ''}</div>
  <div class="cats">
${catRowsHtml}
  </div>
  <div class="tbox">
    <div>
      <div class="tlbl">Total Payment</div>
      <div class="tamt">&#8377;${total.toLocaleString('en-IN')}</div>
    </div>
    <div style="background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.15);border-radius:8px;padding:5px 11px;font-size:11px;color:rgba(255,255,255,.6)">INR</div>
  </div>

  <div class="sec">
    <div class="steps">
      <div class="step"><div class="snum">1</div><div class="stxt">Tap Pay<br>with GPay</div></div>
      <div class="step"><div class="snum">2</div><div class="stxt">GPay opens<br>automatically</div></div>
      <div class="step"><div class="snum">3</div><div class="stxt">Confirm<br>payment</div></div>
    </div>

    <button class="btn bg" onclick="openGPay()">Pay &#8377;${total.toLocaleString('en-IN')} with GPay</button>

    <div class="qw">
      <img src="${qrDataUrl}" alt="UPI QR" width="220" height="220">
      <div style="font-size:11px;color:#64748b;margin-top:6px">Or scan QR in GPay &middot; PhonePe &middot; any UPI app</div>
    </div>

    <div class="or"><hr><span>or pay by UPI ID</span><hr></div>
    <div class="urow"><span class="uid">${esc(upiId)}</span><button class="cp" id="cb" onclick="copyUpi()">Copy</button></div>

    <div class="tip"><strong>Same phone?</strong> Tap <em>Pay with GPay</em> above &mdash; it will open GPay with the amount pre-filled.</div>

    <div class="pf">
      <div class="pl" onclick="togglePaid()">&#10003; I&#39;ve already paid &mdash; notify treasurer</div>
      <div class="pi" id="pf">
        <input type="text" id="ur" placeholder="UPI Transaction ID (optional)">
        <div class="pr">
          <button class="bc" onclick="togglePaid()">Cancel</button>
          <button class="bk" id="confirmBtn" onclick="markPaid()">Confirm &amp; Notify Treasurer</button>
        </div>
      </div>
    </div>
  </div>
</div>
</div>

<div id="dc" style="display:none">
  <div class="done">
    <div class="ck">
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#16a34a" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="20 6 9 17 4 12"/>
      </svg>
    </div>
    <h2 style="font-size:20px;font-weight:700;color:#0B1F4B;margin-bottom:8px">Payment Notified!</h2>
    <p style="font-size:13px;color:#64748b;line-height:1.6;margin-bottom:16px">
      Thank you, <strong>${esc(req.member_name)}</strong>. Your payment of
      <strong>&#8377;${total.toLocaleString('en-IN')}</strong> for
      <strong>${esc(req.months)}</strong> has been notified to the treasurer.
    </p>
    <div style="background:#f8fafc;border-radius:10px;padding:10px 14px;font-size:11px;color:#64748b">
      The treasurer will verify your payment and issue the official receipt shortly.
    </div>
  </div>
</div>

<div class="ftr">GPay &middot; PhonePe &middot; Any UPI app &middot; After paying tap &#8220;I&#39;ve already paid&#8221;</div>
</div>

<script>
var SB='${jsStr(SUPABASE_URL)}',KEY='${jsStr(SUPABASE_ANON_KEY)}',RID='${jsStr(req.id)}';

function openGPay(){
  var id='${jsStr(upiId)}',pn=encodeURIComponent('${jsStr(churchName)}'),amt='${parseFloat(total)}';
  var gp='gpay://upi/pay?pa='+id+'&pn='+pn+'&am='+amt+'&cu=INR';
  var up='upi://pay?pa='+id+'&pn='+pn+'&am='+amt+'&cu=INR';
  var f=document.createElement('iframe');f.style.display='none';f.src=gp;document.body.appendChild(f);
  setTimeout(function(){window.location.href=up;},600);
}

function copyUpi(){
  var id='${jsStr(upiId)}',b=document.getElementById('cb');
  function done(){b.textContent='Copied!';b.style.background='#16a34a';setTimeout(function(){b.textContent='Copy';b.style.background='#2B5CE6';},2500);}
  if(navigator.clipboard){navigator.clipboard.writeText(id).then(done).catch(fb);}else{fb();}
  function fb(){var t=document.createElement('textarea');t.value=id;t.style.cssText='position:fixed;opacity:0;';document.body.appendChild(t);t.select();document.execCommand('copy');document.body.removeChild(t);done();}
}

function togglePaid(){
  var d=document.getElementById('pf');
  d.style.display=(d.style.display==='block')?'none':'block';
}

function markPaid(){
  var ref=document.getElementById('ur').value.trim(),b=document.getElementById('confirmBtn');
  b.textContent='Saving…';b.disabled=true;
  fetch(SB+'/rest/v1/payment_requests?id=eq.'+RID,{
    method:'PATCH',
    headers:{'Content-Type':'application/json','apikey':KEY,'Authorization':'Bearer '+KEY,'Prefer':'return=minimal'},
    body:JSON.stringify({status:'paid_by_member',paid_at:new Date().toISOString(),upi_ref:ref||null,grand_total:${total},updated_at:new Date().toISOString()})
  }).then(function(r){
    if(r.ok||r.status===204){
      document.getElementById('ps').style.display='none';
      document.getElementById('dc').style.display='block';
    } else {
      r.text().then(function(t){alert('Error: '+t);b.textContent='Confirm';b.disabled=false;});
    }
  }).catch(function(e){alert('Error: '+e.message);b.textContent='Confirm';b.disabled=false;});
}
</script>
</body>
</html>`
}
