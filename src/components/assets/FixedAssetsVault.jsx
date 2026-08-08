/* ═══════════════════════════════════════════════════════════════
   FixedAssetsVault — master-password gate + asset tiles + documents
   ═══════════════════════════════════════════════════════════════ */

import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Lock, Eye, EyeOff, Building2, FileText, ExternalLink, Plus, Loader2,
  X, Upload, Trash2, ArrowLeft, Settings, Link2, Image as ImageIcon, File,
} from 'lucide-react'
import { useToast } from '../../lib/toast'
import { useAuth } from '../../lib/AuthContext'
import MasterPasswordInput from '../MasterPasswordInput'
import {
  FIXED_ASSETS_MASTER_PASSWORD, FIXED_ASSETS_IDLE_MS,
  isFixedAssetsUnlocked, unlockFixedAssets, lockFixedAssets,
  touchFixedAssetsActivity, shouldAutoLockFixedAssets,
  getFixedAssets, countFixedAssetDocuments,
  getFixedAssetDocuments, saveFixedAssetDocument,
  softDeleteFixedAssetDocument, formatFileSize,
} from '../../lib/fixedAssetsLib'

const INPUT = {
  height: 42, padding: '0 14px', border: '1.5px solid var(--card-border)',
  borderRadius: 10, fontSize: 14, background: 'var(--input-bg)',
  color: 'var(--text-1)', outline: 'none', boxSizing: 'border-box', width: '100%',
}

/** Keep vault unlocked only while the user stays active. */
function useFixedAssetsIdleLock(enabled, onLock) {
  const onLockRef = useRef(onLock)
  onLockRef.current = onLock

  useEffect(() => {
    if (!enabled) return undefined

    if (shouldAutoLockFixedAssets()) {
      lockFixedAssets()
      onLockRef.current?.()
      return undefined
    }

    touchFixedAssetsActivity()

    const bump = () => touchFixedAssetsActivity()
    const events = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'wheel']
    events.forEach(ev => window.addEventListener(ev, bump, { passive: true }))

    const tick = window.setInterval(() => {
      if (shouldAutoLockFixedAssets()) {
        lockFixedAssets()
        onLockRef.current?.()
      }
    }, 15_000)

    return () => {
      events.forEach(ev => window.removeEventListener(ev, bump))
      window.clearInterval(tick)
    }
  }, [enabled])
}

