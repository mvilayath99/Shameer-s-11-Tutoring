import { useEffect, useState } from 'react'
import { supabase } from './supabase'

export type LessonKind = 'one_to_one' | 'group'
export type Delivery = 'online' | 'in_person'
export type LessonStatus = 'scheduled' | 'completed' | 'cancelled_by_parent' | 'cancelled_by_tutor' | 'no_show'

export interface Lesson {
  id: string; series_id: string | null; kind: LessonKind; student_id: string | null; group_id: string | null
  tutor_id: string | null; starts_at: string; ends_at: string; delivery: Delivery; location: string | null
  meeting_url: string | null; status: LessonStatus; billable: boolean; topics: string[]; parent_feedback: string | null
}
export interface Group {
  id: string; name: string; subject_focus: string | null; school_year: string | null; max_size: number
  default_weekday: number | null; default_time: string | null; duration_minutes: number; delivery: Delivery
  location: string | null; tutor_id: string | null; active: boolean
}
export interface StaffMember { id: string; full_name: string | null; role: string }

export const SUBJECTS = ['Maths', 'English', 'Verbal reasoning', 'Non-verbal reasoning']
export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
export const DELIVERY_LABEL: Record<Delivery, string> = { online: 'Online', in_person: 'In person' }
export const STATUS_LABEL: Record<LessonStatus, string> = {
  scheduled: 'Scheduled', completed: 'Completed', cancelled_by_parent: 'Cancelled by parent',
  cancelled_by_tutor: 'Cancelled by tutor', no_show: 'No show',
}
export const STATUS_TONE: Record<LessonStatus, 'blue' | 'green' | 'grey' | 'amber' | 'red'> = {
  scheduled: 'blue', completed: 'green', cancelled_by_parent: 'grey', cancelled_by_tutor: 'grey', no_show: 'red',
}
// Soft, readable colours to tell tutors apart on the calendar.
export const TUTOR_COLOURS = ['#2F6F8F', '#7A5C99', '#3C8D6E', '#B4693C', '#5B7083', '#A04E6A']

const TZ = 'Europe/London'
export const fmtTime = (d: string | Date) => new Date(d).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: TZ })
export const fmtDay = (d: string | Date) => new Date(d).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: TZ })
export const fmtLong = (d: string | Date) => new Date(d).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: TZ })
export const toDateInput = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
export const toTimeInput = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`

export function startOfWeek(d: Date) {
  const x = new Date(d); x.setHours(0, 0, 0, 0)
  const diff = (x.getDay() + 6) % 7 // Monday first
  x.setDate(x.getDate() - diff); return x
}
export const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x }
export const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString()

export function useStaff() {
  const [staff, setStaff] = useState<StaffMember[]>([])
  useEffect(() => { supabase.rpc('staff_directory').then(({ data }) => setStaff((data ?? []) as StaffMember[])) }, [])
  return staff
}

/** Name to show for a lesson: the 1:1 student or the group. */
export function lessonTitle(l: Lesson, studentName: Record<string, string>, groupName: Record<string, string>) {
  return l.kind === 'group' ? groupName[l.group_id ?? ''] ?? 'Group' : studentName[l.student_id ?? ''] ?? 'Student'
}

export function useLookups() {
  const [studentName, setStudentName] = useState<Record<string, string>>({})
  const [groupName, setGroupName] = useState<Record<string, string>>({})
  const [students, setStudents] = useState<{ id: string; first_name: string; last_name: string | null; family_id: string }[]>([])
  const [groups, setGroups] = useState<Group[]>([])
  useEffect(() => {
    Promise.all([
      supabase.from('students').select('id, first_name, last_name, family_id').eq('active', true).order('first_name'),
      supabase.from('groups').select('*').order('name'),
    ]).then(([{ data: s }, { data: g }]) => {
      setStudents(s ?? []); setGroups((g ?? []) as Group[])
      setStudentName(Object.fromEntries((s ?? []).map((x) => [x.id, [x.first_name, x.last_name].filter(Boolean).join(' ')])))
      setGroupName(Object.fromEntries((g ?? []).map((x) => [x.id, x.name])))
    })
  }, [])
  return { studentName, groupName, students, groups }
}
