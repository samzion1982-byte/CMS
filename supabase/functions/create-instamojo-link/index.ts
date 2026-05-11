/* ═══════════════════════════════════════════════════════════════
   create-instamojo-link — Creates an Instamojo payment request
   and returns the payment URL to send via WhatsApp.
   ═══════════════════════════════════════════════════════════════ */

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
    const { church, member_name, phone, amount, purpose } = await req.json()

    const apiKey   = church?.instamojo_api_key?.trim()
    const authToken = church?.instamojo_auth_token?.trim()
    if (!apiKey || !authToken) throw new Error('Instamojo API credentials not configured in Church Setup')

    const body = new URLSearchParams({
      purpose:                  purpose || 'Church Payment',
      amount:                   String(parseFloat(amount)),
      buyer_name:               member_name || '',
      phone:                    String(phone || '').replace(/\D/g, ''),
      send_sms:                 'False',
      send_email:               'False',
      allow_repeated_payments:  'False',
    })

    const resp = await fetch('https://api.instamojo.com/api/1.1/payment-requests/', {
      method:  'POST',
      headers: {
        'X-Api-Key':    apiKey,
        'X-Auth-Token': authToken,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    })

    const data = await resp.json()
    if (!resp.ok || !data.success) {
      throw new Error(data.message || data.error || `Instamojo error ${resp.status}`)
    }

    return json({ payment_url: data.payment_request.longurl, id: data.payment_request.id })
  } catch (err) {
    console.error('[create-instamojo-link]', err)
    return json({ error: (err as Error).message }, 400)
  }
})
