/* ═══════════════════════════════════════════════════════════════
   send-whatsapp — Server-side proxy for WhatsApp API calls
   Avoids CORS issues when calling Soft7 / Meta from the browser.
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
    const { to, message, mediaUrl, church } = await req.json()
    if (!to)     throw new Error('Recipient number is required')
    if (!church) throw new Error('Church config is required')

    const phone   = String(to).replace(/\D/g, '')
    const apiType = church.whatsapp_api_type || 'soft7'

    let result: unknown

    if (apiType === 'official') {
      const phoneId = church.official_phone_number_id
      const token   = church.official_bearer_token
      if (!phoneId || !token) throw new Error('Official WhatsApp API credentials not configured')

      const body = mediaUrl
        ? { messaging_product: 'whatsapp', to: phone, type: 'image',
            image: { link: mediaUrl, caption: message || '' } }
        : { messaging_product: 'whatsapp', to: phone, type: 'text',
            text: { body: message || '' } }

      const resp = await fetch(`https://graph.facebook.com/v18.0/${phoneId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      })
      if (!resp.ok) {
        const text = await resp.text()
        throw new Error(`Official API error ${resp.status}: ${text}`)
      }
      result = await resp.json().catch(() => ({ ok: true }))

    } else {
      // Soft7
      if (!church.instance_id || !church.access_token) throw new Error('Soft7 instance_id / access_token not configured')

      const payload = {
        number:       phone,
        type:         mediaUrl ? 'media' : 'text',
        message:      message || '',
        instance_id:  church.instance_id,
        access_token: church.access_token,
        ...(mediaUrl && { media_url: mediaUrl }),
      }
      const resp = await fetch(`https://cloud.soft7.in/api/send?number=${phone}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!resp.ok) {
        const text = await resp.text()
        throw new Error(`Soft7 API error ${resp.status}: ${text}`)
      }
      result = await resp.json().catch(() => ({ ok: true }))
    }

    return json(result)
  } catch (err) {
    console.error('[send-whatsapp]', err)
    return json({ error: (err as Error).message }, 400)
  }
})
