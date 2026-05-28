import { supabase } from './supabase'
import { createJournalEntry, postJournalEntry, nextEntryNumber, getAccountingSettings } from './accountingLib'

// ── Helpers ───────────────────────────────────────────────────────

function fyFromDate(dateStr) {
  const d = dateStr ? new Date(dateStr + 'T00:00:00') : new Date()
  const m = d.getMonth() + 1
  const y = d.getFullYear()
  return m >= 4 ? `${y}-${String(y + 1).slice(2)}` : `${y - 1}-${String(y).slice(2)}`
}

// ── Fetch untransferred receipts in a date/receipt-no range ───────

export async function getUntransferredReceipts({ fromDate, toDate, fromReceiptNo, toReceiptNo } = {}) {
  let q = supabase
    .from('receipts')
    .select(`
      id, receipt_number, receipt_date, financial_year,
      payment_mode, grand_total,
      receipt_items(category_id, total)
    `)
    .is('transfer_batch_id', null)
    .order('receipt_number', { ascending: true })

  if (fromDate)      q = q.gte('receipt_date', fromDate)
  if (toDate)        q = q.lte('receipt_date', toDate)
  if (fromReceiptNo) q = q.gte('receipt_number', fromReceiptNo)
  if (toReceiptNo)   q = q.lte('receipt_number', toReceiptNo)

  const { data, error } = await q
  if (error) throw error
  return data || []
}

// ── Get first/last untransferred receipt numbers for a date range ──
// When fromDate/toDate are provided, receipt range is scoped to that period.

export async function getUntransferredRange(fy, fromDate, toDate) {
  let firstQ = supabase.from('receipts')
    .select('receipt_number, receipt_date')
    .is('transfer_batch_id', null)
    .eq('financial_year', fy)
    .order('receipt_number', { ascending: true })
    .limit(1)

  let lastQ = supabase.from('receipts')
    .select('receipt_number, receipt_date')
    .is('transfer_batch_id', null)
    .eq('financial_year', fy)
    .order('receipt_number', { ascending: false })
    .limit(1)

  if (fromDate) { firstQ = firstQ.gte('receipt_date', fromDate); lastQ = lastQ.gte('receipt_date', fromDate) }
  if (toDate)   { firstQ = firstQ.lte('receipt_date', toDate);   lastQ = lastQ.lte('receipt_date', toDate)   }

  const [{ data: first }, { data: last }] = await Promise.all([
    firstQ.maybeSingle(),
    lastQ.maybeSingle(),
  ])
  return {
    fromReceiptNo: first?.receipt_number || null,
    toReceiptNo:   last?.receipt_number  || null,
    fromDate:      first?.receipt_date   || null,
    toDate:        last?.receipt_date    || null,
  }
}

// ── Aggregate receipts by category and payment mode ───────────────
// Returns { cashByCategory: { [catId]: amount }, bankByCategory: { [catId]: amount },
//           cashTotal, bankTotal }

export function aggregateByCategoryAndMode(receipts) {
  const cashByCategory = {}
  const bankByCategory = {}
  let cashTotal = 0
  let bankTotal = 0

  for (const r of receipts) {
    const isCash = r.payment_mode === 'Cash'
    for (const item of r.receipt_items || []) {
      const catId = item.category_id
      const amt   = Number(item.total || 0)
      if (amt <= 0) continue
      if (isCash) {
        cashByCategory[catId] = (cashByCategory[catId] || 0) + amt
        cashTotal += amt
      } else {
        bankByCategory[catId] = (bankByCategory[catId] || 0) + amt
        bankTotal += amt
      }
    }
  }

  return { cashByCategory, bankByCategory, cashTotal, bankTotal }
}

// ── Ensure every category has a COA account, auto-create if missing ─
// Returns map: { [categoryId]: coaAccountId }

