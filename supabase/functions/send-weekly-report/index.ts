// @ts-nocheck — Deno URL imports and globals are not resolvable by the local TS checker
/* ═══════════════════════════════════════════════════════════════
   send-weekly-report — Auto-scheduled via pg_cron (configurable)
   Generates a two-section PDF (Birthdays + Anniversaries) with
   day-wise colouring, double borders and section headers,
   then sends it via WhatsApp to selected office bearers.
   ═══════════════════════════════════════════════════════════════ */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { PDFDocument, rgb } from 'https://esm.sh/pdf-lib@1.17.1'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const supabase     = createClient(SUPABASE_URL, SERVICE_KEY)
const DAYS         = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']

// ─── helpers ─────────────────────────────────────────────────────────────────
function istNow() {
  // Always compute current date in IST regardless of server timezone
  const ist = new Date(Date.now() + 5.5 * 60 * 60 * 1000)
  return {
    y: ist.getUTCFullYear(), m: ist.getUTCMonth(), d: ist.getUTCDate(),
    dow: ist.getUTCDay(),
  }
}
function isoFromUTC(y: number, m: number, d: number) {
  return `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`
}
function nextWeekRange() {
  const { y, m, d, dow } = istNow()
  const daysToNextSun = dow === 0 ? 7 : 7 - dow
  const sun = new Date(Date.UTC(y, m, d + daysToNextSun))
  const sat = new Date(Date.UTC(y, m, d + daysToNextSun + 6))
  return {
    start: isoFromUTC(sun.getUTCFullYear(), sun.getUTCMonth(), sun.getUTCDate()),
    end:   isoFromUTC(sat.getUTCFullYear(), sat.getUTCMonth(), sat.getUTCDate()),
  }
}
function fmtDate(iso: string) { const [y,m,d] = iso.split('-'); return `${d}-${m}-${y}` }
function dayName(iso: string) {
  const [y,m,d] = iso.split('-').map(Number)
  return DAYS[new Date(y, m-1, d).getDay()]
}
function trunc(s: string, n: number) { return s.length > n ? s.substring(0, n-1) + '...' : s }

