import type { ReactNode } from 'react'
import { Logo } from './Logo'

export function AuthCard({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-secondary px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 flex justify-center"><Logo /></div>
        <div className="card">
          <h1 className="text-xl font-semibold">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
          <div className="mt-6">{children}</div>
        </div>
      </div>
    </div>
  )
}

export function FormMessage({ kind, children }: { kind: 'error' | 'success'; children: ReactNode }) {
  return (
    <p className={`rounded-lg px-3 py-2 text-sm ${kind === 'error' ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>{children}</p>
  )
}
