-- Step 8: email templates, per-person notification preferences and an email log.
-- Emails are sent by the "notify" edge function, which reads these tables with the service role.

create table public.email_templates (
  key text primary key,
  name text not null,
  description text,
  audience text not null default 'family' check (audience in ('family', 'staff')),
  subject text not null,
  body text not null,
  enabled boolean not null default true,
  updated_at timestamptz not null default now()
);
create trigger email_templates_touch before update on public.email_templates for each row execute function public.touch_updated_at();

insert into public.email_templates (key, name, description, audience, subject, body) values
  ('invoice_sent', 'Invoice sent', 'When you send an invoice to a family.', 'family',
   'Invoice {{invoice_number}} from {{business_name}}',
   E'Dear {{parent_name}},\n\nYour invoice {{invoice_number}} for {{amount}} is ready. Please pay by {{due_date}}.\n\nYou can view and print it here: {{link}}\n\nThank you,\n{{business_name}}'),
  ('invoice_reminder', 'Payment reminder', 'A gentle reminder when an invoice is past its due date.', 'family',
   'Reminder: invoice {{invoice_number}}',
   E'Dear {{parent_name}},\n\nThis is a friendly reminder that invoice {{invoice_number}} has {{amount}} left to pay, which was due on {{due_date}}.\n\nView it here: {{link}}\n\nIf you have already paid, thank you and please ignore this email.\n\n{{business_name}}'),
  ('lesson_booked', 'Lesson booked', 'When a new lesson or series of lessons is booked.', 'family',
   'Lesson booked for {{child_name}}',
   E'Dear {{parent_name}},\n\n{{child_name}}''s lesson is booked for {{lesson_time}} ({{lesson_place}}).\n\nSee all lessons here: {{link}}\n\n{{business_name}}'),
  ('lesson_changed', 'Lesson moved', 'When a lesson''s date or time changes.', 'family',
   'Lesson time changed for {{child_name}}',
   E'Dear {{parent_name}},\n\n{{child_name}}''s lesson has moved to {{lesson_time}} ({{lesson_place}}).\n\nSee all lessons here: {{link}}\n\n{{business_name}}'),
  ('lesson_cancelled', 'Lesson cancelled', 'When a lesson is cancelled.', 'family',
   'Lesson cancelled for {{child_name}}',
   E'Dear {{parent_name}},\n\n{{child_name}}''s lesson on {{lesson_time}} has been cancelled.\n\n{{business_name}}'),
  ('lesson_reminder', 'Lesson reminder', 'The day before each lesson (needs the daily reminder job switched on).', 'family',
   'Reminder: {{child_name}}''s lesson tomorrow',
   E'Dear {{parent_name}},\n\nA reminder that {{child_name}} has a lesson at {{lesson_time}} ({{lesson_place}}).\n\n{{business_name}}'),
  ('homework_set', 'Homework set', 'When homework is set.', 'family',
   'New homework for {{child_name}}: {{homework_title}}',
   E'Dear {{parent_name}},\n\n{{child_name}} has new homework: {{homework_title}}, due {{due_date}}.\n\nSee it here: {{link}}\n\n{{business_name}}'),
  ('homework_marked', 'Homework marked', 'When homework has been marked.', 'family',
   '{{child_name}}''s homework has been marked',
   E'Dear {{parent_name}},\n\n{{child_name}}''s homework "{{homework_title}}" has been marked. Score: {{score}}.\n\nSee the feedback here: {{link}}\n\n{{business_name}}'),
  ('enquiry_received', 'New enquiry (to tutors)', 'Tells tutors when someone fills in the contact form.', 'staff',
   'New enquiry from {{parent_name}}',
   E'A new enquiry has arrived from {{parent_name}} about {{child_name}}.\n\nOpen it here: {{link}}');

-- Families can turn individual emails off. Invoice emails can't be turned off.
create table public.notification_prefs (
  user_id uuid not null references auth.users (id) on delete cascade,
  template_key text not null references public.email_templates (key) on delete cascade,
  enabled boolean not null default true,
  primary key (user_id, template_key)
);

create table public.email_log (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  template_key text,
  to_email text not null,
  to_user_id uuid references auth.users (id) on delete set null,
  subject text not null,
  status text not null check (status in ('sent', 'failed', 'skipped')),
  error text,
  related_id uuid,
  sent_by uuid references auth.users (id) on delete set null
);
create index email_log_created_idx on public.email_log (created_at desc);
create index email_log_related_idx on public.email_log (related_id);

alter table public.email_templates enable row level security;
alter table public.notification_prefs enable row level security;
alter table public.email_log enable row level security;

create policy "templates: staff all" on public.email_templates for all using (public.is_staff(auth.uid())) with check (public.is_staff(auth.uid()));
create policy "templates: signed-in read" on public.email_templates for select using (auth.uid() is not null);
create policy "prefs: own" on public.notification_prefs for all using (user_id = auth.uid())
  with check (user_id = auth.uid() and template_key not in ('invoice_sent', 'invoice_reminder'));
create policy "prefs: staff read" on public.notification_prefs for select using (public.is_staff(auth.uid()));
create policy "email_log: staff read" on public.email_log for select using (public.is_staff(auth.uid()));

create trigger audit_email_templates after update on public.email_templates for each row execute function public.audit_changes();

revoke execute on all functions in schema public from public, anon;
