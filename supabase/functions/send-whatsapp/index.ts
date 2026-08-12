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

type MediaKind = 'audio' | 'image' | 'video' | 'document' | 'none'

/** Classify media from MIME type first, then URL extension as fallback */
function classifyMedia(url: string | undefined, mime: string | undefined): MediaKind {
  if (!url) return 'none'
  if (mime?.startsWith('audio/')) return 'audio'
  if (mime?.startsWith('image/')) return 'image'
  if (mime?.startsWith('video/')) return 'video'
  if (mime === 'application/pdf' || mime?.startsWith('application/')) return 'document'
  // URL extension fallback (strip query string first)
  const path = url.split('?')[0].toLowerCase()
  if (/\.(mp3|ogg|opus|webm|aac|amr|m4a|wav)$/.test(path)) return 'audio'
  if (/\.(jpg|jpeg|png|gif|webp)$/.test(path)) return 'image'
  if (/\.(mp4|mov|avi|mkv)$/.test(path)) return 'video'
  if (/\.(pdf|doc|docx|xls|xlsx|ppt|pptx)$/.test(path)) return 'document'
  return 'image' // safe default for unknown binary
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const { to, message, mediaUrl, mediaType, church } = await req.json()
    if (!to)     throw new Error('Recipient number is required')
    if (!church) throw new Error('Church config is required')

    const phone   = String(to).replace(/\D/g, '')
    const apiType = church.whatsapp_api_type || 'soft7'
    const kind    = classifyMedia(mediaUrl, mediaType)

    console.log('[send-whatsapp] request', { phone, apiType, kind, mediaUrl: mediaUrl?.slice(0, 80), messagePreview: (message||'').slice(0,80) })

    let result: unknown

    /* ── Official Meta / WhatsApp Cloud API ── */
    if (apiType === 'official') {
      const phoneId = church.official_phone_number_id
      const token   = church.official_bearer_token
      if (!phoneId || !token) throw new Error('Official WhatsApp API credentials not configured')

      let body: unknown
      if (kind === 'none') {
        body = { messaging_product: 'whatsapp', to: phone, type: 'text', text: { body: message || '' } }
      } else if (kind === 'audio') {
        // Official API: audio has no caption field
        body = { messaging_product: 'whatsapp', to: phone, type: 'audio', audio: { link: mediaUrl } }
      } else if (kind === 'image') {
        body = { messaging_product: 'whatsapp', to: phone, type: 'image', image: { link: mediaUrl, caption: message || '' } }
      } else if (kind === 'video') {
        body = { messaging_product: 'whatsapp', to: phone, type: 'video', video: { link: mediaUrl, caption: message || '' } }
      } else {
        // document
        const fname = (mediaUrl || '').split('?')[0].split('/').pop() || 'file'
        body = { messaging_product: 'whatsapp', to: phone, type: 'document',
                 document: { link: mediaUrl, filename: fname, caption: message || '' } }
      }

      const resp = await fetch(`https://graph.facebook.com/v18.0/${phoneId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      })
      const text = await resp.text()
      console.log('[send-whatsapp] official response', { status: resp.status, text })
      if (!resp.ok) {
        throw new Error(`Official API error ${resp.status}: ${text}`)
      }
      try { result = JSON.parse(text) } catch { result = { raw: text } }

    /* ── Soft7 (unofficial / hosted) API ── */
    } else {
      if (!church.instance_id || !church.access_token)
        throw new Error('Soft7 instance_id / access_token not configured')

      const apiUrl = ((church.whatsapp_url || '').trim().replace(/\/+$/, '')) || 'https://cloud.soft7.in/api/send'

      // OGG Opus audio → soft7 'audio' type (PTT voice note, plays inline on mobile).
      // Any other audio (MP3 fallback) → 'document' (inline on desktop, download on mobile).
      const isOggAudio = kind === 'audio' &&
        (mediaType?.includes('ogg') || (mediaUrl || '').split('?')[0].toLowerCase().endsWith('.ogg'))

      const soft7MsgType: Record<MediaKind, string> = {
        none:     'text',
        audio:    isOggAudio ? 'audio' : 'document',
        image:    'media',
        video:    'media',
        document: 'document',
      }

      const fname        = (mediaUrl || '').split('?')[0].split('/').pop() || 'file'
      const msgType      = soft7MsgType[kind]
      const needFilename = msgType === 'document'

      const payload: Record<string, unknown> = {
        number:       phone,
        type:         msgType,
        message:      message || '',
        instance_id:  church.instance_id,
        access_token: church.access_token,
        ...(mediaUrl && { media_url: mediaUrl }),
        ...(needFilename && { filename: fname }),
      }

      console.log('[send-whatsapp] soft7 payload:', JSON.stringify({ ...payload, access_token: '***', instance_id: payload.instance_id }))

      const resp = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const rawText = await resp.text()
      console.log('[send-whatsapp] soft7 response', { status: resp.status, rawText })
      let parsed: Record<string, unknown> = {}
      try { parsed = JSON.parse(rawText) } catch { parsed = { raw: rawText } }

      if (!resp.ok) throw new Error(`Soft7 API error ${resp.status}: ${rawText}`)

      const lowerStatus = String(parsed.status || '').toLowerCase()
      if (lowerStatus === 'error' || lowerStatus === 'failed' || parsed.error || parsed.success === false) {
        throw new Error(`Soft7 error: ${parsed.message || parsed.error || parsed.reason || rawText}`)
      }
      if (lowerStatus === 'pending' || lowerStatus === 'queued' || lowerStatus === '') {
        console.warn('[send-whatsapp] soft7 send response is not final', { parsed })
      }
      const softMsg = String(parsed.message || '').toLowerCase()
      if (softMsg.includes('not ready') || softMsg.includes('connection') || softMsg.includes('stabilize')) {
        throw new Error(`WhatsApp not connected: ${parsed.message}`)
      }

      result = parsed
    }

    return json(result)
  } catch (err) {
    console.error('[send-whatsapp]', err)
    return json({ error: (err as Error).message }, 400)
  }
})
