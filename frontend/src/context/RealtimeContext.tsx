import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { getFreshAccessToken, tokens, wsUrl } from '@/lib/api'
import type { AvailabilitySummary, Notification } from '@/lib/types'
import { useAuth } from './AuthContext'

export interface ParkingEvent {
  type: 'parking.update'
  event: string
  detail?: { slot?: string; plate?: string; status?: string }
  summary: AvailabilitySummary
}

type Listener = (e: ParkingEvent) => void

interface RealtimeState {
  connected: boolean
  summary: AvailabilitySummary | null
  lastUpdate: Date | null
  unread: number
  setUnread: (n: number | ((p: number) => number)) => void
  subscribe: (fn: Listener) => () => void
}

const RealtimeContext = createContext<RealtimeState | null>(null)

export function RealtimeProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [connected, setConnected] = useState(false)
  const [summary, setSummary] = useState<AvailabilitySummary | null>(null)
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null)
  const [unread, setUnread] = useState(0)
  const listeners = useRef(new Set<Listener>())

  useEffect(() => {
    if (!user) return
    let ws: WebSocket | null = null
    let stopped = false
    let retry = 0
    let pingTimer: number | undefined
    let retryTimer: number | undefined

    const connect = async () => {
      const token = await getFreshAccessToken()
      if (stopped) return
      if (!token) {
        // Backend may be briefly down: keep trying while the session is still valid.
        if (tokens.refresh) retryTimer = window.setTimeout(connect, 5000)
        return
      }
      ws = new WebSocket(wsUrl(token))
      ws.onopen = () => {
        retry = 0
        setConnected(true)
        pingTimer = window.setInterval(() => ws?.readyState === 1 && ws.send(JSON.stringify({ type: 'ping' })), 25000)
      }
      ws.onmessage = (msg) => {
        const data = JSON.parse(msg.data)
        if (data.type === 'parking.update') {
          setSummary(data.summary)
          setLastUpdate(new Date())
          listeners.current.forEach((fn) => fn(data))
        } else if (data.type === 'notification.new') {
          const n: Notification = data.notification
          setUnread((u) => u + 1)
          const fn = n.level === 'WARNING' || n.level === 'ALERT' ? toast.warning : n.level === 'SUCCESS' ? toast.success : toast.info
          fn(n.title, { description: n.message })
        }
      }
      ws.onclose = () => {
        setConnected(false)
        window.clearInterval(pingTimer)
        if (stopped) return
        // Exponential backoff; a fresh token is fetched on every attempt.
        retry = Math.min(retry + 1, 6)
        retryTimer = window.setTimeout(connect, 1000 * 2 ** (retry - 1))
      }
    }
    connect()
    return () => {
      stopped = true
      window.clearInterval(pingTimer)
      window.clearTimeout(retryTimer)
      ws?.close()
    }
  }, [user?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const subscribe = useCallback((fn: Listener) => {
    listeners.current.add(fn)
    return () => {
      listeners.current.delete(fn)
    }
  }, [])

  return (
    <RealtimeContext.Provider value={{ connected, summary, lastUpdate, unread, setUnread, subscribe }}>{children}</RealtimeContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useRealtime() {
  const ctx = useContext(RealtimeContext)
  if (!ctx) throw new Error('useRealtime must be used inside RealtimeProvider')
  return ctx
}

/** Re-run `fn` whenever the server pushes a parking change. */
// eslint-disable-next-line react-refresh/only-export-components
export function useLiveRefresh(fn: (e: ParkingEvent) => void) {
  const { subscribe } = useRealtime()
  const ref = useRef(fn)
  useEffect(() => {
    ref.current = fn
  })
  useEffect(() => subscribe((e) => ref.current(e)), [subscribe])
}
