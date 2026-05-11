/* ═══════════════════════════════════════════════════════════════
   SimpleTransactionsPage.jsx — Full transaction list with filters
   ═══════════════════════════════════════════════════════════════ */

import { useState, useEffect, useCallback } from 'react'
import { TrendingUp, TrendingDown, ArrowLeftRight, Pencil, Trash2, Plus, RefreshCw, Search, X, ArrowLeft, Copy, ChevronUp, ChevronDown, FileSpreadsheet, Loader2 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import { useToast } from '../lib/toast'
import {
  getSimpleTransactions, deleteSimpleTransaction,
  getSimpleCategories, getSimpleAccounts, getSimpleSettings,
  fmtAmt, fmtDate, todayISO, txnLabel,
} from '../lib/simpleAccountsLib'
import { exportToExcel } from '../lib/exportExcel'
import SimpleAddTransactionModal from '../components/simple-accounts/SimpleAddTransactionModal'

function TypeBadge({ txn }) {
  const c = txnLabel(txn)
  return (
    <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: c.bg, color: c.color, whiteSpace: 'nowrap' }}>
      {c.label}
    </span>
  )
}

const inputStyle = {
  height: 36, padding: '0 10px', border: '1.5px solid var(--card-border)',
  borderRadius: 7, fontSize: 13, background: 'var(--input-bg)', color: 'var(--text-1)', outline: 'none',
}

function SortIcon({ col, sortCol, sortDir }) {
  if (sortCol !== col) return <ChevronDown size={11} style={{ opacity: 0.3, marginLeft: 3 }} />
  return sortDir === 'asc'
    ? <ChevronUp   size={11} style={{ marginLeft: 3, color: 'var(--accent)' }} />
    : <ChevronDown size={11} style={{ marginLeft: 3, color: 'var(--accent)' }} />
}

