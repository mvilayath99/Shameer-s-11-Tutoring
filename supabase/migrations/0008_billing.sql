-- Step 7: pricing, packages, discounts and invoices. Tutor and assistant tutor have full access.

create table public.billing_settings (
  id int primary key default 1 check (id = 1),
  invoice_prefix text not null default 'SHT-',
  next_number int not null default 1001,
  payment_terms_days int not null default 14,
  bank_details text default E'Account name: \nSort code: \nAccount number: \nReference: your invoice number',
  invoice_footer text default 'Thank you for choosing us.',
  updated_at timestamptz not null default now()
);
insert into public.billing_settings (id) values (1);

create table public.rate_cards (
  id uuid primary key default gen_random_uuid(),
  name text not null,                         -- e.g. "Year 5 1:1 online"
  lesson_kind public.lesson_kind,             -- null = any
  delivery public.delivery,                   -- null = any
  school_year text,                           -- null = any
  duration_minutes int not null default 60,
  price numeric(10, 2) not null check (price >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.students
  add column rate_card_id uuid references public.rate_cards (id) on delete set null,
  add column group_rate_card_id uuid references public.rate_cards (id) on delete set null,
  add column custom_price numeric(10, 2) check (custom_price >= 0);

create table public.term_packages (
  id uuid primary key default gen_random_uuid(),
  name text not null,                -- e.g. "Autumn term 2026, weekly 1:1"
  term_start date not null,
  term_end date not null,
  lessons_included int,
  price numeric(10, 2) not null check (price >= 0),
  description text,
  active boolean not null default true,
  check (term_end >= term_start)
);

create table public.family_packages (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  student_id uuid references public.students (id) on delete cascade,  -- null = whole family
  package_id uuid not null references public.term_packages (id) on delete cascade,
  custom_price numeric(10, 2),
  invoice_id uuid,
  created_at timestamptz not null default now()
);

-- Discounts are staff-only: parents see the discount line on an invoice, never the reason.
create table public.family_discounts (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  student_id uuid references public.students (id) on delete cascade,   -- null = all children
  kind text not null check (kind in ('percent', 'fixed')),
  amount numeric(10, 2) not null check (amount > 0),
  label text not null default 'Discount',     -- shown on the invoice
  reason text,                                -- private
  starts_on date not null default current_date,
  ends_on date,
  created_at timestamptz not null default now()
);

create type public.invoice_status as enum ('draft', 'sent', 'part_paid', 'paid', 'void');

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  number text unique,
  family_id uuid not null references public.families (id) on delete restrict,
  kind text not null default 'manual' check (kind in ('monthly', 'termly', 'manual')),
  period_start date,
  period_end date,
  status public.invoice_status not null default 'draft',
  issue_date date not null default current_date,
  due_date date,
  subtotal numeric(10, 2) not null default 0,
  discount_total numeric(10, 2) not null default 0,
  total numeric(10, 2) not null default 0,
  amount_paid numeric(10, 2) not null default 0,
  notes text,
  sent_at timestamptz
);
create index invoices_family_idx on public.invoices (family_id);
alter table public.family_packages add constraint family_packages_invoice_fk foreign key (invoice_id) references public.invoices (id) on delete set null;

create table public.invoice_lines (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices (id) on delete cascade,
  line_type text not null default 'extra' check (line_type in ('lesson', 'package', 'discount', 'extra')),
  description text not null,
  quantity numeric(10, 2) not null default 1,
  unit_price numeric(10, 2) not null default 0,
  amount numeric(10, 2) generated always as (round(quantity * unit_price, 2)) stored,
  lesson_id uuid references public.lessons (id) on delete set null,
  student_id uuid references public.students (id) on delete set null,
  sort_order int not null default 0
);
create index invoice_lines_invoice_idx on public.invoice_lines (invoice_id);
create index invoice_lines_lesson_idx on public.invoice_lines (lesson_id);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices (id) on delete cascade,
  paid_on date not null default current_date,
  amount numeric(10, 2) not null check (amount <> 0),
  method text not null default 'bank_transfer' check (method in ('bank_transfer', 'cash', 'card', 'other')),
  reference text,
  recorded_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Invoice numbering and totals
-- ---------------------------------------------------------------------------
create or replace function public.assign_invoice_number()
returns trigger language plpgsql security definer set search_path = public as $$
declare b public.billing_settings;
begin
  if new.number is null then
    update public.billing_settings set next_number = next_number + 1 where id = 1 returning * into b;
    new.number := b.invoice_prefix || (b.next_number - 1)::text;
  end if;
  if new.due_date is null then
    select new.issue_date + payment_terms_days into new.due_date from public.billing_settings where id = 1;
  end if;
  return new;
end;
$$;
create trigger invoices_number before insert on public.invoices for each row execute function public.assign_invoice_number();

create or replace function public.recalc_invoice(_invoice_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  sub numeric; disc numeric; paid numeric; inv public.invoices;
begin
  select coalesce(sum(amount) filter (where line_type <> 'discount'), 0), coalesce(-sum(amount) filter (where line_type = 'discount'), 0)
    into sub, disc from public.invoice_lines where invoice_id = _invoice_id;
  select coalesce(sum(amount), 0) into paid from public.payments where invoice_id = _invoice_id;
  select * into inv from public.invoices where id = _invoice_id;
  update public.invoices set subtotal = sub, discount_total = disc, total = greatest(sub - disc, 0), amount_paid = paid,
    status = case
      when inv.status in ('draft', 'void') then inv.status
      when paid >= greatest(sub - disc, 0) and paid > 0 then 'paid'
      when paid > 0 then 'part_paid'
      else 'sent' end
  where id = _invoice_id;
end;
$$;

create or replace function public.invoice_child_changed()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.recalc_invoice(coalesce(new.invoice_id, old.invoice_id));
  return null;
end;
$$;
create trigger invoice_lines_recalc after insert or update or delete on public.invoice_lines for each row execute function public.invoice_child_changed();
create trigger payments_recalc after insert or update or delete on public.payments for each row execute function public.invoice_child_changed();

-- ---------------------------------------------------------------------------
-- Pricing
-- ---------------------------------------------------------------------------
-- Price for one student for one lesson: custom price, then the student's rate card for that kind,
-- then the best matching active rate card (kind, delivery, year, closest duration). Null = no price set.
create or replace function public.lesson_price(_student_id uuid, _lesson_id uuid)
returns numeric language plpgsql stable security definer set search_path = public as $$
declare
  s public.students; l public.lessons; p numeric; mins int;
begin
  if not public.is_staff(auth.uid()) then raise exception 'Staff only.'; end if;
  select * into s from public.students where id = _student_id;
  select * into l from public.lessons where id = _lesson_id;
  mins := extract(epoch from (l.ends_at - l.starts_at)) / 60;
  if s.custom_price is not null and l.kind = 'one_to_one' then return s.custom_price; end if;
  select price * mins / nullif(duration_minutes, 0) into p from public.rate_cards
    where id = case when l.kind = 'group' then s.group_rate_card_id else s.rate_card_id end;
  if p is not null then return round(p, 2); end if;
  select price * mins / nullif(duration_minutes, 0) into p from public.rate_cards rc
    where rc.active and (rc.lesson_kind is null or rc.lesson_kind = l.kind)
      and (rc.delivery is null or rc.delivery = l.delivery)
      and (rc.school_year is null or rc.school_year = s.school_year)
    order by (rc.lesson_kind is not null)::int + (rc.delivery is not null)::int + (rc.school_year is not null)::int desc,
             abs(rc.duration_minutes - mins)
    limit 1;
  return round(p, 2);
end;
$$;

-- Applies the family's active discounts to a draft invoice as negative lines.
create or replace function public.apply_discounts(_invoice_id uuid, _on date)
returns void language plpgsql security definer set search_path = public as $$
declare
  inv public.invoices; d record; base numeric; val numeric; who text;
begin
  if not public.is_staff(auth.uid()) then raise exception 'Staff only.'; end if;
  select * into inv from public.invoices where id = _invoice_id;
  if inv.status <> 'draft' then raise exception 'Discounts can only be recalculated on a draft invoice.'; end if;
  delete from public.invoice_lines where invoice_id = _invoice_id and line_type = 'discount';
  for d in select * from public.family_discounts
    where family_id = inv.family_id and starts_on <= _on and (ends_on is null or ends_on >= _on) loop
    select coalesce(sum(amount), 0) into base from public.invoice_lines
      where invoice_id = _invoice_id and line_type <> 'discount' and (d.student_id is null or student_id = d.student_id);
    continue when base <= 0;
    val := least(base, case when d.kind = 'percent' then round(base * d.amount / 100, 2) else d.amount end);
    select first_name into who from public.students where id = d.student_id;
    insert into public.invoice_lines (invoice_id, line_type, description, quantity, unit_price, student_id, sort_order)
    values (_invoice_id, 'discount',
      d.label || case when d.kind = 'percent' then ' (' || trim(to_char(d.amount, 'FM999990.##')) || '%)' else '' end || coalesce(' for ' || who, ''),
      1, -val, d.student_id, 1000);
  end loop;
end;
$$;

-- Builds one draft invoice per family for the month's billable lessons that haven't been invoiced yet.
-- Lessons covered by a termly package are skipped. Returns the number of invoices created.
create or replace function public.generate_monthly_invoices(_month date)
returns int language plpgsql security definer set search_path = public as $$
declare
  m_start date := date_trunc('month', _month)::date;
  m_end date := (date_trunc('month', _month) + interval '1 month - 1 day')::date;
  fam uuid; inv uuid; created int := 0; r record; price numeric;
begin
  if not public.is_staff(auth.uid()) then raise exception 'Staff only.'; end if;

  drop table if exists _billable;
  create temp table _billable on commit drop as
  select l.id as lesson_id, l.starts_at, l.kind, l.status, ps.student_id, s.family_id, s.first_name, g.name as group_name
  from public.lessons l
  cross join lateral (select l.student_id as student_id where l.student_id is not null
                      union select gm.student_id from public.group_members gm where gm.group_id = l.group_id) ps
  join public.students s on s.id = ps.student_id
  left join public.groups g on g.id = l.group_id
  where l.billable and l.status <> 'cancelled_by_tutor'
    and (l.starts_at at time zone 'Europe/London')::date between m_start and m_end
    and not exists (
      select 1 from public.invoice_lines il join public.invoices i on i.id = il.invoice_id
      where il.lesson_id = l.id and il.student_id = ps.student_id and i.status <> 'void')
    and not exists (
      select 1 from public.family_packages fp join public.term_packages tp on tp.id = fp.package_id
      where fp.family_id = s.family_id and (fp.student_id is null or fp.student_id = ps.student_id)
        and (l.starts_at at time zone 'Europe/London')::date between tp.term_start and tp.term_end);

  for fam in select distinct family_id from _billable loop
    insert into public.invoices (family_id, kind, period_start, period_end)
    values (fam, 'monthly', m_start, m_end) returning id into inv;
    for r in select * from _billable where family_id = fam order by starts_at loop
      price := public.lesson_price(r.student_id, r.lesson_id);
      insert into public.invoice_lines (invoice_id, line_type, description, quantity, unit_price, lesson_id, student_id, sort_order)
      values (inv, 'lesson',
        r.first_name || ': ' || case when r.kind = 'group' then coalesce(r.group_name, 'Group') || ' lesson' else '1:1 lesson' end
          || ' ' || to_char(r.starts_at at time zone 'Europe/London', 'Dy DD Mon')
          || case when r.status = 'cancelled_by_parent' then ' (late cancellation)' when r.status = 'no_show' then ' (missed)' else '' end
          || case when price is null then ' — PRICE NOT SET' else '' end,
        1, coalesce(price, 0), r.lesson_id, r.student_id, 0);
    end loop;
    perform public.apply_discounts(inv, m_end);
    created := created + 1;
  end loop;
  return created;
end;
$$;

-- Invoice a termly package for a family.
create or replace function public.invoice_family_package(_family_package_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare fp public.family_packages; tp public.term_packages; inv uuid; who text;
begin
  if not public.is_staff(auth.uid()) then raise exception 'Staff only.'; end if;
  select * into fp from public.family_packages where id = _family_package_id;
  if fp.id is null then raise exception 'Package not found.'; end if;
  if fp.invoice_id is not null and exists (select 1 from public.invoices where id = fp.invoice_id and status <> 'void') then
    return fp.invoice_id;
  end if;
  select * into tp from public.term_packages where id = fp.package_id;
  select first_name into who from public.students where id = fp.student_id;
  insert into public.invoices (family_id, kind, period_start, period_end) values (fp.family_id, 'termly', tp.term_start, tp.term_end) returning id into inv;
  insert into public.invoice_lines (invoice_id, line_type, description, quantity, unit_price, student_id)
  values (inv, 'package', coalesce(who || ': ', '') || tp.name || coalesce(' (' || tp.lessons_included || ' lessons)', ''), 1, coalesce(fp.custom_price, tp.price), fp.student_id);
  perform public.apply_discounts(inv, tp.term_start);
  update public.family_packages set invoice_id = inv where id = fp.id;
  return inv;
end;
$$;

-- Marking an invoice as sent (status changes only from draft).
create or replace function public.send_invoice(_invoice_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_staff(auth.uid()) then raise exception 'Staff only.'; end if;
  update public.invoices set status = 'sent', sent_at = now(), issue_date = current_date,
    due_date = current_date + (select payment_terms_days from public.billing_settings where id = 1)
  where id = _invoice_id and status = 'draft';
  perform public.recalc_invoice(_invoice_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.billing_settings enable row level security;
alter table public.rate_cards enable row level security;
alter table public.term_packages enable row level security;
alter table public.family_packages enable row level security;
alter table public.family_discounts enable row level security;
alter table public.invoices enable row level security;
alter table public.invoice_lines enable row level security;
alter table public.payments enable row level security;

create policy "billing_settings: staff" on public.billing_settings for all using (public.is_staff(auth.uid())) with check (public.is_staff(auth.uid()));
-- Parents need the bank details shown on invoices.
create policy "billing_settings: family read" on public.billing_settings for select using (public.has_role(auth.uid(), 'parent'));
create policy "rate_cards: staff" on public.rate_cards for all using (public.is_staff(auth.uid())) with check (public.is_staff(auth.uid()));
create policy "term_packages: staff" on public.term_packages for all using (public.is_staff(auth.uid())) with check (public.is_staff(auth.uid()));
create policy "family_packages: staff" on public.family_packages for all using (public.is_staff(auth.uid())) with check (public.is_staff(auth.uid()));
create policy "family_discounts: staff" on public.family_discounts for all using (public.is_staff(auth.uid())) with check (public.is_staff(auth.uid()));

create policy "invoices: staff" on public.invoices for all using (public.is_staff(auth.uid())) with check (public.is_staff(auth.uid()));
create policy "invoices: family read" on public.invoices for select using (status <> 'draft' and public.is_family_member(auth.uid(), family_id));
create policy "invoice_lines: staff" on public.invoice_lines for all using (public.is_staff(auth.uid())) with check (public.is_staff(auth.uid()));
create policy "invoice_lines: family read" on public.invoice_lines for select using (exists (
  select 1 from public.invoices i where i.id = invoice_id and i.status <> 'draft' and public.is_family_member(auth.uid(), i.family_id)));
create policy "payments: staff" on public.payments for all using (public.is_staff(auth.uid())) with check (public.is_staff(auth.uid()));
create policy "payments: family read" on public.payments for select using (exists (
  select 1 from public.invoices i where i.id = invoice_id and i.status <> 'draft' and public.is_family_member(auth.uid(), i.family_id)));

-- Parents can't see or change pricing fields on their children through the students table update.
create or replace function public.guard_student_pricing()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not public.is_staff(auth.uid()) and auth.uid() is not null and (
     new.rate_card_id is distinct from old.rate_card_id or new.group_rate_card_id is distinct from old.group_rate_card_id
     or new.custom_price is distinct from old.custom_price) then
    raise exception 'Only staff can change pricing.';
  end if;
  return new;
end;
$$;
create trigger students_guard_pricing before update on public.students for each row execute function public.guard_student_pricing();

-- Audit every change to prices, discounts, invoices and payments.
create trigger audit_rate_cards after insert or update or delete on public.rate_cards for each row execute function public.audit_changes();
create trigger audit_term_packages after insert or update or delete on public.term_packages for each row execute function public.audit_changes();
create trigger audit_family_discounts after insert or update or delete on public.family_discounts for each row execute function public.audit_changes();
create trigger audit_invoices after insert or update or delete on public.invoices for each row execute function public.audit_changes();
create trigger audit_payments after insert or update or delete on public.payments for each row execute function public.audit_changes();
create trigger audit_billing_settings after update on public.billing_settings for each row execute function public.audit_changes();

grant execute on function public.generate_monthly_invoices(date), public.invoice_family_package(uuid), public.send_invoice(uuid),
  public.apply_discounts(uuid, date), public.lesson_price(uuid, uuid) to authenticated;

-- Lock down function privileges again: nothing is callable by visitors who aren't signed in,
-- and trigger-only functions aren't callable by anyone through the API.
revoke execute on all functions in schema public from public, anon;
revoke execute on function public.create_homework_submissions(), public.assign_invoice_number(), public.recalc_invoice(uuid),
  public.invoice_child_changed(), public.guard_student_pricing() from authenticated;
alter function public.try_uuid(text) set search_path = public;
