-- Account-claim flow: members with no email on file claim their roster row
-- (matched by last name + license plate), staff approve, invite goes out.

create table public.account_claims (
  id uuid primary key default gen_random_uuid(),
  member_id text references public.members(member_id) on delete cascade,  -- matched roster row; null = no auto-match
  last_name text not null,
  first_name text,
  license_plate text,
  email text not null,
  phone text,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  reviewed_by uuid references public.employees(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create index account_claims_status_idx on public.account_claims (status);
-- at most one open claim per matched member
create unique index account_claims_one_pending_per_member
  on public.account_claims (member_id)
  where status = 'pending' and member_id is not null;

alter table public.account_claims enable row level security;

-- staff read the queue; all writes go through service-role edge functions
create policy claims_select on public.account_claims for select to authenticated
  using (public.is_employee());

-- Roster matcher used by the claim-account edge function (service role only).
-- Plate comparison ignores spacing/punctuation; last-name comparison is
-- case-insensitive containment so "Cater" matches "Abrahamovich/Cater".
create or replace function public.match_roster(p_last text, p_plate text)
returns table (member_id text, has_login boolean)
language sql stable security definer set search_path = public
as $$
  select m.member_id, (m.auth_user_id is not null) as has_login
  from members m
  join vehicles v on v.member_id = m.member_id
  where m.active
    and regexp_replace(upper(v.license_plate), '[^A-Z0-9]', '', 'g')
        = regexp_replace(upper(coalesce(p_plate, '')), '[^A-Z0-9]', '', 'g')
    and length(regexp_replace(coalesce(p_plate, ''), '[^A-Za-z0-9]', '', 'g')) >= 3
    and position(lower(trim(coalesce(p_last, ''))) in lower(m.last_name)) > 0
    and length(trim(coalesce(p_last, ''))) >= 2
  limit 1;
$$;

revoke execute on function public.match_roster(text, text) from public, anon, authenticated;
