import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Printer, Trash2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { formatDate, formatGBP } from '../../lib/format'
import {
  INVOICE_STATUS_LABEL, INVOICE_STATUS_TONE, METHOD_LABEL, balance, isOverdue, periodLabel, today,
  type Invoice, type InvoiceLine, type Payment, type PaymentMethod,
} from '../../lib/billing'
import { Modal } from '../../components/Modal'
import { Badge, Field, Notice } from '../../components/ui'

/** Review and edit one invoice: lines while it's a draft, then send, record payments or cancel. */
export function InvoiceEditor({ invoiceId, familyName, onClose, onChanged }: {
  invoiceId: string; familyName: string; onClose: () => void; onChanged: () => void
}) {
  const [inv, setInv] = useState<Invoice | null>(null)
  const [lines, setLines] = useState<InvoiceLine[]>([])
  const [payments, setPayments] = useState<Payment[]>([])
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [newLine, setNewLine] = useState({ description: '', quantity: '1', unit_price: '' })
  const [pay, setPay] = useState({ amount: '', paid_on: today(), method: 'bank_transfer' as PaymentMethod, reference: '' })

  const load = useCallback(async () => {
    const [{ data: i }, { data: l }, { data: p }] = await Promise.all([
      supabase.from('invoices').select('*').eq('id', invoiceId).maybeSingle(),
      supabase.from('invoice_lines').select('*').eq('invoice_id', invoiceId).order('sort_order').order('description'),
      supabase.from('payments').select('*').eq('invoice_id', invoiceId).order('paid_on'),
    ])
    setInv(i as Invoice | null); setNotes(i?.notes ?? '')
    setLines((l ?? []) as InvoiceLine[]); setPayments((p ?? []) as Payment[])
  }, [invoiceId])
  useEffect(() => { load() }, [load])

  const run = async (fn: () => PromiseLike<{ error: { message: string } | null }>) => {
    setError(null)
    const { error } = await fn()
    if (error) setError(error.message)
    await load(); onChanged()
    return !error
  }

  if (!inv) return <Modal title="Invoice" onClose={onClose}><p className="text-sm text-muted">Loading…</p></Modal>
  const draft = inv.status === 'draft'
  const open = inv.status === 'sent' || inv.status === 'part_paid'

  const updateLine = (l: InvoiceLine, patch: Partial<InvoiceLine>) =>
    run(() => supabase.from('invoice_lines').update(patch).eq('id', l.id))
  const addLine = async (e: FormEvent) => {
    e.preventDefault()
    if (!newLine.description || newLine.unit_price === '') return
    const ok = await run(() => supabase.from('invoice_lines').insert({
      invoice_id: inv.id, line_type: 'extra', description: newLine.description,
      quantity: Number(newLine.quantity) || 1, unit_price: Number(newLine.unit_price), sort_order: 500,
    }))
    if (ok) setNewLine({ description: '', quantity: '1', unit_price: '' })
  }
  const recordPayment = async (e: FormEvent) => {
    e.preventDefault()
    if (!Number(pay.amount)) return
    const ok = await run(() => supabase.from('payments').insert({
      invoice_id: inv.id, amount: Number(pay.amount), paid_on: pay.paid_on, method: pay.method, reference: pay.reference || null,
    }))
    if (ok) setPay({ ...pay, amount: '', reference: '' })
  }
  const missingPrice = lines.some((l) => l.description.includes('PRICE NOT SET'))

  return (
    <Modal title={`Invoice ${inv.number}`} onClose={onClose} wide>
      <div className="mb-5 flex flex-wrap items-center gap-3 text-sm">
        <Badge tone={INVOICE_STATUS_TONE[inv.status]}>{INVOICE_STATUS_LABEL[inv.status]}</Badge>
        {isOverdue(inv) && <Badge tone="red">Overdue</Badge>}
        <span className="font-medium">{familyName}</span>
        {inv.period_start && <span className="text-muted">{periodLabel(inv)}</span>}
        <span className="text-muted">Due {inv.due_date ? formatDate(inv.due_date) : '—'}</span>
        <Link to={`/invoice/${inv.id}`} target="_blank" className="ml-auto inline-flex items-center gap-1.5 text-primary hover:underline">
          <Printer className="h-4 w-4" /> View or print
        </Link>
      </div>
      {error && <div className="mb-4"><Notice kind="error">{error}</Notice></div>}
      {draft && missingPrice && <div className="mb-4"><Notice kind="error">Some lessons have no price. Set a price on the line, or set up a price list under Prices and regenerate.</Notice></div>}

      <div className="overflow-x-auto rounded-lg border border-line">
        <table className="w-full text-sm">
          <thead className="bg-secondary text-left text-xs uppercase tracking-wide text-muted">
            <tr><th className="px-3 py-2 font-medium">Description</th><th className="w-20 px-3 py-2 text-right font-medium">Qty</th><th className="w-28 px-3 py-2 text-right font-medium">Price</th><th className="w-24 px-3 py-2 text-right font-medium">Amount</th>{draft && <th className="w-10" />}</tr>
          </thead>
          <tbody className="divide-y divide-line">
            {lines.map((l) => (
              <tr key={l.id} className={l.line_type === 'discount' ? 'text-green-700' : ''}>
                <td className="px-3 py-2">
                  {draft && l.line_type !== 'discount'
                    ? <input className="input py-1.5" defaultValue={l.description} onBlur={(e) => e.target.value !== l.description && updateLine(l, { description: e.target.value })} />
                    : l.description}
                </td>
                <td className="px-3 py-2 text-right">
                  {draft && l.line_type !== 'discount'
                    ? <input type="number" step="0.5" min="0" className="input py-1.5 text-right" defaultValue={l.quantity} onBlur={(e) => Number(e.target.value) !== Number(l.quantity) && updateLine(l, { quantity: Number(e.target.value) })} />
                    : Number(l.quantity)}
                </td>
                <td className="px-3 py-2 text-right">
                  {draft && l.line_type !== 'discount'
                    ? <input type="number" step="0.01" className="input py-1.5 text-right" defaultValue={l.unit_price} onBlur={(e) => Number(e.target.value) !== Number(l.unit_price) && updateLine(l, { unit_price: Number(e.target.value) })} />
                    : formatGBP(Number(l.unit_price))}
                </td>
                <td className="px-3 py-2 text-right">{formatGBP(Number(l.amount))}</td>
                {draft && <td className="px-2 text-right">
                  <button aria-label="Remove line" className="text-muted hover:text-red-600" onClick={() => run(() => supabase.from('invoice_lines').delete().eq('id', l.id))}><Trash2 className="h-4 w-4" /></button>
                </td>}
              </tr>
            ))}
            {!lines.length && <tr><td colSpan={5} className="px-3 py-6 text-center text-muted">No lines yet.</td></tr>}
          </tbody>
        </table>
      </div>

      {draft && (
        <form onSubmit={addLine} className="mt-3 grid gap-2 sm:grid-cols-[1fr_5rem_7rem_auto]">
          <input className="input" placeholder="Add a line, e.g. Mock exam paper" value={newLine.description} onChange={(e) => setNewLine({ ...newLine, description: e.target.value })} />
          <input className="input" type="number" min="0" step="0.5" value={newLine.quantity} onChange={(e) => setNewLine({ ...newLine, quantity: e.target.value })} aria-label="Quantity" />
          <input className="input" type="number" step="0.01" placeholder="£" value={newLine.unit_price} onChange={(e) => setNewLine({ ...newLine, unit_price: e.target.value })} aria-label="Price" />
          <button className="btn-outline"><Plus className="h-4 w-4" /> Add</button>
        </form>
      )}

      <dl className="ml-auto mt-5 grid max-w-xs grid-cols-2 gap-y-1 text-sm">
        <dt className="text-muted">Subtotal</dt><dd className="text-right">{formatGBP(Number(inv.subtotal))}</dd>
        <dt className="text-muted">Discounts</dt><dd className="text-right">−{formatGBP(Number(inv.discount_total))}</dd>
        <dt className="font-semibold">Total</dt><dd className="text-right font-semibold">{formatGBP(Number(inv.total))}</dd>
        <dt className="text-muted">Paid</dt><dd className="text-right">{formatGBP(Number(inv.amount_paid))}</dd>
        <dt className="font-semibold text-primary">Balance</dt><dd className="text-right font-semibold text-primary">{formatGBP(balance(inv))}</dd>
      </dl>

      <div className="mt-5">
        <Field label="Note on the invoice" hint="Shown to the family.">
          <textarea className="input" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)}
            onBlur={() => notes !== (inv.notes ?? '') && run(() => supabase.from('invoices').update({ notes: notes || null }).eq('id', inv.id))} />
        </Field>
      </div>

      {(open || inv.status === 'paid') && (
        <section className="mt-6 border-t border-line pt-5">
          <h3 className="mb-3 font-medium">Payments</h3>
          {payments.map((p) => (
            <div key={p.id} className="flex items-center justify-between py-1 text-sm">
              <span>{formatDate(p.paid_on)} · {METHOD_LABEL[p.method]}{p.reference ? ` · ${p.reference}` : ''}</span>
              <span className="flex items-center gap-3">{formatGBP(Number(p.amount))}
                <button aria-label="Remove payment" className="text-muted hover:text-red-600" onClick={() => confirm('Remove this payment?') && run(() => supabase.from('payments').delete().eq('id', p.id))}><Trash2 className="h-4 w-4" /></button>
              </span>
            </div>
          ))}
          {open && (
            <form onSubmit={recordPayment} className="mt-3 grid gap-2 sm:grid-cols-[7rem_9rem_9rem_1fr_auto]">
              <input className="input" type="number" step="0.01" placeholder="£" value={pay.amount} onChange={(e) => setPay({ ...pay, amount: e.target.value })} aria-label="Amount" />
              <input className="input" type="date" value={pay.paid_on} onChange={(e) => setPay({ ...pay, paid_on: e.target.value })} aria-label="Date paid" />
              <select className="input" value={pay.method} onChange={(e) => setPay({ ...pay, method: e.target.value as PaymentMethod })} aria-label="Method">
                {Object.entries(METHOD_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
              <input className="input" placeholder="Reference (optional)" value={pay.reference} onChange={(e) => setPay({ ...pay, reference: e.target.value })} />
              <button className="btn-primary">Record payment</button>
            </form>
          )}
          {open && <button className="mt-2 text-sm text-primary hover:underline" onClick={() => setPay({ ...pay, amount: balance(inv).toFixed(2) })}>Fill in the full balance ({formatGBP(balance(inv))})</button>}
        </section>
      )}

      <div className="mt-6 flex flex-wrap justify-end gap-2 border-t border-line pt-5">
        {draft && <button className="btn-outline text-red-700" onClick={async () => { if (confirm('Delete this draft invoice? Its lessons can be invoiced again.')) { await run(() => supabase.from('invoices').delete().eq('id', inv.id)); onClose() } }}>Delete draft</button>}
        {draft && <button className="btn-outline" onClick={() => run(() => supabase.rpc('apply_discounts', { _invoice_id: inv.id, _on: inv.period_end ?? today() }))}>Recalculate discounts</button>}
        {open && <button className="btn-outline" onClick={() => confirm('Cancel this invoice? It stays on record as cancelled and its lessons can be invoiced again.') && run(() => supabase.from('invoices').update({ status: 'void' }).eq('id', inv.id))}>Cancel invoice</button>}
        {draft && <button className="btn-primary" disabled={!lines.length} onClick={() => run(() => supabase.rpc('send_invoice', { _invoice_id: inv.id }))}>Send to family</button>}
        {!draft && <button className="btn-outline" onClick={onClose}>Done</button>}
      </div>
      {draft && <p className="mt-2 text-right text-xs text-muted">Sending makes it visible in the parent portal. Email delivery is added in the email step.</p>}
    </Modal>
  )
}
