/* ═══════════════════════════════════════════════════════════════
   DeleteMemberModal.jsx — Dialog to confirm & delete a member
   ═══════════════════════════════════════════════════════════════ */

import { useState } from 'react'
import { Trash2, AlertTriangle, Loader2, X } from 'lucide-react'
import { deleteMember } from '../lib/memberDelete'
import { useToast } from '../lib/toast'

export default function DeleteMemberModal({ member, isOpen, onClose, onDeleted, userEmail }) {
  const toast = useToast()
  const [reason, setReason] = useState('')
  const [isDeleting, setIsDeleting] = useState(false)
  const [photoExists, setPhotoExists] = useState(false)
  const [deletePhoto, setDeletePhoto] = useState(true)

  if (!isOpen || !member) return null

  const handleDelete = async () => {
    if (!reason.trim()) {
      toast('Please provide a reason for deletion', 'error')
      return
    }

    setIsDeleting(true)
    try {
      await deleteMember(member.member_id, reason, userEmail)
      toast(`Member ${member.member_id} deleted successfully`, 'success')
      onDeleted()
      onClose()
    } catch (err) {
      toast(`Error deleting member: ${err.message}`, 'error')
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999] p-4 overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 rounded-lg shadow-2xl max-w-md w-full my-8 p-6">
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-red-100 dark:bg-red-900/30 flex items-center justify-center flex-shrink-0">
              <AlertTriangle size={20} className="text-red-600 dark:text-red-400" />
            </div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">Delete Member</h2>
          </div>
          <button
            onClick={onClose}
            disabled={isDeleting}
            className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 flex-shrink-0"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="space-y-4 mb-6 max-h-[calc(100vh-200px)] overflow-y-auto">
          {/* Member Info */}
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3">
            <p className="text-sm font-semibold text-gray-900 dark:text-white mb-1">
              {member.member_id} - {member.member_name}
            </p>
            <p className="text-xs text-gray-600 dark:text-gray-400">
              Family: {member.family_id} | Zone: {member.zonal_area || 'N/A'}
            </p>
          </div>

          {/* Warning */}
          <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-3">
            <p className="text-xs font-semibold text-yellow-800 dark:text-yellow-200 mb-1">⚠️ Important</p>
            <p className="text-xs text-yellow-700 dark:text-yellow-300">
              This will move the member to the archive. Only Super Admin & Admin can restore.
            </p>
          </div>

          {/* Reason for deletion */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
              Reason for Deletion <span className="text-red-600">*</span>
            </label>
            <textarea
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="e.g., Duplicate record, Left station, Invalid data"
              disabled={isDeleting}
              rows={3}
              className="w-full px-3 py-2 border border-red-300 dark:border-red-700 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:border-red-500 focus:ring-2 focus:ring-red-500 disabled:opacity-50"
            />
          </div>

          {/* Photo checkbox */}
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="deletePhoto"
              checked={deletePhoto}
              onChange={e => setDeletePhoto(e.target.checked)}
              disabled={isDeleting}
              className="w-4 h-4 text-red-600 rounded focus:ring-red-500 cursor-pointer disabled:opacity-50"
            />
            <label htmlFor="deletePhoto" className="text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
              Also move associated photo to archive
            </label>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isDeleting}
            className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 font-medium hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={isDeleting || !reason.trim()}
            className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-medium rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center justify-center gap-2"
          >
            {isDeleting ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Deleting...
              </>
            ) : (
              <>
                <Trash2 size={16} />
                Delete Member
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