// ─── PDF builder ─────────────────────────────────────────────────────────────
async function buildPDF(
  church: any,
  start: string, end: string,
  birthdays: any[], anniversaries: any[],
): Promise<Uint8Array> {

  const doc      = await PDFDocument.create()
  const bold     = await doc.embedFont('Times-Bold')
  const boldH    = await doc.embedFont('Helvetica-Bold')
  const reg      = await doc.embedFont('Helvetica')

  // Layout (points; A4 = 595 × 842)
  const PW = 595, PH = 842, M = 34, IW = 527
  // Header: top M=34 to 34+75=109.  Table header below that.
  const HEADER_H = 75, TH_H = 23, ROW_H = 23, FOOTER_H = 20
  // pdf-lib Y=0 is bottom; header top-left corner Y = PH-M-HEADER_H
  const HDR_Y  = PH - M - HEADER_H   // 733
  const TH_Y   = HDR_Y - TH_H        // 710
  const FOOT_Y = M                    // 34  (footer sits at bottom margin)
  const ROW_MIN = FOOT_Y + FOOTER_H + 4  // rows must stay above this

  // Accent colours
  const BD_ACCENT  = rgb(0.686, 0.294, 0.000)  // orange-brown
  const ANN_ACCENT = rgb(0.608, 0.078, 0.294)  // rose-crimson

  // Shared colours
  const W     = rgb(1,1,1)
  const DARK  = rgb(0.098, 0.098, 0.137)
  const MGRAY = rgb(0.588, 0.604, 0.647)
  const LGRAY = rgb(0.949, 0.957, 0.969)
  const DIV   = rgb(0.824, 0.843, 0.894)
  const DGRAY = rgb(0.216, 0.235, 0.294)

  // Professional pastel day palette (row fill, badge fill)
  const DAY_C: Record<string,any> = {
    Sunday:    { row: rgb(1.000,0.969,0.929), badge: rgb(0.851,0.467,0.024) },
    Monday:    { row: rgb(0.937,0.953,1.000), badge: rgb(0.145,0.388,0.922) },
    Tuesday:   { row: rgb(0.937,0.992,0.941), badge: rgb(0.086,0.639,0.290) },
    Wednesday: { row: rgb(0.996,0.992,0.910), badge: rgb(0.792,0.541,0.016) },
    Thursday:  { row: rgb(0.980,0.969,1.000), badge: rgb(0.486,0.227,0.929) },
    Friday:    { row: rgb(1.000,0.945,0.949), badge: rgb(0.882,0.114,0.282) },
    Saturday:  { row: rgb(0.925,0.996,1.000), badge: rgb(0.055,0.455,0.565) },
  }
  const DAY_DEF = { row: LGRAY, badge: MGRAY }

  // Draw helpers
  let page: any
  let rowY = 0  // current Y for next row (decreasing)

  const R = (x: number, y: number, w: number, h: number, color: any) =>
    page.drawRectangle({ x, y, width: w, height: h, color })

  const Rb = (x: number, y: number, w: number, h: number, borderColor: any, bw: number) =>
    page.drawRectangle({ x, y, width: w, height: h, borderColor, borderWidth: bw })

  const T = (s: string, x: number, y: number, font: any, sz: number, color: any, maxW = 0) => {
    const opts: any = { x, y, font, size: sz, color }
    if (maxW > 0) opts.maxWidth = maxW
    try { page.drawText(String(s).substring(0, 200), opts) } catch (_) { /* skip non-latin */ }
  }

  const Tc = (s: string, cx: number, cy: number, w: number, font: any, sz: number, color: any) => {
    let tw = 0
    try { tw = font.widthOfTextAtSize(String(s), sz) } catch (_) { tw = 0 }
    T(s, cx + (w - tw) / 2, cy, font, sz, color)
  }

  const LINE = (x1: number, y1: number, x2: number, y2: number, color = DIV, thickness = 0.4) =>
    page.drawLine({ start:{x:x1,y:y1}, end:{x:x2,y:y2}, thickness, color })

  // Section tracking for per-section page numbering
  const sections: { start: number; end: number; accent: any }[] = []

  // Column definitions: [label, width_pt, align]
  type ColDef = [string, number, 'c'|'l']
  // Birthday: #=26, MemberID=69, Name=202, Date=74, Age=51, Day=105  => 527
  const BD_COLS: ColDef[]  = [['#',26,'c'],['Member ID',69,'c'],['Member Name',202,'l'],['Date',74,'c'],['Age',51,'c'],['Day',105,'c']]
  // Anniversary: #=26, FamID=63, Couple=213, Date=74, Years=46, Day=105 => 527
  const ANN_COLS: ColDef[] = [['#',26,'c'],['Family ID',63,'c'],['Couple Names',213,'l'],['Ann. Date',74,'c'],['Years',46,'c'],['Day',105,'c']]

  const newPage = (accent: any, type: 'birthday'|'anniversary', count: number) => {
    page = doc.addPage([PW, PH])

    // White canvas
    R(M, M, IW, PH-2*M, W)

    // Church name — Times Bold
    const churchName = trunc(church.church_name || 'Church', 48)
    let nameW = 0
    try { nameW = bold.widthOfTextAtSize(churchName, 18) } catch (_) { nameW = 0 }
    T(churchName, M + (IW - nameW)/2, PH - M - 22, bold, 18, DARK)

    // City / state
    const cityLine = [church.city, church.state].filter(Boolean).join(', ')
    if (cityLine) {
      let cityW = 0
      try { cityW = reg.widthOfTextAtSize(cityLine, 8) } catch (_) { cityW = 0 }
      T(cityLine, M + (IW - cityW)/2, PH - M - 36, reg, 8, MGRAY)
    }

    // Thin accent rule
    const ruleY = cityLine ? PH - M - 42 : PH - M - 38
    LINE(M + 28, ruleY, M + IW - 28, ruleY, accent, 1.1)

    // Report title — Helvetica Bold, accent colour
    const title = type === 'birthday' ? 'Birthday Report' : 'Wedding Anniversary Report'
    const titleW = boldH.widthOfTextAtSize(title, 12)
    T(title, M + (IW - titleW)/2, ruleY - 18, boldH, 12, accent)

    // Date range (left) + record count (right) — small gray
    const rangeStr = `${fmtDate(start)} – ${fmtDate(end)}`
    T(rangeStr, M + 4, HDR_Y + 6, reg, 7, MGRAY)
    const countStr = `${count} Record${count !== 1 ? 's' : ''}`
    const countW = reg.widthOfTextAtSize(countStr, 7)
    T(countStr, M + IW - 4 - countW, HDR_Y + 6, reg, 7, MGRAY)

    // Table header row — light gray
    R(M, TH_Y, IW, TH_H, LGRAY)
    // Accent bottom line
    LINE(M, TH_Y, M + IW, TH_Y, accent, 1.4)

    rowY = TH_Y
  }

  const drawColHeaders = (defs: ColDef[]) => {
    let cx = M
    defs.forEach(([label, w, align], i) => {
      if (align === 'c') {
        Tc(label, cx, TH_Y + 7, w, boldH, 8, DGRAY)
      } else {
        T(label, cx + 4, TH_Y + 7, boldH, 8, DGRAY)
      }
      if (i < defs.length - 1) LINE(cx+w, TH_Y+3, cx+w, TH_Y+TH_H-3, DIV, 0.4)
      cx += w
    })
  }

  const drawRow = (cells: string[], defs: ColDef[], day: string) => {
    const dc = DAY_C[day] || DAY_DEF
    rowY -= ROW_H

    R(M, rowY, IW, ROW_H, dc.row)

    let cx = M
    defs.forEach(([, w, align], i) => {
      const cell   = cells[i] || ''
      const isLast = i === defs.length - 1

      if (isLast) {
        // Rounded badge for day
        const bPad = 3
        R(cx + bPad, rowY + bPad, w - 2*bPad, ROW_H - 2*bPad, dc.badge)
        Tc(cell, cx, rowY + 7, w, boldH, 7, W)
      } else if (align === 'c') {
        Tc(cell, cx, rowY + 7, w, reg, 8, DARK)
      } else {
        T(trunc(cell, Math.floor(w/4.5)), cx + 4, rowY + 7, reg, 8, DARK, w - 8)
      }

      if (i < defs.length - 1) LINE(cx+w, rowY+2, cx+w, rowY+ROW_H-2, DIV, 0.25)
      cx += w
    })

    // Bottom row divider
    LINE(M, rowY, M+IW, rowY, DIV, 0.25)
  }

  const renderSection = (
    type: 'birthday'|'anniversary',
    rows: any[],
    defs: ColDef[],
    accent: any,
    getCells: (r: any) => string[],
  ) => {
    const secStart = doc.getPageCount() + 1
    newPage(accent, type, rows.length)
    drawColHeaders(defs)

    if (rows.length === 0) {
      rowY -= ROW_H
      T('No records for this period.', M+8, rowY+7, reg, 9, MGRAY)
    }

    for (const row of rows) {
      if (rowY - ROW_H < ROW_MIN) {
        newPage(accent, type, rows.length)
        drawColHeaders(defs)
      }
      drawRow(getCells(row), defs, row.day)
    }

    sections.push({ start: secStart, end: doc.getPageCount(), accent })
  }

  renderSection('birthday', birthdays, BD_COLS, BD_ACCENT, r => [
    String(r.serial), r.family_id || '', r.name, r.date, `${r.age} yrs`, r.day,
  ])

  renderSection('anniversary', anniversaries, ANN_COLS, ANN_ACCENT, r => [
    String(r.serial), r.family_id || '', r.name, r.date, `${r.years} yrs`, r.day,
  ])

  // Final pass: thin border + footer on every page
  const totalPages = doc.getPageCount()
  doc.getPages().forEach((pg: any, idx: number) => {
    const pgNum  = idx + 1
    const sec    = sections.find(s => pgNum >= s.start && pgNum <= s.end)
    const accent = sec?.accent ?? BD_ACCENT
    const secPg  = pgNum - (sec?.start ?? 1) + 1
    const secTot = (sec?.end ?? 1) - (sec?.start ?? 1) + 1

    // Single thin border
    pg.drawRectangle({ x:M, y:M, width:IW, height:PH-2*M, borderColor:DARK, borderWidth:0.5 })

    // Footer divider
    pg.drawLine({ start:{x:M, y:FOOT_Y+FOOTER_H}, end:{x:M+IW, y:FOOT_Y+FOOTER_H}, thickness:0.5, color:DIV })

    // Footer text
    pg.drawText(`Generated: ${new Date().toLocaleDateString('en-IN')}`,
      { x:M+5, y:FOOT_Y+7, font:reg, size:7, color:MGRAY })
    const pgTxt = `Page ${secPg} / ${secTot}`
    const pgW   = reg.widthOfTextAtSize(pgTxt, 7)
    pg.drawText(pgTxt, { x:M+IW-5-pgW, y:FOOT_Y+7, font:reg, size:7, color:MGRAY })
  })

  return await doc.save()
}

