/* ═══════════════════════════════════════════════════════════════
   generate-payment-pdf — Server-side PDF generation with deep-link support
   Uses pdf-lib for better Android PDF viewer compatibility
   ═══════════════════════════════════════════════════════════════ */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.1'
import { PDFDocument, PDFPage, rgb } from 'https://esm.sh/pdf-lib@1.17.1'

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const { req: paymentReq, church, catMap } = await req.json()

    if (!paymentReq?.id) throw new Error('Payment request ID required')
    if (!church?.upi_id) throw new Error('Church UPI ID required')
    if (!catMap) throw new Error('Category map required')

    const pdfDoc = await PDFDocument.create()
    const page = pdfDoc.addPage([595, 842]) // A4 size

    const total = paymentReq.grand_total
    const upiId = (church.upi_id || '').trim()
    const churchName = church.church_name || 'Church'
    const W = 595

    // URLs with raw @ (no encoding)
    const gpayUrl = `gpay://upi/pay?pa=${upiId}&pn=${encodeURIComponent(churchName)}&am=${total}&cu=INR&tn=ChurchOffering`
    const upiUrl = `upi://pay?pa=${upiId}&pn=${encodeURIComponent(churchName)}&am=${total}&cu=INR&tn=ChurchOffering`

    // Header background
    page.drawRectangle({
      x: 0, y: 812, width: W, height: 30,
      color: rgb(11/255, 31/255, 75/255),
    })

    // Church name
    page.drawText(churchName, {
      x: W / 2, y: 820, size: 17, color: rgb(1, 1, 1),
      alignment: 'center',
    })

    page.drawText('Payment Request', {
      x: W / 2, y: 809, size: 10, color: rgb(1, 1, 1),
      alignment: 'center',
    })

    // Member info
    let y = 770
    page.drawText('Dear ' + (paymentReq.member_name || 'Member'), {
      x: 15, y, size: 12, color: rgb(0, 0, 0),
    })

    y -= 10
    page.drawText('Period: ' + (paymentReq.months || ''), {
      x: 15, y, size: 10, color: rgb(0, 0, 0),
    })

    // Categories
    y -= 20
    const catRows = Object.entries(paymentReq.amounts || {}).map(([cid, rate]: [string, unknown]) => ({
      name: catMap[cid] || 'Category',
      amount: (parseFloat(rate as string) || 0) * (paymentReq.slot || 1),
    }))

    catRows.forEach(({ name, amount }) => {
      page.drawText(name + ':', { x: 15, y, size: 10 })
      page.drawText('Rs. ' + amount.toLocaleString('en-IN'), {
        x: 500, y, size: 10, alignment: 'right',
      })
      y -= 8
    })

    // Total
    y -= 5
    page.drawText('Total Amount: Rs. ' + total.toLocaleString('en-IN'), {
      x: 15, y, size: 12, color: rgb(11/255, 31/255, 75/255),
    })

    // GPay button with link
    y -= 25
    const btnX = 20, btnW = W - 40, btnH = 16
    page.drawRectangle({
      x: btnX, y: y - btnH, width: btnW, height: btnH,
      color: rgb(11/255, 31/255, 75/255),
    })

    page.drawText('Tap here to Pay Rs. ' + total.toLocaleString('en-IN') + ' with GPay', {
      x: W / 2, y: y - btnH + 4, size: 13, color: rgb(1, 1, 1),
      alignment: 'center',
    })

    // Add clickable link area (using URI annotation)
    page.drawLinkToUrl(gpayUrl, {
      x: btnX, y: y - btnH, width: btnW, height: btnH,
      color: rgb(0, 0, 0), underline: false,
    })

    // PhonePe / UPI link
    y -= 20
    page.drawRectangle({
      x: btnX, y: y - 12, width: btnW, height: 12,
      color: rgb(240/255, 244/255, 255/255),
    })

    page.drawText('PhonePe / other UPI app', {
      x: W / 2, y: y - 8, size: 10, color: rgb(43/255, 92/255, 230/255),
      alignment: 'center',
    })

    page.drawLinkToUrl(upiUrl, {
      x: btnX, y: y - 12, width: btnW, height: 12,
      color: rgb(0, 0, 0), underline: false,
    })

    // UPI ID
    y -= 20
    page.drawText('UPI ID: ' + upiId, {
      x: W / 2, y, size: 9, color: rgb(80/255, 80/255, 80/255),
      alignment: 'center',
    })

    // Footer
    page.drawText('Thank you for your contribution.', {
      x: W / 2, y: 10, size: 8, color: rgb(150/255, 150/255, 150/255),
      alignment: 'center',
    })

    // Generate PDF bytes
    const pdfBytes = await pdfDoc.save()

    // Upload to Supabase Storage
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') || '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    )

    const filename = `payment-${paymentReq.id}.pdf`
    const { error: upErr } = await supabase.storage
      .from('payment-pages')
      .upload(filename, pdfBytes, {
        contentType: 'application/pdf',
        upsert: true,
        cacheControl: '86400',
      })

    if (upErr) throw new Error(`PDF upload failed: ${upErr.message}`)

    const { data } = supabase.storage.from('payment-pages').getPublicUrl(filename)
    return json({ publicUrl: data.publicUrl })

  } catch (err) {
    console.error(err)
    return json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      500
    )
  }
})
