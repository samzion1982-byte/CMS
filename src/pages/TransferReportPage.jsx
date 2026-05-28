import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useToast } from '../lib/toast'
import {
  ArrowRightLeft, Loader2, RefreshCw, CheckCircle2, Clock, ChevronDown,
  TrendingUp, Wallet, Hash, AlertCircle, FileSpreadsheet,
} from 'lucide-react'

// ── helpers ──────────────────────────────────────────────────────────────

function getFY(dateStr) {
  const d = dateStr ? new Date(dateStr + 'T00:00:00') : new Date()
  const m = d.getMonth() + 1; const y = d.getFullYear()
  return m >= 4 ? `${y}-${String(y + 1).slice(2)}` : `${y - 1}-${String(y).slice(2)}`
}

function fyLabel(fy) {
  const [s, e] = fy.split('-')
  return `FY ${s}-${e}`
}

const fmtAmt = n =>
  Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })

const fmtDate = d =>
  d ? new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

const fmtDateTime = ts =>
  ts ? new Date(ts).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'

// ── styles ───────────────────────────────────────────────────────────────

const TH = {
  padding: '9px 12px', fontSize: 11, fontWeight: 700,
  color: 'var(--text-3)', textTransform: 'uppercase',
  letterSpacing: '0.06em', whiteSpace: 'nowrap', textAlign: 'left',
}
const TH_R = { ...TH, textAlign: 'right' }
const TH_M = { ...TH, textAlign: 'center' }
const TD = { padding: '10px 12px', fontSize: 13, color: 'var(--text-1)', borderTop: '1px solid var(--card-border)' }
const TD_R = { ...TD, textAlign: 'right' }
const TD_M = { ...TD, textAlign: 'center' }

// ── main ─────────────────────────────────────────────────────────────────

