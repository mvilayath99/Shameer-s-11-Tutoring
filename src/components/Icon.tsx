import {
  BarChart3, BookOpen, Calendar, ClipboardCheck, Folder, Inbox, LayoutDashboard, MessageSquare,
  Receipt, Settings, Users, UsersRound, type LucideIcon,
} from 'lucide-react'

const ICONS: Record<string, LucideIcon> = {
  inbox: Inbox, users: Users, 'users-round': UsersRound, calendar: Calendar, 'book-open': BookOpen,
  folder: Folder, 'clipboard-check': ClipboardCheck, receipt: Receipt, 'message-square': MessageSquare,
  'bar-chart': BarChart3, dashboard: LayoutDashboard, settings: Settings,
}

export function Icon({ name, className = 'h-4 w-4' }: { name: string | null; className?: string }) {
  const C = (name && ICONS[name]) || Folder
  return <C className={className} aria-hidden />
}
