import type { ReactNode } from 'react'
import { X } from 'lucide-react'

export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-black/25 p-4 sm:p-10" onClick={onClose}>
      <div className={`w-full ${wide ? 'max-w-3xl' : 'max-w-xl'} rounded-xl bg-white p-6 shadow-xl`} onClick={(e) => e.stopPropagation()}>
        <div className="mb-5 flex items-start justify-between gap-4">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="text-muted hover:text-ink"><X className="h-5 w-5" /></button>
        </div>
        {children}
      </div>
    </div>
  )
}
