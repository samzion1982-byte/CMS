/* ═══════════════════════════════════════════════════════════════
   whatsapp.js — Routes all WhatsApp sends through the
   send-whatsapp Edge Function to avoid browser CORS restrictions.
   ═══════════════════════════════════════════════════════════════ */

import { SUPABASE_URL, SUPABASE_ANON_KEY } from './supabase'

const EDGE_FN = `${SUPABASE_URL}/functions/v1/send-whatsapp`

export function normalizeWhatsAppNumber(raw, { provider = 'soft7', defaultCountry = '91' } = {}) {
  const digits = String(raw || '').replace(/\D/g, '')
  if (!digits) return ''
  const normalized = digits.replace(/^0+/, '')
  if (normalized.length <= 10 && defaultCountry) {
    return `${defaultCountry}${normalized}`
  }
  return normalized
}

export async function sendWhatsAppMessage(church, { to, message, mediaUrl, mediaType }) {
  const recipient = normalizeWhatsAppNumber(to, { provider: church?.whatsapp_api_type || 'soft7', defaultCountry: '91' })
  if (!recipient) throw new Error('Recipient number is required')

  console.debug('[sendWhatsAppMessage] sending', { recipient, provider: church?.whatsapp_api_type, messagePreview: (message||'').slice(0,80) })
  const resp = await fetch(EDGE_FN, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      'apikey': SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({ to: recipient, message, mediaUrl, mediaType, church }),
  })

  const rawText = await resp.text()
  let data = {}
  try { data = JSON.parse(rawText) } catch { data = { raw: rawText } }
  console.debug('[sendWhatsAppMessage] response', { ok: resp.ok, status: resp.status, data })
  if (!resp.ok) throw new Error(data.error || `HTTP ${resp.status}: ${rawText}`)
  if (data.error) throw new Error(data.error)
  const statusValue = String(data.status || '').toLowerCase()
  if (['pending','queued'].includes(statusValue)) {
    console.warn('[sendWhatsAppMessage] WhatsApp API returned non-final status', { data })
  }
  if (data && typeof data === 'object' && !('success' in data) && !('status' in data) && !('message' in data) && !data.raw) {
    console.warn('[sendWhatsAppMessage] response missing success markers', { data })
  }
  return data
}
