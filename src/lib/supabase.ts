import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const isConfigured = Boolean(url && anonKey)

// A placeholder client keeps the public site rendering before Supabase is connected.
export const supabase = createClient(url ?? 'https://placeholder.supabase.co', anonKey ?? 'placeholder-key')

// Students sign in with a username; Supabase Auth needs an email, so we map it to an internal address.
export const STUDENT_EMAIL_DOMAIN = 'students.shameers11plus.app'
export const studentEmail = (username: string) => `${username.trim().toLowerCase()}@${STUDENT_EMAIL_DOMAIN}`
