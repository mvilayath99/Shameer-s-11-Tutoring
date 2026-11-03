// Supabase Edge Function "notify": sends the practice's emails using the templates in email_templates.
//
// The browser only says what happened ({ event, id }); this function looks up who should hear about it
// and what the email should say, so nobody can use it to send arbitrary email.
//
// Secrets (Supabase dashboard > Edge Functions > Secrets):
//   RESEND_API_KEY  - from resend.com (free tier is fine). Without it, emails are logged as "skipped".
//   EMAIL_FROM      - e.g. "Shameer's 11+ Tutoring <hello@yourdomain.co.uk>" (domain verified in Resend)
//   SITE_URL        - e.g. https://shameers-11plus-tutoring.netlify.app (used for links in emails)
//   CRON_SECRET     - any long random string; the daily reminder job sends it in the x-cron-secret header
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

const TZ = 'Europe/London'
const gbp = (n: number) => new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(n)
const day = (d: string) => new Date(d.length === 10 ? d + 'T12:00:00Z' : d).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: TZ })
const when = (d: string) => `${day(d)} at ${new Date(d).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: TZ })}`
const render = (t: string, vars: Record<string, string>) => t.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => vars[k] ?? '')

type Recipient = { email: string; user_id: string | null; name: string }
type Job = { template: string; recipients: Recipient[]; vars: Record<string, string>; related_id: string | null }

const MANDATORY = new Set(['invoice_sent', 'invoice_reminder'])
const STUDENT_DOMAIN = '@students.shameers11plus.app'

async function familyRecipients(db: SupabaseClient, familyId: string, template: string): Promise<Recipient[]> {
  const { data: members } = await db.from('family_members').select('user_id').eq('family_id', familyId)
  const memberIds = (members ?? []).map((m) => m.user_id)
  const { data: profs } = memberIds.length
    ? await db.from('profiles').select('id, email, full_name, active').in('id', memberIds)
    : { data: [] as { id: string; email: string | null; full_name: string | null; active: boolean }[] }
  let out: Recipient[] = (profs ?? [])
    .filter((p) => p.active && p.email && !p.email.endsWith(STUDENT_DOMAIN))
    .map((p) => ({ email: p.email!, user_id: p.id, name: p.full_name || 'Parent' }))
  if (!out.length) {
    const { data: f } = await db.from('families').select('billing_email, billing_name').eq('id', familyId).maybeSingle()
    if (f?.billing_email) out = [{ email: f.billing_email, user_id: null, name: f.billing_name || 'Parent' }]
  }
  if (!MANDATORY.has(template)) {
    const ids = out.map((r) => r.user_id).filter(Boolean)
    if (ids.length) {
      const { data: off } = await db.from('notification_prefs').select('user_id').eq('template_key', template).eq('enabled', false).in('user_id', ids)
      const blocked = new Set((off ?? []).map((o) => o.user_id))
      out = out.filter((r) => !r.user_id || !blocked.has(r.user_id))
    }
  }
  return out
}

/** Families taking part in a lesson, with the child's first name for each. */
async function lessonFamilies(db: SupabaseClient, lessonId: string) {
  const { data: l } = await db.from('lessons').select('*').eq('id', lessonId).maybeSingle()
  if (!l) return { lesson: null, kids: [] as { family_id: string; first_name: string }[] }
  let kids: { family_id: string; first_name: string }[] = []
  if (l.student_id) {
    const { data } = await db.from('students').select('family_id, first_name').eq('id', l.student_id)
    kids = data ?? []
  } else if (l.group_id) {
    const { data } = await db.from('group_members').select('students(family_id, first_name)').eq('group_id', l.group_id)
    kids = (data ?? []).map((g: any) => g.students).filter(Boolean)
  }
  return { lesson: l, kids }
}

