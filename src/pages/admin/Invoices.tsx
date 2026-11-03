import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { Plus, Send, Trash2, Wand2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { formatDate, formatGBP } from '../../lib/format'
import { SCHOOL_YEARS } from '../../lib/families'
import { DELIVERY_LABEL, useLookups, type Delivery, type LessonKind } from '../../lib/lessons'
import {
  INVOICE_STATUS_LABEL, INVOICE_STATUS_TONE, balance, isOverdue, monthInput, monthLabel, periodLabel, today,
  type BillingSettings, type FamilyDiscount, type FamilyPackage, type Invoice, type RateCard, type TermPackage,
} from '../../lib/billing'
import { PageHeader } from '../../components/PortalLayout'
import { useModuleName } from '../../components/ModuleGate'
import { Modal } from '../../components/Modal'
import { Badge, Field, Notice, Table, Tabs, Td } from '../../components/ui'
import { InvoiceEditor } from './InvoiceEditor'

type Tab = 'invoices' | 'prices' | 'discounts' | 'settings'
type FamilyLite = { id: string; name: string }

function useFamilies() {
  const [families, setFamilies] = useState<FamilyLite[]>([])
  useEffect(() => { supabase.from('families').select('id, name').order('name').then(({ data }) => setFamilies(data ?? [])) }, [])
  const familyName = useMemo(() => Object.fromEntries(families.map((f) => [f.id, f.name])), [families])
  return { families, familyName }
}

export default function Invoices() {
  const title = useModuleName('invoices', 'Invoices')
  const [tab, setTab] = useState<Tab>('invoices')
  return (
    <>
      <PageHeader title={title} subtitle="Prices, discounts, monthly and termly invoices, and payments." />
      <Tabs<Tab> value={tab} onChange={setTab} tabs={[
        { key: 'invoices', label: 'Invoices' }, { key: 'prices', label: 'Prices and packages' },
        { key: 'discounts', label: 'Discounts' }, { key: 'settings', label: 'Invoice settings' },
      ]} />
      {tab === 'invoices' && <InvoiceList />}
      {tab === 'prices' && <Prices />}
      {tab === 'discounts' && <Discounts />}
      {tab === 'settings' && <BillingSettingsForm />}
    </>
  )
}

// ---------------------------------------------------------------------------
// Invoices
// ---------------------------------------------------------------------------
type Filter = 'all' | 'draft' | 'unpaid' | 'overdue' | 'paid' | 'void'

function InvoiceList() {
  const { families, familyName } = useFamilies()
  const [rows, setRows] = useState<Invoice[]>([])
  const [filter, setFilter] = useState<Filter>('all')
  const [month, setMonth] = useState(monthInput())
  const [open, setOpen] = useState<Invoice | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [msg, setMsg] = useState<{ kind: 'success' | 'error'; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [manualFamily, setManualFamily] = useState<string | null>(null)

  const load = useCallback(async () => {
    const { data } = await supabase.from('invoices').select('*').order('issue_date', { ascending: false }).order('number', { ascending: false }).limit(500)
    setRows((data ?? []) as Invoice[])
  }, [])
  useEffect(() => { load() }, [load])

  const shown = rows.filter((i) => ({
    all: true, draft: i.status === 'draft', unpaid: i.status === 'sent' || i.status === 'part_paid',
    overdue: isOverdue(i), paid: i.status === 'paid', void: i.status === 'void',
  }[filter]))

  const totals = useMemo(() => {
    const live = rows.filter((i) => i.status !== 'void' && i.status !== 'draft')
    const inMonth = live.filter((i) => (i.period_start ?? i.issue_date).slice(0, 7) === month)
    return {
      invoiced: inMonth.reduce((a, i) => a + Number(i.total), 0),
      received: inMonth.reduce((a, i) => a + Number(i.amount_paid), 0),
      outstanding: live.reduce((a, i) => a + balance(i), 0),
      overdue: live.filter(isOverdue).length,
      drafts: rows.filter((i) => i.status === 'draft').length,
    }
  }, [rows, month])

  const generate = async () => {
    setBusy(true); setMsg(null)
    const { data, error } = await supabase.rpc('generate_monthly_invoices', { _month: `${month}-01` })
    setBusy(false)
    if (error) setMsg({ kind: 'error', text: error.message })
    else setMsg({ kind: 'success', text: data ? `${data} draft invoice${data === 1 ? '' : 's'} created for ${monthLabel(month)}. Check them, then send.` : `Nothing new to invoice for ${monthLabel(month)}. Lessons already on an invoice, or covered by a termly package, are skipped.` })
    setFilter('draft'); load()
  }
  const sendSelected = async () => {
    setBusy(true); setMsg(null)
    for (const id of selected) {
      const { error } = await supabase.rpc('send_invoice', { _invoice_id: id })
      if (error) { setMsg({ kind: 'error', text: error.message }); break }
    }
    setBusy(false); setSelected(new Set()); load()
  }
  const createManual = async (e: FormEvent) => {
    e.preventDefault(); if (!manualFamily) return
    const { data, error } = await supabase.from('invoices').insert({ family_id: manualFamily, kind: 'manual' }).select().single()
    setManualFamily(null)
    if (error) setMsg({ kind: 'error', text: error.message }); else { await load(); setOpen(data as Invoice) }
  }
  const drafts = shown.filter((i) => i.status === 'draft')

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label={`Invoiced for ${monthLabel(month)}`} value={formatGBP(totals.invoiced)} />
        <Stat label={`Received for ${monthLabel(month)}`} value={formatGBP(totals.received)} />
        <Stat label="Outstanding (all time)" value={formatGBP(totals.outstanding)} />
        <Stat label="Overdue invoices" value={String(totals.overdue)} tone={totals.overdue ? 'red' : undefined} onClick={() => setFilter('overdue')} />
      </div>

      <div className="card flex flex-col gap-4 sm:flex-row sm:items-end">
        <Field label="Month">
          <input type="month" className="input" value={month} onChange={(e) => setMonth(e.target.value)} />
        </Field>
        <button className="btn-primary" disabled={busy} onClick={generate}><Wand2 className="h-4 w-4" /> Create invoices for {monthLabel(month)}</button>
        <button className="btn-outline" onClick={() => setManualFamily(families[0]?.id ?? '')}><Plus className="h-4 w-4" /> One-off invoice</button>
        <p className="text-xs text-muted sm:ml-auto sm:max-w-xs">Creates one draft per family from that month's lessons, using each child's price and any family discount. Nothing is sent until you choose.</p>
      </div>

      {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}

      <div className="flex flex-wrap items-center gap-2">
        {(['all', 'draft', 'unpaid', 'overdue', 'paid', 'void'] as Filter[]).map((f) => (
          <button key={f} onClick={() => setFilter(f)}
            className={`rounded-full border px-3 py-1 text-sm ${filter === f ? 'border-primary bg-primary-soft text-primary' : 'border-line text-muted hover:text-ink'}`}>
            {{ all: 'All', draft: `Drafts${totals.drafts ? ` (${totals.drafts})` : ''}`, unpaid: 'Unpaid', overdue: 'Overdue', paid: 'Paid', void: 'Cancelled' }[f]}
          </button>
        ))}
        {selected.size > 0 && <button className="btn-primary ml-auto" disabled={busy} onClick={sendSelected}><Send className="h-4 w-4" /> Send {selected.size} selected</button>}
        {!selected.size && drafts.length > 1 && <button className="btn-outline ml-auto" onClick={() => setSelected(new Set(drafts.map((d) => d.id)))}>Select all drafts</button>}
      </div>

      <Table head={['', 'Number', 'Family', 'For', 'Due', 'Total', 'Balance', 'Status']} empty="No invoices here.">
        {shown.map((i) => (
          <tr key={i.id} className="cursor-pointer hover:bg-secondary" onClick={() => setOpen(i)}>
            <Td>{i.status === 'draft' && (
              <input type="checkbox" aria-label={`Select ${i.number}`} checked={selected.has(i.id)} onClick={(e) => e.stopPropagation()}
                onChange={(e) => { const s = new Set(selected); if (e.target.checked) s.add(i.id); else s.delete(i.id); setSelected(s) }} />
            )}</Td>
            <Td className="font-medium">{i.number}</Td>
            <Td>{familyName[i.family_id] ?? '—'}</Td>
            <Td className="text-muted">{periodLabel(i) || formatDate(i.issue_date)}</Td>
            <Td className="whitespace-nowrap text-muted">{i.due_date ? formatDate(i.due_date) : '—'}</Td>
            <Td>{formatGBP(Number(i.total))}</Td>
            <Td>{i.status === 'void' ? '—' : formatGBP(balance(i))}</Td>
            <Td><span className="flex gap-1"><Badge tone={INVOICE_STATUS_TONE[i.status]}>{INVOICE_STATUS_LABEL[i.status]}</Badge>{isOverdue(i) && <Badge tone="red">Overdue</Badge>}</span></Td>
          </tr>
        ))}
      </Table>

      {open && <InvoiceEditor invoiceId={open.id} familyName={familyName[open.family_id] ?? ''} onClose={() => setOpen(null)} onChanged={load} />}
      {manualFamily !== null && (
        <Modal title="One-off invoice" onClose={() => setManualFamily(null)}>
          <form onSubmit={createManual} className="space-y-4">
            <Field label="Family">
              <select className="input" value={manualFamily} onChange={(e) => setManualFamily(e.target.value)} required>
                {families.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
              </select>
            </Field>
            <p className="text-sm text-muted">You'll add the lines on the next screen, for example an assessment, mock exam or books.</p>
            <div className="flex justify-end"><button className="btn-primary">Create draft</button></div>
          </form>
        </Modal>
      )}
    </div>
  )
}

function Stat({ label, value, tone, onClick }: { label: string; value: string; tone?: 'red'; onClick?: () => void }) {
  return (
    <button type="button" onClick={onClick} disabled={!onClick} className="card text-left disabled:cursor-default">
      <p className="text-xs text-muted">{label}</p>
      <p className={`mt-1 text-xl font-semibold ${tone === 'red' ? 'text-red-700' : ''}`}>{value}</p>
    </button>
  )
}

// ---------------------------------------------------------------------------
// Prices: rate cards, termly packages, packages assigned to families
// ---------------------------------------------------------------------------
const EMPTY_RATE: Omit<RateCard, 'id'> = { name: '', lesson_kind: 'one_to_one', delivery: null, school_year: null, duration_minutes: 60, price: 0, active: true }
const EMPTY_PKG: Omit<TermPackage, 'id'> = { name: '', term_start: today(), term_end: today(), lessons_included: 12, price: 0, description: '', active: true }
const KIND_LABEL: Record<LessonKind, string> = { one_to_one: '1:1', group: 'Group' }

function Prices() {
  const { families, familyName } = useFamilies()
  const { students, studentName } = useLookups()
  const [rates, setRates] = useState<RateCard[]>([])
  const [pkgs, setPkgs] = useState<TermPackage[]>([])
  const [fps, setFps] = useState<FamilyPackage[]>([])
  const [rate, setRate] = useState<Partial<RateCard> | null>(null)
  const [pkg, setPkg] = useState<Partial<TermPackage> | null>(null)
  const [assign, setAssign] = useState<Partial<FamilyPackage> | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  const load = useCallback(async () => {
    const [{ data: r }, { data: p }, { data: f }] = await Promise.all([
      supabase.from('rate_cards').select('*').order('name'),
      supabase.from('term_packages').select('*').order('term_start', { ascending: false }),
      supabase.from('family_packages').select('*').order('created_at', { ascending: false }),
    ])
    setRates((r ?? []) as RateCard[]); setPkgs((p ?? []) as TermPackage[]); setFps((f ?? []) as FamilyPackage[])
  }, [])
  useEffect(() => { load() }, [load])

  const done = (err: { message: string } | null, close: () => void) => { if (err) setError(err.message); else { setError(null); close(); load() } }
  const saveRate = async (e: FormEvent) => {
    e.preventDefault(); if (!rate) return
    const { id, ...rest } = rate as RateCard
    const payload = { ...EMPTY_RATE, ...rest, price: Number(rest.price), duration_minutes: Number(rest.duration_minutes) }
    const { error } = id ? await supabase.from('rate_cards').update(payload).eq('id', id) : await supabase.from('rate_cards').insert(payload)
    done(error, () => setRate(null))
  }
  const savePkg = async (e: FormEvent) => {
    e.preventDefault(); if (!pkg) return
    const { id, ...rest } = pkg as TermPackage
    const payload = { ...EMPTY_PKG, ...rest, price: Number(rest.price), lessons_included: rest.lessons_included ? Number(rest.lessons_included) : null }
    const { error } = id ? await supabase.from('term_packages').update(payload).eq('id', id) : await supabase.from('term_packages').insert(payload)
    done(error, () => setPkg(null))
  }
  const saveAssign = async (e: FormEvent) => {
    e.preventDefault(); if (!assign?.family_id || !assign.package_id) return
    const { error } = await supabase.from('family_packages').insert({
      family_id: assign.family_id, package_id: assign.package_id, student_id: assign.student_id || null,
      custom_price: assign.custom_price != null && String(assign.custom_price) !== '' ? Number(assign.custom_price) : null,
    })
    done(error, () => setAssign(null))
  }
  const invoicePackage = async (fp: FamilyPackage) => {
    const { error } = await supabase.rpc('invoice_family_package', { _family_package_id: fp.id })
    if (error) setError(error.message); else { setInfo('Draft invoice created. Find it under Invoices → Drafts.'); load() }
  }
  const pkgName = Object.fromEntries(pkgs.map((p) => [p.id, p]))
  const ratesLabel = (r: RateCard) => [r.lesson_kind ? KIND_LABEL[r.lesson_kind] : 'Any type', r.delivery ? DELIVERY_LABEL[r.delivery] : null, r.school_year].filter(Boolean).join(' · ')

  return (
    <div className="space-y-10">
      {error && <Notice kind="error">{error}</Notice>}
      {info && <Notice kind="success">{info}</Notice>}

      <section>
        <div className="mb-3 flex items-end justify-between gap-4">
          <div>
            <h2 className="font-semibold">Price list</h2>
            <p className="text-sm text-muted">Prices per lesson. A child uses their own price if set on their profile, otherwise the closest match here. Shorter or longer lessons are charged pro rata.</p>
          </div>
          <button className="btn-primary shrink-0" onClick={() => setRate({ ...EMPTY_RATE })}><Plus className="h-4 w-4" /> Add price</button>
        </div>
        <Table head={['Name', 'Applies to', 'Length', 'Price', '']} empty="No prices yet. Add one for each kind of lesson you teach.">
          {rates.map((r) => (
            <tr key={r.id} className="cursor-pointer hover:bg-secondary" onClick={() => setRate(r)}>
              <Td className="font-medium">{r.name} {!r.active && <Badge>Not in use</Badge>}</Td>
              <Td className="text-muted">{ratesLabel(r)}</Td>
              <Td className="text-muted">{r.duration_minutes} min</Td>
              <Td>{formatGBP(Number(r.price))}</Td>
              <Td />
            </tr>
          ))}
        </Table>
      </section>

      <section>
        <div className="mb-3 flex items-end justify-between gap-4">
          <div>
            <h2 className="font-semibold">Termly packages</h2>
            <p className="text-sm text-muted">A fixed price for a term. Lessons inside the term aren't added to that family's monthly invoice.</p>
          </div>
          <button className="btn-primary shrink-0" onClick={() => setPkg({ ...EMPTY_PKG })}><Plus className="h-4 w-4" /> Add package</button>
        </div>
        <Table head={['Package', 'Term', 'Lessons', 'Price']} empty="No packages yet.">
          {pkgs.map((p) => (
            <tr key={p.id} className="cursor-pointer hover:bg-secondary" onClick={() => setPkg(p)}>
              <Td className="font-medium">{p.name} {!p.active && <Badge>Not in use</Badge>}</Td>
              <Td className="text-muted">{formatDate(p.term_start)} to {formatDate(p.term_end)}</Td>
              <Td className="text-muted">{p.lessons_included ?? '—'}</Td>
              <Td>{formatGBP(Number(p.price))}</Td>
            </tr>
          ))}
        </Table>

        <div className="mb-3 mt-6 flex items-end justify-between gap-4">
          <h3 className="font-medium">Families on a package</h3>
          <button className="btn-outline shrink-0" disabled={!pkgs.length} onClick={() => setAssign({ family_id: families[0]?.id, package_id: pkgs.find((p) => p.active)?.id })}><Plus className="h-4 w-4" /> Put a family on a package</button>
        </div>
        <Table head={['Family', 'Child', 'Package', 'Price', '']} empty="No families on a package.">
          {fps.map((f) => (
            <tr key={f.id}>
              <Td className="font-medium">{familyName[f.family_id]}</Td>
              <Td className="text-muted">{f.student_id ? studentName[f.student_id] : 'All children'}</Td>
              <Td>{pkgName[f.package_id]?.name}</Td>
              <Td>{formatGBP(Number(f.custom_price ?? pkgName[f.package_id]?.price ?? 0))}</Td>
              <Td className="whitespace-nowrap text-right">
                {f.invoice_id ? <span className="text-sm text-muted">Invoiced</span>
                  : <button className="text-sm text-primary hover:underline" onClick={() => invoicePackage(f)}>Create invoice</button>}
                <button aria-label="Remove" className="ml-3 align-middle text-muted hover:text-red-600" onClick={async () => { if (confirm('Take this family off the package?')) { await supabase.from('family_packages').delete().eq('id', f.id); load() } }}><Trash2 className="h-4 w-4" /></button>
              </Td>
            </tr>
          ))}
        </Table>
      </section>

      {rate && (
        <Modal title={rate.id ? 'Edit price' : 'Add price'} onClose={() => setRate(null)}>
          <form onSubmit={saveRate} className="space-y-4">
            <Field label="Name"><input className="input" required placeholder="e.g. Year 5 1:1 online" value={rate.name ?? ''} onChange={(e) => setRate({ ...rate, name: e.target.value })} /></Field>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Lesson type">
                <select className="input" value={rate.lesson_kind ?? ''} onChange={(e) => setRate({ ...rate, lesson_kind: (e.target.value || null) as LessonKind | null })}>
                  <option value="">Any</option><option value="one_to_one">1:1</option><option value="group">Group</option>
                </select>
              </Field>
              <Field label="Online or in person">
                <select className="input" value={rate.delivery ?? ''} onChange={(e) => setRate({ ...rate, delivery: (e.target.value || null) as Delivery | null })}>
                  <option value="">Either</option><option value="online">Online</option><option value="in_person">In person</option>
                </select>
              </Field>
              <Field label="School year">
                <select className="input" value={rate.school_year ?? ''} onChange={(e) => setRate({ ...rate, school_year: e.target.value || null })}>
                  <option value="">Any</option>{SCHOOL_YEARS.map((y) => <option key={y}>{y}</option>)}
                </select>
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Lesson length (minutes)"><input type="number" min="15" step="15" className="input" value={rate.duration_minutes ?? 60} onChange={(e) => setRate({ ...rate, duration_minutes: Number(e.target.value) })} /></Field>
              <Field label="Price per lesson (£)"><input type="number" min="0" step="0.01" className="input" required value={rate.price ?? ''} onChange={(e) => setRate({ ...rate, price: e.target.value as unknown as number })} /></Field>
            </div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={rate.active ?? true} onChange={(e) => setRate({ ...rate, active: e.target.checked })} /> In use</label>
            <div className="flex justify-between">
              {rate.id ? <button type="button" className="btn-outline text-red-700" onClick={async () => { if (confirm('Delete this price? Children using it will fall back to the closest match.')) { await supabase.from('rate_cards').delete().eq('id', rate.id!); setRate(null); load() } }}>Delete</button> : <span />}
              <button className="btn-primary">Save</button>
            </div>
          </form>
        </Modal>
      )}

      {pkg && (
        <Modal title={pkg.id ? 'Edit package' : 'Add termly package'} onClose={() => setPkg(null)}>
          <form onSubmit={savePkg} className="space-y-4">
            <Field label="Name"><input className="input" required placeholder="e.g. Spring term, weekly 1:1" value={pkg.name ?? ''} onChange={(e) => setPkg({ ...pkg, name: e.target.value })} /></Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Term starts"><input type="date" className="input" required value={pkg.term_start ?? ''} onChange={(e) => setPkg({ ...pkg, term_start: e.target.value })} /></Field>
              <Field label="Term ends"><input type="date" className="input" required value={pkg.term_end ?? ''} onChange={(e) => setPkg({ ...pkg, term_end: e.target.value })} /></Field>
              <Field label="Lessons included"><input type="number" min="0" className="input" value={pkg.lessons_included ?? ''} onChange={(e) => setPkg({ ...pkg, lessons_included: e.target.value as unknown as number })} /></Field>
              <Field label="Price (£)"><input type="number" min="0" step="0.01" className="input" required value={pkg.price ?? ''} onChange={(e) => setPkg({ ...pkg, price: e.target.value as unknown as number })} /></Field>
            </div>
            <Field label="Description (optional)"><textarea className="input" rows={2} value={pkg.description ?? ''} onChange={(e) => setPkg({ ...pkg, description: e.target.value })} /></Field>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={pkg.active ?? true} onChange={(e) => setPkg({ ...pkg, active: e.target.checked })} /> Available</label>
            <div className="flex justify-end"><button className="btn-primary">Save</button></div>
          </form>
        </Modal>
      )}

      {assign && (
        <Modal title="Put a family on a package" onClose={() => setAssign(null)}>
          <form onSubmit={saveAssign} className="space-y-4">
            <Field label="Family">
              <select className="input" required value={assign.family_id ?? ''} onChange={(e) => setAssign({ ...assign, family_id: e.target.value, student_id: null })}>
                {families.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
              </select>
            </Field>
            <Field label="Child">
              <select className="input" value={assign.student_id ?? ''} onChange={(e) => setAssign({ ...assign, student_id: e.target.value || null })}>
                <option value="">All children in the family</option>
                {students.filter((s) => s.family_id === assign.family_id).map((s) => <option key={s.id} value={s.id}>{studentName[s.id]}</option>)}
              </select>
            </Field>
            <Field label="Package">
              <select className="input" required value={assign.package_id ?? ''} onChange={(e) => setAssign({ ...assign, package_id: e.target.value })}>
                {pkgs.filter((p) => p.active).map((p) => <option key={p.id} value={p.id}>{p.name} ({formatGBP(Number(p.price))})</option>)}
              </select>
            </Field>
            <Field label="Special price for this family (£, optional)"><input type="number" min="0" step="0.01" className="input" value={assign.custom_price ?? ''} onChange={(e) => setAssign({ ...assign, custom_price: e.target.value as unknown as number })} /></Field>
            <div className="flex justify-end"><button className="btn-primary">Save</button></div>
          </form>
        </Modal>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Discounts (the reason is private; families only see the label on the invoice)
// ---------------------------------------------------------------------------
function Discounts() {
  const { families, familyName } = useFamilies()
  const { students, studentName } = useLookups()
  const [rows, setRows] = useState<FamilyDiscount[]>([])
  const [edit, setEdit] = useState<Partial<FamilyDiscount> | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const { data } = await supabase.from('family_discounts').select('*').order('starts_on', { ascending: false })
    setRows((data ?? []) as FamilyDiscount[])
  }, [])
  useEffect(() => { load() }, [load])

  const save = async (e: FormEvent) => {
    e.preventDefault(); if (!edit) return
    const { id, ...rest } = edit as FamilyDiscount
    const payload = { ...rest, amount: Number(rest.amount), student_id: rest.student_id || null, ends_on: rest.ends_on || null, reason: rest.reason || null }
    const { error } = id ? await supabase.from('family_discounts').update(payload).eq('id', id) : await supabase.from('family_discounts').insert(payload)
    if (error) setError(error.message); else { setError(null); setEdit(null); load() }
  }
  const active = (d: FamilyDiscount) => d.starts_on <= today() && (!d.ends_on || d.ends_on >= today())

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-4">
        <p className="max-w-2xl text-sm text-muted">Discounts are added automatically to new invoices while they're active. Families see the label you choose on their invoice. The reason is private to tutors.</p>
        <button className="btn-primary shrink-0" disabled={!families.length} onClick={() => setEdit({ family_id: families[0]?.id, kind: 'percent', amount: 10, label: 'Family discount', starts_on: today() })}><Plus className="h-4 w-4" /> Add discount</button>
      </div>
      {error && <Notice kind="error">{error}</Notice>}
      <Table head={['Family', 'Child', 'Discount', 'Shown as', 'From', 'Until', '']} empty="No discounts.">
        {rows.map((d) => (
          <tr key={d.id} className="cursor-pointer hover:bg-secondary" onClick={() => setEdit(d)}>
            <Td className="font-medium">{familyName[d.family_id]}</Td>
            <Td className="text-muted">{d.student_id ? studentName[d.student_id] : 'All children'}</Td>
            <Td>{d.kind === 'percent' ? `${Number(d.amount)}%` : `${formatGBP(Number(d.amount))} off`}</Td>
            <Td className="text-muted">{d.label}</Td>
            <Td className="text-muted">{formatDate(d.starts_on)}</Td>
            <Td className="text-muted">{d.ends_on ? formatDate(d.ends_on) : 'Ongoing'}</Td>
            <Td>{active(d) ? <Badge tone="green">Active</Badge> : <Badge>Inactive</Badge>}</Td>
          </tr>
        ))}
      </Table>

      {edit && (
        <Modal title={edit.id ? 'Edit discount' : 'Add discount'} onClose={() => setEdit(null)}>
          <form onSubmit={save} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Family">
                <select className="input" required value={edit.family_id ?? ''} onChange={(e) => setEdit({ ...edit, family_id: e.target.value, student_id: null })}>
                  {families.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                </select>
              </Field>
              <Field label="Child">
                <select className="input" value={edit.student_id ?? ''} onChange={(e) => setEdit({ ...edit, student_id: e.target.value || null })}>
                  <option value="">All children</option>
                  {students.filter((s) => s.family_id === edit.family_id).map((s) => <option key={s.id} value={s.id}>{studentName[s.id]}</option>)}
                </select>
              </Field>
              <Field label="Type">
                <select className="input" value={edit.kind} onChange={(e) => setEdit({ ...edit, kind: e.target.value as 'percent' | 'fixed' })}>
                  <option value="percent">Percentage off</option><option value="fixed">Fixed amount off each invoice</option>
                </select>
              </Field>
              <Field label={edit.kind === 'percent' ? 'Percentage' : 'Amount (£)'}>
                <input type="number" min="0.01" step="0.01" className="input" required value={edit.amount ?? ''} onChange={(e) => setEdit({ ...edit, amount: e.target.value as unknown as number })} />
              </Field>
              <Field label="Starts"><input type="date" className="input" required value={edit.starts_on ?? ''} onChange={(e) => setEdit({ ...edit, starts_on: e.target.value })} /></Field>
              <Field label="Ends (optional)"><input type="date" className="input" value={edit.ends_on ?? ''} onChange={(e) => setEdit({ ...edit, ends_on: e.target.value })} /></Field>
            </div>
            <Field label="Shown on the invoice as"><input className="input" required value={edit.label ?? ''} onChange={(e) => setEdit({ ...edit, label: e.target.value })} /></Field>
            <Field label="Private reason" hint="Only tutors can see this."><textarea className="input" rows={2} value={edit.reason ?? ''} onChange={(e) => setEdit({ ...edit, reason: e.target.value })} /></Field>
            <div className="flex justify-between">
              {edit.id ? <button type="button" className="btn-outline text-red-700" onClick={async () => { if (confirm('Delete this discount? Invoices already created keep it.')) { await supabase.from('family_discounts').delete().eq('id', edit.id!); setEdit(null); load() } }}>Delete</button> : <span />}
              <button className="btn-primary">Save</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Invoice settings
// ---------------------------------------------------------------------------
function BillingSettingsForm() {
  const [b, setB] = useState<BillingSettings | null>(null)
  const [msg, setMsg] = useState<{ kind: 'success' | 'error'; text: string } | null>(null)
  useEffect(() => { supabase.from('billing_settings').select('*').eq('id', 1).maybeSingle().then(({ data }) => setB(data as BillingSettings | null)) }, [])
  if (!b) return <p className="text-sm text-muted">Loading…</p>
  const save = async (e: FormEvent) => {
    e.preventDefault()
    const { error } = await supabase.from('billing_settings').update({
      invoice_prefix: b.invoice_prefix, next_number: Number(b.next_number), payment_terms_days: Number(b.payment_terms_days),
      bank_details: b.bank_details, invoice_footer: b.invoice_footer,
    }).eq('id', 1)
    setMsg(error ? { kind: 'error', text: error.message } : { kind: 'success', text: 'Saved.' })
  }
  return (
    <form onSubmit={save} className="card max-w-2xl space-y-5">
      {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Invoice number prefix"><input className="input" value={b.invoice_prefix} onChange={(e) => setB({ ...b, invoice_prefix: e.target.value })} /></Field>
        <Field label="Next number"><input type="number" min="1" className="input" value={b.next_number} onChange={(e) => setB({ ...b, next_number: Number(e.target.value) })} /></Field>
        <Field label="Days to pay"><input type="number" min="0" className="input" value={b.payment_terms_days} onChange={(e) => setB({ ...b, payment_terms_days: Number(e.target.value) })} /></Field>
      </div>
      <Field label="How to pay" hint="Bank details shown on every invoice. Fill in your account name, sort code and account number.">
        <textarea className="input font-mono text-sm" rows={5} value={b.bank_details ?? ''} onChange={(e) => setB({ ...b, bank_details: e.target.value })} />
      </Field>
      <Field label="Footer message"><input className="input" value={b.invoice_footer ?? ''} onChange={(e) => setB({ ...b, invoice_footer: e.target.value })} /></Field>
      <div className="rounded-lg border border-dashed border-line p-4 text-sm text-muted">
        <p className="font-medium text-ink">Online card payments</p>
        <p className="mt-1">Not switched on. When you're ready, the super admin can connect a payment provider under Settings → Integrations, and a "Pay online" button will appear on invoices.</p>
      </div>
      <div className="flex justify-end"><button className="btn-primary">Save settings</button></div>
    </form>
  )
}
