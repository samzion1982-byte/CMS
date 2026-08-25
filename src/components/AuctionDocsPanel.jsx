import { useEffect, useState } from 'react'
import {
  Download, Eye, FileSpreadsheet, FolderOpen, Loader2, Trash2, X,
} from 'lucide-react'
import {
  auctionDocKindLabel,
  downloadAuctionDocumentFile,
  formatAuctionDocSize,
  getAuctionDocumentShareUrl,
  getAuctionDocumentUrl,
  googleSpreadsheetViewerUrl,
  listAuctionDocuments,
  splitAuctionDocGroups,
} from '../lib/auctionDocumentsLib'

function fmtWhen(d) {
  if (!d) return ''
  try {
    return new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
  } catch {
    return ''
  }
}

function DocList({ groups, emptyText, onOpen, onDownload, onRequestDelete, load, showKind = false }) {
  if (!groups.length) {
    return (
      <p style={{ margin: '12px 4px', fontSize: 12, color: 'var(--text-3)', lineHeight: 1.45 }}>
        {emptyText}
      </p>
    )
  }
  return groups.map((g) => (
    <div key={g.fy} style={{ marginBottom: 12 }}>
      <div style={{
        fontSize: 11,
        fontWeight: 800,
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
        color: 'var(--text-3)',
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
                {[
                  showKind ? auctionDocKindLabel(doc.kind) : null,
                  doc.uploadedAt ? fmtWhen(doc.uploadedAt) : null,
                  doc.size ? formatAuctionDocSize(doc.size) : null,
                ].filter(Boolean).join(' · ')}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 4, marginTop: 8, justifyContent: 'flex-end' }}>
            <button type="button" title="View in Google Sheets" onClick={() => onOpen(doc)} style={iconBtn}>
              <Eye size={13} />
            </button>
            <button type="button" title="Download" onClick={() => onDownload(doc)} style={iconBtn}>
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
  ))
}

export default function AuctionDocsPanel({
  refreshKey = 0,
  onRequestDelete,
}) {
  const [tab, setTab] = useState('uploaded')
  const [uploaded, setUploaded] = useState([])
  const [closed, setClosed] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [preview, setPreview] = useState(null)

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const groups = await listAuctionDocuments()
      const split = splitAuctionDocGroups(groups)
      setUploaded(split.uploaded)
      setClosed(split.closed)
    } catch (e) {
      setError(e.message || 'Could not load documents')
      setUploaded([])
      setClosed([])
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [refreshKey])

  const openDoc = async (doc) => {
    try {
      const mime = String(doc.mime || '')
      const name = doc.originalName || doc.storedName
      const isSpreadsheet = /\.(xlsx|xlsm|xls|xlsb|csv)$/i.test(name)
      if (isSpreadsheet) {
        const tab = window.open('', '_blank')
        if (!tab) {
          setError('Allow pop-ups to open Google Sheets.')
          return
        }
        try {
          tab.document.write('<p style="font-family:Segoe UI,sans-serif;padding:24px;color:#475569">Opening in Google Sheets…</p>')
          setError('')
          const fileUrl = await getAuctionDocumentShareUrl(doc.path, doc.bucket)
          tab.location.href = googleSpreadsheetViewerUrl(fileUrl)
        } catch (e) {
          try { tab.close() } catch { /* ignore */ }
          throw e
        }
        return
      }
      const url = await getAuctionDocumentUrl(doc.path, doc.bucket)
      const canEmbed = mime.includes('pdf') || mime.startsWith('image/')
        || /\.(pdf|png|jpe?g|gif|webp)$/i.test(name)
      if (canEmbed) setPreview({ url, name, mime })
      else window.open(url, '_blank')
    } catch (e) {
      setError(e.message || 'Could not open file')
    }
  }

  const downloadDoc = async (doc) => {
    try {
      await downloadAuctionDocumentFile(doc)
    } catch (e) {
      setError(e.message || 'Could not download file')
    }
  }

  const tabBtn = (id, label) => (
    <button
      type="button"
      onClick={() => setTab(id)}
      style={{
        flex: 1,
        border: 'none',
        background: tab === id ? '#0f766e' : 'transparent',
        color: tab === id ? '#fff' : 'var(--text-2)',
        fontSize: 11,
        fontWeight: 700,
        padding: '8px 6px',
        cursor: 'pointer',
      }}
    >
      {label}
    </button>
  )

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
          <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-1)' }}>Files</div>
          <div style={{ fontSize: 11, color: 'var(--text-3)' }}>One file per year</div>
        </div>
      </div>

      <div style={{ display: 'flex', borderBottom: '1px solid var(--table-border)' }}>
        {tabBtn('uploaded', 'Uploaded Documents')}
        {tabBtn('closed', 'Closed reports')}
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
        {!loading && tab === 'uploaded' && (
          <DocList
            groups={uploaded}
            emptyText="No file for any year yet. Use Import File. One Total Purchase per year. If it is wrong, delete it then import again."
            onOpen={openDoc}
            onDownload={downloadDoc}
            onRequestDelete={onRequestDelete}
            load={load}
          />
        )}
        {!loading && tab === 'closed' && (
          <DocList
            groups={closed}
            emptyText="No closed-year reports yet. They appear here after Close Year."
            onOpen={openDoc}
            onDownload={downloadDoc}
            onRequestDelete={onRequestDelete}
            load={load}
          />
        )}
      </div>

      {preview && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 10050,
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
