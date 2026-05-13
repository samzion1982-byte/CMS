import { getFY, fyDateRange } from '../../lib/accountingLib'

// toISOString() returns UTC which shifts dates for UTC+ timezones — use local fields instead
const localISO  = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
const today     = () => localISO(new Date())

function presets() {
  const now  = new Date()
  const fy   = getFY()
  const { from: fyFrom, to: fyTo } = fyDateRange(fy)

  const thisMonthStart = localISO(new Date(now.getFullYear(), now.getMonth(), 1))
  const thisMonthEnd   = localISO(new Date(now.getFullYear(), now.getMonth() + 1, 0))

  const lastMonthStart = localISO(new Date(now.getFullYear(), now.getMonth() - 1, 1))
  const lastMonthEnd   = localISO(new Date(now.getFullYear(), now.getMonth(), 0))

  // Current quarter (Apr-Jun / Jul-Sep / Oct-Dec / Jan-Mar)
  const fyStartYear = parseInt(fy.split('-')[0])
  const fyStartMonth = 3 // 0-based = April
  const monthsIntoFY = (now.getMonth() - fyStartMonth + 12) % 12
  const qtr = Math.floor(monthsIntoFY / 3)
  const qStart = localISO(new Date(fyStartYear + (qtr >= 3 ? 1 : 0), fyStartMonth + qtr * 3, 1))
  // end of quarter
  const qEnd = localISO(new Date(fyStartYear + (qtr >= 3 ? 1 : 0), fyStartMonth + qtr * 3 + 3, 0))

  return [
    { label: 'This Month',    from: thisMonthStart, to: thisMonthEnd },
    { label: 'Last Month',    from: lastMonthStart, to: lastMonthEnd },
    { label: 'This Quarter',  from: qStart,         to: qEnd         },
    { label: 'This FY',       from: fyFrom,         to: today()      },
    { label: 'Full FY',       from: fyFrom,         to: fyTo         },
  ]
}

export default function DatePresets({ onSelect }) {
  const list = presets()
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {list.map(p => (
        <button key={p.label} onClick={() => onSelect(p.from, p.to)}
          style={{
            padding: '4px 10px', fontSize: 11, fontWeight: 600,
            background: 'var(--card-bg)', border: '1.5px solid var(--card-border)',
            borderRadius: 20, cursor: 'pointer', color: 'var(--text-2)',
            whiteSpace: 'nowrap',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = 'var(--text-1)'; e.currentTarget.style.color = '#fff' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'var(--card-bg)'; e.currentTarget.style.color = 'var(--text-2)' }}
        >
          {p.label}
        </button>
      ))}
    </div>
  )
}
