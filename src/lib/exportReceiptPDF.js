/* ═══════════════════════════════════════════════════════════════
   exportReceiptPDF.js — Payment receipt PDF (A5 portrait)
   ═══════════════════════════════════════════════════════════════ */

const FY_MONTHS = ['April','May','June','July','August','September','October','November','December','January','February','March']
const FY_MON_S  = ['Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec','Jan','Feb','Mar']

export function formatMonthsPaid(monthPaid) {
  if (!monthPaid) return ''
  const parts = monthPaid.split(',').map(s => s.trim()).filter(Boolean)
  if (parts.length === 0) return ''
  if (parts.length === 1) {
    const idx = FY_MONTHS.findIndex(m => m.toLowerCase() === parts[0].toLowerCase())
    return idx >= 0 ? FY_MON_S[idx] : parts[0]
  }
  const indices = parts
    .map(p => FY_MONTHS.findIndex(m => m.toLowerCase() === p.toLowerCase()))
    .filter(i => i >= 0)
  indices.sort((a, b) => a - b)
  if (indices.length < 2) return parts.join(', ')
  const isConsecutive = indices.every((v, i, arr) => i === 0 || v === arr[i - 1] + 1)
  if (isConsecutive && indices.length >= 3) {
    return `${FY_MON_S[indices[0]]} - ${FY_MON_S[indices[indices.length - 1]]}`
  }
  return indices.map(i => FY_MON_S[i]).join(', ')
}

// ── Amount in words (Indian) ──────────────────────────────────────
const _ones = ['','One','Two','Three','Four','Five','Six','Seven','Eight','Nine',
  'Ten','Eleven','Twelve','Thirteen','Fourteen','Fifteen','Sixteen','Seventeen','Eighteen','Nineteen']
const _tens = ['','','Twenty','Thirty','Forty','Fifty','Sixty','Seventy','Eighty','Ninety']

function _inWords(n) {
  if (n === 0)        return ''
  if (n < 20)         return _ones[n]
  if (n < 100)        return _tens[Math.floor(n / 10)] + (n % 10 ? ' ' + _ones[n % 10] : '')
  if (n < 1000)       return _ones[Math.floor(n / 100)] + ' Hundred' + (n % 100 ? ' ' + _inWords(n % 100) : '')
  if (n < 100000)     return _inWords(Math.floor(n / 1000)) + ' Thousand' + (n % 1000 ? ' ' + _inWords(n % 1000) : '')
  if (n < 10000000)   return _inWords(Math.floor(n / 100000)) + ' Lakh' + (n % 100000 ? ' ' + _inWords(n % 100000) : '')
  return _inWords(Math.floor(n / 10000000)) + ' Crore' + (n % 10000000 ? ' ' + _inWords(n % 10000000) : '')
}

function amountInWords(amount) {
  const n = Math.round(Number(amount) || 0)
  return n === 0 ? '(Rupees Zero Only)' : `(Rupees ${_inWords(n)} Only)`
}

// ── Image → base64 ────────────────────────────────────────────────
async function toBase64(url) {
  try {
    const blob = await fetch(url).then(r => r.blob())
    return await new Promise((res, rej) => {
      const reader = new FileReader()
      reader.onloadend = () => res(reader.result)
      reader.onerror  = rej
      reader.readAsDataURL(blob)
    })
  } catch { return null }
}

