import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function fmtDateTime(v?: string | null) {
  if (!v) return '—'
  return new Date(v).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export function fmtDate(v?: string | null) {
  if (!v) return '—'
  return new Date(v).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

export function fmtTime(v?: string | null) {
  if (!v) return '—'
  return new Date(v).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', second: '2-digit' })
}

export function fmtDuration(minutes?: number | null) {
  if (minutes == null) return '—'
  const h = Math.floor(minutes / 60)
  const m = Math.round(minutes % 60)
  return h ? `${h}h ${m}m` : `${m}m`
}

export function timeAgo(v?: string | null) {
  if (!v) return '—'
  const s = Math.max(0, (Date.now() - new Date(v).getTime()) / 1000)
  if (s < 10) return 'just now'
  if (s < 60) return `${Math.floor(s)}s ago`
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

export function todayISO() {
  const d = new Date()
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
}

/** Turn a DRF error payload into a readable string. */
export function apiError(err: unknown, fallback = 'Something went wrong.'): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const res = (err as any)?.response
  if (!res) return 'Cannot reach the server. Check that the backend is running and try again.'
  if ([502, 503, 504].includes(res.status) && !res.data?.detail) {
    return 'The parking server is currently unavailable. Make sure the backend is running, then try again.'
  }
  const data = res.data
  if (!data || typeof data !== 'object') return fallback
  if (data.detail) return String(data.detail)
  const first = Object.entries(data)[0]
  if (first) {
    const [k, v] = first
    const msg = Array.isArray(v) ? v[0] : v
    return k === 'non_field_errors' ? String(msg) : `${k.replace(/_/g, ' ')}: ${msg}`
  }
  return fallback
}

/** Map of field -> first error message, for inline form errors. */
export function fieldErrors(err: unknown): Record<string, string> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = (err as any)?.response?.data
  const out: Record<string, string> = {}
  if (data && typeof data === 'object') {
    for (const [k, v] of Object.entries(data)) out[k] = Array.isArray(v) ? String(v[0]) : String(v)
  }
  return out
}

export function downloadCSV(filename: string, rows: Record<string, unknown>[]) {
  if (!rows.length) return
  const headers = Object.keys(rows[0])
  const esc = (v: unknown) => {
    const s = v == null ? '' : String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const csv = [headers.join(','), ...rows.map((r) => headers.map((h) => esc(r[h])).join(','))].join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
