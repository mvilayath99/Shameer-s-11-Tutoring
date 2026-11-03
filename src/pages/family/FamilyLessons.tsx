import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { ExternalLink, MapPin, Video } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/AuthProvider'
import { STATUS_LABEL, STATUS_TONE, WEEKDAYS, fmtLong, fmtTime, useStaff, type Lesson } from '../../lib/lessons'
import { PageHeader } from '../../components/PortalLayout'
import { useModuleName } from '../../components/ModuleGate'
import { Modal } from '../../components/Modal'
import { Badge, Field, Notice } from '../../components/ui'

interface Kid { id: string; first_name: string }
interface Slot { tutor_id: string; weekday: number; start_time: string; end_time: string; delivery: string | null }

/** Lessons for families. "upcoming" = calendar module, "past" = lessons module (with feedback). */
export default function FamilyLessons({ mode, portal }: { mode: 'upcoming' | 'past'; portal: 'parent' | 'student' }) {
  const title = useModuleName(mode === 'upcoming' ? 'calendar' : 'lessons', mode === 'upcoming' ? 'Calendar' : 'Lessons')
  const { session } = useAuth()
  const staff = useStaff()
  const [kids, setKids] = useState<Kid[]>([])
  const [groupKids, setGroupKids] = useState<Record<string, string[]>>({})
  const [groupNames, setGroupNames] = useState<Record<string, string>>({})
  const [lessons, setLessons] = useState<Lesson[]>([])
  const [requested, setRequested] = useState<Set<string>>(new Set())
  const [asking, setAsking] = useState<{ kind: 'reschedule' | 'cancel' | 'new_lesson'; lesson?: Lesson } | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!session) return
    const now = new Date().toISOString()
    const ks = portal === 'student'
      ? await supabase.from('students').select('id, first_name').eq('user_id', session.user.id)
      : await supabase.from('students').select('id, first_name').order('first_name')
    setKids((ks.data ?? []) as Kid[])
    const [{ data: gm }, { data: g }, { data: l }, { data: r }] = await Promise.all([
      supabase.from('group_members').select('group_id, student_id'),
      supabase.from('groups').select('id, name'),
      mode === 'upcoming'
        ? supabase.from('lessons').select('*').gte('ends_at', now).order('starts_at').limit(60)
        : supabase.from('lessons').select('*').lt('starts_at', now).order('starts_at', { ascending: false }).limit(60),
      supabase.from('lesson_requests').select('lesson_id').eq('status', 'pending'),
    ])
    const map: Record<string, string[]> = {}
    for (const m of gm ?? []) (map[m.group_id] ??= []).push(m.student_id)
    setGroupKids(map); setGroupNames(Object.fromEntries((g ?? []).map((x) => [x.id, x.name])))
    setLessons((l ?? []) as Lesson[]); setRequested(new Set((r ?? []).map((x) => x.lesson_id).filter(Boolean) as string[]))
  }, [session, mode, portal])
  useEffect(() => { load() }, [load])

  const kidName = (id: string) => kids.find((k) => k.id === id)?.first_name
  const forWhom = (l: Lesson) => (l.student_id ? [l.student_id] : groupKids[l.group_id ?? ''] ?? []).filter((id) => kids.some((k) => k.id === id))
  const tutor = (id: string | null) => staff.find((s) => s.id === id)?.full_name

  return (
    <>
      <PageHeader title={title} subtitle={mode === 'upcoming' ? 'Upcoming lessons' : 'Past lessons and feedback'}
        action={portal === 'parent' && mode === 'upcoming' && kids.length > 0 && <button className="btn-outline" onClick={() => setAsking({ kind: 'new_lesson' })}>Request a lesson</button>} />
      {msg && <div className="mb-4"><Notice kind="success">{msg}</Notice></div>}
      {!lessons.length && <div className="card text-sm text-muted">{mode === 'upcoming' ? 'No upcoming lessons yet.' : 'No past lessons yet.'}</div>}
      <div className="flex flex-col gap-3">
        {lessons.map((l) => {
          const who = forWhom(l)
          const soon = new Date(l.starts_at).getTime() - Date.now() < 1000 * 60 * 30
          return (
            <div key={l.id} className="card flex flex-col gap-3 sm:flex-row sm:items-start">
              <div className="w-40 shrink-0">
                <p className="font-semibold">{fmtLong(l.starts_at)}</p>
                <p className="text-sm text-muted">{fmtTime(l.starts_at)}–{fmtTime(l.ends_at)}</p>
              </div>
              <div className="flex-1 text-sm">
                <p className="font-medium">
                  {l.kind === 'group' ? groupNames[l.group_id ?? ''] ?? 'Group lesson' : '1:1 lesson'}
                  {portal === 'parent' && who.length > 0 && <span className="font-normal text-muted"> · {who.map(kidName).join(', ')}</span>}
                </p>
                <p className="mt-1 flex items-center gap-1.5 text-muted">
                  {l.delivery === 'online' ? <Video className="h-4 w-4" /> : <MapPin className="h-4 w-4" />}
                  {l.delivery === 'online' ? 'Online (Microsoft Teams)' : l.location || 'In person'}{tutor(l.tutor_id) ? ` · with ${tutor(l.tutor_id)}` : ''}
                </p>
                {mode === 'past' && l.parent_feedback && <div className="mt-3 rounded-lg bg-secondary p-3"><p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted">Feedback</p>{l.parent_feedback}</div>}
                {mode === 'past' && l.topics.length > 0 && <p className="mt-2 text-xs text-muted">Topics: {l.topics.join(', ')}</p>}
              </div>
              <div className="flex shrink-0 flex-col items-start gap-2 sm:items-end">
                {l.status !== 'scheduled' ? <Badge tone={STATUS_TONE[l.status]}>{STATUS_LABEL[l.status]}</Badge>
                  : mode === 'upcoming' && l.delivery === 'online' && (l.meeting_url
                    ? <a href={l.meeting_url} target="_blank" rel="noreferrer" className={soon ? 'btn-primary' : 'btn-outline'}>Join lesson <ExternalLink className="h-4 w-4" /></a>
                    : <span className="text-xs text-muted">Join link coming soon</span>)}
                {portal === 'parent' && mode === 'upcoming' && l.status === 'scheduled' && (
                  requested.has(l.id) ? <span className="text-xs text-muted">Request sent</span> : (
                    <div className="flex gap-3 text-xs">
                      <button className="text-primary hover:underline" onClick={() => setAsking({ kind: 'reschedule', lesson: l })}>Reschedule</button>
                      <button className="text-muted hover:underline" onClick={() => setAsking({ kind: 'cancel', lesson: l })}>Cancel</button>
                    </div>
                  )
                )}
              </div>
            </div>
          )
        })}
      </div>
      {asking && <RequestForm kind={asking.kind} lesson={asking.lesson} kids={asking.lesson ? kids.filter((k) => forWhom(asking.lesson!).includes(k.id)) : kids}
        onClose={() => setAsking(null)} onSent={() => { setAsking(null); setMsg('Request sent. We’ll confirm soon.'); load() }} />}
    </>
  )
}

