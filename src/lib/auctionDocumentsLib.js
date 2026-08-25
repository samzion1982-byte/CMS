/* ═══════════════════════════════════════════════════════════════
   Auction reference documents — original import files and close
   reports, stored under auction-reports / auction-ref/{FY}/
   ═══════════════════════════════════════════════════════════════ */

import { supabase } from './supabase'
import { logCmsAudit } from './cmsAudit'
import { captureDeletedRecord, quarantineStoragePaths } from './cmsRecycleBin'

export const AUCTION_DOC_BUCKET = 'auction-reports'
export const AUCTION_DOC_LEGACY_BUCKET = 'church-documents'
export const AUCTION_DOC_ROOT = 'auction-ref'
export const AUCTION_DOC_MAX_BYTES = 25 * 1024 * 1024

const KINDS = new Set(['initial', 'current_year', 'reference', 'close_report'])
const UPLOAD_KINDS = new Set(['initial', 'current_year', 'reference'])

export function isCloseReportKind(kind) {
  return kind === 'close_report'
}

export function isUploadedDocKind(kind) {
  return UPLOAD_KINDS.has(kind) || (!kind)
}

export function auctionDocKindLabel(kind) {
  if (kind === 'initial') return 'Initial setup'
  if (kind === 'current_year') return 'Total Purchase'
  if (kind === 'close_report') return 'Closed year report'
  return 'Reference'
}

export function formatAuctionDocSize(bytes) {
  const n = Number(bytes)
  if (!Number.isFinite(n) || n < 0) return ''
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

export function parseAuctionDocName(storedName) {
  const m = String(storedName || '').match(/^(initial|current_year|reference|close_report)__(\d+)__(.+)$/)
  if (!m) return { kind: 'reference', originalName: storedName, uploadedAt: null }
  const ts = Number(m[2])
  return {
    kind: m[1],
    originalName: m[3],
    uploadedAt: Number.isFinite(ts) ? new Date(ts) : null,
  }
}

function isFolderEntry(item) {
  if (!item?.name) return true
  if (item.name === '.emptyFolderPlaceholder') return true
  // Macro workbooks (.xlsm) sometimes land without id/metadata. If the name
  // has a file extension, treat it as a file so it still appears in the panel.
  if (/\.[a-z0-9]{2,8}$/i.test(item.name)) return false
  return !item.id && !item.metadata
}

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
const XLSM_MIME = 'application/vnd.ms-excel.sheet.macroEnabled.12'

function mimeCandidatesForAuctionFile(file) {
  const ext = String(file?.name || '').split('.').pop()?.toLowerCase()
  const native = String(file?.type || '').trim()
  const ordered = []
  // Do not store .xlsm as xlsx MIME — browsers then save it as .xlsx and Excel rejects it.
  if (ext === 'xlsm') {
    ordered.push(
      XLSM_MIME,
      'application/vnd.ms-excel.sheet.macroenabled.12',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.macroEnabled.12',
      'application/octet-stream',
    )
  } else if (ext === 'xlsb') {
    ordered.push(
      'application/vnd.ms-excel.sheet.binary.macroEnabled.12',
      'application/vnd.ms-excel.sheet.binary.macroenabled.12',
      'application/octet-stream',
    )
  } else if (ext === 'xlsx') {
    ordered.push(XLSX_MIME, native, 'application/octet-stream')
  } else if (ext === 'xls') {
    ordered.push('application/vnd.ms-excel', native, 'application/octet-stream')
  } else if (ext === 'csv') {
    ordered.push('text/csv', 'text/plain', native, 'application/octet-stream')
  } else {
    ordered.push(native, 'application/octet-stream')
  }
  return [...new Set(ordered.filter(Boolean))]
}

function sniffSpreadsheetExt(bytes) {
  if (!bytes || bytes.length < 8) return null
  if (bytes[0] === 0xD0 && bytes[1] === 0xCF && bytes[2] === 0x11 && bytes[3] === 0xE0) return 'xls'
  if (bytes[0] !== 0x50 || bytes[1] !== 0x4B) return null
  const sample = new TextDecoder('latin1').decode(bytes.subarray(0, Math.min(bytes.length, 512 * 1024)))
  if (/vbaProject\.bin/i.test(sample) || /macroEnabled\.12/i.test(sample)) return 'xlsm'
  return 'xlsx'
}

function mimeForSpreadsheetName(name) {
  const ext = String(name || '').split('.').pop()?.toLowerCase()
  if (ext === 'xlsm') return XLSM_MIME
  if (ext === 'xlsb') return 'application/vnd.ms-excel.sheet.binary.macroEnabled.12'
  if (ext === 'xls') return 'application/vnd.ms-excel'
  if (ext === 'csv') return 'text/csv'
  if (ext === 'xlsx') return XLSX_MIME
  return 'application/octet-stream'
}

function withExtension(fileName, ext) {
  const base = String(fileName || 'auction-document').replace(/\.[^.]+$/, '') || 'auction-document'
  return `${base}.${ext}`
}

export async function fetchAuctionDocumentBytes(doc) {
  const bucket = doc?.bucket || AUCTION_DOC_BUCKET
  const path = doc?.path
  if (!path) throw new Error('Missing file path.')
  const { data, error } = await supabase.storage.from(bucket).download(path)
  if (error || !data) throw error || new Error('Could not download file.')
  const bytes = new Uint8Array(await data.arrayBuffer())
  const sniffed = sniffSpreadsheetExt(bytes)
  let name = doc.originalName || doc.storedName || 'auction-document.xlsx'
  const nameExt = String(name).split('.').pop()?.toLowerCase()
  if (sniffed && nameExt !== sniffed) name = withExtension(name, sniffed)
  return { bytes, name }
}

/** Fetch the stored workbook and save it under the original name (correct .xlsx / .xlsm). */
export async function downloadAuctionDocumentFile(doc) {
  const { bytes, name } = await fetchAuctionDocumentBytes(doc)
  const blob = new Blob([bytes], { type: mimeForSpreadsheetName(name) })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 4000)
  return name
}

