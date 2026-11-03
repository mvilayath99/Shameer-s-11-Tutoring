import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { AuthCard, FormMessage } from '../../components/AuthCard'
import { supabase } from '../../lib/supabase'

export default function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/reset-password` })
    if (error) setError(error.message); else setSent(true)
  }

  return (
    <AuthCard title="Reset your password" subtitle="We'll email you a link to choose a new one">
      {sent ? (
        <FormMessage kind="success">If an account exists for {email}, a reset link is on its way.</FormMessage>
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-4">
          {error && <FormMessage kind="error">{error}</FormMessage>}
          <div><label className="label" htmlFor="email">Email</label><input id="email" type="email" className="input" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
          <button className="btn-primary">Send reset link</button>
        </form>
      )}
      <p className="mt-6 text-center text-sm"><Link to="/login" className="text-primary">Back to sign in</Link></p>
    </AuthCard>
  )
}
