import { useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { LogOut, Menu, X } from 'lucide-react'
import { Logo } from './Logo'
import { Icon } from './Icon'
import { useSettings } from '../lib/SettingsProvider'
import { useAuth } from '../lib/AuthProvider'
import { isSuperAdmin } from '../lib/roles'
import { ROLE_LABELS, type Portal } from '../lib/types'

const TITLES: Record<Portal, string> = { admin: 'Staff', parent: 'Parent', student: 'Student' }

export function PortalLayout({ portal }: { portal: Portal }) {
  const { modules } = useSettings()
  const { profile, roles, signOut } = useAuth()
  const [open, setOpen] = useState(false)

  const items = [
    { to: `/${portal}`, label: 'Dashboard', icon: 'dashboard', end: true },
    ...modules
      .filter((m) => m.enabled && m.portals.includes(portal))
      .map((m) => ({ to: `/${portal}/${m.key}`, label: m.display_name, icon: m.icon ?? 'folder', end: false })),
    ...(portal === 'admin' && isSuperAdmin(roles) ? [{ to: '/admin/settings', label: 'Site settings', icon: 'settings', end: false }] : []),
  ]

  const nav = (
    <nav className="flex flex-col gap-1">
      {items.map((i) => (
        <NavLink
          key={i.to} to={i.to} end={i.end} onClick={() => setOpen(false)}
          className={({ isActive }) => `flex items-center gap-3 rounded-lg px-3 py-2 text-sm ${isActive ? 'bg-primary-soft font-medium text-primary' : 'text-muted hover:bg-secondary hover:text-ink'}`}
        >
          <Icon name={i.icon} /> {i.label}
        </NavLink>
      ))}
    </nav>
  )

  const roleLabel = roles.length ? ROLE_LABELS[roles[0]] : TITLES[portal]

  return (
    <div className="min-h-screen bg-secondary">
      <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-line bg-white px-4 lg:hidden">
        <Logo to={`/${portal}`} />
        <button onClick={() => setOpen(!open)} aria-label="Menu">{open ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}</button>
      </header>
      {open && <div className="border-b border-line bg-white p-4 lg:hidden">{nav}</div>}
      <div className="flex">
        <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col justify-between border-r border-line bg-white p-5 lg:flex">
          <div className="flex flex-col gap-8">
            <Logo to={`/${portal}`} />
            {nav}
          </div>
          <div className="border-t border-line pt-4">
            <p className="truncate text-sm font-medium">{profile?.full_name || profile?.email || profile?.username}</p>
            <p className="mb-3 text-xs text-muted">{roleLabel}</p>
            <button onClick={signOut} className="flex items-center gap-2 text-sm text-muted hover:text-ink"><LogOut className="h-4 w-4" /> Sign out</button>
          </div>
        </aside>
        <main className="min-w-0 flex-1 p-4 sm:p-8">
          <Outlet />
          <button onClick={signOut} className="mt-10 flex items-center gap-2 text-sm text-muted lg:hidden"><LogOut className="h-4 w-4" /> Sign out</button>
        </main>
      </div>
    </div>
  )
}

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) {
  return (
    <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-semibold text-ink">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {action}
    </div>
  )
}
