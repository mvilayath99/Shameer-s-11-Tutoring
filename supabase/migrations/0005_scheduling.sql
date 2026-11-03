-- Step 5: groups, lessons (1:1 and group, online and in person), attendance, availability, requests.

create type public.lesson_kind as enum ('one_to_one', 'group');
create type public.delivery as enum ('online', 'in_person');
create type public.lesson_status as enum ('scheduled', 'completed', 'cancelled_by_parent', 'cancelled_by_tutor', 'no_show');

-- Practice-wide settings that tutors (not only the super admin) manage.
create table public.practice_settings (
  id int primary key default 1 check (id = 1),
  late_cancel_hours int not null default 24,   -- parent cancellations inside this window are still billable
  default_lesson_minutes int not null default 60,
  default_location text,
  updated_at timestamptz not null default now()
);
insert into public.practice_settings (id) values (1);

create table public.groups (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text not null,
  subject_focus text,
  school_year text,
  max_size int not null default 6 check (max_size > 0),
  default_weekday int check (default_weekday between 0 and 6),  -- 0 = Sunday
  default_time time,
  duration_minutes int not null default 60,
  delivery public.delivery not null default 'online',
  location text,
  tutor_id uuid references auth.users (id) on delete set null,
  active boolean not null default true
);

create table public.group_members (
  group_id uuid not null references public.groups (id) on delete cascade,
  student_id uuid not null references public.students (id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (group_id, student_id)
);

create table public.lesson_series (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  kind public.lesson_kind not null,
  student_id uuid references public.students (id) on delete cascade,
  group_id uuid references public.groups (id) on delete cascade,
  tutor_id uuid references auth.users (id) on delete set null,
  delivery public.delivery not null,
  location text,
  interval_weeks int not null default 1 check (interval_weeks in (1, 2)),
  check ((kind = 'one_to_one' and student_id is not null) or (kind = 'group' and group_id is not null))
);

create table public.lessons (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  series_id uuid references public.lesson_series (id) on delete set null,
  kind public.lesson_kind not null,
  student_id uuid references public.students (id) on delete cascade,
  group_id uuid references public.groups (id) on delete cascade,
  tutor_id uuid references auth.users (id) on delete set null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  delivery public.delivery not null,
  location text,
  meeting_url text,               -- filled by the Microsoft Teams integration, or pasted manually
  meeting_id text,                -- external meeting id (Teams), for updates/cancellation
  status public.lesson_status not null default 'scheduled',
  billable boolean not null default true,
  topics text[] not null default '{}',
  parent_feedback text,           -- visible to the family
  cancelled_at timestamptz,
  check (ends_at > starts_at),
  check ((kind = 'one_to_one' and student_id is not null) or (kind = 'group' and group_id is not null))
);
create index lessons_starts_idx on public.lessons (starts_at);
create index lessons_student_idx on public.lessons (student_id);
create index lessons_group_idx on public.lessons (group_id);
create trigger lessons_touch before update on public.lessons for each row execute function public.touch_updated_at();

create table public.lesson_private (
  lesson_id uuid primary key references public.lessons (id) on delete cascade,
  tutor_notes text
);

create table public.lesson_attendance (
  lesson_id uuid not null references public.lessons (id) on delete cascade,
  student_id uuid not null references public.students (id) on delete cascade,
  attendance text not null default 'present' check (attendance in ('present', 'late', 'absent')),
  primary key (lesson_id, student_id)
);

create table public.availability (
  id uuid primary key default gen_random_uuid(),
  tutor_id uuid not null references auth.users (id) on delete cascade,
  weekday int not null check (weekday between 0 and 6),
  start_time time not null,
  end_time time not null,
  delivery public.delivery,  -- null = either
  check (end_time > start_time)
);

create type public.request_kind as enum ('reschedule', 'cancel', 'new_lesson');
create type public.request_status as enum ('pending', 'approved', 'declined');

create table public.lesson_requests (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  requested_by uuid not null default auth.uid() references auth.users (id) on delete cascade,
  student_id uuid not null references public.students (id) on delete cascade,
  lesson_id uuid references public.lessons (id) on delete cascade,
  kind public.request_kind not null,
  preferred_time text,
  message text,
  status public.request_status not null default 'pending',
  staff_reply text,
  decided_at timestamptz
);

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
-- Students who take part in a lesson (the 1:1 student, or the group's members).
create or replace function public.lesson_student_ids(_lesson_id uuid)
returns setof uuid language sql stable security definer set search_path = public as $$
  select l.student_id from public.lessons l where l.id = _lesson_id and l.student_id is not null
  union
  select gm.student_id from public.lessons l join public.group_members gm on gm.group_id = l.group_id where l.id = _lesson_id
$$;

create or replace function public.can_view_lesson(_lesson_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_staff(auth.uid()) or exists (
    select 1 from public.lesson_student_ids(_lesson_id) sid where public.can_view_student(sid)
  )
$$;

create or replace function public.can_view_group(_group_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_staff(auth.uid()) or exists (
    select 1 from public.group_members gm where gm.group_id = _group_id and public.can_view_student(gm.student_id)
  )
$$;

-- Names of staff, so families can see who their tutor is without reading other profiles.
create or replace function public.staff_directory()
returns table (id uuid, full_name text, role public.app_role) language sql stable security definer set search_path = public as $$
  select distinct on (p.id) p.id, p.full_name, r.role from public.profiles p join public.user_roles r on r.user_id = p.id
  where r.role in ('super_admin', 'tutor', 'assistant_tutor') and p.active
  order by p.id, r.role
$$;

-- Default "billable" from the status change. Staff can still override billable afterwards.
create or replace function public.lesson_status_billable()
returns trigger language plpgsql security definer set search_path = public as $$
declare hrs int;
begin
  if tg_op = 'UPDATE' and new.status is distinct from old.status and new.billable is not distinct from old.billable then
    select late_cancel_hours into hrs from public.practice_settings where id = 1;
    new.billable := case new.status
      when 'cancelled_by_tutor' then false
      when 'cancelled_by_parent' then (new.starts_at - now()) < make_interval(hours => coalesce(hrs, 24))
      else true end;
    if new.status in ('cancelled_by_parent', 'cancelled_by_tutor') then new.cancelled_at := now(); end if;
  end if;
  return new;
end;
$$;
create trigger lessons_billable before update on public.lessons for each row execute function public.lesson_status_billable();

-- Create a recurring series and all its lessons in one go (times are UK local time).
create or replace function public.create_lesson_series(
  _kind public.lesson_kind, _student_id uuid, _group_id uuid, _tutor_id uuid,
  _delivery public.delivery, _location text, _first_date date, _until date,
  _start_time time, _duration_minutes int, _interval_weeks int default 1, _meeting_url text default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  sid uuid;
  d date := _first_date;
  starts timestamptz;
begin
  if not public.is_staff(auth.uid()) then raise exception 'Staff only.'; end if;
  if _until < _first_date or _until > _first_date + interval '18 months' then raise exception 'Choose an end date within 18 months.'; end if;
  insert into public.lesson_series (kind, student_id, group_id, tutor_id, delivery, location, interval_weeks)
  values (_kind, _student_id, _group_id, _tutor_id, _delivery, _location, _interval_weeks) returning id into sid;
  while d <= _until loop
    starts := (d + _start_time) at time zone 'Europe/London';
    insert into public.lessons (series_id, kind, student_id, group_id, tutor_id, starts_at, ends_at, delivery, location, meeting_url)
    values (sid, _kind, _student_id, _group_id, _tutor_id, starts, starts + make_interval(mins => _duration_minutes), _delivery, _location, _meeting_url);
    d := d + (7 * _interval_weeks);
  end loop;
  return sid;
end;
$$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.practice_settings enable row level security;
alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.lesson_series enable row level security;
alter table public.lessons enable row level security;
alter table public.lesson_private enable row level security;
alter table public.lesson_attendance enable row level security;
alter table public.availability enable row level security;
alter table public.lesson_requests enable row level security;

create policy "practice: signed-in read" on public.practice_settings for select using (auth.uid() is not null);
create policy "practice: staff update" on public.practice_settings for update using (public.is_staff(auth.uid()));

create policy "groups: staff all" on public.groups for all using (public.is_staff(auth.uid())) with check (public.is_staff(auth.uid()));
create policy "groups: member read" on public.groups for select using (public.can_view_group(id));
create policy "group_members: staff all" on public.group_members for all using (public.is_staff(auth.uid())) with check (public.is_staff(auth.uid()));
create policy "group_members: own read" on public.group_members for select using (public.can_view_student(student_id));

create policy "series: staff all" on public.lesson_series for all using (public.is_staff(auth.uid())) with check (public.is_staff(auth.uid()));

create policy "lessons: staff all" on public.lessons for all using (public.is_staff(auth.uid())) with check (public.is_staff(auth.uid()));
create policy "lessons: participant read" on public.lessons for select using (public.can_view_lesson(id));

create policy "lesson_private: staff" on public.lesson_private for all using (public.is_staff(auth.uid())) with check (public.is_staff(auth.uid()));

create policy "attendance: staff all" on public.lesson_attendance for all using (public.is_staff(auth.uid())) with check (public.is_staff(auth.uid()));
create policy "attendance: own read" on public.lesson_attendance for select using (public.can_view_student(student_id));

create policy "availability: staff all" on public.availability for all using (public.is_staff(auth.uid())) with check (public.is_staff(auth.uid()));
create policy "availability: signed-in read" on public.availability for select using (auth.uid() is not null);

create policy "requests: staff all" on public.lesson_requests for all using (public.is_staff(auth.uid())) with check (public.is_staff(auth.uid()));
create policy "requests: parent read" on public.lesson_requests for select using (public.is_parent_of(auth.uid(), student_id));
create policy "requests: parent create" on public.lesson_requests for insert
  with check (public.is_parent_of(auth.uid(), student_id) and status = 'pending' and requested_by = auth.uid()
              and (lesson_id is null or public.can_view_lesson(lesson_id)));

create trigger audit_lessons after insert or update or delete on public.lessons for each row execute function public.audit_changes();
create trigger audit_practice after update on public.practice_settings for each row execute function public.audit_changes();

-- Add a "requests" badge source; no new module needed (requests live under Lessons).
