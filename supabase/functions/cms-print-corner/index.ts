// @ts-nocheck
/* ═══════════════════════════════════════════════════════════════
   cms-print-corner — mail-merge Word/PowerPoint → PDF
   DOCX/PPTX → Gotenberg (LibreOffice) when configured, else Google Drive export
   Signatures: picture AltText {presbyter_sign} (Word or PPT)
   ═══════════════════════════════════════════════════════════════ */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import JSZip from 'https://esm.sh/jszip@3.10.1'
import { Image } from 'https://deno.land/x/imagescript@1.2.15/mod.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || ''
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') || Deno.env.get('SUPABASE_ANON') || ''

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const BUCKET = 'print-corner'
const GOTENBERG_URL = (Deno.env.get('GOTENBERG_URL') || '').replace(/\/$/, '')
const GOTENBERG_API_KEY = Deno.env.get('GOTENBERG_API_KEY') || ''
const CLOUDMERSIVE_API_KEY = Deno.env.get('CLOUDMERSIVE_API_KEY') || ''
const PRINT_CORNER_PDF_ENGINE = (Deno.env.get('PRINT_CORNER_PDF_ENGINE') || 'auto').toLowerCase()
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
const PPTX_MIME = 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
const GDOC_MIME = 'application/vnd.google-apps.document'
const GSLIDES_MIME = 'application/vnd.google-apps.presentation'

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

async function requireUser(req: Request) {
  const auth = req.headers.get('Authorization') || ''
  const token = auth.replace(/^Bearer\s+/i, '')
  if (!token) return { error: 'Not authenticated', status: 401 }

  const userClient = createClient(SUPABASE_URL, ANON_KEY || SERVICE_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  })
  const { data: { user }, error } = await userClient.auth.getUser()
  if (error || !user) return { error: 'Not authenticated', status: 401 }

  const admin = createClient(SUPABASE_URL, SERVICE_KEY)
  const { data: prof } = await admin.from('profiles').select('role, email').eq('id', user.id).maybeSingle()
  return { user, prof, admin }
}

function stampFilename(base: string, ext = 'pdf') {
  const now = new Date()
  const date = now.toISOString().slice(0, 10)
  const time = now.toISOString().slice(11, 19).replace(/:/g, '')
  const safe = String(base || 'document').replace(/[^\w.-]+/g, '_').slice(0, 80)
  return `${date}_${time}_${safe}.${ext}`
}

function escapeXml(s: string) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Image placeholders → churches.*_signature_url / treasurer_seal_url */
const IMAGE_PLACEHOLDER_MAP: Record<string, string> = {
  presbyter_sign: 'presbyter_signature_url',
  secretary_sign: 'secretary_signature_url',
  seceratary_sign: 'secretary_signature_url', // typo alias
  seceratry_sign: 'secretary_signature_url',  // typo alias (Canva/Corel)
  treasurer_sign: 'treasurer_signature_url',
  treasurer_seal: 'treasurer_seal_url',
}

const MEMBER_PHOTO_ALIASES = new Set(['member_photo', 'photo'])

const IMAGE_PLACEHOLDER_KEYS = new Set([...Object.keys(IMAGE_PLACEHOLDER_MAP), 'member_photo'])

function isImagePlaceholderKey(key: string) {
  return IMAGE_PLACEHOLDER_KEYS.has(String(key || '').trim())
}

function placeholderExistsInXml(xml: string, key: string) {
  const intact = `{${key}}`
  if (xml.includes(intact)) return true
  const chars = intact.split('').map(c => c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  return new RegExp(chars.join('(?:<[^>]+>)*')).test(xml)
}

function replacePlaceholderInXml(xml: string, key: string, value: string) {
  const safe = escapeXml(value)
  const intact = `{${key}}`
  if (xml.includes(intact)) return xml.split(intact).join(safe)

  const chars = `{${key}}`.split('').map(c => c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  return xml.replace(new RegExp(chars.join('(?:<[^>]+>)*'), 'g'), safe)
}

function isDateMergeFieldKey(key: string) {
  const n = String(key || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '')
  if (n === 'date') return true
  return n.endsWith('date')
}

function formatMergeFieldDate(value: unknown): string {
  if (value == null || value === '') return ''
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return ''
    const dd = String(value.getDate()).padStart(2, '0')
    const mm = String(value.getMonth() + 1).padStart(2, '0')
    return `${dd}.${mm}.${value.getFullYear()}`
  }
  if (typeof value === 'number' && Number.isFinite(value) && value > 2000 && value < 100000) {
    const d = new Date(Math.round((value - 25569) * 86400 * 1000))
    if (Number.isNaN(d.getTime())) return String(value)
    const dd = String(d.getUTCDate()).padStart(2, '0')
    const mm = String(d.getUTCMonth() + 1).padStart(2, '0')
    return `${dd}.${mm}.${d.getUTCFullYear()}`
  }
  const s = String(value).trim()
  if (!s) return ''
  if (/^\d{2}\.\d{2}\.\d{4}$/.test(s)) return s
  if (/GMT|India Standard Time|GMT\+|\d{4}-\d{2}-\d{2}T/.test(s)) {
    const d = new Date(s)
    if (!Number.isNaN(d.getTime())) {
      const dd = String(d.getDate()).padStart(2, '0')
      const mm = String(d.getMonth() + 1).padStart(2, '0')
      return `${dd}.${mm}.${d.getFullYear()}`
    }
  }
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (m) return `${m[3]}.${m[2]}.${m[1]}`
  const d = new Date(s)
  if (Number.isNaN(d.getTime())) return s
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  return `${dd}.${mm}.${d.getFullYear()}`
}

function mergeFieldToString(key: string, raw: unknown): string {
  if (raw == null) return ''
  if (isDateMergeFieldKey(key)) return formatMergeFieldDate(raw)
  if (raw instanceof Date) return formatMergeFieldDate(raw)
  const s = String(raw).trim()
  if (/GMT|India Standard Time|GMT\+/.test(s)) return formatMergeFieldDate(s)
  return String(raw)
}

function applyFieldValuesToXml(xml: string, fieldValues: Record<string, unknown>) {
  let out = xml
  // Longer keys first so {presbyter_name} is not disturbed by shorter keys like {name}
  const keys = Object.keys(fieldValues || {}).sort((a, b) => b.length - a.length)
  for (const key of keys) {
    if (!key || isImagePlaceholderKey(key)) continue
    const raw = fieldValues[key]
    out = replacePlaceholderInXml(out, key, mergeFieldToString(key, raw))
  }
  return out
}

function normalizeMergeFieldKey(key: string) {
  return String(key || '').trim().toLowerCase().replace(/[\s-]+/g, '_')
}

function isNameLikeMergeField(key: string) {
  const n = normalizeMergeFieldKey(key)
  return n === 'member_name' || n === 'name' || n === 'full_name' || n === 'membername' || n === 'fullname'
}

function extractPptxShapeText(spXml: string) {
  const parts: string[] = []
  const re = /<a:t[^>]*>([\s\S]*?)<\/a:t>/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(spXml)) !== null) parts.push(m[1])
  return parts.join('').replace(/[\u200B-\u200D\uFEFF]/g, '').trim()
}

function extractPptxFirstFontSz(spXml: string) {
  const m = spXml.match(/<a:rPr\b[^>]*\bsz="(\d+)"/i)
  return m ? Number(m[1]) || 2400 : 2400
}

type PptxNameFitMode = 'standard' | 'gentle' | 'certificate'

const PPTX_NAME_FIT_PRESETS: Record<PptxNameFitMode, {
  minScale: number
  sideMarginRatio: number
  charWidthRatio: number
  wrap: 'square' | 'none'
  slideAware: boolean
}> = {
  // Letters — text box width only, allow more shrink (legacy PPTX letters)
  standard: { minScale: 38000, sideMarginRatio: 0, charWidthRatio: 0.62, wrap: 'square', slideAware: false },
  // ID cards — slide free width, single-line, readable minimum
  gentle: { minScale: 72000, sideMarginRatio: 0.06, charWidthRatio: 0.54, wrap: 'none', slideAware: true },
  // Certificates — same slide-aware logic; wider side margin for border art, script names
  certificate: { minScale: 72000, sideMarginRatio: 0.08, charWidthRatio: 0.50, wrap: 'none', slideAware: true },
}

function pptxNameFitIsSlideAware(mode: PptxNameFitMode) {
  return PPTX_NAME_FIT_PRESETS[mode].slideAware
}

function extractPptxSlideSize(presentationXml: string): { cx: number, cy: number } | null {
  let m = presentationXml.match(/<p:sldSz\b[^>]*\bcx\s*=\s*"(\d+)"[^>]*\bcy\s*=\s*"(\d+)"/i)
  if (m) {
    const cx = Number(m[1])
    const cy = Number(m[2])
    return cx > 0 && cy > 0 ? { cx, cy } : null
  }
  m = presentationXml.match(/<p:sldSz\b[^>]*\bcy\s*=\s*"(\d+)"[^>]*\bcx\s*=\s*"(\d+)"/i)
  if (m) {
    const cy = Number(m[1])
    const cx = Number(m[2])
    return cx > 0 && cy > 0 ? { cx, cy } : null
  }
  return null
}

/** Horizontal space for a name — slide-aware modes use slide width minus side clearance, not a narrow Canva text box. */
function estimatePptxNameUsableWidthEmu(
  shapeXfrm: { x: string, y: string, cx: string, cy: string },
  slideSize: { cx: number, cy: number } | null,
  mode: PptxNameFitMode,
) {
  const shapeW = Number(shapeXfrm.cx) || 0
  const preset = PPTX_NAME_FIT_PRESETS[mode]
  if (!preset.slideAware || !slideSize?.cx) return shapeW
  const slideW = Number(slideSize.cx)
  const sideMargin = Math.round(slideW * preset.sideMarginRatio)
  const freeW = Math.max(shapeW, slideW - sideMargin * 2)
  return freeW
}

function patchPptxShapeWidth(
  spXml: string,
  newCx: number,
  slideWidth: number,
) {
  const xfrm = extractPptxXfrm(spXml)
  if (!xfrm) return spXml
  const oldCx = Number(xfrm.cx) || 0
  if (newCx <= oldCx) return spXml
  const centeredX = Math.max(0, Math.round((slideWidth - newCx) / 2))
  const replaceExt = (block: string) => block.replace(
    /(<a:ext\b[^>]*\bcx\s*=\s*")(\d+)("[^>]*>)/i,
    `$1${Math.round(newCx)}$3`,
  ).replace(
    /(<a:off\b[^>]*\bx\s*=\s*")(-?\d+)("[^>]*>)/i,
    `$1${centeredX}$3`,
  )
  if (/<p:spPr\b/i.test(spXml)) {
    return spXml.replace(/<p:spPr\b[\s\S]*?<\/p:spPr>/i, (block) => replaceExt(block))
  }
  return spXml
}

/** EMU width → shrink fontScale (100000 = 100%) so text fits with side padding. */
function estimatePptxNameFontScale(
  text: string,
  widthEmu: number,
  fontSzHundredths: number,
  mode: PptxNameFitMode = 'standard',
) {
  const len = text.trim().length
  if (len < 14) return 100000
  const preset = PPTX_NAME_FIT_PRESETS[mode]
  const fontPt = fontSzHundredths / 100
  const widthPt = (widthEmu / 914400) * 72
  const padPt = preset.slideAware ? 4 : 16
  const usablePt = Math.max(24, widthPt - padPt)
  const charW = fontPt * preset.charWidthRatio
  const maxChars = usablePt / charW
  if (len <= maxChars) return 100000
  const scale = Math.floor((maxChars / len) * 100000)
  return Math.max(preset.minScale, Math.min(100000, scale))
}

