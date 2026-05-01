import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useToast } from '../lib/toast'
import { Search, Loader2, BookOpen, IndianRupee } from 'lucide-react'

// ── helpers ─────────────────────────────────────────────────────

function getFY(dateStr) {
  const d = dateStr ? new Date(dateStr + 'T00:00:00') : new Date()
  const m = d.getMonth() + 1
  const y = d.getFullYear()
  return m >= 4
    ? `${y}-${String(y + 1).slice(2)}`
    : `${y - 1}-${String(y).slice(2)}`
}

function fyOptions() {
  const baseYear = new Date().getFullYear()
  const options = []
  for (let d = -2; d <= 1; d++) {
    const y = baseYear + d
    const m = new Date().getMonth() + 1
    const fy = m >= 4 ? `${y}-${String(y + 1).slice(2)}` : `${y - 1}-${String(y).slice(2)}`
    if (!options.includes(fy)) options.push(fy)
  }
  return [...new Set(options)].sort().reverse()
}

function fmtDate(s) {
  if (!s) return '—'
  const [y, m, d] = s.split('-')
  return `${d}/${m}/${y}`
}

function fmtAmt(n) {
  if (!n && n !== 0) return '—'
  return '₹' + Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// ── main component ──────────────────────────────────────────────

export default function MemberStatementPage() {
  const toast = useToast()

  // Member search
  const [memberQ, setMemberQ]         = useState('')
  const [suggestions, setSuggestions] = useState([])
  const [suggesting, setSuggesting]   = useState(false)
  const memberTimer = useRef(null)

  // Selected member + FY
  const [selMember, setSelMember] = useState(null)
  const [selFY, setSelFY]         = useState(() => getFY())

  // Data
  const [declaration, setDeclaration] = useState(null)
  const [declItems, setDeclItems]     = useState([])   // { category_id, name, pledged }
  const [receipts, setReceipts]       = useState([])
  const [receiptItems, setReceiptItems] = useState([]) // all items across receipts
  const [loading, setLoading]         = useState(false)

  const FYS = fyOptions()

  // ── member autocomplete
  useEffect(() => {
    if (!memberQ.trim()) { setSuggestions([]); return }
    clearTimeout(memberTimer.current)
    memberTimer.current = setTimeout(async () => {
      setSuggesting(true)
      const s = memberQ.trim()
      const { data } = await supabase
        .from('members')
        .select('member_id,member_name,address_street,city,mobile')
        .or(`member_name.ilike.%${s}%,member_id.ilike.%${s}%`)
        .limit(8)
      setSuggestions(data || [])
      setSuggesting(false)
    }, 280)
  }, [memberQ])

  const selectMember = (m) => {
    setSuggestions([])
    setMemberQ(m.member_name)
    setSelMember(m)
  }

  // ── load statement whenever member or FY changes
  useEffect(() => {
    if (!selMember?.member_id) return
    loadStatement(selMember.member_id, selFY)
  }, [selMember, selFY])

  const loadStatement = async (memberId, fy) => {
    setLoading(true)
    setDeclaration(null)
    setDeclItems([])
    setReceipts([])
    setReceiptItems([])
    try {
      // 1. Declaration for this member+FY
      const { data: declData } = await supabase
        .from('declarations')
        .select('id,financial_year,declaration_date,income_category,declared_income,percentage')
        .eq('member_id', memberId)
        .eq('financial_year', fy)
        .limit(1)
      const decl = declData?.[0] || null
      setDeclaration(decl)

      // 2. Declaration items (if declaration exists)
      if (decl) {
        const { data: di } = await supabase
          .from('declaration_items')
          .select('category_id,amount,payment_categories(name)')
          .eq('declaration_id', decl.id)
        setDeclItems(
          (di || []).map(i => ({
            category_id: i.category_id,
            name: i.payment_categories?.name || 'Unknown',
            pledged: i.amount || 0,
          }))
        )
      }

      // 3. Receipts for this member+FY
      const { data: recData } = await supabase
        .from('receipts')
        .select('id,receipt_number,receipt_date,payment_mode,grand_total,month_paid')
        .eq('member_id', memberId)
        .eq('financial_year', fy)
        .order('receipt_number', { ascending: true })
      setReceipts(recData || [])

      // 4. All receipt items for those receipts
      if (recData?.length) {
        const ids = recData.map(r => r.id)
        const { data: ri } = await supabase
          .from('receipt_items')
          .select('receipt_id,category_id,amt,months,total,payment_categories(name)')
          .in('receipt_id', ids)
        setReceiptItems(ri || [])
      }
    } catch (e) {
      toast(e.message, 'error')
    }
    setLoading(false)
  }

  // ── build summary per category (pledged vs paid)
  const allCategoryNames = {}
  declItems.forEach(d => { allCategoryNames[d.category_id] = d.name })
  receiptItems.forEach(r => { allCategoryNames[r.category_id] = r.payment_categories?.name || 'Unknown' })

  const categoryIds = Object.keys(allCategoryNames)
  const categorySummary = categoryIds.map(catId => {
    const pledged = declItems.find(d => d.category_id === catId)?.pledged || 0
    const paid    = receiptItems.filter(r => r.category_id === catId).reduce((s, r) => s + (r.total || 0), 0)
    return {
      category_id: catId,
      name:        allCategoryNames[catId],
      pledged,
      paid,
      balance:     pledged - paid,
    }
  }).filter(r => r.pledged > 0 || r.paid > 0)
    .sort((a, b) => a.name.localeCompare(b.name))

  const totalPledged = categorySummary.reduce((s, r) => s + r.pledged, 0)
  const totalPaid    = receipts.reduce((s, r) => s + (r.grand_total || 0), 0)
  const totalBalance = totalPledged - totalPaid

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Member Statement</h1>
          <p className="page-subtitle">Declaration vs actual payments per member per financial year</p>
        </div>
      </div>

      {/* Member + FY selector */}
      <div className="card" style={{ padding: '16px 20px', marginBottom: 16, display: 'flex', gap: 16, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 280 }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', display: 'block', marginBottom: 4 }}>Member</label>
          <div style={{ position: 'relative' }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)', zIndex: 1 }}/>
            <input
              value={memberQ}
              onChange={e => { setMemberQ(e.target.value); if (!e.target.value) { setSelMember(null); setDeclaration(null); setReceipts([]); setReceiptItems([]) } }}
              placeholder="Type member name or ID…"
              className="field-input"
              style={{ paddingLeft: 32 }}
            />
            {suggesting && <Loader2 size={13} className="animate-spin" style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }}/>}
            {suggestions.length > 0 && (
              <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 200, background: 'white', border: '1px solid var(--card-border)', borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', overflow: 'hidden', marginTop: 2 }}>
                {suggestions.map(m => (
                  <button key={m.member_id} onClick={() => selectMember(m)}
                    style={{ display: 'block', width: '100%', padding: '9px 14px', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', borderBottom: '1px solid var(--table-border)' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--table-row-hover)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'none'}>
                    <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-1)' }}>{m.member_name}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{m.member_id}{m.city ? ` · ${m.city}` : ''}</div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div>
          <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', display: 'block', marginBottom: 4 }}>Financial Year</label>
          <select value={selFY} onChange={e => setSelFY(e.target.value)} className="field-input" style={{ width: 120, appearance: 'none' }}>
            {FYS.map(fy => <option key={fy} value={fy}>{fy}</option>)}
          </select>
        </div>

        {selMember && (
          <div style={{ padding: '8px 14px', background: 'var(--info-subtle)', border: '1px solid var(--info-border)', borderRadius: 8, fontSize: 13 }}>
            <span style={{ fontWeight: 700, color: 'var(--info)' }}>{selMember.member_name}</span>
            <span style={{ color: 'var(--text-3)', marginLeft: 8 }}>{selMember.member_id}</span>
          </div>
        )}
      </div>

      {/* Empty state */}
      {!selMember && (
        <div className="card" style={{ padding: 48, textAlign: 'center' }}>
          <BookOpen size={40} style={{ color: 'var(--text-3)', margin: '0 auto 12px', display: 'block' }}/>
          <p style={{ color: 'var(--text-2)', fontWeight: 500, margin: 0 }}>Select a member to view their statement</p>
          <p style={{ color: 'var(--text-3)', fontSize: 13, marginTop: 4 }}>Choose member above, then select the financial year</p>
        </div>
      )}

      {selMember && loading && (
        <div className="card" style={{ padding: 48, textAlign: 'center' }}>
          <Loader2 size={32} className="animate-spin" style={{ color: 'var(--text-3)', margin: '0 auto' }}/>
        </div>
      )}

      {selMember && !loading && (
        <>
          {/* Declaration row */}
          <div className="card" style={{ padding: 20, marginBottom: 16 }}>
            <h3 style={{ fontSize: 12, fontWeight: 800, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 14 }}>Declaration — FY {selFY}</h3>
            {!declaration ? (
              <p style={{ fontSize: 13, color: 'var(--text-3)', margin: 0 }}>No declaration found for FY {selFY}. Go to the Declaration page to add one.</p>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 16 }}>
                <Stat label="Date"          value={fmtDate(declaration.declaration_date)} />
                <Stat label="Income Source" value={declaration.income_category || '—'} />
                <Stat label="Annual Income" value={fmtAmt(declaration.declared_income)} highlight />
                <Stat label="Tithe %"       value={declaration.percentage ? `${declaration.percentage}%` : '—'} />
                <Stat label="Expected Tithe" value={fmtAmt((declaration.declared_income || 0) * (declaration.percentage || 0) / 100)} highlight />
              </div>
            )}
          </div>

          {/* Category summary table (pledged vs paid) */}
          {categorySummary.length > 0 && (
            <div className="card" style={{ overflow: 'hidden', marginBottom: 16 }}>
              <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--table-border)' }}>
                <h3 style={{ fontSize: 12, fontWeight: 800, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.1em', margin: 0 }}>Pledged vs Paid — FY {selFY}</h3>
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: 'var(--table-header-bg)' }}>
                    {['Category', 'Pledged', 'Paid', 'Balance'].map(h => (
                      <th key={h} style={{ padding: '9px 16px', textAlign: h === 'Category' ? 'left' : 'right', fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {categorySummary.map((r, i) => (
                    <tr key={r.category_id} style={{ borderTop: '1px solid var(--table-border)', background: i % 2 === 0 ? 'transparent' : 'rgba(0,0,0,0.012)' }}>
                      <td style={{ padding: '9px 16px', fontSize: 13, color: 'var(--text-1)', fontWeight: 500 }}>{r.name}</td>
                      <td style={{ padding: '9px 16px', textAlign: 'right', fontSize: 13, fontFamily: 'monospace', color: 'var(--text-2)' }}>
                        {r.pledged > 0 ? fmtAmt(r.pledged) : '—'}
                      </td>
                      <td style={{ padding: '9px 16px', textAlign: 'right', fontSize: 13, fontFamily: 'monospace', fontWeight: 600, color: r.paid > 0 ? '#15803d' : 'var(--text-3)' }}>
                        {r.paid > 0 ? fmtAmt(r.paid) : '—'}
                      </td>
                      <td style={{ padding: '9px 16px', textAlign: 'right', fontSize: 13, fontFamily: 'monospace', fontWeight: 700, color: r.balance > 0 ? '#dc2626' : r.balance < 0 ? '#15803d' : 'var(--text-3)' }}>
                        {r.pledged > 0 ? fmtAmt(Math.abs(r.balance)) + (r.balance > 0 ? ' due' : r.balance < 0 ? ' extra' : '') : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ borderTop: '2px solid var(--table-border)', background: 'var(--table-header-bg)' }}>
                    <td style={{ padding: '10px 16px', fontSize: 13, fontWeight: 700, color: 'var(--text-1)' }}>Total</td>
                    <td style={{ padding: '10px 16px', textAlign: 'right', fontFamily: 'monospace', fontSize: 13, fontWeight: 700, color: 'var(--text-1)' }}>
                      {totalPledged > 0 ? fmtAmt(totalPledged) : '—'}
                    </td>
                    <td style={{ padding: '10px 16px', textAlign: 'right', fontFamily: 'monospace', fontSize: 14, fontWeight: 800, color: '#15803d' }}>
                      {fmtAmt(totalPaid)}
                    </td>
                    <td style={{ padding: '10px 16px', textAlign: 'right', fontFamily: 'monospace', fontSize: 14, fontWeight: 800, color: totalBalance > 0 ? '#dc2626' : totalBalance < 0 ? '#15803d' : 'var(--text-3)' }}>
                      {totalPledged > 0
                        ? fmtAmt(Math.abs(totalBalance)) + (totalBalance > 0 ? ' due' : totalBalance < 0 ? ' extra' : '')
                        : '—'}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          {/* Receipts list */}
          <div className="card" style={{ overflow: 'hidden' }}>
            <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--table-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontSize: 12, fontWeight: 800, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.1em', margin: 0 }}>
                Receipts — FY {selFY}
              </h3>
              <span style={{ fontSize: 13, color: 'var(--text-3)' }}>{receipts.length} receipt{receipts.length !== 1 ? 's' : ''}</span>
            </div>
            {receipts.length === 0 ? (
              <div style={{ padding: 32, textAlign: 'center' }}>
                <IndianRupee size={28} style={{ color: 'var(--text-3)', margin: '0 auto 8px', display: 'block' }}/>
                <p style={{ color: 'var(--text-3)', fontSize: 13, margin: 0 }}>No receipts for FY {selFY}</p>
              </div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: 'var(--table-header-bg)' }}>
                    {['Receipt No', 'Date', 'Month', 'Mode', 'Amount'].map(h => (
                      <th key={h} style={{ padding: '9px 14px', textAlign: h === 'Amount' ? 'right' : 'left', fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {receipts.map((r, i) => {
                    const rItems = receiptItems.filter(ri => ri.receipt_id === r.id)
                    return (
                      <>
                        <tr key={r.id} style={{ borderTop: '1px solid var(--table-border)', background: i % 2 === 0 ? 'transparent' : 'rgba(0,0,0,0.012)' }}>
                          <td style={{ padding: '9px 14px', fontFamily: 'monospace', fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>{r.receipt_number}</td>
                          <td style={{ padding: '9px 14px', fontSize: 13, color: 'var(--text-2)', whiteSpace: 'nowrap' }}>{fmtDate(r.receipt_date)}</td>
                          <td style={{ padding: '9px 14px', fontSize: 13, color: 'var(--text-2)' }}>{r.month_paid || '—'}</td>
                          <td style={{ padding: '9px 14px' }}>
                            <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 4, background: r.payment_mode === 'Cash' ? '#f0fdf4' : '#eff6ff', color: r.payment_mode === 'Cash' ? '#15803d' : '#1d4ed8' }}>
                              {r.payment_mode}
                            </span>
                          </td>
                          <td style={{ padding: '9px 14px', textAlign: 'right', fontSize: 13, fontWeight: 700, color: 'var(--text-1)', whiteSpace: 'nowrap' }}>
                            {fmtAmt(r.grand_total)}
                          </td>
                        </tr>
                        {rItems.length > 0 && (
                          <tr key={r.id + '-items'} style={{ borderBottom: '1px solid var(--table-border)' }}>
                            <td colSpan={5} style={{ padding: '4px 14px 10px 28px' }}>
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 12px' }}>
                                {rItems.map(ri => (
                                  <span key={ri.category_id} style={{ fontSize: 11, color: 'var(--text-3)' }}>
                                    {ri.payment_categories?.name || 'Unknown'}: <span style={{ fontWeight: 600, color: 'var(--text-2)', fontFamily: 'monospace' }}>₹{Number(ri.total).toLocaleString('en-IN')}</span>
                                  </span>
                                ))}
                              </div>
                            </td>
                          </tr>
                        )}
                      </>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr style={{ borderTop: '2px solid var(--table-border)', background: 'var(--table-header-bg)' }}>
                    <td colSpan={4} style={{ padding: '10px 14px', fontSize: 13, fontWeight: 700, color: 'var(--text-1)' }}>Total Paid</td>
                    <td style={{ padding: '10px 14px', textAlign: 'right', fontSize: 15, fontWeight: 800, color: '#15803d', fontFamily: 'monospace' }}>
                      {fmtAmt(totalPaid)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  )
}

// ── Stat tile ────────────────────────────────────────────────────
function Stat({ label, value, highlight }) {
  return (
    <div style={{ padding: '12px 16px', background: highlight ? 'var(--accent-subtle)' : 'var(--table-header-bg)', borderRadius: 8, border: '1px solid var(--card-border)' }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 15, fontWeight: 800, color: highlight ? 'var(--accent)' : 'var(--text-1)', fontFamily: 'monospace' }}>{value}</div>
    </div>
  )
}
