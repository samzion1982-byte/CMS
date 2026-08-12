/* ═══════════════════════════════════════════════════════════════
   TrialBalancePage.jsx — Trial Balance (Indian Format)
   ═══════════════════════════════════════════════════════════════ */

import { useState, useCallback, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useToast } from '../lib/toast'
import { getTrialBalance, fyDateRange, fmtAmt, displayAccountType } from '../lib/accountingLib'
import { exportToExcelWithTitle } from '../lib/exportExcel'
import { useEntity } from '../lib/EntityContext'
import { useEntityFY } from '../lib/useEntityFY'
import {
  Scale, ArrowLeft, Loader2, FileSpreadsheet,
  Printer, ChevronDown, CheckCircle2, AlertTriangle, ExternalLink,
} from 'lucide-react'

/* FY "2025-26" → "31st March 2026" */
function fyEndDate(fy) {
  const endYear = parseInt(fy.split('-')[0], 10) + 1
  return `31st March ${endYear}`
}

function fmtDateDisplay(iso) {
  if (!iso) return ''
  const [y, m, d] = iso.split('-')
  return `${d}-${m}-${y}`
}

const TYPE_ORDER = ['Asset', 'Liability', 'Equity', 'Income', 'Expense']
const TYPE_META  = {
  Asset:     { label: 'Assets',          hdrBg: '#dbeafe', hdrText: '#1e40af', bar: '#2563eb', subtBg: '#eff6ff' },
  Liability: { label: 'Liabilities',     hdrBg: '#fee2e2', hdrText: '#991b1b', bar: '#dc2626', subtBg: '#fff1f2' },
  Equity:    { label: 'Corpus / Equity', hdrBg: '#dcfce7', hdrText: '#166534', bar: '#16a34a', subtBg: '#f0fdf4' },
  Income:    { label: 'Income',          hdrBg: '#dcfce7', hdrText: '#166534', bar: '#16a34a', subtBg: '#f0fdf4' },
  Expense:   { label: 'Expenditure',     hdrBg: '#ffedd5', hdrText: '#9a3412', bar: '#ea580c', subtBg: '#fff7ed' },
}

