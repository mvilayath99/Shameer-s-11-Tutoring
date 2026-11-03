import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { supabase, isConfigured } from './supabase'
import { tint } from './color'
import type { ModuleRow, SiteSettings } from './types'

export const DEFAULT_SETTINGS: SiteSettings = {
  business_name: "Shameer's 11+ Tutoring",
  tagline: 'Friendly, focused 11+ preparation for every UK exam board',
  logo_url: null,
  favicon_url: null,
  primary_color: '#2F6F8F',
  secondary_color: '#F4F7F9',
  accent_color: '#C98B2B',
  font_family: 'Inter',
  contact_email: null,
  contact_phone: null,
  address: null,
}

interface Ctx {
  settings: SiteSettings
  modules: ModuleRow[]
  refresh: () => Promise<void>
}

const SettingsContext = createContext<Ctx>({ settings: DEFAULT_SETTINGS, modules: [], refresh: async () => {} })

function applyTheme(s: SiteSettings) {
  const root = document.documentElement.style
  root.setProperty('--color-primary', s.primary_color)
  root.setProperty('--color-primary-soft', tint(s.primary_color))
  root.setProperty('--color-secondary', s.secondary_color)
  root.setProperty('--color-accent', s.accent_color)
  root.setProperty('--font-family', `'${s.font_family}'`)
  document.title = s.business_name
  if (s.favicon_url) {
    const link = document.querySelector<HTMLLinkElement>('link[rel="icon"]')
    if (link) link.href = s.favicon_url
  }
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<SiteSettings>(DEFAULT_SETTINGS)
  const [modules, setModules] = useState<ModuleRow[]>([])

  const refresh = useCallback(async () => {
    if (!isConfigured) return
    const [{ data: s }, { data: m }] = await Promise.all([
      supabase.from('site_settings').select('*').eq('id', 1).maybeSingle(),
      supabase.from('modules').select('*').order('sort_order'),
    ])
    if (s) setSettings({ ...DEFAULT_SETTINGS, ...s })
    if (m) setModules(m as ModuleRow[])
  }, [])

  useEffect(() => { refresh() }, [refresh])
  useEffect(() => { applyTheme(settings) }, [settings])

  return <SettingsContext.Provider value={{ settings, modules, refresh }}>{children}</SettingsContext.Provider>
}

export const useSettings = () => useContext(SettingsContext)
