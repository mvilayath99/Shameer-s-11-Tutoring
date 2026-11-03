import { useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { notify } from '../lib/notify'
import { DELIVERY_LABEL, toDateInput, toTimeInput, type Delivery, type Group, type Lesson, type LessonKind, type StaffMember } from '../lib/lessons'
import { Field, Notice } from './ui'
import { Modal } from './Modal'

interface Props {
  lesson?: Lesson | null
  defaults?: { date?: Date; groupId?: string; studentId?: string }
  students: { id: string; first_name: string; last_name: string | null }[]
  groups: Group[]
  staff: StaffMember[]
  onClose: () => void
  onSaved: () => void
}

export function LessonEditor({ lesson, defaults, students, groups, staff, onClose, onSaved }: Props) {
  const start = lesson ? new Date(lesson.starts_at) : defaults?.date ?? new Date(new Date().setHours(17, 0, 0, 0))
  const g0 = !lesson && defaults?.groupId ? groups.find((x) => x.id === defaults.groupId) : undefined
  const end = lesson ? new Date(lesson.ends_at) : null
  const [kind, setKind] = useState<LessonKind>(lesson?.kind ?? (defaults?.groupId ? 'group' : 'one_to_one'))
  const [studentId, setStudentId] = useState(lesson?.student_id ?? defaults?.studentId ?? '')
  const [groupId, setGroupId] = useState(lesson?.group_id ?? defaults?.groupId ?? '')
  const [tutorId, setTutorId] = useState(lesson?.tutor_id ?? g0?.tutor_id ?? staff[0]?.id ?? '')
  const [date, setDate] = useState(toDateInput(start))
  const [time, setTime] = useState(toTimeInput(start))
  const [minutes, setMinutes] = useState(end ? Math.round((end.getTime() - start.getTime()) / 60000) : g0?.duration_minutes ?? 60)
  const [delivery, setDelivery] = useState<Delivery>(lesson?.delivery ?? g0?.delivery ?? 'online')
  const [location, setLocation] = useState(lesson?.location ?? g0?.location ?? '')
  const [meetingUrl, setMeetingUrl] = useState(lesson?.meeting_url ?? '')
  const [repeat, setRepeat] = useState<'none' | '1' | '2'>('none')
  const [until, setUntil] = useState(toDateInput(new Date(start.getTime() + 1000 * 60 * 60 * 24 * 7 * 12)))
  const [scope, setScope] = useState<'this' | 'future'>('this')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const pickGroup = (id: string) => {
    setGroupId(id)
    const g = groups.find((x) => x.id === id)
    if (g && !lesson) { setDelivery(g.delivery); setLocation(g.location ?? ''); setMinutes(g.duration_minutes); if (g.tutor_id) setTutorId(g.tutor_id); if (g.default_time) setTime(g.default_time.slice(0, 5)) }
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true); setError(null)
    const startsAt = new Date(`${date}T${time}`)
    const endsAt = new Date(startsAt.getTime() + minutes * 60000)
    const base = {
      kind, student_id: kind === 'one_to_one' ? studentId : null, group_id: kind === 'group' ? groupId : null,
      tutor_id: tutorId || null, delivery, location: delivery === 'in_person' ? location || null : null,
      meeting_url: delivery === 'online' ? meetingUrl || null : null,
    }
    let err: string | null = null
    if (lesson) {
      if (scope === 'future' && lesson.series_id) {
        // Shift every later lesson in the series by the same amount and apply the other changes.
        const shift = startsAt.getTime() - new Date(lesson.starts_at).getTime()
        const { data: later } = await supabase.from('lessons').select('id, starts_at').eq('series_id', lesson.series_id).gte('starts_at', lesson.starts_at).eq('status', 'scheduled')
        for (const l of later ?? []) {
          const s = new Date(new Date(l.starts_at).getTime() + shift)
          const { error } = await supabase.from('lessons').update({ ...base, starts_at: s.toISOString(), ends_at: new Date(s.getTime() + minutes * 60000).toISOString() }).eq('id', l.id)
          if (error) { err = error.message; break }
        }
        if (!err && shift !== 0) notify('lesson_changed', lesson.id)
      } else {
        const { error } = await supabase.from('lessons').update({ ...base, starts_at: startsAt.toISOString(), ends_at: endsAt.toISOString() }).eq('id', lesson.id)
        err = error?.message ?? null
        if (!err && startsAt.getTime() !== new Date(lesson.starts_at).getTime()) notify('lesson_changed', lesson.id)
      }
    } else if (repeat !== 'none') {
      const { data, error } = await supabase.rpc('create_lesson_series', {
        _kind: kind, _student_id: base.student_id, _group_id: base.group_id, _tutor_id: base.tutor_id, _delivery: delivery,
        _location: base.location, _first_date: date, _until: until, _start_time: time, _duration_minutes: minutes,
        _interval_weeks: Number(repeat), _meeting_url: base.meeting_url,
      })
      err = error?.message ?? null
      if (!err) {
        const { data: first } = await supabase.from('lessons').select('id').eq('series_id', data).order('starts_at').limit(1).maybeSingle()
        if (first) notify('lesson_booked', first.id)
      }
    } else {
      const { data, error } = await supabase.from('lessons').insert({ ...base, starts_at: startsAt.toISOString(), ends_at: endsAt.toISOString() }).select('id').single()
      err = error?.message ?? null
      if (data) notify('lesson_booked', data.id)
    }
    setBusy(false)
    if (err) setError(err); else { onSaved(); onClose() }
  }

  const remove = async () => {
    if (!lesson || !confirm('Delete this lesson? To keep a record, mark it cancelled instead.')) return
    await supabase.from('lessons').delete().eq('id', lesson.id); onSaved(); onClose()
  }

  return (
    <Modal title={lesson ? 'Edit lesson' : 'New lesson'} onClose={onClose}>
      <form onSubmit={submit} className="flex flex-col gap-4">
        {error && <Notice kind="error">{error}</Notice>}
        <div className="flex gap-2">
          {(['one_to_one', 'group'] as const).map((k) => (
            <button type="button" key={k} onClick={() => setKind(k)} className={`rounded-lg border px-4 py-2 text-sm ${kind === k ? 'border-primary bg-primary-soft text-primary' : 'border-line'}`}>{k === 'group' ? 'Group' : '1:1'}</button>
          ))}
        </div>
        {kind === 'one_to_one' ? (
          <Field label="Student"><select className="input" required value={studentId} onChange={(e) => setStudentId(e.target.value)}><option value="">Choose…</option>{students.map((s) => <option key={s.id} value={s.id}>{[s.first_name, s.last_name].filter(Boolean).join(' ')}</option>)}</select></Field>
        ) : (
          <Field label="Group"><select className="input" required value={groupId} onChange={(e) => pickGroup(e.target.value)}><option value="">Choose…</option>{groups.filter((g) => g.active).map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</select></Field>
        )}
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Date"><input type="date" className="input" required value={date} onChange={(e) => setDate(e.target.value)} /></Field>
          <Field label="Start"><input type="time" className="input" required value={time} onChange={(e) => setTime(e.target.value)} /></Field>
          <Field label="Minutes"><input type="number" min={15} step={15} className="input" value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} /></Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Tutor"><select className="input" value={tutorId} onChange={(e) => setTutorId(e.target.value)}><option value="">Unassigned</option>{staff.map((s) => <option key={s.id} value={s.id}>{s.full_name || 'Staff member'}</option>)}</select></Field>
          <Field label="Delivery"><select className="input" value={delivery} onChange={(e) => setDelivery(e.target.value as Delivery)}>{(['online', 'in_person'] as const).map((d) => <option key={d} value={d}>{DELIVERY_LABEL[d]}</option>)}</select></Field>
        </div>
        {delivery === 'in_person'
          ? <Field label="Location"><input className="input" value={location} onChange={(e) => setLocation(e.target.value)} /></Field>
          : <Field label="Meeting link" hint="Filled in automatically once Microsoft Teams is connected. You can paste a link for now."><input className="input" value={meetingUrl} onChange={(e) => setMeetingUrl(e.target.value)} placeholder="https://teams.microsoft.com/…" /></Field>}
        {!lesson && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Repeat"><select className="input" value={repeat} onChange={(e) => setRepeat(e.target.value as typeof repeat)}><option value="none">Does not repeat</option><option value="1">Every week</option><option value="2">Every 2 weeks</option></select></Field>
            {repeat !== 'none' && <Field label="Until"><input type="date" className="input" value={until} onChange={(e) => setUntil(e.target.value)} /></Field>}
          </div>
        )}
        {lesson?.series_id && (
          <Field label="Apply changes to">
            <select className="input" value={scope} onChange={(e) => setScope(e.target.value as typeof scope)}><option value="this">This lesson only</option><option value="future">This and all future lessons in the series</option></select>
          </Field>
        )}
        <div className="flex flex-wrap gap-3">
          <button className="btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save lesson'}</button>
          <button type="button" className="btn-outline" onClick={onClose}>Cancel</button>
          {lesson && <button type="button" onClick={remove} className="ml-auto text-sm text-red-600 hover:underline">Delete</button>}
        </div>
      </form>
    </Modal>
  )
}
