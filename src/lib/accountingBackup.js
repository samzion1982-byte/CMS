/* ═══════════════════════════════════════════════════════════════
   accountingBackup.js — Full export + restore for Accounting module

   Export  : ExcelJS  →  5-sheet workbook (.xlsx)
   Restore : SheetJS  →  parse → validate → apply

   Sheets
   ──────
   _Meta            : metadata + integrity checksum
   Settings         : all accounting_* columns from churches table
   Accounts         : chart_of_accounts (parent_code not parent UUID)
   Journal_Entries  : journal_entries header rows
   Entry_Lines      : journal_entry_lines (entry_number + account_code as FK)
   ═══════════════════════════════════════════════════════════════ */

import ExcelJS from 'exceljs'
import * as XLSX from 'xlsx'
import { supabase } from './supabase'

const BACKUP_VERSION    = '1.0'
const REQUIRED_SHEETS   = ['_Meta', 'Settings', 'Accounts', 'Journal_Entries', 'Entry_Lines']

const HDR_BG   = 'FF1E3A5F'
const HDR_FG   = 'FFFFFFFF'
const ALT_BG   = 'FFEEF3FA'
const BORDER_C = 'FFC5CEE0'

// ── Sheet styling helper ──────────────────────────────────────────

function styleSheet(ws, rows) {
  const headerRow = ws.getRow(1)
  headerRow.height = 22
  headerRow.eachCell({ includeEmpty: true }, cell => {
    cell.font      = { bold: true, color: { argb: HDR_FG }, size: 10, name: 'Calibri' }
    cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: HDR_BG } }
    cell.alignment = { vertical: 'middle', horizontal: 'left' }
    cell.border    = { bottom: { style: 'medium', color: { argb: 'FF1E3A5F' } } }
  })
  rows.forEach((_, i) => {
    const row = ws.getRow(i + 2)
    row.height = 18
    if (i % 2 === 1) {
      row.eachCell({ includeEmpty: true }, cell => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ALT_BG } }
      })
    }
    row.eachCell({ includeEmpty: true }, cell => {
      cell.border = {
        top:    { style: 'thin', color: { argb: BORDER_C } },
        bottom: { style: 'thin', color: { argb: BORDER_C } },
        left:   { style: 'thin', color: { argb: BORDER_C } },
        right:  { style: 'thin', color: { argb: BORDER_C } },
      }
      cell.font      = { ...cell.font, size: 10, name: 'Calibri' }
      cell.alignment = { vertical: 'middle' }
    })
  })
}

function autoWidth(ws, columns, rows) {
  ws.columns = columns.map(c => {
    const contentLens = rows.map(r => String(r[c.key] ?? '').length)
    const max = Math.max(c.header.length, ...contentLens)
    return { ...c, width: Math.min(Math.max(max + 4, 12), 60) }
  })
}

// ════════════════════════════════════════════════════════════════
//  EXPORT
// ════════════════════════════════════════════════════════════════

