-- Step 4: families, parents and students.

create table public.families (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  name text not null,                       -- e.g. "Khan family"
  billing_name text,
  billing_email text,
  phone text,
  address text,
  terms_accepted_at timestamptz,
  active boolean not null default true
);
create trigger families_touch before update on public.families for each row execute function public.touch_updated_at();

create table public.family_members (
  family_id uuid not null references public.families (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  relationship text default 'Parent',
  primary key (family_id, user_id)
);

create table public.students (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  family_id uuid not null references public.families (id) on delete cascade,
  user_id uuid unique references auth.users (id) on delete set null,   -- the child's own login, if any
  first_name text not null,
  last_name text,
  date_of_birth date,
  current_school text,
  school_year text,
  target_schools text,
  exam_boards text[] not null default '{}',
  exam_date date,
  learning_notes text,      -- shared with the family
  sen_notes text,           -- shared with the family
  photo_consent boolean not null default false,
  active boolean not null default true
);
create trigger students_touch before update on public.students for each row execute function public.touch_updated_at();
create index students_family_idx on public.students (family_id);

-- Staff-only notes are kept in their own tables so row-level security can hide them from families.
create table public.family_private (
  family_id uuid primary key references public.families (id) on delete cascade,
  staff_notes text,
  updated_at timestamptz not null default now()
);
create table public.student_private (
  student_id uuid primary key references public.students (id) on delete cascade,
  staff_notes text,
  updated_at timestamptz not null default now()
);

-- Files attached to a student (reports, assessments). Stored in the private "student-files" bucket.
create table public.student_files (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students (id) on delete cascade,
  path text not null,
  file_name text not null,
  shared_with_family boolean not null default false,
  uploaded_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.enquiries
  add constraint enquiries_family_fk foreign key (converted_family_id) references public.families (id) on delete set null;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function public.is_family_member(_user_id uuid, _family_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.family_members where user_id = _user_id and family_id = _family_id)
$$;

create or replace function public.is_parent_of(_user_id uuid, _student_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.students s join public.family_members m on m.family_id = s.family_id
    where s.id = _student_id and m.user_id = _user_id
  )
$$;

create or replace function public.my_student_id()
returns uuid language sql stable security definer set search_path = public as $$
  select id from public.students where user_id = auth.uid() limit 1
$$;

-- Can the current user see this student? (staff, their parent, or the student themselves)
create or replace function public.can_view_student(_student_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_staff(auth.uid()) or public.is_parent_of(auth.uid(), _student_id)
      or exists (select 1 from public.students where id = _student_id and user_id = auth.uid())
$$;

-- A parent with no family yet creates one for themselves.
create or replace function public.create_my_family(_name text, _phone text default null, _address text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  fid uuid;
  me record;
begin
  if auth.uid() is null or not public.has_role(auth.uid(), 'parent') then
    raise exception 'Only parents can create a family.';
  end if;
  select family_id into fid from public.family_members where user_id = auth.uid() limit 1;
  if fid is not null then return fid; end if;
  select full_name, email into me from public.profiles where id = auth.uid();
  insert into public.families (name, billing_name, billing_email, phone, address, terms_accepted_at)
  values (coalesce(nullif(_name, ''), me.full_name, 'My family'), me.full_name, me.email, _phone, _address, now())
  returning id into fid;
  insert into public.family_members (family_id, user_id) values (fid, auth.uid());
  return fid;
end;
$$;

-- Staff turn a website enquiry into a family + student in one step.
create or replace function public.convert_enquiry(_enquiry_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  e public.enquiries;
  fid uuid;
  sid uuid;
  parent_id uuid;
begin
  if not public.is_staff(auth.uid()) then raise exception 'Staff only.'; end if;
  select * into e from public.enquiries where id = _enquiry_id for update;
  if e.id is null then raise exception 'Enquiry not found.'; end if;
  if e.converted_family_id is not null then return e.converted_family_id; end if;

  -- Reuse the family if this parent already has one.
  select f.id into fid from public.families f where lower(f.billing_email) = lower(e.email) limit 1;
  if fid is null then
    insert into public.families (name, billing_name, billing_email, phone)
    values (split_part(e.parent_name, ' ', array_length(string_to_array(e.parent_name, ' '), 1)) || ' family', e.parent_name, e.email, e.phone)
    returning id into fid;
  end if;

  insert into public.students (family_id, first_name, last_name, current_school, school_year, target_schools, exam_boards)
  values (
    fid, split_part(e.child_name, ' ', 1),
    nullif(substr(e.child_name, length(split_part(e.child_name, ' ', 1)) + 2), ''),
    e.current_school, e.school_year, e.target_schools,
    case when e.exam_board is null or e.exam_board = '' then '{}' else array[e.exam_board] end
  ) returning id into sid;
  insert into public.student_private (student_id, staff_notes) values (sid, e.staff_notes);

  -- If the parent already has an account, link it now; otherwise it links when they sign up.
  select id into parent_id from public.profiles where lower(email) = lower(e.email) limit 1;
  if parent_id is not null then
    insert into public.family_members (family_id, user_id) values (fid, parent_id) on conflict do nothing;
  end if;

  update public.enquiries set status = 'enrolled', converted_family_id = fid where id = e.id;
  return fid;
end;
$$;

-- When a parent signs up with the email staff already have on file, link them to that family.
-- (Supabase requires the email to be confirmed before they can sign in, so this can't be abused.)
create or replace function public.link_parent_to_family()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.email is not null and coalesce(new.raw_app_meta_data ->> 'provisioned', 'false') <> 'true' then
    insert into public.family_members (family_id, user_id)
    select f.id, new.id from public.families f where lower(f.billing_email) = lower(new.email)
    on conflict do nothing;
  end if;
  return new;
end;
$$;
create trigger on_auth_user_link_family after insert on auth.users
  for each row execute function public.link_parent_to_family();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.families enable row level security;
alter table public.family_members enable row level security;
alter table public.students enable row level security;
alter table public.family_private enable row level security;
alter table public.student_private enable row level security;
alter table public.student_files enable row level security;

create policy "families: staff all" on public.families for all using (public.is_staff(auth.uid())) with check (public.is_staff(auth.uid()));
create policy "families: member read" on public.families for select using (public.is_family_member(auth.uid(), id));
create policy "families: member update" on public.families for update using (public.is_family_member(auth.uid(), id));

create policy "members: staff all" on public.family_members for all using (public.is_staff(auth.uid())) with check (public.is_staff(auth.uid()));
create policy "members: own read" on public.family_members for select using (public.is_family_member(auth.uid(), family_id));

create policy "students: staff all" on public.students for all using (public.is_staff(auth.uid())) with check (public.is_staff(auth.uid()));
create policy "students: parent read" on public.students for select using (public.is_family_member(auth.uid(), family_id));
create policy "students: parent add" on public.students for insert with check (public.is_family_member(auth.uid(), family_id) and user_id is null);
create policy "students: parent update" on public.students for update
  using (public.is_family_member(auth.uid(), family_id)) with check (public.is_family_member(auth.uid(), family_id));
create policy "students: self read" on public.students for select using (user_id = auth.uid());

create policy "family_private: staff" on public.family_private for all using (public.is_staff(auth.uid())) with check (public.is_staff(auth.uid()));
create policy "student_private: staff" on public.student_private for all using (public.is_staff(auth.uid())) with check (public.is_staff(auth.uid()));

create policy "student_files: staff all" on public.student_files for all using (public.is_staff(auth.uid())) with check (public.is_staff(auth.uid()));
create policy "student_files: family read shared" on public.student_files for select
  using (shared_with_family and public.is_parent_of(auth.uid(), student_id));

-- Parents can't move a child to another family or attach a login themselves.
create or replace function public.guard_student_parent_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not public.is_staff(auth.uid()) and auth.uid() is not null then
    if new.family_id <> old.family_id or new.user_id is distinct from old.user_id then
      raise exception 'Only staff can change this.';
    end if;
  end if;
  return new;
end;
$$;
create trigger students_guard before update on public.students for each row execute function public.guard_student_parent_update();

-- ---------------------------------------------------------------------------
-- Storage: private bucket for student files
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public) values ('student-files', 'student-files', false) on conflict (id) do nothing;
-- Object paths are "<student_id>/<file name>".
create policy "student-files: staff all" on storage.objects for all
  using (bucket_id = 'student-files' and public.is_staff(auth.uid()))
  with check (bucket_id = 'student-files' and public.is_staff(auth.uid()));
create policy "student-files: family read shared" on storage.objects for select
  using (bucket_id = 'student-files' and exists (
    select 1 from public.student_files f
    where f.path = name and f.shared_with_family and public.is_parent_of(auth.uid(), f.student_id)
  ));

-- Audit changes to families and students.
create trigger audit_families after insert or update or delete on public.families for each row execute function public.audit_changes();
create trigger audit_students after insert or update or delete on public.students for each row execute function public.audit_changes();
