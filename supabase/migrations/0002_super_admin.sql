-- Step 2: super admin area — site content, integrations, deactivation, audit log.

-- ---------------------------------------------------------------------------
-- Deactivating accounts: an inactive user keeps their data but loses every role-based permission.
-- ---------------------------------------------------------------------------
alter table public.profiles add column active boolean not null default true;

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.user_roles r join public.profiles p on p.id = r.user_id
    where r.user_id = _user_id and r.role = _role and p.active
  )
$$;

create or replace function public.is_staff(_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.user_roles r join public.profiles p on p.id = r.user_id
    where r.user_id = _user_id and r.role in ('super_admin', 'tutor', 'assistant_tutor') and p.active
  )
$$;

-- Never allow the last active super admin to be removed or deactivated.
create or replace function public.other_active_super_admins(_except uuid)
returns int language sql stable security definer set search_path = public as $$
  select count(*)::int from public.user_roles r join public.profiles p on p.id = r.user_id
  where r.role = 'super_admin' and p.active and r.user_id <> _except
$$;

create or replace function public.protect_last_super_admin_role()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.role = 'super_admin' and (tg_op = 'DELETE' or new.role <> 'super_admin')
     and public.other_active_super_admins(old.user_id) = 0 then
    raise exception 'There must always be at least one active super admin.';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;
create trigger user_roles_protect before delete or update on public.user_roles
  for each row execute function public.protect_last_super_admin_role();

create or replace function public.protect_last_super_admin_profile()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.active and not new.active and public.has_role(old.id, 'super_admin')
     and public.other_active_super_admins(old.id) = 0 then
    raise exception 'There must always be at least one active super admin.';
  end if;
  return new;
end;
$$;
create trigger profiles_protect before update of active on public.profiles
  for each row execute function public.protect_last_super_admin_profile();

-- Users may edit their own name/phone but not their own active flag.
create or replace function public.guard_profile_active()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.active is distinct from old.active and not public.is_super_admin(auth.uid()) then
    raise exception 'Only the super admin can activate or deactivate accounts.';
  end if;
  return new;
end;
$$;
create trigger profiles_guard_active before update of active on public.profiles
  for each row execute function public.guard_profile_active();

-- ---------------------------------------------------------------------------
-- Editable marketing site content (key -> JSON value)
-- ---------------------------------------------------------------------------
create table public.site_content (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);
create trigger site_content_touch before update on public.site_content for each row execute function public.touch_updated_at();

insert into public.site_content (key, value) values
  ('hero', '{"heading": "Shameer''s 11+ Tutoring", "intro": "Friendly, focused 11+ preparation in maths, English, verbal and non-verbal reasoning, for every UK exam board."}'),
  ('about', '{"heading": "About us", "body": "We prepare children in Years 4 to 6 for 11+ entrance exams across the UK, covering GL Assessment, CEM, CSSE, ISEB and independent school papers.\n\nLessons are 1:1 or in small groups, online on Microsoft Teams or in person.", "qualifications": "Qualified teacher · Enhanced DBS checked"}'),
  ('testimonials', '[{"quote": "Placeholder testimonial. Replace with a real one from a parent.", "name": "Parent, Year 6"}]'),
  ('faq', '[{"q": "Which exam boards do you cover?", "a": "All UK 11+ boards, including GL Assessment, CEM, CSSE and ISEB."}, {"q": "Do you teach online?", "a": "Yes. Online lessons run on Microsoft Teams, and in-person lessons are also available."}, {"q": "When should my child start?", "a": "Most children start in Year 4 or early Year 5. A free assessment helps decide."}]'),
  ('target_schools', '[]'),
  ('privacy', '{"body": "Placeholder privacy policy. Explain what data is held about families and children, why, how long, and how to ask for it to be deleted."}'),
  ('terms', '{"body": "Placeholder terms covering bookings, cancellations, invoices and payment."}');

-- ---------------------------------------------------------------------------
-- Integrations (non-secret status only; secrets live in Supabase/Netlify settings)
-- ---------------------------------------------------------------------------
create table public.integrations (
  key text primary key,
  name text not null,
  description text,
  status text not null default 'not_connected' check (status in ('not_connected', 'connected', 'error')),
  config jsonb not null default '{}',
  updated_at timestamptz not null default now()
);
insert into public.integrations (key, name, description) values
  ('microsoft365', 'Microsoft 365', 'Teams meetings for online lessons, Outlook calendar sync and OneDrive import'),
  ('payments', 'Online payments', 'Card payments for invoices (for example Stripe)'),
  ('email', 'Email', 'Booking confirmations, reminders and invoices');

-- ---------------------------------------------------------------------------
-- Audit log
-- ---------------------------------------------------------------------------
create table public.audit_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  actor uuid references auth.users (id) on delete set null,
  table_name text not null,
  row_key text,
  action text not null,
  old_data jsonb,
  new_data jsonb
);
create index audit_log_at_idx on public.audit_log (at desc);

create or replace function public.audit_changes()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  rec jsonb := to_jsonb(coalesce(new, old));
begin
  insert into public.audit_log (actor, table_name, row_key, action, old_data, new_data)
  values (
    auth.uid(), tg_table_name,
    coalesce(rec ->> 'id', rec ->> 'key', rec ->> 'user_id'),
    lower(tg_op),
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end
  );
  return coalesce(new, old);
end;
$$;

create trigger audit_site_settings after update on public.site_settings for each row execute function public.audit_changes();
create trigger audit_modules after insert or update or delete on public.modules for each row execute function public.audit_changes();
create trigger audit_user_roles after insert or update or delete on public.user_roles for each row execute function public.audit_changes();
create trigger audit_site_content after insert or update or delete on public.site_content for each row execute function public.audit_changes();
create trigger audit_integrations after update on public.integrations for each row execute function public.audit_changes();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.site_content enable row level security;
alter table public.integrations enable row level security;
alter table public.audit_log enable row level security;

create policy "content: public read" on public.site_content for select using (true);
create policy "content: super admin write" on public.site_content for all
  using (public.is_super_admin(auth.uid())) with check (public.is_super_admin(auth.uid()));

create policy "integrations: staff read" on public.integrations for select using (public.is_staff(auth.uid()));
create policy "integrations: super admin write" on public.integrations for update using (public.is_super_admin(auth.uid()));

-- Audit entries are written only by triggers. Staff can read them (prices and invoices are joint work).
create policy "audit: staff read" on public.audit_log for select using (public.is_staff(auth.uid()));

-- Super admin can update any profile (for deactivation); staff can already update via step 1 policy.
