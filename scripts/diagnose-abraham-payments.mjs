/**
 * Inspect Abraham (A01701) auction-related receipts.
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

  const memberId = 'A01701'
  const { data: cats } = await sb.from('payment_categories').select('id,name')
  const auctionCats = (cats || []).filter(c => /auction/i.test(c.name))
  const catName = Object.fromEntries((cats || []).map(c => [c.id, c.name]))
  console.log('Auction cats:', auctionCats)

  const { data: recs, error } = await sb
    .from('receipts')
    .select('id,receipt_number,receipt_date,financial_year,member_id,member_name,grand_total,created_at')
    .eq('member_id', memberId)
    .order('receipt_date', { ascending: false })
    .limit(20)
  if (error) throw error
  console.log('Recent receipts for', memberId, ':', recs?.length)

  for (const r of recs || []) {
    const { data: items } = await sb
      .from('receipt_items')
      .select('category_id,total,amt,months')
      .eq('receipt_id', r.id)
    const lines = (items || []).map(i => ({
      cat: catName[i.category_id] || i.category_id,
      total: i.total,
      amt: i.amt,
    }))
    const auctionTotal = lines
      .filter(l => /auction/i.test(l.cat))
      .reduce((s, l) => s + (Number(l.total) || 0), 0)
    console.log({
      no: r.receipt_number,
      date: r.receipt_date,
      fy: r.financial_year,
      created: r.created_at,
      grand: r.grand_total,
      auctionTotal,
      lines,
    })
  }

  // Count receipts per FY (all members) — check 1000 limit risk
  for (const fy of ['2025-26', '2026-27', '2027-28']) {
    const { count } = await sb
      .from('receipts')
      .select('id', { count: 'exact', head: true })
      .eq('financial_year', fy)
    console.log(`Receipts count FY ${fy}:`, count)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
