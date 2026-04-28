/* ═══════════════════════════════════════════════════════════════
   send-daily-greetings — Triggered daily at 12:01 AM IST (18:31 UTC)
   Sends birthday & anniversary greeting cards to members via WhatsApp
   ═══════════════════════════════════════════════════════════════ */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const DAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']

const supabase = createClient(SUPABASE_URL, SERVICE_KEY)

serve(async () => {
  try {
    // Check if auto greeting is enabled
    const { data: settings } = await supabase
      .from('announcement_settings').select('*').limit(1).maybeSingle()
    if (!settings?.auto_greeting_enabled) {
      return new Response('Auto greeting disabled', { status: 200 })
    }

    // Get church config
    const { data: church } = await supabase
      .from('churches').select('*').limit(1).maybeSingle()
    if (!church) return new Response('No church config', { status: 200 })

    const today = new Date()
    const mon = today.getMonth() + 1, day = today.getDate()
    const iso = today.toISOString().split('T')[0]

    // Today's birthdays
    const { data: allMembers } = await supabase
      .from('members')
      .select('member_id,family_id,member_name,whatsapp,mobile,dob_actual,date_of_marriage,marital_status,spouse_name')
      .eq('is_active', true)

    const members = allMembers || []

    const birthdayMembers = members.filter(m => {
      if (!m.dob_actual) return false
      const dob = new Date(m.dob_actual)
      return dob.getMonth() + 1 === mon && dob.getDate() === day
    })

    // Today's anniversaries (deduplicated by family_id)
    const marriedMembers = members.filter(m => m.marital_status === 'Married' && m.date_of_marriage)
    const seenFamilies = new Set<string>()
    const anniversaryMembers = marriedMembers.filter(m => {
      const dom = new Date(m.date_of_marriage)
      if (dom.getMonth() + 1 !== mon || dom.getDate() !== day) return false
      if (seenFamilies.has(m.family_id)) return false
      seenFamilies.add(m.family_id); return true
    })

    const results = { sent: 0, failed: 0, skipped: 0 }

    // Send birthday greetings
    for (const m of birthdayMembers) {
      const phone = m.whatsapp || m.mobile
      if (!phone) { results.skipped++; continue }
      await sendGreeting(church, m, 'birthday', iso, today.getFullYear() - new Date(m.dob_actual).getFullYear(), results)
    }

    // Send anniversary greetings
    for (const m of anniversaryMembers) {
      const phone = m.whatsapp || m.mobile
      if (!phone) { results.skipped++; continue }
      const displayName = m.spouse_name ? `${m.member_name} & ${m.spouse_name}` : m.member_name
      await sendGreeting(church, { ...m, displayName }, 'anniversary', iso,
        today.getFullYear() - new Date(m.date_of_marriage).getFullYear(), results)
    }

    return new Response(JSON.stringify({ ok: true, date: iso, ...results }), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('[send-daily-greetings]', err)
    return new Response(JSON.stringify({ error: err.message }), { status: 500 })
  }
})

async function sendGreeting(church: any, member: any, type: string, eventDate: string, years: number, results: any) {
  const phone = member.whatsapp || member.mobile
  const displayName = member.displayName || member.member_name
  try {
    // Get random verse
    const { data: verses } = await supabase
      .from('bible_verses').select('*').eq('type', type).eq('is_active', true)
    const verse = verses?.length ? verses[Math.floor(Math.random() * verses.length)] : null

    // For Edge Functions, send a rich text message (image generation requires Satori/WASM)
    const verseText = verse ? `\n\n📖 ${verse.verse_reference}\n"${verse.verse_text_english}"` : ''
    const message = type === 'birthday'
      ? `🎂 *Happy Birthday ${displayName}!*\nBirthday greetings from ${church.church_name || 'Church'}.${verseText}`
      : `💍 *Happy Anniversary ${displayName}!*\n${years} blessed years of togetherness!\nAnniversary greetings from ${church.church_name || 'Church'}.${verseText}`

    await callWhatsApp(church, phone, message)

    await supabase.from('announcements_log').insert({
      log_type: type === 'birthday' ? 'birthday_wish' : 'anniversary_wish',
      recipient_name: displayName, recipient_number: phone,
      member_id: member.member_id, family_id: member.family_id,
      event_date: eventDate, status: 'sent', triggered_by: 'auto',
      message_preview: message.substring(0, 160),
    })
    results.sent++
  } catch (err) {
    await supabase.from('announcements_log').insert({
      log_type: type === 'birthday' ? 'birthday_wish' : 'anniversary_wish',
      recipient_name: displayName, recipient_number: phone,
      member_id: member.member_id, family_id: member.family_id,
      event_date: eventDate, status: 'failed', triggered_by: 'auto',
      error_message: err.message,
    })
    results.failed++
  }
}

async function callWhatsApp(church: any, to: string, message: string) {
  const phone = String(to).replace(/\D/g, '')
  if (church.whatsapp_api_type === 'official') {
    const resp = await fetch(
      `https://graph.facebook.com/v18.0/${church.official_phone_number_id}/messages`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${church.official_bearer_token}` },
        body: JSON.stringify({ messaging_product: 'whatsapp', to: phone, type: 'text', text: { body: message } }),
      }
    )
    if (!resp.ok) throw new Error(`Official API ${resp.status}: ${await resp.text()}`)
  } else {
    const resp = await fetch(`https://cloud.soft7.in/api/send?number=${phone}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ number: phone, type: 'text', message, instance_id: church.instance_id, access_token: church.access_token }),
    })
    if (!resp.ok) throw new Error(`Soft7 API ${resp.status}: ${await resp.text()}`)
  }
}