export async function ensureCOAMapping(categoryIds, entityId, performedBy) {
  const { data: cats, error: catErr } = await supabase
    .from('payment_categories')
    .select('id, name, coa_account_id')
    .in('id', categoryIds)
  if (catErr) throw catErr

  const catMap = {}
  for (const c of cats || []) catMap[c.id] = c

  const needsCreate = (cats || []).filter(c => !c.coa_account_id)

  if (needsCreate.length > 0) {
    // Find or create the "Receipt Income" sub-group under Income
    const receiptIncomeParentId = await ensureReceiptIncomeGroup(entityId, performedBy)

    for (const cat of needsCreate) {
      const autoCode = `RI-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 5).toUpperCase()}`
      const { data: newAcc, error: accErr } = await supabase
        .from('chart_of_accounts')
        .insert({
          code:        autoCode,
          name:        cat.name,
          account_type:'Income',
          parent_id:   receiptIncomeParentId,
          level:       3,
          is_postable: true,
          is_active:   true,
          sort_order:  0,
          entity_id:   entityId || null,
          created_by:  performedBy,
          updated_by:  performedBy,
        })
        .select('id').single()
      if (accErr) throw accErr

      await supabase
        .from('payment_categories')
        .update({ coa_account_id: newAcc.id })
        .eq('id', cat.id)

      catMap[cat.id] = { ...cat, coa_account_id: newAcc.id }
    }
  }

  const result = {}
  for (const [id, cat] of Object.entries(catMap)) {
    result[id] = cat.coa_account_id
  }
  return result
}

// Find or create the "Receipt Income" Level-2 group under the top-level Income group
async function ensureReceiptIncomeGroup(entityId, performedBy) {
  // Try to find existing "Receipt Income" group
  let q = supabase
    .from('chart_of_accounts')
    .select('id')
    .eq('name', 'Receipt Income')
    .eq('account_type', 'Income')
  if (entityId) q = q.eq('entity_id', entityId)
  const { data: existing } = await q.maybeSingle()
  if (existing) return existing.id

  // Find a Level-1 Income parent
  let parentQ = supabase
    .from('chart_of_accounts')
    .select('id')
    .eq('account_type', 'Income')
    .is('parent_id', null)
  if (entityId) parentQ = parentQ.eq('entity_id', entityId)
  const { data: incomeRoot } = await parentQ.maybeSingle()

  const autoCode = `RI-GRP-${Date.now().toString(36).toUpperCase()}`
  const { data: group, error } = await supabase
    .from('chart_of_accounts')
    .insert({
      code:         autoCode,
      name:        'Receipt Income',
      account_type:'Income',
      parent_id:   incomeRoot?.id || null,
      level:       incomeRoot ? 2 : 1,
      is_postable: false,
      is_active:   true,
      sort_order:  5,
      entity_id:   entityId || null,
      created_by:  performedBy,
      updated_by:  performedBy,
    })
    .select('id').single()
  if (error) throw error
  return group.id
}

// ── Load accounting entities for entity selector ──────────────────

export async function getAccountingEntities() {
  const { data, error } = await supabase
    .from('accounting_entities')
    .select('id, name, entity_type, is_active')
    .eq('is_active', true)
    .order('created_at', { ascending: true })
  if (error) throw error
  return data || []
}

// ── Load cash COA accounts (Asset accounts whose name contains cash/hand/petty) ──

export async function getCashAccountsForTransfer(entityId) {
  let q = supabase
    .from('chart_of_accounts')
    .select('id, name, code')
    .eq('account_type', 'Asset')
    .eq('is_active', true)
    .or('name.ilike.%cash%,name.ilike.%hand%,name.ilike.%petty%')
    .order('name')
  if (entityId) q = q.eq('entity_id', entityId)
  const { data, error } = await q
  if (error) throw error
  return data || []
}

// ── Load bank COA accounts (Asset accounts whose name contains "bank") ──

export async function getBankAccountsForTransfer(entityId) {
  // Fetch ALL asset accounts (no entity filter) so parent_id detection
  // works even when a parent's children belong to a different entity_id
  const { data, error } = await supabase
    .from('chart_of_accounts')
    .select('id, name, code, parent_id, entity_id, is_active, level')
    .eq('account_type', 'Asset')
    .order('name')
  if (error) throw error
  const all = data || []
  const parentIds = new Set(all.map(a => a.parent_id).filter(Boolean))
  return all.filter(a =>
    !parentIds.has(a.id) &&
    a.is_active &&
    a.level === 4 &&
    a.name.toLowerCase().includes('bank') &&
    (!entityId || a.entity_id === entityId)
  )
}

