import { useEffect, useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { PageHeader } from '../components/PortalLayout'
import { Notice } from '../components/ui'
import { useAuth } from '../lib/AuthProvider'
import { useSettings } from '../lib/SettingsProvider'
import { supabase } from '../lib/supabase'
import { formatGBP } from '../lib/format'
import { fmtDay, fmtTime, type Lesson } from '../lib/lessons'
import { balance, isOverdue, type Invoice } from '../lib/billing'
import { useMyFamily } from '../lib/families'
import { exportMyData } from '../lib/privacy'

function Tile({ label, value, note, to }: { label: string; value: ReactNode; note?: ReactNode; to?: string }) {
  const body = (
    <>
      <p className="text-sm text-muted">{label}</p>
      <p className="mt-2 text-3xl font-semibold">{value}</p>
      {note && <p className="mt-1 text-xs text-muted">{note}</p>}
    </>
  )
  return to ? <Link to={to} className="card block transition hover:border-primary">{body}</Link> : <div className="card">{body}</div>
}

const firstName = (n?: string | null) => (n ? n.split(' ')[0] : '')
const startOfToday = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d }
const count = async (q: PromiseLike<{ count: number | null }>) => (await q).count ?? 0

/** Only show a tile when its module is switched on. */
function useModuleOn() {
  const { modules } = useSettings()
  return (key: string) => modules.find((m) => m.key === key)?.enabled ?? true
}

export function AdminDashboard() {
  const { profile } = useAuth()
  const on = useModuleOn()
  const [today, setToday] = useState<Lesson[]>([])
  const [stats, setStats] = useState({ toMark: 0, enquiries: 0, requests: 0, overdue: 0, owed: 0, drafts: 0 })
  const [names, setNames] = useState<{ s: Record<string, string>; g: Record<string, string> }>({ s: {}, g: {} })

  useEffect(() => {
    (async () => {
      const from = startOfToday(), to = new Date(from.getTime() + 86400e3)
      const [{ data: l }, toMark, enquiries, requests, { data: inv }, { data: st }, { data: gr }] = await Promise.all([
        supabase.from('lessons').select('*').gte('starts_at', from.toISOString()).lt('starts_at', to.toISOString()).neq('status', 'cancelled_by_tutor').order('starts_at'),
        count(supabase.from('homework_submissions').select('id', { count: 'exact', head: true }).in('status', ['submitted', 'late'])),
        count(supabase.from('enquiries').select('id', { count: 'exact', head: true }).eq('status', 'new')),
        count(supabase.from('lesson_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending')),
        supabase.from('invoices').select('*').in('status', ['draft', 'sent', 'part_paid']),
        supabase.from('students').select('id, first_name, last_name'),
        supabase.from('groups').select('id, name'),
      ])
      const invs = (inv ?? []) as Invoice[]
      const live = invs.filter((i) => i.status !== 'draft')
      setToday((l ?? []) as Lesson[])
      setStats({ toMark, enquiries, requests, overdue: live.filter(isOverdue).length, owed: live.reduce((a, i) => a + balance(i), 0), drafts: invs.length - live.length })
      setNames({
        s: Object.fromEntries((st ?? []).map((x) => [x.id, [x.first_name, x.last_name].filter(Boolean).join(' ')])),
        g: Object.fromEntries((gr ?? []).map((x) => [x.id, x.name])),
      })
    })()
  }, [])

  return (
    <>
      <PageHeader title={`Welcome${profile?.full_name ? `, ${firstName(profile.full_name)}` : ''}`} subtitle="Here’s what needs your attention today." />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {on('calendar') && <Tile label="Lessons today" value={today.length} to="/admin/calendar" note={today[0] ? `First at ${fmtTime(today[0].starts_at)}` : 'Nothing booked'} />}
        {on('homework') && <Tile label="Homework to mark" value={stats.toMark} to="/admin/homework" />}
        {on('enquiries') && <Tile label="New enquiries" value={stats.enquiries} to="/admin/enquiries" />}
        {on('invoices') && <Tile label="Overdue invoices" value={stats.overdue} to="/admin/invoices" note={`${formatGBP(stats.owed)} outstanding${stats.drafts ? ` · ${stats.drafts} draft${stats.drafts === 1 ? '' : 's'}` : ''}`} />}
      </div>
      {stats.requests > 0 && on('lessons') && (
        <div className="mt-6"><Notice><Link to="/admin/lessons" className="font-medium text-primary hover:underline">{stats.requests} lesson request{stats.requests === 1 ? '' : 's'}</Link> from parents waiting for a reply.</Notice></div>
      )}
      {on('calendar') && (
        <section className="mt-8">
          <h2 className="mb-3 font-semibold">Today</h2>
          <div className="card divide-y divide-line p-0">
            {today.map((l) => (
              <div key={l.id} className="flex items-center justify-between gap-4 px-6 py-3 text-sm">
                <span className="w-16 font-medium">{fmtTime(l.starts_at)}</span>
                <span className="flex-1">{l.kind === 'group' ? names.g[l.group_id ?? ''] ?? 'Group' : names.s[l.student_id ?? ''] ?? '1:1'}</span>
                <span className="text-muted">{l.delivery === 'online' ? 'Online' : l.location || 'In person'}</span>
                {l.meeting_url && <a href={l.meeting_url} target="_blank" rel="noreferrer" className="text-primary hover:underline">Join</a>}
              </div>
            ))}
            {!today.length && <p className="px-6 py-4 text-sm text-muted">No lessons today.</p>}
          </div>
        </section>
      )}
    </>
  )
}

