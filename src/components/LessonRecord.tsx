import { useEffect, useState } from 'react'
import { ExternalLink } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { notify } from '../lib/notify'
import { DELIVERY_LABEL, STATUS_LABEL, SUBJECTS, fmtLong, fmtTime, type Lesson, type LessonStatus } from '../lib/lessons'
import { Field, Notice } from './ui'
import { Modal } from './Modal'

type Att = 'present' | 'late' | 'absent'

export function LessonRecord({ lesson, title, studentName, onClose, onSaved, onEdit }: {
  lesson: Lesson; title: string; studentName: Record<string, string>; onClose: () => void; onSaved: () => void; onEdit: () => void
}) {
  const [status, setStatus] = useState<LessonStatus>(lesson.status)
  const [billable, setBillable] = useState(lesson.billable)
  const [topics, setTopics] = useState<string[]>(lesson.topics)
  const [topicText, setTopicText] = useState('')
  const [feedback, setFeedback] = useState(lesson.parent_feedback ?? '')
  const [notes, setNotes] = useState('')
  const [att, setAtt] = useState<Record<string, Att>>({})
  const [ids, setIds] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    (async () => {
      let studentIds: string[] = lesson.student_id ? [lesson.student_id] : []
      if (lesson.group_id) {
        const { data } = await supabase.from('group_members').select('student_id').eq('group_id', lesson.group_id)
        studentIds = (data ?? []).map((x) => x.student_id)
      }
      setIds(studentIds)
      const [{ data: a }, { data: p }] = await Promise.all([
        supabase.from('lesson_attendance').select('student_id, attendance').eq('lesson_id', lesson.id),
        supabase.from('lesson_private').select('tutor_notes').eq('lesson_id', lesson.id).maybeSingle(),
      ])
      const existing = Object.fromEntries((a ?? []).map((x) => [x.student_id, x.attendance as Att]))
      setAtt(Object.fromEntries(studentIds.map((id) => [id, existing[id] ?? 'present'])))
      setNotes(p?.tutor_notes ?? '')
    })()
  }, [lesson])

  const save = async () => {
    setError(null)
    const allTopics = [...topics, ...topicText.split(',').map((t) => t.trim()).filter(Boolean)]
    const patch: Partial<Lesson> = { status, topics: allTopics, parent_feedback: feedback || null }
    if (billable !== lesson.billable) patch.billable = billable
    const { error } = await supabase.from('lessons').update(patch).eq('id', lesson.id)
    if (error) { setError(error.message); return }
    if (status !== lesson.status && (status === 'cancelled_by_tutor' || status === 'cancelled_by_parent')) notify('lesson_cancelled', lesson.id)
    if (status === 'completed' || status === 'no_show') {
      await supabase.from('lesson_attendance').upsert(ids.map((sid) => ({ lesson_id: lesson.id, student_id: sid, attendance: att[sid] ?? 'present' })))
    }
    await supabase.from('lesson_private').upsert({ lesson_id: lesson.id, tutor_notes: notes || null })
    onSaved(); onClose()
  }

  const toggleTopic = (t: string) => setTopics(topics.includes(t) ? topics.filter((x) => x !== t) : [...topics, t])

  return (
    <Modal title={title} onClose={onClose} wide>
      <div className="mb-5 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted">
        <span>{fmtLong(lesson.starts_at)}, {fmtTime(lesson.starts_at)}–{fmtTime(lesson.ends_at)}</span>
        <span>{DELIVERY_LABEL[lesson.delivery]}{lesson.location ? ` · ${lesson.location}` : ''}</span>
        {lesson.meeting_url && <a href={lesson.meeting_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary">Join meeting <ExternalLink className="h-3 w-3" /></a>}
        <button onClick={onEdit} className="ml-auto text-primary hover:underline">Edit time or details</button>
      </div>
      <div className="flex flex-col gap-5">
        {error && <Notice kind="error">{error}</Notice>}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Status">
            <select className="input" value={status} onChange={(e) => setStatus(e.target.value as LessonStatus)}>
              {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </Field>
          <label className="flex items-end gap-2 pb-2.5 text-sm"><input type="checkbox" className="h-4 w-4" checked={billable} onChange={(e) => setBillable(e.target.checked)} /> Billable (charge for this lesson)</label>
        </div>
        {ids.length > 0 && (
          <fieldset>
            <legend className="label">Attendance</legend>
            <div className="divide-y divide-line rounded-lg border border-line">
              {ids.map((id) => (
                <div key={id} className="flex items-center justify-between px-3 py-2 text-sm">
                  <span>{studentName[id] ?? 'Student'}</span>
                  <div className="flex gap-1">
                    {(['present', 'late', 'absent'] as const).map((a) => (
                      <button key={a} type="button" onClick={() => setAtt({ ...att, [id]: a })}
                        className={`rounded-md px-2.5 py-1 text-xs capitalize ${att[id] === a ? 'bg-primary text-white' : 'bg-secondary text-muted'}`}>{a}</button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </fieldset>
        )}
        <fieldset>
          <legend className="label">Topics covered</legend>
          <div className="mb-2 flex flex-wrap gap-2">
            {[...new Set([...SUBJECTS, ...topics])].map((t) => (
              <button key={t} type="button" onClick={() => toggleTopic(t)} className={`rounded-full border px-3 py-1 text-sm ${topics.includes(t) ? 'border-primary bg-primary-soft text-primary' : 'border-line text-muted'}`}>{t}</button>
            ))}
          </div>
          <input className="input" placeholder="Other topics, separated by commas (for example fractions, comprehension)" value={topicText} onChange={(e) => setTopicText(e.target.value)} />
        </fieldset>
        <Field label="Feedback for parents" hint="Parents see this on their lessons page"><textarea rows={4} className="input" value={feedback} onChange={(e) => setFeedback(e.target.value)} /></Field>
        <Field label="Tutor notes" hint="Private to staff"><textarea rows={3} className="input" value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
        <div className="flex gap-3"><button className="btn-primary" onClick={save}>Save lesson record</button><button className="btn-outline" onClick={onClose}>Cancel</button></div>
      </div>
    </Modal>
  )
}
