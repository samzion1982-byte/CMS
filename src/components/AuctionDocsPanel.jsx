import { useEffect, useRef, useState } from 'react'
import {
  Download, Eye, FileSpreadsheet, FolderOpen, Loader2, Trash2, Upload, X,
} from 'lucide-react'
import {
  auctionDocKindLabel,
  deleteAuctionDocument,
  formatAuctionDocSize,
  getAuctionDocumentUrl,
  listAuctionDocuments,
  uploadAuctionDocument,
} from '../lib/auctionDocumentsLib'

function fmtWhen(d) {
  if (!d) return ''
  try {
    return new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
  } catch {
    return ''
  }
}

export default function AuctionDocsPanel({
  selectedFY,
  onClose,
  refreshKey = 0,
  onRequestDelete,
}) {
  const fileRef = useRef(null)
  const [groups, setGroups] = useState([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [preview, setPreview] = useState(null) // { url, name, mime }

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      setGroups(await listAuctionDocuments())
    } catch (e) {
      setError(e.message || 'Could not load documents')
      setGroups([])
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [refreshKey])

  const openDoc = async (doc) => {
    try {
      const url = await getAuctionDocumentUrl(doc.path)
      const mime = String(doc.mime || '')
      const name = doc.originalName || doc.storedName
      const canEmbed = mime.includes('pdf') || mime.startsWith('image/')
        || /\.(pdf|png|jpe?g|gif|webp)$/i.test(name)
      if (canEmbed) setPreview({ url, name, mime })
      else window.open(url, '_blank', 'noopener,noreferrer')
    } catch (e) {
      setError(e.message || 'Could not open file')
    }
  }

  const downloadDoc = async (doc) => {
    try {
      const url = await getAuctionDocumentUrl(doc.path)
      const a = document.createElement('a')
      a.href = url
      a.download = doc.originalName || 'auction-document'
      a.target = '_blank'
      a.rel = 'noopener'
      a.click()
    } catch (e) {
      setError(e.message || 'Could not download file')
    }
  }

  const onPickReference = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setUploading(true)
    setError('')
    try {
      await uploadAuctionDocument({ fy: selectedFY, file, kind: 'reference' })
      await load()
    } catch (err) {
      setError(err.message || 'Upload failed')
    }
    setUploading(false)
  }

  return (
    <aside
      className="card"
      style={{
        width: 300,
        flexShrink: 0,
        padding: 0,
        position: 'sticky',
        top: 12,
        maxHeight: 'calc(100vh - 24px)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      <div style={{
        padding: '12px 14px',
        borderBottom: '1px solid var(--table-border)',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
      }}>
        <FolderOpen size={16} style={{ color: '#0f766e', flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-1)' }}>Uploaded documents</div>
          <div style={{ fontSize: 11, color: 'var(--text-3)' }}>Year-wise reference files</div>
        </div>
        <button
          type="button"
          onClick={onClose}
          style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-3)' }}
          aria-label="Close documents panel"
        >
          <X size={16} />
        </button>
      </div>

      <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--table-border)' }}>
        <input
          ref={fileRef}
          type="file"
          accept=".xlsx,.xlsm,.xls,.csv,.pdf,.png,.jpg,.jpeg"
          style={{ display: 'none' }}
          onChange={onPickReference}
        />
        <button
          type="button"
          className="action-btn"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          style={{ width: '100%', background: '#0f766e', justifyContent: 'center' }}
        >
          {uploading ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
          {uploading ? 'Saving…' : `Add file for ${selectedFY}`}
        </button>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '8px 10px 14px' }}>
        {loading && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 12, color: 'var(--text-3)', fontSize: 12 }}>
            <Loader2 size={14} className="animate-spin" /> Loading…
          </div>
        )}
        {error && (
          <p style={{ margin: '8px 4px', fontSize: 12, color: '#dc2626', fontWeight: 600 }}>{error}</p>
        )}
        {!loading && !groups.length && !error && (
          <p style={{ margin: '12px 4px', fontSize: 12, color: 'var(--text-3)', lineHeight: 1.45 }}>
            No files stored yet. Importing a tracker (or adding a file here) keeps a copy for this year.
          </p>
        )}
        {groups.map((g) => (
          <div key={g.fy} style={{ marginBottom: 12 }}>
            <div style={{
              fontSize: 11,
              fontWeight: 800,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              color: g.fy === selectedFY ? '#0f766e' : 'var(--text-3)',
              padding: '6px 4px 4px',
            }}>
              FY {g.fy}
            </div>
            {g.files.map((doc) => (
              <div
                key={doc.path}
                style={{
                  border: '1px solid var(--table-border)',
                  borderRadius: 8,
                  padding: '8px 8px 8px 10px',
                  marginBottom: 6,
                  background: 'var(--card-bg)',
                }}
              >
                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  <FileSpreadsheet size={15} style={{ color: '#0f766e', marginTop: 2, flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: 12,
                      fontWeight: 700,
                      color: 'var(--text-1)',
                      wordBreak: 'break-word',
                      lineHeight: 1.35,
                    }}>
                      {doc.originalName}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 2 }}>
                      {auctionDocKindLabel(doc.kind)}
                      {doc.uploadedAt ? ` · ${fmtWhen(doc.uploadedAt)}` : ''}
                      {doc.size ? ` · ${formatAuctionDocSize(doc.size)}` : ''}
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 4, marginTop: 8, justifyContent: 'flex-end' }}>
                  <button type="button" title="View / open" onClick={() => openDoc(doc)}
                    style={iconBtn}>
                    <Eye size={13} />
                  </button>
                  <button type="button" title="Download" onClick={() => downloadDoc(doc)}
                    style={iconBtn}>
                    <Download size={13} />
                  </button>
                  <button
                    type="button"
                    title="Delete (master password)"
                    onClick={() => onRequestDelete?.(doc, load)}
                    style={{ ...iconBtn, color: '#dc2626' }}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>

      {preview && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 100,
            background: 'rgba(15, 23, 42, 0.55)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
          }}
          onClick={() => setPreview(null)}
        >
          <div
            className="card"
            style={{ width: 'min(920px, 96vw)', height: 'min(80vh, 720px)', padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderBottom: '1px solid var(--table-border)' }}>
              <div style={{ flex: 1, fontSize: 13, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {preview.name}
              </div>
              <button type="button" onClick={() => setPreview(null)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-3)' }}>
                <X size={16} />
              </button>
            </div>
            {String(preview.mime || '').startsWith('image/') || /\.(png|jpe?g|gif|webp)$/i.test(preview.name) ? (
              <img src={preview.url} alt={preview.name} style={{ flex: 1, objectFit: 'contain', background: '#0f172a' }} />
            ) : (
              <iframe title={preview.name} src={preview.url} style={{ flex: 1, border: 'none', width: '100%' }} />
            )}
          </div>
        </div>
      )}
    </aside>
  )
}

const iconBtn = {
  border: '1px solid var(--table-border)',
  background: 'transparent',
  borderRadius: 6,
  width: 28,
  height: 28,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
  color: 'var(--text-2)',
}
