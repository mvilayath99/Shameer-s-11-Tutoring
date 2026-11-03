import type { ReactNode } from 'react'
import { useSettings } from '../../lib/SettingsProvider'

function Page({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="container-page max-w-3xl py-16 sm:py-20">
      <h1 className="text-3xl font-semibold">{title}</h1>
      <div className="mt-8 flex flex-col gap-4 leading-relaxed text-muted">{children}</div>
    </div>
  )
}

export function About() {
  const { settings } = useSettings()
  return (
    <Page title="About us">
      <p>{settings.business_name} prepares children in Years 4 to 6 for 11+ entrance exams across the UK, covering GL Assessment, CEM, CSSE, ISEB and independent school papers.</p>
      <p>Lessons cover maths, English, verbal reasoning and non-verbal reasoning, in 1:1 sessions or small groups, online on Microsoft Teams or in person.</p>
      <p className="text-sm italic">This text is a placeholder. It can be edited from Site settings.</p>
    </Page>
  )
}

export function Contact() {
  const { settings } = useSettings()
  return (
    <Page title="Contact and free assessment">
      <p>To book a free assessment or ask a question, get in touch below. An enquiry form will be added here shortly.</p>
      <dl className="card grid gap-4 text-sm sm:grid-cols-3">
        <div><dt className="font-medium text-ink">Email</dt><dd>{settings.contact_email || 'To be added'}</dd></div>
        <div><dt className="font-medium text-ink">Phone</dt><dd>{settings.contact_phone || 'To be added'}</dd></div>
        <div><dt className="font-medium text-ink">Address</dt><dd>{settings.address || 'To be added'}</dd></div>
      </dl>
    </Page>
  )
}

export function Privacy() {
  return <Page title="Privacy policy"><p>Placeholder privacy policy. It will explain what data we hold about families and children, why, and how to ask for it to be deleted.</p></Page>
}

export function Terms() {
  return <Page title="Terms"><p>Placeholder terms covering bookings, cancellations, invoices and payment.</p></Page>
}

export function NotFound() {
  return <Page title="Page not found"><p>Sorry, we can’t find that page.</p></Page>
}
