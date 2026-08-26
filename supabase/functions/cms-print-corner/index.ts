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
    if (!key) continue
    out = replacePlaceholderInXml(out, key, raw == null ? '' : String(raw))
  }
  return out
}

async function mergeDocxBytes(docxBytes: Uint8Array, fieldValues: Record<string, unknown>) {
  const zip = await JSZip.loadAsync(docxBytes)
  const targets = Object.keys(zip.files).filter(n =>
    /^word\/(document|header\d*|footer\d*)\.xml$/i.test(n) && !zip.files[n].dir
  )
  for (const name of targets) {
    const file = zip.file(name)
    if (!file) continue
    zip.file(name, applyFieldValuesToXml(await file.async('string'), fieldValues))
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
      const mergedBytes = await mergeDocxBytes(templateBytes, fieldValues)

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
        ...engineMeta,
      })
    }

    return json({ error: `Unknown action: ${action}` }, 400)
  } catch (err) {
    console.error('[cms-print-corner]', err)
    return json({ error: err instanceof Error ? err.message : 'Unknown error' }, 500)
  }
})
