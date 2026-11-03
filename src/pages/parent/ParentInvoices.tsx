import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { formatDate, formatGBP } from '../../lib/format'
import { useMyFamily } from '../../lib/families'
import { INVOICE_STATUS_LABEL, INVOICE_STATUS_TONE, balance, isOverdue, periodLabel, type BillingSettings, type Invoice } from '../../lib/billing'
import { PageHeader } from '../../components/PortalLayout'
import { useModuleName } from '../../components/ModuleGate'
import { Loading } from '../../components/RequirePortal'
import { Badge, Table, Td } from '../../components/ui'

export default function ParentInvoices() {
  const title = useModuleName('invoices', 'Invoices')
  const { family, loading } = useMyFamily()
  const [rows, setRows] = useState<Invoice[]>([])
  const [billing, setBilling] = useState<BillingSettings | null>(null)

  useEffect(() => {
    if (!family) return
    Promise.all([
      supabase.from('invoices').select('*').eq('family_id', family.id).order('issue_date', { ascending: false }),
      supabase.from('billing_settings').select('*').eq('id', 1).maybeSingle(),
    ]).then(([{ data: i }, { data: b }]) => { setRows((i ?? []) as Invoice[]); setBilling(b as BillingSettings | null) })
  }, [family])

  if (loading) return <Loading />
  if (!family) return <><PageHeader title={title} /><div className="card text-sm text-muted">Set up your family details first, under Children.</div></>

  const live = rows.filter((i) => i.status !== 'void')
  const owed = live.reduce((a, i) => a + balance(i), 0)
  const overdue = live.filter(isOverdue)

  return (
    <>
      <PageHeader title={title} />
      <div className="mb-8 grid gap-4 sm:grid-cols-2">
        <div className="card">
          <p className="text-xs text-muted">Balance to pay</p>
          <p className="mt-1 text-2xl font-semibold text-primary">{formatGBP(owed)}</p>
          {overdue.length > 0 && <p className="mt-1 text-sm text-red-700">{overdue.length} invoice{overdue.length === 1 ? ' is' : 's are'} past the due date.</p>}
        </div>
        {billing?.bank_details && owed > 0 && (
          <div className="card text-sm">
            <p className="mb-1 font-medium">How to pay</p>
            <p className="whitespace-pre-line text-muted">{billing.bank_details}</p>
            <p className="mt-2 text-muted">Please use the invoice number as your reference.</p>
          </div>
        )}
      </div>
      <Table head={['Invoice', 'For', 'Date', 'Due', 'Total', 'To pay', 'Status']} empty="No invoices yet.">
        {rows.map((i) => (
          <tr key={i.id}>
            <Td className="font-medium"><Link to={`/invoice/${i.id}`} className="text-primary hover:underline">{i.number}</Link></Td>
            <Td className="text-muted">{periodLabel(i)}</Td>
            <Td className="whitespace-nowrap text-muted">{formatDate(i.issue_date)}</Td>
            <Td className="whitespace-nowrap text-muted">{i.due_date ? formatDate(i.due_date) : '—'}</Td>
            <Td>{formatGBP(Number(i.total))}</Td>
            <Td>{i.status === 'void' ? '—' : formatGBP(balance(i))}</Td>
            <Td><span className="flex gap-1"><Badge tone={INVOICE_STATUS_TONE[i.status]}>{INVOICE_STATUS_LABEL[i.status]}</Badge>{isOverdue(i) && <Badge tone="red">Overdue</Badge>}</span></Td>
          </tr>
        ))}
      </Table>
    </>
  )
}
