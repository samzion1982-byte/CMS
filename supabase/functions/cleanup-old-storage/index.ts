// @ts-nocheck
/* ═══════════════════════════════════════════════════════════════
   cleanup-old-storage — FIFO auto-flush for transient storage
   buckets + login_logs. Template files and folders are never touched.
   ═══════════════════════════════════════════════════════════════ */

import { serve }        from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const sb           = createClient(SUPABASE_URL, SERVICE_KEY)

const RULES = [
  { bucket: 'announcement-cards',   maxAgeHours: 48  },
  { bucket: 'announcement-reports', maxAgeHours: 48  },
  { bucket: 'family-records',       maxAgeHours: 168 },
  { bucket: 'payment-pages',        maxAgeHours: 168 },
]

const DB_RULES = [
  { table: 'login_logs', maxAgeDays: 15, dateColumn: 'login_at' },
]

// A file is a template if its name contains "template" OR if it has no
// metadata (meaning it is a folder placeholder, e.g. the templates/ dir).
const isTemplate = (f: any) =>
  !f.metadata || f.name.toLowerCase().includes('template')

serve(async (_req) => {
  const summary: any[] = []
  const now = Date.now()

  for (const rule of RULES) {
    const { data: rootItems, error: listErr } = await sb.storage
      .from(rule.bucket).list('', { limit: 10_000 })

    if (listErr) {
      summary.push({ bucket: rule.bucket, deleted: 0, error: listErr.message })
      continue
    }

    const threshold = new Date(now - rule.maxAgeHours * 3_600_000)
    const toDelete: string[] = []

    for (const item of (rootItems ?? [])) {
      if (item.metadata) {
        // Root-level file
        if (isTemplate(item)) continue
        if (new Date(item.created_at) < threshold) toDelete.push(item.name)
      } else {
        // Subfolder — skip template* folders
        if (item.name.toLowerCase().includes('template')) continue
        const { data: subItems } = await sb.storage
          .from(rule.bucket).list(item.name, { limit: 10_000 })
        for (const f of (subItems ?? [])) {
          if (!f.metadata) continue
          if (isTemplate(f)) continue
          if (new Date(f.created_at) < threshold) toDelete.push(`${item.name}/${f.name}`)
        }
      }
    }

    if (!toDelete.length) {
      summary.push({ bucket: rule.bucket, deleted: 0, error: null })
      continue
    }

    let delErrMsg: string | null = null
    let deleted = 0
    for (let i = 0; i < toDelete.length; i += 100) {
      const chunk = toDelete.slice(i, i + 100)
      const { error: delErr } = await sb.storage.from(rule.bucket).remove(chunk)
      if (delErr) { delErrMsg = delErr.message; break }
      deleted += chunk.length
    }
    summary.push({
      bucket:  rule.bucket,
      deleted,
      error:   delErrMsg,
    })
  }

  // DB table cleanup (service role bypasses RLS)
  for (const rule of DB_RULES) {
    const cutoff = new Date(now - rule.maxAgeDays * 24 * 60 * 60 * 1000).toISOString()
    const ids: string[] = []
    let staleErrMsg: string | null = null
    for (let from = 0; ; from += 1000) {
      const { data: page, error: staleErr } = await sb
        .from(rule.table)
        .select('id')
        .lt(rule.dateColumn, cutoff)
        .range(from, from + 999)
      if (staleErr) { staleErrMsg = staleErr.message; break }
      const rows = page ?? []
      ids.push(...rows.map((r: any) => r.id))
      if (rows.length < 1000) break
    }

    if (staleErrMsg) {
      summary.push({ table: rule.table, deleted: 0, error: staleErrMsg })
      continue
    }
    if (!ids.length) {
      summary.push({ table: rule.table, deleted: 0, error: null })
      continue
    }

    let deleted = 0
    let delErrMsg: string | null = null
    for (let i = 0; i < ids.length; i += 200) {
      const chunk = ids.slice(i, i + 200)
      const { error: delErr, count } = await sb
        .from(rule.table)
        .delete({ count: 'exact' })
        .in('id', chunk)
      if (delErr) { delErrMsg = delErr.message; break }
      deleted += count || chunk.length
    }
    summary.push({ table: rule.table, deleted, error: delErrMsg })
  }

  console.log('[cleanup-old-storage]', JSON.stringify(summary))

  return new Response(
    JSON.stringify({ ok: true, summary, ran_at: new Date().toISOString() }),
    { headers: { 'Content-Type': 'application/json' } }
  )
})
