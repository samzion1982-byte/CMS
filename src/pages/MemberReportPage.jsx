import { useState, useEffect, useCallback, useRef } from 'react'
import lamejs from '@breezystack/lamejs'
import { Users, Download, MessageSquare, ChevronUp, ChevronDown, RefreshCw, Send, ListFilter, Clock, Trash2, FileSpreadsheet, Calendar, Bold, Italic, Strikethrough, List, Indent, CornerDownLeft, Paperclip, X, Music, FileText, ImageIcon, Mic, Square, Play, Pause } from 'lucide-react'
import { supabase, getChurch } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { useToast } from '../lib/toast'
import { exportToExcelWithTitle } from '../lib/exportExcel'
import { sendWhatsAppMessage } from '../lib/whatsapp'

/** Walk a contentEditable DOM tree → WhatsApp markdown string */
function htmlToWaMd(el) {
  function walk(node) {
    if (node.nodeType === 3) return node.textContent
    if (node.nodeType !== 1) return ''
    const tag   = node.tagName.toLowerCase()
    const inner = Array.from(node.childNodes).map(walk).join('')
    switch (tag) {
      case 'br':                           return '\n'
      case 'strong': case 'b':            return `*${inner.replace(/\*/g, '')}*`
      case 'em':     case 'i':            return `_${inner.replace(/_/g, '')}_`
      case 's': case 'del': case 'strike': return `~${inner.replace(/~/g, '')}~`
      case 'code':                         return '`' + inner + '`'
      case 'u': case 'ins':               return inner
      case 'li':                           return '- ' + inner + '\n'
      case 'ul': case 'ol':               return inner
      case 'div': case 'p':               return inner + '\n'
      default:                             return inner
    }
  }
  return walk(el).replace(/\n$/, '')
}