async function buildJobs(db: SupabaseClient, event: string, id: string, site: string, business: string): Promise<Job[]> {
  const jobs: Job[] = []
  const base = { business_name: business }

  if (event === 'invoice_sent' || event === 'invoice_reminder') {
    const { data: inv } = await db.from('invoices').select('*').eq('id', id).maybeSingle()
    if (!inv || inv.status === 'draft' || inv.status === 'void') return []
    const amount = event === 'invoice_sent' ? Number(inv.total) : Math.max(Number(inv.total) - Number(inv.amount_paid), 0)
    for (const r of await familyRecipients(db, inv.family_id, event)) {
      jobs.push({ template: event, recipients: [r], related_id: inv.id, vars: { ...base, parent_name: r.name, invoice_number: inv.number,
        amount: gbp(amount), due_date: inv.due_date ? day(inv.due_date) : '', link: `${site}/invoice/${inv.id}` } })
    }
  }

  if (event === 'lesson_booked' || event === 'lesson_changed' || event === 'lesson_cancelled' || event === 'lesson_reminder') {
    const { lesson, kids } = await lessonFamilies(db, id)
    if (!lesson) return []
    const place = lesson.delivery === 'online' ? 'online on Microsoft Teams' : (lesson.location || 'in person')
    for (const k of kids) {
      for (const r of await familyRecipients(db, k.family_id, event)) {
        jobs.push({ template: event, recipients: [r], related_id: lesson.id, vars: { ...base, parent_name: r.name, child_name: k.first_name,
          lesson_time: when(lesson.starts_at), lesson_place: place, link: `${site}/parent/calendar` } })
      }
    }
  }

  if (event === 'homework_set') {
    const { data: hw } = await db.from('homework').select('id, title, due_at').eq('id', id).maybeSingle()
    if (!hw) return []
    const { data: subs } = await db.from('homework_submissions').select('students(family_id, first_name)').eq('homework_id', id)
    for (const s of (subs ?? []).map((x: any) => x.students).filter(Boolean)) {
      for (const r of await familyRecipients(db, s.family_id, event)) {
        jobs.push({ template: event, recipients: [r], related_id: hw.id, vars: { ...base, parent_name: r.name, child_name: s.first_name,
          homework_title: hw.title, due_date: hw.due_at ? when(hw.due_at) : 'no set date', link: `${site}/parent/homework` } })
      }
    }
  }

  if (event === 'homework_marked') {
    const { data: s } = await db.from('homework_submissions').select('id, score, total, status, homework(title), students(family_id, first_name)').eq('id', id).maybeSingle()
    if (!s || s.status !== 'marked') return []
    const st: any = s.students, hw: any = s.homework
    for (const r of await familyRecipients(db, st.family_id, event)) {
      jobs.push({ template: event, recipients: [r], related_id: s.id, vars: { ...base, parent_name: r.name, child_name: st.first_name,
        homework_title: hw?.title ?? '', score: s.score != null ? `${s.score}${s.total ? ' / ' + s.total : ''}` : 'see feedback', link: `${site}/parent/homework` } })
    }
  }

  if (event === 'enquiry_received') {
    const { data: e } = await db.from('enquiries').select('id, parent_name, child_name, created_at').eq('id', id).maybeSingle()
    if (!e || Date.now() - new Date(e.created_at).getTime() > 15 * 60 * 1000) return []
    const { data: staff } = await db.rpc('staff_directory')
    const ids = (staff ?? []).map((s: any) => s.id)
    const { data: profs } = ids.length ? await db.from('profiles').select('id, email, full_name').in('id', ids) : { data: [] }
    for (const p of profs ?? []) {
      if (!p.email) continue
      jobs.push({ template: event, recipients: [{ email: p.email, user_id: p.id, name: p.full_name ?? '' }], related_id: e.id,
        vars: { ...base, parent_name: e.parent_name, child_name: e.child_name ?? 'their child', link: `${site}/admin/enquiries` } })
    }
  }
  return jobs
}

