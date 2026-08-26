import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import {
  Printer, Settings, Loader2, FileText, Award, Mail, ClipboardList,
  CheckCircle2, AlertCircle, Save, Download, Upload,
  Pencil, Trash2, Search, MessageCircle, X,
} from 'lucide-react'
import PageHeader from '../components/ui/PageHeader'
import { useToast } from '../lib/toast'
import { sendWhatsAppMessage } from '../lib/whatsapp'
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
  applyMemberToFieldValues,
  searchPrintCornerMembers,
  getPrintCornerMemberById,
  memberPhotoExistsInStorage,
  getPrintCornerApplicationForms,
  getApplicationFormSignedUrl,
  previewPrintCornerTemplate,
  wizardTextVariables,
  imageFieldVariables,
  templateHasMemberPhoto,
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
    return { bg: '#eff6ff', accent: '#2563eb', badgeBg: '#dbeafe', badgeColor: '#1d4ed8', Icon: Mail }
  }
  if (n.includes('cert')) {
    return { bg: '#fffbeb', accent: '#d97706', badgeBg: '#fde68a', badgeColor: '#b45309', Icon: Award }
  }
  if (n.includes('form') || n.includes('application')) {
    return { bg: '#f5f3ff', accent: '#7c3aed', badgeBg: '#ede9fe', badgeColor: '#6d28d9', Icon: ClipboardList }
  }
  const fallback = [
    { bg: '#f0fdf4', accent: '#16a34a', badgeBg: '#bbf7d0', badgeColor: '#15803d', Icon: FileText },
    { bg: '#fdf2f8', accent: '#db2777', badgeBg: '#fbcfe8', badgeColor: '#be185d', Icon: FileText },
    { bg: '#ecfeff', accent: '#0891b2', badgeBg: '#a5f3fc', badgeColor: '#0e7490', Icon: FileText },
    { bg: '#f8fafc', accent: '#475569', badgeBg: '#e2e8f0', badgeColor: '#334155', Icon: FileText },
  ]
  return fallback[index % fallback.length]
}

const FORMS_STYLE = { bg: '#f5f3ff', accent: '#7c3aed', badgeBg: '#ede9fe', badgeColor: '#6d28d9' }

