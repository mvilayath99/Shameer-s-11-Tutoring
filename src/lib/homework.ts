import { supabase } from './supabase'

export const DIFFICULTIES = ['Foundation', 'Core', 'Stretch']
export interface Folder { id: string; parent_id: string | null; name: string }
export interface Resource {
  id: string; created_at: string; folder_id: string | null; title: string; path: string; file_name: string; mime_type: string | null
  size_bytes: number | null; subject: string | null; topic: string | null; difficulty: string | null; exam_board: string | null; school_year: string | null
}
export type SubStatus = 'set' | 'submitted' | 'late' | 'marked'
export interface Homework {
  id: string; created_at: string; title: string; instructions: string | null; type: 'worksheet' | 'quiz'; due_at: string | null
  student_id: string | null; group_id: string | null; subject: string | null
}
export interface Submission {
  id: string; homework_id: string; student_id: string; status: SubStatus; submitted_at: string | null
  score: number | null; total: number | null; comment: string | null; marked_at: string | null
}
export interface SubFile { id: string; submission_id: string; path: string; file_name: string; kind: 'upload' | 'marked'; created_at: string }

export const SUB_LABEL: Record<SubStatus, string> = { set: 'To do', submitted: 'Submitted', late: 'Submitted late', marked: 'Marked' }
export const SUB_TONE: Record<SubStatus, 'blue' | 'amber' | 'green' | 'red'> = { set: 'blue', submitted: 'amber', late: 'red', marked: 'green' }

export const safeName = (n: string) => n.replace(/[^\w.\- ]+/g, '_').slice(-120)

export async function openFile(bucket: 'resources' | 'homework' | 'student-files', path: string) {
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 300)
  if (data) window.open(data.signedUrl, '_blank')
  return error?.message ?? null
}

export const percent = (s: Pick<Submission, 'score' | 'total'>) =>
  s.score != null && s.total ? Math.round((Number(s.score) / Number(s.total)) * 100) : null

export function fmtSize(b: number | null) {
  if (!b) return ''
  return b > 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.round(b / 1024)} KB`
}
