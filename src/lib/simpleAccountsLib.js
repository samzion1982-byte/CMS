/* ═══════════════════════════════════════════════════════════════
   simpleAccountsLib.js — Queries and helpers for Simple Accounts
   ═══════════════════════════════════════════════════════════════ */

import { supabase } from './supabase'

// ── Helpers ───────────────────────────────────────────────────────

export function fmtAmt(n, currency = '₹', numberFormat = 'indian') {
  if (n === null || n === undefined) return '—'
  const locale = numberFormat === 'international' ? 'en-US' : 'en-IN'
  return currency + Number(n).toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function fmtDate(s, dateFormat = 'DD/MM/YYYY') {
  if (!s) return '—'
  const [y, m, d] = s.split('-')
  return dateFormat.replace('DD', d).replace('MM', m).replace('YYYY', y)
}

export function todayISO() {
  return new Date().toISOString().slice(0, 10)
}

const MONTH_LABELS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
export function monthLabel(m) { return MONTH_LABELS[m - 1] }

// Returns display metadata for a transaction: label (Receipt/Payment/Deposit/Withdrawal/Transfer), colors, sign
export function txnLabel(txn) {
  if (txn.txn_type === 'income')  return { label: 'Receipt',    color: '#16a34a', bg: '#dcfce7', sign: '+' }
  if (txn.txn_type === 'expense') return { label: 'Payment',    color: '#dc2626', bg: '#fee2e2', sign: '−' }
  const fromType = txn.account?.account_type
  const toType   = txn.to_account?.account_type
  if (toType   === 'bank') return { label: 'Deposit',    color: '#2563eb', bg: '#dbeafe', sign: '↓' }
  if (fromType === 'bank') return { label: 'Withdrawal', color: '#ea580c', bg: '#ffedd5', sign: '↑' }
  return                          { label: 'Transfer',   color: '#7c3aed', bg: '#f3e8ff', sign: '⇄' }
}

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
    .select('simple_accounting_enabled, simple_accounting_currency, simple_accounting_fiscal_month, simple_accounting_default_account, simple_accounting_password, simple_accounting_country, simple_accounting_number_format, simple_accounting_date_format, simple_accounting_report_subtitle')
    .limit(1).single()
  return {
    enabled:        data?.simple_accounting_enabled         ?? false,
    currency:       data?.simple_accounting_currency        ?? '₹',
    fiscalMonth:    data?.simple_accounting_fiscal_month    ?? 4,
    defaultAccount: data?.simple_accounting_default_account ?? null,
    password:       data?.simple_accounting_password        ?? null,
    country:        data?.simple_accounting_country         ?? 'India',
    numberFormat:   data?.simple_accounting_number_format   ?? 'indian',
    dateFormat:     data?.simple_accounting_date_format     ?? 'DD-MM-YYYY',
    reportSubtitle: data?.simple_accounting_report_subtitle ?? '',
  }
}

export async function saveSimpleSettings(updates) {
  const { error } = await supabase.from('churches').update({
    simple_accounting_currency:         updates.currency,
    simple_accounting_fiscal_month:     updates.fiscalMonth,
    simple_accounting_default_account:  updates.defaultAccount  || null,
    simple_accounting_country:          updates.country         || 'India',
    simple_accounting_number_format:    updates.numberFormat    || 'indian',
    simple_accounting_date_format:      updates.dateFormat      || 'DD-MM-YYYY',
    simple_accounting_report_subtitle:  updates.reportSubtitle  || null,
  }).gte('id', '00000000-0000-0000-0000-000000000000')
  if (error) throw error
}

// Fetch church name/address for use as report header
export async function getChurchInfo() {
  const { data } = await supabase
    .from('churches')
    .select('church_name, address, city, state, diocese')
    .limit(1).single()
  return {
    name:    data?.church_name ?? '',
    address: data?.address     ?? '',
    city:    data?.city        ?? '',
    state:   data?.state       ?? '',
    diocese: data?.diocese     ?? '',
  }
}

