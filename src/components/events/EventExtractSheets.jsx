/* Shared Event Recorder extract / register sheets — same layouts as print modals.
   Used by bulk PDF export (html2canvas). Keep field names in form-shape (camelCase). */

import { MONTHS } from '../../lib/eventRecordMaps'

const BL = '#1a237e'

function Line({ label, value, wide, solid }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: solid ? 12 : 10 }}>
      <span style={{
        minWidth: wide ? 160 : (solid ? 140 : 190),
        fontSize: 11, color: BL, fontWeight: solid ? 600 : 400,
      }}>{label}</span>
      <span style={{
        flex: 1, fontSize: 11, color: BL, fontWeight: value ? 600 : 400,
        borderBottom: solid ? '1px solid #333' : '1px dotted #888',
        paddingBottom: 2, minHeight: solid ? 20 : 18,
      }}>{value || ''}</span>
    </div>
  )
}

export function BaptismExtractSheet({ form, church, certDate = '' }) {
  const seqPadded = form.seqNum ? String(form.seqNum).padStart(4, '0') : '____'
  const slNo = `${seqPadded}/${form.year}`
  const churchLine = [church?.church_name, church?.address, church?.city, church?.pincode].filter(Boolean).join(', ')
  const presbyter = church?.presbyter_name || church?.pastor_name || ''

  return (
    <div style={{
      width: 560, background: '#e8f5e9',
      fontFamily: 'Arial, sans-serif', color: BL, padding: '24px 32px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        {church?.logo_url
          ? <img src={church.logo_url} alt="" style={{ width: 64, height: 64, objectFit: 'contain' }} />
          : <div style={{ width: 64 }} />}
        <div style={{ textAlign: 'center', flex: 1, padding: '0 12px' }}>
          <div style={{ fontSize: 11, fontWeight: 700 }}>{church?.denomination || 'CHURCH OF SOUTH INDIA'}</div>
          <div style={{ fontSize: 10 }}>{church?.diocese || ''}</div>
          <div style={{ fontSize: 16, fontWeight: 800, margin: '2px 0' }}>{church?.church_name || ''}</div>
          <div style={{ fontSize: 10 }}>{[church?.address, church?.city, church?.pincode].filter(Boolean).join(', ')}</div>
        </div>
        {church?.diocese_logo_url
          ? <img src={church.diocese_logo_url} alt="" style={{ width: 64, height: 64, objectFit: 'contain' }} />
          : <div style={{ width: 64 }} />}
      </div>
      <hr style={{ borderColor: `${BL}44`, marginBottom: 10 }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12, fontSize: 11 }}>
        <span><strong>S.No.</strong> {slNo}</span>
        <span>Date : {certDate || '.....................'}</span>
      </div>
      <div style={{ textAlign: 'center', marginBottom: 14 }}>
        <div style={{ fontSize: 11, fontWeight: 700 }}>Extract of the Baptism Register kept at</div>
        <div style={{ fontSize: 11, fontWeight: 700 }}>{churchLine || '........................................'}</div>
      </div>
      <Line label="Date of Baptism" value={form.dateOfBaptism} />
      <Line label="Baptism Type" value={form.baptismType} />
      <Line label="Date of Birth" value={form.dateOfBirth} />
      <Line label="Name" value={form.name} />
      <Line label="Gender" value={form.gender} />
      <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 6, textDecoration: 'underline' }}>Parent&apos;s Name</div>
      <div style={{ paddingLeft: 24 }}>
        <Line label="Father" value={form.fatherName} />
        <Line label="Mother" value={form.motherName} />
      </div>
      <Line label="Profession of Father/Mother" value={form.professionOfParents} />
      <Line label="Place of abode/Address" value={form.address} />
      <Line label="Place of Baptism" value={form.placeOfBaptism} />
      <Line label="By Whom Baptized" value={form.baptizedBy} />
      <Line label="God Parents (if any)" value={form.godParents} />
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4 }}>
        <span style={{ minWidth: 190, fontSize: 11 }}>Remarks</span>
        <span style={{ flex: 1, borderBottom: '1px dotted #888', minHeight: 18 }}>{form.remarks || ''}</span>
      </div>
      <div style={{ borderBottom: '1px dotted #888', minHeight: 16, marginBottom: 2 }} />
      <div style={{ borderBottom: '1px dotted #888', minHeight: 16, marginBottom: 16 }} />
      <div style={{ fontSize: 10, marginBottom: 4 }}>
        I<span style={{ display: 'inline-block', minWidth: 260, borderBottom: '1px dotted #888', marginLeft: 4, marginRight: 4 }}>
          {presbyter ? ` ${presbyter} ` : ''}
        </span> Certify that this is the true extract of the Baptism
      </div>
      <div style={{ fontSize: 10, marginBottom: 20 }}>Register maintained in this Church.</div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div style={{ fontSize: 10 }}>
          <div>Place : .........................</div>
          <div style={{ marginTop: 6 }}>Date &nbsp;: .........................</div>
        </div>
        <div style={{ textAlign: 'right', fontSize: 10 }}>
          <div>Signature of the Presbyter</div>
          <div style={{ marginTop: 4 }}>Seal</div>
        </div>
      </div>
    </div>
  )
}

