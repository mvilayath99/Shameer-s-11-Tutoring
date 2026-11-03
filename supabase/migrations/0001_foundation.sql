-- Shameer's 11+ Tutoring: step 1 foundation
-- Roles, profiles, site settings (branding), switchable modules, branding storage.
-- Run once in the Supabase SQL editor (or with `supabase db push`).

-- ---------------------------------------------------------------------------
-- Roles
-- ---------------------------------------------------------------------------
create type public.app_role as enum ('super_admin', 'tutor', 'assistant_tutor', 'parent', 'student');

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  email text,
  phone text,
  username text unique,          -- students sign in with a username
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Roles live in their own table, never on the profile, so a user can't edit their own role.
create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.app_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);

-- Security-definer helpers avoid recursive RLS lookups.
create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;

-- Staff = super admin, tutor or assistant tutor. Tutor and assistant tutor are always treated identically.
create or replace function public.is_staff(_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.user_roles
    where user_id = _user_id and role in ('super_admin', 'tutor', 'assistant_tutor')
  )
$$;

create or replace function public.is_super_admin(_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_role(_user_id, 'super_admin')
$$;

-- New sign-ups: create a profile. The very first account becomes super_admin; everyone
-- else who self-registers is a parent. Staff and student roles are only ever granted by
-- staff (server side), never from sign-up metadata, to prevent privilege escalation.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  is_first boolean;
begin
  insert into public.profiles (id, full_name, email, username)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    new.email,
    nullif(new.raw_user_meta_data ->> 'username', '')
  );

  -- Students and invited staff are created by server functions that set their role themselves.
  if coalesce(new.raw_app_meta_data ->> 'provisioned', 'false') = 'true' then
    return new;
  end if;

  select not exists (select 1 from public.user_roles) into is_first;
  insert into public.user_roles (user_id, role)
  values (new.id, case when is_first then 'super_admin'::public.app_role else 'parent'::public.app_role end);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Site settings (single row) and modules
-- ---------------------------------------------------------------------------
create table public.site_settings (
  id int primary key default 1 check (id = 1),
  business_name text not null default 'Shameer''s 11+ Tutoring',
  tagline text default 'Friendly, focused 11+ preparation for every UK exam board',
  logo_url text,
  favicon_url text,
  primary_color text not null default '#2F6F8F',
  secondary_color text not null default '#F4F7F9',
  accent_color text not null default '#C98B2B',
  font_family text not null default 'Inter',
  contact_email text,
  contact_phone text,
  address text,
  updated_at timestamptz not null default now()
);
insert into public.site_settings (id) values (1);

create table public.modules (
  key text primary key,
  display_name text not null,
  enabled boolean not null default true,
  sort_order int not null default 0,
  portals text[] not null default '{admin}',  -- which areas show it: admin, parent, student
  icon text
);

insert into public.modules (key, display_name, sort_order, portals, icon) values
  ('enquiries', 'Enquiries', 10, '{admin}', 'inbox'),
  ('students',  'Students',  20, '{admin,parent}', 'users'),
  ('groups',    'Groups',    30, '{admin}', 'users-round'),
  ('calendar',  'Calendar',  40, '{admin,parent,student}', 'calendar'),
  ('lessons',   'Lessons',   50, '{admin,parent,student}', 'book-open'),
  ('resources', 'Resources', 60, '{admin,student}', 'folder'),
  ('homework',  'Homework',  70, '{admin,parent,student}', 'clipboard-check'),
  ('invoices',  'Invoices',  80, '{admin,parent}', 'receipt'),
  ('messages',  'Messages',  90, '{admin,parent}', 'message-square'),
  ('reports',   'Reports',  100, '{admin,parent,student}', 'bar-chart');

-- ---------------------------------------------------------------------------
-- updated_at helper
-- ---------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;
create trigger profiles_touch before update on public.profiles for each row execute function public.touch_updated_at();
create trigger site_settings_touch before update on public.site_settings for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.site_settings enable row level security;
alter table public.modules enable row level security;

-- Profiles: you see and edit your own; staff see everyone.
create policy "profiles: own read" on public.profiles for select using (auth.uid() = id or public.is_staff(auth.uid()));
create policy "profiles: own update" on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);
create policy "profiles: staff update" on public.profiles for update using (public.is_staff(auth.uid()));

-- Roles: you can read your own; staff can read all; only super admin can change roles.
create policy "roles: own read" on public.user_roles for select using (auth.uid() = user_id or public.is_staff(auth.uid()));
create policy "roles: super admin write" on public.user_roles for all
  using (public.is_super_admin(auth.uid())) with check (public.is_super_admin(auth.uid()));

-- Settings and modules: everyone (including the public site) can read; only super admin can change.
create policy "settings: public read" on public.site_settings for select using (true);
create policy "settings: super admin update" on public.site_settings for update using (public.is_super_admin(auth.uid()));
create policy "modules: public read" on public.modules for select using (true);
create policy "modules: super admin write" on public.modules for all
  using (public.is_super_admin(auth.uid())) with check (public.is_super_admin(auth.uid()));

-- ---------------------------------------------------------------------------
-- Storage: public branding bucket (logo, favicon), writable by super admin only
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public) values ('branding', 'branding', true)
on conflict (id) do nothing;

create policy "branding: public read" on storage.objects for select using (bucket_id = 'branding');
create policy "branding: super admin insert" on storage.objects for insert
  with check (bucket_id = 'branding' and public.is_super_admin(auth.uid()));
create policy "branding: super admin update" on storage.objects for update
  using (bucket_id = 'branding' and public.is_super_admin(auth.uid()));
create policy "branding: super admin delete" on storage.objects for delete
  using (bucket_id = 'branding' and public.is_super_admin(auth.uid()));
