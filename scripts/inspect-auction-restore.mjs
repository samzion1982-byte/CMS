/**
 * Inspect auction_tracker FYs + recent recycle-bin snapshots for restore.
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

async function main() {
  const env = loadEnv()
  const sb = createClient(
    env.VITE_SUPABASE_URL,
    env.VITE_SUPABASE_SERVICE_ROLE || env.VITE_SUPABASE_ANON_KEY
  )

  const { data: all } = await sb
    .from('auction_tracker')
    .select('financial_year,member_id,member_name,previous_pending,current_year_purchase,total')
    .order('financial_year')
    .order('member_name')

  const byFy = {}
  for (const r of all || []) {
    if (!byFy[r.financial_year]) byFy[r.financial_year] = []
    byFy[r.financial_year].push(r)
  }
  for (const [fy, rows] of Object.entries(byFy)) {
    console.log(`\n=== FY ${fy}: ${rows.length} rows ===`)
    const focus = rows.filter(r => ['A01701', 'M00301'].includes(r.member_id))
    console.log('Focus members:', focus)
    if (rows.length <= 5) console.log(rows)
    else {
      const sum = rows.reduce(
        (a, r) => ({
          prev: a.prev + (Number(r.previous_pending) || 0),
          curr: a.curr + (Number(r.current_year_purchase) || 0),
          total: a.total + (Number(r.total) || 0),
        }),
        { prev: 0, curr: 0, total: 0 }
      )
      console.log('Totals:', sum)
      console.log('Sample 3:', rows.slice(0, 3))
    }
  }

  const { data: snaps } = await sb
    .from('cms_recycle_bin')
    .select('id,record_label,notes,created_at,status,payload')
    .eq('table_name', 'auction_tracker')
    .order('created_at', { ascending: false })
    .limit(15)

  console.log('\n=== Recent auction_tracker recycle snapshots ===')
  for (const s of snaps || []) {
    const meta = s.payload?.meta || {}
    const rowCount = s.payload?.rows?.length ?? 0
    console.log({
      id: s.id,
      label: s.record_label,
      notes: s.notes,
      created: s.created_at,
      status: s.status,
      operation: meta.operation,
      fy: meta.financial_year,
      to_fy: meta.to_financial_year,
      rows: rowCount,
    })
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
