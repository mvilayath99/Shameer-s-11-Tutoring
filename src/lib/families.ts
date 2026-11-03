import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase'
import { useAuth } from './AuthProvider'

export const EXAM_BOARDS = ['GL Assessment', 'CEM', 'CSSE', 'ISEB', 'Other']
export const SCHOOL_YEARS = ['Year 3', 'Year 4', 'Year 5', 'Year 6']

export interface Family {
  id: string; name: string; billing_name: string | null; billing_email: string | null; phone: string | null
  address: string | null; active: boolean; created_at: string
}
export interface Student {
  id: string; family_id: string; user_id: string | null; first_name: string; last_name: string | null
  date_of_birth: string | null; current_school: string | null; school_year: string | null; target_schools: string | null
  exam_boards: string[]; exam_date: string | null; learning_notes: string | null; sen_notes: string | null
  photo_consent: boolean; active: boolean; created_at: string
}

export const fullName = (s: Pick<Student, 'first_name' | 'last_name'>) => [s.first_name, s.last_name].filter(Boolean).join(' ')

export function useMyFamily() {
  const { session } = useAuth()
  const [family, setFamily] = useState<Family | null>(null)
  const [students, setStudents] = useState<Student[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!session) return
    const { data: m } = await supabase.from('family_members').select('family_id').eq('user_id', session.user.id).limit(1).maybeSingle()
    if (!m) { setFamily(null); setStudents([]); setLoading(false); return }
    const [{ data: f }, { data: s }] = await Promise.all([
      supabase.from('families').select('*').eq('id', m.family_id).maybeSingle(),
      supabase.from('students').select('*').eq('family_id', m.family_id).order('created_at'),
    ])
    setFamily(f as Family | null); setStudents((s ?? []) as Student[]); setLoading(false)
  }, [session])
  useEffect(() => { load() }, [load])
  return { family, students, loading, reload: load }
}

/** Calls the student-account Edge Function. Returns an error message or null. */
export async function manageStudentLogin(body: { action: 'create' | 'reset'; student_id: string; username?: string; password: string }) {
  const { data, error } = await supabase.functions.invoke('student-account', { body })
  if (error) {
    try { const j = await (error as { context?: Response }).context?.json(); if (j?.error) return j.error as string } catch { /* ignore */ }
    return 'The login service is not set up yet. Deploy the student-account function in Supabase.'
  }
  return (data?.error as string | undefined) ?? null
}
