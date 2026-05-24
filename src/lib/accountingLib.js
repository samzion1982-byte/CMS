/* ═══════════════════════════════════════════════════════════════
   accountingLib.js — Core queries and helpers for Accounting module
   ═══════════════════════════════════════════════════════════════ */

import { supabase } from './supabase'

// ── Financial Year helpers ────────────────────────────────────────

export function getFY(dateStr) {
  const d = dateStr ? new Date(dateStr + 'T00:00:00') : new Date()
  const m = d.getMonth() + 1
  const y = d.getFullYear()
  return m >= 4 ? `${y}-${String(y + 1).slice(2)}` : `${y - 1}-${String(y).slice(2)}`
}

export function fyDateRange(fy) {
  const [startY] = fy.split('-').map(Number)
  return { from: `${startY}-04-01`, to: `${startY + 1}-03-31` }
}

// startFy: entity's fy_start (e.g. "2026-27") — options begin from that year
export function fyOptions(startFy) {
  const startYear = startFy ? parseInt(startFy.split('-')[0]) : 2026
  const currentStartYear = parseInt(getFY().split('-')[0])
  const options = []
  for (let y = startYear; y <= currentStartYear + 1; y++) {
    options.push(`${y}-${String(y + 1).slice(2)}`)
  }
  return options.sort().reverse()   // newest first
}