export default function TrialBalancePage() {
  const navigate = useNavigate()
  const toast    = useToast()
  const { currentEntityId, currentEntity } = useEntity()

  const { fy, setFy, fyOpen, setFyOpen, FYS } = useEntityFY()

  const [dateFrom,  setDateFrom]  = useState(() => fyDateRange(fy).from)
  const [dateTo,    setDateTo]    = useState(() => fyDateRange(fy).to)
  const [rows,      setRows]      = useState([])
  const [loading,   setLoading]   = useState(false)
  const [generated, setGenerated] = useState(false)
  const [showZero,  setShowZero]  = useState(false)

  // Sync date range when FY changes (entity switch or manual picker)
  useEffect(() => {
    const { from, to } = fyDateRange(fy)
    setDateFrom(from)
    setDateTo(to)
    setGenerated(false)
  }, [fy])

  const didMount = useRef(false)
  useEffect(() => {
    if (!didMount.current) { didMount.current = true; generate() }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function handleFyChange(f) {
    setFy(f)
    setFyOpen(false)
  }

  const generate = useCallback(async () => {
    setLoading(true)
    try {
      const data = await getTrialBalance(fy, currentEntityId, dateFrom, dateTo)
      setRows(data)
      setGenerated(true)
    } catch (e) { toast(e.message, 'error') }
    setLoading(false)
  }, [fy, dateFrom, dateTo, currentEntityId, toast])

  const display     = showZero ? rows : rows.filter(r => r.total_debit > 0 || r.total_credit > 0)
  const totalDebit  = display.reduce((s, r) => s + r.total_debit,  0)
  const totalCredit = display.reduce((s, r) => s + r.total_credit, 0)
  const balanced    = Math.abs(totalDebit - totalCredit) < 0.01

  function doExport() {
    const cols = [
      { header: 'S.No.',        key: 'sno',    align: 'center' },
      { header: 'Account Name', key: 'name',   align: 'left'   },
      { header: 'Type',         key: 'type',   align: 'left'   },
      { header: 'Debit (₹)',    key: 'debit',  align: 'right'  },
      { header: 'Credit (₹)',   key: 'credit', align: 'right'  },
    ]
    let sno = 0
    const exRows = []
    TYPE_ORDER.forEach(type => {
      const group = display.filter(r => r.account_type === type)
      if (!group.length) return
      exRows.push({ sno: '', name: `── ${TYPE_META[type].label.toUpperCase()} ──`, type: '', debit: '', credit: '', _bold: false })
      group.forEach(r => {
        sno++
        exRows.push({ sno, name: r.name, type: displayAccountType(type), debit: r.total_debit || '', credit: r.total_credit || '' })
      })
      const sd = group.reduce((s, r) => s + r.total_debit,  0)
      const sc = group.reduce((s, r) => s + r.total_credit, 0)
      exRows.push({ sno: '', name: `Sub-Total — ${TYPE_META[type].label}`, type: '', debit: sd || '', credit: sc || '', _bold: true })
    })
    exRows.push({ sno: '', name: 'GRAND TOTAL', type: '', debit: totalDebit, credit: totalCredit, _bold: true })

    const titleLines = [
      currentEntity?.name ? { text: currentEntity.name, bold: true, size: 14, bg: 'DBEAFE' } : null,
      (currentEntity?.address || currentEntity?.city) ? { text: [currentEntity.address, currentEntity.city].filter(Boolean).join(', '), size: 11 } : null,
      currentEntity?.diocese ? { text: currentEntity.diocese, size: 10, italic: true } : null,
      currentEntity?.description ? { text: currentEntity.description, size: 10, italic: true } : null,
      { text: 'TRIAL BALANCE', bold: true, size: 13, bg: '1E3A5F', color: 'FFFFFF' },
      { text: `From: ${fmtDateDisplay(dateFrom)}  To: ${fmtDateDisplay(dateTo)}  (FY ${fy})`, size: 10 },
      { text: 'All amounts in Indian Rupees (₹)', size: 9, italic: true },
    ].filter(Boolean)

    exportToExcelWithTitle(cols, exRows, `Trial Balance FY ${fy}`, `TrialBalance_${fy}.xlsx`, titleLines)
  }

  /* ── Render ─────────────────────────────────────────────────── */
  return (
    <div className="page-container">

      {/* Page header — hidden when printing */}
      <div className="page-header no-print">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
            <button onClick={() => navigate('/accounting')}
              style={{ padding: '6px 8px', background: 'var(--accent)', border: 'none', borderRadius: 7, cursor: 'pointer', display: 'flex', alignItems: 'center', color: '#fff' }}>
              <ArrowLeft size={15} />
            </button>
            <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--accent)', whiteSpace: 'nowrap' }}>Accounts</span>
          </div>
          <div>
            <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
              <Scale size={20} style={{ color: 'var(--accent)' }} /> Trial Balance
            </h1>
            <p className="page-subtitle">Verify total debits equal total credits</p>
          </div>
        </div>
        {generated && (
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={doExport}
              style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 14px', background: '#16a34a', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
              <FileSpreadsheet size={15} /> Export
            </button>
            <button onClick={() => window.print()}
              style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 14px', background: 'var(--card-bg)', border: '1.5px solid var(--card-border)', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', color: 'var(--text-1)' }}>
              <Printer size={15} /> Print
            </button>
          </div>
        )}
      </div>

      {/* Controls — hidden when printing */}
      <div className="card no-print" style={{ padding: '14px 18px', marginBottom: 24, display: 'flex', gap: 14, alignItems: 'flex-end', flexWrap: 'wrap' }}>

        {/* FY selector */}
        <div style={{ position: 'relative' }}>
          <label style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-3)', display: 'block', marginBottom: 5 }}>Financial Year</label>
          <button onClick={() => setFyOpen(o => !o)}
            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 14px', height: 36, background: 'var(--input-bg)', border: '1.5px solid var(--card-border)', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', color: 'var(--text-1)' }}>
            FY {fy} <ChevronDown size={13} />
          </button>
          {fyOpen && (
            <div style={{ position: 'absolute', top: '110%', left: 0, background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: 9, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', zIndex: 50, minWidth: 140 }}>
              {FYS.map(f => (
                <button key={f} onClick={() => handleFyChange(f)}
                  style={{ display: 'block', width: '100%', padding: '9px 16px', fontSize: 13, textAlign: 'left', background: f === fy ? 'var(--sidebar-item-active-bg)' : 'transparent', color: f === fy ? 'var(--accent)' : 'var(--text-1)', fontWeight: f === fy ? 700 : 400, border: 'none', cursor: 'pointer' }}>
                  FY {f}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* From date */}
        <div>
          <label style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-3)', display: 'block', marginBottom: 5 }}>From Date</label>
          <input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setGenerated(false) }}
            style={{ height: 36, padding: '0 10px', border: '1.5px solid var(--card-border)', borderRadius: 8, fontSize: 13, background: 'var(--input-bg)', color: 'var(--text-1)', outline: 'none' }} />
        </div>

        {/* To date */}
        <div>
          <label style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-3)', display: 'block', marginBottom: 5 }}>To Date</label>
          <input type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setGenerated(false) }}
            style={{ height: 36, padding: '0 10px', border: '1.5px solid var(--card-border)', borderRadius: 8, fontSize: 13, background: 'var(--input-bg)', color: 'var(--text-1)', outline: 'none' }} />
        </div>

        <button onClick={generate} disabled={loading}
          style={{ height: 36, padding: '0 22px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 7 }}>
          {loading ? <Loader2 size={14} className="animate-spin" /> : null} Generate
        </button>

        {generated && (
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer', color: 'var(--text-2)', marginLeft: 8 }}>
            <input type="checkbox" checked={showZero} onChange={e => setShowZero(e.target.checked)} style={{ width: 15, height: 15 }} />
            Show zero-balance accounts
          </label>
        )}
      </div>

      {/* Empty state */}
      {!generated && !loading && (
        <div className="card" style={{ padding: '60px 20px', textAlign: 'center', color: 'var(--text-3)' }}>
          <Scale size={36} style={{ opacity: 0.2, display: 'block', margin: '0 auto 14px' }} />
          <p style={{ fontSize: 14, margin: '0 0 4px', fontWeight: 600 }}>No report generated yet</p>
          <p style={{ fontSize: 12, margin: 0 }}>Select a financial year and date range, then click Generate.</p>
        </div>
      )}

      {loading && (
        <div className="card" style={{ padding: 48, textAlign: 'center', color: 'var(--text-3)' }}>
          <Loader2 size={28} className="animate-spin" style={{ display: 'block', margin: '0 auto 10px' }} />
          Generating trial balance…
        </div>
      )}

      {/* ── Report ──────────────────────────────────────────────── */}
      {generated && !loading && (
        <>
          {/* Balance status banner — hidden when printing */}
          <div className="no-print" style={{
            display: 'flex', alignItems: 'center', gap: 12,
            padding: '14px 20px', marginBottom: 20, borderRadius: 10,
            background: balanced ? '#f0fdf4' : '#fff1f2',
            border: `1.5px solid ${balanced ? '#86efac' : '#fca5a5'}`,
          }}>
            {balanced
              ? <CheckCircle2 size={20} color="#16a34a" style={{ flexShrink: 0 }} />
              : <AlertTriangle size={20} color="#dc2626" style={{ flexShrink: 0 }} />
            }
            <div style={{ flex: 1 }}>
              <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: balanced ? '#15803d' : '#b91c1c' }}>
                {balanced ? 'Trial Balance Agrees' : 'Trial Balance Disagrees'}
              </p>
              <p style={{ margin: 0, fontSize: 12, color: 'var(--text-2)' }}>
                {balanced
                  ? `Total Debits = Total Credits = ${fmtAmt(totalDebit)}`
                  : `Difference of ${fmtAmt(Math.abs(totalDebit - totalCredit))} — check for unposted entries`}
              </p>
            </div>
            <div style={{ display: 'flex', gap: 24, flexShrink: 0 }}>
              <div style={{ textAlign: 'right' }}>
                <p style={{ margin: 0, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: '#2563eb' }}>Total Debit</p>
                <p style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#2563eb' }}>{fmtAmt(totalDebit)}</p>
              </div>
              <div style={{ textAlign: 'right' }}>
                <p style={{ margin: 0, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: '#16a34a' }}>Total Credit</p>
                <p style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#16a34a' }}>{fmtAmt(totalCredit)}</p>
              </div>
            </div>
          </div>

          {/* ── Report card ─────────────────────────────────────── */}
          <div id="tb-print-area" className="card" style={{ overflow: 'visible' }}>

            {/* Indian-style report header */}
            <div style={{ padding: '20px 28px 14px', textAlign: 'center', borderBottom: '2px solid #d1d5db', background: '#f9fafb' }}>
              <p style={{ margin: '0 0 2px', fontSize: 17, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '1.5px', color: '#111827' }}>
                {currentEntity?.name || 'Entity Name'}
              </p>
              {(currentEntity?.address || currentEntity?.city) && (
                <p style={{ margin: '0 0 1px', fontSize: 12, color: '#4b5563' }}>
                  {[currentEntity.address, currentEntity.city].filter(Boolean).join(', ')}
                </p>
              )}
              {currentEntity?.diocese && (
                <p style={{ margin: '0 0 4px', fontSize: 11, color: '#6b7280' }}>{currentEntity.diocese}</p>
              )}
              {currentEntity?.description && (
                <p style={{ margin: '0 0 6px', fontSize: 11, color: '#6b7280', fontStyle: 'italic' }}>{currentEntity.description}</p>
              )}
              <div style={{ borderTop: '1px solid #d1d5db', marginTop: 8, paddingTop: 10 }}>
                <p style={{ margin: '0 0 2px', fontSize: 14, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '2px', color: '#111827' }}>
                  Trial Balance
                </p>
                <p style={{ margin: '0 0 3px', fontSize: 12, color: '#4b5563' }}>
                  {fmtDateDisplay(dateFrom)} to {fmtDateDisplay(dateTo)}
                  &nbsp;·&nbsp; FY {fy} &nbsp;·&nbsp; As on {fyEndDate(fy)}
                </p>
                <p style={{ margin: 0, fontSize: 11, color: '#6b7280', fontStyle: 'italic' }}>
                  (All amounts in Indian Rupees — ₹)
                </p>
              </div>
            </div>

            {/* ── Table ─────────────────────────────────────────── */}
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#1e293b' }}>
                  <th style={{ padding: '11px 14px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#f1f5f9', textAlign: 'center', width: 60, borderRight: '1px solid #334155' }}>S.No.</th>
                  <th style={{ padding: '11px 18px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#f1f5f9', textAlign: 'left', borderRight: '1px solid #334155' }}>Name of Account</th>
                  <th style={{ padding: '11px 18px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#93c5fd', textAlign: 'right', width: 180, borderRight: '1px solid #334155' }}>Debit (₹)</th>
                  <th style={{ padding: '11px 18px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#86efac', textAlign: 'right', width: 180 }}>Credit (₹)</th>
                </tr>
              </thead>

              <tbody>
                {(() => {
                  let sno = 0
                  const sections = []
                  let isFirst = true

                  TYPE_ORDER.forEach(type => {
                    const group = display.filter(r => r.account_type === type)
                    if (!group.length) return
                    const meta      = TYPE_META[type]
                    const subDebit  = group.reduce((s, r) => s + r.total_debit,  0)
                    const subCredit = group.reduce((s, r) => s + r.total_credit, 0)

                    sections.push(
                      <tr key={`hdr-${type}`} style={{ background: meta.hdrBg, borderTop: isFirst ? 'none' : '2px solid #d1d5db' }}>
                        <td colSpan={4} style={{ padding: '9px 18px', fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.12em', color: meta.hdrText }}>
                          <span style={{ display: 'inline-block', width: 4, height: 14, borderRadius: 2, background: meta.bar, marginRight: 10, verticalAlign: 'middle' }} />
                          {meta.label}
                        </td>
                      </tr>
                    )
                    isFirst = false

                    group.forEach((r, i) => {
                      sno++
                      sections.push(
                        <tr key={r.id} style={{ background: i % 2 === 0 ? '#ffffff' : '#f8fafc', borderBottom: '1px solid #e5e7eb' }}>
                          <td style={{ padding: '9px 14px', textAlign: 'center', color: '#6b7280', fontSize: 12, borderRight: '1px solid #e5e7eb' }}>{sno}</td>
                          <td
                            style={{ padding: '9px 18px', color: '#111827', fontSize: 13, borderRight: '1px solid #e5e7eb', cursor: 'pointer', textDecoration: 'underline dotted', textUnderlineOffset: 3 }}
                            onClick={() => navigate(`/accounting/ledger?accountId=${r.id}&from=${dateFrom}&to=${dateTo}`, { state: { from: 'report' } })}
                            title="View Ledger"
                          >
                            {r.name}
                            <ExternalLink size={10} style={{ marginLeft: 4, opacity: 0.45, verticalAlign: 'middle' }} />
                          </td>
                          <td style={{ padding: '9px 18px', textAlign: 'right', fontSize: 13, color: r.total_debit > 0 ? '#1d4ed8' : '#9ca3af', fontWeight: r.total_debit > 0 ? 600 : 400, borderRight: '1px solid #e5e7eb' }}>
                            {r.total_debit > 0 ? fmtAmt(r.total_debit) : '—'}
                          </td>
                          <td style={{ padding: '9px 18px', textAlign: 'right', fontSize: 13, color: r.total_credit > 0 ? '#15803d' : '#9ca3af', fontWeight: r.total_credit > 0 ? 600 : 400 }}>
                            {r.total_credit > 0 ? fmtAmt(r.total_credit) : '—'}
                          </td>
                        </tr>
                      )
                    })

                    sections.push(
                      <tr key={`sub-${type}`} style={{ background: meta.subtBg, borderTop: '1px solid #d1d5db', borderBottom: '1px solid #d1d5db' }}>
                        <td style={{ padding: '8px 14px', borderRight: '1px solid #d1d5db' }} />
                        <td style={{ padding: '8px 18px', fontSize: 12, fontStyle: 'italic', fontWeight: 700, color: meta.hdrText, borderRight: '1px solid #d1d5db' }}>
                          Sub-Total — {meta.label}
                        </td>
                        <td style={{ padding: '8px 18px', textAlign: 'right', fontWeight: 700, color: '#1d4ed8', fontSize: 13, borderRight: '1px solid #d1d5db' }}>
                          {subDebit > 0 ? fmtAmt(subDebit) : '—'}
                        </td>
                        <td style={{ padding: '8px 18px', textAlign: 'right', fontWeight: 700, color: '#15803d', fontSize: 13 }}>
                          {subCredit > 0 ? fmtAmt(subCredit) : '—'}
                        </td>
                      </tr>
                    )
                  })

                  return sections
                })()}
              </tbody>

              <tfoot>
                <tr style={{ background: '#1e293b', borderTop: '3px double #6b7280' }}>
                  <td style={{ padding: '13px 14px', borderRight: '1px solid #334155' }} />
                  <td style={{ padding: '13px 18px', fontSize: 14, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#f1f5f9', borderRight: '1px solid #334155' }}>Grand Total</td>
                  <td style={{ padding: '13px 18px', textAlign: 'right', fontSize: 15, fontWeight: 900, color: '#93c5fd', borderRight: '1px solid #334155' }}>{fmtAmt(totalDebit)}</td>
                  <td style={{ padding: '13px 18px', textAlign: 'right', fontSize: 15, fontWeight: 900, color: '#86efac' }}>{fmtAmt(totalCredit)}</td>
                </tr>
                {balanced ? (
                  <tr style={{ background: '#f0fdf4' }}>
                    <td colSpan={4} style={{ padding: '9px 28px', fontSize: 12, fontWeight: 700, color: '#15803d', textAlign: 'center', borderTop: '1px solid #86efac' }}>
                      ✓ &nbsp; Trial Balance Agrees &nbsp;—&nbsp; Total Debits = Total Credits = {fmtAmt(totalDebit)}
                    </td>
                  </tr>
                ) : (
                  <tr style={{ background: '#fff1f2' }}>
                    <td colSpan={4} style={{ padding: '9px 28px', fontSize: 12, fontWeight: 700, color: '#b91c1c', textAlign: 'center', borderTop: '1px solid #fca5a5' }}>
                      ✗ &nbsp; Trial Balance Disagrees &nbsp;—&nbsp; Difference of {fmtAmt(Math.abs(totalDebit - totalCredit))}
                    </td>
                  </tr>
                )}
              </tfoot>
            </table>

            <div style={{ padding: '10px 20px', borderTop: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', background: '#f9fafb' }}>
              <span style={{ fontSize: 11, color: '#6b7280', fontStyle: 'italic' }}>
                Note: Amounts shown in Indian Rupee (₹). Prepared on computer.
              </span>
              <span style={{ fontSize: 11, color: '#6b7280' }}>
                {display.length} account{display.length !== 1 ? 's' : ''}
              </span>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
