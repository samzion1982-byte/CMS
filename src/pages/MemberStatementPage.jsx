import { useState, useEffect, useMemo, Fragment } from 'react'
import { supabase, getChurch } from '../lib/supabase'
import { useToast } from '../lib/toast'
import { Search, Loader2, ChevronLeft, ChevronDown, ChevronRight, FileText } from 'lucide-react'
import { getActiveCategories } from '../lib/paymentCategories'
import { exportStatementPDF } from '../lib/exportStatementPDF'

// ── helpers ──────────────────────────────────────────────────────

function getFY(dateStr) {
  const d = dateStr ? new Date(dateStr + 'T00:00:00') : new Date()
  const m = d.getMonth() + 1; const y = d.getFullYear()
  return m >= 4 ? `${y}-${String(y+1).slice(2)}` : `${y-1}-${String(y).slice(2)}`
}

function fmtDate(s) {
  if (!s) return '—'
  const [y, m, d] = s.split('-')
  return `${d}-${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][+m-1]}-${y}`
}

function numFmt(n) {
  if (n == null || n === '') return ''
  const v = Math.round(parseFloat(n) || 0)
  return v === 0 ? '' : v.toLocaleString('en-IN')
}

// Cell styles
const YH = { // yellow header cell
  padding: '4px 4px', fontSize: 9, fontWeight: 700, color: '#5a4a00',
  textAlign: 'center', background: '#FFF59D', borderRight: '1px solid #E6D400',
  lineHeight: 1.35, whiteSpace: 'normal', overflowWrap: 'break-word', wordBreak: 'normal', verticalAlign: 'bottom',
}
const YD = { // yellow data cell
  padding: '4px 4px', fontSize: 11, fontFamily: 'monospace',
  textAlign: 'right', background: '#FFFDE7', borderRight: '1px solid #E6D400', verticalAlign: 'middle',
}
const BH = { // blue header cell
  padding: '5px 4px', fontSize: 9, fontWeight: 700, color: '#fff',
  textAlign: 'center', background: '#1E3A5F', borderRight: '1px solid #2d5a8a',
  lineHeight: 1.35, whiteSpace: 'normal', overflowWrap: 'break-word', wordBreak: 'normal', verticalAlign: 'bottom',
}

// ── main component ───────────────────────────────────────────────

