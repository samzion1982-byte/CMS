// @ts-nocheck
/* ═══════════════════════════════════════════════════════════════
   cms-print-corner — Word/HTML → PDF via CloudConvert
   Secrets: CLOUDCONVERT_API_KEY (required)
   Actions:
     ping              — verify auth + API key configured
     convert_storage   — docx in print-corner bucket → PDF → issued/
   ═══════════════════════════════════════════════════════════════ */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || ''
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') || Deno.env.get('SUPABASE_ANON') || ''
const CLOUDCONVERT_API_KEY = Deno.env.get('CLOUDCONVERT_API_KEY') || ''
const CC_API = 'https://api.cloudconvert.com/v2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const BUCKET = 'print-corner'

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

function stampFilename(base: string) {
  const now = new Date()
  const date = now.toISOString().slice(0, 10)
  const time = now.toISOString().slice(11, 19).replace(/:/g, '')
  const safe = String(base || 'document').replace(/[^\w.-]+/g, '_').slice(0, 80)
  return `${date}_${time}_${safe}.pdf`
}

async function createCloudConvertJob(importUrl: string, outputFilename: string) {
  const payload = {
    tasks: {
      'import-file': {
        operation: 'import/url',
        url: importUrl,
      },
      'convert-file': {
        operation: 'convert',
        input: 'import-file',
        input_format: 'docx',
        output_format: 'pdf',
        engine: 'office',
        filename: outputFilename,
      },
      'export-file': {
        operation: 'export/url',
        input: 'convert-file',
      },
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
  if (!res.ok) {
    throw new Error(data?.message || data?.error || `CloudConvert job failed (${res.status})`)
  }
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
    if (job?.status === 'error') {
      throw new Error(job?.message || 'CloudConvert job error')
    }

    const tasks = job?.tasks || []
    const exportTask = tasks.find((t: { name?: string }) => t.name === 'export-file')
    if (exportTask?.status === 'finished') {
      const url = exportTask?.result?.files?.[0]?.url
      if (url) return { url, jobId }
    }

    await new Promise(r => setTimeout(r, 1500))
  }
  throw new Error('CloudConvert timed out waiting for PDF')
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
      return json({
        ok: true,
        cloudconvert: !!CLOUDCONVERT_API_KEY,
        user: prof?.email || user.email,
      })
    }

    if (!CLOUDCONVERT_API_KEY) {
      return json({ error: 'CLOUDCONVERT_API_KEY secret not set on this Supabase project' }, 500)
    }

    if (action === 'convert_storage') {
      const storagePath = String(body.storage_path || '').trim()
      const templateKey = String(body.template_key || 'document').trim()
      const memberId = body.member_id ? String(body.member_id).trim() : null
      const issue = body.issue !== false

      if (!storagePath.startsWith('templates/')) {
        return json({ error: 'storage_path must be under templates/' }, 400)
      }

      const { data: signed, error: signErr } = await admin.storage
        .from(BUCKET)
        .createSignedUrl(storagePath, 3600)
      if (signErr || !signed?.signedUrl) {
        return json({ error: signErr?.message || 'Could not sign template URL' }, 400)
      }

      const outName = stampFilename(templateKey + (memberId ? `_${memberId}` : '_blank'))
      const jobId = await createCloudConvertJob(signed.signedUrl, outName)
      const { url: pdfUrl, jobId: finishedJobId } = await waitForExportUrl(jobId)

      const pdfRes = await fetch(pdfUrl)
      if (!pdfRes.ok) throw new Error(`Failed to download PDF (${pdfRes.status})`)
      const pdfBytes = new Uint8Array(await pdfRes.arrayBuffer())

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
          field_values: body.field_values || {},
          source: body.source || 'manual',
          cloudconvert_job: finishedJobId || jobId,
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
        cloudconvert_job: finishedJobId || jobId,
      })
    }

    return json({ error: `Unknown action: ${action}` }, 400)
  } catch (err) {
    console.error('[cms-print-corner]', err)
    return json({ error: err instanceof Error ? err.message : 'Unknown error' }, 500)
  }
})
