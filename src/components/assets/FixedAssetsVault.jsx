/* ═══════════════════════════════════════════════════════════════
   FixedAssetsVault — master-password gate + asset tiles + documents
   ═══════════════════════════════════════════════════════════════ */

import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Lock, Eye, EyeOff, Building2, FileText, ExternalLink, Plus, Loader2,
  X, Upload, Trash2, ArrowLeft, Settings, Link2,
} from 'lucide-react'
import { useToast } from '../../lib/toast'
import { useAuth } from '../../lib/AuthContext'
import {
  FIXED_ASSETS_MASTER_PASSWORD,
  isFixedAssetsUnlocked, unlockFixedAssets, lockFixedAssets,
  getFixedAssets, countFixedAssetDocuments,
  getFixedAssetDocuments, saveFixedAssetDocument,
  softDeleteFixedAssetDocument, formatFileSize,
} from '../../lib/fixedAssetsLib'

const INPUT = {
  height: 42, padding: '0 14px', border: '1.5px solid var(--card-border)',
  borderRadius: 10, fontSize: 14, background: 'var(--input-bg)',
  color: 'var(--text-1)', outline: 'none', boxSizing: 'border-box', width: '100%',
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
            <input
              ref={inputRef}
              type={showPw ? 'text' : 'password'}
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

function AssetDetail({ asset, onBack }) {
  const toast = useToast()
  const { profile } = useAuth()
  const [docs, setDocs] = useState([])
  const [loading, setLoading] = useState(true)
  const [uploadOpen, setUploadOpen] = useState(false)
  const [busy, setBusy] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setDocs(await getFixedAssetDocuments(asset.id))
    } catch (e) {
      toast(e.message, 'error')
    }
    setLoading(false)
  }, [asset.id, toast])

  useEffect(() => { load() }, [load])

  async function handleDelete(doc) {
    if (!confirm(`Remove “${doc.title}”?`)) return
    setBusy(doc.id)
    try {
      await softDeleteFixedAssetDocument(doc.id, profile?.full_name || profile?.email || null)
      toast('Document removed.', 'success')
      await load()
    } catch (e) {
      toast(e.message, 'error')
    }
    setBusy(null)
  }

  function fmtDate(d) {
    if (!d) return ''
    const [y, m, day] = String(d).slice(0, 10).split('-')
    return `${day}-${m}-${y}`
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 18, flexWrap: 'wrap' }}>
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
        <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--text-2)', lineHeight: 1.5 }}>{asset.description}</p>
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
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          {docs.map(doc => (
            <div key={doc.id} style={{
              display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px',
              borderBottom: '1px solid var(--card-border)',
            }}>
              <div style={{
                width: 40, height: 40, borderRadius: 10, background: '#eff6ff',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                <FileText size={18} color="#1d4ed8" />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--text-1)' }}>{doc.title}</p>
                <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--text-3)' }}>
                  {[doc.doc_type, doc.doc_date ? fmtDate(doc.doc_date) : null, formatFileSize(doc.file_size)]
                    .filter(Boolean).join(' · ')}
                </p>
              </div>
              {doc.file_url && (
                <a href={doc.file_url} target="_blank" rel="noreferrer" title="Open"
                  style={{
                    padding: '6px 8px', background: '#eff6ff', border: '1px solid #bfdbfe',
                    borderRadius: 6, color: '#1d4ed8', display: 'inline-flex', textDecoration: 'none',
                  }}>
                  <ExternalLink size={13} />
                </a>
              )}
              <button onClick={() => handleDelete(doc)} disabled={busy === doc.id} title="Remove"
                style={{
                  padding: '6px 8px', background: '#fff5f5', border: '1px solid #fca5a5',
                  borderRadius: 6, cursor: 'pointer', color: '#b91c1c', display: 'inline-flex',
                }}>
                {busy === doc.id ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
              </button>
            </div>
          ))}
        </div>
      )}

      {uploadOpen && (
        <UploadDocModal asset={asset} onClose={() => setUploadOpen(false)} onSaved={load} />
      )}
    </div>
  )
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
      gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
      gap: 14,
    }}>
      {assets.map(a => (
        <button
          key={a.id}
          type="button"
          onClick={() => onOpen(a)}
          style={{
            textAlign: 'left', padding: 0, border: '1px solid var(--card-border)',
            borderRadius: 14, background: 'var(--card-bg)', cursor: 'pointer', overflow: 'hidden',
            boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
          }}
        >
          <div style={{
            height: 120, background: 'linear-gradient(145deg, #e2e8f0 0%, #f8fafc 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
          }}>
            {a.cover_url
              ? <img src={a.cover_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : <Building2 size={36} style={{ color: '#94a3b8' }} />}
          </div>
          <div style={{ padding: '12px 14px 14px' }}>
            <p style={{ margin: 0, fontSize: 14, fontWeight: 800, color: 'var(--text-1)', lineHeight: 1.3 }}>{a.name}</p>
            <p style={{ margin: '4px 0 0', fontSize: 11, color: 'var(--text-3)', fontWeight: 600 }}>
              {[a.asset_type, a.status].filter(Boolean).join(' · ')}
            </p>
            <p style={{
              margin: '10px 0 0', fontSize: 12, fontWeight: 700, color: 'var(--accent)',
              display: 'flex', alignItems: 'center', gap: 5,
            }}>
              <FileText size={12} />
              {counts[a.id] || 0} document{(counts[a.id] || 0) === 1 ? '' : 's'}
            </p>
          </div>
        </button>
      ))}
    </div>
  )
}

export default function FixedAssetsVault() {
  const toast = useToast()
  const navigate = useNavigate()
  const [unlocked, setUnlocked] = useState(() => isFixedAssetsUnlocked())
  const [assets, setAssets] = useState([])
  const [counts, setCounts] = useState({})
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState(null)

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
            Manage tiles in Settings · documents stay inside each tile
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