function missingOk(error) {
  const msg = String(error?.message || error || '').toLowerCase()
  return msg.includes('not found') || msg.includes('does not exist') || error?.statusCode === '404'
}

async function listAuctionDocumentsFromBucket(bucket) {
  const { data: yearItems, error } = await supabase.storage
    .from(bucket)
    .list(AUCTION_DOC_ROOT, { limit: 200, sortBy: { column: 'name', order: 'desc' } })

  if (error) {
    if (missingOk(error)) return []
    throw error
  }

  const yearNames = (yearItems || [])
    .map((item) => item?.name)
    .filter((name) => name && /^\d{4}-\d{2}$/.test(name))

  const groups = []
  for (const fy of yearNames) {
    const prefix = `${AUCTION_DOC_ROOT}/${fy}`
    const { data: files, error: listErr } = await supabase.storage
      .from(bucket)
      .list(prefix, { limit: 200, sortBy: { column: 'created_at', order: 'desc' } })
    if (listErr) {
      if (missingOk(listErr)) continue
      throw listErr
    }
    const docs = (files || [])
      .filter((f) => f?.name && f.name !== '.emptyFolderPlaceholder' && !isFolderEntry(f))
      .map((f) => {
        const parsed = parseAuctionDocName(f.name)
        return {
          fy,
          bucket,
          path: `${prefix}/${f.name}`,
          storedName: f.name,
          kind: parsed.kind,
          originalName: parsed.originalName,
          uploadedAt: parsed.uploadedAt || (f.created_at ? new Date(f.created_at) : null),
          size: f.metadata?.size ?? null,
          mime: f.metadata?.mimetype || null,
        }
      })
    if (docs.length) groups.push({ fy, files: docs })
  }
  return groups
}

function mergeAuctionDocGroups(primary, extra) {
  const byFy = new Map()
  for (const g of [...primary, ...extra]) {
    const files = byFy.get(g.fy) || []
    const seen = new Set(files.map((f) => `${f.bucket}:${f.path}`))
    for (const f of g.files || []) {
      const key = `${f.bucket}:${f.path}`
      if (seen.has(key)) continue
      seen.add(key)
      files.push(f)
    }
    byFy.set(g.fy, files)
  }
  return [...byFy.entries()]
    .map(([fy, files]) => ({ fy, files }))
    .sort((a, b) => String(b.fy).localeCompare(String(a.fy)))
}

export async function listAuctionDocuments() {
  const primary = await listAuctionDocumentsFromBucket(AUCTION_DOC_BUCKET)
  let legacy = []
  try {
    legacy = await listAuctionDocumentsFromBucket(AUCTION_DOC_LEGACY_BUCKET)
  } catch (e) {
    if (!missingOk(e)) throw e
  }
  return mergeAuctionDocGroups(primary, legacy)
}

