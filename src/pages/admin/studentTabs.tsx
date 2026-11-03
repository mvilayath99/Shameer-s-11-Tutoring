import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { STATUS_LABEL, STATUS_TONE, fmtDay, fmtTime, type Lesson } from '../../lib/lessons'
import type { Student } from '../../lib/families'
import { Badge, Table, Td } from '../../components/ui'
import { STUDENT_TABS } from './StudentProfile'
import { SUB_LABEL, SUB_TONE, percent, type SubStatus } from '../../lib/homework'

function StudentLessons({ s }: { s: Student }) {
  const [rows, setRows] = useState<Lesson[]>([])
  useEffect(() => {
    (async () => {
      const { data: gm } = await supabase.from('group_members').select('group_id').eq('student_id', s.id)
      const groups = (gm ?? []).map((g) => g.group_id)
      const filter = groups.length ? `student_id.eq.${s.id},group_id.in.(${groups.join(',')})` : `student_id.eq.${s.id}`
      const { data } = await supabase.from('lessons').select('*').or(filter).order('starts_at', { ascending: false }).limit(100)
      setRows((data ?? []) as Lesson[])
    })()
  }, [s.id])
  return (
    <Table head={['Date', 'Time', 'Type', 'Status', 'Feedback']} empty="No lessons yet.">
      {rows.map((l) => (
        <tr key={l.id}>
          <Td className="whitespace-nowrap">{fmtDay(l.starts_at)}</Td>
          <Td className="text-muted">{fmtTime(l.starts_at)}</Td>
          <Td>{l.kind === 'group' ? 'Group' : '1:1'}</Td>
          <Td><Badge tone={STATUS_TONE[l.status]}>{STATUS_LABEL[l.status]}</Badge></Td>
          <Td className="max-w-sm text-muted">{l.parent_feedback}</Td>
        </tr>
      ))}
    </Table>
  )
}

STUDENT_TABS.lessons = (s) => <StudentLessons s={s} />

function StudentHomework({ s }: { s: Student }) {
  const [rows, setRows] = useState<{ id: string; status: SubStatus; score: number | null; total: number | null; homework: { title: string; due_at: string | null } | null }[]>([])
  useEffect(() => {
    supabase.from('homework_submissions').select('id, status, score, total, homework(title, due_at)').eq('student_id', s.id)
      .then(({ data }) => setRows((data ?? []) as unknown as typeof rows))
  }, [s.id])
  return (
    <Table head={['Homework', 'Due', 'Status', 'Score']} empty="No homework yet.">
      {rows.map((r) => (
        <tr key={r.id}>
          <Td className="font-medium">{r.homework?.title}</Td>
          <Td className="text-muted">{r.homework?.due_at ? fmtDay(r.homework.due_at) : '—'}</Td>
          <Td><Badge tone={SUB_TONE[r.status]}>{SUB_LABEL[r.status]}</Badge></Td>
          <Td>{r.status === 'marked' ? `${r.score}/${r.total}${percent(r) != null ? ` (${percent(r)}%)` : ''}` : ''}</Td>
        </tr>
      ))}
    </Table>
  )
}

STUDENT_TABS.homework = (s) => <StudentHomework s={s} />
