import { useEffect, useMemo, useState } from 'react'
import { Printer } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthProvider'
import { fmtDay, type Lesson } from '../lib/lessons'
import { percent } from '../lib/homework'
import { PageHeader } from '../components/PortalLayout'
import { useModuleName } from '../components/ModuleGate'
import { Badge, Table, Td } from '../components/ui'

type Kid = { id: string; first_name: string; last_name: string | null; exam_date: string | null; school_year: string | null }
type Marked = { id: string; score: number | null; total: number | null; marked_at: string | null; comment: string | null; homework: { title: string; subject: string | null } | null }

const tone = (p: number | null) => (p == null ? 'grey' : p >= 80 ? 'green' : p >= 60 ? 'blue' : 'amber')

/** Progress report for one child: attendance, homework results by subject and topics covered. Printable. */
export default function Reports({ portal }: { portal: 'admin' | 'parent' | 'student' }) {
  const title = useModuleName('reports', 'Reports')
  const { session } = useAuth()
  const [kids, setKids] = useState<Kid[]>([])
  const [kidId, setKidId] = useState('')
  const [lessons, setLessons] = useState<Lesson[]>([])
  const [attendance, setAttendance] = useState<{ attendance: string }[]>([])
  const [marked, setMarked] = useState<Marked[]>([])
  const [since, setSince] = useState(() => { const d = new Date(); d.setMonth(d.getMonth() - 3); return d.toISOString().slice(0, 10) })

  useEffect(() => {
    if (!session) return
    let q = supabase.from('students').select('id, first_name, last_name, exam_date, school_year').eq('active', true).order('first_name')
    if (portal === 'student') q = q.eq('user_id', session.user.id)
    q.then(({ data }) => { setKids(data ?? []); setKidId((data ?? [])[0]?.id ?? '') })
  }, [session, portal])

  useEffect(() => {
    if (!kidId) return
    (async () => {
      const { data: gm } = await supabase.from('group_members').select('group_id').eq('student_id', kidId)
      const groups = (gm ?? []).map((g) => g.group_id)
      const filter = groups.length ? `student_id.eq.${kidId},group_id.in.(${groups.join(',')})` : `student_id.eq.${kidId}`
      const from = new Date(since + 'T00:00:00').toISOString()
      const [{ data: l }, { data: a }, { data: m }] = await Promise.all([
        supabase.from('lessons').select('*').or(filter).gte('starts_at', from).lte('starts_at', new Date().toISOString()).order('starts_at'),
        supabase.from('lesson_attendance').select('attendance, lessons!inner(starts_at)').eq('student_id', kidId).gte('lessons.starts_at', from),
        supabase.from('homework_submissions').select('id, score, total, marked_at, comment, homework(title, subject)').eq('student_id', kidId).eq('status', 'marked').gte('marked_at', from).order('marked_at'),
      ])
      setLessons((l ?? []) as Lesson[]); setAttendance((a ?? []) as { attendance: string }[]); setMarked((m ?? []) as unknown as Marked[])
    })()
  }, [kidId, since])

  const kid = kids.find((k) => k.id === kidId)
  const done = lessons.filter((l) => l.status === 'completed')
  const present = attendance.filter((a) => a.attendance !== 'absent').length
  const bySubject = useMemo(() => {
    const m = new Map<string, number[]>()
    for (const s of marked) { const p = percent(s); if (p == null) continue; const k = s.homework?.subject || 'General'; m.set(k, [...(m.get(k) ?? []), p]) }
    return [...m.entries()].map(([subject, ps]) => ({ subject, avg: Math.round(ps.reduce((a, b) => a + b, 0) / ps.length), count: ps.length, last: ps[ps.length - 1] }))
  }, [marked])
  const topics = [...new Set(done.flatMap((l) => l.topics ?? []))]
  const overall = bySubject.length ? Math.round(marked.map(percent).filter((p): p is number => p != null).reduce((a, b, _, arr) => a + b / arr.length, 0)) : null

  return (
    <>
      <div className="print:hidden">
        <PageHeader title={title} subtitle="Progress over a chosen period." action={<button className="btn-outline" onClick={() => window.print()}><Printer className="h-4 w-4" /> Print</button>} />
        <div className="mb-6 flex flex-wrap gap-4">
          {kids.length > 1 && (
            <label className="text-sm"><span className="label">Child</span>
              <select className="input" value={kidId} onChange={(e) => setKidId(e.target.value)}>
                {kids.map((k) => <option key={k.id} value={k.id}>{[k.first_name, k.last_name].filter(Boolean).join(' ')}</option>)}
              </select>
            </label>
          )}
          <label className="text-sm"><span className="label">Since</span><input type="date" className="input" value={since} onChange={(e) => setSince(e.target.value)} /></label>
        </div>
      </div>

      {!kid ? <div className="card text-sm text-muted">No children to report on yet.</div> : (
        <div className="space-y-8">
          <div>
            <h2 className="text-xl font-semibold">{[kid.first_name, kid.last_name].filter(Boolean).join(' ')}</h2>
            <p className="text-sm text-muted">{[kid.school_year, kid.exam_date ? `Exam ${fmtDay(kid.exam_date)}` : null, `Since ${fmtDay(since)}`].filter(Boolean).join(' · ')}</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="card"><p className="text-sm text-muted">Lessons completed</p><p className="mt-2 text-3xl font-semibold">{done.length}</p></div>
            <div className="card"><p className="text-sm text-muted">Attendance</p><p className="mt-2 text-3xl font-semibold">{attendance.length ? `${Math.round((present / attendance.length) * 100)}%` : '–'}</p><p className="mt-1 text-xs text-muted">{present} of {attendance.length} recorded</p></div>
            <div className="card"><p className="text-sm text-muted">Average homework score</p><p className="mt-2 text-3xl font-semibold">{overall != null ? `${overall}%` : '–'}</p><p className="mt-1 text-xs text-muted">{marked.length} marked</p></div>
          </div>

          <section>
            <h3 className="mb-3 font-semibold">By subject</h3>
            <Table head={['Subject', 'Pieces marked', 'Average', 'Most recent']} empty="No marked homework in this period.">
              {bySubject.map((s) => (
                <tr key={s.subject}><Td className="font-medium">{s.subject}</Td><Td>{s.count}</Td><Td><Badge tone={tone(s.avg)}>{s.avg}%</Badge></Td><Td>{s.last}%</Td></tr>
              ))}
            </Table>
          </section>

          <section>
            <h3 className="mb-3 font-semibold">Homework results</h3>
            <Table head={['Date', 'Homework', 'Score', 'Feedback']} empty="No marked homework in this period.">
              {marked.map((m) => (
                <tr key={m.id}>
                  <Td className="whitespace-nowrap text-muted">{m.marked_at ? fmtDay(m.marked_at) : ''}</Td>
                  <Td>{m.homework?.title}</Td>
                  <Td className="whitespace-nowrap">{m.score != null ? `${m.score}${m.total ? ` / ${m.total}` : ''}` : ''}{percent(m) != null && <span className="text-muted"> ({percent(m)}%)</span>}</Td>
                  <Td className="max-w-md text-muted">{m.comment}</Td>
                </tr>
              ))}
            </Table>
          </section>

          {topics.length > 0 && (
            <section>
              <h3 className="mb-3 font-semibold">Topics covered</h3>
              <div className="flex flex-wrap gap-2">{topics.map((t) => <Badge key={t} tone="blue">{t}</Badge>)}</div>
            </section>
          )}
        </div>
      )}
    </>
  )
}
