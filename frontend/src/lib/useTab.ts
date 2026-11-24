import { useSearchParams } from 'react-router-dom'

/** The active tab of a page, kept in the address (?tab=...) so links, refresh and the back button keep it. */
export function useTab<T extends string>(tabs: readonly T[], fallback: T) {
  const [params, setParams] = useSearchParams()
  const raw = params.get('tab') as T | null
  const tab: T = raw && tabs.includes(raw) ? raw : fallback
  const setTab = (next: string) => {
    const p = new URLSearchParams()
    if (next !== fallback) p.set('tab', next)
    setParams(p, { replace: true })
  }
  return [tab, setTab] as const
}
