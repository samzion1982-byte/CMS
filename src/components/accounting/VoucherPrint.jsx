/* VoucherPrint — A5 landscape, multi-page with repeated header */
import { Printer, X } from 'lucide-react'
import { fmtAmt } from '../../lib/accountingLib'

function fmtD(iso) {
  if (!iso) return ''
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

const TYPE_COLOR = {
  Receipt: '#15803d',
  Payment: '#b91c1c',
  Contra:  '#0e7490',
  Journal: '#6d28d9',
}

// Preview dimensions (A5 landscape at ~91% scale for comfortable screen display)
const W = 720   // px
const H = 508   // px

// Conservative row limits per page (each row ≈ 22px tall)
// Last page carries header + rows + TOTAL row + signature + footer text
// Middle pages carry header + rows only
const ROWS_LAST = 4
const ROWS_MID  = 7

function paginateRows(rows) {
  const n = rows.length
  if (n <= ROWS_LAST) return [rows]

  // Greedy forward: fill each page to ROWS_MID, always keeping ≥ ROWS_LAST for the last page
  const pages = []
  let start = 0
  while (n - start > ROWS_LAST) {
    const take = Math.min(ROWS_MID, n - start - ROWS_LAST)
    pages.push(rows.slice(start, start + take))
    start += take
  }
  pages.push(rows.slice(start))  // last page (≤ ROWS_LAST)
  return pages
}

export default function VoucherPrint({
  open, onClose,
  entity, voucherType, voucherNo, date, refNo, narration, rows, totalAmount, party,
}) {
  if (!open) return null

  const color      = TYPE_COLOR[voucherType] || '#374151'
  const partyLabel = voucherType === 'Receipt' ? 'Received From' : 'Paid To'
  const pages      = paginateRows(rows || [])
  const multiPage  = pages.length > 1

  function handlePrint() {
    const el = document.getElementById('vp-paper')
    if (!el) return
    const win = window.open('', '_blank')
    win.document.write(`<!DOCTYPE html>
<html><head>
  <meta charset="UTF-8">
  <title>${voucherType} Voucher — ${voucherNo}</title>
  <style>
    @page { size: A5 landscape; margin: 0mm; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Times New Roman', Georgia, serif; background: #fff; }
    table { border-collapse: collapse; width: 100%; }
    .vp-page { width: 210mm; height: 148mm; overflow: hidden; page-break-after: always; }
    .vp-page:last-child { page-break-after: auto; }
    .vp-sig { break-inside: avoid; page-break-inside: avoid; }
  </style>
</head><body>${el.innerHTML}</body></html>`)
    win.document.close()
    setTimeout(() => { win.focus(); win.print(); win.onafterprint = () => win.close() }, 280)
  }

  // Shared header block — repeated on every page
  function PageHeader({ pageNum }) {
    return (
      <>
        {/* Entity */}
        <div style={{ textAlign: 'center', paddingBottom: 6, marginBottom: 6, borderBottom: '2.5px solid #000' }}>
          <div style={{ fontSize: 17, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '2px', marginBottom: 2 }}>
            {entity?.name || 'Church Name'}
          </div>
          {(entity?.address || entity?.city) && (
            <div style={{ fontSize: 10, color: '#444', marginBottom: 1 }}>
              {[entity.address, entity.city].filter(Boolean).join(', ')}
            </div>
          )}
          {entity?.diocese && <div style={{ fontSize: 10, color: '#666' }}>{entity.diocese}</div>}
        </div>

        {/* Voucher title + meta */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '1.5px', color, marginBottom: party ? 2 : 0 }}>
              {voucherType} Voucher{multiPage ? ` (Page ${pageNum} of ${pages.length})` : ''}
            </div>
            {party && <div style={{ fontSize: 11 }}><span style={{ fontWeight: 700 }}>{partyLabel}:</span> {party}</div>}
          </div>
          <table style={{ fontSize: 11, borderCollapse: 'collapse' }}>
            <tbody>
              <tr>
                <td style={{ padding: '1px 8px 1px 0', fontWeight: 700 }}>Voucher No.</td>
                <td style={{ padding: '1px 0', fontFamily: 'monospace', fontWeight: 800, color }}>: {voucherNo}</td>
              </tr>
              <tr>
                <td style={{ padding: '1px 8px 1px 0', fontWeight: 700 }}>Date</td>
                <td style={{ padding: '1px 0' }}>: {fmtD(date)}</td>
              </tr>
              {refNo && (
                <tr>
                  <td style={{ padding: '1px 8px 1px 0', fontWeight: 700 }}>Ref No.</td>
                  <td style={{ padding: '1px 0' }}>: {refNo}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Table header */}
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
          <thead>
            <tr style={{ borderTop: '2px solid #000', borderBottom: '1.5px solid #000' }}>
              <th style={{ padding: '4px 8px', textAlign: 'left', fontWeight: 800 }}>Particulars</th>
              <th style={{ padding: '4px 8px', textAlign: 'right', fontWeight: 800, width: 120 }}>Amount (₹)</th>
            </tr>
          </thead>
        </table>
      </>
    )
  }

  return (
    <div
      onClick={e => e.target === e.currentTarget && onClose()}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(0,0,0,0.65)',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', padding: 20, overflowY: 'auto',
      }}
    >
      <div style={{ background: '#fff', borderRadius: 14, overflow: 'hidden', boxShadow: '0 28px 72px rgba(0,0,0,0.45)', maxWidth: '98vw', marginTop: 8, marginBottom: 24 }}>

        {/* Toolbar */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '11px 18px', background: '#1e293b' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: color }} />
            <span style={{ fontSize: 13, fontWeight: 600, color: '#f1f5f9', letterSpacing: '0.02em' }}>
              {voucherType} Voucher — Print Preview &nbsp;
              <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 400 }}>
                A5 Landscape{multiPage ? ` · ${pages.length} pages` : ''}
              </span>
            </span>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={handlePrint}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 16px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
              <Printer size={13} /> Print
            </button>
            <button onClick={onClose}
              style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 12px', background: '#334155', color: '#cbd5e1', border: 'none', borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
              <X size={13} /> Close
            </button>
          </div>
        </div>

        {/* Paper pages */}
        <div id="vp-paper" style={{ padding: '20px 24px', background: '#475569', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
          {pages.map((pageRows, pageIdx) => {
            const isLast = pageIdx === pages.length - 1
            return (
              <div key={pageIdx} className="vp-page" style={{
                width: W, height: H,
                background: '#fff',
                boxShadow: '0 6px 32px rgba(0,0,0,0.35)',
                fontFamily: "'Times New Roman', Georgia, serif",
                boxSizing: 'border-box',
                overflow: 'hidden',
                flexShrink: 0,
              }}>
                {/* Double-border inset */}
                <div style={{ margin: 44, height: H - 88, border: '2px solid #000', boxSizing: 'border-box', padding: 4 }}>
                <div style={{ border: '1px solid #000', height: '100%', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', padding: '8px 14px 8px' }}>

                  <PageHeader pageNum={pageIdx + 1} />

                  {/* Rows for this page */}
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                    <tbody>
                      {pageRows.map((r, i) => (
                        <tr key={i} style={{ borderBottom: '0.5px solid #d1d5db' }}>
                          <td style={{ padding: '4px 8px' }}>{r.label}</td>
                          <td style={{ padding: '4px 8px', textAlign: 'right', fontFamily: 'monospace', fontWeight: r.bold ? 800 : 400 }}>
                            {r.amount != null ? fmtAmt(r.amount) : ''}
                          </td>
                        </tr>
                      ))}
                      {/* Pad to at least 3 rows on single-page vouchers */}
                      {!multiPage && pageRows.length < 3 && Array.from({ length: 3 - pageRows.length }).map((_, i) => (
                        <tr key={`pad-${i}`} style={{ borderBottom: '0.5px solid #e5e7eb' }}>
                          <td style={{ padding: '4px 8px' }}>&nbsp;</td><td />
                        </tr>
                      ))}
                    </tbody>
                    {/* TOTAL only on the last page */}
                    {isLast && (
                      <tfoot>
                        <tr style={{ borderTop: '2px solid #000', borderBottom: '2px solid #000', background: '#f8fafc' }}>
                          <td style={{ padding: '5px 8px', fontWeight: 900, fontSize: 12 }}>TOTAL</td>
                          <td style={{ padding: '5px 8px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 900, fontSize: 13 }}>
                            {fmtAmt(totalAmount)}
                          </td>
                        </tr>
                      </tfoot>
                    )}
                  </table>

                  {/* "Continued..." on non-last pages */}
                  {!isLast && (
                    <div style={{ marginTop: 6, fontSize: 9, color: '#6b7280', textAlign: 'right', fontStyle: 'italic' }}>
                      Continued on next page →
                    </div>
                  )}

                  {/* Narration + Signature + Footer — last page only */}
                  {isLast && (
                    <>
                      {narration && (
                        <div style={{ marginTop: 4, fontSize: 10, color: '#555', fontStyle: 'italic' }}>
                          <span style={{ fontWeight: 700, fontStyle: 'normal' }}>Narration: </span>{narration}
                        </div>
                      )}
                      <div className="vp-sig" style={{ display: 'flex', justifyContent: 'space-between', marginTop: 14 }}>
                        {['Prepared By', 'Checked By', 'Approved By'].map(role => (
                          <div key={role} style={{ width: '30%' }}>
                            <div style={{ height: 28 }} />
                            <div style={{ borderTop: '1.5px solid #000', paddingTop: 4, textAlign: 'center', fontSize: 10, fontWeight: 700, letterSpacing: '0.03em' }}>
                              {role}
                            </div>
                          </div>
                        ))}
                      </div>
                      <div style={{ textAlign: 'center', fontSize: 9, color: '#9ca3af', marginTop: 6, paddingBottom: 4 }}>
                        Computer generated — {entity?.name}
                      </div>
                    </>
                  )}

                </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
