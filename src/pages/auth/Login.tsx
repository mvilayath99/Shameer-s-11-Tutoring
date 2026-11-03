import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AuthCard, FormMessage } from '../../components/AuthCard'
import { supabase, isConfigured } from '../../lib/supabase'
import { useAuth } from '../../lib/AuthProvider'
import { homePortal } from '../../lib/roles'

export function NotConfigured() {
  return isConfigured ? null : (
    <FormMessage kind="error">The database is not connected yet. Add the Supabase settings in Netlify to enable sign-in.</FormMessage>
  )
}

/** Sends a signed-in user to their own area. */
export function useRedirectWhenSignedIn() {
  const { session, roles, loading } = useAuth()
  const navigate = useNavigate()
  useEffect(() => {
    if (!loading && session) {
      const p = homePortal(roles)
      if (p) navigate(`/${p}`, { replace: true })
    }
  }, [loading, session, roles, navigate])
}

export default function Login() {
  useRedirectWhenSignedIn()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true); setError(null)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setError(error.message === 'Invalid login credentials' ? 'That email and password do not match.' : error.message)
    setBusy(false)
  }

  return (
    <AuthCard title="Sign in" subtitle="For parents and staff">
      <form onSubmit={submit} className="flex flex-col gap-4">
        <NotConfigured />
        {error && <FormMessage kind="error">{error}</FormMessage>}
        <div><label className="label" htmlFor="email">Email</label><input id="email" type="email" className="input" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" /></div>
        <div>
          <div className="flex justify-between"><label className="label" htmlFor="password">Password</label><Link to="/forgot-password" className="text-sm text-primary">Forgotten?</Link></div>
          <input id="password" type="password" className="input" required value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
        </div>
        <button className="btn-primary" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
      </form>
      <div className="mt-6 flex flex-col gap-2 text-center text-sm text-muted">
        <span>New parent? <Link to="/signup" className="text-primary">Create an account</Link></span>
        <span>Student? <Link to="/student-login" className="text-primary">Sign in with your username</Link></span>
      </div>
    </AuthCard>
  )
}