function MasterPasswordModal({
  title = 'Master Password',
  message,
  confirmLabel = 'Confirm',
  onConfirm,
  onClose,
}) {
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [error, setError] = useState('')
  const [working, setWorking] = useState(false)
  const inputRef = useRef(null)
  useEffect(() => { setTimeout(() => inputRef.current?.focus(), 80) }, [])

  async function attempt() {
    if (password !== FIXED_ASSETS_MASTER_PASSWORD) {
      setError('Incorrect master password.')
      setPassword('')
      return
    }
    setWorking(true)
    try {
      await onConfirm()
    } finally {
      setWorking(false)
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 2400, background: 'rgba(0,0,0,0.55)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
    }} onClick={onClose}>
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--card-bg)', borderRadius: 16, width: '100%', maxWidth: 400,
          boxShadow: '0 24px 60px rgba(0,0,0,0.25)', overflow: 'hidden',
        }}
      >
        <div style={{ padding: '20px 22px 8px', textAlign: 'center' }}>
          <div style={{
            width: 48, height: 48, borderRadius: 14, background: '#fee2e2',
            display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px',
          }}>
            <Lock size={20} color="#b91c1c" />
          </div>
          <p style={{ margin: '0 0 6px', fontSize: 16, fontWeight: 800, color: 'var(--text-1)' }}>{title}</p>
          {message && (
            <p style={{ margin: 0, fontSize: 13, color: 'var(--text-3)', lineHeight: 1.45 }}>{message}</p>
          )}
        </div>
        <div style={{ padding: '14px 22px 22px' }}>
          <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', display: 'block', marginBottom: 7 }}>
            Master Password
          </label>
          <div style={{ position: 'relative', marginBottom: 10 }}>
            <MasterPasswordInput
              ref={inputRef}
              showPlain={showPw}
              value={password}
              onChange={e => { setPassword(e.target.value); setError('') }}
              onKeyDown={e => e.key === 'Enter' && attempt()}
              placeholder="Enter master password…"
              style={{
                ...INPUT, height: 40, fontSize: 13, paddingRight: 42,
                letterSpacing: showPw ? 'normal' : '0.12em',
                border: `1.5px solid ${error ? '#b91c1c' : 'var(--card-border)'}`,
              }}
            />
            <button type="button" onClick={() => setShowPw(v => !v)} style={{
              position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
              background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', display: 'flex',
            }}>
              {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>
          {error && <p style={{ fontSize: 12, color: '#b91c1c', fontWeight: 600, margin: '0 0 10px' }}>{error}</p>}
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" onClick={onClose} style={{
              flex: 1, height: 40, borderRadius: 8, border: '1.5px solid var(--card-border)',
              background: 'var(--card-bg)', fontSize: 13, fontWeight: 600, cursor: 'pointer', color: 'var(--text-2)',
            }}>Cancel</button>
            <button type="button" onClick={attempt} disabled={!password || working} style={{
              flex: 2, height: 40, borderRadius: 8, border: 'none',
              background: password ? '#b91c1c' : '#e5e7eb', color: password ? '#fff' : '#9ca3af',
              fontSize: 13, fontWeight: 700, cursor: password ? 'pointer' : 'not-allowed',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7,
            }}>
              {working ? <Loader2 size={14} className="animate-spin" /> : <Lock size={14} />}
              {confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function LockScreen({ onUnlock }) {
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [error, setError] = useState('')
  const inputRef = useRef(null)
  useEffect(() => { setTimeout(() => inputRef.current?.focus(), 80) }, [])

  function attempt() {
    if (password === FIXED_ASSETS_MASTER_PASSWORD) {
      unlockFixedAssets()
      onUnlock()
    } else {
      setError('Incorrect master password.')
      setPassword('')
    }
  }

  return (
    <div style={{ minHeight: '50vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{
        background: 'var(--card-bg)', borderRadius: 20, width: '100%', maxWidth: 420,
        boxShadow: '0 24px 60px rgba(0,0,0,0.12)', border: '1px solid var(--card-border)', overflow: 'hidden',
      }}>
        <div style={{ padding: '32px 32px 20px', textAlign: 'center' }}>
          <div style={{
            width: 60, height: 60, borderRadius: 18, background: '#fee2e2',
            display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px',
          }}>
            <Lock size={26} color="#b91c1c" />
          </div>
          <p style={{ fontSize: 18, fontWeight: 800, color: 'var(--text-1)', margin: '0 0 6px' }}>Fixed Assets Vault</p>
          <p style={{ fontSize: 13, color: 'var(--text-3)', margin: 0, lineHeight: 1.5 }}>
            Enter the master password to view property tiles and documents.
          </p>
        </div>
        <div style={{ padding: '0 32px 28px' }}>
          <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', display: 'block', marginBottom: 7 }}>
            Master Password
          </label>
          <div style={{ position: 'relative', marginBottom: 12 }}>
            <MasterPasswordInput
              ref={inputRef}
              showPlain={showPw}
              value={password}
              onChange={e => { setPassword(e.target.value); setError('') }}
              onKeyDown={e => e.key === 'Enter' && attempt()}
              placeholder="Enter master password…"
              style={{
                ...INPUT,
                letterSpacing: showPw ? 'normal' : '0.12em',
                border: `1.5px solid ${error ? '#b91c1c' : 'var(--card-border)'}`,
                paddingRight: 44,
              }}
            />
            <button
              type="button"
              onClick={() => setShowPw(v => !v)}
              style={{
                position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', display: 'flex',
              }}
            >
              {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>
          {error && <p style={{ fontSize: 12, color: '#b91c1c', fontWeight: 600, margin: '0 0 10px' }}>{error}</p>}
          <button
            type="button"
            onClick={attempt}
            disabled={!password}
            style={{
              width: '100%', height: 44, border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 700,
              background: password ? '#b91c1c' : '#e5e7eb',
              color: password ? '#fff' : '#9ca3af',
              cursor: password ? 'pointer' : 'not-allowed',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            }}
          >
            <Lock size={15} /> Unlock Vault
          </button>
        </div>
      </div>
    </div>
  )
}

function UploadDocModal({ asset, onClose, onSaved }) {
  const toast = useToast()
  const { profile } = useAuth()
  const [title, setTitle] = useState('')
  const [docType, setDocType] = useState('')
  const [docDate, setDocDate] = useState('')
  const [notes, setNotes] = useState('')
  const [file, setFile] = useState(null)
  const [saving, setSaving] = useState(false)
  const fileRef = useRef(null)

  async function handleSave(e) {
    e.preventDefault()
    if (!file) {
      toast('Choose a file to upload.', 'error')
      return
    }
    setSaving(true)
    try {
      await saveFixedAssetDocument({
        fixed_asset_id: asset.id,
        title: title.trim() || file.name,
        doc_type: docType,
        doc_date: docDate || null,
        notes,
        file,
        created_by: profile?.full_name || profile?.email || null,
      })
      toast('Document uploaded.', 'success')
      onSaved()
      onClose()
    } catch (err) {
      toast(err.message || 'Upload failed.', 'error')
    }
    setSaving(false)
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 2200, background: 'rgba(0,0,0,0.55)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
    }} onClick={onClose}>
      <form
        onClick={e => e.stopPropagation()}
        onSubmit={handleSave}
        style={{
          background: 'var(--card-bg)', borderRadius: 16, width: '100%', maxWidth: 440,
          boxShadow: '0 24px 60px rgba(0,0,0,0.25)',
        }}
      >
        <div style={{
          padding: '16px 20px', borderBottom: '1px solid var(--card-border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <p style={{ margin: 0, fontWeight: 700, fontSize: 14, color: 'var(--text-1)' }}>Upload document</p>
          <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', display: 'flex' }}>
            <X size={16} />
          </button>
        </div>
        <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <p style={{ margin: 0, fontSize: 12, color: 'var(--text-3)' }}>Asset: <strong style={{ color: 'var(--text-1)' }}>{asset.name}</strong></p>
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', display: 'block', marginBottom: 6 }}>File *</label>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              style={{
                width: '100%', minHeight: 44, padding: '10px 12px', borderRadius: 8,
                border: '1.5px dashed var(--card-border)', background: 'var(--table-header-bg)',
                cursor: 'pointer', fontSize: 13, color: 'var(--text-2)', textAlign: 'left',
              }}
            >
              {file ? `${file.name} (${formatFileSize(file.size)})` : 'Choose PDF, image, or Office file (max 10 MB)'}
            </button>
            <input
              ref={fileRef}
              type="file"
              hidden
              accept=".pdf,.doc,.docx,.xls,.xlsx,image/*"
              onChange={e => {
                const f = e.target.files?.[0]
                e.target.value = ''
                if (!f) return
                setFile(f)
                if (!title.trim()) setTitle(f.name.replace(/\.[^.]+$/, ''))
              }}
            />
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', display: 'block', marginBottom: 6 }}>Title</label>
            <input value={title} onChange={e => setTitle(e.target.value)} style={{ ...INPUT, height: 38 }} placeholder="e.g. Title deed" />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', display: 'block', marginBottom: 6 }}>Type</label>
              <input value={docType} onChange={e => setDocType(e.target.value)} style={{ ...INPUT, height: 38 }} placeholder="Deed, Tax, Insurance…" />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', display: 'block', marginBottom: 6 }}>Date</label>
              <input type="date" value={docDate} onChange={e => setDocDate(e.target.value)} style={{ ...INPUT, height: 38 }} />
            </div>
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', display: 'block', marginBottom: 6 }}>Notes</label>
            <input value={notes} onChange={e => setNotes(e.target.value)} style={{ ...INPUT, height: 38 }} placeholder="Optional" />
          </div>
        </div>
        <div style={{ padding: '14px 20px', borderTop: '1px solid var(--card-border)', display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button type="button" onClick={onClose} style={{
            height: 40, padding: '0 14px', borderRadius: 8, border: '1.5px solid var(--card-border)',
            background: 'var(--card-bg)', fontSize: 13, fontWeight: 600, cursor: 'pointer', color: 'var(--text-2)',
          }}>Cancel</button>
          <button type="submit" disabled={saving || !file} style={{
            height: 40, padding: '0 16px', borderRadius: 8, border: 'none',
            background: file ? 'var(--accent)' : '#e5e7eb', color: file ? '#fff' : '#9ca3af',
            fontSize: 13, fontWeight: 700, cursor: file ? 'pointer' : 'not-allowed',
            display: 'inline-flex', alignItems: 'center', gap: 7,
          }}>
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
            Upload
          </button>
        </div>
      </form>
    </div>
  )
}

function fmtDocDate(d) {
  if (!d) return ''
  const [y, m, day] = String(d).slice(0, 10).split('-')
  return `${day}-${m}-${y}`
}

function fileKind(doc) {
  const mime = (doc.mime_type || '').toLowerCase()
  const name = (doc.file_name || doc.title || '').toLowerCase()
  if (mime.startsWith('image/') || /\.(jpe?g|png|gif|webp|bmp)$/.test(name)) return 'image'
  if (mime === 'application/pdf' || name.endsWith('.pdf')) return 'pdf'
  return 'other'
}

function DocPreview({ doc }) {
  if (!doc?.file_url) {
    return (
      <div style={{
        height: '100%', minHeight: 360, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', color: 'var(--text-3)', gap: 8, padding: 24,
      }}>
        <FileText size={36} style={{ opacity: 0.45 }} />
        <p style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>Select a document</p>
        <p style={{ margin: 0, fontSize: 12, textAlign: 'center' }}>Choose a file from the list to preview it here.</p>
      </div>
    )
  }

  const kind = fileKind(doc)

  if (kind === 'image') {
    return (
      <div style={{
        height: '100%', minHeight: 360, display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: '#0f172a08', padding: 16, overflow: 'auto',
      }}>
        <img
          src={doc.file_url}
          alt={doc.title || 'Document'}
          style={{ maxWidth: '100%', maxHeight: 'calc(100vh - 280px)', objectFit: 'contain', borderRadius: 8 }}
        />
      </div>
    )
  }

  if (kind === 'pdf') {
    return (
      <iframe
        title={doc.title || 'PDF'}
        src={`${doc.file_url}#toolbar=1&navpanes=0`}
        style={{
          width: '100%', height: '100%', minHeight: 480, border: 'none',
          background: '#f8fafc',
        }}
      />
    )
  }

  return (
    <div style={{
      height: '100%', minHeight: 360, display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', color: 'var(--text-2)', gap: 12, padding: 32,
    }}>
      <File size={40} style={{ color: 'var(--text-3)', opacity: 0.6 }} />
      <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--text-1)', textAlign: 'center' }}>
        {doc.title}
      </p>
      <p style={{ margin: 0, fontSize: 13, color: 'var(--text-3)', textAlign: 'center' }}>
        Preview not available for this file type. Open it in a new tab.
      </p>
      <a
        href={doc.file_url}
        target="_blank"
        rel="noreferrer"
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 7, padding: '9px 16px',
          background: 'var(--accent)', color: '#fff', borderRadius: 8, fontSize: 13,
          fontWeight: 700, textDecoration: 'none',
        }}
      >
        <ExternalLink size={14} /> Open file
      </a>
    </div>
  )
}

