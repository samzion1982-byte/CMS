/* ═══════════════════════════════════════════════════════════════
   BulkEventExportModal.jsx — Bulk export Event Recorder extracts
   as PDF files packaged into a downloadable ZIP
   ═══════════════════════════════════════════════════════════════ */

import { useState, useEffect, useMemo } from 'react'
import { X, FileDown, Loader2, CheckSquare, Square } from 'lucide-react'
import JSZip from 'jszip'
import { supabase } from '../lib/supabase'
import { exportEventExtractPDFs, recordFolderName } from '../lib/exportEventExtractPDF'

const KIND_OPTIONS = [
  { id: 'all', label: 'All' },
  { id: 'baptism', label: 'Baptism' },
  { id: 'confirmation', label: 'Confirmation' },
  { id: 'wedding', label: 'Wedding' },
  { id: 'burial', label: 'Burial' },
]

const TABLES = {
  baptism: 'baptism_records',
  confirmation: 'confirmation_records',
  wedding: 'wedding_records',
  burial: 'burial_records',
}

const FOLDER_NAMES = {
  baptism: 'Baptism',
  confirmation: 'Confirmation',
  wedding: 'Wedding',
  burial: 'Burial',
}

function stampNow() {
  const now = new Date()
  const dd = String(now.getDate()).padStart(2, '0')
  const mm = String(now.getMonth() + 1).padStart(2, '0')
  const yyyy = now.getFullYear()
  const hh = String(now.getHours()).padStart(2, '0')
  const min = String(now.getMinutes()).padStart(2, '0')
  return `${dd}-${mm}-${yyyy}_${hh}-${min}`
}

/** Fetch distinct years that have at least one record (newest first). */
async function fetchDistinctYears(table) {
  const years = []
  let cursor = null
  // One lightweight query per distinct year — avoids missing years on large tables
  for (;;) {
    let q = supabase
      .from(table)
      .select('year')
      .not('year', 'is', null)
      .order('year', { ascending: false })
      .limit(1)
    if (cursor != null) q = q.lt('year', cursor)
    const { data, error } = await q
    if (error) throw error
    if (!data?.length) break
    const y = Number(data[0].year)
    if (!Number.isFinite(y)) break
    years.push(y)
    cursor = y
  }
  return years
}

async function fetchAvailableYears(kinds) {
  const yearSet = new Set()
  const lists = await Promise.all(kinds.map(k => fetchDistinctYears(TABLES[k])))
  for (const list of lists) {
    for (const y of list) yearSet.add(y)
  }
  return [...yearSet].sort((a, b) => b - a)
}