export function ConfirmationExtractSheet({ form, church, certDate = '' }) {
  const seqPadded = form.seqNum ? String(form.seqNum).padStart(4, '0') : '____'
  const slNo = `${seqPadded}/${form.year}`
  const churchLine = [church?.church_name, church?.address, church?.city, church?.pincode].filter(Boolean).join(', ')
  const presbyter = church?.presbyter_name || church?.pastor_name || ''

  return (
    <div style={{
      width: 560, background: '#e8f5e9',
      fontFamily: 'Arial, sans-serif', color: BL, padding: '24px 32px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        {church?.logo_url
          ? <img src={church.logo_url} alt="" style={{ width: 64, height: 64, objectFit: 'contain' }} />
          : <div style={{ width: 64 }} />}
        <div style={{ textAlign: 'center', flex: 1, padding: '0 12px' }}>
          <div style={{ fontSize: 11, fontWeight: 700 }}>{church?.denomination || 'CHURCH OF SOUTH INDIA'}</div>
          <div style={{ fontSize: 10 }}>{church?.diocese || ''}</div>
          <div style={{ fontSize: 16, fontWeight: 800, margin: '2px 0' }}>{church?.church_name || ''}</div>
          <div style={{ fontSize: 10 }}>{[church?.address, church?.city, church?.pincode].filter(Boolean).join(', ')}</div>
        </div>
        {church?.diocese_logo_url
          ? <img src={church.diocese_logo_url} alt="" style={{ width: 64, height: 64, objectFit: 'contain' }} />
          : <div style={{ width: 64 }} />}
      </div>
      <hr style={{ borderColor: `${BL}44`, marginBottom: 10 }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12, fontSize: 11 }}>
        <span><strong>S.No.</strong> {slNo}</span>
        <span>Date : {certDate || '.....................'}</span>
      </div>
      <div style={{ textAlign: 'center', marginBottom: 14 }}>
        <div style={{ fontSize: 11, fontWeight: 700 }}>Extract of the Confirmation Register kept at</div>
        <div style={{ fontSize: 11, fontWeight: 700 }}>{churchLine || '........................................'}</div>
      </div>
      <Line label="Date of Confirmation" value={form.dateOfConfirmation} />
      <Line label="Date of Birth" value={form.dateOfBirth} />
      <Line label="Name" value={form.name} />
      <Line label="Gender" value={form.gender} />
      <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 6, textDecoration: 'underline' }}>Parent&apos;s Name</div>
      <div style={{ paddingLeft: 24 }}>
        <Line label="Father" value={form.fatherName} />
        <Line label="Mother" value={form.motherName} />
      </div>
      <Line label="Place of abode / Address" value={form.address} />
      <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 6, textDecoration: 'underline' }}>Baptism Details</div>
      <div style={{ paddingLeft: 24 }}>
        <Line label="Date of Baptism" value={form.dateOfBaptism} />
        <Line label="Place of Baptism" value={form.placeOfBaptism} />
        <Line label="Baptized By" value={form.baptizedBy} />
        <Line label="Baptism Reg. No." value={form.baptismRegNo} />
      </div>
      <Line label="Place of Confirmation" value={form.placeOfConfirmation} />
      <Line label="Confirmed By" value={form.confirmedBy} />
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4 }}>
        <span style={{ minWidth: 190, fontSize: 11 }}>Remarks</span>
        <span style={{ flex: 1, borderBottom: '1px dotted #888', minHeight: 18 }}>{form.remarks || ''}</span>
      </div>
      <div style={{ borderBottom: '1px dotted #888', minHeight: 16, marginBottom: 2 }} />
      <div style={{ borderBottom: '1px dotted #888', minHeight: 16, marginBottom: 16 }} />
      <div style={{ fontSize: 10, marginBottom: 4 }}>
        I<span style={{ display: 'inline-block', minWidth: 260, borderBottom: '1px dotted #888', marginLeft: 4, marginRight: 4 }}>
          {presbyter ? ` ${presbyter} ` : ''}
        </span> Certify that this is the true extract of the Confirmation
      </div>
      <div style={{ fontSize: 10, marginBottom: 20 }}>Register maintained in this Church.</div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div style={{ fontSize: 10 }}>
          <div>Place : .........................</div>
          <div style={{ marginTop: 6 }}>Date &nbsp;: .........................</div>
        </div>
        <div style={{ textAlign: 'right', fontSize: 10 }}>
          <div>Signature of the Presbyter</div>
          <div style={{ marginTop: 4 }}>Seal</div>
        </div>
      </div>
    </div>
  )
}

