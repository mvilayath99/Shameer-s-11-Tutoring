import { useEffect, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { useSettings, type ContentMap } from '../../../lib/SettingsProvider'
import { Field, Notice } from '../../../components/ui'

type Pair = Record<string, string>

function ListEditor({ items, fields, onChange, addLabel }: { items: Pair[]; fields: { key: string; label: string; long?: boolean }[]; onChange: (v: Pair[]) => void; addLabel: string }) {
  return (
    <div className="flex flex-col gap-3">
      {items.map((it, i) => (
        <div key={i} className="flex gap-3 rounded-lg border border-line p-3">
          <div className="grid flex-1 gap-3">
            {fields.map((f) => f.long ? (
              <textarea key={f.key} rows={2} className="input" placeholder={f.label} value={it[f.key] ?? ''} onChange={(e) => onChange(items.map((x, j) => (j === i ? { ...x, [f.key]: e.target.value } : x)))} />
            ) : (
              <input key={f.key} className="input" placeholder={f.label} value={it[f.key] ?? ''} onChange={(e) => onChange(items.map((x, j) => (j === i ? { ...x, [f.key]: e.target.value } : x)))} />
            ))}
          </div>
          <button onClick={() => onChange(items.filter((_, j) => j !== i))} className="text-muted hover:text-red-600" aria-label="Remove"><Trash2 className="h-4 w-4" /></button>
        </div>
      ))}
      <button className="btn-outline self-start" onClick={() => onChange([...items, Object.fromEntries(fields.map((f) => [f.key, '']))])}><Plus className="h-4 w-4" /> {addLabel}</button>
    </div>
  )
}

export default function Content() {
  const { content, refresh } = useSettings()
  const [c, setC] = useState<ContentMap>(content)
  const [msg, setMsg] = useState<{ kind: 'success' | 'error'; text: string } | null>(null)
  useEffect(() => setC(content), [content])

  const setObj = (key: string, field: string, v: string) => setC({ ...c, [key]: { ...(c[key] ?? {}), [field]: v } })

  const save = async () => {
    setMsg(null)
    const rows = ['hero', 'about', 'testimonials', 'faq', 'target_schools', 'privacy', 'terms'].map((key) => ({ key, value: c[key] ?? (['testimonials', 'faq', 'target_schools'].includes(key) ? [] : {}) }))
    const { error } = await supabase.from('site_content').upsert(rows)
    if (error) setMsg({ kind: 'error', text: error.message })
    else { setMsg({ kind: 'success', text: 'Website content saved.' }); refresh() }
  }

  return (
    <div className="flex flex-col gap-6">
      {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
      <section className="card flex flex-col gap-4">
        <h2 className="font-semibold">Home page</h2>
        <Field label="Main heading"><input className="input" value={c.hero?.heading ?? ''} onChange={(e) => setObj('hero', 'heading', e.target.value)} /></Field>
        <Field label="Introduction"><textarea rows={3} className="input" value={c.hero?.intro ?? ''} onChange={(e) => setObj('hero', 'intro', e.target.value)} /></Field>
      </section>
      <section className="card flex flex-col gap-4">
        <h2 className="font-semibold">About the tutor</h2>
        <Field label="Heading"><input className="input" value={c.about?.heading ?? ''} onChange={(e) => setObj('about', 'heading', e.target.value)} /></Field>
        <Field label="Text" hint="Leave a blank line between paragraphs"><textarea rows={6} className="input" value={c.about?.body ?? ''} onChange={(e) => setObj('about', 'body', e.target.value)} /></Field>
        <Field label="Qualifications and checks"><input className="input" value={c.about?.qualifications ?? ''} onChange={(e) => setObj('about', 'qualifications', e.target.value)} /></Field>
      </section>
      <section className="card flex flex-col gap-4">
        <h2 className="font-semibold">Testimonials</h2>
        <ListEditor items={c.testimonials ?? []} fields={[{ key: 'quote', label: 'Quote', long: true }, { key: 'name', label: 'Name, for example "Parent, Year 6"' }]} onChange={(v) => setC({ ...c, testimonials: v })} addLabel="Add testimonial" />
      </section>
      <section className="card flex flex-col gap-4">
        <h2 className="font-semibold">Target schools and areas</h2>
        <ListEditor items={c.target_schools ?? []} fields={[{ key: 'name', label: 'School or area' }, { key: 'board', label: 'Exam board, for example GL' }]} onChange={(v) => setC({ ...c, target_schools: v })} addLabel="Add school" />
      </section>
      <section className="card flex flex-col gap-4">
        <h2 className="font-semibold">FAQ</h2>
        <ListEditor items={c.faq ?? []} fields={[{ key: 'q', label: 'Question' }, { key: 'a', label: 'Answer', long: true }]} onChange={(v) => setC({ ...c, faq: v })} addLabel="Add question" />
      </section>
      <section className="card flex flex-col gap-4">
        <h2 className="font-semibold">Policies</h2>
        <Field label="Privacy policy"><textarea rows={6} className="input" value={c.privacy?.body ?? ''} onChange={(e) => setObj('privacy', 'body', e.target.value)} /></Field>
        <Field label="Terms"><textarea rows={6} className="input" value={c.terms?.body ?? ''} onChange={(e) => setObj('terms', 'body', e.target.value)} /></Field>
      </section>
      <div><button className="btn-primary" onClick={save}>Save website content</button></div>
    </div>
  )
}
