import { useState, type FormEvent } from 'react'
import { Plus } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { fullName, manageStudentLogin, useMyFamily, type Student } from '../../lib/families'
import { PageHeader } from '../../components/PortalLayout'
import { Loading } from '../../components/RequirePortal'
import { LoginForm, StudentForm, type StudentInput } from '../../components/StudentForm'
import { Badge, Field, Notice } from '../../components/ui'

export function FamilySetup({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [address, setAddress] = useState('')
  const [terms, setTerms] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const { error } = await supabase.rpc('create_my_family', { _name: name, _phone: phone || null, _address: address || null })
    if (error) setError(error.message); else onDone()
  }
  return (
    <div className="card max-w-xl">
      <h2 className="text-lg font-semibold">Welcome! Let’s set up your family</h2>
      <p className="mt-1 text-sm text-muted">After this you can add your children.</p>
      <form onSubmit={submit} className="mt-6 flex flex-col gap-4">
        {error && <Notice kind="error">{error}</Notice>}
        <Field label="Family name" hint="For example “Khan family”"><input className="input" required value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Phone"><input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} /></Field>
        <Field label="Address"><input className="input" value={address} onChange={(e) => setAddress(e.target.value)} /></Field>
        <label className="flex items-start gap-3 text-sm"><input type="checkbox" required className="mt-0.5 h-4 w-4" checked={terms} onChange={(e) => setTerms(e.target.checked)} /> <span>I accept the <a href="/terms" className="text-primary underline">terms</a> and <a href="/privacy" className="text-primary underline">privacy policy</a>.</span></label>
        <button className="btn-primary self-start">Continue</button>
      </form>
    </div>
  )
}

export default function Children() {
  const { family, students, loading, reload } = useMyFamily()
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  if (loading) return <Loading />
  if (!family) return <><PageHeader title="My children" /><FamilySetup onDone={reload} /></>

  const add = async (v: StudentInput) => {
    const { error } = await supabase.from('students').insert({ ...v, family_id: family.id })
    if (error) setError(error.message); else { setAdding(false); reload() }
  }
  const update = async (s: Student, v: StudentInput) => {
    const { error } = await supabase.from('students').update(v).eq('id', s.id)
    if (error) setError(error.message); else { setEditing(null); reload() }
  }

  return (
    <>
      <PageHeader title="My children" subtitle={family.name}
        action={!adding && <button className="btn-primary" onClick={() => setAdding(true)}><Plus className="h-4 w-4" /> Add a child</button>} />
      {error && <div className="mb-4"><Notice kind="error">{error}</Notice></div>}
      {adding && <div className="card mb-6"><h2 className="mb-4 font-semibold">Add a child</h2><StudentForm onSubmit={add} onCancel={() => setAdding(false)} submitLabel="Add child" /></div>}
      {!students.length && !adding && <div className="card text-sm text-muted">No children added yet.</div>}
      <div className="flex flex-col gap-6">
        {students.map((s) => (
          <div key={s.id} className="card">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">{fullName(s)}</h2>
                <p className="text-sm text-muted">{[s.school_year, s.current_school].filter(Boolean).join(' · ')}</p>
              </div>
              <div className="flex gap-2">{s.exam_boards.map((b) => <Badge key={b} tone="blue">{b}</Badge>)}</div>
            </div>
            {editing === s.id ? (
              <StudentForm initial={s} onSubmit={(v) => update(s, v)} onCancel={() => setEditing(null)} />
            ) : (
              <button className="text-sm text-primary hover:underline" onClick={() => setEditing(s.id)}>Edit details</button>
            )}
            <div className="mt-6 border-t border-line pt-4">
              <h3 className="mb-3 text-sm font-semibold">Student login {s.user_id && <Badge tone="green">Set up</Badge>}</h3>
              <LoginForm hasLogin={Boolean(s.user_id)} onSubmit={async (username, password) => {
                const err = await manageStudentLogin({ action: s.user_id ? 'reset' : 'create', student_id: s.id, username, password })
                if (!err) reload()
                return err
              }} />
            </div>
          </div>
        ))}
      </div>
    </>
  )
}