export default function TransferReportPage() {
  const toast = useToast()

  const [fy,     setFy]     = useState(getFY)
  const [fyOpen, setFyOpen] = useState(false)
  const [FYS,    setFYS]    = useState([])
  const [loading,   setLoading]   = useState(true)
  const [exporting, setExporting] = useState(false)

  // data
  const [stats,    setStats]    = useState(null)   // aggregated stats
  const [batches,  setBatches]  = useState([])     // transfer batches
  const [pending,  setPending]  = useState([])     // pending receipts (lightweight)

  // ── load FY options from receipts ──────────────────────────────────
  useEffect(() => {
    supabase.from('receipts').select('financial_year').then(({ data }) => {
      const uniq = [...new Set((data || []).map(r => r.financial_year).filter(Boolean))].sort().reverse()
      setFYS(uniq.length ? uniq : [getFY()])
    })
  }, [])

  // ── load report data ───────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [receiptRes, batchRes] = await Promise.all([
        supabase
          .from('receipts')
          .select('id, transfer_batch_id, payment_mode, grand_total, receipt_number, receipt_date')
          .eq('financial_year', fy),
        supabase
          .from('receipt_transfer_batches')
          .select('*')
          .eq('financial_year', fy)
          .order('transferred_at', { ascending: false }),
      ])

      if (receiptRes.error) throw receiptRes.error
      if (batchRes.error)   throw batchRes.error

      const receipts = receiptRes.data || []
      const batchList = batchRes.data || []

      // compute stats
      let totalCount = receipts.length
      let xfCount = 0, pendCount = 0
      let xfCash = 0, xfBank = 0, pendCash = 0, pendBank = 0

      const pendingList = []
      for (const r of receipts) {
        const amt  = Number(r.grand_total || 0)
        const isCash = r.payment_mode === 'Cash'
        if (r.transfer_batch_id) {
          xfCount++
          if (isCash) xfCash += amt; else xfBank += amt
        } else {
          pendCount++
          if (isCash) pendCash += amt; else pendBank += amt
          pendingList.push(r)
        }
      }

      // group pending by month
      const byMonth = {}
      for (const r of pendingList) {
        if (!r.receipt_date) continue
        const key = r.receipt_date.slice(0, 7) // YYYY-MM
        if (!byMonth[key]) byMonth[key] = { month: key, count: 0, cash: 0, bank: 0, minNo: r.receipt_number, maxNo: r.receipt_number }
        const g = byMonth[key]
        g.count++
        if (r.payment_mode === 'Cash') g.cash += Number(r.grand_total || 0)
        else g.bank += Number(r.grand_total || 0)
        if (r.receipt_number < g.minNo) g.minNo = r.receipt_number
        if (r.receipt_number > g.maxNo) g.maxNo = r.receipt_number
      }
      const monthGroups = Object.values(byMonth).sort((a, b) => a.month.localeCompare(b.month))

      setStats({
        totalCount, xfCount, pendCount,
        xfTotal: xfCash + xfBank, xfCash, xfBank,
        pendTotal: pendCash + pendBank, pendCash, pendBank,
        activeBatches: batchList.filter(b => !b.is_reversed).length,
      })
      setBatches(batchList)
      setPending(monthGroups)
    } catch (e) {
      toast(e.message, 'error')
    }
    setLoading(false)
  }, [fy, toast])

  useEffect(() => { load() }, [load])

  // ── FY selector close on outside click ────────────────────────────
  useEffect(() => {
    if (!fyOpen) return
    const h = () => setFyOpen(false)
    window.addEventListener('click', h)
    return () => window.removeEventListener('click', h)
  }, [fyOpen])

  const pct = stats ? (stats.totalCount ? Math.round(stats.xfCount / stats.totalCount * 100) : 0) : 0

  const exportExcel = async () => {
    if (!stats) return
    setExporting(true)
    try {
      const ExcelJS = (await import('https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js')).default || window.ExcelJS
      const wb = new ExcelJS.Workbook()
      wb.creator = 'Church CMS'; wb.created = new Date()

      const thin = { style: 'thin', color: { argb: 'FFBBBBBB' } }
      const border = { top: thin, left: thin, bottom: thin, right: thin }

      const styleHeader = (cell, fgColor) => {
        cell.font      = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10, name: 'Calibri' }
        cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: fgColor } }
        cell.border    = border
        cell.alignment = { vertical: 'middle' }
      }
      const styleData = (cell, align = 'center', alt = false, bold = false) => {
        cell.font      = { size: 10, name: 'Calibri', bold }
        cell.border    = border
        cell.alignment = { horizontal: align, vertical: 'middle' }
        if (alt) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F4FA' } }
      }
      const styleFooter = (cell, align = 'center') => {
        cell.font      = { bold: true, size: 10, name: 'Calibri' }
        cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } }
        cell.border    = border
        cell.alignment = { horizontal: align, vertical: 'middle' }
      }

      // ── Sheet 1: Transfer Batches ─────────────────────────────────
      const ws1 = wb.addWorksheet('Transfer Batches', { views: [{ state: 'frozen', ySplit: 3 }] })
      ws1.columns = [
        { width: 5 }, { width: 14 }, { width: 14 }, { width: 14 }, { width: 14 },
        { width: 10 }, { width: 15 }, { width: 15 }, { width: 15 },
        { width: 22 }, { width: 20 }, { width: 11 },
      ]

      // Title row
      ws1.mergeCells('A1:L1')
      const t1 = ws1.getCell('A1')
      t1.value = `Transfer Report — ${fyLabel(fy)}`
      t1.font  = { bold: true, size: 14, color: { argb: 'FFFFFFFF' }, name: 'Calibri' }
      t1.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } }
      t1.alignment = { horizontal: 'center', vertical: 'middle' }
      ws1.getRow(1).height = 28

      // Summary row
      ws1.mergeCells('A2:L2')
      const s1 = ws1.getCell('A2')
      s1.value = `Total: ${stats.totalCount} receipts  |  Transferred: ${stats.xfCount} (${pct}%)  ₹${fmtAmt(stats.xfTotal)}  |  Pending: ${stats.pendCount}  ₹${fmtAmt(stats.pendTotal)}  |  Active batches: ${stats.activeBatches}`
      s1.font  = { size: 10, italic: true, color: { argb: 'FF475569' }, name: 'Calibri' }
      s1.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F4FA' } }
      s1.alignment = { horizontal: 'center', vertical: 'middle' }
      ws1.getRow(2).height = 16

      // Header row
      const hdr1 = ['#', 'Date From', 'Date To', 'Receipt From', 'Receipt To', 'Receipts', 'Cash (₹)', 'Bank (₹)', 'Total (₹)', 'Transferred By', 'Transferred On', 'Status']
      const hRow1 = ws1.getRow(3)
      hdr1.forEach((h, i) => {
        const cell = hRow1.getCell(i + 1)
        cell.value = h
        styleHeader(cell, 'FF334155')
        cell.alignment = { horizontal: i >= 5 && i <= 8 ? 'right' : 'center', vertical: 'middle' }
      })
      hRow1.height = 20

      // Data rows
      batches.forEach((b, idx) => {
        const total = Number(b.cash_total || 0) + Number(b.bank_total || 0)
        const row = ws1.addRow([
          batches.length - idx,
          fmtDate(b.from_date), fmtDate(b.to_date),
          b.from_receipt_no || '—', b.to_receipt_no || '—',
          b.receipt_count || 0,
          Number(b.cash_total || 0), Number(b.bank_total || 0), total,
          b.transferred_by || '—',
          b.transferred_at ? fmtDateTime(b.transferred_at) : '—',
          b.is_reversed ? 'Reversed' : 'Active',
        ])
        row.height = 15
        const alt = idx % 2 === 1
        const rev = b.is_reversed
        const fgRev = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF1F2' } }
        row.eachCell({ includeEmpty: true }, (cell, col) => {
          const right = col >= 6 && col <= 9
          styleData(cell, right ? 'right' : 'center', alt)
          if (rev) cell.fill = fgRev
          if (col === 9) cell.font = { ...cell.font, bold: true }
          if (col === 12) {
            cell.font = { size: 10, bold: true, name: 'Calibri', color: { argb: rev ? 'FFDC2626' : 'FF16A34A' } }
          }
        })
      })

      // Footer
      const active = batches.filter(b => !b.is_reversed)
      const fRow1 = ws1.addRow([
        'Total (Active Batches)', '', '', '', '',
        active.reduce((s, b) => s + (b.receipt_count || 0), 0),
        active.reduce((s, b) => s + Number(b.cash_total || 0), 0),
        active.reduce((s, b) => s + Number(b.bank_total || 0), 0),
        active.reduce((s, b) => s + Number(b.cash_total || 0) + Number(b.bank_total || 0), 0),
        '', '', '',
      ])
      fRow1.height = 16
      fRow1.eachCell({ includeEmpty: true }, (cell, col) => {
        styleFooter(cell, col >= 6 && col <= 9 ? 'right' : 'center')
      })

      // ── Sheet 2: Pending Receipts ─────────────────────────────────
      if (pending.length > 0) {
        const ws2 = wb.addWorksheet('Pending Receipts', { views: [{ state: 'frozen', ySplit: 3 }] })
        ws2.columns = [
          { width: 20 }, { width: 22 }, { width: 10 },
          { width: 15 }, { width: 18 }, { width: 15 },
        ]

        ws2.mergeCells('A1:F1')
        const t2 = ws2.getCell('A1')
        t2.value = `Pending Receipts — ${fyLabel(fy)}`
        t2.font  = { bold: true, size: 14, color: { argb: 'FFFFFFFF' }, name: 'Calibri' }
        t2.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD97706' } }
        t2.alignment = { horizontal: 'center', vertical: 'middle' }
        ws2.getRow(1).height = 28

        ws2.mergeCells('A2:F2')
        const s2 = ws2.getCell('A2')
        s2.value = `${stats.pendCount} receipts pending  |  Cash ₹${fmtAmt(stats.pendCash)}  |  Bank ₹${fmtAmt(stats.pendBank)}  |  Total ₹${fmtAmt(stats.pendTotal)}`
        s2.font  = { size: 10, italic: true, color: { argb: 'FF92400E' }, name: 'Calibri' }
        s2.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF3C7' } }
        s2.alignment = { horizontal: 'center', vertical: 'middle' }
        ws2.getRow(2).height = 16

        const hdr2 = ['Month', 'Receipt Range', 'Count', 'Cash (₹)', 'Bank / Cheque (₹)', 'Total (₹)']
        const hRow2 = ws2.getRow(3)
        hdr2.forEach((h, i) => {
          const cell = hRow2.getCell(i + 1)
          cell.value = h
          styleHeader(cell, 'FFB45309')
          cell.alignment = { horizontal: i >= 2 ? 'right' : 'left', vertical: 'middle' }
        })
        hRow2.height = 20

        pending.forEach((g, idx) => {
          const [y, m] = g.month.split('-')
          const label = new Date(Number(y), Number(m) - 1).toLocaleString('en-IN', { month: 'long', year: 'numeric' })
          const range = g.minNo === g.maxNo ? String(g.minNo) : `${g.minNo} → ${g.maxNo}`
          const row = ws2.addRow([label, range, g.count, g.cash, g.bank, g.cash + g.bank])
          row.height = 15
          const alt = idx % 2 === 1
          row.eachCell({ includeEmpty: true }, (cell, col) => {
            styleData(cell, col >= 3 ? 'right' : 'left', alt, col === 6)
            if (alt) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF9F0' } }
          })
        })

        const fRow2 = ws2.addRow(['Total Pending', '', stats.pendCount, stats.pendCash, stats.pendBank, stats.pendTotal])
        fRow2.height = 16
        fRow2.eachCell({ includeEmpty: true }, (cell, col) => {
          styleFooter(cell, col >= 3 ? 'right' : 'left')
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF3C7' } }
          cell.font = { bold: true, size: 10, name: 'Calibri', color: { argb: 'FF92400E' } }
        })
      }

      // Download
      const buffer = await wb.xlsx.writeBuffer()
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `transfer_report_${fy}_${new Date().toISOString().slice(0, 10)}.xlsx`
      a.click()
      URL.revokeObjectURL(url)
      toast(`Exported successfully.`, 'success')
    } catch (e) {
      toast('Export failed: ' + e.message, 'error')
    }
    setExporting(false)
  }

  return (
    <div className="page-container">
      {/* ── header ── */}
      <div className="page-header">
        <div>
          <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <ArrowRightLeft size={20} style={{ color: 'var(--accent)' }} />
            Transfer Report
          </h1>
          <p className="page-subtitle">Receipt transfer statistics and batch history</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {/* FY selector */}
          <div style={{ position: 'relative' }} onClick={e => e.stopPropagation()}>
            <button
              onClick={() => setFyOpen(p => !p)}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px', background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}
            >
              {fyLabel(fy)} <ChevronDown size={14} />
            </button>
            {fyOpen && (
              <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: 4, background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,.12)', zIndex: 50, minWidth: 140 }}>
                {FYS.map(f => (
                  <div key={f} onClick={() => { setFy(f); setFyOpen(false) }}
                    style={{ padding: '9px 14px', fontSize: 13, cursor: 'pointer', fontWeight: f === fy ? 700 : 400, background: f === fy ? 'var(--accent-soft)' : 'transparent', color: f === fy ? 'var(--accent)' : 'var(--text-1)' }}>
                    {fyLabel(f)}
                  </div>
                ))}
              </div>
            )}
          </div>
          <button onClick={exportExcel} disabled={exporting || loading || !stats}
            style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 12px', background: '#16a34a', border: 'none', borderRadius: 8, cursor: exporting || loading || !stats ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 600, color: '#fff', opacity: exporting || loading || !stats ? 0.6 : 1 }}>
            {exporting ? <Loader2 size={14} style={{ animation: 'spin .7s linear infinite' }} /> : <FileSpreadsheet size={14} />}
            {exporting ? 'Exporting…' : 'Excel Export'}
          </button>
          <button onClick={load} disabled={loading}
            style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 12px', background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: 8, cursor: 'pointer', fontSize: 13, color: 'var(--text-2)' }}>
            <RefreshCw size={14} style={loading ? { animation: 'spin .7s linear infinite' } : {}} />
            Refresh
          </button>
        </div>
      </div>

      {loading && !stats ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
          <Loader2 size={28} style={{ animation: 'spin .7s linear infinite', color: 'var(--accent)' }} />
        </div>
      ) : stats ? (
        <>
          {/* ── summary cards ── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 14, marginBottom: 24 }}>
            <StatCard icon={<Hash size={16} />} label="Total Receipts" value={stats.totalCount} sub={fyLabel(fy)} color="#6366f1" />
            <StatCard icon={<CheckCircle2 size={16} />} label="Transferred" value={stats.xfCount} sub={`${pct}% of total`} color="#16a34a" />
            <StatCard icon={<Clock size={16} />} label="Pending Transfer" value={stats.pendCount} sub={stats.pendCount > 0 ? 'Awaiting transfer' : 'All clear'} color={stats.pendCount > 0 ? '#d97706' : '#16a34a'} />
            <StatCard icon={<TrendingUp size={16} />} label="Transferred Amt" value={`₹${fmtAmt(stats.xfTotal)}`} sub={`Cash ₹${fmtAmt(stats.xfCash)} · Bank ₹${fmtAmt(stats.xfBank)}`} color="#0ea5e9" />
            <StatCard icon={<Wallet size={16} />} label="Pending Amt" value={`₹${fmtAmt(stats.pendTotal)}`} sub={`Cash ₹${fmtAmt(stats.pendCash)} · Bank ₹${fmtAmt(stats.pendBank)}`} color={stats.pendTotal > 0 ? '#d97706' : '#16a34a'} />
            <StatCard icon={<ArrowRightLeft size={16} />} label="Transfer Batches" value={stats.activeBatches} sub={`${batches.filter(b => b.is_reversed).length} reversed`} color="#8b5cf6" />
          </div>

          {/* ── progress bar ── */}
          <div style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: 10, padding: '14px 18px', marginBottom: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 13 }}>
              <span style={{ fontWeight: 600, color: 'var(--text-1)' }}>Transfer Progress</span>
              <span style={{ color: 'var(--text-3)' }}>{stats.xfCount} / {stats.totalCount} receipts ({pct}%)</span>
            </div>
            <div style={{ height: 8, background: 'var(--card-border)', borderRadius: 99 }}>
              <div style={{ height: 8, width: `${pct}%`, background: pct === 100 ? '#16a34a' : '#2563eb', borderRadius: 99, transition: 'width .4s' }} />
            </div>
          </div>

          {/* ── transfer batches ── */}
          <section style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: 10, marginBottom: 24 }}>
            <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--card-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--text-1)' }}>
                Transfer Batches
                <span style={{ marginLeft: 8, fontSize: 12, fontWeight: 500, color: 'var(--text-3)' }}>({batches.length})</span>
              </h2>
            </div>
            {batches.length === 0 ? (
              <div style={{ padding: '32px 18px', textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>
                No transfer batches found for {fyLabel(fy)}
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: 'var(--table-header-bg, var(--card-border))' }}>
                      <th style={TH}>#</th>
                      <th style={TH}>Date Range</th>
                      <th style={TH}>Receipt Range</th>
                      <th style={TH_R}>Receipts</th>
                      <th style={TH_R}>Cash</th>
                      <th style={TH_R}>Bank</th>
                      <th style={TH_R}>Total</th>
                      <th style={TH}>Transferred By</th>
                      <th style={TH}>Transferred On</th>
                      <th style={TH_M}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {batches.map((b, i) => (
                      <tr key={b.id} style={{ background: b.is_reversed ? 'rgba(239,68,68,.04)' : 'transparent' }}>
                        <td style={TD}>{batches.length - i}</td>
                        <td style={TD}>
                          <span style={{ fontSize: 12 }}>{fmtDate(b.from_date)}</span>
                          <span style={{ color: 'var(--text-3)', margin: '0 4px' }}>→</span>
                          <span style={{ fontSize: 12 }}>{fmtDate(b.to_date)}</span>
                        </td>
                        <td style={TD}>
                          <span style={{ fontSize: 12, fontFamily: 'monospace' }}>
                            {b.from_receipt_no} → {b.to_receipt_no}
                          </span>
                        </td>
                        <td style={TD_R}>{b.receipt_count}</td>
                        <td style={TD_R}>{b.cash_total > 0 ? `₹${fmtAmt(b.cash_total)}` : '—'}</td>
                        <td style={TD_R}>{b.bank_total > 0 ? `₹${fmtAmt(b.bank_total)}` : '—'}</td>
                        <td style={{ ...TD_R, fontWeight: 600 }}>₹{fmtAmt((b.cash_total || 0) + (b.bank_total || 0))}</td>
                        <td style={TD}>{b.transferred_by || '—'}</td>
                        <td style={{ ...TD, fontSize: 12, color: 'var(--text-2)' }}>{fmtDateTime(b.transferred_at)}</td>
                        <td style={TD_M}>
                          {b.is_reversed ? (
                            <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 99, background: '#fee2e2', color: '#dc2626' }}>Reversed</span>
                          ) : (
                            <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 99, background: '#dcfce7', color: '#16a34a' }}>Active</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ background: 'var(--card-border)', fontWeight: 700 }}>
                      <td colSpan={3} style={{ ...TD, fontWeight: 700, color: 'var(--text-2)' }}>Total (Active Batches)</td>
                      <td style={{ ...TD_R, fontWeight: 700 }}>
                        {batches.filter(b => !b.is_reversed).reduce((s, b) => s + (b.receipt_count || 0), 0)}
                      </td>
                      <td style={{ ...TD_R, fontWeight: 700 }}>
                        ₹{fmtAmt(batches.filter(b => !b.is_reversed).reduce((s, b) => s + Number(b.cash_total || 0), 0))}
                      </td>
                      <td style={{ ...TD_R, fontWeight: 700 }}>
                        ₹{fmtAmt(batches.filter(b => !b.is_reversed).reduce((s, b) => s + Number(b.bank_total || 0), 0))}
                      </td>
                      <td style={{ ...TD_R, fontWeight: 700 }}>
                        ₹{fmtAmt(batches.filter(b => !b.is_reversed).reduce((s, b) => s + Number(b.cash_total || 0) + Number(b.bank_total || 0), 0))}
                      </td>
                      <td colSpan={3} />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </section>

          {/* ── pending receipts ── */}
          {stats.pendCount > 0 ? (
            <section style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: 10 }}>
              <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--card-border)', display: 'flex', alignItems: 'center', gap: 8 }}>
                <AlertCircle size={16} style={{ color: '#d97706' }} />
                <h2 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--text-1)' }}>
                  Pending Receipts — Month-wise Summary
                  <span style={{ marginLeft: 8, fontSize: 12, fontWeight: 500, color: 'var(--text-3)' }}>({stats.pendCount} receipts · ₹{fmtAmt(stats.pendTotal)})</span>
                </h2>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: 'var(--table-header-bg, var(--card-border))' }}>
                      <th style={TH}>Month</th>
                      <th style={TH}>Receipt Range</th>
                      <th style={TH_R}>Count</th>
                      <th style={TH_R}>Cash</th>
                      <th style={TH_R}>Bank / Cheque</th>
                      <th style={TH_R}>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pending.map(g => {
                      const [y, m] = g.month.split('-')
                      const label = new Date(Number(y), Number(m) - 1).toLocaleString('en-IN', { month: 'long', year: 'numeric' })
                      return (
                        <tr key={g.month}>
                          <td style={{ ...TD, fontWeight: 600 }}>{label}</td>
                          <td style={{ ...TD, fontSize: 12, fontFamily: 'monospace' }}>
                            {g.minNo === g.maxNo ? g.minNo : `${g.minNo} → ${g.maxNo}`}
                          </td>
                          <td style={TD_R}>{g.count}</td>
                          <td style={TD_R}>{g.cash > 0 ? `₹${fmtAmt(g.cash)}` : '—'}</td>
                          <td style={TD_R}>{g.bank > 0 ? `₹${fmtAmt(g.bank)}` : '—'}</td>
                          <td style={{ ...TD_R, fontWeight: 600 }}>₹{fmtAmt(g.cash + g.bank)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                  <tfoot>
                    <tr style={{ background: 'var(--card-border)', fontWeight: 700 }}>
                      <td colSpan={2} style={{ ...TD, fontWeight: 700, color: 'var(--text-2)' }}>Total Pending</td>
                      <td style={{ ...TD_R, fontWeight: 700 }}>{stats.pendCount}</td>
                      <td style={{ ...TD_R, fontWeight: 700 }}>₹{fmtAmt(stats.pendCash)}</td>
                      <td style={{ ...TD_R, fontWeight: 700 }}>₹{fmtAmt(stats.pendBank)}</td>
                      <td style={{ ...TD_R, fontWeight: 700 }}>₹{fmtAmt(stats.pendTotal)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </section>
          ) : (
            <section style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: 10, padding: '28px 18px', textAlign: 'center' }}>
              <CheckCircle2 size={32} style={{ color: '#16a34a', marginBottom: 10 }} />
              <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-1)', marginBottom: 4 }}>All receipts transferred!</div>
              <div style={{ fontSize: 13, color: 'var(--text-3)' }}>No pending receipts for {fyLabel(fy)}</div>
            </section>
          )}
        </>
      ) : null}
    </div>
  )
}

// ── StatCard ──────────────────────────────────────────────────────────────

function StatCard({ icon, label, value, sub, color }) {
  return (
    <div style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: 10, padding: '16px 18px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <span style={{ color, display: 'flex' }}>{icon}</span>
        <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-3)' }}>{label}</span>
      </div>
      <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-1)', lineHeight: 1.1, marginBottom: 4 }}>{value}</div>
      <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{sub}</div>
    </div>
  )
}
