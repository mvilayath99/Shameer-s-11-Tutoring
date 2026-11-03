import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { PageHeader } from '../../components/PortalLayout'
import { useModuleName } from '../../components/ModuleGate'
import { Badge, Field, Notice, Table, Tabs, Td } from '../../components/ui'

type Tab = 'templates' | 'log' | 'setup'
interface Template { key: string; name: string; description: string | null; audience: 'family' | 'staff'; subject: string; body: string; enabled: boolean }
interface LogRow { id: string; created_at: string; template_key: string | null; to_email: string; subject: string; status: 'sent' | 'failed' | 'skipped'; error: string | null }

const PLACEHOLDERS = ['parent_name', 'child_name', 'business_name', 'invoice_number', 'amount', 'due_date', 'lesson_time', 'lesson_place', 'homework_title', 'score', 'link']

export default function Messages() {
  const title = useModuleName('messages', 'Messages')
  const [tab, setTab] = useState<Tab>('templates')
  return (
    <>
      <PageHeader title={title} subtitle="The emails families receive, and a record of what was sent." />
      <Tabs<Tab> value={tab} onChange={setTab} tabs={[{ key: 'templates', label: 'Email templates' }, { key: 'log', label: 'Sent emails' }, { key: 'setup', label: 'Setup' }]} />
      {tab === 'templates' && <Templates />}
      {tab === 'log' && <EmailLog />}
      {tab === 'setup' && <Setup />}
    </>
  )
}

function Templates() {
  const [rows, setRows] = useState<Template[]>([])
  const [open, setOpen] = useState<Template | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const load = useCallback(async () => {
    const { data } = await supabase.from('email_templates').select('*').order('name')
    setRows((data ?? []) as Template[])
  }, [])
  useEffect(() => { load() }, [load])

  const save = async () => {
    if (!open) return
    const { error } = await supabase.from('email_templates').update({ subject: open.subject, body: open.body, enabled: open.enabled }).eq('key', open.key)
    setMsg(error ? error.message : `Saved "${open.name}".`); if (!error) { setOpen(null); load() }
  }
  const toggle = async (t: Template) => { await supabase.from('email_templates').update({ enabled: !t.enabled }).eq('key', t.key); load() }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
      <div className="space-y-2">
        {msg && <Notice kind="success">{msg}</Notice>}
        {rows.map((t) => (
          <div key={t.key} className={`card flex items-start justify-between gap-4 ${open?.key === t.key ? 'ring-2 ring-primary' : ''}`}>
            <button className="text-left" onClick={() => { setOpen(t); setMsg(null) }}>
              <p className="font-medium">{t.name} {t.audience === 'staff' && <Badge>To tutors</Badge>}</p>
              <p className="text-sm text-muted">{t.description}</p>
            </button>
            <label className="flex shrink-0 items-center gap-2 text-sm text-muted">
              <input type="checkbox" checked={t.enabled} onChange={() => toggle(t)} /> On
            </label>
          </div>
        ))}
      </div>
      <div>
        {open ? (
          <div className="card sticky top-6 space-y-4">
            <h2 className="font-semibold">{open.name}</h2>
            <Field label="Subject"><input className="input" value={open.subject} onChange={(e) => setOpen({ ...open, subject: e.target.value })} /></Field>
            <Field label="Message"><textarea className="input font-mono text-sm" rows={12} value={open.body} onChange={(e) => setOpen({ ...open, body: e.target.value })} /></Field>
            <div className="text-xs text-muted">
              <p className="mb-1">You can use these, and they'll be filled in for each family:</p>
              <div className="flex flex-wrap gap-1">{PLACEHOLDERS.map((p) => <code key={p} className="rounded bg-secondary px-1.5 py-0.5">{`{{${p}}}`}</code>)}</div>
            </div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={open.enabled} onChange={(e) => setOpen({ ...open, enabled: e.target.checked })} /> Send this email</label>
            <div className="flex justify-end gap-2"><button className="btn-outline" onClick={() => setOpen(null)}>Close</button><button className="btn-primary" onClick={save}>Save</button></div>
          </div>
        ) : <div className="card text-sm text-muted">Choose an email to change its wording, or switch it off.</div>}
      </div>
    </div>
  )
}

function EmailLog() {
  const [rows, setRows] = useState<LogRow[]>([])
  useEffect(() => { supabase.from('email_log').select('*').order('created_at', { ascending: false }).limit(300).then(({ data }) => setRows((data ?? []) as LogRow[])) }, [])
  const tone = { sent: 'green', failed: 'red', skipped: 'amber' } as const
  const label = { sent: 'Sent', failed: 'Failed', skipped: 'Not sent' }
  return (
    <Table head={['When', 'To', 'Subject', 'Status']} empty="No emails yet.">
      {rows.map((r) => (
        <tr key={r.id}>
          <Td className="whitespace-nowrap text-muted">{new Date(r.created_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</Td>
          <Td>{r.to_email}</Td>
          <Td>{r.subject}</Td>
          <Td><Badge tone={tone[r.status]}>{label[r.status]}</Badge>{r.error && <p className="mt-1 max-w-xs text-xs text-muted">{r.error}</p>}</Td>
        </tr>
      ))}
    </Table>
  )
}

function Setup() {
  const [last, setLast] = useState<LogRow | null>(null)
  useEffect(() => { supabase.from('email_log').select('*').order('created_at', { ascending: false }).limit(1).maybeSingle().then(({ data }) => setLast(data as LogRow | null)) }, [])
  const working = last?.status === 'sent'
  return (
    <div className="card max-w-2xl space-y-4 text-sm">
      {working ? <Notice kind="success">Email is working. The last email was sent on {new Date(last!.created_at).toLocaleDateString('en-GB')}.</Notice>
        : <Notice>Emails are recorded under "Sent emails" but won't go out until email sending is connected.</Notice>}
      <p className="font-medium">Connecting email (one-off, done by the super admin)</p>
      <ol className="list-decimal space-y-1.5 pl-5 text-muted">
        <li>Create a free account at resend.com and add your email domain, then follow their steps to verify it.</li>
        <li>Create an API key in Resend.</li>
        <li>In Supabase, open Edge Functions → Secrets and add <code>RESEND_API_KEY</code>, <code>EMAIL_FROM</code> (for example <code>Shameer's 11+ Tutoring &lt;hello@yourdomain.co.uk&gt;</code>) and <code>SITE_URL</code> (this website's address).</li>
        <li>For lesson reminders and overdue reminders each morning, also add <code>CRON_SECRET</code> and switch on the daily job described in the README.</li>
      </ol>
      <p className="text-muted">Families can turn off lesson and homework emails from their own Messages page. Invoice emails always go out.</p>
    </div>
  )
}
