import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Download, Trash2, Upload } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { fullName, manageStudentLogin, type Family, type Student } from '../../lib/families'
import { formatDate } from '../../lib/format'
import { PageHeader } from '../../components/PortalLayout'
import { Loading } from '../../components/RequirePortal'
import { LoginForm, StudentForm, type StudentInput } from '../../components/StudentForm'
import { Badge, Notice, Tabs } from '../../components/ui'

type Tab = 'overview' | 'lessons' | 'homework' | 'invoices' | 'files' | 'notes'
interface FileRow { id: string; path: string; file_name: string; shared_with_family: boolean; created_at: string }

/** Lets later steps plug their own tab content in without changing this page. */
export const STUDENT_TABS: Partial<Record<Tab, (s: Student) => ReactNode>> = {}

export default function StudentProfile() {
  const { id } = useParams()
  const [s, setS] = useState<Student | null>(null)
  const [family, setFamily] = useState<Family | null>(null)
  const [tab, setTab] = useState<Tab>('overview')
  const [notes, setNotes] = useState('')
  const [files, setFiles] = useState<FileRow[]>([])
  const [msg, setMsg] = useState<{ kind: 'success' | 'error'; text: string } | null>(null)

  const load = useCallback(async () => {
    const { data } = await supabase.from('students').select('*').eq('id', id).maybeSingle()
    setS(data as Student | null)
    if (!data) return
    const [{ data: f }, { data: n }, { data: fl }] = await Promise.all([
      supabase.from('families').select('*').eq('id', data.family_id).maybeSingle(),
      supabase.from('student_private').select('staff_notes').eq('student_id', data.id).maybeSingle(),
      supabase.from('student_files').select('*').eq('student_id', data.id).order('created_at', { ascending: false }),
    ])
    setFamily(f as Family | null); setNotes(n?.staff_notes ?? ''); setFiles((fl ?? []) as FileRow[])
  }, [id])
  useEffect(() => { load() }, [load])

  if (!s) return <Loading />

  const save = async (v: StudentInput) => {
    const { error } = await supabase.from('students').update(v).eq('id', s.id)
    setMsg(error ? { kind: 'error', text: error.message } : { kind: 'success', text: 'Saved.' }); load()
  }
  const saveNotes = async () => {
    const { error } = await supabase.from('student_private').upsert({ student_id: s.id, staff_notes: notes, updated_at: new Date().toISOString() })
    setMsg(error ? { kind: 'error', text: error.message } : { kind: 'success', text: 'Notes saved.' })
  }
  const toggleActive = async () => { await supabase.from('students').update({ active: !s.active }).eq('id', s.id); load() }

  const upload = async (file: File) => {
    const path = `${s.id}/${Date.now()}-${file.name}`
    const { error } = await supabase.storage.from('student-files').upload(path, file)
    if (error) { setMsg({ kind: 'error', text: error.message }); return }
    await supabase.from('student_files').insert({ student_id: s.id, path, file_name: file.name })
    load()
  }
  const download = async (f: FileRow) => {
    const { data } = await supabase.storage.from('student-files').createSignedUrl(f.path, 60)
    if (data) window.open(data.signedUrl, '_blank')
  }
  const remove = async (f: FileRow) => {
    if (!confirm(`Delete ${f.file_name}?`)) return
    await supabase.storage.from('student-files').remove([f.path])
    await supabase.from('student_files').delete().eq('id', f.id); load()
  }
  const share = async (f: FileRow) => { await supabase.from('student_files').update({ shared_with_family: !f.shared_with_family }).eq('id', f.id); load() }

  const TABS: { key: Tab; label: string }[] = [
    { key: 'overview', label: 'Overview' }, { key: 'lessons', label: 'Lessons' }, { key: 'homework', label: 'Homework' },
    { key: 'invoices', label: 'Invoices' }, { key: 'files', label: 'Files' }, { key: 'notes', label: 'Staff notes' },
  ]

  return (
    <>
      <Link to="/admin/students" className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-ink"><ArrowLeft className="h-4 w-4" /> All students</Link>
      <PageHeader title={fullName(s)}
        subtitle={[s.school_year, s.current_school, family?.name].filter(Boolean).join(' · ')}
        action={<div className="flex items-center gap-2">{s.exam_boards.map((b) => <Badge key={b} tone="blue">{b}</Badge>)}{!s.active && <Badge>Inactive</Badge>}</div>} />
      {msg && <div className="mb-4"><Notice kind={msg.kind}>{msg.text}</Notice></div>}
      <Tabs tabs={TABS} value={tab} onChange={setTab} />

      {tab === 'overview' && (
        <div className="grid gap-6 xl:grid-cols-[1fr_22rem]">
          <div className="card"><StudentForm initial={s} onSubmit={save} /></div>
          <div className="flex flex-col gap-6">
            <div className="card text-sm">
              <h3 className="mb-3 font-semibold">Family</h3>
              {family && <Link to={`/admin/families/${family.id}`} className="text-primary hover:underline">{family.name}</Link>}
              <p className="mt-1 text-muted">{family?.billing_email}</p>
              <p className="text-muted">{family?.phone}</p>
            </div>
            <div className="card">
              <h3 className="mb-3 text-sm font-semibold">Student login {s.user_id && <Badge tone="green">Set up</Badge>}</h3>
              <LoginForm hasLogin={Boolean(s.user_id)} onSubmit={async (u, p) => {
                const err = await manageStudentLogin({ action: s.user_id ? 'reset' : 'create', student_id: s.id, username: u, password: p })
                if (!err) load()
                return err
              }} />
            </div>
            <button className="btn-outline" onClick={toggleActive}>{s.active ? 'Mark as inactive' : 'Mark as active'}</button>
          </div>
        </div>
      )}
      {(tab === 'lessons' || tab === 'homework' || tab === 'invoices') && (
        STUDENT_TABS[tab]?.(s) ?? <div className="card text-sm text-muted">This will show once the {tab} section is built.</div>
      )}
      {tab === 'files' && (
        <div className="card flex flex-col gap-4">
          <label className="btn-outline cursor-pointer self-start"><Upload className="h-4 w-4" /> Upload file<input type="file" className="hidden" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} /></label>
          {!files.length && <p className="text-sm text-muted">No files yet.</p>}
          <ul className="divide-y divide-line">
            {files.map((f) => (
              <li key={f.id} className="flex flex-wrap items-center gap-3 py-3 text-sm">
                <span className="flex-1 font-medium">{f.file_name}</span>
                <span className="text-muted">{formatDate(f.created_at)}</span>
                <label className="flex items-center gap-2 text-muted"><input type="checkbox" checked={f.shared_with_family} onChange={() => share(f)} /> Share with family</label>
                <button onClick={() => download(f)} aria-label="Download"><Download className="h-4 w-4" /></button>
                <button onClick={() => remove(f)} aria-label="Delete" className="text-muted hover:text-red-600"><Trash2 className="h-4 w-4" /></button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {tab === 'notes' && (
        <div className="card flex flex-col gap-4">
          <p className="text-sm text-muted">Private to staff. Families never see these notes.</p>
          <textarea rows={10} className="input" value={notes} onChange={(e) => setNotes(e.target.value)} />
          <button className="btn-primary self-start" onClick={saveNotes}>Save notes</button>
        </div>
      )}
    </>
  )
}
