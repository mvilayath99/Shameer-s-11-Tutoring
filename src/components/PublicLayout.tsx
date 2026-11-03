import { useState } from 'react'
import { Link, NavLink, Outlet } from 'react-router-dom'
import { Menu, X } from 'lucide-react'
import { Logo } from './Logo'
import { useSettings } from '../lib/SettingsProvider'
import { useAuth } from '../lib/AuthProvider'
import { homePortal } from '../lib/roles'

const NAV = [
  { to: '/', label: 'Home' },
  { to: '/about', label: 'About' },
  { to: '/courses', label: 'Courses' },
  { to: '/exam-boards', label: 'Exam boards' },
  { to: '/faq', label: 'FAQ' },
  { to: '/contact', label: 'Contact' },
]

export function PublicLayout() {
  const { settings } = useSettings()
  const { session, roles } = useAuth()
  const [open, setOpen] = useState(false)
  const portal = homePortal(roles)

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-line bg-white">
        <div className="container-page flex h-16 items-center justify-between">
          <Logo />
          <nav className="hidden items-center gap-6 lg:flex">
            {NAV.map((n) => (
              <NavLink key={n.to} to={n.to} end className={({ isActive }) => `text-sm ${isActive ? 'text-primary font-medium' : 'text-muted hover:text-ink'}`}>
                {n.label}
              </NavLink>
            ))}
            {session && portal ? (
              <Link to={`/${portal}`} className="btn-primary">My account</Link>
            ) : (
              <Link to="/login" className="btn-outline">Sign in</Link>
            )}
          </nav>
          <button className="lg:hidden" onClick={() => setOpen(!open)} aria-label="Menu">
            {open ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>
        {open && (
          <nav className="container-page flex flex-col gap-4 border-t border-line py-4 lg:hidden">
            {NAV.map((n) => <Link key={n.to} to={n.to} onClick={() => setOpen(false)} className="text-sm">{n.label}</Link>)}
            <Link to={session && portal ? `/${portal}` : '/login'} onClick={() => setOpen(false)} className="btn-primary">
              {session && portal ? 'My account' : 'Sign in'}
            </Link>
          </nav>
        )}
      </header>
      <main className="flex-1"><Outlet /></main>
      <footer className="border-t border-line bg-secondary">
        <div className="container-page flex flex-col gap-2 py-8 text-sm text-muted sm:flex-row sm:justify-between">
          <span>© {new Date().getFullYear()} {settings.business_name}</span>
          <span className="flex gap-6">
            <Link to="/privacy" className="hover:text-ink">Privacy</Link>
            <Link to="/terms" className="hover:text-ink">Terms</Link>
            <Link to="/contact" className="hover:text-ink">Contact</Link>
          </span>
        </div>
      </footer>
    </div>
  )
}
