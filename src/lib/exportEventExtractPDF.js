/* ═══════════════════════════════════════════════════════════════
   exportEventExtractPDF.js — Sacramental register extract PDFs
   Baptism / Confirmation / Burial: A5 portrait
   Wedding (Schedule IV style): A4 landscape
   ═══════════════════════════════════════════════════════════════ */

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

const BL = [26, 35, 126] // #1a237e

function slNo(seq, year) {
  return `${String(seq ?? '').padStart(4, '0')}/${year ?? ''}`
}

function safeName(s) {
  return String(s || 'record')
    .replace(/[\\/:*?"<>|]+/g, '_')
    .replace(/\s+/g, '_')
    .slice(0, 60)
}

function churchHeaderLines(church) {
  return {
    denomination: church?.denomination || 'CHURCH OF SOUTH INDIA',
    diocese: church?.diocese || '',
    name: church?.church_name || '',
    address: [church?.address, church?.city, church?.pincode].filter(Boolean).join(', '),
    line: [church?.church_name, church?.address, church?.city, church?.pincode].filter(Boolean).join(', '),
    minister: church?.presbyter_name || church?.pastor_name || '',
  }
}

async function loadJsPDF() {
  const { jsPDF } = await import('jspdf')
  return jsPDF
}

/** Draw dotted label/value rows; returns next Y. */
function drawLines(doc, rows, startY, opts = {}) {
  const {
    left = 14,
    labelW = 52,
    pageW = 148,
    right = 14,
    gap = 7.2,
    color = BL,
  } = opts
  let y = startY
  doc.setTextColor(...color)
  for (const { label, value, indent = 0 } of rows) {
    const lx = left + indent
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.text(label, lx, y)
    const vx = lx + labelW
    const maxW = pageW - right - vx
    const text = value ? String(value) : ''
    doc.setFont('helvetica', text ? 'bold' : 'normal')
    const lines = text ? doc.splitTextToSize(text, maxW) : ['']
    doc.text(lines[0] || '', vx, y)
    const underY = y + 1.2
    doc.setDrawColor(150)
    doc.setLineWidth(0.2)
    doc.line(vx, underY, pageW - right, underY)
    for (let i = 1; i < lines.length; i++) {
      y += 4.2
      doc.text(lines[i], vx, y)
      doc.line(vx, y + 1.2, pageW - right, y + 1.2)
    }
    y += gap
  }
  return y
}

function drawCertChrome(doc, church, title, sl, pageW) {
  const h = churchHeaderLines(church)
  let y = 14
  doc.setTextColor(...BL)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.text(h.denomination, pageW / 2, y, { align: 'center' })
  y += 4.5
  if (h.diocese) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.text(h.diocese, pageW / 2, y, { align: 'center' })
    y += 4.5
  }
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  doc.text(h.name || 'Church', pageW / 2, y, { align: 'center' })
  y += 4.5
  if (h.address) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.text(h.address, pageW / 2, y, { align: 'center' })
    y += 5
  }
  doc.setDrawColor(...BL)
  doc.setLineWidth(0.3)
  doc.line(14, y, pageW - 14, y)
  y += 7
  doc.setFontSize(9)
  doc.setFont('helvetica', 'bold')
  doc.text(`S.No. ${sl}`, 14, y)
  doc.setFont('helvetica', 'normal')
  doc.text('Date : .....................', pageW - 14, y, { align: 'right' })
  y += 8
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.text(title, pageW / 2, y, { align: 'center' })
  y += 4.5
  const keptAt = h.line || '........................................'
  const keptLines = doc.splitTextToSize(keptAt, pageW - 28)
  doc.text(keptLines, pageW / 2, y, { align: 'center' })
  y += keptLines.length * 4 + 6
  return { y, minister: h.minister }
}

function drawFooter(doc, y, pageW, minister) {
  doc.setTextColor(...BL)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  const cert = `I${minister ? ` ${minister} ` : ' ..................... '}Certify that this is the true extract of the Register maintained in this Church.`
  const lines = doc.splitTextToSize(cert, pageW - 28)
  doc.text(lines, 14, y)
  y += lines.length * 4 + 10
  doc.text('Place : .........................', 14, y)
  doc.text('Signature of the Presbyter', pageW - 14, y, { align: 'right' })
  y += 5
  doc.text('Date  : .........................', 14, y)
  doc.text('Seal', pageW - 14, y, { align: 'right' })
}

export function eventPdfFileName(kind, record) {
  const sn = slNo(record.seq_num, record.year).replace('/', '-')
  if (kind === 'wedding') {
    const who = [record.name_groom, record.name_bride].filter(Boolean).join('_and_')
    return `${sn}_${safeName(who || 'wedding')}.pdf`
  }
  return `${sn}_${safeName(record.name)}.pdf`
}