export default function PrintCornerPage() {
  const navigate = useNavigate()
  const toast = useToast()
  const { profile } = useAuth()
  const trackerInputRef = useRef(null)

  const [loading, setLoading] = useState(true)
  const [groups, setGroups] = useState([])
  const [blankForms, setBlankForms] = useState([])
  const [selected, setSelected] = useState(null)
  const [selectedBlankForm, setSelectedBlankForm] = useState(null)
  const [sidebarMode, setSidebarMode] = useState('forms') // 'forms' | 'templates'
  const [ping, setPing] = useState(null)
  const [busy, setBusy] = useState(false)
  const [lastPdf, setLastPdf] = useState(null)
  const [bulkProgress, setBulkProgress] = useState(null)
  const [blankShareUrl, setBlankShareUrl] = useState(null)
  const [tplPreviewUrl, setTplPreviewUrl] = useState(null)
  const [tplPreviewLoading, setTplPreviewLoading] = useState(false)
  const [tplPreviewError, setTplPreviewError] = useState(null)
  const [tplPreviewCached, setTplPreviewCached] = useState(false)
  const [tplPreviewTick, setTplPreviewTick] = useState(0)
  const [tplPreviewForce, setTplPreviewForce] = useState(false)

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

  // Member (blank forms share / letter autofill)
  const [memberQuery, setMemberQuery] = useState('')
  const [memberHits, setMemberHits] = useState([])
  const [memberSearching, setMemberSearching] = useState(false)
  const [selectedMember, setSelectedMember] = useState(null)
  const [sharePhone, setSharePhone] = useState('')
  const [shareEmail, setShareEmail] = useState('')
  const [sharing, setSharing] = useState(false)
  const memberSearchTimer = useRef(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [{ categories, templates }, churchRow, draftRows, appForms] = await Promise.all([
        getPrintCornerCatalog(),
        getChurchForPrintCorner(),
        getSharedDrafts(30),
        getPrintCornerApplicationForms(true).catch(() => []),
      ])
      const top = categories.filter(c => !c.parent_id)
      // Mail-merge catalog only — blank scanned forms live in application_forms
      setGroups(groupTemplates(top, templates.filter(t => t.template_type !== 'form')))
      setBlankForms(appForms)
      setChurch(churchRow)
      setDrafts(draftRows)
      if (appForms.length && !catsSeededRef.current) setSidebarMode('forms')
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
    setSelectedBlankForm(null)
    setBlankShareUrl(null)
    setTplPreviewUrl(null)
    setTplPreviewError(null)
    setTplPreviewCached(false)
    setTplPreviewForce(false)
    setStep(1)
    setDraftId(null)
    setBulkRows([])
    setLastPdf(null)
    setBulkProgress(null)
    setIncludeTamil(!!selected.include_tamil)
    setSelectedMember(null)
    setMemberQuery('')
    setMemberHits([])
    setSharePhone('')
    setShareEmail('')
    setFieldValues(defaultFieldValuesFromTemplate(selected, church, null))
    if (selected.category_id) setActiveCategoryId(selected.category_id)
  }, [selected?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Letter / certificate PDF preview — uses cached preview.pdf when available
  useEffect(() => {
    if (sidebarMode === 'forms' || !selected?.storage_path) {
      setTplPreviewUrl(null)
      setTplPreviewLoading(false)
      setTplPreviewError(null)
      setTplPreviewCached(false)
      return
    }
    let cancelled = false
    const force = tplPreviewForce
    setTplPreviewLoading(true)
    setTplPreviewError(null)
    if (force) setTplPreviewUrl(null)
    ;(async () => {
      try {
        const res = await previewPrintCornerTemplate(selected, church, { force })
        if (!cancelled) {
          setTplPreviewUrl(res.signed_url || null)
          setTplPreviewCached(!!res.cached)
        }
      } catch (e) {
        if (!cancelled) setTplPreviewError(e.message || 'Preview failed')
      } finally {
        if (!cancelled) {
          setTplPreviewLoading(false)
          setTplPreviewForce(false)
        }
      }
    })()
    return () => { cancelled = true }
  }, [selected?.id, selected?.storage_path, sidebarMode, tplPreviewTick]) // eslint-disable-line react-hooks/exhaustive-deps

  function refreshTplPreview() {
    setTplPreviewForce(true)
    setTplPreviewTick(t => t + 1)
  }

  useEffect(() => {
    if (!selectedBlankForm) {
      setBlankShareUrl(null)
      return
    }
    setSelected(null)
    setSelectedMember(null)
    setMemberQuery('')
    setMemberHits([])
    setSharePhone('')
    setShareEmail('')
    setBlankShareUrl(null)
    let cancelled = false
    ;(async () => {
      if (!selectedBlankForm.storage_path) return
      try {
        const url = await getApplicationFormSignedUrl(selectedBlankForm.storage_path)
        if (!cancelled) setBlankShareUrl(url)
      } catch (e) {
        if (!cancelled) toast(e.message || 'Could not open form file', 'error')
      }
    })()
    return () => { cancelled = true }
  }, [selectedBlankForm?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (memberSearchTimer.current) clearTimeout(memberSearchTimer.current)
    const q = memberQuery.trim()
    if (selectedMember || q.length < 2) {
      setMemberHits([])
      setMemberSearching(false)
      return undefined
    }
    setMemberSearching(true)
    memberSearchTimer.current = setTimeout(async () => {
      try {
        const rows = await searchPrintCornerMembers(q)
        setMemberHits(rows)
      } catch {
        setMemberHits([])
      } finally {
        setMemberSearching(false)
      }
    }, 280)
    return () => {
      if (memberSearchTimer.current) clearTimeout(memberSearchTimer.current)
    }
  }, [memberQuery, selectedMember])

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
    () => wizardTextVariables(selected?.variables),
    [selected],
  )

  const imageVariables = useMemo(
    () => imageFieldVariables(selected?.variables),
    [selected],
  )

  const needsMemberPhoto = useMemo(
    () => templateHasMemberPhoto(selected?.variables),
    [selected],
  )

  const churchImageVariables = useMemo(
    () => imageVariables.filter(v => v.key !== 'member_photo'),
    [imageVariables],
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

  const showMemberApproach = selected?.template_type === 'letter' || needsMemberPhoto

  const filteredBlankForms = useMemo(() => {
    const q = tplSearch.trim().toLowerCase()
    if (!q) return blankForms
    return blankForms.filter(f =>
      (f.label || '').toLowerCase().includes(q)
      || (f.form_key || '').toLowerCase().includes(q)
      || (f.description || '').toLowerCase().includes(q),
    )
  }, [blankForms, tplSearch])

  function pickMember(m) {
    if (!m) return
    clearBulk()
    setSelectedMember(m)
    setMemberQuery(m.member_name || m.member_id || '')
    setMemberHits([])
    setSharePhone(m.whatsapp || m.mobile || '')
    setShareEmail(m.email || '')
    if (selected) {
      setFieldValues(prev => applyMemberToFieldValues({ ...prev }, m))
      toast(`Filled from ${m.member_name || m.member_id}`, 'success')
    }
  }

  function clearMember() {
    setSelectedMember(null)
    setMemberQuery('')
    setMemberHits([])
    setSharePhone('')
    setShareEmail('')
    if (selected) setFieldValues(defaultFieldValuesFromTemplate(selected, church, null))
  }

  async function handleMemberIdLookup(rawId) {
    const id = String(rawId || '').trim()
    if (!id) return
    try {
      const m = await getPrintCornerMemberById(id)
      if (!m) {
        toast(`No member found for ID “${id}”.`, 'error')
        return
      }
      clearBulk()
      setSelectedMember(m)
      setMemberQuery(m.member_name || m.member_id || '')
      setFieldValues(prev => applyMemberToFieldValues({ ...prev }, m))
      setSharePhone(m.whatsapp || m.mobile || '')
      setShareEmail(m.email || '')
      toast(`Filled from ${m.member_name || m.member_id}`, 'success')
    } catch (e) {
      toast(e.message || 'Member lookup failed', 'error')
    }
  }

  function isMemberIdField(key) {
    return key === 'member_id' || key === 'Member_id'
  }

  async function handleShareWhatsApp(pdfUrl, label) {
    const url = pdfUrl || lastPdf?.signed_url
    if (!url) {
      toast('No file ready to share.', 'error')
      return
    }
    const to = sharePhone.trim()
    if (!to) {
      toast('Enter the member WhatsApp / mobile number.', 'error')
      return
    }
    setSharing(true)
    try {
      const name = selectedMember?.member_name || fieldValues.member_name || 'Member'
      const docLabel = label || selected?.label || 'document'
      const churchName = church?.church_name || 'Church'
      const msg = [
        `Dear ${name},`,
        '',
        `Please find your *${docLabel}* from *${churchName}*.`,
        '',
        'You can also open it here:',
        url,
        '',
        'God bless you.',
      ].join('\n')
      await sendWhatsAppMessage(church, {
        to,
        message: msg,
        mediaUrl: url,
        mediaType: /\.(jpe?g|png|webp)(\?|$)/i.test(url) ? 'image' : 'document',
      })
      toast('WhatsApp sent.', 'success')
    } catch (e) {
      toast(e.message || 'WhatsApp send failed', 'error')
    } finally {
      setSharing(false)
    }
  }

  function handleShareEmail(pdfUrl, label) {
    const url = pdfUrl || lastPdf?.signed_url
    if (!url) {
      toast('No file ready to share.', 'error')
      return
    }
    const to = shareEmail.trim()
    const name = selectedMember?.member_name || fieldValues.member_name || 'Member'
    const docLabel = label || selected?.label || 'document'
    const churchName = church?.church_name || 'Church'
    const subject = encodeURIComponent(`${docLabel} — ${churchName}`)
    const body = encodeURIComponent(
      `Dear ${name},\n\nPlease find your ${docLabel} from ${churchName}:\n\n${url}\n\nGod bless you.\n`,
    )
    window.open(`mailto:${encodeURIComponent(to)}?subject=${subject}&body=${body}`, '_blank')
  }

  async function fetchShareFile(url) {
    const res = await fetch(url)
    if (!res.ok) throw new Error('Could not load the form file.')
    return res.blob()
  }

  function fileNameForShare(label, blob) {
    const base = String(label || 'application-form')
      .trim()
      .replace(/[^\w\-]+/g, '_')
      .replace(/^_+|_+$/g, '')
      || 'application-form'
    const type = String(blob?.type || '').toLowerCase()
    const ext = type.includes('pdf') ? 'pdf'
      : type.includes('png') ? 'png'
        : type.includes('webp') ? 'webp'
          : 'jpg'
    return `${base}.${ext}`
  }

  async function handlePrintPdf(url) {
    const href = url || lastPdf?.signed_url
    if (!href) {
      toast('No file ready.', 'error')
      return
    }
    // Open in a new tab so the browser’s PDF/image viewer can View + Print (Ctrl+P).
    const w = window.open(href, '_blank', 'noopener,noreferrer')
    if (!w) toast('Allow pop-ups to view / print the form.', 'error')
  }

  async function handleDownloadFile(url, label) {
    const href = url || lastPdf?.signed_url
    if (!href) {
      toast('No file ready.', 'error')
      return
    }
    setSharing(true)
    try {
      const blob = await fetchShareFile(href)
      const objectUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = objectUrl
      a.download = fileNameForShare(label, blob)
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(objectUrl), 2000)
      toast('Download started.', 'success')
    } catch (e) {
      toast(e.message || 'Download failed', 'error')
    } finally {
      setSharing(false)
    }
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
    setSelectedMember(null)
    setMemberQuery(d.field_values?.member_name || d.member_id || '')
    setSharePhone(d.field_values?.whatsapp || d.field_values?.mobile || '')
    setShareEmail(d.field_values?.email || '')
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
    if (needsMemberPhoto && !String(fieldValues.member_id || '').trim()) {
      toast('Select a member — Member ID is required for the photo on this template.', 'error')
      return
    }
    setBusy(true)
    try {
      if (needsMemberPhoto) {
        const m = await getPrintCornerMemberById(fieldValues.member_id)
        if (!m) {
          toast(`Member “${fieldValues.member_id}” not found.`, 'error')
          return
        }
        const hasPhoto = m.photo_url || await memberPhotoExistsInStorage(m.member_id || fieldValues.member_id)
        if (!hasPhoto) {
          toast(`Member ${m.member_name || m.member_id} has no photo in storage. Upload one in Members first.`, 'error')
          return
        }
      }

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

      const photoMerged = res?.signature_merge?.swapped?.includes('member_photo')
      if (needsMemberPhoto && res?.member_photo_warning) {
        toast(res.member_photo_warning, 'error')
      } else if (needsMemberPhoto && !res?.member_photo_loaded) {
        toast(`Photo not loaded (${res?.member_photo_debug || 'unknown'}). Redeploy cms-print-corner edge function.`, 'error')
      } else if (needsMemberPhoto && res?.member_photo_loaded && !photoMerged) {
        toast(
          'Photo loaded but not placed — set picture Alt Text to {member_photo} on the circular photo in Canva, then re-upload.',
          'error',
        )
      } else {
        toast('PDF created and saved to issued folder.', 'success')
      }
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
    if (needsMemberPhoto) {
      const missing = bulkRows.filter(r => !String(r.member_id || '').trim()).length
      if (missing) {
        toast(`${missing} tracker row(s) missing member_id — required for member photo templates.`, 'error')
        return
      }
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

  function renderMemberPicker({ hint }) {
    return (
      <div style={{ marginBottom: 16, padding: 14, borderRadius: 10, background: '#f5f3ff', border: '1px solid #ddd6fe' }}>
        <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6, color: '#5b21b6' }}>Member request</div>
        <p style={{ fontSize: 12, color: 'var(--text-2)', margin: '0 0 10px', lineHeight: 1.45 }}>{hint}</p>
        <div style={{ position: 'relative' }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: 11, color: 'var(--text-3)' }} />
          <input
            value={selectedMember ? `${selectedMember.member_name || ''} (${selectedMember.member_id})` : memberQuery}
            onChange={e => {
              if (selectedMember) clearMember()
              setMemberQuery(e.target.value)
            }}
            placeholder="Search name, member ID, or mobile…"
            style={{ ...INPUT, paddingLeft: 32, paddingRight: selectedMember || memberSearching ? 36 : 10 }}
          />
          {(memberSearching || selectedMember) && (
            <span style={{ position: 'absolute', right: 8, top: 8 }}>
              {memberSearching ? (
                <Loader2 size={14} className="animate-spin" style={{ color: 'var(--text-3)' }} />
              ) : (
                <button type="button" onClick={clearMember} title="Clear member"
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 2, display: 'flex' }}>
                  <X size={14} />
                </button>
              )}
            </span>
          )}
          {!selectedMember && memberHits.length > 0 && (
            <div style={{
              position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 40, marginTop: 4,
              background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: 8,
              boxShadow: '0 8px 24px rgba(0,0,0,0.12)', maxHeight: 220, overflowY: 'auto',
            }}>
              {memberHits.map(m => (
                <button key={m.member_id} type="button" onMouseDown={e => { e.preventDefault(); pickMember(m) }}
                  style={{
                    display: 'flex', width: '100%', padding: '8px 12px', gap: 10, alignItems: 'center',
                    background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left',
                    borderBottom: '1px solid var(--card-border)',
                  }}>
                  <span style={{ fontWeight: 700, fontFamily: 'monospace', fontSize: 12, color: '#2563eb', minWidth: 64 }}>{m.member_id}</span>
                  <span style={{ flex: 1, fontSize: 13, color: 'var(--text-1)' }}>{m.member_name}</span>
                  <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{m.mobile || m.whatsapp || ''}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        {selectedMember && (
          <div style={{ marginTop: 10, fontSize: 12, color: 'var(--text-2)', display: 'flex', flexWrap: 'wrap', gap: '6px 14px' }}>
            {selectedMember.mobile && <span>Mobile: {selectedMember.mobile}</span>}
            {(selectedMember.whatsapp || selectedMember.mobile) && (
              <span>WhatsApp: {selectedMember.whatsapp || selectedMember.mobile}</span>
            )}
            {selectedMember.email && <span>Email: {selectedMember.email}</span>}
          </div>
        )}
      </div>
    )
  }

  function renderIssuedPdfPreview({ url, label }) {
    if (!url) return null
    return (
      <div style={{ marginTop: 16, borderRadius: 10, overflow: 'hidden', border: '1px solid var(--card-border)', background: '#f8fafc' }}>
        <div style={{
          padding: '8px 12px', fontSize: 11, fontWeight: 700, color: 'var(--text-3)',
          borderBottom: '1px solid var(--card-border)', letterSpacing: '0.04em', textTransform: 'uppercase',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8,
        }}>
          <span>Issued PDF</span>
          <span style={{ display: 'flex', gap: 8 }}>
            <button type="button" disabled={sharing} onClick={() => handlePrintPdf(url)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 10px',
                background: '#2563eb', color: '#fff', border: 'none', borderRadius: 6,
                fontSize: 11, fontWeight: 700, cursor: sharing ? 'wait' : 'pointer',
              }}>
              <Printer size={12} /> View / Print
            </button>
            <button type="button" disabled={sharing} onClick={() => handleDownloadFile(url, label)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 10px',
                background: '#14532d', color: '#fff', border: 'none', borderRadius: 6,
                fontSize: 11, fontWeight: 700, cursor: sharing ? 'wait' : 'pointer',
              }}>
              <Download size={12} /> Download
            </button>
          </span>
        </div>
        <iframe
          title={`Issued — ${label || 'document'}`}
          src={url}
          style={{ display: 'block', width: '100%', height: 520, border: 'none', background: '#fff' }}
        />
      </div>
    )
  }

  function renderShareActions({ url, label }) {
    if (!url) return null
    return (
      <div style={{ marginTop: 8, padding: 14, borderRadius: 10, background: '#f0fdf4', border: '1px solid #bbf7d0' }}>
        <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 10, color: '#15803d' }}>Print or share</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
          <button type="button" disabled={sharing} onClick={() => handlePrintPdf(url)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 12px',
              background: '#2563eb', color: '#fff', border: 'none', borderRadius: 8,
              fontSize: 12, fontWeight: 700, cursor: sharing ? 'wait' : 'pointer', opacity: sharing ? 0.7 : 1,
            }}>
            <Printer size={13} /> View / Print
          </button>
          <button type="button" disabled={sharing} onClick={() => handleDownloadFile(url, label)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 12px',
              background: '#14532d', color: '#fff', border: 'none', borderRadius: 8,
              fontSize: 12, fontWeight: 700, cursor: sharing ? 'wait' : 'pointer', opacity: sharing ? 0.7 : 1,
            }}>
            <Download size={13} /> Download
          </button>
        </div>
        <div style={{ display: 'grid', gap: 12, borderTop: '1px solid #bbf7d0', paddingTop: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#166534', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
            Share with member
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, alignItems: 'end' }}>
            <label style={{ fontSize: 12, fontWeight: 600 }}>
              WhatsApp / mobile
              <input value={sharePhone} onChange={e => setSharePhone(e.target.value)} placeholder="91…" style={{ ...INPUT, marginTop: 4, fontWeight: 400 }} />
            </label>
            <button type="button" disabled={sharing || !sharePhone.trim()} onClick={() => handleShareWhatsApp(url, label)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6, height: 36, padding: '0 14px',
                background: '#16a34a', color: '#fff', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 700,
                cursor: sharing || !sharePhone.trim() ? 'not-allowed' : 'pointer', opacity: !sharePhone.trim() ? 0.5 : 1,
              }}>
              {sharing ? <Loader2 size={13} className="animate-spin" /> : <MessageCircle size={13} />}
              WhatsApp
            </button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, alignItems: 'end' }}>
            <label style={{ fontSize: 12, fontWeight: 600 }}>
              Email
              <input type="email" value={shareEmail} onChange={e => setShareEmail(e.target.value)} placeholder="member@email.com" style={{ ...INPUT, marginTop: 4, fontWeight: 400 }} />
            </label>
            <button type="button" onClick={() => handleShareEmail(url, label)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6, height: 36, padding: '0 14px',
                background: '#1d4ed8', color: '#fff', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer',
              }}>
              <Mail size={13} /> Email
            </button>
          </div>
          <p style={{ fontSize: 11, color: '#166534', margin: 0, lineHeight: 1.4 }}>
            WhatsApp sends the file. Email opens your mail app with a link to the form.
          </p>
        </div>
      </div>
    )
  }

  function renderBlankFormContent() {
    const f = selectedBlankForm
    if (!f) {
      return (
        <div style={{ color: 'var(--text-3)', fontSize: 14, padding: '40px 0', textAlign: 'center' }}>
          Select an application form from the left — or upload blank PDFs/JPEGs in Settings.
        </div>
      )
    }
    const pathHint = `${f.mime_type || ''} ${f.storage_path || ''} ${f.file_name || ''}`.toLowerCase()
    const isPdf = pathHint.includes('pdf')
    const isImage = !isPdf && (pathHint.includes('image/') || /\.(jpe?g|png|webp)(\?|$)/i.test(pathHint))
    return (
      <div>
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-1)' }}>{f.label}</div>
          <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 4 }}>
            Blank scanned form · {isPdf ? 'PDF' : isImage ? 'Image' : 'File'}
          </div>
          {f.description && <p style={{ fontSize: 13, color: 'var(--text-2)', marginTop: 8 }}>{f.description}</p>}
        </div>
        {!f.storage_path ? (
          <div style={{ padding: 14, borderRadius: 10, background: '#fff7ed', border: '1px solid #fed7aa', fontSize: 13, color: '#9a3412' }}>
            File not uploaded yet. Open Print Corner Settings → Templates → Application forms and upload the scanned PDF or JPEG.
          </div>
        ) : (
          <>
            {!blankShareUrl ? (
              <div style={{ padding: 28, textAlign: 'center', color: 'var(--text-3)', marginBottom: 14 }}>
                <Loader2 size={18} className="animate-spin" style={{ display: 'inline' }} /> Preparing preview…
              </div>
            ) : (
              <div style={{
                marginBottom: 14, borderRadius: 10, overflow: 'hidden', border: '1px solid var(--card-border)',
                background: '#f8fafc',
              }}>
                <div style={{
                  padding: '8px 12px', fontSize: 11, fontWeight: 700, color: 'var(--text-3)',
                  borderBottom: '1px solid var(--card-border)', letterSpacing: '0.04em', textTransform: 'uppercase',
                }}>
                  Preview
                </div>
                {isImage ? (
                  <div style={{ display: 'flex', justifyContent: 'center', padding: 12, maxHeight: 420, overflow: 'auto' }}>
                    <img src={blankShareUrl} alt={f.label} style={{ maxWidth: '100%', maxHeight: 400, objectFit: 'contain' }} />
                  </div>
                ) : (
                  <iframe
                    title={`Preview — ${f.label}`}
                    src={blankShareUrl}
                    style={{ display: 'block', width: '100%', height: 420, border: 'none', background: '#fff' }}
                  />
                )}
              </div>
            )}

            {renderMemberPicker({
              hint: 'Optional: look up the member who requested this form so WhatsApp / email are prefilled.',
            })}

            {blankShareUrl && renderShareActions({ url: blankShareUrl, label: f.label })}
          </>
        )}
      </div>
    )
  }

  function renderStepContent() {
    if (sidebarMode === 'forms' || selectedBlankForm) {
      return renderBlankFormContent()
    }

    if (!selected) {
      return (
        <div style={{ color: 'var(--text-3)', fontSize: 14, padding: '40px 0', textAlign: 'center' }}>
          Select a letter or certificate template from the left panel.
        </div>
      )
    }

    if (step === 2) {
      return (
        <div>
          {showMemberApproach && renderMemberPicker({
            hint: needsMemberPhoto
              ? 'Search the member for this document. Member ID loads their photo; matching fields autofill below.'
              : 'Search the member for this letter. Matching fields autofill; you can still edit below.',
          })}
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
          {churchImageVariables.length > 0 && (
            <div style={{
              marginBottom: 14, padding: '10px 12px', borderRadius: 8, fontSize: 12, lineHeight: 1.5,
              background: '#f5f3ff', border: '1px solid #ddd6fe', color: '#5b21b6',
            }}>
              Signature images (auto from Church Setup):{' '}
              {churchImageVariables.map(v => `{${v.key}}`).join(', ')}
            </div>
          )}
          {needsMemberPhoto && (
            <div style={{
              marginBottom: 14, padding: '10px 12px', borderRadius: 8, fontSize: 12, lineHeight: 1.5,
              background: '#ecfdf5', border: '1px solid #a7f3d0', color: '#065f46',
            }}>
              Member photo (auto): set picture Alt Text to {'{member_photo}'} in Canva/PowerPoint.
              Pick a member above — their photo replaces the placeholder.
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
                  onBlur={isMemberIdField(v.key) ? e => handleMemberIdLookup(e.target.value) : undefined}
                  onKeyDown={isMemberIdField(v.key) ? e => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      handleMemberIdLookup(e.currentTarget.value)
                    }
                  } : undefined}
                  placeholder={isMemberIdField(v.key) ? 'Enter ID and press Enter or tab out' : undefined}
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

          {lastPdf?.signed_url && !bulkMode && renderIssuedPdfPreview({
            url: lastPdf.signed_url,
            label: selected?.label || 'document',
          })}
        </div>
      )
    }

    // step 1 — template summary + PDF preview
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

        {!selected.storage_path ? (
          <div style={{ marginBottom: 16, padding: 14, borderRadius: 10, background: '#fff7ed', border: '1px solid #fed7aa', fontSize: 13, color: '#9a3412' }}>
            Not uploaded — use Print Corner Settings to upload a .docx / .pptx
          </div>
        ) : (
          <div style={{
            marginBottom: 16, borderRadius: 10, overflow: 'hidden',
            border: '1px solid var(--card-border)', background: '#f8fafc',
          }}>
            <div style={{
              padding: '8px 12px', fontSize: 11, fontWeight: 700, color: 'var(--text-3)',
              borderBottom: '1px solid var(--card-border)', letterSpacing: '0.04em', textTransform: 'uppercase',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8,
            }}>
              <span>Template preview</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontWeight: 600, textTransform: 'none', letterSpacing: 0, color: 'var(--text-3)' }}>
                  {tplPreviewCached ? 'Cached' : 'Sample data · not issued'}
                </span>
                <button type="button" disabled={tplPreviewLoading} onClick={refreshTplPreview}
                  style={{
                    fontSize: 11, fontWeight: 700, textTransform: 'none', letterSpacing: 0,
                    padding: '3px 8px', borderRadius: 6, border: '1px solid var(--card-border)',
                    background: 'var(--card-bg)', color: 'var(--text-2)', cursor: tplPreviewLoading ? 'wait' : 'pointer',
                  }}>
                  Refresh
                </button>
              </span>
            </div>
            {tplPreviewLoading ? (
              <div style={{ padding: 36, textAlign: 'center', color: 'var(--text-3)', fontSize: 13, lineHeight: 1.5 }}>
                <Loader2 size={18} className="animate-spin" style={{ display: 'inline' }} />
                <div style={{ marginTop: 8 }}>
                  {tplPreviewForce ? 'Rebuilding preview…' : 'Loading preview…'}
                </div>
                <div style={{ fontSize: 11, marginTop: 4, color: 'var(--text-3)' }}>
                  First load builds a cache; later opens are much faster.
                </div>
              </div>
            ) : tplPreviewError ? (
              <div style={{ padding: 16, fontSize: 13, color: '#b91c1c', lineHeight: 1.45 }}>
                {tplPreviewError}
              </div>
            ) : tplPreviewUrl ? (
              <iframe
                title={`Preview — ${selected.label}`}
                src={tplPreviewUrl}
                style={{ display: 'block', width: '100%', height: 420, border: 'none', background: '#fff' }}
              />
            ) : (
              <div style={{ padding: 28, textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>
                No preview available
              </div>
            )}
          </div>
        )}

        <button type="button" onClick={() => setStep(2)} disabled={!selected.storage_path}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 8, padding: '9px 16px',
            background: '#2563eb', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600,
            cursor: selected.storage_path ? 'pointer' : 'not-allowed', opacity: selected.storage_path ? 1 : 0.5,
          }}>
          Fill fields →
        </button>
      </>
    )
  }

  return (
    <div className="page-container">
      <PageHeader icon={Printer} title="Print Corner" subtitle="Application forms, letters, and certificates">
        <button type="button" onClick={() => navigate('/print-corner/settings')} title="Print Corner Settings"
          style={{ padding: '8px 10px', background: 'var(--card-bg)', border: '1.5px solid var(--card-border)', borderRadius: 8, cursor: 'pointer', display: 'flex', alignItems: 'center', color: 'var(--text-2)' }}>
          <Settings size={15} />
        </button>
      </PageHeader>

      <div style={{ display: 'flex', gap: 16, alignItems: 'stretch', minHeight: 480 }}>
        <aside style={{
          width: 360, flexShrink: 0, maxWidth: '100%',
          background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: 12,
          display: 'flex', flexDirection: 'column', maxHeight: 'calc(100vh - 160px)', overflow: 'hidden',
          boxShadow: '0 1px 2px rgba(15, 23, 42, 0.04)',
        }}>
          {/* Header + search */}
          <div style={{ padding: '14px 14px 12px', borderBottom: '1px solid var(--card-border)', flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.08em', color: 'var(--text-3)' }}>
                LIBRARY
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-3)' }}>
                {blankForms.length + groups.reduce((n, g) => n + g.templates.length, 0)} items
              </div>
            </div>
            <div style={{ position: 'relative' }}>
              <Search size={14} style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)', pointerEvents: 'none' }} />
              <input
                value={tplSearch}
                onChange={e => setTplSearch(e.target.value)}
                placeholder="Search forms, letters, certificates…"
                style={{
                  ...INPUT, height: 36, paddingLeft: 34, paddingRight: tplSearch ? 34 : 10, fontSize: 13,
                  borderRadius: 9, border: '1.5px solid var(--card-border)',
                }}
              />
              {tplSearch.trim() && (
                <button
                  type="button"
                  onClick={() => setTplSearch('')}
                  title="Clear search"
                  style={{
                    position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
                    border: 'none', background: 'var(--input-bg)', borderRadius: 99, width: 22, height: 22,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--text-3)',
                  }}
                >
                  <X size={12} />
                </button>
              )}
            </div>
          </div>

          {/* Category rail — hidden while searching (global results instead) */}
          {!tplSearch.trim() && (
            <div style={{
              padding: '10px 12px', borderBottom: '1px solid var(--card-border)', flexShrink: 0,
              background: 'var(--page-bg, #f8fafc)',
            }}>
              <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.07em', color: 'var(--text-3)', marginBottom: 8 }}>
                BROWSE
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                <button
                  type="button"
                  onClick={() => {
                    setSidebarMode('forms')
                    setSelected(null)
                    if (!selectedBlankForm && blankForms[0]) setSelectedBlankForm(blankForms[0])
                  }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                    padding: '9px 10px', border: 'none', cursor: 'pointer', textAlign: 'left',
                    borderRadius: 9,
                    background: sidebarMode === 'forms' ? FORMS_STYLE.bg : 'var(--card-bg)',
                    boxShadow: sidebarMode === 'forms' ? 'inset 0 0 0 1.5px #c4b5fd' : 'inset 0 0 0 1px var(--card-border)',
                  }}
                >
                  <span style={{
                    width: 28, height: 28, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: FORMS_STYLE.badgeBg, color: FORMS_STYLE.accent, flexShrink: 0,
                  }}>
                    <ClipboardList size={14} />
                  </span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{
                      display: 'block', fontSize: 12.5, fontWeight: sidebarMode === 'forms' ? 800 : 600,
                      color: sidebarMode === 'forms' ? FORMS_STYLE.accent : 'var(--text-1)',
                    }}>
                      Application forms
                    </span>
                    <span style={{ display: 'block', fontSize: 10.5, color: 'var(--text-3)', marginTop: 1 }}>
                      Print or share blank scans
                    </span>
                  </span>
                  <span style={{
                    fontSize: 11, fontWeight: 700, minWidth: 22, textAlign: 'center',
                    padding: '2px 7px', borderRadius: 99,
                    background: sidebarMode === 'forms' ? FORMS_STYLE.badgeBg : 'var(--input-bg)',
                    color: sidebarMode === 'forms' ? FORMS_STYLE.badgeColor : 'var(--text-3)',
                  }}>
                    {blankForms.length}
                  </span>
                </button>

                {filteredGroups.map((g, gi) => {
                  const catStyle = categoryHeaderStyle(g.category.name, gi)
                  const CatIcon = catStyle.Icon || FileText
                  const on = sidebarMode === 'templates' && activeGroup?.category.id === g.category.id
                  return (
                    <button
                      key={g.category.id}
                      type="button"
                      onClick={() => {
                        setSidebarMode('templates')
                        setSelectedBlankForm(null)
                        setActiveCategoryId(g.category.id)
                        const first = g.templates[0]
                        if (first && !g.templates.some(t => t.id === selected?.id)) setSelected(first)
                      }}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                        padding: '9px 10px', border: 'none', cursor: 'pointer', textAlign: 'left',
                        borderRadius: 9,
                        background: on ? catStyle.bg : 'var(--card-bg)',
                        boxShadow: on ? `inset 0 0 0 1.5px ${catStyle.accent}55` : 'inset 0 0 0 1px var(--card-border)',
                      }}
                    >
                      <span style={{
                        width: 28, height: 28, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: catStyle.badgeBg, color: catStyle.accent, flexShrink: 0,
                      }}>
                        <CatIcon size={14} />
                      </span>
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span style={{
                          display: 'block', fontSize: 12.5, fontWeight: on ? 800 : 600,
                          color: on ? catStyle.accent : 'var(--text-1)',
                        }}>
                          {g.category.name}
                        </span>
                        <span style={{ display: 'block', fontSize: 10.5, color: 'var(--text-3)', marginTop: 1 }}>
                          Mail-merge templates
                        </span>
                      </span>
                      <span style={{
                        fontSize: 11, fontWeight: 700, minWidth: 22, textAlign: 'center',
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
            </div>
          )}

          {/* Item list */}
          <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
            {loading ? (
              <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-3)' }}>
                <Loader2 size={20} className="animate-spin" style={{ display: 'inline' }} />
              </div>
            ) : tplSearch.trim() ? (
              /* Global search results */
              (() => {
                const formHits = filteredBlankForms
                const tplHits = filteredGroups.flatMap(g => g.templates.map(t => ({ t, catName: g.category.name })))
                if (!formHits.length && !tplHits.length) {
                  return (
                    <div style={{ padding: '28px 20px', textAlign: 'center' }}>
                      <Search size={22} style={{ color: 'var(--text-3)', marginBottom: 8 }} />
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-2)' }}>No matches</div>
                      <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 4 }}>Try another name or key</div>
                    </div>
                  )
                }
                return (
                  <div>
                    {formHits.length > 0 && (
                      <>
                        <div style={{
                          position: 'sticky', top: 0, zIndex: 1,
                          padding: '8px 14px', fontSize: 10, fontWeight: 800, letterSpacing: '0.06em',
                          color: FORMS_STYLE.badgeColor, background: FORMS_STYLE.bg,
                          borderBottom: '1px solid #ede9fe',
                        }}>
                          APPLICATION FORMS · {formHits.length}
                        </div>
                        {formHits.map(f => {
                          const active = selectedBlankForm?.id === f.id
                          const ready = !!f.storage_path
                          return (
                            <button
                              key={f.id}
                              type="button"
                              onClick={() => { setSidebarMode('forms'); setSelectedBlankForm(f) }}
                              style={{
                                display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                                padding: '11px 14px', border: 'none', textAlign: 'left', cursor: 'pointer',
                                background: active ? FORMS_STYLE.bg : 'transparent',
                                borderBottom: '1px solid var(--card-border)',
                                boxShadow: active ? `inset 3px 0 0 ${FORMS_STYLE.accent}` : 'inset 3px 0 0 transparent',
                              }}
                            >
                              <span style={{
                                width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                background: active ? FORMS_STYLE.badgeBg : 'var(--input-bg)',
                                color: FORMS_STYLE.accent,
                              }}>
                                <ClipboardList size={15} />
                              </span>
                              <span style={{ flex: 1, minWidth: 0 }}>
                                <span style={{ display: 'block', fontSize: 13, fontWeight: active ? 700 : 600, color: 'var(--text-1)', lineHeight: 1.3 }}>
                                  {f.label}
                                </span>
                                <span style={{ display: 'block', fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>
                                  Application form
                                </span>
                              </span>
                              <span style={{
                                fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 99, flexShrink: 0,
                                background: ready ? '#dcfce7' : '#ffedd5',
                                color: ready ? '#15803d' : '#c2410c',
                              }}>
                                {ready ? 'Ready' : 'Missing'}
                              </span>
                            </button>
                          )
                        })}
                      </>
                    )}
                    {tplHits.length > 0 && (
                      <>
                        <div style={{
                          position: 'sticky', top: 0, zIndex: 1,
                          padding: '8px 14px', fontSize: 10, fontWeight: 800, letterSpacing: '0.06em',
                          color: 'var(--text-3)', background: 'var(--page-bg, #f8fafc)',
                          borderBottom: '1px solid var(--card-border)',
                        }}>
                          TEMPLATES · {tplHits.length}
                        </div>
                        {tplHits.map(({ t, catName }) => {
                          const Icon = TYPE_ICONS[t.template_type] || FileText
                          const active = selected?.id === t.id
                          const accent = TEMPLATE_TYPES[t.template_type]?.color || '#2563eb'
                          const ready = !!t.storage_path
                          return (
                            <button
                              key={t.id}
                              type="button"
                              onClick={() => { setSidebarMode('templates'); setSelected(t) }}
                              style={{
                                display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                                padding: '11px 14px', border: 'none', textAlign: 'left', cursor: 'pointer',
                                background: active ? 'var(--accent-subtle, #eff6ff)' : 'transparent',
                                borderBottom: '1px solid var(--card-border)',
                                boxShadow: active ? `inset 3px 0 0 ${accent}` : 'inset 3px 0 0 transparent',
                              }}
                            >
                              <span style={{
                                width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                background: active ? `${accent}18` : 'var(--input-bg)',
                                color: accent,
                              }}>
                                <Icon size={15} />
                              </span>
                              <span style={{ flex: 1, minWidth: 0 }}>
                                <span style={{ display: 'block', fontSize: 13, fontWeight: active ? 700 : 600, color: 'var(--text-1)', lineHeight: 1.3 }}>
                                  {t.label}
                                </span>
                                <span style={{ display: 'block', fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>
                                  {catName}
                                </span>
                              </span>
                              <span style={{
                                fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 99, flexShrink: 0,
                                background: ready ? '#dcfce7' : '#ffedd5',
                                color: ready ? '#15803d' : '#c2410c',
                              }}>
                                {ready ? 'Ready' : 'Missing'}
                              </span>
                            </button>
                          )
                        })}
                      </>
                    )}
                  </div>
                )
              })()
            ) : sidebarMode === 'forms' ? (
              filteredBlankForms.length === 0 ? (
                <div style={{ padding: '32px 20px', textAlign: 'center' }}>
                  <div style={{
                    width: 44, height: 44, borderRadius: 12, margin: '0 auto 12px',
                    background: FORMS_STYLE.badgeBg, color: FORMS_STYLE.accent,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <ClipboardList size={20} />
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)', marginBottom: 4 }}>No blank forms yet</div>
                  <div style={{ fontSize: 12, color: 'var(--text-3)', lineHeight: 1.45, marginBottom: 14 }}>
                    Upload scanned PDF or JPEG forms in Settings.
                  </div>
                  <button type="button" onClick={() => navigate('/print-corner/settings')}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 12px',
                      background: FORMS_STYLE.accent, color: '#fff', border: 'none', borderRadius: 8,
                      fontSize: 12, fontWeight: 700, cursor: 'pointer',
                    }}>
                    <Settings size={13} /> Open Settings
                  </button>
                </div>
              ) : (
                <div>
                  <div style={{
                    position: 'sticky', top: 0, zIndex: 1,
                    padding: '8px 14px', fontSize: 10, fontWeight: 800, letterSpacing: '0.06em',
                    color: FORMS_STYLE.badgeColor, background: FORMS_STYLE.bg,
                    borderBottom: '1px solid #ede9fe',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  }}>
                    <span>BLANK FORMS</span>
                    <span style={{ fontWeight: 600, letterSpacing: 0, textTransform: 'none' }}>print / share as-is</span>
                  </div>
                  {filteredBlankForms.map(f => {
                    const active = selectedBlankForm?.id === f.id
                    const ready = !!f.storage_path
                    const kind = f.mime_type?.includes('pdf') ? 'PDF' : (f.mime_type || '').startsWith('image/') ? 'Image' : 'File'
                    return (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => { setSidebarMode('forms'); setSelectedBlankForm(f) }}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                          padding: '11px 14px', border: 'none', textAlign: 'left', cursor: 'pointer',
                          background: active ? FORMS_STYLE.bg : 'transparent',
                          borderBottom: '1px solid var(--card-border)',
                          boxShadow: active ? `inset 3px 0 0 ${FORMS_STYLE.accent}` : 'inset 3px 0 0 transparent',
                          transition: 'background 0.12s ease',
                        }}
                      >
                        <span style={{
                          width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          background: active ? FORMS_STYLE.badgeBg : 'var(--input-bg)',
                          color: FORMS_STYLE.accent,
                        }}>
                          <ClipboardList size={15} />
                        </span>
                        <span style={{ flex: 1, minWidth: 0 }}>
                          <span style={{
                            display: 'block', fontSize: 13, fontWeight: active ? 700 : 600,
                            color: 'var(--text-1)', lineHeight: 1.3,
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          }}>
                            {f.label}
                          </span>
                          <span style={{ display: 'block', fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>
                            {ready ? kind : 'Upload needed'}
                          </span>
                        </span>
                        <span style={{
                          fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 99, flexShrink: 0,
                          background: ready ? '#dcfce7' : '#ffedd5',
                          color: ready ? '#15803d' : '#c2410c',
                        }}>
                          {ready ? 'Ready' : 'Missing'}
                        </span>
                      </button>
                    )
                  })}
                </div>
              )
            ) : sidebarTemplates.length === 0 ? (
              <div style={{ padding: '32px 20px', textAlign: 'center' }}>
                <div style={{
                  width: 44, height: 44, borderRadius: 12, margin: '0 auto 12px',
                  background: activeCatStyle.badgeBg, color: activeCatStyle.accent,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <FileText size={20} />
                </div>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)', marginBottom: 4 }}>No templates here</div>
                <div style={{ fontSize: 12, color: 'var(--text-3)', lineHeight: 1.45, marginBottom: 14 }}>
                  Add a Word or PowerPoint template in Settings.
                </div>
                <button type="button" onClick={() => navigate('/print-corner/settings')}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 12px',
                    background: activeCatStyle.accent, color: '#fff', border: 'none', borderRadius: 8,
                    fontSize: 12, fontWeight: 700, cursor: 'pointer',
                  }}>
                  <Settings size={13} /> Open Settings
                </button>
              </div>
            ) : (
              <div>
                {activeGroup && (
                  <div style={{
                    position: 'sticky', top: 0, zIndex: 1,
                    padding: '8px 14px', fontSize: 10, fontWeight: 800, letterSpacing: '0.06em',
                    color: activeCatStyle.badgeColor, background: activeCatStyle.bg,
                    borderBottom: `1px solid ${activeCatStyle.badgeBg}`,
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  }}>
                    <span>{String(activeGroup.category.name || '').toUpperCase()}</span>
                    <span style={{ fontWeight: 600, letterSpacing: 0, textTransform: 'none' }}>
                      {sidebarTemplates.length} template{sidebarTemplates.length === 1 ? '' : 's'}
                    </span>
                  </div>
                )}
                {sidebarTemplates.map(({ t }) => {
                  const Icon = TYPE_ICONS[t.template_type] || FileText
                  const active = selected?.id === t.id
                  const accent = TEMPLATE_TYPES[t.template_type]?.color || activeCatStyle.accent
                  const ready = !!t.storage_path
                  const typeLabel = TEMPLATE_TYPES[t.template_type]?.label || 'Template'
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => { setSidebarMode('templates'); setSelected(t) }}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                        padding: '11px 14px', border: 'none', textAlign: 'left', cursor: 'pointer',
                        background: active ? 'var(--accent-subtle, #eff6ff)' : 'transparent',
                        borderBottom: '1px solid var(--card-border)',
                        boxShadow: active ? `inset 3px 0 0 ${accent}` : 'inset 3px 0 0 transparent',
                        transition: 'background 0.12s ease',
                      }}
                    >
                      <span style={{
                        width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: active ? `${accent}18` : 'var(--input-bg)',
                        color: accent,
                      }}>
                        <Icon size={15} />
                      </span>
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span style={{
                          display: 'block', fontSize: 13, fontWeight: active ? 700 : 600,
                          color: 'var(--text-1)', lineHeight: 1.3,
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}>
                          {t.label}
                        </span>
                        <span style={{ display: 'block', fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>
                          {typeLabel}{ready ? '' : ' · file needed'}
                        </span>
                      </span>
                      <span style={{
                        fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 99, flexShrink: 0,
                        background: ready ? '#dcfce7' : '#ffedd5',
                        color: ready ? '#15803d' : '#c2410c',
                      }}>
                        {ready ? 'Ready' : 'Missing'}
                      </span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </aside>

        <main style={{ flex: 1, minWidth: 0, background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: 10, padding: 20 }}>
          {sidebarMode === 'templates' && (
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
          )}

          {selected && sidebarMode === 'templates' && (
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
