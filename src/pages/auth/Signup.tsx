import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { AuthCard, FormMessage } from '../../components/AuthCard'
import { supabase } from '../../lib/supabase'
import { NotConfigured, useRedirectWhenSignedIn } from './Login'

export default function Signup() {
  useRedirectWhenSignedIn()
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (password.length < 8) { setError('Please use at least 8 characters for your password.'); return }
    setBusy(true); setError(null)
    const { data, error } = await supabase.auth.signUp({
      email, password,
      options: { data: { full_name: fullName }, emailRedirectTo: `${window.location.origin}/login` },
    })
    if (error) setError(error.message)
    else if (!data.session) setDone(true)
    setBusy(false)
  }

  if (done) {
    return (
      <AuthCard title="Check your email">
        <p className="text-sm text-muted">We have sent a confirmation link to <strong className="text-ink">{email}</strong>. Click it to finish creating your account.</p>
      </AuthCard>
    )
  }

  return (
    <AuthCard title="Create a parent account" subtitle="You can add your children after signing up">
      <form onSubmit={submit} className="flex flex-col gap-4">
        <NotConfigured />
        {error && <FormMessage kind="error">{error}</FormMessage>}
        <div><label className="label" htmlFor="name">Your full name</label><input id="name" className="input" required value={fullName} onChange={(e) => setFullName(e.target.value)} autoComplete="name" /></div>
        <div><label className="label" htmlFor="email">Email</label><input id="email" type="email" className="input" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" /></div>
        <div><label className="label" htmlFor="password">Password</label><input id="password" type="password" className="input" required value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" /><p className="mt-1 text-xs text-muted">At least 8 characters</p></div>
        <button className="btn-primary" disabled={busy}>{busy ? 'Creating account…' : 'Create account'}</button>
      </form>
      <p className="mt-6 text-center text-sm text-muted">Already have an account? <Link to="/login" className="text-primary">Sign in</Link></p>
    </AuthCard>
  )
}