export default function MemberStatementPage() {
  const toast = useToast()

  // ── list state ───────────────────────────────────────────────
  const [members, setMembers]         = useState([])
  const [listLoading, setListLoading] = useState(true)
  const [listQ, setListQ]             = useState('')

  // ── detail state ─────────────────────────────────────────────
  const [selMember, setSelMember]         = useState(null)
  const [church, setChurch]               = useState(null)
  const [categories, setCategories]       = useState([])
  const [pdfLoading, setPdfLoading]       = useState(false)
  const [declFY, setDeclFY]               = useState(getFY)
  const [declaration, setDeclaration]     = useState(null)
  const [declItems, setDeclItems]         = useState([])
  const [allReceipts, setAllReceipts]     = useState([])
  const [detailLoading, setDetailLoading] = useState(false)
  const [loadingDecl, setLoadingDecl]     = useState(false)
  const [collapsedFYs, setCollapsedFYs]   = useState(new Set())

  // ── load all members + receipt stats on mount ────────────────
  useEffect(() => {
    ;(async () => {
      setListLoading(true)
      try {
        const { data: membersData, error: e1 } = await supabase
          .from('members').select('member_id,member_name,mobile,city,address_street').order('member_id')
        if (e1) throw e1
        setMembers(membersData || [])
      } catch (e) { toast(e.message, 'error') }
      setListLoading(false)
    })()
    getActiveCategories().then(setCategories).catch(() => {})
    getChurch().then(setChurch).catch(() => {})
  }, []) // eslint-disable-line

  // ── open member detail ───────────────────────────────────────
  const openMember = (m) => {
    setSelMember(m)
    setDeclFY(getFY())
    setAllReceipts([])
    setDeclaration(null)
    setDeclItems([])
    loadMemberDetail(m.member_id)
  }

  const loadMemberDetail = async (memberId) => {
    setDetailLoading(true)
    try {
      const { data, error } = await supabase
        .from('receipts')
        .select('id,receipt_number,receipt_date,financial_year,payment_mode,grand_total,month_paid,receipt_items(category_id,amt,months,total)')
        .eq('member_id', memberId)
        .order('receipt_date',   { ascending: true })
        .order('receipt_number', { ascending: true })
      if (error) throw error
      const recs = data || []
      setAllReceipts(recs)
      const curFY = getFY()
      setCollapsedFYs(new Set([...new Set(recs.map(r => r.financial_year))].filter(f => f !== curFY)))
    } catch (e) { toast(e.message, 'error') }
    setDetailLoading(false)
  }

  // ── load declaration when member or FY changes ───────────────
  useEffect(() => {
    if (!selMember?.member_id) return
    ;(async () => {
      setLoadingDecl(true)
      setDeclaration(null); setDeclItems([])
      try {
        const { data: declData } = await supabase
          .from('declarations')
          .select('id,financial_year,declaration_date,income_category,declared_income,percentage')
          .eq('member_id', selMember.member_id).eq('financial_year', declFY).limit(1)
        const decl = declData?.[0] || null
        setDeclaration(decl)
        if (decl) {
          const { data: di } = await supabase
            .from('declaration_items')
            .select('category_id,amount,payment_categories(name)')
            .eq('declaration_id', decl.id)
          setDeclItems((di || []).map(i => ({ category_id: i.category_id, name: i.payment_categories?.name || '', pledged: i.amount || 0 })))
        }
      } catch (e) { toast(e.message, 'error') }
      setLoadingDecl(false)
    })()
  }, [selMember, declFY]) // eslint-disable-line

  // ── memos ────────────────────────────────────────────────────
  const availableDeclFYs = useMemo(() => {
    const s = new Set([...allReceipts.map(r => r.financial_year), getFY()])
    return [...s].sort().reverse()
  }, [allReceipts])

  const receiptsByFY = useMemo(() => {
    const g = {}
    for (const r of allReceipts) { if (!g[r.financial_year]) g[r.financial_year] = []; g[r.financial_year].push(r) }
    return g
  }, [allReceipts])

  const fyList = useMemo(() => Object.keys(receiptsByFY).sort().reverse(), [receiptsByFY])

  const fyTotals = useMemo(() => {
    const t = {}
    for (const [fy, recs] of Object.entries(receiptsByFY)) {
      const cat = {}; let grand = 0
      for (const r of recs) {
        grand += parseFloat(r.grand_total) || 0
        for (const it of (r.receipt_items || [])) cat[it.category_id] = (cat[it.category_id] || 0) + (parseFloat(it.total) || 0)
      }
      t[fy] = { cat, grand, count: recs.length }
    }
    return t
  }, [receiptsByFY])

  const overallTotals = useMemo(() => {
    const cat = {}; let grand = 0
    for (const r of allReceipts) {
      grand += parseFloat(r.grand_total) || 0
      for (const it of (r.receipt_items || [])) cat[it.category_id] = (cat[it.category_id] || 0) + (parseFloat(it.total) || 0)
    }
    return { cat, grand }
  }, [allReceipts])

  const toggleFY = (fy) => setCollapsedFYs(p => { const n = new Set(p); n.has(fy) ? n.delete(fy) : n.add(fy); return n })

  const filteredMembers = useMemo(() => {
    if (!listQ.trim()) return members
    const q = listQ.trim().toLowerCase()
    return members.filter(m => m.member_name?.toLowerCase().includes(q) || m.member_id?.toLowerCase().includes(q) || m.city?.toLowerCase().includes(q))
  }, [members, listQ])

  const declTotal = declItems.reduce((s, d) => s + (d.pledged || 0), 0)

  // ════════════════════════════════════════════════════════════════
  // DETAIL VIEW — full-screen when a member is selected
  // ════════════════════════════════════════════════════════════════
  if (selMember) {
    const N = categories.length
    // Fixed cols: Date(5.5%) RecNo(8%) Year(4%) Month(4%) Months(3%) Total(5%) = 29.5%
    // Categories share: 70.5% / N
    const catW = N > 0 ? `${(70.5 / N).toFixed(2)}%` : '4%'

    return (
      <div style={{ position: 'fixed', inset: 0, background: '#f0f2f5', zIndex: 500, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* ── top bar ─────────────────────────────────────────── */}
        <div style={{ background: '#1E3A5F', padding: '0 20px', minHeight: 56, display: 'flex', alignItems: 'center', gap: 16, flexShrink: 0 }}>
          <button onClick={() => setSelMember(null)}
            style={{ background: 'rgba(255,255,255,0.12)', border: 'none', borderRadius: 7, padding: '5px 14px', cursor: 'pointer', color: '#fff', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600 }}>
            <ChevronLeft size={15}/> Back
          </button>
          <div style={{ flex: 1 }}>
            <span style={{ color: '#fff', fontWeight: 700, fontSize: 15 }}>{selMember.member_name}</span>
            <span style={{ color: '#a8bdd8', fontSize: 12, marginLeft: 12 }}>
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, letterSpacing: '0.04em', color: '#7dd3fc' }}>{selMember.member_id}</span>
              {selMember.mobile ? ` · ${selMember.mobile}` : ''}
              {selMember.city   ? ` · ${selMember.city}`   : ''}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ textAlign: 'right', marginRight: 8 }}>
              {detailLoading ? (
                <Loader2 size={16} className="animate-spin" style={{ color: '#a8bdd8' }}/>
              ) : (
                <>
                  <div style={{ color: '#fff', fontWeight: 800, fontSize: 15, fontFamily: 'monospace' }}>
                    ₹{Math.round(overallTotals.grand).toLocaleString('en-IN')}
                  </div>
                  <div style={{ color: '#a8bdd8', fontSize: 11 }}>{allReceipts.length} receipt{allReceipts.length !== 1 ? 's' : ''}</div>
                </>
              )}
            </div>
            <button
              disabled={pdfLoading || detailLoading}
              onClick={async () => {
                setPdfLoading(true)
                try {
                  await exportStatementPDF({
                    member: selMember,
                    church,
                    categories,
                    allReceipts,
                    receiptsByFY,
                    fyList,
                    fyTotals,
                    overallTotals,
                    declaration,
                    declItems,
                    declFY,
                  })
                } catch (e) {
                  toast(e.message, 'error')
                }
                setPdfLoading(false)
              }}
              style={{ background: pdfLoading ? '#b91c1c' : '#dc2626', border: 'none', borderRadius: 7, padding: '6px 16px', cursor: pdfLoading ? 'wait' : 'pointer', color: '#fff', display: 'flex', alignItems: 'center', gap: 7, fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap', opacity: pdfLoading ? 0.8 : 1, boxShadow: '0 2px 8px rgba(220,38,38,0.4)' }}>
              {pdfLoading
                ? <><Loader2 size={14} className="animate-spin"/> Generating…</>
                : <><FileText size={15}/> <span>PDF</span></>}
            </button>
          </div>
        </div>

        {/* ── scrollable body ─────────────────────────────────── */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
          {detailLoading ? (
            <div style={{ padding: 60, textAlign: 'center' }}>
              <Loader2 size={36} className="animate-spin" style={{ color: '#1E3A5F', margin: '0 auto' }}/>
            </div>
          ) : (
            <div style={{ background: '#fff', borderRadius: 8, border: '1px solid #dde3ec', overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed', fontSize: 11 }}>
                <colgroup>
                  <col style={{ width: '5.5%' }}  /> {/* Receipt Date */}
                  <col style={{ width: '8%' }}    /> {/* Receipt No   */}
                  <col style={{ width: '4%' }}    /> {/* Year         */}
                  <col style={{ width: '4%' }}    /> {/* Month        */}
                  <col style={{ width: '3.5%' }}  /> {/* No of Months */}
                  {categories.map(c => <col key={c.id} style={{ width: catW }} />)}
                  <col style={{ width: '5%' }}    /> {/* Total        */}
                </colgroup>

                <thead>
                  {/* ── Declaration label row ─────────────────── */}
                  <tr>
                    <td colSpan={3} style={{ ...YH, textAlign: 'left', paddingLeft: 8, fontSize: 11 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontWeight: 700, color: '#5a4a00' }}>Declaration — FY</span>
                        <select value={declFY} onChange={e => setDeclFY(e.target.value)}
                          style={{ fontSize: 11, padding: '2px 4px', border: '1px solid #c8b800', borderRadius: 4, background: '#fffbe0', fontWeight: 700, color: '#333' }}>
                          {availableDeclFYs.map(fy => <option key={fy} value={fy}>{fy}</option>)}
                        </select>
                        {loadingDecl && <Loader2 size={10} className="animate-spin" style={{ color: '#888' }}/>}
                      </div>
                    </td>
                    <td style={{ ...YH }}>Declared<br/>Income</td>
                    <td style={{ ...YH }}>Decl.<br/>%</td>
                    {categories.map(c => <td key={c.id} style={{ ...YH }}>{c.name}</td>)}
                    <td style={{ ...YH, borderRight: 'none' }}>Total</td>
                  </tr>

                  {/* ── Declaration values row ────────────────── */}
                  <tr style={{ borderBottom: '2px solid #E6D400' }}>
                    <td colSpan={3} style={{ ...YD, textAlign: 'left', paddingLeft: 8, fontSize: 11, color: declaration ? '#333' : '#aaa', fontStyle: declaration ? 'normal' : 'italic', fontFamily: 'inherit' }}>
                      {declaration
                        ? `${fmtDate(declaration.declaration_date)}  ·  ${declaration.income_category || ''}`
                        : 'No declaration for this FY'}
                    </td>
                    <td style={{ ...YD, fontWeight: 700 }}>
                      {declaration?.declared_income ? numFmt(declaration.declared_income) : ''}
                    </td>
                    <td style={{ ...YD, textAlign: 'center' }}>
                      {declaration?.percentage ? `${declaration.percentage}%` : ''}
                    </td>
                    {categories.map(c => {
                      const di = declItems.find(d => d.category_id === c.id)
                      return <td key={c.id} style={{ ...YD }}>{di?.pledged ? numFmt(di.pledged) : ''}</td>
                    })}
                    <td style={{ ...YD, fontWeight: 700, borderRight: 'none' }}>
                      {declTotal > 0 ? numFmt(declTotal) : ''}
                    </td>
                  </tr>

                  {/* ── Column header row ─────────────────────── */}
                  <tr>
                    {['Receipt\nDate','Receipt No','Year','Month','No of\nMonths'].map(h => (
                      <th key={h} style={{ ...BH, whiteSpace: 'pre-line' }}>{h}</th>
                    ))}
                    {categories.map(c => <th key={c.id} style={{ ...BH }}>{c.name}</th>)}
                    <th style={{ ...BH, borderRight: 'none' }}>Total</th>
                  </tr>
                </thead>

                <tbody>
                  {allReceipts.length === 0 ? (
                    <tr>
                      <td colSpan={6 + categories.length} style={{ padding: 32, textAlign: 'center', color: '#999', fontSize: 13 }}>
                        No payment history found for this member.
                      </td>
                    </tr>
                  ) : fyList.map(fy => {
                    const isCol = collapsedFYs.has(fy)
                    const fyRecs = receiptsByFY[fy]
                    const { cat: fyCat, grand, count } = fyTotals[fy]
                    return (
                      <Fragment key={fy}>
                        {/* FY subtotal row */}
                        <tr onClick={() => toggleFY(fy)} style={{ background: '#2c5282', cursor: 'pointer', userSelect: 'none' }}>
                          <td colSpan={2} style={{ padding: '5px 8px', color: '#fff', fontWeight: 700, fontSize: 11, whiteSpace: 'nowrap' }}>
                            {isCol
                              ? <ChevronRight size={12} style={{ verticalAlign: 'middle', marginRight: 4 }}/>
                              : <ChevronDown  size={12} style={{ verticalAlign: 'middle', marginRight: 4 }}/>}
                            FY {fy} — {count} receipt{count !== 1 ? 's' : ''}
                          </td>
                          <td style={{ padding: '5px 5px', color: '#a8c8e8', fontSize: 10, textAlign: 'center' }}>{fy}</td>
                          <td colSpan={2} />
                          {categories.map(c => (
                            <td key={c.id} style={{ padding: '5px 4px', textAlign: 'right', fontFamily: 'monospace', fontSize: 11, fontWeight: 600, color: fyCat[c.id] ? '#fff' : '#3a6090' }}>
                              {numFmt(fyCat[c.id])}
                            </td>
                          ))}
                          <td style={{ padding: '5px 6px', textAlign: 'right', fontFamily: 'monospace', fontSize: 11, fontWeight: 800, color: '#fff' }}>
                            {numFmt(grand)}
                          </td>
                        </tr>

                        {/* Receipt rows */}
                        {!isCol && fyRecs.map((r, i) => {
                          const imap = {}
                          ;(r.receipt_items || []).forEach(it => { imap[it.category_id] = it })
                          const mos = (r.receipt_items || []).find(it => (it.months || 0) > 0)?.months || ''
                          return (
                            <tr key={r.id} style={{ background: i % 2 === 0 ? '#fff' : '#f7f9ff', borderBottom: '1px solid #edf0f7' }}>
                              <td style={{ padding: '4px 5px', fontSize: 11, color: '#333', textAlign: 'center', whiteSpace: 'nowrap' }}>{fmtDate(r.receipt_date)}</td>
                              <td style={{ padding: '4px 5px', fontFamily: 'monospace', fontSize: 10, fontWeight: 600, color: '#1a1a1a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.receipt_number}</td>
                              <td style={{ padding: '4px 5px', fontSize: 10, color: '#666', textAlign: 'center' }}>{r.financial_year}</td>
                              <td style={{ padding: '4px 5px', fontSize: 11, color: '#333', textAlign: 'center' }}>{r.month_paid || '—'}</td>
                              <td style={{ padding: '4px 5px', fontSize: 11, color: '#555', textAlign: 'center', fontFamily: 'monospace' }}>{mos || '—'}</td>
                              {categories.map(c => {
                                const it = imap[c.id]
                                return (
                                  <td key={c.id} style={{ padding: '4px 4px', textAlign: 'right', fontFamily: 'monospace', fontSize: 11, color: it ? '#111' : '#e0e0e0' }}>
                                    {it ? numFmt(it.total) : ''}
                                  </td>
                                )
                              })}
                              <td style={{ padding: '4px 5px', textAlign: 'right', fontFamily: 'monospace', fontSize: 11, fontWeight: 700, color: '#111' }}>
                                {numFmt(r.grand_total)}
                              </td>
                            </tr>
                          )
                        })}
                      </Fragment>
                    )
                  })}
                </tbody>

                {/* Grand total */}
                <tfoot>
                  <tr style={{ background: '#1E3A5F', borderTop: '2px solid #0f2440' }}>
                    <td colSpan={5} style={{ padding: '7px 10px', fontWeight: 700, fontSize: 12, color: '#fff' }}>Grand Total</td>
                    {categories.map(c => (
                      <td key={c.id} style={{ padding: '7px 4px', textAlign: 'right', fontFamily: 'monospace', fontSize: 11, fontWeight: 700, color: overallTotals.cat[c.id] ? '#fff' : '#3a5a7a' }}>
                        {numFmt(overallTotals.cat[c.id])}
                      </td>
                    ))}
                    <td style={{ padding: '7px 6px', textAlign: 'right', fontFamily: 'monospace', fontSize: 13, fontWeight: 800, color: '#6ee7a0' }}>
                      ₹{Math.round(overallTotals.grand).toLocaleString('en-IN')}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      </div>
    )
  }

  // ════════════════════════════════════════════════════════════════
  // LIST VIEW — all members alphabetically
  // ════════════════════════════════════════════════════════════════

  const TH = { padding: '9px 14px', fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', whiteSpace: 'nowrap' }

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <FileText size={20} style={{ color: 'var(--accent)', flexShrink: 0 }} />
              Member Statement
            </h1>
          <p className="page-subtitle">
            {listLoading ? 'Loading…' : `${members.length} members`}
          </p>
        </div>
      </div>

      {/* Filter */}
      <div className="card" style={{ padding: '14px 20px', marginBottom: 16 }}>
        <div style={{ position: 'relative', maxWidth: 360 }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }}/>
          <input value={listQ} onChange={e => setListQ(e.target.value)}
            placeholder="Filter by name, ID or city…"
            className="field-input" style={{ paddingLeft: 32 }}/>
        </div>
      </div>

      {/* Table */}
      <div className="card" style={{ overflow: 'hidden' }}>
        {listLoading ? (
          <div style={{ padding: 48, textAlign: 'center' }}>
            <Loader2 size={32} className="animate-spin" style={{ color: 'var(--text-3)', margin: '0 auto' }}/>
          </div>
        ) : filteredMembers.length === 0 ? (
          <div style={{ padding: 48, textAlign: 'center' }}>
            <p style={{ color: 'var(--text-3)', margin: 0 }}>{listQ ? 'No members match your filter.' : 'No members found.'}</p>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--table-header-bg)' }}>
                <th style={{ ...TH, textAlign: 'left' }}>#</th>
                <th style={{ ...TH, textAlign: 'left' }}>Member ID</th>
                <th style={{ ...TH, textAlign: 'left' }}>Name</th>
                <th style={{ ...TH, textAlign: 'left' }}>Mobile</th>
                <th style={{ ...TH, textAlign: 'left' }}>City</th>
              </tr>
            </thead>
            <tbody>
              {filteredMembers.map((m, i) => (
                  <tr key={m.member_id}
                    onClick={() => openMember(m)}
                    style={{ borderTop: '1px solid var(--table-border)', cursor: 'pointer', background: i % 2 === 0 ? 'transparent' : 'rgba(0,0,0,0.012)' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--table-row-hover)'}
                    onMouseLeave={e => e.currentTarget.style.background = i % 2 === 0 ? 'transparent' : 'rgba(0,0,0,0.012)'}>
                    <td style={{ padding: '9px 14px', fontSize: 12, color: 'var(--text-3)' }}>{i + 1}</td>
                    <td style={{ padding: '7px 14px' }}>
                      <span style={{ display: 'inline-block', background: 'var(--accent)', color: '#fff', borderRadius: 20, padding: '2px 10px', fontSize: 11, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace", letterSpacing: '0.04em' }}>
                        {m.member_id}
                      </span>
                    </td>
                    <td style={{ padding: '9px 14px', fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>{m.member_name}</td>
                    <td style={{ padding: '9px 14px', fontSize: 12, color: 'var(--text-2)' }}>{m.mobile || '—'}</td>
                    <td style={{ padding: '9px 14px', fontSize: 13, color: 'var(--text-2)' }}>{m.city || '—'}</td>
                  </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

