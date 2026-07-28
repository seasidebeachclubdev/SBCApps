-- Shift swap overhaul.
--
-- 1) shifts_protect becomes a real state machine. Staff may only:
--      drop their own scheduled shift
--      take back their own drop (until someone claims it)
--      claim someone else's dropped shift (with collision check)
--      withdraw their own pending claim
--    Everything else (times, dates, area, owner, approval) is manager-only.
--    The approved flag resets automatically on every staff transition, so
--    stale approvals from an earlier pickup can never leak into a new one.
--
-- 2) approve_pickup() replaces the old client-side approval, which moved
--    employee_id to the claimer. That left the owner with no row on the
--    date, so materialize_shifts() re-created their shift from the weekly
--    pattern: the claimer got the shift AND the owner kept it. Instead the
--    original row becomes a cancelled placeholder on the owner's schedule
--    (blocks the materializer, keeps the audit trail) and the claimer gets
--    their own scheduled row, atomically.

create or replace function public.shifts_protect()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare me uuid := public.current_employee_id();
begin
  if auth.uid() is null or public.is_manager() then
    return new;
  end if;

  -- staff never edit the shift definition itself
  if new.shift_date is distinct from old.shift_date
     or new.start_time is distinct from old.start_time
     or new.end_time is distinct from old.end_time
     or new.area is distinct from old.area
     or new.employee_id is distinct from old.employee_id then
    raise exception 'only managers may edit shift details';
  end if;

  if old.status = 'scheduled' and new.status = 'dropped'
     and old.employee_id = me then
    -- drop your own shift; a stale pickup marker must not follow it around
    new.picked_up_by := null;
    new.approved := false;

  elsif old.status = 'dropped' and new.status = 'scheduled'
     and old.employee_id = me and old.picked_up_by is null then
    -- take back your drop before anyone claims it
    new.picked_up_by := null;
    new.approved := false;

  elsif old.status = 'dropped' and new.status = 'picked_up'
     and new.picked_up_by = me and old.employee_id <> me then
    -- claim an open shift; must not overlap your schedule or another
    -- claim you already have pending
    new.approved := false;
    if exists (
      select 1 from shifts s
      where s.shift_date = new.shift_date
        and s.id <> new.id
        and s.start_time < new.end_time
        and s.end_time > new.start_time
        and ( (s.employee_id = me and s.status = 'scheduled')
           or (s.picked_up_by = me and s.status = 'picked_up') )
    ) then
      raise exception 'time conflict with an existing shift';
    end if;

  elsif old.status = 'picked_up' and new.status = 'dropped'
     and old.picked_up_by = me then
    -- withdraw your pending claim; the shift reopens
    new.picked_up_by := null;
    new.approved := false;

  elsif new.status is not distinct from old.status
     and new.approved is not distinct from old.approved
     and new.picked_up_by is not distinct from old.picked_up_by then
    -- benign update (e.g. dropped_reason text only)
    null;

  else
    raise exception 'that shift change requires a manager';
  end if;

  return new;
end $$;

-- Atomic manager approval of a pending pickup.
create or replace function public.approve_pickup(p_shift_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare s shifts%rowtype;
begin
  if not public.is_manager() then
    raise exception 'managers only';
  end if;
  select * into s from shifts where id = p_shift_id for update;
  if s.id is null or s.status <> 'picked_up' or s.picked_up_by is null then
    raise exception 'shift is not awaiting pickup approval';
  end if;
  if exists (
    select 1 from shifts x
    where x.shift_date = s.shift_date
      and x.id <> s.id
      and x.employee_id = s.picked_up_by
      and x.status = 'scheduled'
      and x.start_time < s.end_time
      and x.end_time > s.start_time
  ) then
    raise exception 'time conflict with the claimer''s schedule';
  end if;
  -- cancelled placeholder keeps the owner's day blocked from the weekly
  -- pattern and records who covered it
  update shifts set status = 'cancelled', approved = true where id = s.id;
  insert into shifts (employee_id, shift_date, start_time, end_time, area, status, approved, picked_up_by)
  values (s.picked_up_by, s.shift_date, s.start_time, s.end_time, s.area, 'scheduled', true, s.picked_up_by);
end $$;

revoke execute on function public.approve_pickup(uuid) from public, anon;
grant execute on function public.approve_pickup(uuid) to authenticated;
