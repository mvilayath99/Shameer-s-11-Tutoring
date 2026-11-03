import { useEffect, useState } from 'react'
import { FileText } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { openFile, type Resource } from '../../lib/homework'
import { PageHeader } from '../../components/PortalLayout'
import { useModuleName } from '../../components/ModuleGate'

export default function StudentResources() {
  const title = useModuleName('resources', 'Resources')
  const [rows, setRows] = useState<Resource[]>([])
  useEffect(() => { supabase.from('resources').select('*').order('created_at', { ascending: false }).then(({ data }) => setRows((data ?? []) as Resource[])) }, [])
  return (
    <>
      <PageHeader title={title} subtitle="Worksheets and notes your tutor has shared with you." />
      {!rows.length && <div className="card text-sm text-muted">Nothing shared yet.</div>}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map((r) => (
          <button key={r.id} onClick={() => openFile('resources', r.path)} className="card flex items-start gap-3 text-left hover:border-primary">
            <FileText className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
            <span><span className="block font-medium">{r.title}</span><span className="text-xs text-muted">{[r.subject, r.topic].filter(Boolean).join(' · ')}</span></span>
          </button>
        ))}
      </div>
    </>
  )
}
