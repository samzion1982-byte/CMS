// @ts-nocheck
/* ═══════════════════════════════════════════════════════════════
   cms-print-corner — mail-merge Word/PowerPoint → PDF via Google Drive
   DOCX → Google Docs export | PPTX → Google Slides export
   Signatures: picture AltText {presbyter_sign} (Word or PPT)
   ═══════════════════════════════════════════════════════════════ */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import JSZip from 'https://esm.sh/jszip@3.10.1'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || ''
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') || Deno.env.get('SUPABASE_ANON') || ''

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const BUCKET = 'print-corner'
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

function applyFieldValuesToXml(xml: string, fieldValues: Record<string, unknown>) {
  let out = xml
  for (const [key, raw] of Object.entries(fieldValues || {})) {
    if (!key || isImagePlaceholderKey(key)) continue
    out = replacePlaceholderInXml(out, key, raw == null ? '' : String(raw))
  }
  return out
}

function normalizeImageSlotKey(raw: string): string | null {
  let s = String(raw || '').trim()
  if (!s) return null
  s = s.replace(/^\{+/, '').replace(/\}+$/, '').trim()
  if (IMAGE_PLACEHOLDER_MAP[s]) return s
  if (MEMBER_PHOTO_ALIASES.has(s)) return 'member_photo'
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

/** Pull a signature key from alt-text-like attribute values. */
function keyFromAltAttr(raw: string | null | undefined): string | null {
  if (raw == null) return null
  const val = String(raw).replace(/[\u200B-\u200D\uFEFF]/g, '').trim()
  if (!val) return null
  const direct = normalizeImageSlotKey(val)
  if (direct) return direct
  for (const k of IMAGE_PLACEHOLDER_KEYS) {
    if (val.includes('{' + k + '}') || val.toLowerCase() === k.toLowerCase()) {
      return normalizeImageSlotKey(k)
    }
  }
  return null
}

function extractBlipEmbedId(block: string): string | null {
  const blip = block.match(/<a:blip\b[^>]*\br:embed\s*=\s*"([^"]+)"/i)
    || block.match(/<a:blip\b[^>]*\br:embed\s*=\s*'([^']+)'/i)
    || block.match(/<a:blip\b[^>]*\bembed\s*=\s*"([^"]+)"/i)
    || block.match(/<asvg:svgBlip\b[^>]*\br:embed\s*=\s*"([^"]+)"/i)
    || block.match(/<a:blip\b[^>]*\br:link\s*=\s*"([^"]+)"/i)
  return blip?.[1] || null
}

/**
 * Find pictures / picture-filled shapes whose AltText (descr/title/name) is a signature key.
 * Covers Word drawings, PPT p:pic, and Canva p:sp + blipFill.
 */
/** Scan slide/document for alt-text attributes that name a signature key. */
function findAltTextHits(xml: string) {
  const hits: Array<{ attr: string, value: string, key: string, index: number }> = []
  const re = /\b(descr|title|name)\s*=\s*"([^"]*)"/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(xml)) !== null) {
    const key = keyFromAltAttr(m[2])
    if (!key) continue
    hits.push({ attr: m[1], value: m[2], key, index: m.index })
  }
  const reSq = /\b(descr|title|name)\s*=\s*'([^']*)'/gi
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
  const re = /<(w:drawing|p:pic|p:grpSp|p:sp)\b[\s\S]*?<\/\1>/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(xml)) !== null) {
    const block = m[0]
    if (!/<a:blip\b/i.test(block) && !/<asvg:svgBlip\b/i.test(block)) continue
    out.push({
      tag: m[1],
      start: m.index,
      end: m.index + block.length,
      block,
    })
  }
  return out
}