async function deliver(db: SupabaseClient, jobs: Job[], sentBy: string | null) {
  const key = Deno.env.get('RESEND_API_KEY')
  const from = Deno.env.get('EMAIL_FROM')
  const keys = [...new Set(jobs.map((j) => j.template))]
  const { data: tpls } = keys.length ? await db.from('email_templates').select('*').in('key', keys) : { data: [] }
  const byKey = Object.fromEntries((tpls ?? []).map((t) => [t.key, t]))
  let sent = 0, skipped = 0, failed = 0
  for (const j of jobs) {
    const t = byKey[j.template]
    if (!t || !t.enabled) { skipped++; continue }
    for (const r of j.recipients) {
      const subject = render(t.subject, j.vars), text = render(t.body, j.vars)
      let status: 'sent' | 'failed' | 'skipped' = 'skipped', error: string | null = null
      if (!key || !from) error = 'Email sending is not set up yet (no Resend API key).'
      else {
        const res = await fetch('https://api.resend.com/emails', {
          method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ from, to: [r.email], subject, text }),
        })
        if (res.ok) status = 'sent'
        else { status = 'failed'; error = (await res.text()).slice(0, 500) }
      }
      if (status === 'sent') sent++; else if (status === 'failed') failed++; else skipped++
      await db.from('email_log').insert({ template_key: j.template, to_email: r.email, to_user_id: r.user_id, subject, status, error, related_id: j.related_id, sent_by: sentBy })
    }
  }
  return { sent, skipped, failed }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const url = Deno.env.get('SUPABASE_URL')!
    const db = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const site = (Deno.env.get('SITE_URL') ?? '').replace(/\/$/, '')
    const { data: settings } = await db.from('site_settings').select('business_name').eq('id', 1).maybeSingle()
    const business = settings?.business_name ?? "Shameer's 11+ Tutoring"
    const body = await req.json().catch(() => ({}))
    const event = String(body.event ?? '')
    const id = String(body.id ?? '')

    // Daily job: tomorrow's lesson reminders and overdue invoice reminders (once each).
    const cronSecret = Deno.env.get('CRON_SECRET')
    if (event === 'daily') {
      if (!cronSecret || req.headers.get('x-cron-secret') !== cronSecret) return json({ error: 'Not allowed.' }, 403)
      const from = new Date(Date.now() + 12 * 3600e3).toISOString(), to = new Date(Date.now() + 36 * 3600e3).toISOString()
      const { data: lessons } = await db.from('lessons').select('id').eq('status', 'scheduled').gte('starts_at', from).lt('starts_at', to)
      const { data: overdue } = await db.from('invoices').select('id').in('status', ['sent', 'part_paid']).lt('due_date', new Date().toISOString().slice(0, 10))
      const { data: done } = await db.from('email_log').select('related_id, template_key').in('template_key', ['lesson_reminder', 'invoice_reminder'])
        .gte('created_at', new Date(Date.now() - 7 * 86400e3).toISOString())
      const already = new Set((done ?? []).map((d) => `${d.template_key}:${d.related_id}`))
      const jobs: Job[] = []
      for (const l of lessons ?? []) if (!already.has(`lesson_reminder:${l.id}`)) jobs.push(...await buildJobs(db, 'lesson_reminder', l.id, site, business))
      for (const i of overdue ?? []) if (!already.has(`invoice_reminder:${i.id}`)) jobs.push(...await buildJobs(db, 'invoice_reminder', i.id, site, business))
      return json(await deliver(db, jobs, null))
    }

    const events = ['invoice_sent', 'invoice_reminder', 'lesson_booked', 'lesson_changed', 'lesson_cancelled', 'homework_set', 'homework_marked', 'enquiry_received']
    if (!events.includes(event) || !/^[0-9a-f-]{36}$/i.test(id)) return json({ error: 'Unknown event.' }, 400)

    let sentBy: string | null = null
    if (event === 'enquiry_received') {
      // Sent from the public contact form: only once per enquiry, and only for a fresh one.
      const { count } = await db.from('email_log').select('id', { count: 'exact', head: true }).eq('related_id', id).eq('template_key', event)
      if (count) return json({ sent: 0, skipped: 0, failed: 0 })
    } else {
      const caller = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } })
      const { data: { user } } = await caller.auth.getUser()
      if (!user) return json({ error: 'Please sign in again.' }, 401)
      const { data: staff } = await db.rpc('is_staff', { _user_id: user.id })
      if (!staff) return json({ error: 'Staff only.' }, 403)
      sentBy = user.id
    }
    return json(await deliver(db, await buildJobs(db, event, id, site, business), sentBy))
  } catch (e) {
    return json({ error: String((e as Error).message ?? e) }, 500)
  }
})
