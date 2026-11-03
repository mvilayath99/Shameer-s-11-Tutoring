import { Link } from 'react-router-dom'
import { Page } from './Simple'
import { useSettings } from '../../lib/SettingsProvider'

const COURSES = [
  { title: '1:1 lessons', text: 'A lesson plan built around your child: their strengths, gaps, target schools and exam board. Weekly or fortnightly.' },
  { title: 'Small group lessons', text: 'Small groups of children at a similar level, working through exam-style questions together.' },
  { title: 'Online lessons', text: 'Live lessons on Microsoft Teams. No account needed: you get a link for each lesson.' },
  { title: 'In-person lessons', text: 'Face-to-face lessons for children who learn best in the room.' },
  { title: 'Mock exam practice', text: 'Timed papers in exam conditions, marked with feedback on what to work on next.' },
  { title: 'Holiday intensives', text: 'Focused sessions in the school holidays in the run-up to the exam.' },
]
const SUBJECTS = ['Maths', 'English', 'Verbal reasoning', 'Non-verbal reasoning']

export function Courses() {
  return (
    <Page title="Courses" intro="Lessons in every 11+ subject, 1:1 or in small groups, online or in person.">
      <div className="flex flex-wrap gap-2">{SUBJECTS.map((s) => <span key={s} className="rounded-full bg-primary-soft px-3 py-1 text-sm text-primary">{s}</span>)}</div>
      <div className="grid gap-4 sm:grid-cols-2">
        {COURSES.map((c) => (
          <div key={c.title} className="card"><h2 className="font-semibold text-ink">{c.title}</h2><p className="mt-2 text-sm">{c.text}</p></div>
        ))}
      </div>
      <div className="card flex flex-col items-start gap-3 bg-secondary sm:flex-row sm:items-center sm:justify-between">
        <p className="text-ink"><strong>Prices on request.</strong> Fees depend on year group and lesson type.</p>
        <Link to="/contact" className="btn-primary">Ask about fees</Link>
      </div>
    </Page>
  )
}

const BOARDS = [
  { name: 'GL Assessment', text: 'Used by many grammar schools. Usually multiple choice across English, maths, verbal and non-verbal reasoning.' },
  { name: 'CEM', text: 'Mixed papers combining verbal, numerical and non-verbal reasoning, often timed by section.' },
  { name: 'CSSE', text: 'Consortium of Selective Schools in Essex. English and maths papers with written answers.' },
  { name: 'ISEB', text: 'Common pre-test used by many independent schools, taken on screen.' },
  { name: 'Independent schools', text: 'Schools that set their own entrance papers, often with creative writing and interviews.' },
]

export function ExamBoards() {
  const { content } = useSettings()
  const schools: { name: string; board?: string }[] = content.target_schools ?? []
  return (
    <Page title="Exam boards and schools" intro="We prepare children for every UK 11+ format.">
      <div className="grid gap-4 sm:grid-cols-2">
        {BOARDS.map((b) => <div key={b.name} className="card"><h2 className="font-semibold text-ink">{b.name}</h2><p className="mt-2 text-sm">{b.text}</p></div>)}
      </div>
      {schools.length > 0 && (
        <>
          <h2 className="mt-6 text-xl font-semibold text-ink">Schools we prepare for</h2>
          <ul className="grid gap-2 sm:grid-cols-2">
            {schools.map((s) => <li key={s.name} className="flex justify-between rounded-lg border border-line px-4 py-3 text-sm"><span className="text-ink">{s.name}</span><span>{s.board}</span></li>)}
          </ul>
        </>
      )}
    </Page>
  )
}

export function Faq() {
  const { content } = useSettings()
  const faq: { q: string; a: string }[] = content.faq ?? []
  return (
    <Page title="Frequently asked questions">
      <div className="divide-y divide-line rounded-xl border border-line">
        {faq.map((f) => (
          <details key={f.q} className="group p-5">
            <summary className="cursor-pointer list-none font-medium text-ink">{f.q}</summary>
            <p className="mt-3 text-sm">{f.a}</p>
          </details>
        ))}
      </div>
    </Page>
  )
}