function patchPptxTxBodyAutofit(spXml: string, fontScale: number, wrap: 'square' | 'none' = 'square') {
  const txBodyRe = /<p:txBody\b[\s\S]*?<\/p:txBody>/i
  const txBodyMatch = spXml.match(txBodyRe)
  if (!txBodyMatch) return spXml
  let txBody = txBodyMatch[0]
  const autofitXml = `<a:normAutofit fontScale="${fontScale}"/>`

  if (/<a:bodyPr\b/i.test(txBody)) {
    txBody = txBody.replace(/<a:bodyPr\b[^>]*\/?>/i, (tag) => {
      const selfClose = /\/>\s*$/.test(tag)
      let attrs = tag.replace(/^<a:bodyPr/i, '').replace(/\/?>$/, '').trim()
      if (/wrap="/i.test(attrs)) attrs = attrs.replace(/wrap="[^"]*"/i, `wrap="${wrap}"`)
      else attrs += ` wrap="${wrap}"`
      if (!/anchor="/i.test(attrs)) attrs += ' anchor="ctr"'
      if (!/horzOverflow="/i.test(attrs)) attrs += ' horzOverflow="clip"'
      return selfClose
        ? `<a:bodyPr ${attrs}>${autofitXml}</a:bodyPr>`
        : `<a:bodyPr ${attrs}>`
    })
    txBody = txBody.replace(/<a:noAutofit\s*\/>/gi, autofitXml)
    txBody = txBody.replace(/<a:spAutoFit\s*\/>/gi, autofitXml)
    if (!/<a:normAutofit\b/i.test(txBody)) {
      txBody = txBody.replace(/(<a:bodyPr\b[^>]*>)/i, `$1${autofitXml}`)
    } else {
      txBody = txBody.replace(/<a:normAutofit\b[^>]*\/?>/gi, autofitXml)
    }
  } else {
    txBody = txBody.replace(
      /<p:txBody\b[^>]*>/i,
      `<p:txBody><a:bodyPr wrap="${wrap}" anchor="ctr" horzOverflow="clip">${autofitXml}</a:bodyPr>`,
    )
  }

  return spXml.replace(txBodyMatch[0], txBody)
}

function patchPptxRunFontSizes(spXml: string, fontScale: number) {
  return spXml.replace(/<a:rPr\b[^>]*\/?>/gi, (tag) => {
    const selfClose = /\/>\s*$/.test(tag)
    let attrs = tag.replace(/^<a:rPr/i, '').replace(/\/?>$/, '').trim()
    const szMatch = attrs.match(/\bsz="(\d+)"/i)
    if (szMatch) {
      const newSz = Math.max(900, Math.floor(Number(szMatch[1]) * fontScale / 100000))
      attrs = attrs.replace(/\bsz="\d+"/i, `sz="${newSz}"`)
    }
    return selfClose ? `<a:rPr ${attrs}/>` : `<a:rPr ${attrs}>`
  })
}

function shapeTextMatchesLongNameField(text: string, fieldValues: Record<string, unknown>) {
  const t = text.trim()
  if (t.length < 14) return false
  for (const [key, raw] of Object.entries(fieldValues || {})) {
    if (!key || isImagePlaceholderKey(key) || !isNameLikeMergeField(key)) continue
    const val = String(raw ?? '').trim()
    if (val && val === t) return true
  }
  return t.length >= 22
}

/** Shrink long member names in PPTX text boxes so they stay inside the frame padding. */
function applyPptxLongNameTextFit(
  xml: string,
  fieldValues: Record<string, unknown>,
  mode: PptxNameFitMode = 'standard',
  slideSize: { cx: number, cy: number } | null = null,
) {
  const preset = PPTX_NAME_FIT_PRESETS[mode]
  const re = /<p:sp\b[\s\S]*?<\/p:sp>/gi
  return xml.replace(re, (sp) => {
    if (!/<p:txBody/i.test(sp)) return sp
    const text = extractPptxShapeText(sp)
    if (!shapeTextMatchesLongNameField(text, fieldValues)) return sp
    const xfrm = extractPptxXfrm(sp)
    if (!xfrm?.cx) return sp
    const usableW = estimatePptxNameUsableWidthEmu(xfrm, slideSize, mode)
    if (!usableW) return sp
    let patched = sp
    if (pptxNameFitIsSlideAware(mode) && slideSize?.cx && usableW > Number(xfrm.cx)) {
      patched = patchPptxShapeWidth(patched, usableW, slideSize.cx)
    }
    const fontSz = extractPptxFirstFontSz(patched)
    const fontScale = estimatePptxNameFontScale(text, usableW, fontSz, mode)
    if (fontScale >= 100000) return patched
    patched = patchPptxTxBodyAutofit(patched, fontScale, preset.wrap)
    // Slide-aware: normAutofit only — patching run sz as well double-shrinks in Google PDF convert
    if (!pptxNameFitIsSlideAware(mode)) patched = patchPptxRunFontSizes(patched, fontScale)
    return patched
  })
}

function bodyLooksLikeIdCard(body: Record<string, unknown>) {
  const hay = `${body.template_key || ''} ${body.template_label || ''}`.toLowerCase()
  return /id[\s_-]*card|idcard|identity[\s_-]*card|member[\s_-]*card|photo[\s_-]*card/.test(hay)
}

function bodyIsCertificateTemplate(body: Record<string, unknown>) {
  const t = String(body.template_type || '').toLowerCase()
  if (t === 'certificate' || t === 'certificates') return true
  const hay = `${body.template_key || ''} ${body.template_label || ''}`.toLowerCase()
  return /certificate|certification|appreciation|participation|achievement|award/.test(hay)
}

function resolvePptxNameFitMode(body: Record<string, unknown>): PptxNameFitMode | 'off' {
  if (body.shrink_long_pptx_names === false || body.pptx_name_fit === 'off') return 'off'
  const fit = String(body.pptx_name_fit || '').toLowerCase()
  if (fit === 'gentle' || fit === 'certificate' || fit === 'standard') return fit as PptxNameFitMode
  if (bodyLooksLikeIdCard(body)) return 'gentle'
  if (bodyIsCertificateTemplate(body)) return 'certificate'
  return 'standard'
}

function normalizeImageSlotKey(raw: string): string | null {
  let s = String(raw || '').replace(/[\u200B-\u200D\uFEFF]/g, '').trim()
  if (!s) return null
  const braced = s.match(/\{([a-zA-Z_][a-zA-Z0-9_]*)\}/)
  if (braced) s = braced[1]
  s = s.replace(/^\{+/, '').replace(/\}+$/, '').trim()
  const norm = s.toLowerCase().replace(/[\s-]+/g, '_')
  // Bare "photo" is Canva's default on every image — only accept explicit member_photo tags
  if (norm === 'member_photo' || norm === 'memberphoto') return 'member_photo'
  if (norm === 'photo') return null
  for (const k of IMAGE_PLACEHOLDER_KEYS) {
    if (norm === k.toLowerCase()) return k
  }
  if (IMAGE_PLACEHOLDER_MAP[norm]) return norm
  return null
}

function sniffImageMeta(bytes: Uint8Array, urlHint = '') {
  const u = urlHint.toLowerCase()
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50) {
    return { ext: 'png', contentType: 'image/png' }
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { ext: 'jpg', contentType: 'image/jpeg' }
  }
  if (u.includes('.png')) return { ext: 'png', contentType: 'image/png' }
  if (u.includes('.jpg') || u.includes('.jpeg')) return { ext: 'jpg', contentType: 'image/jpeg' }
  return { ext: 'png', contentType: 'image/png' }
}

function jpegDimensions(bytes: Uint8Array): { w: number, h: number } | null {
  if (bytes.length < 10 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null
  let i = 2
  while (i < bytes.length - 9) {
    if (bytes[i] !== 0xff) { i++; continue }
    const marker = bytes[i + 1]
    if (marker === 0xc0 || marker === 0xc1 || marker === 0xc2) {
      const h = (bytes[i + 5] << 8) | bytes[i + 6]
      const w = (bytes[i + 7] << 8) | bytes[i + 8]
      return w > 0 && h > 0 ? { w, h } : null
    }
    const len = (bytes[i + 2] << 8) | bytes[i + 3]
    if (len < 2) break
    i += 2 + len
  }
  return null
}

function pngDimensions(bytes: Uint8Array): { w: number, h: number } | null {
  if (bytes.length < 24 || bytes[0] !== 0x89 || bytes[1] !== 0x50) return null
  const w = (bytes[16] << 24) | (bytes[17] << 16) | (bytes[18] << 8) | bytes[19]
  const h = (bytes[20] << 24) | (bytes[21] << 16) | (bytes[22] << 8) | bytes[23]
  return w > 0 && h > 0 ? { w, h } : null
}

function imageDimensions(bytes: Uint8Array): { w: number, h: number } | null {
  return jpegDimensions(bytes) || pngDimensions(bytes)
}

/** EMU → px at ~150 DPI (typical embedded PPT image resolution). */
function emuToPx(emu: number) {
  return Math.max(64, Math.round(Number(emu) * 150 / 914400))
}

/** Average colour from photo corners/edges — fills side gaps in the circular frame. */
function samplePhotoBackground(img: InstanceType<typeof Image>): number {
  const w = img.width
  const h = img.height
  if (w < 2 || h < 2) return 0xffffffff

  const coords = [
    [0, 0], [w - 1, 0], [0, h - 1], [w - 1, h - 1],
    [Math.floor(w / 2), 0], [Math.floor(w / 2), h - 1],
    [0, Math.floor(h / 2)], [w - 1, Math.floor(h / 2)],
    [Math.floor(w * 0.1), 0], [Math.floor(w * 0.9), 0],
  ]

  let r = 0
  let g = 0
  let b = 0
  let n = 0
  for (const [x, y] of coords) {
    const c = img.getPixelAt(x, y)
    r += (c >>> 24) & 0xff
    g += (c >>> 16) & 0xff
    b += (c >>> 8) & 0xff
    n++
  }
  if (!n) return 0xffffffff
  return Image.rgbaToColor(Math.round(r / n), Math.round(g / n), Math.round(b / n), 255)
}

/**
 * Fit member photo — contain + top-centre; pad sides with sampled studio background colour.
 */
async function fitMemberPhotoBytes(
  source: Uint8Array,
  targetW: number,
  targetH: number,
): Promise<{ bytes: Uint8Array, ext: string, contentType: string }> {
  const tw = Math.max(128, Math.min(800, Math.round(targetW)))
  const th = Math.max(128, Math.min(800, Math.round(targetH)))
  const size = Math.max(tw, th)

  const img = await Image.decode(source)
  const bg = samplePhotoBackground(img)
  const scale = Math.min(size / img.width, size / img.height)
  const sw = Math.max(1, Math.round(img.width * scale))
  const sh = Math.max(1, Math.round(img.height * scale))
  const resized = img.resize(sw, sh)

  const canvas = new Image(size, size)
  canvas.fill(bg)
  canvas.composite(resized, Math.floor((size - sw) / 2), 0)

  const bytes = await canvas.encodeJPEG(92)
  return { bytes, ext: 'jpg', contentType: 'image/jpeg' }
}

async function prepareMemberPhotoForFrame(
  zip: JSZip,
  source: { bytes: Uint8Array, ext: string, contentType: string },
  existingPath: string | null,
  slotBlock: string,
): Promise<{ bytes: Uint8Array, ext: string, contentType: string }> {
  let tw = 400
  let th = 400

  // Prefer on-slide shape size — placeholder media files are often tiny thumbs with Canva srcRect zoom
  const xfrm = extractPptxXfrm(slotBlock)
  if (xfrm) {
    tw = emuToPx(xfrm.cx)
    th = emuToPx(xfrm.cy)
  } else if (existingPath) {
    const f = zip.file(existingPath)
    if (f) {
      const existing = new Uint8Array(await f.async('uint8array'))
      const dim = imageDimensions(existing)
      if (dim) { tw = dim.w; th = dim.h }
    }
  }

  return fitMemberPhotoBytes(source.bytes, tw, th)
}

/** Canva PPTX often ships srcRect / svgBlip crop on placeholders — causes extreme zoom after byte swap. */
function sanitizeMemberPhotoBlipXml(fragment: string): string {
  let out = fragment
  out = out.replace(/<a:srcRect\b[^>]*\/>/gi, '')
  out = out.replace(/<a:srcRect\b[^>]*>[\s\S]*?<\/a:srcRect>/gi, '')
  out = out.replace(/<a:ext\b[^>]*>[\s\S]*?<asvg:svgBlip\b[\s\S]*?<\/a:ext>/gi, '')
  out = out.replace(/<asvg:svgBlip\b[^>]*\/>/gi, '')
  out = out.replace(/<asvg:svgBlip\b[\s\S]*?<\/asvg:svgBlip>/gi, '')
  out = out.replace(/<a:fillRect\b[^>]*\/>/gi, '<a:fillRect/>')
  out = out.replace(/<a:fillRect\b[^>]*>[\s\S]*?<\/a:fillRect>/gi, '<a:fillRect/>')
  return out
}

function clearMemberPhotoCropInSlide(xml: string, embedId: string, slotBlock: string): string {
  let out = xml
  const esc = embedId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const blipFillRe = new RegExp(
    `(<(?:p:blipFill|pic:blipFill)\\b[\\s\\S]*?<a:blip\\b[^>]*r:embed="${esc}"[\\s\\S]*?</(?:p:blipFill|pic:blipFill)>)`,
    'gi',
  )
  out = out.replace(blipFillRe, m => sanitizeMemberPhotoBlipXml(m))
  if (slotBlock && out.includes(slotBlock)) {
    const cleaned = sanitizeMemberPhotoBlipXml(slotBlock)
    if (cleaned !== slotBlock) out = out.split(slotBlock).join(cleaned)
  }
  return out
}

async function fetchSignatureImage(url: string | null | undefined) {
  if (!url || !String(url).trim()) return null
  try {
    const res = await fetch(String(url).trim())
    if (!res.ok) return null
    const bytes = new Uint8Array(await res.arrayBuffer())
    if (!bytes.length) return null
    return { bytes, ...sniffImageMeta(bytes, url) }
  } catch {
    return null
  }
}

/** Word/Google is picky about media part extensions — always embed signatures as PNG when possible. */
async function normalizeImageToPng(img: { bytes: Uint8Array, ext: string, contentType: string }) {
  if (String(img.ext || '').toLowerCase() === 'png') return img
  try {
    const decoded = await Image.decode(img.bytes)
    const bytes = await decoded.encodePNG()
    if (!bytes?.length) return img
    return { bytes, ext: 'png', contentType: 'image/png' }
  } catch {
    return img
  }
}

/** Prefer storage download when URL points at church-logos (public fetch often blocked). */
async function loadSignatureFromUrlOrStorage(
  admin: ReturnType<typeof createClient>,
  url: string | null | undefined,
  fallbackPath: string | undefined,
) {
  const tryPaths: string[] = []
  if (fallbackPath) {
    tryPaths.push(
      fallbackPath,
      fallbackPath.replace(/\.png$/i, '.jpg'),
      fallbackPath.replace(/\.png$/i, '.jpeg'),
    )
  }
  const u = String(url || '')
  const m = u.match(/\/storage\/v1\/object\/(?:public|sign)\/church-logos\/([^?]+)/i)
  if (m?.[1]) tryPaths.unshift(decodeURIComponent(m[1]))

  for (const tryPath of tryPaths) {
    const { data, error } = await admin.storage.from('church-logos').download(tryPath)
    if (error || !data) continue
    const bytes = new Uint8Array(await data.arrayBuffer())
    if (!bytes.length) continue
    return { img: { bytes, ...sniffImageMeta(bytes, tryPath) }, via: `storage:${tryPath}` }
  }

  const fetched = await fetchSignatureImage(url)
  if (fetched) return { img: fetched, via: 'url' }
  return { img: null, via: url ? 'fetch_failed' : 'no_url' }
}

function nextRelationshipId(relsXml: string) {
  let max = 0
  for (const m of relsXml.matchAll(/\bId\s*=\s*"rId(\d+)"/gi)) {
    max = Math.max(max, Number(m[1]) || 0)
  }
  return `rId${max + 1}`
}

function relsPathForXmlPart(xmlPath: string) {
  const i = xmlPath.lastIndexOf('/')
  const dir = i >= 0 ? xmlPath.slice(0, i) : ''
  const base = i >= 0 ? xmlPath.slice(i + 1) : xmlPath
  return `${dir}/_rels/${base}.rels`
}

function ensureContentTypeDefault(ctXml: string, ext: string, contentType: string) {
  const re = new RegExp(`Extension\\s*=\\s*"${ext}"`, 'i')
  if (re.test(ctXml)) return ctXml
  return ctXml.replace(
    '</Types>',
    `<Default Extension="${ext}" ContentType="${contentType}"/></Types>`,
  )
}

/** True only for explicit member-photo alt text — not Canva's generic "Photo" label. */
function isMemberPhotoAlt(raw: string | null | undefined): boolean {
  if (raw == null) return false
  const val = String(raw).replace(/[\u200B-\u200D\uFEFF]/g, '').trim()
  if (!val) return false
  if (/\{member_photo\}/i.test(val) || /\{photo\}/i.test(val)) return true
  const bare = val.replace(/^\{+/, '').replace(/\}+$/, '').trim().toLowerCase().replace(/[\s-]+/g, '_')
  return bare === 'member_photo' || bare === 'memberphoto'
}

/** Pull a signature key from alt-text-like attribute values. */
function keyFromAltAttr(raw: string | null | undefined): string | null {
  if (raw == null) return null
  const val = String(raw).replace(/[\u200B-\u200D\uFEFF]/g, '').trim()
  if (!val) return null
  if (isMemberPhotoAlt(val)) return 'member_photo'
  const direct = normalizeImageSlotKey(val)
  if (direct) return direct
  const braced = val.match(/\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g)
  if (braced) {
    for (const token of braced) {
      const k = normalizeImageSlotKey(token)
      if (k) return k
    }
  }
  for (const k of IMAGE_PLACEHOLDER_KEYS) {
    if (k === 'member_photo') continue
    const needle = k.toLowerCase()
    const vLower = val.toLowerCase().replace(/[\s-]+/g, '_')
    if (vLower === needle || vLower.includes(needle) || val.toLowerCase().includes('{' + needle + '}')) {
      return normalizeImageSlotKey(k)
    }
  }
  return null
}

function scoreMemberPhotoSlot(slot: { block: string, via: string }) {
  let score = 0
  if (/\{member_photo\}/i.test(slot.block)) score += 100
  if (/member_photo/i.test(slot.via)) score += 40
  if (/direct:/.test(slot.via)) score += 15
  const xfrm = extractPptxXfrm(slot.block)
  if (xfrm) score += Math.min(40, (Number(xfrm.cx) * Number(xfrm.cy)) / 400000)
  return score
}

/** Canva sets alt "Photo" on many shapes — keep only the best {member_photo} target per part. */
function dedupeMemberPhotoSlots<T extends { key: string, block: string, via: string }>(slots: T[]): T[] {
  const photos = slots.filter(s => s.key === 'member_photo')
  if (photos.length <= 1) return slots
  const best = photos.reduce((a, b) => (scoreMemberPhotoSlot(b) > scoreMemberPhotoSlot(a) ? b : a))
  return [...slots.filter(s => s.key !== 'member_photo'), best]
}

function extractBlipEmbedId(block: string): string | null {
  const blip = block.match(/<a:blip\b[^>]*\br:embed\s*=\s*"([^"]+)"/i)
    || block.match(/<a:blip\b[^>]*\br:embed\s*=\s*'([^']+)'/i)
    || block.match(/<a:blip\b[^>]*\bembed\s*=\s*"([^"]+)"/i)
    || block.match(/<asvg:svgBlip\b[^>]*\br:embed\s*=\s*"([^"]+)"/i)
    || block.match(/<a:blip\b[^>]*\br:link\s*=\s*"([^"]+)"/i)
  if (blip?.[1]) return blip[1]
  const vml = block.match(/<v:imagedata\b[^>]*\br:id\s*=\s*"([^"]+)"/i)
    || block.match(/<v:imagedata\b[^>]*\br:id\s*=\s*'([^']+)'/i)
  return vml?.[1] || null
}

