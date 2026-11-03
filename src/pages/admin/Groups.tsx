import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Plus, X } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { DELIVERY_LABEL, SUBJECTS, WEEKDAYS, useLookups, useStaff, type Delivery, type Group } from '../../lib/lessons'
import { SCHOOL_YEARS } from '../../lib/families'
import { PageHeader } from '../../components/PortalLayout'
import { useModuleName } from '../../components/ModuleGate'
import { Modal } from '../../components/Modal'
import { LessonEditor } from '../../components/LessonEditor'
import { Badge, Field, Notice } from '../../components/ui'

const EMPTY: Omit<Group, 'id'> = { name: '', subject_focus: '', school_year: '', max_size: 6, default_weekday: 1, default_time: '17:00', duration_minutes: 60, delivery: 'online', location: '', tutor_id: null, active: true }

export default function Groups() {
  const title = useModuleName('groups', 'Groups')
  const staff = useStaff()
  const { students, groups: allGroups, studentName } = useLookups()
  const [groups, setGroups] = useState<Group[]>([])
  const [members, setMembers] = useState<{ group_id: string; student_id: string }[]>([])
  const [editing, setEditing] = useState<Partial<Group> | null>(null)
  const [scheduling, setScheduling] = useState<Group | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const [{ data: g }, { data: m }] = await Promise.all([supabase.from('groups').select('*').order('name'), supabase.from('group_members').select('group_id, student_id')])
    setGroups((g ?? []) as Group[]); setMembers(m ?? [])
  }, [])
  useEffect(() => { load() }, [load])

  const save = async (e: FormEvent) => {
    e.preventDefault(); if (!editing) return
    setError(null)
    const { id, ...rest } = editing as Group
    const payload = { ...EMPTY, ...rest, tutor_id: rest.tutor_id || null, default_time: rest.default_time || null }
    const { error } = id ? await supabase.from('groups').update(payload).eq('id', id) : await supabase.from('groups').insert(payload)
    if (error) setError(error.message); else { setEditing(null); load() }
  }
  const addMember = async (g: Group, sid: string) => {
    if (!sid) return
    if (members.filter((m) => m.group_id === g.id).length >= g.max_size) { setError(`${g.name} is full (${g.max_size}).`); return }
    await supabase.from('group_members').insert({ group_id: g.id, student_id: sid }); load()
  }
  const removeMember = async (g: Group, sid: string) => { await supabase.from('group_members').delete().eq('group_id', g.id).eq('student_id', sid); load() }
  const tutorName = (id: string | null) => staff.find((s) => s.id === id)?.full_name

  return (
    <>
      <PageHeader title={title} action={<button className="btn-primary" onClick={() => setEditing({ ...EMPTY, tutor_id: staff[0]?.id ?? null })}><Plus className="h-4 w-4" /> New group</button>} />
      {error && <div className="mb-4"><Notice kind="error">{error}</Notice></div>}
      {!groups.length && <div className="card text-sm text-muted">No groups yet.</div>}
      <div className="grid gap-6 lg:grid-cols-2">
        {groups.map((g) => {
          const ids = members.filter((m) => m.group_id === g.id).map((m) => m.student_id)
          return (
            <div key={g.id} className="card flex flex-col gap-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="font-semibold">{g.name} {!g.active && <Badge>Inactive</Badge>}</h2>
                  <p className="text-sm text-muted">
                    {[g.subject_focus, g.school_year, g.default_weekday != null && g.default_time ? `${WEEKDAYS[g.default_weekday]}s ${g.default_time.slice(0, 5)}` : null, DELIVERY_LABEL[g.delivery], tutorName(g.tutor_id)].filter(Boolean).join(' · ')}
                  </p>
                </div>
                <Badge tone={ids.length >= g.max_size ? 'amber' : 'blue'}>{ids.length}/{g.max_size}</Badge>
              </div>
              <ul className="flex flex-wrap gap-2">
                {ids.map((sid) => (
                  <li key={sid} className="flex items-center gap-1 rounded-full bg-secondary px-3 py-1 text-sm">{studentName[sid]}<button onClick={() => removeMember(g, sid)} aria-label="Remove"><X className="h-3 w-3" /></button></li>
                ))}
              </ul>
              <select className="input" value="" onChange={(e) => addMember(g, e.target.value)}>
                <option value="">Add a student…</option>
                {students.filter((s) => !ids.includes(s.id)).map((s) => <option key={s.id} value={s.id}>{studentName[s.id]}</option>)}
              </select>
              <div className="flex gap-3 text-sm">
                <button className="text-primary hover:underline" onClick={() => setEditing(g)}>Edit group</button>
                <button className="text-primary hover:underline" onClick={() => setScheduling(g)}>Schedule lessons</button>
              </div>
            </div>
          )
        })}
      </div>

      {editing && (
        <Modal title={editing.id ? 'Edit group' : 'New group'} onClose={() => setEditing(null)}>
          <form onSubmit={save} className="flex flex-col gap-4">
            <Field label="Group name"><input className="input" required value={editing.name ?? ''} onChange={(e) => setEditing({ ...editing, name: e.target.value })} placeholder="For example Year 5 GL Saturday" /></Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Subject focus"><select className="input" value={editing.subject_focus ?? ''} onChange={(e) => setEditing({ ...editing, subject_focus: e.target.value })}><option value="">Mixed</option>{SUBJECTS.map((s) => <option key={s}>{s}</option>)}</select></Field>
              <Field label="School year"><select className="input" value={editing.school_year ?? ''} onChange={(e) => setEditing({ ...editing, school_year: e.target.value })}><option value="">Any</option>{SCHOOL_YEARS.map((s) => <option key={s}>{s}</option>)}</select></Field>
              <Field label="Usual day"><select className="input" value={editing.default_weekday ?? ''} onChange={(e) => setEditing({ ...editing, default_weekday: e.target.value === '' ? null : Number(e.target.value) })}><option value="">Varies</option>{WEEKDAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}</select></Field>
              <Field label="Usual time"><input type="time" className="input" value={editing.default_time?.slice(0, 5) ?? ''} onChange={(e) => setEditing({ ...editing, default_time: e.target.value })} /></Field>
              <Field label="Minutes"><input type="number" className="input" value={editing.duration_minutes ?? 60} onChange={(e) => setEditing({ ...editing, duration_minutes: Number(e.target.value) })} /></Field>
              <Field label="Maximum size"><input type="number" min={1} className="input" value={editing.max_size ?? 6} onChange={(e) => setEditing({ ...editing, max_size: Number(e.target.value) })} /></Field>
              <Field label="Delivery"><select className="input" value={editing.delivery} onChange={(e) => setEditing({ ...editing, delivery: e.target.value as Delivery })}><option value="online">Online</option><option value="in_person">In person</option></select></Field>
              <Field label="Tutor"><select className="input" value={editing.tutor_id ?? ''} onChange={(e) => setEditing({ ...editing, tutor_id: e.target.value })}><option value="">Unassigned</option>{staff.map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}</select></Field>
            </div>
            {editing.delivery === 'in_person' && <Field label="Location"><input className="input" value={editing.location ?? ''} onChange={(e) => setEditing({ ...editing, location: e.target.value })} /></Field>}
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={editing.active ?? true} onChange={(e) => setEditing({ ...editing, active: e.target.checked })} /> Active</label>
            <button className="btn-primary self-start">Save group</button>
          </form>
        </Modal>
      )}
      {scheduling && (() => {
        const next = new Date(); next.setHours(17, 0, 0, 0)
        if (scheduling.default_weekday != null) next.setDate(next.getDate() + ((scheduling.default_weekday - next.getDay() + 7) % 7 || 7))
        if (scheduling.default_time) { const [h, m] = scheduling.default_time.split(':').map(Number); next.setHours(h, m) }
        return <LessonEditor defaults={{ groupId: scheduling.id, date: next }} students={students} groups={allGroups.length ? allGroups : groups} staff={staff} onClose={() => setScheduling(null)} onSaved={load} />
      })()}
    </>
  )
}