export async function exportAccountingBackup() {
  // ── Fetch everything in parallel ───────────────────────────────
  const [
    { data: church,  error: e1 },
    { data: accounts, error: e2 },
    { data: entries,  error: e3 },
    { data: rawLines, error: e4 },
  ] = await Promise.all([
    supabase.from('churches').select('*').limit(1).single(),
    supabase.from('chart_of_accounts').select('*').order('sort_order').order('name'),
    supabase.from('journal_entries').select('*').order('entry_date').order('entry_number'),
    supabase
      .from('journal_entry_lines')
      .select('*, journal_entries(entry_number), chart_of_accounts(code)')
      .order('journal_entry_id')
      .order('line_number'),
  ])

  if (e1 || e2 || e3 || e4) throw new Error('Failed to fetch data for export.')

  const acctList  = accounts  || []
  const entryList = entries   || []
  const lineList  = rawLines  || []

  // Build id → code map (used for parent_code and default account codes)
  const idToCode = {}
  acctList.forEach(a => { idToCode[a.id] = a.code })

  const totalDebit  = lineList.reduce((s, l) => s + Number(l.debit_amount  || 0), 0)
  const totalCredit = lineList.reduce((s, l) => s + Number(l.credit_amount || 0), 0)

  // ── Build workbook ─────────────────────────────────────────────
  const wb = new ExcelJS.Workbook()
  wb.creator  = 'Church CMS — Accounting Backup'
  wb.created  = new Date()
  wb.modified = new Date()

  // ── Sheet 1: _Meta ─────────────────────────────────────────────
  const wsMeta = wb.addWorksheet('_Meta')
  const metaRows = [
    { key: 'BackupVersion',  value: BACKUP_VERSION },
    { key: 'ExportDate',     value: new Date().toISOString() },
    { key: 'ChurchName',     value: church?.church_name || '' },
    { key: 'TotalAccounts',  value: acctList.length },
    { key: 'TotalEntries',   value: entryList.length },
    { key: 'TotalLines',     value: lineList.length },
    { key: 'TotalDebitSum',  value: totalDebit.toFixed(2) },
    { key: 'TotalCreditSum', value: totalCredit.toFixed(2) },
    { key: 'Checksum',       value: (totalDebit + acctList.length + entryList.length).toFixed(2) },
  ]
  const metaCols = [
    { header: 'Key',   key: 'key',   width: 22 },
    { header: 'Value', key: 'value', width: 50 },
  ]
  wsMeta.columns = metaCols
  metaRows.forEach(r => wsMeta.addRow(r))
  styleSheet(wsMeta, metaRows)

  // ── Sheet 2: Settings ──────────────────────────────────────────
  const wsSettings = wb.addWorksheet('Settings')
  const SETTINGS_KEYS = [
    'accounting_enabled',
    'accounting_country',          'accounting_currency',
    'accounting_number_format',    'accounting_date_format',
    'accounting_report_subtitle',  'accounting_default_voucher',
    'accounting_auto_post',        'accounting_auto_post_receipts',
    'accounting_prefix_receipt',   'accounting_prefix_payment',
    'accounting_prefix_journal',   'accounting_prefix_contra',
    'accounting_prefix_opening',
    'accounting_period_lock_date', 'accounting_opening_date',
    'accounting_fiscal_month',
    'accounting_entry_system',     'accounting_entry_system_locked',
  ]
  // Resolve default-account UUIDs → codes for portable restore
  const settingsRows = SETTINGS_KEYS.map(k => ({ setting: k, value: church?.[k] ?? '' }))
  settingsRows.push(
    { setting: '_default_cash_account_code', value: idToCode[church?.accounting_default_cash_id] || '' },
    { setting: '_default_bank_account_code', value: idToCode[church?.accounting_default_bank_id] || '' },
  )

  const settingsCols = [
    { header: 'Setting', key: 'setting', width: 38 },
    { header: 'Value',   key: 'value',   width: 50 },
  ]
  wsSettings.columns = settingsCols
  settingsRows.forEach(r => wsSettings.addRow(r))
  styleSheet(wsSettings, settingsRows)

  // ── Sheet 3: Accounts ──────────────────────────────────────────
  const wsAccts = wb.addWorksheet('Accounts')
  const acctRows = acctList.map(a => ({
    code:                 a.code,
    name:                 a.name,
    account_type:         a.account_type,
    parent_code:          a.parent_id ? (idToCode[a.parent_id] || '') : '',
    level:                a.level || 1,
    is_postable:          a.is_postable === false ? 'false' : 'true',
    description:          a.description || '',
    opening_balance:      Number(a.opening_balance || 0),
    opening_balance_date: a.opening_balance_date || '',
    is_active:            a.is_active === false ? 'false' : 'true',
    sort_order:           a.sort_order || 0,
  }))
  const acctCols = [
    { header: 'code',                 key: 'code',                 },
    { header: 'name',                 key: 'name',                 },
    { header: 'account_type',         key: 'account_type',         },
    { header: 'parent_code',          key: 'parent_code',          },
    { header: 'level',                key: 'level',                },
    { header: 'is_postable',          key: 'is_postable',          },
    { header: 'description',          key: 'description',          },
    { header: 'opening_balance',      key: 'opening_balance',      },
    { header: 'opening_balance_date', key: 'opening_balance_date', },
    { header: 'is_active',            key: 'is_active',            },
    { header: 'sort_order',           key: 'sort_order',           },
  ]
  autoWidth(wsAccts, acctCols, acctRows)
  acctRows.forEach(r => wsAccts.addRow(r))
  styleSheet(wsAccts, acctRows)

  // ── Sheet 4: Journal_Entries ───────────────────────────────────
  const wsEntries = wb.addWorksheet('Journal_Entries')
  const entryRows = entryList.map(e => ({
    entry_number:     e.entry_number,
    entry_date:       e.entry_date       || '',
    financial_year:   e.financial_year,
    voucher_type:     e.voucher_type,
    reference_number: e.reference_number || '',
    narration:        e.narration        || '',
    total_debit:      Number(e.total_debit  || 0),
    total_credit:     Number(e.total_credit || 0),
    is_posted:        e.is_posted ? 'true' : 'false',
    posted_at:        e.posted_at   || '',
    created_at:       e.created_at  || '',
    created_by:       e.created_by  || '',
  }))
  const entryCols = [
    { header: 'entry_number',     key: 'entry_number',     },
    { header: 'entry_date',       key: 'entry_date',       },
    { header: 'financial_year',   key: 'financial_year',   },
    { header: 'voucher_type',     key: 'voucher_type',     },
    { header: 'reference_number', key: 'reference_number', },
    { header: 'narration',        key: 'narration',        },
    { header: 'total_debit',      key: 'total_debit',      },
    { header: 'total_credit',     key: 'total_credit',     },
    { header: 'is_posted',        key: 'is_posted',        },
    { header: 'posted_at',        key: 'posted_at',        },
    { header: 'created_at',       key: 'created_at',       },
    { header: 'created_by',       key: 'created_by',       },
  ]
  autoWidth(wsEntries, entryCols, entryRows)
  entryRows.forEach(r => wsEntries.addRow(r))
  styleSheet(wsEntries, entryRows)

  // ── Sheet 5: Entry_Lines ───────────────────────────────────────
  const wsLines = wb.addWorksheet('Entry_Lines')
  const lineRows = lineList.map(l => ({
    entry_number:  l.journal_entries?.entry_number || '',
    account_code:  l.chart_of_accounts?.code        || '',
    debit_amount:  Number(l.debit_amount  || 0),
    credit_amount: Number(l.credit_amount || 0),
    description:   l.description || '',
    line_number:   l.line_number || 0,
  }))
  const lineCols = [
    { header: 'entry_number',  key: 'entry_number',  },
    { header: 'account_code',  key: 'account_code',  },
    { header: 'debit_amount',  key: 'debit_amount',  },
    { header: 'credit_amount', key: 'credit_amount', },
    { header: 'description',   key: 'description',   },
    { header: 'line_number',   key: 'line_number',   },
  ]
  autoWidth(wsLines, lineCols, lineRows)
  lineRows.forEach(r => wsLines.addRow(r))
  styleSheet(wsLines, lineRows)

  // ── Download ───────────────────────────────────────────────────
  const today    = new Date().toISOString().slice(0, 10)
  const filename = `accounting-backup-${today}.xlsx`
  const buffer   = await wb.xlsx.writeBuffer()
  const blob     = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url = URL.createObjectURL(blob)
  const a   = document.createElement('a')
  a.href     = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)

  return {
    accounts: acctList.length,
    entries:  entryList.length,
    lines:    lineList.length,
    filename,
  }
}

