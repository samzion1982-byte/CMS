/* VoucherPrint — A5 landscape modal preview */
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

// A5 landscape at ~96dpi = 794 × 559px; we render at 720 × 508 (90% scale)
const W = 720
const H = 508

export default function VoucherPrint({
  open, onClose,
  church, voucherType, voucherNo, date, refNo, narration, rows, totalAmount, party,
}) {
  if (!open) return null

  const color = TYPE_COLOR[voucherType] || '#374151'

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
  </style>
</head><body>${el.innerHTML}</body></html>`)
    win.document.close()
    setTimeout(() => { win.focus(); win.print(); win.onafterprint = () => win.close() }, 280)
  }

  const partyLabel = voucherType === 'Receipt' ? 'Received From' : 'Paid To'

  return (
    <div
      onClick={e => e.target === e.currentTarget && onClose()}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(0,0,0,0.65)',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        padding: 20,
      }}
    >
      <div style={{ background: '#fff', borderRadius: 14, overflow: 'hidden', boxShadow: '0 28px 72px rgba(0,0,0,0.45)', maxWidth: '98vw' }}>

        {/* ── Toolbar ─────────────────────────────────────── */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '11px 18px', background: '#1e293b' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: color }} />
            <span style={{ fontSize: 13, fontWeight: 600, color: '#f1f5f9', letterSpacing: '0.02em' }}>
              {voucherType} Voucher — Print Preview &nbsp;
              <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 400 }}>A5 Landscape</span>
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

        {/* ── Paper preview area ───────────────────────────── */}
        <div style={{ padding: '20px 24px', background: '#475569', display: 'flex', justifyContent: 'center' }}>
          {/* The actual voucher — this div is cloned into the print window */}
          <div id="vp-paper" style={{
            width: W, height: H,
            background: '#fff',
            boxShadow: '0 6px 32px rgba(0,0,0,0.35)',
            fontFamily: "'Times New Roman', Georgia, serif",
            overflow: 'hidden',
            boxSizing: 'border-box',
          }}>
            {/* 0.5-inch inset wrapper — double-line border, 48px from every edge */}
            <div style={{
              margin: 48,
              height: H - 96,
              border: '2px solid #000',
              boxSizing: 'border-box',
              padding: 5,
            }}>
            <div style={{
              border: '1px solid #000',
              height: '100%',
              boxSizing: 'border-box',
              display: 'flex',
              flexDirection: 'column',
              padding: '10px 16px 8px',
              overflow: 'hidden',
            }}>

            {/* ── Church header ─────────────────────────────── */}
            <div style={{ textAlign: 'center', paddingBottom: 8, marginBottom: 8, borderBottom: `2.5px solid #000` }}>
              <div style={{ fontSize: 17, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '2px', margin: '0 0 2px' }}>
                {church?.church_name || 'Church Name'}
              </div>
              {(church?.address || church?.city) && (
                <div style={{ fontSize: 10, color: '#444', margin: '0 0 1px' }}>
                  {[church.address, church.city].filter(Boolean).join(', ')}
                </div>
              )}
              {church?.diocese && (
                <div style={{ fontSize: 10, color: '#666' }}>{church.diocese}</div>
              )}
            </div>

            {/* ── Voucher title row ────────────────────────── */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '1.5px', color, marginBottom: party ? 3 : 0 }}>
                  {voucherType} Voucher
                </div>
                {party && (
                  <div style={{ fontSize: 11 }}>
                    <span style={{ fontWeight: 700 }}>{partyLabel}:</span> {party}
                  </div>
                )}
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

            {/* ── Particulars table ────────────────────────── */}
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
              <thead>
                <tr style={{ borderTop: '2px solid #000', borderBottom: '1.5px solid #000' }}>
                  <th style={{ padding: '5px 8px', textAlign: 'left', fontWeight: 800, fontSize: 11 }}>Particulars</th>
                  <th style={{ padding: '5px 8px', textAlign: 'right', fontWeight: 800, fontSize: 11, width: 120 }}>Amount (₹)</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} style={{ borderBottom: '0.5px solid #d1d5db' }}>
                    <td style={{ padding: '5px 8px', fontStyle: r.bold ? 'normal' : 'normal' }}>{r.label}</td>
                    <td style={{ padding: '5px 8px', textAlign: 'right', fontFamily: 'monospace', fontWeight: r.bold ? 800 : 400 }}>
                      {r.amount != null ? fmtAmt(r.amount) : ''}
                    </td>
                  </tr>
                ))}
                {/* Pad empty rows to keep table height consistent */}
                {rows.length < 3 && Array.from({ length: 3 - rows.length }).map((_, i) => (
                  <tr key={`pad-${i}`} style={{ borderBottom: '0.5px solid #e5e7eb' }}>
                    <td style={{ padding: '5px 8px' }}>&nbsp;</td>
                    <td style={{ padding: '5px 8px' }} />
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ borderTop: '2px solid #000', borderBottom: '2px solid #000', background: '#f8fafc' }}>
                  <td style={{ padding: '6px 8px', fontWeight: 900, fontSize: 12 }}>TOTAL</td>
                  <td style={{ padding: '6px 8px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 900, fontSize: 13 }}>
                    {fmtAmt(totalAmount)}
                  </td>
                </tr>
              </tfoot>
            </table>

            {/* ── Narration ────────────────────────────────── */}
            <div style={{ marginTop: 6, minHeight: 16 }}>
              {narration && (
                <div style={{ fontSize: 10, color: '#555', fontStyle: 'italic' }}>
                  <span style={{ fontWeight: 700, fontStyle: 'normal' }}>Narration: </span>{narration}
                </div>
              )}
            </div>

            {/* spacer — pushes signature to bottom */}
            <div style={{ flex: 1 }} />

            {/* ── Signature block ──────────────────────────── */}
            <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 10 }}>
              {['Prepared By', 'Checked By', 'Approved By'].map(role => (
                <div key={role} style={{ width: '30%', display: 'flex', flexDirection: 'column' }}>
                  {/* Signing space */}
                  <div style={{ height: 48 }} />
                  {/* Signature line + label */}
                  <div style={{ borderTop: '1.5px solid #000', paddingTop: 5, textAlign: 'center', fontSize: 10, fontWeight: 700, letterSpacing: '0.03em' }}>
                    {role}
                  </div>
                </div>
              ))}
            </div>

            {/* ── Footer ──────────────────────────────────── */}
            <div style={{ marginTop: 6, textAlign: 'center', fontSize: 9, color: '#9ca3af' }}>
              Computer generated — {church?.church_name}
            </div>

            </div>{/* end inner border */}
            </div>{/* end outer border / inset wrapper */}
          </div>
        </div>
      </div>
    </div>
  )
}
