/* ═══════════════════════════════════════════════════════════════
   announcements.js — Data helpers for Announcements module
   ═══════════════════════════════════════════════════════════════ */

import { supabase } from './supabase'

const DAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']

function dayName(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number)
  return DAYS[new Date(y, m - 1, d).getDay()]
}

function fmtDate(dateStr) {
  if (!dateStr) return ''
  const [y, m, d] = dateStr.split('-').map(Number)
  return `${String(d).padStart(2,'0')}-${String(m).padStart(2,'0')}-${y}`
}

// ── Members queries ───────────────────────────────────────────

async function fetchActiveMembers(fields) {
  const { data } = await supabase.from('members').select(fields).eq('is_active', true)
  return data || []
}

// Returns Sets of excluded member_ids / family_ids for fast lookup
async function fetchExclusionSets() {
  const { data } = await supabase
    .from('announcement_exclusions')
    .select('member_id,family_id,exclusion_type')
  const rows = data || []
  return {
    birthdayIds: new Set(
      rows.filter(e => e.exclusion_type === 'birthday' || e.exclusion_type === 'both')
          .map(e => e.member_id)
    ),
    anniversaryFamilyIds: new Set(
      rows.filter(e => e.exclusion_type === 'anniversary' || e.exclusion_type === 'both')
          .map(e => e.family_id).filter(Boolean)
    ),
  }
}

export async function getUpcomingBirthdays(days = 7) {
  const [members, { birthdayIds }] = await Promise.all([
    fetchActiveMembers('member_id,family_id,member_name,whatsapp,mobile,dob_actual'),
    fetchExclusionSets(),
  ])
  const today = new Date()
  const results = []

  for (let i = 0; i < days; i++) {
    const target = new Date(today); target.setDate(today.getDate() + i)
    const mon = target.getMonth() + 1, day = target.getDate()
    const iso = target.toISOString().split('T')[0]

    members.filter(m => {
      if (!m.dob_actual) return false
      if (birthdayIds.has(m.member_id)) return false
      const dob = new Date(m.dob_actual)
      return dob.getMonth() + 1 === mon && dob.getDate() === day
    }).forEach(m => {
      const birthYear = new Date(m.dob_actual).getFullYear()
      results.push({
        ...m, eventDate: iso, daysAway: i, eventType: 'birthday',
        displayName: m.member_name,
        age: target.getFullYear() - birthYear,
        dayName: dayName(iso),
      })
    })
  }
  return results
}

export async function getUpcomingAnniversaries(days = 7) {
  const [members, { anniversaryFamilyIds }] = await Promise.all([
    fetchActiveMembers('member_id,family_id,member_name,spouse_name,whatsapp,mobile,date_of_marriage,marital_status'),
    fetchExclusionSets(),
  ])
  const married = members.filter(m =>
    m.marital_status === 'Married' && m.date_of_marriage && !anniversaryFamilyIds.has(m.family_id)
  )

  // Deduplicate by family_id (keep first)
  const seen = new Set()
  const deduped = married.filter(m => {
    if (seen.has(m.family_id)) return false
    seen.add(m.family_id); return true
  })

  const today = new Date()
  const results = []

  for (let i = 0; i < days; i++) {
    const target = new Date(today); target.setDate(today.getDate() + i)
    const mon = target.getMonth() + 1, day = target.getDate()
    const iso = target.toISOString().split('T')[0]

    deduped.filter(m => {
      if (!m.date_of_marriage) return false
      const dom = new Date(m.date_of_marriage)
      return dom.getMonth() + 1 === mon && dom.getDate() === day
    }).forEach(m => {
      const weddingYear = new Date(m.date_of_marriage).getFullYear()
      const displayName = m.spouse_name ? `${m.member_name} & ${m.spouse_name}` : m.member_name
      results.push({
        ...m, eventDate: iso, daysAway: i, eventType: 'anniversary',
        displayName, years: target.getFullYear() - weddingYear,
        dayName: dayName(iso),
      })
    })
  }
  return results
}

export async function getBirthdaysInRange(startDate, endDate) {
  const [members, { birthdayIds }] = await Promise.all([
    fetchActiveMembers('member_id,family_id,member_name,whatsapp,mobile,dob_actual'),
    fetchExclusionSets(),
  ])
  const start = new Date(startDate), end = new Date(endDate)
  const results = []
  let serial = 1

  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const mon = d.getMonth() + 1, day = d.getDate()
    const iso = new Date(d).toISOString().split('T')[0]

    members.filter(m => {
      if (!m.dob_actual) return false
      if (birthdayIds.has(m.member_id)) return false
      const dob = new Date(m.dob_actual)
      return dob.getMonth() + 1 === mon && dob.getDate() === day
    }).forEach(m => {
      const birthYear = new Date(m.dob_actual).getFullYear()
      results.push({
        serial: serial++, ...m,
        eventDate: iso, displayDate: fmtDate(iso),
        age: new Date(iso).getFullYear() - birthYear,
        dayName: dayName(iso),
      })
    })
  }
  return results
}

