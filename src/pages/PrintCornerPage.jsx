import { useState, useEffect, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Printer, Settings, Loader2, FileText, Award, Mail, ClipboardList,
  ChevronRight, CheckCircle2, AlertCircle,
} from 'lucide-react'
import PageHeader from '../components/ui/PageHeader'
import { useToast } from '../lib/toast'
import {
  getPrintCornerCatalog,
  pingPrintCorner,
  convertTemplateFromStorage,
  TEMPLATE_TYPES,
} from '../lib/printCornerLib'

const TYPE_ICONS = {
  certificate: Award,
  letter: Mail,
  form: ClipboardList,
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

  const [loading, setLoading] = useState(true)
  const [groups, setGroups] = useState([])
  const [selected, setSelected] = useState(null)
  const [ping, setPing] = useState(null)
  const [busy, setBusy] = useState(false)
  const [lastPdf, setLastPdf] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const { categories, templates } = await getPrintCornerCatalog()
      const top = categories.filter(c => !c.parent_id)
      setGroups(groupTemplates(top, templates))
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

  const selectedMeta = useMemo(() => {
    if (!selected) return null
    return TEMPLATE_TYPES[selected.template_type] || TEMPLATE_TYPES.letter
  }, [selected])

  async function handleTestConvert() {
    if (!selected?.storage_path) {
      toast('Upload a .docx for this template in Storage first (see setup doc).', 'error')
      return
    }
    setBusy(true)
    try {
      const res = await convertTemplateFromStorage({
        storagePath: selected.storage_path,
        templateKey: selected.template_key,
        templateType: selected.template_type === 'form' ? 'forms'
          : selected.template_type === 'certificate' ? 'certificates' : 'letters',
        issue: true,
        source: 'manual',
      })
      setLastPdf(res)
      toast('PDF created and saved to issued folder.', 'success')
    } catch (e) {
      toast(e.message || 'Convert failed', 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="page-container">
      <PageHeader
        icon={Printer}
        title="Print Corner"
        subtitle="Certificates, letters, and forms — wizard coming next"
      >
        <button
          type="button"
          onClick={() => navigate('/print-corner/settings')}
          title="Print Corner Settings"
          style={{
            padding: '8px 10px', background: 'var(--card-bg)', border: '1.5px solid var(--card-border)',
            borderRadius: 8, cursor: 'pointer', display: 'flex', alignItems: 'center', color: 'var(--text-2)',
          }}
        >
          <Settings size={15} />
        </button>
      </PageHeader>

      <div style={{
        display: 'flex', gap: 16, alignItems: 'stretch', minHeight: 420,
      }}>
        {/* Side panel */}
        <aside style={{
          width: 260, flexShrink: 0, background: 'var(--card-bg)',
          border: '1px solid var(--card-border)', borderRadius: 10, overflow: 'hidden',
        }}>
          <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--card-border)', fontSize: 11, fontWeight: 800, letterSpacing: '0.08em', color: 'var(--text-3)' }}>
            TEMPLATES
          </div>
          {loading ? (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-3)' }}>
              <Loader2 size={20} className="animate-spin" />
            </div>
          ) : groups.map(g => (
            <div key={g.category.id}>
              <div style={{ padding: '10px 14px 6px', fontSize: 12, fontWeight: 700, color: 'var(--text-2)' }}>
                {g.category.name}
              </div>
              {g.templates.map(t => {
                const Icon = TYPE_ICONS[t.template_type] || FileText
                const active = selected?.id === t.id
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setSelected(t)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                      padding: '8px 14px', border: 'none', textAlign: 'left', cursor: 'pointer',
                      background: active ? 'var(--accent-subtle, #eff6ff)' : 'transparent',
                      borderLeft: active ? '3px solid var(--accent)' : '3px solid transparent',
                      fontSize: 13, color: 'var(--text-1)',
                    }}
                  >
                    <Icon size={14} style={{ color: TEMPLATE_TYPES[t.template_type]?.color || '#64748b', flexShrink: 0 }} />
                    <span style={{ flex: 1 }}>{t.label}</span>
                    <ChevronRight size={12} style={{ opacity: 0.4 }} />
                  </button>
                )
              })}
            </div>
          ))}
        </aside>

        {/* Main workspace */}
        <main style={{
          flex: 1, background: 'var(--card-bg)', border: '1px solid var(--card-border)',
          borderRadius: 10, padding: 20,
        }}>
          {/* Connection status */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, padding: '10px 12px',
            borderRadius: 8, background: ping?.cloudconvert ? '#f0fdf4' : '#fef2f2',
            border: `1px solid ${ping?.cloudconvert ? '#bbf7d0' : '#fecaca'}`,
            fontSize: 13,
          }}>
            {ping?.cloudconvert
              ? <CheckCircle2 size={16} style={{ color: '#16a34a' }} />
              : <AlertCircle size={16} style={{ color: '#dc2626' }} />}
            <span>
              {ping?.cloudconvert
                ? 'CloudConvert connected (Edge Function + API key OK)'
                : ping?.error || 'CloudConvert not ready — set CLOUDCONVERT_API_KEY and deploy cms-print-corner'}
            </span>
          </div>

          {!selected ? (
            <div style={{ color: 'var(--text-3)', fontSize: 14, padding: '40px 0', textAlign: 'center' }}>
              Select a template from the left panel.
            </div>
          ) : (
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
                  <span style={{ color: '#c2410c' }}>Not uploaded yet — add .docx in Supabase Storage</span>
                )}
              </div>

              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  disabled={busy || !selected.storage_path}
                  onClick={handleTestConvert}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 8, padding: '9px 16px',
                    background: '#2563eb', color: '#fff', border: 'none', borderRadius: 8,
                    fontSize: 13, fontWeight: 600, cursor: busy ? 'wait' : 'pointer',
                    opacity: !selected.storage_path ? 0.5 : 1,
                  }}
                >
                  {busy ? <Loader2 size={14} className="animate-spin" /> : <Printer size={14} />}
                  Test convert → PDF
                </button>
              </div>

              {lastPdf?.signed_url && (
                <div style={{ marginTop: 20, padding: 14, borderRadius: 8, background: 'var(--input-bg)', border: '1px solid var(--card-border)' }}>
                  <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>Last issued PDF</div>
                  <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 8 }}>{lastPdf.storage_path}</div>
                  <a href={lastPdf.signed_url} target="_blank" rel="noreferrer" style={{ fontSize: 13, fontWeight: 600, color: '#2563eb' }}>
                    Open PDF
                  </a>
                </div>
              )}

              <p style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 24 }}>
                Full wizard (member search, variables, preview, drafts) is the next step.
                Setup guide: <code>docs/PRINT_CORNER_CLOUDCONVERT_SETUP.md</code>
              </p>
            </>
          )}
        </main>
      </div>
    </div>
  )
}
