/* ═══════════════════════════════════════════════════════════════
   whatsapp.js — WhatsApp API abstraction (Soft7 unofficial + Meta official)
   ═══════════════════════════════════════════════════════════════ */

const SOFT7_BASE = 'https://cloud.soft7.in/api/send'

function normalizePhone(raw) {
  if (!raw) return ''
  return String(raw).replace(/\D/g, '')
}

export async function sendWhatsAppMessage(church, { to, message, mediaUrl }) {
  if (!to) throw new Error('Recipient number is required')
  const phone = normalizePhone(to)
  const apiType = church?.whatsapp_api_type || 'soft7'
  return apiType === 'official'
    ? sendOfficial(church, { to: phone, message, mediaUrl })
    : sendSoft7(church, { to: phone, message, mediaUrl })
}

async function sendSoft7(church, { to, message, mediaUrl }) {
  const payload = {
    number: to,
    type: mediaUrl ? 'media' : 'text',
    message: message || '',
    instance_id: church.instance_id,
    access_token: church.access_token,
    ...(mediaUrl && { media_url: mediaUrl }),
  }
  const resp = await fetch(`${SOFT7_BASE}?number=${to}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!resp.ok) {
    const text = await resp.text()
    throw new Error(`Soft7 API error ${resp.status}: ${text}`)
  }
  return resp.json().catch(() => ({ ok: true }))
}

async function sendOfficial(church, { to, message, mediaUrl }) {
  const phoneId = church.official_phone_number_id
  const token   = church.official_bearer_token
  if (!phoneId || !token) throw new Error('Official WhatsApp API credentials not configured')

  const body = mediaUrl
    ? { messaging_product: 'whatsapp', to, type: 'image',
        image: { link: mediaUrl, caption: message || '' } }
    : { messaging_product: 'whatsapp', to, type: 'text',
        text: { body: message || '' } }

  const resp = await fetch(
    `https://graph.facebook.com/v18.0/${phoneId}/messages`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    }
  )
  if (!resp.ok) {
    const text = await resp.text()
    throw new Error(`Official API error ${resp.status}: ${text}`)
  }
  return resp.json().catch(() => ({ ok: true }))
}