// ════════════════════════════════════════════════════════════════
//  PARSE & VALIDATE
// ════════════════════════════════════════════════════════════════

export async function parseAndValidateBackup(file) {
  const ab = await file.arrayBuffer()
  let wb
  try {
    wb = XLSX.read(ab, { type: 'array', cellDates: false, raw: false })
  } catch {
    return { valid: false, errors: ['File could not be read. Make sure it is a valid .xlsx backup file.'], warnings: [], summary: null, parsed: null }
  }

  const errors   = []
  const warnings = []

  // ── Required sheets present? ───────────────────────────────────
  for (const name of REQUIRED_SHEETS) {
    if (!wb.SheetNames.includes(name)) errors.push(`Missing sheet: "${name}"`)
  }
  if (errors.length) return { valid: false, errors, warnings, summary: null, parsed: null }

  // ── Parse each sheet ───────────────────────────────────────────
  const metaRaw     = XLSX.utils.sheet_to_json(wb.Sheets['_Meta'],            { header: ['key', 'value'], range: 1 })
  const settingsRaw = XLSX.utils.sheet_to_json(wb.Sheets['Settings'],         { header: ['setting', 'value'], range: 1 })
  const accountRows = XLSX.utils.sheet_to_json(wb.Sheets['Accounts'])
  const entryRows   = XLSX.utils.sheet_to_json(wb.Sheets['Journal_Entries'])
  const lineRows    = XLSX.utils.sheet_to_json(wb.Sheets['Entry_Lines'])

  // Build lookup maps from raw rows
  const meta     = {}
  metaRaw.forEach(r  => { if (r.key)     meta[String(r.key)]             = r.value })

  // ── Version check ──────────────────────────────────────────────
  if (!meta.BackupVersion) {
    errors.push('This does not look like a Church CMS accounting backup (BackupVersion missing in _Meta).')
    return { valid: false, errors, warnings, summary: null, parsed: null }
  }
  if (meta.BackupVersion !== BACKUP_VERSION) {
    warnings.push(`Backup version ${meta.BackupVersion} differs from current version ${BACKUP_VERSION}. Restore may still work.`)
  }

  // ── Accounts validation ────────────────────────────────────────
  const accountCodes = new Set()
  for (const a of accountRows) {
    if (!a.code) { errors.push('An account row is missing the "code" field.'); break }
    if (!a.name) errors.push(`Account "${a.code}" is missing the "name" field.`)
    if (!a.account_type) errors.push(`Account "${a.code}" is missing "account_type".`)
    if (accountCodes.has(String(a.code))) errors.push(`Duplicate account code: "${a.code}".`)
    accountCodes.add(String(a.code))
  }
  for (const a of accountRows) {
    if (a.parent_code && !accountCodes.has(String(a.parent_code))) {
      errors.push(`Account "${a.code}" references unknown parent_code "${a.parent_code}".`)
    }
  }

  // ── Journal Entries validation ─────────────────────────────────
  const entryNumbers = new Set()
  for (const e of entryRows) {
    if (!e.entry_number) { errors.push('A journal entry row is missing "entry_number".'); break }
    if (entryNumbers.has(String(e.entry_number))) errors.push(`Duplicate entry_number: "${e.entry_number}".`)
    entryNumbers.add(String(e.entry_number))
  }

  // ── Entry Lines cross-reference ────────────────────────────────
  let orphanLineErrors = 0
  for (const l of lineRows) {
    if (!entryNumbers.has(String(l.entry_number))) {
      orphanLineErrors++
      if (orphanLineErrors <= 3) errors.push(`Entry line references unknown entry_number: "${l.entry_number}".`)
    }
    if (!accountCodes.has(String(l.account_code))) {
      orphanLineErrors++
      if (orphanLineErrors <= 3) errors.push(`Entry line references unknown account_code: "${l.account_code}".`)
    }
  }
  if (orphanLineErrors > 3) errors.push(`…and ${orphanLineErrors - 3} more cross-reference errors.`)

  // ── Checksum integrity check ───────────────────────────────────
  if (meta.TotalAccounts !== undefined && Number(meta.TotalAccounts) !== accountRows.length) {
    warnings.push(`Account count mismatch — backup says ${meta.TotalAccounts}, found ${accountRows.length}. File may be incomplete.`)
  }
  if (meta.TotalEntries !== undefined && Number(meta.TotalEntries) !== entryRows.length) {
    warnings.push(`Entry count mismatch — backup says ${meta.TotalEntries}, found ${entryRows.length}. File may be incomplete.`)
  }
  if (meta.TotalLines !== undefined && Number(meta.TotalLines) !== lineRows.length) {
    warnings.push(`Line count mismatch — backup says ${meta.TotalLines}, found ${lineRows.length}. File may be incomplete.`)
  }

  // ── Balance check (posted entries only) ───────────────────────
  const entryDrMap = {}
  const entryCrMap = {}
  for (const l of lineRows) {
    const en = String(l.entry_number)
    entryDrMap[en] = (entryDrMap[en] || 0) + Number(l.debit_amount  || 0)
    entryCrMap[en] = (entryCrMap[en] || 0) + Number(l.credit_amount || 0)
  }
  let imbalanced = 0
  for (const e of entryRows) {
    if (e.is_posted !== 'true' && e.is_posted !== true) continue
    const dr = entryDrMap[String(e.entry_number)] || 0
    const cr = entryCrMap[String(e.entry_number)] || 0
    if (Math.abs(dr - cr) > 0.01) {
      imbalanced++
      if (imbalanced <= 2) {
        warnings.push(`Posted entry "${e.entry_number}" is imbalanced (Dr ${dr.toFixed(2)} ≠ Cr ${cr.toFixed(2)}).`)
      }
    }
  }
  if (imbalanced > 2) warnings.push(`…and ${imbalanced - 2} more imbalanced posted entries.`)

  // ── Summary ───────────────────────────────────────────────────
  const postedCount = entryRows.filter(e => e.is_posted === 'true' || e.is_posted === true).length
  const summary = {
    exportDate:    String(meta.ExportDate   || ''),
    churchName:    String(meta.ChurchName   || ''),
    accounts:      accountRows.length,
    entries:       entryRows.length,
    postedEntries: postedCount,
    draftEntries:  entryRows.length - postedCount,
    lines:         lineRows.length,
    totalDebit:    Number(meta.TotalDebitSum  || 0),
    totalCredit:   Number(meta.TotalCreditSum || 0),
  }

  const parsed = errors.length === 0 ? { meta, settings: settingsRaw, accounts: accountRows, entries: entryRows, lines: lineRows } : null
  return { valid: errors.length === 0, errors, warnings, summary, parsed }
}