export function fmtAmt(n) {
  if (n === null || n === undefined) return '—'
  return '₹' + Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function fmtDate(s) {
  if (!s) return '—'
  const [y, m, d] = s.split('-')
  return `${d}/${m}/${y}`
}

// ── Accounting enabled check ──────────────────────────────────────

export async function isAccountingEnabled() {
  const { data } = await supabase.from('churches').select('accounting_enabled').limit(1).single()
  return data?.accounting_enabled === true
}

export async function toggleAccountingEnabled(val) {
  return supabase.from('churches').update({ accounting_enabled: val }).gte('id', '00000000-0000-0000-0000-000000000000')
}

// Returns { entry_system: 'single'|'double', locked: bool, id }
export async function getEntrySystemStatus() {
  const { data } = await supabase
    .from('churches')
    .select('id, accounting_entry_system, accounting_entry_system_locked')
    .limit(1).single()
  return {
    id:           data?.id,
    entry_system: data?.accounting_entry_system || 'double',
    locked:       data?.accounting_entry_system_locked === true,
  }
}

// Saves entry_system and permanently locks it
export async function lockEntrySystem(churchId, system) {
  const { error } = await supabase.from('churches').update({
    accounting_entry_system:        system,
    accounting_entry_system_locked: true,
  }).eq('id', churchId)
  if (error) throw error
}

// Removes the lock so the setup modal appears again (dev / master-password action)
export async function resetEntrySystemLock(churchId) {
  const { error } = await supabase.from('churches')
    .update({ accounting_entry_system_locked: false })
    .eq('id', churchId)
  if (error) throw error
}

// Deletes all journal entries + entry lines (CASCADE) and clears account balances
export async function flushJournalEntries() {
  const { error: e1 } = await supabase.from('journal_entries')
    .delete().gte('id', '00000000-0000-0000-0000-000000000000')
  if (e1) throw e1
  await supabase.from('account_balances')
    .delete().gte('id', '00000000-0000-0000-0000-000000000000')
}

// ── Chart of Accounts ─────────────────────────────────────────────

export async function getChartOfAccounts(activeOnly = false, entityId) {
  let q = supabase
    .from('chart_of_accounts')
    .select('*')
    .order('sort_order')
    .order('name')
  if (activeOnly) q = q.eq('is_active', true)
  if (entityId)   q = q.eq('entity_id', entityId)
  const { data, error } = await q
  if (error) throw error
  return data || []
}

// Build tree structure from flat list
export function buildCOATree(accounts) {
  const byId = {}
  accounts.forEach(a => { byId[a.id] = { ...a, children: [] } })
  const roots = []
  accounts.forEach(a => {
    if (a.parent_id && byId[a.parent_id]) {
      byId[a.parent_id].children.push(byId[a.id])
    } else if (!a.parent_id) {
      roots.push(byId[a.id])
    }
  })
  const sortNodes = nodes => {
    nodes.sort((a, b) => a.name.localeCompare(b.name) || (a.sort_order - b.sort_order))
    nodes.forEach(n => sortNodes(n.children))
  }
  sortNodes(roots)
  return roots
}

// Postable accounts for journal entry dropdowns (level 3 ledgers + level 4 sub-ledgers)
export function getPostableAccounts(accounts) {
  return accounts.filter(a => a.is_postable !== false && (a.level === 3 || a.level === 4))
}

// Build breadcrumb path for an account: "Assets > Current Assets > Cash in Hand"
export function getAccountPath(account, allAccounts) {
  const parts = [account.name]
  let current = account
  while (current.parent_id) {
    const parent = allAccounts.find(a => a.id === current.parent_id)
    if (!parent) break
    parts.unshift(parent.name)
    current = parent
  }
  return parts.join(' > ')
}

// Build flat list of postable accounts with their full path (for dropdowns)
export function getPostableAccountsWithPath(allAccounts) {
  return getPostableAccounts(allAccounts).map(a => ({
    ...a,
    path: getAccountPath(a, allAccounts),
  }))
}

// account object must include entity_id (set by caller from useEntity())
export async function createAccount(account, performedBy) {
  // Auto-generate a unique internal code — never shown to the user
  const autoCode = `AC-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 5).toUpperCase()}`
  const { data, error } = await supabase
    .from('chart_of_accounts')
    .insert({ ...account, code: account.code || autoCode, created_by: performedBy, updated_by: performedBy })
    .select().single()
  if (error) throw error
  await logAudit('created', 'chart_of_accounts', data.id, data, null, performedBy)
  return data
}

export async function updateAccount(id, account, performedBy) {
  const { data: old } = await supabase.from('chart_of_accounts').select('*').eq('id', id).single()
  const { data, error } = await supabase
    .from('chart_of_accounts')
    .update({ ...account, updated_at: new Date().toISOString(), updated_by: performedBy })
    .eq('id', id).select().single()
  if (error) throw error
  await logAudit('modified', 'chart_of_accounts', id, data, old, performedBy)
  return data
}

export async function deleteAccount(id, performedBy) {
  // Check for child accounts
  const { count: childCount } = await supabase
    .from('chart_of_accounts')
    .select('id', { count: 'exact', head: true })
    .eq('parent_id', id)
  if (childCount > 0) throw new Error('Cannot delete — this account has sub-accounts under it. Delete them first.')

  // Check for journal lines
  const { count: txCount } = await supabase
    .from('journal_entry_lines')
    .select('id', { count: 'exact', head: true })
    .eq('account_id', id)
  if (txCount > 0) throw new Error('Cannot delete — this account has existing transactions.')

  const { data: old } = await supabase.from('chart_of_accounts').select('*').eq('id', id).single()
  const { error } = await supabase.from('chart_of_accounts').delete().eq('id', id)
  if (error) throw error
  await logAudit('deleted', 'chart_of_accounts', id, null, old, performedBy)
}

// ── Journal Entries ───────────────────────────────────────────────

export async function getJournalEntries({ fy, from, to, type, posted, deleted = false, entityId } = {}) {
  let q = supabase
    .from('journal_entries')
    .select('*')
    .order('entry_date', { ascending: false })
    .order('entry_number', { ascending: false })
  if (fy)       q = q.eq('financial_year', fy)
  if (from)     q = q.gte('entry_date', from)
  if (to)       q = q.lte('entry_date', to)
  if (type)     q = q.eq('voucher_type', type)
  if (posted !== undefined && posted !== null) q = q.eq('is_posted', posted)
  q = q.eq('is_deleted', deleted)
  if (entityId) q = q.eq('entity_id', entityId)
  const { data, error } = await q
  if (error) throw error
  return data || []
}

export async function getJournalEntryWithLines(id) {
  const { data: entry, error } = await supabase
    .from('journal_entries')
    .select('*, journal_entry_lines(*, chart_of_accounts(code, name))')
    .eq('id', id)
    .single()
  if (error) throw error
  return entry
}

// customPrefixes: { Receipt, Payment, Journal, Contra, Opening } — from accounting settings
export async function nextEntryNumber(fy, type, entityId, customPrefixes = {}) {
  const defaults = { Receipt: 'RV', Payment: 'PV', Journal: 'JV', Contra: 'CT', Opening: 'OB' }
  const prefix = customPrefixes[type] || defaults[type] || 'JV'
  const pattern = `${prefix}-${fy.replace('-', '')}-`
  let q = supabase
    .from('journal_entries')
    .select('entry_number')
    .like('entry_number', `${pattern}%`)
    .order('entry_number', { ascending: false })
    .limit(1)
  if (entityId) q = q.eq('entity_id', entityId)
  const { data } = await q
  const seq = data?.[0] ? parseInt(data[0].entry_number.split('-').pop(), 10) || 0 : 0
  return `${pattern}${String(seq + 1).padStart(5, '0')}`
}

// Returns all accounting display/format settings for the church
export async function getAccountingSettings() {
  const { data } = await supabase
    .from('churches')
    .select(`
      accounting_country, accounting_currency, accounting_number_format, accounting_date_format,
      accounting_report_subtitle, accounting_default_voucher, accounting_auto_post,
      accounting_prefix_receipt, accounting_prefix_payment, accounting_prefix_journal,
      accounting_prefix_contra, accounting_prefix_opening,
      accounting_default_cash_id, accounting_default_bank_id,
      accounting_period_lock_date, accounting_opening_date, accounting_auto_post_receipts,
      accounting_fiscal_month, accounting_entry_system
    `)
    .limit(1).single()
  return data || {}
}

async function checkEntrySystemLocked() {
  const { data } = await supabase
    .from('churches')
    .select('accounting_entry_system_locked, accounting_period_lock_date')
    .limit(1).single()
  if (!data?.accounting_entry_system_locked) {
    throw new Error('Accounting method not configured. Go to Accounting → Settings and lock the entry system before recording any entries.')
  }
  return data
}

async function checkPeriodLock(entryDate, churchData) {
  const data = churchData || (await supabase.from('churches').select('accounting_period_lock_date').limit(1).single()).data
  const lockDate = data?.accounting_period_lock_date
  if (lockDate && entryDate && entryDate <= lockDate) {
    throw new Error(`Entry date (${entryDate}) is on or before the period lock date (${lockDate}). Go to Accounting → Settings to change the lock date.`)
  }
}

function validateLines(lines) {
  for (const l of lines) {
    const dr = Number(l.debit_amount  || 0)
    const cr = Number(l.credit_amount || 0)
    if (dr < 0 || cr < 0) throw new Error('Line amounts cannot be negative.')
    if (dr === 0 && cr === 0) throw new Error('Each line must have a non-zero amount.')
  }
}

// entry object must include entity_id (set by caller from useEntity())
export async function createJournalEntry(entry, lines, performedBy) {
  const churchData = await checkEntrySystemLocked()
  await checkPeriodLock(entry.entry_date, churchData)
  validateLines(lines)
  const totalDebit  = lines.reduce((s, l) => s + Number(l.debit_amount  || 0), 0)
  const totalCredit = lines.reduce((s, l) => s + Number(l.credit_amount || 0), 0)

  const { data: je, error: jeErr } = await supabase
    .from('journal_entries')
    .insert({
      ...entry,
      total_debit:  totalDebit,
      total_credit: totalCredit,
      created_by:   performedBy,
      updated_by:   performedBy,
    })
    .select().single()
  if (jeErr) throw jeErr

  const lineRows = lines.map((l, i) => ({
    journal_entry_id: je.id,
    account_id:       l.account_id,
    debit_amount:     Number(l.debit_amount  || 0),
    credit_amount:    Number(l.credit_amount || 0),
    description:      l.description || null,
    line_number:      i + 1,
  }))
  const { error: lErr } = await supabase.from('journal_entry_lines').insert(lineRows)
  if (lErr) throw lErr

  await logAudit('created', 'journal_entry', je.id, je, null, performedBy)
  return je
}

export async function updateJournalEntry(id, entry, lines, performedBy) {
  const churchData = await checkEntrySystemLocked()
  await checkPeriodLock(entry.entry_date, churchData)
  validateLines(lines)
  const { data: old } = await supabase.from('journal_entries').select('*').eq('id', id).single()
  if (old?.is_posted) throw new Error('Cannot edit a posted entry.')

  const totalDebit  = lines.reduce((s, l) => s + Number(l.debit_amount  || 0), 0)
  const totalCredit = lines.reduce((s, l) => s + Number(l.credit_amount || 0), 0)

  const { data: je, error: jeErr } = await supabase
    .from('journal_entries')
    .update({
      ...entry,
      total_debit:  totalDebit,
      total_credit: totalCredit,
      updated_at:   new Date().toISOString(),
      updated_by:   performedBy,
    })
    .eq('id', id).select().single()
  if (jeErr) throw jeErr

  // Replace lines
  await supabase.from('journal_entry_lines').delete().eq('journal_entry_id', id)
  const lineRows = lines.map((l, i) => ({
    journal_entry_id: id,
    account_id:       l.account_id,
    debit_amount:     Number(l.debit_amount  || 0),
    credit_amount:    Number(l.credit_amount || 0),
    description:      l.description || null,
    line_number:      i + 1,
  }))
  const { error: lErr } = await supabase.from('journal_entry_lines').insert(lineRows)
  if (lErr) throw lErr

  await logAudit('modified', 'journal_entry', id, je, old, performedBy)
  return je
}

export async function updatePostedJournalEntry(id, entry, lines, performedBy) {
  const { data: old } = await supabase.from('journal_entries').select('*').eq('id', id).single()
  const { data: oldLines } = await supabase.from('journal_entry_lines').select('*').eq('journal_entry_id', id)

  const totalDebit  = lines.reduce((s, l) => s + Number(l.debit_amount  || 0), 0)
  const totalCredit = lines.reduce((s, l) => s + Number(l.credit_amount || 0), 0)

  const { data: je, error: jeErr } = await supabase
    .from('journal_entries')
    .update({
      ...entry,
      is_posted:    true,
      total_debit:  totalDebit,
      total_credit: totalCredit,
      updated_at:   new Date().toISOString(),
      updated_by:   performedBy,
    })
    .eq('id', id).select().single()
  if (jeErr) throw jeErr

  await supabase.from('journal_entry_lines').delete().eq('journal_entry_id', id)
  const lineRows = lines.map((l, i) => ({
    journal_entry_id: id,
    account_id:       l.account_id,
    debit_amount:     Number(l.debit_amount  || 0),
    credit_amount:    Number(l.credit_amount || 0),
    description:      l.description || null,
    line_number:      i + 1,
  }))
  const { error: lErr } = await supabase.from('journal_entry_lines').insert(lineRows)
  if (lErr) throw lErr

  // Reverse old balance contribution, then apply new lines
  if (oldLines?.length) await reverseBalanceCache(oldLines, old.financial_year, old.entity_id)
  await updateBalanceCache(lineRows, entry.financial_year || old.financial_year, entry.entity_id || old.entity_id)

  await logAudit('modified_posted', 'journal_entry', id, je, old, performedBy)
  return je
}

export async function postJournalEntry(id, performedBy) {
  const entry = await getJournalEntryWithLines(id)
  if (entry.is_posted) throw new Error('Entry already posted.')
  const diff = Math.abs(entry.total_debit - entry.total_credit)
  if (diff > 0.01) throw new Error(`Entry not balanced. Difference: ₹${diff.toFixed(2)}`)

  const { error } = await supabase
    .from('journal_entries')
    .update({ is_posted: true, posted_at: new Date().toISOString(), posted_by: performedBy })
    .eq('id', id)
  if (error) throw error

  await updateBalanceCache(entry.journal_entry_lines, entry.financial_year, entry.entity_id)
  await logAudit('posted', 'journal_entry', id, null, null, performedBy)
}

export async function softDeleteJournalEntry(id, performedBy) {
  const { data: entry } = await supabase.from('journal_entries').select('*').eq('id', id).single()
  const { error } = await supabase.from('journal_entries')
    .update({ is_deleted: true, deleted_at: new Date().toISOString(), deleted_by: performedBy })
    .eq('id', id)
  if (error) throw error
  await logAudit('soft_deleted', 'journal_entry', id, null, entry, performedBy)
}

export async function restoreJournalEntry(id, performedBy) {
  const { error } = await supabase.from('journal_entries')
    .update({ is_deleted: false, deleted_at: null, deleted_by: null })
    .eq('id', id)
  if (error) throw error
  await logAudit('restored', 'journal_entry', id, null, null, performedBy)
}

export async function verifyDeletePassword(entered) {
  const { data } = await supabase.from('churches').select('accounting_delete_password').limit(1).single()
  const stored = data?.accounting_delete_password
  if (!stored) return { ok: false, noPassword: true }
  return { ok: entered === stored, noPassword: false }
}

export async function permanentDeleteJournalEntry(id, performedBy, password) {
  const { ok, noPassword } = await verifyDeletePassword(password)
  if (noPassword) throw new Error('No delete password configured. Set one in Accounting → Settings.')
  if (!ok) throw new Error('Incorrect password. Permanent deletion cancelled.')
  const { data: entry } = await supabase.from('journal_entries').select('*').eq('id', id).single()
  // Reverse balance cache if the entry was posted
  if (entry?.is_posted) {
    const { data: lines } = await supabase.from('journal_entry_lines').select('*').eq('journal_entry_id', id)
    if (lines?.length) await reverseBalanceCache(lines, entry.financial_year, entry.entity_id)
  }
  const { error } = await supabase.from('journal_entries').delete().eq('id', id)
  if (error) throw error
  await logAudit('permanently_deleted', 'journal_entry', id, null, entry, performedBy)
}

// ── Account Balance Cache ─────────────────────────────────────────

async function reverseBalanceCache(lines, fy, entityId) {
  for (const line of lines) {
    let q = supabase
      .from('account_balances')
      .select('*')
      .eq('account_id', line.account_id)
      .eq('financial_year', fy)
    if (entityId) q = q.eq('entity_id', entityId)
    const { data: existing } = await q.maybeSingle()
    if (!existing) continue
    const newDebit  = Number(existing.total_debit)  - Number(line.debit_amount  || 0)
    const newCredit = Number(existing.total_credit) - Number(line.credit_amount || 0)
    const closing   = Number(existing.opening_balance) + newDebit - newCredit
    await supabase.from('account_balances').upsert({
      account_id:      line.account_id,
      financial_year:  fy,
      entity_id:       entityId,
      opening_balance: Number(existing.opening_balance),
      total_debit:     Math.max(0, newDebit),
      total_credit:    Math.max(0, newCredit),
      closing_balance: closing,
      last_updated_at: new Date().toISOString(),
    }, { onConflict: 'account_id,financial_year,entity_id' })
  }
}

async function updateBalanceCache(lines, fy, entityId) {
  for (const line of lines) {
    let q = supabase
      .from('account_balances')
      .select('*')
      .eq('account_id', line.account_id)
      .eq('financial_year', fy)
    if (entityId) q = q.eq('entity_id', entityId)
    const { data: existing } = await q.maybeSingle()

    const base = existing || { opening_balance: 0, total_debit: 0, total_credit: 0 }
    const newDebit  = Number(base.total_debit)  + Number(line.debit_amount  || 0)
    const newCredit = Number(base.total_credit) + Number(line.credit_amount || 0)
    const closing   = Number(base.opening_balance) + newDebit - newCredit

    await supabase.from('account_balances').upsert({
      account_id:      line.account_id,
      financial_year:  fy,
      entity_id:       entityId,
      opening_balance: Number(base.opening_balance),
      total_debit:     newDebit,
      total_credit:    newCredit,
      closing_balance: closing,
      last_updated_at: new Date().toISOString(),
    }, { onConflict: 'account_id,financial_year,entity_id' })
  }
}

// ── Ledger ────────────────────────────────────────────────────────

export async function getLedger(accountId, entityId, from, to) {
  // Opening balance: all posted transactions for this account BEFORE `from`
  let prevQ = supabase
    .from('journal_entries')
    .select('id')
    .eq('is_posted', true)
    .eq('is_deleted', false)
    .lt('entry_date', from)
  if (entityId) prevQ = prevQ.eq('entity_id', entityId)
  const { data: prevEntries } = await prevQ

  let openingBalance = 0
  if (prevEntries?.length) {
    const prevIds = prevEntries.map(e => e.id)
    const { data: prevLines } = await supabase
      .from('journal_entry_lines')
      .select('debit_amount, credit_amount')
      .eq('account_id', accountId)
      .in('journal_entry_id', prevIds)
    for (const l of prevLines || []) {
      openingBalance += Number(l.debit_amount || 0) - Number(l.credit_amount || 0)
    }
  }

  // Include COA opening_balance if no Opening Balance journal entry exists for this account
  // (COA field is the legacy one-time setup method; OB journal entries are the new method)
  const { data: coa } = await supabase
    .from('chart_of_accounts')
    .select('opening_balance, opening_balance_date')
    .eq('id', accountId)
    .single()
  if (coa && Number(coa.opening_balance)) {
    let obQ = supabase
      .from('journal_entries')
      .select('journal_entry_lines!inner(account_id)')
      .eq('voucher_type', 'Opening Balance')
      .eq('is_posted', true)
      .eq('is_deleted', false)
      .eq('journal_entry_lines.account_id', accountId)
      .limit(1)
    if (entityId) obQ = obQ.eq('entity_id', entityId)
    const { data: obEntries } = await obQ
    if (!obEntries?.length) {
      const obDate = coa.opening_balance_date || from
      if (obDate <= from) openingBalance += Number(coa.opening_balance)
    }
  }

  // Step 1: posted, non-deleted entries within the date range
  let entriesQ = supabase
    .from('journal_entries')
    .select('id, entry_number, entry_date, voucher_type, narration')
    .eq('is_posted', true)
    .eq('is_deleted', false)
    .gte('entry_date', from)
    .lte('entry_date', to)
    .order('entry_date', { ascending: true })
  if (entityId) entriesQ = entriesQ.eq('entity_id', entityId)
  const { data: entries, error: e1 } = await entriesQ

  if (e1) throw e1

  // Step 2: lines for this account within those entries
  let sorted = []
  if (entries?.length) {
    const entryIds = entries.map(e => e.id)
    const entryMap = Object.fromEntries(entries.map(e => [e.id, e]))
    const { data: lines, error: e2 } = await supabase
      .from('journal_entry_lines')
      .select('journal_entry_id, debit_amount, credit_amount, description')
      .eq('account_id', accountId)
      .in('journal_entry_id', entryIds)
    if (e2) throw e2
    sorted = (lines || []).sort((a, b) => {
      const ea = entryMap[a.journal_entry_id] || {}
      const eb = entryMap[b.journal_entry_id] || {}
      if (ea.entry_date < eb.entry_date) return -1
      if (ea.entry_date > eb.entry_date) return  1
      return (ea.entry_number || '').localeCompare(eb.entry_number || '')
    })
    let runningBalance = openingBalance
    const periodRows = sorted.map(l => {
      const e  = entryMap[l.journal_entry_id] || {}
      const dr = Number(l.debit_amount  || 0)
      const cr = Number(l.credit_amount || 0)
      runningBalance += dr - cr
      return { date: e.entry_date, entry_number: e.entry_number, voucher_type: e.voucher_type, narration: l.description || e.narration, debit: dr, credit: cr, running_balance: runningBalance }
    })
    return [
      { date: null, entry_number: null, voucher_type: null, narration: 'Opening Balance', debit: openingBalance >= 0 ? openingBalance : 0, credit: openingBalance < 0 ? Math.abs(openingBalance) : 0, running_balance: openingBalance, isOpening: true },
      ...periodRows,
    ]
  }

  return [
    { date: null, entry_number: null, voucher_type: null, narration: 'Opening Balance', debit: openingBalance >= 0 ? openingBalance : 0, credit: openingBalance < 0 ? Math.abs(openingBalance) : 0, running_balance: openingBalance, isOpening: true },
  ]
}

// ── Narration suggestions ─────────────────────────────────────────

// ── Designated Funds ─────────────────────────────────────────────
export async function getFunds(activeOnly = true) {
  let q = supabase.from('funds').select('*').order('name')
  if (activeOnly) q = q.eq('is_active', true)
  const { data } = await q
  return data || []
}

export async function getFundReport(fy, entityId) {
  const funds = await getFunds(false)
  if (funds.length === 0) return []

  let q = supabase
    .from('journal_entry_lines')
    .select(`
      debit_amount, credit_amount,
      journal_entries!inner(fund_id, financial_year, is_posted, is_deleted, entity_id),
      chart_of_accounts!inner(account_type)
    `)
    .eq('journal_entries.is_posted', true)
    .eq('journal_entries.is_deleted', false)
    .eq('journal_entries.financial_year', fy)
    .not('journal_entries.fund_id', 'is', null)
  if (entityId) q = q.eq('journal_entries.entity_id', entityId)
  const { data: lines } = await q

  const totals = {}
  for (const l of lines || []) {
    const fid  = l.journal_entries?.fund_id
    const type = l.chart_of_accounts?.account_type
    if (!fid) continue
    if (!totals[fid]) totals[fid] = { income: 0, expenses: 0 }
    if (type === 'Income')  totals[fid].income   += (Number(l.credit_amount) - Number(l.debit_amount))
    if (type === 'Expense') totals[fid].expenses += (Number(l.debit_amount)  - Number(l.credit_amount))
  }

  return funds.map(f => ({
    ...f,
    income:   totals[f.id]?.income   || 0,
    expenses: totals[f.id]?.expenses || 0,
    net:      (totals[f.id]?.income  || 0) - (totals[f.id]?.expenses || 0),
  }))
}

export async function getRecentNarrations(limit = 30) {
  const { data } = await supabase
    .from('journal_entries')
    .select('narration')
    .not('narration', 'is', null)
    .neq('narration', '')
    .order('created_at', { ascending: false })
    .limit(200)
  if (!data) return []
  const seen = new Set()
  const unique = []
  for (const row of data) {
    const n = row.narration.trim()
    if (n && !seen.has(n)) { seen.add(n); unique.push(n) }
    if (unique.length >= limit) break
  }
  return unique
}

// ── Trial Balance ─────────────────────────────────────────────────

export async function getTrialBalance(fy, entityId, fromDate = null, toDate = null) {
  const { from, to } = fyDateRange(fy)
  const dateFrom = fromDate || from
  const dateTo   = toDate   || to
  const accounts = await getChartOfAccounts(false, entityId)

  let q = supabase
    .from('journal_entry_lines')
    .select(`
      account_id, debit_amount, credit_amount,
      journal_entries!inner(financial_year, is_posted, is_deleted, entry_date, entity_id)
    `)
    .eq('journal_entries.financial_year', fy)
    .eq('journal_entries.is_posted', true)
    .eq('journal_entries.is_deleted', false)
    .gte('journal_entries.entry_date', dateFrom)
    .lte('journal_entries.entry_date', dateTo)
  if (entityId) q = q.eq('journal_entries.entity_id', entityId)
  const { data: lines } = await q

  const balMap = {}
  for (const l of lines || []) {
    if (!balMap[l.account_id]) balMap[l.account_id] = { debit: 0, credit: 0 }
    balMap[l.account_id].debit  += Number(l.debit_amount  || 0)
    balMap[l.account_id].credit += Number(l.credit_amount || 0)
  }

  return accounts.map(a => ({
    ...a,
    total_debit:  balMap[a.id]?.debit  || 0,
    total_credit: balMap[a.id]?.credit || 0,
    net:          (balMap[a.id]?.debit || 0) - (balMap[a.id]?.credit || 0),
  }))
}

// ── Financial Statements ──────────────────────────────────────────

// Income & Expenditure Account (church-appropriate P&L)
// Returns surplus (positive) or deficit (negative)
export async function getIncomeStatement(fy, entityId, fromDate = null, toDate = null) {
  const tb = await getTrialBalance(fy, entityId, fromDate, toDate)
  const income   = tb.filter(a => a.account_type === 'Income')
  const expenses = tb.filter(a => a.account_type === 'Expense')
  const totalIncome    = income.reduce((s, a)   => s + (a.total_credit - a.total_debit), 0)
  const totalExpenses  = expenses.reduce((s, a) => s + (a.total_debit  - a.total_credit), 0)
  const surplus        = totalIncome - totalExpenses  // positive = surplus, negative = deficit
  return { income, expenses, totalIncome, totalExpenses, netIncome: surplus, surplus }
}

// Balance Sheet — uses "Corpus Fund" terminology (church/non-profit standard)
export async function getBalanceSheet(fy, entityId, fromDate = null, toDate = null) {
  const tb = await getTrialBalance(fy, entityId, fromDate, toDate)
  const assets      = tb.filter(a => a.account_type === 'Asset')
  const liabilities = tb.filter(a => a.account_type === 'Liability')
  const corpus      = tb.filter(a => a.account_type === 'Equity')  // "Corpus Fund / General Fund"
  const { surplus } = await getIncomeStatement(fy, entityId, fromDate, toDate)

  const totalAssets      = assets.reduce((s, a)      => s + (a.total_debit  - a.total_credit), 0)
  const totalLiabilities = liabilities.reduce((s, a) => s + (a.total_credit - a.total_debit),  0)
  const totalCorpus      = corpus.reduce((s, a)      => s + (a.total_credit - a.total_debit),  0) + surplus

  return { assets, liabilities, corpus, surplus, totalAssets, totalLiabilities, totalCorpus,
           totalEquity: totalCorpus }  // totalEquity kept for backward compat
}

// Receipts & Payments Account (cash-basis — church standard report)
export async function getReceiptsAndPayments(fy, entityId, fromDate = null, toDate = null) {
  const { from, to } = fyDateRange(fy)
  const dateFrom = fromDate || from
  const dateTo   = toDate   || to

  // ── Fetch income/expense COA for receipt/payment hierarchy ──────────
  let incExpQ = supabase
    .from('chart_of_accounts')
    .select('id, name, parent_id, level, account_type')
    .in('account_type', ['Income', 'Expense'])
  if (entityId) incExpQ = incExpQ.eq('entity_id', entityId)
  const { data: incExpCOA } = await incExpQ
  const coaById = {}
  for (const a of incExpCOA || []) coaById[a.id] = a

  // ── Classify asset accounts as Cash or Bank by name ───────────────
  let assetQ = supabase
    .from('chart_of_accounts')
    .select('id, name, opening_balance, opening_balance_date')
    .eq('account_type', 'Asset')
    .eq('is_active', true)
  if (entityId) assetQ = assetQ.eq('entity_id', entityId)
  const { data: assetAccts } = await assetQ

  const cashRe = /cash|hand|petty/i
  const bankRe = /bank/i
  const assetType = {}   // coa_id → 'cash' | 'bank' | 'other'
  const acctName  = {}   // coa_id → display name
  const acctBal   = {}   // coa_id → running closing balance
  let cashCoaOB = 0, bankCoaOB = 0

  for (const a of assetAccts || []) {
    const t = cashRe.test(a.name) ? 'cash' : bankRe.test(a.name) ? 'bank' : 'other'
    assetType[a.id] = t
    acctName[a.id]  = a.name
    const obDate = a.opening_balance_date || from
    if (obDate <= dateFrom) {
      const amt = Number(a.opening_balance) || 0
      if (t === 'cash') cashCoaOB += amt
      if (t === 'bank') bankCoaOB += amt
      if (t === 'cash' || t === 'bank') acctBal[a.id] = (acctBal[a.id] || 0) + amt
    }
  }

  function classifyAcct(id, name) {
    return assetType[id] || (cashRe.test(name || '') ? 'cash' : bankRe.test(name || '') ? 'bank' : 'other')
  }

  // ── Pre-period entries for custom date ranges (FY start → day before fromDate) ──
  let cashOB = cashCoaOB, bankOB = bankCoaOB
  if (dateFrom > from) {
    let preQ = supabase
      .from('journal_entries')
      .select(`
        voucher_type,
        journal_entry_lines(account_id, debit_amount, credit_amount,
          chart_of_accounts(name, account_type))
      `)
      .eq('financial_year', fy)
      .eq('is_posted', true)
      .eq('is_deleted', false)
      .gte('entry_date', from)
      .lt('entry_date', dateFrom)
    if (entityId) preQ = preQ.eq('entity_id', entityId)
    const { data: preEntries } = await preQ

    for (const e of preEntries || []) {
      for (const l of (e.journal_entry_lines || [])) {
        if (l.chart_of_accounts?.account_type !== 'Asset') continue
        const t = classifyAcct(l.account_id, l.chart_of_accounts?.name)
        if (t === 'cash') {
          if (e.voucher_type === 'Receipt') cashOB += Number(l.debit_amount  || 0)
          if (e.voucher_type === 'Payment') cashOB -= Number(l.credit_amount || 0)
          if (e.voucher_type === 'Journal') cashOB += Number(l.debit_amount || 0) - Number(l.credit_amount || 0)
        } else if (t === 'bank') {
          if (e.voucher_type === 'Receipt') bankOB += Number(l.debit_amount  || 0)
          if (e.voucher_type === 'Payment') bankOB -= Number(l.credit_amount || 0)
          if (e.voucher_type === 'Journal') bankOB += Number(l.debit_amount || 0) - Number(l.credit_amount || 0)
        }
        if ((t === 'cash' || t === 'bank') && ['Receipt', 'Payment', 'Contra', 'Journal'].includes(e.voucher_type)) {
          acctBal[l.account_id] = (acctBal[l.account_id] || 0) + Number(l.debit_amount || 0) - Number(l.credit_amount || 0)
        }
      }
    }
  }

  const cashOpeningBalance = cashOB
  const bankOpeningBalance = bankOB
  const openingBalance     = cashOB + bankOB

  // Snapshot per-account opening balances before period entries
  const acctOBal = { ...acctBal }

  // ── Period entries ────────────────────────────────────────────────
  let periodQ = supabase
    .from('journal_entries')
    .select(`
      entry_number, entry_date, voucher_type, narration, total_debit, total_credit,
      journal_entry_lines(account_id, debit_amount, credit_amount,
        chart_of_accounts(name, account_type))
    `)
    .eq('financial_year', fy)
    .eq('is_posted', true)
    .eq('is_deleted', false)
    .gte('entry_date', dateFrom)
    .lte('entry_date', dateTo)
    .order('entry_date')
  if (entityId) periodQ = periodQ.eq('entity_id', entityId)
  const { data: entries, error } = await periodQ
  if (error) throw error

  const receiptAmts  = {}   // account_id → amount
  const paymentAmts  = {}   // account_id → amount
  const receiptOther = {}   // narration → amount (fallback when no income line)
  const paymentOther = {}   // narration → amount (fallback when no expense line)
  let cashReceipts = 0, bankReceipts = 0
  let cashPayments = 0, bankPayments = 0

  for (const entry of entries || []) {
    const lines = entry.journal_entry_lines || []

    if (entry.voucher_type === 'Receipt') {
      const incomeLines = lines.filter(l => l.chart_of_accounts?.account_type === 'Income' && Number(l.credit_amount) > 0)
      if (incomeLines.length > 0) {
        for (const il of incomeLines) {
          receiptAmts[il.account_id] = (receiptAmts[il.account_id] || 0) + Number(il.credit_amount)
        }
      } else {
        const cat = entry.narration || 'Other Receipts'
        receiptOther[cat] = (receiptOther[cat] || 0) + Number(entry.total_debit || 0)
      }
      // Find which cash/bank was debited (for cash vs bank split).
      // Track classifiedDebit so any unclassified asset debit also flows into cash
      // (prevents the "classified=true early-exit" bug that drops unclassified lines).
      let classifiedDebit = 0
      for (const l of lines) {
        if (l.chart_of_accounts?.account_type === 'Asset' && Number(l.debit_amount) > 0) {
          const amt = Number(l.debit_amount)
          const t   = classifyAcct(l.account_id, l.chart_of_accounts?.name)
          if (t === 'cash')      { cashReceipts += amt; classifiedDebit += amt; acctBal[l.account_id] = (acctBal[l.account_id] || 0) + amt }
          else if (t === 'bank') { bankReceipts += amt; classifiedDebit += amt; acctBal[l.account_id] = (acctBal[l.account_id] || 0) + amt }
        }
      }
      // Sum all asset debits in this entry; anything not cash/bank goes to cash catch-all
      const totalAssetDebit = lines.reduce((s, l) => s + (l.chart_of_accounts?.account_type === 'Asset' && Number(l.debit_amount) > 0 ? Number(l.debit_amount) : 0), 0)
      const unclassifiedDebit = totalAssetDebit - classifiedDebit
      if (unclassifiedDebit > 0.001) cashReceipts += unclassifiedDebit
      else if (totalAssetDebit < 0.001) cashReceipts += Number(entry.total_debit || 0) // no lines joined

    } else if (entry.voucher_type === 'Payment') {
      const expLines = lines.filter(l => l.chart_of_accounts?.account_type === 'Expense' && Number(l.debit_amount) > 0)
      if (expLines.length > 0) {
        for (const el of expLines) {
          paymentAmts[el.account_id] = (paymentAmts[el.account_id] || 0) + Number(el.debit_amount)
        }
      } else {
        const cat = entry.narration || 'Other Payments'
        paymentOther[cat] = (paymentOther[cat] || 0) + Number(entry.total_credit || 0)
      }
      // Find which cash/bank was credited (for cash vs bank split).
      let classifiedCredit = 0
      for (const l of lines) {
        if (l.chart_of_accounts?.account_type === 'Asset' && Number(l.credit_amount) > 0) {
          const amt = Number(l.credit_amount)
          const t   = classifyAcct(l.account_id, l.chart_of_accounts?.name)
          if (t === 'cash')      { cashPayments += amt; classifiedCredit += amt; acctBal[l.account_id] = (acctBal[l.account_id] || 0) - amt }
          else if (t === 'bank') { bankPayments += amt; classifiedCredit += amt; acctBal[l.account_id] = (acctBal[l.account_id] || 0) - amt }
        }
      }
      const totalAssetCredit = lines.reduce((s, l) => s + (l.chart_of_accounts?.account_type === 'Asset' && Number(l.credit_amount) > 0 ? Number(l.credit_amount) : 0), 0)
      const unclassifiedCredit = totalAssetCredit - classifiedCredit
      if (unclassifiedCredit > 0.001) cashPayments += unclassifiedCredit
      else if (totalAssetCredit < 0.001) cashPayments += Number(entry.total_credit || 0) // no lines joined

    } else if (entry.voucher_type === 'Contra') {
      // Contra = cash ↔ bank transfer; update the cash/bank split without adding to groups
      for (const l of lines) {
        if (l.chart_of_accounts?.account_type !== 'Asset') continue
        const t = classifyAcct(l.account_id, l.chart_of_accounts?.name)
        if (t === 'cash') {
          if (Number(l.debit_amount)  > 0) { cashReceipts += Number(l.debit_amount);  acctBal[l.account_id] = (acctBal[l.account_id] || 0) + Number(l.debit_amount) }
          if (Number(l.credit_amount) > 0) { cashPayments += Number(l.credit_amount); acctBal[l.account_id] = (acctBal[l.account_id] || 0) - Number(l.credit_amount) }
        } else if (t === 'bank') {
          if (Number(l.debit_amount)  > 0) { bankReceipts += Number(l.debit_amount);  acctBal[l.account_id] = (acctBal[l.account_id] || 0) + Number(l.debit_amount) }
          if (Number(l.credit_amount) > 0) { bankPayments += Number(l.credit_amount); acctBal[l.account_id] = (acctBal[l.account_id] || 0) - Number(l.credit_amount) }
        }
      }

    } else if (entry.voucher_type === 'Journal') {
      // Journal entries that move cash/bank must be reflected in the closing balance.
      // Debit to cash/bank = receipt; credit = payment. Use narration as the display label.
      for (const l of lines) {
        if (l.chart_of_accounts?.account_type !== 'Asset') continue
        const t = classifyAcct(l.account_id, l.chart_of_accounts?.name)
        if (t === 'cash') {
          if (Number(l.debit_amount) > 0) {
            cashReceipts += Number(l.debit_amount)
            acctBal[l.account_id] = (acctBal[l.account_id] || 0) + Number(l.debit_amount)
            const cat = entry.narration || 'Journal Receipts'
            receiptOther[cat] = (receiptOther[cat] || 0) + Number(l.debit_amount)
          }
          if (Number(l.credit_amount) > 0) {
            cashPayments += Number(l.credit_amount)
            acctBal[l.account_id] = (acctBal[l.account_id] || 0) - Number(l.credit_amount)
            const cat = entry.narration || 'Journal Payments'
            paymentOther[cat] = (paymentOther[cat] || 0) + Number(l.credit_amount)
          }
        } else if (t === 'bank') {
          if (Number(l.debit_amount) > 0) {
            bankReceipts += Number(l.debit_amount)
            acctBal[l.account_id] = (acctBal[l.account_id] || 0) + Number(l.debit_amount)
            const cat = entry.narration || 'Journal Receipts'
            receiptOther[cat] = (receiptOther[cat] || 0) + Number(l.debit_amount)
          }
          if (Number(l.credit_amount) > 0) {
            bankPayments += Number(l.credit_amount)
            acctBal[l.account_id] = (acctBal[l.account_id] || 0) - Number(l.credit_amount)
            const cat = entry.narration || 'Journal Payments'
            paymentOther[cat] = (paymentOther[cat] || 0) + Number(l.credit_amount)
          }
        }
      }
    }
    // Opening Balance entries excluded from period R&P body
  }

  // Build receipts/payments mirroring COA hierarchy (same grouping as COA tree).
  // Two-pass: first identify which L3 parents have L4 children in amts,
  // then build groups cleanly without key collisions.
  function buildHier(amts, others) {
    // Pass 1: find all L3 IDs that have ≥1 L4 child with an amount
    const l3WithChildren = new Set()
    for (const id of Object.keys(amts)) {
      const acct = coaById[id]
      if (acct?.level === 4 && acct.parent_id) {
        const par = coaById[acct.parent_id]
        if (par?.level === 3) l3WithChildren.add(par.id)
      }
    }

    // Pass 2: build groups
    const groups = {}   // key → { name, total, children[] }
    for (const [id, amount] of Object.entries(amts)) {
      if (!(amount > 0)) continue
      const acct = coaById[id]

      if (acct?.level === 4 && acct.parent_id) {
        const par = coaById[acct.parent_id]
        if (par?.level === 3) {
          // L4 sub-ledger → group under L3 parent
          const key = 'grp_' + par.id
          if (!groups[key]) groups[key] = { name: par.name, total: 0, children: [] }
          groups[key].total += amount
          groups[key].children.push({ name: acct.name, amount, accountId: id })
          continue
        }
      }

      if (acct?.level === 3 && l3WithChildren.has(acct.id)) {
        // L3 with L4 children in amts — include its direct amount inside the same group
        const key = 'grp_' + acct.id
        if (!groups[key]) groups[key] = { name: acct.name, total: 0, children: [] }
        groups[key].total += amount
        groups[key].children.push({ name: acct.name, amount, accountId: id })
        continue
      }

      // Flat item (L3 with no active L4 children, L2, or other levels)
      groups['flat_' + id] = { name: acct?.name || id, total: amount, children: [] }
    }

    for (const [name, amount] of Object.entries(others)) {
      if (!(amount > 0)) continue
      groups['__o__' + name] = { name, total: amount, children: [] }
    }

    return Object.values(groups)
      .map(g => {
        if (g.children.length === 0) {
          return { name: g.name, amount: g.total, accountId: null, children: [] }
        }
        if (g.children.length === 1) {
          // Single active child — show child name directly (no group wrapper)
          const c = g.children[0]
          return { name: c.name, amount: g.total, accountId: c.accountId, children: [] }
        }
        // Multiple children — show as expandable group
        return { name: g.name, amount: g.total, accountId: null, children: g.children.sort((a, b) => b.amount - a.amount) }
      })
      .filter(g => g.amount > 0)
      .sort((a, b) => b.amount - a.amount)
  }

  const receipts = buildHier(receiptAmts, receiptOther)
  const payments = buildHier(paymentAmts, paymentOther)

  const totalReceipts      = receipts.reduce((s, r) => s + r.amount, 0)
  const totalPayments      = payments.reduce((s, p) => s + p.amount, 0)
  const cashClosingBalance = cashOpeningBalance + cashReceipts - cashPayments
  const bankClosingBalance = bankOpeningBalance + bankReceipts - bankPayments
  const closingBalance     = cashClosingBalance + bankClosingBalance

  const cashAccounts = Object.keys(acctBal)
    .filter(id => assetType[id] === 'cash' && Math.abs(acctBal[id]) >= 0.01)
    .map(id => ({ id, name: acctName[id], balance: acctBal[id] }))
  const bankAccounts = Object.keys(acctBal)
    .filter(id => assetType[id] === 'bank' && Math.abs(acctBal[id]) >= 0.01)
    .map(id => ({ id, name: acctName[id], balance: acctBal[id] }))

  const cashAccountsOB = Object.keys(acctOBal)
    .filter(id => assetType[id] === 'cash' && Math.abs(acctOBal[id]) >= 0.01)
    .map(id => ({ id, name: acctName[id], balance: acctOBal[id] }))
  const bankAccountsOB = Object.keys(acctOBal)
    .filter(id => assetType[id] === 'bank' && Math.abs(acctOBal[id]) >= 0.01)
    .map(id => ({ id, name: acctName[id], balance: acctOBal[id] }))

  return {
    openingBalance, cashOpeningBalance, bankOpeningBalance,
    receipts, payments, totalReceipts, totalPayments,
    closingBalance, cashClosingBalance, bankClosingBalance,
    cashAccounts, bankAccounts, cashAccountsOB, bankAccountsOB,
  }
}

// ── Dashboard stats ───────────────────────────────────────────────

export async function getAccountingStats(fy, entityId) {
  let coaQ = supabase
    .from('chart_of_accounts')
    .select('id, name, parent_id, opening_balance, account_type')
    .eq('account_type', 'Asset')
    .eq('is_active', true)
  if (entityId) coaQ = coaQ.eq('entity_id', entityId)

  const [tb, is, { data: allAssetCOA }] = await Promise.all([
    getTrialBalance(fy, entityId),
    getIncomeStatement(fy, entityId),
    coaQ,
  ])

  // Build a map from the trial balance — reads directly from journal_entry_lines,
  // always accurate regardless of the account_balances cache state.
  const tbMap = {}
  for (const t of tb) tbMap[t.id] = t

  // Use COA directly so accounts with no current-FY transactions (but a COA opening balance) are included
  const assetCOA = allAssetCOA || []
  const assetParentIds = new Set(assetCOA.map(a => a.parent_id).filter(Boolean))
  const assetLeaves = assetCOA.filter(a => !assetParentIds.has(a.id))

  function leafBalance(a) {
    const t = tbMap[a.id]
    const op = Number(a.opening_balance || 0)
    return op + Number(t?.total_debit || 0) - Number(t?.total_credit || 0)
  }

  const cashRe = /cash|hand|petty/i
  const bankRe = /bank/i
  const cashAccounts = assetLeaves
    .filter(a => cashRe.test(a.name) && !bankRe.test(a.name))
    .map(a => ({ id: a.id, name: a.name, balance: leafBalance(a) }))
    .sort((a, b) => a.name.localeCompare(b.name))
  const bankAccounts = assetLeaves
    .filter(a => bankRe.test(a.name))
    .map(a => ({ id: a.id, name: a.name, balance: leafBalance(a) }))
    .sort((a, b) => a.name.localeCompare(b.name))

  const totalAssets = tb.filter(a => a.account_type === 'Asset')
                        .reduce((s, a) => s + (a.total_debit - a.total_credit), 0)
  const totalLiabilities = tb.filter(a => a.account_type === 'Liability')
                              .reduce((s, a) => s + (a.total_credit - a.total_debit), 0)

  let totalEntriesQ = supabase
    .from('journal_entries').select('id', { count: 'exact', head: true }).eq('financial_year', fy)
  let draftEntriesQ = supabase
    .from('journal_entries').select('id', { count: 'exact', head: true }).eq('financial_year', fy).eq('is_posted', false)
  if (entityId) {
    totalEntriesQ = totalEntriesQ.eq('entity_id', entityId)
    draftEntriesQ = draftEntriesQ.eq('entity_id', entityId)
  }
  const [{ count: totalEntries }, { count: draftEntries }] = await Promise.all([totalEntriesQ, draftEntriesQ])

  return {
    totalAssets,
    totalLiabilities,
    netWorth:     totalAssets - totalLiabilities,
    totalIncome:  is.totalIncome,
    totalExpenses:is.totalExpenses,
    netIncome:    is.netIncome,
    totalEntries: totalEntries || 0,
    draftEntries: draftEntries || 0,
    cashAccounts,
    bankAccounts,
    cashTotal: cashAccounts.reduce((s, a) => s + a.balance, 0),
    bankTotal: bankAccounts.reduce((s, a) => s + a.balance, 0),
  }
}

// ── Audit log helper ──────────────────────────────────────────────

async function logAudit(action, entityType, entityId, entityData, oldData, performedBy) {
  await supabase.from('accounting_audit_log').insert({
    action, entity_type: entityType, entity_id: entityId,
    entity_data: entityData, old_data: oldData, performed_by: performedBy,
  })
}

export async function getAuditLog(limit = 100) {
  const { data, error } = await supabase
    .from('accounting_audit_log')
    .select('*')
    .order('performed_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return data || []
}

export async function getEntryAuditLog(entryId) {
  const { data, error } = await supabase
    .from('accounting_audit_log')
    .select('*')
    .eq('entity_type', 'journal_entry')
    .eq('entity_id', entryId)
    .order('performed_at', { ascending: false })
  if (error) throw error
  return data || []
}

// ── Type/color helpers ────────────────────────────────────────────

export const ACCOUNT_TYPES = ['Asset', 'Liability', 'Equity', 'Income', 'Expense']

// Church-appropriate display label: "Equity" stored in DB, shown as "Corpus Fund" in UI
export function displayAccountType(type) {
  return type === 'Equity' ? 'Corpus Fund' : type
}

export const TYPE_COLOR = {
  Asset:     { bg: '#dbeafe', text: '#1d4ed8' },
  Liability: { bg: '#fee2e2', text: '#b91c1c' },
  Equity:    { bg: '#d1fae5', text: '#065f46' },
  Income:    { bg: '#dcfce7', text: '#16a34a' },
  Expense:   { bg: '#fff7ed', text: '#c2410c' },
}

export const VOUCHER_TYPES = ['Receipt', 'Payment', 'Journal', 'Contra', 'Opening']

export const VOUCHER_COLOR = {
  Receipt: { bg: '#dcfce7', text: '#16a34a' },
  Payment: { bg: '#fee2e2', text: '#b91c1c' },
  Journal: { bg: '#dbeafe', text: '#1d4ed8' },
  Contra:  { bg: '#f3e8ff', text: '#7c3aed' },
  Opening: { bg: '#fff7ed', text: '#c2410c' },
}
