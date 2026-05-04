/* ═══════════════════════════════════════════════════════════════
   exportReceiptPDF.js — Individual payment receipt PDF (A4 portrait)
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

// ── Amount in words (Indian numbering) ────────────────────────────
const _ones = ['','One','Two','Three','Four','Five','Six','Seven','Eight','Nine',
  'Ten','Eleven','Twelve','Thirteen','Fourteen','Fifteen','Sixteen','Seventeen','Eighteen','Nineteen']
const _tens = ['','','Twenty','Thirty','Forty','Fifty','Sixty','Seventy','Eighty','Ninety']

function _inWords(n) {
  if (n === 0) return ''
  if (n < 20)  return _ones[n]
  if (n < 100) return _tens[Math.floor(n / 10)] + (n % 10 ? ' ' + _ones[n % 10] : '')
  if (n < 1000)    return _ones[Math.floor(n / 100)] + ' Hundred' + (n % 100 ? ' ' + _inWords(n % 100) : '')
  if (n < 100000)  return _inWords(Math.floor(n / 1000)) + ' Thousand' + (n % 1000 ? ' ' + _inWords(n % 1000) : '')
  if (n < 10000000)return _inWords(Math.floor(n / 100000)) + ' Lakh' + (n % 100000 ? ' ' + _inWords(n % 100000) : '')
  return _inWords(Math.floor(n / 10000000)) + ' Crore' + (n % 10000000 ? ' ' + _inWords(n % 10000000) : '')
}

function amountInWords(amount) {
  const n = Math.round(Number(amount) || 0)
  if (n === 0) return '(Rupees Zero Only)'
  return `(Rupees ${_inWords(n)} Only)`
}

// ── Image → base64 ─────────────────────────────────────────────────
async function toBase64(url) {
  try {
    const res  = await fetch(url)
    const blob = await res.blob()
    return await new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onloadend = () => resolve(reader.result)
      reader.onerror  = reject
      reader.readAsDataURL(blob)
    })
  } catch {
    return null
  }
}

// ── Main export ─────────────────────────────────────────────────────
export async function exportReceiptPDF({ receipt, receiptItems, categories, church }) {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })

  const PW = 210, PH = 297
  const ML = 14, MR = 14
  const CW = PW - ML - MR  // 182mm

  let y = 12

  // ── Treasurer seal (load early so it's ready when we need it) ────
  let sealB64 = null
  if (church?.treasurer_seal_url) {
    sealB64 = await toBase64(church.treasurer_seal_url)
  }

  // ── Church header ────────────────────────────────────────────────
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(18)
  doc.setTextColor(30, 58, 95)
  doc.text(church?.church_name || 'Church', PW / 2, y, { align: 'center' })
  y += 8

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(180, 50, 50)
  const locParts = [church?.address, church?.city, church?.pincode ? '- ' + church.pincode : ''].filter(Boolean)
  doc.text(locParts.join(', '), PW / 2, y, { align: 'center' })
  y += 4

  doc.setDrawColor(30, 58, 95)
  doc.setLineWidth(0.6)
  doc.line(ML, y, PW - MR, y)
  y += 4

  // ── "Payment Receipt" banner ─────────────────────────────────────
  doc.setFillColor(0, 112, 192)
  doc.rect(ML, y, CW, 9, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(13)
  doc.setTextColor(255, 255, 255)
  doc.text('Payment Receipt', PW / 2, y + 6.2, { align: 'center' })
  y += 12

  // ── Helper: draw a bordered info row ────────────────────────────
  const BOX_H = 9
  function infoLabel(txt, x, rowY) {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.setTextColor(0, 0, 128)
    doc.text(txt, x, rowY + 5.8)
  }
  function infoValue(txt, x, rowY) {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    doc.setTextColor(20, 20, 20)
    doc.text(String(txt || ''), x, rowY + 5.8)
  }
  function boxBorder(bX, bY, w, h) {
    doc.setDrawColor(170, 170, 170)
    doc.setLineWidth(0.3)
    doc.rect(bX, bY, w, h, 'S')
  }
  function vDiv(x, bY, h) {
    doc.setDrawColor(170, 170, 170)
    doc.setLineWidth(0.3)
    doc.line(x, bY, x, bY + h)
  }

  // Row 1: Member ID | Member Name
  boxBorder(ML, y, CW, BOX_H)
  vDiv(ML + CW / 2, y, BOX_H)
  infoLabel('Member ID  :', ML + 3, y)
  infoValue(receipt.member_id || '', ML + 27, y)
  infoLabel('Member Name  :', ML + CW / 2 + 3, y)
  infoValue(receipt.member_name || '', ML + CW / 2 + 33, y)
  y += BOX_H + 1

  // Row 2: Receipt No | Date | Months Paid
  const col3 = CW / 3
  boxBorder(ML, y, CW, BOX_H)
  vDiv(ML + col3, y, BOX_H)
  vDiv(ML + col3 * 2, y, BOX_H)
  infoLabel('Receipt No  :', ML + 3, y)
  infoValue(receipt.receipt_number || '', ML + 27, y)
  const dParts = (receipt.receipt_date || '').split('-')
  const dateStr = dParts.length === 3 ? `${dParts[2]}-${dParts[1]}-${dParts[0]}` : ''
  infoLabel('Date  :', ML + col3 + 3, y)
  infoValue(dateStr, ML + col3 + 17, y)
  infoLabel('Months Paid  :', ML + col3 * 2 + 3, y)
  infoValue(formatMonthsPaid(receipt.month_paid), ML + col3 * 2 + 30, y)
  y += BOX_H + 1

  // Row 3: Payment Type | Cheque/DD/Trans.No
  boxBorder(ML, y, CW, BOX_H)
  vDiv(ML + CW / 2, y, BOX_H)
  infoLabel('Payment Type  :', ML + 3, y)
  infoValue(receipt.payment_mode || '', ML + 33, y)
  infoLabel('Cheque / DD / Trans.No  :', ML + CW / 2 + 3, y)
  const txnVal = [receipt.cheque_dd_no, receipt.transaction_date].filter(Boolean).join('  /  ')
  infoValue(txnVal, ML + CW / 2 + 53, y)
  y += BOX_H + 3

  // ── Table ────────────────────────────────────────────────────────
  const cSNo = 12, cDesc = 85, cAmt = 28, cMos = 27, cTot = 30
  // 12+85+28+27+30 = 182 ✓

  // Header row
  doc.setFillColor(0, 112, 192)
  doc.rect(ML, y, CW, 8, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(255, 255, 255)

  const cols = [
    { w: cSNo,  label: 'S.No',        align: 'center' },
    { w: cDesc, label: 'Particulars', align: 'left'   },
    { w: cAmt,  label: 'Amount',      align: 'right'  },
    { w: cMos,  label: 'Months',      align: 'center' },
    { w: cTot,  label: 'Total',       align: 'right'  },
  ]
  let cx = ML
  cols.forEach(col => {
    if (col.align === 'center') doc.text(col.label, cx + col.w / 2, y + 5.3, { align: 'center' })
    else if (col.align === 'right') doc.text(col.label, cx + col.w - 3, y + 5.3, { align: 'right' })
    else doc.text(col.label, cx + 3, y + 5.3)
    cx += col.w
  })
  y += 8

  // Data rows
  const ROW_H = 6.5
  const itemMap = {}
  ;(receiptItems || []).forEach(it => { itemMap[it.category_id] = it })

  ;(categories || []).forEach((cat, i) => {
    const it    = itemMap[cat.id]
    const amt   = it?.amt   ? Number(it.amt).toLocaleString('en-IN')   : ''
    const mosLabel = it?.months
      ? (Number(it.months) === 1 ? '1 Month' : `${it.months} Months`)
      : ''
    const total = it?.total ? Number(it.total).toLocaleString('en-IN') : ''

    if (i % 2 === 0) {
      doc.setFillColor(240, 247, 255)
      doc.rect(ML, y, CW, ROW_H, 'F')
    }
    doc.setDrawColor(200, 200, 200)
    doc.setLineWidth(0.2)
    doc.rect(ML, y, CW, ROW_H, 'S')

    let dx = ML
    cols.forEach(col => { dx += col.w; doc.line(dx, y, dx, y + ROW_H) })
    // remove last right line (already on box border)

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(40, 40, 40)

    cx = ML
    doc.text(String(i + 1), cx + cSNo / 2, y + 4.3, { align: 'center' }); cx += cSNo
    doc.text(cat.name || '', cx + 3, y + 4.3); cx += cDesc
    if (amt) { doc.setFont('helvetica', 'bold') } else { doc.setFont('helvetica', 'normal') }
    doc.text(amt, cx + cAmt - 3, y + 4.3, { align: 'right' }); cx += cAmt
    doc.setFont('helvetica', 'normal')
    doc.text(mosLabel, cx + cMos / 2, y + 4.3, { align: 'center' }); cx += cMos
    if (total) { doc.setFont('helvetica', 'bold') } else { doc.setFont('helvetica', 'normal') }
    doc.text(total, cx + cTot - 3, y + 4.3, { align: 'right' })

    y += ROW_H
  })

  // ── Total footer row ─────────────────────────────────────────────
  const FOOT_H = 8
  doc.setFillColor(232, 240, 254)
  doc.rect(ML, y, CW, FOOT_H, 'F')
  doc.setDrawColor(150, 150, 150)
  doc.setLineWidth(0.3)
  doc.rect(ML, y, CW, FOOT_H, 'S')
  const divX = ML + cSNo + cDesc + cAmt + cMos
  doc.line(divX, y, divX, y + FOOT_H)

  const words = amountInWords(receipt.grand_total || 0)
  doc.setFont('helvetica', 'italic')
  doc.setFontSize(8.5)
  doc.setTextColor(50, 50, 50)
  const wrappedWords = doc.splitTextToSize(words, divX - ML - 4)
  doc.text(wrappedWords, ML + 3, y + 5.2)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(0, 0, 0)
  doc.text(
    Number(receipt.grand_total || 0).toLocaleString('en-IN'),
    ML + CW - 3, y + 5.5, { align: 'right' }
  )
  y += FOOT_H + 10

  // ── Treasurer seal ───────────────────────────────────────────────
  if (sealB64) {
    const SW = 36, SH = 36
    doc.addImage(sealB64, ML + CW - SW, y, SW, SH)
    y += SH + 4
  }

  // ── Footer timestamp ─────────────────────────────────────────────
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7)
  doc.setTextColor(160, 160, 160)
  const now   = new Date()
  const stamp = now.toLocaleDateString('en-IN', { day:'2-digit', month:'2-digit', year:'numeric' })
            + '  ' + now.toLocaleTimeString('en-IN', { hour12: false })
  doc.text(stamp, PW - MR, PH - 7, { align: 'right' })

  doc.save(`Receipt_${receipt.receipt_number || 'PDF'}.pdf`)
}
