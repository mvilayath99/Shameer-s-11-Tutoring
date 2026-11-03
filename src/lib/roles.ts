import { STAFF_ROLES, type AppRole, type Portal } from './types'

export const isStaff = (roles: AppRole[]) => roles.some((r) => STAFF_ROLES.includes(r))
export const isSuperAdmin = (roles: AppRole[]) => roles.includes('super_admin')

/** Which area a signed-in user lands in. Staff win over parent, parent over student. */
export function homePortal(roles: AppRole[]): Portal | null {
  if (isStaff(roles)) return 'admin'
  if (roles.includes('parent')) return 'parent'
  if (roles.includes('student')) return 'student'
  return null
}

export function canAccessPortal(roles: AppRole[], portal: Portal) {
  if (portal === 'admin') return isStaff(roles)
  return roles.includes(portal)
}
