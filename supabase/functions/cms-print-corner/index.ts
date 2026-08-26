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

const IMAGE_PLACEHOLDER_KEYS = new Set(Object.keys(IMAGE_PLACEHOLDER_MAP))

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

function normalizeSignKey(raw: string): string | null {
  let s = String(raw || '').trim()
  if (!s) return null
  s = s.replace(/^\{+/, '').replace(/\}+$/, '').trim()
  return IMAGE_PLACEHOLDER_MAP[s] ? s : null
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

/** Find pictures whose Alt Text / descr / title / name is {presbyter_sign} etc. */
function findAltTextImageSlots(xml: string) {
  const slots: Array<{ key: string, embedId: string, block: string }> = []
  const blockRegex = /<(?:w:drawing|p:pic)\b[\s\S]*?<\/(?:w:drawing|p:pic)>/gi
  for (const m of xml.matchAll(blockRegex)) {
    const block = m[0]
    let key: string | null = null
    for (const attr of ['descr', 'title', 'name']) {
      const am = block.match(new RegExp(`\\b${attr}\\s*=\\s*"([^"]*)"`, 'i'))
        || block.match(new RegExp(`\\b${attr}\\s*=\\s*'([^']*)'`, 'i'))
      if (!am) continue
      key = normalizeSignKey(am[1])
      if (key) break
      // descr may contain the tag among other text
      for (const k of IMAGE_PLACEHOLDER_KEYS) {
        if (am[1].includes(`{${k}}`) || am[1].trim() === k) {
          key = normalizeSignKey(k)
          break
        }
      }
      if (key) break
    }
    if (!key) {
      for (const k of IMAGE_PLACEHOLDER_KEYS) {
        if (block.includes(`{${k}}`)) { key = normalizeSignKey(k); break }
      }
    }
    if (!key) continue

    const blip = block.match(/<a:blip\b[^>]*\br:embed\s*=\s*"([^"]+)"/i)
      || block.match(/<a:blip\b[^>]*\br:embed\s*=\s*'([^']+)'/i)
      || block.match(/<a:blip\b[^>]*\bembed\s*=\s*"([^"]+)"/i)
    if (!blip) continue
    slots.push({ key, embedId: blip[1], block })
  }
  return slots
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
  const relTag = relsXml.match(new RegExp(`<Relationship\\b[^>]*\\bId\\s*=\\s*"${embedId}"[^>]*\\/?>`, 'i'))
  if (!relTag) return null
  const t = relTag[0].match(/\bTarget\s*=\s*"([^"]+)"/i)
  if (!t?.[1]) return null
  return resolveRelTargetToZipPath(xmlPartPath, t[1])
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

    let img = await fetchSignatureImage(url)
    if (img) {
      debug[column] = `url_ok:${img.ext}:${img.bytes.length}b`
      loaded.set(column, img)
      return img
    }

    // Fallback: read directly from church-logos with service role
    const path = STORAGE_FALLBACK[column]
    if (path) {
      for (const tryPath of [path, path.replace(/\.png$/i, '.jpg'), path.replace(/\.png$/i, '.jpeg')]) {
        const { data, error } = await admin.storage.from('church-logos').download(tryPath)
        if (error || !data) continue
        const bytes = new Uint8Array(await data.arrayBuffer())
        if (!bytes.length) continue
        img = { bytes, ...sniffImageMeta(bytes, tryPath) }
        debug[column] = `storage_ok:${tryPath}:${img.ext}:${bytes.length}b`
        loaded.set(column, img)
        return img
      }
    }

    debug[column] = url ? `fetch_failed:${String(url).slice(0, 80)}` : 'no_url'
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

  let ctXml = zip.file('[Content_Types].xml')
    ? await zip.file('[Content_Types].xml')!.async('string')
    : ''

  for (const name of targets) {
    const file = zip.file(name)
    if (!file) continue
    let xml = await file.async('string')

    const relsName = relsPathForXmlPart(name)
    let relsXml = zip.file(relsName)
      ? await zip.file(relsName)!.async('string')
      : `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
        + `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>`
    let relsDirty = false

    const mediaFolder = isPptx ? 'ppt/media' : 'word/media'
    const relTargetPrefix = isPptx ? '../media/' : 'media/'

    // 1) Replace pictures by AltText (Word + PowerPoint)
    const slots = findAltTextImageSlots(xml)
    for (const slot of slots) {
      slotsFound.push(`${name}:${slot.key}:${slot.embedId}`)
      const img = signatureImages[slot.key]
      if (!img) {
        swapLog.push(`${slot.key}:no_image_bytes`)
        continue
      }

      mediaSeq += 1
      const mediaName = `sign_${slot.key}_${mediaSeq}.${img.ext}`
      zip.file(`${mediaFolder}/${mediaName}`, img.bytes)
      if (ctXml) ctXml = ensureContentTypeDefault(ctXml, img.ext, img.contentType)

      const rId = nextRelationshipId(relsXml)
      relsXml = relsXml.replace(
        '</Relationships>',
        `<Relationship Id="${rId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="${relTargetPrefix}${mediaName}"/></Relationships>`,
      )
      relsDirty = true

      const oldBlock = slot.block
      let newBlock = oldBlock
        .replace(new RegExp(`r:embed\\s*=\\s*"${slot.embedId}"`, 'i'), `r:embed="${rId}"`)
        .replace(new RegExp(`r:embed\\s*=\\s*'${slot.embedId}'`, 'i'), `r:embed='${rId}'`)

      if (newBlock !== oldBlock) {
        xml = xml.split(oldBlock).join(newBlock)
        swappedKeys.add(slot.key)
        swapLog.push(`${slot.key}:relinked:${rId}`)
      } else {
        const existing = mediaPathFromRels(relsXml, slot.embedId, name)
        if (existing) {
          zip.file(existing, img.bytes)
          swappedKeys.add(slot.key)
          swapLog.push(`${slot.key}:overwrote:${existing}`)
        } else {
          swapLog.push(`${slot.key}:failed_no_rel`)
        }
      }
    }

    // 2) Word-only: text tag {presbyter_sign} → inject drawing
    if (!isPptx) {
      for (const [key, img] of Object.entries(signatureImages)) {
        if (swappedKeys.has(key)) continue
        if (!placeholderExistsInXml(xml, key)) continue

        mediaSeq += 1
        const mediaName = `sign_${key}_${mediaSeq}.${img.ext}`
        zip.file(`${mediaFolder}/${mediaName}`, img.bytes)

        const rId = nextRelationshipId(relsXml)
        relsXml = relsXml.replace(
          '</Relationships>',
          `<Relationship Id="${rId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="${relTargetPrefix}${mediaName}"/></Relationships>`,
        )
        relsDirty = true

        docPrSeq += 1
        const drawing = signatureDrawingXml(rId, docPrSeq, key, key === 'treasurer_seal')
        xml = injectImageAtPlaceholder(xml, key, drawing)
        if (ctXml) ctXml = ensureContentTypeDefault(ctXml, img.ext, img.contentType)
        swappedKeys.add(key)
        swapLog.push(`${key}:text_inject`)
      }
    }

    // 3) Clear leftover text sign tags
    for (const key of IMAGE_PLACEHOLDER_KEYS) {
      if (placeholderExistsInXml(xml, key)) {
        xml = replacePlaceholderInXml(xml, key, '')
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
      const memberId = body.member_id ? String(body.member_id).trim() : null
      const issue = body.issue !== false
      const fieldValues = (body.field_values && typeof body.field_values === 'object')
        ? body.field_values
        : {}

      if (!storagePath.startsWith('templates/')) {
        return json({ error: 'storage_path must be under templates/' }, 400)
      }

      const { data: fileBlob, error: dlErr } = await admin.storage.from(BUCKET).download(storagePath)
      if (dlErr || !fileBlob) {
        return json({ error: dlErr?.message || 'Could not download template' }, 400)
      }
      const templateBytes = new Uint8Array(await fileBlob.arrayBuffer())
      const format: 'docx' | 'pptx' = /\.pptx$/i.test(storagePath) ? 'pptx' : 'docx'
      const { images: signatureImages, debug: signatureLoadDebug } = await loadChurchSignatureImages(admin)
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
      const issuedPath = issue
        ? `issued/${body.template_type || 'letters'}/${year}/${outName}`
        : `previews/${user.id}/${outName}`

      const { error: upErr } = await admin.storage.from(BUCKET).upload(issuedPath, pdfBytes, {
        contentType: 'application/pdf',
        upsert: true,
      })
      if (upErr) throw new Error(`Storage upload failed: ${upErr.message}`)

      const { data: urlData } = await admin.storage.from(BUCKET).createSignedUrl(issuedPath, 3600)

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
