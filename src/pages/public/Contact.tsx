import { useState, type FormEvent } from 'react'
import { CheckCircle2 } from 'lucide-react'
import { Page } from './Simple'
import { supabase, isConfigured } from '../../lib/supabase'
import { notify } from '../../lib/notify'
import { useSettings } from '../../lib/SettingsProvider'
import { Field, Notice } from '../../components/ui'

const EMPTY = {
  parent_name: '', email: '', phone: '', child_name: '', school_year: '', current_school: '', target_schools: '',
  exam_board: '', preferred_format: 'either', preferred_delivery: 'either', availability: '', message: '',
}

export default function Contact() {
  const { settings } = useSettings()
  const [f, setF] = useState(EMPTY)
  const [consent, setConsent] = useState(false)
  const [website, setWebsite] = useState('') // honeypot: real people leave this empty
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const set = (k: keyof typeof EMPTY) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value })

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (website) { setState('sent'); return }
    setState('sending')
    const id = crypto.randomUUID()
    const { error } = await supabase.from('enquiries').insert({ id, ...f, phone: f.phone || null, consent })
    if (!error) notify('enquiry_received', id)
    setState(error ? 'error' : 'sent')
  }

  return (
    <Page title="Book a free assessment" intro="Tell us a little about your child and we’ll be in touch within two working days.">
      <div className="grid gap-8 lg:grid-cols-[1fr_18rem]">
        {state === 'sent' ? (
          <div className="card flex flex-col items-start gap-3">
            <CheckCircle2 className="h-8 w-8 text-primary" />
            <h2 className="text-xl font-semibold text-ink">Thank you</h2>
            <p>We’ve received your enquiry and will contact you soon.</p>
          </div>
        ) : (
          <form onSubmit={submit} className="card flex flex-col gap-5">
            {!isConfigured && <Notice kind="error">The enquiry form will work once the database is connected.</Notice>}
            {state === 'error' && <Notice kind="error">Sorry, something went wrong. Please try again or email us.</Notice>}
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Your name *"><input className="input" required value={f.parent_name} onChange={set('parent_name')} autoComplete="name" /></Field>
              <Field label="Email *"><input className="input" type="email" required value={f.email} onChange={set('email')} autoComplete="email" /></Field>
              <Field label="Phone"><input className="input" value={f.phone} onChange={set('phone')} autoComplete="tel" /></Field>
              <Field label="Child’s name *"><input className="input" required value={f.child_name} onChange={set('child_name')} /></Field>
              <Field label="School year">
                <select className="input" value={f.school_year} onChange={set('school_year')}>
                  <option value="">Choose…</option>{['Year 3', 'Year 4', 'Year 5', 'Year 6'].map((y) => <option key={y}>{y}</option>)}
                </select>
              </Field>
              <Field label="Current school"><input className="input" value={f.current_school} onChange={set('current_school')} /></Field>
              <Field label="Target schools"><input className="input" value={f.target_schools} onChange={set('target_schools')} /></Field>
              <Field label="Exam board, if known">
                <select className="input" value={f.exam_board} onChange={set('exam_board')}>
                  <option value="">Not sure</option>{['GL Assessment', 'CEM', 'CSSE', 'ISEB', 'Independent school'].map((y) => <option key={y}>{y}</option>)}
                </select>
              </Field>
              <Field label="Lesson type">
                <select className="input" value={f.preferred_format} onChange={set('preferred_format')}>
                  <option value="either">Either</option><option value="1:1">1:1</option><option value="group">Small group</option>
                </select>
              </Field>
              <Field label="Online or in person">
                <select className="input" value={f.preferred_delivery} onChange={set('preferred_delivery')}>
                  <option value="either">Either</option><option value="online">Online</option><option value="in_person">In person</option>
                </select>
              </Field>
            </div>
            <Field label="Days and times that suit you"><input className="input" value={f.availability} onChange={set('availability')} placeholder="For example weekday evenings, Saturday mornings" /></Field>
            <Field label="Anything else we should know?"><textarea rows={4} className="input" value={f.message} onChange={set('message')} /></Field>
            <input tabIndex={-1} autoComplete="off" className="hidden" value={website} onChange={(e) => setWebsite(e.target.value)} aria-hidden />
            <label className="flex items-start gap-3 text-sm">
              <input type="checkbox" className="mt-0.5 h-4 w-4" required checked={consent} onChange={(e) => setConsent(e.target.checked)} />
              <span>I agree to be contacted about this enquiry. See our <a href="/privacy" className="text-primary underline">privacy policy</a>.</span>
            </label>
            <button className="btn-primary self-start px-6" disabled={state === 'sending'}>{state === 'sending' ? 'Sending…' : 'Send enquiry'}</button>
          </form>
        )}
        <aside className="flex flex-col gap-4 text-sm">
          <div className="card"><p className="font-medium text-ink">Email</p><p>{settings.contact_email || 'To be added'}</p></div>
          <div className="card"><p className="font-medium text-ink">Phone</p><p>{settings.contact_phone || 'To be added'}</p></div>
          <div className="card"><p className="font-medium text-ink">Address</p><p>{settings.address || 'To be added'}</p></div>
        </aside>
      </div>
    </Page>
  )
}