/**
 * Find pictures / picture-filled shapes whose AltText (descr/title/name) is a signature key.
 * Covers Word drawings, PPT p:pic, and Canva p:sp + blipFill.
 */
/** Scan slide/document for alt-text attributes that name a signature key. */
function findAltTextHits(xml: string) {
  const hits: Array<{ attr: string, value: string, key: string, index: number }> = []
  const re = /\b(descr|title|name|o:title|o:alt|alt)\s*=\s*"([^"]*)"/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(xml)) !== null) {
    const key = keyFromAltAttr(m[2])
    if (!key) continue
    hits.push({ attr: m[1], value: m[2], key, index: m.index })
  }
  const reSq = /\b(descr|title|name|o:title|o:alt|alt)\s*=\s*'([^']*)'/gi
  while ((m = reSq.exec(xml)) !== null) {
    const key = keyFromAltAttr(m[2])
    if (!key) continue
    hits.push({ attr: m[1], value: m[2], key, index: m.index })
  }
  return hits
}

type PicContainer = { tag: string, start: number, end: number, block: string }

/** Collect image-bearing containers (same idea as Word w:drawing slots). */
function findPictureContainers(xml: string): PicContainer[] {
  const out: PicContainer[] = []
  const re = /<(w:drawing|w:pict|p:pic|p:grpSp|p:sp)\b[\s\S]*?<\/\1>/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(xml)) !== null) {
    const block = m[0]
    const hasBlip = /<a:blip\b/i.test(block) || /<asvg:svgBlip\b/i.test(block) || /<v:imagedata\b/i.test(block)
    if (!hasBlip) continue
    out.push({
      tag: m[1],
      start: m.index,
      end: m.index + block.length,
      block,
    })
  }
  return out
}

/** Prefer innermost p:pic inside PPT groups; for Word keep the full w:drawing (Google PDF needs drawing replace). */
function pickSwapBlock(container: PicContainer, hitIndex: number): { block: string, embedId: string } | null {
  if (container.tag === 'w:drawing' || container.tag === 'w:pict') {
    const embedId = extractBlipEmbedId(container.block)
    if (embedId) return { block: container.block, embedId }
  }
  if (container.tag === 'p:grpSp') {
    const innerRe = /<(p:pic|p:sp|v:shape)\b[\s\S]*?<\/\1>/gi
    let best: { block: string, embedId: string, dist: number, len: number, area: number } | null = null
    let im: RegExpExecArray | null
    while ((im = innerRe.exec(container.block)) !== null) {
      const inner = im[0]
      const embedId = extractBlipEmbedId(inner)
      if (!embedId) continue
      const absStart = container.start + im.index
      const dist = Math.abs(absStart - hitIndex)
      const len = inner.length
      const xfrm = extractPptxXfrm(inner)
      const area = xfrm ? (Number(xfrm.cx) || 0) * (Number(xfrm.cy) || 0) : 0
      if (!best || area > best.area || (area === best.area && dist < best.dist)) {
        best = { block: inner, embedId, dist, len, area }
      }
    }
    if (best) return { block: best.block, embedId: best.embedId }
  }
  const embedId = extractBlipEmbedId(container.block)
  if (!embedId) return null
  return { block: container.block, embedId }
}

/**
 * Find pictures whose AltText is a signature key.
 * Letter (DOCX): AltText lives on w:drawing.
 * Certificate (Canva PPTX): AltText is often on a parent grpSp / cNvPr, not on p:pic itself —
 * upload still "sees" the field, but a naïve p:pic-only scan misses the swap target.
 */
function findAltTextImageSlots(xml: string) {
  const slots: Array<{ key: string, embedId: string, block: string, via: string }> = []
  const seen = new Set<string>()
  const debugHits = findAltTextHits(xml)
  const containers = findPictureContainers(xml)

  function pushSlot(key: string, embedId: string, block: string, via: string) {
    const dedupe = key + '|' + embedId
    if (seen.has(dedupe)) return
    seen.add(dedupe)
    slots.push({ key, embedId, block, via })
  }

  // Pass A — same as letters: key + blip inside one container
  for (const c of containers) {
    let key: string | null = null
    for (const attr of ['descr', 'title', 'name', 'o:title', 'o:alt', 'alt']) {
      const reDq = new RegExp('\\b' + attr.replace(':', '\\:') + '\\s*=\\s*"([^"]*)"', 'gi')
      let am: RegExpExecArray | null
      while ((am = reDq.exec(c.block)) !== null) {
        key = keyFromAltAttr(am[1])
        if (key) break
      }
      if (key) break
    }
    if (!key) continue
    const picked = pickSwapBlock(c, c.start)
    if (!picked) continue
    pushSlot(key, picked.embedId, picked.block, 'direct:' + c.tag)
  }

  // Pass B — Canva: AltText attribute elsewhere; bind to nearest image container
  for (const hit of debugHits) {
    let best: PicContainer | null = null
    for (const c of containers) {
      if (hit.index < c.start || hit.index >= c.end) continue
      if (!best || (c.end - c.start) < (best.end - best.start)) best = c
    }
    // If attr is outside all containers, use nearest container by distance
    if (!best) {
      let bestDist = Infinity
      for (const c of containers) {
        const dist = hit.index < c.start
          ? c.start - hit.index
          : hit.index >= c.end
            ? hit.index - c.end
            : 0
        if (dist < bestDist) {
          bestDist = dist
          best = c
        }
      }
      // Only accept nearby (within ~8KB of XML) to avoid wrong image
      if (best && bestDist > 8000) best = null
    }
    if (!best) continue
    const picked = pickSwapBlock(best, hit.index)
    if (!picked) continue
    pushSlot(hit.key, picked.embedId, picked.block, 'nearby:' + best.tag + ':' + hit.attr)
  }

  return { slots, debugHits, containerCount: containers.length }
}

/** Match image relationships to AltText near each embed id (Word headers, VML, odd layouts). */
function findImageSlotsFromEmbedScan(xml: string, relsXml: string) {
  const slots: Array<{ key: string, embedId: string, block: string, via: string }> = []
  const seen = new Set<string>()
  const containers = findPictureContainers(xml)

  for (const m of relsXml.matchAll(/<Relationship\b[^>]*\/?>/gi)) {
    const tag = m[0]
    if (!/relationships\/image/i.test(tag)) continue
    const embedId = tag.match(/\bId\s*=\s*"([^"]+)"/i)?.[1]
    if (!embedId) continue
    const esc = embedId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const embedRe = new RegExp(`(?:r:embed|r:id)\\s*=\\s*"${esc}"`, 'i')
    const hit = embedRe.exec(xml)
    if (!hit || hit.index == null) continue

    const idx = hit.index
    const window = xml.slice(Math.max(0, idx - 5000), Math.min(xml.length, idx + 5000))
    let key: string | null = null
    for (const attr of ['descr', 'title', 'name', 'o:title', 'o:alt', 'alt']) {
      const reDq = new RegExp('\\b' + attr.replace(':', '\\:') + '\\s*=\\s*"([^"]*)"', 'gi')
      let am: RegExpExecArray | null
      while ((am = reDq.exec(window)) !== null) {
        key = keyFromAltAttr(am[1])
        if (key) break
      }
      if (key) break
    }
    if (!key) continue

    const dedupe = key + '|' + embedId
    if (seen.has(dedupe)) continue
    seen.add(dedupe)

    let block = window
    for (const c of containers) {
      if (idx >= c.start && idx < c.end) {
        block = c.block
        break
      }
    }
    slots.push({ key, embedId, block, via: 'embed_scan' })
  }
  return slots
}

/** Find image embeds near a placeholder keyword in XML (catches odd Word / Canva layouts). */
function findProximityKeywordSlots(xml: string) {
  const slots: Array<{ key: string, embedId: string, block: string, via: string }> = []
  const seen = new Set<string>()
  const containers = findPictureContainers(xml)
  const lowered = xml.toLowerCase()

  for (const key of IMAGE_PLACEHOLDER_KEYS) {
    if (key === 'member_photo') continue
    const needles = [key, `{${key}}`, key.replace(/_/g, ' ')]
    if (key === 'presbyter_sign') needles.push('presbyter', 'PRESBYTER')
    for (const needle of needles) {
      let from = 0
      while (from < lowered.length) {
        const idx = lowered.indexOf(needle, from)
        if (idx < 0) break
        from = idx + needle.length
        const window = xml.slice(Math.max(0, idx - 12000), Math.min(xml.length, idx + 12000))
        const embedRe = /(?:r:embed|r:id)\s*=\s*"(rId\d+)"/gi
        let best: { embedId: string, dist: number } | null = null
        let em: RegExpExecArray | null
        while ((em = embedRe.exec(window)) !== null) {
          const embedIdx = (em.index ?? 0) + Math.max(0, idx - 12000)
          const dist = Math.abs(embedIdx - idx)
          if (!best || dist < best.dist) best = { embedId: em[1], dist }
        }
        if (!best) continue
        const dedupe = key + '|' + best.embedId
        if (seen.has(dedupe)) continue
        seen.add(dedupe)
        let block = ''
        const esc = best.embedId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        const embedNeedle = new RegExp(`(?:r:embed|r:id)\\s*=\\s*"${esc}"`, 'i')
        for (const c of containers) {
          if (!embedNeedle.test(c.block)) continue
          const picked = pickSwapBlock(c, c.start)
          block = picked?.block || c.block
          break
        }
        if (!block) continue
        slots.push({ key, embedId: best.embedId, block, via: 'proximity:' + needle })
      }
    }
  }
  return slots
}

/** Resolve partial pic:pic blocks to the enclosing Word drawing for reliable Google PDF conversion. */
function resolveDocxSwapBlock(xml: string, slot: { embedId: string, block: string }) {
  if (/<w:drawing\b/i.test(slot.block) || /<w:pict\b/i.test(slot.block)) return slot.block
  const esc = slot.embedId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const embedNeedle = new RegExp(`(?:r:embed|r:id)\\s*=\\s*"${esc}"`, 'i')
  for (const c of findPictureContainers(xml)) {
    if (c.tag !== 'w:drawing' && c.tag !== 'w:pict') continue
    if (embedNeedle.test(c.block)) return c.block
  }
  return slot.block
}

/** Resolve partial p:pic / p:sp blocks to the best swap target for Google Slides. */
function resolvePptxSwapBlock(xml: string, slot: { embedId: string, block: string }) {
  const exact = findExactPptxBlockByEmbedId(xml, slot.embedId)
  if (exact) return exact
  if (/<p:(?:pic|sp|grpSp)\b/i.test(slot.block) && slot.block.length < 50000) return slot.block
  return slot.block
}

function findExactPptxBlockByEmbedId(xml: string, embedId: string): string | null {
  const esc = embedId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const needle = new RegExp(`(?:r:embed|r:id)\\s*=\\s*"${esc}"`, 'i')
  for (const c of findPictureContainers(xml)) {
    if (!/^(p:pic|p:sp|p:grpSp)$/i.test(c.tag)) continue
    if (!needle.test(c.block)) continue
    const picked = pickSwapBlock(c, c.start)
    return picked?.block || c.block
  }
  return null
}

/** Every r:embed / r:id inside a picture block (main blip + Canva SVG overrides). */
function extractAllBlipEmbedIds(block: string): string[] {
  const ids = new Set<string>()
  for (const m of block.matchAll(/(?:r:embed|r:id)\s*=\s*"([^"]+)"/gi)) {
    if (m[1]) ids.add(m[1])
  }
  return [...ids]
}

/** Keep wp:anchor layout; replace blipFill so Google reads raster media, not cached SVG. */
function refreshDocxPictureBlipInBlock(block: string, rId: string): string {
  let out = stripDocxSvgBlips(block)
  const blipFill = `<pic:blipFill><a:blip r:embed="${rId}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>`
  if (/<pic:blipFill\b/i.test(out)) {
    return out.replace(/<pic:blipFill\b[\s\S]*?<\/pic:blipFill>/i, blipFill)
  }
  if (/<a:blip\b/i.test(out)) {
    return out.replace(/<a:blip\b[^>]*\/?>/i, `<a:blip r:embed="${rId}"/>`)
  }
  return out
}

