// Shared card component used by both MemberPrintModal (live render) and
// BulkPrintModal (renderToStaticMarkup). Keep all card styling here only.

export const ACTS = [
  ['act_mens_fellowship',     "Men's Fellowship"],
  ['act_womens_fellowship',   "Women's Fellowship"],
  ['act_youth_association',   'Youth Association'],
  ['act_sunday_school',       'Sunday School'],
  ['act_choir',               'Choir'],
  ['act_pastorate_committee', 'Pastorate Committee'],
  ['act_village_ministry',    'Village Ministry'],
  ['act_dcc',                 'DCC'],
  ['act_dc',                  'DC'],
  ['act_volunteers',          'Volunteers'],
  ['act_others',              'Others'],
]

export function fmt(val) {
  if (val === null || val === undefined || val === '') return ''
  if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(val)) {
    const [y, m, d] = val.split('-')
    return `${d}-${m}-${y}`
  }
  if (val === true)  return 'Yes'
  if (val === false) return 'No'
  return String(val)
}

export function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) { resolve(); return }
    const s = document.createElement('script')
    s.src = src; s.onload = resolve; s.onerror = reject
    document.head.appendChild(s)
  })
}

export async function urlToBase64(source) {
  try {
    let blob = null
    if (typeof source === 'string') {
      const res = await fetch(source)
      if (!res.ok) return null
      blob = await res.blob()
    } else if (source instanceof Blob) {
      blob = source
    } else {
      return null
    }

    return new Promise(resolve => {
      const reader = new FileReader()
      reader.onloadend = () => resolve(reader.result)
      reader.onerror = () => resolve(null)
      reader.readAsDataURL(blob)
    })
  } catch {
    return null
  }
}

function Row({ label, value, valueStyle }) {
  return (
    <tr>
      <td style={{
        padding: '7px 0', width: '40%', verticalAlign: 'top',
        color: '#1e3a5f', fontWeight: 700, fontSize: 12.5,
        fontFamily: 'Arial, sans-serif', lineHeight: 1.4,
      }}>{label}</td>
      <td style={{
        padding: '7px 5px', width: '5%', verticalAlign: 'top',
        color: '#1e3a5f', fontWeight: 700, fontSize: 12.5,
      }}>:</td>
      <td style={{
        padding: '7px 0', width: '55%', verticalAlign: 'top',
        fontSize: 12.5, color: '#111', fontFamily: 'Arial, sans-serif', lineHeight: 1.4,
        ...valueStyle,
      }}>{value}</td>
    </tr>
  )
}

/**
 * The printable member card.
 * width defaults to 'min(794px, calc(100% - 1in))' for live modal preview.
 * Pass width={794} when rendering off-screen for html2canvas capture.
 */
