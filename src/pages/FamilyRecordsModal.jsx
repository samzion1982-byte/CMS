import { useState, useEffect } from 'react'
import ReactDOM from 'react-dom'
import { X, FileDown, Loader2, Printer, Users, ChevronRight, ChevronLeft, Check, FileText } from 'lucide-react'
import { supabase, adminSupabase } from '../lib/supabase'
import { useToast } from '../lib/toast'
import { formatDate } from '../lib/date'
import { jsPDF } from 'jspdf'
import JSZip from 'jszip'

const BUCKET_NAME = 'family-records'
const MAX_REMOVE_BATCH = 100

function getFinancialYear() {
  const now = new Date()
  const y = now.getFullYear()
  // Financial year: April (month 3) to March
  return now.getMonth() >= 3 ? `${y}-${String(y + 1).slice(-2)}` : `${y - 1}-${String(y).slice(-2)}`
}

function formatMobile(raw) {
  if (!raw) return ''
  const digits = String(raw).replace(/\D/g, '')
  if (digits.length === 12 && digits.startsWith('91')) return `+91-${digits.slice(2)}`
  if (digits.length === 11 && digits.startsWith('0')) return `+91-${digits.slice(1)}`
  if (digits.length === 10) return `+91-${digits}`
  return raw
}

function getAge(dob) {
  if (!dob) return ''
  const d = new Date(dob)
  if (Number.isNaN(d.getTime())) return ''
  const now = new Date()
  let age = now.getFullYear() - d.getFullYear()
  if (now.getMonth() < d.getMonth() || (now.getMonth() === d.getMonth() && now.getDate() < d.getDate())) {
    age -= 1
  }
  return age
}

async function loadImageAsDataUrl(url) {
  if (!url) return null
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const blob = await res.blob()
    return await new Promise(resolve => {
      const reader = new FileReader()
      reader.onloadend = () => resolve(reader.result)
      reader.onerror = () => resolve(null)
      reader.readAsDataURL(blob)
    })
  } catch {
    return null
  }
}

function getImageType(dataUrl) {
  if (!dataUrl || typeof dataUrl !== 'string') return 'PNG'
  const match = dataUrl.match(/^data:image\/([a-zA-Z0-9+-]+);base64,/) || []
  return (match[1] || 'png').toUpperCase()
}

async function resolveMemberPhoto(memberId) {
  if (!memberId) return null
  const extCandidates = ['jpg', 'jpeg', 'png', 'webp']
  for (const ext of extCandidates) {
    const path = `active/${memberId}.${ext}`
    const { data: blob, error } = await supabase.storage.from('member-photos').download(path)
    if (!error && blob) {
      return await new Promise(resolve => {
        const reader = new FileReader()
        reader.onloadend = () => resolve(reader.result)
        reader.onerror = () => resolve(null)
        reader.readAsDataURL(blob)
      })
    }
    const { data } = supabase.storage.from('member-photos').getPublicUrl(path)
    if (data?.publicUrl) {
      const loaded = await loadImageAsDataUrl(data.publicUrl)
      if (loaded) return loaded
    }
  }
  return null
}

async function compressDataUrl(dataUrl, maxDimPx = 150, quality = 0.65) {
  if (!dataUrl || !dataUrl.startsWith('data:image')) return dataUrl
  const isPng = dataUrl.startsWith('data:image/png')
  return new Promise(resolve => {
    const img = new Image()
    img.onload = () => {
      const scale = Math.min(1, maxDimPx / Math.max(img.width, img.height, 1))
      const w = Math.max(1, Math.round(img.width * scale))
      const h = Math.max(1, Math.round(img.height * scale))
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')
      if (!isPng) {
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, w, h)
      }
      ctx.drawImage(img, 0, 0, w, h)
      resolve(isPng ? canvas.toDataURL('image/png') : canvas.toDataURL('image/jpeg', quality))
    }
    img.onerror = () => resolve(dataUrl)
    img.src = dataUrl
  })
}

async function roundCornersDataUrl(dataUrl, radiusFraction = 0.1) {
  if (!dataUrl || !dataUrl.startsWith('data:image')) return dataUrl
  return new Promise(resolve => {
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = img.width
      canvas.height = img.height
      const ctx = canvas.getContext('2d')
      const r = Math.min(img.width, img.height) * radiusFraction
      ctx.beginPath()
      if (ctx.roundRect) {
        ctx.roundRect(0, 0, img.width, img.height, r)
      } else {
        ctx.moveTo(r, 0); ctx.lineTo(img.width - r, 0)
        ctx.arcTo(img.width, 0, img.width, r, r)
        ctx.lineTo(img.width, img.height - r)
        ctx.arcTo(img.width, img.height, img.width - r, img.height, r)
        ctx.lineTo(r, img.height)
        ctx.arcTo(0, img.height, 0, img.height - r, r)
        ctx.lineTo(0, r); ctx.arcTo(0, 0, r, 0, r)
        ctx.closePath()
      }
      ctx.clip()
      ctx.drawImage(img, 0, 0)
      resolve(canvas.toDataURL('image/png'))
    }
    img.onerror = () => resolve(dataUrl)
    img.src = dataUrl
  })
}

