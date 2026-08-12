// @ts-nocheck
/* ═══════════════════════════════════════════════════════════════
   send-daily-greetings — Picks a random pre-generated template
   card from storage and sends it as a WhatsApp image with a
   personalised caption. No server-side image generation needed.
   ═══════════════════════════════════════════════════════════════ */

import { serve }        from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const supabase     = createClient(SUPABASE_URL, SERVICE_KEY)

// ─── Date helper (IST) ────────────────────────────────────────
function todayIST(): string {
  const ist = new Date(Date.now() + 5.5 * 60 * 60 * 1000)
  const y = ist.getUTCFullYear()
  const m = String(ist.getUTCMonth() + 1).padStart(2, '0')
  const d = String(ist.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

// ─── Pick a random template from storage ─────────────────────
async function getRandomTemplateUrl(type: string): Promise<string | null> {
  const folder = `templates/${type}`
  const { data: files } = await supabase.storage
    .from('announcement-cards')
    .list(folder, { limit: 100 })
  const valid = (files || []).filter(
    f => f.name.endsWith('.png') && !f.name.startsWith('.')
  )
  if (!valid.length) return null
  const pick = valid[Math.floor(Math.random() * valid.length)]
  const { data } = supabase.storage
    .from('announcement-cards')
    .getPublicUrl(`${folder}/${pick.name}`)
  return data.publicUrl
}

// ─── Main handler ─────────────────────────────────────────────
serve(async () => {
  try {
    const { data: settings } = await supabase
      .from('announcement_settings').select('*').limit(1).maybeSingle()
    if (!settings?.auto_greeting_enabled)
      return new Response('Auto greeting disabled', { status: 200 })

    const { data: church } = await supabase
      .from('churches').select('*').limit(1).maybeSingle()
    if (!church) return new Response('No church config', { status: 200 })

    const iso = todayIST()
    const [, mm, dd] = iso.split('-').map(Number)

    const { data: allMembers } = await supabase
      .from('members')
      .select('member_id,family_id,member_name,whatsapp,mobile,dob_actual,date_of_marriage,marital_status,spouse_name')
      .eq('is_active', true)
    const members = allMembers || []

    const { data: exclusionRows } = await supabase
      .from('announcement_exclusions').select('member_id,family_id,exclusion_type')
    const excRows = exclusionRows || []
    const birthdayExcluded = new Set(
      excRows.filter(e => e.exclusion_type === 'birthday' || e.exclusion_type === 'both')
             .map(e => e.member_id)
    )
    const anniversaryExcludedFamilies = new Set(
      excRows.filter(e => e.exclusion_type === 'anniversary' || e.exclusion_type === 'both')
             .map(e => e.family_id).filter(Boolean)
    )

    const birthdayMembers = members.filter(m => {
      if (!m.dob_actual || birthdayExcluded.has(m.member_id)) return false
      const dob = new Date(m.dob_actual)
      return dob.getUTCMonth() + 1 === mm && dob.getUTCDate() === dd
    })

    const seenFamilies = new Set()
    const anniversaryMembers = members.filter(m => {
      if (m.marital_status !== 'Married' || !m.date_of_marriage) return false
      if (anniversaryExcludedFamilies.has(m.family_id)) return false
      const dom = new Date(m.date_of_marriage)
      if (dom.getUTCMonth() + 1 !== mm || dom.getUTCDate() !== dd) return false
      if (seenFamilies.has(m.family_id)) return false
      seenFamilies.add(m.family_id); return true
    })

    const results = { sent: 0, failed: 0, skipped: 0 }

    for (const m of birthdayMembers) {
      if (!m.whatsapp && !m.mobile) { results.skipped++; continue }
      const age = new Date(iso).getUTCFullYear() - new Date(m.dob_actual).getUTCFullYear()
      await sendGreeting(church, m, 'birthday', iso, age, results)
    }

    for (const m of anniversaryMembers) {
      if (!m.whatsapp && !m.mobile) { results.skipped++; continue }
      const displayName = m.spouse_name ? `${m.member_name} & ${m.spouse_name}` : m.member_name
      const years = new Date(iso).getUTCFullYear() - new Date(m.date_of_marriage).getUTCFullYear()
      await sendGreeting(church, { ...m, displayName }, 'anniversary', iso, years, results)
    }

    return new Response(JSON.stringify({ ok: true, date: iso, ...results }), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err: any) {
    console.error('[send-daily-greetings]', err)
    return new Response(JSON.stringify({ error: err.message }), { status: 500 })
  }
})

// ─── Send one greeting ────────────────────────────────────────
async function sendGreeting(
  church: any, member: any, type: string,
  eventDate: string, years: number, results: any,
) {
  const phone       = member.whatsapp || member.mobile
  const displayName = member.displayName || member.member_name
  try {
    const { data: verses } = await supabase
      .from('bible_verses').select('*').eq('type', type).eq('is_active', true)
    const verse = verses?.length ? verses[Math.floor(Math.random() * verses.length)] : null

    const verseCaption = verse
      ? `\n\n📖 ${verse.verse_reference}\n"${verse.verse_text_english}"`
      : ''
    const caption = type === 'birthday'
      ? `🎂 Happy Birthday, ${displayName}!\nBirthday greetings from ${church.church_name || 'Church'}.${verseCaption}`
      : `💍 Happy Anniversary, ${displayName}!\n${years} blessed years of togetherness!\nAnniversary greetings from ${church.church_name || 'Church'}.${verseCaption}`

    const mediaUrl = await getRandomTemplateUrl(type)
    if (!mediaUrl) {
      results.skipped++
      await supabase.from('announcements_log').insert({
        log_type:         type === 'birthday' ? 'birthday_wish' : 'anniversary_wish',
        recipient_name:   displayName,
        recipient_number: phone,
        member_id:        member.member_id,
        family_id:        member.family_id,
        event_date:       eventDate,
        status:           'skipped',
        triggered_by:     'auto',
        message_preview:  'No greeting templates uploaded yet',
      })
      return
    }

    await sendWhatsAppMedia(church, phone, mediaUrl, caption)
    const preview = 'Template card sent'

    await supabase.from('announcements_log').insert({
      log_type:         type === 'birthday' ? 'birthday_wish' : 'anniversary_wish',
      recipient_name:   displayName,
      recipient_number: phone,
      member_id:        member.member_id,
      family_id:        member.family_id,
      event_date:       eventDate,
      status:           'sent',
      triggered_by:     'auto',
      message_preview:  preview,
    })
    results.sent++
  } catch (err: any) {
    await supabase.from('announcements_log').insert({
      log_type:         type === 'birthday' ? 'birthday_wish' : 'anniversary_wish',
      recipient_name:   displayName,
      recipient_number: phone,
      member_id:        member.member_id,
      family_id:        member.family_id,
      event_date:       eventDate,
      status:           'failed',
      triggered_by:     'auto',
      error_message:    err.message,
    })
    results.failed++
  }
}

// ─── WhatsApp senders ─────────────────────────────────────────
async function sendWhatsAppMedia(church: any, to: string, mediaUrl: string, caption: string) {
  const phone = String(to).replace(/\D/g, '')
  if (church.whatsapp_api_type === 'official') {
    const resp = await fetch(
      `https://graph.facebook.com/v18.0/${church.official_phone_number_id}/messages`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${church.official_bearer_token}` },
        body: JSON.stringify({
          messaging_product: 'whatsapp', to: phone, type: 'image',
          image: { link: mediaUrl, caption },
        }),
      }
    )
    if (!resp.ok) throw new Error(`Official API ${resp.status}: ${await resp.text()}`)
  } else {
    const encodedUrl = mediaUrl.replace(/ /g, '%20')
    const resp = await fetch(`https://cloud.soft7.in/api/send?number=${phone}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'User-Agent': 'ChurchCMS/1.0' },
      body: JSON.stringify({
        number: phone, type: 'media', media_url: encodedUrl,
        instance_id: church.instance_id, access_token: church.access_token,
      }),
    })
    const body = await resp.text()
    console.log(`[sendWhatsAppMedia] Soft7 response (${resp.status}):`, body)
    if (!resp.ok) throw new Error(`Soft7 API ${resp.status}: ${body}`)
    try {
      const json = JSON.parse(body)
      const status = (json.status || '').toString().toLowerCase()
      if (status === 'error' || status === 'failed' || status === 'false' || json.error) {
        throw new Error(`Soft7 rejected: ${body}`)
      }
    } catch (parseErr: any) {
      if (parseErr.message.startsWith('Soft7 rejected')) throw parseErr
    }
  }
}

