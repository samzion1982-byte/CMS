import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import {
  Printer, Settings, Loader2, FileText, Award, Mail, ClipboardList,
  CheckCircle2, AlertCircle, Save, Download, Upload,
  Pencil, Trash2, Search,
} from 'lucide-react'
import PageHeader from '../components/ui/PageHeader'
import { useToast } from '../lib/toast'
import {
  getPrintCornerCatalog,
  pingPrintCorner,
  convertTemplateFromStorage,
  convertBulkLettersToPdf,
  downloadPrintCornerTracker,
  parsePrintCornerTrackerFile,
  TEMPLATE_TYPES,
  getSharedDrafts,
  saveDraft,
  deleteDraft,
  getChurchForPrintCorner,
  defaultFieldValuesFromTemplate,
  textFieldVariables,
  imageFieldVariables,
} from '../lib/printCornerLib'

const TYPE_ICONS = {
  certificate: Award,
  letter: Mail,
  form: ClipboardList,
}

const STEPS = [
  { id: 1, label: 'Template' },
  { id: 2, label: 'Fields' },
  { id: 3, label: 'Review' },
]

const INPUT = {
  height: 36, padding: '0 10px', border: '1.5px solid var(--card-border)',
  borderRadius: 7, fontSize: 13, background: 'var(--input-bg)', color: 'var(--text-1)',
  outline: 'none', boxSizing: 'border-box', width: '100%',
}

function groupTemplates(categories, templates) {
  const byCat = new Map()
  for (const c of categories) {
    if (!c.parent_id) byCat.set(c.id, { category: c, templates: [] })
  }
  const orphans = []
  for (const t of templates) {
    const bucket = byCat.get(t.category_id)
    if (bucket) bucket.templates.push(t)
    else orphans.push(t)
  }
  const groups = [...byCat.values()]
    .filter(g => g.templates.length > 0)
    .sort((a, b) => a.category.sort_order - b.category.sort_order)
  if (orphans.length) {
    groups.push({
      category: { id: '__unassigned', name: 'Unassigned', sort_order: 9999 },
      templates: orphans,
    })
  }
  return groups
}

function templateStorageType(templateType) {
  if (templateType === 'form') return 'forms'
  if (templateType === 'certificate') return 'certificates'
  return 'letters'
}

/** Soft tint per category name (falls back by index). */
function categoryHeaderStyle(name, index = 0) {
  const n = String(name || '').toLowerCase()
  if (n.includes('letter')) {
    return { bg: '#eff6ff', accent: '#2563eb', badgeBg: '#dbeafe', badgeColor: '#1d4ed8' }
  }
  if (n.includes('cert')) {
    return { bg: '#fffbeb', accent: '#d97706', badgeBg: '#fde68a', badgeColor: '#b45309' }
  }
  if (n.includes('form') || n.includes('application')) {
    return { bg: '#f5f3ff', accent: '#7c3aed', badgeBg: '#ede9fe', badgeColor: '#6d28d9' }
  }
  const fallback = [
    { bg: '#f0fdf4', accent: '#16a34a', badgeBg: '#bbf7d0', badgeColor: '#15803d' },
    { bg: '#fdf2f8', accent: '#db2777', badgeBg: '#fbcfe8', badgeColor: '#be185d' },
    { bg: '#ecfeff', accent: '#0891b2', badgeBg: '#a5f3fc', badgeColor: '#0e7490' },
    { bg: '#f8fafc', accent: '#475569', badgeBg: '#e2e8f0', badgeColor: '#334155' },
  ]
  return fallback[index % fallback.length]
}

