import { jsPDF } from 'jspdf'
import QRCodeLib from 'qrcode'
import { adminSupabase } from './supabase'

export async function generateAndUploadPaymentPdf({ req, church, catMap }) {
  const total      = req.grand_total
  const upiId      = (church.upi_id || '').trim()
  const churchName = church.church_name || 'Church'

  // Raw @ — PDF link annotations pass the URL directly to Android Intent (no HTML parsing)
  const gpayUrl = `gpay://upi/pay?pa=${upiId}&pn=${encodeURIComponent(churchName)}&am=${total}&cu=INR&tn=ChurchOffering`
  const upiUrl  = `upi://pay?pa=${upiId}&pn=${encodeURIComponent(churchName)}&am=${total}&cu=INR&tn=ChurchOffering`

  // QR as backup (same URL as upiUrl)
  const qrDataUrl = await QRCodeLib.toDataURL(upiUrl, {
    width: 280, margin: 2, color: { dark: '#0B1F4B', light: '#FFFFFF' },
  })

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const W = 210

  // ── Header ──────────────────────────────────────────────────────
  doc.setFillColor(11, 31, 75)
  doc.rect(0, 0, W, 30, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(17)
  doc.setFont('helvetica', 'bold')
  doc.text(churchName, W / 2, 13, { align: 'center' })
  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
  doc.text('Payment Request', W / 2, 22, { align: 'center' })

  // ── Member & period ─────────────────────────────────────────────
  doc.setTextColor(30, 30, 30)
  doc.setFontSize(12)
  doc.setFont('helvetica', 'bold')
  doc.text('Dear ' + (req.member_name || 'Member'), 15, 42)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.text('Period: ' + (req.months || ''), 15, 51)

  // ── Category breakdown ──────────────────────────────────────────
  const catRows = Object.entries(req.amounts || {}).map(([cid, rate]) => ({
    name:   catMap[cid] || 'Category',
    amount: (parseFloat(rate) || 0) * (req.slot || 1),
  }))

  let y = 60
  catRows.forEach(({ name, amount }) => {
    doc.setFont('helvetica', 'normal')
    doc.text(name + ':', 15, y)
    doc.text('₹' + amount.toLocaleString('en-IN'), 130, y, { align: 'right' })
    y += 8
  })

  doc.setDrawColor(200, 200, 200)
  doc.line(15, y, 130, y)
  y += 7

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  doc.text('Total Amount:', 15, y)
  doc.setTextColor(11, 31, 75)
  doc.text('₹' + total.toLocaleString('en-IN'), 130, y, { align: 'right' })
  y += 14

  // ── Pay with GPay button (PDF link annotation) ──────────────────
  const btnX = 20, btnW = W - 40, btnH = 16
  doc.setFillColor(11, 31, 75)
  doc.roundedRect(btnX, y, btnW, btnH, 4, 4, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(13)
  doc.setFont('helvetica', 'bold')
  doc.text('Tap here to Pay ₹' + total.toLocaleString('en-IN') + ' with GPay', W / 2, y + 10, { align: 'center' })
  // PDF link — fires gpay:// intent directly in the PDF viewer
  doc.link(btnX, y, btnW, btnH, { url: gpayUrl })
  y += btnH + 5

  // ── PhonePe / other UPI link ─────────────────────────────────────
  doc.setFillColor(240, 244, 255)
  doc.roundedRect(btnX, y, btnW, 12, 3, 3, 'F')
  doc.setTextColor(43, 92, 230)
  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
  doc.text('PhonePe / other UPI app', W / 2, y + 8, { align: 'center' })
  doc.link(btnX, y, btnW, 12, { url: upiUrl })
  y += 20

  // ── UPI ID ──────────────────────────────────────────────────────
  doc.setTextColor(80, 80, 80)
  doc.setFontSize(9)
  doc.text('UPI ID: ' + upiId, W / 2, y, { align: 'center' })
  y += 10

  // ── QR code (backup) ────────────────────────────────────────────
  doc.setFillColor(245, 247, 255)
  doc.roundedRect(70, y, 70, 78, 4, 4, 'F')
  doc.setTextColor(11, 31, 75)
  doc.setFontSize(9)
  doc.setFont('helvetica', 'bold')
  doc.text('Or scan QR in GPay / PhonePe', W / 2, y + 8, { align: 'center' })
  doc.addImage(qrDataUrl, 'PNG', 85, y + 11, 40, 40)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(120, 120, 120)
  doc.text('Amount pre-filled automatically', W / 2, y + 57, { align: 'center' })
  doc.setFontSize(7)
  doc.text('(Use a second device to scan)', W / 2, y + 63, { align: 'center' })

  // ── Footer ──────────────────────────────────────────────────────
  doc.setFontSize(8)
  doc.setTextColor(150, 150, 150)
  doc.text('Thank you for your contribution.', W / 2, 285, { align: 'center' })

  // ── Upload ──────────────────────────────────────────────────────
  const pdfBytes = doc.output('arraybuffer')
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