function stripPptxSvgBlips(block: string) {
  return block
    .replace(/<a:ext\b[^>]*>[\s\S]*?<asvg:svgBlip\b[\s\S]*?<\/a:ext>/gi, '')
    .replace(/<asvg:svgBlip\b[^>]*\/>/gi, '')
    .replace(/<asvg:svgBlip\b[\s\S]*?<\/asvg:svgBlip>/gi, '')
}

/** Keep Canva p:pic / p:sp layout; replace blipFill so Google Slides reads raster media. */
function refreshPptxBlipInBlock(block: string, rId: string): string {
  let out = stripPptxSvgBlips(block)
  const blipFill = `<p:blipFill><a:blip r:embed="${rId}"/><a:stretch><a:fillRect/></a:stretch></p:blipFill>`
  if (/<p:blipFill\b/i.test(out)) {
    return out.replace(/<p:blipFill\b[\s\S]*?<\/p:blipFill>/i, blipFill)
  }
  if (/<pic:blipFill\b/i.test(out)) {
    return out.replace(/<pic:blipFill\b[\s\S]*?<\/pic:blipFill>/i,
      `<pic:blipFill><a:blip r:embed="${rId}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>`)
  }
  if (/<a:blip\b/i.test(out)) {
    return out.replace(/<a:blip\b[^>]*\/?>/i, `<a:blip r:embed="${rId}"/>`)
  }
  return out
}

/** Certificate Canva: visible signature is often near a "PRESBYTER" label, not only AltText. */
function findPptxLabelProximitySlots(xml: string) {
  const slots: Array<{ key: string, embedId: string, block: string, via: string }> = []
  const seen = new Set<string>()
  const containers = findPictureContainers(xml)
  const lowered = xml.toLowerCase()
  const needles = ['presbyter', 'presbyter sign', 'presbyter_sign', '{presbyter_sign}']

  for (const needle of needles) {
    let from = 0
    while (from < lowered.length) {
      const idx = lowered.indexOf(needle, from)
      if (idx < 0) break
      from = idx + needle.length

      let best: { container: PicContainer, dist: number } | null = null
      for (const c of containers) {
        if (!/^(p:pic|p:sp|p:grpSp)$/i.test(c.tag)) continue
        const dist = idx < c.start ? c.start - idx : idx >= c.end ? idx - c.end : 0
        if (dist > 12000) continue
        if (!best || dist < best.dist) best = { container: c, dist }
      }
      if (!best) continue

      const picked = pickSwapBlock(best.container, idx)
      if (!picked) continue
      const dedupe = `presbyter_sign|${picked.embedId}`
      if (seen.has(dedupe)) continue
      seen.add(dedupe)
      slots.push({
        key: 'presbyter_sign',
        embedId: picked.embedId,
        block: picked.block,
        via: `pptx_label:${needle}`,
      })
    }
  }
  return slots
}

function stripDocxSvgBlips(xml: string) {
  return xml
    .replace(/<a:ext\b[^>]*>[\s\S]*?<asvg:svgBlip\b[\s\S]*?<\/a:ext>/gi, '')
    .replace(/<asvg:svgBlip\b[^>]*\/>/gi, '')
    .replace(/<asvg:svgBlip\b[\s\S]*?<\/asvg:svgBlip>/gi, '')
}

function canInplaceOverwriteMedia(mediaPath: string, img: { ext: string }) {
  const ext = (mediaPath.split('.').pop() || '').toLowerCase()
  if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'].includes(ext)) return true
  return ext === String(img.ext || '').toLowerCase()
}

