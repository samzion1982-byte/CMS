/**
 * Revert test Close Year + 2-entry import: delete FY 2026-27 tracker rows.
 * Leaves FY 2025-26 unchanged (still "open").
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

const FY = '2026-27'

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
    console.log('Nothing to revert')
    return
  }

  const { error: snapErr } = await sb.from('cms_recycle_bin').insert({
    module: 'finance',
    table_name: 'auction_tracker',
    record_id: `auction_tracker:FY:${FY}:revert_close_test:${Date.now()}`,
    record_label: `Auction tracker FY ${FY} (${rows.length} members) — revert close/test import`,
    payload: {
      kind: 'table_snapshot',
      rows,
      meta: { financial_year: FY, operation: 'revert_close_year_test' },
    },
    notes: 'Revert test Close Year + Abraham/Manohar import; keep 2025-26 open',
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
  console.log(`Deleted ${deleted?.length ?? 0} rows from ${FY}`)

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
