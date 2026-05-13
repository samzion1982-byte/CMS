/* ═══════════════════════════════════════════════════════════════
   TrialBalancePage.jsx — Trial Balance (Indian Format)
   ═══════════════════════════════════════════════════════════════ */

import { useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useToast } from '../lib/toast'
import { getTrialBalance, getFY, fyOptions, fmtAmt, displayAccountType } from '../lib/accountingLib'
import { exportToExcel } from '../lib/exportExcel'
import { getChurch } from '../lib/supabase'
import {
  Scale, ArrowLeft, Loader2, FileSpreadsheet,
  Printer, ChevronDown, CheckCircle2, AlertTriangle,
} from 'lucide-react'

/* FY "2025-26" → "31st March 2026" */
function fyEndDate(fy) {
  const endYear = parseInt(fy.split('-')[0], 10) + 1
  return `31st March ${endYear}`
}

/* Account-type display order and colours */
const TYPE_ORDER = ['Asset', 'Liability', 'Equity', 'Income', 'Expense']
const TYPE_META  = {
  Asset:     { label: 'Assets',      hdrBg: '#eff6ff', hdrText: '#1d4ed8', bar: '#2563eb' },
  Liability: { label: 'Liabilities', hdrBg: '#fff1f2', hdrText: '#be123c', bar: '#e11d48' },
  Equity:    { label: 'Corpus / Equity', hdrBg: '#f0fdf4', hdrText: '#15803d', bar: '#16a34a' },
  Income:    { label: 'Income',      hdrBg: '#f0fdf4', hdrText: '#15803d', bar: '#16a34a' },
  Expense:   { label: 'Expenditure', hdrBg: '#fff7ed', hdrText: '#c2410c', bar: '#f97316' },
}

const TH = {
  padding: '10px 14px',
  fontSize: 11,
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.07em',
  color: 'var(--text-3)',
  background: 'var(--table-header-bg)',
  borderBottom: '2px solid var(--card-border)',
  whiteSpace: 'nowrap',
}
const TD = { padding: '8px 14px', fontSize: 13, borderBottom: '1px solid var(--card-border)' }