export function splitAuctionDocGroups(groups) {
  const uploaded = []
  const closed = []
  for (const g of groups || []) {
    const up = (g.files || []).filter((f) => !isCloseReportKind(f.kind))
    const cl = (g.files || []).filter((f) => isCloseReportKind(f.kind))
    if (up.length) uploaded.push({ fy: g.fy, files: up })
    if (cl.length) closed.push({ fy: g.fy, files: cl })
  }
  return { uploaded, closed }
}

export async function listUploadedDocsForFY(fy) {
  const groups = await listAuctionDocuments()
  const g = (groups || []).find((x) => x.fy === fy)
  return (g?.files || []).filter((f) => !isCloseReportKind(f.kind))
}

export async function listCloseReportsForFY(fy) {
  const groups = await listAuctionDocuments()
  const g = (groups || []).find((x) => x.fy === fy)
  return (g?.files || []).filter((f) => isCloseReportKind(f.kind) || looksLikeCloseWorkbook(f))
}

function looksLikeCloseWorkbook(doc) {
  const name = String(doc?.originalName || doc?.storedName || '')
  return /^Auction_Close_/i.test(name) || String(doc?.storedName || '').startsWith('close_report__')
}

async function listRawFilesInFyFolder(bucket, fy) {
  const prefix = `${AUCTION_DOC_ROOT}/${fy}`
  const { data, error } = await supabase.storage.from(bucket).list(prefix, { limit: 200 })
  if (error) {
    if (missingOk(error)) return []
    throw error
  }
  return (data || [])
    .filter((f) => f?.name && f.name !== '.emptyFolderPlaceholder' && !isFolderEntry(f))
    .map((f) => {
      const parsed = parseAuctionDocName(f.name)
      return {
        fy,
        bucket,
        path: `${prefix}/${f.name}`,
        storedName: f.name,
        kind: parsed.kind,
        originalName: parsed.originalName,
        uploadedAt: parsed.uploadedAt || (f.created_at ? new Date(f.created_at) : null),
        size: f.metadata?.size ?? null,
        mime: f.metadata?.mimetype || null,
      }
    })
}

/** Remove generated Close Year Excel for this FY from both storage buckets. */
export async function deleteCloseReportsForFY(fy) {
  if (!fy) return 0
  const listed = await listCloseReportsForFY(fy)
  const raw = [
    ...(await listRawFilesInFyFolder(AUCTION_DOC_BUCKET, fy)),
    ...(await listRawFilesInFyFolder(AUCTION_DOC_LEGACY_BUCKET, fy).catch((e) => {
      if (missingOk(e)) return []
      throw e
    })),
  ].filter((f) => isCloseReportKind(f.kind) || looksLikeCloseWorkbook(f))

  const byKey = new Map()
  for (const doc of [...listed, ...raw]) {
    byKey.set(`${doc.bucket}:${doc.path}`, doc)
  }
  const docs = [...byKey.values()]
  const failed = []
  for (const doc of docs) {
    try {
      await deleteAuctionDocument(doc)
    } catch (e) {
      failed.push(`${doc.originalName || doc.path}: ${e.message || e}`)
    }
  }
  if (failed.length) {
    throw new Error(`Could not remove close report: ${failed.join('; ')}`)
  }
  return docs.length
}

