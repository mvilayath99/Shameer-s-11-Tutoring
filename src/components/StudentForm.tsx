import { useState, type FormEvent } from 'react'
import { Field } from './ui'
import { EXAM_BOARDS, SCHOOL_YEARS, type Student } from '../lib/families'

export type StudentInput = Omit<Student, 'id' | 'family_id' | 'user_id' | 'created_at' | 'active'>
export const EMPTY_STUDENT: StudentInput = {
  first_name: '', last_name: '', date_of_birth: null, current_school: '', school_year: '', target_schools: '',
  exam_boards: [], exam_date: null, learning_notes: '', sen_notes: '', photo_consent: false,
}

export function StudentForm({ initial, onSubmit, onCancel, submitLabel = 'Save' }: {
  initial?: Partial<StudentInput>; onSubmit: (v: StudentInput) => Promise<void> | void; onCancel?: () => void; submitLabel?: string
}) {
  const [v, setV] = useState<StudentInput>({ ...EMPTY_STUDENT, ...initial })
  const [busy, setBusy] = useState(false)
  const set = <K extends keyof StudentInput>(k: K, val: StudentInput[K]) => setV({ ...v, [k]: val })
  const submit = async (e: FormEvent) => { e.preventDefault(); setBusy(true); await onSubmit(v); setBusy(false) }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="First name *"><input className="input" required value={v.first_name} onChange={(e) => set('first_name', e.target.value)} /></Field>
        <Field label="Last name"><input className="input" value={v.last_name ?? ''} onChange={(e) => set('last_name', e.target.value)} /></Field>
        <Field label="Date of birth"><input type="date" className="input" value={v.date_of_birth ?? ''} onChange={(e) => set('date_of_birth', e.target.value || null)} /></Field>
        <Field label="School year">
          <select className="input" value={v.school_year ?? ''} onChange={(e) => set('school_year', e.target.value)}>
            <option value="">Choose…</option>{SCHOOL_YEARS.map((y) => <option key={y}>{y}</option>)}
          </select>
        </Field>
        <Field label="Current school"><input className="input" value={v.current_school ?? ''} onChange={(e) => set('current_school', e.target.value)} /></Field>
        <Field label="Target schools"><input className="input" value={v.target_schools ?? ''} onChange={(e) => set('target_schools', e.target.value)} /></Field>
        <Field label="Exam date"><input type="date" className="input" value={v.exam_date ?? ''} onChange={(e) => set('exam_date', e.target.value || null)} /></Field>
      </div>
      <fieldset>
        <legend className="label">Exam boards</legend>
        <div className="flex flex-wrap gap-2">
          {EXAM_BOARDS.map((b) => {
            const on = v.exam_boards.includes(b)
            return (
              <button type="button" key={b} onClick={() => set('exam_boards', on ? v.exam_boards.filter((x) => x !== b) : [...v.exam_boards, b])}
                className={`rounded-full border px-3 py-1.5 text-sm ${on ? 'border-primary bg-primary-soft text-primary' : 'border-line text-muted'}`}>{b}</button>
            )
          })}
        </div>
      </fieldset>
      <Field label="Learning notes" hint="Anything that helps us teach your child well"><textarea rows={3} className="input" value={v.learning_notes ?? ''} onChange={(e) => set('learning_notes', e.target.value)} /></Field>
      <Field label="Additional needs (SEN)"><textarea rows={2} className="input" value={v.sen_notes ?? ''} onChange={(e) => set('sen_notes', e.target.value)} /></Field>
      <label className="flex items-center gap-3 text-sm"><input type="checkbox" className="h-4 w-4" checked={v.photo_consent} onChange={(e) => set('photo_consent', e.target.checked)} /> I consent to photos of my child’s work being shared with the family</label>
      <div className="flex gap-3">
        <button className="btn-primary" disabled={busy}>{busy ? 'Saving…' : submitLabel}</button>
        {onCancel && <button type="button" className="btn-outline" onClick={onCancel}>Cancel</button>}
      </div>
    </form>
  )
}

export function LoginForm({ hasLogin, onSubmit }: { hasLogin: boolean; onSubmit: (username: string, password: string) => Promise<string | null> }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const err = await onSubmit(username, password)
    setMsg(err ? { ok: false, text: err } : { ok: true, text: hasLogin ? 'Password updated.' : `Login created. Your child signs in at /student-login with username “${username.toLowerCase()}”.` })
    if (!err) setPassword('')
  }
  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      {msg && <p className={`rounded-lg px-3 py-2 text-sm ${msg.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>{msg.text}</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        {!hasLogin && <Field label="Username"><input className="input" required value={username} onChange={(e) => setUsername(e.target.value)} autoCapitalize="none" placeholder="for example aisha.k" /></Field>}
        <Field label={hasLogin ? 'New password' : 'Password'}><input className="input" type="text" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
      </div>
      <button className="btn-outline self-start">{hasLogin ? 'Reset password' : 'Create login'}</button>
    </form>
  )
}
