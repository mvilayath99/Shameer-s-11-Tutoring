import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { STATUS_LABEL, STATUS_TONE, fmtDay, fmtTime, type Lesson } from '../../lib/lessons'
import type { Student } from '../../lib/families'
import { Badge, Field, Table, Td } from '../../components/ui'
import { Link } from 'react-router-dom'
import { formatGBP } from '../../lib/format'
import { INVOICE_STATUS_LABEL, INVOICE_STATUS_TONE, type InvoiceStatus, type RateCard } from '../../lib/billing'
import { STUDENT_TABS } from './StudentProfile'
import { SUB_LABEL, SUB_TONE, percent, type SubStatus } from '../../lib/homework'

function StudentLessons({ s }: { s: Student }) {
  const [rows, setRows] = useState<Lesson[]>([])
  useEffect(() => {
    (async () => {
      const { data: gm } = await supabase.from('group_members').select('group_id').eq('student_id', s.id)
      const groups = (gm ?? []).map((g) => g.group_id)
      const filter = groups.length ? `student_id.eq.${s.id},group_id.in.(${groups.join(',')})` : `student_id.eq.${s.id}`
      const { data } = await supabase.from('lessons').select('*').or(filter).order('starts_at', { ascending: false }).limit(100)
      setRows((data ?? []) as Lesson[])
    })()
  }, [s.id])
  return (
    <Table head={['Date', 'Time', 'Type', 'Status', 'Feedback']} empty="No lessons yet.">
      {rows.map((l) => (
        <tr key={l.id}>
          <Td className="whitespace-nowrap">{fmtDay(l.starts_at)}</Td>
          <Td className="text-muted">{fmtTime(l.starts_at)}</Td>
          <Td>{l.kind === 'group' ? 'Group' : '1:1'}</Td>
          <Td><Badge tone={STATUS_TONE[l.status]}>{STATUS_LABEL[l.status]}</Badge></Td>
          <Td className="max-w-sm text-muted">{l.parent_feedback}</Td>
        </tr>
      ))}
    </Table>
  )
}

STUDENT_TABS.lessons = (s) => <StudentLessons s={s} />

function StudentHomework({ s }: { s: Student }) {
  const [rows, setRows] = useState<{ id: string; status: SubStatus; score: number | null; total: number | null; homework: { title: string; due_at: string | null } | null }[]>([])
  useEffect(() => {
    supabase.from('homework_submissions').select('id, status, score, total, homework(title, due_at)').eq('student_id', s.id)
      .then(({ data }) => setRows((data ?? []) as unknown as typeof rows))
  }, [s.id])
  return (
    <Table head={['Homework', 'Due', 'Status', 'Score']} empty="No homework yet.">
      {rows.map((r) => (
        <tr key={r.id}>
          <Td className="font-medium">{r.homework?.title}</Td>
          <Td className="text-muted">{r.homework?.due_at ? fmtDay(r.homework.due_at) : '—'}</Td>
          <Td><Badge tone={SUB_TONE[r.status]}>{SUB_LABEL[r.status]}</Badge></Td>
          <Td>{r.status === 'marked' ? `${r.score}/${r.total}${percent(r) != null ? ` (${percent(r)}%)` : ''}` : ''}</Td>
        </tr>
      ))}
    </Table>
  )
}

STUDENT_TABS.homework = (s) => <StudentHomework s={s} />

function StudentInvoices({ s }: { s: Student }) {
  const [rates, setRates] = useState<RateCard[]>([])
  const [pricing, setPricing] = useState({ rate_card_id: '', group_rate_card_id: '', custom_price: '' })
  const [lines, setLines] = useState<{ id: string; description: string; amount: number; invoices: { id: string; number: string; status: InvoiceStatus } | null }[]>([])
  const [saved, setSaved] = useState<string | null>(null)
  useEffect(() => {
    Promise.all([
      supabase.from('rate_cards').select('*').eq('active', true).order('name'),
      supabase.from('students').select('rate_card_id, group_rate_card_id, custom_price').eq('id', s.id).maybeSingle(),
      supabase.from('invoice_lines').select('id, description, amount, invoices(id, number, status)').eq('student_id', s.id).order('id').limit(200),
    ]).then(([{ data: r }, { data: p }, { data: l }]) => {
      setRates((r ?? []) as RateCard[])
      setPricing({ rate_card_id: p?.rate_card_id ?? '', group_rate_card_id: p?.group_rate_card_id ?? '', custom_price: p?.custom_price != null ? String(p.custom_price) : '' })
      setLines((l ?? []) as unknown as typeof lines)
    })
  }, [s.id])
  const save = async () => {
    const { error } = await supabase.from('students').update({
      rate_card_id: pricing.rate_card_id || null, group_rate_card_id: pricing.group_rate_card_id || null,
      custom_price: pricing.custom_price === '' ? null : Number(pricing.custom_price),
    }).eq('id', s.id)
    setSaved(error ? error.message : 'Saved.')
  }
  return (
    <div className="space-y-6">
      <div className="card space-y-4">
        <h3 className="font-semibold">Pricing for {s.first_name}</h3>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="1:1 lesson price" hint="Leave on automatic to use the closest match from the price list.">
            <select className="input" value={pricing.rate_card_id} onChange={(e) => setPricing({ ...pricing, rate_card_id: e.target.value })}>
              <option value="">Automatic</option>{rates.map((r) => <option key={r.id} value={r.id}>{r.name} ({formatGBP(Number(r.price))})</option>)}
            </select>
          </Field>
          <Field label="Group lesson price">
            <select className="input" value={pricing.group_rate_card_id} onChange={(e) => setPricing({ ...pricing, group_rate_card_id: e.target.value })}>
              <option value="">Automatic</option>{rates.map((r) => <option key={r.id} value={r.id}>{r.name} ({formatGBP(Number(r.price))})</option>)}
            </select>
          </Field>
          <Field label="Own 1:1 price (£)" hint="Overrides the price list for this child.">
            <input type="number" min="0" step="0.01" className="input" value={pricing.custom_price} onChange={(e) => setPricing({ ...pricing, custom_price: e.target.value })} />
          </Field>
        </div>
        <div className="flex items-center justify-end gap-3">{saved && <span className="text-sm text-muted">{saved}</span>}<button className="btn-primary" onClick={save}>Save pricing</button></div>
      </div>
      <Table head={['Invoice', 'Line', 'Amount', 'Status']} empty="Nothing invoiced for this child yet.">
        {lines.map((l) => (
          <tr key={l.id}>
            <Td className="font-medium">{l.invoices && <Link to={`/invoice/${l.invoices.id}`} className="text-primary hover:underline">{l.invoices.number}</Link>}</Td>
            <Td>{l.description}</Td>
            <Td>{formatGBP(Number(l.amount))}</Td>
            <Td>{l.invoices && <Badge tone={INVOICE_STATUS_TONE[l.invoices.status]}>{INVOICE_STATUS_LABEL[l.invoices.status]}</Badge>}</Td>
          </tr>
        ))}
      </Table>
    </div>
  )
}

STUDENT_TABS.invoices = (s) => <StudentInvoices s={s} />
