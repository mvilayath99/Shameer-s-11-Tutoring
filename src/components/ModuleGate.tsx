import type { ReactNode } from 'react'
import { useSettings } from '../lib/SettingsProvider'
import { PageHeader } from './PortalLayout'

/** Hides a section when the super admin has switched its module off. */
export function ModuleGate({ moduleKey, children }: { moduleKey: string; children: ReactNode }) {
  const { modules } = useSettings()
  const mod = modules.find((m) => m.key === moduleKey)
  if (mod && !mod.enabled) return <PageHeader title="Not available" subtitle="This section has been switched off." />
  return <>{children}</>
}

export function useModuleName(key: string, fallback: string) {
  const { modules } = useSettings()
  return modules.find((m) => m.key === key)?.display_name ?? fallback
}
