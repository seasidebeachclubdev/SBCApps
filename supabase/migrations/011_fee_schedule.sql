-- Fee schedule: guests are charged per person by age, plus a car fee when
-- the guest arrives in their own vehicle. Members choose whether they or
-- the guest settles the bill at the gate.
--
--   guest 18 and over   $20
--   guest under 18      $10
--   guest car, weekday  $50
--   guest car, weekend  $100  (Saturday / Sunday)

alter table public.guests
  add column if not exists age_group text not null default 'adult'
    check (age_group in ('adult', 'child')),
  add column if not exists own_car boolean not null default false,
  add column if not exists paid_by text not null default 'member'
    check (paid_by in ('member', 'guest'));

alter table public.guests alter column fee set default 20;

comment on column public.guests.age_group is '18 and over (adult) or under 18 (child)';
comment on column public.guests.own_car is 'guest arrives in their own vehicle - adds the car fee';
comment on column public.guests.paid_by is 'who settles the fee at the gate: member or guest';

create or replace function public.guest_fee(
  p_age_group text, p_own_car boolean, p_visit_date date)
returns integer
language sql immutable
as $$
  select (case when p_age_group = 'child' then 10 else 20 end)
       + (case
            when not coalesce(p_own_car, false) then 0
            -- 0 = Sunday, 6 = Saturday
            when p_visit_date is not null and extract(dow from p_visit_date) in (0, 6) then 100
            else 50
          end);
$$;

-- Fees are money, so the price is set here rather than taken from whatever
-- the client sends. Managers and service-role callers may still record an
-- explicit amount (gate corrections, historical rows).
create or replace function public.guests_set_fee()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is null or public.is_manager() then
    return new;
  end if;
  -- leave an already-recorded fee alone unless what it is based on changed,
  -- so marking a pass paid never silently reprices it
  if tg_op = 'UPDATE'
     and new.age_group is not distinct from old.age_group
     and new.own_car is not distinct from old.own_car
     and new.visit_date is not distinct from old.visit_date then
    return new;
  end if;
  new.fee := public.guest_fee(new.age_group, new.own_car, new.visit_date);
  return new;
end $$;

drop trigger if exists guests_set_fee on public.guests;
create trigger guests_set_fee
  before insert or update on public.guests
  for each row execute function public.guests_set_fee();
