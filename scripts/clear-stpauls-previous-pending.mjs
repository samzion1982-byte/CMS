/**
 * Clear auction_tracker.previous_pending only (FY 2025-26).
 * Keeps current_year_purchase. Does not touch receipts.
 * Snapshots first so Recycle Bin can restore.
 *
 * ENV_FILE=... node scripts/clear-stpauls-previous-pending.mjs
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')
const FY = '2025-26'

function loadEnv() {
  const envPath = process.env.ENV_FILE
    ? resolve(root, process.env.ENV_FILE)
    : resolve(root, '.env.local')
  const raw = readFileSync(envPath, 'utf8').replace(/^\uFEFF/, '')
  const env = {}
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const i = t.indexOf('=')
    if (i < 1) continue
    const key = t.slice(0, i).trim()
    let val = t.slice(i + 1).trim()
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1)
    }
    env[key] = val
  }
  return env
}

async function main() {
  const env = loadEnv()
  const sb = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_SERVICE_ROLE || env.VITE_SUPABASE_ANON_KEY)

  const { data: church } = await sb.from('churches').select('church_name').limit(1).single()
  console.log('CHURCH', church)

  const { data: rows, error } = await sb
    .from('auction_tracker')
    .select('*')
    .eq('financial_year', FY)
  if (error) throw error
  if (!rows?.length) {
    console.log('No tracker rows for', FY)
    return
  }

  const withPrev = rows.filter(r => Number(r.previous_pending) > 0)
  const prevSum = withPrev.reduce((s, r) => s + (Number(r.previous_pending) || 0), 0)
  console.log(`FY ${FY}: ${rows.length} rows, ${withPrev.length} with previous_pending, sum ${prevSum}`)

  const { error: snapErr } = await sb.from('cms_recycle_bin').insert({
    module: 'finance',
    table_name: 'auction_tracker',
    record_id: `auction_tracker:FY:${FY}:clear_previous_pending:${Date.now()}`,
    record_label: `Auction tracker FY ${FY} — before clearing previous pending (${rows.length} members)`,
    payload: {
      kind: 'table_snapshot',
      rows,
      meta: { financial_year: FY, operation: 'clear_previous_pending' },
    },
    notes: 'Snapshot before clearing previous_pending only; current_year_purchase and receipts unchanged',
    status: 'deleted',
  })
  if (snapErr) throw snapErr
  console.log('Snapshot saved')

  const updates = rows.map(r => ({
    member_id: r.member_id,
    member_name: r.member_name,
    financial_year: FY,
    previous_pending: 0,
    current_year_purchase: Number(r.current_year_purchase) || 0,
    total: Number(r.current_year_purchase) || 0,
  }))

  const CHUNK = 200
  for (let i = 0; i < updates.length; i += CHUNK) {
    const { error: upErr } = await sb
      .from('auction_tracker')
      .upsert(updates.slice(i, i + CHUNK), { onConflict: 'financial_year,member_id' })
    if (upErr) throw upErr
  }

  const { data: after } = await sb
    .from('auction_tracker')
    .select('previous_pending,current_year_purchase,total')
    .eq('financial_year', FY)
  const sum = (after || []).reduce((a, r) => ({
    prev: a.prev + (Number(r.previous_pending) || 0),
    curr: a.curr + (Number(r.current_year_purchase) || 0),
    total: a.total + (Number(r.total) || 0),
  }), { prev: 0, curr: 0, total: 0 })
  console.log('After:', { rows: after?.length, ...sum })

  await sb.from('cms_audit_log').insert({
    action: 'saved',
    module: 'finance',
    entity_type: 'auction_tracker',
    entity_id: FY,
    summary: `Cleared previous_pending on FY ${FY} (${withPrev.length} members, ${prevSum}); current_year_purchase unchanged`,
  })
}

main().catch(e => {
  console.error(e)
  process.exit(1)
})
