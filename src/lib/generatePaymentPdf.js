import { jsPDF } from 'jspdf'
import QRCodeLib from 'qrcode'
import { adminSupabase, SUPABASE_URL } from './supabase'

export async function generateAndUploadPaymentPdf({ req, church, catMap }) {
  const total      = req.grand_total
  const upiId      = (church.upi_id || '').trim()
  const churchName = church.church_name || 'Church'
  const pa         = upiId.replace('@', '%40')

  // UPI QR content (standard upi:// deep link)
  const upiContent = `upi://pay?pa=${pa}&am=${total}&cu=INR`

  // Generate QR as data URL
  const qrDataUrl = await QRCodeLib.toDataURL(upiContent, {
    width: 200, margin: 2, color: { dark: '#0B1F4B', light: '#FFFFFF' },
  })

  // Build PDF (A4)
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const W = 210

  // Header bar
  doc.setFillColor(11, 31, 75)   // dark navy
  doc.rect(0, 0, W, 28, 'F')

  doc.setTextColor(255, 255, 255)
  doc.setFontSize(16)
  doc.setFont('helvetica', 'bold')
  doc.text(churchName, W / 2, 12, { align: 'center' })

  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
  doc.text('Payment Request', W / 2, 21, { align: 'center' })

  // Member & amount section
  doc.setTextColor(30, 30, 30)
  doc.setFontSize(11)
  doc.setFont('helvetica', 'bold')
  doc.text('Dear ' + (req.member_name || 'Member'), 15, 40)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.text('Period: ' + (req.months || ''), 15, 50)

  // Category breakdown
  const catRows = Object.entries(req.amounts || {}).map(([cid, rate]) => ({
    name:   catMap[cid] || 'Category',
    amount: (parseFloat(rate) || 0) * (req.slot || 1),
  }))

  let y = 58
  catRows.forEach(({ name, amount }) => {
    doc.text(name + ':', 15, y)
    doc.text('₹' + amount.toLocaleString('en-IN'), 120, y, { align: 'right' })
    y += 7
  })

  // Divider
  doc.setDrawColor(200, 200, 200)
  doc.line(15, y, 120, y)
  y += 6

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  doc.text('Total Amount:', 15, y)
  doc.setTextColor(11, 31, 75)
  doc.text('₹' + total.toLocaleString('en-IN'), 120, y, { align: 'right' })
  doc.setTextColor(30, 30, 30)

  y += 12

  // QR code section
  doc.setFillColor(245, 247, 255)
  doc.roundedRect(55, y, 100, 115, 4, 4, 'F')

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(11, 31, 75)
  doc.text('Scan to Pay with UPI', W / 2, y + 10, { align: 'center' })

  doc.addImage(qrDataUrl, 'PNG', 80, y + 14, 50, 50)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(80, 80, 80)
  doc.text('UPI ID: ' + upiId, W / 2, y + 72, { align: 'center' })

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(30, 30, 30)
  doc.text('Open GPay / PhonePe → Scan QR → Pay', W / 2, y + 82, { align: 'center' })

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(120, 120, 120)
  doc.text('Amount will be pre-filled automatically', W / 2, y + 90, { align: 'center' })

  // Footer
  doc.setFontSize(8)
  doc.setTextColor(150, 150, 150)
  doc.text('Thank you for your contribution.', W / 2, 285, { align: 'center' })

  // Export as Uint8Array
  const pdfBytes = doc.output('arraybuffer')

  // Upload to Supabase Storage
  const filename = `payment-${req.id}.pdf`
  const { error: upErr } = await adminSupabase.storage.from('payment-pages').upload(filename, pdfBytes, {
    contentType:  'application/pdf',
    upsert:       true,
    cacheControl: '86400',
  })
  if (upErr) throw new Error(`PDF upload failed: ${upErr.message}`)

  const { data: urlData } = adminSupabase.storage.from('payment-pages').getPublicUrl(filename)
  return urlData.publicUrl
}
