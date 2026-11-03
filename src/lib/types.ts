export type AppRole = 'super_admin' | 'tutor' | 'assistant_tutor' | 'parent' | 'student'
export type Portal = 'admin' | 'parent' | 'student'

export interface SiteSettings {
  business_name: string
  tagline: string | null
  logo_url: string | null
  favicon_url: string | null
  primary_color: string
  secondary_color: string
  accent_color: string
  font_family: string
  contact_email: string | null
  contact_phone: string | null
  address: string | null
}

export interface ModuleRow {
  key: string
  display_name: string
  enabled: boolean
  sort_order: number
  portals: Portal[]
  icon: string | null
}

export const STAFF_ROLES: AppRole[] = ['super_admin', 'tutor', 'assistant_tutor']

export const ROLE_LABELS: Record<AppRole, string> = {
  super_admin: 'Super admin',
  tutor: 'Tutor',
  assistant_tutor: 'Assistant tutor',
  parent: 'Parent',
  student: 'Student',
}
