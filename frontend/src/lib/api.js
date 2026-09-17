const BASE = import.meta.env.VITE_API_URL || ''

export async function apiFetch(path, opts = {}) {
  const r = await fetch(`${BASE}${path}`, {
    headers: { 'Accept': 'application/json', ...(opts.headers || {}) },
    ...opts,
  })
  if (!r.ok) {
    let msg = `${r.status} ${r.statusText}`
    try {
      const j = await r.json()
      if (Array.isArray(j.detail)) {
        msg = j.detail.map((d) => d.msg || d.message).join(', ')
      } else {
        msg = j.detail || msg
      }
    } catch (_) {}
    const err = new Error(typeof msg === 'string' ? msg : JSON.stringify(msg))
    err.status = r.status
    throw err
  }
  return r.json()
}

export function ago(iso) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return new Date(iso).toLocaleDateString('en-IN')
}

export function pct(x) {
  if (x == null) return '–'
  return `${Math.round(x * 100)}%`
}

export const DOC_LABELS = {
  AADHAAR: 'Aadhaar', PAN: 'PAN Card', COLLEGE_ID: 'College ID',
  DRIVING_LICENCE: 'Driving Licence', VOTER_ID: 'Voter ID',
  PASSPORT: 'Passport', UNKNOWN: 'Unknown Doc',
}
