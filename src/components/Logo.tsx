import { Link } from 'react-router-dom'
import { useSettings } from '../lib/SettingsProvider'

export function Logo({ to = '/' }: { to?: string }) {
  const { settings } = useSettings()
  return (
    <Link to={to} className="flex items-center gap-2.5 font-semibold text-ink">
      {settings.logo_url ? (
        <img src={settings.logo_url} alt={settings.business_name} className="h-9 w-auto" />
      ) : (
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-xs font-bold text-white">11+</span>
      )}
      <span className="text-base sm:text-lg">{settings.business_name}</span>
    </Link>
  )
}