export async function getAnniversariesInRange(startDate, endDate) {
  const [members, { anniversaryFamilyIds }] = await Promise.all([
    fetchActiveMembers('member_id,family_id,member_name,spouse_name,whatsapp,mobile,date_of_marriage,marital_status'),
    fetchExclusionSets(),
  ])
  const married = members.filter(m =>
    m.marital_status === 'Married' && m.date_of_marriage && !anniversaryFamilyIds.has(m.family_id)
  )
  const seen = new Set()
  const deduped = married.filter(m => {
    if (seen.has(m.family_id)) return false
    seen.add(m.family_id); return true
  })

  const start = new Date(startDate), end = new Date(endDate)
  const results = []
  let serial = 1

  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const mon = d.getMonth() + 1, day = d.getDate()
    const iso = new Date(d).toISOString().split('T')[0]

    deduped.filter(m => {
      const dom = new Date(m.date_of_marriage)
      return dom.getMonth() + 1 === mon && dom.getDate() === day
    }).forEach(m => {
      const weddingYear = new Date(m.date_of_marriage).getFullYear()
      const displayName = m.spouse_name ? `${m.member_name} & ${m.spouse_name}` : m.member_name
      results.push({
        serial: serial++, ...m, displayName,
        eventDate: iso, displayDate: fmtDate(iso),
        years: new Date(iso).getFullYear() - weddingYear,
        dayName: dayName(iso),
      })
    })
  }
  return results
}

// ── Bible verses ──────────────────────────────────────────────

export async function getBibleVerses(type) {
  const { data } = await supabase
    .from('bible_verses').select('*').eq('type', type).order('created_at')
  return data || []
}

export async function getRandomVerse(type) {
  const { data } = await supabase
    .from('bible_verses').select('*').eq('type', type).eq('is_active', true)
  if (!data?.length) return null
  return data[Math.floor(Math.random() * data.length)]
}

export async function saveBibleVerse(verse) {
  if (verse.id) {
    const { error } = await supabase.from('bible_verses').update(verse).eq('id', verse.id)
    if (error) throw error
  } else {
    const { error } = await supabase.from('bible_verses').insert(verse)
    if (error) throw error
  }
}

export async function deleteBibleVerse(id) {
  const { error } = await supabase.from('bible_verses').delete().eq('id', id)
  if (error) throw error
}

export async function toggleVerseActive(id, is_active) {
  const { error } = await supabase.from('bible_verses').update({ is_active }).eq('id', id)
  if (error) throw error
}

export async function bulkUpsertVerses(verses) {
  const { error } = await supabase
    .from('bible_verses')
    .upsert(verses, { onConflict: 'type,verse_reference' })
  if (error) throw error
  return verses.length
}

// ── Settings ──────────────────────────────────────────────────

export async function getAnnouncementSettings() {
  const { data } = await supabase
    .from('announcement_settings').select('*').limit(1).maybeSingle()
  return data
}

export async function saveAnnouncementSettings(settings, updatedBy) {
  const payload = { ...settings, updated_at: new Date().toISOString(), updated_by: updatedBy }
  const existing = await getAnnouncementSettings()
  if (existing) {
    const { error } = await supabase.from('announcement_settings').update(payload).eq('id', existing.id)
    if (error) throw error
  } else {
    const { error } = await supabase.from('announcement_settings').insert(payload)
    if (error) throw error
  }
}

// ── Exclusion Wish List ───────────────────────────────────────

export async function getExclusions() {
  const { data, error } = await supabase
    .from('announcement_exclusions').select('*').order('member_name')
  if (error) throw error
  return data || []
}

export async function upsertExclusion({ member_id, member_name, family_id, exclusion_type, reason, added_by }) {
  const { error } = await supabase
    .from('announcement_exclusions')
    .upsert(
      { member_id, member_name, family_id, exclusion_type, reason, added_by, added_at: new Date().toISOString() },
      { onConflict: 'member_id' }
    )
  if (error) throw error
}

export async function removeExclusion(id) {
  const { error } = await supabase.from('announcement_exclusions').delete().eq('id', id)
  if (error) throw error
}

// ── Log ───────────────────────────────────────────────────────

export async function logAnnouncement(entry) {
  const { error } = await supabase.from('announcements_log').insert({
    ...entry, sent_at: new Date().toISOString()
  })
  if (error) console.error('[logAnnouncement]', error)
}

export async function getAnnouncementsLog({ limit = 100, offset = 0, logType = '', status = '' } = {}) {
  let q = supabase.from('announcements_log').select('*', { count: 'exact' })
    .order('sent_at', { ascending: false }).range(offset, offset + limit - 1)
  if (logType) q = q.eq('log_type', logType)
  if (status)  q = q.eq('status', status)
  const { data, count, error } = await q
  if (error) throw error
  return { data: data || [], count: count || 0 }
}

// ── Storage helpers ───────────────────────────────────────────

export async function uploadToStorage(bucket, path, blob, contentType = 'image/jpeg') {
  const { error } = await supabase.storage.from(bucket).upload(path, blob, {
    contentType, upsert: true
  })
  if (error) throw error
  const { data } = supabase.storage.from(bucket).getPublicUrl(path)
  return data.publicUrl
}

// ── Week range helpers ────────────────────────────────────────

export function getNextWeekRange() {
  const today = new Date()
  const day = today.getDay() // 0=Sun
  const daysUntilNextSun = day === 0 ? 7 : 7 - day
  const nextSun = new Date(today)
  nextSun.setDate(today.getDate() + daysUntilNextSun)
  const nextSat = new Date(nextSun)
  nextSat.setDate(nextSun.getDate() + 6)
  return {
    start: nextSun.toISOString().split('T')[0],
    end: nextSat.toISOString().split('T')[0],
  }
}
