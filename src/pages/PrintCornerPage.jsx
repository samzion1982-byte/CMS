import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import {
  Printer, Settings, Loader2, FileText, Award, Mail, ClipboardList, CreditCard,
  CheckCircle2, AlertCircle, Save, Download, Upload,
  Pencil, Trash2, Search, MessageCircle, X,
} from 'lucide-react'
import PageHeader from '../components/ui/PageHeader'
import { useToast } from '../lib/toast'
import { sendWhatsAppMessage } from '../lib/whatsapp'
import {
  peekPrintCornerSidebarCatalogCache,
  fetchPrintCornerSidebarCatalog,
  pingPrintCorner,
  convertTemplateFromStorage,
  convertBulkLettersToPdf,
  downloadPrintCornerTracker,
  parsePrintCornerTrackerFile,
  resolveTemplateTypeDisplay,
  resolvePptxNameFit,
  getSharedDrafts,
  saveDraft,
  deleteDraft,
  deletePrintCornerTemplate,
  deletePrintCornerApplicationForm,
  getPrintCornerIssuedLog,
  deletePrintCornerIssued,
  deletePrintCornerIssuedMany,
  purgePrintCornerIssuedOlderThan,
  ISSUED_RETENTION_DAYS,
  getChurchForPrintCorner,
  defaultFieldValuesFromTemplate,
  applyMemberToFieldValues,
  applyChurchToFieldValues,
  isOverridableChurchFieldKey,
  searchPrintCornerMembers,
  getPrintCornerMemberById,
  memberPhotoExistsInStorage,
  getApplicationFormSignedUrl,
  previewPrintCornerTemplate,
  textFieldVariables,
  imageFieldVariables,
  templateHasMemberPhoto,
  templateMetaFromTemplate,
  isChurchSetupFieldKey,
  churchSetupValueForKey,
  normalizePrintCornerFieldKey,
  getPrintCornerImagePlaceholderStatus,
  sortPrintCornerTemplates,
  sortPrintCornerCategories,
  buildPrintCornerSidebarBrowseItems,
  PRINT_CORNER_FORMS_SIDEBAR_ID,
} from '../lib/printCornerLib'
import MasterDeleteGate from '../components/printCorner/MasterDeleteGate'