// ─── main handler ─────────────────────────────────────────────────────────────
serve(async () => {
  try {
    const { data: settings } = await supabase
      .from('announcement_settings').select('*').limit(1).maybeSingle()
    if (!settings?.auto_report_enabled)
      return new Response('Auto report disabled', { status: 200 })

    const { data: church } = await supabase.from('churches').select('*').limit(1).maybeSingle()
    if (!church) return new Response('No church config', { status: 200 })

    const selectedBearers = (settings.report_bearers || 'presbyter,secretary,treasurer').split(',').filter(Boolean)
    const BEARER_MAP: Record<string, { name: string; num: string }> = {
      presbyter: { name: church.presbyter_name || 'Presbyter', num: church.presbyter_whatsapp },
      secretary: { name: church.secretary_name || 'Secretary', num: church.secretary_whatsapp },
      treasurer: { name: church.treasurer_name || 'Treasurer', num: church.treasurer_whatsapp },
      admin1:    { name: 'Admin',                              num: church.admin1_whatsapp    },
    }
    const bearers = selectedBearers.map((k: string) => BEARER_MAP[k]).filter((b: any) => b?.num)
    if (!bearers.length) return new Response('No office bearer numbers configured', { status: 200 })

    const { start, end } = nextWeekRange()

    const [{ data: allMembers }, { data: exclusionRows }] = await Promise.all([
      supabase.from('members')
        .select('member_id,family_id,member_name,spouse_name,dob_actual,date_of_marriage,marital_status')
        .eq('is_active', true),
      supabase.from('announcement_exclusions').select('member_id,family_id,exclusion_type'),
    ])

    const members = allMembers || []
    const excRows = exclusionRows || []
    const birthdayExcluded = new Set(
      excRows.filter(e => e.exclusion_type === 'birthday' || e.exclusion_type === 'both').map(e => e.member_id)
    )
    const anniversaryExcludedFamilies = new Set(
      excRows.filter(e => e.exclusion_type === 'anniversary' || e.exclusion_type === 'both').map(e => e.family_id).filter(Boolean)
    )

    // Walk ISO date strings directly — avoids all timezone/UTC-midnight issues
    const dateRange: string[] = []
    const [sy, sm, sd] = start.split('-').map(Number)
    const [ey, em, ed] = end.split('-').map(Number)
    for (let d = new Date(Date.UTC(sy, sm-1, sd)); d <= new Date(Date.UTC(ey, em-1, ed)); d.setUTCDate(d.getUTCDate() + 1)) {
      dateRange.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}`)
    }

    const birthdays: any[] = []; let bSerial = 1
    for (const iso of dateRange) {
      const [iy, im, id] = iso.split('-').map(Number)
      members.filter(m => {
        if (!m.dob_actual || birthdayExcluded.has(m.member_id)) return false
        const dob = new Date(m.dob_actual)
        return dob.getUTCMonth()+1 === im && dob.getUTCDate() === id
      }).forEach(m => birthdays.push({
        serial: bSerial++, family_id: m.family_id, name: m.member_name,
        date: fmtDate(iso), age: iy - new Date(m.dob_actual).getUTCFullYear(),
        day: dayName(iso),
      }))
    }

    const seenFam = new Set<string>()
    const anniversaries: any[] = []; let aSerial = 1
    for (const iso of dateRange) {
      const [iy, im, id] = iso.split('-').map(Number)
      members.filter(m => {
        if (m.marital_status !== 'Married' || !m.date_of_marriage) return false
        if (anniversaryExcludedFamilies.has(m.family_id)) return false
        const dom = new Date(m.date_of_marriage)
        return dom.getUTCMonth()+1 === im && dom.getUTCDate() === id && !seenFam.has(m.family_id)
      }).forEach(m => {
        seenFam.add(m.family_id)
        const displayName = m.spouse_name ? `${m.member_name} & ${m.spouse_name}` : m.member_name
        anniversaries.push({
          serial: aSerial++, family_id: m.family_id, name: displayName,
          date: fmtDate(iso), years: iy - new Date(m.date_of_marriage).getUTCFullYear(),
          day: dayName(iso),
        })
      })
    }

    console.log('[send-weekly-report] building PDF', { start, end, birthdays: birthdays.length, anniversaries: anniversaries.length })
    const pdfBytes = await buildPDF(church, start, end, birthdays, anniversaries)
    console.log('[send-weekly-report] PDF built, size:', pdfBytes.length)
    const fileName = `weekly-report-${start}.pdf`

    const { error: uploadError } = await supabase.storage
      .from('announcement-reports')
      .upload(fileName, pdfBytes, { contentType: 'application/pdf', upsert: true })
    if (uploadError) throw new Error(`PDF upload failed: ${uploadError.message}`)
    console.log('[send-weekly-report] PDF uploaded:', fileName)

    const { data: { publicUrl } } = supabase.storage.from('announcement-reports').getPublicUrl(fileName)
    const caption = `${church.church_name || 'Church'} - Weekly Report. Week: ${fmtDate(start)} to ${fmtDate(end)}. Birthdays: ${birthdays.length} | Anniversaries: ${anniversaries.length}`

    let sent = 0, failed = 0
    for (const b of bearers) {
      try {
        await sendDoc(church, b.num, publicUrl, caption)
        await supabase.from('announcements_log').insert({
          log_type: 'weekly_report', recipient_name: b.name, recipient_number: b.num,
          status: 'sent', triggered_by: 'auto',
          message_preview: `PDF: ${publicUrl}`,
        })
        sent++
      } catch (err: any) {
        await supabase.from('announcements_log').insert({
          log_type: 'weekly_report', recipient_name: b.name, recipient_number: b.num,
          status: 'failed', triggered_by: 'auto', error_message: err.message,
        })
        failed++
      }
    }

    return new Response(
      JSON.stringify({ ok:true, week:{start,end}, birthdays:birthdays.length, anniversaries:anniversaries.length, sent, failed }),
      { headers: { 'Content-Type': 'application/json' } },
    )
  } catch (err: any) {
    console.error('[send-weekly-report]', err)
    return new Response(JSON.stringify({ error: err.message }), { status: 500 })
  }
})

async function sendDoc(church: any, to: string, docUrl: string, caption: string) {
  const phone = String(to).replace(/\D/g, '')
  if (church.whatsapp_api_type === 'official') {
    const resp = await fetch(`https://graph.facebook.com/v18.0/${church.official_phone_number_id}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${church.official_bearer_token}` },
      body: JSON.stringify({ messaging_product:'whatsapp', to:phone, type:'document',
        document:{ link:docUrl, caption, filename:'Weekly_Report.pdf' } }),
    })
    if (!resp.ok) throw new Error(`Official API ${resp.status}: ${await resp.text()}`)
  } else {
    const encodedUrl = docUrl.replace(/ /g, '%20')
    const resp = await fetch(`https://cloud.soft7.in/api/send?number=${phone}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'User-Agent': 'ChurchCMS/1.0' },
      body: JSON.stringify({
        number: phone,
        type: 'media',
        message: caption,
        media_url: encodedUrl,
        instance_id: church.instance_id,
        access_token: church.access_token,
      }),
    })
    const body = await resp.text()
    console.log(`[sendDoc] Soft7 response (${resp.status}):`, body)
    if (!resp.ok) throw new Error(`Soft7 API ${resp.status}: ${body}`)
    // Soft7 returns 200 even on failure — check the body
    try {
      const json = JSON.parse(body)
      const status = (json.status || '').toString().toLowerCase()
      if (status === 'error' || status === 'failed' || status === 'false' || json.error) {
        throw new Error(`Soft7 rejected: ${body}`)
      }
    } catch (parseErr: any) {
      // if body isn't JSON and HTTP was 200, assume ok
      if (parseErr.message.startsWith('Soft7 rejected')) throw parseErr
    }
  }
}