// ── Main: execute the transfer ─────────────────────────────────────
// Returns { batch, cashJournal, bankJournal }

export async function executeTransfer({
  receipts,
  fromDate,
  toDate,
  fromReceiptNo,
  toReceiptNo,
  cashCoaAccountId,   // chart_of_accounts.id for the cash debit line
  bankCoaAccountId,   // chart_of_accounts.id for the bank debit line
  entityId,
  performedBy,
}) {
  if (!receipts.length) throw new Error('No receipts to transfer.')

  const settings = await getAccountingSettings()
  const fy = fyFromDate(fromDate)

  const { cashByCategory, bankByCategory, cashTotal, bankTotal } =
    aggregateByCategoryAndMode(receipts)

  const allCatIds = Array.from(new Set([
    ...Object.keys(cashByCategory),
    ...Object.keys(bankByCategory),
  ]))
  const coaMap = await ensureCOAMapping(allCatIds, entityId, performedBy)

  const customPrefixes = {
    Receipt: settings.accounting_prefix_receipt || 'RV',
  }

  let cashJournal = null
  let bankJournal = null

  // ── Cash JV ──────────────────────────────────────────────────────
  if (cashTotal > 0.005) {
    if (!cashCoaAccountId) throw new Error('Select a Cash account for the Cash JV.')

    const cashCreditLines = Object.entries(cashByCategory)
      .filter(([, amt]) => amt > 0.005)
      .map(([catId, amt]) => ({
        account_id:    coaMap[catId],
        debit_amount:  0,
        credit_amount: amt,
        description:   null,
      }))

    const cashEntryNo = await nextEntryNumber(fy, 'Receipt', null, customPrefixes)
    const narration   = `Receipt Transfer (Cash) — ${fmtDate(fromDate)} to ${fmtDate(toDate)} | ${fromReceiptNo} to ${toReceiptNo}`

    cashJournal = await createJournalEntry(
      {
        entry_number:   cashEntryNo,
        entry_date:     toDate,
        financial_year: fy,
        voucher_type:   'Receipt',
        narration,
        reference_no:   `${fromReceiptNo} to ${toReceiptNo}`,
        entity_id:      entityId || null,
      },
      [
        { account_id: cashCoaAccountId, debit_amount: cashTotal, credit_amount: 0, description: 'Cash Receipts' },
        ...cashCreditLines,
      ],
      performedBy,
    )
    await postJournalEntry(cashJournal.id, performedBy)
  }

  // ── Bank JV ──────────────────────────────────────────────────────
  if (bankTotal > 0.005) {
    if (!bankCoaAccountId) throw new Error('Select a Bank account for the Bank JV.')

    const bankCreditLines = Object.entries(bankByCategory)
      .filter(([, amt]) => amt > 0.005)
      .map(([catId, amt]) => ({
        account_id:    coaMap[catId],
        debit_amount:  0,
        credit_amount: amt,
        description:   null,
      }))

    const bankEntryNo = await nextEntryNumber(fy, 'Receipt', null, customPrefixes)
    const narration   = `Receipt Transfer (Bank) — ${fmtDate(fromDate)} to ${fmtDate(toDate)} | ${fromReceiptNo} to ${toReceiptNo}`

    bankJournal = await createJournalEntry(
      {
        entry_number:   bankEntryNo,
        entry_date:     toDate,
        financial_year: fy,
        voucher_type:   'Receipt',
        narration,
        reference_no:   `${fromReceiptNo} to ${toReceiptNo}`,
        entity_id:      entityId || null,
      },
      [
        { account_id: bankCoaAccountId, debit_amount: bankTotal, credit_amount: 0, description: 'Bank / Cheque Receipts' },
        ...bankCreditLines,
      ],
      performedBy,
    )
    await postJournalEntry(bankJournal.id, performedBy)
  }

  // ── Save batch record ─────────────────────────────────────────────
  const { data: batch, error: bErr } = await supabase
    .from('receipt_transfer_batches')
    .insert({
      from_date:       fromDate,
      to_date:         toDate,
      from_receipt_no: fromReceiptNo,
      to_receipt_no:   toReceiptNo,
      financial_year:  fy,
      entity_id:       entityId || null,
      cash_journal_id: cashJournal?.id   || null,
      bank_journal_id: bankJournal?.id   || null,
      bank_account_id: null,
      receipt_count:   receipts.length,
      cash_total:      cashTotal,
      bank_total:      bankTotal,
      transferred_by:  performedBy,
    })
    .select().single()
  if (bErr) throw bErr

  // ── Mark receipts as transferred ──────────────────────────────────
  const ids = receipts.map(r => r.id)
  const { error: rErr } = await supabase
    .from('receipts')
    .update({ transfer_batch_id: batch.id })
    .in('id', ids)
  if (rErr) throw rErr

  return { batch, cashJournal, bankJournal }
}