// ── PDF layout (landscape A4: 297 × 210 mm) ─────────────────────────────────
function buildPdfContent(doc, church, family, rows, watermark, headPhoto) {
  const margin = 19.05
  const topMargin = 20
  const bottomMargin = 15
  const pw = doc.internal.pageSize.getWidth()   // 297
  const ph = doc.internal.pageSize.getHeight()  // 210
  const lh = 5.5
  const NAVY = [15, 30, 90]

  // ── Pre-compute layout for dynamic row height ────────────────────────────
  const parts = family.address_parts?.length ? family.address_parts : [family.address].filter(Boolean)
  const addrRows = Math.max(parts.length, 2)
  const infoTop = topMargin + 33
  const addrTop = infoTop + lh * 3 + 2
  const conY = addrTop + addrRows * lh + 3
  const d3Y = conY + lh + 2
  const colHdrH = 9
  const tTitleY = d3Y + 4
  const tHdrY = tTitleY + 3
  const tableStartY = tHdrY + colHdrH
  const maxDeclY = ph - bottomMargin - 28
  const footerStart = maxDeclY - 3
  const rowH = Math.min(6, Math.max(4.5, (footerStart - tableStartY) / Math.max(rows.length, 1)))

  // White background
  doc.setFillColor(255, 255, 255)
  doc.rect(0, 0, pw, ph, 'F')

  // Outer border – navy
  doc.setDrawColor(...NAVY)
  doc.setLineWidth(0.4)
  doc.rect(margin, topMargin, pw - margin * 2, ph - topMargin - bottomMargin)

  // Watermark
  if (watermark) {
    try {
      doc.setGState(new doc.GState({ opacity: 0.07 }))
      const w = 90
      doc.addImage(watermark, getImageType(watermark), (pw - w) / 2, (ph - w) / 2, w, w)
      doc.setGState(new doc.GState({ opacity: 1 }))
    } catch {}
  }

  // ── HEADER ──────────────────────────────────────────────────────────────────
  const logoMaxSize = 18
  const logoAreaY = topMargin
  const logoAreaH = 27
  const fitLogo = (imgData, imgType, anchorRight) => {
    try {
      const props = doc.getImageProperties(imgData)
      const ratio = props.width / props.height
      const lw = ratio >= 1 ? logoMaxSize : logoMaxSize * ratio
      const lh = ratio >= 1 ? logoMaxSize / ratio : logoMaxSize
      const ly = logoAreaY + (logoAreaH - lh) / 2
      const lx = anchorRight ? pw - margin - lw - 6 : margin + 6
      doc.addImage(imgData, imgType, lx, ly, lw, lh)
    } catch {}
  }
  if (church?.logo_data_url) fitLogo(church.logo_data_url, getImageType(church.logo_data_url), false)
  if (church?.diocese_logo_data_url) fitLogo(church.diocese_logo_data_url, getImageType(church.diocese_logo_data_url), true)

  doc.setFont('times', 'bold')
  doc.setFontSize(18.5)
  doc.setTextColor(...NAVY)
  if (church?.church_name) {
    doc.text(church.church_name, pw / 2, topMargin + 11, { align: 'center' })
  }

  const subtitleParts = [church?.address, church?.city, church?.state, church?.pincode].filter(Boolean)
  const subtitleText = subtitleParts.length > 0 ? subtitleParts.join(', ') : (church?.diocese || '')
  if (subtitleText) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(70, 90, 140)
    doc.text(subtitleText, pw / 2, topMargin + 17, { align: 'center' })
  }

  // "Family Card" red pill badge
  const badgeW = 40, badgeH = 6.5
  const badgeX = (pw - badgeW) / 2, badgeY = topMargin + 19
  doc.setFillColor(185, 28, 28)
  doc.roundedRect(badgeX, badgeY, badgeW, badgeH, 1.5, 1.5, 'F')
  doc.setFont('helvetica', 'bolditalic')
  doc.setFontSize(9)
  doc.setTextColor(255, 255, 255)
  doc.text('Family Card', pw / 2, badgeY + 4.5, { align: 'center' })

  // Header divider
  doc.setDrawColor(...NAVY)
  doc.setLineWidth(0.3)
  doc.line(margin, topMargin + 27, pw - margin, topMargin + 27)

  // ── INFO SECTION ─────────────────────────────────────────────────────────────
  const c1L = margin + 2
  const c1V = margin + 38
  const c2L = 160
  const c2V = c2L + 30
  const photoW = 18, photoH = 22
  const photoX = pw - margin - photoW - 6
  const photoY = infoTop

  doc.setFontSize(8)

  if (headPhoto) {
    try {
      doc.addImage(headPhoto, 'PNG', photoX, photoY, photoW, photoH)
      // Thin grey border with rounded corners
      doc.setDrawColor(160, 160, 160)
      doc.setLineWidth(0.3)
      doc.roundedRect(photoX, photoY, photoW, photoH, 2, 2, 'S')
    } catch {}
  }

  const lbl = (t, x, y) => {
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...NAVY)
    doc.text(t, x, y)
  }
  const val = (t, x, y) => {
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(20, 20, 20)
    doc.text(String(t ?? ''), x, y)
  }
  const valBold = (t, x, y) => {
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(20, 20, 20)
    doc.text(String(t ?? ''), x, y)
  }

  lbl('Card Serial No.', c1L, infoTop);           valBold(': ' + (family.serial_no || '-'), c1V, infoTop)
  lbl('Year', c2L, infoTop);                      val(': ' + getFinancialYear(), c2V, infoTop)
  lbl('Family ID', c1L, infoTop + lh);            val(': ' + (family.family_id || '-'), c1V, infoTop + lh)
  lbl('Family Head Name', c1L, infoTop + lh * 2); valBold(': ' + (family.head_name || '-'), c1V, infoTop + lh * 2)
  lbl('Family Head ID', c2L, infoTop + lh * 2);   val(': ' + (family.head_member_id || '-'), c2V, infoTop + lh * 2)

  lbl('Address', c1L, addrTop)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(20, 20, 20)
  parts.forEach((p, i) => doc.text((i === 0 ? ': ' : '  ') + p, c1V, addrTop + lh * i))

  lbl('Membership', c2L, addrTop);                val(': ' + (family.membership || '-'), c2V, addrTop)
  lbl('FBRF', c2L, addrTop + lh * 2);             val(': ' + (family.fbrf || 'No'), c2V, addrTop + lh * 2)
  doc.setFont('helvetica', 'italic'); doc.setFontSize(6.5); doc.setTextColor(100, 116, 139)
  doc.text('Family Benefit Relief Fund', c2L, addrTop + lh * 3)
  doc.setFontSize(8); doc.setTextColor(0, 0, 0)

  lbl('Contact No.', c1L, conY); val(': ' + (family.contact ? formatMobile(family.contact) : '-'), c1V, conY)
  lbl('Email ID', c2L, conY);    val(': ' + (family.email || ''), c2V, conY)

  // Section divider
  doc.setDrawColor(...NAVY); doc.setLineWidth(0.25)
  doc.line(margin, d3Y, pw - margin, d3Y)

  // ── TABLE ────────────────────────────────────────────────────────────────────
  const columns = [
    { label: 'S.No',                   width: 8  },
    { label: 'Member\nID',             width: 16 },
    { label: "Member's\nName",         width: 36 },
    { label: 'Relationship\nwith FH',  width: 18 },
    { label: 'DoB',                    width: 15 },
    { label: 'Age',                    width: 8  },
    { label: 'DoM',                    width: 15 },
    { label: 'Qualification',          width: 23 },
    { label: 'Profession',             width: 24 },
    { label: 'Mobile No.',             width: 24 },
    { label: 'Baptism\nStatus',        width: 14 },
    { label: 'Baptism\nDate',          width: 16 },
    { label: 'Confirmation\nStatus',   width: 16 },
    { label: 'Confirmation\nDate',     width: 15 },
  ]

  const totalW = columns.reduce((s, c) => s + c.width, 0)
  const tX = margin + ((pw - margin * 2) - totalW) / 2

  const drawColHeaders = startY => {
    doc.setFillColor(...NAVY)
    doc.rect(tX, startY, totalW, colHdrH, 'F')
    doc.setFont('helvetica', 'bold'); doc.setFontSize(6.5)
    doc.setTextColor(255, 255, 255)
    let cx = tX
    columns.forEach(col => {
      doc.setDrawColor(40, 60, 120); doc.setLineWidth(0.2)
      doc.rect(cx, startY, col.width, colHdrH)
      const lines = col.label.split('\n')
      if (lines.length === 2) {
        doc.text(lines[0], cx + col.width / 2, startY + 3.3, { align: 'center' })
        doc.text(lines[1], cx + col.width / 2, startY + 6.5, { align: 'center' })
      } else {
        doc.text(lines[0], cx + col.width / 2, startY + 5, { align: 'center' })
      }
      cx += col.width
    })
    doc.setTextColor(0, 0, 0)
  }

  doc.setFont('times', 'bolditalic'); doc.setFontSize(10)
  doc.setTextColor(...NAVY)
  doc.text('Family Members Detail', tX + totalW / 2, tTitleY, { align: 'center' })

  drawColHeaders(tHdrY)

  let rowY = tableStartY
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7)

  rows.forEach((member, idx) => {
    if (rowY + rowH > footerStart) {
      doc.addPage()
      doc.setFillColor(255, 255, 255); doc.rect(0, 0, pw, ph, 'F')
      doc.setDrawColor(...NAVY); doc.setLineWidth(0.4)
      doc.rect(margin, topMargin, pw - margin * 2, ph - topMargin - bottomMargin)
      rowY = topMargin + 12
      drawColHeaders(rowY)
      rowY += colHdrH
      doc.setFont('helvetica', 'normal'); doc.setFontSize(7)
    }

    const cells = [
      String(idx + 1),
      member.member_id || '',
      member.member_name || '',
      member.relationship_with_fh || '',
      formatDate(member.dob_actual || member.dob_certificate || ''),
      String(getAge(member.dob_actual || member.dob_certificate || '') ?? ''),
      formatDate(member.date_of_marriage || ''),
      member.qualification || '',
      member.profession || '',
      formatMobile(member.mobile),
      member.baptism_status != null ? (member.baptism_status ? 'Yes' : 'No') : '-',
      formatDate(member.baptism_date || ''),
      member.confirmation_status != null ? (member.confirmation_status ? 'Yes' : 'No') : '-',
      formatDate(member.confirmation_date || ''),
    ]

    let cx = tX
    cells.forEach((text, ci) => {
      doc.setDrawColor(...NAVY); doc.setLineWidth(0.1)
      doc.rect(cx, rowY, columns[ci].width, rowH)
      if (text) {
        doc.setTextColor(20, 20, 20)
        const isNameCol = ci === 2
        const x = isNameCol ? cx + 1.5 : cx + columns[ci].width / 2
        const align = isNameCol ? 'left' : 'center'
        doc.text(text, x, rowY + rowH * 0.65, { align })
      }
      cx += columns[ci].width
    })
    rowY += rowH
  })

  // Outer table border
  doc.setDrawColor(...NAVY); doc.setLineWidth(0.3)
  doc.rect(tX, tHdrY, totalW, rowY - tHdrY)

  // ── FOOTER ───────────────────────────────────────────────────────────────────
  const declY = Math.min(maxDeclY, rowY + 12)
  const declBody = 'The particulars given above are true to the best of my knowledge. I hereby authorise the pastorate to use any of these particulars for church use.'
  doc.setFont('helvetica', 'bold'); doc.setFontSize(8)
  doc.setTextColor(...NAVY)
  doc.text('Declaration :', margin + 6, declY)
  doc.setFont('helvetica', 'italic'); doc.setFontSize(8)
  doc.setTextColor(40, 40, 40)
  const declLines = doc.splitTextToSize(declBody, pw - margin * 2 - 28.5)
  declLines.forEach((line, i) => doc.text(line, margin + 22.5, declY + 4.5 + i * 4.2))

  // Signature label only – no line above
  const sigY = declY + 4.5 + declLines.length * 4.2 + 10
  doc.setFont('helvetica', 'bold'); doc.setFontSize(8)
  doc.setTextColor(...NAVY)
  doc.text('Family Head Signature', pw - margin - 8, sigY, { align: 'right' })
}