/** Point every blip in a picture block at the new relationship; drop SVG overrides Canva leaves behind. */
function retargetPictureBlock(block: string, oldEmbedId: string, newRId: string) {
  let out = block
  const esc = oldEmbedId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  out = out.replace(new RegExp('(r:embed\\s*=\\s*")' + esc + '(")', 'gi'), '$1' + newRId + '$2')
  out = out.replace(new RegExp("(r:embed\\s*=\\s*')" + esc + "(')", 'gi'), '$1' + newRId + '$2')
  out = out.replace(new RegExp('(r:id\\s*=\\s*")' + esc + '(")', 'gi'), '$1' + newRId + '$2')
  out = out.replace(new RegExp("(r:id\\s*=\\s*')" + esc + "(')", 'gi'), '$1' + newRId + '$2')
  out = out.replace(new RegExp('r:link\\s*=\\s*"' + esc + '"', 'gi'), 'r:embed="' + newRId + '"')
  out = out.replace(/(<a:blip\b[^>]*\br:embed\s*=\s*")([^"]+)(")/gi, '$1' + newRId + '$3')
  out = out.replace(/(<asvg:svgBlip\b[^>]*\br:embed\s*=\s*")([^"]+)(")/gi, '$1' + newRId + '$3')
  out = out.replace(/(<v:imagedata\b[^>]*\br:id\s*=\s*")([^"]+)(")/gi, '$1' + newRId + '$3')
  out = out.replace(/<a:ext\b[^>]*>[\s\S]*?<asvg:svgBlip\b[\s\S]*?<\/a:ext>/gi, '')
  out = out.replace(/<asvg:svgBlip\b[^>]*\/>/gi, '')
  out = out.replace(/<asvg:svgBlip\b[\s\S]*?<\/asvg:svgBlip>/gi, '')
  return out
}


function resolveRelTargetToZipPath(xmlPartPath: string, relTarget: string) {
  const dir = xmlPartPath.includes('/') ? xmlPartPath.slice(0, xmlPartPath.lastIndexOf('/')) : ''
  const joined = `${dir}/${String(relTarget).replace(/^\//, '')}`
  const stack: string[] = []
  for (const part of joined.split('/')) {
    if (!part || part === '.') continue
    if (part === '..') stack.pop()
    else stack.push(part)
  }
  return stack.join('/')
}

function mediaPathFromRels(relsXml: string, embedId: string, xmlPartPath = 'word/document.xml') {
  for (const m of relsXml.matchAll(/<Relationship\b[^>]*\/?>/gi)) {
    const tag = m[0]
    const id = tag.match(/\bId\s*=\s*"([^"]+)"/i)?.[1]
    if (id !== embedId) continue
    const target = tag.match(/\bTarget\s*=\s*"([^"]+)"/i)?.[1]
    if (!target) return null
    if (/^https?:/i.test(target) || /TargetMode\s*=\s*"External"/i.test(tag)) return null
    return resolveRelTargetToZipPath(xmlPartPath, target)
  }
  return null
}

/** Canva reuses one media file (and rId) for many shapes — count blips before in-place overwrite. */
async function countBlipsUsingMediaFile(zip: JSZip, mediaPath: string): Promise<number> {
  const fileName = String(mediaPath || '').replace(/^.*\//, '')
  if (!fileName) return 0

  const embedIds = new Set<string>()
  for (const path of Object.keys(zip.files)) {
    if (!path.includes('_rels/') || !path.endsWith('.rels')) continue
    const file = zip.file(path)
    if (!file) continue
    const relsXml = await file.async('string')
    for (const m of relsXml.matchAll(/<Relationship\b[^>]*\/?>/gi)) {
      const tag = m[0]
      if (!/relationships\/image/i.test(tag)) continue
      const target = tag.match(/\bTarget\s*=\s*"([^"]+)"/i)?.[1]
      if (!target || !target.endsWith(fileName)) continue
      const id = tag.match(/\bId\s*=\s*"([^"]+)"/i)?.[1]
      if (id) embedIds.add(id)
    }
  }
  if (!embedIds.size) return 0

  let blipCount = 0
  const xmlParts = Object.keys(zip.files).filter(n =>
    (/^ppt\//.test(n) || /^word\//.test(n)) && n.endsWith('.xml') && !zip.files[n].dir,
  )
  for (const partPath of xmlParts) {
    const file = zip.file(partPath)
    if (!file) continue
    const partXml = await file.async('string')
    for (const embedId of embedIds) {
      const esc = embedId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      blipCount += (partXml.match(new RegExp(`r:embed="${esc}"`, 'gi')) || []).length
      blipCount += (partXml.match(new RegExp(`r:id="${esc}"`, 'gi')) || []).length
    }
  }
  return blipCount
}

/** Point an existing image relationship at a new media/… target (keeps rId for reuse_rel). */
function patchRelationshipTarget(relsXml: string, embedId: string, relTarget: string) {
  const esc = embedId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const re = new RegExp(`(<Relationship\\b[^>]*\\bId="${esc}"[^>]*\\bTarget=")([^"]+)(")`, 'i')
  if (!re.test(relsXml)) return { relsXml, changed: false }
  return {
    relsXml: relsXml.replace(re, `$1${relTarget}$3`),
    changed: true,
  }
}

/**
 * Overwrite placeholder media for signature swap.
 * JPEG signature into a .png part breaks Google Docs import — rel target must match bytes.
 */
function writeSignaturePlaceholderMedia(
  zip: JSZip,
  ctXml: string,
  relsXml: string,
  relTargetPrefix: string,
  embedId: string,
  existingBefore: string,
  img: { bytes: Uint8Array, ext: string, contentType: string },
): { relsXml: string, ctXml: string, relsDirty: boolean, mediaPath: string } {
  let relsDirty = false
  const existingExt = (existingBefore.split('.').pop() || '').toLowerCase()
  let mediaPath = existingBefore

  if (existingExt && existingExt !== String(img.ext || '').toLowerCase()) {
    mediaPath = existingBefore.replace(/\.[^./\\]+$/, `.${img.ext}`)
    const fileName = mediaPath.includes('/') ? mediaPath.slice(mediaPath.lastIndexOf('/') + 1) : mediaPath
    const patched = patchRelationshipTarget(relsXml, embedId, `${relTargetPrefix}${fileName}`)
    relsXml = patched.relsXml
    relsDirty = patched.changed
  }

  zip.file(mediaPath, img.bytes)
  if (ctXml) {
    ctXml = ensureContentTypeDefault(ctXml, img.ext, img.contentType)
    ctXml = ensureMediaContentTypeOverride(ctXml, mediaPath, img.contentType)
  }
  return { relsXml, ctXml, relsDirty, mediaPath }
}

function extractWordInlineExtent(block: string): { cx: string, cy: string } | null {
  const cx = block.match(/<wp:extent\b[^>]*\bcx\s*=\s*"(\d+)"/i)?.[1]
    || block.match(/<a:ext\b[^>]*\bcx\s*=\s*"(\d+)"/i)?.[1]
  const cy = block.match(/<wp:extent\b[^>]*\bcy\s*=\s*"(\d+)"/i)?.[1]
    || block.match(/<a:ext\b[^>]*\bcy\s*=\s*"(\d+)"/i)?.[1]
  if (cx && cy) return { cx, cy }
  return null
}

/** Locate the exact w:drawing / w:pict block containing an embed id (handles xml.includes mismatches). */
function findExactWordDrawingByEmbedId(xml: string, embedId: string): string | null {
  const esc = embedId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const needle = new RegExp(`(?:r:embed|r:id)\\s*=\\s*"${esc}"`, 'i')
  for (const c of findPictureContainers(xml)) {
    if ((c.tag === 'w:drawing' || c.tag === 'w:pict') && needle.test(c.block)) return c.block
  }
  const re = new RegExp(`<w:drawing\\b[\\s\\S]*?${esc}[\\s\\S]*?<\\/w:drawing>`, 'i')
  return re.exec(xml)?.[0] || null
}

/** Find Word drawing for an alt-text key (Pass B — mirrors certificate grpSp / nearby binding). */
function findDocxDrawingForAltKey(xml: string, key: string): { block: string, embedId: string } | null {
  const hits = findAltTextHits(xml).filter(h => h.key === key)
  if (!hits.length) return null
  const containers = findPictureContainers(xml).filter(c => c.tag === 'w:drawing' || c.tag === 'w:pict')
  let best: { block: string, embedId: string, score: number } | null = null
  for (const hit of hits) {
    for (const c of containers) {
      const embedId = extractBlipEmbedId(c.block)
      if (!embedId) continue
      let score: number
      if (hit.index >= c.start && hit.index < c.end) score = c.end - c.start
      else {
        score = hit.index < c.start ? c.start - hit.index : hit.index - c.end
        if (score > 8000) continue
        score += 10000
      }
      if (!best || score < best.score) best = { block: c.block, embedId, score }
    }
  }
  return best ? { block: best.block, embedId: best.embedId } : null
}

function extractWordAnchorLayout(block: string) {
  const anchor = block.match(/<wp:anchor\b[\s\S]*?<\/wp:anchor>/i)?.[0]
  if (!anchor) return null
  const extent = extractWordInlineExtent(anchor)
  const posH = anchor.match(/<wp:positionH\b[\s\S]*?<\/wp:positionH>/i)?.[0] || '<wp:positionH relativeFrom="column"><wp:posOffset>0</wp:posOffset></wp:positionH>'
  const posV = anchor.match(/<wp:positionV\b[\s\S]*?<\/wp:positionV>/i)?.[0] || '<wp:positionV relativeFrom="paragraph"><wp:posOffset>0</wp:posOffset></wp:positionV>'
  const wrap = anchor.match(/<wp:wrap(?:None|Square|Tight|Through|TopAndBottom)\b[^>]*\/>/i)?.[0]
    || anchor.match(/<wp:wrap(?:None|Square|Tight|Through|TopAndBottom)\b[\s\S]*?<\/wp:wrap(?:None|Square|Tight|Through|TopAndBottom)>/i)?.[0]
    || '<wp:wrapNone/>'
  const anchorOpen = (anchor.match(/<wp:anchor\b([^>]*)>/i)?.[1] || ' distT="0" distB="0" distL="0" distR="0"')
    .replace(/\s+xmlns(?::\w+)?="[^"]*"/gi, '')
  return { extent, posH, posV, wrap, anchorOpen }
}

/** Floating Word picture — certificate-style clean shape with preserved anchor position. */
function signatureDrawingAnchorXml(
  rId: string,
  docPrId: number,
  name: string,
  layout: NonNullable<ReturnType<typeof extractWordAnchorLayout>>,
  isSeal = false,
) {
  const cx = layout.extent?.cx || (isSeal ? '914400' : '1463040')
  const cy = layout.extent?.cy || (isSeal ? '914400' : '502920')
  return (
    `<w:drawing>`
    + `<wp:anchor xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"${layout.anchorOpen}>`
    + `<wp:simplePos x="0" y="0"/>`
    + layout.posH
    + layout.posV
    + `<wp:extent cx="${cx}" cy="${cy}"/>`
    + `<wp:effectExtent l="0" t="0" r="0" b="0"/>`
    + layout.wrap
    + `<wp:docPr id="${docPrId}" name="${escapeXml(name)}" descr="{${escapeXml(name)}}"/>`
    + `<wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr>`
    + `<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">`
    + `<a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">`
    + `<pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">`
    + `<pic:nvPicPr><pic:cNvPr id="0" name="${escapeXml(name)}" descr="{${escapeXml(name)}}"/><pic:cNvPicPr/></pic:nvPicPr>`
    + `<pic:blipFill><a:blip xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:embed="${rId}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>`
    + `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm>`
    + `<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>`
    + `</pic:pic></a:graphicData></a:graphic>`
    + `</wp:anchor></w:drawing>`
  )
}

/**
 * DOCX church signature swap — same strategy as certificate PPTX replace_shape:
 * overwrite placeholder media + new rel + replace the whole picture shape (never relink-only).
 */
function docxReplaceSignaturePicture(
  xml: string,
  oldBlock: string,
  embedId: string,
  rId: string,
  key: string,
  docPrId: number,
): { xml: string, method: string } | null {
  let block = oldBlock
  if (!xml.includes(block)) {
    const exact = findExactWordDrawingByEmbedId(xml, embedId)
    if (exact) block = exact
  }
  if (!block || !xml.includes(block)) return null

  const isSeal = key === 'treasurer_seal'
  const extent = extractWordInlineExtent(block)

  // Floating Word images: never rebuild wp:anchor — Google Drive rejects the resulting DOCX.
  if (/<wp:anchor\b/i.test(block)) {
    return null
  }

  // Certificate-style: brand-new clean inline picture at preserved size
  if (/<w:drawing\b/i.test(block)) {
    const drawing = signatureDrawingXml(rId, docPrId, key, isSeal, extent?.cx, extent?.cy)
    return { xml: xml.split(block).join(drawing), method: 'docx_replace_shape' }
  }
  if (/<w:pict\b/i.test(block)) {
    const drawing = signatureDrawingXml(rId, docPrId, key, isSeal, extent?.cx, extent?.cy)
    return { xml: xml.split(block).join(drawing), method: 'docx_replace_vml' }
  }

  return null
}

/** Inline signature fallback when using text {presbyter_sign} (not preferred) */
function signatureDrawingXml(
  rId: string,
  docPrId: number,
  name: string,
  isSeal = false,
  cxOverride?: string,
  cyOverride?: string,
) {
  const cx = cxOverride || (isSeal ? '914400' : '1463040')
  const cy = cyOverride || (isSeal ? '914400' : '502920')
  return (
    `<w:drawing>`
    + `<wp:inline distT="0" distB="0" distL="0" distR="0"`
    + ` xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"`
    + ` xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"`
    + ` xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"`
    + ` xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">`
    + `<wp:extent cx="${cx}" cy="${cy}"/>`
    + `<wp:docPr id="${docPrId}" name="${escapeXml(name)}" descr="{${escapeXml(name)}}"/>`
    + `<wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr>`
    + `<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">`
    + `<pic:pic>`
    + `<pic:nvPicPr><pic:cNvPr id="0" name="${escapeXml(name)}" descr="{${escapeXml(name)}}"/><pic:cNvPicPr/></pic:nvPicPr>`
    + `<pic:blipFill><a:blip r:embed="${rId}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>`
    + `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm>`
    + `<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>`
    + `</pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing>`
  )
}

function injectImageAtPlaceholder(xml: string, key: string, drawingXml: string) {
  const marker = `§§IMG_${key}§§`
  if (!placeholderExistsInXml(xml, key)) return xml
  let out = replacePlaceholderInXml(xml, key, marker)
  if (!out.includes(marker)) return out
  const splice = `</w:t></w:r><w:r>${drawingXml}</w:r><w:r><w:t>`
  return out.split(marker).join(splice)
}

/** Strip XML to readable text (same approach as frontend placeholder scan). */
function officePlainText(xml: string) {
  return String(xml || '')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/<a:t[^>]*>/gi, '')
    .replace(/<\/a:t>/gi, '')
    .replace(/<w:t[^>]*>/gi, '')
    .replace(/<\/w:t>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
}

function officeHasPlaceholder(xml: string, key: string) {
  if (placeholderExistsInXml(xml, key)) return true
  return officePlainText(xml).includes(`{${key}}`)
}

function maxCNvPrId(xml: string) {
  let max = 1
  for (const m of xml.matchAll(/\bid\s*=\s*"(\d+)"/gi)) {
    max = Math.max(max, Number(m[1]) || 0)
  }
  return max
}

/** Find p:sp (incl. inside groups) that contains a signature text placeholder. */
function findPptxShapeForPlaceholder(xml: string, key: string) {
  const re = /<p:sp\b[\s\S]*?<\/p:sp>/gi
  let best: string | null = null
  for (const m of xml.matchAll(re)) {
    const block = m[0]
    if (officeHasPlaceholder(block, key)) {
      // Prefer innermost / shortest match
      if (!best || block.length < best.length) best = block
    }
  }
  return best
}

function extractPptxXfrm(spXml: string) {
  // Prefer shape/picture spPr xfrm (works for p:sp and p:pic)
  const spPr = spXml.match(/<p:spPr\b[\s\S]*?<\/p:spPr>/i)?.[0]
    || spXml.match(/<pic:spPr\b[\s\S]*?<\/pic:spPr>/i)?.[0]
    || spXml
  const x = spPr.match(/<a:off\b[^>]*\bx\s*=\s*"(-?\d+)"/i)?.[1]
  const y = spPr.match(/<a:off\b[^>]*\by\s*=\s*"(-?\d+)"/i)?.[1]
  const cx = spPr.match(/<a:ext\b[^>]*\bcx\s*=\s*"(\d+)"/i)?.[1]
  const cy = spPr.match(/<a:ext\b[^>]*\bcy\s*=\s*"(\d+)"/i)?.[1]
  if (x == null || y == null || cx == null || cy == null) return null
  return { x, y, cx, cy }
}

function adjustSignatureXfrm(
  xfrm: { x: string, y: string, cx: string, cy: string },
  isSeal = false,
) {
  let cx = Number(xfrm.cx) || 0
  let cy = Number(xfrm.cy) || 0
  let x = Number(xfrm.x) || 0
  let y = Number(xfrm.y) || 0
  const wantCy = isSeal ? 914400 : 700000
  const wantCx = isSeal ? 914400 : 2000000
  if (cy < wantCy) {
    const grow = wantCy - cy
    y = Math.max(0, y - grow) // grow upward so image sits on the signature line
    cy = wantCy
  }
  if (cx < wantCx) cx = wantCx
  return { x: String(Math.round(x)), y: String(Math.round(y)), cx: String(Math.round(cx)), cy: String(Math.round(cy)) }
}

function pptxSignaturePicXml(
  rId: string,
  shapeId: number,
  name: string,
  xfrm: { x: string, y: string, cx: string, cy: string },
  isSeal = false,
  preserveSize = false,
) {
  // Text placeholders need a grown box; AltText image placeholders keep Canva size/position
  const adj = preserveSize
    ? {
      x: String(xfrm.x || '0'),
      y: String(xfrm.y || '0'),
      cx: String(xfrm.cx || '2000000'),
      cy: String(xfrm.cy || '700000'),
    }
    : adjustSignatureXfrm(xfrm, isSeal)
  return (
    `<p:pic>`
    + `<p:nvPicPr>`
    + `<p:cNvPr id="${shapeId}" name="${escapeXml(name)}" descr="{${escapeXml(name)}}"/>`
    + `<p:cNvPicPr><a:picLocks noChangeAspect="0"/></p:cNvPicPr>`
    + `<p:nvPr/>`
    + `</p:nvPicPr>`
    + `<p:blipFill>`
    + `<a:blip r:embed="${rId}"/>`
    + `<a:stretch><a:fillRect/></a:stretch>`
    + `</p:blipFill>`
    + `<p:spPr bwMode="auto">`
    + `<a:xfrm><a:off x="${adj.x}" y="${adj.y}"/><a:ext cx="${adj.cx}" cy="${adj.cy}"/></a:xfrm>`
    + `<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>`
    + `</p:spPr>`
    + `</p:pic>`
  )
}

function ensureMediaContentTypeOverride(ctXml: string, mediaPath: string, contentType: string) {
  const part = `/${mediaPath.replace(/^\/+/, '')}`
  if (ctXml.includes(`PartName="${part}"`)) return ctXml
  return ctXml.replace(
    '</Types>',
    `<Override PartName="${part}" ContentType="${contentType}"/></Types>`,
  )
}

async function loadChurchSignatureImages(admin: ReturnType<typeof createClient>) {
  const { data: church } = await admin
    .from('churches')
    .select(
      'church_name, diocese, address, city, pincode, '
      + 'presbyter_name, pastor_name, secretary_name, treasurer_name, '
      + 'presbyter_signature_url, secretary_signature_url, treasurer_signature_url, treasurer_seal_url',
    )
    .limit(1)
    .maybeSingle()

  const images: Record<string, { bytes: Uint8Array, ext: string, contentType: string }> = {}
  const debug: Record<string, string> = {}
  const mergeFields: Record<string, string> = {}
  if (!church) {
    debug.church = 'not_found'
    return { images, debug, mergeFields }
  }

  const churchName = String(church.church_name || '')
  // Prefer Church Setup Presbyter name; fall back to legacy pastor_name only if it looks like a person
  const primary = String(church.presbyter_name || '').trim()
  const legacy = String(church.pastor_name || '').trim()
  const looksLikeChurch = (s: string) => {
    if (!s) return false
    if (churchName && s.toLowerCase() === churchName.toLowerCase()) return true
    return /\b(church|pastorate|parish|cathedral|diocese|congregation)\b/i.test(s)
  }
  let presbyter = ''
  if (primary && !looksLikeChurch(primary)) presbyter = primary
  else if (legacy && !looksLikeChurch(legacy)) presbyter = legacy
  else if (primary) presbyter = primary
  mergeFields.church_name = churchName
  mergeFields.Church_name = churchName
  mergeFields.presbyter_name = presbyter
  mergeFields.pastor_name = presbyter
  mergeFields.diocese = String(church.diocese || '')
  mergeFields.secretary_name = String(church.secretary_name || '')
  mergeFields.treasurer_name = String(church.treasurer_name || '')
  mergeFields.address = [church.address, church.city, church.pincode].filter(Boolean).join(', ')

  const STORAGE_FALLBACK: Record<string, string> = {
    presbyter_signature_url: 'signatures/presbyter-signature.png',
    secretary_signature_url: 'signatures/secretary-signature.png',
    treasurer_signature_url: 'signatures/treasurer-signature.png',
    treasurer_seal_url: 'treasurer-seal.png',
  }

  const loaded = new Map<string, { bytes: Uint8Array, ext: string, contentType: string } | null>()

  async function loadColumn(column: string, url: string | null | undefined) {
    if (loaded.has(column)) return loaded.get(column)!

    const path = STORAGE_FALLBACK[column]
    const { img, via } = await loadSignatureFromUrlOrStorage(admin, url, path)
    if (img) {
      debug[column] = `${via}:${img.ext}:${img.bytes.length}b`
      loaded.set(column, img)
      return img
    }

    debug[column] = via === 'fetch_failed' ? `fetch_failed:${String(url).slice(0, 80)}` : via
    loaded.set(column, null)
    return null
  }

  for (const [placeholder, column] of Object.entries(IMAGE_PLACEHOLDER_MAP)) {
    const url = (church as Record<string, string | null>)[column]
    const img = await loadColumn(column, url)
    if (img) images[placeholder] = img
  }
  return { images, debug, mergeFields }
}

async function loadMemberPhotoImage(
  admin: ReturnType<typeof createClient>,
  memberId: string | null | undefined,
) {
  const id = String(memberId || '').trim()
  if (!id) return { img: null as null, debug: 'no_member_id' }

  const { data: member } = await admin
    .from('members')
    .select('member_id, photo_url')
    .ilike('member_id', id)
    .maybeSingle()

  if (!member) return { img: null, debug: 'member_not_found' }

  const resolvedId = String(member.member_id || id).trim()
  const url = member.photo_url ? String(member.photo_url) : ''
  const tryPaths: string[] = []
  const seenPaths = new Set<string>()
  const addPath = (p: string) => {
    const clean = String(p || '').replace(/^\/+/, '')
    if (clean && !seenPaths.has(clean)) {
      seenPaths.add(clean)
      tryPaths.push(clean)
    }
  }

  const m = url.match(/\/storage\/v1\/object\/(?:public|sign)\/member-photos\/([^?]+)/i)
  if (m?.[1]) addPath(decodeURIComponent(m[1]))

  for (const ext of ['jpg', 'jpeg', 'png', 'webp']) {
    addPath(`active/${resolvedId}.${ext}`)
    addPath(`deleted/${resolvedId}.${ext}`)
  }

  // Case variants (storage paths may differ in casing from typed member_id)
  if (resolvedId !== id) {
    for (const ext of ['jpg', 'jpeg', 'png', 'webp']) {
      addPath(`active/${id}.${ext}`)
    }
  }

  try {
    const { data: listing } = await admin.storage.from('member-photos').list('active', { limit: 100, search: resolvedId })
    for (const f of listing || []) {
      if (!f?.name) continue
      const lower = f.name.toLowerCase()
      if (lower.startsWith(resolvedId.toLowerCase()) || lower.startsWith(id.toLowerCase())) {
        addPath(`active/${f.name}`)
      }
    }
  } catch { /* ignore list errors */ }

  for (const tryPath of tryPaths) {
    const { data, error } = await admin.storage.from('member-photos').download(tryPath)
    if (error || !data) continue
    const bytes = new Uint8Array(await data.arrayBuffer())
    if (!bytes.length) continue
    return { img: { bytes, ...sniffImageMeta(bytes, tryPath) }, debug: `storage:${tryPath}` }
  }

  // Signed URL fetch (works when bucket is private)
  for (const tryPath of tryPaths.slice(0, 6)) {
    try {
      const { data: signed } = await admin.storage.from('member-photos').createSignedUrl(tryPath, 120)
      if (signed?.signedUrl) {
        const fetched = await fetchSignatureImage(signed.signedUrl)
        if (fetched) return { img: fetched, debug: `signed:${tryPath}` }
      }
    } catch { /* try next */ }
  }

  const fetched = await fetchSignatureImage(url)
  if (fetched) return { img: fetched, debug: 'url' }
  return { img: null, debug: 'no_photo_in_storage' }
}

async function mergeOfficeBytes(
  officeBytes: Uint8Array,
  fieldValues: Record<string, unknown>,
  signatureImages: Record<string, { bytes: Uint8Array, ext: string, contentType: string }> = {},
  format: 'docx' | 'pptx' = 'docx',
  mergeOptions: { pptxNameFit?: PptxNameFitMode | 'off' } = {},
) {
  const pptxNameFit = mergeOptions.pptxNameFit ?? 'standard'
  const zip = await JSZip.loadAsync(officeBytes)
  const isPptx = format === 'pptx'
  let pptxSlideSize: { cx: number, cy: number } | null = null
  if (isPptx) {
    const presXml = await zip.file('ppt/presentation.xml')?.async('string')
    if (presXml) pptxSlideSize = extractPptxSlideSize(presXml)
  }
  const targets = Object.keys(zip.files).filter(n =>
    (isPptx
      ? /^ppt\/(slides|slideLayouts|slideMasters)\/[^/]+\.xml$/i.test(n)
      : /^word\/(document|header\d*|footer\d*|footnotes|endnotes|comments)\.xml$/i.test(n))
    && !zip.files[n].dir
  )

  let docPrSeq = 900
  let mediaSeq = 0
  const swappedKeys = new Set<string>()
  const swapLog: string[] = []
  const slotsFound: string[] = []
  const altDebug: Array<Record<string, unknown>> = []

  let ctXml = zip.file('[Content_Types].xml')
    ? await zip.file('[Content_Types].xml')!.async('string')
    : ''

  for (const name of targets) {
    const file = zip.file(name)
    if (!file) continue
    let xml = await file.async('string')
    // Canva sometimes inserts zero-width chars inside placeholder text
    xml = xml.replace(/[\u200B-\u200D\uFEFF]/g, '')

    const relsName = relsPathForXmlPart(name)
    let relsXml = zip.file(relsName)
      ? await zip.file(relsName)!.async('string')
      : `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
        + `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>`
    let relsDirty = false

    const mediaFolder = isPptx ? 'ppt/media' : 'word/media'
    const relTargetPrefix = isPptx ? '../media/' : 'media/'

    // 1) Replace pictures by AltText — overwrite media in place (best for Word → Google PDF)
    const found = findAltTextImageSlots(xml)
    for (const extra of findImageSlotsFromEmbedScan(xml, relsXml)) {
      if (!found.slots.some(s => s.key === extra.key && s.embedId === extra.embedId)) {
        found.slots.push(extra)
      }
    }
    for (const extra of findProximityKeywordSlots(xml)) {
      if (!found.slots.some(s => s.key === extra.key && s.embedId === extra.embedId)) {
        found.slots.push(extra)
      }
    }
    if (isPptx) {
      for (const extra of findPptxLabelProximitySlots(xml)) {
        if (!found.slots.some(s => s.key === extra.key && s.embedId === extra.embedId)) {
          found.slots.push(extra)
        }
      }
    }
    found.slots = dedupeMemberPhotoSlots(found.slots)
    altDebug.push({
      part: name,
      alt_hits: found.debugHits.slice(0, 20),
      image_containers: found.containerCount,
      slots: found.slots.map(s => ({ key: s.key, embedId: s.embedId, via: s.via, block_len: s.block.length })),
    })

    let docPartSigSwapped = false

    for (const slot of found.slots) {
      slotsFound.push(`${name}:${slot.key}:${slot.embedId}:${slot.via}`)
      const img = signatureImages[slot.key]
      if (!img) {
        swapLog.push(`${slot.key}:no_image_bytes`)
        continue
      }

      const isChurchSignature = slot.key !== 'member_photo' && !!IMAGE_PLACEHOLDER_MAP[slot.key]
      const swapBlock = !isPptx ? resolveDocxSwapBlock(xml, slot) : resolvePptxSwapBlock(xml, slot)
      const existingBefore = mediaPathFromRels(relsXml, slot.embedId, name)

      // PPTX church signatures: overwrite media + refresh blip (same strategy as member photo / Word letters)
      if (isChurchSignature && isPptx) {
        const useImg = await normalizeImageToPng(img)
        let block = swapBlock
        if (!xml.includes(block)) {
          const exact = findExactPptxBlockByEmbedId(xml, slot.embedId)
          if (exact) block = exact
        }

        const embedIds = new Set<string>([slot.embedId])
        for (const eid of extractAllBlipEmbedIds(block)) embedIds.add(eid)

        let didMedia = false
        for (const embedId of embedIds) {
          const mediaPath = mediaPathFromRels(relsXml, embedId, name)
          if (!mediaPath) continue
          const written = writeSignaturePlaceholderMedia(
            zip, ctXml, relsXml, relTargetPrefix, embedId, mediaPath, useImg,
          )
          relsXml = written.relsXml
          ctXml = written.ctXml
          if (written.relsDirty) relsDirty = true
          didMedia = true
          swapLog.push(`${slot.key}:pptx_overwrite:${written.mediaPath}`)
        }

        let didXml = false
        if (block && xml.includes(block)) {
          const refreshed = refreshPptxBlipInBlock(block, slot.embedId)
          if (refreshed !== block) {
            xml = xml.split(block).join(refreshed)
            didXml = true
            swapLog.push(`${slot.key}:pptx_refresh_blip:${slot.embedId}`)
          }
        }

        if (!didXml && block && xml.includes(block)) {
          mediaSeq += 1
          const mediaName = `sign_${slot.key}_${mediaSeq}.${useImg.ext}`
          const mediaPath = `${mediaFolder}/${mediaName}`
          zip.file(mediaPath, useImg.bytes)
          if (ctXml) {
            ctXml = ensureContentTypeDefault(ctXml, useImg.ext, useImg.contentType)
            ctXml = ensureMediaContentTypeOverride(ctXml, mediaPath, useImg.contentType)
          }
          const rId = nextRelationshipId(relsXml)
          relsXml = relsXml.replace(
            '</Relationships>',
            `<Relationship Id="${rId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="${relTargetPrefix}${mediaName}"/></Relationships>`,
          )
          relsDirty = true
          const xfrm = extractPptxXfrm(block) || { x: '0', y: '0', cx: '2000000', cy: '700000' }
          const shapeId = maxCNvPrId(xml) + 1
          const pic = pptxSignaturePicXml(rId, shapeId, slot.key, xfrm, slot.key === 'treasurer_seal', true)
          xml = xml.split(block).join(pic)
          didXml = true
          swapLog.push(`${slot.key}:replace_shape:${rId}:${xfrm.cx}x${xfrm.cy}@${xfrm.x},${xfrm.y}`)
        }

        if (didMedia || didXml) {
          swappedKeys.add(slot.key)
        } else {
          swapLog.push(`${slot.key}:pptx_swap_failed:embed=${slot.embedId}`)
        }
        continue
      }

      // Member photo: fit + swap ONLY the one {member_photo} shape — never overwrite shared Canva media
      if (slot.key === 'member_photo') {
        if (swappedKeys.has('member_photo')) {
          swapLog.push(`${slot.key}:skipped_extra:${slot.embedId}`)
          continue
        }
        let fitted = img
        try {
          fitted = await prepareMemberPhotoForFrame(zip, img, existingBefore, swapBlock)
          swapLog.push(`${slot.key}:fitted:${fitted.bytes.length}b`)
        } catch (e) {
          swapLog.push(`${slot.key}:fit_failed:${e instanceof Error ? e.message : String(e)}`)
        }

        let block = isPptx ? resolvePptxSwapBlock(xml, slot) : resolveDocxSwapBlock(xml, slot)
        if (!xml.includes(block)) {
          const exact = isPptx
            ? findExactPptxBlockByEmbedId(xml, slot.embedId)
            : findExactWordDrawingByEmbedId(xml, slot.embedId)
          if (exact) block = exact
        }

        const mediaShared = isPptx || (existingBefore
          ? (await countBlipsUsingMediaFile(zip, existingBefore)) > 1
          : false)

        if (existingBefore && !mediaShared) {
          zip.file(existingBefore, fitted.bytes)
          if (ctXml) {
            ctXml = ensureContentTypeDefault(ctXml, fitted.ext, fitted.contentType)
            ctXml = ensureMediaContentTypeOverride(ctXml, existingBefore, fitted.contentType)
          }
          const beforeLen = xml.length
          xml = clearMemberPhotoCropInSlide(xml, slot.embedId, block)
          if (xml.length !== beforeLen) swapLog.push(`${slot.key}:cleared_srcRect`)
          swappedKeys.add(slot.key)
          swapLog.push(`${slot.key}:overwrite_in_place:${existingBefore}`)
          continue
        }

        mediaSeq += 1
        const mediaName = `member_photo_${mediaSeq}.${fitted.ext}`
        const mediaPath = `${mediaFolder}/${mediaName}`
        zip.file(mediaPath, fitted.bytes)
        if (ctXml) {
          ctXml = ensureContentTypeDefault(ctXml, fitted.ext, fitted.contentType)
          ctXml = ensureMediaContentTypeOverride(ctXml, mediaPath, fitted.contentType)
        }
        const rId = nextRelationshipId(relsXml)
        relsXml = relsXml.replace(
          '</Relationships>',
          `<Relationship Id="${rId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="${relTargetPrefix}${mediaName}"/></Relationships>`,
        )
        relsDirty = true

        if (block && xml.includes(block)) {
          if (isPptx) {
            const refreshed = refreshPptxBlipInBlock(stripPptxSvgBlips(block), rId)
            xml = xml.split(block).join(refreshed)
            xml = clearMemberPhotoCropInSlide(xml, rId, refreshed)
            swapLog.push(`${slot.key}:pptx_split_media:${rId}:${mediaPath}${mediaShared ? ':shared_src' : ''}`)
          } else {
            const refreshed = refreshDocxPictureBlipInBlock(block, rId)
            xml = xml.split(block).join(refreshed)
            swapLog.push(`${slot.key}:docx_split_media:${rId}:${mediaPath}${mediaShared ? ':shared_src' : ''}`)
          }
          swappedKeys.add(slot.key)
        } else {
          swapLog.push(`${slot.key}:split_media_no_block:embed=${slot.embedId}`)
        }
        continue
      }

      // Word letters: in-place media swap alone is ignored by Google Drive PDF — use drawing replace for signatures
      if (!isPptx && existingBefore && canInplaceOverwriteMedia(existingBefore, img) && !isChurchSignature) {
        zip.file(existingBefore, img.bytes)
        if (ctXml) {
          ctXml = ensureContentTypeDefault(ctXml, img.ext, img.contentType)
          ctXml = ensureMediaContentTypeOverride(ctXml, existingBefore, img.contentType)
        }
        if (swapBlock && xml.includes(swapBlock)) {
          const cleaned = retargetPictureBlock(swapBlock, slot.embedId, slot.embedId)
          if (cleaned !== swapBlock) {
            xml = xml.split(swapBlock).join(cleaned)
            swapLog.push(`${slot.key}:stripped_svg_blip:${slot.embedId}`)
          }
        }
        swappedKeys.add(slot.key)
        swapLog.push(`${slot.key}:docx_inplace_only:${existingBefore}`)
        continue
      }

      // DOCX church signatures: overwrite media + refresh blip (keep anchor layout — no full rebuild)
      if (isChurchSignature && !isPptx) {
        const useImg = await normalizeImageToPng(img)
        let block = resolveDocxSwapBlock(xml, slot)

        for (const embedId of extractAllBlipEmbedIds(block)) {
          const mediaPath = mediaPathFromRels(relsXml, embedId, name)
          if (!mediaPath) continue
          const written = writeSignaturePlaceholderMedia(
            zip, ctXml, relsXml, relTargetPrefix, embedId, mediaPath, useImg,
          )
          relsXml = written.relsXml
          ctXml = written.ctXml
          if (written.relsDirty) relsDirty = true
          swapLog.push(`${slot.key}:overwrite_placeholder:${written.mediaPath}`)
        }

        if (!existingBefore) {
          mediaSeq += 1
          const mediaName = `sign_${slot.key}_${mediaSeq}.${useImg.ext}`
          const mediaPath = `${mediaFolder}/${mediaName}`
          zip.file(mediaPath, useImg.bytes)
          if (ctXml) {
            ctXml = ensureContentTypeDefault(ctXml, useImg.ext, useImg.contentType)
            ctXml = ensureMediaContentTypeOverride(ctXml, mediaPath, useImg.contentType)
          }
          const rId = nextRelationshipId(relsXml)
          relsXml = relsXml.replace(
            '</Relationships>',
            `<Relationship Id="${rId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="${relTargetPrefix}${mediaName}"/></Relationships>`,
          )
          relsDirty = true
          docPrSeq += 1
          const replaced = docxReplaceSignaturePicture(xml, block, slot.embedId, rId, slot.key, docPrSeq)
          if (replaced) {
            xml = replaced.xml
            block = resolveDocxSwapBlock(xml, slot)
            swapLog.push(`${slot.key}:${replaced.method}:${rId}`)
          } else {
            swapLog.push(`${slot.key}:docx_replace_failed:embed=${slot.embedId}`)
          }
        }

        if (block && xml.includes(block)) {
          const refreshed = refreshDocxPictureBlipInBlock(block, slot.embedId)
          if (refreshed !== block) {
            xml = xml.split(block).join(refreshed)
            block = refreshed
            swapLog.push(`${slot.key}:docx_refresh_blip:${slot.embedId}`)
          } else {
            const cleaned = stripDocxSvgBlips(retargetPictureBlock(block, slot.embedId, slot.embedId))
            if (cleaned !== block) {
              xml = xml.split(block).join(cleaned)
              block = cleaned
              swapLog.push(`${slot.key}:stripped_svg_blip:${slot.embedId}`)
            }
          }
        }

        swappedKeys.add(slot.key)
        swapLog.push(`${slot.key}:docx_media_only:${existingBefore ? 'reuse_rel' : 'new_rel'}`)
        continue
      }

      // PPTX + other non-church DOCX: new media rel + shape replace
      if (existingBefore && !isChurchSignature) {
        zip.file(existingBefore, img.bytes)
        if (ctXml) {
          ctXml = ensureContentTypeDefault(ctXml, img.ext, img.contentType)
          ctXml = ensureMediaContentTypeOverride(ctXml, existingBefore, img.contentType)
        }
        swapLog.push(`${slot.key}:overwrite:${existingBefore}`)
      }

      mediaSeq += 1
      const mediaName = `sign_${slot.key}_${mediaSeq}.${img.ext}`
      const mediaPath = `${mediaFolder}/${mediaName}`
      zip.file(mediaPath, img.bytes)
      if (ctXml) {
        ctXml = ensureContentTypeDefault(ctXml, img.ext, img.contentType)
        ctXml = ensureMediaContentTypeOverride(ctXml, mediaPath, img.contentType)
      }

      const rId = nextRelationshipId(relsXml)
      relsXml = relsXml.replace(
        '</Relationships>',
        `<Relationship Id="${rId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="${relTargetPrefix}${mediaName}"/></Relationships>`,
      )
      relsDirty = true

      const oldBlock = swapBlock
      if (isPptx && xml.includes(oldBlock)) {
        const xfrm = extractPptxXfrm(oldBlock) || { x: '0', y: '0', cx: '2000000', cy: '700000' }
        const shapeId = maxCNvPrId(xml) + 1
        const pic = pptxSignaturePicXml(rId, shapeId, slot.key, xfrm, slot.key === 'treasurer_seal', true)
        xml = xml.split(oldBlock).join(pic)
        swappedKeys.add(slot.key)
        swapLog.push(`${slot.key}:replace_shape:${rId}:${xfrm.cx}x${xfrm.cy}@${xfrm.x},${xfrm.y}`)
      } else {
        const extent = extractWordInlineExtent(oldBlock)
        if (/<w:drawing\b/i.test(oldBlock) && xml.includes(oldBlock)) {
          docPrSeq += 1
          const drawing = signatureDrawingXml(
            rId,
            docPrSeq,
            slot.key,
            slot.key === 'treasurer_seal',
            extent?.cx,
            extent?.cy,
          )
          xml = xml.split(oldBlock).join(drawing)
          swappedKeys.add(slot.key)
          docPartSigSwapped = true
          swapLog.push(`${slot.key}:docx_replace_drawing:${rId}`)
        } else if (/<w:pict\b/i.test(oldBlock) && xml.includes(oldBlock)) {
          docPrSeq += 1
          const drawing = signatureDrawingXml(
            rId,
            docPrSeq,
            slot.key,
            slot.key === 'treasurer_seal',
            extent?.cx,
            extent?.cy,
          )
          xml = xml.split(oldBlock).join(drawing)
          swappedKeys.add(slot.key)
          docPartSigSwapped = true
          swapLog.push(`${slot.key}:docx_replace_vml_pict:${rId}`)
        } else {
          const newBlock = retargetPictureBlock(oldBlock, slot.embedId, rId)
          if (newBlock !== oldBlock && xml.includes(oldBlock)) {
            xml = xml.split(oldBlock).join(newBlock)
            swappedKeys.add(slot.key)
            docPartSigSwapped = true
            swapLog.push(`${slot.key}:relink:${slot.embedId}->${rId}`)
          } else {
            swapLog.push(`${slot.key}:failed_no_xml_match:embed=${slot.embedId}`)
          }
        }
      }
    }

    if (!isPptx && docPartSigSwapped) {
      xml = stripDocxSvgBlips(xml)
    }

