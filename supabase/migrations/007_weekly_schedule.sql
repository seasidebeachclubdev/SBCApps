-- Weekly recurring schedules: managers set a per-employee weekday pattern
-- ("9-5 every Tue/Thu"); concrete shift rows are materialized ahead
-- automatically and carry over week to week unless changed.

create table public.schedule_templates (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  weekday int not null check (weekday between 0 and 6),  -- 0 = Sunday (JS getDay)
  start_time text not null,
  end_time text not null,
  area text,
  created_at timestamptz not null default now(),
  unique (employee_id, weekday)
);

alter table public.schedule_templates enable row level security;

create policy templates_select on public.schedule_templates for select to authenticated
  using (public.is_employee());
create policy templates_insert on public.schedule_templates for insert to authenticated
  with check (public.is_manager());
create policy templates_update on public.schedule_templates for update to authenticated
  using (public.is_manager());
create policy templates_delete on public.schedule_templates for delete to authenticated
  using (public.is_manager());

-- a cancelled state so one-off "day off" exceptions are not recreated by
-- the materializer (which only fills dates with no row at all)
alter table public.shifts drop constraint if exists shifts_status_check;
alter table public.shifts add constraint shifts_status_check
  check (status in ('scheduled', 'dropped', 'picked_up', 'completed', 'cancelled'));

-- Fill in shift rows from the weekly patterns for the coming window.
-- Idempotent: never touches dates that already have a row (manual edits,
-- drops, and cancellations all survive).
create or replace function public.materialize_shifts(days_ahead int default 14)
returns int
language plpgsql security definer set search_path = public
as $$
declare n int := 0;
begin
  if auth.uid() is not null and not public.is_employee() then
    return 0;
  end if;
  insert into shifts (employee_id, shift_date, start_time, end_time, area, status)
  select t.employee_id, d::date, t.start_time, t.end_time, coalesce(t.area, e.area), 'scheduled'
  from generate_series(current_date, current_date + days_ahead, interval '1 day') d
  join schedule_templates t on t.weekday = extract(dow from d)::int
  join employees e on e.id = t.employee_id and e.active
  where not exists (
    select 1 from shifts s
    where s.employee_id = t.employee_id and s.shift_date = d::date
  );
  get diagnostics n = row_count;
  return n;
end $$;

revoke execute on function public.materialize_shifts(int) from public, anon;
grant execute on function public.materialize_shifts(int) to authenticated;

-- roll the schedule forward daily when pg_cron is available; the admin app
-- also tops up on load, so this is belt-and-suspenders
do $$ begin
  begin
    create extension if not exists pg_cron;
  exception when others then
    raise notice 'pg_cron unavailable: %', sqlerrm;
  end;
end $$;

do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron')
     and not exists (select 1 from cron.job where jobname = 'materialize-shifts') then
    perform cron.schedule('materialize-shifts', '0 8 * * *', 'select public.materialize_shifts(14)');
  end if;
end $$;
