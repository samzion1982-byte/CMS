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

  // A5 dimensions
  const PW = 148, PH = 210
  const ML = 8,   MR = 8
  const CW = PW - ML - MR   // 132 mm

  // ── Colour palette (matches screenshot) ──────────────────────────
  const NAVY    = [30,  58,  95]   // church name, cell values, non-alt S.No
  const RED     = [192, 0,   0]    // location, labels, total amount
  const BANNER  = [31,  73,  125]  // Payment Receipt banner bg
  const TBL_HDR = [0,   112, 192]  // table column header bg
  const ROW_BG  = [217, 226, 243]  // alternating row tint
  const ORANGE  = [226, 107, 10]   // S.No on tinted rows
  const WHITE   = [255, 255, 255]
  const LIGHT   = [235, 241, 252]  // footer row bg

  // ── Load seal early ───────────────────────────────────────────────
  let sealB64 = null
  if (church?.treasurer_seal_url) sealB64 = await toBase64(church.treasurer_seal_url)

  // ── Outer border ──────────────────────────────────────────────────
  doc.setDrawColor(0, 0, 0)
  doc.setLineWidth(0.6)
  doc.rect(4, 4, PW - 8, PH - 8, 'S')

  let y = 8

  // ── Bible verse ───────────────────────────────────────────────────
  doc.setFont('helvetica', 'italic')
  doc.setFontSize(5.5)
  doc.setTextColor(...RED)
  const verseFull = '"Each one must give as he has decided in his heart, not reluctantly or under compulsion, for God loves a cheerful giver."  2 Cor 9:-7'
  const verseLines = doc.splitTextToSize(verseFull, CW - 4)
  verseLines.forEach((line, i) => doc.text(line, PW / 2, y + i * 3.2, { align: 'center' }))
  y += verseLines.length * 3.2 + 1

  // ── Church name ───────────────────────────────────────────────────
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(15)
  doc.setTextColor(...NAVY)
  doc.text(church?.church_name || 'Church', PW / 2, y, { align: 'center' })
  y += 6.5

  // ── Location ──────────────────────────────────────────────────────
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(...RED)
  const locBase = [church?.address, church?.city].filter(Boolean).join(', ')
  const loc = locBase + (church?.pincode ? ' - ' + church.pincode : '')
  doc.text(loc, PW / 2, y, { align: 'center' })
  y += 4

  // Divider
  doc.setDrawColor(...NAVY)
  doc.setLineWidth(0.5)
  doc.line(ML, y, PW - MR, y)
  y += 3

  // ── "Payment Receipt" banner ──────────────────────────────────────
  doc.setFillColor(...BANNER)
  doc.rect(ML, y, CW, 8, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(...WHITE)
  doc.text('Payment Receipt', PW / 2, y + 5.5, { align: 'center' })
  y += 10

  // ── Info row helpers ──────────────────────────────────────────────
  const IH = 7.5   // info row height

  function lbl(txt, x, ry) {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.setTextColor(...RED)
    doc.text(txt, x, ry + 5)
  }
  function val(txt, x, ry) {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(...NAVY)
    doc.text(String(txt || ''), x, ry + 5)
  }
  function rowBox(ry, h = IH) {
    doc.setDrawColor(160, 160, 160); doc.setLineWidth(0.25)
    doc.rect(ML, ry, CW, h, 'S')
  }
  function vl(x, ry, h = IH) {
    doc.setDrawColor(160, 160, 160); doc.setLineWidth(0.25)
    doc.line(x, ry, x, ry + h)
  }

  // Row 1: Member ID | Member Name
  rowBox(y)
  vl(ML + CW / 2, y)
  lbl('Member ID  :',    ML + 2,            y)
  val(receipt.member_id,  ML + 22,           y)
  lbl('Member Name  :',  ML + CW / 2 + 2,   y)
  val(receipt.member_name, ML + CW / 2 + 24, y)
  y += IH

  // Row 2: Receipt No | Date | Months Paid
  const c3 = CW / 3
  rowBox(y)
  vl(ML + c3, y); vl(ML + c3 * 2, y)
  lbl('Receipt No  :', ML + 2, y)
  val(receipt.receipt_number, ML + 20, y)
  const dp = (receipt.receipt_date || '').split('-')
  lbl('Date  :', ML + c3 + 2, y)
  val(dp.length === 3 ? `${dp[2]}-${dp[1]}-${dp[0]}` : '', ML + c3 + 13, y)
  lbl('Months Paid  :', ML + c3 * 2 + 2, y)
  val(formatMonthsPaid(receipt.month_paid), ML + c3 * 2 + 22, y)
  y += IH

  // Row 3: Payment Type | Cheque/DD/Trans.No
  rowBox(y)
  vl(ML + CW / 2, y)
  lbl('Payment Type  :', ML + 2, y)
  val(receipt.payment_mode, ML + 25, y)
  lbl('Cheque / DD / Trans.No  :', ML + CW / 2 + 2, y)
  val([receipt.cheque_dd_no, receipt.transaction_date].filter(Boolean).join(' / '), ML + CW / 2 + 38, y)
  y += IH + 2

  // ── Table ─────────────────────────────────────────────────────────
  // Column widths: 9+60+22+20+21 = 132
  const cSNo=9, cDsc=60, cAmt=22, cMos=20, cTot=21

  // Header row
  doc.setFillColor(...TBL_HDR)
  doc.rect(ML, y, CW, 7, 'F')
  doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(...WHITE)
  let cx = ML
  ;[
    [cSNo, 'S.No'], [cDsc, 'Particulars'], [cAmt, 'Amount'], [cMos, 'Months'], [cTot, 'Total'],
  ].forEach(([w, label]) => {
    doc.text(label, cx + w / 2, y + 4.8, { align: 'center' })
    cx += w
  })
  y += 7

  // Data rows
  const RH = 5.5
  const imap = {}
  ;(receiptItems || []).forEach(it => { imap[it.category_id] = it })

  ;(categories || []).forEach((cat, i) => {
    const it      = imap[cat.id]
    const amt     = it?.amt   ? Number(it.amt).toLocaleString('en-IN')   : ''
    const mos     = it?.months ? (Number(it.months) === 1 ? '1 Month' : `${it.months} Months`) : ''
    const tot     = it?.total ? Number(it.total).toLocaleString('en-IN') : ''
    const tinted  = i % 2 === 0

    if (tinted) { doc.setFillColor(...ROW_BG); doc.rect(ML, y, CW, RH, 'F') }
    doc.setDrawColor(190, 190, 190); doc.setLineWidth(0.2)
    doc.rect(ML, y, CW, RH, 'S')
    let dx = ML
    ;[cSNo, cDsc, cAmt, cMos].forEach(w => { dx += w; doc.line(dx, y, dx, y + RH) })

    const ty = y + 3.8

    // S.No — orange on tinted rows, navy on white
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5)
    doc.setTextColor(...(tinted ? ORANGE : NAVY))
    doc.text(String(i + 1), ML + cSNo / 2, ty, { align: 'center' })

    // Particulars
    doc.setTextColor(...NAVY)
    doc.text(cat.name || '', ML + cSNo + 2, ty)

    // Amount
    doc.setFont('helvetica', amt ? 'bold' : 'normal')
    doc.text(amt, ML + cSNo + cDsc + cAmt - 1.5, ty, { align: 'right' })

    // Months
    doc.setFont('helvetica', 'normal')
    doc.text(mos, ML + cSNo + cDsc + cAmt + cMos / 2, ty, { align: 'center' })

    // Total
    doc.setFont('helvetica', tot ? 'bold' : 'normal')
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
  const wordsText = amountInWords(receipt.grand_total || 0)
  doc.text(doc.splitTextToSize(wordsText, divX - ML - 3), ML + 2, y + 4.5)

  doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(...RED)
  doc.text(Number(receipt.grand_total || 0).toLocaleString('en-IN'), ML + CW - 1.5, y + 4.8, { align: 'right' })
  y += FH + 5

  // ── Treasurer seal (fixed to bottom-right area) ───────────────────
  const sealY = PH - 14 - 28   // always near bottom
  if (sealB64) {
    doc.addImage(sealB64, ML + CW - 28, sealY, 28, 28)
  }

  // ── Timestamp ─────────────────────────────────────────────────────
  doc.setFont('helvetica', 'normal'); doc.setFontSize(5.5); doc.setTextColor(160, 160, 160)
  const now   = new Date()
  const stamp = now.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' })
    + '  ' + now.toLocaleTimeString('en-IN', { hour12: false })
  doc.text(stamp, PW - MR, PH - 6, { align: 'right' })

  return doc.output('blob')
}
