/* ═══════════════════════════════════════════════════════════════
   whatsapp.js — Routes all WhatsApp sends through the
   send-whatsapp Edge Function to avoid browser CORS restrictions.
   ═══════════════════════════════════════════════════════════════ */

import { SUPABASE_URL, SUPABASE_ANON_KEY } from './supabase'

const EDGE_FN = `${SUPABASE_URL}/functions/v1/send-whatsapp`

export async function sendWhatsAppMessage(church, { to, message, mediaUrl }) {
  if (!to) throw new Error('Recipient number is required')

  const resp = await fetch(EDGE_FN, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      'apikey': SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({ to, message, mediaUrl, church }),
  })

  const data = await resp.json().catch(() => ({}))
  if (!resp.ok || data.error) throw new Error(data.error || `HTTP ${resp.status}`)
  return data
}
