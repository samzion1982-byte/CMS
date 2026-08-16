import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const envPath = process.env.ENV_FILE || '.env.local'
const raw = readFileSync(resolve(envPath), 'utf8')
const env = {}
for (const line of raw.split(/\r?\n/)) {
  const t = line.trim()
  if (!t || t.startsWith('#')) continue
  const i = t.indexOf('=')
  if (i < 1) continue
  let v = t.slice(i + 1).trim()
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
  env[t.slice(0, i).trim()] = v
}
const sb = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_SERVICE_ROLE)

const { data: fys } = await sb.from('auction_tracker').select('financial_year')
const c = {}
for (const r of fys || []) c[r.financial_year] = (c[r.financial_year] || 0) + 1
console.log('FY counts', c)

const { data: rec } = await sb.from('receipts').select('id,receipt_number,member_id').eq('receipt_number', '2026-27_002768')
console.log('test receipt 002768', rec)

const { count: t26 } = await sb.from('auction_tracker').select('id', { count: 'exact', head: true }).eq('financial_year', '2026-27')
const { count: t27 } = await sb.from('auction_tracker').select('id', { count: 'exact', head: true }).eq('financial_year', '2027-28')
console.log('2026-27 rows', t26, '2027-28 rows', t27)