export function BurialExtractSheet({ form, church, certDate = '' }) {
  const seqPadded = form.seqNum ? String(form.seqNum).padStart(4, '0') : '____'
  const slNo = `${seqPadded}/${form.year}`
  const churchName = church?.church_name || ''
  const churchAddr = [church?.address, church?.city].filter(Boolean).join(', ')
  const minister = church?.presbyter_name || church?.pastor_name || ''

  return (
    <div style={{
      width: 520, background: '#fff',
      fontFamily: 'Arial, sans-serif', color: BL, padding: '28px 36px',
    }}>
      <div style={{ textAlign: 'center', marginBottom: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          {church?.denomination || 'The Church of South India'}
        </div>
        <div style={{ fontSize: 12, fontWeight: 700, marginTop: 6, lineHeight: 1.5 }}>
          Extract from the Register of Burials kept in {churchName}{churchAddr ? `, ${churchAddr}` : ''}.
        </div>
      </div>
      <div style={{ marginBottom: 10, fontSize: 11 }}><strong>Sl. No.</strong> {slNo}</div>
      <Line label="When Died" value={form.whenDied} solid />
      <Line label="When Buried" value={form.whenBuried} solid />
      <Line label="Name of Person" value={form.name} solid />
      <div style={{ display: 'flex', gap: 24, marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flex: 1 }}>
          <span style={{ minWidth: 40, fontSize: 11, fontWeight: 600 }}>Sex</span>
          <span style={{
            flex: 1, fontSize: 11, fontWeight: form.gender ? 600 : 400,
            borderBottom: '1px solid #333', paddingBottom: 2, minHeight: 20,
          }}>{form.gender || ''}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flex: 1 }}>
          <span style={{ minWidth: 40, fontSize: 11, fontWeight: 600 }}>Age</span>
          <span style={{
            flex: 1, fontSize: 11, fontWeight: form.age ? 600 : 400,
            borderBottom: '1px solid #333', paddingBottom: 2, minHeight: 20,
          }}>{form.age || ''}</span>
        </div>
      </div>
      <Line label="Trade of Profession" value={form.profession} solid />
      <Line label="Cause of Death" value={form.causeOfDeath} solid />
      <Line label="Parents Name" value={form.parentsName} solid />
      <Line label="Spouse Name" value={form.spouseName} solid />
      <Line label="Where Buried" value={form.whereBuried} solid />
      <div style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 6 }}>
          <span style={{ minWidth: 140, fontSize: 11, fontWeight: 600 }}>Name who applied</span>
          <span style={{
            flex: 1, fontSize: 11, fontWeight: form.applicantName ? 600 : 400,
            borderBottom: '1px solid #333', paddingBottom: 2, minHeight: 20,
          }}>{form.applicantName || ''}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 6 }}>
          <span style={{ minWidth: 140, fontSize: 11, fontWeight: 600 }}>Contact No.</span>
          <span style={{
            flex: 1, fontSize: 11, fontWeight: form.applicantContact ? 600 : 400,
            borderBottom: '1px solid #333', paddingBottom: 2, minHeight: 20,
          }}>{form.applicantContact || ''}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 6 }}>
          <span style={{ minWidth: 140, fontSize: 11, fontWeight: 600 }}>Address</span>
          <span style={{
            flex: 1, fontSize: 11, fontWeight: form.applicantAddress ? 600 : 400,
            borderBottom: '1px solid #333', paddingBottom: 2, minHeight: 20,
          }}>{form.applicantAddress || ''}</span>
        </div>
      </div>
      <Line label="Signature by whom buried" value={form.buriedBy} solid />
      <div style={{ marginTop: 16, marginBottom: 20, fontSize: 10, lineHeight: 1.6 }}>
        I<span style={{ display: 'inline-block', minWidth: 220, borderBottom: '1px dotted #555', marginLeft: 4, marginRight: 4 }}>
          {minister ? ` ${minister} ` : ''}
        </span> hereby certify that the above is a true extract taken from the
        <div style={{ textAlign: 'center', fontWeight: 700, marginTop: 4 }}>
          Register of Burials kept in {churchName}{churchAddr ? `, ${churchAddr}` : ''}.
        </div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 8 }}>
        <div style={{ fontSize: 10 }}>
          <div>{church?.city || churchAddr || '.........................'}</div>
          <div style={{ marginTop: 4 }}>Date : {certDate || '.........................'}</div>
        </div>
        <div style={{ textAlign: 'right', fontSize: 10, fontWeight: 700 }}>Minister</div>
      </div>
    </div>
  )
}

