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

export async function reopenAuctionSeason(fy, { keepAuctionDate = true, auctionDate = null } = {}) {
  await replaceCloseBalances(fy, [])
  const patch = {
    status: 'open',
    close_policy: null,
    next_auction_date: null,
    close_cutoff_date: null,
    closed_at: null,
  }
  if (!keepAuctionDate && auctionDate) patch.auction_date = auctionDate
  const existing = await getAuctionSeason(fy)
  if (!existing?.auction_date && auctionDate) patch.auction_date = auctionDate
  if (!existing?.auction_date && !auctionDate && !patch.auction_date) {
    // reopen requires a date column NOT NULL — keep existing
  }
  if (existing) {
    return upsertAuctionSeason(fy, {
      auction_date: existing.auction_date,
      ...patch,
    })
  }
  return null
}
