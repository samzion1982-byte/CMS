import { SUPABASE_URL, SUPABASE_ANON_KEY } from './supabase'

export async function createPaymentLink({ amount, memberName, whatsapp, requestId, memberId, payUrl }) {
  const resp = await fetch(`${SUPABASE_URL}/functions/v1/create-razorpay-link`, {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      'apikey':        SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({ amount, memberName, whatsapp, requestId, memberId, payUrl }),
  })
  const data = await resp.json().catch(() => ({}))
  if (!resp.ok || data.error) throw new Error(data.error || `HTTP ${resp.status}`)
  return data.short_url
}
