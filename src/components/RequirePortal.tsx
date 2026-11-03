import { Navigate, useLocation } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useAuth } from '../lib/AuthProvider'
import { canAccessPortal, homePortal } from '../lib/roles'
import type { Portal } from '../lib/types'

export function Loading() {
  return <div className="flex min-h-[50vh] items-center justify-center text-sm text-muted">Loading…</div>
}

export function RequirePortal({ portal, children }: { portal: Portal; children: ReactNode }) {
  const { session, roles, loading } = useAuth()
  const location = useLocation()
  if (loading) return <Loading />
  if (!session) return <Navigate to={portal === 'student' ? '/student-login' : '/login'} state={{ from: location }} replace />
  if (!canAccessPortal(roles, portal)) {
    const home = homePortal(roles)
    return <Navigate to={home ? `/${home}` : '/'} replace />
  }
  return <>{children}</>
}
