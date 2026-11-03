import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { ArrowLeft, Paperclip, Plus, Upload } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { notify } from '../../lib/notify'
import { SUB_LABEL, SUB_TONE, openFile, percent, safeName, type Homework as HW, type Resource, type SubFile, type Submission } from '../../lib/homework'
import { SUBJECTS, useLookups } from '../../lib/lessons'
import { formatDate } from '../../lib/format'
import { PageHeader } from '../../components/PortalLayout'
import { useModuleName } from '../../components/ModuleGate'
import { Modal } from '../../components/Modal'
import { Badge, Field, Notice, Table, Td } from '../../components/ui'

export default function Homework() {
  const title = useModuleName('homework', 'Homework')
  const { studentName, groupName, students, groups } = useLookups()
  const [items, setItems] = useState<HW[]>([])
  const [subs, setSubs] = useState<Submission[]>([])
  const [setting, setSetting] = useState(false)
  const [open, setOpen] = useState<HW | null>(null)
  const [filter, setFilter] = useState<'all' | 'to_mark'>('to_mark')

  const load = useCallback(async () => {
    const [{ data: h }, { data: s }] = await Promise.all([
      supabase.from('homework').select('*').order('created_at', { ascending: false }).limit(200),
      supabase.from('homework_submissions').select('*'),
    ])
    setItems((h ?? []) as HW[]); setSubs((s ?? []) as Submission[])
  }, [])
  useEffect(() => { load() }, [load])

  if (open) return <MarkHomework hw={open} studentName={studentName} onBack={() => { setOpen(null); load() }} />

  const toMark = (h: HW) => subs.filter((s) => s.homework_id === h.id && (s.status === 'submitted' || s.status === 'late')).length
  const shown = filter === 'to_mark' ? items.filter((h) => toMark(h) > 0) : items

  return (
    <>
      <PageHeader title={title} action={<button className="btn-primary" onClick={() => setSetting(true)}><Plus className="h-4 w-4" /> Set homework</button>} />
      <div className="mb-4 flex gap-2">
        {(['to_mark', 'all'] as const).map((k) => <button key={k} onClick={() => setFilter(k)} className={`rounded-full px-3 py-1.5 text-sm ${filter === k ? 'bg-primary text-white' : 'border border-line bg-white text-muted'}`}>{k === 'to_mark' ? `To mark (${items.filter((h) => toMark(h) > 0).length})` : 'All homework'}</button>)}
      </div>
      <Table head={['Homework', 'For', 'Due', 'Handed in', 'To mark']} empty={filter === 'to_mark' ? 'Nothing waiting to be marked.' : 'No homework set yet.'}>
        {shown.map((h) => {
          const mine = subs.filter((s) => s.homework_id === h.id)
          return (
            <tr key={h.id} className="cursor-pointer hover:bg-secondary" onClick={() => setOpen(h)}>
              <Td className="font-medium">{h.title}<div className="text-xs font-normal text-muted">{h.subject}</div></Td>
              <Td>{h.group_id ? groupName[h.group_id] : studentName[h.student_id ?? '']}</Td>
              <Td className="whitespace-nowrap text-muted">{h.due_at ? formatDate(h.due_at) : '—'}</Td>
              <Td>{mine.filter((s) => s.status !== 'set').length}/{mine.length}</Td>
              <Td>{toMark(h) > 0 ? <Badge tone="amber">{toMark(h)}</Badge> : <span className="text-muted">0</span>}</Td>
            </tr>
          )
        })}
      </Table>
      {setting && <SetHomework students={students} groups={groups} studentName={studentName} onClose={() => setSetting(false)} onSaved={load} />}
    </>
  )
}