// ── Main export ───────────────────────────────────────────────────
export async function exportReceiptPDF({ receipt, receiptItems, categories, church }) {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a5' })

  // A5: 148 × 210 mm
  const PW = 148, PH = 210

  // ── Colour palette ────────────────────────────────────────────────
  const NAVY   = [30,  58,  95]
  const MAROON = [128, 0,   0]
  const BANNER = [0,   112, 192]
  const TBL_H  = [0,   112, 192]
  const ROW_BG = [217, 226, 243]
  const WHITE  = [255, 255, 255]
  const LIGHT  = [235, 241, 252]

  // ── Load seal early ───────────────────────────────────────────────
  let sealB64 = null
  if (church?.treasurer_seal_url) sealB64 = await toBase64(church.treasurer_seal_url)

  // ── Page border — outer medium + inner thin, both navy
  doc.setDrawColor(...NAVY)
  doc.setLineWidth(0.9)
  doc.rect(12, 12, PW - 24, PH - 24, 'S')
  doc.setLineWidth(0.28)
  doc.rect(13.5, 13.5, PW - 27, PH - 27, 'S')

  // Content margins
  const ML  = 17
  const MR  = 17
  const CW  = PW - ML - MR   // 114 mm
  const BL  = 13.5            // inner border left  x — divider meets inner rule
  const BR  = PW - 13.5      // inner border right x

  let y = 18   // start just inside inner border

  // ── Bible verse — fixed 2 lines, 6pt ─────────────────────────────
  doc.setFont('helvetica', 'italic')
  doc.setFontSize(6)
  doc.setTextColor(...MAROON)
  doc.text('"Each one must give as he has decided in his heart,', PW / 2, y, { align: 'center' })
  doc.text('not reluctantly or under compulsion, for God loves a cheerful giver."  2 Cor 9:-7', PW / 2, y + 3.5, { align: 'center' })
  y += 3.5 + 9   // 2 lines + gap before church name

  // ── Church name — bold serif (Times) for a thick, stylish look ───
  doc.setFont('times', 'bold')
  doc.setFontSize(20)
  doc.setTextColor(...NAVY)
  doc.text(church?.church_name || 'Church', PW / 2, y, { align: 'center' })
  y += 6

  // ── Location ──────────────────────────────────────────────────────
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(...MAROON)
  const locBase = [church?.address, church?.city].filter(Boolean).join(', ')
  const loc = locBase + (church?.pincode ? ' - ' + church.pincode : '')
  doc.text(loc, PW / 2, y, { align: 'center' })
  y += 5

  // ── Divider — from inner border left to inner border right ────────
  doc.setDrawColor(...NAVY)
  doc.setLineWidth(0.6)
  doc.line(BL, y, BR, y)
  y += 3

  // ── "Payment Receipt" banner ──────────────────────────────────────
  doc.setFillColor(...BANNER)
  doc.roundedRect(ML, y, CW, 9, 2.5, 2.5, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  doc.setTextColor(...WHITE)
  doc.text('Payment Receipt', PW / 2, y + 6.2, { align: 'center' })
  y += 12

  // ── Info row helpers ──────────────────────────────────────────────
  const IH = 8   // info row height

  function lbl(txt, x, ry) {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.setTextColor(...MAROON)
    doc.text(txt, x, ry + 5.2)
  }
  function val(txt, x, ry) {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(...NAVY)
    doc.text(String(txt || ''), x, ry + 5.2)
  }
  function rowBox(ry, h = IH) {
    doc.setDrawColor(160, 160, 160); doc.setLineWidth(0.25)
    doc.rect(ML, ry, CW, h, 'S')
  }
  function vl(x, ry, h = IH) {
    doc.setDrawColor(160, 160, 160); doc.setLineWidth(0.25)
    doc.line(x, ry, x, ry + h)
  }

  // Row 1: Member ID (narrow left) | Member Name (wider right)
  const rMI = 36   // member ID column width; name gets CW-36 = 78 mm
  rowBox(y)
  vl(ML + rMI, y)
  lbl('Member ID  :',      ML + 2,          y)
  val(receipt.member_id,   ML + 21,          y)
  lbl('Member Name  :',    ML + rMI + 2,    y)
  val(receipt.member_name, ML + rMI + 25,   y)
  y += IH

  // Row 2: Receipt No | Date | Months Paid  (unequal widths to avoid overflow)
  const rC1 = 46, rC2 = 34, rC3 = 34   // sum = 114 = CW
  rowBox(y)
  vl(ML + rC1, y); vl(ML + rC1 + rC2, y)
  lbl('Receipt No  :', ML + 2, y)
  val(receipt.receipt_number, ML + 19, y)
  const dp = (receipt.receipt_date || '').split('-')
  lbl('Date  :', ML + rC1 + 2, y)
  val(dp.length === 3 ? `${dp[2]}-${dp[1]}-${dp[0]}` : '', ML + rC1 + 12, y)
  lbl('Months Paid  :', ML + rC1 + rC2 + 2, y)
  val(formatMonthsPaid(receipt.month_paid), ML + rC1 + rC2 + 21, y)
  y += IH

  // Row 3: Payment Type | Cheque/DD/Trans.No
  rowBox(y)
  vl(ML + CW / 2, y)
  lbl('Payment Type  :', ML + 2, y)
  val(receipt.payment_mode, ML + 24, y)
  lbl('Cheque / DD / Trans.No  :', ML + CW / 2 + 2, y)
  val([receipt.cheque_dd_no, receipt.transaction_date].filter(Boolean).join(' / '),
      ML + CW / 2 + 37, y)
  y += IH + 2

  // ── Table ─────────────────────────────────────────────────────────
  // Column widths: 8+50+20+19+17 = 114
  const cSNo=8, cDsc=50, cAmt=20, cMos=19, cTot=17

  // Header
  doc.setFillColor(...TBL_H)
  doc.rect(ML, y, CW, 7, 'F')
  doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(...WHITE)
  let cx = ML
  ;[[cSNo,'S.No'],[cDsc,'Particulars'],[cAmt,'Amount'],[cMos,'Months'],[cTot,'Total']]
    .forEach(([w, label]) => {
      doc.text(label, cx + w / 2, y + 4.8, { align: 'center' })
      cx += w
    })
  y += 7

  // Data rows
  const RH = 5.0
  const imap = {}
  ;(receiptItems || []).forEach(it => { imap[it.category_id] = it })

  ;(categories || []).forEach((cat, i) => {
    const it  = imap[cat.id]
    const amt = it?.amt   ? Number(it.amt).toLocaleString('en-IN')   : ''
    const mos = it?.months ? (Number(it.months) === 1 ? '1 Month' : `${it.months} Months`) : ''
    const tot = it?.total  ? Number(it.total).toLocaleString('en-IN') : ''

    if (i % 2 === 0) { doc.setFillColor(...ROW_BG); doc.rect(ML, y, CW, RH, 'F') }
    doc.setDrawColor(190, 190, 190); doc.setLineWidth(0.2)
    doc.rect(ML, y, CW, RH, 'S')
    let dx = ML
    ;[cSNo, cDsc, cAmt, cMos].forEach(w => { dx += w; doc.line(dx, y, dx, y + RH) })

    const ty = y + 3.3

    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(...NAVY)
    doc.text(String(i + 1), ML + cSNo / 2, ty, { align: 'center' })

    doc.setFontSize(7)
    doc.text(cat.name || '', ML + cSNo + 2, ty)

    doc.setFont('helvetica', amt ? 'bold' : 'normal'); doc.setFontSize(7.5)
    doc.text(amt, ML + cSNo + cDsc + cAmt - 1.5, ty, { align: 'right' })

    doc.setFont('helvetica', 'normal'); doc.setFontSize(7)
    doc.text(mos, ML + cSNo + cDsc + cAmt + cMos / 2, ty, { align: 'center' })

    doc.setFont('helvetica', tot ? 'bold' : 'normal'); doc.setFontSize(7.5)
    doc.text(tot, ML + CW - 1.5, ty, { align: 'right' })

    y += RH
  })

  // ── Footer row ────────────────────────────────────────────────────
  const FH = 7
  doc.setFillColor(...LIGHT)
  doc.rect(ML, y, CW, FH, 'F')
  doc.setDrawColor(150, 150, 150); doc.setLineWidth(0.25)
  doc.rect(ML, y, CW, FH, 'S')
  const divX = ML + cSNo + cDsc + cAmt + cMos
  doc.line(divX, y, divX, y + FH)

  doc.setFont('helvetica', 'italic'); doc.setFontSize(7); doc.setTextColor(50, 50, 50)
  doc.text(
    doc.splitTextToSize(amountInWords(receipt.grand_total || 0), divX - ML - 4),
    (ML + divX) / 2, y + 4.5,
    { align: 'center' }
  )

  doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(...MAROON)
  doc.text(Number(receipt.grand_total || 0).toLocaleString('en-IN'), ML + CW - 1.5, y + 4.8, { align: 'right' })
  y += FH + 1

  // ── Treasurer seal ────────────────────────────────────────────────
  if (sealB64) {
    doc.addImage(sealB64, ML + CW - 26, y, 26, 26)
    y += 28
  }

  // ── Timestamp ─────────────────────────────────────────────────────
  doc.setFont('helvetica', 'normal'); doc.setFontSize(5.5); doc.setTextColor(160, 160, 160)
  const now = new Date()
  const stamp = now.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' })
    + '  ' + now.toLocaleTimeString('en-IN', { hour12: false })
  doc.text(stamp, BR, PH - 5, { align: 'right' })

  return doc.output('blob')
}
