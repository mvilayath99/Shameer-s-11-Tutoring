import { useCallback, useEffect, useMemo, useState, type DragEvent } from 'react'
import { ChevronLeft, ChevronRight, Plus, Trash2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import {
  STATUS_LABEL, TUTOR_COLOURS, WEEKDAYS, addDays, fmtTime, lessonTitle, sameDay, startOfWeek, useLookups, useStaff, type Lesson,
} from '../../lib/lessons'
import { PageHeader } from '../../components/PortalLayout'
import { useModuleName } from '../../components/ModuleGate'
import { LessonEditor } from '../../components/LessonEditor'
import { LessonRecord } from '../../components/LessonRecord'
import { Field, Notice, Tabs } from '../../components/ui'

type View = 'day' | 'week' | 'month'
const START_HOUR = 7, END_HOUR = 21, HOUR_PX = 56

export default function Calendar() {
  const title = useModuleName('calendar', 'Calendar')
  const [tab, setTab] = useState<'calendar' | 'availability'>('calendar')
  return (
    <>
      <PageHeader title={title} />
      <Tabs tabs={[{ key: 'calendar', label: 'Calendar' }, { key: 'availability', label: 'Availability' }]} value={tab} onChange={setTab} />
      {tab === 'calendar' ? <CalendarView /> : <Availability />}
    </>
  )
}

function CalendarView() {
  const staff = useStaff()
  const { studentName, groupName, students, groups } = useLookups()
  const [view, setView] = useState<View>(() => (window.innerWidth < 768 ? 'day' : 'week'))
  const [cursor, setCursor] = useState(new Date())
  const [lessons, setLessons] = useState<Lesson[]>([])
  const [tutor, setTutor] = useState('')
  const [group, setGroup] = useState('')
  const [editing, setEditing] = useState<Lesson | null | 'new'>(null)
  const [newDate, setNewDate] = useState<Date | undefined>()
  const [recording, setRecording] = useState<Lesson | null>(null)

  const range = useMemo(() => {
    if (view === 'day') { const s = new Date(cursor); s.setHours(0, 0, 0, 0); return [s, addDays(s, 1)] }
    if (view === 'week') { const s = startOfWeek(cursor); return [s, addDays(s, 7)] }
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1)
    const s = startOfWeek(first); return [s, addDays(s, 42)]
  }, [view, cursor])

  const load = useCallback(async () => {
    let q = supabase.from('lessons').select('*').gte('starts_at', range[0].toISOString()).lt('starts_at', range[1].toISOString()).order('starts_at')
    if (tutor) q = q.eq('tutor_id', tutor)
    if (group) q = q.eq('group_id', group)
    const { data } = await q
    setLessons((data ?? []) as Lesson[])
  }, [range, tutor, group])
  useEffect(() => { load() }, [load])

  const colour = (l: Lesson) => TUTOR_COLOURS[Math.max(0, staff.findIndex((s) => s.id === l.tutor_id)) % TUTOR_COLOURS.length]
  const titleOf = (l: Lesson) => lessonTitle(l, studentName, groupName)
  const step = (n: number) => setCursor(view === 'month' ? new Date(cursor.getFullYear(), cursor.getMonth() + n, 1) : addDays(cursor, n * (view === 'week' ? 7 : 1)))
  const days = view === 'day' ? [range[0]] : Array.from({ length: 7 }, (_, i) => addDays(range[0], i))

  const drop = async (e: DragEvent<HTMLDivElement>, day: Date) => {
    e.preventDefault()
    const id = e.dataTransfer.getData('text/plain')
    const l = lessons.find((x) => x.id === id)
    if (!l) return
    const rect = e.currentTarget.getBoundingClientRect()
    const mins = Math.round(((e.clientY - rect.top) / HOUR_PX) * 60 / 15) * 15 + START_HOUR * 60
    const start = new Date(day); start.setHours(0, mins, 0, 0)
    const dur = new Date(l.ends_at).getTime() - new Date(l.starts_at).getTime()
    await supabase.from('lessons').update({ starts_at: start.toISOString(), ends_at: new Date(start.getTime() + dur).toISOString() }).eq('id', l.id)
    load()
  }

  const heading = view === 'month'
    ? cursor.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
    : view === 'week' ? `Week of ${range[0].toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}`
    : cursor.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1">
          <button className="btn-outline px-2.5" onClick={() => step(-1)} aria-label="Previous"><ChevronLeft className="h-4 w-4" /></button>
          <button className="btn-outline" onClick={() => setCursor(new Date())}>Today</button>
          <button className="btn-outline px-2.5" onClick={() => step(1)} aria-label="Next"><ChevronRight className="h-4 w-4" /></button>
        </div>
        <h2 className="font-semibold">{heading}</h2>
        <div className="ml-auto flex flex-wrap gap-2">
          <select className="input w-auto" value={tutor} onChange={(e) => setTutor(e.target.value)}><option value="">All tutors</option>{staff.map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}</select>
          <select className="input w-auto" value={group} onChange={(e) => setGroup(e.target.value)}><option value="">All lessons</option>{groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</select>
          <div className="flex rounded-lg border border-line bg-white p-0.5">
            {(['day', 'week', 'month'] as const).map((v) => <button key={v} onClick={() => setView(v)} className={`rounded-md px-3 py-1.5 text-sm capitalize ${view === v ? 'bg-primary text-white' : 'text-muted'}`}>{v}</button>)}
          </div>
          <button className="btn-primary" onClick={() => { setNewDate(undefined); setEditing('new') }}><Plus className="h-4 w-4" /> Lesson</button>
        </div>
      </div>

      {staff.length > 1 && (
        <div className="mb-3 flex flex-wrap gap-4 text-xs text-muted">
          {staff.map((s, i) => <span key={s.id} className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: TUTOR_COLOURS[i % TUTOR_COLOURS.length] }} />{s.full_name}</span>)}
        </div>
      )}

      {view === 'month' ? (
        <div className="grid grid-cols-7 overflow-hidden rounded-xl border border-line bg-white text-xs">
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => <div key={d} className="border-b border-line bg-secondary px-2 py-2 font-medium text-muted">{d}</div>)}
          {Array.from({ length: 42 }, (_, i) => addDays(range[0], i)).map((d) => (
            <div key={d.toISOString()} className={`min-h-24 border-b border-r border-line p-1.5 ${d.getMonth() !== cursor.getMonth() ? 'bg-secondary/50 text-muted' : ''}`}
              onDoubleClick={() => { const x = new Date(d); x.setHours(17); setNewDate(x); setEditing('new') }}>
              <div className={`mb-1 ${sameDay(d, new Date()) ? 'font-bold text-primary' : ''}`}>{d.getDate()}</div>
              {lessons.filter((l) => sameDay(new Date(l.starts_at), d)).map((l) => (
                <button key={l.id} onClick={() => setRecording(l)} className="mb-0.5 block w-full truncate rounded px-1 py-0.5 text-left text-white" style={{ background: colour(l), opacity: l.status.startsWith('cancelled') ? 0.45 : 1 }}>
                  {fmtTime(l.starts_at)} {titleOf(l)}
                </button>
              ))}
            </div>
          ))}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-line bg-white">
          <div className="grid min-w-[44rem]" style={{ gridTemplateColumns: `3.5rem repeat(${days.length}, 1fr)` }}>
            <div className="border-b border-line" />
            {days.map((d) => <div key={d.toISOString()} className={`border-b border-l border-line px-2 py-2 text-center text-sm ${sameDay(d, new Date()) ? 'font-semibold text-primary' : 'text-muted'}`}>{d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric' })}</div>)}
            <div className="relative" style={{ height: (END_HOUR - START_HOUR) * HOUR_PX }}>
              {Array.from({ length: END_HOUR - START_HOUR }, (_, i) => <div key={i} className="absolute right-2 text-xs text-muted" style={{ top: i * HOUR_PX - 6 }}>{String(START_HOUR + i).padStart(2, '0')}:00</div>)}
            </div>
            {days.map((d) => (
              <div key={d.toISOString()} className="relative border-l border-line" style={{ height: (END_HOUR - START_HOUR) * HOUR_PX }}
                onDragOver={(e) => e.preventDefault()} onDrop={(e) => drop(e, d)}
                onDoubleClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); const x = new Date(d); x.setHours(START_HOUR, Math.floor(((e.clientY - r.top) / HOUR_PX) * 2) * 30); setNewDate(x); setEditing('new') }}>
                {Array.from({ length: END_HOUR - START_HOUR }, (_, i) => <div key={i} className="absolute inset-x-0 border-t border-line/70" style={{ top: i * HOUR_PX }} />)}
                {lessons.filter((l) => sameDay(new Date(l.starts_at), d)).map((l) => {
                  const s = new Date(l.starts_at), e = new Date(l.ends_at)
                  const top = ((s.getHours() - START_HOUR) * 60 + s.getMinutes()) / 60 * HOUR_PX
                  const h = Math.max(24, (e.getTime() - s.getTime()) / 3600000 * HOUR_PX - 2)
                  return (
                    <button key={l.id} draggable onDragStart={(ev) => ev.dataTransfer.setData('text/plain', l.id)} onClick={() => setRecording(l)}
                      className="absolute inset-x-1 overflow-hidden rounded-md px-2 py-1 text-left text-xs text-white shadow-sm"
                      style={{ top, height: h, background: colour(l), opacity: l.status.startsWith('cancelled') ? 0.45 : 1 }}
                      title={STATUS_LABEL[l.status]}>
                      <div className="font-medium">{titleOf(l)}</div>
                      <div className="opacity-90">{fmtTime(l.starts_at)} · {l.delivery === 'online' ? 'Online' : 'In person'}</div>
                    </button>
                  )
                })}
              </div>
            ))}
          </div>
        </div>
      )}
      <p className="mt-3 text-xs text-muted">Double-click an empty slot to add a lesson. Drag a lesson to move it.</p>

      {editing && <LessonEditor lesson={editing === 'new' ? null : editing} defaults={{ date: newDate }} students={students} groups={groups} staff={staff} onClose={() => setEditing(null)} onSaved={load} />}
      {recording && <LessonRecord lesson={recording} title={titleOf(recording)} studentName={studentName} onClose={() => setRecording(null)} onSaved={load} onEdit={() => { setEditing(recording); setRecording(null) }} />}
    </>
  )
}