export async function saveSimplePassword(pwd) {
  const { error } = await supabase.from('churches')
    .update({ simple_accounting_password: pwd || null })
    .gte('id', '00000000-0000-0000-0000-000000000000')
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

export async function seedDefaultSimpleCategories() {
  const now = new Date().toISOString()
  const income = [
    'Sunday Offering', 'Tithe', 'Special Offering', 'Thanksgiving Offering',
    'Building Fund', 'Mission Offering', 'Donations', 'Grants',
    'Rental Income', 'Interest Income',
  ]
  const expense = [
    'Salaries & Allowances', 'Pastoral Ministry', 'Building Maintenance', 'Utilities',
    'Office Supplies', 'Printing & Stationery', 'Food & Catering', 'Travel & Transport',
    'Medical & Welfare', 'Education & Training', 'Outreach & Evangelism',
    'Missions', 'Charity & Benevolence', 'Sound & Media', 'Music & Worship',
  ]

  // Load existing to skip duplicates
  const { data: existing = [] } = await supabase
    .from('simple_categories').select('name, type').eq('is_active', true)
  const existingKeys = new Set(existing.map(c => `${c.type}|${c.name.toLowerCase()}`))

  const allDefs = [
    ...income.map((name, i)  => ({ name, type: 'income',  sort_order: (i + 1) * 10 })),
    ...expense.map((name, i) => ({ name, type: 'expense', sort_order: (i + 1) * 10 })),
  ]
  const toInsert = allDefs.filter(r => !existingKeys.has(`${r.type}|${r.name.toLowerCase()}`))
  const skipped  = allDefs.length - toInsert.length

  if (toInsert.length) {
    const { error } = await supabase.from('simple_categories').insert(
      toInsert.map(r => ({ ...r, is_active: true, is_default: false, parent_id: null, created_at: now, updated_at: now }))
    )
    if (error) throw error
  }

  return { added: toInsert.length, skipped }
}

export async function deduplicateSimpleCategories() {
  const now = new Date().toISOString()

  const { data: all = [] } = await supabase
    .from('simple_categories')
    .select('*')
    .eq('is_active', true)
    .order('sort_order')
    .order('created_at')

  // Count sub-categories per parent
  const subCount = {}
  for (const c of all) {
    if (c.parent_id) subCount[c.parent_id] = (subCount[c.parent_id] || 0) + 1
  }

  // Group by type + name (case-insensitive)
  const groups = {}
  for (const c of all) {
    const key = `${c.type}|${c.name.toLowerCase()}`
    if (!groups[key]) groups[key] = []
    groups[key].push(c)
  }

  let removed = 0

  for (const cats of Object.values(groups)) {
    if (cats.length <= 1) continue

    // Keep the copy that has the most sub-categories; break ties by earliest created_at
    cats.sort((a, b) => (subCount[b.id] || 0) - (subCount[a.id] || 0))
    const keeper = cats[0]
    const dupes  = cats.slice(1)

    // Names already under the keeper (to avoid duplicate subs)
    const keeperSubNames = new Set(
      all.filter(c => c.parent_id === keeper.id).map(c => c.name.toLowerCase())
    )

    for (const dupe of dupes) {
      const dupeSubs = all.filter(c => c.parent_id === dupe.id)
      for (const sub of dupeSubs) {
        if (!keeperSubNames.has(sub.name.toLowerCase())) {
          // Move sub-category to keeper
          await supabase.from('simple_categories')
            .update({ parent_id: keeper.id, updated_at: now })
            .eq('id', sub.id)
          keeperSubNames.add(sub.name.toLowerCase())
        } else {
          // Duplicate sub — deactivate it
          await supabase.from('simple_categories')
            .update({ is_active: false, updated_at: now })
            .eq('id', sub.id)
        }
      }
      // Remove the duplicate parent
      await supabase.from('simple_categories')
        .update({ is_active: false, updated_at: now })
        .eq('id', dupe.id)
      removed++
    }
  }

  return removed
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

export async function getSimpleTransactions({ from, to, type, categoryId, accountId, limit = 10000 } = {}) {
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

export async function getDashboardStats() {
  const [allRes, recentRes, transfersRes] = await Promise.all([
    // All-time income / expense totals
    supabase.from('simple_transactions')
      .select('txn_type, amount')
      .eq('is_deleted', false).in('txn_type', ['income', 'expense']),

    supabase.from('simple_transactions')
      .select('*, category:category_id(name, type), account:account_id(name, account_type), to_account:to_account_id(name, account_type)')
      .eq('is_deleted', false)
      .order('txn_date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(10),

    // All-time transfers for deposits / withdrawals
    supabase.from('simple_transactions')
      .select('amount, account:account_id(account_type), to_account:to_account_id(account_type)')
      .eq('is_deleted', false).eq('txn_type', 'transfer'),
  ])

  function tally(rows) {
    const income  = (rows || []).filter(r => r.txn_type === 'income') .reduce((s, r) => s + Number(r.amount), 0)
    const expense = (rows || []).filter(r => r.txn_type === 'expense').reduce((s, r) => s + Number(r.amount), 0)
    return { income, expense, balance: income - expense }
  }

  let deposits = 0, withdrawals = 0
  for (const t of transfersRes.data || []) {
    const fromType = t.account?.account_type
    const toType   = t.to_account?.account_type
    if (toType   === 'bank') deposits    += Number(t.amount)
    else if (fromType === 'bank') withdrawals += Number(t.amount)
  }

  return {
    total:  tally(allRes.data),
    recent: recentRes.data || [],
    deposits,
    withdrawals,
  }
}

// ── Flush (danger zone) ───────────────────────────────────────────

export async function flushAllSimpleData() {
  // Delete transactions first (foreign-key references accounts & categories)
  const { error: e1 } = await supabase.from('simple_transactions')
    .delete().gte('id', '00000000-0000-0000-0000-000000000000')
  if (e1) throw e1
  const { error: e2 } = await supabase.from('simple_accounts')
    .delete().gte('id', '00000000-0000-0000-0000-000000000000')
  if (e2) throw e2
  const { error: e3 } = await supabase.from('simple_categories')
    .delete().gte('id', '00000000-0000-0000-0000-000000000000')
  if (e3) throw e3
}

// Returns the calendar year of the earliest transaction (or current year if none)
export async function getEarliestTransactionYear() {
  const { data } = await supabase
    .from('simple_transactions')
    .select('txn_date')
    .eq('is_deleted', false)
    .order('txn_date', { ascending: true })
    .limit(1)
  if (!data || data.length === 0) return new Date().getFullYear()
  return parseInt(data[0].txn_date.slice(0, 4))
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

// Monthly report for any date range — returns months in order with year in label
export async function getMonthlyReportRange(from, to) {
  const { data, error } = await supabase
    .from('simple_transactions')
    .select('txn_type, amount, txn_date')
    .eq('is_deleted', false)
    .in('txn_type', ['income', 'expense'])
    .gte('txn_date', from)
    .lte('txn_date', to)
  if (error) throw error

  const byMonth = {}
  for (const t of data || []) {
    const key = t.txn_date.slice(0, 7)
    if (!byMonth[key]) byMonth[key] = { income: 0, expense: 0 }
    if (t.txn_type === 'income')  byMonth[key].income  += Number(t.amount)
    if (t.txn_type === 'expense') byMonth[key].expense += Number(t.amount)
  }

  const result = []
  const [fy, fm] = from.slice(0, 7).split('-').map(Number)
  const [ty, tm] = to.slice(0, 7).split('-').map(Number)
  let y = fy, m = fm
  while (y < ty || (y === ty && m <= tm)) {
    const key = `${y}-${String(m).padStart(2, '0')}`
    const v = byMonth[key] || { income: 0, expense: 0 }
    result.push({ year: y, month: m, label: `${monthLabel(m)} ${y}`, income: v.income, expense: v.expense, surplus: v.income - v.expense })
    m++; if (m > 12) { m = 1; y++ }
  }
  return result
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
    if (!byCategory[key]) byCategory[key] = { id: t.category.id, name: t.category.name, total: 0 }
    byCategory[key].total += Number(t.amount)
  }

  const rows = Object.values(byCategory).sort((a, b) => b.total - a.total)
  if (uncategorized > 0) rows.push({ name: 'Uncategorized', total: uncategorized })
  return rows
}
