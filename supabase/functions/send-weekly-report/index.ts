/* ═══════════════════════════════════════════════════════════════
   send-weekly-report — Triggered every Saturday at 6 PM IST (12:30 UTC)
   Generates & sends forthcoming week's birthday/anniversary report PDF
   via WhatsApp to Presbyter, Secretary and Treasurer
   ═══════════════════════════════════════════════════════════════ */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const supabase = createClient(SUPABASE_URL, SERVICE_KEY)
const DAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']

function nextWeekRange() {
  const today = new Date()
  const dow = today.getDay()
  const daysToNextSun = dow === 0 ? 7 : 7 - dow
  const sun = new Date(today); sun.setDate(today.getDate() + daysToNextSun)
  const sat = new Date(sun);   sat.setDate(sun.getDate() + 6)
  return { start: sun.toISOString().split('T')[0], end: sat.toISOString().split('T')[0] }
}

function fmtDate(iso: string) {
  const [y, m, d] = iso.split('-')
  return `${d}-${m}-${y}`
}

function dayName(iso: string) {
  const [y, m, d] = iso.split('-').map(Number)
  return DAYS[new Date(y, m - 1, d).getDay()]
}

serve(async () => {
  try {
    const { data: settings } = await supabase
      .from('announcement_settings').select('*').limit(1).maybeSingle()
    if (!settings?.auto_report_enabled) {
      return new Response('Auto report disabled', { status: 200 })
    }

    const { data: church } = await supabase.from('churches').select('*').limit(1).maybeSingle()
    if (!church) return new Response('No church config', { status: 200 })

    const bearers = [
      { name: church.presbyter_name,  num: church.presbyter_whatsapp  },
      { name: church.secretary_name,  num: church.secretary_whatsapp  },
      { name: church.treasurer_name,  num: church.treasurer_whatsapp  },
    ].filter(b => b.num)

    if (!bearers.length) return new Response('No office bearer numbers configured', { status: 200 })

    const { start, end } = nextWeekRange()
    const { data: allMembers } = await supabase
      .from('members')
      .select('member_id,family_id,member_name,spouse_name,dob_actual,date_of_marriage,marital_status,mobile,whatsapp')
      .eq('is_active', true)

    const members = allMembers || []

    // Load exclusion list
    const { data: exclusionRows } = await supabase
      .from('announcement_exclusions')
      .select('member_id,family_id,exclusion_type')
    const excRows = exclusionRows || []
    const birthdayExcluded = new Set(
      excRows.filter(e => e.exclusion_type === 'birthday' || e.exclusion_type === 'both').map(e => e.member_id)
    )
    const anniversaryExcludedFamilies = new Set(
      excRows.filter(e => e.exclusion_type === 'anniversary' || e.exclusion_type === 'both').map(e => e.family_id).filter(Boolean)
    )

    const startD = new Date(start), endD = new Date(end)

    // Build birthday list (exclusions applied)
    const birthdays: any[] = []; let bSerial = 1
    for (let d = new Date(startD); d <= endD; d.setDate(d.getDate() + 1)) {
      const mon = d.getMonth() + 1, day = d.getDate()
      const iso = new Date(d).toISOString().split('T')[0]
      members.filter(m => {
        if (!m.dob_actual) return false
        if (birthdayExcluded.has(m.member_id)) return false
        const dob = new Date(m.dob_actual)
        return dob.getMonth() + 1 === mon && dob.getDate() === day
      }).forEach(m => {
        birthdays.push({
          serial: bSerial++, family_id: m.family_id,
          name: m.member_name, date: fmtDate(iso),
          age: new Date(iso).getFullYear() - new Date(m.dob_actual).getFullYear(),
          day: dayName(iso),
        })
      })
    }

    // Build anniversary list (deduplicated by family_id, exclusions applied)
    const seenFam = new Set<string>()
    const anniversaries: any[] = []; let aSerial = 1
    for (let d = new Date(startD); d <= endD; d.setDate(d.getDate() + 1)) {
      const mon = d.getMonth() + 1, day = d.getDate()
      const iso = new Date(d).toISOString().split('T')[0]
      members.filter(m => {
        if (m.marital_status !== 'Married' || !m.date_of_marriage) return false
        if (anniversaryExcludedFamilies.has(m.family_id)) return false
        const dom = new Date(m.date_of_marriage)
        return dom.getMonth() + 1 === mon && dom.getDate() === day && !seenFam.has(m.family_id)
      }).forEach(m => {
        seenFam.add(m.family_id)
        const displayName = m.spouse_name ? `${m.member_name} & ${m.spouse_name}` : m.member_name
        anniversaries.push({
          serial: aSerial++, family_id: m.family_id,
          name: displayName, date: fmtDate(iso),
          years: new Date(iso).getFullYear() - new Date(m.date_of_marriage).getFullYear(),
          day: dayName(iso),
        })
      })
    }

    // Build text report (PDF generation requires jsPDF which isn't available in Deno Edge)
    const lines = [
      `📋 *${church.church_name || 'Church'} — Weekly Announcement Report*`,
      `Week: ${fmtDate(start)} to ${fmtDate(end)}`,
      '',
      `🎂 *BIRTHDAYS (${birthdays.length})*`,
      ...birthdays.map(b => `${b.serial}. ${b.name} — ${b.date} (${b.day}) · Turning ${b.age}`),
      birthdays.length === 0 ? 'None' : '',
      '',
      `💍 *ANNIVERSARIES (${anniversaries.length})*`,
      ...anniversaries.map(a => `${a.serial}. ${a.name} — ${a.date} (${a.day}) · ${a.years} yrs`),
      anniversaries.length === 0 ? 'None' : '',
    ].join('\n')

    let sent = 0, failed = 0
    for (const b of bearers) {
      try {
        await callWhatsApp(church, b.num, lines)
        await supabase.from('announcements_log').insert({
          log_type: 'weekly_report', recipient_name: b.name, recipient_number: b.num,
          status: 'sent', triggered_by: 'auto',
          message_preview: `Weekly report ${fmtDate(start)}–${fmtDate(end)}`,
        })
        sent++
      } catch (err) {
        await supabase.from('announcements_log').insert({
          log_type: 'weekly_report', recipient_name: b.name, recipient_number: b.num,
          status: 'failed', triggered_by: 'auto', error_message: err.message,
        })
        failed++
      }
    }

    return new Response(JSON.stringify({ ok: true, week: { start, end }, birthdays: birthdays.length, anniversaries: anniversaries.length, sent, failed }), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('[send-weekly-report]', err)
    return new Response(JSON.stringify({ error: err.message }), { status: 500 })
  }
})

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
