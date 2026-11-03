import { supabase } from './supabase'

/** Collects everything this signed-in parent can see about their family and downloads it as a JSON file. */
export async function exportMyData() {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return
  const tables = ['profiles', 'families', 'family_members', 'students', 'lessons', 'lesson_attendance', 'lesson_requests',
    'homework', 'homework_submissions', 'submission_files', 'invoices', 'invoice_lines', 'payments', 'notification_prefs', 'student_files']
  const out: Record<string, unknown> = { exported_at: new Date().toISOString(), account: { id: user.id, email: user.email } }
  for (const t of tables) {
    const { data } = await supabase.from(t).select('*').limit(5000)
    out[t] = data ?? []
  }
  const blob = new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `my-data-${new Date().toISOString().slice(0, 10)}.json`
  a.click()
  URL.revokeObjectURL(a.href)
}
