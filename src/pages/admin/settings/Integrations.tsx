import { useEffect, useState } from 'react'
import { CreditCard, Mail, MonitorSmartphone } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { Badge } from '../../../components/ui'

interface Row { key: string; name: string; description: string | null; status: string }
const ICONS: Record<string, typeof Mail> = { microsoft365: MonitorSmartphone, payments: CreditCard, email: Mail }

export default function Integrations() {
  const [rows, setRows] = useState<Row[]>([])
  useEffect(() => { supabase.from('integrations').select('key, name, description, status').then(({ data }) => setRows(data ?? [])) }, [])
  return (
    <div className="grid gap-4 md:grid-cols-3">
      {rows.map((r) => {
        const I = ICONS[r.key] ?? Mail
        return (
          <div key={r.key} className="card flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-soft text-primary"><I className="h-5 w-5" /></span>
              {r.status === 'connected' ? <Badge tone="green">Connected</Badge> : r.status === 'error' ? <Badge tone="red">Problem</Badge> : <Badge>Not connected</Badge>}
            </div>
            <h3 className="font-semibold">{r.name}</h3>
            <p className="text-sm text-muted">{r.description}</p>
            <button className="btn-outline mt-auto" disabled>Set up (coming soon)</button>
          </div>
        )
      })}
    </div>
  )
}