// 2) Text tag {presbyter_sign} → inject image (Word drawing / PPT: replace text box with picture)
    for (const [key, img] of Object.entries(signatureImages)) {
      if (swappedKeys.has(key)) continue
      if (!officeHasPlaceholder(xml, key)) continue

      mediaSeq += 1
      const mediaName = `sign_${key}_${mediaSeq}.${img.ext}`
      const mediaPath = `${mediaFolder}/${mediaName}`
      zip.file(mediaPath, img.bytes)

      const rId = nextRelationshipId(relsXml)
      relsXml = relsXml.replace(
        '</Relationships>',
        `<Relationship Id="${rId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="${relTargetPrefix}${mediaName}"/></Relationships>`,
      )
      relsDirty = true
      if (ctXml) {
        ctXml = ensureContentTypeDefault(ctXml, img.ext, img.contentType)
        ctXml = ensureMediaContentTypeOverride(ctXml, mediaPath, img.contentType)
      }

      if (isPptx) {
        const sp = findPptxShapeForPlaceholder(xml, key)
        const shapeId = maxCNvPrId(xml) + 1
        if (sp) {
          const xfrm = extractPptxXfrm(sp) || { x: '0', y: '0', cx: '2000000', cy: '700000' }
          const pic = pptxSignaturePicXml(rId, shapeId, key, xfrm, key === 'treasurer_seal')
          // Replace the text box shape with a real picture (survives Google Slides import better)
          xml = xml.split(sp).join(pic)
          swappedKeys.add(key)
          swapLog.push(`${key}:pptx_replace_shape:${rId}`)
        } else {
          const pic = pptxSignaturePicXml(
            rId,
            shapeId,
            key,
            { x: '5500000', y: '4500000', cx: '2000000', cy: '700000' },
            key === 'treasurer_seal',
          )
          xml = replacePlaceholderInXml(xml, key, '')
          if (xml.includes('</p:spTree>')) {
            xml = xml.replace('</p:spTree>', `${pic}</p:spTree>`)
          } else {
            xml += pic
          }
          swappedKeys.add(key)
          swapLog.push(`${key}:pptx_append_fallback:${rId}`)
        }
      } else {
        docPrSeq += 1
        const drawing = signatureDrawingXml(rId, docPrSeq, key, key === 'treasurer_seal')
        xml = injectImageAtPlaceholder(xml, key, drawing)
        swappedKeys.add(key)
        swapLog.push(`${key}:text_inject`)
      }
    }

    // 2b) DOCX alt-text fallback — media-only when placeholder media exists (never rebuild wp:anchor)
    if (!isPptx) {
      for (const [key, img] of Object.entries(signatureImages)) {
        if (swappedKeys.has(key) || !IMAGE_PLACEHOLDER_MAP[key]) continue
        const target = findDocxDrawingForAltKey(xml, key)
        if (!target) continue

        const existingBefore = mediaPathFromRels(relsXml, target.embedId, name)
        if (existingBefore) {
          const useImg = await normalizeImageToPng(img)
          const written = writeSignaturePlaceholderMedia(
            zip, ctXml, relsXml, relTargetPrefix, target.embedId, existingBefore, useImg,
          )
          relsXml = written.relsXml
          ctXml = written.ctXml
          if (written.relsDirty) relsDirty = true

          let block = target.block
          if (block && xml.includes(block)) {
            const refreshed = refreshDocxPictureBlipInBlock(block, target.embedId)
            if (refreshed !== block) {
              xml = xml.split(block).join(refreshed)
              swapLog.push(`${key}:docx_refresh_blip:${target.embedId}`)
            } else {
              const cleaned = stripDocxSvgBlips(retargetPictureBlock(block, target.embedId, target.embedId))
              if (cleaned !== block) {
                xml = xml.split(block).join(cleaned)
                swapLog.push(`${key}:stripped_svg_blip:${target.embedId}`)
              }
            }
          }

          swappedKeys.add(key)
          swapLog.push(`${key}:docx_media_only_alt:reuse_rel:${written.mediaPath}`)
          continue
        }

        mediaSeq += 1
        const useImg = await normalizeImageToPng(img)
        const mediaName = `sign_${key}_${mediaSeq}.${useImg.ext}`
        const mediaPath = `${mediaFolder}/${mediaName}`
        zip.file(mediaPath, useImg.bytes)
        if (ctXml) {
          ctXml = ensureContentTypeDefault(ctXml, useImg.ext, useImg.contentType)
          ctXml = ensureMediaContentTypeOverride(ctXml, mediaPath, useImg.contentType)
        }
        const drawRId = nextRelationshipId(relsXml)
        relsXml = relsXml.replace(
          '</Relationships>',
          `<Relationship Id="${drawRId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="${relTargetPrefix}${mediaName}"/></Relationships>`,
        )
        relsDirty = true

        docPrSeq += 1
        const replaced = docxReplaceSignaturePicture(xml, target.block, target.embedId, drawRId, key, docPrSeq)
        if (replaced) {
          xml = replaced.xml
          swappedKeys.add(key)
          docPartSigSwapped = true
          swapLog.push(`${key}:${replaced.method}_alt_fallback:${drawRId}`)
        } else if (/<wp:anchor\b/i.test(target.block)) {
          swapLog.push(`${key}:docx_anchor_skip_alt:no_media`)
        }
      }
    }

    // 3) Clear leftover text sign tags
    for (const key of IMAGE_PLACEHOLDER_KEYS) {
      if (officeHasPlaceholder(xml, key)) {
        xml = replacePlaceholderInXml(xml, key, '')
        // plain-text leftovers when XML was oddly split
        const plainTag = `{${key}}`
        if (officePlainText(xml).includes(plainTag)) {
          xml = xml.split(plainTag).join('')
        }
      }
    }

    // 4) Text mail-merge
    xml = applyFieldValuesToXml(xml, fieldValues)
    if (isPptx && pptxNameFit !== 'off') {
      xml = applyPptxLongNameTextFit(xml, fieldValues, pptxNameFit, pptxSlideSize)
    }
    zip.file(name, xml)
    if (relsDirty) zip.file(relsName, relsXml)
  }

  if (ctXml) zip.file('[Content_Types].xml', ctXml)

  const bytes = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' })
  return {
    bytes,
    mergeMeta: {
      format,
      slots_found: slotsFound,
      swapped: [...swappedKeys],
      swap_log: swapLog,
      alt_debug: altDebug,
      signature_keys_available: Object.keys(signatureImages),
    },
  }
}

