/* ═══════════════════════════════════════════════════════════════
   LedgerPage.jsx — Account Ledger View
   ═══════════════════════════════════════════════════════════════ */

import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useToast } from '../lib/toast'
import { getLedger, getChartOfAccounts, getPostableAccountsWithPath, getFY, fyDateRange, fmtAmt, TYPE_COLOR, displayAccountType } from '../lib/accountingLib'
import { exportToExcel } from '../lib/exportExcel'
import { getChurch } from '../lib/supabase'
import { BookMarked, ArrowLeft, Loader2, FileSpreadsheet, Printer } from 'lucide-react'

export default function LedgerPage() {
  const navigate  = useNavigate()
  const toast     = useToast()

  const today = new Date().toISOString().slice(0, 10)
  const fy    = getFY()
  const { from: fyFrom, to: fyTo } = fyDateRange(fy)

  const [accounts,   setAccounts]   = useState([])
  const [accountId,  setAccountId]  = useState('')
  const [dateFrom,   setDateFrom]   = useState(fyFrom)
  const [dateTo,     setDateTo]     = useState(today)
  const [lines,      setLines]      = useState([])
  const [loading,    setLoading]    = useState(false)
  const [generated,  setGenerated]  = useState(false)
  const [church,     setChurch]     = useState(null)

  useEffect(() => {
    getChartOfAccounts(true).then(all => setAccounts(getPostableAccountsWithPath(all))).catch(() => {})
    getChurch().then(setChurch).catch(() => {})
  }, [])

  const selectedAccount = accounts.find(a => a.id === accountId)

  const generate = useCallback(async () => {
    if (!accountId) { toast('Please select an account', 'error'); return }
    setLoading(true)
    try {
      const data = await getLedger(accountId, dateFrom, dateTo)
      setLines(data)
      setGenerated(true)
    } catch (e) { toast(e.message, 'error') }
    setLoading(false)
  }, [accountId, dateFrom, dateTo, toast])

  const totalDebit  = lines.reduce((s, l) => s + l.debit,  0)
  const totalCredit = lines.reduce((s, l) => s + l.credit, 0)
  const closingBal  = lines.length > 0 ? lines[lines.length - 1].running_balance : 0

  function doExport() {
    const rows = lines.map(l => ({
      Date:        l.date,
      'Entry #':   l.entry_number,
      Type:        l.voucher_type,
      Narration:   l.narration,
      'Debit (₹)': l.debit,
      'Credit (₹)': l.credit,
      'Balance (₹)': l.running_balance,
    }))
    exportToExcel(rows, `Ledger_${selectedAccount?.name}_${dateFrom}_${dateTo}`)
  }

  function doPrint() { window.print() }

  const c = selectedAccount ? (TYPE_COLOR[selectedAccount.account_type] || { bg: '#f1f5f9', text: '#475569' }) : null

  return (
    <div className="page-container">
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={() => navigate('/accounting')} style={{ padding: '6px 8px', background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: 7, cursor: 'pointer', display: 'flex', alignItems: 'center', color: 'var(--text-2)' }}>
            <ArrowLeft size={15} />
          </button>
          <div>
            <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
              <BookMarked size={20} style={{ color: 'var(--accent)' }} /> Ledger
            </h1>
            <p className="page-subtitle">View account-wise transaction history</p>
          </div>
        </div>
        {generated && (
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={doExport} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 14px', background: '#16a34a', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
              <FileSpreadsheet size={15} /> Export
            </button>
            <button onClick={doPrint} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 14px', background: 'var(--card-bg)', border: '1.5px solid var(--card-border)', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', color: 'var(--text-1)' }}>
              <Printer size={15} /> Print
            </button>
          </div>
        )}
      </div>

      {/* Filter bar */}
      <div className="card" style={{ padding: '14px 18px', marginBottom: 24, display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div style={{ flex: 2, minWidth: 220 }}>
          <label style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-3)', display: 'block', marginBottom: 5 }}>Account *</label>
          <select value={accountId} onChange={e => setAccountId(e.target.value)}
            style={{ width: '100%', height: 36, padding: '0 10px', border: '1.5px solid var(--card-border)', borderRadius: 8, fontSize: 13, background: 'var(--input-bg)', color: 'var(--text-1)', outline: 'none' }}>
            <option value="">— Select Account —</option>
            {['Asset','Liability','Equity','Income','Expense'].map(type => (
              <optgroup key={type} label={displayAccountType(type)}>
                {accounts.filter(a => a.account_type === type).map(a => (
                  <option key={a.id} value={a.id}>{a.path}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>
        <div style={{ flex: 1, minWidth: 140 }}>
          <label style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-3)', display: 'block', marginBottom: 5 }}>From Date</label>
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
            style={{ width: '100%', height: 36, padding: '0 10px', border: '1.5px solid var(--card-border)', borderRadius: 8, fontSize: 13, background: 'var(--input-bg)', color: 'var(--text-1)', outline: 'none', boxSizing: 'border-box' }} />
        </div>
        <div style={{ flex: 1, minWidth: 140 }}>
          <label style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-3)', display: 'block', marginBottom: 5 }}>To Date</label>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
            style={{ width: '100%', height: 36, padding: '0 10px', border: '1.5px solid var(--card-border)', borderRadius: 8, fontSize: 13, background: 'var(--input-bg)', color: 'var(--text-1)', outline: 'none', boxSizing: 'border-box' }} />
        </div>
        <button onClick={generate} disabled={loading || !accountId}
          style={{ height: 36, padding: '0 20px', background: accountId ? 'var(--accent)' : '#e5e7eb', color: accountId ? '#fff' : '#9ca3af', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: accountId ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', gap: 7, alignSelf: 'flex-end' }}>
          {loading ? <Loader2 size={14} className="animate-spin" /> : null} Generate
        </button>
      </div>

      {/* Account header card */}
      {generated && selectedAccount && c && (
        <div style={{ display: 'flex', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
          <div className="card" style={{ flex: 1, padding: '16px 20px', background: c.bg + '33', borderLeft: `4px solid ${c.text}` }}>
            <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: c.text, margin: '0 0 4px', letterSpacing: '0.07em' }}>{selectedAccount.account_type} Account</p>
            <p style={{ fontSize: 18, fontWeight: 800, color: 'var(--text-1)', margin: '0 0 2px' }}>{selectedAccount.name}</p>
            <p style={{ fontSize: 12, color: 'var(--text-3)', margin: 0 }}>{selectedAccount.path}</p>
          </div>
          <div className="card" style={{ padding: '14px 20px', textAlign: 'center', minWidth: 130 }}>
            <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: '#2563eb', margin: '0 0 4px' }}>Total Debit</p>
            <p style={{ fontSize: 16, fontWeight: 800, fontFamily: 'monospace', color: '#2563eb', margin: 0 }}>{fmtAmt(totalDebit)}</p>
          </div>
          <div className="card" style={{ padding: '14px 20px', textAlign: 'center', minWidth: 130 }}>
            <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: '#16a34a', margin: '0 0 4px' }}>Total Credit</p>
            <p style={{ fontSize: 16, fontWeight: 800, fontFamily: 'monospace', color: '#16a34a', margin: 0 }}>{fmtAmt(totalCredit)}</p>
          </div>
          <div className="card" style={{ padding: '14px 20px', textAlign: 'center', minWidth: 130, background: closingBal >= 0 ? '#dcfce733' : '#fee2e233' }}>
            <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: closingBal >= 0 ? '#16a34a' : '#b91c1c', margin: '0 0 4px' }}>Closing Balance</p>
            <p style={{ fontSize: 16, fontWeight: 800, fontFamily: 'monospace', color: closingBal >= 0 ? '#16a34a' : '#b91c1c', margin: 0 }}>{fmtAmt(Math.abs(closingBal))}</p>
            <p style={{ fontSize: 10, color: 'var(--text-3)', margin: '2px 0 0' }}>{closingBal >= 0 ? 'Dr' : 'Cr'}</p>
          </div>
        </div>
      )}

      {/* Ledger table */}
      {!generated && !loading && (
        <div className="card" style={{ padding: '50px 20px', textAlign: 'center', color: 'var(--text-3)' }}>
          <BookMarked size={32} style={{ opacity: 0.25, display: 'block', margin: '0 auto 12px' }} />
          <p style={{ fontSize: 13 }}>Select an account and click Generate to view the ledger.</p>
        </div>
      )}

      {loading && (
        <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--text-3)' }}>
          <Loader2 size={24} className="animate-spin" style={{ display: 'block', margin: '0 auto 8px' }} /> Loading ledger…
        </div>
      )}

      {generated && !loading && (
        <div className="card" style={{ overflow: 'hidden' }}>
          {/* Print header */}
          <div className="print-only" style={{ padding: '20px', textAlign: 'center', borderBottom: '2px solid #000' }}>
            <p style={{ fontSize: 16, fontWeight: 800, margin: '0 0 4px' }}>{church?.church_name}</p>
            <p style={{ fontSize: 12, margin: '0 0 12px' }}>Account Ledger — {selectedAccount?.path}</p>
            <p style={{ fontSize: 11, margin: 0 }}>Period: {dateFrom} to {dateTo}</p>
          </div>

          {lines.length === 0 ? (
            <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-3)' }}>
              <BookMarked size={28} style={{ opacity: 0.25, display: 'block', margin: '0 auto 10px' }} />
              <p style={{ fontSize: 13, margin: 0 }}>No posted transactions for this account in the selected period.</p>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead style={{ background: 'var(--table-header-bg)' }}>
                  <tr>
                    {['Date','Entry #','Type','Narration','Debit (₹)','Credit (₹)','Balance (₹)'].map(h => (
                      <th key={h} style={{ padding: '9px 14px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-3)', textAlign: ['Debit (₹)','Credit (₹)','Balance (₹)'].includes(h) ? 'right' : 'left', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l, i) => (
                    <tr key={i} style={{ background: i % 2 ? 'rgba(0,0,0,0.012)' : 'transparent' }}>
                      <td style={{ padding: '9px 14px', fontSize: 12, color: 'var(--text-2)', whiteSpace: 'nowrap' }}>
                        {new Date(l.date + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </td>
                      <td style={{ padding: '9px 14px', fontSize: 12, fontWeight: 700, fontFamily: 'monospace', color: 'var(--accent)', whiteSpace: 'nowrap' }}>{l.entry_number}</td>
                      <td style={{ padding: '9px 14px' }}>
                        <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 99, background: '#f1f5f9', color: '#475569' }}>{l.voucher_type}</span>
                      </td>
                      <td style={{ padding: '9px 14px', fontSize: 12, color: 'var(--text-2)', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.narration || '—'}</td>
                      <td style={{ padding: '9px 14px', fontSize: 12, fontFamily: 'monospace', textAlign: 'right', color: l.debit > 0 ? '#2563eb' : 'var(--text-3)' }}>{l.debit > 0 ? fmtAmt(l.debit) : '—'}</td>
                      <td style={{ padding: '9px 14px', fontSize: 12, fontFamily: 'monospace', textAlign: 'right', color: l.credit > 0 ? '#16a34a' : 'var(--text-3)' }}>{l.credit > 0 ? fmtAmt(l.credit) : '—'}</td>
                      <td style={{ padding: '9px 14px', fontSize: 12, fontFamily: 'monospace', fontWeight: 700, textAlign: 'right', color: l.running_balance >= 0 ? '#2563eb' : '#b91c1c' }}>
                        {fmtAmt(Math.abs(l.running_balance))} <span style={{ fontSize: 10 }}>{l.running_balance >= 0 ? 'Dr' : 'Cr'}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot style={{ background: 'var(--table-header-bg)', borderTop: '2px solid var(--card-border)' }}>
                  <tr>
                    <td colSpan={4} style={{ padding: '10px 14px', fontSize: 12, fontWeight: 700, color: 'var(--text-2)' }}>TOTAL ({lines.length} transactions)</td>
                    <td style={{ padding: '10px 14px', fontSize: 13, fontWeight: 800, fontFamily: 'monospace', textAlign: 'right', color: '#2563eb' }}>{fmtAmt(totalDebit)}</td>
                    <td style={{ padding: '10px 14px', fontSize: 13, fontWeight: 800, fontFamily: 'monospace', textAlign: 'right', color: '#16a34a' }}>{fmtAmt(totalCredit)}</td>
                    <td style={{ padding: '10px 14px', fontSize: 13, fontWeight: 800, fontFamily: 'monospace', textAlign: 'right', color: closingBal >= 0 ? '#2563eb' : '#b91c1c' }}>
                      {fmtAmt(Math.abs(closingBal))} <span style={{ fontSize: 11 }}>{closingBal >= 0 ? 'Dr' : 'Cr'}</span>
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
