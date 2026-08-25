import { useEffect, useState } from 'react'
import {
  Download, Eye, FileSpreadsheet, FolderOpen, Loader2, Trash2, X,
} from 'lucide-react'
import {
  auctionDocKindLabel,
  downloadAuctionDocumentFile,
  fetchAuctionDocumentBytes,
  formatAuctionDocSize,
  getAuctionDocumentUrl,
  listAuctionDocuments,
  splitAuctionDocGroups,
} from '../lib/auctionDocumentsLib'

const PREVIEW_MAX_ROWS = 400
const PREVIEW_MAX_COLS = 40

function cellText(v) {
  if (v == null || v === '') return ''
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    return v.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
  }
  return String(v)
}

function buildWorkbookPreviewHtml(fileName, sheets) {
  const title = String(fileName || 'Auction file').replace(/[<>]/g, '')
  const data = JSON.stringify(sheets).replace(/</g, '\\u003c')
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${title.replace(/"/g, '&quot;')}</title>
  <style>
    :root { color-scheme: light dark; }
    body { margin: 0; font-family: Segoe UI, system-ui, sans-serif; background: #f1f5f9; color: #0f172a; }
    header { position: sticky; top: 0; z-index: 2; display: flex; align-items: center; gap: 10px;
      padding: 12px 16px; background: #0f766e; color: #fff; }
    header h1 { margin: 0; font-size: 14px; font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; }
    .tabs { display: flex; gap: 4px; padding: 8px 12px; overflow-x: auto; background: #fff; border-bottom: 1px solid #e2e8f0; }
    .tabs button { border: none; border-radius: 6px; padding: 6px 10px; font-size: 12px; font-weight: 700; cursor: pointer; background: transparent; color: #475569; white-space: nowrap; }
    .tabs button.on { background: #0f766e; color: #fff; }
    .note { margin: 0; padding: 8px 12px; font-size: 12px; color: #64748b; background: #fff; }
    .wrap { overflow: auto; height: calc(100vh - 90px); background: #fff; }
    table { border-collapse: collapse; font-size: 12px; min-width: 100%; }
    td { border: 1px solid #e2e8f0; padding: 4px 8px; white-space: nowrap; }
    tr:first-child td { font-weight: 700; background: #ecfdf5; }
  </style>
</head>
<body>
  <header><h1></h1></header>
  <div class="tabs" id="tabs"></div>
  <p class="note" id="note" hidden></p>
  <div class="wrap"><table id="grid"></table></div>
  <script>
    const fileName = ${JSON.stringify(title)};
    const sheets = ${data};
    document.querySelector('h1').textContent = fileName;
    document.title = fileName;
    const tabs = document.getElementById('tabs');
    const grid = document.getElementById('grid');
    const note = document.getElementById('note');
    let active = 0;
    function escapeHtml(s) {
      return String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }
    function render(i) {
      active = i;
      [...tabs.children].forEach((b, n) => b.classList.toggle('on', n === i));
      const sheet = sheets[i] || { rows: [] };
      note.hidden = !sheet.truncated;
      note.textContent = sheet.truncated ? 'Showing the first ${PREVIEW_MAX_ROWS} rows.' : '';
      const rows = sheet.rows || [];
      const colCount = rows.reduce((m, r) => Math.max(m, (r || []).length), 1);
      grid.innerHTML = rows.map((row, ri) => {
        const cells = Array.from({ length: colCount }, (_, ci) => '<td>' + escapeHtml((row || [])[ci]) + '</td>').join('');
        return '<tr>' + cells + '</tr>';
      }).join('') || '<tr><td>This sheet is empty.</td></tr>';
    }
    (sheets.length ? sheets : [{ name: 'Sheet', rows: [] }]).forEach((s, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = s.name || ('Sheet ' + (i + 1));
      b.onclick = () => render(i);
      tabs.appendChild(b);
    });
    if (sheets.length < 2) tabs.style.display = 'none';
    render(0);
  </script>
</body>
</html>`
}

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
            <button type="button" title="View in new tab" onClick={() => onOpen(doc)} style={iconBtn}>
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
          setError('Allow pop-ups to preview the file in a new tab.')
          return
        }
        try {
          tab.document.write('<p style="font-family:Segoe UI,sans-serif;padding:24px;color:#475569">Opening workbook…</p>')
          setError('')
          const { bytes, name: fileName } = await fetchAuctionDocumentBytes(doc)
          const xlsxMod = await import('xlsx')
          const { read, utils } = xlsxMod.default ?? xlsxMod
          const wb = read(bytes, { type: 'array', cellDates: true })
          const sheets = (wb.SheetNames || []).map((sheetName) => {
            const aoa = utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, defval: '', raw: false })
            const rows = aoa.slice(0, PREVIEW_MAX_ROWS).map((row) => {
              const cells = Array.isArray(row) ? row : []
              return cells.slice(0, PREVIEW_MAX_COLS).map(cellText)
            })
            return { name: sheetName, rows, truncated: aoa.length > PREVIEW_MAX_ROWS }
          })
          tab.document.open()
          tab.document.write(buildWorkbookPreviewHtml(fileName, sheets))
          tab.document.close()
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
