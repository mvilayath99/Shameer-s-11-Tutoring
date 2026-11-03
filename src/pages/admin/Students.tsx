import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Search } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { EXAM_BOARDS, SCHOOL_YEARS, fullName, type Family, type Student } from '../../lib/families'
import { PageHeader } from '../../components/PortalLayout'
import { useModuleName } from '../../components/ModuleGate'
import { StudentForm, type StudentInput } from '../../components/StudentForm'
import { Badge, Field, Notice, Table, Tabs, Td } from '../../components/ui'

export default function Students() {
  const title = useModuleName('students', 'Students')
  const [tab, setTab] = useState<'students' | 'families'>('students')
  const [students, setStudents] = useState<Student[]>([])
  const [families, setFamilies] = useState<Family[]>([])
  const [q, setQ] = useState('')
  const [year, setYear] = useState('')
  const [board, setBoard] = useState('')
  const [showInactive, setShowInactive] = useState(false)
  const [adding, setAdding] = useState(false)
  const [newFamily, setNewFamily] = useState('')
  const [familyId, setFamilyId] = useState('')
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const [{ data: s }, { data: f }] = await Promise.all([
      supabase.from('students').select('*').order('first_name'),
      supabase.from('families').select('*').order('name'),
    ])
    setStudents((s ?? []) as Student[]); setFamilies((f ?? []) as Family[])
  }, [])
  useEffect(() => { load() }, [load])

  const famName = useMemo(() => Object.fromEntries(families.map((f) => [f.id, f.name])), [families])
  const shown = students.filter((s) =>
    (showInactive || s.active) && (!year || s.school_year === year) && (!board || s.exam_boards.includes(board)) &&
    (!q || `${fullName(s)} ${famName[s.family_id] ?? ''} ${s.current_school ?? ''}`.toLowerCase().includes(q.toLowerCase())))

  const add = async (v: StudentInput) => {
    setError(null)
    let fid = familyId
    if (!fid) {
      if (!newFamily.trim()) { setError('Choose a family or type a new family name.'); return }
      const { data, error } = await supabase.from('families').insert({ name: newFamily.trim() }).select('id').single()
      if (error) { setError(error.message); return }
      fid = data.id
    }
    const { error } = await supabase.from('students').insert({ ...v, family_id: fid })
    if (error) setError(error.message); else { setAdding(false); setNewFamily(''); setFamilyId(''); load() }
  }

  return (
    <>
      <PageHeader title={title} action={!adding && <button className="btn-primary" onClick={() => setAdding(true)}><Plus className="h-4 w-4" /> Add student</button>} />
      {error && <div className="mb-4"><Notice kind="error">{error}</Notice></div>}
      {adding && (
        <div className="card mb-6 flex flex-col gap-4">
          <h2 className="font-semibold">Add a student</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Existing family">
              <select className="input" value={familyId} onChange={(e) => setFamilyId(e.target.value)}>
                <option value="">New family…</option>{families.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
              </select>
            </Field>
            {!familyId && <Field label="New family name"><input className="input" value={newFamily} onChange={(e) => setNewFamily(e.target.value)} placeholder="For example Khan family" /></Field>}
          </div>
          <StudentForm onSubmit={add} onCancel={() => setAdding(false)} submitLabel="Add student" />
        </div>
      )}
      <Tabs tabs={[{ key: 'students', label: `Students (${students.filter((s) => s.active).length})` }, { key: 'families', label: `Families (${families.length})` }]} value={tab} onChange={setTab} />
      {tab === 'students' ? (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <div className="relative w-full max-w-xs"><Search className="absolute left-3 top-3 h-4 w-4 text-muted" /><input className="input pl-9" placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} /></div>
            <select className="input w-auto" value={year} onChange={(e) => setYear(e.target.value)}><option value="">All years</option>{SCHOOL_YEARS.map((y) => <option key={y}>{y}</option>)}</select>
            <select className="input w-auto" value={board} onChange={(e) => setBoard(e.target.value)}><option value="">All boards</option>{EXAM_BOARDS.map((y) => <option key={y}>{y}</option>)}</select>
            <label className="flex items-center gap-2 text-sm text-muted"><input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} /> Show inactive</label>
          </div>
          <Table head={['Student', 'Family', 'Year', 'School', 'Exam boards', 'Login']} empty="No students match.">
            {shown.map((s) => (
              <tr key={s.id} className="hover:bg-secondary">
                <Td><Link to={`/admin/students/${s.id}`} className="font-medium text-primary hover:underline">{fullName(s)}</Link>{!s.active && <> <Badge>Inactive</Badge></>}</Td>
                <Td><Link to={`/admin/families/${s.family_id}`} className="hover:underline">{famName[s.family_id]}</Link></Td>
                <Td>{s.school_year}</Td>
                <Td className="text-muted">{s.current_school}</Td>
                <Td><div className="flex flex-wrap gap-1">{s.exam_boards.map((b) => <Badge key={b} tone="blue">{b}</Badge>)}</div></Td>
                <Td>{s.user_id ? <Badge tone="green">Yes</Badge> : <span className="text-muted">No</span>}</Td>
              </tr>
            ))}
          </Table>
        </>
      ) : (
        <Table head={['Family', 'Billing contact', 'Email', 'Children']}>
          {families.map((f) => (
            <tr key={f.id} className="hover:bg-secondary">
              <Td><Link to={`/admin/families/${f.id}`} className="font-medium text-primary hover:underline">{f.name}</Link></Td>
              <Td>{f.billing_name}</Td>
              <Td className="text-muted">{f.billing_email}</Td>
              <Td>{students.filter((s) => s.family_id === f.id).map((s) => s.first_name).join(', ')}</Td>
            </tr>
          ))}
        </Table>
      )}
    </>
  )
}
