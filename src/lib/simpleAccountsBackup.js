/* ════════════════════════════════════════════════════════════════
   simpleAccountsBackup.js — Backup & Restore for Simple Accounts
   ════════════════════════════════════════════════════════════════ */

import { supabase } from './supabase'

// ── Formatting helpers ────────────────────────────────────────────

const HDR_BG  = '1E3A5F'
const HDR_FG  = 'FFFFFF'
const ALT_BG  = 'EEF3FA'
const CLR_IN  = 'C5CEE0'
const CLR_OUT = '1E3A5F'

function border(top, bottom, left, right) {
  const thick = () => ({ style: 'thick', color: { argb: CLR_OUT } })
  const thin  = () => ({ style: 'thin',  color: { argb: CLR_IN  } })
  return { top: top ? thick() : thin(), bottom: bottom ? thick() : thin(), left: left ? thick() : thin(), right: right ? thick() : thin() }
}

function styleTable(ws) {
  const nCols = ws.columns.length
  const nRows = ws.rowCount

  ws.getRow(1).height = 24
  for (let ci = 1; ci <= nCols; ci++) {
    const cell = ws.getRow(1).getCell(ci)
    cell.font      = { bold: true, color: { argb: HDR_FG }, size: 11, name: 'Calibri' }
    cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: HDR_BG } }
    cell.alignment = { vertical: 'middle', horizontal: 'center' }
    cell.border    = border(true, false, ci === 1, ci === nCols)
  }

  for (let ri = 2; ri <= nRows; ri++) {
    const row    = ws.getRow(ri)
    const isLast = ri === nRows
    row.height = 18
    for (let ci = 1; ci <= nCols; ci++) {
      const cell = row.getCell(ci)
      cell.font      = { size: 10, name: 'Calibri' }
      cell.alignment = { vertical: 'middle', wrapText: false }
      cell.border    = border(false, isLast, ci === 1, ci === nCols)
      if (ri % 2 === 0) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ALT_BG } }
    }
  }
}

function styleInfo(ws) {
  ws.getColumn(1).width = 24
  ws.getColumn(2).width = 44
  ws.eachRow((row, ri) => {
    row.height = 20
    if (ri === 1) {
      row.getCell(1).font = { bold: true, size: 13, color: { argb: HDR_BG }, name: 'Calibri' }
      return
    }
    row.getCell(1).font = { bold: true, size: 10, color: { argb: '555555' }, name: 'Calibri' }
    row.getCell(2).font = { size: 10, name: 'Calibri' }
    if (ri % 2 === 0) {
      row.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'F5F7FA' } }
      row.getCell(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'F5F7FA' } }
    }
  })
}

// ─────────────────────────────────────────────────────────────────

