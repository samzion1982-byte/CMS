/**
 * Check if 2026-27 auction receipts are auction-only or mixed categories.
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
  const auctionCat = (cats || []).find(c => /auction/i.test(c.name))
  const catName = Object.fromEntries((cats || []).map(c => [c.id, c.name]))

  const { data: auctionItems } = await sb
    .from('receipt_items')
    .select('receipt_id, receipts!inner(id,financial_year)')
    .eq('category_id', auctionCat.id)
    .eq('receipts.financial_year', '2026-27')

  const recIds = [...new Set((auctionItems || []).map(i => i.receipt_id))]
  console.log('Receipts with auction on 2026-27:', recIds.length)

  const { data: allItems } = await sb
    .from('receipt_items')
    .select('receipt_id,category_id,total')
    .in('receipt_id', recIds)

  let auctionOnly = 0
  let mixed = 0
  const mixedSamples = []
  const byRec = {}
  for (const it of allItems || []) {
    if (!byRec[it.receipt_id]) byRec[it.receipt_id] = []
    byRec[it.receipt_id].push(it)
  }
  for (const [rid, items] of Object.entries(byRec)) {
    const names = items.map(i => catName[i.category_id] || i.category_id)
    const nonAuction = names.filter(n => !/auction/i.test(n))
    if (nonAuction.length) {
      mixed++
      if (mixedSamples.length < 5) {
        mixedSamples.push({ rid, cats: names, totals: items.map(i => i.total) })
      }
    } else auctionOnly++
  }
  console.log({ auctionOnly, mixed, mixedSamples })
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
