// @ts-nocheck
/* ═══════════════════════════════════════════════════════════════
   cms-print-corner — mail-merge Word → PDF
   Engines (PRINT_CORNER_PDF_ENGINE):
     auto          — Google Drive if connected, else CloudConvert (default)
     google_drive  — Google Docs export only
     cloudconvert  — CloudConvert only
   Secrets / deps:
     GOOGLE_OAUTH_CLIENT_ID + GOOGLE_OAUTH_CLIENT_SECRET
       + cms_backup_settings.google_refresh_token (Backup → Connect Google)
     OR GOOGLE_SERVICE_ACCOUNT_JSON
     CLOUDCONVERT_API_KEY (optional fallback)
   Actions:
     ping              — auth + which engines are ready
     convert_storage   — merge field_values → PDF → issued/
   ═══════════════════════════════════════════════════════════════ */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import JSZip from 'https://esm.sh/jszip@3.10.1'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || ''
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') || Deno.env.get('SUPABASE_ANON') || ''
const CLOUDCONVERT_API_KEY = Deno.env.get('CLOUDCONVERT_API_KEY') || ''
const PDF_ENGINE = (Deno.env.get('PRINT_CORNER_PDF_ENGINE') || 'auto').toLowerCase()
const CC_API = 'https://api.cloudconvert.com/v2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const BUCKET = 'print-corner'
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
const GDOC_MIME = 'application/vnd.google-apps.document'

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
  seceratary_sign: 'secretary_signature_url', // common typo alias
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
  // word/document.xml → word/_rels/document.xml.rels
  const i = xmlPath.lastIndexOf('/')
  const dir = i >= 0 ? xmlPath.slice(0, i) : ''
  const base = i >= 0 ? xmlPath.slice(i + 1) : xmlPath
  return `${dir}/_rels/${base}.rels`
}

/** Inline signature ~ 1.6" × 0.55" (EMUs) */
function signatureDrawingXml(rId: string, docPrId: number, name: string, isSeal = false) {
  const cx = isSeal ? 914400 : 1463040 // 1" seal or ~1.6" sign
  const cy = isSeal ? 914400 : 502920  // 1" seal or ~0.55" sign
  return (
    `<w:drawing>`
    + `<wp:inline distT="0" distB="0" distL="0" distR="0"`
    + ` xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"`
    + ` xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"`
    + ` xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"`
    + ` xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">`
    + `<wp:extent cx="${cx}" cy="${cy}"/>`
    + `<wp:docPr id="${docPrId}" name="${escapeXml(name)}"/>`
    + `<wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr>`
    + `<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">`
    + `<pic:pic>`
    + `<pic:nvPicPr><pic:cNvPr id="0" name="${escapeXml(name)}"/><pic:cNvPicPr/></pic:nvPicPr>`
    + `<pic:blipFill><a:blip r:embed="${rId}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>`
    + `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm>`
    + `<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>`
    + `</pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing>`
  )
}

/**
 * Collapse {key} (even if Word split it across runs) to a marker, then splice a
 * drawing run into the surrounding <w:t>…</w:t> so the image sits in-flow.
 */
function injectImageAtPlaceholder(xml: string, key: string, drawingXml: string) {
  const marker = `§§IMG_${key}§§`
  if (!placeholderExistsInXml(xml, key)) return xml
  let out = replacePlaceholderInXml(xml, key, marker)
  if (!out.includes(marker)) return out
  // Close current text run, insert drawing run, reopen text — valid OOXML
  const splice = `</w:t></w:r><w:r>${drawingXml}</w:r><w:r><w:t>`
  out = out.split(marker).join(splice)
  return out
}

async function loadChurchSignatureImages(admin: ReturnType<typeof createClient>) {
  const { data: church } = await admin
    .from('churches')
    .select('presbyter_signature_url, secretary_signature_url, treasurer_signature_url, treasurer_seal_url')
    .limit(1)
    .maybeSingle()

  const images: Record<string, { bytes: Uint8Array, ext: string, contentType: string }> = {}
  if (!church) return images

  const loaded = new Map<string, { bytes: Uint8Array, ext: string, contentType: string } | null>()

  for (const [placeholder, column] of Object.entries(IMAGE_PLACEHOLDER_MAP)) {
    const url = (church as Record<string, string | null>)[column]
    if (!loaded.has(column)) {
      loaded.set(column, await fetchSignatureImage(url))
    }
    const img = loaded.get(column)
    if (img) images[placeholder] = img
  }
  return images
}

