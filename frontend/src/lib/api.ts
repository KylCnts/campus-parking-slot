import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios'

const API_BASE = import.meta.env.VITE_API_URL ?? '/api'

const ACCESS = 'cp_access'
const REFRESH = 'cp_refresh'

export const tokens = {
  get access() {
    return localStorage.getItem(ACCESS)
  },
  get refresh() {
    return localStorage.getItem(REFRESH)
  },
  set(access: string, refresh?: string) {
    localStorage.setItem(ACCESS, access)
    if (refresh) localStorage.setItem(REFRESH, refresh)
  },
  clear() {
    localStorage.removeItem(ACCESS)
    localStorage.removeItem(REFRESH)
  },
}

export const api = axios.create({ baseURL: API_BASE, timeout: 20000 })

function tokenExp(token: string | null): number {
  if (!token) return 0
  try {
    return JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).exp * 1000
  } catch {
    return 0
  }
}

let refreshing: Promise<string | null> | null = null
let onSessionExpired: () => void = () => {}
export function setSessionExpiredHandler(fn: () => void) {
  onSessionExpired = fn
}

/** Refresh the access token once, sharing the in-flight request among callers. */
export function refreshAccessToken(): Promise<string | null> {
  if (!tokens.refresh) return Promise.resolve(null)
  if (!refreshing) {
    refreshing = axios
      .post(`${API_BASE}/auth/refresh/`, { refresh: tokens.refresh })
      .then((r) => {
        tokens.set(r.data.access, r.data.refresh)
        return r.data.access as string
      })
      .catch((e: AxiosError) => {
        // Only a rejected token ends the session; a server outage must not sign the user out.
        if (e.response?.status === 400 || e.response?.status === 401) {
          tokens.clear()
          onSessionExpired()
        }
        return null
      })
      .finally(() => {
        refreshing = null
      })
  }
  return refreshing
}

/** Returns a valid access token, refreshing it if it expires within 30 seconds. */
export async function getFreshAccessToken(): Promise<string | null> {
  const t = tokens.access
  if (t && tokenExp(t) - Date.now() > 30_000) return t
  return refreshAccessToken()
}

api.interceptors.request.use(async (config) => {
  if (config.url?.startsWith('/auth/') && !config.url.startsWith('/auth/me') && !config.url.startsWith('/auth/change') && !config.url.startsWith('/auth/logout')) {
    return config
  }
  const token = await getFreshAccessToken()
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

api.interceptors.response.use(
  (r) => r,
  async (error: AxiosError) => {
    const original = error.config as (InternalAxiosRequestConfig & { _retry?: boolean }) | undefined
    const isCredentialCheck = /\/auth\/(login|register|refresh|password-reset)/.test(original?.url ?? '')
    if (error.response?.status === 401 && original && !original._retry && !isCredentialCheck && tokens.refresh) {
      original._retry = true
      const token = await refreshAccessToken()
      if (token) {
        original.headers.Authorization = `Bearer ${token}`
        return api(original)
      }
    }
    return Promise.reject(error)
  },
)

export function wsUrl(token: string) {
  const explicit = import.meta.env.VITE_WS_URL as string | undefined
  const base = explicit ?? `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}`
  return `${base}/ws/parking/?token=${encodeURIComponent(token)}`
}