/** Prefer innermost p:pic / blip shape inside a group when AltText sits on the group. */
function pickSwapBlock(container: PicContainer, hitIndex: number): { block: string, embedId: string } | null {
  if (container.tag === 'p:grpSp' || container.tag === 'w:drawing') {
    const innerRe = /<(p:pic|p:sp)\b[\s\S]*?<\/\1>/gi
    let best: { block: string, embedId: string, dist: number, len: number } | null = null
    let im: RegExpExecArray | null
    while ((im = innerRe.exec(container.block)) !== null) {
      const inner = im[0]
      const embedId = extractBlipEmbedId(inner)
      if (!embedId) continue
      const absStart = container.start + im.index
      const dist = Math.abs(absStart - hitIndex)
      const len = inner.length
      if (!best || dist < best.dist || (dist === best.dist && len < best.len)) {
        best = { block: inner, embedId, dist, len }
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
    for (const attr of ['descr', 'title', 'name']) {
      const reDq = new RegExp('\\b' + attr + '\\s*=\\s*"([^"]*)"', 'gi')
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
    if (slots.some(s => s.key === hit.key)) continue
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

/** Point every blip in a picture block at the new relationship; drop SVG overrides Canva leaves behind. */
function retargetPictureBlock(block: string, oldEmbedId: string, newRId: string) {
  let out = block
  const esc = oldEmbedId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  out = out.replace(new RegExp('(r:embed\\s*=\\s*")' + esc + '(")', 'gi'), '$1' + newRId + '$2')
  out = out.replace(new RegExp("(r:embed\\s*=\\s*')" + esc + "(')", 'gi'), '$1' + newRId + '$2')
  out = out.replace(new RegExp('r:link\\s*=\\s*"' + esc + '"', 'gi'), 'r:embed="' + newRId + '"')
  out = out.replace(/(<a:blip\b[^>]*\br:embed\s*=\s*")([^"]+)(")/gi, '$1' + newRId + '$3')
  out = out.replace(/(<asvg:svgBlip\b[^>]*\br:embed\s*=\s*")([^"]+)(")/gi, '$1' + newRId + '$3')
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

/** Inline signature fallback when using text {presbyter_sign} (not preferred) */
function signatureDrawingXml(rId: string, docPrId: number, name: string, isSeal = false) {
  const cx = isSeal ? 914400 : 1463040
  const cy = isSeal ? 914400 : 502920
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
    .select('presbyter_signature_url, secretary_signature_url, treasurer_signature_url, treasurer_seal_url')
    .limit(1)
    .maybeSingle()

  const images: Record<string, { bytes: Uint8Array, ext: string, contentType: string }> = {}
  const debug: Record<string, string> = {}
  if (!church) {
    debug.church = 'not_found'
    return { images, debug }
  }

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
  return { images, debug }
}

async function loadMemberPhotoImage(
  admin: ReturnType<typeof createClient>,
  memberId: string | null | undefined,
) {
  const id = String(memberId || '').trim()
  if (!id) return { img: null as null, debug: 'no_member_id' }

  const { data: member } = await admin
    .from('members')
    .select('photo_url')
    .eq('member_id', id)
    .maybeSingle()

  if (!member?.photo_url) return { img: null, debug: 'no_photo_url' }

  const url = String(member.photo_url)
  const tryPaths: string[] = []
  const m = url.match(/\/storage\/v1\/object\/(?:public|sign)\/member-photos\/([^?]+)/i)
  if (m?.[1]) tryPaths.push(decodeURIComponent(m[1]))
  for (const ext of ['jpg', 'jpeg', 'png']) {
    tryPaths.push(`active/${id}.${ext}`, `deleted/${id}.${ext}`)
  }

  for (const tryPath of tryPaths) {
    const { data, error } = await admin.storage.from('member-photos').download(tryPath)
    if (error || !data) continue
    const bytes = new Uint8Array(await data.arrayBuffer())
    if (!bytes.length) continue
    return { img: { bytes, ...sniffImageMeta(bytes, tryPath) }, debug: `storage:${tryPath}` }
  }

  const fetched = await fetchSignatureImage(url)
  if (fetched) return { img: fetched, debug: 'url' }
  return { img: null, debug: 'fetch_failed' }
}

async function mergeOfficeBytes(
  officeBytes: Uint8Array,
  fieldValues: Record<string, unknown>,
  signatureImages: Record<string, { bytes: Uint8Array, ext: string, contentType: string }> = {},
  format: 'docx' | 'pptx' = 'docx',
) {
  const zip = await JSZip.loadAsync(officeBytes)
  const isPptx = format === 'pptx'
  const targets = Object.keys(zip.files).filter(n =>
    (isPptx
      ? /^ppt\/slides\/slide\d+\.xml$/i.test(n)
      : /^word\/(document|header\d*|footer\d*)\.xml$/i.test(n))
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

    // 1) Replace pictures by AltText — same approach as letters (overwrite media + retarget embed)
    const found = findAltTextImageSlots(xml)
    altDebug.push({
      part: name,
      alt_hits: found.debugHits.slice(0, 20),
      image_containers: found.containerCount,
      slots: found.slots.map(s => ({ key: s.key, embedId: s.embedId, via: s.via, block_len: s.block.length })),
    })

    for (const slot of found.slots) {
      slotsFound.push(`${name}:${slot.key}:${slot.embedId}:${slot.via}`)
      const img = signatureImages[slot.key]
      if (!img) {
        swapLog.push(`${slot.key}:no_image_bytes`)
        continue
      }

      // PPTX: always replace Canva p:pic with a clean picture (overwrite/relink alone
      // is ignored by Google Slides). DOCX letters keep overwrite + relink.
      const existingBefore = mediaPathFromRels(relsXml, slot.embedId, name)
      if (existingBefore) {
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

      const oldBlock = slot.block
      if (isPptx && xml.includes(oldBlock)) {
        const xfrm = extractPptxXfrm(oldBlock) || { x: '0', y: '0', cx: '2000000', cy: '700000' }
        const shapeId = maxCNvPrId(xml) + 1
        const pic = pptxSignaturePicXml(rId, shapeId, slot.key, xfrm, slot.key === 'treasurer_seal', true)
        xml = xml.split(oldBlock).join(pic)
        swappedKeys.add(slot.key)
        swapLog.push(`${slot.key}:replace_shape:${rId}:${xfrm.cx}x${xfrm.cy}@${xfrm.x},${xfrm.y}`)
      } else {
        const newBlock = retargetPictureBlock(oldBlock, slot.embedId, rId)
        if (newBlock !== oldBlock && xml.includes(oldBlock)) {
          xml = xml.split(oldBlock).join(newBlock)
          swappedKeys.add(slot.key)
          swapLog.push(`${slot.key}:relink:${slot.embedId}->${rId}`)
        } else if (existingBefore) {
          swappedKeys.add(slot.key)
        } else {
          swapLog.push(`${slot.key}:failed_no_media_path:embed=${slot.embedId}`)
        }
      }
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

/** Upload merged Office file → Google Docs/Slides → export PDF → delete temp */
async function convertOfficeViaGoogleDrive(
  accessToken: string,
  fileBytes: Uint8Array,
  displayName: string,
  parentFolderId: string | null,
  format: 'docx' | 'pptx' = 'docx',
) {
  const boundary = `pc_${crypto.randomUUID().replace(/-/g, '')}`
  const googleMime = format === 'pptx' ? GSLIDES_MIME : GDOC_MIME
  const uploadMime = format === 'pptx' ? PPTX_MIME : DOCX_MIME
  const meta: Record<string, unknown> = {
    name: displayName.replace(/\.(docx|pptx)$/i, '').slice(0, 120),
    mimeType: googleMime,
  }
  if (parentFolderId) meta.parents = [parentFolderId]

  const enc = new TextEncoder()
  const head = enc.encode(
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${JSON.stringify(meta)}\r\n` +
    `--${boundary}\r\nContent-Type: ${uploadMime}\r\n\r\n`,
  )
  const tail = enc.encode(`\r\n--${boundary}--\r\n`)
  const body = concatBytes([head, fileBytes, tail])

  const upRes = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body,
    },
  )
  const upJson = await upRes.json().catch(() => ({}))
  if (!upRes.ok) {
    throw new Error(upJson?.error?.message || `Google Drive upload failed (${upRes.status})`)
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
      throw new Error(`Google PDF export failed (${exportRes.status}): ${errText.slice(0, 200)}`)
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
      return json({
        ok: true,
        ready: google.ready,
        engine: 'google_drive',
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
      const { images: signatureImages, debug: signatureLoadDebug } = await loadChurchSignatureImages(admin)
      const { img: memberPhoto, debug: memberPhotoDebug } = await loadMemberPhotoImage(admin, memberId)
      if (memberPhoto) signatureImages.member_photo = memberPhoto
      signatureLoadDebug.member_photo = memberPhotoDebug
      const { bytes: mergedBytes, mergeMeta } = await mergeOfficeBytes(
        templateBytes,
        fieldValues,
        signatureImages,
        format,
      )

      const outBase = templateKey + (memberId ? `_${memberId}` : '_blank')
      let outName = stampFilename(outBase, 'pdf')

      const g = await resolveGoogleAccess(admin)
      if (!g) {
        return json({
          error: 'Google Drive not connected. Open Backup → Connect Google, then retry Issue PDF.',
        }, 500)
      }

      let pdfBytes: Uint8Array
      let engineMeta: Record<string, unknown>
      try {
        const result = await convertOfficeViaGoogleDrive(
          g.accessToken,
          mergedBytes,
          outName.replace(/\.pdf$/i, format === 'pptx' ? '.pptx' : '.docx'),
          g.folderId,
          format,
        )
        pdfBytes = result.pdfBytes
        engineMeta = {
          engine: 'google_drive',
          google_via: g.via,
          google_email: g.email,
          source_format: format,
          google_mime: result.google_mime,
          drive_temp_deleted: true,
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        return json({ error: `google_drive: ${msg}` }, 500)
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
          template_key: templateKey,
          template_type: body.template_type || 'letter',
          member_id: memberId,
          issued_filename: outName,
          storage_path: issuedPath,
          field_values: fieldValues,
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
        ...engineMeta,
      })
    }

    return json({ error: `Unknown action: ${action}` }, 400)
  } catch (err) {
    console.error('[cms-print-corner]', err)
    return json({ error: err instanceof Error ? err.message : 'Unknown error' }, 500)
  }
})
