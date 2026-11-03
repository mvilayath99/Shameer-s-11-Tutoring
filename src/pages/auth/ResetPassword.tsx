import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { AuthCard, FormMessage } from '../../components/AuthCard'
import { supabase } from '../../lib/supabase'

export default function ResetPassword() {
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const navigate = useNavigate()

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (password.length < 8) { setError('Please use at least 8 characters.'); return }
    const { error } = await supabase.auth.updateUser({ password })
    if (error) setError(error.message); else navigate('/login')
  }

  return (
    <AuthCard title="Choose a new password">
      <form onSubmit={submit} className="flex flex-col gap-4">
        {error && <FormMessage kind="error">{error}</FormMessage>}
        <div><label className="label" htmlFor="password">New password</label><input id="password" type="password" className="input" required value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" /></div>
        <button className="btn-primary">Save password</button>
      </form>
    </AuthCard>
  )
}
