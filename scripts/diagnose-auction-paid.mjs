/**
 * Diagnose where auction receipt payments live by FY.
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

  const { data: cats } = await sb
    .from('payment_categories')
    .select('id,name')
    .ilike('name', '%auction%')
  console.log('Auction cats:', cats)
  const catIds = (cats || []).map(c => c.id)
  if (!catIds.length) return

  // Get receipt_items for auction, join to receipts for FY
  const { data: items, error } = await sb
    .from('receipt_items')
    .select('receipt_id,total,category_id,receipts!inner(id,member_id,financial_year,receipt_date,receipt_number)')
    .in('category_id', catIds)
  if (error) throw error

  const byFy = {}
  let totalAmt = 0
  for (const it of items || []) {
    const fy = it.receipts?.financial_year || '?'
    if (!byFy[fy]) byFy[fy] = { count: 0, amount: 0, members: new Set() }
    byFy[fy].count++
    byFy[fy].amount += Number(it.total) || 0
    byFy[fy].members.add(it.receipts?.member_id)
    totalAmt += Number(it.total) || 0
  }

  const summary = Object.fromEntries(
    Object.entries(byFy).map(([fy, v]) => [
      fy,
      { items: v.count, amount: v.amount, members: v.members.size },
    ])
  )
  console.log('Auction payments by receipt FY:', summary)
  console.log('Grand total auction amount:', totalAmt)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
