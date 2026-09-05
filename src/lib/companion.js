const COMPANION_STATUS_HOSTS = ['127.0.0.1', 'localhost']
const COMPANION_STATUS_PORT = 65432
const COMPANION_CHECK_TIMEOUT_MS = 3500

function normalizeCompanionPayload(payload) {
  if (!payload || typeof payload !== 'object') return null
  const normalized = { ...payload }
  if (!normalized.deviceId && normalized.device_id) {
    normalized.deviceId = normalized.device_id
  }
  return normalized
}

async function fetchStatusFromHost(host) {
  const url = `http://${host}:${COMPANION_STATUS_PORT}/status`
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), COMPANION_CHECK_TIMEOUT_MS)
  try {
    const response = await fetch(url, {
      method: 'GET',
      cache: 'no-store',
      credentials: 'omit',
      signal: controller.signal,
    })
    if (!response.ok) return null
    const payload = await response.json()
    return normalizeCompanionPayload(payload)
  } catch (error) {
    console.warn('[fetchCompanionStatus] failed for', host, error?.message || error)
    return null
  } finally {
    clearTimeout(timeout)
  }
}

export async function fetchCompanionStatus() {
  for (const host of COMPANION_STATUS_HOSTS) {
    const payload = await fetchStatusFromHost(host)
    if (payload) return payload
  }
  return null
}