export default function PrintCornerPage() {
  const navigate = useNavigate()
  const toast = useToast()
  const { profile } = useAuth()
  const trackerInputRef = useRef(null)

  const [loading, setLoading] = useState(true)
  const [groups, setGroups] = useState([])
  const [selected, setSelected] = useState(null)
  const [ping, setPing] = useState(null)
  const [busy, setBusy] = useState(false)
  const [lastPdf, setLastPdf] = useState(null)
  const [bulkProgress, setBulkProgress] = useState(null)

  const [step, setStep] = useState(1)
  const [church, setChurch] = useState(null)
  const [fieldValues, setFieldValues] = useState({})
  const [includeTamil, setIncludeTamil] = useState(false)
  const [draftId, setDraftId] = useState(null)
  const [drafts, setDrafts] = useState([])
  const [bulkRows, setBulkRows] = useState([])
  const [bulkOutput, setBulkOutput] = useState('single') // 'single' | 'zip'
  const [tplSearch, setTplSearch] = useState('')
  const [activeCategoryId, setActiveCategoryId] = useState(null)
  const catsSeededRef = useRef(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [{ categories, templates }, churchRow, draftRows] = await Promise.all([
        getPrintCornerCatalog(),
        getChurchForPrintCorner(),
        getSharedDrafts(30),
      ])
      const top = categories.filter(c => !c.parent_id)
      setGroups(groupTemplates(top, templates))
      setChurch(churchRow)
      setDrafts(draftRows)
      try {
        const p = await pingPrintCorner()
        setPing(p)
      } catch (e) {
        setPing({ ok: false, error: e.message })
      }
    } catch (e) {
      toast(e.message || 'Could not load Print Corner', 'error')
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (!selected) return
    setStep(1)
    setDraftId(null)
    setBulkRows([])
    setLastPdf(null)
    setBulkProgress(null)
    setIncludeTamil(!!selected.include_tamil)
    setFieldValues(defaultFieldValuesFromTemplate(selected, church, null))
    if (selected.category_id) setActiveCategoryId(selected.category_id)
  }, [selected?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // First load: select first category
  useEffect(() => {
    if (!groups.length || catsSeededRef.current) return
    catsSeededRef.current = true
    setActiveCategoryId(groups[0].category.id)
  }, [groups])

  const filteredGroups = useMemo(() => {
    const q = tplSearch.trim().toLowerCase()
    if (!q) return groups
    return groups
      .map(g => ({
        ...g,
        templates: g.templates.filter(t =>
          (t.label || '').toLowerCase().includes(q)
          || (t.template_key || '').toLowerCase().includes(q)
          || (t.description || '').toLowerCase().includes(q),
        ),
      }))
      .filter(g => g.templates.length > 0)
  }, [groups, tplSearch])

  const activeGroup = useMemo(() => {
    if (tplSearch.trim()) return null
    return filteredGroups.find(g => g.category.id === activeCategoryId) || filteredGroups[0] || null
  }, [filteredGroups, activeCategoryId, tplSearch])

  const sidebarTemplates = useMemo(() => {
    if (tplSearch.trim()) return filteredGroups.flatMap(g => g.templates.map(t => ({ t, catName: g.category.name })))
    if (!activeGroup) return []
    return activeGroup.templates.map(t => ({ t, catName: activeGroup.category.name }))
  }, [filteredGroups, activeGroup, tplSearch])

  const activeCatStyle = useMemo(() => {
    const idx = filteredGroups.findIndex(g => g.category.id === (activeGroup?.category.id))
    return categoryHeaderStyle(activeGroup?.category?.name, Math.max(0, idx))
  }, [filteredGroups, activeGroup])

  const selectedMeta = useMemo(() => {
    if (!selected) return null
    return TEMPLATE_TYPES[selected.template_type] || TEMPLATE_TYPES.letter
  }, [selected])

  const variables = useMemo(
    () => textFieldVariables(selected?.variables),
    [selected],
  )

  const imageVariables = useMemo(
    () => imageFieldVariables(selected?.variables),
    [selected],
  )

  const bulkMode = bulkRows.length > 0

  /** Drafts for letters/forms only (certificates skip shared drafts). */
  const visibleDrafts = useMemo(() => {
    if (!selected || selected.template_type === 'certificate') return []
    const keysOfType = new Set(
      groups
        .flatMap(g => g.templates)
        .filter(t => t.template_type === selected.template_type)
        .map(t => t.template_key),
    )
    return drafts.filter(d =>
      d.template_id === selected.id
      || d.template_key === selected.template_key
      || keysOfType.has(d.template_key),
    )
  }, [drafts, selected, groups])

  function clearBulk() {
    setBulkRows([])
    setBulkProgress(null)
    setBulkOutput('single')
  }

  async function handleSaveDraft() {
    if (!selected) return
    setBusy(true)
    try {
      const row = await saveDraft({
        id: draftId || undefined,
        template_id: selected.id,
        template_key: selected.template_key,
        member_id: fieldValues.member_id || null,
        status: 'draft',
        wizard_step: step,
        field_values: fieldValues,
        include_tamil: includeTamil,
        created_by: profile?.id,
        created_by_email: profile?.email,
      })
      setDraftId(row.id)
      setDrafts(await getSharedDrafts(30))
      toast('Draft saved — visible to all Print Corner users.', 'success')
    } catch (e) {
      toast(e.message || 'Could not save draft', 'error')
    } finally {
      setBusy(false)
    }
  }

  function loadDraft(d) {
    const tpl = groups.flatMap(g => g.templates).find(t => t.id === d.template_id || t.template_key === d.template_key)
    if (tpl) setSelected(tpl)
    setDraftId(d.id)
    setFieldValues(d.field_values || {})
    setIncludeTamil(!!d.include_tamil)
    setBulkRows([])
    setStep(2)
    toast('Draft loaded — edit fields, then Review.', 'info')
  }

  async function handleDeleteDraft(d) {
    if (!window.confirm(`Delete shared draft for “${d.template_key}”?`)) return
    setBusy(true)
    try {
      await deleteDraft(d.id)
      if (draftId === d.id) setDraftId(null)
      setDrafts(await getSharedDrafts(30))
      toast('Draft deleted.', 'success')
    } catch (e) {
      toast(e.message || 'Could not delete draft', 'error')
    } finally {
      setBusy(false)
    }
  }

  function pdfErrorToast(raw) {
      if (/expired or revoked|invalid_grant|Google Drive not connected/i.test(raw)) {
      toast(
        'Google Drive login expired. Open Backup → Disconnect Google → Connect Google again, then retry.',
        'error',
      )
    } else {
      toast(raw, 'error')
    }
  }

  async function handleIssuePdf() {
    if (!selected?.storage_path) {
      toast('Upload a template file in Print Corner Settings first.', 'error')
      return
    }
    setBusy(true)
    try {
      const res = await convertTemplateFromStorage({
        storagePath: selected.storage_path,
        templateKey: selected.template_key,
        templateType: templateStorageType(selected.template_type),
        memberId: fieldValues.member_id || null,
        fieldValues,
        issue: true,
        source: 'manual',
      })
      setLastPdf(res)
      toast('PDF created and saved to issued folder.', 'success')
    } catch (e) {
      pdfErrorToast(e.message || 'Convert failed')
    } finally {
      setBusy(false)
    }
  }

  async function handleMultiPdf() {
    if (!selected?.storage_path) {
      toast('Upload a template file in Print Corner Settings first.', 'error')
      return
    }
    if (!bulkRows.length) {
      toast('Upload a filled tracker first.', 'error')
      return
    }

    setBusy(true)
    setBulkProgress({ current: 0, total: bulkRows.length, label: '' })
    try {
      const { count, fileName, pageCount, output } = await convertBulkLettersToPdf({
        storagePath: selected.storage_path,
        templateKey: selected.template_key,
        templateType: templateStorageType(selected.template_type),
        rows: bulkRows,
        onProgress: setBulkProgress,
        output: bulkOutput === 'zip' ? 'zip' : 'single',
      })
      if (output === 'zip') {
        toast(`${count} PDF(s) downloaded in ${fileName}`, 'success')
      } else {
        toast(`${count} document(s) → ${pageCount} page PDF — downloaded ${fileName}`, 'success')
      }
    } catch (e) {
      pdfErrorToast(e.message || 'Bulk convert failed')
    } finally {
      setBusy(false)
      setBulkProgress(null)
    }
  }

  async function handleDownloadTracker() {
    if (!selected || !variables.length) {
      toast('No variables on this template.', 'error')
      return
    }
    try {
      await downloadPrintCornerTracker({
        templateKey: selected.template_key,
        variables,
        fieldValues,
      })
      toast('Tracker downloaded.', 'success')
    } catch (e) {
      toast(e.message || 'Could not download tracker', 'error')
    }
  }

  async function handleTrackerFile(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !selected) return
    setBusy(true)
    try {
      const rows = await parsePrintCornerTrackerFile(file, variables)
      setBulkRows(rows)
      toast(`${rows.length} row(s) loaded from tracker — use Multi PDF to generate.`, 'success')
    } catch (err) {
      toast(err.message || 'Could not read tracker', 'error')
    } finally {
      setBusy(false)
    }
  }

  function renderStepContent() {
    if (!selected) {
      return (
        <div style={{ color: 'var(--text-3)', fontSize: 14, padding: '40px 0', textAlign: 'center' }}>
          Select a template from the left panel.
        </div>
      )
    }

    if (step === 2) {
      return (
        <div>
          {selected.include_tamil && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, marginBottom: 14 }}>
              <input type="checkbox" checked={includeTamil} onChange={e => setIncludeTamil(e.target.checked)} />
              Include Tamil text block
            </label>
          )}
          {variables.length === 0 && imageVariables.length === 0 ? (
            <p style={{ fontSize: 13, color: 'var(--text-3)', marginBottom: 12 }}>
              No variables on this template yet. Upload a Word file with {'{placeholders}'} in Print Corner Settings.
            </p>
          ) : null}
          {imageVariables.length > 0 && (
            <div style={{
              marginBottom: 14, padding: '10px 12px', borderRadius: 8, fontSize: 12, lineHeight: 1.5,
              background: '#f5f3ff', border: '1px solid #ddd6fe', color: '#5b21b6',
            }}>
              Signature images (auto from Church Setup):{' '}
              {imageVariables.map(v => `{${v.key}}`).join(', ')}
            </div>
          )}
          <div style={{ display: 'grid', gap: 10, marginBottom: 16 }}>
            {variables.map(v => (
              <label key={v.key} style={{ fontSize: 12, fontWeight: 600 }}>
                {v.label || v.key}
                <input
                  value={fieldValues[v.key] ?? ''}
                  onChange={e => {
                    clearBulk()
                    setFieldValues(f => ({ ...f, [v.key]: e.target.value }))
                  }}
                  style={{ ...INPUT, marginTop: 4, fontWeight: 400 }}
                />
              </label>
            ))}
          </div>
          <button type="button" onClick={() => setStep(3)} style={{ padding: '8px 16px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
            Review →
          </button>
        </div>
      )
    }

    if (step === 3) {
      const showDrafts = selected.template_type !== 'certificate'
      return (
        <div>
          {showDrafts && (
          <div style={{ marginBottom: 20, padding: 14, borderRadius: 10, background: 'var(--input-bg)', border: '1px solid var(--card-border)' }}>
            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>Shared drafts</div>
            {visibleDrafts.length === 0 ? (
              <p style={{ fontSize: 12, color: 'var(--text-3)', margin: 0 }}>
                No drafts for this type yet.
              </p>
            ) : (
              <div style={{ maxHeight: 180, overflow: 'auto' }}>
                {visibleDrafts.map(d => (
                  <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0', borderBottom: '1px solid var(--card-border)', fontSize: 13 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <strong>{d.template_key}</strong>
                      <span style={{ color: 'var(--text-3)' }}>
                        {' '}· {d.field_values?.member_name || d.member_id || 'blank'} · {new Date(d.updated_at).toLocaleString()}
                      </span>
                    </div>
                    <button type="button" disabled={busy} onClick={() => loadDraft(d)} title="Edit draft"
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 8px', background: '#dbeafe', color: '#2563eb', border: 'none', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                      <Pencil size={11} /> Edit
                    </button>
                    <button type="button" disabled={busy} onClick={() => handleDeleteDraft(d)} title="Delete draft"
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 8px', background: '#fee2e2', color: '#b91c1c', border: 'none', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                      <Trash2 size={11} /> Delete
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
          )}

          <div style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 16, lineHeight: 1.6 }}>
            <div><strong>Template:</strong> {selected.label}</div>
            {includeTamil && <div><strong>Tamil:</strong> Yes</div>}
            {bulkMode && (
              <div style={{ marginTop: 8, padding: '10px 12px', borderRadius: 8, background: '#eff6ff', border: '1px solid #bfdbfe' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <span style={{ fontSize: 12, color: '#1d4ed8', fontWeight: 600 }}>
                    Bulk mode: {bulkRows.length} row(s) loaded from tracker
                  </span>
                  <button type="button" onClick={clearBulk} style={{ fontSize: 11, color: '#dc2626', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700 }}>
                    Clear
                  </button>
                </div>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#1e3a8a', marginBottom: 8 }}>Download as</div>
                <div style={{ display: 'grid', gap: 6 }}>
                  <label style={{
                    display: 'flex', alignItems: 'flex-start', gap: 8, padding: '8px 10px', borderRadius: 7,
                    background: bulkOutput === 'single' ? '#fff' : 'transparent',
                    border: bulkOutput === 'single' ? '1.5px solid #2563eb' : '1px solid #bfdbfe',
                    cursor: 'pointer', fontSize: 12, color: '#1e3a8a',
                  }}>
                    <input
                      type="radio"
                      name="bulkOutput"
                      checked={bulkOutput === 'single'}
                      onChange={() => setBulkOutput('single')}
                      style={{ marginTop: 2 }}
                    />
                    <span>
                      <strong>One multi-page PDF</strong>
                      <span style={{ display: 'block', color: '#64748b', marginTop: 2 }}>All copies combined in a single file</span>
                    </span>
                  </label>
                  <label style={{
                    display: 'flex', alignItems: 'flex-start', gap: 8, padding: '8px 10px', borderRadius: 7,
                    background: bulkOutput === 'zip' ? '#fff' : 'transparent',
                    border: bulkOutput === 'zip' ? '1.5px solid #2563eb' : '1px solid #bfdbfe',
                    cursor: 'pointer', fontSize: 12, color: '#1e3a8a',
                  }}>
                    <input
                      type="radio"
                      name="bulkOutput"
                      checked={bulkOutput === 'zip'}
                      onChange={() => setBulkOutput('zip')}
                      style={{ marginTop: 2 }}
                    />
                    <span>
                      <strong>Separate PDFs in a ZIP</strong>
                      <span style={{ display: 'block', color: '#64748b', marginTop: 2 }}>One PDF per row, packed in a ZIP archive</span>
                    </span>
                  </label>
                </div>
              </div>
            )}
          </div>

          {!bulkMode && (
            <div style={{ padding: 12, borderRadius: 8, background: 'var(--input-bg)', border: '1px solid var(--card-border)', marginBottom: 16, maxHeight: 200, overflow: 'auto', fontSize: 12 }}>
              {Object.entries(fieldValues).filter(([, val]) => val).map(([k, val]) => (
                <div key={k} style={{ marginBottom: 4 }}><strong>{k}:</strong> {val}</div>
              ))}
            </div>
          )}

          {(selected.template_type === 'letter' || selected.template_type === 'form' || selected.template_type === 'certificate') && (
            <div style={{ marginBottom: 16, padding: 14, borderRadius: 8, border: '1px dashed var(--card-border)', background: 'var(--card-bg)' }}>
              <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8, color: 'var(--text-2)' }}>Bulk print (tracker)</div>
              <p style={{ fontSize: 12, color: 'var(--text-3)', margin: '0 0 12px', lineHeight: 1.5 }}>
                For multiple copies: download the tracker, fill rows, upload it, then use Multi PDF
                (one combined multi-page PDF). For a single copy, use Issue PDF.
              </p>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <button type="button" disabled={busy || !variables.length} onClick={handleDownloadTracker}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', background: 'var(--card-bg)', border: '1.5px solid var(--card-border)', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                  <Download size={14} /> Download tracker
                </button>
                <button type="button" disabled={busy} onClick={() => trackerInputRef.current?.click()}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', background: 'var(--card-bg)', border: '1.5px solid var(--card-border)', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                  <Upload size={14} /> Upload tracker
                </button>
                <input ref={trackerInputRef} type="file" accept=".xlsx,.xls" onChange={handleTrackerFile} style={{ display: 'none' }} />
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            {showDrafts && (
            <button type="button" disabled={busy} onClick={handleSaveDraft}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 16px', background: 'var(--card-bg)', border: '1.5px solid var(--card-border)', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
              <Save size={14} /> Save shared draft
            </button>
            )}
            {selected.template_type === 'letter' || selected.template_type === 'form' || selected.template_type === 'certificate' ? (
              bulkMode ? (
                <button type="button" disabled={busy || !selected.storage_path} onClick={handleMultiPdf}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '9px 16px', background: '#7c3aed', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: busy ? 'wait' : 'pointer', opacity: !selected.storage_path ? 0.5 : 1 }}>
                  {busy ? <Loader2 size={14} className="animate-spin" /> : <Printer size={14} />}
                  Multi PDF
                </button>
              ) : (
                <button type="button" disabled={busy || !selected.storage_path} onClick={handleIssuePdf}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '9px 16px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: busy ? 'wait' : 'pointer', opacity: !selected.storage_path ? 0.5 : 1 }}>
                  {busy ? <Loader2 size={14} className="animate-spin" /> : <Printer size={14} />}
                  Issue PDF
                </button>
              )
            ) : (
              <span style={{ fontSize: 12, color: 'var(--text-3)', alignSelf: 'center' }}>Unsupported template type</span>
            )}
          </div>

          {bulkProgress && (
            <div style={{ marginTop: 12, fontSize: 12, color: 'var(--text-2)' }}>
              Generating PDF {bulkProgress.current} of {bulkProgress.total}
              {bulkProgress.label ? ` — ${bulkProgress.label}` : ''}
            </div>
          )}

          {lastPdf?.signed_url && !bulkMode && (
            <div style={{ marginTop: 16, padding: 14, borderRadius: 8, background: 'var(--input-bg)', border: '1px solid var(--card-border)' }}>
              <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>Last issued PDF</div>
              <a href={lastPdf.signed_url} target="_blank" rel="noreferrer" style={{ fontSize: 13, fontWeight: 600, color: '#2563eb' }}>Open PDF</a>
            </div>
          )}
        </div>
      )
    }

    // step 1 — template summary
    return (
      <>
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-1)' }}>{selected.label}</div>
          <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 4 }}>
            {selectedMeta?.label} · {selected.template_key}
          </div>
          {selected.description && (
            <p style={{ fontSize: 13, color: 'var(--text-2)', marginTop: 8 }}>{selected.description}</p>
          )}
        </div>
        <div style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 16 }}>
          <strong>Storage path:</strong>{' '}
          {selected.storage_path || (
            <span style={{ color: '#c2410c' }}>Not uploaded — use Print Corner Settings</span>
          )}
        </div>
        <button type="button" onClick={() => setStep(2)}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '9px 16px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
          Fill fields →
        </button>
      </>
    )
  }

  return (
    <div className="page-container">
      <PageHeader icon={Printer} title="Print Corner" subtitle="Certificates, letters, and forms">
        <button type="button" onClick={() => navigate('/print-corner/settings')} title="Print Corner Settings"
          style={{ padding: '8px 10px', background: 'var(--card-bg)', border: '1.5px solid var(--card-border)', borderRadius: 8, cursor: 'pointer', display: 'flex', alignItems: 'center', color: 'var(--text-2)' }}>
          <Settings size={15} />
        </button>
      </PageHeader>

      <div style={{ display: 'flex', gap: 16, alignItems: 'stretch', minHeight: 480 }}>
        <aside style={{
          width: 340, flexShrink: 0, maxWidth: '100%',
          background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: 10,
          display: 'flex', flexDirection: 'column', maxHeight: 'calc(100vh - 160px)', overflow: 'hidden',
        }}>
          <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--card-border)', flexShrink: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.08em', color: 'var(--text-3)', marginBottom: 10 }}>
              TEMPLATES
            </div>
            <div style={{ position: 'relative', marginBottom: 10 }}>
              <Search size={14} style={{ position: 'absolute', left: 10, top: 10, color: 'var(--text-3)' }} />
              <input
                value={tplSearch}
                onChange={e => setTplSearch(e.target.value)}
                placeholder="Search templates…"
                style={{ ...INPUT, height: 34, paddingLeft: 32, fontSize: 12 }}
              />
            </div>
            {!tplSearch.trim() && filteredGroups.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {filteredGroups.map((g, gi) => {
                  const catStyle = categoryHeaderStyle(g.category.name, gi)
                  const on = activeGroup?.category.id === g.category.id
                  return (
                    <button
                      key={g.category.id}
                      type="button"
                      onClick={() => setActiveCategoryId(g.category.id)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                        padding: '8px 10px', border: 'none', cursor: 'pointer', textAlign: 'left',
                        borderRadius: 8,
                        background: on ? catStyle.bg : 'transparent',
                        borderLeft: `3px solid ${on ? catStyle.accent : 'transparent'}`,
                      }}
                    >
                      <span style={{ flex: 1, fontSize: 12, fontWeight: on ? 800 : 600, color: on ? catStyle.accent : 'var(--text-2)' }}>
                        {g.category.name}
                      </span>
                      <span style={{
                        fontSize: 10, fontWeight: 700, minWidth: 20, textAlign: 'center',
                        padding: '2px 7px', borderRadius: 99,
                        background: on ? catStyle.badgeBg : 'var(--input-bg)',
                        color: on ? catStyle.badgeColor : 'var(--text-3)',
                      }}>
                        {g.templates.length}
                      </span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
            {loading ? (
              <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-3)' }}>
                <Loader2 size={20} className="animate-spin" />
              </div>
            ) : sidebarTemplates.length === 0 ? (
              <div style={{ padding: 20, fontSize: 12, color: 'var(--text-3)' }}>
                {tplSearch.trim() ? 'No templates match your search.' : 'No templates in this category.'}
              </div>
            ) : (
              <div style={{ background: 'var(--card-bg)' }}>
                {!tplSearch.trim() && activeGroup && (
                  <div style={{
                    padding: '8px 14px', fontSize: 11, fontWeight: 700,
                    color: activeCatStyle.accent, background: activeCatStyle.bg,
                    borderBottom: `1px solid ${activeCatStyle.badgeBg}`,
                  }}>
                    {activeGroup.category.name}
                  </div>
                )}
                {sidebarTemplates.map(({ t, catName }) => {
                  const Icon = TYPE_ICONS[t.template_type] || FileText
                  const active = selected?.id === t.id
                  const accent = TEMPLATE_TYPES[t.template_type]?.color || activeCatStyle.accent
                  return (
                    <button key={t.id} type="button" onClick={() => setSelected(t)}
                      style={{
                        display: 'flex', alignItems: 'flex-start', gap: 10, width: '100%',
                        padding: '10px 14px', border: 'none', textAlign: 'left', cursor: 'pointer',
                        background: active ? 'var(--accent-subtle, #eff6ff)' : 'transparent',
                        borderLeft: active ? `3px solid ${accent}` : '3px solid transparent',
                        color: 'var(--text-1)',
                      }}>
                      <Icon size={15} style={{ color: accent, flexShrink: 0, marginTop: 2 }} />
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ display: 'block', fontSize: 13, fontWeight: active ? 700 : 600, lineHeight: 1.35 }}>
                          {t.label}
                        </span>
                        {tplSearch.trim() ? (
                          <span style={{ display: 'block', fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>
                            {catName}
                          </span>
                        ) : t.description ? (
                          <span style={{
                            display: 'block', fontSize: 11, color: 'var(--text-3)', marginTop: 2,
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          }}>
                            {t.description}
                          </span>
                        ) : null}
                      </span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </aside>

        <main style={{ flex: 1, minWidth: 0, background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: 10, padding: 20 }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, padding: '10px 12px',
            borderRadius: 8,
            background: (ping?.ready || ping?.google_drive) ? '#f0fdf4' : '#fef2f2',
            border: `1px solid ${(ping?.ready || ping?.google_drive) ? '#bbf7d0' : '#fecaca'}`,
            fontSize: 13,
          }}>
            {(ping?.ready || ping?.google_drive)
              ? <CheckCircle2 size={16} style={{ color: '#16a34a' }} />
              : <AlertCircle size={16} style={{ color: '#dc2626' }} />}
            <span>
              {(ping?.ready || ping?.google_drive)
                ? `PDF ready via Google Drive${ping.google_email ? ` (${ping.google_email})` : ''}`
                : ping?.error || 'Connect Google on Backup page for Issue PDF'}
            </span>
          </div>

          {selected && (
            <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
              {STEPS.map(s => (
                <button key={s.id} type="button" onClick={() => setStep(s.id)}
                  style={{
                    padding: '6px 12px', borderRadius: 99, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                    border: step === s.id ? 'none' : '1px solid var(--card-border)',
                    background: step === s.id ? 'var(--accent)' : 'var(--card-bg)',
                    color: step === s.id ? '#fff' : 'var(--text-2)',
                  }}>
                  {s.id}. {s.label}
                </button>
              ))}
            </div>
          )}

          {renderStepContent()}
        </main>
      </div>
    </div>
  )
}