export async function exportSimpleAccountsBackup(churchName = '') {
  const ExcelJS = (await import('exceljs')).default

  const [{ data: accounts }, { data: categories }, { data: transactions }] = await Promise.all([
    supabase.from('simple_accounts').select('*').order('sort_order').order('name'),
    supabase.from('simple_categories').select('*').order('sort_order').order('name'),
    supabase.from('simple_transactions').select('*').eq('is_deleted', false).order('txn_date'),
  ])

  const wb = new ExcelJS.Workbook()
  wb.creator = 'Church CMS — Simple Accounts'
  wb.created = new Date()

  // Sheet 1: Info (metadata)
  const wsInfo = wb.addWorksheet('Info')
  wsInfo.getColumn(1).width = 22
  wsInfo.getColumn(2).width = 42
  ;[
    ['Simple Accounts Backup', ''],
    ['church_name',        churchName],
    ['export_date',        new Date().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })],
    ['version',            '1.0'],
    ['accounts_count',    String(accounts?.length  || 0)],
    ['categories_count',  String(categories?.length || 0)],
    ['transactions_count', String(transactions?.length || 0)],
  ].forEach(r => wsInfo.addRow(r))
  styleInfo(wsInfo)

  // Sheet 2: Accounts
  const wsAccts = wb.addWorksheet('Accounts')
  wsAccts.columns = [
    { header: 'id',              key: 'id',              width: 38 },
    { header: 'name',            key: 'name',            width: 28 },
    { header: 'account_type',    key: 'account_type',    width: 14 },
    { header: 'opening_balance', key: 'opening_balance', width: 18 },
    { header: 'opening_date',    key: 'opening_date',    width: 14 },
    { header: 'account_number',  key: 'account_number',  width: 20 },
    { header: 'sort_order',      key: 'sort_order',      width: 12 },
    { header: 'is_active',       key: 'is_active',       width: 10 },
    { header: 'notes',           key: 'notes',           width: 30 },
  ]
  for (const a of accounts || []) wsAccts.addRow({
    id: a.id, name: a.name, account_type: a.account_type,
    opening_balance: a.opening_balance, opening_date: a.opening_date,
    account_number: a.account_number, sort_order: a.sort_order,
    is_active: a.is_active, notes: a.notes,
  })
  styleTable(wsAccts)

  // Sheet 3: Categories
  const wsCats = wb.addWorksheet('Categories')
  wsCats.columns = [
    { header: 'id',         key: 'id',         width: 38 },
    { header: 'name',       key: 'name',       width: 28 },
    { header: 'type',       key: 'type',       width: 12 },
    { header: 'sort_order', key: 'sort_order', width: 12 },
    { header: 'is_active',  key: 'is_active',  width: 10 },
  ]
  for (const c of categories || []) wsCats.addRow({
    id: c.id, name: c.name, type: c.type,
    sort_order: c.sort_order, is_active: c.is_active,
  })
  styleTable(wsCats)

  // Sheet 4: Transactions
  const wsTxns = wb.addWorksheet('Transactions')
  wsTxns.columns = [
    { header: 'id',            key: 'id',            width: 38 },
    { header: 'txn_date',      key: 'txn_date',      width: 14 },
    { header: 'txn_type',      key: 'txn_type',      width: 12 },
    { header: 'description',   key: 'description',   width: 40 },
    { header: 'amount',        key: 'amount',        width: 14 },
    { header: 'account_id',    key: 'account_id',    width: 38 },
    { header: 'to_account_id', key: 'to_account_id', width: 38 },
    { header: 'category_id',   key: 'category_id',   width: 38 },
    { header: 'ref_no',        key: 'ref_no',        width: 16 },
    { header: 'notes',         key: 'notes',         width: 30 },
  ]
  for (const t of transactions || []) wsTxns.addRow({
    id: t.id, txn_date: t.txn_date, txn_type: t.txn_type,
    description: t.description, amount: t.amount,
    account_id: t.account_id, to_account_id: t.to_account_id,
    category_id: t.category_id, ref_no: t.ref_no, notes: t.notes,
  })
  styleTable(wsTxns)

  const buffer  = await wb.xlsx.writeBuffer()
  const blob    = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url     = URL.createObjectURL(blob)
  const anchor  = document.createElement('a')
  anchor.href     = url
  anchor.download = `simple-accounts-backup-${new Date().toISOString().slice(0, 10)}.xlsx`
  anchor.click()
  URL.revokeObjectURL(url)

  return {
    accounts:     accounts?.length  || 0,
    categories:   categories?.length || 0,
    transactions: transactions?.length || 0,
  }
}