export default function BulkEventExportModal({ onClose, initialKind = 'all' }) {
  const [kind, setKind] = useState(
    KIND_OPTIONS.some(k => k.id === initialKind) ? initialKind : 'all',
  )
  const [years, setYears] = useState(() => new Set())
  const [yearList, setYearList] = useState([])
  const [loadingYears, setLoadingYears] = useState(true)
  const [church, setChurch] = useState(null)
  const [counts, setCounts] = useState(null)
  const [counting, setCounting] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [progress, setProgress] = useState({ current: 0, total: 0, name: '' })
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)

  const selectedYears = useMemo(
    () => [...years].sort((a, b) => b - a),
    [years],
  )
  const kindsToExport = kind === 'all'
    ? ['baptism', 'confirmation', 'wedding', 'burial']
    : [kind]

  useEffect(() => {
    supabase
      .from('churches')
      .select('church_name,denomination,diocese,address,city,pincode,presbyter_name,pastor_name,logo_url,diocese_logo_url')
      .limit(1)
      .maybeSingle()
      .then(({ data }) => setChurch(data))
  }, [])

  // Load only years that have records for the selected event type(s)
  useEffect(() => {
    let cancelled = false
    async function loadYears() {
      setLoadingYears(true)
      setError(null)
      setResult(null)
      setCounts(null)
      try {
        const available = await fetchAvailableYears(kindsToExport)
        if (cancelled) return
        setYearList(available)
        setYears(prev => {
          const kept = available.filter(y => prev.has(y))
          if (kept.length) return new Set(kept)
          // Default to most recent year with data
          return available.length ? new Set([available[0]]) : new Set()
        })
      } catch (e) {
        if (!cancelled) {
          setYearList([])
          setYears(new Set())
          setError(e.message || 'Failed to load available years')
        }
      } finally {
        if (!cancelled) setLoadingYears(false)
      }
    }
    loadYears()
    return () => { cancelled = true }
  }, [kind]) // eslint-disable-line react-hooks/exhaustive-deps

  // Preview counts whenever kind / years change
  useEffect(() => {
    let cancelled = false
    async function loadCounts() {
      if (loadingYears || selectedYears.length === 0) {
        setCounts(null)
        return
      }
      setCounting(true)
      setResult(null)
      setError(null)
      try {
        const next = {}
        let total = 0
        for (const k of kindsToExport) {
          const { count, error: err } = await supabase
            .from(TABLES[k])
            .select('id', { count: 'exact', head: true })
            .in('year', selectedYears)
          if (err) throw err
          next[k] = count || 0
          total += count || 0
        }
        if (!cancelled) setCounts({ ...next, total })
      } catch (e) {
        if (!cancelled) {
          setCounts(null)
          setError(e.message || 'Failed to count records')
        }
      } finally {
        if (!cancelled) setCounting(false)
      }
    }
    loadCounts()
    return () => { cancelled = true }
  }, [kind, loadingYears, selectedYears.join(',')]) // eslint-disable-line react-hooks/exhaustive-deps

  function toggleYear(y) {
    setYears(prev => {
      const next = new Set(prev)
      if (next.has(y)) next.delete(y)
      else next.add(y)
      return next
    })
  }

  function selectRecent(n) {
    setYears(new Set(yearList.slice(0, n)))
  }

  async function handleExport() {
    if (!selectedYears.length) {
      setError('Select at least one year')
      return
    }
    if (counts && counts.total === 0) {
      setError('No records found for the selected filters')
      return
    }

    setGenerating(true)
    setError(null)
    setResult(null)
    setProgress({ current: 0, total: counts?.total || 0, name: 'Loading…' })

    let exported = 0
    let failed = 0

    try {
      const zip = new JSZip()
      const root = zip.folder('event_extracts')

      // Collect all jobs first so progress total is accurate
      const jobs = []
      for (const k of kindsToExport) {
        const { data, error: err } = await supabase
          .from(TABLES[k])
          .select('*')
          .in('year', selectedYears)
          .order('year', { ascending: false })
          .order('seq_num', { ascending: true })
        if (err) throw err
        for (const rec of data || []) {
          jobs.push({ kind: k, record: rec })
        }
      }

      setProgress({ current: 0, total: jobs.length, name: '' })

      for (let i = 0; i < jobs.length; i++) {
        const { kind: k, record } = jobs[i]
        const label = k === 'wedding'
          ? `${record.name_groom || ''} & ${record.name_bride || ''}`.trim()
          : (record.name || '')
        const sn = `${String(record.seq_num).padStart(4, '0')}/${record.year}`
        setProgress({ current: i + 1, total: jobs.length, name: `${FOLDER_NAMES[k]} ${sn} ${label}`.trim() })

        try {
          const files = await exportEventExtractPDFs(k, record, church)
          // Wedding: dedicated folder with Sch. IV + Marriage Register
          // Others: year folder with one extract PDF
          const folder = k === 'wedding'
            ? root.folder(`${FOLDER_NAMES[k]}/${record.year}/${recordFolderName(k, record)}`)
            : root.folder(`${FOLDER_NAMES[k]}/${record.year}`)
          for (const { fileName, blob } of files) {
            folder.file(fileName, blob)
          }
          exported += files.length
        } catch {
          failed++
        }
      }

      if (exported === 0) {
        throw new Error(failed ? 'All PDF generations failed' : 'No records to export')
      }

      const zipBlob = await zip.generateAsync({ type: 'blob' })
      const url = URL.createObjectURL(zipBlob)
      const a = document.createElement('a')
      const kindLabel = kind === 'all' ? 'all' : kind
      const yearLabel = selectedYears.length === 1
        ? String(selectedYears[0])
        : `${selectedYears[selectedYears.length - 1]}-${selectedYears[0]}`
      a.href = url
      a.download = `event_extracts_${kindLabel}_${yearLabel}_${stampNow()}.zip`
      a.click()
      URL.revokeObjectURL(url)
      setResult({ exported, failed, total: jobs.length, pdfCount: exported })
    } catch (e) {
      setError(e.message || 'Bulk export failed')
    } finally {
      setGenerating(false)
      setProgress({ current: 0, total: 0, name: '' })
    }
  }

  const canExport = !generating && selectedYears.length > 0 && (!counts || counts.total > 0)

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1100,
      background: 'rgba(15,23,42,0.72)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 16,
    }}>
      <div style={{
        width: '100%', maxWidth: 560,
        background: '#fff', borderRadius: 16,
        boxShadow: '0 24px 64px rgba(0,0,0,0.35)',
        overflow: 'hidden',
        display: 'flex', flexDirection: 'column',
        maxHeight: 'min(92vh, 720px)',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '16px 20px',
          background: 'var(--sidebar-bg, #0d2244)',
          color: '#fff',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <FileDown size={20} />
            <div>
              <div style={{ fontWeight: 800, fontSize: 16 }}>Bulk Export</div>
              <div style={{ fontSize: 12, opacity: 0.8 }}>Event register extracts → PDF ZIP</div>
            </div>
          </div>
          <button type="button" onClick={onClose} disabled={generating}
            style={{
              background: 'transparent', border: '1px solid rgba(255,255,255,0.35)',
              color: '#fff', borderRadius: 8, padding: '6px 10px', cursor: generating ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center',
            }}>
            <X size={16} />
          </button>
        </div>

        <div style={{ padding: 20, overflowY: 'auto', flex: 1 }}>
          {/* Event type */}
          <div style={{ marginBottom: 18 }}>
            <div style={sectionLabel}>Event type</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {KIND_OPTIONS.map(opt => {
                const on = kind === opt.id
                return (
                  <button
                    key={opt.id}
                    type="button"
                    disabled={generating}
                    onClick={() => setKind(opt.id)}
                    style={{
                      padding: '8px 14px', borderRadius: 9, fontSize: 13, fontWeight: 700,
                      border: on ? '1px solid #0d2244' : '1px solid #e2e8f0',
                      background: on ? '#0d2244' : '#f8fafc',
                      color: on ? '#fff' : '#334155',
                      cursor: generating ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {opt.label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Years — only years that have records */}
          <div style={{ marginBottom: 18 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <div style={{ ...sectionLabel, marginBottom: 0 }}>Years</div>
              <div style={{ display: 'flex', gap: 6 }}>
                <MiniLink disabled={generating || loadingYears || !yearList.length} onClick={() => selectRecent(1)}>Latest</MiniLink>
                <MiniLink disabled={generating || loadingYears || yearList.length < 2} onClick={() => selectRecent(5)}>Last 5</MiniLink>
                <MiniLink disabled={generating || loadingYears || !yearList.length} onClick={() => setYears(new Set(yearList))}>All</MiniLink>
                <MiniLink disabled={generating || loadingYears || !years.size} onClick={() => setYears(new Set())}>Clear</MiniLink>
              </div>
            </div>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(72px, 1fr))',
              gap: 6,
              maxHeight: 180,
              overflowY: 'auto',
              padding: 10,
              border: '1px solid #e2e8f0',
              borderRadius: 10,
              background: '#f8fafc',
              minHeight: 56,
            }}>
              {loadingYears ? (
                <div style={{
                  gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: 8,
                  justifyContent: 'center', color: '#64748b', fontSize: 13, padding: '12px 0',
                }}>
                  <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
                  Loading years with records…
                </div>
              ) : yearList.length === 0 ? (
                <div style={{
                  gridColumn: '1 / -1', textAlign: 'center', color: '#94a3b8',
                  fontSize: 13, padding: '12px 0',
                }}>
                  No records found for this event type
                </div>
              ) : yearList.map(y => {
                const on = years.has(y)
                return (
                  <button
                    key={y}
                    type="button"
                    disabled={generating}
                    onClick={() => toggleYear(y)}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                      padding: '7px 4px', borderRadius: 7, fontSize: 12, fontWeight: 700,
                      border: on ? '1px solid #1d4ed8' : '1px solid #e2e8f0',
                      background: on ? '#eff6ff' : '#fff',
                      color: on ? '#1e40af' : '#64748b',
                      cursor: generating ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {on ? <CheckSquare size={12} /> : <Square size={12} />}
                    {y}
                  </button>
                )
              })}
            </div>
            <div style={{ marginTop: 8, fontSize: 12, color: '#64748b' }}>
              {loadingYears
                ? ' '
                : yearList.length === 0
                  ? 'Only years with saved records are shown'
                  : selectedYears.length === 0
                    ? 'No years selected'
                    : selectedYears.length <= 6
                      ? `Selected: ${selectedYears.join(', ')}`
                      : `Selected: ${selectedYears.length} years (${selectedYears[selectedYears.length - 1]}–${selectedYears[0]})`}
            </div>
          </div>

          {/* Preview */}
          <div style={{
            padding: '12px 14px', borderRadius: 10,
            background: 'linear-gradient(135deg, #fff7ed 0%, #fff1f2 100%)',
            border: '1px solid #fecdd3',
            marginBottom: 14,
          }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: '#9f1239', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6 }}>
              Preview
            </div>
            {counting ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#64748b', fontSize: 13 }}>
                <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Counting records…
              </div>
            ) : counts ? (
              <div style={{ fontSize: 13, color: '#334155' }}>
                <strong>{counts.total}</strong> record{counts.total !== 1 ? 's' : ''} will be exported
                {kindsToExport.length > 1 && (
                  <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {kindsToExport.map(k => (
                      <span key={k} style={{
                        fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 6,
                        background: '#fff', border: '1px solid #e2e8f0', color: '#475569',
                      }}>
                        {FOLDER_NAMES[k]}: {counts[k] || 0}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div style={{ fontSize: 13, color: '#64748b' }}>Select years to preview count</div>
            )}
          </div>

          {generating && (
            <div style={{
              marginBottom: 14, padding: '12px 14px', borderRadius: 10,
              background: '#eff6ff', border: '1px solid #bfdbfe',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 700, color: '#1e40af', marginBottom: 6 }}>
                <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
                Generating PDFs… {progress.current}/{progress.total}
              </div>
              <div style={{ height: 6, borderRadius: 99, background: '#dbeafe', overflow: 'hidden' }}>
                <div style={{
                  height: '100%', borderRadius: 99, background: '#2563eb',
                  width: progress.total ? `${(progress.current / progress.total) * 100}%` : '0%',
                  transition: 'width 0.2s',
                }} />
              </div>
              {progress.name && (
                <div style={{ marginTop: 6, fontSize: 11, color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {progress.name}
                </div>
              )}
            </div>
          )}

          {error && (
            <div style={{ marginBottom: 12, padding: '10px 12px', borderRadius: 8, background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', fontSize: 13 }}>
              {error}
            </div>
          )}

          {result && (
            <div style={{ marginBottom: 12, padding: '10px 12px', borderRadius: 8, background: '#ecfdf5', border: '1px solid #a7f3d0', color: '#065f46', fontSize: 13 }}>
              Downloaded ZIP — {result.exported} PDF{result.exported !== 1 ? 's' : ''}
              {result.failed > 0 ? ` (${result.failed} failed)` : ''}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: '14px 20px', borderTop: '1px solid #e2e8f0',
          display: 'flex', justifyContent: 'flex-end', gap: 10,
          background: '#f8fafc',
        }}>
          <button type="button" onClick={onClose} disabled={generating}
            style={{
              padding: '9px 16px', borderRadius: 8, border: '1px solid #cbd5e1',
              background: '#fff', color: '#334155', fontWeight: 600, fontSize: 13,
              cursor: generating ? 'not-allowed' : 'pointer',
            }}>
            Close
          </button>
          <button type="button" onClick={handleExport} disabled={!canExport}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              padding: '9px 18px', borderRadius: 8, border: 'none',
              background: canExport
                ? 'linear-gradient(180deg, #16a34a 0%, #15803d 100%)'
                : '#94a3b8',
              color: '#fff', fontWeight: 700, fontSize: 13,
              cursor: canExport ? 'pointer' : 'not-allowed',
              boxShadow: canExport ? '0 2px 8px rgba(22,163,74,0.35)' : 'none',
            }}>
            {generating
              ? <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} />
              : <FileDown size={15} />}
            {generating ? 'Exporting…' : 'Generate ZIP'}
          </button>
        </div>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}

const sectionLabel = {
  fontSize: 11,
  fontWeight: 800,
  color: '#64748b',
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  marginBottom: 8,
}

function MiniLink({ children, onClick, disabled }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        border: 'none', background: 'transparent', padding: 0,
        fontSize: 11, fontWeight: 700, color: disabled ? '#94a3b8' : '#2563eb',
        cursor: disabled ? 'not-allowed' : 'pointer',
      }}
    >
      {children}
    </button>
  )
}
