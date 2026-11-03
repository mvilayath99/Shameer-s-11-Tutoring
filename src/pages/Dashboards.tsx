import { useParams } from 'react-router-dom'
import { PageHeader } from '../components/PortalLayout'
import { useAuth } from '../lib/AuthProvider'
import { useSettings } from '../lib/SettingsProvider'

function Tile({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="card">
      <p className="text-sm text-muted">{label}</p>
      <p className="mt-2 text-3xl font-semibold">{value}</p>
      <p className="mt-1 text-xs text-muted">{note}</p>
    </div>
  )
}

const firstName = (n?: string | null) => (n ? n.split(' ')[0] : '')

export function AdminDashboard() {
  const { profile } = useAuth()
  return (
    <>
      <PageHeader title={`Welcome${profile?.full_name ? `, ${firstName(profile.full_name)}` : ''}`} subtitle="Here’s what needs your attention today." />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Tile label="Lessons today" value="–" note="Calendar arrives in step 5" />
        <Tile label="Homework to mark" value="–" note="Homework arrives in step 6" />
        <Tile label="New enquiries" value="–" note="Enquiries arrive in step 3" />
        <Tile label="Overdue invoices" value="–" note="Invoices arrive in step 7" />
      </div>
    </>
  )
}

export function ParentDashboard() {
  const { profile } = useAuth()
  return (
    <>
      <PageHeader title={`Hello${profile?.full_name ? ` ${firstName(profile.full_name)}` : ''}`} subtitle="Your children’s lessons, homework and invoices in one place." />
      <div className="grid gap-4 sm:grid-cols-3">
        <Tile label="Next lesson" value="–" note="Coming soon" />
        <Tile label="Homework due" value="–" note="Coming soon" />
        <Tile label="Balance" value="£0.00" note="Coming soon" />
      </div>
    </>
  )
}

export function StudentDashboard() {
  const { profile } = useAuth()
  return (
    <>
      <PageHeader title={`Hi ${firstName(profile?.full_name) || profile?.username || 'there'}!`} subtitle="Ready to learn something new today?" />
      <div className="grid gap-4 sm:grid-cols-2">
        <Tile label="Next lesson" value="–" note="Your lessons will show here" />
        <Tile label="Homework to do" value="–" note="Your homework will show here" />
      </div>
    </>
  )
}

/** Placeholder for modules that later steps will build. */
export function ModulePage() {
  const { moduleKey } = useParams()
  const { modules } = useSettings()
  const mod = modules.find((m) => m.key === moduleKey)
  if (mod && !mod.enabled) return <PageHeader title="Not available" subtitle="This section has been switched off." />
  return (
    <>
      <PageHeader title={mod?.display_name ?? 'Coming soon'} />
      <div className="card text-sm text-muted">This section is being built and will appear here soon.</div>
    </>
  )
}