function useFamilyOverview(studentIds: string[], familyId: string | null) {
  const [next, setNext] = useState<Lesson | null>(null)
  const [due, setDue] = useState(0)
  const [owed, setOwed] = useState<{ total: number; overdue: number } | null>(null)
  const key = studentIds.join(',')
  useEffect(() => {
    if (!studentIds.length) return
    (async () => {
      const { data: gm } = await supabase.from('group_members').select('group_id').in('student_id', studentIds)
      const groups = [...new Set((gm ?? []).map((g) => g.group_id))]
      const filter = [`student_id.in.(${studentIds.join(',')})`, ...(groups.length ? [`group_id.in.(${groups.join(',')})`] : [])].join(',')
      const [{ data: l }, todo] = await Promise.all([
        supabase.from('lessons').select('*').or(filter).eq('status', 'scheduled').gte('starts_at', new Date().toISOString()).order('starts_at').limit(1).maybeSingle(),
        count(supabase.from('homework_submissions').select('id', { count: 'exact', head: true }).in('student_id', studentIds).eq('status', 'set')),
      ])
      setNext(l as Lesson | null); setDue(todo)
      if (familyId) {
        const { data: inv } = await supabase.from('invoices').select('*').eq('family_id', familyId).in('status', ['sent', 'part_paid'])
        const list = (inv ?? []) as Invoice[]
        setOwed({ total: list.reduce((a, i) => a + balance(i), 0), overdue: list.filter(isOverdue).length })
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, familyId])
  return { next, due, owed }
}

export function ParentDashboard() {
  const { profile } = useAuth()
  const on = useModuleOn()
  const { family, students, loading } = useMyFamily()
  const { next, due, owed } = useFamilyOverview(students.map((s) => s.id), family?.id ?? null)
  const { settings } = useSettings()
  const [exporting, setExporting] = useState(false)

  return (
    <>
      <PageHeader title={`Hello${profile?.full_name ? ` ${firstName(profile.full_name)}` : ''}`} subtitle="Your children’s lessons, homework and invoices in one place." />
      {!loading && !family && (
        <div className="mb-6"><Notice>Welcome! Start by <Link to="/parent/students" className="font-medium text-primary underline">adding your family details and children</Link>.</Notice></div>
      )}
      <div className="grid gap-4 sm:grid-cols-3">
        {on('calendar') && <Tile label="Next lesson" to="/parent/calendar" value={next ? fmtDay(next.starts_at) : '–'} note={next ? `${fmtTime(next.starts_at)} · ${next.delivery === 'online' ? 'Online' : next.location || 'In person'}` : 'Nothing booked'} />}
        {on('homework') && <Tile label="Homework to do" to="/parent/homework" value={due} />}
        {on('invoices') && <Tile label="Balance" to="/parent/invoices" value={formatGBP(owed?.total ?? 0)} note={owed?.overdue ? `${owed.overdue} overdue` : 'Nothing overdue'} />}
      </div>
      {next?.meeting_url && <p className="mt-4 text-sm"><a href={next.meeting_url} target="_blank" rel="noreferrer" className="text-primary hover:underline">Join the next lesson on Teams</a></p>}

      <section className="card mt-10 max-w-2xl text-sm">
        <h2 className="font-semibold">Your data</h2>
        <p className="mt-1 text-muted">Download a copy of everything we hold about your family, or ask us to delete your account.</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button className="btn-outline" disabled={exporting} onClick={async () => { setExporting(true); await exportMyData(); setExporting(false) }}>{exporting ? 'Preparing…' : 'Download my data'}</button>
          {settings.contact_email && (
            <a className="btn-outline" href={`mailto:${settings.contact_email}?subject=${encodeURIComponent('Please delete my account')}&body=${encodeURIComponent(`Please delete the account for ${profile?.email ?? ''} and our family's data.`)}`}>Ask to delete my account</a>
          )}
        </div>
      </section>
    </>
  )
}

export function StudentDashboard() {
  const { profile, session } = useAuth()
  const [me, setMe] = useState<string[]>([])
  useEffect(() => {
    if (!session) return
    supabase.from('students').select('id').eq('user_id', session.user.id).then(({ data }) => setMe((data ?? []).map((s) => s.id)))
  }, [session])
  const { next, due } = useFamilyOverview(me, null)
  const [recent, setRecent] = useState<{ id: string; score: number | null; total: number | null; homework: { title: string } | null }[]>([])
  useEffect(() => {
    if (!me.length) return
    supabase.from('homework_submissions').select('id, score, total, homework(title)').in('student_id', me).eq('status', 'marked').order('marked_at', { ascending: false }).limit(5)
      .then(({ data }) => setRecent((data ?? []) as unknown as typeof recent))
  }, [me])
  return (
    <>
      <PageHeader title={`Hi ${firstName(profile?.full_name) || profile?.username || 'there'}!`} subtitle="Ready to learn something new today?" />
      <div className="grid gap-4 sm:grid-cols-2">
        <Tile label="Next lesson" to="/student/calendar" value={next ? fmtDay(next.starts_at) : '–'} note={next ? fmtTime(next.starts_at) : 'Nothing booked'} />
        <Tile label="Homework to do" to="/student/homework" value={due} note={due ? 'You can do it!' : 'All done, well done!'} />
      </div>
      {next?.meeting_url && <p className="mt-4 text-sm"><a href={next.meeting_url} target="_blank" rel="noreferrer" className="text-primary hover:underline">Join your next lesson</a></p>}
      {recent.length > 0 && (
        <section className="mt-8 max-w-xl">
          <h2 className="mb-3 font-semibold">Recent marks</h2>
          <div className="card divide-y divide-line p-0">
            {recent.map((r) => (
              <div key={r.id} className="flex justify-between px-6 py-3 text-sm">
                <span>{r.homework?.title}</span>
                <span className="font-medium">{r.score != null ? `${r.score}${r.total ? ` / ${r.total}` : ''}` : 'Marked'}</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </>
  )
}

/** Fallback for a module with no page of its own. */
export function ModulePage() {
  const { moduleKey } = useParams()
  const { modules } = useSettings()
  const mod = modules.find((m) => m.key === moduleKey)
  if (mod && !mod.enabled) return <PageHeader title="Not available" subtitle="This section has been switched off." />
  return (
    <>
      <PageHeader title={mod?.display_name ?? 'Not found'} />
      <div className="card text-sm text-muted">There's nothing here yet.</div>
    </>
  )
}