function SetHomework({ students, groups, studentName, onClose, onSaved }: {
  students: { id: string }[]; groups: { id: string; name: string }[]; studentName: Record<string, string>; onClose: () => void; onSaved: () => void
}) {
  const [target, setTarget] = useState<'student' | 'group'>('group')
  const [targetId, setTargetId] = useState('')
  const [titleText, setTitleText] = useState('')
  const [instructions, setInstructions] = useState('')
  const [subject, setSubject] = useState('')
  const [due, setDue] = useState('')
  const [resources, setResources] = useState<Resource[]>([])
  const [picked, setPicked] = useState<string[]>([])
  const [rq, setRq] = useState('')
  const [error, setError] = useState<string | null>(null)
  useEffect(() => { supabase.from('resources').select('*').order('title').limit(1000).then(({ data }) => setResources((data ?? []) as Resource[])) }, [])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const { data, error } = await supabase.from('homework').insert({
      title: titleText, instructions: instructions || null, subject: subject || null, type: 'worksheet',
      due_at: due ? new Date(`${due}T18:00`).toISOString() : null,
      student_id: target === 'student' ? targetId : null, group_id: target === 'group' ? targetId : null,
    }).select('id').single()
    if (error) { setError(error.message); return }
    if (picked.length) await supabase.from('homework_resources').insert(picked.map((r) => ({ homework_id: data.id, resource_id: r })))
    notify('homework_set', data.id)
    onSaved(); onClose()
  }

  return (
    <Modal title="Set homework" onClose={onClose} wide>
      <form onSubmit={submit} className="flex flex-col gap-4">
        {error && <Notice kind="error">{error}</Notice>}
        <div className="flex flex-wrap gap-2">
          <button type="button" className="rounded-lg border border-primary bg-primary-soft px-4 py-2 text-sm text-primary">Worksheet (photo upload)</button>
          <button type="button" disabled className="rounded-lg border border-line px-4 py-2 text-sm text-muted">Online quiz · coming in phase 2</button>
        </div>
        <Field label="Title"><input className="input" required value={titleText} onChange={(e) => setTitleText(e.target.value)} placeholder="For example Fractions practice sheet 3" /></Field>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Set for"><select className="input" value={target} onChange={(e) => { setTarget(e.target.value as typeof target); setTargetId('') }}><option value="group">A group</option><option value="student">A student</option></select></Field>
          <Field label={target === 'group' ? 'Group' : 'Student'}>
            <select className="input" required value={targetId} onChange={(e) => setTargetId(e.target.value)}>
              <option value="">Choose…</option>
              {target === 'group' ? groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>) : students.map((s) => <option key={s.id} value={s.id}>{studentName[s.id]}</option>)}
            </select>
          </Field>
          <Field label="Due date"><input type="date" className="input" value={due} onChange={(e) => setDue(e.target.value)} /></Field>
        </div>
        <Field label="Subject"><select className="input" value={subject} onChange={(e) => setSubject(e.target.value)}><option value="">Choose…</option>{SUBJECTS.map((s) => <option key={s}>{s}</option>)}</select></Field>
        <Field label="Instructions"><textarea rows={3} className="input" value={instructions} onChange={(e) => setInstructions(e.target.value)} /></Field>
        <fieldset>
          <legend className="label">Attach from the library</legend>
          <input className="input mb-2" placeholder="Search resources" value={rq} onChange={(e) => setRq(e.target.value)} />
          <div className="max-h-48 overflow-y-auto rounded-lg border border-line">
            {resources.filter((r) => !rq || r.title.toLowerCase().includes(rq.toLowerCase())).slice(0, 50).map((r) => (
              <label key={r.id} className="flex items-center gap-2 border-b border-line px-3 py-2 text-sm last:border-0">
                <input type="checkbox" checked={picked.includes(r.id)} onChange={(e) => setPicked(e.target.checked ? [...picked, r.id] : picked.filter((x) => x !== r.id))} />
                {r.title} <span className="text-xs text-muted">{[r.subject, r.difficulty].filter(Boolean).join(' · ')}</span>
              </label>
            ))}
            {!resources.length && <p className="p-3 text-sm text-muted">No resources uploaded yet.</p>}
          </div>
        </fieldset>
        <button className="btn-primary self-start">Set homework</button>
      </form>
    </Modal>
  )
}