export async function parseAndValidateSimpleBackup(file) {
  const ExcelJS = (await import('exceljs')).default
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(await file.arrayBuffer())

  const errors   = []
  const warnings = []

  const wsInfo   = wb.getWorksheet('Info')
  const wsAccts  = wb.getWorksheet('Accounts')
  const wsCats   = wb.getWorksheet('Categories')
  const wsTxns   = wb.getWorksheet('Transactions')

  if (!wsInfo)  errors.push('Missing "Info" sheet — this does not appear to be a Simple Accounts backup file.')
  if (!wsAccts) errors.push('Missing "Accounts" sheet.')
  if (!wsCats)  errors.push('Missing "Categories" sheet.')
  if (!wsTxns)  errors.push('Missing "Transactions" sheet.')
  if (errors.length) return { valid: false, errors, warnings, summary: null, parsed: null }

  // Parse Info
  const info = {}
  wsInfo.eachRow(row => {
    const k = String(row.getCell(1).value || '').trim()
    const v = String(row.getCell(2).value || '').trim()
    if (k) info[k] = v
  })

  const version = info.version || ''
  if (!version.startsWith('1.')) warnings.push(`Backup version "${version || 'unknown'}" may not be fully compatible.`)

  // Generic sheet parser — uses row 1 as headers (which are the DB column names)
  function parseSheet(ws) {
    const headers = ws.getRow(1).values.slice(1).map(h => String(h || '').trim())
    const rows = []
    ws.eachRow((row, i) => {
      if (i === 1) return
      const obj = {}
      headers.forEach((h, idx) => { obj[h] = row.getCell(idx + 1).value })
      if (obj.id) rows.push(obj)
    })
    return rows
  }

  const accounts     = parseSheet(wsAccts)
  const categories   = parseSheet(wsCats)
  const transactions = parseSheet(wsTxns)

  if (accounts.length === 0) warnings.push('No accounts found in this backup file.')

  return {
    valid: true,
    errors,
    warnings,
    summary: {
      churchName:   info.church_name  || '',
      exportDate:   info.export_date  || '',
      accounts:     accounts.length,
      categories:   categories.length,
      transactions: transactions.length,
    },
    parsed: { accounts, categories, transactions },
  }
}

export async function applySimpleBackupRestore(parsed) {
  // Delete in FK order
  const { error: e1 } = await supabase.from('simple_transactions')
    .delete().gte('id', '00000000-0000-0000-0000-000000000000')
  if (e1) throw e1
  const { error: e2 } = await supabase.from('simple_accounts')
    .delete().gte('id', '00000000-0000-0000-0000-000000000000')
  if (e2) throw e2
  const { error: e3 } = await supabase.from('simple_categories')
    .delete().gte('id', '00000000-0000-0000-0000-000000000000')
  if (e3) throw e3

  if (parsed.accounts.length) {
    const { error } = await supabase.from('simple_accounts').insert(
      parsed.accounts.map(a => ({
        id:              String(a.id),
        name:            String(a.name || ''),
        account_type:    String(a.account_type || 'cash'),
        opening_balance: Number(a.opening_balance) || 0,
        opening_date:    a.opening_date  ? String(a.opening_date)  : null,
        account_number:  a.account_number ? String(a.account_number) : null,
        sort_order:      Number(a.sort_order) || 0,
        is_active:       a.is_active !== false && String(a.is_active) !== 'false',
        notes:           a.notes ? String(a.notes) : null,
      }))
    )
    if (error) throw error
  }

  if (parsed.categories.length) {
    const { error } = await supabase.from('simple_categories').insert(
      parsed.categories.map(c => ({
        id:         String(c.id),
        name:       String(c.name || ''),
        type:       String(c.type || 'income'),
        sort_order: Number(c.sort_order) || 0,
        is_active:  c.is_active !== false && String(c.is_active) !== 'false',
      }))
    )
    if (error) throw error
  }

  if (parsed.transactions.length) {
    const { error } = await supabase.from('simple_transactions').insert(
      parsed.transactions.map(t => ({
        id:            String(t.id),
        txn_date:      String(t.txn_date || ''),
        txn_type:      String(t.txn_type || 'income'),
        description:   t.description   ? String(t.description)   : null,
        amount:        Number(t.amount) || 0,
        account_id:    t.account_id    ? String(t.account_id)    : null,
        to_account_id: t.to_account_id ? String(t.to_account_id) : null,
        category_id:   t.category_id   ? String(t.category_id)   : null,
        ref_no:        t.ref_no        ? String(t.ref_no)        : null,
        notes:         t.notes         ? String(t.notes)         : null,
        is_deleted:    false,
      }))
    )
    if (error) throw error
  }
}