export default function SimpleTransactionsPage() {
  const { profile } = useAuth()
  const toast    = useToast()
  const navigate = useNavigate()

  const [txns,        setTxns]        = useState([])
  const [categories,  setCategories]  = useState([])
  const [accounts,    setAccounts]    = useState([])
  const [currency,    setCurrency]    = useState('₹')
  const [dateFormat,  setDateFormat]  = useState('DD-MM-YYYY')
  const [numberFormat,setNumberFormat]= useState('indian')
  const [loading,     setLoading]     = useState(true)
  const [deleteId,   setDeleteId]   = useState(null)
  const [modal,      setModal]      = useState(null)   // null | 'add-income' | 'add-expense' | 'add-transfer' | txn (edit)
  const [cloneModal, setCloneModal] = useState(null)   // txn object to clone
  const [search,     setSearch]     = useState('')
  const [sortCol,    setSortCol]    = useState('date')
  const [sortDir,    setSortDir]    = useState('desc')
  const [exporting,  setExporting]  = useState(false)

  // Filters
  const [filterType,     setFilterType]     = useState('')
  const [filterCategory, setFilterCategory] = useState('')
  const [filterAccount,  setFilterAccount]  = useState('')
  const [filterFrom,     setFilterFrom]     = useState('')
  const [filterTo,       setFilterTo]       = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [settings, cats, accts] = await Promise.all([getSimpleSettings(), getSimpleCategories(), getSimpleAccounts()])
      setCurrency(settings.currency)
      setDateFormat(settings.dateFormat    || 'DD-MM-YYYY')
      setNumberFormat(settings.numberFormat || 'indian')
      setCategories(cats)
      setAccounts(accts)

      const data = await getSimpleTransactions({
        from:       filterFrom || undefined,
        to:         filterTo   || undefined,
        type:       filterType || undefined,
        categoryId: filterCategory || undefined,
        accountId:  filterAccount  || undefined,
      })
      setTxns(data)
    } catch (e) {
      toast('Failed to load transactions: ' + e.message, 'error')
    }
    setLoading(false)
  }, [filterFrom, filterTo, filterType, filterCategory, filterAccount, toast])

  useEffect(() => { load() }, [load])

  async function handleDelete(id) {
    try {
      await deleteSimpleTransaction(id, profile?.email)
      toast('Transaction deleted', 'success')
      setDeleteId(null)
      load()
    } catch (e) {
      toast('Failed to delete: ' + e.message, 'error')
    }
  }

  function clearFilters() {
    setFilterType(''); setFilterCategory(''); setFilterAccount('')
    setFilterFrom(''); setFilterTo(''); setSearch('')
  }

  function toggleSort(col) {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortCol(col); setSortDir(col === 'date' ? 'desc' : 'desc') }
  }

  const hasFilters = filterType || filterCategory || filterAccount || filterFrom || filterTo || search

  const filtered = txns.filter(t => {
    if (!search) return true
    const q = search.toLowerCase()
    return (
      t.description?.toLowerCase().includes(q) ||
      t.category?.name?.toLowerCase().includes(q) ||
      t.account?.name?.toLowerCase().includes(q) ||
      t.reference_no?.toLowerCase().includes(q)
    )
  })

  const visible = [...filtered].sort((a, b) => {
    let cmp = 0
    if (sortCol === 'date')   cmp = a.txn_date.localeCompare(b.txn_date)
    if (sortCol === 'amount') cmp = Number(a.amount) - Number(b.amount)
    return sortDir === 'asc' ? cmp : -cmp
  })

  const totalIncome  = visible.filter(t => t.txn_type === 'income') .reduce((s, t) => s + Number(t.amount), 0)
  const totalExpense = visible.filter(t => t.txn_type === 'expense').reduce((s, t) => s + Number(t.amount), 0)

  async function handleExport() {
    if (!visible.length) { toast('No transactions to export', 'error'); return }
    setExporting(true)
    try {
      const locale = numberFormat === 'international' ? 'en-US' : 'en-IN'
      const fmtNum = n => currency + Number(n).toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      const columns = [
        { header: 'Date',        key: 'date',     align: 'left'  },
        { header: 'Type',        key: 'type',     align: 'left'  },
        { header: 'Description', key: 'desc',     align: 'left'  },
        { header: 'Category',    key: 'category', align: 'left'  },
        { header: 'Account',     key: 'account',  align: 'left'  },
        { header: 'Ref No.',     key: 'ref',      align: 'left'  },
        { header: `Amount (${currency})`, key: 'amount', align: 'right' },
      ]
      const rows = visible.map(t => {
        const lbl       = txnLabel(t)
        const acctLabel = t.txn_type === 'transfer'
          ? `${t.account?.name || '?'} → ${t.to_account?.name || '?'}`
          : (t.account?.name || '')
        const signed = lbl.sign === '+' ? Number(t.amount) : lbl.sign === '−' ? -Number(t.amount) : Number(t.amount)
        return {
          date:     fmtDate(t.txn_date, dateFormat),
          type:     lbl.label,
          desc:     t.description || '',
          category: t.category?.name || '',
          account:  acctLabel,
          ref:      t.ref_no || t.reference_no || '',
          amount:   fmtNum(signed),
        }
      })
      const netTotal = visible.reduce((s, t) => {
        const lbl = txnLabel(t)
        if (lbl.sign === '+') return s + Number(t.amount)
        if (lbl.sign === '−') return s - Number(t.amount)
        return s
      }, 0)
      rows.push({ date: '', type: '', desc: '', category: '', account: '', ref: 'NET TOTAL', amount: fmtNum(netTotal) })
      await exportToExcel(columns, rows, 'Transactions', `transactions-${todayISO().replace(/-/g,'')}.xlsx`)
      toast(`Exported ${visible.length} transactions`, 'success')
    } catch (e) {
      toast('Export failed: ' + e.message, 'error')
    }
    setExporting(false)
  }

  return (
    <div className="page-container simple-accounts-scope">
      {/* Header */}
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={() => navigate('/simple-accounts')} title="Back to Money Book"
            style={{ display: 'flex', alignItems: 'center', padding: '7px 10px', background: 'var(--card-bg)', border: '1.5px solid var(--card-border)', borderRadius: 8, cursor: 'pointer', color: 'var(--text-2)', flexShrink: 0 }}>
            <ArrowLeft size={16} />
          </button>
          <div>
            <h1 className="page-title">All Transactions</h1>
            <p className="page-subtitle">Complete record of all income and expenses</p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={handleExport} disabled={exporting} className="action-btn"
            style={{ background: '#16a34a', opacity: exporting ? 0.6 : 1 }}>
            {exporting ? <Loader2 size={13} style={{ animation: 'spin .7s linear infinite' }} /> : <FileSpreadsheet size={13} />}
            {exporting ? 'Exporting…' : 'Excel Export'}
          </button>
          <button onClick={load} title="Refresh" style={{ padding: '8px 10px', background: 'var(--card-bg)', border: '1.5px solid var(--card-border)', borderRadius: 8, cursor: 'pointer', display: 'flex', alignItems: 'center', color: 'var(--text-2)' }}>
            <RefreshCw size={15} />
          </button>
          <button onClick={() => setModal('add-expense')} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 14px', background: '#dc2626', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
            <TrendingDown size={14} /> Money Out
          </button>
          <button onClick={() => setModal('add-income')} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 14px', background: '#16a34a', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
            <Plus size={14} /> Money In
          </button>
        </div>
      </div>

      {/* Filter bar */}
      <div className="card" style={{ padding: '12px 16px', marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>

          {/* Search */}
          <div style={{ position: 'relative', flex: '1 1 180px', minWidth: 160 }}>
            <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)', pointerEvents: 'none' }} />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search…"
              style={{ ...inputStyle, width: '100%', paddingLeft: 30, boxSizing: 'border-box' }} />
          </div>

          <select value={filterType} onChange={e => setFilterType(e.target.value)} style={{ ...inputStyle, minWidth: 130 }}>
            <option value="">All Types</option>
            <option value="income">Money In</option>
            <option value="expense">Money Out</option>
            <option value="transfer">Transfer</option>
          </select>

          <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)} style={{ ...inputStyle, minWidth: 150 }}>
            <option value="">All Categories</option>
            {categories.map(c => <option key={c.id} value={c.id}>{c.name} ({c.type === 'income' ? 'In' : 'Out'})</option>)}
          </select>

          <select value={filterAccount} onChange={e => setFilterAccount(e.target.value)} style={{ ...inputStyle, minWidth: 130 }}>
            <option value="">All Accounts</option>
            {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input type="date" value={filterFrom} onChange={e => setFilterFrom(e.target.value)} style={inputStyle} title="From date" />
            <span style={{ fontSize: 12, color: 'var(--text-3)' }}>to</span>
            <input type="date" value={filterTo} onChange={e => setFilterTo(e.target.value)} style={inputStyle} title="To date" />
          </div>

          {hasFilters && (
            <button onClick={clearFilters} title="Clear filters"
              style={{ height: 36, padding: '0 10px', background: 'none', border: '1.5px solid var(--card-border)', borderRadius: 7, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, color: 'var(--text-3)', fontSize: 12 }}>
              <X size={13} /> Clear
            </button>
          )}
        </div>
      </div>

      {/* Summary strip */}
      {visible.length > 0 && (
        <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
          {[
            { label: `${visible.length} transactions`, color: 'var(--text-2)', bg: 'var(--card-bg)' },
            { label: `Income: ${fmtAmt(totalIncome, currency, numberFormat)}`, color: '#16a34a', bg: '#dcfce7' },
            { label: `Expenses: ${fmtAmt(totalExpense, currency, numberFormat)}`, color: '#dc2626', bg: '#fee2e2' },
            { label: `Balance: ${fmtAmt(totalIncome - totalExpense, currency, numberFormat)}`, color: totalIncome >= totalExpense ? '#2563eb' : '#dc2626', bg: '#f3e8ff' },
          ].map(({ label, color, bg }) => (
            <span key={label} style={{ fontSize: 12, fontWeight: 700, padding: '5px 12px', borderRadius: 99, background: bg, color, border: '1px solid var(--card-border)' }}>{label}</span>
          ))}
        </div>
      )}

      {/* Table */}
      <div className="card" style={{ overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 20 }}>
            {[1,2,3,4,5,6].map(i => <div key={i} className="loading-skeleton" style={{ height: 44, borderRadius: 6, marginBottom: 8 }} />)}
          </div>
        ) : visible.length === 0 ? (
          <div style={{ padding: '56px 20px', textAlign: 'center', color: 'var(--text-3)' }}>
            <TrendingUp size={32} style={{ opacity: 0.2, marginBottom: 12 }} />
            <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-2)', margin: '0 0 4px' }}>
              {hasFilters ? 'No transactions match your filters' : 'No transactions yet'}
            </p>
            {!hasFilters && (
              <button onClick={() => setModal('add-income')} style={{ marginTop: 16, padding: '8px 20px', background: '#16a34a', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                Add first transaction
              </button>
            )}
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--table-header-bg)' }}>
                  <th onClick={() => toggleSort('date')}
                    style={{ padding: '9px 14px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-3)', textAlign: 'left', whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none' }}>
                    Date <SortIcon col="date" sortCol={sortCol} sortDir={sortDir} />
                  </th>
                  {['Type', 'Description', 'Category', 'Account'].map(h => (
                    <th key={h} style={{ padding: '9px 14px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-3)', textAlign: 'left', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                  <th onClick={() => toggleSort('amount')}
                    style={{ padding: '9px 14px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-3)', textAlign: 'right', whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none' }}>
                    Amount <SortIcon col="amount" sortCol={sortCol} sortDir={sortDir} />
                  </th>
                  <th style={{ padding: '9px 14px' }} />
                </tr>
              </thead>
              <tbody>
                {visible.map((t, i) => {
                  const lbl = txnLabel(t)
                  const acctLabel = t.txn_type === 'transfer'
                    ? `${t.account?.name || '?'} → ${t.to_account?.name || '?'}`
                    : (t.account?.name || '—')
                  return (
                    <tr key={t.id}
                      style={{ background: i % 2 ? 'rgba(0,0,0,0.012)' : 'transparent', borderBottom: '1px solid var(--card-border)' }}>
                      <td style={{ padding: '10px 14px', fontSize: 12, color: 'var(--text-3)', whiteSpace: 'nowrap' }}>{fmtDate(t.txn_date, dateFormat)}</td>
                      <td style={{ padding: '10px 14px' }}><TypeBadge txn={t} /></td>
                      <td style={{ padding: '10px 14px', fontSize: 13, color: 'var(--text-1)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {t.description || '—'}
                        {t.reference_no && <span style={{ fontSize: 10, color: 'var(--text-3)', marginLeft: 6 }}>#{t.reference_no}</span>}
                      </td>
                      <td style={{ padding: '10px 14px', fontSize: 12, color: 'var(--text-2)' }}>{t.category?.name || '—'}</td>
                      <td style={{ padding: '10px 14px', fontSize: 12, color: 'var(--text-2)', whiteSpace: 'nowrap' }}>{acctLabel}</td>
                      <td style={{ padding: '10px 14px', fontSize: 14, fontWeight: 700, color: lbl.color, textAlign: 'right', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
                        {lbl.sign}{fmtAmt(t.amount, currency, numberFormat)}
                      </td>
                      <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'flex', gap: 4 }}>
                          <button onClick={() => setModal(t)} title="Edit"
                            style={{ padding: '5px 7px', background: 'none', border: '1px solid var(--card-border)', borderRadius: 6, cursor: 'pointer', color: 'var(--text-3)', display: 'flex' }}>
                            <Pencil size={12} />
                          </button>
                          <button onClick={() => setCloneModal(t)} title="Clone / Duplicate"
                            style={{ padding: '5px 7px', background: 'none', border: '1px solid var(--card-border)', borderRadius: 6, cursor: 'pointer', color: 'var(--text-3)', display: 'flex' }}>
                            <Copy size={12} />
                          </button>
                          <button onClick={() => setDeleteId(t.id)} title="Delete"
                            style={{ padding: '5px 7px', background: 'none', border: '1px solid var(--card-border)', borderRadius: 6, cursor: 'pointer', color: '#dc2626', display: 'flex' }}>
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add/Edit modal */}
      {modal && typeof modal === 'string' && (
        <SimpleAddTransactionModal
          initialType={modal.replace('add-', '')}
          currency={currency}
          onClose={() => setModal(null)}
          onSaved={load}
        />
      )}
      {modal && typeof modal === 'object' && (
        <SimpleAddTransactionModal
          editTxn={modal}
          currency={currency}
          onClose={() => setModal(null)}
          onSaved={load}
        />
      )}

      {/* Clone modal */}
      {cloneModal && (
        <SimpleAddTransactionModal
          cloneTxn={cloneModal}
          currency={currency}
          onClose={() => setCloneModal(null)}
          onSaved={load}
        />
      )}

      {/* Delete confirm */}
      {deleteId && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'var(--card-bg)', borderRadius: 14, padding: '28px 32px', maxWidth: 360, width: '90%', boxShadow: '0 16px 48px rgba(0,0,0,0.25)', textAlign: 'center' }}>
            <div style={{ width: 48, height: 48, borderRadius: '50%', background: '#fee2e2', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              <Trash2 size={22} color="#dc2626" />
            </div>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-1)', margin: '0 0 8px' }}>Delete Transaction?</h3>
            <p style={{ fontSize: 13, color: 'var(--text-3)', margin: '0 0 24px', lineHeight: 1.5 }}>
              This will remove the transaction from all reports. The entry is hidden, not permanently deleted.
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setDeleteId(null)} style={{ flex: 1, height: 40, background: 'var(--card-bg)', border: '1.5px solid var(--card-border)', borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: 'pointer', color: 'var(--text-2)' }}>Cancel</button>
              <button onClick={() => handleDelete(deleteId)} style={{ flex: 1, height: 40, background: '#dc2626', color: '#fff', border: 'none', borderRadius: 9, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