export async function uploadAuctionDocument({ fy, file, kind = 'reference' }) {
  if (!fy) throw new Error('Financial year is required.')
  if (!file) throw new Error('Choose a file to upload.')
  if (file.size > AUCTION_DOC_MAX_BYTES) {
    throw new Error(`File must be under ${Math.round(AUCTION_DOC_MAX_BYTES / (1024 * 1024))} MB.`)
  }
  const safeKind = KINDS.has(kind) ? kind : 'reference'
  const safeName = String(file.name || 'document').replace(/[^\w.\- ()]/g, '_')
  const path = `${AUCTION_DOC_ROOT}/${fy}/${safeKind}__${Date.now()}__${safeName}`

  const bytes = await file.arrayBuffer()
  let lastErr = null
  for (const contentType of mimeCandidatesForAuctionFile(file)) {
    const body = new Blob([bytes], { type: contentType })
    const { error } = await supabase.storage.from(AUCTION_DOC_BUCKET).upload(path, body, {
      upsert: false,
      contentType,
    })
    if (!error) {
      lastErr = null
      break
    }
    lastErr = error
    const msg = String(error.message || '')
    // A previous MIME attempt may have created the object; treat as stored.
    if (/already exists|duplicate|resource already/i.test(msg)) {
      lastErr = null
      break
    }
    if (!/mime|media type|not allowed|invalid/i.test(msg)) break
  }
  if (lastErr) {
    const msg = String(lastErr.message || '')
    if (missingOk(lastErr) || /bucket/i.test(msg)) {
      throw new Error('Could not store the file. Auction Reports storage is not available on this church.')
    }
    throw lastErr
  }

  await logCmsAudit({
    action: 'created',
    module: 'auction',
    entityType: 'auction_document',
    entityId: path,
    entityLabel: file.name,
    summary: `Stored auction file ${file.name} (FY ${fy}, ${safeKind})`,
  })
  return path
}

export async function getAuctionDocumentUrl(path, bucket = AUCTION_DOC_BUCKET) {
  const useBucket = bucket || AUCTION_DOC_BUCKET
  const { data, error } = await supabase.storage
    .from(useBucket)
    .createSignedUrl(path, 3600)
  if (!error && data?.signedUrl) return data.signedUrl
  const pub = supabase.storage.from(useBucket).getPublicUrl(path)
  return pub.data.publicUrl
}

export async function deleteAuctionDocument(doc) {
  const path = doc?.path
  if (!path || !path.startsWith(`${AUCTION_DOC_ROOT}/`)) {
    throw new Error('Invalid auction document path.')
  }
  const bucket = doc.bucket || AUCTION_DOC_BUCKET

  const snap = await captureDeletedRecord({
    module: 'auction',
    tableName: 'auction_documents',
    recordId: `auction-doc:${path}`,
    recordLabel: doc.originalName || path,
    row: {
      _kind: 'auction_document',
      bucket,
      path,
      fy: doc.fy,
      kind: doc.kind,
      file_name: doc.originalName,
    },
    notes: `Auction report file FY ${doc.fy || ''}`,
  })

  if (snap?.id) {
    await quarantineStoragePaths({
      bucket,
      paths: [path],
      snapshotId: snap.id,
    }).catch((e) => console.warn('[quarantine] auction document', e))
  }

  // Recycle-bin move can fail (no admin client) while the snapshot still exists.
  // Always remove the live path so Closed reports cannot keep a leftover copy.
  const { error } = await supabase.storage.from(bucket).remove([path])
  if (error && !missingOk(error)) throw error

  await logCmsAudit({
    action: 'deleted',
    module: 'auction',
    entityType: 'auction_document',
    entityId: path,
    entityLabel: doc.originalName || path,
    summary: `Deleted auction file ${doc.originalName || path} (FY ${doc.fy || ''})`,
  })
}

async function collectStoragePaths(bucket, folderPrefix) {
  const paths = []
  async function walk(dir) {
    const { data, error } = await supabase.storage.from(bucket).list(dir || '', { limit: 1000 })
    if (error || !data?.length) return
    for (const item of data) {
      if (item.name === '.emptyFolderPlaceholder') continue
      const full = dir ? `${dir}/${item.name}` : item.name
      if (folderPrefix && full !== folderPrefix && !full.startsWith(`${folderPrefix}/`)) continue
      if (item.id || item.metadata || /\.[a-z0-9]{2,8}$/i.test(item.name)) paths.push(full)
      else await walk(full)
    }
  }
  await walk(folderPrefix || '')
  return paths
}

/** Delete every stored Auction Report file (new bucket + leftover church-documents path). */
export async function flushAuctionDocumentStorage() {
  const targets = [
    { bucket: AUCTION_DOC_BUCKET, folder: '' },
    { bucket: AUCTION_DOC_LEGACY_BUCKET, folder: AUCTION_DOC_ROOT },
  ]
  let deleted = 0
  for (const t of targets) {
    const paths = await collectStoragePaths(t.bucket, t.folder)
    for (let i = 0; i < paths.length; i += 100) {
      const chunk = paths.slice(i, i + 100)
      const { error } = await supabase.storage.from(t.bucket).remove(chunk)
      if (error && !missingOk(error)) throw error
      if (!error) deleted += chunk.length
    }
  }
  return deleted
}