/** Marriage Reg. Sch. IV Form — same layout as ScheduleIVModal */
export function ScheduleIVSheet({ form }) {
  const seqPadded = form.seqNum ? String(form.seqNum).padStart(4, '0') : '0000'
  const slNo = `${seqPadded}/${form.year}`
  const monthAbbr = form.month ? MONTHS[Number(form.month) - 1]?.substring(0, 3).toUpperCase() : ''
  const groomFull = [form.nameGroom, form.surnameGroom].filter(Boolean).join(' ').toUpperCase()
  const brideFull = [form.nameBride, form.surnameBride].filter(Boolean).join(' ').toUpperCase()
  const marriageDate = [form.day, form.month, form.year].filter(Boolean).join('/')

  const TH = {
    border: '1px solid #333', padding: '4px 5px', textAlign: 'center',
    fontWeight: 700, fontSize: 9, background: '#fff',
  }
  const TD = { border: '1px solid #333', padding: '12px 8px', verticalAlign: 'top', fontSize: 9 }
  const VT = {
    writingMode: 'vertical-rl', transform: 'rotate(180deg)',
    whiteSpace: 'nowrap', textAlign: 'center', width: 24,
  }

  return (
    <div style={{
      background: '#fff', width: '297mm', boxSizing: 'border-box',
      fontFamily: '"Times New Roman", serif', color: '#000',
    }}>
      <div style={{
        margin: '1in 0.5in 0.5in 0.5in', border: '2px solid #000', borderRadius: 3,
        padding: '0.25in 0.3in', boxSizing: 'border-box',
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', minHeight: '152mm' }}>
          <div style={{ textAlign: 'center', marginBottom: 14 }}>
            <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: '0.18em', marginBottom: 3 }}>MARRIAGE REGISTER</div>
            <div style={{ fontSize: 11, marginBottom: 3 }}>Indian Christian Marriage Act 1872</div>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 2 }}>SCHEDULE - IV</div>
            <div style={{ fontSize: 10, marginBottom: 5 }}>(Sec.32 &amp; 54)</div>
            <div style={{ fontSize: 14, fontWeight: 700 }}>
              {form.placeOfMarriage || '[CHURCH NAME, ADDRESS]'}
            </div>
          </div>

          <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
            <colgroup>
              <col style={{ width: '4%' }} />
              <col style={{ width: '3%' }} />
              <col style={{ width: '3%' }} />
              <col style={{ width: '2.5%' }} />
              <col style={{ width: '9.5%' }} />
              <col style={{ width: '7.5%' }} />
              <col style={{ width: '8%' }} />
              <col style={{ width: '6%' }} />
              <col style={{ width: '8%' }} />
              <col />
              <col style={{ width: '9%' }} />
              <col style={{ width: '7%' }} />
            </colgroup>
            <thead>
              <tr>
                <th rowSpan={2} style={TH}>NO</th>
                <th colSpan={3} style={TH}>When Married</th>
                <th colSpan={2} style={TH}>Name of Parties</th>
                <th rowSpan={2} style={TH}>Date of Birth &amp; Age</th>
                <th rowSpan={2} style={TH}>Condition</th>
                <th rowSpan={2} style={TH}>Rank or Profession</th>
                <th rowSpan={2} style={TH}>Residence at the time of Marriage</th>
                <th rowSpan={2} style={TH}>Father&apos;s name and Surname</th>
                <th rowSpan={2} style={TH}>Banns or Licensee</th>
              </tr>
              <tr>
                <th style={{ ...TH, ...VT }}>Year</th>
                <th style={{ ...TH, ...VT }}>Month</th>
                <th style={{ ...TH, ...VT }}>Day</th>
                <th style={TH}>Christian Name</th>
                <th style={TH}>Surname</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td rowSpan={2} style={{ ...TD, ...VT, textAlign: 'center', fontSize: 10, fontWeight: 700 }}>{slNo}</td>
                <td rowSpan={2} style={{ ...TD, ...VT }}>{form.year}</td>
                <td rowSpan={2} style={{ ...TD, ...VT }}>{monthAbbr}</td>
                <td rowSpan={2} style={{ ...TD, ...VT }}>{form.day}</td>
                <td style={{ ...TD, minHeight: 80, fontWeight: 700 }}>{form.nameGroom?.toUpperCase()}</td>
                <td style={{ ...TD, fontWeight: 700 }}>{form.surnameGroom?.toUpperCase()}</td>
                <td style={TD}>
                  {form.dobGroom && <div>{form.dobGroom}</div>}
                  {form.ageGroom && <div style={{ fontWeight: 700 }}>{form.ageGroom} YEARS</div>}
                </td>
                <td style={TD}>{form.conditionGroom?.toUpperCase()}</td>
                <td style={{ ...TD, fontWeight: 700 }}>{form.professionGroom?.toUpperCase()}</td>
                <td style={TD}>{form.addressGroom?.toUpperCase()}</td>
                <td style={{ ...TD, fontWeight: 700 }}>{form.fatherNameGroom?.toUpperCase()}</td>
                <td rowSpan={2} style={{
                  ...TD, textAlign: 'center', verticalAlign: 'middle', fontWeight: 700,
                  wordBreak: 'break-word', overflowWrap: 'break-word',
                }}>{form.bann?.toUpperCase()}</td>
              </tr>
              <tr>
                <td style={{ ...TD, minHeight: 80, fontWeight: 700 }}>{form.nameBride?.toUpperCase()}</td>
                <td style={{ ...TD, fontWeight: 700 }}>{form.surnameBride?.toUpperCase()}</td>
                <td style={TD}>
                  {form.dobBride && <div>{form.dobBride}</div>}
                  {form.ageBride && <div style={{ fontWeight: 700 }}>{form.ageBride} YEARS</div>}
                </td>
                <td style={TD}>{form.conditionBride?.toUpperCase()}</td>
                <td style={{ ...TD, fontWeight: 700 }}>{form.professionBride?.toUpperCase()}</td>
                <td style={TD}>{form.addressBride?.toUpperCase()}</td>
                <td style={{ ...TD, fontWeight: 700 }}>{form.fatherNameBride?.toUpperCase()}</td>
              </tr>
            </tbody>
          </table>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginTop: 32, flex: 1 }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 10, marginBottom: 4 }}>MARRIED IN THE PLACE OF :</div>
              <div style={{ fontSize: 9, marginBottom: 2 }}>(Name of the Church / Place / District)</div>
              <div style={{ fontSize: 10, fontWeight: 700, marginBottom: 16 }}>
                {form.placeOfMarriage?.toUpperCase()}
              </div>
              <div style={{ fontWeight: 700, fontSize: 10, marginBottom: 10 }}>MARRIAGE IN THE PRESENCE OF US :</div>
              {form.w1NameGroom && (
                <div style={{ marginBottom: 8 }}>
                  <div style={{ fontSize: 9 }}>NAME : <strong>{form.w1NameGroom.toUpperCase()}</strong></div>
                  {form.w1AddrGroom && <div style={{ fontSize: 9 }}>ADDRESS : {form.w1AddrGroom.toUpperCase()}</div>}
                </div>
              )}
              {form.w2NameGroom && (
                <div>
                  <div style={{ fontSize: 9 }}>NAME : <strong>{form.w2NameGroom.toUpperCase()}</strong></div>
                  {form.w2AddrGroom && <div style={{ fontSize: 9 }}>ADDRESS : {form.w2AddrGroom.toUpperCase()}</div>}
                </div>
              )}
              {form.w1NameBride && (
                <div style={{ marginTop: 8 }}>
                  <div style={{ fontSize: 9 }}>NAME : <strong>{form.w1NameBride.toUpperCase()}</strong></div>
                  {form.w1AddrBride && <div style={{ fontSize: 9 }}>ADDRESS : {form.w1AddrBride.toUpperCase()}</div>}
                </div>
              )}
              {form.w2NameBride && (
                <div style={{ marginTop: 8 }}>
                  <div style={{ fontSize: 9 }}>NAME : <strong>{form.w2NameBride.toUpperCase()}</strong></div>
                  {form.w2AddrBride && <div style={{ fontSize: 9 }}>ADDRESS : {form.w2AddrBride.toUpperCase()}</div>}
                </div>
              )}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ border: '1px solid #333', padding: '18px 18px' }}>
                <div style={{ fontWeight: 700, fontSize: 9, marginBottom: 10 }}>THIS MARRIAGE WAS SOLEMNIZED BETWEEN US</div>
                <div style={{ fontSize: 9, marginBottom: 6 }}>FULL NAME : <strong>{groomFull}</strong></div>
                <div style={{ fontSize: 9 }}>FULL NAME : <strong>{brideFull}</strong></div>
              </div>
              <div style={{ border: '1px solid #333', padding: '18px 18px' }}>
                <div style={{ fontWeight: 700, fontSize: 9, marginBottom: 10 }}>THIS MARRIAGE WAS SOLEMNIZED / AUTHORITY BY</div>
                <div style={{ fontSize: 9, marginBottom: 10 }}>SIGNATURE :</div>
                <div style={{ fontSize: 9, marginBottom: 6 }}>
                  FULLNAME : <strong>{form.solemnizedBy?.toUpperCase() || ''}</strong>
                </div>
                <div style={{ fontSize: 9, marginBottom: 6 }}>DATE : {marriageDate}</div>
                <div style={{ fontSize: 9, marginTop: 10 }}>OFFICE SEAL</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

