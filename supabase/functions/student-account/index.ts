// Supabase Edge Function: create or reset a child's student login.
// Called by a parent (for their own child) or by staff. Uses the service role key, which
// Supabase provides to Edge Functions automatically; it never reaches the browser.
//
// Deploy: Supabase dashboard > Edge Functions > Deploy a new function > name it "student-account"
// and paste this file, or run `supabase functions deploy student-account`.
import { createClient } from 'npm:@supabase/supabase-js@2'

const DOMAIN = 'students.shameers11plus.app'
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const url = Deno.env.get('SUPABASE_URL')!
    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const caller = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    })

    const { data: { user } } = await caller.auth.getUser()
    if (!user) return json({ error: 'Please sign in again.' }, 401)

    const { action, student_id, username, password } = await req.json()
    if (!student_id || !password || String(password).length < 6) return json({ error: 'Password must be at least 6 characters.' }, 400)

    // Is the caller staff, or a parent in this child's family?
    const { data: student } = await admin.from('students').select('id, family_id, user_id, first_name, last_name').eq('id', student_id).maybeSingle()
    if (!student) return json({ error: 'Student not found.' }, 404)
    const [{ data: staff }, { data: member }] = await Promise.all([
      admin.rpc('is_staff', { _user_id: user.id }),
      admin.from('family_members').select('user_id').eq('family_id', student.family_id).eq('user_id', user.id).maybeSingle(),
    ])
    if (!staff && !member) return json({ error: 'You can only manage logins for your own children.' }, 403)

    if (action === 'reset') {
      if (!student.user_id) return json({ error: 'This child has no login yet.' }, 400)
      const { error } = await admin.auth.admin.updateUserById(student.user_id, { password })
      return error ? json({ error: error.message }, 400) : json({ ok: true })
    }

    // Create
    if (student.user_id) return json({ error: 'This child already has a login. Reset the password instead.' }, 400)
    const name = String(username ?? '').trim().toLowerCase()
    if (!/^[a-z0-9._-]{3,30}$/.test(name)) return json({ error: 'Usernames use 3 to 30 letters, numbers, dots or dashes.' }, 400)
    const { data: taken } = await admin.from('profiles').select('id').eq('username', name).maybeSingle()
    if (taken) return json({ error: 'That username is taken. Try another.' }, 400)

    const { data: created, error } = await admin.auth.admin.createUser({
      email: `${name}@${DOMAIN}`,
      password,
      email_confirm: true,
      app_metadata: { provisioned: 'true' },
      user_metadata: { full_name: [student.first_name, student.last_name].filter(Boolean).join(' '), username: name },
    })
    if (error || !created.user) return json({ error: error?.message ?? 'Could not create the login.' }, 400)

    await admin.from('user_roles').insert({ user_id: created.user.id, role: 'student' })
    await admin.from('students').update({ user_id: created.user.id }).eq('id', student.id)
    return json({ ok: true, username: name })
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Unexpected error' }, 500)
  }
})
