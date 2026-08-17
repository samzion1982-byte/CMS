/* ═══════════════════════════════════════════════════════════════
   Auction reference documents — original import files, stored
   under church-documents / auction-ref/{FY}/
   ═══════════════════════════════════════════════════════════════ */

import { supabase } from './supabase'
import { logCmsAudit } from './cmsAudit'
import { captureDeletedRecord, quarantineStoragePaths } from './cmsRecycleBin'

export const AUCTION_DOC_BUCKET = 'church-documents'
export const AUCTION_DOC_ROOT = 'auction-ref'
export const AUCTION_DOC_MAX_BYTES = 10 * 1024 * 1024

const KINDS = new Set(['initial', 'current_year', 'reference'])

export function auctionDocKindLabel(kind) {
  if (kind === 'initial') return 'Initial setup'
  if (kind === 'current_year') return 'Current year'
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
  const m = String(storedName || '').match(/^(initial|current_year|reference)__(\d+)__(.+)$/)
  if (!m) return { kind: 'reference', originalName: storedName, uploadedAt: null }
  const ts = Number(m[2])
  return {
    kind: m[1],
    originalName: m[3],
    uploadedAt: Number.isFinite(ts) ? new Date(ts) : null,
  }
}

function isFolderEntry(item) {
  return item && !item.id && !item.metadata
}

function mimeForAuctionFile(file) {
  if (file?.type) return file.type
  const ext = String(file?.name || '').split('.').pop()?.toLowerCase()
  const map = {
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    xlsm: 'application/vnd.ms-excel.sheet.macroEnabled.12',
    xlsb: 'application/vnd.ms-excel.sheet.binary.macroEnabled.12',
    xls: 'application/vnd.ms-excel',
    csv: 'text/csv',
    pdf: 'application/pdf',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    webp: 'image/webp',
    gif: 'image/gif',
  }
  return map[ext] || 'application/octet-stream'
}

function missingOk(error) {
  const msg = String(error?.message || error || '').toLowerCase()
  return msg.includes('not found') || msg.includes('does not exist') || error?.statusCode === '404'
}

export async function listAuctionDocuments() {
  const { data: yearItems, error } = await supabase.storage
    .from(AUCTION_DOC_BUCKET)
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
      .from(AUCTION_DOC_BUCKET)
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

  groups.sort((a, b) => String(b.fy).localeCompare(String(a.fy)))
  return groups
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

  const { error } = await supabase.storage.from(AUCTION_DOC_BUCKET).upload(path, file, {
    upsert: false,
    contentType: mimeForAuctionFile(file),
  })
  if (error) {
    const msg = String(error.message || '')
    if (missingOk(error) || /bucket/i.test(msg)) {
      throw new Error('Could not store the file. Church Documents storage is not available on this church.')
    }
    throw error
  }

  await logCmsAudit({
    action: 'created',
    module: 'finance',
    entityType: 'auction_document',
    entityId: path,
    entityLabel: file.name,
    summary: `Stored auction reference file ${file.name} (FY ${fy}, ${safeKind})`,
  })
  return path
}

export async function getAuctionDocumentUrl(path) {
  const { data, error } = await supabase.storage
    .from(AUCTION_DOC_BUCKET)
    .createSignedUrl(path, 3600)
  if (!error && data?.signedUrl) return data.signedUrl
  const pub = supabase.storage.from(AUCTION_DOC_BUCKET).getPublicUrl(path)
  return pub.data.publicUrl
}

export async function deleteAuctionDocument(doc) {
  const path = doc?.path
  if (!path || !path.startsWith(`${AUCTION_DOC_ROOT}/`)) {
    throw new Error('Invalid auction document path.')
  }

  const snap = await captureDeletedRecord({
    module: 'finance',
    tableName: 'auction_documents',
    recordId: `auction-doc:${path}`,
    recordLabel: doc.originalName || path,
    row: {
      _kind: 'auction_document',
      bucket: AUCTION_DOC_BUCKET,
      path,
      fy: doc.fy,
      kind: doc.kind,
      file_name: doc.originalName,
    },
    notes: `Auction reference file FY ${doc.fy || ''}`,
  })

  if (snap?.id) {
    await quarantineStoragePaths({
      bucket: AUCTION_DOC_BUCKET,
      paths: [path],
      snapshotId: snap.id,
    }).catch((e) => console.warn('[quarantine] auction document', e))
  } else {
    const { error } = await supabase.storage.from(AUCTION_DOC_BUCKET).remove([path])
    if (error) throw error
  }

  await logCmsAudit({
    action: 'deleted',
    module: 'finance',
    entityType: 'auction_document',
    entityId: path,
    entityLabel: doc.originalName || path,
    summary: `Deleted auction reference file ${doc.originalName || path} (FY ${doc.fy || ''})`,
  })
}