// ════════════════════════════════════════════════════════════════
//  APPLY RESTORE
// ════════════════════════════════════════════════════════════════

export async function applyBackupRestore(parsed, churchId, performedBy) {
  const { settings, accounts, entries, lines } = parsed

  // ── 1. Restore settings ────────────────────────────────────────
  const settingsMap = {}
  settings.forEach(r => { if (r.setting) settingsMap[String(r.setting)] = r.value })

  const COERCE_BOOL   = new Set(['accounting_enabled', 'accounting_auto_post', 'accounting_auto_post_receipts', 'accounting_entry_system_locked'])
  const COERCE_INT    = new Set(['accounting_fiscal_month'])
  const NULLABLE_KEYS = new Set(['accounting_report_subtitle', 'accounting_period_lock_date', 'accounting_opening_date'])

  const RESTORABLE_SETTINGS = [
    'accounting_enabled',          'accounting_country',
    'accounting_currency',         'accounting_number_format',
    'accounting_date_format',      'accounting_report_subtitle',
    'accounting_default_voucher',  'accounting_auto_post',
    'accounting_auto_post_receipts',
    'accounting_prefix_receipt',   'accounting_prefix_payment',
    'accounting_prefix_journal',   'accounting_prefix_contra',
    'accounting_prefix_opening',   'accounting_period_lock_date',
    'accounting_opening_date',     'accounting_fiscal_month',
    'accounting_entry_system',     'accounting_entry_system_locked',
  ]

  const settingsUpdate = {}
  for (const key of RESTORABLE_SETTINGS) {
    let v = settingsMap[key]
    if (v === undefined) continue
    if (COERCE_BOOL.has(key)) {
      v = v === 'true' || v === true
    } else if (COERCE_INT.has(key)) {
      v = Number(v)
    } else if (NULLABLE_KEYS.has(key) && (v === '' || v == null)) {
      v = null
    }
    settingsUpdate[key] = v
  }

  const { error: settingsErr } = await supabase.from('churches').update(settingsUpdate).eq('id', churchId)
  if (settingsErr) throw new Error('Settings restore failed: ' + settingsErr.message)

  // ── 2. Flush existing data (FK-safe order) ─────────────────────
  // journal_entry_lines cascade from journal_entries
  await supabase.from('journal_entries')   .delete().gte('id', '00000000-0000-0000-0000-000000000000')
  await supabase.from('account_balances')  .delete().gte('id', '00000000-0000-0000-0000-000000000000')
  await supabase.from('chart_of_accounts') .delete().gte('id', '00000000-0000-0000-0000-000000000000')

  // ── 3. Restore Chart of Accounts (topological: parents first) ──
  const codeToId = await _insertAccountsTopological(accounts, performedBy)

  // ── 4. Re-link default account UUIDs from saved codes ─────────
  const cashCode = settingsMap['_default_cash_account_code']
  const bankCode = settingsMap['_default_bank_account_code']
  if (cashCode || bankCode) {
    const defaultUpdate = {}
    if (cashCode && codeToId[String(cashCode)]) defaultUpdate.accounting_default_cash_id = codeToId[String(cashCode)]
    if (bankCode && codeToId[String(bankCode)]) defaultUpdate.accounting_default_bank_id = codeToId[String(bankCode)]
    if (Object.keys(defaultUpdate).length) {
      await supabase.from('churches').update(defaultUpdate).eq('id', churchId)
    }
  }

  // ── 5. Restore Journal Entries ─────────────────────────────────
  const entryNumToId = {}
  const entryBatch   = entries.map(e => ({
    entry_number:     String(e.entry_number),
    entry_date:       e.entry_date       || null,
    financial_year:   String(e.financial_year),
    voucher_type:     String(e.voucher_type),
    reference_number: e.reference_number || null,
    narration:        e.narration        || null,
    total_debit:      Number(e.total_debit  || 0),
    total_credit:     Number(e.total_credit || 0),
    is_posted:        e.is_posted === 'true' || e.is_posted === true,
    posted_at:        e.posted_at  || null,
    created_at:       e.created_at || new Date().toISOString(),
    created_by:       e.created_by || performedBy,
    updated_by:       performedBy,
  }))

  for (let i = 0; i < entryBatch.length; i += 100) {
    const { data: inserted, error } = await supabase
      .from('journal_entries')
      .insert(entryBatch.slice(i, i + 100))
      .select('id, entry_number')
    if (error) throw new Error('Journal entries restore failed: ' + error.message)
    inserted.forEach(e => { entryNumToId[e.entry_number] = e.id })
  }

  // ── 6. Restore Entry Lines ─────────────────────────────────────
  const lineBatch = []
  for (const l of lines) {
    const jeId  = entryNumToId[String(l.entry_number)]
    const acctId = codeToId[String(l.account_code)]
    if (!jeId || !acctId) continue
    lineBatch.push({
      journal_entry_id: jeId,
      account_id:       acctId,
      debit_amount:     Number(l.debit_amount  || 0),
      credit_amount:    Number(l.credit_amount || 0),
      description:      l.description || null,
      line_number:      Number(l.line_number  || 0),
    })
  }

  for (let i = 0; i < lineBatch.length; i += 200) {
    const { error } = await supabase.from('journal_entry_lines').insert(lineBatch.slice(i, i + 200))
    if (error) throw new Error('Entry lines restore failed: ' + error.message)
  }

  // ── 7. Recalculate account balances from scratch ───────────────
  await recalculateAccountBalances()
}

