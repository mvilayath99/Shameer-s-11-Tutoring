import { useEffect, useState } from 'react'
import { supabase } from '../../../lib/supabase'
import { Table, Td } from '../../../components/ui'

interface Row { id: number; at: string; actor: string | null; table_name: string; row_key: string | null; action: string }
const TABLES: Record<string, string> = {
  site_settings: 'Branding', modules: 'Modules', user_roles: 'Roles', site_content: 'Website content', integrations: 'Integrations',
}

export default function Audit() {
  const [rows, setRows] = useState<Row[]>([])
  const [names, setNames] = useState<Record<string, string>>({})
  useEffect(() => {
    supabase.from('audit_log').select('id, at, actor, table_name, row_key, action').order('at', { ascending: false }).limit(200).then(async ({ data }) => {
      setRows(data ?? [])
      const ids = [...new Set((data ?? []).map((r) => r.actor).filter(Boolean))] as string[]
      if (ids.length) {
        const { data: p } = await supabase.from('profiles').select('id, full_name, email').in('id', ids)
        setNames(Object.fromEntries((p ?? []).map((x) => [x.id, x.full_name || x.email || ''])))
      }
    })
  }, [])
  return (
    <Table head={['When', 'Who', 'Area', 'Change', 'Item']} empty="No changes recorded yet.">
      {rows.map((r) => (
        <tr key={r.id}>
          <Td className="whitespace-nowrap text-muted">{new Date(r.at).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}</Td>
          <Td>{(r.actor && names[r.actor]) || 'System'}</Td>
          <Td>{TABLES[r.table_name] ?? r.table_name}</Td>
          <Td className="capitalize">{r.action}</Td>
          <Td className="font-mono text-xs text-muted">{r.row_key}</Td>
        </tr>
      ))}
    </Table>
  )
}
