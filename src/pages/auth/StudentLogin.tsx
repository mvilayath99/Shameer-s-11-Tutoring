import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { AuthCard, FormMessage } from '../../components/AuthCard'
import { supabase, studentEmail } from '../../lib/supabase'
import { NotConfigured, useRedirectWhenSignedIn } from './Login'

export default function StudentLogin() {
  useRedirectWhenSignedIn()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true); setError(null)
    const { error } = await supabase.auth.signInWithPassword({ email: studentEmail(username), password })
    if (error) setError('That username and password do not match. Ask your parent to check them.')
    setBusy(false)
  }

  return (
    <AuthCard title="Student sign in" subtitle="Use the username and password your parent set up">
      <form onSubmit={submit} className="flex flex-col gap-4">
        <NotConfigured />
        {error && <FormMessage kind="error">{error}</FormMessage>}
        <div><label className="label" htmlFor="username">Username</label><input id="username" className="input" required value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" autoCapitalize="none" /></div>
        <div><label className="label" htmlFor="password">Password</label><input id="password" type="password" className="input" required value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" /></div>
        <button className="btn-primary" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
      </form>
      <p className="mt-6 text-center text-sm text-muted">Parent or tutor? <Link to="/login" className="text-primary">Sign in here</Link></p>
    </AuthCard>
  )
}