interface Slot { id: string; tutor_id: string; weekday: number; start_time: string; end_time: string; delivery: string | null }

function Availability() {
  const staff = useStaff()
  const [slots, setSlots] = useState<Slot[]>([])
  const [form, setForm] = useState({ tutor_id: '', weekday: 1, start_time: '16:00', end_time: '19:00', delivery: '' })
  const [error, setError] = useState<string | null>(null)
  const load = useCallback(async () => { const { data } = await supabase.from('availability').select('*').order('weekday').order('start_time'); setSlots((data ?? []) as Slot[]) }, [])
  useEffect(() => { load() }, [load])
  useEffect(() => { if (!form.tutor_id && staff[0]) setForm((f) => ({ ...f, tutor_id: staff[0].id })) }, [staff, form.tutor_id])

  const add = async () => {
    setError(null)
    const { error } = await supabase.from('availability').insert({ ...form, delivery: form.delivery || null })
    if (error) setError(error.message); else load()
  }
  const name = (id: string) => staff.find((s) => s.id === id)?.full_name ?? 'Tutor'

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
      <div className="card">
        <p className="mb-4 text-sm text-muted">Times when parents can request new lessons.</p>
        {!slots.length && <p className="text-sm text-muted">No availability added yet.</p>}
        <ul className="divide-y divide-line">
          {slots.map((s) => (
            <li key={s.id} className="flex items-center gap-3 py-2.5 text-sm">
              <span className="w-28 font-medium">{WEEKDAYS[s.weekday]}</span>
              <span>{s.start_time.slice(0, 5)}–{s.end_time.slice(0, 5)}</span>
              <span className="text-muted">{name(s.tutor_id)}{s.delivery ? ` · ${s.delivery === 'online' ? 'Online' : 'In person'}` : ''}</span>
              <button className="ml-auto text-muted hover:text-red-600" onClick={async () => { await supabase.from('availability').delete().eq('id', s.id); load() }} aria-label="Remove"><Trash2 className="h-4 w-4" /></button>
            </li>
          ))}
        </ul>
      </div>
      <div className="card flex flex-col gap-3">
        <h3 className="font-semibold">Add availability</h3>
        {error && <Notice kind="error">{error}</Notice>}
        <Field label="Tutor"><select className="input" value={form.tutor_id} onChange={(e) => setForm({ ...form, tutor_id: e.target.value })}>{staff.map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}</select></Field>
        <Field label="Day"><select className="input" value={form.weekday} onChange={(e) => setForm({ ...form, weekday: Number(e.target.value) })}>{WEEKDAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}</select></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="From"><input type="time" className="input" value={form.start_time} onChange={(e) => setForm({ ...form, start_time: e.target.value })} /></Field>
          <Field label="To"><input type="time" className="input" value={form.end_time} onChange={(e) => setForm({ ...form, end_time: e.target.value })} /></Field>
        </div>
        <Field label="Delivery"><select className="input" value={form.delivery} onChange={(e) => setForm({ ...form, delivery: e.target.value })}><option value="">Online or in person</option><option value="online">Online only</option><option value="in_person">In person only</option></select></Field>
        <button className="btn-primary" onClick={add}>Add</button>
      </div>
    </div>
  )
}
