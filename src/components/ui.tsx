import type { ReactNode } from 'react'

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { key: T; label: string }[]; value: T; onChange: (k: T) => void }) {
  return (
    <div className="mb-6 flex gap-1 overflow-x-auto border-b border-line">
      {tabs.map((t) => (
        <button key={t.key} onClick={() => onChange(t.key)}
          className={`whitespace-nowrap border-b-2 px-4 py-2.5 text-sm ${value === t.key ? 'border-primary font-medium text-primary' : 'border-transparent text-muted hover:text-ink'}`}>
          {t.label}
        </button>
      ))}
    </div>
  )
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  )
}

export function Notice({ kind = 'info', children }: { kind?: 'info' | 'error' | 'success'; children: ReactNode }) {
  const cls = { info: 'bg-primary-soft text-ink', error: 'bg-red-50 text-red-700', success: 'bg-green-50 text-green-700' }[kind]
  return <div className={`rounded-lg px-4 py-3 text-sm ${cls}`}>{children}</div>
}

export function Badge({ tone = 'grey', children }: { tone?: 'grey' | 'green' | 'amber' | 'red' | 'blue'; children: ReactNode }) {
  const cls = {
    grey: 'bg-gray-100 text-gray-700', green: 'bg-green-50 text-green-700', amber: 'bg-amber-50 text-amber-800',
    red: 'bg-red-50 text-red-700', blue: 'bg-primary-soft text-primary',
  }[tone]
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${cls}`}>{children}</span>
}

export function Table({ head, children, empty }: { head: ReactNode[]; children: ReactNode; empty?: string }) {
  const hasRows = Array.isArray(children) ? children.length > 0 : Boolean(children)
  return (
    <div className="overflow-x-auto rounded-xl border border-line bg-white">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-line bg-secondary text-xs uppercase tracking-wide text-muted">
          <tr>{head.map((h, i) => <th key={i} className="px-4 py-3 font-medium">{h}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-line">{children}</tbody>
      </table>
      {!hasRows && <p className="p-8 text-center text-sm text-muted">{empty ?? 'Nothing here yet.'}</p>}
    </div>
  )
}

export const Td = ({ children, className = '' }: { children?: ReactNode; className?: string }) => <td className={`px-4 py-3 align-top ${className}`}>{children}</td>

