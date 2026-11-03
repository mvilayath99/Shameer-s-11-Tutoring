import { useEffect, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { ArrowLeft, Printer } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthProvider'
import { useSettings } from '../lib/SettingsProvider'
import { isStaff } from '../lib/roles'
import { formatDate, formatGBP } from '../lib/format'
import { INVOICE_STATUS_LABEL, balance, periodLabel, type BillingSettings, type Invoice, type InvoiceLine, type Payment, METHOD_LABEL } from '../lib/billing'
import type { Family } from '../lib/families'
import { Loading } from '../components/RequirePortal'

/** A clean, printable invoice. "Print or save as PDF" uses the browser's own print dialog. */
export default function InvoiceView() {
  const { id } = useParams()
  const { session, roles, loading } = useAuth()
  const { settings } = useSettings()
  const [inv, setInv] = useState<Invoice | null | undefined>(undefined)
  const [lines, setLines] = useState<InvoiceLine[]>([])
  const [payments, setPayments] = useState<Payment[]>([])
  const [family, setFamily] = useState<Family | null>(null)
  const [billing, setBilling] = useState<BillingSettings | null>(null)

  useEffect(() => {
    if (!session || !id) return
    (async () => {
      const { data } = await supabase.from('invoices').select('*').eq('id', id).maybeSingle()
      setInv(data as Invoice | null)
      if (!data) return
      const [{ data: l }, { data: p }, { data: f }, { data: b }] = await Promise.all([
        supabase.from('invoice_lines').select('*').eq('invoice_id', id).order('sort_order').order('description'),
        supabase.from('payments').select('*').eq('invoice_id', id).order('paid_on'),
        supabase.from('families').select('*').eq('id', data.family_id).maybeSingle(),
        supabase.from('billing_settings').select('*').eq('id', 1).maybeSingle(),
      ])
      setLines((l ?? []) as InvoiceLine[]); setPayments((p ?? []) as Payment[])
      setFamily(f as Family | null); setBilling(b as BillingSettings | null)
    })()
  }, [session, id])

  if (loading) return <Loading />
  if (!session) return <Navigate to="/login" replace />
  if (inv === undefined) return <Loading />
  const back = isStaff(roles) ? '/admin/invoices' : '/parent/invoices'
  if (!inv) return <div className="container-page py-16 text-center text-sm text-muted">Invoice not found. <Link className="text-primary underline" to={back}>Back</Link></div>

  const due = balance(inv)
  return (
    <div className="min-h-screen bg-secondary py-8 print:bg-white print:py-0">
      <div className="mx-auto mb-4 flex max-w-3xl items-center justify-between px-4 print:hidden">
        <Link to={back} className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink"><ArrowLeft className="h-4 w-4" /> Back to invoices</Link>
        <button className="btn-primary" onClick={() => window.print()}><Printer className="h-4 w-4" /> Print or save as PDF</button>
      </div>

      <article className="mx-auto max-w-3xl bg-white p-8 shadow-sm sm:p-12 print:max-w-none print:p-0 print:shadow-none">
        <header className="flex flex-col justify-between gap-6 border-b border-line pb-8 sm:flex-row">
          <div>
            {settings.logo_url
              ? <img src={settings.logo_url} alt={settings.business_name} className="mb-3 h-12 w-auto" />
              : <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-lg bg-primary text-sm font-bold text-white">11+</div>}
            <p className="font-semibold">{settings.business_name}</p>
            <p className="text-sm text-muted">{[settings.contact_email, settings.contact_phone].filter(Boolean).join(' · ')}</p>
          </div>
          <div className="sm:text-right">
            <h1 className="text-2xl font-semibold text-primary">{inv.status === 'void' ? 'Cancelled invoice' : 'Invoice'}</h1>
            <dl className="mt-2 grid grid-cols-[auto_auto] gap-x-4 gap-y-1 text-sm sm:justify-end">
              <dt className="text-muted">Number</dt><dd className="font-medium">{inv.number}</dd>
              <dt className="text-muted">Date</dt><dd>{formatDate(inv.issue_date)}</dd>
              {inv.due_date && <><dt className="text-muted">Due</dt><dd>{formatDate(inv.due_date)}</dd></>}
              {inv.period_start && <><dt className="text-muted">For</dt><dd>{periodLabel(inv)}</dd></>}
            </dl>
          </div>
        </header>

        <section className="py-6 text-sm">
          <p className="text-xs uppercase tracking-wide text-muted">Bill to</p>
          <p className="mt-1 font-medium">{family?.billing_name || family?.name}</p>
          {family?.address && <p className="whitespace-pre-line text-muted">{family.address}</p>}
          {family?.billing_email && <p className="text-muted">{family.billing_email}</p>}
        </section>

        <table className="w-full text-sm">
          <thead className="border-y border-line text-left text-xs uppercase tracking-wide text-muted">
            <tr><th className="py-2.5 font-medium">Description</th><th className="py-2.5 text-right font-medium">Qty</th><th className="py-2.5 text-right font-medium">Price</th><th className="py-2.5 text-right font-medium">Amount</th></tr>
          </thead>
          <tbody className="divide-y divide-line">
            {lines.map((l) => (
              <tr key={l.id} className={l.line_type === 'discount' ? 'text-green-700' : ''}>
                <td className="py-2.5 pr-4">{l.description}</td>
                <td className="py-2.5 text-right">{Number(l.quantity)}</td>
                <td className="py-2.5 text-right">{formatGBP(Number(l.unit_price))}</td>
                <td className="py-2.5 text-right">{formatGBP(Number(l.amount))}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mt-6 flex justify-end">
          <dl className="grid w-full max-w-xs grid-cols-2 gap-y-1.5 text-sm">
            <dt className="text-muted">Subtotal</dt><dd className="text-right">{formatGBP(Number(inv.subtotal))}</dd>
            {Number(inv.discount_total) > 0 && <><dt className="text-muted">Discounts</dt><dd className="text-right text-green-700">−{formatGBP(Number(inv.discount_total))}</dd></>}
            <dt className="border-t border-line pt-2 font-semibold">Total</dt><dd className="border-t border-line pt-2 text-right font-semibold">{formatGBP(Number(inv.total))}</dd>
            {Number(inv.amount_paid) > 0 && <><dt className="text-muted">Paid</dt><dd className="text-right">{formatGBP(Number(inv.amount_paid))}</dd></>}
            {inv.status !== 'void' && <><dt className="font-semibold text-primary">Balance due</dt><dd className="text-right font-semibold text-primary">{formatGBP(due)}</dd></>}
          </dl>
        </div>

        {payments.length > 0 && (
          <section className="mt-8 text-sm">
            <p className="mb-2 text-xs uppercase tracking-wide text-muted">Payments received</p>
            {payments.map((p) => <p key={p.id}>{formatDate(p.paid_on)}: {formatGBP(Number(p.amount))} ({METHOD_LABEL[p.method]})</p>)}
          </section>
        )}

        {inv.notes && <p className="mt-8 whitespace-pre-line text-sm">{inv.notes}</p>}

        {inv.status !== 'void' && due > 0 && billing?.bank_details && (
          <section className="mt-8 rounded-lg bg-secondary p-5 text-sm print:border print:border-line print:bg-white">
            <p className="mb-2 font-medium">How to pay</p>
            <p className="whitespace-pre-line text-muted">{billing.bank_details}</p>
            <p className="mt-2 text-muted">Please use <span className="font-medium text-ink">{inv.number}</span> as your payment reference.</p>
          </section>
        )}

        {billing?.invoice_footer && <footer className="mt-10 border-t border-line pt-6 text-center text-sm text-muted">{billing.invoice_footer}</footer>}
        <p className="mt-4 text-center text-xs text-muted print:hidden">Status: {INVOICE_STATUS_LABEL[inv.status]}</p>
      </article>
    </div>
  )
}
