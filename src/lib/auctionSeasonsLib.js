import { supabase } from './supabase'

export async function getAuctionSeason(fy) {
  if (!fy) return null
  const { data, error } = await supabase
    .from('auction_seasons')
    .select('*')
    .eq('financial_year', fy)
    .maybeSingle()
  if (error) {
    if (String(error.message || '').includes('auction_seasons')) return null
    throw error
  }
  return data || null
}

export async function upsertAuctionSeason(fy, patch) {
  if (!fy) throw new Error('Financial year is required.')
  const row = {
    financial_year: fy,
    updated_at: new Date().toISOString(),
    ...patch,
  }
  const { data, error } = await supabase
    .from('auction_seasons')
    .upsert(row, { onConflict: 'financial_year' })
    .select('*')
    .single()
  if (error) throw error
  return data
}

export async function listCloseBalances(fy) {
  if (!fy) return []
  const { data, error } = await supabase
    .from('auction_close_balances')
    .select('member_id,member_name,balance')
    .eq('financial_year', fy)
  if (error) {
    if (String(error.message || '').includes('auction_close_balances')) return []
    throw error
  }
  return data || []
}

export async function replaceCloseBalances(fy, rows) {
  const { error: delErr } = await supabase
    .from('auction_close_balances')
    .delete()
    .eq('financial_year', fy)
  if (delErr) throw delErr
  if (!rows?.length) return
  const CHUNK = 500
  const payload = rows.map((r) => ({
    financial_year: fy,
    member_id: r.member_id,
    member_name: r.member_name || '',
    balance: Number(r.balance) || 0,
  }))
  for (let i = 0; i < payload.length; i += CHUNK) {
    const { error } = await supabase
      .from('auction_close_balances')
      .insert(payload.slice(i, i + CHUNK))
    if (error) throw error
  }
}

export async function reopenAuctionSeason(fy, { auctionDate = null } = {}) {
  const existing = await getAuctionSeason(fy)
  if (!existing) {
    throw new Error(`No closed season found for FY ${fy}. Close Year may not have saved.`)
  }
  await replaceCloseBalances(fy, [])
  const { data, error } = await supabase
    .from('auction_seasons')
    .update({
      status: 'open',
      close_policy: null,
      next_auction_date: null,
      close_cutoff_date: null,
      closed_at: null,
      auction_date: auctionDate || existing.auction_date,
      updated_at: new Date().toISOString(),
    })
    .eq('financial_year', fy)
    .select('*')
    .single()
  if (error) throw error
  return data
}
