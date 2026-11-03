import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase, isConfigured } from './supabase'
import type { AppRole } from './types'

interface Profile { id: string; full_name: string | null; email: string | null; username: string | null }

interface Ctx {
  session: Session | null
  profile: Profile | null
  roles: AppRole[]
  loading: boolean
  signOut: () => Promise<void>
}

const AuthContext = createContext<Ctx>({ session: null, profile: null, roles: [], loading: true, signOut: async () => {} })

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [roles, setRoles] = useState<AppRole[]>([])
  const [loading, setLoading] = useState(isConfigured)

  useEffect(() => {
    if (!isConfigured) return
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!isConfigured) return
    const userId = session?.user.id
    if (!userId) { setProfile(null); setRoles([]); setLoading(false); return }
    setLoading(true)
    // Defer so we never call Supabase inside the auth callback itself.
    const t = setTimeout(async () => {
      const [{ data: p }, { data: r }] = await Promise.all([
        supabase.from('profiles').select('id, full_name, email, username').eq('id', userId).maybeSingle(),
        supabase.from('user_roles').select('role').eq('user_id', userId),
      ])
      setProfile(p ?? null)
      setRoles((r ?? []).map((x) => x.role as AppRole))
      setLoading(false)
    }, 0)
    return () => clearTimeout(t)
  }, [session?.user.id])

  const signOut = async () => { await supabase.auth.signOut() }

  return <AuthContext.Provider value={{ session, profile, roles, loading, signOut }}>{children}</AuthContext.Provider>
}

export const useAuth = () => useContext(AuthContext)
