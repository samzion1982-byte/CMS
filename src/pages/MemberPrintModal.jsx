import { useState, useEffect, useRef } from 'react'
import ReactDOM from 'react-dom'
import { supabase } from '../lib/supabase'
import { X, Printer, FileDown, Loader2 } from 'lucide-react'
import html2canvas from 'html2canvas'
import { jsPDF } from 'jspdf'
import { MemberCard, urlToBase64 } from './MemberCard'

function btnStyle(bg, disabled = false) {
  return {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    background: disabled ? '#6b7280' : bg,
    color: '#fff', border: 'none', borderRadius: 7,
    padding: '7px 15px', fontSize: 12, fontWeight: 600,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.7 : 1,
  }
}

export default function MemberPrintModal({ member, onClose }) {
  const printRef    = useRef(null)
  const cardReady   = useRef(false)
  const [church,      setChurch]      = useState(null)
  const [photoSrc,    setPhotoSrc]    = useState(null)
  const [logoSrc,     setLogoSrc]     = useState(null)
  const [generating,  setGenerating]  = useState(false)
  const [loadingData, setLoadingData] = useState(true)

  useEffect(() => {
    const load = async () => {
      setLoadingData(true)
      cardReady.current = false

      let ch = null
      const { data: d1 } = await supabase
        .from('churches').select('*').eq('is_active', true).limit(1)
      if (d1?.length) { ch = d1[0] }
      else {
        const { data: d2 } = await supabase.from('churches').select('*').limit(1)
        if (d2?.length) ch = d2[0]
      }
      setChurch(ch)

      if (ch?.logo_url) setLogoSrc(await urlToBase64(ch.logo_url))

      if (member?.member_id) {
        for (const ext of ['jpg', 'jpeg', 'png', 'webp']) {
          const path = `active/${member.member_id}.${ext}`
          const { data: blob, error: downloadError } = await supabase.storage.from('member-photos').download(path)
          if (!downloadError && blob) {
            const b64 = await urlToBase64(blob)
            if (b64) { setPhotoSrc(b64); break }
          }
          const { data: pd } = supabase.storage.from('member-photos').getPublicUrl(path)
          if (pd?.publicUrl) {
            const b64 = await urlToBase64(pd.publicUrl)
            if (b64) { setPhotoSrc(b64); break }
          }
        }
      }

      setLoadingData(false)
      requestAnimationFrame(() => requestAnimationFrame(() => {
        cardReady.current = true
      }))
    }
    load()
  }, [member])

  async function createPdfBlob() {
    if (!html2canvas) throw new Error('html2canvas failed to load')
    if (!jsPDF) throw new Error('jsPDF failed to load')

    await new Promise(resolve => {
      const check = () => cardReady.current ? resolve() : requestAnimationFrame(check)
      check()
    })
    await new Promise(r => setTimeout(r, 300))

    const el = printRef.current
    if (!el) throw new Error('Print element not found')

    const cardEl = el.firstChild
    const savedShadow = cardEl?.style?.boxShadow
    if (cardEl) cardEl.style.boxShadow = 'none'

    const canvas = await html2canvas(el, {
      scale: 2,
      useCORS: true,
      allowTaint: false,
      backgroundColor: '#ffffff',
      logging: false,
      imageTimeout: 15000,
    })

    if (cardEl) cardEl.style.boxShadow = savedShadow

    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
    const pW = pdf.internal.pageSize.getWidth()
    const pH = pdf.internal.pageSize.getHeight()
    const margin = 18
    const cW = pW - margin * 2
    const cH = pH - margin * 2
    const ratio = canvas.height / canvas.width
    const fitW = Math.min(cW, cH / ratio)
    const fitH = fitW * ratio
    const xOff = margin + (cW - fitW) / 2

    pdf.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', xOff, margin, fitW, fitH)
    return await pdf.output('blob')
  }

  const doPrint = async () => {
    setGenerating(true)
    try {
      const blob = await createPdfBlob()
      const blobUrl = URL.createObjectURL(blob)
      const printWindow = window.open('', '_blank', 'width=900,height=720')
      if (!printWindow) throw new Error('Unable to open print window')

      printWindow.document.write(`<!DOCTYPE html><html><head><title>Member Print</title>
        <style>html,body{margin:0;padding:0;height:100%;overflow:hidden;}body{background:#fff;}
        iframe{border:none;width:100%;height:100%;}</style></head>
        <body><iframe src="${blobUrl}"></iframe>
        <script>
          const iframe = document.querySelector('iframe');
          iframe.onload = () => { setTimeout(() => { iframe.contentWindow.print(); }, 250); };
          window.onbeforeunload = () => URL.revokeObjectURL('${blobUrl}');
        <\/script></body></html>`)
      printWindow.document.close()
      printWindow.focus()
    } catch (e) {
      alert('Print failed: ' + e.message)
    } finally {
      setGenerating(false)
    }
  }

  const doDownloadPDF = async () => {
    setGenerating(true)
    try {
      if (!html2canvas) throw new Error('html2canvas failed to load')
      if (!jsPDF)       throw new Error('jsPDF failed to load')

      await new Promise(resolve => {
        const check = () => cardReady.current ? resolve() : requestAnimationFrame(check)
        check()
      })
      await new Promise(r => setTimeout(r, 300))

      const el = printRef.current
      if (!el) throw new Error('Print element not found')

      // Temporarily remove box-shadow for a clean capture (shadow pixels inflate canvas height)
      const cardEl = el.firstChild
      const savedShadow = cardEl?.style.boxShadow
      if (cardEl) cardEl.style.boxShadow = 'none'

      const canvas = await html2canvas(el, {
        scale: 2, useCORS: true, allowTaint: false,
        backgroundColor: '#ffffff', logging: false, imageTimeout: 15000,
      })

      if (cardEl) cardEl.style.boxShadow = savedShadow

      const pdf    = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
      const pW     = pdf.internal.pageSize.getWidth()
      const pH     = pdf.internal.pageSize.getHeight()
      const margin = 18
      const cW     = pW - margin * 2
      const cH     = pH - margin * 2
      const ratio  = canvas.height / canvas.width

      // Scale to fit within page — if card is taller than available height, shrink to fit
      const fitW   = Math.min(cW, cH / ratio)
      const fitH   = fitW * ratio
      const xOff   = margin + (cW - fitW) / 2

      pdf.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', xOff, margin, fitW, fitH)
      pdf.save(`member_${member?.member_id || 'data'}.pdf`)
    } catch (e) {
      alert('PDF generation failed: ' + e.message)
    }
    setGenerating(false)
  }

  if (typeof document === 'undefined') return null

  return ReactDOM.createPortal(
    <div style={{
      position: 'fixed', inset: 0,
      background: 'rgba(15,23,42,0.85)',
      zIndex: 2147483647, display: 'flex', flexDirection: 'column',
      alignItems: 'center', padding: '16px', overflowY: 'auto',
      pointerEvents: 'auto',
    }}>

      <div style={{
        width: '100%', maxWidth: 1100, display: 'flex', flexWrap: 'wrap',
        justifyContent: 'center', gap: 18, alignItems: 'flex-start',
      }}>
        <div style={{ flex: '1 1 0', minWidth: 0, maxWidth: 794, flexShrink: 0 }}>
          {loadingData ? (
            <div style={{ color: '#fff', display: 'flex', alignItems: 'center', gap: 10, marginTop: 80 }}>
              <Loader2 size={22} className="animate-spin" /> Loading data…
            </div>
          ) : (
            <div ref={printRef} style={{ flexShrink: 0 }}>
              <MemberCard
                member={member}
                church={church}
                photoSrc={photoSrc}
                logoSrc={logoSrc}
                shadow={true}
              />
            </div>
          )}
        </div>

        <aside style={{
          width: 260, minWidth: 240, flexShrink: 0,
          position: 'sticky', top: 18, alignSelf: 'flex-start',
          borderRadius: 18, padding: 18,
          background: 'rgba(15,23,42,0.92)',
          border: '1px solid rgba(255,255,255,0.14)',
          boxShadow: '0 18px 40px rgba(0,0,0,0.18)',
          display: 'flex', flexDirection: 'column', gap: 12,
        }}>
          <div style={{ color: '#fff', fontSize: 14, fontWeight: 700, lineHeight: 1.4 }}>
            Member Data — {member?.title ? member.title + ' ' : ''}{member?.member_name}
          </div>
          <button onClick={doPrint} style={{ ...btnStyle('#1e3a5f'), width: '100%', justifyContent: 'center' }}>
            <Printer size={14} /> Print
          </button>
          <button onClick={doDownloadPDF} disabled={generating || loadingData}
            style={{ ...btnStyle('#15803d', generating || loadingData), width: '100%', justifyContent: 'center' }}>
            {generating
              ? <><Loader2 size={14} className="animate-spin" /> Generating…</>
              : <><FileDown size={14} /> Download PDF</>}
          </button>
          <button onClick={onClose} style={{ ...btnStyle('#dc2626'), width: '100%', justifyContent: 'center' }}>
            <X size={14} /> Close
          </button>
        </aside>
      </div>

    </div>,
    document.body
  )
}