function MarkHomework({ hw, studentName, onBack }: { hw: HW; studentName: Record<string, string>; onBack: () => void }) {
  const [subs, setSubs] = useState<Submission[]>([])
  const [files, setFiles] = useState<SubFile[]>([])
  const [urls, setUrls] = useState<Record<string, string>>({})
  const [attached, setAttached] = useState<Resource[]>([])
  const [active, setActive] = useState<Submission | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  const load = useCallback(async () => {
    const [{ data: s }, { data: hr }] = await Promise.all([
      supabase.from('homework_submissions').select('*').eq('homework_id', hw.id),
      supabase.from('homework_resources').select('resource_id').eq('homework_id', hw.id),
    ])
    const list = (s ?? []) as Submission[]; setSubs(list)
    const ids = (hr ?? []).map((x) => x.resource_id)
    if (ids.length) { const { data } = await supabase.from('resources').select('*').in('id', ids); setAttached((data ?? []) as Resource[]) }
    if (list.length) {
      const { data: f } = await supabase.from('submission_files').select('*').in('submission_id', list.map((x) => x.id)).order('created_at')
      const fl = (f ?? []) as SubFile[]; setFiles(fl)
      const signed = await Promise.all(fl.map(async (x) => [x.id, (await supabase.storage.from('homework').createSignedUrl(x.path, 3600)).data?.signedUrl ?? ''] as const))
      setUrls(Object.fromEntries(signed))
    }
  }, [hw.id])
  useEffect(() => { load() }, [load])

  const save = async () => {
    if (!active) return
    const { data: u } = await supabase.auth.getUser()
    const { error } = await supabase.from('homework_submissions').update({
      score: active.score, total: active.total, comment: active.comment, status: 'marked', marked_at: new Date().toISOString(), marked_by: u.user?.id,
    }).eq('id', active.id)
    if (!error) notify('homework_marked', active.id)
    setMsg(error ? error.message : `Marked ${studentName[active.student_id]}.`); setActive(null); load()
  }
  const uploadMarked = async (file: File) => {
    if (!active) return
    const path = `${active.id}/marked-${crypto.randomUUID()}-${safeName(file.name)}`
    const { error } = await supabase.storage.from('homework').upload(path, file)
    if (!error) await supabase.from('submission_files').insert({ submission_id: active.id, path, file_name: file.name, kind: 'marked' })
    load()
  }
  const isImage = (n: string) => /\.(png|jpe?g|gif|webp|heic)$/i.test(n)

  return (
    <>
      <button onClick={onBack} className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-ink"><ArrowLeft className="h-4 w-4" /> All homework</button>
      <PageHeader title={hw.title} subtitle={[hw.subject, hw.due_at ? `Due ${formatDate(hw.due_at)}` : null].filter(Boolean).join(' · ')} />
      {hw.instructions && <p className="mb-4 max-w-2xl text-sm text-muted">{hw.instructions}</p>}
      {attached.length > 0 && <div className="mb-6 flex flex-wrap gap-2">{attached.map((r) => <button key={r.id} onClick={() => openFile('resources', r.path)} className="inline-flex items-center gap-1 rounded-full bg-secondary px-3 py-1 text-sm text-primary"><Paperclip className="h-3 w-3" />{r.title}</button>)}</div>}
      {msg && <div className="mb-4"><Notice kind="success">{msg}</Notice></div>}
      <div className="flex flex-col gap-4">
        {subs.map((s) => {
          const mine = files.filter((f) => f.submission_id === s.id)
          const pct = percent(s)
          return (
            <div key={s.id} className="card">
              <div className="mb-3 flex flex-wrap items-center gap-3">
                <h3 className="font-semibold">{studentName[s.student_id]}</h3>
                <Badge tone={SUB_TONE[s.status]}>{SUB_LABEL[s.status]}</Badge>
                {s.submitted_at && <span className="text-xs text-muted">Handed in {formatDate(s.submitted_at)}</span>}
                {s.status === 'marked' && <span className="ml-auto text-sm font-medium">{s.score}/{s.total}{pct != null ? ` (${pct}%)` : ''}</span>}
                {s.status !== 'set' && active?.id !== s.id && <button className="ml-auto text-sm text-primary hover:underline" onClick={() => setActive(s)}>{s.status === 'marked' ? 'Edit mark' : 'Mark'}</button>}
              </div>
              {mine.length > 0 && (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {mine.map((f) => isImage(f.file_name) && urls[f.id]
                    ? <a key={f.id} href={urls[f.id]} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-lg border border-line"><img src={urls[f.id]} alt={f.file_name} className="h-48 w-full object-cover" /><span className="block px-2 py-1 text-xs text-muted">{f.kind === 'marked' ? 'Marked copy' : f.file_name}</span></a>
                    : <button key={f.id} onClick={() => openFile('homework', f.path)} className="rounded-lg border border-line px-3 py-3 text-left text-sm text-primary">{f.kind === 'marked' ? 'Marked copy: ' : ''}{f.file_name}</button>)}
                </div>
              )}
              {s.comment && active?.id !== s.id && <p className="mt-3 rounded-lg bg-secondary p-3 text-sm">{s.comment}</p>}
              {active?.id === s.id && (
                <div className="mt-4 flex flex-col gap-3 border-t border-line pt-4">
                  <div className="grid max-w-sm grid-cols-2 gap-3">
                    <Field label="Score"><input type="number" step="0.5" className="input" value={active.score ?? ''} onChange={(e) => setActive({ ...active, score: e.target.value === '' ? null : Number(e.target.value) })} /></Field>
                    <Field label="Out of"><input type="number" step="0.5" className="input" value={active.total ?? ''} onChange={(e) => setActive({ ...active, total: e.target.value === '' ? null : Number(e.target.value) })} /></Field>
                  </div>
                  <Field label="Comment for the student and parent"><textarea rows={3} className="input" value={active.comment ?? ''} onChange={(e) => setActive({ ...active, comment: e.target.value })} /></Field>
                  <div className="flex flex-wrap gap-3">
                    <button className="btn-primary" onClick={save}>Save mark</button>
                    <label className="btn-outline cursor-pointer"><Upload className="h-4 w-4" /> Upload marked copy<input type="file" className="hidden" onChange={(e) => e.target.files?.[0] && uploadMarked(e.target.files[0])} /></label>
                    <button className="btn-outline" onClick={() => setActive(null)}>Cancel</button>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </>
  )
}
