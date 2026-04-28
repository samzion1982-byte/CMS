/* ═══════════════════════════════════════════════════════════════
   DeletedMembersPage.jsx — View deleted members & restore
   ═══════════════════════════════════════════════════════════════ */

import { useState, useEffect, useCallback, useRef } from 'react'
import { useAuth } from '../lib/AuthContext'
import { getPerms } from '../lib/auth'
import { useToast } from '../lib/toast'
import { formatDate } from '../lib/date'
import { Search, Undo2, Loader2, ChevronLeft, ChevronRight, FileDown } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { fetchDeletedMembers, getDeletedMemberDetails } from '../lib/memberDelete'
import RestoreMemberModal from './RestoreMemberModal'

export default function DeletedMembersPage() {
  const { profile } = useAuth()
  const toast = useToast()
  const perms = getPerms(profile?.role)

  const [deletedMembers, setDeletedMembers] = useState([])
  const [loading, setLoading] = useState(false)
  const [searchVal, setSearchVal] = useState('')
  const [page, setPage] = useState(0)
  const [total, setTotal] = useState(0)
  const [selectedMember, setSelectedMember] = useState(null)
  const [showRestoreModal, setShowRestoreModal] = useState(false)
  const [memberDetails, setMemberDetails] = useState(null)
  const [exporting, setExporting] = useState(false)
  const searchTimer = useRef(null)
  const BATCH_SIZE = 50

  // Check permissions
  const canRestore = perms?.canDelete

  const loadDeletedMembers = useCallback(async (pageNum = 0, searchTerm = '') => {
    setLoading(true)
    try {
      const { data, total: totalCount } = await fetchDeletedMembers(pageNum, BATCH_SIZE, searchTerm)
      setDeletedMembers(data)
      setTotal(totalCount)
      setPage(pageNum)
    } catch (err) {
      toast.error(`Error loading deleted members: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    if (!canRestore) {
      console.log('[DeletedMembersPage] cannot restore, skipping load', profile?.role, canRestore)
      return
    }
    console.log('[DeletedMembersPage] loading deleted members', profile?.role)
    loadDeletedMembers()
  }, [canRestore, loadDeletedMembers, profile?.role])

  const handleSearch = useCallback(e => {
    const val = e.target.value
    setSearchVal(val)
    clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => {
      setPage(0)
      loadDeletedMembers(0, val)
    }, 300)
  }, [])

  const handleRestore = async member => {
    try {
      const details = await getDeletedMemberDetails(member.id)
      setSelectedMember(details)
      setMemberDetails(details)
      setShowRestoreModal(true)
    } catch (err) {
      toast.error(`Error loading member details: ${err.message}`)
    }
  }

  const handleRestored = () => {
    loadDeletedMembers(page, searchVal)
  }

  if (!canRestore) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Access Denied</h2>
          <p className="text-gray-600 dark:text-gray-400">Only Admin can view deleted members</p>
        </div>
      </div>
    )
  }

  const totalPages = Math.ceil(total / BATCH_SIZE)

  const exportExcel = async () => {
    setExporting(true)
    try {
      const ExcelJS = (await import('https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js')).default || window.ExcelJS

      // Fetch ALL deleted members (all pages)
      let all = [], from = 0
      const PAGE = 1000
      while (true) {
        const { data, error } = await supabase
          .from('deleted_members')
          .select('*')
          .order('deleted_at', { ascending: false })
          .range(from, from + PAGE - 1)
        if (error || !data?.length) break
        all = all.concat(data)
        if (data.length < PAGE) break
        from += PAGE
      }

      // Resolve email → display name via profiles
      const emailSet = new Set()
      all.forEach(r => {
        if (r.deleted_by?.includes('@'))  emailSet.add(r.deleted_by)
        if (r.restored_by?.includes('@')) emailSet.add(r.restored_by)
      })
      let nameMap = {}
      if (emailSet.size) {
        const { data: profs } = await supabase.from('profiles').select('email,full_name').in('email', [...emailSet])
        ;(profs || []).forEach(p => { if (p.email && p.full_name) nameMap[p.email] = p.full_name })
      }
      const n = v => nameMap[v] || v || ''

      const pick = (obj, ...keys) => { for (const k of keys) if (obj?.[k]) return obj[k]; return '' }
      const fmtDT = iso => {
        if (!iso) return ''
        const d = new Date(iso)
        if (isNaN(d)) return iso
        const p = n => String(n).padStart(2,'0')
        return `${p(d.getDate())}-${p(d.getMonth()+1)}-${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
      }
      const fmtD = iso => {
        if (!iso) return ''
        const d = new Date(iso)
        if (isNaN(d)) return iso
        const p = n => String(n).padStart(2,'0')
        return `${p(d.getDate())}-${p(d.getMonth()+1)}-${d.getFullYear()}`
      }

      const cols = [
        { key: 'member_id',    label: 'Member ID'    },
        { key: 'family_id',    label: 'Family ID'    },
        { key: 'member_name',  label: 'Full Name'    },
        { key: 'gender',       label: 'Gender'       },
        { key: 'dob_actual',   label: 'DOB'          },
        { key: 'mobile',       label: 'Mobile'       },
        { key: 'zonal_area',   label: 'Zone'         },
        { key: 'deleted_at',   label: 'Deleted On'   },
        { key: '_del_reason',  label: 'Deletion Reason' },
        { key: 'deleted_by',   label: 'Deleted By'   },
        { key: 'restored_at',  label: 'Reinstated On' },
        { key: '_rst_reason',  label: 'Reinstatement Reason' },
        { key: 'restored_by',  label: 'Reinstated By' },
      ]

      const rows = all.map(r => ({
        ...r,
        deleted_by:  n(r.deleted_by),
        restored_by: n(r.restored_by),
        _del_reason: pick(r, 'deleted_reason', 'reason', 'delete_reason'),
        _rst_reason: pick(r, 'restore_reason', 'restored_reason', 'reinstate_reason'),
      }))

      const wb = new ExcelJS.Workbook()
      wb.creator = 'Church Members App'; wb.created = new Date()
      const ws = wb.addWorksheet('Deleted Members', { views: [{ state: 'frozen', ySplit: 1 }] })
      ws.columns = cols.map(c => ({
        header: c.label, key: c.key,
        width: Math.min(Math.max(c.label.length + 2, ...rows.map(r => String(r[c.key] ?? '').length), 10), 42)
      }))

      const thin = { style: 'thin', color: { argb: 'FFBBBBBB' } }
      const borders = { top: thin, left: thin, bottom: thin, right: thin }
      ws.getRow(1).eachCell(cell => {
        cell.font      = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11, name: 'Calibri' }
        cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF7F1D1D' } }
        cell.alignment = { horizontal: 'center', vertical: 'middle' }
        cell.border    = borders
      })
      ws.getRow(1).height = 20

      const DT_KEYS = new Set(['deleted_at', 'restored_at'])
      const D_KEYS  = new Set(['dob_actual'])
      rows.forEach((r, idx) => {
        const rowData = cols.map(c => {
          const v = r[c.key]
          if (DT_KEYS.has(c.key)) return fmtDT(v)
          if (D_KEYS.has(c.key))  return fmtD(v)
          return v ?? ''
        })
        const row = ws.addRow(rowData)
        row.height = 15
        row.eachCell({ includeEmpty: true }, (cell, ci) => {
          cell.font      = { size: 10, name: 'Calibri' }
          cell.alignment = { horizontal: 'center', vertical: 'middle' }
          cell.border    = borders
          if (idx % 2 === 1) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF0F0' } }
        })
      })

      const buffer = await wb.xlsx.writeBuffer()
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      const now = new Date()
      const ts = `${String(now.getDate()).padStart(2,'0')}-${String(now.getMonth()+1).padStart(2,'0')}-${now.getFullYear()}`
      a.href = url; a.download = `deleted_members_${ts}.xlsx`; a.click()
      URL.revokeObjectURL(url)
      toast(`Exported ${rows.length} deleted members.`, 'success')
    } catch (e) {
      toast('Export failed: ' + e.message, 'error')
    }
    setExporting(false)
  }

  return (
    <div className="animate-fade-in p-6">
      {/* Header */}
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">Deleted Members Archive</h1>
          <p className="text-gray-600 dark:text-gray-400">Manage archived members and restore if needed</p>
        </div>
        <button
          onClick={exportExcel}
          disabled={exporting || loading}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-white text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed transition whitespace-nowrap"
          style={{ background: '#15803d' }}
        >
          {exporting ? <Loader2 size={16} className="animate-spin" /> : <FileDown size={16} />}
          {exporting ? 'Exporting...' : 'Export Excel'}
        </button>
      </div>

      {/* Stats */}
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mb-6">
        <p className="text-sm text-blue-900 dark:text-blue-300">
          Total deleted members: <strong>{total}</strong>
        </p>
      </div>

      {/* Search Bar */}
      <div className="mb-6 flex gap-3">
        <div className="flex-1 relative">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={searchVal}
            onChange={handleSearch}
            placeholder="Search by ID, name, or mobile..."
            disabled={loading}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
          />
        </div>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="text-center">
              <Loader2 size={32} className="animate-spin text-blue-500 mx-auto mb-2" />
              <p className="text-gray-600 dark:text-gray-400">Loading deleted members...</p>
            </div>
          </div>
        ) : deletedMembers.length === 0 ? (
          <div className="flex items-center justify-center h-64">
            <div className="text-center">
              <p className="text-gray-600 dark:text-gray-400 mb-2">No deleted members found</p>
              {total === 0 && <p className="text-sm text-gray-500 dark:text-gray-500">The archive is empty</p>}
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full" style={{fontSize:12}}>
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
                  <th className="px-3 py-2 text-left font-semibold text-gray-700 dark:text-gray-300">ID</th>
                  <th className="px-3 py-2 text-left font-semibold text-gray-700 dark:text-gray-300">Name</th>
                  <th className="px-3 py-2 text-left font-semibold text-gray-700 dark:text-gray-300">Deleted Date</th>
                  <th className="px-3 py-2 text-left font-semibold text-gray-700 dark:text-gray-300" style={{minWidth:220}}>Reason</th>
                  <th className="px-3 py-2 text-left font-semibold text-gray-700 dark:text-gray-300">Deleted By</th>
                  <th className="px-3 py-2 text-center font-semibold text-gray-700 dark:text-gray-300">Action</th>
                </tr>
              </thead>
              <tbody>
                {deletedMembers.map((m, idx) => (
                  <tr
                    key={m.id}
                    className="border-b border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition"
                  >
                    <td className="px-3 py-2 font-mono text-gray-900 dark:text-white font-semibold">{m.member_id}</td>
                    <td className="px-3 py-2 text-gray-900 dark:text-white">{m.member_name}</td>
                    <td className="px-3 py-2 text-gray-600 dark:text-gray-400" style={{whiteSpace:'nowrap'}}>
                      {formatDate(m.deleted_at, '')}
                    </td>
                    <td className="px-3 py-2 text-gray-600 dark:text-gray-400" style={{maxWidth:260}}>
                      {m.deleted_reason
                        ? <span title={m.deleted_reason}>{m.deleted_reason}</span>
                        : <span className="text-gray-400">—</span>}
                    </td>
                    <td className="px-3 py-2 text-gray-600 dark:text-gray-400">{m.deleted_by_display || m.deleted_by}</td>
                    <td className="px-3 py-2 text-center">
                      <button
                        onClick={() => handleRestore(m)}
                        title="Restore this member"
                        className="inline-flex items-center gap-1 px-3 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded hover:bg-green-200 dark:hover:bg-green-900/50 transition text-xs font-medium"
                      >
                        <Undo2 size={14} />
                        Restore
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Page {page + 1} of {totalPages} ({total} total)
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => loadDeletedMembers(page - 1, searchVal)}
              disabled={page === 0 || loading}
              className="p-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
            >
              <ChevronLeft size={18} />
            </button>
            <button
              onClick={() => loadDeletedMembers(page + 1, searchVal)}
              disabled={page >= totalPages - 1 || loading}
              className="p-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
            >
              <ChevronRight size={18} />
            </button>
          </div>
        </div>
      )}

      {/* Restore Modal */}
      {selectedMember && (
        <RestoreMemberModal
          deletedMember={selectedMember}
          isOpen={showRestoreModal}
          onClose={() => {
            setShowRestoreModal(false)
            setSelectedMember(null)
          }}
          onRestored={handleRestored}
          userEmail={profile?.full_name || profile?.email}
        />
      )}
    </div>
  )
}
