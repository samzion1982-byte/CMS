import { useState, useEffect, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import {
  Printer, Settings, Loader2, FileText, Award, Mail, ClipboardList,
  ChevronRight, CheckCircle2, AlertCircle, User, Save, FolderOpen, Search,
} from 'lucide-react'
import PageHeader from '../components/ui/PageHeader'
import { useToast } from '../lib/toast'
import {
  getPrintCornerCatalog,
  pingPrintCorner,
  convertTemplateFromStorage,
  TEMPLATE_TYPES,
  getSharedDrafts,
  saveDraft,
  searchPrintCornerMembers,
  getChurchForPrintCorner,
  defaultFieldValuesFromTemplate,
  normalizeTemplateVariables,
} from '../lib/printCornerLib'

const TYPE_ICONS = {
  certificate: Award,
  letter: Mail,
  form: ClipboardList,
}

const STEPS = [
  { id: 1, label: 'Template' },
  { id: 2, label: 'Member' },
  { id: 3, label: 'Fields' },
  { id: 4, label: 'Review' },
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
  for (const t of templates) {
    const bucket = byCat.get(t.category_id)
    if (bucket) bucket.templates.push(t)
  }
  return [...byCat.values()].sort((a, b) => a.category.sort_order - b.category.sort_order)
}

export default function PrintCornerPage() {
  const navigate = useNavigate()
  const toast = useToast()
  const { profile } = useAuth()

  const [loading, setLoading] = useState(true)
  const [groups, setGroups] = useState([])
  const [selected, setSelected] = useState(null)
  const [ping, setPing] = useState(null)
  const [busy, setBusy] = useState(false)
  const [lastPdf, setLastPdf] = useState(null)

  const [step, setStep] = useState(1)
  const [church, setChurch] = useState(null)
  const [memberQuery, setMemberQuery] = useState('')
  const [memberHits, setMemberHits] = useState([])
  const [member, setMember] = useState(null)
  const [fieldValues, setFieldValues] = useState({})
  const [includeTamil, setIncludeTamil] = useState(false)
  const [draftId, setDraftId] = useState(null)
  const [drafts, setDrafts] = useState([])
  const [showDrafts, setShowDrafts] = useState(false)

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
    setMember(null)
    setMemberQuery('')
    setMemberHits([])
    setDraftId(null)
    setIncludeTamil(!!selected.include_tamil)
    setFieldValues(defaultFieldValuesFromTemplate(selected, church, null))
  }, [selected?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (member) {
      setFieldValues(prev => ({
        ...defaultFieldValuesFromTemplate(selected, church, member),
        ...prev,
        ...defaultFieldValuesFromTemplate(selected, church, member),
      }))
    }
  }, [member, church, selected])

  useEffect(() => {
    const q = memberQuery.trim()
    if (q.length < 2) { setMemberHits([]); return }
    const t = setTimeout(async () => {
      try {
        setMemberHits(await searchPrintCornerMembers(q))
      } catch { setMemberHits([]) }
    }, 250)
    return () => clearTimeout(t)
  }, [memberQuery])

  const selectedMeta = useMemo(() => {
    if (!selected) return null
    return TEMPLATE_TYPES[selected.template_type] || TEMPLATE_TYPES.letter
  }, [selected])

  const variables = useMemo(
    () => normalizeTemplateVariables(selected?.variables),
    [selected],
  )

  async function handleSaveDraft() {
    if (!selected) return
    setBusy(true)
    try {
      const row = await saveDraft({
        id: draftId || undefined,
        template_id: selected.id,
        template_key: selected.template_key,
        member_id: member?.member_id || null,
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
    setMember(d.member_id ? { member_id: d.member_id, member_name: d.field_values?.member_name || d.member_id } : null)
    setFieldValues(d.field_values || {})
    setIncludeTamil(!!d.include_tamil)
    setStep(d.wizard_step || 3)
    setShowDrafts(false)
    toast('Draft loaded.', 'info')
  }

  async function handleTestConvert() {
    if (!selected?.storage_path) {
      toast('Upload a .docx for this template in Print Corner Settings first.', 'error')
      return
    }
    setBusy(true)
    try {
      const res = await convertTemplateFromStorage({
        storagePath: selected.storage_path,
        templateKey: selected.template_key,
        templateType: selected.template_type === 'form' ? 'forms'
          : selected.template_type === 'certificate' ? 'certificates' : 'letters',
        memberId: member?.member_id || null,
        fieldValues,
        issue: true,
        source: member ? 'register' : 'manual',
      })
      setLastPdf(res)
      toast('PDF created and saved to issued folder.', 'success')
    } catch (e) {
      toast(e.message || 'Convert failed', 'error')
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
          <p style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 12 }}>
            Link a member (optional). Leave blank for a generic letter.
          </p>
          {member ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 12, borderRadius: 8, background: 'var(--input-bg)', border: '1px solid var(--card-border)', marginBottom: 12 }}>
              <div>
                <div style={{ fontWeight: 600 }}>{member.member_name}</div>
                <div style={{ fontSize: 12, color: 'var(--text-3)' }}>{member.member_id} · {member.mobile || '—'}</div>
              </div>
              <button type="button" onClick={() => setMember(null)} style={{ fontSize: 12, color: '#dc2626', background: 'none', border: 'none', cursor: 'pointer' }}>Clear</button>
            </div>
          ) : (
            <div style={{ position: 'relative', marginBottom: 12 }}>
              <Search size={14} style={{ position: 'absolute', left: 10, top: 11, color: 'var(--text-3)' }} />
              <input value={memberQuery} onChange={e => setMemberQuery(e.target.value)} placeholder="Search name, ID, mobile…" style={{ ...INPUT, paddingLeft: 32 }} />
              {memberHits.length > 0 && (
                <div style={{ position: 'absolute', zIndex: 5, left: 0, right: 0, top: '100%', marginTop: 4, background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.08)', maxHeight: 220, overflow: 'auto' }}>
                  {memberHits.map(m => (
                    <button key={m.member_id} type="button" onClick={() => { setMember(m); setMemberQuery(''); setMemberHits([]) }}
                      style={{ display: 'block', width: '100%', textAlign: 'left', padding: '10px 12px', border: 'none', borderBottom: '1px solid var(--card-border)', background: 'transparent', cursor: 'pointer', fontSize: 13 }}>
                      <strong>{m.member_name}</strong> · {m.member_id}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          <button type="button" onClick={() => setStep(3)} style={{ padding: '8px 16px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
            Continue → Fields
          </button>
        </div>
      )
    }

    if (step === 3) {
      return (
        <div>
          {selected.include_tamil && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, marginBottom: 14 }}>
              <input type="checkbox" checked={includeTamil} onChange={e => setIncludeTamil(e.target.checked)} />
              Include Tamil text block
            </label>
          )}
          {variables.length === 0 ? (
            <p style={{ fontSize: 13, color: 'var(--text-3)', marginBottom: 12 }}>
              No variables on this template yet. Upload a Word file with {'{placeholders}'} in Print Corner Settings.
            </p>
          ) : null}
          <div style={{ display: 'grid', gap: 10, marginBottom: 16 }}>
            {variables.map(v => (
              <label key={v.key} style={{ fontSize: 12, fontWeight: 600 }}>
                {v.label || v.key}
                <input value={fieldValues[v.key] ?? ''} onChange={e => setFieldValues(f => ({ ...f, [v.key]: e.target.value }))}
                  style={{ ...INPUT, marginTop: 4, fontWeight: 400 }} />
              </label>
            ))}
          </div>
          <button type="button" onClick={() => setStep(4)} style={{ padding: '8px 16px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
            Review →
          </button>
        </div>
      )
    }

    if (step === 4) {
      return (
        <div>
          <div style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 16, lineHeight: 1.6 }}>
            <div><strong>Template:</strong> {selected.label}</div>
            <div><strong>Member:</strong> {member?.member_name || '— (blank)'}</div>
            {includeTamil && <div><strong>Tamil:</strong> Yes</div>}
          </div>
          <div style={{ padding: 12, borderRadius: 8, background: 'var(--input-bg)', border: '1px solid var(--card-border)', marginBottom: 16, maxHeight: 200, overflow: 'auto', fontSize: 12 }}>
            {Object.entries(fieldValues).filter(([, val]) => val).map(([k, val]) => (
              <div key={k} style={{ marginBottom: 4 }}><strong>{k}:</strong> {val}</div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button type="button" disabled={busy} onClick={handleSaveDraft}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 16px', background: 'var(--card-bg)', border: '1.5px solid var(--card-border)', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
              <Save size={14} /> Save shared draft
            </button>
            {selected.template_type === 'letter' || selected.template_type === 'form' ? (
              <button type="button" disabled={busy || !selected.storage_path} onClick={handleTestConvert}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '9px 16px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: busy ? 'wait' : 'pointer', opacity: !selected.storage_path ? 0.5 : 1 }}>
                {busy ? <Loader2 size={14} className="animate-spin" /> : <Printer size={14} />}
                Issue PDF
              </button>
            ) : (
              <span style={{ fontSize: 12, color: 'var(--text-3)', alignSelf: 'center' }}>Built-in certificates — PDF coming next</span>
            )}
          </div>
          {lastPdf?.signed_url && (
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
          <User size={14} /> Start wizard
        </button>
      </>
    )
  }

  return (
    <div className="page-container">
      <PageHeader icon={Printer} title="Print Corner" subtitle="Certificates, letters, and forms">
        <button type="button" onClick={() => setShowDrafts(s => !s)}
          style={{ padding: '8px 10px', background: 'var(--card-bg)', border: '1.5px solid var(--card-border)', borderRadius: 8, cursor: 'pointer', display: 'flex', alignItems: 'center', color: 'var(--text-2)', marginRight: 8 }}
          title="Shared drafts">
          <FolderOpen size={15} />
        </button>
        <button type="button" onClick={() => navigate('/print-corner/settings')} title="Print Corner Settings"
          style={{ padding: '8px 10px', background: 'var(--card-bg)', border: '1.5px solid var(--card-border)', borderRadius: 8, cursor: 'pointer', display: 'flex', alignItems: 'center', color: 'var(--text-2)' }}>
          <Settings size={15} />
        </button>
      </PageHeader>

      {showDrafts && (
        <div style={{ marginBottom: 16, padding: 14, borderRadius: 10, background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}>
          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>Shared drafts</div>
          {drafts.length === 0 ? (
            <p style={{ fontSize: 12, color: 'var(--text-3)', margin: 0 }}>No drafts yet.</p>
          ) : drafts.map(d => (
            <button key={d.id} type="button" onClick={() => loadDraft(d)}
              style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 0', border: 'none', borderBottom: '1px solid var(--card-border)', background: 'transparent', cursor: 'pointer', fontSize: 13 }}>
              <strong>{d.template_key}</strong> · {d.member_id || 'blank'} · {new Date(d.updated_at).toLocaleString()}
            </button>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', gap: 16, alignItems: 'stretch', minHeight: 420 }}>
        <aside style={{ width: 260, flexShrink: 0, background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: 10, overflow: 'hidden' }}>
          <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--card-border)', fontSize: 11, fontWeight: 800, letterSpacing: '0.08em', color: 'var(--text-3)' }}>
            TEMPLATES
          </div>
          {loading ? (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-3)' }}>
              <Loader2 size={20} className="animate-spin" />
            </div>
          ) : groups.map(g => (
            <div key={g.category.id}>
              <div style={{ padding: '10px 14px 6px', fontSize: 12, fontWeight: 700, color: 'var(--text-2)' }}>{g.category.name}</div>
              {g.templates.map(t => {
                const Icon = TYPE_ICONS[t.template_type] || FileText
                const active = selected?.id === t.id
                return (
                  <button key={t.id} type="button" onClick={() => setSelected(t)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                      padding: '8px 14px', border: 'none', textAlign: 'left', cursor: 'pointer',
                      background: active ? 'var(--accent-subtle, #eff6ff)' : 'transparent',
                      borderLeft: active ? '3px solid var(--accent)' : '3px solid transparent',
                      fontSize: 13, color: 'var(--text-1)',
                    }}>
                    <Icon size={14} style={{ color: TEMPLATE_TYPES[t.template_type]?.color || '#64748b', flexShrink: 0 }} />
                    <span style={{ flex: 1 }}>{t.label}</span>
                    <ChevronRight size={12} style={{ opacity: 0.4 }} />
                  </button>
                )
              })}
            </div>
          ))}
        </aside>

        <main style={{ flex: 1, background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: 10, padding: 20 }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, padding: '10px 12px',
            borderRadius: 8, background: ping?.cloudconvert ? '#f0fdf4' : '#fef2f2',
            border: `1px solid ${ping?.cloudconvert ? '#bbf7d0' : '#fecaca'}`, fontSize: 13,
          }}>
            {ping?.cloudconvert
              ? <CheckCircle2 size={16} style={{ color: '#16a34a' }} />
              : <AlertCircle size={16} style={{ color: '#dc2626' }} />}
            <span>
              {ping?.cloudconvert
                ? 'CloudConvert ready — PDF issue available when credits allow'
                : ping?.error || 'CloudConvert not ready — wizard & drafts still work'}
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
