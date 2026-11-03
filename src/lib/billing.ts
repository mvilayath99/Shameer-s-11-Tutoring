import type { Delivery, LessonKind } from './lessons'

export type InvoiceStatus = 'draft' | 'sent' | 'part_paid' | 'paid' | 'void'
export type LineType = 'lesson' | 'package' | 'discount' | 'extra'

export interface Invoice {
  id: string; created_at: string; number: string; family_id: string; kind: 'monthly' | 'termly' | 'manual'
  period_start: string | null; period_end: string | null; status: InvoiceStatus; issue_date: string; due_date: string | null
  subtotal: number; discount_total: number; total: number; amount_paid: number; notes: string | null; sent_at: string | null
}
export interface InvoiceLine {
  id: string; invoice_id: string; line_type: LineType; description: string; quantity: number; unit_price: number
  amount: number; lesson_id: string | null; student_id: string | null; sort_order: number
}
export interface Payment {
  id: string; invoice_id: string; paid_on: string; amount: number; method: PaymentMethod; reference: string | null; created_at: string
}
export type PaymentMethod = 'bank_transfer' | 'cash' | 'card' | 'other'
export interface RateCard {
  id: string; name: string; lesson_kind: LessonKind | null; delivery: Delivery | null; school_year: string | null
  duration_minutes: number; price: number; active: boolean
}
export interface TermPackage {
  id: string; name: string; term_start: string; term_end: string; lessons_included: number | null; price: number
  description: string | null; active: boolean
}
export interface FamilyPackage {
  id: string; family_id: string; student_id: string | null; package_id: string; custom_price: number | null; invoice_id: string | null
}
export interface FamilyDiscount {
  id: string; family_id: string; student_id: string | null; kind: 'percent' | 'fixed'; amount: number; label: string
  reason: string | null; starts_on: string; ends_on: string | null
}
export interface BillingSettings {
  invoice_prefix: string; next_number: number; payment_terms_days: number; bank_details: string | null; invoice_footer: string | null
}

export const INVOICE_STATUS_LABEL: Record<InvoiceStatus, string> = {
  draft: 'Draft', sent: 'Sent', part_paid: 'Part paid', paid: 'Paid', void: 'Cancelled',
}
export const INVOICE_STATUS_TONE: Record<InvoiceStatus, 'grey' | 'blue' | 'amber' | 'green' | 'red'> = {
  draft: 'grey', sent: 'blue', part_paid: 'amber', paid: 'green', void: 'grey',
}
export const METHOD_LABEL: Record<PaymentMethod, string> = {
  bank_transfer: 'Bank transfer', cash: 'Cash', card: 'Card', other: 'Other',
}

export const balance = (i: Pick<Invoice, 'total' | 'amount_paid'>) => Math.max(Number(i.total) - Number(i.amount_paid), 0)
export const isOverdue = (i: Invoice) =>
  (i.status === 'sent' || i.status === 'part_paid') && !!i.due_date && new Date(i.due_date + 'T23:59:59') < new Date()

/** "2026-11" for the month input, and the first day of that month for the database. */
export const monthInput = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
export const monthLabel = (ym: string) =>
  new Date(ym + '-01T12:00:00').toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
export const periodLabel = (i: Pick<Invoice, 'kind' | 'period_start' | 'period_end'>) => {
  if (!i.period_start) return ''
  if (i.kind === 'monthly') return monthLabel(i.period_start.slice(0, 7))
  const f = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
  return i.period_end ? `${f(i.period_start)} to ${f(i.period_end)}` : f(i.period_start)
}

export const today = () => new Date().toISOString().slice(0, 10)
