import type { ReactNode } from 'react'
import { useSettings } from '../../lib/SettingsProvider'

export function Page({ title, intro, children }: { title: string; intro?: string; children: ReactNode }) {
  return (
    <div className="container-page max-w-4xl py-16 sm:py-20">
      <h1 className="text-3xl font-semibold sm:text-4xl">{title}</h1>
      {intro && <p className="mt-4 max-w-2xl text-lg leading-relaxed text-muted">{intro}</p>}
      <div className="mt-10 flex flex-col gap-4 leading-relaxed text-muted">{children}</div>
    </div>
  )
}

export const Paragraphs = ({ text }: { text?: string }) => (
  <>{(text ?? '').split(/\n\s*\n/).filter(Boolean).map((p, i) => <p key={i}>{p}</p>)}</>
)

export function About() {
  const { content } = useSettings()
  const about = content.about ?? {}
  return (
    <Page title={about.heading || 'About us'}>
      <Paragraphs text={about.body || 'We prepare children in Years 4 to 6 for 11+ entrance exams across the UK.'} />
      {about.qualifications && <p className="card text-sm font-medium text-ink">{about.qualifications}</p>}
    </Page>
  )
}

export function Privacy() {
  const { content } = useSettings()
  return <Page title="Privacy policy"><Paragraphs text={content.privacy?.body || 'Privacy policy to be added.'} /></Page>
}

export function Terms() {
  const { content } = useSettings()
  return <Page title="Terms"><Paragraphs text={content.terms?.body || 'Terms to be added.'} /></Page>
}

export function NotFound() {
  return <Page title="Page not found"><p>Sorry, we can’t find that page.</p></Page>
}