export async function exportBaptismExtractPDF(record, church) {
  const jsPDF = await loadJsPDF()
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a5' })
  const PW = 148
  const sl = slNo(record.seq_num, record.year)
  const { y: y0, minister } = drawCertChrome(
    doc, church, 'Extract of the Baptism Register kept at', sl, PW,
  )
  // light green tint hint via rect border
  doc.setDrawColor(200, 230, 201)
  doc.setLineWidth(0.8)
  doc.rect(6, 6, PW - 12, 210 - 12)

  let y = drawLines(doc, [
    { label: 'Date of Baptism', value: record.date_of_baptism },
    { label: 'Baptism Type', value: record.baptism_type },
    { label: 'Date of Birth', value: record.date_of_birth },
    { label: 'Name', value: record.name },
    { label: 'Gender', value: record.gender },
    { label: "Father's Name", value: record.father_name },
    { label: "Mother's Name", value: record.mother_name },
    { label: 'Profession of Parents', value: record.profession_of_parents },
    { label: 'Address', value: record.address },
    { label: 'Place of Baptism', value: record.place_of_baptism },
    { label: 'By Whom Baptized', value: record.baptized_by },
    { label: 'God Parents', value: record.god_parents },
    { label: 'Remarks', value: record.remarks },
  ], y0, { pageW: PW })

  drawFooter(doc, Math.max(y + 4, 170), PW, minister)
  return doc.output('blob')
}

export async function exportConfirmationExtractPDF(record, church) {
  const jsPDF = await loadJsPDF()
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a5' })
  const PW = 148
  const sl = slNo(record.seq_num, record.year)
  const { y: y0, minister } = drawCertChrome(
    doc, church, 'Extract of the Confirmation Register kept at', sl, PW,
  )
  doc.setDrawColor(200, 230, 201)
  doc.setLineWidth(0.8)
  doc.rect(6, 6, PW - 12, 210 - 12)

  let y = drawLines(doc, [
    { label: 'Date of Confirmation', value: record.date_of_confirmation },
    { label: 'Date of Birth', value: record.date_of_birth },
    { label: 'Name', value: record.name },
    { label: 'Gender', value: record.gender },
    { label: "Father's Name", value: record.father_name },
    { label: "Mother's Name", value: record.mother_name },
    { label: 'Address', value: record.address },
    { label: 'Date of Baptism', value: record.date_of_baptism },
    { label: 'Place of Baptism', value: record.place_of_baptism },
    { label: 'Baptized By', value: record.baptized_by },
    { label: 'Baptism Reg. No.', value: record.baptism_reg_no },
    { label: 'Place of Confirmation', value: record.place_of_confirmation },
    { label: 'Confirmed By', value: record.confirmed_by },
    { label: 'Remarks', value: record.remarks },
  ], y0, { pageW: PW })

  drawFooter(doc, Math.max(y + 2, 168), PW, minister)
  return doc.output('blob')
}

export async function exportBurialExtractPDF(record, church) {
  const jsPDF = await loadJsPDF()
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a5' })
  const PW = 148
  const h = churchHeaderLines(church)
  const sl = slNo(record.seq_num, record.year)

  let y = 16
  doc.setTextColor(...BL)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.text(h.denomination, PW / 2, y, { align: 'center' })
  y += 7
  doc.setFontSize(9)
  const title = `Extract from the Register of Burials kept in ${h.name}${h.address ? `, ${h.address}` : ''}.`
  const titleLines = doc.splitTextToSize(title, PW - 28)
  doc.text(titleLines, PW / 2, y, { align: 'center' })
  y += titleLines.length * 4.2 + 8
  doc.setFontSize(9)
  doc.text(`Sl. No. ${sl}`, 14, y)
  y += 8

  y = drawLines(doc, [
    { label: 'When Died', value: record.when_died },
    { label: 'When Buried', value: record.when_buried },
    { label: 'Name of Person', value: record.name },
    { label: 'Sex', value: record.gender },
    { label: 'Age', value: record.age },
    { label: 'Trade or Profession', value: record.profession },
    { label: 'Cause of Death', value: record.cause_of_death },
    { label: 'Parents Name', value: record.parents_name },
    { label: 'Spouse Name', value: record.spouse_name },
    { label: 'Where Buried', value: record.where_buried },
    { label: 'Name who applied', value: record.applicant_name },
    { label: 'Contact', value: record.applicant_contact },
    { label: 'Address', value: record.applicant_address },
    { label: 'Buried By', value: record.buried_by },
    { label: 'Remarks', value: record.remarks },
  ], y, { pageW: PW, labelW: 48 })

  drawFooter(doc, Math.max(y + 2, 168), PW, h.minister)
  return doc.output('blob')
}