async function mergeDocxBytes(
  docxBytes: Uint8Array,
  fieldValues: Record<string, unknown>,
  signatureImages: Record<string, { bytes: Uint8Array, ext: string, contentType: string }> = {},
) {
  const zip = await JSZip.loadAsync(docxBytes)
  const targets = Object.keys(zip.files).filter(n =>
    /^word\/(document|header\d*|footer\d*)\.xml$/i.test(n) && !zip.files[n].dir
  )

  let docPrSeq = 900
  let mediaSeq = 0

  for (const name of targets) {
    const file = zip.file(name)
    if (!file) continue
    let xml = await file.async('string')

    // 1) Inject signature / seal images for placeholders present in this part
    for (const [key, img] of Object.entries(signatureImages)) {
      if (!placeholderExistsInXml(xml, key)) continue

      mediaSeq += 1
      const mediaName = `sign_${key}_${mediaSeq}.${img.ext}`
      const mediaPath = `word/media/${mediaName}`
      zip.file(mediaPath, img.bytes)

      const relsName = relsPathForXmlPart(name)
      let relsXml = zip.file(relsName)
        ? await zip.file(relsName)!.async('string')
        : `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
          + `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>`

      const rId = nextRelationshipId(relsXml)
      const relType = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/image'
      const target = `media/${mediaName}`
      if (!relsXml.includes(`Id="${rId}"`)) {
        relsXml = relsXml.replace(
          '</Relationships>',
          `<Relationship Id="${rId}" Type="${relType}" Target="${target}"/></Relationships>`,
        )
        zip.file(relsName, relsXml)
      }

      docPrSeq += 1
      const drawing = signatureDrawingXml(rId, docPrSeq, key, key === 'treasurer_seal')
      xml = injectImageAtPlaceholder(xml, key, drawing)
    }

    // 2) Clear any remaining image placeholders (missing upload → blank)
    for (const key of IMAGE_PLACEHOLDER_KEYS) {
      if (placeholderExistsInXml(xml, key)) {
        xml = replacePlaceholderInXml(xml, key, '')
      }
    }

    // 3) Normal text mail-merge
    xml = applyFieldValuesToXml(xml, fieldValues)
    zip.file(name, xml)
  }

  return await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' })
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

/** Upload merged docx as Google Doc → export PDF → delete temp file */
async function convertDocxViaGoogleDrive(
  accessToken: string,
  docxBytes: Uint8Array,
  displayName: string,
  parentFolderId: string | null,
) {
  const boundary = `pc_${crypto.randomUUID().replace(/-/g, '')}`
  const meta: Record<string, unknown> = {
    name: displayName.replace(/\.docx$/i, '').slice(0, 120),
    mimeType: GDOC_MIME,
  }
  if (parentFolderId) meta.parents = [parentFolderId]

  const enc = new TextEncoder()
  const head = enc.encode(
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${JSON.stringify(meta)}\r\n` +
    `--${boundary}\r\nContent-Type: ${DOCX_MIME}\r\n\r\n`,
  )
  const tail = enc.encode(`\r\n--${boundary}--\r\n`)
  const body = concatBytes([head, docxBytes, tail])

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
      throw new Error(`Google Docs PDF export failed (${exportRes.status}): ${errText.slice(0, 200)}`)
    }
    const pdfBytes = new Uint8Array(await exportRes.arrayBuffer())
    if (!pdfBytes.length) throw new Error('Google Docs returned empty PDF')
    return { pdfBytes, driveFileId: fileId }
  } finally {
    // Best-effort cleanup of temp Google Doc
    await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${accessToken}` },
    }).catch(() => null)
  }
}

/* ── CloudConvert (optional fallback) ──────────────────────────── */

async function createCloudConvertJob(importUrl: string, outputFilename: string) {
  const payload = {
    tasks: {
      'import-file': { operation: 'import/url', url: importUrl },
      'convert-file': {
        operation: 'convert',
        input: 'import-file',
        input_format: 'docx',
        output_format: 'pdf',
        engine: 'office',
        filename: outputFilename,
      },
      'export-file': { operation: 'export/url', input: 'convert-file' },
    },
  }
  const res = await fetch(`${CC_API}/jobs`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${CLOUDCONVERT_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data?.message || data?.error || `CloudConvert job failed (${res.status})`)
  return data?.data?.id as string
}

async function waitForExportUrl(jobId: string, maxMs = 120000) {
  const started = Date.now()
  while (Date.now() - started < maxMs) {
    const res = await fetch(`${CC_API}/jobs/${jobId}?include=tasks`, {
      headers: { Authorization: `Bearer ${CLOUDCONVERT_API_KEY}` },
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data?.message || `CloudConvert poll failed (${res.status})`)
    const job = data?.data
    if (job?.status === 'error') throw new Error(job?.message || 'CloudConvert job error')
    const exportTask = (job?.tasks || []).find((t: { name?: string }) => t.name === 'export-file')
    if (exportTask?.status === 'finished') {
      const url = exportTask?.result?.files?.[0]?.url
      if (url) return { url, jobId }
    }
    await new Promise(r => setTimeout(r, 1500))
  }
  throw new Error('CloudConvert timed out waiting for PDF')
}

async function convertDocxViaCloudConvert(
  admin: ReturnType<typeof createClient>,
  userId: string,
  mergedBytes: Uint8Array,
  outBase: string,
) {
  const mergedName = stampFilename(outBase, 'docx')
  const mergedPath = `work/merged/${userId}/${mergedName}`
  const { error: mergeUpErr } = await admin.storage.from(BUCKET).upload(mergedPath, mergedBytes, {
    contentType: DOCX_MIME,
    upsert: true,
  })
  if (mergeUpErr) throw new Error(`Merged upload failed: ${mergeUpErr.message}`)

  const { data: signed, error: signErr } = await admin.storage.from(BUCKET).createSignedUrl(mergedPath, 3600)
  if (signErr || !signed?.signedUrl) throw new Error(signErr?.message || 'Could not sign merged URL')

  const outName = stampFilename(outBase, 'pdf')
  const jobId = await createCloudConvertJob(signed.signedUrl, outName)
  const { url: pdfUrl, jobId: finishedJobId } = await waitForExportUrl(jobId)
  const pdfRes = await fetch(pdfUrl)
  if (!pdfRes.ok) throw new Error(`Failed to download PDF (${pdfRes.status})`)
  return {
    pdfBytes: new Uint8Array(await pdfRes.arrayBuffer()),
    outName,
    engineMeta: { engine: 'cloudconvert', cloudconvert_job: finishedJobId || jobId },
  }
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
      const cloudconvert = !!CLOUDCONVERT_API_KEY
      const ready = google.ready || cloudconvert
      return json({
        ok: true,
        ready,
        engine_pref: PDF_ENGINE,
        google_drive: google.ready,
        google_via: google.via,
        google_email: google.email,
        cloudconvert,
        merge: true,
        signatures: true,
        user: prof?.email || user.email,
        // Back-compat for older UI that only checks cloudconvert
        cloudconvert_or_google: ready,
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
      const signatureImages = await loadChurchSignatureImages(admin)
      const mergedBytes = await mergeDocxBytes(templateBytes, fieldValues, signatureImages)

      const outBase = templateKey + (memberId ? `_${memberId}` : '_blank')
      const preferGoogle = PDF_ENGINE === 'auto' || PDF_ENGINE === 'google' || PDF_ENGINE === 'google_drive'
      const preferCc = PDF_ENGINE === 'auto' || PDF_ENGINE === 'cloudconvert'
      const forceGoogle = PDF_ENGINE === 'google' || PDF_ENGINE === 'google_drive'
      const forceCc = PDF_ENGINE === 'cloudconvert'

      let pdfBytes: Uint8Array | null = null
      let outName = stampFilename(outBase, 'pdf')
      let engineMeta: Record<string, unknown> = {}
      const errors: string[] = []

      if (preferGoogle && !forceCc) {
        try {
          const g = await resolveGoogleAccess(admin)
          if (!g) throw new Error('Google Drive not connected (Backup → Connect Google)')
          const result = await convertDocxViaGoogleDrive(
            g.accessToken,
            mergedBytes,
            outName.replace(/\.pdf$/i, '.docx'),
            g.folderId,
          )
          pdfBytes = result.pdfBytes
          engineMeta = {
            engine: 'google_drive',
            google_via: g.via,
            google_email: g.email,
            drive_temp_deleted: true,
          }
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e)
          errors.push(`google_drive: ${msg}`)
          if (forceGoogle) throw e
        }
      }

      if (!pdfBytes && preferCc && CLOUDCONVERT_API_KEY && !forceGoogle) {
        try {
          const result = await convertDocxViaCloudConvert(admin, user.id, mergedBytes, outBase)
          pdfBytes = result.pdfBytes
          outName = result.outName
          engineMeta = result.engineMeta
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e)
          errors.push(`cloudconvert: ${msg}`)
          if (forceCc || !preferGoogle) throw e
        }
      }

      if (!pdfBytes) {
        return json({
          error: errors.length
            ? errors.join(' | ')
            : 'No PDF engine available. Connect Google on Backup page, or set CLOUDCONVERT_API_KEY.',
        }, 500)
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
          cloudconvert_job: engineMeta.cloudconvert_job || engineMeta.engine || null,
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
        ...engineMeta,
      })
    }

    return json({ error: `Unknown action: ${action}` }, 400)
  } catch (err) {
    console.error('[cms-print-corner]', err)
    return json({ error: err instanceof Error ? err.message : 'Unknown error' }, 500)
  }
})
