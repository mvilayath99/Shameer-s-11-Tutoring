import { useCallback, useEffect, useMemo, useState } from 'react'
import { ChevronRight, CloudDownload, Eye, Folder as FolderIcon, FolderPlus, Search, Share2, Trash2, Upload } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { DIFFICULTIES, fmtSize, openFile, safeName, type Folder, type Resource } from '../../lib/homework'
import { EXAM_BOARDS, SCHOOL_YEARS } from '../../lib/families'
import { SUBJECTS, useLookups } from '../../lib/lessons'
import { formatDate } from '../../lib/format'
import { PageHeader } from '../../components/PortalLayout'
import { useModuleName } from '../../components/ModuleGate'
import { Modal } from '../../components/Modal'
import { Field, Notice, Table, Td } from '../../components/ui'

type Tags = Pick<Resource, 'subject' | 'topic' | 'difficulty' | 'exam_board' | 'school_year'>
const NO_TAGS: Tags = { subject: null, topic: null, difficulty: null, exam_board: null, school_year: null }

export default function Resources() {
  const title = useModuleName('resources', 'Resources')
  const [folders, setFolders] = useState<Folder[]>([])
  const [resources, setResources] = useState<Resource[]>([])
  const [folderId, setFolderId] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [f, setF] = useState<Tags>(NO_TAGS)
  const [uploadTags, setUploadTags] = useState<Tags>(NO_TAGS)
  const [progress, setProgress] = useState<string | null>(null)
  const [editing, setEditing] = useState<Resource | null>(null)
  const [sharing, setSharing] = useState<Resource | null>(null)
  const [msg, setMsg] = useState<{ kind: 'error' | 'success'; text: string } | null>(null)
  const [dragOver, setDragOver] = useState(false)

  const load = useCallback(async () => {
    const [{ data: fo }, { data: r }] = await Promise.all([
      supabase.from('resource_folders').select('*').order('name'),
      supabase.from('resources').select('*').order('created_at', { ascending: false }).limit(1000),
    ])
    setFolders((fo ?? []) as Folder[]); setResources((r ?? []) as Resource[])
  }, [])
  useEffect(() => { load() }, [load])

  const searching = Boolean(q || f.subject || f.difficulty || f.exam_board || f.school_year)
  const crumbs = useMemo(() => {
    const out: Folder[] = []; let cur = folders.find((x) => x.id === folderId)
    while (cur) { out.unshift(cur); cur = folders.find((x) => x.id === cur!.parent_id) }
    return out
  }, [folders, folderId])
  const subfolders = folders.filter((x) => x.parent_id === folderId)
  const shown = resources.filter((r) => (searching || r.folder_id === folderId)
    && (!q || `${r.title} ${r.topic ?? ''} ${r.file_name}`.toLowerCase().includes(q.toLowerCase()))
    && (!f.subject || r.subject === f.subject) && (!f.difficulty || r.difficulty === f.difficulty)
    && (!f.exam_board || r.exam_board === f.exam_board) && (!f.school_year || r.school_year === f.school_year))

  const newFolder = async () => {
    const name = prompt('Folder name'); if (!name) return
    await supabase.from('resource_folders').insert({ name, parent_id: folderId }); load()
  }
  const upload = async (files: FileList | File[]) => {
    const list = Array.from(files); setMsg(null)
    let done = 0, failed = 0
    for (const file of list) {
      setProgress(`Uploading ${done + 1} of ${list.length}: ${file.name}`)
      const path = `${folderId ?? 'root'}/${crypto.randomUUID()}-${safeName(file.name)}`
      const { error } = await supabase.storage.from('resources').upload(path, file, { contentType: file.type })
      if (error) { failed++; continue }
      const { error: e2 } = await supabase.from('resources').insert({
        ...uploadTags, folder_id: folderId, title: file.name.replace(/\.[^.]+$/, ''), path, file_name: file.name, mime_type: file.type, size_bytes: file.size,
      })
      if (e2) failed++; else done++
    }
    setProgress(null)
    setMsg(failed ? { kind: 'error', text: `${done} uploaded, ${failed} failed.` } : { kind: 'success', text: `${done} file${done === 1 ? '' : 's'} uploaded.` })
    load()
  }
  const remove = async (r: Resource) => {
    if (!confirm(`Delete “${r.title}”?`)) return
    await supabase.storage.from('resources').remove([r.path]); await supabase.from('resources').delete().eq('id', r.id); load()
  }
  const saveTags = async () => {
    if (!editing) return
    const { title, folder_id, subject, topic, difficulty, exam_board, school_year } = editing
    await supabase.from('resources').update({ title, folder_id, subject, topic, difficulty, exam_board, school_year }).eq('id', editing.id)
    setEditing(null); load()
  }
  const folderName = (id: string | null) => folders.find((x) => x.id === id)?.name ?? 'Top level'

  return (
    <>
      <PageHeader title={title} subtitle="Worksheets, papers and teaching material." action={
        <div className="flex flex-wrap gap-2">
          <button className="btn-outline" disabled title="Available once Microsoft 365 is connected"><CloudDownload className="h-4 w-4" /> Import from OneDrive</button>
          <button className="btn-outline" onClick={newFolder}><FolderPlus className="h-4 w-4" /> New folder</button>
          <label className="btn-primary cursor-pointer"><Upload className="h-4 w-4" /> Upload<input type="file" multiple className="hidden" accept=".pdf,.doc,.docx,.ppt,.pptx,image/*" onChange={(e) => e.target.files && upload(e.target.files)} /></label>
        </div>
      } />
      {msg && <div className="mb-4"><Notice kind={msg.kind}>{msg.text}</Notice></div>}
      {progress && <div className="mb-4"><Notice>{progress}</Notice></div>}

      <div className="mb-4 flex flex-wrap gap-2">
        <div className="relative w-full max-w-xs"><Search className="absolute left-3 top-3 h-4 w-4 text-muted" /><input className="input pl-9" placeholder="Search all resources" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <TagSelects value={f} onChange={setF} />
      </div>

      {!searching && (
        <div className="mb-3 flex items-center gap-1 text-sm">
          <button className="text-primary hover:underline" onClick={() => setFolderId(null)}>All folders</button>
          {crumbs.map((c) => <span key={c.id} className="flex items-center gap-1"><ChevronRight className="h-4 w-4 text-muted" /><button className="text-primary hover:underline" onClick={() => setFolderId(c.id)}>{c.name}</button></span>)}
        </div>
      )}

      <div className={`rounded-xl border-2 border-dashed p-4 ${dragOver ? 'border-primary bg-primary-soft' : 'border-transparent'}`}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }} onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); if (e.dataTransfer.files.length) upload(e.dataTransfer.files) }}>
        {!searching && subfolders.length > 0 && (
          <div className="mb-4 grid gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {subfolders.map((s) => (
              <button key={s.id} onClick={() => setFolderId(s.id)} className="flex items-center gap-2 rounded-lg border border-line bg-white px-3 py-2.5 text-left text-sm hover:bg-secondary">
                <FolderIcon className="h-4 w-4 text-primary" /> {s.name}
                <span className="ml-auto text-xs text-muted">{resources.filter((r) => r.folder_id === s.id).length}</span>
              </button>
            ))}
          </div>
        )}
        <details className="mb-3 text-sm">
          <summary className="cursor-pointer text-muted">Tags for new uploads {Object.values(uploadTags).some(Boolean) && '(set)'}</summary>
          <div className="mt-2 flex flex-wrap gap-2"><TagSelects value={uploadTags} onChange={setUploadTags} /></div>
        </details>
        <Table head={['Title', 'Subject', 'Topic', 'Level', 'Board', 'Year', 'Added', '']} empty="No files here yet. Drag files onto this area to upload.">
          {shown.map((r) => (
            <tr key={r.id} className="hover:bg-secondary">
              <Td><button className="text-left font-medium text-primary hover:underline" onClick={() => openFile('resources', r.path)}>{r.title}</button><div className="text-xs text-muted">{searching ? `${folderName(r.folder_id)} · ` : ''}{fmtSize(r.size_bytes)}</div></Td>
              <Td>{r.subject}</Td><Td className="text-muted">{r.topic}</Td><Td>{r.difficulty}</Td><Td>{r.exam_board}</Td><Td>{r.school_year}</Td>
              <Td className="whitespace-nowrap text-muted">{formatDate(r.created_at)}</Td>
              <Td className="whitespace-nowrap text-right">
                <button className="mr-2 text-muted hover:text-ink" onClick={() => openFile('resources', r.path)} aria-label="Preview"><Eye className="h-4 w-4" /></button>
                <button className="mr-2 text-muted hover:text-ink" onClick={() => setSharing(r)} aria-label="Share"><Share2 className="h-4 w-4" /></button>
                <button className="mr-2 text-sm text-primary hover:underline" onClick={() => setEditing(r)}>Edit</button>
                <button className="text-muted hover:text-red-600" onClick={() => remove(r)} aria-label="Delete"><Trash2 className="h-4 w-4" /></button>
              </Td>
            </tr>
          ))}
        </Table>
      </div>

      {editing && (
        <Modal title="Edit resource" onClose={() => setEditing(null)}>
          <div className="flex flex-col gap-4">
            <Field label="Title"><input className="input" value={editing.title} onChange={(e) => setEditing({ ...editing, title: e.target.value })} /></Field>
            <Field label="Folder"><select className="input" value={editing.folder_id ?? ''} onChange={(e) => setEditing({ ...editing, folder_id: e.target.value || null })}><option value="">Top level</option>{folders.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></Field>
            <Field label="Topic"><input className="input" value={editing.topic ?? ''} onChange={(e) => setEditing({ ...editing, topic: e.target.value })} /></Field>
            <div className="flex flex-wrap gap-2"><TagSelects value={editing} onChange={(t) => setEditing({ ...editing, ...t })} /></div>
            <button className="btn-primary self-start" onClick={saveTags}>Save</button>
          </div>
        </Modal>
      )}
      {sharing && <ShareModal resource={sharing} onClose={() => setSharing(null)} />}
    </>
  )
}

