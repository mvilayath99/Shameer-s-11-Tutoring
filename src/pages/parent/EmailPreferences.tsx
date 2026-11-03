import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/AuthProvider'
import { PageHeader } from '../../components/PortalLayout'
import { useModuleName } from '../../components/ModuleGate'

interface Template { key: string; name: string; description: string | null; audience: string; enabled: boolean }
const ALWAYS = ['invoice_sent', 'invoice_reminder']

export default function EmailPreferences() {
  const title = useModuleName('messages', 'Messages')
  const { session } = useAuth()
  const [templates, setTemplates] = useState<Template[]>([])
  const [off, setOff] = useState<Set<string>>(new Set())
  useEffect(() => {
    if (!session) return
    Promise.all([
      supabase.from('email_templates').select('key, name, description, audience, enabled').eq('audience', 'family').eq('enabled', true).order('name'),
      supabase.from('notification_prefs').select('template_key, enabled').eq('user_id', session.user.id),
    ]).then(([{ data: t }, { data: p }]) => {
      setTemplates((t ?? []) as Template[])
      setOff(new Set((p ?? []).filter((x) => !x.enabled).map((x) => x.template_key)))
    })
  }, [session])
  const toggle = async (key: string, on: boolean) => {
    if (!session) return
    await supabase.from('notification_prefs').upsert({ user_id: session.user.id, template_key: key, enabled: on })
    const next = new Set(off); if (on) next.delete(key); else next.add(key); setOff(next)
  }
  return (
    <>
      <PageHeader title={title} subtitle="Choose which emails you'd like from us." />
      <div className="card max-w-2xl divide-y divide-line p-0">
        {templates.map((t) => {
          const locked = ALWAYS.includes(t.key)
          return (
            <label key={t.key} className="flex items-start justify-between gap-4 px-6 py-4">
              <span><span className="block font-medium">{t.name}</span><span className="text-sm text-muted">{locked ? 'Always sent, so you never miss an invoice.' : t.description}</span></span>
              <input type="checkbox" className="mt-1" disabled={locked} checked={locked || !off.has(t.key)} onChange={(e) => toggle(t.key, e.target.checked)} />
            </label>
          )
        })}
        {!templates.length && <p className="px-6 py-4 text-sm text-muted">No emails are set up yet.</p>}
      </div>
    </>
  )
}
