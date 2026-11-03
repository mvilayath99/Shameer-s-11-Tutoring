import { useCallback, useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { PageHeader } from '../../components/PortalLayout'
import { useModuleName } from '../../components/ModuleGate'
import { Badge, Field, Notice, Table, Td } from '../../components/ui'
import { formatDate } from '../../lib/format'

export type EnquiryStatus = 'new' | 'contacted' | 'assessment_booked' | 'enrolled' | 'not_proceeding'
export interface Enquiry {
  id: string; created_at: string; status: EnquiryStatus; parent_name: string; email: string; phone: string | null
  child_name: string; school_year: string | null; current_school: string | null; target_schools: string | null
  exam_board: string | null; preferred_format: string | null; preferred_delivery: string | null
  availability: string | null; message: string | null; staff_notes: string | null; converted_family_id: string | null
}

export const STATUS: Record<EnquiryStatus, { label: string; tone: 'blue' | 'amber' | 'green' | 'grey' | 'red' }> = {
  new: { label: 'New', tone: 'blue' },
  contacted: { label: 'Contacted', tone: 'amber' },
  assessment_booked: { label: 'Assessment booked', tone: 'amber' },
  enrolled: { label: 'Enrolled', tone: 'green' },
  not_proceeding: { label: 'Not proceeding', tone: 'grey' },
}

const DELIVERY: Record<string, string> = { online: 'Online', in_person: 'In person', either: 'Either' }

export default function Enquiries({ onConvert }: { onConvert?: (e: Enquiry) => Promise<string | null> }) {
  const title = useModuleName('enquiries', 'Enquiries')
  const [rows, setRows] = useState<Enquiry[]>([])
  const [filter, setFilter] = useState<EnquiryStatus | ''>('')
  const [open, setOpen] = useState<Enquiry | null>(null)
  const [msg, setMsg] = useState<{ kind: 'success' | 'error'; text: string } | null>(null)

  const load = useCallback(async () => {
    let q = supabase.from('enquiries').select('*').order('created_at', { ascending: false })
    if (filter) q = q.eq('status', filter)
    const { data } = await q
    setRows((data ?? []) as Enquiry[])
  }, [filter])
  useEffect(() => { load() }, [load])

  const save = async (e: Enquiry) => {
    const { error } = await supabase.from('enquiries').update({ status: e.status, staff_notes: e.staff_notes }).eq('id', e.id)
    setMsg(error ? { kind: 'error', text: error.message } : { kind: 'success', text: 'Enquiry updated.' })
    load()
  }

  const convert = async (e: Enquiry) => {
    if (!onConvert) return
    const err = await onConvert(e)
    setMsg(err ? { kind: 'error', text: err } : { kind: 'success', text: `${e.child_name} has been added as a student.` })
    setOpen(null); load()
  }

  return (
    <>
      <PageHeader title={title} subtitle="Free assessment requests and enquiries from the website." />
      {msg && <div className="mb-4"><Notice kind={msg.kind}>{msg.text}</Notice></div>}
      <div className="mb-4 flex flex-wrap gap-2">
        {(['', 'new', 'contacted', 'assessment_booked', 'enrolled', 'not_proceeding'] as const).map((s) => (
          <button key={s} onClick={() => setFilter(s)} className={`rounded-full px-3 py-1.5 text-sm ${filter === s ? 'bg-primary text-white' : 'bg-white text-muted border border-line'}`}>
            {s ? STATUS[s].label : 'All'}
          </button>
        ))}
      </div>
      <Table head={['Received', 'Child', 'Parent', 'Year', 'Preference', 'Status']} empty="No enquiries yet.">
        {rows.map((e) => (
          <tr key={e.id} className="cursor-pointer hover:bg-secondary" onClick={() => setOpen(e)}>
            <Td className="whitespace-nowrap text-muted">{formatDate(e.created_at)}</Td>
            <Td className="font-medium">{e.child_name}</Td>
            <Td>{e.parent_name}<div className="text-xs text-muted">{e.email}</div></Td>
            <Td>{e.school_year}</Td>
            <Td className="text-muted">{e.preferred_format} · {DELIVERY[e.preferred_delivery ?? ''] ?? ''}</Td>
            <Td><Badge tone={STATUS[e.status].tone}>{STATUS[e.status].label}</Badge></Td>
          </tr>
        ))}
      </Table>

      {open && (
        <div className="fixed inset-0 z-30 flex justify-end bg-black/20" onClick={() => setOpen(null)}>
          <div className="h-full w-full max-w-lg overflow-y-auto bg-white p-6 shadow-xl" onClick={(ev) => ev.stopPropagation()}>
            <div className="mb-6 flex items-start justify-between">
              <div><h2 className="text-xl font-semibold">{open.child_name}</h2><p className="text-sm text-muted">Received {formatDate(open.created_at)}</p></div>
              <button onClick={() => setOpen(null)} aria-label="Close"><X className="h-5 w-5" /></button>
            </div>
            <dl className="grid grid-cols-2 gap-4 text-sm">
              {[
                ['Parent', open.parent_name], ['Email', open.email], ['Phone', open.phone], ['School year', open.school_year],
                ['Current school', open.current_school], ['Target schools', open.target_schools], ['Exam board', open.exam_board],
                ['Lesson type', open.preferred_format], ['Delivery', DELIVERY[open.preferred_delivery ?? '']], ['Availability', open.availability],
              ].map(([k, v]) => <div key={k}><dt className="text-muted">{k}</dt><dd className="font-medium">{v || '—'}</dd></div>)}
            </dl>
            {open.message && <div className="mt-4 rounded-lg bg-secondary p-4 text-sm">{open.message}</div>}
            <div className="mt-6 flex flex-col gap-4">
              <Field label="Status">
                <select className="input" value={open.status} onChange={(e) => setOpen({ ...open, status: e.target.value as EnquiryStatus })}>
                  {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </Field>
              <Field label="Staff notes" hint="Only visible to staff"><textarea rows={4} className="input" value={open.staff_notes ?? ''} onChange={(e) => setOpen({ ...open, staff_notes: e.target.value })} /></Field>
              <div className="flex flex-wrap gap-3">
                <button className="btn-primary" onClick={() => save(open)}>Save</button>
                {onConvert && !open.converted_family_id && <button className="btn-outline" onClick={() => convert(open)}>Convert to student</button>}
                {open.converted_family_id && <Badge tone="green">Converted</Badge>}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
