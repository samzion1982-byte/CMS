/**
 * Church-configurable CMS master password.
 * Hash is stored on churches.master_password_hash (SHA-256 of cms-master-v1:<password>).
 * When the column is NULL, the legacy default is still accepted so existing installs keep working
 * until Super Admin sets a custom password in Church Setup → License.
 */

import { supabase, getChurch } from './supabase'

/** Legacy default — only used when no custom hash is stored yet. */
export const LEGACY_MASTER_PASSWORD = 'Master007))&'

export const MASTER_PASSWORD_MIN_LENGTH = 8

const HASH_PREFIX = 'cms-master-v1:'

let cachedHash = undefined // undefined = not loaded; null = no custom hash; string = hash

function clearMasterPasswordCache() {
  cachedHash = undefined
}

if (typeof window !== 'undefined') {
  window.addEventListener('church-settings-updated', clearMasterPasswordCache)
}

export async function hashMasterPassword(plain) {
  const data = new TextEncoder().encode(`${HASH_PREFIX}${String(plain || '')}`)
  const buf = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

function hashesEqual(a, b) {
  if (!a || !b || a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

async function loadStoredHash(force = false) {
  if (!force && cachedHash !== undefined) return cachedHash
  const church = await getChurch()
  cachedHash = church?.master_password_hash || null
  return cachedHash
}

/** True when a custom password has been saved (legacy default no longer works). */
export async function isCustomMasterPasswordSet() {
  const hash = await loadStoredHash()
  return !!hash
}

/**
 * Verify a master-password attempt against the church setting
 * (or legacy default if none is configured yet).
 */
export async function verifyMasterPassword(plain) {
  if (!plain) return false
  const inputHash = await hashMasterPassword(plain)
  const stored = await loadStoredHash()
  if (stored) return hashesEqual(stored, inputHash)
  const legacyHash = await hashMasterPassword(LEGACY_MASTER_PASSWORD)
  return hashesEqual(inputHash, legacyHash)
}

/**
 * Super Admin only — set or replace the church master password (no current password required).
 * Church Setup master-password UI is Super Admin–only.
 * @param {{ newPassword: string }} opts
 */
export async function setChurchMasterPassword({ newPassword } = {}) {
  await assertCallerIsSuperAdmin()
  const next = String(newPassword || '')
  if (next.length < MASTER_PASSWORD_MIN_LENGTH) {
    throw new Error(`New master password must be at least ${MASTER_PASSWORD_MIN_LENGTH} characters.`)
  }
  return writeMasterPasswordHash(next)
}

/**
 * @deprecated Use setChurchMasterPassword — Super Admin no longer needs the current password.
 */
export async function resetChurchMasterPasswordBySuperAdmin({ newPassword } = {}) {
  return setChurchMasterPassword({ newPassword })
}

/**
 * Super Admin only — clear custom hash so the built-in default works again.
 */
export async function clearChurchMasterPasswordBySuperAdmin() {
  await assertCallerIsSuperAdmin()
  const church = await getChurch()
  if (!church?.id) throw new Error('Church record not found.')

  const { error } = await supabase
    .from('churches')
    .update({
      master_password_hash: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', church.id)

  if (error) throw error
  cachedHash = null
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('church-settings-updated'))
  }
  return true
}

async function assertCallerIsSuperAdmin() {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.id) throw new Error('Not authenticated.')
  const { data: prof, error } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()
  if (error) throw error
  if (prof?.role !== 'super_admin') {
    throw new Error('Only Super Admin can change the master password.')
  }
}

async function writeMasterPasswordHash(next) {
  const church = await getChurch()
  if (!church?.id) throw new Error('Church record not found.')

  const hash = await hashMasterPassword(next)
  const { error } = await supabase
    .from('churches')
    .update({
      master_password_hash: hash,
      updated_at: new Date().toISOString(),
    })
    .eq('id', church.id)

  if (error) throw error

  cachedHash = hash

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('church-settings-updated'))
  }

  return true
}
