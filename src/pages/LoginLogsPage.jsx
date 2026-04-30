/* ═══════════════════════════════════════════════════════════════
   LoginLogsPage.jsx — User login audit log (admin)
   ═══════════════════════════════════════════════════════════════ */

import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../lib/AuthContext'
import { getLoginLogs } from '../lib/loginLogs'
import { exportToExcel } from '../lib/exportExcel'
import {
  LogIn, Loader2, ChevronLeft, ChevronRight,
  CheckCircle, Clock, MapPin, Monitor, Shield, FileDown,
} from 'lucide-react'

const ADMIN_ROLES = ['super_admin', 'admin', 'admin1']
const PAGE_SIZE   = 50

const ROLE_STYLES = {
  super_admin: { label: 'Super Admin', color: '#92400e', bg: '#fef3c7' },
  admin1:      { label: 'Admin1',      color: '#1e40af', bg: '#eff6ff' },
  admin:       { label: 'Admin',       color: '#065f46', bg: '#ecfdf5' },
  user:        { label: 'User',        color: '#374151', bg: '#f9fafb' },
  demo:        { label: 'Demo',        color: '#6b21a8', bg: '#faf5ff' },
}

function fmtDT(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  const p = n => String(n).padStart(2, '0')
  return `${p(d.getDate())}-${p(d.getMonth()+1)}-${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`
}

function fmtDuration(loginAt, logoutAt) {
  if (!logoutAt) return null
  const mins = Math.max(0, Math.round((new Date(logoutAt) - new Date(loginAt)) / 60000))
  if (mins < 1)  return '< 1 min'
  if (mins < 60) return `${mins} min`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m ? `${h}h ${m}m` : `${h}h`
}

function parseBrowser(ua = '') {
  if (!ua) return '—'
  let browser = 'Other'
  if (ua.includes('Edg/'))                              browser = 'Edge'
  else if (ua.includes('OPR/') || ua.includes('Opera')) browser = 'Opera'
  else if (ua.includes('Chrome/'))                      browser = 'Chrome'
  else if (ua.includes('Firefox/'))                     browser = 'Firefox'
  else if (ua.includes('Safari/'))                      browser = 'Safari'

  let os = ''
  if (ua.includes('Windows'))                           os = 'Windows'
  else if (ua.includes('Android'))                      os = 'Android'
  else if (ua.includes('iPhone') || ua.includes('iPad')) os = 'iOS'
  else if (ua.includes('Mac OS'))                       os = 'macOS'
  else if (ua.includes('Linux'))                        os = 'Linux'

  return os ? `${browser} / ${os}` : browser
}