// ── Reverse a transfer batch (requires delete password) ───────────

export async function reverseTransfer(batchId, password, performedBy) {
  // Verify using the user's own login password (same pattern as FY unlock / receipt delete)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) throw new Error('Not authenticated.')
  const { error: authErr } = await supabase.auth.signInWithPassword({ email: user.email, password })
  if (authErr) throw new Error('Incorrect password.')

  const { data: batch, error: bFetchErr } = await supabase
    .from('receipt_transfer_batches')
    .select('*')
    .eq('id', batchId)
    .single()
  if (bFetchErr) throw bFetchErr
  if (batch.is_reversed) throw new Error('This transfer has already been reversed.')

  // Delete journal entries (CASCADE deletes lines; also reverse balance cache)
  const toDelete = [batch.cash_journal_id, batch.bank_journal_id].filter(Boolean)
  for (const jeId of toDelete) {
    const { data: je } = await supabase.from('journal_entries').select('*').eq('id', jeId).single()
    if (je?.is_posted) {
      const { data: lines } = await supabase.from('journal_entry_lines').select('*').eq('journal_entry_id', jeId)
      if (lines?.length) {
        // Reverse balance cache
        for (const line of lines) {
          let q = supabase.from('account_balances').select('*').eq('account_id', line.account_id).eq('financial_year', je.financial_year)
          if (je.entity_id) q = q.eq('entity_id', je.entity_id)
          const { data: bal } = await q.maybeSingle()
          if (!bal) continue
          const newD = Number(bal.total_debit)  - Number(line.debit_amount  || 0)
          const newC = Number(bal.total_credit) - Number(line.credit_amount || 0)
          await supabase.from('account_balances').upsert({
            account_id:     line.account_id,
            financial_year: je.financial_year,
            entity_id:      je.entity_id,
            opening_balance:Number(bal.opening_balance),
            total_debit:    Math.max(0, newD),
            total_credit:   Math.max(0, newC),
            closing_balance:Number(bal.opening_balance) + Math.max(0, newD) - Math.max(0, newC),
            last_updated_at:new Date().toISOString(),
          }, { onConflict: 'account_id,financial_year,entity_id' })
        }
      }
    }
    await supabase.from('journal_entries').delete().eq('id', jeId)
  }

  // Clear transfer_batch_id on receipts
  await supabase
    .from('receipts')
    .update({ transfer_batch_id: null })
    .eq('transfer_batch_id', batchId)

  // Mark batch as reversed
  await supabase
    .from('receipt_transfer_batches')
    .update({ is_reversed: true, reversed_at: new Date().toISOString(), reversed_by: performedBy })
    .eq('id', batchId)
}

// ── Load transfer history ─────────────────────────────────────────

export async function getTransferBatches(fy) {
  // Auto-purge batches older than 30 days (FIFO cleanup — JEs and receipts are unaffected)
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - 30)
  await supabase
    .from('receipt_transfer_batches')
    .delete()
    .lt('transferred_at', cutoff.toISOString())

  let q = supabase
    .from('receipt_transfer_batches')
    .select('*')
    .order('transferred_at', { ascending: false })
  if (fy) q = q.eq('financial_year', fy)
  const { data, error } = await q
  if (error) throw error
  return data || []
}

// ── Format date for narration (DD-Mon-YYYY) ───────────────────────
function fmtDate(iso) {
  if (!iso) return iso
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  const [y, m, d] = iso.split('-')
  return `${d}-${months[parseInt(m, 10) - 1]}-${y}`
}