async function ensureBucketExists() {
  const { data, error } = await adminSupabase.storage.getBucket(BUCKET_NAME)
  if (error) {
    const { data: created, error: createError } = await adminSupabase.storage.createBucket(BUCKET_NAME, { public: true })
    if (createError) throw createError
    return created
  }
  return data
}

async function flushBucket() {
  const { data: objects, error: listError } = await adminSupabase.storage.from(BUCKET_NAME).list('', { limit: 1000, offset: 0, sortBy: { column: 'name', order: 'asc' } })
  if (listError) throw new Error(listError.message)
  if (!objects?.length) return
  const chunks = []
  for (let i = 0; i < objects.length; i += MAX_REMOVE_BATCH) {
    chunks.push(objects.slice(i, i + MAX_REMOVE_BATCH).map(obj => obj.name))
  }
  for (const chunk of chunks) {
    const { error: removeError } = await adminSupabase.storage.from(BUCKET_NAME).remove(chunk)
    if (removeError) throw new Error(removeError.message)
  }
}

export default function FamilyRecordsModal({ onClose }) {
  const toast = useToast()
  const [mode, setMode] = useState('generate')
  const [families, setFamilies] = useState([])
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [storageFiles, setStorageFiles] = useState([])
  const [selectedStorageIds, setSelectedStorageIds] = useState(new Set())
  const [availHighlight, setAvailHighlight] = useState(new Set())
  const [selHighlight, setSelHighlight] = useState(new Set())
  const [loadingFamilies, setLoadingFamilies] = useState(true)
  const [loadingFiles, setLoadingFiles] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [progress, setProgress] = useState({ current: 0, total: 0, name: '' })
  const [church, setChurch] = useState(null)
  const [watermarkUrl, setWatermarkUrl] = useState(null)

  useEffect(() => {
    const init = async () => {
      setLoadingFamilies(true)
      const { data, error } = await supabase
        .from('members')
        .select('family_id, member_id, member_name, relationship_with_fh, is_family_head, title')
        .eq('is_active', true)
        .order('family_id', { ascending: true })
        .order('member_id', { ascending: true })

      if (error) {
        toast('Unable to load families: ' + error.message, 'error')
        setLoadingFamilies(false)
        return
      }

      const familiesMap = new Map()
      data.forEach(row => {
        if (!row.family_id) return
        if (!familiesMap.has(row.family_id)) {
          familiesMap.set(row.family_id, {
            family_id: row.family_id,
            head_name: row.is_family_head ? `${row.title || ''} ${row.member_name || ''}`.trim() : '',
            member_count: 0,
            members: []
          })
        }
        const entry = familiesMap.get(row.family_id)
        entry.member_count += 1
        if (!entry.head_name && row.is_family_head) {
          entry.head_name = `${row.title || ''} ${row.member_name || ''}`.trim()
        }
        entry.members.push(row)
      })

      const familyList = [...familiesMap.values()].map(item => ({
        ...item,
        head_name: item.head_name || item.members[0]?.member_name || '—',
      }))

      setFamilies(familyList)
      setLoadingFamilies(false)
    }
    init()
  }, [toast])

  useEffect(() => {
    if (mode !== 'print') return
    const loadStorage = async () => {
      setLoadingFiles(true)
      try {
        await ensureBucketExists()
        const { data, error } = await adminSupabase.storage.from(BUCKET_NAME).list('', { limit: 1000, offset: 0, sortBy: { column: 'name', order: 'asc' } })
        if (error) {
          toast('Unable to list generated records: ' + error.message, 'error')
          setStorageFiles([])
          setSelectedStorageIds(new Set())
        } else {
          const files = data || []
          setStorageFiles(files)
          setSelectedStorageIds(prev => {
            const next = new Set()
            files.forEach(file => { if (prev.has(file.name)) next.add(file.name) })
            return next
          })
        }
      } catch (err) {
        toast('Unable to access storage: ' + err.message, 'error')
        setStorageFiles([])
        setSelectedStorageIds(new Set())
      } finally {
        setLoadingFiles(false)
      }
    }
    loadStorage()
  }, [mode, toast])

  useEffect(() => {
    const loadChurch = async () => {
      // maybeSingle() won't error when no row exists (unlike single())
      const { data, error } = await supabase.from('churches').select('*').limit(1).maybeSingle()
      if (error || !data) return
      const churchData = { ...data }
      if (data.logo_url) {
        churchData.logo_data_url = await loadImageAsDataUrl(data.logo_url)
      }
      if (data.diocese_logo_url) {
        churchData.diocese_logo_data_url = await loadImageAsDataUrl(data.diocese_logo_url)
        setWatermarkUrl(churchData.diocese_logo_data_url)
      }
      setChurch(churchData)
    }
    loadChurch()
  }, [])

  const toggleFamily = id => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const selectAll = () => setSelectedIds(new Set(families.map(f => f.family_id)))
  const clearSelection = () => setSelectedIds(new Set())

  const availableStorageFiles = storageFiles.filter(file => !selectedStorageIds.has(file.name))
  const selectedStorageFiles = storageFiles.filter(file => selectedStorageIds.has(file.name))

  const toggleAvailHighlight = (name, evt) => {
    setAvailHighlight(prev => {
      const next = new Set(evt.ctrlKey || evt.metaKey ? prev : [])
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  const toggleSelHighlight = (name, evt) => {
    setSelHighlight(prev => {
      const next = new Set(evt.ctrlKey || evt.metaKey ? prev : [])
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  const moveAvailToSelected = () => {
    setSelectedStorageIds(prev => {
      const next = new Set(prev)
      availHighlight.forEach(name => next.add(name))
      return next
    })
    setAvailHighlight(new Set())
  }

  const moveSelectedToAvail = () => {
    setSelectedStorageIds(prev => {
      const next = new Set(prev)
      selHighlight.forEach(name => next.delete(name))
      return next
    })
    setSelHighlight(new Set())
  }

  const selectAllStorage = () => {
    setSelectedStorageIds(new Set(storageFiles.map(file => file.name)))
    setAvailHighlight(new Set())
    setSelHighlight(new Set())
  }

  const deselectAllStorage = () => {
    setSelectedStorageIds(new Set())
    setAvailHighlight(new Set())
    setSelHighlight(new Set())
  }

  const printSelected = async (all = false) => {
    const list = all ? storageFiles : selectedStorageFiles
    if (!list.length) {
      toast('No files selected for printing.', 'error')
      return
    }
    // Fetch all signed URLs first, then open — avoids popup-blocker on successive window.open calls
    const urls = []
    for (const file of list) {
      const { data: signedData, error: signedError } = await adminSupabase.storage.from(BUCKET_NAME).createSignedUrl(file.name, 60)
      if (signedError) {
        toast('Unable to generate file URL: ' + signedError.message, 'error')
        return
      }
      urls.push(signedData.signedUrl)
    }
    urls.forEach(url => window.open(url, '_blank', 'noopener,noreferrer'))
  }

  const downloadAllZip = async () => {
    if (!storageFiles.length) {
      toast('No files available to download.', 'error')
      return
    }
    try {
      const zip = new JSZip()
      for (const file of storageFiles) {
        const { data: signedData, error: signedError } = await adminSupabase.storage.from(BUCKET_NAME).createSignedUrl(file.name, 120)
        if (signedError) { toast('Unable to generate URL: ' + signedError.message, 'error'); return }
        const response = await fetch(signedData.signedUrl)
        if (!response.ok) { toast('Failed to fetch: ' + file.name, 'error'); return }
        const blob = await response.blob()
        zip.file(file.name, blob)
      }
      const zipBlob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } })
      const now = new Date()
      const ts = `${String(now.getDate()).padStart(2,'0')}-${String(now.getMonth()+1).padStart(2,'0')}-${now.getFullYear()}_${String(now.getHours()).padStart(2,'0')}-${String(now.getMinutes()).padStart(2,'0')}-${String(now.getSeconds()).padStart(2,'0')}`
      const url = URL.createObjectURL(zipBlob)
      const a = document.createElement('a')
      a.href = url
      a.download = `FamilyRecords_${ts}.zip`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      toast('Download failed: ' + err.message, 'error')
    }
  }

  const generateRecords = async () => {
    if (selectedIds.size === 0) {
      toast('Select at least one family before generating.', 'error')
      return
    }

    if (!church) {
      toast('Church data is not loaded. Please wait and try again.', 'error')
      return
    }

    setGenerating(true)
    setProgress({ current: 0, total: selectedIds.size, name: '' })

    try {
      await flushBucket()

      const selectedFamilies = families.filter(f => selectedIds.has(f.family_id))
      const familyIds = selectedFamilies.map(f => f.family_id)
      const { data: members, error } = await supabase
        .from('members')
        .select('*')
        .in('family_id', familyIds)
        .order('family_id', { ascending: true })
        .order('member_id', { ascending: true })

      if (error) throw error

      await ensureBucketExists()

      const familiesById = new Map()
      selectedFamilies.forEach((family, index) => {
        familiesById.set(family.family_id, {
          ...family,
          serial_no: `${getFinancialYear()}-${String(index + 1).padStart(3, '0')}`,
          members: []
        })
      })
      members.forEach(member => {
        if (familiesById.has(member.family_id)) {
          familiesById.get(member.family_id).members.push(member)
        }
      })

      familiesById.forEach(family => {
        const head = family.members.find(m => m.is_family_head) || family.members[0] || {}
        family.head_member_id = head.member_id || ''
        family.address_parts = [head.address_street, head.area_1, head.area_2, head.city, head.state, head.pincode].filter(Boolean)
        family.address = family.address_parts.join(', ')
        family.membership = head.membership_type || 'Primary'
        family.fbrf = head.is_fbrf_member ? 'Yes' : 'No'
        family.email = head.email || ''
        family.contact = head.mobile || ''
      })

      const compressedChurch = { ...church }
      if (church.logo_data_url) compressedChurch.logo_data_url = await compressDataUrl(church.logo_data_url, 120, 0.7)
      if (church.diocese_logo_data_url) compressedChurch.diocese_logo_data_url = await compressDataUrl(church.diocese_logo_data_url, 120, 0.7)
      const compressedWatermark = watermarkUrl ? await compressDataUrl(watermarkUrl, 200, 0.5) : null

      let currentIndex = 0
      for (const family of familiesById.values()) {
        currentIndex += 1
        setProgress({ current: currentIndex, total: selectedIds.size, name: family.family_id })
        const headMember = family.members.find(m => m.is_family_head) || family.members[0] || {}
        const rawPhoto = await resolveMemberPhoto(headMember.member_id)
        const compressedRaw = rawPhoto ? await compressDataUrl(rawPhoto, 140, 0.7) : null
        const headPhoto = compressedRaw ? await roundCornersDataUrl(compressedRaw, 0.1) : null

        try {
          const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4', compress: true })
          buildPdfContent(doc, compressedChurch, family, family.members, compressedWatermark, headPhoto)
          const blob = doc.output('blob')
          
          if (!blob || blob.size === 0) {
            throw new Error(`PDF generation produced empty file for ${family.family_id}`)
          }
          
          const fileName = `${family.family_id}.pdf`
          const { error: uploadError } = await adminSupabase.storage.from(BUCKET_NAME).upload(fileName, blob, {
            cacheControl: '3600', upsert: true, contentType: 'application/pdf'
          })
          if (uploadError) throw uploadError
        } catch (familyError) {
          throw new Error(`Failed to generate PDF for ${family.family_id}: ${familyError.message}`)
        }
      }

      toast(`Generated ${selectedIds.size} family record PDF(s) successfully.`, 'success')
      setSelectedIds(new Set())
      
      const { data: files, error: listError } = await adminSupabase.storage.from(BUCKET_NAME).list('', { limit: 1000, offset: 0, sortBy: { column: 'name', order: 'asc' } })
      if (!listError && files) {
        setStorageFiles(files)
      }
      
      setMode('print')
    } catch (err) {
      toast('Generation failed: ' + err.message, 'error')
    } finally {
      setGenerating(false)
      setProgress({ current: 0, total: 0, name: '' })
    }
  }

  const openFile = async fileName => {
    let url = null
    try {
      const { data: signedData, error: signedError } = await adminSupabase.storage.from(BUCKET_NAME).createSignedUrl(fileName, 60)
      if (signedError) throw signedError
      url = signedData?.signedUrl
    } catch (err) {
      toast('Unable to generate file URL: ' + err.message, 'error')
      return
    }
    if (url) window.open(url, '_blank', 'noopener,noreferrer')
  }

  const removeFile = async fileName => {
    if (!window.confirm(`Delete generated file ${fileName} from storage?`)) return
    const { error } = await adminSupabase.storage.from(BUCKET_NAME).remove([fileName])
    if (error) {
      toast('Delete failed: ' + error.message, 'error')
    } else {
      toast(fileName + ' removed.', 'success')
      setStorageFiles(prev => prev.filter(item => item.name !== fileName))
    }
  }

  const listItems = mode === 'generate' ? (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, minHeight: 260 }}>
      <div style={{ padding: 16, background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div style={{ fontWeight: 700 }}>Family list</div>
          <div style={{ color: '#475569', fontSize: 12 }}>{families.length} families</div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
          <button type="button" onClick={selectAll} className="action-btn" style={{background:'#1e40af', padding:'7px 14px', fontSize:12, display:'flex', alignItems:'center', gap:5}}><Check size={12}/> Select All</button>
          <button type="button" onClick={clearSelection} className="action-btn" style={{background:'#64748b', padding:'7px 14px', fontSize:12, display:'flex', alignItems:'center', gap:5}}><X size={12}/> Clear</button>
        </div>
        <div style={{ maxHeight: 360, overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: 10, padding: 6 }}>
          {loadingFamilies ? (
            <div style={{ padding: 30, textAlign: 'center', color: '#64748b' }}>Loading families…</div>
          ) : families.length === 0 ? (
            <div style={{ padding: 30, textAlign: 'center', color: '#64748b' }}>No active families found.</div>
          ) : families.map(family => {
            const selected = selectedIds.has(family.family_id)
            return (
              <div key={family.family_id}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px',
                  borderBottom: '1px solid #f1f5f9', cursor: 'pointer',
                  background: selected ? '#eff6ff' : '#fff',
                  borderLeft: selected ? '3px solid #1e40af' : '3px solid transparent'
                }}>
                <input type="checkbox" checked={selected} onChange={() => toggleFamily(family.family_id)} style={{ flexShrink: 0, cursor: 'pointer' }} />
                <div style={{ flex: 1, minWidth: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                  <div style={{ fontWeight: 600, fontSize: 12.5, color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{family.family_id} • {family.head_name}</div>
                  <div style={{ color: '#64748b', fontSize: 11, whiteSpace: 'nowrap', flexShrink: 0 }}>{family.member_count} member(s)</div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
      <div style={{ padding: 16, background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0' }}>
        <div style={{ fontWeight: 700, marginBottom: 12 }}>Generate family records</div>
        <p style={{ color: '#475569', fontSize: 13, lineHeight: 1.6 }}>
          Select families and click Generate. Each family's PDF is uploaded to <strong>{BUCKET_NAME}</strong> with upsert,
          so existing records for other families are preserved.
          Each record receives a new serial number for the current year.
        </p>
        <div style={{ marginTop: 16, display: 'grid', gap: 12 }}>
          <div style={{ color: '#334155', fontSize: 13 }}><strong>Selected families:</strong> {selectedIds.size}</div>
          <button type="button" onClick={generateRecords} disabled={generating || selectedIds.size === 0}
            className="action-btn" style={{ background: '#0f766e', padding:'12px 16px', fontSize:14 }}>
            {generating ? <><Loader2 size={14} className="animate-spin"/> Generating…</> : <><FileDown size={14}/> Generate Records</>}
          </button>
        </div>
        {generating && (
          <div style={{ marginTop: 18, padding: 14, background: '#f8fafc', borderRadius: 10, border: '1px solid #cbd5e1' }}>
            <div style={{ marginBottom: 6, fontSize: 12, color: '#334155' }}>Generating {progress.current} of {progress.total}</div>
            <div style={{ height: 8, borderRadius: 999, background: '#e2e8f0' }}>
              <div style={{ width: `${progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0}%`, height: '100%', background: '#0f766e', borderRadius: 999 }} />
            </div>
            <div style={{ marginTop: 8, fontSize: 12, color: '#475569' }}>{progress.name}</div>
          </div>
        )}
      </div>
    </div>
  ) : (
    <div style={{ display: 'grid', gridTemplateColumns: '1.45fr auto 1.45fr', gap: 18, minHeight: 260 }}>
      <div style={{ padding: 16, background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div style={{ fontWeight: 700 }}>Available files</div>
          <div style={{ color: '#475569', fontSize: 12 }}>{availableStorageFiles.length} item(s)</div>
        </div>
        {loadingFiles ? (
          <div style={{ padding: 30, textAlign: 'center', color: '#64748b' }}><Loader2 size={18} className="animate-spin"/> Loading storage…</div>
        ) : availableStorageFiles.length === 0 ? (
          <div style={{ padding: 28, textAlign: 'center', color: '#64748b' }}>No available files.</div>
        ) : (
          <div style={{ flex: 1, overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: 8 }}>
            {availableStorageFiles.map(file => {
              const active = availHighlight.has(file.name)
              return (
                <div key={file.name} onClick={e => toggleAvailHighlight(file.name, e)}
                  style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '8px 12px', cursor: 'pointer',
                    borderBottom: '1px solid #f1f5f9',
                    borderLeft: active ? '3px solid #1e40af' : '3px solid transparent',
                    background: active ? '#eff6ff' : 'transparent',
                  }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
                    <FileText size={13} style={{ color: active ? '#1e40af' : '#94a3b8', flexShrink: 0 }} />
                    <span style={{ fontSize: 12.5, fontWeight: active ? 600 : 400, color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.name}</span>
                  </div>
                  <span style={{ fontSize: 11, color: '#94a3b8', flexShrink: 0, marginLeft: 8 }}>{Math.round((file.metadata?.size || file.size || 0) / 1024)} KB</span>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7, justifyContent: 'center' }}>
        <button type="button" onClick={moveAvailToSelected} className="action-btn"
          style={{ width: 108, padding: '8px 0', fontSize: 12, background: '#1e3a8a', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
          Add <ChevronRight size={13}/>
        </button>
        <button type="button" onClick={moveSelectedToAvail} className="action-btn"
          style={{ width: 108, padding: '8px 0', fontSize: 12, background: '#334155', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
          <ChevronLeft size={13}/> Remove
        </button>
        <div style={{ width: 84, height: 1, background: '#e2e8f0', margin: '4px 0' }}/>
        <button type="button" onClick={selectAllStorage} className="action-btn"
          style={{ width: 108, padding: '8px 0', fontSize: 12, background: '#0f766e', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
          <Check size={12}/> Select All
        </button>
        <button type="button" onClick={deselectAllStorage} className="action-btn"
          style={{ width: 108, padding: '8px 0', fontSize: 12, background: '#6b21a8', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
          <X size={12}/> Deselect All
        </button>
        <div style={{ width: 84, height: 1, background: '#e2e8f0', margin: '4px 0' }}/>
        <button type="button" onClick={() => printSelected(false)} disabled={selectedStorageFiles.length === 0} className="action-btn"
          style={{ width: 108, padding: '8px 0', fontSize: 12, background: '#1d4ed8', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
          <Printer size={13}/> Print
        </button>
        <button type="button" onClick={downloadAllZip} disabled={storageFiles.length === 0} className="action-btn"
          style={{ width: 108, padding: '8px 0', fontSize: 12, background: '#0f766e', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
          <FileDown size={13}/> Download All
        </button>
      </div>

      <div style={{ padding: 16, background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div style={{ fontWeight: 700 }}>Selected files</div>
          <div style={{ color: '#475569', fontSize: 12 }}>{selectedStorageFiles.length} item(s)</div>
        </div>
        {selectedStorageFiles.length === 0 ? (
          <div style={{ padding: 28, textAlign: 'center', color: '#64748b' }}>Drag items here or use the buttons.</div>
        ) : (
          <div style={{ flex: 1, overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: 8 }}>
            {selectedStorageFiles.map(file => {
              const active = selHighlight.has(file.name)
              return (
                <div key={file.name} onClick={e => toggleSelHighlight(file.name, e)}
                  style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '8px 12px', cursor: 'pointer',
                    borderBottom: '1px solid #f1f5f9',
                    borderLeft: active ? '3px solid #1e40af' : '3px solid transparent',
                    background: active ? '#eff6ff' : 'transparent',
                  }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
                    <FileText size={13} style={{ color: active ? '#1e40af' : '#94a3b8', flexShrink: 0 }} />
                    <span style={{ fontSize: 12.5, fontWeight: active ? 600 : 400, color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.name}</span>
                  </div>
                  <span style={{ fontSize: 11, color: '#94a3b8', flexShrink: 0, marginLeft: 8 }}>{Math.round((file.metadata?.size || file.size || 0) / 1024)} KB</span>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )

  return ReactDOM.createPortal(
    <div style={{ position:'fixed', inset:0, background:'rgba(15,23,42,0.78)', zIndex:2147483647, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
      <div style={{ width:'100%', maxWidth:1020, maxHeight:'94vh', background:'#f8fafc', borderRadius:20, overflow:'hidden', display:'flex', flexDirection:'column', boxShadow:'0 24px 80px rgba(15,23,42,0.3)' }}>
        <div style={{ background:'#1e293b', color:'#fff', padding:'18px 22px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <div style={{ display:'flex', alignItems:'center', gap:10, fontSize:15, fontWeight:700 }}>
            <Users size={18}/> Family Records
          </div>
          <button type="button" onClick={onClose} style={{ background:'transparent', border:'none', color:'#fff', cursor:'pointer' }}><X size={20}/></button>
        </div>

        <div style={{ padding:'16px 22px', background:'#fff', display:'flex', gap:8, flexWrap:'wrap' }}>
          {['generate','print'].map(tabId => (
            <button type="button" key={tabId} onClick={() => setMode(tabId)}
              style={{
                background: mode === tabId ? '#1e3a8a' : '#e2e8f0',
                color: mode === tabId ? '#fff' : '#334155',
                border:'none', borderRadius:999, padding:'10px 18px', cursor:'pointer', fontSize:13, fontWeight:600
              }}>
              {tabId === 'generate' ? 'Generate' : 'Print'}
            </button>
          ))}
        </div>

        <div style={{ padding:22, overflowY:'auto', flex:1 }}>
          {listItems}
        </div>
      </div>
    </div>,
    document.body
  )
}
