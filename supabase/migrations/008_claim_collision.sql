-- Claiming a dropped shift must not overlap a shift the claimer already
-- works that day. Enforced in the shifts protect-trigger so it holds no
-- matter which client makes the request.
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
  -- time-collision check on claims ('HH:MM' text compares correctly)
  if new.picked_up_by is not null and new.picked_up_by is distinct from old.picked_up_by then
    if exists (
      select 1 from shifts s
      where s.employee_id = new.picked_up_by
        and s.shift_date = new.shift_date
        and s.id <> new.id
        and s.status in ('scheduled', 'picked_up')
        and s.start_time < new.end_time
        and s.end_time > new.start_time
    ) then
      raise exception 'time conflict with an existing shift';
    end if;
  end if;
  return new;
end $$;
