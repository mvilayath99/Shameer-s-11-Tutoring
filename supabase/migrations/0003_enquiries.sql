-- Step 3: public enquiry / free assessment form.

create type public.enquiry_status as enum ('new', 'contacted', 'assessment_booked', 'enrolled', 'not_proceeding');

create table public.enquiries (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  status public.enquiry_status not null default 'new',
  parent_name text not null check (char_length(parent_name) between 1 and 200),
  email text not null check (char_length(email) between 3 and 320),
  phone text check (char_length(phone) <= 50),
  child_name text not null check (char_length(child_name) between 1 and 200),
  school_year text check (char_length(school_year) <= 20),
  current_school text check (char_length(current_school) <= 200),
  target_schools text check (char_length(target_schools) <= 500),
  exam_board text check (char_length(exam_board) <= 100),
  preferred_format text check (preferred_format in ('1:1', 'group', 'either')),
  preferred_delivery text check (preferred_delivery in ('online', 'in_person', 'either')),
  availability text check (char_length(availability) <= 1000),
  message text check (char_length(message) <= 4000),
  consent boolean not null default false,
  staff_notes text,
  converted_family_id uuid
);
create trigger enquiries_touch before update on public.enquiries for each row execute function public.touch_updated_at();

alter table public.enquiries enable row level security;

-- Anyone (including visitors who are not signed in) can submit a new enquiry with consent,
-- but cannot read enquiries back or set staff-only fields.
create policy "enquiries: public submit" on public.enquiries for insert to anon, authenticated
  with check (status = 'new' and consent and staff_notes is null and converted_family_id is null);
create policy "enquiries: staff read" on public.enquiries for select using (public.is_staff(auth.uid()));
create policy "enquiries: staff update" on public.enquiries for update using (public.is_staff(auth.uid()));
create policy "enquiries: staff delete" on public.enquiries for delete using (public.is_staff(auth.uid()));

grant insert on public.enquiries to anon;