function AssetDetail({ asset, onBack }) {
  const toast = useToast()
  const { profile } = useAuth()
  const [docs, setDocs] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [uploadOpen, setUploadOpen] = useState(false)
  const [busy, setBusy] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)

  const selected = docs.find(d => d.id === selectedId) || null

  const load = useCallback(async (preferId = null) => {
    setLoading(true)
    try {
      const list = await getFixedAssetDocuments(asset.id)
      setDocs(list)
      setSelectedId(prev => {
        if (preferId && list.some(d => d.id === preferId)) return preferId
        if (prev && list.some(d => d.id === prev)) return prev
        return list[0]?.id || null
      })
    } catch (e) {
      toast(e.message, 'error')
    }
    setLoading(false)
  }, [asset.id, toast])

  useEffect(() => { load() }, [load])

  async function confirmDeleteDoc() {
    const doc = deleteTarget
    if (!doc) return
    setBusy(doc.id)
    try {
      await softDeleteFixedAssetDocument(doc.id, profile?.full_name || profile?.email || null)
      toast('Document removed.', 'success')
      setDeleteTarget(null)
      const next = docs.filter(d => d.id !== doc.id)
      const nextId = selectedId === doc.id ? (next[0]?.id || null) : selectedId
      await load(nextId)
    } catch (e) {
      toast(e.message, 'error')
    }
    setBusy(null)
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <button onClick={onBack} style={{
          padding: '8px 10px', background: 'var(--card-bg)', border: '1.5px solid var(--card-border)',
          borderRadius: 8, cursor: 'pointer', color: 'var(--text-2)', display: 'inline-flex', alignItems: 'center', gap: 6,
          fontSize: 13, fontWeight: 600,
        }}>
          <ArrowLeft size={14} /> Tiles
        </button>
        <div style={{ flex: 1, minWidth: 200 }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: 'var(--text-1)' }}>{asset.name}</h2>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-3)' }}>
            {[asset.asset_type, asset.status, asset.location_label].filter(Boolean).join(' · ')}
          </p>
        </div>
        {asset.drive_url && (
          <a href={asset.drive_url} target="_blank" rel="noreferrer" style={{
            display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 12px',
            borderRadius: 8, border: '1.5px solid #bfdbfe', background: '#eff6ff',
            color: '#1d4ed8', fontSize: 12, fontWeight: 700, textDecoration: 'none',
          }}>
            <Link2 size={13} /> Google Drive
          </a>
        )}
        <button onClick={() => setUploadOpen(true)} style={{
          display: 'inline-flex', alignItems: 'center', gap: 7, padding: '8px 14px',
          background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8,
          fontSize: 13, fontWeight: 600, cursor: 'pointer',
        }}>
          <Plus size={14} /> Add Document
        </button>
      </div>

      {asset.description && (
        <p style={{ margin: '0 0 14px', fontSize: 13, color: 'var(--text-2)', lineHeight: 1.5 }}>{asset.description}</p>
      )}

      {loading ? (
        <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--text-3)' }}>
          <Loader2 size={22} className="animate-spin" style={{ display: 'block', margin: '0 auto 8px' }} />
          Loading documents…
        </div>
      ) : docs.length === 0 ? (
        <div className="card" style={{ padding: '40px 24px', textAlign: 'center' }}>
          <FileText size={28} style={{ color: 'var(--text-3)', margin: '0 auto 10px', display: 'block', opacity: 0.5 }} />
          <p style={{ margin: '0 0 4px', fontSize: 14, fontWeight: 600, color: 'var(--text-1)' }}>No documents yet</p>
          <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--text-3)' }}>Upload deeds, tax receipts, insurance, drawings…</p>
          <button onClick={() => setUploadOpen(true)} style={{
            display: 'inline-flex', alignItems: 'center', gap: 7, padding: '8px 16px',
            background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8,
            fontSize: 13, fontWeight: 600, cursor: 'pointer',
          }}>
            <Upload size={14} /> Upload document
          </button>
        </div>
      ) : (
        <div
          className="card fixed-doc-split"
          style={{
            padding: 0, overflow: 'hidden',
            display: 'grid',
            gridTemplateColumns: 'minmax(220px, 280px) 1fr',
            minHeight: 480,
          }}
        >
          {/* Sidebar */}
          <div style={{
            borderRight: '1px solid var(--card-border)',
            background: 'var(--table-header-bg, #f8fafc)',
            display: 'flex', flexDirection: 'column', maxHeight: 'calc(100vh - 220px)',
          }}>
            <div style={{
              padding: '12px 14px', borderBottom: '1px solid var(--card-border)',
              fontSize: 11, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase',
              color: 'var(--text-3)',
            }}>
              Documents ({docs.length})
            </div>
            <div style={{ overflowY: 'auto', flex: 1 }}>
              {docs.map(doc => {
                const active = doc.id === selectedId
                const kind = fileKind(doc)
                const Icon = kind === 'image' ? ImageIcon : FileText
                return (
                  <div
                    key={doc.id}
                    style={{
                      display: 'flex', alignItems: 'stretch',
                      borderBottom: '1px solid var(--card-border)',
                      background: active ? 'var(--card-bg)' : 'transparent',
                      boxShadow: active ? 'inset 3px 0 0 var(--accent)' : 'none',
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => setSelectedId(doc.id)}
                      style={{
                        flex: 1, textAlign: 'left', padding: '11px 12px', border: 'none',
                        background: 'transparent', cursor: 'pointer', display: 'flex', gap: 10,
                        alignItems: 'flex-start', minWidth: 0,
                      }}
                    >
                      <Icon size={16} style={{
                        color: active ? 'var(--accent)' : 'var(--text-3)',
                        marginTop: 2, flexShrink: 0,
                      }} />
                      <span style={{ minWidth: 0 }}>
                        <span style={{
                          display: 'block', fontSize: 13, fontWeight: active ? 800 : 600,
                          color: 'var(--text-1)', lineHeight: 1.3,
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}>
                          {doc.title}
                        </span>
                        <span style={{
                          display: 'block', marginTop: 3, fontSize: 11, color: 'var(--text-3)',
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}>
                          {[doc.doc_type, doc.doc_date ? fmtDocDate(doc.doc_date) : null, formatFileSize(doc.file_size)]
                            .filter(Boolean).join(' · ')}
                        </span>
                      </span>
                    </button>
                    <div style={{ display: 'flex', flexDirection: 'column', padding: '6px 6px 6px 0', gap: 4 }}>
                      {doc.file_url && (
                        <a href={doc.file_url} target="_blank" rel="noreferrer" title="Open in new tab"
                          onClick={e => e.stopPropagation()}
                          style={{
                            padding: 5, borderRadius: 6, color: '#1d4ed8', display: 'inline-flex',
                            textDecoration: 'none',
                          }}>
                          <ExternalLink size={12} />
                        </a>
                      )}
                      <button
                        type="button"
                        onClick={e => { e.stopPropagation(); setDeleteTarget(doc) }}
                        disabled={busy === doc.id}
                        title="Remove"
                        style={{
                          padding: 5, background: 'none', border: 'none', borderRadius: 6,
                          cursor: 'pointer', color: '#b91c1c', display: 'inline-flex',
                        }}
                      >
                        {busy === doc.id ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Preview pane */}
          <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, background: 'var(--card-bg)' }}>
            {selected && (
              <div style={{
                padding: '10px 14px', borderBottom: '1px solid var(--card-border)',
                display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
              }}>
                <p style={{ margin: 0, flex: 1, fontSize: 14, fontWeight: 700, color: 'var(--text-1)', minWidth: 0 }}>
                  {selected.title}
                </p>
                {selected.file_url && (
                  <a href={selected.file_url} target="_blank" rel="noreferrer" style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 10px',
                    borderRadius: 7, border: '1px solid #bfdbfe', background: '#eff6ff',
                    color: '#1d4ed8', fontSize: 12, fontWeight: 700, textDecoration: 'none',
                  }}>
                    <ExternalLink size={12} /> Open
                  </a>
                )}
              </div>
            )}
            <div style={{ flex: 1, minHeight: 420 }}>
              <DocPreview doc={selected} />
            </div>
          </div>
        </div>
      )}

      {/* Mobile stack: simple CSS via media is limited in inline styles — add overflow wrap */}
      <style>{`
        @media (max-width: 800px) {
          .fixed-doc-split { grid-template-columns: 1fr !important; }
          .fixed-doc-split > div:first-child { max-height: 220px !important; border-right: none !important; border-bottom: 1px solid var(--card-border); }
        }
      `}</style>

      {uploadOpen && (
        <UploadDocModal
          asset={asset}
          onClose={() => setUploadOpen(false)}
          onSaved={async () => { await load() }}
        />
      )}

      {deleteTarget && (
        <MasterPasswordModal
          title="Delete document"
          message={`Enter the master password to permanently remove “${deleteTarget.title}” from this vault.`}
          confirmLabel="Delete document"
          onClose={() => setDeleteTarget(null)}
          onConfirm={confirmDeleteDoc}
        />
      )}
    </div>
  )
}

