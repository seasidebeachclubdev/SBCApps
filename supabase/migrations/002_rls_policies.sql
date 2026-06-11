-- Seaside Beach Club - row level security
-- Helper functions are SECURITY DEFINER so policies on other tables can
-- consult members/employees without recursive RLS evaluation.

-- ============================================================
-- helper functions
-- ============================================================

create or replace function public.current_member_id()
returns text
language sql stable security definer
set search_path = public
as $$
  select member_id from members
  where auth_user_id = auth.uid() and active
  limit 1;
$$;

create or replace function public.current_employee_id()
returns uuid
language sql stable security definer
set search_path = public
as $$
  select id from employees
  where active
    and (auth_user_id = auth.uid() or lower(email) = lower(auth.jwt()->>'email'))
  limit 1;
$$;

create or replace function public.is_employee()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select public.current_employee_id() is not null;
$$;

create or replace function public.is_manager()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from employees
    where id = public.current_employee_id()
      and role in ('ops_manager','business_manager')
  );
$$;

-- 4-visit rule: counts a guest's visits across ALL members without
-- exposing other members' guest rows to the caller.
-- Matches by name (case-insensitive), email (exact), or phone (digits only),
-- guarding against empty email/phone matching other empty values.
create or replace function public.guest_visit_count(p_name text, p_email text, p_phone text)
returns integer
language sql stable security definer
set search_path = public
as $$
  select count(*)::int from guests
  where lower(guest_name) = lower(coalesce(p_name, ''))
     or (coalesce(p_email, '') <> '' and email = p_email)
     or (coalesce(regexp_replace(p_phone, '[^0-9]', '', 'g'), '') <> ''
         and regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g')
             = regexp_replace(p_phone, '[^0-9]', '', 'g'));
$$;

-- ============================================================
-- members
-- ============================================================
alter table public.members enable row level security;

create policy members_select on public.members for select to authenticated
  using (auth_user_id = auth.uid() or public.is_employee());

create policy members_update on public.members for update to authenticated
  using (auth_user_id = auth.uid() or public.is_manager())
  with check (auth_user_id = auth.uid() or public.is_manager());

create policy members_insert on public.members for insert to authenticated
  with check (public.is_manager());

create policy members_delete on public.members for delete to authenticated
  using (public.is_manager());

-- ============================================================
-- household_members
-- ============================================================
alter table public.household_members enable row level security;

create policy household_select on public.household_members for select to authenticated
  using (member_id = public.current_member_id() or public.is_employee());

create policy household_insert on public.household_members for insert to authenticated
  with check (member_id = public.current_member_id() or public.is_manager());

create policy household_update on public.household_members for update to authenticated
  using (member_id = public.current_member_id() or public.is_manager());

create policy household_delete on public.household_members for delete to authenticated
  using (member_id = public.current_member_id() or public.is_manager());

-- ============================================================
-- vehicles
-- ============================================================
alter table public.vehicles enable row level security;

create policy vehicles_select on public.vehicles for select to authenticated
  using (member_id = public.current_member_id() or public.is_employee());

create policy vehicles_insert on public.vehicles for insert to authenticated
  with check (member_id = public.current_member_id() or public.is_manager());

create policy vehicles_update on public.vehicles for update to authenticated
  using (member_id = public.current_member_id() or public.is_manager());

create policy vehicles_delete on public.vehicles for delete to authenticated
  using (member_id = public.current_member_id() or public.is_manager());

-- ============================================================
-- guests
-- Members see and register their own guests. Gate staff see all,
-- handle check-in and fee updates. The cross-member 4-visit count
-- goes through guest_visit_count() above.
-- ============================================================
alter table public.guests enable row level security;

create policy guests_select on public.guests for select to authenticated
  using (member_id = public.current_member_id() or public.is_employee());

create policy guests_insert on public.guests for insert to authenticated
  with check (member_id = public.current_member_id() or public.is_employee());

create policy guests_update on public.guests for update to authenticated
  using (public.is_employee());

create policy guests_delete on public.guests for delete to authenticated
  using (public.is_manager());