function TagSelects({ value, onChange }: { value: Tags; onChange: (t: Tags) => void }) {
  const sel = (k: keyof Tags, label: string, opts: string[]) => (
    <select className="input w-auto" value={value[k] ?? ''} onChange={(e) => onChange({ ...value, [k]: e.target.value || null })}>
      <option value="">{label}</option>{opts.map((o) => <option key={o}>{o}</option>)}
    </select>
  )
  return <>{sel('subject', 'Any subject', SUBJECTS)}{sel('difficulty', 'Any level', DIFFICULTIES)}{sel('exam_board', 'Any board', EXAM_BOARDS)}{sel('school_year', 'Any year', SCHOOL_YEARS)}</>
}

function ShareModal({ resource, onClose }: { resource: Resource; onClose: () => void }) {
  const { students, groups, studentName, groupName } = useLookups()
  const [shares, setShares] = useState<{ id: string; student_id: string | null; group_id: string | null; all_students: boolean }[]>([])
  const load = useCallback(async () => { const { data } = await supabase.from('resource_shares').select('*').eq('resource_id', resource.id); setShares(data ?? []) }, [resource.id])
  useEffect(() => { load() }, [load])
  const add = async (row: { student_id?: string; group_id?: string; all_students?: boolean }) => { await supabase.from('resource_shares').insert({ resource_id: resource.id, ...row }); load() }
  return (
    <Modal title={`Share “${resource.title}”`} onClose={onClose}>
      <div className="flex flex-col gap-4 text-sm">
        <ul className="flex flex-col gap-2">
          {!shares.length && <li className="text-muted">Only staff can see this resource.</li>}
          {shares.map((s) => (
            <li key={s.id} className="flex items-center justify-between rounded-lg bg-secondary px-3 py-2">
              {s.all_students ? 'All students' : s.group_id ? `Group: ${groupName[s.group_id]}` : studentName[s.student_id ?? '']}
              <button className="text-muted hover:text-red-600" onClick={async () => { await supabase.from('resource_shares').delete().eq('id', s.id); load() }}>Remove</button>
            </li>
          ))}
        </ul>
        <select className="input" value="" onChange={(e) => e.target.value && add({ student_id: e.target.value })}><option value="">Share with a student…</option>{students.map((s) => <option key={s.id} value={s.id}>{studentName[s.id]}</option>)}</select>
        <select className="input" value="" onChange={(e) => e.target.value && add({ group_id: e.target.value })}><option value="">Share with a group…</option>{groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</select>
        {!shares.some((s) => s.all_students) && <button className="btn-outline self-start" onClick={() => add({ all_students: true })}>Share with all students</button>}
      </div>
    </Modal>
  )
}
