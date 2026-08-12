/* ═══════════════════════════════════════════════════════════════
   AccountingReportsPage.jsx — Day Book, Account Summary & GL Reports
   ═══════════════════════════════════════════════════════════════ */

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useToast } from '../lib/toast'
import { supabase } from '../lib/supabase'
import {
  fmtAmt, fmtDate,
  getJournalEntries, getChartOfAccounts, getTrialBalance,
  VOUCHER_COLOR, displayAccountType,
} from '../lib/accountingLib'
import {
  ArrowLeft, BookOpen, Calendar, Filter, Download,
  TrendingUp, TrendingDown, BarChart2, Loader2,
  ChevronDown, ChevronRight, FileText, Search, X, Scale,
  ArrowUp, ArrowDown, FileSpreadsheet,
} from 'lucide-react'
import { exportToExcel, exportToExcelWithTitle } from '../lib/exportExcel'
import { useEntity } from '../lib/EntityContext'
import { useEntityFY } from '../lib/useEntityFY'

// ── Helpers ───────────────────────────────────────────────────────

const localISO = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`

function VBadge({ type }) {
  const c = VOUCHER_COLOR[type] || { bg: '#f1f5f9', text: '#475569' }
  return <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 99, background: c.bg, color: c.text, whiteSpace: 'nowrap' }}>{type}</span>
}

function TabBtn({ active, onClick, children }) {
  return (
    <button onClick={onClick} style={{
      padding: '8px 18px', borderRadius: 8, cursor: 'pointer',
      fontSize: 13, fontWeight: active ? 700 : 500,
      background: active ? 'var(--accent)' : 'var(--card-bg)',
      color: active ? '#fff' : 'var(--text-2)',
      border: active ? 'none' : '1.5px solid var(--card-border)',
      transition: 'all 0.15s',
    }}>{children}</button>
  )
}

// ════════════════════════════════════════════════════════════════
//  MAIN PAGE
// ════════════════════════════════════════════════════════════════

export default function AccountingReportsPage() {
  const navigate = useNavigate()
  const toast    = useToast()
  const { currentEntityId, currentEntity } = useEntity()

  const [tab, setTab] = useState('daybook') // 'daybook' | 'account-summary' | 'group-report'

  const today = localISO(new Date())
  const monthStart = today.slice(0, 8) + '01'

  // ── Day Book state ────────────────────────────────────────────
  const [dbFrom,    setDbFrom]    = useState(monthStart)
  const [dbTo,      setDbTo]      = useState(today)
  const [dbType,    setDbType]    = useState('')
  const [dbPosted,  setDbPosted]  = useState('true')
  const [dbSearch,  setDbSearch]  = useState('')
  const [dbEntries, setDbEntries] = useState([])
  const [dbLoading, setDbLoading] = useState(false)
  const [dbLines,   setDbLines]   = useState({}) // id → lines[]
  const [dbDateSort, setDbDateSort] = useState('desc') // 'asc' | 'desc'

  // ── Account Summary state ─────────────────────────────────────
  const { fy, setFy, fyOpen, setFyOpen, FYS } = useEntityFY()
  const [acTypeFilter, setAcTypeFilter] = useState('')
  const [allAccounts, setAllAccounts] = useState([])
  const [balances,    setBalances]    = useState([])
  const [acLoading,   setAcLoading]   = useState(false)

  // ── Group Report state ────────────────────────────────────────
  const [grpExpanded, setGrpExpanded] = useState(new Set())
  const [grShowZero,  setGrShowZero]  = useState(false)

  const AC_TYPES = ['Asset', 'Liability', 'Equity', 'Income', 'Expense']

  // ── Load Day Book ─────────────────────────────────────────────
  const loadDayBook = useCallback(async () => {
    if (!dbFrom || !dbTo) return
    setDbLoading(true)
    try {
      const entries = await getJournalEntries({
        from:     dbFrom,
        to:       dbTo,
        type:     dbType || undefined,
        posted:   dbPosted === '' ? undefined : dbPosted === 'true',
        entityId: currentEntityId,
      })
      setDbEntries(entries)
      setDbLines({})
    } catch (e) { toast(e.message, 'error') }
    setDbLoading(false)
  }, [dbFrom, dbTo, dbType, dbPosted, currentEntityId, toast])

  useEffect(() => { if (tab === 'daybook') loadDayBook() }, [tab, loadDayBook])

  // ── Load Account Summary ──────────────────────────────────────
  const loadAccountSummary = useCallback(async () => {
    setAcLoading(true)
    try {
      // Use trial balance (reads from journal_entry_lines directly) so balances
      // are always accurate regardless of the account_balances cache state.
      const tb = await getTrialBalance(fy, currentEntityId)
      const active = tb.filter(a => a.is_active !== false)
      setAllAccounts(active)
      setBalances(active.map(t => ({
        account_id:      t.id,
        opening_balance: t.opening_balance || 0,
        total_debit:     t.total_debit     || 0,
        total_credit:    t.total_credit    || 0,
      })))
    } catch (e) { toast(e.message, 'error') }
    setAcLoading(false)
  }, [fy, currentEntityId, toast])

  useEffect(() => { if (tab === 'account-summary' || tab === 'group-report') loadAccountSummary() }, [tab, loadAccountSummary])

  // ── Expand row to show entry lines ────────────────────────────
  async function toggleLines(entry) {
    if (dbLines[entry.id]) {
      setDbLines(prev => { const n = { ...prev }; delete n[entry.id]; return n })
      return
    }
    try {
      const { data } = await supabase
        .from('journal_entry_lines')
        .select('*, chart_of_accounts(code, name)')
        .eq('journal_entry_id', entry.id)
        .order('line_number')
      setDbLines(prev => ({ ...prev, [entry.id]: data || [] }))
    } catch (e) { toast(e.message, 'error') }
  }

  // ── Day Book filtered ─────────────────────────────────────────
  const dbFiltered = dbEntries.filter(e => {
    if (!dbSearch) return true
    const q = dbSearch.toLowerCase()
    return e.entry_number.toLowerCase().includes(q) || (e.narration || '').toLowerCase().includes(q)
  })

  const dbTotalDebit  = dbFiltered.reduce((s, e) => s + Number(e.total_debit  || 0), 0)
  const dbTotalCredit = dbFiltered.reduce((s, e) => s + Number(e.total_credit || 0), 0)

  const dbSorted = [...dbFiltered].sort((a, b) =>
    dbDateSort === 'asc'
      ? (a.entry_date || '').localeCompare(b.entry_date || '')
      : (b.entry_date || '').localeCompare(a.entry_date || '')
  )

  // ── Account Summary filtered ──────────────────────────────────
  const balMap = Object.fromEntries(balances.map(b => [b.account_id, b]))

  const acFiltered = allAccounts
    .filter(a => !acTypeFilter || a.account_type === acTypeFilter)
    .map(a => {
      const b = balMap[a.id]
      return {
        ...a,
        total_debit:  Number(b?.total_debit  || 0),
        total_credit: Number(b?.total_credit || 0),
        opening:      Number(b?.opening_balance || a.opening_balance || 0),
      }
    })
    .filter(a => a.total_debit > 0 || a.total_credit > 0 || a.opening > 0)

  const acByType = AC_TYPES.reduce((acc, t) => {
    acc[t] = acFiltered.filter(a => a.account_type === t)
    return acc
  }, {})

  // ── Group Report computed data ────────────────────────────────
  const childrenMap = useMemo(() => {
    const m = {}
    allAccounts.forEach(a => {
      const k = a.parent_id || '__ROOT__'
      if (!m[k]) m[k] = []
      m[k].push(a)
    })
    return m
  }, [allAccounts])

  const grAllGroupIds = useMemo(
    () => allAccounts.filter(a => (childrenMap[a.id] || []).length > 0).map(a => a.id),
    [allAccounts, childrenMap]
  )

  const grRows = useMemo(() => {
    if (!allAccounts.length) return []
    const lbm = Object.fromEntries(balances.map(b => [b.account_id, b]))

    function leafNet(a) {
      const b = lbm[a.id]
      const dr = Number(b?.total_debit || 0), cr = Number(b?.total_credit || 0)
      const op = Number(b?.opening_balance || a.opening_balance || 0)
      return ['Asset', 'Expense'].includes(a.account_type) ? op + dr - cr : op + cr - dr
    }
    function netBal(a) {
      const ch = childrenMap[a.id] || []
      return ch.length === 0 ? leafNet(a) : ch.reduce((s, c) => s + netBal(c), 0)
    }
    function totDr(a) {
      const ch = childrenMap[a.id] || []
      return ch.length === 0 ? Number(lbm[a.id]?.total_debit || 0) : ch.reduce((s, c) => s + totDr(c), 0)
    }
    function totCr(a) {
      const ch = childrenMap[a.id] || []
      return ch.length === 0 ? Number(lbm[a.id]?.total_credit || 0) : ch.reduce((s, c) => s + totCr(c), 0)
    }

    // Collect all leaf descendants of an account list
    function getLeaves(accounts) {
      const out = []
      accounts.forEach(a => {
        const ch = childrenMap[a.id] || []
        if (ch.length === 0) out.push(a)
        else out.push(...getLeaves(ch))
      })
      return out
    }

    // Identify cash & bank leaf accounts under Assets
    const assetRoots = allAccounts.filter(a => a.account_type === 'Asset' && !a.parent_id)
    const assetLeaves = getLeaves(assetRoots)
    const bankLeaves = assetLeaves.filter(a => /bank/i.test(a.name)).sort((a, b) => a.name.localeCompare(b.name))
    const cashLeaves = assetLeaves.filter(a => /cash|hand|petty/i.test(a.name) && !/bank/i.test(a.name)).sort((a, b) => a.name.localeCompare(b.name))
    const cbIds = new Set([...bankLeaves, ...cashLeaves].map(a => a.id))

    // Does an account (or any descendant) have non-cash/bank content?
    function hasOtherContent(a) {
      const ch = childrenMap[a.id] || []
      if (ch.length === 0) return !cbIds.has(a.id)
      return ch.some(c => hasOtherContent(c))
    }

    function sortedBy(arr) {
      return [...arr].sort((a, b) => {
        const ag = (childrenMap[a.id] || []).length > 0
        const bg = (childrenMap[b.id] || []).length > 0
        if (ag !== bg) return ag ? -1 : 1
        return (a.code || a.name).localeCompare(b.code || b.name)
      })
    }

    // Flatten hierarchy, skipping accounts already in dedicated cash/bank sections
    function flatten(accounts, depth) {
      const rows = []
      sortedBy(accounts).forEach(a => {
        const ch = childrenMap[a.id] || []
        const isGroup = ch.length > 0
        if (!isGroup && cbIds.has(a.id)) return        // shown in dedicated section
        if (isGroup && !hasOtherContent(a)) return     // all children are cash/bank
        const net = netBal(a), dr = totDr(a), cr = totCr(a)
        if (!grShowZero && net === 0 && dr === 0 && cr === 0) return
        rows.push({ ...a, depth, isGroup, net, totalDr: dr, totalCr: cr })
        if (isGroup && grpExpanded.has(a.id)) rows.push(...flatten(ch, depth + 1))
      })
      return rows
    }

    // Build leaf rows for a cash/bank section
    function cbSection(leaves, label, colorKey) {
      const out = []
      const sRows = []
      leaves.forEach(l => {
        const net = leafNet(l), dr = Number(lbm[l.id]?.total_debit || 0), cr = Number(lbm[l.id]?.total_credit || 0)
        if (!grShowZero && net === 0 && dr === 0 && cr === 0) return
        sRows.push({ ...l, depth: 0, isGroup: false, net, totalDr: dr, totalCr: cr })
      })
      if (sRows.length === 0 && !grShowZero) return out
      const totNet = sRows.reduce((s, r) => s + r.net, 0)
      const totD   = sRows.reduce((s, r) => s + r.totalDr, 0)
      const totC   = sRows.reduce((s, r) => s + r.totalCr, 0)
      out.push({ isCashBankHeader: true, label, colorKey, net: totNet, totalDr: totD, totalCr: totC })
      out.push(...sRows)
      return out
    }

    const rows = []
    AC_TYPES.forEach(type => {
      const roots = allAccounts.filter(a => a.account_type === type && !a.parent_id)
      if (roots.length === 0) return
      const typeNet = roots.reduce((s, r) => s + netBal(r), 0)
      const typeDr  = roots.reduce((s, r) => s + totDr(r), 0)
      const typeCr  = roots.reduce((s, r) => s + totCr(r), 0)
      if (!grShowZero && typeNet === 0 && typeDr === 0 && typeCr === 0) return
      rows.push({ isTypeHeader: true, type, net: typeNet, totalDr: typeDr, totalCr: typeCr })

      if (type === 'Asset') {
        rows.push(...cbSection(bankLeaves, 'Bank Accounts', 'bank'))
        rows.push(...cbSection(cashLeaves, 'Cash Accounts', 'cash'))
        rows.push(...flatten(roots, 0))  // remaining non-CB assets
      } else {
        rows.push(...flatten(roots, 0))
      }
    })
    return rows
  }, [allAccounts, balances, childrenMap, grpExpanded, grShowZero])

  // ── Export handlers ───────────────────────────────────────────
  async function doExportDayBook() {
    const cols = [
      { header: 'Date',        key: 'date',   align: 'left'  },
      { header: 'Entry #',     key: 'entry',  align: 'left'  },
      { header: 'Type',        key: 'type',   align: 'left'  },
      { header: 'Narration',   key: 'narr',   align: 'left'  },
      { header: 'Ref No',      key: 'ref',    align: 'left'  },
      { header: 'Debit (₹)',   key: 'debit',  align: 'right' },
      { header: 'Credit (₹)',  key: 'credit', align: 'right' },
      { header: 'Status',      key: 'status', align: 'left'  },
    ]
    const rows = dbSorted.map(e => ({
      date:   e.entry_date ? new Date(e.entry_date + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '',
      entry:  e.entry_number,
      type:   e.voucher_type,
      narr:   e.narration || '',
      ref:    e.reference_no || '',
      debit:  Number(e.total_debit  || 0) || '',
      credit: Number(e.total_credit || 0) || '',
      status: e.is_posted ? 'Posted' : 'Draft',
    }))
    rows.push({ date: '', entry: 'TOTAL', type: '', narr: '', ref: '', debit: dbTotalDebit, credit: dbTotalCredit, status: '' })
    const titleLines = [
      currentEntity?.name ? { text: currentEntity.name, bold: true, size: 13, bg: 'DBEAFE' } : null,
      (currentEntity?.address || currentEntity?.city) ? { text: [currentEntity.address, currentEntity.city].filter(Boolean).join(', '), size: 10 } : null,
      currentEntity?.diocese ? { text: currentEntity.diocese, size: 10, italic: true } : null,
      currentEntity?.description ? { text: currentEntity.description, size: 10, italic: true } : null,
      { text: 'DAY BOOK', bold: true, size: 12, bg: '1E3A5F', color: 'FFFFFF' },
      { text: `${dbFrom}  to  ${dbTo}`, size: 10 },
    ].filter(Boolean)
    await exportToExcelWithTitle(cols, rows, 'Day Book', `DayBook_${dbFrom}_${dbTo}.xlsx`, titleLines)
  }

  async function doExportAccountSummary() {
    const cols = [
      { header: 'Type',             key: 'type',    align: 'left'   },
      { header: 'Code',             key: 'code',    align: 'left'   },
      { header: 'Account Name',     key: 'name',    align: 'left'   },
      { header: 'Level',            key: 'level',   align: 'center' },
      { header: 'Opening (₹)',      key: 'opening', align: 'right'  },
      { header: 'Total Debit (₹)',  key: 'debit',   align: 'right'  },
      { header: 'Total Credit (₹)', key: 'credit',  align: 'right'  },
      { header: 'Net Balance (₹)',  key: 'net',     align: 'right'  },
    ]
    const rows = []
    AC_TYPES.forEach(type => {
      const accounts = acByType[type] || []
      if (!accounts.length) return
      accounts.forEach(a => {
        const net = ['Asset', 'Expense'].includes(a.account_type)
          ? a.opening + a.total_debit - a.total_credit
          : a.opening + a.total_credit - a.total_debit
        rows.push({
          type:    displayAccountType(a.account_type),
          code:    a.code || '',
          name:    '  '.repeat(Math.max(0, (a.level || 1) - 1)) + a.name,
          level:   `L${a.level}`,
          opening: a.opening !== 0 ? a.opening : '',
          debit:   a.total_debit  > 0 ? a.total_debit  : '',
          credit:  a.total_credit > 0 ? a.total_credit : '',
          net:     Math.abs(net),
        })
      })
    })
    const titleLines = [
      currentEntity?.name ? { text: currentEntity.name, bold: true, size: 13, bg: 'DBEAFE' } : null,
      (currentEntity?.address || currentEntity?.city) ? { text: [currentEntity.address, currentEntity.city].filter(Boolean).join(', '), size: 10 } : null,
      currentEntity?.diocese ? { text: currentEntity.diocese, size: 10, italic: true } : null,
      currentEntity?.description ? { text: currentEntity.description, size: 10, italic: true } : null,
      { text: `ACCOUNT SUMMARY — FY ${fy}`, bold: true, size: 12, bg: '1E3A5F', color: 'FFFFFF' },
    ].filter(Boolean)
    await exportToExcelWithTitle(cols, rows, `Account Summary FY ${fy}`, `AccountSummary_FY${fy}.xlsx`, titleLines)
  }

  async function doExportGroupReport() {
    // Compute fully-expanded rows independently of UI expand state
    const lbm = Object.fromEntries(balances.map(b => [b.account_id, b]))

    function leafNet(a) {
      const b = lbm[a.id]
      const dr = Number(b?.total_debit || 0), cr = Number(b?.total_credit || 0)
      const op = Number(b?.opening_balance || a.opening_balance || 0)
      return ['Asset', 'Expense'].includes(a.account_type) ? op + dr - cr : op + cr - dr
    }
    function netBal(a) {
      const ch = childrenMap[a.id] || []
      return ch.length === 0 ? leafNet(a) : ch.reduce((s, c) => s + netBal(c), 0)
    }
    function totDr(a) {
      const ch = childrenMap[a.id] || []
      return ch.length === 0 ? Number(lbm[a.id]?.total_debit || 0) : ch.reduce((s, c) => s + totDr(c), 0)
    }
    function totCr(a) {
      const ch = childrenMap[a.id] || []
      return ch.length === 0 ? Number(lbm[a.id]?.total_credit || 0) : ch.reduce((s, c) => s + totCr(c), 0)
    }

    const cols = [
      { header: 'Account / Group', key: 'name',   align: 'left'  },
      { header: 'Debit (₹)',       key: 'debit',  align: 'right' },
      { header: 'Credit (₹)',      key: 'credit', align: 'right' },
      { header: 'Net Balance (₹)', key: 'net',    align: 'right' },
    ]
    const rows = []

    function flattenAll(accounts, depth) {
      const sortedAccounts = [...accounts].sort((a, b) => {
        const ag = (childrenMap[a.id] || []).length > 0
        const bg = (childrenMap[b.id] || []).length > 0
        if (ag !== bg) return ag ? -1 : 1
        return (a.code || a.name).localeCompare(b.code || b.name)
      })
      sortedAccounts.forEach(a => {
        const ch  = childrenMap[a.id] || []
        const net = netBal(a), dr = totDr(a), cr = totCr(a)
        if (!grShowZero && net === 0 && dr === 0 && cr === 0) return
        const indent = '  '.repeat(depth)
        const prefix = ch.length > 0 ? '▸ ' : '  '
        rows.push({
          name:   indent + prefix + a.name,
          debit:  dr > 0 ? dr : '',
          credit: cr > 0 ? cr : '',
          net:    Math.abs(net),
        })
        if (ch.length > 0) flattenAll(ch, depth + 1)
      })
    }

    AC_TYPES.forEach(type => {
      const roots = allAccounts.filter(a => a.account_type === type && !a.parent_id)
      if (!roots.length) return
      const typeNet = roots.reduce((s, r) => s + netBal(r), 0)
      const typeDr  = roots.reduce((s, r) => s + totDr(r), 0)
      const typeCr  = roots.reduce((s, r) => s + totCr(r), 0)
      if (!grShowZero && typeNet === 0 && typeDr === 0 && typeCr === 0) return
      rows.push({ name: `━━ ${displayAccountType(type).toUpperCase()} ACCOUNTS ━━`, debit: typeDr || '', credit: typeCr || '', net: Math.abs(typeNet) })
      flattenAll(roots, 0)
      rows.push({ name: '', debit: '', credit: '', net: '' })
    })

    const titleLines = [
      currentEntity?.name ? { text: currentEntity.name, bold: true, size: 13, bg: 'DBEAFE' } : null,
      (currentEntity?.address || currentEntity?.city) ? { text: [currentEntity.address, currentEntity.city].filter(Boolean).join(', '), size: 10 } : null,
      currentEntity?.diocese ? { text: currentEntity.diocese, size: 10, italic: true } : null,
      currentEntity?.description ? { text: currentEntity.description, size: 10, italic: true } : null,
      { text: `GROUP REPORT — FY ${fy}`, bold: true, size: 12, bg: '1E3A5F', color: 'FFFFFF' },
    ].filter(Boolean)
    await exportToExcelWithTitle(cols, rows, `Group Report FY ${fy}`, `GroupReport_FY${fy}.xlsx`, titleLines)
  }

  const TYPE_COLOR_MAP = {
    Asset:     { bg: '#dbeafe', text: '#1d4ed8' },
    Liability: { bg: '#fee2e2', text: '#b91c1c' },
    Equity:    { bg: '#f3e8ff', text: '#7c3aed' },
    Income:    { bg: '#dcfce7', text: '#16a34a' },
    Expense:   { bg: '#fff7ed', text: '#c2410c' },
  }

  return (
    <div className="page-container">

      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
            <button onClick={() => navigate('/accounting')} style={{ padding: '6px 8px', background: 'var(--accent)', border: 'none', borderRadius: 7, cursor: 'pointer', display: 'flex', alignItems: 'center', color: '#fff' }}>
              <ArrowLeft size={15} />
            </button>
            <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--accent)', whiteSpace: 'nowrap' }}>Accounts</span>
          </div>
          <div>
            <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
              <BarChart2 size={20} style={{ color: 'var(--accent)' }} /> GL Reports
            </h1>
            <p className="page-subtitle">Day Book &amp; Account Balance Summary</p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <TabBtn active={tab === 'daybook'}        onClick={() => setTab('daybook')}>Day Book</TabBtn>
          <TabBtn active={tab === 'account-summary'} onClick={() => setTab('account-summary')}>Account Summary</TabBtn>
          <TabBtn active={tab === 'group-report'}   onClick={() => setTab('group-report')}>Group Report</TabBtn>
        </div>
      </div>

      {/* ══════════ DAY BOOK TAB ═══════════════════════════════════ */}
      {tab === 'daybook' && (
        <>
          {/* Filter bar */}
          <div className="card" style={{ padding: '12px 16px', marginBottom: 20, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Calendar size={13} style={{ color: 'var(--text-3)' }} />
              <span style={{ fontSize: 12, color: 'var(--text-3)', fontWeight: 600 }}>From</span>
              <input type="date" value={dbFrom} onChange={e => setDbFrom(e.target.value)}
                style={{ height: 34, padding: '0 10px', border: '1.5px solid var(--card-border)', borderRadius: 7, fontSize: 13, background: 'var(--input-bg)', color: 'var(--text-1)', outline: 'none' }} />
              <span style={{ fontSize: 12, color: 'var(--text-3)' }}>to</span>
              <input type="date" value={dbTo} onChange={e => setDbTo(e.target.value)}
                style={{ height: 34, padding: '0 10px', border: '1.5px solid var(--card-border)', borderRadius: 7, fontSize: 13, background: 'var(--input-bg)', color: 'var(--text-1)', outline: 'none' }} />
            </div>

            <select value={dbType} onChange={e => setDbType(e.target.value)} style={{ height: 34, padding: '0 10px', border: '1.5px solid var(--card-border)', borderRadius: 7, fontSize: 13, background: 'var(--input-bg)', color: 'var(--text-1)', outline: 'none' }}>
              <option value="">All Types</option>
              {['Receipt','Payment','Journal','Contra','Opening'].map(t => <option key={t} value={t}>{t}</option>)}
            </select>

            <select value={dbPosted} onChange={e => setDbPosted(e.target.value)} style={{ height: 34, padding: '0 10px', border: '1.5px solid var(--card-border)', borderRadius: 7, fontSize: 13, background: 'var(--input-bg)', color: 'var(--text-1)', outline: 'none' }}>
              <option value="true">Posted Only</option>
              <option value="false">Drafts Only</option>
              <option value="">All</option>
            </select>

            <div style={{ position: 'relative', flex: 1, minWidth: 180 }}>
              <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }} />
              <input value={dbSearch} onChange={e => setDbSearch(e.target.value)} placeholder="Search…"
                style={{ width: '100%', paddingLeft: 30, paddingRight: 10, height: 34, border: '1.5px solid var(--card-border)', borderRadius: 7, fontSize: 13, background: 'var(--input-bg)', color: 'var(--text-1)', outline: 'none', boxSizing: 'border-box' }} />
              {dbSearch && <button onClick={() => setDbSearch('')} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', display: 'flex' }}><X size={13} /></button>}
            </div>

            <button onClick={loadDayBook} style={{ height: 34, padding: '0 14px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 7, fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
              <Filter size={13} /> Apply
            </button>
            {dbFiltered.length > 0 && (
              <button onClick={doExportDayBook} style={{ height: 34, padding: '0 14px', background: '#16a34a', color: '#fff', border: 'none', borderRadius: 7, fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                <FileSpreadsheet size={13} /> Export
              </button>
            )}
          </div>

          {/* Day Book table */}
          <div className="card" style={{ overflow: 'hidden' }}>
            {dbLoading ? (
              <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-3)' }}><Loader2 size={24} className="animate-spin" style={{ display: 'block', margin: '0 auto 8px' }} />Loading day book…</div>
            ) : dbFiltered.length === 0 ? (
              <div style={{ padding: '48px 20px', textAlign: 'center', color: 'var(--text-3)' }}>
                <FileText size={28} style={{ opacity: 0.3, display: 'block', margin: '0 auto 8px' }} />
                <p style={{ margin: 0, fontSize: 13 }}>No entries for this period</p>
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead style={{ background: 'var(--table-header-bg)' }}>
                    <tr>
                      {['Date','Entry #','Type','Narration','Ref No','Debit','Credit','Status',''].map(h => (
                        <th key={h}
                          onClick={h === 'Date' ? () => setDbDateSort(s => s === 'asc' ? 'desc' : 'asc') : undefined}
                          style={{ padding: '9px 14px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-3)', textAlign: ['Debit','Credit'].includes(h) ? 'right' : 'left', whiteSpace: 'nowrap', cursor: h === 'Date' ? 'pointer' : 'default', userSelect: 'none' }}>
                          {h === 'Date'
                            ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>Date {dbDateSort === 'asc' ? <ArrowUp size={10} /> : <ArrowDown size={10} />}</span>
                            : h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {dbSorted.map((e, i) => (
                      <>
                        <tr key={e.id}
                          style={{ background: i % 2 ? 'rgba(0,0,0,0.012)' : 'transparent', cursor: 'pointer' }}
                          onMouseEnter={ev => ev.currentTarget.style.background = 'var(--sidebar-item-hover)'}
                          onMouseLeave={ev => ev.currentTarget.style.background = i % 2 ? 'rgba(0,0,0,0.012)' : 'transparent'}
                          onClick={() => toggleLines(e)}
                        >
                          <td style={{ padding: '9px 14px', fontSize: 12, color: 'var(--text-2)', whiteSpace: 'nowrap' }}>
                            {e.entry_date ? new Date(e.entry_date + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                          </td>
                          <td style={{ padding: '9px 14px', fontSize: 12, fontWeight: 700, fontFamily: 'monospace', color: 'var(--accent)', whiteSpace: 'nowrap' }}>{e.entry_number}</td>
                          <td style={{ padding: '9px 14px' }}><VBadge type={e.voucher_type} /></td>
                          <td style={{ padding: '9px 14px', fontSize: 12, color: 'var(--text-2)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.narration || '—'}</td>
                          <td style={{ padding: '9px 14px', fontSize: 12, color: 'var(--text-3)' }}>{e.reference_no || '—'}</td>
                          <td style={{ padding: '9px 14px', fontSize: 12, fontFamily: 'monospace', textAlign: 'right', color: '#2563eb' }}>{fmtAmt(e.total_debit)}</td>
                          <td style={{ padding: '9px 14px', fontSize: 12, fontFamily: 'monospace', textAlign: 'right', color: '#16a34a' }}>{fmtAmt(e.total_credit)}</td>
                          <td style={{ padding: '9px 14px' }}>
                            <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 99, background: e.is_posted ? '#dcfce7' : '#fff7ed', color: e.is_posted ? '#16a34a' : '#c2410c' }}>
                              {e.is_posted ? 'Posted' : 'Draft'}
                            </span>
                          </td>
                          <td style={{ padding: '9px 14px', fontSize: 11, color: 'var(--text-3)' }}>
                            <ChevronDown size={13} style={{ transform: dbLines[e.id] ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
                          </td>
                        </tr>
                        {dbLines[e.id] && (
                          <tr key={e.id + '-lines'}>
                            <td colSpan={9} style={{ padding: 0 }}>
                              <table style={{ width: '100%', borderCollapse: 'collapse', background: 'var(--table-header-bg)' }}>
                                <thead>
                                  <tr>
                                    <th style={{ padding: '6px 14px 6px 32px', fontSize: 10, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', textAlign: 'left' }}>Account</th>
                                    <th style={{ padding: '6px 14px', fontSize: 10, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', textAlign: 'left' }}>Description</th>
                                    <th style={{ padding: '6px 14px', fontSize: 10, fontWeight: 700, color: '#2563eb', textTransform: 'uppercase', letterSpacing: '0.06em', textAlign: 'right' }}>Debit</th>
                                    <th style={{ padding: '6px 14px', fontSize: 10, fontWeight: 700, color: '#16a34a', textTransform: 'uppercase', letterSpacing: '0.06em', textAlign: 'right' }}>Credit</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {dbLines[e.id].map(ln => (
                                    <tr key={ln.id}>
                                      <td style={{ padding: '6px 14px 6px 32px', fontSize: 12, color: 'var(--text-1)', borderTop: '1px solid var(--card-border)' }}>
                                        <span style={{ fontSize: 10, color: 'var(--text-3)', fontFamily: 'monospace', marginRight: 6 }}>{ln.chart_of_accounts?.code}</span>
                                        {ln.chart_of_accounts?.name}
                                      </td>
                                      <td style={{ padding: '6px 14px', fontSize: 12, color: 'var(--text-3)', borderTop: '1px solid var(--card-border)' }}>{ln.description || '—'}</td>
                                      <td style={{ padding: '6px 14px', fontSize: 12, fontFamily: 'monospace', textAlign: 'right', color: '#2563eb', borderTop: '1px solid var(--card-border)' }}>{ln.debit_amount > 0 ? fmtAmt(ln.debit_amount) : ''}</td>
                                      <td style={{ padding: '6px 14px', fontSize: 12, fontFamily: 'monospace', textAlign: 'right', color: '#16a34a', borderTop: '1px solid var(--card-border)' }}>{ln.credit_amount > 0 ? fmtAmt(ln.credit_amount) : ''}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </td>
                          </tr>
                        )}
                      </>
                    ))}
                  </tbody>
                  <tfoot style={{ background: 'var(--table-header-bg)', borderTop: '2px solid var(--card-border)' }}>
                    <tr>
                      <td colSpan={5} style={{ padding: '10px 14px', fontSize: 12, fontWeight: 700, color: 'var(--text-2)' }}>
                        Total — {dbFiltered.length} {dbFiltered.length === 1 ? 'entry' : 'entries'}
                      </td>
                      <td style={{ padding: '10px 14px', fontSize: 13, fontWeight: 800, fontFamily: 'monospace', textAlign: 'right', color: '#2563eb' }}>{fmtAmt(dbTotalDebit)}</td>
                      <td style={{ padding: '10px 14px', fontSize: 13, fontWeight: 800, fontFamily: 'monospace', textAlign: 'right', color: '#16a34a' }}>{fmtAmt(dbTotalCredit)}</td>
                      <td colSpan={2} style={{ padding: '10px 14px' }}>
                        {Math.abs(dbTotalDebit - dbTotalCredit) < 0.01
                          ? <span style={{ fontSize: 11, fontWeight: 700, color: '#16a34a' }}>✓ Balanced</span>
                          : <span style={{ fontSize: 11, fontWeight: 700, color: '#c2410c' }}>Diff: {fmtAmt(Math.abs(dbTotalDebit - dbTotalCredit))}</span>
                        }
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* ══════════ ACCOUNT SUMMARY TAB ════════════════════════════ */}
      {tab === 'account-summary' && (
        <>
          {/* Controls */}
          <div className="card" style={{ padding: '12px 16px', marginBottom: 20, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            {/* FY */}
            <div style={{ position: 'relative' }}>
              <button onClick={() => setFyOpen(o => !o)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', background: 'var(--card-bg)', border: '1.5px solid var(--card-border)', borderRadius: 7, fontSize: 13, fontWeight: 600, cursor: 'pointer', color: 'var(--text-1)' }}>
                FY {fy} <ChevronDown size={13} />
              </button>
              {fyOpen && (
                <div style={{ position: 'absolute', top: '110%', left: 0, background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: 9, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', zIndex: 50, minWidth: 140 }}>
                  {FYS.map(f => (
                    <button key={f} onClick={() => { setFy(f); setFyOpen(false) }} style={{ display: 'block', width: '100%', padding: '9px 16px', fontSize: 13, textAlign: 'left', background: f === fy ? 'var(--sidebar-item-active-bg)' : 'transparent', color: f === fy ? 'var(--accent)' : 'var(--text-1)', fontWeight: f === fy ? 700 : 400, border: 'none', cursor: 'pointer' }}>FY {f}</button>
                  ))}
                </div>
              )}
            </div>
            <select value={acTypeFilter} onChange={e => setAcTypeFilter(e.target.value)} style={{ height: 34, padding: '0 10px', border: '1.5px solid var(--card-border)', borderRadius: 7, fontSize: 13, background: 'var(--input-bg)', color: 'var(--text-1)', outline: 'none' }}>
              <option value="">All Account Types</option>
              {AC_TYPES.map(t => <option key={t} value={t}>{displayAccountType(t)}</option>)}
            </select>
            <span style={{ fontSize: 12, color: 'var(--text-3)', marginLeft: 'auto' }}>
              {acFiltered.length} active accounts
            </span>
            {acFiltered.length > 0 && (
              <button onClick={doExportAccountSummary} style={{ height: 34, padding: '0 14px', background: '#16a34a', color: '#fff', border: 'none', borderRadius: 7, fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                <FileSpreadsheet size={13} /> Export
              </button>
            )}
          </div>

          {acLoading ? (
            <div className="card" style={{ padding: 48, textAlign: 'center', color: 'var(--text-3)' }}>
              <Loader2 size={24} className="animate-spin" style={{ display: 'block', margin: '0 auto 8px' }} />Loading account balances…
            </div>
          ) : acFiltered.length === 0 ? (
            <div className="card" style={{ padding: '48px 20px', textAlign: 'center', color: 'var(--text-3)' }}>
              <Scale size={28} style={{ opacity: 0.3, display: 'block', margin: '0 auto 8px' }} />
              <p style={{ margin: 0, fontSize: 13 }}>No account balances for FY {fy}</p>
              <p style={{ margin: '6px 0 0', fontSize: 12 }}>Post some journal entries to see balances here.</p>
            </div>
          ) : (
            <>
              {AC_TYPES.filter(t => !acTypeFilter || t === acTypeFilter).map(type => {
                const accounts = acByType[type] || []
                if (accounts.length === 0) return null
                const tc = TYPE_COLOR_MAP[type]
                const totalDr = accounts.reduce((s, a) => s + a.total_debit, 0)
                const totalCr = accounts.reduce((s, a) => s + a.total_credit, 0)
                return (
                  <div key={type} className="card" style={{ marginBottom: 16, overflow: 'hidden' }}>
                    <div style={{ padding: '12px 16px', background: tc.bg, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: tc.text }}>{displayAccountType(type)} Accounts</span>
                      <div style={{ display: 'flex', gap: 24, fontSize: 12, fontFamily: 'monospace' }}>
                        <span style={{ color: '#2563eb' }}>Dr: {fmtAmt(totalDr)}</span>
                        <span style={{ color: '#16a34a' }}>Cr: {fmtAmt(totalCr)}</span>
                      </div>
                    </div>
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead style={{ background: 'var(--table-header-bg)' }}>
                          <tr>
                            {['Code','Account Name','Level','Opening Balance','Total Debit','Total Credit','Net Balance',''].map(h => (
                              <th key={h} style={{ padding: '8px 14px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-3)', textAlign: ['Opening Balance','Total Debit','Total Credit','Net Balance'].includes(h) ? 'right' : 'left', whiteSpace: 'nowrap' }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {accounts.map((a, i) => {
                            const net = ['Asset','Expense'].includes(a.account_type)
                              ? a.opening + a.total_debit - a.total_credit
                              : a.opening + a.total_credit - a.total_debit
                            return (
                              <tr key={a.id}
                                style={{ background: i % 2 ? 'rgba(0,0,0,0.012)' : 'transparent', cursor: 'pointer' }}
                                onMouseEnter={ev => ev.currentTarget.style.background = 'var(--sidebar-item-hover)'}
                                onMouseLeave={ev => ev.currentTarget.style.background = i % 2 ? 'rgba(0,0,0,0.012)' : 'transparent'}
                                onClick={() => navigate(`/accounting/ledger?accountId=${a.id}`, { state: { from: 'report' } })}
                              >
                                <td style={{ padding: '9px 14px', fontSize: 11, fontFamily: 'monospace', color: 'var(--text-3)' }}>{a.code}</td>
                                <td style={{ padding: '9px 14px', fontSize: 13, color: 'var(--text-1)', fontWeight: 500 }}>
                                  {a.level > 1 && <span style={{ display: 'inline-block', width: (a.level - 1) * 16, flexShrink: 0 }} />}
                                  {a.name}
                                </td>
                                <td style={{ padding: '9px 14px', fontSize: 11, color: 'var(--text-3)' }}>L{a.level}</td>
                                <td style={{ padding: '9px 14px', fontSize: 12, fontFamily: 'monospace', textAlign: 'right', color: 'var(--text-2)' }}>{a.opening !== 0 ? fmtAmt(a.opening) : '—'}</td>
                                <td style={{ padding: '9px 14px', fontSize: 12, fontFamily: 'monospace', textAlign: 'right', color: '#2563eb' }}>{a.total_debit > 0 ? fmtAmt(a.total_debit) : '—'}</td>
                                <td style={{ padding: '9px 14px', fontSize: 12, fontFamily: 'monospace', textAlign: 'right', color: '#16a34a' }}>{a.total_credit > 0 ? fmtAmt(a.total_credit) : '—'}</td>
                                <td style={{ padding: '9px 14px', fontSize: 13, fontFamily: 'monospace', textAlign: 'right', fontWeight: 700, color: net >= 0 ? 'var(--text-1)' : '#b91c1c' }}>
                                  {fmtAmt(Math.abs(net))}{net < 0 ? ' (Cr)' : ''}
                                </td>
                                <td style={{ padding: '9px 14px', fontSize: 11, color: 'var(--accent)' }}>
                                  Ledger →
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )
              })}
            </>
          )}
        </>
      )}

      {/* ══════════ GROUP REPORT TAB ════════════════════════════════ */}
      {tab === 'group-report' && (
        <>
          {/* Controls */}
          <div className="card" style={{ padding: '12px 16px', marginBottom: 20, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ position: 'relative' }}>
              <button onClick={() => setFyOpen(o => !o)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', background: 'var(--card-bg)', border: '1.5px solid var(--card-border)', borderRadius: 7, fontSize: 13, fontWeight: 600, cursor: 'pointer', color: 'var(--text-1)' }}>
                FY {fy} <ChevronDown size={13} />
              </button>
              {fyOpen && (
                <div style={{ position: 'absolute', top: '110%', left: 0, background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: 9, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', zIndex: 50, minWidth: 140 }}>
                  {FYS.map(f => (
                    <button key={f} onClick={() => { setFy(f); setFyOpen(false) }} style={{ display: 'block', width: '100%', padding: '9px 16px', fontSize: 13, textAlign: 'left', background: f === fy ? 'var(--sidebar-item-active-bg)' : 'transparent', color: f === fy ? 'var(--accent)' : 'var(--text-1)', fontWeight: f === fy ? 700 : 400, border: 'none', cursor: 'pointer' }}>FY {f}</button>
                  ))}
                </div>
              )}
            </div>
            <button onClick={() => setGrpExpanded(new Set(grAllGroupIds))}
              style={{ padding: '6px 14px', background: 'var(--card-bg)', border: '1.5px solid var(--card-border)', borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: 'pointer', color: 'var(--text-2)' }}>
              Expand All
            </button>
            <button onClick={() => setGrpExpanded(new Set())}
              style={{ padding: '6px 14px', background: 'var(--card-bg)', border: '1.5px solid var(--card-border)', borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: 'pointer', color: 'var(--text-2)' }}>
              Collapse All
            </button>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-2)', cursor: 'pointer', marginLeft: 'auto' }}>
              <input type="checkbox" checked={grShowZero} onChange={e => setGrShowZero(e.target.checked)} />
              Show zero-balance accounts
            </label>
            {grRows.length > 0 && (
              <button onClick={doExportGroupReport} style={{ height: 34, padding: '0 14px', background: '#16a34a', color: '#fff', border: 'none', borderRadius: 7, fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                <FileSpreadsheet size={13} /> Export
              </button>
            )}
          </div>

          {acLoading ? (
            <div className="card" style={{ padding: 48, textAlign: 'center', color: 'var(--text-3)' }}>
              <Loader2 size={24} className="animate-spin" style={{ display: 'block', margin: '0 auto 8px' }} />Loading accounts…
            </div>
          ) : grRows.length === 0 ? (
            <div className="card" style={{ padding: '48px 20px', textAlign: 'center', color: 'var(--text-3)' }}>
              <Scale size={28} style={{ opacity: 0.3, display: 'block', margin: '0 auto 8px' }} />
              <p style={{ margin: 0, fontSize: 13 }}>No account balances for FY {fy}</p>
            </div>
          ) : (
            <div className="card" style={{ overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead style={{ background: 'var(--table-header-bg)' }}>
                  <tr>
                    <th style={{ padding: '9px 14px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-3)', textAlign: 'left' }}>Account / Group</th>
                    <th style={{ padding: '9px 14px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-3)', textAlign: 'right', width: 130 }}>Debit</th>
                    <th style={{ padding: '9px 14px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-3)', textAlign: 'right', width: 130 }}>Credit</th>
                    <th style={{ padding: '9px 14px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-3)', textAlign: 'right', width: 150 }}>Net Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {grRows.map((row, i) => {
                    if (row.isCashBankHeader) {
                      const isBank = row.colorKey === 'bank'
                      const hdrColor = isBank ? '#2563eb' : '#16a34a'
                      const hdrBg    = isBank ? 'rgba(37,99,235,0.07)' : 'rgba(22,163,74,0.07)'
                      return (
                        <tr key={'cbh-' + row.label} style={{ background: hdrBg }}>
                          <td colSpan={3} style={{ padding: '8px 16px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.09em', color: hdrColor }}>
                            {row.label}
                          </td>
                          <td style={{ padding: '8px 16px', textAlign: 'right', fontSize: 12, fontWeight: 700, fontFamily: 'monospace', color: hdrColor }}>
                            {fmtAmt(Math.abs(row.net))}
                          </td>
                        </tr>
                      )
                    }
                    if (row.isTypeHeader) {
                      const tc = TYPE_COLOR_MAP[row.type]
                      return (
                        <tr key={'th-' + row.type} style={{ background: tc.bg }}>
                          <td colSpan={3} style={{ padding: '9px 16px', fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: tc.text }}>
                            {displayAccountType(row.type)} Accounts
                          </td>
                          <td style={{ padding: '9px 16px', fontSize: 13, fontWeight: 800, fontFamily: 'monospace', textAlign: 'right', color: tc.text }}>
                            {fmtAmt(Math.abs(row.net))}
                          </td>
                        </tr>
                      )
                    }
                    if (row.isGroup) {
                      const expanded = grpExpanded.has(row.id)
                      return (
                        <tr key={row.id}
                          onClick={() => setGrpExpanded(prev => { const n = new Set(prev); n.has(row.id) ? n.delete(row.id) : n.add(row.id); return n })}
                          style={{ cursor: 'pointer', background: 'rgba(0,0,0,0.025)', borderTop: '1px solid var(--card-border)' }}
                          onMouseEnter={e => e.currentTarget.style.background = 'var(--sidebar-item-hover)'}
                          onMouseLeave={e => e.currentTarget.style.background = 'rgba(0,0,0,0.025)'}
                        >
                          <td style={{ padding: '9px 14px', paddingLeft: 14 + row.depth * 20 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <ChevronRight size={13} color="var(--text-3)"
                                style={{ transform: expanded ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s', flexShrink: 0 }} />
                              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)' }}>{row.name}</span>
                              {row.code && <span style={{ fontSize: 10, color: 'var(--text-3)', fontFamily: 'monospace' }}>{row.code}</span>}
                            </div>
                          </td>
                          <td style={{ padding: '9px 14px', textAlign: 'right', fontSize: 12, fontFamily: 'monospace', color: '#2563eb' }}>
                            {row.totalDr > 0 ? fmtAmt(row.totalDr) : '—'}
                          </td>
                          <td style={{ padding: '9px 14px', textAlign: 'right', fontSize: 12, fontFamily: 'monospace', color: '#16a34a' }}>
                            {row.totalCr > 0 ? fmtAmt(row.totalCr) : '—'}
                          </td>
                          <td style={{ padding: '9px 14px', textAlign: 'right', fontSize: 12, fontFamily: 'monospace', fontWeight: 700, color: 'var(--text-1)' }}>
                            {fmtAmt(Math.abs(row.net))}
                          </td>
                        </tr>
                      )
                    }
                    // Leaf account — click to open ledger
                    return (
                      <tr key={row.id}
                        onClick={() => navigate(`/accounting/ledger?accountId=${row.id}`, { state: { from: 'report' } })}
                        style={{ cursor: 'pointer', borderTop: '1px solid var(--card-border)' }}
                        onMouseEnter={e => e.currentTarget.style.background = 'var(--sidebar-item-hover)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                      >
                        <td style={{ padding: '8px 14px', paddingLeft: 14 + row.depth * 20 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: 'var(--text-3)', flexShrink: 0 }} />
                            <span style={{ fontSize: 13, color: 'var(--text-1)' }}>{row.name}</span>
                            {row.code && <span style={{ fontSize: 10, color: 'var(--text-3)', fontFamily: 'monospace' }}>{row.code}</span>}
                            <span style={{ fontSize: 10, color: 'var(--accent)', marginLeft: 'auto', fontWeight: 600 }}>Ledger →</span>
                          </div>
                        </td>
                        <td style={{ padding: '8px 14px', textAlign: 'right', fontSize: 12, fontFamily: 'monospace', color: '#2563eb' }}>
                          {row.totalDr > 0 ? fmtAmt(row.totalDr) : '—'}
                        </td>
                        <td style={{ padding: '8px 14px', textAlign: 'right', fontSize: 12, fontFamily: 'monospace', color: '#16a34a' }}>
                          {row.totalCr > 0 ? fmtAmt(row.totalCr) : '—'}
                        </td>
                        <td style={{ padding: '8px 14px', textAlign: 'right', fontSize: 12, fontFamily: 'monospace', color: 'var(--text-2)' }}>
                          {fmtAmt(Math.abs(row.net))}{row.net < 0 ? ' (Cr)' : ''}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  )
}
