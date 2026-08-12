/**
 * One-off: delete orphan auction_tracker FY 2027-28 (after Recycle Bin snapshot).
 * Usage: node scripts/cleanup-auction-fy-2027-28.mjs
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

const FY = '2027-28'

async function main() {
  const env = loadEnv()
  const sb = createClient(
    env.VITE_SUPABASE_URL,
    env.VITE_SUPABASE_SERVICE_ROLE || env.VITE_SUPABASE_ANON_KEY
  )

  const { data: rows, error } = await sb
    .from('auction_tracker')
    .select('*')
    .eq('financial_year', FY)
  if (error) throw error

  console.log(`Rows in ${FY}:`, rows?.length ?? 0)
  if (!rows?.length) {
    console.log('Nothing to clean')
    return
  }

  const { error: snapErr } = await sb.from('cms_recycle_bin').insert({
    module: 'finance',
    table_name: 'auction_tracker',
    record_id: `auction_tracker:FY:${FY}:cleanup:${Date.now()}`,
    record_label: `Auction tracker FY ${FY} (${rows.length} members) — cleanup`,
    payload: {
      kind: 'table_snapshot',
      rows,
      meta: { financial_year: FY, operation: 'cleanup_orphan_fy' },
    },
    notes: 'Cleanup orphan FY 2027-28 (bad Close Year under old labeling)',
    status: 'deleted',
  })
  if (snapErr) throw snapErr
  console.log('Snapshot saved')

  const { data: deleted, error: dErr } = await sb
    .from('auction_tracker')
    .delete()
    .eq('financial_year', FY)
    .select('member_id')
  if (dErr) throw dErr
  console.log(`Deleted ${deleted?.length ?? 0} rows`)

  const { data: after } = await sb.from('auction_tracker').select('financial_year')
  const byFy = {}
  for (const r of after || []) {
    byFy[r.financial_year] = (byFy[r.financial_year] || 0) + 1
  }
  console.log('FY counts after:', byFy)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
