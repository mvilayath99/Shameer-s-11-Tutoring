import { useCallback, useEffect, useState } from 'react'
import { Camera, CheckCircle2, Paperclip, Trash2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/AuthProvider'
import { SUB_LABEL, SUB_TONE, openFile, percent, safeName, type Homework, type Resource, type SubFile, type Submission } from '../../lib/homework'
import { formatDate } from '../../lib/format'
import { PageHeader } from '../../components/PortalLayout'
import { useModuleName } from '../../components/ModuleGate'
import { Badge, Notice, Tabs } from '../../components/ui'

export default function FamilyHomework({ portal }: { portal: 'parent' | 'student' }) {
  const title = useModuleName('homework', 'Homework')
  const { session } = useAuth()
  const [tab, setTab] = useState<'todo' | 'done'>('todo')
  const [kids, setKids] = useState<{ id: string; first_name: string }[]>([])
  const [subs, setSubs] = useState<Submission[]>([])
  const [hw, setHw] = useState<Record<string, Homework>>({})
  const [files, setFiles] = useState<SubFile[]>([])
  const [res, setRes] = useState<Record<string, Resource[]>>({})
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ kind: 'success' | 'error'; text: string } | null>(null)

  const load = useCallback(async () => {
    if (!session) return
    const ks = portal === 'student'
      ? await supabase.from('students').select('id, first_name').eq('user_id', session.user.id)
      : await supabase.from('students').select('id, first_name').order('first_name')
    const kidRows = ks.data ?? []; setKids(kidRows)
    if (!kidRows.length) return
    const { data: s } = await supabase.from('homework_submissions').select('*').in('student_id', kidRows.map((k) => k.id))
    const list = (s ?? []) as Submission[]; setSubs(list)
    const hwIds = [...new Set(list.map((x) => x.homework_id))]
    if (!hwIds.length) return
    const [{ data: h }, { data: f }, { data: hr }] = await Promise.all([
      supabase.from('homework').select('*').in('id', hwIds),
      supabase.from('submission_files').select('*').in('submission_id', list.map((x) => x.id)).order('created_at'),
      supabase.from('homework_resources').select('homework_id, resource_id').in('homework_id', hwIds),
    ])
    setHw(Object.fromEntries((h ?? []).map((x) => [x.id, x as Homework]))); setFiles((f ?? []) as SubFile[])
    const rids = [...new Set((hr ?? []).map((x) => x.resource_id))]
    if (rids.length) {
      const { data: r } = await supabase.from('resources').select('*').in('id', rids)
      const byId = Object.fromEntries((r ?? []).map((x) => [x.id, x as Resource]))
      const map: Record<string, Resource[]> = {}
      for (const x of hr ?? []) if (byId[x.resource_id]) (map[x.homework_id] ??= []).push(byId[x.resource_id])
      setRes(map)
    }
  }, [session, portal])
  useEffect(() => { load() }, [load])

  const upload = async (s: Submission, list: FileList) => {
    setBusy(s.id); setMsg(null)
    for (const file of Array.from(list)) {
      const path = `${s.id}/${crypto.randomUUID()}-${safeName(file.name || 'photo.jpg')}`
      const { error } = await supabase.storage.from('homework').upload(path, file, { contentType: file.type })
      if (error) { setMsg({ kind: 'error', text: error.message }); break }
      await supabase.from('submission_files').insert({ submission_id: s.id, path, file_name: file.name || 'photo.jpg' })
    }
    setBusy(null); load()
  }
  const removeFile = async (f: SubFile) => { await supabase.from('submission_files').delete().eq('id', f.id); await supabase.storage.from('homework').remove([f.path]); load() }
  const handIn = async (s: Submission) => {
    const { error } = await supabase.rpc('submit_homework', { _submission_id: s.id })
    setMsg(error ? { kind: 'error', text: error.message } : { kind: 'success', text: 'Handed in. Well done!' }); load()
  }

  const kidName = (id: string) => kids.find((k) => k.id === id)?.first_name
  const shown = subs.filter((s) => hw[s.homework_id] && (tab === 'todo' ? s.status === 'set' : s.status !== 'set'))
    .sort((a, b) => (hw[a.homework_id].due_at ?? '9').localeCompare(hw[b.homework_id].due_at ?? '9'))

  return (
    <>
      <PageHeader title={title} />
      {msg && <div className="mb-4"><Notice kind={msg.kind}>{msg.text}</Notice></div>}
      <Tabs tabs={[{ key: 'todo', label: `To do (${subs.filter((s) => s.status === 'set').length})` }, { key: 'done', label: 'Handed in and marked' }]} value={tab} onChange={setTab} />
      {!shown.length && <div className="card text-sm text-muted">{tab === 'todo' ? 'No homework to do right now.' : 'Nothing handed in yet.'}</div>}
      <div className="flex flex-col gap-4">
        {shown.map((s) => {
          const h = hw[s.homework_id]
          const mine = files.filter((f) => f.submission_id === s.id)
          const overdue = s.status === 'set' && h.due_at && new Date(h.due_at) < new Date()
          const pct = percent(s)
          return (
            <div key={s.id} className="card flex flex-col gap-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h2 className="font-semibold">{h.title}</h2>
                  <p className="text-sm text-muted">{[portal === 'parent' ? kidName(s.student_id) : null, h.subject, h.due_at ? `Due ${formatDate(h.due_at)}` : null].filter(Boolean).join(' · ')}</p>
                </div>
                {overdue ? <Badge tone="red">Overdue</Badge> : <Badge tone={SUB_TONE[s.status]}>{SUB_LABEL[s.status]}</Badge>}
              </div>
              {h.instructions && <p className="text-sm">{h.instructions}</p>}
              {(res[h.id] ?? []).length > 0 && (
                <div className="flex flex-wrap gap-2">{res[h.id].map((r) => <button key={r.id} onClick={() => openFile('resources', r.path)} className="inline-flex items-center gap-1 rounded-full bg-secondary px-3 py-1 text-sm text-primary"><Paperclip className="h-3 w-3" />{r.title}</button>)}</div>
              )}
              {mine.length > 0 && (
                <ul className="flex flex-wrap gap-2 text-sm">
                  {mine.map((f) => (
                    <li key={f.id} className="flex items-center gap-2 rounded-lg border border-line px-3 py-1.5">
                      <button className="text-primary" onClick={() => openFile('homework', f.path)}>{f.kind === 'marked' ? 'Marked copy' : f.file_name}</button>
                      {s.status === 'set' && f.kind === 'upload' && <button onClick={() => removeFile(f)} aria-label="Remove" className="text-muted hover:text-red-600"><Trash2 className="h-3.5 w-3.5" /></button>}
                    </li>
                  ))}
                </ul>
              )}
              {s.status === 'marked' && (
                <div className="rounded-lg bg-secondary p-4 text-sm">
                  <p className="text-lg font-semibold">{s.score}/{s.total}{pct != null ? ` · ${pct}%` : ''}</p>
                  {s.comment && <p className="mt-1">{s.comment}</p>}
                </div>
              )}
              {s.status === 'set' && (
                <div className="flex flex-wrap gap-3">
                  <label className="btn-outline cursor-pointer">
                    <Camera className="h-4 w-4" /> {busy === s.id ? 'Uploading…' : mine.length ? 'Add more photos' : 'Upload photos of your work'}
                    <input type="file" accept="image/*,application/pdf" capture="environment" multiple className="hidden" onChange={(e) => e.target.files && upload(s, e.target.files)} />
                  </label>
                  <button className="btn-primary" disabled={!mine.length} onClick={() => handIn(s)}><CheckCircle2 className="h-4 w-4" /> Hand in</button>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </>
  )
}
