-- Seaside Beach Club - hardening pass from the June 2026 code review.
-- All protect-triggers bypass when auth.uid() is null (service-role and
-- direct SQL connections) and when the caller is a manager.

-- ============================================================
-- clock_records: one row per employee per day. Prevents the duplicate
-- rows that inflate payroll and enables upsert on (employee_id, shift_date).
-- ============================================================
delete from public.clock_records a
using public.clock_records b
where a.employee_id = b.employee_id
  and a.shift_date = b.shift_date
  and a.ctid < b.ctid;

create unique index if not exists clock_records_employee_day_uidx
  on public.clock_records (employee_id, shift_date);

-- ============================================================
-- beach_flag: hard-enforce the single fixed row
-- ============================================================
alter table public.beach_flag
  add constraint beach_flag_single_row
  check (id = '00000000-0000-0000-0000-000000000001');

-- ============================================================
-- members: non-managers may only change their own contact fields
-- (phone, email, onboarded). Blocks a member from editing their
-- membership_type, two_stickers, member_id, names, etc.
-- ============================================================
create or replace function public.members_protect_columns()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is null or public.is_manager() then
    return new;
  end if;
  if new.member_id       is distinct from old.member_id
     or new.auth_user_id    is distinct from old.auth_user_id
     or new.first_name      is distinct from old.first_name
     or new.last_name       is distinct from old.last_name
     or new.membership_type is distinct from old.membership_type
     or new.member_since    is distinct from old.member_since
     or new.cabana          is distinct from old.cabana
     or new.two_stickers    is distinct from old.two_stickers
     or new.active          is distinct from old.active
  then
    raise exception 'only contact fields may be changed';
  end if;
  return new;
end $$;

create trigger members_protect_columns
  before update on public.members
  for each row execute function public.members_protect_columns();

-- ============================================================
-- shifts: only managers approve; nobody claims their own dropped
-- shift; shifts cannot be reassigned by non-managers.
-- ============================================================
create or replace function public.shifts_protect()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is null or public.is_manager() then
    return new;
  end if;
  if new.approved is distinct from old.approved then
    raise exception 'only managers may approve shift changes';
  end if;
  if new.picked_up_by is not null and new.picked_up_by = new.employee_id then
    raise exception 'cannot claim your own shift';
  end if;
  if new.employee_id is distinct from old.employee_id then
    raise exception 'shifts cannot be reassigned';
  end if;
  return new;
end $$;

create trigger shifts_protect
  before update on public.shifts
  for each row execute function public.shifts_protect();

-- ============================================================
-- clock_records: existing punch times are immutable for non-managers
-- (no retroactive edits); override fields are manager-only.
-- ============================================================
create or replace function public.clock_records_protect()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is null or public.is_manager() then
    return new;
  end if;
  if old.clock_in is not null and new.clock_in is distinct from old.clock_in then
    raise exception 'clock-in time cannot be changed';
  end if;
  if old.clock_out is not null and new.clock_out is distinct from old.clock_out then
    raise exception 'clock-out time cannot be changed';
  end if;
  if new.override_by is distinct from old.override_by
     or new.override_note is distinct from old.override_note then
    raise exception 'overrides are manager-only';
  end if;
  return new;
end $$;

create trigger clock_records_protect
  before update on public.clock_records
  for each row execute function public.clock_records_protect();