// ── Topological account insert (parents before children) ─────────

async function _insertAccountsTopological(accounts, performedBy) {
  const codeToId = {}
  const pending  = accounts.map(a => ({ ...a, code: String(a.code), parent_code: a.parent_code ? String(a.parent_code) : '' }))
  let safetyLimit = accounts.length + 5

  while (pending.length > 0 && safetyLimit-- > 0) {
    const ready     = []
    const deferred  = []

    for (const a of pending) {
      if (!a.parent_code || codeToId[a.parent_code]) {
        ready.push(a)
      } else {
        deferred.push(a)
      }
    }

    // Safety: if nothing is ready (circular/unknown parent), force-insert all remaining
    if (ready.length === 0) ready.push(...deferred.splice(0))

    const rows = ready.map(a => ({
      code:                 a.code,
      name:                 String(a.name),
      account_type:         String(a.account_type),
      parent_id:            a.parent_code ? (codeToId[a.parent_code] || null) : null,
      level:                Number(a.level || 1),
      is_postable:          a.is_postable !== 'false' && a.is_postable !== false,
      description:          a.description || null,
      opening_balance:      Number(a.opening_balance || 0),
      opening_balance_date: a.opening_balance_date || null,
      is_active:            a.is_active !== 'false' && a.is_active !== false,
      sort_order:           Number(a.sort_order || 0),
      created_by:           performedBy,
      updated_by:           performedBy,
    }))

    const { data: inserted, error } = await supabase.from('chart_of_accounts').insert(rows).select('id, code')
    if (error) throw new Error('Chart of Accounts restore failed: ' + error.message)
    inserted.forEach(a => { codeToId[a.code] = a.id })

    pending.length = 0
    pending.push(...deferred)
  }

  return codeToId
}

