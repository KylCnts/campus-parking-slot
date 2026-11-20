import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from './api'
import type { Meta } from './types'

/** Fetch a GET endpoint, re-fetching when params change. `reload` re-runs it silently. */
export function useFetch<T>(url: string | null, params?: Record<string, unknown>) {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(!!url)
  const [error, setError] = useState<string | null>(null)
  const key = JSON.stringify(params ?? {})
  const seq = useRef(0)

  const load = useCallback(
    async (silent = false) => {
      if (!url) return
      const id = ++seq.current
      if (!silent) setLoading(true)
      try {
        const res = await api.get<T>(url, { params: JSON.parse(key) })
        if (id === seq.current) {
          setData(res.data)
          setError(null)
        }
      } catch (e) {
        if (id === seq.current) setError((e as Error).message)
      } finally {
        if (id === seq.current) setLoading(false)
      }
    },
    [url, key],
  )

  useEffect(() => {
    load()
  }, [load])

  const reload = useCallback(() => load(true), [load])
  return { data, loading, error, reload, setData }
}

let metaCache: Promise<Meta> | null = null
export function useMeta() {
  const [meta, setMeta] = useState<Meta | null>(null)
  useEffect(() => {
    metaCache ??= api.get<Meta>('/meta/').then((r) => r.data)
    metaCache.then(setMeta).catch(() => (metaCache = null))
  }, [])
  return meta
}

export function useDebounced<T>(value: T, ms = 350) {
  const [v, setV] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return v
}

/** Forces a re-render every `ms` so relative times ("2m ago") stay current. */
export function useTick(ms = 15000) {
  const [, set] = useState(0)
  useEffect(() => {
    const t = setInterval(() => set((n) => n + 1), ms)
    return () => clearInterval(t)
  }, [ms])
}
