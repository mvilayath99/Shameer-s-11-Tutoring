import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../../lib/supabase'
import { useAuth } from '../../../lib/AuthProvider'
import { Badge, Notice, Table, Td } from '../../../components/ui'
import { ROLE_LABELS, type AppRole } from '../../../lib/types'

interface Row { id: string; full_name: string | null; email: string | null; username: string | null; active: boolean; roles: AppRole[] }
const ASSIGNABLE: AppRole[] = ['super_admin', 'tutor', 'assistant_tutor', 'parent', 'student']

export default function Users() {
  const { session } = useAuth()
  const [rows, setRows] = useState<Row[]>([])
  const [msg, setMsg] = useState<{ kind: 'success' | 'error' | 'info'; text: string } | null>(null)
  const [filter, setFilter] = useState('')

  const load = useCallback(async () => {
    const [{ data: p }, { data: r }] = await Promise.all([
      supabase.from('profiles').select('id, full_name, email, username, active').order('created_at'),
      supabase.from('user_roles').select('user_id, role'),
    ])
    setRows((p ?? []).map((x) => ({ ...x, roles: (r ?? []).filter((y) => y.user_id === x.id).map((y) => y.role as AppRole) })))
  }, [])
  useEffect(() => { load() }, [load])

  const setRole = async (u: Row, role: AppRole) => {
    setMsg(null)
    // Add the new role first so the "last super admin" guard sees a valid state, then remove the others.
    const { error: e1 } = await supabase.from('user_roles').upsert({ user_id: u.id, role }, { onConflict: 'user_id,role' })
    const { error: e2 } = e1 ? { error: null } : await supabase.from('user_roles').delete().eq('user_id', u.id).neq('role', role)
    const err = e1 ?? e2
    if (err) setMsg({ kind: 'error', text: err.message }); else setMsg({ kind: 'success', text: `${u.full_name || u.email} is now ${ROLE_LABELS[role]}.` })
    load()
  }

  const toggleActive = async (u: Row) => {
    const { error } = await supabase.from('profiles').update({ active: !u.active }).eq('id', u.id)
    if (error) setMsg({ kind: 'error', text: error.message })
    load()
  }

  const inviteLink = `${window.location.origin}/signup`
  const shown = rows.filter((r) => !filter || r.roles.includes(filter as AppRole))

  return (
    <div className="flex flex-col gap-6">
      <Notice>
        <strong>Adding a tutor or assistant tutor:</strong> ask them to create an account at <span className="font-mono">{inviteLink}</span>, then change their role below.
      </Notice>
      {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
      <div className="flex items-center gap-3">
        <select className="input max-w-xs" value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="">All roles</option>
          {ASSIGNABLE.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
        </select>
        <span className="text-sm text-muted">{shown.length} accounts</span>
      </div>
      <Table head={['Name', 'Email / username', 'Role', 'Status', '']}>
        {shown.map((u) => (
          <tr key={u.id}>
            <Td className="font-medium">{u.full_name || '—'}</Td>
            <Td className="text-muted">{u.email?.endsWith('students.shameers11plus.app') ? u.username : u.email}</Td>
            <Td>
              <select className="input py-1.5" value={u.roles[0] ?? ''} onChange={(e) => setRole(u, e.target.value as AppRole)} disabled={u.roles.includes('student')}>
                {!u.roles.length && <option value="">No role</option>}
                {ASSIGNABLE.filter((r) => r !== 'student' || u.roles.includes('student')).map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
              </select>
            </Td>
            <Td>{u.active ? <Badge tone="green">Active</Badge> : <Badge>Deactivated</Badge>}</Td>
            <Td className="text-right">
              {u.id !== session?.user.id && (
                <button className="text-sm text-primary hover:underline" onClick={() => toggleActive(u)}>{u.active ? 'Deactivate' : 'Reactivate'}</button>
              )}
            </Td>
          </tr>
        ))}
      </Table>
    </div>
  )
}
