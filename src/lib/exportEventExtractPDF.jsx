/* ═══════════════════════════════════════════════════════════════
   exportEventExtractPDF.jsx — Bulk Event Recorder PDFs
   Renders the SAME extract/register sheets used for print,
   via html2canvas → jsPDF (same approach as BulkPrintModal).
   Wedding returns TWO files: Schedule IV + Marriage Register.
   ═══════════════════════════════════════════════════════════════ */

import { createRoot } from 'react-dom/client'
import html2canvas from 'html2canvas'
import { jsPDF } from 'jspdf'
import {
  BaptismExtractSheet,
  ConfirmationExtractSheet,
  BurialExtractSheet,
  ScheduleIVSheet,
  MarriageRegisterSheet,
} from '../components/events/EventExtractSheets'
import {
  baptismToForm,
  confirmationToForm,
  burialToForm,
  weddingToForm,
  recordFolderName,
  safeFilePart,
} from './eventRecordMaps'

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms))
}

function ensureHost() {
  let host = document.getElementById('event-bulk-pdf-host')
  if (!host) {
    host = document.createElement('div')
    host.id = 'event-bulk-pdf-host'
    host.style.cssText = 'position:fixed;left:-10000px;top:0;pointer-events:none;z-index:-1;'
    document.body.appendChild(host)
  }
  host.innerHTML = ''
  return host
}

async function captureElementToPdf(el, { orientation = 'portrait', format = 'a5' } = {}) {
  await sleep(250)
  if (document.fonts?.ready) {
    try { await document.fonts.ready } catch { /* ignore */ }
  }

  const canvas = await html2canvas(el, {
    scale: 2,
    useCORS: true,
    allowTaint: true,
    backgroundColor: '#ffffff',
    logging: false,
    imageTimeout: 15000,
  })

  const pdf = new jsPDF({ orientation, unit: 'mm', format })
  const pageW = pdf.internal.pageSize.getWidth()
  const pageH = pdf.internal.pageSize.getHeight()
  const margin = format === 'a5' ? 6 : 8
  const maxW = pageW - margin * 2
  const maxH = pageH - margin * 2
  const ratio = canvas.height / canvas.width
  let fitW = maxW
  let fitH = fitW * ratio
  if (fitH > maxH) {
    fitH = maxH
    fitW = fitH / ratio
  }
  const x = margin + (maxW - fitW) / 2
  const y = margin
  pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', x, y, fitW, fitH)
  return pdf.output('blob')
}

async function renderSheet(node, pdfOpts) {
  const host = ensureHost()
  const mount = document.createElement('div')
  host.appendChild(mount)
  const root = createRoot(mount)
  try {
    await new Promise(resolve => {
      root.render(node)
      setTimeout(resolve, 350)
    })
    const el = mount.firstElementChild
    if (!el) throw new Error('Sheet did not render')
    return await captureElementToPdf(el, pdfOpts)
  } finally {
    try { root.unmount() } catch { /* ignore */ }
    mount.remove()
  }
}

function recordSlBase(record) {
  return `${String(record.seq_num ?? '').padStart(4, '0')}-${record.year ?? ''}`
}

/**
 * Export one event record to PDF file(s).
 * @returns {Promise<Array<{ fileName: string, blob: Blob }>>}
 */
export async function exportEventExtractPDFs(kind, record, church) {
  if (kind === 'baptism') {
    const form = baptismToForm(record)
    const blob = await renderSheet(
      <BaptismExtractSheet form={form} church={church} />,
      { orientation: 'portrait', format: 'a5' },
    )
    return [{ fileName: `${safeFilePart(recordSlBase(record))}_Baptism_Extract.pdf`, blob }]
  }

  if (kind === 'confirmation') {
    const form = confirmationToForm(record)
    const blob = await renderSheet(
      <ConfirmationExtractSheet form={form} church={church} />,
      { orientation: 'portrait', format: 'a5' },
    )
    return [{ fileName: `${safeFilePart(recordSlBase(record))}_Confirmation_Extract.pdf`, blob }]
  }

  if (kind === 'burial') {
    const form = burialToForm(record)
    const blob = await renderSheet(
      <BurialExtractSheet form={form} church={church} />,
      { orientation: 'portrait', format: 'a5' },
    )
    return [{ fileName: `${safeFilePart(recordSlBase(record))}_Burial_Extract.pdf`, blob }]
  }

  if (kind === 'wedding') {
    const form = weddingToForm(record)
    const scheduleBlob = await renderSheet(
      <ScheduleIVSheet form={form} />,
      { orientation: 'landscape', format: 'a4' },
    )
    const registerBlob = await renderSheet(
      <MarriageRegisterSheet form={form} />,
      { orientation: 'landscape', format: 'a4' },
    )
    return [
      { fileName: 'Marriage_Reg_Sch_IV_Form.pdf', blob: scheduleBlob },
      { fileName: 'Marriage_Register.pdf', blob: registerBlob },
    ]
  }

  throw new Error(`Unknown event kind: ${kind}`)
}

/** @deprecated use exportEventExtractPDFs */
export async function exportEventExtractPDF(kind, record, church) {
  const files = await exportEventExtractPDFs(kind, record, church)
  return files[0]?.blob
}

export function eventPdfFileName(kind, record) {
  return recordFolderName(kind, record) + '.pdf'
}

export { recordFolderName }