function RequestForm({ kind, lesson, kids, onClose, onSent }: { kind: 'reschedule' | 'cancel' | 'new_lesson'; lesson?: Lesson; kids: Kid[]; onClose: () => void; onSent: () => void }) {
  const [studentId, setStudentId] = useState(kids[0]?.id ?? '')
  const [preferred, setPreferred] = useState('')
  const [message, setMessage] = useState('')
  const [slots, setSlots] = useState<Slot[]>([])
  const [hours, setHours] = useState(24)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    supabase.from('availability').select('tutor_id, weekday, start_time, end_time, delivery').order('weekday').then(({ data }) => setSlots((data ?? []) as Slot[]))
    supabase.from('practice_settings').select('late_cancel_hours').maybeSingle().then(({ data }) => { if (data) setHours(data.late_cancel_hours) })
  }, [])
  const late = lesson && new Date(lesson.starts_at).getTime() - Date.now() < hours * 3600000

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const { data: u } = await supabase.auth.getUser()
    const { error } = await supabase.from('lesson_requests').insert({ kind, student_id: studentId, lesson_id: lesson?.id ?? null, preferred_time: preferred || null, message: message || null, requested_by: u.user?.id })
    if (error) setError(error.message); else onSent()
  }
  const label = { reschedule: 'Request a new time', cancel: 'Request a cancellation', new_lesson: 'Request a lesson' }[kind]

  return (
    <Modal title={label} onClose={onClose}>
      <form onSubmit={submit} className="flex flex-col gap-4">
        {error && <Notice kind="error">{error}</Notice>}
        {lesson && <p className="text-sm text-muted">{fmtLong(lesson.starts_at)} at {fmtTime(lesson.starts_at)}</p>}
        {kind === 'cancel' && late && <Notice>This lesson is within {hours} hours, so it may still be charged.</Notice>}
        {kids.length > 1 && <Field label="Child"><select className="input" value={studentId} onChange={(e) => setStudentId(e.target.value)}>{kids.map((k) => <option key={k.id} value={k.id}>{k.first_name}</option>)}</select></Field>}
        {kind !== 'cancel' && (
          <>
            {slots.length > 0 && (
              <div className="text-sm">
                <p className="label">Usual availability</p>
                <div className="flex flex-wrap gap-2">
                  {slots.map((s, i) => {
                    const text = `${WEEKDAYS[s.weekday]} ${s.start_time.slice(0, 5)}–${s.end_time.slice(0, 5)}`
                    return <button type="button" key={i} onClick={() => setPreferred(text)} className={`rounded-full border px-3 py-1 ${preferred === text ? 'border-primary bg-primary-soft text-primary' : 'border-line text-muted'}`}>{text}</button>
                  })}
                </div>
              </div>
            )}
            <Field label="Preferred day and time"><input className="input" required value={preferred} onChange={(e) => setPreferred(e.target.value)} placeholder="For example Thursday 5pm" /></Field>
          </>
        )}
        <Field label="Message (optional)"><textarea rows={3} className="input" value={message} onChange={(e) => setMessage(e.target.value)} /></Field>
        <button className="btn-primary self-start">Send request</button>
      </form>
    </Modal>
  )
}