function tileAccent(assetType) {
  switch (assetType) {
    case 'Land': return { wash: '#ecfdf5', accent: '#059669' }
    case 'Building': return { wash: '#f0f7f4', accent: '#1e5c48' }
    case 'Vehicle': return { wash: '#fff7ed', accent: '#c2410c' }
    case 'Plant & Machinery': return { wash: '#f8fafc', accent: '#475569' }
    default: return { wash: '#f8fafc', accent: '#64748b' }
  }
}

function TileGrid({ assets, counts, onOpen }) {
  const navigate = useNavigate()

  if (assets.length === 0) {
    return (
      <div className="card" style={{ padding: '48px 24px', textAlign: 'center' }}>
        <Building2 size={32} style={{ color: 'var(--text-3)', margin: '0 auto 12px', display: 'block', opacity: 0.5 }} />
        <p style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 700, color: 'var(--text-1)' }}>No fixed assets yet</p>
        <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--text-3)' }}>
          Add tiles in Asset Settings (Land, Building, Parsonage…).
        </p>
        <button onClick={() => navigate('/assets/settings?tab=fixed-assets')} style={{
          display: 'inline-flex', alignItems: 'center', gap: 7, padding: '8px 16px',
          background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8,
          fontSize: 13, fontWeight: 600, cursor: 'pointer',
        }}>
          <Settings size={14} /> Open Settings
        </button>
      </div>
    )
  }

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill, minmax(168px, 1fr))',
      gap: 12,
    }}>
      {assets.map(a => {
        const tone = tileAccent(a.asset_type)
        const docs = counts[a.id] || 0
        return (
          <button
            key={a.id}
            type="button"
            onClick={() => onOpen(a)}
            style={{
              textAlign: 'left', padding: 0, border: '1px solid var(--card-border)',
              borderRadius: 12, background: 'var(--card-bg)', cursor: 'pointer', overflow: 'hidden',
              boxShadow: '0 1px 2px rgba(15, 23, 42, 0.04)',
              transition: 'border-color 0.15s, box-shadow 0.15s, transform 0.15s',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.borderColor = tone.accent
              e.currentTarget.style.boxShadow = '0 6px 18px rgba(15, 23, 42, 0.08)'
              e.currentTarget.style.transform = 'translateY(-1px)'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.borderColor = 'var(--card-border)'
              e.currentTarget.style.boxShadow = '0 1px 2px rgba(15, 23, 42, 0.04)'
              e.currentTarget.style.transform = 'none'
            }}
          >
            {a.cover_url ? (
              <div style={{ height: 72, overflow: 'hidden', position: 'relative' }}>
                <img src={a.cover_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                <div style={{
                  position: 'absolute', inset: 0,
                  background: 'linear-gradient(to top, rgba(15,23,42,0.35), transparent 55%)',
                }} />
              </div>
            ) : (
              <div style={{
                height: 4, background: `linear-gradient(90deg, ${tone.accent}, ${tone.accent}88)`,
              }} />
            )}

            <div style={{ padding: a.cover_url ? '10px 12px 12px' : '14px 12px 12px' }}>
              {!a.cover_url && (
                <div style={{
                  width: 34, height: 34, borderRadius: 9, marginBottom: 10,
                  background: tone.wash, color: tone.accent,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Building2 size={16} strokeWidth={2} />
                </div>
              )}
              <p style={{
                margin: 0, fontSize: 13, fontWeight: 800, color: 'var(--text-1)',
                lineHeight: 1.25, letterSpacing: '-0.01em',
              }}>
                {a.name}
              </p>
              <p style={{
                margin: '4px 0 0', fontSize: 10, color: 'var(--text-3)', fontWeight: 600,
                letterSpacing: '0.02em',
              }}>
                {[a.asset_type, a.status].filter(Boolean).join(' · ')}
              </p>
              <div style={{
                marginTop: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6,
              }}>
                <span style={{
                  fontSize: 11, fontWeight: 700, color: tone.accent,
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                }}>
                  <FileText size={11} />
                  {docs} doc{docs === 1 ? '' : 's'}
                </span>
              </div>
            </div>
          </button>
        )
      })}
    </div>
  )
}

export default function FixedAssetsVault() {
  const toast = useToast()
  const navigate = useNavigate()
  const [unlocked, setUnlocked] = useState(() => isFixedAssetsUnlocked() && !shouldAutoLockFixedAssets())
  const [assets, setAssets] = useState([])
  const [counts, setCounts] = useState({})
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState(null)

  const handleAutoLock = useCallback(() => {
    setSelected(null)
    setUnlocked(false)
    toast('Fixed Assets locked after 5 minutes of inactivity.', 'success')
  }, [toast])

  useFixedAssetsIdleLock(unlocked, handleAutoLock)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const list = await getFixedAssets(false)
      setAssets(list)
      setCounts(await countFixedAssetDocuments(list.map(a => a.id)))
    } catch (e) {
      toast(e.message, 'error')
    }
    setLoading(false)
  }, [toast])

  useEffect(() => {
    if (unlocked) load()
  }, [unlocked, load])

  if (!unlocked) {
    return <LockScreen onUnlock={() => setUnlocked(true)} />
  }

  return (
    <div>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 16, gap: 10, flexWrap: 'wrap',
      }}>
        <div>
          <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--text-1)' }}>
            {selected ? 'Documents' : 'Property tiles'}
          </p>
          <p style={{ margin: '3px 0 0', fontSize: 12, color: 'var(--text-3)' }}>
            Auto-locks after {Math.round(FIXED_ASSETS_IDLE_MS / 60000)} min idle · manage tiles in Settings
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {!selected && (
            <button onClick={() => navigate('/assets/settings?tab=fixed-assets')} style={{
              display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 12px',
              background: 'var(--card-bg)', border: '1.5px solid var(--card-border)', borderRadius: 8,
              fontSize: 12, fontWeight: 600, cursor: 'pointer', color: 'var(--text-2)',
            }}>
              <Settings size={13} /> Manage tiles
            </button>
          )}
          <button
            onClick={() => { lockFixedAssets(); setUnlocked(false); setSelected(null) }}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 12px',
              background: '#fff5f5', border: '1px solid #fca5a5', borderRadius: 8,
              fontSize: 12, fontWeight: 700, cursor: 'pointer', color: '#b91c1c',
            }}
          >
            <Lock size={13} /> Lock
          </button>
        </div>
      </div>

      {loading ? (
        <div className="card" style={{ padding: 48, textAlign: 'center', color: 'var(--text-3)' }}>
          <Loader2 size={22} className="animate-spin" style={{ display: 'block', margin: '0 auto 8px' }} />
          Loading…
        </div>
      ) : selected ? (
        <AssetDetail asset={selected} onBack={() => { setSelected(null); load() }} />
      ) : (
        <TileGrid assets={assets} counts={counts} onOpen={setSelected} />
      )}
    </div>
  )
}