export default function TrialBalancePage() {
  const navigate = useNavigate()
  const toast    = useToast()

  const [fy,        setFy]        = useState(getFY())
  const [rows,      setRows]      = useState([])
  const [loading,   setLoading]   = useState(false)
  const [generated, setGenerated] = useState(false)
  const [showZero,  setShowZero]  = useState(false)
  const [fyOpen,    setFyOpen]    = useState(false)
  const [church,    setChurch]    = useState(null)
  const FYS = fyOptions()

  const generate = useCallback(async () => {
    setLoading(true)
    try {
      const [data, c] = await Promise.all([getTrialBalance(fy), getChurch()])
      setRows(data)
      setChurch(c)
      setGenerated(true)
    } catch (e) { toast(e.message, 'error') }
    setLoading(false)
  }, [fy, toast])

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
      exRows.push({ sno: '', name: `── ${displayAccountType(type).toUpperCase()} ──`, type: '', debit: '', credit: '' })
      group.forEach(r => {
        sno++
        exRows.push({ sno, name: r.name, type: displayAccountType(type), debit: r.total_debit || '', credit: r.total_credit || '' })
      })
      const sd = group.reduce((s, r) => s + r.total_debit,  0)
      const sc = group.reduce((s, r) => s + r.total_credit, 0)
      exRows.push({ sno: '', name: `Sub-Total (${displayAccountType(type)})`, type: '', debit: sd || '', credit: sc || '' })
    })
    exRows.push({ sno: '', name: 'GRAND TOTAL', type: '', debit: totalDebit, credit: totalCredit })
    exportToExcel(cols, exRows, `Trial Balance FY ${fy}`, `TrialBalance_${fy}.xlsx`)
  }

  /* ── Render ─────────────────────────────────────────────────── */
  return (
    <div className="page-container">

      {/* Page header */}
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
            <button onClick={() => navigate('/accounting')}
              style={{ padding: '6px 8px', background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: 7, cursor: 'pointer', display: 'flex', alignItems: 'center', color: 'var(--accent)' }}>
              <ArrowLeft size={15} />
            </button>
            <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--accent)', whiteSpace: 'nowrap' }}>Accounts</span>
          </div>
          <div>
            <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
              <Scale size={20} style={{ color: 'var(--accent)' }} /> Trial Balance
            </h1>
            <p className="page-subtitle">Verify total debits equal total credits — Indian format</p>
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

      {/* Controls bar */}
      <div className="card" style={{ padding: '14px 18px', marginBottom: 24, display: 'flex', gap: 14, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div style={{ position: 'relative' }}>
          <label style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-3)', display: 'block', marginBottom: 5 }}>Financial Year</label>
          <button onClick={() => setFyOpen(o => !o)}
            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 14px', height: 36, background: 'var(--input-bg)', border: '1.5px solid var(--card-border)', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', color: 'var(--text-1)' }}>
            FY {fy} <ChevronDown size={13} />
          </button>
          {fyOpen && (
            <div style={{ position: 'absolute', top: '110%', left: 0, background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: 9, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', zIndex: 50, minWidth: 140 }}>
              {FYS.map(f => (
                <button key={f} onClick={() => { setFy(f); setFyOpen(false); setGenerated(false) }}
                  style={{ display: 'block', width: '100%', padding: '9px 16px', fontSize: 13, textAlign: 'left', background: f === fy ? 'var(--sidebar-item-active-bg)' : 'transparent', color: f === fy ? 'var(--accent)' : 'var(--text-1)', fontWeight: f === fy ? 700 : 400, border: 'none', cursor: 'pointer' }}>
                  FY {f}
                </button>
              ))}
            </div>
          )}
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
          <p style={{ fontSize: 12, margin: 0 }}>Select a financial year and click Generate.</p>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="card" style={{ padding: 48, textAlign: 'center', color: 'var(--text-3)' }}>
          <Loader2 size={28} className="animate-spin" style={{ display: 'block', margin: '0 auto 10px' }} />
          Generating trial balance…
        </div>
      )}

      {/* ── Report ──────────────────────────────────────────────── */}
      {generated && !loading && (
        <>
          {/* Balance status banner */}
          <div style={{
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
                <p style={{ margin: 0, fontSize: 16, fontWeight: 800, fontFamily: 'monospace', color: '#2563eb' }}>{fmtAmt(totalDebit)}</p>
              </div>
              <div style={{ textAlign: 'right' }}>
                <p style={{ margin: 0, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: '#16a34a' }}>Total Credit</p>
                <p style={{ margin: 0, fontSize: 16, fontWeight: 800, fontFamily: 'monospace', color: '#16a34a' }}>{fmtAmt(totalCredit)}</p>
              </div>
            </div>
          </div>

          {/* ── Report card ──────────────────────────────────────── */}
          <div className="card" style={{ overflow: 'hidden' }}>

            {/* ── Indian-style report header ─────────────────────── */}
            <div style={{ padding: '22px 28px 16px', textAlign: 'center', borderBottom: '2px solid var(--card-border)', background: 'var(--card-header-bg)' }}>
              <p style={{ margin: '0 0 2px', fontSize: 18, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '1.5px', color: 'var(--text-1)' }}>
                {church?.church_name || 'Church Name'}
              </p>
              {(church?.address || church?.city) && (
                <p style={{ margin: '0 0 1px', fontSize: 12, color: 'var(--text-2)' }}>
                  {[church.address, church.city].filter(Boolean).join(', ')}
                </p>
              )}
              {church?.diocese && (
                <p style={{ margin: '0 0 10px', fontSize: 11, color: 'var(--text-3)' }}>{church.diocese}</p>
              )}
              <p style={{ margin: '0 0 2px', fontSize: 15, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '2px', color: 'var(--text-1)', borderTop: '1px solid var(--card-border)', paddingTop: 10 }}>
                Trial Balance
              </p>
              <p style={{ margin: 0, fontSize: 12, color: 'var(--text-3)', fontStyle: 'italic' }}>
                For the Financial Year {fy} &nbsp;·&nbsp; As on {fyEndDate(fy)}
              </p>
              <p style={{ margin: '6px 0 0', fontSize: 11, color: 'var(--text-3)' }}>
                (All amounts in ₹)
              </p>
            </div>

            {/* ── Table ─────────────────────────────────────────── */}
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={{ ...TH, textAlign: 'center', width: 56 }}>S.No.</th>
                    <th style={{ ...TH, textAlign: 'left' }}>Name of Account</th>
                    <th style={{ ...TH, textAlign: 'right', width: 170 }}>
                      <span style={{ color: '#2563eb' }}>Debit</span>
                      <span style={{ color: 'var(--text-3)', fontSize: 10, fontWeight: 400, marginLeft: 4 }}>(₹)</span>
                    </th>
                    <th style={{ ...TH, textAlign: 'right', width: 170 }}>
                      <span style={{ color: '#16a34a' }}>Credit</span>
                      <span style={{ color: 'var(--text-3)', fontSize: 10, fontWeight: 400, marginLeft: 4 }}>(₹)</span>
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {(() => {
                    let sno = 0
                    const sections = []

                    TYPE_ORDER.forEach(type => {
                      const group = display.filter(r => r.account_type === type)
                      if (!group.length) return
                      const meta = TYPE_META[type]
                      const subDebit  = group.reduce((s, r) => s + r.total_debit,  0)
                      const subCredit = group.reduce((s, r) => s + r.total_credit, 0)

                      /* Group header row */
                      sections.push(
                        <tr key={`hdr-${type}`}>
                          <td colSpan={4} style={{
                            padding: '9px 14px', fontSize: 11, fontWeight: 800,
                            textTransform: 'uppercase', letterSpacing: '0.1em',
                            background: meta.hdrBg, color: meta.hdrText,
                            borderBottom: '1px solid var(--card-border)',
                            borderTop: sections.length ? '2px solid var(--card-border)' : 'none',
                          }}>
                            <span style={{ display: 'inline-block', width: 3, height: 12, borderRadius: 2, background: meta.bar, marginRight: 10, verticalAlign: 'middle' }} />
                            {meta.label}
                          </td>
                        </tr>
                      )

                      /* Account rows */
                      group.forEach((r, i) => {
                        sno++
                        sections.push(
                          <tr key={r.id} style={{ background: i % 2 === 1 ? 'rgba(0,0,0,0.013)' : 'transparent' }}>
                            <td style={{ ...TD, textAlign: 'center', color: 'var(--text-3)', fontSize: 12, fontFamily: 'monospace' }}>{sno}</td>
                            <td style={{ ...TD, color: 'var(--text-1)', paddingLeft: 28 }}>{r.name}</td>
                            <td style={{ ...TD, textAlign: 'right', fontFamily: 'monospace', color: r.total_debit > 0 ? '#1d4ed8' : 'var(--text-3)', fontWeight: r.total_debit > 0 ? 600 : 400 }}>
                              {r.total_debit > 0 ? fmtAmt(r.total_debit) : '—'}
                            </td>
                            <td style={{ ...TD, textAlign: 'right', fontFamily: 'monospace', color: r.total_credit > 0 ? '#15803d' : 'var(--text-3)', fontWeight: r.total_credit > 0 ? 600 : 400 }}>
                              {r.total_credit > 0 ? fmtAmt(r.total_credit) : '—'}
                            </td>
                          </tr>
                        )
                      })

                      /* Sub-total row */
                      sections.push(
                        <tr key={`sub-${type}`} style={{ background: meta.hdrBg + '88' }}>
                          <td style={{ ...TD, borderTop: '1px solid var(--card-border)' }} />
                          <td style={{ ...TD, fontSize: 12, fontStyle: 'italic', fontWeight: 700, color: meta.hdrText, borderTop: '1px solid var(--card-border)', paddingLeft: 28 }}>
                            Sub-Total — {meta.label}
                          </td>
                          <td style={{ ...TD, textAlign: 'right', fontFamily: 'monospace', fontWeight: 700, color: '#1d4ed8', borderTop: '1px solid var(--card-border)' }}>
                            {subDebit > 0 ? fmtAmt(subDebit) : '—'}
                          </td>
                          <td style={{ ...TD, textAlign: 'right', fontFamily: 'monospace', fontWeight: 700, color: '#15803d', borderTop: '1px solid var(--card-border)' }}>
                            {subCredit > 0 ? fmtAmt(subCredit) : '—'}
                          </td>
                        </tr>
                      )
                    })

                    return sections
                  })()}
                </tbody>

                {/* Grand total */}
                <tfoot>
                  <tr style={{ background: 'var(--table-header-bg)', borderTop: '3px double var(--card-border)' }}>
                    <td style={{ padding: '13px 14px' }} />
                    <td style={{ padding: '13px 14px 13px 28px', fontSize: 14, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-1)' }}>
                      Grand Total
                    </td>
                    <td style={{ padding: '13px 14px', textAlign: 'right', fontFamily: 'monospace', fontSize: 15, fontWeight: 900, color: '#1d4ed8' }}>
                      {fmtAmt(totalDebit)}
                    </td>
                    <td style={{ padding: '13px 14px', textAlign: 'right', fontFamily: 'monospace', fontSize: 15, fontWeight: 900, color: '#15803d' }}>
                      {fmtAmt(totalCredit)}
                    </td>
                  </tr>
                  {balanced && (
                    <tr style={{ background: '#f0fdf4' }}>
                      <td colSpan={4} style={{ padding: '9px 28px', fontSize: 12, fontWeight: 700, color: '#15803d', textAlign: 'center', borderTop: '1px solid #86efac' }}>
                        ✓ &nbsp; Trial Balance Agrees &nbsp;—&nbsp; Total Debits = Total Credits = {fmtAmt(totalDebit)}
                      </td>
                    </tr>
                  )}
                </tfoot>
              </table>
            </div>

            {/* Footer note */}
            <div style={{ padding: '10px 20px', borderTop: '1px solid var(--card-border)', display: 'flex', justifyContent: 'space-between', background: 'var(--card-header-bg)' }}>
              <span style={{ fontSize: 11, color: 'var(--text-3)', fontStyle: 'italic' }}>
                Note: Amounts shown in Indian Rupee (₹). Prepared on computer.
              </span>
              <span style={{ fontSize: 11, color: 'var(--text-3)' }}>
                {display.length} account{display.length !== 1 ? 's' : ''}
              </span>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