export default function LoginLogsPage() {
  const { profile } = useAuth()

  const [rows,        setRows]        = useState([])
  const [total,       setTotal]       = useState(0)
  const [page,        setPage]        = useState(0)
  const [loading,     setLoading]     = useState(false)
  const [exporting,   setExporting]   = useState(false)
  const [filterEmail, setFilterEmail] = useState('')
  const [filterRole,  setFilterRole]  = useState('')
  const [emailInput,  setEmailInput]  = useState('')

  if (!ADMIN_ROLES.includes(profile?.role)) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-1">Access Denied</h2>
          <p className="text-gray-500 dark:text-gray-400 text-sm">Admin access required.</p>
        </div>
      </div>
    )
  }

  const load = useCallback(async (p = 0) => {
    setLoading(true)
    try {
      const { data, count } = await getLoginLogs({
        limit: PAGE_SIZE, offset: p * PAGE_SIZE,
        email: filterEmail,
        role:  filterRole,
      })
      setRows(data); setTotal(count); setPage(p)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [filterEmail, filterRole])

  useEffect(() => { load(0) }, [load])

  const totalPages = Math.ceil(total / PAGE_SIZE)

  function handleEmailSearch(e) {
    e.preventDefault()
    setFilterEmail(emailInput.trim())
  }

  async function exportExcel() {
    setExporting(true)
    try {
      const { data: all } = await getLoginLogs({ limit: 10000, offset: 0, email: filterEmail, role: filterRole })
      const columns = [
        { header: 'Login At',   key: 'login_at',   width: 20 },
        { header: 'Name',       key: 'name',        width: 26 },
        { header: 'Email',      key: 'email',       width: 30 },
        { header: 'Role',       key: 'role',        width: 14 },
        { header: 'City',       key: 'city',        width: 18 },
        { header: 'Region',     key: 'region',      width: 18 },
        { header: 'Country',    key: 'country',     width: 14 },
        { header: 'IP Address', key: 'ip_address',  width: 36 },
        { header: 'Browser/OS', key: 'browser',     width: 20 },
        { header: 'Logout At',  key: 'logout_at',   width: 20 },
        { header: 'Duration',   key: 'duration',    width: 12 },
      ]
      const rows = (all || []).map(r => ({
        login_at:   fmtDT(r.login_at),
        name:       r.full_name  || '—',
        email:      r.email      || '—',
        role:       ROLE_STYLES[r.user_role]?.label || r.user_role || '—',
        city:       r.city       || '—',
        region:     r.region     || '—',
        country:    r.country    || '—',
        ip_address: r.ip_address || '—',
        browser:    parseBrowser(r.user_agent),
        logout_at:  fmtDT(r.logout_at),
        duration:   fmtDuration(r.login_at, r.logout_at) || '—',
      }))
      const date = new Date().toISOString().slice(0, 10)
      await exportToExcel(columns, rows, 'Login Details', `login-details-${date}.xlsx`)
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="animate-fade-in p-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-1">Login Details</h1>
        <p className="text-gray-500 dark:text-gray-400 text-sm">Audit log of all user login sessions — who logged in, when, from where, and for how long.</p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-4 items-center">

        {/* Email search */}
        <form onSubmit={handleEmailSearch} className="flex gap-1">
          <input
            type="text"
            value={emailInput}
            onChange={e => setEmailInput(e.target.value)}
            placeholder="Search email…"
            className="field-input"
            style={{ width: 220 }}
          />
          <button type="submit"
            className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-slate-700 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-slate-600 transition">
            Search
          </button>
          {filterEmail && (
            <button type="button"
              onClick={() => { setEmailInput(''); setFilterEmail('') }}
              className="px-2 py-1.5 text-xs rounded-lg border border-gray-300 dark:border-gray-600 text-gray-400 hover:text-red-500 transition">
              ✕
            </button>
          )}
        </form>

        {/* Role filter */}
        <select value={filterRole} onChange={e => setFilterRole(e.target.value)}
          className="field-input" style={{ width: 160 }}>
          <option value="">All Roles</option>
          <option value="super_admin">Super Admin</option>
          <option value="admin1">Admin1</option>
          <option value="admin">Admin</option>
          <option value="user">User</option>
          <option value="demo">Demo</option>
        </select>

        <div className="ml-auto flex items-center gap-3">
          <span className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
            <LogIn size={15} /> {total} records
          </span>
          <button onClick={exportExcel} disabled={exporting || !total}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-green-300 bg-green-50 text-green-700 hover:bg-green-100 disabled:opacity-50 transition">
            {exporting ? <Loader2 size={13} className="animate-spin" /> : <FileDown size={13} />}
            {exporting ? 'Exporting…' : 'Export Excel'}
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-40 gap-2 text-gray-500">
            <Loader2 size={20} className="animate-spin" />
            <span className="text-sm">Loading…</span>
          </div>
        ) : !rows.length ? (
          <div className="flex items-center justify-center h-40">
            <p className="text-gray-400 text-sm">No login records found.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full" style={{ fontSize: 12 }}>
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
                  {['Login At', 'User', 'Role', 'Location', 'IP Address', 'Browser / OS', 'Logout At', 'Duration'].map(h => (
                    <th key={h} className="px-3 py-2 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map(r => {
                  const role     = ROLE_STYLES[r.user_role] || { label: r.user_role || '—', color: '#374151', bg: '#f9fafb' }
                  const duration = fmtDuration(r.login_at, r.logout_at)
                  const location = [r.city, r.country].filter(Boolean).join(', ') || '—'

                  return (
                    <tr key={r.id} className="border-t border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/40">

                      {/* Login At */}
                      <td className="px-3 py-2.5 text-gray-600 dark:text-gray-400 whitespace-nowrap font-mono" style={{ fontSize: 11 }}>
                        {fmtDT(r.login_at)}
                      </td>

                      {/* User */}
                      <td className="px-3 py-2.5">
                        <div className="font-medium text-gray-800 dark:text-white">{r.full_name || '—'}</div>
                        <div className="text-gray-400 dark:text-gray-500" style={{ fontSize: 11 }}>{r.email}</div>
                      </td>

                      {/* Role */}
                      <td className="px-3 py-2.5">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
                          style={{ background: role.bg, color: role.color }}>
                          <Shield size={10} />
                          {role.label}
                        </span>
                      </td>

                      {/* Location */}
                      <td className="px-3 py-2.5">
                        <span className="flex items-center gap-1 text-gray-600 dark:text-gray-400">
                          <MapPin size={11} className="text-gray-400 shrink-0" />
                          {location}
                        </span>
                        {r.region && r.region !== r.city && (
                          <div className="text-gray-400" style={{ fontSize: 10, paddingLeft: 15 }}>{r.region}</div>
                        )}
                      </td>

                      {/* IP */}
                      <td className="px-3 py-2.5 text-gray-500 dark:text-gray-400 font-mono"
                        style={{ fontSize: 11, maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                        title={r.ip_address || ''}>
                        {r.ip_address || '—'}
                      </td>

                      {/* Browser */}
                      <td className="px-3 py-2.5">
                        <span className="flex items-center gap-1 text-gray-600 dark:text-gray-400">
                          <Monitor size={11} className="shrink-0" />
                          {parseBrowser(r.user_agent)}
                        </span>
                      </td>

                      {/* Logout At */}
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        {r.logout_at ? (
                          <span className="flex items-center gap-1 text-gray-500 dark:text-gray-400 font-mono" style={{ fontSize: 11 }}>
                            <CheckCircle size={11} className="text-green-500" />
                            {fmtDT(r.logout_at)}
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
                            <Clock size={11} />
                            <span className="text-xs font-medium">Active</span>
                          </span>
                        )}
                      </td>

                      {/* Duration */}
                      <td className="px-3 py-2.5 text-gray-600 dark:text-gray-400 whitespace-nowrap">
                        {duration ? (
                          <span className="inline-block px-2 py-0.5 rounded text-xs font-medium bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300">
                            {duration}
                          </span>
                        ) : (
                          <span className="text-gray-300 dark:text-gray-600">—</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Page {page + 1} of {totalPages} ({total} records)
          </p>
          <div className="flex gap-2">
            <button onClick={() => load(page - 1)} disabled={page === 0 || loading}
              className="p-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 transition">
              <ChevronLeft size={16} />
            </button>
            <button onClick={() => load(page + 1)} disabled={page >= totalPages - 1 || loading}
              className="p-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 transition">
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
