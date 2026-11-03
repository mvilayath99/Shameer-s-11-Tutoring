import { Link } from 'react-router-dom'
import { BookOpen, CalendarCheck, LineChart, MonitorSmartphone, UserRound, Users } from 'lucide-react'
import { useSettings } from '../../lib/SettingsProvider'

const OFFER = [
  { icon: UserRound, title: '1:1 lessons', text: 'Lessons planned around your child’s strengths, gaps and target schools.' },
  { icon: Users, title: 'Small groups', text: 'Focused groups of a few children working at a similar level.' },
  { icon: MonitorSmartphone, title: 'Online or in person', text: 'Join live lessons on Microsoft Teams, or come along in person.' },
]
const WHY = [
  { icon: BookOpen, title: 'Every exam board', text: 'GL Assessment, CEM, CSSE and ISEB, plus independent school entrance exams.' },
  { icon: CalendarCheck, title: 'Homework and mocks', text: 'Regular practice papers and timed mock tests in exam conditions.' },
  { icon: LineChart, title: 'Clear progress', text: 'Parents see lesson feedback, homework marks and progress in one place.' },
]

export default function Home() {
  const { settings } = useSettings()
  return (
    <>
      <section className="border-b border-line bg-secondary">
        <div className="container-page py-20 sm:py-28">
          <p className="text-sm font-medium uppercase tracking-wide text-primary">11+ tutoring · Maths · English · Verbal and non-verbal reasoning</p>
          <h1 className="mt-4 max-w-3xl text-4xl font-semibold leading-tight text-ink sm:text-5xl">{settings.business_name}</h1>
          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-muted">{settings.tagline}</p>
          <div className="mt-10 flex flex-wrap gap-3">
            <Link to="/contact" className="btn-primary px-6 py-3 text-base">Book a free assessment</Link>
            <Link to="/about" className="btn-outline px-6 py-3 text-base">About us</Link>
          </div>
        </div>
      </section>

      <Section title="What we offer">
        {OFFER.map((o) => <Feature key={o.title} {...o} />)}
      </Section>
      <Section title="Why families choose us" muted>
        {WHY.map((o) => <Feature key={o.title} {...o} />)}
      </Section>

      <section className="container-page py-20 text-center">
        <h2 className="text-2xl font-semibold">Not sure where to start?</h2>
        <p className="mx-auto mt-3 max-w-xl text-muted">A free assessment shows where your child is now and what they need before the exam.</p>
        <Link to="/contact" className="btn-primary mt-8 px-6 py-3 text-base">Book a free assessment</Link>
      </section>
    </>
  )
}

function Section({ title, muted, children }: { title: string; muted?: boolean; children: React.ReactNode }) {
  return (
    <section className={muted ? 'border-y border-line bg-secondary' : ''}>
      <div className="container-page py-20">
        <h2 className="text-2xl font-semibold">{title}</h2>
        <div className="mt-10 grid gap-6 md:grid-cols-3">{children}</div>
      </div>
    </section>
  )
}

function Feature({ icon: I, title, text }: { icon: React.ComponentType<{ className?: string }>; title: string; text: string }) {
  return (
    <div className="card">
      <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-soft text-primary"><I className="h-5 w-5" /></span>
      <h3 className="mt-5 font-semibold">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-muted">{text}</p>
    </div>
  )
}
