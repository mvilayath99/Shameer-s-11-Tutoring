-- Step 6: resource library and homework.

create table public.resource_folders (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid references public.resource_folders (id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

create table public.resources (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  folder_id uuid references public.resource_folders (id) on delete set null,
  title text not null,
  path text not null unique,        -- object path in the private "resources" bucket
  file_name text not null,
  mime_type text,
  size_bytes bigint,
  subject text,
  topic text,
  difficulty text check (difficulty in ('Foundation', 'Core', 'Stretch')),
  exam_board text,
  school_year text,
  source text not null default 'upload',   -- upload | onedrive
  created_by uuid references auth.users (id) on delete set null
);
create index resources_folder_idx on public.resources (folder_id);

create table public.resource_shares (
  id uuid primary key default gen_random_uuid(),
  resource_id uuid not null references public.resources (id) on delete cascade,
  student_id uuid references public.students (id) on delete cascade,
  group_id uuid references public.groups (id) on delete cascade,
  all_students boolean not null default false,
  created_at timestamptz not null default now(),
  check (all_students or student_id is not null or group_id is not null)
);

create type public.homework_type as enum ('worksheet', 'quiz');
create type public.submission_status as enum ('set', 'submitted', 'late', 'marked');

create table public.homework (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  title text not null,
  instructions text,
  type public.homework_type not null default 'worksheet',
  due_at timestamptz,
  student_id uuid references public.students (id) on delete cascade,
  group_id uuid references public.groups (id) on delete cascade,
  subject text,
  set_by uuid references auth.users (id) on delete set null default auth.uid(),
  check (student_id is not null or group_id is not null)
);

create table public.homework_resources (
  homework_id uuid not null references public.homework (id) on delete cascade,
  resource_id uuid not null references public.resources (id) on delete cascade,
  primary key (homework_id, resource_id)
);

create table public.homework_submissions (
  id uuid primary key default gen_random_uuid(),
  homework_id uuid not null references public.homework (id) on delete cascade,
  student_id uuid not null references public.students (id) on delete cascade,
  status public.submission_status not null default 'set',
  submitted_at timestamptz,
  score numeric(6, 2),
  total numeric(6, 2),
  comment text,
  marked_at timestamptz,
  marked_by uuid references auth.users (id) on delete set null,
  unique (homework_id, student_id)
);
create index submissions_student_idx on public.homework_submissions (student_id);

create table public.submission_files (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.homework_submissions (id) on delete cascade,
  path text not null unique,        -- object path in the private "homework" bucket: <submission_id>/<file>
  file_name text not null,
  kind text not null default 'upload' check (kind in ('upload', 'marked')),
  uploaded_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);

-- When homework is set, create one submission row per student (the 1:1 student or every group member).
create or replace function public.create_homework_submissions()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.homework_submissions (homework_id, student_id)
  select new.id, sid from (
    select new.student_id as sid where new.student_id is not null
    union select gm.student_id from public.group_members gm where gm.group_id = new.group_id
  ) s
  on conflict do nothing;
  return new;
end;
$$;
create trigger homework_create_submissions after insert on public.homework
  for each row execute function public.create_homework_submissions();

-- Helpers
create or replace function public.can_view_resource(_resource_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_staff(auth.uid()) or exists (
    select 1 from public.resource_shares rs
    where rs.resource_id = _resource_id and (
      (rs.all_students and (public.has_role(auth.uid(), 'student') or public.has_role(auth.uid(), 'parent')))
      or (rs.student_id is not null and public.can_view_student(rs.student_id))
      or (rs.group_id is not null and public.can_view_group(rs.group_id))
    )
  ) or exists (
    select 1 from public.homework_resources hr join public.homework_submissions s on s.homework_id = hr.homework_id
    where hr.resource_id = _resource_id and public.can_view_student(s.student_id)
  )
$$;

create or replace function public.can_view_homework(_homework_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_staff(auth.uid()) or exists (
    select 1 from public.homework_submissions s where s.homework_id = _homework_id and public.can_view_student(s.student_id)
  )
$$;

create or replace function public.can_view_submission(_submission_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.homework_submissions s where s.id = _submission_id and public.can_view_student(s.student_id))
$$;

-- A student (or their parent) hands homework in. Marks it late if after the due date.
create or replace function public.submit_homework(_submission_id uuid)
returns public.submission_status language plpgsql security definer set search_path = public as $$
declare
  s public.homework_submissions;
  due timestamptz;
  st public.submission_status;
begin
  select * into s from public.homework_submissions where id = _submission_id;
  if s.id is null or not public.can_view_student(s.student_id) then raise exception 'Not allowed.'; end if;
  if s.status = 'marked' then raise exception 'This homework has already been marked.'; end if;
  select due_at into due from public.homework where id = s.homework_id;
  st := case when due is not null and now() > due then 'late' else 'submitted' end;
  update public.homework_submissions set status = st, submitted_at = now() where id = s.id;
  return st;
end;
$$;

-- RLS
alter table public.resource_folders enable row level security;
alter table public.resources enable row level security;
alter table public.resource_shares enable row level security;
alter table public.homework enable row level security;
alter table public.homework_resources enable row level security;
alter table public.homework_submissions enable row level security;
alter table public.submission_files enable row level security;

create policy "folders: staff all" on public.resource_folders for all using (public.is_staff(auth.uid())) with check (public.is_staff(auth.uid()));
create policy "resources: staff all" on public.resources for all using (public.is_staff(auth.uid())) with check (public.is_staff(auth.uid()));
create policy "resources: shared read" on public.resources for select using (public.can_view_resource(id));
create policy "shares: staff all" on public.resource_shares for all using (public.is_staff(auth.uid())) with check (public.is_staff(auth.uid()));

create policy "homework: staff all" on public.homework for all using (public.is_staff(auth.uid())) with check (public.is_staff(auth.uid()));
create policy "homework: family read" on public.homework for select using (public.can_view_homework(id));
create policy "hw_resources: staff all" on public.homework_resources for all using (public.is_staff(auth.uid())) with check (public.is_staff(auth.uid()));
create policy "hw_resources: family read" on public.homework_resources for select using (public.can_view_homework(homework_id));

create policy "submissions: staff all" on public.homework_submissions for all using (public.is_staff(auth.uid())) with check (public.is_staff(auth.uid()));
create policy "submissions: family read" on public.homework_submissions for select using (public.can_view_student(student_id));

create policy "sub_files: staff all" on public.submission_files for all using (public.is_staff(auth.uid())) with check (public.is_staff(auth.uid()));
create policy "sub_files: family read" on public.submission_files for select using (public.can_view_submission(submission_id));
create policy "sub_files: family upload" on public.submission_files for insert
  with check (kind = 'upload' and public.can_view_submission(submission_id)
              and exists (select 1 from public.homework_submissions s where s.id = submission_id and s.status <> 'marked'));
create policy "sub_files: family delete own" on public.submission_files for delete
  using (kind = 'upload' and uploaded_by = auth.uid()
         and exists (select 1 from public.homework_submissions s where s.id = submission_id and s.status = 'set'));

-- Storage
create or replace function public.try_uuid(_t text)
returns uuid language plpgsql immutable as $$
begin return _t::uuid; exception when others then return null; end;
$$;
grant execute on function public.try_uuid(text) to authenticated;

insert into storage.buckets (id, name, public) values ('resources', 'resources', false), ('homework', 'homework', false)
on conflict (id) do nothing;

create policy "resources-bucket: staff all" on storage.objects for all
  using (bucket_id = 'resources' and public.is_staff(auth.uid()))
  with check (bucket_id = 'resources' and public.is_staff(auth.uid()));
create policy "resources-bucket: shared read" on storage.objects for select
  using (bucket_id = 'resources' and exists (select 1 from public.resources r where r.path = name and public.can_view_resource(r.id)));

create policy "homework-bucket: staff all" on storage.objects for all
  using (bucket_id = 'homework' and public.is_staff(auth.uid()))
  with check (bucket_id = 'homework' and public.is_staff(auth.uid()));
-- Families upload into their own submission folder (<submission_id>/...) and read files there.
create policy "homework-bucket: family upload" on storage.objects for insert
  with check (bucket_id = 'homework' and public.can_view_submission(public.try_uuid((storage.foldername(name))[1])));
create policy "homework-bucket: family read" on storage.objects for select
  using (bucket_id = 'homework' and public.can_view_submission(public.try_uuid((storage.foldername(name))[1])));

-- Function privileges
grant execute on function public.can_view_resource(uuid), public.can_view_homework(uuid), public.can_view_submission(uuid),
  public.submit_homework(uuid) to authenticated;

create trigger audit_homework_submissions after update on public.homework_submissions for each row execute function public.audit_changes();