export function MemberCard({ member, church, photoSrc, logoSrc, width, shadow = false }) {
  const addressLines = [
    member?.address_street,
    member?.area_1,
    member?.area_2,
    [member?.city, member?.state, member?.pincode].filter(Boolean).join(', '),
  ].filter(Boolean)

  const activeActs = ACTS.filter(([k]) => member?.[k]).map(([, l]) => l)

  return (
    <div style={{
      width: width ?? 'min(794px, calc(100% - 1in))',
      background: '#fff',
      fontFamily: 'Arial, sans-serif',
      border: '3px solid #1e3a5f',
      boxShadow: shadow ? '0 0 10px rgba(0,0,0,0.1)' : 'none',
      margin: '0 auto',
    }}>

      {/* HEADER */}
      <div style={{
        padding: '22px 28px 14px', borderBottom: '3px solid #1e3a5f',
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 18,
      }}>
        {logoSrc && (
          <img src={logoSrc} alt="Logo"
            style={{ width: 70, height: 70, objectFit: 'contain', flexShrink: 0 }} />
        )}
        <div style={{ textAlign: 'center' }}>
          <div style={{
            fontSize: 28, fontWeight: 700, color: '#1e3a5f',
            fontFamily: 'Georgia, serif', letterSpacing: 0.3, lineHeight: 1.2,
          }}>
            {church?.church_name || ''}
          </div>
          {church?.diocese && (
            <div style={{ fontSize: 11, color: '#374151', marginTop: 3 }}>
              {church.diocese}
            </div>
          )}
          <div style={{ fontSize: 10.5, color: '#6b7280', marginTop: 4, lineHeight: 1.8 }}>
            <div>
              {[church?.address, church?.city, church?.state, church?.pincode].filter(Boolean).join(' - ')}
            </div>
            <div>
              {[church?.pastor_contact, church?.pastor_email].filter(Boolean).join('  |  ')}
            </div>
          </div>
        </div>
      </div>

      {/* MEMBER DATA BAR */}
      <div style={{
        background: '#e8edf5', borderBottom: '1px solid #c7d2e8',
        textAlign: 'center', padding: '6px 0',
        fontSize: 12, fontWeight: 700, color: '#1e3a5f', letterSpacing: 1.8,
      }}>MEMBER DATA</div>

      {/* PHOTO */}
      <div style={{ display: 'flex', justifyContent: 'center', padding: '14px 40px 0' }}>
        <div style={{
          width: 95, height: 115,
          border: '1.5px solid #94a3b8', borderRadius: 4,
          overflow: 'hidden', background: '#f1f5f9',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          {photoSrc
            ? <img src={photoSrc} alt="Photo"
                style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top' }} />
            : <svg width={38} height={38} viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth={1.2}>
                <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2M12 11a4 4 0 100-8 4 4 0 000 8z"/>
              </svg>
          }
        </div>
      </div>

      {/* SECTION LABELS */}
      <div style={{ display: 'flex', padding: '8px 32px 2px', gap: 24 }}>
        {['PERSONAL DETAILS', 'CHURCH RELATED DETAILS'].map(t => (
          <div key={t} style={{ flex: 1 }}>
            <span style={{
              fontSize: 11, fontWeight: 700, color: '#1e3a5f',
              textDecoration: 'underline', fontStyle: 'italic',
            }}>{t}</span>
          </div>
        ))}
      </div>

      {/* TWO-COLUMN DATA */}
      <div style={{ display: 'flex', padding: '4px 32px 0', gap: 28, alignItems: 'flex-start' }}>

        {/* LEFT — Personal */}
        <div style={{ flex: 1 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <tbody>
              <Row label="Member ID"          value={fmt(member?.member_id)} />
              <Row label="Family ID"          value={fmt(member?.family_id)} />
              <Row label="Member Name"        value={`${member?.title ? member.title + ' ' : ''}${member?.member_name || ''}`} valueStyle={{ fontWeight: 700, fontSize: 14 }} />
              <Row label="Father's Name"      value={fmt(member?.father_name)} />
              <Row label="Address"            value={
                <span>{addressLines.map((l, i) => (
                  <span key={i}>{l}{i < addressLines.length - 1 && <br />}</span>
                ))}</span>
              } />
              <Row label="Gender"             value={fmt(member?.gender)} />
              <Row label="Aadhaar"            value={fmt(member?.aadhaar)} />
              <Row label="DoB (Actual)"       value={fmt(member?.dob_actual)} />
              <Row label="DoB (Certificate)"  value={fmt(member?.dob_certificate)} />
              <Row label="Age"                value={fmt(member?.age)} />
              <Row label="Qualification"      value={fmt(member?.qualification)} />
              <Row label="Profession"         value={fmt(member?.profession)} />
              <Row label="Working Sector"     value={fmt(member?.working_sector)} />
              <Row label="Marital Status"     value={fmt(member?.marital_status)} />
              <Row label="Date of Marriage"   value={fmt(member?.date_of_marriage)} />
              <Row label="Spouse Name"        value={fmt(member?.spouse_name)} />
              <Row label="Mobile"             value={fmt(member?.mobile)} />
              <Row label="Whatsapp"           value={fmt(member?.whatsapp)} />
              <Row label="Email ID"           value={fmt(member?.email)} />
            </tbody>
          </table>
        </div>

        {/* RIGHT — Church */}
        <div style={{ flex: 1 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <tbody>
              <Row label="First Generation Christian ?"                  value={fmt(member?.is_first_gen_christian)} />
              <Row label="Family Head ?"                                 value={fmt(member?.is_family_head)} />
              <Row label="Relationship with Family Head"                 value={fmt(member?.relationship_with_fh)} />
              <Row label="Membership Status"                             value={fmt(member?.membership_type)} />
              <Row label="If Secondary Member, Primary Church Name"      value={fmt(member?.primary_church_name)} />
              <Row label="Denomination"                                  value={fmt(member?.denomination)} />
              <Row label="Into Membership this church from"              value={fmt(member?.membership_from_year)} />
              <Row label="Baptism Type"                                  value={fmt(member?.baptism_type)} />
              <Row label="Date of Baptism"                               value={fmt(member?.baptism_date)} />
              <Row label="Confirmation Taken"                            value={fmt(member?.confirmation_taken)} />
              <Row label="Confirmation Date"                             value={fmt(member?.confirmation_date)} />
              <Row label="Is Covered Under Family Benefit Relief Fund ?" value={fmt(member?.is_fbrf_member)} />
              <Row label="Involvement in Church Activities"              value={
                activeActs.length > 0
                  ? <span>{activeActs.map((a, i) => (
                      <span key={i}>{a}{i < activeActs.length - 1 && <br />}</span>
                    ))}</span>
                  : ''
              } />
            </tbody>
          </table>
        </div>
      </div>

      {/* DECLARATION */}
      <div style={{
        textAlign: 'center', fontSize: 10.5, color: '#374151',
        fontStyle: 'italic', margin: '24px 32px 8px',
      }}>
        The above furnished information is as per the records in our church database
      </div>

      {/* SIGNATURES */}
      <div style={{
        display: 'flex', justifyContent: 'space-between',
        margin: '0 32px', padding: '65px 16px 60px',
        borderTop: '1px solid #e2e8f0',
      }}>
        {['HON. SECRETARY', 'HON. TREASURER', 'PRESBYTER'].map(s => (
          <div key={s} style={{
            fontSize: 10.5, fontWeight: 700, color: '#1e3a5f', letterSpacing: 0.5,
            paddingBottom: 35,
          }}>{s}</div>
        ))}
      </div>

    </div>
  )
}