/** Render WhatsApp markdown as formatted JSX for the preview pane */
function renderWaText(raw) {
  const escaped = raw
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const html = escaped
    .replace(/\*([^*\n]+)\*/g,  '<strong>$1</strong>')
    .replace(/_([^_\n]+)_/g,    '<em>$1</em>')
    .replace(/~([^~\n]+)~/g,    '<s>$1</s>')
    .replace(/`([^`\n]+)`/g,    '<code style="font-family:monospace;background:#f1f5f9;padding:1px 4px;border-radius:3px">$1</code>')
    .replace(/\n/g, '<br/>')
  // eslint-disable-next-line react/no-danger
  return <span dangerouslySetInnerHTML={{ __html: html }} />
}

function MiniAudioPlayer({ src }) {
  const audioRef = useRef(null)
  const [playing, setPlaying]   = useState(false)
  const [current, setCurrent]   = useState(0)
  const [duration, setDuration] = useState(0)

  const fmt = s => {
    if (!isFinite(s)) return '0:00'
    const m = Math.floor(s / 60)
    const sec = Math.floor(s % 60)
    return `${m}:${sec.toString().padStart(2, '0')}`
  }

  const toggle = () => {
    const a = audioRef.current
    if (!a) return
    playing ? a.pause() : a.play()
  }

  const seek = e => {
    const a = audioRef.current
    if (!a || !duration) return
    const rect = e.currentTarget.getBoundingClientRect()
    a.currentTime = ((e.clientX - rect.left) / rect.width) * duration
  }

  const pct = duration ? (current / duration) * 100 : 0

  return (
    <div style={{ display:'flex', alignItems:'center', gap:8, padding:'4px 0' }}>
      <audio ref={audioRef} src={src}
        onLoadedMetadata={e => setDuration(e.target.duration)}
        onTimeUpdate={e  => setCurrent(e.target.currentTime)}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => { setPlaying(false); setCurrent(0); if (audioRef.current) audioRef.current.currentTime = 0 }}
      />
      <button onClick={toggle} className="no-lift" style={{ width:28, height:28, borderRadius:'50%', border:'none', background:'#7c3aed', color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, cursor:'pointer', padding:0 }}>
        {playing ? <Pause size={12} fill="#fff"/> : <Play size={12} fill="#fff" style={{ marginLeft:1 }}/>}
      </button>
      <div onClick={seek} style={{ flex:1, height:4, background:'var(--card-border)', borderRadius:2, cursor:'pointer', position:'relative' }}>
        <div style={{ width:`${pct}%`, height:'100%', background:'#7c3aed', borderRadius:2, transition:'width 0.1s linear' }}/>
      </div>
      <span style={{ fontSize:11, color:'var(--text-2)', flexShrink:0, fontVariantNumeric:'tabular-nums' }}>
        {fmt(current)} / {fmt(duration)}
      </span>
    </div>
  )
}

/* ── OGG Opus encoding (Chrome → OGG via WebCodecs + custom muxer) ─ */

/** OGG CRC32: forward, polynomial 0x04c11db7, init 0 */
const OGG_CRC_LUT = (() => {
  const t = new Uint32Array(256)
  for (let i = 0; i < 256; i++) {
    let c = i << 24
    for (let j = 0; j < 8; j++) c = (c & 0x80000000) ? (c << 1) ^ 0x04c11db7 : c << 1
    t[i] = c >>> 0
  }
  return t
})()

function oggCrc32(bytes) {
  let crc = 0
  for (let i = 0; i < bytes.length; i++)
    crc = (OGG_CRC_LUT[((crc >>> 24) ^ bytes[i]) & 0xff] ^ (crc << 8)) >>> 0
  return crc
}

/**
 * Pack raw Opus packets (Uint8Array[]) into a valid OGG Opus file (RFC 7845).
 * inputSampleRate is written into OpusHead so the decoder knows the original rate.
 */
function muxOggOpus(opusPackets, inputSampleRate = 48000, channels = 1) {
  const serial   = (Math.random() * 0xffffffff) >>> 0
  const PRE_SKIP = 312   // standard encoder algorithmic delay at 48 kHz
  let   pageSeq  = 0
  const pages    = []

  function writePage(packet, headerType, granule) {
    const segs = []
    let rem = packet.length
    while (rem > 0) { segs.push(Math.min(255, rem)); rem -= 255 }
    if (packet.length % 255 === 0) segs.push(0)   // end-of-packet sentinel

    const hdrLen = 27 + segs.length
    const page   = new Uint8Array(hdrLen + packet.length)
    const dv     = new DataView(page.buffer)

    page[0]=0x4f; page[1]=0x67; page[2]=0x67; page[3]=0x53  // "OggS"
    page[4] = 0; page[5] = headerType
    dv.setUint32(6,  granule >>> 0,                         true)  // granule lo
    dv.setUint32(10, Math.floor(granule / 0x100000000) >>> 0, true) // granule hi
    dv.setUint32(14, serial,  true)
    dv.setUint32(18, pageSeq++, true)
    dv.setUint32(22, 0, true)   // checksum placeholder
    page[26] = segs.length
    for (let i = 0; i < segs.length; i++) page[27 + i] = segs[i]
    page.set(packet, hdrLen)
    dv.setUint32(22, oggCrc32(page), true)
    pages.push(page)
  }

  // OpusHead identification header
  const head = new Uint8Array(19)
  const hdv  = new DataView(head.buffer)
  head.set([0x4f,0x70,0x75,0x73,0x48,0x65,0x61,0x64])  // "OpusHead"
  head[8] = 1; head[9] = channels
  hdv.setUint16(10, PRE_SKIP, true)
  hdv.setUint32(12, inputSampleRate, true)
  hdv.setInt16(16, 0, true)
  head[18] = 0
  writePage(head, 0x02, 0)   // BOS

  // OpusTags comment header
  const vendor = new TextEncoder().encode('ChurchCMS')
  const tags   = new Uint8Array(8 + 4 + vendor.length + 4)
  const tdv    = new DataView(tags.buffer)
  tags.set([0x4f,0x70,0x75,0x73,0x54,0x61,0x67,0x73])  // "OpusTags"
  tdv.setUint32(8, vendor.length, true)
  tags.set(vendor, 12)
  tdv.setUint32(12 + vendor.length, 0, true)
  writePage(tags, 0x00, 0)

  // Audio pages — one Opus packet per page, 20 ms = 960 samples at 48 kHz
  let granule = 0
  for (let i = 0; i < opusPackets.length; i++) {
    granule += 960
    writePage(opusPackets[i], i === opusPackets.length - 1 ? 0x04 : 0x00, granule)
  }

  const total  = pages.reduce((s, p) => s + p.length, 0)
  const result = new Uint8Array(total)
  let   off    = 0
  for (const p of pages) { result.set(p, off); off += p.length }
  return new Blob([result], { type: 'audio/ogg' })
}

/**
 * Decode a browser-recorded WebM blob and re-encode as OGG Opus using the
 * WebCodecs AudioEncoder API (Chrome 94+).  Returns null if unavailable.
 */
async function rawBlobToOggOpus(rawBlob) {
  if (typeof AudioEncoder === 'undefined' || typeof AudioData === 'undefined') return null

  const arrayBuf = await rawBlob.arrayBuffer()
  const ctx      = new AudioContext({ sampleRate: 48000 })
  let decoded
  try { decoded = await ctx.decodeAudioData(arrayBuf) } finally { ctx.close() }

  const pcm      = decoded.getChannelData(0)   // mono Float32 at 48000 Hz
  const FRAME    = 960                          // 20 ms per Opus frame
  const opusPkts = []

  const encoder = new AudioEncoder({
    output: chunk => { const d = new Uint8Array(chunk.byteLength); chunk.copyTo(d); opusPkts.push(d) },
    error:  e => { throw e },
  })
  encoder.configure({ codec: 'opus', sampleRate: 48000, numberOfChannels: 1, bitrate: 32000 })

  for (let i = 0; i < pcm.length; i += FRAME) {
    let frame = pcm.subarray(i, i + FRAME)
    if (frame.length < FRAME) { const p = new Float32Array(FRAME); p.set(frame); frame = p }
    const ad = new AudioData({
      format: 'f32', sampleRate: 48000, numberOfFrames: FRAME,
      numberOfChannels: 1, timestamp: Math.round(i / 48000 * 1e6), data: frame,
    })
    encoder.encode(ad); ad.close()
  }
  await encoder.flush()
  encoder.close()

  if (opusPkts.length === 0) return null
  return muxOggOpus(opusPkts, 48000, 1)
}

/* ── Column definitions ───────────────────────────────────────── */
const ALL_COLS = [
  { label: 'Family ID',          key: 'family_id',              align: 'center' },
  { label: 'Member ID',          key: 'member_id',              align: 'center' },
  { label: 'Member Name',        key: 'member_name',            align: 'left'   },
  { label: 'Father Name',        key: 'father_name',            align: 'left'   },
  { label: 'Gender',             key: 'gender',                 align: 'center' },
  { label: 'Age',                key: 'age',                    align: 'center' },
  { label: 'Marital Status',     key: 'marital_status',         align: 'center' },
  { label: 'City',               key: 'city',                   align: 'left'   },
  { label: 'State',              key: 'state',                  align: 'left'   },
  { label: 'Zonal Area',         key: 'zonal_area',             align: 'left'   },
  { label: 'Mobile',             key: 'mobile',                 align: 'center' },
  { label: 'WhatsApp',           key: 'whatsapp',               align: 'center' },
  { label: 'Email',              key: 'email',                  align: 'left'   },
  { label: 'Qualification',      key: 'qualification',          align: 'left'   },
  { label: 'Profession',         key: 'profession',             align: 'left'   },
  { label: 'Working Sector',     key: 'working_sector',         align: 'left'   },
  { label: 'Family Head',        key: 'is_family_head',         align: 'center', fmt: 'bool' },
  { label: 'Relationship',       key: 'relationship_with_fh',   align: 'left'   },
  { label: 'Mem. Type',          key: 'membership_type',        align: 'center' },
  { label: 'Church',             key: 'primary_church_name',    align: 'left'   },
  { label: 'Denomination',       key: 'denomination',           align: 'center' },
  { label: 'Mem. Since',         key: 'membership_from_year',   align: 'center' },
  { label: 'Baptism Type',       key: 'baptism_type',           align: 'center' },
  { label: 'Confirmed',          key: 'confirmation_taken',     align: 'center', fmt: 'bool' },
  { label: 'Is FBRF',            key: 'is_fbrf_member',         align: 'center', fmt: 'bool' },
  { label: "Men's Fellowship",   key: 'act_mens_fellowship',    align: 'center', fmt: 'bool' },
  { label: "Women's Fellowship", key: 'act_womens_fellowship',  align: 'center', fmt: 'bool' },
  { label: 'Youth Assoc.',       key: 'act_youth_association',  align: 'center', fmt: 'bool' },
  { label: 'Sunday School',      key: 'act_sunday_school',      align: 'center', fmt: 'bool' },
  { label: 'Choir',              key: 'act_choir',              align: 'center', fmt: 'bool' },
  { label: 'Pastorate Comm.',    key: 'act_pastorate_committee',align: 'center', fmt: 'bool' },
  { label: 'Village Ministry',   key: 'act_village_ministry',   align: 'center', fmt: 'bool' },
  { label: 'DCC',                key: 'act_dcc',                align: 'center', fmt: 'bool' },
  { label: 'DC',                 key: 'act_dc',                 align: 'center', fmt: 'bool' },
  { label: 'Volunteers',         key: 'act_volunteers',         align: 'center', fmt: 'bool' },
]
const ALL_KEYS = ALL_COLS.map(c => c.key)

/* ── Slicer library — 4 groups covering ALL column headers ───── */
// type: 'multi' | 'bool' | 'age' | 'range' | 'text' | 'disabled'
const SLICER_GROUPS = [
  {
    label: 'Personal & Identification',
    color: '#7c3aed',
    slicers: [
      { key: 'familyIdTxt',   label: 'Family ID',    type: 'text',  field: 'family_id'  },
      { key: 'memberIdTxt',   label: 'Member ID',    type: 'text',  field: 'member_id'  },
      { key: 'memberNameTxt', label: 'Member Name',  type: 'text',  field: 'member_name' },
      { key: 'fatherNameTxt', label: 'Father Name',  type: 'text',  field: 'father_name' },
      { key: 'gender',        label: 'Gender',       type: 'multi', optsKey: 'genders',       showBlank: true  },
      { key: 'age',           label: 'Age',          type: 'age'   },
    ],
  },
  {
    label: 'Family, Address & Contact',
    color: '#0891b2',
    slicers: [
      { key: 'maritalStatus', label: 'Marital Status',  type: 'multi', optsKey: 'maritalStatuses', showBlank: true  },
      { key: 'isFamilyHead',  label: 'Family Head',     type: 'bool'  },
      { key: 'relationship',  label: 'Relationship',    type: 'multi', optsKey: 'relationships',   showBlank: true  },
      { key: 'city',          label: 'City',            type: 'multi', optsKey: 'cities',          showBlank: true  },
      { key: 'stateFilter',   label: 'State',           type: 'multi', optsKey: 'states',          showBlank: true  },
      { key: 'zonalArea',     label: 'Zonal Area',      type: 'multi', optsKey: 'zonalAreas',      showBlank: true  },
      { key: 'mobileTxt',     label: 'Mobile',          type: 'text',  field: 'mobile'   },
      { key: 'whatsappTxt',   label: 'WhatsApp',        type: 'text',  field: 'whatsapp' },
      { key: 'emailTxt',      label: 'Email',           type: 'text',  field: 'email'    },
    ],
  },
  {
    label: 'Professional & Church Membership',
    color: '#059669',
    slicers: [
      { key: 'qualFilter',      label: 'Qualification', type: 'multi', optsKey: 'qualifications',  showBlank: false },
      { key: 'profTxt',         label: 'Profession',    type: 'text',  field: 'profession' },
      { key: 'workingSector',   label: 'Working Sector',type: 'multi', optsKey: 'workingSectors',  showBlank: false },
      { key: 'membershipType',  label: 'Mem. Type',     type: 'multi', optsKey: 'membershipTypes', showBlank: false },
      { key: 'church',          label: 'Church',        type: 'multi', optsKey: 'churches',        showBlank: false },
      { key: 'denomination',    label: 'Denomination',  type: 'multi', optsKey: 'denominations',   showBlank: false },
      { key: 'memSince',        label: 'Mem. Since',    type: 'range' },
      { key: 'baptismType',     label: 'Baptism Type',  type: 'multi', optsKey: 'baptismTypes',    showBlank: false },
      { key: 'confirmationTaken',label: 'Confirmed',    type: 'bool'  },
      { key: 'isFBRF',          label: 'Is FBRF',       type: 'bool'  },
    ],
  },
  {
    label: 'Activities',
    color: '#d97706',
    slicers: [
      { key: 'actMens',   label: "Men's Fellowship",   type: 'bool' },
      { key: 'actWomens', label: "Women's Fellowship", type: 'bool' },
      { key: 'actYouth',  label: 'Youth Assoc.',       type: 'bool' },
      { key: 'actSS',     label: 'Sunday School',      type: 'bool' },
      { key: 'actChoir',  label: 'Choir',              type: 'bool' },
      { key: 'actPC',     label: 'Pastorate Comm.',    type: 'bool' },
      { key: 'actVM',     label: 'Village Ministry',   type: 'bool' },
      { key: 'actDCC',    label: 'DCC',                type: 'bool' },
      { key: 'actDC',     label: 'DC',                 type: 'bool' },
      { key: 'actVol',    label: 'Volunteers',         type: 'bool' },
    ],
  },
]

const SLICER_DEFS = SLICER_GROUPS.flatMap(g => g.slicers)

/* ── Default filter state ─────────────────────────────────────── */
const EMPTY_FILTERS = {
  // multi-select
  gender: [], maritalStatus: [], relationship: [], membershipType: [],
  denomination: [], zonalArea: [], church: [], city: [], stateFilter: [],
  baptismType: [], workingSector: [], qualFilter: [],
  // bool
  isFamilyHead: 'all', confirmationTaken: 'all', isFBRF: 'all',
  actMens: 'all', actWomens: 'all', actYouth: 'all', actSS: 'all',
  actChoir: 'all', actPC: 'all', actVM: 'all', actDCC: 'all', actDC: 'all', actVol: 'all',
  // range
  ageFrom: '', ageTo: '', memSinceFrom: '', memSinceTo: '',
  // text
  familyIdTxt: '', memberIdTxt: '', memberNameTxt: '', fatherNameTxt: '',
  mobileTxt: '', whatsappTxt: '', emailTxt: '', profTxt: '',
  
}

/* ── Helpers ──────────────────────────────────────────────────── */
function fmtDate(v) {
  if (!v) return ''
  const d = new Date(v)
  return isNaN(d) ? String(v) : d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}
function fmtCell(col, row, idx) {
  if (col.key === 'sno') return String(idx + 1)
  const v = row[col.key]
  if (col.fmt === 'bool') return v === true ? 'Yes' : v === false ? 'No' : ''
  if (col.fmt === 'date') return fmtDate(v)
  return v == null ? '' : String(v)
}

/* ── Shared slicer header ─────────────────────────────────────── */
function SlicerHeader({ title, active, onClear, onRemove }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '4px 7px', background: active ? '#dbeafe' : '#f1f5f9',
      borderBottom: `1px solid ${active ? '#93c5fd' : '#e2e8f0'}`,
      minHeight: 28, gap: 4,
    }}>
      <span style={{ fontSize: 12, fontWeight: 700, color: active ? '#1d4ed8' : '#374151', flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {title}
      </span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>
        <span style={{ fontSize: 9, padding: '1px 4px', borderRadius: 2, border: `1px solid ${active ? '#93c5fd' : '#d1d5db'}`, color: active ? '#2563eb' : '#9ca3af', lineHeight: 1.4 }}>≡✓</span>
        <button onClick={e => { e.stopPropagation(); onClear() }} title="Clear filter"
          style={{ background: 'none', border: 'none', cursor: active ? 'pointer' : 'default', padding: '1px 2px', display: 'flex', alignItems: 'center' }}>
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
            <path d="M2 3h12l-5 6v4l-2-1V9L2 3z" fill={active ? '#ef4444' : '#d1d5db'} />
            {active && <><line x1="10" y1="10" x2="15" y2="15" stroke="#ef4444" strokeWidth="1.8" strokeLinecap="round" /><line x1="15" y1="10" x2="10" y2="15" stroke="#ef4444" strokeWidth="1.8" strokeLinecap="round" /></>}
          </svg>
        </button>
        <RemoveBtn onRemove={onRemove} />
      </div>
    </div>
  )
}

function RemoveBtn({ onRemove }) {
  const [hov, setHov] = useState(false)
  return (
    <button onClick={e => { e.stopPropagation(); onRemove() }}
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      title="Remove slicer"
      style={{ background: hov ? '#fee2e2' : 'none', border: 'none', cursor: 'pointer', padding: '1px 3px', borderRadius: 3, fontSize: 12, color: hov ? '#ef4444' : '#9ca3af', transition: 'all 0.1s', display: 'flex', alignItems: 'center' }}>
      ✕
    </button>
  )
}

/* ── Multi-select slicer ──────────────────────────────────────── */
function Slicer({ title, options, selected, onToggle, onClear, showBlank, onRemove }) {
  const active  = selected.length > 0
  const allOpts = showBlank ? [...options, '(blank)'] : options
  return (
    <div style={{ border: `1px solid ${active ? '#2563eb' : '#c8d3e0'}`, borderRadius: 4, background: '#fff', display: 'flex', flexDirection: 'column', flex: '1 1 148px', minWidth: 140, maxWidth: 210, overflow: 'hidden', boxShadow: active ? '0 0 0 2px rgba(37,99,235,0.12)' : '0 1px 3px rgba(0,0,0,0.06)' }}>
      <SlicerHeader title={title} active={active} onClear={onClear} onRemove={onRemove} />
      <div style={{ maxHeight: 148, overflowY: 'auto', scrollbarWidth: 'thin', scrollbarColor: '#c8d3e0 transparent' }}>
        {allOpts.length === 0 && <div style={{ padding: '8px 10px', fontSize: 11, color: '#9ca3af', textAlign: 'center' }}>No data</div>}
        {allOpts.map((opt, i) => {
          const isSel = selected.includes(opt)
          return (
            <button key={opt} onClick={() => onToggle(opt)}
              style={{ display: 'block', width: '100%', padding: '5px 10px', border: 'none', borderBottom: i < allOpts.length - 1 ? '1px solid #f0f4f8' : 'none', background: isSel ? '#2563eb' : '#fff', color: isSel ? '#fff' : '#1e293b', fontSize: 12, textAlign: 'left', cursor: 'pointer', transition: 'background 0.08s' }}
              onMouseEnter={e => { if (!isSel) e.currentTarget.style.background = '#eff6ff' }}
              onMouseLeave={e => { if (!isSel) e.currentTarget.style.background = '#fff' }}>
              {opt}
            </button>
          )
        })}
      </div>
    </div>
  )
}

/* ── Bool slicer ──────────────────────────────────────────────── */
function BoolSlicer({ title, value, onChange, onRemove }) {
  const active = value !== 'all'
  const opts   = [{ val: 'all', label: '(All)' }, { val: 'yes', label: 'Yes' }, { val: 'no', label: 'No' }]
  return (
    <div style={{ border: `1px solid ${active ? '#2563eb' : '#c8d3e0'}`, borderRadius: 4, background: '#fff', display: 'flex', flexDirection: 'column', flex: '1 1 110px', minWidth: 108, maxWidth: 148, overflow: 'hidden', boxShadow: active ? '0 0 0 2px rgba(37,99,235,0.12)' : '0 1px 3px rgba(0,0,0,0.06)' }}>
      <SlicerHeader title={title} active={active} onClear={() => onChange('all')} onRemove={onRemove} />
      <div>
        {opts.map((o, i) => (
          <button key={o.val} onClick={() => onChange(o.val)}
            style={{ display: 'block', width: '100%', padding: '5px 10px', border: 'none', borderBottom: i < opts.length - 1 ? '1px solid #f0f4f8' : 'none', background: value === o.val ? '#2563eb' : '#fff', color: value === o.val ? '#fff' : '#1e293b', fontSize: 12, textAlign: 'left', cursor: 'pointer', transition: 'background 0.08s' }}
            onMouseEnter={e => { if (value !== o.val) e.currentTarget.style.background = '#eff6ff' }}
            onMouseLeave={e => { if (value !== o.val) e.currentTarget.style.background = '#fff' }}>
            {o.label}
          </button>
        ))}
      </div>
    </div>
  )
}

/* ── Range slicer (Age / Mem. Since) ──────────────────────────── */
function RangeSlicer({ title, from, to, onFrom, onTo, onClear, onRemove }) {
  const active = from !== '' || to !== ''
  return (
    <div style={{ border: `1px solid ${active ? '#2563eb' : '#c8d3e0'}`, borderRadius: 4, background: '#fff', display: 'flex', flexDirection: 'column', flex: '0 0 168px', minWidth: 164, overflow: 'hidden', boxShadow: active ? '0 0 0 2px rgba(37,99,235,0.12)' : '0 1px 3px rgba(0,0,0,0.06)' }}>
      <SlicerHeader title={title} active={active} onClear={onClear} onRemove={onRemove} />
      <div style={{ padding: '10px' }}>
        <div style={{ fontSize: 10, color: '#6b7280', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Range</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <input type="number" placeholder="From" value={from} onChange={e => onFrom(e.target.value)}
            style={{ width: 56, padding: '5px 7px', border: '1px solid #d1d5db', borderRadius: 4, fontSize: 12, textAlign: 'center' }} />
          <span style={{ fontSize: 12, color: '#9ca3af' }}>–</span>
          <input type="number" placeholder="To" value={to} onChange={e => onTo(e.target.value)}
            style={{ width: 56, padding: '5px 7px', border: '1px solid #d1d5db', borderRadius: 4, fontSize: 12, textAlign: 'center' }} />
        </div>
      </div>
    </div>
  )
}

/* ── Text search slicer ───────────────────────────────────────── */
function TextSlicer({ title, value, onChange, onClear, onRemove }) {
  const active = value.trim() !== ''
  return (
    <div style={{ border: `1px solid ${active ? '#2563eb' : '#c8d3e0'}`, borderRadius: 4, background: '#fff', display: 'flex', flexDirection: 'column', flex: '0 0 168px', minWidth: 164, overflow: 'hidden', boxShadow: active ? '0 0 0 2px rgba(37,99,235,0.12)' : '0 1px 3px rgba(0,0,0,0.06)' }}>
      <SlicerHeader title={title} active={active} onClear={onClear} onRemove={onRemove} />
      <div style={{ padding: '8px 10px' }}>
        <input type="text" placeholder="Search…" value={value} onChange={e => onChange(e.target.value)}
          style={{ width: '100%', padding: '5px 8px', border: `1px solid ${active ? '#93c5fd' : '#d1d5db'}`, borderRadius: 4, fontSize: 12, boxSizing: 'border-box', outline: 'none' }} />
      </div>
    </div>
  )
}

/* ── Library chip ─────────────────────────────────────────────── */
function SlicerChip({ def, isActive, onClick, onDragStart, onDragEnd, isDragging }) {
  const [hov, setHov] = useState(false)
  const disabled = def.type === 'disabled'
  return (
    <div
      draggable={!disabled && !isActive}
      onClick={!disabled ? onClick : undefined}
      onDragStart={!disabled && !isActive ? e => { e.dataTransfer.setData('slicerKey', def.key); onDragStart() } : undefined}
      onDragEnd={!disabled ? onDragEnd : undefined}
      onMouseEnter={() => !disabled && setHov(true)}
      onMouseLeave={() => setHov(false)}
      title={disabled ? 'Not filterable' : isActive ? 'Click to remove' : 'Click or drag to add'}
      style={{
        padding: '4px 10px', borderRadius: 20,
        border: `1px solid ${disabled ? '#e5e7eb' : isActive ? '#93c5fd' : hov ? '#94a3b8' : '#d1d5db'}`,
        background: disabled ? '#f9fafb' : isActive ? '#dbeafe' : hov ? '#f8fafc' : '#f9fafb',
        color: disabled ? '#c9d1da' : isActive ? '#1d4ed8' : '#374151',
        fontSize: 12, fontWeight: isActive ? 600 : 400,
        cursor: disabled ? 'default' : isActive ? 'pointer' : 'grab',
        opacity: isDragging ? 0.35 : disabled ? 0.55 : 1,
        display: 'flex', alignItems: 'center', gap: 4,
        transition: 'all 0.1s', userSelect: 'none',
        textDecoration: disabled ? 'line-through' : 'none',
      }}>
      {disabled
        ? null
        : isActive
          ? <span style={{ fontSize: 10, color: '#2563eb' }}>✓</span>
          : <span style={{ fontSize: 9, color: '#9ca3af', letterSpacing: '-1px' }}>⠿</span>}
      {def.label}
    </div>
  )
}

/* Phone number validator (Indian 10-digit mobile) */
function validatePhone(raw) {
  if (!raw) return { valid: false, reason: 'No number' }
  const digits = raw.replace(/\D/g, '')
  if (!digits) return { valid: false, reason: 'No number' }
  const local = digits.startsWith('91') && digits.length === 12 ? digits.slice(2) : digits
  if (local.length !== 10) return { valid: false, reason: `${local.length} digit${local.length !== 1 ? 's' : ''}` }
  if (!/^[6-9]/.test(local)) return { valid: false, reason: `Starts with ${local[0]}` }
  return { valid: true }
}

/* Extract first name — drops single-letter initials from start/end */
function firstNameOf(fullName = '') {
  const parts = fullName.trim().split(/\s+/).filter(p => p.length > 1)
  return parts[0] || fullName.trim()
}

/* ══════════════════════════════════════════════════════════════
   Main page
══════════════════════════════════════════════════════════════ */
export default function MemberReportPage() {
  const toast = useToast()

  const [filters, setFilters]             = useState({ ...EMPTY_FILTERS })
  const [filterOpts, setFilterOpts]       = useState({
    genders: [], maritalStatuses: [], relationships: [], membershipTypes: [],
    denominations: [], zonalAreas: [], churches: [], cities: [], states: [],
    baptismTypes: [], workingSectors: [], titles: [], qualifications: [],
  })

  const [activeSlicerKeys, setActiveSlicerKeys] = useState([])
  const [dragKey, setDragKey]                   = useState(null)
  const [dropOver, setDropOver]                 = useState(false)

  const [availKeys, setAvailKeys]   = useState([...ALL_KEYS])
  const [selKeys, setSelKeys]       = useState([])
  const [hlAvail, setHlAvail]       = useState([])
  const [hlSel, setHlSel]           = useState([])

  const { user } = useAuth()

  const [reportTitle, setReportTitle]     = useState('')
  const [reportData, setReportData]       = useState(null)
  const [loading, setLoading]             = useState(false)
  const [exporting, setExporting]         = useState(false)
  const [churchName, setChurchName]       = useState('')
  const [churchMeta, setChurchMeta]       = useState({ address: '', city: '' })
  const [activeTab, setActiveTab]         = useState('report')
  const [hoveredTab, setHoveredTab]       = useState(null)
  const [savedReports, setSavedReports]   = useState([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [deletingId, setDeletingId]       = useState(null)
  const [churchData, setChurchData]       = useState(null)

  // WhatsApp Blast state
  const [waReport, setWaReport]           = useState(null)   // { id, title } of loaded report
  const [waAvail, setWaAvail]             = useState([])     // all members from the saved report
  const [waChecked, setWaChecked]         = useState(new Set()) // member_ids checked for blast
  const [waSearch, setWaSearch]           = useState('')
  const [waInvalidPrompt, setWaInvalidPrompt] = useState(null) // array of invalid members, or null
  const [waMsg, setWaMsg]                 = useState('')
  const [waSending, setWaSending]         = useState(false)
  const [waProgress, setWaProgress]       = useState(null)   // { current, total, results[] }
  const [waAttachment, setWaAttachment]   = useState(null)   // { name, url, type, size, localBlob? }
  const [waUploading, setWaUploading]     = useState(false)
  const [waEditorFocused, setWaEditorFocused] = useState(false)
  const [waRecording, setWaRecording]     = useState(false)
  const [waRecordSecs, setWaRecordSecs]   = useState(0)
  const textareaRef                       = useRef(null)
  const fileInputRef                      = useRef(null)
  const mediaRecorderRef                  = useRef(null)  // holds { stream, source, processor }
  const audioChunksRef                    = useRef([])    // Float32Array PCM chunks
  const timerIntervalRef                  = useRef(null)
  const recordSecsRef                     = useRef(0)

  const fetchHistory = useCallback(async () => {
    setHistoryLoading(true)
    try {
      const { data } = await supabase
        .from('member_report_history')
        .select('*')
        .order('generated_at', { ascending: false })
      setSavedReports(data || [])
    } catch {}
    finally { setHistoryLoading(false) }
  }, [])

  useEffect(() => {
    async function load() {
      const church = await getChurch()
      setChurchData(church)
      setChurchName(church?.church_name || '')
      setChurchMeta({ address: church?.address || '', city: church?.city || '' })
      const { data } = await supabase
        .from('members')
        .select('gender,marital_status,zonal_area,city,state,primary_church_name,relationship_with_fh,denomination,membership_type,baptism_type,working_sector,title,qualification')
        .eq('is_active', true)
      if (data) {
        const uniq = key => [...new Set(data.map(m => m[key]).filter(Boolean))].sort()
        setFilterOpts({
          genders:         uniq('gender'),
          maritalStatuses: uniq('marital_status'),
          relationships:   uniq('relationship_with_fh'),
          membershipTypes: uniq('membership_type'),
          denominations:   uniq('denomination'),
          zonalAreas:      uniq('zonal_area'),
          churches:        uniq('primary_church_name'),
          cities:          uniq('city'),
          states:          uniq('state'),
          baptismTypes:    uniq('baptism_type'),
          workingSectors:  uniq('working_sector'),
          titles:          uniq('title'),
          qualifications:  uniq('qualification'),
        })
      }
    }
    load()
    fetchHistory()
  }, [fetchHistory])

  /* Slicer management */
  function addSlicer(key) { setActiveSlicerKeys(prev => prev.includes(key) ? prev : [...prev, key]) }
  function removeSlicer(key) {
    setActiveSlicerKeys(prev => prev.filter(k => k !== key))
    const def = SLICER_DEFS.find(d => d.key === key)
    if (!def) return
    if (def.type === 'multi')    setFilters(p => ({ ...p, [key]: [] }))
    else if (def.type === 'bool') setFilters(p => ({ ...p, [key]: 'all' }))
    else if (def.type === 'text') setFilters(p => ({ ...p, [key]: '' }))
    else if (def.type === 'age')  setFilters(p => ({ ...p, ageFrom: '', ageTo: '' }))
    else if (def.type === 'range') setFilters(p => ({ ...p, memSinceFrom: '', memSinceTo: '' }))
  }
  function toggleSlicer(key) { activeSlicerKeys.includes(key) ? removeSlicer(key) : addSlicer(key) }

  function toggleMulti(field, val) {
    setFilters(prev => ({ ...prev, [field]: prev[field].includes(val) ? prev[field].filter(v => v !== val) : [...prev[field], val] }))
  }
  function clearField(field) { setFilters(prev => ({ ...prev, [field]: [] })) }

  function applyFilters(members) {
    const chk = (arr, dbField, hasBlank) => {
      if (!arr.length) return true
      return (hasBlank && arr.includes('(blank)') && !members) || // dummy
             (hasBlank && arr.includes('(blank)') && !members[dbField]) ||
             arr.includes(members[dbField])
    }
    return members.filter(m => {
      const mc = (arr, dbf, blank) => !arr.length || (blank && arr.includes('(blank)') && !m[dbf]) || arr.includes(m[dbf])
      if (!mc(filters.gender,        'gender',               true))  return false
      if (!mc(filters.maritalStatus, 'marital_status',       true))  return false
      if (!mc(filters.relationship,  'relationship_with_fh', true))  return false
      if (!mc(filters.membershipType,'membership_type',      false)) return false
      if (!mc(filters.denomination,  'denomination',         false)) return false
      if (!mc(filters.zonalArea,     'zonal_area',           true))  return false
      if (!mc(filters.church,        'primary_church_name',  false)) return false
      if (!mc(filters.city,          'city',                 true))  return false
      if (!mc(filters.stateFilter,   'state',                true))  return false
      if (!mc(filters.baptismType,   'baptism_type',         false)) return false
      if (!mc(filters.workingSector, 'working_sector',       false)) return false
      if (!mc(filters.qualFilter,    'qualification',        false)) return false
      if (filters.ageFrom      !== '' && (m.age                  || 0) < parseInt(filters.ageFrom))      return false
      if (filters.ageTo        !== '' && (m.age                  || 0) > parseInt(filters.ageTo))        return false
      if (filters.memSinceFrom !== '' && (m.membership_from_year || 0) < parseInt(filters.memSinceFrom)) return false
      if (filters.memSinceTo   !== '' && (m.membership_from_year || 0) > parseInt(filters.memSinceTo))   return false
      const bools = [
        ['isFamilyHead','is_family_head'],['confirmationTaken','confirmation_taken'],['isFBRF','is_fbrf_member'],
        ['actMens','act_mens_fellowship'],['actWomens','act_womens_fellowship'],['actYouth','act_youth_association'],
        ['actSS','act_sunday_school'],['actChoir','act_choir'],['actPC','act_pastorate_committee'],
        ['actVM','act_village_ministry'],['actDCC','act_dcc'],['actDC','act_dc'],['actVol','act_volunteers'],
      ]
      for (const [fk, dbf] of bools) if (filters[fk] !== 'all' && !!m[dbf] !== (filters[fk] === 'yes')) return false
      const texts = [
        ['familyIdTxt','family_id'],['memberIdTxt','member_id'],['memberNameTxt','member_name'],
        ['fatherNameTxt','father_name'],['mobileTxt','mobile'],['whatsappTxt','whatsapp'],['emailTxt','email'],['profTxt','profession'],
      ]
      for (const [fk, dbf] of texts) {
        if (filters[fk]?.trim()) {
          if (!String(m[dbf] || '').toLowerCase().includes(filters[fk].toLowerCase())) return false
        }
      }
      return true
    })
  }

  /* Active filter count — computed dynamically from SLICER_DEFS */
  const activeFilterCount = SLICER_DEFS.reduce((count, def) => {
    if (def.type === 'disabled') return count
    if (def.type === 'multi'  && filters[def.key]?.length > 0)  return count + 1
    if (def.type === 'bool'   && filters[def.key] !== 'all')     return count + 1
    if (def.type === 'text'   && filters[def.key]?.trim())       return count + 1
    if (def.type === 'age'    && (filters.ageFrom || filters.ageTo)) return count + 1
    if (def.type === 'range'  && (filters.memSinceFrom || filters.memSinceTo)) return count + 1
    return count
  }, 0)

  /* Render a single active slicer by key */
  function renderSlicer(key) {
    const def = SLICER_DEFS.find(d => d.key === key)
    if (!def || def.type === 'disabled') return null
    if (def.type === 'multi') return (
      <Slicer key={key} title={def.label} options={filterOpts[def.optsKey] || []}
        selected={filters[key]} onToggle={v => toggleMulti(key, v)}
        onClear={() => clearField(key)} showBlank={def.showBlank} onRemove={() => removeSlicer(key)} />
    )
    if (def.type === 'bool') return (
      <BoolSlicer key={key} title={def.label}
        value={filters[key]} onChange={v => setFilters(p => ({ ...p, [key]: v }))}
        onRemove={() => removeSlicer(key)} />
    )
    if (def.type === 'age') return (
      <RangeSlicer key={key} title="Age"
        from={filters.ageFrom} to={filters.ageTo}
        onFrom={v => setFilters(p => ({ ...p, ageFrom: v }))}
        onTo={v => setFilters(p => ({ ...p, ageTo: v }))}
        onClear={() => setFilters(p => ({ ...p, ageFrom: '', ageTo: '' }))}
        onRemove={() => removeSlicer(key)} />
    )
    if (def.type === 'range') return (
      <RangeSlicer key={key} title={def.label}
        from={filters.memSinceFrom} to={filters.memSinceTo}
        onFrom={v => setFilters(p => ({ ...p, memSinceFrom: v }))}
        onTo={v => setFilters(p => ({ ...p, memSinceTo: v }))}
        onClear={() => setFilters(p => ({ ...p, memSinceFrom: '', memSinceTo: '' }))}
        onRemove={() => removeSlicer(key)} />
    )
    if (def.type === 'text') return (
      <TextSlicer key={key} title={def.label}
        value={filters[key]}
        onChange={v => setFilters(p => ({ ...p, [key]: v }))}
        onClear={() => setFilters(p => ({ ...p, [key]: '' }))}
        onRemove={() => removeSlicer(key)} />
    )
    return null
  }

  async function buildAndSave(filteredData) {
    if (selKeys.length === 0 || filteredData.length === 0) return
    const cols  = selKeys.map(key => { const d = ALL_COLS.find(c => c.key === key); return { header: d.label, key, align: d.align || 'center' } })
    const rows  = filteredData.map((m, i) => { const row = {}; selKeys.forEach(key => { const d = ALL_COLS.find(c => c.key === key); row[key] = fmtCell(d, m, i) }); return row })
    const title = reportTitle.trim() || 'Member Report'
    const date  = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
    const addrParts = [churchMeta.address, churchMeta.city].filter(Boolean)
    const titleLines = [
      { text: churchName, bold: true, size: 14, bg: '1E3A5F', color: 'FFFFFF' },
      ...(addrParts.length ? [{ text: addrParts.join(', '), size: 11, bg: '1E3A5F', color: 'FFFFFF' }] : []),
      { text: title, bold: true, size: 12 },
      { text: `Generated on: ${date}  |  Total Members: ${filteredData.length}`, italic: true, size: 10 },
    ]
    const buffer = await exportToExcelWithTitle(cols, rows, 'Member Report', `${title}.xlsx`, titleLines)

    const ts       = new Date().toISOString().replace(/[:.]/g, '-')
    const safe     = title.replace(/[^a-zA-Z0-9 _-]/g, '').trim().replace(/\s+/g, '_')
    const filePath = `${ts}_${safe}.xlsx`
    let storedPath = null
    const { error: upErr } = await supabase.storage
      .from('member-reports')
      .upload(filePath, buffer, { contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', upsert: false })
    if (upErr) {
      toast(`Cloud storage error: ${upErr.message}`, 'error')
    } else {
      storedPath = filePath
    }
    const { error: dbErr } = await supabase.from('member_report_history').insert({
      report_title:  title,
      file_path:     storedPath,
      file_name:     `${title}.xlsx`,
      total_members: filteredData.length,
      has_whatsapp:  selKeys.includes('whatsapp'),
      members_json:  filteredData
        .filter(m => m.whatsapp || m.mobile)
        .map(m => ({ member_id: m.member_id, member_name: m.member_name, title: m.title, whatsapp: m.whatsapp, mobile: m.mobile })),
      created_by:    user?.id || null,
    })
    if (dbErr) {
      toast(`History not saved: ${dbErr.message}`, 'error')
    } else {
      await fetchHistory()
    }
  }

  async function generate() {
    if (selKeys.length === 0) { toast('Select at least one column to include', 'error'); return }
    setLoading(true)
    try {
      const { data, error } = await supabase.from('members').select('*').eq('is_active', true).order('member_id')
      if (error) throw error
      const filtered = applyFilters(data || [])
      setReportData(filtered)
      if (filtered.length > 0) {
        await buildAndSave(filtered)
        toast(`${filtered.length} member${filtered.length !== 1 ? 's' : ''} — report exported & saved`, 'success')
      } else {
        toast('No members match the selected filters', 'error')
      }
    } catch (e) { toast(e.message, 'error') }
    finally { setLoading(false) }
  }

  async function exportExcel() {
    if (!reportData || reportData.length === 0) { toast('No report data to export', 'error'); return }
    setExporting(true)
    try { await buildAndSave(reportData) }
    catch (e) { toast('Export failed: ' + e.message, 'error') }
    finally { setExporting(false) }
  }

  async function downloadSavedReport(filePath, fileName) {
    if (!filePath) { toast('File not stored in cloud — re-export to save', 'error'); return }
    const { data, error } = await supabase.storage
      .from('member-reports')
      .createSignedUrl(filePath, 3600)
    if (error) { toast('Download link failed: ' + error.message, 'error'); return }
    try {
      const res  = await fetch(data.signedUrl)
      const blob = await res.blob()
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href = url; a.download = fileName; a.click()
      URL.revokeObjectURL(url)
    } catch (e) { toast('Download failed: ' + e.message, 'error') }
  }

  async function deleteSavedReport(id, filePath) {
    setDeletingId(id)
    try {
      await supabase.storage.from('member-reports').remove([filePath])
      await supabase.from('member_report_history').delete().eq('id', id)
      setSavedReports(prev => prev.filter(r => r.id !== id))
      toast('Report deleted', 'success')
    } catch { toast('Delete failed', 'error') }
    finally { setDeletingId(null) }
  }

  function loadWaBlast(r) {
    const members = r.members_json || []
    setWaReport({ id: r.id, title: r.report_title })
    setWaAvail(members)
    setWaChecked(new Set(members.map(m => m.member_id))) // default: all checked
    setWaSearch('')
    setWaInvalidPrompt(null)
    setWaMsg('')
    setTimeout(() => { if (textareaRef.current) textareaRef.current.innerHTML = '' }, 0)
    setWaProgress(null)
    setWaAttachment(null)
    setActiveTab('whatsapp')
  }

  /* Derived: members currently checked */
  const waSelected = waAvail.filter(m => waChecked.has(m.member_id))

  /* Checkbox helpers */
  function toggleCheck(id) {
    setWaChecked(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }
  function checkFiltered()   { setWaChecked(prev => new Set([...prev, ...waFiltered.map(m => m.member_id)])) }
  function uncheckFiltered() { setWaChecked(prev => { const next = new Set(prev); waFiltered.forEach(m => next.delete(m.member_id)); return next }) }
  function checkAll()        { setWaChecked(new Set(waAvail.map(m => m.member_id))) }
  function uncheckAll()      { setWaChecked(new Set()) }

  /* Filtered list for the checkbox panel */
  const waFiltered = waSearch.trim()
    ? waAvail.filter(m =>
        m.member_name?.toLowerCase().includes(waSearch.toLowerCase()) ||
        (m.whatsapp || m.mobile || '').includes(waSearch))
    : waAvail

  /* Toolbar: apply rich formatting via execCommand (bold/italic/strikethrough/code) */
  function formatText(marker) {
    const el = textareaRef.current
    if (!el) return
    el.focus()
    if (marker === '*') document.execCommand('bold', false, null)
    else if (marker === '_') document.execCommand('italic', false, null)
    else if (marker === '~') document.execCommand('strikeThrough', false, null)
    else if (marker === '`') {
      const sel = window.getSelection()
      if (!sel || !sel.rangeCount) return
      const range = sel.getRangeAt(0)
      const code  = document.createElement('code')
      code.style.cssText = 'font-family:monospace;background:rgba(100,100,100,.12);padding:1px 5px;border-radius:3px'
      if (range.toString()) {
        try { range.surroundContents(code) } catch { document.execCommand('insertText', false, '`' + range.toString() + '`') }
      } else {
        range.insertNode(code)
      }
    }
    setWaMsg(htmlToWaMd(el))
  }

  /* Toolbar: prefix selected lines (bullet / indent) */
  function prefixLines(linePrefix) {
    const el = textareaRef.current
    if (!el) return
    el.focus()
    document.execCommand('insertText', false, linePrefix)
    setWaMsg(htmlToWaMd(el))
  }

  /* Toolbar: insert blank paragraph */
  function addLineBreak() {
    const el = textareaRef.current
    if (!el) return
    el.focus()
    document.execCommand('insertParagraph', false, null)
    document.execCommand('insertParagraph', false, null)
    setWaMsg(htmlToWaMd(el))
  }

  /* File attachment: upload to bucket, get signed URL */
  async function handleAttachFile(e) {
    const file = e.target.files[0]
    if (!file) return
    e.target.value = ''
    setWaUploading(true)
    try {
      const ext  = file.name.split('.').pop()
      const path = `blast-media/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
      const { error: upErr } = await supabase.storage.from('member-reports').upload(path, file, { upsert: true })
      if (upErr) throw upErr
      setWaAttachment({ name: file.name, storagePath: path, type: file.type, size: file.size })
    } catch (err) {
      toast('Attachment upload failed: ' + err.message, 'error')
    } finally {
      setWaUploading(false)
    }
  }

  function fmtDur(secs) {
    const m = Math.floor(secs / 60)
    const s = secs % 60
    return `${m}:${String(s).padStart(2, '0')}`
  }

  async function startRecording() {
    if (waRecording) return
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      // Prefer OGG Opus — WhatsApp's native voice-note format, works on mobile without re-encoding.
      // Fall back to WebM on browsers that don't support OGG in MediaRecorder (most desktop Chrome).
      const preferOgg = MediaRecorder.isTypeSupported('audio/ogg;codecs=opus')
      const recorder  = preferOgg
        ? new MediaRecorder(stream, { mimeType: 'audio/ogg;codecs=opus' })
        : new MediaRecorder(stream)
      audioChunksRef.current = []
      recordSecsRef.current  = 0
      recorder.ondataavailable = e => { if (e.data.size > 0) audioChunksRef.current.push(e.data) }
      recorder.start()
      mediaRecorderRef.current = { stream, recorder }
      setWaRecording(true)
      setWaRecordSecs(0)
      timerIntervalRef.current = setInterval(() => {
        recordSecsRef.current += 1
        setWaRecordSecs(recordSecsRef.current)
      }, 1000)
    } catch (err) {
      toast('Microphone access denied: ' + err.message, 'error')
    }
  }

  function stopRecording() {
    if (!waRecording) return
    clearInterval(timerIntervalRef.current)
    const dur = recordSecsRef.current
    const { stream, recorder } = mediaRecorderRef.current || {}
    setWaRecording(false)
    setWaRecordSecs(0)
    setWaUploading(true)

    recorder.onstop = async () => {
      try {
        const recMime = recorder.mimeType || 'audio/webm'
        const rawBlob = new Blob(audioChunksRef.current, { type: recMime })

        let uploadBlob, ext, contentType

        if (recMime.includes('ogg')) {
          // Firefox records OGG Opus natively — use directly
          uploadBlob = rawBlob; ext = '.ogg'; contentType = 'audio/ogg'
        } else {
          // Chrome/Edge records WebM — convert to OGG Opus via WebCodecs (Chrome 94+)
          const ogg = await rawBlobToOggOpus(rawBlob)
          if (ogg) {
            uploadBlob = ogg; ext = '.ogg'; contentType = 'audio/ogg'
          } else {
            // Fallback: encode to MP3 (Safari / older browsers — plays as document)
            const arrayBuf = await rawBlob.arrayBuffer()
            const ctx      = new AudioContext({ sampleRate: 44100 })
            const decoded  = await ctx.decodeAudioData(arrayBuf).finally(() => ctx.close())
            const pcmF     = decoded.getChannelData(0)
            const pcmI16   = new Int16Array(pcmF.length)
            for (let i = 0; i < pcmF.length; i++)
              pcmI16[i] = Math.max(-32768, Math.min(32767, Math.round(pcmF[i] * 32767)))
            const enc   = new lamejs.Mp3Encoder(1, 44100, 128)
            const parts = []
            for (let i = 0; i < pcmI16.length; i += 1152) {
              const chunk = enc.encodeBuffer(pcmI16.subarray(i, i + 1152))
              if (chunk.length > 0) parts.push(new Uint8Array(chunk))
            }
            const tail = enc.flush()
            if (tail.length > 0) parts.push(new Uint8Array(tail))
            uploadBlob = new Blob(parts, { type: 'audio/mpeg' })
            ext = '.mp3'; contentType = 'audio/mpeg'
          }
        }

        const localUrl = URL.createObjectURL(uploadBlob)
        const path     = `blast-media/${Date.now()}-voice${ext}`
        const { error: upErr } = await supabase.storage
          .from('member-reports')
          .upload(path, uploadBlob, { contentType, upsert: true })
        if (upErr) throw upErr
        setWaAttachment({ name: `Voice message (${fmtDur(dur)})`, storagePath: path, type: contentType, size: uploadBlob.size, localBlob: localUrl })
      } catch (err) {
        toast('Voice upload failed: ' + err.message, 'error')
      } finally {
        setWaUploading(false)
        stream?.getTracks().forEach(t => t.stop())
      }
    }

    recorder.stop()
  }

  async function sendBlast() {
    if (!waSelected.length) { toast('No recipients selected', 'error'); return }
    if (!waMsg.trim() && !waAttachment) { toast('Please enter a message or attach a file', 'error'); return }

    // Validate all selected phone numbers
    const invalid = waSelected.filter(m => !validatePhone(m.whatsapp || m.mobile).valid)
    if (invalid.length) {
      setWaInvalidPrompt(invalid)
      return
    }
    doSendBlast(waSelected)
  }

  async function doSendBlast(recipients) {
    setWaInvalidPrompt(null)
    setWaSending(true)
    setWaProgress({ current: 0, total: waSelected.length, results: [] })

    // Generate a fresh signed URL valid for 2 hours — enough for any blast size
    let blastMediaUrl
    if (waAttachment?.storagePath) {
      const { data: fresh, error: urlErr } = await supabase.storage
        .from('member-reports')
        .createSignedUrl(waAttachment.storagePath, 7200)
      if (urlErr) {
        toast('Could not prepare media URL: ' + urlErr.message, 'error')
        setWaSending(false)
        return
      }
      blastMediaUrl = fresh.signedUrl
    }

    for (let i = 0; i < recipients.length; i++) {
      const m   = recipients[i]
      const raw = (m.whatsapp || m.mobile || '').replace(/\D/g, '')
      const to  = raw ? (raw.startsWith('91') ? raw : `91${raw}`) : null
      const msg = waMsg
        .replace(/{Title}/g,      m.title                    || '')
        .replace(/{FirstName}/g,  firstNameOf(m.member_name))
        .replace(/{MemberName}/g, m.member_name              || '')
        .replace(/{MemberID}/g,   m.member_id                || '')
        .replace(/{Mobile}/g,     m.mobile                   || '')
      let status = 'failed'; let errText = ''
      if (!to) { status = 'skipped'; errText = 'No number' }
      else {
        try {
          await sendWhatsAppMessage(churchData, { to, message: msg, mediaUrl: blastMediaUrl, mediaType: waAttachment?.type })
          status = 'sent'
        } catch (e) { errText = e.message }
      }
      setWaProgress(prev => ({
        current: i + 1, total: prev.total,
        results: [...prev.results, { ...m, status, errText }],
      }))
      if (i < recipients.length - 1) await new Promise(r => setTimeout(r, 1200))
    }
    setWaSending(false)
  }

  /* Column list helpers */
  function colLabel(key) { return ALL_COLS.find(c => c.key === key)?.label || key }
  function moveToCols()   { if (!hlAvail.length) return; setSelKeys(p => [...p, ...hlAvail.filter(k => !p.includes(k))]); setAvailKeys(p => p.filter(k => !hlAvail.includes(k))); setHlAvail([]) }
  function removeFromCols(){ if (!hlSel.length)  return; setAvailKeys(() => ALL_KEYS.filter(k => !selKeys.includes(k) || hlSel.includes(k))); setSelKeys(p => p.filter(k => !hlSel.includes(k))); setHlSel([]) }
  function moveAllToCols() { setSelKeys(p => [...p, ...availKeys]); setAvailKeys([]); setHlAvail([]) }
  function removeAll()     { setAvailKeys([...ALL_KEYS]); setSelKeys([]); setHlSel([]); setHlAvail([]) }
  function moveUp()   { if (hlSel.length !== 1) return; const i = selKeys.indexOf(hlSel[0]); if (i <= 0) return; const a=[...selKeys];[a[i-1],a[i]]=[a[i],a[i-1]];setSelKeys(a) }
  function moveDown() { if (hlSel.length !== 1) return; const i = selKeys.indexOf(hlSel[0]); if (i >= selKeys.length-1) return; const a=[...selKeys];[a[i],a[i+1]]=[a[i+1],a[i]];setSelKeys(a) }
  function clickAvail(key,e){ if(e.ctrlKey||e.metaKey)setHlAvail(p=>p.includes(key)?p.filter(k=>k!==key):[...p,key]);else setHlAvail([key]) }
  function clickSel(key,e)  { if(e.ctrlKey||e.metaKey)setHlSel(p=>p.includes(key)?p.filter(k=>k!==key):[...p,key]);  else setHlSel([key])   }

  const PREVIEW_MAX = 200

  const card    = { background:'var(--card-bg)', border:'1px solid var(--card-border)', borderRadius:10, padding:'16px 18px', marginBottom:16 }
  const lbl     = { fontSize:11, fontWeight:700, color:'var(--text-2)', textTransform:'uppercase', letterSpacing:'0.08em' }
  const btn     = (pri,danger) => ({ padding:'7px 16px', borderRadius:7, border:(!pri&&!danger)?'1px solid var(--card-border)':'none', cursor:'pointer', fontSize:13, fontWeight:600, background:danger?'var(--danger)':pri?'var(--accent)':'var(--card-bg)', color:(pri||danger)?'var(--accent-text)':'var(--text-1)', display:'flex', alignItems:'center', gap:6 })
  const listBox = { border:'1px solid var(--card-border)', borderRadius:7, height:260, overflowY:'auto', background:'var(--card-bg)' }
  const listItm = hl => ({ padding:'5px 10px', fontSize:12, cursor:'pointer', background:hl?'var(--accent)':'transparent', color:hl?'var(--accent-text)':'var(--text-1)' })
  const th      = { padding:'8px 10px', background:'var(--accent)', color:'var(--accent-text)', fontSize:11, fontWeight:700, whiteSpace:'nowrap', textAlign:'center', borderRight:'1px solid rgba(255,255,255,0.1)' }
  const td      = i => ({ padding:'6px 10px', fontSize:12, color:'var(--text-1)', borderBottom:'1px solid var(--card-border)', background:i%2===0?'var(--card-bg)':'var(--card-header-bg)', whiteSpace:'nowrap' })

  return (
    <div style={{ padding:'24px 28px', maxWidth:1400, margin:'0 auto' }}>

      {/* Header */}
      <div style={{ marginBottom:20, display:'flex', alignItems:'center', gap:12 }}>
        <div style={{ width:44, height:44, borderRadius:10, background:'linear-gradient(135deg,var(--accent),var(--accent-hover))', display:'flex', alignItems:'center', justifyContent:'center' }}>
          <Users size={22} color="var(--accent-text)" />
        </div>
        <div>
          <h1 style={{ fontSize:22, fontWeight:700, color:'var(--text-1)', margin:0 }}>Member Report</h1>
          <p style={{ fontSize:13, color:'var(--text-2)', margin:'2px 0 0' }}>Custom filtered member list with column selection</p>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display:'flex', gap:2, marginBottom:16, borderBottom:'2px solid var(--card-border)' }}>
        {[
          { id:'report',   label:'Custom Report',  Icon:ListFilter   },
          { id:'history',  label:'Saved Reports',  Icon:Clock,       badge: savedReports.length || null },
          ...(waReport ? [{ id:'whatsapp', label:'WhatsApp Blast', Icon:MessageSquare }] : []),
        ].map(({id,label,Icon,badge})=>(
          <button key={id}
            onClick={()=>setActiveTab(id)}
            onMouseEnter={()=>setHoveredTab(id)}
            onMouseLeave={()=>setHoveredTab(null)}
            className="no-lift"
            style={{
              padding:'9px 18px', border:'none', outline:'none', cursor:'pointer',
              fontSize:13, fontWeight:600, display:'flex', alignItems:'center', gap:6,
              borderRadius: (activeTab===id || hoveredTab===id) ? '7px 7px 0 0' : 4,
              background: (activeTab===id || hoveredTab===id) ? 'var(--accent)' : 'transparent',
              color: (activeTab===id || hoveredTab===id) ? '#fff' : 'var(--text-2)',
              borderBottom: activeTab===id ? '2px solid var(--accent)' : '2px solid transparent',
              marginBottom: -2,
              transition: 'background 0.15s, color 0.15s',
            }}>
            <Icon size={14}/>{label}
            {badge != null && <span style={{
              background: (activeTab===id || hoveredTab===id) ? 'rgba(255,255,255,0.2)' : 'var(--card-header-bg)',
              color: (activeTab===id || hoveredTab===id) ? '#fff' : 'var(--text-2)',
              borderRadius:10, padding:'0px 7px', fontSize:11, fontWeight:700,
            }}>{badge}</span>}
          </button>
        ))}
      </div>

      {/* ═══ REPORT TAB ═══ */}
      {activeTab === 'report' && (<>

        {/* Slicer Library */}
        <div style={card}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12 }}>
            <div>
              <div style={{ fontSize:13, fontWeight:700, color:'#1e293b', marginBottom:2 }}>Slicer Library</div>
              <div style={{ fontSize:11, color:'#64748b' }}>Click or drag any slicer into the filter area below &nbsp;·&nbsp; <span style={{ textDecoration:'line-through', color:'#c9d1da' }}>strikethrough</span> = not filterable</div>
            </div>
          </div>
          <div style={{ display:'grid', gridTemplateColumns: '1fr 1fr', gap:12, alignItems: 'start' }}>
            {SLICER_GROUPS.map(group => (
              <div key={group.label} style={{ paddingRight: 8 }}>
                <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6 }}>
                  <span style={{ fontSize:10, fontWeight:700, color:group.color, textTransform:'uppercase', letterSpacing:'0.1em', whiteSpace:'nowrap' }}>{group.label}</span>
                  <div style={{ flex:1, height:1, background:'#f0f4f8' }} />
                </div>
                <div style={{ display:'flex', flexWrap:'wrap', gap:8, alignItems:'center' }}>
                  {group.slicers.map(def => (
                    <SlicerChip key={def.key} def={def}
                      isActive={activeSlicerKeys.includes(def.key)}
                      onClick={() => def.type !== 'disabled' && toggleSlicer(def.key)}
                      onDragStart={() => setDragKey(def.key)}
                      onDragEnd={() => setDragKey(null)}
                      isDragging={dragKey === def.key} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Active Slicers drop zone */}
        <div style={{ ...card, padding:0 }}>
          <div style={{ padding:'10px 16px', borderBottom: activeSlicerKeys.length>0 ? '1px solid #e2e8f0' : 'none', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
              <ListFilter size={14} color="#2563eb" />
              <span style={{ fontSize:13, fontWeight:700, color:'#1e293b' }}>Active Slicers</span>
              {activeSlicerKeys.length > 0 && <span style={{ background:'#e0e7ff', color:'#3730a3', borderRadius:10, padding:'1px 8px', fontSize:11, fontWeight:700 }}>{activeSlicerKeys.length}</span>}
              {activeFilterCount > 0 && <span style={{ background:'#2563eb', color:'#fff', borderRadius:10, padding:'1px 8px', fontSize:11, fontWeight:700 }}>{activeFilterCount} filter{activeFilterCount!==1?'s':''} active</span>}
            </div>
            {(activeSlicerKeys.length>0 || activeFilterCount>0) && (
              <button onClick={() => { setActiveSlicerKeys([]); setFilters({...EMPTY_FILTERS}) }} style={{ ...btn(false,false), padding:'4px 12px', fontSize:12, color:'#ef4444' }}>Clear All</button>
            )}
          </div>
          <div
            onDragOver={e => { e.preventDefault(); setDropOver(true) }}
            onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget)) setDropOver(false) }}
            onDrop={e => { e.preventDefault(); const key=e.dataTransfer.getData('slicerKey')||dragKey; if(key)addSlicer(key); setDragKey(null);setDropOver(false) }}
            style={{ padding: activeSlicerKeys.length===0 ? '28px 20px' : '14px', minHeight: activeSlicerKeys.length===0 ? 90 : 'auto', border: dropOver ? '2px dashed #2563eb' : '2px dashed transparent', borderRadius:'0 0 10px 10px', background: dropOver ? '#eff6ff' : 'transparent', transition:'all 0.15s' }}>
            {activeSlicerKeys.length===0 && <div style={{ textAlign:'center', color:dropOver?'#2563eb':'#94a3b8', fontSize:13, pointerEvents:'none' }}>{dropOver ? '↓ Drop slicer here' : 'Drag slicers here, or click chips in the library above'}</div>}
            {activeSlicerKeys.length>0 && <div style={{ display:'flex', flexWrap:'wrap', gap:10, alignItems:'flex-start' }}>{activeSlicerKeys.map(key=>renderSlicer(key))}</div>}
          </div>
        </div>

        {/* Column selection */}
        <div style={card}>
          <div style={{ fontSize:14, fontWeight:700, color:'#1e293b', marginBottom:14, display:'flex', alignItems:'center', gap:6 }}>
            Column Selection <span style={{ fontSize:12, color:'#64748b', fontWeight:400 }}>(Ctrl+click for multiple · double-click to move)</span>
          </div>
          <div style={{ display:'flex', gap:10, alignItems:'stretch' }}>
            <div style={{ flex:1 }}>
              <div style={{ ...lbl, marginBottom:5 }}>Available ({availKeys.length})</div>
              <div style={listBox} onDoubleClick={moveToCols}>
                {availKeys.map(key=><div key={key} onClick={e=>clickAvail(key,e)} style={listItm(hlAvail.includes(key))}>{colLabel(key)}</div>)}
              </div>
            </div>
            <div style={{ display:'flex', flexDirection:'column', justifyContent:'center', gap:6, padding:'0 4px' }}>
              <button onClick={moveToCols}    style={{ ...btn(true,false),  padding:'6px 12px', fontSize:14 }} title="Move selected">⇒</button>
              <button onClick={removeFromCols} style={{ ...btn(false,false), padding:'6px 12px', fontSize:14 }} title="Remove selected">⇐</button>
              <div style={{ height:8 }} />
              <button onClick={moveAllToCols} style={{ ...btn(false,false), padding:'5px 10px', fontSize:11 }} title="Select All">All ⇒</button>
              <button onClick={removeAll}      style={{ ...btn(false,false), padding:'5px 10px', fontSize:11 }} title="Deselect All">⇐ All</button>
            </div>
            <div style={{ flex:1 }}>
              <div style={{ ...lbl, marginBottom:5 }}>Selected ({selKeys.length})</div>
              <div style={listBox} onDoubleClick={removeFromCols}>
                {selKeys.map(key=><div key={key} onClick={e=>clickSel(key,e)} style={listItm(hlSel.includes(key))}>{colLabel(key)}</div>)}
              </div>
            </div>
            <div style={{ display:'flex', flexDirection:'column', justifyContent:'center', gap:6, padding:'0 4px' }}>
              <button onClick={moveUp}   style={{ ...btn(false,false), padding:'6px 10px' }} title="Move up"><ChevronUp   size={14}/></button>
              <button onClick={moveDown} style={{ ...btn(false,false), padding:'6px 10px' }} title="Move down"><ChevronDown size={14}/></button>
            </div>
          </div>
        </div>

        {/* Title + Generate */}
        <div style={{ ...card, display:'flex', gap:12, alignItems:'flex-end', flexWrap:'wrap' }}>
          <div style={{ flex:1, minWidth:220 }}>
            <div style={{ ...lbl, marginBottom:6 }}>Report Title</div>
            <input type="text" placeholder="e.g. Unmarried Women aged 20–25" value={reportTitle} onChange={e=>setReportTitle(e.target.value)}
              style={{ width:'100%', padding:'8px 12px', border:'1px solid #cbd5e1', borderRadius:7, fontSize:13, boxSizing:'border-box' }} />
          </div>
          <button onClick={generate} disabled={loading} className="action-btn" style={{ background:'var(--accent)', opacity:loading?0.7:1, padding:'9px 22px', fontSize:14 }}>
            {loading ? <><RefreshCw size={14} style={{animation:'spin .7s linear infinite'}}/> Generating…</> : <><ListFilter size={14}/> Generate &amp; Export</>}
          </button>
        </div>

        {/* Results */}
        {reportData===null && <div style={{ textAlign:'center', padding:'48px 0', color:'#94a3b8', fontSize:14 }}>Add slicers, select columns, then click Generate Report</div>}
        {reportData!==null && reportData.length===0 && <div style={{ textAlign:'center', padding:'48px 0', color:'#94a3b8', fontSize:14 }}>No members match the selected filters</div>}
        {reportData!==null && reportData.length>0 && (
          <div style={card}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:14, flexWrap:'wrap', gap:8 }}>
              <div>
                <span style={{ fontWeight:700, color:'#1e293b', fontSize:15 }}>{reportTitle||'Member Report'}</span>
                <span style={{ marginLeft:10, fontSize:13, color:'#64748b' }}>{reportData.length} member{reportData.length!==1?'s':''}{reportData.length>PREVIEW_MAX?` (showing first ${PREVIEW_MAX})`:''}</span>
              </div>
              <button onClick={exportExcel} disabled={exporting||selKeys.length===0} className="action-btn" style={{ background:'#16a34a', opacity:(exporting||selKeys.length===0)?0.6:1 }}>
                {exporting?<><RefreshCw size={13} style={{animation:'spin .7s linear infinite'}}/> Exporting…</>:<><FileSpreadsheet size={13}/> Excel Export</>}
              </button>
            </div>
            {selKeys.length===0
              ? <div style={{ color:'#94a3b8', fontSize:13, textAlign:'center', padding:24 }}>Select columns above to view the report</div>
              : <div style={{ overflowX:'auto' }}>
                  <table style={{ borderCollapse:'collapse', width:'100%', minWidth:400 }}>
                    <thead><tr>{selKeys.map(k=><th key={k} style={th}>{colLabel(k)}</th>)}</tr></thead>
                    <tbody>
                      {reportData.slice(0,PREVIEW_MAX).map((row,i)=>(
                        <tr key={row.member_id||i}>
                          {selKeys.map(k=>{ const d=ALL_COLS.find(c=>c.key===k); return <td key={k} style={{...td(i),textAlign:d.align||'center'}}>{fmtCell(d,row,i)}</td> })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {reportData.length>PREVIEW_MAX && <div style={{ textAlign:'center', padding:'10px 0', fontSize:12, color:'#94a3b8' }}>Showing {PREVIEW_MAX} of {reportData.length} — Export to Excel for full list</div>}
                </div>}
          </div>
        )}
      </>)}

      {/* ═══ SAVED REPORTS TAB ═══ */}
      {activeTab === 'history' && (
        <div>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:14 }}>
            <div style={{ fontSize:13, color:'var(--text-2)' }}>Reports are saved automatically on Generate. Newest first.</div>
            <button onClick={fetchHistory} style={{ ...btn(false,false), padding:'6px 12px', fontSize:12 }}><RefreshCw size={13}/> Refresh</button>
          </div>
          {historyLoading && (
            <div style={{ textAlign:'center', padding:'48px 0', color:'var(--text-3)', fontSize:14 }}>
              <RefreshCw size={18} style={{ animation:'spin .7s linear infinite', marginBottom:8 }}/><br/>Loading saved reports…
            </div>
          )}
          {!historyLoading && savedReports.length === 0 && (
            <div style={{ textAlign:'center', padding:'48px 0', color:'var(--text-3)', fontSize:14 }}>
              No saved reports yet. Click Generate &amp; Export on the Custom Report tab.
            </div>
          )}
          {!historyLoading && savedReports.map((r) => {
            const dt      = new Date(r.generated_at)
            const dateStr = dt.toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' })
            const timeStr = dt.toLocaleTimeString('en-IN', { hour:'2-digit', minute:'2-digit', hour12: true })
            return (
              <div key={r.id} style={{ ...card, display:'flex', alignItems:'center', gap:14, flexWrap:'wrap' }}>
                <div style={{ width:42, height:42, borderRadius:9, background:'linear-gradient(135deg,var(--accent),var(--accent-hover))', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                  <FileSpreadsheet size={18} color="var(--accent-text)"/>
                </div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontWeight:700, fontSize:14, color:'var(--text-1)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                    {r.report_title}
                  </div>
                  <div style={{ fontSize:12, color:'var(--text-2)', marginTop:4, display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
                    <Calendar size={11} style={{ color:'var(--accent)', flexShrink:0 }}/>
                    <span>{dateStr}</span>
                    <Clock size={11} style={{ color:'var(--accent)', flexShrink:0 }}/>
                    <span>{timeStr}</span>
                    <span style={{ color:'var(--text-3)' }}>·</span>
                    <span style={{ fontWeight:600, color:'var(--accent)' }}>{r.total_members}</span>
                    <span>member{r.total_members !== 1 ? 's' : ''}</span>
                    {r.has_whatsapp && (
                      <svg title="Includes WhatsApp column" width="13" height="13" viewBox="0 0 24 24" fill="#25d366" style={{ flexShrink:0 }}><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                    )}
                  </div>
                </div>
                <div style={{ display:'flex', gap:8, flexShrink:0, flexWrap:'wrap' }}>
                  {r.has_whatsapp && (r.members_json?.length > 0) && (
                    <button onClick={() => loadWaBlast(r)} className="action-btn" style={{ background:'#25d366' }}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                      Send WhatsApp
                    </button>
                  )}
                  <button onClick={() => downloadSavedReport(r.file_path, r.file_name)}
                    title={r.file_path ? 'Download Excel to computer' : 'File not stored — re-export to save'}
                    className="action-btn"
                    style={{ background:'var(--sidebar-bg)', color:'#ffffff', opacity: r.file_path ? 1 : 0.4 }}>
                    <Download size={13}/> Download
                  </button>
                  <button onClick={() => deleteSavedReport(r.id, r.file_path)} disabled={deletingId === r.id}
                    style={{ ...btn(false,false), padding:'7px 10px', fontSize:12, color:'var(--danger)', opacity: deletingId===r.id ? 0.5 : 1 }}>
                    {deletingId === r.id ? <RefreshCw size={13} style={{animation:'spin .7s linear infinite'}}/> : <Trash2 size={13}/>}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ═══ WHATSAPP BLAST TAB ═══ */}
      {activeTab === 'whatsapp' && waReport && (<>

        {/* Report banner */}
        <div style={{ ...card, background:'var(--accent-subtle)', border:'1px solid var(--info-border)', display:'flex', alignItems:'center', justifyContent:'space-between', gap:12, flexWrap:'wrap' }}>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="#25d366"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
            <div>
              <div style={{ fontWeight:700, fontSize:13, color:'var(--text-1)' }}>{waReport.title}</div>
              <div style={{ fontSize:12, color:'var(--text-2)' }}>{waAvail.length} members with WhatsApp / mobile</div>
            </div>
          </div>
          <button onClick={() => { setWaReport(null); setActiveTab('history') }} style={{ ...btn(false,false), padding:'5px 12px', fontSize:12 }}>← Back to Saved Reports</button>
        </div>

        {/* Step 1 — Recipient picker */}
        <div style={card}>
          {/* Toolbar row */}
          <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:10, flexWrap:'wrap' }}>
            <div style={{ ...lbl, marginRight:4 }}>Step 1 — Select Recipients</div>
            <div style={{ flex:1 }}/>
            <span style={{ fontSize:12, color:'var(--text-2)' }}>
              <span style={{ fontWeight:700, color:'var(--accent)' }}>{waSelected.length}</span> of {waAvail.length} selected
            </span>
            <button onClick={checkAll}   className="no-lift" style={{ ...btn(false,false), padding:'4px 10px', fontSize:12 }}>All</button>
            <button onClick={uncheckAll} className="no-lift" style={{ ...btn(false,false), padding:'4px 10px', fontSize:12 }}>None</button>
          </div>

          {/* Search */}
          <input
            type="text" placeholder="Search by name or number…"
            value={waSearch} onChange={e => setWaSearch(e.target.value)}
            style={{ width:'100%', padding:'7px 12px', border:'1px solid var(--card-border)', borderRadius:7, fontSize:13, boxSizing:'border-box', background:'var(--card-bg)', color:'var(--text-1)', outline:'none', marginBottom:8 }}
          />
          {waSearch && (
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', fontSize:11, color:'var(--text-2)', marginBottom:6 }}>
              <span>{waFiltered.length} match{waFiltered.length!==1?'es':''}</span>
              <div style={{ display:'flex', gap:6 }}>
                <button onClick={checkFiltered}   className="no-lift" style={{ ...btn(false,false), padding:'2px 8px', fontSize:11 }}>Check matches</button>
                <button onClick={uncheckFiltered} className="no-lift" style={{ ...btn(false,false), padding:'2px 8px', fontSize:11 }}>Uncheck matches</button>
              </div>
            </div>
          )}

          {/* Checkbox list */}
          <div style={{ border:'1px solid var(--card-border)', borderRadius:7, maxHeight:280, overflowY:'auto', background:'var(--card-bg)' }}>
            {waFiltered.length === 0 && (
              <div style={{ textAlign:'center', padding:24, color:'var(--text-3)', fontSize:13 }}>No members found</div>
            )}
            {waFiltered.map((m, idx) => {
              const num       = m.whatsapp || m.mobile || ''
              const vld       = validatePhone(num)
              const checked   = waChecked.has(m.member_id)
              return (
                <label key={m.member_id} style={{
                  display:'flex', alignItems:'center', gap:10, padding:'8px 12px',
                  cursor:'pointer', userSelect:'none',
                  borderBottom: idx < waFiltered.length - 1 ? '1px solid var(--card-border)' : 'none',
                  background: checked ? 'var(--accent-subtle,rgba(99,102,241,0.06))' : 'transparent',
                  transition:'background 0.1s',
                }}>
                  <input type="checkbox" checked={checked} onChange={() => toggleCheck(m.member_id)}
                    style={{ width:15, height:15, accentColor:'var(--accent)', flexShrink:0, cursor:'pointer' }}/>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:13, fontWeight:600, color:'var(--text-1)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{m.member_name}</div>
                    <div style={{ fontSize:11, color:'var(--text-2)', marginTop:1 }}>{num || '—'}</div>
                  </div>
                  {/* Validity badge */}
                  {vld.valid
                    ? <span style={{ fontSize:10, fontWeight:700, color:'#16a34a', background:'#f0fdf4', padding:'2px 7px', borderRadius:10, flexShrink:0 }}>✓ Valid</span>
                    : num
                    ? <span style={{ fontSize:10, fontWeight:700, color:'#d97706', background:'#fffbeb', padding:'2px 7px', borderRadius:10, flexShrink:0 }} title={vld.reason}>⚠ {vld.reason}</span>
                    : <span style={{ fontSize:10, fontWeight:700, color:'var(--text-3)', background:'var(--card-header-bg)', padding:'2px 7px', borderRadius:10, flexShrink:0 }}>No number</span>
                  }
                </label>
              )
            })}
          </div>
        </div>

        {/* Step 2 — Message composer */}
        <div style={card}>
          <div style={{ ...lbl, marginBottom:10 }}>Step 2 — Compose Message</div>

          {/* Placeholders */}
          <div style={{ fontSize:12, color:'var(--text-2)', marginBottom:10 }}>
            Placeholders:&nbsp;{['{Title}','{FirstName}','{MemberName}','{MemberID}','{Mobile}'].map(p =>
              <code key={p} style={{ background:'var(--accent-subtle)', color:'var(--accent)', padding:'1px 6px', borderRadius:4, marginRight:5, fontSize:11, cursor:'pointer' }}
                onClick={() => {
                  const el = textareaRef.current
                  if (!el) return
                  el.focus()
                  document.execCommand('insertText', false, p)
                  setWaMsg(htmlToWaMd(el))
                }}>{p}</code>
            )}
          </div>

          {/* Formatting toolbar */}
          <div style={{ display:'flex', alignItems:'center', gap:4, flexWrap:'wrap', padding:'6px 8px', background:'var(--card-header-bg)', border:'1px solid var(--card-border)', borderBottom:'none', borderRadius:'7px 7px 0 0' }}>
            {[
              { title:'Bold',          Icon:Bold,          action:() => formatText('*') },
              { title:'Italic',        Icon:Italic,        action:() => formatText('_') },
              { title:'Strikethrough', Icon:Strikethrough, action:() => formatText('~') },
            ].map(({ title, Icon, action }) => (
              <button key={title} title={title} onClick={action} className="no-lift"
                style={{ padding:'4px 7px', borderRadius:5, border:'1px solid var(--card-border)', background:'var(--card-bg)', color:'var(--text-1)', cursor:'pointer', display:'flex', alignItems:'center' }}>
                <Icon size={13}/>
              </button>
            ))}
            <div style={{ width:1, height:18, background:'var(--card-border)', margin:'0 2px' }}/>
            <button title="Bullet point" onClick={() => prefixLines('- ')} className="no-lift"
              style={{ padding:'4px 7px', borderRadius:5, border:'1px solid var(--card-border)', background:'var(--card-bg)', color:'var(--text-1)', cursor:'pointer', display:'flex', alignItems:'center' }}>
              <List size={13}/>
            </button>
            <button title="Indent (4 spaces)" onClick={() => prefixLines('    ')} className="no-lift"
              style={{ padding:'4px 7px', borderRadius:5, border:'1px solid var(--card-border)', background:'var(--card-bg)', color:'var(--text-1)', cursor:'pointer', display:'flex', alignItems:'center' }}>
              <Indent size={13}/>
            </button>
            <button title="Extra line break" onClick={addLineBreak} className="no-lift"
              style={{ padding:'4px 7px', borderRadius:5, border:'1px solid var(--card-border)', background:'var(--card-bg)', color:'var(--text-1)', cursor:'pointer', display:'flex', alignItems:'center' }}>
              <CornerDownLeft size={13}/>
            </button>
            <div style={{ width:1, height:18, background:'var(--card-border)', margin:'0 2px' }}/>
            {/* Attach file */}
            <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp,application/pdf,audio/mpeg,audio/ogg,audio/aac,audio/mp4,audio/amr,audio/wav" style={{ display:'none' }} onChange={handleAttachFile}/>
            <button title="Attach file (image / PDF / audio)" onClick={() => fileInputRef.current?.click()} disabled={waUploading || waRecording} className="no-lift"
              style={{ padding:'4px 9px', borderRadius:5, border:'1px solid var(--card-border)', background: (waAttachment && !waAttachment.localBlob) ? '#f0fdf4' : 'var(--card-bg)', color: (waAttachment && !waAttachment.localBlob) ? '#16a34a' : 'var(--text-1)', cursor:'pointer', display:'flex', alignItems:'center', gap:4, fontSize:12, fontWeight:600 }}>
              {waUploading ? <RefreshCw size={13} style={{animation:'spin .7s linear infinite'}}/> : <Paperclip size={13}/>}
              {(waAttachment && !waAttachment.localBlob) ? 'Replace' : 'Attach'}
            </button>
            {/* Record voice */}
            {!waRecording ? (
              <button title="Record voice message" onClick={startRecording} disabled={waUploading} className="no-lift"
                style={{ padding:'4px 9px', borderRadius:5, border:'1px solid var(--card-border)', background: waAttachment?.localBlob ? '#fdf4ff' : 'var(--card-bg)', color: waAttachment?.localBlob ? '#7c3aed' : 'var(--text-1)', cursor:'pointer', display:'flex', alignItems:'center', gap:4, fontSize:12, fontWeight:600 }}>
                <Mic size={13}/>{waAttachment?.localBlob ? 'Re-record' : 'Record'}
              </button>
            ) : (
              <button title="Stop recording" onClick={stopRecording} className="no-lift"
                style={{ padding:'4px 9px', borderRadius:5, border:'1px solid #ef4444', background:'#fef2f2', color:'#ef4444', cursor:'pointer', display:'flex', alignItems:'center', gap:5, fontSize:12, fontWeight:700, animation:'pulse 1s ease-in-out infinite' }}>
                <Square size={12} style={{ fill:'#ef4444' }}/> Stop &nbsp;{fmtDur(waRecordSecs)}
              </button>
            )}
          </div>

          {/* Recording status bar */}
          {waRecording && (
            <div style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 14px', border:'1px solid #ef4444', borderTop:'none', background:'#fef2f2', color:'#ef4444', fontSize:13, fontWeight:600 }}>
              <span style={{ width:8, height:8, borderRadius:'50%', background:'#ef4444', display:'inline-block', animation:'pulse 1s ease-in-out infinite', flexShrink:0 }}/>
              Recording… {fmtDur(waRecordSecs)}
              <span style={{ fontSize:11, fontWeight:400, color:'#ef4444', marginLeft:4 }}>Click Stop when done</span>
            </div>
          )}

          {/* Uploading status */}
          {waUploading && !waRecording && (
            <div style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 14px', border:'1px solid var(--card-border)', borderTop:'none', background:'var(--card-header-bg)', fontSize:12, color:'var(--text-2)' }}>
              <RefreshCw size={13} style={{animation:'spin .7s linear infinite'}}/> Uploading…
            </div>
          )}

          {/* Rich-text compose area — contentEditable so formatting appears visually */}
          <div
            ref={textareaRef}
            contentEditable
            suppressContentEditableWarning
            onFocus={() => setWaEditorFocused(true)}
            onBlur={() => setWaEditorFocused(false)}
            onInput={e => setWaMsg(htmlToWaMd(e.currentTarget))}
            onPaste={e => {
              e.preventDefault()
              const text = e.clipboardData.getData('text/plain')
              document.execCommand('insertText', false, text)
              setWaMsg(htmlToWaMd(e.currentTarget))
            }}
            style={{
              width:'100%', minHeight:130, padding:'10px 12px',
              border: waEditorFocused
                ? '2px solid var(--accent)'
                : '1px solid var(--card-border)',
              borderTop: (waRecording || waUploading || waAttachment) ? undefined : 'none',
              borderRadius: waAttachment ? '0' : '0 0 7px 7px',
              fontSize:13, boxSizing:'border-box',
              fontFamily:'inherit', background:'var(--card-bg)',
              color:'var(--text-1)', outline:'none',
              caretColor:'var(--accent)',
              lineHeight:1.6, overflowY:'auto', whiteSpace:'pre-wrap', wordBreak:'break-word',
              cursor:'text',
            }}
          />

          {/* Attachment strip */}
          {waAttachment && !waUploading && (
            <div style={{ border:'1px solid var(--card-border)', borderTop:'none', borderRadius:'0 0 7px 7px', background:'var(--card-header-bg)', overflow:'hidden' }}>
              <div style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 12px' }}>
                {waAttachment.type.startsWith('image/')   && <ImageIcon size={16} style={{ color:'var(--accent)', flexShrink:0 }}/>}
                {waAttachment.type === 'application/pdf'  && <FileText  size={16} style={{ color:'#e63946', flexShrink:0 }}/>}
                {waAttachment.type.startsWith('audio/')   && <Mic       size={16} style={{ color:'#7c3aed', flexShrink:0 }}/>}
                <span style={{ fontSize:12, color:'var(--text-1)', flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{waAttachment.name}</span>
                <span style={{ fontSize:11, color:'var(--text-2)', flexShrink:0 }}>({(waAttachment.size/1024).toFixed(0)} KB)</span>
                <button onClick={() => { if (waAttachment.localBlob) URL.revokeObjectURL(waAttachment.localBlob); setWaAttachment(null) }} className="no-lift"
                  style={{ padding:'2px 5px', borderRadius:4, border:'1px solid var(--card-border)', background:'transparent', color:'var(--danger)', cursor:'pointer', display:'flex', alignItems:'center' }}>
                  <X size={12}/>
                </button>
              </div>
              {/* Inline audio player for voice recordings */}
              {waAttachment.localBlob && (
                <div style={{ padding:'0 12px 10px' }}>
                  <MiniAudioPlayer src={waAttachment.localBlob}/>
                </div>
              )}
            </div>
          )}

          {/* Preview */}
          {(waMsg.trim() || waAttachment) && waSelected.length > 0 && (
            <div style={{ marginTop:10, padding:'10px 12px', background:'var(--card-header-bg)', borderRadius:7, fontSize:12, color:'var(--text-2)', borderLeft:'3px solid #25d366' }}>
              <span style={{ fontWeight:600, color:'var(--text-1)' }}>Preview</span> (for {waSelected[0]?.member_name}):
              {waAttachment && (
                <div style={{ display:'flex', alignItems:'center', gap:6, marginTop:4, padding:'4px 8px', background:'var(--card-bg)', borderRadius:5 }}>
                  {waAttachment.localBlob ? <Mic size={11}/> : <Paperclip size={11}/>}
                  <span>{waAttachment.name}</span>
                </div>
              )}
              {waMsg.trim() && (
                <div style={{ marginTop:4, whiteSpace:'pre-wrap', lineHeight:1.5 }}>
                  {renderWaText(
                    waMsg
                      .replace(/{Title}/g,      waSelected[0]?.title||'')
                      .replace(/{FirstName}/g,  firstNameOf(waSelected[0]?.member_name))
                      .replace(/{MemberName}/g, waSelected[0]?.member_name||'')
                      .replace(/{MemberID}/g,   waSelected[0]?.member_id||'')
                      .replace(/{Mobile}/g,      waSelected[0]?.mobile||'')
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Step 3 — Send */}
        <div style={card}>
          <div style={{ ...lbl, marginBottom:12 }}>Step 3 — Send Blast</div>

          {/* Invalid number prompt */}
          {waInvalidPrompt && (
            <div style={{ marginBottom:16, padding:'14px 16px', border:'1px solid #f59e0b', borderRadius:8, background:'#fffbeb' }}>
              <div style={{ fontWeight:700, fontSize:13, color:'#92400e', marginBottom:8 }}>
                ⚠ {waInvalidPrompt.length} recipient{waInvalidPrompt.length!==1?'s have':' has'} an invalid number and will be skipped:
              </div>
              <div style={{ maxHeight:140, overflowY:'auto', marginBottom:12, display:'flex', flexDirection:'column', gap:4 }}>
                {waInvalidPrompt.map(m => {
                  const vld = validatePhone(m.whatsapp || m.mobile)
                  return (
                    <div key={m.member_id} style={{ display:'flex', alignItems:'center', gap:10, fontSize:12, padding:'4px 8px', borderRadius:5, background:'#fef3c7' }}>
                      <span style={{ fontWeight:600, color:'#78350f', flex:1 }}>{m.member_name}</span>
                      <span style={{ color:'#92400e' }}>{m.whatsapp || m.mobile || '—'}</span>
                      <span style={{ color:'#d97706', fontWeight:600 }}>{vld.reason}</span>
                    </div>
                  )
                })}
              </div>
              <div style={{ display:'flex', gap:8 }}>
                <button onClick={() => doSendBlast(waSelected.filter(m => validatePhone(m.whatsapp||m.mobile).valid))}
                  className="action-btn" style={{ background:'#25d366', fontSize:13, padding:'7px 18px' }}>
                  <Send size={13}/> Skip invalid &amp; send to {waSelected.length - waInvalidPrompt.length}
                </button>
                <button onClick={() => setWaInvalidPrompt(null)} className="no-lift"
                  style={{ ...btn(false,false), padding:'7px 16px' }}>
                  Go back &amp; fix
                </button>
              </div>
            </div>
          )}

          <button onClick={sendBlast} disabled={waSending || waSelected.length === 0 || (!waMsg.trim() && !waAttachment)}
            className="action-btn"
            style={{ background:'#25d366', opacity:(waSending||waSelected.length===0||(!waMsg.trim()&&!waAttachment))?0.55:1, fontSize:14, padding:'10px 28px' }}>
            {waSending
              ? <><RefreshCw size={14} style={{animation:'spin .7s linear infinite'}}/> Sending {waProgress?.current} of {waProgress?.total}…</>
              : <><Send size={14}/> Send to {waSelected.length} recipient{waSelected.length!==1?'s':''}</>}
          </button>

          {/* Progress bar */}
          {waProgress && (
            <div style={{ marginTop:14 }}>
              <div style={{ height:6, borderRadius:4, background:'var(--card-border)', overflow:'hidden', marginBottom:12 }}>
                <div style={{ height:'100%', borderRadius:4, background:'#25d366', width:`${(waProgress.current/waProgress.total)*100}%`, transition:'width 0.4s ease' }}/>
              </div>
              <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
                {waProgress.results.map((r, i) => (
                  <div key={r.member_id||i} style={{ display:'flex', alignItems:'center', gap:8, fontSize:12, padding:'4px 8px', borderRadius:5, background: r.status==='sent'?'#f0fdf4':r.status==='failed'?'#fef2f2':'var(--card-header-bg)' }}>
                    <span style={{ fontSize:14 }}>{r.status==='sent'?'✓':r.status==='failed'?'✗':'—'}</span>
                    <span style={{ fontWeight:600, color:'var(--text-1)' }}>{r.member_name}</span>
                    <span style={{ color:'var(--text-2)' }}>{r.whatsapp||r.mobile}</span>
                    {r.status==='failed' && <span style={{ color:'var(--danger)', marginLeft:'auto' }}>{r.errText}</span>}
                    {r.status==='skipped' && <span style={{ color:'var(--text-2)', marginLeft:'auto' }}>No number</span>}
                  </div>
                ))}
              </div>
              {!waSending && (
                <div style={{ marginTop:10, fontSize:13, color:'var(--text-2)' }}>
                  Done — {waProgress.results.filter(r=>r.status==='sent').length} sent · {waProgress.results.filter(r=>r.status==='failed').length} failed · {waProgress.results.filter(r=>r.status==='skipped').length} skipped
                </div>
              )}
            </div>
          )}
        </div>
      </>)}
    </div>
  )
}
