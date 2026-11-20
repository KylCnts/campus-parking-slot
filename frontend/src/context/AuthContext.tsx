import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { api, setSessionExpiredHandler, tokens } from '@/lib/api'
import type { Role, User } from '@/lib/types'

interface AuthState {
  user: User | null
  loading: boolean
  login: (email: string, password: string) => Promise<User>
  logout: () => Promise<void>
  refreshUser: () => Promise<void>
  hasRole: (...roles: Role[]) => boolean
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  const refreshUser = useCallback(async () => {
    const { data } = await api.get<User>('/auth/me/')
    setUser(data)
  }, [])

  useEffect(() => {
    setSessionExpiredHandler(() => {
      setUser((prev) => {
        if (prev) toast.error('Your session has expired. Please sign in again.')
        return null
      })
    })
    if (!tokens.refresh) {
      setLoading(false)
      return
    }
    refreshUser()
      .catch((e) => {
        if (e.response?.status === 401) tokens.clear()
      })
      .finally(() => setLoading(false))
  }, [refreshUser])

  const login = useCallback(async (email: string, password: string) => {
    const { data } = await api.post('/auth/login/', { email, password })
    tokens.set(data.access, data.refresh)
    setUser(data.user)
    return data.user as User
  }, [])

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout/', { refresh: tokens.refresh })
    } catch {
      /* token may already be invalid */
    }
    tokens.clear()
    setUser(null)
  }, [])

  const hasRole = useCallback((...roles: Role[]) => !!user && roles.includes(user.role), [user])

  const value = useMemo(() => ({ user, loading, login, logout, refreshUser, hasRole }), [user, loading, login, logout, refreshUser, hasRole])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
