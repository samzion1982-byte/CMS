/* ═══════════════════════════════════════════════════════════════
   simpleAccountsLib.js — Queries and helpers for Simple Accounts
   ═══════════════════════════════════════════════════════════════ */

import { supabase } from './supabase'

// ── Helpers ───────────────────────────────────────────────────────

export function fmtAmt(n, currency = '₹') {
  if (n === null || n === undefined) return '—'
  return currency + Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function fmtDate(s) {
  if (!s) return '—'
  const [y, m, d] = s.split('-')
  return `${d}/${m}/${y}`
}

export function todayISO() {
  return new Date().toISOString().slice(0, 10)
}

const MONTH_LABELS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
export function monthLabel(m) { return MONTH_LABELS[m - 1] }

export function monthRange(year, month) {
  const last = new Date(year, month, 0).getDate()
  const mm   = String(month).padStart(2, '0')
  return { from: `${year}-${mm}-01`, to: `${year}-${mm}-${last}` }
}

export function fiscalYearRange(year, fiscalMonth = 4) {
  const endYear  = year + 1
  const startMM  = String(fiscalMonth).padStart(2, '0')
  const endMonth = fiscalMonth === 1 ? 12 : fiscalMonth - 1
  const endMM    = String(endMonth).padStart(2, '0')
  const endLast  = new Date(endYear, endMonth, 0).getDate()
  return { from: `${year}-${startMM}-01`, to: `${endYear}-${endMM}-${endLast}` }
}

export function currentFiscalStartYear(fiscalMonth = 4) {
  const d = new Date()
  const m = d.getMonth() + 1
  const y = d.getFullYear()
  return m >= fiscalMonth ? y : y - 1
}

// ── Settings ──────────────────────────────────────────────────────

export async function getSimpleSettings() {
  const { data } = await supabase
    .from('churches')
    .select('simple_accounting_enabled, simple_accounting_currency, simple_accounting_fiscal_month, simple_accounting_report_title, simple_accounting_default_account')
    .limit(1).single()
  return {
    enabled:        data?.simple_accounting_enabled        ?? false,
    currency:       data?.simple_accounting_currency       ?? '₹',
    fiscalMonth:    data?.simple_accounting_fiscal_month   ?? 4,
    reportTitle:    data?.simple_accounting_report_title   ?? '',
    defaultAccount: data?.simple_accounting_default_account ?? null,
  }
}

export async function saveSimpleSettings(updates) {
  const { error } = await supabase.from('churches').update({
    simple_accounting_currency:        updates.currency,
    simple_accounting_fiscal_month:    updates.fiscalMonth,
    simple_accounting_report_title:    updates.reportTitle,
    simple_accounting_default_account: updates.defaultAccount || null,
  }).gte('id', '00000000-0000-0000-0000-000000000000')
  if (error) throw error
}

export async function toggleSimpleAccounting(val) {
  const { error } = await supabase.from('churches')
    .update({ simple_accounting_enabled: val })
    .gte('id', '00000000-0000-0000-0000-000000000000')
  if (error) throw error
}

// ── Accounts ──────────────────────────────────────────────────────

export async function getSimpleAccounts(includeInactive = false) {
  let q = supabase.from('simple_accounts').select('*')
  if (!includeInactive) q = q.eq('is_active', true)
  const { data, error } = await q.order('sort_order').order('name')
  if (error) throw error
  return data || []
}

export async function createSimpleAccount(account, userEmail) {
  const { data, error } = await supabase.from('simple_accounts').insert({
    ...account,
    created_by: userEmail,
    updated_by: userEmail,
  }).select().single()
  if (error) throw error
  return data
}

export async function updateSimpleAccount(id, updates, userEmail) {
  const { error } = await supabase.from('simple_accounts')
    .update({ ...updates, updated_by: userEmail, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

export async function deactivateSimpleAccount(id, userEmail) {
  const { error } = await supabase.from('simple_accounts')
    .update({ is_active: false, updated_by: userEmail, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

// Compute balance for every account in one pass (opening + transactions)
export async function getAllAccountBalances(accounts) {
  const { data: txns } = await supabase
    .from('simple_transactions')
    .select('txn_type, amount, account_id, to_account_id')
    .eq('is_deleted', false)

  const balances = {}
  for (const a of accounts) balances[a.id] = Number(a.opening_balance || 0)

  for (const t of txns || []) {
    const amt = Number(t.amount)
    if (t.txn_type === 'income'   && balances[t.account_id]    !== undefined) balances[t.account_id]    += amt
    if (t.txn_type === 'expense'  && balances[t.account_id]    !== undefined) balances[t.account_id]    -= amt
    if (t.txn_type === 'transfer' && balances[t.account_id]    !== undefined) balances[t.account_id]    -= amt
    if (t.txn_type === 'transfer' && balances[t.to_account_id] !== undefined) balances[t.to_account_id] += amt
  }
  return balances
}

// ── Categories ────────────────────────────────────────────────────

export async function getSimpleCategories(type = null) {
  let q = supabase.from('simple_categories').select('*').eq('is_active', true)
  if (type) q = q.eq('type', type)
  const { data, error } = await q.order('sort_order').order('name')
  if (error) throw error
  return data || []
}

export async function createSimpleCategory(cat) {
  const { data, error } = await supabase.from('simple_categories').insert({
    ...cat, created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  }).select().single()
  if (error) throw error
  return data
}

export async function updateSimpleCategory(id, updates) {
  const { error } = await supabase.from('simple_categories')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

export async function deactivateSimpleCategory(id) {
  const { error } = await supabase.from('simple_categories')
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

// Returns a map of category_id → transaction count (for preventing delete with data)
export async function getCategoryUsageCounts() {
  const { data } = await supabase
    .from('simple_transactions')
    .select('category_id')
    .eq('is_deleted', false)
  const counts = {}
  for (const t of data || []) {
    if (t.category_id) counts[t.category_id] = (counts[t.category_id] || 0) + 1
  }
  return counts
}

// ── Transactions ──────────────────────────────────────────────────

export async function getSimpleTransactions({ from, to, type, categoryId, accountId, limit = 500 } = {}) {
  let q = supabase
    .from('simple_transactions')
    .select(`
      *,
      category:category_id(id, name, type),
      account:account_id(id, name, account_type),
      to_account:to_account_id(id, name, account_type)
    `)
    .eq('is_deleted', false)
    .order('txn_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(limit)

  if (from)       q = q.gte('txn_date', from)
  if (to)         q = q.lte('txn_date', to)
  if (type)       q = q.eq('txn_type', type)
  if (categoryId) q = q.eq('category_id', categoryId)
  if (accountId)  q = q.or(`account_id.eq.${accountId},to_account_id.eq.${accountId}`)

  const { data, error } = await q
  if (error) throw error
  return data || []
}

export async function createSimpleTransaction(txn, userEmail) {
  const { data, error } = await supabase.from('simple_transactions').insert({
    ...txn,
    created_by: userEmail,
    updated_by: userEmail,
  }).select().single()
  if (error) throw error
  return data
}

export async function updateSimpleTransaction(id, updates, userEmail) {
  const { error } = await supabase.from('simple_transactions')
    .update({ ...updates, updated_by: userEmail, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

export async function deleteSimpleTransaction(id, userEmail) {
  const { error } = await supabase.from('simple_transactions')
    .update({ is_deleted: true, updated_by: userEmail, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

// ── Dashboard stats ────────────────────────────────────────────────

export async function getDashboardStats(fiscalMonth = 4) {
  const now = new Date()
  const yr  = now.getFullYear()
  const mo  = now.getMonth() + 1

  const { from: mFrom, to: mTo } = monthRange(yr, mo)
  const fyStartYear = mo >= fiscalMonth ? yr : yr - 1
  const { from: fyFrom, to: fyTo } = fiscalYearRange(fyStartYear, fiscalMonth)

  const [monthRes, ytdRes, recentRes] = await Promise.all([
    supabase.from('simple_transactions')
      .select('txn_type, amount')
      .eq('is_deleted', false).in('txn_type', ['income', 'expense'])
      .gte('txn_date', mFrom).lte('txn_date', mTo),

    supabase.from('simple_transactions')
      .select('txn_type, amount')
      .eq('is_deleted', false).in('txn_type', ['income', 'expense'])
      .gte('txn_date', fyFrom).lte('txn_date', fyTo),

    supabase.from('simple_transactions')
      .select('*, category:category_id(name, type), account:account_id(name)')
      .eq('is_deleted', false)
      .order('txn_date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(10),
  ])

  function tally(rows) {
    const income  = (rows || []).filter(r => r.txn_type === 'income') .reduce((s, r) => s + Number(r.amount), 0)
    const expense = (rows || []).filter(r => r.txn_type === 'expense').reduce((s, r) => s + Number(r.amount), 0)
    return { income, expense, balance: income - expense }
  }

  return {
    month:  tally(monthRes.data),
    ytd:    tally(ytdRes.data),
    recent: recentRes.data || [],
    fyLabel: `${fyStartYear}-${String(fyStartYear + 1).slice(2)}`,
  }
}

// ── Reports ────────────────────────────────────────────────────────

export async function getMonthlyReport(year) {
  const { data, error } = await supabase
    .from('simple_transactions')
    .select('txn_type, amount, txn_date')
    .eq('is_deleted', false)
    .in('txn_type', ['income', 'expense'])
    .gte('txn_date', `${year}-01-01`)
    .lte('txn_date', `${year}-12-31`)
  if (error) throw error

  const months = {}
  for (let m = 1; m <= 12; m++) months[m] = { income: 0, expense: 0 }

  for (const t of data || []) {
    const m = parseInt(t.txn_date.slice(5, 7))
    if (t.txn_type === 'income')  months[m].income  += Number(t.amount)
    if (t.txn_type === 'expense') months[m].expense += Number(t.amount)
  }

  return Object.entries(months).map(([m, v]) => ({
    month:   parseInt(m),
    label:   monthLabel(parseInt(m)),
    income:  v.income,
    expense: v.expense,
    surplus: v.income - v.expense,
  }))
}

export async function getCategoryReport({ type, from, to }) {
  let q = supabase
    .from('simple_transactions')
    .select('amount, category:category_id(id, name)')
    .eq('is_deleted', false)
    .eq('txn_type', type)
  if (from) q = q.gte('txn_date', from)
  if (to)   q = q.lte('txn_date', to)
  const { data, error } = await q
  if (error) throw error

  const byCategory = {}
  let uncategorized = 0
  for (const t of data || []) {
    if (!t.category) { uncategorized += Number(t.amount); continue }
    const key = t.category.id
    if (!byCategory[key]) byCategory[key] = { name: t.category.name, total: 0 }
    byCategory[key].total += Number(t.amount)
  }

  const rows = Object.values(byCategory).sort((a, b) => b.total - a.total)
  if (uncategorized > 0) rows.push({ name: 'Uncategorized', total: uncategorized })
  return rows
}