// ── Recalculate account_balances from posted entry lines ──────────

export async function recalculateAccountBalances() {
  const { data: lines, error } = await supabase
    .from('journal_entry_lines')
    .select('account_id, debit_amount, credit_amount, journal_entries!inner(financial_year, is_posted)')
    .eq('journal_entries.is_posted', true)

  if (error) throw new Error('Balance recalculation failed: ' + error.message)

  // Aggregate per (account_id, financial_year)
  const balMap = {}
  for (const l of lines || []) {
    const fy  = l.journal_entries.financial_year
    const key = `${l.account_id}||${fy}`
    if (!balMap[key]) balMap[key] = { account_id: l.account_id, financial_year: fy, total_debit: 0, total_credit: 0 }
    balMap[key].total_debit  += Number(l.debit_amount  || 0)
    balMap[key].total_credit += Number(l.credit_amount || 0)
  }

  const rows = Object.values(balMap).map(b => ({
    account_id:      b.account_id,
    financial_year:  b.financial_year,
    opening_balance: 0,
    total_debit:     b.total_debit,
    total_credit:    b.total_credit,
    closing_balance: b.total_debit - b.total_credit,
    last_updated_at: new Date().toISOString(),
  }))

  for (let i = 0; i < rows.length; i += 100) {
    const { error: uErr } = await supabase
      .from('account_balances')
      .upsert(rows.slice(i, i + 100), { onConflict: 'account_id,financial_year' })
    if (uErr) throw new Error('Balance upsert failed: ' + uErr.message)
  }
}
