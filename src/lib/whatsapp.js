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
  switch ((provider || '').toLowerCase()) {
    case 'official':
    case 'meta':
    case 'waba':
      if (normalized.length <= 10 && defaultCountry) {
        return `${defaultCountry}${normalized}`
      }
      return normalized
    case 'soft7':
    default:
      return normalized
  }
}

export async function sendWhatsAppMessage(church, { to, message, mediaUrl, mediaType }) {
  const recipient = normalizeWhatsAppNumber(to, { provider: church?.whatsapp_api_type || 'soft7', defaultCountry: '91' })
  if (!recipient) throw new Error('Recipient number is required')

  const resp = await fetch(EDGE_FN, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      'apikey': SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({ to, message, mediaUrl, mediaType, church }),
  })

  const data = await resp.json().catch(() => ({}))
  if (!resp.ok || data.error) throw new Error(data.error || `HTTP ${resp.status}`)
  return data
}
