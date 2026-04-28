import { useState, useEffect, useRef } from 'react'
import { createRoot } from 'react-dom/client'
import { supabase } from '../lib/supabase'
import { X, FileDown, Loader2, ChevronRight, ChevronLeft, ChevronsRight, ChevronsLeft } from 'lucide-react'
import html2canvas from 'html2canvas'
import { jsPDF } from 'jspdf'
import JSZip from 'jszip'
import { MemberCard, urlToBase64 } from './MemberCard'


export default function BulkPrintModal({ onClose }) {
  const [available,      setAvailable]      = useState([])
  const [selected,       setSelected]       = useState([])
  const [availHighlight, setAvailHighlight] = useState(new Set())
  const [selHighlight,   setSelHighlight]   = useState(new Set())
  const [searchAvail,    setSearchAvail]    = useState('')
  const [searchSel,      setSearchSel]      = useState('')
  const [loading,        setLoading]        = useState(true)
  const [generating,     setGenerating]     = useState(false)
  const [progress,       setProgress]       = useState({ current: 0, total: 0, name: '' })
  const [church,         setChurch]         = useState(null)
  const [logoSrc,        setLogoSrc]        = useState(null)
  const hiddenRef = useRef(null)

  useEffect(() => {
    const init = async () => {
      // Load church settings
      let ch = null
      const { data: d1 } = await supabase.from('churches').select('*').eq('is_active', true).limit(1)
      if (d1?.length) ch = d1[0]
      else {
        const { data: d2 } = await supabase.from('churches').select('*').limit(1)
        if (d2?.length) ch = d2[0]
      }
      setChurch(ch)
      if (ch?.logo_url) setLogoSrc(await urlToBase64(ch.logo_url))

      // Load member list
      const { data } = await supabase
        .from('members')
        .select('member_id, member_name, family_id, title')
        .order('member_id')
      if (data) setAvailable(data)
      setLoading(false)
    }
    init()
  }, [])

  const filteredAvail = available.filter(m =>
    (m.member_id  || '').toLowerCase().includes(searchAvail.toLowerCase()) ||
    (m.member_name || '').toLowerCase().includes(searchAvail.toLowerCase())
  )
  const filteredSel = selected.filter(m =>
    (m.member_id  || '').toLowerCase().includes(searchSel.toLowerCase()) ||
    (m.member_name || '').toLowerCase().includes(searchSel.toLowerCase())
  )

  const sortById = arr => [...arr].sort((a, b) => (a.member_id || '').localeCompare(b.member_id || ''))

  const moveHighlighted = () => {
    const moving = available.filter(m => availHighlight.has(m.member_id))
    setSelected(prev => sortById([...prev, ...moving]))
    setAvailable(prev => prev.filter(m => !availHighlight.has(m.member_id)))
    setAvailHighlight(new Set())
  }

  const moveAll = () => {
    setSelected(prev => sortById([...prev, ...available]))
    setAvailable([])
    setAvailHighlight(new Set())
  }

  const revertHighlighted = () => {
    const moving = selected.filter(m => selHighlight.has(m.member_id))
    setAvailable(prev => sortById([...prev, ...moving]))
    setSelected(prev => prev.filter(m => !selHighlight.has(m.member_id)))
    setSelHighlight(new Set())
  }

  const revertAll = () => {
    setAvailable(prev => sortById([...prev, ...selected]))
    setSelected([])
    setSelHighlight(new Set())
  }

  const toggleHighlight = (setter, id, evt) => {
    setter(prev => {
      const next = new Set(evt.ctrlKey || evt.metaKey ? prev : [])
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const generatePDFs = async () => {
    if (selected.length === 0) return
    setGenerating(true)
    try {
      const zip    = new JSZip()
      const folder = zip.folder('member_pdfs')

      // Use a live React root — identical rendering pipeline to MemberPrintModal
      const cardRoot = createRoot(hiddenRef.current)

      for (let i = 0; i < selected.length; i++) {
        const basic = selected[i]
        setProgress({ current: i + 1, total: selected.length, name: basic.member_name || basic.member_id })

        // Fetch full member record
        const { data: fullData } = await supabase
          .from('members').select('*').eq('member_id', basic.member_id).single()
        const member = fullData || basic

        // Fetch photo as base64
        let photoSrc = null
        for (const ext of ['jpg', 'jpeg', 'png', 'webp']) {
          const path = `active/${member.member_id}.${ext}`
          const { data: blob, error: downloadError } = await supabase.storage.from('member-photos').download(path)
          if (!downloadError && blob) {
            const b64 = await urlToBase64(blob)
            if (b64) { photoSrc = b64; break }
          }
          const { data: pd } = supabase.storage.from('member-photos').getPublicUrl(path)
          if (pd?.publicUrl) {
            const b64 = await urlToBase64(pd.publicUrl)
            if (b64) { photoSrc = b64; break }
          }
        }

        // Render via live React — same pipeline as MemberPrintModal
        await new Promise(resolve => {
          cardRoot.render(
            <MemberCard member={member} church={church} photoSrc={photoSrc} logoSrc={logoSrc} shadow={false} />
          )
          setTimeout(resolve, 300)
        })

        const canvas = await html2canvas(hiddenRef.current.firstChild, {
          scale: 2, useCORS: true, allowTaint: false,
          backgroundColor: '#ffffff', logging: false, imageTimeout: 15000,
        })
        cardRoot.render(<></>)

        const pdf    = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
        const pW     = pdf.internal.pageSize.getWidth()
        const pH     = pdf.internal.pageSize.getHeight()
        const margin = 18
        const cW     = pW - margin * 2
        const cH     = pH - margin * 2
        const ratio  = canvas.height / canvas.width

        // Scale to fit — shrink if taller than available page height
        const fitW   = Math.min(cW, cH / ratio)
        const fitH   = fitW * ratio
        const xOff   = margin + (cW - fitW) / 2

        pdf.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', xOff, margin, fitW, fitH)
        folder.file(`${member.member_id}.pdf`, pdf.output('arraybuffer'))
      }

      // Download ZIP
      const blob = await zip.generateAsync({ type: 'blob' })
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      const now = new Date()
      const dd   = String(now.getDate()).padStart(2, '0')
      const mm   = String(now.getMonth() + 1).padStart(2, '0')
      const yyyy = now.getFullYear()
      const hh   = String(now.getHours()).padStart(2, '0')
      const min  = String(now.getMinutes()).padStart(2, '0')
      const ss   = String(now.getSeconds()).padStart(2, '0')
      const stamp = `${dd}-${mm}-${yyyy}_${hh}-${min}-${ss}`
      a.href = url; a.download = `member_pdfs_${stamp}.zip`; a.click()
      URL.revokeObjectURL(url)
      cardRoot.unmount()

    } catch (e) {
      alert('Bulk PDF generation failed: ' + e.message)
    }
    setGenerating(false)
    setProgress({ current: 0, total: 0, name: '' })
  }

  // ── Styles ──────────────────────────────────────────────────────────────────

  const panelStyle = {
    flex: 1, display: 'flex', flexDirection: 'column',
    background: '#fff', border: '1px solid #d1d5db', borderRadius: 8, overflow: 'hidden',
  }
  const listStyle = {
    flex: 1, overflowY: 'auto', padding: '4px 0', minHeight: 0,
  }
  const itemStyle = (highlighted) => ({
    padding: '5px 12px', cursor: 'pointer', fontSize: 12,
    fontFamily: 'Arial, sans-serif', userSelect: 'none',
    background: highlighted ? '#1e3a5f' : 'transparent',
    color: highlighted ? '#fff' : '#111',
  })
  const midBtnStyle = {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: '#1e3a5f', color: '#fff', border: 'none', borderRadius: 6,
    width: 36, height: 36, cursor: 'pointer', fontSize: 13, fontWeight: 700,
  }
  const searchStyle = {
    width: '100%', padding: '6px 10px', fontSize: 12,
    border: 'none', borderBottom: '1px solid #e5e7eb', outline: 'none',
    background: '#f9fafb', boxSizing: 'border-box',
  }
  const panelHeaderStyle = {
    padding: '8px 12px', background: '#1e3a5f', color: '#fff',
    fontSize: 12, fontWeight: 700, letterSpacing: 0.5,
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
  }

  const pct = progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0

  return (
    <>
      {/* Hidden off-screen render target — wide enough so card resolves to 794px via min() */}
      <div ref={hiddenRef} style={{
        position: 'fixed', left: -9999, top: -9999,
        width: 1200, pointerEvents: 'none', zIndex: -1,
      }} />

      {/* Modal backdrop */}
      <div style={{
        position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.75)',
        zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <div style={{
          width: 820, maxHeight: '92vh', background: '#f1f5f9',
          borderRadius: 12, boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}>

          {/* Title bar */}
          <div style={{
            background: '#1e3a5f', color: '#fff', padding: '14px 20px',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            flexShrink: 0,
          }}>
            <span style={{ fontWeight: 700, fontSize: 15, letterSpacing: 0.3 }}>Bulk Print — Member Data</span>
            <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', padding: 4 }}>
              <X size={18} />
            </button>
          </div>

          {/* Body */}
          <div style={{ flex: 1, padding: '16px', display: 'flex', flexDirection: 'column', gap: 14, minHeight: 0 }}>

            {/* Dual listbox */}
            <div style={{ display: 'flex', gap: 10, flex: 1, minHeight: 0 }}>

              {/* LEFT — Available */}
              <div style={panelStyle}>
                <div style={panelHeaderStyle}>
                  <span>Available Members</span>
                  <span style={{ fontSize: 11, fontWeight: 400, opacity: 0.85 }}>
                    {loading ? '…' : `${available.length} members`}
                  </span>
                </div>
                <input
                  placeholder="Search…" value={searchAvail}
                  onChange={e => setSearchAvail(e.target.value)}
                  style={searchStyle}
                />
                <div style={listStyle}>
                  {loading
                    ? <div style={{ padding: '16px', textAlign: 'center', color: '#6b7280', fontSize: 12 }}>
                        <Loader2 size={14} /> Loading…
                      </div>
                    : filteredAvail.map(m => (
                        <div key={m.member_id}
                          style={itemStyle(availHighlight.has(m.member_id))}
                          onClick={e => toggleHighlight(setAvailHighlight, m.member_id, e)}
                          onDoubleClick={() => {
                            setSelected(prev => sortById([...prev, m]))
                            setAvailable(prev => prev.filter(x => x.member_id !== m.member_id))
                            setAvailHighlight(new Set())
                          }}
                        >
                          <span style={{ fontWeight: 600 }}>{m.member_id}</span>
                          <span style={{ marginLeft: 8, opacity: 0.75 }}>
                            {m.title ? m.title + ' ' : ''}{m.member_name}
                          </span>
                        </div>
                      ))
                  }
                </div>
              </div>

              {/* CENTER — Action buttons */}
              <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 8, flexShrink: 0 }}>
                <button title="Move selected →" style={midBtnStyle} onClick={moveHighlighted} disabled={availHighlight.size === 0}>
                  <ChevronRight size={16} />
                </button>
                <button title="Move all →→" style={midBtnStyle} onClick={moveAll} disabled={available.length === 0}>
                  <ChevronsRight size={16} />
                </button>
                <button title="← Revert selected" style={midBtnStyle} onClick={revertHighlighted} disabled={selHighlight.size === 0}>
                  <ChevronLeft size={16} />
                </button>
                <button title="←← Revert all" style={midBtnStyle} onClick={revertAll} disabled={selected.length === 0}>
                  <ChevronsLeft size={16} />
                </button>
              </div>

              {/* RIGHT — Selected */}
              <div style={panelStyle}>
                <div style={panelHeaderStyle}>
                  <span>Selected for Print</span>
                  <span style={{ fontSize: 11, fontWeight: 400, opacity: 0.85 }}>
                    {selected.length} selected
                  </span>
                </div>
                <input
                  placeholder="Search…" value={searchSel}
                  onChange={e => setSearchSel(e.target.value)}
                  style={searchStyle}
                />
                <div style={listStyle}>
                  {filteredSel.length === 0
                    ? <div style={{ padding: '16px', textAlign: 'center', color: '#9ca3af', fontSize: 12 }}>
                        Double-click or use → to add members
                      </div>
                    : filteredSel.map(m => (
                        <div key={m.member_id}
                          style={itemStyle(selHighlight.has(m.member_id))}
                          onClick={e => toggleHighlight(setSelHighlight, m.member_id, e)}
                          onDoubleClick={() => {
                            setAvailable(prev => sortById([...prev, m]))
                            setSelected(prev => prev.filter(x => x.member_id !== m.member_id))
                            setSelHighlight(new Set())
                          }}
                        >
                          <span style={{ fontWeight: 600 }}>{m.member_id}</span>
                          <span style={{ marginLeft: 8, opacity: 0.75 }}>
                            {m.title ? m.title + ' ' : ''}{m.member_name}
                          </span>
                        </div>
                      ))
                  }
                </div>
              </div>
            </div>

            {/* Progress bar (visible only while generating) */}
            {generating && (
              <div style={{ flexShrink: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#374151', marginBottom: 4 }}>
                  <span>Generating PDF {progress.current} of {progress.total}: <strong>{progress.name}</strong></span>
                  <span>{pct}%</span>
                </div>
                <div style={{ height: 8, background: '#e5e7eb', borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${pct}%`, background: '#1e3a5f', borderRadius: 4, transition: 'width 0.3s' }} />
                </div>
              </div>
            )}

            {/* Footer buttons */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, flexShrink: 0 }}>
              <button onClick={onClose} style={{
                padding: '8px 18px', borderRadius: 7, border: '1px solid #d1d5db',
                background: '#fff', fontSize: 13, cursor: 'pointer', fontWeight: 600, color: '#374151',
              }}>
                Close
              </button>
              <button
                onClick={generatePDFs}
                disabled={generating || selected.length === 0}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 7,
                  padding: '8px 20px', borderRadius: 7, border: 'none',
                  background: generating || selected.length === 0 ? '#6b7280' : '#15803d',
                  color: '#fff', fontSize: 13, fontWeight: 700,
                  cursor: generating || selected.length === 0 ? 'not-allowed' : 'pointer',
                  opacity: generating || selected.length === 0 ? 0.7 : 1,
                }}
              >
                {generating
                  ? <><Loader2 size={14} className="animate-spin" /> Generating…</>
                  : <><FileDown size={14} /> Download {selected.length > 0 ? `${selected.length} ` : ''}PDFs as ZIP</>
                }
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
