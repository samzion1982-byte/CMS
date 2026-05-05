import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

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
    const { amount, memberName, whatsapp, requestId, memberId, payUrl } = await req.json()

    const keyId     = Deno.env.get('RAZORPAY_KEY_ID')
    const keySecret = Deno.env.get('RAZORPAY_KEY_SECRET')
    if (!keyId || !keySecret) throw new Error('Razorpay credentials not configured')

    // Build customer — contact must be E.164 format
    const customer: Record<string, string> = { name: memberName || 'Member' }
    if (whatsapp) {
      const digits = String(whatsapp).replace(/\D/g, '')
      if (digits.length === 10)       customer.contact = `+91${digits}`
      else if (digits.length >= 11)   customer.contact = `+${digits}`
    }

    const body = {
      upi_link:         true,          // UPI-specific payment link — shows GPay/PhonePe directly
      amount:           Math.round(Number(amount) * 100),   // paise
      currency:         'INR',
      accept_partial:   false,
      description:      `Payment request — ${memberName || 'Member'}`,
      customer,
      notify:           { sms: false, email: false },
      reminder_enable:  false,
      notes:            { payment_request_id: requestId || '', member_id: memberId || '' },
      ...(payUrl && { callback_url: payUrl, callback_method: 'get' }),
    }

    const resp = await fetch('https://api.razorpay.com/v1/payment_links', {
      method:  'POST',
      headers: {
        'Authorization': `Basic ${btoa(`${keyId}:${keySecret}`)}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify(body),
    })

    const data = await resp.json()
    if (!resp.ok) throw new Error(`Razorpay ${resp.status}: ${data?.error?.description || JSON.stringify(data)}`)

    return json({ short_url: data.short_url, id: data.id })
  } catch (err) {
    console.error('[create-razorpay-link]', err)
    return json({ error: (err as Error).message }, 400)
  }
})
