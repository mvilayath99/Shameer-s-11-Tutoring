-- Lock down function privileges (Supabase security advisor).
-- Nothing is callable by visitors who are not signed in; signed-in users can only call the
-- helpers that row-level security needs plus the few RPCs the app uses (each checks the caller's role).

alter function public.touch_updated_at() set search_path = public;

revoke execute on all functions in schema public from public, anon, authenticated;

-- Used inside row-level security policies, so signed-in users need them.
grant execute on function
  public.has_role(uuid, public.app_role), public.is_staff(uuid), public.is_super_admin(uuid),
  public.is_family_member(uuid, uuid), public.is_parent_of(uuid, uuid), public.can_view_student(uuid),
  public.can_view_lesson(uuid), public.can_view_group(uuid), public.lesson_student_ids(uuid), public.my_student_id()
to authenticated;

-- App RPCs (each one checks the caller's role itself).
grant execute on function
  public.create_my_family(text, text, text), public.convert_enquiry(uuid), public.staff_directory(),
  public.create_lesson_series(public.lesson_kind, uuid, uuid, uuid, public.delivery, text, date, date, time, int, int, text)
to authenticated;

-- New functions should not be executable by default.
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;