/** @deprecated alias */
async function mergeDocxBytes(
  docxBytes: Uint8Array,
  fieldValues: Record<string, unknown>,
  signatureImages: Record<string, { bytes: Uint8Array, ext: string, contentType: string }> = {},
) {
  return mergeOfficeBytes(docxBytes, fieldValues, signatureImages, 'docx')
}

function concatBytes(parts: Uint8Array[]) {
  const total = parts.reduce((n, p) => n + p.length, 0)
  const out = new Uint8Array(total)
  let off = 0
  for (const p of parts) {
    out.set(p, off)
    off += p.length
  }
  return out
}

/* ── Google Drive auth (same pattern as cms-full-backup) ───────── */

async function getOAuthAccessToken(refreshToken: string) {
  const clientId = Deno.env.get('GOOGLE_OAUTH_CLIENT_ID')
  const clientSecret = Deno.env.get('GOOGLE_OAUTH_CLIENT_SECRET')
  if (!clientId || !clientSecret) {
    throw new Error('GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET not set')
  }
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  })
  const tokenJson = await tokenRes.json()
  if (!tokenJson.access_token) {
    throw new Error(tokenJson.error_description || tokenJson.error || 'Google OAuth refresh failed')
  }
  return tokenJson.access_token as string
}

async function googleAccessTokenFromSA(sa: Record<string, string>) {
  const header = { alg: 'RS256', typ: 'JWT' }
  const now = Math.floor(Date.now() / 1000)
  const claim = {
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/drive.file',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  }
  const enc = (obj: unknown) =>
    btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(obj))))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  const unsigned = `${enc(header)}.${enc(claim)}`
  const keyPem = sa.private_key.replace(/\\n/g, '\n')
  const pemBody = keyPem.replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '').replace(/\s+/g, '')
  const binary = Uint8Array.from(atob(pemBody), c => c.charCodeAt(0))
  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8', binary, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign'],
  )
  const sigBuf = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', cryptoKey, new TextEncoder().encode(unsigned))
  const sig = btoa(String.fromCharCode(...new Uint8Array(sigBuf)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  const jwt = `${unsigned}.${sig}`
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  })
  const tokenJson = await tokenRes.json()
  if (!tokenJson.access_token) throw new Error(tokenJson.error_description || 'SA token failed')
  return tokenJson.access_token as string
}

async function resolveGoogleAccess(admin: ReturnType<typeof createClient>) {
  const { data: settings } = await admin
    .from('cms_backup_settings')
    .select('google_refresh_token, google_connected_email, drive_folder_id')
    .eq('id', 1)
    .maybeSingle()

  if (settings?.google_refresh_token) {
    return {
      accessToken: await getOAuthAccessToken(settings.google_refresh_token),
      via: 'oauth' as const,
      email: settings.google_connected_email || null,
      folderId: settings.drive_folder_id?.trim() || null,
    }
  }

  const raw = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_JSON')
  if (raw) {
    const sa = JSON.parse(raw)
    return {
      accessToken: await googleAccessTokenFromSA(sa),
      via: 'service_account' as const,
      email: sa.client_email || null,
      folderId: Deno.env.get('PRINT_CORNER_DRIVE_FOLDER_ID')?.trim() || settings?.drive_folder_id?.trim() || null,
    }
  }

  return null
}

async function probeGoogleReady(admin: ReturnType<typeof createClient>) {
  try {
    const g = await resolveGoogleAccess(admin)
    return { ready: !!g, via: g?.via || null, email: g?.email || null }
  } catch {
    return { ready: false, via: null, email: null }
  }
}

function gotenbergConfigured() {
  return !!GOTENBERG_URL
}

function cloudmersiveConfigured() {
  return !!CLOUDMERSIVE_API_KEY
}

function useTamilPdfFromBody(body: Record<string, unknown>) {
  return body.use_tamil_pdf === true || body.tamil_pdf === true
}

type PdfEngine = 'google_drive' | 'cloudmersive' | 'gotenberg'

/** Default Google Drive; Tamil-font switch → Cloudmersive (per request). */
function resolvePdfEngine(format: 'docx' | 'pptx', body: Record<string, unknown>): PdfEngine {
  if (useTamilPdfFromBody(body)) {
    if (!cloudmersiveConfigured()) {
      throw new Error('Tamil font PDF requires CLOUDMERSIVE_API_KEY in Supabase Edge Function secrets.')
    }
    return 'cloudmersive'
  }
  if (PRINT_CORNER_PDF_ENGINE === 'gotenberg' && gotenbergConfigured()) return 'gotenberg'
  if (PRINT_CORNER_PDF_ENGINE === 'cloudmersive' && cloudmersiveConfigured()) return 'cloudmersive'
  return 'google_drive'
}

/** High-fidelity Office → PDF (embedded Tamil fonts). */
async function convertOfficeViaCloudmersive(
  fileBytes: Uint8Array,
  displayName: string,
  format: 'docx' | 'pptx',
) {
  if (!CLOUDMERSIVE_API_KEY) throw new Error('CLOUDMERSIVE_API_KEY not configured')
  const endpoint = format === 'pptx'
    ? 'https://api.cloudmersive.com/convert/pptx/to/pdf'
    : 'https://api.cloudmersive.com/convert/docx/to/pdf'
  const ext = format === 'pptx' ? 'pptx' : 'docx'
  const mime = format === 'pptx' ? PPTX_MIME : DOCX_MIME
  const safeName = `${displayName.replace(/\.(docx|pptx|pdf)$/i, '').slice(0, 120)}.${ext}`
  const boundary = `pc_${crypto.randomUUID().replace(/-/g, '')}`
  const enc = new TextEncoder()
  const body = concatBytes([
    enc.encode(
      `--${boundary}\r\nContent-Disposition: form-data; name="inputFile"; filename="${safeName}"\r\nContent-Type: ${mime}\r\n\r\n`,
    ),
    fileBytes,
    enc.encode(`\r\n--${boundary}--\r\n`),
  ])
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Apikey: CLOUDMERSIVE_API_KEY,
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
    },
    body,
  })
  if (!res.ok) {
    const errText = await res.text().catch(() => '')
    throw new Error(`Cloudmersive ${res.status}: ${errText.slice(0, 300)}`)
  }
  const pdfBytes = new Uint8Array(await res.arrayBuffer())
  if (!pdfBytes.length) throw new Error('Cloudmersive returned empty PDF')
  return { pdfBytes }
}