-- ============================================================
-- employees
-- ============================================================
alter table public.employees enable row level security;

create policy employees_select on public.employees for select to authenticated
  using (public.is_employee());

create policy employees_insert on public.employees for insert to authenticated
  with check (public.is_manager());

create policy employees_update on public.employees for update to authenticated
  using (public.is_manager());

create policy employees_delete on public.employees for delete to authenticated
  using (public.is_manager());

-- ============================================================
-- shifts
-- All staff can read the schedule and update shift status
-- (drop / pick up); only managers create or delete shifts.
-- ============================================================
alter table public.shifts enable row level security;

create policy shifts_select on public.shifts for select to authenticated
  using (public.is_employee());

create policy shifts_insert on public.shifts for insert to authenticated
  with check (public.is_manager());

create policy shifts_update on public.shifts for update to authenticated
  using (public.is_employee());

create policy shifts_delete on public.shifts for delete to authenticated
  using (public.is_manager());

-- ============================================================
-- clock_records
-- ============================================================
alter table public.clock_records enable row level security;

create policy clock_select on public.clock_records for select to authenticated
  using (employee_id = public.current_employee_id() or public.is_manager());

create policy clock_insert on public.clock_records for insert to authenticated
  with check (employee_id = public.current_employee_id() or public.is_manager());

create policy clock_update on public.clock_records for update to authenticated
  using (employee_id = public.current_employee_id() or public.is_manager());

-- ============================================================
-- labor_assignments / kitchen_assignments
-- ============================================================
alter table public.labor_assignments enable row level security;

create policy labor_select on public.labor_assignments for select to authenticated
  using (public.is_employee());

create policy labor_write on public.labor_assignments for insert to authenticated
  with check (public.is_manager());

create policy labor_update on public.labor_assignments for update to authenticated
  using (public.is_manager());

create policy labor_delete on public.labor_assignments for delete to authenticated
  using (public.is_manager());

alter table public.kitchen_assignments enable row level security;

create policy kitchen_select on public.kitchen_assignments for select to authenticated
  using (public.is_employee());

create policy kitchen_write on public.kitchen_assignments for insert to authenticated
  with check (public.is_manager());

create policy kitchen_update on public.kitchen_assignments for update to authenticated
  using (public.is_manager());

create policy kitchen_delete on public.kitchen_assignments for delete to authenticated
  using (public.is_manager());

-- ============================================================
-- issues
-- ============================================================
alter table public.issues enable row level security;

create policy issues_select on public.issues for select to authenticated
  using (member_id = public.current_member_id() or public.is_employee());

create policy issues_insert on public.issues for insert to authenticated
  with check (member_id = public.current_member_id() or public.is_employee());

create policy issues_update on public.issues for update to authenticated
  using (public.is_employee());

create policy issues_delete on public.issues for delete to authenticated
  using (public.is_manager());

-- ============================================================
-- beach_flag - everyone logged in reads, managers write
-- ============================================================
alter table public.beach_flag enable row level security;

create policy flag_select on public.beach_flag for select to authenticated
  using (true);

create policy flag_insert on public.beach_flag for insert to authenticated
  with check (public.is_manager());

create policy flag_update on public.beach_flag for update to authenticated
  using (public.is_manager());

-- ============================================================
-- notices / events - everyone logged in reads, managers write
-- ============================================================
alter table public.notices enable row level security;

create policy notices_select on public.notices for select to authenticated
  using (true);

create policy notices_insert on public.notices for insert to authenticated
  with check (public.is_manager());

create policy notices_update on public.notices for update to authenticated
  using (public.is_manager());

create policy notices_delete on public.notices for delete to authenticated
  using (public.is_manager());

alter table public.events enable row level security;

create policy events_select on public.events for select to authenticated
  using (true);

create policy events_insert on public.events for insert to authenticated
  with check (public.is_manager());

create policy events_update on public.events for update to authenticated
  using (public.is_manager());

create policy events_delete on public.events for delete to authenticated
  using (public.is_manager());
