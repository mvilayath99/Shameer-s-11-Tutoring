import { useEffect, useState } from 'react'
import { supabase } from '../../../lib/supabase'
import { useSettings } from '../../../lib/SettingsProvider'
import { Field, Notice } from '../../../components/ui'
import type { SiteSettings } from '../../../lib/types'

const FONTS = ['Inter', 'Nunito Sans', 'Source Sans 3']

export default function Branding() {
  const { settings, refresh } = useSettings()
  const [form, setForm] = useState<SiteSettings>(settings)
  const [msg, setMsg] = useState<{ kind: 'success' | 'error'; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => setForm(settings), [settings])

  const set = <K extends keyof SiteSettings>(k: K, v: SiteSettings[K]) => setForm({ ...form, [k]: v })

  const upload = async (file: File, field: 'logo_url' | 'favicon_url') => {
    const path = `${field}-${Date.now()}.${file.name.split('.').pop()}`
    const { error } = await supabase.storage.from('branding').upload(path, file, { upsert: true })
    if (error) { setMsg({ kind: 'error', text: error.message }); return }
    set(field, supabase.storage.from('branding').getPublicUrl(path).data.publicUrl)
  }

  const save = async () => {
    setBusy(true); setMsg(null)
    const { business_name, tagline, logo_url, favicon_url, primary_color, secondary_color, accent_color, font_family, contact_email, contact_phone, address } = form
    const { error } = await supabase.from('site_settings').update({ business_name, tagline, logo_url, favicon_url, primary_color, secondary_color, accent_color, font_family, contact_email, contact_phone, address }).eq('id', 1)
    setBusy(false)
    if (error) setMsg({ kind: 'error', text: error.message })
    else { setMsg({ kind: 'success', text: 'Saved. The new look is live across the site.' }); refresh() }
  }

  return (
    <div className="grid gap-8 xl:grid-cols-[1fr_20rem]">
      <div className="card flex flex-col gap-6">
        {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Business name"><input className="input" value={form.business_name} onChange={(e) => set('business_name', e.target.value)} /></Field>
          <Field label="Tagline"><input className="input" value={form.tagline ?? ''} onChange={(e) => set('tagline', e.target.value)} /></Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Logo" hint="PNG or SVG, ideally on a transparent background">
            <input type="file" accept="image/*" className="input" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0], 'logo_url')} />
          </Field>
          <Field label="Favicon" hint="Small square icon shown in the browser tab">
            <input type="file" accept="image/*" className="input" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0], 'favicon_url')} />
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          {(['primary_color', 'secondary_color', 'accent_color'] as const).map((k) => (
            <Field key={k} label={{ primary_color: 'Primary colour', secondary_color: 'Background tint', accent_color: 'Accent colour' }[k]}>
              <div className="flex gap-2">
                <input type="color" className="h-10 w-12 cursor-pointer rounded border border-line" value={form[k]} onChange={(e) => set(k, e.target.value)} />
                <input className="input" value={form[k]} onChange={(e) => set(k, e.target.value)} />
              </div>
            </Field>
          ))}
        </div>
        <Field label="Font">
          <select className="input" value={form.font_family} onChange={(e) => set('font_family', e.target.value)}>
            {FONTS.map((f) => <option key={f}>{f}</option>)}
          </select>
        </Field>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Contact email"><input className="input" type="email" value={form.contact_email ?? ''} onChange={(e) => set('contact_email', e.target.value)} /></Field>
          <Field label="Phone"><input className="input" value={form.contact_phone ?? ''} onChange={(e) => set('contact_phone', e.target.value)} /></Field>
          <Field label="Address"><input className="input" value={form.address ?? ''} onChange={(e) => set('address', e.target.value)} /></Field>
        </div>
        <div className="flex gap-3">
          <button className="btn-primary" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save changes'}</button>
          <button className="btn-outline" onClick={() => setForm(settings)}>Reset</button>
        </div>
      </div>

      <div>
        <p className="mb-2 text-sm font-medium">Preview</p>
        <div className="overflow-hidden rounded-xl border border-line bg-white" style={{ fontFamily: form.font_family }}>
          <div className="flex items-center gap-2 border-b border-line p-4">
            {form.logo_url ? <img src={form.logo_url} alt="" className="h-8" /> : <span className="flex h-8 w-8 items-center justify-center rounded-md text-xs font-bold text-white" style={{ background: form.primary_color }}>11+</span>}
            <span className="text-sm font-semibold">{form.business_name}</span>
          </div>
          <div className="p-5" style={{ background: form.secondary_color }}>
            <p className="text-lg font-semibold">{form.business_name}</p>
            <p className="mt-1 text-xs text-muted">{form.tagline}</p>
            <span className="mt-4 inline-block rounded-md px-3 py-1.5 text-xs font-medium text-white" style={{ background: form.primary_color }}>Book a free assessment</span>
            <span className="ml-2 inline-block h-2 w-8 rounded" style={{ background: form.accent_color }} />
          </div>
        </div>
      </div>
    </div>
  )
}
