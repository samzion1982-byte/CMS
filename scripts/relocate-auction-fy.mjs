/**
 * One-off: move auction_tracker rows from FY 2026-27 → 2025-26
 * (Auction 2025 season incorrectly stored under 2026-27).
 *
 * Usage: node scripts/relocate-auction-fy.mjs
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')

function loadEnv() {
  const raw = readFileSync(resolve(root, '.env.local'), 'utf8')
  const env = {}
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^([^#=]+)=(.*)$/)
    if (!m) continue
    env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '')
  }
  return env
}

const FROM_FY = '2026-27'
const TO_FY = '2025-26'

async function main() {
  const env = loadEnv()
  const url = env.VITE_SUPABASE_URL
  const key = env.VITE_SUPABASE_SERVICE_ROLE || env.VITE_SUPABASE_ANON_KEY
  if (!url || !key) throw new Error('Missing VITE_SUPABASE_URL or service/anon key')

  const sb = createClient(url, key)

  const { data: counts, error: cErr } = await sb
    .from('auction_tracker')
    .select('financial_year')
  if (cErr) throw cErr

  const byFy = {}
  for (const r of counts || []) {
    byFy[r.financial_year] = (byFy[r.financial_year] || 0) + 1
  }
  console.log('FY counts before:', byFy)

  const fromCount = byFy[FROM_FY] || 0
  const toCount = byFy[TO_FY] || 0
  if (!fromCount) {
    console.log(`Nothing to move — no rows in ${FROM_FY}`)
    return
  }
  if (toCount > 0) {
    throw new Error(
      `Refusing to move: ${TO_FY} already has ${toCount} rows. Restore/clear that FY first.`
    )
  }

  const { data: rows, error: fErr } = await sb
    .from('auction_tracker')
    .select('*')
    .eq('financial_year', FROM_FY)
  if (fErr) throw fErr

  // Recycle Bin snapshot of pre-move state (source FY)
  const { error: snapErr } = await sb.from('cms_recycle_bin').insert({
    module: 'finance',
    table_name: 'auction_tracker',
    record_id: `auction_tracker:FY:${FROM_FY}:relocate:${Date.now()}`,
    record_label: `Auction tracker FY ${FROM_FY} → ${TO_FY} (${rows.length} members)`,
    payload: {
      kind: 'table_snapshot',
      rows,
      meta: {
        financial_year: FROM_FY,
        operation: 'fy_relabel',
        to_financial_year: TO_FY,
      },
    },
    notes: `Relocate auction tracker ${FROM_FY} → ${TO_FY} (Option A: Auction 2025)`,
    status: 'deleted',
  })
  if (snapErr) {
    console.warn('Snapshot warning (continuing):', snapErr.message)
  } else {
    console.log(`Snapshot saved for ${FROM_FY} (${rows.length} rows)`)
  }

  // Update FY on each row (unique on financial_year,member_id — target empty)
  const { data: updated, error: uErr } = await sb
    .from('auction_tracker')
    .update({ financial_year: TO_FY })
    .eq('financial_year', FROM_FY)
    .select('member_id')
  if (uErr) throw uErr

  console.log(`Updated ${updated?.length ?? 0} rows: ${FROM_FY} → ${TO_FY}`)

  const { data: after } = await sb.from('auction_tracker').select('financial_year')
  const byFyAfter = {}
  for (const r of after || []) {
    byFyAfter[r.financial_year] = (byFyAfter[r.financial_year] || 0) + 1
  }
  console.log('FY counts after:', byFyAfter)
  console.log(`Done. Open Auction Report → FY ${TO_FY} — column should be ${TO_FY.slice(0, 4)}.`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
