import { LICENSE_CSV, getChurch, supabase } from './supabase'

export function licenseBlockTitle(reason) {
  if (reason === 'network') return 'License Unverified'
  if (reason === 'missing') return 'License Required'
  if (reason === 'invalid') return 'Invalid License'
  if (reason === 'inactive') return 'License Inactive'
  if (reason === 'expired') return 'License Expired'
  return 'License Required'
}

export function licenseBlockMessage(reason) {
  if (reason === 'inactive') {
    return 'Your church license has been deactivated. Access is restricted until the license is reactivated.'
  }
  if (reason === 'expired') {
    return 'Your church license has expired. Please renew to continue using the system.'
  }
  if (reason === 'missing') {
    return 'No AUTH CODE is configured for this church. Ask a Super Admin to enter and verify the license in Church Setup.'
  }
  if (reason === 'invalid') {
    return 'The AUTH CODE on this church is not recognised. Ask a Super Admin to verify the license in Church Setup.'
  }
  if (reason === 'network') {
    return 'License could not be verified and the 24-hour offline grace period has elapsed. Please check your internet connection or contact support.'
  }
  return 'License could not be verified.'
}

/** Check the church AUTH CODE against the license sheet. Does not require a signed-in user. */
export async function evaluateChurchLicense(existingChurch = null) {
  const church = existingChurch || await getChurch()
  const code = church?.auth_code?.trim()?.toUpperCase()
  if (!code) {
    return { ok: false, reason: 'missing', info: null, church }
  }

  try {
    const resp = await fetch(LICENSE_CSV)
    const text = await resp.text()
    const rows = text.trim().split('\n').slice(1)
    let found = null
    for (const row of rows) {
      const cols = row.split(',').map((c) => c.trim().replace(/^"|"$/g, ''))
      const [rowCode, churchCode, churchName, validUpto, licStatus] = cols
      if (rowCode?.toUpperCase() === code) {
        found = { code: rowCode, churchCode, churchName, validUpto, licStatus }
        break
      }
    }

    if (!found) {
      return { ok: false, reason: 'invalid', info: { code }, church }
    }

    const isDemo = code === '0000-DEMOACCOUNT'
    const inactive = found.licStatus?.toLowerCase().includes('inactive')
    let isExpired = false
    let daysLeft = null

    if (!isDemo) {
      const parts = found.validUpto?.split(/[-\/]/)
      if (parts?.length === 3) {
        const d = new Date(parseInt(parts[2], 10), parseInt(parts[1], 10) - 1, parseInt(parts[0], 10))
        if (!Number.isNaN(d.getTime())) {
          daysLeft = Math.ceil((d - new Date()) / 86400000)
          isExpired = !inactive && d < new Date()
        }
      }
    }

    if (inactive || isExpired) {
      return {
        ok: false,
        reason: inactive ? 'inactive' : 'expired',
        info: { ...found, daysLeft },
        church,
      }
    }

    return { ok: true, reason: null, info: found, church }
  } catch (e) {
    console.error('License CSV fetch failed:', e)
    const lastOk = church?.license_ok_ts ? new Date(church.license_ok_ts).getTime() : 0
    const hoursElapsed = (Date.now() - lastOk) / 3600000
    if (lastOk && hoursElapsed < 24) {
      return { ok: true, reason: 'grace', info: null, church }
    }
    return { ok: false, reason: 'network', info: null, church }
  }
}

export async function applyLicenseVerificationStamp(church, ok) {
  if (!church?.id) return
  await supabase
    .from('churches')
    .update({ license_ok_ts: ok ? new Date().toISOString() : null })
    .eq('id', church.id)
}