const TYPE_ICONS = {
  certificate: Award,
  letter: Mail,
  form: ClipboardList,
  id_card: CreditCard,
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

const SIDEBAR_FORMS_ID = PRINT_CORNER_FORMS_SIDEBAR_ID

function groupTemplates(categories, templates) {
  const sortedCategories = sortPrintCornerCategories(categories.filter(c => !c.parent_id))
  const byCatId = new Map()
  for (const t of templates) {
    if (!byCatId.has(t.category_id)) byCatId.set(t.category_id, [])
    byCatId.get(t.category_id).push(t)
  }
  const known = new Set(sortedCategories.map(c => c.id))
  const groups = sortedCategories.map(c => ({
    category: c,
    templates: sortPrintCornerTemplates(byCatId.get(c.id) || []),
  }))
  const orphans = templates.filter(t => !known.has(t.category_id))
  if (orphans.length) {
    groups.push({
      category: { id: '__unassigned', name: 'Unassigned', sort_order: 9999 },
      templates: sortPrintCornerTemplates(orphans),
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
  if (n.includes('id card') || n.includes('idcard')) {
    return { bg: '#ecfeff', accent: '#0891b2', badgeBg: '#a5f3fc', badgeColor: '#0e7490', Icon: CreditCard }
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

function initialSidebarFromCache() {
  const cached = peekPrintCornerSidebarCatalogCache()
  if (!cached) {
    return { categories: [], groups: [], blankForms: [], hasCache: false }
  }
  const top = (cached.categories || []).filter(c => !c.parent_id)
  return {
    categories: top,
    groups: groupTemplates(top, (cached.templates || []).filter(t => t.template_type !== 'form')),
    blankForms: cached.applicationForms || [],
    hasCache: true,
  }
}

export default function PrintCornerPage() {
  const navigate = useNavigate()
  const toast = useToast()
  const { profile } = useAuth()
  const trackerInputRef = useRef(null)
  const initialSidebar = useMemo(() => initialSidebarFromCache(), [])

  const [loading, setLoading] = useState(() => !initialSidebar.hasCache)
  const [categories, setCategories] = useState(initialSidebar.categories)
  const [groups, setGroups] = useState(initialSidebar.groups)
  const [blankForms, setBlankForms] = useState(initialSidebar.blankForms)
  const [selected, setSelected] = useState(null)
  const [selectedBlankForm, setSelectedBlankForm] = useState(null)
  const [sidebarMode, setSidebarMode] = useState('forms') // 'forms' | 'templates'
  const [ping, setPing] = useState(null)
  const [busy, setBusy] = useState(false)
  const [lastPdf, setLastPdf] = useState(null)
  const [issuedPdfs, setIssuedPdfs] = useState([])
  const [issuedLoading, setIssuedLoading] = useState(false)
  const [issuedSelected, setIssuedSelected] = useState(() => new Set())
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
  const [deletePrompt, setDeletePrompt] = useState(null) // { kind: 'template'|'form', item }

  const applySidebarCatalog = useCallback(({ categories: cats, templates, applicationForms }) => {
    const top = (cats || []).filter(c => !c.parent_id)
    setCategories(top)
    setGroups(groupTemplates(top, (templates || []).filter(t => t.template_type !== 'form')))
    setBlankForms(applicationForms || [])
  }, [])

  const refreshSidebar = useCallback(async () => {
    const fresh = await fetchPrintCornerSidebarCatalog()
    applySidebarCatalog(fresh)
    return fresh
  }, [applySidebarCatalog])

  const refreshIssuedPdfs = useCallback(async () => {
    setIssuedLoading(true)
    try {
      setIssuedPdfs(await getPrintCornerIssuedLog(40))
    } catch {
      setIssuedPdfs([])
    } finally {
      setIssuedLoading(false)
    }
  }, [])

  const load = useCallback(async () => {
    const cached = peekPrintCornerSidebarCatalogCache()

    if (cached) {
      applySidebarCatalog(cached)
      setLoading(false)
      fetchPrintCornerSidebarCatalog()
        .then(fresh => applySidebarCatalog(fresh))
        .catch(() => {})
    } else {
      setLoading(true)
      try {
        const fresh = await fetchPrintCornerSidebarCatalog()
        applySidebarCatalog(fresh)
      } catch (e) {
        toast(e.message || 'Could not load Print Corner', 'error')
      } finally {
        setLoading(false)
      }
    }

    getChurchForPrintCorner()
      .then(setChurch)
      .catch(() => {})

    getSharedDrafts(30)
      .then(setDrafts)
      .catch(() => {})

    pingPrintCorner()
      .then(setPing)
      .catch(e => setPing({ ok: false, error: e.message }))

    purgePrintCornerIssuedOlderThan(ISSUED_RETENTION_DAYS)
      .then(n => { if (n > 0) refreshIssuedPdfs() })
      .catch(() => {})
    refreshIssuedPdfs()
  }, [toast, applySidebarCatalog, refreshIssuedPdfs])

  useEffect(() => { load() }, [load])

  // Refresh Church Setup fields after user saves church profile
  useEffect(() => {
    function onChurchUpdated() {
      getChurchForPrintCorner()
        .then(setChurch)
        .catch(() => {})
    }
    window.addEventListener('church-settings-updated', onChurchUpdated)
    return () => window.removeEventListener('church-settings-updated', onChurchUpdated)
  }, [])

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
    setFieldValues(defaultFieldValuesFromTemplate(selected, church, null, selectedCategoryName))
    if (selected.category_id) setActiveCategoryId(selected.category_id)
  }, [selected?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Church profile often loads after the template — refill church-owned fields without wiping member edits
  useEffect(() => {
    if (!selected || !church) return
    setFieldValues(prev => applyChurchToFieldValues({ ...prev }, church, { preserveOverrides: true }))
  }, [church, selected?.id, step])

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

  const sidebarBrowseItems = useMemo(() => {
    const templateCountByCategoryId = {}
    for (const g of groups) templateCountByCategoryId[g.category.id] = g.templates.length
    return buildPrintCornerSidebarBrowseItems(categories, {
      templateCountByCategoryId,
      blankFormsCount: blankForms.length,
    })
  }, [categories, groups, blankForms.length])

  // First load: select first category in Settings order
  useEffect(() => {
    if (!sidebarBrowseItems.length || catsSeededRef.current) return
    catsSeededRef.current = true
    const first = sidebarBrowseItems[0]
    if (first.isForms) {
      setSidebarMode('forms')
      setActiveCategoryId(first.id)
    } else {
      setSidebarMode('templates')
      setActiveCategoryId(first.id)
    }
  }, [sidebarBrowseItems])

  const activeGroup = useMemo(() => {
    if (tplSearch.trim()) return null
    return groups.find(g => g.category.id === activeCategoryId) ?? null
  }, [groups, activeCategoryId, tplSearch])

  const sidebarTemplates = useMemo(() => {
    if (tplSearch.trim()) return filteredGroups.flatMap(g => g.templates.map(t => ({ t, catName: g.category.name })))
    if (!activeGroup) return []
    return activeGroup.templates.map(t => ({ t, catName: activeGroup.category.name }))
  }, [filteredGroups, activeGroup, tplSearch])

  const activeCatStyle = useMemo(() => {
    const idx = groups.findIndex(g => g.category.id === (activeGroup?.category.id))
    return categoryHeaderStyle(activeGroup?.category?.name, Math.max(0, idx))
  }, [groups, activeGroup])

  const selectedCategoryName = useMemo(() => {
    if (!selected) return ''
    const g = groups.find(x => x.category.id === selected.category_id)
      || groups.find(x => x.templates.some(t => t.id === selected.id))
    return g?.category?.name || ''
  }, [groups, selected])

  const selectedMeta = useMemo(() => {
    if (!selected) return null
    return resolveTemplateTypeDisplay(selected, selectedCategoryName)
  }, [selected, selectedCategoryName])

  const templateMeta = useMemo(
    () => templateMetaFromTemplate(selected, selectedCategoryName),
    [selected, selectedCategoryName],
  )

  const variables = useMemo(
    () => textFieldVariables(selected?.variables),
    [selected],
  )

  function resolvedFieldValue(key) {
    if (isOverridableChurchFieldKey(key)) {
      const churchVal = church ? churchSetupValueForKey(key, church) : ''
      const stored = fieldValues[key]
      return stored != null && String(stored).trim() !== '' ? stored : churchVal
    }
    if (isChurchSetupFieldKey(key) && church) return churchSetupValueForKey(key, church)
    return fieldValues[key] ?? ''
  }

  function setOverridableField(key, val) {
    clearBulk()
    setFieldValues(f => {
      const next = { ...f, [key]: val }
      const n = normalizePrintCornerFieldKey(key)
      if (n === 'presbyter_name' || n === 'pastor_name') {
        for (const other of variables) {
          const on = normalizePrintCornerFieldKey(other.key)
          if ((n === 'presbyter_name' && on === 'pastor_name') || (n === 'pastor_name' && on === 'presbyter_name')) {
            next[other.key] = val
          }
        }
      }
      return next
    })
  }

  function buildIssueFieldValues() {
    const out = { ...fieldValues }
    for (const v of variables) {
      out[v.key] = resolvedFieldValue(v.key)
    }
    if (needsMemberPhoto) {
      const mid = String(out.member_id || selectedMember?.member_id || '').trim()
      if (mid) out.member_id = mid
    }
    return out
  }

  const imageVariables = useMemo(
    () => imageFieldVariables(selected?.variables),
    [selected],
  )

  const needsMemberPhoto = useMemo(
    () => templateHasMemberPhoto(selected?.variables, templateMeta),
    [selected, templateMeta],
  )

  const churchImageVariables = useMemo(
    () => imageVariables.filter(v => v.key !== 'member_photo'),
    [imageVariables],
  )

  const signatureImageStatuses = useMemo(
    () => getPrintCornerImagePlaceholderStatus(church, churchImageVariables.map(v => v.key)),
    [church, churchImageVariables],
  )

  const bulkMode = bulkRows.length > 0

  /** Shared drafts for the active sidebar category only (not all letters/forms). */
  const visibleDrafts = useMemo(() => {
    if (sidebarMode === 'forms' || tplSearch.trim()) return []
    const templatesInCat = activeGroup?.templates || []
    if (!templatesInCat.length) return []
    const draftable = templatesInCat.filter(t => t.template_type !== 'certificate')
    if (!draftable.length) return []
    const keys = new Set(draftable.map(t => t.template_key))
    const ids = new Set(draftable.map(t => t.id))
    return drafts.filter(d => {
      if (d.template_id && ids.has(d.template_id)) return true
      if (d.template_key && keys.has(d.template_key)) return true
      return false
    })
  }, [drafts, activeGroup, sidebarMode, tplSearch])

  const showDrafts = !!selected && selected.template_type !== 'certificate'

  /** Issued PDFs for the active sidebar category only (not all history). */
  const issuedForCategory = useMemo(() => {
    if (sidebarMode === 'forms' || tplSearch.trim()) return []
    const templatesInCat = activeGroup?.templates || []
    if (!templatesInCat.length) return []
    const keys = new Set(templatesInCat.map(t => t.template_key))
    const ids = new Set(templatesInCat.map(t => t.id))
    return issuedPdfs.filter(row => {
      if (row.template_id && ids.has(row.template_id)) return true
      if (row.template_key && keys.has(row.template_key)) return true
      return false
    })
  }, [issuedPdfs, activeGroup, sidebarMode, tplSearch])

  useEffect(() => {
    setIssuedSelected(new Set())
  }, [activeCategoryId, sidebarMode])

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

  const sidebarBrowseValue = sidebarMode === 'forms'
    ? SIDEBAR_FORMS_ID
    : (activeCategoryId || sidebarBrowseItems.find(i => !i.isForms)?.id || SIDEBAR_FORMS_ID)

  function handleBrowseCategoryChange(value) {
    if (value === SIDEBAR_FORMS_ID) {
      setSidebarMode('forms')
      setSelected(null)
      if (!selectedBlankForm && blankForms[0]) setSelectedBlankForm(blankForms[0])
      return
    }
    setSidebarMode('templates')
    setSelectedBlankForm(null)
    setActiveCategoryId(value)
    const g = groups.find(x => x.category.id === value)
    if (!g?.templates.length) {
      setSelected(null)
      return
    }
    const first = g.templates[0]
    if (first && !g.templates.some(t => t.id === selected?.id)) setSelected(first)
  }

  function mergeMemberFields(member) {
    if (!member) return
    const keys = variables.map(v => v.key).filter(Boolean)
    setFieldValues(prev => {
      const base = {}
      for (const key of keys) base[key] = prev[key] ?? ''
      if (needsMemberPhoto && member.member_id) base.member_id = member.member_id
      const withMember = applyMemberToFieldValues(base, member, keys)
      return church ? applyChurchToFieldValues(withMember, church, { preserveOverrides: true }) : withMember
    })
  }

  function pickMember(m) {
    if (!m) return
    clearBulk()
    setSelectedMember(m)
    setMemberQuery(m.member_name || m.member_id || '')
    setMemberHits([])
    setSharePhone(m.whatsapp || m.mobile || '')
    setShareEmail(m.email || '')
    if (selected) {
      mergeMemberFields(m)
      toast(`Filled from ${m.member_name || m.member_id}`, 'success')
    }
  }

  function clearMember() {
    setSelectedMember(null)
    setMemberQuery('')
    setMemberHits([])
    setSharePhone('')
    setShareEmail('')
    if (selected) setFieldValues(defaultFieldValuesFromTemplate(selected, church, null, selectedCategoryName))
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
      mergeMemberFields(m)
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

  async function handleSaveDraftAndReview() {
    if (!selected) return
    setBusy(true)
    try {
      const row = await saveDraft({
        id: draftId || undefined,
        template_id: selected.id,
        template_key: selected.template_key,
        member_id: fieldValues.member_id || null,
        status: 'draft',
        wizard_step: 2,
        field_values: buildIssueFieldValues(),
        include_tamil: includeTamil,
        created_by: profile?.id,
        created_by_email: profile?.email,
      })
      setDraftId(row.id)
      setDrafts(await getSharedDrafts(30))
      setStep(3)
      toast('Draft saved — moved to Review.', 'success')
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
    const draftValues = d.field_values || {}
    setFieldValues(church ? applyChurchToFieldValues({ ...draftValues }, church, { preserveOverrides: true }) : draftValues)
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

  async function confirmSidebarDelete() {
    if (!deletePrompt) return
    setBusy(true)
    try {
      if (deletePrompt.kind === 'template') {
        const t = deletePrompt.item
        await deletePrintCornerTemplate(t.id, t.storage_path)
        if (selected?.id === t.id) setSelected(null)
        toast(`Deleted “${t.label}”.`, 'success')
      } else {
        const f = deletePrompt.item
        await deletePrintCornerApplicationForm(f.id, f.storage_path)
        if (selectedBlankForm?.id === f.id) setSelectedBlankForm(null)
        toast(`Deleted “${f.label}”.`, 'success')
      }
      await refreshSidebar()
    } catch (e) {
      toast(e.message || 'Delete failed', 'error')
      throw e
    } finally {
      setBusy(false)
    }
  }

  function renderSharedDrafts() {
    if (!selected || selected.template_type === 'certificate') return null
    return (
      <div style={{ marginBottom: 16, padding: 14, borderRadius: 10, background: 'var(--input-bg)', border: '1px solid var(--card-border)' }}>
        <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>Shared drafts</div>
        {visibleDrafts.length === 0 ? (
          <p style={{ fontSize: 12, color: 'var(--text-3)', margin: 0 }}>
            No drafts in this category yet. Use “Save & go to Review” on the Fields step to share with others.
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
    )
  }

  async function handleDeleteIssuedMany(rows) {
    const list = rows || []
    if (!list.length) return
    const label = list.length === 1
      ? (list[0].field_values?.member_name || list[0].member_id || list[0].template_key || list[0].issued_filename)
      : `${list.length} issued PDFs`
    if (!window.confirm(`Delete ${label}?`)) return
    setBusy(true)
    try {
      await deletePrintCornerIssuedMany(list)
      if (lastPdf?.storage_path && list.some(r => r.storage_path === lastPdf.storage_path)) {
        setLastPdf(null)
      }
      setIssuedSelected(new Set())
      await refreshIssuedPdfs()
      toast(`Deleted ${list.length} issued PDF${list.length === 1 ? '' : 's'}.`, 'success')
    } catch (e) {
      toast(e.message || 'Could not delete', 'error')
    } finally {
      setBusy(false)
    }
  }

  function toggleIssuedSelected(id) {
    setIssuedSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function selectAllIssued(rows) {
    setIssuedSelected(new Set(rows.map(r => r.id)))
  }

  function deselectAllIssued() {
    setIssuedSelected(new Set())
  }

  async function handleDeleteIssued(row) {
    const label = row.field_values?.member_name || row.member_id || row.template_key || row.issued_filename
    if (!window.confirm(`Delete issued PDF “${label}” from ${new Date(row.issued_at).toLocaleString()}?`)) return
    setBusy(true)
    try {
      await deletePrintCornerIssued(row)
      if (lastPdf?.storage_path === row.storage_path) setLastPdf(null)
      await refreshIssuedPdfs()
      toast('Issued PDF deleted.', 'success')
    } catch (e) {
      toast(e.message || 'Could not delete', 'error')
    } finally {
      setBusy(false)
    }
  }

  function renderIssuedHistory() {
    if (sidebarMode === 'forms' || tplSearch.trim()) return null
    const catName = activeGroup?.category?.name || 'this category'
    const headerStyle = activeCatStyle
    const rows = issuedForCategory
    const selectedRows = rows.filter(r => issuedSelected.has(r.id))
    const allSelected = rows.length > 0 && selectedRows.length === rows.length

    return (
      <div className="card" style={{ marginTop: 16, padding: 0, overflow: 'hidden' }}>
        <div style={{
          padding: '12px 16px', borderBottom: `1px solid ${headerStyle.badgeBg || 'var(--card-border)'}`,
          background: `linear-gradient(180deg, ${headerStyle.bg || '#eff6ff'} 0%, color-mix(in srgb, ${headerStyle.bg || '#eff6ff'} 82%, #fff) 100%)`,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap',
        }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: headerStyle.badgeColor || 'var(--text-1)' }}>
              Recent issued PDFs — {catName}
            </div>
            <div style={{ fontSize: 11, color: headerStyle.accent || 'var(--text-3)', marginTop: 2, opacity: 0.9 }}>
              This category only · delete manually · auto-removed after {ISSUED_RETENTION_DAYS} days
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            {rows.length > 0 && (
              <>
                <button type="button" disabled={busy || allSelected} onClick={() => selectAllIssued(rows)}
                  style={{
                    padding: '6px 10px', border: `1px solid ${headerStyle.badgeBg || 'var(--card-border)'}`,
                    borderRadius: 7, background: 'rgba(255,255,255,0.55)',
                    fontSize: 12, fontWeight: 600, cursor: 'pointer', color: headerStyle.badgeColor || 'var(--text-2)',
                  }}>
                  Select all
                </button>
                <button type="button" disabled={busy || selectedRows.length === 0} onClick={deselectAllIssued}
                  style={{
                    padding: '6px 10px', border: `1px solid ${headerStyle.badgeBg || 'var(--card-border)'}`,
                    borderRadius: 7, background: 'rgba(255,255,255,0.55)',
                    fontSize: 12, fontWeight: 600, cursor: 'pointer', color: headerStyle.badgeColor || 'var(--text-2)',
                  }}>
                  Deselect all
                </button>
                {selectedRows.length > 0 && (
                  <button type="button" disabled={busy} onClick={() => handleDeleteIssuedMany(selectedRows)}
                    style={{
                      padding: '6px 10px', border: 'none', borderRadius: 7, background: '#fee2e2',
                      fontSize: 12, fontWeight: 700, cursor: 'pointer', color: '#b91c1c',
                    }}>
                    Delete selected ({selectedRows.length})
                  </button>
                )}
              </>
            )}
            <button type="button" disabled={issuedLoading} onClick={refreshIssuedPdfs}
              style={{
                padding: '6px 10px', border: `1px solid ${headerStyle.badgeBg || 'var(--card-border)'}`,
                borderRadius: 7, background: 'rgba(255,255,255,0.55)',
                fontSize: 12, fontWeight: 600, cursor: 'pointer', color: headerStyle.badgeColor || 'var(--text-2)',
              }}>
              {issuedLoading ? 'Refreshing…' : 'Refresh'}
            </button>
          </div>
        </div>
        {issuedLoading && rows.length === 0 ? (
          <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-3)' }}>
            <Loader2 size={18} className="animate-spin" style={{ display: 'inline' }} />
          </div>
        ) : rows.length === 0 ? (
          <div style={{ padding: 20, fontSize: 13, color: 'var(--text-3)' }}>
            No issued PDFs for {catName} yet. Select a template → Review → Issue PDF.
          </div>
        ) : (
          <div style={{ maxHeight: 280, overflowY: 'auto' }}>
            {rows.map(row => {
              const memberLabel = row.field_values?.member_name || row.member_id || '—'
              const when = new Date(row.issued_at).toLocaleString()
              const checked = issuedSelected.has(row.id)
              return (
                <div
                  key={row.id}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px',
                    borderBottom: '1px solid var(--card-border)', fontSize: 13,
                    background: checked ? 'color-mix(in srgb, var(--accent-subtle, #eff6ff) 55%, transparent)' : undefined,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={busy}
                    onChange={() => toggleIssuedSelected(row.id)}
                    aria-label={`Select ${row.template_key || row.issued_filename}`}
                    style={{ flexShrink: 0, width: 16, height: 16, cursor: 'pointer' }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {row.template_key || row.issued_filename}
                      <span style={{ fontWeight: 500, color: 'var(--text-3)' }}> · {memberLabel}</span>
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>
                      {when}
                      {row.issued_by_email ? ` · ${row.issued_by_email}` : ''}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    {row.signed_url && (
                      <>
                        <button type="button" disabled={busy} onClick={() => handlePrintPdf(row.signed_url)}
                          style={{ padding: '5px 8px', border: 'none', borderRadius: 6, background: '#dbeafe', color: '#2563eb', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                          <Printer size={12} style={{ display: 'inline', verticalAlign: 'middle' }} />
                        </button>
                        <button type="button" disabled={busy} onClick={() => handleDownloadFile(row.signed_url, row.issued_filename)}
                          style={{ padding: '5px 8px', border: 'none', borderRadius: 6, background: '#dcfce7', color: '#15803d', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                          <Download size={12} style={{ display: 'inline', verticalAlign: 'middle' }} />
                        </button>
                      </>
                    )}
                    <button type="button" disabled={busy} onClick={() => handleDeleteIssued(row)} title="Delete"
                      style={{ padding: '5px 8px', border: 'none', borderRadius: 6, background: '#fee2e2', color: '#b91c1c', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                      <Trash2 size={12} style={{ display: 'inline', verticalAlign: 'middle' }} />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    )
  }

  function pdfErrorToast(raw) {
      if (/expired or revoked|invalid_grant|Google Drive not connected/i.test(raw)) {
      toast(
        'Google Drive login expired. Open Backup → Disconnect Google → Connect Google again, then retry.',
        'error',
      )
    } else if (/bad request|invalid.*folder|not found/i.test(raw)) {
      toast(
        'Google rejected the merged Word file (not a login issue). Redeploy cms-print-corner with the latest index.ts, then retry Issue PDF.',
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
    const memberIdForPhoto = String(fieldValues.member_id || selectedMember?.member_id || '').trim()
    if (needsMemberPhoto && !memberIdForPhoto) {
      toast('Select a member — Member ID is required for the photo on this template.', 'error')
      return
    }
    setBusy(true)
    try {
      if (needsMemberPhoto) {
        const m = selectedMember?.member_id === memberIdForPhoto
          ? selectedMember
          : await getPrintCornerMemberById(memberIdForPhoto)
        if (!m) {
          toast(`Member “${memberIdForPhoto}” not found.`, 'error')
          return
        }
        const hasPhoto = m.photo_url || await memberPhotoExistsInStorage(m.member_id || memberIdForPhoto)
        if (!hasPhoto) {
          toast(`Member ${m.member_name || m.member_id} has no photo in storage. Upload one in Members first.`, 'error')
          return
        }
      }

      const res = await convertTemplateFromStorage({
        storagePath: selected.storage_path,
        templateKey: selected.template_key,
        templateType: templateStorageType(selected.template_type),
        templateId: selected.id,
        templateLabel: selected.label || '',
        memberId: memberIdForPhoto || null,
        fieldValues: buildIssueFieldValues(),
        issue: true,
        source: 'manual',
        pptxNameFit: resolvePptxNameFit(selected, selectedCategoryName),
      })
      setLastPdf(res)
      await refreshIssuedPdfs()

      if (import.meta.env.DEV && res?.signature_merge) {
        console.info('[Print Corner] signature_merge', res.signature_merge)
      }

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
      }
    } catch (e) {
      if (import.meta.env.DEV && e?.signatureMerge) {
        console.info('[Print Corner] signature_merge (failed)', e.signatureMerge)
      }
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
      await convertBulkLettersToPdf({
        storagePath: selected.storage_path,
        templateKey: selected.template_key,
        templateType: templateStorageType(selected.template_type),
        templateId: selected.id,
        templateLabel: selected.label || '',
        pptxNameFit: resolvePptxNameFit(selected, selectedCategoryName),
        rows: bulkRows,
        onProgress: setBulkProgress,
        output: bulkOutput === 'zip' ? 'zip' : 'single',
      })
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
        templateLabel: selected.label || '',
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
      const rows = await parsePrintCornerTrackerFile(file, variables, selected)
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
          {renderSharedDrafts()}
          {variables.length === 0 && imageVariables.length === 0 ? (
            <p style={{ fontSize: 13, color: 'var(--text-3)', marginBottom: 12 }}>
              No variables on this template yet. Upload a Word file with {'{placeholders}'} in Print Corner Settings.
            </p>
          ) : null}
          {signatureImageStatuses.length > 0 && (
            <div style={{
              marginBottom: 14, padding: '12px 14px', borderRadius: 8, fontSize: 12, lineHeight: 1.5,
              background: '#f5f3ff', border: '1px solid #ddd6fe', color: '#5b21b6',
            }}>
              <div style={{ fontWeight: 700, marginBottom: 8 }}>
                Signature images (auto from Church Setup)
              </div>
              <p style={{ margin: '0 0 10px', fontSize: 11, color: '#6d28d9' }}>
                Set picture Alt Text to <code>{'{presbyter_sign}'}</code> or bare <code>presbyter_sign</code> in Word.
                These replace the placeholder when you issue the letter.
              </p>
              <div style={{ display: 'grid', gap: 8 }}>
                {signatureImageStatuses.map(sig => (
                  <div
                    key={sig.key}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px',
                      borderRadius: 8, background: '#fff', border: `1px solid ${sig.ready ? '#a7f3d0' : '#fde68a'}`,
                    }}
                  >
                    <div style={{
                      width: 52, height: 40, borderRadius: 6, flexShrink: 0,
                      border: '1px solid #e9d5ff', background: '#faf5ff',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
                    }}>
                      {sig.ready
                        ? <img src={sig.url} alt="" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                        : <span style={{ fontSize: 9, color: '#94a3b8', textAlign: 'center', padding: 4 }}>—</span>}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, color: '#4c1d95' }}>
                        <code style={{ fontSize: 11 }}>{`{${sig.key}}`}</code>
                        <span style={{ fontWeight: 500, color: '#7c3aed', marginLeft: 6 }}>{sig.label}</span>
                      </div>
                      <div style={{
                        fontSize: 11, marginTop: 2,
                        color: sig.ready ? '#047857' : '#b45309',
                        display: 'flex', alignItems: 'center', gap: 4,
                      }}>
                        {sig.ready
                          ? <><CheckCircle2 size={12} /> Loaded — ready for issue</>
                          : <><AlertCircle size={12} /> Not uploaded in Church Setup</>}
                      </div>
                    </div>
                    {!sig.ready && (
                      <button
                        type="button"
                        onClick={() => navigate('/church-setup')}
                        style={{
                          flexShrink: 0, padding: '4px 8px', border: 'none', borderRadius: 6,
                          background: '#fef3c7', color: '#b45309', fontSize: 10, fontWeight: 700, cursor: 'pointer',
                        }}
                      >
                        Upload
                      </button>
                    )}
                  </div>
                ))}
              </div>
              {!church && (
                <p style={{ margin: '8px 0 0', fontSize: 11, color: '#6d28d9' }}>Loading Church Setup…</p>
              )}
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
            {variables.map(v => {
              const fromChurch = isChurchSetupFieldKey(v.key)
              const overridable = isOverridableChurchFieldKey(v.key)
              const churchVal = fromChurch && church ? churchSetupValueForKey(v.key, church) : ''
              const displayValue = overridable
                ? resolvedFieldValue(v.key)
                : fromChurch
                  ? churchVal
                  : (fieldValues[v.key] ?? '')
              const emptyChurch = fromChurch && church && !String(displayValue ?? '').trim()
              const churchLoading = fromChurch && !church
              const readOnly = fromChurch && !overridable
              const isPastorKey = ['presbyter_name', 'pastor_name'].includes(
                String(v.key || '').trim().toLowerCase().replace(/[\s-]+/g, '_'),
              )
              return (
                <label key={v.key} style={{ fontSize: 12, fontWeight: 600 }}>
                  <span style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                    {v.label || v.key}
                    {fromChurch && (
                      <span style={{ fontSize: 11, fontWeight: 500, color: '#1d4ed8' }}>
                        {overridable ? 'auto-filled · editable' : 'auto from Church Setup'}
                      </span>
                    )}
                  </span>
                  <input
                    readOnly={readOnly}
                    value={displayValue}
                    onChange={readOnly ? undefined : e => {
                      if (overridable) setOverridableField(v.key, e.target.value)
                      else {
                        clearBulk()
                        setFieldValues(f => ({ ...f, [v.key]: e.target.value }))
                      }
                    }}
                    onBlur={!readOnly && isMemberIdField(v.key) ? e => handleMemberIdLookup(e.target.value) : undefined}
                    onKeyDown={!readOnly && isMemberIdField(v.key) ? e => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        handleMemberIdLookup(e.currentTarget.value)
                      }
                    } : undefined}
                    placeholder={
                      churchLoading
                        ? 'Loading from Church Setup…'
                        : isMemberIdField(v.key)
                          ? 'Enter ID and press Enter or tab out'
                          : emptyChurch && isPastorKey
                            ? 'Not set — add Presbyter name in Church Setup'
                            : emptyChurch
                              ? 'Not set in Church Setup'
                              : undefined
                    }
                    style={{
                      ...INPUT,
                      marginTop: 4,
                      fontWeight: 400,
                      ...((fromChurch || overridable) && displayValue
                        ? { background: '#ecfdf5', borderColor: '#6ee7b7', color: 'var(--text-1)' }
                        : null),
                      ...(emptyChurch ? { borderColor: '#f59e0b', background: '#fffbeb' } : null),
                      ...(churchLoading ? { color: 'var(--text-3)' } : null),
                      ...(readOnly ? { cursor: 'default' } : null),
                    }}
                  />
                  {emptyChurch && isPastorKey && (
                    <button
                      type="button"
                      onClick={() => navigate('/church-setup')}
                      style={{
                        display: 'block', marginTop: 4, padding: 0, border: 'none', background: 'none',
                        fontSize: 11, fontWeight: 600, color: '#b45309', cursor: 'pointer', textAlign: 'left',
                      }}
                    >
                      Open Church Setup → set Presbyter / Pastor name, then Save
                    </button>
                  )}
                  {emptyChurch && !isPastorKey && (
                    <button
                      type="button"
                      onClick={() => navigate('/church-setup')}
                      style={{
                        display: 'block', marginTop: 4, padding: 0, border: 'none', background: 'none',
                        fontSize: 11, fontWeight: 600, color: '#b45309', cursor: 'pointer', textAlign: 'left',
                      }}
                    >
                      Open Church Setup to set this value
                    </button>
                  )}
                </label>
              )
            })}
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 4 }}>
            {showDrafts ? (
              <button type="button" disabled={busy} onClick={handleSaveDraftAndReview}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: busy ? 'wait' : 'pointer' }}>
                <Save size={14} /> Save & go to Review
              </button>
            ) : (
              <button type="button" onClick={() => setStep(3)}
                style={{ padding: '8px 16px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
                Review →
              </button>
            )}
          </div>
        </div>
      )
    }

    if (step === 3) {
      return (
        <div>
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
              {variables.filter(v => String(resolvedFieldValue(v.key) ?? '').trim()).map(v => (
                  <div key={v.key} style={{ marginBottom: 4 }}>
                    <strong>{v.label || v.key}:</strong> {resolvedFieldValue(v.key)}
                  </div>
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
        <aside
          className="pc-sidebar-panel"
          style={{
            width: 360, flexShrink: 0, maxWidth: '100%',
            display: 'flex', flexDirection: 'column', maxHeight: 'calc(100vh - 160px)',
          }}
        >
          {/* Header + search */}
          <div className="pc-sidebar-panel__header" style={{ padding: '14px 14px 12px', flexShrink: 0 }}>
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

          {/* Category picker — hidden while searching (global results instead) */}
          {!tplSearch.trim() && (
            <div style={{
              padding: '10px 12px', borderBottom: '1px solid var(--card-border)', flexShrink: 0,
            }} className="pc-sidebar-panel__category">
              <label style={{ display: 'block', fontSize: 10, fontWeight: 800, letterSpacing: '0.07em', color: 'var(--text-3)', marginBottom: 6 }}>
                CATEGORY
              </label>
              <select
                value={sidebarBrowseValue}
                onChange={e => handleBrowseCategoryChange(e.target.value)}
                style={{ ...INPUT, cursor: 'pointer', fontWeight: 600 }}
              >
                {sidebarBrowseItems.map(item => (
                  <option key={item.categoryId} value={item.id}>
                    {item.name} ({item.count})
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Item list */}
          <div className="pc-sidebar-list" style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
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
                              className={`pc-sidebar-hit${active ? ' is-active' : ''}`}
                              onClick={() => { setSidebarMode('forms'); setSelectedBlankForm(f) }}
                              style={{ '--pc-accent': FORMS_STYLE.accent, '--pc-active-bg': FORMS_STYLE.bg }}
                            >
                              <span className="pc-sidebar-icon" style={{ color: FORMS_STYLE.accent }}>
                                <ClipboardList size={15} />
                              </span>
                              <span style={{ flex: 1, minWidth: 0 }}>
                                <span className="pc-sidebar-label">{f.label}</span>
                                <span className="pc-sidebar-sub">Application form</span>
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
                          const display = resolveTemplateTypeDisplay(t, catName)
                          const Icon = TYPE_ICONS[display.iconKey] || FileText
                          const active = selected?.id === t.id
                          const accent = display.color || '#2563eb'
                          const ready = !!t.storage_path
                          return (
                            <button
                              key={t.id}
                              type="button"
                              className={`pc-sidebar-hit${active ? ' is-active' : ''}`}
                              onClick={() => { setSidebarMode('templates'); setSelected(t) }}
                              style={{ '--pc-accent': accent, '--pc-active-bg': 'var(--accent-subtle, #eff6ff)' }}
                            >
                              <span className="pc-sidebar-icon" style={{ color: accent }}>
                                <Icon size={15} />
                              </span>
                              <span style={{ flex: 1, minWidth: 0 }}>
                                <span className="pc-sidebar-label">{t.label}</span>
                                <span className="pc-sidebar-sub">{catName}</span>
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
                      <div
                        key={f.id}
                        className={`pc-sidebar-row${active ? ' is-active' : ''}`}
                        style={{ '--pc-accent': FORMS_STYLE.accent, '--pc-active-bg': FORMS_STYLE.bg }}
                      >
                        <button
                          type="button"
                          className="pc-sidebar-select"
                          onClick={() => { setSidebarMode('forms'); setSelectedBlankForm(f) }}
                        >
                          <span className="pc-sidebar-icon" style={{ color: FORMS_STYLE.accent }}>
                            <ClipboardList size={15} />
                          </span>
                          <span style={{ flex: 1, minWidth: 0 }}>
                            <span className="pc-sidebar-label">{f.label}</span>
                            <span className="pc-sidebar-sub">{ready ? kind : 'Upload needed'}</span>
                          </span>
                          <span style={{
                            fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 99, flexShrink: 0,
                            background: ready ? '#dcfce7' : '#ffedd5',
                            color: ready ? '#15803d' : '#c2410c',
                          }}>
                            {ready ? 'Ready' : 'Missing'}
                          </span>
                        </button>
                        <button
                          type="button"
                          className="pc-sidebar-delete"
                          title="Delete form (master password)"
                          onClick={() => setDeletePrompt({ kind: 'form', item: f })}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
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
                {sidebarTemplates.map(({ t, catName }) => {
                  const display = resolveTemplateTypeDisplay(t, catName)
                  const Icon = TYPE_ICONS[display.iconKey] || FileText
                  const active = selected?.id === t.id
                  const accent = display.color || activeCatStyle.accent
                  const ready = !!t.storage_path
                  const typeLabel = display.label || 'Template'
                  return (
                    <div
                      key={t.id}
                      className={`pc-sidebar-row${active ? ' is-active' : ''}`}
                      style={{ '--pc-accent': accent, '--pc-active-bg': 'var(--accent-subtle, #eff6ff)' }}
                    >
                      <button
                        type="button"
                        className="pc-sidebar-select"
                        onClick={() => { setSidebarMode('templates'); setSelected(t) }}
                      >
                        <span className="pc-sidebar-icon" style={{ color: accent }}>
                          <Icon size={15} />
                        </span>
                        <span style={{ flex: 1, minWidth: 0 }}>
                          <span className="pc-sidebar-label">{t.label}</span>
                          <span className="pc-sidebar-sub">{typeLabel}{ready ? '' : ' · file needed'}</span>
                        </span>
                        <span style={{
                          fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 99, flexShrink: 0,
                          background: ready ? '#dcfce7' : '#ffedd5',
                          color: ready ? '#15803d' : '#c2410c',
                        }}>
                          {ready ? 'Ready' : 'Missing'}
                        </span>
                      </button>
                      <button
                        type="button"
                        className="pc-sidebar-delete"
                        title="Delete template (master password)"
                        onClick={() => setDeletePrompt({ kind: 'template', item: t })}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
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

      {renderIssuedHistory()}

      <MasterDeleteGate
        open={!!deletePrompt}
        title={deletePrompt?.kind === 'form' ? 'Delete application form' : 'Delete template'}
        message={
          deletePrompt
            ? `Enter the master password to permanently delete “${deletePrompt.item?.label}”. This cannot be undone.`
            : ''
        }
        onConfirm={confirmSidebarDelete}
        onClose={() => setDeletePrompt(null)}
      />
    </div>
  )
}
