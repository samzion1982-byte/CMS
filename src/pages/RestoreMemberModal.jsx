/* ═══════════════════════════════════════════════════════════════
   RestoreMemberModal.jsx — Dialog to restore a deleted member
   ═══════════════════════════════════════════════════════════════ */

import { useState, useEffect } from 'react'
import ReactDOM from 'react-dom'
import { Undo2, Loader2, X, AlertCircle, CheckCircle } from 'lucide-react'
import { restoreMember, checkMemberIdAvailable } from '../lib/memberDelete'
import { useToast } from '../lib/toast'
import { formatDate } from '../lib/date'

export default function RestoreMemberModal({ deletedMember, isOpen, onClose, onRestored, userEmail }) {
  const toast = useToast()
  const [memberIdInput, setMemberIdInput] = useState('')
  const [isRestoring, setIsRestoring] = useState(false)
  const [idCheckError, setIdCheckError] = useState('')
  const [idCheckSuccess, setIdCheckSuccess] = useState(false)
  const [isCheckingId, setIsCheckingId] = useState(false)
  const [changeId, setChangeId] = useState(false)
  const [restoreReason, setRestoreReason] = useState('')

  useEffect(() => {
    if (deletedMember) {
      setMemberIdInput(deletedMember.member_id)
      setChangeId(false)
      setIdCheckError('')
      setIdCheckSuccess(false)
      setRestoreReason('')
    }
  }, [deletedMember, isOpen])

  if (!isOpen || !deletedMember) return null

  const handleCheckAvailability = async () => {
    if (!memberIdInput.trim() || memberIdInput === deletedMember.member_id) {
      setIdCheckError('')
      setIdCheckSuccess(false)
      return
    }

    setIsCheckingId(true)
    setIdCheckError('')
    setIdCheckSuccess(false)

    try {
      const isAvailable = await checkMemberIdAvailable(memberIdInput)
      if (isAvailable) {
        setIdCheckSuccess(true)
        setIdCheckError('')
      } else {
        setIdCheckSuccess(false)
        setIdCheckError(`Member ID '${memberIdInput}' already exists`)
      }
    } catch (err) {
      setIdCheckSuccess(false)
      setIdCheckError(`Error checking ID: ${err.message}`)
    } finally {
      setIsCheckingId(false)
    }
  }

  const handleRestore = async () => {
    const finalMemberId = changeId ? memberIdInput : null

    if (changeId && !memberIdInput.trim()) {
      toast('Please enter a new member ID', 'error')
      return
    }

    if (changeId && !idCheckSuccess) {
      toast('Please verify the new member ID is available', 'error')
      return
    }

    // Pre-check: if restoring with original ID, verify it's not in active members.
    // Pass excludeDeletedId so the check ignores the current deleted_members record (which is expected to exist).
    if (!changeId) {
      const isAvailable = await checkMemberIdAvailable(deletedMember.member_id, deletedMember.id)
      if (!isAvailable) {
        toast(`Member ID '${deletedMember.member_id}' already exists in active members. Use "Assign new member ID" to restore with a different ID.`, 'error')
        return
      }
    }

    setIsRestoring(true)
    try {
      await restoreMember(deletedMember.id, finalMemberId, userEmail, restoreReason)
      const displayId = finalMemberId || deletedMember.member_id
      toast(`Member ${displayId} restored successfully`, 'success')
      onRestored()
      onClose()
    } catch (err) {
      toast(`Error restoring member: ${err.message}`, 'error')
    } finally {
      setIsRestoring(false)
    }
  }

  return ReactDOM.createPortal(
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center" style={{zIndex:9999}}>
      <div className="bg-white dark:bg-slate-900 rounded-lg shadow-2xl max-w-md w-full mx-4 p-6">
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
              <Undo2 size={20} className="text-green-600 dark:text-green-400" />
            </div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">Restore Member</h2>
          </div>
          <button
            onClick={onClose}
            disabled={isRestoring}
            className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="space-y-4 mb-6">
          {/* Member Info */}
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
            <p className="text-sm font-semibold text-gray-900 dark:text-white mb-1">
              {deletedMember.member_id} - {deletedMember.member_name}
            </p>
            <p className="text-xs text-gray-600 dark:text-gray-400 mb-2">
              Family: {deletedMember.family_id}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Deleted: {formatDate(deletedMember.deleted_at, '')} by {deletedMember.deleted_by}
            </p>
            {deletedMember.deleted_reason && (
              <p className="text-xs text-gray-600 dark:text-gray-300 mt-1">
                <strong>Reason:</strong> {deletedMember.deleted_reason}
              </p>
            )}
          </div>

          {/* Restore reason */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
              Reason for Restoration
            </label>
            <textarea
              value={restoreReason}
              onChange={e => setRestoreReason(e.target.value)}
              placeholder="Optional: why is this member being restored?"
              disabled={isRestoring}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:border-green-500 focus:ring-2 focus:ring-green-500 disabled:opacity-50"
            />
          </div>

          {/* Member ID options */}
          <div className="space-y-3">
            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300">
              Member ID
            </label>

            {/* Option 1: Restore with same ID */}
            <div className="flex items-center gap-2">
              <input
                type="radio"
                id="keepId"
                checked={!changeId}
                onChange={() => {
                  setChangeId(false)
                  setMemberIdInput(deletedMember.member_id)
                  setIdCheckError('')
                  setIdCheckSuccess(false)
                }}
                disabled={isRestoring}
                className="w-4 h-4 text-green-600 cursor-pointer disabled:opacity-50"
              />
              <label htmlFor="keepId" className="text-sm text-gray-700 dark:text-gray-300 cursor-pointer flex-1">
                Restore with original ID
              </label>
            </div>

            {!changeId && (
              <div className="ml-6 px-3 py-2 bg-gray-100 dark:bg-gray-800 rounded text-sm font-mono text-gray-900 dark:text-white">
                {deletedMember.member_id}
              </div>
            )}

            {/* Option 2: Change ID during restore */}
            <div className="flex items-center gap-2">
              <input
                type="radio"
                id="changeId"
                checked={changeId}
                onChange={() => setChangeId(true)}
                disabled={isRestoring}
                className="w-4 h-4 text-green-600 cursor-pointer disabled:opacity-50"
              />
              <label htmlFor="changeId" className="text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
                Assign new member ID (must not exist)
              </label>
            </div>

            {changeId && (
              <div className="ml-6 space-y-2">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={memberIdInput}
                    onChange={e => {
                      setMemberIdInput(e.target.value)
                      setIdCheckError('')
                      setIdCheckSuccess(false)
                    }}
                    placeholder="e.g., FAM-0042-001"
                    disabled={isRestoring}
                    className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-green-500 disabled:opacity-50"
                  />
                  <button
                    onClick={handleCheckAvailability}
                    disabled={isRestoring || isCheckingId || !memberIdInput.trim() || memberIdInput === deletedMember.member_id}
                    className="px-3 py-2 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-lg text-sm font-medium disabled:opacity-50 transition"
                  >
                    {isCheckingId ? <Loader2 size={16} className="animate-spin" /> : 'Check'}
                  </button>
                </div>

                {/* Availability status */}
                {idCheckSuccess && (
                  <div className="flex items-center gap-2 text-green-600 dark:text-green-400 text-sm">
                    <CheckCircle size={16} />
                    <span>ID is available</span>
                  </div>
                )}
                {idCheckError && (
                  <div className="flex items-center gap-2 text-red-600 dark:text-red-400 text-sm">
                    <AlertCircle size={16} />
                    <span>{idCheckError}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={onClose}
            disabled={isRestoring}
            className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 font-medium hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            Cancel
          </button>
          <button
            onClick={handleRestore}
            disabled={isRestoring || (changeId && !idCheckSuccess)}
            className="flex-1 px-4 py-2 bg-green-600 hover:bg-green-700 text-white font-medium rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center justify-center gap-2"
          >
            {isRestoring ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Restoring...
              </>
            ) : (
              <>
                <Undo2 size={16} />
                Restore Member
              </>
            )}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