async function convertMergedOfficeToPdf(
  admin: ReturnType<typeof createClient>,
  mergedBytes: Uint8Array,
  outName: string,
  format: 'docx' | 'pptx',
  pdfEngine: PdfEngine,
) {
  const officeName = outName.replace(/\.pdf$/i, format === 'pptx' ? '.pptx' : '.docx')

  if (pdfEngine === 'cloudmersive') {
    const result = await convertOfficeViaCloudmersive(mergedBytes, officeName, format)
    return {
      pdfBytes: result.pdfBytes,
      engineMeta: { engine: 'cloudmersive', source_format: format, tamil_pdf: true },
    }
  }

  if (pdfEngine === 'gotenberg') {
    const result = await convertOfficeViaGotenberg(mergedBytes, officeName, format)
    return {
      pdfBytes: result.pdfBytes,
      engineMeta: { engine: 'gotenberg', gotenberg_url: GOTENBERG_URL, source_format: format },
    }
  }

  const g = await resolveGoogleAccess(admin)
  if (!g) {
    throw new Error('Google Drive not connected. Open Backup → Connect Google, then retry Issue PDF.')
  }
  const result = await convertOfficeViaGoogleDrive(g.accessToken, mergedBytes, officeName, g.folderId, format)
  return {
    pdfBytes: result.pdfBytes,
    engineMeta: {
      engine: 'google_drive',
      google_via: g.via,
      google_email: g.email,
      source_format: format,
      google_mime: result.google_mime,
      drive_temp_deleted: true,
    },
  }
}

/** LibreOffice convert — respects embedded fonts when font is installed or embedded in .docx */
async function convertOfficeViaGotenberg(
  fileBytes: Uint8Array,
  displayName: string,
  format: 'docx' | 'pptx',
) {
  const ext = format === 'pptx' ? 'pptx' : 'docx'
  const mime = format === 'pptx' ? PPTX_MIME : DOCX_MIME
  const safeName = `${displayName.replace(/\.(docx|pptx|pdf)$/i, '').slice(0, 120)}.${ext}`
  const boundary = `pc_${crypto.randomUUID().replace(/-/g, '')}`
  const enc = new TextEncoder()
  const body = concatBytes([
    enc.encode(
      `--${boundary}\r\nContent-Disposition: form-data; name="files"; filename="${safeName}"\r\nContent-Type: ${mime}\r\n\r\n`,
    ),
    fileBytes,
    enc.encode(`\r\n--${boundary}--\r\n`),
  ])
  const headers: Record<string, string> = {
    'Content-Type': `multipart/form-data; boundary=${boundary}`,
  }
  if (GOTENBERG_API_KEY) headers['X-Gotenberg-Key'] = GOTENBERG_API_KEY

  const res = await fetch(`${GOTENBERG_URL}/forms/libreoffice/convert`, {
    method: 'POST',
    headers,
    body,
  })
  if (!res.ok) {
    const errText = await res.text().catch(() => '')
    throw new Error(`Gotenberg ${res.status}: ${errText.slice(0, 300)}`)
  }
  const pdfBytes = new Uint8Array(await res.arrayBuffer())
  if (!pdfBytes.length) throw new Error('Gotenberg returned empty PDF')
  return { pdfBytes }
}

/** Upload merged Office file → Google Docs/Slides → export PDF → delete temp */
async function driveUploadConvertExport(
  accessToken: string,
  fileBytes: Uint8Array,
  displayName: string,
  parentFolderId: string | null,
  format: 'docx' | 'pptx',
) {
  const boundary = `pc_${crypto.randomUUID().replace(/-/g, '')}`
  const googleMime = format === 'pptx' ? GSLIDES_MIME : GDOC_MIME
  const uploadMime = format === 'pptx' ? PPTX_MIME : DOCX_MIME
  const safeName = displayName.replace(/\.(docx|pptx)$/i, '').slice(0, 120)

  function buildBody(useParent: string | null) {
    const meta: Record<string, unknown> = { name: safeName, mimeType: googleMime }
    if (useParent) meta.parents = [useParent]
    const enc = new TextEncoder()
    const head = enc.encode(
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
      `${JSON.stringify(meta)}\r\n` +
      `--${boundary}\r\nContent-Type: ${uploadMime}\r\n\r\n`,
    )
    const tail = enc.encode(`\r\n--${boundary}--\r\n`)
    return concatBytes([head, fileBytes, tail])
  }

  async function tryUpload(useParent: string | null) {
    const upRes = await fetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': `multipart/related; boundary=${boundary}`,
        },
        body: buildBody(useParent),
      },
    )
    const upJson = await upRes.json().catch(() => ({}))
    return { upRes, upJson }
  }

  let { upRes, upJson } = await tryUpload(parentFolderId)
  if (!upRes.ok && parentFolderId && (upRes.status === 400 || upRes.status === 404)) {
    const retry = await tryUpload(null)
    upRes = retry.upRes
    upJson = retry.upJson
  }
  if (!upRes.ok) {
    const reason = upJson?.error?.message || upJson?.error?.errors?.[0]?.reason || `HTTP ${upRes.status}`
    throw new Error(`Google Drive upload failed: ${reason}`)
  }

  const fileId = upJson.id as string
  if (!fileId) throw new Error('Google Drive upload returned no file id')

  try {
    const exportRes = await fetch(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}/export?mimeType=application/pdf`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    )
    if (!exportRes.ok) {
      const errText = await exportRes.text().catch(() => '')
      throw new Error(`Google PDF export failed (${exportRes.status}): ${errText.slice(0, 240)}`)
    }
    const pdfBytes = new Uint8Array(await exportRes.arrayBuffer())
    if (!pdfBytes.length) throw new Error('Google returned empty PDF')
    return { pdfBytes, driveFileId: fileId, google_mime: googleMime }
  } finally {
    await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${accessToken}` },
    }).catch(() => null)
  }
}

async function convertOfficeViaGoogleDrive(
  accessToken: string,
  fileBytes: Uint8Array,
  displayName: string,
  parentFolderId: string | null,
  format: 'docx' | 'pptx' = 'docx',
) {
  return driveUploadConvertExport(accessToken, fileBytes, displayName, parentFolderId, format)
}

async function convertDocxViaGoogleDrive(
  accessToken: string,
  docxBytes: Uint8Array,
  displayName: string,
  parentFolderId: string | null,
) {
  return convertOfficeViaGoogleDrive(accessToken, docxBytes, displayName, parentFolderId, 'docx')
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    if (!SERVICE_KEY) return json({ error: 'Service role not configured' }, 500)

    const body = await req.json().catch(() => ({}))
    const action = body.action || 'ping'

    const gate = await requireUser(req)
    if (gate.error) return json({ error: gate.error }, gate.status)
    const { user, prof, admin } = gate

    if (action === 'ping') {
      const google = await probeGoogleReady(admin)
      const gotenberg = gotenbergConfigured()
      const cloudmersive = cloudmersiveConfigured()
      const pdfReady = google.ready || cloudmersive || gotenberg
      return json({
        ok: true,
        ready: pdfReady,
        engine: cloudmersive ? 'cloudmersive' : (google.ready ? 'google_drive' : (gotenberg ? 'gotenberg' : null)),
        pdf_engine_setting: PRINT_CORNER_PDF_ENGINE,
        cloudmersive,
        gotenberg,
        google_drive: google.ready,
        google_via: google.via,
        google_email: google.email,
        merge: true,
        signatures: true,
        user: prof?.email || user.email,
      })
    }

    if (action === 'convert_storage') {
      const storagePath = String(body.storage_path || '').trim()
      const templateKey = String(body.template_key || 'document').trim()
      const issue = body.issue !== false
      const fieldValues = (body.field_values && typeof body.field_values === 'object')
        ? body.field_values
        : {}
      const memberId = body.member_id
        ? String(body.member_id).trim()
        : (fieldValues.member_id ? String(fieldValues.member_id).trim() : null)

      if (!storagePath.startsWith('templates/')) {
        return json({ error: 'storage_path must be under templates/' }, 400)
      }

      const previewPath = String(storagePath).replace(/source\.(docx|pptx)$/i, 'preview.pdf')
      const canStablePreview = !issue && previewPath !== storagePath && previewPath.endsWith('/preview.pdf')

      // Fast path: serve cached preview.pdf without Google Drive convert
      if (canStablePreview && body.force_preview !== true) {
        const folder = previewPath.replace(/\/[^/]+$/, '')
        const { data: listing } = await admin.storage.from(BUCKET).list(folder, { limit: 30 })
        const hasPreview = (listing || []).some((f: { name?: string }) => f.name === 'preview.pdf')
        if (hasPreview) {
          const { data: existing } = await admin.storage.from(BUCKET).createSignedUrl(previewPath, 3600 * 6)
          if (existing?.signedUrl) {
            return json({
              ok: true,
              storage_path: previewPath,
              signed_url: existing.signedUrl,
              filename: 'preview.pdf',
              merged: false,
              cached: true,
              fields_applied: 0,
              engine: 'cache',
            })
          }
        }
      }

      const { data: fileBlob, error: dlErr } = await admin.storage.from(BUCKET).download(storagePath)
      if (dlErr || !fileBlob) {
        return json({ error: dlErr?.message || 'Could not download template' }, 400)
      }
      const templateBytes = new Uint8Array(await fileBlob.arrayBuffer())
      const format: 'docx' | 'pptx' = /\.pptx$/i.test(storagePath) ? 'pptx' : 'docx'
      const { images: signatureImages, debug: signatureLoadDebug, mergeFields: churchMergeFields } =
        await loadChurchSignatureImages(admin)
      const { img: memberPhoto, debug: memberPhotoDebug } = await loadMemberPhotoImage(admin, memberId)
      if (memberPhoto) signatureImages.member_photo = memberPhoto
      signatureLoadDebug.member_photo = memberPhotoDebug

      // Church Setup fills letterhead / office-bearer placeholders unless the wizard sent an override.
      const mergedFieldValues: Record<string, unknown> = { ...(fieldValues || {}) }
      const overridableChurchKeys = new Set(['church_name', 'presbyter_name', 'pastor_name'])
      const churchKeys = ['church_name', 'Church_name', 'presbyter_name', 'pastor_name', 'diocese', 'secretary_name', 'treasurer_name', 'address']

      function clientOverridesChurchKey(canonicalKey: string): boolean {
        if (!overridableChurchKeys.has(canonicalKey.toLowerCase())) return false
        for (const [key, raw] of Object.entries(mergedFieldValues)) {
          if (key.toLowerCase() === canonicalKey.toLowerCase() && raw != null && String(raw).trim()) {
            return true
          }
        }
        return false
      }

      for (const ck of churchKeys) {
        if (!(ck in (churchMergeFields || {}))) continue
        if (clientOverridesChurchKey(ck)) continue
        const cv = churchMergeFields[ck]
        mergedFieldValues[ck] = cv == null ? '' : String(cv)
      }
      for (const key of Object.keys(mergedFieldValues)) {
        const lower = key.toLowerCase()
        for (const ck of churchKeys) {
          if (ck.toLowerCase() === lower && ck in (churchMergeFields || {})) {
            if (clientOverridesChurchKey(ck)) continue
            const cv = churchMergeFields[ck]
            mergedFieldValues[key] = cv == null ? '' : String(cv)
          }
        }
      }

      // Warn when template likely needs a photo but none could be loaded
      const templateNeedsPhoto = /\.pptx$/i.test(storagePath)
        && memberId
        && !memberPhoto
        && memberPhotoDebug !== 'no_member_id'

      const { bytes: mergedBytes, mergeMeta } = await mergeOfficeBytes(
        templateBytes,
        mergedFieldValues,
        signatureImages,
        format,
        { pptxNameFit: resolvePptxNameFitMode(body) },
      )

      const outBase = templateKey + (memberId ? `_${memberId}` : '_blank')
      let outName = stampFilename(outBase, 'pdf')

      let pdfBytes: Uint8Array
      let engineMeta: Record<string, unknown>
      let pdfEngine: PdfEngine
      try {
        pdfEngine = resolvePdfEngine(format, body)
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        return json({ error: msg, signature_merge: mergeMeta }, 500)
      }

      try {
        const converted = await convertMergedOfficeToPdf(admin, mergedBytes, outName, format, pdfEngine)
        pdfBytes = converted.pdfBytes
        engineMeta = converted.engineMeta
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        return json({
          error: `${pdfEngine}: ${msg}`,
          signature_merge: mergeMeta,
          merged_bytes: mergedBytes.length,
        }, 500)
      }

      const year = new Date().getFullYear()
      // Issued docs go under issued/; previews overwrite stable preview.pdf next to the template
      const issuedPath = issue
        ? `issued/${body.template_type || 'letters'}/${year}/${outName}`
        : (canStablePreview ? previewPath : `previews/${user.id}/${outName}`)

      const { error: upErr } = await admin.storage.from(BUCKET).upload(issuedPath, pdfBytes, {
        contentType: 'application/pdf',
        upsert: true,
      })
      if (upErr) throw new Error(`Storage upload failed: ${upErr.message}`)

      const { data: urlData } = await admin.storage.from(BUCKET).createSignedUrl(issuedPath, issue ? 3600 : 3600 * 6)

      if (issue) {
        const { error: logErr } = await admin.from('print_corner_issued_log').insert({
          template_id: body.template_id || null,
          template_key: templateKey,
          template_type: body.template_type || 'letter',
          member_id: memberId,
          issued_filename: outName,
          storage_path: issuedPath,
          field_values: mergedFieldValues,
          source: body.source || 'manual',
          cloudconvert_job: engineMeta.engine || null,
          issued_by: user.id,
          issued_by_email: prof?.email || user.email,
        })
        if (logErr) throw new Error(`Issued log insert failed: ${logErr.message}`)
      }

      return json({
        ok: true,
        storage_path: issuedPath,
        signed_url: urlData?.signedUrl || null,
        filename: outName,
        merged: true,
        fields_applied: Object.keys(fieldValues).length,
        signatures_injected: Object.keys(signatureImages),
        signature_load: signatureLoadDebug,
        signature_merge: mergeMeta,
        member_photo_loaded: !!memberPhoto,
        member_photo_debug: memberPhotoDebug,
        member_photo_warning: templateNeedsPhoto
          ? `Could not load photo for member ${memberId}: ${memberPhotoDebug}. Upload a photo in Members, then retry.`
          : null,
        ...engineMeta,
      })
    }

    return json({ error: `Unknown action: ${action}` }, 400)
  } catch (err) {
    console.error('[cms-print-corner]', err)
    return json({ error: err instanceof Error ? err.message : 'Unknown error' }, 500)
  }
})
