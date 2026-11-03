import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { fullName, type Family, type Student } from '../../lib/families'
import { PageHeader } from '../../components/PortalLayout'
import { Loading } from '../../components/RequirePortal'
import { Field, Notice } from '../../components/ui'

export default function FamilyDetail() {
  const { id } = useParams()
  const [f, setF] = useState<Family | null>(null)
  const [kids, setKids] = useState<Student[]>([])
  const [parents, setParents] = useState<{ id: string; full_name: string | null; email: string | null }[]>([])
  const [notes, setNotes] = useState('')
  const [msg, setMsg] = useState<string | null>(null)

  const load = useCallback(async () => {
    const [{ data: fam }, { data: s }, { data: m }, { data: n }] = await Promise.all([
      supabase.from('families').select('*').eq('id', id).maybeSingle(),
      supabase.from('students').select('*').eq('family_id', id),
      supabase.from('family_members').select('user_id').eq('family_id', id),
      supabase.from('family_private').select('staff_notes').eq('family_id', id).maybeSingle(),
    ])
    setF(fam as Family | null); setKids((s ?? []) as Student[]); setNotes(n?.staff_notes ?? '')
    const ids = (m ?? []).map((x) => x.user_id)
    if (ids.length) { const { data: p } = await supabase.from('profiles').select('id, full_name, email').in('id', ids); setParents(p ?? []) } else setParents([])
  }, [id])
  useEffect(() => { load() }, [load])
  if (!f) return <Loading />

  const set = (k: keyof Family, v: string) => setF({ ...f, [k]: v })
  const save = async () => {
    const { name, billing_name, billing_email, phone, address } = f
    const [{ error: e1 }, { error: e2 }] = await Promise.all([
      supabase.from('families').update({ name, billing_name, billing_email, phone, address }).eq('id', f.id),
      supabase.from('family_private').upsert({ family_id: f.id, staff_notes: notes }),
    ])
    setMsg(e1?.message ?? e2?.message ?? 'Saved.')
  }

  return (
    <>
      <Link to="/admin/students" className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-ink"><ArrowLeft className="h-4 w-4" /> Students and families</Link>
      <PageHeader title={f.name} />
      {msg && <div className="mb-4"><Notice>{msg}</Notice></div>}
      <div className="grid gap-6 xl:grid-cols-[1fr_22rem]">
        <div className="card flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Family name"><input className="input" value={f.name} onChange={(e) => set('name', e.target.value)} /></Field>
            <Field label="Billing contact"><input className="input" value={f.billing_name ?? ''} onChange={(e) => set('billing_name', e.target.value)} /></Field>
            <Field label="Billing email" hint="A parent who signs up with this email is linked to the family automatically"><input className="input" type="email" value={f.billing_email ?? ''} onChange={(e) => set('billing_email', e.target.value)} /></Field>
            <Field label="Phone"><input className="input" value={f.phone ?? ''} onChange={(e) => set('phone', e.target.value)} /></Field>
          </div>
          <Field label="Address"><input className="input" value={f.address ?? ''} onChange={(e) => set('address', e.target.value)} /></Field>
          <Field label="Staff notes" hint="Private to staff"><textarea rows={4} className="input" value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
          <button className="btn-primary self-start" onClick={save}>Save</button>
        </div>
        <div className="flex flex-col gap-6">
          <div className="card text-sm">
            <h3 className="mb-3 font-semibold">Parents with an account</h3>
            {parents.length ? parents.map((p) => <p key={p.id}>{p.full_name} <span className="text-muted">{p.email}</span></p>)
              : <p className="text-muted">No parent account yet. Ask them to sign up at /signup with {f.billing_email || 'the billing email'}.</p>}
          </div>
          <div className="card text-sm">
            <h3 className="mb-3 font-semibold">Children</h3>
            {kids.map((k) => <Link key={k.id} to={`/admin/students/${k.id}`} className="block text-primary hover:underline">{fullName(k)}</Link>)}
          </div>
        </div>
      </div>
    </>
  )
}
