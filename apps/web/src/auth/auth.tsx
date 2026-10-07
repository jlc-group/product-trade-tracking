import { can, type Permission, type User } from '@flowtrade/shared'
import { useQueryClient } from '@tanstack/react-query'
import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router'
import { api } from '@/api'
import { qk, useMe } from '@/api/hooks'
import { FullPageSpinner } from '@/components/common/full-page-spinner'

interface AuthContextValue {
  user: User | null
  isLoading: boolean
  login: (email: string, password: string) => Promise<User>
  logout: () => Promise<void>
  can: (permission: Permission) => boolean
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient()
  const { data: user = null, isLoading } = useMe()

  // Drop every cached query except `me` (clearing `me` would detach its observer).
  const resetCache = useCallback(() => {
    qc.removeQueries({ predicate: (q) => q.queryKey[0] !== qk.me[0] })
  }, [qc])

  const afterLogin = useCallback(
    (u: User) => {
      resetCache()
      qc.setQueryData(qk.me, u)
      return u
    },
    [qc, resetCache],
  )

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isLoading,
      login: async (email, password) => afterLogin(await api.auth.login(email, password)),
      logout: async () => {
        await api.auth.logout()
        resetCache()
        qc.setQueryData(qk.me, null)
      },
      can: (permission) => can(user, permission),
    }),
    [user, isLoading, afterLogin, resetCache, qc],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}

/** The signed-in user (only call inside <RequireAuth>). */
export function useCurrentUser(): User {
  const { user } = useAuth()
  if (!user) throw new Error('useCurrentUser called outside an authenticated route')
  return user
}

/** Route guard: signed in, and password changed if the admin issued a temporary one. */
export function RequireAuth() {
  const { user, isLoading } = useAuth()
  const location = useLocation()
  if (isLoading) return <FullPageSpinner />
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />
  if (user.mustChangePassword && location.pathname !== '/change-password') return <Navigate to="/change-password" replace />
  return <Outlet />
}

/** Route guard for permission-gated pages. */
export function RequirePermission({ permission, children }: { permission: Permission; children?: ReactNode }) {
  const { can: has } = useAuth()
  if (!has(permission)) return <Navigate to="/" replace />
  return children ? <>{children}</> : <Outlet />
}

/** UI gate: render children only when the user holds the permission. */
export function Can({ permission, children, fallback = null }: { permission: Permission; children: ReactNode; fallback?: ReactNode }) {
  const { can: has } = useAuth()
  return <>{has(permission) ? children : fallback}</>
}
