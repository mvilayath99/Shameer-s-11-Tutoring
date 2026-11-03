import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { STATUS_LABEL, STATUS_TONE, fmtDay, fmtTime, lessonTitle, useLookups, useStaff, type Lesson } from '../../lib/lessons'
import { formatDate } from '../../lib/format'
import { PageHeader } from '../../components/PortalLayout'
import { useModuleName } from '../../components/ModuleGate'
import { LessonEditor } from '../../components/LessonEditor'
import { LessonRecord } from '../../components/LessonRecord'
import { Badge, Notice, Table, Tabs, Td } from '../../components/ui'

interface Req { id: string; created_at: string; student_id: string; lesson_id: string | null; kind: 'reschedule' | 'cancel' | 'new_lesson'; preferred_time: string | null; message: string | null; status: string; staff_reply: string | null }
const KIND: Record<Req['kind'], string> = { reschedule: 'Reschedule', cancel: 'Cancel', new_lesson: 'New lesson' }

export default function Lessons() {
  const title = useModuleName('lessons', 'Lessons')
  const staff = useStaff()
  const { studentName, groupName, students, groups } = useLookups()
  const [tab, setTab] = useState<'record' | 'upcoming' | 'requests'>('record')
  const [lessons, setLessons] = useState<Lesson[]>([])
  const [requests, setRequests] = useState<Req[]>([])
  const [recording, setRecording] = useState<Lesson | null>(null)
  const [editing, setEditing] = useState<Lesson | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  const load = useCallback(async () => {
    const now = new Date().toISOString()
    const q = tab === 'upcoming'
      ? supabase.from('lessons').select('*').gte('starts_at', now).order('starts_at').limit(100)
      : supabase.from('lessons').select('*').lt('starts_at', now).eq('status', 'scheduled').order('starts_at', { ascending: false }).limit(100)
    const [{ data: l }, { data: r }] = await Promise.all([q, supabase.from('lesson_requests').select('*').order('created_at', { ascending: false }).limit(100)])
    setLessons((l ?? []) as Lesson[]); setRequests((r ?? []) as Req[])
  }, [tab])
  useEffect(() => { load() }, [load])

  const decide = async (r: Req, status: 'approved' | 'declined') => {
    const reply = prompt(status === 'approved' ? 'Message to the parent (optional)' : 'Reason (optional)') ?? ''
    await supabase.from('lesson_requests').update({ status, staff_reply: reply || null, decided_at: new Date().toISOString() }).eq('id', r.id)
    if (status === 'approved' && r.kind === 'cancel' && r.lesson_id) {
      await supabase.from('lessons').update({ status: 'cancelled_by_parent' }).eq('id', r.lesson_id)
      setMsg('Request approved and the lesson marked as cancelled by parent.')
    } else if (status === 'approved' && r.lesson_id) {
      const { data } = await supabase.from('lessons').select('*').eq('id', r.lesson_id).maybeSingle()
      if (data) setEditing(data as Lesson)
      setMsg('Request approved. Choose the new time for the lesson.')
    } else if (status === 'approved') setMsg('Request approved. Add the new lesson from the calendar.')
    load()
  }

  const pending = requests.filter((r) => r.status === 'pending').length
  const titleOf = (l: Lesson) => lessonTitle(l, studentName, groupName)

  return (
    <>
      <PageHeader title={title} />
      {msg && <div className="mb-4"><Notice kind="success">{msg}</Notice></div>}
      <Tabs tabs={[{ key: 'record', label: 'To record' }, { key: 'upcoming', label: 'Upcoming' }, { key: 'requests', label: `Requests${pending ? ` (${pending})` : ''}` }]} value={tab} onChange={setTab} />
      {tab !== 'requests' ? (
        <Table head={['Date', 'Time', 'Lesson', 'Tutor', 'Status']} empty={tab === 'record' ? 'All past lessons are recorded.' : 'No upcoming lessons.'}>
          {lessons.map((l) => (
            <tr key={l.id} className="cursor-pointer hover:bg-secondary" onClick={() => setRecording(l)}>
              <Td className="whitespace-nowrap">{fmtDay(l.starts_at)}</Td>
              <Td className="text-muted">{fmtTime(l.starts_at)}</Td>
              <Td className="font-medium">{titleOf(l)} <span className="text-xs font-normal text-muted">{l.kind === 'group' ? 'Group' : '1:1'} · {l.delivery === 'online' ? 'Online' : 'In person'}</span></Td>
              <Td className="text-muted">{staff.find((s) => s.id === l.tutor_id)?.full_name}</Td>
              <Td><Badge tone={STATUS_TONE[l.status]}>{STATUS_LABEL[l.status]}</Badge></Td>
            </tr>
          ))}
        </Table>
      ) : (
        <Table head={['Received', 'Student', 'Request', 'Details', 'Status', '']} empty="No requests.">
          {requests.map((r) => (
            <tr key={r.id}>
              <Td className="whitespace-nowrap text-muted">{formatDate(r.created_at)}</Td>
              <Td className="font-medium">{studentName[r.student_id]}</Td>
              <Td>{KIND[r.kind]}</Td>
              <Td className="max-w-xs text-muted">{[r.preferred_time, r.message].filter(Boolean).join(' · ')}</Td>
              <Td><Badge tone={r.status === 'pending' ? 'amber' : r.status === 'approved' ? 'green' : 'grey'}>{r.status}</Badge></Td>
              <Td className="whitespace-nowrap text-right">
                {r.status === 'pending' && <><button className="mr-3 text-sm text-primary hover:underline" onClick={() => decide(r, 'approved')}>Approve</button><button className="text-sm text-muted hover:underline" onClick={() => decide(r, 'declined')}>Decline</button></>}
              </Td>
            </tr>
          ))}
        </Table>
      )}
      {recording && <LessonRecord lesson={recording} title={titleOf(recording)} studentName={studentName} onClose={() => setRecording(null)} onSaved={load} onEdit={() => { setEditing(recording); setRecording(null) }} />}
      {editing && <LessonEditor lesson={editing} students={students} groups={groups} staff={staff} onClose={() => setEditing(null)} onSaved={load} />}
    </>
  )
}