export async function exportWeddingExtractPDF(record, church) {
  const jsPDF = await loadJsPDF()
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  const PW = 297
  const h = churchHeaderLines(church)
  const sn = slNo(record.seq_num, record.year)
  const monthAbbr = record.month ? (MONTHS[record.month - 1] || '').slice(0, 3).toUpperCase() : ''
  const place = record.place_of_marriage || h.name || '[CHURCH NAME]'

  let y = 14
  doc.setFont('times', 'bold')
  doc.setFontSize(16)
  doc.text('MARRIAGE REGISTER', PW / 2, y, { align: 'center' })
  y += 6
  doc.setFont('times', 'normal')
  doc.setFontSize(9)
  doc.text('Indian Christian Marriage Act 1872', PW / 2, y, { align: 'center' })
  y += 5
  doc.setFont('times', 'bold')
  doc.setFontSize(11)
  doc.text('SCHEDULE - IV', PW / 2, y, { align: 'center' })
  y += 4.5
  doc.setFont('times', 'normal')
  doc.setFontSize(8)
  doc.text('(Sec.32 & 54)', PW / 2, y, { align: 'center' })
  y += 5
  doc.setFont('times', 'bold')
  doc.setFontSize(11)
  doc.text(place, PW / 2, y, { align: 'center' })
  y += 8

  const headers = ['NO', 'Year', 'Mon', 'Day', 'Christian Name', 'Surname', 'DOB & Age', 'Condition', 'Profession', 'Residence', "Father's Name", 'Banns']
  const colW = [16, 12, 12, 10, 28, 22, 24, 20, 24, 40, 28, 22]
  const left = (PW - colW.reduce((a, b) => a + b, 0)) / 2
  const rowH = 28

  // header row
  doc.setFillColor(245, 245, 245)
  doc.setDrawColor(0)
  doc.setLineWidth(0.25)
  let x = left
  doc.setFont('times', 'bold')
  doc.setFontSize(7)
  for (let i = 0; i < headers.length; i++) {
    doc.rect(x, y, colW[i], 8)
    doc.text(headers[i], x + colW[i] / 2, y + 5, { align: 'center' })
    x += colW[i]
  }
  y += 8

  const groomName = (record.name_groom || '').toUpperCase()
  const brideName = (record.name_bride || '').toUpperCase()
  const cells = [
    sn,
    String(record.year || ''),
    monthAbbr,
    String(record.day || ''),
    `${groomName}\n——\n${brideName}`,
    `${(record.surname_groom || '').toUpperCase()}\n——\n${(record.surname_bride || '').toUpperCase()}`,
    `${record.dob_groom || ''}${record.age_groom ? `\n${record.age_groom} YRS` : ''}\n——\n${record.dob_bride || ''}${record.age_bride ? `\n${record.age_bride} YRS` : ''}`,
    `${(record.condition_groom || '').toUpperCase()}\n——\n${(record.condition_bride || '').toUpperCase()}`,
    `${(record.profession_groom || '').toUpperCase()}\n——\n${(record.profession_bride || '').toUpperCase()}`,
    `${(record.address_groom || '').toUpperCase()}\n——\n${(record.address_bride || '').toUpperCase()}`,
    `${(record.father_name_groom || '').toUpperCase()}\n——\n${(record.father_name_bride || '').toUpperCase()}`,
    (record.bann || '').toUpperCase(),
  ]

  x = left
  doc.setFont('times', 'normal')
  doc.setFontSize(6.5)
  for (let i = 0; i < cells.length; i++) {
    doc.rect(x, y, colW[i], rowH)
    const lines = doc.splitTextToSize(cells[i], colW[i] - 2)
    doc.text(lines, x + colW[i] / 2, y + 4, { align: 'center' })
    x += colW[i]
  }
  y += rowH + 10

  // Witnesses / ceremony
  doc.setFont('times', 'bold')
  doc.setFontSize(9)
  doc.text('Witnesses & Ceremony', left, y)
  y += 6
  doc.setFont('times', 'normal')
  doc.setFontSize(8)
  const extras = [
    `Groom Witness 1: ${record.w1_name_groom || '—'}  (${record.w1_addr_groom || '—'})`,
    `Groom Witness 2: ${record.w2_name_groom || '—'}  (${record.w2_addr_groom || '—'})`,
    `Bride Witness 1: ${record.w1_name_bride || '—'}  (${record.w1_addr_bride || '—'})`,
    `Bride Witness 2: ${record.w2_name_bride || '—'}  (${record.w2_addr_bride || '—'})`,
    `Solemnized By: ${record.solemnized_by || '—'}`,
    `Remarks: ${record.remarks || '—'}`,
  ]
  for (const line of extras) {
    const wrapped = doc.splitTextToSize(line, PW - left * 2)
    doc.text(wrapped, left, y)
    y += wrapped.length * 4 + 1.5
  }

  y += 8
  doc.text(`I ${h.minister || '.....................'} certify that this is a true extract of the Marriage Register.`, left, y)
  y += 10
  doc.text('Signature of the Presbyter ______________________', left, y)
  doc.text('Seal', PW - left, y, { align: 'right' })

  return doc.output('blob')
}

export async function exportEventExtractPDF(kind, record, church) {
  switch (kind) {
    case 'baptism': return exportBaptismExtractPDF(record, church)
    case 'confirmation': return exportConfirmationExtractPDF(record, church)
    case 'burial': return exportBurialExtractPDF(record, church)
    case 'wedding': return exportWeddingExtractPDF(record, church)
    default: throw new Error(`Unknown event kind: ${kind}`)
  }
}
