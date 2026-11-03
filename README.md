# Shameer's 11+ Tutoring

Web app for a UK 11+ tutoring business: a public marketing site plus signed-in areas for staff
(super admin, tutor, assistant tutor), parents and students.

**Stack:** React + TypeScript + Vite + Tailwind, Supabase (database, sign-in, file storage), hosted on Netlify.

## One-off setup

1. **Supabase:** create a project (London region). Open **SQL editor**, paste each file from
   `supabase/migrations/` in number order and press **Run**.
2. **Supabase > Authentication > URL configuration:** set *Site URL* to your Netlify address
   (for example `https://shameers-11plus.netlify.app`) and add `https://<your-site>/**` to *Redirect URLs*.
3. **Netlify:** *Add new site > Import an existing project > GitHub* and pick this repository.
   Build settings come from `netlify.toml`.
4. **Netlify > Site configuration > Environment variables:** add
   - `VITE_SUPABASE_URL` = Supabase *Project URL*
   - `VITE_SUPABASE_ANON_KEY` = Supabase *anon public* key
   then *Deploys > Trigger deploy*.
5. **Claim the super admin account:** the first account to sign up becomes super admin, so sign up
   straight away on the live site.

## Roles

| Role | Access |
| --- | --- |
| super_admin | Everything, plus site settings: branding, modules, site content, staff, integrations |
| tutor / assistant_tutor | Identical full access to day-to-day features, including prices and invoices |
| parent | Their own family only |
| student | Their own lessons, homework and results |

Roles are stored in `user_roles` (never on the profile) and enforced with row-level security.

## Local development

```bash
cp .env.example .env.local   # fill in the two Supabase values
npm install
npm run dev
```