/** Marriage Register page for one wedding — same table style as MarriageRegisterModal */
export function MarriageRegisterSheet({ form }) {
  const seqPadded = form.seqNum ? String(form.seqNum).padStart(4, '0') : '0000'
  const slNo = `${seqPadded}/${form.year}`
  const monthAbbr = form.month ? MONTHS[Number(form.month) - 1]?.slice(0, 3).toUpperCase() : ''

  const TH = {
    border: '1px solid #333', padding: '4px 5px', textAlign: 'center',
    fontWeight: 700, fontSize: 9, background: '#fff',
  }
  const TD = { border: '1px solid #333', padding: '6px 5px', verticalAlign: 'top', fontSize: 8.5 }
  const VT = {
    writingMode: 'vertical-rl', transform: 'rotate(180deg)',
    whiteSpace: 'nowrap', textAlign: 'center', width: 22,
  }

  return (
    <div style={{
      background: '#fff', width: '297mm', boxSizing: 'border-box',
      fontFamily: '"Times New Roman", serif', color: '#000',
    }}>
      <div style={{
        margin: '0.75in 0.5in', border: '2px solid #000', borderRadius: 3,
        padding: '0.25in 0.3in', boxSizing: 'border-box',
      }}>
        <div style={{ textAlign: 'center', marginBottom: 12 }}>
          <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: '0.18em', marginBottom: 3 }}>MARRIAGE REGISTER</div>
          <div style={{ fontSize: 11, marginBottom: 3 }}>Indian Christian Marriage Act 1872</div>
          <div style={{ fontSize: 10, marginBottom: 6 }}>Year: <strong>{form.year}</strong></div>
        </div>

        <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
          <colgroup>
            <col style={{ width: '5%' }} />
            <col style={{ width: '3%' }} />
            <col style={{ width: '3.5%' }} />
            <col style={{ width: '2.5%' }} />
            <col style={{ width: '9%' }} />
            <col style={{ width: '7%' }} />
            <col style={{ width: '7%' }} />
            <col style={{ width: '5.5%' }} />
            <col style={{ width: '7%' }} />
            <col />
            <col style={{ width: '8%' }} />
            <col style={{ width: '7%' }} />
          </colgroup>
          <thead>
            <tr>
              <th rowSpan={3} style={{ ...TH, ...VT }}>NO</th>
              <th colSpan={3} style={TH}>When Married</th>
              <th colSpan={2} style={TH}>Name of Parties</th>
              <th rowSpan={3} style={TH}>Date of Birth &amp; Age</th>
              <th rowSpan={3} style={TH}>Condition</th>
              <th rowSpan={3} style={TH}>Rank or Profession</th>
              <th rowSpan={3} style={TH}>Residence at the time of Marriage</th>
              <th rowSpan={3} style={TH}>Father&apos;s name and Surname</th>
              <th rowSpan={3} style={TH}>Banns or Licensee</th>
            </tr>
            <tr>
              <th style={{ ...TH, ...VT }}>Year</th>
              <th style={{ ...TH, ...VT }}>Month</th>
              <th style={{ ...TH, ...VT }}>Day</th>
              <th style={TH}>Christian Name</th>
              <th style={TH}>Surname</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={{ ...TD, ...VT, fontWeight: 700, fontSize: 8 }}>{slNo}</td>
              <td style={{ ...TD, ...VT, fontSize: 8 }}>{form.year}</td>
              <td style={{ ...TD, ...VT, fontSize: 8 }}>{monthAbbr}</td>
              <td style={{ ...TD, ...VT, fontSize: 8 }}>{form.day}</td>
              <td style={TD}>
                <div style={{ fontWeight: 700 }}>{form.nameGroom?.toUpperCase()}</div>
                <div style={{ marginTop: 4, paddingTop: 4, borderTop: '1px solid #ccc', fontWeight: 700 }}>
                  {form.nameBride?.toUpperCase()}
                </div>
              </td>
              <td style={TD}>
                <div style={{ fontWeight: 700 }}>{form.surnameGroom?.toUpperCase()}</div>
                <div style={{ marginTop: 4, paddingTop: 4, borderTop: '1px solid #ccc', fontWeight: 700 }}>
                  {form.surnameBride?.toUpperCase()}
                </div>
              </td>
              <td style={TD}>
                <div>{form.dobGroom}</div>
                {form.ageGroom && <div style={{ fontWeight: 700 }}>{form.ageGroom} YRS</div>}
                <div style={{ marginTop: 4, paddingTop: 4, borderTop: '1px solid #ccc' }}>{form.dobBride}</div>
                {form.ageBride && <div style={{ fontWeight: 700 }}>{form.ageBride} YRS</div>}
              </td>
              <td style={TD}>
                <div>{form.conditionGroom?.toUpperCase()}</div>
                <div style={{ marginTop: 4, paddingTop: 4, borderTop: '1px solid #ccc' }}>
                  {form.conditionBride?.toUpperCase()}
                </div>
              </td>
              <td style={TD}>
                <div style={{ fontWeight: 700 }}>{form.professionGroom?.toUpperCase()}</div>
                <div style={{ marginTop: 4, paddingTop: 4, borderTop: '1px solid #ccc', fontWeight: 700 }}>
                  {form.professionBride?.toUpperCase()}
                </div>
              </td>
              <td style={TD}>
                <div>{form.addressGroom?.toUpperCase()}</div>
                <div style={{ marginTop: 4, paddingTop: 4, borderTop: '1px solid #ccc' }}>
                  {form.addressBride?.toUpperCase()}
                </div>
              </td>
              <td style={TD}>
                <div style={{ fontWeight: 700 }}>{form.fatherNameGroom?.toUpperCase()}</div>
                <div style={{ marginTop: 4, paddingTop: 4, borderTop: '1px solid #ccc', fontWeight: 700 }}>
                  {form.fatherNameBride?.toUpperCase()}
                </div>
              </td>
              <td style={{ ...TD, textAlign: 'center', verticalAlign: 'middle', fontWeight: 700, wordBreak: 'break-word' }}>
                {form.bann?.toUpperCase()}
              </td>
            </tr>
          </tbody>
        </table>

        {(form.w1NameGroom || form.w1NameBride || form.solemnizedBy || form.remarks) && (
          <div style={{ marginTop: 16, fontSize: 9, lineHeight: 1.6 }}>
            {form.w1NameGroom && <div>Witness (Groom) 1: <strong>{form.w1NameGroom}</strong>{form.w1AddrGroom ? ` — ${form.w1AddrGroom}` : ''}</div>}
            {form.w2NameGroom && <div>Witness (Groom) 2: <strong>{form.w2NameGroom}</strong>{form.w2AddrGroom ? ` — ${form.w2AddrGroom}` : ''}</div>}
            {form.w1NameBride && <div>Witness (Bride) 1: <strong>{form.w1NameBride}</strong>{form.w1AddrBride ? ` — ${form.w1AddrBride}` : ''}</div>}
            {form.w2NameBride && <div>Witness (Bride) 2: <strong>{form.w2NameBride}</strong>{form.w2AddrBride ? ` — ${form.w2AddrBride}` : ''}</div>}
            {form.solemnizedBy && <div>Solemnized By: <strong>{form.solemnizedBy}</strong></div>}
            {form.remarks && <div>Remarks: {form.remarks}</div>}
          </div>
        )}
      </div>
    </div>
  )
}
